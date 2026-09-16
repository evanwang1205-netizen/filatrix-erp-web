import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(
  /\/$/,
  '',
);
const showProgress = process.env.FILATRIX_SMOKE_PROGRESS === '1';
const smokeDocumentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const smokeExpectedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
);

function reportProgress(name) {
  if (showProgress) console.log(`[smoke-api] ${name}`);
}

const checks = [
  { name: 'health', path: '/health', expect: (data) => data.ok === true },
  { name: 'master departments', path: '/master-data/departments', account: 'ACC-ZHANGSAN', expectItems: true },
  { name: 'reference departments search', path: '/reference/departments?q=%E9%94%80&limit=5', account: 'ACC-ZHANGSAN', expectItems: true },
  {
    name: 'sales quotes expose optimistic-lock revisions',
    path: '/sales/quotes',
    account: 'ACC-SALES',
    expectItems: true,
    expect: (data) => Array.isArray(data.items)
      && data.items.length > 0
      && data.items.every((row) => Number.isInteger(row.revision) && row.revision >= 1),
  },
  { name: 'purchase requisitions', path: '/purchase/requisitions', account: 'ACC-PURCHASE', expectItems: true },
  { name: 'warehouse inventory', path: '/warehouse/inventory', account: 'ACC-WAREHOUSE', expectItems: true },
  {
    name: 'production loss ledger projects actual traceable facts',
    path: '/production/loss-records',
    account: 'ACC-ZHANGSAN',
    expectItems: true,
    expect: (data) => Array.isArray(data.items)
      && data.items.some((row) => row.sourceType === '复绕损耗' && row.sourceDoc.startsWith('PRPT2-'))
      && data.items.some((row) => row.sourceType === '质检判定' && row.sourceEvidenceCode.startsWith('PQD2-'))
      && data.items.some((row) => row.sourceType === '复绕损耗'
        && row.status === '已确认'
        && Number(row.plannedLossKg) === Number(row.lossKg)
        && Number(row.unclassifiedLossKg) === 0)
      && data.items.every((row) => (
        row.sourceDoc
        && row.workOrderCode
        && row.productionBatchCode
        && row.productCode
        && Number(row.lossKg) > 0
        && Number(row.plannedLossKg) >= 0
        && Number(row.abnormalLossKg) >= 0
        && Number(row.unclassifiedLossKg) >= 0
        && Math.abs(
          Number(row.plannedLossKg)
          + Number(row.abnormalLossKg)
          + Number(row.unclassifiedLossKg)
          - Number(row.lossKg),
        ) <= 0.001
      )),
  },
  {
    name: 'warehouse inventory fact dimensions',
    path: '/warehouse/inventory',
    account: 'ACC-WAREHOUSE',
    expect: (data) => Array.isArray(data.items) && data.items.some((row) => (
      Number.isFinite(row.onHandNumber)
      && Number.isFinite(row.qualifiedOnHandNumber)
      && Number.isFinite(row.reservedNumber)
      && Number.isFinite(row.allocatedNumber)
      && Number.isFinite(row.frozenNumber)
      && Number.isFinite(row.qcHoldNumber)
      && Number.isFinite(row.pendingInboundNumber)
      && Number.isFinite(row.inTransitNumber)
      && row.availableNumber === Math.max(
        0,
        row.qualifiedOnHandNumber - row.reservedNumber - row.allocatedNumber - row.frozenNumber,
      )
    )),
  },
  {
    name: 'sales order line fulfillment facts',
    path: '/sales/orders/SO-20260715-022',
    account: 'ACC-SALES',
    expect: (data) => Array.isArray(data.order?.products)
      && Number.isInteger(data.order?.revision)
      && data.order.revision >= 1
      && data.order.products.every((line) => line.lineId)
      && data.order.products.some((line) => (
        Array.isArray(line.fulfillmentLinks)
        && line.fulfillmentLinks.some((link) => link.type === '库存预留')
        && line.fulfillmentLinks.some((link) => link.type === '生产任务')
      )),
  },
  {
    name: 'sales after-sales expose optimistic-lock revisions',
    path: '/sales/after-sales',
    account: 'ACC-SALES',
    expectItems: true,
    expect: (data) => Array.isArray(data.items)
      && data.items.length > 0
      && data.items.every((row) => Number.isInteger(row.revision) && row.revision >= 1),
  },
  {
    name: 'purchase after-sales expose optimistic-lock revisions',
    path: '/purchase/after-sales',
    account: 'ACC-PURCHASE',
    expectItems: true,
    expect: (data) => Array.isArray(data.items)
      && data.items.length > 0
      && data.items.every((row) => Number.isInteger(row.revision) && row.revision >= 1),
  },
  {
    name: 'released work order material allocations',
    path: '/warehouse/inventory',
    account: 'ACC-WAREHOUSE',
    expect: (data) => {
      const rows = Array.isArray(data.items) ? data.items : [];
      const allocated = rows.find((row) => (
        row.materialCode === 'M-RM-PLA-VIRGIN'
        && row.warehouseCode === 'WH-RM'
        && row.allocatedNumber > 0
      ));
      return allocated?.allocatedNumber > 0
        && Array.isArray(allocated.allocationSources)
        && allocated.allocationSources.some((source) => (
          source.type === '生产分配'
          && source.sourceDoc === 'RB2-20260717-001'
          && source.sourceLineId === 'MO2-20260717-001-L1'
          && source.quantityNumber > 0
        ));
    },
  },
  { name: 'retired finance module is not exposed', path: '/finance/sales-invoices', account: 'ACC-ZHANGSAN', status: 410 },
];

const permissionChecks = [
  {
    name: 'sales session context',
    path: '/session/current',
    account: 'ACC-SALES',
    status: 200,
    expect: (data) =>
      data.account?.code === 'ACC-SALES' &&
      data.permissions?.includes('PERM-SALES-EDIT') &&
      data.permissions?.includes('PERM-SALES-APPROVE') &&
      !data.permissions?.includes('PERM-WAREHOUSE-VIEW') &&
      !data.permissions?.includes('PERM-WAREHOUSE-POST'),
  },
  {
    name: 'sales notifications inbox',
    path: '/notifications',
    account: 'ACC-SALES',
    status: 200,
    expect: (data) => Array.isArray(data.items) && Number.isInteger(data.unreadCount),
  },
  { name: 'sales can read sales quotes', path: '/sales/quotes', account: 'ACC-SALES', status: 200, expectItems: true },
  {
    name: 'sales can read the scoped finished-goods inventory projection',
    path: '/sales/inventory',
    account: 'ACC-SALES',
    status: 200,
    expect: (data) => Array.isArray(data.items)
      && data.items.length > 0
      && data.items.every((row) => (
        row.itemType === '成品'
        && Object.prototype.hasOwnProperty.call(row, 'model')
        && Object.prototype.hasOwnProperty.call(row, 'spec')
        && !Object.prototype.hasOwnProperty.call(row, 'reservationSources')
        && !Object.prototype.hasOwnProperty.call(row, 'allocationSources')
        && !Object.prototype.hasOwnProperty.call(row, 'warehouse')
        && !Object.prototype.hasOwnProperty.call(row, 'location')
        && !Object.prototype.hasOwnProperty.call(row, 'batch')
        && !Object.prototype.hasOwnProperty.call(row, 'qualifiedOnHand')
        && !Object.prototype.hasOwnProperty.call(row, 'qualifiedOnHandNumber')
        && !Object.prototype.hasOwnProperty.call(row, 'locked')
        && !Object.prototype.hasOwnProperty.call(row, 'lockedNumber')
        && Array.isArray(row.salesReservationSources)
      )),
  },
  { name: 'sales can read customer reference candidates', path: '/reference/customers?limit=3', account: 'ACC-SALES', status: 200, expectItems: true },
  { name: 'sales cannot read purchase invoice reference candidates', path: '/reference/purchase-invoices?limit=3', account: 'ACC-SALES', status: 403 },
  { name: 'sales cannot read system accounts', path: '/system/accounts', account: 'ACC-SALES', status: 403 },
  { name: 'sales cannot read warehouse inventory', path: '/warehouse/inventory', account: 'ACC-SALES', status: 403 },
  {
    name: 'purchase session context',
    path: '/session/current',
    account: 'ACC-PURCHASE',
    status: 200,
    expect: (data) =>
      data.account?.code === 'ACC-PURCHASE' &&
      data.permissions?.includes('PERM-PURCHASE-EDIT') &&
      data.permissions?.includes('PERM-PURCHASE-APPROVE') &&
      !data.permissions?.includes('PERM-SALES-EDIT') &&
      !data.permissions?.includes('PERM-WAREHOUSE-VIEW') &&
      !data.permissions?.includes('PERM-FINANCE-VIEW'),
  },
  { name: 'warehouse can read warehouse inventory', path: '/warehouse/inventory', account: 'ACC-WAREHOUSE', status: 200, expectItems: true },
  { name: 'warehouse can read outbound reference candidates', path: '/reference/outbound-requests?limit=3', account: 'ACC-WAREHOUSE', status: 200 },
  {
    name: 'warehouse session context',
    path: '/session/current',
    account: 'ACC-WAREHOUSE',
    status: 200,
    expect: (data) =>
      data.account?.code === 'ACC-WAREHOUSE' &&
      data.permissions?.includes('PERM-WAREHOUSE-VIEW') &&
      data.permissions?.includes('PERM-WAREHOUSE-POST') &&
      !data.permissions?.includes('PERM-FINANCE-VIEW'),
  },
  {
    name: 'retired finance account cannot establish a session',
    path: '/session/current',
    account: 'ACC-FINANCE',
    status: 403,
  },
  {
    name: 'warehouse notifications inbox',
    path: '/notifications',
    account: 'ACC-WAREHOUSE',
    status: 200,
    expect: (data) => Array.isArray(data.items) && Number.isInteger(data.unreadCount),
  },
  {
    name: 'admin can read system accounts',
    path: '/system/accounts',
    account: 'ACC-ZHANGSAN',
    status: 200,
    expectItems: true,
    expect: (data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      return items.some(
        (row) =>
          row.code === 'ACC-PURCHASE' &&
          row.username === 'purchase01' &&
          row.employeeCode === 'EMP-CC' &&
          row.roles === 'ROLE-PURCHASE' &&
          row.passwordHash === undefined &&
          row.passwordSalt === undefined,
      );
    },
  },
  {
    name: 'admin can read operation permissions',
    path: '/system/permissions',
    account: 'ACC-ZHANGSAN',
    status: 200,
    expectItems: true,
    expect: (data) =>
      Array.isArray(data.items) &&
      data.items.some((row) => row.code === 'PERM-WAREHOUSE-VIEW') &&
      data.items.some((row) => row.code === 'PERM-SALES-APPROVE') &&
      data.items.some((row) => row.code === 'PERM-PURCHASE-APPROVE') &&
      !data.items.some((row) => row.code === 'PER-0004' || !String(row.code || '').startsWith('PERM-')),
  },
  {
    name: 'admin can manage system menus',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
    expectItems: true,
    expect: (data) =>
      Array.isArray(data.items) &&
      data.items.some((row) => row.code === 'MENU-SYSTEM') &&
      data.items.some((row) => row.code === 'MENU-SYSTEM-MENUS'),
  },
  {
    name: 'sales menu config is scoped to visible menus',
    path: '/system/menus',
    account: 'ACC-SALES',
    status: 200,
    expectItems: true,
    expect: (data) =>
      Array.isArray(data.items) &&
      data.items.some((row) => row.code === 'MENU-SALES') &&
      data.items.some((row) => row.code === 'MENU-SALES-ORDERS') &&
      !data.items.some((row) => row.code === 'MENU-SYSTEM') &&
      !data.items.some((row) => row.code?.startsWith('MENU-WAREHOUSE')) &&
      !data.items.some((row) => row.code?.startsWith('MENU-FINANCE')),
  },
  {
    name: 'admin can read structured audit logs',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 200,
    expectItems: true,
    expect: (data) =>
      Array.isArray(data.items) &&
      data.items.some((row) => row.target && row.remark && row.sourceAccount !== undefined && row.sourceIp !== undefined),
  },
  {
    name: 'internal notification inbox is not exposed as system config page',
    path: '/system/notificationInbox',
    account: 'ACC-ZHANGSAN',
    status: 404,
  },
];

