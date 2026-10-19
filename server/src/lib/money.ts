/** Largest single amount KIVO accepts: ₹1,00,00,000 (one crore) in paise. */
export const MAX_AMOUNT_PAISE = 1_000_000_000;

const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmountError';
  }
}

export function parseAmountToPaise(input: string | number): number {
  const raw = typeof input === 'number' ? String(input) : input.trim();
  if (!AMOUNT_PATTERN.test(raw)) {
    throw new AmountError('Enter an amount with at most two decimal places');
  }

  const [rupees = '0', fraction = ''] = raw.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0') || '0');

  if (paise <= 0) throw new AmountError('Amount must be greater than zero');
  if (paise > MAX_AMOUNT_PAISE) throw new AmountError('Amount is larger than KIVO supports');
  return paise;
}

export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  const grouped = new Intl.NumberFormat('en-IN').format(rupees);
  if (fraction === 0) return `${sign}₹${grouped}`;
  return `${sign}₹${grouped}.${String(fraction).padStart(2, '0')}`;
}

/** Formats with an explicit + or - so ledger rows read unambiguously. */
export function formatSignedPaise(paise: number): string {
  if (paise === 0) return formatPaise(0);
  return `${paise > 0 ? '+' : '-'}${formatPaise(Math.abs(paise))}`;
}

/** Truncates a paise value to a percentage of a total, rounded to 1 decimal. */
export function percentageOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}
