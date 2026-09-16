type ProductLike = {
  materialCode?: string;
  code?: string;
  name?: string;
  model?: string;
  spec?: string;
  uom?: string;
  qty?: string;
  requestQty?: string;
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function uniqueParts(parts: string[]) {
  const result: Array<{ key: string; value: string }> = [];

  for (const part of parts) {
    const key = part.replace(/\s+/g, '').toLowerCase();
    if (!key) continue;
    if (result.some((item) => item.key === key || item.key.includes(key))) continue;

    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (key.includes(result[index].key)) result.splice(index, 1);
    }

    result.push({ key, value: part });
  }

  return result.map((item) => item.value);
}

function quantityText(value: unknown) {
  return clean(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? '';
}

export function productIdentity(product: ProductLike | undefined, fallback = '选择物料') {
  if (!product) return fallback;
  return uniqueParts([product.materialCode || product.code, product.name, product.model, product.spec].map(clean).filter(Boolean)).join(' ') || fallback;
}

export function productUnit(product: ProductLike | undefined, fallback = '-') {
  return clean(product?.uom) || fallback;
}

export function productQtyWithUnit(product: ProductLike | undefined, key: 'qty' | 'requestQty' = 'qty') {
  const rawQty = clean(product?.[key]);
  const qty = quantityText(rawQty) || rawQty;
  const unit = productUnit(product, '');
  if (!qty) return '-';
  if (!unit && rawQty && rawQty !== qty) return rawQty;
  return unit ? `${qty} ${unit}` : qty;
}
