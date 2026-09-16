<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Plus } from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import ListLoadState from '../components/ListLoadState.vue';
import ListStatusOverview from '../components/ListStatusOverview.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import { useModulePermission } from '../composables/useModulePermission';
import {
  defectRows,
  incomingQualityRows,
  listIncomingQualityRecords,
  qualityPatrolRows,
  productionQualityRecordFromTask,
  type QualityRecord,
  type QualityStandardRecord,
  type QualityTabKey,
} from '../data/quality';
import { production2ExecutionCards, production2QualityTasks } from '../data/production2';
import {
  listProductionExecutionCards,
  listProductionQualityTasks,
  listPurchaseReceipts,
  listQualityClosures,
  listQualityStandards,
  type QualityClosureKind,
  type QualityClosureRecord,
} from '../services/api';
import { statusPresentationClass } from '../utils/statusPresentation';
import {
  isQualityDispositionClosed,
  projectQualityState,
  qualityDispositionStageDisplay,
} from '../utils/qualityState';

type QualityPageKey = QualityTabKey | 'standards';
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

type QualityFilterField = {
  key: FilterFieldKey;
  label: string;
  options: string[];
};

type QualityListRow = {
  page: QualityPageKey;
  code: string;
  sourceDoc: string;
  sourceType: string;
  sourceMeta: string;
  partyTitle: string;
  partySubtitle: string;
  itemTitle: string;
  itemSubtitle: string;
  status: string;
  taskStatus: string;
  lifecycleStatus: string;
  conclusion: string;
  pendingJudgement: boolean;
  conclusionMeta?: string;
  currentAction?: string;
  owner: string;
  date: string;
  dueDate: string;
  amountValue: number;
  defectCause?: string;
  defectLevel?: string;
  disposition?: string;
  linkedDefectCode?: string;
  failedQtyText?: string;
  impactSummary?: string;
  responsibilityTarget?: string;
  searchValues: unknown[];
};

const route = useRoute();
const { canWrite: canWriteQuality, readonlyReason: qualityReadonlyReason } = useModulePermission('quality');
const hoveredQualityRowCode = ref('');

const pageTitles: Record<QualityPageKey, string> = {
  incoming: '来料质检',
  production: '生产质检',
  patrol: '质量巡检',
  standards: '质检标准',
  defects: '不良记录',
};

const createButtonLabels: Partial<Record<QualityPageKey, string>> = {
  patrol: '新建巡检',
  standards: '新建标准',
  defects: '新建不良',
};

const searchPlaceholders: Record<QualityPageKey, string> = {
  incoming: '搜索质检单、入库单、供应商、物料、批次',
  production: '搜索质检单、类型、标准、工单、产线、受检物料、批次',
  patrol: '搜索巡检单、巡检类型、区域、产线、工单、批次、整改要求',
  standards: '搜索标准编号、质检类型、适用范围、检查项',
  defects: '搜索不良单、来源单据、客户/供应商、物料、处置方式',
};

const routePageMap: Record<string, QualityPageKey> = {
  incoming: 'incoming',
  production: 'production',
  patrol: 'patrol',
  standards: 'standards',
  defects: 'defects',
};

const pageRouteMap: Record<QualityPageKey, string> = {
  incoming: 'incoming',
  production: 'production',
  patrol: 'patrol',
  standards: 'standards',
  defects: 'defects',
};

const filtersByPage = ref<Record<QualityPageKey, BusinessFilters>>({
  incoming: emptyBusinessFilters(),
  production: emptyBusinessFilters(),
  patrol: emptyBusinessFilters(),
  standards: emptyBusinessFilters(),
  defects: emptyBusinessFilters(),
});
const draftFilters = ref<BusinessFilters>(emptyBusinessFilters());
const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('newest');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const incomingReceiptStatuses = ref<Record<string, string>>({});
const runtimeIncomingRows = ref<QualityRecord[]>([]);
const runtimeProductionRows = ref<QualityRecord[]>([]);
const runtimePatrolRows = ref<QualityRecord[]>([]);
const runtimeDefectRows = ref<QualityRecord[]>([]);
const runtimeStandardRows = ref<QualityStandardRecord[]>([]);
const runtimeIncomingLoaded = ref(false);
const runtimeProductionLoaded = ref(false);
const runtimePatrolLoaded = ref(false);
const runtimeDefectLoaded = ref(false);
const runtimeStandardsLoaded = ref(false);
const runtimeIncomingLoading = ref(true);
const runtimeProductionLoading = ref(true);
const runtimePatrolLoading = ref(true);
const runtimeDefectLoading = ref(true);
const runtimeStandardsLoading = ref(true);
const runtimeIncomingError = ref('');
const runtimeProductionError = ref('');
const runtimePatrolError = ref('');
const runtimeDefectError = ref('');
const runtimeStandardsError = ref('');
const runtimeIncomingLoadedAt = ref('');
const runtimeProductionLoadedAt = ref('');
const runtimePatrolLoadedAt = ref('');
const runtimeDefectLoadedAt = ref('');
const runtimeStandardsLoadedAt = ref('');
let toastTimer: number | undefined;

const availableStandardRows = computed(() => runtimeStandardsLoaded.value ? runtimeStandardRows.value : []);

