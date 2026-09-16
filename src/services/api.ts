import type {
  AfterSalesExecutionTask,
  Attachment,
  FlowRecord,
  FinanceRecord,
  FinanceSettlementEvent,
  PurchaseAfterSale,
  PurchaseOrder,
  PurchaseRequisition,
  PurchaseSuggestionItem,
  PurchaseInboundDetailProjection,
  PurchaseReceipt,
  ReferenceResponse,
  SalesDeliveryRecord,
  SalesOrder,
  SalesAfterSale,
  SalesQuote,
  SalesIssue,
  SalesOutboundRequest,
  SalesInventoryProjectionRow,
  StockLedgerRow,
  WarehouseInventoryRow,
  WarehouseReplenishmentDocument,
  WarehouseReplenishmentSignal,
  WarehouseOtherMove,
  WarehouseProductionIssue,
  WarehouseProductionReturn,
  WarehouseProductionReceipt,
  WarehouseReversal,
  WarehouseStocktake,
  WarehouseTransfer,
  SalesInvoiceReversal,
  SalesRefund,
  PurchaseInvoiceMatch,
} from '../types/business';
import type {
  Production2Exception,
  Production2ExecutionCard,
  Production2ExecutionEvent,
  Production2BatchLineageRecord,
  Production2LossRecord,
  Production2OperationJob,
  Production2QualityCheckpointResult,
  Production2QualityTask,
  Production2ReleaseBatch,
  Production2ShiftHandover,
  Production2Task,
  Production2WipBatch,
} from '../data/production2';
import type { MasterDataRecord } from '../data/masterData';
import type {
  EquipmentInspectionPlan,
  EquipmentInspectionResponse,
  EquipmentInspectionStandard,
  EquipmentInspectionTask,
} from '../data/equipment';
import type { QualityRecord, QualityStandardRecord } from '../data/quality';

const fallbackApiBase = 'http://127.0.0.1:5175/api';
const currentAccountStorageKey = 'filatrix-current-account';
const sessionTokenStorageKey = 'filatrix-session-token';
export const sessionExpiredEventName = 'filatrix-session-expired';

export const apiBase = (import.meta.env.VITE_API_BASE || fallbackApiBase).replace(/\/$/, '');

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getStoredSessionToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(sessionTokenStorageKey) || '';
}

export function storeSessionToken(token: string) {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(sessionTokenStorageKey, token);
  } else {
    window.localStorage.removeItem(sessionTokenStorageKey);
  }
}

export function clearStoredSessionToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(sessionTokenStorageKey);
}

function notifySessionExpired(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(sessionExpiredEventName, { detail: { message } }));
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const { body, ...restOptions } = options;
  const init: RequestInit = { ...restOptions, headers };
  const sessionToken = getStoredSessionToken();
  const currentAccount =
    typeof window === 'undefined' ? '' : window.localStorage.getItem(currentAccountStorageKey) || '';

  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  } else if (currentAccount && !headers.has('X-Filatrix-Account')) {
    headers.set('X-Filatrix-Account', currentAccount);
  }

  if (body === undefined || body === null) {
    delete init.body;
  } else if (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    init.body = body;
  } else {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${apiBase}${path}`, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = payload.error || `请求失败：${response.status}`;
    if (response.status === 401) {
      clearStoredSessionToken();
      if (sessionToken) notifySessionExpired(errorMessage);
    }
    throw new ApiError(errorMessage, response.status);
  }

  return payload as T;
}

export async function listReference<T = Record<string, unknown>>(
  type: string,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return request<ReferenceResponse<T>>(`/reference/${type}${query ? `?${query}` : ''}`);
}

export async function listSalesOrders() {
  const payload = await request<{ items: SalesOrder[] }>('/sales/orders');
  return payload.items;
}

export async function listSalesQuotes() {
  const payload = await request<{ items: SalesQuote[] }>('/sales/quotes');
  return payload.items;
}

export async function getSalesQuote(code: string) {
  return request<{ quote: SalesQuote; flowRecords: FlowRecord[] }>(
    `/sales/quotes/${encodeURIComponent(code)}`,
  );
}

export async function saveSalesQuote(quote: SalesQuote) {
  const isNew = !quote.code || quote.code === '系统自动生成';
  const path = isNew ? '/sales/quotes' : `/sales/quotes/${encodeURIComponent(quote.code)}`;
  return request<{ quote: SalesQuote; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: quote,
  });
}

export async function confirmSalesQuote(code: string, revision: number) {
  return request<{ quote: SalesQuote; flowRecords: FlowRecord[] }>(
    `/sales/quotes/${encodeURIComponent(code)}/confirm`,
    { method: 'POST', body: { revision } },
  );
}

export async function voidSalesQuote(code: string, revision: number) {
  return request<{ quote: SalesQuote; flowRecords: FlowRecord[] }>(
    `/sales/quotes/${encodeURIComponent(code)}/void`,
    { method: 'POST', body: { revision } },
  );
}

export async function getSalesOrder(code: string) {
  return request<{ order: SalesOrder; flowRecords: FlowRecord[] }>(
    `/sales/orders/${encodeURIComponent(code)}`,
  );
}

export async function saveSalesOrder(order: SalesOrder, options: { changeMode?: boolean } = {}) {
  const isNew = !order.code || order.code === '系统自动生成';
  const path = isNew ? '/sales/orders' : `/sales/orders/${encodeURIComponent(order.code)}`;
  return request<{ order: SalesOrder; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: isNew ? order : { ...order, _operation: options.changeMode ? 'change' : 'save' },
  });
}

export async function confirmSalesOrder(code: string, revision: number) {
  return request<{ order: SalesOrder; flowRecords: FlowRecord[] }>(
    `/sales/orders/${encodeURIComponent(code)}/confirm`,
    { method: 'POST', body: { revision } },
  );
}

export async function confirmSalesOrderReceipt(code: string, revision: number) {
  return request<{ order: SalesOrder; flowRecords: FlowRecord[] }>(
    `/sales/orders/${encodeURIComponent(code)}/confirm-receipt`,
    { method: 'POST', body: { revision } },
  );
}

export async function closeSalesOrderDeliveryRemainder(code: string, revision: number, reason: string) {
  return request<{
    order: SalesOrder;
    closures: NonNullable<SalesOrder['deliveryClosures']>;
    flowRecords: FlowRecord[];
  }>(
    `/sales/orders/${encodeURIComponent(code)}/close-remainder`,
    { method: 'POST', body: { revision, reason } },
  );
}

export async function voidSalesOrder(code: string, revision: number) {
  return request<{ order: SalesOrder; flowRecords: FlowRecord[] }>(
    `/sales/orders/${encodeURIComponent(code)}/void`,
    { method: 'POST', body: { revision } },
  );
}

export async function deleteSalesOrder(code: string) {
  return request<{ deletedCode: string }>(`/sales/orders/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

export async function listSalesOutboundRequests() {
  const payload = await request<{ items: SalesOutboundRequest[] }>('/sales/outbound-requests');
  return payload.items;
}

export async function listSalesDeliveryRecords(sourceOrder = '') {
  const query = sourceOrder ? `?sourceOrder=${encodeURIComponent(sourceOrder)}` : '';
  const payload = await request<{ items: SalesDeliveryRecord[] }>(`/sales/delivery-records${query}`);
  return payload.items;
}

export async function getSalesOutboundRequest(code: string) {
  return request<{ request: SalesOutboundRequest; flowRecords: FlowRecord[] }>(
    `/sales/outbound-requests/${encodeURIComponent(code)}`,
  );
}

export async function saveSalesOutboundRequest(requestDoc: SalesOutboundRequest) {
  const isNew = !requestDoc.code || requestDoc.code === '系统自动生成';
  const path = isNew
    ? '/sales/outbound-requests'
    : `/sales/outbound-requests/${encodeURIComponent(requestDoc.code)}`;
  return request<{ request: SalesOutboundRequest; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: requestDoc,
  });
}

