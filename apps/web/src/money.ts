export function toMinorUnits(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (normalized.length === 0) {
    return Number.NaN;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Math.round(parsed * 100);
}

export function formatMoney(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency
    }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}

export function formatSignedMoney(
  minorUnits: number,
  currency: string
): string {
  const formatted = formatMoney(Math.abs(minorUnits), currency);
  if (minorUnits > 0) {
    return `+${formatted}`;
  }
  if (minorUnits < 0) {
    return `-${formatted}`;
  }
  return formatted;
}