const activePage = computed<QualityPageKey>(() => {
  const page = route.params.page?.toString();
  return page && routePageMap[page] ? routePageMap[page] : 'incoming';
});
const isRuntimePageRefreshing = computed(() => (
  (activePage.value === 'incoming' && runtimeIncomingLoading.value)
  || (activePage.value === 'production' && runtimeProductionLoading.value)
  || (activePage.value === 'patrol' && runtimePatrolLoading.value)
  || (activePage.value === 'defects' && runtimeDefectLoading.value)
  || (activePage.value === 'standards' && runtimeStandardsLoading.value)
));
const currentRuntimeHasSnapshot = computed(() => (
  activePage.value === 'incoming'
    ? runtimeIncomingLoaded.value
    : activePage.value === 'production'
      ? runtimeProductionLoaded.value
      : activePage.value === 'patrol'
        ? runtimePatrolLoaded.value
        : activePage.value === 'defects'
          ? runtimeDefectLoaded.value
          : runtimeStandardsLoaded.value
));
const currentRuntimeError = computed(() => (
  activePage.value === 'incoming'
    ? runtimeIncomingError.value
    : activePage.value === 'production'
      ? runtimeProductionError.value
      : activePage.value === 'patrol'
        ? runtimePatrolError.value
        : activePage.value === 'defects'
          ? runtimeDefectError.value
          : runtimeStandardsError.value
));
const currentRuntimeLoadedAt = computed(() => (
  activePage.value === 'incoming'
    ? runtimeIncomingLoadedAt.value
    : activePage.value === 'production'
      ? runtimeProductionLoadedAt.value
      : activePage.value === 'patrol'
        ? runtimePatrolLoadedAt.value
        : activePage.value === 'defects'
          ? runtimeDefectLoadedAt.value
          : runtimeStandardsLoadedAt.value
));
const isRuntimeListLoading = computed(() => (
  isRuntimePageRefreshing.value && !currentRuntimeHasSnapshot.value
));
const runtimeWriteReady = computed(() => (
  currentRuntimeHasSnapshot.value
  && !isRuntimePageRefreshing.value
  && !currentRuntimeError.value
));
const runtimeWriteDisabledReason = computed(() => {
  if (!currentRuntimeHasSnapshot.value) return `${pageTitle.value}运行事实尚未加载完成`;
  if (isRuntimePageRefreshing.value) return `正在刷新${pageTitle.value}，完成前不能新建记录`;
  if (currentRuntimeError.value) return `当前显示上次成功结果，重新连接后才能新建记录`;
  return '';
});
const createDisabledReason = computed(() => (
  canWriteQuality.value ? runtimeWriteDisabledReason.value : qualityReadonlyReason.value
));
const pageTitle = computed(() => pageTitles[activePage.value]);
const createButtonLabel = computed(() => createButtonLabels[activePage.value] || '');
const canCreateDocument = computed(() => ['patrol', 'defects'].includes(activePage.value));
const createButtonPath = computed(() => (
  canCreateDocument.value ? `/quality/${pageRouteMap[activePage.value]}/new` : ''
));
const runtimeLoadingMessage = computed(() => (
  activePage.value === 'production'
    ? '正在加载最新生产质检任务'
    : `正在加载最新${pageTitle.value}运行数据`
));
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
  const options: Record<QualityPageKey, { status: string; party: string; owner: string; date: string }> = {
    incoming: { status: '当前阶段', party: '供应商', owner: '检验员', date: '任务日期' },
    production: { status: '当前阶段', party: '产线', owner: '检验员', date: '任务日期' },
    patrol: { status: '巡检状态', party: '区域/产线', owner: '巡检员', date: '巡检日期' },
    standards: { status: '使用状态', party: '适用对象', owner: '维护人', date: '更新时间' },
    defects: { status: '处理状态', party: '责任方', owner: '登记人', date: '登记日期' },
  };
  return options[activePage.value];
});
const filterDateLabel = computed(() => filterLabels.value.date);
const partyColumnLabel = computed(() => (
  activePage.value === 'incoming' ? '供应商/检验标准' : filterLabels.value.party
));
const itemColumnLabel = computed(() => {
  if (activePage.value === 'standards') return '标准名称/检查项';
  if (activePage.value === 'production') return '受检物料/批次';
  if (activePage.value === 'patrol') return '巡检对象/项目';
  if (activePage.value === 'defects') return '不良对象/批次';
  return '物料/批次';
});
const conclusionColumnLabel = computed(() => {
  if (activePage.value === 'patrol') return '巡检结果';
  if (activePage.value === 'defects') return '不良判定';
  return '检验结论';
});
const sortAmountLabel = computed(() => {
  if (activePage.value === 'defects') return '不良明细行数从多到少';
  if (activePage.value === 'standards') return '检查项数量从多到少';
  if (activePage.value === 'patrol') return '巡检点位从多到少';
  return '抽检数量从高到低';
});
const amountSortableQualityPages = new Set<QualityPageKey>(['patrol', 'defects', 'standards']);
const showAmountSort = computed(() => amountSortableQualityPages.has(activePage.value));
const showStatusSort = computed(() => true);
const sourceColumnLabel = computed(() => {
  if (activePage.value === 'patrol') return '巡检单/来源';
  if (activePage.value === 'defects') return '不良单/来源';
  return '质检单/来源';
});
const exportDocumentNumberLabel = computed(() => {
  if (activePage.value === 'patrol') return '巡检单号';
  if (activePage.value === 'defects') return '不良单号';
  return '质检单号';
});
const exportStageColumnLabel = computed(() => (
  ['patrol', 'defects'].includes(activePage.value) ? '处理阶段' : '处置阶段'
));
const exportHandlingColumnLabel = computed(() => (
  activePage.value === 'incoming' ? '业务处置' : activePage.value === 'patrol' ? '处理方式' : '处置方式'
));

function detailStageLabelForList(row: QualityListRow) {
  return ['patrol', 'defects'].includes(row.page) ? '处理' : '处置';
}

function qualitySourceTypeLabel(page: QualityPageKey, sourceType: string) {
  if (page === 'incoming' && ['采购入库', '采购到货'].includes(sourceType)) return '采购收货';
  return sourceType;
}

function qualityDispositionLabel(page: QualityPageKey, disposition: string | undefined, status = '') {
  const value = String(disposition || '').trim();
  if (page !== 'incoming') return value || '待处置';
  const labels: Record<string, string> = {
    放行入库: '合格转待入库',
    放行: '合格转待入库',
    直接入库: '免检转待入库',
    让步入库: '让步转待入库',
    让步接收: '让步转待入库',
    质检隔离: '不合格隔离',
  };
  if (labels[value] || value) return labels[value] || value;
  if (status === '合格') return '合格转待入库';
  if (status === '免检放行') return '免检转待入库';
  if (status === '不合格') return '不合格隔离';
  if (status === '待复判') return '待处置 / 待复检';
  return '待处置';
}

function qualityListItemFacts(page: QualityTabKey, row: QualityRecord) {
  const line = row.products[0];
  if (!line) return '-';
  const failed = line.failedQty && parseQty(line.failedQty) > 0 ? line.failedQty : '';
  if (page === 'production') {
    return [
      line.qty ? `受检 ${line.qty}` : '',
      line.batch && line.batch !== row.sourceDoc ? `批次 ${line.batch}` : '',
      line.sampleQty ? `抽检 ${line.sampleQty}` : '',
      failed ? `不良 ${failed}` : '',
    ].filter(Boolean).join(' · ') || '-';
  }
  if (page === 'incoming') {
    const rejected = qualityRejectedQuantitySummary(row);
    const pending = qualityPendingDecisionQuantitySummary(row);
    return [
      line.qty ? `到货 ${line.qty}` : '',
      line.batch ? `批次 ${line.batch}` : '',
      line.sampleQty ? `抽检 ${line.sampleQty}` : '',
      failed ? `样本异常 ${failed}` : '',
      rejected ? `不合格 ${rejected}` : '',
      pending ? `未判定 ${pending}` : '',
      row.products.length > 1 ? `共 ${row.products.length} 项` : '',
    ].filter(Boolean).join(' · ') || '-';
  }
  if (page === 'patrol') {
    return [
      line.qty,
      line.batch ? `批次 ${line.batch}` : '',
      line.sampleQty,
      failed ? `异常 ${failed}` : '',
      row.products.length > 1 ? `共 ${row.products.length} 项` : '',
    ].filter(Boolean).join(' · ') || '-';
  }
  return [
    line.qty,
    line.batch,
    line.sampleQty ? `抽检 ${line.sampleQty}` : '',
    failed ? `不良 ${failed}` : '',
    row.products.length > 1 ? `共 ${row.products.length} 项` : '',
  ].filter(Boolean).join(' · ') || '-';
}

function positiveQualityQuantitySummary(values: Array<string | undefined>) {
  return Array.from(new Set(values
    .map((value) => String(value || '').trim())
    .filter((value) => parseQty(value) > 0)))
    .join('、');
}

function qualityPendingDecisionQuantitySummary(row: QualityRecord) {
  return positiveQualityQuantitySummary(row.products.map((product) => product.pendingQty));
}

function qualityRejectedQuantitySummary(row: QualityRecord) {
  return positiveQualityQuantitySummary(row.products.map((product) => product.rejectedQty));
}

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
const qualityEmptyTitle = computed(() => (hasListConstraints.value ? `未找到匹配${pageTitle.value}` : `暂无${pageTitle.value}`));
const qualityEmptyDescription = computed(() => {
  if (hasListConstraints.value) return '可以调整搜索、排序或筛选条件后再查看。';
  if (activePage.value === 'standards') return '新建质检标准后会显示在这里。';
  if (activePage.value === 'defects') return '新建不良记录或质检判定不合格后会显示在这里。';
  if (activePage.value === 'patrol') return '新建质量巡检或现场主动抽查后会显示在这里。';
  if (activePage.value === 'production') return '生产流转触发开机首检、半成品质检、报工全检或入库抽检后会显示在这里。';
  return '采购收货提交后会自动生成来料质检任务。';
});