async function readJson(check) {
  reportProgress(check.name);
  const response = await fetch(`${baseUrl}${check.path}`, {
    headers: {
      accept: 'application/json',
      ...(check.account ? { 'X-Filatrix-Account': check.account } : {}),
      ...(check.token ? { Authorization: `Bearer ${check.token}` } : {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (check.status && response.status !== check.status) {
    throw new Error(`${check.name}: expected HTTP ${check.status}, got ${response.status}: ${JSON.stringify(payload)}`);
  }

  if (!response.ok) {
    if (check.status && response.status === check.status) return payload;
    throw new Error(`${check.name}: HTTP ${response.status}`);
  }

  return payload;
}

async function writeJson(check) {
  reportProgress(check.name);
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method || 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      ...(check.account ? { 'X-Filatrix-Account': check.account } : {}),
      ...(check.token ? { Authorization: `Bearer ${check.token}` } : {}),
    },
    body: JSON.stringify(check.body || {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (check.status && response.status !== check.status) {
    throw new Error(`${check.name}: expected HTTP ${check.status}, got ${response.status}: ${JSON.stringify(payload)}`);
  }

  if (!response.ok && check.status && response.status === check.status) return payload;
  if (!response.ok) throw new Error(`${check.name}: HTTP ${response.status}`);
  return payload;
}

async function withDataFileRollback(check) {
  const snapshot = readFileSync(dataFile, 'utf8');
  try {
    return await check();
  } finally {
    writeFileSync(dataFile, snapshot);
  }
}

function menuDepth(row, rows, trail = new Set()) {
  if (!row?.parentCode || trail.has(row.code)) return 0;
  const parent = rows.find((candidate) => candidate.code === row.parentCode);
  return parent ? 1 + menuDepth(parent, rows, new Set([...trail, row.code])) : 0;
}

function deepestMenusFirst(rows, allRows) {
  return [...rows].sort((a, b) => menuDepth(b, allRows) - menuDepth(a, allRows));
}

function itemCount(data) {
  if (Array.isArray(data.items)) return data.items.length;
  if (Array.isArray(data.records)) return data.records.length;
  if (Array.isArray(data.rows)) return data.rows.length;
  return 0;
}

const results = [];

for (const check of checks) {
  const data = await readJson(check);
  const count = itemCount(data);
  const ok = check.expect ? check.expect(data) : !check.expectItems || count > 0;

  if (!ok) {
    throw new Error(`${check.name}: unexpected response`);
  }

  results.push(`${check.name}: ok${check.expectItems ? ` (${count})` : ''}`);
}

await withDataFileRollback(async () => {
  const normalizedUnitQuote = await writeJson({
    name: 'material unit normalizes sales quote quantity',
    path: '/sales/quotes',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'SMOKE-UNIT-QUOTE',
      customer: 'Smoke 客户',
      contact: 'Smoke 联系人',
      products: [{ materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '3 台', unitPrice: '1.00' }],
    },
  });
  const line = normalizedUnitQuote.quote?.products?.[0];
  if (line?.qty !== '3 卷' || line?.uom !== '卷') {
    throw new Error(`material unit normalization failed: ${JSON.stringify(line)}`);
  }
});
results.push('material unit normalizes sales quote quantity: ok');

await withDataFileRollback(async () => {
  const convertedQuote = await readJson({
    name: 'converted quote exposes related sales order',
    path: '/sales/quotes/QT-20260616-019',
    account: 'ACC-SALES',
    status: 200,
  });
  if (convertedQuote.quote?.status !== '已转订单' || convertedQuote.quote?.convertedOrderCode !== 'SO-20260715-022') {
    throw new Error(`converted quote relation failed: ${JSON.stringify(convertedQuote.quote)}`);
  }

  await writeJson({
    name: 'converted quote cannot be modified',
    path: '/sales/quotes/QT-20260616-019',
    method: 'PUT',
    account: 'ACC-SALES',
    status: 409,
    body: convertedQuote.quote,
  });

  const created = await writeJson({
    name: 'create quote with server-derived amount',
    path: '/sales/quotes',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: 'SMOKE-QUOTE-CHANGE',
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: '林经理',
      contactPhone: '138-0571-6218',
      validUntil: '2026-12-31',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', qty: '2 卷', unitPrice: '1.00', amount: '￥999.00' }],
      owner: '李明',
    },
  });
  if (created.quote?.products?.[0]?.amount !== '￥2.00' || created.quote?.amount !== '￥2.00') {
    throw new Error(`quote amount was not derived by server: ${JSON.stringify(created.quote)}`);
  }

  const confirmedForChange = await writeJson({
    name: 'confirm quote before change',
    path: '/sales/quotes/SMOKE-QUOTE-CHANGE/confirm',
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
    body: { revision: created.quote.revision },
  });

  const changed = await writeJson({
    name: 'confirmed quote change returns to draft',
    path: '/sales/quotes/SMOKE-QUOTE-CHANGE',
    method: 'PUT',
    account: 'ACC-SALES',
    status: 200,
    body: {
      ...confirmedForChange.quote,
      products: [{ ...confirmedForChange.quote.products[0], qty: '3 卷' }],
    },
  });
  if (changed.quote?.status !== '草稿' || changed.quote?.amount !== '￥3.00') {
    throw new Error(`confirmed quote change state failed: ${JSON.stringify(changed.quote)}`);
  }
  if (changed.flowRecords?.at(-1)?.action !== '变更报价') {
    throw new Error(`confirmed quote change flow missing: ${JSON.stringify(changed.flowRecords)}`);
  }
});
results.push('sales quote relation, lock, amount, and change-state guards: ok');

await withDataFileRollback(async () => {
  const fulfilledOrder = await readJson({
    name: 'sales order exposes commercial settlement projection to sales role',
    path: '/sales/orders/SO-20260528-008',
    account: 'ACC-SALES',
    status: 200,
  });
  const invoiceProgress = fulfilledOrder.order?.invoiceProgress;
  const paymentProgress = fulfilledOrder.order?.paymentProgress;
  if (
    invoiceProgress?.status !== '已开票'
    || paymentProgress?.status !== '已收款'
    || invoiceProgress.orderAmount !== 12420
    || paymentProgress.receivableAmount !== 12420
  ) {
    throw new Error(`sales order commercial projection failed: ${JSON.stringify({ invoiceProgress, paymentProgress })}`);
  }

  const created = await writeJson({
    name: 'sales order protects lifecycle, fulfillment, and amount facts',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: 'SMOKE-SALES-ORDER-PROTECTION',
      customerCode: 'CUS-HZQC',
      customer: '杭州千层增材科技',
      contact: '林经理',
      contactPhone: '138-0571-6218',
      owner: '李明',
      documentStatus: '已关闭',
      status: '已关闭',
      products: [{
        materialCode: 'M-FG-PLA-175-WHT',
        qty: '3 卷',
        unitPrice: '2.50',
        amount: '￥999.00',
        fulfillmentLinks: [{ type: '生产任务', documentCode: 'PT-FORGED', qty: '999 卷', status: '已完成' }],
      }],
    },
  });
  const createdLine = created.order?.products?.[0];
  if (
    created.order?.documentStatus !== '草稿'
    || created.order?.status !== '草稿'
    || createdLine?.amount !== '￥7.50'
    || created.order?.amount !== '￥7.50'
    || createdLine?.fulfillmentLinks?.length !== 0
  ) {
    throw new Error(`sales order protected facts failed: ${JSON.stringify(created.order)}`);
  }
});
results.push('sales order commercial settlement projection and protected facts: ok');

await withDataFileRollback(async () => {
  const pending = await readJson({
    name: 'sales outbound tracking source facts load',
    path: '/sales/outbound-requests/SR-20260715-003',
    account: 'ACC-SALES',
    status: 200,
  });
  const changed = await writeJson({
    name: 'sales outbound tracking protects order snapshot facts',
    path: '/sales/outbound-requests/SR-20260715-003',
    method: 'PUT',
    account: 'ACC-SALES',
    status: 200,
    body: {
      ...pending.request,
      sourceOrder: 'SO-FORGED',
      company: '伪造公司',
      customer: '伪造客户',
      applicant: '伪造负责人',
      requestDate: '1999-01-01',
      deliveryDate: '1999-01-02',
      status: '已签收',
      products: [{ materialCode: 'M-FG-PLA-175-MBK', qty: '999 卷', requestQty: '999 卷' }],
      expectedDate: '2026-07-25',
    },
  });
  if (
    changed.request?.sourceOrder !== pending.request?.sourceOrder
    || changed.request?.company !== pending.request?.company
    || changed.request?.customer !== pending.request?.customer
    || changed.request?.applicant !== pending.request?.applicant
    || changed.request?.requestDate !== pending.request?.requestDate
    || changed.request?.deliveryDate !== pending.request?.deliveryDate
    || changed.request?.status !== pending.request?.status
    || changed.request?.products?.[0]?.materialCode !== pending.request?.products?.[0]?.materialCode
    || changed.request?.products?.[0]?.requestQty !== pending.request?.products?.[0]?.requestQty
    || changed.request?.expectedDate !== '2026-07-25'
  ) {
    throw new Error(`sales outbound protected snapshot failed: ${JSON.stringify(changed.request)}`);
  }

  const partialChanged = await writeJson({
    name: 'partial outbound tracking keeps accepted warehouse',
    path: `/sales/outbound-requests/${encodeURIComponent(pending.request.code)}`,
    method: 'PUT',
    account: 'ACC-SALES',
    status: 200,
    body: { ...changed.request, warehouseCode: 'WH-RM', warehouse: '原料仓' },
  });
  if (
    partialChanged.request?.status !== '部分出库'
    || partialChanged.request?.warehouseCode !== pending.request?.warehouseCode
    || partialChanged.request?.warehouse !== pending.request?.warehouse
  ) {
    throw new Error(`sales outbound warehouse lock failed: ${JSON.stringify(partialChanged.request)}`);
  }
});
results.push('sales outbound tracking snapshot and warehouse locks: ok');

await withDataFileRollback(async () => {
  const currentRelations = await readJson({
    name: 'supplier material relations load',
    path: '/master-data/relations/material-suppliers?supplierCode=SUP-JXJC',
  });
  if (!Array.isArray(currentRelations.items) || currentRelations.items.length < 2) {
    throw new Error('supplier material relations load: expected seeded supplier relationships');
  }

  const savedRelations = await writeJson({
    name: 'supplier material relations save',
    path: '/master-data/relations/material-suppliers/SUP-JXJC',
    body: { items: currentRelations.items },
  });
  if (!savedRelations.items?.every((row) => row.baseUom === 'kg' && row.supplierCode === 'SUP-JXJC')) {
    throw new Error(`supplier material relations save: unexpected response ${JSON.stringify(savedRelations)}`);
  }

  const duplicateResponse = await writeJson({
    name: 'supplier material relations reject duplicate material',
    path: '/master-data/relations/material-suppliers/SUP-JXJC',
    status: 400,
    body: { items: [currentRelations.items[0], currentRelations.items[0]] },
  });
  if (!String(duplicateResponse.error || '').includes('重复维护')) {
    throw new Error('supplier material relations duplicate guard returned an unclear error');
  }
});
results.push('supplier material relations load, save, and duplicate guard: ok');

await withDataFileRollback(async () => {
  const currentSettings = await readJson({
    name: 'warehouse material settings load',
    path: '/master-data/relations/warehouse-materials?warehouseCode=WH-FG',
  });
  if (!Array.isArray(currentSettings.items) || currentSettings.items.length < 2) {
    throw new Error('warehouse material settings load: expected seeded replenishment settings');
  }

  const savedSettings = await writeJson({
    name: 'warehouse material settings save',
    path: '/master-data/relations/warehouse-materials/WH-FG',
    body: { items: currentSettings.items },
  });
  if (!savedSettings.items?.every((row) => row.warehouseCode === 'WH-FG' && row.uom === '卷')) {
    throw new Error(`warehouse material settings save: unexpected response ${JSON.stringify(savedSettings)}`);
  }

  const invalidSequence = await writeJson({
    name: 'warehouse material settings reject invalid thresholds',
    path: '/master-data/relations/warehouse-materials/WH-FG',
    status: 400,
    body: { items: [{ ...currentSettings.items[0], safetyStock: 600, reorderPoint: 500 }] },
  });
  if (!String(invalidSequence.error || '').includes('安全库存')) {
    throw new Error('warehouse material settings threshold guard returned an unclear error');
  }

  const duplicateResponse = await writeJson({
    name: 'warehouse material settings reject duplicate material',
    path: '/master-data/relations/warehouse-materials/WH-FG',
    status: 400,
    body: { items: [currentSettings.items[0], currentSettings.items[0]] },
  });
  if (!String(duplicateResponse.error || '').includes('重复维护')) {
    throw new Error('warehouse material settings duplicate guard returned an unclear error');
  }
});
results.push('warehouse material settings load, save, and validation guards: ok');

await withDataFileRollback(async () => {
  const kilogram = await readJson({ name: 'unit reference lock source', path: '/master-data/uom/UOM-KG' });
  const unchanged = await writeJson({
    name: 'referenced unit allows non-definition save',
    path: '/master-data/uom/UOM-KG',
    body: {
      ...kilogram.record,
      englishAbbreviation: 'kgs',
      englishName: 'Kilogram',
      symbol: 'KGX',
      type: '重量',
      baseUom: 'g',
      conversionRate: 1000,
      decimalPrecision: 6,
    },
  });
  if (
    unchanged.record?.name !== 'kg'
    || unchanged.record?.englishAbbreviation !== 'kgs'
    || ['englishName', 'symbol', 'type', 'baseUom', 'conversionRate', 'decimalPrecision'].some((key) => key in (unchanged.record || {}))
  ) {
    throw new Error(`referenced unit unchanged save failed: ${JSON.stringify(unchanged)}`);
  }

  const renameResponse = await writeJson({
    name: 'referenced unit rejects definition change',
    path: '/master-data/uom/UOM-KG',
    status: 400,
    body: { ...unchanged.record, name: '公斤' },
  });
  if (!String(renameResponse.error || '').includes('不能修改')) {
    throw new Error('referenced unit definition guard returned an unclear error');
  }

  const stopResponse = await writeJson({
    name: 'referenced unit rejects disable',
    path: '/master-data/uom/UOM-KG',
    status: 400,
    body: { ...unchanged.record, status: '停用' },
  });
  if (!String(stopResponse.error || '').includes('不能停用')) {
    throw new Error('referenced unit disable guard returned an unclear error');
  }

  const createdUnit = await writeJson({
    name: 'unit accepts concise definition and strips legacy fields',
    path: '/master-data/uom',
    method: 'POST',
    body: {
      code: '系统自动生成',
      name: '米',
      englishAbbreviation: 'm',
      englishName: 'Meter',
      status: '启用',
      symbol: 'm',
      type: '长度',
      baseUom: '厘米',
      conversionRate: 100,
      decimalPrecision: 3,
    },
  });
  if (
    createdUnit.record?.name !== '米'
    || createdUnit.record?.englishAbbreviation !== 'm'
    || ['englishName', 'symbol', 'type', 'baseUom', 'conversionRate', 'decimalPrecision'].some((key) => key in (createdUnit.record || {}))
  ) {
    throw new Error(`concise unit definition failed: ${JSON.stringify(createdUnit)}`);
  }
});
results.push('unit reference locks and concise field boundary: ok');

await withDataFileRollback(async () => {
  const salesDepartment = await readJson({ name: 'department reference source', path: '/master-data/departments/DEP-SALES' });
  const unchanged = await writeJson({
    name: 'department headcount is server projected and legacy labels are stripped',
    path: '/master-data/departments/DEP-SALES',
    body: {
      ...salesDepartment.record,
      employeeCount: 99,
      type: '业务部门',
      manager: '李明',
      primary: '旧主要职责',
      secondary: '旧职责说明',
    },
  });
  if (
    unchanged.record?.employeeCount !== 1
    || unchanged.record?.owner !== 'Filatrix 增材材料有限公司'
    || 'type' in (unchanged.record || {})
    || 'manager' in (unchanged.record || {})
    || 'primary' in (unchanged.record || {})
    || 'secondary' in (unchanged.record || {})
  ) {
    throw new Error(`department projection failed: ${JSON.stringify(unchanged)}`);
  }

  const renameResponse = await writeJson({
    name: 'referenced department rejects rename',
    path: '/master-data/departments/DEP-SALES',
    status: 400,
    body: { ...unchanged.record, name: '销售业务部' },
  });
  if (!String(renameResponse.error || '').includes('不能直接改名')) {
    throw new Error('department rename guard returned an unclear error');
  }

  const stopResponse = await writeJson({
    name: 'department with active employees rejects disable',
    path: '/master-data/departments/DEP-SALES',
    status: 400,
    body: { ...unchanged.record, status: '停用' },
  });
  if (!String(stopResponse.error || '').includes('启用员工')) {
    throw new Error('department disable guard returned an unclear error');
  }

  const invalidCompany = await writeJson({
    name: 'department rejects invalid company',
    path: '/master-data/departments',
    method: 'POST',
    status: 400,
    body: {
      code: '系统自动生成', name: '测试部门', owner: '不存在公司',
      parentDepartment: '', status: '启用',
    },
  });
  if (!String(invalidCompany.error || '').includes('已启用的公司')) {
    throw new Error('department company guard returned an unclear error');
  }
});
results.push('department company, headcount, and reference guards: ok');

await withDataFileRollback(async () => {
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  data.masterData.departments.push({
    code: 'DEP-SMOKE-RESOURCE',
    name: 'Smoke 资源部门',
    owner: 'Filatrix 增材材料有限公司',
    parentDepartment: '',
    status: '启用',
  });
  data.masterData.equipment.push({
    code: 'EQ-SMOKE-DEPARTMENT-REF',
    name: 'Smoke 部门引用设备',
    type: '辅助设备',
    serialNumber: 'SMOKE-DEPARTMENT-REF',
    owner: 'Smoke 资源部门',
    status: '启用',
    operatingState: '正常',
  });
  writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);

  const department = await readJson({
    name: 'department business-resource reference source',
    path: '/master-data/departments/DEP-SMOKE-RESOURCE',
  });
  const blocked = await writeJson({
    name: 'department with active equipment rejects disable',
    path: '/master-data/departments/DEP-SMOKE-RESOURCE',
    status: 400,
    body: { ...department.record, status: '停用' },
  });
  if (!String(blocked.error || '').includes('1 个设备')) {
    throw new Error('department business-resource guard returned an unclear error');
  }
});
results.push('department active warehouse, equipment, and line reference guards: ok');

await withDataFileRollback(async () => {
  const employee = await readJson({ name: 'employee account projection source', path: '/master-data/employees/EMP-LM' });
  if (employee.record?.linkedAccount !== 'sales01' || employee.record?.linkedAccountStatus !== '启用') {
    throw new Error(`employee account projection failed: ${JSON.stringify(employee)}`);
  }
  if ('type' in employee.record || 'employmentStatus' in employee.record || 'supervisor' in employee.record) {
    throw new Error(`employee response leaked removed fields: ${JSON.stringify(employee)}`);
  }

  const projected = await writeJson({
    name: 'employee removed fields are stripped and account relation is server projected',
    path: '/master-data/employees/EMP-LM',
    body: {
      ...employee.record,
      type: '外协人员',
      employmentStatus: '离职',
      supervisor: 'EMP-LM',
      linkedAccount: 'forged-account',
      linkedAccountStatus: '停用',
    },
  });
  if (projected.record?.linkedAccount !== 'sales01' || projected.record?.linkedAccountStatus !== '启用') {
    throw new Error(`employee account projection accepted client data: ${JSON.stringify(projected)}`);
  }
  if ('type' in projected.record || 'employmentStatus' in projected.record || 'supervisor' in projected.record) {
    throw new Error(`employee write persisted removed fields: ${JSON.stringify(projected)}`);
  }
});
results.push('employee concise field boundary, business usage, and account projection guards: ok');

await withDataFileRollback(async () => {
  const company = await readJson({ name: 'company reference source', path: '/master-data/company/COM-FILATRIX' });
  if (
    company.record?.englishName !== 'Filatrix Additive Materials Co., Ltd.'
    || company.record?.englishAddress !== 'No. 1688 Jiangnan Avenue, Binjiang District, Hangzhou, Zhejiang, China'
  ) {
    throw new Error(`company bilingual facts are missing: ${JSON.stringify(company)}`);
  }

  const renameResponse = await writeJson({
    name: 'referenced company rejects rename',
    path: '/master-data/company/COM-FILATRIX',
    status: 400,
    body: { ...company.record, name: 'Filatrix 新主体有限公司' },
  });
  if (!String(renameResponse.error || '').includes('不能直接改名')) {
    throw new Error('company rename guard returned an unclear error');
  }

  const stopResponse = await writeJson({
    name: 'company with active departments and warehouses rejects disable',
    path: '/master-data/company/COM-FILATRIX',
    status: 400,
    body: { ...company.record, status: '停用' },
  });
  if (!String(stopResponse.error || '').includes('启用部门') || !String(stopResponse.error || '').includes('启用仓库')) {
    throw new Error('company disable guard returned an unclear error');
  }

  const invalidTaxRate = await writeJson({
    name: 'company rejects invalid tax rate',
    path: '/master-data/company/COM-FILATRIX',
    status: 400,
    body: { ...company.record, secondary: '101%' },
  });
  if (!String(invalidTaxRate.error || '').includes('0% 到 100%')) {
    throw new Error('company tax-rate guard returned an unclear error');
  }

  const duplicateTax = await writeJson({
    name: 'company rejects duplicate tax identity',
    path: '/master-data/company',
    method: 'POST',
    status: 400,
    body: { ...company.record, code: '系统自动生成', name: 'Smoke 重复税号公司' },
  });
  if (!String(duplicateTax.error || '').includes('已存在')) {
    throw new Error('company unique legal identity guard returned an unclear error');
  }

  const created = await writeJson({
    name: 'company normalizes bilingual, fiscal, and website facts',
    path: '/master-data/company',
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成', name: 'Smoke 新公司', type: '分支机构', primary: 'Smoke',
      taxNumber: '91330108MA2SMOK001', secondary: '6', website: 'smoke.filatrix.example',
      englishName: '  Smoke New Company Ltd.  ',
      address: '  浙江省杭州市滨江区测试路 1 号  ',
      englishAddress: '  No. 1 Test Road, Hangzhou, Zhejiang, China  ',
      invoiceTitle: '', status: '启用', seal: 9,
    },
  });
  if (
    created.record?.invoiceTitle !== 'Smoke 新公司'
    || created.record?.secondary !== '6%'
    || created.record?.website !== 'https://smoke.filatrix.example'
    || created.record?.englishName !== 'Smoke New Company Ltd.'
    || created.record?.address !== '浙江省杭州市滨江区测试路 1 号'
    || created.record?.englishAddress !== 'No. 1 Test Road, Hangzhou, Zhejiang, China'
    || created.record?.seal !== 3
  ) {
    throw new Error(`company normalization failed: ${JSON.stringify(created)}`);
  }
});
results.push('company bilingual facts, legal identity, fiscal defaults, and reference guards: ok');

await withDataFileRollback(async () => {
  const asset = await readJson({ name: 'equipment concise source', path: '/master-data/equipment/EQ-DIA-01' });
  const removedEquipmentFields = ['type', 'manager', 'operatingState', 'maintenanceCycleWeeks', 'sourcePurchase'];
  if (removedEquipmentFields.some((key) => key in (asset.record || {}))) {
    throw new Error(`equipment response leaked removed fields: ${JSON.stringify(asset)}`);
  }
  const projected = await writeJson({
    name: 'equipment removed fields are stripped',
    path: '/master-data/equipment/EQ-DIA-01',
    body: {
      ...asset.record,
      type: '生产资产',
      manager: '周宁',
      operatingState: '维修中',
      maintenanceCycleWeeks: 2,
    },
  });
  if (removedEquipmentFields.some((key) => key in (projected.record || {}))) {
    throw new Error(`equipment write persisted removed fields: ${JSON.stringify(projected)}`);
  }

  const duplicateSerial = await writeJson({
    name: 'equipment rejects duplicate serial number',
    path: '/master-data/equipment',
    method: 'POST',
    status: 400,
    body: {
      ...asset.record,
      code: '系统自动生成',
      name: 'Smoke 重复序列号设备',
      sourcePurchase: '',
    },
  });
  if (!String(duplicateSerial.error || '').includes('出厂编号已存在')) {
    throw new Error('equipment duplicate serial guard returned an unclear error');
  }

  const invalidDepartment = await writeJson({
    name: 'equipment requires an active department',
    path: '/master-data/equipment',
    method: 'POST',
    status: 400,
    body: {
      ...asset.record,
      code: '系统自动生成',
      name: 'Smoke 错误部门设备',
      serialNumber: 'SMOKE-EQ-WRONG-DEPARTMENT',
      owner: '不存在部门',
      sourcePurchase: '',
    },
  });
  if (!String(invalidDepartment.error || '').includes('有效且启用的部门')) {
    throw new Error('equipment department guard returned an unclear error');
  }

  const created = await writeJson({
    name: 'equipment creates as an independent production resource',
    path: '/master-data/equipment',
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: '自动贴标机',
      type: '生产设备',
      brand: 'Smoke',
      model: 'AL-01',
      spec: '适配 1kg 彩盒',
      serialNumber: 'SMOKE-ASSET-PO-001',
      operatingState: '维修中',
      primary: '包装车间',
      owner: '生产管理部',
      manager: '周宁',
      maintenanceCycleWeeks: 4,
      startDate: '2026-07-01',
      sourcePurchase: 'RETIRED-ASSET-PURCHASE-LINK',
      status: '启用',
      note: 'Smoke 独立生产设备登记。',
    },
  });
  if (removedEquipmentFields.some((key) => key in (created.record || {}))) {
    throw new Error(`equipment retained a retired asset-ledger field: ${JSON.stringify(created)}`);
  }
});
results.push('equipment concise identity, department, and independent resource boundary: ok');

await withDataFileRollback(async () => {
  const removedProductionLineFields = ['manager', 'operatingState', 'primary', 'secondary'];
  const line = await readJson({ name: 'production-line concise source', path: '/master-data/productionLines/LINE-PLA-01' });
  if (removedProductionLineFields.some((key) => key in (line.record || {}))) {
    throw new Error(`production-line legacy fields remain on read: ${JSON.stringify(line.record)}`);
  }
  const projected = await writeJson({
    name: 'production-line legacy fields are stripped',
    path: '/master-data/productionLines/LINE-PLA-01',
    body: {
      ...line.record,
      manager: '周宁',
      operatingState: '维修中',
      primary: '伪造位置',
      secondary: '伪造范围',
    },
  });
  if (removedProductionLineFields.some((key) => key in (projected.record || {}))) {
    throw new Error(`production-line accepted legacy fields: ${JSON.stringify(projected)}`);
  }

  const invalidDepartment = await writeJson({
    name: 'production-line must belong to active department',
    path: '/master-data/productionLines',
    method: 'POST',
    status: 400,
    body: {
      ...line.record,
      code: '系统自动生成',
      name: 'Smoke 错误部门产线',
      owner: '不存在部门',
    },
  });
  if (!String(invalidDepartment.error || '').includes('有效且启用的部门')) {
    throw new Error('production-line department guard returned an unclear error');
  }

  const invalidCapacityUnit = await writeJson({
    name: 'production-line rejects incompatible capacity unit',
    path: '/master-data/productionLines',
    method: 'POST',
    status: 400,
    body: {
      ...line.record,
      code: '系统自动生成',
      name: 'Smoke 错误产能产线',
      type: '挤出产线',
      capacityUnit: '卷/班',
    },
  });
  if (!String(invalidCapacityUnit.error || '').includes('统一使用 kg/小时')) {
    throw new Error('production-line capacity-unit guard returned an unclear error');
  }

  const created = await writeJson({
    name: 'create valid rewind production line',
    path: '/master-data/productionLines',
    method: 'POST',
    status: 201,
    body: {
      code: '系统自动生成',
      name: 'Smoke 二号复绕线',
      type: '复绕产线',
      workshop: '复绕车间',
      capacityValue: 320,
      capacityUnit: '卷/班',
      processScope: '大盘半成品复绕为 1kg 小盘成品',
      manager: '周宁',
      operatingState: '维修中',
      primary: '伪造位置',
      secondary: '伪造范围',
      owner: '生产管理部',
      status: '启用',
      note: 'Smoke 复绕产线。',
    },
  });
  if (
    created.record?.type !== '复绕产线'
    || removedProductionLineFields.some((key) => key in (created.record || {}))
  ) {
    throw new Error(`production-line normalization failed: ${JSON.stringify(created)}`);
  }

  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const executionCard = data.production?.executionCards?.[0];
  if (!executionCard) throw new Error('production-line active-job guard smoke: execution card missing');
  executionCard.operationJobs = [
    ...(Array.isArray(executionCard.operationJobs) ? executionCard.operationJobs : []),
    {
      code: 'OP-SMOKE-LINE-LOCK',
      operationType: '挤出生产',
      assignedLine: 'PLA 一号挤出线',
      recommendedLine: 'PLA 一号挤出线',
      status: '执行中',
    },
  ];
  writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);
  const blocked = await writeJson({
    name: 'production-line with active operation rejects disable',
    path: '/master-data/productionLines/LINE-PLA-01',
    status: 400,
    body: { ...projected.record, status: '停用' },
  });
  if (!String(blocked.error || '').includes('未结束设备作业')) {
    throw new Error('production-line active-job guard returned an unclear error');
  }
});
results.push('production-line identity, capacity, department, concise-field, and active-job guards: ok');

