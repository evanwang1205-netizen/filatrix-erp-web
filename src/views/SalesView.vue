<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Plus } from 'lucide-vue-next';

import {
  type SalesTabKey,
} from '../data/sales';
import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import {
  listSalesAfterSales,
  listSalesDeliveryRecords,
  listSalesQuotes,
  listSalesOrders,
  listSalesOutboundRequests,
  listSalesInventory,
} from '../services/api';
import type { SalesAfterSale, SalesDeliveryRecord, SalesInventoryProjectionRow, SalesOrder, SalesOutboundRequest, SalesQuote } from '../types/business';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import { statusPresentationClass } from '../utils/statusPresentation';

const route = useRoute();
const hoveredQuoteCode = ref('');
const hoveredOrderCode = ref('');
const hoveredOutboundCode = ref('');
const hoveredAfterSalesCode = ref('');
const { canWrite: canWriteSales, readonlyReason: salesReadonlyReason } = useModulePermission('sales');
const { canOperate: canApproveSales, readonlyReason: salesApproveReadonlyReason } = useOperationPermission('salesApprove', '处理销售单据状态');
const salesOperationPermissionHint = computed(() => (
  canWriteSales.value && !canApproveSales.value ? salesApproveReadonlyReason.value : ''
));
const showSalesOperationPermissionHint = computed(() =>
  ['quotes', 'orders'].includes(activePage.value) && Boolean(salesOperationPermissionHint.value),
);
const salesOperationPermissionSuffix = computed(() => {
  if (activePage.value === 'orders') return '确认、作废和异常处理会保持不可用。';
  if (activePage.value === 'outboundRequests') return '交付追踪为只读视图。';
  return '确认、提交、作废和异常处理会保持不可用。';
});

const pageTitles: Record<SalesTabKey, string> = {
  quotes: '报价单',
  orders: '销售订单',
  outboundRequests: '交付追踪',
  afterSales: '销售售后',
  prices: '销售价格记录',
  inventory: '成品库存速查',
};

const createButtonLabels: Partial<Record<SalesTabKey, string>> = {
  quotes: '新建',
  orders: '新建',
  afterSales: '新建',
};

const searchPlaceholders: Record<SalesTabKey, string> = {
  quotes: '搜索单号、客户、销售物料、报价人',
  orders: '搜索订单号、客户、销售物料',
  outboundRequests: '搜索追踪单、订单号、客户、销售物料',
  afterSales: '搜索售后、销售订单、客户、问题类型、处理动作',
  prices: '搜索销售物料、客户、销售订单',
  inventory: '搜索销售物料、编码、型号、规格',
};

const routePageMap: Record<string, SalesTabKey> = {
  quotes: 'quotes',
  orders: 'orders',
  'outbound-requests': 'outboundRequests',
  'after-sales': 'afterSales',
  prices: 'prices',
  inventory: 'inventory',
};

const activePage = computed<SalesTabKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'quotes';
});

const pageTitle = computed(() => pageTitles[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value]);
const createPath = computed(() => {
  if (activePage.value === 'quotes') return '/sales/quotes/new';
  if (activePage.value === 'orders') return '/sales/orders/new';
  if (activePage.value === 'afterSales') return '/sales/after-sales/new';
  return '';
});
const searchPlaceholder = computed(() => searchPlaceholders[activePage.value]);
type ToolbarMenuKey = 'sort' | 'filter' | 'export';
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
const searchKeyword = ref('');
const sortMode = ref<SortMode>(defaultSortModeForPage(activePage.value));
const statusFilterSeparator = '|';
type BusinessFilters = {
  status: string;
  party: string;
  owner: string;
  dateStart: string;
  dateEnd: string;
};

function defaultSortModeForPage(page: SalesTabKey): SortMode {
  return ['quotes', 'orders', 'outboundRequests', 'afterSales'].includes(page) ? 'status' : 'newest';
}

function emptyBusinessFilters(): BusinessFilters {
  return {
    status: '',
    party: '',
    owner: '',
    dateStart: '',
    dateEnd: '',
  };
}

function cloneBusinessFilters(filters: BusinessFilters): BusinessFilters {
  return { ...filters };
}

