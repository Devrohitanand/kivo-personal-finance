import { formatPaise } from './money.js';

export function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));

  if (words.length === 0) return '?';
  if (words.length === 1) {
    const word = words[0] ?? '';
    return Array.from(word).slice(0, 2).join('').toUpperCase();
  }
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  return `${Array.from(first)[0] ?? ''}${Array.from(last)[0] ?? ''}`.toUpperCase();
}

export function money(paise: number): { paise: number; label: string } {
  return { paise, label: formatPaise(paise) };
}
