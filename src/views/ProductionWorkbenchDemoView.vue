<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import ListLoadState from '../components/ListLoadState.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import {
  ArrowUp,
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Factory,
  ListChecks,
  PackageCheck,
  Pause,
  Plus,
  RadioTower,
  RefreshCw,
  TriangleAlert,
} from 'lucide-vue-next';
import {
  production2Exceptions,
  production2ExecutionCards,
  production2ProcessSteps,
  production2QualityTasks,
  production2Recipes,
  production2ReleaseBatches,
  production2Tasks,
  production2WorkOrders,
  type Production2ExecutionCard,
  type Production2Exception,
  type Production2OperationJob,
  type Production2ProcessStep,
  type Production2ReleaseBatch,
  type Production2ShiftHandover,
  type Production2WipBatch,
  type Production2WorkOrder,
} from '../data/production2';
import {
  apiBase,
  createProductionException,
  getProductionExecutionCard,
  getStoredSessionToken,
  handoverProductionShift,
  listProductionExceptions,
  listProductionQualityTasks,
  listProductionShiftHandovers,
  listWarehouseInventory,
  pauseProductionExecutionCard,
  receiveProductionShift,
  reportProductionExecutionCard,
  reportProductionWipBatch,
  resumeProductionExecutionCard,
  startProductionExecutionCard,
  startProductionOperationJob,
  type ProductionExecutionCardApiResponse,
} from '../services/api';
import type { WarehouseInventoryRow } from '../types/business';

type WorkbenchTab = 'schedule' | 'site' | 'postprocess' | 'exceptions';
type MasterStatus = '待确认' | '待释放' | '部分释放' | '待领料' | '生产中' | '部分入库' | '已完成';
type ChildStatus = '待释放' | '待领料' | '队列中' | '待首检' | '生产中' | '待入库' | '异常/返工' | '已入库';
type LineStatus = '空闲' | '待开工' | '待首检' | '生产中' | '已完工' | '暂停中' | '异常停机';

function workbenchStatusLabel(value: unknown) {
  const status = String(value || '');
  const exact: Record<string, string> = {
    待释放: '待安排',
    部分释放: '部分安排',
    已释放: '已安排',
    可释放: '可安排',
    释放受阻: '暂不可安排',
    短关待处理: '提前结束待处理',
  };
  return (exact[status] || status)
    .replace(/处置闭环/g, '处理完成')
    .replace(/释放批次/g, '生产安排')
    .replace(/释放工单到现场/g, '安排工单生产')
    .replace(/释放工单/g, '安排生产')
    .replace(/释放/g, '安排')
    .replace(/短关/g, '提前结束')
    .replace(/齐套/g, '备齐')
    .replace(/领料过账/g, '确认领料出库')
    .replace(/入库过账/g, '确认入库')
    .replace(/出库过账/g, '确认出库')
    .replace(/过账/g, '确认')
    .replace(/回写/g, '同步')
    .replace(/闭环/g, '处理完成');
}
type WipStage = '待报工质检' | '待排包装' | '待打包' | '包装中' | '待入库抽检' | '待入库' | '已入库';
type SchedulableKind = 'master' | 'lot';
type LinePrimaryAction =
  | 'take-next'
  | 'detail'
  | 'material'
  | 'start'
  | 'leader'
  | 'report'
  | 'resume'
  | 'wip'
  | 'quality'
  | 'inbound'
  | 'exception-detail'
  | 'wait'
  | 'none';

type TaskProduct = {
  code: string;
  name: string;
  model: string;
  spec: string;
  qty: number;
  unit: string;
  inboundQty: number;
};

type ProductionTask = {
  code: string;
  source: string;
  priority: string;
  status: '待建工单' | '部分建单' | '已建单' | '已完成';
  createdAt: string;
  dueDate: string;
  owner: string;
  products: TaskProduct[];
};

type MasterOrder = {
  code: string;
  taskCode: string;
  dueDate: string;
  productCode: string;
  productName: string;
  planQty: number;
  unit: string;
  recipe: string;
  process: string;
  lineType: string;
  status: MasterStatus;
  colorist?: string;
  colorAt?: string;
  colorNote?: string;
  revision: number;
  documentStatus: string;
  nextAction: string;
  materialNeeds: Array<{ materialCode: string; materialName: string; qtyPer: number; status?: string }>;
};

type ChildOrder = {
  code: string;
  executionCardCode: string;
  materialIssueCode?: string;
  masterCode: string;
  productCode: string;
  productName: string;
  planQty: number;
  unit: string;
  goodQty: number;
  defectQty: number;
  status: ChildStatus;
  node: string;
  line?: string;
  materialIssued: boolean;
  releaseConfirmed: boolean;
};

type LineQueue = {
  code: string;
  name: string;
  type: string;
  workshop: string;
  capacityValue: number;
  capacityUnit: string;
  processScope: string;
  schedulable: boolean;
  status: LineStatus;
  currentChildCode: string;
  currentOperationJobCode: string;
  leader: string;
  startedAt: string;
  lastReportAt: string;
  lastReportCode: string;
  lastReportQty: number;
  lastReportUnit: string;
  queue: string[];
  queueNotes: Record<string, string>;
};

type ProductionLineRuntime = {
  code: string;
  name: string;
  type: string;
  workshop?: string;
  capacityValue?: number;
  capacityUnit?: string;
  processScope?: string;
  status: string;
};

type WipLot = {
  code: string;
  releaseCode: string;
  productName: string;
  qty: number;
  inboundQty: number;
  unit: string;
  stage: WipStage;
  quality: '待检' | '合格' | '部分合格' | '返工' | '报废';
  location: string;
  createdAt: string;
};

type OperationPanel =
  | { type: 'split'; masterCode: string }
  | { type: 'dispatch'; childCode: string }
  | { type: 'material'; childCode: string }
  | { type: 'start'; lineName: string }
  | { type: 'pause'; lineName: string }
  | { type: 'resume'; lineName: string }
  | { type: 'leader'; lineName: string }
  | { type: 'report'; lineName: string }
  | { type: 'exception'; lineName: string }
  | { type: 'wip'; lotCode: string }
  | { type: 'reportRecords' }
  | { type: 'handoverRecords' }
  | { type: 'handoverShift' }
  | { type: 'receiveShift' }
  | null;

type SchedulableItem = {
  key: string;
  kind: SchedulableKind;
  title: string;
  subtitle: string;
  qty: number;
  unit: string;
  lineType: string;
  dueDate: string;
  dueRisk: string;
  dueRiskLevel: 'overdue' | 'today' | 'soon' | '';
  status: string;
  helper: string;
  blocker?: string;
  planQty?: number;
  releasedQty?: number;
  unreleasedQty?: number;
  pendingReleaseQty?: number;
  masterCode?: string;
  releaseCode?: string;
  lotCode?: string;
  recipeCode: string;
  processCode: string;
  routeType: string;
};

type WorkbenchBatchPlan = {
  recipeCode: string;
  processCode: string;
  routeType: string;
  productUnitWeightKg: number;
  snapshotLabel: string;
  recipe?: Record<string, unknown>;
  processTemplate?: Record<string, unknown>;
};

type AffectedExecutionRow = {
  code: string;
  route: string;
  meta: string;
  relation: string;
  status: string;
  nextAction: string;
};

type ProductionReportFact = {
  code: string;
  executionCardCode: string;
  kind: string;
  goodQty: number;
  defectQty: number;
  unit: string;
  reporter: string;
  reportedAt: string;
};

type MaterialCatalogItem = {
  code: string;
  name: string;
  unit: string;
  stockQty: number;
  lockedQty: number;
  qcPendingQty: number;
  qcRequired: boolean;
};

type LineNextStep = {
  title: string;
  actionLabel: string;
  description: string;
  statusText: string;
  disabledReason: string;
  primaryAction: LinePrimaryAction;
};

type SiteProgressState = '已完成' | '当前' | '待执行' | '需处理' | '仅展示';

type SiteProgressStep = {
  code: string;
  sequence: number;
  name: string;
  meta: string;
  state: SiteProgressState;
  stateClass: string;
  actionText: string;
  helperText: string;
};

type SiteInfoRow = {
  label: string;
  value: string;
};

type ShiftHandoverItem = {
  key: string;
  line: string;
  executionCardCode: string;
  productName: string;
  kind: '当前作业' | '待开工作业';
  stage: string;
  nextAction: string;
};

type SiteMetricRow = {
  label: string;
  value: number;
  unit?: string;
};

type PostprocessStage = '短关待处理' | '待成品检' | '质量待处置' | '待包装' | '待入库检' | '待仓库入库' | '异常待处理';

type PostprocessRow = {
  code: string;
  workOrderCode: string;
  releaseBatchCode: string;
  productName: string;
  sourceLine: string;
  unit: string;
  planQty: number;
  routeType: string;
  reportedQty: number;
  qualifiedQty: number;
  defectQty: number;
  packedQty: number;
  releasedInboundQty: number;
  inboundHoldQty: number;
  inboundScrappedQty: number;
  inboundQty: number;
  stage: PostprocessStage;
  actionLabel: string;
  actionable: boolean;
  helper: string;
  qualityTaskCode: string;
};

const route = useRoute();
const router = useRouter();
const workbenchTabs = new Set<WorkbenchTab>(['schedule', 'site', 'postprocess', 'exceptions']);
const requestedWorkbenchTab = route.query.tab?.toString() as WorkbenchTab | undefined;
const activeTab = ref<WorkbenchTab>(requestedWorkbenchTab && workbenchTabs.has(requestedWorkbenchTab) ? requestedWorkbenchTab : 'site');

function selectWorkbenchTab(tab: WorkbenchTab) {
  activeTab.value = tab;
  void router.replace({
    query: {
      ...route.query,
      tab,
    },
  });
}
const requestedWorkOrderCode = route.query.workOrder?.toString() || '';
const requestedReleaseCode = route.query.releaseBatch?.toString() || '';
const requestedRelease = production2ReleaseBatches.find((batch) => batch.code === requestedReleaseCode);
const selectedMasterCode = ref(requestedWorkOrderCode || requestedRelease?.workOrderCode || 'MO2-260701-001');
const selectedChildCode = ref(requestedRelease?.code || 'RB2-260701-002');
const selectedLineName = ref(requestedRelease?.line || '挤出 A2 线');
const shiftStatus = ref<'待交接' | '值班中'>('值班中');
const toastMessage = ref('');
const releaseBusyKey = ref('');
const executionBusyKey = ref('');
const productionInventoryRows = ref<WarehouseInventoryRow[]>([]);
const productionLineCatalog = ref<ProductionLineRuntime[]>([]);
const workbenchRuntimeLoading = ref(true);
const workbenchRuntimeError = ref('');
const workbenchHasSnapshot = ref(false);
const workbenchLastLoadedAt = ref('');
const workbenchPrototypeCommandsAvailable: boolean = false;
const releaseIdempotencyKeys = new Map<string, string>();
const executionIdempotencyKeys = new Map<string, string>();
const shiftIdempotencyKeys = new Map<string, string>();
const runtimeProductionExceptions = ref<Production2Exception[]>([]);
const runtimeProductionExceptionsLoaded = ref(false);
const runtimeProductionReports = ref<ProductionReportFact[]>([]);
const runtimeShiftHandovers = ref<Production2ShiftHandover[]>([]);
const workbenchFactsRevision = ref(0);
const operationPanel = ref<OperationPanel>(null);
const workbenchWriteActionsDisabled = computed(() => (
  !workbenchHasSnapshot.value
  || workbenchRuntimeLoading.value
  || Boolean(workbenchRuntimeError.value)
));
const workbenchWriteDisabledReason = computed(() => {
  if (!workbenchHasSnapshot.value) return '生产运行事实尚未加载完成';
  if (workbenchRuntimeLoading.value) return '正在刷新生产运行事实，刷新完成后才能提交操作';
  if (workbenchRuntimeError.value) return '当前显示上次成功快照，重新连接成功后才能提交操作';
  return '';
});
const shiftMemberOptions = ['李四', '王敏', '陈刚', '刘倩', '孙悦', '周敏'];
const shiftOptions = ['白班', '夜班', '临时班'];
const currentShift = reactive({
  code: `SHIFT2-${currentDateCode().slice(2)}-D`,
  name: '白班',
  leader: '李四',
  members: ['李四', '王敏', '陈刚', '刘倩'],
  startAt: `${currentDateTimeText().slice(0, 10)} 08:00`,
  endAt: '',
  handoverNote: '',
});
const shiftMembers = computed(() => currentShift.members);
const shiftMemberText = computed(() => shiftMembers.value.join('、') || '-');

const childDraft = reactive({
  qty: 300,
});

const dispatchDraft = reactive({
  lineName: '挤出 A2 线',
});

const queueDraft = reactive({
  lineName: '',
  sourceKey: '',
  qty: 200,
  note: '',
});

const startDraft = reactive({
  leader: '',
});

const reportDraft = reactive({
  goodQty: 50,
  defectQty: 0,
  reelCode: '',
  netWeightKg: 0,
  equipment: '',
  sourceWipBatchCode: '',
  consumedWeightKg: 0,
  lossWeightKg: 0,
  closeOperation: false,
  shortCloseReason: '',
});

const handoverDraft = reactive({
  note: currentShift.handoverNote,
});

const receiveDraft = reactive({
  shiftName: '夜班',
  leader: '王敏',
  members: ['王敏', '陈宇'],
});

const exceptionDraft = reactive({
  type: '设备异常' as Production2Exception['type'],
  reason: '',
  result: '异常停机' as '继续生产' | '异常停机',
});

const executionStateDraft = reactive({
  reason: '',
});

const materialCatalog: Record<string, MaterialCatalogItem> = {};
const productRecipes: Record<string, { materialCode: string; materialName: string; qtyPer: number }[]> = {};

for (const task of production2Tasks) {
  productRecipes[task.productCode] = task.materialNeeds.map((item) => ({
    materialCode: item.materialCode,
    materialName: item.materialName,
    qtyPer: item.perUnitQty,
  }));
  for (const item of task.materialNeeds) {
    const current = materialCatalog[item.materialCode];
    const qcPendingQty = item.status === '待来料质检' ? Math.max(item.shortageQty, item.estimatedQty) : 0;
    materialCatalog[item.materialCode] = {
      code: item.materialCode,
      name: item.materialName,
      unit: item.unit,
      stockQty: Math.max(current?.stockQty ?? 0, item.availableQty),
      lockedQty: current?.lockedQty ?? 0,
      qcPendingQty: Math.max(current?.qcPendingQty ?? 0, qcPendingQty),
      qcRequired: Boolean(current?.qcRequired || item.incomingQcRequired),
    };
  }
}

const siteProcessSteps = [...production2ProcessSteps]
  .filter((step) => step.status === '启用')
  .sort((left, right) => left.sequence - right.sequence);

function workOrderSourceAllocationsForWorkbench(order: Production2WorkOrder) {
  const explicit = Array.isArray(order.sourceAllocations)
    ? order.sourceAllocations.filter((allocation) => (
        allocation.taskCode
        && allocation.sourceLineId
        && Number(allocation.quantity || 0) > 0
      ))
    : [];
  if (explicit.length) return explicit;
  if (!order.taskCode || !order.sourceLineId || !(Number(order.planQty || 0) > 0)) return [];
  return [{
    taskCode: order.taskCode,
    sourceLineId: order.sourceLineId,
    sourceDocument: order.sourceDocument,
    productCode: order.productCode,
    productName: order.productName,
    quantity: Number(order.planQty || 0),
    unit: order.unit,
    dueDate: order.dueDate,
  }];
}

function workOrderTaskAllocationQtyForWorkbench(order: Production2WorkOrder, taskCode: string) {
  return workOrderSourceAllocationsForWorkbench(order)
    .filter((allocation) => allocation.taskCode === taskCode)
    .reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
}

function workOrderIncludesTaskForWorkbench(order: Production2WorkOrder, taskCode: string) {
  return workOrderTaskAllocationQtyForWorkbench(order, taskCode) > 0;
}

function workOrderTaskProjectedQtyForWorkbench(order: Production2WorkOrder, taskCode: string, metric: number) {
  const planQty = Math.max(0, Number(order.planQty || 0));
  const allocationQty = workOrderTaskAllocationQtyForWorkbench(order, taskCode);
  const actualQty = Math.max(0, Number(metric || 0));
  if (!(planQty > 0) || !(allocationQty > 0) || !(actualQty > 0)) return 0;
  return Math.min(allocationQty, actualQty * allocationQty / planQty);
}

function workOrderSourceTaskCodesForWorkbench(order: Production2WorkOrder) {
  return [...new Set(workOrderSourceAllocationsForWorkbench(order).map((allocation) => allocation.taskCode))];
}

function productionTaskRow(task: (typeof production2Tasks)[number]): ProductionTask {
  return {
    code: task.code,
    source: task.source === '直接新建' ? '手动新建' : task.source,
    priority: task.priority,
    status: task.status,
    createdAt: task.createdAt,
    dueDate: task.deliveryDate,
    owner: task.owner,
    products: [
      {
        code: task.productCode,
        name: task.productName,
        model: task.productCode,
        spec: task.recipeCode,
        qty: task.productionQty,
        unit: task.unit,
        inboundQty: production2WorkOrders
          .filter((order) => workOrderIncludesTaskForWorkbench(order, task.code))
          .reduce((sum, order) => sum + workOrderTaskProjectedQtyForWorkbench(order, task.code, order.inboundQty), 0),
      },
    ],
  };
}

const taskRows = ref<ProductionTask[]>(
  production2Tasks.map(productionTaskRow),
);

const masterOrders = ref<MasterOrder[]>(
  production2WorkOrders.map((order) => ({
    code: order.code,
    taskCode: order.taskCode,
    dueDate: order.dueDate,
    productCode: order.productCode,
    productName: order.productName,
    planQty: order.planQty,
    unit: order.unit,
    recipe: order.recipeCode,
    process: order.processTemplateCode,
    lineType: order.linePlans[0]?.lineType || '未分配产线',
    status: order.status === '草稿' ? '待确认' : order.status,
    revision: Number(order.revision || 0),
    documentStatus: order.documentStatus || '',
    nextAction: order.nextAction || '',
    materialNeeds: order.materialNeeds.map((need) => ({
      materialCode: need.materialCode,
      materialName: need.materialName,
      qtyPer: Number(need.perUnitQty || (need.estimatedQty / Math.max(order.planQty, 1))),
      status: need.status,
    })),
  })),
);

const childOrders = ref<ChildOrder[]>(
  production2ReleaseBatches.map((release) => {
    const workOrder = production2WorkOrders.find((order) => order.code === release.workOrderCode);
    const card = production2ExecutionCards.find((item) => release.executionCardCodes.includes(item.code));
    const releaseConfirmed = release.releaseStatus === '已释放';
    return {
      code: release.code,
      executionCardCode: card?.code || '',
      materialIssueCode: release.materialIssueCodes[0] || '',
      masterCode: release.workOrderCode,
      productCode: workOrder?.productCode || '',
      productName: card?.productName || workOrder?.productName || '',
      planQty: releaseConfirmed ? release.releasedQty : release.planQty,
      unit: release.unit,
      goodQty: card ? Number(card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty)) : 0,
      defectQty: card?.defectQty || 0,
      status: releaseConfirmed && card ? executionCardChildStatus(card) : releaseConfirmed ? '待领料' : '待释放',
      node: card?.node || '待领料',
      line: release.line,
      materialIssued: releaseConfirmed && release.materialStatus === '已领料',
      releaseConfirmed,
    };
  }),
);

const equipmentExecutionStageCodes = new Set([
  'P2-STEP-STARTUP',
  'P2-STEP-FIRST-INSPECTION',
  'P2-STEP-WIP-REPORT-LARGE-REEL',
  'P2-STEP-FINISHED-REPORT-SMALL-REEL',
]);

function executionCardOccupiesLine(card: Production2ExecutionCard) {
  if (card.currentStageCode && equipmentExecutionStageCodes.has(card.currentStageCode)) return true;
  if (card.node === '待首件' || card.node === '待首检') return true;
  if (/待包装|待打包|待抽检|待入库/.test(card.node)) return false;
  if (card.reportedQty >= card.planQty && card.planQty > 0) return false;
  if (['待质检', '待仓库', '已完成'].includes(card.status)) return false;
  if (card.currentStageCode && !equipmentExecutionStageCodes.has(card.currentStageCode)) return false;
  if (card.status === '异常' || card.status === '已暂停') return Boolean(card.startedAt);
  return card.status === '进行中' && Boolean(card.startedAt);
}

function operationJobLine(job: Production2OperationJob) {
  return job.assignedLine || job.recommendedLine || '';
}

function operationJobLineStatus(job: Production2OperationJob, card: Production2ExecutionCard): LineStatus {
  if (job.status === '异常') return '异常停机';
  if (job.status === '暂停') return '暂停中';
  if (job.status === '执行中') return executionCardLineStatus(card);
  return '待开工';
}

function operationJobPriority(job: Production2OperationJob) {
  const priorities: Record<Production2OperationJob['status'], number> = {
    执行中: 0,
    暂停: 1,
    异常: 1,
    可开工: 2,
    队列中: 3,
    待排程: 4,
    已完成: 9,
    已取消: 10,
  };
  return priorities[job.status] ?? 8;
}

function operationJobBelongsOnLine(job: Production2OperationJob, card: Production2ExecutionCard) {
  if (['执行中', '暂停', '异常'].includes(job.status)) return executionCardOccupiesLine(card);
  return ['可开工', '队列中'].includes(job.status);
}

function scheduleDueRisk(dueDate: string) {
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { label: '', level: '' as const };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (daysUntilDue < 0) return { label: `已逾期 ${Math.abs(daysUntilDue)} 天`, level: 'overdue' as const };
  if (daysUntilDue === 0) return { label: '今日交期', level: 'today' as const };
  if (daysUntilDue <= 3) return { label: `距交期 ${daysUntilDue} 天`, level: 'soon' as const };
  return { label: '', level: '' as const };
}

function executionCardOperationJob(card: Production2ExecutionCard, jobCode = '') {
  if (jobCode) return card.operationJobs?.find((job) => job.code === jobCode);
  return card.operationJobs?.find((job) => job.code === card.activeOperationJobCode)
    || card.operationJobs?.find((job) => ['执行中', '暂停', '异常', '可开工', '队列中'].includes(job.status));
}

function operationJobRowByCode(jobCode: string) {
  return production2ExecutionCards
    .flatMap((card) => (card.operationJobs || []).map((job) => ({ card, job })))
    .find((item) => item.job.code === jobCode);
}

function preferredLinePlan(lineName: string) {
  const statusPriority: Record<string, number> = {
    生产中: 0,
    待领料: 1,
    待释放: 2,
    待入库: 3,
    已完成: 9,
  };
  return production2WorkOrders
    .flatMap((order) => order.linePlans)
    .filter((plan) => plan.line === lineName)
    .sort((left, right) => (statusPriority[left.status] ?? 5) - (statusPriority[right.status] ?? 5))[0];
}

function productionLineSortRank(line: Pick<LineQueue, 'type' | 'name'>) {
  if (/挤出/.test(line.type) || /挤出/.test(line.name)) return 0;
  if (/复绕/.test(line.type) || /复绕/.test(line.name)) return 1;
  if (/包装/.test(line.type) || /包装/.test(line.name)) return 2;
  return 3;
}

function productionLineCapability(value: unknown) {
  const label = String(value || '').trim();
  if (/复绕/.test(label)) return 'rewind';
  if (/包装/.test(label)) return 'packaging';
  if (/试验|研发/.test(label)) return 'trial';
  if (/挤出|拉丝/.test(label)) return 'extrusion';
  return '';
}

function initialProductionLineType(plan: WorkbenchBatchPlan, fallback: string) {
  const lineTypes = Array.isArray(plan.processTemplate?.lineTypes)
    ? plan.processTemplate.lineTypes
    : [];
  const sourceType = lineTypes.find((item) => productionLineCapability(item)) || fallback;
  const capability = productionLineCapability(sourceType);
  const labels: Record<string, string> = {
    extrusion: '挤出/拉丝产线',
    rewind: '复绕产线',
    packaging: '包装产线',
    trial: '试验产线',
  };
  return labels[capability] || String(sourceType || '未配置产线能力');
}

function lineReferenceSummary(line: LineQueue) {
  return [
    line.type,
    line.workshop,
    line.capacityValue > 0 && line.capacityUnit ? `${line.capacityValue} ${line.capacityUnit}` : '',
  ].filter(Boolean).join(' · ');
}

