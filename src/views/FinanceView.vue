<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ListFilter, Plus } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import type { FinanceTabKey } from '../data/finance';
import { listFinanceRecords } from '../services/api';
import type { FinanceRecord } from '../types/business';
import { statusPresentationClass } from '../utils/statusPresentation';

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';
type BusinessFilters = { status: string; party: string; owner: string; dateStart: string; dateEnd: string };
type FinanceFilterField = { key: FilterFieldKey; label: string; options: string[] };

type FinanceListRow = {
  page: FinanceTabKey;
  code: string;
  sourceDoc: string;
  party: string;
  contact: string;
  amount: string;
  settledAmount: string;
  adjustmentText: string;
  outstandingAmount: string;
  amountValue: number;
  outstandingValue: number;
  needsSettlementAction: boolean;
  isRefundPending: boolean;
  lifecycleStatus: string;
  settlementStatus: string;
  attentionStatus: string;
  owner: string;
  date: string;
  dueDate: string;
  invoiceType: string;
  nextStep: string;
  searchValues: unknown[];
};

const route = useRoute();
const { canWrite: canWriteFinance, readonlyReason: financeReadonlyReason } = useModulePermission('finance');
const { canOperate: canSettleFinance, readonlyReason: financeSettleReadonlyReason } = useOperationPermission('financeSettle', '执行财务动作');

const pageTitles: Record<FinanceTabKey, string> = {
  salesInvoices: '销售发票',
  purchaseInvoices: '采购发票',
  receivables: '应收账款',
  payables: '应付账款',
};
const createButtonLabels: Partial<Record<FinanceTabKey, string>> = {
  salesInvoices: '新建',
  purchaseInvoices: '新建',
};
const routePageMap: Record<string, FinanceTabKey> = {
  'sales-invoices': 'salesInvoices',
  'purchase-invoices': 'purchaseInvoices',
  receivables: 'receivables',
  payables: 'payables',
};
const pageRouteMap: Record<FinanceTabKey, string> = {
  salesInvoices: 'sales-invoices',
  purchaseInvoices: 'purchase-invoices',
  receivables: 'receivables',
  payables: 'payables',
};
const searchPlaceholders: Record<FinanceTabKey, string> = {
  salesInvoices: '搜索发票号、销售订单、客户或收款进度',
  purchaseInvoices: '搜索发票号、采购来源、供应商或付款进度',
  receivables: '搜索应收单、客户、来源发票或未收金额',
  payables: '搜索应付单、供应商、来源发票或未付金额',
};

