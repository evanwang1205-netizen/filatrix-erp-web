<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Eye } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import { reportRowsByPage, type ReportRow, type ReportTabKey } from '../data/reports';

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

type ReportFilterField = {
  key: FilterFieldKey;
  label: string;
  options: string[];
};

const route = useRoute();

const pageTitles: Record<ReportTabKey, string> = {
  sales: '销售报表',
  inventory: '库存报表',
  production: '生产报表',
};

const searchPlaceholders: Record<ReportTabKey, string> = {
  sales: '搜索销售报表、订单、客户、价格记录',
  inventory: '搜索库存报表、物料、仓库、批次',
  production: '搜索生产报表、工单、产线、质检异常',
};

const routePageMap: Record<string, ReportTabKey> = {
  sales: 'sales',
  inventory: 'inventory',
  production: 'production',
};

const filtersByPage = ref<Record<ReportTabKey, BusinessFilters>>({
  sales: emptyBusinessFilters(),
  inventory: emptyBusinessFilters(),
  production: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());
const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('newest');
const toastMessage = ref('');
let toastTimer: number | undefined;

const activePage = computed<ReportTabKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'sales';
});
const pageTitle = computed(() => pageTitles[activePage.value]);
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

const filterDateLabel = computed(() => '更新日期');
const sortAmountLabel = computed(() => '关键数值从高到低');
const showStatusSort = computed(() => true);
const activeFilterCount = computed(() =>
  [
    filterStatus.value,
    filterParty.value,
    filterOwner.value,
    filterDateStart.value,
    filterDateEnd.value,
  ].filter(Boolean).length,
);

const listRows = computed(() => reportRowsByPage[activePage.value]);
const filterFields = computed<ReportFilterField[]>(() => [
  { key: 'status', label: '状态', options: uniqueValues(listRows.value.map((row) => row.status)) },
  { key: 'party', label: '报表分类', options: uniqueValues(listRows.value.map((row) => row.category)) },
  { key: 'owner', label: '负责部门', options: uniqueValues(listRows.value.map((row) => row.owner)) },
]);

const visibleRows = computed(() => {
  const filtered = listRows.value.filter((row) => {
    const matchesSearch = includesKeyword([
      row.code,
      row.title,
      row.category,
      row.metric,
      row.amount,
      row.comparison,
      row.owner,
      row.status,
      row.note,
      ...row.lines.flatMap((line) => [line.name, line.primary, line.secondary, line.amount, line.status]),
    ]);
    const matchesStatus = !filterStatus.value || row.status === filterStatus.value;
    const matchesCategory = !filterParty.value || row.category === filterParty.value;
    const matchesOwner = !filterOwner.value || row.owner === filterOwner.value;
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesCategory && matchesOwner && matchesDate;
  });

  return sortRows(filtered);
});

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

function parseAmount(value: string) {
  return Number(value.replace(/[^\d.-]/g, '')) || 0;
}

function dateOnly(date: string) {
  return date.slice(0, 10);
}

function matchesDateRange(date: string) {
  const value = dateOnly(date);
  return (!filterDateStart.value || value >= filterDateStart.value) && (!filterDateEnd.value || value <= filterDateEnd.value);
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

function sortRows(rows: ReportRow[]) {
  return [...rows].sort((a, b) => {
    if (sortMode.value === 'oldest') return a.date.localeCompare(b.date);
    if (sortMode.value === 'amountDesc') return parseAmount(b.amount) - parseAmount(a.amount);
    if (sortMode.value === 'status') return a.status.localeCompare(b.status, 'zh-CN');
    return b.date.localeCompare(a.date);
  });
}

function statusClass(status: string) {
  if (status.includes('异常') || status.includes('逾期')) return 'status-void';
  if (status.includes('待')) return 'status-pending';
  if (status === '可查看') return 'status-done';
  return 'status-neutral';
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

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportVisibleRows() {
  if (!visibleRows.value.length) {
    showToast('当前没有可导出的数据');
    openToolbarMenu.value = null;
    return;
  }

  const rows = [
    ['报表编号', '报表名称', '分类', '指标', '数值', '对比', '负责部门', '更新日期'],
    ...visibleRows.value.map((row) => [
      row.code,
      row.title,
      row.category,
      row.metric,
      row.amount,
      row.comparison,
      row.owner,
      row.date,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  openToolbarMenu.value = null;
  showToast('已导出当前报表列表');
}

function showToast(message: string) {
  toastMessage.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

function handleDocumentClick() {
  openToolbarMenu.value = null;
}

watch(
  () => activePage.value,
  () => {
    searchKeyword.value = '';
    sortMode.value = 'newest';
    syncDraftFilters();
    openToolbarMenu.value = null;
  },
);

onMounted(() => {
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
      <div class="quote-page reports-page">
        <div class="table-title quote-title">
          <div>
            <h1>{{ pageTitle }}</h1>
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

        <div class="quote-table-shell">
          <div class="quote-data-scroll">
            <div class="data-table quote-table reports-table">
              <div class="table-row table-head">
                <span>报表名称</span>
                <span>分类</span>
                <span>核心指标</span>
                <span>数值</span>
                <span>对比</span>
                <span>状态</span>
                <span>更新日期</span>
              </div>
              <div v-for="row in visibleRows" :key="row.code" class="table-row">
                <span class="product-summary">
                  <strong>{{ row.title }}</strong>
                  <small>{{ row.code }} · {{ row.range }}</small>
                </span>
                <span>{{ row.category }}</span>
                <span>{{ row.metric }}</span>
                <span class="amount-cell">{{ row.amount }}</span>
                <span>{{ row.comparison }}</span>
                <span><i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i></span>
                <span>{{ row.date }}</span>
              </div>
            </div>
          </div>

          <div class="quote-action-column">
            <div class="quote-action-head">操作</div>
            <div v-for="row in visibleRows" :key="`${row.code}-actions`" class="quote-action-cell">
              <div class="row-actions">
                <RouterLink :to="`/reports/${activePage}/${encodeURIComponent(row.code)}`" title="查看" aria-label="查看报表明细">
                  <Eye :size="15" />
                </RouterLink>
              </div>
            </div>
          </div>
        </div>

        <div v-if="visibleRows.length === 0" class="list-empty-state">
          <strong>暂无{{ pageTitle }}</strong>
          <span>可以调整筛选条件，或等待业务数据同步后生成报表。</span>
        </div>

        <div class="quote-card-list">
          <article v-for="row in visibleRows" :key="`${row.code}-card`" class="quote-card">
            <div class="quote-card-head">
              <div>
                <strong>{{ row.title }}</strong>
                <span>{{ row.code }} · {{ row.category }}</span>
              </div>
              <i class="mini-status" :class="statusClass(row.status)">{{ row.status }}</i>
            </div>
            <div class="quote-card-main">
              <span>{{ row.metric }}</span>
              <strong>{{ row.amount }}</strong>
            </div>
            <div class="quote-card-meta">
              <span>{{ row.comparison }}</span>
              <span>{{ row.owner }} · {{ row.date }}</span>
            </div>
          </article>
        </div>

        <div class="table-footer">
          <span>显示 {{ visibleRows.length ? 1 : 0 }}-{{ visibleRows.length }} / 共 {{ visibleRows.length }} 条</span>
          <div class="pager">
            <button type="button" disabled>上一页</button>
            <strong>1</strong>
            <button type="button" disabled>下一页</button>
          </div>
        </div>
      </div>
    </section>

    <div v-if="toastMessage" class="app-toast" role="status">
      {{ toastMessage }}
    </div>
  </div>
</template>