function buildWorkbenchLineRows(): LineQueue[] {
  const activeProductionLines = productionLineCatalog.value.filter((line) => (
    line.status === '启用'
    && productionLineCapability(line.type || line.name) !== 'packaging'
  ));
  const lineNames = [
    ...new Set([
      ...activeProductionLines.map((line) => line.name),
      ...production2ReleaseBatches.map((batch) => batch.line),
      ...production2ExecutionCards.map((card) => card.line),
      ...production2ExecutionCards.flatMap((card) => (card.operationJobs || []).flatMap((job) => [job.assignedLine || '', job.recommendedLine || ''])),
    ].filter(Boolean)),
  ];
  return lineNames.map((lineName) => {
    const lineCatalog = productionLineCatalog.value.find((line) => line.name === lineName);
    const referenceFacts = {
      code: lineCatalog?.code || production2ReleaseBatches.find((batch) => batch.line === lineName)?.lineCode || '',
      workshop: lineCatalog?.workshop || '',
      capacityValue: Number(lineCatalog?.capacityValue || 0),
      capacityUnit: lineCatalog?.capacityUnit || '',
      processScope: lineCatalog?.processScope || '',
      schedulable: lineCatalog?.status === '启用'
        && productionLineCapability(lineCatalog.type || lineCatalog.name) !== 'packaging',
    };
    const operationRows = production2ExecutionCards
      .flatMap((card) => (card.operationJobs || []).map((job) => ({
        card,
        job,
        release: production2ReleaseBatches.find((batch) => batch.executionCardCodes.includes(card.code)),
      })))
      .filter((item): item is { card: Production2ExecutionCard; job: Production2OperationJob; release: NonNullable<typeof item.release> } => (
        Boolean(item.release)
        && operationJobLine(item.job) === lineName
        && operationJobBelongsOnLine(item.job, item.card)
      ))
      .sort((left, right) => operationJobPriority(left.job) - operationJobPriority(right.job) || left.job.sequence - right.job.sequence);
    if (operationRows.length) {
      const current = operationRows.find((item) => ['执行中', '暂停', '异常'].includes(item.job.status));
      const queued = operationRows.filter((item) => item !== current);
      const reference = current || queued[0];
      const linePlan = preferredLinePlan(lineName);
      return {
        ...referenceFacts,
        name: lineName,
        type: lineCatalog?.type || reference.job.lineType || reference.card.lineType || linePlan?.lineType || '生产产线',
        status: current ? operationJobLineStatus(current.job, current.card) : '空闲',
        currentChildCode: current?.release.code || '',
        currentOperationJobCode: current?.job.code || '',
        leader: reference.card.leader || linePlan?.leader || '',
        startedAt: current?.job.actualStart || '',
        lastReportAt: current && current.job.actualQty > 0 ? current.card.updatedAt || current.job.actualEnd || '' : '',
        lastReportCode: current && current.job.actualQty > 0 ? current.card.code : '',
        lastReportQty: current?.job.actualQty || 0,
        lastReportUnit: current?.job.actualUnit || current?.job.plannedUnit || reference.job.actualUnit,
        queue: queued.map((item) => item.job.code),
        queueNotes: Object.fromEntries(queued.map((item) => [item.job.code, item.job.nextAction])),
      };
    }
    const cards = production2ExecutionCards
      .filter((card) => card.line === lineName)
      .map((card) => ({
        card,
        release: production2ReleaseBatches.find((batch) => batch.executionCardCodes.includes(card.code)),
      }))
      .filter((item): item is { card: Production2ExecutionCard; release: NonNullable<typeof item.release> } => Boolean(item.release))
      .sort((left, right) => (
        right.card.reportedQty - left.card.reportedQty
        || String(right.card.updatedAt || right.card.createdAt || '').localeCompare(String(left.card.updatedAt || left.card.createdAt || ''))
      ));
    const equipmentCards = cards.filter((item) => executionCardOccupiesLine(item.card));
    const current = equipmentCards[0];
    const linePlan = preferredLinePlan(lineName);
    return {
      ...referenceFacts,
      name: lineName,
      type: lineCatalog?.type || current?.card.lineType || linePlan?.lineType || '生产产线',
      status: current ? executionCardLineStatus(current.card) : '空闲',
      currentChildCode: current?.release.code || '',
      currentOperationJobCode: '',
      leader: current?.card.leader || linePlan?.leader || '',
      startedAt: current?.card.startedAt || '',
      lastReportAt: current?.card.reportedQty ? current.card.updatedAt || '' : '',
      lastReportCode: current?.card.reportedQty ? current.card.code : '',
      lastReportQty: current?.card.reportedQty || 0,
      lastReportUnit: current?.card.unit || '件',
      queue: equipmentCards.slice(1).map((item) => item.release.code),
      queueNotes: Object.fromEntries(equipmentCards.slice(1).map((item) => [item.release.code, item.card.nextAction])),
    };
  }).filter((line) => (
    line.schedulable
    || Boolean(line.currentChildCode)
    || Boolean(line.currentOperationJobCode)
    || line.queue.length > 0
    || childOrders.value.some((child) => child.line === line.name && child.status === '待领料')
  )).sort((left, right) => (
    Number(right.schedulable) - Number(left.schedulable)
    || productionLineSortRank(left) - productionLineSortRank(right)
    || left.name.localeCompare(right.name, 'zh-CN')
  ));
}

function buildWorkbenchWipLots(): WipLot[] {
  return production2ExecutionCards
    .filter((card) => card.reportedQty > 0)
    .map((card) => {
      const release = production2ReleaseBatches.find((batch) => batch.executionCardCodes.includes(card.code));
      return {
        code: card.code,
        releaseCode: release?.code || '',
        productName: card.productName,
        qty: card.reportedQty,
        inboundQty: card.inboundQty,
        unit: card.unit,
        stage: executionCardWipStage(card),
        quality: card.status === '异常'
          ? '返工'
          : card.reportedQty > 0 && Number(card.qualifiedQty || 0) + Number(card.defectQty || 0) >= card.reportedQty
            ? Number(card.defectQty || 0) > 0 ? '部分合格' : '合格'
            : card.status === '待仓库' || card.status === '已完成'
              ? '合格'
              : '待检',
        location: card.line,
        createdAt: card.createdAt || card.updatedAt || '',
      };
    });
}

function buildWorkbenchActivityLogs() {
  return production2ExecutionCards
    .filter((card) => card.reportedQty > 0 || card.inboundQty > 0)
    .map((card) => `${card.code} · ${card.line} · 报工 ${formatQty(card.reportedQty, card.unit)} · 入库 ${formatQty(card.inboundQty, card.unit)}`);
}

const lineRows = ref<LineQueue[]>(buildWorkbenchLineRows());
const wipLots = ref<WipLot[]>(buildWorkbenchWipLots());
const activityLogs = ref(buildWorkbenchActivityLogs());

function rebuildWorkbenchExecutionFacts() {
  lineRows.value = buildWorkbenchLineRows();
  wipLots.value = buildWorkbenchWipLots();
  activityLogs.value = buildWorkbenchActivityLogs();
  taskRows.value.forEach((task) => {
    task.products.forEach((product) => {
      product.inboundQty = production2WorkOrders
        .filter((order) => workOrderIncludesTaskForWorkbench(order, task.code) && order.productCode === product.code)
        .reduce((sum, order) => sum + workOrderTaskProjectedQtyForWorkbench(order, task.code, order.inboundQty), 0);
    });
  });
  if (!lineRows.value.some((line) => line.name === selectedLineName.value)) {
    selectedLineName.value = lineRows.value[0]?.name || '';
  }
  workbenchFactsRevision.value += 1;
}

function applyRequestedWorkbenchSelection() {
  const requestedRuntimeRelease = requestedReleaseCode
    ? production2ReleaseBatches.find((batch) => batch.code === requestedReleaseCode)
    : undefined;
  if (requestedRuntimeRelease) {
    selectedMasterCode.value = requestedRuntimeRelease.workOrderCode;
    selectedChildCode.value = requestedRuntimeRelease.code;
    selectedLineName.value = requestedRuntimeRelease.line;
    return;
  }
  if (!requestedWorkOrderCode) return;
  selectedMasterCode.value = requestedWorkOrderCode;
  const firstRelease = production2ReleaseBatches.find((batch) => batch.workOrderCode === requestedWorkOrderCode);
  if (firstRelease) {
    selectedChildCode.value = firstRelease.code;
    selectedLineName.value = firstRelease.line;
  }
}

function focusMostRelevantLine() {
  if (requestedReleaseCode || requestedWorkOrderCode) return;
  const priority = (line: LineQueue) => {
    if (line.status === '异常停机') return 4;
    if (line.currentChildCode || line.currentOperationJobCode) return 3;
    if (line.queue.length) return 2;
    return 1;
  };
  const nextLine = [...lineRows.value].sort((left, right) => priority(right) - priority(left))[0];
  if (nextLine) selectedLineName.value = nextLine.name;
}

const waitingMaterialChildren = computed(() => childOrders.value.filter((child) => child.status === '待领料'));

function currentQualityTaskForCard(cardCode: string) {
  const rows = production2QualityTasks.filter((task) => task.sourceCard === cardCode);
  return rows.find((task) => (
    ['待检', '检验中', '待复检', '复检中'].includes(task.status)
    || ['待判定', '待处置', '返工中', '待复检'].includes(task.dispositionStatus || '')
  )) || rows[0];
}

function postprocessStageForCard(card: Production2ExecutionCard): PostprocessStage | null {
  if (card.reportedQty <= 0 || card.inboundQty >= card.reportedQty) return null;
  if (card.status === '异常') {
    const qualityTask = currentQualityTaskForCard(card.code);
    if (qualityTask && ['待处置', '返工中', '待复检'].includes(qualityTask.dispositionStatus || '')) return '质量待处置';
    return '异常待处理';
  }
  if (
    card.shortClosedAt
    && Number(card.shortCloseRemainingQty || 0) > 0
    && !['安排补产', '接受短缺'].includes(card.shortCloseResolution || '')
  ) return '短关待处理';
  const qualifiedQty = Number(card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty));
  const judgedQty = qualifiedQty + Number(card.defectQty || 0);
  const packedQty = Number(card.packedQty || 0);
  const releasedInboundQty = Number(card.releasedInboundQty ?? (card.node === '待入库' || card.status === '待仓库' ? packedQty : card.inboundQty));
  const inboundHoldQty = Number(card.inboundHoldQty || 0);
  const inboundScrappedQty = Number(card.inboundScrappedQty || 0);
  if (judgedQty < card.reportedQty || /待成品检|待过程检|半成品质检/.test(card.node)) return '待成品检';
  if (packedQty < qualifiedQty) return '待包装';
  if (releasedInboundQty + inboundHoldQty + inboundScrappedQty < packedQty) return '待入库检';
  if (card.inboundQty < releasedInboundQty) return '待仓库入库';
  return null;
}

function executionCardWorkbenchStage(card: Production2ExecutionCard) {
  const postprocessStage = postprocessStageForCard(card);
  if (postprocessStage) return workbenchStatusLabel(postprocessStage);
  const operationJob = executionCardOperationJob(card);
  if (operationJob && ['可开工', '队列中', '待排程'].includes(operationJob.status)) {
    return `${operationJob.operationType.replace(/生产$/, '')}任务待开工`;
  }
  return productionNodeDisplay(card.node || card.status);
}

const postprocessRows = computed<PostprocessRow[]>(() => {
  workbenchFactsRevision.value;
  return production2ExecutionCards
    .map((card) => {
      const stage = postprocessStageForCard(card);
      if (!stage) return null;
      const qualifiedQty = Number(card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty));
      const packedQty = Number(card.packedQty || 0);
      const releasedInboundQty = Number(card.releasedInboundQty ?? (card.node === '待入库' || card.status === '待仓库' ? packedQty : card.inboundQty));
      const inboundHoldQty = Number(card.inboundHoldQty || 0);
      const inboundScrappedQty = Number(card.inboundScrappedQty || 0);
      const qualityTask = currentQualityTaskForCard(card.code);
      const plan = workbenchPlanForSource(card.workOrderCode, card);
      const helperByStage: Record<PostprocessStage, string> = {
        短关待处理: `设备作业已提前结束 · ${card.shortCloseReason || '待确认处理原因'}`,
        待成品检: '报工完成，等待质量完成成品检判定',
        质量待处置: card.nextAction || '完成质量处置后再继续后段作业',
        待包装: '质量已判定合格，由生产登记实际包装结果',
        待入库检: '包装完成，等待质量完成入库检判定',
        待仓库入库: '入库检已放行，等待仓库登记入库',
        异常待处理: card.nextAction || '处理异常后再继续后段作业',
      };
      const actionByStage: Record<PostprocessStage, string> = {
        短关待处理: '处理剩余',
        待成品检: '等待成品检',
        质量待处置: qualityTask?.dispositionStatus === '待复检'
          ? '等待复检'
          : qualityTask?.dispositionStatus === '返工中'
            ? '质量返工中'
            : '等待质量处置',
        待包装: '记录包装',
        待入库检: '等待入库检',
        待仓库入库: '等待仓库入库',
        异常待处理: '查看异常',
      };
      return {
        code: card.code,
        workOrderCode: card.workOrderCode,
        releaseBatchCode: card.releaseBatchCode || '',
        productName: card.productName,
        sourceLine: card.line,
        unit: card.unit,
        planQty: Number(card.planQty || 0),
        routeType: plan.routeType,
        reportedQty: Number(card.reportedQty || 0),
        qualifiedQty,
        defectQty: Number(card.defectQty || 0),
        packedQty,
        releasedInboundQty,
        inboundHoldQty,
        inboundScrappedQty,
        inboundQty: Number(card.inboundQty || 0),
        stage,
        actionLabel: actionByStage[stage],
        actionable: ['短关待处理', '待包装', '异常待处理'].includes(stage),
        helper: helperByStage[stage],
        qualityTaskCode: qualityTask?.code || '',
      } satisfies PostprocessRow;
    })
    .filter((row): row is PostprocessRow => Boolean(row))
    .sort((left, right) => left.stage.localeCompare(right.stage) || left.code.localeCompare(right.code));
});

const postprocessStageOrder: PostprocessStage[] = ['短关待处理', '待成品检', '质量待处置', '待包装', '待入库检', '待仓库入库', '异常待处理'];
const postprocessGroups = computed(() => postprocessStageOrder
  .map((stage) => ({ stage, rows: postprocessRows.value.filter((row) => row.stage === stage) }))
  .filter((group) => group.rows.length));

function postprocessMetricRows(row: PostprocessRow): SiteMetricRow[] {
  const metricsByStage: Record<PostprocessStage, SiteMetricRow[]> = {
    短关待处理: [
      { label: '计划', value: row.planQty, unit: row.unit },
      { label: '已报工', value: row.reportedQty, unit: row.unit },
      { label: '剩余', value: Math.max(0, row.planQty - row.reportedQty), unit: row.unit },
    ],
    待成品检: [
      { label: '已报工', value: row.reportedQty, unit: row.unit },
      { label: '已判定', value: row.qualifiedQty + row.defectQty, unit: row.unit },
      { label: '待判定', value: Math.max(0, row.reportedQty - row.qualifiedQty - row.defectQty), unit: row.unit },
    ],
    质量待处置: [
      { label: '已报工', value: row.reportedQty, unit: row.unit },
      { label: '合格', value: row.qualifiedQty, unit: row.unit },
      { label: '待处置', value: row.defectQty, unit: row.unit },
    ],
    待包装: [
      { label: '合格', value: row.qualifiedQty, unit: row.unit },
      { label: '已包装', value: row.packedQty, unit: row.unit },
      { label: '待包装', value: Math.max(0, row.qualifiedQty - row.packedQty), unit: row.unit },
    ],
    待入库检: [
      { label: '已包装', value: row.packedQty, unit: row.unit },
      { label: '已判定', value: row.releasedInboundQty + row.inboundHoldQty + row.inboundScrappedQty, unit: row.unit },
      { label: '待判定', value: Math.max(0, row.packedQty - row.releasedInboundQty - row.inboundHoldQty - row.inboundScrappedQty), unit: row.unit },
    ],
    待仓库入库: [
      { label: '已放行', value: row.releasedInboundQty, unit: row.unit },
      { label: '已入库', value: row.inboundQty, unit: row.unit },
      { label: '待入库', value: Math.max(0, row.releasedInboundQty - row.inboundQty), unit: row.unit },
    ],
    异常待处理: [
      { label: '计划', value: row.planQty, unit: row.unit },
      { label: '已报工', value: row.reportedQty, unit: row.unit },
      { label: '未完成', value: Math.max(0, row.planQty - row.reportedQty), unit: row.unit },
    ],
  };
  return metricsByStage[row.stage];
}

const siteLineRows = computed(() => lineRows.value
  .filter((line) => (
    line.schedulable
    || Boolean(line.currentChildCode)
    || Boolean(line.currentOperationJobCode)
    || line.queue.length > 0
  ))
  .sort((left, right) => {
    const priority = (line: LineQueue) => {
      if (line.status === '异常停机') return 0;
      if (line.currentChildCode || line.currentOperationJobCode) return 1;
      if (line.queue.length) return 2;
      return 3;
    };
    return priority(left) - priority(right)
      || Number(right.schedulable) - Number(left.schedulable)
      || productionLineSortRank(left) - productionLineSortRank(right)
      || left.name.localeCompare(right.name, 'zh-CN');
  }));
const queuedChildCount = computed(() => siteLineRows.value.reduce((sum, line) => sum + line.queue.length, 0));
const selectedLine = computed(() => lineRows.value.find((line) => line.name === selectedLineName.value) ?? lineRows.value[0]);
const schedulableItems = computed<SchedulableItem[]>(() => {
  const masterItems = masterOrders.value
    .filter((master) => master.status !== '待确认' && masterAwaitingReleaseQty(master) > 0)
    .map((master) => {
      const pendingRelease = masterChildren(master.code).find((child) => !child.releaseConfirmed);
      const releasableQty = Math.min(masterReleasableQty(master), pendingRelease?.planQty ?? Number.POSITIVE_INFINITY);
      const releasedQty = masterReleasedQty(master.code);
      const unreleasedQty = masterAwaitingReleaseQty(master);
      const plan = workbenchPlanForSource(master.code);
      const dueDate = masterDueDate(master);
      const dueRisk = scheduleDueRisk(dueDate);
      return {
        key: `master:${master.code}`,
        kind: 'master' as const,
        title: master.code,
        subtitle: master.productName,
        qty: releasableQty,
        unit: master.unit,
        lineType: initialProductionLineType(plan, master.lineType),
        dueDate,
        dueRisk: dueRisk.label,
        dueRiskLevel: dueRisk.level,
        status: releasableQty > 0 ? '可安排' : '暂不可安排',
        helper: pendingRelease ? '已有待确认的生产安排，确认后锁定本次数量。' : '',
        blocker: masterReleaseBlocker(master),
        planQty: master.planQty,
        releasedQty,
        unreleasedQty,
        pendingReleaseQty: masterPendingReleaseQty(master.code),
        masterCode: master.code,
        releaseCode: pendingRelease?.code,
        recipeCode: plan.recipeCode,
        processCode: plan.processCode,
        routeType: plan.routeType,
      };
    });

  return masterItems;
});
const selectedLineCurrentChild = computed(() => (selectedLine.value ? lineCurrentChild(selectedLine.value) : undefined));
const selectedLineCurrentLot = computed(() => (selectedLine.value ? lineCurrentLot(selectedLine.value) : undefined));
const selectedLineQueuedOperationJob = computed(() => (selectedLine.value ? lineQueuedOperationJob(selectedLine.value) : undefined));
const selectedLineRelatedLots = computed(() => {
  const child = selectedLineCurrentChild.value;
  if (!child) return [];
  return wipLots.value.filter((lot) => lot.releaseCode === child.code);
});
const selectedLineStep = computed(() => (selectedLine.value ? lineNextStep(selectedLine.value) : undefined));
const selectedLineCurrentProcess = computed(() => {
  if (!selectedLine.value) return undefined;
  if (selectedLineQueuedOperationJob.value?.supplementForShortClose) {
    return {
      name: selectedLineStep.value?.title || '补产任务待开工',
      executionMode: '生产开工',
    };
  }
  if (selectedLineQueuedOperationJob.value?.operationType === '复绕生产') {
    return { name: '复绕任务待开工', executionMode: '质检放行后自动排入' };
  }
  if (selectedLineQueuedOperationJob.value) {
    return { name: `${selectedLineQueuedOperationJob.value.operationType}待开工`, executionMode: '生产开工' };
  }
  const stage = lineCurrentStageInstance(selectedLine.value);
  if (stage) return { name: stage.stageName, executionMode: stage.stageType };
  return lineCurrentProcessStep(selectedLine.value);
});
const selectedLineProgressSteps = computed(() => {
  const steps = selectedLine.value ? lineProgressSteps(selectedLine.value) : [];
  if (!selectedLineQueuedOperationJob.value) return steps;
  return steps.map((step) => (step.state === '当前'
    ? {
        ...step,
        state: '待执行' as const,
        stateClass: progressStateClass('待执行'),
        actionText: selectedLineStep.value?.actionLabel || step.actionText,
      }
    : step));
});
const selectedLineProgressSummary = computed(() => {
  const steps = selectedLineProgressSteps.value;
  if (!steps.length) return '暂无工艺路线';
  const completed = steps.filter((step) => step.state === '已完成').length;
  const active = steps.find((step) => ['当前', '需处理'].includes(step.state));
  const queuedNext = selectedLineQueuedOperationJob.value
    ? steps.find((step) => step.state === '待执行')
    : undefined;
  return `已完成 ${completed}/${steps.length}${active ? ` · 当前 ${active.name}` : queuedNext ? ` · 下一步 ${queuedNext.name}` : ''}`;
});
const selectedLineInfoRows = computed(() => (selectedLine.value
  ? lineInfoRows(selectedLine.value).filter((row) => !['产线类型', '负责人', '队列任务'].includes(row.label))
  : []));
const productionReportRows = computed(() => runtimeProductionReports.value
  .slice()
  .sort((left, right) => right.reportedAt.localeCompare(left.reportedAt))
  .map((report) => {
    const card = production2ExecutionCards.find((item) => item.code === report.executionCardCode);
    return {
      ...report,
      line: card?.line || '-',
      productName: card?.productName || '未找到成品',
    };
  }));
const shiftReportRows = computed(() => productionReportRows.value.filter((report) => (
  report.reportedAt >= currentShift.startAt
  && (!currentShift.endAt || report.reportedAt <= currentShift.endAt)
)));
const productionReportHistory = computed(() => productionReportRows.value.map((row) => ({
  time: row.reportedAt,
  actor: row.reporter,
  action: `${row.code} · ${row.kind}`,
  remark: `${row.executionCardCode} · ${row.line} · ${row.productName}；良品 ${formatQty(row.goodQty, row.unit)}，不良 ${formatQty(row.defectQty, row.unit)}`,
  route: `/production/execution-cards/${encodeURIComponent(row.executionCardCode)}?returnTo=${encodeURIComponent('/production/workbench?tab=site')}`,
})));
const shiftHandoverHistory = computed(() => runtimeShiftHandovers.value
  .slice()
  .sort((left, right) => right.endedAt.localeCompare(left.endedAt))
  .map((row) => ({
    time: row.endedAt,
    actor: `${row.fromLeader} → ${row.toLeader || '待接班'}`,
    action: `${row.code} · ${row.status}`,
    remark: `${row.fromShiftName} → ${row.toShiftName || '待接班'}；${row.reportSummary?.count || 0} 单报工，${row.exceptionCount || 0} 条异常，${row.activeCards.length} 个现场任务${row.note ? `；交接备注：${row.note}` : ''}`,
  })));
const shiftReportSummary = computed(() => {
  const unitTotals = new Map<string, { unit: string; good: number; defect: number }>();
  for (const row of shiftReportRows.value) {
    const summary = unitTotals.get(row.unit) || { unit: row.unit, good: 0, defect: 0 };
    summary.good += row.goodQty;
    summary.defect += row.defectQty;
    unitTotals.set(row.unit, summary);
  }
  return {
    count: shiftReportRows.value.length,
    good: shiftReportRows.value.reduce((sum, row) => sum + row.goodQty, 0),
    defect: shiftReportRows.value.reduce((sum, row) => sum + row.defectQty, 0),
    unitTotals: [...unitTotals.values()],
  };
});

function shiftReportTotalText(field: 'good' | 'defect') {
  const values = shiftReportSummary.value.unitTotals
    .filter((summary) => summary[field] > 0)
    .map((summary) => formatQty(summary[field], summary.unit));
  return values.join(' + ') || '0';
}
const openExceptionRows = computed(() => {
  const source = runtimeProductionExceptionsLoaded.value ? runtimeProductionExceptions.value : production2Exceptions;
  return source
    .filter((item) => item.status !== '已关闭')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
});
const shiftExceptionRows = computed(() => {
  const shiftStart = currentShift.startAt.replace('T', ' ');
  const shiftEnd = currentShift.endAt.replace('T', ' ');
  return openExceptionRows.value.filter((item) => {
    const createdAt = item.createdAt.replace('T', ' ');
    return createdAt >= shiftStart && (!shiftEnd || createdAt <= shiftEnd);
  });
});
const shiftExceptionCount = computed(() => shiftExceptionRows.value.length);
const shiftHandoverItems = computed<ShiftHandoverItem[]>(() => {
  const rows: ShiftHandoverItem[] = [];
  const seen = new Set<string>();
  for (const line of siteLineRows.value) {
    const currentChild = lineCurrentChild(line);
    if (currentChild?.executionCardCode) {
      const key = `current:${line.name}:${currentChild.executionCardCode}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({
          key,
          line: line.name,
          executionCardCode: currentChild.executionCardCode,
          productName: currentChild.productName,
          kind: '当前作业',
          stage: lineDisplayStatus(line),
          nextAction: lineNextStep(line).actionLabel,
        });
      }
    }
    for (const queueCode of line.queue) {
      const operationRow = operationJobRowByCode(queueCode);
      const queuedChild = operationRow ? undefined : childOrders.value.find((item) => item.code === queueCode);
      const executionCardCode = operationRow?.card.code || queuedChild?.executionCardCode || '';
      if (!executionCardCode) continue;
      const key = `queue:${line.name}:${queueCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        line: line.name,
        executionCardCode,
        productName: operationRow?.card.productName || queuedChild?.productName || '-',
        kind: '待开工作业',
        stage: operationRow
          ? `${operationRow.job.operationType.replace(/生产$/, '')}任务待开工`
          : queuedChild ? queueStepHint(queuedChild) : '待开工',
        nextAction: operationRow?.job.nextAction || (queuedChild ? queueStepHint(queuedChild) : '等待接入队首'),
      });
    }
  }
  return rows;
});
const shiftHandoverExecutionCards = computed(() => {
  const cardCodes = [...new Set(shiftHandoverItems.value.map((item) => item.executionCardCode))];
  return cardCodes
    .map((code) => production2ExecutionCards.find((card) => card.code === code))
    .filter((card): card is Production2ExecutionCard => Boolean(card?.releaseBatchCode && Number.isInteger(card.revision)));
});
const handoverNoteRequired = computed(() => shiftHandoverItems.value.length > 0 || shiftExceptionCount.value > 0);
const pendingShiftHandover = computed(() => runtimeShiftHandovers.value.find((item) => item.status === '待接班'));
const blockingExceptionCount = computed(() => openExceptionRows.value.filter((item) => (
  /阻断|停机|暂停|冻结/.test(`${item.effect} ${item.nextAction}`)
)).length);
const affectedExecutionRows = computed<AffectedExecutionRow[]>(() => {
  workbenchFactsRevision.value;
  const seen = new Set<string>();
  const rows: AffectedExecutionRow[] = [];
  for (const exception of openExceptionRows.value) {
    const batchCode = exception.executionCardCode || exception.relatedBatch || '';
    const batch = production2ExecutionCards.find((item) => item.code === batchCode);
    const workOrderCode = batch?.workOrderCode || exception.relatedWorkOrder || '';
    const workOrder = production2WorkOrders.find((item) => item.code === workOrderCode);
    const sourceTask = production2Tasks.find((item) => item.code === exception.source);
    const code = batch?.code || workOrder?.code || sourceTask?.code || exception.source;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if (batch) {
      rows.push({
        code,
        route: `/production/execution-cards/${encodeURIComponent(code)}`,
        meta: `${batch.line || '未指定产线'} · ${batch.shift || '未指定班次'} · 计划 ${formatQty(batch.planQty, batch.unit)} · 已报工 ${formatQty(batch.reportedQty, batch.unit)}`,
        relation: `生产批次 · ${batch.workOrderCode}`,
        status: executionCardWorkbenchStage(batch),
        nextAction: batch.nextAction || exception.nextAction,
      });
      continue;
    }
    if (workOrder) {
      const sourceTaskCodes = workOrderSourceTaskCodesForWorkbench(workOrder);
      rows.push({
        code,
        route: `/production/work-orders/${encodeURIComponent(code)}`,
        meta: `${workOrder.productName} · 计划 ${formatQty(workOrder.planQty, workOrder.unit)} · 交期 ${workOrder.dueDate}`,
        relation: `生产工单 · 来源 ${sourceTaskCodes.length > 1 ? `${sourceTaskCodes.length} 个任务` : sourceTaskCodes[0] || exception.source}`,
        status: workOrder.status,
        nextAction: workOrder.nextAction || exception.nextAction,
      });
      continue;
    }
    if (sourceTask) {
      rows.push({
        code,
        route: `/production/tasks/${encodeURIComponent(code)}`,
        meta: `${sourceTask.productName} · 计划 ${formatQty(sourceTask.productionQty, sourceTask.unit)} · 交期 ${sourceTask.deliveryDate}`,
        relation: '来源生产任务',
        status: sourceTask.status,
        nextAction: sourceTask.nextAction || exception.nextAction,
      });
    }
  }
  return rows;
});
const summaryCards = computed(() => {
  const cardsByTab: Record<WorkbenchTab, Array<{ label: string; value: number }>> = {
    schedule: [
      { label: '可安排工单', value: schedulableItems.value.filter((item) => item.kind === 'master' && item.qty > 0).length },
      { label: '暂不可安排', value: schedulableItems.value.filter((item) => item.kind === 'master' && item.qty <= 0).length },
      { label: '待领料安排', value: waitingMaterialChildren.value.length },
      { label: '待开工队列', value: queuedChildCount.value },
    ],
    site: [
      { label: '占用中产线', value: siteLineRows.value.filter((line) => Boolean(line.currentChildCode || line.currentOperationJobCode)).length },
      { label: '可排产空闲线', value: siteLineRows.value.filter((line) => line.schedulable && !line.currentChildCode && !line.currentOperationJobCode && !line.queue.length).length },
      { label: '待开工队列', value: siteLineRows.value.reduce((sum, line) => sum + line.queue.length, 0) },
      { label: '异常中产线', value: siteLineRows.value.filter((line) => line.status === '异常停机').length },
    ],
    postprocess: [
      { label: '等待质量', value: postprocessRows.value.filter((row) => ['待成品检', '质量待处置', '待入库检'].includes(row.stage)).length },
      { label: '待包装', value: postprocessRows.value.filter((row) => row.stage === '待包装').length },
      { label: '待处理例外', value: postprocessRows.value.filter((row) => ['短关待处理', '异常待处理'].includes(row.stage)).length },
      { label: '等待仓库', value: postprocessRows.value.filter((row) => row.stage === '待仓库入库').length },
    ],
    exceptions: [
      { label: '未关闭异常', value: openExceptionRows.value.length },
      { label: '紧急异常', value: openExceptionRows.value.filter((item) => item.level === '紧急').length },
      { label: '阻断中', value: blockingExceptionCount.value },
      { label: '受影响对象', value: affectedExecutionRows.value.length },
    ],
  };
  return cardsByTab[activeTab.value];
});

