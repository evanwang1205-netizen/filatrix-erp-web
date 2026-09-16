<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { Download, Link2, Plus, RefreshCcw, ShieldCheck, Upload } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import { ecommerceRowsByPage, type EcommerceRecord, type EcommerceTabKey } from '../data/ecommerce';

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';

type BusinessFilters = {
  status: string;
  party: string;
  owner: string;
  dateStart: string;
  dateEnd: string;
};

type EcommerceFilterField = {
  key: FilterFieldKey;
  label: string;
  options: string[];
};

type EcommerceListRow = EcommerceRecord & {
  page: EcommerceTabKey;
  amountValue: number;
  searchValues: unknown[];
};

const route = useRoute();

const pageTitles: Record<EcommerceTabKey, string> = {
  workbench: '电商工作台',
  stores: '店铺管理',
  skuMappings: 'SKU 映射',
  orders: '电商订单',
  inventorySync: '库存导出',
  shipments: '发货导出',
  afterSales: '售后导入',
  settlements: '平台对账',
};

const pageDescriptions: Record<EcommerceTabKey, string> = {
  workbench: '聚合订单导入、库存导出、发货导出、售后导入和对账待办。',
  stores: '维护平台店铺、渠道客户和手工导入范围。',
  skuMappings: '把平台商品规格映射到 ERP 成品 SKU。',
  orders: '导入平台订单文件，并关联 ERP 销售订单和库存预留。',
  inventorySync: '按 ERP 合格成品可售数导出平台库存表。',
  shipments: '仓库销售出库后导出平台发货回填表。',
  afterSales: '导入退款、退货、补发和退货质检状态。',
  settlements: '导入平台账单，核对佣金、退款和实际到账。',
};

const createButtonLabels: Record<EcommerceTabKey, string> = {
  workbench: '刷新列表',
  stores: '新增店铺',
  skuMappings: '新增映射',
  orders: '导入订单',
  inventorySync: '导出库存表',
  shipments: '导出发货表',
  afterSales: '导入售后',
  settlements: '导入账单',
};

const searchPlaceholders: Record<EcommerceTabKey, string> = {
  workbench: '搜索待办、平台单号、SKU、ERP 单据、责任人',
  stores: '搜索店铺、平台、渠道客户、负责人',
  skuMappings: '搜索平台 SKU、ERP 成品、商品 ID、安全库存',
  orders: '搜索导入批次、平台订单、ERP 销售订单、买家备注、商品、状态',
  inventorySync: '搜索库存导出记录、平台 SKU、ERP 成品、差异状态',
  shipments: '搜索发货导出、物流单号、销售出库单、平台订单',
  afterSales: '搜索售后导入、退款单、退货质检、补发和处置状态',
  settlements: '搜索账单导入、到账、退款、佣金、差异和财务单据',
};

const routePageMap: Record<string, EcommerceTabKey> = {
  workbench: 'workbench',
  stores: 'stores',
  'sku-mapping': 'skuMappings',
  orders: 'orders',
  'inventory-sync': 'inventorySync',
  shipments: 'shipments',
  'after-sales': 'afterSales',
  settlements: 'settlements',
};

const filtersByPage = ref<Record<EcommerceTabKey, BusinessFilters>>({
  workbench: emptyBusinessFilters(),
  stores: emptyBusinessFilters(),
  skuMappings: emptyBusinessFilters(),
  orders: emptyBusinessFilters(),
  inventorySync: emptyBusinessFilters(),
  shipments: emptyBusinessFilters(),
  afterSales: emptyBusinessFilters(),
  settlements: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());
const importFileInput = ref<HTMLInputElement | null>(null);
const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('newest');
const toastMessage = ref('');
let toastTimer: number | undefined;

const activePage = computed<EcommerceTabKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'workbench';
});
const pageTitle = computed(() => pageTitles[activePage.value]);
const pageDescription = computed(() => pageDescriptions[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value]);
const searchPlaceholder = computed(() => searchPlaceholders[activePage.value]);
const currentFilters = computed(() => filtersByPage.value[activePage.value]);

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
  const options: Record<EcommerceTabKey, { status: string; party: string; owner: string; date: string }> = {
    workbench: { status: '状态', party: '店铺', owner: '负责人', date: '发生日期' },
    stores: { status: '建档状态', party: '平台', owner: '负责人', date: '建档日期' },
    skuMappings: { status: '映射状态', party: '店铺', owner: '维护人', date: '维护日期' },
    orders: { status: '订单状态', party: '店铺', owner: '跟单人', date: '下单日期' },
    inventorySync: { status: '导出状态', party: '店铺', owner: '负责人', date: '导出日期' },
    shipments: { status: '导出状态', party: '店铺', owner: '仓库经办', date: '发货日期' },
    afterSales: { status: '售后状态', party: '店铺', owner: '售后负责人', date: '申请日期' },
    settlements: { status: '对账状态', party: '店铺', owner: '财务负责人', date: '账单日期' },
  };
  return options[activePage.value];
});
const filterDateLabel = computed(() => filterLabels.value.date);
const sortAmountLabel = computed(() => (activePage.value === 'inventorySync' ? '差异/数量从高到低' : '金额/数量从高到低'));
const showStatusSort = computed(() => true);
const importActionPages: EcommerceTabKey[] = ['orders', 'afterSales', 'settlements'];
const exportActionPages: EcommerceTabKey[] = ['inventorySync', 'shipments'];

