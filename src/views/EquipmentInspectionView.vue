<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import ListStatusOverview from '../components/ListStatusOverview.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useModulePermission } from '../composables/useModulePermission';
import {
  equipmentInspectionPageTitles,
  type EquipmentInspectionPage,
  type EquipmentInspectionPlan,
  type EquipmentInspectionRecord,
  type EquipmentInspectionStandard,
  type EquipmentInspectionTask,
} from '../data/equipment';
import { listEquipmentInspectionRecords } from '../services/api';

type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';

type ListRow = {
  code: string;
  title: string;
  subtitle: string;
  subject: string;
  subjectMeta: string;
  rule: string;
  ruleMeta: string;
  owner: string;
  ownerMeta: string;
  date: string;
  status: string;
  attention: string;
  nextStep: string;
  nextStepLabel: string;
  currentTask: string;
  itemCount: number;
  search: string;
};

const route = useRoute();
const router = useRouter();
const { canWrite, readonlyReason } = useModulePermission('equipment');

const records = ref<EquipmentInspectionRecord[]>([]);
const planRecords = ref<EquipmentInspectionPlan[]>([]);
const taskRecords = ref<EquipmentInspectionTask[]>([]);
const loading = ref(true);
const loadError = ref('');
const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('newest');
const filterStatus = ref('');
const filterParty = ref('');
const filterOwner = ref('');
const filterDateStart = ref('');
const filterDateEnd = ref('');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
let toastTimer: number | undefined;

const activePage = computed<EquipmentInspectionPage>(() => {
  const page = route.params.page?.toString() as EquipmentInspectionPage;
  return page in equipmentInspectionPageTitles ? page : 'inspection-tasks';
});
const pageTitle = computed(() => equipmentInspectionPageTitles[activePage.value]);
const canCreate = computed(() => activePage.value !== 'inspection-tasks');
const createLabel = computed(() => activePage.value === 'inspection-plans' ? '新建计划' : '新建标准');
const searchPlaceholder = computed(() => {
  if (activePage.value === 'inspection-tasks') return '搜索任务、设备、计划、标准、负责人';
  if (activePage.value === 'inspection-plans') return '搜索计划、设备、周期、标准、负责人';
  return '搜索标准、适用设备型号、检查项、判定要求';
});
const filterFields = computed<Array<{ key: FilterFieldKey; label: string; options: string[] }>>(() => [
  {
    key: 'status',
    label: activePage.value === 'inspection-tasks' ? '任务状态' : activePage.value === 'inspection-plans' ? '计划状态' : '使用状态',
    options: uniqueValues(rows.value.map((row) => row.status)),
  },
  { key: 'party', label: activePage.value === 'inspection-standards' ? '适用设备型号' : '设备', options: uniqueValues(rows.value.map((row) => row.subject)) },
  {
    key: 'owner',
    label: activePage.value === 'inspection-standards'
      ? '维护人'
      : activePage.value === 'inspection-plans'
        ? '计划负责人'
        : '任务负责人',
    options: uniqueValues(rows.value.map((row) => row.owner)),
  },
]);
const activeFilterCount = computed(() => [
  filterStatus.value,
  filterParty.value,
  filterOwner.value,
  filterDateStart.value,
  filterDateEnd.value,
].filter(Boolean).length);

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function shanghaiToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shanghaiNowMinute() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function taskPendingPresentation(record: EquipmentInspectionTask) {
  if (record.scheduledDate > shanghaiToday()) {
    return { attention: '未到计划日', nextStep: '到计划日开始' };
  }
  if (record.dueAt < shanghaiNowMinute()) {
    return { attention: '已逾期', nextStep: '立即开始巡检' };
  }
  return { attention: '今日待开始', nextStep: '开始巡检' };
}