const filtersByPage = ref<Record<FinanceTabKey, BusinessFilters>>({
  salesInvoices: emptyFilters(), purchaseInvoices: emptyFilters(), receivables: emptyFilters(), payables: emptyFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyFilters());
const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('status');
const onlyUnsettled = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const hoveredFinanceCode = ref('');
const isListLoading = ref(true);
const listLoadError = ref('');
const apiRows = ref<Record<FinanceTabKey, FinanceRecord[]>>({ salesInvoices: [], purchaseInvoices: [], receivables: [], payables: [] });
let toastTimer: number | undefined;

const activePage = computed<FinanceTabKey>(() => routePageMap[route.params.page?.toString() || ''] || 'salesInvoices');
const pageTitle = computed(() => pageTitles[activePage.value]);
const pageRoute = computed(() => pageRouteMap[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value] || '');
const createButtonPath = computed(() => createButtonLabel.value ? `/finance/${pageRoute.value}/new` : '');
const searchPlaceholder = computed(() => searchPlaceholders[activePage.value]);
const currentFilters = computed(() => filtersByPage.value[activePage.value]);
const filterStatus = computed(() => currentFilters.value.status);
const filterParty = computed(() => currentFilters.value.party);
const filterOwner = computed(() => currentFilters.value.owner);
const filterDateStart = computed(() => currentFilters.value.dateStart);
const filterDateEnd = computed(() => currentFilters.value.dateEnd);
const draftFilterStatus = computed({ get: () => draftFilters.value.status, set: (status: string) => { draftFilters.value = { ...draftFilters.value, status }; } });
const draftFilterParty = computed({ get: () => draftFilters.value.party, set: (party: string) => { draftFilters.value = { ...draftFilters.value, party }; } });
const draftFilterOwner = computed({ get: () => draftFilters.value.owner, set: (owner: string) => { draftFilters.value = { ...draftFilters.value, owner }; } });
const draftFilterDateStart = computed({ get: () => draftFilters.value.dateStart, set: (dateStart: string) => { draftFilters.value = { ...draftFilters.value, dateStart }; } });
const draftFilterDateEnd = computed({ get: () => draftFilters.value.dateEnd, set: (dateEnd: string) => { draftFilters.value = { ...draftFilters.value, dateEnd }; } });
const financeOperationPermissionHint = computed(() => !canSettleFinance.value ? financeSettleReadonlyReason.value : '');
const showFinanceOperationPermissionHint = computed(() => Boolean(financeOperationPermissionHint.value));
const financeOperationPermissionSuffix = '确认发票、登记收付款、红冲和退款等动作会保持不可用，列表仍可查询。';

const filterLabels = computed(() => ({
  status: activePage.value === 'salesInvoices' ? '开票状态' : activePage.value === 'purchaseInvoices' ? '收票状态' : '单据状态',
  party: ['salesInvoices', 'receivables'].includes(activePage.value) ? '客户' : '供应商',
  owner: '经办人',
  date: activePage.value === 'salesInvoices' ? '开票日期' : activePage.value === 'purchaseInvoices' ? '收票日期' : activePage.value === 'receivables' ? '应收日期' : '应付日期',
}));
const sourceHeader = computed(() => activePage.value === 'salesInvoices' ? '销售订单' : activePage.value === 'purchaseInvoices' ? '采购来源' : activePage.value === 'receivables' ? '销售发票' : '采购发票');
const amountHeader = computed(() => activePage.value === 'receivables' ? '应收金额' : activePage.value === 'payables' ? '应付金额' : '价税合计');
const settledHeader = computed(() => ['salesInvoices', 'receivables'].includes(activePage.value) ? '已收' : '已付');
const outstandingHeader = computed(() => ['salesInvoices', 'receivables'].includes(activePage.value) ? '未收 / 待退' : '未付');

const listRows = computed<FinanceListRow[]>(() => apiRows.value[activePage.value].map((record) => {
  const adjustment = Math.max(0, Number(record.afterSalesAdjustmentAmount || 0));
  const total = Math.max(0, parseMoney(record.totalAmount) - adjustment);
  const settled = Math.min(total, parseMoney(record.settledAmount));
  const reversed = isReversed(record.documentStatus || record.status);
  const isRefundPending = reversed && record.refundStatus === '待退款';
  const outstanding = reversed ? 0 : Math.max(0, total - settled);
  const outstandingAmount = isRefundPending
    ? `待退 ${formatMoney(settled)}`
    : reversed
      ? '已冲销'
      : formatMoney(outstanding);
  const lifecycleStatus = financeLifecycleStatus(activePage.value, record);
  const settlementStatus = financeSettlementStatus(activePage.value, record, total, settled);
  const attentionStatus = activePage.value === 'payables' && record.holdStatus === '已暂缓' ? '付款暂缓' : '正常';
  return {
    page: activePage.value,
    code: record.code,
    sourceDoc: record.sourceDoc,
    party: record.party,
    contact: record.contact,
    amount: formatMoney(total),
    settledAmount: formatMoney(settled),
    adjustmentText: adjustment > 0 ? ` · 售后调减 ${formatMoney(adjustment)}` : '',
    outstandingAmount,
    amountValue: total,
    outstandingValue: outstanding,
    needsSettlementAction: isRefundPending || outstanding > 0.01,
    isRefundPending,
    lifecycleStatus,
    settlementStatus,
    attentionStatus,
    owner: record.owner,
    date: record.date,
    dueDate: record.dueDate,
    invoiceType: record.invoiceType,
    nextStep: financeNextStep(activePage.value, record, outstanding),
    searchValues: [record.code, record.sourceDoc, record.sourceOrder, record.party, record.contact, record.totalAmount, record.settledAmount, record.afterSalesAdjustmentAmount, record.owner, lifecycleStatus, settlementStatus, attentionStatus, record.holdReason, record.invoiceType, record.note],
  };
}));

const filterStatusOptions = computed(() => uniqueValues(listRows.value.map((row) => row.lifecycleStatus)));
const filterPartyOptions = computed(() => uniqueValues(listRows.value.map((row) => row.party)));
const filterOwnerOptions = computed(() => uniqueValues(listRows.value.map((row) => row.owner)));
const filterFields = computed<FinanceFilterField[]>(() => [
  { key: 'status', label: filterLabels.value.status, options: filterStatusOptions.value },
  { key: 'party', label: filterLabels.value.party, options: filterPartyOptions.value },
  { key: 'owner', label: filterLabels.value.owner, options: filterOwnerOptions.value },
]);
const activeFilterCount = computed(() => [filterStatus.value, filterParty.value, filterOwner.value, filterDateStart.value, filterDateEnd.value].filter(Boolean).length);
const visibleRows = computed(() => sortRows(listRows.value.filter((row) => {
  const keyword = normalize(searchKeyword.value);
  return (!keyword || row.searchValues.some((value) => normalize(value).includes(keyword)))
    && (!filterStatus.value || row.lifecycleStatus === filterStatus.value)
    && (!filterParty.value || row.party === filterParty.value)
    && (!filterOwner.value || row.owner === filterOwner.value)
    && (!filterDateStart.value || row.date >= filterDateStart.value)
    && (!filterDateEnd.value || row.date <= filterDateEnd.value)
    && (!onlyUnsettled.value || row.needsSettlementAction);
})));

function emptyFilters(): BusinessFilters { return { status: '', party: '', owner: '', dateStart: '', dateEnd: '' }; }
function normalize(value: unknown) { return String(value ?? '').trim().toLowerCase(); }
function parseMoney(value: string) { return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0; }
function formatMoney(value: number) { return `￥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function uniqueValues(values: string[]) { return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')); }
function isReversed(status: string) { return ['已红冲', '已冲销', '红冲'].includes(status); }

function financeLifecycleStatus(page: FinanceTabKey, record: FinanceRecord) {
  if (page === 'salesInvoices') return record.documentStatus || (isReversed(record.status) ? '已红冲' : record.status === '待开票' ? '待开票' : '已开票');
  if (page === 'purchaseInvoices') return record.documentStatus || (isReversed(record.status) ? '已冲销' : record.status === '待收票' ? '待收票' : '已收票');
  if (isReversed(record.status)) return '已冲销';
  const total = Math.max(0, parseMoney(record.totalAmount) - Number(record.afterSalesAdjustmentAmount || 0));
  const settled = parseMoney(record.settledAmount);
  return settled + 0.01 >= total ? '已结清' : '执行中';
}

function financeSettlementStatus(page: FinanceTabKey, record: FinanceRecord, total: number, settled: number) {
  if (isReversed(record.documentStatus || record.status)) {
    if (record.refundStatus === '待退款') return '待退款';
    if (record.refundStatus === '已退款') return '已退款';
    return '已冲销';
  }
  if (record.settlementStatus) return record.settlementStatus;
  const receiptSide = page === 'salesInvoices' || page === 'receivables';
  if (settled <= 0) return receiptSide ? '未收款' : '未付款';
  if (settled + 0.01 >= total) return receiptSide ? '已收款' : '已付款';
  return receiptSide ? '部分收款' : '部分付款';
}

function financeNextStep(page: FinanceTabKey, record: FinanceRecord, outstanding: number) {
  if (isReversed(record.documentStatus || record.status)) {
    if (record.refundStatus === '待退款') return '处理待退款';
    if (record.refundStatus === '已退款') return '退款已完成';
    return page === 'salesInvoices' ? '红冲链已完成' : '查看冲销依据';
  }
  if (page === 'salesInvoices') return record.status === '待开票' ? '核对来源行并确认开票' : outstanding > 0 ? `应收待收 ${formatMoney(outstanding)}` : '收款已完成';
  if (page === 'purchaseInvoices') return record.status === '待收票'
    ? '完成三单匹配并确认收票'
    : outstanding > 0 ? `应付待付 ${formatMoney(outstanding)}` : '付款已完成';
  if (page === 'payables' && record.holdStatus === '已暂缓') return '先处理暂缓原因';
  if (outstanding <= 0) return page === 'receivables' ? '收款已完成' : '付款已完成';
  if (record.status === '部分收款') return `继续收款 ${formatMoney(outstanding)}`;
  if (record.status === '部分付款') return `继续付款 ${formatMoney(outstanding)}`;
  return `${page === 'receivables' ? '登记收款' : '登记付款'} ${formatMoney(outstanding)}`;
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function sortRows(rows: FinanceListRow[]) {
  const statusRank: Record<string, number> = { 待开票: 1, 待收票: 1, 执行中: 2, 待收款: 2, 待付款: 2, 部分收款: 3, 部分付款: 3, 暂缓付款: 4, 已开票: 5, 已收票: 5, 已收款: 8, 已付款: 8, 已结清: 9, 已核销: 9, 已红冲: 10, 已冲销: 10 };
  return [...rows].sort((a, b) => {
    if (sortMode.value === 'oldest') return a.date.localeCompare(b.date);
    if (sortMode.value === 'amountDesc') return b.amountValue - a.amountValue;
    if (sortMode.value === 'status') return (statusRank[a.lifecycleStatus] ?? 99) - (statusRank[b.lifecycleStatus] ?? 99) || b.outstandingValue - a.outstandingValue;
    return b.date.localeCompare(a.date);
  });
}

async function loadFinanceData() {
  isListLoading.value = true;
  listLoadError.value = '';
  try {
    const [salesInvoices, purchaseInvoices, receivables, payables] = await Promise.all([
      listFinanceRecords('sales-invoices'), listFinanceRecords('purchase-invoices'), listFinanceRecords('receivables'), listFinanceRecords('payables'),
    ]);
    apiRows.value = { salesInvoices, purchaseInvoices, receivables, payables };
  } catch (error) {
    apiRows.value = { salesInvoices: [], purchaseInvoices: [], receivables: [], payables: [] };
    listLoadError.value = error instanceof Error ? error.message : '财务列表加载失败';
    showToast(listLoadError.value, 'error');
  } finally {
    isListLoading.value = false;
  }
}

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  const open = openToolbarMenu.value !== menu;
  openToolbarMenu.value = open ? menu : null;
  if (menu === 'filter' && open) draftFilters.value = { ...currentFilters.value };
}
function setSortMode(mode: SortMode) { sortMode.value = mode; openToolbarMenu.value = null; }
function resetBusinessFilters() { filtersByPage.value = { ...filtersByPage.value, [activePage.value]: emptyFilters() }; draftFilters.value = emptyFilters(); showToast('已清空筛选条件'); }
function clearListConstraints() {
  searchKeyword.value = '';
  onlyUnsettled.value = false;
  resetBusinessFilters();
}
function applyAndCloseFilters() { filtersByPage.value = { ...filtersByPage.value, [activePage.value]: { ...draftFilters.value } }; openToolbarMenu.value = null; showToast('已应用筛选条件'); }
function focusPendingSettlement() {
  onlyUnsettled.value = !onlyUnsettled.value;
  filtersByPage.value = { ...filtersByPage.value, [activePage.value]: emptyFilters() };
  draftFilters.value = emptyFilters();
  searchKeyword.value = '';
  showToast(onlyUnsettled.value ? '已只显示未结清账款' : '已显示全部账款');
}

function csvCell(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function exportVisibleRows() {
  if (!visibleRows.value.length) return showToast('当前没有可导出的数据');
  const rows = [
    ['单号', sourceHeader.value, filterLabels.value.party, amountHeader.value, settledHeader.value, outstandingHeader.value, filterLabels.value.status, '收付款进度', '经办人', '到期日期'],
    ...visibleRows.value.map((row) => [row.code, row.sourceDoc, row.party, row.amount, row.settledAmount, row.outstandingAmount, row.lifecycleStatus, row.settlementStatus, row.owner, row.dueDate]),
  ];
  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  openToolbarMenu.value = null;
  showToast('已导出当前列表');
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastMessage.value = ''; }, 2200);
}
function closeMenus() { openToolbarMenu.value = null; }

watch(activePage, () => { searchKeyword.value = ''; sortMode.value = 'status'; onlyUnsettled.value = false; draftFilters.value = { ...currentFilters.value }; openToolbarMenu.value = null; });
onMounted(() => { document.addEventListener('click', closeMenus); void loadFinanceData(); });
onBeforeUnmount(() => { document.removeEventListener('click', closeMenus); window.clearTimeout(toastTimer); });
</script>

<template>
  <div class="page-stack">
    <section class="list-page">
      <div class="quote-page finance-page">
        <PageTopbarPortal>
          <template #actions>
            <RouterLink v-if="createButtonPath && canWriteFinance" class="primary-action" :to="createButtonPath" :title="`新建${pageTitle}`">
              <Plus :size="15" />{{ createButtonLabel }}
            </RouterLink>
            <button v-else-if="createButtonPath" class="primary-action" type="button" disabled :title="financeReadonlyReason">
              <Plus :size="15" />{{ createButtonLabel }}
            </button>
            <button
              v-else
              class="secondary-action"
              :class="{ 'is-active': onlyUnsettled }"
              type="button"
              :title="onlyUnsettled ? '恢复显示全部账款' : '只显示仍有未收或未付金额的账款'"
              @click="focusPendingSettlement"
            >
              <ListFilter :size="15" />{{ onlyUnsettled ? '查看全部' : '只看未结清' }}
            </button>
          </template>
        </PageTopbarPortal>

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
          sort-amount-label="金额从高到低"
          :show-status-sort="true"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterLabels.date"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="exportVisibleRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <OperationPermissionBanner v-if="showFinanceOperationPermissionHint" :message="financeOperationPermissionHint" :suffix="financeOperationPermissionSuffix" />

        <ListLoadState v-if="isListLoading || listLoadError" :loading="isListLoading" :title="pageTitle" :message="listLoadError" @retry="loadFinanceData" />

        <div v-else class="quote-table-shell finance-list-shell with-status-column">
          <div class="quote-data-scroll">
            <div class="data-table quote-table finance-table finance-fact-table">
              <div class="table-row table-head">
                <span>单据 / {{ sourceHeader }}</span><span>{{ filterLabels.party }}</span><span>{{ amountHeader }} / {{ settledHeader }}</span><span>{{ outstandingHeader }}</span><span>{{ filterLabels.owner }} / 到期</span>
              </div>
              <RouterLink
                v-for="row in visibleRows"
                :key="row.code"
                class="table-row order-list-row finance-list-row is-clickable"
                :class="{ 'is-row-highlighted': hoveredFinanceCode === row.code }"
                :to="`/finance/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`"
                :aria-label="`打开${pageTitles[row.page]} ${row.code}`"
                :title="`打开${pageTitles[row.page]} ${row.code}`"
                @pointerenter="hoveredFinanceCode = row.code"
                @pointerleave="hoveredFinanceCode = ''"
                @mouseenter="hoveredFinanceCode = row.code"
                @mouseleave="hoveredFinanceCode = ''"
                @focus="hoveredFinanceCode = row.code"
                @blur="hoveredFinanceCode = ''"
              >
                <span class="product-summary" :title="`${row.sourceDoc || '-'} · ${row.invoiceType}`"><strong class="quote-code">{{ row.code }}</strong><small :title="`${row.sourceDoc || '-'} · ${row.invoiceType}`">{{ row.sourceDoc || '-' }} · {{ row.invoiceType }}</small></span>
                <span class="party-cell" :title="`${row.party} · ${row.contact || '-'}`"><strong>{{ row.party }}</strong><small :title="row.contact || '-'">{{ row.contact || '-' }}</small></span>
                <span class="product-summary amount-cell"><strong>{{ row.amount }}</strong><small>{{ settledHeader }} {{ row.settledAmount }}{{ row.adjustmentText }}</small></span>
                <span :class="{ 'finance-outstanding-amount': row.outstandingValue > 0, 'finance-refund-pending-amount': row.isRefundPending }">{{ row.outstandingAmount }}</span>
                <span class="product-summary"><strong>{{ row.owner }}</strong><small>{{ row.dueDate || '-' }}</small></span>
              </RouterLink>
            </div>
          </div>

          <div class="quote-status-column finance-status-column">
            <div class="quote-status-head finance-status-head">
              <strong>单据状态</strong>
              <small>结算 · 下一步</small>
            </div>
            <RouterLink
              v-for="row in visibleRows"
              :key="`${row.code}-status`"
              class="quote-status-cell order-status-link finance-status-cell"
              :class="{ 'is-row-highlighted': hoveredFinanceCode === row.code }"
              :to="`/finance/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`"
              :aria-label="`打开${pageTitles[row.page]} ${row.code} 状态`"
              :title="`打开${pageTitles[row.page]} ${row.code}：${row.lifecycleStatus}；结算${row.settlementStatus}；异常/暂停${row.attentionStatus}；下一步${row.nextStep}`"
              @pointerenter="hoveredFinanceCode = row.code"
              @pointerleave="hoveredFinanceCode = ''"
              @mouseenter="hoveredFinanceCode = row.code"
              @mouseleave="hoveredFinanceCode = ''"
              @focus="hoveredFinanceCode = row.code"
              @blur="hoveredFinanceCode = ''"
            >
              <i class="mini-status" :class="statusClass(row.lifecycleStatus)">{{ row.lifecycleStatus }}</i>
              <span class="finance-status-facts">
                <small><b>结算</b><span>{{ row.settlementStatus }}</span></small>
                <small><b>下一步</b><span>{{ row.nextStep }}</span></small>
              </span>
            </RouterLink>
          </div>
        </div>

        <div v-if="!isListLoading && !listLoadError && visibleRows.length === 0" class="list-empty-state">
          <strong>暂无{{ pageTitle }}</strong>
          <span>可以调整筛选条件，或等待上游业务生成财务任务。</span>
          <button class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">清空条件</button>
        </div>

        <div v-if="!isListLoading && !listLoadError" class="quote-card-list">
          <RouterLink
            v-for="row in visibleRows"
            :key="`${row.code}-card`"
            class="quote-card"
            :to="`/finance/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`"
            :aria-label="`打开${pageTitles[row.page]} ${row.code}`"
            :title="`打开${pageTitles[row.page]} ${row.code}`"
          >
            <div class="quote-card-head"><div><strong>{{ row.party }}</strong><span>{{ row.code }} · {{ row.sourceDoc }}</span></div><i class="mini-status" :class="statusClass(row.lifecycleStatus)">{{ row.lifecycleStatus }}</i></div>
            <div class="quote-card-main"><span>{{ row.settlementStatus }}</span><strong>{{ row.amount }}</strong></div>
            <div class="quote-card-meta"><span>{{ outstandingHeader }} {{ row.outstandingAmount }}</span><span v-if="row.adjustmentText">售后调减 {{ row.adjustmentText.replace(' · 售后调减 ', '') }}</span><span>{{ row.owner }}</span><span>到期 {{ row.dueDate || '-' }}</span><span v-if="row.attentionStatus !== '正常'">异常/暂停 · {{ row.attentionStatus }}</span><span>下一步 · {{ row.nextStep }}</span></div>
          </RouterLink>
        </div>

        <div v-if="!isListLoading && !listLoadError" class="table-footer">
          <span>显示 {{ visibleRows.length ? 1 : 0 }}-{{ visibleRows.length }} / 共 {{ visibleRows.length }} 条</span>
          <div class="pager">
            <button type="button" disabled title="已经是第一页">上一页</button>
            <strong title="当前第 1 页">1</strong>
            <button type="button" disabled title="已经是最后一页">下一页</button>
          </div>
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
    >{{ toastMessage }}</div>
  </div>
</template>