watch(
  () => route.query.tab?.toString(),
  (tab) => {
    const nextTab = tab as WorkbenchTab | undefined;
    if (nextTab && workbenchTabs.has(nextTab)) activeTab.value = nextTab;
  },
);

const operationMaster = computed(() => {
  const panel = operationPanel.value;
  return panel?.type === 'split' ? masterOrders.value.find((master) => master.code === panel.masterCode) : undefined;
});

const operationChild = computed(() => {
  const panel = operationPanel.value;
  if (!panel || !('childCode' in panel)) return undefined;
  return childOrders.value.find((child) => child.code === panel.childCode);
});

const operationLine = computed(() => {
  const panel = operationPanel.value;
  if (!panel || !('lineName' in panel)) return undefined;
  return lineRows.value.find((line) => line.name === panel.lineName);
});

const operationExecutionCard = computed(() => (
  operationLine.value ? lineActiveExecutionCard(operationLine.value) : undefined
));

const operationStartJobRow = computed(() => {
  if (operationPanel.value?.type !== 'start' || !operationLine.value) return undefined;
  const line = operationLine.value;
  if (line.currentOperationJobCode) return operationJobRowByCode(line.currentOperationJobCode);
  return line.queue.map((code) => operationJobRowByCode(code)).find((item) => (
    item && ['可开工', '队列中'].includes(item.job.status)
  ));
});

const operationIsRewindStart = computed(() => operationStartJobRow.value?.job.operationType === '复绕生产');
const operationIsSupplementStart = computed(() => Boolean(operationStartJobRow.value?.job.supplementForShortClose));

function workbenchRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function workbenchPlanForSource(workOrderCode: string, card?: Production2ExecutionCard): WorkbenchBatchPlan {
  const workOrder = production2WorkOrders.find((item) => item.code === workOrderCode);
  const cardSnapshot = workbenchRecord(card?.planSnapshot);
  const workOrderSnapshot = workbenchRecord(workOrder?.snapshot);
  const recipe = workbenchRecord(cardSnapshot?.recipe) || workbenchRecord(workOrderSnapshot?.recipe);
  const processTemplate = workbenchRecord(cardSnapshot?.processTemplate)
    || workbenchRecord(workOrderSnapshot?.processTemplate)
    || workbenchRecord(workbenchRecord(card?.processSnapshot)?.processTemplate);
  const recipeCode = String(recipe?.code || workOrder?.recipeCode || '未绑定配方');
  const processCode = String(processTemplate?.code || card?.processTemplateCode || workOrder?.processTemplateCode || '未绑定工艺');
  const routeType = String(processTemplate?.routeType || '直接收卷');
  const revision = Number(cardSnapshot?.sourceWorkOrderRevision || workOrder?.revision || 0);
  const snapshotStatus = String(cardSnapshot?.snapshotStatus || workOrderSnapshot?.snapshotStatus || 'historical_binding');
  return {
    recipeCode,
    processCode,
    routeType,
    productUnitWeightKg: Number(recipe?.productUnitWeightKg || 0),
    snapshotLabel: `${snapshotStatus === 'server_frozen' ? '确认版本' : '版本关联'}${revision ? ` · R${revision}` : ''}`,
    recipe,
    processTemplate,
  };
}

function productionRecipeForExecutionCard(card: Production2ExecutionCard | undefined) {
  if (!card) return undefined;
  const planRecipe = workbenchPlanForSource(card.workOrderCode, card).recipe;
  if (planRecipe) return planRecipe as unknown as (typeof production2Recipes)[number];
  const workOrder = production2WorkOrders.find((item) => item.code === card.workOrderCode);
  return production2Recipes.find((item) => item.code === workOrder?.recipeCode)
    || production2Recipes.find((item) => item.productCode === card.productCode && item.status === '启用');
}

const operationIsWipReport = computed(() => (
  operationExecutionCard.value?.currentStageCode === 'P2-STEP-WIP-REPORT-LARGE-REEL'
  || operationExecutionCard.value?.node === '半成品报工'
));

const operationIsRewindFinishedReport = computed(() => {
  const card = operationExecutionCard.value;
  if (!card || operationIsWipReport.value) return false;
  const processSnapshot = card.processSnapshot as { processTemplate?: { routeType?: string } } | null | undefined;
  return processSnapshot?.processTemplate?.routeType === '大盘复绕'
    || card.processTemplateCode === 'PRC2-WIRE-DRAWING-REWIND-V1';
});

const operationAvailableWipBatches = computed<Production2WipBatch[]>(() => (
  (operationExecutionCard.value?.wipBatches || []).filter((item) => (
    ['合格', '部分使用'].includes(item.status) && Number(item.availableWeightKg || 0) > 0
  ))
));

const operationRewindSourceBatch = computed(() => (
  operationAvailableWipBatches.value.find((batch) => batch.code === reportDraft.sourceWipBatchCode)
));

const operationProductUnitNetWeightKg = computed(() => (
  Number(productionRecipeForExecutionCard(operationExecutionCard.value)?.productUnitWeightKg || 0)
));

const operationRewindReportedRolls = computed(() => (
  Math.max(0, Number(reportDraft.goodQty || 0)) + Math.max(0, Number(reportDraft.defectQty || 0))
));

const operationSuggestedRewindConsumptionKg = computed(() => {
  const sourceAvailable = Number(operationRewindSourceBatch.value?.availableWeightKg || 0);
  const expected = operationRewindReportedRolls.value * operationProductUnitNetWeightKg.value;
  return Math.round(Math.min(sourceAvailable, expected) * 1000) / 1000;
});

const operationProjectedWipRemainingKg = computed(() => {
  const sourceAvailable = Number(operationRewindSourceBatch.value?.availableWeightKg || 0);
  return Math.round(Math.max(
    0,
    sourceAvailable - Number(reportDraft.consumedWeightKg || 0) - Number(reportDraft.lossWeightKg || 0),
  ) * 1000) / 1000;
});

const operationReportProjectedRemainingQty = computed(() => {
  const card = operationExecutionCard.value;
  if (!card) return 0;
  const afterReport = Number(card.reportedQty || 0)
    + Math.max(0, Number(reportDraft.goodQty || 0))
    + Math.max(0, Number(reportDraft.defectQty || 0));
  return Math.max(0, Number(card.planQty || 0) - afterReport);
});

const operationReportAutoCompletes = computed(() => {
  if (operationPanel.value?.type !== 'report' || operationIsWipReport.value) return false;
  if (operationReportProjectedRemainingQty.value <= 0) return true;
  if (!operationIsRewindFinishedReport.value) return false;
  const source = operationAvailableWipBatches.value.find((batch) => batch.code === reportDraft.sourceWipBatchCode);
  return Boolean(source && Number(source.availableWeightKg || 0) - Number(reportDraft.consumedWeightKg || 0) - Number(reportDraft.lossWeightKg || 0) <= 0.0001);
});

const operationCanShortClose = computed(() => (
  operationPanel.value?.type === 'report'
  && !operationIsWipReport.value
  && !operationReportAutoCompletes.value
  && operationReportProjectedRemainingQty.value > 0
));

const operationLot = computed(() => {
  const panel = operationPanel.value;
  return panel?.type === 'wip' ? wipLots.value.find((lot) => lot.code === panel.lotCode) : undefined;
});

const operationTitle = computed(() => {
  const panel = operationPanel.value;
  if (!panel) return '';
  if (panel.type === 'report' && operationIsWipReport.value) return '大盘半成品报工';
  if (panel.type === 'report' && operationIsRewindFinishedReport.value) return '复绕成品报工';
  if (panel.type === 'start' && operationIsSupplementStart.value && operationIsRewindStart.value) return '开始补产复绕';
  if (panel.type === 'start' && operationIsRewindStart.value) return '开始复绕';
  const titles: Record<Exclude<OperationPanel, null>['type'], string> = {
    split: '新增生产安排',
    dispatch: '安排到产线',
    material: '办理生产领料',
    start: '生产开工',
    pause: '暂停生产',
    resume: '恢复生产',
    leader: '调整负责人',
    report: '产线报工',
    exception: '报告生产异常',
    wip: '执行批次推进',
    reportRecords: '报工记录',
    handoverRecords: '交接记录',
    handoverShift: '交班确认',
    receiveShift: '接班确认',
  };
  return titles[panel.type];
});

const operationConfirmLabel = computed(() => {
  const panel = operationPanel.value;
  if (!panel) return '确认';
  if (executionBusyKey.value && ['start', 'report', 'pause', 'resume', 'exception'].includes(panel.type)) return '提交中…';
  if (panel.type === 'report' && operationIsWipReport.value) return '确认大盘报工';
  if (panel.type === 'report' && operationIsRewindFinishedReport.value) return '确认复绕报工';
  if (panel.type === 'start' && operationIsSupplementStart.value && operationIsRewindStart.value) return '开始补产复绕';
  if (panel.type === 'start' && operationIsRewindStart.value) return '开始复绕';
  if (panel.type === 'wip' && operationLot.value?.stage === '包装中') return '确认包装报工';
  const labels: Record<Exclude<OperationPanel, null>['type'], string> = {
    split: '确认安排',
    dispatch: '确认安排',
    material: '前往仓库领料',
    start: '确认开工',
    pause: '确认暂停',
    resume: '确认恢复',
    leader: '确认负责人',
    report: '确认报工',
    exception: '提交异常',
    wip: '确认下一节点',
    reportRecords: '关闭',
    handoverRecords: '关闭',
    handoverShift: '确认交班',
    receiveShift: '确认接班',
  };
  return labels[panel.type];
});

const operationConfirmDisabledReason = computed(() => {
  const panel = operationPanel.value;
  if (!panel || ['reportRecords', 'handoverRecords'].includes(panel.type)) return '';
  if (workbenchWriteActionsDisabled.value) return workbenchWriteDisabledReason.value;
  if (executionBusyKey.value) return '当前操作正在提交';
  if ((panel.type === 'start' || panel.type === 'leader') && !startDraft.leader) return '请选择现场负责人';
  if ((panel.type === 'pause' || panel.type === 'resume') && !executionStateDraft.reason.trim()) {
    return panel.type === 'pause' ? '请填写暂停原因' : '请填写恢复说明';
  }
  if (panel.type === 'handoverShift' && handoverNoteRequired.value && handoverDraft.note.trim().length < 4) {
    return '当前仍有未完成事项，请填写至少 4 个字的交班备注';
  }
  if (panel.type === 'report') {
    if (operationIsWipReport.value) {
      if (!reportDraft.reelCode.trim()) return '请填写大盘编号';
      if (Number(reportDraft.netWeightKg || 0) <= 0) return '请填写大于 0 kg 的实际净重';
    } else {
      const reportQty = Number(reportDraft.goodQty || 0) + Number(reportDraft.defectQty || 0);
      if (reportQty <= 0) return '请填写本次良品或不良数量';
      if (operationIsRewindFinishedReport.value && !reportDraft.sourceWipBatchCode) return '请选择已放行的来源大盘';
      if (operationIsRewindFinishedReport.value && Number(reportDraft.consumedWeightKg || 0) <= 0) return '请填写实际复绕用量';
      if (reportDraft.closeOperation && operationCanShortClose.value && reportDraft.shortCloseReason.trim().length < 4) return '请填写至少 4 个字的提前结束原因';
    }
  }
  if (panel.type === 'exception' && !exceptionDraft.reason.trim()) return '请填写异常原因';
  if (panel.type === 'split' && Number(childDraft.qty || 0) <= 0) return '请填写大于 0 的安排数量';
  if (panel.type === 'dispatch' && !dispatchDraft.lineName) return '请选择生产产线';
  if (panel.type === 'receiveShift' && (!receiveDraft.shiftName || !receiveDraft.leader)) return '请选择班次和班长';
  return '';
});

const operationConfirmDisabled = computed(() => Boolean(operationConfirmDisabledReason.value));

function formatQty(qty: number, unit = '件') {
  return `${qty.toLocaleString('zh-CN')} ${unit}`;
}

function executionCardChildStatus(card: Production2ExecutionCard): ChildStatus {
  if (card.inboundQty >= card.planQty) return '已入库';
  if (card.status === '异常' || /返工|处置/.test(card.nextAction || '')) return '异常/返工';
  if (card.node === '待领料') return '待领料';
  if (card.node === '待开机') return '队列中';
  if (card.node === '待首件' || card.node === '待首检') return '待首检';
  if (card.operationJobs?.some((job) => ['可开工', '队列中'].includes(job.status))) return '队列中';
  if (/检|入库|打包|包装/.test(card.node)) return '待入库';
  if (card.status === '进行中') return '生产中';
  return card.materialStatus === '已领料' || card.materialIssueCode ? '队列中' : '待领料';
}

function executionCardLineStatus(card: Production2ExecutionCard): LineStatus {
  if (card.status === '异常') return '异常停机';
  if (card.status === '已暂停') return '暂停中';
  if (card.node === '待首件' || card.node === '待首检') return '待首检';
  if (/检|入库|打包|包装/.test(card.node) || card.status === '待质检' || card.status === '待仓库') return '已完工';
  if (card.status === '进行中' || card.reportedQty > 0) return '生产中';
  return '待开工';
}

function executionCardWipStage(card: Production2ExecutionCard): WipStage {
  if (card.inboundQty >= card.reportedQty) return '已入库';
  if (card.node === '待入库') return '待入库';
  if (card.node === '待抽检') return '待入库抽检';
  if (/打包|包装/.test(card.node)) return card.packedQty > 0 ? '包装中' : '待打包';
  return '待报工质检';
}

function openSchedulableDetail(item: SchedulableItem) {
  if (item.kind === 'lot' && item.lotCode) {
    router.push({
      path: `/production/execution-cards/${encodeURIComponent(item.lotCode)}`,
      query: { returnTo: '/production/workbench?tab=schedule' },
    });
    return;
  }
  if (item.masterCode) {
    router.push({
      path: `/production/work-orders/${encodeURIComponent(item.masterCode)}`,
      query: { returnTo: '/production/workbench?tab=schedule' },
    });
  }
}

function openLineQuality(line: LineQueue) {
  const child = lineCurrentChild(line);
  const lot = lineCurrentLot(line);
  const sourceCode = child?.executionCardCode || lot?.code || '';
  const qualityTask = production2QualityTasks.find((task) => task.sourceCard === sourceCode);
  showToast(
    qualityTask
      ? `质量任务 ${qualityTask.code} 已生成，由质量模块处理；生产等待判定结果`
      : `${sourceCode || '当前批次'} 正在等待系统生成质量任务`,
  );
}

function openLineInbound(line: LineQueue) {
  const child = lineCurrentChild(line);
  const lot = lineCurrentLot(line);
  const cardCode = child?.executionCardCode || lot?.code || '';
  const card = production2ExecutionCards.find((item) => item.code === cardCode);
  const receiptCode = card?.productionReceiptCodes?.[card.productionReceiptCodes.length - 1];
  showToast(
    receiptCode
      ? `仓库完工入库任务 ${receiptCode} 已自动生成，等待仓库确认`
      : `${cardCode || '当前批次'} 尚无仓库完工入库任务；质检放行后系统会自动生成`,
  );
}

function openLineExecutionDetail(line: LineQueue) {
  const child = lineCurrentChild(line);
  const lot = lineCurrentLot(line);
  const queuedOperation = lineQueuedOperationJob(line);
  const executionCode = child?.executionCardCode || lot?.code || queuedOperation?.productionBatchCode || '';
  if (executionCode) {
    void router.push({
      path: `/production/execution-cards/${encodeURIComponent(executionCode)}`,
      query: { returnTo: '/production/workbench?tab=site' },
    });
    return;
  }
  const master = child ? childMaster(child) : undefined;
  if (master?.code) {
    void router.push({
      path: `/production/work-orders/${encodeURIComponent(master.code)}`,
      query: { returnTo: '/production/workbench?tab=site' },
    });
  }
}

function openPostprocessDetail(row: PostprocessRow) {
  router.push({
    path: `/production/execution-cards/${encodeURIComponent(row.code)}`,
    query: { returnTo: '/production/workbench?tab=postprocess' },
  });
}

function openPostprocessAction(row: PostprocessRow) {
  const card = production2ExecutionCards.find((item) => item.code === row.code);
  if (!card) return;
  if (row.stage === '短关待处理') {
    openPostprocessDetail(row);
    return;
  }
  if (row.stage === '异常待处理') {
    const exception = openExceptionRows.value.find((item) => item.code === card.activeExceptionCode)
      || openExceptionRows.value.find((item) => item.relatedWorkOrder === row.workOrderCode || item.source === row.code);
    router.push(exception ? `/production/exceptions/${encodeURIComponent(exception.code)}` : '/production/exceptions');
    return;
  }
  if (row.stage === '质量待处置') {
    showToast(
      row.qualityTaskCode
        ? `质量任务 ${row.qualityTaskCode} 正在处置；生产等待质量结果`
        : `${row.code} 正在等待系统生成质量处置任务`,
    );
    return;
  }
  if (row.stage === '待包装') {
    router.push({
      path: `/production/execution-cards/${encodeURIComponent(row.code)}`,
      query: { returnTo: '/production/workbench?tab=postprocess', action: 'packaging' },
    });
    return;
  }
  if (row.stage === '待成品检' || row.stage === '待入库检') {
    showToast(
      row.qualityTaskCode
        ? `质量任务 ${row.qualityTaskCode} 已生成，由质量模块处理；生产等待判定结果`
        : `${row.code} 正在等待系统生成质量任务`,
    );
    return;
  }
  if (row.stage === '待仓库入库') {
    const existingReceipt = card.productionReceiptCodes?.[0];
    showToast(
      existingReceipt
        ? `仓库完工入库任务 ${existingReceipt} 已自动生成，等待仓库确认`
        : `${row.code} 尚无仓库完工入库任务；质检放行后系统会自动生成`,
    );
    return;
  }
  openPostprocessDetail(row);
}

function showToast(message: string) {
  toastMessage.value = message;
  window.setTimeout(() => {
    if (toastMessage.value === message) toastMessage.value = '';
  }, 2200);
}

function showWorkbenchCommandUnavailable(action: string) {
  showToast(`${action}暂不可执行，请前往对应单据处理。`);
}

function guardWorkbenchWriteAction() {
  if (!workbenchWriteActionsDisabled.value) return false;
  showToast(workbenchWriteDisabledReason.value);
  return true;
}

function inventorySnapshot(materialCode: string) {
  const rows = productionInventoryRows.value.filter((row) => row.materialCode === materialCode);
  const hasProductionIssueProjection = rows.some((row) => typeof row.allowProductionIssue === 'boolean');
  const eligibleRows = hasProductionIssueProjection
    ? rows.filter((row) => row.allowProductionIssue === true && row.warehouseStatus === '启用' && !row.stocktakeFrozen)
    : rows;
  const nonIssueRows = hasProductionIssueProjection
    ? rows.filter((row) => row.allowProductionIssue !== true || row.warehouseStatus !== '启用')
    : [];
  const stocktakeRows = hasProductionIssueProjection
    ? rows.filter((row) => row.allowProductionIssue === true && row.warehouseStatus === '启用' && row.stocktakeFrozen)
    : [];
  const sum = (sourceRows: WarehouseInventoryRow[], field: keyof WarehouseInventoryRow) => (
    sourceRows.reduce((total, row) => total + Number(row[field] || 0), 0)
  );
  return {
    found: rows.length > 0,
    availableQty: sum(eligibleRows, 'availableNumber'),
    lockedQty: sum(eligibleRows, 'reservedNumber') + sum(eligibleRows, 'allocatedNumber') + sum(eligibleRows, 'frozenNumber'),
    qcPendingQty: sum(eligibleRows, 'qcHoldNumber'),
    pendingInboundQty: sum(eligibleRows, 'pendingInboundNumber'),
    inTransitQty: sum(eligibleRows, 'inTransitNumber'),
    nonIssueWarehouseAvailableQty: sum(nonIssueRows, 'availableNumber'),
    stocktakeFrozenQty: sum(stocktakeRows, 'qualifiedOnHandNumber'),
    allocationSources: eligibleRows.flatMap((row) => row.allocationSources || []),
  };
}

function requestHeaders(withJson = false) {
  const headers = new Headers(withJson ? { 'Content-Type': 'application/json' } : undefined);
  const sessionToken = getStoredSessionToken();
  const currentAccount = window.localStorage.getItem('filatrix-current-account') || '';
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);
  return headers;
}

function masterStatusFromRecord(record: Record<string, unknown>): MasterStatus {
  const status = String(record.status || '待释放');
  if (String(record.documentStatus || '') !== '已确认' && ['草稿', '待确认'].includes(status)) return '待确认';
  if (status === '部分释放') return '部分释放';
  if (status === '待领料') return '待领料';
  if (status === '生产中') return '生产中';
  if (status === '部分入库') return '部分入库';
  if (status === '已完成') return '已完成';
  return '待释放';
}

function materialNeedsFromRecord(record: Record<string, unknown>, planQty: number) {
  const needs = Array.isArray(record.materialNeeds) ? record.materialNeeds : [];
  return needs
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      materialCode: String(item.materialCode || ''),
      materialName: String(item.materialName || item.materialCode || '物料'),
      qtyPer: Number(item.perUnitQty || 0) > 0
        ? Number(item.perUnitQty)
        : Number(item.estimatedQty || 0) / Math.max(planQty, 1),
      status: String(item.status || ''),
    }))
    .filter((item) => item.materialCode && item.qtyPer > 0);
}

function childOrderFromRelease(release: Production2ReleaseBatch): ChildOrder {
  const workOrder = production2WorkOrders.find((order) => order.code === release.workOrderCode);
  const card = production2ExecutionCards.find((item) => release.executionCardCodes.includes(item.code));
  const releaseConfirmed = release.releaseStatus === '已释放';
  return {
    code: release.code,
    executionCardCode: card?.code || '',
    materialIssueCode: release.materialIssueCodes[0] || '',
    masterCode: release.workOrderCode,
    productCode: workOrder?.productCode || '',
    productName: card?.productName || workOrder?.productName || '',
    planQty: releaseConfirmed ? release.releasedQty : release.planQty,
    unit: release.unit,
    goodQty: card ? Number(card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty)) : 0,
    defectQty: card?.defectQty || 0,
    status: releaseConfirmed && card ? executionCardChildStatus(card) : releaseConfirmed ? '待领料' : '待释放',
    node: card?.node || '待领料',
    line: release.line,
    materialIssued: releaseConfirmed && release.materialStatus === '已领料',
    releaseConfirmed,
  };
}

