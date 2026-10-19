export type Direction = 'LENT' | 'BORROWED';

export interface RepaymentLike {
  amountPaise: number;
  occurredAt: Date;
}

export interface EntryLike {
  id: string;
  personId: string;
  direction: Direction;
  principalPaise: number;
  occurredAt: Date;
  dueDate: Date | null;
  repayments: RepaymentLike[];
}

export type EntryStatus = 'settled' | 'overdue' | 'pending';

export interface LedgerTotals {
  /** Outstanding money owed to the user. */
  receivablePaise: number;
  /** Outstanding money the user owes. */
  payablePaise: number;
  /** receivable - payable. */
  netPaise: number;
  /** Principal the user has handed out, settled or not. */
  lentPaise: number;
  /** Principal the user has taken, settled or not. */
  borrowedPaise: number;
  /** Total money returned to the user against LENT entries. */
  receivedPaise: number;
  /** Total money the user paid back against BORROWED entries. */
  repaidPaise: number;
}

export interface PersonBalance {
  receivablePaise: number;
  payablePaise: number;
  netPaise: number;
}

const MS_PER_DAY = 86_400_000;

export function repaidPaise(entry: EntryLike): number {
  return entry.repayments.reduce((total, repayment) => total + repayment.amountPaise, 0);
}

/** Never returns a negative number: a repayment can never exceed the principal. */
export function outstandingPaise(entry: EntryLike): number {
  return Math.max(0, entry.principalPaise - repaidPaise(entry));
}

export function isSettled(entry: EntryLike): boolean {
  return outstandingPaise(entry) === 0;
}

export function entryStatus(entry: EntryLike, now: Date = new Date()): EntryStatus {
  if (isSettled(entry)) return 'settled';
  if (entry.dueDate && startOfUtcDay(entry.dueDate).getTime() < startOfUtcDay(now).getTime()) {
    return 'overdue';
  }
  return 'pending';
}

/** Whole days the entry is past its due date. Zero when not overdue. */
export function daysOverdue(entry: EntryLike, now: Date = new Date()): number {
  if (!entry.dueDate || entryStatus(entry, now) !== 'overdue') return 0;
  const diff = startOfUtcDay(now).getTime() - startOfUtcDay(entry.dueDate).getTime();
  return Math.floor(diff / MS_PER_DAY);
}

export function summarise(entries: readonly EntryLike[]): LedgerTotals {
  const totals: LedgerTotals = {
    receivablePaise: 0,
    payablePaise: 0,
    netPaise: 0,
    lentPaise: 0,
    borrowedPaise: 0,
    receivedPaise: 0,
    repaidPaise: 0,
  };

  for (const entry of entries) {
    const repaid = repaidPaise(entry);
    const outstanding = outstandingPaise(entry);
    if (entry.direction === 'LENT') {
      totals.lentPaise += entry.principalPaise;
      totals.receivedPaise += repaid;
      totals.receivablePaise += outstanding;
    } else {
      totals.borrowedPaise += entry.principalPaise;
      totals.repaidPaise += repaid;
      totals.payablePaise += outstanding;
    }
  }

  totals.netPaise = totals.receivablePaise - totals.payablePaise;
  return totals;
}

export function personBalance(entries: readonly EntryLike[]): PersonBalance {
  const totals = summarise(entries);
  return {
    receivablePaise: totals.receivablePaise,
    payablePaise: totals.payablePaise,
    netPaise: totals.netPaise,
  };
}

export type PersonStanding = 'they-owe' | 'i-owe' | 'settled';

export function personStanding(balance: PersonBalance): PersonStanding {
  if (balance.netPaise > 0) return 'they-owe';
  if (balance.netPaise < 0) return 'i-owe';
  return 'settled';
}

/** Clamps a calendar date to the UTC start of that day. */
export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Inclusive UTC window for a `YYYY-MM` month key. */
export function monthWindow(monthKey: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type ReportRange = 'this-month' | 'last-3-months' | 'all-time';

export function rangeWindow(
  range: ReportRange,
  now: Date = new Date(),
): { start: Date | null; end: Date } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (range === 'this-month') {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end };
  }
  if (range === 'last-3-months') {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)), end };
  }
  return { start: null, end };
}

export function withinRange(value: Date, start: Date | null, end: Date): boolean {
  const time = value.getTime();
  if (start && time < start.getTime()) return false;
  return time < end.getTime();
}

export function percentageOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}