const filtersByPage = ref<Record<SalesTabKey, BusinessFilters>>({
  quotes: emptyBusinessFilters(),
  orders: emptyBusinessFilters(),
  outboundRequests: emptyBusinessFilters(),
  afterSales: emptyBusinessFilters(),
  prices: emptyBusinessFilters(),
  inventory: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const apiQuoteRows = ref<SalesQuote[] | null>(null);
const apiOrderRows = ref<SalesOrder[] | null>(null);
const apiOutboundRequestRows = ref<SalesOutboundRequest[] | null>(null);
const apiAfterSalesRows = ref<SalesAfterSale[] | null>(null);
const apiSalesDeliveryRows = ref<SalesDeliveryRecord[] | null>(null);
const apiSalesInventoryRows = ref<SalesInventoryProjectionRow[] | null>(null);
const outboundSignalLoadError = ref('');
const isListLoading = ref(false);
const listLoadError = ref('');
let toastTimer: number | undefined;
let listLoadRequestId = 0;

type SalesPriceRow = {
  key: string;
  product: string;
  materialCode: string;
  model: string;
  spec: string;
  customer: string;
  grossUnitPrice: string;
  netUnitPrice: string;
  taxRate: string;
  uom: string;
  quantity: string;
  sourceDoc: string;
  updatedAt: string;
};

type SalesInventoryRow = {
  key: string;
  materialCode: string;
  product: string;
  model: string;
  spec: string;
  uom: string;
  available: string;
  inTransit: string;
  status: string;
  updatedAt: string;
};
type SalesProductLike = {
  materialCode?: string;
  name: string;
  qty?: string;
  requestQty?: string;
  uom?: string;
};
type DeliverySignal = {
  status: string;
  detail: string;
};
type OrderFulfillmentSnapshot = {
  production: string;
  delivery: string;
  invoice: string;
  payment: string;
  attention: string;
  attentionTone: 'normal' | 'warning' | 'danger' | 'paused';
};
type OrderProgressDimension = 'production' | 'delivery' | 'invoice' | 'payment';
type StructuredSalesOrderFacts = SalesOrder & {
  documentStatus?: unknown;
  productionProgress?: unknown;
  deliveryProgress?: unknown;
  invoiceProgress?: unknown;
  paymentProgress?: unknown;
  attentionFlags?: unknown;
  progressFacts?: unknown;
};
type SalesOrderPriceSource = {
  code: string;
  customer: string;
  contact: string;
  products: Array<{
    lineId?: string;
    materialCode?: string;
    name: string;
    model?: string;
    spec?: string;
    qty: string;
    priceInputMode?: '含税' | '不含税';
    unitPrice: string;
    grossUnitPrice?: string;
    netUnitPrice?: string;
    taxRate?: string;
    uom?: string;
  }>;
  owner: string;
  status: string;
  documentStatus?: string;
  date: string;
};

const progressFieldByDimension: Record<OrderProgressDimension, keyof StructuredSalesOrderFacts> = {
  production: 'productionProgress',
  delivery: 'deliveryProgress',
  invoice: 'invoiceProgress',
  payment: 'paymentProgress',
};

function factRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasOwnFact(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function factText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;

  const record = factRecord(value);
  if (!record) return undefined;
  for (const key of ['label', 'display', 'text', 'name', 'status', 'value', 'progress']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function factKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeStructuredDocumentStatus(value: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    pending_confirm: '草稿',
    confirmed: '已确认',
    in_progress: '已确认',
    completed: '已关闭',
    closed: '已关闭',
    void: '已作废',
    voided: '已作废',
    cancelled: '已作废',
    canceled: '已作废',
  };
  return labels[factKey(value)] ?? value;
}

function normalizeStructuredProgress(dimension: OrderProgressDimension, value: string) {
  const labels: Record<OrderProgressDimension, Record<string, string>> = {
    production: {
      not_started: '未开始',
      pending: '待建工单',
      pending_release: '待安排',
      released: '已安排',
      待释放: '待安排',
      部分释放: '部分安排',
      已释放: '已安排',
      partial: '生产中',
      in_progress: '生产中',
      completed: '已入库',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
    delivery: {
      not_started: '待分配',
      未发货: '待分配',
      pending: '待出库',
      partial: '部分出库',
      in_progress: '待出库',
      completed: '已签收',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
    invoice: {
      not_started: '未开票',
      pending: '未开票',
      partial: '部分开票',
      in_progress: '部分开票',
      completed: '已开票',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
    payment: {
      not_started: '未收款',
      pending: '未收款',
      partial: '部分收款',
      in_progress: '部分收款',
      completed: '已收款',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
  };
  return labels[dimension][factKey(value)] ?? value;
}

function structuredProgressFacts(row: SalesOrder) {
  return factRecord((row as StructuredSalesOrderFacts).progressFacts);
}

function structuredDocumentStatus(row: SalesOrder) {
  const order = row as StructuredSalesOrderFacts;
  const progressFacts = structuredProgressFacts(row);
  const value = factText(order.documentStatus) ?? factText(progressFacts?.documentStatus);
  return value ? normalizeStructuredDocumentStatus(value) : undefined;
}

function structuredProgress(row: SalesOrder, dimension: OrderProgressDimension) {
  const order = row as StructuredSalesOrderFacts;
  const field = progressFieldByDimension[dimension];
  const progressFacts = structuredProgressFacts(row);
  const value = factText(order[field])
    ?? factText(progressFacts?.[field])
    ?? factText(progressFacts?.[dimension]);
  return value ? normalizeStructuredProgress(dimension, value) : undefined;
}

function attentionFlagLabel(value: unknown) {
  const raw = factText(value);
  if (!raw) return undefined;
  const labels: Record<string, string> = {
    normal: '正常',
    none: '正常',
    paused: '暂停',
    blocked: '暂停',
    has_exception: '异常处理中',
    exception: '异常处理中',
    delivery_exception: '异常处理中',
    quality_exception: '异常处理中',
    exception_processing: '异常处理中',
    return_processing: '异常处理中',
    shipment_overdue: '发货逾期',
    delivery_overdue: '交付逾期',
    shipment_due_soon: '发货临近',
    delivery_due_soon: '交付临近',
  };
  return labels[factKey(raw)] ?? raw;
}

function attentionFlagValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];

  const record = factRecord(value);
  if (!record || factText(record)) return [value];
  return Object.entries(record)
    .filter(([, active]) => Boolean(active))
    .map(([flag]) => flag);
}

function structuredAttention(row: SalesOrder): Pick<OrderFulfillmentSnapshot, 'attention' | 'attentionTone'> | undefined {
  const order = row as StructuredSalesOrderFacts;
  const orderRecord = order as unknown as Record<string, unknown>;
  const progressFacts = structuredProgressFacts(row);
  let source: unknown;
  let hasStructuredFlags = false;

  if (hasOwnFact(orderRecord, 'attentionFlags')) {
    source = order.attentionFlags;
    hasStructuredFlags = true;
  } else if (progressFacts && (hasOwnFact(progressFacts, 'attentionFlags') || hasOwnFact(progressFacts, 'attention'))) {
    source = progressFacts.attentionFlags ?? progressFacts.attention;
    hasStructuredFlags = true;
  }

  if (!hasStructuredFlags) return undefined;

  const candidates = attentionFlagValues(source)
    .map((flag) => {
      const label = attentionFlagLabel(flag);
      const key = factKey(`${factText(flag) ?? ''} ${label ?? ''}`);
      const tone: OrderFulfillmentSnapshot['attentionTone'] = /paused|blocked|暂停/.test(key)
        ? 'paused'
        : /exception|overdue|异常|逾期|退货|差异|不合格/.test(key)
          ? 'danger'
          : /due_soon|临近/.test(key)
            ? 'warning'
            : 'normal';
      const rank = tone === 'danger' ? 3 : tone === 'paused' ? 2 : tone === 'warning' ? 1 : 0;
      return label ? { label, tone, rank } : undefined;
    })
    .filter((candidate): candidate is { label: string; tone: OrderFulfillmentSnapshot['attentionTone']; rank: number } => Boolean(candidate))
    .sort((a, b) => b.rank - a.rank);

  const primary = candidates[0];
  return primary
    ? { attention: primary.label, attentionTone: primary.tone }
    : { attention: '正常', attentionTone: 'normal' };
}

function structuredProgressFactSearchValues(row: SalesOrder) {
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      values.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = factRecord(value);
    if (record) Object.values(record).forEach(visit);
  };
  visit((row as StructuredSalesOrderFacts).progressFacts);
  return values;
}

const sortAmountLabel = computed(() => {
  if (activePage.value === 'outboundRequests') {
    return '申请数量从高到低';
  }

  if (activePage.value === 'prices') {
    return '含税单价从高到低';
  }

  if (activePage.value === 'inventory') {
    return '当前可用从高到低';
  }

  return '金额从高到低';
});

const showStatusSort = computed(() => ['quotes', 'orders', 'outboundRequests', 'inventory'].includes(activePage.value));
const currentFilters = computed(() => filtersByPage.value[activePage.value]);

function updateCurrentFilters(filters: BusinessFilters) {
  filtersByPage.value = {
    ...filtersByPage.value,
    [activePage.value]: cloneBusinessFilters(filters),
  };
}

function syncDraftFilters() {
  draftFilters.value = cloneBusinessFilters(currentFilters.value);
}

function updateDraftFilters(patch: Partial<BusinessFilters>) {
  draftFilters.value = {
    ...draftFilters.value,
    ...patch,
  };
}

const filterStatus = computed(() => currentFilters.value.status);
const filterParty = computed(() => currentFilters.value.party);
const filterOwner = computed(() => currentFilters.value.owner);
const filterDateStart = computed(() => currentFilters.value.dateStart);
const filterDateEnd = computed(() => currentFilters.value.dateEnd);

const draftFilterStatus = computed({
  get: () => draftFilters.value.status,
  set: (value: string) => updateDraftFilters({ status: value }),
});
const draftFilterParty = computed({
  get: () => draftFilters.value.party,
  set: (value: string) => updateDraftFilters({ party: value }),
});
const draftFilterOwner = computed({
  get: () => draftFilters.value.owner,
  set: (value: string) => updateDraftFilters({ owner: value }),
});
const draftFilterDateStart = computed({
  get: () => draftFilters.value.dateStart,
  set: (value: string) => updateDraftFilters({ dateStart: value }),
});
const draftFilterDateEnd = computed({
  get: () => draftFilters.value.dateEnd,
  set: (value: string) => updateDraftFilters({ dateEnd: value }),
});

const filterLabels = computed(() => {
  const options: Record<
    SalesTabKey,
    {
      status?: string;
      party?: string;
      owner?: string;
      date?: string;
    }
  > = {
    quotes: {
      status: '状态',
      party: '客户',
      owner: '报价人',
      date: '报价日期',
    },
    orders: {
      status: '跟进状态',
      party: '客户',
      owner: '负责人',
      date: '下单日期',
    },
    outboundRequests: {
      status: '状态',
      party: '客户',
      owner: '负责人',
      date: '计划发货',
    },
    afterSales: {
      status: '状态',
      party: '客户',
      owner: '负责人',
      date: '登记日期',
    },
    prices: {
      party: '客户',
      date: '订单日期',
    },
    inventory: {
      status: '可用判断',
      party: '销售物料',
      date: '更新时间',
    },
  };

  return options[activePage.value];
});

const activeFilterCount = computed(() => {
  const labels = filterLabels.value;
  const filters = currentFilters.value;

  return [
    labels.status ? statusFilterValues(filters.status).join(statusFilterSeparator) : '',
    labels.party ? filters.party : '',
    labels.owner ? filters.owner : '',
    labels.date ? filters.dateStart : '',
    labels.date ? filters.dateEnd : '',
  ].filter(Boolean).length;
});
const hasListConstraints = computed(() => Boolean(normalized(searchKeyword.value)) || activeFilterCount.value > 0);

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function statusFilterValues(value = filterStatus.value) {
  return value.split(statusFilterSeparator).filter(Boolean);
}

function matchesStatusFilter(status: string, page: SalesTabKey = activePage.value) {
  const values = statusFilterValues();
  return !values.length || values.includes(status) || values.includes(statusLabelForPage(status, page));
}

function matchesKeywordFilter(values: Array<string | undefined>, filter: string) {
  const keyword = filter.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return true;
  return values.some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(keyword));
}

function includesKeyword(values: unknown[]) {
  const keyword = normalized(searchKeyword.value);

  if (!keyword) {
    return true;
  }

  return values.some((value) => normalized(value).includes(keyword));
}

function parseMoney(value: string) {
  return Number(value.replace(/[^\d.-]/g, '')) || 0;
}

function formatMoney(value: number) {
  return `￥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPriceValue(value: string) {
  const raw = String(value ?? '').trim();
  const matched = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return matched ? formatMoney(Number(matched[0])) : raw || '-';
}

function contactText(row: { contact?: string; contactPhone?: string }) {
  return [row.contact, row.contactPhone].filter(Boolean).join(' · ') || '-';
}

function sortRows<T>(
  rows: T[],
  getters: {
    date: (row: T) => string;
    amount?: (row: T) => number;
    status?: (row: T) => string;
  },
) {
  const statusRank: Record<string, number> = {
    草稿: 1,
    待发货: 2,
    待申请出库: 2,
    已提交: 2,
    待受理: 2,
    待确认: 2,
    生产中: 3,
    待补充: 3,
    需补货: 3,
    无可用库存: 1,
    等待在途: 2,
    有可用库存: 5,
    处理中: 4,
    发货中: 4,
    已申请出库: 4,
    仓库已受理: 4,
    部分发货: 4,
    部分出库: 4,
    待签收: 5,
    已发货: 5,
    已出库: 5,
    待开票: 6,
    待收款: 7,
    部分收款: 8,
    已确认: 10,
    已转订单: 10,
    已关闭: 98,
    退货处理中: 90,
    已驳回: 91,
    已中断: 92,
    已取消: 93,
    已完成: 98,
    已收款: 98,
    已作废: 99,
    不足: 1,
    部分可发: 4,
    正常: 5,
    现货可发: 5,
    现货可承诺: 5,
    充足: 6,
  };
  const quoteStatusRank: Record<string, number> = {
    草稿: 1,
    已驳回: 2,
    已确认: 3,
    已转订单: 98,
    已作废: 99,
  };
  const afterSalesStatusRank: Record<string, number> = {
    待受理: 1,
    处理中: 2,
    待确认: 3,
    已关闭: 98,
    已作废: 99,
  };
  const rankForStatus = (status: string) => (
    activePage.value === 'quotes'
      ? (quoteStatusRank[status] ?? 90)
      : activePage.value === 'afterSales'
        ? (afterSalesStatusRank[status] ?? 90)
      : (statusRank[status] ?? 99)
  );

  return [...rows].sort((a, b) => {
    if (sortMode.value === 'oldest') {
      return getters.date(a).localeCompare(getters.date(b));
    }

    if (sortMode.value === 'amountDesc' && getters.amount) {
      return getters.amount(b) - getters.amount(a);
    }

    if (sortMode.value === 'status' && getters.status) {
      const statusDiff = rankForStatus(getters.status(a)) - rankForStatus(getters.status(b));
      return statusDiff || getters.date(b).localeCompare(getters.date(a));
    }

    return getters.date(b).localeCompare(getters.date(a));
  });
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

function clearCurrentSalesRows(page: SalesTabKey) {
  if (page === 'quotes') apiQuoteRows.value = null;
  if (page === 'orders' || page === 'prices' || page === 'outboundRequests') apiOrderRows.value = null;
  if (page === 'outboundRequests') {
    apiOutboundRequestRows.value = null;
    apiSalesDeliveryRows.value = null;
    apiSalesInventoryRows.value = null;
    outboundSignalLoadError.value = '';
  }
  if (page === 'afterSales') apiAfterSalesRows.value = null;
  if (page === 'inventory') apiSalesInventoryRows.value = null;
}

async function loadCurrentSalesList() {
  const page = activePage.value;
  const requestId = ++listLoadRequestId;
  listLoadError.value = '';

  isListLoading.value = true;
  clearCurrentSalesRows(page);

  try {
    if (page === 'quotes') {
      const rows = await listSalesQuotes();
      if (requestId !== listLoadRequestId) return;
      apiQuoteRows.value = rows;
    } else if (page === 'orders') {
      const rows = await listSalesOrders();
      if (requestId !== listLoadRequestId) return;
      apiOrderRows.value = rows;
    } else if (page === 'outboundRequests') {
      const [rows, orders, deliveryResult, inventoryResult] = await Promise.all([
        listSalesOutboundRequests(),
        listSalesOrders(),
        listSalesDeliveryRecords().then(
          (items) => ({ ok: true as const, items }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
        listSalesInventory().then(
          (items) => ({ ok: true as const, items }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
      ]);
      if (requestId !== listLoadRequestId) return;
      apiOutboundRequestRows.value = rows;
      apiOrderRows.value = orders;
      apiSalesDeliveryRows.value = deliveryResult.ok ? deliveryResult.items : [];
      apiSalesInventoryRows.value = inventoryResult.ok ? inventoryResult.items : [];
      const signalErrors = [
        deliveryResult.ok
          ? ''
          : deliveryResult.error instanceof Error
            ? `交付记录：${deliveryResult.error.message}`
            : '交付记录加载失败',
        inventoryResult.ok
          ? ''
          : inventoryResult.error instanceof Error
            ? `库存判断：${inventoryResult.error.message}`
            : '库存判断加载失败',
      ].filter(Boolean);
      outboundSignalLoadError.value = signalErrors.join('；');
    } else if (page === 'afterSales') {
      const rows = await listSalesAfterSales();
      if (requestId !== listLoadRequestId) return;
      apiAfterSalesRows.value = rows;
    } else if (page === 'prices') {
      const rows = await listSalesOrders();
      if (requestId !== listLoadRequestId) return;
      apiOrderRows.value = rows;
    } else if (page === 'inventory') {
      const rows = await listSalesInventory();
      if (requestId !== listLoadRequestId) return;
      apiSalesInventoryRows.value = rows;
    }
  } catch (error) {
    if (requestId !== listLoadRequestId) return;
    clearCurrentSalesRows(page);
    if (page === 'quotes') apiQuoteRows.value = [];
    if (page === 'orders' || page === 'prices' || page === 'outboundRequests') apiOrderRows.value = [];
    if (page === 'outboundRequests') apiOutboundRequestRows.value = [];
    if (page === 'afterSales') apiAfterSalesRows.value = [];
    if (page === 'inventory') apiSalesInventoryRows.value = [];
    listLoadError.value = error instanceof Error ? error.message : `${pageTitle.value}加载失败`;
  } finally {
    if (requestId === listLoadRequestId) isListLoading.value = false;
  }
}

function orderStatusLabel(status: string) {
  if (status === '待申请出库' || status === '已提交') return '待发货';
  if (status === '已发货' || status === '已出库') return '待签收';
  return status;
}

function legacyOrderDocumentStatus(status: string) {
  const normalizedStatus = orderStatusLabel(status);
  if (['草稿', '已驳回', '已退回'].includes(normalizedStatus)) return '草稿';
  if (['已作废', '已取消'].includes(normalizedStatus)) return '已作废';
  if (['已完成', '已收款', '已关闭'].includes(normalizedStatus)) return '已关闭';
  return '已确认';
}

function orderDocumentStatus(row: SalesOrder) {
  return structuredDocumentStatus(row) ?? legacyOrderDocumentStatus(row.status);
}

function outboundStatusLabel(status: string) {
  if (status === '已提交') return '待发货';
  if (status === '部分发货') return '部分出库';
  return status;
}

function statusLabelForPage(status: string, page: SalesTabKey = activePage.value) {
  if (page === 'orders') return legacyOrderDocumentStatus(status);
  if (page === 'outboundRequests') return outboundStatusLabel(status);
  return status;
}

function statusClass(status: string) {
  return statusPresentationClass(statusLabel(status));
}

function statusLabel(status: string) {
  return statusLabelForPage(status);
}

function inventoryStatusClass(status: string) {
  return statusPresentationClass(status);
}

function parseStockQty(value: string) {
  return Number(value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function stockUnit(value: string) {
  return value.replace(/[\d,.\s]/g, '') || '件';
}

function formatStockQty(value: number, unit: string) {
  return `${value.toLocaleString('zh-CN')} ${unit}`;
}

function normalizedDate(value?: string) {
  const raw = String(value ?? '').trim().replace(/\//g, '-');
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return raw.slice(0, 10);
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function dateNumber(value?: string) {
  const normalizedValue = normalizedDate(value);
  const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}

function todayNumber() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
}

function salesQuoteNextStep(row: Pick<SalesQuote, 'status' | 'validUntil'>) {
  if (['草稿', '已驳回', '已确认'].includes(row.status) && dateNumber(row.validUntil) < todayNumber()) return '更新有效期';
  const nextStepMap: Record<string, string> = {
    草稿: '确认报价',
    已驳回: '修改后重新确认',
    已确认: '转销售订单',
    已转订单: '查看关联订单',
    已作废: '无后续',
  };
  return nextStepMap[row.status] ?? '查看日志';
}

function quoteValidUntilText(row: SalesQuote) {
  return row.validUntil ? `有效期 ${normalizedDate(row.validUntil)}` : '有效期未定';
}

function quoteTermsSummary(row: SalesQuote) {
  return [row.deliveryMethod, row.paymentMethod].filter(Boolean).join(' · ') || '条款待补';
}

function quoteValidityRisk(row: SalesQuote) {
  if (['已转订单', '已作废'].includes(row.status)) return null;

  const diff = dateNumber(row.validUntil) - todayNumber();
  if (!Number.isFinite(diff)) return null;
  if (diff < 0) return { label: `已过期 ${Math.abs(diff)} 天`, tone: 'danger' };
  if (diff <= 2) return { label: diff === 0 ? '今日到期' : `${diff} 天后到期`, tone: 'warning' };
  return null;
}

function orderDeliveryDate(row: SalesOrder) {
  return normalizedDate(row.delivery) || '-';
}

function orderShipPlanText(row: SalesOrder) {
  return row.plannedShipDate ? `计划发货 ${normalizedDate(row.plannedShipDate)}` : '计划发货待定';
}

function orderTimingRisk(row: SalesOrder) {
  const structured = structuredAttention(row);
  if (structured) {
    return /逾期|临近/.test(structured.attention)
      ? { label: structured.attention, tone: structured.attentionTone === 'warning' ? 'warning' as const : 'danger' as const }
      : null;
  }

  const status = orderStatusLabel(row.status);
  if (['已完成', '已作废', '已驳回', '已中断'].includes(status)) return null;

  const today = todayNumber();
  const deliveryDiff = dateNumber(row.delivery) - today;
  const shipPlanDiff = dateNumber(row.plannedShipDate) - today;
  const waitingShipment = ['草稿', '待发货', '生产中', '发货中', '部分发货', '已申请出库'].includes(status);

  if (waitingShipment && Number.isFinite(shipPlanDiff) && shipPlanDiff < 0) {
    return { label: `发货逾期 ${Math.abs(shipPlanDiff)} 天`, tone: 'danger' };
  }

  if (Number.isFinite(deliveryDiff) && deliveryDiff < 0) {
    return { label: `交付逾期 ${Math.abs(deliveryDiff)} 天`, tone: 'danger' };
  }

  if (waitingShipment && Number.isFinite(shipPlanDiff) && shipPlanDiff <= 1) {
    return { label: '发货临近', tone: 'warning' };
  }

  if (Number.isFinite(deliveryDiff) && deliveryDiff <= 3) {
    return { label: '交付临近', tone: 'warning' };
  }

  return null;
}

function orderUnpaidSummary(row: SalesOrder) {
  const summary = row.commercialSummary;
  if (summary) {
    const unpaid = Math.max(Number(summary.receivableAmount || 0) - Number(summary.settledAmount || 0), 0);
    if (Number(summary.receivableAmount || 0) <= 0) return '金额待确认';
    return unpaid > 0 ? `待收 ${formatMoney(unpaid)}` : '已收款';
  }

  const status = orderStatusLabel(row.status);
  if (['草稿', '待发货', '生产中', '发货中', '部分发货', '已申请出库', '待签收'].includes(status)) {
    return '未到回款';
  }

  if (status === '待开票') return '未到回款';
  if (['待收款', '部分收款', '已收款', '已完成', '已关闭'].includes(status)) return '暂无回款记录';
  if (['已作废', '已驳回', '已中断'].includes(status)) return '无需收款';

  return '暂无回款记录';
}

function orderProductionProgress(row: SalesOrder) {
  const structured = structuredProgress(row, 'production');
  if (structured) return structured;

  const status = orderStatusLabel(row.status);
  if (orderDocumentStatus(row) === '草稿') return '未开始';

  const links = row.products.flatMap((product) => product.fulfillmentLinks ?? []).filter((link) => link.type === '生产任务');
  if (['已中断', '已作废', '已取消'].includes(status) && !links.length) return '未记录';
  if (links.some((link) => link.status.includes('部分入库'))) return '部分入库';
  if (links.length && links.every((link) => /已入库|已完成|已关闭/.test(link.status))) return '已入库';
  if (links.some((link) => /待建|待释放/.test(link.status))) return '待建工单';
  if (status === '生产中' || links.length) return '生产中';
  return '无需生产';
}

function orderDeliveryProgress(row: SalesOrder) {
  const structured = structuredProgress(row, 'delivery');
  if (structured) return structured;

  const status = orderStatusLabel(row.status);
  const outbound = (apiOutboundRequestRows.value ?? []).find((record) => record.sourceOrder === row.code);
  const outboundStatus = outboundStatusLabel(outbound?.status ?? '');

  if (['已中断', '已作废', '已取消'].includes(status) && !outboundStatus) return '未记录';
  if (['待开票', '待收款', '部分收款', '已完成', '已收款', '已关闭'].includes(status)) return '已签收';
  if (isAwaitingOrderReceipt(status)) return '待签收';
  if (status === '部分发货' || outboundStatus === '部分出库') return '部分出库';
  if (status === '发货中' || status === '已申请出库' || ['待发货', '仓库已受理'].includes(outboundStatus)) return '待出库';
  if (outboundStatus === '已出库' || outboundStatus === '已发完') return '待签收';
  return '待分配';
}

function isAwaitingOrderReceipt(status: string) {
  return ['待签收', '已发货', '已出库'].includes(status);
}

function orderInvoiceProgress(row: SalesOrder) {
  const structured = structuredProgress(row, 'invoice');
  if (structured) return structured;

  const status = orderStatusLabel(row.status);
  if (status === '部分开票') return '部分开票';
  if (Number(row.commercialSummary?.invoicedAmount || 0) > 0 || ['待收款', '部分收款', '已收款', '已完成', '已关闭'].includes(status)) {
    return '已开票';
  }
  return '未开票';
}

function orderPaymentProgress(row: SalesOrder) {
  const structured = structuredProgress(row, 'payment');
  if (structured) return structured;

  const summary = row.commercialSummary;
  if (summary && summary.receivableAmount > 0 && summary.settledAmount >= summary.receivableAmount) return '已收款';
  if (summary && summary.settledAmount > 0) return '部分收款';
  const status = orderStatusLabel(row.status);
  if (status === '已收款' || ['已完成', '已关闭'].includes(status)) return '已收款';
  if (status === '部分收款') return '部分收款';
  return '未收款';
}

function orderAttention(row: SalesOrder): Pick<OrderFulfillmentSnapshot, 'attention' | 'attentionTone'> {
  const structured = structuredAttention(row);
  if (structured) return structured;

  const status = orderStatusLabel(row.status);
  if (status === '已中断') return { attention: '暂停', attentionTone: 'paused' };
  if (status === '退货处理中') return { attention: '异常处理中', attentionTone: 'danger' };
  const hasDeliveryException = salesDeliveryRows.value.some((issue) => (
    issue.sourceOrder === row.code && /异常|差异|不合格|退货/.test(issue.status)
  ));
  if (hasDeliveryException) return { attention: '异常处理中', attentionTone: 'danger' };
  if (orderDocumentStatus(row) === '已作废') return { attention: '无需提示', attentionTone: 'normal' };

  const timingRisk = orderTimingRisk(row);
  if (timingRisk?.tone === 'danger') return { attention: timingRisk.label, attentionTone: 'danger' };
  if (timingRisk?.tone === 'warning') return { attention: timingRisk.label, attentionTone: 'warning' };
  return { attention: '正常', attentionTone: 'normal' };
}

function buildOrderFulfillmentSnapshot(row: SalesOrder): OrderFulfillmentSnapshot {
  return {
    production: orderProductionProgress(row),
    delivery: orderDeliveryProgress(row),
    invoice: orderInvoiceProgress(row),
    payment: orderPaymentProgress(row),
    ...orderAttention(row),
  };
}

function fulfillmentStatusClass(status: string) {
  return statusPresentationClass(status);
}

function productDeliveryKey(product: SalesProductLike) {
  return product.materialCode || product.name || '';
}

function inventoryMaterialCode(row: SalesInventoryProjectionRow) {
  return row.materialCode || '';
}

function matchesInventoryProduct(row: SalesInventoryProjectionRow, product: SalesProductLike) {
  const rowCode = inventoryMaterialCode(row);
  if (product.materialCode && rowCode) return rowCode === product.materialCode;
  return Boolean(product.name && row.item === product.name);
}

function relatedDeliveryRecordsForTracking(row: SalesOutboundRequest) {
  return salesDeliveryRows.value.filter((record) => (
    row.sourceOrder
    && record.sourceOrder === row.sourceOrder
    && !record.reversalCode
    && !['已作废', '已取消', '已冲销'].includes(record.status)
  ));
}

function shippedQtyForProduct(row: SalesOutboundRequest, product: SalesProductLike) {
  return relatedDeliveryRecordsForTracking(row)
    .filter((record) => record.status === '已出库')
    .reduce((sum, record) => {
      return sum + record.products
        .filter((line) => productDeliveryKey(line) === productDeliveryKey(product))
        .reduce((lineSum, line) => lineSum + parseStockQty(line.qty), 0);
    }, 0);
}

function buildOutboundDeliverySignal(row: SalesOutboundRequest): DeliverySignal {
  if (!row.products.length) return { status: '待确认', detail: '缺少发货明细' };
  if (outboundSignalLoadError.value) {
    return { status: '数据待重试', detail: outboundSignalLoadError.value };
  }

  const lineSignals = row.products.map((product) => {
    const planned = parseStockQty(product.requestQty || product.qty || '');
    const shipped = shippedQtyForProduct(row, product);
    const remaining = Math.max(0, planned - shipped);
    const inventoryRows = (apiSalesInventoryRows.value ?? []).filter((inventoryRow) =>
      matchesInventoryProduct(inventoryRow, product),
    );
    const available = inventoryRows.reduce((sum, inventoryRow) => sum + parseStockQty(inventoryRow.available), 0);
    const outboundPlan = inventoryRows.reduce((sum, inventoryRow) => sum + parseStockQty(inventoryRow.outboundPlan), 0);
    const inboundPlan = inventoryRows.reduce((sum, inventoryRow) => sum + parseStockQty(inventoryRow.inboundPlan), 0);
    const reservedForSourceOrder = inventoryRows.reduce((sum, inventoryRow) => {
      return sum + (inventoryRow.salesReservationSources || [])
        .filter((source) => source.sourceDoc === row.sourceOrder && !['已释放', '已作废'].includes(source.status))
        .reduce((sourceSum, source) => sourceSum + parseStockQty(source.qty), 0);
    }, 0);
    const sourceOrder = orderListRows.value.find((order) => order.code === row.sourceOrder);
    const sourceProduct = sourceOrder?.products.find((orderProduct) => (
      product.materialCode
        ? orderProduct.materialCode === product.materialCode
        : orderProduct.name === product.name
    ));
    const productionPlan = (sourceProduct?.fulfillmentLinks || [])
      .filter((link) => link.type === '生产任务' && !['已关闭', '已作废', '已取消'].includes(link.status))
      .reduce((sum, link) => sum + parseStockQty(link.qty), 0);
    const committable = Math.max(0, available - outboundPlan) + reservedForSourceOrder;
    const shortage = Math.max(0, remaining - committable);

    return {
      remaining,
      committable,
      shortage,
      shortageAfterPlan: Math.max(0, shortage - inboundPlan - productionPlan),
    };
  });

  if (row.status === '已出库' || lineSignals.every((line) => line.remaining <= 0)) {
    return { status: '已发完', detail: '全部批次已出库' };
  }

  const shortageCount = lineSignals.filter((line) => line.shortageAfterPlan > 0).length;
  const waitingCount = lineSignals.filter((line) => line.shortage > 0 && line.shortageAfterPlan <= 0).length;
  const partialCount = lineSignals.filter((line) => line.committable > 0 && line.shortage > 0).length;

  if (shortageCount) return { status: '需补货', detail: `${shortageCount} 项仍有缺口` };
  if (waitingCount) return { status: '待补充', detail: `${waitingCount} 项等入库/生产` };
  if (partialCount) return { status: '部分可发', detail: `${partialCount} 项可先发一部分` };
  return { status: '现货可发', detail: '剩余待发可由现货覆盖' };
}

function salesPriceRowsFromOrders(rows: SalesOrderPriceSource[]): SalesPriceRow[] {
  return rows.flatMap((order) => {
    const lifecycle = order.documentStatus || order.status;
    if (!['已确认', '已关闭'].includes(lifecycle)) {
      return [];
    }

    return order.products
      .filter((product) => product.name && (product.grossUnitPrice || product.unitPrice))
      .map((product, index) => {
        const grossUnitPrice = product.grossUnitPrice || product.unitPrice;
        const netUnitPrice = product.netUnitPrice
          || (product.priceInputMode === '不含税' ? product.unitPrice : '');

        return {
          key: `${order.code}-${product.lineId || product.materialCode || index}`,
          product: product.name || '—',
          materialCode: product.materialCode || '',
          model: product.model || '',
          spec: product.spec || '',
          customer: order.customer,
          grossUnitPrice: formatPriceValue(grossUnitPrice),
          netUnitPrice: netUnitPrice ? formatPriceValue(netUnitPrice) : '—',
          taxRate: product.taxRate || '—',
          uom: product.uom || '',
          quantity: product.qty,
          sourceDoc: order.code,
          updatedAt: order.date,
        };
      });
  });
}

const salesPriceRows = computed<SalesPriceRow[]>(() => {
  return apiOrderRows.value ? salesPriceRowsFromOrders(orderListRows.value) : [];
});

function isFinishedGoodInventory(row: SalesInventoryProjectionRow) {
  const sourceText = `${row.itemType || ''} ${row.item || ''}`.toLowerCase();
  return sourceText.includes('成品') || sourceText.includes('finished');
}

function salesInventoryRowsFromProjection(rows: SalesInventoryProjectionRow[]): SalesInventoryRow[] {
  return rows.filter(isFinishedGoodInventory).map((row) => {
    const uom = row.uom || stockUnit(row.available || '0 件');
    const inTransit = Number(row.inTransitNumber ?? row.inboundPlanNumber ?? parseStockQty(row.inTransit || row.inboundPlan));

    return {
      key: row.key || `${row.materialCode || row.item}::${uom}`,
      materialCode: row.materialCode || '',
      product: row.item,
      model: row.model || '',
      spec: row.spec || '',
      uom,
      available: row.available,
      inTransit: formatStockQty(inTransit, uom),
      status: row.status,
      updatedAt: row.updatedAt,
    };
  });
}

const salesInventoryRows = computed<SalesInventoryRow[]>(() =>
  apiSalesInventoryRows.value ? salesInventoryRowsFromProjection(apiSalesInventoryRows.value) : [],
);

const inventorySummaryRows = computed(() => {
  return salesInventoryRows.value.map((row) => {
    const totalAvailable = parseStockQty(row.available);
    const inTransit = parseStockQty(row.inTransit);
    const expectedAvailable = totalAvailable + inTransit;
    const status =
      totalAvailable > 0
        ? '有可用库存'
        : inTransit > 0
          ? '等待在途'
          : '无可用库存';
    return {
      key: row.key,
      product: row.product,
      materialCode: row.materialCode,
      model: row.model,
      spec: row.spec,
      unit: row.uom,
      currentAvailable: formatStockQty(totalAvailable, row.uom),
      inTransit: formatStockQty(inTransit, row.uom),
      hasInTransit: inTransit > 0,
      expectedAvailable: formatStockQty(expectedAvailable, row.uom),
      status,
      updatedAt: row.updatedAt,
    };
  });
});

const quoteListRows = computed(() => apiQuoteRows.value ?? []);

const orderListRows = computed(() => apiOrderRows.value ?? []);

const outboundRequestListRows = computed(() => apiOutboundRequestRows.value ?? []);

const salesDeliveryRows = computed(() => (apiSalesDeliveryRows.value ?? []).filter((record) => (
  !record.reversalCode
  && !['已作废', '已取消', '已冲销'].includes(record.status)
)));

const orderFulfillmentSnapshots = computed<Record<string, OrderFulfillmentSnapshot>>(() =>
  Object.fromEntries(orderListRows.value.map((row) => [row.code, buildOrderFulfillmentSnapshot(row)])),
);

function orderFulfillmentSnapshot(row: SalesOrder) {
  return orderFulfillmentSnapshots.value[row.code] ?? buildOrderFulfillmentSnapshot(row);
}

const outboundDeliverySignals = computed<Record<string, DeliverySignal>>(() =>
  Object.fromEntries(outboundRequestListRows.value.map((row) => [row.code, buildOutboundDeliverySignal(row)])),
);

function outboundDeliverySignal(row: SalesOutboundRequest) {
  return outboundDeliverySignals.value[row.code] ?? { status: '待确认', detail: '等待库存和发货数据' };
}

function salesOutboundNextStep(status: string) {
  if (status === '草稿') return '确认发货要求';
  if (status === '已提交' || status === '待发货') return '跟进仓库出库';
  if (status === '仓库已受理') return '跟进复核发运';
  if (status === '部分出库') return '跟进剩余出库';
  if (status === '已出库' || status === '已发完') return '回到订单确认签收';
  if (status === '已签收' || status === '已完成') return '查看交付记录';
  if (status === '已作废') return '无后续';
  return '查看日志';
}

function salesOutboundIssueStage(row: SalesOutboundRequest) {
  const deliveryStatus = outboundDeliverySignal(row).status;
  const status = outboundStatusLabel(row.status);
  if (status === '已作废') return '未发生';
  if (['已出库', '已发完', '已签收', '已完成'].includes(status) || deliveryStatus === '已发完') return '已出库';
  if (status === '部分出库') return '部分出库';
  if (status === '仓库已受理') return '备货中';
  return '待出库';
}

function salesOutboundReceiptStage(row: SalesOutboundRequest) {
  const status = outboundStatusLabel(row.status);
  if (status === '已作废') return '未发生';
  if (['已签收', '已完成'].includes(status)) return '已签收';
  if (['已出库', '已发完'].includes(status) || outboundDeliverySignal(row).status === '已发完') return '待签收';
  return '未开始';
}

function salesOutboundCurrentAction(row: SalesOutboundRequest) {
  const status = outboundStatusLabel(row.status);
  if (['已签收', '已完成'].includes(status)) return '已完成';
  if (status === '已作废') return '已作废';
  return salesOutboundNextStep(status);
}

function salesOutboundTimingRisk(row: SalesOutboundRequest) {
  if (['已出库', '已发完', '已签收', '已完成', '已作废'].includes(row.status)) return '';
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (row.deliveryDate && row.deliveryDate < today) return '交付逾期';
  if (row.expectedDate && row.expectedDate < today) return '发货逾期';
  return '';
}

const salesAfterSaleRows = computed<SalesAfterSale[]>(() => apiAfterSalesRows.value ?? []);

function afterSaleProductSummary(row: SalesAfterSale) {
  if (!row.products.length) return '—';
  const first = row.products[0];
  return row.products.length > 1 ? `${first.name} 等 ${row.products.length} 项` : first.name;
}

function afterSaleAffectedQuantity(row: SalesAfterSale) {
  if (!row.products.length) return '—';
  const grouped = new Map<string, number>();
  row.products.forEach((product) => {
    const unit = product.uom || '';
    grouped.set(unit, (grouped.get(unit) || 0) + parseStockQty(product.qty));
  });
  return [...grouped.entries()]
    .map(([unit, quantity]) => `${quantity.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`)
    .join('、');
}

function afterSaleExecutionSummary(row: SalesAfterSale) {
  const tasks = row.executionTasks || [];
  if (!row.action) return '方案待定';
  if (!tasks.length) return row.status === '待受理' ? '待受理' : row.action;
  const completed = tasks.filter((task) => task.status === '已完成').length;
  return `${row.action} · ${completed}/${tasks.length} 项完成`;
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

function dateOnly(date: string) {
  return date.slice(0, 10);
}

function matchesDateRange(date: string) {
  const value = dateOnly(date);

  return (!filterDateStart.value || value >= filterDateStart.value) && (!filterDateEnd.value || value <= filterDateEnd.value);
}

function orderFollowUpFilterValues(row: SalesOrder) {
  const fulfillment = orderFulfillmentSnapshot(row);
  const values = [
    `单据 · ${orderDocumentStatus(row)}`,
    `生产 · ${fulfillment.production}`,
    `交付 · ${fulfillment.delivery}`,
    `开票 · ${fulfillment.invoice}`,
    `收款 · ${fulfillment.payment}`,
  ];
  if (fulfillment.attention !== '正常' && fulfillment.attention !== '无需提示') {
    values.unshift(`提醒 · ${fulfillment.attention}`);
  }
  return values;
}

const filterStatusOptions = computed(() => {
  if (activePage.value === 'quotes') {
    return uniqueValues(quoteListRows.value.map((row) => row.status));
  }

  if (activePage.value === 'orders') {
    const rows = orderListRows.value;
    const reminders = rows
      .map((row) => orderFulfillmentSnapshot(row).attention)
      .filter((value) => value !== '正常' && value !== '无需提示')
      .map((value) => `提醒 · ${value}`);
    return [
      ...uniqueValues(reminders),
      ...uniqueValues(rows.map((row) => `单据 · ${orderDocumentStatus(row)}`)),
      ...uniqueValues(rows.map((row) => `生产 · ${orderFulfillmentSnapshot(row).production}`)),
      ...uniqueValues(rows.map((row) => `交付 · ${orderFulfillmentSnapshot(row).delivery}`)),
      ...uniqueValues(rows.map((row) => `开票 · ${orderFulfillmentSnapshot(row).invoice}`)),
      ...uniqueValues(rows.map((row) => `收款 · ${orderFulfillmentSnapshot(row).payment}`)),
    ];
  }

  if (activePage.value === 'outboundRequests') {
    return uniqueValues(outboundRequestListRows.value.map((row) => outboundStatusLabel(row.status)));
  }

  if (activePage.value === 'afterSales') {
    return uniqueValues(salesAfterSaleRows.value.map((row) => row.status));
  }

  if (activePage.value === 'inventory') {
    return uniqueValues(inventorySummaryRows.value.map((row) => row.status));
  }

  return [];
});

type FilterFieldKey = 'status' | 'party' | 'owner';
type FilterOption = string | { value: string; label: string };

type SalesFilterField = {
  key: FilterFieldKey;
  label: string;
  options: FilterOption[];
  control?: 'select' | 'search';
};

const filterFields = computed<SalesFilterField[]>(() => {
  const labels = filterLabels.value;
  const fields: SalesFilterField[] = [];

  if (labels.status && filterStatusOptions.value.length) {
    fields.push({ key: 'status', label: labels.status, options: filterStatusOptions.value });
  }

  if (labels.party) {
    fields.push({ key: 'party', label: labels.party, options: [], control: 'search' });
  }

  if (labels.owner) {
    fields.push({ key: 'owner', label: labels.owner, options: [], control: 'search' });
  }

  return fields;
});

const filterDateLabel = computed(() => filterLabels.value.date ?? '');

function resetBusinessFilters() {
  const emptyFilters = emptyBusinessFilters();
  updateCurrentFilters(emptyFilters);
  draftFilters.value = cloneBusinessFilters(emptyFilters);
  showToast('已清空筛选条件');
}

function applyBusinessFilters() {
  updateCurrentFilters(draftFilters.value);
  showToast('已应用当前筛选条件');
}

function applyAndCloseFilters() {
  applyBusinessFilters();
  openToolbarMenu.value = null;
}

function clearListConstraints() {
  searchKeyword.value = '';
  resetBusinessFilters();
  openToolbarMenu.value = null;
}

const visibleQuoteRows = computed(() => {
  const filtered = quoteListRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.customer,
      row.contact,
      row.contactPhone,
      row.owner,
      row.status,
      row.date,
      row.validUntil,
      salesQuoteNextStep(row),
      quoteValidityRisk(row)?.label,
      ...row.products.flatMap((product) => [productIdentity(product, ''), product.qty]),
    ]);
    const matchesStatus = matchesStatusFilter(row.status, 'quotes');
    const matchesParty = matchesKeywordFilter([row.customer, row.customerCode], filterParty.value);
    const matchesOwner = matchesKeywordFilter([row.owner], filterOwner.value);
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.date,
    amount: (row) => parseMoney(row.amount),
    status: (row) => statusLabelForPage(row.status, 'quotes'),
  });
});

const visibleOrderRows = computed(() => {
  const filtered = orderListRows.value.filter((row) => {
    const fulfillment = orderFulfillmentSnapshot(row);
    const matchesSearch = includesKeyword([
      row.code,
      row.customer,
      row.contact,
      row.contactPhone,
      row.sourceQuote,
      row.owner,
      row.priority,
      row.status,
      row.delivery,
      row.plannedShipDate,
      orderShipPlanText(row),
      orderTimingRisk(row)?.label,
      orderUnpaidSummary(row),
      fulfillment.production,
      fulfillment.delivery,
      fulfillment.invoice,
      fulfillment.payment,
      fulfillment.attention,
      ...structuredProgressFactSearchValues(row),
      ...row.products.flatMap((product) => [productIdentity(product, ''), product.qty]),
    ]);
    const selectedStatuses = statusFilterValues();
    const matchesStatus = !selectedStatuses.length
      || orderFollowUpFilterValues(row).some((value) => selectedStatuses.includes(value));
    const matchesParty = matchesKeywordFilter([row.customer, row.customerCode], filterParty.value);
    const matchesOwner = matchesKeywordFilter([row.owner], filterOwner.value);
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.date,
    amount: (row) => parseMoney(row.amount),
    status: (row) => orderDocumentStatus(row),
  });
});

const visibleOutboundRequestRows = computed(() => {
  const filtered = outboundRequestListRows.value.filter((row) => {
    const deliverySignal = outboundDeliverySignal(row);
    const matchesSearch = includesKeyword([
      row.code,
      row.sourceOrder,
      row.customer,
      row.contact,
      row.contactPhone,
      row.applicant,
      row.status,
      row.deliveryDate,
      row.expectedDate,
      row.deliveryMethod,
      deliverySignal.status,
      deliverySignal.detail,
      salesOutboundTimingRisk(row),
      ...row.products.flatMap((product) => [productIdentity(product, ''), product.qty, product.requestQty]),
    ]);
    const matchesStatus = matchesStatusFilter(row.status, 'outboundRequests');
    const matchesParty = matchesKeywordFilter([row.customer, row.customerCode], filterParty.value);
    const matchesOwner = matchesKeywordFilter([row.applicant], filterOwner.value);
    const matchesDate = matchesDateRange(row.requestDate);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.requestDate,
    amount: (row) => row.products.reduce((sum, product) => sum + parseStockQty(product.requestQty), 0),
    status: (row) => outboundStatusLabel(row.status),
  });
});

const visibleAfterSaleRows = computed(() => {
  const filtered = salesAfterSaleRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.sourceOrder,
      row.customer,
      row.contact,
      row.issueType,
      row.action,
      row.responsibility,
      row.amountImpact,
      row.owner,
      row.status,
      row.nextStep,
      ...row.products.flatMap((product) => [product.name, product.model, product.spec, product.qty]),
      ...(row.executionTasks || []).flatMap((task) => [task.module, task.kind, task.status, task.evidence, task.note]),
    ]);
    const matchesStatus = matchesStatusFilter(row.status, 'afterSales');
    const matchesParty = matchesKeywordFilter([row.customer, row.customerCode], filterParty.value);
    const matchesOwner = matchesKeywordFilter([row.owner], filterOwner.value);
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.date,
    status: (row) => row.status,
  });
});

const visiblePriceRows = computed(() => {
  const filtered = salesPriceRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.product,
      row.materialCode,
      row.model,
      row.spec,
      row.customer,
      row.sourceDoc,
      row.quantity,
      row.grossUnitPrice,
      row.netUnitPrice,
      row.taxRate,
    ]);
    const matchesParty = matchesKeywordFilter([row.customer], filterParty.value);
    const matchesDate = matchesDateRange(row.updatedAt);
    return matchesSearch && matchesParty && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.updatedAt,
    amount: (row) => parseMoney(row.grossUnitPrice),
  });
});

const visibleInventoryRows = computed(() => {
  const filtered = inventorySummaryRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.product,
      row.materialCode,
      row.model,
      row.spec,
      row.currentAvailable,
      row.inTransit,
      row.expectedAvailable,
      row.status,
    ]);
    const matchesStatus = matchesStatusFilter(row.status);
    const matchesParty = matchesKeywordFilter(
      [row.product, row.materialCode, row.model, row.spec],
      filterParty.value,
    );
    const matchesDate = matchesDateRange(row.updatedAt);
    return matchesSearch && matchesStatus && matchesParty && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.updatedAt,
    amount: (row) => parseStockQty(row.currentAvailable),
    status: (row) => row.status,
  });
});

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  const shouldOpen = openToolbarMenu.value !== menu;
  openToolbarMenu.value = shouldOpen ? menu : null;

  if (menu === 'filter' && shouldOpen) {
    syncDraftFilters();
  }

}

function closeToolbarMenu() {
  openToolbarMenu.value = null;
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode;
  closeToolbarMenu();
}

function handleExportRows() {
  exportVisibleRows();
}

function closeFloatingMenus() {
  closeToolbarMenu();
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRows() {
  if (activePage.value === 'quotes') {
    return [
      ['单号', '客户', '销售物料', '金额', '商务条款', '报价人', '状态', '下一步', '报价日期', '有效期', '有效期提示'],
      ...visibleQuoteRows.value.map((row) => [
        row.code,
        `${row.customer} ${contactText(row)}`,
        row.products.map((product) => `${productIdentity(product, '-')} ${productQtyWithUnit(product)}`).join('；'),
        row.amount,
        quoteTermsSummary(row),
        row.owner,
        statusLabelForPage(row.status, 'quotes'),
        salesQuoteNextStep(row),
        row.date,
        row.validUntil,
        quoteValidityRisk(row)?.label || '',
      ]),
    ];
  }

  if (activePage.value === 'orders') {
    return [
      ['单号', '客户', '销售物料', '优先级', '金额', '未收提示', '负责人', '单据状态', '生产进度', '交付进度', '开票进度', '收款进度', '异常/暂停', '交期', '计划发货'],
      ...visibleOrderRows.value.map((row) => {
        const fulfillment = orderFulfillmentSnapshot(row);
        return [
          row.code,
          `${row.customer} ${contactText(row)}`,
          row.products.map((product) => `${productIdentity(product, '-')} ${productQtyWithUnit(product)}`).join('；'),
          row.priority,
          row.amount,
          orderUnpaidSummary(row),
          row.owner,
          orderDocumentStatus(row),
          fulfillment.production,
          fulfillment.delivery,
          fulfillment.invoice,
          fulfillment.payment,
          fulfillment.attention,
          orderDeliveryDate(row),
          row.plannedShipDate || '',
        ];
      }),
    ];
  }

  if (activePage.value === 'outboundRequests') {
    return [
      ['追踪单号', '来源订单', '客户', '销售物料/数量', '负责人', '状态', '下一步', '可发判断', '判断说明', '交付日期', '计划发货'],
      ...visibleOutboundRequestRows.value.map((row) => {
        const deliverySignal = outboundDeliverySignal(row);
        return [
          row.code,
          row.sourceOrder,
          `${row.customer} ${contactText(row)}`,
          row.products.map((product) => `${productIdentity(product, '-')} ${productQtyWithUnit(product, 'requestQty')}`).join('；'),
          row.applicant,
          outboundStatusLabel(row.status),
          salesOutboundNextStep(row.status),
          deliverySignal.status,
          deliverySignal.detail,
          row.deliveryDate || '',
          row.expectedDate,
        ];
      }),
    ];
  }

  if (activePage.value === 'afterSales') {
    return [
      ['售后单号', '来源销售订单', '客户', '受影响商品', '问题类型', '受影响数量', '处理进度', '影响金额', '负责人', '状态', '下一步', '登记日期'],
      ...visibleAfterSaleRows.value.map((row) => [
        row.code,
        row.sourceOrder,
        row.customer,
        afterSaleProductSummary(row),
        row.issueType,
        afterSaleAffectedQuantity(row),
        afterSaleExecutionSummary(row),
        row.amountImpact,
        row.owner,
        row.status,
        row.nextStep,
        row.date,
      ]),
    ];
  }

  if (activePage.value === 'prices') {
    return [
      ['销售物料', '物料编码', '物料型号', '物料规格', '客户', '含税单价', '未税单价', '税率', '基础单位', '订单数量', '销售订单', '订单日期'],
      ...visiblePriceRows.value.map((row) => [
        row.product,
        row.materialCode,
        row.model,
        row.spec,
        row.customer,
        row.grossUnitPrice,
        row.netUnitPrice,
        row.taxRate,
        row.uom,
        row.quantity,
        row.sourceDoc,
        row.updatedAt,
      ]),
    ];
  }

  return [
    ['销售物料', '物料编码', '物料型号', '物料规格', '当前可用', '在途补充', '预计可用', '库存状态', '更新时间'],
    ...visibleInventoryRows.value.map((row) => [
      row.product,
      row.materialCode,
      row.model,
      row.spec,
      row.currentAvailable,
      row.inTransit,
      row.expectedAvailable,
      row.status,
      row.updatedAt,
    ]),
  ];
}

function exportVisibleRows() {
  const rows = exportRows();

  if (rows.length <= 1) {
    showToast('当前没有可导出的数据');
    closeToolbarMenu();
    return;
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  closeToolbarMenu();
  showToast('已导出当前筛选结果');
}

function handleDocumentClick() {
  closeFloatingMenus();
}

function resetTableScroll() {
  void nextTick(() => {
    document.querySelectorAll<HTMLElement>('.quote-data-scroll').forEach((element) => {
      element.scrollLeft = 0;
    });
  });
}

function routeSearchSeed() {
  const source = route.query.source;
  const keyword = route.query.keyword;
  if (typeof source === 'string') return source;
  if (typeof keyword === 'string') return keyword;
  return '';
}

watch(
  () => route.fullPath,
  () => {
    searchKeyword.value = routeSearchSeed();
    sortMode.value = defaultSortModeForPage(activePage.value);
    syncDraftFilters();
    closeFloatingMenus();
    resetTableScroll();
    void loadCurrentSalesList();
  },
);

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  searchKeyword.value = routeSearchSeed();
  void loadCurrentSalesList();
  resetTableScroll();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section class="list-page">
      <PageTopbarPortal v-if="createButtonLabel && createPath">
        <template #actions>
          <RouterLink v-if="canWriteSales" class="primary-action" :to="createPath" :title="`新建${pageTitle}`">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </RouterLink>
          <button v-else class="primary-action" type="button" disabled :title="salesReadonlyReason">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </button>
        </template>
      </PageTopbarPortal>

      <div v-if="activePage === 'quotes'" class="quote-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <OperationPermissionBanner
          v-if="showSalesOperationPermissionHint"
          :message="salesOperationPermissionHint"
          :suffix="salesOperationPermissionSuffix"
        />

        <div class="quote-table-shell quote-list-shell with-status-column">
          <div class="quote-data-scroll">
            <div class="data-table quote-table quote-list-table">
              <div class="table-row table-head">
                <span>单号</span>
                <span>客户</span>
                <span>销售物料</span>
                <span>金额</span>
                <span>报价/有效期</span>
              </div>
              <RouterLink
                v-for="row in visibleQuoteRows"
                :key="row.code"
                class="table-row order-list-row quote-list-row is-clickable"
                :class="{ 'is-row-highlighted': hoveredQuoteCode === row.code }"
                :to="`/sales/quotes/${encodeURIComponent(row.code)}`"
                :aria-label="`查看报价单 ${row.code}`"
                :title="`查看报价单 ${row.code}`"
                @pointerenter="hoveredQuoteCode = row.code"
                @pointerleave="hoveredQuoteCode = ''"
                @mouseenter="hoveredQuoteCode = row.code"
                @mouseleave="hoveredQuoteCode = ''"
                @focus="hoveredQuoteCode = row.code"
                @blur="hoveredQuoteCode = ''"
              >
                <span class="quote-identity-cell">
                  <strong class="quote-code">{{ row.code }}</strong>
                  <small>报价人 {{ row.owner || '—' }}</small>
                </span>
                <span class="party-cell">
                  <strong>{{ row.customer }}</strong>
                  <small>{{ contactText(row) }}</small>
                </span>
                <span class="product-summary">
                  <strong>{{ row.products[0]?.name || '-' }}</strong>
                  <small>
                    <template v-if="row.products[0]?.materialCode">{{ row.products[0].materialCode }} · </template>{{ productQtyWithUnit(row.products[0]) }}
                    <template v-if="row.products.length > 1"> · 共&nbsp;{{ row.products.length }}&nbsp;项</template>
                  </small>
                </span>
                <span class="amount-cell amount-stack">
                  <strong>{{ row.amount }}</strong>
                  <small>{{ quoteTermsSummary(row) }}</small>
                </span>
                <span class="date-stack">
                  <strong>{{ normalizedDate(row.date) }}</strong>
                  <small>{{ quoteValidUntilText(row) }}</small>
                  <small v-if="quoteValidityRisk(row)" class="timing-risk" :class="`tone-${quoteValidityRisk(row)?.tone}`">
                    {{ quoteValidityRisk(row)?.label }}
                  </small>
                </span>
              </RouterLink>
            </div>
          </div>

          <div class="quote-status-column">
            <div class="quote-status-head">报价状态</div>
            <RouterLink
              v-for="row in visibleQuoteRows"
              :key="`${row.code}-status`"
              class="quote-status-cell order-status-link"
              :class="{ 'is-row-highlighted': hoveredQuoteCode === row.code }"
              :to="`/sales/quotes/${encodeURIComponent(row.code)}`"
              :aria-label="`查看报价单 ${row.code} 状态`"
              :title="`查看报价单 ${row.code} 状态：${statusLabel(row.status)}，下一步：${salesQuoteNextStep(row)}`"
              @pointerenter="hoveredQuoteCode = row.code"
              @pointerleave="hoveredQuoteCode = ''"
              @mouseenter="hoveredQuoteCode = row.code"
              @mouseleave="hoveredQuoteCode = ''"
              @focus="hoveredQuoteCode = row.code"
              @blur="hoveredQuoteCode = ''"
            >
              <i class="mini-status" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</i>
              <small>下一步：{{ salesQuoteNextStep(row) }}</small>
            </RouterLink>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentSalesList" />
        <div v-else-if="visibleQuoteRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配报价单' : '暂无报价单' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '新建报价单后会显示在这里。' }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div class="quote-card-list">
          <RouterLink
            v-for="row in visibleQuoteRows"
            :key="`${row.code}-card`"
            class="quote-card"
            :to="`/sales/quotes/${encodeURIComponent(row.code)}`"
            :title="`查看报价单 ${row.code}`"
          >
            <div class="quote-card-head">
              <div>
                <strong>{{ row.customer }}</strong>
                <span>{{ row.code }}</span>
              </div>
              <i class="mini-status" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</i>
            </div>
            <div class="quote-card-main quote-card-products">
              <div>
                <span v-for="product in row.products" :key="product.name">
                  {{ product.name || '-' }} <small>{{ productQtyWithUnit(product) }}</small>
                </span>
              </div>
              <strong>{{ row.amount }}</strong>
            </div>
            <div class="quote-card-meta">
              <span>报价人 {{ row.owner || '—' }}</span>
              <span>联系人 {{ contactText(row) }}</span>
              <span>日期 {{ row.date }}</span>
              <span>{{ quoteValidUntilText(row) }}</span>
              <span>下一步：{{ salesQuoteNextStep(row) }}</span>
              <span v-if="quoteValidityRisk(row)">{{ quoteValidityRisk(row)?.label }}</span>
            </div>
          </RouterLink>
        </div>

        <div class="table-footer">
          <span>共 {{ visibleQuoteRows.length }} 条</span>
        </div>
      </div>

      <div v-if="activePage === 'orders'" class="quote-page order-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <OperationPermissionBanner
          v-if="showSalesOperationPermissionHint"
          :message="salesOperationPermissionHint"
          :suffix="salesOperationPermissionSuffix"
        />

        <div class="quote-table-shell order-list-shell with-status-column">
          <div class="quote-data-scroll">
            <div class="data-table quote-table order-table">
              <div class="table-row table-head">
                <span>销售订单</span>
                <span>客户/销售负责人</span>
                <span>销售物料</span>
                <span>金额</span>
                <span>交期</span>
              </div>
              <RouterLink
                v-for="row in visibleOrderRows"
                :key="row.code"
                class="table-row order-list-row is-clickable"
                :class="{ 'is-row-highlighted': hoveredOrderCode === row.code }"
                :to="`/sales/orders/${encodeURIComponent(row.code)}`"
                :aria-label="`查看销售订单 ${row.code}`"
                :title="`查看销售订单 ${row.code}`"
                @pointerenter="hoveredOrderCode = row.code"
                @pointerleave="hoveredOrderCode = ''"
                @mouseenter="hoveredOrderCode = row.code"
                @mouseleave="hoveredOrderCode = ''"
                @focus="hoveredOrderCode = row.code"
                @blur="hoveredOrderCode = ''"
              >
                <span class="product-summary">
                  <strong class="quote-code">{{ row.code }}</strong>
                  <small>{{ row.priority }}</small>
                </span>
                <span class="party-cell">
                  <strong>{{ row.customer }}</strong>
                  <small>销售负责人 · {{ row.owner }}</small>
                </span>
                <span class="product-summary">
                  <strong>{{ row.products[0]?.name || '-' }}</strong>
                  <small>
                    <template v-if="row.products[0]?.materialCode">{{ row.products[0].materialCode }} · </template>{{ productQtyWithUnit(row.products[0]) }}
                    <template v-if="row.products.length > 1"> · 共 {{ row.products.length }} 项</template>
                  </small>
                </span>
                <span class="amount-cell amount-stack">
                  <strong>{{ row.amount }}</strong>
                  <small>{{ orderUnpaidSummary(row) }}</small>
                </span>
                <span class="date-stack">
                  <strong>{{ orderDeliveryDate(row) }}</strong>
                  <small>{{ orderShipPlanText(row) }}</small>
                </span>
              </RouterLink>
            </div>
          </div>

          <div class="quote-status-column order-fulfillment-column">
            <div class="quote-status-head order-fulfillment-head">
              <strong>订单跟进</strong>
              <small>生产 · 交付 · 开票 · 收款</small>
            </div>
            <RouterLink
              v-for="row in visibleOrderRows"
              :key="`${row.code}-status`"
              class="quote-status-cell order-status-link order-fulfillment-cell"
              :class="{ 'is-row-highlighted': hoveredOrderCode === row.code }"
              :to="`/sales/orders/${encodeURIComponent(row.code)}/delivery`"
              :aria-label="`查看销售订单 ${row.code} 订单跟进`"
              :title="`查看销售订单 ${row.code} 订单跟进：${orderDocumentStatus(row)}；生产${orderFulfillmentSnapshot(row).production}，交付${orderFulfillmentSnapshot(row).delivery}，开票${orderFulfillmentSnapshot(row).invoice}，收款${orderFulfillmentSnapshot(row).payment}；${orderFulfillmentSnapshot(row).attention}`"
              @pointerenter="hoveredOrderCode = row.code"
              @pointerleave="hoveredOrderCode = ''"
              @mouseenter="hoveredOrderCode = row.code"
              @mouseleave="hoveredOrderCode = ''"
              @focus="hoveredOrderCode = row.code"
              @blur="hoveredOrderCode = ''"
            >
              <span class="order-document-state">
                <i class="mini-status" :class="statusClass(orderDocumentStatus(row))">{{ orderDocumentStatus(row) }}</i>
                <small
                  v-if="orderFulfillmentSnapshot(row).attention !== '正常' && orderFulfillmentSnapshot(row).attention !== '无需提示'"
                  class="order-attention"
                  :class="`tone-${orderFulfillmentSnapshot(row).attentionTone}`"
                >
                  {{ orderFulfillmentSnapshot(row).attention }}
                </small>
              </span>
              <span class="order-progress-scan">
                <span>
                  <b>生产</b>
                  <i :class="fulfillmentStatusClass(orderFulfillmentSnapshot(row).production)">{{ orderFulfillmentSnapshot(row).production }}</i>
                </span>
                <span>
                  <b>交付</b>
                  <i :class="fulfillmentStatusClass(orderFulfillmentSnapshot(row).delivery)">{{ orderFulfillmentSnapshot(row).delivery }}</i>
                </span>
                <span>
                  <b>开票</b>
                  <i :class="fulfillmentStatusClass(orderFulfillmentSnapshot(row).invoice)">{{ orderFulfillmentSnapshot(row).invoice }}</i>
                </span>
                <span>
                  <b>收款</b>
                  <i :class="fulfillmentStatusClass(orderFulfillmentSnapshot(row).payment)">{{ orderFulfillmentSnapshot(row).payment }}</i>
                </span>
              </span>
            </RouterLink>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentSalesList" />
        <div v-else-if="visibleOrderRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配销售订单' : '暂无销售订单' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '新建销售订单后会显示在这里。' }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div class="quote-card-list">
          <article
            v-for="row in visibleOrderRows"
            :key="`${row.code}-card`"
            class="quote-card"
          >
            <RouterLink
              class="order-card-content-link"
              :to="`/sales/orders/${encodeURIComponent(row.code)}`"
              :title="`查看销售订单 ${row.code} 订单内容`"
              :aria-label="`查看销售订单 ${row.code} 订单内容`"
            >
              <div class="quote-card-head">
                <div>
                  <strong>{{ row.customer }}</strong>
                  <span>{{ row.code }}</span>
                </div>
                <i class="mini-status" :class="statusClass(orderDocumentStatus(row))">{{ orderDocumentStatus(row) }}</i>
              </div>
              <div class="quote-card-main quote-card-products">
                <div>
                  <span v-for="product in row.products" :key="product.name">
                    {{ product.name || '-' }} <small>{{ productQtyWithUnit(product) }}</small>
                  </span>
                </div>
                <strong>{{ row.amount }}</strong>
              </div>
              <div class="quote-card-meta">
                <span>联系人 {{ contactText(row) }}</span>
                <span>{{ orderUnpaidSummary(row) }}</span>
                <span>交期 {{ orderDeliveryDate(row) }}</span>
                <span>{{ orderShipPlanText(row) }}</span>
                <span>负责人 {{ row.owner }}</span>
              </div>
            </RouterLink>

            <RouterLink
              class="order-card-follow-up-link"
              :to="`/sales/orders/${encodeURIComponent(row.code)}/delivery`"
              :title="`查看销售订单 ${row.code} 订单跟进`"
              :aria-label="`查看销售订单 ${row.code} 订单跟进`"
            >
              <div class="order-card-follow-up-head">
                <strong>订单跟进</strong>
                <span>查看</span>
              </div>
              <div class="order-card-progress">
                <span><b>生产</b>{{ orderFulfillmentSnapshot(row).production }}</span>
                <span><b>交付</b>{{ orderFulfillmentSnapshot(row).delivery }}</span>
                <span><b>开票</b>{{ orderFulfillmentSnapshot(row).invoice }}</span>
                <span><b>收款</b>{{ orderFulfillmentSnapshot(row).payment }}</span>
              </div>
              <div
                v-if="orderFulfillmentSnapshot(row).attention !== '正常' && orderFulfillmentSnapshot(row).attention !== '无需提示'"
                class="order-card-attention"
                :class="`tone-${orderFulfillmentSnapshot(row).attentionTone}`"
              >
                提醒 · {{ orderFulfillmentSnapshot(row).attention }}
              </div>
            </RouterLink>
          </article>
        </div>

        <div class="table-footer">
          <span>共 {{ visibleOrderRows.length }} 条</span>
        </div>
      </div>

      <div v-if="activePage === 'outboundRequests'" class="quote-page outbound-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <div v-if="outboundSignalLoadError" class="outbound-list-signal-alert" role="alert" aria-live="assertive">
          <span>交付判断暂时不完整：{{ outboundSignalLoadError }}</span>
          <button class="secondary-action compact-action" type="button" :disabled="isListLoading" title="重新加载交付记录和库存判断" @click="loadCurrentSalesList">
            {{ isListLoading ? '重新加载中' : '重新加载' }}
          </button>
        </div>

        <OperationPermissionBanner
          v-if="showSalesOperationPermissionHint"
          :message="salesOperationPermissionHint"
          :suffix="salesOperationPermissionSuffix"
        />

        <div class="quote-table-shell outbound-list-shell with-status-column">
          <div class="quote-data-scroll">
            <div class="data-table quote-table outbound-table outbound-list-table">
              <div class="table-row table-head">
                <span>追踪单/来源订单</span>
                <span>客户/负责人</span>
                <span>销售物料/数量</span>
                <span>可发判断</span>
                <span>交付计划</span>
              </div>
              <RouterLink
                v-for="row in visibleOutboundRequestRows"
                :key="row.code"
                class="table-row order-list-row outbound-list-row is-clickable"
                :class="{ 'is-row-highlighted': hoveredOutboundCode === row.code }"
                :to="`/sales/outbound-requests/${encodeURIComponent(row.code)}`"
                :aria-label="`查看交付追踪 ${row.code}`"
                :title="`查看交付追踪 ${row.code}`"
                @pointerenter="hoveredOutboundCode = row.code"
                @pointerleave="hoveredOutboundCode = ''"
                @mouseenter="hoveredOutboundCode = row.code"
                @mouseleave="hoveredOutboundCode = ''"
                @focus="hoveredOutboundCode = row.code"
                @blur="hoveredOutboundCode = ''"
              >
                <span class="party-cell">
                  <strong class="quote-code">{{ row.code }}</strong>
                  <small>来源 {{ row.sourceOrder }}</small>
                </span>
                <span class="party-cell">
                  <strong>{{ row.customer }}</strong>
                  <small>{{ contactText(row) }} · {{ row.applicant }}</small>
                </span>
                <span class="product-summary">
                  <strong>{{ row.products[0]?.name || '-' }}</strong>
                  <small>
                    <template v-if="row.products[0]?.materialCode">{{ row.products[0].materialCode }} · </template>{{ productQtyWithUnit(row.products[0], 'requestQty') }}
                    <template v-if="row.products.length > 1"> · 共 {{ row.products.length }} 项</template>
                  </small>
                </span>
                <span class="delivery-signal-cell">
                  <i class="mini-status" :class="inventoryStatusClass(outboundDeliverySignal(row).status)">
                    {{ outboundDeliverySignal(row).status }}
                  </i>
                  <small>{{ outboundDeliverySignal(row).detail }}</small>
                </span>
                <span class="date-stack">
                  <strong>{{ row.expectedDate || '待安排' }}</strong>
                  <small>{{ row.deliveryDate ? `承诺交付 ${row.deliveryDate}` : row.deliveryMethod || '交付方式待定' }}</small>
                  <small v-if="salesOutboundTimingRisk(row)" class="timing-risk tone-danger">{{ salesOutboundTimingRisk(row) }}</small>
                </span>
              </RouterLink>
            </div>
          </div>

          <div class="quote-status-column outbound-progress-column">
            <div class="quote-status-head outbound-progress-head">
              <strong>单据状态</strong>
              <small>出库 · 签收 · 待办</small>
            </div>
            <RouterLink
              v-for="row in visibleOutboundRequestRows"
              :key="`${row.code}-status`"
              class="quote-status-cell order-status-link outbound-progress-cell"
              :class="{ 'is-row-highlighted': hoveredOutboundCode === row.code }"
              :to="`/sales/outbound-requests/${encodeURIComponent(row.code)}`"
              :aria-label="`查看交付追踪 ${row.code} 状态`"
              :title="`查看交付追踪 ${row.code}：单据 ${statusLabel(row.status)}，出库 ${salesOutboundIssueStage(row)}，签收 ${salesOutboundReceiptStage(row)}，待办 ${salesOutboundCurrentAction(row)}`"
              @pointerenter="hoveredOutboundCode = row.code"
              @pointerleave="hoveredOutboundCode = ''"
              @mouseenter="hoveredOutboundCode = row.code"
              @mouseleave="hoveredOutboundCode = ''"
              @focus="hoveredOutboundCode = row.code"
              @blur="hoveredOutboundCode = ''"
            >
              <span class="outbound-document-state">
                <i class="mini-status" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</i>
              </span>
              <span class="outbound-progress-scan">
                <span>
                  <b>出库</b>
                  <i :class="fulfillmentStatusClass(salesOutboundIssueStage(row))">{{ salesOutboundIssueStage(row) }}</i>
                </span>
                <span>
                  <b>签收</b>
                  <i :class="fulfillmentStatusClass(salesOutboundReceiptStage(row))">{{ salesOutboundReceiptStage(row) }}</i>
                </span>
                <span>
                  <b>待办</b>
                  <i :class="fulfillmentStatusClass(salesOutboundCurrentAction(row))">{{ salesOutboundCurrentAction(row) }}</i>
                </span>
              </span>
            </RouterLink>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentSalesList" />
        <div v-else-if="visibleOutboundRequestRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配交付追踪' : '暂无交付追踪' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '销售订单确认后会自动生成交付追踪。' }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div class="quote-card-list">
          <RouterLink
            v-for="row in visibleOutboundRequestRows"
            :key="`${row.code}-card`"
            class="quote-card"
            :to="`/sales/outbound-requests/${encodeURIComponent(row.code)}`"
            :title="`查看交付追踪 ${row.code}`"
          >
            <div class="quote-card-head">
              <div>
                <strong>{{ row.customer }}</strong>
                <span>{{ row.code }} · {{ row.sourceOrder }}</span>
              </div>
              <i class="mini-status" :class="statusClass(row.status)">{{ statusLabel(row.status) }}</i>
            </div>
            <div class="quote-card-main quote-card-products">
              <div>
                <span v-for="product in row.products" :key="product.name">
                  {{ product.name || '-' }} <small>{{ productQtyWithUnit(product, 'requestQty') }}</small>
                </span>
              </div>
              <strong>{{ row.deliveryDate || '-' }}</strong>
            </div>
            <div class="quote-card-meta">
              <span>联系人 {{ contactText(row) }}</span>
              <span>负责人 {{ row.applicant }}</span>
              <span>下一步：{{ salesOutboundNextStep(row.status) }}</span>
              <span>{{ outboundDeliverySignal(row).status }} · {{ outboundDeliverySignal(row).detail }}</span>
              <span>计划发货 {{ row.expectedDate || '-' }}</span>
              <span v-if="salesOutboundTimingRisk(row)">{{ salesOutboundTimingRisk(row) }}</span>
              <span>{{ row.deliveryMethod }}</span>
            </div>
          </RouterLink>
        </div>

        <div class="table-footer">
          <span>显示 {{ visibleOutboundRequestRows.length ? 1 : 0 }}-{{ visibleOutboundRequestRows.length }} / 共 {{ visibleOutboundRequestRows.length }} 条</span>
          <div class="pager">
            <button type="button" disabled title="已经是第一页">上一页</button>
            <strong>1</strong>
            <button type="button" disabled title="已经是最后一页">下一页</button>
          </div>
        </div>
      </div>

      <div v-if="activePage === 'afterSales'" class="quote-page reference-page sales-after-sales-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <div class="quote-table-shell after-sales-list-shell with-status-column">
          <div class="quote-data-scroll">
            <div class="data-table quote-table after-sales-table">
              <div class="table-row table-head">
                <span>售后单/来源订单</span>
                <span>客户/受影响商品</span>
                <span>问题/受影响数量</span>
                <span>处理进度</span>
                <span>登记日期</span>
              </div>
              <RouterLink
                v-for="row in visibleAfterSaleRows"
                :key="row.code"
                class="table-row after-sales-list-row order-list-row is-clickable"
                :class="{ 'is-row-highlighted': hoveredAfterSalesCode === row.code }"
                :to="`/sales/after-sales/${encodeURIComponent(row.code)}`"
                :aria-label="`打开销售售后 ${row.code}`"
                :title="`打开销售售后 ${row.code}`"
                @pointerenter="hoveredAfterSalesCode = row.code"
                @pointerleave="hoveredAfterSalesCode = ''"
                @mouseenter="hoveredAfterSalesCode = row.code"
                @mouseleave="hoveredAfterSalesCode = ''"
                @focus="hoveredAfterSalesCode = row.code"
                @blur="hoveredAfterSalesCode = ''"
              >
                <span class="product-summary">
                  <strong class="quote-code">{{ row.code }}</strong>
                  <small>来源 {{ row.sourceOrder }}</small>
                </span>
                <span class="party-cell">
                  <strong>{{ row.customer }}</strong>
                  <small>{{ afterSaleProductSummary(row) }}</small>
                </span>
                <span class="product-summary">
                  <strong>{{ row.issueType }}</strong>
                  <small>影响 {{ afterSaleAffectedQuantity(row) }}</small>
                </span>
                <span class="product-summary">
                  <strong>{{ afterSaleExecutionSummary(row) }}</strong>
                  <small>{{ row.amountImpact }} · {{ row.owner }}</small>
                </span>
                <span>{{ row.date }}</span>
              </RouterLink>
            </div>
          </div>

          <div class="quote-status-column">
            <div class="quote-status-head">处理状态</div>
            <RouterLink
              v-for="row in visibleAfterSaleRows"
              :key="`${row.code}-status`"
              class="quote-status-cell order-status-link"
              :class="{ 'is-row-highlighted': hoveredAfterSalesCode === row.code }"
              :to="`/sales/after-sales/${encodeURIComponent(row.code)}`"
              :aria-label="`打开销售售后 ${row.code} 状态`"
              :title="`打开销售售后 ${row.code} 状态：${row.status}，下一步：${row.nextStep}`"
              @pointerenter="hoveredAfterSalesCode = row.code"
              @pointerleave="hoveredAfterSalesCode = ''"
              @mouseenter="hoveredAfterSalesCode = row.code"
              @mouseleave="hoveredAfterSalesCode = ''"
              @focus="hoveredAfterSalesCode = row.code"
              @blur="hoveredAfterSalesCode = ''"
            >
              <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
              <small>下一步：{{ row.nextStep }}</small>
            </RouterLink>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentSalesList" />
        <div v-else-if="visibleAfterSaleRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配销售售后' : '暂无销售售后' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '客户签收后的退换补、返工、折让和反馈后续会集中在这里处理。' }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div class="quote-card-list">
          <RouterLink
            v-for="row in visibleAfterSaleRows"
            :key="`${row.code}-card`"
            class="quote-card is-clickable"
            :to="`/sales/after-sales/${encodeURIComponent(row.code)}`"
            :title="`打开销售售后 ${row.code}`"
          >
            <div class="quote-card-head">
              <div>
                <strong>{{ row.customer }}</strong>
                <span>{{ row.code }} · {{ row.sourceOrder }}</span>
              </div>
              <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
            </div>
            <div class="quote-card-main">
              <span>{{ row.issueType }} · 影响 {{ afterSaleAffectedQuantity(row) }}</span>
              <strong>{{ afterSaleExecutionSummary(row) }}</strong>
            </div>
            <div class="quote-card-meta">
              <span>{{ afterSaleProductSummary(row) }}</span>
              <span>负责人 {{ row.owner }}</span>
              <span>下一步：{{ row.nextStep }}</span>
              <span>登记 {{ row.date }}</span>
            </div>
          </RouterLink>
        </div>

        <div class="table-footer">
          <span>共 {{ visibleAfterSaleRows.length }} 条</span>
        </div>
      </div>

      <div v-if="activePage === 'prices'" class="quote-page reference-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <div class="table-scroll reference-table-scroll">
          <div class="data-table reference-table price-history-table">
            <div class="table-row table-head">
              <span>销售物料</span>
              <span>客户</span>
              <span>含税单价</span>
              <span>订单数量</span>
              <span>来源订单/日期</span>
            </div>
            <div v-for="row in visiblePriceRows" :key="row.key" class="table-row">
              <span class="product-summary">
                <strong>{{ row.product }}</strong>
                <small v-if="row.model || row.spec" class="product-model-spec">{{ [row.model, row.spec].filter(Boolean).join(' · ') }}</small>
                <small v-if="row.materialCode" class="product-material-code">{{ row.materialCode }}</small>
              </span>
              <span class="party-cell price-customer-cell">
                <strong>{{ row.customer }}</strong>
              </span>
              <span class="amount-cell price-basis-cell">
                <strong>{{ row.grossUnitPrice }}<small v-if="row.uom"> / {{ row.uom }}</small></strong>
                <small>未税 {{ row.netUnitPrice }} · 税率 {{ row.taxRate }}</small>
              </span>
              <span class="reference-quantity-cell">{{ row.quantity }}</span>
              <span class="product-summary">
                <RouterLink class="quote-code reference-doc-link" :to="`/sales/orders/${encodeURIComponent(row.sourceDoc)}`">
                  {{ row.sourceDoc }}
                </RouterLink>
                <small>{{ row.updatedAt }}</small>
              </span>
            </div>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentSalesList" />
        <div v-else-if="visiblePriceRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配销售价格记录' : '暂无销售价格记录' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '销售订单确认后会沉淀订单行价格，供后续报价和订单定价参考。' }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div class="quote-card-list">
          <article v-for="row in visiblePriceRows" :key="`${row.key}-card`" class="quote-card">
            <div class="quote-card-head">
              <div>
                <strong>{{ row.product }}</strong>
                <span v-if="row.model || row.spec">{{ [row.model, row.spec].filter(Boolean).join(' · ') }}</span>
                <span v-if="row.materialCode">{{ row.materialCode }}</span>
                <span>{{ row.customer }}</span>
              </div>
              <strong class="reference-card-value">{{ row.grossUnitPrice }}<small v-if="row.uom"> / {{ row.uom }}</small></strong>
            </div>
            <div class="quote-card-meta">
              <RouterLink class="reference-doc-link" :to="`/sales/orders/${encodeURIComponent(row.sourceDoc)}`">
                销售订单 {{ row.sourceDoc }}
              </RouterLink>
              <span>未税 {{ row.netUnitPrice }} · 税率 {{ row.taxRate }}</span>
              <span>订单数量 {{ row.quantity }} · {{ row.updatedAt }}</span>
            </div>
          </article>
        </div>

        <div class="table-footer">
          <span>共 {{ visiblePriceRows.length }} 条</span>
        </div>
      </div>

      <div v-if="activePage === 'inventory'" class="quote-page reference-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="searchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :show-status-sort="showStatusSort"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <div class="table-scroll reference-table-scroll">
          <div class="data-table reference-table inventory-check-table">
            <div class="table-row table-head">
              <span>销售物料</span>
              <span>当前可用</span>
              <span>在途补充</span>
              <span>库存状态</span>
            </div>
            <div v-for="row in visibleInventoryRows" :key="row.key" class="table-row">
              <span class="product-summary">
                <strong>{{ row.product }}</strong>
                <small v-if="row.model || row.spec" class="product-model-spec">{{ [row.model, row.spec].filter(Boolean).join(' · ') }}</small>
                <small>{{ row.materialCode || '—' }}</small>
              </span>
              <span class="amount-cell inventory-available-value">{{ row.currentAvailable }}</span>
              <span class="inventory-paired-value" :class="{ 'is-empty': !row.hasInTransit }">
                <strong>{{ row.hasInTransit ? `在途 ${row.inTransit}` : '暂无在途' }}</strong>
                <small v-if="row.hasInTransit">预计可用 {{ row.expectedAvailable }}</small>
              </span>
              <span class="inventory-availability-cell">
                <i class="mini-status" :class="inventoryStatusClass(row.status)">{{ row.status }}</i>
                <small>更新 {{ row.updatedAt || '—' }}</small>
              </span>
            </div>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentSalesList" />
        <div v-else-if="visibleInventoryRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配库存记录' : '暂无库存记录' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '仓库同步库存数据后会显示在这里。' }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div class="quote-card-list">
          <article v-for="row in visibleInventoryRows" :key="`${row.key}-card`" class="quote-card">
            <div class="quote-card-head">
              <div>
                <strong>{{ row.product }}</strong>
                <span v-if="row.model || row.spec">{{ [row.model, row.spec].filter(Boolean).join(' · ') }}</span>
                <span>{{ row.materialCode || '—' }}</span>
              </div>
              <i class="mini-status" :class="inventoryStatusClass(row.status)">{{ row.status }}</i>
            </div>
            <div class="quote-card-main">
              <span>当前可用</span>
              <strong>{{ row.currentAvailable }}</strong>
            </div>
            <div class="quote-card-meta inventory-card-meta">
              <span v-if="row.hasInTransit">在途补充 {{ row.inTransit }} · 预计可用 {{ row.expectedAvailable }}</span>
              <span v-else>暂无在途补充</span>
              <span>更新 {{ row.updatedAt || '—' }}</span>
            </div>
          </article>
        </div>

        <div class="table-footer">
          <span>共 {{ visibleInventoryRows.length }} 条</span>
        </div>
      </div>
    </section>

    <div
      v-if="toastMessage"
      class="app-toast"
      :class="{ error: toastTone === 'error' }"
      :role="toastTone === 'error' ? 'alert' : 'status'"
      :aria-live="toastTone === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>

<style scoped>
.order-page .order-list-shell {
  grid-template-columns: minmax(0, 1fr) 360px;
}

.order-page .order-table {
  min-width: 0;
}

.order-page .order-table .table-row {
  grid-template-columns:
    minmax(108px, 0.82fr)
    minmax(96px, 0.86fr)
    minmax(130px, 1.16fr)
    minmax(82px, 0.7fr)
    minmax(98px, 0.82fr);
}

.order-page .order-table .quote-code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quote-list-shell .quote-list-table,
.outbound-list-shell .outbound-list-table,
.after-sales-list-shell .after-sales-table {
  min-width: 0;
}

.outbound-list-shell.with-status-column {
  grid-template-columns: minmax(0, 1fr) 330px;
}

.outbound-list-shell .quote-status-column {
  grid-auto-rows: 76px;
}

.outbound-list-shell .outbound-list-table .table-row:not(.table-head) {
  height: 76px;
  min-height: 76px;
}

.outbound-progress-head,
.outbound-progress-cell {
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding-inline: 9px;
}

.outbound-progress-head {
  display: grid;
}

.outbound-progress-head strong {
  text-align: left;
}

.outbound-progress-head small {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outbound-document-state {
  display: grid;
  min-width: 0;
  align-content: center;
  justify-items: start;
  text-align: left;
}

.outbound-document-state .mini-status {
  justify-self: start;
}

.outbound-progress-scan {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 0;
}

.outbound-progress-scan > span {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 4px;
  padding: 2px 6px;
  border-left: 1px solid #ecece5;
  justify-items: center;
  text-align: center;
}

.outbound-progress-scan b,
.outbound-progress-scan i {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outbound-progress-scan b {
  color: #77786f;
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.outbound-progress-scan i {
  display: -webkit-box;
  color: #30322d;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.18;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.after-sales-list-shell .after-sales-table .table-row {
  grid-template-columns:
    minmax(126px, 0.9fr)
    minmax(140px, 1fr)
    minmax(134px, 0.92fr)
    minmax(150px, 1.05fr)
    minmax(78px, 0.54fr);
}

.order-page .order-fulfillment-column {
  grid-auto-rows: 86px;
}

.order-page .order-table .table-row:not(.table-head) {
  height: 86px;
  min-height: 86px;
}

.order-page .order-table .order-list-row > .product-summary:nth-child(3) small {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.25;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.order-fulfillment-head {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  align-content: center;
  gap: 8px;
  padding: 0 10px;
}

.order-fulfillment-head strong {
  color: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

.order-fulfillment-head small {
  min-width: 0;
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.order-fulfillment-cell {
  grid-template-columns: minmax(80px, 0.8fr) minmax(0, 3.2fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}

.order-document-state {
  display: grid;
  min-width: 0;
  gap: 5px;
  justify-items: start;
  text-align: left;
}

.order-attention {
  display: -webkit-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: #8a6841;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.order-attention.tone-danger,
.order-attention.tone-paused {
  color: #96554e;
}

.order-progress-scan {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-width: 0;
}

.order-progress-scan > span {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 0 3px;
  border-left: 1px solid #ecece5;
  justify-items: center;
  text-align: center;
}

.order-progress-scan b,
.order-progress-scan i {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-progress-scan b {
  color: #77786f;
  font-size: 10px;
  font-weight: 650;
}

.order-progress-scan i {
  color: #30322d;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.order-progress-scan i.status-pending,
.order-progress-scan i.status-void {
  color: #7a4f2a;
}

.order-card-content-link,
.order-card-follow-up-link {
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.order-card-content-link {
  display: grid;
  gap: 12px;
}

.order-card-follow-up-link {
  display: grid;
  gap: 8px;
  padding-top: 11px;
  border-top: 1px solid #e6e8e2;
}

.order-card-follow-up-link:hover .order-card-follow-up-head span,
.order-card-follow-up-link:focus-visible .order-card-follow-up-head span {
  color: #315b3c;
}

.order-card-follow-up-link:focus-visible,
.order-card-content-link:focus-visible {
  border-radius: 6px;
  outline: 2px solid rgba(84, 107, 71, 0.5);
  outline-offset: 3px;
}

.order-card-follow-up-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.order-card-follow-up-head strong {
  color: #30352f;
  font-size: 12px;
  font-weight: 720;
}

.order-card-follow-up-head span {
  color: #777e77;
  font-size: 11px;
  font-weight: 650;
}

.order-card-progress {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid #ecece5;
  border-bottom: 1px solid #ecece5;
}

.order-card-progress span {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 6px;
  padding: 7px 4px;
  color: #33352f;
  font-size: 11px;
}

.order-card-progress b {
  color: #77786f;
  font-weight: 600;
}

.order-card-attention {
  color: #7a5a24;
  font-size: 11px;
  font-weight: 680;
}

.order-card-attention.tone-danger,
.order-card-attention.tone-paused {
  color: #8b3f36;
}

.outbound-list-signal-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid #ead8b5;
  border-radius: 10px;
  color: #76551d;
  background: #fffaf0;
  font-size: 12px;
}

.outbound-list-signal-alert > span {
  min-width: 0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.outbound-list-signal-alert button {
  flex: 0 0 auto;
}

@media (max-width: 1260px) and (min-width: 761px) {
  .order-page .order-list-shell {
    display: none;
  }

  .order-page .quote-card-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 12px;
  }

  .order-page .quote-card-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 4px 12px;
  }

  .order-page .quote-card-meta > span {
    min-width: 0;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .order-page :deep(.sales-filter-popover) {
    width: min(390px, calc(100vw - 28px));
  }

  .order-page .order-list-shell {
    grid-template-columns: minmax(0, 1fr) 330px;
  }

  .order-fulfillment-cell {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 4px;
    padding-inline: 7px;
  }

  .order-fulfillment-head {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 4px;
    padding-inline: 7px;
  }

  .order-progress-scan > span {
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 3px;
    padding: 4px 6px;
  }

  .order-progress-scan {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
  }

  .order-progress-scan > span:nth-child(odd) {
    border-left: 0;
  }

  .order-progress-scan > span:nth-child(n + 3) {
    border-top: 1px solid #ecece5;
  }

  .order-progress-scan b,
  .order-progress-scan i {
    line-height: 1.25;
  }
}

@media (max-width: 760px) {
  .outbound-list-signal-alert {
    align-items: stretch;
    flex-direction: column;
  }

  .outbound-list-signal-alert button {
    width: 100%;
  }
}
</style>
