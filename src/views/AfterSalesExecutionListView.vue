<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import {
  listAfterSalesExecutionTasks,
  type AfterSalesExecutionModulePath,
} from '../services/api';
import type { AfterSalesExecutionTask } from '../types/business';
import { statusPresentationClass } from '../utils/statusPresentation';

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';

const route = useRoute();
const modulePath = computed(
  () => String(route.meta.afterSalesExecutionModule || 'quality') as AfterSalesExecutionModulePath,
);
const pageConfig = computed(() => ({
  quality: {
    title: '售后检验',
    taskLabel: '检验任务',
    partyLabel: '客户 / 供应商',
    searchPlaceholder: '搜索任务、售后单、订单、客户/供应商、物料',
    startAction: '开始检验',
    resultAction: '登记检验结果',
    emptyTitle: '当前没有售后检验任务',
    emptyDescription: '销售退货或采购补发需要检验时，系统会自动生成任务。',
  },
  production: {
    title: '售后返修',
    taskLabel: '返修要求',
    partyLabel: '客户',
    searchPlaceholder: '搜索任务、售后单、订单、客户、问题、物料',
    startAction: '开始返修',
    resultAction: '登记返修结果',
    emptyTitle: '当前没有售后返修任务',
    emptyDescription: '售后方案需要维修、返工或重新生产时，系统会自动生成任务。',
  },
  warehouse: {
    title: '售后作业',
    taskLabel: '仓库任务',
    partyLabel: '客户 / 供应商',
    searchPlaceholder: '搜索任务、售后单、订单、客户/供应商、物料',
    startAction: '开始作业',
    resultAction: '登记作业结果',
    emptyTitle: '当前没有仓库售后任务',
    emptyDescription: '售后涉及出入库时，系统会自动生成任务。',
  },
})[modulePath.value]);

const tasks = ref<AfterSalesExecutionTask[]>([]);
const loading = ref(true);
const loadError = ref('');
const searchKeyword = ref('');
const openMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('status');

const draftFilterStatus = ref('');
const draftFilterParty = ref('');
const draftFilterOwner = ref('');
const draftFilterDateStart = ref('');
const draftFilterDateEnd = ref('');
const filterStatus = ref('');
const filterParty = ref('');
const filterOwner = ref('');
const filterDateStart = ref('');
const filterDateEnd = ref('');

const statusRank: Record<string, number> = {
  待处理: 0,
  处理中: 1,
  待前置: 2,
  已完成: 3,
  已取消: 9,
};

const taskRows = computed(() => tasks.value.filter((task) => task.status !== '已取消'));
const partyOptions = computed(() => [...new Set(
  taskRows.value
    .map((task) => task.party)
    .filter((party): party is string => Boolean(party)),
)].sort());
const ownerOptions = computed(() => [...new Set(
  taskRows.value
    .map(taskOwner)
    .filter((owner): owner is string => Boolean(owner)),
)].sort());
const statusOptions = computed(() => ['待处理', '处理中', '待前置', '已完成'].filter(
  (status) => taskRows.value.some((task) => task.status === status),
));
const filterFields = computed(() => [
  { key: 'status' as const, label: '任务状态', options: statusOptions.value },
  { key: 'party' as const, label: pageConfig.value.partyLabel, options: partyOptions.value, control: 'search' as const },
  { key: 'owner' as const, label: '经办人', options: ownerOptions.value, control: 'search' as const },
]);
const activeFilterCount = computed(() => [
  filterStatus.value,
  filterParty.value,
  filterOwner.value,
  filterDateStart.value,
  filterDateEnd.value,
].filter(Boolean).length);

function quantityNumber(value: string | number | undefined) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

function taskDate(task: AfterSalesExecutionTask) {
  if (task.status === '已完成') return task.actualDate || String(task.completedAt || '').slice(0, 10);
  if (task.status === '处理中') return String(task.startedAt || task.createdAt || '').slice(0, 10);
  return String(task.createdAt || '').slice(0, 10);
}

function taskSortDate(task: AfterSalesExecutionTask) {
  return taskDate(task) || String(task.createdAt || '').slice(0, 10);
}

function taskDateLabel(task: AfterSalesExecutionTask) {
  if (task.status === '已完成') return task.actualDate ? '实际日期' : '完成日期';
  if (task.status === '处理中') return task.startedAt ? '开始日期' : '生成日期';
  return '生成日期';
}

function taskOwner(task: AfterSalesExecutionTask) {
  if (task.status === '已完成') return task.completedBy || '';
  if (task.status === '处理中') return task.startedBy || '';
  return '';
}