const activeSourceRows = computed(() => {
  const rows = activePage.value === 'incoming'
    ? runtimeIncomingLoaded.value ? runtimeIncomingRows.value : []
    : activePage.value === 'production'
      ? runtimeProductionLoaded.value ? runtimeProductionRows.value : []
      : activePage.value === 'patrol'
        ? runtimePatrolLoaded.value ? runtimePatrolRows.value : []
        : runtimeDefectLoaded.value ? runtimeDefectRows.value : [];
  return rows;
});

function runtimeQualityStatus(row: QualityRecord) {
  if (activePage.value !== 'incoming') return row.status;
  const receiptStatus = incomingReceiptStatuses.value[row.sourceDoc];
  if (['待入库', '已入库'].includes(receiptStatus) && ['待检验', '待复判'].includes(row.status)) return '合格';
  return row.status;
}

function runtimeLoadedAtText() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function runtimeLoadError(scope: string, error: unknown) {
  const detail = error instanceof Error && error.message.trim() ? `：${error.message}` : '';
  return `${scope}运行数据加载失败${detail}`;
}

async function loadIncomingReceiptStatuses() {
  runtimeIncomingLoading.value = true;
  runtimeIncomingError.value = '';
  try {
    const [receipts, documents] = await Promise.all([listPurchaseReceipts(), listIncomingQualityRecords()]);
    const seedByCode = new Map(incomingQualityRows.map((seed) => [seed.code, seed]));
    const nextRows = documents
      .filter((record) => Array.isArray(record.products))
      .map((record) => {
        const seed = seedByCode.get(record.code);
        return seed ? { ...seed, ...record, products: record.products } : record;
      });
    incomingReceiptStatuses.value = Object.fromEntries(receipts.map((receipt) => [receipt.code, receipt.status]));
    runtimeIncomingRows.value = nextRows;
    runtimeIncomingLoaded.value = true;
    runtimeIncomingLoadedAt.value = runtimeLoadedAtText();
  } catch (error) {
    runtimeIncomingError.value = runtimeLoadError('来料质检', error);
  } finally {
    runtimeIncomingLoading.value = false;
  }
}

async function loadRuntimeProductionQuality() {
  runtimeProductionLoading.value = true;
  runtimeProductionError.value = '';
  try {
    const [cards, tasks] = await Promise.all([listProductionExecutionCards(), listProductionQualityTasks()]);
    const records = tasks.map(productionQualityRecordFromTask);
    production2ExecutionCards.splice(0, production2ExecutionCards.length, ...cards);
    production2QualityTasks.splice(0, production2QualityTasks.length, ...tasks);
    runtimeProductionRows.value = records;
    runtimeProductionLoaded.value = true;
    runtimeProductionLoadedAt.value = runtimeLoadedAtText();
  } catch (error) {
    runtimeProductionError.value = runtimeLoadError('生产质检', error);
  } finally {
    runtimeProductionLoading.value = false;
  }
}

function mergeQualityClosureRows(seeds: QualityRecord[], records: QualityClosureRecord[], kind: QualityClosureKind) {
  const seedByCode = new Map(seeds.map((seed) => [seed.code, seed]));
  return records.flatMap((runtime) => {
    const seed = seedByCode.get(runtime.code);
    const draft = runtime.draft as Partial<QualityRecord>;
    const row = {
      ...(seed || {}),
      ...draft,
      code: runtime.code,
      status: runtime.status,
    } as QualityRecord;
    return Array.isArray(row.products) && row.code && (kind === 'patrol' ? row.sourceType : true) ? [row] : [];
  });
}

async function loadRuntimeQualityClosures(kind: QualityClosureKind) {
  const loading = kind === 'patrol' ? runtimePatrolLoading : runtimeDefectLoading;
  const loadError = kind === 'patrol' ? runtimePatrolError : runtimeDefectError;
  loading.value = true;
  loadError.value = '';
  try {
    const records = await listQualityClosures(kind);
    if (kind === 'patrol') {
      runtimePatrolRows.value = mergeQualityClosureRows(qualityPatrolRows, records, kind);
      runtimePatrolLoaded.value = true;
      runtimePatrolLoadedAt.value = runtimeLoadedAtText();
    } else {
      runtimeDefectRows.value = mergeQualityClosureRows(defectRows, records, kind);
      runtimeDefectLoaded.value = true;
      runtimeDefectLoadedAt.value = runtimeLoadedAtText();
    }
  } catch (error) {
    loadError.value = runtimeLoadError(kind === 'patrol' ? '质量巡检' : '不良记录', error);
  } finally {
    loading.value = false;
  }
}

