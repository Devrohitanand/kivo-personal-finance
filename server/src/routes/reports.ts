import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { validate, readQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/security.js';
import { activityQuerySchema, reportsQuerySchema, type ActivityQuery, type ReportsQuery } from '../schemas/reports.js';
import { loadLedger } from '../services/ledger.js';
import { serializeEntry, serializeRepayment, serializeTotals } from '../lib/serialize.js';
import {
  entryStatus,
  monthKey,
  monthWindow,
  percentageOf,
  rangeWindow,
  repaidPaise,
  startOfUtcDay,
  summarise,
  withinRange,
  type ReportRange,
} from '../domain/ledger.js';
import { parseDateInput } from '../lib/dates.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function resolveRange(query: ReportsQuery, now: Date): { start: Date | null; end: Date; label: ReportRange } {
  if (query.from) {
    return {
      start: parseDateInput(query.from),
      end: query.to ? parseDateInput(query.to) : new Date(now.getTime() + 86_400_000),
      label: query.range,
    };
  }
  const window = rangeWindow(query.range, now);
  return { start: window.start, end: window.end, label: query.range };
}

reportsRouter.get(
  '/',
  validate('query', reportsQuerySchema),
  asyncHandler(async (req, res) => {
    const query = readQuery<ReportsQuery>(req);
    const userId = req.session.userId!;
    const now = new Date();
    const { start, end, label } = resolveRange(query, now);

    const { people, entries } = await loadLedger(userId);

    const inRange = entries.filter((entry) => withinRange(entry.occurredAt, start, end));
    const rangeTotals = summarise(inRange);
    const outstandingTotals = summarise(entries);

    const pools = [
      { key: 'lent', label: 'Total Lent', amountPaise: rangeTotals.lentPaise, color: '#173F35' },
      { key: 'received', label: 'Repaid', amountPaise: rangeTotals.receivedPaise, color: '#23965B' },
      { key: 'borrowed', label: 'Borrowed', amountPaise: rangeTotals.borrowedPaise, color: '#D98524' },
    ];
    const poolTotal = pools.reduce((sum, pool) => sum + pool.amountPaise, 0);

    const personRows = people
      .map((person) => {
        const personEntries = person.entries.filter((entry) => withinRange(entry.occurredAt, start, end));
        const totals = summarise(personEntries);
        return {
          personId: person.id,
          name: person.name,
          initials: person.entries.length > 0 ? person.name.slice(0, 2).toUpperCase() : '?',
          entryCount: personEntries.length,
          netPaise: totals.netPaise,
          receivablePaise: totals.receivablePaise,
          payablePaise: totals.payablePaise,
          latestNote: personEntries[0]?.note ?? null,
        };
      })
      .filter((row) => row.entryCount > 0)
      .sort((a, b) => Math.abs(b.netPaise) - Math.abs(a.netPaise));

    const months = new Map<string, { lent: number; borrowed: number; received: number; repaid: number }>();
    for (const entry of entries) {
      const key = monthKey(entry.occurredAt);
      const bucket = months.get(key) ?? { lent: 0, borrowed: 0, received: 0, repaid: 0 };
      if (entry.direction === 'LENT') {
        bucket.lent += entry.principalPaise;
        bucket.received += repaidPaise(entry);
      } else {
        bucket.borrowed += entry.principalPaise;
        bucket.repaid += repaidPaise(entry);
      }
      months.set(key, bucket);
    }

    const monthly = Array.from(months.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 6)
      .map(([month, bucket]) => ({
        month,
        lentPaise: bucket.lent,
        borrowedPaise: bucket.borrowed,
        receivedPaise: bucket.received,
        repaidPaise: bucket.repaid,
        netPaise: bucket.lent - bucket.borrowed,
      }));

    const settledEntries = entries.filter((entry) => entryStatus(entry, now) === 'settled');
    const onTime = settledEntries.filter((entry) => {
      const last = entry.repayments[entry.repayments.length - 1];
      if (!entry.dueDate || !last) return true;
      return last.occurredAt.getTime() <= entry.dueDate.getTime();
    });
    const settlementDurations = settledEntries
      .map((entry) => {
        const last = entry.repayments[entry.repayments.length - 1];
        if (!last) return null;
        return (startOfUtcDay(last.occurredAt).getTime() - startOfUtcDay(entry.occurredAt).getTime()) / 86_400_000;
      })
      .filter((value): value is number => value !== null && value >= 0);

    const repaymentRows = inRange.flatMap((entry) =>
      entry.repayments
        .filter((repayment) => withinRange(repayment.occurredAt, start, end))
        .map((repayment) => serializeRepayment(repayment, entry.personId)),
    );

    res.json({
      range: label,
      start: start ? start.toISOString() : null,
      end: end.toISOString(),
      totals: serializeTotals(inRange),
      outstanding: serializeTotals(entries),
      breakdown: pools.map((pool) => ({
        key: pool.key,
        label: pool.label,
        amountPaise: pool.amountPaise,
        color: pool.color,
        percentage: percentageOf(pool.amountPaise, poolTotal),
      })),
      people: personRows,
      monthly,
      repayments: {
        count: repaymentRows.length,
        totalPaise: rangeTotals.receivedPaise + rangeTotals.repaidPaise,
        receivedPaise: rangeTotals.receivedPaise,
        paidPaise: rangeTotals.repaidPaise,
      },
      settlement: {
        settledCount: settledEntries.length,
        totalCount: entries.length,
        avgDays:
          settlementDurations.length === 0
            ? null
            : Math.round(
                (settlementDurations.reduce((sum, value) => sum + value, 0) /
                  settlementDurations.length) *
                  10,
              ) / 10,
        onTimeRate: settledEntries.length === 0 ? null : percentageOf(onTime.length, settledEntries.length),
      },
      outstandingTotals: {
        receivablePaise: outstandingTotals.receivablePaise,
        payablePaise: outstandingTotals.payablePaise,
        netPaise: outstandingTotals.netPaise,
      },
    });
  }),
);