await withDataFileRollback(async () => {
  for (const check of permissionChecks) {
    const data = await readJson(check);
    const count = itemCount(data);
    const ok = check.expect ? check.expect(data) : !check.expectItems || count > 0;

    if (!ok) {
      throw new Error(`${check.name}: unexpected response`);
    }

    results.push(`${check.name}: ok${check.status === 403 ? ' (403)' : check.expectItems ? ` (${count})` : ''}`);
  }

  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const salesAccount = data.system?.accounts?.find((row) => row.code === 'ACC-SALES');
  if (!salesAccount) throw new Error('account display-name smoke: sales account missing');
  data.system.accounts.push({
    ...salesAccount,
    code: 'ACC-SMOKE-DISPLAY',
    username: 'smoke-display',
    name: 'Smoke Sales Display',
  });
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  await readJson({
    name: 'account display name cannot be used as account header',
    path: '/sales/quotes',
    account: 'Smoke Sales Display',
    status: 403,
  });
  results.push('account display name cannot be used as account header: ok (403)');
});

await withDataFileRollback(async () => {
  const guardedSystemWrites = [
    { name: 'sales cannot create system account config', path: '/system/accounts', method: 'POST' },
    { name: 'sales cannot update system account config', path: '/system/accounts/ACC-SALES' },
    { name: 'sales cannot create system role config', path: '/system/roles', method: 'POST' },
    { name: 'sales cannot update system role config', path: '/system/roles/ROLE-SALES' },
    { name: 'sales cannot create system permission config', path: '/system/permissions', method: 'POST' },
    { name: 'sales cannot update system permission config', path: '/system/permissions/PERM-SALES-EDIT' },
    { name: 'sales cannot create system menu config', path: '/system/menus', method: 'POST' },
    { name: 'sales cannot update system menu config', path: '/system/menus/MENU-SALES-ORDERS' },
    { name: 'sales cannot create system naming config', path: '/system/naming-rules', method: 'POST' },
    { name: 'sales cannot update system naming config', path: '/system/naming-rules/RULE-SO' },
    { name: 'sales cannot create system notification config', path: '/system/notifications', method: 'POST' },
    { name: 'sales cannot update system notification config', path: '/system/notifications/NOTICE-OUTBOUND-SUBMITTED' },
    { name: 'sales cannot create system app config', path: '/system/apps', method: 'POST' },
    { name: 'sales cannot update system app config', path: '/system/apps/APP-ERP-WEB' },
    { name: 'sales cannot check system app health', path: '/system/apps/APP-ERP-WEB/check-health', method: 'POST' },
    { name: 'sales cannot create system mcp tool config', path: '/system/mcp-tools', method: 'POST' },
    { name: 'sales cannot update system mcp tool config', path: '/system/mcp-tools/MCP-BROWSER' },
    { name: 'sales cannot record mcp tool verification', path: '/system/mcp-tools/MCP-BROWSER/verify', method: 'POST' },
  ];

  for (const check of guardedSystemWrites) {
    await writeJson({
      ...check,
      account: 'ACC-SALES',
      status: 403,
      body: {
        code: 'SMOKE-SYSTEM-WRITE-DENIED',
        name: 'Smoke denied system write',
        status: '启用',
        description: 'This payload should be rejected before system config validation.',
      },
    });
    results.push(`${check.name}: ok (403)`);
  }
});

await withDataFileRollback(async () => {
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const salesRole = data.system?.roles?.find((row) => row.code === 'ROLE-SALES');
  if (!salesRole) throw new Error('historical permission smoke: sales role missing');
  salesRole.permissions = 'PERM-SALES-APPROVE';
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  const salesSession = await readJson({
    name: 'historical operation-only role does not grant operation permission',
    path: '/session/current',
    account: 'ACC-SALES',
    status: 200,
  });
  if (salesSession.permissions?.includes('PERM-SALES-APPROVE') || salesSession.permissions?.includes('PERM-SALES-EDIT')) {
    throw new Error('historical permission smoke: operation-only role leaked an effective sales permission');
  }

  const stopOperationPermission = await writeJson({
    name: 'historical operation-only role still blocks permission stop',
    path: '/system/permissions/PERM-SALES-APPROVE',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'PERM-SALES-APPROVE',
      name: '销售单据确认',
      owner: '系统管理员',
      status: '停用',
      description: 'Smoke 尝试停用仍被历史角色原始引用的操作权限。',
    },
  });
  if (!String(stopOperationPermission.error || '').includes('启用角色')) {
    throw new Error('historical permission smoke: direct role reference should block permission stop');
  }
});
results.push('historical operation-only role does not grant operation permission: ok');
results.push('historical operation-only role still blocks permission stop: ok (400)');

await withDataFileRollback(async () => {
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const warehouseRole = data.system?.roles?.find((row) => row.code === 'ROLE-WAREHOUSE');
  const warehouseAccount = data.system?.accounts?.find((row) => row.code === 'ACC-WAREHOUSE');
  if (!warehouseRole || !warehouseAccount) throw new Error('historical disabled role smoke: warehouse rows missing');
  warehouseRole.status = '停用';
  warehouseAccount.roles = 'ROLE-WAREHOUSE';
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  const warehouseSession = await readJson({
    name: 'historical disabled role is excluded from session context',
    path: '/session/current',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  if (
    warehouseSession.roleCodes?.includes('ROLE-WAREHOUSE') ||
    warehouseSession.roles?.includes('仓库主管') ||
    warehouseSession.permissions?.includes('PERM-WAREHOUSE-VIEW') ||
    warehouseSession.permissions?.includes('PERM-WAREHOUSE-POST')
  ) {
    throw new Error('historical disabled role smoke: disabled role leaked into session context');
  }

  const requestSeed = `SR-SMOKE-DISABLED-ROLE-${Date.now().toString(36).toUpperCase()}`;
  const created = await writeJson({
    name: 'create outbound request for disabled role notification smoke',
    path: '/sales/outbound-requests',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: requestSeed,
      sourceOrder: `SO-${requestSeed}`,
      customerCode: 'CUS-00001',
      customer: 'Smoke 客户',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', qty: '1 卷', requestQty: '1 卷' }],
      applicant: '李明',
      expectedDate: '2026-07-01',
      deliveryMethod: '送货到厂',
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      address: 'Smoke 地址',
      remark: 'Smoke 停用角色通知验证临时单据。',
      attachments: [],
    },
  });
  const requestCode = created.request?.code;
  if (!requestCode) throw new Error('historical disabled role smoke: outbound request was not created');

  await writeJson({
    name: 'submit outbound request with disabled warehouse role',
    path: `/sales/outbound-requests/${encodeURIComponent(requestCode)}/submit`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
  });

  const warehouseInbox = await readJson({
    name: 'warehouse inbox after disabled historical role notification submit',
    path: '/notifications?limit=100',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  if (warehouseInbox.items?.some((item) => item.sourceDoc === requestCode)) {
    throw new Error('historical disabled role smoke: disabled role still received notification');
  }
});
results.push('historical disabled role is excluded from session context: ok');
results.push('disabled historical role does not receive role notifications: ok');

await withDataFileRollback(async () => {
  const adminMenus = await readJson({
    name: 'menu disable source row',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesPriceMenu = adminMenus.items.find((row) => row.code === 'MENU-SALES-PRICES');
  if (!salesPriceMenu) throw new Error('menu disable source row: MENU-SALES-PRICES missing');
  const salesOrdersMenu = adminMenus.items.find((row) => row.code === 'MENU-SALES-ORDERS');
  if (!salesOrdersMenu) throw new Error('menu disable source row: MENU-SALES-ORDERS missing');

  await writeJson({
    name: 'disable sales price menu',
    path: '/system/menus/MENU-SALES-PRICES',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesPriceMenu, status: '停用' },
  });

  const salesMenus = await readJson({
    name: 'disabled menu is removed from scoped navigation',
    path: '/system/menus',
    account: 'ACC-SALES',
    status: 200,
  });
  const visibleCodes = new Set(salesMenus.items.map((row) => row.code));
  if (!visibleCodes.has('MENU-SALES') || !visibleCodes.has('MENU-SALES-ORDERS') || visibleCodes.has('MENU-SALES-PRICES')) {
    throw new Error('disabled menu is removed from scoped navigation: unexpected menu visibility');
  }

  await writeJson({
    name: 'disable sales orders menu',
    path: '/system/menus/MENU-SALES-ORDERS',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesOrdersMenu, status: '停用' },
  });

  await readJson({
    name: 'disabled child menu blocks direct business api',
    path: '/sales/orders',
    account: 'ACC-SALES',
    status: 403,
  });
});
results.push('disabled menu is removed from scoped navigation: ok');
results.push('disabled child menu blocks direct business api: ok (403)');

await withDataFileRollback(async () => {
  const adminMenus = await readJson({
    name: 'shared parent path menu disable source row',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesQuotesMenu = adminMenus.items.find((row) => row.code === 'MENU-SALES-QUOTES');
  if (!salesQuotesMenu) throw new Error('shared parent path menu disable source row: MENU-SALES-QUOTES missing');

  await writeJson({
    name: 'disable sales quotes menu with shared parent path',
    path: '/system/menus/MENU-SALES-QUOTES',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesQuotesMenu, status: '停用' },
  });

  await readJson({
    name: 'disabled first child menu blocks shared parent path',
    path: '/sales/quotes',
    account: 'ACC-SALES',
    status: 403,
  });
});
results.push('disabled first child menu blocks shared parent path: ok (403)');

await withDataFileRollback(async () => {
  const adminMenus = await readJson({
    name: 'menu parent disable source row',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesMenu = adminMenus.items.find((row) => row.code === 'MENU-SALES');
  const activeSalesChildren = adminMenus.items.filter((row) => row.parentCode === 'MENU-SALES' && row.status !== '停用');
  if (!salesMenu) throw new Error('menu parent disable source row: MENU-SALES missing');

  for (const childMenu of deepestMenusFirst(activeSalesChildren, adminMenus.items)) {
    await writeJson({
      name: `disable sales child menu ${childMenu.code}`,
      path: `/system/menus/${encodeURIComponent(childMenu.code)}`,
      account: 'ACC-ZHANGSAN',
      status: 200,
      body: { ...childMenu, status: '停用' },
    });
  }

  await writeJson({
    name: 'disable sales parent menu',
    path: '/system/menus/MENU-SALES',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesMenu, status: '停用' },
  });

  const salesMenus = await readJson({
    name: 'disabled parent menu hides child menus',
    path: '/system/menus',
    account: 'ACC-SALES',
    status: 200,
  });
  if (salesMenus.items?.some((row) => row.code === 'MENU-SALES' || row.parentCode === 'MENU-SALES')) {
    throw new Error('disabled parent menu hides child menus: child menu remained visible');
  }

  await readJson({
    name: 'disabled parent menu blocks child business api',
    path: '/sales/quotes',
    account: 'ACC-SALES',
    status: 403,
  });
});
results.push('disabled parent menu hides child menus: ok');
results.push('disabled parent menu blocks child business api: ok (403)');

await withDataFileRollback(async () => {
  const adminMenus = await readJson({
    name: 'system menu disable source row',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const systemLogsMenu = adminMenus.items.find((row) => row.code === 'MENU-SYSTEM-LOGS');
  if (!systemLogsMenu) throw new Error('system menu disable source row: MENU-SYSTEM-LOGS missing');

  await writeJson({
    name: 'disable system logs menu',
    path: '/system/menus/MENU-SYSTEM-LOGS',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...systemLogsMenu, status: '停用' },
  });

  await readJson({
    name: 'disabled system child menu blocks direct system api',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 403,
  });
});
results.push('disabled system child menu blocks direct system api: ok (403)');

await withDataFileRollback(async () => {
  const adminMenus = await readJson({
    name: 'system tool menus disable source rows',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const systemAppsMenu = adminMenus.items.find((row) => row.code === 'MENU-SYSTEM-APPS');
  const systemMcpMenu = adminMenus.items.find((row) => row.code === 'MENU-SYSTEM-MCP-TOOLS');
  if (!systemAppsMenu || !systemMcpMenu) {
    throw new Error('system tool menu disable source rows: apps or mcp menu missing');
  }

  await writeJson({
    name: 'disable system apps menu',
    path: '/system/menus/MENU-SYSTEM-APPS',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...systemAppsMenu, status: '停用' },
  });

  await writeJson({
    name: 'disabled system apps menu blocks health check action',
    path: '/system/apps/APP-ERP-WEB/check-health',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 403,
    body: {},
  });

  await writeJson({
    name: 'disable system mcp menu',
    path: '/system/menus/MENU-SYSTEM-MCP-TOOLS',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...systemMcpMenu, status: '停用' },
  });

  await writeJson({
    name: 'disabled system mcp menu blocks verification action',
    path: '/system/mcp-tools/MCP-BROWSER/verify',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 403,
    body: {},
  });
});
results.push('disabled system apps menu blocks health check action: ok (403)');
results.push('disabled system mcp menu blocks verification action: ok (403)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create temporary session system role',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-SESSION',
      name: 'Smoke 会话系统维护',
      owner: '系统管理员',
      status: '启用',
      permissions: 'PERM-SYSTEM-CONFIG',
      description: 'Smoke 临时会话系统维护角色。',
    },
  });

  await writeJson({
    name: 'password mode requires password system manager',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'ACC-SMOKE-FIRST-PASSWORD-SALES',
      name: 'Smoke 首个密码销售账号',
      username: 'smoke-first-password-sales',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SALES',
      passwordInput: 'Sales1234',
      passwordConfirm: 'Sales1234',
      description: 'Smoke 不允许首个密码账号没有系统配置维护权限。',
    },
  });

  await writeJson({
    name: 'non-system account cannot set first password',
    path: '/session/password',
    method: 'POST',
    account: 'ACC-SALES',
    status: 400,
    body: {
      currentPassword: '',
      passwordInput: 'Sales1234',
      passwordConfirm: 'Sales1234',
    },
  });

  await writeJson({
    name: 'create temporary password account',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-SESSION',
      name: 'Smoke 会话账号',
      username: 'smoke-session',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SMOKE-SESSION',
      passwordInput: 'Smoke1234',
      passwordConfirm: 'Smoke1234',
      description: 'Smoke 临时会话账号。',
    },
  });

  await writeJson({
    name: 'password login rejects account display name',
    path: '/session/login',
    method: 'POST',
    status: 401,
    body: {
      username: 'Smoke 会话账号',
      password: 'Smoke1234',
    },
  });

  await readJson({
    name: 'account header rejected when password login is required',
    path: '/session/current',
    account: 'ACC-SALES',
    status: 401,
  });

  await readJson({
    name: 'reference candidates require login in password mode',
    path: '/reference/customers?q=test&limit=3',
    status: 401,
  });

  await readJson({
    name: 'reference candidates ignore account header in password mode',
    path: '/reference/customers?q=test&limit=3',
    account: 'ACC-ZHANGSAN',
    status: 401,
  });

  await readJson({
    name: 'notifications require login in password mode',
    path: '/notifications',
    status: 401,
  });

  await readJson({
    name: 'notifications ignore account header in password mode',
    path: '/notifications',
    account: 'ACC-ZHANGSAN',
    status: 401,
  });

  const unauthMenus = await readJson({
    name: 'system menus are empty before login in password mode',
    path: '/system/menus',
    status: 200,
  });
  if (unauthMenus.items?.length) {
    throw new Error('password session smoke: unauthenticated menus were visible in password mode');
  }

  const headerMenus = await readJson({
    name: 'system menus ignore account header in password mode',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  if (headerMenus.items?.some((row) => row.code === 'MENU-SYSTEM' || row.code === 'MENU-SALES')) {
    throw new Error('password session smoke: account header exposed menus in password mode');
  }

  const login = await writeJson({
    name: 'password login returns session token',
    path: '/session/login',
    method: 'POST',
    status: 200,
    body: {
      username: 'smoke-session',
      password: 'Smoke1234',
    },
  });
  if (!login.token) throw new Error('password session smoke: login did not return a token');

  const current = await readJson({
    name: 'bearer token can read current session',
    path: '/session/current',
    token: login.token,
    status: 200,
  });
  if (current.account?.code !== 'ACC-SMOKE-SESSION') {
    throw new Error('password session smoke: bearer token did not resolve the temporary account');
  }

  await readJson({
    name: 'system bearer token can read employee reference candidates',
    path: '/reference/employees?limit=3',
    token: login.token,
    status: 200,
    expectItems: true,
  });

  await readJson({
    name: 'system bearer token cannot read customer reference candidates',
    path: '/reference/customers?q=test&limit=3',
    token: login.token,
    status: 403,
  });

  const accounts = await readJson({
    name: 'bearer token can read system accounts',
    path: '/system/accounts',
    token: login.token,
    status: 200,
  });
  const account = accounts.items?.find((row) => row.code === 'ACC-SMOKE-SESSION');
  if (!account) throw new Error('password session smoke: temporary account was not readable');
  if (account.passwordSet !== true || account.passwordHash !== undefined || account.passwordSalt !== undefined) {
    throw new Error('password session smoke: created password account was not persisted as a sanitized account row');
  }

  await writeJson({
    name: 'active account without password cannot login in password mode',
    path: '/session/login',
    method: 'POST',
    status: 400,
    body: {
      username: 'sales01',
      password: 'Smoke1234',
    },
  });

  await writeJson({
    name: 'enabled account requires password in password login mode',
    path: '/system/accounts',
    method: 'POST',
    token: login.token,
    status: 400,
    body: {
      code: 'ACC-SMOKE-NO-PASSWORD',
      name: 'Smoke 未设密码账号',
      username: 'smoke-no-password',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SALES',
      description: 'Smoke 不允许启用无密码账号。',
    },
  });

  const passwordlessData = JSON.parse(readFileSync(dataFile, 'utf8'));
  passwordlessData.system = passwordlessData.system || {};
  passwordlessData.system.accounts = Array.isArray(passwordlessData.system.accounts)
    ? passwordlessData.system.accounts
    : [];
  passwordlessData.system.accounts.push({
    code: 'ACC-SMOKE-PASSWORDLESS-LEGACY',
    name: 'Smoke 历史无密码账号',
    username: 'smoke-passwordless-legacy',
    owner: '系统管理员',
    status: '启用',
    roles: 'ROLE-SALES',
    description: 'Smoke 模拟旧数据里残留的启用无密码账号。',
  });
  writeFileSync(dataFile, JSON.stringify(passwordlessData, null, 2));

  await writeJson({
    name: 'system manager cannot impersonate passwordless account in password mode',
    path: '/session/impersonate',
    method: 'POST',
    token: login.token,
    status: 400,
    body: {
      accountCode: 'ACC-SMOKE-PASSWORDLESS-LEGACY',
    },
  });

  await writeJson({
    name: 'enabled account requires at least one role',
    path: '/system/accounts',
    method: 'POST',
    token: login.token,
    status: 400,
    body: {
      code: 'ACC-SMOKE-NO-ROLE',
      name: 'Smoke 无角色账号',
      username: 'smoke-no-role',
      owner: '系统管理员',
      status: '启用',
      roles: '',
      passwordInput: 'NoRole1234',
      passwordConfirm: 'NoRole1234',
      description: 'Smoke 不允许启用无角色账号。',
    },
  });

  await writeJson({
    name: 'enabled account requires display name or employee',
    path: '/system/accounts',
    method: 'POST',
    token: login.token,
    status: 400,
    body: {
      code: 'ACC-SMOKE-NO-NAME',
      name: '',
      username: 'smoke-no-name',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SALES',
      passwordInput: 'NoName1234',
      passwordConfirm: 'NoName1234',
      description: 'Smoke 不允许启用无姓名且未关联员工的账号。',
    },
  });

  const namedAccount = await writeJson({
    name: 'named account can be created without linked employee',
    path: '/system/accounts',
    method: 'POST',
    token: login.token,
    status: 201,
    body: {
      code: 'ACC-SMOKE-NAMED',
      name: 'Smoke 独立账号',
      username: 'smoke-named',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SALES',
      passwordInput: 'Named1234',
      passwordConfirm: 'Named1234',
      lastLogin: '1999-01-01 00:00',
      description: 'Smoke 允许创建不关联员工但有姓名的独立账号。',
    },
  });
  if (namedAccount.record?.name !== 'Smoke 独立账号' || namedAccount.record?.employeeCode || namedAccount.record?.lastLogin === '1999-01-01 00:00') {
    throw new Error('account display name smoke: independent named account was not persisted correctly');
  }

  await writeJson({
    name: 'enabled independent account cannot clear display name',
    path: '/system/accounts/ACC-SMOKE-NAMED',
    method: 'PUT',
    token: login.token,
    status: 400,
    body: {
      ...namedAccount.record,
      name: '',
    },
  });

  const savedNamedAccount = await writeJson({
    name: 'manual account save cannot forge last login',
    path: '/system/accounts/ACC-SMOKE-NAMED',
    method: 'PUT',
    token: login.token,
    status: 200,
    body: {
      ...namedAccount.record,
      lastLogin: '1999-01-01 00:00',
      description: 'Smoke verifies last login is system-managed.',
    },
  });
  if (savedNamedAccount.record?.lastLogin === '1999-01-01 00:00') {
    throw new Error('account last login smoke: ordinary account save forged last login');
  }

  await writeJson({
    name: 'bearer token can create secondary password manager',
    path: '/system/accounts',
    method: 'POST',
    token: login.token,
    status: 201,
    body: {
      code: 'ACC-SMOKE-SESSION-MANAGER',
      name: 'Smoke 会话管理员',
      username: 'smoke-session-manager',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SMOKE-SESSION',
      passwordInput: 'Manager1234',
      passwordConfirm: 'Manager1234',
      description: 'Smoke 临时会话管理账号。',
    },
  });

  const managerLogin = await writeJson({
    name: 'secondary password manager can login',
    path: '/session/login',
    method: 'POST',
    status: 200,
    body: {
      username: 'smoke-session-manager',
      password: 'Manager1234',
    },
  });
  if (!managerLogin.token) throw new Error('password session smoke: manager login did not return a token');

  await writeJson({
    name: 'bearer token can create secondary sales account',
    path: '/system/accounts',
    method: 'POST',
    token: login.token,
    status: 201,
    body: {
      code: 'ACC-SMOKE-SESSION-SALES',
      name: 'Smoke 会话销售',
      username: 'smoke-session-sales',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SALES',
      passwordInput: 'Sales1234',
      passwordConfirm: 'Sales1234',
      description: 'Smoke 临时销售登录账号。',
    },
  });

  const salesLogin = await writeJson({
    name: 'secondary sales account can login',
    path: '/session/login',
    method: 'POST',
    status: 200,
    body: {
      username: 'smoke-session-sales',
      password: 'Sales1234',
    },
  });
  if (!salesLogin.token) throw new Error('password session smoke: sales login did not return a token');

  await writeJson({
    name: 'sales can change own password',
    path: '/session/password',
    method: 'POST',
    token: salesLogin.token,
    status: 200,
    body: {
      currentPassword: 'Sales1234',
      passwordInput: 'Sales5678',
      passwordConfirm: 'Sales5678',
    },
  });

  await readJson({
    name: 'old sales bearer token rejected after own password change',
    path: '/session/current',
    token: salesLogin.token,
    status: 401,
  });

  await writeJson({
    name: 'old sales password rejected after own password change',
    path: '/session/login',
    method: 'POST',
    status: 401,
    body: {
      username: 'smoke-session-sales',
      password: 'Sales1234',
    },
  });

  const salesRelogin = await writeJson({
    name: 'sales can login with changed own password',
    path: '/session/login',
    method: 'POST',
    status: 200,
    body: {
      username: 'smoke-session-sales',
      password: 'Sales5678',
    },
  });
  if (!salesRelogin.token) throw new Error('password session smoke: sales relogin did not return a token');

  await writeJson({
    name: 'sales bearer token cannot impersonate admin',
    path: '/session/impersonate',
    method: 'POST',
    token: salesRelogin.token,
    status: 403,
    body: {
      accountCode: 'ACC-ZHANGSAN',
    },
  });

  await writeJson({
    name: 'password update clears old bearer session',
    path: '/system/accounts/ACC-SMOKE-SESSION',
    method: 'PUT',
    token: login.token,
    status: 200,
    body: {
      ...account,
      passwordInput: 'Smoke5678',
      passwordConfirm: 'Smoke5678',
    },
  });

  await readJson({
    name: 'old bearer token rejected after password update',
    path: '/session/current',
    token: login.token,
    status: 401,
  });

  const relogin = await writeJson({
    name: 'password login after password update returns session token',
    path: '/session/login',
    method: 'POST',
    status: 200,
    body: {
      username: 'smoke-session',
      password: 'Smoke5678',
    },
  });
  if (!relogin.token) throw new Error('password session smoke: relogin did not return a token');

  await writeJson({
    name: 'old password rejected after password update',
    path: '/session/login',
    method: 'POST',
    status: 401,
    body: {
      username: 'smoke-session',
      password: 'Smoke1234',
    },
  });

  await writeJson({
    name: 'disable account clears bearer session',
    path: '/system/accounts/ACC-SMOKE-SESSION',
    method: 'PUT',
    token: managerLogin.token,
    status: 200,
    body: {
      ...account,
      status: '停用',
    },
  });

  await readJson({
    name: 'old bearer token rejected after account disable',
    path: '/session/current',
    token: relogin.token,
    status: 401,
  });

  await writeJson({
    name: 'disabled account cannot login',
    path: '/session/login',
    method: 'POST',
    status: 401,
    body: {
      username: 'smoke-session',
      password: 'Smoke5678',
    },
  });
});
results.push('password login disables account header bypass: ok (401)');
results.push('reference candidates require login in password mode: ok (401)');
results.push('reference candidates ignore account header in password mode: ok (401)');
results.push('notifications require login in password mode: ok (401)');
results.push('notifications ignore account header in password mode: ok (401)');
results.push('password mode requires password system manager: ok (400)');
results.push('non-system account cannot set first password: ok (400)');
results.push('password login rejects account display name: ok (401)');
results.push('system menus are empty before login in password mode: ok');
results.push('system menus ignore account header in password mode: ok');
results.push('system bearer token can read employee reference candidates: ok');
results.push('system bearer token cannot read customer reference candidates: ok (403)');
results.push('password session token works: ok');
results.push('system config post persists password account safely: ok');
results.push('non-system account cannot impersonate admin: ok (403)');
results.push('system manager cannot impersonate passwordless account in password mode: ok (400)');
results.push('non-system account can change own password: ok');
results.push('active account without password cannot login in password mode: ok (400)');
results.push('enabled account requires password in password login mode: ok (400)');
results.push('enabled account requires at least one role: ok (400)');
results.push('enabled account requires display name or employee: ok (400)');
results.push('named account can be created without linked employee: ok');
results.push('enabled independent account cannot clear display name: ok (400)');
results.push('manual account save cannot forge last login: ok');
results.push('password update revokes old session token: ok (401)');
results.push('password update rejects old password: ok (401)');
results.push('account disable revokes old session token: ok (401)');
results.push('disabled account cannot login: ok (401)');

await withDataFileRollback(async () => {
  const deniedRead = await readJson({
    name: 'denied read writes audit log',
    path: '/warehouse/inventory',
    account: 'ACC-SALES',
    status: 403,
  });
  if (!String(deniedRead.error || '').includes('仓库查看（PERM-WAREHOUSE-VIEW）')) {
    throw new Error('permission audit smoke: denied read message should include permission label');
  }

  const logs = await readJson({
    name: 'audit log after denied read',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const auditLog = logs.items?.find(
    (row) =>
      row.name === '权限拒绝' &&
      row.target === '仓库查看（PERM-WAREHOUSE-VIEW）' &&
      row.sourceAccount === 'ACC-SALES' &&
      String(row.remark || '').includes('/warehouse/inventory'),
  );
  if (!auditLog) throw new Error('permission audit smoke: denied read was not logged');
});
results.push('permission denied read is audited: ok');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'system audit logs cannot be created manually',
    path: '/system/logs',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 405,
    body: {
      code: 'LOG-SMOKE-MANUAL',
      name: 'Smoke 手工日志',
      status: '正常',
      target: 'Smoke',
      remark: 'Smoke should be rejected.',
    },
  });

  await writeJson({
    name: 'system audit logs cannot be edited manually',
    path: '/system/logs/LOG-BOOTSTRAP',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 405,
    body: {
      name: 'Smoke 篡改日志',
      remark: 'Smoke should be rejected.',
    },
  });
});
results.push('system audit logs cannot be created manually: ok (405)');
results.push('system audit logs cannot be edited manually: ok (405)');