function syncReleasedWorkOrderFacts(payload: Record<string, unknown>) {
  const record = payload.record as Record<string, unknown> | undefined;
  if (!record?.code) throw new Error('生产安排未返回有效生产工单');
  const code = String(record.code);
  const existingIndex = production2WorkOrders.findIndex((order) => order.code === code);
  const existing = existingIndex >= 0 ? production2WorkOrders[existingIndex] : undefined;
  const persisted = {
    ...existing,
    ...record,
    taskCode: String(record.taskCode || record.sourceTask || existing?.taskCode || ''),
  } as unknown as Production2WorkOrder;
  if (existingIndex >= 0) production2WorkOrders.splice(existingIndex, 1, persisted);
  else production2WorkOrders.unshift(persisted);

  if (Array.isArray(payload.executionCards)) {
    const returnedExecutionCards = payload.executionCards
      .filter((item) => item && typeof item === 'object') as Production2ExecutionCard[];
    const otherExecutionCards = production2ExecutionCards.filter((card) => card.workOrderCode !== code);
    production2ExecutionCards.splice(
      0,
      production2ExecutionCards.length,
      ...returnedExecutionCards,
      ...otherExecutionCards,
    );
  }

  const returnedBatches = Array.isArray(payload.releaseBatches)
    ? payload.releaseBatches.filter((item) => item && typeof item === 'object') as Production2ReleaseBatch[]
    : [];
  const otherBatches = production2ReleaseBatches.filter((batch) => batch.workOrderCode !== code);
  production2ReleaseBatches.splice(0, production2ReleaseBatches.length, ...returnedBatches, ...otherBatches);

  const master = masterOrders.value.find((item) => item.code === code);
  if (master) {
    master.planQty = Number(record.planQty || master.planQty);
    master.dueDate = String(record.dueDate || master.dueDate);
    master.productCode = String(record.productCode || master.productCode);
    master.productName = String(record.productName || master.productName);
    master.recipe = String(record.recipeCode || master.recipe);
    master.process = String(record.processTemplateCode || master.process);
    master.status = masterStatusFromRecord(record);
    master.revision = Number(record.revision || master.revision);
    master.documentStatus = String(record.documentStatus || master.documentStatus);
    master.nextAction = String(record.nextAction || master.nextAction);
    master.materialNeeds = materialNeedsFromRecord(record, master.planQty);
  } else {
    const linePlans = Array.isArray(record.linePlans)
      ? record.linePlans.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [];
    const planQty = Number(record.planQty || 0);
    masterOrders.value.unshift({
      code,
      taskCode: String(record.taskCode || record.sourceTask || ''),
      dueDate: String(record.dueDate || ''),
      productCode: String(record.productCode || ''),
      productName: String(record.productName || ''),
      planQty,
      unit: String(record.unit || '件'),
      recipe: String(record.recipeCode || '未绑定配方'),
      process: String(record.processTemplateCode || '未绑定工艺'),
      lineType: String(linePlans[0]?.lineType || '未分配产线'),
      status: masterStatusFromRecord(record),
      revision: Number(record.revision || 0),
      documentStatus: String(record.documentStatus || ''),
      nextAction: String(record.nextAction || ''),
      materialNeeds: materialNeedsFromRecord(record, planQty),
    });
  }
  childOrders.value = [
    ...childOrders.value.filter((child) => child.masterCode !== code),
    ...returnedBatches.map(childOrderFromRelease),
  ];
  rebuildWorkbenchExecutionFacts();
}

type WorkbenchRuntimePayload = {
  items?: Array<Record<string, unknown>>;
  tasks?: typeof production2Tasks;
  executionCards?: Production2ExecutionCard[];
  releaseBatches?: Production2ReleaseBatch[];
  productionLines?: ProductionLineRuntime[];
};

type WorkbenchRuntimeSnapshot = {
  workOrderDetails: Array<Record<string, unknown>>;
  tasks: typeof production2Tasks;
  executionDetails: ProductionExecutionCardApiResponse[];
  inventoryRows: WarehouseInventoryRow[];
  qualityTasks: typeof production2QualityTasks;
  exceptions: Production2Exception[];
  shiftHandovers: Production2ShiftHandover[];
  productionLines: ProductionLineRuntime[];
};

function runtimeLoadErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : '生产运行事实加载失败，请检查服务后重试';
}

async function fetchWorkbenchRuntimeSnapshot(): Promise<WorkbenchRuntimeSnapshot> {
  const response = await fetch(`${apiBase}/production/work-orders`, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`生产工单加载失败：${response.status}`);
  const payload = await response.json() as WorkbenchRuntimePayload;
  if (
    !Array.isArray(payload.items)
    || !Array.isArray(payload.tasks)
    || !Array.isArray(payload.executionCards)
    || !Array.isArray(payload.releaseBatches)
    || !Array.isArray(payload.productionLines)
  ) {
    throw new Error('生产工单接口未返回完整运行事实');
  }

  const workOrderDetailsPromise = Promise.all(payload.items.map(async (item) => {
    const code = String(item.code || '');
    if (!code) throw new Error('生产工单列表包含无效单据');
    const detailResponse = await fetch(
      `${apiBase}/production/work-orders/${encodeURIComponent(code)}`,
      { headers: requestHeaders() },
    );
    if (!detailResponse.ok) throw new Error(`生产工单 ${code} 加载失败：${detailResponse.status}`);
    const detail = await detailResponse.json() as Record<string, unknown>;
    if (!(detail.record as Record<string, unknown> | undefined)?.code) {
      throw new Error(`生产工单 ${code} 未返回有效明细`);
    }
    return detail;
  }));
  const executionDetailsPromise = Promise.all(payload.executionCards.map((card) => {
    if (!card.code) throw new Error('生产批次列表包含无效记录');
    return getProductionExecutionCard(card.code);
  }));

  const [
    workOrderDetails,
    executionDetails,
    inventoryRows,
    qualityTasks,
    exceptions,
    shiftHandovers,
  ] = await Promise.all([
    workOrderDetailsPromise,
    executionDetailsPromise,
    listWarehouseInventory(),
    listProductionQualityTasks(),
    listProductionExceptions(),
    listProductionShiftHandovers(),
  ]);

  return {
    workOrderDetails,
    tasks: payload.tasks,
    executionDetails,
    inventoryRows,
    qualityTasks,
    exceptions,
    shiftHandovers,
    productionLines: payload.productionLines,
  };
}

function applyWorkbenchRuntimeSnapshot(snapshot: WorkbenchRuntimeSnapshot) {
  const runtimeWorkOrders = snapshot.workOrderDetails.map((detail) => (
    detail.record as Production2WorkOrder
  ));
  const runtimeReleaseBatches = snapshot.workOrderDetails.flatMap((detail) => (
    Array.isArray(detail.releaseBatches)
      ? detail.releaseBatches.filter((item): item is Production2ReleaseBatch => Boolean(item && typeof item === 'object'))
      : []
  ));
  const runtimeExecutionCards = snapshot.executionDetails.map((detail) => detail.record || detail.card);
  if (runtimeExecutionCards.some((card) => !card?.code)) {
    throw new Error('生产批次接口未返回完整运行事实');
  }

  production2Tasks.splice(0, production2Tasks.length, ...snapshot.tasks);
  production2WorkOrders.splice(0, production2WorkOrders.length, ...runtimeWorkOrders);
  production2ReleaseBatches.splice(0, production2ReleaseBatches.length, ...runtimeReleaseBatches);
  production2ExecutionCards.splice(
    0,
    production2ExecutionCards.length,
    ...runtimeExecutionCards as Production2ExecutionCard[],
  );
  masterOrders.value = [];
  childOrders.value = [];
  snapshot.workOrderDetails.forEach(syncReleasedWorkOrderFacts);
  production2WorkOrders.splice(0, production2WorkOrders.length, ...runtimeWorkOrders);
  production2ReleaseBatches.splice(0, production2ReleaseBatches.length, ...runtimeReleaseBatches);
  production2ExecutionCards.splice(
    0,
    production2ExecutionCards.length,
    ...runtimeExecutionCards as Production2ExecutionCard[],
  );
  childOrders.value = runtimeReleaseBatches.map(childOrderFromRelease);
  taskRows.value = snapshot.tasks.map(productionTaskRow);
  productionInventoryRows.value = snapshot.inventoryRows;
  productionLineCatalog.value = snapshot.productionLines;
  production2QualityTasks.splice(0, production2QualityTasks.length, ...snapshot.qualityTasks);
  runtimeProductionExceptions.value = snapshot.exceptions;
  runtimeProductionExceptionsLoaded.value = true;
  runtimeShiftHandovers.value = snapshot.shiftHandovers;
  runtimeProductionReports.value = [];
  snapshot.executionDetails.forEach((detail) => {
    if (detail.reports) upsertRuntimeProductionReports(detail.reports);
  });

  const latestHandover = runtimeShiftHandovers.value[0];
  if (latestHandover?.status === '待接班') {
    shiftStatus.value = '待交接';
    currentShift.code = latestHandover.fromShiftCode;
    currentShift.name = latestHandover.fromShiftName;
    currentShift.leader = latestHandover.fromLeader;
    currentShift.members = [...latestHandover.fromMembers];
    currentShift.endAt = latestHandover.endedAt;
    currentShift.handoverNote = latestHandover.note;
  } else if (latestHandover?.status === '已接班' && latestHandover.toShiftCode) {
    shiftStatus.value = '值班中';
    currentShift.code = latestHandover.toShiftCode;
    currentShift.name = latestHandover.toShiftName || currentShift.name;
    currentShift.leader = latestHandover.toLeader || currentShift.leader;
    currentShift.members = [...(latestHandover.toMembers || currentShift.members)];
    currentShift.startAt = latestHandover.receivedAt || currentShift.startAt;
    currentShift.endAt = '';
    currentShift.handoverNote = '';
  }

  rebuildWorkbenchExecutionFacts();
  applyRequestedWorkbenchSelection();
  focusMostRelevantLine();
}

async function refreshWorkbenchRuntimeFacts() {
  workbenchRuntimeLoading.value = true;
  workbenchRuntimeError.value = '';
  try {
    const snapshot = await fetchWorkbenchRuntimeSnapshot();
    applyWorkbenchRuntimeSnapshot(snapshot);
    workbenchHasSnapshot.value = true;
    workbenchLastLoadedAt.value = currentDateTimeText();
  } catch (error) {
    workbenchRuntimeError.value = runtimeLoadErrorMessage(error);
    operationPanel.value = null;
    closeQueueDraft();
  } finally {
    workbenchRuntimeLoading.value = false;
  }
}

function executionIntentKey(action: 'start' | 'report' | 'pause' | 'resume' | 'exception', card: Production2ExecutionCard) {
  const intent = `${action}:${card.code}:${card.revision || 0}`;
  const existing = executionIdempotencyKeys.get(intent);
  if (existing) return { intent, key: existing };
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `workbench-${action}:${card.code}:${random}`;
  executionIdempotencyKeys.set(intent, key);
  return { intent, key };
}

function normalizeProductionReport(report: Record<string, unknown>): ProductionReportFact | null {
  const code = String(report.code || '');
  const executionCardCode = String(report.executionCardCode || '');
  if (!code || !executionCardCode) return null;
  return {
    code,
    executionCardCode,
    kind: String(report.kind || '生产报工'),
    goodQty: Math.max(0, Number(report.goodQty || 0)),
    defectQty: Math.max(0, Number(report.defectQty || 0)),
    unit: String(report.unit || '件'),
    reporter: String(report.reporter || '未记录'),
    reportedAt: String(report.reportedAt || ''),
  };
}

function upsertRuntimeProductionReports(reports: Array<Record<string, unknown>>) {
  for (const raw of reports) {
    const report = normalizeProductionReport(raw);
    if (!report) continue;
    const index = runtimeProductionReports.value.findIndex((item) => item.code === report.code);
    if (index >= 0) runtimeProductionReports.value.splice(index, 1, report);
    else runtimeProductionReports.value.push(report);
  }
}

function upsertRuntimeExecutionFacts(response: ProductionExecutionCardApiResponse) {
  const card = response.record || response.card;
  if (!card?.code) throw new Error('现场执行接口未返回有效生产批次');
  const cardIndex = production2ExecutionCards.findIndex((item) => item.code === card.code);
  if (cardIndex >= 0) production2ExecutionCards.splice(cardIndex, 1, card);
  else production2ExecutionCards.unshift(card);
  if (response.qualityTask?.code) {
    const taskIndex = production2QualityTasks.findIndex((item) => item.code === response.qualityTask?.code);
    if (taskIndex >= 0) production2QualityTasks.splice(taskIndex, 1, response.qualityTask);
    else production2QualityTasks.unshift(response.qualityTask);
  }
  if (response.report) upsertRuntimeProductionReports([response.report]);
  if (response.reports) upsertRuntimeProductionReports(response.reports);
  const child = childOrders.value.find((item) => item.executionCardCode === card.code || item.code === card.releaseBatchCode);
  if (child) {
    child.executionCardCode = card.code;
    child.goodQty = Number(card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty));
    child.defectQty = Number(card.defectQty || 0);
    child.status = executionCardChildStatus(card);
    child.node = card.node;
    child.line = card.line;
  }
  const line = lineRows.value.find((item) => item.name === card.line);
  if (line) {
    if (child) line.currentChildCode = child.code;
    line.status = executionCardLineStatus(card);
    line.leader = card.leader || line.leader;
    line.startedAt = card.startedAt || line.startedAt;
  }
  rebuildWorkbenchExecutionFacts();
  return card;
}

async function refreshWorkbenchInventoryAfterCommand() {
  try {
    productionInventoryRows.value = await listWarehouseInventory();
    workbenchLastLoadedAt.value = currentDateTimeText();
    return true;
  } catch (error) {
    workbenchRuntimeError.value = `生产安排已提交，但${runtimeLoadErrorMessage(error)}`;
    operationPanel.value = null;
    closeQueueDraft();
    return false;
  }
}

onMounted(() => {
  void refreshWorkbenchRuntimeFacts();
});

function currentDateTimeText() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function currentTimeLabel() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function currentDateCode() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function nextReleaseBatchCode() {
  const nextSequence =
    Math.max(0, ...childOrders.value.map((child) => Number(child.code.match(/(\d+)$/)?.[1] || 0))) + 1;
  return `RB2-${currentDateCode().slice(2)}-${String(nextSequence).padStart(3, '0')}`;
}

function nextShiftCode() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const suffix = receiveDraft.shiftName.includes('夜') ? 'N' : receiveDraft.shiftName.includes('白') ? 'D' : 'T';
  return `SHIFT2-${day}-${suffix}1`;
}

function masterChildren(masterCode: string) {
  return childOrders.value.filter((child) => child.masterCode === masterCode);
}

function masterTask(master: MasterOrder | undefined) {
  return master ? taskRows.value.find((task) => task.code === master.taskCode) : undefined;
}

function masterDueDate(master: MasterOrder | undefined) {
  return master?.dueDate || masterTask(master)?.dueDate || '-';
}

function childMaster(child: ChildOrder | undefined) {
  return child ? masterOrders.value.find((master) => master.code === child.masterCode) : undefined;
}

function masterReleasedQty(masterCode: string) {
  return masterChildren(masterCode)
    .filter((child) => child.releaseConfirmed)
    .reduce((sum, child) => sum + child.planQty, 0);
}

function masterPendingReleaseQty(masterCode: string) {
  return masterChildren(masterCode)
    .filter((child) => !child.releaseConfirmed)
    .reduce((sum, child) => sum + child.planQty, 0);
}

function masterUnplannedQty(master: MasterOrder) {
  return Math.max(0, master.planQty - masterReleasedQty(master.code) - masterPendingReleaseQty(master.code));
}

function masterAwaitingReleaseQty(master: MasterOrder) {
  return Math.max(0, master.planQty - masterReleasedQty(master.code));
}

function masterMaterialRecipe(master: MasterOrder | undefined) {
  if (!master) return [];
  return master.materialNeeds.length ? master.materialNeeds : productRecipes[master.productCode] ?? [];
}

function materialCoverageForWorkOrder(master: MasterOrder, materialCode: string, qtyPer: number) {
  if (qtyPer <= 0) return Number.POSITIVE_INFINITY;
  const inventory = inventorySnapshot(materialCode);
  if (inventory.found) {
    const ownAllocatedQty = inventory.allocationSources
      .filter((source) => source.sourceDoc === master.code && source.status !== '已释放')
      .reduce((sum, source) => sum + Number(source.quantityNumber || 0), 0);
    return Math.floor((inventory.availableQty + ownAllocatedQty) / qtyPer);
  }
  return 0;
}

function materialCoverageForProduct(master: MasterOrder) {
  const recipe = masterMaterialRecipe(master);
  if (!recipe.length) return 0;
  return recipe.reduce(
    (coverage, recipeLine) => Math.min(coverage, materialCoverageForWorkOrder(master, recipeLine.materialCode, recipeLine.qtyPer)),
    Number.POSITIVE_INFINITY,
  );
}

function masterReleasableQty(master: MasterOrder) {
  const awaitingReleaseQty = masterAwaitingReleaseQty(master);
  const coverageQty = materialCoverageForProduct(master);
  const additionalCoverageQty = Math.max(0, coverageQty - masterReleasedQty(master.code));
  return Math.max(0, Math.min(awaitingReleaseQty, additionalCoverageQty));
}

function masterReleaseBlocker(master: MasterOrder) {
  const awaitingReleaseQty = masterAwaitingReleaseQty(master);
  if (!awaitingReleaseQty) return '计划工单数量已全部排产';
  const releasableQty = masterReleasableQty(master);
  if (releasableQty >= awaitingReleaseQty) return '';
  if (releasableQty > 0) return `仍有 ${formatQty(awaitingReleaseQty - releasableQty, master.unit)} 受物料可用量限制`;
  if (master.nextAction.includes('仓库入库')) return master.nextAction;
  const blockingMaterials = masterMaterialRecipe(master)
    .filter((line) => materialCoverageForWorkOrder(master, line.materialCode, line.qtyPer) <= masterReleasedQty(master.code))
    .map((line) => line.materialName || materialCatalog[line.materialCode]?.name || line.materialCode)
    .slice(0, 2);
  const blockingNeeds = master.materialNeeds.filter((need) => blockingMaterials.includes(need.materialName));
  const blockingInventory = masterMaterialRecipe(master)
    .filter((line) => blockingMaterials.includes(line.materialName || materialCatalog[line.materialCode]?.name || line.materialCode))
    .map((line) => inventorySnapshot(line.materialCode));
  if (blockingInventory.some((snapshot) => snapshot.stocktakeFrozenQty > 0)) {
    return `${blockingMaterials.join('、') || '配方物料'}正在盘点冻结，完成或取消盘点后再安排`;
  }
  if (blockingInventory.some((snapshot) => snapshot.nonIssueWarehouseAvailableQty > 0)) {
    return `${blockingMaterials.join('、') || '配方物料'}库存位于非生产领料仓，请先调拨到可生产领料仓`;
  }
  if (blockingNeeds.some((need) => need.status === '待仓库入库')) {
    return `${blockingMaterials.join('、') || '配方物料'}已质检放行，等待仓库正式入库后排产`;
  }
  if (blockingNeeds.some((need) => need.status === '待来料质检')) {
    return `${blockingMaterials.join('、') || '配方物料'}等待来料质检放行，当前不可排产`;
  }
  return `${blockingMaterials.join('、') || '配方物料'}可用量不足，当前不可排产`;
}

function childProductionBatchCode(child: ChildOrder) {
  return child.executionCardCode || '待生成生产批次';
}

function lineCurrentTitle(line: LineQueue) {
  const child = lineCurrentChild(line);
  const operationJob = lineCurrentOperationJob(line);
  if (child) return `${childProductionBatchCode(child)} · ${operationJob?.operationType || child.productName}`;
  const lot = lineCurrentLot(line);
  if (lot) return `${lot.code} · ${lot.productName}`;
  return '-';
}

function childReportedText(child: ChildOrder) {
  return `${child.goodQty}/${child.defectQty}/${Math.max(0, child.planQty - child.goodQty - child.defectQty)}`;
}

function lineCurrentMetricRows(line: LineQueue): SiteMetricRow[] {
  const child = lineCurrentChild(line);
  const card = lineActiveExecutionCard(line);
  if (!child || !card) {
    return child
      ? [
          { label: '良品', value: child.goodQty },
          { label: '不良', value: child.defectQty },
          { label: '待报工', value: Math.max(0, child.planQty - child.goodQty - child.defectQty) },
        ]
      : [];
  }

  const operationJob = lineCurrentOperationJob(line);
  if (operationJob?.operationType === '复绕生产') {
    const sourceWip = card.wipBatches?.find((batch) => batch.code === operationJob.sourceWipBatchCode);
    return [
      { label: '可用大盘', value: Number(sourceWip?.availableWeightKg || 0), unit: 'kg' },
      { label: '成品产出', value: Number(card.reportedQty || 0), unit: card.unit },
      { label: '待产成品', value: Math.max(0, Number(card.planQty || 0) - Number(card.reportedQty || 0)), unit: card.unit },
    ];
  }

  const qualifiedQty = Number(card.qualifiedQty ?? Math.max(0, card.reportedQty - card.defectQty));
  const packedQty = Number(card.packedQty || 0);
  const releasedInboundQty = Number(card.releasedInboundQty || 0);
  const inboundQty = Number(card.inboundQty || 0);
  if (card.currentStageCode === 'P2-STEP-WIP-REPORT-LARGE-REEL' || card.currentStageCode === 'P2-STEP-WIP-QC') {
    return [
      { label: '大盘报工', value: Number(card.wipReportedQtyKg || 0), unit: 'kg' },
      { label: '质检放行', value: Number(card.wipQualifiedQtyKg || 0), unit: 'kg' },
      {
        label: '可复绕',
        value: (card.wipBatches || []).reduce((sum, batch) => sum + Number(batch.availableWeightKg || 0), 0),
        unit: 'kg',
      },
    ];
  }
  if (card.currentStageCode === 'P2-STEP-PACKAGING') {
    return [
      { label: '质检合格', value: qualifiedQty },
      { label: '已包装', value: packedQty },
      { label: '待包装', value: Math.max(0, qualifiedQty - packedQty) },
    ];
  }
  if (card.currentStageCode === 'P2-STEP-INBOUND-SAMPLING') {
    return [
      { label: '已包装', value: packedQty },
      { label: '入库检放行', value: releasedInboundQty },
      { label: '待放行', value: Math.max(0, packedQty - releasedInboundQty) },
    ];
  }
  if (card.currentStageCode === 'P2-STEP-FINISHED-INBOUND') {
    return [
      { label: '入库检放行', value: releasedInboundQty },
      { label: '已入库', value: inboundQty },
      { label: '待入库', value: Math.max(0, releasedInboundQty - inboundQty) },
    ];
  }
  return [
    { label: '良品', value: child.goodQty },
    { label: '不良', value: child.defectQty },
    { label: '待报工', value: Math.max(0, child.planQty - child.goodQty - child.defectQty) },
  ];
}

function lineCurrentProgressSummary(line: LineQueue) {
  const child = lineCurrentChild(line);
  if (!child) return '';
  return lineCurrentMetricRows(line)
    .map((metric) => `${metric.label} ${formatQty(metric.value, metric.unit || child.unit)}`)
    .join(' · ');
}

function childQuantityProgressText(child: ChildOrder) {
  const reported = child.goodQty + child.defectQty;
  const remaining = Math.max(0, child.planQty - reported);
  return `计划 ${formatQty(child.planQty, child.unit)} · 已报 ${formatQty(reported, child.unit)} · 剩 ${formatQty(remaining, child.unit)}`;
}

function lotQuantityProgressText(lot: WipLot) {
  const packed = ['待入库抽检', '待入库', '已入库'].includes(lot.stage) ? lot.qty : 0;
  return `计划 ${formatQty(lot.qty, lot.unit)} · 已包 ${formatQty(packed, lot.unit)} · 剩 ${formatQty(Math.max(0, lot.qty - packed), lot.unit)}`;
}

function lineCurrentQuantityText(line: LineQueue) {
  const operationJob = lineCurrentOperationJob(line);
  if (operationJob?.operationType === '复绕生产') {
    return `大盘 ${formatQty(operationJob.plannedQty, operationJob.plannedUnit)} · 已产 ${formatQty(operationJob.actualQty, operationJob.actualUnit)}`;
  }
  const child = lineCurrentChild(line);
  if (child) return childQuantityProgressText(child);
  const lot = lineCurrentLot(line);
  if (lot) return lotQuantityProgressText(lot);
  return '-';
}

function queueStepHint(child: ChildOrder) {
  if (child.status === '待领料') return '先领料';
  if (child.status === '队列中') return '可开工';
  if (child.status === '待首检') return '等首检放行';
  if (child.status === '生产中') return '生产中';
  return child.status;
}

function processStepByCode(code: string) {
  return siteProcessSteps.find((step) => step.code === code);
}

function lineActiveExecutionCard(line: LineQueue) {
  const child = lineCurrentChild(line);
  if (child?.executionCardCode) {
    return production2ExecutionCards.find((card) => card.code === child.executionCardCode);
  }
  const lot = lineCurrentLot(line);
  if (lot) return production2ExecutionCards.find((card) => card.code === lot.code);
  return line.queue
    .map((code) => operationJobRowByCode(code)?.card)
    .find(Boolean);
}

function lineCurrentOperationJob(line: LineQueue) {
  const card = lineActiveExecutionCard(line);
  return card ? executionCardOperationJob(card, line.currentOperationJobCode) : undefined;
}

function lineQueuedOperationJob(line: LineQueue) {
  return line.queue.map((code) => operationJobRowByCode(code)?.job).find(Boolean);
}

function lineCurrentStageInstance(line: LineQueue) {
  const card = lineActiveExecutionCard(line);
  return card?.stageInstances?.find((stage) => stage.stageCode === card.currentStageCode)
    || card?.stageInstances?.find((stage) => !['已完成', '未开始'].includes(stage.status));
}

function lineCurrentProcessStep(line: LineQueue): Production2ProcessStep | undefined {
  const currentChild = lineCurrentChild(line);
  const currentLot = lineCurrentLot(line);
  const instantiatedStageCode = lineActiveExecutionCard(line)?.currentStageCode;
  if (instantiatedStageCode) return processStepByCode(instantiatedStageCode);

  if (currentLot) {
    if (currentLot.stage === '待打包' || currentLot.stage === '包装中') return processStepByCode('P2-STEP-PACKAGING');
    if (currentLot.stage === '待入库抽检') return processStepByCode('P2-STEP-INBOUND-SAMPLING');
    if (currentLot.stage === '待入库' || currentLot.stage === '已入库') return processStepByCode('P2-STEP-FINISHED-INBOUND');
    return processStepByCode('P2-STEP-FINISHED-QC');
  }

  if (!currentChild) {
    const queuedLot = wipLots.value.find((lot) => lot.code === line.queue[0]);
    if (queuedLot || line.type === '包装产线') return line.queue.length ? processStepByCode('P2-STEP-PACKAGING') : undefined;
    return line.queue.length ? processStepByCode('P2-STEP-MATERIAL-ISSUE') : undefined;
  }
  if (currentChild.node === '待抽检') return processStepByCode('P2-STEP-INBOUND-SAMPLING');
  if (currentChild.node === '待入库') return processStepByCode('P2-STEP-FINISHED-INBOUND');
  if (currentChild.node === '待成品检' || currentChild.node === '待过程检') return processStepByCode('P2-STEP-FINISHED-QC');
  if (currentChild.status === '待领料' || !currentChild.materialIssued) return processStepByCode('P2-STEP-MATERIAL-ISSUE');
  if (currentChild.status === '队列中') return processStepByCode('P2-STEP-STARTUP');
  if (currentChild.status === '待首检' || line.status === '待首检') return processStepByCode('P2-STEP-FIRST-INSPECTION');
  if (line.status === '生产中' || line.status === '暂停中') {
    return line.type.includes('拉丝') ? processStepByCode('P2-STEP-WIP-REPORT-LARGE-REEL') : processStepByCode('P2-STEP-FINISHED-REPORT-SMALL-REEL');
  }
  if (line.status === '已完工' || currentChild.status === '待入库') return processStepByCode('P2-STEP-FINISHED-QC');
  return processStepByCode('P2-STEP-MATERIAL-ISSUE');
}