const listRows = computed<QualityListRow[]>(() => {
  if (activePage.value === 'standards') {
    return availableStandardRows.value.map((row) => ({
      page: 'standards',
      code: row.code,
      sourceDoc: row.inspectionType,
      sourceType: row.scope,
      sourceMeta: row.scope,
      partyTitle: row.appliesTo,
      partySubtitle: row.sampleRule,
      itemTitle: row.name,
      itemSubtitle: row.checkpoints.join(' · '),
      status: row.status,
      taskStatus: row.status,
      lifecycleStatus: row.status,
      conclusion: '-',
      pendingJudgement: false,
      currentAction: '',
      owner: row.owner,
      date: row.updatedAt,
      dueDate: row.updatedAt,
      amountValue: row.checkpoints.length,
      searchValues: [
        row.code,
        row.name,
        row.inspectionType,
        row.scope,
        row.appliesTo,
        row.sampleRule,
        row.acceptance,
        row.owner,
        row.status,
        row.note,
        ...row.checkpoints,
      ],
    }));
  }

  return activeSourceRows.value.map((row) => {
    const status = runtimeQualityStatus(row);
    const page = activePage.value as QualityTabKey;
    const sourceType = qualitySourceTypeLabel(page, row.sourceType);
    const disposition = qualityDispositionLabel(activePage.value, row.disposition, status);
    const projection = projectQualityState({
      page,
      status,
      inspectionConclusion: row.inspectionConclusion,
      dispositionStage: row.dispositionStage,
      currentAction: row.currentAction,
      sourceType: row.sourceType,
      disposition: row.disposition,
      productResults: row.products.map((product) => product.result),
      qualityOutcome: row.qualityOutcome,
      defectLevel: row.defectLevel,
    });
    const taskStatus = qualityDispositionStageDisplay(
      projection.inspectionConclusion,
      projection.dispositionStage,
    );
    const lifecycleStatus = projection.lifecycleStatus;
    const firstLine = row.products[0];
    const reportContext = row.reportBatch
      && row.reportBatch !== row.sourceDoc
      && row.reportBatch !== firstLine?.batch
      ? row.reportBatch
      : '';
    const failedQtyText = firstLine?.failedQty ?? '';
    const conclusion = projection.inspectionConclusion;
    const pendingQuantity = qualityPendingDecisionQuantitySummary(row);
    const pendingJudgement = Boolean(pendingQuantity) || conclusion === '待判定';
    const currentAction = pendingQuantity
      ? `继续判定剩余 ${pendingQuantity}${/待处置|待复检|返工中/.test(taskStatus) ? '，并处理已隔离数量' : ''}`
      : projection.currentAction;
    const conclusionMeta = parseQty(failedQtyText) > 0
      ? `不良 ${failedQtyText}`
      : conclusion === '待判定'
        ? '等待检验判定'
        : '';
    const defectCause = activePage.value === 'defects' ? defectCauseText(row) : undefined;
    const responsibilityTarget = activePage.value === 'defects' ? defectResponsibilityText(row) : undefined;
    const impactSummary = activePage.value === 'defects' ? defectImpactText(row) : undefined;
    const itemFacts = qualityListItemFacts(page, row);
    return {
      page: activePage.value,
      code: row.code,
      sourceDoc: row.sourceDoc,
      sourceType,
      sourceMeta: (page === 'patrol'
        ? [row.qualityStandardName, row.shiftName]
        : [row.qualityStandardName, row.workOrder, ['production', 'incoming'].includes(page) ? '' : reportContext, row.shiftName])
        .filter(Boolean)
        .join(' · '),
      partyTitle: row.party,
      partySubtitle: [
        row.productionLine ?? (page === 'defects' ? '' : row.contact),
        row.shiftName,
        row.leader,
      ].filter(Boolean).join(' · '),
      itemTitle: firstLine?.name ?? '-',
      itemSubtitle: itemFacts || '-',
      status,
      taskStatus,
      lifecycleStatus,
      conclusion,
      pendingJudgement,
      conclusionMeta,
      currentAction,
      owner: row.inspector,
      date: row.date,
      dueDate: row.dueDate,
      amountValue: activePage.value === 'defects'
        ? row.products.filter((product) => parseQty(product.failedQty) > 0).length
        : row.products.reduce((sum, product) => sum + parseQty(product.sampleQty), 0),
      defectCause,
      defectLevel: row.defectLevel,
      disposition,
      linkedDefectCode: row.linkedDefectCode,
      failedQtyText,
      impactSummary,
      responsibilityTarget,
      searchValues: [
        row.code,
        row.sourceDoc,
        row.sourceType,
        sourceType,
        row.qualityStandardCode,
        row.qualityStandardName,
        row.workOrder,
        row.executionCard,
        row.reportBatch,
        row.shiftCode,
        row.shiftName,
        row.party,
        row.contact,
        row.inspector,
        row.status,
        status,
        pendingJudgement ? '待检验判定' : '',
        qualityStageIsRelevantValue(conclusion, taskStatus) ? normalizedQualityListStage(taskStatus) : '',
        conclusion,
        currentAction,
        row.conclusion,
        row.disposition,
        row.linkedDefectCode,
        disposition,
        defectCause,
        impactSummary,
        responsibilityTarget,
        row.productionLine,
        row.responsibilityProcess,
        row.defectLevel,
        row.operator,
        ...row.products.flatMap((product) => [
          product.name,
          product.qty,
          product.batch,
          product.sampleQty,
          product.failedQty,
          product.qualifiedQty,
          product.rejectedQty,
          product.pendingQty,
          product.result,
        ]),
      ],
    };
  });
});

const filterStatusOptions = computed(() => uniqueValues(listRows.value.flatMap(qualityListFilterStages)));
const filterPartyOptions = computed(() => uniqueValues(listRows.value.map((row) => row.partyTitle)));
const filterOwnerOptions = computed(() => uniqueValues(listRows.value.map((row) => row.owner)));
const filterFields = computed<QualityFilterField[]>(() => [
  { key: 'status', label: filterLabels.value.status, options: filterStatusOptions.value },
  { key: 'party', label: filterLabels.value.party, options: filterPartyOptions.value },
  { key: 'owner', label: filterLabels.value.owner, options: filterOwnerOptions.value },
]);

