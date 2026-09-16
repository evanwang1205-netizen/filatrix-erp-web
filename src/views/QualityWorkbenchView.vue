<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { AlertTriangle, ArrowRight, ClipboardCheck, PackageCheck, ShieldCheck } from 'lucide-vue-next';

import ListLoadState from '../components/ListLoadState.vue';
import {
  defectRows,
  listIncomingQualityRecords,
  productionQualityRecordFromTask,
  qualityPatrolRows,
  type QualityRecord,
} from '../data/quality';
import {
  listAfterSalesExecutionTasks,
  listProductionQualityTasks,
  listQualityClosures,
  type QualityClosureKind,
  type QualityClosureRecord,
} from '../services/api';
import type { AfterSalesExecutionTask } from '../types/business';
import {
  isQualityDispositionClosed,
  projectQualityState,
  qualityDispositionStageDisplay,
} from '../utils/qualityState';

type QueueTone = 'neutral' | 'warning' | 'danger' | 'success';
type QueueScope = 'all' | 'judgement' | 'review' | 'closure' | 'freeze';

type QueueItem = {
  code: string;
  source: string;
  type: string;
  subject: string;
  meta: string;
  inspectionConclusion: string;
  dispositionStage: string;
  currentAction: string;
  issueCount: number;
  path: string;
  tone: QueueTone;
  page: 'incoming' | 'production' | 'after-sales' | 'patrol' | 'defects';
  pendingJudgement: boolean;
  frozen: boolean;
  freezeBatchKeys: string[];
};

const runtimeProductionRows = ref<QualityRecord[]>([]);
const runtimeIncomingRows = ref<QualityRecord[]>([]);
const runtimePatrolRows = ref<QualityRecord[]>([]);
const runtimeDefectRows = ref<QualityRecord[]>([]);
const runtimeAfterSalesRows = ref<AfterSalesExecutionTask[]>([]);
const runtimeProductionLoaded = ref(false);
const runtimeIncomingLoaded = ref(false);
const runtimePatrolLoaded = ref(false);
const runtimeDefectLoaded = ref(false);
const runtimeAfterSalesLoaded = ref(false);
const runtimeProductionLoading = ref(true);
const runtimeIncomingLoading = ref(true);
const runtimeClosureLoading = ref(true);
const runtimeAfterSalesLoading = ref(true);
const runtimeProductionError = ref('');
const runtimeIncomingError = ref('');
const runtimeClosureError = ref('');
const runtimeAfterSalesError = ref('');
const runtimeProductionLoadedAt = ref('');
const runtimeIncomingLoadedAt = ref('');
const runtimeClosureLoadedAt = ref('');
const runtimeAfterSalesLoadedAt = ref('');
const activeQueueScope = ref<QueueScope>('all');

const productionRows = computed(() => runtimeProductionRows.value);
const incomingRows = computed(() => runtimeIncomingRows.value);

function isClosed(status: string) {
  return ['合格', '免检放行', '检验完成', '已关闭', '已作废'].includes(status);
}

function queueTone(conclusion: string, stage: string): QueueTone {
  if (['不合格', '严重不良'].includes(conclusion) || ['待处理', '待处置'].includes(stage)) return 'danger';
  if (['部分判定', '部分合格', '异常'].includes(conclusion)
    || ['待复判', '待复检', '待整改', '待复查', '处置中', '待验证', '返工中', '供应商确认'].includes(stage)) return 'warning';
  if (isQualityDispositionClosed(stage)) return 'success';
  return 'neutral';
}

function subjectOf(row: QualityRecord) {
  return row.products[0]?.name || '待确认检验对象';
}

function metaOf(row: QualityRecord) {
  const batch = row.products[0]?.batch;
  return [batch && batch !== row.sourceDoc ? batch : '', row.productionLine || row.warehouse, row.inspector]
    .filter(Boolean)
    .join(' · ');
}

function checkpointIssueCount(row: QualityRecord) {
  return row.products.reduce(
    (sum, line) => sum + (line.inspectionItems || []).filter((item) => ['预警', '待整改', '不合格'].includes(item.result)).length,
    0,
  );
}