function taskRow(record: EquipmentInspectionTask): ListRow {
  const abnormalCount = record.items.filter((item) => item.result === '异常').length;
  const pendingPresentation = taskPendingPresentation(record);
  return {
    code: record.code,
    title: record.equipmentName,
    subtitle: `${record.code} · ${record.equipmentModel || '型号未维护'}`,
    subject: record.planName,
    subjectMeta: `${record.planCode} · ${record.location || '位置未维护'}`,
    rule: record.standardName,
    ruleMeta: `R${record.standardRevision || 1} · ${record.scheduledDate} · ${record.dueAt.split(' ').slice(-1)[0] || '全天'}`,
    owner: record.assignee,
    ownerMeta: '',
    date: record.scheduledDate,
    status: record.status,
    attention: record.status === '异常处理中'
      ? `${abnormalCount} 项异常`
      : record.status === '待巡检'
        ? pendingPresentation.attention
        : record.status === '巡检中'
          ? '待提交结果'
          : record.status === '已取消'
            ? '未执行'
            : record.result,
    nextStep: record.status === '待巡检'
      ? pendingPresentation.nextStep
      : record.status === '巡检中'
        ? '完成检查项并提交'
        : record.status === '异常处理中'
          ? '处理异常并关闭'
          : '',
    nextStepLabel: '下一步',
    currentTask: '',
    itemCount: record.items.length,
    search: [
      record.code, record.equipmentCode, record.equipmentName, record.equipmentModel, record.location,
      record.planCode, record.planName, record.standardCode, record.standardName, record.assignee,
      record.cancelReason,
    ].join(' '),
  };
}

function planRow(record: EquipmentInspectionPlan): ListRow {
  const openTask = taskRecords.value
    .filter((task) => task.planCode === record.code && ['待巡检', '巡检中', '异常处理中'].includes(task.status))
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))[0];
  const taskDate = openTask?.scheduledDate || record.nextDueDate || record.firstDueDate;
  const pendingAttention = openTask?.status === '待巡检'
    ? taskPendingPresentation(openTask).attention
    : '';
  return {
    code: record.code,
    title: record.name,
    subtitle: record.code,
    subject: record.equipmentName,
    subjectMeta: `${record.equipmentCode} · ${record.location || '位置未维护'}`,
    rule: record.standardName,
    ruleMeta: `R${record.standardRevision || 1} · ${record.frequency} · ${record.executionWindow}`,
    owner: record.owner,
    ownerMeta: '',
    date: taskDate,
    status: record.status,
    attention: openTask
      ? [openTask.status, pendingAttention].filter(Boolean).join(' · ')
      : record.status === '启用'
        ? '待生成'
        : '无未完成任务',
    nextStep: openTask
      ? `${openTask.code} · ${openTask.scheduledDate}`
      : record.status === '启用' ? taskDate : '',
    nextStepLabel: openTask ? '当前任务' : '下次任务',
    currentTask: openTask
      ? [openTask.code, openTask.status, pendingAttention, openTask.scheduledDate].filter(Boolean).join(' · ')
      : record.status === '启用' ? `待生成 · 下次 ${taskDate}` : '无未完成任务',
    itemCount: 0,
    search: [
      record.code, record.name, record.equipmentCode, record.equipmentName, record.equipmentModel,
      record.location, record.standardCode, record.standardName, record.frequency, record.owner,
      openTask?.code, openTask?.status, taskDate,
    ].join(' '),
  };
}

