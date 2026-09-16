<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Plus } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import {
  listPurchaseSuggestions,
  listPurchaseOrders,
  listPurchaseAfterSales,
  listPurchaseRequisitions,
} from '../services/api';
import type {
  PurchaseAfterSale,
  PurchaseOrder,
  PurchaseOrderProduct,
  PurchaseRequisition,
  PurchaseRequisitionProduct,
  PurchaseSuggestionItem,
} from '../types/business';
import { type PurchaseTabKey } from '../data/purchase';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import {
  purchaseRequisitionSourceSearchValues,
  purchaseRequisitionSourceSummary,
} from '../utils/purchaseRequisitionSource';
import { statusPresentationClass } from '../utils/statusPresentation';

const route = useRoute();
const hoveredRequisitionCode = ref('');
const hoveredPurchaseOrderCode = ref('');
const hoveredAfterSalesCode = ref('');
const { canWrite: canWritePurchase, readonlyReason: purchaseReadonlyReason } = useModulePermission('purchase');
const { canOperate: canApprovePurchase, readonlyReason: purchaseApproveReadonlyReason } = useOperationPermission('purchaseApprove', '处理采购单据状态');
const purchaseOperationPermissionHint = computed(() => (
  canWritePurchase.value && !canApprovePurchase.value ? purchaseApproveReadonlyReason.value : ''
));
const showPurchaseOperationPermissionHint = computed(() =>
  ['requisitions', 'orders'].includes(activePage.value) && Boolean(purchaseOperationPermissionHint.value),
);
const purchaseOperationPermissionSuffix = '提交、确认、作废和异常处理会保持不可用。';

const pageTitles: Record<PurchaseTabKey, string> = {
  suggestions: '采购建议',
  requisitions: '采购需求',
  orders: '采购订单',
  afterSales: '采购售后',
  prices: '采购价格记录',
};

const createButtonLabels: Partial<Record<PurchaseTabKey, string>> = {
  requisitions: '新建',
  orders: '新建',
  afterSales: '新建',
};

const searchPlaceholders: Record<PurchaseTabKey, string> = {
  suggestions: '搜索物料、需求单、部门、可选供应商',
  requisitions: '搜索需求单、需求来源、部门、提出人、物料',
  orders: '搜索采购订单、供应商、物料',
  afterSales: '搜索售后、采购订单、供应商、问题类型、处理方案',
  prices: '搜索物料、供应商、采购订单',
};

const routePageMap: Record<string, PurchaseTabKey> = {
  suggestions: 'suggestions',
  requisitions: 'requisitions',
  orders: 'orders',
  'after-sales': 'afterSales',
  prices: 'prices',
};

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
const statusFilterSeparator = '|';
type BusinessFilters = {
  status: string;
  party: string;
  owner: string;
  dateStart: string;
  dateEnd: string;
};

type FilterFieldKey = 'status' | 'party' | 'owner';
type FilterOption = string | { value: string; label: string };
type PurchaseFilterField = {
  key: FilterFieldKey;
  label: string;
  options: FilterOption[];
  control?: 'select' | 'search';
};

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

const activePage = computed<PurchaseTabKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'requisitions';
});

const pageTitle = computed(() => pageTitles[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value]);
const searchPlaceholder = computed(() => searchPlaceholders[activePage.value]);
const createButtonPath = computed(() => {
  if (activePage.value === 'requisitions') return '/purchase/requisitions/new';
  if (activePage.value === 'orders') return '/purchase/orders/new';
  if (activePage.value === 'afterSales') return '/purchase/after-sales/new';
  return '';
});

const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>(defaultSortModeForPage(activePage.value));
const selectedSuggestionKey = ref('');
const suggestionDetailRef = ref<HTMLElement | null>(null);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const apiPurchaseRequisitionRows = ref<PurchaseRequisition[] | null>(null);
const apiPurchaseSuggestionRows = ref<PurchaseSuggestionItem[] | null>(null);
const apiPurchaseOrderRows = ref<PurchaseOrder[] | null>(null);
const apiPurchaseAfterSaleRows = ref<PurchaseAfterSale[] | null>(null);
const isListLoading = ref(false);
const listLoadError = ref('');
let toastTimer: number | undefined;
let listLoadRequestId = 0;

type PurchasePriceRow = {
  key: string;
  product: string;
  materialCode: string;
  model: string;
  spec: string;
  supplier: string;
  grossUnitPrice: string;
  netUnitPrice: string;
  taxRate: string;
  quantity: string;
  uom: string;
  sourceDoc: string;
  orderDate: string;
};
type PurchaseOrderPriceSource = {
  code: string;
  supplier: string;
  products: Array<{
    lineId?: string;
    materialCode?: string;
    name: string;
    model?: string;
    spec?: string;
    qty: string;
    unitPrice: string;
    priceInputMode?: '含税' | '不含税';
    netUnitPrice?: string;
    grossUnitPrice?: string;
    taxRate?: string;
    uom?: string;
  }>;
  status: string;
  date: string;
  taxMode?: string;
  taxRate?: string;
};
type PurchaseAfterSaleRow = PurchaseAfterSale & {
  contact: string;
  owner: string;
};

const filtersByPage = ref<Record<PurchaseTabKey, BusinessFilters>>({
  suggestions: emptyBusinessFilters(),
  requisitions: emptyBusinessFilters(),
  orders: emptyBusinessFilters(),
  afterSales: emptyBusinessFilters(),
  prices: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());

function defaultSortModeForPage(page: PurchaseTabKey): SortMode {
  return page === 'prices' ? 'newest' : 'status';
}

const currentFilters = computed(() => filtersByPage.value[activePage.value]);
const showStatusSort = computed(() => activePage.value !== 'prices');
const statusSortLabel = computed(() => activePage.value === 'suggestions' ? '供应关系优先' : '状态优先');
const newestSortLabel = computed(() => activePage.value === 'suggestions' ? '最早需求日从晚到早' : '');
const oldestSortLabel = computed(() => activePage.value === 'suggestions' ? '最早需求日从早到晚' : '');
const sortAmountLabel = computed(() => {
  if (activePage.value === 'suggestions') {
    return '待采购数量从高到低';
  }

  if (activePage.value === 'requisitions') {
    return '需求数量从高到低';
  }

  if (activePage.value === 'prices') {
    return '含税采购单价从高到低';
  }

  return '金额从高到低';
});

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
    PurchaseTabKey,
    {
      status?: string;
      party?: string;
      owner?: string;
      date?: string;
    }
  > = {
    suggestions: {
      status: '供应关系',
      party: '可选供应商',
      date: '最早需求日',
    },
    requisitions: {
      status: '状态',
      party: '需求部门',
      owner: '提出人',
      date: '提出日期',
    },
    orders: {
      status: '状态',
      party: '供应商',
      owner: '采购员',
      date: '下单日期',
    },
    afterSales: {
      status: '状态',
      party: '供应商',
      owner: '采购员',
      date: '登记日期',
    },
    prices: {
      party: '供应商',
      date: '下单日期',
    },
  };

  return options[activePage.value];
});

const filterDateLabel = computed(() => filterLabels.value.date ?? '');

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

function formatPriceValue(value?: string) {
  const raw = String(value ?? '').trim();
  const matched = raw.match(/-?\d+(?:\.\d+)?/);
  return matched ? formatMoney(Number(matched[0])) : raw || '-';
}

function parseQty(value: string) {
  return Number(value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function totalQty(products: Array<{ qty: string; requestQty?: string }>) {
  return products.reduce((sum, product) => sum + parseQty(product.requestQty ?? product.qty), 0);
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

function statusFilterValues(value = filterStatus.value) {
  return value.split(statusFilterSeparator).filter(Boolean);
}

function matchesStatusFilter(status: string) {
  const values = statusFilterValues();
  if (!values.length) return true;
  if (activePage.value === 'orders') {
    return values.includes(purchaseOrderStatusLabel(status));
  }
  return values.includes(status);
}

function matchesFilterValue(value: string | undefined, filter: string) {
  return !filter || value === filter;
}

function matchesKeywordFilter(values: Array<string | undefined>, filter: string) {
  const keyword = filter.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return true;
  return values.some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(keyword));
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
    未维护供应关系: 1,
    有可选供应商: 2,
    草稿: 1,
    已提交: 2,
    待受理: 2,
    待确认: 2,
    待采购受理: 3,
    已确认: 4,
    待入库: 4,
    待验收: 4,
    待质检: 5,
    部分入库: 7,
    已入库: 8,
    待开票: 9,
    待付款: 10,
    处理中: 10,
    已转采购: 11,
    退货处理中: 90,
    质检不合格: 91,
    已退回: 92,
    已驳回: 93,
    已中断: 94,
    已取消: 95,
    已完成: 98,
    已关闭: 98,
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
    activePage.value === 'afterSales'
      ? (afterSalesStatusRank[status] ?? 90)
      : (statusRank[status] ?? 97)
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
      return statusDiff || (activePage.value === 'suggestions'
        ? getters.date(a).localeCompare(getters.date(b))
        : getters.date(b).localeCompare(getters.date(a)));
    }

    return getters.date(b).localeCompare(getters.date(a));
  });
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function afterSaleStatusClass(status: string) {
  return statusClass(status);
}

function purchaseOrderStatusLabel(status: string) {
  if (status === '草稿') return '草稿';
  if (['已作废', '已退回', '已驳回', '已中断', '已取消'].includes(status)) return '已作废';
  if (['已完成', '已关闭'].includes(status)) return '已关闭';
  return '已确认';
}

function purchaseProgressStatusClass(status: string) {
  return statusPresentationClass(status);
}

function purchaseOrderProgressSnapshot(row: PurchaseOrder) {
  if (row.progressFacts) return row.progressFacts;

  const stopped = ['已作废', '已退回', '已驳回', '已中断', '已取消'].includes(row.status);
  return {
    arrival: row.status === '草稿' ? '未开始' : row.status === '已确认' ? '待到货' : '未记录',
    quality: row.status === '草稿' ? '未开始' : row.status === '待质检' ? '待质检' : '未记录',
    inbound: row.status === '草稿' ? '未开始' : row.status === '待入库' ? '待入库' : row.status === '部分入库' ? '部分入库' : '未记录',
    invoice: ['待开票', '已入库'].includes(row.status) ? '待收票' : '未记录',
    payment: row.status === '待付款' ? '待付款' : row.status === '已完成' ? '已付款' : '未记录',
    attention: stopped ? '已停止' : row.status === '质检不合格' ? '质量异常' : '正常',
    attentionTone: stopped ? 'paused' as const : row.status === '质检不合格' ? 'danger' as const : 'normal' as const,
    nextStep: purchaseOrderNextStep(row),
  };
}