function lineCurrentProcessName(line: LineQueue) {
  const queuedOperationJob = !line.currentChildCode ? lineQueuedOperationJob(line) : undefined;
  if (queuedOperationJob?.supplementForShortClose) return '补产任务待开工';
  if (queuedOperationJob?.operationType === '复绕生产') return '复绕任务待开工';
  if (queuedOperationJob) return `${queuedOperationJob.operationType}待开工`;
  const operationJob = lineCurrentOperationJob(line);
  if (operationJob?.supplementForShortClose) return '补产执行';
  if (operationJob?.operationType === '复绕生产') return '复绕成品生产';
  const stage = lineCurrentStageInstance(line);
  if (stage) return stage.stageName;
  return lineCurrentProcessStep(line)?.name || (line.queue.length ? '待接入队首' : '待排产');
}

function compactProcessMeta(primary: string, secondary: string) {
  const values = [primary, secondary].map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)].join(' · ');
}

function lineProgressState(line: LineQueue, step: Production2ProcessStep, currentStep: Production2ProcessStep | undefined): SiteProgressState {
  const hasWork = Boolean(line.currentChildCode || line.queue.length);
  if (!hasWork) return step.executionMode === '工艺展示' ? '仅展示' : '待执行';
  if (!currentStep) return step.executionMode === '工艺展示' ? '仅展示' : '待执行';
  if (line.status === '异常停机' && step.sequence === currentStep.sequence) return '需处理';
  if (step.executionMode === '工艺展示') return step.sequence < currentStep.sequence ? '已完成' : '仅展示';
  if (step.sequence < currentStep.sequence) return '已完成';
  if (step.sequence === currentStep.sequence) return '当前';
  return '待执行';
}

function progressStateClass(state: SiteProgressState) {
  const classByState: Record<SiteProgressState, string> = {
    已完成: 'done',
    当前: 'current',
    待执行: 'pending',
    需处理: 'blocked',
    仅展示: 'display',
  };
  return classByState[state];
}

function lineProgressSteps(line: LineQueue): SiteProgressStep[] {
  const card = lineActiveExecutionCard(line);
  if (card?.stageInstances?.length) {
    return [...card.stageInstances]
      .sort((left, right) => left.sequence - right.sequence)
      .map((stage) => {
        const state: SiteProgressState = stage.status === '已完成'
          ? '已完成'
          : stage.status === '异常'
            ? '需处理'
            : stage.status === '未开始'
              ? '待执行'
              : '当前';
        const currentAction = stage.actionInstances.find((action) => !['已完成', '不适用', '未开始'].includes(action.status));
        const actionText = state === '已完成'
          ? ''
          : state === '待执行'
            ? currentAction?.actionName || '等待前序阶段'
            : stage.nextAction || currentAction?.actionName || '处理当前阶段';
        const helperText = stage.blocker || currentAction?.waitingFor || '';
        return {
          code: stage.stageCode,
          sequence: stage.sequence,
          name: stage.stageName,
          meta: compactProcessMeta(stage.stageType, stage.owner),
          state,
          stateClass: progressStateClass(state),
          actionText,
          helperText: helperText === actionText ? '' : helperText,
        };
      });
  }
  const currentStep = lineCurrentProcessStep(line);
  const steps = line.type === '包装产线' ? siteProcessSteps.filter((step) => step.sequence >= 80) : siteProcessSteps;
  return steps.map((step) => {
    const state = lineProgressState(line, step, currentStep);
    const actionText =
      state === '当前'
        ? lineNextStep(line).actionLabel
        : step.executionMode === '工艺展示'
          ? '现场按工艺执行'
          : step.defaultAction;
    return {
      code: step.code,
      sequence: step.sequence,
      name: step.name,
      meta: compactProcessMeta(step.executionMode, step.owner),
      state,
      stateClass: progressStateClass(state),
      actionText,
      helperText: state === '当前' ? lineNextStep(line).description : step.passAction || step.description,
    };
  });
}

function lineInfoRows(line: LineQueue): SiteInfoRow[] {
  const child = lineCurrentChild(line);
  const lot = lineCurrentLot(line);
  const queuedOperationJob = !child && !lot ? lineQueuedOperationJob(line) : undefined;
  const rows: SiteInfoRow[] = [
    { label: '产线类型', value: line.type },
    { label: '负责人', value: line.leader || '未指定' },
    { label: '队列任务', value: `${line.queue.length} 单` },
  ];

  if (child) {
    const card = production2ExecutionCards.find((item) => item.code === child.executionCardCode);
    const plan = workbenchPlanForSource(child.masterCode, card);
    const operationJob = lineCurrentOperationJob(line);
    rows.push(
      { label: '生产工单', value: child.masterCode },
      { label: '生产批次', value: childProductionBatchCode(child) },
      { label: '生产依据', value: `${plan.recipeCode} · ${plan.processCode}` },
      { label: '生产路线', value: plan.routeType },
      { label: operationJob?.sourceWipBatchCode ? '成品计划' : '计划数量', value: formatQty(child.planQty, child.unit) },
      { label: '领料状态', value: child.materialIssued ? '已领料' : '待领料' },
    );
    if (operationJob) {
      rows.splice(3, 0, {
        label: '当前作业',
        value: operationJob.supplementForShortClose
          ? operationJob.operationType === '复绕生产' ? '补产复绕' : '剩余补产'
          : operationJob.operationType,
      });
      if (operationJob.sourceWipBatchCode) {
        rows.push(
          { label: '来源大盘', value: operationJob.sourceWipBatchCode },
          { label: '本次处理重量', value: formatQty(operationJob.plannedQty, operationJob.plannedUnit) },
        );
      }
    }
  }

  if (lot) {
    rows.push(
      { label: '生产批次', value: lot.code },
      { label: '批次阶段', value: lot.stage },
      { label: '质检状态', value: lot.quality },
      { label: '批次数量', value: formatQty(lot.qty, lot.unit) },
      { label: '当前位置', value: lot.location },
    );
  }

  if (queuedOperationJob) {
    const card = production2ExecutionCards.find((item) => item.code === queuedOperationJob.productionBatchCode);
    const plan = card ? workbenchPlanForSource(card.workOrderCode, card) : undefined;
    rows.push(
      {
        label: '当前作业',
        value: queuedOperationJob.supplementForShortClose
          ? queuedOperationJob.operationType === '复绕生产' ? '补产复绕' : '剩余补产'
          : queuedOperationJob.operationType,
      },
      { label: '生产工单', value: card?.workOrderCode || '-' },
      { label: '生产批次', value: queuedOperationJob.productionBatchCode },
    );
    if (plan) {
      rows.push(
        { label: '生产依据', value: `${plan.recipeCode} · ${plan.processCode}` },
        { label: '生产路线', value: plan.routeType },
      );
    }
    if (queuedOperationJob.sourceWipBatchCode) {
      rows.push(
        { label: '成品计划', value: formatQty(Number(card?.planQty || 0), card?.unit || '卷') },
        { label: '来源大盘', value: queuedOperationJob.sourceWipBatchCode },
        { label: '本次处理重量', value: formatQty(queuedOperationJob.plannedQty, queuedOperationJob.plannedUnit) },
      );
    } else {
      rows.push({ label: '计划数量', value: formatQty(queuedOperationJob.plannedQty, queuedOperationJob.plannedUnit) });
    }
    rows.push({ label: '队列状态', value: queuedOperationJob.status });
  }

  return rows;
}

function lineDisplayStatus(line: LineQueue) {
  const currentChild = lineCurrentChild(line);
  const currentLot = lineCurrentLot(line);
  if (line.status === '异常停机') return '异常停机';
  if (line.status === '暂停中') return '暂停中';
  if (currentLot) {
    if (currentLot.stage === '待打包' && line.status === '待开工') return '待包装开工';
    if (currentLot.stage === '包装中') return '包装中';
    return currentLot.stage;
  }
  if (!currentChild && !currentLot && line.queue.length) return '待开工';
  if (!currentChild && !currentLot && lineWaitingMaterialItems(line).length) return '待领料';
  if (line.status === '待首检') return '待首检';
  if (currentChild && /检|入库|包装|打包/.test(currentChild.node)) return productionNodeDisplay(currentChild.node);
  if (currentChild && line.status !== '生产中' && line.status !== '已完工') {
    if (currentChild.status === '队列中') return '待开工';
    return currentChild.status;
  }
  if (line.status !== '待开工') return line.status;
  const queueChildren = lineQueueChildren(line);
  if (queueChildren.some((child) => child.status === '队列中')) return '待开工';
  if (queueChildren.some((child) => child.status === '待领料')) return '待领料';
  return line.status;
}

function productionNodeDisplay(node: string) {
  const labels: Record<string, string> = {
    待抽检: '待入库检',
    待成品检: '待报工检',
    待过程检: '待过程检',
    待半成品检: '待半成品检',
  };
  return labels[node] || node;
}

function lineNextStep(line: LineQueue): LineNextStep {
  const currentChild = lineCurrentChild(line);
  const currentLot = lineCurrentLot(line);

  if (shiftStatus.value === '待交接') {
    return {
      title: '等待接班',
      actionLabel: '等待接班',
      description: '本班次已交班，现场任务保持原状态；下一班接班并选择负责人后才能继续操作。',
      statusText: lineDisplayStatus(line),
      disabledReason: '请先完成接班',
      primaryAction: 'wait',
    };
  }

  if (line.status === '异常停机') {
    return {
      title: '异常停机',
      actionLabel: '查看异常',
      description: '产线已被未关闭异常阻断；请进入异常单完成处置和复核，再恢复原生产阶段。',
      statusText: '异常停机',
      disabledReason: '',
      primaryAction: 'exception-detail',
    };
  }

  if (lineNeedsLeader(line)) {
    return {
      title: '负责人待确认',
      actionLabel: '选择负责人',
      description: '当前产线正在执行任务，但本班次负责人为空，请先从当前班次人员中选择负责人。',
      statusText: lineDisplayStatus(line),
      disabledReason: workbenchPrototypeCommandsAvailable ? '' : '负责人需要在接班记录或执行批次中确认',
      primaryAction: 'leader',
    };
  }

  if (!line.currentChildCode && line.queue.length) {
    const queuedOperation = operationJobRowByCode(line.queue[0]);
    if (queuedOperation && ['可开工', '队列中'].includes(queuedOperation.job.status)) {
      const isRewind = queuedOperation.job.operationType === '复绕生产';
      const isSupplement = Boolean(queuedOperation.job.supplementForShortClose);
      const operationLabel = queuedOperation.job.operationType.replace(/生产$/, '');
      return {
        title: isSupplement ? '剩余补产已就绪' : isRewind ? '复绕任务已就绪' : `${queuedOperation.job.operationType}已就绪`,
        actionLabel: isSupplement && isRewind ? '开始补产复绕' : isSupplement ? '开始补产' : isRewind ? '开始复绕' : `开始${operationLabel}`,
        description: isSupplement && isRewind
          ? `继续使用合格大盘 ${queuedOperation.job.sourceWipBatchCode || ''} 补足剩余数量；确认负责人后开始，沿用原生产批次，不重复领料或首检。`
          : isSupplement
            ? '剩余数量已形成补充设备作业；确认负责人后开工，并重新执行开机首检。'
          : isRewind
            ? `合格大盘 ${queuedOperation.job.sourceWipBatchCode || ''} 已自动进入当前队列；确认负责人后开始，不再重复建工单、领料或首检。`
            : `${queuedOperation.job.operationType}已进入队首；确认负责人后开始执行。`,
        statusText: '待开工',
        disabledReason: '',
        primaryAction: 'start',
      };
    }
    return {
      title: '队列待接入',
      actionLabel: '接入队首',
      description: '把队列第一项切换为当前产线任务，再按该任务状态执行下一步。',
      statusText: '有队列',
      disabledReason: workbenchPrototypeCommandsAvailable ? '' : '当前队列顺序已锁定，请先在排产中确认生产安排',
      primaryAction: 'take-next',
    };
  }

  if (currentChild) {
    if (currentChild.node === '待抽检' || currentChild.node === '待半成品检' || currentChild.node === '待成品检' || currentChild.node === '待过程检') {
      const isInboundInspection = lineActiveExecutionCard(line)?.currentStageCode === 'P2-STEP-INBOUND-SAMPLING';
      return {
        title: '等待质检放行',
        actionLabel: '等待质检判定',
        description: isInboundInspection
          ? '入库检由质检模块处理，放行后由仓库办理完工入库。'
          : '当前生产动作已完成，质检放行后系统自动开放后续生产动作。',
        statusText: productionNodeDisplay(currentChild.node),
        disabledReason: '质检未放行',
        primaryAction: 'wait',
      };
    }
    if (currentChild.node === '待入库') {
      return {
        title: '等待仓库入库',
        actionLabel: '等待仓库入库',
        description: '该批次已具备入库条件，等待仓库确认实际入库数量。',
        statusText: '待入库',
        disabledReason: '仓库未入库',
        primaryAction: 'wait',
      };
    }
    if (currentChild.status === '待领料') {
      return {
        title: '等待领料',
        actionLabel: '等待仓库领料',
        description: '排产确认后系统已自动生成仓库领料任务；仓库确认出库后，生产批次自动进入可开工状态。',
        statusText: '待领料',
        disabledReason: '等待仓库确认出库',
        primaryAction: 'wait',
      };
    }
    if (currentChild.status === '队列中') {
      const operationJob = lineCurrentOperationJob(line);
      const isRewind = operationJob?.operationType === '复绕生产';
      return {
        title: '可以开工',
        actionLabel: isRewind ? '开始复绕' : '开工',
        description: isRewind
          ? `合格大盘 ${operationJob.sourceWipBatchCode || ''} 已自动排到当前复绕线；确认负责人后直接开始，不再重复建单、领料或首检。`
          : '开工时选择本班负责人，系统会进入待首检状态。',
        statusText: '待开工',
        disabledReason: '',
        primaryAction: 'start',
      };
    }
    if (currentChild.status === '待首检' || line.status === '待首检') {
      return {
        title: '等待首检放行',
        actionLabel: '等待首检判定',
        description: '首检由质检模块处理，质检合格放行后当前产线自动进入生产中。',
        statusText: '待首检',
        disabledReason: '质检未放行',
        primaryAction: 'wait',
      };
    }
    if (line.status === '暂停中') {
      return {
        title: '生产已暂停',
        actionLabel: '恢复生产',
        description: '恢复后可以继续登记当前生产批次的实际产量。',
        statusText: '暂停中',
        disabledReason: '',
        primaryAction: 'resume',
      };
    }
    if (line.status === '生产中') {
      const currentCard = lineActiveExecutionCard(line);
      if (currentCard?.currentStageCode === 'P2-STEP-WIP-REPORT-LARGE-REEL' || currentCard?.node === '半成品报工') {
        return {
          title: '拉丝大盘待登记',
          actionLabel: '登记大盘产出',
          description: '登记大盘编号和实际净重；提交后系统生成独立大盘批次并进入半成品质检。',
          statusText: '半成品报工',
          disabledReason: '',
          primaryAction: 'report',
        };
      }
      return {
        title: '生产中',
        actionLabel: currentCard?.currentStageCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL' ? '登记成品产量' : '登记产量',
        description: ((currentCard?.processSnapshot as { processTemplate?: { routeType?: string } } | null | undefined)?.processTemplate?.routeType === '大盘复绕'
          || currentCard?.processTemplateCode === 'PRC2-WIRE-DRAWING-REWIND-V1')
          ? '选择已放行的大盘，登记复绕产出、实际用量和损耗，系统自动生成小盘追溯编号。'
          : '填写本次良品和不良数量，结果写入关联的生产批次，再进入报工质检。',
        statusText: '生产中',
        disabledReason: '',
        primaryAction: 'report',
      };
    }
    if (line.status === '已完工') {
      return {
        title: '设备作业已完成',
        actionLabel: '查看生产批次',
        description: '累计登记数量已达到计划，本次设备作业已结束；后续质检、包装和入库继续办理。',
        statusText: '待结束',
        disabledReason: '',
        primaryAction: 'detail',
      };
    }
  }

  if (currentLot) {
    if (currentLot.stage === '待打包' && line.status === '待开工') {
      return {
        title: '包装待开工',
        actionLabel: '包装开工',
        description: '选择本班负责人后开始包装，包装完成后按生产批次报工。',
        statusText: '待包装开工',
        disabledReason: '',
        primaryAction: 'start',
      };
    }
    if (line.status === '暂停中') {
      return {
        title: '包装已暂停',
        actionLabel: '恢复生产',
        description: '恢复后继续当前生产批次包装。',
        statusText: '暂停中',
        disabledReason: '',
        primaryAction: 'resume',
      };
    }
    if (currentLot.stage === '包装中' && line.status === '生产中') {
      return {
        title: '包装中',
        actionLabel: '办理包装',
        description: '打开生产批次确认包装数量和包装标识；成功后进入入库抽检。',
        statusText: '包装中',
        disabledReason: '',
        primaryAction: 'detail',
      };
    }
    if (currentLot.stage === '待入库抽检') {
      return {
        title: '等待入库抽检',
        actionLabel: '等待入库检判定',
        description: '抽检由质检模块处理，放行后生产批次进入待入库。',
        statusText: '待入库抽检',
        disabledReason: '质检未放行',
        primaryAction: 'wait',
      };
    }
    if (currentLot.stage === '待入库') {
      return {
        title: '等待仓库入库',
        actionLabel: '等待仓库入库',
        description: '仓库完成入库后，生产批次和生产任务进度自动更新。',
        statusText: '待入库',
        disabledReason: '仓库未入库',
        primaryAction: 'wait',
      };
    }
  }

  return {
    title: '产线空闲',
    actionLabel: '暂无动作',
    description: line.queue.length ? '队列存在任务，请先接入队首。' : '当前产线没有任务，可到排产页安排工单。',
    statusText: line.status,
    disabledReason: '',
    primaryAction: 'none',
  };
}

function lineNeedsLeader(line: LineQueue) {
  if (!line.currentChildCode || line.leader || line.status === '异常停机') return false;
  if (lineCurrentLot(line)) return line.status === '生产中' || line.status === '暂停中';
  const currentChild = lineCurrentChild(line);
  return Boolean(currentChild && (line.status === '待首检' || line.status === '生产中' || line.status === '暂停中' || line.status === '已完工'));
}

function lineCurrentChild(line: LineQueue) {
  return childOrders.value.find((child) => child.code === line.currentChildCode);
}

function lineHasScheduledWork(line: LineQueue) {
  return Boolean(line.currentChildCode || line.queue.length);
}

function lineCurrentLot(line: LineQueue) {
  return wipLots.value.find((lot) => lot.code === line.currentChildCode);
}

function lineCurrentWorkCode(line: LineQueue) {
  const child = lineCurrentChild(line);
  if (child) return childProductionBatchCode(child);
  const lot = lineCurrentLot(line);
  if (lot) return lot.code;
  const operationRow = operationJobRowByCode(line.currentOperationJobCode || line.queue[0] || '');
  if (operationRow) return operationRow.card.code;
  const queueChild = childOrders.value.find((item) => item.code === line.queue[0]);
  return queueChild ? childProductionBatchCode(queueChild) : line.queue[0] || '-';
}

function lineCurrentNote(line: LineQueue) {
  return line.currentChildCode ? line.queueNotes[line.currentChildCode] || '' : '';
}

function lineQueueNote(line: LineQueue, code: string) {
  return line.queueNotes[code] || '';
}

function lineLastReportText(line: LineQueue) {
  if (!line.lastReportAt || !line.lastReportCode || !line.lastReportQty) return '-';
  return `${line.lastReportAt} · ${line.lastReportCode} · ${formatQty(line.lastReportQty, line.lastReportUnit)}`;
}

function lineQueueChildren(line: LineQueue) {
  return line.queue
    .map((code) => childOrders.value.find((child) => child.code === code))
    .filter((child): child is ChildOrder => Boolean(child));
}

function lineQueueItem(code: string, line?: LineQueue) {
  const operationRow = operationJobRowByCode(code);
  if (operationRow) {
    const plan = workbenchPlanForSource(operationRow.card.workOrderCode, operationRow.card);
    return {
      code,
      title: operationRow.card.code,
      subtitle: `${operationRow.job.operationType} · ${plan.routeType} · ${operationRow.card.productName}`,
      qty: operationRow.job.plannedQty,
      unit: operationRow.job.plannedUnit,
      status: operationRow.job.status,
      kind: '工序任务',
      note: line ? lineQueueNote(line, code) : operationRow.job.nextAction,
    };
  }
  const child = childOrders.value.find((item) => item.code === code);
  if (child) {
    return {
      code,
      title: childProductionBatchCode(child),
      subtitle: child.productName,
      qty: child.planQty,
      unit: child.unit,
      status: queueStepHint(child),
      kind: child.executionCardCode ? '生产批次' : '待生成批次',
      note: line ? lineQueueNote(line, code) : '',
    };
  }
  const lot = wipLots.value.find((item) => item.code === code);
  if (lot) {
    return {
      code,
      title: lot.code,
      subtitle: lot.productName,
      qty: lot.qty,
      unit: lot.unit,
      status: lot.stage,
      kind: '生产批次',
      note: line ? lineQueueNote(line, code) : '',
    };
  }
  return undefined;
}

function lineQueueItems(line: LineQueue) {
  return line.queue.map((code) => lineQueueItem(code, line)).filter((item): item is NonNullable<ReturnType<typeof lineQueueItem>> => Boolean(item));
}

function lineWaitingMaterialItems(line: LineQueue) {
  return childOrders.value.filter((child) => (
    child.releaseConfirmed
    && !child.materialIssued
    && child.status === '待领料'
    && child.line === line.name
  ));
}

function queueOptionsForLine(line: LineQueue) {
  return schedulableItems.value.filter((item) => (
    line.schedulable
      && productionLineCapability(item.lineType) === productionLineCapability(line.type)
      && item.qty > 0
      && (workbenchPrototypeCommandsAvailable || item.kind !== 'lot')
  ));
}

function selectedQueueDraftItem() {
  return schedulableItems.value.find((item) => item.key === queueDraft.sourceKey);
}

const queueDraftValidationMessage = computed(() => {
  const item = selectedQueueDraftItem();
  if (!item) return '请选择可安排的生产工单';
  const qty = Number(queueDraft.qty);
  if (!Number.isFinite(qty) || qty <= 0) return '本次安排数量必须大于 0';
  if (qty > item.qty) return `本次最多可安排 ${formatQty(item.qty, item.unit)}`;
  return '';
});

function openQueueDraft(line: LineQueue) {
  if (guardWorkbenchWriteAction()) return;
  const options = queueOptionsForLine(line);
  queueDraft.lineName = line.name;
  queueDraft.sourceKey = options[0]?.key ?? '';
  queueDraft.qty = Math.min(options[0]?.qty ?? 1, 200);
  queueDraft.note = '';
}

function closeQueueDraft() {
  queueDraft.lineName = '';
  queueDraft.sourceKey = '';
  queueDraft.qty = 200;
  queueDraft.note = '';
}

function releaseIdempotencyKey(master: MasterOrder, releaseQty: number, line: LineQueue) {
  const intent = `${master.code}:${master.revision}:${releaseQty}:${line.name}:${currentShift.name}`;
  const existing = releaseIdempotencyKeys.get(intent);
  if (existing) return { intent, key: existing };
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `workbench-release:${master.code}:${random}`;
  releaseIdempotencyKeys.set(intent, key);
  return { intent, key };
}

