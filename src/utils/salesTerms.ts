export const salesDeliveryMethodOptions = ['客户自提', '本厂配送', '整车货运', '拼车物流', '快递快运'];

export const salesPaymentOptions = ['月结 30 天', '预付款 30%', '款到发货'];

export function normalizeSalesDeliveryMethod(value = '') {
  const legacyMap: Record<string, string> = {
    送货到厂: '本厂配送',
    物流发运: '拼车物流',
    专车配送: '整车货运',
    快递: '快递快运',
  };

  return legacyMap[value] || value || '本厂配送';
}

export function normalizeSalesPaymentMethod(value = '') {
  const legacyMap: Record<string, string> = {
    '预付 30%': '预付款 30%',
  };

  return legacyMap[value] || value || '月结 30 天';
}
