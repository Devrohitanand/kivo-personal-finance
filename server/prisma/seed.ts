import { hashPassword } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
async function main(): Promise<void> {
  const email = 'demo@kivo.app';
  const password = 'kivo1234';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: { name: 'Rahul Kumar', email, passwordHash: await hashPassword(password) },
  });

  const people = [
    { name: 'Vikram Malhotra', phone: '+91 98200 11223' },
    { name: 'Ananya Sen' },
    { name: 'Kabir Verma' },
    { name: 'Priya Sharma' },
    { name: 'Rohit Gupta' },
    { name: 'Simran Kaur' },
  ];

  const created = new Map<string, string>();
  for (const person of people) {
    const row = await prisma.person.create({
      data: { userId: user.id, name: person.name, phone: person.phone ?? null },
    });
    created.set(person.name, row.id);
  }

  const day = (daysAgo: number, hour = 12) => {
    const base = new Date();
    base.setUTCHours(hour, 0, 0, 0);
    base.setUTCDate(base.getUTCDate() - daysAgo);
    return base;
  };

  const entries = [
    { person: 'Vikram Malhotra', direction: 'LENT' as const, amount: 850000, note: 'Goa trip car booking', occurredAt: day(12), dueDate: day(4) },
    { person: 'Vikram Malhotra', direction: 'LENT' as const, amount: 250000, note: 'Airbnb split', occurredAt: day(20) },
    { person: 'Ananya Sen', direction: 'LENT' as const, amount: 540000, note: 'Groceries & Swiggy', occurredAt: day(9) },
    { person: 'Kabir Verma', direction: 'BORROWED' as const, amount: 420000, note: 'Concert tickets booking', occurredAt: day(14) },
    { person: 'Priya Sharma', direction: 'LENT' as const, amount: 610000, note: 'Weekend brunch & shopping', occurredAt: day(7), dueDate: day(2) },
    { person: 'Rohit Gupta', direction: 'BORROWED' as const, amount: 330000, note: 'Cab sharing commute', occurredAt: day(16) },
    { person: 'Simran Kaur', direction: 'LENT' as const, amount: 180000, note: 'Cafe bill', occurredAt: day(21) },
  ];

  const entryIds: string[] = [];
  for (const entry of entries) {
    const personId = created.get(entry.person);
    if (!personId) throw new Error(`missing person ${entry.person}`);
    const row = await prisma.entry.create({
      data: {
        userId: user.id,
        personId,
        direction: entry.direction,
        principalPaise: entry.amount,
        note: entry.note,
        occurredAt: entry.occurredAt,
        dueDate: entry.dueDate ?? null,
      },
    });
    entryIds.push(row.id);
  }

  // Simran's cafe bill was cleared, Vikram paid part of his Goa booking.
  await prisma.repayment.create({
    data: {
      userId: user.id,
      entryId: entryIds[6]!,
      amountPaise: 180000,
      note: 'Settled in cash',
      occurredAt: day(11),
    },
  });
  await prisma.repayment.create({
    data: {
      userId: user.id,
      entryId: entryIds[0]!,
      amountPaise: 200000,
      note: 'Partial return via UPI',
      occurredAt: day(6),
    },
  });

  console.log(`[kivo] seeded demo account ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error('[kivo] seed failed', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