function taskResult(task: AfterSalesExecutionTask) {
  if (task.status !== '已完成') return '结果未登记';
  if (modulePath.value === 'quality') return task.disposition || '检验已完成';
  if (modulePath.value === 'production') return task.disposition || '已返修待复检';
  if (task.kind === '客户退货接收') return '已接收待检';
  if (['补发出库', '换货出库', '返修品出库'].includes(task.kind)) return '已出库';
  if (task.kind === '退货品返还出库') return '已返还客户';
  if (['采购退货出库', '异常暂存退回', '不合格品退回供应商'].includes(task.kind)) return '已退回供应商';
  if (/正式入库|返修品入库处置/.test(task.kind)) return '已入库';
  if (task.kind === '返修品报废处置') return '已报废';
  return task.disposition || '作业已完成';
}

function taskWorkTitle(task: AfterSalesExecutionTask) {
  if (modulePath.value === 'production') return task.caseIssueType || '售后返修';
  return task.kind;
}

function displayIssueDescription(value: string | undefined) {
  return String(value || '').replace(/^\[售后流程测试[^\]]*\]\s*/, '').trim();
}

function taskWorkSubtitle(task: AfterSalesExecutionTask) {
  if (modulePath.value === 'production' && task.status !== '已完成') {
    return displayIssueDescription(task.caseIssueDescription) || '按售后要求完成返修并交由复检';
  }
  return taskResult(task);
}

function quantityUnit(value: string | number | undefined) {
  return String(value ?? '').replace(/[\d\s.,+-]/g, '').trim();
}

