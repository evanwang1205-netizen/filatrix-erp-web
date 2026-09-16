export function nextEquipmentInspectionDate(dateText, frequency) {
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))
    ? String(dateText)
    : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [year, month, day] = source.split('-').map(Number);
  if (frequency === '每月' || frequency === '每季度') {
    const monthOffset = frequency === '每季度' ? 3 : 1;
    const targetIndex = year * 12 + (month - 1) + monthOffset;
    const targetYear = Math.floor(targetIndex / 12);
    const targetMonthIndex = targetIndex % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
    return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  }
  const date = new Date(Date.UTC(year, month - 1, day + (frequency === '每周' ? 7 : 1)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
