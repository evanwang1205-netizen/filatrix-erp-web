export function isLegacyAfterSalesGeneratedBatch(batch: unknown, taskCode: unknown) {
  const code = String(taskCode || '').trim();
  const value = String(batch || '').trim();
  if (!/^WAS-/.test(code) || !value) return false;

  const legacyPrefix = code.replace(/[^A-Z0-9]/gi, '');
  return value.startsWith(`${legacyPrefix}-`) && /^\d+$/.test(value.slice(legacyPrefix.length + 1));
}

export function afterSalesBatchLabel(batch: unknown, taskCode: unknown, emptyLabel = '未登记') {
  const value = String(batch || '').trim();
  if (!value) return emptyLabel;
  return isLegacyAfterSalesGeneratedBatch(value, taskCode) ? '历史批次未登记' : value;
}