function qualityQuantityNumber(value: unknown) {
  return Number(String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function pendingDecisionQuantitySummary(row: QualityRecord) {
  return Array.from(new Set(row.products
    .map((product) => String(product.pendingQty || '').trim())
    .filter((value) => qualityQuantityNumber(value) > 0)))
    .join('、');
}

function qualityRecordFreezeBatchKeys(row: QualityRecord, page: QueueItem['page']) {
  return Array.from(new Set(row.products.map((product, index) => {
    const material = String(product.materialCode || product.name || `物料行${index + 1}`).trim();
    const batch = String(product.batch || '').trim();
    const sourceBatch = page === 'production'
      ? row.executionCard || row.reportBatch || row.sourceDoc
      : row.sourceDoc;
    const logicalBatch = batch || String(sourceBatch || row.code).trim();
    const lineIdentity = batch ? '' : product.receiptLineId || index + 1;
    return [material, logicalBatch, lineIdentity].filter(Boolean).join('|');
  }).filter(Boolean)));
}

function afterSalesFreezeBatchKeys(task: AfterSalesExecutionTask) {
  const products = task.products || [];
  return Array.from(new Set(products.map((product, index) => {
    const material = String(product.materialCode || product.name || `物料行${index + 1}`).trim();
    const batch = String(product.batch || '').trim();
    const logicalBatch = batch || task.afterSaleCode || task.sourceOrder || task.code;
    const lineIdentity = batch ? '' : product.sourceLineId || index + 1;
    return [material, logicalBatch, lineIdentity].filter(Boolean).join('|');
  }).filter(Boolean)));
}

function closureConclusionLabel(row: QueueItem) {
  return row.path.includes('/quality/patrol/') ? '巡检结果' : '不良判定';
}

function showQueueDispositionStage(row: QueueItem) {
  return !(
    row.inspectionConclusion === '待判定'
    && ['待判定', '未开始', '未进入处置'].includes(row.dispositionStage)
  );
}

function toQueueItem(row: QualityRecord, page: 'incoming' | 'production' | 'patrol' | 'defects'): QueueItem {
  const projection = projectQualityState({
    page,
    status: row.status,
    inspectionConclusion: row.inspectionConclusion,
    dispositionStage: row.dispositionStage,
    currentAction: row.currentAction,
    sourceType: row.sourceType,
    disposition: row.disposition,
    productResults: row.products.map((product) => product.result),
    qualityOutcome: row.qualityOutcome,
    defectLevel: row.defectLevel,
  });
  const dispositionStage = qualityDispositionStageDisplay(
    projection.inspectionConclusion,
    projection.dispositionStage,
  );
  const pendingQuantity = pendingDecisionQuantitySummary(row);
  const pendingJudgement = Boolean(pendingQuantity)
    || projection.inspectionConclusion === '待判定'
    || dispositionStage === '待判定';
  const currentAction = pendingQuantity
    ? `继续判定剩余 ${pendingQuantity}${/待处置|待复检|返工中/.test(dispositionStage) ? '，并处理已隔离数量' : ''}`
    : projection.currentAction;
  return {
    code: row.code,
    source: row.sourceDoc,
    type: row.sourceType,
    subject: subjectOf(row),
    meta: metaOf(row),
    inspectionConclusion: projection.inspectionConclusion,
    dispositionStage,
    currentAction,
    issueCount: checkpointIssueCount(row),
    path: `/quality/${page}/${encodeURIComponent(row.code)}?returnTo=${encodeURIComponent('/quality/workbench')}`,
    tone: queueTone(projection.inspectionConclusion, dispositionStage),
    page,
    pendingJudgement,
    frozen: page === 'incoming'
      ? !isClosed(row.status) && !isQualityDispositionClosed(dispositionStage)
      : page === 'production' && /入库抽检|入库质检/.test(row.sourceType) && !isQualityDispositionClosed(dispositionStage),
    freezeBatchKeys: qualityRecordFreezeBatchKeys(row, page),
  };
}

function actionable(rows: QualityRecord[], page: 'incoming' | 'production' | 'patrol' | 'defects') {
  return rows.map((row) => toQueueItem(row, page)).filter((row) => !isQualityDispositionClosed(row.dispositionStage));
}

const incomingQueue = computed(() => actionable(incomingRows.value, 'incoming'));
const productionQueue = computed(() => actionable(productionRows.value, 'production'));
const patrolRows = computed(() => runtimePatrolRows.value);
const defectClosureRows = computed(() => runtimeDefectRows.value);
const afterSalesQueue = computed(() => runtimeAfterSalesRows.value
  .filter((task) => ['待处理', '处理中'].includes(task.status))
  .map((task) => {
    const products = task.products || [];
    const first = products[0];
    const subject = first?.name || first?.materialCode || '待确认检验对象';
    const materialSummary = products.length > 1 ? `${subject} 等 ${products.length} 种物料` : subject;
    const meta = [task.party, task.sourceOrder, task.startedBy].filter(Boolean).join(' · ');
    return {
      code: task.code,
      source: task.afterSaleCode || task.sourceOrder || '',
      type: task.kind,
      subject: materialSummary,
      meta,
      inspectionConclusion: '待判定',
      dispositionStage: task.status === '处理中' ? '检验中' : '待检验',
      currentAction: task.status === '处理中' ? '登记检验结果' : '开始检验',
      issueCount: 0,
      path: task.path || `/quality/after-sales/${encodeURIComponent(task.code)}?returnTo=${encodeURIComponent('/quality/workbench')}`,
      tone: task.status === '处理中' ? 'warning' : 'neutral',
      page: 'after-sales',
      pendingJudgement: true,
      frozen: true,
      freezeBatchKeys: afterSalesFreezeBatchKeys(task),
    } as QueueItem;
  }));
const closureQueue = computed(() => [
  ...actionable(patrolRows.value, 'patrol'),
  ...actionable(defectClosureRows.value, 'defects'),
]);
const allQueueRows = computed(() => [
  ...incomingQueue.value,
  ...productionQueue.value,
  ...afterSalesQueue.value,
  ...closureQueue.value,
]);

function matchesQueueScope(row: QueueItem, scope = activeQueueScope.value) {
  if (scope === 'all') return true;
  if (scope === 'judgement') return row.pendingJudgement;
  if (scope === 'review') {
    return ['incoming', 'production'].includes(row.page)
      && /待复判|待复检|待处置|返工中/.test(row.dispositionStage);
  }
  if (scope === 'closure') return row.page === 'patrol' || row.page === 'defects';
  return row.frozen;
}

const visibleIncomingQueue = computed(() => incomingQueue.value.filter((row) => matchesQueueScope(row)));
const visibleProductionQueue = computed(() => productionQueue.value.filter((row) => matchesQueueScope(row)));
const visibleAfterSalesQueue = computed(() => afterSalesQueue.value.filter((row) => matchesQueueScope(row)));
const visibleClosureQueue = computed(() => closureQueue.value.filter((row) => matchesQueueScope(row)));
const visibleQueueCount = computed(() => allQueueRows.value.filter((row) => matchesQueueScope(row)).length);

const pendingJudgementCount = computed(() =>
  allQueueRows.value
    .filter((row) => row.pendingJudgement).length,
);
const pendingReviewCount = computed(() =>
  allQueueRows.value
    .filter((row) => ['incoming', 'production'].includes(row.page)
      && /待复判|待复检|待处置|返工中/.test(row.dispositionStage)).length,
);
const openDefectCount = computed(() => closureQueue.value.length);
const qualityFreezeCount = computed(() => new Set(
  allQueueRows.value
    .filter((row) => row.frozen)
    .flatMap((row) => row.freezeBatchKeys.length ? row.freezeBatchKeys : [`${row.page}|${row.code}`]),
).size);

const judgementSummaryReady = computed(() => (
  runtimeIncomingLoaded.value
  && runtimeProductionLoaded.value
  && runtimeAfterSalesLoaded.value
  && runtimePatrolLoaded.value
  && runtimeDefectLoaded.value
));
const reviewSummaryReady = computed(() => runtimeIncomingLoaded.value && runtimeProductionLoaded.value);
const closureSummaryReady = computed(() => runtimePatrolLoaded.value && runtimeDefectLoaded.value);
const freezeSummaryReady = computed(() => (
  runtimeIncomingLoaded.value
  && runtimeProductionLoaded.value
  && runtimeAfterSalesLoaded.value
));

const summaryCards = computed(() => [
  { scope: 'judgement' as const, label: '待检验判定', value: pendingJudgementCount.value, ready: judgementSummaryReady.value, helper: '来料、生产、售后与巡检', icon: ClipboardCheck, tone: 'neutral' },
  { scope: 'review' as const, label: '处置与复检', value: pendingReviewCount.value, ready: reviewSummaryReady.value, helper: '来料与生产复判、复检和处置', icon: AlertTriangle, tone: 'warning' },
  { scope: 'closure' as const, label: '巡检与不良', value: openDefectCount.value, ready: closureSummaryReady.value, helper: '巡检、整改与不良验证', icon: ShieldCheck, tone: 'danger' },
  { scope: 'freeze' as const, label: '质量冻结批次', value: qualityFreezeCount.value, ready: freezeSummaryReady.value, helper: '来料、入库检与售后待检', icon: PackageCheck, tone: 'warning' },
]);

function runtimeQualityClosureRows(
  seeds: QualityRecord[],
  records: QualityClosureRecord[],
  kind: QualityClosureKind,
) {
  const seedByCode = new Map(seeds.map((seed) => [seed.code, seed]));
  return records.flatMap((runtime) => {
    const row = {
      ...(seedByCode.get(runtime.code) || {}),
      ...(runtime.draft as Partial<QualityRecord>),
      code: runtime.code,
      status: runtime.status,
    } as QualityRecord;
    return Array.isArray(row.products) && row.code && (kind === 'patrol' ? row.sourceType : true) ? [row] : [];
  });
}

function qualityLoadedAt() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

async function refreshRuntimeQuality() {
  runtimeProductionLoading.value = true;
  runtimeIncomingLoading.value = true;
  runtimeClosureLoading.value = true;
  runtimeAfterSalesLoading.value = true;
  runtimeProductionError.value = '';
  runtimeIncomingError.value = '';
  runtimeClosureError.value = '';
  runtimeAfterSalesError.value = '';
  const [productionResult, incomingResult, closureResult, afterSalesResult] = await Promise.allSettled([
    listProductionQualityTasks(),
    listIncomingQualityRecords(),
    Promise.all([listQualityClosures('patrol'), listQualityClosures('defects')]),
    listAfterSalesExecutionTasks('quality'),
  ]);

  if (productionResult.status === 'fulfilled') {
    const tasks = productionResult.value;
    runtimeProductionRows.value = tasks.map(productionQualityRecordFromTask);
    runtimeProductionLoaded.value = true;
    runtimeProductionLoadedAt.value = qualityLoadedAt();
  } else {
    runtimeProductionError.value = productionResult.reason instanceof Error
      ? productionResult.reason.message
      : '生产质检数据暂时无法读取。';
    if (!runtimeProductionLoaded.value) runtimeProductionRows.value = [];
  }
  runtimeProductionLoading.value = false;

  if (incomingResult.status === 'fulfilled') {
    runtimeIncomingRows.value = incomingResult.value.filter((record) => Array.isArray(record.products));
    runtimeIncomingLoaded.value = true;
    runtimeIncomingLoadedAt.value = qualityLoadedAt();
  } else {
    runtimeIncomingError.value = incomingResult.reason instanceof Error
      ? incomingResult.reason.message
      : '来料质检数据暂时无法读取。';
    if (!runtimeIncomingLoaded.value) runtimeIncomingRows.value = [];
  }
  runtimeIncomingLoading.value = false;

  if (closureResult.status === 'fulfilled') {
    const [patrolRecords, defectRecords] = closureResult.value;
    runtimePatrolRows.value = runtimeQualityClosureRows(qualityPatrolRows, patrolRecords, 'patrol');
    runtimeDefectRows.value = runtimeQualityClosureRows(defectRows, defectRecords, 'defects');
    runtimePatrolLoaded.value = true;
    runtimeDefectLoaded.value = true;
    runtimeClosureLoadedAt.value = qualityLoadedAt();
  } else {
    runtimeClosureError.value = closureResult.reason instanceof Error
      ? closureResult.reason.message
      : '巡检与不良处理数据暂时无法读取。';
    if (!runtimePatrolLoaded.value) runtimePatrolRows.value = [];
    if (!runtimeDefectLoaded.value) runtimeDefectRows.value = [];
  }
  runtimeClosureLoading.value = false;

  if (afterSalesResult.status === 'fulfilled') {
    runtimeAfterSalesRows.value = afterSalesResult.value;
    runtimeAfterSalesLoaded.value = true;
    runtimeAfterSalesLoadedAt.value = qualityLoadedAt();
  } else {
    runtimeAfterSalesError.value = afterSalesResult.reason instanceof Error
      ? afterSalesResult.reason.message
      : '售后检验数据暂时无法读取。';
    if (!runtimeAfterSalesLoaded.value) runtimeAfterSalesRows.value = [];
  }
  runtimeAfterSalesLoading.value = false;
}

onMounted(refreshRuntimeQuality);
</script>

<template>
  <div class="page-stack quality-workbench-page">
    <section
      v-if="(runtimeProductionError && runtimeProductionLoaded) || (runtimeIncomingError && runtimeIncomingLoaded) || (runtimeAfterSalesError && runtimeAfterSalesLoaded) || (runtimeClosureError && runtimePatrolLoaded && runtimeDefectLoaded)"
      class="quality-workbench-load-warning"
      role="status"
    >
      <span>
        部分数据刷新失败，当前仅显示最近一次成功快照。
        <template v-if="runtimeProductionError && runtimeProductionLoaded">生产质检 {{ runtimeProductionLoadedAt }}；</template>
        <template v-if="runtimeIncomingError && runtimeIncomingLoaded">来料质检 {{ runtimeIncomingLoadedAt }}；</template>
        <template v-if="runtimeAfterSalesError && runtimeAfterSalesLoaded">售后检验 {{ runtimeAfterSalesLoadedAt }}；</template>
        <template v-if="runtimeClosureError && runtimePatrolLoaded && runtimeDefectLoaded">巡检与不良 {{ runtimeClosureLoadedAt }}。</template>
      </span>
      <button class="secondary-action compact-action" type="button" title="重新读取质量工作台数据" @click="refreshRuntimeQuality">重试</button>
    </section>

    <section class="quality-summary-grid" aria-label="质量待办摘要">
      <button
        v-for="card in summaryCards"
        :key="card.label"
        type="button"
        class="quality-summary-card"
        :class="[`tone-${card.tone}`, { active: activeQueueScope === card.scope, 'is-loading': !card.ready }]"
        :disabled="!card.ready"
        :aria-busy="!card.ready"
        :aria-pressed="activeQueueScope === card.scope"
        :title="card.ready ? '按该责任筛选，再次点击恢复全部' : '正在汇总对应质量待办'"
        @click="activeQueueScope = activeQueueScope === card.scope ? 'all' : card.scope"
      >
        <component :is="card.icon" :size="18" />
        <span>{{ card.label }}</span>
        <strong>{{ card.ready ? card.value : '—' }}</strong>
        <small>{{ card.helper }}</small>
      </button>
    </section>

    <div v-if="activeQueueScope !== 'all'" class="quality-filter-result" role="status">
      <span>当前显示 {{ visibleQueueCount }} 项相关待办</span>
      <button type="button" class="quality-clear-filter" @click="activeQueueScope = 'all'">
        显示全部 {{ allQueueRows.length }} 项
      </button>
    </div>

    <div class="quality-queue-grid" :class="{ 'is-filtered': activeQueueScope !== 'all' }">
      <section v-if="activeQueueScope === 'all' || visibleIncomingQueue.length" class="quality-queue-panel quality-queue-incoming">
        <header>
          <div>
            <h2>来料质检待办</h2>
          </div>
          <RouterLink to="/quality/incoming">查看全部 <ArrowRight :size="14" /></RouterLink>
        </header>
        <ListLoadState
          v-if="runtimeIncomingLoading && !runtimeIncomingLoaded"
          loading
          title="来料质检待办"
          loading-message="正在读取最新来料质检任务。"
        />
        <ListLoadState
          v-else-if="runtimeIncomingError && !runtimeIncomingLoaded"
          :loading="false"
          title="来料质检待办"
          :message="runtimeIncomingError"
          @retry="refreshRuntimeQuality"
        />
        <div v-else-if="visibleIncomingQueue.length" class="quality-queue-list">
          <RouterLink v-for="row in visibleIncomingQueue" :key="row.code" :to="row.path" class="quality-queue-row">
            <div class="quality-queue-main">
              <span class="quality-queue-code">{{ row.code }}</span>
              <strong :title="row.subject">{{ row.subject }}</strong>
              <small>{{ row.source }} · {{ row.meta }}</small>
            </div>
            <div class="quality-queue-next">
              <div class="quality-queue-state">
                <span><small>检验结论</small><strong>{{ row.inspectionConclusion }}</strong></span>
                <span v-if="showQueueDispositionStage(row)"><small>处置阶段</small><i :class="`tone-${row.tone}`">{{ row.dispositionStage }}</i></span>
              </div>
              <b v-if="row.issueCount" class="quality-queue-issue">异常检查项 {{ row.issueCount }} 项</b>
              <small class="quality-queue-action">待办：{{ row.currentAction }}</small>
            </div>
          </RouterLink>
        </div>
        <p v-else class="quality-queue-empty">当前筛选下暂无来料质检待办</p>
      </section>

      <section v-if="activeQueueScope === 'all' || visibleProductionQueue.length" class="quality-queue-panel quality-queue-production">
        <header>
          <div>
            <h2>生产检验与处置</h2>
          </div>
          <RouterLink to="/quality/production">查看全部 <ArrowRight :size="14" /></RouterLink>
        </header>
        <ListLoadState
          v-if="runtimeProductionLoading && !runtimeProductionLoaded"
          loading
          title="生产检验与处置"
          loading-message="正在读取最新生产质检任务。"
        />
        <ListLoadState
          v-else-if="runtimeProductionError && !runtimeProductionLoaded"
          :loading="false"
          title="生产检验与处置"
          :message="runtimeProductionError"
          @retry="refreshRuntimeQuality"
        />
        <div v-else-if="visibleProductionQueue.length" class="quality-queue-list">
          <RouterLink v-for="row in visibleProductionQueue" :key="row.code" :to="row.path" class="quality-queue-row">
            <div class="quality-queue-main">
              <span class="quality-queue-code">{{ row.code }}</span>
              <strong :title="row.subject">{{ row.subject }}</strong>
              <small>{{ row.type }} · {{ row.source }} · {{ row.meta }}</small>
            </div>
            <div class="quality-queue-next">
              <div class="quality-queue-state">
                <span><small>检验结论</small><strong>{{ row.inspectionConclusion }}</strong></span>
                <span v-if="showQueueDispositionStage(row)"><small>处置阶段</small><i :class="`tone-${row.tone}`">{{ row.dispositionStage }}</i></span>
              </div>
              <b v-if="row.issueCount" class="quality-queue-issue">异常检查项 {{ row.issueCount }} 项</b>
              <small class="quality-queue-action">待办：{{ row.currentAction }}</small>
            </div>
          </RouterLink>
        </div>
        <p v-else class="quality-queue-empty">当前筛选下暂无生产质检待办</p>
      </section>

      <section v-if="activeQueueScope === 'all' || visibleAfterSalesQueue.length" class="quality-queue-panel quality-queue-after-sales">
        <header>
          <div>
            <h2>售后检验待办</h2>
          </div>
          <RouterLink to="/quality/after-sales">查看全部 <ArrowRight :size="14" /></RouterLink>
        </header>
        <ListLoadState
          v-if="runtimeAfterSalesLoading && !runtimeAfterSalesLoaded"
          loading
          title="售后检验待办"
          loading-message="正在读取最新售后检验任务。"
        />
        <ListLoadState
          v-else-if="runtimeAfterSalesError && !runtimeAfterSalesLoaded"
          :loading="false"
          title="售后检验待办"
          :message="runtimeAfterSalesError"
          @retry="refreshRuntimeQuality"
        />
        <div v-else-if="visibleAfterSalesQueue.length" class="quality-queue-list">
          <RouterLink v-for="row in visibleAfterSalesQueue" :key="row.code" :to="row.path" class="quality-queue-row">
            <div class="quality-queue-main">
              <span class="quality-queue-code">{{ row.code }}</span>
              <strong :title="row.subject">{{ row.subject }}</strong>
              <small>{{ row.type }} · {{ row.source }} · {{ row.meta }}</small>
            </div>
            <div class="quality-queue-next">
              <div class="quality-queue-state">
                <span><small>检验结论</small><strong>{{ row.inspectionConclusion }}</strong></span>
                <span><small>任务阶段</small><i :class="`tone-${row.tone}`">{{ row.dispositionStage }}</i></span>
              </div>
              <small class="quality-queue-action">待办：{{ row.currentAction }}</small>
            </div>
          </RouterLink>
        </div>
        <p v-else class="quality-queue-empty">当前筛选下暂无售后检验待办</p>
      </section>

      <section v-if="activeQueueScope === 'all' || visibleClosureQueue.length" class="quality-queue-panel quality-queue-panel-wide quality-queue-closure">
        <header>
          <div>
            <h2>巡检、整改与不良处理</h2>
          </div>
          <nav class="quality-queue-links" aria-label="查看处理列表">
            <RouterLink to="/quality/patrol">查看巡检 <ArrowRight :size="14" /></RouterLink>
            <RouterLink to="/quality/defects">查看不良 <ArrowRight :size="14" /></RouterLink>
          </nav>
        </header>
        <ListLoadState
          v-if="runtimeClosureLoading && !runtimePatrolLoaded && !runtimeDefectLoaded"
          loading
          title="整改与不良处理"
          loading-message="正在读取最新巡检与不良闭环记录。"
        />
        <ListLoadState
          v-else-if="runtimeClosureError && !runtimePatrolLoaded && !runtimeDefectLoaded"
          :loading="false"
          title="整改与不良处理"
          :message="runtimeClosureError"
          @retry="refreshRuntimeQuality"
        />
        <div v-else-if="visibleClosureQueue.length" class="quality-queue-list quality-closure-list">
          <RouterLink v-for="row in visibleClosureQueue" :key="`${row.type}-${row.code}`" :to="row.path" class="quality-queue-row">
            <div class="quality-queue-main">
              <span class="quality-queue-code">{{ row.code }}</span>
              <strong :title="row.subject">{{ row.subject }}</strong>
              <small>{{ row.type }} · {{ row.source }} · {{ row.meta }}</small>
            </div>
            <div class="quality-queue-next">
              <div class="quality-queue-state">
                <span><small>{{ closureConclusionLabel(row) }}</small><strong>{{ row.inspectionConclusion }}</strong></span>
                <span><small>处理阶段</small><i :class="`tone-${row.tone}`">{{ row.dispositionStage }}</i></span>
              </div>
              <b v-if="row.issueCount" class="quality-queue-issue">异常检查项 {{ row.issueCount }} 项</b>
              <small class="quality-queue-action">待办：{{ row.currentAction }}</small>
            </div>
          </RouterLink>
        </div>
        <p v-else class="quality-queue-empty">当前筛选下暂无待处理质量事项</p>
      </section>
      <p v-if="activeQueueScope !== 'all' && !visibleQueueCount" class="quality-queue-empty quality-queue-empty-wide">
        当前责任分类没有待处理事项
      </p>
    </div>
  </div>
</template>

<style scoped>
.quality-workbench-page {
  gap: 14px;
}

.quality-workbench-load-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 42px;
  padding: 8px 10px 8px 14px;
  border: 1px solid #e7ddc6;
  border-radius: 10px;
  background: #fffdf7;
  color: #78652f;
  font-size: 12px;
}

.quality-clear-filter {
  padding: 7px 10px;
  border: 1px solid #d9ded7;
  border-radius: 8px;
  background: #fff;
  color: #4c584e;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.quality-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quality-summary-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px 10px;
  min-width: 0;
  min-height: 70px;
  padding: 11px 13px;
  border: 1px solid #e1e5df;
  border-radius: 10px;
  background: #fff;
  color: #546056;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
}

.quality-summary-card:hover {
  border-color: #cbd4ca;
}

.quality-summary-card.is-loading,
.quality-summary-card:disabled {
  cursor: default;
}

.quality-summary-card.is-loading > svg,
.quality-summary-card.is-loading > span,
.quality-summary-card.is-loading small {
  opacity: 0.64;
}

.quality-summary-card.is-loading strong {
  color: #9aa29b;
}

.quality-summary-card.active {
  border-color: #8fa28f;
  background: #f5f8f4;
  box-shadow: inset 0 0 0 1px rgba(92, 118, 94, 0.08);
}

.quality-summary-card > span {
  color: #4d594f;
  font-size: 13px;
  font-weight: 650;
}

.quality-summary-card strong {
  color: #18221a;
  font-size: 22px;
  line-height: 1;
}

.quality-summary-card small {
  grid-column: 1 / -1;
  color: #879087;
  font-size: 11px;
}

.quality-summary-card.tone-warning { border-color: #e6ddc6; background: #fffdf7; }
.quality-summary-card.tone-danger { border-color: #ead8d4; background: #fffafa; }
.quality-summary-card.tone-warning.active { border-color: #c6aa6c; background: #fffaf0; }
.quality-summary-card.tone-danger.active { border-color: #bd877f; background: #fff6f4; }

.quality-filter-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: -4px;
  color: #667168;
  font-size: 12px;
}

.quality-queue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas:
    'incoming production'
    'after-sales production'
    'closure closure';
  align-items: start;
  gap: 14px;
}

.quality-queue-incoming { grid-area: incoming; }
.quality-queue-production { grid-area: production; }
.quality-queue-after-sales { grid-area: after-sales; }
.quality-queue-closure { grid-area: closure; }

.quality-queue-panel {
  min-width: 0;
  padding: 15px;
  border: 1px solid #e1e5df;
  border-radius: 11px;
  background: #fff;
}

.quality-queue-panel-wide {
  grid-column: 1 / -1;
}

.quality-queue-grid.is-filtered > .quality-queue-panel,
.quality-queue-empty-wide {
  grid-area: auto;
  grid-column: 1 / -1;
}

.quality-queue-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.quality-queue-panel header h2 {
  margin: 0;
  color: #202821;
  font-size: 17px;
}

.quality-queue-panel header > a,
.quality-queue-links a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #59675c;
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}

.quality-queue-links {
  display: flex;
  align-items: center;
  gap: 14px;
}

.quality-queue-list {
  display: grid;
  gap: 8px;
}

.quality-closure-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quality-queue-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(224px, 0.86fr);
  gap: 18px;
  padding: 13px 14px;
  border: 1px solid #eaede8;
  border-radius: 9px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: border-color 140ms ease, background 140ms ease;
}

.quality-queue-row:hover {
  border-color: #cfd8ce;
  background: #fafcf9;
}

.quality-queue-main,
.quality-queue-next {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.quality-queue-main strong {
  overflow: visible;
  color: #273129;
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}

.quality-queue-code {
  color: #738076;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.quality-queue-main small,
.quality-queue-next small {
  color: #7b857d;
  font-size: 12px;
  line-height: 1.5;
}

.quality-queue-next {
  align-items: flex-start;
  text-align: left;
}

.quality-queue-state {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 14px;
  min-width: 0;
}

.quality-queue-state > span {
  display: grid;
  justify-items: start;
  gap: 2px;
  min-width: 70px;
}

.quality-queue-state > span > small {
  color: #8b938c;
  font-size: 10px;
  font-weight: 650;
  line-height: 1.2;
}

.quality-queue-state strong {
  color: #303831;
  font-size: 12px;
  line-height: 22px;
}

.quality-queue-next i {
  width: max-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eff2ee;
  color: #5b665d;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.quality-queue-next i.tone-warning { background: #f8f0dc; color: #8a681b; }
.quality-queue-next i.tone-danger { background: #f8e8e5; color: #a24d43; }
.quality-queue-next i.tone-success { background: #e9f2e8; color: #4e7452; }

.quality-queue-issue {
  color: #a05247;
  font-size: 11px;
  font-weight: 700;
}

.quality-queue-action {
  max-width: 280px;
}

.quality-queue-empty {
  margin: 0;
  padding: 26px 12px;
  border: 1px dashed #dfe4dc;
  border-radius: 12px;
  color: #8b948c;
  text-align: center;
}

.is-spinning {
  animation: quality-spin 800ms linear infinite;
}

@keyframes quality-spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .quality-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quality-queue-grid { grid-template-columns: 1fr; grid-template-areas: none; }
  .quality-queue-incoming,
  .quality-queue-production,
  .quality-queue-after-sales,
  .quality-queue-closure { grid-area: auto; }
  .quality-queue-panel-wide { grid-column: auto; }
  .quality-closure-list { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .quality-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .quality-summary-card { min-height: 78px; padding: 11px; }
  .quality-summary-card > svg { display: none; }
  .quality-summary-card { grid-template-columns: minmax(0, 1fr) auto; }
  .quality-summary-card small { display: none; }
  .quality-queue-row { grid-template-columns: 1fr; }
  .quality-queue-next { align-items: flex-start; text-align: left; }
  .quality-queue-state { justify-content: flex-start; }
  .quality-queue-state > span { justify-items: start; }
  .quality-queue-action { max-width: none; }
}
</style>