const allRows = computed(() => ecommerceRowsByPage[activePage.value]);
const listRows = computed<EcommerceListRow[]>(() =>
  allRows.value.map((row) => ({
    ...row,
    page: activePage.value,
    amountValue: parseAmount(row.amount) || parseAmount(row.qty),
    searchValues: [
      row.code,
      row.title,
      row.platform,
      row.store,
      row.platformNo,
      row.erpDoc,
      row.product,
      row.sku,
      row.qty,
      row.amount,
      row.status,
      row.owner,
      row.nextAction,
      row.note,
      ...row.tags,
    ],
  })),
);

const filterStatusOptions = computed(() => uniqueValues(listRows.value.map((row) => row.status)));
const filterPartyOptions = computed(() => uniqueValues(listRows.value.map((row) => row.store || row.platform)));
const filterOwnerOptions = computed(() => uniqueValues(listRows.value.map((row) => row.owner)));
const filterFields = computed<EcommerceFilterField[]>(() => [
  { key: 'status', label: filterLabels.value.status, options: filterStatusOptions.value },
  { key: 'party', label: filterLabels.value.party, options: filterPartyOptions.value },
  { key: 'owner', label: filterLabels.value.owner, options: filterOwnerOptions.value },
]);
const activeFilterCount = computed(() =>
  [
    filterStatus.value,
    filterParty.value,
    filterOwner.value,
    filterDateStart.value,
    filterDateEnd.value,
  ].filter(Boolean).length,
);
const hasListConstraints = computed(() => Boolean(normalized(searchKeyword.value)) || activeFilterCount.value > 0);

const visibleRows = computed(() => {
  const filtered = listRows.value.filter((row) => {
    const matchesSearch = includesKeyword(row.searchValues);
    const matchesStatus = !filterStatus.value || row.status === filterStatus.value;
    const matchesParty = !filterParty.value || row.store === filterParty.value || row.platform === filterParty.value;
    const matchesOwner = !filterOwner.value || row.owner === filterOwner.value;
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
  });
  return sortRows(filtered);
});

const emptyTitle = computed(() => (hasListConstraints.value ? `未找到匹配${pageTitle.value}` : `暂无${pageTitle.value}`));
const emptyDescription = computed(() =>
  hasListConstraints.value
    ? '可以调整搜索、排序或筛选条件后再查看。'
    : '导入平台订单、售后或账单文件后会显示在这里。',
);

function emptyBusinessFilters(): BusinessFilters {
  return { status: '', party: '', owner: '', dateStart: '', dateEnd: '' };
}

function updateCurrentFilters(filters: BusinessFilters) {
  filtersByPage.value = {
    ...filtersByPage.value,
    [activePage.value]: { ...filters },
  };
}

function updateDraftFilters(patch: Partial<BusinessFilters>) {
  draftFilters.value = { ...draftFilters.value, ...patch };
}

function syncDraftFilters() {
  draftFilters.value = { ...currentFilters.value };
}