export async function submitSalesOutboundRequest(code: string) {
  return request<{ request: SalesOutboundRequest; flowRecords: FlowRecord[] }>(
    `/sales/outbound-requests/${encodeURIComponent(code)}/submit`,
    { method: 'POST' },
  );
}

export async function listSalesAfterSales() {
  const payload = await request<{ items: SalesAfterSale[] }>('/sales/after-sales');
  return payload.items;
}

export async function getSalesAfterSale(code: string) {
  return request<{ record: SalesAfterSale; flowRecords: FlowRecord[] }>(
    `/sales/after-sales/${encodeURIComponent(code)}`,
  );
}

export async function saveSalesAfterSale(record: SalesAfterSale) {
  const isNew = !record.code || record.code === '系统自动生成';
  const path = isNew
    ? '/sales/after-sales'
    : `/sales/after-sales/${encodeURIComponent(record.code)}`;
  return request<{ record: SalesAfterSale; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
}

export async function advanceSalesAfterSale(code: string, revision: number) {
  return request<{ record: SalesAfterSale; flowRecords: FlowRecord[] }>(
    `/sales/after-sales/${encodeURIComponent(code)}/advance`,
    { method: 'POST', body: { revision } },
  );
}

export async function voidSalesAfterSale(code: string, revision: number) {
  return request<{ record: SalesAfterSale; flowRecords: FlowRecord[] }>(
    `/sales/after-sales/${encodeURIComponent(code)}/void`,
    { method: 'POST', body: { revision } },
  );
}

export type SalesRuntimeType = 'quotes' | 'orders' | 'outbound-requests';

export async function updateSalesStatus(
  type: SalesRuntimeType,
  code: string,
  payload: { status: string; action: string; remark: string },
) {
  return request<{ record: SalesQuote | SalesOrder | SalesOutboundRequest; flowRecords: FlowRecord[] }>(
    `/sales/${type}/${encodeURIComponent(code)}/status`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function listPurchaseOrders() {
  const payload = await request<{ items: PurchaseOrder[] }>('/purchase/orders');
  return payload.items;
}

export async function listPurchaseRequisitions() {
  const payload = await request<{ items: PurchaseRequisition[] }>('/purchase/requisitions');
  return payload.items;
}

export async function listPurchaseSuggestions() {
  const payload = await request<{ items: PurchaseSuggestionItem[] }>('/purchase/suggestions');
  return payload.items;
}

export async function getPurchaseRequisition(code: string) {
  return request<{ requisition: PurchaseRequisition; flowRecords: FlowRecord[] }>(
    `/purchase/requisitions/${encodeURIComponent(code)}`,
  );
}

export async function savePurchaseRequisition(requisition: PurchaseRequisition) {
  const isNew = !requisition.code || requisition.code === '系统自动生成';
  const path = isNew ? '/purchase/requisitions' : `/purchase/requisitions/${encodeURIComponent(requisition.code)}`;
  return request<{ requisition: PurchaseRequisition; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: requisition,
  });
}

export async function submitPurchaseRequisition(code: string) {
  return request<{ requisition: PurchaseRequisition; flowRecords: FlowRecord[] }>(
    `/purchase/requisitions/${encodeURIComponent(code)}/submit`,
    { method: 'POST' },
  );
}

export async function deletePurchaseRequisition(code: string) {
  return request<{ deletedCode: string }>(`/purchase/requisitions/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

export async function getPurchaseOrder(code: string) {
  return request<{ order: PurchaseOrder; flowRecords: FlowRecord[] }>(
    `/purchase/orders/${encodeURIComponent(code)}`,
  );
}

export async function savePurchaseOrder(order: PurchaseOrder, options: { changeMode?: boolean } = {}) {
  const isNew = !order.code || order.code === '系统自动生成';
  const path = isNew ? '/purchase/orders' : `/purchase/orders/${encodeURIComponent(order.code)}`;
  return request<{ order: PurchaseOrder; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: isNew ? order : { ...order, _operation: options.changeMode ? 'change' : 'save' },
  });
}

export async function confirmPurchaseOrder(code: string) {
  return request<{ order: PurchaseOrder; flowRecords: FlowRecord[] }>(
    `/purchase/orders/${encodeURIComponent(code)}/confirm`,
    { method: 'POST' },
  );
}

export async function closePurchaseOrder(code: string) {
  return request<{ order: PurchaseOrder; flowRecords: FlowRecord[] }>(
    `/purchase/orders/${encodeURIComponent(code)}/close`,
    { method: 'POST' },
  );
}

export async function closePurchaseOrderReceiptRemainder(code: string, reason: string) {
  return request<{
    order: PurchaseOrder;
    closures: NonNullable<PurchaseOrder['receiptClosures']>;
    flowRecords: FlowRecord[];
  }>(
    `/purchase/orders/${encodeURIComponent(code)}/close-remainder`,
    { method: 'POST', body: { reason } },
  );
}

export async function deletePurchaseOrder(code: string) {
  return request<{ deletedCode: string }>(`/purchase/orders/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

export type PurchaseRuntimeType = 'requisitions' | 'orders';

export async function updatePurchaseStatus(
  type: PurchaseRuntimeType,
  code: string,
  payload: { status: string; action: string; remark: string },
) {
  return request<{ record: PurchaseRequisition | PurchaseOrder; flowRecords: FlowRecord[] }>(
    `/purchase/${type}/${encodeURIComponent(code)}/status`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function listPurchaseAfterSales() {
  const payload = await request<{ items: PurchaseAfterSale[] }>('/purchase/after-sales');
  return payload.items;
}

export async function getPurchaseAfterSale(code: string) {
  return request<{ record: PurchaseAfterSale; flowRecords: FlowRecord[] }>(
    `/purchase/after-sales/${encodeURIComponent(code)}`,
  );
}

export async function savePurchaseAfterSale(record: PurchaseAfterSale) {
  const isNew = !record.code || record.code === '系统自动生成';
  const path = isNew ? '/purchase/after-sales' : `/purchase/after-sales/${encodeURIComponent(record.code)}`;
  return request<{ record: PurchaseAfterSale; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
}

export async function advancePurchaseAfterSale(code: string, revision: number) {
  return request<{ record: PurchaseAfterSale; flowRecords: FlowRecord[] }>(
    `/purchase/after-sales/${encodeURIComponent(code)}/advance`,
    { method: 'POST', body: { revision } },
  );
}

export async function voidPurchaseAfterSale(code: string, revision: number) {
  return request<{ record: PurchaseAfterSale; flowRecords: FlowRecord[] }>(
    `/purchase/after-sales/${encodeURIComponent(code)}/void`,
    { method: 'POST', body: { revision } },
  );
}

export type AfterSalesExecutionModulePath = 'warehouse' | 'quality' | 'production';

export async function listAfterSalesExecutionTasks(module: AfterSalesExecutionModulePath) {
  const payload = await request<{ items: AfterSalesExecutionTask[] }>(`/${module}/after-sales-tasks`);
  return payload.items;
}

export async function getAfterSalesExecutionTask(module: AfterSalesExecutionModulePath, code: string) {
  return request<{
    task: AfterSalesExecutionTask & {
      companyCode?: string;
      company?: string;
      partyCode?: string;
      products?: SalesAfterSale['products'];
      stockFacts?: Array<Record<string, unknown>>;
      adjustmentCode?: string;
    };
    afterSale: SalesAfterSale | PurchaseAfterSale;
  }>(`/${module}/after-sales-tasks/${encodeURIComponent(code)}`);
}

export async function startAfterSalesExecutionTask(module: AfterSalesExecutionModulePath, code: string) {
  return request<{ task: AfterSalesExecutionTask; repeated: boolean }>(
    `/${module}/after-sales-tasks/${encodeURIComponent(code)}/start`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function completeAfterSalesExecutionTask(
  module: AfterSalesExecutionModulePath,
  code: string,
  payload: Record<string, unknown>,
) {
  return request<{ task: AfterSalesExecutionTask; afterSale?: SalesAfterSale | PurchaseAfterSale; repeated: boolean }>(
    `/${module}/after-sales-tasks/${encodeURIComponent(code)}/complete`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export async function listPurchaseReceipts() {
  const payload = await request<{ items: PurchaseReceipt[] }>('/warehouse/purchase-receipts');
  return payload.items;
}

export async function getPurchaseReceipt(code: string) {
  return request<{
    receipt: PurchaseReceipt;
    flowRecords: FlowRecord[];
    detailProjection: PurchaseInboundDetailProjection;
  }>(
    `/warehouse/purchase-receipts/${encodeURIComponent(code)}`,
  );
}

export async function savePurchaseReceipt(receipt: PurchaseReceipt) {
  const isNew = !receipt.code || receipt.code === '系统自动生成';
  const path = isNew ? '/warehouse/purchase-receipts' : `/warehouse/purchase-receipts/${encodeURIComponent(receipt.code)}`;
  return request<{ receipt: PurchaseReceipt; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: receipt,
  });
}

export async function postPurchaseReceipt(
  code: string,
  payload?: {
    allocations?: PurchaseReceipt['inboundAllocations'];
    idempotencyKey?: string;
  },
) {
  return request<{
    receipt: PurchaseReceipt;
    flowRecords: FlowRecord[];
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
  }>(`/warehouse/purchase-receipts/${encodeURIComponent(code)}/post`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function submitPurchaseReceiptArrivalResult(
  code: string,
  payload: { idempotencyKey: string; receipt: PurchaseReceipt },
) {
  return request<{
    receipt: PurchaseReceipt;
    qualityTask?: QualityRecord | null;
    purchaseAfterSale?: PurchaseAfterSale | null;
    nextReceiptTask?: PurchaseReceipt | null;
    flowRecords: FlowRecord[];
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
    repeated: boolean;
  }>(`/warehouse/purchase-receipts/${encodeURIComponent(code)}/arrival-result`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listSalesIssues() {
  const payload = await request<{ items: SalesIssue[] }>('/warehouse/sales-issues');
  return payload.items;
}

export async function getSalesIssue(code: string) {
  return request<{ issue: SalesIssue; flowRecords: FlowRecord[] }>(
    `/warehouse/sales-issues/${encodeURIComponent(code)}`,
  );
}

export async function submitSalesIssuePickingResult(
  code: string,
  payload: {
    idempotencyKey: string;
    date: string;
    products: SalesIssue['products'];
    note?: string;
    attachments?: SalesIssue['attachments'];
  },
) {
  return request<{
    issue: SalesIssue;
    flowRecords: FlowRecord[];
    repeated: boolean;
  }>(`/warehouse/sales-issues/${encodeURIComponent(code)}/picking-result`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function postSalesIssue(code: string) {
  return request<{
    issue: SalesIssue;
    flowRecords: FlowRecord[];
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
  }>(`/warehouse/sales-issues/${encodeURIComponent(code)}/post`, { method: 'POST' });
}

export async function listWarehouseOtherMoves() {
  const payload = await request<{ items: WarehouseOtherMove[] }>('/warehouse/other-moves');
  return payload.items;
}

export async function getWarehouseOtherMove(code: string) {
  return request<{ move: WarehouseOtherMove; flowRecords: FlowRecord[] }>(
    `/warehouse/other-moves/${encodeURIComponent(code)}`,
  );
}

export async function saveWarehouseOtherMove(move: WarehouseOtherMove) {
  const isNew = !move.code || move.code === '系统自动生成';
  const path = isNew ? '/warehouse/other-moves' : `/warehouse/other-moves/${encodeURIComponent(move.code)}`;
  return request<{ move: WarehouseOtherMove; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: move,
  });
}

export async function submitWarehouseOtherMove(code: string) {
  return request<{ move: WarehouseOtherMove; flowRecords: FlowRecord[] }>(
    `/warehouse/other-moves/${encodeURIComponent(code)}/submit`,
    { method: 'POST' },
  );
}

export async function postWarehouseOtherMove(code: string) {
  return request<{
    move: WarehouseOtherMove;
    flowRecords: FlowRecord[];
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
  }>(`/warehouse/other-moves/${encodeURIComponent(code)}/post`, { method: 'POST' });
}

export async function listProductionMaterialIssues() {
  const payload = await request<{ items: WarehouseProductionIssue[] }>('/warehouse/production-issues');
  return payload.items;
}

export async function getProductionMaterialIssueSource(releaseBatch: string) {
  return request<{
    issue: WarehouseProductionIssue;
    release: Record<string, unknown>;
    workOrder?: Record<string, unknown> | null;
  }>(`/warehouse/production-issues/source?releaseBatch=${encodeURIComponent(releaseBatch)}`);
}

export async function getProductionMaterialIssue(code: string) {
  return request<{
    issue: WarehouseProductionIssue;
    release?: Record<string, unknown>;
    executionCard?: Record<string, unknown> | null;
    flowRecords: FlowRecord[];
  }>(`/warehouse/production-issues/${encodeURIComponent(code)}`);
}

export async function saveProductionMaterialIssue(issue: WarehouseProductionIssue | WarehouseOtherMove) {
  const isNew = !issue.code || issue.code === '系统自动生成';
  const path = isNew
    ? '/warehouse/production-issues'
    : `/warehouse/production-issues/${encodeURIComponent(issue.code)}`;
  return request<{
    issue: WarehouseProductionIssue;
    release?: Record<string, unknown>;
    flowRecords: FlowRecord[];
  }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: issue,
  });
}

export async function submitProductionMaterialIssue(code: string) {
  return request<{
    issue: WarehouseProductionIssue;
    release?: Record<string, unknown>;
    flowRecords: FlowRecord[];
  }>(`/warehouse/production-issues/${encodeURIComponent(code)}/submit`, { method: 'POST' });
}

export async function postProductionMaterialIssue(code: string, idempotencyKey: string) {
  return request<{
    issue: WarehouseProductionIssue;
    release: Record<string, unknown>;
    workOrder: Record<string, unknown>;
    executionCard: Record<string, unknown>;
    inventory: WarehouseInventoryRow[];
    flowRecords: FlowRecord[];
    repeated: boolean;
  }>(`/warehouse/production-issues/${encodeURIComponent(code)}/post`, {
    method: 'POST',
    body: { idempotencyKey },
  });
}

export async function listProductionReturns() {
  const payload = await request<{ items: WarehouseProductionReturn[] }>('/warehouse/production-returns');
  return payload.items;
}

export async function getProductionReturn(code: string) {
  return request<{
    record: WarehouseProductionReturn;
    materialIssue?: WarehouseProductionIssue | null;
    executionCard?: Production2ExecutionCard | null;
    flowRecords: FlowRecord[];
  }>(`/warehouse/production-returns/${encodeURIComponent(code)}`);
}

export async function saveProductionReturn(record: WarehouseProductionReturn | WarehouseOtherMove) {
  const isNew = !record.code || record.code === '系统自动生成';
  const path = isNew
    ? '/warehouse/production-returns'
    : `/warehouse/production-returns/${encodeURIComponent(record.code)}`;
  return request<{
    record: WarehouseProductionReturn;
    materialIssue?: WarehouseProductionIssue | null;
    flowRecords: FlowRecord[];
  }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
}

export async function submitProductionReturn(code: string) {
  return request<{
    record: WarehouseProductionReturn;
    materialIssue?: WarehouseProductionIssue | null;
    flowRecords: FlowRecord[];
  }>(`/warehouse/production-returns/${encodeURIComponent(code)}/submit`, { method: 'POST' });
}

export async function postProductionReturn(code: string, idempotencyKey: string) {
  return request<{
    record: WarehouseProductionReturn;
    materialIssue?: WarehouseProductionIssue | null;
    executionCard?: Production2ExecutionCard | null;
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
    flowRecords: FlowRecord[];
    repeated: boolean;
  }>(`/warehouse/production-returns/${encodeURIComponent(code)}/post`, {
    method: 'POST',
    body: { idempotencyKey },
  });
}

export type ProductionExecutionCardApiResponse = {
  record: Production2ExecutionCard;
  card?: Production2ExecutionCard;
  release?: Record<string, unknown> | null;
  workOrder?: Record<string, unknown> | null;
  report?: Record<string, unknown> | null;
  wipBatch?: Production2WipBatch | null;
  operationJob?: Production2OperationJob | null;
  productionException?: Production2Exception | null;
  reports?: Array<Record<string, unknown>>;
  wipBatches?: Production2WipBatch[];
  lineageRecords?: Production2BatchLineageRecord[];
  qualityTask?: Production2QualityTask | null;
  qualityTasks?: Production2QualityTask[];
  productionIssues?: Array<Record<string, unknown>>;
  productionReturns?: Array<Record<string, unknown>>;
  productionReceipts?: WarehouseProductionReceipt[];
  executionEvents?: Production2ExecutionEvent[];
  exceptions?: Production2Exception[];
  shiftHandovers?: Production2ShiftHandover[];
  event?: Production2ExecutionEvent;
  flowRecords?: FlowRecord[];
  repeated?: boolean;
};

export async function listProductionExecutionCards() {
  const payload = await request<{ items: Production2ExecutionCard[] }>('/production/execution-cards');
  return payload.items;
}

export async function listProductionWorkOrderReleases(code: string) {
  const payload = await request<{ items: Production2ReleaseBatch[] }>(`/production/work-orders/${encodeURIComponent(code)}/releases`);
  return payload.items;
}

export async function getProductionExecutionCard(code: string) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}`);
}

export async function startProductionExecutionCard(
  code: string,
  payload: { revision: number; leader: string; operator: string; actor: string; idempotencyKey: string },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/start`, {
    method: 'POST',
    body: payload,
  });
}

export async function startProductionOperationJob(
  code: string,
  jobCode: string,
  payload: { revision: number; line: string; leader: string; operator: string; actor: string; idempotencyKey: string },
) {
  return request<ProductionExecutionCardApiResponse>(
    `/production/execution-cards/${encodeURIComponent(code)}/operation-jobs/${encodeURIComponent(jobCode)}/start`,
    { method: 'POST', body: payload },
  );
}

export async function reportProductionExecutionCard(
  code: string,
  payload: {
    revision: number;
    goodQty: number;
    defectQty: number;
    actor: string;
    remark?: string;
    sourceWipBatchCode?: string;
    consumedWeightKg?: number;
    lossWeightKg?: number;
    closeOperation?: boolean;
    shortCloseReason?: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/report`, {
    method: 'POST',
    body: payload,
  });
}

export async function resolveProductionShortClose(
  code: string,
  payload: {
    revision: number;
    action: '安排补产' | '接受短缺';
    reason: string;
    actor: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/short-close-resolution`, {
    method: 'POST',
    body: payload,
  });
}

export async function reportProductionWipBatch(
  code: string,
  payload: {
    revision: number;
    reelCode: string;
    netWeightKg: number;
    equipment?: string;
    actor: string;
    remark?: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/wip-report`, {
    method: 'POST',
    body: payload,
  });
}

export async function pauseProductionExecutionCard(
  code: string,
  payload: { revision: number; reason: string; actor: string; idempotencyKey: string },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/pause`, {
    method: 'POST',
    body: payload,
  });
}

export async function resumeProductionExecutionCard(
  code: string,
  payload: { revision: number; reason: string; actor: string; idempotencyKey: string },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/resume`, {
    method: 'POST',
    body: payload,
  });
}

export async function packProductionExecutionCard(
  code: string,
  payload: { revision: number; quantity: number; packageRef: string; actor: string; idempotencyKey: string },
) {
  return request<ProductionExecutionCardApiResponse>(`/production/execution-cards/${encodeURIComponent(code)}/pack`, {
    method: 'POST',
    body: payload,
  });
}

export type ProductionQualityApiResponse = {
  record: Production2QualityTask;
  decision?: Record<string, unknown> | null;
  dispositions?: ProductionQualityDisposition[];
  reworkTasks?: ProductionReworkTask[];
  reinspectionTasks?: ProductionReinspectionTask[];
  executionCard?: Production2ExecutionCard | null;
  report?: Record<string, unknown> | null;
  wipBatch?: Production2WipBatch | null;
  productionException?: Production2Exception | null;
  flowRecords?: FlowRecord[];
  repeated?: boolean;
};

export type ProductionQualityDisposition = {
  id: string;
  taskCode: string;
  executionCardCode: string;
  sourceReportCode?: string;
  reworkTaskCode?: string;
  reinspectionTaskCode?: string;
  action: 'rework_pass' | 'approve_concession' | 'scrap';
  quantity: number;
  unit: string;
  reason: string;
  approvedBy?: string;
  actor: string;
  status: '已完成';
  decisionVersion: number;
  version: number;
  idempotencyKey: string;
  executedAt: string;
};

export type ProductionReworkTask = {
  code: string;
  qualityTaskCode: string;
  executionCardCode: string;
  workOrderCode: string;
  releaseBatchCode: string;
  quantity: number;
  unit: string;
  reason: string;
  assignee: string;
  status: '待返工' | '返工中' | '待复检' | '已完成' | '已取消';
  revision: number;
  resultNote?: string;
  completedBy?: string;
  completedAt?: string;
  reinspectionTaskCode?: string;
  sourceInspectionItems?: ProductionReinspectionItem[];
  createdBy: string;
  createdAt: string;
};

export type ProductionReinspectionItem = {
  name: string;
  standard: string;
  originalActual?: string;
  originalResult?: string;
  originalNote?: string;
  actual: string;
  result: '待检验' | '合格' | '不合格' | '历史未逐项记录';
  note?: string;
};

export type ProductionReinspectionTask = {
  code: string;
  qualityTaskCode: string;
  reworkTaskCode: string;
  executionCardCode: string;
  quantity: number;
  unit: string;
  inspector: string;
  status: '待复检' | '已完成' | '已取消';
  revision: number;
  acceptedQty?: number;
  rejectedQty?: number;
  result?: '合格' | '部分合格' | '不合格';
  resultReason?: string;
  inspectionItems?: ProductionReinspectionItem[];
  decidedBy?: string;
  decidedAt?: string;
  createdBy: string;
  createdAt: string;
};

export type QualityClosureKind = 'patrol' | 'defects';

export type QualityClosureRecord = {
  code: string;
  kind: QualityClosureKind;
  status: string;
  revision: number;
  draft: Record<string, unknown>;
  attachments: Attachment[];
  updatedAt?: string;
  updatedBy?: string;
};

export type QualityClosureApiResponse = {
  record: QualityClosureRecord;
  attachments: Attachment[];
  flowRecords: FlowRecord[];
  linkedDefect?: QualityClosureRecord | null;
};

export type QualityStandardApiResponse = {
  record: QualityStandardRecord;
  createdVersion?: boolean;
  repeated?: boolean;
};

export async function listQualityStandards() {
  const payload = await request<{ items: QualityStandardRecord[] }>('/quality/standards');
  return payload.items;
}

export async function getQualityStandard(code: string) {
  return request<QualityStandardApiResponse>(`/quality/standards/${encodeURIComponent(code)}`);
}

export async function createQualityStandard(
  draft: QualityStandardRecord,
  options: { actor: string; idempotencyKey: string },
) {
  return request<QualityStandardApiResponse>('/quality/standards', {
    method: 'POST',
    body: { ...draft, ...options },
  });
}

export async function saveQualityStandard(draft: QualityStandardRecord, actor: string) {
  return request<QualityStandardApiResponse>(`/quality/standards/${encodeURIComponent(draft.code)}`, {
    method: 'PUT',
    body: { ...draft, actor },
  });
}

export async function setQualityStandardActive(draft: QualityStandardRecord, active: boolean, actor: string) {
  return request<QualityStandardApiResponse>(
    `/quality/standards/${encodeURIComponent(draft.code)}/${active ? 'activate' : 'deactivate'}`,
    { method: 'POST', body: { revision: draft.revision, actor } },
  );
}

export async function listQualityClosures(kind: QualityClosureKind) {
  const payload = await request<{ items: QualityClosureRecord[] }>(`/quality/${kind}`);
  return payload.items;
}

export async function getQualityClosure(kind: QualityClosureKind, code: string) {
  return request<QualityClosureApiResponse>(`/quality/${kind}/${encodeURIComponent(code)}`);
}

export async function createQualityClosure(
  kind: QualityClosureKind,
  payload: {
    draft: Record<string, unknown>;
    attachments: Attachment[];
    actor: string;
    idempotencyKey: string;
  },
) {
  return request<QualityClosureApiResponse>(`/quality/${kind}`, { method: 'POST', body: payload });
}

export async function saveQualityClosure(
  kind: QualityClosureKind,
  code: string,
  payload: {
    draft: Record<string, unknown>;
    attachments: Attachment[];
    actor: string;
    revision: number;
    idempotencyKey: string;
  },
) {
  return request<QualityClosureApiResponse>(`/quality/${kind}/${encodeURIComponent(code)}`, { method: 'PUT', body: payload });
}

export async function transitionQualityClosure(
  kind: QualityClosureKind,
  code: string,
  payload: {
    nextStatus: string;
    action: string;
    remark: string;
    draft: Record<string, unknown>;
    attachments: Attachment[];
    actor: string;
    revision: number;
    idempotencyKey: string;
  },
) {
  return request<QualityClosureApiResponse>(`/quality/${kind}/${encodeURIComponent(code)}/transition`, {
    method: 'POST',
    body: payload,
  });
}

export async function listProductionQualityTasks() {
  const payload = await request<{ items: Production2QualityTask[] }>('/quality/production');
  return payload.items;
}

export async function getProductionQualityTask(code: string) {
  return request<ProductionQualityApiResponse>(`/quality/production/${encodeURIComponent(code)}`);
}

export async function decideProductionQualityTask(
  code: string,
  payload: {
    result: '合格' | '不合格' | '部分合格';
    acceptedQty: number;
    rejectedQty: number;
    sampleDefectQty?: number;
    checkpointResults: Production2QualityCheckpointResult[];
    version: number;
    actor: string;
    remark?: string;
    disposition?: string;
    conclusion?: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionQualityApiResponse>(`/quality/production/${encodeURIComponent(code)}/decision`, {
    method: 'POST',
    body: payload,
  });
}

export async function disposeProductionQualityTask(
  code: string,
  payload: {
    action: ProductionQualityDisposition['action'];
    quantity: number;
    reason: string;
    approvedBy?: string;
    actor: string;
    decisionVersion: number;
    dispositionVersion: number;
    idempotencyKey: string;
  },
) {
  return request<ProductionQualityApiResponse & {
    disposition: ProductionQualityDisposition;
  }>(`/quality/production/${encodeURIComponent(code)}/dispose`, {
    method: 'POST',
    body: payload,
  });
}

export async function createProductionReworkTask(
  code: string,
  payload: {
    quantity: number;
    reason: string;
    assignee: string;
    actor: string;
    decisionVersion: number;
    idempotencyKey: string;
  },
) {
  return request<ProductionQualityApiResponse & { reworkTask: ProductionReworkTask }>(`/quality/production/${encodeURIComponent(code)}/rework`, {
    method: 'POST',
    body: payload,
  });
}

export async function completeProductionReworkTask(
  qualityCode: string,
  reworkCode: string,
  payload: { revision: number; resultNote: string; inspector: string; actor: string; idempotencyKey: string },
) {
  return request<ProductionQualityApiResponse & { reworkTask: ProductionReworkTask; reinspectionTask: ProductionReinspectionTask }>(
    `/quality/production/${encodeURIComponent(qualityCode)}/rework/${encodeURIComponent(reworkCode)}/complete`,
    { method: 'POST', body: payload },
  );
}

export async function decideProductionReinspectionTask(
  qualityCode: string,
  reinspectionCode: string,
  payload: {
    revision: number;
    acceptedQty: number;
    rejectedQty: number;
    inspectionItems: ProductionReinspectionItem[];
    resultReason?: string;
    actor: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionQualityApiResponse & { reworkTask: ProductionReworkTask; reinspectionTask: ProductionReinspectionTask; disposition?: ProductionQualityDisposition | null }>(
    `/quality/production/${encodeURIComponent(qualityCode)}/reinspection/${encodeURIComponent(reinspectionCode)}/decision`,
    { method: 'POST', body: payload },
  );
}

export type ProductionExceptionApiResponse = {
  record: Production2Exception;
  exception?: Production2Exception;
  qualityTask?: Production2QualityTask | null;
  executionCard?: Production2ExecutionCard | null;
  release?: Record<string, unknown> | null;
  workOrder?: Record<string, unknown> | null;
  task?: Production2Task | null;
  tasks?: Production2Task[];
  flowRecords?: FlowRecord[];
  repeated?: boolean;
};

export async function listProductionExceptions() {
  const payload = await request<{ items: Production2Exception[] }>('/production/exceptions');
  return payload.items;
}

export async function listProductionLossRecords() {
  const payload = await request<{ items: Production2LossRecord[] }>('/production/loss-records');
  return payload.items;
}

export async function getProductionException(code: string) {
  return request<ProductionExceptionApiResponse>(`/production/exceptions/${encodeURIComponent(code)}`);
}

export async function createProductionException(payload: {
  executionCardCode: string;
  revision: number;
  type: Production2Exception['type'];
  reason: string;
  outcome: '继续生产' | '异常停机';
  level?: '一般' | '紧急';
  responsibility?: string;
  affectedQty?: number;
  actor: string;
  idempotencyKey: string;
}) {
  return request<ProductionExceptionApiResponse>('/production/exceptions', {
    method: 'POST',
    body: payload,
  });
}

export async function resolveProductionException(
  code: string,
  payload: {
    version: number;
    cardRevision: number;
    disposition: string;
    resolution: string;
    actor: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionExceptionApiResponse>(`/production/exceptions/${encodeURIComponent(code)}/resolve`, {
    method: 'POST',
    body: payload,
  });
}

export type ProductionShiftApiResponse = {
  handover: Production2ShiftHandover;
  cards: Production2ExecutionCard[];
  repeated?: boolean;
};

export async function listProductionShiftHandovers() {
  const payload = await request<{ items: Production2ShiftHandover[] }>('/production/shifts');
  return payload.items;
}

export async function handoverProductionShift(payload: {
  shiftCode: string;
  shiftName: string;
  leader: string;
  members: string[];
  note: string;
  activeCards: Array<{ executionCardCode: string; revision: number }>;
  reportSummary: {
    count: number;
    good: number;
    defect: number;
    unitTotals?: Array<{ unit: string; good: number; defect: number }>;
  };
  exceptionCount: number;
  actor: string;
  idempotencyKey: string;
}) {
  return request<ProductionShiftApiResponse>('/production/shifts/handover', {
    method: 'POST',
    body: payload,
  });
}

export async function receiveProductionShift(
  code: string,
  payload: {
    version: number;
    shiftCode: string;
    shiftName: string;
    leader: string;
    members: string[];
    actor: string;
    idempotencyKey: string;
  },
) {
  return request<ProductionShiftApiResponse>(`/production/shifts/${encodeURIComponent(code)}/receive`, {
    method: 'POST',
    body: payload,
  });
}

export async function listProductionReceipts() {
  const payload = await request<{ items: WarehouseProductionReceipt[] }>('/warehouse/production-receipts');
  return payload.items;
}

export async function getProductionReceipt(code: string) {
  return request<{
    receipt: WarehouseProductionReceipt;
    executionCard?: Production2ExecutionCard | null;
    release?: Record<string, unknown> | null;
    workOrder?: Record<string, unknown> | null;
    flowRecords: FlowRecord[];
  }>(`/warehouse/production-receipts/${encodeURIComponent(code)}`);
}

export async function saveProductionReceipt(receipt: WarehouseProductionReceipt | WarehouseOtherMove) {
  const isNew = !receipt.code || receipt.code === '系统自动生成';
  const path = isNew
    ? '/warehouse/production-receipts'
    : `/warehouse/production-receipts/${encodeURIComponent(receipt.code)}`;
  return request<{
    receipt: WarehouseProductionReceipt;
    executionCard?: Production2ExecutionCard | null;
    flowRecords: FlowRecord[];
  }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: receipt,
  });
}

export async function submitProductionReceipt(code: string) {
  return request<{
    receipt: WarehouseProductionReceipt;
    executionCard?: Production2ExecutionCard | null;
    flowRecords: FlowRecord[];
  }>(`/warehouse/production-receipts/${encodeURIComponent(code)}/submit`, { method: 'POST' });
}

export async function postProductionReceipt(code: string, idempotencyKey: string) {
  return request<{
    receipt: WarehouseProductionReceipt;
    card: Production2ExecutionCard;
    inventory: WarehouseInventoryRow[];
    flowRecords: FlowRecord[];
    repeated: boolean;
  }>(`/warehouse/production-receipts/${encodeURIComponent(code)}/post`, {
    method: 'POST',
    body: { idempotencyKey },
  });
}

export async function listWarehouseTransfers() {
  const payload = await request<{ items: WarehouseTransfer[] }>('/warehouse/transfers');
  return payload.items;
}

export async function getWarehouseTransfer(code: string) {
  return request<{ transfer: WarehouseTransfer; flowRecords: FlowRecord[] }>(
    `/warehouse/transfers/${encodeURIComponent(code)}`,
  );
}

export async function saveWarehouseTransfer(transfer: WarehouseTransfer) {
  const isNew = !transfer.code || transfer.code === '系统自动生成';
  const path = isNew ? '/warehouse/transfers' : `/warehouse/transfers/${encodeURIComponent(transfer.code)}`;
  return request<{ transfer: WarehouseTransfer; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: transfer,
  });
}

export async function submitWarehouseTransfer(code: string) {
  return request<{ transfer: WarehouseTransfer; flowRecords: FlowRecord[] }>(
    `/warehouse/transfers/${encodeURIComponent(code)}/submit`,
    { method: 'POST' },
  );
}

export async function postWarehouseTransfer(code: string) {
  return request<{
    transfer: WarehouseTransfer;
    flowRecords: FlowRecord[];
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
  }>(`/warehouse/transfers/${encodeURIComponent(code)}/post`, { method: 'POST' });
}

export async function cancelWarehouseTransfer(code: string, reason: string) {
  return request<{ transfer: WarehouseTransfer; flowRecords: FlowRecord[] }>(
    `/warehouse/transfers/${encodeURIComponent(code)}/cancel`,
    { method: 'POST', body: { reason } },
  );
}

export async function listWarehouseStocktakes() {
  const payload = await request<{ items: WarehouseStocktake[] }>('/warehouse/stocktakes');
  return payload.items;
}

export async function getWarehouseStocktake(code: string) {
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(
    `/warehouse/stocktakes/${encodeURIComponent(code)}`,
  );
}

export async function saveWarehouseStocktake(stocktake: WarehouseStocktake) {
  const isNew = !stocktake.code || stocktake.code === '系统自动生成';
  const path = isNew ? '/warehouse/stocktakes' : `/warehouse/stocktakes/${encodeURIComponent(stocktake.code)}`;
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: stocktake,
  });
}

export async function startWarehouseStocktake(code: string) {
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(
    `/warehouse/stocktakes/${encodeURIComponent(code)}/start`,
    { method: 'POST' },
  );
}

export async function submitWarehouseStocktake(code: string) {
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(
    `/warehouse/stocktakes/${encodeURIComponent(code)}/submit`,
    { method: 'POST' },
  );
}

export async function completeWarehouseStocktake(code: string) {
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(
    `/warehouse/stocktakes/${encodeURIComponent(code)}/complete`,
    { method: 'POST' },
  );
}

export async function returnWarehouseStocktake(code: string, reason: string) {
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(
    `/warehouse/stocktakes/${encodeURIComponent(code)}/return`,
    { method: 'POST', body: { reason } },
  );
}

export async function cancelWarehouseStocktake(code: string, reason: string) {
  return request<{ stocktake: WarehouseStocktake; flowRecords: FlowRecord[] }>(
    `/warehouse/stocktakes/${encodeURIComponent(code)}/cancel`,
    { method: 'POST', body: { reason } },
  );
}

export async function listWarehouseInventory() {
  const payload = await request<{ items: WarehouseInventoryRow[] }>('/warehouse/inventory');
  return payload.items;
}

export async function listSalesInventory() {
  const payload = await request<{ items: SalesInventoryProjectionRow[] }>('/sales/inventory');
  return payload.items;
}

export async function listWarehouseReplenishments() {
  const payload = await request<{ items: WarehouseReplenishmentSignal[] }>('/warehouse/replenishments');
  return payload.items;
}

export async function startWarehouseReplenishment(
  code: string,
  routeType: '采购申请' | '生产任务',
) {
  return request<{
    signal: WarehouseReplenishmentSignal;
    document: WarehouseReplenishmentDocument;
    repeated: boolean;
  }>(`/warehouse/replenishments/${encodeURIComponent(code)}/replenish`, {
    method: 'POST',
    body: { routeType },
  });
}

export async function listStockLedger() {
  const payload = await request<{ items: StockLedgerRow[] }>('/warehouse/stock-ledger');
  return payload.items;
}

export type WarehouseRuntimeType =
  | 'purchase-receipts'
  | 'sales-issues'
  | 'other-moves'
  | 'transfers'
  | 'stocktakes';

export async function reverseWarehouseDocument(
  type: WarehouseRuntimeType,
  code: string,
  payload: { reason: string; idempotencyKey: string },
) {
  return request<{
    reversal: WarehouseReversal;
    record: PurchaseReceipt | SalesIssue | WarehouseOtherMove | WarehouseTransfer | WarehouseStocktake;
    flowRecords: FlowRecord[];
    inventory: WarehouseInventoryRow[];
    stockLedger: StockLedgerRow[];
    repeated: boolean;
  }>(`/warehouse/${type}/${encodeURIComponent(code)}/reverse`, {
    method: 'POST',
    body: payload,
  });
}

export async function updateWarehouseStatus(
  type: WarehouseRuntimeType,
  code: string,
  payload: { status: string; action: string; remark: string },
) {
  return request<{
    record: PurchaseReceipt | SalesIssue | WarehouseOtherMove | WarehouseTransfer | WarehouseStocktake;
    qualityTask?: QualityRecord | null;
    flowRecords: FlowRecord[];
  }>(`/warehouse/${type}/${encodeURIComponent(code)}/status`, {
    method: 'POST',
    body: payload,
  });
}

export type CommercialFollowUpPayload = {
  kind: 'sales_invoice' | 'sales_payment' | 'purchase_invoice' | 'purchase_payment';
  amount: number;
  occurredOn: string;
  note?: string;
  idempotencyKey: string;
};

export async function createCommercialFollowUp(
  module: 'sales' | 'purchase',
  orderCode: string,
  payload: CommercialFollowUpPayload,
) {
  return request<{
    event: import('../types/business').CommercialFollowUpEvent;
    order: import('../types/business').SalesOrder | import('../types/business').PurchaseOrder;
    repeated: boolean;
  }>(`/${module}/orders/${encodeURIComponent(orderCode)}/commercial-follow-ups`, {
    method: 'POST',
    body: payload,
  });
}

export async function removeCommercialFollowUp(
  module: 'sales' | 'purchase',
  orderCode: string,
  eventId: string,
) {
  return request<{
    event: import('../types/business').CommercialFollowUpEvent;
    order: import('../types/business').SalesOrder | import('../types/business').PurchaseOrder;
    repeated: boolean;
  }>(`/${module}/orders/${encodeURIComponent(orderCode)}/commercial-follow-ups/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}

export type FinanceRuntimeType = 'sales-invoices' | 'purchase-invoices' | 'receivables' | 'payables';

export type SalesInvoiceLineAvailability = {
  sourceOrder: string;
  sourceLineId: string;
  materialCode: string;
  name: string;
  unit: string;
  orderQty: number;
  orderAmount: number;
  invoicedQty: number;
  invoicedAmount: number;
  remainingQty: number;
  remainingAmount: number;
};

export async function listFinanceRecords(type: FinanceRuntimeType) {
  const payload = await request<{ items: FinanceRecord[] }>(`/finance/${type}`);
  return payload.items;
}

export async function getFinanceRecord(type: FinanceRuntimeType, code: string) {
  return request<{
    record: FinanceRecord;
    reversal?: SalesInvoiceReversal | null;
    redInvoice?: Record<string, unknown> | null;
    refunds?: SalesRefund[];
    payments?: FinanceSettlementEvent[];
    matching?: PurchaseInvoiceMatch;
    flowRecords: FlowRecord[];
  }>(
    `/finance/${type}/${encodeURIComponent(code)}`,
  );
}

export async function savePurchaseInvoice(record: FinanceRecord) {
  const isNew = !record.code || record.code === '系统自动生成';
  const path = isNew ? '/finance/purchase-invoices' : `/finance/purchase-invoices/${encodeURIComponent(record.code)}`;
  return request<{ record: FinanceRecord; matching: PurchaseInvoiceMatch; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
}

export async function getPurchaseInvoiceMatching(sourceReceipt: string, excludeInvoiceCode = '') {
  const query = new URLSearchParams({ sourceReceipt });
  if (excludeInvoiceCode) query.set('excludeInvoiceCode', excludeInvoiceCode);
  return request<PurchaseInvoiceMatch>(`/finance/purchase-invoices/matching?${query.toString()}`);
}

export async function saveSalesInvoice(record: FinanceRecord) {
  const isNew = !record.code || record.code === '系统自动生成';
  const path = isNew ? '/finance/sales-invoices' : `/finance/sales-invoices/${encodeURIComponent(record.code)}`;
  return request<{ record: FinanceRecord; flowRecords: FlowRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
}

export async function getSalesInvoiceAvailability(sourceOrder: string, excludeInvoiceCode = '') {
  const query = new URLSearchParams({ sourceOrder });
  if (excludeInvoiceCode) query.set('excludeInvoiceCode', excludeInvoiceCode);
  return request<{ sourceOrder: string; lines: SalesInvoiceLineAvailability[] }>(
    `/finance/sales-invoices/availability?${query.toString()}`,
  );
}

export async function confirmSalesInvoice(code: string) {
  return request<{ record: FinanceRecord; receivable: FinanceRecord; flowRecords: FlowRecord[] }>(
    `/finance/sales-invoices/${encodeURIComponent(code)}/confirm`,
    { method: 'POST' },
  );
}

export async function reverseSalesInvoice(
  code: string,
  payload: { reason: string; idempotencyKey: string },
) {
  return request<{
    record: FinanceRecord;
    reversal: SalesInvoiceReversal;
    redInvoice: Record<string, unknown>;
    refund?: SalesRefund | null;
    refunds: SalesRefund[];
    flowRecords: FlowRecord[];
    repeated: boolean;
  }>(`/finance/sales-invoices/${encodeURIComponent(code)}/reverse`, {
    method: 'POST',
    body: payload,
  });
}

export async function completeSalesRefund(
  refundCode: string,
  payload: { paymentMethod: string; transactionRef: string; idempotencyKey: string },
) {
  return request<{
    refund: SalesRefund;
    flowRecords: FlowRecord[];
    repeated: boolean;
  }>(`/finance/sales-refunds/${encodeURIComponent(refundCode)}/complete`, {
    method: 'POST',
    body: payload,
  });
}

export async function confirmPurchaseInvoice(code: string) {
  return request<{ record: FinanceRecord; payable: FinanceRecord; matching: PurchaseInvoiceMatch; flowRecords: FlowRecord[] }>(
    `/finance/purchase-invoices/${encodeURIComponent(code)}/confirm`,
    { method: 'POST' },
  );
}

export type FinanceSettlementPayload = {
  amount: number;
  transactionDate: string;
  method: string;
  account: string;
  reference: string;
  note?: string;
  idempotencyKey: string;
};

export async function receiveReceivable(code: string, payload: FinanceSettlementPayload) {
  return request<{ record: FinanceRecord; payment: FinanceSettlementEvent; payments: FinanceSettlementEvent[]; flowRecords: FlowRecord[] }>(
    `/finance/receivables/${encodeURIComponent(code)}/receive`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function payPayable(code: string, payload: FinanceSettlementPayload) {
  return request<{ record: FinanceRecord; payment: FinanceSettlementEvent; payments: FinanceSettlementEvent[]; flowRecords: FlowRecord[] }>(
    `/finance/payables/${encodeURIComponent(code)}/pay`,
    { method: 'POST', body: payload },
  );
}

export async function updateFinanceStatus(
  type: FinanceRuntimeType,
  code: string,
  payload: { status: string; action: string; remark: string },
) {
  return request<{ record: FinanceRecord; flowRecords: FlowRecord[] }>(
    `/finance/${type}/${encodeURIComponent(code)}/status`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function listMasterRecords(type: string) {
  const payload = await request<{ items: MasterDataRecord[] }>(`/master-data/${type}`);
  return payload.items;
}

type EquipmentInspectionApiPage = 'inspection-tasks' | 'inspection-plans' | 'inspection-standards';

type EquipmentInspectionRecordByPage = {
  'inspection-tasks': EquipmentInspectionTask;
  'inspection-plans': EquipmentInspectionPlan;
  'inspection-standards': EquipmentInspectionStandard;
};

export async function listEquipmentInspectionRecords<Page extends EquipmentInspectionApiPage>(page: Page) {
  const payload = await request<{ items: EquipmentInspectionRecordByPage[Page][] }>(`/equipment/${page}`);
  return payload.items;
}

export async function getEquipmentInspectionRecord<Page extends EquipmentInspectionApiPage>(
  page: Page,
  code: string,
) {
  return request<EquipmentInspectionResponse<EquipmentInspectionRecordByPage[Page]>>(
    `/equipment/${page}/${encodeURIComponent(code)}`,
  );
}

export async function createEquipmentInspectionRecord<Page extends Exclude<EquipmentInspectionApiPage, 'inspection-tasks'>>(
  page: Page,
  record: EquipmentInspectionRecordByPage[Page],
) {
  return request<EquipmentInspectionResponse<EquipmentInspectionRecordByPage[Page]>>(
    `/equipment/${page}`,
    {
      method: 'POST',
      body: { record },
    },
  );
}

export async function saveEquipmentInspectionRecord<Page extends Exclude<EquipmentInspectionApiPage, 'inspection-tasks'>>(
  page: Page,
  record: EquipmentInspectionRecordByPage[Page],
) {
  return request<EquipmentInspectionResponse<EquipmentInspectionRecordByPage[Page]>>(
    `/equipment/${page}/${encodeURIComponent(record.code)}`,
    {
      method: 'PUT',
      body: { record, revision: record.revision },
    },
  );
}

export async function executeEquipmentInspectionTask(
  record: EquipmentInspectionTask,
  action: 'start' | 'complete' | 'resolve' | 'cancel',
) {
  return request<EquipmentInspectionResponse<EquipmentInspectionTask>>(
    `/equipment/inspection-tasks/${encodeURIComponent(record.code)}/${action}`,
    {
      method: 'POST',
      body: {
        record,
        revision: record.revision,
        idempotencyKey: `equipment:${record.code}:${action}:${record.revision}`,
      },
    },
  );
}

export async function getMasterRecord(type: string, code: string) {
  const payload = await request<{ record: MasterDataRecord }>(
    `/master-data/${type}/${encodeURIComponent(code)}`,
  );
  return payload.record;
}

export async function saveMasterRecord(
  type: string,
  record: MasterDataRecord,
  options: { create?: boolean } = {},
) {
  const isNew = options.create ?? !record.code;
  const path = isNew ? `/master-data/${type}` : `/master-data/${type}/${encodeURIComponent(record.code)}`;
  const payload = await request<{ record: MasterDataRecord }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
  return payload.record;
}

export type MaterialSupplierRelation = {
  code: string;
  supplierCode: string;
  supplierName: string;
  materialCode: string;
  materialName: string;
  supplierMaterialCode?: string;
  baseUom: string;
  minOrderQty: number;
  leadTimeDays: number;
  isDefault?: boolean;
  status: string;
  note?: string;
};

export type WarehouseMaterialSetting = {
  code: string;
  warehouseCode: string;
  warehouseName: string;
  materialCode: string;
  materialName: string;
  uom: string;
  safetyStock: number;
  reorderPoint: number;
  maxStock: number;
  replenishmentLot: number;
  status: string;
  note?: string;
};

function masterRelationQuery(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export async function listMaterialSupplierRelations(
  filters: { materialCode?: string; supplierCode?: string } = {},
) {
  const payload = await request<{ items: MaterialSupplierRelation[] }>(
    `/master-data/relations/material-suppliers${masterRelationQuery(filters)}`,
  );
  return payload.items;
}

export async function saveMaterialSupplierRelations(
  supplierCode: string,
  items: MaterialSupplierRelation[],
) {
  const payload = await request<{ items: MaterialSupplierRelation[] }>(
    `/master-data/relations/material-suppliers/${encodeURIComponent(supplierCode)}`,
    {
      method: 'PUT',
      body: { items },
    },
  );
  return payload.items;
}

export async function listWarehouseMaterialSettings(
  filters: { materialCode?: string; warehouseCode?: string } = {},
) {
  const payload = await request<{ items: WarehouseMaterialSetting[] }>(
    `/master-data/relations/warehouse-materials${masterRelationQuery(filters)}`,
  );
  return payload.items;
}

export async function saveWarehouseMaterialSettings(
  warehouseCode: string,
  items: WarehouseMaterialSetting[],
) {
  const payload = await request<{ items: WarehouseMaterialSetting[] }>(
    `/master-data/relations/warehouse-materials/${encodeURIComponent(warehouseCode)}`,
    {
      method: 'PUT',
      body: { items },
    },
  );
  return payload.items;
}

export type SystemRecord = {
  code: string;
  name: string;
  module?: string;
  owner: string;
  status: string;
  description: string;
  updatedAt: string;
  target?: string;
  remark?: string;
  sourceAccount?: string;
  sourceIp?: string;
  menuKey?: string;
  parentCode?: string;
  path?: string;
  permissionCode?: string;
  sortOrder?: number;
  username?: string;
  employeeCode?: string;
  department?: string;
  roles?: string;
  phone?: string;
  email?: string;
  lastLogin?: string;
  passwordInput?: string;
  passwordConfirm?: string;
  passwordSet?: boolean;
  passwordUpdatedAt?: string;
  permissions?: string;
  triggerModule?: string;
  triggerAction?: string;
  receiverRoles?: string;
  channel?: string;
  appType?: string;
  deployTarget?: string;
  runtimeMode?: string;
  publicUrl?: string;
  apiBase?: string;
  healthPath?: string;
  dataStore?: string;
  versionTag?: string;
  healthStatus?: string;
  healthCheckedAt?: string;
  healthMessage?: string;
  healthLatencyMs?: number;
  healthTarget?: string;
  toolType?: string;
  useScope?: string;
  entryPoint?: string;
  verifyMethod?: string;
  riskLevel?: string;
  lastVerifiedAt?: string;
  lastVerificationRemark?: string;
  ruleKey?: string;
  prefix?: string;
  dateFormat?: string;
  sequenceLength?: number;
  sampleCode?: string;
  optionModule?: string;
  optionField?: string;
  optionValues?: string;
};

export type SessionAccount = {
  code: string;
  employeeCode: string;
  username: string;
  name: string;
  department: string;
  status: string;
  passwordSet: boolean;
  passwordUpdatedAt: string;
};

export type SessionContext = {
  account: SessionAccount;
  accountOptions: SessionAccount[];
  setupMode: boolean;
  roles: string[];
  roleCodes: string[];
  permissions: string[];
  permissionLabels: Record<string, string>;
};

export type AppNotification = {
  code: string;
  ruleCode: string;
  ruleName: string;
  module: string;
  action: string;
  title: string;
  message: string;
  sourceDoc: string;
  sourcePath: string;
  actor: string;
  targetRoles: string;
  targetAccounts: string;
  readBy: string;
  createdAt: string;
  unread: boolean;
};

export type NotificationInbox = {
  unreadCount: number;
  items: AppNotification[];
};

export type AppHealthResult = {
  healthStatus: string;
  healthCheckedAt: string;
  healthMessage: string;
  healthLatencyMs: number;
  healthTarget: string;
};

export type LoginSessionResponse = SessionContext & {
  token: string;
};

export async function getCurrentSession() {
  return request<SessionContext>('/session/current');
}

export async function loginSession(username: string, password: string) {
  clearStoredSessionToken();
  const payload = await request<LoginSessionResponse>('/session/login', {
    method: 'POST',
    body: { username, password },
  });
  storeSessionToken(payload.token);
  return payload;
}

export async function logoutSession() {
  try {
    return await request<{ ok: boolean }>('/session/logout', { method: 'POST' });
  } finally {
    clearStoredSessionToken();
  }
}

export async function changeOwnPassword(currentPassword: string, passwordInput: string, passwordConfirm: string) {
  const result = await request<{ ok: boolean; sessionsCleared: number }>('/session/password', {
    method: 'POST',
    body: { currentPassword, passwordInput, passwordConfirm },
  });
  clearStoredSessionToken();
  return result;
}

export async function impersonateSession(accountCode: string) {
  const payload = await request<LoginSessionResponse>('/session/impersonate', {
    method: 'POST',
    body: { accountCode },
  });
  storeSessionToken(payload.token);
  return payload;
}

export async function listNotifications(limit = 20) {
  return request<NotificationInbox>(`/notifications?limit=${encodeURIComponent(String(limit))}`);
}

export async function markNotificationRead(code: string) {
  return request<NotificationInbox>(`/notifications/${encodeURIComponent(code)}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  return request<NotificationInbox>('/notifications/read-all', { method: 'POST' });
}

export async function listSystemRecords(page: string) {
  const payload = await request<{ items: SystemRecord[] }>(`/system/${page}`);
  return payload.items;
}

export async function saveSystemRecord(page: string, record: SystemRecord, options: { create?: boolean } = {}) {
  const isNew = options.create ?? !record.code;
  const path = isNew ? `/system/${page}` : `/system/${page}/${encodeURIComponent(record.code)}`;
  const payload = await request<{ record: SystemRecord; items: SystemRecord[] }>(path, {
    method: isNew ? 'POST' : 'PUT',
    body: record,
  });
  return payload.record;
}

export async function checkSystemAppHealth(code: string) {
  return request<{ record: SystemRecord; result: AppHealthResult }>(`/system/apps/${encodeURIComponent(code)}/check-health`, {
    method: 'POST',
  });
}

export async function recordSystemMcpToolVerification(code: string, verificationRemark = '') {
  return request<{ record: SystemRecord }>(`/system/mcp-tools/${encodeURIComponent(code)}/verify`, {
    method: 'POST',
    body: { verificationRemark },
  });
}
