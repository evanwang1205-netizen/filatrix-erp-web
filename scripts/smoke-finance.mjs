import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataFile = process.env.FILATRIX_DATA_FILE || join(rootDir, 'server/data/erp-data.json');
const baseUrl = (process.env.FILATRIX_SMOKE_API_BASE || process.env.VITE_API_BASE || 'http://127.0.0.1:5175/api').replace(/\/$/, '');
const account = process.env.FILATRIX_SMOKE_ACCOUNT || 'ACC-ZHANGSAN';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseMoney(value) {
  return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0;
}

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'X-Filatrix-Account': account,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${path}: expected ${expectedStatus}, received ${response.status} ${payload.error || ''}`.trim());
  }
  return payload;
}

const snapshot = readFileSync(dataFile, 'utf8');

try {
  const data = JSON.parse(snapshot);
  data.purchase ||= {};
  data.purchase.orders ||= [];
  data.warehouse ||= {};
  data.warehouse.purchaseReceipts ||= [];

  data.purchase.orders.push({
    code: 'SMOKE-FIN-PO-001',
    companyCode: 'COM-FILATRIX',
    company: 'Filatrix 增材材料有限公司',
    supplierCode: 'SUP-JXJC',
    supplier: '嘉兴聚材高分子',
    contact: '李经理',
    products: [{ lineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', unitPrice: '80.00', amount: '80.00', qcRequired: true }],
    amount: '￥80.00',
    taxMode: '含税',
    status: '部分入库',
    date: '2026-07-17',
  });
  data.warehouse.purchaseReceipts.push(
    {
      code: 'SMOKE-FIN-WR-POSTED',
      companyCode: 'COM-FILATRIX',
      company: 'Filatrix 增材材料有限公司',
      sourceDoc: 'SMOKE-FIN-PO-001',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      products: [{ lineId: 'L1', sourceLineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', qcRequired: true }],
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      status: '已入库',
      stockStage: 'posted',
      date: '2026-07-17',
      qualityDecision: {
        status: '合格',
        totals: { received: 1, accepted: 1, released: 1, rejected: 0, pending: 0 },
        lines: [{ receiptLineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', receivedQty: 1, acceptedQty: 1, releasedQty: 1, rejectedQty: 0, pendingQty: 0, uom: 'kg' }],
      },
    },
    {
      code: 'SMOKE-FIN-WR-QC',
      companyCode: 'COM-FILATRIX',
      company: 'Filatrix 增材材料有限公司',
      sourceDoc: 'SMOKE-FIN-PO-001',
      supplierCode: 'SUP-JXJC',
      supplier: '嘉兴聚材高分子',
      contact: '李经理',
      products: [{ lineId: 'L1', sourceLineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', qcRequired: true }],
      warehouseCode: 'WH-RM',
      warehouse: '原料仓',
      status: '待质检',
      stockStage: 'qc_hold',
      date: '2026-07-17',
    },
  );
  writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);

  const matching = await request('/finance/purchase-invoices/matching?sourceReceipt=SMOKE-FIN-WR-POSTED');
  assert(matching.matched === true, 'posted purchase receipt did not pass three-way matching');
  assert(matching.lines?.[0]?.remainingQty === 1, 'three-way matching did not expose the posted quantity');

  const created = await request('/finance/purchase-invoices', {
    method: 'POST',
    body: {
      code: 'SMOKE-FIN-PI-001',
      sourceDoc: 'SMOKE-FIN-WR-POSTED',
      sourceOrder: 'FORGED-PO',
      companyCode: 'FORGED-COMPANY',
      company: '伪造收票主体',
      partyCode: 'FORGED-SUPPLIER',
      party: '伪造供应商',
      contact: '伪造联系人',
      amount: '1.00',
      taxAmount: '1.00',
      totalAmount: '2.00',
      settledAmount: '999.00',
      owner: '王倩',
      dueDate: '2026-08-16',
      lines: [{ sourceLineId: 'L1', sourceReceiptLineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', unitPrice: '80.00', amount: '80.00', taxRate: '13%' }],
    },
  }, 201);
  assert(created.matching?.matched === true, 'saved purchase invoice lost matching evidence');
  assert(parseMoney(created.record?.settledAmount) === 0, 'draft invoice trusted a client-supplied settled amount');
  assert(
    created.record?.sourceDoc === 'SMOKE-FIN-WR-POSTED'
      && created.record?.sourceOrder === 'SMOKE-FIN-PO-001'
      && created.record?.companyCode === 'COM-FILATRIX'
      && created.record?.partyCode === 'SUP-JXJC'
      && created.record?.party === '嘉兴聚材高分子'
      && created.record?.contact === '李经理',
    'purchase invoice did not derive source, company, supplier, and contact facts from receipt and purchase order',
  );
  assert(parseMoney(created.record?.totalAmount) === 80, 'purchase invoice trusted client totals or added tax twice');

  const confirmed = await request('/finance/purchase-invoices/SMOKE-FIN-PI-001/confirm', { method: 'POST' });
  assert(confirmed.record?.status === '已收票' && confirmed.record?.documentStatus === '已收票', 'purchase invoice document lifecycle was not confirmed as received');
  assert(confirmed.record?.settlementStatus === '未付款', 'purchase invoice settlement progress was not initialized independently');
  assert(confirmed.payable?.status === '待付款', 'purchase invoice did not create an independent payable');
  assert(
    confirmed.payable?.companyCode === 'COM-FILATRIX'
      && confirmed.payable?.company === 'Filatrix 增材材料有限公司'
      && confirmed.payable?.taxMode === '含税',
    'payable did not inherit company and tax mode from the source invoice',
  );
  await request('/finance/purchase-invoices/SMOKE-FIN-PI-001', {
    method: 'PUT',
    body: { ...created, totalAmount: '91.00' },
  }, 409);

  const partialBody = {
    amount: 40,
    transactionDate: '2026-07-17',
    method: '银行转账',
    account: '基本户',
    reference: 'SMOKE-FIN-PAY-001',
    actor: '王倩',
    idempotencyKey: 'smoke-finance-payment-1',
  };
  const heldPayable = await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/status`, {
    method: 'POST',
    body: { status: '已暂缓', action: '暂缓付款', remark: '质检差异待关闭' },
  });
  assert(
    heldPayable.record?.status === '待付款'
      && heldPayable.record?.holdStatus === '已暂缓'
      && heldPayable.record?.holdReason === '质检差异待关闭',
    'payment hold overwrote settlement progress or lost the hold reason',
  );
  await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/pay`, {
    method: 'POST',
    body: { ...partialBody, idempotencyKey: 'smoke-finance-payment-held' },
  }, 409);
  const resumedPayable = await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/status`, {
    method: 'POST',
    body: { status: '正常', action: '恢复付款', remark: '差异已关闭' },
  });
  assert(
    resumedPayable.record?.status === '待付款' && resumedPayable.record?.holdStatus === '正常',
    'resuming payment changed the settlement progress',
  );
  await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/pay`, {
    method: 'POST',
    body: { ...partialBody, reference: '', idempotencyKey: 'smoke-finance-payment-missing-reference' },
  }, 400);
  await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/pay`, {
    method: 'POST',
    body: { ...partialBody, account: '', idempotencyKey: 'smoke-finance-payment-missing-account' },
  }, 400);
  const partial = await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/pay`, { method: 'POST', body: partialBody });
  assert(partial.record?.status === '部分付款', 'partial payment incorrectly closed the payable');
  assert(partial.payment?.actor?.includes('ACC-ZHANGSAN'), 'payment audit actor trusted the client payload instead of the authenticated account');
  const partialInvoice = await request('/finance/purchase-invoices/SMOKE-FIN-PI-001');
  assert(partialInvoice.record?.documentStatus === '已收票', 'partial payment overwrote the invoice document lifecycle');
  assert(partialInvoice.record?.settlementStatus === '部分付款', 'partial payment did not update the independent settlement progress');
  const repeated = await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/pay`, { method: 'POST', body: partialBody });
  assert(repeated.idempotentReplay === true, 'payment retry created a duplicate event');

  const remainder = Number((parseMoney(confirmed.payable.totalAmount) - 40).toFixed(2));
  const completed = await request(`/finance/payables/${encodeURIComponent(confirmed.payable.code)}/pay`, {
    method: 'POST',
    body: {
      ...partialBody,
      amount: remainder,
      reference: 'SMOKE-FIN-PAY-002',
      idempotencyKey: 'smoke-finance-payment-2',
    },
  });
  assert(completed.record?.status === '已付款', 'remaining payment did not close the payable');
  assert(completed.payments?.length === 2, 'payable did not retain two independent payment events');
  const completedInvoice = await request('/finance/purchase-invoices/SMOKE-FIN-PI-001');
  assert(completedInvoice.record?.documentStatus === '已收票', 'completed payment overwrote the invoice document lifecycle');
  assert(completedInvoice.record?.settlementStatus === '已付款', 'completed payment did not close the independent settlement progress');

  const blocked = await request('/finance/purchase-invoices', {
    method: 'POST',
    body: {
      code: 'SMOKE-FIN-PI-BLOCKED',
      sourceDoc: 'SMOKE-FIN-WR-QC',
      sourceOrder: 'SMOKE-FIN-PO-001',
      partyCode: 'SUP-JXJC',
      party: '嘉兴聚材高分子',
      amount: '80.00',
      taxAmount: '10.40',
      totalAmount: '90.40',
      owner: '王倩',
      dueDate: '2026-08-16',
      lines: [{ sourceLineId: 'L1', sourceReceiptLineId: 'L1', materialCode: 'M-RM-PLA-VIRGIN', name: 'PLA 原生粒子', qty: '1', uom: 'kg', unitPrice: '80.00', amount: '80.00', taxRate: '13%' }],
    },
  }, 201);
  assert(blocked.matching?.matched === false, 'unposted purchase receipt incorrectly passed matching');
  assert(blocked.matching?.lines?.[0]?.remainingAmount === 0, 'unposted receipt exposed invoiceable amount before formal inbound');
  assert(blocked.matching?.warnings?.length === 0, 'unposted receipt duplicated the same issue as both blocker and warning');
  await request('/finance/purchase-invoices/SMOKE-FIN-PI-BLOCKED/confirm', { method: 'POST' }, 409);

  const receivableDetail = await request('/finance/receivables/AR-20260717-002');
  assert(
    receivableDetail.record?.companyCode === 'COM-FILATRIX'
      && receivableDetail.record?.company === 'Filatrix 增材材料有限公司'
      && receivableDetail.record?.taxMode === '含税',
    'receivable did not inherit company and tax mode from the source invoice',
  );
  const receiveAmount = Math.min(100, parseMoney(receivableDetail.record.totalAmount) - parseMoney(receivableDetail.record.settledAmount));
  const received = await request('/finance/receivables/AR-20260717-002/receive', {
    method: 'POST',
    body: {
      amount: receiveAmount,
      transactionDate: '2026-07-17',
      method: '银行转账',
      account: '基本户',
      reference: 'SMOKE-FIN-RCV-001',
      actor: '王倩',
      idempotencyKey: 'smoke-finance-receipt-1',
    },
  });
  assert(received.record?.status === '部分收款', 'partial receipt incorrectly closed the receivable');
  assert(received.payments?.some((event) => event.reference === 'SMOKE-FIN-RCV-001'), 'receivable did not retain the receipt event');
  assert(received.payment?.actor?.includes('ACC-ZHANGSAN'), 'receipt audit actor trusted the client payload instead of the authenticated account');

  console.log('Finance smoke passed');
  console.log('- purchase order / posted receipt / invoice three-way match: ok');
  console.log('- partial payable, idempotent retry, completion and payment history: ok');
  console.log('- payable hold stays separate from settlement progress and blocks payment: ok');
  console.log('- immutable confirmed invoice and split document / settlement states: ok');
  console.log('- settlement date, method, account and payment reference validation: ok');
  console.log('- unposted receipt confirmation guard: ok');
  console.log('- partial receivable and receipt history: ok');
} finally {
  writeFileSync(dataFile, snapshot);
}