await withDataFileRollback(async () => {
  const namingRules = await readJson({
    name: 'system naming rules for update audit log',
    path: '/system/naming-rules',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesOrderRule = namingRules.items?.find((row) => row.code === 'RULE-SO');
  if (!salesOrderRule) throw new Error('system config update audit smoke: RULE-SO missing');

  await writeJson({
    name: 'update naming rule for audit log',
    path: '/system/naming-rules/RULE-SO',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...salesOrderRule,
      description: `${salesOrderRule.description || '销售订单编码规则'} Smoke audit update`,
    },
  });

  const logs = await readJson({
    name: 'system log after config update',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const updateLog = logs.items?.find(
    (row) =>
      row.name === '更新编码规则' &&
      row.target === 'RULE-SO' &&
      row.sourceAccount === 'ACC-ZHANGSAN' &&
      String(row.remark || '').includes('已更新为 启用') &&
      String(row.remark || '').includes('变更：说明：'),
  );
  if (!updateLog) throw new Error('system config update audit smoke: update log was not recorded');
  const legacyGenericLog = logs.items?.find(
    (row) =>
      row.name === '更新系统配置' &&
      /^(ACC|PERM|ROLE|MENU|RULE|NOTICE|APP|MCP)-/.test(String(row.target || '').toUpperCase()),
  );
  if (legacyGenericLog) {
    throw new Error('system config update audit smoke: legacy generic log action should be normalized by target type');
  }
});
results.push('system config updates are audited: ok');
results.push('legacy system config log actions are normalized: ok');

await withDataFileRollback(async () => {
  const code = `SO-SMOKE-AUDIT-${Date.now().toString(36).toUpperCase()}`;
  const created = await writeJson({
    name: 'create sales order for business audit log',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code,
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      date: '2026-07-29',
      delivery: '2026-08-15',
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      plannedShipDate: '2026-08-14',
      shipContact: 'Smoke 收货人',
      shipPhone: '138-0000-0998',
      shipAddress: 'Smoke 收货地址',
      products: [{ materialCode: 'M-FG-PLA-175-MBK', name: 'PLA 1.75mm 哑光黑耗材 1kg', qty: '1', unitPrice: '1.00' }],
      owner: '李明',
    },
  });

  await writeJson({
    name: 'confirm sales order for business audit log',
    path: `/sales/orders/${encodeURIComponent(code)}/confirm`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
    body: { revision: created.order.revision },
  });

  const logs = await readJson({
    name: 'system log after sales order confirm',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const businessLog = logs.items?.find(
    (row) =>
      row.name === '确认销售订单' &&
      row.target === code &&
      row.sourceAccount === 'ACC-SALES' &&
      String(row.remark || '').includes('销售订单确认'),
  );
  if (!businessLog) throw new Error('business audit smoke: sales order confirm was not recorded');
});
results.push('business workflow actions are audited: ok');

await withDataFileRollback(async () => {
  const requestSeed = `SR-SMOKE-NOTIFY-${Date.now().toString(36).toUpperCase()}`;
  const created = await writeJson({
    name: 'create outbound request for notification smoke',
    path: '/sales/outbound-requests',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: requestSeed,
      sourceOrder: `SO-${requestSeed}`,
      customerCode: 'CUS-00001',
      customer: 'Smoke 客户',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', qty: '1 卷', requestQty: '1 卷' }],
      applicant: '李明',
      expectedDate: '2026-07-01',
      deliveryMethod: '送货到厂',
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      address: 'Smoke 地址',
      remark: 'Smoke 通知验证临时单据。',
      attachments: [],
    },
  });
  const requestCode = created.request?.code;
  if (!requestCode) throw new Error('notification smoke: outbound request was not created');

  const submitted = await writeJson({
    name: 'submit outbound request creates warehouse notification',
    path: `/sales/outbound-requests/${encodeURIComponent(requestCode)}/submit`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
  });
  const salesIssueCode = submitted.salesIssue?.code;
  if (!salesIssueCode) throw new Error('notification smoke: sales issue task was not generated');

  const inbox = await readJson({
    name: 'warehouse notification after outbound submit',
    path: '/notifications?limit=100',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const notification = inbox.items?.find(
    (item) => (
      item.sourceDoc === salesIssueCode
      && item.action === '交付追踪同步'
      && item.sourcePath === `/warehouse/sales-issues/${encodeURIComponent(salesIssueCode)}`
      && item.unread
    ),
  );
  if (!notification) throw new Error('notification smoke: warehouse sales issue notification was not created with an executable task path');

  const lateAccount = await writeJson({
    name: 'create late warehouse notification account',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-LATE-WAREHOUSE',
      name: 'Smoke 后加入仓库账号',
      username: `smoke-late-warehouse-${Date.now().toString(36)}`,
      roles: 'ROLE-WAREHOUSE',
      status: '启用',
      description: 'Smoke 验证历史通知只按生成时接收账号可见。',
    },
  });

  const lateAccountCode = lateAccount.record?.code;
  if (!lateAccountCode) throw new Error('notification smoke: late warehouse account code missing');
  const lateWarehouseInbox = await readJson({
    name: 'late warehouse account cannot see historical notification',
    path: '/notifications?limit=100',
    account: lateAccountCode,
    status: 200,
  });
  if (lateWarehouseInbox.items?.some((item) => item.sourceDoc === salesIssueCode)) {
    throw new Error('notification smoke: late role account saw historical notification');
  }

  await writeJson({
    name: 'warehouse can mark outbound notification read',
    path: `/notifications/${encodeURIComponent(notification.code)}/read`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const readInbox = await readJson({
    name: 'warehouse notification after mark read',
    path: '/notifications?limit=100',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const readNotification = readInbox.items?.find((item) => item.code === notification.code);
  if (!readNotification || readNotification.unread) throw new Error('notification smoke: mark read did not persist');
});
results.push('outbound submit creates warehouse notification: ok');
results.push('notification target account snapshot prevents late role visibility: ok');
results.push('warehouse can mark notification read: ok');

await withDataFileRollback(async () => {
  const requestSeed = `SR-SMOKE-NOTIFY-OFF-${Date.now().toString(36).toUpperCase()}`;
  const notifications = await readJson({
    name: 'notification rules before disable smoke',
    path: '/system/notifications',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const outboundNotification = notifications.items?.find((row) => row.code === 'NOTICE-OUTBOUND-SUBMITTED');
  if (!outboundNotification) throw new Error('notification disable smoke: outbound rule missing');

  await writeJson({
    name: 'disable outbound notification rule',
    path: '/system/notifications/NOTICE-OUTBOUND-SUBMITTED',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...outboundNotification, status: '停用' },
  });

  const created = await writeJson({
    name: 'create outbound request for disabled notification smoke',
    path: '/sales/outbound-requests',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: requestSeed,
      sourceOrder: `SO-${requestSeed}`,
      customerCode: 'CUS-00001',
      customer: 'Smoke 客户',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0888',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', qty: '1 卷', requestQty: '1 卷' }],
      applicant: '李明',
      expectedDate: '2026-07-01',
      deliveryMethod: '送货到厂',
      warehouseCode: 'WH-FG',
      warehouse: '成品仓',
      address: 'Smoke 地址',
      remark: 'Smoke 停用通知规则临时单据。',
      attachments: [],
    },
  });
  const requestCode = created.request?.code;
  if (!requestCode) throw new Error('disabled notification smoke: outbound request was not created');

  await writeJson({
    name: 'submit outbound request while notification rule disabled',
    path: `/sales/outbound-requests/${encodeURIComponent(requestCode)}/submit`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
  });

  const inbox = await readJson({
    name: 'warehouse inbox after disabled notification submit',
    path: '/notifications?limit=100',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  if (inbox.items?.some((item) => item.sourceDoc === requestCode)) {
    throw new Error('disabled notification smoke: disabled rule still created a notification');
  }
});
results.push('disabled notification rule suppresses outbound notification: ok');

await withDataFileRollback(async () => {
  const health = await writeJson({
    name: 'admin can check local app health',
    path: '/system/apps/APP-ERP-WEB/check-health',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  if (health.record?.healthStatus !== '正常' || health.result?.healthStatus !== '正常') {
    throw new Error('app health smoke: local app was not healthy');
  }
  if (!String(health.record?.healthTarget || '').includes('/api/health')) {
    throw new Error('app health smoke: health target was not recorded');
  }

  const savedHealthRecord = await writeJson({
    name: 'manual app save cannot forge health result',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...health.record,
      healthStatus: '异常',
      healthCheckedAt: '1999-01-01 00:00',
      healthMessage: '伪造健康检查结果',
      healthLatencyMs: 999999,
      healthTarget: 'http://example.com/fake-health',
      description: 'Smoke verifies health fields are system-managed.',
    },
  });
  if (
    savedHealthRecord.record?.healthStatus !== health.record.healthStatus ||
    savedHealthRecord.record?.healthCheckedAt !== health.record.healthCheckedAt ||
    savedHealthRecord.record?.healthMessage !== health.record.healthMessage ||
    savedHealthRecord.record?.healthTarget !== health.record.healthTarget
  ) {
    throw new Error('app health smoke: ordinary app save forged health fields');
  }

  await writeJson({
    name: 'sales cannot check app health',
    path: '/system/apps/APP-ERP-WEB/check-health',
    method: 'POST',
    account: 'ACC-SALES',
    status: 403,
  });

  await writeJson({
    name: 'enabled app cannot use unsupported deployment target',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      deployTarget: '未接通目标',
    },
  });

  await writeJson({
    name: 'enabled app requires health path',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      healthPath: '',
    },
  });

  await writeJson({
    name: 'enabled app requires data store',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      dataStore: '',
    },
  });

  await writeJson({
    name: 'enabled app rejects placeholder public url',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      publicUrl: 'http://<ECS 公网 IP>/',
    },
  });

  await writeJson({
    name: 'enabled app rejects invalid public url',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      publicUrl: 'erp-local',
    },
  });

  await writeJson({
    name: 'enabled app rejects invalid api base',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      apiBase: 'api local',
    },
  });

  await writeJson({
    name: 'enabled app rejects invalid health path',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...health.record,
      healthPath: 'ftp://127.0.0.1/health',
    },
  });

  await writeJson({
    name: 'admin can disable app config',
    path: '/system/apps/APP-ERP-WEB',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...health.record,
      status: '停用',
    },
  });

  await writeJson({
    name: 'disabled app cannot check health',
    path: '/system/apps/APP-ERP-WEB/check-health',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
  });

  const apps = await readJson({
    name: 'system apps for aliyun deployment plan',
    path: '/system/apps',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const aliyunPlan = apps.items?.find((row) => row.code === 'APP-ALIYUN-DEPLOY');
  if (!aliyunPlan) throw new Error('app health smoke: aliyun deployment plan missing');
  if (aliyunPlan.status !== '停用') {
    throw new Error('app health smoke: aliyun deployment plan should stay disabled until a real entry is configured');
  }

  await writeJson({
    name: 'system config status rejects normal/abnormal',
    path: '/system/apps/APP-ALIYUN-DEPLOY',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...aliyunPlan,
      status: '正常',
    },
  });

  const updatedPlan = await writeJson({
    name: 'admin can update aliyun deployment plan',
    path: '/system/apps/APP-ALIYUN-DEPLOY',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...aliyunPlan,
      status: '启用',
      publicUrl: 'https://erp.example.com/',
      apiBase: '/api',
      healthPath: '/api/health',
      versionTag: '0.1.1-smoke',
      description: 'Smoke verifies Aliyun deployment plan editing.',
    },
  });
  if (updatedPlan.record?.versionTag !== '0.1.1-smoke' || updatedPlan.record?.deployTarget !== '阿里云 ECS' || updatedPlan.record?.status !== '启用') {
    throw new Error('app health smoke: aliyun deployment plan update did not persist');
  }

  await writeJson({
    name: 'external app health check is blocked',
    path: '/system/apps/APP-ALIYUN-DEPLOY/check-health',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
  });

  const appData = JSON.parse(readFileSync(dataFile, 'utf8'));
  const appIndex = appData.system.apps.findIndex((row) => row.code === 'APP-ERP-WEB');
  if (appIndex < 0) throw new Error('app health smoke: APP-ERP-WEB missing for incomplete action guard');
  appData.system.apps[appIndex] = {
    ...appData.system.apps[appIndex],
    status: '启用',
    dataStore: '',
  };
  writeFileSync(dataFile, `${JSON.stringify(appData, null, 2)}\n`);

  await writeJson({
    name: 'incomplete app cannot check health',
    path: '/system/apps/APP-ERP-WEB/check-health',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
  });
});
results.push('admin can check local app health: ok');
results.push('manual app save cannot forge health result: ok');
results.push('sales cannot check app health: ok (403)');
results.push('enabled app cannot use unsupported deployment target: ok (400)');
results.push('enabled app requires health path: ok (400)');
results.push('enabled app requires data store: ok (400)');
results.push('enabled app rejects placeholder public url: ok (400)');
results.push('enabled app rejects invalid public url: ok (400)');
results.push('enabled app rejects invalid api base: ok (400)');
results.push('enabled app rejects invalid health path: ok (400)');
results.push('disabled app cannot check health: ok (400)');
results.push('system config status rejects normal/abnormal: ok (400)');
results.push('aliyun deployment plan stays disabled until real entry configured: ok');
results.push('admin can update aliyun deployment plan: ok');
results.push('external app health check is blocked: ok (400)');
results.push('incomplete app cannot check health: ok (400)');

await withDataFileRollback(async () => {
  const verified = await writeJson({
    name: 'admin can record mcp tool verification',
    path: '/system/mcp-tools/MCP-BROWSER/verify',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  if (!verified.record?.lastVerifiedAt) {
    throw new Error('mcp tool smoke: verification timestamp was not recorded');
  }
  const verifiedAt = verified.record.lastVerifiedAt;

  const savedTool = await writeJson({
    name: 'manual mcp tool save cannot forge verification time',
    path: '/system/mcp-tools/MCP-BROWSER',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...verified.record,
      lastVerifiedAt: '1999-01-01 00:00',
      description: 'Smoke verifies verification time is system-managed.',
    },
  });
  if (savedTool.record?.lastVerifiedAt !== verifiedAt) {
    throw new Error('mcp tool smoke: ordinary save forged verification time');
  }

  await writeJson({
    name: 'sales cannot record mcp tool verification',
    path: '/system/mcp-tools/MCP-BROWSER/verify',
    method: 'POST',
    account: 'ACC-SALES',
    status: 403,
  });

  await writeJson({
    name: 'high risk mcp tool requires verification remark',
    path: '/system/mcp-tools/MCP-FILE/verify',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
  });

  const highRiskRemark = 'Smoke 高风险工具验证：已执行构建或静态检查并确认结果。';
  const highRiskVerified = await writeJson({
    name: 'high risk mcp tool records verification remark',
    path: '/system/mcp-tools/MCP-FILE/verify',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { verificationRemark: highRiskRemark },
  });
  if (highRiskVerified.record?.lastVerificationRemark !== highRiskRemark) {
    throw new Error('mcp tool smoke: high-risk verification remark was not recorded');
  }

  const savedHighRiskTool = await writeJson({
    name: 'manual mcp tool save cannot forge verification remark',
    path: '/system/mcp-tools/MCP-FILE',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...highRiskVerified.record,
      lastVerifiedAt: '1999-01-01 00:00',
      lastVerificationRemark: '伪造验证备注',
      description: 'Smoke verifies verification remark is system-managed.',
    },
  });
  if (
    savedHighRiskTool.record?.lastVerifiedAt !== highRiskVerified.record.lastVerifiedAt ||
    savedHighRiskTool.record?.lastVerificationRemark !== highRiskRemark
  ) {
    throw new Error('mcp tool smoke: ordinary save forged verification fields');
  }

  const verificationLogs = await readJson({
    name: 'mcp verification remark audit log',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const highRiskLog = verificationLogs.items?.find(
    (row) => row.name === 'MCP 工具验证' && row.target === 'MCP-FILE' && String(row.remark || '').includes(highRiskRemark),
  );
  if (!highRiskLog) {
    throw new Error('mcp tool smoke: high-risk verification remark was not written to audit log');
  }

  await writeJson({
    name: 'disable mcp tool before verification block smoke',
    path: '/system/mcp-tools/MCP-BROWSER',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...verified.record,
      status: '停用',
      description: 'Smoke verifies disabled tools cannot be marked verified.',
    },
  });

  await writeJson({
    name: 'disabled mcp tool cannot record verification',
    path: '/system/mcp-tools/MCP-BROWSER/verify',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
  });

  await writeJson({
    name: 'enabled mcp tool cannot use unsupported risk level',
    path: '/system/mcp-tools/MCP-BROWSER',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...verified.record,
      riskLevel: '极高',
    },
  });

  await writeJson({
    name: 'enabled mcp tool requires verification method',
    path: '/system/mcp-tools',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'MCP-SMOKE-NO-VERIFY',
      name: 'Smoke 工具',
      owner: '系统管理员',
      status: '启用',
      toolType: '终端',
      useScope: 'Smoke 临时工具验证。',
      entryPoint: 'smoke',
      verifyMethod: '',
      riskLevel: '中',
      description: 'Smoke 临时工具。',
    },
  });

  await writeJson({
    name: 'enabled mcp tool cannot clear verification method',
    path: '/system/mcp-tools/MCP-BROWSER',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...verified.record,
      verifyMethod: '',
    },
  });

  const toolData = JSON.parse(readFileSync(dataFile, 'utf8'));
  const toolIndex = toolData.system['mcp-tools'].findIndex((row) => row.code === 'MCP-BROWSER');
  if (toolIndex < 0) throw new Error('mcp tool smoke: MCP-BROWSER missing for incomplete action guard');
  toolData.system['mcp-tools'][toolIndex] = {
    ...toolData.system['mcp-tools'][toolIndex],
    status: '启用',
    entryPoint: '',
  };
  writeFileSync(dataFile, `${JSON.stringify(toolData, null, 2)}\n`);

  await writeJson({
    name: 'incomplete mcp tool cannot record verification',
    path: '/system/mcp-tools/MCP-BROWSER/verify',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
  });
});
results.push('admin can record mcp tool verification: ok');
results.push('manual mcp tool save cannot forge verification time: ok');
results.push('sales cannot record mcp tool verification: ok (403)');
results.push('high risk mcp tool requires verification remark: ok (400)');
results.push('high risk mcp tool records verification remark: ok');
results.push('manual mcp tool save cannot forge verification remark: ok');
results.push('mcp verification remark audit log: ok');
results.push('disabled mcp tool cannot record verification: ok (400)');
results.push('enabled mcp tool cannot use unsupported risk level: ok (400)');
results.push('enabled mcp tool requires verification method: ok (400)');
results.push('enabled mcp tool cannot clear verification method: ok (400)');
results.push('incomplete mcp tool cannot record verification: ok (400)');

