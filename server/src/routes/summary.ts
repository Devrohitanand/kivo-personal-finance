import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/security.js';
import { loadLedger } from '../services/ledger.js';
import { serializeEntry, serializeTotals } from '../lib/serialize.js';
import { entryStatus } from '../domain/ledger.js';

export const summaryRouter = Router();
summaryRouter.use(requireAuth);

const UPCOMING_WINDOW_DAYS = 7;

/**
 * Dashboard payload: outstanding totals, the dues that need attention and the
 * most recent ledger movements.
 */
summaryRouter.get(
  '/home',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { people, entries } = await loadLedger(userId);
    const names = new Map(people.map((person) => [person.id, person.name]));
    const now = new Date();
    const horizon = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);

    const activePeople = people.filter((person) => person.archivedAt === null);
    const openEntries = entries.filter((entry) => entryStatus(entry, now) !== 'settled');

    const dues = openEntries
      .filter((entry) => entry.dueDate !== null)
      .filter((entry) => entry.dueDate! <= horizon)
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
      .map((entry) => serializeEntry(entry, names.get(entry.personId) ?? 'Unknown'));

    const recentActivity = entries
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 6)
      .map((entry) => serializeEntry(entry, names.get(entry.personId) ?? 'Unknown'));

    const totals = serializeTotals(entries);

    res.json({
      totals,
      peopleCount: activePeople.length,
      activeLedgerCount: new Set(openEntries.map((entry) => entry.personId)).size,
      pendingCount: dues.length,
      overdueCount: dues.filter((due) => due.status === 'overdue').length,
      dues,
      recentActivity,
      updatedAt: now.toISOString(),
    });
  }),
);