async function releaseWorkOrder(master: MasterOrder, releaseQty: number, line: LineQueue) {
  if (guardWorkbenchWriteAction()) return;
  const requestKey = releaseIdempotencyKey(master, releaseQty, line);
  releaseBusyKey.value = master.code;
  try {
    const response = await fetch(`${apiBase}/production/work-orders/${encodeURIComponent(master.code)}/release`, {
      method: 'POST',
      headers: requestHeaders(true),
      body: JSON.stringify({
        releaseQty,
        workOrderRevision: master.revision,
        idempotencyKey: requestKey.key,
        lineCode: line.code,
        line: line.name,
        lineType: line.type,
        shift: currentShift.name,
        leader: currentShift.leader,
        actor: currentShift.leader,
      }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : `生产安排失败：${response.status}`;
      throw new Error(message);
    }
    releaseIdempotencyKeys.delete(requestKey.intent);
    const inventoryRefreshed = await refreshWorkbenchInventoryAfterCommand();
    if (inventoryRefreshed) syncReleasedWorkOrderFacts(payload);
    const release = payload.release as Record<string, unknown> | undefined;
    const releaseCode = String(release?.code || '生产安排');
    const repeated = Boolean(payload.repeated);
    showToast(
      repeated
        ? `${releaseCode} 已处理，无需重复提交；页面已刷新为最新结果`
        : `${releaseCode} 已安排 ${formatQty(Number(release?.releasedQty || releaseQty), String(release?.unit || master.unit))}，本次数量已保存；领料完成后生成生产批次`,
    );
    closeQueueDraft();
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${master.code} 安排失败，请重试`);
  } finally {
    releaseBusyKey.value = '';
  }
}

async function confirmQueueDraft(line: LineQueue) {
  if (guardWorkbenchWriteAction()) return;
  const item = selectedQueueDraftItem();
  if (!item) {
    showToast('当前产线没有可安排的生产工单');
    return;
  }
  if (queueDraftValidationMessage.value) {
    showToast(queueDraftValidationMessage.value);
    return;
  }
  if (!line.schedulable || productionLineCapability(item.lineType) !== productionLineCapability(line.type)) {
    showToast(`${item.title} 适用${item.lineType}，不能排到${line.type}`);
    return;
  }

  if (item.kind === 'master' && item.masterCode) {
    const master = masterOrders.value.find((order) => order.code === item.masterCode);
    if (!master) return;
    const availableQty = masterReleasableQty(master);
    if (availableQty <= 0) {
      showToast(`${master.code} 当前没有可安排数量，请先处理备料或质检`);
      return;
    }
    const pendingRelease = item.releaseCode
      ? childOrders.value.find((child) => child.code === item.releaseCode && !child.releaseConfirmed)
      : undefined;
    const releaseQty = Math.min(Number(queueDraft.qty), availableQty, pendingRelease?.planQty ?? Number.POSITIVE_INFINITY);
    await releaseWorkOrder(master, releaseQty, line);
    return;
  }

  if (item.kind === 'lot' && item.lotCode) {
    showWorkbenchCommandUnavailable('包装排产');
  }
}

function moveQueueItemUp(line: LineQueue, index: number) {
  if (index <= 0) return;
  if (!workbenchPrototypeCommandsAvailable) {
    showWorkbenchCommandUnavailable(`${line.name}队列调整`);
    return;
  }
  const previous = line.queue[index - 1];
  line.queue[index - 1] = line.queue[index];
  line.queue[index] = previous;
  showToast(`${line.name} 队列顺序已调整`);
}

function takeNextWork(line: LineQueue) {
  if (line.currentChildCode || !line.queue.length) return;
  if (!workbenchPrototypeCommandsAvailable) {
    showWorkbenchCommandUnavailable(`${line.name}接入队首`);
    return;
  }
  const nextCode = line.queue.shift();
  if (!nextCode) return;
  line.currentChildCode = nextCode;
  const child = childOrders.value.find((item) => item.code === nextCode);
  const lot = wipLots.value.find((item) => item.code === nextCode);
  if (child) {
    child.line = line.name;
    child.status = child.materialIssued ? '队列中' : '待领料';
    line.status = '待开工';
    showToast(`${line.name} 已接入 ${child.code}，下一步${queueStepHint(child)}`);
  } else if (lot) {
    lot.stage = '待打包';
    lot.location = `${line.name}当前工位`;
    line.status = '待开工';
    showToast(`${line.name} 已接入 ${lot.code}，下一步包装开工`);
  }
  selectedLineName.value = line.name;
}

function openOperation(panel: Exclude<OperationPanel, null>) {
  if (!['reportRecords', 'handoverRecords'].includes(panel.type) && guardWorkbenchWriteAction()) return;
  if (panel.type === 'dispatch') {
    const child = childOrders.value.find((item) => item.code === panel.childCode);
    dispatchDraft.lineName = child?.line || dispatchDraft.lineName || lineRows.value[0]?.name || '';
  }
  if (panel.type === 'start' || panel.type === 'leader') {
    const line = lineRows.value.find((item) => item.name === panel.lineName);
    startDraft.leader = line?.leader && shiftMembers.value.includes(line.leader) ? line.leader : shiftMembers.value[0] || '';
  }
  if (panel.type === 'pause') executionStateDraft.reason = '设备点检或现场条件需要确认';
  if (panel.type === 'resume') executionStateDraft.reason = '暂停原因已解除，现场确认可继续';
  if (panel.type === 'handoverShift') {
    handoverDraft.note = currentShift.handoverNote;
  }
  if (panel.type === 'receiveShift') {
    receiveDraft.shiftName = currentShift.name === '白班' ? '夜班' : '白班';
    receiveDraft.leader = shiftMemberOptions.includes(currentShift.leader) ? currentShift.leader : shiftMemberOptions[0];
    receiveDraft.members = [receiveDraft.leader, ...shiftMemberOptions.filter((name) => name !== receiveDraft.leader).slice(0, 1)];
  }
  if (panel.type === 'report') {
    const line = lineRows.value.find((item) => item.name === panel.lineName);
    const child = line ? lineCurrentChild(line) : undefined;
    const card = line ? lineActiveExecutionCard(line) : undefined;
    const remainQty = child ? Math.max(0, child.planQty - child.goodQty - child.defectQty) : 0;
    reportDraft.goodQty = Math.min(50, remainQty);
    reportDraft.defectQty = 0;
    reportDraft.reelCode = card ? `${card.code}-LR-${String((card.wipBatches?.length || 0) + 1).padStart(2, '0')}` : '';
    reportDraft.netWeightKg = 0;
    reportDraft.equipment = line?.name || '';
    const availableWip = (card?.wipBatches || []).find((item) => ['合格', '部分使用'].includes(item.status) && Number(item.availableWeightKg || 0) > 0);
    reportDraft.sourceWipBatchCode = availableWip?.code || '';
    const recipe = productionRecipeForExecutionCard(card);
    const suggestedConsumption = Math.min(
      Number(availableWip?.availableWeightKg || 0),
      Math.max(0, reportDraft.goodQty + reportDraft.defectQty) * Number(recipe?.productUnitWeightKg || 0),
    );
    reportDraft.consumedWeightKg = Math.round(suggestedConsumption * 1000) / 1000;
    reportDraft.lossWeightKg = 0;
    reportDraft.closeOperation = false;
    reportDraft.shortCloseReason = '';
  }
  if (panel.type === 'exception') {
    exceptionDraft.type = '设备异常';
    exceptionDraft.reason = '';
    exceptionDraft.result = '异常停机';
  }
  operationPanel.value = panel;
}

function closeOperation() {
  operationPanel.value = null;
}

async function confirmOperation() {
  const panel = operationPanel.value;
  if (!panel) return;

  if (panel.type === 'reportRecords' || panel.type === 'handoverRecords') {
    closeOperation();
    return;
  }
  if (guardWorkbenchWriteAction()) return;

  if (panel.type === 'material' && operationChild.value) {
    issueChild(operationChild.value);
    closeOperation();
    return;
  }

  if (panel.type === 'start' && operationLine.value) {
    if (!shiftMembers.value.includes(startDraft.leader)) {
      showToast('请选择本班次人员作为负责人');
      return;
    }
    if (await startLine(operationLine.value)) closeOperation();
    return;
  }

  if (panel.type === 'report' && operationLine.value) {
    if (await reportLine(operationLine.value)) closeOperation();
    return;
  }

  if (panel.type === 'pause' && operationLine.value) {
    if (!executionStateDraft.reason.trim()) {
      showToast('请填写暂停原因');
      return;
    }
    if (await pauseLine(operationLine.value, executionStateDraft.reason.trim())) closeOperation();
    return;
  }

  if (panel.type === 'resume' && operationLine.value) {
    if (!executionStateDraft.reason.trim()) {
      showToast('请填写恢复说明');
      return;
    }
    if (await resumeLine(operationLine.value, executionStateDraft.reason.trim())) closeOperation();
    return;
  }

  if (panel.type === 'exception' && operationLine.value) {
    if (await registerLineException(operationLine.value)) closeOperation();
    return;
  }

  if (panel.type === 'handoverShift') {
    if (await confirmHandoverShift()) closeOperation();
    return;
  }

  if (panel.type === 'receiveShift') {
    if (await confirmReceiveShift()) closeOperation();
    return;
  }

  if (!workbenchPrototypeCommandsAvailable) {
    showWorkbenchCommandUnavailable(operationTitle.value || '工作台操作');
    return;
  }

  if (panel.type === 'split' && operationMaster.value) splitMaster(operationMaster.value);
  if (panel.type === 'dispatch' && operationChild.value) dispatchChild(operationChild.value, dispatchDraft.lineName);
  if (panel.type === 'leader' && operationLine.value) {
    if (!shiftMembers.value.includes(startDraft.leader)) {
      showToast('请选择本班次人员作为负责人');
      return;
    }
    updateLineLeader(operationLine.value);
  }
  if (panel.type === 'wip' && operationLot.value) advanceWip(operationLot.value);

  closeOperation();
}

function runLinePrimaryAction(line: LineQueue) {
  const step = lineNextStep(line);
  if (step.primaryAction === 'detail') openLineExecutionDetail(line);
  if (step.primaryAction === 'take-next') takeNextWork(line);
  if (step.primaryAction === 'material') {
    const child = lineCurrentChild(line);
    if (child) openOperation({ type: 'material', childCode: child.code });
  }
  if (step.primaryAction === 'start') openOperation({ type: 'start', lineName: line.name });
  if (step.primaryAction === 'leader') openOperation({ type: 'leader', lineName: line.name });
  if (step.primaryAction === 'report') openOperation({ type: 'report', lineName: line.name });
  if (step.primaryAction === 'resume') openOperation({ type: 'resume', lineName: line.name });
  if (step.primaryAction === 'wip') {
    const lot = lineCurrentLot(line);
    if (lot) openOperation({ type: 'wip', lotCode: lot.code });
  }
  if (step.primaryAction === 'quality') openLineQuality(line);
  if (step.primaryAction === 'inbound') openLineInbound(line);
  if (step.primaryAction === 'exception-detail') openLineException(line);
}

function canRunPrimaryAction(step: LineNextStep | undefined) {
  if (!step || step.primaryAction === 'wait' || step.primaryAction === 'none') return false;
  if (!workbenchPrototypeCommandsAvailable && ['take-next', 'leader'].includes(step.primaryAction)) return false;
  if (
    workbenchWriteActionsDisabled.value
    && ['take-next', 'material', 'start', 'leader', 'report', 'resume', 'wip'].includes(step.primaryAction)
  ) return false;
  return true;
}

function splitMaster(master: MasterOrder) {
  const remainQty = masterUnplannedQty(master);
  if (!remainQty) {
    showToast(`${master.code} 已完成全部生产安排`);
    return;
  }
  const qty = Math.min(childDraft.qty || remainQty, remainQty, masterReleasableQty(master));
  if (!qty) {
    showToast(`${master.code} 当前没有可安排数量，请先处理备料或质检`);
    return;
  }
  const code = nextReleaseBatchCode();
  childOrders.value.unshift({
    code,
    executionCardCode: '',
    masterCode: master.code,
    productCode: master.productCode,
    productName: master.productName,
    planQty: qty,
    unit: master.unit,
    goodQty: 0,
    defectQty: 0,
    status: '待释放',
    node: '待领料',
    materialIssued: false,
    releaseConfirmed: false,
  });
  selectedMasterCode.value = master.code;
  selectedChildCode.value = code;
  showToast(`已新增生产安排 ${code}`);
}

function dispatchChild(child: ChildOrder, lineName = '') {
  const master = childMaster(child);
  if (!child.releaseConfirmed) {
    const releasableQty = master ? masterReleasableQty(master) : 0;
    if (!master || releasableQty < child.planQty) {
      showToast(`${child.code} 当前物料不足，不能确认安排`);
      return;
    }
    child.releaseConfirmed = true;
    if (master.status === '待释放') master.status = '生产中';
  }
  const line =
    lineRows.value.find((item) => item.name === lineName) ??
    lineRows.value.find((item) => item.type === master?.lineType) ??
    lineRows.value[0];
  if (!line.queue.includes(child.code) && line.currentChildCode !== child.code) {
    line.queue.push(child.code);
  }
  child.line = line.name;
  child.status = child.materialIssued ? '队列中' : '待领料';
  child.node = '待领料';
  if (line.status === '空闲') line.status = '待开工';
  showToast(`${child.code} 已安排到${line.name}队列；仓库确认领料出库后生成生产批次`);
}

function issueChild(child: ChildOrder) {
  if (!child.releaseConfirmed) {
    showToast(`${child.code} 尚未确认安排，系统不会生成仓库领料任务`);
    return;
  }
  if (child.materialIssueCode) {
    showToast(`仓库领料任务 ${child.materialIssueCode} 已生成，等待仓库确认出库`);
    return;
  }
  showToast(`${child.code} 确认释放后由系统自动生成仓库领料任务，无需生产人员跨模块建单`);
}

async function startLine(line: LineQueue) {
  if (guardWorkbenchWriteAction()) return false;
  if (shiftStatus.value === '待交接') {
    showToast('当前待交接，接班后才能开工');
    return false;
  }
  const currentLot = lineCurrentLot(line);
  if (currentLot) {
    showWorkbenchCommandUnavailable(`${line.name}包装开工`);
    return false;
  }
  const current = lineCurrentChild(line);
  const queuedOperation = line.queue.map((code) => operationJobRowByCode(code)).find((item) => (
    item && ['可开工', '队列中'].includes(item.job.status)
  ));
  const nextCode = current?.status === '队列中'
    ? current.code
    : line.queue.find((code) => childOrders.value.find((child) => child.code === code)?.status === '队列中');
  if (!nextCode && !queuedOperation) {
    showToast(`${line.name} 没有已领料可开工的队列工单`);
    return false;
  }
  const child = queuedOperation
    ? childOrders.value.find((item) => item.executionCardCode === queuedOperation.card.code || item.code === queuedOperation.card.releaseBatchCode)
    : childOrders.value.find((item) => item.code === nextCode);
  if (!child?.executionCardCode) {
    showToast(`${child?.code || nextCode || queuedOperation?.card.code} 尚未生成生产批次`);
    return false;
  }
  const card = queuedOperation?.card || production2ExecutionCards.find((item) => item.code === child.executionCardCode);
  if (!card) {
    showToast(`生产批次 ${child.executionCardCode} 尚未加载，请刷新后重试`);
    return false;
  }
  const requestKey = executionIntentKey('start', card);
  const operationJob = queuedOperation?.job || executionCardOperationJob(card, line.currentOperationJobCode);
  executionBusyKey.value = card.code;
  try {
    const response = operationJob
      ? await startProductionOperationJob(card.code, operationJob.code, {
          revision: Number(card.revision || 0),
          line: line.name,
          leader: startDraft.leader,
          operator: startDraft.leader,
          actor: startDraft.leader,
          idempotencyKey: requestKey.key,
        })
      : await startProductionExecutionCard(card.code, {
          revision: Number(card.revision || 0),
          leader: startDraft.leader,
          operator: startDraft.leader,
          actor: startDraft.leader,
          idempotencyKey: requestKey.key,
        });
    const persisted = upsertRuntimeExecutionFacts(response);
    executionIdempotencyKeys.delete(requestKey.intent);
    line.queue = line.queue.filter((code) => code !== nextCode && code !== operationJob?.code);
    line.currentChildCode = child.code;
    line.currentOperationJobCode = operationJob?.code || '';
    selectedChildCode.value = child.code;
    showToast(operationJob
      ? operationJob.operationType === '复绕生产'
        ? `${persisted.code} 已开始${operationJob.supplementForShortClose ? '补产复绕' : '复绕'}大盘 ${operationJob.sourceWipBatchCode || ''}`.trim()
        : `${persisted.code} 已开始补产，等待开机首检 ${response.qualityTask?.code || ''}`.trim()
      : `${persisted.code} 已开工，等待开机首检 ${response.qualityTask?.code || ''}`.trim());
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 开工失败，请重试`);
    return false;
  } finally {
    executionBusyKey.value = '';
  }
}

function updateLineLeader(line: LineQueue) {
  if (!line.currentChildCode) {
    showToast(`${line.name} 当前没有正在执行的工单或生产批次`);
    return;
  }
  line.leader = startDraft.leader;
  activityLogs.value.unshift(`刚刚 ${line.name} 现场负责人调整为 ${line.leader}。`);
  showToast(`${line.name} 负责人已更新为 ${line.leader}`);
}

async function pauseLine(line: LineQueue, reason: string) {
  if (guardWorkbenchWriteAction()) return false;
  if (line.status !== '生产中') return false;
  const child = lineCurrentChild(line);
  const card = child?.executionCardCode
    ? production2ExecutionCards.find((item) => item.code === child.executionCardCode)
    : undefined;
  if (!card) {
    showToast(`${line.name} 当前没有可操作的生产批次`);
    return false;
  }
  const requestKey = executionIntentKey('pause', card);
  executionBusyKey.value = card.code;
  try {
    const response = await pauseProductionExecutionCard(card.code, {
      revision: Number(card.revision || 0),
      reason,
      actor: line.leader || currentShift.leader,
      idempotencyKey: requestKey.key,
    });
    const persisted = upsertRuntimeExecutionFacts(response);
    executionIdempotencyKeys.delete(requestKey.intent);
    activityLogs.value.unshift(`刚刚 ${line.name} 暂停 ${persisted.code}：${reason}。`);
    showToast(`${persisted.code} 已暂停，原执行节点已保留`);
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 暂停失败`);
    return false;
  } finally {
    executionBusyKey.value = '';
  }
}

async function resumeLine(line: LineQueue, reason: string) {
  if (guardWorkbenchWriteAction()) return false;
  if (line.status !== '暂停中' || !line.currentChildCode) return false;
  const child = lineCurrentChild(line);
  const card = child?.executionCardCode
    ? production2ExecutionCards.find((item) => item.code === child.executionCardCode)
    : undefined;
  if (!card) {
    showToast(`${line.name} 当前没有可操作的生产批次`);
    return false;
  }
  const requestKey = executionIntentKey('resume', card);
  executionBusyKey.value = card.code;
  try {
    const response = await resumeProductionExecutionCard(card.code, {
      revision: Number(card.revision || 0),
      reason,
      actor: line.leader || currentShift.leader,
      idempotencyKey: requestKey.key,
    });
    const persisted = upsertRuntimeExecutionFacts(response);
    executionIdempotencyKeys.delete(requestKey.intent);
    activityLogs.value.unshift(`刚刚 ${line.name} 恢复 ${persisted.code}：${reason}。`);
    showToast(`${persisted.code} 已恢复到 ${persisted.node}`);
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 恢复失败`);
    return false;
  } finally {
    executionBusyKey.value = '';
  }
}

async function reportLine(line: LineQueue) {
  if (guardWorkbenchWriteAction()) return false;
  const child = lineCurrentChild(line);
  if (!child || line.status !== '生产中') return false;
  const reporter = line.leader || currentShift.leader || '未指定负责人';
  if (!child.executionCardCode) {
    showToast(`${child.code} 尚未关联生产批次，请先确认安排`);
    return false;
  }
  const card = production2ExecutionCards.find((item) => item.code === child.executionCardCode);
  if (!card) {
    showToast(`生产批次 ${child.executionCardCode} 尚未加载，请刷新后重试`);
    return false;
  }
  const isWipReport = card.currentStageCode === 'P2-STEP-WIP-REPORT-LARGE-REEL' || card.node === '半成品报工';
  const requestKey = executionIntentKey('report', card);
  executionBusyKey.value = card.code;
  try {
    if (isWipReport) {
      const reelCode = reportDraft.reelCode.trim().toUpperCase();
      const netWeightKg = Number(reportDraft.netWeightKg || 0);
      if (!reelCode || netWeightKg <= 0) {
        showToast('请填写大盘编号和实际净重');
        return false;
      }
      const response = await reportProductionWipBatch(card.code, {
        revision: Number(card.revision || 0),
        reelCode,
        netWeightKg,
        equipment: reportDraft.equipment.trim(),
        actor: reporter,
        remark: `${currentShift.name} ${line.name} 大盘半成品报工`,
        idempotencyKey: requestKey.key,
      });
      const persisted = upsertRuntimeExecutionFacts(response);
      executionIdempotencyKeys.delete(requestKey.intent);
      line.lastReportAt = currentDateTimeText();
      line.lastReportCode = String(response.report?.code || persisted.code);
      line.lastReportQty = netWeightKg;
      line.lastReportUnit = 'kg';
      activityLogs.value.unshift(`${currentTimeLabel()} ${reporter}在${line.name}登记大盘 ${reelCode}，净重 ${formatQty(netWeightKg, 'kg')}。`);
      showToast(`${reelCode} 已登记，等待半成品质检 ${response.qualityTask?.code || ''}`.trim());
      return true;
    }

    const remainQty = Math.max(0, child.planQty - child.goodQty - child.defectQty);
    const goodQty = Math.min(Math.max(reportDraft.goodQty || 0, 0), remainQty);
    const defectQty = Math.min(Math.max(reportDraft.defectQty || 0, 0), Math.max(0, remainQty - goodQty));
    if (goodQty + defectQty <= 0) {
      showToast('请输入本次良品或不良数量');
      return false;
    }
    if (operationIsRewindFinishedReport.value && !reportDraft.sourceWipBatchCode) {
      showToast('请选择本次复绕使用的大盘');
      return false;
    }
    if (operationIsRewindFinishedReport.value && Number(reportDraft.consumedWeightKg || 0) <= 0) {
      showToast('请填写本次实际复绕用量（kg）');
      return false;
    }
    if (reportDraft.closeOperation && operationCanShortClose.value && reportDraft.shortCloseReason.trim().length < 4) {
      showToast('请填写至少 4 个字的提前结束原因');
      return false;
    }
    const response = await reportProductionExecutionCard(card.code, {
      revision: Number(card.revision || 0),
      goodQty,
      defectQty,
      actor: reporter,
      remark: `${currentShift.name} ${line.name} 现场报工`,
      sourceWipBatchCode: operationIsRewindFinishedReport.value ? reportDraft.sourceWipBatchCode : undefined,
      consumedWeightKg: operationIsRewindFinishedReport.value ? Number(reportDraft.consumedWeightKg || 0) : undefined,
      lossWeightKg: operationIsRewindFinishedReport.value ? Number(reportDraft.lossWeightKg || 0) : undefined,
      closeOperation: reportDraft.closeOperation && operationCanShortClose.value,
      shortCloseReason: reportDraft.closeOperation && operationCanShortClose.value ? reportDraft.shortCloseReason.trim() : undefined,
      idempotencyKey: requestKey.key,
    });
    const persisted = upsertRuntimeExecutionFacts(response);
    executionIdempotencyKeys.delete(requestKey.intent);
    const reportAt = currentDateTimeText();
    line.lastReportAt = reportAt;
    line.lastReportCode = String(response.report?.code || persisted.code);
    line.lastReportQty = goodQty + defectQty;
    line.lastReportUnit = child.unit;
    activityLogs.value.unshift(
      `${currentTimeLabel()} ${reporter}在${line.name}报工，良品 ${formatQty(goodQty, child.unit)}、不良 ${formatQty(defectQty, child.unit)}${response.wipBatch?.code ? `，来源大盘 ${response.wipBatch.code}` : ''}，写入 ${String(response.report?.code || '')}。`,
    );
    showToast(response.qualityTask?.code
      ? `${String(response.report?.code || '报工')} 已提交，等待报工全检 ${response.qualityTask.code}`
      : `${String(response.report?.code || '报工')} 已提交`);
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 报工失败，请重试`);
    return false;
  } finally {
    executionBusyKey.value = '';
  }
}

function upsertRuntimeException(exception: Production2Exception) {
  const index = runtimeProductionExceptions.value.findIndex((item) => item.code === exception.code);
  if (index >= 0) runtimeProductionExceptions.value.splice(index, 1, exception);
  else runtimeProductionExceptions.value.unshift(exception);
}

async function registerLineException(line: LineQueue) {
  if (guardWorkbenchWriteAction()) return false;
  const child = lineCurrentChild(line);
  const card = child?.executionCardCode
    ? production2ExecutionCards.find((item) => item.code === child.executionCardCode)
    : undefined;
  if (!card) {
    showToast(`${line.name} 当前没有可追溯的生产批次`);
    return false;
  }
  if (!exceptionDraft.reason.trim()) {
    showToast('请填写异常原因');
    return false;
  }
  const requestKey = executionIntentKey('exception', card);
  executionBusyKey.value = card.code;
  try {
    const response = await createProductionException({
      executionCardCode: card.code,
      revision: Number(card.revision || 0),
      type: exceptionDraft.type,
      reason: exceptionDraft.reason.trim(),
      outcome: exceptionDraft.result,
      level: exceptionDraft.result === '异常停机' ? '紧急' : '一般',
      responsibility: `${currentShift.name} / ${line.name}`,
      affectedQty: Math.max(0, Number(card.planQty || 0) - Number(card.reportedQty || 0)),
      actor: line.leader || currentShift.leader,
      idempotencyKey: requestKey.key,
    });
    upsertRuntimeException(response.record);
    if (response.executionCard) upsertRuntimeExecutionFacts({ record: response.executionCard });
    executionIdempotencyKeys.delete(requestKey.intent);
    activityLogs.value.unshift(`刚刚 ${line.name} 登记 ${response.record.code}：${exceptionDraft.reason}，现场结论 ${exceptionDraft.result}。`);
    showToast(`${response.record.code} 已登记${exceptionDraft.result === '异常停机' ? '并阻断当前批次' : '，当前批次继续生产'}`);
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 异常登记失败`);
    return false;
  } finally {
    executionBusyKey.value = '';
  }
}

function openLineException(line: LineQueue) {
  const child = lineCurrentChild(line);
  const card = child?.executionCardCode
    ? production2ExecutionCards.find((item) => item.code === child.executionCardCode)
    : undefined;
  if (!card) {
    router.push({ path: '/production/exceptions', query: { returnTo: '/production/workbench?tab=site' } });
    return;
  }
  const exception = runtimeProductionExceptions.value.find((item) => item.executionCardCode === card.code && item.status !== '已关闭');
  if (!exception) {
    router.push({ path: '/production/exceptions', query: { executionCard: card.code, returnTo: '/production/workbench?tab=site' } });
    return;
  }
  router.push({
    path: `/production/exceptions/${encodeURIComponent(exception.code)}`,
    query: { returnTo: '/production/workbench?tab=site' },
  });
}

function shiftIntentKey(action: 'handover' | 'receive', target: string, version = 0) {
  const intent = `${action}:${target}:${version}`;
  const existing = shiftIdempotencyKeys.get(intent);
  if (existing) return { intent, key: existing };
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `workbench-${action}:${target}:${random}`;
  shiftIdempotencyKeys.set(intent, key);
  return { intent, key };
}