function standardRow(record: EquipmentInspectionStandard): ListRow {
  const activePlanCount = planRecords.value.filter((plan) => (
    plan.standardCode === record.code && plan.status === '启用'
  )).length;
  const namedItems = record.items.map((item) => item.name.trim()).filter(Boolean);
  const completeItemCount = record.items.filter((item) => (
    item.name.trim() && item.method.trim() && item.requirement.trim()
  )).length;
  const incompleteItemCount = record.items.length - completeItemCount;
  return {
    code: record.code,
    title: record.name,
    subtitle: `${record.code} · R${record.revision}`,
    subject: record.equipmentModel || '型号未维护',
    subjectMeta: namedItems.slice(0, 3).join(' · ') || '未维护检查项',
    rule: record.acceptance || '整体合格条件未维护',
    ruleMeta: incompleteItemCount
      ? `${completeItemCount} 个完整项 · ${incompleteItemCount} 项待补充`
      : `${completeItemCount} 个检查项`,
    owner: record.updatedBy || '—',
    ownerMeta: record.updatedAt.slice(0, 10),
    date: record.updatedAt.slice(0, 10),
    status: record.status,
    attention: record.status === '启用'
      ? activePlanCount ? `${activePlanCount} 个启用计划` : '可供计划引用'
      : record.status === '草稿' ? '待完善并启用' : '新计划不可选',
    nextStep: '',
    nextStepLabel: '',
    currentTask: '',
    itemCount: record.items.length,
    search: [
      record.code, record.name, record.equipmentModel, record.acceptance, record.updatedBy,
      ...record.items.flatMap((item) => [item.name, item.method, item.requirement]),
    ].join(' '),
  };
}

const rows = computed<ListRow[]>(() => records.value.map((record) => {
  if (activePage.value === 'inspection-tasks') return taskRow(record as EquipmentInspectionTask);
  if (activePage.value === 'inspection-plans') return planRow(record as EquipmentInspectionPlan);
  return standardRow(record as EquipmentInspectionStandard);
}));

const visibleRows = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const filtered = rows.value.filter((row) => (
    (!keyword || `${row.title} ${row.subtitle} ${row.search}`.toLowerCase().includes(keyword))
    && (!filterStatus.value || row.status === filterStatus.value)
    && (!filterParty.value || row.subject === filterParty.value)
    && (!filterOwner.value || row.owner === filterOwner.value)
    && (!filterDateStart.value || row.date >= filterDateStart.value)
    && (!filterDateEnd.value || row.date <= filterDateEnd.value)
  ));
  return [...filtered].sort((left, right) => {
    if (sortMode.value === 'oldest') return left.date.localeCompare(right.date);
    if (sortMode.value === 'amountDesc') return right.itemCount - left.itemCount;
    if (sortMode.value === 'status') {
      if (activePage.value === 'inspection-tasks') {
        const priority = (row: ListRow) => {
          if (row.status === '异常处理中') return 0;
          if (row.status === '巡检中') return 1;
          if (row.status === '待巡检' && row.attention === '已逾期') return 2;
          if (row.status === '待巡检' && row.date === shanghaiToday()) return 3;
          if (row.status === '待巡检') return 4;
          if (row.status === '已完成') return 5;
          if (row.status === '已取消') return 6;
          return 7;
        };
        const rank = priority(left) - priority(right);
        if (rank) return rank;
        return ['已完成', '已取消'].includes(left.status)
          ? right.date.localeCompare(left.date)
          : left.date.localeCompare(right.date);
      }
      const order = ['异常处理中', '巡检中', '待巡检', '草稿', '启用', '停用', '已完成', '已取消'];
      return order.indexOf(left.status) - order.indexOf(right.status);
    }
    return right.date.localeCompare(left.date);
  });
});

function detailPath(code: string) {
  return `/equipment/${activePage.value}/${encodeURIComponent(code)}`;
}

function openCreatePage() {
  if (!canWrite.value) {
    showToast(readonlyReason.value, 'error');
    return;
  }
  void router.push(`/equipment/${activePage.value}/new`);
}

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  openToolbarMenu.value = openToolbarMenu.value === menu ? null : menu;
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode;
  openToolbarMenu.value = null;
}

function clearFilters() {
  filterStatus.value = '';
  filterParty.value = '';
  filterOwner.value = '';
  filterDateStart.value = '';
  filterDateEnd.value = '';
  showToast('已清空筛选条件');
}