await withDataFileRollback(async () => {
  const rules = await readJson({
    name: 'system naming rules for generation checks',
    path: '/system/naming-rules',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesOrderRule = rules.items.find((row) => row.code === 'RULE-SO');
  if (!salesOrderRule) throw new Error('naming rule smoke: RULE-SO missing');

  const updatedNamingRule = await writeJson({
    name: 'update sales order naming rule',
    path: '/system/naming-rules/RULE-SO',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...salesOrderRule,
      prefix: 'SMK',
      dateFormat: 'none',
      sequenceLength: 2,
      status: '启用',
    },
  });
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(updatedNamingRule.record?.updatedAt || ''))) {
    throw new Error(`naming rule smoke: expected datetime updatedAt, got ${updatedNamingRule.record?.updatedAt}`);
  }

  const createdOrder = await writeJson({
    name: 'create order using configured naming rule',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: '系统自动生成',
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      date: '2026-07-29',
      delivery: '2026-08-15',
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      plannedShipDate: '2026-08-14',
      shipContact: 'Smoke 收货人',
      shipPhone: '138-0000-0998',
      shipAddress: 'Smoke 收货地址',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', name: 'PLA 1.75mm 珍珠白耗材 1kg', qty: '1 卷', unitPrice: '1.00' }],
      owner: '李明',
    },
  });
  if (!String(createdOrder.order?.code || '').startsWith('SMK-')) {
    throw new Error(`naming rule smoke: expected SMK prefix, got ${createdOrder.order?.code}`);
  }
});
results.push('naming rule drives sales order code generation: ok');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'system naming rules cannot be created manually',
    path: '/system/naming-rules',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 405,
    body: {
      code: 'RULE-SMOKE-NAMING',
      name: 'Smoke 未接入规则',
      ruleKey: 'smoke-unsupported',
      prefix: 'SMK',
      dateFormat: 'YYYYMMDD',
      sequenceLength: 3,
      status: '启用',
    },
  });

  const rules = await readJson({
    name: 'system naming rules for duplicate checks',
    path: '/system/naming-rules',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesOrderRule = rules.items.find((row) => row.code === 'RULE-SO');
  if (!salesOrderRule) throw new Error('naming duplicate smoke: RULE-SO missing');

  await writeJson({
    name: 'enabled naming rule cannot reuse prefix',
    path: '/system/naming-rules/RULE-SO',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesOrderRule,
      prefix: 'PO',
      status: '启用',
    },
  });
});
results.push('system naming rules cannot be created manually: ok (405)');
results.push('enabled naming rule cannot reuse prefix: ok (400)');

await withDataFileRollback(async () => {
  const created = await writeJson({
    name: 'create sales status guard order',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: 'SMOKE-SALES-STATUS-GUARD',
      customer: 'Smoke 客户',
      contact: 'Smoke 联系人',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', name: 'PLA 1.75mm 珍珠白耗材 1kg', qty: '1 卷', unitPrice: '1.00' }],
      owner: '李明',
    },
  });
  const code = created.order?.code || 'SMOKE-SALES-STATUS-GUARD';

  await writeJson({
    name: 'sales status cannot bypass outbound workflow',
    path: `/sales/orders/${encodeURIComponent(code)}/status`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 400,
    body: {
      revision: created.order?.revision,
      status: '已完成',
      action: 'Smoke 绕过销售出库',
      remark: '通用状态接口不能直接跳过出库流程。',
    },
  });

  const rejected = await writeJson({
    name: 'sales status allows configured exception',
    path: `/sales/orders/${encodeURIComponent(code)}/status`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
    body: {
      revision: created.order?.revision,
      status: '已驳回',
      action: 'Smoke 驳回销售订单',
      remark: '销售异常状态按白名单允许。',
    },
  });
  if (rejected.record?.status !== '已驳回') throw new Error('sales status guard: exception status did not persist');
});
results.push('sales status cannot bypass outbound workflow: ok (400)');
results.push('sales status allows configured exception: ok');

await withDataFileRollback(async () => {
  const created = await writeJson({
    name: 'create purchase status guard order',
    path: '/purchase/orders',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'SMOKE-PURCHASE-STATUS-GUARD',
      supplier: 'Smoke 供应商',
      contact: 'Smoke 联系人',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', unitPrice: '1.00' }],
      owner: '陈晨',
    },
  });
  const code = created.order?.code || 'SMOKE-PURCHASE-STATUS-GUARD';

  await writeJson({
    name: 'purchase status cannot bypass confirmation workflow',
    path: `/purchase/orders/${encodeURIComponent(code)}/status`,
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      status: '待入库',
      action: 'Smoke 绕过采购确认',
      remark: '通用状态接口不能直接跳过采购确认。',
    },
  });

  const voided = await writeJson({
    name: 'purchase status allows configured voiding',
    path: `/purchase/orders/${encodeURIComponent(code)}/status`,
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      status: '已作废',
      action: 'Smoke 作废采购订单',
      remark: '草稿采购订单可在业务规则内作废。',
    },
  });
  if (voided.record?.status !== '已作废') throw new Error('purchase status guard: voided status did not persist');
});
results.push('purchase status cannot bypass confirmation workflow: ok (400)');
results.push('purchase status allows configured voiding: ok');

await withDataFileRollback(async () => {
  const created = await writeJson({
    name: 'create warehouse status guard move',
    path: '/warehouse/other-moves',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 201,
    body: {
      code: 'SMOKE-WH-STATUS-GUARD',
      moveType: '样品出库',
      direction: '出库',
      reason: 'Smoke 状态保护',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1 kg', batch: 'PLA-260710-B' }],
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      targetWarehouse: '',
      owner: '王倩',
      note: 'Smoke temporary warehouse status guard record.',
    },
  });
  const code = created.move?.code || 'SMOKE-WH-STATUS-GUARD';

  await writeJson({
    name: 'warehouse status cannot bypass stock posting',
    path: `/warehouse/other-moves/${encodeURIComponent(code)}/status`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 400,
    body: {
      status: '已过账',
      action: 'Smoke 绕过过账',
      remark: '通用状态接口不能直接完成库存过账。',
    },
  });
});
results.push('warehouse status cannot bypass stock posting: ok (400)');

await writeJson({
    name: 'retired finance write endpoint is unavailable',
    path: '/finance/sales-invoices',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 410,
});
results.push('retired finance write endpoint is unavailable: ok (410)');

