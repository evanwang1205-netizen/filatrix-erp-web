const baseUrl = process.env.FILATRIX_API_URL || 'http://127.0.0.1:5175/api';
const account = process.env.FILATRIX_ACCOUNT || 'ACC-ZHANGSAN';
const marker = '多物料采购入库页面视觉测试（大格子记录）';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-filatrix-account': account,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function ok(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(`HTTP ${result.response.status}: ${result.payload.error || path}`);
  }
  return result.payload;
}

function quantityNumber(value) {
  return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0;
}

async function ensureExemptTestMaterial() {
  const materials = await ok('/master-data/materials');
  const existing = materials.items.find((row) => row.code === 'M-PKG-RECEIPT-LABEL');
  if (existing) return existing;

  const created = await ok('/master-data/materials', {
    method: 'POST',
    body: {
      code: 'M-PKG-RECEIPT-LABEL',
      name: '采购收货标识贴',
      type: '包材',
      model: 'LABEL-RECEIPT-80',
      spec: '80 × 50 mm，采购批次标识',
      category: '包材',
      isSaleable: false,
      supplyStrategy: '采购',
      isPurchasable: true,
      isProducible: false,
      defaultWarehouse: '包材仓',
      batchControl: '批次管理',
      shelfLife: '无效期要求',
      qualityControl: '免检',
      incomingQualityControl: '免检',
      inboundQualityControl: '不适用',
      uom: '个',
      imageLabel: 'LBL',
      imageTone: '#e4eadf',
      status: '启用',
      updatedAt: '2026-07-31',
      note: '用于多物料采购入库页面的可重复演示数据。',
    },
  });
  return created.record;
}

async function findDemoOrder() {
  const orders = await ok('/purchase/orders');
  for (const row of orders.items) {
    const materialCodes = new Set((row.products || []).map((line) => line.materialCode));
    if (
      row.remark === marker
      || (
        materialCodes.size === 3
        && ['M-PKG-CARTON-12', 'M-AM-DESICCANT', 'M-PKG-RECEIPT-LABEL']
          .every((code) => materialCodes.has(code))
      )
    ) return row;
  }
  return undefined;
}

async function findReceiptForOrder(orderCode) {
  const receipts = await ok('/warehouse/purchase-receipts');
  const matches = receipts.items.filter((row) => row.sourceDoc === orderCode);
  return matches.find((row) => row.inboundPostings?.length)
    || matches.find((row) => row.status === '已入库')
    || matches[0];
}

async function createDemoOrder() {
  const [baseOrder, materials] = await Promise.all([
    ok('/purchase/orders/PO-20260716-005'),
    ok('/master-data/materials'),
  ]);
  const materialByCode = new Map(materials.items.map((row) => [row.code, row]));
  const definitions = [
    { code: 'M-PKG-CARTON-12', qty: 120, price: '5.80' },
    { code: 'M-AM-DESICCANT', qty: 1500, price: '0.18' },
    { code: 'M-PKG-RECEIPT-LABEL', qty: 3000, price: '0.06' },
  ];

  const created = await ok('/purchase/orders', {
    method: 'POST',
    body: {
      ...baseOrder.order,
      code: '系统自动生成',
      status: '草稿',
      documentStatus: '草稿',
      sourceRequisition: '',
      sourceRequisitions: [],
      relatedDocuments: [],
      progressFacts: undefined,
      revision: undefined,
      confirmedAt: undefined,
      confirmedBy: undefined,
      expectedDate: '2026-07-31',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-03',
      remark: marker,
      products: definitions.map((definition, index) => {
        const material = materialByCode.get(definition.code);
        if (!material) throw new Error(`缺少测试物料 ${definition.code}`);
        return {
          lineId: `L${index + 1}`,
          materialCode: material.code,
          name: material.name,
          model: material.model,
          spec: material.spec,
          qty: `${definition.qty} ${material.uom}`,
          unitPrice: definition.price,
          amount: '',
          qcRequired: false,
          uom: material.uom,
          sourceRequisition: '',
          sourceLineId: '',
          priceInputMode: '含税',
          taxRate: '13%',
          imageLabel: material.imageLabel,
          imageTone: material.imageTone,
        };
      }),
    },
  });
  return created.order;
}