function quantityText(value: number, unit = '') {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value)}${unit ? ` ${unit}` : ''}`;
}

function taskQuantitySummary(task: AfterSalesExecutionTask) {
  const totals = new Map<string, number>();
  (task.products || []).forEach((product) => {
    const unit = product.uom || quantityUnit(product.qty) || '件';
    totals.set(unit, (totals.get(unit) || 0) + quantityNumber(product.qty));
  });
  return [...totals.entries()].map(([unit, quantity]) => quantityText(quantity, unit)).join(' / ') || '—';
}

function productTitle(task: AfterSalesExecutionTask) {
  const products = task.products || [];
  if (!products.length) return '—';
  const firstTitle = products[0].name || products[0].materialCode || '—';
  return products.length === 1 ? firstTitle : `${firstTitle} 等 ${products.length} 种物料`;
}

function productSubtitle(task: AfterSalesExecutionTask) {
  const products = task.products || [];
  if (!products.length) return '物料信息未登记';
  const first = products[0];
  return [first.materialCode, first.model, first.spec].filter(Boolean).join(' · ') || '物料信息未登记';
}

function taskPath(task: AfterSalesExecutionTask) {
  return task.path || `/${modulePath.value}/after-sales/${encodeURIComponent(task.code)}`;
}

function nextStep(task: AfterSalesExecutionTask) {
  if (task.status === '待前置') {
    const pendingKinds = (task.predecessors || [])
      .filter((predecessor) => predecessor.status !== '已完成')
      .map((predecessor) => predecessor.kind);
    return pendingKinds.length ? `等待${pendingKinds.join('、')}` : '等待前置任务完成';
  }
  if (task.status === '待处理') return pageConfig.value.startAction;
  if (task.status === '处理中') return pageConfig.value.resultAction;
  if (modulePath.value === 'production') return '查看返修记录';
  if (modulePath.value === 'quality') return '查看检验记录';
  return '查看作业记录';
}

const visibleRows = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const rows = taskRows.value.filter((task) => {
    const date = taskDate(task);
    const searchable = [
      task.code,
      task.afterSaleCode,
      task.sourceOrder,
      task.party,
      task.kind,
      task.direction,
      task.status,
      taskOwner(task),
      taskResult(task),
      task.disposition,
      task.evidence,
      task.adjustmentCode,
      task.caseIssueType,
      task.caseIssueDescription,
      task.caseAction,
      task.caseGoodsDisposition,
      ...(task.products || []).flatMap((product) => [
        product.materialCode,
        product.name,
        product.model,
        product.spec,
      ]),
    ].filter(Boolean).join(' ').toLowerCase();
    return (!keyword || searchable.includes(keyword))
      && (!filterStatus.value || task.status === filterStatus.value)
      && (!filterParty.value || task.party === filterParty.value)
      && (!filterOwner.value || taskOwner(task) === filterOwner.value)
      && (!filterDateStart.value || date >= filterDateStart.value)
      && (!filterDateEnd.value || date <= filterDateEnd.value);
  });

  return rows.sort((a, b) => {
    if (sortMode.value === 'oldest') return taskSortDate(a).localeCompare(taskSortDate(b)) || a.code.localeCompare(b.code);
    if (sortMode.value === 'status') {
      return (statusRank[a.status] ?? 8) - (statusRank[b.status] ?? 8)
        || taskSortDate(b).localeCompare(taskSortDate(a))
        || b.code.localeCompare(a.code);
    }
    return taskSortDate(b).localeCompare(taskSortDate(a)) || b.code.localeCompare(a.code);
  });
});

async function loadTasks() {
  loading.value = true;
  loadError.value = '';
  try {
    tasks.value = await listAfterSalesExecutionTasks(modulePath.value);
  } catch (error) {
    tasks.value = [];
    loadError.value = error instanceof Error ? error.message : `${pageConfig.value.title}加载失败`;
  } finally {
    loading.value = false;
  }
}

function toggleMenu(menu: ToolbarMenuKey) {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function applyFilters() {
  filterStatus.value = draftFilterStatus.value;
  filterParty.value = draftFilterParty.value;
  filterOwner.value = draftFilterOwner.value;
  filterDateStart.value = draftFilterDateStart.value;
  filterDateEnd.value = draftFilterDateEnd.value;
  openMenu.value = null;
}

function clearFilters() {
  draftFilterStatus.value = '';
  draftFilterParty.value = '';
  draftFilterOwner.value = '';
  draftFilterDateStart.value = '';
  draftFilterDateEnd.value = '';
  filterStatus.value = '';
  filterParty.value = '';
  filterOwner.value = '';
  filterDateStart.value = '';
  filterDateEnd.value = '';
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRows() {
  const columns = ['任务单号', '售后单号', '来源订单', pageConfig.value.partyLabel.replace(/\s/g, ''), pageConfig.value.taskLabel, '执行结果', '物料', '物料信息', '任务数量', '状态', '下一步', '日期口径', '作业日期', '经办人'];
  const lines = visibleRows.value.map((task) => [
    task.code,
    task.afterSaleCode,
    task.sourceOrder,
    task.party,
    taskWorkTitle(task),
    taskResult(task),
    productTitle(task),
    productSubtitle(task),
    taskQuantitySummary(task),
    task.status,
    nextStep(task),
    taskDateLabel(task),
    taskDate(task),
    taskOwner(task),
  ]);
  const blob = new Blob(
    [`\ufeff${[columns, ...lines].map((line) => line.map(escapeCsv).join(',')).join('\n')}`],
    { type: 'text/csv;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageConfig.value.title}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  openMenu.value = null;
}

function handleDocumentClick() {
  openMenu.value = null;
}

onMounted(() => {
  void loadTasks();
  document.addEventListener('click', handleDocumentClick);
});
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick));
</script>

<template>
  <div class="page-stack">
    <section class="list-page">
      <div class="quote-page after-sales-execution-list-page">
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="pageConfig.searchPlaceholder"
          :open-menu="openMenu"
          :sort-mode="sortMode"
          sort-amount-label="受影响数量从多到少"
          :show-amount-sort="false"
          status-sort-label="待处理优先"
          :show-status-sort="true"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          filter-date-label="生成 / 开始 / 实际日期"
          @toggle-menu="toggleMenu"
          @sort="sortMode = $event"
          @export-rows="exportRows"
          @clear-filters="clearFilters"
          @apply-filters="applyFilters"
        />

        <ListLoadState
          v-if="loading || loadError"
          :loading="loading"
          :title="pageConfig.title"
          :message="loadError"
          @retry="loadTasks"
        />

        <template v-else>
          <div v-if="visibleRows.length" class="quote-table-shell after-sales-execution-list-shell with-status-column">
            <div class="quote-data-scroll">
              <div class="data-table quote-table after-sales-execution-table">
                <div class="table-row table-head">
                  <span>任务单号</span>
                  <span>{{ pageConfig.partyLabel }}</span>
                  <span>物料 / 任务数量</span>
                  <span>{{ pageConfig.taskLabel }}</span>
                  <span>日期 / 经办人</span>
                </div>
                <RouterLink
                  v-for="task in visibleRows"
                  :key="task.code"
                  class="table-row order-list-row is-clickable"
                  :to="taskPath(task)"
                  :title="`打开${pageConfig.title}任务 ${task.code}`"
                >
                  <span class="quote-code">{{ task.code }}</span>
                  <span class="party-cell">
                    <strong>{{ task.party || '—' }}</strong>
                    <small>{{ task.afterSaleCode }} · {{ task.sourceOrder }}</small>
                  </span>
                  <span class="product-summary">
                    <strong>{{ productTitle(task) }}</strong>
                    <small>{{ productSubtitle(task) }} · 任务 {{ taskQuantitySummary(task) }}</small>
                  </span>
                  <span class="product-summary">
                    <strong>{{ taskWorkTitle(task) }}</strong>
                    <small :title="taskWorkSubtitle(task)">{{ taskWorkSubtitle(task) }}</small>
                  </span>
                  <span class="date-stack">
                    <strong>{{ taskDate(task) || '—' }}</strong>
                    <small>{{ taskDateLabel(task) }}<template v-if="taskOwner(task)"> · {{ taskOwner(task) }}</template></small>
                  </span>
                </RouterLink>
              </div>
            </div>

            <div class="quote-status-column">
              <div class="quote-status-head">
                <strong>任务状态</strong>
                <small>下一步</small>
              </div>
              <RouterLink
                v-for="task in visibleRows"
                :key="`${task.code}-status`"
                class="quote-status-cell order-status-link"
                :to="taskPath(task)"
                :title="`${task.status}，下一步：${nextStep(task)}`"
              >
                <i class="mini-status" :class="statusPresentationClass(task.status)">{{ task.status }}</i>
                <small>{{ nextStep(task) }}</small>
              </RouterLink>
            </div>
          </div>

          <div v-else class="list-empty-state">
            <strong>{{ pageConfig.emptyTitle }}</strong>
            <span>{{ activeFilterCount || searchKeyword ? '当前搜索或筛选条件下没有匹配任务。' : pageConfig.emptyDescription }}</span>
            <button v-if="activeFilterCount || searchKeyword" class="secondary-action empty-state-action" type="button" @click="searchKeyword = ''; clearFilters()">
              清空条件
            </button>
          </div>

          <div class="quote-card-list">
            <RouterLink
              v-for="task in visibleRows"
              :key="`${task.code}-card`"
              class="quote-card"
              :to="taskPath(task)"
              :title="`打开${pageConfig.title}任务 ${task.code}`"
            >
              <div class="quote-card-head">
                <div>
                  <strong>{{ task.party || '—' }}</strong>
                  <span>{{ task.code }} · {{ task.afterSaleCode }}</span>
                </div>
                <i class="mini-status" :class="statusPresentationClass(task.status)">{{ task.status }}</i>
              </div>
              <div class="quote-card-main quote-card-products">
                <div>
                  <span>{{ productTitle(task) }} <small>{{ productSubtitle(task) }} · 任务 {{ taskQuantitySummary(task) }}</small></span>
                  <span>{{ taskWorkTitle(task) }} <small>{{ taskWorkSubtitle(task) }}</small></span>
                </div>
                <strong>{{ taskDate(task) || taskDateLabel(task) }}</strong>
              </div>
              <div class="quote-card-meta">
                <span>来源订单 {{ task.sourceOrder || '—' }}</span>
                <span>经办人 {{ taskOwner(task) || '未登记' }}</span>
                <span>下一步：{{ nextStep(task) }}</span>
              </div>
            </RouterLink>
          </div>

          <div v-if="visibleRows.length" class="table-footer">
            <span>显示 1-{{ visibleRows.length }} / 共 {{ visibleRows.length }} 条</span>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.after-sales-execution-list-shell {
  grid-template-columns: minmax(0, 1fr) 176px;
}
.after-sales-execution-table {
  min-width: 748px;
}
.after-sales-execution-table .table-row {
  grid-template-columns: 160px minmax(138px, 0.95fr) minmax(194px, 1.25fr) minmax(128px, 0.8fr) 102px;
  gap: 8px;
  padding-inline: 10px;
}
.after-sales-execution-table .table-row:not(.table-head),
.after-sales-execution-list-shell .quote-status-cell {
  min-height: 66px;
}
.after-sales-execution-list-shell .quote-status-column {
  grid-auto-rows: 66px;
}
.after-sales-execution-list-shell .quote-status-head {
  display: grid;
  align-content: center;
  gap: 1px;
}
.after-sales-execution-list-shell .quote-status-head small {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 400;
}
.after-sales-execution-list-shell .quote-status-cell {
  align-content: center;
}
.after-sales-execution-list-shell .quote-status-cell small {
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .after-sales-execution-list-page .quote-table-shell,
  .after-sales-execution-list-page .table-footer {
    display: none;
  }
  .after-sales-execution-list-page .quote-card-list {
    display: grid;
  }
}
</style>
