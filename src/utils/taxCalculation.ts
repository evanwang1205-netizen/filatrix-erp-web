export const taxRateOptions = ['13%', '9%', '6%', '3%', '1%', '0%', '免税'];

export function taxRateValue(value?: string) {
  if (value === '免税') return 0;

  const numeric = Number(String(value || '13%').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric / 100 : 0.13;
}