function requisitionNextStep(
  status: string,
  conversionFacts?: PurchaseRequisition['conversionFacts'],
) {
  const purchaseLabel = '采购订单';
  if (status === '草稿') return '提交采购受理';
  if (['已作废', '已中断', '已取消'].includes(status)) return '无后续动作';
  if (status === '已驳回') return '修改后重新提交';
  if (conversionFacts?.nextStep) return conversionFacts.nextStep;
  if (['已提交', '待采购受理'].includes(status)) return `生成${purchaseLabel}`;
  if (['已转采购', '已转物料采购', '已转采购订单'].includes(status)) return `跟进${purchaseLabel}`;
  return '查看日志';
}

function requisitionListTask(row: PurchaseRequisition) {
  const conversionStatus = row.conversionFacts?.status;
  if (row.status === '草稿') return '提交';
  if (['已作废', '已中断', '已取消'].includes(row.status)) return '无需处理';
  if (row.status === '已驳回') return '修改重提';
  if (conversionStatus === '部分转单') return '继续转采购';
  if (conversionStatus === '已转单') return '跟进采购';
  if (['已提交', '待采购受理'].includes(row.status)) return '转采购';
  return '查看日志';
}

function requisitionDocumentStatus(row: PurchaseRequisition) {
  if (row.documentStatus) return row.documentStatus;
  if (row.status === '草稿') return '草稿';
  if (['已作废', '已取消', '已驳回', '已中断'].includes(row.status)) return '已作废';
  return row.conversionFacts?.status === '已转单' ? '已关闭' : '已提交';
}

function purchaseOrderNextStep(row: PurchaseOrder) {
  if (row.progressFacts?.nextStep) return row.progressFacts.nextStep;
  const status = row.status;
  if (status === '草稿') return '确认采购订单';
  if (['已确认', '待入库'].includes(status)) return '等待到货';
  if (status === '待质检') return '跟进来料质检';
  if (status === '部分入库') return '跟进剩余到货';
  if (status === '已入库') return '等待开票';
  if (status === '待开票') return '跟进供应商开票';
  if (status === '待付款') return '跟进付款';
  if (status === '退货处理中') return '处理退换货';
  if (status === '质检不合格') return '处理质检异常';
  if (status === '已完成') return '归档复盘';
  if (['已作废', '已驳回', '已中断', '已取消'].includes(status)) return '无后续动作';
  return '查看日志';
}

function purchasePayableSummary(row: PurchaseOrder) {
  const commercial = row.progressFacts?.commercial;
  if (commercial) {
    const payableBasis = Number(commercial.payableAmount || 0) > 0
      ? Number(commercial.payableAmount || 0)
      : Number(commercial.orderAmount || 0);
    const unpaid = Math.max(payableBasis - Number(commercial.settledAmount || 0), 0);
    if (payableBasis <= 0) return '金额待确认';
    return unpaid > 0 ? `待付 ${formatMoney(unpaid)}` : '已付款';
  }
  if (row.status === '草稿') return '待确认金额';
  if (['已作废', '已驳回', '已中断', '已取消'].includes(row.status)) return '暂停付款';
  if (row.status === '待验收') return '待验收后付款';
  if (['已确认', '待质检', '待入库', '部分入库'].includes(row.status)) return '待入库后付款';
  if (row.status === '已入库') return '待开票';
  if (row.status === '待开票') return '待开票';
  if (row.status === '待付款') return '待付款';
  if (row.status === '已完成') return '付款完成';
  return '待付款跟踪';
}

function contactText(row: { contact?: string; contactPhone?: string }) {
  return [row.contact, row.contactPhone].filter(Boolean).join(' · ') || '-';
}

function purchaseTypeLabel(value?: string) {
  return value || '物料采购';
}

function purchaseSourceLabel(row: PurchaseOrder) {
  const sources = Array.from(new Set([
    ...(row.sourceRequisitions ?? []),
    row.sourceRequisition,
  ].filter(Boolean)));
  if (!sources.length) return '直接采购';
  return sources.length > 1 ? `需求承接 · ${sources.length} 张` : '需求承接';
}

function purchaseOrderPath(row: PurchaseOrder) {
  return `/purchase/orders/${encodeURIComponent(row.code)}`;
}

function purchaseOrderFollowUpPath(row: PurchaseOrder) {
  return `${purchaseOrderPath(row)}/follow-up`;
}

function purchaseContentTitle(row: PurchaseRequisition | PurchaseOrder) {
  return row.products[0]?.name || row.products[0]?.materialCode || '-';
}

function purchaseContentMeta(row: PurchaseRequisition | PurchaseOrder) {
  const first = row.products[0];
  const quantity = productQtyWithUnit(first).replace(/\s+([^\s]+)$/, '\u00a0$1');
  return [
    first?.materialCode,
    first?.model,
    quantity,
    row.products.length > 1 ? `共 ${row.products.length} 项` : '',
  ].filter(Boolean).join(' · ') || '-';
}

