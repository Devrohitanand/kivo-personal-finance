import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/security.js';
import { loadLedger } from '../services/ledger.js';
import { serializeEntry, serializePerson, serializeRepayment, serializeTotals } from '../lib/serialize.js';

export const exportRouter = Router();
exportRouter.use(requireAuth);

/**
 * Full account export as JSON. Scoped to the session user only, so an export
 * can never contain another account's ledger.
 */
exportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { people, entries } = await loadLedger(userId);
    const names = new Map(people.map((person) => [person.id, person.name]));

    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      currency: 'INR',
      moneyUnit: 'paise',
      totals: serializeTotals(entries),
      people: people.map(serializePerson),
      entries: entries
        .slice()
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map((entry) => serializeEntry(entry, names.get(entry.personId) ?? 'Unknown')),
      repayments: entries
        .flatMap((entry) => entry.repayments.map((repayment) => serializeRepayment(repayment, entry.personId)))
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kivo-export-${Date.now()}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  }),
);