function normalized(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function includesKeyword(values: unknown[]) {
  const keyword = normalized(searchKeyword.value);
  if (!keyword) return true;
  return values.some((value) => normalized(value).includes(keyword));
}

function matchesDateRange(date: string) {
  const value = date.slice(0, 10);
  return (!filterDateStart.value || value >= filterDateStart.value) && (!filterDateEnd.value || value <= filterDateEnd.value);
}

function parseAmount(value: string) {
  return Number(value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

function sortRows(rows: EcommerceListRow[]) {
  const statusRank: Record<string, number> = {
    待生成销售订单: 1,
    待仓库发货: 2,
    待导出: 3,
    待回填平台: 4,
    待售后处理: 5,
    待复核: 6,
    差异待处理: 7,
    待匹配: 8,
    待建档: 9,
    已导入: 20,
    已导出: 21,
    已回填平台: 22,
    已对账: 23,
    已关闭: 24,
    已建档: 25,
    已匹配: 26,
  };
  return [...rows].sort((a, b) => {
    if (sortMode.value === 'oldest') return a.date.localeCompare(b.date);
    if (sortMode.value === 'amountDesc') return b.amountValue - a.amountValue;
    if (sortMode.value === 'status') return (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
    return b.date.localeCompare(a.date);
  });
}

function statusClass(status: string) {
  if (['待复核', '差异待处理', '导入异常', '待售后处理'].includes(status)) return 'status-void';
  if (['待生成销售订单', '待仓库发货', '待导出', '待回填平台', '待匹配', '待建档'].includes(status)) return 'status-pending';
  if (['已导入', '已导出', '已回填平台', '已对账', '已建档', '已匹配'].includes(status)) return 'status-done';
  if (status === '已关闭') return 'status-confirmed';
  return 'status-neutral';
}

function rowNextAction(row: EcommerceListRow) {
  if (['已导入', '已导出', '已回填平台', '已对账', '已关闭', '已建档', '已匹配'].includes(row.status)) return '下一步：已完成';
  return `下一步：${row.nextAction}`;
}

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  const shouldOpen = openToolbarMenu.value !== menu;
  openToolbarMenu.value = shouldOpen ? menu : null;
  if (menu === 'filter' && shouldOpen) syncDraftFilters();
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode;
  openToolbarMenu.value = null;
}

function resetBusinessFilters() {
  const emptyFilters = emptyBusinessFilters();
  updateCurrentFilters(emptyFilters);
  draftFilters.value = { ...emptyFilters };
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

function runPrimaryAction() {
  if (importActionPages.includes(activePage.value)) {
    importFileInput.value?.click();
    return;
  }
  if (exportActionPages.includes(activePage.value)) {
    exportVisibleRows(`${pageTitle.value}.csv`, activePage.value === 'inventorySync' ? '已导出平台库存表' : '已导出平台发货回填表');
    return;
  }
  const actionMap: Record<EcommerceTabKey, string> = {
    workbench: '已刷新电商人工处理列表',
    stores: '新增店铺后可维护渠道客户和文件导入范围',
    skuMappings: '新增映射后可用于订单导入校验和库存表导出',
    orders: '请选择平台后台导出的订单文件',
    inventorySync: '已导出平台库存表',
    shipments: '已导出平台发货回填表',
    afterSales: '请选择平台后台导出的售后文件',
    settlements: '请选择平台后台导出的账单文件',
  };
  showToast(actionMap[activePage.value]);
}

function importActionLabel() {
  const labels: Record<EcommerceTabKey, string> = {
    workbench: '待办',
    stores: '店铺',
    skuMappings: 'SKU 映射',
    orders: '订单',
    inventorySync: '库存',
    shipments: '发货',
    afterSales: '售后',
    settlements: '账单',
  };
  return labels[activePage.value];
}

function handleImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  showToast(`已选择${importActionLabel()}文件：${file.name}，请核对导入校验结果`);
  input.value = '';
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportVisibleRows(fileName = `${pageTitle.value}.csv`, successMessage = '已导出当前列表') {
  if (!visibleRows.value.length) {
    showToast('当前没有可导出的数据');
    openToolbarMenu.value = null;
    return;
  }
  const rows = [
    ['编号', '标题', '平台', '店铺', '平台单号/SKU', 'ERP 关联', '商品', '数量', '金额', '状态', '负责人', '日期', '下一步'],
    ...visibleRows.value.map((row) => [
      row.code,
      row.title,
      row.platform,
      row.store,
      row.platformNo,
      row.erpDoc,
      row.product,
      row.qty,
      row.amount,
      row.status,
      row.owner,
      row.date,
      row.nextAction,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  openToolbarMenu.value = null;
  showToast(successMessage);
}

function showToast(message: string) {
  toastMessage.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}
</script>

<template>
  <div class="page-stack ecommerce-page">
    <section class="quote-list">
      <div class="table-title quote-title">
        <div>
          <span>电商渠道</span>
          <h1>{{ pageTitle }}</h1>
          <p>{{ pageDescription }}</p>
        </div>
        <div class="title-actions">
          <button class="secondary-action" type="button" title="查看电商与 ERP 的联动口径" @click="showToast('电商模块负责渠道对接；销售、仓库、质检和财务负责 ERP 履约。')">
            <Link2 :size="15" />
            联动说明
          </button>
          <button class="primary-action" type="button" :title="createButtonLabel" @click="runPrimaryAction">
            <Plus v-if="activePage === 'stores' || activePage === 'skuMappings'" :size="15" />
            <Upload v-else-if="importActionPages.includes(activePage)" :size="15" />
            <Download v-else-if="exportActionPages.includes(activePage)" :size="15" />
            <RefreshCcw v-else :size="15" />
            {{ createButtonLabel }}
          </button>
          <input
            ref="importFileInput"
            class="ecommerce-import-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            @change="handleImportFileChange"
          />
        </div>
      </div>

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
        @export-rows="exportVisibleRows"
        @clear-filters="resetBusinessFilters"
        @apply-filters="applyAndCloseFilters"
      />

      <div class="quote-table-shell ecommerce-list-shell with-status-column">
        <div class="quote-data-scroll">
          <div class="data-table quote-table ecommerce-table">
            <div class="table-row table-head">
              <span>记录编号</span>
              <span>平台/来源</span>
              <span>{{ filterLabels.party }}</span>
              <span>商品/SKU</span>
              <span>数量/金额</span>
              <span>{{ filterLabels.owner }}</span>
              <span>{{ filterDateLabel }}</span>
            </div>
            <div
              v-for="row in visibleRows"
              :key="row.code"
              class="table-row ecommerce-list-row order-list-row"
            >
              <span class="quote-code">
                <strong>{{ row.code }}</strong>
                <small>{{ row.title }}</small>
              </span>
              <span class="product-summary">
                <strong>{{ row.platform }}</strong>
                <small>{{ row.platformNo }}</small>
              </span>
              <span class="party-cell">
                <strong>{{ row.store }}</strong>
                <RouterLink
                  v-if="activePage === 'afterSales' && row.erpDoc"
                  class="fact-link"
                  :to="`/sales/after-sales/${encodeURIComponent(row.erpDoc)}`"
                >{{ row.erpDoc }}</RouterLink>
                <small v-else>{{ row.erpDoc }}</small>
              </span>
              <span class="product-summary">
                <strong>{{ row.product }}</strong>
                <small>{{ row.sku }}</small>
              </span>
              <span class="product-summary">
                <strong>{{ row.qty }}</strong>
                <small>{{ row.amount }}</small>
              </span>
              <span>{{ row.owner }}</span>
              <span>{{ row.date }}</span>
            </div>
          </div>
        </div>

        <div class="quote-status-column">
          <div class="quote-status-head">渠道状态</div>
          <div
            v-for="row in visibleRows"
            :key="`${row.code}-status`"
            class="quote-status-cell ecommerce-status-cell"
            :title="rowNextAction(row)"
          >
            <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
            <small>{{ rowNextAction(row) }}</small>
          </div>
        </div>
      </div>

      <div v-if="visibleRows.length === 0" class="list-empty-state">
        <strong>{{ emptyTitle }}</strong>
        <span>{{ emptyDescription }}</span>
        <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
          清空条件
        </button>
      </div>

      <div class="quote-card-list">
        <article v-for="row in visibleRows" :key="`${row.code}-card`" class="quote-card">
          <div class="quote-card-head">
            <div>
              <strong>{{ row.store }}</strong>
              <span>{{ row.code }} · {{ row.platform }}</span>
            </div>
            <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
          </div>
          <div class="quote-card-main quote-card-products">
            <div>
              <span>{{ row.product }} <small>{{ row.sku }}</small></span>
            </div>
            <strong>{{ row.amount }}</strong>
          </div>
          <div class="quote-card-meta">
            <span>{{ row.platformNo }}</span>
            <RouterLink
              v-if="activePage === 'afterSales' && row.erpDoc"
              class="fact-link"
              :to="`/sales/after-sales/${encodeURIComponent(row.erpDoc)}`"
            >销售售后 {{ row.erpDoc }}</RouterLink>
            <span>{{ row.qty }}</span>
            <span>{{ rowNextAction(row) }}</span>
            <span>{{ filterLabels.owner }} {{ row.owner }}</span>
          </div>
        </article>
      </div>

      <div class="table-footer">
        <span>显示 {{ visibleRows.length ? 1 : 0 }}-{{ visibleRows.length }} / 共 {{ visibleRows.length }} 条</span>
        <div class="pager">
          <button type="button" disabled title="已经是第一页">上一页</button>
          <strong>1</strong>
          <button type="button" disabled title="已经是最后一页">下一页</button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="toastMessage" class="global-toast success-toast">
        <ShieldCheck :size="16" />
        {{ toastMessage }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ecommerce-page {
  min-width: 0;
}

.ecommerce-list-shell {
  min-width: 0;
}

.ecommerce-import-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.ecommerce-table {
  min-width: 920px;
}

.ecommerce-table .table-row {
  grid-template-columns: minmax(160px, 1.1fr) minmax(150px, 1fr) minmax(160px, 1fr) minmax(220px, 1.4fr) minmax(130px, .8fr) minmax(90px, .6fr) minmax(104px, .7fr);
}

.ecommerce-list-row .quote-code,
.ecommerce-status-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ecommerce-status-cell {
  align-items: flex-start;
  justify-content: center;
}

.ecommerce-status-cell small {
  color: #657065;
  line-height: 1.35;
}

</style>