async function ensureReceiptTask(order) {
  let receipt = await findReceiptForOrder(order.code);
  if (receipt) return receipt;
  if (order.status === '草稿') {
    const confirmed = await ok(`/purchase/orders/${encodeURIComponent(order.code)}/confirm`, {
      method: 'POST',
    });
    return confirmed.receiptTask;
  }
  throw new Error(`采购订单 ${order.code} 已不是草稿，但没有对应采购入库任务`);
}

async function ensureArrival(receipt) {
  const detail = await ok(`/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}`);
  if (!['待收货', '草稿'].includes(detail.receipt.status)) return detail.receipt;

  const saved = await ok(`/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}`, {
    method: 'PUT',
    body: {
      ...detail.receipt,
      date: '2026-07-31',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      location: 'QC-03',
      note: '三种免检包材同车到货，用于核对多物料到货与入库记录布局。',
      products: detail.receipt.products.map((line) => ({
        ...line,
        qty: line.plannedQty,
        arrivalQty: line.plannedQty,
        acceptedQty: line.plannedQty,
        refusedQty: `0 ${line.uom}`,
        exceptionHeldQty: `0 ${line.uom}`,
      })),
    },
  });

  const submitted = await ok(`/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}/arrival-result`, {
    method: 'POST',
    body: {
      idempotencyKey: `${receipt.code}:multi-material-demo:arrival`,
    },
  });
  return submitted.receipt || saved.receipt;
}

async function ensureInbound(receipt) {
  const detail = await ok(`/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}`);
  if (detail.receipt.inboundPostings?.some((posting) => !posting.reversalCode)) {
    return detail.receipt;
  }

  const allocations = detail.receipt.products
    .map((line, index) => ({
      receiptLineId: line.lineId,
      quantity: quantityNumber(line.acceptedQty || line.qty),
      warehouseCode: 'WH-PKG',
      warehouse: '包材仓',
      location: `PKG-${String(index + 1).padStart(2, '0')}`,
    }))
    .filter((line) => line.quantity > 0);
  if (allocations.length !== 3) {
    throw new Error(`应生成 3 行入库分配，实际为 ${allocations.length} 行`);
  }

  const posted = await ok(`/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}/post`, {
    method: 'POST',
    body: {
      idempotencyKey: `${receipt.code}:multi-material-demo:post`,
      allocations,
    },
  });
  return posted.receipt;
}

async function main() {
  await ensureExemptTestMaterial();
  let order = await findDemoOrder();
  if (!order) order = await createDemoOrder();
  let receipt = await ensureReceiptTask(order);
  receipt = await ensureArrival(receipt);
  receipt = await ensureInbound(receipt);

  const detail = await ok(`/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}`);
  const arrivalLineCount = detail.detailProjection?.arrivalRecords
    ?.reduce((sum, record) => sum + (record.lines?.length || 0), 0) || 0;
  const inboundLineCount = detail.receipt.inboundPostings
    ?.filter((posting) => !posting.reversalCode)
    .reduce((sum, posting) => sum + (posting.lines?.length || 0), 0) || 0;
  if (arrivalLineCount !== 3 || inboundLineCount !== 3) {
    throw new Error(`测试单记录不完整：到货 ${arrivalLineCount} 行，入库 ${inboundLineCount} 行`);
  }

  console.log(JSON.stringify({
    orderCode: order.code,
    receiptCode: receipt.code,
    status: detail.receipt.status,
    arrivalLineCount,
    inboundLineCount,
    url: `http://127.0.0.1:5174/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