async function confirmHandoverShift() {
  if (guardWorkbenchWriteAction()) return false;
  const activeCards = shiftHandoverExecutionCards.value
    .map((card) => ({ executionCardCode: card.code, revision: Number(card.revision || 0) }));
  const requestKey = shiftIntentKey('handover', currentShift.code, activeCards.reduce((sum, item) => sum + item.revision, 0));
  try {
    const response = await handoverProductionShift({
      shiftCode: currentShift.code,
      shiftName: currentShift.name,
      leader: currentShift.leader,
      members: [...currentShift.members],
      note: handoverDraft.note.trim() || '无',
      activeCards,
      reportSummary: { ...shiftReportSummary.value },
      exceptionCount: shiftExceptionCount.value,
      actor: currentShift.leader,
      idempotencyKey: requestKey.key,
    });
    runtimeShiftHandovers.value = [response.handover, ...runtimeShiftHandovers.value.filter((item) => item.code !== response.handover.code)];
    response.cards.forEach((card) => upsertRuntimeExecutionFacts({ record: card }));
    shiftIdempotencyKeys.delete(requestKey.intent);
    shiftStatus.value = '待交接';
    currentShift.endAt = response.handover.endedAt;
    currentShift.handoverNote = response.handover.note;
    activityLogs.value.unshift(`刚刚 ${currentShift.name}已交班，记录 ${response.handover.code}；${activeCards.length} 个运行时批次保持原节点等待接班。`);
    showToast(`${response.handover.code} 已交班，业务节点未改变`);
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${currentShift.name}交班失败`);
    return false;
  }
}

async function confirmReceiveShift() {
  if (guardWorkbenchWriteAction()) return false;
  const members = [...new Set([receiveDraft.leader, ...receiveDraft.members])].filter(Boolean);
  if (!receiveDraft.shiftName || !receiveDraft.leader || !members.length) {
    showToast('请选择班次、班长和班次人员');
    return false;
  }
  const pending = runtimeShiftHandovers.value.find((item) => item.status === '待接班');
  if (!pending) {
    showToast('没有待接班的运行时交班记录');
    return false;
  }
  const nextCode = nextShiftCode();
  const requestKey = shiftIntentKey('receive', pending.code, pending.revision);
  try {
    const response = await receiveProductionShift(pending.code, {
      version: pending.revision,
      shiftCode: nextCode,
      shiftName: receiveDraft.shiftName,
      leader: receiveDraft.leader,
      members,
      actor: receiveDraft.leader,
      idempotencyKey: requestKey.key,
    });
    runtimeShiftHandovers.value = [response.handover, ...runtimeShiftHandovers.value.filter((item) => item.code !== response.handover.code)];
    response.cards.forEach((card) => upsertRuntimeExecutionFacts({ record: card }));
    shiftIdempotencyKeys.delete(requestKey.intent);
    currentShift.code = nextCode;
    currentShift.name = receiveDraft.shiftName;
    currentShift.leader = receiveDraft.leader;
    currentShift.members = members;
    currentShift.startAt = response.handover.receivedAt || currentDateTimeText();
    currentShift.endAt = '';
    currentShift.handoverNote = '';
    shiftStatus.value = '值班中';
    activityLogs.value.unshift(`刚刚 ${currentShift.name}已接班，记录 ${response.handover.code}，班长 ${currentShift.leader}。`);
    showToast(`${response.handover.code} 已完成接班`);
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${receiveDraft.shiftName}接班失败`);
    return false;
  }
}

function advanceWip(lot: WipLot) {
  if (lot.stage === '待报工质检') {
    lot.stage = '待排包装';
    lot.quality = '合格';
    lot.location = '待排入包装线';
  } else if (lot.stage === '待打包') {
    lot.stage = '包装中';
    lot.location = '包装线';
  } else if (lot.stage === '包装中') {
    lot.stage = '待入库抽检';
    lot.location = '待抽检区';
    const line = lineRows.value.find((item) => item.currentChildCode === lot.code);
    if (line) {
      line.lastReportAt = currentDateTimeText();
      line.lastReportCode = lot.code;
      line.lastReportQty = lot.qty;
      line.lastReportUnit = lot.unit;
      delete line.queueNotes[lot.code];
      line.currentChildCode = '';
      line.leader = '';
      line.startedAt = '';
      line.status = line.queue.length ? '待开工' : '空闲';
    }
  } else if (lot.stage === '待入库抽检') {
    lot.stage = '待入库';
    lot.quality = '合格';
    lot.location = '待入库区';
  } else if (lot.stage === '待入库') {
    lot.stage = '已入库';
    lot.location = '成品仓';
    const child = childOrders.value.find((item) => item.code === lot.releaseCode);
    const master = child ? masterOrders.value.find((item) => item.code === child.masterCode) : undefined;
    const workOrder = master ? production2WorkOrders.find((item) => item.code === master.code) : undefined;
    const newlyInboundQty = Math.max(0, lot.qty - lot.inboundQty);
    if (workOrder && child) {
      workOrderSourceTaskCodesForWorkbench(workOrder).forEach((taskCode) => {
        const task = taskRows.value.find((item) => item.code === taskCode);
        const product = task?.products.find((item) => item.code === child.productCode);
        if (product) {
          product.inboundQty += workOrderTaskProjectedQtyForWorkbench(workOrder, taskCode, newlyInboundQty);
        }
      });
    }
    lot.inboundQty = lot.qty;
    if (child) {
      const childInboundQty = wipLots.value
        .filter((item) => item.releaseCode === child.code)
        .reduce((sum, item) => sum + item.inboundQty, 0);
      if (child.goodQty > 0 && childInboundQty >= child.goodQty) child.status = '已入库';
    }
    if (master && masterChildren(master.code).length && masterChildren(master.code).every((childOrder) => childOrder.status === '已入库')) {
      master.status = '已完成';
    }
  }
  showToast(`${lot.code} 已流转到${lot.stage}`);
}
</script>

