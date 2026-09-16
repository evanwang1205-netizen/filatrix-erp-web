export function isValidOptionalEmail(value: unknown) {
  const email = String(value ?? '').trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isNonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

export function isNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0;
}

export function isPositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

export function isValidIsoDate(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}
