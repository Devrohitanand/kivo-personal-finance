const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses `YYYY-MM-DD` into the UTC start of that day, ignoring local timezone. */
export function parseDateOnly(value: string): Date {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseDateInput(value: string): Date {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) return parseDateOnly(trimmed);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Unparseable date: ${value}`);
  return parsed;
}

export function isValidDateInput(value: string): boolean {
  try {
    parseDateInput(value);
    return true;
  } catch {
    return false;
  }
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