export const activityRouter = Router();
activityRouter.use(requireAuth);

/** Flat, filterable movement feed: entries plus repayments, newest first. */
activityRouter.get(
  '/',
  validate('query', activityQuerySchema),
  asyncHandler(async (req, res) => {
    const query = readQuery<ActivityQuery>(req);
    const userId = req.session.userId!;
    const { people, entries } = await loadLedger(userId);
    const names = new Map(people.map((person) => [person.id, person.name]));
    const now = new Date();
    const window = query.month ? monthWindow(query.month) : null;

    const entryEvents = entries
      .filter((entry) => !window || (entry.occurredAt >= window.start && entry.occurredAt < window.end))
      .map((entry) => {
        const dto = serializeEntry(entry, names.get(entry.personId) ?? 'Unknown');
        return {
          kind: 'entry' as const,
          id: dto.id,
          personId: dto.personId,
          personName: dto.personName,
          personInitials: dto.personInitials,
          direction: dto.direction,
          amountPaise: dto.principalPaise,
          amountLabel: dto.principalLabel,
          outstandingPaise: dto.outstandingPaise,
          note: dto.note,
          occurredAt: dto.occurredAt,
          dueDate: dto.dueDate,
          status: dto.status,
          daysOverdue: dto.daysOverdue,
        };
      });

    const repaymentEvents = entries.flatMap((entry) =>
      entry.repayments
        .filter((repayment) => !window || (repayment.occurredAt >= window.start && repayment.occurredAt < window.end))
        .map((repayment) => ({
          kind: 'repayment' as const,
          id: repayment.id,
          entryId: entry.id,
          personId: entry.personId,
          personName: names.get(entry.personId) ?? 'Unknown',
          personInitials: serializeEntry(entry, names.get(entry.personId) ?? 'Unknown').personInitials,
          direction: entry.direction,
          amountPaise: repayment.amountPaise,
          amountLabel: serializeRepayment(repayment, entry.personId).amountLabel,
          note: repayment.note,
          occurredAt: repayment.occurredAt.toISOString(),
          settled: entryStatus(entry, now) === 'settled',
        })),
    );

    const combined = [...entryEvents, ...repaymentEvents]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .filter((event) => {
        if (query.type === 'lent' && !(event.kind === 'entry' && event.direction === 'LENT')) return false;
        if (query.type === 'borrowed' && !(event.kind === 'entry' && event.direction === 'BORROWED')) return false;
        if (query.type === 'repayments' && event.kind !== 'repayment') return false;
        if (query.type === 'overdue' && !(event.kind === 'entry' && event.status === 'overdue')) return false;
        if (query.search) {
          const needle = query.search.toLowerCase();
          const haystack = `${event.personName} ${event.note ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .slice(0, query.limit);

    const monthTotals = summarise(
      entries.filter((entry) => !window || (entry.occurredAt >= window.start && entry.occurredAt < window.end)),
    );

    const availableMonths = Array.from(new Set(entries.map((entry) => monthKey(entry.occurredAt))))
      .sort()
      .reverse();

    res.json({
      events: combined,
      monthTotals: {
        lentPaise: monthTotals.lentPaise,
        borrowedPaise: monthTotals.borrowedPaise,
        receivedPaise: monthTotals.receivedPaise,
        repaidPaise: monthTotals.repaidPaise,
        netPaise: monthTotals.lentPaise - monthTotals.borrowedPaise,
      },
      counts: {
        all: entryEvents.length + repaymentEvents.length,
        lent: entryEvents.filter((event) => event.direction === 'LENT').length,
        borrowed: entryEvents.filter((event) => event.direction === 'BORROWED').length,
        repayments: repaymentEvents.length,
        overdue: entryEvents.filter((event) => event.status === 'overdue').length,
      },
      availableMonths,
    });
  }),
);