await withDataFileRollback(async () => {
  const createdSalesOrder = await writeJson({
    name: 'create ordinary save status sales order',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: '系统自动生成',
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      date: '2026-07-29',
      delivery: '2026-08-15',
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      plannedShipDate: '2026-08-14',
      shipContact: 'Smoke 收货人',
      shipPhone: '138-0000-0998',
      shipAddress: 'Smoke 收货地址',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', name: 'PLA 1.75mm 珍珠白耗材 1kg', qty: '1 卷', unitPrice: '1.00' }],
      owner: '李明',
    },
  });
  const salesCode = createdSalesOrder.order?.code;
  if (!salesCode) throw new Error('ordinary sales save status smoke: order code missing');

  const confirmedSalesOrder = await writeJson({
    name: 'confirm ordinary save status sales order',
    path: `/sales/orders/${encodeURIComponent(salesCode)}/confirm`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
    body: { revision: createdSalesOrder.order.revision },
  });

  await writeJson({
    name: 'confirmed sales order ordinary save is blocked',
    path: `/sales/orders/${encodeURIComponent(salesCode)}`,
    method: 'PUT',
    account: 'ACC-SALES',
    status: 409,
    body: {
      ...confirmedSalesOrder.order,
      status: '草稿',
      remark: 'Smoke 尝试用普通保存回退流程状态。',
    },
  });
  const createdPurchaseOrder = await writeJson({
    name: 'create ordinary save status purchase order',
    path: '/purchase/orders',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: '系统自动生成',
      date: smokeDocumentDate,
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      contactPhone: '136-0000-7108',
      expectedDate: smokeExpectedDate,
      deliveryMethod: '供应商送货',
      paymentMethod: '验收后付款',
      freightPayer: '供方',
      taxRate: '13%',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      receivingAddress: '杭州市滨江区江南大道 1688 号 2 号仓库',
      receivingContact: '王倩',
      receivingPhone: '138-0000-0004',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', unitPrice: '1.00' }],
      owner: '陈晨',
    },
  });
  const purchaseCode = createdPurchaseOrder.order?.code;
  if (!purchaseCode) throw new Error('ordinary purchase save status smoke: order code missing');

  const confirmedPurchaseOrder = await writeJson({
    name: 'confirm ordinary save status purchase order',
    path: `/purchase/orders/${encodeURIComponent(purchaseCode)}/confirm`,
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });

  await writeJson({
    name: 'confirmed purchase order ordinary save is blocked',
    path: `/purchase/orders/${encodeURIComponent(purchaseCode)}`,
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 409,
    body: {
      ...confirmedPurchaseOrder.order,
      status: '草稿',
      remark: 'Smoke 尝试用普通保存回退流程状态。',
    },
  });
  const createdOtherMove = await writeJson({
    name: 'create ordinary save status warehouse move',
    path: '/warehouse/other-moves',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 201,
    body: {
      code: '系统自动生成',
      moveType: '样品出库',
      direction: '出库',
      reason: 'Smoke 状态保护',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1 kg', batch: 'PLA-260710-B' }],
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      targetWarehouse: '客户试样',
      owner: '王倩',
      note: 'Smoke temporary ordinary save status record.',
    },
  });
  const moveCode = createdOtherMove.move?.code;
  if (!moveCode) throw new Error('ordinary warehouse save status smoke: move code missing');

  await writeJson({
    name: 'request approval for ordinary save status warehouse move',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/status`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
    body: {
      status: '待审核',
      action: '提交审核',
      remark: 'Smoke 先进入待审核，再验证审核后的普通保存保护。',
    },
  });

  const submittedOtherMove = await writeJson({
    name: 'approve ordinary save status warehouse move',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/submit`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });

  await writeJson({
    name: 'submitted warehouse move ordinary save is blocked',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}`,
    method: 'PUT',
    account: 'ACC-WAREHOUSE',
    status: 400,
    body: {
      ...submittedOtherMove.move,
      status: '草稿',
      note: 'Smoke 尝试用普通保存回退流程状态。',
    },
  });

  const postedOtherMove = await writeJson({
    name: 'post finalized warehouse save guard move',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/post`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });

  await writeJson({
    name: 'finalized warehouse save is blocked',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}`,
    method: 'PUT',
    account: 'ACC-WAREHOUSE',
    status: 400,
    body: {
      ...postedOtherMove.move,
      note: 'Smoke 尝试修改已过账库存单据。',
    },
  });

});
results.push('confirmed sales order ordinary save is blocked: ok (409)');
results.push('confirmed purchase order ordinary save is blocked: ok (409)');
results.push('submitted warehouse move ordinary save is blocked: ok (400)');
results.push('finalized warehouse save is blocked: ok (400)');

await withDataFileRollback(async () => {
  const createdQuote = await writeJson({
    name: 'create sales duplicate action quote',
    path: '/sales/quotes',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: 'SMOKE-SALES-DOUBLE-QUOTE',
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      validUntil: '2026-12-31',
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', name: 'PLA 1.75mm 珍珠白耗材 1kg', qty: '1 卷', unitPrice: '1.00' }],
      owner: '李明',
    },
  });
  const quoteCode = createdQuote.quote?.code || 'SMOKE-SALES-DOUBLE-QUOTE';
  const confirmedQuote = await writeJson({
    name: 'confirm sales duplicate action quote',
    path: `/sales/quotes/${encodeURIComponent(quoteCode)}/confirm`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
    body: { revision: createdQuote.quote.revision },
  });
  await writeJson({
    name: 'sales cannot confirm quote twice',
    path: `/sales/quotes/${encodeURIComponent(quoteCode)}/confirm`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 400,
    body: { revision: confirmedQuote.quote.revision },
  });

  const createdOrder = await writeJson({
    name: 'create sales duplicate action order',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-SALES',
    status: 201,
    body: {
      code: 'SMOKE-SALES-DOUBLE-ORDER',
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      date: '2026-07-29',
      delivery: '2026-08-15',
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      plannedShipDate: '2026-08-14',
      shipContact: 'Smoke 收货人',
      shipPhone: '138-0000-0998',
      shipAddress: 'Smoke 收货地址',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', name: 'PLA 1.75mm 珍珠白耗材 1kg', qty: '1 卷', unitPrice: '1.00' }],
      owner: '李明',
    },
  });
  const orderCode = createdOrder.order?.code || 'SMOKE-SALES-DOUBLE-ORDER';
  const confirmedOrder = await writeJson({
    name: 'confirm sales duplicate action order',
    path: `/sales/orders/${encodeURIComponent(orderCode)}/confirm`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 200,
    body: { revision: createdOrder.order.revision },
  });
  await writeJson({
    name: 'sales cannot confirm order twice',
    path: `/sales/orders/${encodeURIComponent(orderCode)}/confirm`,
    method: 'POST',
    account: 'ACC-SALES',
    status: 400,
    body: { revision: confirmedOrder.order.revision },
  });
});
results.push('sales cannot confirm quote twice: ok (400)');
results.push('sales cannot confirm order twice: ok (400)');

await withDataFileRollback(async () => {
  const createdRequisition = await writeJson({
    name: 'create purchase duplicate action requisition',
    path: '/purchase/requisitions',
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 201,
    body: {
      code: 'SMOKE-PURCHASE-DOUBLE-REQ',
      requester: '陈晨',
      department: '采购部',
      expectedDate: smokeExpectedDate,
      reason: 'Smoke 重复提交保护',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', unitPrice: '1.00' }],
    },
  });
  const requisitionCode = createdRequisition.requisition?.code || 'SMOKE-PURCHASE-DOUBLE-REQ';
  await writeJson({
    name: 'submit purchase duplicate action requisition',
    path: `/purchase/requisitions/${encodeURIComponent(requisitionCode)}/submit`,
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 200,
  });
  await writeJson({
    name: 'purchase cannot submit requisition twice',
    path: `/purchase/requisitions/${encodeURIComponent(requisitionCode)}/submit`,
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 400,
  });

  const createdOrder = await writeJson({
    name: 'create purchase duplicate action order',
    path: '/purchase/orders',
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 201,
    body: {
      code: 'SMOKE-PURCHASE-DOUBLE-ORDER',
      date: smokeDocumentDate,
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      expectedDate: smokeExpectedDate,
      deliveryMethod: '供应商送货',
      paymentMethod: '验收后付款',
      freightPayer: '供方',
      taxRate: '13%',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      receivingAddress: '杭州市滨江区江南大道 1688 号 2 号仓库',
      receivingContact: '王倩',
      receivingPhone: '138-0000-0004',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', unitPrice: '1.00' }],
      owner: '陈晨',
    },
  });
  const orderCode = createdOrder.order?.code || 'SMOKE-PURCHASE-DOUBLE-ORDER';
  const confirmedOrder = await writeJson({
    name: 'confirm purchase duplicate action order',
    path: `/purchase/orders/${encodeURIComponent(orderCode)}/confirm`,
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 200,
  });
  const receiptTaskCode = confirmedOrder.receiptTask?.code;
  if (!receiptTaskCode) {
    throw new Error('purchase order confirmation notification smoke: receipt task was not generated');
  }

  const warehouseOrderInbox = await readJson({
    name: 'warehouse receives purchase order confirmation notification',
    path: '/notifications?limit=100',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const hasPurchaseOrderNotification = (inbox) =>
    inbox.items?.some((item) => (
      item.sourceDoc === receiptTaskCode
      && item.sourcePath === `/warehouse/purchase-receipts/${encodeURIComponent(receiptTaskCode)}`
      && item.action === '订单确认'
      && item.ruleCode === 'NOTICE-ORDER-CONFIRMED'
    ));
  if (!hasPurchaseOrderNotification(warehouseOrderInbox)) {
    throw new Error('purchase order confirmation notification smoke: warehouse should receive NOTICE-ORDER-CONFIRMED with the generated receipt task path');
  }

  await writeJson({
    name: 'purchase cannot confirm order twice',
    path: `/purchase/orders/${encodeURIComponent(orderCode)}/confirm`,
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 400,
  });
});
results.push('purchase cannot submit requisition twice: ok (400)');
results.push('purchase cannot confirm order twice: ok (400)');
results.push('purchase order confirmation notifies warehouse: ok');

await withDataFileRollback(async () => {
  const createdMove = await writeJson({
    name: 'create warehouse duplicate action move',
    path: '/warehouse/other-moves',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 201,
    body: {
      code: 'SMOKE-WH-DOUBLE-MOVE',
      moveType: '样品出库',
      direction: '出库',
      reason: 'Smoke 重复过账保护',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1 kg', batch: 'PLA-260710-B' }],
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      targetWarehouse: '客户试样',
      owner: '王倩',
    },
  });
  const moveCode = createdMove.move?.code || 'SMOKE-WH-DOUBLE-MOVE';
  await writeJson({
    name: 'request approval for warehouse duplicate action move',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/status`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
    body: {
      status: '待审核',
      action: '提交审核',
      remark: 'Smoke 进入待审核后验证重复审核与过账保护。',
    },
  });
  await writeJson({
    name: 'submit warehouse duplicate action move',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/submit`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const repeatedSubmit = await writeJson({
    name: 'warehouse submit other move twice is idempotent',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/submit`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  if (repeatedSubmit.repeated !== true) throw new Error('warehouse repeated other move approval must report idempotent replay');
  await writeJson({
    name: 'post warehouse duplicate action move',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/post`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const repeatedPost = await writeJson({
    name: 'warehouse post other move twice is idempotent',
    path: `/warehouse/other-moves/${encodeURIComponent(moveCode)}/post`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  if (repeatedPost.repeated !== true) throw new Error('warehouse repeated other move posting must report idempotent replay');
});
results.push('warehouse duplicate approval is idempotent: ok (200 repeated)');
results.push('warehouse duplicate posting is idempotent: ok (200 repeated)');

await withDataFileRollback(async () => {
  const stocktakeInventory = await readJson({
    name: 'load current warehouse inventory for stocktake guard',
    path: '/warehouse/inventory',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const currentStocktakes = await readJson({
    name: 'load active stocktakes for stocktake guard',
    path: '/warehouse/stocktakes',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const lockedInventoryKeys = new Set(
    (currentStocktakes.items || [])
      .filter((stocktake) => ['盘点中', '待复核'].includes(stocktake.status))
      .flatMap((stocktake) => stocktake.lines || [])
      .map((line) => line.inventoryKey),
  );
  const stocktakeCandidate = (stocktakeInventory.items || []).find((row) => (
    Number(row.qualifiedOnHandNumber || 0) > 0
    && row.batch
    && !lockedInventoryKeys.has(row.key)
  ));
  if (!stocktakeCandidate) throw new Error('stocktake submit guard: no unlocked qualified batch is available');
  const createdStocktake = await writeJson({
    name: 'create warehouse stocktake submit guard',
    path: '/warehouse/stocktakes',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 201,
    body: {
      code: 'SMOKE-WH-STOCKTAKE-STEPS',
      warehouseCode: stocktakeCandidate.warehouseCode,
      warehouse: stocktakeCandidate.warehouse,
      scope: stocktakeCandidate.batch,
      owner: '王倩',
      plannedCount: 2,
      checkedCount: 2,
      differenceCount: 0,
    },
  });
  const stocktakeCode = createdStocktake.stocktake?.code || 'SMOKE-WH-STOCKTAKE-STEPS';
  const startedStocktake = await writeJson({
    name: 'start warehouse stocktake submit guard',
    path: `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/start`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const countedLines = (startedStocktake.stocktake?.lines || []).map((line) => ({
    ...line,
    countedQty: Number(line.bookQty),
  }));
  await writeJson({
    name: 'count warehouse stocktake submit guard',
    path: `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}`,
    method: 'PUT',
    account: 'ACC-WAREHOUSE',
    status: 200,
    body: { ...startedStocktake.stocktake, lines: countedLines },
  });
  await writeJson({
    name: 'submit warehouse stocktake review',
    path: `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/submit`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  await writeJson({
    name: 'warehouse cannot submit stocktake twice',
    path: `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/submit`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 400,
  });
  await writeJson({
    name: 'complete warehouse stocktake after review',
    path: `/warehouse/stocktakes/${encodeURIComponent(stocktakeCode)}/complete`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
});
results.push('warehouse stocktake submit review step: ok');
results.push('warehouse cannot submit stocktake twice: ok (400)');

await withDataFileRollback(async () => {
  const createdTransfer = await writeJson({
    name: 'create warehouse transfer step guard',
    path: '/warehouse/transfers',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 201,
    body: {
      code: 'SMOKE-WH-TRANSFER-STEPS',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1 kg', batch: 'PLA-260710-B' }],
      fromWarehouseCode: 'WH-RM',
      fromWarehouse: '原料仓',
      toWarehouseCode: 'WH-PKG',
      toWarehouse: '包材仓',
      toLocation: 'PKG-01',
      reason: 'Smoke 调拨步骤保护',
      owner: '王倩',
    },
  });
  const transferCode = createdTransfer.transfer?.code || 'SMOKE-WH-TRANSFER-STEPS';
  await writeJson({
    name: 'submit warehouse transfer step guard',
    path: `/warehouse/transfers/${encodeURIComponent(transferCode)}/submit`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  await writeJson({
    name: 'warehouse cannot complete transfer before inbound step',
    path: `/warehouse/transfers/${encodeURIComponent(transferCode)}/post`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 400,
  });
  await writeJson({
    name: 'warehouse transfer outbound step',
    path: `/warehouse/transfers/${encodeURIComponent(transferCode)}/status`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
    body: { status: '调拨中', action: 'Smoke 调拨出库', remark: '调出仓确认出库。' },
  });
  await writeJson({
    name: 'warehouse transfer arrived step',
    path: `/warehouse/transfers/${encodeURIComponent(transferCode)}/status`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
    body: { status: '待入库', action: 'Smoke 调拨到达', remark: '调入仓确认到达。' },
  });
  await writeJson({
    name: 'complete warehouse transfer step guard',
    path: `/warehouse/transfers/${encodeURIComponent(transferCode)}/post`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  const repeatedCompletion = await writeJson({
    name: 'warehouse transfer completion retry is idempotent',
    path: `/warehouse/transfers/${encodeURIComponent(transferCode)}/post`,
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 200,
  });
  if (repeatedCompletion.idempotentReplay !== true) {
    throw new Error('warehouse transfer completion retry did not return idempotent replay');
  }
});
results.push('warehouse cannot complete transfer before inbound step: ok (400)');
results.push('warehouse transfer completion retry is idempotent: ok');

const [roleRows, permissionRows] = await Promise.all([
  readJson({ name: 'system roles for protection checks', path: '/system/roles', account: 'ACC-ZHANGSAN', status: 200 }),
  readJson({ name: 'system permissions for protection checks', path: '/system/permissions', account: 'ACC-ZHANGSAN', status: 200 }),
]);
const salesRole = roleRows.items.find((row) => row.code === 'ROLE-SALES');
const purchaseRole = roleRows.items.find((row) => row.code === 'ROLE-PURCHASE');
const warehouseRole = roleRows.items.find((row) => row.code === 'ROLE-WAREHOUSE');
const salesPermission = permissionRows.items.find((row) => row.code === 'PERM-SALES-EDIT');
const salesApprovePermission = permissionRows.items.find((row) => row.code === 'PERM-SALES-APPROVE');
if (!salesRole || !purchaseRole || !warehouseRole || !salesPermission || !salesApprovePermission) {
  throw new Error('system protection checks: required rows missing');
}

await withDataFileRollback(async () => {
  await writeJson({
    name: 'cannot duplicate system permission name',
    path: '/system/permissions/PERM-SALES-APPROVE',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesApprovePermission,
      name: salesPermission.name,
      description: 'Smoke 不允许权限名称重复，避免权限提示混淆。',
    },
  });

  const updatedPermission = await writeJson({
    name: 'permission display edits persist',
    path: '/system/permissions/PERM-SALES-APPROVE',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...salesApprovePermission,
      name: 'Smoke 销售确认权限',
      owner: 'Smoke 权限维护',
      description: 'Smoke 权限显示信息持久化验证。',
    },
  });
  if (
    updatedPermission.record?.name !== 'Smoke 销售确认权限' ||
    updatedPermission.record?.owner !== 'Smoke 权限维护' ||
    updatedPermission.record?.description !== 'Smoke 权限显示信息持久化验证。'
  ) {
    throw new Error('permission display smoke: updated permission display fields were not returned');
  }

  const permissionsAfterUpdate = await readJson({
    name: 'permission display edits survive reload',
    path: '/system/permissions',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const reloadedPermission = permissionsAfterUpdate.items?.find((row) => row.code === 'PERM-SALES-APPROVE');
  if (
    reloadedPermission?.name !== 'Smoke 销售确认权限' ||
    reloadedPermission?.owner !== 'Smoke 权限维护' ||
    reloadedPermission?.description !== 'Smoke 权限显示信息持久化验证。'
  ) {
    throw new Error('permission display smoke: permission display fields did not survive reload');
  }

  const clearedPermission = await writeJson({
    name: 'permission description can be cleared',
    path: '/system/permissions/PERM-SALES-APPROVE',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...reloadedPermission,
      description: '',
    },
  });
  if (clearedPermission.record?.description !== '') {
    throw new Error('permission display smoke: empty description was not persisted');
  }

  const sessionAfterPermissionUpdate = await readJson({
    name: 'permission display edits are included in session context',
    path: '/session/current',
    account: 'ACC-SALES',
    status: 200,
  });
  if (sessionAfterPermissionUpdate.permissionLabels?.['PERM-SALES-APPROVE'] !== 'Smoke 销售确认权限') {
    throw new Error('permission display smoke: session context did not include updated permission label');
  }
});
results.push('cannot duplicate system permission name: ok (400)');
results.push('permission display edits persist: ok');
results.push('permission description can be cleared: ok');
results.push('permission display edits are included in session context: ok');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'prepare sales edit-only role',
    path: '/system/roles/ROLE-SALES',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesRole, permissions: 'PERM-SALES-EDIT' },
  });

  const salesSession = await readJson({
    name: 'sales session reflects role permission change',
    path: '/session/current',
    account: 'ACC-SALES',
    status: 200,
  });
  if (
    !salesSession.permissions?.includes('PERM-SALES-EDIT') ||
    salesSession.permissions?.includes('PERM-SALES-APPROVE')
  ) {
    throw new Error('role permission smoke: sales session did not reflect edited role permissions');
  }

  const deniedConfirm = await writeJson({
    name: 'sales edit-only account cannot confirm documents',
    path: '/sales/quotes/SMOKE-NO-SUCH/confirm',
    method: 'POST',
    account: 'ACC-SALES',
    status: 403,
  });
  if (!String(deniedConfirm.error || '').includes('销售单据确认（PERM-SALES-APPROVE）')) {
    throw new Error('permission audit smoke: denied operation message should include permission label');
  }

  await writeJson({
    name: 'sales edit-only account cannot change document status',
    path: '/sales/orders/SMOKE-NO-SUCH/status',
    method: 'POST',
    account: 'ACC-SALES',
    status: 403,
    body: { status: '已驳回', action: 'Smoke 越权状态', remark: '编辑权限不能调整状态。' },
  });

  const createdOrder = await writeJson({
    name: 'create sales order for protected content change',
    path: '/sales/orders',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'SMOKE-SALES-PROTECTED-CHANGE',
      customerCode: 'CUS-00001',
      customer: '杭州千层增材科技',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      date: '2026-07-29',
      delivery: '2026-08-15',
      deliveryMethod: '送货到厂',
      paymentMethod: '月结 30 天',
      plannedShipDate: '2026-08-14',
      shipContact: 'Smoke 收货人',
      shipPhone: '138-0000-0998',
      shipAddress: 'Smoke 收货地址',
      products: [{ materialCode: 'M-FG-PLA-175-WHT', name: 'PLA 1.75mm 珍珠白耗材 1kg', qty: '1 卷', unitPrice: '1.00' }],
      owner: '李明',
    },
  });
  const orderCode = createdOrder.order?.code || 'SMOKE-SALES-PROTECTED-CHANGE';
  const confirmedOrder = await writeJson({
    name: 'confirm sales order for protected content change',
    path: `/sales/orders/${encodeURIComponent(orderCode)}/confirm`,
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { revision: createdOrder.order.revision },
  });
  await writeJson({
    name: 'confirmed sales order content remains locked',
    path: `/sales/orders/${encodeURIComponent(orderCode)}`,
    method: 'PUT',
    account: 'ACC-SALES',
    status: 409,
    body: {
      ...confirmedOrder.order,
      remark: 'Smoke edit-only account should not change confirmed order content.',
    },
  });

  const logs = await readJson({
    name: 'audit log after denied sales operation',
    path: '/system/logs',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const auditLog = logs.items?.find(
    (row) =>
      row.name === '权限拒绝' &&
      row.target === '销售单据确认（PERM-SALES-APPROVE）' &&
      row.sourceAccount === 'ACC-SALES' &&
      String(row.remark || '').includes('/sales/quotes/SMOKE-NO-SUCH/confirm'),
  );
  if (!auditLog) throw new Error('permission audit smoke: denied sales operation was not logged');
});
results.push('sales session reflects role permission change: ok');
results.push('sales edit-only account cannot confirm documents: ok (403)');
results.push('sales edit-only account cannot change document status: ok (403)');
results.push('confirmed sales order content remains locked: ok (409)');
results.push('permission denied operation is audited: ok');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'role operation permission requires base permission',
    path: '/system/roles/ROLE-SALES',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...salesRole, permissions: 'PERM-SALES-APPROVE' },
  });
});
results.push('role operation permission requires base permission: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'prepare sales role without sales permission',
    path: '/system/roles/ROLE-SALES',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesRole, permissions: 'PERM-PURCHASE-EDIT' },
  });

  const salesMenus = await readJson({
    name: 'sales menus reflect removed edit permission',
    path: '/system/menus',
    account: 'ACC-SALES',
    status: 200,
  });
  if (salesMenus.items?.some((row) => row.code === 'MENU-SALES' || row.code === 'MENU-SALES-ORDERS')) {
    throw new Error('role permission smoke: sales menus still include edit-only entries');
  }

  await readJson({
    name: 'sales account without sales permission cannot read sales quotes',
    path: '/sales/quotes',
    account: 'ACC-SALES',
    status: 403,
  });
});
results.push('sales menus reflect removed edit permission: ok');
results.push('sales account without sales permission cannot read sales quotes: ok (403)');

await withDataFileRollback(async () => {
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const salesRole = data.system?.roles?.find((row) => row.code === 'ROLE-SALES');
  const salesParentMenu = data.system?.menus?.find((row) => row.code === 'MENU-SALES');
  const salesOrdersMenu = data.system?.menus?.find((row) => row.code === 'MENU-SALES-ORDERS');
  if (!salesRole || !salesParentMenu || !salesOrdersMenu) {
    throw new Error('menu route permission fallback smoke: required rows missing');
  }
  salesRole.permissions = 'PERM-PURCHASE-EDIT';
  salesParentMenu.permissionCode = '';
  salesOrdersMenu.permissionCode = '';
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  const salesMenus = await readJson({
    name: 'route fallback permission hides misconfigured sales menus',
    path: '/system/menus',
    account: 'ACC-SALES',
    status: 200,
  });
  if (salesMenus.items?.some((row) => row.code === 'MENU-SALES' || row.code === 'MENU-SALES-ORDERS')) {
    throw new Error('menu route permission fallback smoke: route-required sales menus were visible without sales permission');
  }
});
results.push('menu route permission fallback hides misconfigured menus: ok');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'prepare purchase edit-only role',
    path: '/system/roles/ROLE-PURCHASE',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...purchaseRole, permissions: 'PERM-PURCHASE-EDIT' },
  });

  await writeJson({
    name: 'purchase edit-only account cannot submit requisitions',
    path: '/purchase/requisitions/SMOKE-NO-SUCH/submit',
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 403,
  });

  await writeJson({
    name: 'purchase edit-only account cannot change document status',
    path: '/purchase/orders/SMOKE-NO-SUCH/status',
    method: 'POST',
    account: 'ACC-PURCHASE',
    status: 403,
    body: { status: '已驳回', action: 'Smoke 越权状态', remark: '编辑权限不能调整状态。' },
  });

  const createdOrder = await writeJson({
    name: 'create purchase order for protected content change',
    path: '/purchase/orders',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'SMOKE-PURCHASE-PROTECTED-CHANGE',
      date: smokeDocumentDate,
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: 'Smoke 联系人',
      contactPhone: '138-0000-0999',
      expectedDate: smokeExpectedDate,
      deliveryMethod: '供应商送货',
      paymentMethod: '验收后付款',
      freightPayer: '供方',
      taxRate: '13%',
      warehouseCode: 'WH-QC-HOLD',
      warehouse: '采购暂存区',
      receivingAddress: '杭州市滨江区江南大道 1688 号 2 号仓库',
      receivingContact: '王倩',
      receivingPhone: '138-0000-0004',
      products: [{ materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1 kg', unitPrice: '1.00' }],
      owner: '陈晨',
    },
  });
  const orderCode = createdOrder.order?.code || 'SMOKE-PURCHASE-PROTECTED-CHANGE';
  const confirmedOrder = await writeJson({
    name: 'confirm purchase order for protected content change',
    path: `/purchase/orders/${encodeURIComponent(orderCode)}/confirm`,
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  await writeJson({
    name: 'purchase edit-only account cannot change confirmed order content',
    path: `/purchase/orders/${encodeURIComponent(orderCode)}`,
    method: 'PUT',
    account: 'ACC-PURCHASE',
    status: 403,
    body: {
      ...confirmedOrder.order,
      _operation: 'change',
      remark: 'Smoke edit-only account should not change confirmed order content.',
    },
  });
});
results.push('purchase edit-only account cannot submit requisitions: ok (403)');
results.push('purchase edit-only account cannot change document status: ok (403)');
results.push('purchase edit-only account cannot change confirmed order content: ok (403)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'prepare warehouse view-only role',
    path: '/system/roles/ROLE-WAREHOUSE',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...warehouseRole, permissions: 'PERM-WAREHOUSE-VIEW' },
  });

  await writeJson({
    name: 'warehouse view-only account cannot start stocktake',
    path: '/warehouse/stocktakes/SMOKE-NO-SUCH/start',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot submit stocktake',
    path: '/warehouse/stocktakes/SMOKE-NO-SUCH/submit',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot complete stocktake',
    path: '/warehouse/stocktakes/SMOKE-NO-SUCH/complete',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot change document status',
    path: '/warehouse/other-moves/SMOKE-NO-SUCH/status',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
    body: { status: '异常待处理', action: 'Smoke 越权状态', remark: '查看权限不能调整状态。' },
  });

  await writeJson({
    name: 'warehouse view-only account cannot post purchase receipts',
    path: '/warehouse/purchase-receipts/SMOKE-NO-SUCH/post',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot post sales issues',
    path: '/warehouse/sales-issues/SMOKE-NO-SUCH/post',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot submit other moves',
    path: '/warehouse/other-moves/SMOKE-NO-SUCH/submit',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot post transfers',
    path: '/warehouse/transfers/SMOKE-NO-SUCH/post',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });

  await writeJson({
    name: 'warehouse view-only account cannot submit transfers',
    path: '/warehouse/transfers/SMOKE-NO-SUCH/submit',
    method: 'POST',
    account: 'ACC-WAREHOUSE',
    status: 403,
  });
});
results.push('warehouse view-only account cannot start stocktake: ok (403)');
results.push('warehouse view-only account cannot submit stocktake: ok (403)');
results.push('warehouse view-only account cannot complete stocktake: ok (403)');
results.push('warehouse view-only account cannot change document status: ok (403)');
results.push('warehouse view-only account cannot post purchase receipts: ok (403)');
results.push('warehouse view-only account cannot post sales issues: ok (403)');
results.push('warehouse view-only account cannot submit other moves: ok (403)');
results.push('warehouse view-only account cannot post transfers: ok (403)');
results.push('warehouse view-only account cannot submit transfers: ok (403)');

await withDataFileRollback(async () => {
  const menus = await readJson({
    name: 'system menus for parent child enable guard',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesParentMenu = menus.items.find((row) => row.code === 'MENU-SALES');
  const salesOrdersMenu = menus.items.find((row) => row.code === 'MENU-SALES-ORDERS');
  const salesSiblingMenu = menus.items.find(
    (row) => row.code !== 'MENU-SALES-ORDERS' && row.parentCode === 'MENU-SALES' && Number(row.sortOrder) !== Number(salesOrdersMenu?.sortOrder),
  );
  const activeSalesChildren = menus.items.filter((row) => row.parentCode === 'MENU-SALES' && row.status !== '停用');
  if (!salesParentMenu || !salesOrdersMenu || !salesSiblingMenu) {
    throw new Error('menu parent child guard: required menu rows missing');
  }

  await writeJson({
    name: 'cannot duplicate sibling menu sort order',
    path: '/system/menus/MENU-SALES-ORDERS',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...salesOrdersMenu, sortOrder: salesSiblingMenu.sortOrder },
  });

  await writeJson({
    name: 'cannot save invalid menu sort order',
    path: '/system/menus/MENU-SALES-ORDERS',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...salesOrdersMenu, sortOrder: 'abc' },
  });

  const stopParentWithActiveChildren = await writeJson({
    name: 'cannot stop parent menu with active child menus',
    path: '/system/menus/MENU-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...salesParentMenu, status: '停用' },
  });
  if (!String(stopParentWithActiveChildren.error || '').includes(salesOrdersMenu.name || salesOrdersMenu.code)) {
    throw new Error('menu parent child guard: stop error did not include active child menu name');
  }

  for (const childMenu of deepestMenusFirst(activeSalesChildren, menus.items)) {
    await writeJson({
      name: `temporarily disable sales child menu ${childMenu.code}`,
      path: `/system/menus/${encodeURIComponent(childMenu.code)}`,
      method: 'PUT',
      account: 'ACC-ZHANGSAN',
      status: 200,
      body: { ...childMenu, status: '停用' },
    });
  }

  await writeJson({
    name: 'temporarily disable sales parent menu',
    path: '/system/menus/MENU-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesParentMenu, status: '停用' },
  });

  await writeJson({
    name: 'enabled child menu requires active parent',
    path: '/system/menus/MENU-SALES-ORDERS',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...salesOrdersMenu, status: '启用' },
  });
});
results.push('cannot duplicate sibling menu sort order: ok (400)');
results.push('cannot save invalid menu sort order: ok (400)');
results.push('cannot stop parent menu with active child menus: ok (400)');
results.push('enabled child menu requires active parent: ok (400)');

await withDataFileRollback(async () => {
  const menus = await readJson({
    name: 'system menus for protected system menu guard',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const protectedSystemMenu = menus.items.find((row) => row.code === 'MENU-SYSTEM-MENUS');
  if (!protectedSystemMenu) throw new Error('protected system menu guard: MENU-SYSTEM-MENUS missing');

  await writeJson({
    name: 'protected system menu cannot be disabled',
    path: '/system/menus/MENU-SYSTEM-MENUS',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...protectedSystemMenu, status: '停用' },
  });

  await writeJson({
    name: 'protected system menu must keep system permission',
    path: '/system/menus/MENU-SYSTEM-MENUS',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...protectedSystemMenu, permissionCode: 'PERM-SALES-EDIT' },
  });
});
results.push('protected system menu cannot be disabled: ok (400)');
results.push('protected system menu must keep system permission: ok (400)');

await withDataFileRollback(async () => {
  const menus = await readJson({
    name: 'system menus for disabled permission binding checks',
    path: '/system/menus',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesEditMenus = menus.items.filter((row) => row.permissionCode === 'PERM-SALES-EDIT' && row.status !== '停用');
  for (const menu of deepestMenusFirst(salesEditMenus, menus.items)) {
    await writeJson({
      name: `temporarily disable sales menu ${menu.code}`,
      path: `/system/menus/${encodeURIComponent(menu.code)}`,
      method: 'PUT',
      account: 'ACC-ZHANGSAN',
      status: 200,
      body: { ...menu, status: '停用' },
    });
  }

  await writeJson({
    name: 'prepare sales role without edit permission',
    path: '/system/roles/ROLE-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesRole, permissions: 'PERM-PURCHASE-EDIT' },
  });

  const permissionRequiredByOperation = await writeJson({
    name: 'cannot stop permission required by active operation permission',
    path: '/system/permissions/PERM-SALES-EDIT',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: { ...salesPermission, status: '停用' },
  });
  if (
    !String(permissionRequiredByOperation.error || '').includes('启用操作权限：销售单据确认') ||
    !String(permissionRequiredByOperation.error || '').includes('请先调整角色、菜单或依赖权限')
  ) {
    throw new Error('permission stop smoke: operation dependency error did not include concrete permission names');
  }

  await writeJson({
    name: 'temporarily disable builtin sales approve permission',
    path: '/system/permissions/PERM-SALES-APPROVE',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesApprovePermission, status: '停用' },
  });

  await writeJson({
    name: 'temporarily disable builtin sales edit permission',
    path: '/system/permissions/PERM-SALES-EDIT',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: { ...salesPermission, status: '停用' },
  });

  await writeJson({
    name: 'enabled menu cannot bind disabled permission',
    path: '/system/menus/MENU-SALES-PRICES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'MENU-SALES-PRICES',
      permissionCode: 'PERM-SALES-EDIT',
      status: '启用',
    },
  });

  const mismatchedMenuPermission = await writeJson({
    name: 'enabled menu cannot bind permission from another module',
    path: '/system/menus/MENU-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'MENU-SALES',
      permissionCode: 'PERM-WAREHOUSE-VIEW',
      status: '启用',
    },
  });
  if (
    !String(mismatchedMenuPermission.error || '').includes('销售单据编辑（PERM-SALES-EDIT）') ||
    !String(mismatchedMenuPermission.error || '').includes('仓库查看（PERM-WAREHOUSE-VIEW）')
  ) {
    throw new Error('menu permission smoke: mismatch error did not include permission display labels');
  }

  const operationMenuPermission = await writeJson({
    name: 'menu cannot bind operation permission',
    path: '/system/menus/MENU-SALES-PRICES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'MENU-SALES-PRICES',
      permissionCode: 'PERM-SALES-APPROVE',
      status: '停用',
    },
  });
  if (
    !String(operationMenuPermission.error || '').includes('菜单入口不能绑定操作权限') ||
    !String(operationMenuPermission.error || '').includes('销售单据确认（PERM-SALES-APPROVE）')
  ) {
    throw new Error('menu permission smoke: operation permission binding was not clearly rejected');
  }

  const keptMenuShape = await writeJson({
    name: 'menu structural fields stay wired to built-in route',
    path: '/system/menus/MENU-SALES-ORDERS',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      code: 'MENU-SALES-ORDERS',
      menuKey: 'warehouse',
      parentCode: 'MENU-WAREHOUSE',
      path: '/smoke/unwired-menu',
      permissionCode: 'PERM-SALES-EDIT',
      status: '停用',
    },
  });
  const keptMenu = keptMenuShape.record;
  if (keptMenu?.path !== '/sales/orders' || keptMenu?.menuKey !== 'sales' || keptMenu?.parentCode !== 'MENU-SALES') {
    throw new Error('menu structural smoke: menu structure was changed away from built-in route');
  }

  await writeJson({
    name: 'role cannot bind disabled permission',
    path: '/system/roles/ROLE-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesRole,
      permissions: salesRole.permissions,
    },
  });

  await writeJson({
    name: 'role cannot bind unsupported permission',
    path: '/system/roles/ROLE-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesRole,
      permissions: `${salesRole.permissions},PERM-SMOKE-UNWIRED`,
    },
  });
});
results.push('enabled menu cannot bind disabled permission: ok (400)');
results.push('enabled menu cannot bind permission from another module: ok (400)');
results.push('menu structural fields stay wired to built-in route: ok');
results.push('role cannot bind disabled permission: ok (400)');
results.push('role cannot bind unsupported permission: ok (400)');
results.push('cannot stop permission required by active operation permission: ok (400)');

const accountRows = await readJson({
  name: 'system accounts for uniqueness checks',
  path: '/system/accounts',
  account: 'ACC-ZHANGSAN',
  status: 200,
});
const salesAccount = accountRows.items.find((row) => row.code === 'ACC-SALES');
const warehouseAccount = accountRows.items.find((row) => row.code === 'ACC-WAREHOUSE');
const defaultAdminAccount = accountRows.items.find((row) => row.code === 'ACC-ZHANGSAN');
if (!salesAccount || !warehouseAccount || !defaultAdminAccount) {
  throw new Error('account uniqueness checks: required rows missing');
}
if (String(defaultAdminAccount.description || '').includes('演示环境')) {
  throw new Error('account uniqueness checks: default admin account should not be described as demo data');
}

await writeJson({
  name: 'default admin account cannot be disabled',
  path: '/system/accounts/ACC-ZHANGSAN',
  method: 'PUT',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    ...defaultAdminAccount,
    status: '停用',
  },
});

await writeJson({
  name: 'default admin account must keep admin role',
  path: '/system/accounts/ACC-ZHANGSAN',
  method: 'PUT',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    ...defaultAdminAccount,
    roles: 'ROLE-SALES',
  },
});
results.push('default admin account cannot be disabled: ok (400)');
results.push('default admin account must keep admin role: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create disabled smoke role',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-DISABLED',
      name: 'Smoke 停用角色',
      owner: '系统管理员',
      status: '停用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke 临时停用角色。',
    },
  });

  await writeJson({
    name: 'enabled account cannot bind disabled role',
    path: '/system/accounts/ACC-SALES',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesAccount,
      roles: `${salesAccount.roles},ROLE-SMOKE-DISABLED`,
    },
  });

  const notifications = await readJson({
    name: 'system notifications for role binding checks',
    path: '/system/notifications',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const notificationRule = notifications.items?.[0];
  if (!notificationRule) throw new Error('role binding checks: notification rule missing');

  await writeJson({
    name: 'enabled notification cannot use unsupported action',
    path: `/system/notifications/${encodeURIComponent(notificationRule.code)}`,
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...notificationRule,
      triggerAction: 'SMOKE-NO-SUCH-ACTION',
    },
  });

  await writeJson({
    name: 'enabled notification cannot use disconnected channel',
    path: `/system/notifications/${encodeURIComponent(notificationRule.code)}`,
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...notificationRule,
      channel: '邮件',
    },
  });

  await writeJson({
    name: 'enabled notification cannot bind disabled role',
    path: `/system/notifications/${encodeURIComponent(notificationRule.code)}`,
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...notificationRule,
      receiverRoles: `${notificationRule.receiverRoles},ROLE-SMOKE-DISABLED`,
    },
  });
});
results.push('enabled account cannot bind disabled role: ok (400)');
results.push('enabled notification cannot use unsupported action: ok (400)');
results.push('enabled notification cannot use disconnected channel: ok (400)');
results.push('enabled notification cannot bind disabled role: ok (400)');

await withDataFileRollback(async () => {
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  data.system ||= {};
  data.system.roles ||= [];
  data.system.roles.unshift({
    code: 'ROLE-SMOKE-NO-EFFECTIVE-PERMISSION',
    name: 'Smoke 无有效权限角色',
    owner: '系统管理员',
    status: '启用',
    permissions: 'PERM-SMOKE-NO-SUCH',
    description: 'Smoke 模拟历史残留的无效角色权限。',
  });
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  const noEffectiveAccount = await writeJson({
    name: 'enabled account requires effective permission',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'ACC-SMOKE-NO-EFFECTIVE-PERMISSION',
      name: 'Smoke 无有效权限账号',
      username: 'smoke-no-effective-permission',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SMOKE-NO-EFFECTIVE-PERMISSION',
      description: 'Smoke 应拒绝没有任何有效权限的启用账号。',
    },
  });
  if (
    !String(noEffectiveAccount.error || '').includes('以下启用账号必须至少拥有一个有效权限：Smoke 无有效权限账号') ||
    !String(noEffectiveAccount.error || '').includes('请先调整角色权限或账号角色')
  ) {
    throw new Error('effective account smoke: single-account guard did not list affected account');
  }
});
results.push('enabled account requires effective permission: ok (400)');

await withDataFileRollback(async () => {
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  data.system ||= {};
  data.system.roles ||= [];
  data.system.accounts ||= [];
  data.system.roles.unshift({
    code: 'ROLE-SMOKE-NO-EFFECTIVE-LIST',
    name: 'Smoke 无有效权限列表角色',
    owner: '系统管理员',
    status: '启用',
    permissions: 'PERM-SMOKE-NO-SUCH',
    description: 'Smoke 模拟历史残留的无效角色权限，用于多账号提示。',
  });
  data.system.accounts.unshift(
    {
      code: 'ACC-SMOKE-NO-EFFECTIVE-A',
      name: 'Smoke 无权限账号A',
      username: 'smoke-no-effective-a',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SMOKE-NO-EFFECTIVE-LIST',
      description: 'Smoke 模拟历史残留的无效账号 A。',
    },
    {
      code: 'ACC-SMOKE-NO-EFFECTIVE-B',
      name: 'Smoke 无权限账号B',
      username: 'smoke-no-effective-b',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SMOKE-NO-EFFECTIVE-LIST',
      description: 'Smoke 模拟历史残留的无效账号 B。',
    },
  );
  writeFileSync(dataFile, JSON.stringify(data, null, 2));

  const noEffectiveAccounts = await writeJson({
    name: 'enabled accounts require effective permission list',
    path: '/system/accounts/ACC-SMOKE-NO-EFFECTIVE-A',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: data.system.accounts.find((account) => account.code === 'ACC-SMOKE-NO-EFFECTIVE-A'),
  });
  if (
    !String(noEffectiveAccounts.error || '').includes('以下启用账号必须至少拥有一个有效权限：Smoke 无权限账号A、Smoke 无权限账号B') ||
    !String(noEffectiveAccounts.error || '').includes('请先调整角色权限或账号角色')
  ) {
    throw new Error('effective account smoke: multi-account guard did not list every affected account');
  }
});
results.push('enabled accounts require effective permission list: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create role without active notification accounts',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-NO-RECIPIENT',
      name: 'Smoke 无接收账号角色',
      owner: '系统管理员',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke 临时无接收账号角色。',
    },
  });

  const noRecipientNotification = await writeJson({
    name: 'enabled notification requires active recipient account',
    path: '/system/notifications',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'NOTICE-SMOKE-NO-RECIPIENT',
      name: 'Smoke 无接收账号通知',
      owner: '系统管理员',
      status: '启用',
      triggerModule: '销售',
      triggerAction: '订单确认',
      receiverRoles: 'ROLE-SMOKE-NO-RECIPIENT',
      channel: '站内',
      description: 'Smoke 应拒绝没有启用接收账号的通知规则。',
    },
  });
  if (
    !String(noRecipientNotification.error || '').includes('接收角色 Smoke 无接收账号角色 当前没有匹配启用账号') ||
    !String(noRecipientNotification.error || '').includes('请先为这些角色分配启用账号或调整接收角色')
  ) {
    throw new Error('notification recipient smoke: no-recipient notification did not list affected receiver role');
  }
});
results.push('enabled notification requires active recipient account: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create notification recipient guard role',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-RECIPIENT-GUARD',
      name: 'Smoke 接收账号保护角色',
      owner: '系统管理员',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke 临时接收账号保护角色。',
    },
  });

  const recipientAccount = await writeJson({
    name: 'create notification recipient guard account',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-RECIPIENT-GUARD',
      name: 'Smoke 接收账号保护',
      username: 'smoke-recipient-guard',
      roles: 'ROLE-SMOKE-RECIPIENT-GUARD',
      status: '启用',
      description: 'Smoke 临时接收账号保护。',
    },
  });

  await writeJson({
    name: 'create notification for recipient guard',
    path: '/system/notifications',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'NOTICE-SMOKE-RECIPIENT-GUARD',
      name: 'Smoke 接收账号保护通知',
      owner: '系统管理员',
      status: '启用',
      triggerModule: '销售',
      triggerAction: '订单确认',
      receiverRoles: 'ROLE-SMOKE-RECIPIENT-GUARD',
      channel: '站内',
      description: 'Smoke 临时接收账号保护通知。',
    },
  });

  const disableLastRecipient = await writeJson({
    name: 'cannot disable last notification recipient account',
    path: '/system/accounts/ACC-SMOKE-RECIPIENT-GUARD',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...recipientAccount.record,
      status: '停用',
    },
  });
  if (
    !String(disableLastRecipient.error || '').includes('以下启用通知规则必须至少匹配一个启用账号：Smoke 接收账号保护通知') ||
    !String(disableLastRecipient.error || '').includes('请先调整接收角色或账号角色')
  ) {
    throw new Error('notification recipient smoke: account disable did not list affected notification rule');
  }

  const removeLastRecipientRole = await writeJson({
    name: 'cannot remove last notification recipient role from account',
    path: '/system/accounts/ACC-SMOKE-RECIPIENT-GUARD',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...recipientAccount.record,
      roles: 'ROLE-SALES',
    },
  });
  if (
    !String(removeLastRecipientRole.error || '').includes('以下启用通知规则必须至少匹配一个启用账号：Smoke 接收账号保护通知') ||
    !String(removeLastRecipientRole.error || '').includes('请先调整接收角色或账号角色')
  ) {
    throw new Error('notification recipient smoke: role removal did not list affected notification rule');
  }
});
results.push('cannot disable last notification recipient account: ok (400)');
results.push('cannot remove last notification recipient role from account: ok (400)');

await withDataFileRollback(async () => {
  const createdRole = await writeJson({
    name: 'create notification-only role',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-NOTIFY',
      name: 'Smoke 通知角色',
      owner: '系统管理员',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke 临时通知接收角色。',
    },
  });

  await writeJson({
    name: 'create temporary notification recipient account',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-NOTIFY',
      name: 'Smoke 通知接收账号',
      username: 'smoke-notify',
      roles: 'ROLE-SMOKE-NOTIFY',
      status: '启用',
      description: 'Smoke 临时通知接收账号。',
    },
  });

  await writeJson({
    name: 'create notification using notification-only role',
    path: '/system/notifications',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'NOTICE-SMOKE-ROLE-GUARD',
      name: 'Smoke 角色停用保护通知',
      owner: '系统管理员',
      status: '启用',
      triggerModule: '销售',
      triggerAction: '订单确认',
      receiverRoles: 'ROLE-SMOKE-NOTIFY',
      channel: '站内',
      description: 'Smoke 临时通知规则。',
    },
  });

  const roleNotificationStop = await writeJson({
    name: 'cannot stop role used by enabled notification',
    path: '/system/roles/ROLE-SMOKE-NOTIFY',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...createdRole.record,
      status: '停用',
    },
  });
  if (
    !String(roleNotificationStop.error || '').includes('启用通知规则：Smoke 角色停用保护通知') ||
    !String(roleNotificationStop.error || '').includes('请先从账号和通知规则中移除')
  ) {
    throw new Error('role stop smoke: notification reference was not listed clearly');
  }
});
results.push('cannot stop role used by enabled notification: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create temporary system role',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-SYSTEM',
      name: 'Smoke 系统维护',
      owner: '系统管理员',
      status: '启用',
      permissions: 'PERM-SYSTEM-CONFIG',
      description: 'Smoke 临时系统维护角色。',
    },
  });

  await writeJson({
    name: 'create temporary system account',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-SYSTEM',
      name: 'Smoke 系统账号',
      username: 'smoke-system',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SMOKE-SYSTEM',
      description: 'Smoke 临时系统账号。',
    },
  });

  await writeJson({
    name: 'current system manager cannot remove own system permission',
    path: '/system/accounts/ACC-SMOKE-SYSTEM',
    method: 'PUT',
    account: 'ACC-SMOKE-SYSTEM',
    status: 400,
    body: {
      code: 'ACC-SMOKE-SYSTEM',
      name: 'Smoke 系统账号',
      username: 'smoke-system',
      owner: '系统管理员',
      status: '启用',
      roles: 'ROLE-SALES',
      description: 'Smoke 临时系统账号。',
    },
  });

  await writeJson({
    name: 'current system manager cannot remove own system permission through role',
    path: '/system/roles/ROLE-SMOKE-SYSTEM',
    method: 'PUT',
    account: 'ACC-SMOKE-SYSTEM',
    status: 400,
    body: {
      code: 'ROLE-SMOKE-SYSTEM',
      name: 'Smoke 系统维护',
      owner: '系统管理员',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke 尝试通过角色移除自己的系统配置权限。',
    },
  });
});
results.push('current system manager cannot remove own system permission: ok (400)');
results.push('current system manager cannot remove own system permission through role: ok (400)');

const roleAssignedStop = await writeJson({
  name: 'cannot stop role assigned to active accounts',
  path: '/system/roles/ROLE-SALES',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: { ...salesRole, status: '停用' },
});
if (
  !String(roleAssignedStop.error || '').includes('启用账号：') ||
  !String(roleAssignedStop.error || '').includes('启用通知规则：') ||
  !String(roleAssignedStop.error || '').includes('请先从账号和通知规则中移除')
) {
  throw new Error('role stop smoke: account and notification references were not listed clearly');
}
results.push('cannot stop role assigned to active accounts: ok (400)');

await writeJson({
  name: 'cannot create duplicate system role code',
  path: '/system/roles',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    ...salesRole,
    name: 'Smoke 重复销售角色',
    description: 'Smoke 不允许重复角色编码。',
  },
});
results.push('cannot create duplicate system role code: ok (400)');

await writeJson({
  name: 'cannot create case-insensitive duplicate system role code',
  path: '/system/roles',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    ...salesRole,
    code: salesRole.code.toLowerCase(),
    name: 'Smoke Case Duplicate Role',
    description: 'Smoke role code cannot differ only by letter case.',
  },
});
results.push('cannot create case-insensitive duplicate system role code: ok (400)');

await withDataFileRollback(async () => {
  const autoCodeRole = await writeJson({
    name: 'system role auto code uses role prefix',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      name: 'Smoke Auto Code Role',
      owner: 'System',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke auto-created role code should use ROLE prefix.',
    },
  });
  if (!/^ROLE-\d{4}$/.test(String(autoCodeRole.record?.code || ''))) {
    throw new Error(`system role auto code uses role prefix: got ${autoCodeRole.record?.code || '-'}`);
  }

  const createdLowerCodeRole = await writeJson({
    name: 'system role code is normalized to uppercase',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'role-smoke-lower-code',
      name: 'Smoke Lower Code Role',
      owner: 'System',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke lower-case role code should be normalized.',
    },
  });
  if (createdLowerCodeRole.record?.code !== 'ROLE-SMOKE-LOWER-CODE') {
    throw new Error('system role code is normalized to uppercase: code was not normalized');
  }

  await writeJson({
    name: 'system role code rejects spaces',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'ROLE SMOKE BAD',
      name: 'Smoke Bad Code Role',
      owner: 'System',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke role code should reject spaces.',
    },
  });
});
results.push('system role auto code uses role prefix: ok');
results.push('system role code is normalized to uppercase: ok');
results.push('system role code rejects spaces: ok (400)');

await writeJson({
  name: 'cannot create duplicate system role name',
  path: '/system/roles',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    code: 'ROLE-SMOKE-DUP-NAME',
    name: salesRole.name,
    owner: '系统管理员',
    status: '启用',
    permissions: 'PERM-SALES-EDIT',
    description: 'Smoke 不允许重复角色名称，避免账号和通知按名称解析歧义。',
  },
});
results.push('cannot create duplicate system role name: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create mixed-case role name source',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ROLE-SMOKE-CASE-NAME',
      name: 'Smoke Case Role',
      owner: 'System',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke role used to verify case-insensitive name uniqueness.',
    },
  });

  await writeJson({
    name: 'cannot create case-insensitive duplicate system role name',
    path: '/system/roles',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'ROLE-SMOKE-CASE-NAME-DUP',
      name: 'smoke case role',
      owner: 'System',
      status: '启用',
      permissions: 'PERM-SALES-EDIT',
      description: 'Smoke role name cannot differ only by letter case.',
    },
  });

  const accountWithCaseRole = await writeJson({
    name: 'account role name resolves case-insensitively',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-CASE-ROLE',
      name: 'Smoke Case Role Account',
      username: 'smoke-case-role',
      owner: 'Smoke',
      status: '启用',
      roles: 'smoke case role',
      description: 'Smoke account uses a role name with different letter case.',
    },
  });
  if (accountWithCaseRole.record?.roles !== 'ROLE-SMOKE-CASE-NAME') {
    throw new Error('account role name resolves case-insensitively: role name was not normalized to the role code');
  }

  const accountWithRoleAliases = await writeJson({
    name: 'account role aliases resolve to default role codes',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-ROLE-ALIASES',
      name: 'Smoke Role Alias Account',
      username: 'smoke-role-aliases',
      owner: 'Smoke',
      status: '启用',
      roles: '销售主管,采购主管',
      description: 'Smoke account uses shared default role aliases.',
    },
  });
  if (accountWithRoleAliases.record?.roles !== 'ROLE-SALES,ROLE-PURCHASE') {
    throw new Error('account role aliases resolve to default role codes: aliases were not normalized to shared role codes');
  }
});
results.push('cannot create case-insensitive duplicate system role name: ok (400)');
results.push('account role name resolves case-insensitively: ok');
results.push('account role aliases resolve to default role codes: ok');

await writeJson({
  name: 'enabled role requires at least one permission',
  path: '/system/roles',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    code: 'ROLE-SMOKE-EMPTY',
    name: 'Smoke Empty Role',
    owner: 'System',
    status: '启用',
    permissions: '',
    description: 'Smoke role without permissions.',
  },
});
results.push('enabled role requires at least one permission: ok (400)');

await writeJson({
  name: 'enabled role cannot clear display name',
  path: '/system/roles/ROLE-SALES',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: { ...salesRole, name: '' },
});
results.push('enabled role cannot clear display name: ok (400)');

await writeJson({
  name: 'system permissions cannot be created manually',
  path: '/system/permissions',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 405,
  body: {
    code: 'PERM-SMOKE-UNWIRED',
    name: 'Smoke Unwired Permission',
    owner: 'System',
    status: '启用',
    description: 'Smoke permission without a business capability.',
  },
});
results.push('system permissions cannot be created manually: ok (405)');

await writeJson({
  name: 'system menus cannot be created manually',
  path: '/system/menus',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 405,
  body: {
    code: 'MENU-SMOKE-UNWIRED',
    name: 'Smoke Unwired Menu',
    path: '/smoke/unwired',
    permissionCode: 'PERM-SYSTEM-CONFIG',
  },
});
results.push('system menus cannot be created manually: ok (405)');

const permissionUsedByRolesOrMenus = await writeJson({
  name: 'cannot stop permission still used by roles or menus',
  path: '/system/permissions/PERM-SALES-EDIT',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: { ...salesPermission, status: '停用' },
});
if (
  !String(permissionUsedByRolesOrMenus.error || '').includes('启用角色：销售') ||
  !String(permissionUsedByRolesOrMenus.error || '').includes('启用菜单：销售') ||
  !String(permissionUsedByRolesOrMenus.error || '').includes('启用操作权限：销售单据确认')
) {
  throw new Error('permission stop smoke: role/menu usage error did not include concrete references');
}
results.push('cannot stop permission still used by roles or menus: ok (400)');

await writeJson({
  name: 'cannot duplicate login username',
  path: '/system/accounts/ACC-WAREHOUSE',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: { ...warehouseAccount, username: salesAccount.username },
});
results.push('cannot duplicate login username: ok (400)');

await writeJson({
  name: 'cannot use another account code as login username',
  path: '/system/accounts/ACC-WAREHOUSE',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: { ...warehouseAccount, username: salesAccount.code },
});
results.push('cannot use another account code as login username: ok (400)');

await writeJson({
  name: 'cannot create account code matching another login username',
  path: '/system/accounts',
  method: 'POST',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: {
    code: salesAccount.username,
    name: 'Smoke Identity Code Conflict',
    username: 'smoke-code-conflict',
    owner: 'Smoke',
    status: '启用',
    roles: 'ROLE-SALES',
    description: 'Smoke account code cannot reuse another login username.',
  },
});
results.push('cannot create account code matching another login username: ok (400)');

await withDataFileRollback(async () => {
  const normalizedUsernameAccount = await writeJson({
    name: 'account username is normalized to lowercase',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'ACC-SMOKE-USERNAME-NORM',
      name: 'Smoke Username Normalize',
      username: 'SMOKE.USER_NAME',
      owner: 'Smoke',
      status: '启用',
      roles: 'ROLE-SALES',
      description: 'Smoke account username should be normalized.',
    },
  });
  if (normalizedUsernameAccount.record?.username !== 'smoke.user_name') {
    throw new Error('account username is normalized to lowercase: username was not normalized');
  }

  await writeJson({
    name: 'account username rejects unsupported characters',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'ACC-SMOKE-USERNAME-BAD',
      name: 'Smoke Bad Username',
      username: 'smoke!bad',
      owner: 'Smoke',
      status: '启用',
      roles: 'ROLE-SALES',
      description: 'Smoke account username should reject punctuation outside the supported set.',
    },
  });
});
results.push('account username is normalized to lowercase: ok');
results.push('account username rejects unsupported characters: ok (400)');

await writeJson({
  name: 'cannot duplicate linked employee',
  path: '/system/accounts/ACC-WAREHOUSE',
  account: 'ACC-ZHANGSAN',
  status: 400,
  body: { ...warehouseAccount, employeeCode: salesAccount.employeeCode },
});
results.push('cannot duplicate linked employee: ok (400)');

await withDataFileRollback(async () => {
  await writeJson({
    name: 'create disabled employee for account link smoke',
    path: '/master-data/employees',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'EMP-SMOKE-DISABLED',
      name: 'Smoke 停用员工',
      type: '员工',
      owner: '销售管理部',
      position: '销售专员',
      contact: '138****0666',
      email: 'disabled-smoke@filatrix.local',
      status: '停用',
      note: 'Smoke 临时停用员工。',
    },
  });

  await writeJson({
    name: 'enabled account cannot link disabled employee',
    path: '/system/accounts',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      code: 'ACC-SMOKE-DISABLED-EMP',
      username: 'smoke-disabled-emp',
      employeeCode: 'EMP-SMOKE-DISABLED',
      roles: 'ROLE-SALES',
      status: '启用',
      description: 'Smoke 临时账号。',
    },
  });
});
results.push('enabled account cannot link disabled employee: ok (400)');

await withDataFileRollback(async () => {
  const employees = await readJson({
    name: 'employees before linked account hydration smoke',
    path: '/master-data/employees',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesEmployee = employees.items?.find((row) => row.code === 'EMP-LM');
  if (!salesEmployee) throw new Error('account employee hydration smoke: EMP-LM missing');

  const createdDepartment = await writeJson({
    name: 'create temporary sales department for employee hydration smoke',
    path: '/master-data/departments',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'DEP-SMOKE-SALES',
      name: 'Smoke 销售部门',
      owner: 'Filatrix 增材材料有限公司',
      parentDepartment: '',
      status: '启用',
      note: 'Smoke 临时销售部门。',
    },
  });
  const departmentCode = createdDepartment.record?.code;
  if (!departmentCode) throw new Error('account employee hydration smoke: temporary department code missing');

  await writeJson({
    name: 'update linked employee contact fields',
    path: '/master-data/employees/EMP-LM',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 200,
    body: {
      ...salesEmployee,
      departmentCode,
      owner: 'Smoke 销售部门',
      phone: '138****0888',
      email: 'sales-smoke@filatrix.local',
    },
  });

  const accounts = await readJson({
    name: 'accounts after linked employee update',
    path: '/system/accounts',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const hydratedSalesAccount = accounts.items?.find((row) => row.code === 'ACC-SALES');
  if (
    !hydratedSalesAccount ||
    hydratedSalesAccount.department !== 'Smoke 销售部门' ||
    hydratedSalesAccount.phone !== '138****0888' ||
    hydratedSalesAccount.email !== 'sales-smoke@filatrix.local'
  ) {
    throw new Error('account employee hydration smoke: linked account did not reflect employee fields');
  }
});
results.push('linked account reflects employee contact changes: ok');

await withDataFileRollback(async () => {
  const employees = await readJson({
    name: 'employees before linked employee disable smoke',
    path: '/master-data/employees',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesEmployee = employees.items?.find((row) => row.code === 'EMP-LM');
  if (!salesEmployee) throw new Error('linked employee disable smoke: EMP-LM missing');

  await writeJson({
    name: 'cannot disable employee linked to active account',
    path: '/master-data/employees/EMP-LM',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesEmployee,
      status: '停用',
    },
  });
});
results.push('cannot disable employee linked to active account: ok (400)');

await withDataFileRollback(async () => {
  const employees = await readJson({
    name: 'employees before linked department disable smoke',
    path: '/master-data/employees',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesEmployee = employees.items?.find((row) => row.code === 'EMP-LM');
  if (!salesEmployee?.owner) throw new Error('linked department disable smoke: EMP-LM department missing');

  const departments = await readJson({
    name: 'departments before linked department disable smoke',
    path: '/master-data/departments',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const linkedDepartment = departments.items?.find((row) => row.name === salesEmployee.owner || row.code === salesEmployee.owner);
  if (!linkedDepartment) throw new Error('linked department disable smoke: referenced department missing');

  await writeJson({
    name: 'cannot disable department linked to active employees',
    path: `/master-data/departments/${encodeURIComponent(linkedDepartment.code)}`,
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...linkedDepartment,
      status: '停用',
    },
  });
});
results.push('cannot disable department linked to active employees: ok (400)');

await withDataFileRollback(async () => {
  const employees = await readJson({
    name: 'employees before invalid department owner smoke',
    path: '/master-data/employees',
    account: 'ACC-ZHANGSAN',
    status: 200,
  });
  const salesEmployee = employees.items?.find((row) => row.code === 'EMP-LM');
  if (!salesEmployee) throw new Error('invalid employee department smoke: EMP-LM missing');

  await writeJson({
    name: 'create disabled department for employee owner smoke',
    path: '/master-data/departments',
    method: 'POST',
    account: 'ACC-ZHANGSAN',
    status: 201,
    body: {
      code: 'DEP-SMOKE-DISABLED',
      name: 'Smoke 停用部门',
      owner: 'Filatrix 增材材料有限公司',
      parentDepartment: '',
      status: '停用',
      note: 'Smoke 临时停用部门。',
    },
  });

  await writeJson({
    name: 'enabled employee cannot use disabled department',
    path: '/master-data/employees/EMP-LM',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesEmployee,
      owner: 'Smoke 停用部门',
      status: '启用',
    },
  });

  await writeJson({
    name: 'enabled employee requires valid department',
    path: '/master-data/employees/EMP-LM',
    method: 'PUT',
    account: 'ACC-ZHANGSAN',
    status: 400,
    body: {
      ...salesEmployee,
      owner: 'Smoke 不存在部门',
      status: '启用',
    },
  });
});
results.push('enabled employee cannot use disabled department: ok (400)');
results.push('enabled employee requires valid department: ok (400)');

console.log(`API smoke passed: ${baseUrl}`);
results.forEach((line) => console.log(`- ${line}`));
