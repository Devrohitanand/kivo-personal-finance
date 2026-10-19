import type { Direction, Entry, Person, Repayment } from '@prisma/client';
import {
  daysOverdue,
  entryStatus,
  outstandingPaise,
  personBalance,
  personStanding,
  repaidPaise,
  summarise,
  type EntryStatus,
  type PersonStanding,
} from '../domain/ledger.js';
import { formatPaise, formatSignedPaise } from '../lib/money.js';
import { initialsFor } from '../lib/format.js';
import { toDateOnly } from '../lib/dates.js';

export type EntryWithRepayments = Entry & { repayments: Repayment[] };
export type PersonWithEntries = Person & { entries: EntryWithRepayments[] };

export interface RepaymentDto {
  id: string;
  entryId: string;
  personId: string;
  amountPaise: number;
  amountLabel: string;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface EntryDto {
  id: string;
  personId: string;
  personName: string;
  personInitials: string;
  direction: Direction;
  principalPaise: number;
  principalLabel: string;
  repaidPaise: number;
  repaidLabel: string;
  outstandingPaise: number;
  outstandingLabel: string;
  note: string | null;
  occurredAt: string;
  dueDate: string | null;
  status: EntryStatus;
  daysOverdue: number;
  repayments: RepaymentDto[];
  createdAt: string;
}

export interface PersonDto {
  id: string;
  name: string;
  initials: string;
  phone: string | null;
  note: string | null;
  archivedAt: string | null;
  receivablePaise: number;
  payablePaise: number;
  netPaise: number;
  netLabel: string;
  standing: PersonStanding;
  entryCount: number;
  lastActivityAt: string | null;
  latestNote: string | null;
  createdAt: string;
}

export function serializeRepayment(repayment: Repayment, personId: string): RepaymentDto {
  return {
    id: repayment.id,
    entryId: repayment.entryId,
    personId,
    amountPaise: repayment.amountPaise,
    amountLabel: formatPaise(repayment.amountPaise),
    note: repayment.note,
    occurredAt: repayment.occurredAt.toISOString(),
    createdAt: repayment.createdAt.toISOString(),
  };
}

export function serializeEntry(entry: EntryWithRepayments, personName: string): EntryDto {
  const repaid = repaidPaise(entry);
  const outstanding = outstandingPaise(entry);
  return {
    id: entry.id,
    personId: entry.personId,
    personName,
    personInitials: initialsFor(personName),
    direction: entry.direction,
    principalPaise: entry.principalPaise,
    principalLabel: formatPaise(entry.principalPaise),
    repaidPaise: repaid,
    repaidLabel: formatPaise(repaid),
    outstandingPaise: outstanding,
    outstandingLabel: formatPaise(outstanding),
    note: entry.note,
    occurredAt: entry.occurredAt.toISOString(),
    dueDate: entry.dueDate ? toDateOnly(entry.dueDate) : null,
    status: entryStatus(entry),
    daysOverdue: daysOverdue(entry),
    repayments: entry.repayments
      .slice()
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map((repayment) => serializeRepayment(repayment, entry.personId)),
    createdAt: entry.createdAt.toISOString(),
  };
}

export function serializePerson(person: PersonWithEntries): PersonDto {
  const balance = personBalance(person.entries);
  const lastEntry = person.entries
    .slice()
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];

  return {
    id: person.id,
    name: person.name,
    initials: initialsFor(person.name),
    phone: person.phone,
    note: person.note,
    archivedAt: person.archivedAt ? person.archivedAt.toISOString() : null,
    receivablePaise: balance.receivablePaise,
    payablePaise: balance.payablePaise,
    netPaise: balance.netPaise,
    netLabel: formatSignedPaise(balance.netPaise),
    standing: personStanding(balance),
    entryCount: person.entries.length,
    lastActivityAt: lastEntry ? lastEntry.occurredAt.toISOString() : null,
    latestNote: lastEntry?.note ?? null,
    createdAt: person.createdAt.toISOString(),
  };
}

export function serializeTotals(entries: readonly EntryWithRepayments[]) {
  const totals = summarise(entries);
  return {
    receivablePaise: totals.receivablePaise,
    receivableLabel: formatPaise(totals.receivablePaise),
    payablePaise: totals.payablePaise,
    payableLabel: formatPaise(totals.payablePaise),
    netPaise: totals.netPaise,
    netLabel: formatSignedPaise(totals.netPaise),
    lentPaise: totals.lentPaise,
    lentLabel: formatPaise(totals.lentPaise),
    borrowedPaise: totals.borrowedPaise,
    borrowedLabel: formatPaise(totals.borrowedPaise),
    receivedPaise: totals.receivedPaise,
    receivedLabel: formatPaise(totals.receivedPaise),
    repaidPaise: totals.repaidPaise,
    repaidLabel: formatPaise(totals.repaidPaise),
  };
}

export type TotalsDto = ReturnType<typeof serializeTotals>;