function purchaseCardProductMeta(product: PurchaseOrderProduct | PurchaseRequisitionProduct) {
  return [
    product.materialCode,
    product.model,
    productQtyWithUnit(product),
  ].filter(Boolean).join(' · ') || '-';
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

const requisitionListRows = computed(() =>
  apiPurchaseRequisitionRows.value ?? [],
);

const suggestionListRows = computed(() => apiPurchaseSuggestionRows.value ?? []);

function suggestionStatusLabel(row: PurchaseSuggestionItem) {
  return row.supplierStatusLabel;
}

function suggestionStatusClass(row: PurchaseSuggestionItem) {
  return statusClass(row.supplierStatus === 'available' ? '已确认' : '异常');
}

function suggestionSourceTypeLabel(sourceType?: string) {
  return sourceType === '手工申请' ? '手工提出' : sourceType || '未标明来源';
}

function suggestionSupplierCountLabel(row: PurchaseSuggestionItem) {
  return row.supplierCount ? `${row.supplierCount} 家可选` : '未维护供应关系';
}

function suggestionSupplierExport(row: PurchaseSuggestionItem) {
  return row.suppliers.map((supplier) => [
    supplier.supplierName,
    supplier.supplierCode,
    supplier.supplierMaterialCode ? `供方料号 ${supplier.supplierMaterialCode}` : '',
    `起订 ${suggestionQty(supplier.minOrderQty, row.unit)}`,
    `参考下单 ${suggestionQty(supplier.referenceOrderQty, row.unit)}`,
    `超需求 ${suggestionQty(supplier.referenceSupplementQty, row.unit)}`,
    `供货周期 ${supplier.leadTimeDays} 天`,
  ].filter(Boolean).join(' · ')).join('；');
}

function suggestionMaterialTone(code: string) {
  const palette = ['#e7ebe8', '#ece7df', '#e5e9ed', '#ebe5e8', '#e5ebe6'];
  const seed = [...String(code || '')].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

function suggestionQty(value: number, unit: string) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unit}`;
}

function shanghaiBusinessDateText() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function purchaseSuggestionDueLabel(date: string) {
  if (!date) return '';
  const due = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${shanghaiBusinessDateText()}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return '';
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return '今日需求';
  if (days <= 3) return `${days} 天内需求`;
  return '';
}

const orderListRows = computed(() =>
  apiPurchaseOrderRows.value ?? [],
);

const materialOrderListRows = computed(() => orderListRows.value);

function purchasePriceRowsFromOrders(rows: PurchaseOrderPriceSource[]): PurchasePriceRow[] {
  return rows.flatMap((order) => {
    if (!['已确认', '已关闭'].includes(purchaseOrderStatusLabel(order.status))) {
      return [];
    }

    return order.products
      .filter((product) => product.name && (product.grossUnitPrice || product.unitPrice))
      .map((product, index) => {
        const netUnitPrice = product.netUnitPrice
          || (product.priceInputMode === '不含税' ? product.unitPrice : '');

        return {
          key: `${order.code}-${product.lineId || product.materialCode || index}`,
          product: product.name || '—',
          materialCode: product.materialCode || '',
          model: product.model || '',
          spec: product.spec || '',
          supplier: order.supplier,
          grossUnitPrice: formatPriceValue(product.grossUnitPrice || product.unitPrice),
          netUnitPrice: netUnitPrice ? formatPriceValue(netUnitPrice) : '—',
          taxRate: product.taxRate || order.taxRate || '—',
          quantity: productQtyWithUnit(product),
          uom: product.uom || '',
          sourceDoc: order.code,
          orderDate: order.date,
        };
      });
  });
}

const purchasePriceListRows = computed<PurchasePriceRow[]>(() => {
  return apiPurchaseOrderRows.value ? purchasePriceRowsFromOrders(materialOrderListRows.value) : [];
});

const purchaseAfterSaleRows = computed<PurchaseAfterSaleRow[]>(() =>
  (apiPurchaseAfterSaleRows.value ?? []).map((row) => ({
    ...row,
    contact: contactText(row),
    owner: row.owner || '待分配',
  })),
);

function afterSaleProductSummary(row: PurchaseAfterSaleRow) {
  if (!row.products.length) return '—';
  const first = row.products[0];
  return row.products.length > 1 ? `${first.name} 等 ${row.products.length} 项` : first.name;
}

function afterSaleAffectedQuantity(row: PurchaseAfterSaleRow) {
  if (!row.products.length) return '—';
  const grouped = new Map<string, number>();
  row.products.forEach((product) => {
    const unit = product.uom || '';
    grouped.set(unit, (grouped.get(unit) || 0) + parseQty(product.qty));
  });
  return [...grouped.entries()]
    .map(([unit, quantity]) => `${quantity.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`)
    .join('、');
}

function afterSaleExecutionSummary(row: PurchaseAfterSaleRow) {
  const tasks = row.executionTasks || [];
  if (!row.action) return '方案待定';
  if (!tasks.length) return row.status === '待受理' ? '待受理' : row.action;
  const completed = tasks.filter((task) => task.status === '已完成').length;
  return `${row.action} · ${completed}/${tasks.length} 项完成`;
}

const filterStatusOptions = computed(() => {
  if (activePage.value === 'suggestions') {
    return uniqueValues(suggestionListRows.value.map((row) => suggestionStatusLabel(row)));
  }

  if (activePage.value === 'requisitions') {
    return uniqueValues(requisitionListRows.value.map((row) => requisitionDocumentStatus(row)));
  }

  if (activePage.value === 'orders') {
    return uniqueValues(materialOrderListRows.value.map((row) => purchaseOrderStatusLabel(row.status)));
  }

  if (activePage.value === 'afterSales') {
    return uniqueValues(purchaseAfterSaleRows.value.map((row) => row.status));
  }

  return [];
});

const filterPartyOptions = computed(() => {
  if (activePage.value === 'suggestions') {
    return uniqueValues(suggestionListRows.value.flatMap((row) => row.suppliers.map((supplier) => supplier.supplierName)));
  }

  if (activePage.value === 'requisitions') {
    return uniqueValues(requisitionListRows.value.map((row) => row.department));
  }

  if (activePage.value === 'orders') {
    return uniqueValues(materialOrderListRows.value.map((row) => row.supplier));
  }

  if (activePage.value === 'afterSales') {
    return uniqueValues(purchaseAfterSaleRows.value.map((row) => row.supplier));
  }

  if (activePage.value === 'prices') {
    return uniqueValues(purchasePriceListRows.value.map((row) => row.supplier));
  }

  return [];
});

const filterFields = computed<PurchaseFilterField[]>(() => {
  const labels = filterLabels.value;
  const fields: PurchaseFilterField[] = [];

  if (labels.status && filterStatusOptions.value.length) {
    fields.push({ key: 'status', label: labels.status, options: filterStatusOptions.value });
  }

  if (labels.party) {
    if (['suggestions', 'requisitions'].includes(activePage.value)) {
      if (filterPartyOptions.value.length) {
        fields.push({ key: 'party', label: labels.party, options: filterPartyOptions.value });
      }
    } else {
      fields.push({ key: 'party', label: labels.party, options: [], control: 'search' });
    }
  }

  if (labels.owner) {
    fields.push({ key: 'owner', label: labels.owner, options: [], control: 'search' });
  }

  return fields;
});

const visibleRequisitionRows = computed(() => {
  const filtered = requisitionListRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.department,
      row.requester,
      row.purchaseType,
      row.reason,
      row.status,
      row.documentStatus,
      row.sourceMaterialRequest,
      ...purchaseRequisitionSourceSearchValues(row),
      row.conversionFacts?.status,
      row.conversionFacts?.nextStep,
      ...row.attachments.flatMap((attachment) => [attachment.name, attachment.uploader]),
      ...row.products.flatMap((product) => [productIdentity(product, ''), product.qty]),
    ]);
    const matchesStatus = matchesStatusFilter(requisitionDocumentStatus(row));
    const matchesParty = matchesFilterValue(row.department, filterParty.value);
    const matchesOwner = matchesKeywordFilter([row.requester], filterOwner.value);
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.date,
    amount: (row) => totalQty(row.products),
    status: (row) => requisitionDocumentStatus(row),
  });
});

const visibleSuggestionRows = computed(() => {
  const filtered = suggestionListRows.value.filter((row) => {
    const status = suggestionStatusLabel(row);
    const matchesSearch = includesKeyword([
      row.company,
      row.companyCode,
      row.materialCode,
      row.materialName,
      row.model,
      row.spec,
      status,
      ...row.suppliers.flatMap((supplier) => [supplier.supplierCode, supplier.supplierName, supplier.supplierMaterialCode]),
      ...row.sources.flatMap((source) => [source.requisitionCode, source.department, source.requester, source.sourceType]),
    ]);
    const matchesStatus = matchesStatusFilter(status);
    const matchesSupplier = matchesKeywordFilter(
      row.suppliers.flatMap((supplier) => [supplier.supplierName, supplier.supplierCode]),
      filterParty.value,
    );
    return matchesSearch && matchesStatus && matchesSupplier && matchesDateRange(row.earliestExpectedDate);
  });
  return sortRows(filtered, {
    date: (row) => row.earliestExpectedDate,
    amount: (row) => row.openQty,
    status: (row) => suggestionStatusLabel(row),
  });
});

const showSuggestionCompanyInMaster = computed(() => new Set(
  visibleSuggestionRows.value.map((row) => row.companyCode || row.company || 'UNASSIGNED-COMPANY'),
).size > 1);

const selectedSuggestionRow = computed(() => (
  visibleSuggestionRows.value.find((row) => row.key === selectedSuggestionKey.value)
  || visibleSuggestionRows.value[0]
  || null
));

watch(
  () => visibleSuggestionRows.value.map((row) => row.key),
  (visibleKeys) => {
    if (activePage.value !== 'suggestions') return;
    if (!visibleKeys.includes(selectedSuggestionKey.value)) {
      selectedSuggestionKey.value = visibleKeys[0] || '';
    }
  },
  { immediate: true },
);

watch(selectedSuggestionKey, () => {
  void nextTick(() => {
    if (suggestionDetailRef.value) suggestionDetailRef.value.scrollTop = 0;
  });
});

function selectSuggestionRow(row: PurchaseSuggestionItem) {
  selectedSuggestionKey.value = row.key;
}

const visibleOrderRows = computed(() => {
  const filtered = materialOrderListRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.supplier,
      row.contact,
      row.sourceRequisition,
      row.owner,
      row.purchaseType,
      row.status,
      row.progressFacts?.arrival,
      row.progressFacts?.quality,
      row.progressFacts?.inbound,
      row.progressFacts?.invoice,
      row.progressFacts?.payment,
      row.progressFacts?.attention,
      ...row.attachments.flatMap((attachment) => [attachment.name, attachment.uploader]),
      ...row.products.flatMap((product) => [productIdentity(product, ''), product.qty, product.unitPrice, product.amount]),
    ]);
    const matchesStatus = matchesStatusFilter(purchaseOrderStatusLabel(row.status));
    const matchesParty = matchesKeywordFilter([row.supplier], filterParty.value);
    const matchesOwner = matchesKeywordFilter([row.owner], filterOwner.value);
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.date,
    amount: (row) => parseMoney(row.amount),
    status: (row) => row.status,
  });
});

const visiblePurchaseRows = visibleOrderRows;

const visibleAfterSaleRows = computed(() => {
  const filtered = purchaseAfterSaleRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.sourceOrder,
      row.supplier,
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
    const matchesStatus = matchesStatusFilter(row.status);
    const matchesParty = matchesKeywordFilter([row.supplier], filterParty.value);
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
  const filtered = purchasePriceListRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.product,
      row.materialCode,
      row.model,
      row.spec,
      row.supplier,
      row.sourceDoc,
      row.quantity,
      row.grossUnitPrice,
      row.netUnitPrice,
      row.uom,
      row.taxRate,
    ]);
    const matchesParty = matchesKeywordFilter([row.supplier], filterParty.value);
    const matchesDate = matchesDateRange(row.orderDate);
    return matchesSearch && matchesParty && matchesDate;
  });

  return sortRows(filtered, {
    date: (row) => row.orderDate,
    amount: (row) => parseMoney(row.grossUnitPrice),
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

function resetBusinessFilters() {
  const emptyFilters = emptyBusinessFilters();
  updateCurrentFilters(emptyFilters);
  draftFilters.value = cloneBusinessFilters(emptyFilters);
  showToast('已清空筛选条件');
}

function applyAndCloseFilters() {
  updateCurrentFilters(draftFilters.value);
  openToolbarMenu.value = null;
  showToast('已应用当前筛选条件');
}

function clearListConstraints() {
  searchKeyword.value = '';
  resetBusinessFilters();
  openToolbarMenu.value = null;
}

function closeFloatingMenus() {
  closeToolbarMenu();
}

async function loadCurrentPurchaseList() {
  const page = activePage.value;
  const requestId = ++listLoadRequestId;
  isListLoading.value = true;
  listLoadError.value = '';

  if (page === 'suggestions') apiPurchaseSuggestionRows.value = null;
  else if (page === 'requisitions') apiPurchaseRequisitionRows.value = null;
  else if (page === 'afterSales') apiPurchaseAfterSaleRows.value = null;
  else apiPurchaseOrderRows.value = null;

  try {
    if (page === 'suggestions') {
      const rows = await listPurchaseSuggestions();
      if (requestId !== listLoadRequestId) return;
      apiPurchaseSuggestionRows.value = rows;
    } else if (page === 'requisitions') {
      const rows = await listPurchaseRequisitions();
      if (requestId !== listLoadRequestId) return;
      apiPurchaseRequisitionRows.value = rows;
    } else if (page === 'afterSales') {
      const rows = await listPurchaseAfterSales();
      if (requestId !== listLoadRequestId) return;
      apiPurchaseAfterSaleRows.value = rows;
    } else {
      const rows = await listPurchaseOrders();
      if (requestId !== listLoadRequestId) return;
      apiPurchaseOrderRows.value = rows;
    }
  } catch (error) {
    if (requestId !== listLoadRequestId) return;
    if (page === 'suggestions') apiPurchaseSuggestionRows.value = [];
    else if (page === 'requisitions') apiPurchaseRequisitionRows.value = [];
    else if (page === 'afterSales') apiPurchaseAfterSaleRows.value = [];
    else apiPurchaseOrderRows.value = [];
    listLoadError.value = error instanceof Error ? error.message : `${pageTitle.value}加载失败`;
  } finally {
    if (requestId === listLoadRequestId) isListLoading.value = false;
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRows() {
  if (activePage.value === 'suggestions') {
    return [
      ['公司', '物料编码', '物料名称', '需求数量', '已下单', '待采购', '单位', '需求来源数', '最早需求日', '供应关系', '可选供应商数', '供应商参考'],
      ...visibleSuggestionRows.value.map((row) => [
        row.company,
        row.materialCode,
        row.materialName,
        row.demandQty,
        row.orderedQty,
        row.openQty,
        row.unit,
        row.sourceCount,
        row.earliestExpectedDate,
        suggestionStatusLabel(row),
        row.supplierCount,
        suggestionSupplierExport(row),
      ]),
    ];
  }

  if (activePage.value === 'requisitions') {
    return [
      ['需求单号', '采购类型', '需求来源', '需求部门', '采购内容', '提出人', '单据状态', '转采购进度', '当前待办', '提出日期', '需求日期', '附件数'],
      ...visibleRequisitionRows.value.map((row) => [
        row.code,
        purchaseTypeLabel(row.purchaseType),
        purchaseRequisitionSourceSummary(row),
        row.department,
        row.products.map((product) => `${productIdentity(product, '-')} ${productQtyWithUnit(product)}`).join('；'),
        row.requester,
        requisitionDocumentStatus(row),
        row.conversionFacts?.status || '未转单',
        requisitionNextStep(row.status, row.conversionFacts),
        row.date,
        row.expectedDate,
        row.attachments.length,
      ]),
    ];
  }

  if (activePage.value === 'orders') {
    return [
      [
        '采购订单',
        '采购类型',
        '供应商',
        '采购内容',
        '金额',
        '付款提示',
        '采购员',
        '单据状态',
        '到货进度',
        '质检进度',
        '入库进度',
        '收票进度',
        '付款进度',
        '关注项',
        '下一步',
        '预计到货',
        '附件数',
      ],
      ...visiblePurchaseRows.value.map((row) => [
        row.code,
        purchaseTypeLabel(row.purchaseType),
        `${row.supplier} ${contactText(row)}`,
        row.products.map((product) => `${productIdentity(product, '-')} ${productQtyWithUnit(product)}`).join('；'),
        row.amount,
        purchasePayableSummary(row),
        row.owner,
        purchaseOrderStatusLabel(row.status),
        row.progressFacts?.arrival || '未记录',
        row.progressFacts?.quality || '未记录',
        row.progressFacts?.inbound || '未记录',
        row.progressFacts?.invoice || '未记录',
        row.progressFacts?.payment || '未记录',
        row.progressFacts?.attention || '正常',
        purchaseOrderNextStep(row),
        row.expectedDate,
        row.attachments.length,
      ]),
    ];
  }

  if (activePage.value === 'afterSales') {
    return [
      ['售后单号', '来源采购订单', '供应商', '受影响物料', '问题类型', '受影响数量', '处理进度', '影响金额', '采购员', '状态', '下一步', '登记日期'],
      ...visibleAfterSaleRows.value.map((row) => [
        row.code,
        row.sourceOrder,
        row.supplier,
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

  return [
    ['采购物料', '物料编码', '物料型号', '物料规格', '供应商', '含税采购单价', '未税采购单价', '税率', '基础单位', '订单数量', '来源采购单', '下单日期'],
    ...visiblePriceRows.value.map((row) => [
      row.product,
      row.materialCode,
      row.model,
      row.spec,
      row.supplier,
      row.grossUnitPrice,
      row.netUnitPrice,
      row.taxRate,
      row.uom,
      row.quantity,
      row.sourceDoc,
      row.orderDate,
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
    void loadCurrentPurchaseList();
  },
);

onMounted(() => {
  searchKeyword.value = routeSearchSeed();
  void loadCurrentPurchaseList();
  document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section class="list-page">
      <PageTopbarPortal v-if="createButtonLabel && createButtonPath">
        <template #actions>
          <RouterLink v-if="canWritePurchase" class="primary-action" :to="createButtonPath" :title="`新建${pageTitle}`">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </RouterLink>
          <button v-else class="primary-action" type="button" disabled :title="purchaseReadonlyReason">
            <Plus :size="16" />
            {{ createButtonLabel }}
          </button>
        </template>
      </PageTopbarPortal>

      <div v-if="activePage !== 'prices'" class="quote-page purchase-page" :class="`purchase-${activePage}-page`">
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
          :newest-sort-label="newestSortLabel"
          :oldest-sort-label="oldestSortLabel"
          :show-status-sort="showStatusSort"
          :status-sort-label="statusSortLabel"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <OperationPermissionBanner
          v-if="showPurchaseOperationPermissionHint"
          :message="purchaseOperationPermissionHint"
          :suffix="purchaseOperationPermissionSuffix"
        />

        <template v-if="activePage === 'suggestions'">
          <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentPurchaseList" />
          <div v-else-if="visibleSuggestionRows.length === 0" class="list-empty-state">
            <strong>{{ hasListConstraints ? '未找到匹配采购建议' : '暂无待采购需求' }}</strong>
            <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '已提交且尚未被采购订单承接的采购需求会按物料自动汇总到这里。' }}</span>
            <button
              v-if="hasListConstraints"
              class="secondary-action empty-state-action"
              type="button"
              title="清空搜索和筛选条件"
              @click="clearListConstraints"
            >
              清空条件
            </button>
          </div>
          <div v-else class="purchase-suggestion-workspace">
            <aside class="purchase-suggestion-master" aria-label="待采购物料">
              <header>
                <strong>待采购物料</strong>
                <span>{{ visibleSuggestionRows.length }} 种</span>
              </header>
              <div class="purchase-suggestion-master-list">
                <button
                  v-for="row in visibleSuggestionRows"
                  :key="row.key"
                  class="purchase-suggestion-master-item"
                  :class="{ 'is-selected': selectedSuggestionRow?.key === row.key }"
                  type="button"
                  :aria-pressed="selectedSuggestionRow?.key === row.key"
                  :title="`查看 ${row.materialName} 的采购建议`"
                  @click="selectSuggestionRow(row)"
                >
                  <MaterialIdentity
                    :name="row.materialName"
                    :code="row.materialCode"
                    :model="row.model"
                    :spec="row.spec"
                    text-only
                  >
                    <template v-if="showSuggestionCompanyInMaster" #supplement>
                      <span class="purchase-suggestion-master-company">{{ row.company || row.companyCode || '未指定公司' }}</span>
                    </template>
                  </MaterialIdentity>
                  <dl>
                    <div><dt>待采购</dt><dd>{{ suggestionQty(row.openQty, row.unit) }}</dd></div>
                    <div>
                      <dt>最早需求</dt>
                      <dd>{{ row.earliestExpectedDate || '—' }}</dd>
                      <small
                        v-if="purchaseSuggestionDueLabel(row.earliestExpectedDate)"
                        class="purchase-suggestion-master-due"
                        :class="{ 'is-overdue': purchaseSuggestionDueLabel(row.earliestExpectedDate).startsWith('已逾期') }"
                      >{{ purchaseSuggestionDueLabel(row.earliestExpectedDate) }}</small>
                    </div>
                  </dl>
                  <footer>
                    <span>{{ row.sourceCount }} 条需求</span>
                    <i :class="suggestionStatusClass(row)">{{ suggestionSupplierCountLabel(row) }}</i>
                  </footer>
                </button>
              </div>
            </aside>

            <article
              v-if="selectedSuggestionRow"
              ref="suggestionDetailRef"
              class="purchase-suggestion-detail"
              :aria-label="`${selectedSuggestionRow.materialName}采购建议详情`"
            >
              <header class="purchase-suggestion-head">
                <MaterialIdentity
                  :name="selectedSuggestionRow.materialName"
                  :code="selectedSuggestionRow.materialCode"
                  :model="selectedSuggestionRow.model"
                  :spec="selectedSuggestionRow.spec"
                  :image-tone="suggestionMaterialTone(selectedSuggestionRow.materialCode)"
                >
                  <template #supplement>
                    <span class="purchase-suggestion-company">{{ selectedSuggestionRow.company || selectedSuggestionRow.companyCode || '未指定公司' }}</span>
                  </template>
                </MaterialIdentity>
                <i
                  v-if="selectedSuggestionRow.supplierStatus === 'no-supplier'"
                  class="mini-status"
                  :class="suggestionStatusClass(selectedSuggestionRow)"
                >{{ suggestionSupplierCountLabel(selectedSuggestionRow) }}</i>
              </header>

              <dl class="purchase-suggestion-metrics">
                <div><dt>需求总量</dt><dd>{{ suggestionQty(selectedSuggestionRow.demandQty, selectedSuggestionRow.unit) }}</dd></div>
                <div><dt>已下单</dt><dd>{{ suggestionQty(selectedSuggestionRow.orderedQty, selectedSuggestionRow.unit) }}</dd></div>
                <div><dt>待采购</dt><dd>{{ suggestionQty(selectedSuggestionRow.openQty, selectedSuggestionRow.unit) }}</dd></div>
                <div>
                  <dt>最早需求</dt>
                  <dd>{{ selectedSuggestionRow.earliestExpectedDate || '—' }}</dd>
                  <small
                    v-if="purchaseSuggestionDueLabel(selectedSuggestionRow.earliestExpectedDate)"
                    class="purchase-suggestion-due-alert"
                    :class="{ 'is-overdue': purchaseSuggestionDueLabel(selectedSuggestionRow.earliestExpectedDate).startsWith('已逾期') }"
                  >{{ purchaseSuggestionDueLabel(selectedSuggestionRow.earliestExpectedDate) }}</small>
                </div>
              </dl>

              <section class="purchase-suggestion-reference-panel">
                <header><strong>需求来源</strong><span>{{ selectedSuggestionRow.sourceCount }} 条</span></header>
                <div class="purchase-suggestion-reference-list">
                  <RouterLink
                    v-for="source in selectedSuggestionRow.sources"
                    :key="`${source.requisitionCode}-${source.sourceLineId}`"
                    class="purchase-suggestion-source-row"
                    :to="`/purchase/requisitions/${encodeURIComponent(source.requisitionCode)}`"
                    :title="`查看采购需求 ${source.requisitionCode}`"
                  >
                    <span><strong>{{ source.requisitionCode }}</strong><small>{{ suggestionSourceTypeLabel(source.sourceType) }} · {{ source.department || '未指定部门' }} · {{ source.requester || '未指定提出人' }}</small></span>
                    <span><strong>待采购 {{ suggestionQty(source.remainingQty ?? source.quantity, source.unit || selectedSuggestionRow.unit) }}</strong><small>原需求 {{ suggestionQty(source.requestedQty ?? source.quantity, source.unit || selectedSuggestionRow.unit) }}<template v-if="(source.orderedQty ?? 0) > 0"> · 已下单 {{ suggestionQty(source.orderedQty ?? 0, source.unit || selectedSuggestionRow.unit) }}</template></small></span>
                    <span class="date-stack"><strong>{{ source.expectedDate || '—' }}</strong><small>需求日期</small></span>
                  </RouterLink>
                </div>
              </section>

              <section class="purchase-suggestion-reference-panel purchase-suggestion-supplier-panel">
                <header><strong>可选供应商</strong><span>{{ selectedSuggestionRow.supplierCount }} 家</span></header>
                <div v-if="selectedSuggestionRow.suppliers.length" class="purchase-suggestion-reference-list">
                  <RouterLink
                    v-for="supplier in selectedSuggestionRow.suppliers"
                    :key="supplier.supplierCode"
                    class="purchase-suggestion-supplier-row"
                    :to="`/master-data/suppliers/${encodeURIComponent(supplier.supplierCode)}`"
                    :title="`查看供应商 ${supplier.supplierName}`"
                  >
                    <span><strong>{{ supplier.supplierName }}</strong><small>{{ supplier.supplierCode }}<template v-if="supplier.supplierMaterialCode"> · 供方料号 {{ supplier.supplierMaterialCode }}</template></small></span>
                    <span><strong>起订量 {{ suggestionQty(supplier.minOrderQty, selectedSuggestionRow.unit) }}</strong><small>供货周期 {{ supplier.leadTimeDays }} 天</small></span>
                    <span><strong>参考下单 {{ suggestionQty(supplier.referenceOrderQty, selectedSuggestionRow.unit) }}</strong><small>按本供应商起订量计算</small></span>
                    <span :class="{ 'has-supplement': supplier.referenceSupplementQty > 0 }"><strong>超需求 {{ suggestionQty(supplier.referenceSupplementQty, selectedSuggestionRow.unit) }}</strong><small>{{ supplier.referenceSupplementQty > 0 ? '起订量高于当前需求' : '无需因起订量补足' }}</small></span>
                  </RouterLink>
                </div>
                <div v-else class="purchase-suggestion-reference-empty">
                  <span>当前没有启用的可供供应商</span>
                  <RouterLink :to="`/master-data/materials/${encodeURIComponent(selectedSuggestionRow.materialCode)}`">查看物料供应关系</RouterLink>
                </div>
              </section>
            </article>
          </div>
        </template>

        <template v-if="activePage === 'requisitions'">
          <div class="quote-table-shell purchase-requisition-list-shell with-status-column">
            <div class="quote-data-scroll">
              <div class="data-table quote-table purchase-requisition-table">
                <div class="table-row table-head">
                  <span>需求单</span>
                  <span>需求部门/提出人</span>
                  <span>采购内容</span>
                  <span>需求日期</span>
                </div>
                <RouterLink
                  v-for="row in visibleRequisitionRows"
                  :key="row.code"
                  class="table-row order-list-row purchase-requisition-list-row is-clickable"
                  :class="{ 'is-row-highlighted': hoveredRequisitionCode === row.code }"
                  :to="`/purchase/requisitions/${encodeURIComponent(row.code)}`"
                  :aria-label="`查看采购需求 ${row.code}`"
                  :title="`查看采购需求 ${row.code}`"
                  @pointerenter="hoveredRequisitionCode = row.code"
                  @pointerleave="hoveredRequisitionCode = ''"
                  @mouseenter="hoveredRequisitionCode = row.code"
                  @mouseleave="hoveredRequisitionCode = ''"
                  @focus="hoveredRequisitionCode = row.code"
                  @blur="hoveredRequisitionCode = ''"
                >
                  <span class="product-summary">
                    <strong class="quote-code">{{ row.code }}</strong>
                    <small>{{ purchaseRequisitionSourceSummary(row) }}</small>
                  </span>
                  <span class="party-cell">
                    <strong>{{ row.department }}</strong>
                    <small>{{ row.requester }}</small>
                  </span>
                  <span class="product-summary">
                    <strong :title="productIdentity(row.products[0], purchaseContentTitle(row))">{{ purchaseContentTitle(row) }}</strong>
                    <small>{{ purchaseContentMeta(row) }}</small>
                  </span>
                  <span class="date-stack">
                    <strong>{{ row.expectedDate }}</strong>
                    <small>提出 {{ row.date }}</small>
                  </span>
                </RouterLink>
              </div>
            </div>

            <div class="quote-status-column purchase-requisition-status-column">
              <div class="quote-status-head requisition-status-head">
                <strong>单据状态</strong>
                <small>转采购 · 待办</small>
              </div>
              <RouterLink
                v-for="row in visibleRequisitionRows"
                :key="`${row.code}-status`"
                class="quote-status-cell order-status-link requisition-status-cell"
                :class="{ 'is-row-highlighted': hoveredRequisitionCode === row.code }"
                :to="`/purchase/requisitions/${encodeURIComponent(row.code)}`"
                :aria-label="`查看采购需求 ${row.code} 状态`"
                :title="`查看采购需求 ${row.code}：单据 ${requisitionDocumentStatus(row)}，转采购 ${row.conversionFacts?.status || '未转单'}，待办 ${requisitionNextStep(row.status, row.conversionFacts)}`"
                @pointerenter="hoveredRequisitionCode = row.code"
                @pointerleave="hoveredRequisitionCode = ''"
                @mouseenter="hoveredRequisitionCode = row.code"
                @mouseleave="hoveredRequisitionCode = ''"
                @focus="hoveredRequisitionCode = row.code"
                @blur="hoveredRequisitionCode = ''"
              >
                <span class="requisition-document-state">
                  <i class="mini-status" :class="statusClass(requisitionDocumentStatus(row))">{{ requisitionDocumentStatus(row) }}</i>
                </span>
                <span class="requisition-progress-scan">
                  <span>
                    <b>转采购</b>
                    <i :class="statusClass(row.conversionFacts?.status || '未转单')">{{ row.conversionFacts?.status || '未转单' }}</i>
                  </span>
                  <span>
                    <b>待办</b>
                    <i>{{ requisitionListTask(row) }}</i>
                  </span>
                </span>
              </RouterLink>
            </div>
          </div>

          <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentPurchaseList" />
          <div v-else-if="visibleRequisitionRows.length === 0" class="list-empty-state">
            <strong>{{ hasListConstraints ? '未找到匹配采购需求' : '暂无采购需求' }}</strong>
            <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '新建采购需求后会显示在这里。' }}</span>
            <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
              清空条件
            </button>
          </div>

          <div class="quote-card-list purchase-requisition-card-list">
            <RouterLink
              v-for="row in visibleRequisitionRows"
              :key="`${row.code}-card`"
              class="quote-card"
              :to="`/purchase/requisitions/${encodeURIComponent(row.code)}`"
              :title="`查看采购需求 ${row.code}`"
            >
              <div class="quote-card-head">
                <div>
                  <strong>{{ row.code }}</strong>
                  <span>{{ row.department }} · {{ row.requester }}</span>
                </div>
                <i class="mini-status" :class="statusClass(requisitionDocumentStatus(row))">{{ requisitionDocumentStatus(row) }}</i>
              </div>
              <div class="requisition-card-progress">
                <span><b>转采购</b>{{ row.conversionFacts?.status || '未转单' }}</span>
                <span><b>待办</b>{{ requisitionListTask(row) }}</span>
              </div>
              <div class="quote-card-main quote-card-products">
                <div>
                  <span v-for="product in row.products.slice(0, 2)" :key="product.materialCode || product.name">
                    <b>{{ product.name || product.materialCode || '-' }}</b>
                    <small>{{ purchaseCardProductMeta(product) }}</small>
                  </span>
                  <span v-if="row.products.length > 2" class="purchase-card-more">另有 {{ row.products.length - 2 }} 项物料</span>
                </div>
                <strong class="purchase-requisition-card-date"><small>需求日期</small>{{ row.expectedDate || '—' }}</strong>
              </div>
              <div class="quote-card-meta">
                <span>来源 {{ purchaseRequisitionSourceSummary(row) }}</span>
                <span>提出 {{ row.date || '—' }}</span>
                <span v-if="row.reason">原因 {{ row.reason }}</span>
                <span v-if="row.attachments.length">附件 {{ row.attachments.length }} 个</span>
              </div>
            </RouterLink>
          </div>
        </template>

        <template v-if="activePage === 'orders'">
          <div class="quote-table-shell purchase-order-list-shell with-status-column">
            <div class="quote-data-scroll">
              <div class="data-table quote-table purchase-order-table">
                <div class="table-row table-head">
                  <span>采购订单</span>
                  <span>供应商/采购员</span>
                  <span>采购内容</span>
                  <span>金额</span>
                  <span>预计到货</span>
                </div>
                <RouterLink
                  v-for="row in visiblePurchaseRows"
                  :key="row.code"
                  class="table-row order-list-row purchase-order-list-row is-clickable"
                  :class="{ 'is-row-highlighted': hoveredPurchaseOrderCode === row.code }"
                  :to="purchaseOrderPath(row)"
                  :aria-label="`打开采购订单 ${row.code}`"
                  :title="`打开采购订单 ${row.code}`"
                  @pointerenter="hoveredPurchaseOrderCode = row.code"
                  @pointerleave="hoveredPurchaseOrderCode = ''"
                  @mouseenter="hoveredPurchaseOrderCode = row.code"
                  @mouseleave="hoveredPurchaseOrderCode = ''"
                  @focus="hoveredPurchaseOrderCode = row.code"
                  @blur="hoveredPurchaseOrderCode = ''"
                >
                  <span class="product-summary">
                    <strong class="quote-code">{{ row.code }}</strong>
                    <small>{{ purchaseSourceLabel(row) }}</small>
                  </span>
                  <span class="party-cell">
                    <strong>{{ row.supplier }}</strong>
                    <small>采购员 · {{ row.owner }}</small>
                  </span>
                  <span class="product-summary">
                    <strong :title="productIdentity(row.products[0], purchaseContentTitle(row))">{{ purchaseContentTitle(row) }}</strong>
                    <small :title="purchaseContentMeta(row)">{{ purchaseContentMeta(row) }}</small>
                  </span>
                  <span class="amount-cell amount-stack">
                    <strong>{{ row.amount }}</strong>
                    <small :title="purchasePayableSummary(row)">{{ purchasePayableSummary(row) }}</small>
                  </span>
                  <span class="product-summary purchase-order-due-cell">
                    <strong>{{ row.expectedDate || '—' }}</strong>
                    <small>下单 {{ row.date || '—' }}</small>
                  </span>
                </RouterLink>
              </div>
            </div>

            <div class="quote-status-column purchase-order-progress-column">
              <div class="quote-status-head purchase-order-progress-head">
                <strong>采购跟进</strong>
                <small>到货 · 质检 · 入库 · 收票 · 付款</small>
              </div>
              <RouterLink
                v-for="row in visiblePurchaseRows"
                :key="`${row.code}-status`"
                class="quote-status-cell order-status-link purchase-order-progress-cell"
                :class="{ 'is-row-highlighted': hoveredPurchaseOrderCode === row.code }"
                :to="purchaseOrderFollowUpPath(row)"
                :aria-label="`查看采购订单 ${row.code} 采购跟进`"
                :title="`查看采购订单 ${row.code} 采购跟进：${purchaseOrderStatusLabel(row.status)}；到货${purchaseOrderProgressSnapshot(row).arrival}，质检${purchaseOrderProgressSnapshot(row).quality}，入库${purchaseOrderProgressSnapshot(row).inbound}，收票${purchaseOrderProgressSnapshot(row).invoice}，付款${purchaseOrderProgressSnapshot(row).payment}；${purchaseOrderProgressSnapshot(row).attention}`"
                @pointerenter="hoveredPurchaseOrderCode = row.code"
                @pointerleave="hoveredPurchaseOrderCode = ''"
                @mouseenter="hoveredPurchaseOrderCode = row.code"
                @mouseleave="hoveredPurchaseOrderCode = ''"
                @focus="hoveredPurchaseOrderCode = row.code"
                @blur="hoveredPurchaseOrderCode = ''"
              >
                <span class="purchase-order-document-state">
                  <i class="mini-status" :class="statusClass(purchaseOrderStatusLabel(row.status))">{{ purchaseOrderStatusLabel(row.status) }}</i>
                  <small
                    v-if="purchaseOrderProgressSnapshot(row).attention !== '正常'"
                    class="purchase-order-attention"
                    :class="`tone-${purchaseOrderProgressSnapshot(row).attentionTone}`"
                  >
                    {{ purchaseOrderProgressSnapshot(row).attention }}
                  </small>
                </span>
                <span
                  class="purchase-order-progress-scan is-five-stage"
                >
                  <span>
                    <b>到货</b>
                    <i :class="purchaseProgressStatusClass(purchaseOrderProgressSnapshot(row).arrival)">{{ purchaseOrderProgressSnapshot(row).arrival }}</i>
                  </span>
                  <span>
                    <b>质检</b>
                    <i :class="purchaseProgressStatusClass(purchaseOrderProgressSnapshot(row).quality)">{{ purchaseOrderProgressSnapshot(row).quality }}</i>
                  </span>
                  <span>
                    <b>入库</b>
                    <i :class="purchaseProgressStatusClass(purchaseOrderProgressSnapshot(row).inbound)">{{ purchaseOrderProgressSnapshot(row).inbound }}</i>
                  </span>
                  <span>
                    <b>收票</b>
                    <i :class="purchaseProgressStatusClass(purchaseOrderProgressSnapshot(row).invoice)">{{ purchaseOrderProgressSnapshot(row).invoice }}</i>
                  </span>
                  <span>
                    <b>付款</b>
                    <i :class="purchaseProgressStatusClass(purchaseOrderProgressSnapshot(row).payment)">{{ purchaseOrderProgressSnapshot(row).payment }}</i>
                  </span>
                </span>
              </RouterLink>
            </div>
          </div>

          <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentPurchaseList" />
          <div v-else-if="visiblePurchaseRows.length === 0" class="list-empty-state">
            <strong>
              {{ hasListConstraints ? '未找到匹配采购订单' : '暂无采购订单' }}
            </strong>
            <span>
              {{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '采购需求转单或新建采购订单后会显示在这里。' }}
            </span>
            <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
              清空条件
            </button>
          </div>

          <div class="quote-card-list purchase-order-card-list">
            <article
              v-for="row in visiblePurchaseRows"
              :key="`${row.code}-card`"
              class="quote-card"
            >
              <RouterLink
                class="purchase-order-card-content-link"
                :to="purchaseOrderPath(row)"
                :title="`查看采购订单 ${row.code} 采购内容`"
                :aria-label="`查看采购订单 ${row.code} 采购内容`"
              >
                <div class="quote-card-head">
                  <div>
                    <strong>{{ row.supplier }}</strong>
                    <span>{{ row.code }} · {{ purchaseSourceLabel(row) }}</span>
                  </div>
                  <i class="mini-status" :class="statusClass(purchaseOrderStatusLabel(row.status))">{{ purchaseOrderStatusLabel(row.status) }}</i>
                </div>
                <div class="quote-card-main quote-card-products">
                  <div>
                    <span v-for="product in row.products.slice(0, 2)" :key="product.materialCode || product.name">
                      <b>{{ product.name || product.materialCode || '-' }}</b>
                      <small>{{ purchaseCardProductMeta(product) }}</small>
                    </span>
                    <span v-if="row.products.length > 2" class="purchase-card-more">另有 {{ row.products.length - 2 }} 项物料</span>
                  </div>
                  <strong class="purchase-order-card-amount">
                    <span>{{ row.amount }}</span>
                  </strong>
                </div>
                <div class="quote-card-meta">
                  <span>联系人 {{ contactText(row) }}</span>
                  <span>{{ purchasePayableSummary(row) }}</span>
                  <span>预计到货 {{ row.expectedDate || '—' }}</span>
                  <span>下单 {{ row.date || '—' }}</span>
                  <span>采购员 {{ row.owner || '—' }}</span>
                </div>
              </RouterLink>

              <RouterLink
                class="purchase-order-card-follow-up-link"
                :to="purchaseOrderFollowUpPath(row)"
                :title="`查看采购订单 ${row.code} 采购跟进`"
                :aria-label="`查看采购订单 ${row.code} 采购跟进`"
              >
                <div class="purchase-order-card-follow-up-head">
                  <strong>采购跟进</strong>
                  <span>查看</span>
                </div>
                <div
                  class="purchase-order-card-progress is-five-stage"
                >
                  <span><b>到货</b>{{ purchaseOrderProgressSnapshot(row).arrival }}</span>
                  <span><b>质检</b>{{ purchaseOrderProgressSnapshot(row).quality }}</span>
                  <span><b>入库</b>{{ purchaseOrderProgressSnapshot(row).inbound }}</span>
                  <span><b>收票</b>{{ purchaseOrderProgressSnapshot(row).invoice }}</span>
                  <span><b>付款</b>{{ purchaseOrderProgressSnapshot(row).payment }}</span>
                </div>
                <div
                  v-if="purchaseOrderProgressSnapshot(row).attention !== '正常'"
                  class="purchase-order-card-attention"
                  :class="`tone-${purchaseOrderProgressSnapshot(row).attentionTone}`"
                >
                  {{ purchaseOrderProgressSnapshot(row).attention }}
                </div>
              </RouterLink>
            </article>
          </div>
        </template>

        <template v-if="activePage === 'afterSales'">
          <div class="quote-table-shell after-sales-list-shell with-status-column">
            <div class="quote-data-scroll">
              <div class="data-table quote-table after-sales-table">
                <div class="table-row table-head">
                  <span>售后单/来源订单</span>
                  <span>供应商/受影响物料</span>
                  <span>问题/受影响数量</span>
                  <span>处理进度</span>
                  <span>登记日期</span>
                </div>
                <RouterLink
                  v-for="row in visibleAfterSaleRows"
                  :key="row.code"
                  class="table-row after-sales-list-row order-list-row is-clickable"
                  :class="{ 'is-row-highlighted': hoveredAfterSalesCode === row.code }"
                  :to="`/purchase/after-sales/${encodeURIComponent(row.code)}`"
                  :aria-label="`打开采购售后 ${row.code}`"
                  :title="`打开采购售后 ${row.code}`"
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
                    <strong>{{ row.supplier }}</strong>
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
                :to="`/purchase/after-sales/${encodeURIComponent(row.code)}`"
                :aria-label="`打开采购售后 ${row.code} 状态`"
                :title="`打开采购售后 ${row.code} 状态：${row.status}，下一步：${row.nextStep}`"
                @pointerenter="hoveredAfterSalesCode = row.code"
                @pointerleave="hoveredAfterSalesCode = ''"
                @mouseenter="hoveredAfterSalesCode = row.code"
                @mouseleave="hoveredAfterSalesCode = ''"
                @focus="hoveredAfterSalesCode = row.code"
                @blur="hoveredAfterSalesCode = ''"
              >
                <i class="mini-status" :class="afterSaleStatusClass(row.status)">{{ row.status }}</i>
                <small>下一步：{{ row.nextStep }}</small>
              </RouterLink>
            </div>
          </div>

          <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentPurchaseList" />
          <div v-else-if="visibleAfterSaleRows.length === 0" class="list-empty-state">
            <strong>{{ hasListConstraints ? '未找到匹配采购售后' : '暂无采购售后' }}</strong>
            <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '来料差异、退换货、供应商补发和扣款折让后续会集中在这里处理。' }}</span>
            <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
              清空条件
            </button>
          </div>

          <div class="quote-card-list">
            <RouterLink
              v-for="row in visibleAfterSaleRows"
              :key="`${row.code}-card`"
              class="quote-card is-clickable"
              :to="`/purchase/after-sales/${encodeURIComponent(row.code)}`"
              :title="`打开采购售后 ${row.code}`"
            >
              <div class="quote-card-head">
                <div>
                  <strong>{{ row.supplier }}</strong>
                  <span>{{ row.code }} · {{ row.sourceOrder }}</span>
                </div>
                <i class="mini-status" :class="afterSaleStatusClass(row.status)">{{ row.status }}</i>
              </div>
              <div class="quote-card-main">
                <span>{{ row.issueType }} · 影响 {{ afterSaleAffectedQuantity(row) }}</span>
                <strong>{{ afterSaleExecutionSummary(row) }}</strong>
              </div>
              <div class="quote-card-meta">
                <span>{{ afterSaleProductSummary(row) }}</span>
                <span>采购员 {{ row.owner }}</span>
                <span>下一步：{{ row.nextStep }}</span>
                <span>登记 {{ row.date }}</span>
              </div>
            </RouterLink>
          </div>
        </template>

        <div v-if="activePage !== 'suggestions'" class="table-footer">
          <span>
            <template v-if="activePage === 'requisitions'">
              共 {{ visibleRequisitionRows.length }} 条
            </template>
            <template v-else-if="activePage === 'orders'">
              共 {{ visiblePurchaseRows.length }} 条
            </template>
            <template v-else-if="activePage === 'afterSales'">
              共 {{ visibleAfterSaleRows.length }} 条
            </template>
            <template v-else>
              共 {{ visiblePriceRows.length }} 条
            </template>
          </span>
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
          :newest-sort-label="newestSortLabel"
          :oldest-sort-label="oldestSortLabel"
          :show-status-sort="showStatusSort"
          :status-sort-label="statusSortLabel"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <div class="table-scroll reference-table-scroll">
          <div class="data-table reference-table price-history-table purchase-price-table">
            <div class="table-row table-head">
              <span>采购物料</span>
              <span>供应商</span>
              <span>含税采购单价</span>
              <span>订单数量</span>
              <span>来源采购单/日期</span>
            </div>
            <div v-for="row in visiblePriceRows" :key="row.key" class="table-row">
              <span class="product-summary">
                <strong>{{ row.product }}</strong>
                <small v-if="row.model || row.spec" class="product-model-spec">{{ [row.model, row.spec].filter(Boolean).join(' · ') }}</small>
                <small v-if="row.materialCode" class="product-material-code">{{ row.materialCode }}</small>
              </span>
              <span class="party-cell price-customer-cell">
                <strong>{{ row.supplier }}</strong>
              </span>
              <span class="amount-cell price-basis-cell">
                <strong>{{ row.grossUnitPrice }}<small v-if="row.uom"> / {{ row.uom }}</small></strong>
                <small>未税 {{ row.netUnitPrice }} · 税率 {{ row.taxRate }}</small>
              </span>
              <span class="reference-quantity-cell">{{ row.quantity }}</span>
              <span class="product-summary">
                <RouterLink
                  class="quote-code reference-doc-link"
                  :to="`/purchase/orders/${encodeURIComponent(row.sourceDoc)}`"
                  :title="`查看来源采购单 ${row.sourceDoc}`"
                >
                  {{ row.sourceDoc }}
                </RouterLink>
                <small>{{ row.orderDate }}</small>
              </span>
            </div>
          </div>
        </div>

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadCurrentPurchaseList" />
        <div v-else-if="visiblePriceRows.length === 0" class="list-empty-state">
          <strong>{{ hasListConstraints ? '未找到匹配采购价格记录' : '暂无采购价格记录' }}</strong>
          <span>{{ hasListConstraints ? '可以调整搜索、排序或筛选条件后再查看。' : '已确认或已关闭的采购订单会在此形成价格记录。' }}</span>
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
                <span>{{ row.supplier }}</span>
              </div>
              <strong class="reference-card-value">{{ row.grossUnitPrice }}<small v-if="row.uom"> / {{ row.uom }}</small></strong>
            </div>
            <div class="quote-card-meta">
              <RouterLink
                class="reference-doc-link"
                :to="`/purchase/orders/${encodeURIComponent(row.sourceDoc)}`"
                :title="`查看来源采购单 ${row.sourceDoc}`"
              >采购单 {{ row.sourceDoc }}</RouterLink>
              <span>未税 {{ row.netUnitPrice }} · 税率 {{ row.taxRate }}</span>
              <span>订单数量 {{ row.quantity }} · {{ row.orderDate }}</span>
            </div>
          </article>
        </div>

        <div class="table-footer">
          <span>共 {{ visiblePriceRows.length }} 条</span>
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
.purchase-suggestion-workspace {
  display: grid;
  grid-template-columns: minmax(280px, .72fr) minmax(0, 1.6fr);
  align-items: start;
  gap: 12px;
}

.purchase-suggestion-master,
.purchase-suggestion-detail {
  overflow: hidden;
  border: 1px solid var(--line-color, #deded9);
  border-radius: 10px;
  background: #fff;
}

.purchase-suggestion-master {
  align-self: start;
}

.purchase-suggestion-master > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #e7e7e1;
  background: #fafaf7;
}

.purchase-suggestion-master > header strong {
  color: #2f312e;
  font-size: 13px;
}

.purchase-suggestion-master > header span {
  color: var(--muted-text, #72746f);
  font-size: 11px;
}

.purchase-suggestion-master-list {
  display: grid;
}

.purchase-suggestion-detail {
  position: sticky;
  top: 12px;
  align-self: start;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: calc(100vh - 92px);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.purchase-suggestion-master-item {
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-radius: 0;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color .16s ease, box-shadow .16s ease;
}

.purchase-suggestion-master-item + .purchase-suggestion-master-item {
  border-top: 1px solid #ecece7;
}

.purchase-suggestion-master-item:hover,
.purchase-suggestion-master-item:focus-visible {
  background: #f8faf6;
  box-shadow: inset 3px 0 #789477;
  outline: none;
}

.purchase-suggestion-master-item.is-selected {
  background: #f0f5ef;
  box-shadow: inset 3px 0 #61866a;
}

.purchase-suggestion-master-item.is-selected:hover,
.purchase-suggestion-master-item.is-selected:focus-visible {
  background: #edf4ec;
  box-shadow: inset 3px 0 #52775b;
}

.purchase-suggestion-master-item :deep(.material-identity) {
  min-width: 0;
}

.purchase-suggestion-master-company {
  overflow: hidden;
  color: var(--muted-text, #72746f);
  font-size: 10px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-suggestion-master-item dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.purchase-suggestion-master-item dl > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.purchase-suggestion-master-item dt {
  color: var(--muted-text, #72746f);
  font-size: 10px;
  font-weight: 650;
}

.purchase-suggestion-master-item dd {
  overflow: hidden;
  margin: 0;
  color: #30322e;
  font-size: 12px;
  font-weight: 730;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-suggestion-master-due {
  overflow: hidden;
  color: #9a6424;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-suggestion-master-due.is-overdue {
  color: #a0443e;
}

.purchase-suggestion-master-item footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted-text, #72746f);
  font-size: 10px;
}

.purchase-suggestion-master-item footer i {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-style: normal;
  font-weight: 720;
}

.purchase-suggestion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
}

.purchase-suggestion-head :deep(.material-identity) {
  flex: 1 1 auto;
  min-width: 0;
}

.purchase-suggestion-company {
  color: var(--muted-text, #72746f);
  font-size: 11px;
}

.purchase-suggestion-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid var(--line-color, #deded9);
  border-bottom: 1px solid var(--line-color, #deded9);
  background: #fafaf7;
}

.purchase-suggestion-metrics > div {
  display: grid;
  gap: 4px;
  min-width: 0;
  min-height: 72px;
  padding: 12px 16px;
  align-content: center;
}

.purchase-suggestion-metrics > div + div {
  border-left: 1px solid #e7e7e1;
}

.purchase-suggestion-metrics dt {
  color: var(--muted-text, #72746f);
  font-size: 11px;
  font-weight: 650;
}

.purchase-suggestion-metrics dd {
  margin: 0;
  color: #272925;
  font-size: 15px;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}

.purchase-suggestion-metrics small {
  color: #8a5a1f;
  font-size: 11px;
  line-height: 1.3;
}

.purchase-suggestion-reference-panel {
  min-width: 0;
  padding: 13px 16px 15px;
}

.purchase-suggestion-reference-panel + .purchase-suggestion-reference-panel {
  border-top: 1px solid #ecece7;
}

.purchase-suggestion-reference-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.purchase-suggestion-reference-panel > header strong {
  color: #30322e;
  font-size: 12px;
}

.purchase-suggestion-reference-panel > header span {
  color: var(--muted-text, #72746f);
  font-size: 11px;
}

.purchase-suggestion-reference-list {
  display: grid;
  overflow: hidden;
  border: 1px solid #e7e7e1;
  border-radius: 7px;
}

.purchase-suggestion-source-row,
.purchase-suggestion-supplier-row {
  display: grid;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 54px;
  padding: 8px 10px;
  color: inherit;
  text-decoration: none;
  transition: background-color .16s ease, box-shadow .16s ease;
}

.purchase-suggestion-source-row {
  grid-template-columns: minmax(150px, 1fr) minmax(190px, .9fr) 94px;
}

.purchase-suggestion-supplier-row {
  grid-template-columns: minmax(150px, 1.15fr) minmax(110px, .72fr) minmax(130px, .88fr) minmax(120px, .8fr);
}

.purchase-suggestion-source-row + .purchase-suggestion-source-row,
.purchase-suggestion-supplier-row + .purchase-suggestion-supplier-row {
  border-top: 1px solid #ecece7;
}

.purchase-suggestion-source-row:hover,
.purchase-suggestion-source-row:focus-visible,
.purchase-suggestion-supplier-row:hover,
.purchase-suggestion-supplier-row:focus-visible {
  background: #f8f8f4;
  box-shadow: inset 3px 0 #242825;
  outline: none;
}

.purchase-suggestion-source-row > span,
.purchase-suggestion-supplier-row > span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.purchase-suggestion-source-row strong,
.purchase-suggestion-supplier-row strong,
.purchase-suggestion-source-row small,
.purchase-suggestion-supplier-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-suggestion-source-row strong,
.purchase-suggestion-supplier-row strong {
  color: #30322e;
  font-size: 12px;
}

.purchase-suggestion-source-row small,
.purchase-suggestion-supplier-row small {
  color: var(--muted-text, #72746f);
  font-size: 11px;
}

.purchase-suggestion-supplier-row > .has-supplement strong,
.purchase-suggestion-supplier-row > .has-supplement small {
  color: #9a6424;
}

.purchase-suggestion-reference-empty {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px dashed #ddd7ca;
  border-radius: 7px;
  color: #7a5a24;
  font-size: 12px;
}

.purchase-suggestion-reference-empty a {
  color: #486351;
  font-weight: 700;
}

.purchase-suggestion-due-alert {
  color: #9a6424 !important;
  font-size: 11px !important;
  font-weight: 650;
}

.purchase-suggestion-due-alert.is-overdue {
  color: #a0443e !important;
}

@media (max-width: 1100px) {
  .purchase-suggestion-workspace {
    grid-template-columns: 1fr;
  }

  .purchase-suggestion-detail {
    position: static;
    overflow: hidden;
    max-height: none;
    scrollbar-gutter: auto;
  }

  .purchase-suggestion-master-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .purchase-suggestion-master-item:nth-child(2) {
    border-top: 0;
  }

  .purchase-suggestion-master-item:nth-child(even) {
    border-left: 1px solid #ecece7;
  }
}

@media (max-width: 900px) {
  .purchase-suggestion-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .purchase-suggestion-metrics > div + div {
    border-left: 0;
  }

  .purchase-suggestion-metrics > div:nth-child(even) {
    border-left: 1px solid #e7e7e1;
  }

  .purchase-suggestion-metrics > div:nth-child(n + 3) {
    border-top: 1px solid #e7e7e1;
  }

  .purchase-suggestion-source-row {
    grid-template-columns: minmax(130px, 1fr) minmax(160px, .9fr);
  }

  .purchase-suggestion-source-row > :last-child {
    display: grid;
    grid-column: 1 / -1;
    padding-top: 7px;
    border-top: 1px dashed #ecece7;
  }

  .purchase-suggestion-supplier-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .purchase-suggestion-master-list {
    grid-template-columns: 1fr;
  }

  .purchase-suggestion-master-item:nth-child(2) {
    border-top: 1px solid #ecece7;
  }

  .purchase-suggestion-master-item:nth-child(even) {
    border-left: 0;
  }

  .purchase-suggestion-supplier-row {
    grid-template-columns: 1fr;
  }

  .purchase-suggestion-source-row {
    grid-template-columns: 1fr;
  }

  .purchase-suggestion-source-row > :last-child {
    grid-column: auto;
  }
}

.purchase-page .purchase-requisition-list-shell {
  grid-template-columns: minmax(0, 1fr) 236px;
}

.purchase-page .purchase-requisition-table {
  min-width: 0;
}

.purchase-page .purchase-requisition-table .table-row {
  grid-template-columns:
    minmax(116px, 0.85fr)
    minmax(116px, 0.9fr)
    minmax(210px, 1.55fr)
    minmax(104px, 0.72fr);
}

.requisition-status-head {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  align-content: center;
  gap: 8px;
  padding-inline: 10px;
}

.requisition-status-head strong {
  color: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

.requisition-status-head small {
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.requisition-status-cell {
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
}

.requisition-document-state {
  display: grid;
  min-width: 0;
  justify-items: start;
  text-align: left;
}

.requisition-progress-scan {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
}

.requisition-progress-scan > span {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 1px 7px;
  border-left: 1px solid #ecece5;
  justify-items: center;
  text-align: center;
}

.requisition-progress-scan b,
.requisition-progress-scan i {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.requisition-progress-scan b {
  color: #77786f;
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.requisition-progress-scan i {
  display: -webkit-box;
  color: #30322d;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.requisition-progress-scan i.status-pending,
.requisition-progress-scan i.status-void {
  color: #7a4f2a;
}

.requisition-card-progress {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid #ecece5;
  border-bottom: 1px solid #ecece5;
}

.requisition-card-progress span {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 6px;
  padding: 7px 4px;
  color: #33352f;
  font-size: 11px;
}

.requisition-card-progress b {
  color: #77786f;
  font-weight: 600;
}

.purchase-page .purchase-order-list-shell {
  grid-template-columns: minmax(0, 1fr) 360px;
}

.purchase-page .purchase-order-table {
  min-width: 0;
}

.purchase-page .purchase-order-table .table-row {
  grid-template-columns:
    minmax(112px, 0.82fr)
    minmax(124px, 0.92fr)
    minmax(164px, 1.24fr)
    minmax(96px, 0.72fr)
    minmax(108px, 0.8fr);
}

.purchase-page .purchase-order-table .table-row:not(.table-head) {
  height: 86px;
  min-height: 86px;
}

.purchase-page .purchase-order-table .purchase-order-list-row > .product-summary:nth-child(3) small {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.25;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.purchase-page .purchase-order-table .purchase-order-list-row > .amount-stack small {
  display: block;
  overflow: hidden;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-order-due-cell strong {
  font-variant-numeric: tabular-nums;
}

.purchase-page .purchase-order-progress-column {
  grid-auto-rows: 86px;
}

.purchase-order-progress-head {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding: 0 9px;
}

.purchase-order-progress-head strong {
  color: inherit;
  font-size: 12px;
}

.purchase-order-progress-head small {
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
}

.purchase-order-progress-cell {
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
}

.purchase-order-document-state {
  display: grid;
  min-width: 0;
  gap: 5px;
  align-content: center;
}

.purchase-order-document-state .mini-status {
  justify-self: start;
}

.purchase-order-attention {
  display: -webkit-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: #7a5a24;
  font-size: 10px;
  font-weight: 680;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.purchase-order-attention.tone-danger,
.purchase-order-attention.tone-paused,
.purchase-order-card-attention.tone-danger,
.purchase-order-card-attention.tone-paused {
  color: #8b3f36;
}

.purchase-order-progress-scan {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 0;
}

.purchase-order-progress-scan.is-five-stage {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.purchase-order-progress-scan > span {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 2px 6px;
  border-left: 1px solid #ecece5;
  justify-items: center;
  text-align: center;
}

.purchase-order-progress-scan b,
.purchase-order-progress-scan i {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-order-progress-scan b {
  color: #77786f;
  font-size: 10px;
  font-weight: 650;
}

.purchase-order-progress-scan i {
  display: -webkit-box;
  color: #30322d;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.purchase-order-progress-scan i.status-pending,
.purchase-order-progress-scan i.status-void {
  color: #7a4f2a;
}

.purchase-order-card-progress {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #ecece5;
  border-bottom: 1px solid #ecece5;
}

.purchase-order-card-content-link,
.purchase-order-card-follow-up-link {
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.purchase-order-card-content-link {
  display: grid;
  gap: 12px;
}

.purchase-order-card-follow-up-link {
  display: grid;
  gap: 8px;
  padding-top: 11px;
  border-top: 1px solid #e6e8e2;
}

.purchase-order-card-follow-up-link:hover .purchase-order-card-follow-up-head span,
.purchase-order-card-follow-up-link:focus-visible .purchase-order-card-follow-up-head span {
  color: #315b3c;
}

.purchase-order-card-follow-up-link:focus-visible,
.purchase-order-card-content-link:focus-visible {
  border-radius: 6px;
  outline: 2px solid rgba(84, 107, 71, 0.5);
  outline-offset: 3px;
}

.purchase-order-card-follow-up-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.purchase-order-card-follow-up-head strong {
  color: #30352f;
  font-size: 12px;
  font-weight: 720;
}

.purchase-order-card-follow-up-head span {
  color: #777e77;
  font-size: 11px;
  font-weight: 650;
}

.purchase-requisition-card-date {
  display: grid;
  gap: 3px;
  color: #30322d !important;
  font-size: 14px !important;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.purchase-requisition-card-date small {
  color: #77786f;
  font-size: 10px;
  font-weight: 650;
}

.purchase-card-more {
  color: #77786f !important;
  font-size: 11px !important;
  font-weight: 650;
}

.purchase-order-card-list .quote-card-products > div > span:not(.purchase-card-more),
.purchase-requisition-card-list .quote-card-products > div > span:not(.purchase-card-more) {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.purchase-order-card-list .quote-card-products b,
.purchase-requisition-card-list .quote-card-products b,
.purchase-order-card-list .quote-card-products small,
.purchase-requisition-card-list .quote-card-products small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-order-card-list .quote-card-products b,
.purchase-requisition-card-list .quote-card-products b {
  font-size: 13px;
  font-weight: 680;
}

.purchase-order-card-amount {
  display: grid;
  min-width: 0;
  gap: 2px;
  justify-items: end;
}

.purchase-order-card-amount > span {
  color: var(--blue);
  font-size: 18px;
  font-weight: 720;
  line-height: 1.25;
}

.purchase-order-card-amount > small {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

.purchase-order-card-progress span {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 6px;
  padding: 7px 4px;
  color: #33352f;
  font-size: 11px;
}

.purchase-order-card-progress b {
  color: #77786f;
  font-weight: 600;
}

.purchase-order-card-attention {
  color: #7a5a24;
  font-size: 11px;
  font-weight: 680;
}

@media (max-width: 1440px) and (min-width: 761px) {
  .purchase-order-progress-scan.is-five-stage > span {
    grid-template-columns: 34px minmax(0, 1fr);
    align-content: center;
    align-items: center;
    gap: 3px;
    padding: 4px 6px;
  }

  .purchase-order-progress-scan.is-five-stage {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .purchase-order-progress-scan.is-five-stage > span:nth-child(3n + 1) {
    border-left: 0;
  }

  .purchase-order-progress-scan.is-five-stage > span:nth-child(n + 4) {
    border-top: 1px solid #ecece5;
  }

  .purchase-order-progress-scan.is-five-stage b,
  .purchase-order-progress-scan.is-five-stage i {
    line-height: 1.2;
  }
}

@media (max-width: 1260px) and (min-width: 761px) {
  .purchase-page .purchase-order-list-shell,
  .purchase-page .purchase-requisition-list-shell {
    display: none;
  }

  .purchase-page .purchase-order-card-list,
  .purchase-page .purchase-requisition-card-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 12px;
  }

  .purchase-page .quote-card-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 4px 12px;
  }
}
</style>