const visibleRows = computed(() => {
  const filtered = listRows.value.filter((row) => {
    const matchesSearch = includesKeyword(row.searchValues);
    const matchesStatus = !filterStatus.value || qualityListFilterStages(row).includes(filterStatus.value);
    const matchesParty = !filterParty.value || row.partyTitle === filterParty.value;
    const matchesOwner = !filterOwner.value || row.owner === filterOwner.value;
    const matchesDate = matchesDateRange(row.date);
    return matchesSearch && matchesStatus && matchesParty && matchesOwner && matchesDate;
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

function dateOnly(date: string) {
  return date.slice(0, 10);
}

function matchesDateRange(date: string) {
  const value = dateOnly(date);
  return (!filterDateStart.value || value >= filterDateStart.value) && (!filterDateEnd.value || value <= filterDateEnd.value);
}

function parseQty(value: string) {
  return Number(value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

function sortRows(rows: QualityListRow[]) {
  const statusRank: Record<string, number> = {
    启用: 1,
    草稿: 2,
    停用: 3,
    待检验判定: 1,
    待检验: 1,
    待巡检: 1,
    待复判: 2,
    待复检: 2,
    待判定: 1,
    未进入处置: 1,
    未开始: 1,
    待处置: 3,
    待整改: 3,
    待复查: 4,
    待处理: 3,
    处置中: 5,
    待验证: 6,
    返工中: 5,
    供应商确认: 5,
    合格: 7,
    免检放行: 8,
    检验完成: 8,
    无需处置: 8,
    已完成: 9,
    已关闭: 9,
    不合格: 10,
    已作废: 11,
  };
  const compareDate = (a: QualityListRow, b: QualityListRow, direction: 'asc' | 'desc') => {
    const first = String(a.date || '').trim();
    const second = String(b.date || '').trim();
    const firstMissing = !first || ['-', '—'].includes(first);
    const secondMissing = !second || ['-', '—'].includes(second);
    if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
    if (firstMissing) return 0;
    return direction === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
  };

  return [...rows].sort((a, b) => {
    if (sortMode.value === 'oldest') return compareDate(a, b, 'asc');
    if (sortMode.value === 'amountDesc') return b.amountValue - a.amountValue;
    if (sortMode.value === 'status') {
      return (statusRank[qualityListFilterStage(a)] ?? 99) - (statusRank[qualityListFilterStage(b)] ?? 99)
        || compareDate(a, b, 'asc');
    }
    return compareDate(a, b, 'desc');
  });
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function defectCauseText(row: QualityRecord) {
  const firstFailedLine = row.products.find((product) => parseQty(product.failedQty) > 0) ?? row.products[0];
  const firstProblem = firstFailedLine?.inspectionItems?.find((item) =>
    ['不合格', '待复判', '预警'].includes(item.result) || Boolean(item.defectLevel),
  );
  return [row.sourceType, row.responsibilityProcess, firstProblem?.name].filter(Boolean).join(' · ');
}

function defectResponsibilityText(row: QualityRecord) {
  if (row.productionLine || row.operator || row.leader) {
    return [row.responsibilityProcess, row.productionLine, row.operator || row.leader].filter(Boolean).join(' / ');
  }
  return [row.responsibilityProcess, row.party, row.contact].filter(Boolean).join(' / ');
}

function defectImpactText(row: QualityRecord) {
  const impact = [];
  if (row.note.includes('库存') || row.warehouse.includes('质检')) impact.push('库存冻结');
  if (row.workOrder) impact.push(row.workOrder);
  if (row.sourceType === '客户反馈') impact.push('售后补发');
  if (row.disposition) impact.push(row.disposition);
  return impact.join(' · ') || row.note || row.conclusion;
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

function primaryTransition(row: QualityListRow) {
  if (row.status === '待巡检') return { label: '完成巡检', next: '已关闭', remark: '巡检完成，无异常则直接归档。' };
  if (row.status === '待整改') return { label: '提交整改', next: '待复查', remark: '现场整改已提交，等待质量复查。' };
  if (row.status === '待复查') return { label: '复查通过', next: '已关闭', remark: '整改复查通过，巡检关闭。' };
  if (row.status === '待检验') return { label: '完成检验', next: '合格', remark: '检验完成并判定合格。' };
  if (row.status === '待复判') return { label: '复判放行', next: '合格', remark: '复判后允许放行。' };
  if (row.status === '不合格') return { label: '转不良处理', next: '待处理', remark: '质检不合格，进入不良处理。' };
  if (row.status === '待处理') return { label: '开始处置', next: '处置中', remark: '处置方案已确认，进入执行阶段。' };
  if (['处置中', '返工中', '供应商确认'].includes(row.status)) return { label: '提交验证', next: '待验证', remark: '处置完成，等待结果验证。' };
  if (row.status === '待验证') return { label: '验证通过', next: '已关闭', remark: '处置结果验证通过，不良记录关闭。' };
  return undefined;
}

function rowNextAction(row: QualityListRow) {
  if (row.currentAction) {
    return ['无需处置', '已完成', '已关闭', '已作废'].includes(row.taskStatus)
      ? row.currentAction
      : `下一步：${row.currentAction}`;
  }
  if (row.page === 'patrol' && row.linkedDefectCode) return `下一步：查看关联不良 ${row.linkedDefectCode}`;
  if (row.page === 'patrol' && row.status === '待复查') return '下一步：复查通过 / 升级不良';
  if (row.page === 'defects' && row.status === '待验证') return '下一步：验证通过 / 退回处置';
  const action = primaryTransition(row);
  if (action) return `下一步：${action.label}`;
  if (row.status === '部分判定') return '下一步：继续判定并处置不合格数量';
  if (row.page === 'incoming' && ['合格', '免检放行'].includes(row.status)) return '下一步：等待仓库入库';
  if (['合格', '免检放行'].includes(row.status)) return '下一步：已放行';
  if (row.status === '已关闭') return '下一步：已关闭';
  if (row.status === '已作废') return '下一步：已作废';
  return '下一步：等待处理';
}

function showRowCurrentAction(row: QualityListRow) {
  return !isQualityDispositionClosed(row.taskStatus) && row.lifecycleStatus !== '已作废';
}

function qualityStandardUsageHint(row: QualityListRow) {
  return row.taskStatus === '启用' ? '可用于新质检' : '仅供历史追溯';
}

const qualityStatusColumnTitle = computed(() => (
  activePage.value === 'standards'
    ? '使用状态'
    : '质量状态'
));
const qualityProgressDimensionLabels = computed(() => (
  ['incoming', 'production'].includes(activePage.value)
    ? `${conclusionColumnLabel.value} · 处置 · 当前待办`
    : `${conclusionColumnLabel.value} · 处理 · 当前待办`
));

function qualityListAction(row: QualityListRow) {
  if (!showRowCurrentAction(row)) return '';
  const action = row.currentAction || rowNextAction(row).replace(/^下一步：/, '');
  if (/完成首检.*放行/.test(action)) return '完成首检并判定放行';
  if (/完成报工全检.*合格.*不合格/.test(action)) return '完成报工全检并登记数量';
  if (/完成抽检.*整批放行或冻结/.test(action)) return '完成抽检并判定放行';
  if (/完成独立复检.*提交结论/.test(action)) return '完成复检并提交结论';
  if (/完成检查项.*未判定数量/.test(action)) return '完成检验判定';
  return action;
}

function normalizedQualityListStage(stage: string) {
  return /^未进入/.test(stage) ? '未开始' : stage;
}

function qualityStageIsRelevantValue(conclusion: string, stage: string) {
  return !(
    conclusion === '待判定'
    && ['待判定', '未开始', '未进入处置'].includes(normalizedQualityListStage(stage))
  );
}

function qualityFilterStageValue(conclusion: string, stage: string) {
  const normalizedStage = normalizedQualityListStage(stage);
  return qualityStageIsRelevantValue(conclusion, normalizedStage) ? normalizedStage : '待检验判定';
}

function qualityListFilterStage(row: QualityListRow) {
  return qualityListFilterStages(row)[0] || qualityFilterStageValue(row.conclusion, row.taskStatus);
}

function qualityListFilterStages(row: QualityListRow) {
  const stages = row.pendingJudgement ? ['待检验判定'] : [];
  const stage = qualityListStageStatus(row);
  if (qualityListStageIsRelevant(row, stage)) stages.push(stage);
  if (!stages.length) stages.push(qualityFilterStageValue(row.conclusion, row.taskStatus));
  return Array.from(new Set(stages.filter(Boolean)));
}

function qualityListStageStatus(row: QualityListRow) {
  return normalizedQualityListStage(row.taskStatus);
}

function qualityStageMirrorsLifecycle(stage: string, lifecycle: string) {
  if (stage === lifecycle) return true;
  return isQualityDispositionClosed(stage) && ['已完成', '已关闭', '已作废'].includes(lifecycle);
}

function qualityListStageIsRelevant(row: QualityListRow, stage = qualityListStageStatus(row)) {
  return qualityStageIsRelevantValue(row.conclusion, stage);
}

function qualityListStageTitle(row: QualityListRow) {
  const stage = qualityListStageStatus(row);
  return qualityListStageIsRelevant(row, stage)
    ? `，${detailStageLabelForList(row)}阶段：${stage}`
    : '';
}

function qualityListOverviewFacts(row: QualityListRow) {
  const stage = qualityListStageStatus(row);
  return [
    { label: conclusionColumnLabel.value, value: row.conclusion },
    ...(qualityListStageIsRelevant(row, stage) && !qualityStageMirrorsLifecycle(stage, row.lifecycleStatus)
      ? [{ label: detailStageLabelForList(row), value: stage }]
      : []),
  ];
}

function qualityCardOutcomeSummary(row: QualityListRow) {
  const stage = qualityListStageStatus(row);
  return [
    `${conclusionColumnLabel.value} ${row.conclusion}`,
    ...(qualityListStageIsRelevant(row, stage) && !qualityStageMirrorsLifecycle(stage, row.lifecycleStatus)
      ? [`${detailStageLabelForList(row)} ${stage}`]
      : []),
  ].join(' · ');
}

function qualityStaleAttention(row: QualityListRow) {
  if (row.page === 'standards' || isQualityDispositionClosed(row.taskStatus) || row.lifecycleStatus === '已作废') return '';
  const dueDate = dateOnly(String(row.dueDate || ''));
  const hasDueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  const taskDate = dateOnly(String(row.date || ''));
  const attentionDate = hasDueDate ? dueDate : taskDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attentionDate)) return '';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [taskYear, taskMonth, taskDay] = attentionDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const staleDays = Math.floor(
    (Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(taskYear, taskMonth - 1, taskDay)) / 86_400_000,
  );
  return staleDays > 0 ? `${hasDueDate ? '逾期' : '滞留'} ${staleDays} 天` : '';
}

async function loadRuntimeQualityStandards() {
  runtimeStandardsLoading.value = true;
  runtimeStandardsError.value = '';
  try {
    runtimeStandardRows.value = await listQualityStandards();
    runtimeStandardsLoaded.value = true;
    runtimeStandardsLoadedAt.value = runtimeLoadedAtText();
  } catch (error) {
    runtimeStandardsError.value = runtimeLoadError('质检标准', error);
  } finally {
    runtimeStandardsLoading.value = false;
  }
}

function localDateStamp() {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  const rows =
    activePage.value === 'standards'
      ? [
          ['标准编号', '质检类型', '适用对象', '检查项', '状态', '维护人', '更新时间'],
          ...visibleRows.value.map((row) => [
            row.code,
            row.sourceDoc,
            row.partyTitle,
            `${row.itemTitle} ${row.itemSubtitle}`,
            row.status,
            row.owner,
            row.date,
          ]),
        ]
      : [
          [
            exportDocumentNumberLabel.value,
            '来源',
            filterLabels.value.party,
            itemColumnLabel.value,
            conclusionColumnLabel.value,
            exportStageColumnLabel.value,
            exportHandlingColumnLabel.value,
            '当前待办',
            filterLabels.value.owner,
            filterLabels.value.date,
          ],
          ...visibleRows.value.map((row) => [
            row.code,
            `${row.sourceType} ${row.sourceDoc}`,
            row.partyTitle,
            `${row.itemTitle} ${row.itemSubtitle}`,
            row.conclusion,
            qualityListStageIsRelevant(row) ? qualityListStageStatus(row) : '—',
            row.disposition || '—',
            rowNextAction(row).replace(/^下一步：/, ''),
            row.owner,
            row.date,
          ]),
        ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pageTitle.value}-${localDateStamp()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  openToolbarMenu.value = null;
  showToast('已导出当前列表');
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}

function handleDocumentClick() {
  openToolbarMenu.value = null;
}

function refreshActiveRuntimePage() {
  if (activePage.value === 'incoming') return loadIncomingReceiptStatuses();
  if (activePage.value === 'production') return loadRuntimeProductionQuality();
  if (activePage.value === 'patrol') return loadRuntimeQualityClosures('patrol');
  if (activePage.value === 'defects') return loadRuntimeQualityClosures('defects');
  return loadRuntimeQualityStandards();
}

watch(
  () => activePage.value,
  () => {
    searchKeyword.value = '';
    sortMode.value = 'newest';
    syncDraftFilters();
    openToolbarMenu.value = null;
    void refreshActiveRuntimePage();
  },
);

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  void refreshActiveRuntimePage();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section class="list-page">
      <div class="quote-page quality-page">
        <PageTopbarPortal>
          <template #actions>
            <RouterLink v-if="activePage === 'standards' && canWriteQuality && runtimeWriteReady" class="primary-action" to="/quality/standards/new" :title="`新建${pageTitle}`">
              <Plus :size="15" />
              {{ createButtonLabel }}
            </RouterLink>
            <button v-else-if="activePage === 'standards'" class="primary-action" type="button" disabled :title="createDisabledReason">
              <Plus :size="15" />
              {{ createButtonLabel }}
            </button>
            <RouterLink v-else-if="canCreateDocument && canWriteQuality && runtimeWriteReady" class="primary-action" :to="createButtonPath" :title="`新建${pageTitle}`">
              <Plus :size="15" />
              {{ createButtonLabel }}
            </RouterLink>
            <button v-else-if="canCreateDocument" class="primary-action" type="button" disabled :title="createDisabledReason">
              <Plus :size="15" />
              {{ createButtonLabel }}
            </button>
          </template>
        </PageTopbarPortal>

        <OperationPermissionBanner
          v-if="!canWriteQuality"
          :message="qualityReadonlyReason"
          suffix="当前质量列表仅可查看，不能新建或维护质检标准。"
        />

        <ListLoadState
          v-if="isRuntimeListLoading"
          loading
          :title="pageTitle"
          :loading-message="runtimeLoadingMessage"
        />
        <ListLoadState
          v-else-if="currentRuntimeError && !currentRuntimeHasSnapshot"
          :loading="false"
          :title="pageTitle"
          :message="currentRuntimeError"
          @retry="refreshActiveRuntimePage"
        />

        <template v-else>
        <section
          v-if="isRuntimePageRefreshing || currentRuntimeError"
          class="quality-list-load-warning"
          role="status"
        >
          <div>
            <strong>{{ isRuntimePageRefreshing ? `正在刷新${pageTitle}` : '当前显示上次成功结果' }}</strong>
            <span>
              上次成功更新 {{ currentRuntimeLoadedAt || '-' }}；
              {{ isRuntimePageRefreshing ? '刷新完成前暂不可新建记录。' : `${currentRuntimeError}，重新连接前暂不可新建记录。` }}
            </span>
          </div>
          <button
            class="secondary-action compact-action"
            type="button"
            :disabled="isRuntimePageRefreshing"
            title="重新读取当前质量列表"
            @click="refreshActiveRuntimePage"
          >
            {{ isRuntimePageRefreshing ? '刷新中…' : '重试' }}
          </button>
        </section>

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
          :show-amount-sort="showAmountSort"
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

        <div
          class="quote-table-shell quality-list-shell with-status-column"
          :class="{
            'quality-standards-shell': activePage === 'standards',
            'quality-runtime-shell': activePage !== 'standards',
          }"
        >
          <div class="quote-data-scroll">
            <div class="data-table quote-table quality-table" :class="{ 'with-outcome': activePage !== 'standards', 'quality-standards-table': activePage === 'standards', 'quality-defects-table': activePage === 'defects' }">
              <div class="table-row table-head">
                <template v-if="activePage === 'standards'">
                  <span>标准</span>
                  <span>质检类型/环节</span>
                  <span>适用对象/抽样</span>
                  <span>检查项/维护</span>
                </template>
                <template v-else>
                  <span>{{ sourceColumnLabel }}</span>
                  <span>{{ partyColumnLabel }}</span>
                  <span>{{ itemColumnLabel }}</span>
                  <span>{{ filterLabels.owner }}/{{ filterLabels.date }}</span>
                </template>
              </div>
              <template v-for="row in visibleRows" :key="row.code">
                <RouterLink
                  v-if="row.page === 'standards'"
                  class="table-row quality-list-row order-list-row is-clickable"
                  :class="{ 'is-row-highlighted': hoveredQualityRowCode === row.code }"
                  :to="`/quality/standards/${encodeURIComponent(row.code)}`"
                  :aria-label="`打开质检标准 ${row.code}`"
                  :title="`打开质检标准 ${row.code}`"
                  @pointerenter="hoveredQualityRowCode = row.code"
                  @pointerleave="hoveredQualityRowCode = ''"
                  @mouseenter="hoveredQualityRowCode = row.code"
                  @mouseleave="hoveredQualityRowCode = ''"
                  @focus="hoveredQualityRowCode = row.code"
                  @blur="hoveredQualityRowCode = ''"
                >
                  <span class="standard-identity" :title="`${row.itemTitle} · ${row.code}`">
                    <strong>{{ row.itemTitle }}</strong>
                    <small>{{ row.code }}</small>
                  </span>
                  <span class="product-summary" :title="`${row.sourceDoc} · ${row.sourceMeta || row.sourceType}`">
                    <strong>{{ row.sourceDoc }}</strong>
                    <small :title="row.sourceMeta || row.sourceType">{{ row.sourceMeta || row.sourceType }}</small>
                  </span>
                  <span class="party-cell" :title="`${row.partyTitle} · ${row.partySubtitle}`">
                    <strong>{{ row.partyTitle }}</strong>
                    <small :title="row.partySubtitle">{{ row.partySubtitle }}</small>
                  </span>
                  <span class="standard-check-summary" :title="`${row.itemSubtitle} · ${row.owner} · ${row.date}`">
                    <strong>{{ row.amountValue }} 项检查</strong>
                    <small :title="row.itemSubtitle">{{ row.itemSubtitle }}</small>
                    <em>{{ row.owner }} · {{ row.date }}</em>
                  </span>
                </RouterLink>
                <RouterLink
                  v-else
                  class="table-row quality-list-row order-list-row is-clickable"
                  :class="{ 'is-row-highlighted': hoveredQualityRowCode === row.code }"
                  :to="`/quality/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`"
                  :aria-label="`打开${pageTitle} ${row.code}`"
                  :title="`打开${pageTitle} ${row.code}`"
                  @pointerenter="hoveredQualityRowCode = row.code"
                  @pointerleave="hoveredQualityRowCode = ''"
                  @mouseenter="hoveredQualityRowCode = row.code"
                  @mouseleave="hoveredQualityRowCode = ''"
                  @focus="hoveredQualityRowCode = row.code"
                  @blur="hoveredQualityRowCode = ''"
                >
                  <span class="quote-code quality-code-source">
                    <strong>{{ row.code }}</strong>
                    <small :title="`${row.sourceDoc} · ${row.sourceType}`">{{ row.sourceDoc }} · {{ row.sourceType }}</small>
                  </span>
                  <span class="party-cell">
                    <strong>{{ row.partyTitle }}</strong>
                    <small v-if="row.sourceMeta || row.partySubtitle" :title="row.sourceMeta || row.partySubtitle">{{ row.sourceMeta || row.partySubtitle }}</small>
                  </span>
                  <span class="product-summary">
                    <strong>{{ row.itemTitle }}</strong>
                    <small :title="row.itemSubtitle">{{ row.itemSubtitle }}</small>
                  </span>
                  <span class="date-stack">
                    <strong>{{ row.owner }}</strong>
                    <small>{{ row.date }}</small>
                  </span>
                </RouterLink>
              </template>
            </div>
          </div>

          <div class="quote-status-column">
            <div v-if="activePage === 'standards'" class="quote-status-head">{{ qualityStatusColumnTitle }}</div>
            <div v-else class="quote-status-head quality-overview-head">
              <strong>{{ qualityStatusColumnTitle }}</strong>
              <small>{{ qualityProgressDimensionLabels }}</small>
            </div>
            <template v-for="row in visibleRows" :key="`${row.code}-status`">
              <RouterLink
                v-if="row.page === 'standards'"
                class="quote-status-cell order-status-link quality-status-button"
                :class="{ 'is-row-highlighted': hoveredQualityRowCode === row.code }"
                :to="`/quality/standards/${encodeURIComponent(row.code)}`"
                :aria-label="`打开质检标准 ${row.code} 状态`"
                :title="`打开质检标准 ${row.code}，${qualityStandardUsageHint(row)}`"
                @pointerenter="hoveredQualityRowCode = row.code"
                @pointerleave="hoveredQualityRowCode = ''"
                @mouseenter="hoveredQualityRowCode = row.code"
                @mouseleave="hoveredQualityRowCode = ''"
                @focus="hoveredQualityRowCode = row.code"
                @blur="hoveredQualityRowCode = ''"
              >
                <i class="mini-status" :class="statusClass(row.lifecycleStatus)">{{ row.lifecycleStatus }}</i>
                <small>{{ qualityStandardUsageHint(row) }}</small>
              </RouterLink>
              <RouterLink
                v-else
                class="quote-status-cell order-status-link quality-overview-cell"
                :class="{ 'is-row-highlighted': hoveredQualityRowCode === row.code }"
                :to="`/quality/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`"
                :aria-label="`打开${pageTitle} ${row.code} 状态`"
                :title="`打开${pageTitle} ${row.code}，${conclusionColumnLabel}：${row.conclusion}${qualityListStageTitle(row)}${qualityStaleAttention(row) ? `，${qualityStaleAttention(row)}` : ''}，${rowNextAction(row)}`"
                @pointerenter="hoveredQualityRowCode = row.code"
                @pointerleave="hoveredQualityRowCode = ''"
                @mouseenter="hoveredQualityRowCode = row.code"
                @mouseleave="hoveredQualityRowCode = ''"
                @focus="hoveredQualityRowCode = row.code"
                @blur="hoveredQualityRowCode = ''"
              >
                <ListStatusOverview
                  :status="row.lifecycleStatus"
                  :attention="qualityStaleAttention(row)"
                  :facts="[
                    ...qualityListOverviewFacts(row),
                  ]"
                  :next-step="qualityListAction(row)"
                />
              </RouterLink>
            </template>
          </div>
        </div>

        <div v-if="!isRuntimeListLoading && visibleRows.length === 0" class="list-empty-state">
          <strong>{{ qualityEmptyTitle }}</strong>
          <span>{{ qualityEmptyDescription }}</span>
          <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
            清空条件
          </button>
        </div>

        <div v-if="!isRuntimeListLoading" class="quote-card-list">
          <template v-for="row in visibleRows" :key="`${row.code}-card`">
            <RouterLink
              v-if="row.page === 'standards'"
              class="quote-card is-clickable quality-card-button"
              :to="`/quality/standards/${encodeURIComponent(row.code)}`"
              :aria-label="`打开质检标准 ${row.code}`"
              :title="`打开质检标准 ${row.code}`"
            >
              <div class="quote-card-head">
                <div>
                  <strong>{{ row.itemTitle }}</strong>
                  <span>{{ row.code }} · {{ row.sourceDoc }}</span>
                </div>
                <i class="mini-status" :class="statusClass(row.lifecycleStatus)">{{ row.lifecycleStatus }}</i>
              </div>
              <div class="quote-card-main quote-card-products">
                <div>
                  <span>{{ row.partyTitle }} <small>{{ row.partySubtitle }}</small></span>
                </div>
                <strong>{{ row.amountValue }} 项</strong>
              </div>
              <div class="quote-card-meta">
                <span>{{ row.sourceMeta || row.sourceType }}</span>
                <span>{{ filterLabels.owner }} {{ row.owner }} · {{ filterLabels.date }} {{ row.date }}</span>
              </div>
            </RouterLink>
            <RouterLink
              v-else
              class="quote-card is-clickable"
              :to="`/quality/${pageRouteMap[row.page]}/${encodeURIComponent(row.code)}`"
              :title="`打开${pageTitle} ${row.code}`"
            >
              <div class="quote-card-head">
                <div>
                  <strong>{{ row.partyTitle }}</strong>
                  <span>{{ row.code }} · {{ row.sourceDoc }}</span>
                </div>
                <i class="mini-status" :class="statusClass(row.lifecycleStatus)">{{ row.lifecycleStatus }}</i>
              </div>
              <div class="quote-card-main quote-card-products">
                <div>
                  <span>{{ row.itemTitle }} <small>{{ row.itemSubtitle }}</small></span>
                </div>
                <strong>{{ filterLabels.date }} {{ row.date }}</strong>
              </div>
              <div class="quote-card-meta">
                <span>{{ filterLabels.owner }} {{ row.owner }}</span>
                <span>{{ row.sourceMeta || row.sourceType }}</span>
                <span v-if="qualityStaleAttention(row)" class="quality-card-attention">{{ qualityStaleAttention(row) }}</span>
                <span v-if="showRowCurrentAction(row)">{{ rowNextAction(row) }}</span>
                <span>{{ qualityCardOutcomeSummary(row) }}</span>
              </div>
            </RouterLink>
          </template>
        </div>

        <div v-if="!isRuntimeListLoading" class="table-footer">
          <span>显示 {{ visibleRows.length ? 1 : 0 }}-{{ visibleRows.length }} / 共 {{ visibleRows.length }} 条</span>
          <div class="pager">
            <button type="button" disabled title="已经是第一页">上一页</button>
            <strong>1</strong>
            <button type="button" disabled title="已经是最后一页">下一页</button>
          </div>
        </div>
        </template>
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

.quality-list-load-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #ead8ad;
  border-radius: 10px;
  background: #fffaf0;
  color: #6f5316;
}

.quality-list-load-warning > div {
  display: grid;
  gap: 3px;
}

.quality-list-load-warning strong {
  color: #4f3a0c;
}

.quality-list-load-warning span {
  font-size: 13px;
  line-height: 1.5;
}

.defect-trace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.defect-trace-column {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(35, 44, 35, 0.1);
  border-radius: 8px;
  background: #ffffff;
}

.defect-trace-column h3 {
  margin: 0;
  color: #232820;
  font-size: 13px;
}

.defect-trace-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding-top: 8px;
  border-top: 1px solid rgba(35, 44, 35, 0.08);
}

.defect-trace-row span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.defect-trace-row strong,
.defect-trace-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.defect-trace-row strong {
  color: #272c25;
  font-size: 13px;
}

.defect-trace-row small {
  color: #777c73;
  font-size: 12px;
}

.defect-trace-row em {
  min-width: 34px;
  padding: 3px 7px;
  border-radius: 999px;
  background: #f2f2ed;
  color: #3c4139;
  font-style: normal;
  font-weight: 700;
  text-align: center;
}

.defect-empty-line {
  margin: 0;
  color: #858980;
  font-size: 13px;
}

.quality-table .quote-code,
.quality-table .product-summary small,
.quality-table .party-cell small {
  white-space: normal;
  overflow-wrap: anywhere;
}

.quality-table .table-row {
  grid-template-columns:
    minmax(106px, 0.78fr)
    minmax(124px, 0.92fr)
    minmax(138px, 1fr)
    minmax(168px, 1.22fr)
    minmax(98px, 0.72fr);
}

.quality-table.with-outcome .table-row {
  grid-template-columns:
    minmax(142px, 1.02fr)
    minmax(124px, 0.9fr)
    minmax(168px, 1.2fr)
    minmax(88px, 0.62fr);
}

.quality-list-shell.quality-runtime-shell .quality-table {
  min-width: 0;
}

.quality-list-shell.with-status-column {
  grid-template-columns: minmax(0, 1fr) 192px;
}

.quality-list-shell.quality-runtime-shell.with-status-column {
  grid-template-columns: minmax(0, 1fr) 340px;
}

.quality-list-shell .quote-status-column {
  grid-auto-rows: 68px;
}

.quality-list-shell.quality-runtime-shell .quote-status-column {
  grid-auto-rows: 88px;
}

.quality-list-shell .quote-status-cell small {
  display: block;
  overflow: hidden;
  line-height: 1.32;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-table .quality-list-row {
  min-height: 68px;
}

.quality-table.with-outcome .quality-list-row {
  height: 88px;
  min-height: 88px;
}

.quality-table.quality-standards-table .quality-list-row {
  height: 82px;
  min-height: 82px;
  overflow: hidden;
  background: #ffffff;
}

.quality-table.quality-standards-table .table-row {
  grid-template-columns:
    minmax(178px, 1.02fr)
    minmax(126px, 0.74fr)
    minmax(214px, 1.28fr)
    minmax(190px, 1.12fr);
}

.quality-list-shell.quality-standards-shell.with-status-column {
  grid-template-columns: minmax(0, 1fr) 168px;
}

.quality-list-shell.quality-standards-shell .quote-status-column {
  grid-auto-rows: 82px;
}

.quality-table.quality-standards-table .quality-list-row > span {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.quality-table.quality-standards-table .standard-identity strong,
.quality-table.quality-standards-table .standard-check-summary strong,
.quality-table.quality-standards-table .product-summary strong,
.quality-table.quality-standards-table .party-cell strong,
.quality-table.quality-standards-table .standard-identity small,
.quality-table.quality-standards-table .standard-check-summary small,
.quality-table.quality-standards-table .product-summary small,
.quality-table.quality-standards-table .party-cell small {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  line-height: 1.28;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.quality-table.quality-standards-table .standard-identity strong,
.quality-table.quality-standards-table .standard-check-summary strong,
.quality-table.quality-standards-table .product-summary strong,
.quality-table.quality-standards-table .party-cell strong,
.quality-table.quality-standards-table .standard-check-summary em {
  font-size: 13px;
  font-weight: 650;
}

.quality-table.quality-standards-table .standard-identity small,
.quality-table.quality-standards-table .standard-check-summary small,
.quality-table.quality-standards-table .product-summary small,
.quality-table.quality-standards-table .party-cell small {
  font-size: 11px;
  font-weight: 450;
}

.quality-table.quality-standards-table .party-cell small {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  line-height: 1.28;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.quality-table.quality-standards-table .standard-identity small {
  color: #747b72;
  -webkit-line-clamp: 2;
}

.quality-table.quality-standards-table .standard-check-summary em {
  overflow: hidden;
  color: #737a71;
  font-size: 10px;
  font-style: normal;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-code-source {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.quality-code-source small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-table.quality-defects-table .quality-code-source small {
  display: -webkit-box;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.quality-code-source strong {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.22;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.quality-overview-head {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-content: center;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
}

.quality-overview-head strong {
  color: inherit;
  font-size: 12px;
  white-space: nowrap;
}

.quality-overview-head small {
  min-width: 0;
  overflow: hidden;
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-overview-cell {
  display: flex;
  align-items: stretch;
  padding: 7px 9px;
}

.quality-table .quality-list-row {
  color: inherit;
  text-align: left;
  text-decoration: none;
}

.quality-table button.quality-list-row,
.quality-status-button,
.quality-card-button {
  width: 100%;
  border: 0;
  appearance: none;
  font: inherit;
}

.quality-status-button {
  justify-items: start;
  background: #ffffff;
  text-align: left;
}

.quality-status-button small {
  justify-self: start;
  width: 100%;
  text-align: left;
}

.quality-card-button {
  color: inherit;
  text-align: left;
}

.quality-card-attention {
  color: #a34c3f;
  font-weight: 750;
}

.quality-table .table-row.is-clickable,
.quality-status-button,
.quality-card-button {
  cursor: pointer;
}

.quality-table .table-row.is-clickable:hover,
.quality-table .table-row.is-clickable:focus {
  background: #f7faf4;
}

.quality-table .table-row.is-clickable:focus {
  outline: 2px solid rgba(95, 152, 112, 0.32);
  outline-offset: -2px;
}

@media (max-width: 1260px) and (min-width: 761px) {
  .quality-list-shell.quality-runtime-shell.with-status-column {
    grid-template-columns: minmax(0, 1fr) 340px;
  }

  .quality-overview-head {
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 4px;
    padding-inline: 7px;
  }

  .quality-overview-cell {
    padding-inline: 7px;
  }
}

</style>