<template>
  <section class="workbench-demo-page workbench-v2">
    <PageTopbarPortal>
      <template #actions>
        <div class="workbench-topbar-tabs" role="tablist" aria-label="生产工作台页签">
          <button type="button" role="tab" :aria-selected="activeTab === 'schedule'" :class="{ active: activeTab === 'schedule' }" @click="selectWorkbenchTab('schedule')">
            <ListChecks :size="15" />
            <span class="workbench-button-label">排产</span>
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'site'" :class="{ active: activeTab === 'site' }" @click="selectWorkbenchTab('site')">
            <RadioTower :size="15" />
            <span class="workbench-button-label">现场</span>
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'postprocess'" :class="{ active: activeTab === 'postprocess' }" @click="selectWorkbenchTab('postprocess')">
            <PackageCheck :size="15" />
            <span class="workbench-button-label">后段</span>
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'exceptions'" :class="{ active: activeTab === 'exceptions' }" @click="selectWorkbenchTab('exceptions')">
            <TriangleAlert :size="15" />
            <span class="workbench-button-label">异常</span>
          </button>
        </div>
      </template>
    </PageTopbarPortal>

    <ListLoadState
      v-if="workbenchRuntimeLoading && !workbenchHasSnapshot"
      loading
      title="生产工作台"
      loading-message="正在读取生产工单、批次、库存、质检、异常与交接班事实"
    />
    <ListLoadState
      v-else-if="workbenchRuntimeError && !workbenchHasSnapshot"
      :loading="false"
      title="生产工作台"
      :message="workbenchRuntimeError"
      @retry="refreshWorkbenchRuntimeFacts"
    />

    <template v-else>
      <section
        v-if="workbenchRuntimeLoading || workbenchRuntimeError"
        class="workbench-runtime-warning"
        role="status"
      >
        <div>
          <strong>{{ workbenchRuntimeLoading ? '正在刷新运行事实' : '当前显示上次成功快照' }}</strong>
          <span>
            上次成功更新 {{ workbenchLastLoadedAt || '-' }}；
            {{ workbenchRuntimeLoading ? '刷新完成前暂不可提交操作。' : `${workbenchRuntimeError}，重新连接前暂不可提交操作。` }}
          </span>
        </div>
        <button
          type="button"
          class="workbench-mini-button"
          :disabled="workbenchRuntimeLoading"
          @click="refreshWorkbenchRuntimeFacts"
        >
          <RefreshCw :size="14" />
          <span class="workbench-button-label">{{ workbenchRuntimeLoading ? '刷新中…' : '重试' }}</span>
        </button>
      </section>

    <section v-if="activeTab === 'site'" class="workbench-demo-panel shift-compact workbench-shift-top">
      <div class="shift-compact-line">
        <div class="shift-identity">
          <strong>{{ currentShift.code }}</strong>
          <small class="shift-line-meta">
            <em class="shift-status-pill" :class="{ handover: shiftStatus === '待交接' }">{{ shiftStatus }}</em>
            <span>班长 {{ currentShift.leader }}</span>
          </small>
        </div>
        <div class="shift-expanded">
          <span class="shift-fact">
            <small>班次</small>
            <strong>
              {{ currentShift.name }} · {{ currentShift.startAt }}
              <template v-if="currentShift.endAt"> 至 {{ currentShift.endAt }}</template>
            </strong>
          </span>
          <span class="shift-fact">
            <small>班次人员</small>
            <strong>{{ shiftMemberText }}</strong>
          </span>
          <span class="shift-fact">
            <small>本班异常</small>
            <strong>{{ shiftExceptionCount }} 条</strong>
          </span>
          <span v-if="currentShift.handoverNote" class="shift-handover-note" :title="currentShift.handoverNote">
            交接：{{ currentShift.handoverNote }}
          </span>
        </div>
        <div class="shift-actions">
          <button type="button" class="workbench-mini-button" @click="openOperation({ type: 'handoverRecords' })">
            <span class="workbench-button-label">交接记录</span>
          </button>
          <button v-if="shiftStatus === '值班中'" type="button" class="workbench-mini-button" :disabled="workbenchWriteActionsDisabled" :title="workbenchWriteDisabledReason || '交班'" @click="openOperation({ type: 'handoverShift' })">
            <span class="workbench-button-label">交班</span>
          </button>
          <button v-else type="button" class="workbench-mini-button dark" :disabled="workbenchWriteActionsDisabled" :title="workbenchWriteDisabledReason || '接班'" @click="openOperation({ type: 'receiveShift' })">
            <span class="workbench-button-label">接班</span>
          </button>
        </div>
      </div>
    </section>

    <div class="workbench-demo-overview workbench-v2-summary" :class="`summary-count-${summaryCards.length}`">
      <article v-for="card in summaryCards" :key="card.label">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </article>
    </div>

    <template v-if="activeTab === 'schedule'">
      <section class="workbench-production-schedule">
        <aside class="workbench-sidebar-list workbench-task-narrow schedule-pool">
          <div class="workbench-site-heading">
            <div class="workbench-panel-title">
              <ClipboardList :size="17" />
              <strong>排产工单池</strong>
            </div>
            <button type="button" class="workbench-mini-button" @click="router.push('/production/work-orders')">
              <span class="workbench-button-label">全部工单</span>
            </button>
          </div>
          <article
            v-for="item in schedulableItems"
            :key="item.key"
            class="schedule-pool-card"
            :class="{
              'is-focused': item.masterCode === selectedMasterCode || item.releaseCode === requestedReleaseCode,
              'is-blocked': item.kind === 'master' && item.qty <= 0,
            }"
          >
            <header>
              <div>
                <strong>{{ item.title }}</strong>
                <small>{{ item.subtitle }}</small>
              </div>
              <i>{{ workbenchStatusLabel(item.status) }}</i>
            </header>
            <p v-if="item.helper">{{ workbenchStatusLabel(item.helper) }}</p>
            <p v-if="item.blocker" class="schedule-release-note">{{ workbenchStatusLabel(item.blocker) }}</p>
            <dl :class="{ 'is-master': item.kind === 'master' }">
              <template v-if="item.kind === 'master'">
                <div><dt>计划数量</dt><dd>{{ formatQty(item.planQty || 0, item.unit) }}</dd></div>
                <div><dt>已安排</dt><dd>{{ formatQty(item.releasedQty || 0, item.unit) }}</dd></div>
                <div><dt>待安排</dt><dd>{{ formatQty(item.unreleasedQty || 0, item.unit) }}</dd></div>
                <div><dt>本次可排</dt><dd>{{ formatQty(item.qty, item.unit) }}</dd></div>
              </template>
              <div v-else><dt>待排数量</dt><dd>{{ formatQty(item.qty, item.unit) }}</dd></div>
              <div class="schedule-due-field">
                <dt>交期</dt>
                <dd>
                  <span>{{ item.dueDate }}</span>
                  <small v-if="item.dueRisk" class="schedule-due-risk" :class="`is-${item.dueRiskLevel}`">{{ item.dueRisk }}</small>
                </dd>
              </div>
              <div class="schedule-line-field"><dt>产线能力</dt><dd>{{ item.lineType }}</dd></div>
              <div class="schedule-recipe-field">
                <dt>配方</dt>
                <dd :title="item.recipeCode">{{ item.recipeCode }}</dd>
              </div>
              <div class="schedule-process-field">
                <dt>工艺</dt>
                <dd :title="`${item.processCode} · ${item.routeType}`">
                  <span>{{ item.processCode }}</span>
                  <small>{{ item.routeType }}</small>
                </dd>
              </div>
            </dl>
            <button type="button" class="schedule-detail-button" @click="openSchedulableDetail(item)">
              <span class="workbench-button-label">{{ item.kind === 'master' ? '工单详情' : '批次详情' }}</span>
              <ArrowRight :size="14" />
            </button>
          </article>
          <p v-if="!schedulableItems.length" class="empty-note">暂无待安排工单。</p>
        </aside>

        <section class="schedule-line-board">
          <section class="workbench-demo-panel">
            <div class="workbench-site-heading">
              <div class="workbench-panel-title">
                <Factory :size="17" />
                <strong>产线队列</strong>
              </div>
            </div>

            <div class="schedule-line-list">
              <template v-for="(line, lineIndex) in lineRows" :key="line.name">
                <div
                  v-if="!line.schedulable && (lineIndex === 0 || lineRows[lineIndex - 1]?.schedulable)"
                  class="schedule-line-section"
                >
                  <strong>历史任务承接</strong>
                  <span>只完成既有任务，不参与新排产</span>
                </div>
                <article
                class="schedule-line-card"
                :class="{
                  'is-empty': !lineCurrentChild(line)
                    && !lineCurrentLot(line)
                    && !lineQueueItems(line).length
                    && !lineWaitingMaterialItems(line).length
                    && !queueOptionsForLine(line).length
                    && queueDraft.lineName !== line.name,
                  'is-available': !lineHasScheduledWork(line)
                    && !lineWaitingMaterialItems(line).length
                    && queueOptionsForLine(line).length
                    && queueDraft.lineName !== line.name,
                }"
              >
                <header>
                  <div>
                    <strong>{{ line.name }}</strong>
                    <small>
                      {{ lineReferenceSummary(line) }}<template v-if="line.leader"> · {{ line.leader }}</template><template v-else-if="lineHasScheduledWork(line)"> · 未指定负责人</template>
                    </small>
                  </div>
                  <span class="schedule-line-statuses">
                    <i>{{ lineDisplayStatus(line) }}</i>
                    <em v-if="!line.schedulable">历史承接</em>
                    <em v-if="lineWaitingMaterialItems(line).length">待领料 {{ lineWaitingMaterialItems(line).length }}</em>
                  </span>
                </header>

                <dl v-if="lineCurrentChild(line) || lineCurrentLot(line)" class="line-meta">
                  <div><dt>当前批次/成品</dt><dd :title="lineCurrentTitle(line)">{{ lineCurrentTitle(line) }}</dd></div>
                  <div><dt>数量进度</dt><dd :title="lineCurrentQuantityText(line)">{{ lineCurrentQuantityText(line) }}</dd></div>
                  <div class="line-report-meta"><dt>上次报工</dt><dd>{{ lineLastReportText(line) }}</dd></div>
                </dl>
                <p v-if="lineCurrentNote(line)" class="schedule-current-note">{{ lineCurrentNote(line) }}</p>

                <section v-if="lineWaitingMaterialItems(line).length" class="schedule-material-list">
                  <header>
                    <strong>已安排 · 待领料</strong>
                    <span>{{ lineWaitingMaterialItems(line).length }} 项</span>
                  </header>
                  <article v-for="child in lineWaitingMaterialItems(line)" :key="child.code">
                    <span>
                      <strong>{{ child.executionCardCode || child.masterCode }}</strong>
                      <small>{{ child.productName }} · {{ child.executionCardCode ? `工单 ${child.masterCode}` : '生产批次待生成' }}</small>
                    </span>
                    <b>{{ formatQty(child.planQty, child.unit) }}</b>
                    <span class="workbench-handoff-status">等待仓库领料</span>
                  </article>
                </section>

                <div
                  v-if="!lineHasScheduledWork(line) && queueOptionsForLine(line).length && queueDraft.lineName !== line.name"
                  class="schedule-line-available"
                >
                  <span>可安排 {{ queueOptionsForLine(line).length }} 个工单</span>
                  <button type="button" class="workbench-mini-button" :disabled="workbenchWriteActionsDisabled" :title="workbenchWriteDisabledReason || '安排工单'" @click="openQueueDraft(line)">
                    <Plus :size="14" />
                    <span class="workbench-button-label">安排工单</span>
                  </button>
                </div>
                <div v-if="lineHasScheduledWork(line) || queueDraft.lineName === line.name" class="schedule-queue-list">
                  <div class="schedule-queue-title">
                    <strong>待开工队列</strong>
                    <span>{{ lineQueueItems(line).length ? `${lineQueueItems(line).length} 项` : '暂无' }}</span>
                  </div>
                  <div v-if="lineQueueItems(line).length" class="schedule-queue-head">
                    <span>序</span>
                    <span>排产对象</span>
                    <span>数量</span>
                    <span>{{ workbenchPrototypeCommandsAvailable ? '动作' : '状态' }}</span>
                  </div>
                  <div v-for="(item, index) in lineQueueItems(line)" :key="item.code" class="schedule-queue-row">
                    <span class="schedule-queue-index">{{ index + 1 }}</span>
                    <strong class="schedule-queue-object">{{ item.title }}<small>{{ item.kind }} · {{ item.subtitle }} · {{ workbenchStatusLabel(item.status) }}</small></strong>
                    <span class="schedule-queue-qty">{{ formatQty(item.qty, item.unit) }}</span>
                    <button v-if="workbenchPrototypeCommandsAvailable" type="button" class="workbench-mini-button" :disabled="index === 0" @click="moveQueueItemUp(line, index)">
                      <ArrowUp :size="14" />
                      <span class="workbench-button-label">上移</span>
                    </button>
                    <span v-else class="schedule-order-locked">{{ item.kind === '工序任务' ? '自动排入' : '已锁定' }}</span>
                    <p v-if="item.note" class="schedule-queue-note">{{ item.note }}</p>
                  </div>

                  <section v-if="queueDraft.lineName === line.name" class="schedule-release-form">
                    <div class="schedule-release-fields">
                      <label class="schedule-release-source">
                        <span>生产工单</span>
                        <select v-model="queueDraft.sourceKey" aria-label="生产工单">
                          <option v-for="item in queueOptionsForLine(line)" :key="item.key" :value="item.key">
                            {{ item.title }} · {{ item.subtitle }} · 可安排 {{ formatQty(item.qty, item.unit) }}
                          </option>
                        </select>
                      </label>
                      <label>
                        <span>本次安排</span>
                        <span class="schedule-release-quantity" :class="{ 'is-invalid': queueDraftValidationMessage }">
                          <input v-model.number="queueDraft.qty" type="number" min="1" :max="selectedQueueDraftItem()?.qty || 1" :aria-invalid="Boolean(queueDraftValidationMessage)" aria-label="本次安排" />
                          <em>{{ selectedQueueDraftItem()?.unit || '-' }}</em>
                        </span>
                      </label>
                      <label class="schedule-release-note-field">
                        <span>排产备注（可选）</span>
                        <input v-model="queueDraft.note" type="text" placeholder="如换色顺序、交付优先级" />
                      </label>
                    </div>
                    <div class="schedule-release-footer">
                      <p :class="{ 'is-error': queueDraftValidationMessage }">{{ queueDraftValidationMessage || '确认后生成生产安排；仓库确认领料出库后进入待开工队列。' }}</p>
                      <span>
                        <button type="button" class="workbench-mini-button" @click="closeQueueDraft">
                          <span class="workbench-button-label">取消</span>
                        </button>
                        <button type="button" class="workbench-mini-button dark" :disabled="workbenchWriteActionsDisabled || Boolean(queueDraftValidationMessage) || Boolean(releaseBusyKey)" :title="workbenchWriteDisabledReason || queueDraftValidationMessage || '确认安排'" @click="confirmQueueDraft(line)">
                          <span class="workbench-button-label">{{ releaseBusyKey ? '安排中…' : '确认安排' }}</span>
                        </button>
                      </span>
                    </div>
                  </section>
                  <button
                    v-else-if="queueOptionsForLine(line).length"
                    type="button"
                    class="schedule-add-button"
                    title="选择可安排工单并加入该产线"
                    :disabled="workbenchWriteActionsDisabled"
                    @click="openQueueDraft(line)"
                  >
                    <Plus :size="15" />
                    <span class="workbench-button-label">安排工单</span>
                  </button>
                </div>
                </article>
              </template>
            </div>
          </section>
        </section>
      </section>
    </template>

    <template v-else-if="activeTab === 'site'">
      <section class="workbench-site-v2">
        <section class="workbench-site-left">
          <section class="workbench-demo-panel">
            <div class="workbench-site-heading">
              <div class="workbench-panel-title">
                <Factory :size="17" />
                <strong>产线</strong>
              </div>
              <div class="workbench-site-actions">
                <button type="button" class="workbench-mini-button" @click="openOperation({ type: 'reportRecords' })">
                  <span class="workbench-button-label">报工记录</span>
                </button>
              </div>
            </div>

            <div class="workbench-line-switcher" role="list" aria-label="选择产线">
              <button
                v-for="line in siteLineRows"
                :key="line.name"
                type="button"
                class="workbench-line-switch"
                :class="{ active: selectedLineName === line.name }"
                @click="selectedLineName = line.name"
              >
                <span class="workbench-line-switch-main">
                  <strong>{{ line.name }}</strong>
                  <small>
                    {{ line.type }}<template v-if="line.leader"> · {{ line.leader }}</template><template v-else-if="lineHasScheduledWork(line)"> · 未指定负责人</template>
                  </small>
                  <em v-if="lineHasScheduledWork(line)">{{ lineCurrentProcessName(line) }}</em>
                </span>
                <span class="workbench-line-switch-state">
                  <i>{{ lineDisplayStatus(line) }}</i>
                  <small v-if="line.queue.length">队列 {{ line.queue.length }}</small>
                </span>
                <ArrowRight :size="15" aria-hidden="true" />
              </button>
            </div>

            <div v-if="selectedLine?.status === '异常停机'" class="line-actions compact workbench-line-exception-action">
              <button type="button" class="workbench-mini-button dark" @click="openLineException(selectedLine)">
                <span class="workbench-button-label">查看当前产线异常</span>
              </button>
                </div>
          </section>
        </section>

        <aside
          class="workbench-site-right site-next-panel"
          :class="{ 'is-single-panel': !selectedLineCurrentChild && !selectedLineCurrentLot && !selectedLineQueuedOperationJob }"
        >
          <section class="workbench-demo-panel workbench-todo-panel">
            <div class="workbench-panel-title">
              <ClipboardCheck :size="17" />
              <strong>{{ selectedLine?.name }} · {{ selectedLine && lineHasScheduledWork(selectedLine) ? '现场执行' : '产线状态' }}</strong>
            </div>

            <article v-if="selectedLine && lineHasScheduledWork(selectedLine)" class="site-next-summary">
              <div class="site-next-status-grid">
                <span>
                  <small>设备状态</small>
                  <i>{{ selectedLineStep?.statusText || lineDisplayStatus(selectedLine) }}</i>
                </span>
                <span>
                  <small>当前阶段</small>
                  <i>{{ selectedLineCurrentProcess?.name || (selectedLine.queue.length ? '待接入队首' : '待排产') }}</i>
                </span>
              </div>
              <div class="site-next-target">
                <small>{{ selectedLine.type }} · {{ selectedLine.leader || '未填写负责人' }} · {{ selectedLineCurrentProcess?.executionMode || '无当前动作' }}</small>
                <strong v-if="selectedLineCurrentChild">{{ childProductionBatchCode(selectedLineCurrentChild) }}</strong>
                <strong v-else-if="selectedLineCurrentLot">{{ selectedLineCurrentLot.code }}</strong>
                <strong v-else-if="selectedLineQueuedOperationJob">{{ selectedLineQueuedOperationJob.productionBatchCode }}</strong>
                <strong v-else>队列已有任务</strong>
                <p v-if="selectedLineCurrentChild">{{ selectedLineCurrentChild.productName }} · {{ lineCurrentProgressSummary(selectedLine) }}</p>
                <p v-else-if="selectedLineCurrentLot">{{ selectedLineCurrentLot.productName }} · {{ selectedLineCurrentLot.stage }} · {{ selectedLineCurrentLot.location }}</p>
                <p v-else-if="selectedLineQueuedOperationJob">
                  {{ selectedLineQueuedOperationJob.sourceWipBatchCode
                    ? `来源大盘 ${selectedLineQueuedOperationJob.sourceWipBatchCode}`
                    : selectedLineQueuedOperationJob.supplementForShortClose ? '剩余补产任务' : '设备作业' }}
                  · 可处理 {{ formatQty(selectedLineQueuedOperationJob.plannedQty, selectedLineQueuedOperationJob.plannedUnit) }}
                </p>
                <p v-else>队列 {{ selectedLine.queue.length }} 单，先接入队首再按工序推进。</p>
              </div>
              <template v-if="selectedLineStep?.primaryAction !== 'none'">
                <div class="site-next-action-title">
                  <span>当前待办</span>
                  <strong>{{ selectedLineStep?.actionLabel }}</strong>
                </div>
                <p class="site-next-description">{{ selectedLineStep?.description }}</p>
                <p v-if="selectedLineStep?.disabledReason && selectedLineStep.primaryAction !== 'wait'" class="site-next-block-reason">{{ selectedLineStep.disabledReason }}</p>
              </template>
            </article>
            <div v-else-if="selectedLine" class="site-idle-state">
              <p>产线空闲，暂无待开工任务。</p>
            </div>

            <div v-if="selectedLine" class="site-next-buttons">
              <button
                v-if="!lineHasScheduledWork(selectedLine)"
                type="button"
                class="workbench-mini-button dark"
                @click="selectWorkbenchTab('schedule')"
              >
                <span class="workbench-button-label">去排产</span>
                <ArrowRight :size="14" />
              </button>
              <button
                v-if="selectedLineStep?.primaryAction !== 'none' && selectedLineStep?.primaryAction !== 'wait'"
                type="button"
                class="workbench-mini-button"
                :class="{ dark: canRunPrimaryAction(selectedLineStep) }"
                :disabled="!canRunPrimaryAction(selectedLineStep)"
                @click="runLinePrimaryAction(selectedLine)"
              >
                <span class="workbench-button-label">{{ selectedLineStep?.actionLabel || '暂无动作' }}</span>
                <ArrowRight :size="14" />
              </button>
              <button
                v-if="lineHasScheduledWork(selectedLine) && selectedLineStep?.primaryAction !== 'detail' && (selectedLineCurrentChild || selectedLineCurrentLot || selectedLineQueuedOperationJob)"
                type="button"
                class="workbench-mini-button"
                @click="openLineExecutionDetail(selectedLine)"
              >
                <span class="workbench-button-label">批次详情</span>
              </button>

              <button
                v-if="workbenchPrototypeCommandsAvailable && selectedLine.currentChildCode && selectedLine.status !== '异常停机' && shiftStatus === '值班中' && selectedLine.leader"
                type="button"
                class="workbench-mini-button"
                @click="openOperation({ type: 'leader', lineName: selectedLine.name })"
              >
                <span class="workbench-button-label">更换负责人</span>
              </button>
              <button
                v-if="selectedLine.status === '生产中'"
                type="button"
                class="workbench-mini-button"
                :disabled="workbenchWriteActionsDisabled || shiftStatus !== '值班中' || !selectedLine.leader"
                :title="workbenchWriteDisabledReason || '暂停当前生产批次'"
                @click="openOperation({ type: 'pause', lineName: selectedLine.name })"
              >
                <Pause :size="14" />
                <span class="workbench-button-label">暂停</span>
              </button>
              <button
                v-if="selectedLine.currentChildCode && selectedLine.status !== '异常停机'"
                type="button"
                class="workbench-mini-button"
                :disabled="workbenchWriteActionsDisabled || shiftStatus !== '值班中' || !!(selectedLine.currentChildCode && !selectedLine.leader)"
                :title="workbenchWriteDisabledReason || (shiftStatus !== '值班中' ? '完成接班后才能报告异常' : !selectedLine.leader ? '先为当前批次设置负责人' : '为当前生产批次报告异常')"
                @click="openOperation({ type: 'exception', lineName: selectedLine.name })"
              >
                <span class="workbench-button-label">报告异常</span>
              </button>
            </div>
          </section>

          <section v-if="selectedLineCurrentChild || selectedLineCurrentLot || selectedLineQueuedOperationJob" class="workbench-demo-panel site-process-panel">
            <details class="site-process-disclosure">
              <summary>
                <span>
                  <ListChecks :size="17" />
                  <strong>工艺进度</strong>
                  <small>{{ selectedLineProgressSummary }}</small>
                </span>
                <em>
                  <span class="site-process-expand-label">查看完整路线</span>
                  <span class="site-process-collapse-label">收起路线</span>
                </em>
              </summary>
              <div class="site-process-timeline">
                <article
                  v-for="step in selectedLineProgressSteps"
                  :key="step.code"
                  class="site-process-step"
                  :class="step.stateClass"
                >
                  <em>{{ step.sequence }}</em>
                  <div>
                    <strong>{{ step.name }}</strong>
                    <small>{{ step.meta }}</small>
                    <p v-if="step.actionText">{{ step.actionText }}</p>
                    <small v-if="step.helperText" class="site-process-helper">{{ step.helperText }}</small>
                  </div>
                  <i>{{ step.state }}</i>
                </article>
              </div>
            </details>
          </section>

          <section v-if="selectedLineCurrentChild || selectedLineCurrentLot || selectedLineQueuedOperationJob" class="workbench-demo-panel side-list">
            <div class="workbench-panel-title">
              <RefreshCw :size="17" />
              <strong>执行依据</strong>
            </div>
            <div class="site-side-detail">
              <span v-for="row in selectedLineInfoRows" :key="row.label">
                {{ row.label }} <strong>{{ row.value }}</strong>
              </span>
            </div>
            <ol v-if="selectedLineCurrentLot" class="workbench-activity-list">
              <li>{{ selectedLineCurrentLot.code }} · {{ selectedLineCurrentLot.stage }} · {{ formatQty(selectedLineCurrentLot.qty, selectedLineCurrentLot.unit) }}</li>
            </ol>
            <ol v-else-if="selectedLineRelatedLots.length" class="workbench-activity-list">
              <li v-for="lot in selectedLineRelatedLots" :key="lot.code">{{ lot.code }} · {{ lot.stage }} · {{ formatQty(lot.qty, lot.unit) }}</li>
            </ol>
          </section>
        </aside>
      </section>
    </template>

    <template v-else-if="activeTab === 'postprocess'">
      <section class="workbench-demo-panel workbench-postprocess-panel">
        <div class="workbench-site-heading">
          <div class="workbench-panel-title">
            <PackageCheck :size="17" />
            <strong>后段待办</strong>
          </div>
          <div class="workbench-site-actions">
            <button type="button" class="workbench-mini-button" @click="router.push({ path: '/production/execution-cards', query: { returnTo: '/production/workbench?tab=postprocess' } })">
              <span class="workbench-button-label">全部生产批次</span>
            </button>
          </div>
        </div>

        <div v-if="!postprocessGroups.length" class="workbench-empty-line">当前没有提前结束待处理、待质检、待包装或待入库的生产批次。</div>
        <div v-else class="workbench-postprocess-board">
          <section v-for="group in postprocessGroups" :key="group.stage" class="postprocess-stage-column">
            <header>
              <strong>{{ workbenchStatusLabel(group.stage) }}</strong>
              <em>{{ group.rows.length }}</em>
            </header>
            <article v-for="row in group.rows" :key="row.code" class="postprocess-batch-card" :class="{ 'is-abnormal': ['质量待处置', '异常待处理'].includes(row.stage), 'is-short-close': row.stage === '短关待处理' }">
              <div class="postprocess-batch-head">
                <strong>{{ row.code }}</strong>
              </div>
              <strong class="postprocess-product">{{ row.productName }}</strong>
              <small>{{ row.workOrderCode }} · {{ row.routeType }} · {{ row.sourceLine }}</small>
              <p class="postprocess-current-gap">{{ row.helper }}</p>
              <dl>
                <div v-for="metric in postprocessMetricRows(row)" :key="metric.label">
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ formatQty(metric.value, metric.unit || row.unit) }}</dd>
                </div>
              </dl>
              <div class="postprocess-batch-actions">
                <button v-if="row.actionable" type="button" class="workbench-mini-button dark" @click="openPostprocessAction(row)">
                  <span class="workbench-button-label">{{ row.actionLabel }}</span>
                  <ArrowRight :size="14" />
                </button>
                <span v-else class="workbench-handoff-status">{{ row.actionLabel }}</span>
                <button type="button" class="workbench-mini-button" @click="openPostprocessDetail(row)">
                  <span class="workbench-button-label">批次详情</span>
                </button>
              </div>
            </article>
          </section>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="workbench-exception-shell">
        <section class="workbench-demo-panel workbench-exception-main">
          <div class="workbench-site-heading">
            <div class="workbench-panel-title">
              <TriangleAlert :size="17" />
              <strong>未关闭异常</strong>
            </div>
            <button type="button" class="workbench-mini-button" @click="router.push({ path: '/production/exceptions', query: { returnTo: '/production/workbench?tab=exceptions' } })">
              <span class="workbench-button-label">全部异常</span>
            </button>
          </div>
          <div v-if="!openExceptionRows.length" class="workbench-empty-line">当前没有未关闭异常。</div>
          <div v-else class="workbench-exception-list">
            <button
              v-for="item in openExceptionRows"
              :key="item.code"
              type="button"
              class="workbench-exception-row"
              :class="{ 'is-urgent': item.level === '紧急' }"
              @click="router.push({ path: `/production/exceptions/${encodeURIComponent(item.code)}`, query: { returnTo: '/production/workbench?tab=exceptions' } })"
            >
              <span>
                <strong>{{ item.code }}</strong>
                <small>{{ item.type }} · {{ item.level }} · {{ item.createdAt }}</small>
              </span>
              <span>
                <strong>{{ item.source }}</strong>
                <small>{{ item.relatedWorkOrder || '未关联工单' }} · {{ item.line || '未指定产线' }}</small>
              </span>
              <span>
                <strong>{{ workbenchStatusLabel(item.effect) }}</strong>
                <small>{{ workbenchStatusLabel(item.nextAction) }}</small>
              </span>
              <span class="workbench-exception-row-state">
                <i>{{ workbenchStatusLabel(item.status) }}</i>
                <ArrowRight :size="15" />
              </span>
            </button>
          </div>
        </section>

        <aside class="workbench-demo-panel workbench-release-audit">
          <div class="workbench-panel-title">
            <ListChecks :size="17" />
            <strong>受影响对象</strong>
          </div>
          <div v-if="!affectedExecutionRows.length" class="workbench-empty-line">当前没有可下钻的受影响任务、工单或生产批次。</div>
          <button
            v-for="item in affectedExecutionRows"
            :key="item.code"
            type="button"
            class="workbench-release-audit-row"
            @click="router.push({ path: item.route, query: { returnTo: '/production/workbench?tab=exceptions' } })"
          >
            <span>
              <strong>{{ item.code }}</strong>
              <small>{{ item.meta }}</small>
              <small>{{ item.relation }}</small>
            </span>
            <span class="workbench-release-audit-state">
              <i>{{ workbenchStatusLabel(item.status) }}</i>
              <ArrowRight :size="14" />
            </span>
            <p>{{ workbenchStatusLabel(item.nextAction) }}</p>
          </button>
        </aside>
      </section>
    </template>

    <div v-if="operationPanel && !['reportRecords', 'handoverRecords'].includes(operationPanel.type)" class="workbench-operation-backdrop" @click.self="closeOperation">
      <section class="workbench-operation-drawer" role="dialog" aria-modal="true" aria-labelledby="workbench-operation-title">
        <header>
          <div>
            <span>工作台操作</span>
            <h2 id="workbench-operation-title">{{ operationTitle }}</h2>
          </div>
          <button type="button" aria-label="关闭操作面板" @click="closeOperation">×</button>
        </header>

          <div class="workbench-operation-body">
          <article v-if="operationMaster" class="operation-target-card">
            <strong>{{ operationMaster.code }}</strong>
            <span>{{ operationMaster.productName }} · {{ formatQty(operationMaster.planQty, operationMaster.unit) }}</span>
            <span>{{ operationMaster.recipe }} · {{ operationMaster.process }}</span>
          </article>

          <article v-if="operationChild" class="operation-target-card">
            <strong>{{ childProductionBatchCode(operationChild) }}</strong>
            <span>{{ operationChild.productName }} · {{ formatQty(operationChild.planQty, operationChild.unit) }}</span>
            <span v-if="operationPanel.type === 'report' && operationIsWipReport">{{ operationChild.masterCode }} · 大盘半成品按实际净重 kg 登记 · {{ operationChild.line || '未排产' }}</span>
            <span v-else>{{ operationChild.masterCode }} · 良品/不良/剩余 {{ childReportedText(operationChild) }} · {{ operationChild.line || '未排产' }}</span>
          </article>

          <article v-if="operationLine" class="operation-target-card">
            <strong>{{ operationLine.name }}</strong>
            <span>{{ operationLine.type }} · {{ lineDisplayStatus(operationLine) }}</span>
            <span>生产批次 {{ lineCurrentWorkCode(operationLine) }} · 队列 {{ operationLine.queue.length }} 单</span>
            <span v-if="operationExecutionCard">
              {{ operationExecutionCard.productName }} · {{ operationExecutionCard.workOrderCode }} ·
              {{ operationIsRewindStart || operationIsRewindFinishedReport ? '成品计划' : '计划' }} {{ formatQty(operationExecutionCard.planQty, operationExecutionCard.unit) }} ·
              已报工 {{ formatQty(operationExecutionCard.reportedQty, operationExecutionCard.unit) }}
            </span>
            <span v-if="operationPanel.type === 'start' && operationIsRewindStart && operationStartJobRow?.job.sourceWipBatchCode">
              来源大盘 {{ operationStartJobRow.job.sourceWipBatchCode }} · 本次处理 {{ formatQty(operationStartJobRow.job.plannedQty, operationStartJobRow.job.plannedUnit) }}
            </span>
          </article>

          <article v-if="operationLot" class="operation-target-card">
            <strong>{{ operationLot.code }}</strong>
            <span>{{ operationLot.productName }} · {{ formatQty(operationLot.qty, operationLot.unit) }}</span>
            <span>{{ operationLot.stage }} · {{ operationLot.quality }} · {{ operationLot.location }}</span>
          </article>

          <div v-if="operationPanel.type === 'split'" class="workbench-form-grid compact">
            <label>
              安排数量
              <input v-model.number="childDraft.qty" type="number" min="1" />
            </label>
            <label>
              工单可安排数量
              <input :value="operationMaster ? formatQty(masterReleasableQty(operationMaster), operationMaster.unit) : '-'" readonly />
            </label>
          </div>

          <div v-if="operationPanel.type === 'dispatch'" class="workbench-form-grid compact">
            <label>
              生产产线
              <select v-model="dispatchDraft.lineName">
                <option v-for="line in lineRows" :key="line.name" :value="line.name">
                  {{ line.name }} · {{ line.type }} · 队列 {{ line.queue.length }}
                </option>
              </select>
            </label>
            <label>
              队列位置
              <input value="追加到队列末尾" readonly />
            </label>
          </div>

          <div v-if="operationPanel.type === 'start' || operationPanel.type === 'leader'" class="workbench-form-grid compact operation-leader-grid">
            <label>
              现场负责人
              <select v-model="startDraft.leader">
                <option v-for="member in shiftMembers" :key="member" :value="member">
                  {{ member }}
                </option>
              </select>
            </label>
          </div>

          <label v-if="operationPanel.type === 'pause' || operationPanel.type === 'resume'" class="shift-note-field">
            {{ operationPanel.type === 'pause' ? '暂停原因' : '恢复说明' }}
            <textarea
              v-model="executionStateDraft.reason"
              rows="4"
              :placeholder="operationPanel.type === 'pause' ? '填写设备、物料或现场原因' : '填写原因排除情况和现场复核结果'"
            ></textarea>
          </label>

          <div
            v-if="operationPanel.type === 'report'"
            class="workbench-form-grid compact"
            :class="{ 'rewind-report-grid': operationIsRewindFinishedReport }"
          >
            <label v-if="operationIsWipReport">
              大盘编号
              <input v-model="reportDraft.reelCode" type="text" />
            </label>
            <label v-if="operationIsWipReport">
              实际净重（kg）
              <input v-model.number="reportDraft.netWeightKg" type="number" min="0" step="0.01" />
            </label>
            <label v-if="operationIsWipReport">
              生产产线
              <input v-model="reportDraft.equipment" type="text" readonly />
            </label>
            <label v-if="operationIsRewindFinishedReport">
              来源大盘
              <select v-model="reportDraft.sourceWipBatchCode">
                <option value="" disabled>选择已放行大盘</option>
                <option v-for="batch in operationAvailableWipBatches" :key="batch.code" :value="batch.code">
                  {{ batch.code }} · 可用 {{ formatQty(batch.availableWeightKg, 'kg') }}
                </option>
              </select>
            </label>
            <label v-if="!operationIsWipReport">
              {{ operationIsRewindFinishedReport ? `成品良品（${operationExecutionCard?.unit || '卷'}）` : '良品数量' }}
              <input v-model.number="reportDraft.goodQty" type="number" min="0" :step="operationIsRewindFinishedReport ? 1 : 'any'" />
            </label>
            <label v-if="!operationIsWipReport">
              {{ operationIsRewindFinishedReport ? `成品不良（${operationExecutionCard?.unit || '卷'}）` : '不良数量' }}
              <input v-model.number="reportDraft.defectQty" type="number" min="0" :step="operationIsRewindFinishedReport ? 1 : 'any'" />
            </label>
            <label v-if="operationIsRewindFinishedReport">
              实际复绕用量（kg）
              <input
                v-model.number="reportDraft.consumedWeightKg"
                type="number"
                min="0"
                :max="operationRewindSourceBatch?.availableWeightKg || undefined"
                step="0.001"
              />
            </label>
            <label v-if="operationIsRewindFinishedReport">
              本次损耗（kg）
              <input
                v-model.number="reportDraft.lossWeightKg"
                type="number"
                min="0"
                :max="operationRewindSourceBatch?.availableWeightKg || undefined"
                step="0.001"
              />
            </label>
          </div>

          <div v-if="operationPanel.type === 'report' && operationIsRewindFinishedReport" class="operation-report-outcome operation-rewind-weight-balance">
            <span>配方标准净重 <strong>{{ formatQty(operationProductUnitNetWeightKg, 'kg/卷') }}</strong></span>
            <span>本次数量建议用量 <strong>{{ formatQty(operationSuggestedRewindConsumptionKg, 'kg') }}</strong></span>
            <span>报工后大盘结余 <strong>{{ formatQty(operationProjectedWipRemainingKg, 'kg') }}</strong></span>
          </div>

          <div v-if="operationPanel.type === 'report' && !operationIsWipReport" class="operation-report-outcome">
            <span>本次后剩余 <strong>{{ formatQty(operationReportProjectedRemainingQty, operationExecutionCard?.unit || '件') }}</strong></span>
            <span v-if="operationReportAutoCompletes" class="is-complete">提交后自动结束设备作业</span>
            <label v-else-if="operationCanShortClose" class="operation-short-close-toggle">
              <input v-model="reportDraft.closeOperation" type="checkbox" />
              本次报工后提前结束设备作业
            </label>
          </div>

          <label v-if="operationPanel.type === 'report' && reportDraft.closeOperation && operationCanShortClose" class="shift-note-field operation-short-close-reason">
            提前结束原因
            <textarea v-model="reportDraft.shortCloseReason" rows="3" placeholder="说明未达计划仍结束设备作业的原因"></textarea>
          </label>

          <div v-if="operationPanel.type === 'exception'" class="workbench-form-grid compact">
            <label>
              异常类型
              <select v-model="exceptionDraft.type">
                <option value="设备异常">设备异常</option>
                <option value="工艺异常">工艺异常</option>
                <option value="报工差异">报工差异</option>
                <option value="缺料">缺料</option>
                <option value="其他异常">其他异常</option>
              </select>
            </label>
            <label>
              异常原因
              <textarea v-model="exceptionDraft.reason" placeholder="说明异常现象、影响范围和已采取措施"></textarea>
            </label>
            <label>
              生产影响
              <select v-model="exceptionDraft.result">
                <option value="继续生产">继续生产（不阻断）</option>
                <option value="异常停机">停机处理（阻断）</option>
              </select>
            </label>
          </div>

          <section v-if="operationPanel.type === 'handoverShift'" class="shift-handover-panel">
            <div class="shift-workbench-handover-summary">
              <span>班次 <strong>{{ currentShift.name }}</strong></span>
              <span>班长 <strong>{{ currentShift.leader }}</strong></span>
              <span>开始时间 <strong>{{ currentShift.startAt }}</strong></span>
              <span>结束时间 <strong>确认交班时记录</strong></span>
              <span>报工记录 <strong>{{ shiftReportSummary.count }} 单</strong></span>
              <span>良品合计 <strong>{{ shiftReportTotalText('good') }}</strong></span>
              <span>不良合计 <strong>{{ shiftReportTotalText('defect') }}</strong></span>
              <span>本班次异常 <strong>{{ shiftExceptionCount }} 条</strong></span>
              <span>未完成现场事项 <strong>{{ shiftHandoverItems.length }} 项</strong></span>
            </div>
            <div v-if="shiftHandoverItems.length" class="shift-handover-item-list">
              <strong class="shift-handover-item-title">下个班次需承接</strong>
              <article v-for="item in shiftHandoverItems" :key="item.key">
                <strong>{{ item.line }} · {{ item.executionCardCode }}</strong>
                <span>{{ item.kind }} · {{ item.stage }} · {{ item.productName }}</span>
                <p>{{ item.nextAction }}</p>
              </article>
            </div>
            <p v-else class="workbench-empty-line">暂无需要下一班承接的现场事项。</p>
            <div v-if="shiftReportRows.length" class="shift-report-table">
              <div>
                <span>产线</span>
                <span>报工单</span>
                <span>成品</span>
                <span>良品</span>
                <span>不良</span>
              </div>
              <div v-for="row in shiftReportRows" :key="row.code">
                <span>{{ row.line }}</span>
                <span>{{ row.code }}</span>
                <span>{{ row.productName }}</span>
                <span>{{ formatQty(row.goodQty, row.unit) }}</span>
                <span>{{ formatQty(row.defectQty, row.unit) }}</span>
              </div>
            </div>
            <p v-else class="workbench-empty-line">本班次暂无报工记录。</p>
            <label class="shift-note-field">
              留给下个班次的备注{{ handoverNoteRequired ? '（必填）' : '' }}
              <textarea v-model="handoverDraft.note" placeholder="填写未完成事项、异常关注点、优先级等"></textarea>
              <small v-if="handoverNoteRequired && handoverDraft.note.trim().length < 4" class="field-error-text">
                当前有未完成现场事项或本班异常，请补充至少 4 个字的交班说明。
              </small>
            </label>
          </section>

          <section v-if="operationPanel.type === 'receiveShift'" class="shift-receive-panel">
            <div v-if="pendingShiftHandover" class="shift-receive-context">
              <strong>{{ pendingShiftHandover.fromShiftName }} · {{ pendingShiftHandover.fromLeader }} 已交班</strong>
              <span>{{ pendingShiftHandover.endedAt }} · {{ pendingShiftHandover.activeCards.length }} 个现场批次</span>
              <p>交接备注：{{ pendingShiftHandover.note }}</p>
              <div v-if="pendingShiftHandover.activeCards.length" class="shift-handover-item-list compact">
                <article v-for="item in pendingShiftHandover.activeCards" :key="item.executionCardCode">
                  <strong>{{ item.line || '未指定产线' }} · {{ item.executionCardCode }}</strong>
                  <span>{{ item.operationType || item.node }} · {{ item.operationStatus || item.status }}</span>
                  <p>{{ item.nextAction || '按交班时节点继续处理' }}</p>
                </article>
              </div>
            </div>
            <div class="workbench-form-grid compact">
              <label>
                班次
                <select v-model="receiveDraft.shiftName">
                  <option v-for="shift in shiftOptions" :key="shift" :value="shift">
                    {{ shift }}
                  </option>
                </select>
              </label>
              <label>
                班长
                <select v-model="receiveDraft.leader">
                  <option v-for="member in shiftMemberOptions" :key="member" :value="member">
                    {{ member }}
                  </option>
                </select>
              </label>
              <label>
                开始时间
              <input value="正式命令成功后自动记录" readonly />
              </label>
            </div>
            <div class="shift-member-picker">
              <span>班次人员</span>
              <label v-for="member in shiftMemberOptions" :key="member">
                <input v-model="receiveDraft.members" type="checkbox" :value="member" />
                {{ member }}
              </label>
            </div>
            <p class="operation-copy">接班后现场任务保持原状态；正在执行的产线需要重新选择本班负责人后才能继续报工。</p>
          </section>

          <p v-if="operationPanel.type === 'material'" class="operation-copy">排产已经确认；系统已自动生成仓库领料任务。仓库确认出库后才会扣减库存，并让生产批次进入可开工状态。</p>
          <p v-if="operationPanel.type === 'dispatch'" class="operation-copy">确认排产后生成物料分配；仓库确认领料出库后，生产批次进入可开工状态。</p>
          <p v-if="operationPanel.type === 'report' && operationIsWipReport" class="operation-copy">每个大盘独立编号、称重和质检；质检放行后才能作为复绕成品报工的来源。</p>
          <p v-else-if="operationPanel.type === 'report' && operationIsRewindFinishedReport" class="operation-copy">系统按来源大盘记录实际用量和损耗，并为本次成品报工自动生成小盘追溯编号。</p>
          <p v-else-if="operationPanel.type === 'report'" class="operation-copy">提交后，良品和不良数量写入当前生产批次；达到计划数量后设备作业自动收口。</p>
          <p v-if="operationPanel.type === 'start' && operationIsSupplementStart && operationIsRewindStart" class="operation-copy">确认后沿用原生产批次和来源大盘继续补产复绕，直接进入成品报工；不重复领料和开机首检。</p>
          <p v-else-if="operationPanel.type === 'start' && operationIsRewindStart" class="operation-copy">确认后开始占用当前复绕线，直接进入复绕成品报工；不重复领料和开机首检。</p>
          <p v-else-if="operationPanel.type === 'start'" class="operation-copy">确认后开始占用当前挤出线，并自动生成开机首检任务。</p>
          <p v-if="operationPanel.type === 'leader'" class="operation-copy">更换负责人只影响当前产线正在执行的工单或生产批次。</p>
          <p v-if="operationPanel.type === 'wip'" class="operation-copy">当前只确认包装产线的报工动作；质检放行和仓库入库由对应模块处理。</p>
          <p v-if="operationPanel.type === 'handoverShift'" class="operation-copy">确认交班后自动记录结束时间，现场任务状态不改变，只锁定现场操作并等待下一班接班。</p>
        </div>

        <footer>
          <button type="button" class="workbench-mini-button" @click="closeOperation">
            <span class="workbench-button-label">取消</span>
          </button>
          <button
            type="button"
            class="workbench-mini-button dark"
            :disabled="operationConfirmDisabled"
            :title="operationConfirmDisabledReason || operationConfirmLabel"
            @click="confirmOperation"
          >
            <span class="workbench-button-label">{{ operationConfirmLabel }}</span>
            <ArrowRight :size="14" />
          </button>
        </footer>
      </section>
    </div>

    <FlowRecordPanel
      :open="operationPanel?.type === 'reportRecords'"
      title="报工记录"
      :records="productionReportHistory"
      search-placeholder="搜索报工单、批次、产线、成品、报工人或时间"
      empty-text="暂无报工记录"
      filtered-empty-text="没有匹配的报工记录"
      @close="closeOperation"
    />
    <FlowRecordPanel
      :open="operationPanel?.type === 'handoverRecords'"
      title="交接记录"
      :records="shiftHandoverHistory"
      search-placeholder="搜索交接单、班次、班长、状态、备注或时间"
      empty-text="暂无交接记录"
      filtered-empty-text="没有匹配的交接记录"
      @close="closeOperation"
    />

    <p v-if="toastMessage" class="workbench-toast">{{ toastMessage }}</p>
    </template>
  </section>
</template>

<style scoped>
.workbench-runtime-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #ead8ad;
  border-radius: 12px;
  background: #fffaf0;
  color: #6f5316;
}

.workbench-runtime-warning > div {
  display: grid;
  gap: 3px;
}

.workbench-runtime-warning strong {
  color: #4f3a0c;
}

.workbench-runtime-warning span {
  font-size: 13px;
  line-height: 1.5;
}
</style>