function applyFilters() {
  if (filterDateStart.value && filterDateEnd.value && filterDateStart.value > filterDateEnd.value) {
    showToast('日期起不能晚于日期止', 'error');
    return;
  }
  openToolbarMenu.value = null;
  showToast('已应用当前筛选条件');
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportVisibleRows() {
  if (!visibleRows.value.length) {
    showToast('当前没有可导出的数据', 'error');
    return;
  }
  const headers = activePage.value === 'inspection-tasks'
    ? ['任务编号', '设备', '来源计划', '计划编号与设备位置', '巡检标准', '标准修订与时限', '任务负责人', '计划日期', '任务状态', '下一步']
    : activePage.value === 'inspection-plans'
      ? ['计划编号', '计划名称', '设备', '设备位置', '巡检标准', '修订与执行周期', '计划负责人', '任务日期', '计划状态', '当前任务']
      : ['标准编号', '标准名称', '适用设备型号', '检查项目', '整体合格条件', '检查项完整度', '最近维护人', '更新日期', '使用状态', '引用情况'];
  const values = [
    headers,
    ...visibleRows.value.map((row) => {
      if (activePage.value === 'inspection-tasks') {
        return [row.code, row.title, row.subject, row.subjectMeta, row.rule, row.ruleMeta, row.owner, row.date, row.status, row.nextStep];
      }
      if (activePage.value === 'inspection-plans') {
        return [row.code, row.title, row.subject, row.subjectMeta, row.rule, row.ruleMeta, row.owner, row.date, row.status, row.currentTask];
      }
      return [row.code, row.title, row.subject, row.subjectMeta, row.rule, row.ruleMeta, row.owner, row.date, row.status, row.attention];
    }),
  ];
  const csv = `\uFEFF${values.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  openToolbarMenu.value = null;
  showToast('已导出当前筛选结果');
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

async function loadRows() {
  loading.value = true;
  loadError.value = '';
  try {
    if (activePage.value === 'inspection-standards') {
      const [standards, plans] = await Promise.all([
        listEquipmentInspectionRecords('inspection-standards'),
        listEquipmentInspectionRecords('inspection-plans'),
      ]);
      records.value = standards;
      planRecords.value = plans;
      taskRecords.value = [];
    } else if (activePage.value === 'inspection-plans') {
      const [plans, tasks] = await Promise.all([
        listEquipmentInspectionRecords('inspection-plans'),
        listEquipmentInspectionRecords('inspection-tasks'),
      ]);
      records.value = plans;
      planRecords.value = [];
      taskRecords.value = tasks;
    } else {
      records.value = await listEquipmentInspectionRecords(activePage.value);
      planRecords.value = [];
      taskRecords.value = [];
    }
  } catch (error) {
    records.value = [];
    planRecords.value = [];
    taskRecords.value = [];
    loadError.value = error instanceof Error ? error.message : `${pageTitle.value}加载失败`;
  } finally {
    loading.value = false;
  }
}

watch(activePage, (page) => {
  searchKeyword.value = '';
  sortMode.value = page === 'inspection-tasks' ? 'status' : 'newest';
  filterStatus.value = '';
  filterParty.value = '';
  filterOwner.value = '';
  filterDateStart.value = '';
  filterDateEnd.value = '';
  void loadRows();
}, { immediate: true });

onBeforeUnmount(() => window.clearTimeout(toastTimer));
</script>

<template>
  <section class="list-page equipment-page">
    <div class="quote-page equipment-list-page">
      <PageTopbarPortal>
        <template #actions>
          <button
            v-if="canCreate"
            class="primary-action"
            type="button"
            :disabled="!canWrite"
            :title="canWrite ? createLabel : readonlyReason"
            @click="openCreatePage"
          >
            <Plus :size="16" />
            {{ createLabel }}
          </button>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner v-if="!canWrite" :message="readonlyReason" suffix="当前设备巡检数据仅可查看。" />

      <BusinessListToolbar
        v-model:search="searchKeyword"
        v-model:filter-status="filterStatus"
        v-model:filter-party="filterParty"
        v-model:filter-owner="filterOwner"
        v-model:filter-date-start="filterDateStart"
        v-model:filter-date-end="filterDateEnd"
        :search-placeholder="searchPlaceholder"
        :open-menu="openToolbarMenu"
        :sort-mode="sortMode"
        sort-amount-label="检查项数量优先"
        :sort-date-label="activePage === 'inspection-standards' ? '更新日期' : activePage === 'inspection-plans' ? '任务日期' : '计划日期'"
        :show-amount-sort="activePage !== 'inspection-plans'"
        :status-sort-label="activePage === 'inspection-tasks' ? '待办状态优先' : activePage === 'inspection-plans' ? '计划状态优先' : '使用状态优先'"
        :show-status-sort="true"
        :active-filter-count="activeFilterCount"
        :filter-fields="filterFields"
        :filter-date-label="activePage === 'inspection-standards' ? '更新日期' : activePage === 'inspection-plans' ? '任务日期' : '计划日期'"
        @toggle-menu="toggleToolbarMenu"
        @sort="setSortMode"
        @export-rows="exportVisibleRows"
        @clear-filters="clearFilters"
        @apply-filters="applyFilters"
      />

      <div class="quote-table-shell equipment-table-shell">
        <ListLoadState
          v-if="loading || loadError"
          :loading="loading"
          :title="pageTitle"
          :message="loadError"
          @retry="loadRows"
        />

        <template v-else>
          <div class="equipment-desktop-list">
            <div class="equipment-list-head" :data-page="activePage">
              <span>{{ activePage === 'inspection-tasks' ? '设备 / 任务' : activePage === 'inspection-plans' ? '计划' : '标准' }}</span>
              <span>{{ activePage === 'inspection-tasks' ? '来源计划 / 位置' : activePage === 'inspection-plans' ? '设备 / 位置' : '适用设备型号 / 检查项' }}</span>
              <span>{{ activePage === 'inspection-plans' ? '标准 / 周期' : activePage === 'inspection-tasks' ? '标准 / 时间' : '整体合格条件' }}</span>
              <span>{{ activePage === 'inspection-standards' ? '维护人' : activePage === 'inspection-plans' ? '计划负责人' : '任务负责人' }}</span>
              <span>{{ activePage === 'inspection-tasks' ? '状态与下一步' : activePage === 'inspection-plans' ? '计划状态 / 当前任务' : '使用状态 / 引用' }}</span>
            </div>
            <RouterLink
              v-for="row in visibleRows"
              :key="row.code"
              class="equipment-list-row"
              :data-page="activePage"
              :to="detailPath(row.code)"
              :title="`查看${pageTitle} ${row.code}`"
            >
              <span class="equipment-identity-cell">
                <strong>{{ row.title }}</strong>
                <small>{{ row.subtitle }}</small>
              </span>
              <span class="equipment-detail-cell">
                <strong>{{ row.subject }}</strong>
                <small>{{ row.subjectMeta }}</small>
              </span>
              <span class="equipment-detail-cell">
                <strong>{{ row.rule }}</strong>
                <small>{{ row.ruleMeta }}</small>
              </span>
              <span class="equipment-detail-cell">
                <strong>{{ row.owner || '—' }}</strong>
                <small v-if="row.ownerMeta">{{ row.ownerMeta }}</small>
              </span>
              <ListStatusOverview
                :status="row.status"
                :attention="row.attention"
                :next-step="row.nextStep"
                :next-step-label="row.nextStepLabel"
              />
            </RouterLink>
          </div>

          <div class="equipment-mobile-list">
            <RouterLink v-for="row in visibleRows" :key="row.code" class="equipment-mobile-card" :to="detailPath(row.code)">
              <header>
                <span><strong>{{ row.title }}</strong><small>{{ row.subtitle }}</small></span>
                <ListStatusOverview :status="row.status" :attention="row.attention" />
              </header>
              <dl>
                <div><dt>{{ activePage === 'inspection-standards' ? '适用设备型号' : '计划 / 设备' }}</dt><dd>{{ row.subject }}<small v-if="row.subjectMeta">{{ row.subjectMeta }}</small></dd></div>
                <div><dt>标准 / 要求</dt><dd>{{ row.rule }}<small v-if="row.ruleMeta">{{ row.ruleMeta }}</small></dd></div>
                <div><dt>{{ activePage === 'inspection-standards' ? '维护人' : activePage === 'inspection-plans' ? '计划负责人' : '任务负责人' }}</dt><dd>{{ row.owner || '—' }}<small v-if="row.ownerMeta">{{ row.ownerMeta }}</small></dd></div>
                <div v-if="row.nextStep"><dt>{{ row.nextStepLabel }}</dt><dd>{{ row.nextStep }}</dd></div>
              </dl>
            </RouterLink>
          </div>

          <div v-if="!visibleRows.length" class="list-empty-state">
            <strong>没有匹配的{{ pageTitle }}</strong>
            <span>请调整搜索或筛选条件。</span>
            <button class="secondary-action" type="button" @click="searchKeyword = ''; clearFilters()">清空条件</button>
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="toastMessage"
      class="app-toast"
      :class="{ error: toastTone === 'error' }"
      :role="toastTone === 'error' ? 'alert' : 'status'"
    >
      {{ toastMessage }}
    </div>
  </section>
</template>

<style scoped>
.equipment-list-page {
  display: grid;
  gap: 14px;
}

.equipment-table-shell {
  overflow: hidden;
}

.equipment-list-head,
.equipment-list-row {
  display: grid;
  grid-template-columns: minmax(145px, 1.06fr) minmax(140px, .98fr) minmax(145px, 1fr) minmax(72px, .52fr) minmax(205px, 1.28fr);
  align-items: center;
  min-width: 780px;
}

.equipment-desktop-list {
  overflow-x: auto;
}

.equipment-list-head {
  min-height: 42px;
  color: var(--muted);
  background: #f7f8f5;
  font-size: 11px;
  font-weight: 700;
}

.equipment-list-head > span,
.equipment-list-row > * {
  min-width: 0;
  padding: 11px 10px;
}

.equipment-list-row {
  min-height: 76px;
  color: inherit;
  border-top: 1px solid #eceee9;
  text-decoration: none;
  transition: background-color 140ms ease;
}

.equipment-list-row:hover,
.equipment-list-row:focus-visible {
  outline: 0;
  background: #f8faf7;
}

.equipment-identity-cell,
.equipment-detail-cell {
  display: grid;
  gap: 4px;
}

.equipment-identity-cell strong,
.equipment-detail-cell strong {
  min-width: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.equipment-identity-cell small,
.equipment-detail-cell small {
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.equipment-mobile-list {
  display: none;
}

.equipment-mobile-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  color: inherit;
  border: 1px solid #e5e8e1;
  border-radius: 12px;
  background: #fff;
  text-decoration: none;
}

.equipment-mobile-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.equipment-mobile-card header > span {
  display: grid;
  gap: 3px;
}

.equipment-mobile-card header strong {
  color: var(--text);
  font-size: 14px;
}

.equipment-mobile-card header small {
  color: var(--muted);
  font-size: 11px;
}

.equipment-mobile-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.equipment-mobile-card dl > div {
  display: grid;
  gap: 3px;
}

.equipment-mobile-card dt {
  color: var(--muted);
  font-size: 10px;
}

.equipment-mobile-card dd {
  display: grid;
  gap: 2px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.equipment-mobile-card dd small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .equipment-desktop-list {
    display: none;
  }

  .equipment-mobile-list {
    display: grid;
    gap: 10px;
    padding: 10px;
  }
}
</style>
