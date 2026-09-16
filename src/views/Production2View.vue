<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
  FileText,
  Paperclip,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-vue-next';

import BusinessListToolbar from '../components/BusinessListToolbar.vue';
import DocumentFactGrid from '../components/DocumentFactGrid.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStageRail from '../components/DocumentStageRail.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import DocumentSummaryFacts from '../components/DocumentSummaryFacts.vue';
import ExceptionActionDialog from '../components/ExceptionActionDialog.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import ListLoadState from '../components/ListLoadState.vue';
import ListStatusOverview from '../components/ListStatusOverview.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import ProductionPackagingDialog from '../components/ProductionPackagingDialog.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import ShortCloseResolutionDialog from '../components/ShortCloseResolutionDialog.vue';
import WorkOrderTaskDemandPicker from '../components/WorkOrderTaskDemandPicker.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useModulePermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { useSessionStore } from '../stores/session';
import { statusPresentationClass } from '../utils/statusPresentation';
import { isQualityDispositionClosed, projectQualityState } from '../utils/qualityState';
import {
  apiBase,
  getProductionException,
  getProductionExecutionCard,
  getStoredSessionToken,
  listProductionMaterialIssues,
  listProductionReturns,
  listProductionExceptions,
  listProductionLossRecords,
  listProductionQualityTasks,
  listWarehouseInventory,
  packProductionExecutionCard,
  resolveProductionShortClose,
  resolveProductionException,
} from '../services/api';
import type { Production2BatchLineageRecord, Production2Exception, Production2ExecutionCard, Production2MaterialRequest, Production2OperationJob, Production2ProcessTemplate, Production2QualityTask, Production2Recipe, Production2ReleaseBatch, Production2Task, Production2WipBatch, Production2WorkOrder } from '../data/production2';
import {
  production2Exceptions,
  production2ExecutionCards,
  production2LossRecords,
  production2MaterialRequests,
  production2ProcessSteps,
  production2SystemActions,
  production2ProcessTemplates,
  production2QualityStandards,
  production2QualityTasks,
  production2ReleaseBatches,
  production2Recipes,
  production2Tasks,
  production2WorkOrders,
} from '../data/production2';
import { masterDataRows } from '../data/masterData';
import { productionMoveRows } from '../data/warehouse';
import type { Attachment, FlowRecord, ReferenceOption, WarehouseInventoryRow } from '../types/business';
import type { DocumentFact as DetailFact, DocumentStageItem, DocumentStatusItem } from '../types/documentUi';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { scrollElementIntoView } from '../utils/focusNavigation';

type ProductionPage =
  | 'tasks'
  | 'material-requests'
  | 'work-orders'
  | 'execution-cards'
  | 'quality'
  | 'quality-standards'
  | 'recipes'
  | 'process-templates'
  | 'process-steps'
  | 'loss-ledger'
  | 'exceptions';
type ToolbarMenuKey = 'sort' | 'filter' | 'export';
type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'status';
type FilterFieldKey = 'status' | 'party' | 'owner';
type AnyRecord = Record<string, unknown>;

type FilterField = {
  key: FilterFieldKey;
  label: string;
  options: string[];
};

type DetailLine = {
  title: string;
  meta?: string;
  status?: string;
  route?: string;
  values: DetailFact[];
};

type DetailSection = {
  title: string;
  note?: string;
  headers?: [string, string, string, string];
  plainValues?: boolean;
  facts?: DetailFact[];
  lines?: DetailLine[];
};

type TaskSourceType = '销售订单缺口' | '手工新建' | '安全库存补货';

type TaskProductDraftLine = {
  lineId: string;
  productCode: string;
  productName: string;
  model: string;
  spec: string;
  demandQty: string;
  unit: string;
  inboundQty: string;
  recipeCode: string;
};

type ProductionTaskDraft = {
  code: string;
  sourceType: TaskSourceType;
  sourceCode: string;
  sourceLineId: string;
  createdAt: string;
  productCode: string;
  productName: string;
  demandQty: string;
  finishedStockQty: string;
  productionQty: string;
  unit: string;
  deliveryDate: string;
  priority: string;
  status: string;
  recipeCode: string;
  ownerEmployeeCode: string;
  owner: string;
  nextStep: string;
  supplementaryRequirement: string;
  note: string;
  products: TaskProductDraftLine[];
  materialNeeds: AnyRecord[];
};

type MaterialRequestDraftLine = {
  lineId: string;
  materialCode: string;
  materialName: string;
  model: string;
  spec: string;
  requestedQty: string;
  availableQty: string;
  purchaseQty: string;
  taskEstimatedQty: string;
  taskAllocatedQty: string;
  taskAvailableQty: string;
  taskPendingCoverageQty: string;
  unit: string;
  purpose: string;
};

type MaterialRequestDraft = {
  code: string;
  requestType: string;
  sourceTaskCode: string;
  sourceDocument: string;
  department: string;
  requesterEmployeeCode: string;
  requester: string;
  requestDate: string;
  expectedDate: string;
  status: string;
  linkedPurchaseRequisition: string;
  note: string;
  nextStep: string;
  lines: MaterialRequestDraftLine[];
};

type WorkOrderDraft = {
  code: string;
  taskCode: string;
  sourceLineId: string;
  productCode: string;
  productName: string;
  planQty: string;
  unit: string;
  recipeCode: string;
  processTemplateCode: string;
  plannedDate: string;
  dueDate: string;
  ownerEmployeeCode: string;
  owner: string;
  note: string;
  status: string;
  currentNode: string;
  nextStep: string;
  releasedQty: string;
  completedQty: string;
  inboundQty: string;
  materialNeeds: AnyRecord[];
  sourceAllocations: WorkOrderSourceAllocationDraft[];
};

type WorkOrderSourceAllocationDraft = {
  taskCode: string;
  sourceLineId: string;
  sourceDocument: string;
  supplementaryRequirement: string;
  taskNote: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  dueDate: string;
};

type WorkOrderRecipeSnapshotRow = {
  code: string;
  name: string;
  model: string;
  spec: string;
  imageUrl: string;
  imageLabel: string;
  imageTone: string;
  unit: string;
  basis: string;
  perUnit: string;
  plannedNet: string;
  plannedWithLoss: string;
  plannedNetValue: number;
  plannedWithLossValue: number;
};

type WorkOrderProcessSnapshotStepRow = {
  code: string;
  sequence: number;
  name: string;
  owner: string;
  executionMode: string;
  action: string;
  equipment: string;
  workContent: string;
  completionRule: string;
  abnormalRule: string;
};

type WorkOrderCommand = 'save' | 'submit';

type ProductionPlanningCommand = 'save' | 'submit';

type ProductionPlanningApiResponse = {
  record: AnyRecord;
  items?: AnyRecord[];
  idempotencyIntent: string;
};

type WorkOrderApiResponse = {
  record: Production2WorkOrder & Record<string, unknown>;
  items?: Array<Production2WorkOrder & Record<string, unknown>>;
  releaseBatches?: Production2ReleaseBatch[];
  executionCards?: Production2ExecutionCard[];
  idempotencyIntent?: string;
};

type ListCell = {
  title: string;
  subtitle?: string;
};

type ProductionListRow = {
  page: ProductionPage;
  code: string;
  title: string;
  subtitle: string;
  status: string;
  nextStep: string;
  owner: string;
  party: string;
  date: string;
  amountValue: number;
  cells: ListCell[];
  raw: AnyRecord;
};

type ProductionListStatusFact = {
  label: string;
  value: string;
};

type ProductionListStatusOverview = {
  attention: string;
  facts: ProductionListStatusFact[];
  progress?: {
    label: string;
    current: number;
    total: number;
    unit?: string;
  };
};

type ProductionMoreAction = {
  key: 'change' | 'disable';
  label: string;
  description: string;
  tone?: 'normal' | 'danger';
};

type RecipeLifecycleCommand = 'save' | 'activate' | 'disable';

type RecipeUsageMode = 'percent' | 'fixed';

type RecipeDraftLine = {
  lineId: string;
  materialCode: string;
  materialName: string;
  usageMode: RecipeUsageMode;
  percent: string;
  perUnitQty: string;
  unit: string;
  incomingQcRequired: boolean;
};

type RecipeEstimatedLossDraftLine = {
  lineId: string;
  materialCode: string;
  materialName: string;
  fixedLossQty: string;
  lossRatePercent: string;
  unit: string;
};

type RecipeDraft = {
  code: string;
  revision: number;
  sourceRecipeCode: string;
  version: string;
  productCode: string;
  productName: string;
  productUnitWeightKg: string;
  outputUnit: string;
  note: string;
  owner: string;
  status: string;
  updatedAt: string;
  nextStep: string;
  materials: RecipeDraftLine[];
  estimatedLosses: RecipeEstimatedLossDraftLine[];
};

type ProcessTemplateZoneDraftLine = {
  lineId: string;
  name: string;
  value: string;
};

type ProcessTemplateStepDraftLine = {
  lineId: string;
  stepCode: string;
  coreEquipment: string;
  workContent: string;
  controlPoints: string;
  commonIssues: string;
  expanded: boolean;
};

type ProcessTemplateDraft = {
  code: string;
  revision: number;
  sourceProcessTemplateCode: string;
  name: string;
  version: string;
  routeType: '直接收卷' | '大盘复绕';
  productFamily: string;
  lineTypes: string[];
  status: string;
  owner: string;
  updatedAt: string;
  nextStep: string;
  temperatureTolerance: string;
  temperatureZones: ProcessTemplateZoneDraftLine[];
  steps: ProcessTemplateStepDraftLine[];
};

type ProcessStepActionType =
  | 'warehouseIssue'
  | 'startupConfirm'
  | 'startupInspection'
  | 'semiFinishedReport'
  | 'reportInspection'
  | 'finishedReport'
  | 'packagingConfirm'
  | 'inboundInspection'
  | 'warehouseInbound';

type ProcessStepActionDraftLine = {
  lineId: string;
  type: ProcessStepActionType;
  label: string;
  actor: '仓库' | '生产' | '质检' | '系统';
  triggerTiming: string;
  generatedTask: string;
  buttonLabel: string;
  qualityStandard: string;
  completionEvent: string;
  blocking: boolean;
  abnormalEvent: string;
};

type ProcessStepDraft = {
  code: string;
  name: string;
  status: string;
  owner: string;
  updatedAt: string;
  ownerDomain: string;
  executionMode: string;
  completionMode: string;
  trigger: string;
  entryLabel: string;
  result: string;
  blockingPolicy: string;
  repeatPolicy: string;
  requiredInputs: string[];
  emittedEvents: string[];
  completionSignal: string;
  idempotencyScope: string;
  failureRule: string;
  autoAdvance: string;
  workInstruction: string;
  completionRule: string;
  abnormalRule: string;
  actions: ProcessStepActionDraftLine[];
};

type ProcessStepActionPreset = Omit<ProcessStepActionDraftLine, 'lineId'>;

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { canWrite: canWriteProduction, readonlyReason: productionReadonlyReason } = useModulePermission('production');

const productionPages = new Set<ProductionPage>([
  'tasks',
  'material-requests',
  'work-orders',
  'execution-cards',
  'quality',
  'quality-standards',
  'recipes',
  'process-templates',
  'process-steps',
  'loss-ledger',
  'exceptions',
]);

const pageConfigs: Record<
  ProductionPage,
  {
    title: string;
    createLabel: string;
    searchPlaceholder: string;
    tableHeaders: string[];
    backLabel: string;
    amountLabel: string;
    dateLabel: string;
    statusColumnTitle: string;
  }
> = {
  tasks: {
    title: '生产任务',
    createLabel: '新建',
    searchPlaceholder: '搜索任务编号、来源单号、成品、负责人',
    tableHeaders: ['生产任务', '需求来源/负责人', '计划生产/交期'],
    backLabel: '返回生产任务',
    amountLabel: '计划生产量从高到低',
    dateLabel: '交期',
    statusColumnTitle: '任务状态',
  },
  'material-requests': {
    title: '备料申请',
    createLabel: '临时申请',
    searchPlaceholder: '搜索申请单、来源任务、物料、申请人',
    tableHeaders: ['备料申请', '需求来源/申请人', '物料需求', '库存覆盖/采购处理'],
    backLabel: '返回备料申请',
    amountLabel: '申请数量从高到低',
    dateLabel: '需求日期',
    statusColumnTitle: '处理状态',
  },
  'work-orders': {
    title: '生产工单',
    createLabel: '新建',
    searchPlaceholder: '搜索工单号、任务需求、成品、要求日期、配方或工艺',
    tableHeaders: ['生产工单/成品', '任务需求', '计划数量/要求日期', '配方/工艺'],
    backLabel: '返回生产工单',
    amountLabel: '计划数量从高到低',
    dateLabel: '要求日期',
    statusColumnTitle: '工单状态',
  },
  'execution-cards': {
    title: '生产批次',
    createLabel: '',
    searchPlaceholder: '搜索批次、工单、成品、产线、班组',
    tableHeaders: ['生产批次/工单', '成品/产线', '计划/班组'],
    backLabel: '返回生产批次',
    amountLabel: '计划数量从高到低',
    dateLabel: '计划日期',
    statusColumnTitle: '批次状态',
  },
  quality: {
    title: '质检任务',
    createLabel: '新建',
    searchPlaceholder: '搜索质检任务、工单、批次、检验员',
    tableHeaders: ['质检任务', '检验对象', '类型/节点', '抽检要求', '检验员/期限', '结果'],
    backLabel: '返回质检任务',
    amountLabel: '抽检数量从高到低',
    dateLabel: '要求完成',
    statusColumnTitle: '检验状态',
  },
  'quality-standards': {
    title: '质检标准',
    createLabel: '新建',
    searchPlaceholder: '搜索标准、适用范围、检验类型、负责人',
    tableHeaders: ['标准编号', '标准名称', '检验类型', '适用范围', '判定规则', '负责人'],
    backLabel: '返回质检标准',
    amountLabel: '检查项从多到少',
    dateLabel: '更新日期',
    statusColumnTitle: '维护状态',
  },
  recipes: {
    title: '生产配方',
    createLabel: '新建',
    searchPlaceholder: '搜索配方编号、产出物料、物料编码或版本',
    tableHeaders: ['配方版本', '产出物料', '每单位标准', '用料规则'],
    backLabel: '返回生产配方',
    amountLabel: '物料项从多到少',
    dateLabel: '更新日期',
    statusColumnTitle: '版本状态',
  },
  'process-templates': {
    title: '生产工艺',
    createLabel: '新建',
    searchPlaceholder: '搜索工艺编号、名称、路线、产品族、参数或阶段',
    tableHeaders: ['生产工艺', '路线/产品族', '温控/产线', '工艺路线'],
    backLabel: '返回生产工艺',
    amountLabel: '工序数从多到少',
    dateLabel: '更新日期',
    statusColumnTitle: '版本状态',
  },
  'process-steps': {
    title: '系统动作',
    createLabel: '',
    searchPlaceholder: '搜索动作编号、名称、负责部门或触发条件',
    tableHeaders: ['系统动作', '负责部门/执行方式', '触发与入口', '结果与控制'],
    backLabel: '返回系统动作',
    amountLabel: '输入项从多到少',
    dateLabel: '更新日期',
    statusColumnTitle: '能力状态',
  },
  'loss-ledger': {
    title: '损耗台账',
    createLabel: '',
    searchPlaceholder: '搜索记录编号、来源、物料编码、工单、批次、工序或责任人',
    tableHeaders: ['损耗记录', '来源对象', '产品/工序', '损耗判断', '责任/记录状态'],
    backLabel: '返回损耗台账',
    amountLabel: '损耗 kg 从高到低',
    dateLabel: '发生日期',
    statusColumnTitle: '记录状态',
  },
  exceptions: {
    title: '生产异常',
    createLabel: '报告异常',
    searchPlaceholder: '搜索异常、来源、工单、记录人或责任分工',
    tableHeaders: ['生产异常', '类型/级别', '影响对象', '原因/责任', '处置/损失预估'],
    backLabel: '返回生产异常',
    amountLabel: '影响数量从高到低',
    dateLabel: '发生日期',
    statusColumnTitle: '处理状态',
  },
};

const processStepActionCodeByType: Record<ProcessStepActionType, string> = {
  warehouseIssue: 'SA2-CREATE-MATERIAL-ISSUE',
  startupConfirm: 'SA2-START-EXECUTION',
  startupInspection: 'SA2-CREATE-STARTUP-QC',
  semiFinishedReport: 'SA2-REPORT-WIP',
  reportInspection: 'SA2-CREATE-REPORT-QC',
  finishedReport: 'SA2-REPORT-FINISHED',
  packagingConfirm: 'SA2-RECORD-PACKAGING',
  inboundInspection: 'SA2-CREATE-INBOUND-QC',
  warehouseInbound: 'SA2-CREATE-PRODUCTION-RECEIPT',
};

const processStepActionPresets = Object.entries(processStepActionCodeByType)
  .map(([type, actionCode]) => {
    const action = production2SystemActions.find((item) => item.code === actionCode);
    if (!action) return null;
    return {
      type: type as ProcessStepActionType,
      label: action.name,
      actor: action.ownerDomain,
      triggerTiming: action.trigger,
      generatedTask: action.result,
      buttonLabel: action.entryLabel || '',
      qualityStandard: action.ownerDomain === '质检' ? action.name : '',
      completionEvent: action.completionSignal,
      blocking: action.blockingPolicy === '完成前阻断',
      abnormalEvent: action.failureRule,
    };
  })
  .filter((preset): preset is ProcessStepActionPreset => Boolean(preset));
const processStepTriggerOptions = ['进入工序', '仓库发料后', '开机确认后', '报工完成后', '包装完成后', '质检放行后'];
const processStepActorOptions = ['仓库', '生产', '质检', '系统'] as const;
const processStepLockedMessage = '系统动作由系统预设，用户不可新增或修改；作业资料在生产工艺中维护。';
const productionTaskPriorityOptions = ['正常', '加急'];
const materialRequestTypeOptions = ['任务缺口补料', '临时备料', '试产备料', '损耗补料', '返工补料'];
const processTemplateStageNames = Object.fromEntries(
  production2ProcessSteps.map((step) => [step.code, step.name]),
) as Record<string, string>;

const searchKeyword = ref('');
const openToolbarMenu = ref<ToolbarMenuKey | null>(null);
const sortMode = ref<SortMode>('status');
const draftFilterStatus = ref('');
const draftFilterParty = ref('');
const draftFilterOwner = ref('');
const draftFilterDateStart = ref('');
const draftFilterDateEnd = ref('');
const hoveredProductionRowKey = ref('');
const productionMoreActionsOpen = ref(false);
const showProductionFlowRecords = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const productionDraft = ref<Record<string, string>>({});
const taskDraft = ref<ProductionTaskDraft>(emptyProductionTaskDraft());
const materialRequestDraft = ref<MaterialRequestDraft>(emptyMaterialRequestDraft());
const workOrderDraft = ref<WorkOrderDraft>(emptyWorkOrderDraft());
const workOrderAdditionalSourceKey = ref('');
const taskSaving = ref(false);
const materialRequestSaving = ref(false);
const workOrderSaving = ref(false);
const recipeSaving = ref(false);
const processTemplateSaving = ref(false);
const executionCardActionBusy = ref(false);
const exceptionActionBusy = ref(false);
const packagingDialogOpen = ref(false);
const pendingPackagingCard = ref<AnyRecord | null>(null);
const shortCloseResolutionDialogOpen = ref(false);
const pendingShortCloseCard = ref<AnyRecord | null>(null);
const exceptionRecoveryDialogOpen = ref(false);
const pendingRecoveryException = ref<AnyRecord | null>(null);
const exceptionRecoveryActions = [
  {
    key: 'resume',
    label: '解除停机',
    status: '已关闭',
    description: '确认停机原因已经排除，现场复核后恢复到停机前的生产阶段。',
    reasonPlaceholder: '填写原因排除情况和现场复核结果',
  },
];
const productionExceptionRevision = ref(0);
const productionDataRevision = ref(0);
const productionRuntimeDataLoading = ref(true);
const productionRuntimeDataError = ref('');
const productionRuntimeDataHasSnapshot = ref(false);
const productionRuntimeDataLoadedAt = ref('');
const recipeRuntimeLoading = ref(true);
const recipeRuntimeError = ref('');
const recipeRuntimeHasSnapshot = ref(false);
const recipeRuntimeLoadedAt = ref('');
const processTemplateRuntimeLoading = ref(true);
const processTemplateRuntimeError = ref('');
const processTemplateRuntimeHasSnapshot = ref(false);
const processTemplateRuntimeLoadedAt = ref('');
const exceptionRuntimeLoading = ref(true);
const exceptionRuntimeError = ref('');
const exceptionRuntimeHasSnapshot = ref(false);
const exceptionRuntimeLoadedAt = ref('');
const lossRuntimeLoading = ref(false);
const lossRuntimeError = ref('');
const lossRuntimeHasSnapshot = ref(false);
const lossRuntimeLoadedAt = ref('');
const qualityTaskRuntimeLoading = ref(true);
const qualityTaskRuntimeError = ref('');
const qualityTaskRuntimeHasSnapshot = ref(false);
const qualityTaskRuntimeLoadedAt = ref('');
const recipeDetailLoading = ref(false);
const recipeDetailError = ref('');
const recipeDetailLoadedCode = ref('');
const recipeDetailRecord = ref<(Production2Recipe & AnyRecord) | null>(null);
const processTemplateDetailLoading = ref(false);
const processTemplateDetailError = ref('');
const processTemplateDetailLoadedCode = ref('');
const processTemplateDetailRecord = ref<(Production2ProcessTemplate & AnyRecord) | null>(null);
const productionDraftHydrated = ref(false);
const recipeDraft = ref<RecipeDraft>(emptyRecipeDraft());
const recipeFlowRecords = ref<FlowRecord[]>([]);
const exceptionFlowRecords = ref<FlowRecord[]>([]);
const processTemplateDraft = ref<ProcessTemplateDraft>(emptyProcessTemplateDraft());
const processTemplateFlowRecords = ref<FlowRecord[]>([]);
const processStepDraft = ref<ProcessStepDraft>(emptyProcessStepDraft());
const productionValidationAttempted = ref(false);
const productionDocumentUploadedAttachments = ref<Record<string, Attachment[]>>({});
const productionInventoryRows = ref<WarehouseInventoryRow[]>([]);
const productionInventoryLoading = ref(false);
const runtimeProductionIssues = ref<AnyRecord[]>([]);
const runtimeProductionReturns = ref<AnyRecord[]>([]);
const runtimeProductionReceipts = ref<Array<Record<string, unknown>>>([]);
const runtimeExecutionCardDetailLoaded = ref(false);
const executionCardActionKeys = new Map<string, string>();
const exceptionActionKeys = new Map<string, string>();
const productionPlanningIdempotencyKeys = new Map<string, string>();
const workOrderIdempotencyKeys = new Map<string, string>();

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let productionInventoryLoadRequestId = 0;
let recipeDetailLoadRequestId = 0;
let processTemplateDetailLoadRequestId = 0;
let productionHydratedEditorKey = '';

const routePage = computed(() => String(route.params.page ?? 'tasks'));
const activePage = computed<ProductionPage>(() => {
  const page = routePage.value === 'quality-standards' ? 'quality-standards' : routePage.value;
  return productionPages.has(page as ProductionPage) ? (page as ProductionPage) : 'tasks';
});
const amountSortableProductionPages = new Set<ProductionPage>([
  'recipes',
  'process-templates',
  'quality-standards',
  'loss-ledger',
]);

watch(
  activePage,
  (page) => {
    if (page === 'tasks' || page === 'work-orders' || page === 'material-requests' || page === 'exceptions') void loadProductionInventoryFacts();
    if (!amountSortableProductionPages.has(page) && sortMode.value === 'amountDesc') sortMode.value = 'status';
    if (page === 'loss-ledger') {
      sortMode.value = 'newest';
      if (!lossRuntimeHasSnapshot.value && !lossRuntimeLoading.value) void loadRuntimeProductionLossRecords();
    }
  },
  { immediate: true },
);
const activeListKey = computed(() => activePage.value);
const activePageConfig = computed(() => pageConfigs[activePage.value] ?? pageConfigs.tasks);
const activeListTitle = computed(() => activePageConfig.value.title);
const activeSearchPlaceholder = computed(() => activePageConfig.value.searchPlaceholder);
const activeTableHeaders = computed(() => activePageConfig.value.tableHeaders);
const productionListPath = computed(() => `/production/${activePage.value}`);
const requestedProductionReturnPath = computed(() => {
  const path = String(route.query.returnTo ?? '').trim();
  return path.startsWith('/') && !path.startsWith('//') ? path : '';
});
const productionBackPath = computed(() => requestedProductionReturnPath.value || productionListPath.value);
const activeBackLabel = computed(() => {
  if (requestedProductionReturnPath.value.startsWith('/production/workbench')) return '返回生产工作台';
  if (requestedProductionReturnPath.value.startsWith('/production/tasks/')) return '返回生产任务';
  return activePageConfig.value.backLabel;
});
const productionDocumentCode = computed(() => decodeURIComponent(String(route.params.code ?? '')));
const isProductionNewDocument = computed(() => route.name === 'production-document-new');
const isProductionEditDocument = computed(() => route.name === 'production-document-edit');
const isProductionEditableDocument = computed(() => isProductionNewDocument.value || isProductionEditDocument.value);
const processTemplateUnsavedSource = computed(() => ({
  ...processTemplateDraft.value,
  steps: processTemplateDraft.value.steps.map((step) => {
    const persistedStep: Partial<ProcessTemplateStepDraftLine> = { ...step };
    delete persistedStep.expanded;
    return persistedStep;
  }),
}));
const productionUnsavedSource = computed(() => {
  if (activePage.value === 'tasks') return taskDraft.value;
  if (activePage.value === 'material-requests') return materialRequestDraft.value;
  if (activePage.value === 'work-orders') return workOrderDraft.value;
  if (activePage.value === 'recipes') return recipeDraft.value;
  if (activePage.value === 'process-templates') return processTemplateUnsavedSource.value;
  if (activePage.value === 'process-steps') return processStepDraft.value;
  return productionDraft.value;
});
const { resetUnsavedChanges } = useUnsavedChangesGuard(productionUnsavedSource, {
  enabled: isProductionEditableDocument,
  ready: productionDraftHydrated,
});
const isProductionDocumentPage = computed(() =>
  ['production-document-new', 'production-document-edit', 'production-document-detail'].includes(String(route.name ?? '')),
);
const isProductionRuleDocument = computed(() =>
  ['recipes', 'process-templates', 'process-steps', 'quality-standards'].includes(activePage.value),
);
const isProductionRecordDocument = computed(() => activePage.value === 'loss-ledger');
const showProductionHeaderPrimaryAction = computed(() =>
  canWriteProduction.value
  && ['tasks', 'material-requests', 'work-orders', 'recipes', 'process-templates', 'exceptions'].includes(activeListKey.value),
);
const productionListCreatePath = computed(() => activePage.value === 'exceptions'
  ? '/production/workbench?tab=site'
  : `/production/${activePage.value}/new`);
const productionListCreateTitle = computed(() => activePage.value === 'exceptions'
  ? '前往生产工作台选择生产批次并报告异常'
  : activePage.value === 'material-requests'
    ? '新建无生产任务来源的临时或试产备料申请；任务缺口请从生产任务发起'
  : `新建${activeListTitle.value}`);

watch(
  () => [activePage.value, isProductionDocumentPage.value, isProductionNewDocument.value] as const,
  ([page, isDocument, isNew]) => {
    if (page === 'process-steps' && isDocument && isNew && route.path !== productionListPath.value) {
      router.replace(productionListPath.value);
    }
    if (page === 'exceptions' && isDocument && isNew && route.path !== '/production/workbench') {
      router.replace('/production/workbench?tab=site');
    }
  },
  { immediate: true },
);

const productionDocumentStageTitle = computed(() =>
  ['recipes', 'process-templates'].includes(activePage.value) ? '版本状态' : isProductionRuleDocument.value ? '维护状态' : '流程节点',
);
const productionDocumentSummaryTitle = computed(() => (
  activePage.value === 'execution-cards'
    ? '批次状态'
    : activePage.value === 'tasks'
      ? '任务判断'
      : activePage.value === 'work-orders'
        ? '工单判断'
      : activePage.value === 'process-templates'
        ? '维护信息'
      : activePage.value === 'process-steps'
        ? '能力摘要'
      : isProductionRuleDocument.value
        ? '规则摘要'
        : '单据摘要'
));

const allProductionRows = computed(() => {
  void productionExceptionRevision.value;
  void productionDataRevision.value;
  return buildRows(activePage.value);
});
const currentProductionDocument = computed(() => {
  if (activePage.value === 'process-steps' && isProductionNewDocument.value) return null;
  if (isProductionNewDocument.value) return createDraftRow(activePage.value);
  if (['tasks', 'material-requests', 'work-orders', 'execution-cards'].includes(activePage.value)
    && !productionRuntimeDataHasSnapshot.value) return null;
  if (activePage.value === 'recipes'
    && !recipeRuntimeHasSnapshot.value
    && recipeDetailLoadedCode.value !== productionDocumentCode.value) return null;
  if (activePage.value === 'process-templates'
    && !processTemplateRuntimeHasSnapshot.value
    && processTemplateDetailLoadedCode.value !== productionDocumentCode.value) return null;
  if (activePage.value === 'exceptions' && !exceptionRuntimeHasSnapshot.value) return null;
  if (activePage.value === 'loss-ledger' && !lossRuntimeHasSnapshot.value) return null;
  if (activePage.value === 'quality' && !qualityTaskRuntimeHasSnapshot.value) return null;
  if (activePage.value === 'recipes' && recipeDetailRecord.value?.code === productionDocumentCode.value) {
    return recipeRow(recipeDetailRecord.value, 0);
  }
  if (activePage.value === 'process-templates' && processTemplateDetailRecord.value?.code === productionDocumentCode.value) {
    return processTemplateRow(processTemplateDetailRecord.value);
  }
  return allProductionRows.value.find((row) => row.code === productionDocumentCode.value) || null;
});
const showProductionRuntimeLoadState = computed(() => {
  if (isProductionNewDocument.value) return false;
  if (activePage.value === 'recipes') {
    return (recipeRuntimeLoading.value && !recipeRuntimeHasSnapshot.value)
      || (isProductionDocumentPage.value && recipeDetailLoading.value);
  }
  if (activePage.value === 'process-templates') {
    return (processTemplateRuntimeLoading.value && !processTemplateRuntimeHasSnapshot.value)
      || (isProductionDocumentPage.value && processTemplateDetailLoading.value);
  }
  if (activePage.value === 'exceptions') {
    return exceptionRuntimeLoading.value && !exceptionRuntimeHasSnapshot.value;
  }
  if (activePage.value === 'loss-ledger') {
    return lossRuntimeLoading.value && !lossRuntimeHasSnapshot.value;
  }
  if (activePage.value === 'quality') {
    return qualityTaskRuntimeLoading.value && !qualityTaskRuntimeHasSnapshot.value;
  }
  const runtimePage = ['tasks', 'material-requests', 'work-orders', 'execution-cards'].includes(activePage.value);
  const inventoryPage = ['tasks', 'material-requests', 'work-orders'].includes(activePage.value);
  return (runtimePage && productionRuntimeDataLoading.value && !productionRuntimeDataHasSnapshot.value)
    || (inventoryPage && productionInventoryLoading.value)
    || (activePage.value === 'tasks' && recipeRuntimeLoading.value && !recipeRuntimeHasSnapshot.value);
});
const productionRuntimeErrorApplies = computed(() =>
  !isProductionNewDocument.value
  && (
    (activePage.value === 'recipes'
      && Boolean(
        (isProductionDocumentPage.value && recipeDetailError.value)
        || (!recipeRuntimeHasSnapshot.value && recipeRuntimeError.value),
      ))
    || (activePage.value === 'process-templates'
      && Boolean(
        (isProductionDocumentPage.value && processTemplateDetailError.value)
        || (!processTemplateRuntimeHasSnapshot.value && processTemplateRuntimeError.value),
      ))
    || (activePage.value === 'exceptions'
      && Boolean(!exceptionRuntimeHasSnapshot.value && exceptionRuntimeError.value))
    || (activePage.value === 'loss-ledger'
      && Boolean(!lossRuntimeHasSnapshot.value && lossRuntimeError.value))
    || (activePage.value === 'quality'
      && Boolean(!qualityTaskRuntimeHasSnapshot.value && qualityTaskRuntimeError.value))
    || (
      ['tasks', 'material-requests', 'work-orders', 'execution-cards'].includes(activePage.value)
      && Boolean(!productionRuntimeDataHasSnapshot.value && productionRuntimeDataError.value)
    )
    || (activePage.value === 'tasks'
      && Boolean(!recipeRuntimeHasSnapshot.value && recipeRuntimeError.value))
  ),
);
const productionRuntimeErrorMessage = computed(() => {
  if (activePage.value === 'recipes') return (isProductionDocumentPage.value ? recipeDetailError.value : '') || recipeRuntimeError.value;
  if (activePage.value === 'process-templates') return (isProductionDocumentPage.value ? processTemplateDetailError.value : '') || processTemplateRuntimeError.value;
  if (activePage.value === 'exceptions') return exceptionRuntimeError.value;
  if (activePage.value === 'loss-ledger') return lossRuntimeError.value;
  if (activePage.value === 'quality') return qualityTaskRuntimeError.value;
  if (activePage.value === 'tasks' && !recipeRuntimeHasSnapshot.value && recipeRuntimeError.value) return recipeRuntimeError.value;
  return productionRuntimeDataError.value;
});
const productionStaleSnapshotMessage = computed(() => {
  if (activePage.value === 'recipes' && recipeRuntimeError.value && recipeRuntimeHasSnapshot.value) {
    return `生产配方刷新失败，当前显示 ${recipeRuntimeLoadedAt.value} 的只读快照。`;
  }
  if (activePage.value === 'process-templates' && processTemplateRuntimeError.value && processTemplateRuntimeHasSnapshot.value) {
    return `生产工艺刷新失败，当前显示 ${processTemplateRuntimeLoadedAt.value} 的只读快照。`;
  }
  if (activePage.value === 'exceptions' && exceptionRuntimeError.value && exceptionRuntimeHasSnapshot.value) {
    return `生产异常刷新失败，当前显示 ${exceptionRuntimeLoadedAt.value} 的只读快照。`;
  }
  if (activePage.value === 'loss-ledger' && lossRuntimeError.value && lossRuntimeHasSnapshot.value) {
    return `损耗台账刷新失败，当前显示 ${lossRuntimeLoadedAt.value} 的只读快照。`;
  }
  if (activePage.value === 'quality' && qualityTaskRuntimeError.value && qualityTaskRuntimeHasSnapshot.value) {
    return `生产质检刷新失败，当前显示 ${qualityTaskRuntimeLoadedAt.value} 的只读快照。`;
  }
  if (productionRuntimeDataError.value && productionRuntimeDataHasSnapshot.value
    && ['tasks', 'material-requests', 'work-orders', 'execution-cards'].includes(activePage.value)) {
    return `生产运行数据刷新失败，当前显示 ${productionRuntimeDataLoadedAt.value} 的只读快照。`;
  }
  if (activePage.value === 'tasks' && recipeRuntimeError.value && recipeRuntimeHasSnapshot.value) {
    return `生产配方刷新失败，任务物料与可建单动作暂按 ${recipeRuntimeLoadedAt.value} 的只读快照显示。`;
  }
  return '';
});

const isRecipeDocument = computed(() => activePage.value === 'recipes' && isProductionDocumentPage.value && Boolean(currentProductionDocument.value));
const recipeIsEditable = computed(() =>
  canWriteProduction.value
  && isRecipeDocument.value
  && isProductionEditableDocument.value
  && (isProductionNewDocument.value || recipeDraft.value.status === '草稿'),
);
const isTaskDocument = computed(() => activePage.value === 'tasks' && isProductionDocumentPage.value && Boolean(currentProductionDocument.value));
const taskIsEditable = computed(() => canWriteProduction.value && isTaskDocument.value && isProductionEditableDocument.value);
const isMaterialRequestDocument = computed(() => activePage.value === 'material-requests' && isProductionDocumentPage.value && Boolean(currentProductionDocument.value));
const materialRequestIsEditable = computed(() =>
  canWriteProduction.value
  && isMaterialRequestDocument.value
  && isProductionEditableDocument.value
  && (isProductionNewDocument.value || materialRequestDraft.value.status === '草稿'),
);
const isProcessTemplateDocument = computed(() => activePage.value === 'process-templates' && isProductionDocumentPage.value && Boolean(currentProductionDocument.value));
const processTemplateIsEditable = computed(() =>
  canWriteProduction.value
  && isProcessTemplateDocument.value
  && isProductionEditableDocument.value
  && (isProductionNewDocument.value || processTemplateDraft.value.status === '草稿'),
);
const isProcessStepDocument = computed(() => activePage.value === 'process-steps' && isProductionDocumentPage.value && Boolean(currentProductionDocument.value));
const processStepIsEditable = computed(() => false);
const productionDocumentIsReadOnlyView = computed(() =>
  !isProductionEditableDocument.value
  || (isRecipeDocument.value && !recipeIsEditable.value)
  || (isMaterialRequestDocument.value && !materialRequestIsEditable.value)
  || (isProcessTemplateDocument.value && !processTemplateIsEditable.value)
  || isProcessStepDocument.value,
);
const materialRequestLinesAreEditable = computed(() => materialRequestIsEditable.value && !materialRequestDraft.value.sourceTaskCode);
const materialRequestSelectableTypeOptions = computed(() =>
  materialRequestDraft.value.sourceTaskCode
    ? ['任务缺口补料']
    : materialRequestTypeOptions.filter((option) => option !== '任务缺口补料'),
);
const isWorkOrderDocument = computed(() => activePage.value === 'work-orders' && isProductionDocumentPage.value && Boolean(currentProductionDocument.value));
const workOrderIsEditable = computed(() => canWriteProduction.value && isWorkOrderDocument.value && isProductionEditableDocument.value);
const workOrderConfirmedEdit = computed(() => {
  if (!isWorkOrderDocument.value || !isProductionEditDocument.value) return false;
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  return !/草稿|draft/i.test(text(raw?.documentStatus || raw?.status, ''));
});
const workOrderHasDownstreamDocuments = computed(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  const code = text(raw?.code, '');
  if (!code) return false;
  return workOrderReleaseBatches(code).length > 0
    || workOrderExecutionCards(code).length > 0
    || production2QualityTasks.some((task) => text(task.workOrderCode, '') === code)
    || production2Exceptions.some((exception) => {
      const item = exception as unknown as AnyRecord;
      return text(item.relatedWorkOrder, '') === code || text(item.workOrderCode, '') === code;
    })
    || toNumber(raw?.releasedQty) > 0
    || toNumber(raw?.completedQty) > 0
    || toNumber(raw?.inboundQty) > 0;
});
const workOrderStructureIsEditable = computed(() => workOrderIsEditable.value && !workOrderHasDownstreamDocuments.value);
const taskProductRows = computed(() => taskDraft.value.products);
const taskPrimaryUnit = computed(() => taskProductRows.value[0]?.unit || taskDraft.value.unit || '件');
const taskDemandTotal = computed(() => sumNumbers(taskProductRows.value.map((line) => toNumber(line.demandQty))));
const taskRelatedWorkOrders = computed(() => production2WorkOrders.filter((order) => (
  workOrderSourceAllocationsFromRaw(
    order as unknown as AnyRecord,
    text(order.taskCode, ''),
    text((order as unknown as AnyRecord).sourceLineId, ''),
  ).some((allocation) => allocation.taskCode === taskDraft.value.code)
)));
const taskDemandSummary = computed(() => taskProductQuantitySummary(taskProductRows.value, (line) => toNumber(line.demandQty)));
const taskPlannedSummary = computed(() => taskProductQuantitySummary(taskProductRows.value, (line) => taskProductPlannedQty(line, taskDraft.value.code)));
const taskInboundSummary = computed(() => taskProductQuantitySummary(taskProductRows.value, (line) => taskProductInboundQty(line, taskDraft.value.code)));
const taskRemainingToPlanSummary = computed(() => taskProductQuantitySummary(taskProductRows.value, (line) => taskProductScheduleGap(line, taskDraft.value.code)));
const taskLifecycleStatusLabel = computed(() => taskLifecycleStatusForProducts(
  currentProductionDocument.value?.raw as AnyRecord | undefined,
  taskProductRows.value,
  taskDraft.value.code,
));
const taskBuildStatusLabel = computed(() =>
  taskLifecycleStatusLabel.value === '草稿'
    ? '未提交'
    : taskBuildStatusForProducts(taskProductRows.value, taskDraft.value.code),
);
const taskInboundStatusLabel = computed(() => {
  const validLines = taskProductRows.value.filter((line) => toNumber(line.demandQty) > 0);
  if (!validLines.length || validLines.every((line) => taskProductInboundQty(line, taskDraft.value.code) <= 0)) return '未入库';
  if (!validLines.every((line) => taskProductInboundQty(line, taskDraft.value.code) + 0.0001 >= toNumber(line.demandQty))) return '部分入库';
  return '已入库';
});
const taskHasCompletedRelease = computed(() => taskReleaseIsCompleteForProducts(taskProductRows.value, taskDraft.value.code));
const taskAllocationSourceDocs = computed(() => taskRelatedWorkOrders.value.map((order) => text(order.code, '')).filter(Boolean));
const taskEffectiveMaterialNeeds = computed(() => {
  if (!taskStructureIsEditable.value) return taskDraft.value.materialNeeds;
  const calculated = buildProductionTaskMaterialNeeds(taskDraft.value);
  return calculated.length ? calculated : taskDraft.value.materialNeeds;
});
const taskMaterialPlanningBlockers = computed(() => productionTaskMaterialPlanningBlockers(
  (currentProductionDocument.value?.raw || taskDraft.value) as AnyRecord,
));
const taskBlockedRecipeProduct = computed(() => taskMaterialPlanningBlockers.value[0]);
const taskMaterialReadyRows = computed(() => taskMaterialReadinessRows(
  taskEffectiveMaterialNeeds.value,
  !taskHasCompletedRelease.value,
  taskAllocationSourceDocs.value,
));
const taskMaterialReadinessLabel = computed(() => {
  if (taskMaterialPlanningBlockers.value.length) {
    return taskMaterialReadyRows.value.length ? '部分待配置配方' : '待配置配方';
  }
  if (taskProductRows.value.filter((line) => toNumber(line.demandQty) > 0).length > 1) {
    return taskMaterialOverallStatus(taskMaterialReadyRows.value, taskHasCompletedRelease.value);
  }
  return materialTaskReadinessLabel(
    taskEffectiveMaterialNeeds.value,
    taskDemandTotal.value,
    taskPrimaryUnit.value,
    taskRelatedWorkOrders.value.map((order) => text(order.code, '')).filter(Boolean),
    taskHasCompletedRelease.value,
  );
});
const taskMaterialEmptyMessage = computed(() => {
  if (!taskMaterialPlanningBlockers.value.length) return '暂无物料需求，选择成品后由启用配方自动计算。';
  const products = taskMaterialPlanningBlockers.value
    .map((item) => text(item.productName || item.productCode, '未命名成品'))
    .filter(Boolean)
    .join('、');
  return `${products} 暂无唯一启用配方，请先维护并启用生产配方，再创建生产工单。`;
});
const taskDueAttentionLabel = computed(() => productionTaskDueAttention(
  currentProductionDocument.value?.raw as AnyRecord | undefined,
));
const taskStatusPanelItems = computed<DocumentStatusItem[]>(() => [
  {
    key: 'build-quantity',
    label: '建单进度',
    value: taskBuildStatusLabel.value,
    detail: taskLifecycleStatusLabel.value === '草稿'
      ? `计划 ${taskDemandSummary.value}`
      : `待建 ${taskRemainingToPlanSummary.value}`,
    kind: 'status',
  },
  {
    key: 'inbound',
    label: '入库进度',
    value: taskLifecycleStatusLabel.value === '草稿' ? '未提交' : taskInboundStatusLabel.value,
    detail: taskLifecycleStatusLabel.value === '草稿'
      ? '任务确认后开始跟踪'
      : `${taskInboundSummary.value} / ${taskDemandSummary.value}`,
  },
  ...(taskDueAttentionLabel.value
    ? [{
        key: 'due-attention',
        label: '交期提醒',
        value: taskDueAttentionLabel.value,
        kind: 'status' as const,
      }]
    : []),
  {
    key: 'material',
    label: '物料备料',
    value: taskMaterialReadinessLabel.value,
  },
  {
    key: 'work-orders',
    label: '关联工单',
    value: `${taskRelatedWorkOrders.value.length} 张`,
    kind: 'metric',
  },
]);
const taskRelatedMaterialRequests = computed(() => production2MaterialRequests.filter((request) => text((request as AnyRecord).sourceTaskCode, '') === taskDraft.value.code));
const taskRelatedMaterialRequestRows = computed(() =>
  taskRelatedMaterialRequests.value.map((request) => {
    const raw = request as AnyRecord;
    return {
      code: text(raw.code),
      status: text(raw.status),
      expectedDate: text(raw.expectedDate),
      lineSummary: materialRequestLineSummary(raw.lines),
    };
  }),
);
const taskHasSourceDocument = computed(() => Boolean(taskDraft.value.sourceCode));
const taskHasDownstreamDocuments = computed(() => taskRelatedWorkOrders.value.length > 0 || taskRelatedMaterialRequests.value.length > 0);
const taskStructureIsEditable = computed(() =>
  taskIsEditable.value
  && !taskHasSourceDocument.value
  && !taskHasDownstreamDocuments.value,
);
const taskConfirmedEdit = computed(() => {
  if (!isTaskDocument.value || !isProductionEditDocument.value) return false;
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  return !/草稿|draft/i.test(text(raw?.documentStatus || raw?.status, ''));
});
const taskSourceDocumentLabel = computed(() => taskSourceDocumentDisplay(taskDraft.value));
const taskSourceDocumentRoute = computed(() => taskSourceRoute(taskDraft.value));
const taskHasMaterialShortage = computed(() => taskMaterialReadyRows.value.some((row) => row.status === '需采购'));
const taskMaterialRequestAction = computed(() => {
  if (!canWriteProduction.value
    || !isTaskDocument.value
    || isProductionEditableDocument.value
    || taskLifecycleStatusLabel.value === '草稿'
    || taskHasCompletedRelease.value) return null;

  const existingRequest = taskRelatedMaterialRequests.value.find((request) => !/已取消|已作废/.test(text((request as AnyRecord).status, '')));
  if (existingRequest) {
    return {
      mode: 'view' as const,
      label: '查看申请',
      title: `查看已有备料申请 ${text((existingRequest as AnyRecord).code)}`,
      code: text((existingRequest as AnyRecord).code),
    };
  }
  if (!taskHasMaterialShortage.value) return null;
  return {
    mode: 'new' as const,
    label: '新建申请',
    title: '按当前生产任务未覆盖缺口发起备料申请',
    code: '',
  };
});
const taskWorkOrderReleaseCapacity = computed(() => materialProducibleQty(taskEffectiveMaterialNeeds.value, taskDemandTotal.value));
const taskWorkOrderReleaseSummary = computed(() => {
  if (taskLifecycleStatusLabel.value === '草稿') return '提交后核定';
  if (taskHasCompletedRelease.value) return '已全部安排';
  if (taskMaterialPlanningBlockers.value.length) return '待配置配方';
  if (taskProductRows.value.filter((line) => toNumber(line.demandQty) > 0).length > 1) return '按成品分别核定';
  if (!taskMaterialReadyRows.value.length || taskDemandTotal.value <= 0) return '待计算';
  const capacity = taskWorkOrderReleaseCapacity.value;
  if (capacity <= 0) return `可安排 ${qty(0, taskPrimaryUnit.value)}`;
  if (capacity < taskDemandTotal.value) return `可安排 ${qty(capacity, taskPrimaryUnit.value)}`;
  return '可全部安排';
});
const taskWorkOrderReleaseSummaryClass = computed(() => {
  if (taskLifecycleStatusLabel.value === '草稿'
    || taskProductRows.value.filter((line) => toNumber(line.demandQty) > 0).length > 1) return 'status-neutral';
  if (taskHasCompletedRelease.value || taskWorkOrderReleaseCapacity.value > 0) return 'status-success';
  return 'status-warning';
});
const taskWorkOrderEmptyMessage = computed(() =>
  taskLifecycleStatusLabel.value === '草稿'
    ? '任务提交确认后，才能按成品明细创建生产工单。'
    : taskMaterialPlanningBlockers.value.length
      ? '当前成品尚无唯一启用配方，请先完成配方配置，再创建生产工单。'
      : '当前任务还没有生产工单，请先根据成品、数量、配方和工艺创建工单。',
);
const materialRequestLines = computed(() => materialRequestDraft.value.lines);
const materialRequestPurchaseTotal = computed(() => sumNumbers(materialRequestLines.value.map((line) => toNumber(line.purchaseQty))));
const materialRequestPrimaryUnit = computed(() => materialRequestLines.value[0]?.unit || '件');
const materialRequestRequestedSummary = computed(() => materialRequestQuantitySummary(materialRequestLines.value, 'requestedQty'));
const materialRequestTaskRequiredSummary = computed(() => materialRequestQuantitySummary(materialRequestLines.value, 'taskEstimatedQty'));
const materialRequestEditorRequestedSummary = computed(() =>
  materialRequestIsEditable.value && materialRequestLines.value.every((line) => toNumber(line.requestedQty) <= 0)
    ? '待填写'
    : materialRequestRequestedSummary.value,
);
const materialRequestEvaluationPending = computed(() =>
  /草稿|待系统评估/.test(materialRequestDraft.value.status),
);
const materialRequestPurchaseSummary = computed(() => {
  if (!materialRequestLines.value.length) return '暂无明细';
  if (materialRequestDraft.value.status === '草稿') return '尚未提交';
  if (materialRequestEvaluationPending.value) return '系统评估中';
  return materialRequestPurchaseTotal.value > 0
    ? `采购缺口 ${qty(materialRequestPurchaseTotal.value, materialRequestPrimaryUnit.value)}`
    : '库存可覆盖';
});
const materialRequestLifecycleStatusLabel = computed(() => materialRequestLifecycleStatus(materialRequestDraft.value.status));
const materialRequestStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const coverageStatus = materialRequestDraft.value.status === '草稿'
    ? '未提交'
    : materialRequestEvaluationPending.value
      ? '评估中'
      : materialRequestPurchaseTotal.value > 0
        ? '存在采购缺口'
        : '库存可覆盖';
  const procurementStatus = materialRequestDraft.value.status === '草稿'
    ? '未提交'
    : materialRequestEvaluationPending.value
      ? '评估中'
      : materialRequestDraft.value.linkedPurchaseRequisition
        ? '已生成采购需求'
        : materialRequestPurchaseTotal.value > 0
          ? '待系统重试'
          : '无需采购';
  return [
    {
      key: 'coverage',
      label: '库存评估',
      value: coverageStatus,
      detail: materialRequestDraft.value.status === '草稿' ? undefined : '可用库存计划快照，不预留、不占用',
      kind: 'status',
    },
    {
      key: 'procurement',
      label: '采购处理',
      value: procurementStatus,
      detail: materialRequestDraft.value.linkedPurchaseRequisition
        || (materialRequestPurchaseTotal.value > 0 ? materialRequestPurchaseSummary.value : undefined),
      kind: 'status',
    },
    {
      key: 'quantity',
      label: materialRequestDraft.value.sourceTaskCode ? '缺口申请量' : '申请数量',
      value: materialRequestRequestedSummary.value,
      kind: 'metric',
    },
    { key: 'lines', label: '物料明细', value: `${materialRequestLines.value.length} 项`, kind: 'metric' },
  ];
});
function workOrderTaskDemandEffectiveRecipe(task: AnyRecord, line: TaskProductDraftLine) {
  if (!recipeRuntimeHasSnapshot.value) return undefined;
  const explicitCode = text(line.recipeCode, text(task.recipeCode, ''));
  const candidates = (production2Recipes as AnyRecord[]).filter((recipe) => (
    text(recipe.productCode, '') === line.productCode
    && text(recipe.status, '') === '启用'
  ));
  if (explicitCode) return candidates.find((recipe) => text(recipe.code, '') === explicitCode);
  return candidates.length === 1 ? candidates[0] : undefined;
}

const workOrderTaskDemandOptions = computed(() => {
  void productionDataRevision.value;
  const hasSelectedDemand = workOrderDraft.value.sourceAllocations.length > 0;
  const selectedKeys = new Set(workOrderDraft.value.sourceAllocations.map((allocation) => `${allocation.taskCode}::${allocation.sourceLineId}`));
  return (production2Tasks as AnyRecord[]).flatMap((task) => {
    const taskCode = text(task.code, '');
    const lifecycle = taskLifecycleStatusForProducts(task, workOrderTaskSourceLines(task), taskCode);
    if (lifecycle === '草稿' || lifecycle === '已作废') return [];
    return workOrderTaskSourceLines(task).flatMap((line) => {
      const key = `${taskCode}::${line.lineId}`;
      const recipe = workOrderTaskDemandEffectiveRecipe(task, line);
      const recipeCode = text(recipe?.code, '');
      const compatible = !hasSelectedDemand || (
        line.productCode === workOrderDraft.value.productCode
        && line.unit === workOrderDraft.value.unit
        && (!recipeCode || !workOrderDraft.value.recipeCode || recipeCode === workOrderDraft.value.recipeCode)
      );
      const availableQty = workOrderSourceAvailableQtyFor(taskCode, line);
      return compatible && availableQty > 0.0001 && !selectedKeys.has(key)
        ? [{ key, task, taskCode, line, availableQty, recipe }]
        : [];
    });
  });
});
const workOrderSelectableTaskDemandCount = computed(() => workOrderTaskDemandOptions.value.filter((option) => option.recipe).length);
const workOrderBlockedTaskDemandCount = computed(() => workOrderTaskDemandOptions.value.length - workOrderSelectableTaskDemandCount.value);
const workOrderTaskDemandPickerOptions = computed(() => workOrderTaskDemandOptions.value.map((option) => ({
  key: option.key,
  taskCode: option.taskCode,
  source: taskSourceCode(option.task) || '独立生产需求',
  productName: option.line.productName,
  productCode: option.line.productCode,
  available: qty(option.availableQty, option.line.unit),
  dueDate: text(option.task.deliveryDate, '—'),
  recipeReady: Boolean(option.recipe),
})));
const workOrderTaskDemandSelectionLocked = computed(() =>
  productionRuntimeDataLoading.value
  || !productionRuntimeDataHasSnapshot.value
  || Boolean(productionRuntimeDataError.value)
  || recipeRuntimeLoading.value
  || !recipeRuntimeHasSnapshot.value
  || Boolean(recipeRuntimeError.value),
);
const workOrderSourceAllocationSummary = computed(() => {
  const allocations = workOrderDraft.value.sourceAllocations;
  if (!allocations.length) return '尚未添加任务需求';
  const taskCount = new Set(allocations.map((allocation) => allocation.taskCode).filter(Boolean)).size;
  return `${taskCount} 个任务 · ${allocations.length} 条需求 · 本工单 ${qty(toNumber(workOrderDraft.value.planQty), workOrderDraft.value.unit)}`;
});
const workOrderDraftProductIdentity = computed(() => {
  const allocation = workOrderDraft.value.sourceAllocations[0];
  const sourceLine = allocation ? workOrderDemandLineForAllocation(allocation) : undefined;
  return {
    name: text(workOrderDraft.value.productName, sourceLine?.productName || '待任务需求确定'),
    code: text(workOrderDraft.value.productCode, sourceLine?.productCode || ''),
    model: text(sourceLine?.model, ''),
    spec: text(sourceLine?.spec, ''),
  };
});
const workOrderRecipeOptions = computed(() =>
  recipeRuntimeHasSnapshot.value ? production2Recipes.filter((recipe) => {
    const raw = recipe as AnyRecord;
    return text(raw.productCode, '') === workOrderDraft.value.productCode
      && (text(raw.status, '') === '启用' || text(raw.code, '') === workOrderDraft.value.recipeCode);
  }) as AnyRecord[] : [],
);
const workOrderSelectedRecipe = computed(() =>
  recipeRuntimeHasSnapshot.value
    ? production2Recipes.find((recipe) => text(recipe.code, '') === workOrderDraft.value.recipeCode) as AnyRecord | undefined
    : undefined,
);
function workOrderProcessTemplateMatchesProductFamily(template: AnyRecord, productCode: string) {
  const normalizedProductCode = productCode.toUpperCase();
  const normalizedFamily = text(template.productFamily, '').toUpperCase();
  if (normalizedProductCode.includes('PETG')) return normalizedFamily.includes('PETG');
  if (normalizedProductCode.includes('PLA')) return !normalizedFamily.includes('PETG');
  return true;
}
const workOrderProcessOptions = computed(() => {
  if (!processTemplateRuntimeHasSnapshot.value || !workOrderDraft.value.productCode) return [];
  return (production2ProcessTemplates as AnyRecord[])
    .filter((template) => {
      const code = text(template.code, '');
      return (text(template.status, '') === '启用' || code === workOrderDraft.value.processTemplateCode)
        && (code === workOrderDraft.value.processTemplateCode || workOrderProcessTemplateMatchesProductFamily(template, workOrderDraft.value.productCode));
    })
    .sort((a, b) => text(a.code, '').localeCompare(text(b.code, ''), 'zh-CN'));
});
const workOrderSelectedProcessTemplate = computed(() =>
  processTemplateRuntimeHasSnapshot.value
    ? production2ProcessTemplates.find((template) => text(template.code, '') === workOrderDraft.value.processTemplateCode) as AnyRecord | undefined
    : undefined,
);
const productionWriteTrustMessage = computed(() => {
  if (!isProductionEditableDocument.value) return '';
  if (activePage.value === 'work-orders') {
    if (productionRuntimeDataLoading.value && !productionRuntimeDataHasSnapshot.value) return '正在读取服务端生产任务，请稍候。';
    if (productionRuntimeDataError.value || !productionRuntimeDataHasSnapshot.value) return productionRuntimeDataError.value || '生产任务尚未完成可信加载，不能保存或提交工单。';
    if (recipeRuntimeLoading.value && !recipeRuntimeHasSnapshot.value) return '正在读取服务端配方版本，请稍候。';
    if (recipeRuntimeError.value || !recipeRuntimeHasSnapshot.value) return recipeRuntimeError.value || '配方版本尚未完成可信加载，不能保存或提交工单。';
    if (processTemplateRuntimeLoading.value && !processTemplateRuntimeHasSnapshot.value) return '正在读取服务端工艺版本，请稍候。';
    if (processTemplateRuntimeError.value || !processTemplateRuntimeHasSnapshot.value) return processTemplateRuntimeError.value || '工艺版本尚未完成可信加载，不能保存或提交工单。';
  }
  if (['tasks', 'material-requests'].includes(activePage.value)
    && (productionRuntimeDataError.value || !productionRuntimeDataHasSnapshot.value)) {
    return productionRuntimeDataError.value || '生产运行数据尚未完成可信加载，当前不能写入。';
  }
  if (activePage.value === 'recipes' && (recipeRuntimeError.value || !recipeRuntimeHasSnapshot.value)) {
    return recipeRuntimeError.value || '生产配方目录尚未完成可信加载，当前不能写入。';
  }
  if (activePage.value === 'process-templates' && (processTemplateRuntimeError.value || !processTemplateRuntimeHasSnapshot.value)) {
    return processTemplateRuntimeError.value || '生产工艺目录尚未完成可信加载，当前不能写入。';
  }
  return '';
});
const workOrderDraftRecipePreviewRows = computed<WorkOrderRecipeSnapshotRow[]>(() => {
  const recipe = workOrderSelectedRecipe.value;
  return recipe
    ? buildWorkOrderRecipeSnapshotRows({ planQty: workOrderDraft.value.planQty, unit: workOrderDraft.value.unit }, recipe)
    : [];
});
const workOrderDraftProcessPreviewZones = computed(() =>
  workOrderSelectedProcessTemplate.value ? workOrderProcessZones(workOrderSelectedProcessTemplate.value) : [],
);
const workOrderDraftProcessPreviewSteps = computed<WorkOrderProcessSnapshotStepRow[]>(() => {
  const template = workOrderSelectedProcessTemplate.value;
  return template ? buildWorkOrderProcessSnapshotSteps({}, template) : [];
});
const workOrderDraftCheckMessage = computed(() => workOrderDraftBlockingMessage());
const workOrderDraftCheckItems = computed(() => {
  const allocations = workOrderDraft.value.sourceAllocations;
  const taskCount = new Set(allocations.map((allocation) => allocation.taskCode).filter(Boolean)).size;
  return [
    {
      label: '任务需求',
      value: allocations.length ? `${taskCount} 个任务 · ${allocations.length} 条需求` : '待选择',
    },
    {
      label: '成品与数量',
      value: workOrderDraft.value.productCode
        ? `${workOrderDraft.value.productName} · ${qty(workOrderDraft.value.planQty, workOrderDraft.value.unit)}`
        : '待任务需求确定',
    },
    {
      label: '生产标准',
      value: workOrderSelectedRecipe.value && workOrderSelectedProcessTemplate.value ? '已绑定' : '待绑定',
    },
  ];
});
const workOrderReadonlyRaw = computed(() => {
  if (activePage.value !== 'work-orders' || workOrderIsEditable.value) return undefined;
  return currentProductionDocument.value?.raw as AnyRecord | undefined;
});
const workOrderReadonlyProductIdentity = computed(() => {
  const raw = workOrderReadonlyRaw.value;
  const sourceTask = workOrderSourceTaskFromRaw(raw);
  const sourceLine = workOrderTaskSourceLines(sourceTask).find((line) => (
    line.lineId === text(raw?.sourceLineId, '') || line.productCode === text(raw?.productCode, '')
  ));
  return {
    name: text(raw?.productName, sourceLine?.productName || '-'),
    code: text(raw?.productCode, sourceLine?.productCode || ''),
    model: text(sourceLine?.model, ''),
    spec: text(sourceLine?.spec, ''),
  };
});
const executionCardReadonlyRaw = computed(() => {
  if (activePage.value !== 'execution-cards' || isProductionEditableDocument.value) return undefined;
  return currentProductionDocument.value?.raw as AnyRecord | undefined;
});
const executionCardReadonlyProductIdentity = computed(() => {
  const raw = executionCardReadonlyRaw.value;
  const sourceWorkOrder = raw ? executionCardSourceWorkOrder(raw) : undefined;
  const sourceTask = workOrderSourceTaskFromRaw(sourceWorkOrder);
  const sourceLine = workOrderTaskSourceLines(sourceTask).find((line) => (
    line.lineId === text(sourceWorkOrder?.sourceLineId, '') || line.productCode === text(raw?.productCode, '')
  ));
  return {
    name: text(raw?.productName, sourceWorkOrder?.productName || sourceLine?.productName || '-'),
    code: text(raw?.productCode, sourceWorkOrder?.productCode || sourceLine?.productCode || ''),
    model: text(sourceLine?.model, ''),
    spec: text(sourceLine?.spec, ''),
  };
});
const workOrderReadonlySnapshot = computed(() => {
  const raw = workOrderReadonlyRaw.value;
  return raw ? workOrderStoredSnapshot(raw) : undefined;
});
const workOrderReadonlyRecipe = computed(() => {
  void productionDataRevision.value;
  const raw = workOrderReadonlyRaw.value;
  return raw ? workOrderRecipeSnapshot(raw) : undefined;
});
const workOrderReadonlyProcess = computed(() => {
  void productionDataRevision.value;
  const raw = workOrderReadonlyRaw.value;
  return raw ? workOrderProcessSnapshot(raw) : undefined;
});
const workOrderSnapshotIsFrozen = computed(() =>
  text(workOrderReadonlySnapshot.value?.snapshotStatus || workOrderReadonlyRaw.value?.snapshotStatus, '') === 'server_frozen',
);
const workOrderRecipeSnapshotRows = computed<WorkOrderRecipeSnapshotRow[]>(() => {
  const raw = workOrderReadonlyRaw.value;
  const recipe = workOrderReadonlyRecipe.value;
  return raw && recipe ? buildWorkOrderRecipeSnapshotRows(raw, recipe) : [];
});
const workOrderProcessSnapshotZones = computed(() =>
  workOrderProcessZones(workOrderReadonlyProcess.value),
);
const workOrderProcessSnapshotSteps = computed<WorkOrderProcessSnapshotStepRow[]>(() => {
  const raw = workOrderReadonlyRaw.value;
  const template = workOrderReadonlyProcess.value;
  return raw && template ? buildWorkOrderProcessSnapshotSteps(raw, template) : [];
});
const recipeLineCalculations = computed(() =>
  recipeDraft.value.materials.map((line) => {
    const usageMode = recipeLineUsageMode(line);
    const percent = usageMode === 'percent' ? toNumber(line.percent) : 0;
    const perUnitQty = usageMode === 'fixed' ? toNumber(line.perUnitQty) : 0;
    const baseQty = usageMode === 'percent' ? recipeBaseKgForPercent(recipeDraft.value.productUnitWeightKg, percent) : perUnitQty;
    return {
      lineId: line.lineId,
      materialCode: line.materialCode,
      usageMode,
      percent,
      perUnitQty,
      baseKg: usageMode === 'percent' ? baseQty : 0,
      baseQty,
      requiredKg: baseQty,
      requiredQty: baseQty,
    };
  }),
);
const recipePercentMaterials = computed(() =>
  recipeDraft.value.materials
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => recipeLineUsageMode(line) === 'percent'),
);
const recipeFixedMaterials = computed(() =>
  recipeDraft.value.materials
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => recipeLineUsageMode(line) === 'fixed'),
);
const recipePercentLineCount = computed(() =>
  recipeLineCalculations.value.filter((line) => line.usageMode === 'percent' && Boolean(line.materialCode)).length,
);
const recipeFixedLineCount = computed(() =>
  recipeLineCalculations.value.filter((line) => line.usageMode === 'fixed' && Boolean(line.materialCode)).length,
);
const recipePercentTotal = computed(() =>
  sumNumbers(
    recipeLineCalculations.value
      .filter((line) => line.usageMode === 'percent' && Boolean(line.materialCode))
      .map((line) => line.percent),
  ),
);
const recipePercentTotalIsBalanced = computed(() => Math.abs(recipePercentTotal.value - 100) < 0.001);
const recipePercentTotalTitle = computed(() => {
  if (!recipePercentLineCount.value) return '添加投料物料后显示占比合计';
  if (recipePercentTotalIsBalanced.value) return '当前投料占比合计为 100%';
  return `当前投料占比合计为 ${formatPercent(recipePercentTotal.value)}，仅作核对提示，不阻断草稿保存`;
});
const recipeEstimatedLossCount = computed(() => recipeDraft.value.estimatedLosses.filter((line) => Boolean(line.materialCode)).length);
const recipeProductDisplay = computed(() => productIdentity(recipeDraft.value.productCode, recipeDraft.value.productName, '选择产出物料'));
const recipeProductSelectionLocked = computed(() => (
  isProductionNewDocument.value
  && Boolean(route.query.copy)
  && Boolean(recipeDraft.value.sourceRecipeCode)
  && Boolean(recipeDraft.value.productCode)
));
const recipeProductVersionRows = computed(() => recipeRowsForProduct(recipeDraft.value.productCode));
const recipeProductVersionCount = computed(() => recipeProductVersionRows.value.length);
const recipeProductEnabledRows = computed(() => recipeProductVersionRows.value.filter((row) => recipeEffectiveRecipeStatus(row) === '启用'));
const recipeProductEnabledVersionLabel = computed(() => {
  if (!recipeDraft.value.productCode) return '—';
  if (!recipeProductEnabledRows.value.length) return '暂无启用版本';
  return recipeProductEnabledRows.value
    .map((row) => `${recipeEffectiveRecipeVersion(row)}${recipeIsCurrentRecipeRow(row) ? '（当前）' : ''}`)
    .join('、');
});
const recipeActivationConflictRow = computed(() => recipeEnabledConflictRow());
const recipeActivationConflictMessage = computed(() => {
  const row = recipeActivationConflictRow.value;
  if (!row) return '';
  return `该产出物料已有启用配方 ${text(row.version)}（${text(row.code)}），请先停用原版本后再启用当前版本`;
});
const recipeVersionRuleMessage = computed(() => {
  if (!recipeDraft.value.productCode) return '选择产出物料后自动核对版本。';
  return recipeActivationConflictMessage.value || '同一产出物料只能启用 1 个配方版本。';
});
const taskSubmitBlockingMessage = computed(() => taskDraftBlockingMessage());
const materialRequestSubmitBlockingMessage = computed(() => materialRequestDraftBlockingMessage());
const workOrderSubmitBlockingMessage = computed(() => workOrderDraftBlockingMessage());
const recipeSubmitBlockingMessage = computed(() => recipeDraftBlockingMessage());
const processTemplateLineTypesText = computed({
  get: () => processTemplateDraft.value.lineTypes.join('、'),
  set: (value: string) => {
    processTemplateDraft.value.lineTypes = value
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
});
const processTemplateFamilyVersionRows = computed(() => {
  const name = processTemplateDraft.value.name.trim();
  if (!name) return [];
  return production2ProcessTemplates.filter((row) => text(row.name, '').trim() === name);
});
const processTemplateEnabledVersionRows = computed(() =>
  processTemplateFamilyVersionRows.value.filter((row) => text(row.status, '') === '启用'),
);
const processTemplateActivationConflictRow = computed(() =>
  processTemplateEnabledVersionRows.value.find((row) => text(row.code, '') !== processTemplateDraft.value.code),
);
const processTemplateActivationConflictMessage = computed(() => {
  const row = processTemplateActivationConflictRow.value;
  if (!row) return '';
  return `该工艺已有启用版本 ${text(row.version)}（${text(row.code)}），请先停用原版本后再启用当前版本`;
});
const processTemplateSubmitBlockingMessage = computed(() => processTemplateDraftBlockingMessage());
const taskDocumentBasicFacts = computed<DetailFact[]>(() => {
  const facts: DetailFact[] = [
    {
      label: '需求来源',
      value: taskSourceDocumentLabel.value,
      route: taskSourceDocumentRoute.value,
    },
    { label: '负责人', value: taskDraft.value.owner || '-' },
    { label: '优先级', value: taskDraft.value.priority || '-' },
    { label: '创建时间', value: taskDraft.value.createdAt || '-' },
    { label: '交期', value: taskDraft.value.deliveryDate || '-' },
  ];
  const supplementaryRequirement = text(taskDraft.value.supplementaryRequirement, '').trim();
  const note = text(taskDraft.value.note, '').trim();
  if (supplementaryRequirement) facts.push({ label: '补充要求', value: supplementaryRequirement, full: true, multiline: true });
  if (note) facts.push({ label: '任务备注', value: note, full: true, multiline: true });
  return facts;
});
const materialRequestDocumentBasicFacts = computed<DetailFact[]>(() => {
  const facts: DetailFact[] = [{ label: '申请类型', value: materialRequestDraft.value.requestType || '-' }];
  if (materialRequestDraft.value.sourceTaskCode) {
    facts.push({
      label: '来源任务',
      value: materialRequestDraft.value.sourceTaskCode,
      route: `/production/tasks/${encodeURIComponent(materialRequestDraft.value.sourceTaskCode)}`,
    });
  }
  if (materialRequestDraft.value.sourceDocument && materialRequestDraft.value.sourceDocument !== '无') {
    facts.push({ label: '需求来源', value: materialRequestDraft.value.sourceDocument });
  }
  facts.push(
    { label: '需求部门', value: materialRequestDraft.value.department || '-' },
    { label: '申请人', value: materialRequestDraft.value.requester || '-' },
    { label: '申请日期', value: materialRequestDraft.value.requestDate || '-' },
    { label: '需求日期', value: materialRequestDraft.value.expectedDate || '-' },
  );
  const note = text(materialRequestDraft.value.note, '').trim();
  if (note) facts.push({ label: '备注', value: note, full: true, multiline: true });
  return facts;
});
const recipeDocumentBasicFacts = computed<DetailFact[]>(() => {
  const facts: DetailFact[] = [
    { label: '配方编号', value: recipeDraft.value.code || '-' },
    { label: '版本号', value: recipeDraft.value.version || '-' },
    { label: '维护人', value: recipeDraft.value.owner || '未记录' },
    { label: '更新日期', value: recipeDraft.value.updatedAt || '未记录' },
  ];
  if (recipeDraft.value.sourceRecipeCode) {
    facts.splice(2, 0, {
      label: '来源版本',
      value: recipeDraft.value.sourceRecipeCode,
      route: `/production/recipes/${encodeURIComponent(recipeDraft.value.sourceRecipeCode)}`,
    });
  }
  const note = text(recipeDraft.value.note, '').trim();
  if (note) facts.push({ label: '备注', value: note, full: true, multiline: true });
  return facts;
});
const processStepActions = computed(() => processStepDraft.value.actions);
const processStepBlockingActionCount = computed(() => processStepActions.value.filter((action) => action.blocking).length);
const processStepQcActionCount = computed(() => processStepActions.value.filter((action) => action.actor === '质检').length);
const processStepBoundStageUsageLabels = computed(() => (
  ['直接收卷', '大盘复绕'] as ProcessTemplateDraft['routeType'][]
).flatMap((routeType) => processTemplateRouteStepCodes(routeType)
  .filter((stepCode) => production2ProcessSteps
    .find((step) => step.code === stepCode)
    ?.actionCodes.includes(processStepDraft.value.code))
  .map((stepCode) => `${routeType} · ${processTemplateStepName(stepCode, routeType)}`)));
const processStepDocumentBasicFacts = computed<DetailFact[]>(() => [
  { label: '动作编号', value: processStepDraft.value.code || '-' },
  { label: '负责部门', value: processStepDraft.value.ownerDomain || '-' },
  { label: '执行方式', value: processStepDraft.value.executionMode || '-' },
  { label: '完成方式', value: processStepDraft.value.completionMode || '-' },
  { label: '重复规则', value: processStepDraft.value.repeatPolicy || '-' },
  { label: '阻断规则', value: processStepDraft.value.blockingPolicy || '-' },
  {
    label: '适用路线/阶段',
    value: processStepBoundStageUsageLabels.value.join('；') || '未绑定标准路线',
    full: true,
    multiline: true,
  },
]);
const processStepDocumentContractFacts = computed<DetailFact[]>(() => [
  {
    label: processStepDraft.value.executionMode === '人工操作' ? '可执行条件' : '自动触发条件',
    value: processStepDraft.value.trigger || '-',
    full: true,
    multiline: true,
  },
  { label: '执行结果', value: processStepDraft.value.result || '-', full: true, multiline: true },
  { label: '现场入口', value: processStepDraft.value.entryLabel || '无需人工入口' },
  { label: '重复执行控制', value: processStepDraft.value.idempotencyScope || '-', multiline: true },
  { label: '必要输入', value: processStepDraft.value.requiredInputs.join('、') || '-', multiline: true },
  { label: '直接产生', value: processStepDraft.value.emittedEvents.join('、') || '-', multiline: true },
  { label: '完成依据', value: processStepDraft.value.completionSignal || '-', multiline: true },
  { label: '失败处理', value: processStepDraft.value.failureRule || '-', full: true, multiline: true },
]);
const processTemplateDocumentBasicFacts = computed<DetailFact[]>(() => [
  { label: '工艺编号', value: processTemplateDraft.value.code || '-' },
  { label: '生产路线', value: processTemplateDraft.value.routeType || '-' },
  { label: '适用产品族', value: processTemplateDraft.value.productFamily || '-' },
  { label: '版本号', value: processTemplateDraft.value.version || '-' },
  { label: '适用产线', value: processTemplateDraft.value.lineTypes.join('、') || '未限定' },
  ...(processTemplateDraft.value.sourceProcessTemplateCode
    ? [{
        label: '来源版本',
        value: processTemplateDraft.value.sourceProcessTemplateCode,
        route: `/production/process-templates/${encodeURIComponent(processTemplateDraft.value.sourceProcessTemplateCode)}`,
      }]
    : []),
]);
const processTemplateVersionIdentityLocked = computed(() => (
  isProductionNewDocument.value
  && Boolean(route.query.copy)
  && Boolean(processTemplateDraft.value.sourceProcessTemplateCode)
));

const pageHeading = computed(() => {
  if (isProductionNewDocument.value) {
    if (activePage.value === 'recipes' && route.query.copy) return '创建配方新版本';
    if (activePage.value === 'process-templates' && route.query.copy) return '创建工艺新版本';
    return `新建${activeListTitle.value}`;
  }
  if (isProductionEditDocument.value && productionDocumentIsReadOnlyView.value) return `${activeListTitle.value}详情`;
  if (isProductionEditDocument.value) return `${isProductionRuleDocument.value ? '编辑' : '变更'}${activeListTitle.value}`;
  return `${activeListTitle.value}详情`;
});
const productionTopbarContextTitle = computed(() => {
  if (!productionDocumentIsReadOnlyView.value) return pageHeading.value;
  if (activePage.value === 'recipes') {
    const title = recipeDraft.value.productName || currentProductionDocument.value?.title || '生产配方';
    return recipeDraft.value.version ? `${title} · ${recipeDraft.value.version}` : title;
  }
  if (activePage.value === 'process-templates') {
    const title = processTemplateDraft.value.name || currentProductionDocument.value?.title || '生产工艺';
    return processTemplateDraft.value.version ? `${title} · ${processTemplateDraft.value.version}` : title;
  }
  if (activePage.value === 'process-steps') {
    return processStepDraft.value.name || currentProductionDocument.value?.title || '系统动作';
  }
  return currentProductionDocument.value?.code || pageHeading.value;
});
const productionDocumentSubtitle = computed(() => {
  const row = currentProductionDocument.value;
  const raw = row?.raw as AnyRecord | undefined;
  if (!row || !raw) return '';
  if (activePage.value === 'work-orders' && workOrderIsEditable.value) {
    return `${workOrderDraft.value.code || '新建生产工单'} · ${workOrderDraft.value.productName || '待选择成品'}`;
  }
  if (activePage.value === 'work-orders') return `${text(raw.code)} · ${text(raw.productName)}`;
  if (activePage.value === 'execution-cards') return `${text(raw.code)} · ${text(raw.productName)}`;
  if (activePage.value === 'quality') return `${text(raw.code)} · ${text(raw.kind)}`;
  return row.subtitle;
});

const createButtonLabel = computed(() => activePageConfig.value.createLabel);
const statusColumnTitle = computed(() => activePageConfig.value.statusColumnTitle);
const showProductionListStatusColumn = computed(() => !isProductionRecordDocument.value && activePage.value !== 'process-steps');
const productionStatusOverviewPages = new Set<ProductionPage>(['tasks', 'work-orders', 'execution-cards']);
const showProductionStatusOverview = computed(() => productionStatusOverviewPages.has(activePage.value));
const productionStatusDimensionLabels = computed(() => ({
  tasks: '工单 · 安排 · 入库 · 物料',
  'work-orders': '安排 · 生产 · 入库',
  'execution-cards': '物料 · 报工 · 质检 · 包装',
} as Partial<Record<ProductionPage, string>>)[activePage.value] || '');
const productionStatusSortLabel = computed(() => activePage.value === 'tasks'
  ? '交期优先'
  : activePage.value === 'work-orders'
    ? '当前待办优先'
    : activePage.value === 'execution-cards'
      ? '现场关注优先'
    : activePage.value === 'exceptions'
      ? '未关闭优先'
      : '状态优先');
const productionNewestSortLabel = computed(() => activePage.value === 'work-orders'
  ? '要求日期从晚到早'
  : activePage.value === 'tasks' ? '交期从晚到早' : '');
const productionOldestSortLabel = computed(() => activePage.value === 'work-orders'
  ? '要求日期从早到晚'
  : activePage.value === 'tasks' ? '交期从早到晚' : '');
const showListSort = computed(() => activePage.value !== 'process-steps');
// Only expose quantity sorting where every row shares a comparable dimension.
// Task, request, work-order and batch quantities may mix kg / roll / piece, so a
// numeric sort across documents would look precise while carrying no business meaning.
const showAmountSort = computed(() => amountSortableProductionPages.has(activePage.value));
const showStatusSort = computed(() => activePage.value !== 'process-steps');
const filterDateLabel = computed(() => activePage.value === 'process-steps' ? '' : activePageConfig.value.dateLabel);
const sortAmountLabel = computed(() => activePageConfig.value.amountLabel);

const filterFields = computed<FilterField[]>(() => {
  const partyLabel = ({
    tasks: '需求来源',
    'material-requests': '需求部门',
    'work-orders': '任务需求',
    'execution-cards': '来源工单',
    quality: '产线',
    'quality-standards': '适用对象',
    recipes: '产出物料',
    'process-templates': '适用产品族',
    'process-steps': '负责部门',
    'loss-ledger': '产线',
    exceptions: '来源对象',
  } as Record<ProductionPage, string>)[activePage.value];
  const ownerLabel = ({
    tasks: '负责人',
    'material-requests': '申请人',
    'execution-cards': '班组负责人',
    quality: '检验员',
    'quality-standards': '维护人',
    recipes: '维护人',
    'process-templates': '维护人',
    'process-steps': '执行方式',
    'loss-ledger': '责任人',
    exceptions: '记录人',
  } as Partial<Record<ProductionPage, string>>)[activePage.value] || '';
  const responsibilityAndMode: FilterField[] = [
    {
      key: 'party',
      label: partyLabel,
      options: uniqueOptions(allProductionRows.value.map((row) => row.party)),
    },
    {
      key: 'owner',
      label: ownerLabel,
      options: uniqueOptions(allProductionRows.value.map((row) => row.owner)),
    },
  ];
  if (activePage.value === 'work-orders') responsibilityAndMode.splice(1, 1);
  if (activePage.value === 'loss-ledger' && responsibilityAndMode[1]?.options.length === 0) {
    responsibilityAndMode.splice(1, 1);
  }
  if (activePage.value === 'process-steps') return responsibilityAndMode;
  const fields: FilterField[] = [
    {
      key: 'status',
      label: activePage.value === 'work-orders' ? '当前待办' : statusColumnTitle.value,
      options: uniqueOptions(allProductionRows.value.map((row) => productionFilterStatus(row))),
    },
    ...responsibilityAndMode,
  ];
  if (activePage.value === 'loss-ledger' && fields[0]?.options.length <= 1) fields.splice(0, 1);
  return fields;
});

const activeFilterCount = computed(() => (
  activePage.value === 'process-steps'
    ? [draftFilterParty.value, draftFilterOwner.value]
    : [draftFilterStatus.value, draftFilterParty.value, draftFilterOwner.value, draftFilterDateStart.value, draftFilterDateEnd.value]
).filter(Boolean).length);
const hasListConstraints = computed(() => Boolean(searchKeyword.value.trim() || activeFilterCount.value));
const productionEmptyHint = computed(() => {
  if (hasListConstraints.value) return activePage.value === 'process-steps'
    ? '可以调整搜索或筛选条件后再查看。'
    : '可以调整搜索、排序或筛选条件后再查看。';
  if (activePage.value === 'process-steps') return '系统固定能力目录加载后会显示在这里。';
  if (activePage.value === 'loss-ledger') return '生产报工或质量处置形成实际损耗后会显示在这里。';
  if (activePage.value === 'material-requests') return '生产任务有新增采购缺口时从任务发起；临时或试产需求可使用“临时申请”。';
  return ({
    tasks: '销售需求生成或手工新建生产任务后会显示在这里。',
    'work-orders': '从生产任务创建，或手工新建生产工单后会显示在这里。',
    'execution-cards': '工单完成生产安排并进入执行后会生成生产批次。',
    quality: '生产节点触发检验任务后会显示在这里。',
    'quality-standards': '新建并保存质检标准后会显示在这里。',
    recipes: '新建并保存配方版本后会显示在这里。',
    'process-templates': '新建并保存工艺版本后会显示在这里。',
    exceptions: '现场报告异常或质量判定形成异常后会显示在这里。',
  } as Partial<Record<ProductionPage, string>>)[activePage.value] || '新建或流转后会显示在这里。';
});

const visibleProductionRows = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const isSystemActionList = activePage.value === 'process-steps';
  const rows = allProductionRows.value.filter((row) => {
    const matchesKeyword =
      !keyword ||
      [
        row.code,
        row.title,
        row.subtitle,
        text(row.raw.productCode, ''),
        text(row.raw.sourceDoc, ''),
        text(row.raw.sourceEvidenceCode, ''),
        text(row.raw.productionBatchCode, ''),
        text(row.raw.workOrderCode, ''),
        row.status,
        row.nextStep,
        activePage.value === 'work-orders' ? '' : row.owner,
        row.party,
        activePage.value === 'tasks' ? productionTaskDueAttention(row.raw) : '',
        activePage.value === 'work-orders' ? workOrderDueAttention(row.raw) : '',
        activePage.value === 'execution-cards' ? executionCardScheduleAttention(row.raw) : '',
        ...row.cells.flatMap((cell) => [cell.title, cell.subtitle || '']),
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    const matchesStatus = isSystemActionList || !draftFilterStatus.value || productionFilterStatus(row) === draftFilterStatus.value;
    const matchesParty = !draftFilterParty.value || row.party === draftFilterParty.value;
    const matchesOwner = activePage.value === 'work-orders' || !draftFilterOwner.value || row.owner === draftFilterOwner.value;
    const matchesDateStart = isSystemActionList || !draftFilterDateStart.value || row.date >= draftFilterDateStart.value;
    const matchesDateEnd = isSystemActionList || !draftFilterDateEnd.value || row.date <= draftFilterDateEnd.value;
    return matchesKeyword && matchesStatus && matchesParty && matchesOwner && matchesDateStart && matchesDateEnd;
  });

  if (isSystemActionList) return [...rows].sort((a, b) => toNumber(a.raw.sequence) - toNumber(b.raw.sequence));

  return [...rows].sort((a, b) => {
    if (sortMode.value === 'newest') return b.date.localeCompare(a.date);
    if (sortMode.value === 'oldest') return a.date.localeCompare(b.date);
    if (sortMode.value === 'amountDesc') return b.amountValue - a.amountValue;
    if (activePage.value === 'tasks') return productionTaskOperationalSort(a, b);
    if (activePage.value === 'work-orders') return workOrderOperationalSort(a, b);
    if (activePage.value === 'execution-cards') return executionCardOperationalSort(a, b);
    if (activePage.value === 'exceptions') return productionExceptionOperationalSort(a, b);
    return statusWeight(a.status) - statusWeight(b.status) || b.date.localeCompare(a.date);
  });
});

const productionStatusActionPrefix = computed(() =>
  activePage.value === 'tasks'
    ? '下一步'
    : isProductionRecordDocument.value
      ? '记录说明'
      : activePage.value === 'recipes'
        ? '版本动作'
        : isProductionRuleDocument.value
          ? '维护动作'
          : '下一步',
);
const productionDocumentPrimaryLabel = computed(() => {
  const row = currentProductionDocument.value;
  if (!row) return '提交';
  const raw = row.raw as AnyRecord;
  if (activePage.value === 'tasks') {
    if (taskLifecycleStatusLabel.value === '草稿') return '编辑草稿';
    if (taskMaterialPlanningBlockers.value.length) return '维护配方';
    if (row.nextStep.includes('创建生产工单') || row.nextStep.includes('继续创建剩余工单')) return '创建工单';
    if (row.nextStep.includes('质检')) return '等待来料质检';
    if (row.nextStep.includes('仓库入库') || row.nextStep.includes('在途')) return '等待采购入库';
    if (taskMaterialRequestAction.value?.mode === 'view') return '查看备料申请';
    if (taskMaterialRequestAction.value?.mode === 'new') return '发起备料申请';
    return taskRelatedWorkOrders.value.length ? '查看工单' : '创建工单';
  }
  if (activePage.value === 'material-requests') {
    if (materialRequestDraft.value.status === '草稿') return '编辑草稿';
    if (materialRequestDraft.value.status === '待系统评估') return '系统评估中';
    if (materialRequestDraft.value.linkedPurchaseRequisition) return '已交接采购';
    if (/库存可满足|已完成/.test(materialRequestDraft.value.status)) return '库存覆盖已确认';
    return '查看评估结果';
  }
  if (activePage.value === 'recipes') return recipeDraft.value.status === '草稿' ? '启用版本' : '创建新版本';
  if (activePage.value === 'process-templates') return processTemplateDraft.value.status === '草稿' ? '启用版本' : '创建新版本';
  if (activePage.value === 'exceptions') {
    if (isQualityProductionException(raw)) return productionExceptionQualityActionLabel(raw);
    if (text(raw.outcome) === '异常停机' && text(raw.status) !== '已关闭') return '解除停机';
    if (text(raw.type) === '缺料' && productionExceptionSourceTaskCode(raw)) return '查看物料储备';
    if (text(raw.executionCardCode || raw.relatedBatch, '')) return '查看生产批次';
    if (text(raw.relatedWorkOrder, '')) return '查看生产工单';
    if (text(raw.source, '').startsWith('PT2-')) return '查看生产任务';
    return '查看来源单据';
  }
  if (activePage.value === 'execution-cards') {
    const activeQualityDisposition = qualityTasksForExecutionCard(row.code)
      .find((task) => productionQualityTaskNeedsDisposition(task as unknown as AnyRecord));
    if (activeQualityDisposition) return productionQualityHandoffLabel(activeQualityDisposition as unknown as AnyRecord);
    if (activeProductionExceptionForExecutionCard(row.code)) return '查看异常';
    if (text(raw.status) === '已完成' && text(raw.node) === '已入库') return '仓库已完成入库';
    if (executionCardShortCloseNeedsResolution(raw)) return '处理剩余数量';
    const pendingQualityTask = qualityTasksForExecutionCard(row.code)
      .find((task) => productionQualityTaskIsPending(task as unknown as AnyRecord));
    if (pendingQualityTask) return productionQualityHandoffLabel(pendingQualityTask as unknown as AnyRecord);
    if (text(raw.node) === '待包装') return '确认包装';
    const fallbackQualityHandoff = executionCardQualityHandoffFromRaw(raw);
    if (fallbackQualityHandoff) return fallbackQualityHandoff;
    if (pendingProductionReceiptCode(row.code)) return '等待仓库入库';
    const operationJob = executionCardCurrentOperationJob(raw);
    if (operationJob && !['已完成', '已取消'].includes(operationJob.status)) return '去现场';
  }
  if (activePage.value === 'work-orders') {
    if (workOrderActionableProductionCard(row.code)) return '查看生产批次';
    const activeQualityDisposition = production2QualityTasks.find(
      (task) => task.workOrderCode === row.code
        && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
    );
    if (activeQualityDisposition) return productionQualityActionLabel(activeQualityDisposition as unknown as AnyRecord);
    if (activeProductionExceptionForWorkOrder(row.code)) return '查看异常';
    const releaseFacts = workOrderReleaseFacts(row.raw as AnyRecord);
    if (releaseFacts.unreleasedQty > 0 && releaseFacts.releasableQty <= 0) {
      if (/待质检|待检/.test(releaseFacts.blocker)) return '等待质检放行';
      if (releaseFacts.blocker.includes('待仓库入库')) return '等待采购入库';
      if (releaseFacts.blocker.includes('在途')) return '等待物料到货';
      return '等待物料补齐';
    }
    if (workOrderCanClose.value) return '关闭工单';
    if (workOrderLifecycleStatus.value === '已关闭') return '仓库已完成入库';
  }
  const defaultLabel = compactProductionActionLabel(row);
  if (activePage.value === 'work-orders' && defaultLabel === '办理入库') {
    const pendingReceipt = workOrderExecutionCards(row.code)
      .map((card) => pendingProductionReceiptCode(card.code))
      .find(Boolean);
    if (pendingReceipt) return '等待仓库入库';
  }
  return defaultLabel;
});
const productionDocumentPrimaryIsHandoff = computed(() => {
  const row = currentProductionDocument.value;
  if (!row) return false;
  const raw = row.raw as AnyRecord;
  if (activePage.value === 'tasks') {
    return row.nextStep.includes('质检') || row.nextStep.includes('仓库入库') || row.nextStep.includes('在途');
  }
  if (activePage.value === 'material-requests') {
    return materialRequestDraft.value.status !== '草稿';
  }
  if (activePage.value === 'quality') return true;
  if (activePage.value === 'work-orders') {
    const hasQualityHandoff = production2QualityTasks.some(
      (task) => task.workOrderCode === row.code && productionQualityTaskIsPending(task as unknown as AnyRecord),
    );
    const releaseFacts = workOrderReleaseFacts(raw);
    const hasProductionAction = Boolean(workOrderActionableProductionCard(row.code));
    return !hasProductionAction && (hasQualityHandoff
      || workOrderLifecycleStatus.value === '已关闭'
      || (releaseFacts.unreleasedQty > 0 && releaseFacts.releasableQty <= 0)
      || workOrderExecutionCards(row.code).some((card) => (
        row.nextStep.includes('入库') || Boolean(pendingProductionReceiptCode(card.code))
      )));
  }
  if (activePage.value === 'execution-cards') {
    const hasQualityHandoff = qualityTasksForExecutionCard(row.code)
      .some((task) => productionQualityTaskIsPending(task as unknown as AnyRecord));
    const release = releaseBatchForExecutionCard(row.code);
    return hasQualityHandoff
      || Boolean(executionCardQualityHandoffFromRaw(raw))
      || (text(raw.status) === '已完成' && text(raw.node) === '已入库')
      || text(raw.node) === '待入库'
      || text(raw.status) === '待仓库'
      || Boolean(pendingProductionReceiptCode(row.code))
      || (release?.releaseStatus === '已释放' && release.materialStatus !== '已领料');
  }
  if (activePage.value === 'exceptions') {
    return false;
  }
  return false;
});
const productionEditableActionDisabled = computed(() =>
  !canWriteProduction.value
    || !isProductionEditableDocument.value
    || !currentProductionDocument.value
    || Boolean(productionWriteTrustMessage.value)
    || activePage.value === 'process-steps'
    || !['tasks', 'material-requests', 'work-orders', 'recipes', 'process-templates'].includes(activePage.value)
    || (activePage.value === 'tasks' && taskSaving.value)
    || (activePage.value === 'material-requests' && (materialRequestSaving.value || !materialRequestIsEditable.value))
    || (activePage.value === 'work-orders' && (workOrderSaving.value || !workOrderDraft.value.sourceAllocations.length))
    || (activePage.value === 'recipes' && (recipeSaving.value || !recipeIsEditable.value))
    || (activePage.value === 'process-templates' && (processTemplateSaving.value || !processTemplateIsEditable.value)),
);
const showProductionDocumentPrimaryAction = computed(() => (
  ['tasks', 'material-requests', 'work-orders', 'execution-cards', 'quality', 'exceptions', 'recipes', 'process-templates'] as ProductionPage[]
).includes(activePage.value));
const productionPersistenceUnavailableMessage = computed(() =>
  ['tasks', 'material-requests', 'work-orders', 'recipes', 'process-templates'].includes(activePage.value)
    ? ''
    : `当前${activeListTitle.value}暂不支持保存变更。`,
);
const productionSaveActionTitle = computed(() => {
  if (!canWriteProduction.value) return productionReadonlyReason.value;
  if (productionWriteTrustMessage.value) return productionWriteTrustMessage.value;
  if (activePage.value === 'process-steps') return processStepLockedMessage;
  if (activePage.value === 'tasks' && taskSaving.value) return '生产任务正在保存，请稍候。';
  if (activePage.value === 'material-requests' && materialRequestSaving.value) return '备料申请正在保存，请稍候。';
  if (activePage.value === 'work-orders' && workOrderSaving.value) return '生产工单正在保存，请稍候。';
  if (activePage.value === 'work-orders' && !workOrderDraft.value.sourceAllocations.length) return '请先选择任务需求';
  if (activePage.value === 'recipes' && recipeSaving.value) return '生产配方正在保存，请稍候。';
  if (activePage.value === 'process-templates' && processTemplateSaving.value) return '生产工艺正在保存，请稍候。';
  if (productionPersistenceUnavailableMessage.value) return productionPersistenceUnavailableMessage.value;
  if (productionEditableActionDisabled.value) return '详情只读，请进入变更/编辑后保存。';
  return '保存草稿，提交前可继续调整信息。';
});
const productionRequiredFieldLabels = computed<Record<string, string>>(() => ({
  ...(activePage.value === 'tasks'
    ? {
        date: '交期',
        owner: '负责人',
      }
    : activePage.value === 'work-orders'
      ? {}
    : activePage.value === 'process-templates'
      ? {
        name: '工艺名称',
        version: '版本号',
        productFamily: '产品族',
        lineTypes: '适用产线',
        steps: '工艺阶段',
      }
    : {
        title: isProductionRecordDocument.value ? '来源类型' : isProductionRuleDocument.value ? '名称' : '单据名称',
        source: isProductionRecordDocument.value ? '产线' : isProductionRuleDocument.value ? '适用对象' : '来源',
        date: activePageConfig.value.dateLabel,
        owner: '负责人',
        nextStep: productionStatusActionPrefix.value,
      }),
}));
const productionRequiredFieldKeys = computed(() => Object.keys(productionRequiredFieldLabels.value));
const productionMissingRequiredFields = computed(() => {
  if (!isProductionEditableDocument.value) return [];
  return productionRequiredFieldKeys.value
    .filter((key) => productionDraftValueIsMissing(productionDraft.value[key]))
    .map((key) => ({ key, label: productionRequiredFieldLabels.value[key] || key }));
});
const productionMissingRequiredSummary = computed(() => {
  const labels = productionMissingRequiredFields.value.map((field) => field.label);
  return labels.length ? `请先补齐：${labels.slice(0, 6).join('、')}${labels.length > 6 ? '等' : ''}` : '';
});
const productionSubmitActionTitle = computed(() => {
  if (!canWriteProduction.value) return productionReadonlyReason.value;
  if (productionWriteTrustMessage.value) return productionWriteTrustMessage.value;
  if (activePage.value === 'process-steps') return processStepLockedMessage;
  if (activePage.value === 'tasks' && taskSaving.value) return '生产任务正在保存，请稍候。';
  if (activePage.value === 'material-requests' && materialRequestSaving.value) return '备料申请正在保存，请稍候。';
  if (activePage.value === 'work-orders' && workOrderSaving.value) return '生产工单正在保存，请稍候。';
  if (activePage.value === 'work-orders' && !workOrderDraft.value.sourceAllocations.length) return '请先选择任务需求';
  if (activePage.value === 'recipes' && recipeSaving.value) return '生产配方正在保存，请稍候。';
  if (activePage.value === 'process-templates' && processTemplateSaving.value) return '生产工艺正在保存，请稍候。';
  if (productionPersistenceUnavailableMessage.value) return productionPersistenceUnavailableMessage.value;
  if (productionEditableActionDisabled.value) return '详情只读，请进入变更/编辑后提交。';
  if (activePage.value === 'tasks' && taskSubmitBlockingMessage.value) return taskSubmitBlockingMessage.value;
  if (activePage.value === 'material-requests' && materialRequestSubmitBlockingMessage.value) return materialRequestSubmitBlockingMessage.value;
  if (activePage.value === 'work-orders' && workOrderSubmitBlockingMessage.value) return workOrderSubmitBlockingMessage.value;
  if (activePage.value === 'recipes' && recipeActivationConflictMessage.value) return recipeActivationConflictMessage.value;
  if (activePage.value === 'recipes' && recipeSubmitBlockingMessage.value) return recipeSubmitBlockingMessage.value;
  if (activePage.value === 'process-templates' && processTemplateActivationConflictMessage.value) return processTemplateActivationConflictMessage.value;
  if (activePage.value === 'process-templates' && processTemplateSubmitBlockingMessage.value) return processTemplateSubmitBlockingMessage.value;
  if (productionMissingRequiredFields.value.length) return productionMissingRequiredSummary.value;
  if (taskConfirmedEdit.value) return '保存负责人、交期、优先级或备注变更；来源与已有下游单据关联的成品结构保持不变。';
  if (workOrderConfirmedEdit.value) {
    return workOrderStructureIsEditable.value
      ? '提交工单变更并重新确认版本；尚未形成后续业务，可调整来源、数量、配方和工艺。'
      : '提交备注变更；工单已经形成下游业务，任务需求、数量、配方和工艺保持冻结。';
  }
  return isProductionRuleDocument.value ? '提交规则维护，检查版本和适用范围。' : '提交单据，进入下一流程节点。';
});
const productionSubmitButtonLabel = computed(() => {
  if (['recipes', 'process-templates'].includes(activePage.value)) return '启用版本';
  if (taskConfirmedEdit.value || workOrderConfirmedEdit.value) return '保存变更';
  return '提交';
});

function workOrderNextStepDescription(order: AnyRecord) {
  const quantityChain = workOrderQuantityChain(order.code, order.planQty);
  if (toNumber(order.planQty) > 0 && quantityChain.inboundQty + 0.0001 >= toNumber(order.planQty)) {
    return workOrderLifecycleStatusFromRaw(order) === '已关闭'
      ? '工单已经关闭；生产批次、质检结论、包装记录和完工入库仍按原始业务单据保留追溯。'
      : '计划数量已经全部入库；核对不存在待处置异常、未完成质检或数量差异后关闭工单。';
  }
  const releaseFacts = workOrderReleaseFacts(order);
  if (releaseFacts.unreleasedQty > 0) {
    if (releaseFacts.releasableQty <= 0) {
      return '待检库存放行或可用库存补齐后，系统会重新计算可安排数量；条件未满足前不生成新的生产安排和领料。';
    }
    return `当前可安排 ${qty(releaseFacts.releasableQty, order.unit)}；确认后生成生产安排，仓库确认领料出库后进入现场执行。`;
  }
  const stages = workOrderExecutionStageBuckets(order.code).filter((item) => item.label !== '已完成');
  if (stages.length) {
    return `计划数量已全部安排；当前生产批次分布为${stages.map((item) => `${item.label} ${item.count} 个`).join('、')}，请按各批次待办继续处理。`;
  }
  return '计划数量已全部安排；继续按生产批次核对报工、质检放行和仓库入库。';
}

function executionCardSupplementJob(raw: AnyRecord | undefined) {
  const supplementCode = text(raw?.shortCloseSupplementJobCode);
  if (!supplementCode) return undefined;
  return toArray<AnyRecord>(raw?.operationJobs).find((job) => text(job.code) === supplementCode);
}

function executionCardNextStepDescription(raw: AnyRecord | undefined) {
  if (text(raw?.status) === '已完成' && text(raw?.node) === '已入库') {
    return `本批次计划、报工、质检、包装和仓库入库均已完成；累计入库 ${qty(raw?.inboundQty, raw?.unit)}，库存流水由仓库模块继续追溯。`;
  }
  if (executionCardShortCloseNeedsResolution(raw)) {
    return `当前设备作业已提前结束，剩余 ${qty(raw?.shortCloseRemainingQty, raw?.unit)} 尚未处理；请明确安排补产或接受短缺，主状态不会代替这个计划决定。`;
  }
  const pendingQualityTask = qualityTasksForExecutionCard(raw?.code)
    .find((task) => productionQualityTaskIsPending(task as unknown as AnyRecord));
  if (pendingQualityTask) {
    const taskCode = text(pendingQualityTask.code, '质检任务');
    const kind = text(pendingQualityTask.kind, '生产质检');
    const dispositionStage = productionQualityState(pendingQualityTask as unknown as AnyRecord).dispositionStage;
    if (dispositionStage === '待复检') {
      const reinspectionCode = text(raw?.nextAction).match(/PRI2-[\w-]+/)?.[0] || '返工复检任务';
      return `${taskCode} 的检验结论已形成，返工也已完成；当前由质检完成独立复检 ${reinspectionCode}，生产侧保持阻断。`;
    }
    if (dispositionStage === '返工中') {
      return `${taskCode} 已进入返工阶段；按当前返工任务完成作业并送独立复检，生产侧不提前进入包装。`;
    }
    if (dispositionStage === '待处置') {
      return `${taskCode} 的不合格数量尚待处置；由质检选择返工、让步放行或报废，生产侧保持阻断。`;
    }
    if (kind.includes('首检')) {
      return `开机首检 ${taskCode} 等待质量判定；合格后自动进入生产报工，现场无需重复开工。`;
    }
    if (kind.includes('报工')) {
      return `报工质检 ${taskCode} 等待质量判定；合格数量确认后再进入包装，生产页面不代替质检确认。`;
    }
    if (kind.includes('入库')) {
      return `入库抽检 ${taskCode} 等待质量判定；放行后由仓库办理完工入库。`;
    }
    return `${kind} ${taskCode} 等待质量判定；完成后系统自动返回对应生产阶段。`;
  }
  if (text(raw?.shortCloseResolution) === '安排补产') {
    const supplement = executionCardSupplementJob(raw);
    if (text(supplement?.status) === '已完成') {
      if (text(raw?.node) === '待包装') {
        return `补产作业 ${text(supplement?.code)} 已完成并通过报工质检；当前可包装 ${qty(Math.max(0, toNumber(raw?.qualifiedQty) - toNumber(raw?.packedQty)), raw?.unit)}。`;
      }
      if (text(raw?.node) === '待抽检') {
        return `补产作业 ${text(supplement?.code)} 已完成；已包装 ${qty(raw?.packedQty, raw?.unit)}，完成入库抽检后放行仓库入库。`;
      }
      if (text(raw?.node) === '待入库') {
        return `补产作业 ${text(supplement?.code)} 已完成，入库抽检已放行；由仓库办理完工入库。`;
      }
      return `补产作业 ${text(supplement?.code)} 已完成；继续按当前阶段办理包装、入库抽检或仓库入库。`;
    }
    return `提前结束的剩余数量已安排补产；${text(raw?.shortCloseSupplementJobCode, '补充设备作业')} 将在当前报工质检完成后进入现场队列。`;
  }
  if (text(raw?.shortCloseResolution) === '接受短缺') {
    return `已接受短缺 ${qty(raw?.acceptedShortageQty, raw?.unit)}；实际合格数量继续包装和入库，计划差异保留在批次记录中。`;
  }
  if (text(raw?.node) === '待包装') {
    const pendingPackQty = Math.max(0, toNumber(raw?.qualifiedQty) - toNumber(raw?.packedQty));
    return `${qty(pendingPackQty, raw?.unit)} 已通过报工质检；登记本次包装数量和箱号或托盘号，随后自动生成入库抽检。`;
  }
  if (text(raw?.node) === '待入库') {
    return `${qty(executionCardPendingInboundQty(raw ?? {}), raw?.unit)} 已通过入库抽检；由仓库创建并确认完工入库单，生产页面不直接改库存。`;
  }
  const operationJob = executionCardCurrentOperationJob(raw);
  if (operationJob && ['可开工', '队列中'].includes(operationJob.status)) {
    return `${operationJob.operationType}已排入${executionCardOperationAssignment(operationJob, raw)}；进入现场确认负责人后开始，开工前已保留排产时段，设备仍显示待开工。`;
  }
  if (operationJob && ['执行中', '暂停', '异常'].includes(operationJob.status)) {
    return `${operationJob.operationType}当前为${operationJobDisplayStatus(operationJob.status)}；产量、暂停和异常都在现场记录，质检与入库继续由所属模块处理。`;
  }
  return '按当前阶段处理报工、质检、包装或入库；设备作业完成后不再占用产线。';
}

function executionCardShortCloseNeedsResolution(raw: AnyRecord | undefined) {
  return Boolean(raw?.shortClosedAt)
    && toNumber(raw?.shortCloseRemainingQty) > 0
    && !['安排补产', '接受短缺'].includes(text(raw?.shortCloseResolution, ''));
}

function isQualityProductionException(raw: AnyRecord | undefined) {
  return /质量|质检/.test(text(raw?.type, ''))
    || /^(QC2-|PQC-|IQC-)/.test(text(raw?.source, ''));
}

function productionExceptionQualityTask(raw: AnyRecord | undefined) {
  if (!isQualityProductionException(raw)) return undefined;
  const sourceCode = text(raw?.source, '');
  const cardCode = text(raw?.executionCardCode || raw?.relatedBatch, '');
  return production2QualityTasks.find((task) => task.code === sourceCode)
    || production2QualityTasks.find((task) => task.sourceCard === cardCode);
}

function productionExceptionQualityActionLabel(raw: AnyRecord | undefined) {
  const task = productionExceptionQualityTask(raw);
  if (!task) return text(raw?.status) === '已关闭' ? '查看质检记录' : '查看质量处置';
  const stage = productionQualityState(task as unknown as AnyRecord).dispositionStage;
  if (stage === '待处置') return '前往质量处置';
  if (stage === '返工中') return '查看返工进度';
  if (stage === '待复检') return '前往质量复检';
  return '查看质检记录';
}

function productionExceptionNextStepDescription(raw: AnyRecord | undefined) {
  const type = text(raw?.type);
  if (isQualityProductionException(raw)) {
    const task = productionExceptionQualityTask(raw);
    const stage = task ? productionQualityState(task as unknown as AnyRecord).dispositionStage : '';
    if (stage === '待复检') return '返工作业已经完成；由质检执行独立复检，复检放行前继续阻断包装和入库。';
    if (stage === '返工中') return '不合格数量已转返工；生产完成返工作业后送独立复检，复检放行前继续阻断后段流转。';
    if (stage === '待处置') return '检验结论已经形成；由质检选择返工、让步放行或报废，生产侧不重复判定质量结论。';
    return text(raw?.status) === '已关闭'
      ? '质量处置已经闭环；生产异常保留质量结论和处置凭证的追溯入口。'
      : '由质检完成不合格数量的返工、让步放行或报废处置；生产侧仅保留下游阻断。';
  }
  if (type === '缺料') {
    const stage = productionShortageExceptionStage(raw);
    if (stage === '待处理') return '当前仍有新增采购缺口；由采购需求承接缺口，生产只查看补充进度，不手工解除缺料条件。';
    if (stage === '处理中') return '采购补充已覆盖当前缺口；等待到货、质检放行和仓库入库形成可用库存，系统随后重新计算物料储备状态。';
    return '实时库存已经校验为已备齐；异常保留来源、补充过程和关闭结果，生产可返回任务继续安排。';
  }
  if (text(raw?.outcome) === '异常停机') return '排除现场异常并填写处理结论后恢复原执行阶段；恢复操作不会跳过报工、质检或仓库节点。';
  return '按异常记录完成现场处理和复核；业务阶段、质量结论和库存状态分别记录。';
}

function productionExceptionStageItems(raw: AnyRecord | undefined): DocumentStageItem[] {
  if (isQualityProductionException(raw)) {
    return [
      { label: '待处理', description: '质量已经判定不合格，等待质检分配返工、让步或报废处置。' },
      { label: '处理中', description: '不合格数量正在返工或执行其他质量处置。' },
      { label: '待复核', description: '返工已经完成，等待质检独立复检。' },
      { label: '已关闭', description: '不合格数量已经全部形成处置和复检凭证。' },
    ];
  }
  if (text(raw?.type) === '缺料') {
    return [
      { label: '待处理', description: '仍有需要新增采购承接的净缺口。' },
      { label: '处理中', description: '缺口已有在途、待检或待入库数量覆盖，等待形成可用库存。' },
      { label: '已关闭', description: '系统已按实时可用库存校验为已备齐，异常保留处理追溯。' },
    ];
  }
  if (text(raw?.outcome) === '异常停机') {
    return [
      { label: '待处理', description: '现场异常已登记并阻断当前批次，等待排除原因。' },
      { label: '已关闭', description: '处理结论已保存，生产批次已恢复原执行阶段。' },
    ];
  }
  return [
    { label: '已关闭', description: '现场记录已保存；该异常未阻断生产批次。' },
  ];
}

function productionTaskNextStepDescription(label: string) {
  if (label.includes('编辑') || label.includes('提交')) return '任务仍是草稿，只能先补齐或复核成品、数量、交期和负责人；提交确认后才能创建生产工单。';
  if (label.includes('配方')) return '当前成品没有唯一启用配方；先维护并启用配方，系统才能展开物料需求并继续创建生产工单。';
  if (label.includes('余量待物料')) return '当前库存已支持部分生产；先安排可生产数量，剩余数量继续等待到货、质检和入库，库存更新后再追加安排。';
  if (label.includes('备料申请')) return '仍有物料缺口；先完成备料申请，再确认可安排数量。';
  if (label.includes('质检') && label.includes('入库')) return '补充物料已到质检和仓库环节；质检放行并入库后，系统重新计算可安排数量。';
  if (label.includes('质检')) return '补充物料正在检验；质检放行后系统重新计算可用库存和可安排数量。';
  if (label.includes('仓库入库')) return '补充物料已经通过前序环节；仓库完成入库后系统重新计算可安排数量。';
  if (label.includes('在途')) return '当前缺口已被在途数量覆盖；跟踪到货、质检和入库，不重复发起采购。';
  if (label.includes('创建') || label.includes('建单')) return '按成品明细建立或补齐生产工单；物料不足不影响建单，但暂时不能安排生产和领料。';
  if (label.includes('释放') || label.includes('安排')) return '工单和物料条件已经满足；确认本次安排数量并加入产线。';
  if (label.includes('报工') || label.includes('入库')) return '生产任务保留汇总视角；具体报工、质检和入库在关联工单及生产批次中处理。';
  return '根据成品明细、物料条件和关联工单确定当前动作；任务状态不代替建单、备料、执行和入库进度。';
}

const productionDocumentNextStepGuidance = computed(() => {
  const row = currentProductionDocument.value;
  let label = row?.nextStep || (isProductionRuleDocument.value ? '维护规则' : '推进流程');
  let interventionDescription = '';
  const workOrderMaterialBlocked = row && activePage.value === 'work-orders'
    ? (() => {
        const facts = workOrderReleaseFacts(row.raw as AnyRecord);
        return facts.unreleasedQty > 0 && facts.releasableQty <= 0;
      })()
    : false;
  if (row && activePage.value === 'work-orders') {
    const qualityIntervention = production2QualityTasks.find(
      (task) => task.workOrderCode === row.code
        && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
    );
    const exceptionIntervention = qualityIntervention ? undefined : activeProductionExceptionForWorkOrder(row.code);
    if (qualityIntervention) {
      label = `${productionQualityActionLabel(qualityIntervention as unknown as AnyRecord)} · ${text(qualityIntervention.code)}`;
      interventionDescription = executionCardNextStepDescription(
        production2ExecutionCards.find((card) => card.code === qualityIntervention.sourceCard) as unknown as AnyRecord,
      );
    } else if (exceptionIntervention) {
      label = `处理生产异常 · ${exceptionIntervention.code}`;
      interventionDescription = productionExceptionNextStepDescription(exceptionIntervention as unknown as AnyRecord);
    }
  }
  if (row && activePage.value === 'execution-cards') {
    const qualityIntervention = qualityTasksForExecutionCard(row.code)
      .find((task) => productionQualityTaskNeedsDisposition(task as unknown as AnyRecord));
    const exceptionIntervention = qualityIntervention ? undefined : activeProductionExceptionForExecutionCard(row.code);
    if (qualityIntervention) {
      label = `${productionQualityHandoffLabel(qualityIntervention as unknown as AnyRecord)} · ${text(qualityIntervention.code)}`;
    } else if (exceptionIntervention) {
      label = `处理生产异常 · ${exceptionIntervention.code}`;
      interventionDescription = productionExceptionNextStepDescription(exceptionIntervention as unknown as AnyRecord);
    }
  }
  if (row && activePage.value === 'exceptions' && text(row.raw.type) === '缺料') {
    label = productionExceptionNextAction(row.raw as AnyRecord);
  }
  return {
    label,
    description: interventionDescription || (isProductionRuleDocument.value
      ? activePage.value === 'process-steps'
        ? '查看动作的触发条件、执行方、完成结果和异常规则；作业资料在生产工艺中维护。'
        : '按维护动作检查版本、适用范围和启停状态，避免规则与现场执行脱节。'
      : activePage.value === 'tasks'
        ? productionTaskNextStepDescription(label)
        : activePage.value === 'work-orders'
          ? workOrderNextStepDescription(row?.raw as AnyRecord)
        : activePage.value === 'material-requests'
          ? materialRequestNextStepDescription()
        : activePage.value === 'execution-cards'
          ? executionCardNextStepDescription(row?.raw as AnyRecord)
        : activePage.value === 'exceptions'
          ? productionExceptionNextStepDescription(row?.raw as AnyRecord)
        : '按当前流程节点处理下一步，相关仓库、质检或生产动作只保留在这一处提示。'),
    action: productionDocumentPrimaryLabel.value,
    tone: interventionDescription || workOrderMaterialBlocked ? 'pending' : statusTone(row?.status || ''),
  };
});
const showProductionNextStepStrip = computed(
  () => productionDocumentIsReadOnlyView.value
    && !isProductionRecordDocument.value
    && !isProductionRuleDocument.value,
);
const showProductionNextStepStripAction = computed(() =>
  !['tasks', 'work-orders', 'material-requests', 'execution-cards', 'exceptions'].includes(activePage.value),
);

const productionDocumentBasicFacts = computed<DetailFact[]>(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (isProductionRecordDocument.value) {
    return [
      { label: '来源类型', value: text(raw?.sourceType, '-') },
      { label: '损耗性质', value: lossRecordNature(raw) },
      { label: '发生时间', value: text(raw?.occurredAt, '-') },
      { label: '记录状态', value: text(raw?.status, '-'), tone: statusClass(text(raw?.status, '-')) },
    ];
  }
  if (activePage.value === 'exceptions') {
    const sourceCode = text(raw?.source, '-');
    const sourceLabel = /^(IQC|PQC|QC2-)/.test(sourceCode)
      ? '来源质检'
      : sourceCode.startsWith('PT2-')
        ? '来源任务'
        : sourceCode.startsWith('EC2-')
          ? '来源批次'
          : '来源单据';
    const relatedBatch = text(raw?.relatedBatch || raw?.executionCardCode, '');
    return [
      { label: '异常类型', value: text(raw?.type, '-') },
      { label: sourceLabel, value: sourceCode, route: productionObjectRoute(sourceCode) },
      ...(text(raw?.relatedWorkOrder, '')
        ? [{ label: '生产工单', value: text(raw?.relatedWorkOrder), route: productionObjectRoute(text(raw?.relatedWorkOrder)) }]
        : []),
      ...(relatedBatch && relatedBatch !== sourceCode
        ? [{ label: '生产批次', value: relatedBatch, route: productionObjectRoute(relatedBatch) }]
        : []),
      { label: '产线', value: text(raw?.line, '-') },
      { label: '记录人', value: text(raw?.createdBy || raw?.owner, '-') },
      { label: '登记时间', value: text(raw?.createdAt, '-') },
    ];
  }
  const codeLabel = activePage.value === 'work-orders'
    ? '生产工单号'
    : activePage.value === 'execution-cards'
      ? '生产批次号'
      : activePage.value === 'quality'
        ? '质检任务号'
        : isProductionRecordDocument.value
          ? '记录编号'
          : '单据编号';
  const titleLabel = ['work-orders', 'execution-cards'].includes(activePage.value)
    ? '成品'
    : activePage.value === 'quality'
      ? '质检对象'
      : isProductionRecordDocument.value
        ? '来源类型'
        : isProductionRuleDocument.value
          ? '名称'
          : '单据名称';
  const sourceLabel = activePage.value === 'execution-cards'
      ? '来源工单'
      : activePage.value === 'quality'
        ? '来源批次'
        : isProductionRecordDocument.value
          ? '产线'
          : isProductionRuleDocument.value
            ? '适用对象'
            : '来源';
  const facts: DetailFact[] = [
    { key: 'code', label: codeLabel, value: draftValue('code') },
    { key: 'title', label: titleLabel, value: draftValue('title') },
    ...(activePage.value === 'work-orders'
      ? []
      : [
          { key: 'source', label: sourceLabel, value: draftValue('source') },
          { key: 'date', label: activePageConfig.value.dateLabel, value: draftValue('date') },
          { key: 'owner', label: activePage.value === 'execution-cards' ? '班组负责人' : '负责人', value: draftValue('owner') },
        ]),
    { key: 'status', label: '状态', value: draftValue('status') },
    { key: 'nextStep', label: productionStatusActionPrefix.value, value: productionDisplayTerm(draftValue('nextStep')), full: true },
  ];
  return isProductionEditableDocument.value
    ? facts
    : facts.filter((fact) => ![
        'code',
        'status',
        'nextStep',
        ...(['work-orders', 'execution-cards'].includes(activePage.value) ? ['title'] : []),
      ].includes(fact.key || ''));
});

const productionDocumentSummaryFacts = computed<DetailFact[]>(() => [
  { label: isProductionRecordDocument.value ? '记录编号' : '单号', value: draftValue('code') },
  { label: isProductionRecordDocument.value ? '来源类型' : isProductionRuleDocument.value ? '规则名称' : '对象', value: draftValue('title') },
  { label: '状态', value: draftValue('status'), tone: statusClass(draftValue('status')) },
  { label: '负责人', value: draftValue('owner') },
  { label: activePageConfig.value.dateLabel, value: draftValue('date') },
  { label: productionStatusActionPrefix.value, value: productionDisplayTerm(draftValue('nextStep')) },
]);
const taskDocumentSummaryFacts = computed<DetailFact[]>(() => [
  { label: '已建工单', value: `${taskPlannedSummary.value} / ${taskDemandSummary.value}` },
  { label: '入库进度', value: `${taskInboundSummary.value} / ${taskDemandSummary.value}` },
  { label: '物料备料', value: taskMaterialReadinessLabel.value },
  { label: '关联工单', value: `${taskRelatedWorkOrders.value.length} 张` },
]);
const workOrderDocumentSummaryFacts = computed<DetailFact[]>(() => {
  const raw = workOrderIsEditable.value
    ? workOrderDraft.value as unknown as AnyRecord
    : currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (!raw) return [];
  return [
    { label: '物料准备', value: workOrderMaterialPreparationLabel(raw) },
    { label: '现场批次', value: `${workOrderExecutionCards(raw.code).length} 个` },
  ];
});
const workOrderLifecycleStatus = computed(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (!raw) return '-';
  return workOrderLifecycleStatusFromRaw(raw);
});
const workOrderCanClose = computed(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (!raw || workOrderLifecycleStatus.value === '已关闭') return false;
  const planQty = toNumber(raw.planQty);
  const inboundQty = workOrderQuantityChain(raw.code, raw.planQty).inboundQty;
  const hasQualityDisposition = production2QualityTasks.some(
    (task) => task.workOrderCode === text(raw.code)
      && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
  );
  return planQty > 0
    && inboundQty + 0.0001 >= planQty
    && !hasQualityDisposition
    && !activeProductionExceptionForWorkOrder(raw.code);
});
const workOrderStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (!raw) return [];
  const releaseFacts = workOrderReleaseFacts(raw);
  const quantityChain = workOrderQuantityChain(raw.code, raw.planQty);
  const unit = text(raw.unit, '件');
  const activeQualityDisposition = production2QualityTasks.find(
    (task) => task.workOrderCode === text(raw.code)
      && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
  );
  const activeException = activeQualityDisposition ? undefined : activeProductionExceptionForWorkOrder(raw.code);
  const dueAttention = workOrderDueAttention(raw);
  const attentionItem: DocumentStatusItem[] = activeQualityDisposition
    ? [{
        key: 'attention',
        label: '当前阻断',
        value: productionQualityActionLabel(activeQualityDisposition as unknown as AnyRecord),
        detail: text(activeQualityDisposition.code),
        kind: 'status',
        tone: 'danger',
      }]
    : activeException
      ? [{
          key: 'attention',
          label: '当前阻断',
          value: '生产异常待处理',
          detail: text(activeException.code),
          kind: 'status',
          tone: 'danger',
        }]
      : [];
  return [
    ...attentionItem,
    ...(dueAttention
      ? [{
          key: 'due-risk',
          label: '要求日期提醒',
          value: dueAttention,
          kind: 'status' as const,
          tone: dueAttention.startsWith('逾期') ? 'danger' as const : 'warning' as const,
        }]
      : []),
    {
      key: 'release',
      label: '安排进度',
      value: `${qty(releaseFacts.releasedQty, unit)} / ${qty(raw.planQty, unit)}`,
      detail: `未安排 ${qty(releaseFacts.unreleasedQty, unit)}`,
      kind: 'metric',
    },
    { key: 'material', label: '物料准备', value: workOrderMaterialPreparationLabel(raw), kind: 'status' },
    {
      key: 'production',
      label: '生产报工',
      value: `${qty(quantityChain.reportedQty, unit)} / ${qty(raw.planQty, unit)}`,
      kind: 'metric',
    },
    {
      key: 'quality',
      label: '质量进度',
      value: quantityChain.reportedQty > 0
        ? `${qty(quantityChain.qualifiedQty, unit)} 合格 / ${qty(quantityChain.reportedQty, unit)} 已报工`
        : '尚未报工',
      detail: workOrderQualityRemainderSummary(raw.code),
      kind: 'metric',
    },
    {
      key: 'inbound',
      label: '入库进度',
      value: `${qty(quantityChain.inboundQty, unit)} / ${qty(raw.planQty, unit)}`,
      detail: quantityChain.pendingInboundQty > 0 ? `${qty(quantityChain.pendingInboundQty, unit)} 待仓库入库` : undefined,
      kind: 'metric',
    },
    { key: 'batches', label: '生产批次', value: `${workOrderExecutionCards(raw.code).length} 个`, kind: 'metric' },
  ];
});
const executionCardDocumentSummaryFacts = computed<DetailFact[]>(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  const release = releaseBatchForExecutionCard(raw?.code);
  const shortCloseFact = raw?.shortClosedAt
    ? {
        label: '计划例外',
        value: executionCardShortCloseNeedsResolution(raw)
          ? `提前结束剩余 ${qty(raw.shortCloseRemainingQty, raw.unit)} 待处理`
          : text(raw.shortCloseResolution) === '安排补产'
            ? text(executionCardSupplementJob(raw)?.status) === '已完成'
              ? `补产已完成 ${qty(raw.shortCloseRemainingQty, raw.unit)}`
              : `已安排补产 ${qty(raw.shortCloseRemainingQty, raw.unit)}`
            : `接受短缺 ${qty(raw.acceptedShortageQty, raw.unit)}`,
      }
    : null;
  return [
    { label: '排产状态', value: release?.releaseStatus || '未关联' },
    { label: '物料状态', value: executionCardMaterialDisplayStatus(raw ?? {}) },
    { label: '设备作业', value: executionCardOperationSummary(raw, release?.executionStatus || text(raw?.status, '-')) },
    { label: '质量状态', value: executionCardQualityStageLabel(raw ?? {}) },
    { label: '包装状态', value: executionCardPackagingStatus(raw) },
    { label: '入库状态', value: release?.inboundStatus || '未报工' },
    { label: '当前阶段', value: executionCardCurrentStageName(raw) },
    ...(shortCloseFact ? [shortCloseFact] : []),
  ];
});
const executionCardLifecycleStatus = computed(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (!raw) return '-';
  return executionCardLifecycleStatusFromRaw(raw);
});
const executionCardStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  if (!raw) return [];
  const release = releaseBatchForExecutionCard(raw.code);
  const unit = text(raw.unit, release?.unit || '件');
  const planQty = release?.releasedQty ?? raw.planQty;
  const items: DocumentStatusItem[] = [
    { key: 'stage', label: '作业阶段', value: executionCardCurrentStageName(raw), kind: 'status' },
    { key: 'material', label: '物料状态', value: executionCardMaterialDisplayStatus(raw), kind: 'status' },
    {
      key: 'reported',
      label: '生产报工',
      value: `${qty(raw.reportedQty, unit)} / ${qty(planQty, unit)}`,
      kind: 'metric',
    },
    { key: 'quality', label: '质量状态', value: executionCardQualityStageLabel(raw), kind: 'status' },
    { key: 'packaging', label: '包装状态', value: executionCardPackagingStatus(raw), kind: 'status' },
    { key: 'inbound', label: '入库状态', value: release?.inboundStatus || '未报工', kind: 'status' },
  ];
  const rawExecutionStatus = text(raw.status, '');
  const currentOperationJob = executionCardCurrentOperationJob(raw);
  const qualityStatus = executionCardQualityStageLabel(raw);
  const hasExecutionAttention = /异常|中断|停止|暂停/.test(rawExecutionStatus)
    || /异常|暂停/.test(text(currentOperationJob?.status, ''));
  if (hasExecutionAttention) {
    const isQualityBlocked = /待处置|返工|复检|不合格|冻结/.test(qualityStatus);
    items.splice(1, 0, {
      key: 'attention',
      label: '异常 / 暂停',
      value: isQualityBlocked ? '质量阻断' : text(currentOperationJob?.status, rawExecutionStatus || '待处理'),
      detail: text(raw.nextAction, isQualityBlocked ? '完成质量处置后恢复流转' : '完成异常处置后恢复执行'),
      kind: 'status',
      tone: 'danger',
    });
  }
  if (raw.shortClosedAt) {
    items.push({
      key: 'exception',
      label: '计划例外',
      value: executionCardShortCloseNeedsResolution(raw) ? '待处理' : '已处理',
      detail: `提前结束剩余 ${qty(raw.shortCloseRemainingQty, unit)}`,
      kind: 'status',
      tone: executionCardShortCloseNeedsResolution(raw) ? 'danger' : 'success',
    });
  }
  return items;
});
const materialRequestDocumentSummaryFacts = computed<DetailFact[]>(() => [
  { label: '物料明细', value: `${materialRequestLines.value.length} 项` },
  { label: materialRequestDraft.value.sourceTaskCode ? '缺口申请量' : '申请数量', value: materialRequestRequestedSummary.value },
  { label: '需求日期', value: materialRequestDraft.value.expectedDate || '-' },
  { label: '库存/采购', value: materialRequestPurchaseSummary.value },
]);
const recipeDocumentSummaryFacts = computed<DetailFact[]>(() => [
  { label: '已有版本', value: recipeDraft.value.productCode ? `${recipeProductVersionCount.value} 个` : '选择产出物料后显示' },
  { label: '当前启用', value: recipeProductEnabledVersionLabel.value },
  {
    label: '配方构成',
    value: `投料 ${recipePercentLineCount.value} 项 / ${recipePercentLineCount.value ? formatPercent(recipePercentTotal.value) : '-'} · 固定 ${recipeFixedLineCount.value} 项`,
  },
  { label: '损耗规则', value: recipeEstimatedLossCount.value ? `${recipeEstimatedLossCount.value} 项` : '未设置' },
]);
const processTemplateDocumentSummaryFacts = computed<DetailFact[]>(() => [
  { label: '维护人', value: processTemplateDraft.value.owner || '未记录' },
  { label: '更新日期', value: processTemplateDraft.value.updatedAt || '未记录' },
  {
    label: '新工单选用',
    value: processTemplateDraft.value.status === '启用' ? '可选' : processTemplateDraft.value.status === '草稿' ? '草稿不可选' : '已停用',
  },
  ...(processTemplateActivationConflictRow.value
    ? [{
        label: '当前启用',
        value: `${text(processTemplateActivationConflictRow.value.version)} · ${text(processTemplateActivationConflictRow.value.code)}`,
        route: `/production/process-templates/${encodeURIComponent(text(processTemplateActivationConflictRow.value.code))}`,
      }]
    : []),
]);
const processStepDocumentSummaryFacts = computed<DetailFact[]>(() => [
  { label: '维护方式', value: '系统固定' },
  { label: '负责部门', value: processStepDraft.value.ownerDomain || '-' },
  { label: '执行方式', value: processStepDraft.value.executionMode || '-' },
  { label: '重复规则', value: processStepDraft.value.repeatPolicy || '-' },
]);
const productionDocumentVisibleFacts = computed(() => {
  if (isTaskDocument.value) return taskDocumentSummaryFacts.value;
  if (activePage.value === 'work-orders') return workOrderDocumentSummaryFacts.value;
  if (activePage.value === 'execution-cards') return executionCardDocumentSummaryFacts.value;
  if (isMaterialRequestDocument.value) return materialRequestDocumentSummaryFacts.value;
  if (isRecipeDocument.value) return recipeDocumentSummaryFacts.value;
  if (isProcessTemplateDocument.value) return processTemplateDocumentSummaryFacts.value;
  if (isProcessStepDocument.value) return processStepDocumentSummaryFacts.value;
  return productionDocumentSummaryFacts.value.filter((fact) => fact.label !== '下一步' && fact.label !== productionStatusActionPrefix.value);
});
const productionPrimaryActionTitle = computed(() => {
  if (activePage.value === 'recipes') {
    return recipeDraft.value.status === '草稿'
      ? '校验当前草稿并启用；启用后不可直接修改。'
      : '以当前内容复制生成下一版草稿，原版本保持不变。';
  }
  if (activePage.value === 'process-templates' && processTemplateActivationConflictMessage.value) {
    return processTemplateActivationConflictMessage.value;
  }
  const guidance = productionDocumentNextStepGuidance.value;
  return `${productionDocumentPrimaryLabel.value}：${guidance.label}。${guidance.description}`;
});

const productionDocumentStageItems = computed(() => {
  if (activePage.value === 'recipes') {
    return [
      { label: '草稿', description: '可以继续编辑，尚不能被生产任务和工单选用。' },
      { label: '启用', description: '当前配方可被生产任务、工单和领料计算引用。' },
      { label: '停用', description: '不再用于新业务，历史单据继续保留追溯。' },
    ];
  }
  if (activePage.value === 'process-steps') {
    return [
      { label: '系统预设', description: '节点名称、编号和动作配置由系统维护，用户不可新增或修改。' },
      { label: '启用', description: '该动作可被生产工艺引用，生产任务按确认时的动作版本执行。' },
      { label: '停用', description: '不再用于新工艺，历史任务保留原动作版本。' },
    ];
  }
  if (isProductionRuleDocument.value) {
    return [
      { label: '草稿', description: '补齐适用范围、检查项、版本和审批说明。' },
      { label: '启用', description: '已进入现场可选规则，定期复核有效性。' },
      { label: '停用', description: '不再用于新单据，保留历史追溯。' },
    ];
  }
  if (activePage.value === 'material-requests') {
    return [
      { label: '草稿', description: '生产填写物料、数量、用途和需求日期。' },
      { label: '库存可满足', description: '系统确认当前可用库存可覆盖；该结果不产生库存预留。' },
      { label: '已转采购', description: '系统已把库存不足部分自动生成采购需求。' },
    ];
  }
  if (activePage.value === 'work-orders') {
    return [
      { label: '待确认', description: '确认数量、配方、工艺和交付要求。' },
      { label: '待安排', description: '物料满足后安排生产，形成现场任务。' },
      { label: '生产中', description: '领料、开机检、报工、过程检和入库持续流转。' },
      { label: '部分入库', description: '已有批次入库，剩余批次继续执行。' },
      { label: '已完成', description: '计划数量完成并归档。' },
    ];
  }
  if (activePage.value === 'execution-cards') {
    return [
      { label: '待领料', description: '仓库按工单或批次确认发料。' },
      { label: '待首件', description: '开机首件送检，合格后放行批量生产。' },
      { label: '生产报工', description: '记录良品、不良和报工数量。' },
      { label: '待过程检', description: '报工批次等待过程质检判定。' },
      { label: '待打包', description: '合格批次进入包装报工。' },
      { label: '待抽检', description: '包装完成后等待入库检。' },
      { label: '待入库', description: '质检放行后等待完工入库。' },
      { label: '已入库', description: '批次已入库，工单进度已同步。' },
    ];
  }
  if (activePage.value === 'quality') {
    return [
      { label: '待检', description: '质检员按标准抽样并记录结果。' },
      { label: '检验中', description: '检查项正在执行或等待补充证据。' },
      { label: '合格', description: '质检通过，可放行后续生产或入库。' },
      { label: '不合格', description: '检验不合格，进入处置。' },
      { label: '待处置', description: '等待返工、让步、报废或复判完成。' },
    ];
  }
  if (activePage.value === 'loss-ledger') {
    return [
      { label: '待确认', description: '实际损耗已形成，但来源单据尚未完成工艺内、异常或待分类数量的确认。' },
      { label: '已确认', description: '来源事实和损耗分类均已确认；责任归属作为独立维度展示。' },
      { label: '待复核', description: '损耗分类已提交，等待来源业务主管复核。' },
      { label: '已关闭', description: '来源业务已完成闭环，记录保留用于统计与追溯。' },
    ];
  }
  if (activePage.value === 'exceptions') {
    return productionExceptionStageItems(currentProductionDocument.value?.raw as AnyRecord | undefined);
  }
  return [
    { label: '待处理', description: '异常已登记，等待责任人受理。' },
    { label: '处理中', description: '责任人正在执行处置措施。' },
    { label: '待复核', description: '处置完成，等待复核确认。' },
    { label: '已关闭', description: '异常已处理完成并可追溯。' },
  ];
});

const productionDocumentStageIndex = computed(() => {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  const currentStage = activePage.value === 'recipes'
      ? recipeDraft.value.status
      : activePage.value === 'process-templates'
        ? processTemplateDraft.value.status
        : activePage.value === 'execution-cards'
          ? text(raw?.node, draftValue('status'))
          : draftValue('status');
  const exactIndex = productionDocumentStageItems.value.findIndex((stage) => stage.label === currentStage);
  if (exactIndex >= 0) return exactIndex;
  const index = productionDocumentStageItems.value.findIndex((stage) => currentStage.includes(stage.label) || stage.label.includes(currentStage));
  return index >= 0 ? index : 0;
});

const productionDocumentSections = computed<DetailSection[]>(() => {
  const row = currentProductionDocument.value;
  if (!row) return [];
  const raw = row.raw;

  if (activePage.value === 'tasks') {
    const products = taskProductRowsFromRaw(raw, text(raw.code));
    const unit = products[0]?.unit || text(raw.unit, '件');
    const demandTotal = sumNumbers(products.map((product) => toNumber(product.demandQty)));
    const demandSummary = taskProductQuantitySummary(products, (product) => toNumber(product.demandQty));
    const plannedSummary = taskProductQuantitySummary(products, (product) => taskProductPlannedQty(product, text(raw.code)));
    const inboundMetric = taskProductProgressMetric(products, (product) => taskProductInboundQty(product, text(raw.code)));
    const relatedOrders = production2WorkOrders.filter((order) => workOrderSourceAllocationsFromRaw(
      order as unknown as AnyRecord,
      text(order.taskCode, ''),
      text((order as unknown as AnyRecord).sourceLineId, ''),
    ).some((allocation) => allocation.taskCode === text(raw.code)));
    return [
      {
        title: '任务基础',
        facts: [
          { label: '来源单据', value: taskSourceDocumentFromRaw(raw) },
          { label: '负责人', value: text(raw.owner) },
          { label: '优先级', value: text(raw.priority) },
          { label: '创建时间', value: text(raw.createdAt) },
          { label: '交期', value: text(raw.deliveryDate) },
          { label: '计划生产', value: demandSummary },
          { label: '入库进度', value: formatTaskProgress(inboundMetric.current, inboundMetric.total) },
        ],
      },
      {
        title: '成品明细',
        note: `已建工单 ${plannedSummary}`,
        lines: products.map((product) => ({
          title: product.productName || product.productCode || '待选择成品',
          meta: [product.productCode, product.model, product.spec].filter(Boolean).join(' · '),
          values: [
            { label: '计划生产', value: qty(product.demandQty, product.unit) },
            { label: '已建工单', value: qty(taskProductPlannedQty(product, text(raw.code)), product.unit) },
            { label: '已入库', value: qty(taskProductInboundQty(product, text(raw.code)), product.unit) },
            { label: '待建工单', value: qty(taskProductScheduleGap(product, text(raw.code)), product.unit) },
          ],
        })),
      },
      {
        title: '预估物料与备料',
        note: products.length > 1
          ? materialTaskListTitle(raw.materialNeeds, text(raw.code))
          : materialTaskReadinessLabel(raw.materialNeeds, demandTotal, unit),
        lines: taskMaterialReadinessRows(
          raw.materialNeeds,
          !taskReleaseIsCompleteForProducts(products, text(raw.code)),
        ).map((material) => ({
          title: material.name,
          meta: material.code,
          status: material.status,
          values: [
            { label: '预计用量', value: material.requiredQty },
            { label: '可用库存', value: material.availableQty },
            { label: '缺口', value: qty(material.shortageValue, material.unit) },
            { label: '已申请', value: taskMaterialRequestedQty(material) },
            { label: '待检', value: material.qcPendingQty },
            { label: '待入库/在途', value: `${material.pendingInboundQty} / ${material.inTransitQty}` },
            { label: '预留/分配', value: `${material.reservedQty} / ${material.allocatedQty}` },
          ],
        })),
      },
      {
        title: '关联工单',
        note: `${relatedOrders.length} 张生产工单`,
        lines: relatedOrders
          .map((order) => ({
            title: order.code,
            meta: `${order.productName} · ${order.recipeCode} · ${order.processTemplateCode}`,
            status: order.status,
            route: `/production/work-orders/${encodeURIComponent(text(order.code))}`,
            values: [
              { label: '本任务分配', value: qty(workOrderSourceAllocationsFromRaw(order as unknown as AnyRecord, text(order.taskCode, ''), text((order as unknown as AnyRecord).sourceLineId, '')).filter((allocation) => allocation.taskCode === text(raw.code)).reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0), order.unit) },
              { label: '工单计划', value: qty(order.planQty, order.unit) },
              { label: '交期', value: text(order.dueDate) },
            ],
          })),
      },
    ];
  }

  if (activePage.value === 'work-orders') {
    const releaseFacts = workOrderReleaseFacts(raw);
    const recipeSnapshot = workOrderRecipeSnapshot(raw);
    const processSnapshot = workOrderProcessSnapshot(raw);
    const releaseBatches = workOrderReleaseBatches(raw.code);
    const executionCards = workOrderExecutionCards(raw.code);
    const remainingMaterialNeeds = workOrderRemainingMaterialNeeds(raw, releaseFacts.unreleasedQty);
    const materialReserveLines = releaseFacts.unreleasedQty > 0
      ? materialNeedLines(remainingMaterialNeeds, text(raw.code))
      : [];
    const sourceAllocations = workOrderSourceAllocationsFromRaw(raw, text(raw.taskCode || raw.sourceTask, ''), text(raw.sourceLineId, ''));
    const sourceTaskCount = new Set(sourceAllocations.map((allocation) => allocation.taskCode).filter(Boolean)).size;
    const sourceRequirementFacts = workOrderRequirementFacts(raw);
    const arrangementExecutionLines = workOrderReleaseExecutionLines(raw.code);
    return [
      {
        title: '任务需求',
        note: sourceAllocations.length
          ? `${sourceTaskCount} 个任务 · ${sourceAllocations.length} 条需求 · 本工单 ${qty(raw.planQty, raw.unit)}`
          : '历史工单未关联任务需求，后续变更时必须补齐关系',
        headers: ['生产任务 / 来源', '需求数量', '本工单数量', '要求日期'] as [string, string, string, string],
        plainValues: true,
        ...(sourceAllocations.length
          ? {
              lines: sourceAllocations.map((allocation) => ({
                title: allocation.taskCode,
                meta: allocation.sourceDocument || '独立生产需求',
                route: `/production/tasks/${encodeURIComponent(allocation.taskCode)}`,
                values: [
                  { label: '需求数量', value: workOrderDemandTotalForAllocation(allocation) },
                  { label: '本工单数量', value: qty(allocation.quantity, allocation.unit) },
                  { label: '要求日期', value: allocation.dueDate || '-' },
                ],
              })),
            }
          : { facts: [{ label: '关系状态', value: '待补齐任务需求' }] }),
      },
      ...(sourceRequirementFacts.length
        ? [{
            title: '生产要求与备注',
            facts: sourceRequirementFacts,
          }]
        : []),
      {
        title: '生产执行记录',
        note: executionCards.length
          ? `${executionCards.length} 个生产批次`
          : releaseBatches.length
            ? `${releaseBatches.length} 个待执行安排`
            : '',
        headers: ['安排/批次', '数量', '当前状态', '执行明细'] as [string, string, string, string],
        ...(arrangementExecutionLines.length
          ? { lines: arrangementExecutionLines }
          : { facts: [{ label: '当前情况', value: '尚未形成生产安排' }] }),
      },
      ...(materialReserveLines.length
        ? [{
            title: releaseFacts.releasedQty > 0 ? '剩余物料储备' : '物料储备',
            note: materialNeedHint(remainingMaterialNeeds, text(raw.code)),
            headers: ['物料', '预计需求', '库存判断', '数量明细'] as [string, string, string, string],
            lines: materialReserveLines,
          }]
        : []),
      {
        title: '工单配方',
        note: workOrderRecipeSnapshotNote(raw, recipeSnapshot),
        lines: workOrderRecipeSnapshotLines(raw, recipeSnapshot),
      },
      {
        title: '工单工艺',
        note: workOrderProcessSnapshotNote(raw, processSnapshot),
        lines: workOrderProcessSnapshotLines(raw, processSnapshot),
      },
    ];
  }

  if (activePage.value === 'execution-cards') {
    const relatedQualityTasks = qualityTasksForExecutionCard(raw.code);
    const qualityBlocksNewPackaging = relatedQualityTasks.some((task) => (
      productionQualityTaskIsPending(task as unknown as AnyRecord)
      || productionQualityTaskNeedsDisposition(task as unknown as AnyRecord)
    ));
    const quantityChain = executionCardQuantityChain(raw);
    const routeType = executionCardRouteType(raw);
    const operationJobs = executionCardOperationJobs(raw);
    const sourceWorkOrder = executionCardSourceWorkOrder(raw);
    const sourceRequirementFacts = workOrderRequirementFacts(sourceWorkOrder);
    const planSnapshot = executionCardPlanSnapshot(raw);
    const planRecipe = executionCardPlanRecipe(raw);
    const planProcess = executionCardPlanProcess(raw);
    const materialIssues = executionCardMaterialMoves(raw, runtimeProductionIssues.value);
    const materialReturns = executionCardMaterialMoves(raw, runtimeProductionReturns.value);
    const materialEvidenceMissing = executionCardMaterialEvidenceMissing(raw, materialIssues, materialReturns);
    const materialMovementLines = executionCardMaterialMovementLines(raw);
    const wipBatches = toArray<Production2WipBatch>(raw.wipBatches);
    const lineageRecords = toArray<Production2BatchLineageRecord>(raw.lineageRecords);
    const wipTotals = executionCardWipTotals(wipBatches, lineageRecords);
    const wipTraceLines: DetailLine[] = wipBatches.map((batch) => {
      const outputs = lineageRecords.filter((item) => item.sourceWipBatchCode === batch.code);
      const metrics = wipBatchMetrics(batch, outputs);
      return {
        title: batch.code,
        meta: `大盘半成品 · ${text(batch.sourceReportCode)} · ${text(batch.producedAt)}`,
        status: batch.status,
        values: [
          { label: '实际净重', value: qty(batch.netWeightKg, 'kg') },
          { label: '质检合格', value: qty(batch.qualifiedWeightKg, 'kg') },
          { label: '复绕用量', value: qty(metrics.usedWeightKg, 'kg') },
          { label: '工艺损耗', value: qty(metrics.lossWeightKg, 'kg') },
          { label: '可用重量', value: qty(batch.availableWeightKg, 'kg') },
          { label: '小盘产出', value: outputs.length ? `${qty(sumNumbers(outputs.map((item) => item.outputQty)), raw.unit)} · ${smallRollCodeSummary(outputs)}` : '尚未复绕产出', full: true },
        ],
      };
    });
    return [
      {
        title: '生产依据',
        note: executionCardPlanSnapshotNote(raw),
        facts: [
          { label: '配方版本', value: text(planRecipe?.code, text(sourceWorkOrder?.recipeCode, '-')), route: planRecipe?.code ? `/production/recipes/${encodeURIComponent(text(planRecipe.code))}` : undefined },
          { label: '工艺版本', value: text(planProcess?.code, text(raw.processTemplateCode, '-')), route: planProcess?.code ? `/production/process-templates/${encodeURIComponent(text(planProcess.code))}` : undefined },
          { label: '生产路线', value: routeType },
          { label: '计划产线', value: executionCardPlannedLineSummary(raw) },
          { label: '班次', value: text(raw.shift) },
          {
            label: '确认记录',
            value: [
              text(planSnapshot.frozenAt, ''),
              productionActorLabel(planSnapshot.frozenBy, text(sourceWorkOrder?.owner, '系统')),
            ].filter(Boolean).join(' · ') || '-',
          },
          { label: '计量口径', value: routeType === '大盘复绕' ? `大盘半成品按 kg · 复绕成品按${text(raw.unit, '卷')}` : `成品按${text(raw.unit, '-')}`, full: true },
        ],
      },
      ...(sourceRequirementFacts.length
        ? [{
            title: '生产要求与备注',
            facts: sourceRequirementFacts,
          }]
        : []),
      {
        title: '现场产出',
        facts: [
          { label: '报工进度', value: `${qty(raw.reportedQty, raw.unit)} / ${qty(raw.planQty, raw.unit)}` },
          ...(quantityChain.pendingReportQty > 0
            ? [{ label: '待报工', value: qty(quantityChain.pendingReportQty, raw.unit) }]
            : []),
          ...(toNumber(raw.reportedQty) > 0 || toNumber(raw.qualifiedQty) > 0 || quantityChain.defectQty > 0
            ? [{ label: '报工检合格', value: qty(raw.qualifiedQty, raw.unit) }]
            : []),
          ...(quantityChain.defectQty > 0
            ? [{ label: executionCardQualityRemainderStage(raw.code), value: qty(quantityChain.defectQty, raw.unit) }]
            : []),
          ...(quantityChain.packedQty > 0 || (toNumber(raw.qualifiedQty) > 0 && !qualityBlocksNewPackaging)
            ? [{ label: '包装进度', value: `${qty(quantityChain.packedQty, raw.unit)} / ${qty(raw.qualifiedQty, raw.unit)}` }]
            : []),
          ...(toNumber(raw.releasedInboundQty) > 0
            ? [{ label: '入库检放行', value: qty(raw.releasedInboundQty, raw.unit) }]
            : []),
          ...(quantityChain.inboundHoldQty > 0
            ? [{ label: '入库检冻结', value: qty(quantityChain.inboundHoldQty, raw.unit) }]
            : []),
          ...(quantityChain.inboundScrappedQty > 0 ? [{ label: '入库检报废', value: qty(quantityChain.inboundScrappedQty, raw.unit) }] : []),
          ...(toNumber(raw.releasedInboundQty) > 0 || toNumber(raw.inboundQty) > 0
            ? [{ label: '入库进度', value: `${qty(raw.inboundQty, raw.unit)} / ${qty(raw.planQty, raw.unit)}` }]
            : []),
        ],
      },
      {
        title: '质量记录',
        note: executionCardQualitySummary(raw),
        headers: ['质检任务', '判定', '状态', '检验信息'],
        lines: relatedQualityTasks.length ? qualityTaskLinesForExecutionCard(raw.code) : [],
      },
      ...(toArray<AnyRecord>(raw.packagingRecords).length ? [{
        title: '包装记录',
        note: `${toArray<AnyRecord>(raw.packagingRecords).length} 个包装批`,
        lines: toArray<AnyRecord>(raw.packagingRecords).map((record) => ({
          title: text(record.packageRef, text(record.code)),
          meta: `${text(record.code)} · ${text(record.packedAt)}`,
          status: '已确认',
          values: [
            { label: '包装数量', value: qty(record.quantity, record.unit) },
            { label: '操作人', value: productionActorLabel(record.actor) },
            { label: '入库抽检', value: text(record.qualityTaskCode) },
          ],
        })),
      }] : []),
      ...(materialMovementLines.length ? [{
        title: '领退料实绩',
        note: materialEvidenceMissing
          ? '业务状态已领料 · 历史领退凭证未关联'
          : `${materialIssues.length} 张领料 · ${materialReturns.length} 张退料${materialReturns.some((move) => text(move.status) !== '已完成') ? '（含待确认）' : ''}`,
        headers: ['物料', '计划标准', '领退状态', '实绩与凭证'] as [string, string, string, string],
        lines: materialMovementLines,
      }] : []),
      ...(raw.shortClosedAt ? [{
        title: '提前结束与剩余计划',
        facts: [
          { label: '结束时间', value: text(raw.shortClosedAt) },
          { label: '操作人', value: text(raw.shortClosedBy) },
          { label: '剩余计划', value: qty(raw.shortCloseRemainingQty, raw.unit) },
          { label: '处理结果', value: text(raw.shortCloseResolution, '待处理') },
          { label: '提前结束原因', value: text(raw.shortCloseReason), full: true, multiline: true },
          ...(raw.shortCloseResolvedAt ? [
            { label: '处理时间', value: text(raw.shortCloseResolvedAt) },
            { label: '处理人', value: text(raw.shortCloseResolvedBy) },
            { label: '处理原因', value: text(raw.shortCloseResolutionReason), full: true, multiline: true },
          ] : []),
          ...(raw.shortCloseSupplementJobCode ? [
            { label: '补充设备作业', value: text(raw.shortCloseSupplementJobCode), full: true },
          ] : []),
          ...(text(raw.shortCloseResolution) === '接受短缺' ? [
            { label: '接受短缺', value: qty(raw.acceptedShortageQty, raw.unit) },
          ] : []),
        ],
      }] : []),
      ...(wipBatches.length ? [{
        title: '大盘半成品重量',
        facts: [
          { label: '实际净重', value: qty(wipTotals.netWeightKg, 'kg') },
          { label: '质检合格', value: qty(wipTotals.qualifiedWeightKg, 'kg') },
          { label: '复绕用量', value: qty(wipTotals.usedWeightKg, 'kg') },
          { label: '工艺损耗', value: qty(wipTotals.lossWeightKg, 'kg') },
          { label: '可用重量', value: qty(wipTotals.availableWeightKg, 'kg') },
          { label: '小盘产出', value: qty(wipTotals.outputQty, raw.unit) },
        ],
      }] : []),
      ...(operationJobs.length ? [{
        title: '设备作业',
        headers: ['作业', '产线', '状态', '数量与时间'] as [string, string, string, string],
        lines: executionCardOperationJobLines(raw, operationJobs),
      }] : []),
      {
        title: '工艺执行',
        note: `${executionCardCurrentStageName(raw)} · ${executionCardProcessStageProgressSummary(raw)}`,
        headers: ['工艺阶段', '当前动作', '状态', '执行信息'],
        lines: executionCardProcessStageLines(raw),
      },
      ...(wipTraceLines.length ? [{
        title: '大盘与小盘谱系',
        note: `${wipBatches.length} 个大盘半成品 · ${lineageRecords.length} 个成品小盘；每个小盘保留来源大盘。`,
        headers: ['大盘批次', '实际净重', '状态', '用量与产出'] as [string, string, string, string],
        lines: wipTraceLines,
      }] : []),
    ];
  }

  if (activePage.value === 'quality') {
    return [
      {
        title: '检验要求',
        facts: [
          { label: '质检类型', value: text(raw.kind) },
          { label: '来源批次', value: text(raw.sourceCard) },
          { label: '生产工单', value: text(raw.workOrderCode) },
          { label: '抽检数量', value: text(raw.sampleQty) },
          { label: '判定结果', value: text(raw.result) },
          { label: '处置方式', value: text(raw.disposition) },
        ],
      },
      {
        title: '检查项',
        lines: toArray<string>(raw.checkpoints).map((checkpoint, index) => ({
          title: checkpoint,
          meta: `检查项 ${index + 1}`,
          status: text(raw.status),
          values: [{ label: '要求', value: checkpoint }],
        })),
      },
    ];
  }

  if (activePage.value === 'quality-standards') {
    return [
      {
        title: '标准内容',
        facts: [
          { label: '检验类型', value: text(raw.inspectionType) },
          { label: '适用对象', value: text(raw.appliesTo) },
          { label: '抽样规则', value: text(raw.sampleRule) },
          { label: '判定规则', value: text(raw.acceptance), full: true, multiline: true },
        ],
      },
      {
        title: '检查项',
        lines: toArray<string>(raw.checkpoints).map((checkpoint, index) => ({
          title: checkpoint,
          meta: `检查项 ${index + 1}`,
          status: text(raw.status),
          values: [{ label: '标准', value: checkpoint }],
        })),
      },
    ];
  }

  if (activePage.value === 'material-requests') {
    return [
      {
        title: '申请来源',
        facts: [
          { label: '申请类型', value: text(raw.requestType) },
          { label: '来源任务', value: text(raw.sourceTaskCode, '-') },
          { label: '来源单据', value: text(raw.sourceDocument, '-') },
          { label: '需求日期', value: text(raw.expectedDate) },
          { label: '处理规则', value: '提交后系统按当前可用库存形成计划快照；新增缺口自动转采购需求，仓库不受理计划申请。', full: true, multiline: true },
        ],
      },
      {
        title: '备料明细',
        note: materialRequestLineSummary(raw.lines),
        lines: materialRequestLinesFromRaw(raw.lines, text(raw.code)).map((line) => ({
          title: line.materialName || '未选择物料',
          meta: line.materialCode || '-',
          status: toNumber(line.purchaseQty) > 0 ? '需采购' : '可备料',
          values: [
            { label: '申请数量', value: qty(line.requestedQty, line.unit) },
            { label: '当前库存', value: qty(line.availableQty, line.unit) },
            { label: '需采购', value: qty(line.purchaseQty, line.unit) },
            { label: '用途', value: line.purpose || '-' },
          ],
        })),
      },
      {
        title: '采购联动',
        facts: [
          { label: '采购需求', value: text(raw.linkedPurchaseRequisition, '待生成') },
          { label: '备注', value: text(raw.note), full: true, multiline: true },
        ],
      },
    ];
  }

  if (activePage.value === 'recipes') {
    return [
      {
        title: '配方基础',
        facts: [
          { label: '配方编号', value: text(raw.code) },
          { label: '版本号', value: text(raw.version) },
          { label: '产出物料', value: text(raw.productName) },
          { label: '物料编码', value: text(raw.productCode) },
          { label: '每单位净重', value: `${formatKg(raw.productUnitWeightKg)} kg/${text(raw.outputUnit)}` },
          { label: '更新时间', value: text(raw.updatedAt) },
          { label: '备注', value: text(raw.note || raw.remark), full: true, multiline: true },
        ],
      },
      {
        title: '投料组成与固定用量',
        note: recipePercentHint(raw.materials),
        lines: recipeMaterialLines(raw.materials),
      },
      {
        title: '预估损耗规则',
        note: recipeEstimatedLossHint(raw.estimatedLosses),
        lines: recipeEstimatedLossLines(raw.estimatedLosses),
      },
    ];
  }

  if (activePage.value === 'process-templates') {
    return [
      {
        title: '工艺基础',
        facts: [
          { label: '工艺名称', value: text(raw.name) },
          { label: '版本号', value: text(raw.version) },
          { label: '启用状态', value: text(raw.status) },
        ],
      },
      {
        title: '温区',
        note: processTemplateZoneSummary(raw.temperatureZones),
        lines: processTemplateZoneLines(raw.temperatureZones, raw.status),
      },
      {
        title: '工序编排',
        note: `${toArray(raw.stepCodes).length} 道工序`,
        lines: processTemplateStepLines(raw.stepCodes, raw.status, raw.stepInstructions || raw.steps, text(raw.routeType)),
      },
    ];
  }

  if (activePage.value === 'process-steps') {
    const actions = processStepActionsFromRaw(raw).map((action, index) => processStepDraftActionFromRaw(action, text(raw.code, 'process-step'), index));
    return [
      {
        title: '节点定位',
        facts: [
          { label: '流转方式', value: text(raw.autoAdvance, actions.length ? '动作完成后自动推进' : '仅提示不阻断') },
          { label: '启用状态', value: text(raw.status) },
          { label: '作业提示', value: text(raw.workInstruction || raw.description), full: true, multiline: true },
        ],
      },
      {
        title: '完成与异常',
        facts: [
          { label: '完成条件', value: text(raw.completionRule || raw.passAction), full: true, multiline: true },
          { label: '异常规则', value: text(raw.abnormalRule || raw.failAction), full: true, multiline: true },
          { label: '批次规则', value: text(raw.batchRule), full: true, multiline: true },
        ],
      },
      {
        title: '动作配置',
        note: actions.length ? `${actions.length} 项动作 · 阻断 ${actions.filter((action) => action.blocking).length} 项` : '未配置动作',
        lines: actions.map((action) => ({
          title: action.label,
          meta: `${action.actor} · ${action.triggerTiming}`,
          status: action.blocking ? '阻断' : '不阻断',
          values: [
            { label: '生成', value: action.generatedTask },
            { label: '完成', value: action.completionEvent },
            { label: '质检标准', value: action.qualityStandard || '-' },
            { label: '异常', value: action.abnormalEvent },
          ],
        })),
      },
    ];
  }

  if (activePage.value === 'loss-ledger') {
    const unclassifiedLossKg = lossRecordUnclassifiedKg(raw);
    const abnormalLossKg = toNumber(raw.abnormalLossKg);
    const responsiblePerson = text(raw.responsiblePerson, '');
    const responsibilityDept = text(raw.responsibilityDept, '');
    const responsibilityFacts: DetailFact[] = responsiblePerson
      ? [
        { label: '责任人', value: responsiblePerson },
        { label: '责任部门', value: responsibilityDept || '未指定' },
      ]
      : unclassifiedLossKg > 0
        ? [{ label: '责任状态', value: '待损耗分类后判定' }]
        : abnormalLossKg > 0
          ? [{ label: '责任状态', value: '尚未判定' }]
          : [{ label: '责任判定', value: '工艺内损耗，无需归责' }];
    const sourceFactLabel = text(raw.sourceDoc).startsWith('PRPT2-')
      ? '来源报工'
      : /^(QC2-|PQC-|IQC-)/.test(text(raw.sourceDoc))
        ? '来源质检'
        : '来源单据';
    return [
      {
        title: '来源追溯',
        facts: [
          { label: sourceFactLabel, value: text(raw.sourceDoc), route: productionLossSourceRoute(raw) },
          ...(text(raw.sourceEvidenceCode, '')
            ? [{ label: '来源凭证', value: text(raw.sourceEvidenceCode) }]
            : []),
          { label: '生产工单', value: text(raw.workOrderCode), route: productionObjectRoute(text(raw.workOrderCode)) },
          { label: '生产批次', value: text(raw.productionBatchCode), route: productionObjectRoute(text(raw.productionBatchCode)) },
          { label: '工序', value: text(raw.processStep) },
          { label: '产线', value: text(raw.line) },
          ...(text(raw.equipment, '') ? [{ label: '设备', value: text(raw.equipment) }] : []),
        ],
      },
      {
        title: '损耗判断',
        facts: [
          { label: '总损耗', value: `${numberText(raw.lossKg)} kg` },
          { label: '工艺内损耗', value: `${numberText(raw.plannedLossKg)} kg` },
          { label: '异常损耗', value: `${numberText(raw.abnormalLossKg)} kg` },
          ...(unclassifiedLossKg > 0
            ? [{ label: '待分类损耗', value: `${numberText(unclassifiedLossKg)} kg`, tone: 'warning' as const }]
            : []),
          { label: '确认依据', value: text(raw.disposition) },
        ],
      },
      {
        title: '记录与责任',
        facts: [
          { label: '班次', value: text(raw.shift) },
          { label: '记录人', value: text(raw.operator) },
          { label: '现场负责人', value: text(raw.leader) },
          ...responsibilityFacts,
          ...(text(raw.reason, '')
            ? [{ label: '损耗说明', value: text(raw.reason), full: true, multiline: true }]
            : []),
        ],
      },
    ];
  }

  const exceptionFacts: DetailFact[] = [
    { label: '异常级别', value: text(raw.level) },
    ...(!isQualityProductionException(raw) && text(raw.outcome, '') ? [{ label: '现场结论', value: text(raw.outcome) }] : []),
    { label: '影响数量', value: qty(raw.affectedQty, raw.unit || '件') },
    { label: '影响说明', value: productionDisplayTerm(raw.effect), full: true, multiline: true },
    { label: '损失预估', value: text(raw.estimatedLoss) },
  ];
  const exceptionDispositionFacts: DetailFact[] = [
    { label: '责任分工', value: productionDisplayTerm(text(raw.responsibility, '-')) },
    { label: '原因', value: productionDisplayTerm(raw.cause), full: true, multiline: true },
    {
      label: text(raw.type) === '缺料' ? '当前处理' : '处置方式',
      value: productionExceptionDispositionSummary(raw),
      full: true,
      multiline: true,
    },
  ];
  if (text(raw.resolution, '')) {
    exceptionDispositionFacts.push({ label: '处理结论', value: productionDisplayTerm(raw.resolution), full: true, multiline: true });
    exceptionDispositionFacts.push(
      { label: '关闭人', value: text(raw.resolvedBy, '-') },
      { label: '关闭时间', value: text(raw.resolvedAt, '-') },
    );
  }
  const priorState = raw.priorState && typeof raw.priorState === 'object' ? raw.priorState as AnyRecord : undefined;
  if (priorState) {
    exceptionDispositionFacts.push({
      label: '原执行阶段',
      value: [text(priorState.node, ''), text(priorState.status, '')].filter(Boolean).join(' · ') || '-',
    });
  }
  const shortageMaterialLines = exceptionShortageMaterialLines(raw);
  return [
    {
      title: '异常判断',
      facts: exceptionFacts,
    },
    {
      title: '责任与处置',
      facts: exceptionDispositionFacts,
    },
    ...(shortageMaterialLines.length
      ? [{ title: '物料储备校验', lines: shortageMaterialLines }]
      : []),
    {
      title: '关联执行对象',
      lines: exceptionRelatedLines(raw),
    },
  ];
});

const productionMoreActions = computed<ProductionMoreAction[]>(() => {
  if (!canWriteProduction.value || !['work-orders', 'recipes', 'process-templates'].includes(activePage.value)) return [];
  if (activePage.value === 'recipes') {
    if (recipeDraft.value.status === '草稿') {
      return [{
        key: 'change',
        label: '编辑草稿',
        description: '调整配方内容；启用版本后将不再允许直接修改。',
      }];
    }
    if (recipeDraft.value.status === '启用') {
      return [{
        key: 'disable',
        label: '停用版本',
        description: '停止新生产任务和工单继续选用，历史引用保持不变。',
        tone: 'danger',
      }];
    }
    return [];
  }
  if (activePage.value === 'process-templates') {
    if (processTemplateDraft.value.status === '草稿') {
      return [{
        key: 'change',
        label: '编辑草稿',
        description: '调整路线、参数和阶段要求；启用后不再允许直接修改。',
      }];
    }
    if (processTemplateDraft.value.status === '启用') {
      return [{
        key: 'disable',
        label: '停用版本',
        description: '停止新生产工单继续选用，历史工单保留当时确认的版本。',
        tone: 'danger',
      }];
    }
    return [];
  }
  return [
    {
      key: 'change',
      label: isProductionRuleDocument.value ? '编辑' : '变更',
      description: isProductionRuleDocument.value ? '进入规则维护页面，调整版本、范围和检查项。' : '进入变更页面，调整数量、日期、负责人或处置内容。',
    },
  ];
});

const productionAttachments = computed(() => {
  const row = currentProductionDocument.value;
  const code = row?.code || 'new';
  const persisted = toArray<Attachment>((row?.raw as AnyRecord | undefined)?.attachments);
  return [
    ...persisted,
    ...(productionDocumentUploadedAttachments.value[code] || []),
  ];
});

const processTemplateUsesInlineAttachments = computed(() => isProcessTemplateDocument.value && processTemplateIsEditable.value);
const showProductionAttachmentSection = computed(() =>
  !processTemplateUsesInlineAttachments.value
  && (
    productionAttachments.value.length > 0
    || (
      isProductionEditableDocument.value
      && !productionPersistenceUnavailableMessage.value
      && !isProductionRecordDocument.value
      && ['work-orders', 'recipes', 'process-templates'].includes(activePage.value)
      && (!isRecipeDocument.value || recipeIsEditable.value)
      && (!isProcessTemplateDocument.value || processTemplateIsEditable.value)
      && (activePage.value !== 'work-orders' || !isProductionNewDocument.value || workOrderDraft.value.sourceAllocations.length > 0)
    )
  ),
);

const showProductionSummaryPanel = computed(() => {
  if (isProcessStepDocument.value) return false;
  if (activePage.value === 'work-orders' && isProductionEditableDocument.value) {
    return workOrderDraft.value.sourceAllocations.length > 0;
  }
  if (showProductionAttachmentSection.value) return true;
  if (isRecipeDocument.value && recipeIsEditable.value && recipeDraft.value.productCode) return true;
  if (isProcessTemplateDocument.value && !processTemplateIsEditable.value) return true;
  if (isTaskDocument.value && !isProductionEditableDocument.value) return true;
  if (isMaterialRequestDocument.value && !isProductionEditableDocument.value) return true;
  if (activePage.value === 'work-orders' && !isProductionEditableDocument.value) return true;
  if (activePage.value === 'execution-cards' && !isProductionEditableDocument.value) return true;
  return !isProductionEditableDocument.value
    && !isTaskDocument.value
    && !['material-requests', 'work-orders', 'execution-cards', 'process-steps'].includes(activePage.value)
    && !isProductionRecordDocument.value;
});

const productionFlowRecords = computed(() => {
  if (activePage.value === 'recipes') return recipeFlowRecords.value;
  if (activePage.value === 'process-templates') return processTemplateFlowRecords.value;
  if (activePage.value === 'exceptions') return exceptionFlowRecords.value;
  const row = currentProductionDocument.value;
  return [
    {
      time: `${row?.date || '2026-07-01'} 09:10`,
      actor: row?.owner || '系统',
      action: isProductionRuleDocument.value ? '维护创建' : '单据创建',
      remark: `${row?.title || activeListTitle.value} 已进入${activeListTitle.value}流程。`,
    },
    {
      time: `${row?.date || '2026-07-01'} 10:20`,
      actor: row?.owner || '系统',
      action: row?.status || '待处理',
      remark: row?.nextStep || '等待下一步处理。',
    },
  ];
});

const referencePath = computed(() => (currentProductionDocument.value ? `/production/${activePage.value}/${currentProductionDocument.value.code}` : ''));
const referenceTitle = computed(() => currentProductionDocument.value?.title || activeListTitle.value);
const referenceSubtitle = computed(() => currentProductionDocument.value?.code || '');
const productionDocumentAttachmentTitle = computed(() => {
  if (productionDocumentIsReadOnlyView.value) {
    return '详情页只允许查看附件，请通过变更/编辑进入维护。';
  }
  if (productionPersistenceUnavailableMessage.value) return productionPersistenceUnavailableMessage.value;
  if (activePage.value === 'process-templates') return '上传工艺卡、设备参数或作业指导书';
  return isRecipeDocument.value ? '上传配方依据、工艺文件或版本说明' : '上传生产、质检、工艺或处置附件';
});
const productionDocumentAttachmentEmptyText = computed(() => {
  if (productionDocumentIsReadOnlyView.value || productionEditableActionDisabled.value) return '暂无附件';
  if (activePage.value === 'process-templates') return '可上传工艺卡、设备参数或作业指导书';
  return isRecipeDocument.value ? '暂无附件' : '可上传生产依据、工艺文件、质检照片或处置说明';
});

watch(
  [currentProductionDocument, isProductionEditableDocument, activePage],
  ([row]) => {
    if (!row) {
      productionDraftHydrated.value = false;
      productionHydratedEditorKey = '';
      return;
    }
    const copySourceKey = isProductionNewDocument.value && route.query.copy
      ? [
          text(route.query.copy, ''),
          activePage.value === 'recipes'
            ? (recipeRuntimeHasSnapshot.value ? 'ready' : 'loading')
            : activePage.value === 'process-templates'
              ? (processTemplateRuntimeHasSnapshot.value ? 'ready' : 'loading')
              : 'ready',
        ].join(':')
      : '';
    const taskSourceKey = isProductionNewDocument.value && route.query.task
      ? [
          text(route.query.task, ''),
          ['material-requests', 'work-orders'].includes(activePage.value)
            ? (productionRuntimeDataHasSnapshot.value ? 'ready' : 'loading')
            : 'ready',
        ].join(':')
      : '';
    const newDocumentSourceKey = copySourceKey || taskSourceKey;
    const editorKey = [
      activePage.value,
      isProductionNewDocument.value ? `new:${newDocumentSourceKey}` : row.code,
      isProductionEditableDocument.value ? 'edit' : 'detail',
    ].join(':');
    if (productionHydratedEditorKey === editorKey && isProductionEditableDocument.value) return;
    productionDraft.value = draftFromRow(row);
    taskDraft.value = activePage.value === 'tasks' ? taskDraftFromRow(row) : emptyProductionTaskDraft();
    materialRequestDraft.value = activePage.value === 'material-requests' ? materialRequestDraftFromRow(row) : emptyMaterialRequestDraft();
    workOrderDraft.value = activePage.value === 'work-orders' ? workOrderDraftFromRow(row) : emptyWorkOrderDraft();
    recipeDraft.value = activePage.value === 'recipes' ? recipeDraftFromRow(row) : emptyRecipeDraft();
    processTemplateDraft.value = activePage.value === 'process-templates' ? processTemplateDraftFromRow(row) : emptyProcessTemplateDraft();
    processStepDraft.value = activePage.value === 'process-steps' ? processStepDraftFromRow(row) : emptyProcessStepDraft();
    productionValidationAttempted.value = false;
    productionHydratedEditorKey = editorKey;
    productionDraftHydrated.value = true;
    if (isProductionEditableDocument.value) {
      void nextTick().then(() => resetUnsavedChanges());
    }
  },
  { immediate: true },
);

watch(
  () => [session.user.accountCode, session.user.employeeCode, session.user.name, session.user.department] as const,
  ([, employeeCode, name, department], previous) => {
    if (!isProductionNewDocument.value) return;
    const previousEmployeeCode = previous?.[1] || '';
    const previousName = previous?.[2] || '';

    if (activePage.value === 'material-requests') {
      materialRequestDraft.value.requesterEmployeeCode = employeeCode || '';
      materialRequestDraft.value.requester = name || '待识别';
      materialRequestDraft.value.department = department || '待识别';
      return;
    }

    if (
      activePage.value === 'tasks'
      && (!taskDraft.value.ownerEmployeeCode
        || (taskDraft.value.ownerEmployeeCode === previousEmployeeCode && taskDraft.value.owner === previousName))
    ) {
      taskDraft.value.ownerEmployeeCode = employeeCode || '';
      taskDraft.value.owner = name || '待指定';
      return;
    }

  },
  { immediate: true },
);

watch(
  taskDraft,
  (draft) => {
    if (activePage.value !== 'tasks') return;
    productionDraft.value = {
      ...productionDraft.value,
      code: draft.code || productionDraft.value.code || '',
      title: draft.code || '新建生产任务',
      source: taskSourceDisplay(draft),
      date: draft.deliveryDate || productionDraft.value.date || '',
      owner: draft.owner || productionDraft.value.owner || '',
      status: draft.status || productionDraft.value.status || '',
      nextStep: draft.nextStep || taskNextAction(draft.status),
      productCode: draft.productCode,
      demandQty: draft.demandQty,
      productionQty: compactNumber(taskDemandTotal.value, 3),
    };
  },
  { deep: true },
);

watch(
  materialRequestDraft,
  (draft) => {
    if (activePage.value !== 'material-requests') return;
    productionDraft.value = {
      ...productionDraft.value,
      code: draft.code || productionDraft.value.code || '',
      title: draft.requestType || '待选择申请类型',
      source: draft.sourceTaskCode || draft.sourceDocument || '',
      date: draft.expectedDate || productionDraft.value.date || '',
      owner: draft.requester || productionDraft.value.owner || '',
      status: draft.status || productionDraft.value.status || '',
      nextStep: draft.nextStep || materialRequestNextAction(draft.status),
    };
  },
  { deep: true },
);

watch(
  workOrderDraft,
  (draft) => {
    if (activePage.value !== 'work-orders') return;
    productionDraft.value = {
      ...productionDraft.value,
      code: draft.code || productionDraft.value.code || '',
      title: draft.productName || '待选择成品',
      source: draft.taskCode || '直接新建',
      date: draft.dueDate || productionDraft.value.date || '',
      owner: draft.owner || productionDraft.value.owner || '',
      status: draft.status || productionDraft.value.status || '',
      nextStep: draft.nextStep || workOrderNextAction(draft.status),
      productCode: draft.productCode,
      planQty: draft.planQty,
      unit: draft.unit,
      recipeCode: draft.recipeCode,
      processTemplateCode: draft.processTemplateCode,
      plannedDate: draft.plannedDate,
      dueDate: draft.dueDate,
      sourceLineId: draft.sourceLineId,
      note: draft.note,
    };
  },
  { deep: true },
);

watch(
  recipeDraft,
  (draft) => {
    if (activePage.value !== 'recipes') return;
    productionDraft.value = {
      ...productionDraft.value,
      code: draft.code || productionDraft.value.code || '',
      title: draft.code || '待生成配方编号',
      source: draft.productName || '待选择适用成品',
      date: draft.updatedAt || productionDraft.value.date || '',
      owner: draft.owner || productionDraft.value.owner || '',
      status: draft.status || productionDraft.value.status || '',
      nextStep: draft.nextStep || productionDraft.value.nextStep || '',
    };
  },
  { deep: true },
);

watch(
  processTemplateDraft,
  (draft) => {
    if (activePage.value !== 'process-templates') return;
    const stepCount = draft.steps.filter((line) => line.stepCode).length;
    productionDraft.value = {
      ...productionDraft.value,
      code: draft.code || productionDraft.value.code || '',
      title: draft.name || '待填写工艺名称',
      source: draft.version || '待填写版本号',
      date: draft.updatedAt || productionDraft.value.date || '',
      owner: draft.owner || productionDraft.value.owner || '',
      status: draft.status || productionDraft.value.status || '',
      nextStep: `${stepCount} 道工序 · ${draft.temperatureZones.length} 项温区`,
      name: draft.name,
      version: draft.version,
      steps: stepCount ? `${stepCount}` : '',
    };
  },
  { deep: true },
);

watch(
  processStepDraft,
  (draft) => {
    if (activePage.value !== 'process-steps') return;
    productionDraft.value = {
      ...productionDraft.value,
      code: draft.code || productionDraft.value.code || '',
      title: draft.name || '待填写动作名称',
      source: processStepActionSummary(draft.actions),
      date: draft.updatedAt || productionDraft.value.date || '',
      owner: draft.owner || productionDraft.value.owner || '',
      status: draft.status || productionDraft.value.status || '',
      nextStep: processStepNextStepText(draft),
    };
  },
  { deep: true },
);

function buildRows(page: ProductionPage): ProductionListRow[] {
  if (page === 'tasks') return production2Tasks.map((row, index) => taskRow(row as AnyRecord, index));
  if (page === 'material-requests') return production2MaterialRequests.map((row) => materialRequestRow(row as AnyRecord));
  if (page === 'work-orders') return production2WorkOrders.map((row, index) => workOrderRow(row as AnyRecord, index));
  if (page === 'execution-cards') return production2ExecutionCards.map((row, index) => executionCardRow(row as AnyRecord, index));
  if (page === 'quality') return production2QualityTasks.map((row) => qualityTaskRow(row as AnyRecord));
  if (page === 'quality-standards') return production2QualityStandards.map((row) => qualityStandardRow(row as AnyRecord));
  if (page === 'recipes') return production2Recipes.map((row, index) => recipeRow(row as AnyRecord, index));
  if (page === 'process-templates') return production2ProcessTemplates.map((row) => processTemplateRow(row as AnyRecord));
  if (page === 'process-steps') return production2SystemActions.map((row) => processStepRow(row as AnyRecord));
  if (page === 'loss-ledger') return production2LossRecords.map((row) => lossRecordRow(row as AnyRecord));
  return production2Exceptions.map((row) => exceptionRow(row as AnyRecord));
}

function createBaseRow(page: ProductionPage, raw: AnyRecord, cells: ListCell[], options: Partial<ProductionListRow> = {}): ProductionListRow {
  const code = text(raw.code, `NEW-${page.toUpperCase()}`);
  const title = options.title || cells[1]?.title || cells[0]?.title || code;
  const owner = options.owner !== undefined
    ? options.owner
    : text(raw.owner || raw.leader || raw.inspector || raw.responsibility, '未分配');
  const date = options.date || text(raw.deliveryDate || raw.dueDate || raw.updatedAt || raw.createdAt || raw.date, '2026-07-01');
  return {
    page,
    code,
    title,
    subtitle: options.subtitle || cells[1]?.subtitle || '',
    status: options.status || text(raw.status, '待处理'),
    nextStep: options.nextStep || text(raw.nextAction || raw.disposition || maintenanceAction(raw.status), '继续处理'),
    owner,
    party: options.party || text(raw.source || raw.line || raw.productFamily || raw.appliesTo || raw.productName || '-'),
    date,
    amountValue: options.amountValue || 0,
    cells,
    raw,
  };
}

function taskRow(raw: AnyRecord, index: number): ProductionListRow {
  const products = taskProductRowsFromRaw(raw, text(raw.code, `task-${index}`));
  const demandTotal = sumNumbers(products.map((product) => toNumber(product.demandQty)));
  const sourceDocument = taskSourceDocumentFromRaw(raw);
  const sourceTitle = sourceDocument === '无' ? '手工新建' : sourceDocument;
  const taskCode = text(raw.code);
  return createBaseRow(
    'tasks',
    raw,
    [
      { title: taskCode, subtitle: `${taskProductSummary(products)} · ${text(raw.priority)}` },
      { title: sourceTitle, subtitle: `负责人 · ${text(raw.owner)}` },
      { title: taskProductQuantitySummary(products, (product) => toNumber(product.demandQty)), subtitle: `交期 · ${text(raw.deliveryDate)}` },
    ],
    {
      title: text(raw.code),
      subtitle: taskProductSummary(products),
      status: taskLifecycleStatusForProducts(raw, products, taskCode),
      party: sourceTitle,
      date: text(raw.deliveryDate),
      amountValue: demandTotal,
      nextStep: taskOperationalNextAction(raw),
    },
  );
}

function materialRequestRow(raw: AnyRecord): ProductionListRow {
  const lines = materialRequestLinesFromRaw(raw.lines, text(raw.code));
  const requestedTotal = sumNumbers(lines.map((line) => toNumber(line.requestedQty)));
  const purchaseTotal = sumNumbers(lines.map((line) => toNumber(line.purchaseQty)));
  const requestedSummary = materialRequestQuantitySummary(lines, 'requestedQty');
  const source = text(raw.sourceTaskCode || raw.sourceDocument, '独立申请');
  const sourceDocument = text(raw.sourceDocument, '').trim();
  const sourceContext = [
    sourceDocument && sourceDocument !== '无' && sourceDocument !== source ? sourceDocument : '',
    text(raw.requester),
    text(raw.expectedDate),
  ].filter(Boolean).join(' · ');
  const evaluationPending = /草稿|待系统评估/.test(text(raw.status));
  const target = evaluationPending
    ? text(raw.status) === '草稿' ? '尚未提交' : '系统评估中'
    : raw.linkedPurchaseRequisition
    ? `采购需求 ${text(raw.linkedPurchaseRequisition)}`
    : purchaseTotal > 0
      ? '待系统重试'
      : '库存可覆盖';
  const fulfillmentSummary = evaluationPending
    ? text(raw.status) === '草稿' ? '待提交评估' : '正在计算可用库存'
    : purchaseTotal > 0 || raw.linkedPurchaseRequisition
      ? `自动转采购 · ${materialRequestQuantitySummary(lines, 'purchaseQty')}`
      : `库存覆盖 · ${requestedSummary}`;
  return createBaseRow(
    'material-requests',
    raw,
    [
      { title: text(raw.code), subtitle: text(raw.requestType) },
      { title: source, subtitle: sourceContext },
      { title: materialRequestLineSummary(raw.lines), subtitle: `${raw.sourceTaskCode ? '本次缺口' : '合计申请'} ${requestedSummary}` },
      { title: target, subtitle: fulfillmentSummary },
    ],
    {
      title: text(raw.requestType),
      subtitle: materialRequestLineSummary(raw.lines),
      status: materialRequestLifecycleStatus(raw.status),
      owner: text(raw.requester),
      party: text(raw.department),
      date: text(raw.expectedDate || raw.requestDate),
      amountValue: requestedTotal,
      nextStep: text(raw.nextAction, materialRequestNextAction(raw.status)),
    },
  );
}

function workOrderLifecycleStatusFromRaw(raw: AnyRecord) {
  const documentStatus = text(raw.documentStatus, '').trim();
  const legacyStatus = text(raw.status, '').trim();
  const normalized = documentStatus.toLowerCase();

  if (['已作废', '已取消', 'cancelled', 'canceled'].includes(documentStatus) || ['已作废', '已取消'].includes(legacyStatus)) {
    return '已作废';
  }
  if (['已关闭', 'closed', 'completed'].includes(documentStatus) || legacyStatus === '已关闭') return '已关闭';
  if (['草稿', '待确认', 'draft'].includes(documentStatus) || ['草稿', '待确认'].includes(legacyStatus)) return '草稿';
  if (['submitted', 'confirmed'].includes(normalized) || ['已提交', '已确认'].includes(documentStatus)) return '已确认';

  // 旧原型记录没有独立单据状态时，以已冻结快照或服务端修订号判断其已经确认。
  // 生产、质检和入库进度始终由右侧独立维度表达，不再反向改写这里的单据生命周期。
  if (text(raw.snapshotStatus, '') === 'server_frozen' || toNumber(raw.revision) > 0) return '已确认';
  return '草稿';
}

function materialRequestLifecycleStatus(status: unknown) {
  const value = text(status, '').trim();
  if (/作废|取消/.test(value)) return '已作废';
  if (/草稿/.test(value)) return '草稿';
  if (/库存可满足|已转采购|完成|关闭/.test(value)) return '已完成';
  if (value) return '执行中';
  return '已确认';
}

function executionCardLifecycleStatusFromRaw(raw: AnyRecord) {
  const status = text(raw.status, '');
  const release = releaseBatchForExecutionCard(raw.code);
  const planQty = toNumber(release?.releasedQty ?? raw.planQty);
  const inboundQty = toNumber(raw.inboundQty);
  if (release?.inboundStatus === '已入库' || (planQty > 0 && inboundQty >= planQty) || (status === '已完成' && planQty <= 0)) return '已完成';
  if (status === '已取消' || status === '已作废') return '已作废';
  if (status === '已关闭') return '已关闭';
  const operationJobs = executionCardOperationJobs(raw);
  const hasStarted = Boolean(raw.startedAt)
    || toNumber(raw.reportedQty) > 0
    || operationJobs.some((job) => ['执行中', '暂停', '异常', '已完成'].includes(job.status));
  return hasStarted ? '流转中' : '待开始';
}

function workOrderRow(raw: AnyRecord, _index: number): ProductionListRow {
  const dueAttention = workOrderDueAttention(raw);
  const requirementDates = workOrderRequirementDates(raw);
  const requirementDateSummary = workOrderRequirementDateSummary(raw);
  const sourceAllocations = workOrderSourceAllocationsFromRaw(
    raw,
    text(raw.taskCode || raw.sourceTask, ''),
    text(raw.sourceLineId, ''),
  );
  const sourceTaskCodes = [...new Set(sourceAllocations.map((allocation) => allocation.taskCode).filter(Boolean))];
  const sourceTitle = sourceTaskCodes.length > 1
    ? `${sourceTaskCodes.length} 个任务`
    : sourceTaskCodes[0] || '待补齐任务需求';
  const sourceSubtitle = `${sourceAllocations.length} 条需求`;
  return createBaseRow(
    'work-orders',
    raw,
    [
      { title: text(raw.code), subtitle: text(raw.productName) },
      { title: sourceTitle, subtitle: sourceSubtitle },
      { title: `计划 ${qty(raw.planQty, raw.unit)}`, subtitle: `要求日期 ${requirementDateSummary}${dueAttention ? ` · ${dueAttention}` : ''}` },
      { title: `配方 · ${text(raw.recipeCode, '未选配方')}`, subtitle: `工艺 · ${text(raw.processTemplateCode, '未选工艺')}` },
    ],
    {
      title: text(raw.productName),
      subtitle: text(raw.processTemplateCode),
      party: sourceTaskCodes.join(' ') || '待补齐任务需求',
      date: requirementDates[0] || '',
      amountValue: toNumber(raw.planQty),
      status: workOrderLifecycleStatusFromRaw(raw),
      nextStep: workOrderDisplayNextAction(raw),
    },
  );
}

function executionCardRow(raw: AnyRecord, _index: number): ProductionListRow {
  const release = releaseBatchForExecutionCard(text(raw.code));
  const workOrder = production2WorkOrders.find((item) => item.code === text(raw.workOrderCode));
  const routeType = executionCardRouteType(raw);
  const plannedDate = text(raw.plannedDate || workOrder?.plannedDate || raw.createdAt || raw.date);
  const scheduleAttention = executionCardScheduleAttention(raw);
  return createBaseRow(
    'execution-cards',
    raw,
    [
      { title: text(raw.code), subtitle: `${text(raw.workOrderCode)} · ${routeType}` },
      { title: text(raw.productName), subtitle: executionCardPlannedLineSummary(raw) },
      {
        title: `计划 ${qty(release?.releasedQty ?? raw.planQty, release?.unit || raw.unit)}`,
        subtitle: `${plannedDate}${scheduleAttention ? ` · ${scheduleAttention}` : ''} · ${text(raw.shift, '待排班')} · ${text(raw.leader, '待分配班组')}`,
      },
    ],
    {
      title: text(raw.productName),
      subtitle: text(raw.workOrderCode),
      owner: text(raw.leader),
      party: text(raw.workOrderCode),
      date: plannedDate,
      amountValue: toNumber(raw.planQty),
      status: executionCardLifecycleStatusFromRaw(raw),
      nextStep: text(raw.nextAction, text(raw.node)),
    },
  );
}

function qualityTaskRow(raw: AnyRecord): ProductionListRow {
  return createBaseRow(
    'quality',
    raw,
    [
      { title: text(raw.code), subtitle: text(raw.workOrderCode) },
      { title: text(raw.productName), subtitle: text(raw.sourceCard) },
      { title: text(raw.kind), subtitle: text(raw.node) },
      { title: text(raw.sampleQty), subtitle: text(raw.line) },
      { title: text(raw.inspector), subtitle: text(raw.dueTime) },
      { title: text(raw.result), subtitle: text(raw.disposition) },
    ],
    {
      title: text(raw.productName),
      subtitle: text(raw.kind),
      owner: text(raw.inspector),
      party: text(raw.line),
      date: text(raw.dueTime).slice(0, 10),
      amountValue: parseFloat(text(raw.sampleQty, '0')),
      nextStep: text(raw.disposition || raw.result, '记录检验结果'),
    },
  );
}

function qualityStandardRow(raw: AnyRecord): ProductionListRow {
  return createBaseRow(
    'quality-standards',
    raw,
    [
      { title: text(raw.code), subtitle: text(raw.scope) },
      { title: text(raw.name), subtitle: text(raw.appliesTo) },
      { title: text(raw.inspectionType), subtitle: text(raw.sampleRule) },
      { title: text(raw.appliesTo), subtitle: text(raw.scope) },
      { title: text(raw.acceptance), subtitle: `${toArray(raw.checkpoints).length} 项检查` },
      { title: text(raw.owner), subtitle: text(raw.updatedAt) },
    ],
    {
      title: text(raw.name),
      subtitle: text(raw.appliesTo),
      date: text(raw.updatedAt),
      amountValue: toArray(raw.checkpoints).length,
      nextStep: maintenanceAction(raw.status),
    },
  );
}

function recipeRow(raw: AnyRecord, _index: number): ProductionListRow {
  const materials = toArray(raw.materials);
  const percentMaterials = materials.filter((item) => recipeMaterialUsageMode(item) === 'percent');
  const fixedMaterials = materials.filter((item) => recipeMaterialUsageMode(item) === 'fixed');
  const estimatedLosses = toArray(raw.estimatedLosses);
  const unitWeightKg = toNumber(raw.productUnitWeightKg);
  const recipeCode = text(raw.code, '待生成配方编号');
  const recipeVersion = text(raw.version, '-');
  const percentSummary = percentMaterials.length
    ? `投料占比 ${formatPercent(recipeMaterialPercentTotal(materials))}`
    : '未设置投料';
  return createBaseRow(
    'recipes',
    raw,
    [
      { title: recipeCode, subtitle: recipeVersion },
      { title: text(raw.productName), subtitle: text(raw.productCode) },
      {
        title: `${formatKg(unitWeightKg)} kg/${text(raw.outputUnit)}`,
        subtitle: '',
      },
      {
        title: `投料 ${percentMaterials.length} 项 · 固定 ${fixedMaterials.length} 项`,
        subtitle: `${percentSummary} · 损耗 ${estimatedLosses.length} 项`,
      },
    ],
    {
      title: recipeCode,
      subtitle: `${text(raw.productName, '待选择成品')} · ${text(raw.version)}`,
      date: text(raw.updatedAt),
      amountValue: materials.length,
      party: text(raw.productName, '待选择成品'),
      nextStep: recipeLifecycleAction(raw.status),
    },
  );
}

function processTemplateRow(raw: AnyRecord): ProductionListRow {
  const zones = standardizedProcessTemplateZones(toArray<AnyRecord>(raw.temperatureZones));
  const configuredZoneCount = zones.filter((zone) => Boolean(processTemplateTemperatureInputValue(zone.value))).length;
  const temperatureSummary = configuredZoneCount === zones.length
    ? `${zones.length} 区 · 允差 ${text(raw.temperatureTolerance, '未记录')}`
    : `已填 ${configuredZoneCount}/${zones.length} 区 · 允差 ${text(raw.temperatureTolerance, '未记录')}`;
  const stepCodes = toArray<string>(raw.stepCodes);
  const routeType = text(raw.routeType, stepCodes.includes('P2-STEP-WIP-REPORT-LARGE-REEL') ? '大盘复绕' : '直接收卷');
  const lineTypes = schedulableProcessLineTypes(raw.lineTypes);
  return createBaseRow(
    'process-templates',
    raw,
    [
      { title: text(raw.name), subtitle: `${text(raw.code)} · ${text(raw.version)}` },
      { title: routeType, subtitle: text(raw.productFamily, '未限定产品族') },
      { title: temperatureSummary, subtitle: lineTypes.length ? lineTypes.join('、') : '未限定产线' },
      { title: `${stepCodes.length} 个阶段`, subtitle: processTemplateRouteSummary(stepCodes, routeType) },
    ],
    {
      title: text(raw.name),
      subtitle: text(raw.version),
      date: text(raw.updatedAt),
      owner: text(raw.owner, '工艺工程'),
      party: text(raw.productFamily, '生产工艺'),
      amountValue: stepCodes.length,
      nextStep: processTemplateLifecycleAction(raw.status),
    },
  );
}

function schedulableProcessLineTypes(value: unknown) {
  return [...new Set(toArray<string>(value)
    .map((item) => text(item, '').trim())
    .filter((item) => item && !/包装(?:工位|线)?/.test(item)))];
}

function processStepRow(raw: AnyRecord): ProductionListRow {
  const entryLabel = text(raw.entryLabel, '无需人工入口');
  const result = text(raw.result, '-');
  const blockingPolicy = text(raw.blockingPolicy, '不阻断');
  const status = text(raw.status, '启用');
  return createBaseRow(
    'process-steps',
    raw,
    [
      { title: text(raw.name), subtitle: status === '启用' ? text(raw.code) : `${text(raw.code)} · ${status}` },
      { title: text(raw.ownerDomain), subtitle: [text(raw.executionMode), text(raw.completionMode)].filter(Boolean).join(' · ') },
      { title: text(raw.trigger), subtitle: entryLabel },
      { title: result, subtitle: `${blockingPolicy} · ${text(raw.repeatPolicy)}` },
    ],
    {
      title: text(raw.name),
      subtitle: text(raw.executionMode),
      status,
      owner: text(raw.executionMode, '系统执行'),
      party: text(raw.ownerDomain),
      date: text(raw.updatedAt, ''),
      amountValue: toArray<string>(raw.requiredInputs).length,
      nextStep: status === '启用' ? '固定能力' : '仅供历史追溯',
    },
  );
}

function lossRecordRow(raw: AnyRecord): ProductionListRow {
  const productionBatchCode = text(raw.productionBatchCode, '');
  const responsiblePerson = text(raw.responsiblePerson, '');
  const responsibilityDept = text(raw.responsibilityDept, '');
  const unclassifiedLossKg = lossRecordUnclassifiedKg(raw);
  const abnormalLossKg = toNumber(raw.abnormalLossKg);
  const responsibilityTitle = responsiblePerson || (abnormalLossKg > 0 || unclassifiedLossKg > 0 ? '责任未判定' : '无需归责');
  const responsibilityMeta = responsiblePerson
    ? [responsibilityDept, text(raw.status)].filter(Boolean).join(' · ')
    : [unclassifiedLossKg > 0 ? '损耗待分类' : abnormalLossKg > 0 ? '异常损耗' : '工艺内损耗', text(raw.status)].join(' · ');
  const lossParts = [
    ...(toNumber(raw.plannedLossKg) > 0 ? [`工艺内 ${numberText(raw.plannedLossKg)} kg`] : []),
    ...(abnormalLossKg > 0 ? [`异常 ${numberText(raw.abnormalLossKg)} kg`] : []),
    ...(unclassifiedLossKg > 0 ? [`待分类 ${numberText(unclassifiedLossKg)} kg`] : []),
  ];
  return createBaseRow(
    'loss-ledger',
    raw,
    [
      { title: text(raw.code), subtitle: text(raw.occurredAt) },
      { title: text(raw.sourceDoc || productionBatchCode || raw.workOrderCode), subtitle: `${text(raw.sourceType)} · 生产批次 ${productionBatchCode || '-'}` },
      { title: text(raw.productName), subtitle: `${text(raw.processStep)} · ${text(raw.line)}` },
      {
        title: `总损耗 ${numberText(raw.lossKg)} kg`,
        subtitle: lossParts.join(' · '),
      },
      { title: responsibilityTitle, subtitle: responsibilityMeta },
    ],
    {
      title: text(raw.sourceType),
      subtitle: productionBatchCode,
      owner: responsiblePerson,
      party: text(raw.line),
      date: text(raw.occurredAt).slice(0, 10),
      amountValue: toNumber(raw.lossKg),
      nextStep: text(raw.reason, '损耗记录已生成'),
    },
  );
}

function lossRecordUnclassifiedKg(raw: AnyRecord | undefined) {
  if (!raw) return 0;
  const explicit = Number(raw.unclassifiedLossKg);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return Math.max(0, toNumber(raw.lossKg) - toNumber(raw.plannedLossKg) - toNumber(raw.abnormalLossKg));
}

function lossRecordNature(raw: AnyRecord | undefined) {
  const plannedLoss = toNumber(raw?.plannedLossKg);
  const abnormalLoss = toNumber(raw?.abnormalLossKg);
  if (lossRecordUnclassifiedKg(raw) > 0) return '待分类';
  if (plannedLoss > 0 && abnormalLoss > 0) return '工艺内 + 异常';
  if (abnormalLoss > 0) return '异常损耗';
  return plannedLoss > 0 ? '工艺损耗' : '待判定';
}

function exceptionRow(raw: AnyRecord): ProductionListRow {
  return createBaseRow(
    'exceptions',
    raw,
    [
      { title: text(raw.code), subtitle: text(raw.createdAt) },
      { title: text(raw.type), subtitle: text(raw.level) },
      { title: productionDisplayTerm(raw.effect), subtitle: `${text(raw.relatedBatch || raw.source)} · 影响 ${qty(raw.affectedQty, raw.unit || '件')}` },
      { title: productionDisplayTerm(raw.cause), subtitle: productionDisplayTerm(raw.responsibility) },
      { title: productionExceptionDispositionSummary(raw), subtitle: text(raw.estimatedLoss, '暂无损失预估') },
    ],
    {
      title: text(raw.type),
      subtitle: text(raw.source),
      status: productionExceptionDisplayStatus(raw),
      owner: text(raw.createdBy || raw.owner, '未记录'),
      date: text(raw.createdAt).slice(0, 10),
      amountValue: toNumber(raw.affectedQty),
      nextStep: productionExceptionNextAction(raw),
    },
  );
}

function productionObjectRoute(code: string) {
  if (code.startsWith('PT2-')) return `/production/tasks/${encodeURIComponent(code)}`;
  if (code.startsWith('MO2-')) return `/production/work-orders/${encodeURIComponent(code)}`;
  if (code.startsWith('EC2-')) return `/production/execution-cards/${encodeURIComponent(code)}`;
  if (code.startsWith('EX2-')) return `/production/exceptions/${encodeURIComponent(code)}`;
  if (code.startsWith('PMR2-')) return `/production/material-requests/${encodeURIComponent(code)}`;
  if (/^(QC2-|PQC-|IQC-)/.test(code)) return `/quality/production/${encodeURIComponent(code)}`;
  return '';
}

function productionLossSourceRoute(raw: AnyRecord) {
  return productionObjectRoute(text(raw.sourceDoc, ''))
    || productionObjectRoute(text(raw.productionBatchCode, ''))
    || productionObjectRoute(text(raw.workOrderCode, ''));
}

function productionExceptionSourceTaskCode(raw: AnyRecord | undefined) {
  return productionExceptionSourceTaskCodes(raw)[0] || '';
}

function productionExceptionSourceTaskCodes(raw: AnyRecord | undefined) {
  const sourceCode = text(raw?.source, '');
  if (sourceCode.startsWith('PT2-')) return [sourceCode];
  const workOrderCode = text(raw?.relatedWorkOrder, '');
  const workOrder = production2WorkOrders.find((item) => item.code === workOrderCode) as AnyRecord | undefined;
  if (!workOrder) return [];
  return [...new Set(workOrderSourceAllocationsFromRaw(
    workOrder,
    text(workOrder.taskCode || workOrder.sourceTask, ''),
    text(workOrder.sourceLineId, ''),
  ).map((allocation) => allocation.taskCode).filter(Boolean))];
}

function exceptionShortageMaterialRows(raw: AnyRecord) {
  if (text(raw.type) !== '缺料') return [];
  const workOrderCode = text(raw.relatedWorkOrder, '');
  const workOrder = production2WorkOrders.find((item) => item.code === workOrderCode) as AnyRecord | undefined;
  const taskCodes = productionExceptionSourceTaskCodes(raw);
  const task = production2Tasks.find((item) => item.code === taskCodes[0]);
  const materialOwner = workOrder || (task as unknown as AnyRecord | undefined);
  if (!materialOwner) return [];
  const sourceDocs = [...taskCodes, workOrderCode].filter(Boolean);
  return taskMaterialReadinessRows(materialOwner.materialNeeds, true, sourceDocs);
}

function productionShortageExceptionStage(raw: AnyRecord | undefined) {
  if (!raw || text(raw.type) !== '缺料') return text(raw?.status, '待处理');
  const rows = exceptionShortageMaterialRows(raw);
  if (!rows.length) return text(raw.status, '待处理');
  if (rows.some((row) => row.purchaseGapValue > 0)) return '待处理';
  if (rows.some((row) => row.shortageValue > 0)) return '处理中';
  return '已关闭';
}

function productionExceptionDisplayStatus(raw: AnyRecord) {
  return text(raw.type) === '缺料' ? productionShortageExceptionStage(raw) : text(raw.status, '待处理');
}

function productionExceptionNextAction(raw: AnyRecord) {
  if (text(raw.type) !== '缺料') return productionDisplayTerm(text(raw.nextAction, '继续处理'));
  const stage = productionShortageExceptionStage(raw);
  if (stage === '待处理') return '跟踪采购需求';
  if (stage === '处理中') return '等待补充库存可用';
  return '查看物料储备';
}

function productionExceptionDispositionSummary(raw: AnyRecord) {
  if (text(raw.type) !== '缺料') return productionDisplayTerm(raw.disposition);
  const stage = productionShortageExceptionStage(raw);
  if (stage === '待处理') return '仍有新增采购缺口，等待采购需求承接';
  if (stage === '处理中') return '补充数量已覆盖净缺口，等待到货、质检和入库形成可用库存';
  return '实时库存已备齐，异常已关闭并保留追溯';
}

function exceptionShortageMaterialLines(raw: AnyRecord): DetailLine[] {
  const rows = exceptionShortageMaterialRows(raw);
  const unreadyRows = rows.filter((row) => row.status !== '可齐套' || row.shortageValue > 0);
  return (unreadyRows.length ? unreadyRows : rows).map((row) => {
    const coverage = [
      row.inTransitValue > 0 ? `在途 ${qty(row.inTransitValue, row.unit)}` : '',
      row.qcPendingValue > 0 ? `待检 ${qty(row.qcPendingValue, row.unit)}` : '',
      row.pendingInboundValue > 0 ? `待入库 ${qty(row.pendingInboundValue, row.unit)}` : '',
    ].filter(Boolean).join(' · ') || '-';
    return {
      title: row.name || row.code,
      meta: row.code,
      status: row.status,
      values: [
        { label: '需求', value: row.requiredQty },
        { label: '可用', value: row.availableQty },
        { label: '补充中', value: coverage },
        { label: '仍需采购', value: row.purchaseGapQty },
      ],
    };
  });
}

function exceptionRelatedLines(raw: AnyRecord): DetailLine[] {
  const sourceCode = text(raw.source, '');
  const workOrderCode = text(raw.relatedWorkOrder, '');
  const executionCardCode = text(raw.relatedBatch, '');
  const workOrder = production2WorkOrders.find((item) => item.code === workOrderCode);
  const executionCard = production2ExecutionCards.find((item) => item.code === executionCardCode);
  const releaseBatch = production2ReleaseBatches.find(
    (item) => item.executionCardCodes.includes(executionCardCode) || (workOrderCode && item.workOrderCode === workOrderCode),
  );
  const taskCodes = workOrder
    ? productionExceptionSourceTaskCodes(raw)
    : [releaseBatch?.taskCode || (sourceCode.startsWith('PT2-') ? sourceCode : '')].filter(Boolean);
  const seen = new Set<string>();
  const lines: DetailLine[] = [];

  const addLine = (
    code: string,
    label: string,
    description: string,
    status: string,
    nextAction: string,
    route = productionObjectRoute(code),
  ) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    lines.push({
      title: code,
      meta: label,
      status: productionDisplayTerm(status),
      route: route || undefined,
      values: [
        { label: '业务摘要', value: description || '-' },
        { label: '下一步', value: productionDisplayTerm(nextAction || text(raw.nextAction, '继续处理异常')) },
      ],
    });
  };

  const sourceTask = production2Tasks.find((item) => item.code === sourceCode);
  const sourceQuality = production2QualityTasks.find((item) => item.code === sourceCode);
  const sourceQualityState = sourceQuality ? productionQualityState(sourceQuality as unknown as AnyRecord) : undefined;
  const sourceTaskStatus = sourceTask ? productionTaskDerivedStatus(sourceTask as unknown as AnyRecord) : '';
  addLine(
    sourceCode,
    sourceQuality ? '来源质检' : sourceTask ? '来源生产任务' : '来源单据',
    sourceQuality
      ? `${sourceQuality.kind} · ${sourceQuality.productName}`
      : sourceTask
        ? `${sourceTask.productName} · ${sourceTask.demandQty}${sourceTask.unit}`
        : '异常来源单据',
    sourceQualityState?.dispositionStage || sourceTaskStatus || text(raw.status),
    sourceQualityState?.currentAction || (sourceTask ? taskNextAction(sourceTaskStatus) : '') || text(raw.nextAction),
  );
  taskCodes.forEach((taskCode) => {
    const task = production2Tasks.find((item) => item.code === taskCode);
    const taskStatus = task ? productionTaskDerivedStatus(task as unknown as AnyRecord) : '';
    addLine(
      taskCode,
      taskCodes.length > 1 ? '来源生产任务' : '生产任务',
      task ? `${task.productName} · ${task.demandQty}${task.unit}` : '',
      taskStatus,
      task ? taskNextAction(taskStatus) : '返回任务继续处理',
    );
  });
  addLine(
    workOrderCode,
    '生产工单',
    workOrder ? `${workOrder.productName} · ${workOrder.planQty}${workOrder.unit}` : '',
    workOrder?.status || '',
    workOrder?.nextAction || '返回工单继续处理',
  );
  addLine(
    executionCardCode,
    '生产批次',
    executionCard ? `${executionCard.productName} · ${executionCard.line}` : '',
    executionCard?.status || '',
    executionCard?.nextAction || '返回现场执行',
  );

  return lines;
}

function createDraftRow(page: ProductionPage): ProductionListRow {
  void productionDataRevision.value;
  const now = new Date().toLocaleDateString('sv-SE');
  const currentPerson = currentProductionPerson();
  if (page === 'tasks') {
    return taskRow(
      {
        code: `PT2-DRAFT-${now.replace(/-/g, '')}`,
        source: '直接新建',
        createdAt: `${now} 09:00`,
        sourceType: '手工新建',
        sourceCode: '',
        productCode: '',
        productName: '',
        demandQty: 0,
        finishedStockQty: 0,
        productionQty: 0,
        unit: '件',
        deliveryDate: now,
        priority: '正常',
        status: '待建工单',
        recipeCode: '',
        ownerEmployeeCode: currentPerson.employeeCode,
        owner: currentPerson.name,
        nextAction: '创建生产工单',
        note: '',
        products: [],
        materialNeeds: [],
      },
      0,
    );
  }
  if (page === 'material-requests') {
    const sourceTaskCode = text(route.query.task, '');
    const sourceTask = productionRuntimeDataHasSnapshot.value
      ? production2Tasks.find((task) => task.code === sourceTaskCode) as AnyRecord | undefined
      : undefined;
    return materialRequestRow({
      ...createMaterialRequestDraftRaw(now, sourceTask),
      code: `PMR2-DRAFT-${now.replace(/-/g, '')}`,
    });
  }
  if (page === 'work-orders') {
    const requestedTaskCode = text(route.query.task, '');
    const requestedTask = productionRuntimeDataHasSnapshot.value
      ? production2Tasks.find((task) => task.code === requestedTaskCode) as AnyRecord | undefined
      : undefined;
    const requestedProducts = workOrderTaskSourceLines(requestedTask);
    const products = requestedProducts.filter((line) => taskProductScheduleGap(line, requestedTaskCode) > 0);
    const sourceTask = products.length ? requestedTask : undefined;
    const sourceTaskCode = sourceTask ? requestedTaskCode : '';
    const firstProduct = products[0];
    const planQty = sourceTask && firstProduct ? taskProductScheduleGap(firstProduct, sourceTaskCode) : 0;
    const releasedQty = 0;
    return workOrderRow(
      {
         code: `MO2-DRAFT-${now.replace(/-/g, '')}`,
         taskCode: sourceTaskCode,
         sourceLineId: firstProduct?.lineId || '',
         ownerEmployeeCode: text(sourceTask?.ownerEmployeeCode, currentPerson.employeeCode),
         owner: text(sourceTask?.owner, currentPerson.name),
        productCode: firstProduct?.productCode || '',
        productName: firstProduct?.productName || '待选择成品',
        planQty,
        releasedQty,
        completedQty: 0,
        inboundQty: 0,
         unit: firstProduct?.unit || text(sourceTask?.unit, '件'),
         plannedDate: now,
         dueDate: text(sourceTask?.deliveryDate, now),
         recipeCode: firstProduct?.recipeCode || text(sourceTask?.recipeCode, ''),
         processTemplateCode: firstProduct ? workOrderRecommendedProcessCode(firstProduct.productCode) : '',
         note: '',
         materialNeeds: toArray<AnyRecord>(sourceTask?.materialNeeds),
        linePlans: [],
        currentNode: '待确认',
        status: '待确认',
        nextAction: '确认数量、配方和工艺后安排生产',
      },
      0,
    );
  }
  if (page === 'recipes') {
    const sourceCode = text(route.query.copy, '');
    const sourceRecipe = recipeRuntimeHasSnapshot.value
      ? production2Recipes.find((recipe) => recipe.code === sourceCode) as AnyRecord | undefined
      : undefined;
    if (sourceRecipe) {
      const productRecipes = production2Recipes.filter((recipe) => text(recipe.productCode, '') === text(sourceRecipe.productCode, ''));
      const nextVersion = recipeVersionLabel(Math.max(0, ...productRecipes.map((recipe) => recipeVersionNumber(recipe.version))) + 1);
      return recipeRow(
        {
          ...sourceRecipe,
          code: `BOM2-DRAFT-${now.replace(/-/g, '')}`,
          revision: 0,
          sourceRecipeCode: sourceRecipe.code,
          version: nextVersion,
          status: '草稿',
          owner: '工艺工程',
          updatedAt: now,
          nextAction: '完善后启用',
          note: `基于 ${sourceRecipe.code} 创建的新版本草稿。`,
          attachments: [],
          materials: toArray<AnyRecord>(sourceRecipe.materials).map((line) => ({ ...line })),
          estimatedLosses: toArray<AnyRecord>(sourceRecipe.estimatedLosses).map((line) => ({ ...line })),
        },
        0,
      );
    }
    const requestedProductCode = text(route.query.product, '');
    const requestedSourceTask = text(route.query.sourceTask, '');
    const sourceTask = production2Tasks.find((task) => text(task.code, '') === requestedSourceTask) as unknown as AnyRecord | undefined;
    const sourceProduct = taskProductRowsFromRaw(sourceTask || {}, requestedSourceTask)
      .find((product) => product.productCode === requestedProductCode);
    return recipeRow(
      {
        code: `BOM2-DRAFT-${now.replace(/-/g, '')}`,
        sourceRecipeCode: '',
        productCode: requestedProductCode,
        productName: sourceProduct?.productName || '',
        version: 'v1',
        productUnitWeightKg: '',
        outputUnit: sourceProduct?.unit || '',
        note: requestedSourceTask ? `用于生产任务 ${requestedSourceTask} 的成品配方。` : '',
        status: '草稿',
        owner: '工艺工程',
        updatedAt: now,
        nextAction: '完善后启用',
        materials: [
          {
            materialCode: '',
            materialName: '',
            percent: 100,
            unit: '',
            incomingQcRequired: true,
          },
        ],
        estimatedLosses: [],
      },
      0,
    );
  }
  if (page === 'process-templates') {
    const sourceCode = text(route.query.copy, '');
    const sourceTemplate = processTemplateRuntimeHasSnapshot.value
      ? production2ProcessTemplates.find((template) => template.code === sourceCode) as AnyRecord | undefined
      : undefined;
    if (sourceTemplate) {
      const relatedVersions = production2ProcessTemplates.filter((template) => template.name === sourceTemplate.name);
      const nextVersion = recipeVersionLabel(Math.max(0, ...relatedVersions.map((template) => recipeVersionNumber(template.version))) + 1);
      return processTemplateRow({
        ...sourceTemplate,
        code: `PRC2-DRAFT-${now.replace(/-/g, '')}`,
        revision: 0,
        sourceProcessTemplateCode: sourceTemplate.code,
        version: nextVersion,
        status: '草稿',
        owner: '工艺工程',
        updatedAt: now,
        nextAction: '完善后启用',
        attachments: [],
        lineTypes: schedulableProcessLineTypes(sourceTemplate.lineTypes),
        stepCodes: toArray<string>(sourceTemplate.stepCodes),
        temperatureZones: toArray<AnyRecord>(sourceTemplate.temperatureZones).map((zone) => ({ ...zone })),
        stepInstructions: toArray<AnyRecord>(sourceTemplate.stepInstructions).map((instruction) => ({ ...instruction })),
      });
    }
    return processTemplateRow({
      code: `PRC2-DRAFT-${now.replace(/-/g, '')}`,
      revision: 0,
      sourceProcessTemplateCode: '',
      name: '',
      routeType: '直接收卷',
      productFamily: '3D 打印耗材成品',
      lineTypes: ['挤出机'],
      version: 'v1',
      status: '草稿',
      stepCodes: processTemplateRouteStepCodes('直接收卷'),
      temperatureTolerance: '',
      temperatureZones: defaultProcessTemplateZones().map((zone) => ({ ...zone, tolerance: '' })),
      owner: '工艺工程',
      updatedAt: now,
    });
  }
  return createBaseRow(
    page,
    {
      code: `NEW-${page.toUpperCase()}-${now.replace(/-/g, '')}`,
      status: '草稿',
      owner: currentPerson.name,
      date: now,
      nextAction: '提交',
    },
    [
      { title: `新建${pageConfigs[page].title}`, subtitle: '草稿' },
      { title: '待选择对象', subtitle: '请补齐必填信息' },
      { title: '待填写', subtitle: now },
      { title: '待判断', subtitle: '保存后进入流程' },
      { title: '待维护', subtitle: '提交前检查' },
      { title: '暂无附件', subtitle: '可上传' },
    ],
    {
      title: `新建${pageConfigs[page].title}`,
      subtitle: '草稿',
      date: now,
      nextStep: '提交',
    },
  );
}

function draftFromRow(row: ProductionListRow) {
  if (row.page === 'recipes') {
    const raw = row.raw;
    return {
      code: row.code,
      title: row.code,
      source: text(raw.productName, row.party),
      date: text(raw.updatedAt, row.date),
      owner: text(raw.owner, row.owner),
      status: row.status,
      nextStep: row.nextStep,
    };
  }

  return {
    code: row.code,
    title: row.title,
    source: row.party,
    date: row.date,
    owner: row.owner,
    status: row.status,
    nextStep: row.nextStep,
  };
}

function currentProductionPerson() {
  return {
    employeeCode: text(session.user.employeeCode, ''),
    name: text(session.user.name, '待指定'),
    department: text(session.user.department, '生产管理部'),
  };
}

function employeeCodeForDisplayName(name: unknown) {
  const normalizedName = text(name, '');
  return text(session.accountOptions.find((account) => account.name === normalizedName)?.employeeCode, '');
}

function handleTaskOwnerSelect(option: ReferenceOption) {
  taskDraft.value.ownerEmployeeCode = option.code || '';
  taskDraft.value.owner = option.name || '';
}

function emptyProductionTaskDraft(): ProductionTaskDraft {
  const currentPerson = currentProductionPerson();
  const today = shanghaiBusinessDateText();
  return {
    code: '',
    sourceType: '手工新建',
    sourceCode: '',
    sourceLineId: '',
    createdAt: `${today} 09:00`,
    productCode: '',
    productName: '',
    demandQty: '0',
    finishedStockQty: '0',
    productionQty: '0',
    unit: '件',
    deliveryDate: today,
    priority: '正常',
    status: '待建工单',
    recipeCode: '',
    ownerEmployeeCode: currentPerson.employeeCode,
    owner: currentPerson.name,
    nextStep: '创建生产工单',
    supplementaryRequirement: '',
    note: '',
    products: [createTaskProductLine('draft-task', 0)],
    materialNeeds: [],
  };
}

function createMaterialRequestLine(rowCode: string, index: number, raw: AnyRecord = {}): MaterialRequestDraftLine {
  return {
    lineId: text(raw.lineId, `${rowCode || 'material-request'}-line-${index}`),
    materialCode: text(raw.materialCode, ''),
    materialName: text(raw.materialName, ''),
    model: text(raw.model, ''),
    spec: text(raw.spec, ''),
    requestedQty: editableNumberText(raw.requestedQty, 0),
    availableQty: editableNumberText(raw.availableQty, 0),
    purchaseQty: editableNumberText(raw.purchaseQty ?? raw.shortageQty, 0),
    taskEstimatedQty: editableNumberText(raw.taskEstimatedQty, 0),
    taskAllocatedQty: editableNumberText(raw.taskAllocatedQty, 0),
    taskAvailableQty: editableNumberText(raw.taskAvailableQty, 0),
    taskPendingCoverageQty: editableNumberText(raw.taskPendingCoverageQty, 0),
    unit: text(raw.unit, '件'),
    purpose: text(raw.purpose, ''),
  };
}

function materialRequestCoveredQty(line: MaterialRequestDraftLine) {
  if (!materialRequestDraft.value.sourceTaskCode) return toNumber(line.availableQty);
  return toNumber(line.taskAllocatedQty) + toNumber(line.taskAvailableQty) + toNumber(line.taskPendingCoverageQty);
}

function materialRequestLinesFromRaw(value: unknown, rowCode: string): MaterialRequestDraftLine[] {
  return toArray<AnyRecord>(value).map((line, index) => createMaterialRequestLine(rowCode, index, line));
}

function createMaterialRequestDraftRaw(now: string, sourceTask?: AnyRecord) {
  const currentPerson = currentProductionPerson();
  const sourceTaskCode = text(sourceTask?.code, '');
  const shortageLines = taskMaterialReadinessRows(sourceTask?.materialNeeds, true)
    .filter((item) => item.purchaseGapValue > 0)
    .map((item, index) => ({
      lineId: `${sourceTaskCode || 'draft'}-shortage-${index}`,
      materialCode: item.code,
      materialName: item.name,
      requestedQty: item.purchaseGapValue,
      availableQty: item.availableValue,
      purchaseQty: item.purchaseGapValue,
      taskEstimatedQty: item.requiredValue,
      taskAllocatedQty: item.ownAllocatedValue,
      taskAvailableQty: item.availableValue,
      taskPendingCoverageQty: item.qcPendingValue + item.pendingInboundValue + item.inTransitValue,
      unit: item.unit,
      purpose: sourceTaskCode ? '补齐生产任务缺口' : '临时备料',
    }));

  return {
    requestType: sourceTaskCode ? '任务缺口补料' : '临时备料',
    sourceTaskCode,
    sourceDocument: sourceTaskCode ? taskSourceDocumentFromRaw(sourceTask || {}) : '',
    department: currentPerson.department,
    requesterEmployeeCode: currentPerson.employeeCode,
    requester: currentPerson.name,
    requestDate: now,
    expectedDate: text(sourceTask?.deliveryDate, now),
    status: '草稿',
    linkedPurchaseRequisition: '',
    note: sourceTaskCode ? `补齐 ${sourceTaskCode} 的物料缺口。` : '',
    nextAction: '提交后由系统评估可用库存，缺口自动转采购需求',
    lines: shortageLines.length ? shortageLines : [createMaterialRequestLine('draft-material-request', 0)],
  };
}

function emptyMaterialRequestDraft(): MaterialRequestDraft {
  const currentPerson = currentProductionPerson();
  const today = shanghaiBusinessDateText();
  return {
    code: '',
    requestType: '临时备料',
    sourceTaskCode: '',
    sourceDocument: '',
    department: currentPerson.department,
    requesterEmployeeCode: currentPerson.employeeCode,
    requester: currentPerson.name,
    requestDate: today,
    expectedDate: today,
    status: '草稿',
    linkedPurchaseRequisition: '',
    note: '',
    nextStep: '提交后由系统评估可用库存，缺口自动转采购需求',
    lines: [createMaterialRequestLine('draft-material-request', 0)],
  };
}

function materialRequestDraftFromRow(row: ProductionListRow): MaterialRequestDraft {
  const raw = row.raw;
  return {
    ...emptyMaterialRequestDraft(),
    code: text(raw.code, row.code),
    requestType: text(raw.requestType, row.title),
    sourceTaskCode: text(raw.sourceTaskCode, ''),
    sourceDocument: text(raw.sourceDocument, ''),
    department: text(raw.department, row.party),
    requesterEmployeeCode: text(raw.requesterEmployeeCode, employeeCodeForDisplayName(raw.requester)),
    requester: text(raw.requester, row.owner),
    requestDate: text(raw.requestDate, row.date),
    expectedDate: text(raw.expectedDate, row.date),
    status: text(raw.status, row.status),
    linkedPurchaseRequisition: text(raw.linkedPurchaseRequisition, ''),
    note: text(raw.note, ''),
    nextStep: text(raw.nextAction, row.nextStep),
    lines: materialRequestLinesFromRaw(raw.lines, row.code),
  };
}

function materialRequestNextAction(status: unknown) {
  const value = text(status, '');
  if (value.includes('草稿')) return '提交系统评估';
  if (value.includes('待系统')) return '系统正在评估可用库存';
  if (value.includes('采购')) return '跟踪采购需求';
  if (value.includes('库存') || value.includes('完成')) return '工单释放后由仓库执行领料';
  return '查看库存评估结果';
}

function materialRequestNextStepDescription() {
  if (materialRequestDraft.value.status === '草稿') return '提交后系统按当前可用库存评估；草稿不占用库存，也不生成采购需求。';
  if (materialRequestDraft.value.linkedPurchaseRequisition) return '采购缺口已经交接采购，本申请内容已冻结。';
  if (/库存可满足|完成/.test(materialRequestDraft.value.status)) return '评估结果仅为计划快照；实际分配仍以工单释放时库存为准。';
  return '系统正在计算库存覆盖与采购缺口，无需仓库人工受理。';
}

function materialRequestLineSummary(value: unknown) {
  const lines = materialRequestLinesFromRaw(value, 'summary').filter((line) => line.materialCode || line.materialName);
  if (!lines.length) return '暂无备料明细';
  const grouped = new Map<string, { name: string; unit: string; quantity: number; purposes: Set<string> }>();
  lines.forEach((line) => {
    const unit = text(line.unit, '件');
    const key = `${text(line.materialCode || line.materialName)}|${unit}`;
    const current = grouped.get(key) || {
      name: text(line.materialName || line.materialCode),
      unit,
      quantity: 0,
      purposes: new Set<string>(),
    };
    current.quantity += toNumber(line.requestedQty);
    if (text(line.purpose, '')) current.purposes.add(text(line.purpose));
    grouped.set(key, current);
  });
  const materials = [...grouped.values()];
  const names = materials
    .slice(0, 2)
    .map((item) => `${item.name} ${qty(item.quantity, item.unit)}${item.purposes.size > 1 ? `（${item.purposes.size} 个用途）` : ''}`)
    .join('、');
  return materials.length > 2 ? `${names} 等 ${materials.length} 种物料` : names;
}

function materialRequestQuantitySummary(
  value: unknown,
  field: 'requestedQty' | 'purchaseQty' | 'taskEstimatedQty' = 'requestedQty',
) {
  const lines = Array.isArray(value)
    ? value as Array<MaterialRequestDraftLine | AnyRecord>
    : materialRequestLinesFromRaw(value, 'quantity-summary');
  const grouped = new Map<string, number>();
  lines.forEach((line) => {
    const unit = text(line.unit, '件');
    grouped.set(unit, (grouped.get(unit) || 0) + toNumber(line[field]));
  });
  return [...grouped.entries()]
    .filter(([, value]) => value > 0)
    .map(([unit, value]) => qty(value, unit))
    .join(' · ') || '0';
}

function materialRequestLineDisplay(line: MaterialRequestDraftLine) {
  return productIdentity(line.materialCode, line.materialName, '选择物料');
}

function materialRequestDraftFieldIsMissing(key: keyof MaterialRequestDraft) {
  if (key === 'requestType') return productionDraftValueIsMissing(materialRequestDraft.value.requestType);
  if (key === 'expectedDate') {
    if (productionDraftValueIsMissing(materialRequestDraft.value.expectedDate)) return true;
    return !materialRequestDraft.value.sourceTaskCode
      && Boolean(materialRequestDraft.value.requestDate)
      && materialRequestDraft.value.expectedDate < materialRequestDraft.value.requestDate;
  }
  if (key === 'requester') return productionDraftValueIsMissing(materialRequestDraft.value.requester)
    || productionDraftValueIsMissing(materialRequestDraft.value.requesterEmployeeCode);
  if (key === 'department') return productionDraftValueIsMissing(materialRequestDraft.value.department);
  return false;
}

function materialRequestDraftBlockingMessage() {
  if (!isProductionEditableDocument.value || activePage.value !== 'material-requests') return '';
  if (materialRequestDraftFieldIsMissing('requestType')) return '请选择申请类型';
  if (productionDraftValueIsMissing(materialRequestDraft.value.expectedDate)) return '请填写需求日期';
  if (!materialRequestDraft.value.sourceTaskCode
    && materialRequestDraft.value.requestDate
    && materialRequestDraft.value.expectedDate < materialRequestDraft.value.requestDate) return '需求日期不能早于申请日期';
  if (materialRequestDraftFieldIsMissing('requester')) return '请填写申请人';
  if (!materialRequestDraft.value.lines.length) return '请至少添加 1 行备料明细';
  const missingMaterial = materialRequestDraft.value.lines.find((line) => !line.materialCode || !line.materialName);
  if (missingMaterial) return '请补齐备料明细中的物料';
  const invalidQty = materialRequestDraft.value.lines.find((line) => toNumber(line.requestedQty) <= 0);
  if (invalidQty) return '申请数量必须大于 0';
  const missingPurpose = materialRequestDraft.value.lines.find((line) => !text(line.purpose, '').trim());
  if (missingPurpose) return '请填写每项物料的用途';
  return '';
}

function materialRequestRequiredFieldClass(key: keyof MaterialRequestDraft) {
  const hasError = productionValidationAttempted.value && materialRequestDraftFieldIsMissing(key);
  return {
    'is-required-field': materialRequestIsEditable.value,
    'has-field-error': materialRequestIsEditable.value && hasError,
  };
}

function materialRequestLineFieldClass(line: MaterialRequestDraftLine, key: 'material' | 'requestedQty' | 'purpose') {
  if (!productionValidationAttempted.value || !materialRequestIsEditable.value) return '';
  if (key === 'material' && (!line.materialCode || !line.materialName)) return 'has-field-error';
  if (key === 'requestedQty' && toNumber(line.requestedQty) <= 0) return 'has-field-error';
  if (key === 'purpose' && !text(line.purpose, '').trim()) return 'has-field-error';
  return '';
}

function handleMaterialRequestMaterialSelect(line: MaterialRequestDraftLine, option: ReferenceOption) {
  const raw = option.raw as AnyRecord;
  line.materialCode = option.code || '';
  line.materialName = option.name || '';
  line.model = text(raw.model, '');
  line.spec = text(raw.spec, '');
  line.unit = text(raw.uom || raw.unit || line.unit, '件');
  if (!line.purpose && option.code) line.purpose = materialRequestDraft.value.sourceTaskCode ? '补齐生产任务缺口' : '生产临时备料';
}

function addMaterialRequestLine() {
  materialRequestDraft.value.lines.push(createMaterialRequestLine(materialRequestDraft.value.code || 'draft-material-request', materialRequestDraft.value.lines.length));
}

function removeMaterialRequestLine(lineId: string) {
  if (materialRequestDraft.value.lines.length <= 1) return;
  materialRequestDraft.value.lines = materialRequestDraft.value.lines.filter((line) => line.lineId !== lineId);
}

function scrollToFirstMaterialRequestMissingField() {
  void nextTick(() => {
    const target =
      document.querySelector('[data-required-field="material-request-type"].has-field-error') ||
      document.querySelector('[data-required-field="material-request-expected-date"].has-field-error') ||
      document.querySelector('[data-required-field="material-request-requester"].has-field-error') ||
      document.querySelector('.production-material-request-table .has-field-error');
    const field = target as HTMLElement | null;
    const focusTarget = field?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(field);
    focusTarget?.focus();
  });
}

function validateMaterialRequestDraft() {
  productionValidationAttempted.value = true;
  const message = materialRequestDraftBlockingMessage();
  if (!message) return true;

  showToast(message, 'error');
  scrollToFirstMaterialRequestMissingField();
  return false;
}

function emptyWorkOrderDraft(): WorkOrderDraft {
  const currentPerson = currentProductionPerson();
  const today = shanghaiBusinessDateText();
  return {
    code: '',
    taskCode: '',
    sourceLineId: '',
    productCode: '',
    productName: '',
    planQty: '0',
    unit: '件',
    recipeCode: '',
    processTemplateCode: '',
    plannedDate: today,
    dueDate: today,
    ownerEmployeeCode: currentPerson.employeeCode,
    owner: currentPerson.name,
    note: '',
    status: '待确认',
    currentNode: '待确认',
    nextStep: '确认数量、配方和工艺后安排生产',
    releasedQty: '0',
    completedQty: '0',
    inboundQty: '0',
    materialNeeds: [],
    sourceAllocations: [],
  };
}

function workOrderSourceAllocationsFromRaw(raw: AnyRecord, fallbackTaskCode = '', fallbackLineId = ''): WorkOrderSourceAllocationDraft[] {
  const explicit = toArray<AnyRecord>(raw.sourceAllocations);
  const rows = explicit.length
    ? explicit
    : fallbackTaskCode && fallbackLineId
      ? [{
          taskCode: fallbackTaskCode,
          sourceLineId: fallbackLineId,
          sourceDocument: raw.sourceDocument,
          productCode: raw.productCode,
          productName: raw.productName,
          quantity: raw.planQty,
          unit: raw.unit,
          dueDate: raw.dueDate,
          supplementaryRequirement: raw.supplementaryRequirement,
          taskNote: raw.taskNote,
        }]
      : [];
  return rows.map((allocation) => {
    const taskCode = text(allocation.taskCode || allocation.sourceTask, '');
    const sourceTask = production2Tasks.find((task) => text(task.code, '') === taskCode) as AnyRecord | undefined;
    return {
      taskCode,
      sourceLineId: text(allocation.sourceLineId, ''),
      sourceDocument: text(allocation.sourceDocument, ''),
      supplementaryRequirement: text(
        allocation.supplementaryRequirement
          ?? sourceTask?.supplementaryRequirement
          ?? sourceTask?.internalRemark,
        '',
      ),
      taskNote: text(allocation.taskNote ?? sourceTask?.note, ''),
      productCode: text(allocation.productCode || raw.productCode, ''),
      productName: text(allocation.productName || raw.productName, ''),
      quantity: editableNumberText(allocation.quantity ?? allocation.qty, 0),
      unit: text(allocation.unit || raw.unit, '件'),
      dueDate: text(allocation.dueDate || raw.dueDate, ''),
    };
  }).filter((allocation) => allocation.taskCode && allocation.sourceLineId);
}

function workOrderTaskSourceLines(sourceTask?: AnyRecord) {
  if (!sourceTask) return [];
  const taskCode = text(sourceTask.code, 'task');
  const rawProducts = toArray<AnyRecord>(sourceTask.products);
  return taskProductRowsFromRaw(sourceTask, taskCode).map((line, index) => ({
    ...line,
    lineId: text(
      rawProducts[index]?.sourceLineId
        || rawProducts[index]?.lineId
        || (index === 0 ? sourceTask.sourceLineId : ''),
      `${taskCode}-L${index + 1}`,
    ),
  }));
}

function workOrderDemandLineForAllocation(allocation: WorkOrderSourceAllocationDraft) {
  const task = production2Tasks.find((candidate) => text(candidate.code, '') === allocation.taskCode) as AnyRecord | undefined;
  return workOrderTaskSourceLines(task).find((line) => line.lineId === allocation.sourceLineId);
}

function workOrderDemandTotalForAllocation(allocation: WorkOrderSourceAllocationDraft) {
  const line = workOrderDemandLineForAllocation(allocation);
  return qty(line?.demandQty || allocation.quantity, line?.unit || allocation.unit);
}

function workOrderDemandAvailableForAllocation(allocation: WorkOrderSourceAllocationDraft) {
  const line = workOrderDemandLineForAllocation(allocation);
  if (!line) return qty(allocation.quantity, allocation.unit);
  return qty(workOrderSourceAvailableQtyFor(allocation.taskCode, line), line.unit);
}

function workOrderBusinessNote(value: unknown) {
  const note = text(value, '').trim();
  const isGeneratedNote = /^来源于生产任务\s+\S+，按选中明细建立工单。$/.test(note)
    || /^销售订单\s+\S+\s+第\s+\S+\s+行缺口\s+[\d,.]+\s*\S+。?$/.test(note);
  return isGeneratedNote ? '' : note;
}

function workOrderRequirementFacts(raw: AnyRecord | undefined): DetailFact[] {
  if (!raw) return [];
  const sourceAllocations = workOrderSourceAllocationsFromRaw(
    raw,
    text(raw.taskCode || raw.sourceTask, ''),
    text(raw.sourceLineId, ''),
  );
  const sourceTaskCount = new Set(sourceAllocations.map((allocation) => allocation.taskCode).filter(Boolean)).size;
  const facts: DetailFact[] = [];
  const seenTaskContexts = new Set<string>();
  sourceAllocations.forEach((allocation) => {
    if (seenTaskContexts.has(allocation.taskCode)) return;
    seenTaskContexts.add(allocation.taskCode);
    const supplementaryRequirement = text(allocation.supplementaryRequirement, '').trim();
    const taskNote = productionTaskBusinessNote(allocation.taskNote);
    const taskLabelPrefix = sourceTaskCount > 1 ? `${allocation.taskCode} ` : '';
    if (supplementaryRequirement) {
      facts.push({
        label: `${taskLabelPrefix}补充要求`,
        value: supplementaryRequirement,
        full: true,
        multiline: true,
      });
    }
    if (taskNote) {
      facts.push({
        label: `${taskLabelPrefix}任务备注`,
        value: taskNote,
        full: true,
        multiline: true,
      });
    }
  });
  const workOrderNote = workOrderBusinessNote(raw.note);
  if (workOrderNote) {
    facts.push({ label: '工单备注', value: workOrderNote, full: true, multiline: true });
  }
  return facts;
}

function productionTaskBusinessNote(value: unknown) {
  const note = text(value, '').trim();
  return note === '销售订单确认后按未被可用库存覆盖的数量自动建立；生产计划可继续按成品明细拆分工单。'
    ? ''
    : note;
}

function workOrderDraftFromRow(row: ProductionListRow): WorkOrderDraft {
  const raw = row.raw;
  const taskCode = text(raw.taskCode, '');
  const sourceTask = production2Tasks.find((task) => text(task.code, '') === taskCode) as AnyRecord | undefined;
  const sourceLines = workOrderTaskSourceLines(sourceTask);
  const sourceLine = sourceLines.find((line) => line.lineId === text(raw.sourceLineId, ''))
    || sourceLines.find((line) => line.productCode === text(raw.productCode, ''));
  const dueDate = text(raw.dueDate, row.date || '2026-07-07');
  const sourceAllocations = workOrderSourceAllocationsFromRaw(raw, taskCode, text(raw.sourceLineId, sourceLine?.lineId || ''));
  return {
    ...emptyWorkOrderDraft(),
    code: text(raw.code, row.code),
    taskCode,
    sourceLineId: text(raw.sourceLineId, sourceLine?.lineId || ''),
    productCode: text(raw.productCode, sourceLine?.productCode || ''),
    productName: text(raw.productName, sourceLine?.productName || ''),
    planQty: editableNumberText(raw.planQty, 0),
    unit: text(raw.unit, sourceLine?.unit || '件'),
    recipeCode: text(raw.recipeCode, sourceLine?.recipeCode || ''),
    processTemplateCode: text(raw.processTemplateCode, ''),
    plannedDate: text(raw.plannedDate || raw.planDate || raw.startDate, dueDate),
    dueDate,
    ownerEmployeeCode: text(raw.ownerEmployeeCode, employeeCodeForDisplayName(raw.owner || row.owner)),
    owner: text(raw.owner, row.owner),
    note: workOrderBusinessNote(raw.note),
    status: text(raw.status, row.status),
    currentNode: text(raw.currentNode, '待确认'),
    nextStep: text(raw.nextAction, row.nextStep),
    releasedQty: editableNumberText(workOrderReleasedQty(raw), 0),
    completedQty: editableNumberText(raw.completedQty, 0),
    inboundQty: editableNumberText(raw.inboundQty, 0),
    materialNeeds: toArray<AnyRecord>(raw.materialNeeds),
    sourceAllocations,
  };
}

function workOrderRecommendedProcessCode(productCode: string) {
  return text(
    production2WorkOrders.find((order) => (
      text(order.productCode, '') === productCode
      && Boolean(text(order.processTemplateCode, ''))
    ))?.processTemplateCode,
    '',
  );
}

function currentWorkOrderSourceAllocationQty(taskCode: string, sourceLineId: string) {
  if (!isProductionEditDocument.value) return 0;
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  return workOrderSourceAllocationsFromRaw(raw || {}, text(raw?.taskCode, ''), text(raw?.sourceLineId, ''))
    .filter((allocation) => allocation.taskCode === taskCode && allocation.sourceLineId === sourceLineId)
    .reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0);
}

function workOrderSourceAvailableQtyFor(taskCode: string, line: TaskProductDraftLine) {
  const gap = taskProductScheduleGap(line, taskCode);
  return gap + currentWorkOrderSourceAllocationQty(taskCode, line.lineId);
}

function syncWorkOrderSourceAllocations() {
  const draft = workOrderDraft.value;
  const first = draft.sourceAllocations[0];
  draft.taskCode = first?.taskCode || '';
  draft.sourceLineId = first?.sourceLineId || '';
  draft.planQty = compactNumber(sumNumbers(draft.sourceAllocations.map((allocation) => toNumber(allocation.quantity))), 3);
  const dueDates = draft.sourceAllocations.map((allocation) => allocation.dueDate).filter(Boolean).sort();
  if (dueDates.length) draft.dueDate = dueDates[0];
}

function updateWorkOrderSourceAllocationQuantity(allocation: WorkOrderSourceAllocationDraft, value: string) {
  allocation.quantity = value;
  syncWorkOrderSourceAllocations();
}

function workOrderSourceAllocationQuantityHasError(allocation: WorkOrderSourceAllocationDraft) {
  if (!productionValidationAttempted.value) return false;
  const quantity = toNumber(allocation.quantity);
  if (!(quantity > 0)) return true;
  const line = workOrderDemandLineForAllocation(allocation);
  return Boolean(line && quantity > workOrderSourceAvailableQtyFor(allocation.taskCode, line) + 0.0001);
}

function initializeWorkOrderFromTaskDemand(task: AnyRecord, line: TaskProductDraftLine, recipe: AnyRecord) {
  const draft = workOrderDraft.value;
  draft.productCode = line.productCode;
  draft.productName = line.productName;
  draft.unit = line.unit || '件';
  draft.dueDate = text(task.deliveryDate, draft.dueDate);
  if (isProductionNewDocument.value || !draft.plannedDate) draft.plannedDate = shanghaiBusinessDateText();
  draft.ownerEmployeeCode = text(task.ownerEmployeeCode, draft.ownerEmployeeCode);
  draft.owner = text(task.owner, draft.owner);
  draft.recipeCode = text(recipe.code, '');
  draft.processTemplateCode = workOrderRecommendedProcessCode(line.productCode);
  draft.materialNeeds = toArray<AnyRecord>(task.materialNeeds);
}

function addWorkOrderSourceAllocation() {
  if (workOrderTaskDemandSelectionLocked.value) return;
  const option = workOrderTaskDemandOptions.value.find((item) => item.key === workOrderAdditionalSourceKey.value);
  if (!option?.recipe) return;
  if (!workOrderDraft.value.sourceAllocations.length) {
    initializeWorkOrderFromTaskDemand(option.task, option.line, option.recipe);
  }
  workOrderDraft.value.sourceAllocations.push({
    taskCode: option.taskCode,
    sourceLineId: option.line.lineId,
    sourceDocument: taskSourceCode(option.task),
    productCode: option.line.productCode,
    productName: option.line.productName,
    quantity: compactNumber(option.availableQty, 3),
    unit: option.line.unit,
    dueDate: text(option.task.deliveryDate, workOrderDraft.value.dueDate),
    supplementaryRequirement: text(option.task.supplementaryRequirement || option.task.internalRemark, ''),
    taskNote: text(option.task.note, ''),
  });
  workOrderAdditionalSourceKey.value = '';
  syncWorkOrderSourceAllocations();
}

function selectWorkOrderTaskDemand(sourceKey: string) {
  workOrderAdditionalSourceKey.value = sourceKey;
  addWorkOrderSourceAllocation();
}

function removeWorkOrderSourceAllocation(index: number) {
  workOrderDraft.value.sourceAllocations.splice(index, 1);
  syncWorkOrderSourceAllocations();
  if (!workOrderDraft.value.sourceAllocations.length) {
    if (isProductionNewDocument.value && !text(route.query.task, '') && currentProductionDocument.value) {
      workOrderDraft.value = workOrderDraftFromRow(currentProductionDocument.value);
      return;
    }
    const draft = workOrderDraft.value;
    const emptyDraft = emptyWorkOrderDraft();
    draft.sourceLineId = '';
    draft.productCode = '';
    draft.productName = '';
    draft.planQty = '0';
    draft.unit = emptyDraft.unit;
    draft.recipeCode = '';
    draft.processTemplateCode = '';
    draft.materialNeeds = [];
    draft.plannedDate = emptyDraft.plannedDate;
    draft.dueDate = emptyDraft.dueDate;
    draft.ownerEmployeeCode = emptyDraft.ownerEmployeeCode;
    draft.owner = emptyDraft.owner;
  }
}

function handleWorkOrderRecipeChange() {
  const recipe = workOrderSelectedRecipe.value;
  if (!recipe) return;
  workOrderDraft.value.unit = text(recipe.outputUnit, workOrderDraft.value.unit || '件');
}

function workOrderSourceAllocationError() {
  const allocations = workOrderDraft.value.sourceAllocations;
  if (!allocations.length) return '请选择至少一条生产任务需求';
  const keys = allocations.map((allocation) => `${allocation.taskCode}::${allocation.sourceLineId}`);
  if (new Set(keys).size !== keys.length) return '同一任务明细不能重复承接';
  for (const allocation of allocations) {
    const task = production2Tasks.find((candidate) => text(candidate.code, '') === allocation.taskCode) as AnyRecord | undefined;
    const line = workOrderTaskSourceLines(task).find((candidate) => candidate.lineId === allocation.sourceLineId);
    if (!task || !line) return `任务 ${allocation.taskCode} 的需求已变化，请重新选择`;
    const quantity = toNumber(allocation.quantity);
    if (!(quantity > 0)) return `${allocation.taskCode} 的本工单数量必须大于 0`;
    const capacity = workOrderSourceAvailableQtyFor(allocation.taskCode, line);
    if (quantity > capacity + 0.0001) return `${allocation.taskCode} 当前最多可分配 ${qty(capacity, line.unit)}`;
    if (line.productCode !== workOrderDraft.value.productCode || line.unit !== workOrderDraft.value.unit) {
      return `${allocation.taskCode} 与当前工单的成品或单位不一致`;
    }
  }
  const total = sumNumbers(allocations.map((allocation) => toNumber(allocation.quantity)));
  if (Math.abs(total - toNumber(workOrderDraft.value.planQty)) > 0.0001) return '计划数量必须等于任务需求分配合计';
  return '';
}

function workOrderDraftFieldIsMissing(key: keyof WorkOrderDraft) {
  const draft = workOrderDraft.value;
  if (key === 'taskCode') return !draft.sourceAllocations.length;
  if (key === 'productCode') return !draft.productCode || !draft.productName;
  if (key === 'planQty') {
    const committedQty = Math.max(toNumber(draft.releasedQty), toNumber(draft.completedQty), toNumber(draft.inboundQty));
    return toNumber(draft.planQty) <= 0
      || toNumber(draft.planQty) < committedQty
      || Boolean(workOrderSourceAllocationError());
  }
  if (key === 'sourceLineId') return Boolean(draft.taskCode) && Boolean(workOrderSourceAllocationError());
  return productionDraftValueIsMissing(draft[key]);
}

function workOrderDraftBlockingMessage() {
  if (!isProductionEditableDocument.value || activePage.value !== 'work-orders') return '';
  const draft = workOrderDraft.value;
  if (workOrderDraftFieldIsMissing('taskCode')) return '请至少添加一条任务需求';
  if (workOrderDraftFieldIsMissing('productCode')) return '请选择成品';
  if (toNumber(draft.planQty) <= 0) return '计划数量必须大于 0';
  const sourceAllocationError = workOrderSourceAllocationError();
  if (sourceAllocationError) return sourceAllocationError;
  const committedQty = Math.max(toNumber(draft.releasedQty), toNumber(draft.completedQty), toNumber(draft.inboundQty));
  if (toNumber(draft.planQty) < committedQty) return `计划数量不能小于已安排或已执行数量 ${qty(committedQty, draft.unit)}`;
  if (workOrderDraftFieldIsMissing('unit')) return '请选择单位';
  if (workOrderDraftFieldIsMissing('recipeCode')) return '必须明确绑定配方版本';
  if (!workOrderSelectedRecipe.value || text(workOrderSelectedRecipe.value.productCode, '') !== draft.productCode) return '所选配方版本与成品不匹配';
  if (workOrderDraftFieldIsMissing('processTemplateCode') || !workOrderSelectedProcessTemplate.value) return '必须明确绑定工艺版本';
  return '';
}

function workOrderRequiredFieldClass(key: keyof WorkOrderDraft) {
  return {
    'is-required-field': workOrderIsEditable.value,
    'has-field-error': workOrderIsEditable.value
      && productionValidationAttempted.value
      && workOrderDraftFieldIsMissing(key),
  };
}

function scrollToFirstWorkOrderMissingField() {
  void nextTick(() => {
    const target = document.querySelector('.production-work-order-editor .has-field-error') as HTMLElement | null;
    const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(target);
    focusTarget?.focus();
  });
}

function validateWorkOrderDraft() {
  const message = workOrderDraftBlockingMessage();
  if (!message) return true;
  showToast(message, 'error');
  scrollToFirstWorkOrderMissingField();
  return false;
}

function buildWorkOrderMaterialNeeds(planQtyValue: unknown, recipe: AnyRecord | undefined, fallbackNeeds: AnyRecord[] = []) {
  const planQty = toNumber(planQtyValue);
  if (!recipe || planQty <= 0) return fallbackNeeds;
  const losses = toArray<AnyRecord>(recipe.estimatedLosses);
  return toArray<AnyRecord>(recipe.materials).map((material) => {
    const usageMode = recipeMaterialUsageMode(material);
    const unit = usageMode === 'percent' ? 'kg' : text(material.unit, '件');
    const outputUnit = text(recipe.outputUnit, '件');
    const perUnitQty = usageMode === 'percent'
      ? recipeMaterialBaseKg(material, recipe.productUnitWeightKg)
      : recipeMaterialPerUnitQty(material);
    const baseRequired = perUnitQty * planQty;
    const loss = losses.find((item) => text(item.materialCode, '') === text(material.materialCode, ''));
    const required = baseRequired
      + toNumber(loss?.fixedLossQty)
      + (baseRequired * toNumber(loss?.lossRatePercent)) / 100;
    const live = liveInventorySnapshot(text(material.materialCode, ''));
    const fallbackNeed = fallbackNeeds.find((item) => text(item.materialCode, '') === text(material.materialCode, ''));
    const inventoryKnown = live.found || Boolean(fallbackNeed);
    const availableQty = live.found ? live.availableQty : toNumber(fallbackNeed?.availableQty);
    const qcPendingQty = live.found ? live.qcPendingQty : toNumber(fallbackNeed?.qcPendingQty || fallbackNeed?.pendingQcQty);
    const pendingInboundQty = live.found ? live.pendingInboundQty : toNumber(fallbackNeed?.pendingInboundQty);
    const inTransitQty = live.found ? live.inTransitQty : toNumber(fallbackNeed?.inTransitQty);
    const shortageQty = Math.max(0, required - availableQty);
    const pendingCoverageQty = qcPendingQty + pendingInboundQty + inTransitQty;
    const procurementGapQty = Math.max(0, shortageQty - pendingCoverageQty);
    const status = !inventoryKnown
      ? '待核对库存'
      : shortageQty <= 0
        ? '可齐套'
        : procurementGapQty > 0
          ? '需采购'
          : pendingInboundQty > 0
            ? '待仓库入库'
            : qcPendingQty > 0
              ? '待质检放行'
              : '补充在途';
    return {
      lineId: text(fallbackNeed?.lineId, ''),
      materialCode: text(material.materialCode),
      materialName: text(material.materialName),
      usage: usageMode === 'percent'
        ? `${formatPercent(recipeMaterialPercent(material))} · ${formatRecipeQuantity(perUnitQty, unit)}/${outputUnit}`
        : `${formatRecipeQuantity(perUnitQty, unit)}/${outputUnit}`,
      perUnitQty: required / planQty,
      basePerUnitQty: perUnitQty,
      estimatedQty: required,
      unit,
      incomingQcRequired: Boolean(material.incomingQcRequired),
      inventoryKnown,
      availableQty,
      qcPendingQty,
      pendingInboundQty,
      inTransitQty,
      shortageQty,
      procurementGapQty,
      status,
    };
  });
}

function buildProductionTaskMaterialNeeds(draft: ProductionTaskDraft) {
  const totals = new Map<string, AnyRecord>();
  draft.products
    .filter((product) => product.productCode && toNumber(product.demandQty) > 0)
    .forEach((product) => {
      const recipe = production2Recipes.find((item) => (
        text((item as AnyRecord).code, '') === product.recipeCode
        || (
          !product.recipeCode
          && text((item as AnyRecord).productCode, '') === product.productCode
          && text((item as AnyRecord).status, '') === '启用'
        )
      )) as AnyRecord | undefined;
      if (!recipe) return;
      const losses = toArray<AnyRecord>(recipe.estimatedLosses);
      toArray<AnyRecord>(recipe.materials).forEach((material) => {
        const materialCode = text(material.materialCode, '');
        if (!materialCode) return;
        const usageMode = recipeMaterialUsageMode(material);
        const unit = usageMode === 'percent' ? 'kg' : text(material.unit, '件');
        const perUnitQty = usageMode === 'percent'
          ? recipeMaterialBaseKg(material, recipe.productUnitWeightKg)
          : recipeMaterialPerUnitQty(material);
        const baseRequired = perUnitQty * toNumber(product.demandQty);
        const loss = losses.find((item) => text(item.materialCode, '') === materialCode);
        const estimatedQty = baseRequired
          + recipeMaterialFixedLossQty(loss || {})
          + (baseRequired * recipeMaterialLossRatePercent(loss || {})) / 100;
        const key = `${materialCode}::${unit}`;
        const previous = totals.get(key);
        totals.set(key, {
          materialCode,
          materialName: text(material.materialName, materialCode),
          perUnitQty: toNumber(previous?.perUnitQty) + perUnitQty,
          estimatedQty: toNumber(previous?.estimatedQty) + estimatedQty,
          unit,
          incomingQcRequired: Boolean(previous?.incomingQcRequired || material.incomingQcRequired),
        });
      });
    });

  return [...totals.values()].map((item) => {
    const inventory = liveInventorySnapshot(text(item.materialCode, ''));
    const availableQty = inventory.found ? inventory.availableQty : 0;
    const shortageQty = Math.max(0, toNumber(item.estimatedQty) - availableQty);
    const pendingCoverageQty = inventory.pendingInboundQty + inventory.qcPendingQty + inventory.inTransitQty;
    const procurementGapQty = Math.max(0, shortageQty - pendingCoverageQty);
    const status = shortageQty <= 0
      ? '可齐套'
      : procurementGapQty > 0
        ? '需采购'
        : inventory.pendingInboundQty > 0
          ? '待仓库入库'
          : inventory.qcPendingQty > 0
            ? '待质检放行'
            : '补充在途';
    return {
      ...item,
      availableQty,
      shortageQty,
      procurementGapQty,
      qcPendingQty: inventory.qcPendingQty,
      pendingInboundQty: inventory.pendingInboundQty,
      inTransitQty: inventory.inTransitQty,
      status,
    };
  });
}

function emptyRecipeDraft(): RecipeDraft {
  return {
    code: '',
    revision: 0,
    sourceRecipeCode: '',
    version: 'v1',
    productCode: '',
    productName: '',
    productUnitWeightKg: '',
    outputUnit: '',
    note: '',
    owner: '',
    status: '草稿',
    updatedAt: '',
    nextStep: '定期复核',
    materials: [],
    estimatedLosses: [],
  };
}

function emptyProcessTemplateDraft(): ProcessTemplateDraft {
  return {
    code: '',
    revision: 0,
    sourceProcessTemplateCode: '',
    name: '',
    version: 'v1',
    routeType: '直接收卷',
    productFamily: '',
    lineTypes: [],
    status: '草稿',
    owner: '工艺工程',
    updatedAt: '2026-07-07',
    nextStep: '定期复核',
    temperatureTolerance: '',
    temperatureZones: [],
    steps: [],
  };
}

function emptyProcessStepDraft(): ProcessStepDraft {
  return {
    code: '',
    name: '',
    status: '启用',
    owner: '工艺工程',
    updatedAt: '2026-07-07',
    ownerDomain: '系统',
    executionMode: '事件自动触发',
    completionMode: '提交成功即完成',
    trigger: '',
    entryLabel: '',
    result: '',
    blockingPolicy: '不阻断',
    repeatPolicy: '单次',
    requiredInputs: [],
    emittedEvents: [],
    completionSignal: '',
    idempotencyScope: '',
    failureRule: '',
    autoAdvance: '动作完成后自动推进',
    workInstruction: '',
    completionRule: '全部阻断动作完成后自动推进。',
    abnormalRule: '异常时停留当前工序等待处理。',
    actions: [],
  };
}

function taskDraftFromRow(row: ProductionListRow): ProductionTaskDraft {
  const raw = row.raw;
  const source = text(raw.source, '');
  const products = taskProductRowsFromRaw(raw, row.code);
  const demandTotal = sumNumbers(products.map((product) => toNumber(product.demandQty)));
  const inboundTotal = sumNumbers(products.map((product) => toNumber(product.inboundQty)));
  const plannedTotal = sumNumbers(products.map((product) => taskProductPlannedQty(product, row.code)));
  const firstProduct = products[0] || createTaskProductLine(row.code, 0);
  return {
    ...emptyProductionTaskDraft(),
    code: text(raw.code, row.code),
    sourceType: taskSourceTypeValue(raw.sourceType || source),
    sourceCode: taskSourceCode(raw),
    sourceLineId: text(raw.sourceLineId, ''),
    createdAt: text(raw.createdAt, `${row.date} 09:00`),
    productCode: firstProduct.productCode,
    productName: firstProduct.productName,
    demandQty: editableNumberText(demandTotal, 0),
    finishedStockQty: editableNumberText(inboundTotal, 0),
    productionQty: editableNumberText(Math.max(0, demandTotal - plannedTotal), 0),
    unit: firstProduct.unit || text(raw.unit, '件'),
    deliveryDate: text(raw.deliveryDate, row.date),
    priority: text(raw.priority, '正常'),
    status: text(raw.status, row.status),
    recipeCode: firstProduct.recipeCode || text(raw.recipeCode, ''),
    ownerEmployeeCode: text(raw.ownerEmployeeCode, employeeCodeForDisplayName(raw.owner || row.owner)),
    owner: text(raw.owner, row.owner),
    nextStep: row.nextStep,
    supplementaryRequirement: text(raw.supplementaryRequirement || raw.internalRemark, ''),
    note: productionTaskBusinessNote(raw.note || raw.remark),
    products,
    materialNeeds: toArray<AnyRecord>(raw.materialNeeds),
  };
}

function processTemplateDraftFromRow(row: ProductionListRow): ProcessTemplateDraft {
  const raw = row.raw;
  const zones = toArray<AnyRecord>(raw.temperatureZones);
  const stepCodes = toArray<string>(raw.stepCodes);
  const stepInstructions = toArray<AnyRecord>(raw.stepInstructions || raw.steps);
  const routeType = text(raw.routeType, stepCodes.includes('P2-STEP-WIP-REPORT-LARGE-REEL') ? '大盘复绕' : '直接收卷') as ProcessTemplateDraft['routeType'];
  return {
    ...emptyProcessTemplateDraft(),
    code: text(raw.code, row.code),
    revision: toNumber(raw.revision),
    sourceProcessTemplateCode: optionalDocumentCode(raw.sourceProcessTemplateCode),
    name: String(raw.name || '').trim(),
    version: text(raw.version, 'v1'),
    routeType,
    productFamily: text(raw.productFamily, ''),
    lineTypes: schedulableProcessLineTypes(raw.lineTypes),
    status: text(raw.status, row.status),
    owner: text(raw.owner, row.owner),
    updatedAt: text(raw.updatedAt, row.date),
    nextStep: text(raw.nextAction, row.nextStep),
    temperatureTolerance: text(raw.temperatureTolerance, ''),
    temperatureZones: standardizedProcessTemplateZones(zones)
      .map((zone, index) => processTemplateZoneFromRaw(zone, row.code, index)),
    steps: stepCodes.length
      ? stepCodes.map((stepCode, index) => processTemplateStepFromCode(
        stepCode,
        row.code,
        index,
        processTemplateStepInstructionFor(stepInstructions, stepCode, index),
        routeType,
      ))
      : [createProcessTemplateStep()],
  };
}

function optionalDocumentCode(value: unknown) {
  const code = text(value, '').trim();
  return code && code !== '-' ? code : '';
}

function processTemplateZoneFromRaw(zone: AnyRecord, rowCode: string, index: number): ProcessTemplateZoneDraftLine {
  return {
    lineId: `${rowCode}-zone-${index}`,
    name: text(zone.name, defaultProcessTemplateZones()[index]?.name || ''),
    value: processTemplateTemperatureInputValue(zone.value),
  };
}

function processTemplateStepInstructionFor(instructions: AnyRecord[], stepCode: string, index: number) {
  return instructions.find((item) => text(item.stepCode || item.code, '') === stepCode) || instructions[index] || {};
}

function processTemplateStepFromCode(
  stepCode: string,
  rowCode: string,
  index: number,
  instruction: AnyRecord = {},
  routeType: ProcessTemplateDraft['routeType'] | '' = '',
): ProcessTemplateStepDraftLine {
  const defaults = processTemplateStepWorkDefaults(stepCode, routeType);
  const maintainedControlPoints = text(instruction.controlPoints || instruction.controlPoint, '');
  const controlPoints = /生产确认领料烘干|领料烘干确认/.test(maintainedControlPoints)
    ? defaults.controlPoints
    : maintainedControlPoints || defaults.controlPoints;
  return {
    lineId: `${rowCode}-step-${index}-${stepCode || 'empty'}`,
    stepCode,
    coreEquipment: text(instruction.coreEquipment || instruction.equipment, defaults.coreEquipment),
    workContent: text(instruction.workContent || instruction.content, defaults.workContent),
    controlPoints,
    commonIssues: text(instruction.commonIssues || instruction.commonIssue, defaults.commonIssues),
    expanded: index === 0,
  };
}

function processStepDraftFromRow(row: ProductionListRow): ProcessStepDraft {
  const raw = row.raw;
  return {
    ...emptyProcessStepDraft(),
    code: text(raw.code, row.code),
    name: text(raw.name, row.title),
    status: text(raw.status, row.status),
    owner: text(raw.ownerDomain, row.owner),
    updatedAt: text(raw.updatedAt, row.date),
    ownerDomain: text(raw.ownerDomain, '系统'),
    executionMode: text(raw.executionMode, '事件自动触发'),
    completionMode: text(raw.completionMode, '提交成功即完成'),
    trigger: text(raw.trigger, ''),
    entryLabel: text(raw.entryLabel, ''),
    result: text(raw.result, ''),
    blockingPolicy: text(raw.blockingPolicy, '不阻断'),
    repeatPolicy: text(raw.repeatPolicy, '单次'),
    requiredInputs: toArray<string>(raw.requiredInputs),
    emittedEvents: toArray<string>(raw.emittedEvents),
    completionSignal: text(raw.completionSignal, ''),
    idempotencyScope: text(raw.idempotencyScope, ''),
    failureRule: text(raw.failureRule, ''),
    autoAdvance: text(raw.executionMode, ''),
    workInstruction: text(raw.trigger, ''),
    completionRule: text(raw.result, ''),
    abnormalRule: text(raw.failureRule, ''),
    actions: [],
  };
}

function processStepDraftActionFromRaw(item: AnyRecord, rowCode: string, index: number): ProcessStepActionDraftLine {
  const type = processStepActionTypeValue(item.type);
  const preset = processStepActionPreset(type);
  return {
    lineId: `${rowCode}-action-${type}-${index}`,
    ...preset,
    label: text(item.label, preset.label),
    actor: processStepActorValue(item.actor, preset.actor),
    triggerTiming: text(item.triggerTiming, preset.triggerTiming),
    generatedTask: text(item.generatedTask, preset.generatedTask),
    buttonLabel: text(item.buttonLabel, preset.buttonLabel),
    qualityStandard: text(item.qualityStandard, preset.qualityStandard),
    completionEvent: text(item.completionEvent, preset.completionEvent),
    blocking: typeof item.blocking === 'boolean' ? item.blocking : preset.blocking,
    abnormalEvent: text(item.abnormalEvent, preset.abnormalEvent),
  };
}

function processStepActionsFromRaw(raw: AnyRecord): AnyRecord[] {
  const explicitActions = toArray<AnyRecord>(raw.actions);
  if (explicitActions.length) return explicitActions;

  const actions: AnyRecord[] = [];
  if (text(raw.warehouseAction, '无') !== '无') {
    actions.push({
      ...processStepActionPresetWithDefaults(text(raw.stepType) === '入库' ? 'warehouseInbound' : 'warehouseIssue'),
      label: text(raw.warehouseAction),
      completionEvent: text(raw.warehouseAction),
      abnormalEvent: text(raw.failAction, ''),
    });
  }
  if (text(raw.defaultAction, '无') !== '无' && text(raw.defaultAction) !== '工艺提示') {
    const type =
      text(raw.stepType) === '包装'
        ? 'packagingConfirm'
        : text(raw.stepType) === '开机'
          ? 'startupConfirm'
          : text(raw.name).includes('半成品报工')
            ? 'semiFinishedReport'
            : text(raw.name).includes('成品报工')
              ? 'finishedReport'
              : 'startupConfirm';
    actions.push({
      ...processStepActionPresetWithDefaults(type),
      label: text(raw.defaultAction),
      buttonLabel: text(raw.defaultAction),
      completionEvent: text(raw.passAction, ''),
      abnormalEvent: text(raw.failAction, ''),
    });
  }
  if (text(raw.qualityTrigger, '无') !== '无' && text(raw.executionMode) === '质检动作') {
    actions.push({
      ...processStepActionPresetWithDefaults(text(raw.name).includes('入库') ? 'inboundInspection' : text(raw.name).includes('开机') || text(raw.name).includes('首检') ? 'startupInspection' : 'reportInspection'),
      label: text(raw.name),
      qualityStandard: text(raw.name),
      completionEvent: text(raw.qualityTrigger),
      abnormalEvent: text(raw.failAction, ''),
    });
  }
  return actions;
}

function processStepActionPreset(type: ProcessStepActionType) {
  return processStepActionPresets.find((preset) => preset.type === type) || processStepActionPresets[0];
}

function processStepActionPresetWithDefaults(type: string): ProcessStepActionPreset {
  return { ...processStepActionPreset(processStepActionTypeValue(type)) };
}

function processStepActionTypeValue(value: unknown): ProcessStepActionType {
  const normalized = String(value || '');
  return processStepActionPresets.some((preset) => preset.type === normalized) ? (normalized as ProcessStepActionType) : 'startupConfirm';
}

function processStepActorValue(value: unknown, fallback: ProcessStepActionDraftLine['actor']): ProcessStepActionDraftLine['actor'] {
  return processStepActorOptions.includes(value as ProcessStepActionDraftLine['actor']) ? (value as ProcessStepActionDraftLine['actor']) : fallback;
}

function processStepActionSummary(actions: ProcessStepActionDraftLine[]) {
  if (!actions.length) return '未配置动作';
  return actions.map((action) => action.label).join('、');
}

function processStepNextStepText(draft: ProcessStepDraft) {
  if (!draft.actions.length) return '无动作，作为提示节点自动跳过';
  return draft.autoAdvance || '动作完成后自动推进';
}

function processStepActionTypeOptions(index: number) {
  const usedTypes = new Set(processStepDraft.value.actions.filter((_, actionIndex) => actionIndex !== index).map((action) => action.type));
  return processStepActionPresets.filter((preset) => !usedTypes.has(preset.type) || processStepDraft.value.actions[index]?.type === preset.type);
}

function createProcessStepAction(type = firstAvailableProcessStepActionType()): ProcessStepActionDraftLine {
  const preset = processStepActionPresetWithDefaults(type);
  return {
    lineId: `process-step-action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...preset,
  };
}

function firstAvailableProcessStepActionType(): ProcessStepActionType {
  const usedTypes = new Set(processStepDraft.value.actions.map((action) => action.type));
  return processStepActionPresets.find((preset) => !usedTypes.has(preset.type))?.type || 'warehouseIssue';
}

function addProcessStepAction() {
  if (processStepDraft.value.actions.length >= processStepActionPresets.length) {
    showToast('所有预设动作都已添加', 'error');
    return;
  }
  processStepDraft.value.actions = [...processStepDraft.value.actions, createProcessStepAction()];
}

function removeProcessStepAction(index: number) {
  processStepDraft.value.actions = processStepDraft.value.actions.filter((_, actionIndex) => actionIndex !== index);
}

function handleProcessStepActionTypeChange(action: ProcessStepActionDraftLine) {
  const preset = processStepActionPresetWithDefaults(action.type);
  const currentLineId = action.lineId;
  Object.assign(action, {
    lineId: currentLineId,
    ...preset,
  });
}

function processStepActionFieldClass(action: ProcessStepActionDraftLine, key: 'label' | 'generatedTask' | 'completionEvent') {
  if (!productionValidationAttempted.value || !processStepIsEditable.value) return '';
  if (key === 'label' && productionDraftValueIsMissing(action.label)) return 'has-field-error';
  if (key === 'generatedTask' && productionDraftValueIsMissing(action.generatedTask)) return 'has-field-error';
  if (key === 'completionEvent' && productionDraftValueIsMissing(action.completionEvent)) return 'has-field-error';
  return '';
}

function recipeDraftFromRow(row: ProductionListRow): RecipeDraft {
  const raw = row.raw;
  const draft = emptyRecipeDraft();
  const materials = toArray<AnyRecord>(raw.materials);
  const draftMaterials = materials.length
    ? materials.map((item, index) => recipeDraftLineFromRaw(item, row.code, index))
    : [createRecipeDraftLine()];

  return {
    ...draft,
    code: text(raw.code, row.code),
    revision: toNumber(raw.revision),
    sourceRecipeCode: text(raw.sourceRecipeCode, ''),
    version: text(raw.version, 'v1'),
    productCode: text(raw.productCode, ''),
    productName: text(raw.productName, ''),
    productUnitWeightKg:
      raw.productUnitWeightKg === null || raw.productUnitWeightKg === undefined || raw.productUnitWeightKg === ''
        ? ''
        : editableNumberText(raw.productUnitWeightKg, 0),
    outputUnit: text(raw.outputUnit, ''),
    note: text(raw.note || raw.remark, ''),
    owner: text(raw.owner, row.owner),
    status: text(raw.status, row.status),
    updatedAt: text(raw.updatedAt, row.date),
    nextStep: text(raw.nextAction, row.nextStep),
    materials: draftMaterials,
    estimatedLosses: recipeEstimatedLossesFromRaw(raw, row.code, draftMaterials),
  };
}

function recipeDraftLineFromRaw(item: AnyRecord, rowCode: string, index: number): RecipeDraftLine {
  const usageMode = recipeMaterialUsageMode(item);
  return {
    lineId: `${rowCode}-${text(item.materialCode, 'line')}-${index}`,
    materialCode: text(item.materialCode, ''),
    materialName: text(item.materialName, ''),
    usageMode,
    percent: editableNumberText(recipeMaterialPercent(item), index === 0 ? 100 : 0),
    perUnitQty: editableNumberText(recipeMaterialPerUnitQty(item), usageMode === 'fixed' ? 1 : 0),
    unit: text(item.unit, ''),
    incomingQcRequired: Boolean(item.incomingQcRequired),
  };
}

function recipeEstimatedLossesFromRaw(raw: AnyRecord, rowCode: string, materials: RecipeDraftLine[]): RecipeEstimatedLossDraftLine[] {
  const explicitLosses = toArray<AnyRecord>(raw.estimatedLosses);
  if (explicitLosses.length) {
    return explicitLosses.map((item, index) => recipeEstimatedLossFromRaw(item, rowCode, index, materials));
  }

  return toArray<AnyRecord>(raw.materials)
    .filter((item) => recipeMaterialFixedLossQty(item) > 0 || recipeMaterialLossRatePercent(item) > 0)
    .map((item, index) => recipeEstimatedLossFromRaw(item, rowCode, index, materials));
}

function recipeEstimatedLossFromRaw(
  item: AnyRecord,
  rowCode: string,
  index: number,
  materials: RecipeDraftLine[],
): RecipeEstimatedLossDraftLine {
  const materialCode = text(item.materialCode, '');
  const material = materials.find((line) => line.materialCode === materialCode);
  return {
    lineId: `${rowCode}-loss-${materialCode || 'line'}-${index}`,
    materialCode,
    materialName: text(item.materialName, material?.materialName || ''),
    fixedLossQty: editableNumberText(recipeMaterialFixedLossQty(item), 0),
    lossRatePercent: editableNumberText(recipeMaterialLossRatePercent(item), 0),
    unit: text(item.unit, material ? recipeLineQuantityUnit(material) : ''),
  };
}

function createRecipeDraftLine(usageMode: RecipeUsageMode = 'percent'): RecipeDraftLine {
  return {
    lineId: `recipe-line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialCode: '',
    materialName: '',
    usageMode,
    percent: '0',
    perUnitQty: usageMode === 'fixed' ? '1' : '0',
    unit: '',
    incomingQcRequired: true,
  };
}

function createRecipeEstimatedLossLine(material?: RecipeDraftLine): RecipeEstimatedLossDraftLine {
  return {
    lineId: `recipe-loss-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialCode: material?.materialCode || '',
    materialName: material?.materialName || '',
    fixedLossQty: '0',
    lossRatePercent: '0',
    unit: material ? recipeLineQuantityUnit(material) : '',
  };
}

function defaultProcessTemplateZones() {
  return [
    { name: '水槽', value: '' },
    { name: '10区', value: '' },
    { name: '9区', value: '' },
    { name: '4区', value: '' },
    { name: '3区', value: '' },
    { name: '2区', value: '' },
    { name: '1区', value: '' },
    { name: '13区', value: '' },
    { name: '12区', value: '' },
    { name: '11区', value: '' },
    { name: '8区', value: '' },
    { name: '7区', value: '' },
    { name: '6区', value: '' },
    { name: '5区', value: '' },
  ];
}

function standardizedProcessTemplateZones(value: AnyRecord[]) {
  const sourceByName = new Map(value.map((zone) => [text(zone.name, ''), zone]));
  return defaultProcessTemplateZones().map((defaultZone) => {
    const source = sourceByName.get(defaultZone.name);
    return {
      name: defaultZone.name,
      value: source ? processTemplateTemperatureInputValue(source.value) || defaultZone.value : defaultZone.value,
    };
  });
}

function processTemplateRouteStepCodes(routeType: ProcessTemplateDraft['routeType']) {
  const commonStart = ['P2-STEP-MATERIAL-ISSUE', 'P2-STEP-STARTUP', 'P2-STEP-FIRST-INSPECTION'];
  const commonEnd = ['P2-STEP-FINISHED-REPORT-SMALL-REEL', 'P2-STEP-FINISHED-QC', 'P2-STEP-PACKAGING', 'P2-STEP-INBOUND-SAMPLING', 'P2-STEP-FINISHED-INBOUND'];
  return routeType === '大盘复绕'
    ? [...commonStart, 'P2-STEP-WIP-REPORT-LARGE-REEL', 'P2-STEP-WIP-QC', ...commonEnd]
    : [...commonStart, ...commonEnd];
}

function applyProcessTemplateRoutePreset() {
  const routeType = processTemplateDraft.value.routeType;
  const currentSteps = new Map(processTemplateDraft.value.steps.map((step) => [step.stepCode, step]));
  processTemplateDraft.value.steps = processTemplateRouteStepCodes(routeType).map((stepCode, index) => {
    const current = currentSteps.get(stepCode);
    if (!current) return processTemplateStepFromCode(stepCode, `route-${routeType}`, index, {}, routeType);
    if (stepCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL') {
      return { ...current, ...processTemplateStepWorkDefaults(stepCode, routeType), expanded: index === 0 };
    }
    return { ...current, expanded: index === 0 };
  });
  processTemplateDraft.value.temperatureZones = standardizedProcessTemplateZones(
    processTemplateDraft.value.temperatureZones as unknown as AnyRecord[],
  ).map((zone, index) => processTemplateZoneFromRaw(zone, `route-${routeType}`, index));
  processTemplateDraft.value.lineTypes = routeType === '大盘复绕'
    ? ['拉丝机', '复绕机']
    : ['挤出机'];
  processTemplateDraft.value.productFamily = routeType === '大盘复绕' ? '拉丝复绕类成品' : '挤出类成品';
}

function createProcessTemplateStep(): ProcessTemplateStepDraftLine {
  const stepCode = firstAvailableProcessTemplateStepCode();
  const defaults = processTemplateStepWorkDefaults(stepCode, processTemplateDraft.value.routeType);
  return {
    lineId: `process-template-step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stepCode,
    ...defaults,
    expanded: true,
  };
}

function toggleProcessTemplateStep(line: ProcessTemplateStepDraftLine) {
  const shouldExpand = !line.expanded;
  processTemplateDraft.value.steps.forEach((step) => {
    step.expanded = false;
  });
  line.expanded = shouldExpand;
}

function firstAvailableProcessTemplateStepCode() {
  const used = new Set(processTemplateDraft.value.steps.map((line) => line.stepCode).filter(Boolean));
  const allowed = new Set(processTemplateRouteStepCodes(processTemplateDraft.value.routeType));
  return production2ProcessSteps.find((step) => allowed.has(step.code) && !used.has(step.code))?.code || '';
}

function recipeIsCurrentRecipeRow(row: AnyRecord) {
  const currentCode = recipeNormalizedCode(recipeDraft.value.code || currentProductionDocument.value?.code);
  return Boolean(currentCode && recipeNormalizedCode(row.code) === currentCode);
}

function recipeEffectiveRecipeStatus(row: AnyRecord) {
  return recipeIsCurrentRecipeRow(row) ? text(recipeDraft.value.status, '') : text(row.status, '');
}

function recipeEffectiveRecipeVersion(row: AnyRecord) {
  return recipeIsCurrentRecipeRow(row) ? text(recipeDraft.value.version, '-') : text(row.version, '-');
}

function recipeRowsForProduct(productCode: unknown, excludeCurrent = false) {
  const normalizedProductCode = recipeNormalizedCode(productCode);
  if (!normalizedProductCode) return [];
  return production2Recipes
    .filter((row) => recipeNormalizedCode((row as AnyRecord).productCode) === normalizedProductCode)
    .filter((row) => !excludeCurrent || !recipeIsCurrentRecipeRow(row as AnyRecord)) as AnyRecord[];
}

function recipeVersionNumber(version: unknown) {
  const raw = text(version, '').trim();
  const match = raw.match(/v?\s*(\d+)$/i) || raw.match(/(\d+)/);
  return match ? toNumber(match[1]) : 0;
}

function recipeVersionLabel(versionNumber: number) {
  return `v${Math.max(1, Math.floor(versionNumber))}`;
}

function nextRecipeVersionForProduct(productCode: unknown) {
  const versions = recipeRowsForProduct(productCode, true).map((row) => recipeVersionNumber(row.version));
  return recipeVersionLabel(Math.max(0, ...versions) + 1);
}

function syncRecipeVersionForProduct() {
  recipeDraft.value.version = recipeDraft.value.productCode ? nextRecipeVersionForProduct(recipeDraft.value.productCode) : 'v1';
}

function recipeEnabledConflictRow() {
  const normalizedProductCode = recipeNormalizedCode(recipeDraft.value.productCode);
  if (!normalizedProductCode) return null;
  return (
    recipeRowsForProduct(normalizedProductCode, true).find((row) => text(row.status, '') === '启用') || null
  );
}

function addRecipeLine(usageMode: RecipeUsageMode) {
  recipeDraft.value.materials = [...recipeDraft.value.materials, createRecipeDraftLine(usageMode)];
}

function removeRecipeLine(index: number) {
  if (recipeDraft.value.materials.length <= 1) {
    showToast('配方至少保留 1 行物料', 'error');
    return;
  }
  const removed = recipeDraft.value.materials[index];
  recipeDraft.value.materials = recipeDraft.value.materials.filter((_, lineIndex) => lineIndex !== index);
  if (removed?.materialCode) {
    recipeDraft.value.estimatedLosses = recipeDraft.value.estimatedLosses.filter((line) => line.materialCode !== removed.materialCode);
  }
}

function handleRecipeProductSelect(option: ReferenceOption) {
  const raw = option.raw as AnyRecord;
  recipeDraft.value.productCode = option.code || '';
  recipeDraft.value.productName = option.name || '';
  recipeDraft.value.outputUnit = text(raw.uom || recipeDraft.value.outputUnit, '件');
  syncRecipeVersionForProduct();
}

function recipeNormalizedCode(code: unknown) {
  return String(code || '').trim();
}

function recipeMaterialExcludeCodes(index: number) {
  return recipeDraft.value.materials
    .filter((_, lineIndex) => lineIndex !== index)
    .map((line) => recipeNormalizedCode(line.materialCode))
    .filter(Boolean);
}

function recipeLossMaterialOptions(index: number) {
  const selectedCodes = new Set(
    recipeDraft.value.estimatedLosses
      .filter((_, lineIndex) => lineIndex !== index)
      .map((line) => recipeNormalizedCode(line.materialCode))
      .filter(Boolean),
  );
  const optionMap = new Map<string, { code: string; name: string; unit: string }>();

  recipeDraft.value.materials.forEach((line) => {
    const code = recipeNormalizedCode(line.materialCode);
    if (!code || !line.materialName || selectedCodes.has(code) || optionMap.has(code)) return;
    optionMap.set(code, {
      code,
      name: line.materialName,
      unit: recipeLineQuantityUnit(line),
    });
  });

  return [...optionMap.values()];
}

function recipeMaterialHasDuplicate(line: RecipeDraftLine) {
  const code = recipeNormalizedCode(line.materialCode);
  if (!code) return false;
  return recipeDraft.value.materials.filter((item) => recipeNormalizedCode(item.materialCode) === code).length > 1;
}

function recipeEstimatedLossHasDuplicate(line: RecipeEstimatedLossDraftLine) {
  const code = recipeNormalizedCode(line.materialCode);
  if (!code) return false;
  return recipeDraft.value.estimatedLosses.filter((item) => recipeNormalizedCode(item.materialCode) === code).length > 1;
}

function recipeFirstDuplicateMaterialCode() {
  const seen = new Set<string>();
  for (const line of recipeDraft.value.materials) {
    const code = recipeNormalizedCode(line.materialCode);
    if (!code) continue;
    if (seen.has(code)) return code;
    seen.add(code);
  }
  return '';
}

function recipeFirstDuplicateEstimatedLossCode() {
  const seen = new Set<string>();
  for (const line of recipeDraft.value.estimatedLosses) {
    const code = recipeNormalizedCode(line.materialCode);
    if (!code) continue;
    if (seen.has(code)) return code;
    seen.add(code);
  }
  return '';
}

function recipeIncomingQualityRequired(rule: unknown) {
  const normalized = text(rule, '').trim();
  return !['免检', '不适用', '无需质检', '无需'].includes(normalized);
}

function handleRecipeMaterialSelect(index: number, option: ReferenceOption) {
  const line = recipeDraft.value.materials[index];
  if (!line) return;
  const previousCode = line.materialCode;
  const raw = option.raw as AnyRecord;
  const nextCode = option.code || '';
  if (nextCode && recipeDraft.value.materials.some((item, lineIndex) => lineIndex !== index && recipeNormalizedCode(item.materialCode) === nextCode)) {
    showToast('该物料已在投料组成或固定用量中存在，请修改原行或删除重复行', 'error');
    return;
  }
  if (!nextCode) {
    line.materialCode = '';
    line.materialName = '';
    line.unit = '';
    if (previousCode) {
      recipeDraft.value.estimatedLosses = recipeDraft.value.estimatedLosses.filter((lossLine) => lossLine.materialCode !== previousCode);
    }
    return;
  }
  const nextUnit = text(raw.uom, '');
  if (recipeLineUsageMode(line) === 'percent' && nextUnit.toLowerCase() !== 'kg') {
    showToast(`${option.name || nextCode} 的基础单位不是 kg，请添加到固定用量`, 'error');
    return;
  }
  line.materialCode = nextCode;
  line.materialName = option.name || '';
  line.unit = text(nextUnit || line.unit, recipeLineUsageMode(line) === 'percent' ? 'kg' : '');
  if (previousCode && previousCode !== line.materialCode) {
    recipeDraft.value.estimatedLosses = recipeDraft.value.estimatedLosses.map((lossLine) =>
      lossLine.materialCode === previousCode
        ? {
            ...lossLine,
            materialCode: line.materialCode,
            materialName: line.materialName,
            unit: recipeLineQuantityUnit(line),
          }
        : lossLine,
    );
  }
  line.incomingQcRequired = option.code ? recipeIncomingQualityRequired(raw.qualityControl) : true;
}

function addRecipeEstimatedLossLine() {
  const selectedCodes = new Set(recipeDraft.value.estimatedLosses.map((line) => recipeNormalizedCode(line.materialCode)).filter(Boolean));
  const material = recipeDraft.value.materials.find((line) => {
    const code = recipeNormalizedCode(line.materialCode);
    return code && !selectedCodes.has(code);
  });
  if (!material && !recipeDraft.value.materials.some((line) => recipeNormalizedCode(line.materialCode))) {
    showToast('请先在投料组成或固定用量中选择物料', 'error');
    return;
  }
  if (!material) {
    showToast('所有配方物料都已设置预估损耗规则', 'error');
    return;
  }
  recipeDraft.value.estimatedLosses = [...recipeDraft.value.estimatedLosses, createRecipeEstimatedLossLine(material)];
}

function removeRecipeEstimatedLossLine(index: number) {
  recipeDraft.value.estimatedLosses = recipeDraft.value.estimatedLosses.filter((_, lineIndex) => lineIndex !== index);
}

function handleRecipeEstimatedLossMaterialChange(line: RecipeEstimatedLossDraftLine, event: Event) {
  const target = event.target as HTMLSelectElement | null;
  const nextCode = recipeNormalizedCode(target?.value);
  if (nextCode && recipeDraft.value.estimatedLosses.some((item) => item !== line && recipeNormalizedCode(item.materialCode) === nextCode)) {
    showToast('该物料已在预估损耗中存在，请修改原行损耗或删除重复行', 'error');
    if (target) target.value = line.materialCode;
    return;
  }
  line.materialCode = nextCode;
  const material = recipeDraft.value.materials.find((item) => recipeNormalizedCode(item.materialCode) === nextCode);
  line.materialName = material?.materialName || '';
  line.unit = material ? recipeLineQuantityUnit(material) : '';
}

function recipeLineCalculation(lineId: string) {
  return recipeLineCalculations.value.find((line) => line.lineId === lineId);
}

function recipeLineQuantityUnit(line: RecipeDraftLine) {
  return text(line.unit, recipeLineUsageMode(line) === 'percent' ? 'kg' : '-');
}

function recipeLineUsageValue(line: RecipeDraftLine) {
  return recipeLineUsageMode(line) === 'fixed' ? formatRecipeQuantity(line.perUnitQty, recipeLineQuantityUnit(line)) : formatPercent(line.percent);
}

function recipeLineRequiredValue(line: RecipeDraftLine) {
  const pending = recipeLineRequiredPendingText(line);
  if (pending) return pending;
  return formatRecipeQuantity(recipeLineCalculation(line.lineId)?.requiredQty || 0, recipeLineQuantityUnit(line));
}

function recipeLineRequiredPendingText(line: RecipeDraftLine) {
  if (!line.materialCode) return '选择物料后计算';
  if (recipeLineUsageMode(line) === 'percent' && toNumber(recipeDraft.value.productUnitWeightKg) <= 0) return '填写净重后计算';
  return '';
}

function recipeEstimatedLossFixedValue(line: RecipeEstimatedLossDraftLine) {
  return toNumber(line.fixedLossQty) > 0 ? formatRecipeQuantity(line.fixedLossQty, line.unit) : '—';
}

function recipeEstimatedLossFormula(line: RecipeEstimatedLossDraftLine) {
  const additions = [];
  if (toNumber(line.lossRatePercent) > 0) additions.push(`净用量 × ${formatPercent(line.lossRatePercent)}`);
  if (toNumber(line.fixedLossQty) > 0) additions.push(`固定 ${recipeEstimatedLossFixedValue(line)}`);
  return additions.length ? `净用量 + ${additions.join(' + ')}` : '待填写损耗';
}

function recipeEstimatedLossIsEmpty(line: RecipeEstimatedLossDraftLine) {
  return toNumber(line.fixedLossQty) === 0 && toNumber(line.lossRatePercent) === 0;
}

function recipeDraftBlockingMessage() {
  if (!isProductionEditableDocument.value || activePage.value !== 'recipes') return '';
  if (recipeDraftFieldIsMissing('version')) return '请填写版本号';
  if (recipeDraftFieldIsMissing('productCode')) return '请选择产出物料';
  if (recipeDraftFieldIsMissing('productUnitWeightKg')) return '请填写大于 0 的每单位净重 kg';
  if (!recipePercentMaterials.value.length) return '请至少添加 1 行投料组成';
  const missingMaterial = recipeDraft.value.materials.find((line) => !line.materialCode || !line.materialName);
  if (missingMaterial) return '请补齐投料组成或固定用量中的物料';
  if (recipeFirstDuplicateMaterialCode()) return '投料组成或固定用量中存在重复物料，请修改原行或删除重复行';
  const invalidPercent = recipeDraft.value.materials.find((line) => recipeLineUsageMode(line) === 'percent' && toNumber(line.percent) <= 0);
  if (invalidPercent) return '投料占比行的百分比必须大于 0';
  const invalidPercentUnit = recipeDraft.value.materials.find((line) => recipeLineUsageMode(line) === 'percent' && text(line.unit, '').toLowerCase() !== 'kg');
  if (invalidPercentUnit) return `${invalidPercentUnit.materialName || '投料物料'} 的基础单位不是 kg，请改用固定用量`;
  const invalidFixedQty = recipeDraft.value.materials.find((line) => recipeLineUsageMode(line) === 'fixed' && toNumber(line.perUnitQty) <= 0);
  if (invalidFixedQty) return '固定用量行的每单位用量必须大于 0';
  const invalidLossMaterial = recipeDraft.value.estimatedLosses.find((line) => !line.materialCode || !line.materialName);
  if (invalidLossMaterial) return '请选择预估损耗规则对应的配方物料';
  if (recipeFirstDuplicateEstimatedLossCode()) return '预估损耗规则中存在重复物料，请修改原行或删除重复行';
  const invalidLoss = recipeDraft.value.estimatedLosses.find((line) => toNumber(line.fixedLossQty) < 0 || toNumber(line.lossRatePercent) < 0);
  if (invalidLoss) return '损耗不能填写负数';
  const emptyLoss = recipeDraft.value.estimatedLosses.find((line) => recipeEstimatedLossIsEmpty(line));
  if (emptyLoss) return '预估损耗至少填写固定损耗或比例损耗';
  return '';
}

function processStepDraftBlockingMessage() {
  if (!isProductionEditableDocument.value || activePage.value !== 'process-steps') return '';
  if (processStepDraftFieldIsMissing('name')) return '请填写动作名称';
  if (!processStepDraft.value.actions.length) return '请至少选择 1 个工序动作';
  const missingAction = processStepDraft.value.actions.find(
    (action) => productionDraftValueIsMissing(action.label) || productionDraftValueIsMissing(action.generatedTask) || productionDraftValueIsMissing(action.completionEvent),
  );
  if (missingAction) return '请补齐动作名称、生成内容和完成事件';
  return '';
}

function processTemplateDraftBlockingMessage() {
  if (!isProductionEditableDocument.value || activePage.value !== 'process-templates') return '';
  if (processTemplateDraftFieldIsMissing('name')) return '请填写工艺名称';
  if (processTemplateDraftFieldIsMissing('version')) return '请填写版本号';
  if (processTemplateDraftFieldIsMissing('productFamily')) return '请填写适用产品族';
  if (processTemplateDraftFieldIsMissing('lineTypes')) return '请填写至少 1 类适用产线';
  if (processTemplateDraft.value.lineTypes.some((item) => /包装(?:工位|线)?/.test(item))) {
    return '适用产线只填写可排产设备；包装工位请维护在包装阶段';
  }
  if (!text(processTemplateDraft.value.temperatureTolerance, '').trim()) return '请填写温控统一允差';
  if (processTemplateDraft.value.temperatureZones.length !== 14) return '温区必须保持固定的 14 个区域';
  const emptyZone = processTemplateDraft.value.temperatureZones.find((zone) => !processTemplateTemperatureInputValue(zone.value));
  if (emptyZone) return `请填写${emptyZone.name}温度`;
  if (processTemplateDraftFieldIsMissing('steps')) return '请至少选择 1 个工艺阶段';
  const emptyStep = processTemplateDraft.value.steps.find((line) => !line.stepCode);
  if (emptyStep) return '请补齐工艺路线中的空阶段';
  return '';
}

function validateRecipeDraft() {
  productionValidationAttempted.value = true;
  const message = recipeDraftBlockingMessage();
  if (!message) return true;

  showToast(message, 'error');
  scrollToFirstRecipeMissingField();
  return false;
}

function validateProcessTemplateDraft() {
  productionValidationAttempted.value = true;
  const message = processTemplateDraftBlockingMessage();
  if (!message) return true;

  showToast(message, 'error');
  scrollToFirstProcessTemplateMissingField();
  return false;
}

function validateProcessStepDraft() {
  const message = processStepDraftBlockingMessage();
  if (!message) return true;

  showToast(message, 'error');
  scrollToFirstProcessStepMissingField();
  return false;
}

function scrollToFirstRecipeMissingField() {
  void nextTick(() => {
    const target =
      document.querySelector('[data-required-field="recipe-version"].has-field-error') ||
      document.querySelector('[data-required-field="recipe-product"].has-field-error') ||
      document.querySelector('[data-required-field="recipe-unit-weight"].has-field-error') ||
      document.querySelector('.production-recipe-editor-table .has-field-error') ||
      document.querySelector('.production-recipe-editor-table .has-line-field-error') ||
      document.querySelector('.production-recipe-loss-table .has-field-error');
    const field = target as HTMLElement | null;
    const focusTarget = field?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(field);
    focusTarget?.focus();
  });
}

function scrollToFirstProcessTemplateMissingField() {
  void nextTick(() => {
    const target =
      document.querySelector('[data-required-field="process-template-name"].has-field-error') ||
      document.querySelector('[data-required-field="process-template-version"].has-field-error') ||
      document.querySelector('[data-required-field="process-template-product-family"].has-field-error') ||
      document.querySelector('[data-required-field="process-template-line-types"].has-field-error') ||
      document.querySelector('[data-required-field="process-template-temperature-tolerance"].has-field-error') ||
      document.querySelector('.process-template-zone-item input.has-field-error') ||
      document.querySelector('[data-required-field="process-template-steps"].has-field-error') ||
      document.querySelector('.process-template-step-board .has-field-error');
    const field = target as HTMLElement | null;
    const focusTarget = field?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(field);
    focusTarget?.focus();
  });
}

function recipeDraftFieldIsMissing(key: string) {
  if (key === 'version') return productionDraftValueIsMissing(recipeDraft.value.version);
  if (key === 'productCode') return productionDraftValueIsMissing(recipeDraft.value.productCode) || productionDraftValueIsMissing(recipeDraft.value.productName);
  if (key === 'productUnitWeightKg') return toNumber(recipeDraft.value.productUnitWeightKg) <= 0;
  return false;
}

function processTemplateDraftFieldIsMissing(key: string) {
  if (key === 'name') return productionDraftValueIsMissing(processTemplateDraft.value.name);
  if (key === 'version') return productionDraftValueIsMissing(processTemplateDraft.value.version);
  if (key === 'productFamily') return productionDraftValueIsMissing(processTemplateDraft.value.productFamily);
  if (key === 'lineTypes') return !processTemplateDraft.value.lineTypes.length;
  if (key === 'steps') return !processTemplateDraft.value.steps.some((line) => line.stepCode);
  return false;
}

function processStepDraftFieldIsMissing(key: string) {
  if (key === 'name') return productionDraftValueIsMissing(processStepDraft.value.name);
  return false;
}

function recipeRequiredFieldClass(key: string) {
  const hasError = productionValidationAttempted.value && recipeDraftFieldIsMissing(key);
  return {
    'is-required-field': recipeIsEditable.value,
    'has-field-error': recipeIsEditable.value && hasError,
  };
}

function recipeLineFieldClass(line: RecipeDraftLine, key: 'material' | 'percent' | 'perUnitQty') {
  if (!productionValidationAttempted.value || !recipeIsEditable.value) return '';
  if (key === 'material' && (!line.materialCode || !line.materialName || recipeMaterialHasDuplicate(line))) return 'has-line-field-error';
  if (key === 'percent' && recipeLineUsageMode(line) === 'percent' && toNumber(line.percent) <= 0) return 'has-field-error';
  if (key === 'perUnitQty' && recipeLineUsageMode(line) === 'fixed' && toNumber(line.perUnitQty) <= 0) return 'has-field-error';
  return '';
}

function processTemplateRequiredFieldClass(key: string) {
  const hasError = productionValidationAttempted.value && processTemplateDraftFieldIsMissing(key);
  return {
    'is-required-field': processTemplateIsEditable.value,
    'has-field-error': processTemplateIsEditable.value && hasError,
  };
}

function processTemplateZoneFieldClass(zone: ProcessTemplateZoneDraftLine) {
  return {
    'has-field-error': processTemplateIsEditable.value
      && productionValidationAttempted.value
      && !processTemplateTemperatureInputValue(zone.value),
  };
}

function processTemplateToleranceFieldClass() {
  return {
    'has-field-error': processTemplateIsEditable.value
      && productionValidationAttempted.value
      && !text(processTemplateDraft.value.temperatureTolerance, '').trim(),
  };
}

function processStepRequiredFieldClass(key: string) {
  const hasError = productionValidationAttempted.value && processStepDraftFieldIsMissing(key);
  return {
    'is-required-field': processStepIsEditable.value,
    'has-field-error': processStepIsEditable.value && hasError,
  };
}

function scrollToFirstProcessStepMissingField() {
  void nextTick(() => {
    const target =
      document.querySelector('[data-required-field="process-step-name"].has-field-error') ||
      document.querySelector('.process-step-action-card .has-field-error') ||
      document.querySelector('.process-step-action-empty');
    const field = target as HTMLElement | null;
    const focusTarget = field?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(field);
    focusTarget?.focus();
  });
}

function recipeEstimatedLossFieldClass(line: RecipeEstimatedLossDraftLine, key: 'material' | 'fixedLossQty' | 'lossRatePercent') {
  if (!productionValidationAttempted.value || !recipeIsEditable.value) return '';
  if (key === 'material' && (!line.materialCode || !line.materialName || recipeEstimatedLossHasDuplicate(line))) return 'has-field-error';
  if (
    (key === 'fixedLossQty' || key === 'lossRatePercent')
    && (toNumber(line[key]) < 0 || (line.materialCode && recipeEstimatedLossIsEmpty(line)))
  ) return 'has-field-error';
  return '';
}

function productIdentity(code: unknown, name: unknown, fallback: string) {
  const productName = text(name, '');
  const productCode = text(code, '');
  if (productName && productCode) return `${productName}（${productCode}）`;
  return productName || productCode || fallback;
}

function productionMaterialIdentityTone(code: unknown) {
  const value = text(code, '').toUpperCase();
  if (value.includes('MBK') || value.endsWith('-BLK') || value.includes('BLACK')) return '#35383b';
  if (value.includes('WHT') || value.includes('WHITE')) return '#f0eee7';
  if (value.includes('CLR') || value.includes('CLEAR')) return '#dce7e8';
  if (value.includes('PETG')) return '#dfe7e2';
  if (value.includes('PLA')) return '#e7e1d6';
  if (value.includes('PKG')) return '#e8dfcf';
  return '#e4e7e2';
}

function productionMaterialIdentityDetails(material: AnyRecord) {
  const code = text(material.materialCode || material.code, '');
  const master = masterDataRows.materials.find((item) => text(item.code, '') === code);
  return {
    code,
    name: text(material.materialName || material.name, text(master?.name, code || '-')),
    model: text(material.model, text(master?.model, '')),
    spec: text(material.spec, text(master?.spec, '')),
    imageUrl: text(material.imageUrl || material.imageDataUrl, text(master?.imageDataUrl, '')),
    imageLabel: text(material.imageLabel, text(master?.imageLabel, '')),
    imageTone: text(material.imageTone, text(master?.imageTone, productionMaterialIdentityTone(code))),
  };
}

function taskSourceTypeValue(value: unknown): TaskSourceType {
  const raw = text(value, '').trim();
  if (/销售|SO-|订单/.test(raw)) return '销售订单缺口';
  if (/库存|安全/.test(raw)) return '安全库存补货';
  return '手工新建';
}

function taskSourceCode(raw: AnyRecord) {
  const source = text(raw.sourceCode || raw.source, '');
  if (!source || source === '直接新建') return '';
  if (taskSourceTypeValue(raw.sourceType || source) === '手工新建') return '';
  return source;
}

function taskSourceDisplay(draft: ProductionTaskDraft) {
  if (draft.sourceCode) return draft.sourceCode;
  if (draft.sourceType === '手工新建') return '手工新建';
  return draft.sourceCode ? `${draft.sourceType} · ${draft.sourceCode}` : draft.sourceType;
}

function taskSourceDocumentDisplay(draft: ProductionTaskDraft) {
  if (draft.sourceCode) return `${draft.sourceCode}${draft.sourceLineId ? ` / ${draft.sourceLineId}` : ''}`;
  return draft.sourceType || '手工新建';
}

function taskSourceRoute(draft: ProductionTaskDraft) {
  if (!draft.sourceCode) return '';
  if (draft.sourceType === '销售订单缺口') {
    return `/sales/orders/${encodeURIComponent(draft.sourceCode)}`;
  }
  if (draft.sourceType === '安全库存补货') {
    const keyword = draft.sourceLineId || draft.sourceCode;
    return `/warehouse/inventory-alerts?tab=replenishment&keyword=${encodeURIComponent(keyword)}`;
  }
  return '';
}

function taskSourceDocumentFromRaw(raw: AnyRecord) {
  const sourceCode = taskSourceCode(raw);
  const sourceLineId = text(raw.sourceLineId, '');
  return sourceCode ? `${sourceCode}${sourceLineId ? ` / ${sourceLineId}` : ''}` : '无';
}

function workOrderSourceTaskFromRaw(raw: AnyRecord | undefined) {
  const taskCode = text(raw?.taskCode || raw?.sourceTask, '');
  return production2Tasks.find((task) => text(task.code, '') === taskCode) as AnyRecord | undefined;
}

function createTaskProductLine(rowCode: string, index: number, raw: AnyRecord = {}): TaskProductDraftLine {
  const productCode = text(raw.productCode || raw.code, '');
  const productName = text(raw.productName || raw.name, '');
  return {
    lineId: text(raw.lineId, `${rowCode || 'task'}-product-${index}`),
    productCode,
    productName,
    model: text(raw.model, ''),
    spec: text(raw.spec, ''),
    demandQty: editableNumberText(raw.qty ?? raw.productionQty ?? raw.demandQty, 0),
    unit: text(raw.unit, '件'),
    inboundQty: editableNumberText(raw.inboundQty, 0),
    recipeCode: text(raw.recipeCode, ''),
  };
}

function taskProductRowsFromRaw(raw: AnyRecord, rowCode: string): TaskProductDraftLine[] {
  const products = toArray<AnyRecord>(raw.products);
  if (products.length) return products.map((product, index) => createTaskProductLine(rowCode, index, product));
  if (raw.productCode || raw.productName) {
    return [
      createTaskProductLine(rowCode, 0, {
        productCode: raw.productCode,
        productName: raw.productName,
        model: raw.model,
        spec: raw.spec,
        qty: raw.productionQty || raw.demandQty,
        unit: raw.unit,
        inboundQty: raw.inboundQty,
        recipeCode: raw.recipeCode,
      }),
    ];
  }
  return [createTaskProductLine(rowCode, 0)];
}

function taskProductLineDisplay(line: TaskProductDraftLine) {
  return productIdentity(line.productCode, line.productName, '选择成品物料');
}

function taskWorkOrdersForProduct(line: TaskProductDraftLine, taskCode = taskDraft.value.code) {
  if (!taskCode || !line.productCode) return [];
  return production2WorkOrders.filter((order) => {
    return workOrderSourceAllocationsFromRaw(
      order as unknown as AnyRecord,
      text(order.taskCode, ''),
      text((order as unknown as AnyRecord).sourceLineId, ''),
    ).some((allocation) => (
      allocation.taskCode === taskCode
      && (allocation.sourceLineId === line.lineId || (!allocation.sourceLineId && allocation.productCode === line.productCode))
    ));
  });
}

function taskWorkOrderAllocationQty(order: Production2WorkOrder, line: TaskProductDraftLine, taskCode: string) {
  return workOrderSourceAllocationsFromRaw(
    order as unknown as AnyRecord,
    text(order.taskCode, ''),
    text((order as unknown as AnyRecord).sourceLineId, ''),
  ).filter((allocation) => allocation.taskCode === taskCode && allocation.sourceLineId === line.lineId)
    .reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0);
}

function taskWorkOrderProjectedQty(order: Production2WorkOrder, allocationQty: number, value: number) {
  const planQty = Math.max(0, toNumber(order.planQty));
  if (!(planQty > 0) || !(allocationQty > 0) || !(value > 0)) return 0;
  return Math.min(allocationQty, value * allocationQty / planQty);
}

function taskOrderAllocationQty(order: Production2WorkOrder, taskCode = taskDraft.value.code) {
  return workOrderSourceAllocationsFromRaw(
    order as unknown as AnyRecord,
    text(order.taskCode, ''),
    text((order as unknown as AnyRecord).sourceLineId, ''),
  ).filter((allocation) => allocation.taskCode === taskCode)
    .reduce((sum, allocation) => sum + toNumber(allocation.quantity), 0);
}

function taskOrderProjectedQty(order: Production2WorkOrder, value: number, taskCode = taskDraft.value.code) {
  return taskWorkOrderProjectedQty(order, taskOrderAllocationQty(order, taskCode), value);
}

function taskProductPlannedQty(line: TaskProductDraftLine, taskCode = taskDraft.value.code) {
  return sumNumbers(taskWorkOrdersForProduct(line, taskCode).map((order) => taskWorkOrderAllocationQty(order, line, taskCode)));
}

function taskProductInboundQty(line: TaskProductDraftLine, taskCode = taskDraft.value.code) {
  const inboundFromOrders = sumNumbers(taskWorkOrdersForProduct(line, taskCode).map((order) => {
    const allocationQty = taskWorkOrderAllocationQty(order, line, taskCode);
    return taskWorkOrderProjectedQty(order, allocationQty, toNumber(order.inboundQty));
  }));
  return inboundFromOrders > 0 ? inboundFromOrders : toNumber(line.inboundQty);
}

function taskProductReleasedQty(line: TaskProductDraftLine, taskCode = taskDraft.value.code) {
  return sumNumbers(taskWorkOrdersForProduct(line, taskCode).map((order) => {
    const allocationQty = taskWorkOrderAllocationQty(order, line, taskCode);
    return taskWorkOrderProjectedQty(order, allocationQty, workOrderReleaseFacts(order as unknown as AnyRecord).releasedQty);
  }));
}

function taskReleaseIsCompleteForProducts(lines: TaskProductDraftLine[], taskCode = taskDraft.value.code) {
  const validLines = lines.filter((line) => toNumber(line.demandQty) > 0);
  if (!taskCode || !validLines.length) return false;
  return validLines.every((line) => {
    const orders = taskWorkOrdersForProduct(line, taskCode);
    if (!orders.length) return false;
    return taskProductPlannedQty(line, taskCode) + 0.0001 >= toNumber(line.demandQty)
      && orders.every((order) => workOrderReleaseFacts(order as unknown as AnyRecord).unreleasedQty <= 0);
  });
}

function taskProductScheduleGap(line: TaskProductDraftLine, taskCode = taskDraft.value.code) {
  return Math.max(0, toNumber(line.demandQty) - taskProductPlannedQty(line, taskCode));
}

function taskProductQuantitySummary(
  lines: TaskProductDraftLine[],
  quantityFor: (line: TaskProductDraftLine) => number,
) {
  const validLines = lines.filter((line) => line.productCode || line.productName || toNumber(line.demandQty) > 0);
  if (!validLines.length) return '-';
  const units = new Set(validLines.map((line) => line.unit || '件'));
  if (units.size === 1) {
    return qty(sumNumbers(validLines.map(quantityFor)), validLines[0]?.unit || '件');
  }
  return validLines.map((line) => qty(quantityFor(line), line.unit || '件')).join(' + ');
}

function taskProductProgressMetric(
  lines: TaskProductDraftLine[],
  quantityFor: (line: TaskProductDraftLine) => number,
) {
  const validLines = lines.filter((line) => toNumber(line.demandQty) > 0);
  const units = new Set(validLines.map((line) => line.unit || '件'));
  if (units.size <= 1) {
    return {
      current: sumNumbers(validLines.map(quantityFor)),
      total: sumNumbers(validLines.map((line) => toNumber(line.demandQty))),
      unit: validLines[0]?.unit || '件',
    };
  }
  return {
    current: validLines.filter((line) => quantityFor(line) + 0.0001 >= toNumber(line.demandQty)).length,
    total: validLines.length,
    unit: '项',
  };
}

function taskBuildStatusForProducts(lines: TaskProductDraftLine[], taskCode = taskDraft.value.code) {
  const validLines = lines.filter((line) => toNumber(line.demandQty) > 0);
  if (!validLines.length) return '待建工单';
  if (validLines.every((line) => taskProductInboundQty(line, taskCode) + 0.0001 >= toNumber(line.demandQty))) return '已完成';
  const planned = validLines.map((line) => taskProductPlannedQty(line, taskCode));
  if (planned.every((value) => value <= 0)) return '待建工单';
  if (validLines.every((line, index) => planned[index] + 0.0001 >= toNumber(line.demandQty))) return '已建单';
  return '部分建单';
}

function taskLifecycleStatusForProducts(raw: AnyRecord | undefined, lines: TaskProductDraftLine[], taskCode = '') {
  const explicitStatus = text(raw?.documentStatus, '').trim();
  const legacyStatus = text(raw?.status, '').trim();
  if (/作废|取消/.test(`${explicitStatus}${legacyStatus}`)) return '已作废';
  if (/草稿/.test(`${explicitStatus}${legacyStatus}`)) return '草稿';
  const validLines = lines.filter((line) => toNumber(line.demandQty) > 0);
  if (validLines.length && validLines.every((line) => taskProductInboundQty(line, taskCode) + 0.0001 >= toNumber(line.demandQty))) return '已完成';
  if (validLines.some((line) => taskProductPlannedQty(line, taskCode) > 0 || taskProductInboundQty(line, taskCode) > 0)) return '执行中';
  return '已确认';
}

function taskBuildStatus(demandQty: unknown, plannedQty: unknown, inboundQty: unknown = 0) {
  const demand = toNumber(demandQty);
  const planned = toNumber(plannedQty);
  const inbound = toNumber(inboundQty);
  if (demand > 0 && inbound >= demand) return '已完成';
  if (demand <= 0 || planned <= 0) return '待建工单';
  if (planned < demand) return '部分建单';
  return '已建单';
}

function productionTaskDerivedStatus(task: AnyRecord) {
  const taskCode = text(task.code, '');
  const products = taskProductRowsFromRaw(task, taskCode);
  const demand = sumNumbers(products.map((product) => toNumber(product.demandQty)));
  const planned = sumNumbers(products.map((product) => taskProductPlannedQty(product, taskCode)));
  const inbound = sumNumbers(products.map((product) => taskProductInboundQty(product, taskCode)));
  return taskBuildStatus(demand, planned, inbound);
}

function formatTaskProgress(inboundQty: unknown, demandQty: unknown) {
  const demand = toNumber(demandQty);
  if (demand <= 0) return '0%';
  return `${compactNumber(Math.min(100, (toNumber(inboundQty) / demand) * 100), 1)}%`;
}

function taskProductSummary(lines: TaskProductDraftLine[]) {
  const names = lines.filter((line) => line.productCode || line.productName).map((line) => line.productName || line.productCode);
  if (!names.length) return '待填写成品明细';
  return names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 项` : names.join('、');
}

function syncTaskProductionQty() {
  const products = taskDraft.value.products;
  const firstProduct = products[0];
  taskDraft.value.productCode = firstProduct?.productCode || '';
  taskDraft.value.productName = firstProduct?.productName || '';
  taskDraft.value.unit = firstProduct?.unit || taskDraft.value.unit || '件';
  const demandTotal = sumNumbers(products.map((line) => toNumber(line.demandQty)));
  const inboundTotal = sumNumbers(products.map((line) => taskProductInboundQty(line)));
  const plannedTotal = sumNumbers(products.map((line) => taskProductPlannedQty(line)));
  taskDraft.value.demandQty = compactNumber(demandTotal, 3);
  taskDraft.value.finishedStockQty = compactNumber(inboundTotal, 3);
  taskDraft.value.productionQty = compactNumber(Math.max(0, demandTotal - plannedTotal), 3);
}

function handleTaskProductLineSelect(line: TaskProductDraftLine, option: ReferenceOption) {
  const raw = option.raw as AnyRecord;
  line.productCode = option.code || '';
  line.productName = option.name || '';
  line.unit = text(raw.uom || line.unit, '件');
  line.model = text(raw.model || raw.materialModel, line.model);
  line.spec = text(raw.spec || raw.materialSpec, line.spec);
  const activeRecipe = production2Recipes.find((recipe) => text((recipe as AnyRecord).productCode, '') === option.code && text((recipe as AnyRecord).status, '') === '启用') as AnyRecord | undefined;
  line.recipeCode = activeRecipe ? text(activeRecipe.code, '') : '';
  syncTaskProductionQty();
}

function addTaskProductLine() {
  taskDraft.value.products.push(createTaskProductLine(taskDraft.value.code || 'draft-task', taskDraft.value.products.length));
}

function removeTaskProductLine(lineId: string) {
  if (taskDraft.value.products.length <= 1) return;
  taskDraft.value.products = taskDraft.value.products.filter((line) => line.lineId !== lineId);
  syncTaskProductionQty();
}

async function loadProductionInventoryFacts() {
  const requestId = ++productionInventoryLoadRequestId;
  productionInventoryLoading.value = true;
  try {
    const rows = await listWarehouseInventory();
    if (requestId === productionInventoryLoadRequestId) productionInventoryRows.value = rows;
  } catch {
    if (requestId === productionInventoryLoadRequestId) productionInventoryRows.value = [];
  } finally {
    if (requestId === productionInventoryLoadRequestId) productionInventoryLoading.value = false;
  }
}

function liveInventorySnapshot(materialCode: string, productionIssueOnly = false) {
  const rows = productionInventoryRows.value.filter((row) => row.materialCode === materialCode);
  const hasProductionIssueProjection = rows.some((row) => typeof row.allowProductionIssue === 'boolean');
  const productionIssueRows = productionIssueOnly && hasProductionIssueProjection
    ? rows.filter((row) => row.allowProductionIssue === true && row.warehouseStatus === '启用' && !row.stocktakeFrozen)
    : rows;
  const sum = (sourceRows: WarehouseInventoryRow[], field: keyof WarehouseInventoryRow) => (
    sourceRows.reduce((total, row) => total + toNumber(row[field]), 0)
  );
  const nonIssueWarehouseRows = productionIssueOnly && hasProductionIssueProjection
    ? rows.filter((row) => row.allowProductionIssue !== true || row.warehouseStatus !== '启用')
    : [];
  const stocktakeFrozenRows = productionIssueOnly && hasProductionIssueProjection
    ? rows.filter((row) => row.allowProductionIssue === true && row.warehouseStatus === '启用' && row.stocktakeFrozen)
    : [];
  return {
    found: rows.length > 0,
    availableQty: sum(productionIssueRows, 'availableNumber'),
    reservedQty: sum(productionIssueRows, 'reservedNumber'),
    allocatedQty: sum(productionIssueRows, 'allocatedNumber'),
    frozenQty: sum(productionIssueRows, 'frozenNumber'),
    qcPendingQty: sum(productionIssueRows, 'qcHoldNumber'),
    pendingInboundQty: sum(productionIssueRows, 'pendingInboundNumber'),
    inTransitQty: sum(productionIssueRows, 'inTransitNumber'),
    nonIssueWarehouseAvailableQty: sum(nonIssueWarehouseRows, 'availableNumber'),
    stocktakeFrozenQty: sum(stocktakeFrozenRows, 'qualifiedOnHandNumber'),
    allocationSources: productionIssueRows.flatMap((row) => row.allocationSources || []),
  };
}

function materialNeedsWithLiveInventory(
  value: unknown,
  sourceDoc: string | string[] = '',
  productionIssueOnly = false,
) {
  const sourceDocs = Array.isArray(sourceDoc) ? sourceDoc.filter(Boolean) : sourceDoc ? [sourceDoc] : [];
  return toArray<AnyRecord>(value).map((item) => {
    const materialCode = text(item.materialCode, '');
    const snapshot = liveInventorySnapshot(materialCode, productionIssueOnly);
    if (!snapshot.found) return item;
    const estimatedQty = toNumber(item.estimatedQty);
    const ownAllocatedQty = sourceDocs.length
      ? snapshot.allocationSources
        .filter((source) => sourceDocs.includes(source.sourceDoc) && source.status !== '已释放')
        .reduce((total, source) => total + toNumber(source.quantityNumber), 0)
      : 0;
    const otherAllocatedQty = Math.max(0, snapshot.allocatedQty - ownAllocatedQty);
    const shortageQty = Math.max(0, estimatedQty - ownAllocatedQty - snapshot.availableQty);
    const pendingCoverageQty = snapshot.pendingInboundQty + snapshot.qcPendingQty + snapshot.inTransitQty;
    const procurementGapQty = Math.max(0, shortageQty - pendingCoverageQty);
    const status = ownAllocatedQty >= estimatedQty
      ? '已分配'
      : shortageQty <= 0
        ? '可齐套'
        : productionIssueOnly && snapshot.stocktakeFrozenQty > 0
          ? '等待盘点完成'
          : productionIssueOnly && snapshot.nonIssueWarehouseAvailableQty >= shortageQty
            ? '待调拨到生产领料仓'
        : procurementGapQty > 0
          ? '需采购'
          : snapshot.pendingInboundQty > 0
          ? '待仓库入库'
          : snapshot.qcPendingQty > 0
            ? '待质检放行'
            : snapshot.inTransitQty > 0
              ? '补充在途'
              : '需采购';
    return {
      ...item,
      availableQty: snapshot.availableQty,
      reservedQty: snapshot.reservedQty,
      allocatedQty: snapshot.allocatedQty,
      ownAllocatedQty,
      otherAllocatedQty,
      frozenQty: snapshot.frozenQty,
      qcPendingQty: snapshot.qcPendingQty,
      pendingInboundQty: snapshot.pendingInboundQty,
      inTransitQty: snapshot.inTransitQty,
      nonIssueWarehouseAvailableQty: snapshot.nonIssueWarehouseAvailableQty,
      stocktakeFrozenQty: snapshot.stocktakeFrozenQty,
      shortageQty,
      procurementGapQty,
      status,
    };
  });
}

function workOrderEffectiveMaterialNeeds(order: AnyRecord) {
  const storedNeeds = toArray<AnyRecord>(order.materialNeeds);
  const recipe = workOrderRecipeSnapshot(order);
  return recipe ? buildWorkOrderMaterialNeeds(order.planQty, recipe, storedNeeds) : storedNeeds;
}

function taskMaterialReadinessStatus(item: AnyRecord) {
  const status = text(item.status, '');
  if (status.includes('盘点')) return '等待盘点完成';
  if (status.includes('调拨')) return '待调拨到生产领料仓';
  if (status.includes('仓库入库')) return '待仓库入库';
  if (status.includes('在途')) return '补充在途';
  if (status.includes('采购')) return '需采购';
  if (status.includes('质检') || status.includes('待检')) return '待质检放行';
  if (toNumber(item.shortageQty) > 0) return '需采购';
  return '可齐套';
}

function taskMaterialReadinessRows(value: unknown, useLiveInventory = true, sourceDocs: string[] = []) {
  const materialNeeds = useLiveInventory ? materialNeedsWithLiveInventory(value, sourceDocs) : toArray<AnyRecord>(value);
  return materialNeeds.map((item) => {
    const unit = productionMaterialUnit(item, '件');
    const status = taskMaterialReadinessStatus(item);
    return {
      code: text(item.materialCode),
      name: text(item.materialName),
      unit,
      requiredValue: toNumber(item.estimatedQty),
      availableValue: toNumber(item.availableQty),
      lockedValue: toNumber(item.lockedQty || 0) || (
        toNumber(item.reservedQty || 0) + toNumber(item.allocatedQty || 0) + toNumber(item.frozenQty || 0)
      ),
      reservedValue: toNumber(item.reservedQty || 0),
      allocatedValue: toNumber(item.allocatedQty || 0),
      ownAllocatedValue: toNumber(item.ownAllocatedQty || 0),
      otherAllocatedValue: toNumber(item.otherAllocatedQty || 0),
      qcPendingValue: toNumber(item.qcPendingQty || item.pendingQcQty || (status === '待质检放行' ? item.shortageQty : 0)),
      pendingInboundValue: toNumber(item.pendingInboundQty || 0),
      inTransitValue: toNumber(item.inTransitQty || 0),
      shortageValue: toNumber(item.shortageQty),
      purchaseGapValue: toNumber(item.procurementGapQty ?? Math.max(
        0,
        toNumber(item.shortageQty) - toNumber(item.pendingInboundQty) - toNumber(item.qcPendingQty || item.pendingQcQty) - toNumber(item.inTransitQty),
      )),
      requiredQty: qty(item.estimatedQty, unit),
      availableQty: qty(item.availableQty, unit),
      lockedQty: qty(
        toNumber(item.lockedQty || 0) || (
          toNumber(item.reservedQty || 0) + toNumber(item.allocatedQty || 0) + toNumber(item.frozenQty || 0)
        ),
        unit,
      ),
      reservedQty: qty(item.reservedQty || 0, unit),
      allocatedQty: qty(item.allocatedQty || 0, unit),
      ownAllocatedQty: qty(item.ownAllocatedQty || 0, unit),
      otherAllocatedQty: qty(item.otherAllocatedQty || 0, unit),
      qcPendingQty: qty(item.qcPendingQty || item.pendingQcQty || (status === '待质检放行' ? item.shortageQty : 0), unit),
      pendingInboundQty: qty(item.pendingInboundQty || 0, unit),
      inTransitQty: qty(item.inTransitQty || 0, unit),
      purchaseGapQty: qty(item.procurementGapQty ?? Math.max(
        0,
        toNumber(item.shortageQty) - toNumber(item.pendingInboundQty) - toNumber(item.qcPendingQty || item.pendingQcQty) - toNumber(item.inTransitQty),
      ), unit),
      qcRequired: Boolean(item.incomingQcRequired),
      status,
    };
  });
}

function taskMaterialRequestLinesFor(materialCode: string) {
  if (!materialCode) return [];
  return taskRelatedMaterialRequests.value.flatMap((request) =>
    materialRequestLinesFromRaw((request as AnyRecord).lines, text((request as AnyRecord).code)).map((line) => ({
      ...line,
      requestCode: text((request as AnyRecord).code),
      requestStatus: text((request as AnyRecord).status),
    })),
  ).filter((line) => line.materialCode === materialCode);
}

function taskMaterialRequestedQty(line: { code: string; unit: string }) {
  const requestLines = taskMaterialRequestLinesFor(line.code);
  if (!requestLines.length) return '未申请';
  return qty(sumNumbers(requestLines.map((item) => toNumber(item.requestedQty))), line.unit);
}

function taskMaterialRequestDisplay(line: { code: string; unit: string; purchaseGapValue: number }) {
  const requestLines = taskMaterialRequestLinesFor(line.code);
  if (requestLines.length) {
    return `已申请 ${qty(sumNumbers(requestLines.map((item) => toNumber(item.requestedQty))), line.unit)}`;
  }
  return line.purchaseGapValue > 0 ? '尚未申请' : '无需申请';
}

function taskMaterialSupplementSummary(line: {
  qcPendingValue: number;
  qcPendingQty: string;
  pendingInboundValue: number;
  pendingInboundQty: string;
  inTransitValue: number;
  inTransitQty: string;
}) {
  const parts = [
    line.qcPendingValue > 0 ? `待检 ${line.qcPendingQty}` : '',
    line.pendingInboundValue > 0 ? `待入库 ${line.pendingInboundQty}` : '',
    line.inTransitValue > 0 ? `在途 ${line.inTransitQty}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || '暂无补充';
}

function draftValue(key: string) {
  return productionDraft.value[key] || '-';
}

function productionDraftValueIsMissing(value: unknown) {
  const normalized = String(value ?? '').trim();
  return !normalized || normalized === '-' || /^待(选择|填写|判断|维护|处理)/.test(normalized);
}

function taskDraftFieldIsMissing(key: keyof ProductionTaskDraft) {
  if (key === 'owner') return productionDraftValueIsMissing(taskDraft.value.owner)
    || productionDraftValueIsMissing(taskDraft.value.ownerEmployeeCode);
  return productionDraftValueIsMissing(taskDraft.value[key]);
}

function taskDraftBlockingMessage() {
  if (!taskDraft.value.products.some((line) => line.productCode)) return '请选择至少一个需要生产的成品';
  if (taskDraft.value.products.some((line) => line.productCode && toNumber(line.demandQty) <= 0)) return '请填写大于 0 的计划生产数量';
  if (taskDraftFieldIsMissing('deliveryDate')) return '请填写交付日期';
  if (taskDraftFieldIsMissing('owner')) return '请填写负责人';
  return '';
}

function taskDraftFieldClass(key: keyof ProductionTaskDraft) {
  if (!productionValidationAttempted.value || !taskIsEditable.value) return '';
  if (key === 'sourceCode' && taskDraft.value.sourceType === '销售订单缺口' && taskDraftFieldIsMissing(key)) return 'has-field-error';
  if (key === 'productCode' && taskDraftFieldIsMissing(key)) return 'has-field-error';
  if (key === 'demandQty' && toNumber(taskDraft.value.demandQty) <= 0) return 'has-field-error';
  if (key === 'productionQty' && toNumber(taskDraft.value.productionQty) <= 0) return 'has-field-error';
  if ((key === 'deliveryDate' || key === 'owner') && taskDraftFieldIsMissing(key)) return 'has-field-error';
  return '';
}

function taskProductLineFieldClass(line: TaskProductDraftLine, key: 'productCode' | 'demandQty') {
  if (!productionValidationAttempted.value || !taskIsEditable.value) return '';
  if (key === 'productCode' && !line.productCode) return 'has-field-error';
  if (key === 'demandQty' && line.productCode && toNumber(line.demandQty) <= 0) return 'has-field-error';
  return '';
}

function validateTaskDraft() {
  productionValidationAttempted.value = true;
  const message = taskDraftBlockingMessage();
  if (!message) return true;
  showToast(message, 'error');
  void nextTick(() => {
    const target = document.querySelector('.production-task-basic-section .has-field-error, .production-task-product-section .has-field-error') as HTMLElement | null;
    const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(target);
    focusTarget?.focus();
  });
  return false;
}

function productionRequiredFieldClass(fact: DetailFact) {
  const key = fact.key || fact.label;
  const isRequired = isProductionEditableDocument.value && productionRequiredFieldKeys.value.includes(key);
  return {
    'is-required-field': isRequired,
    'has-field-error': isRequired && productionValidationAttempted.value && productionDraftValueIsMissing(productionDraft.value[key]),
  };
}

function scrollToFirstProductionMissingField() {
  const key = productionMissingRequiredFields.value[0]?.key;
  if (!key) return;

  void nextTick(() => {
    const target = document.querySelector(`[data-required-field="${key}"]`) as HTMLElement | null;
    const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(target);
    focusTarget?.focus();
  });
}

function validateProductionDraft() {
  productionValidationAttempted.value = true;
  if (activePage.value === 'tasks' && !validateTaskDraft()) return false;
  if (activePage.value === 'material-requests' && !validateMaterialRequestDraft()) return false;
  if (activePage.value === 'work-orders' && !validateWorkOrderDraft()) return false;
  if (activePage.value === 'recipes' && !validateRecipeDraft()) return false;
  if (activePage.value === 'process-templates' && !validateProcessTemplateDraft()) return false;
  if (activePage.value === 'process-steps' && !validateProcessStepDraft()) return false;
  if (!productionMissingRequiredFields.value.length) return true;

  showToast(productionMissingRequiredSummary.value, 'error');
  scrollToFirstProductionMissingField();
  return false;
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function text(value: unknown, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function toNumber(value: unknown) {
  const number = Number(String(value ?? '').replace('%', ''));
  return Number.isFinite(number) ? number : 0;
}

function numberText(value: unknown) {
  return compactNumber(toNumber(value), 3);
}

function qty(value: unknown, unit: unknown) {
  return `${numberText(value)}${text(unit, '件')}`;
}

function sumNumbers(values: number[]) {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function roundNumber(value: number, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compactNumber(value: number, decimals = 3) {
  const rounded = roundNumber(value, decimals);
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function editableNumberText(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') return compactNumber(fallback);
  const number = toNumber(value);
  return Number.isFinite(number) ? compactNumber(number) : compactNumber(fallback);
}

function formatKg(value: unknown) {
  return compactNumber(toNumber(value), 3);
}

function formatPercent(value: unknown) {
  return `${compactNumber(toNumber(value), 2)}%`;
}

function formatRecipeQuantity(value: unknown, unit: unknown) {
  const unitText = text(unit, '');
  const quantityText = compactNumber(toNumber(value), 3);
  return unitText && unitText !== '-' ? `${quantityText} ${unitText}` : quantityText;
}

function recipeLineUsageMode(line: { usageMode?: unknown; consumptionMode?: unknown; quantityMode?: unknown }): RecipeUsageMode {
  return text(line.usageMode || line.consumptionMode || line.quantityMode, 'percent') === 'fixed' ? 'fixed' : 'percent';
}

function recipeUsageModeLabel(value: unknown) {
  return recipeMaterialUsageMode(value) === 'fixed' ? '固定用量' : '投料占比';
}

function recipeMaterialUsageMode(item: unknown): RecipeUsageMode {
  const raw = item as AnyRecord;
  const mode = text(raw.usageMode || raw.consumptionMode || raw.quantityMode, 'percent');
  return mode === 'fixed' || mode === '固定用量' ? 'fixed' : 'percent';
}

function recipeMaterialPerUnitQty(item: AnyRecord) {
  return toNumber(item.perUnitQty ?? item.fixedQty ?? item.quantityPerUnit ?? item.qtyPerUnit);
}

function recipeMaterialPercent(item: AnyRecord) {
  return toNumber(item.percent ?? item.materialPercent ?? item.percentage ?? item.ratio);
}

function recipeMaterialFixedLossQty(item: AnyRecord) {
  return toNumber(item.fixedLossQty ?? item.fixedLossKg ?? item.fixedLoss ?? item.lossQty ?? item.lossKg);
}

function recipeMaterialLossRatePercent(item: AnyRecord) {
  return toNumber(item.lossRatePercent ?? item.lossPercent ?? item.lossRate);
}

function recipeBaseKgForPercent(unitWeightKg: unknown, percent: unknown) {
  return (toNumber(unitWeightKg) * toNumber(percent)) / 100;
}

function recipeMaterialBaseKg(item: AnyRecord, unitWeightKg: unknown) {
  return recipeBaseKgForPercent(unitWeightKg, recipeMaterialPercent(item));
}

function recipeMaterialPercentTotal(value: unknown) {
  return sumNumbers(toArray<AnyRecord>(value).filter((item) => recipeMaterialUsageMode(item) === 'percent').map((item) => recipeMaterialPercent(item)));
}

function recipePercentHint(value: unknown) {
  const materials = toArray<AnyRecord>(value);
  const percentRows = materials.filter((item) => recipeMaterialUsageMode(item) === 'percent');
  const fixedRows = materials.length - percentRows.length;
  const total = recipeMaterialPercentTotal(value);
  if (!percentRows.length) return `固定用量 ${fixedRows} 项`;
  const percentText = `投料占比 ${formatPercent(total)}`;
  return fixedRows ? `${percentText} · 固定用量 ${fixedRows} 项` : percentText;
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function statusTone(status: string) {
  if (/异常|不合格|停用|作废|取消|缺料|退货|报废|失败|冻结/.test(status)) return 'pending';
  if (/待|部分|草稿|处理中|生产中|检验中|未/.test(status)) return 'tracking';
  if (/启用|合格|完成|关闭|入库|齐套|通过|签收|已确认/.test(status)) return 'done';
  return 'tracking';
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function productionDisplayTerm(value: unknown) {
  const status = text(value, '');
  const exact: Record<string, string> = {
    待释放: '待安排',
    部分释放: '部分安排',
    已释放: '已安排',
    未释放: '未安排',
    可齐套: '物料齐备',
    待齐套: '待备齐',
    已齐套: '已备齐',
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
    .replace(/确认确认/g, '确认')
    .replace(/回写/g, '同步')
    .replace(/闭环/g, '处理完成');
}

function productionActorLabel(value: unknown, fallback = '系统') {
  const actor = text(value, '').trim();
  return !actor || /^[?？]+$/.test(actor) ? fallback : actor;
}

function listProgressRatio(done: unknown, total: unknown, unit: unknown) {
  const suffix = text(unit, '件');
  return `${compactNumber(toNumber(done), 3)}/${compactNumber(toNumber(total), 3)}${suffix}`;
}

function executionCardListAttention(raw: AnyRecord) {
  const code = text(raw.code, '');
  const activeQualityDisposition = qualityTasksForExecutionCard(code)
    .find((task) => productionQualityTaskNeedsDisposition(task as unknown as AnyRecord));
  if (activeQualityDisposition) return productionQualityHandoffLabel(activeQualityDisposition as unknown as AnyRecord);
  if (activeProductionExceptionForExecutionCard(code)) return '生产异常待处理';
  if (executionCardLifecycleStatusFromRaw(raw) === '已完成') return '无待办';
  if (executionCardShortCloseNeedsResolution(raw)) return '处理剩余数量';

  const pendingQualityTask = qualityTasksForExecutionCard(code)
    .find((task) => productionQualityTaskIsPending(task as unknown as AnyRecord));
  if (pendingQualityTask) return productionQualityHandoffLabel(pendingQualityTask as unknown as AnyRecord);

  const fallbackQualityHandoff = executionCardQualityHandoffFromRaw(raw);
  if (fallbackQualityHandoff) return fallbackQualityHandoff;

  const operationJob = executionCardCurrentOperationJob(raw);
  if (operationJob && ['可开工', '队列中', '待开工'].includes(operationJob.status)) {
    return `${operationJob.operationType.replace(/生产$/, '')}任务待开工`;
  }
  if (operationJob?.status === '执行中') return `继续${operationJob.operationType.replace(/生产$/, '')}作业`;
  if (operationJob?.status === '暂停') return `恢复${operationJob.operationType.replace(/生产$/, '')}作业`;
  if (operationJob?.status === '异常') return `${operationJob.operationType.replace(/生产$/, '')}异常待处理`;

  const chain = executionCardQuantityChain(raw);
  if (chain.pendingPackagingQty > 0 || /待包装|包装确认/.test(text(raw.node, ''))) return '记录包装';
  if (pendingProductionReceiptCode(code) || chain.pendingInboundQty > 0 || /待入库|完工入库/.test(text(raw.node, ''))) {
    return '等待仓库入库';
  }
  if (chain.pendingInboundInspectionQty > 0 || /待抽检|入库检/.test(`${text(raw.node, '')}${text(raw.status, '')}`)) {
    return '等待入库检';
  }

  const release = releaseBatchForExecutionCard(code);
  if (release?.releaseStatus === '已释放' && release.materialStatus !== '已领料') return '等待仓库领料';
  return executionCardCurrentStageName(raw) || productionDisplayTerm(text(raw.nextAction, '继续现场执行'));
}

function productionListStatusOverview(row: ProductionListRow): ProductionListStatusOverview {
  const raw = row.raw;
  if (row.page === 'tasks') {
    const taskCode = text(raw.code, row.code);
    const products = taskProductRowsFromRaw(raw, taskCode);
    const planned = taskProductProgressMetric(products, (item) => taskProductPlannedQty(item, taskCode));
    const released = taskProductProgressMetric(products, (item) => taskProductReleasedQty(item, taskCode));
    const inbound = taskProductProgressMetric(products, (item) => taskProductInboundQty(item, taskCode));
    const materialStatus = materialTaskListTitle(raw.materialNeeds, taskCode);
    return {
      attention: productionTaskDueAttention(raw) || row.nextStep,
      facts: [
        { label: '工单', value: listProgressRatio(planned.current, planned.total, planned.unit) },
        { label: '安排', value: listProgressRatio(released.current, released.total, released.unit) },
        { label: '入库', value: listProgressRatio(inbound.current, inbound.total, inbound.unit) },
        { label: '物料', value: materialStatus },
      ],
    };
  }

  if (row.page === 'work-orders') {
    const planQty = toNumber(raw.planQty);
    const unit = text(raw.unit, '件');
    const release = workOrderReleaseFacts(raw);
    const chain = workOrderQuantityChain(raw.code, planQty);
    const activeCardAttentions = [...new Set(
      workOrderExecutionCards(raw.code)
        .filter((card) => executionCardStageLabel(card as unknown as AnyRecord) !== '已完成')
        .map((card) => executionCardListAttention(card as unknown as AnyRecord))
        .filter((label) => label && label !== '无待办'),
    )];
    let attention = row.nextStep;
    const activeQualityDisposition = production2QualityTasks.find(
      (task) => task.workOrderCode === row.code
        && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
    );
    const activeException = activeQualityDisposition ? undefined : activeProductionExceptionForWorkOrder(row.code);
    if (row.status === '已关闭') attention = '已归档';
    else if (activeQualityDisposition) attention = '质量异常待处置';
    else if (activeException) attention = '生产异常待处理';
    else if (planQty > 0 && chain.inboundQty >= planQty) attention = '完工待关闭';
    else if (activeCardAttentions.length > 1) attention = '多批次待办';
    else if (activeCardAttentions[0]) attention = activeCardAttentions[0];
    else if (release.unreleasedQty > 0 && release.releasableQty <= 0) attention = '物料未备齐';
    else if (release.unreleasedQty > 0) attention = '待安排';
    return {
      attention,
      facts: [
        { label: '安排', value: listProgressRatio(release.releasedQty, planQty, unit) },
        { label: '生产', value: listProgressRatio(chain.reportedQty, planQty, unit) },
        { label: '入库', value: listProgressRatio(chain.inboundQty, planQty, unit) },
      ],
    };
  }

  const release = releaseBatchForExecutionCard(raw.code);
  const planQty = toNumber(release?.releasedQty ?? raw.planQty);
  const unit = text(release?.unit || raw.unit, '件');
  const chain = executionCardQuantityChain(raw);
  return {
    attention: executionCardListAttention(raw),
    progress: {
      label: '完工入库',
      current: chain.inboundQty,
      total: planQty,
      unit,
    },
    facts: [
      { label: '物料', value: executionCardMaterialDisplayStatus(raw) },
      { label: '报工', value: listProgressRatio(chain.reportedQty, planQty, unit) },
      { label: '质检', value: executionCardQualityStageLabel(raw) },
      {
        label: '包装',
        value: chain.qualifiedQty > 0
          ? listProgressRatio(chain.packedQty, chain.qualifiedQty, unit)
          : executionCardPackagingStatus(raw),
      },
    ],
  };
}

function productionFilterStatus(row: ProductionListRow) {
  return row.page === 'work-orders' ? productionListStatusOverview(row).attention : row.status;
}

function shanghaiBusinessDateText() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function productionDateDayNumber(value: unknown) {
  const match = text(value, '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

function productionTaskDueAttention(raw: AnyRecord | undefined) {
  if (!raw) return '';
  const taskCode = text(raw.code, '');
  const products = taskProductRowsFromRaw(raw, taskCode);
  const lifecycle = taskLifecycleStatusForProducts(raw, products, taskCode);
  if (lifecycle === '已完成' || lifecycle === '已作废') return '';
  const dueDate = text(raw.deliveryDate || raw.dueDate || raw.date, '').slice(0, 10);
  const dueDay = productionDateDayNumber(dueDate);
  const todayDay = productionDateDayNumber(shanghaiBusinessDateText());
  if (!Number.isFinite(dueDay) || !Number.isFinite(todayDay)) return '';
  const daysUntil = Math.round(dueDay - todayDay);
  if (daysUntil < 0) return `逾期 ${Math.abs(daysUntil)} 天`;
  if (daysUntil === 0) return '今日到期';
  if (daysUntil <= 3) return `${daysUntil} 天后到期`;
  return '';
}

function workOrderRequirementDates(raw: AnyRecord | undefined) {
  if (!raw) return [];
  return [...new Set(
    workOrderSourceAllocationsFromRaw(
      raw,
      text(raw.taskCode || raw.sourceTask, ''),
      text(raw.sourceLineId, ''),
    )
      .map((allocation) => text(allocation.dueDate, '').slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
  )].sort();
}

function workOrderRequirementDateSummary(raw: AnyRecord | undefined) {
  const dates = workOrderRequirementDates(raw);
  if (!dates.length) return '待补齐任务需求';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} 至 ${dates[dates.length - 1]} · ${dates.length} 个日期`;
}

function workOrderDueAttention(raw: AnyRecord | undefined) {
  if (!raw) return '';
  const lifecycle = workOrderLifecycleStatusFromRaw(raw);
  if (/已关闭|已作废/.test(lifecycle)) return '';
  const dueDay = productionDateDayNumber(workOrderRequirementDates(raw)[0] || '');
  const todayDay = productionDateDayNumber(shanghaiBusinessDateText());
  if (!Number.isFinite(dueDay) || !Number.isFinite(todayDay)) return '';
  const daysUntil = Math.round(dueDay - todayDay);
  if (daysUntil < 0) return `逾期 ${Math.abs(daysUntil)} 天`;
  if (daysUntil === 0) return '今日到期';
  if (daysUntil <= 3) return `${daysUntil} 天后到期`;
  return '';
}

function executionCardScheduleAttention(raw: AnyRecord | undefined) {
  if (!raw) return '';
  const lifecycle = executionCardLifecycleStatusFromRaw(raw);
  if (/已完成|已关闭|已作废/.test(lifecycle)) return '';
  const workOrder = production2WorkOrders.find((item) => item.code === text(raw.workOrderCode));
  const plannedDate = text(raw.plannedDate || workOrder?.plannedDate || raw.createdAt || raw.date, '').slice(0, 10);
  const plannedDay = productionDateDayNumber(plannedDate);
  const todayDay = productionDateDayNumber(shanghaiBusinessDateText());
  if (!Number.isFinite(plannedDay) || !Number.isFinite(todayDay)) return '';
  const daysUntil = Math.round(plannedDay - todayDay);
  if (daysUntil < 0) return `超计划 ${Math.abs(daysUntil)} 天`;
  if (daysUntil === 0) return '今日计划';
  if (daysUntil <= 3) return `${daysUntil} 天后计划`;
  return '';
}

function productionTaskOperationalSort(left: ProductionListRow, right: ProductionListRow) {
  const closedRank = (row: ProductionListRow) => /已完成|已作废/.test(row.status) ? 1 : 0;
  const lifecycleRank = (row: ProductionListRow) => {
    if (row.status === '已确认') return 0;
    if (row.status === '草稿') return 1;
    if (row.status === '执行中') return 2;
    return 3;
  };
  const leftClosed = closedRank(left);
  const rightClosed = closedRank(right);
  if (leftClosed !== rightClosed) return leftClosed - rightClosed;
  if (leftClosed && rightClosed) return right.date.localeCompare(left.date) || right.code.localeCompare(left.code);

  const leftDue = /^\d{4}-\d{2}-\d{2}$/.test(left.date) ? left.date : '9999-12-31';
  const rightDue = /^\d{4}-\d{2}-\d{2}$/.test(right.date) ? right.date : '9999-12-31';
  const dueDifference = leftDue.localeCompare(rightDue);
  if (dueDifference) return dueDifference;

  const priorityDifference = (text(left.raw.priority, '') === '加急' ? 0 : 1)
    - (text(right.raw.priority, '') === '加急' ? 0 : 1);
  return priorityDifference
    || lifecycleRank(left) - lifecycleRank(right)
    || left.code.localeCompare(right.code);
}

function workOrderOperationalSort(left: ProductionListRow, right: ProductionListRow) {
  const rank = (row: ProductionListRow) => {
    const attention = productionListStatusOverview(row).attention;
    if (/质量异常|生产异常|异常待/.test(attention)) return 0;
    if (/待安排/.test(attention)) return 1;
    if (/待包装|生产中|待开工|待领料/.test(attention)) return 2;
    if (/待质检|多批次/.test(attention)) return 3;
    if (/待仓库|待入库/.test(attention)) return 4;
    if (/物料未备齐|等待采购/.test(attention)) return 5;
    if (/完工待关闭/.test(attention)) return 6;
    if (/已归档|已关闭/.test(attention)) return 8;
    return 7;
  };
  const rankDifference = rank(left) - rank(right);
  if (rankDifference) return rankDifference;
  const leftDue = /^\d{4}-\d{2}-\d{2}$/.test(left.date) ? left.date : '9999-12-31';
  const rightDue = /^\d{4}-\d{2}-\d{2}$/.test(right.date) ? right.date : '9999-12-31';
  return leftDue.localeCompare(rightDue) || left.code.localeCompare(right.code);
}

function executionCardOperationalSort(left: ProductionListRow, right: ProductionListRow) {
  const rank = (row: ProductionListRow) => {
    const raw = row.raw;
    const lifecycle = executionCardLifecycleStatusFromRaw(raw);
    if (/已完成|已关闭|已作废/.test(lifecycle)) return 8;
    if (executionCardShortCloseNeedsResolution(raw)) return 0;
    const stage = executionCardStageLabel(raw);
    if (stage === '异常/返工') return 0;
    if (['待开工', '生产中', '待包装'].includes(stage)) return 1;
    if (stage === '待质检') return 2;
    if (stage === '待仓库') return 3;
    if (stage === '待领料') return 4;
    return 5;
  };
  const rankDifference = rank(left) - rank(right);
  if (rankDifference) return rankDifference;
  const leftPlan = /^\d{4}-\d{2}-\d{2}$/.test(left.date) ? left.date : '9999-12-31';
  const rightPlan = /^\d{4}-\d{2}-\d{2}$/.test(right.date) ? right.date : '9999-12-31';
  return leftPlan.localeCompare(rightPlan) || left.code.localeCompare(right.code);
}

function statusWeight(status: string) {
  if (/异常|不合格|缺/.test(status)) return 0;
  if (/待|草稿/.test(status)) return 1;
  if (/部分|生产中|处理中|检验中/.test(status)) return 2;
  if (/启用|已|完成|合格|关闭/.test(status)) return 4;
  return 3;
}

function productionExceptionOperationalSort(left: ProductionListRow, right: ProductionListRow) {
  const isClosed = (row: ProductionListRow) => text(row.status) === '已关闭' ? 1 : 0;
  const closedDifference = isClosed(left) - isClosed(right);
  if (closedDifference) return closedDifference;

  const levelRank = (row: ProductionListRow) => ({ 紧急: 0, 重大: 1, 一般: 2 }[text(row.raw.level)] ?? 3);
  const levelDifference = levelRank(left) - levelRank(right);
  if (levelDifference) return levelDifference;

  const stageRank = (row: ProductionListRow) => ({ 待处理: 0, 处理中: 1, 待复核: 2, 已关闭: 3 }[text(row.status)] ?? 4);
  return stageRank(left) - stageRank(right)
    || right.date.localeCompare(left.date)
    || left.code.localeCompare(right.code);
}

function cellClass(index: number) {
  if (activePage.value === 'loss-ledger') {
    if (index === 0) return 'quote-code loss-code-cell';
    if (index === 2) return 'loss-product-cell';
    if (index === 3) return 'amount-cell amount-stack';
    if (index === 4) return 'product-summary loss-disposition-cell';
    return 'product-summary';
  }
  if (activePage.value === 'material-requests') {
    if (index === 0) return 'quote-code production-material-request-code-cell';
    if (index === 2) return 'product-summary production-material-request-demand-cell';
    if (index === 3) return 'product-summary production-material-request-fulfillment-cell';
    return 'product-summary';
  }
  if (activePage.value === 'execution-cards') {
    if (index === 0) return 'quote-code production-execution-card-code-cell';
    if (index === 2) return 'date-stack production-execution-card-plan-cell';
    return 'product-summary';
  }
  if (activePage.value === 'exceptions') {
    if (index === 0) return 'quote-code production-exception-code-cell';
    if (index === 2) return 'date-stack production-exception-impact-cell';
    if (index === 4) return 'product-summary production-exception-disposition-cell';
    return 'product-summary';
  }
  if (activePage.value === 'recipes') {
    if (index === 0) return 'quote-code';
    return index === 2 ? 'date-stack' : 'product-summary';
  }
  if (activePage.value === 'tasks') {
    if (index === 0) return 'quote-code production-task-code-cell';
    return 'product-summary';
  }
  if (activePage.value === 'work-orders') {
    if (index === 0) return 'quote-code production-work-order-code-cell';
    if (index === 2) return 'date-stack';
    if (index === 3) return 'product-summary production-work-order-rule-cell';
    return 'product-summary';
  }
  if (activePage.value === 'process-templates') {
    if (index === 0) return 'quote-code';
    return 'product-summary';
  }
  if (activePage.value === 'process-steps') {
    if (index === 0) return 'quote-code system-action-identity-cell';
    if (index === 1) return 'product-summary system-action-owner-cell';
    if (index === 2) return 'product-summary system-action-trigger-cell';
    return 'product-summary system-action-result-cell';
  }
  if (index === 0) return 'quote-code';
  if (index === 3) return 'amount-cell amount-stack';
  if (index === 5) return 'attachment-cell';
  return index === 2 ? 'date-stack' : 'product-summary';
}

function rowRoute(row: ProductionListRow) {
  return `/production/${row.page}/${encodeURIComponent(row.code)}`;
}

function compactProductionActionLabel(row: ProductionListRow) {
  if (isProductionRuleDocument.value) return row.status === '草稿' ? '启用' : '复核';

  const nextStep = row.nextStep || '';
  if (row.page === 'material-requests') {
    if (nextStep.includes('采购')) return '跟进采购';
    if (nextStep.includes('库存') || nextStep.includes('仓库')) return '查看评估';
    if (nextStep.includes('提交')) return '提交';
    return '跟进';
  }
  if (row.page === 'tasks') {
    if (nextStep.includes('跟踪')) return '查看工单';
    if (nextStep.includes('归档')) return '查看结果';
    if (nextStep.includes('创建') || nextStep.includes('剩余')) return '建工单';
    return '推进';
  }
  if (row.page === 'work-orders') {
    if (nextStep.includes('确认')) return '确认';
    if (nextStep.includes('释放') || nextStep.includes('安排')) return '安排';
    if (nextStep.includes('抽检') || nextStep.includes('质检')) return '查看质检';
    if (nextStep.includes('入库')) return '办理入库';
    if (nextStep.includes('归档')) return '归档';
    return '跟进';
  }
  if (row.page === 'execution-cards') {
    if (nextStep.includes('领料')) return '领料';
    if (nextStep.includes('复绕')) return '去现场';
    if (nextStep.includes('首') || nextStep.includes('开机检')) return '开机检';
    if (nextStep.includes('报工')) return '报工';
    if (nextStep.includes('过程')) return '过程检';
    if (nextStep.includes('打包')) return '打包';
    if (nextStep.includes('抽检')) return '抽检';
    if (nextStep.includes('入库')) return '入库';
    return '推进';
  }
  if (row.page === 'quality') {
    if (nextStep.includes('检')) return '检验';
    if (nextStep.includes('处置')) return '处置';
    return '推进';
  }
  if (row.page === 'loss-ledger') {
    if (nextStep.includes('复核')) return '复核';
    if (nextStep.includes('确认')) return '确认';
    if (nextStep.includes('关闭')) return '关闭';
    if (nextStep.includes('返工')) return '返工';
    return '处置';
  }
  if (row.page === 'exceptions') {
    if (nextStep.includes('复核')) return '复核';
    if (nextStep.includes('关闭')) return '关闭';
    return '处置';
  }
  return row.nextStep && row.nextStep.length <= 4 ? row.nextStep : '维护';
}

function materialProducibleQty(value: unknown, taskQty: unknown, productionIssueOnly = false) {
  const needs = materialNeedsWithLiveInventory(value, '', productionIssueOnly);
  const demand = toNumber(taskQty);
  if (!needs.length || demand <= 0) return 0;
  const capacities = needs
    .map((item) => {
      const estimatedQty = toNumber(item.estimatedQty);
      if (estimatedQty <= 0) return demand;
      const perTaskUnit = estimatedQty / demand;
      if (perTaskUnit <= 0) return demand;
      return Math.floor(toNumber(item.availableQty) / perTaskUnit);
    })
    .filter((value) => Number.isFinite(value));
  if (!capacities.length) return 0;
  return Math.max(0, Math.min(demand, ...capacities));
}

function materialTaskReadinessTitle(
  value: unknown,
  taskQty: unknown,
  sourceDoc: string | string[] = '',
  productionIssueOnly = false,
) {
  const needs = materialNeedsWithLiveInventory(value, sourceDoc, productionIssueOnly);
  if (!needs.length) return '待计算';
  const statuses = needs.map((item) => taskMaterialReadinessStatus(item));
  if (statuses.every((status) => status === '可齐套')) return '物料齐备';
  if (materialProducibleQty(value, taskQty, productionIssueOnly) > 0) return '部分可生产';
  if (statuses.includes('等待盘点完成')) return '等待盘点完成';
  if (statuses.includes('待调拨到生产领料仓')) return '待调拨到生产领料仓';
  if (statuses.includes('需采购')) return '缺料';
  if (statuses.includes('待仓库入库')) return '待仓库入库';
  if (statuses.includes('待质检放行')) return '待质检放行';
  if (statuses.includes('补充在途')) return '补充在途';
  return '待备齐';
}

function materialTaskListTitle(value: unknown, taskCode = '') {
  const workOrderCodes = production2WorkOrders
    .filter((order) => workOrderSourceAllocationsFromRaw(order as unknown as AnyRecord, text(order.taskCode, ''), text((order as unknown as AnyRecord).sourceLineId, '')).some((allocation) => allocation.taskCode === taskCode))
    .map((order) => text(order.code, ''))
    .filter(Boolean);
  const task = production2Tasks.find((item) => text(item.code, '') === taskCode) as unknown as AnyRecord | undefined;
  const taskProducts = task ? taskProductRowsFromRaw(task, taskCode) : [];
  if (taskReleaseIsCompleteForProducts(taskProducts, taskCode)) return '已完成生产安排';
  if (productionTaskMaterialPlanningBlockers(task).length) {
    return toArray<AnyRecord>(value).length ? '部分待配置配方' : '待配置配方';
  }
  const needs = materialNeedsWithLiveInventory(value, workOrderCodes);
  if (!needs.length) return '待计算';
  const statuses = needs.map((item) => taskMaterialReadinessStatus(item));
  const count = (status: string) => statuses.filter((item) => item === status).length;
  const parts = [
    [count('需采购'), '项缺口'],
    [count('待质检放行'), '项待检'],
    [count('待仓库入库'), '项待入库'],
    [count('补充在途'), '项在途'],
    [count('可齐套'), '项已备齐'],
  ]
    .filter(([total]) => Number(total) > 0)
    .map(([total, label]) => `${total}${label}`);
  return parts.join(' · ') || '待计算';
}

function materialTaskReadinessLabel(
  value: unknown,
  taskQty: unknown,
  unit: unknown,
  sourceDoc: string | string[] = '',
  completedRelease = false,
) {
  if (completedRelease) return '已完成生产安排';
  const title = materialTaskReadinessTitle(value, taskQty, sourceDoc);
  if (title === '部分可生产') return `${title} ${qty(materialProducibleQty(value, taskQty), unit)}`;
  return title;
}

function taskMaterialOverallStatus(rows: Array<{ status: string }>, completedRelease = false) {
  if (completedRelease) return '已完成生产安排';
  if (!rows.length) return '待计算';
  const statuses = rows.map((row) => row.status);
  if (statuses.every((status) => status === '可齐套')) return '物料齐备';
  if (statuses.includes('需采购')) return '缺料';
  if (statuses.includes('待质检放行')) return '待质检放行';
  if (statuses.includes('待仓库入库')) return '待仓库入库';
  if (statuses.includes('补充在途')) return '补充在途';
  return '待备齐';
}

function workOrderStoredSnapshot(order: AnyRecord) {
  if (!order.snapshot || typeof order.snapshot !== 'object' || Array.isArray(order.snapshot)) return undefined;
  return order.snapshot as AnyRecord;
}

function workOrderSnapshotRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as AnyRecord;
}

function workOrderSnapshotSourceLabel(order: AnyRecord) {
  const snapshot = workOrderStoredSnapshot(order);
  if (!snapshot) return '当前选用版本';
  if (text(snapshot.snapshotStatus, '') === 'server_frozen') return '工单确认版本';
  return text(snapshot.snapshotStatus, '') === 'version_binding_only' ? '工单版本（仅绑定版本）' : '工单版本';
}

function workOrderRecipeSnapshot(order: AnyRecord) {
  const snapshot = workOrderStoredSnapshot(order);
  if (snapshot) {
    return workOrderSnapshotRecord(snapshot.recipe || snapshot.recipeSnapshot)
      || (snapshot.recipeVersionId ? { code: snapshot.recipeVersionId } : undefined);
  }
  const recipeCode = text(order.recipeCode, '');
  return production2Recipes.find((recipe) => text(recipe.code, '') === recipeCode) as AnyRecord | undefined;
}

function workOrderProcessSnapshot(order: AnyRecord) {
  const snapshot = workOrderStoredSnapshot(order);
  if (snapshot) {
    return workOrderSnapshotRecord(snapshot.processTemplate || snapshot.processTemplateSnapshot)
      || (snapshot.processVersionId ? { code: snapshot.processVersionId } : undefined);
  }
  const templateCode = text(order.processTemplateCode, '');
  return production2ProcessTemplates.find((template) => text(template.code, '') === templateCode) as AnyRecord | undefined;
}

function buildWorkOrderRecipeSnapshotRows(order: AnyRecord, recipe: AnyRecord): WorkOrderRecipeSnapshotRow[] {
  const unitWeightKg = recipe.productUnitWeightKg ?? order.productUnitWeightKg;
  const planQty = toNumber(order.planQty || order.qty);
  const losses = toArray<AnyRecord>(recipe.estimatedLosses);
  return toArray<AnyRecord>(recipe.materials).map((material) => {
    const usageMode = recipeMaterialUsageMode(material);
    const unit = usageMode === 'percent' ? 'kg' : text(material.unit, '件');
    const perUnitQty = usageMode === 'percent'
      ? recipeMaterialBaseKg(material, unitWeightKg)
      : recipeMaterialPerUnitQty(material);
    const plannedNet = perUnitQty * planQty;
    const loss = losses.find((item) => text(item.materialCode, '') === text(material.materialCode, ''));
    const fixedLossQty = recipeMaterialFixedLossQty(loss || {});
    const lossRatePercent = recipeMaterialLossRatePercent(loss || {});
    const plannedWithLoss = plannedNet + fixedLossQty + (plannedNet * lossRatePercent) / 100;
    const identity = productionMaterialIdentityDetails(material);
    return {
      code: identity.code,
      name: identity.name,
      model: identity.model,
      spec: identity.spec,
      imageUrl: identity.imageUrl,
      imageLabel: identity.imageLabel,
      imageTone: identity.imageTone,
      unit,
      basis: usageMode === 'percent'
        ? `投料占比 ${formatPercent(recipeMaterialPercent(material))}`
        : '固定用量',
      perUnit: `${formatRecipeQuantity(perUnitQty, unit)}/${text(recipe.outputUnit, text(order.unit, '件'))}`,
      plannedNet: formatRecipeQuantity(plannedNet, unit),
      plannedWithLoss: formatRecipeQuantity(plannedWithLoss, unit),
      plannedNetValue: plannedNet,
      plannedWithLossValue: plannedWithLoss,
    };
  });
}

function workOrderProcessZones(template: AnyRecord | undefined) {
  const sourceZones = toArray<AnyRecord>(template?.temperatureZones);
  const sourceByName = new Map(sourceZones.map((zone) => [text(zone.name, ''), zone]));
  return defaultProcessTemplateZones().map((defaultZone) => {
    const source = sourceByName.get(defaultZone.name);
    return {
      name: defaultZone.name,
      value: processTemplateTemperatureDisplay(source?.value),
      tolerance: text(source?.tolerance, text(template?.temperatureTolerance, '-')),
    };
  });
}

function workOrderProcessGuidance(value: unknown, fallback: string) {
  const guidance = text(value, '').trim();
  if (!guidance || /生产确认领料烘干|领料烘干确认|仓库完成发料.*生产确认领料/.test(guidance)) return fallback;
  return guidance;
}

function workOrderSnapshotActionCodes(frozenStep: AnyRecord, liveStep: AnyRecord | undefined) {
  const frozenCodes = toArray<string>(frozenStep.actionCodes)
    .filter((actionCode) => production2SystemActions.some((action) => action.code === actionCode));
  return frozenCodes.length ? frozenCodes : toArray<string>(liveStep?.actionCodes);
}

function workOrderSnapshotStepOwner(code: string, frozenStep: AnyRecord, liveStep: AnyRecord | undefined) {
  const frozenOwner = text(frozenStep.owner, '');
  if (code === 'P2-STEP-MATERIAL-ISSUE' && /生产/.test(frozenOwner)) return text(liveStep?.owner, '仓库');
  return text(frozenOwner, text(liveStep?.owner, '-'));
}

function workOrderSnapshotStepExecutionMode(frozenStep: AnyRecord, liveStep: AnyRecord | undefined) {
  const frozenMode = text(frozenStep.executionMode, '');
  return frozenMode === '系统动作' ? text(liveStep?.executionMode, '生产动作') : text(frozenMode, text(liveStep?.executionMode, '-'));
}

function buildWorkOrderProcessSnapshotSteps(order: AnyRecord, template: AnyRecord): WorkOrderProcessSnapshotStepRow[] {
  const snapshot = workOrderStoredSnapshot(order);
  const frozenSteps = toArray<AnyRecord>(snapshot?.processSteps);
  const instructions = toArray<AnyRecord>(template.stepInstructions || template.steps);
  return toArray<string>(template.stepCodes).map((code, index) => {
    const frozenStep = frozenSteps.find((item) => text(item.code, '') === code) || {};
    const liveStep = production2ProcessSteps.find((item) => item.code === code) as unknown as AnyRecord | undefined;
    const step = Object.keys(frozenStep).length ? frozenStep : liveStep || {};
    const instruction = processTemplateStepInstructionFor(instructions, code, index);
    const explicitActions = processStepActionsFromRaw(step)
      .map((action, actionIndex) => processStepDraftActionFromRaw(action, code, actionIndex));
    const actionCodes = workOrderSnapshotActionCodes(frozenStep, liveStep);
    const actionNames = actionCodes
      .map((actionCode) => production2SystemActions.find((action) => action.code === actionCode)?.name || actionCode)
      .filter(Boolean);
    const routeType = text(template.routeType, '');
    const defaults = processTemplateStepWorkDefaults(code, routeType);
    return {
      code,
      sequence: index + 1,
      name: step?.name === '成品报工'
        ? processTemplateStepName(code, routeType)
        : text(step.name, processTemplateStepName(code, routeType)),
      owner: productionDisplayTerm(workOrderSnapshotStepOwner(code, frozenStep, liveStep)),
      executionMode: productionDisplayTerm(workOrderSnapshotStepExecutionMode(frozenStep, liveStep)),
      action: productionDisplayTerm(explicitActions.length
        && !actionNames.length
        ? processStepActionSummary(explicitActions)
        : actionNames.join('、') || text(step.defaultAction, '按工序要求执行')),
      equipment: productionDisplayTerm(text(instruction.coreEquipment || step.coreEquipment, defaults.coreEquipment)),
      workContent: productionDisplayTerm(text(instruction.workContent || step.workInstruction || step.description, defaults.workContent)),
      completionRule: productionDisplayTerm(workOrderProcessGuidance(
        instruction.controlPoints || step.completionRule || step.passAction,
        defaults.controlPoints,
      )),
      abnormalRule: productionDisplayTerm(text(instruction.commonIssues || step.abnormalRule || step.failAction, defaults.commonIssues)),
    };
  });
}

function executionCardSourceWorkOrder(raw: AnyRecord | undefined) {
  const code = text(raw?.workOrderCode, '');
  return production2WorkOrders.find((order) => text(order.code, '') === code) as (Production2WorkOrder & AnyRecord) | undefined;
}

function executionCardPlanSnapshot(raw: AnyRecord | undefined) {
  if (raw?.planSnapshot && typeof raw.planSnapshot === 'object' && !Array.isArray(raw.planSnapshot)) {
    return raw.planSnapshot as AnyRecord;
  }
  const workOrder = executionCardSourceWorkOrder(raw);
  const workOrderSnapshot = workOrder ? workOrderStoredSnapshot(workOrder) : undefined;
  return {
    sourceWorkOrderCode: text(raw?.workOrderCode, ''),
    sourceWorkOrderRevision: toNumber(workOrder?.revision),
    snapshotStatus: text(workOrderSnapshot?.snapshotStatus || workOrder?.snapshotStatus, 'historical_binding'),
    frozenAt: text(workOrderSnapshot?.frozenAt || workOrder?.updatedAt, ''),
    frozenBy: productionActorLabel(workOrderSnapshot?.frozenBy, text(workOrder?.owner, '系统')),
    recipe: workOrder ? workOrderRecipeSnapshot(workOrder) : undefined,
    processTemplate: workOrder ? workOrderProcessSnapshot(workOrder) : undefined,
  } as AnyRecord;
}

function executionCardPlanRecipe(raw: AnyRecord | undefined) {
  const snapshot = executionCardPlanSnapshot(raw);
  const recipe = workOrderSnapshotRecord(snapshot.recipe);
  if (recipe && toArray<AnyRecord>(recipe.materials).length) return recipe;
  const workOrder = executionCardSourceWorkOrder(raw);
  return workOrder ? workOrderRecipeSnapshot(workOrder) : undefined;
}

function executionCardPlanProcess(raw: AnyRecord | undefined) {
  const snapshot = executionCardPlanSnapshot(raw);
  return workOrderSnapshotRecord(snapshot.processTemplate)
    || workOrderSnapshotRecord((raw?.processSnapshot as AnyRecord | undefined)?.processTemplate)
    || executionCardSourceWorkOrder(raw) && workOrderProcessSnapshot(executionCardSourceWorkOrder(raw) as AnyRecord);
}

function executionCardPlanSnapshotNote(raw: AnyRecord) {
  const snapshot = executionCardPlanSnapshot(raw);
  const frozen = text(snapshot.snapshotStatus, '') === 'server_frozen';
  const revision = toNumber(snapshot.sourceWorkOrderRevision);
  return `${frozen ? '工单确认版本' : '历史版本关联'}${revision ? ` · R${revision}` : ''}`;
}

function executionCardMaterialMoves(raw: AnyRecord, moves: AnyRecord[]) {
  const release = releaseBatchForExecutionCard(raw.code);
  return moves.filter((move) => (
    text(move.executionCard, '') === text(raw.code, '')
      || (release?.code && text(move.releaseBatch, '') === text(release.code, ''))
  ));
}

function executionCardMaterialEvidenceMissing(raw: AnyRecord, issues?: AnyRecord[], returns?: AnyRecord[]) {
  const materialIssues = issues || executionCardMaterialMoves(raw, runtimeProductionIssues.value);
  const materialReturns = returns || executionCardMaterialMoves(raw, runtimeProductionReturns.value);
  if (materialIssues.length || materialReturns.length) return false;
  const release = releaseBatchForExecutionCard(raw.code);
  return text(release?.materialStatus, '') === '已领料'
    || toNumber(raw.reportedQty) > 0
    || toNumber(raw.inboundQty) > 0
    || ['已完成', '已入库'].includes(text(raw.status, ''));
}

function executionCardMaterialMovementLines(raw: AnyRecord): DetailLine[] {
  const issues = executionCardMaterialMoves(raw, runtimeProductionIssues.value);
  const returns = executionCardMaterialMoves(raw, runtimeProductionReturns.value);
  const evidenceMissing = executionCardMaterialEvidenceMissing(raw, issues, returns);
  const recipe = executionCardPlanRecipe(raw);
  const plannedRows = recipe ? buildWorkOrderRecipeSnapshotRows({ ...raw, planQty: raw.planQty }, recipe) : [];
  if (evidenceMissing && plannedRows.length) {
    return [{
      title: '历史领退料凭证',
      meta: '该批次未保存逐项领退料明细',
      status: '未关联',
      values: [
        { label: '计划物料', value: `${plannedRows.length} 项` },
        { label: '批次物料状态', value: productionDisplayTerm(releaseBatchForExecutionCard(raw.code)?.materialStatus || '已领料') },
      ],
    }];
  }
  const movementByMaterial = new Map<string, {
    code: string;
    name: string;
    unit: string;
    issuedQty: number;
    returnedQty: number;
    pendingReturnQty: number;
    batches: string[];
    issueCodes: string[];
    returnCodes: string[];
  }>();

  const accumulate = (move: AnyRecord, direction: 'issue' | 'return') => {
    toArray<AnyRecord>(move.products).forEach((product) => {
      const code = text(product.materialCode, text(product.code, text(product.name, '未编码物料')));
      const unit = text(product.uom || product.unit, '-');
      const row = movementByMaterial.get(code) || {
        code,
        name: text(product.name, code),
        unit,
        issuedQty: 0,
        returnedQty: 0,
        pendingReturnQty: 0,
        batches: [],
        issueCodes: [],
        returnCodes: [],
      };
      const postedQty = product.postedQty !== undefined
        ? toNumber(product.postedQty)
        : text(move.status, '') === '已完成'
          ? toNumber(product.quantity ?? product.plannedQty)
          : 0;
      if (direction === 'issue') {
        row.issuedQty += postedQty;
        row.issueCodes.push(text(move.code));
      } else {
        row.returnedQty += postedQty;
        if (postedQty <= 0 && text(move.status, '') !== '已完成') {
          row.pendingReturnQty += toNumber(product.quantity ?? product.plannedQty);
        }
        row.returnCodes.push(text(move.code));
      }
      const batch = text(product.batch, '');
      if (batch) row.batches.push(batch);
      movementByMaterial.set(code, row);
    });
  };
  issues.forEach((move) => accumulate(move, 'issue'));
  returns.forEach((move) => accumulate(move, 'return'));

  const plannedByMaterial = new Map(plannedRows.map((row) => [row.code, row]));
  const materialCodes = [...new Set([...plannedByMaterial.keys(), ...movementByMaterial.keys()])];
  if (!materialCodes.length) {
    const issueCodes = toArray<string>(releaseBatchForExecutionCard(raw.code)?.materialIssueCodes);
    return issueCodes.map((code) => ({
      title: code,
      meta: '生产领料凭证',
      status: '已领料',
      values: [
        { label: '计划标准', value: '历史批次未保存配方明细' },
        { label: '领料凭证', value: code },
      ],
    }));
  }

  return materialCodes.map((code) => {
    const planned = plannedByMaterial.get(code);
    const movement = movementByMaterial.get(code);
    const unit = movement?.unit || planned?.unit || '-';
    const issueCodes = [...new Set(movement?.issueCodes || [])].filter(Boolean);
    const returnCodes = [...new Set(movement?.returnCodes || [])].filter(Boolean);
    const batches = [...new Set(movement?.batches || [])].filter(Boolean);
    const issuedQty = movement?.issuedQty || 0;
    const returnedQty = movement?.returnedQty || 0;
    const pendingReturnQty = movement?.pendingReturnQty || 0;
    return {
      title: movement?.name || planned?.name || code,
      meta: `${code}${planned?.basis ? ` · ${planned.basis}` : ''}`,
      status: evidenceMissing
        ? '历史凭证未关联'
        : pendingReturnQty > 0
          ? '退料待入库'
          : issuedQty > 0
            ? returnedQty > 0 ? '已有退料' : '已领料'
            : '待领料',
      values: [
        { label: '计划含损耗', value: planned ? planned.plannedWithLoss : '未记录' },
        ...(evidenceMissing
          ? [
              { label: '领料 / 已退', value: '历史未记录' },
              { label: '净领料', value: '历史未记录' },
              { label: '物料批次', value: '历史未记录' },
              { label: '领/退凭证', value: '未关联' },
            ]
          : [
              { label: '领料 / 已退', value: `${qty(issuedQty, unit)} / ${qty(returnedQty, unit)}` },
              ...(pendingReturnQty > 0 ? [{ label: '待退料入库', value: qty(pendingReturnQty, unit) }] : []),
              { label: '净领料', value: qty(Math.max(0, issuedQty - returnedQty), unit) },
              { label: '物料批次', value: batches.join('、') || '-' },
              { label: '领/退凭证', value: [...issueCodes, ...returnCodes].join('、') || '-' },
            ]),
      ],
    };
  });
}

function executionCardMaterialDisplayStatus(raw: AnyRecord) {
  const lines = executionCardMaterialMovementLines(raw);
  if (!lines.length) return productionDisplayTerm(releaseBatchForExecutionCard(raw.code)?.materialStatus || '待确认');

  const pendingLines = lines.filter((line) => line.status === '待领料');
  if (!pendingLines.length) return '已领齐';

  const issuedLines = lines.filter((line) => line.status !== '待领料');
  if (!issuedLines.length) return '待领料';

  const recipe = executionCardPlanRecipe(raw);
  const productionMaterialCodes = toArray<AnyRecord>(recipe?.materials)
    .filter((material) => recipeMaterialUsageMode(material) === 'percent')
    .map((material) => text(material.materialCode, ''))
    .filter(Boolean);
  const productionMaterialsReady = productionMaterialCodes.length > 0
    && productionMaterialCodes.every((code) => lines.some((line) => line.title === code || text(line.meta, '').startsWith(`${code} ·`) || text(line.meta, '') === code)
      && !pendingLines.some((line) => line.title === code || text(line.meta, '').startsWith(`${code} ·`) || text(line.meta, '') === code));

  return productionMaterialsReady ? '生产原料已领' : '部分领料';
}

function productionMaterialUnit(item: AnyRecord, fallback = '件') {
  const raw = currentProductionDocument.value?.raw as AnyRecord | undefined;
  const recipe = raw ? workOrderRecipeSnapshot(raw) : undefined;
  const material = toArray<AnyRecord>(recipe?.materials).find((materialItem) => text(materialItem.materialCode, '') === text(item.materialCode, ''));
  if (!material) return text(item.unit, fallback);
  if (recipeMaterialUsageMode(material) === 'percent') return 'kg';
  return text(material.unit, text(item.unit, fallback));
}

function workOrderRecipeSnapshotNote(order: AnyRecord, recipe: AnyRecord | undefined) {
  const sourceLabel = workOrderSnapshotSourceLabel(order);
  if (!recipe) return `${sourceLabel} · 未记录配方 ${text(order.recipeCode, '-')}`;
  const snapshot = workOrderStoredSnapshot(order);
  if (snapshot && !workOrderSnapshotRecord(snapshot.recipe || snapshot.recipeSnapshot)) {
    return `${sourceLabel} · 配方版本 ${text(snapshot.recipeVersionId, text(order.recipeCode, '-'))}`;
  }
  return `${sourceLabel} · ${text(recipe.version)}`;
}

function workOrderRecipeSnapshotLines(order: AnyRecord, recipe: AnyRecord | undefined): DetailLine[] {
  if (!recipe) return [];
  const snapshot = workOrderStoredSnapshot(order);
  if (snapshot && !workOrderSnapshotRecord(snapshot.recipe || snapshot.recipeSnapshot)) {
    return [{
      title: text(snapshot.recipeVersionId, text(order.recipeCode, '-')),
      meta: '工单确认时的配方版本',
      status: text(snapshot.snapshotStatus, '版本已绑定'),
      values: [
        { label: '配方版本', value: text(snapshot.recipeVersionId, text(order.recipeCode, '-')) },
        { label: '确认时间', value: text(snapshot.frozenAt, '-') },
        { label: '确认人', value: productionActorLabel(snapshot.frozenBy, text(order.owner, '系统')) },
      ],
    }];
  }
  const unitWeightKg = recipe.productUnitWeightKg ?? order.productUnitWeightKg;
  const materials = toArray<AnyRecord>(recipe.materials);
  const losses = toArray<AnyRecord>(recipe.estimatedLosses);
  const header: DetailLine = {
    title: text(recipe.code),
    meta: `${text(recipe.name, '生产配方')} · ${text(recipe.version)}`,
    status: text(recipe.status),
    route: `/production/recipes/${encodeURIComponent(text(recipe.code))}`,
    values: [
      { label: '适用成品', value: productIdentity(recipe.productCode, recipe.productName || order.productName, '-') },
      { label: '版本号', value: text(recipe.version, '-') },
      { label: '单位净重', value: `${formatRecipeQuantity(recipe.productUnitWeightKg, 'kg')}/${text(recipe.outputUnit || order.unit, '件')}` },
      { label: '明细用料', value: `${materials.length} 项` },
      { label: '预估损耗', value: losses.length ? `${losses.length} 项` : '未设置' },
    ],
  };
  const materialLines = materials.map((item) => {
    const usageMode = recipeMaterialUsageMode(item);
    const perUnitQty = usageMode === 'percent' ? recipeMaterialBaseKg(item, unitWeightKg) : recipeMaterialPerUnitQty(item);
    const unit = usageMode === 'percent' ? 'kg' : text(item.unit, '-');
    const loss = losses.find((lossItem) => text(lossItem.materialCode, '') === text(item.materialCode, ''));
    return {
      title: text(item.materialName),
      meta: text(item.materialCode),
      status: recipeUsageModeLabel(item),
      values: [
        { label: '每单位需用', value: formatRecipeQuantity(perUnitQty, unit) },
        { label: usageMode === 'percent' ? '投料占比' : '固定用量', value: usageMode === 'percent' ? formatPercent(recipeMaterialPercent(item)) : formatRecipeQuantity(recipeMaterialPerUnitQty(item), unit) },
        {
          label: '预估损耗',
          value: loss
            ? recipeEstimatedLossFormula({
              lineId: text(loss.lineId, ''),
              materialCode: text(loss.materialCode, ''),
              materialName: text(loss.materialName, ''),
              fixedLossQty: editableNumberText(recipeMaterialFixedLossQty(loss), 0),
              lossRatePercent: editableNumberText(recipeMaterialLossRatePercent(loss), 0),
              unit: text(loss.unit, ''),
            })
            : '未设置',
        },
        { label: '来料质检', value: item.incomingQcRequired ? '需要' : '不需要' },
      ],
    };
  });
  return [header, ...materialLines];
}

function workOrderProcessSnapshotNote(order: AnyRecord, template: AnyRecord | undefined) {
  const sourceLabel = workOrderSnapshotSourceLabel(order);
  if (!template) return `${sourceLabel} · 未记录生产工艺 ${text(order.processTemplateCode, '-')}`;
  const snapshot = workOrderStoredSnapshot(order);
  if (snapshot && !workOrderSnapshotRecord(snapshot.processTemplate || snapshot.processTemplateSnapshot)) {
    return `${sourceLabel} · 工艺版本 ${text(snapshot.processVersionId, text(order.processTemplateCode, '-'))}`;
  }
  const stepCodes = toArray<string>(template.stepCodes);
  return `${sourceLabel} · ${stepCodes.length} 道工序`;
}

function workOrderProcessStepSnapshotLines(template: AnyRecord, snapshot: AnyRecord): DetailLine[] {
  const stepCodes = toArray<string>(template.stepCodes);
  const frozenSteps = toArray<AnyRecord>(snapshot.processSteps);
  const instructions = toArray<AnyRecord>(template.stepInstructions || template.steps);
  const routeType = text(template.routeType, '');
  return stepCodes.map((code, index) => {
    const frozenStep = frozenSteps.find((item) => text(item.code, '') === code) || {};
    const liveStep = production2ProcessSteps.find((item) => item.code === code) as unknown as AnyRecord | undefined;
    const step = Object.keys(frozenStep).length ? frozenStep : liveStep || {};
    const instruction = processTemplateStepInstructionFor(instructions, code, index);
    const actions = processStepActionsFromRaw(step)
      .map((action, actionIndex) => processStepDraftActionFromRaw(action, code, actionIndex));
    const actionNames = workOrderSnapshotActionCodes(frozenStep, liveStep)
      .map((actionCode) => production2SystemActions.find((action) => action.code === actionCode)?.name || actionCode)
      .filter(Boolean);
    const defaults = processTemplateStepWorkDefaults(code, routeType);
    return {
      title: step?.name === '成品报工'
        ? processTemplateStepName(code, routeType)
        : text(step?.name, processTemplateStepName(code, routeType)),
      meta: `第 ${index + 1} 道 · ${code}`,
      status: productionDisplayTerm(text(step?.status, text(template.status, '-'))),
      values: [
        { label: '系统动作', value: productionDisplayTerm(actionNames.join('、') || (actions.length ? processStepActionSummary(actions) : text(step?.defaultAction, '未记录'))) },
        { label: '核心设备', value: productionDisplayTerm(text(instruction?.coreEquipment || step?.coreEquipment, defaults.coreEquipment)) },
        { label: '作业内容', value: productionDisplayTerm(text(instruction?.workContent || step?.workInstruction || step?.description, defaults.workContent)) },
        { label: '控制点', value: productionDisplayTerm(workOrderProcessGuidance(instruction?.controlPoints || step?.completionRule || step?.passAction, defaults.controlPoints)) },
        { label: '常见问题', value: productionDisplayTerm(text(instruction?.commonIssues || step?.abnormalRule || step?.failAction, defaults.commonIssues)) },
      ],
    };
  });
}

function workOrderProcessSnapshotLines(order: AnyRecord, template: AnyRecord | undefined): DetailLine[] {
  if (!template) return [];
  const snapshot = workOrderStoredSnapshot(order);
  if (snapshot && !workOrderSnapshotRecord(snapshot.processTemplate || snapshot.processTemplateSnapshot)) {
    return [{
      title: text(snapshot.processVersionId, text(order.processTemplateCode, '-')),
      meta: '工单确认时的工艺版本',
      status: text(snapshot.snapshotStatus, '版本已绑定'),
      values: [
        { label: '工艺版本', value: text(snapshot.processVersionId, text(order.processTemplateCode, '-')) },
        { label: '确认时间', value: text(snapshot.frozenAt, '-') },
        { label: '确认人', value: productionActorLabel(snapshot.frozenBy, text(order.owner, '系统')) },
      ],
    }];
  }
  const stepCodes = toArray<string>(template.stepCodes);
  const zones = toArray<AnyRecord>(template.temperatureZones);
  const lines: DetailLine[] = [
    {
      title: text(template.code),
      meta: `${text(template.name)} · ${text(template.version)}`,
      status: text(template.status),
      route: `/production/process-templates/${encodeURIComponent(text(template.code))}`,
      values: [
        { label: '适用范围', value: text(template.productFamily, '-') },
        { label: '版本号', value: text(template.version, '-') },
        { label: '适用产线', value: toArray<string>(template.lineTypes).join('、') || '-' },
        { label: '工序数量', value: `${stepCodes.length} 道` },
        { label: '温区/允差', value: zones.length ? `${zones.length} 个 · ${processTemplateToleranceSummary(zones, template.temperatureTolerance)}` : '不适用' },
      ],
    },
  ];
  if (zones.length) {
    lines.push({
      title: '温区设定',
      meta: `${zones.length} 个温区`,
      status: text(template.status),
      values: [
        { label: '温区/设定值', value: processTemplateZoneFullSummary(zones) },
        { label: '允差', value: processTemplateToleranceSummary(zones, template.temperatureTolerance) },
      ],
    });
  }
  const snapshotStepLines = snapshot
    ? workOrderProcessStepSnapshotLines(template, snapshot)
    : processTemplateStepLines(stepCodes, template.status, template.stepInstructions || template.steps, text(template.routeType));
  if (snapshotStepLines.length) {
    lines.push({
      title: '工序路线',
      meta: `${snapshotStepLines.length} 道工序`,
      status: text(template.status),
      values: [
        { label: '路线', value: snapshotStepLines.map((line) => line.title).join(' → ') },
        { label: '执行方式', value: '按生产批次推进，完整作业要求以工艺版本为准' },
      ],
    });
  }
  return lines;
}

function materialNeedHint(value: unknown, sourceDoc = '') {
  const needs = materialNeedsWithLiveInventory(value, sourceDoc, true);
  if (!needs.length) {
    const hasExecutionFacts = workOrderReleaseBatches(sourceDoc).length > 0 || workOrderExecutionCards(sourceDoc).length > 0;
    return hasExecutionFacts ? '历史工单未保存物料需求明细' : '暂无物料需求';
  }
  const shortageItems = needs.filter((item) => toNumber(item.shortageQty) > 0);
  if (!shortageItems.length && needs.every((item) => toNumber(item.ownAllocatedQty) >= toNumber(item.estimatedQty))) {
    return `${needs.length} 项物料均已为本工单完成分配`;
  }
  if (!shortageItems.length) return `${needs.length} 项物料可由本单分配与可用库存覆盖`;
  const waitInboundCount = shortageItems.filter((item) => text(item.status).includes('仓库入库')).length;
  const waitQcCount = shortageItems.filter((item) => text(item.status).includes('质检')).length;
  const waitTransferCount = shortageItems.filter((item) => text(item.status).includes('调拨')).length;
  const waitStocktakeCount = shortageItems.filter((item) => text(item.status).includes('盘点')).length;
  if (waitStocktakeCount) return `${shortageItems.length} 项尚未备齐，其中 ${waitStocktakeCount} 项等待盘点完成`;
  if (waitTransferCount) return `${shortageItems.length} 项尚未备齐，其中 ${waitTransferCount} 项库存位于非生产领料仓`;
  if (waitInboundCount) return `${shortageItems.length} 项尚未备齐，其中 ${waitInboundCount} 项待仓库入库`;
  if (waitQcCount) return `${shortageItems.length} 项尚未备齐，其中 ${waitQcCount} 项待来料质检`;
  return `${shortageItems.length} 项短缺，需采购或等待补充到货`;
}

function materialNeedLines(value: unknown, sourceDoc = ''): DetailLine[] {
  return materialNeedsWithLiveInventory(value, sourceDoc, true).map((item) => {
    const unit = productionMaterialUnit(item, '件');
    return {
      title: text(item.materialName),
      meta: text(item.materialCode),
      status: text(item.status),
      values: [
        { label: '预计需求', value: qty(item.estimatedQty, unit) },
        { label: '本单分配', value: qty(item.ownAllocatedQty, unit) },
        { label: '可领料库存', value: qty(item.availableQty, unit) },
        ...(toNumber(item.nonIssueWarehouseAvailableQty) > 0
          ? [{ label: '其他仓可用', value: qty(item.nonIssueWarehouseAvailableQty, unit) }]
          : []),
        { label: '缺口', value: qty(item.shortageQty, unit) },
        { label: '待检', value: qty(item.qcPendingQty, unit) },
        { label: '待入库/在途', value: `${qty(item.pendingInboundQty, unit)} / ${qty(item.inTransitQty, unit)}` },
      ],
    };
  });
}

function workOrderReleaseBatches(workOrderCode: unknown) {
  const code = text(workOrderCode, '');
  if (!code) return [];
  return production2ReleaseBatches.filter((batch) => batch.workOrderCode === code);
}

function replaceWorkOrderReleaseBatches(workOrderCode: string, batches: Production2ReleaseBatch[]) {
  const otherBatches = production2ReleaseBatches.filter((batch) => batch.workOrderCode !== workOrderCode);
  production2ReleaseBatches.splice(0, production2ReleaseBatches.length, ...batches, ...otherBatches);
  productionDataRevision.value += 1;
}

function confirmedReleaseBatchQuantity(batch: (typeof production2ReleaseBatches)[number]) {
  if (batch.releaseStatus !== '已释放') return 0;
  return Math.max(0, Math.min(toNumber(batch.planQty), toNumber(batch.releasedQty)));
}

function fallbackWorkOrderReleasedQty(order: { releasedQty?: unknown; linePlans?: unknown; planQty?: unknown }) {
  const planQty = Math.max(0, toNumber(order.planQty));
  const releasedQty = toNumber(order.releasedQty);
  return Math.max(0, Math.min(planQty || releasedQty, releasedQty));
}

function workOrderReleasedQuantity(order: AnyRecord) {
  const planQty = Math.max(0, toNumber(order.planQty));
  const releaseBatches = workOrderReleaseBatches(text(order.code, ''));
  return Math.min(
    planQty,
    releaseBatches.length
      ? sumNumbers(releaseBatches.map((batch) => confirmedReleaseBatchQuantity(batch)))
      : fallbackWorkOrderReleasedQty(order),
  );
}

function workOrderRemainingMaterialNeeds(order: AnyRecord, unreleasedQtyValue?: number) {
  const planQty = Math.max(0, toNumber(order.planQty));
  const releasedQty = workOrderReleasedQuantity(order);
  const unreleasedQty = unreleasedQtyValue ?? Math.max(0, planQty - releasedQty);
  if (unreleasedQty <= 0) return [];
  const effectiveNeeds = workOrderEffectiveMaterialNeeds(order);
  const recipe = workOrderRecipeSnapshot(order);
  if (recipe) return buildWorkOrderMaterialNeeds(unreleasedQty, recipe, effectiveNeeds);
  if (planQty <= 0) return effectiveNeeds;
  const remainingRatio = Math.min(1, unreleasedQty / planQty);
  return effectiveNeeds.map((item) => ({
    ...item,
    estimatedQty: toNumber(item.estimatedQty) * remainingRatio,
  }));
}

function workOrderReleasedMaterialStage(order: AnyRecord) {
  const releasedBatches = workOrderReleaseBatches(text(order.code, ''))
    .filter((batch) => confirmedReleaseBatchQuantity(batch) > 0);
  if (!releasedBatches.length) return '';
  const issuedCount = releasedBatches.filter((batch) => text(batch.materialStatus, '') === '已领料').length;
  if (issuedCount === releasedBatches.length) return '已领齐';
  if (issuedCount > 0) return '部分已领料';
  return '待领料';
}

function workOrderMaterialPreparationLabel(order: AnyRecord) {
  const planQty = Math.max(0, toNumber(order.planQty));
  const releasedQty = workOrderReleasedQuantity(order);
  const unreleasedQty = Math.max(0, planQty - releasedQty);
  const releasedStage = workOrderReleasedMaterialStage(order);
  if (unreleasedQty <= 0) return releasedStage || (releasedQty > 0 ? '已完成生产安排' : '待安排');

  const remainingNeeds = workOrderRemainingMaterialNeeds(order, unreleasedQty);
  const remainingStatus = materialTaskReadinessTitle(
    remainingNeeds,
    unreleasedQty,
    text(order.code, ''),
    true,
  );
  if (releasedQty <= 0) return remainingStatus;
  return `${releasedStage || '已安排'} · 剩余${remainingStatus}`;
}

function workOrderReleaseFacts(order: AnyRecord) {
  const code = text(order.code, '');
  const planQty = Math.max(0, toNumber(order.planQty));
  const releaseBatches = workOrderReleaseBatches(code);
  const releasedQty = workOrderReleasedQuantity(order);
  const unreleasedQty = Math.max(0, planQty - releasedQty);
  const needs = materialNeedsWithLiveInventory(workOrderRemainingMaterialNeeds(order, unreleasedQty), code, true);

  if (unreleasedQty <= 0) {
    return {
      planQty,
      releasedQty,
      unreleasedQty: 0,
      releasableQty: 0,
      blocker: '计划数量已全部安排',
      releaseBatchCount: releaseBatches.length,
    };
  }

  const coverageRows = needs
    .map((item) => {
      const requiredQty = toNumber(item.estimatedQty);
      if (requiredQty <= 0 || unreleasedQty <= 0) return null;
      const perUnitQty = requiredQty / unreleasedQty;
      const remainingCoverageQty = (toNumber(item.ownAllocatedQty) + toNumber(item.availableQty)) / perUnitQty;
      return {
        name: text(item.materialName || item.materialCode, '物料'),
        status: text(item.status, ''),
        releasableQty: Math.max(0, Math.floor(remainingCoverageQty + 1e-9)),
      };
    })
    .filter((item): item is { name: string; status: string; releasableQty: number } => Boolean(item));
  const releasableQty = coverageRows.length
    ? Math.max(0, Math.min(unreleasedQty, ...coverageRows.map((item) => item.releasableQty)))
    : 0;
  const blockingRows = coverageRows.filter((item) => item.releasableQty < unreleasedQty);
  const blocker = !coverageRows.length
    ? '缺少物料需求明细，当前不能计算可安排数量'
    : releasableQty <= 0
      ? `${blockingRows.slice(0, 2).map((item) => `${item.name}${item.status ? `（${productionDisplayTerm(item.status)}）` : ''}`).join('、') || '物料'}不足，当前暂不可安排`
      : releasableQty < unreleasedQty
        ? `当前物料最多可安排 ${qty(releasableQty, order.unit)}`
        : '物料可满足全部未安排数量';

  return {
    planQty,
    releasedQty,
    unreleasedQty,
    releasableQty,
    blocker,
    releaseBatchCount: releaseBatches.length,
  };
}

function releaseBatchForExecutionCard(cardCode: unknown) {
  const code = text(cardCode, '');
  if (!code) return undefined;
  return production2ReleaseBatches.find((batch) => batch.executionCardCodes.includes(code));
}

function activeProductionExceptionForExecutionCard(cardCode: unknown) {
  const code = text(cardCode, '');
  if (!code) return undefined;
  return production2Exceptions.find((exception) => {
    const raw = exception as unknown as AnyRecord;
    return text(raw.status) !== '已关闭'
      && [raw.executionCardCode, raw.relatedBatch].map((value) => text(value, '')).includes(code);
  });
}

function activeProductionExceptionForWorkOrder(workOrderCode: unknown) {
  const code = text(workOrderCode, '');
  if (!code) return undefined;
  return production2Exceptions.find((exception) => {
    const raw = exception as unknown as AnyRecord;
    return text(raw.status) !== '已关闭' && text(raw.relatedWorkOrder, '') === code;
  });
}

function pendingProductionReceiptCode(cardCode: unknown) {
  const code = text(cardCode, '');
  if (!code) return '';
  const runtimePendingCode = runtimeProductionReceipts.value.find(
    (move) => text(move.executionCard) === code && !['已完成', '已作废', '已取消'].includes(text(move.status)),
  )?.code;
  if (runtimeExecutionCardDetailLoaded.value && activePage.value === 'execution-cards' && productionDocumentCode.value === code) {
    return text(runtimePendingCode, '');
  }
  return text(runtimePendingCode || productionMoveRows.find(
      (move) => move.moveType === '完工入库' && move.executionCard === code && move.status !== '已完成',
    )?.code, '');
}

function releaseBatchPrimaryRoute(batch: (typeof production2ReleaseBatches)[number]) {
  const pendingQuality = batch.qualityTaskCodes
    .map((code) => production2QualityTasks.find((task) => task.code === code))
    .find((task) => task && productionQualityTaskIsPending(task as unknown as AnyRecord));
  if (pendingQuality) {
    const cardCode = batch.executionCardCodes[0];
    return cardCode
      ? `/production/execution-cards/${encodeURIComponent(cardCode)}`
      : `/production/work-orders/${encodeURIComponent(batch.workOrderCode)}`;
  }
  if (batch.inboundStatus === '待入库' || batch.inboundStatus === '部分入库') {
    return '';
  }
  if (batch.materialStatus !== '已领料' && batch.releaseStatus === '已释放') {
    return '';
  }
  const cardCode = batch.executionCardCodes[0];
  return cardCode
    ? `/production/execution-cards/${encodeURIComponent(cardCode)}`
    : `/production/workbench?tab=schedule&workOrder=${encodeURIComponent(batch.workOrderCode)}`;
}

function workOrderReleaseExecutionLines(workOrderCode: unknown): DetailLine[] {
  const batches = workOrderReleaseBatches(workOrderCode);
  const linkedCardCodes = new Set<string>();
  const lines: DetailLine[] = [];

  batches.forEach((batch, batchIndex) => {
    const cards = production2ExecutionCards.filter((card) => batch.executionCardCodes.includes(card.code));
    if (!cards.length) {
      lines.push({
        title: `生产安排 ${batchIndex + 1}`,
        meta: `${batch.line} · ${batch.shift} · ${batch.leader}`,
        status: batch.materialStatus || batch.executionStatus || batch.releaseStatus,
        route: releaseBatchPrimaryRoute(batch),
        values: [
          { label: '安排数量', value: qty(batch.releasedQty, batch.unit) },
          ...(batch.materialStatus && batch.materialStatus !== '已领料'
            ? [{ label: '物料状态', value: batch.materialStatus }]
            : []),
          { label: '下一步', value: productionDisplayTerm(batch.nextAction) },
        ],
      });
      return;
    }

    cards.forEach((card) => {
      linkedCardCodes.add(card.code);
      lines.push({
        title: card.code,
        meta: `${batch.line} · ${batch.shift} · ${batch.leader}`,
        status: executionCardStageLabel(card as unknown as AnyRecord),
        route: `/production/execution-cards/${encodeURIComponent(card.code)}`,
        values: [
          { label: '批次数量', value: qty(card.planQty, card.unit) },
          ...(batch.materialStatus && batch.materialStatus !== '已领料'
            ? [{ label: '物料状态', value: batch.materialStatus }]
            : []),
          { label: '数量进度', value: `报工 ${qty(card.reportedQty, card.unit)} · 合格 ${qty(card.qualifiedQty, card.unit)} · 入库 ${qty(card.inboundQty, card.unit)}` },
          ...(executionCardQualityProgressSummary(card as unknown as AnyRecord)
            ? [{ label: '待处理质量', value: executionCardQualityProgressSummary(card as unknown as AnyRecord) }]
            : []),
          { label: '当前工序', value: executionCardCurrentStageName(card as unknown as AnyRecord) },
          { label: '下一步', value: productionDisplayTerm(text(card.nextAction, batch.nextAction)) },
        ],
      });
    });
  });

  workOrderExecutionCards(workOrderCode)
    .filter((card) => !linkedCardCodes.has(card.code))
    .forEach((card) => lines.push(...workOrderExecutionCardLines(card.workOrderCode).filter((line) => line.title === card.code)));

  return lines;
}

function recipeMaterialLines(value: unknown): DetailLine[] {
  const unitWeightKg = toNumber(currentProductionDocument.value?.raw.productUnitWeightKg);
  return toArray<AnyRecord>(value).map((item) => {
    const usageMode = recipeMaterialUsageMode(item);
    const baseKg = usageMode === 'percent' ? recipeMaterialBaseKg(item, unitWeightKg) : recipeMaterialPerUnitQty(item);
    const unit = usageMode === 'percent' ? 'kg' : text(item.unit, '-');
    return {
      title: text(item.materialName),
      meta: text(item.materialCode),
      status: item.incomingQcRequired ? '来料质检' : '直接领用',
      values: [
        { label: '用量方式', value: recipeUsageModeLabel(item) },
        { label: usageMode === 'fixed' ? '每单位用量' : '投料占比', value: usageMode === 'fixed' ? formatRecipeQuantity(baseKg, unit) : formatPercent(recipeMaterialPercent(item)) },
        { label: '每单位需用', value: formatRecipeQuantity(baseKg, unit) },
      ],
    };
  });
}

function recipeEstimatedLossHint(value: unknown) {
  const losses = toArray<AnyRecord>(value);
  if (!losses.length) return '未设置预估损耗';
  const fixedCount = losses.filter((item) => recipeMaterialFixedLossQty(item) > 0).length;
  const percentCount = losses.filter((item) => recipeMaterialLossRatePercent(item) > 0).length;
  return `${losses.length} 项 · 固定 ${fixedCount} 项 · 比例 ${percentCount} 项`;
}

function recipeEstimatedLossLines(value: unknown): DetailLine[] {
  return toArray<AnyRecord>(value).map((item) => {
    const formula = recipeEstimatedLossFormula({
      lineId: text(item.lineId, ''),
      materialCode: text(item.materialCode, ''),
      materialName: text(item.materialName, ''),
      fixedLossQty: editableNumberText(recipeMaterialFixedLossQty(item), 0),
      lossRatePercent: editableNumberText(recipeMaterialLossRatePercent(item), 0),
      unit: text(item.unit, ''),
    });
    return {
      title: text(item.materialName),
      meta: text(item.materialCode),
      status: '生产任务加量',
      values: [
        { label: '任务固定损耗', value: formatRecipeQuantity(recipeMaterialFixedLossQty(item), item.unit) },
        { label: '损耗率', value: formatPercent(recipeMaterialLossRatePercent(item)) },
        { label: '计算', value: formula },
      ],
    };
  });
}

function processTemplateRouteSummary(stepCodes: string[], routeType: string) {
  if (!stepCodes.length) return '暂无阶段';
  const first = processTemplateStepName(stepCodes[0]);
  const last = processTemplateStepName(stepCodes[stepCodes.length - 1]);
  const middle = routeType === '大盘复绕' ? '大盘半成品 → 复绕成品' : '成品收卷与报工';
  return `${first} → ${middle} → ${last}`;
}

function processTemplateZoneSummary(value: unknown) {
  const zones = standardizedProcessTemplateZones(toArray<AnyRecord>(value));
  const names = zones
    .slice(0, 3)
    .map((zone, index) => `${processTemplateZoneLabel(zone, index)} ${processTemplateTemperatureDisplay(zone.value)}`)
    .join('、');
  return zones.length > 3 ? `${names} 等` : names;
}

function processTemplateZoneFullSummary(value: unknown) {
  const zones = standardizedProcessTemplateZones(toArray<AnyRecord>(value));
  return zones
    .map((zone, index) => `${processTemplateZoneLabel(zone, index)} ${processTemplateTemperatureDisplay(zone.value)}`)
    .join('、');
}

function processTemplateToleranceSummary(value: unknown, fallback: unknown = '') {
  const zones = toArray<AnyRecord>(value);
  const tolerances = Array.from(new Set(zones.map((zone) => text(zone.tolerance, '')).filter(Boolean)));
  if (!tolerances.length) return text(fallback, '-');
  if (tolerances.length === 1) return tolerances[0];
  return zones
    .filter((zone) => text(zone.tolerance, ''))
    .map((zone, index) => `${processTemplateZoneLabel(zone, index)} ${text(zone.tolerance)}`)
    .join('、');
}

function numericText(value: unknown) {
  const source = text(value, '').replace(/,/g, '');
  const match = source.match(/-?\d+(?:\.\d+)?/);
  return match?.[0] || '';
}

function processTemplateTemperatureInputValue(value: unknown) {
  return numericText(value) || text(value, '');
}

function processTemplateTemperatureDisplay(value: unknown) {
  const numeric = processTemplateTemperatureInputValue(value);
  return numeric ? `${numeric}℃` : '-';
}

function processTemplateZoneLabel(zone: unknown, index: number) {
  return text((zone as AnyRecord)?.name, defaultProcessTemplateZones()[index]?.name || `温区 ${index + 1}`);
}

function processTemplateZoneGroups(value: ProcessTemplateZoneDraftLine[]) {
  const standardZoneOrder = ['水槽', '10区', '9区', '4区', '3区', '2区', '1区', '13区', '12区', '11区', '8区', '7区', '6区', '5区'];
  const standardZoneRank = new Map(standardZoneOrder.map((name, index) => [name, index]));
  const orderedZones = value
    .map((zone, index) => ({ zone, index }))
    .sort((left, right) => {
      const leftRank = standardZoneRank.get(text(left.zone.name, ''));
      const rightRank = standardZoneRank.get(text(right.zone.name, ''));
      return (leftRank ?? standardZoneOrder.length + left.index) - (rightRank ?? standardZoneOrder.length + right.index);
    })
    .map((item) => item.zone);
  const groups: ProcessTemplateZoneDraftLine[][] = [];
  for (let index = 0; index < orderedZones.length; index += 7) {
    groups.push(orderedZones.slice(index, index + 7));
  }
  return groups;
}

function processTemplateStepName(stepCode: string, routeType = '') {
  if (stepCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL') {
    if (routeType === '直接收卷') return '成品收卷与报工';
    if (routeType === '大盘复绕') return '复绕成品与报工';
  }
  return processTemplateStageNames[stepCode] || production2ProcessSteps.find((step) => step.code === stepCode)?.name || stepCode || '选择阶段';
}

function processTemplateBoundSystemActions(stepCode: string) {
  const actionCodes = production2ProcessSteps.find((step) => step.code === stepCode)?.actionCodes || [];
  return actionCodes
    .map((code) => production2SystemActions.find((action) => action.code === code))
    .filter((action): action is (typeof production2SystemActions)[number] => Boolean(action));
}

function processTemplateSystemActionSummary(stepCode: string) {
  return processTemplateBoundSystemActions(stepCode).map((action) => action.name).join('、') || '无系统动作';
}

function processTemplateNodeType(stepCode: string) {
  if (['P2-STEP-FIRST-INSPECTION', 'P2-STEP-WIP-QC', 'P2-STEP-FINISHED-QC', 'P2-STEP-INBOUND-SAMPLING'].includes(stepCode)) return '质检阶段';
  if (['P2-STEP-MATERIAL-ISSUE', 'P2-STEP-FINISHED-INBOUND'].includes(stepCode)) return '仓库协同';
  if (['P2-STEP-STARTUP', 'P2-STEP-PACKAGING'].includes(stepCode)) return '现场操作';
  return stepCode ? '生产作业' : '阶段类型';
}

function processTemplateExecutionRule(stepCode: string, routeType = '') {
  const rules: Record<string, string> = {
    'P2-STEP-MATERIAL-ISSUE': '等待生产领料过账；按工艺要求完成物料准备',
    'P2-STEP-STARTUP': '开始生产；系统自动创建开机首检',
    'P2-STEP-FIRST-INSPECTION': '等待质量放行，放行前阻断报工',
    'P2-STEP-WIP-REPORT-LARGE-REEL': '连续作业；每个大盘按实际净重 kg 登记',
    'P2-STEP-WIP-QC': '每次半成品报工自动触发检验',
    'P2-STEP-FINISHED-REPORT-SMALL-REEL': routeType === '大盘复绕'
      ? '连续复绕；按成品数量登记并保留来源大盘'
      : routeType === '直接收卷'
        ? '连续收卷；按成品数量登记'
        : '连续作业；按成品数量登记',
    'P2-STEP-FINISHED-QC': '每次成品报工自动触发检验',
    'P2-STEP-PACKAGING': '包装记录可按箱或包装批重复',
    'P2-STEP-INBOUND-SAMPLING': '包装完成后自动创建入库检验',
    'P2-STEP-FINISHED-INBOUND': '等待仓库确认完工入库',
  };
  return rules[stepCode] || (stepCode ? '按阶段完成条件推进' : '选择阶段后显示执行规则');
}

function processTemplateStepDefaultEquipment(stepCode: string, routeType = '') {
  if (stepCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL') {
    return routeType === '大盘复绕' ? '复绕设备、称重与扫码设备' : '收卷设备、称重与扫码设备';
  }
  const stageEquipment = production2ProcessSteps.find((step) => step.code === stepCode)?.coreEquipment;
  if (stageEquipment) return stageEquipment;
  const name = processTemplateStepName(stepCode, routeType);
  if (/物料|领料|发料|烘干/.test(name)) return '仓库发料区、烘干设备';
  if (/质量|检/.test(name)) return '质检工位、检测仪器';
  if (/开机|开工/.test(name)) return '生产主机、温控与牵引设备';
  if (/报工/.test(name)) return '生产工作台、称重/扫码设备';
  if (/包装/.test(name)) return '包装工位、标签与扫码设备';
  if (/入库/.test(name)) return '成品暂存区、仓库入库工位';
  return stepCode ? '现场设备、工装夹具' : '';
}

function processTemplateStepWorkInstruction(stepCode: string, routeType = '') {
  if (stepCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL') {
    return routeType === '大盘复绕'
      ? '按来源大盘复绕成品，登记成品盘号、净重、来源批次和损耗。'
      : routeType === '直接收卷'
        ? '连续收卷成品，登记成品盘号、净重、来源批次和损耗。'
        : '登记成品盘号、净重、来源批次和损耗。';
  }
  const step = production2ProcessSteps.find((item) => item.code === stepCode) as AnyRecord | undefined;
  return text(step?.workInstruction || step?.description, stepCode ? '未设置作业提示' : '选择工序后显示作业提示');
}

function processTemplateStepCompletionRule(stepCode: string, routeType = '') {
  if (stepCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL') {
    return routeType === '大盘复绕'
      ? '复绕成品报工成功，生成小盘批次并保留来源大盘关系。'
      : '成品报工成功并生成小盘批次。';
  }
  const step = production2ProcessSteps.find((item) => item.code === stepCode) as AnyRecord | undefined;
  return text(step?.completionRule || step?.passAction, stepCode ? '未设置完成条件' : '选择工序后显示完成条件');
}

function processTemplateStepCommonIssues(stepCode: string, routeType = '') {
  if (stepCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL') {
    return routeType === '大盘复绕'
      ? '数量、来源大盘、损耗或标签异常时登记生产异常。'
      : '数量、来源批次、损耗或标签异常时登记生产异常。';
  }
  const step = production2ProcessSteps.find((item) => item.code === stepCode) as AnyRecord | undefined;
  return text(step?.abnormalRule || step?.failAction, stepCode ? '异常时停留当前阶段并登记生产异常。' : '选择系统动作后显示常见问题');
}

function processTemplateStepWorkDefaults(stepCode: string, routeType = '') {
  return {
    coreEquipment: processTemplateStepDefaultEquipment(stepCode, routeType),
    workContent: processTemplateStepWorkInstruction(stepCode, routeType),
    controlPoints: processTemplateStepCompletionRule(stepCode, routeType),
    commonIssues: processTemplateStepCommonIssues(stepCode, routeType),
  };
}

function processTemplateStepLines(value: unknown, status: unknown, instructionsValue: unknown = [], routeType = ''): DetailLine[] {
  const instructions = toArray<AnyRecord>(instructionsValue);
  return toArray<string>(value).map((code, index) => {
    const step = production2ProcessSteps.find((item) => item.code === code);
    const instruction = processTemplateStepInstructionFor(instructions, code, index);
    const work = processTemplateStepFromCode(code, 'readonly', index, instruction, routeType as ProcessTemplateDraft['routeType'] | '');
    return {
      title: processTemplateStepName(code, routeType),
      meta: `阶段 ${index + 1} · ${processTemplateNodeType(code)} · ${code}`,
      status: productionDisplayTerm(step?.status || text(status)),
      values: [
        { label: '执行规则', value: productionDisplayTerm(processTemplateExecutionRule(code, routeType)) },
        { label: '系统动作', value: processTemplateSystemActionSummary(code) },
        { label: '核心设备', value: productionDisplayTerm(work.coreEquipment || '-') },
        { label: '作业要求', value: productionDisplayTerm(work.workContent || '-') },
        { label: '完成条件', value: productionDisplayTerm(work.controlPoints || '-') },
        { label: '异常处理', value: productionDisplayTerm(work.commonIssues || '-') },
      ],
    };
  });
}

function processTemplateZoneLines(value: unknown, status: unknown): DetailLine[] {
  return standardizedProcessTemplateZones(toArray<AnyRecord>(value)).map((zone, index) => ({
    title: processTemplateZoneLabel(zone, index),
    meta: '温区',
    status: text(status),
    values: [
      { label: '设定值', value: processTemplateTemperatureDisplay(zone.value) },
    ],
  }));
}

function maintenanceAction(status: unknown) {
  const value = text(status);
  if (value === '草稿') return '补齐后启用';
  if (value === '停用') return '评估后启用';
  if (value === '启用') return '定期复核';
  return '维护规则';
}

function recipeLifecycleAction(status: unknown) {
  const value = text(status);
  if (value === '草稿') return '启用版本';
  if (value === '启用') return '创建新版本';
  if (value === '停用') return '仅供历史追溯';
  return '检查版本';
}

function processTemplateLifecycleAction(status: unknown) {
  const value = text(status);
  if (value === '草稿') return '启用版本';
  if (value === '启用') return '创建新版本';
  if (value === '停用') return '仅供历史追溯';
  return '检查版本';
}

function taskNextAction(status: unknown) {
  const value = text(status);
  if (value.includes('已完成')) return '查看归档';
  if (value.includes('待建工单')) return '创建生产工单';
  if (value.includes('部分建单')) return '继续创建剩余工单';
  if (value.includes('已建单')) return '查看工单';
  return '创建生产工单';
}

function productionTaskMaterialPlanningBlockers(raw: AnyRecord | undefined) {
  const stored = toArray<AnyRecord>(raw?.materialPlanningBlockers);
  if (stored.length) return stored;
  return taskProductRowsFromRaw(raw || {}, text(raw?.code, '')).filter((product) => {
    const productCode = text(product.productCode, '');
    const recipeCode = text(product.recipeCode, '');
    if (recipeCode) {
      return !production2Recipes.some((recipe) => (
        text((recipe as AnyRecord).code, '') === recipeCode
        && text((recipe as AnyRecord).status, '') === '启用'
        && text((recipe as AnyRecord).productCode, productCode) === productCode
      ));
    }
    return !production2Recipes.some((recipe) => (
      text((recipe as AnyRecord).status, '') === '启用'
      && text((recipe as AnyRecord).productCode, '') === productCode
    ));
  }).map((product) => ({
    sourceLineId: text(product.lineId || (product as unknown as AnyRecord).sourceLineId, ''),
    productCode: text(product.productCode, ''),
    productName: text(product.productName || product.productCode, ''),
    reason: '没有唯一启用配方',
  }));
}

function taskOperationalNextAction(raw: AnyRecord) {
  const taskCode = text(raw.code, '');
  const products = taskProductRowsFromRaw(raw, taskCode);
  const lifecycle = taskLifecycleStatusForProducts(raw, products, taskCode);
  if (lifecycle === '已完成') return '查看完成记录';
  if (lifecycle === '已作废') return '查看作废记录';
  if (lifecycle === '草稿') return '编辑后提交';
  if (productionTaskMaterialPlanningBlockers(raw).length) return '维护生产配方';

  const workOrders = production2WorkOrders.filter((order) => workOrderSourceAllocationsFromRaw(
    order as unknown as AnyRecord,
    text(order.taskCode, ''),
    text((order as unknown as AnyRecord).sourceLineId, ''),
  ).some((allocation) => allocation.taskCode === taskCode));
  const buildStatus = taskBuildStatusForProducts(products, taskCode);
  if (buildStatus === '待建工单') return '创建生产工单';
  if (buildStatus === '部分建单') return '继续创建剩余工单';
  if (workOrders.some((order) => /待确认/.test(text(order.status, '')))) return '确认生产工单';

  const releaseFacts = workOrders.map((order) => ({
    order,
    facts: workOrderReleaseFacts(order as unknown as AnyRecord),
  }));
  const releasableQty = sumNumbers(releaseFacts.map(({ facts }) => facts.releasableQty));
  const unreleasedQty = sumNumbers(releaseFacts.map(({ facts }) => facts.unreleasedQty));
  if (releasableQty > 0) {
    const unit = text(releaseFacts.find(({ facts }) => facts.releasableQty > 0)?.order.unit, '件');
    return releasableQty + 0.0001 < unreleasedQty
      ? `先安排 ${qty(releasableQty, unit)}，余量待物料`
      : `安排 ${qty(releasableQty, unit)} 生产`;
  }
  if (workOrders.some((order) => /生产中|执行中|暂停|异常/.test(text(order.status, '')))) {
    return '跟踪报工与质检';
  }

  const sourceDocs = workOrders.map((order) => text(order.code, '')).filter(Boolean);
  const useLiveInventory = !taskReleaseIsCompleteForProducts(products, taskCode);
  const materialStatuses = taskMaterialReadinessRows(raw.materialNeeds, useLiveInventory, sourceDocs)
    .map((line) => line.status);

  if (materialStatuses.includes('需采购')) {
    const request = production2MaterialRequests.find((item) =>
      text((item as AnyRecord).sourceTaskCode, '') === taskCode
      && !/已取消|已作废/.test(text((item as AnyRecord).status, '')),
    );
    return request ? '跟踪备料申请' : '发起备料申请';
  }
  const waitsForQc = materialStatuses.includes('待质检放行');
  const waitsForInbound = materialStatuses.includes('待仓库入库');
  if (waitsForQc && waitsForInbound) return '等待质检放行与仓库入库';
  if (waitsForQc) return '等待质检放行';
  if (waitsForInbound) return '等待仓库入库';
  if (materialStatuses.includes('补充在途')) return '跟踪在途到货';

  if (products.some((line) => taskProductInboundQty(line, taskCode) + 0.0001 < toNumber(line.demandQty))) return '跟踪完工入库';
  return taskNextAction(buildStatus);
}

function workOrderNextAction(status: unknown) {
  const value = text(status);
  if (value.includes('待确认')) return '确认计划工单';
  if (value.includes('待派发') || value.includes('待释放')) return '安排生产';
  if (value.includes('生产中')) return '跟踪报工与质检';
  if (value.includes('部分入库')) return '继续入库';
  return '查看归档';
}

function workOrderReleasedQty(order: { releasedQty?: unknown; linePlans?: unknown }) {
  return workOrderReleaseFacts(order as AnyRecord).releasedQty;
}

function workOrderReleaseStatus(order: { releasedQty?: unknown; linePlans?: unknown; planQty?: unknown }) {
  const { planQty, releasedQty } = workOrderReleaseFacts(order as AnyRecord);
  if (planQty <= 0 || releasedQty <= 0) return '未安排';
  if (releasedQty < planQty) return '部分安排';
  return '已安排';
}

function workOrderDisplayNextAction(order: AnyRecord) {
  const activeQualityDisposition = production2QualityTasks.find(
    (task) => task.workOrderCode === text(order.code)
      && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
  );
  if (activeQualityDisposition) {
    return `${productionQualityActionLabel(activeQualityDisposition as unknown as AnyRecord)} · ${text(activeQualityDisposition.code)}`;
  }
  const activeException = activeProductionExceptionForWorkOrder(order.code);
  if (activeException) return `处理生产异常 · ${text(activeException.code)}`;
  const quantityChain = workOrderQuantityChain(order.code, order.planQty);
  if (toNumber(order.planQty) > 0 && quantityChain.inboundQty + 0.0001 >= toNumber(order.planQty)) {
    return workOrderLifecycleStatusFromRaw(order) === '已关闭'
      ? '工单已关闭，查看入库结果'
      : '核对完成并关闭工单';
  }
  const facts = workOrderReleaseFacts(order);
  if (text(order.status, '') === '待释放' && facts.releasableQty > 0) {
    return `安排 ${qty(facts.releasableQty, order.unit)} 生产，生成生产安排`;
  }
  const cards = workOrderExecutionCards(order.code);
  const activeStages = workOrderExecutionStageBuckets(order.code).filter((item) => item.label !== '已完成');
  if (cards.length > 1 && activeStages.length > 1) {
    return `分别处理：${activeStages.map((item) => `${item.label} ${item.count} 个`).join('、')}`;
  }
  if (facts.unreleasedQty > 0) {
    if (facts.releasableQty <= 0) return facts.blocker;
    return `安排 ${qty(facts.releasableQty, order.unit)} 生产，生成生产安排`;
  }
  return text(order.nextAction, workOrderNextAction(order.status));
}

function workOrderExecutionCards(workOrderCode: unknown) {
  const code = text(workOrderCode, '');
  if (!code) return [];
  return production2ExecutionCards.filter((card) => text(card.workOrderCode, '') === code);
}

function workOrderActionableProductionCard(workOrderCode: unknown) {
  const cards = workOrderExecutionCards(workOrderCode)
    .filter((card) => {
      const raw = card as unknown as AnyRecord;
      if (activeProductionExceptionForExecutionCard(card.code)) return false;
      if (qualityTasksForExecutionCard(card.code).some((task) => productionQualityTaskIsPending(task as unknown as AnyRecord))) return false;
      if (text(raw.status) === '已完成' || text(raw.node) === '已入库' || /待入库|完工入库/.test(text(raw.node, ''))) return false;
      if (executionCardShortCloseNeedsResolution(raw) || text(raw.node) === '待包装') return true;
      if (pendingProductionReceiptCode(card.code)) return false;
      const release = releaseBatchForExecutionCard(card.code);
      if (release?.materialStatus !== '已领料') return false;
      const operationJob = executionCardCurrentOperationJob(raw);
      return Boolean(operationJob && !['已完成', '已取消'].includes(operationJob.status));
    })
    .sort((left, right) => {
      const rank = (card: Production2ExecutionCard) => {
        const raw = card as unknown as AnyRecord;
        if (executionCardShortCloseNeedsResolution(raw)) return 0;
        if (text(raw.node) === '待包装') return 1;
        return 2;
      };
      return rank(left) - rank(right) || text(left.code).localeCompare(text(right.code));
    });
  return cards[0];
}

function executionCardCurrentStage(raw: AnyRecord | undefined) {
  if (!raw) return undefined;
  const instances = toArray<AnyRecord>(raw.stageInstances);
  const currentCode = text(raw.currentStageCode, '');
  return instances.find((stage) => text(stage.stageCode, '') === currentCode)
    || instances.find((stage) => !['已完成', '未开始'].includes(text(stage.status, '')))
    || instances[instances.length - 1];
}

function executionCardCurrentStageName(raw: AnyRecord | undefined) {
  const operationJob = executionCardCurrentOperationJob(raw);
  if (operationJob && ['可开工', '队列中', '待开工'].includes(operationJob.status)) {
    return `${operationJob.operationType.replace(/生产$/, '')}任务待开工`;
  }
  const stage = executionCardCurrentStage(raw);
  return stage ? executionCardStageDisplayName(stage, raw) : text(raw?.node, '-');
}

function executionCardStageDisplayName(stage: AnyRecord, raw: AnyRecord | undefined) {
  const stageCode = text(stage.stageCode, '');
  if (stageCode === 'P2-STEP-WIP-REPORT-LARGE-REEL') return '大盘半成品报工';
  if (stageCode === 'P2-STEP-WIP-QC') return '大盘半成品质检';
  if (stageCode === 'P2-STEP-FINISHED-REPORT-SMALL-REEL' && executionCardRouteType(raw) === '大盘复绕') return '复绕成品报工';
  return text(stage.stageName, text(raw?.node, '-'));
}

function executionCardOperationJobs(raw: AnyRecord | undefined) {
  return toArray<Production2OperationJob>(raw?.operationJobs)
    .slice()
    .sort((left, right) => left.sequence - right.sequence);
}

function executionCardCurrentOperationJob(raw: AnyRecord | undefined) {
  const jobs = executionCardOperationJobs(raw);
  const activeCode = text(raw?.activeOperationJobCode, '');
  return jobs.find((job) => job.code === activeCode)
    || jobs.find((job) => ['执行中', '暂停', '异常'].includes(job.status))
    || jobs.find((job) => !['已完成', '已取消'].includes(job.status))
    || jobs[jobs.length - 1];
}

function operationJobDisplayStatus(status: unknown) {
  const value = text(status, '-');
  if (value === '可开工') return '待开工';
  if (value === '队列中') return '排队中';
  return value;
}

function executionCardOperationSummary(raw: AnyRecord | undefined, fallback = '-') {
  const jobs = executionCardOperationJobs(raw);
  if (!jobs.length) return fallback;
  if (jobs.every((job) => ['已完成', '已取消'].includes(job.status))) return '设备作业已完成';
  const current = executionCardCurrentOperationJob(raw);
  return current ? `${current.operationType} · ${operationJobDisplayStatus(current.status)}` : fallback;
}

function executionCardOperationAssignment(job: Production2OperationJob | undefined, raw: AnyRecord | undefined) {
  if (!job) return text(raw?.line, '未排线');
  return text(job.assignedLine || job.recommendedLine, '未排线');
}

function executionCardPlannedLineSummary(raw: AnyRecord | undefined) {
  const jobs = executionCardOperationJobs(raw);
  if (!jobs.length) return text(raw?.line, '未排线');
  const assignments = new Map<string, Set<string>>();
  jobs.forEach((job) => {
    const operation = job.operationType.replace('生产', '');
    const lines = assignments.get(operation) || new Set<string>();
    lines.add(executionCardOperationAssignment(job, raw));
    assignments.set(operation, lines);
  });
  return [...assignments.entries()]
    .map(([operation, lines]) => `${operation}：${[...lines].join('、')}`)
    .join(' · ');
}

function executionCardPackagingStatus(raw: AnyRecord | undefined) {
  const packedQty = toNumber(raw?.packedQty);
  const qualifiedQty = toNumber(raw?.qualifiedQty);
  if (qualifiedQty <= 0) return '未触发';
  if (packedQty >= qualifiedQty) return '已包装';
  if (packedQty > 0) return '部分包装';
  return '待包装';
}

function compactProductionTimestamp(value: unknown) {
  const raw = text(value, '');
  if (!raw) return '-';
  return raw.replace('T', ' ').replace(/Z$/, '').slice(0, 16);
}

function executionCardOperationJobLines(raw: AnyRecord, jobs = executionCardOperationJobs(raw)): DetailLine[] {
  return jobs.map((job, index) => {
    const line = executionCardOperationAssignment(job, raw);
    const startAt = compactProductionTimestamp(job.actualStart);
    const endAt = compactProductionTimestamp(job.actualEnd);
    const plannedAt = compactProductionTimestamp(job.plannedAt || job.createdAt);
    const timeValue = job.actualEnd
      ? job.actualStart
        ? `${startAt} 至 ${endAt}`
        : `${endAt} 完成`
      : job.actualStart
        ? `${startAt} 开始`
        : `${plannedAt} 排入`;
    const sourceWip = job.sourceWipBatchCode
      ? toArray<Production2WipBatch>(raw.wipBatches).find((batch) => batch.code === job.sourceWipBatchCode)
      : undefined;
    const sourceValue = sourceWip
      ? `${sourceWip.code} · 可用 ${qty(sourceWip.availableWeightKg, sourceWip.unit)}`
      : text(job.sourceWipBatchCode, '无需大盘半成品');

    return {
      title: job.operationType,
      meta: `第 ${index + 1} / ${jobs.length} 项 · ${text(job.lineType, '设备作业')}`,
      status: operationJobDisplayStatus(job.status),
      values: [
        { label: '产线', value: line },
        { label: job.operationType === '复绕生产' ? '待处理重量' : '计划处理', value: qty(job.plannedQty, job.plannedUnit) },
        { label: job.operationType === '复绕生产' ? '成品产出' : '实际处理', value: qty(job.actualQty, job.actualUnit) },
        ...(job.operationType === '复绕生产' ? [{ label: '来源大盘', value: sourceValue }] : []),
        { label: '作业时间', value: timeValue },
        ...(job.completionMode
          ? [{
            label: '结束方式',
            value: job.completionMode === '短关'
              ? `提前结束 · 剩余 ${qty(job.remainingQtyAtClose, raw.unit)} · ${text(job.shortCloseReason, '未填写原因')}`
              : job.completionMode,
          }]
          : []),
        ...(!['已完成', '已取消'].includes(job.status) ? [{ label: '下一步', value: text(job.nextAction, '-') }] : []),
      ],
    };
  });
}

function executionCardRouteType(raw: AnyRecord | undefined): '直接收卷' | '大盘复绕' {
  if (!raw) return '直接收卷';
  const snapshot = raw.processSnapshot as AnyRecord | undefined;
  const template = snapshot?.processTemplate as AnyRecord | undefined;
  const routeType = text(template?.routeType, '');
  if (routeType === '大盘复绕') return '大盘复绕';
  const stageCodes = toArray<AnyRecord>(raw.stageInstances).map((stage) => text(stage.stageCode, ''));
  if (stageCodes.includes('P2-STEP-WIP-REPORT-LARGE-REEL') || stageCodes.includes('P2-STEP-WIP-QC')) return '大盘复绕';
  return '直接收卷';
}

function wipBatchMetrics(batch: Production2WipBatch, outputs: Production2BatchLineageRecord[]) {
  const outputWeightKg = toNumber(batch.outputWeightKg) || sumNumbers(outputs.map((item) => toNumber(item.netWeightKg)));
  const explicitLossWeightKg = toNumber(batch.lossWeightKg);
  const legacyDeductedWeightKg = toNumber(batch.consumedWeightKg);
  const lossWeightKg = explicitLossWeightKg || Math.max(0, legacyDeductedWeightKg - outputWeightKg);
  const usedWeightKg = toNumber(batch.usedWeightKg) || outputWeightKg || Math.max(0, legacyDeductedWeightKg - lossWeightKg);
  return {
    usedWeightKg: Math.round(usedWeightKg * 1000) / 1000,
    lossWeightKg: Math.round(lossWeightKg * 1000) / 1000,
    outputWeightKg: Math.round(outputWeightKg * 1000) / 1000,
  };
}

function executionCardWipTotals(batches: Production2WipBatch[], lineageRecords: Production2BatchLineageRecord[]) {
  return batches.reduce((totals, batch) => {
    const outputs = lineageRecords.filter((item) => item.sourceWipBatchCode === batch.code);
    const metrics = wipBatchMetrics(batch, outputs);
    totals.netWeightKg += toNumber(batch.netWeightKg);
    totals.qualifiedWeightKg += toNumber(batch.qualifiedWeightKg);
    totals.usedWeightKg += metrics.usedWeightKg;
    totals.lossWeightKg += metrics.lossWeightKg;
    totals.availableWeightKg += toNumber(batch.availableWeightKg);
    totals.outputQty += sumNumbers(outputs.map((item) => toNumber(item.outputQty)));
    return totals;
  }, {
    netWeightKg: 0,
    qualifiedWeightKg: 0,
    usedWeightKg: 0,
    lossWeightKg: 0,
    availableWeightKg: 0,
    outputQty: 0,
  });
}

function smallRollCodeSummary(outputs: Production2BatchLineageRecord[]) {
  if (!outputs.length) return '无小盘编号';
  const codes = outputs.map((item) => item.outputRollCode).filter(Boolean);
  if (codes.length <= 4) return codes.join('、');
  return `${codes[0]} 至 ${codes[codes.length - 1]}（共 ${codes.length} 卷）`;
}

function executionCardProcessSnapshotNote(raw: AnyRecord) {
  const snapshot = raw.processSnapshot as AnyRecord | undefined;
  const template = snapshot?.processTemplate as AnyRecord | undefined;
  const stages = toArray<AnyRecord>(raw.stageInstances);
  if (!stages.length) return '历史批次尚未生成阶段实例，当前仅显示业务节点。';
  return `${text(template?.name, text(raw.processTemplateCode, '工单工艺'))} · ${text(template?.version, '-')} · 工单 R${text(snapshot?.sourceWorkOrderRevision, '-')} 确认 · ${stages.length} 个阶段`;
}

function executionCardProcessStageProgressSummary(raw: AnyRecord) {
  const lines = executionCardProcessStageLines(raw);
  const completed = lines.filter((line) => line.status === '已完成').length;
  return `已完成 ${completed}/${lines.length} 道`;
}

function executionCardProcessStageLines(raw: AnyRecord): DetailLine[] {
  const stages = toArray<AnyRecord>(raw.stageInstances);
  if (!stages.length) {
    return [{
      title: text(raw.node, '待生成阶段实例'),
      meta: text(raw.processTemplateCode, '-'),
      status: text(raw.status, '-'),
      values: [{ label: '下一步', value: text(raw.nextAction, '-') }],
    }];
  }
  return stages.map((stage) => {
    const actions = toArray<AnyRecord>(stage.actionInstances);
    const activeActions = actions.filter((action) => text(action.status) !== '已完成');
    const displayActions = activeActions.length ? activeActions : actions;
    const actionSummary = displayActions.length
      ? displayActions.map((action) => `${text(action.actionName)} · ${text(action.status)}`).join('；')
      : '无独立动作';
    const sourceDocuments = actions.map((action) => text(action.sourceDocument, '')).filter(Boolean);
    const progress = executionCardStageProgress(stage, raw);
    const displayStatus = progress.status || text(stage.status, '-');
    const stageCompleted = displayStatus === '已完成';
    const completedActionSummary = actions.length
      ? actions.map((action) => text(action.actionName)).join('、')
      : '无独立动作';
    return {
      title: `${text(stage.sequence)} · ${executionCardStageDisplayName(stage, raw)}`,
      meta: `${text(stage.stageType, '阶段')} · ${text(stage.owner, '-')}`,
      status: displayStatus,
      values: [
        {
          label: stageCompleted ? '已完成动作' : '当前动作',
          value: progress.summary || (stageCompleted ? completedActionSummary : actionSummary),
          full: true,
        },
        ...(progress.quantity ? [{ label: '数量进度', value: progress.quantity }] : []),
        ...(sourceDocuments.length
          ? [{ label: '业务凭证', value: sourceDocuments.join('、') }]
          : progress.quantity
            ? []
            : [{ label: '记录方式', value: '阶段状态记录' }]),
        ...(stageCompleted || progress.suppressNextStep ? [] : [{ label: '下一步', value: text(stage.nextAction, '-'), full: true }]),
      ],
    };
  });
}

function executionCardStageProgress(stage: AnyRecord, raw: AnyRecord) {
  const identity = `${text(stage.stageCode, '')}${text(stage.stageName, '')}`;
  const unit = text(raw.unit, '件');
  const qualifiedQty = toNumber(raw.qualifiedQty);
  const packedQty = toNumber(raw.packedQty);
  const releasedInboundQty = toNumber(raw.releasedInboundQty);
  const inboundQty = toNumber(raw.inboundQty);

  if (/PACKAGING|包装/.test(identity) && qualifiedQty > 0) {
    return {
      status: packedQty >= qualifiedQty ? '已完成' : packedQty > 0 ? '进行中' : '',
      quantity: `${qty(packedQty, unit)} / ${qty(qualifiedQty, unit)}`,
      summary: packedQty > 0
        ? packedQty < qualifiedQty
          ? `已包装 ${qty(packedQty, unit)}，剩余 ${qty(qualifiedQty - packedQty, unit)}`
          : `已包装 ${qty(packedQty, unit)}`
        : '',
      suppressNextStep: false,
    };
  }

  if (/INBOUND-SAMPLING|入库检/.test(identity) && packedQty > 0) {
    const waitingForMorePackages = releasedInboundQty >= packedQty && packedQty < qualifiedQty;
    return {
      status: waitingForMorePackages ? '等待后续包装' : releasedInboundQty >= packedQty ? '已完成' : releasedInboundQty > 0 ? '部分放行' : '',
      quantity: `${qty(releasedInboundQty, unit)} / ${qty(packedQty, unit)}`,
      summary: waitingForMorePackages
        ? `已放行 ${qty(releasedInboundQty, unit)}，等待后续包装后再次检验`
        : releasedInboundQty > 0
          ? `已放行 ${qty(releasedInboundQty, unit)}`
          : '',
      suppressNextStep: waitingForMorePackages,
    };
  }

  if (/FINISHED-INBOUND|完工入库/.test(identity) && releasedInboundQty > 0) {
    const waitingForMoreRelease = inboundQty >= releasedInboundQty && inboundQty < qualifiedQty;
    return {
      status: waitingForMoreRelease ? '等待后续放行' : inboundQty >= releasedInboundQty ? '已完成' : inboundQty > 0 ? '部分入库' : '',
      quantity: `${qty(inboundQty, unit)} / ${qty(releasedInboundQty, unit)}`,
      summary: waitingForMoreRelease
        ? `已入库 ${qty(inboundQty, unit)}，等待后续入库检放行`
        : inboundQty > 0
          ? `已入库 ${qty(inboundQty, unit)}`
          : '',
      suppressNextStep: waitingForMoreRelease,
    };
  }

  return { status: '', quantity: '', summary: '', suppressNextStep: false };
}

function executionCardStageLabel(card: AnyRecord) {
  const status = text(card.status, '');
  const node = text(card.node, '');
  const inboundStatus = text(card.inboundStatus, '');
  if (/异常|返工|暂停/.test(`${status}${node}`)) return '异常/返工';
  if (status === '已完成' || node === '已入库') return '已完成';
  if (status === '待仓库' || /待入库|完工入库/.test(`${node}${inboundStatus}`)) return '待仓库';
  if (
    qualityTasksForExecutionCard(card.code).some((task) => productionQualityTaskIsPending(task as unknown as AnyRecord))
    || status === '待质检'
    || /检/.test(node)
  ) return '待质检';
  const operationJob = executionCardCurrentOperationJob(card);
  if (operationJob && ['可开工', '队列中', '待开工'].includes(operationJob.status)) return '待开工';
  if (operationJob && ['暂停', '异常'].includes(operationJob.status)) return '异常/返工';
  if (operationJob?.status === '执行中') return '生产中';
  if (/待包装|包装确认/.test(node)) return '待包装';
  if (/待领料|领料/.test(node)) return '待领料';
  if (/待开机|开机/.test(node)) return '待开工';
  return '生产中';
}

function workOrderExecutionStageBuckets(workOrderCode: unknown) {
  const counts = new Map<string, number>();
  workOrderExecutionCards(workOrderCode).forEach((card) => {
    const label = executionCardStageLabel(card as unknown as AnyRecord);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const order = ['异常/返工', '待质检', '待包装', '待仓库', '待领料', '待开工', '生产中', '已完成'];
  return order
    .filter((label) => counts.has(label))
    .map((label) => ({ label, count: counts.get(label) || 0 }));
}

function workOrderExecutionStageSummary(workOrderCode: unknown, fallback: unknown = '-') {
  const buckets = workOrderExecutionStageBuckets(workOrderCode);
  if (!buckets.length) return productionDisplayTerm(text(fallback, '待生成生产批次'));
  if (buckets.length === 1) return `${buckets[0].label} · ${buckets[0].count} 个批次`;
  return buckets.map((item) => `${item.label} ${item.count}`).join(' · ');
}

function executionCardQuantityChain(card: AnyRecord) {
  const planQty = toNumber(card.planQty);
  const reportedQty = toNumber(card.reportedQty);
  const qualifiedQty = toNumber(card.qualifiedQty);
  const defectQty = toNumber(card.defectQty);
  const packedQty = toNumber(card.packedQty);
  const inboundHoldQty = toNumber(card.inboundHoldQty);
  const releasedInboundQty = toNumber(card.releasedInboundQty);
  const inboundQty = toNumber(card.inboundQty);
  return {
    planQty,
    reportedQty,
    pendingReportQty: Math.max(0, planQty - reportedQty),
    pendingQualityQty: Math.max(0, reportedQty - qualifiedQty - defectQty),
    qualifiedQty,
    defectQty,
    packedQty,
    pendingPackagingQty: Math.max(0, qualifiedQty - packedQty),
    inboundScrappedQty: Math.max(0, toNumber(card.inboundScrappedQty)),
    pendingInboundInspectionQty: Math.max(0, packedQty - releasedInboundQty - inboundHoldQty - Math.max(0, toNumber(card.inboundScrappedQty))),
    inboundHoldQty,
    releasedInboundQty,
    pendingInboundQty: Math.max(0, releasedInboundQty - inboundQty),
    inboundQty,
  };
}

function workOrderQuantityChain(workOrderCode: unknown, planQuantity: unknown) {
  const cards = workOrderExecutionCards(workOrderCode);
  const totals = cards.reduce(
    (sum, card) => {
      const chain = executionCardQuantityChain(card as unknown as AnyRecord);
      sum.reportedQty += chain.reportedQty;
      sum.pendingQualityQty += chain.pendingQualityQty;
      sum.qualifiedQty += chain.qualifiedQty;
      sum.defectQty += chain.defectQty;
      sum.packedQty += chain.packedQty;
      sum.pendingPackagingQty += chain.pendingPackagingQty;
      sum.pendingInboundInspectionQty += chain.pendingInboundInspectionQty;
      sum.inboundHoldQty += chain.inboundHoldQty;
      sum.releasedInboundQty += chain.releasedInboundQty;
      sum.inboundScrappedQty += chain.inboundScrappedQty;
      sum.pendingInboundQty += chain.pendingInboundQty;
      sum.inboundQty += chain.inboundQty;
      return sum;
    },
    { reportedQty: 0, pendingQualityQty: 0, qualifiedQty: 0, defectQty: 0, packedQty: 0, pendingPackagingQty: 0, pendingInboundInspectionQty: 0, inboundHoldQty: 0, inboundScrappedQty: 0, releasedInboundQty: 0, pendingInboundQty: 0, inboundQty: 0 },
  );
  const planQty = toNumber(planQuantity);
  return {
    ...totals,
    pendingReportQty: Math.max(0, planQty - totals.reportedQty),
    remainingPlanQty: Math.max(0, planQty - totals.inboundQty),
  };
}

function executionCardQualityProgressSummary(card: AnyRecord) {
  const chain = executionCardQuantityChain(card);
  const unit = text(card.unit, '件');
  const stages: string[] = [];
  if (chain.pendingQualityQty > 0) stages.push(`待报工检 ${qty(chain.pendingQualityQty, unit)}`);
  if (chain.defectQty > 0) stages.push(`${executionCardQualityRemainderStage(card.code)} ${qty(chain.defectQty, unit)}`);
  if (chain.pendingInboundInspectionQty > 0) stages.push(`待入库检 ${qty(chain.pendingInboundInspectionQty, unit)}`);
  if (chain.inboundHoldQty > 0) stages.push(`入库检冻结 ${qty(chain.inboundHoldQty, unit)}`);
  return stages.join(' · ');
}

function workOrderReportedQty(workOrderCode: unknown) {
  return sumNumbers(workOrderExecutionCards(workOrderCode).map((card) => toNumber(card.reportedQty)));
}

function workOrderExecutionCardLines(workOrderCode: unknown): DetailLine[] {
  return workOrderExecutionCards(workOrderCode).map((card) => {
    return {
      title: text(card.code),
      meta: `${text(card.line)} · ${text(card.shift)} · ${text(card.leader)}`,
      status: text(card.status),
      route: `/production/execution-cards/${encodeURIComponent(text(card.code))}`,
      values: [
        { label: '批次数量', value: qty(card.planQty, card.unit) },
        ...(executionCardMaterialDisplayStatus(card as unknown as AnyRecord) !== '已领齐'
          ? [{ label: '物料状态', value: executionCardMaterialDisplayStatus(card as unknown as AnyRecord) }]
          : []),
        { label: '数量进度', value: `报工 ${qty(card.reportedQty, card.unit)} · 合格 ${qty(card.qualifiedQty, card.unit)} · 入库 ${qty(card.inboundQty, card.unit)}` },
        ...(executionCardQualityProgressSummary(card as unknown as AnyRecord)
          ? [{ label: '待处理质量', value: executionCardQualityProgressSummary(card as unknown as AnyRecord) }]
          : []),
        { label: '当前工序', value: text(card.node) },
        { label: '下一步', value: text(card.nextAction) },
      ],
    };
  });
}

function executionCardPendingInboundQty(card: AnyRecord) {
  return executionCardQuantityChain(card).pendingInboundQty;
}

function qualityTasksForExecutionCard(cardCode: unknown) {
  const code = text(cardCode, '');
  if (!code) return [];
  return production2QualityTasks.filter((task) => text(task.sourceCard, '') === code);
}

function productionQualityState(task: AnyRecord) {
  return projectQualityState({
    page: 'production',
    status: text(task.status, ''),
    inspectionConclusion: text(task.result, ''),
    dispositionStage: text(task.dispositionStatus, ''),
    currentAction: text(task.currentAction, ''),
    sourceType: text(task.kind, ''),
    disposition: text(task.disposition, ''),
    productResults: [text(task.result, '')],
  });
}

function productionQualityTaskIsPending(task: AnyRecord) {
  return !isQualityDispositionClosed(productionQualityState(task).dispositionStage);
}

function productionQualityTaskNeedsDisposition(task: AnyRecord) {
  return ['待处置', '返工中', '待复检'].includes(productionQualityState(task).dispositionStage);
}

function productionQualityActionLabel(task: AnyRecord) {
  const dispositionStage = productionQualityState(task).dispositionStage;
  if (dispositionStage === '待复检') return '等待质量复检';
  if (dispositionStage === '返工中') return '质量返工中';
  if (dispositionStage === '待处置') return '等待质量处置';
  const kind = text(task.kind, '质检');
  if (kind.includes('首检')) return '等待首检判定';
  if (kind.includes('报工')) return '等待报工质检';
  if (kind.includes('入库')) return '等待入库抽检';
  return '等待质检判定';
}

function executionCardQualityRemainderStage(cardCode: unknown) {
  const task = qualityTasksForExecutionCard(cardCode).find((item) => {
    const stage = productionQualityState(item as unknown as AnyRecord).dispositionStage;
    return ['待处置', '返工中', '待复检'].includes(stage);
  });
  return task ? productionQualityState(task as unknown as AnyRecord).dispositionStage : '报工不良';
}

function workOrderQualityRemainderGroups(workOrderCode: unknown) {
  const groups = new Map<string, { quantity: number; unit: string }>();
  workOrderExecutionCards(workOrderCode).forEach((card) => {
    const quantity = toNumber(card.defectQty);
    if (quantity <= 0) return;
    const stage = executionCardQualityRemainderStage(card.code);
    const unit = text(card.unit, '件');
    const key = `${stage}|${unit}`;
    const current = groups.get(key) || { quantity: 0, unit };
    current.quantity += quantity;
    groups.set(key, current);
  });
  return [...groups.entries()].map(([key, value]) => ({
    stage: key.split('|')[0],
    quantity: value.quantity,
    unit: value.unit,
  }));
}

function workOrderQualityRemainderSummary(workOrderCode: unknown) {
  const groups = workOrderQualityRemainderGroups(workOrderCode);
  return groups.length
    ? groups.map((item) => `${qty(item.quantity, item.unit)} ${item.stage}`).join(' · ')
    : undefined;
}

function executionCardQualityStageLabel(raw: AnyRecord) {
  const pendingTask = qualityTasksForExecutionCard(raw.code).find((task) => productionQualityTaskIsPending(task as unknown as AnyRecord));
  if (pendingTask) {
    const dispositionStage = productionQualityState(pendingTask as unknown as AnyRecord).dispositionStage;
    if (dispositionStage === '待处置') return '质量待处置';
    if (['返工中', '待复检'].includes(dispositionStage)) return dispositionStage;
    const kind = text(pendingTask.kind, '');
    if (kind.includes('入库')) return '待入库检';
    if (kind.includes('首检')) return '待首检';
    if (kind.includes('半成品')) return '待半成品检';
    if (kind.includes('报工')) return '待报工检';
    return '待质检';
  }
  const pendingWipOperation = executionCardOperationJobs(raw).find((job) => (
    Boolean(job.sourceWipBatchCode)
    && !['已完成', '已取消'].includes(job.status)
  ));
  if (pendingWipOperation && toNumber(raw.reportedQty) <= 0) return '大盘已放行';
  return text(releaseBatchForExecutionCard(raw.code)?.qualityStatus, '未触发');
}

function productionQualityHandoffLabel(task: AnyRecord) {
  const dispositionStage = productionQualityState(task).dispositionStage;
  if (dispositionStage === '待处置') return '等待质量处置';
  if (dispositionStage === '返工中') return '质量返工中';
  if (dispositionStage === '待复检') return '等待质量复检';
  const kind = text(task.kind, '');
  if (kind.includes('入库')) return '等待入库抽检';
  if (kind.includes('首检')) return '等待开机首检';
  if (kind.includes('半成品')) return '等待半成品质检';
  if (kind.includes('报工')) return '等待报工检验';
  return '等待质量判定';
}

function executionCardQualityHandoffFromRaw(raw: AnyRecord) {
  const state = `${text(raw.status, '')} ${text(raw.node, '')}`;
  const nextAction = text(raw.nextAction, '');
  if (/待包装/.test(state)) return '';
  if (/不合格|处置/.test(state) || /处理不合格|等待质量处置/.test(nextAction)) return '等待质量处置';
  if (/复检|重检/.test(state) || /^等待.*(?:复检|重检)/.test(nextAction)) return '等待质量复检';
  if (/入库.*检|待抽检/.test(state)) return '等待入库抽检';
  if (/首检/.test(state)) return '等待开机首检';
  if (/半成品.*检/.test(state)) return '等待半成品质检';
  if (/报工.*检|过程检|待质检/.test(state)) return '等待质量判定';
  return '';
}

function executionCardQualitySummary(raw: AnyRecord) {
  const tasks = qualityTasksForExecutionCard(raw.code);
  const pendingCount = tasks.filter((task) => productionQualityTaskIsPending(task as unknown as AnyRecord)).length;
  if (pendingCount) return `${pendingCount} 项待处理质检`;
  if (tasks.length) return `${tasks.length} 项质检记录`;
  const qualityStatus = executionCardQualityStageLabel(raw);
  if (/已放行|合格|免检/.test(qualityStatus)) return '当前无待处理质检';
  if (qualityStatus === '未触发') return '尚未触发质检';
  return `质检状态：${qualityStatus}`;
}

function qualityTaskLinesForExecutionCard(cardCode: unknown): DetailLine[] {
  return qualityTasksForExecutionCard(cardCode).map((task) => {
    const raw = task as unknown as AnyRecord;
    const qualityState = productionQualityState(raw);
    const dispositionStage = qualityState.dispositionStage;
    const acceptedQty = toNumber(raw.acceptedQty);
    const rejectedQty = toNumber(raw.rejectedQty);
    const quantityConclusion = acceptedQty > 0 || rejectedQty > 0
      ? `合格 ${qty(acceptedQty, raw.unit)} · 不合格 ${qty(rejectedQty, raw.unit)}`
      : '-';
    return {
      title: text(task.code),
      meta: `${text(task.kind)} · ${text(task.inspector)} · ${text(raw.decidedAt, text(task.dueTime))}`,
      status: dispositionStage || text(task.status),
      values: [
        { label: '检验结论', value: qualityState.inspectionConclusion },
        { label: '抽检数量', value: text(task.sampleQty) },
        { label: '数量结论', value: quantityConclusion },
        ...(!isQualityDispositionClosed(dispositionStage)
          ? [{ label: '当前待办', value: qualityState.currentAction }]
          : []),
        { label: '处置记录', value: text(task.disposition) },
      ],
    };
  });
}

function toggleToolbarMenu(menu: ToolbarMenuKey) {
  openToolbarMenu.value = openToolbarMenu.value === menu ? null : menu;
}

function setSortMode(mode: SortMode) {
  sortMode.value = mode;
  openToolbarMenu.value = null;
}

function resetBusinessFilters() {
  draftFilterStatus.value = '';
  draftFilterParty.value = '';
  draftFilterOwner.value = '';
  draftFilterDateStart.value = '';
  draftFilterDateEnd.value = '';
  showToast('已清空筛选条件');
}

function applyAndCloseFilters() {
  openToolbarMenu.value = null;
  showToast('已应用当前筛选条件');
}

function clearListConstraints() {
  searchKeyword.value = '';
  resetBusinessFilters();
  openToolbarMenu.value = null;
}

function handleExportRows() {
  showToast(`已按当前条件导出 ${visibleProductionRows.value.length} 条${activeListTitle.value}`);
  openToolbarMenu.value = null;
}

function taskChildDocumentLocation(page: 'material-requests' | 'work-orders', taskCode: string, documentCode = '') {
  return {
    path: documentCode
      ? `/production/${page}/${encodeURIComponent(documentCode)}`
      : `/production/${page}/new`,
    query: {
      ...(documentCode ? {} : { task: taskCode }),
      returnTo: `/production/tasks/${encodeURIComponent(taskCode)}`,
    },
  };
}

function createMaterialRequestFromTask() {
  const row = currentProductionDocument.value;
  if (!row || activePage.value !== 'tasks') return;
  if (!canWriteProduction.value) {
    showToast(productionReadonlyReason.value, 'error');
    return;
  }
  if (taskMaterialRequestAction.value?.mode === 'view' && taskMaterialRequestAction.value.code) {
    router.push(taskChildDocumentLocation('material-requests', row.code, taskMaterialRequestAction.value.code));
    return;
  }
  if (taskMaterialRequestAction.value?.mode !== 'new') return;
  router.push(taskChildDocumentLocation('material-requests', row.code));
}

function productionTaskRequestPayload(command: ProductionPlanningCommand) {
  const draft = taskDraft.value;
  return {
    command,
    code: draft.code,
    sourceType: draft.sourceType,
    sourceCode: draft.sourceCode,
    sourceLineId: draft.sourceLineId,
    createdAt: draft.createdAt,
    deliveryDate: draft.deliveryDate,
    priority: draft.priority,
    ownerEmployeeCode: draft.ownerEmployeeCode,
    owner: draft.owner,
    supplementaryRequirement: draft.supplementaryRequirement,
    note: draft.note,
    products: draft.products.map((line) => ({
      lineId: line.lineId,
      productCode: line.productCode,
      productName: line.productName,
      model: line.model,
      spec: line.spec,
      demandQty: toNumber(line.demandQty),
      inboundQty: toNumber(line.inboundQty),
      unit: line.unit,
      recipeCode: line.recipeCode,
    })),
    materialNeeds: taskEffectiveMaterialNeeds.value,
  };
}

function productionMaterialRequestPayload(command: ProductionPlanningCommand) {
  const draft = materialRequestDraft.value;
  return {
    command,
    code: draft.code,
    requestType: draft.requestType,
    sourceTaskCode: draft.sourceTaskCode,
    sourceDocument: draft.sourceDocument,
    department: draft.department,
    requesterEmployeeCode: draft.requesterEmployeeCode,
    requester: draft.requester,
    requestDate: draft.requestDate,
    expectedDate: draft.expectedDate,
    linkedPurchaseRequisition: draft.linkedPurchaseRequisition,
    note: draft.note,
    lines: draft.lines.map((line) => ({
      lineId: line.lineId,
      materialCode: line.materialCode,
      materialName: line.materialName,
      model: line.model,
      spec: line.spec,
      requestedQty: toNumber(line.requestedQty),
      availableQty: toNumber(line.availableQty),
      purchaseQty: toNumber(line.purchaseQty),
      taskEstimatedQty: toNumber(line.taskEstimatedQty),
      taskAllocatedQty: toNumber(line.taskAllocatedQty),
      taskAvailableQty: toNumber(line.taskAvailableQty),
      taskPendingCoverageQty: toNumber(line.taskPendingCoverageQty),
      unit: line.unit,
      purpose: line.purpose,
    })),
  };
}

function normalizePersistedProductionTask(record: AnyRecord) {
  return {
    ...record,
    code: text(record.code),
    source: text(record.source || record.sourceCode || record.sourceType, '手工新建'),
    sourceType: text(record.sourceType, '手工新建'),
    sourceCode: text(record.sourceCode, ''),
    sourceLineId: text(record.sourceLineId, ''),
    createdAt: text(record.createdAt, ''),
    deliveryDate: text(record.deliveryDate, ''),
    ownerEmployeeCode: text(record.ownerEmployeeCode, ''),
    owner: text(record.owner, '生产主管'),
    status: text(record.status, '草稿'),
    documentStatus: text(record.documentStatus, '草稿'),
    nextAction: text(record.nextAction || record.nextStep, ''),
    supplementaryRequirement: text(record.supplementaryRequirement || record.internalRemark, ''),
    note: productionTaskBusinessNote(record.note),
    products: toArray<AnyRecord>(record.products),
    materialNeeds: toArray<AnyRecord>(record.materialNeeds),
    revision: toNumber(record.revision),
  } as unknown as Production2Task & AnyRecord;
}

function normalizePersistedMaterialRequest(record: AnyRecord) {
  return {
    ...record,
    code: text(record.code),
    requestType: text(record.requestType, '临时备料'),
    sourceTaskCode: text(record.sourceTaskCode, ''),
    sourceDocument: text(record.sourceDocument, ''),
    department: text(record.department, '生产管理部'),
    requesterEmployeeCode: text(record.requesterEmployeeCode, ''),
    requester: text(record.requester, '生产主管'),
    requestDate: text(record.requestDate, ''),
    expectedDate: text(record.expectedDate, ''),
    status: text(record.status, '草稿'),
    documentStatus: text(record.documentStatus, '草稿'),
    linkedPurchaseRequisition: text(record.linkedPurchaseRequisition, ''),
    note: text(record.note, ''),
    nextAction: text(record.nextAction || record.nextStep, ''),
    lines: toArray<AnyRecord>(record.lines),
    revision: toNumber(record.revision),
  } as unknown as Production2MaterialRequest & AnyRecord;
}

function mergePersistedProductionTasks(records: AnyRecord[]) {
  const persisted = records.map(normalizePersistedProductionTask);
  production2Tasks.splice(0, production2Tasks.length, ...persisted);
  productionDataRevision.value += 1;
}

function upsertPersistedProductionTask(record: AnyRecord) {
  const saved = normalizePersistedProductionTask(record);
  const index = production2Tasks.findIndex((item) => item.code === saved.code);
  if (index >= 0) production2Tasks.splice(index, 1, saved);
  else production2Tasks.unshift(saved);
  productionDataRevision.value += 1;
  return saved;
}

function mergePersistedMaterialRequests(records: AnyRecord[]) {
  const persisted = records.map(normalizePersistedMaterialRequest);
  production2MaterialRequests.splice(0, production2MaterialRequests.length, ...persisted);
  productionDataRevision.value += 1;
}

function productionPlanningIdempotencyKey(
  kind: 'tasks' | 'material-requests',
  command: ProductionPlanningCommand,
  code: string,
  expectedRevision: number,
  payload: AnyRecord,
) {
  const intent = JSON.stringify({
    kind,
    command,
    code: code || 'new',
    expectedRevision,
    payload,
  });
  const existing = productionPlanningIdempotencyKeys.get(intent);
  if (existing) return { intent, key: existing };
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `production-planning:${kind}:${command}:${code || 'new'}:${random}`;
  productionPlanningIdempotencyKeys.set(intent, key);
  return { intent, key };
}

function workOrderIdempotencyKey(action: WorkOrderCommand | 'close', code: string, revision: number, payload: AnyRecord = {}) {
  const intent = JSON.stringify({ action, code: code || 'new', revision, payload });
  const existing = workOrderIdempotencyKeys.get(intent);
  if (existing) return { intent, key: existing };
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `production-work-order:${action}:${code || 'new'}:${random}`;
  workOrderIdempotencyKeys.set(intent, key);
  return { intent, key };
}

async function requestProductionPlanningDocument(
  kind: 'tasks' | 'material-requests',
  command: ProductionPlanningCommand,
  code: string,
  expectedRevision: number,
  payload: AnyRecord,
) {
  const createRecord = isProductionNewDocument.value || expectedRevision <= 0;
  const path = createRecord ? `/production/${kind}` : `/production/${kind}/${encodeURIComponent(code)}`;
  const requestKey = productionPlanningIdempotencyKey(kind, command, code, expectedRevision, payload);
  const response = await fetch(`${apiBase}${path}`, {
    method: createRecord ? 'POST' : 'PUT',
    headers: productionRecipeRequestHeaders(),
    body: JSON.stringify({
      ...payload,
      revision: expectedRevision,
      idempotencyKey: requestKey.key,
    }),
  });
  const body = await response.json().catch(() => ({})) as AnyRecord;
  if (!response.ok || !body.record || typeof body.record !== 'object' || Array.isArray(body.record)) {
    const documentName = kind === 'tasks' ? '生产任务' : '备料申请';
    throw new Error(text(body.error || body.message, `${documentName}${command === 'submit' ? '提交' : '保存'}失败：${response.status}`));
  }
  return {
    record: body.record as AnyRecord,
    items: Array.isArray(body.items) ? body.items as AnyRecord[] : undefined,
    idempotencyIntent: requestKey.intent,
  } satisfies ProductionPlanningApiResponse;
}

async function persistProductionTask(command: ProductionPlanningCommand) {
  if (taskSaving.value) return;
  if (command === 'submit' && !validateTaskDraft()) return;
  taskSaving.value = true;
  try {
    const localRecord = production2Tasks.find((item) => item.code === taskDraft.value.code) as AnyRecord | undefined;
    const response = await requestProductionPlanningDocument(
      'tasks',
      command,
      taskDraft.value.code,
      toNumber(localRecord?.revision),
      productionTaskRequestPayload(command),
    );
    mergePersistedProductionTasks(response.items || [response.record]);
    const saved = normalizePersistedProductionTask(response.record);
    taskDraft.value = taskDraftFromRow(taskRow(saved as AnyRecord, 0));
    productionValidationAttempted.value = false;
    await nextTick();
    resetUnsavedChanges();
    await router.replace(`/production/tasks/${encodeURIComponent(saved.code)}`);
    productionPlanningIdempotencyKeys.delete(response.idempotencyIntent);
    showToast(`${saved.code} 已${command === 'submit' ? '提交' : '保存'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `生产任务${command === 'submit' ? '提交' : '保存'}失败`, 'error');
  } finally {
    taskSaving.value = false;
  }
}

async function persistProductionMaterialRequest(command: ProductionPlanningCommand) {
  if (materialRequestSaving.value) return;
  if (command === 'submit' && !validateMaterialRequestDraft()) return;
  materialRequestSaving.value = true;
  try {
    const localRecord = production2MaterialRequests.find((item) => item.code === materialRequestDraft.value.code) as AnyRecord | undefined;
    const response = await requestProductionPlanningDocument(
      'material-requests',
      command,
      materialRequestDraft.value.code,
      toNumber(localRecord?.revision),
      productionMaterialRequestPayload(command),
    );
    mergePersistedMaterialRequests(response.items || [response.record]);
    const saved = normalizePersistedMaterialRequest(response.record);
    materialRequestDraft.value = materialRequestDraftFromRow(materialRequestRow(saved as AnyRecord));
    productionValidationAttempted.value = false;
    await nextTick();
    resetUnsavedChanges();
    await router.replace(`/production/material-requests/${encodeURIComponent(saved.code)}`);
    productionPlanningIdempotencyKeys.delete(response.idempotencyIntent);
    const submittedResult = saved.linkedPurchaseRequisition
      ? `已提交，库存缺口已自动转采购需求 ${saved.linkedPurchaseRequisition}`
      : '已提交，当前库存可覆盖';
    showToast(`${saved.code} ${command === 'submit' ? submittedResult : '已保存'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `备料申请${command === 'submit' ? '提交' : '保存'}失败`, 'error');
  } finally {
    materialRequestSaving.value = false;
  }
}

function workOrderProcessTemplateSnapshotPayload(template: AnyRecord | undefined) {
  if (!template) return undefined;
  const stepCodes = toArray<string>(template.stepCodes);
  const sourceZones = toArray<AnyRecord>(template.temperatureZones);
  const sourceByName = new Map(sourceZones.map((zone) => [text(zone.name, ''), zone]));
  return {
    ...template,
    temperatureZones: defaultProcessTemplateZones().map((zone) => {
      const source = sourceByName.get(zone.name);
      return {
        name: zone.name,
        value: processTemplateTemperatureInputValue(source?.value),
        tolerance: text(source?.tolerance, text(template.temperatureTolerance, '')),
      };
    }),
    stepInstructions: stepCodes.map((stepCode) => ({
      stepCode,
      ...processTemplateStepWorkDefaults(stepCode, text(template.routeType)),
    })),
  };
}

function workOrderRequestPayload(command: WorkOrderCommand) {
  const draft = workOrderDraft.value;
  const primaryDemand = draft.sourceAllocations[0];
  return {
    code: draft.code,
    sourceTask: draft.taskCode,
    sourceDocument: primaryDemand?.sourceDocument || '',
    sourceLineId: draft.sourceLineId,
    sourceAllocations: draft.sourceAllocations.map((allocation) => ({
      ...allocation,
      quantity: toNumber(allocation.quantity),
    })),
    productCode: draft.productCode,
    productName: draft.productName,
    planQty: toNumber(draft.planQty),
    unit: draft.unit,
    recipeCode: draft.recipeCode,
    processTemplateCode: draft.processTemplateCode,
    note: draft.note,
    materialNeeds: buildWorkOrderMaterialNeeds(draft.planQty, workOrderSelectedRecipe.value, draft.materialNeeds),
    command,
    ...(command === 'submit'
      ? {
          snapshot: {
            sourceLine: primaryDemand ? workOrderDemandLineForAllocation(primaryDemand) : undefined,
            sourceLines: draft.sourceAllocations,
            recipe: workOrderSelectedRecipe.value,
            processTemplate: workOrderProcessTemplateSnapshotPayload(workOrderSelectedProcessTemplate.value),
            processSteps: toArray<string>(workOrderSelectedProcessTemplate.value?.stepCodes)
              .map((code) => production2ProcessSteps.find((step) => step.code === code))
              .filter(Boolean),
          },
        }
      : {}),
  };
}

function normalizeWorkOrderRecord(record: Production2WorkOrder & Record<string, unknown>) {
  return {
    ...record,
    taskCode: text(record.taskCode || record.sourceTask, ''),
    sourceLineId: text(record.sourceLineId, ''),
    completedQty: toNumber(record.completedQty),
    inboundQty: toNumber(record.inboundQty),
    plannedDate: text(record.plannedDate, text(record.dueDate, '')),
    ownerEmployeeCode: text(record.ownerEmployeeCode, ''),
    note: text(record.note, ''),
    documentStatus: text(record.documentStatus, ''),
    revision: toNumber(record.revision),
    materialNeeds: Array.isArray(record.materialNeeds) ? record.materialNeeds : [],
    linePlans: Array.isArray(record.linePlans) ? record.linePlans : [],
    sourceAllocations: Array.isArray(record.sourceAllocations) ? record.sourceAllocations : [],
    nextAction: text(record.nextAction || record.nextStep, ''),
  } as Production2WorkOrder & Record<string, unknown>;
}

function updateLocalWorkOrders(response: WorkOrderApiResponse) {
  const savedRecord = normalizeWorkOrderRecord(response.record);
  if (response.items) {
    const items = response.items.map(normalizeWorkOrderRecord);
    const savedIndex = items.findIndex((item) => item.code === savedRecord.code);
    if (savedIndex >= 0) items.splice(savedIndex, 1, savedRecord);
    else items.push(savedRecord);
    production2WorkOrders.splice(0, production2WorkOrders.length, ...items);
    productionDataRevision.value += 1;
    return savedRecord;
  }

  const existingIndex = production2WorkOrders.findIndex((item) => item.code === savedRecord.code);
  if (existingIndex >= 0) production2WorkOrders.splice(existingIndex, 1, savedRecord);
  else production2WorkOrders.unshift(savedRecord);
  productionDataRevision.value += 1;
  return savedRecord;
}

async function requestWorkOrder(command: WorkOrderCommand) {
  const isNew = isProductionNewDocument.value;
  const code = productionDocumentCode.value || workOrderDraft.value.code;
  const localRecord = production2WorkOrders.find((item) => item.code === code) as (Production2WorkOrder & Record<string, unknown>) | undefined;
  const isPersisted = toNumber(localRecord?.revision) > 0;
  const createRecord = isNew || !isPersisted;
  const path = createRecord
    ? '/production/work-orders'
    : `/production/work-orders/${encodeURIComponent(code)}`;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const sessionToken = getStoredSessionToken();
  const currentAccount = window.localStorage.getItem('filatrix-current-account') || '';
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);

  const requestPayload = workOrderRequestPayload(command);
  const expectedRevision = toNumber(localRecord?.revision);
  const requestKey = workOrderIdempotencyKey(command, code, expectedRevision, requestPayload);
  const response = await fetch(`${apiBase}${path}`, {
    method: createRecord ? 'POST' : 'PUT',
    headers,
    body: JSON.stringify({
      ...requestPayload,
      revision: expectedRevision,
      idempotencyKey: requestKey.key,
    }),
  });
  const payload = await response.json().catch(() => ({})) as AnyRecord;
  if (!response.ok) {
    const message = typeof payload.error === 'string'
      ? payload.error
      : typeof payload.message === 'string'
        ? payload.message
        : `生产工单${command === 'submit' ? '提交' : '保存'}失败：${response.status}`;
    throw new Error(message);
  }
  if (!payload.record || typeof payload.record !== 'object' || Array.isArray(payload.record)) {
    throw new Error('生产工单接口未返回有效记录');
  }

  return {
    record: payload.record as Production2WorkOrder & Record<string, unknown>,
    items: Array.isArray(payload.items)
      ? payload.items.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Array<Production2WorkOrder & Record<string, unknown>>
      : undefined,
    idempotencyIntent: requestKey.intent,
  } satisfies WorkOrderApiResponse;
}

async function loadPersistedWorkOrders() {
  productionRuntimeDataLoading.value = true;
  productionRuntimeDataError.value = '';
  if (!productionRuntimeDataHasSnapshot.value) {
    production2Tasks.splice(0, production2Tasks.length);
    production2MaterialRequests.splice(0, production2MaterialRequests.length);
    production2WorkOrders.splice(0, production2WorkOrders.length);
    production2ExecutionCards.splice(0, production2ExecutionCards.length);
    production2ReleaseBatches.splice(0, production2ReleaseBatches.length);
    productionDataRevision.value += 1;
  }
  const headers = new Headers();
  const sessionToken = getStoredSessionToken();
  const currentAccount = window.localStorage.getItem('filatrix-current-account') || '';
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);
  try {
    const response = await fetch(`${apiBase}/production/work-orders`, { headers });
    if (!response.ok) throw new Error(`生产运行数据加载失败：${response.status}`);
    const payload = await response.json() as {
      items?: Array<Production2WorkOrder & Record<string, unknown>>;
      tasks?: AnyRecord[];
      materialRequests?: AnyRecord[];
      executionCards?: Production2ExecutionCard[];
      releaseBatches?: Production2ReleaseBatch[];
      qualityTasks?: Production2QualityTask[];
    };
    if (!Array.isArray(payload.items)) throw new Error('生产运行接口未返回有效列表');
    if (!Array.isArray(payload.tasks)) throw new Error('生产运行接口未返回有效任务列表');
    if (!Array.isArray(payload.materialRequests)) throw new Error('生产运行接口未返回有效备料申请列表');
    mergePersistedProductionTasks(payload.tasks);
    mergePersistedMaterialRequests(payload.materialRequests);
    const persisted = payload.items.map(normalizeWorkOrderRecord);
    production2WorkOrders.splice(0, production2WorkOrders.length, ...persisted);
    productionDataRevision.value += 1;
    const runtimeCards = Array.isArray(payload.executionCards) ? payload.executionCards : [];
    production2ExecutionCards.splice(0, production2ExecutionCards.length, ...runtimeCards);
    const runtimeReleases = Array.isArray(payload.releaseBatches) ? payload.releaseBatches : [];
    production2ReleaseBatches.splice(0, production2ReleaseBatches.length, ...runtimeReleases);
    const runtimeQualityTasks = Array.isArray(payload.qualityTasks) ? payload.qualityTasks : [];
    production2QualityTasks.splice(0, production2QualityTasks.length, ...runtimeQualityTasks);
    qualityTaskRuntimeHasSnapshot.value = true;
    qualityTaskRuntimeLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
    productionRuntimeDataHasSnapshot.value = true;
    productionRuntimeDataLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
    productionDataRevision.value += 1;
  } catch (error) {
    productionRuntimeDataError.value = error instanceof Error ? error.message : '生产运行数据加载失败';
  } finally {
    productionRuntimeDataLoading.value = false;
  }
}

async function retryProductionRuntimeData() {
  if (activePage.value === 'recipes') await loadPersistedRecipes();
  else if (activePage.value === 'process-templates') await loadPersistedProcessTemplates();
  else if (activePage.value === 'exceptions') await loadRuntimeProductionExceptions();
  else if (activePage.value === 'loss-ledger') await loadRuntimeProductionLossRecords();
  else if (activePage.value === 'quality') await loadRuntimeProductionQualityTasks();
  else if (activePage.value === 'tasks') await Promise.all([loadPersistedWorkOrders(), loadPersistedRecipes()]);
  else await loadPersistedWorkOrders();
  if (['tasks', 'material-requests', 'work-orders'].includes(activePage.value)) {
    await loadProductionInventoryFacts();
  }
  const code = productionDocumentCode.value;
  if (!code) return;
  if (activePage.value === 'work-orders') await loadPersistedWorkOrderDetail(code);
  if (activePage.value === 'execution-cards') await loadPersistedExecutionCardDetail(code);
  if (activePage.value === 'recipes') await loadPersistedRecipeDetail(code);
  if (activePage.value === 'process-templates') await loadPersistedProcessTemplateDetail(code);
}

async function loadPersistedWorkOrderDetail(code: string) {
  if (!code) return;
  const headers = new Headers();
  const sessionToken = getStoredSessionToken();
  const currentAccount = window.localStorage.getItem('filatrix-current-account') || '';
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);
  try {
    const response = await fetch(`${apiBase}/production/work-orders/${encodeURIComponent(code)}`, { headers });
    if (!response.ok) throw new Error(response.status === 404 ? `生产工单 ${code} 不存在` : `生产工单加载失败：${response.status}`);
    const payload = await response.json() as WorkOrderApiResponse;
    if (!payload.record) return;
    updateLocalWorkOrders({ record: payload.record });
    if (Array.isArray(payload.releaseBatches)) replaceWorkOrderReleaseBatches(code, payload.releaseBatches);
    if (Array.isArray(payload.executionCards)) {
      const otherCards = production2ExecutionCards.filter((card) => card.workOrderCode !== code);
      production2ExecutionCards.splice(0, production2ExecutionCards.length, ...payload.executionCards, ...otherCards);
      productionDataRevision.value += 1;
    }
  } catch (error) {
    if (activePage.value === 'work-orders' && productionDocumentCode.value === code) {
      productionRuntimeDataError.value = error instanceof Error ? error.message : `生产工单 ${code} 加载失败`;
    }
  }
}

function upsertExecutionCardRecord(card: Production2ExecutionCard) {
  const index = production2ExecutionCards.findIndex((item) => item.code === card.code);
  if (index >= 0) production2ExecutionCards.splice(index, 1, card);
  else production2ExecutionCards.unshift(card);
  productionDataRevision.value += 1;
}

function upsertProductionExceptionRecord(exception: Production2Exception) {
  const index = production2Exceptions.findIndex((item) => item.code === exception.code);
  if (index >= 0) production2Exceptions.splice(index, 1, exception);
  else production2Exceptions.unshift(exception);
  productionExceptionRevision.value += 1;
  productionDataRevision.value += 1;
}

async function loadRuntimeProductionExceptions() {
  exceptionRuntimeLoading.value = true;
  exceptionRuntimeError.value = '';
  if (!exceptionRuntimeHasSnapshot.value) {
    production2Exceptions.splice(0, production2Exceptions.length);
    productionExceptionRevision.value += 1;
  }
  try {
    const runtimeExceptions = await listProductionExceptions();
    production2Exceptions.splice(0, production2Exceptions.length, ...runtimeExceptions);
    exceptionRuntimeHasSnapshot.value = true;
    exceptionRuntimeLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
    productionExceptionRevision.value += 1;
  } catch (error) {
    exceptionRuntimeError.value = error instanceof Error ? error.message : '生产异常数据加载失败';
  } finally {
    exceptionRuntimeLoading.value = false;
  }
}

async function loadRuntimeProductionLossRecords() {
  lossRuntimeLoading.value = true;
  lossRuntimeError.value = '';
  if (!lossRuntimeHasSnapshot.value) {
    production2LossRecords.splice(0, production2LossRecords.length);
    productionDataRevision.value += 1;
  }
  try {
    const runtimeLossRecords = await listProductionLossRecords();
    production2LossRecords.splice(0, production2LossRecords.length, ...runtimeLossRecords);
    lossRuntimeHasSnapshot.value = true;
    lossRuntimeLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
    productionDataRevision.value += 1;
  } catch (error) {
    lossRuntimeError.value = error instanceof Error ? error.message : '损耗台账加载失败';
  } finally {
    lossRuntimeLoading.value = false;
  }
}

async function loadRuntimeProductionQualityTasks() {
  qualityTaskRuntimeLoading.value = true;
  qualityTaskRuntimeError.value = '';
  if (!qualityTaskRuntimeHasSnapshot.value) production2QualityTasks.splice(0, production2QualityTasks.length);
  try {
    const runtimeQualityTasks = await listProductionQualityTasks();
    production2QualityTasks.splice(0, production2QualityTasks.length, ...runtimeQualityTasks);
    qualityTaskRuntimeHasSnapshot.value = true;
    qualityTaskRuntimeLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
    productionDataRevision.value += 1;
  } catch (error) {
    qualityTaskRuntimeError.value = error instanceof Error ? error.message : '生产质检数据加载失败';
  } finally {
    qualityTaskRuntimeLoading.value = false;
  }
}

async function loadPersistedProductionExceptionDetail(code: string) {
  if (!code) return;
  exceptionFlowRecords.value = [];
  try {
    const response = await getProductionException(code);
    upsertProductionExceptionRecord(response.record);
    exceptionFlowRecords.value = toArray<FlowRecord>(response.flowRecords);
    if (response.qualityTask?.code) {
      const taskIndex = production2QualityTasks.findIndex((item) => item.code === response.qualityTask?.code);
      if (taskIndex >= 0) production2QualityTasks.splice(taskIndex, 1, response.qualityTask);
      else production2QualityTasks.unshift(response.qualityTask);
      productionDataRevision.value += 1;
    }
    if (response.executionCard) upsertExecutionCardRecord(response.executionCard);
    if (response.task?.code) upsertPersistedProductionTask(response.task as unknown as AnyRecord);
    if (response.release?.code) {
      const release = response.release as unknown as Production2ReleaseBatch;
      const releaseIndex = production2ReleaseBatches.findIndex((item) => item.code === release.code);
      if (releaseIndex >= 0) production2ReleaseBatches.splice(releaseIndex, 1, release);
      else production2ReleaseBatches.unshift(release);
    }
    if (response.workOrder?.code) updateLocalWorkOrders({ record: response.workOrder as Production2WorkOrder & Record<string, unknown> });
  } catch (error) {
    exceptionRuntimeError.value = error instanceof Error ? error.message : `生产异常 ${code} 加载失败`;
  }
}

async function loadPersistedExecutionCardDetail(code: string) {
  if (!code) return;
  runtimeExecutionCardDetailLoaded.value = false;
  runtimeProductionIssues.value = [];
  runtimeProductionReturns.value = [];
  runtimeProductionReceipts.value = [];
  try {
    const [response, issueRows, returnRows] = await Promise.all([
      getProductionExecutionCard(code),
      listProductionMaterialIssues().catch(() => []),
      listProductionReturns().catch(() => []),
    ]);
    upsertExecutionCardRecord(response.record);
    if (response.release?.code) {
      const persistedRelease = response.release as unknown as Production2ReleaseBatch;
      const releaseIndex = production2ReleaseBatches.findIndex((item) => item.code === persistedRelease.code);
      if (releaseIndex >= 0) production2ReleaseBatches.splice(releaseIndex, 1, persistedRelease);
      else production2ReleaseBatches.unshift(persistedRelease);
    }
    if (response.workOrder?.code) updateLocalWorkOrders({ record: response.workOrder as Production2WorkOrder & Record<string, unknown> });
    if (Array.isArray(response.qualityTasks)) {
      response.qualityTasks.forEach((task) => {
        const taskIndex = production2QualityTasks.findIndex((item) => item.code === task.code);
        if (taskIndex >= 0) production2QualityTasks.splice(taskIndex, 1, task);
        else production2QualityTasks.unshift(task);
      });
    }
    runtimeProductionIssues.value = response.productionIssues || issueRows as AnyRecord[];
    runtimeProductionReturns.value = response.productionReturns || returnRows as AnyRecord[];
    runtimeProductionReceipts.value = response.productionReceipts || [];
    runtimeExecutionCardDetailLoaded.value = true;
  } catch (error) {
    if (activePage.value === 'execution-cards' && productionDocumentCode.value === code) {
      productionRuntimeDataError.value = error instanceof Error ? error.message : `生产批次 ${code} 加载失败`;
    }
  }
}

function productionRecipeRequestHeaders() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const sessionToken = getStoredSessionToken();
  const currentAccount = window.localStorage.getItem('filatrix-current-account') || '';
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  else if (currentAccount) headers.set('X-Filatrix-Account', currentAccount);
  return headers;
}

function normalizePersistedRecipe(record: AnyRecord) {
  return {
    ...record,
    code: text(record.code),
    name: text(record.name),
    productCode: text(record.productCode),
    productName: text(record.productName),
    version: text(record.version, 'v1'),
    productUnitWeightKg: toNumber(record.productUnitWeightKg),
    outputUnit: text(record.outputUnit, '件'),
    status: text(record.status, '草稿') as Production2Recipe['status'],
    materials: toArray<AnyRecord>(record.materials).map((line) => ({
      materialCode: text(line.materialCode),
      materialName: text(line.materialName),
      usageMode: text(line.usageMode) === 'fixed' ? 'fixed' as const : 'percent' as const,
      percent: toNumber(line.percent),
      perUnitQty: toNumber(line.perUnitQty),
      unit: text(line.unit),
      incomingQcRequired: Boolean(line.incomingQcRequired),
    })),
    estimatedLosses: toArray<AnyRecord>(record.estimatedLosses).map((line) => ({
      materialCode: text(line.materialCode),
      materialName: text(line.materialName),
      fixedLossQty: toNumber(line.fixedLossQty),
      lossRatePercent: toNumber(line.lossRatePercent),
      unit: text(line.unit),
    })),
    note: text(record.note, ''),
    owner: text(record.owner, '工艺工程'),
    updatedAt: text(record.updatedAt),
  } as Production2Recipe & AnyRecord;
}

function mergePersistedRecipes(records: AnyRecord[]) {
  const persisted = records.map(normalizePersistedRecipe);
  production2Recipes.splice(0, production2Recipes.length, ...persisted);
  productionDataRevision.value += 1;
}

function upsertPersistedRecipe(record: AnyRecord) {
  const persisted = normalizePersistedRecipe(record);
  const index = production2Recipes.findIndex((item) => item.code === persisted.code);
  if (index >= 0) production2Recipes.splice(index, 1, persisted);
  else production2Recipes.unshift(persisted);
  productionDataRevision.value += 1;
  return persisted;
}

async function loadPersistedRecipes() {
  recipeRuntimeLoading.value = true;
  recipeRuntimeError.value = '';
  if (!recipeRuntimeHasSnapshot.value) {
    production2Recipes.splice(0, production2Recipes.length);
    productionDataRevision.value += 1;
  }
  try {
    const response = await fetch(`${apiBase}/production/recipes`, { headers: productionRecipeRequestHeaders() });
    if (!response.ok) throw new Error(`生产配方加载失败：${response.status}`);
    const payload = await response.json() as { items?: AnyRecord[] };
    if (!Array.isArray(payload.items)) throw new Error('生产配方接口未返回有效列表');
    mergePersistedRecipes(payload.items);
    recipeRuntimeHasSnapshot.value = true;
    recipeRuntimeLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
  } catch (error) {
    recipeRuntimeError.value = error instanceof Error ? error.message : '生产配方加载失败';
  } finally {
    recipeRuntimeLoading.value = false;
  }
}

async function loadPersistedRecipeDetail(code: string) {
  const requestId = ++recipeDetailLoadRequestId;
  recipeDetailLoading.value = true;
  recipeDetailError.value = '';
  recipeDetailLoadedCode.value = '';
  recipeDetailRecord.value = null;
  try {
    const response = await fetch(`${apiBase}/production/recipes/${encodeURIComponent(code)}`, { headers: productionRecipeRequestHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as AnyRecord;
      throw new Error(text(body.error || body.message, response.status === 404 ? `生产配方 ${code} 不存在` : `生产配方加载失败：${response.status}`));
    }
    const payload = await response.json() as { record?: AnyRecord; flowRecords?: AnyRecord[] };
    if (!payload.record) throw new Error('生产配方接口未返回有效记录');
    if (requestId !== recipeDetailLoadRequestId) return;
    const saved = upsertPersistedRecipe(payload.record);
    recipeDetailLoadedCode.value = code;
    recipeDetailRecord.value = saved;
    if (activePage.value !== 'recipes' || productionDocumentCode.value !== code) return;
    recipeDraft.value = recipeDraftFromRow(recipeRow(saved as AnyRecord, 0));
    recipeFlowRecords.value = toArray<FlowRecord>(payload.flowRecords);
    productionValidationAttempted.value = false;
    productionDraftHydrated.value = true;
    await nextTick();
    resetUnsavedChanges();
  } catch (error) {
    if (requestId !== recipeDetailLoadRequestId) return;
    recipeDetailError.value = error instanceof Error ? error.message : `生产配方 ${code} 加载失败`;
  } finally {
    if (requestId === recipeDetailLoadRequestId) recipeDetailLoading.value = false;
  }
}

function normalizePersistedProcessTemplate(record: AnyRecord) {
  const stepCodes = toArray<string>(record.stepCodes).map((code) => text(code)).filter(Boolean);
  return {
    ...record,
    code: text(record.code),
    sourceProcessTemplateCode: optionalDocumentCode(record.sourceProcessTemplateCode),
    name: text(record.name),
    routeType: text(record.routeType, stepCodes.includes('P2-STEP-WIP-REPORT-LARGE-REEL') ? '大盘复绕' : '直接收卷') as Production2ProcessTemplate['routeType'],
    productFamily: text(record.productFamily),
    lineTypes: schedulableProcessLineTypes(record.lineTypes),
    version: text(record.version, 'v1'),
    status: text(record.status, '草稿') as Production2ProcessTemplate['status'],
    stepCodes,
    temperatureTolerance: text(record.temperatureTolerance),
    temperatureZones: toArray<AnyRecord>(record.temperatureZones).map((zone) => ({
      name: text(zone.name),
      value: text(zone.value).replace(/℃/g, ''),
      tolerance: text(zone.tolerance, text(record.temperatureTolerance)),
    })),
    stepInstructions: toArray<AnyRecord>(record.stepInstructions),
    owner: text(record.owner, '工艺工程'),
    updatedAt: text(record.updatedAt),
    revision: toNumber(record.revision),
  } as Production2ProcessTemplate & AnyRecord;
}

function mergePersistedProcessTemplates(records: AnyRecord[]) {
  const persisted = records.map(normalizePersistedProcessTemplate);
  production2ProcessTemplates.splice(0, production2ProcessTemplates.length, ...persisted);
  productionDataRevision.value += 1;
}

function upsertPersistedProcessTemplate(record: AnyRecord) {
  const persisted = normalizePersistedProcessTemplate(record);
  const index = production2ProcessTemplates.findIndex((item) => item.code === persisted.code);
  if (index >= 0) production2ProcessTemplates.splice(index, 1, persisted);
  else production2ProcessTemplates.unshift(persisted);
  productionDataRevision.value += 1;
  return persisted;
}

async function loadPersistedProcessTemplates() {
  processTemplateRuntimeLoading.value = true;
  processTemplateRuntimeError.value = '';
  if (!processTemplateRuntimeHasSnapshot.value) {
    production2ProcessTemplates.splice(0, production2ProcessTemplates.length);
    productionDataRevision.value += 1;
  }
  try {
    const response = await fetch(`${apiBase}/production/process-templates`, { headers: productionRecipeRequestHeaders() });
    if (!response.ok) throw new Error(`生产工艺加载失败：${response.status}`);
    const payload = await response.json() as { items?: AnyRecord[] };
    if (!Array.isArray(payload.items)) throw new Error('生产工艺接口未返回有效列表');
    mergePersistedProcessTemplates(payload.items);
    processTemplateRuntimeHasSnapshot.value = true;
    processTemplateRuntimeLoadedAt.value = new Date().toLocaleString('zh-CN', { hour12: false });
  } catch (error) {
    processTemplateRuntimeError.value = error instanceof Error ? error.message : '生产工艺加载失败';
  } finally {
    processTemplateRuntimeLoading.value = false;
  }
}

async function loadPersistedProcessTemplateDetail(code: string) {
  const requestId = ++processTemplateDetailLoadRequestId;
  processTemplateDetailLoading.value = true;
  processTemplateDetailError.value = '';
  processTemplateDetailLoadedCode.value = '';
  processTemplateDetailRecord.value = null;
  try {
    const response = await fetch(`${apiBase}/production/process-templates/${encodeURIComponent(code)}`, {
      headers: productionRecipeRequestHeaders(),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as AnyRecord;
      throw new Error(text(body.error || body.message, response.status === 404 ? `生产工艺 ${code} 不存在` : `生产工艺加载失败：${response.status}`));
    }
    const payload = await response.json() as { record?: AnyRecord; flowRecords?: FlowRecord[] };
    if (!payload.record) throw new Error('生产工艺接口未返回有效记录');
    if (requestId !== processTemplateDetailLoadRequestId) return;
    const saved = upsertPersistedProcessTemplate(payload.record);
    processTemplateDetailLoadedCode.value = code;
    processTemplateDetailRecord.value = saved;
    if (activePage.value !== 'process-templates' || productionDocumentCode.value !== code) return;
    processTemplateDraft.value = processTemplateDraftFromRow(processTemplateRow(saved as AnyRecord));
    processTemplateFlowRecords.value = toArray<FlowRecord>(payload.flowRecords);
    productionValidationAttempted.value = false;
    productionDraftHydrated.value = true;
    await nextTick();
    resetUnsavedChanges();
  } catch (error) {
    if (requestId !== processTemplateDetailLoadRequestId) return;
    processTemplateDetailError.value = error instanceof Error ? error.message : `生产工艺 ${code} 加载失败`;
  } finally {
    if (requestId === processTemplateDetailLoadRequestId) processTemplateDetailLoading.value = false;
  }
}

onMounted(() => {
  void (async () => {
    await loadPersistedWorkOrders();
    const auxiliaryLoads = [
      loadPersistedRecipes(),
      loadPersistedProcessTemplates(),
      loadRuntimeProductionExceptions(),
    ];
    if (activePage.value === 'quality') auxiliaryLoads.push(loadRuntimeProductionQualityTasks());
    await Promise.all(auxiliaryLoads);
  })();
});

watch(
  () => [activePage.value, productionDocumentCode.value] as const,
  ([page, code]) => {
    if (page === 'work-orders' && code) void loadPersistedWorkOrderDetail(code);
    if (page === 'execution-cards' && code) void loadPersistedExecutionCardDetail(code);
    if (page === 'exceptions' && code) void loadPersistedProductionExceptionDetail(code);
    if (page === 'recipes' && code) void loadPersistedRecipeDetail(code);
    if (page === 'process-templates' && code) void loadPersistedProcessTemplateDetail(code);
    if (page !== 'recipes' || !code) recipeFlowRecords.value = [];
    if (page !== 'process-templates' || !code) processTemplateFlowRecords.value = [];
    if (page !== 'exceptions' || !code) exceptionFlowRecords.value = [];
  },
  { immediate: true },
);

watch(
  () => [activePage.value, currentProductionDocument.value?.code, String(route.query.action || '')] as const,
  ([page, code, action]) => {
    if (page !== 'execution-cards' || !code || action !== 'packaging' || packagingDialogOpen.value) return;
    const row = currentProductionDocument.value;
    if (!row) return;
    openExecutionCardPackaging(row.raw);
    const query = { ...route.query };
    delete query.action;
    void router.replace({ query });
  },
  { immediate: true, flush: 'post' },
);

async function persistWorkOrder(command: WorkOrderCommand) {
  if (workOrderSaving.value) return;
  workOrderSaving.value = true;
  try {
    const response = await requestWorkOrder(command);
    const savedRecord = updateLocalWorkOrders(response);
    productionValidationAttempted.value = false;
    resetUnsavedChanges();
    await router.replace(`/production/work-orders/${encodeURIComponent(savedRecord.code)}`);
    if (response.idempotencyIntent) workOrderIdempotencyKeys.delete(response.idempotencyIntent);
    showToast(command === 'submit' ? `${savedRecord.code} 已提交` : `${savedRecord.code} 已保存`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `生产工单${command === 'submit' ? '提交' : '保存'}失败`, 'error');
  } finally {
    workOrderSaving.value = false;
  }
}

async function closeCurrentWorkOrder() {
  const row = currentProductionDocument.value;
  if (workOrderSaving.value || !row || activePage.value !== 'work-orders') return;
  const raw = row.raw as AnyRecord;
  const revision = toNumber(raw.revision);
  const confirmed = await requestActionConfirmation({
    title: `关闭生产工单 ${row.code}？`,
    message: `计划 ${qty(toNumber(raw.planQty), text(raw.unit, '件'))}，已入库 ${qty(toNumber(raw.inboundQty), text(raw.unit, '件'))}。关闭后工单转为只读，请确认所有批次、质检、异常和入库记录已经核对完成。`,
    confirmLabel: '确认关闭',
    tone: 'warning',
  });
  if (!confirmed) return;
  const requestKey = workOrderIdempotencyKey('close', row.code, revision);
  workOrderSaving.value = true;
  try {
    const response = await fetch(`${apiBase}/production/work-orders/${encodeURIComponent(row.code)}/close`, {
      method: 'POST',
      headers: productionRecipeRequestHeaders(),
      body: JSON.stringify({
        actor: text(raw.owner, '生产主管'),
        revision,
        idempotencyKey: requestKey.key,
      }),
    });
    const payload = await response.json().catch(() => ({})) as AnyRecord;
    if (!response.ok || !payload.record) {
      throw new Error(text(payload.error || payload.message, `生产工单关闭失败：${response.status}`));
    }
    updateLocalWorkOrders({ record: payload.record as Production2WorkOrder & Record<string, unknown> });
    await loadPersistedWorkOrderDetail(row.code);
    workOrderIdempotencyKeys.delete(requestKey.intent);
    showToast(`${row.code} 已关闭`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '生产工单关闭失败', 'error');
  } finally {
    workOrderSaving.value = false;
  }
}

function productionRecipePayload(command: RecipeLifecycleCommand = 'save') {
  return {
    command,
    revision: recipeDraft.value.revision,
    sourceRecipeCode: recipeDraft.value.sourceRecipeCode,
    productCode: recipeDraft.value.productCode,
    productName: recipeDraft.value.productName,
    version: recipeDraft.value.version,
    productUnitWeightKg: toNumber(recipeDraft.value.productUnitWeightKg),
    outputUnit: recipeDraft.value.outputUnit,
    note: recipeDraft.value.note,
    materials: recipeDraft.value.materials.map((line) => ({
      materialCode: line.materialCode,
      materialName: line.materialName,
      usageMode: line.usageMode,
      percent: toNumber(line.percent),
      perUnitQty: toNumber(line.perUnitQty),
      unit: line.unit,
      incomingQcRequired: line.incomingQcRequired,
    })),
    estimatedLosses: recipeDraft.value.estimatedLosses.map((line) => ({
      materialCode: line.materialCode,
      materialName: line.materialName,
      fixedLossQty: toNumber(line.fixedLossQty),
      lossRatePercent: toNumber(line.lossRatePercent),
      unit: line.unit,
    })),
    attachments: productionAttachments.value,
  };
}

async function persistProductionRecipe() {
  if (recipeSaving.value || !validateRecipeDraft()) return;
  recipeSaving.value = true;
  try {
    const isNew = isProductionNewDocument.value;
    const code = productionDocumentCode.value || recipeDraft.value.code;
    const response = await fetch(
      isNew ? `${apiBase}/production/recipes` : `${apiBase}/production/recipes/${encodeURIComponent(code)}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: productionRecipeRequestHeaders(),
        body: JSON.stringify(productionRecipePayload('save')),
      },
    );
    const payload = await response.json().catch(() => ({})) as { record?: AnyRecord; items?: AnyRecord[]; flowRecords?: AnyRecord[]; error?: string; message?: string };
    if (!response.ok || !payload.record) {
      throw new Error(payload.error || payload.message || `生产配方保存失败：${response.status}`);
    }
    if (Array.isArray(payload.items)) mergePersistedRecipes(payload.items);
    else upsertPersistedRecipe(payload.record);
    const saved = normalizePersistedRecipe(payload.record);
    const savedIndex = production2Recipes.findIndex((record) => record.code === saved.code);
    if (savedIndex >= 0) production2Recipes.splice(savedIndex, 1, saved);
    else production2Recipes.unshift(saved);
    productionDataRevision.value += 1;
    recipeDraft.value = recipeDraftFromRow(recipeRow(saved as AnyRecord, 0));
    recipeFlowRecords.value = toArray<FlowRecord>(payload.flowRecords);
    productionValidationAttempted.value = false;
    await nextTick();
    resetUnsavedChanges();
    await router.replace(`/production/recipes/${encodeURIComponent(saved.code)}`);
    showToast(`${saved.code} 已保存为草稿`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '生产配方保存失败', 'error');
  } finally {
    recipeSaving.value = false;
  }
}

async function updateProductionRecipeLifecycle(command: 'activate' | 'disable') {
  if (recipeSaving.value || activePage.value !== 'recipes' || isProductionNewDocument.value) return;
  if (command === 'activate') {
    if (recipeActivationConflictMessage.value) {
      showToast(recipeActivationConflictMessage.value, 'error');
      return;
    }
    if (isProductionEditDocument.value && !validateRecipeDraft()) return;
  }
  const code = productionDocumentCode.value || recipeDraft.value.code;
  if (!code) return;
  recipeSaving.value = true;
  try {
    const response = await fetch(`${apiBase}/production/recipes/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: productionRecipeRequestHeaders(),
      body: JSON.stringify(productionRecipePayload(command)),
    });
    const payload = await response.json().catch(() => ({})) as { record?: AnyRecord; items?: AnyRecord[]; flowRecords?: AnyRecord[]; error?: string; message?: string };
    if (!response.ok || !payload.record) {
      throw new Error(payload.error || payload.message || `生产配方${command === 'activate' ? '启用' : '停用'}失败：${response.status}`);
    }
    if (Array.isArray(payload.items)) mergePersistedRecipes(payload.items);
    else upsertPersistedRecipe(payload.record);
    const saved = normalizePersistedRecipe(payload.record);
    recipeDraft.value = recipeDraftFromRow(recipeRow(saved as AnyRecord, 0));
    recipeFlowRecords.value = toArray<FlowRecord>(payload.flowRecords);
    productionValidationAttempted.value = false;
    await nextTick();
    resetUnsavedChanges();
    await router.replace(`/production/recipes/${encodeURIComponent(saved.code)}`);
    showToast(`${saved.code} 已${command === 'activate' ? '启用' : '停用'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `生产配方${command === 'activate' ? '启用' : '停用'}失败`, 'error');
  } finally {
    recipeSaving.value = false;
  }
}

function productionProcessTemplatePayload(command: 'save' | 'activate' | 'disable' = 'save') {
  return {
    command,
    revision: processTemplateDraft.value.revision,
    sourceProcessTemplateCode: processTemplateDraft.value.sourceProcessTemplateCode,
    name: processTemplateDraft.value.name,
    version: processTemplateDraft.value.version,
    routeType: processTemplateDraft.value.routeType,
    productFamily: processTemplateDraft.value.productFamily,
    lineTypes: processTemplateDraft.value.lineTypes,
    temperatureTolerance: processTemplateDraft.value.temperatureTolerance,
    temperatureZones: processTemplateDraft.value.temperatureZones.map((zone) => ({
      name: zone.name,
      value: zone.value,
    })),
    stepCodes: processTemplateDraft.value.steps.map((step) => step.stepCode).filter(Boolean),
    stepInstructions: processTemplateDraft.value.steps.map((step) => ({
      stepCode: step.stepCode,
      coreEquipment: step.coreEquipment,
      workContent: step.workContent,
      controlPoints: step.controlPoints,
      commonIssues: step.commonIssues,
    })),
    attachments: productionAttachments.value,
  };
}

async function persistProductionProcessTemplate() {
  if (processTemplateSaving.value || !validateProcessTemplateDraft()) return;
  processTemplateSaving.value = true;
  try {
    const isNew = isProductionNewDocument.value;
    const code = productionDocumentCode.value || processTemplateDraft.value.code;
    const response = await fetch(
      isNew ? `${apiBase}/production/process-templates` : `${apiBase}/production/process-templates/${encodeURIComponent(code)}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: productionRecipeRequestHeaders(),
        body: JSON.stringify(productionProcessTemplatePayload('save')),
      },
    );
    const payload = await response.json().catch(() => ({})) as { record?: AnyRecord; items?: AnyRecord[]; flowRecords?: FlowRecord[]; error?: string; message?: string };
    if (!response.ok || !payload.record) {
      throw new Error(payload.error || payload.message || `生产工艺保存失败：${response.status}`);
    }
    if (Array.isArray(payload.items)) mergePersistedProcessTemplates(payload.items);
    else upsertPersistedProcessTemplate(payload.record);
    const saved = normalizePersistedProcessTemplate(payload.record);
    processTemplateDraft.value = processTemplateDraftFromRow(processTemplateRow(saved as AnyRecord));
    processTemplateFlowRecords.value = toArray<FlowRecord>(payload.flowRecords);
    productionValidationAttempted.value = false;
    await nextTick();
    resetUnsavedChanges();
    await router.replace(`/production/process-templates/${encodeURIComponent(saved.code)}`);
    showToast(`${saved.code} 已保存为草稿`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '生产工艺保存失败', 'error');
  } finally {
    processTemplateSaving.value = false;
  }
}

async function updateProductionProcessTemplateLifecycle(command: 'activate' | 'disable') {
  if (processTemplateSaving.value || activePage.value !== 'process-templates' || isProductionNewDocument.value) return;
  if (command === 'activate' && processTemplateActivationConflictMessage.value) {
    showToast(processTemplateActivationConflictMessage.value, 'error');
    return;
  }
  if (command === 'activate' && isProductionEditDocument.value && !validateProcessTemplateDraft()) return;
  const code = productionDocumentCode.value || processTemplateDraft.value.code;
  if (!code) return;
  processTemplateSaving.value = true;
  try {
    const response = await fetch(`${apiBase}/production/process-templates/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: productionRecipeRequestHeaders(),
      body: JSON.stringify(productionProcessTemplatePayload(command)),
    });
    const payload = await response.json().catch(() => ({})) as { record?: AnyRecord; items?: AnyRecord[]; flowRecords?: FlowRecord[]; error?: string; message?: string };
    if (!response.ok || !payload.record) {
      throw new Error(payload.error || payload.message || `生产工艺${command === 'activate' ? '启用' : '停用'}失败：${response.status}`);
    }
    if (Array.isArray(payload.items)) mergePersistedProcessTemplates(payload.items);
    else upsertPersistedProcessTemplate(payload.record);
    const saved = normalizePersistedProcessTemplate(payload.record);
    processTemplateDraft.value = processTemplateDraftFromRow(processTemplateRow(saved as AnyRecord));
    processTemplateFlowRecords.value = toArray<FlowRecord>(payload.flowRecords);
    productionValidationAttempted.value = false;
    await nextTick();
    resetUnsavedChanges();
    await router.replace(`/production/process-templates/${encodeURIComponent(saved.code)}`);
    showToast(`${saved.code} 已${command === 'activate' ? '启用' : '停用'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `生产工艺${command === 'activate' ? '启用' : '停用'}失败`, 'error');
  } finally {
    processTemplateSaving.value = false;
  }
}

function saveProductionDraft() {
  if (productionEditableActionDisabled.value) {
    showToast(productionSaveActionTitle.value, 'error');
    return;
  }
  if (activePage.value === 'tasks') {
    void persistProductionTask('save');
    return;
  }
  if (activePage.value === 'material-requests') {
    void persistProductionMaterialRequest('save');
    return;
  }
  if (activePage.value === 'work-orders') {
    void persistWorkOrder('save');
    return;
  }
  if (activePage.value === 'recipes') {
    void persistProductionRecipe();
    return;
  }
  if (activePage.value === 'process-templates') {
    void persistProductionProcessTemplate();
    return;
  }
  showToast(`${productionPersistenceUnavailableMessage.value}当前填写内容已保留在页面。`, 'error');
}

function submitProductionDraft() {
  if (productionEditableActionDisabled.value) {
    showToast(productionSubmitActionTitle.value, 'error');
    return;
  }
  if (activePage.value === 'tasks') {
    void persistProductionTask('submit');
    return;
  }
  if (activePage.value === 'material-requests') {
    void persistProductionMaterialRequest('submit');
    return;
  }
  if (activePage.value === 'work-orders') {
    if (!validateProductionDraft()) return;
    void persistWorkOrder('submit');
    return;
  }
  if (activePage.value === 'recipes') {
    void updateProductionRecipeLifecycle('activate');
    return;
  }
  if (activePage.value === 'process-templates') {
    void updateProductionProcessTemplateLifecycle('activate');
    return;
  }
  showToast(`${productionPersistenceUnavailableMessage.value}当前填写内容已保留在页面，不能提交。`, 'error');
}

function openExecutionCardPackaging(raw: AnyRecord) {
  if (executionCardActionBusy.value) return;
  const card = raw as unknown as Production2ExecutionCard;
  const quantity = Math.max(0, Number(card.qualifiedQty || 0) - Number(card.packedQty || 0));
  if (quantity <= 0) {
    showToast(`${card.code} 当前没有可确认包装的合格数量`, 'error');
    return;
  }
  pendingPackagingCard.value = raw;
  packagingDialogOpen.value = true;
}

function openShortCloseResolution(raw: AnyRecord) {
  if (executionCardActionBusy.value) return;
  if (!executionCardShortCloseNeedsResolution(raw)) {
    showToast(`${text(raw.code, '当前批次')} 没有待处理的提前结束剩余数量`, 'error');
    return;
  }
  pendingShortCloseCard.value = raw;
  shortCloseResolutionDialogOpen.value = true;
}

async function confirmShortCloseResolution(payload: { action: '安排补产' | '接受短缺'; reason: string }) {
  if (executionCardActionBusy.value || !pendingShortCloseCard.value) return;
  const card = pendingShortCloseCard.value as unknown as Production2ExecutionCard;
  const intent = `short-close:${card.code}:${card.revision || 0}:${payload.action}`;
  let idempotencyKey = executionCardActionKeys.get(intent);
  if (!idempotencyKey) {
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    idempotencyKey = `short-close-resolution:${card.code}:${random}`;
    executionCardActionKeys.set(intent, idempotencyKey);
  }
  executionCardActionBusy.value = true;
  try {
    const response = await resolveProductionShortClose(card.code, {
      revision: Number(card.revision || 0),
      action: payload.action,
      reason: payload.reason,
      actor: card.leader || '生产主管',
      idempotencyKey,
    });
    upsertExecutionCardRecord(response.record);
    executionCardActionKeys.delete(intent);
    shortCloseResolutionDialogOpen.value = false;
    pendingShortCloseCard.value = null;
    showToast(
      payload.action === '安排补产'
        ? `${card.code} 已生成补充设备作业 ${response.operationJob?.code || ''}`.trim()
        : `${card.code} 已接受短缺，按实际合格数量继续流转`,
    );
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 提前结束剩余数量处理失败`, 'error');
  } finally {
    executionCardActionBusy.value = false;
  }
}

async function confirmExecutionCardPackaging(payload: { packageRef: string; quantity: number }) {
  if (executionCardActionBusy.value || !pendingPackagingCard.value) return;
  const card = pendingPackagingCard.value as unknown as Production2ExecutionCard;
  const availableQuantity = Math.max(0, Number(card.qualifiedQty || 0) - Number(card.packedQty || 0));
  const quantity = Number(payload.quantity || 0);
  const packageRef = payload.packageRef.trim();
  if (!packageRef || quantity <= 0 || quantity > availableQuantity + 0.0001) return;
  const intent = `pack:${card.code}:${card.revision || 0}:${quantity}:${packageRef}`;
  let idempotencyKey = executionCardActionKeys.get(intent);
  if (!idempotencyKey) {
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    idempotencyKey = `execution-pack:${card.code}:${random}`;
    executionCardActionKeys.set(intent, idempotencyKey);
  }
  executionCardActionBusy.value = true;
  try {
    const response = await packProductionExecutionCard(card.code, {
      revision: Number(card.revision || 0),
      quantity,
      packageRef,
      actor: card.leader || '生产班长',
      idempotencyKey,
    });
    upsertExecutionCardRecord(response.record);
    if (response.qualityTask?.code) {
      const taskIndex = production2QualityTasks.findIndex((item) => item.code === response.qualityTask?.code);
      if (taskIndex >= 0) production2QualityTasks.splice(taskIndex, 1, response.qualityTask);
      else production2QualityTasks.unshift(response.qualityTask);
    }
    executionCardActionKeys.delete(intent);
    packagingDialogOpen.value = false;
    pendingPackagingCard.value = null;
    showToast(`${card.code} 包装已确认，等待入库抽检 ${response.qualityTask?.code || ''}`.trim());
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${card.code} 包装确认失败`, 'error');
  } finally {
    executionCardActionBusy.value = false;
  }
}

function closeRuntimeProductionException(raw: AnyRecord) {
  if (exceptionActionBusy.value) return;
  const exception = raw as unknown as Production2Exception;
  if (isQualityProductionException(raw)) {
    showToast(`${exception.code} 必须在来源质检单完成返工、复检、让步或报废处置`, 'error');
    return;
  }
  if (exception.status === '已关闭') {
    const cardCode = exception.executionCardCode || exception.relatedBatch || '';
    if (cardCode) void router.push(`/production/execution-cards/${encodeURIComponent(cardCode)}`);
    return;
  }
  const cardCode = exception.executionCardCode || exception.relatedBatch || '';
  const card = production2ExecutionCards.find((item) => item.code === cardCode);
  if (!card || !Number.isInteger(card.revision)) {
    showToast(`${exception.code} 缺少可追溯的执行批次记录，不能直接关闭`, 'error');
    return;
  }
  pendingRecoveryException.value = raw;
  exceptionRecoveryDialogOpen.value = true;
}

async function confirmRuntimeProductionException(payload: { reason: string }) {
  if (exceptionActionBusy.value || !pendingRecoveryException.value) return;
  const exception = pendingRecoveryException.value as unknown as Production2Exception;
  const cardCode = exception.executionCardCode || exception.relatedBatch || '';
  const card = production2ExecutionCards.find((item) => item.code === cardCode);
  if (!card || !Number.isInteger(card.revision)) {
    showToast(`${exception.code} 缺少可追溯的生产批次，不能恢复生产`, 'error');
    return;
  }
  const resolution = payload.reason.trim();
  if (!resolution) return;
  const intent = `resolve:${exception.code}:${exception.revision || 0}:${card.revision || 0}`;
  let idempotencyKey = exceptionActionKeys.get(intent);
  if (!idempotencyKey) {
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    idempotencyKey = `exception-resolve:${exception.code}:${random}`;
    exceptionActionKeys.set(intent, idempotencyKey);
  }
  exceptionActionBusy.value = true;
  try {
    const response = await resolveProductionException(exception.code, {
      version: Number(exception.revision || 0),
      cardRevision: Number(card.revision || 0),
      disposition: '恢复生产',
      resolution,
      actor: exception.owner || card.leader || '生产主管',
      idempotencyKey,
    });
    upsertProductionExceptionRecord(response.record);
    exceptionFlowRecords.value = toArray<FlowRecord>(response.flowRecords);
    if (response.executionCard) upsertExecutionCardRecord(response.executionCard);
    exceptionActionKeys.delete(intent);
    exceptionRecoveryDialogOpen.value = false;
    pendingRecoveryException.value = null;
    showToast(`${response.record.code} 已关闭，${response.executionCard?.code || card.code} 已恢复原执行节点`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${exception.code} 处置失败`, 'error');
  } finally {
    exceptionActionBusy.value = false;
  }
}

function runProductionPrimaryAction() {
  const row = currentProductionDocument.value;
  const raw = row?.raw as AnyRecord | undefined;
  if (!row || !raw) return;

  if (activePage.value === 'recipes') {
    if (!canWriteProduction.value) {
      showToast(productionReadonlyReason.value, 'error');
      return;
    }
    if (recipeDraft.value.status === '草稿') {
      void updateProductionRecipeLifecycle('activate');
      return;
    }
    void router.push(`/production/recipes/new?copy=${encodeURIComponent(row.code)}`);
    return;
  }

  if (activePage.value === 'process-templates') {
    if (!canWriteProduction.value) {
      showToast(productionReadonlyReason.value, 'error');
      return;
    }
    if (processTemplateDraft.value.status === '草稿') {
      void updateProductionProcessTemplateLifecycle('activate');
      return;
    }
    void router.push(`/production/process-templates/new?copy=${encodeURIComponent(row.code)}`);
    return;
  }

  if (activePage.value === 'tasks') {
    if (taskLifecycleStatusLabel.value === '草稿') {
      if (!canWriteProduction.value) {
        showToast(productionReadonlyReason.value, 'error');
        return;
      }
      void router.push(`/production/tasks/${encodeURIComponent(row.code)}/edit`);
      return;
    }
    if (taskMaterialPlanningBlockers.value.length) {
      if (!canWriteProduction.value) {
        showToast(productionReadonlyReason.value, 'error');
        return;
      }
      const blockedProduct = taskBlockedRecipeProduct.value;
      void router.push({
        path: '/production/recipes/new',
        query: {
          product: text(blockedProduct?.productCode, ''),
          sourceTask: row.code,
          returnTo: `/production/tasks/${encodeURIComponent(row.code)}`,
        },
      });
      return;
    }
    const shouldCreateWorkOrder = row.nextStep.includes('创建生产工单')
      || row.nextStep.includes('继续创建剩余工单');
    if (shouldCreateWorkOrder) {
      if (!canWriteProduction.value) {
        showToast(productionReadonlyReason.value, 'error');
        return;
      }
      void router.push(taskChildDocumentLocation('work-orders', row.code));
      return;
    }
    if (row.nextStep.includes('质检')) {
      showToast(`${row.code} 正在等待来料质检结果；质量模块完成判定后会自动更新可生产数量`);
      return;
    }
    if (row.nextStep.includes('仓库入库') || row.nextStep.includes('在途')) {
      showToast(`${row.code} 正在等待采购到货或仓库入库；生产模块只读取可生产数量`);
      return;
    }
    if (taskMaterialRequestAction.value?.mode === 'view' && taskMaterialRequestAction.value.code) {
      void router.push(`/production/material-requests/${encodeURIComponent(taskMaterialRequestAction.value.code)}`);
      return;
    }
    if (taskMaterialRequestAction.value?.mode === 'new') {
      createMaterialRequestFromTask();
      return;
    }
    const relatedOrder = production2WorkOrders.find((order) => workOrderSourceAllocationsFromRaw(
      order as unknown as AnyRecord,
      text(order.taskCode, ''),
      text((order as unknown as AnyRecord).sourceLineId, ''),
    ).some((allocation) => allocation.taskCode === row.code));
    if (!relatedOrder && !canWriteProduction.value) {
      showToast(productionReadonlyReason.value, 'error');
      return;
    }
    void router.push(
      productionDocumentPrimaryLabel.value === '创建工单'
        ? taskChildDocumentLocation('work-orders', row.code)
        : relatedOrder
          ? `/production/work-orders/${encodeURIComponent(relatedOrder.code)}`
          : taskChildDocumentLocation('work-orders', row.code),
    );
    return;
  }

  if (activePage.value === 'material-requests') {
    if (materialRequestDraft.value.status === '草稿') {
      void router.push(`/production/material-requests/${encodeURIComponent(row.code)}/edit`);
      return;
    }
    if (materialRequestDraft.value.status === '待系统评估') {
      showToast(`${row.code} 正在由系统评估可用库存，无需仓库人工受理`);
      return;
    }
    const requisition = text(raw.linkedPurchaseRequisition, '');
    showToast(
      requisition
        ? `${row.code} 的库存缺口已交接采购需求 ${requisition}，等待采购更新进度`
        : `${row.code} 当前库存可覆盖；生产工单释放后再由仓库执行实际领料`,
    );
    return;
  }

  if (activePage.value === 'work-orders') {
    const actionableProductionCard = workOrderActionableProductionCard(row.code);
    if (actionableProductionCard) {
      void router.push(`/production/execution-cards/${encodeURIComponent(actionableProductionCard.code)}`);
      return;
    }
    const activeQualityDisposition = production2QualityTasks.find(
      (task) => task.workOrderCode === row.code
        && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
    );
    if (activeQualityDisposition) {
      showToast(`质量任务 ${activeQualityDisposition.code} 正在处置；生产等待质量结果`);
      return;
    }
    const activeException = activeProductionExceptionForWorkOrder(row.code);
    if (activeException) {
      void router.push(`/production/exceptions/${encodeURIComponent(activeException.code)}`);
      return;
    }
    if (workOrderCanClose.value) {
      void closeCurrentWorkOrder();
      return;
    }
    if (workOrderLifecycleStatus.value === '已关闭') {
      const receiptCode = workOrderExecutionCards(row.code)
        .flatMap((card) => toArray<unknown>((card as AnyRecord).productionReceiptCodes))
        .map((code) => text(code))
        .filter(Boolean)
        .slice(-1)[0];
      showToast(
        receiptCode
          ? `仓库完工入库 ${receiptCode} 已完成；生产工单保留入库结果`
          : `${row.code} 已关闭，当前没有可下钻的仓库入库任务`,
      );
      return;
    }
    const releaseFacts = workOrderReleaseFacts(raw);
    if (releaseFacts.unreleasedQty > 0 && releaseFacts.releasableQty <= 0) {
      showToast(
        releaseFacts.blocker.includes('待仓库入库')
          ? `${row.code} 正在等待采购物料入库，入库后系统自动更新可释放数量`
          : `${row.code} 当前可用物料不足，等待仓库或采购更新库存条件`,
      );
      return;
    }
    const releases = workOrderReleaseBatches(row.code);
    const pendingRelease = releases.find((batch) => batch.releaseStatus === '待释放');
    if (pendingRelease) {
      void router.push(`/production/workbench?tab=schedule&workOrder=${encodeURIComponent(row.code)}&releaseBatch=${encodeURIComponent(pendingRelease.code)}`);
      return;
    }
    if (releaseFacts.unreleasedQty > 0 && (row.nextStep.includes('释放') || productionDocumentPrimaryLabel.value.includes('释放'))) {
      void router.push(`/production/workbench?tab=schedule&workOrder=${encodeURIComponent(row.code)}`);
      return;
    }
    const pendingQuality = production2QualityTasks.find(
      (task) => task.workOrderCode === row.code && productionQualityTaskIsPending(task as unknown as AnyRecord),
    );
    if (pendingQuality) {
      showToast(`质量任务 ${pendingQuality.code} 已生成，由质量模块处理；生产等待判定结果`);
      return;
    }
    const card = production2ExecutionCards.find(
      (item) => item.workOrderCode === row.code && toNumber(item.reportedQty) > toNumber(item.inboundQty),
    ) ?? production2ExecutionCards.find((item) => item.workOrderCode === row.code);
    if (card && row.nextStep.includes('入库')) {
      const pendingReceipt = pendingProductionReceiptCode(card.code);
      showToast(
        pendingReceipt
          ? `仓库完工入库任务 ${pendingReceipt} 已自动生成，等待仓库确认`
          : `${card.code} 已到入库节点，但仓库任务尚未生成，请刷新后重试`,
        pendingReceipt ? 'success' : 'error',
      );
      return;
    }
    if (card) {
      void router.push(`/production/execution-cards/${encodeURIComponent(card.code)}`);
      return;
    }
    const actionableRelease = releases.find((batch) => batch.releaseStatus === '已释放' && batch.materialStatus !== '已领料');
    if (actionableRelease) {
      void router.push(releaseBatchPrimaryRoute(actionableRelease));
      return;
    }
    if (releaseFacts.unreleasedQty > 0) {
      void router.push(`/production/workbench?tab=schedule&workOrder=${encodeURIComponent(row.code)}`);
      return;
    }
    showToast('当前工单没有可继续执行的生产安排，请刷新后重试', 'error');
    return;
  }

  if (activePage.value === 'execution-cards') {
    const release = releaseBatchForExecutionCard(row.code);
    const activeQualityDisposition = production2QualityTasks.find(
      (task) => task.sourceCard === row.code
        && productionQualityTaskNeedsDisposition(task as unknown as AnyRecord),
    );
    if (activeQualityDisposition) {
      showToast(`质量任务 ${activeQualityDisposition.code} 正在处置；生产等待质量结果`);
      return;
    }
    const activeException = activeProductionExceptionForExecutionCard(row.code);
    if (activeException) {
      void router.push(`/production/exceptions/${encodeURIComponent(activeException.code)}`);
      return;
    }
    if (text(raw.status) === '已完成' && text(raw.node) === '已入库') {
      const receiptCodes = toArray<unknown>(raw.productionReceiptCodes).map((item) => text(item)).filter(Boolean);
      const receiptCode = receiptCodes[receiptCodes.length - 1];
      showToast(
        receiptCode
          ? `仓库完工入库 ${receiptCode} 已完成；生产批次保留入库结果`
          : `${row.code} 已入库，当前没有可下钻的仓库任务`,
      );
      return;
    }
    if (executionCardShortCloseNeedsResolution(raw)) {
      openShortCloseResolution(raw);
      return;
    }
    const qualityTask = production2QualityTasks.find(
      (task) => task.sourceCard === row.code && productionQualityTaskIsPending(task as unknown as AnyRecord),
    );
    if (qualityTask) {
      showToast(`质量任务 ${qualityTask.code} 已生成，由质量模块处理；生产等待判定结果`);
      return;
    }
    if (text(raw.node) === '待包装') {
      openExecutionCardPackaging(raw);
      return;
    }
    if (text(raw.node) === '待入库' || text(raw.status) === '待仓库') {
      const pendingReceipt = pendingProductionReceiptCode(row.code);
      showToast(
        pendingReceipt
          ? `仓库完工入库任务 ${pendingReceipt} 已自动生成，等待仓库确认`
          : `${row.code} 已放行，但仓库完工入库任务尚未生成，请刷新后重试`,
        pendingReceipt ? 'success' : 'error',
      );
      return;
    }
    if (release?.releaseStatus === '已释放' && release.materialStatus !== '已领料') {
      const issueCode = release.materialIssueCodes?.[release.materialIssueCodes.length - 1];
      showToast(
        issueCode
          ? `仓库生产领料任务 ${issueCode} 已自动生成，等待仓库确认出库`
          : '当前生产安排已释放，但仓库领料任务尚未生成，请刷新后重试',
        issueCode ? 'success' : 'error',
      );
      return;
    }
    void router.push(`/production/workbench?tab=site&workOrder=${encodeURIComponent(text(raw.workOrderCode))}&releaseBatch=${encodeURIComponent(release?.code || '')}`);
    return;
  }

  if (activePage.value === 'quality') {
    showToast(`质量记录 ${row.code} 仅作为生产侧结果投影；检验和处置由质量模块办理`);
    return;
  }

  if (activePage.value === 'exceptions') {
    if (isQualityProductionException(raw)) {
      const qualityCode = text(productionExceptionQualityTask(raw)?.code || raw.source, '');
      const qualityRoute = productionObjectRoute(qualityCode);
      if (qualityRoute) void router.push(qualityRoute);
      else showToast(`${row.code} 缺少可下钻的来源质检单`, 'error');
      return;
    }
    if (text(raw.outcome) === '异常停机' && text(raw.status) !== '已关闭') {
      void closeRuntimeProductionException(raw);
      return;
    }
    if (text(raw.type) === '缺料') {
      const workOrderRoute = productionObjectRoute(text(raw.relatedWorkOrder, ''));
      const taskRoute = productionObjectRoute(productionExceptionSourceTaskCode(raw));
      if (workOrderRoute) void router.push(workOrderRoute);
      else if (taskRoute) void router.push(taskRoute);
      else showToast(`${row.code} 缺少可下钻的来源工单或生产任务`, 'error');
      return;
    }
    const relatedCode = text(
      raw.executionCardCode || raw.relatedBatch || raw.relatedWorkOrder || raw.source,
      '',
    );
    const relatedRoute = productionObjectRoute(relatedCode);
    if (relatedRoute) void router.push(relatedRoute);
    else {
      showToast(`${row.code} 暂无可打开的关联生产对象`, 'error');
    }
    return;
  }

  if (!isProductionRuleDocument.value && !isProductionRecordDocument.value) {
    void router.push(`/production/${activePage.value}/${encodeURIComponent(row.code)}/edit`);
    return;
  }
  showToast('当前记录没有可执行的业务动作，请返回列表或从关联单据继续处理', 'error');
}

async function handleProductionMoreAction(action: ProductionMoreAction) {
  productionMoreActionsOpen.value = false;
  const row = currentProductionDocument.value;
  if (!row) return;
  if (!canWriteProduction.value) {
    showToast(productionReadonlyReason.value, 'error');
    return;
  }
  if (activePage.value === 'process-steps') {
    showToast(processStepLockedMessage, 'error');
    return;
  }
  if (action.key === 'change') {
    router.push(`/production/${activePage.value}/${encodeURIComponent(row.code)}/edit`);
    return;
  }
  if (action.key === 'disable' && ['recipes', 'process-templates'].includes(activePage.value)) {
    const subject = activePage.value === 'recipes' ? '生产配方' : '生产工艺';
    const confirmed = await requestActionConfirmation({
      title: `停用${subject} ${row.code}？`,
      message: '停用后不能再被新任务或工单选用，历史引用不受影响。',
      confirmLabel: '确认停用',
      tone: 'danger',
    });
    if (!confirmed) return;
    if (activePage.value === 'recipes') void updateProductionRecipeLifecycle('disable');
    else void updateProductionProcessTemplateLifecycle('disable');
    return;
  }
}

function handleAttachmentUpload(event: Event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) return;
  if (!isProductionEditableDocument.value || productionEditableActionDisabled.value) {
    input.value = '';
    showToast(productionDocumentAttachmentTitle.value, 'error');
    return;
  }
  if (!canWriteProduction.value) {
    input.value = '';
    showToast(productionReadonlyReason.value, 'error');
    return;
  }

  const files = attachmentsFromFileList(input.files);
  if (files.length && currentProductionDocument.value) {
    const code = currentProductionDocument.value.code;
    productionDocumentUploadedAttachments.value = {
      ...productionDocumentUploadedAttachments.value,
      [code]: [...(productionDocumentUploadedAttachments.value[code] || []), ...files],
    };
    showToast(`已上传 ${files.length} 个附件`);
  }
  input.value = '';
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}
</script>

<template>
  <div class="page-stack production2-page" @click="openToolbarMenu = null">
    <DocumentLoadState
      v-if="isProductionDocumentPage && showProductionRuntimeLoadState"
      :loading="true"
      :title="activeListTitle"
      :back-path="productionBackPath"
      :back-label="activeBackLabel"
      @retry="retryProductionRuntimeData"
    />
    <ListLoadState
      v-else-if="showProductionRuntimeLoadState"
      :loading="true"
      :title="activeListTitle"
      loading-message="正在读取最新单据及关联进度，请稍候。"
    />
    <DocumentLoadState
      v-else-if="isProductionDocumentPage && productionRuntimeErrorApplies"
      :loading="false"
      :title="activeListTitle"
      :message="productionRuntimeErrorMessage"
      :back-path="productionBackPath"
      :back-label="activeBackLabel"
      @retry="retryProductionRuntimeData"
    />
    <ListLoadState
      v-else-if="productionRuntimeErrorApplies"
      :loading="false"
      :title="activeListTitle"
      :message="productionRuntimeErrorMessage"
      @retry="retryProductionRuntimeData"
    />
    <section
      v-else-if="isProductionDocumentPage && currentProductionDocument"
      class="quote-editor production-document-editor"
      :class="{
        'production-process-template-document': isProcessTemplateDocument,
        'production-process-step-document': isProcessStepDocument,
        'production-task-document': isTaskDocument,
        'production-material-request-document': isMaterialRequestDocument,
        'production-work-order-document': activePage === 'work-orders',
        'production-execution-card-document': activePage === 'execution-cards',
        'production-exception-document': activePage === 'exceptions',
        'document-rule-view': isRecipeDocument || isProcessTemplateDocument,
        'document-plan-view': isTaskDocument,
        'is-detail-view': productionDocumentIsReadOnlyView && !isProcessStepDocument,
      }"
      @click.stop
    >
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="productionBackPath" :aria-label="activeBackLabel" :title="activeBackLabel">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ productionTopbarContextTitle }}</strong>
        </template>

        <template #actions>
          <div v-if="!isProductionRecordDocument" class="quote-editor-actions">
          <template v-if="productionDocumentIsReadOnlyView">
            <template v-if="activePage !== 'process-steps'">
            <PinReferenceButton class="topbar-optional-action" :title="referenceTitle" :subtitle="referenceSubtitle" :path="referencePath" />
            <button class="secondary-action topbar-optional-action" type="button" :title="`查看${activeListTitle}流转日志`" @click="showProductionFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            </template>
            <div
              v-if="productionMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="productionMoreActionsOpen = false"
              @mouseleave="productionMoreActionsOpen = false"
            >
            <button
              class="secondary-action"
              type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="productionMoreActionsOpen"
                @click="productionMoreActionsOpen = !productionMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="productionMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in productionMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :title="action.description"
                  @click="handleProductionMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="showProductionDocumentPrimaryAction && !productionDocumentPrimaryIsHandoff"
              class="primary-action"
              type="button"
              :disabled="!currentProductionDocument || Boolean(productionStaleSnapshotMessage) || materialRequestSaving || workOrderSaving || executionCardActionBusy || exceptionActionBusy || recipeSaving || processTemplateSaving"
              :title="productionStaleSnapshotMessage || productionPrimaryActionTitle"
              @click="runProductionPrimaryAction"
            >
              <ArrowRight :size="15" />
              {{ productionDocumentPrimaryLabel }}
            </button>
            <span
              v-else-if="showProductionDocumentPrimaryAction"
              class="production-handoff-status"
              :title="productionDocumentNextStepGuidance.description"
            >
              {{ productionDocumentPrimaryLabel }}
            </span>
          </template>

          <template v-else>
            <button
              v-if="!taskConfirmedEdit && !workOrderConfirmedEdit"
              :class="['recipes', 'process-templates'].includes(activePage) && isProductionNewDocument ? 'primary-action' : 'secondary-action'"
              type="button"
              :disabled="productionEditableActionDisabled"
              :title="productionSaveActionTitle"
              @click="saveProductionDraft"
            >
              <Save :size="15" />
              {{ ['recipes', 'process-templates', 'material-requests'].includes(activePage) ? '保存草稿' : '保存' }}
            </button>
            <button
              v-if="!['recipes', 'process-templates'].includes(activePage) || !isProductionNewDocument"
              class="primary-action"
              type="button"
              :disabled="productionEditableActionDisabled"
              :title="productionSubmitActionTitle"
              @click="submitProductionDraft"
            >
              <CheckCircle2 :size="15" />
              {{ productionSubmitButtonLabel }}
            </button>
          </template>
          </div>
        </template>

        <template #fallback>
          <div class="quote-editor-header">
            <div>
              <h1>{{ pageHeading }}</h1>
              <p class="section-hint">{{ productionDocumentSubtitle }}</p>
            </div>
          </div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner
        v-if="productionWriteTrustMessage"
        title="运行数据尚未确认"
        :message="productionWriteTrustMessage"
        suffix="当前页面可查看和填写，但保存、提交保持锁定。"
      />
      <OperationPermissionBanner
        v-else-if="productionStaleSnapshotMessage"
        title="当前为历史快照"
        :message="productionStaleSnapshotMessage"
        suffix="刷新成功前不执行写入操作。"
      />

      <section
        v-if="showProductionNextStepStrip"
        class="order-next-step-strip"
        :class="`tone-${productionDocumentNextStepGuidance.tone}`"
      >
        <div>
          <span>{{ productionStatusActionPrefix }}</span>
          <strong>{{ productionDocumentNextStepGuidance.label }}</strong>
          <p>{{ productionDocumentNextStepGuidance.description }}</p>
        </div>
        <b v-if="showProductionNextStepStripAction">{{ productionDocumentNextStepGuidance.action }}</b>
      </section>

      <div class="quote-form-grid" :class="{ 'is-entry-only': !showProductionSummaryPanel }">
        <div class="quote-main-sections">
          <template v-if="isTaskDocument">
            <section class="form-section production-task-basic-section">
              <div class="form-section-head">
                <h2>任务基础</h2>
              </div>

              <DocumentFactGrid
                v-if="!taskIsEditable"
                :facts="taskDocumentBasicFacts"
                aria-label="生产任务基础信息"
              />

              <div v-else class="quote-fields production-task-fields">
                <label class="form-field">
                  <span>任务编号</span>
                  <input v-model="taskDraft.code" type="text" readonly />
                </label>
                <label v-if="!isProductionNewDocument || taskHasSourceDocument" class="form-field">
                  <span>来源单据</span>
                  <input :value="taskSourceDocumentLabel" type="text" readonly />
                </label>
                <label class="form-field" :class="taskDraftFieldClass('deliveryDate')" data-required-field="deliveryDate">
                  <span class="field-label required-label">交期</span>
                  <input v-model="taskDraft.deliveryDate" type="date" />
                </label>
                <label class="form-field" :class="taskDraftFieldClass('owner')" data-required-field="owner">
                  <span class="field-label required-label">负责人</span>
                  <ReferencePicker
                    v-model="taskDraft.ownerEmployeeCode"
                    :display-value="taskDraft.owner"
                    type="employees"
                    kind="production-document-owner"
                    title="选择生产任务负责人"
                    placeholder="选择负责人"
                    search-placeholder="搜索员工编码、姓名或岗位"
                    :clearable="false"
                    required
                    @select="handleTaskOwnerSelect"
                  />
                </label>
                <label class="form-field">
                  <span>优先级</span>
                  <select v-model="taskDraft.priority">
                    <option v-for="option in productionTaskPriorityOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </label>
                <label v-if="taskDraft.supplementaryRequirement" class="form-field full-field">
                  <span>补充要求（来自销售订单）</span>
                  <textarea :value="taskDraft.supplementaryRequirement" rows="2" readonly></textarea>
                </label>
                <label class="form-field full-field">
                  <span>任务备注</span>
                  <textarea v-model="taskDraft.note" rows="2" placeholder="填写本任务的生产安排或补充说明"></textarea>
                </label>
              </div>
            </section>

            <section class="form-section production-task-product-section">
              <div class="form-section-head">
                <h2>成品明细</h2>
                <button v-if="taskStructureIsEditable" type="button" class="secondary-action compact-action" title="添加成品明细" @click="addTaskProductLine">
                  <Plus :size="15" />
                  添加
                </button>
              </div>

              <div class="production-task-product-table">
                <div class="production-task-table-head production-task-product-row" :class="{ 'is-task-edit-row': taskStructureIsEditable }">
                  <span>成品</span>
                  <span>计划数量</span>
                  <span v-if="!taskStructureIsEditable">已建工单</span>
                  <span v-if="!taskStructureIsEditable">已入库</span>
                  <span v-if="!taskStructureIsEditable">待建工单</span>
                  <span v-if="taskStructureIsEditable">操作</span>
                </div>
                <div v-for="line in taskProductRows" :key="line.lineId" class="production-task-product-row" :class="{ 'is-task-edit-row': taskStructureIsEditable }">
                  <span class="production-task-product-cell" :class="taskProductLineFieldClass(line, 'productCode')" data-required-field="task-product">
                    <template v-if="taskStructureIsEditable">
                      <ReferencePicker
                        required
                        v-model="line.productCode"
                        type="materials"
                        kind="成品"
                        title="选择生产成品"
                        placeholder="选择成品物料"
                        search-placeholder="搜索成品编码、名称、型号或规格"
                        :display-value="taskProductLineDisplay(line)"
                        hide-meta
                        @select="(option) => handleTaskProductLineSelect(line, option)"
                      />
                      <small>{{ [line.productCode, line.model, line.spec].filter(Boolean).join(' · ') || '-' }}</small>
                    </template>
                    <template v-else>
                      <MaterialIdentity
                        compact
                        :name="line.productName || line.productCode || '-'"
                        :code="line.productCode"
                        :model="line.model"
                        :spec="line.spec"
                        :image-tone="productionMaterialIdentityTone(line.productCode)"
                      />
                    </template>
                  </span>
                  <span class="production-task-quantity-cell" :class="taskProductLineFieldClass(line, 'demandQty')" data-required-field="task-product-qty">
                    <label v-if="taskStructureIsEditable" class="production-task-quantity-input">
                      <input v-model="line.demandQty" type="number" min="0" step="1" aria-label="计划生产数量" @input="syncTaskProductionQty" />
                      <em>{{ line.unit }}</em>
                    </label>
                    <strong v-else>{{ qty(line.demandQty, line.unit) }}</strong>
                  </span>
                  <span v-if="!taskStructureIsEditable" class="production-task-quantity-cell"><strong>{{ qty(taskProductPlannedQty(line), line.unit) }}</strong></span>
                  <span v-if="!taskStructureIsEditable" class="production-task-quantity-cell"><strong>{{ qty(taskProductInboundQty(line), line.unit) }}</strong></span>
                  <span v-if="!taskStructureIsEditable" class="production-task-quantity-cell"><strong :class="{ warn: taskProductScheduleGap(line) > 0 }">{{ qty(taskProductScheduleGap(line), line.unit) }}</strong></span>
                  <span v-if="taskStructureIsEditable" class="row-action-cell">
                    <button
                      type="button"
                      class="danger-icon-button"
                      :disabled="taskProductRows.length <= 1"
                      aria-label="删除成品明细"
                      :title="taskProductRows.length <= 1 ? '至少保留一项成品' : '删除成品明细'"
                      @click="removeTaskProductLine(line.lineId)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </span>
                </div>
              </div>
            </section>

            <section class="form-section production-task-material-section">
              <div class="form-section-head">
                <h2>预估物料与备料</h2>
                <div class="production-section-actions">
                  <button
                    v-if="taskMaterialRequestAction"
                    type="button"
                    class="secondary-action compact-action"
                    :title="taskMaterialRequestAction.title"
                    @click="createMaterialRequestFromTask"
                  >
                    <ExternalLink v-if="taskMaterialRequestAction.mode === 'view'" :size="14" />
                    <Plus v-else :size="15" />
                    {{ taskMaterialRequestAction.label }}
                  </button>
                </div>
              </div>

              <div v-if="!taskMaterialReadyRows.length" class="process-template-empty">
                {{ taskMaterialEmptyMessage }}
              </div>

              <div v-else class="production-task-material-table">
                <div class="production-task-table-head production-task-material-row">
                  <span>物料</span>
                  <span>预计用量</span>
                  <span>可用库存</span>
                  <span>即时缺口/申请</span>
                  <span>补充中</span>
                  <span>备料状态</span>
                </div>
                <div v-for="line in taskMaterialReadyRows" :key="line.code" class="production-task-material-row">
                  <span class="production-task-product-cell">
                    <MaterialIdentity
                      compact
                      :name="line.name"
                      :code="line.code"
                      :image-tone="productionMaterialIdentityTone(line.code)"
                    />
                  </span>
                  <span class="production-task-material-quantity-cell">
                    <strong>{{ line.requiredQty }}</strong>
                  </span>
                  <span class="production-task-material-stock-cell">
                    <strong>{{ line.availableQty }}</strong>
                    <small v-if="line.ownAllocatedValue > 0 || line.otherAllocatedValue > 0">本任务 {{ line.ownAllocatedQty }} · 其他 {{ line.otherAllocatedQty }}</small>
                    <small v-else>暂无占用</small>
                  </span>
                  <span class="production-task-material-gap-cell">
                    <strong :class="{ warn: line.shortageValue > 0 }">{{ qty(line.shortageValue, line.unit) }}</strong>
                    <small>{{ taskMaterialRequestDisplay(line) }}</small>
                  </span>
                  <span class="production-task-material-supplement-cell">
                    <strong>{{ taskMaterialSupplementSummary(line) }}</strong>
                  </span>
                  <span class="production-task-material-status-cell">
                    <i class="mini-status" :class="statusClass(line.status)">{{ productionDisplayTerm(line.status) }}</i>
                  </span>
                </div>
              </div>

              <div
                v-if="!isProductionNewDocument && (taskRelatedMaterialRequestRows.length || taskMaterialRequestAction)"
                class="task-material-request-panel"
              >
                <div class="task-material-request-panel-head">
                  <div>
                    <strong>相关备料申请</strong>
                  </div>
                </div>
                <div v-if="!taskRelatedMaterialRequestRows.length" class="process-template-empty compact-empty">
                  暂无备料申请，可按当前未覆盖缺口发起申请。
                </div>
                <div v-else class="task-material-request-list">
                  <RouterLink
                    v-for="request in taskRelatedMaterialRequestRows"
                    :key="request.code"
                    class="task-material-request-item"
                    :to="`/production/material-requests/${encodeURIComponent(request.code)}`"
                    :title="`查看备料申请 ${request.code}`"
                  >
                    <span>
                      <strong>{{ request.code }}</strong>
                      <small>需求 {{ request.expectedDate }}</small>
                    </span>
                    <span>
                      <strong>{{ request.lineSummary }}</strong>
                    </span>
                    <span>
                      <i class="mini-status" :class="statusClass(request.status)">{{ request.status }}</i>
                    </span>
                  </RouterLink>
                </div>
              </div>
            </section>

            <section v-if="!isProductionNewDocument" class="form-section production-task-workorder-section">
              <div class="form-section-head">
                <h2>关联工单</h2>
                <div class="production-section-actions">
                  <i class="mini-status" :class="taskWorkOrderReleaseSummaryClass">{{ taskWorkOrderReleaseSummary }}</i>
                  <i class="mini-status status-neutral">{{ taskRelatedWorkOrders.length ? `${taskRelatedWorkOrders.length} 张` : '未建工单' }}</i>
                </div>
              </div>

              <div v-if="!taskRelatedWorkOrders.length" class="process-template-empty">
                {{ taskWorkOrderEmptyMessage }}
              </div>

              <div v-else class="production-task-workorder-table">
                <div class="production-task-table-head production-task-workorder-row">
                  <span>工单/成品</span>
                  <span>计划/安排</span>
                  <span>报工/质检/入库</span>
                  <span>当前节点</span>
                  <span>交期/状态</span>
                </div>
                <div v-for="order in taskRelatedWorkOrders" :key="order.code" class="production-task-workorder-row">
                  <span class="production-task-product-cell">
                    <RouterLink
                      class="workbench-inline-link"
                      :to="`/production/work-orders/${encodeURIComponent(order.code)}`"
                      :title="`打开生产工单 ${order.code}`"
                    >
                      {{ order.code }}
                    </RouterLink>
                    <small>{{ order.productName }}</small>
                  </span>
                  <span>
                    <strong>本任务 {{ qty(taskOrderAllocationQty(order), order.unit) }} · 已安排 {{ qty(taskOrderProjectedQty(order, workOrderReleasedQty(order)), order.unit) }}</strong>
                    <small>工单合计 {{ qty(order.planQty, order.unit) }} · 本任务未安排 {{ qty(Math.max(0, taskOrderAllocationQty(order) - taskOrderProjectedQty(order, workOrderReleasedQty(order))), order.unit) }}</small>
                  </span>
                  <span>
                    <strong>报工 {{ qty(taskOrderProjectedQty(order, workOrderReportedQty(order.code)), order.unit) }} · 合格 {{ qty(taskOrderProjectedQty(order, workOrderQuantityChain(order.code, order.planQty).qualifiedQty), order.unit) }}</strong>
                    <small>已入库 {{ qty(taskOrderProjectedQty(order, workOrderQuantityChain(order.code, order.planQty).inboundQty), order.unit) }}</small>
                  </span>
                  <span class="production-task-workorder-node-cell">
                    <strong>{{ workOrderExecutionStageSummary(order.code, order.currentNode) }}</strong>
                    <small>{{ workOrderReleaseStatus(order) }}</small>
                  </span>
                  <span>
                    <strong>{{ order.dueDate }}</strong>
                    <small>{{ productionDisplayTerm(order.status) }}</small>
                  </span>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="workOrderIsEditable">
            <section class="form-section production-work-order-editor work-order-source-allocation-section">
              <div class="form-section-head">
                <div>
                  <h2>任务需求</h2>
                  <small v-if="workOrderDraft.sourceAllocations.length">{{ workOrderSourceAllocationSummary }}</small>
                  <small v-else>选择已确认、尚未完全排产的任务需求</small>
                </div>
                <WorkOrderTaskDemandPicker
                  v-if="workOrderStructureIsEditable && workOrderDraft.sourceAllocations.length && workOrderTaskDemandPickerOptions.length"
                  :options="workOrderTaskDemandPickerOptions"
                  :disabled="workOrderTaskDemandSelectionLocked || !workOrderTaskDemandPickerOptions.length"
                  button-label="追加需求"
                  @select="selectWorkOrderTaskDemand"
                />
              </div>

              <div v-if="workOrderDraft.sourceAllocations.length" class="work-order-source-allocation-list">
                <div class="work-order-source-allocation-head" aria-hidden="true">
                  <span>生产任务 / 来源</span>
                  <span>需求数量</span>
                  <span>本工单数量</span>
                  <span>要求日期</span>
                  <span>操作</span>
                </div>
                <div v-for="(allocation, index) in workOrderDraft.sourceAllocations" :key="`${allocation.taskCode}-${allocation.sourceLineId}`" class="work-order-source-allocation-row">
                  <span class="product-summary">
                    <RouterLink :to="`/production/tasks/${encodeURIComponent(allocation.taskCode)}`"><strong>{{ allocation.taskCode }}</strong></RouterLink>
                    <small>{{ allocation.sourceDocument || '独立生产需求' }}</small>
                  </span>
                  <span class="product-summary work-order-source-demand">
                    <strong>{{ workOrderDemandTotalForAllocation(allocation) }}</strong>
                    <small>当前可分配 {{ workOrderDemandAvailableForAllocation(allocation) }}</small>
                  </span>
                  <div class="work-order-source-allocation-qty">
                    <span class="work-order-source-allocation-qty-label">本工单数量</span>
                    <QuantityWithUnitInput
                      :model-value="allocation.quantity"
                      :unit="allocation.unit"
                      placeholder="数量"
                      :readonly="!workOrderStructureIsEditable"
                      :class="{ 'has-line-field-error': workOrderSourceAllocationQuantityHasError(allocation) }"
                      numeric-value
                      @update:model-value="updateWorkOrderSourceAllocationQuantity(allocation, $event)"
                    />
                  </div>
                  <span class="product-summary work-order-demand-date">
                    <small>要求日期</small>
                    <strong>{{ allocation.dueDate || '—' }}</strong>
                  </span>
                  <button
                    class="secondary-action compact-action"
                    type="button"
                    :disabled="!workOrderStructureIsEditable"
                    title="移除此任务需求"
                    @click="removeWorkOrderSourceAllocation(index)"
                  >移除</button>
                  <div v-if="allocation.supplementaryRequirement || allocation.taskNote" class="work-order-source-context">
                    <div v-if="allocation.supplementaryRequirement">
                      <span>补充要求</span>
                      <p>{{ allocation.supplementaryRequirement }}</p>
                    </div>
                    <div v-if="allocation.taskNote">
                      <span>任务备注</span>
                      <p>{{ allocation.taskNote }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="work-order-source-allocation-empty"
                :class="workOrderRequiredFieldClass('taskCode')"
                data-required-field="work-order-task-demand"
              >
                <span class="work-order-source-allocation-empty-copy">
                  <strong>从任务需求开始建单</strong>
                  <small>选择后自动带出成品与生产标准</small>
                  <small v-if="workOrderTaskDemandSelectionLocked" class="work-order-source-allocation-empty-meta">正在读取任务需求与配方</small>
                  <small v-else class="work-order-source-allocation-empty-meta">
                    {{ workOrderSelectableTaskDemandCount }} 条可选
                    <template v-if="workOrderBlockedTaskDemandCount"> · {{ workOrderBlockedTaskDemandCount }} 条配方待维护</template>
                  </small>
                </span>
                <WorkOrderTaskDemandPicker
                  v-if="workOrderStructureIsEditable"
                  :options="workOrderTaskDemandPickerOptions"
                  :disabled="workOrderTaskDemandSelectionLocked || !workOrderTaskDemandPickerOptions.length"
                  button-label="选择任务需求"
                  primary
                  @select="selectWorkOrderTaskDemand"
                />
              </div>
            </section>

            <section v-if="workOrderDraft.sourceAllocations.length" class="form-section production-work-order-editor production-work-order-basic-section">
              <div class="form-section-head">
                <h2>工单内容</h2>
                <i v-if="!isProductionNewDocument" class="mini-status" :class="statusClass(workOrderDraft.status)">{{ productionDisplayTerm(workOrderDraft.status) }}</i>
              </div>
              <div
                class="recipe-product-overview work-order-product-overview work-order-editor-product-overview"
              >
                <span class="recipe-product-overview-label">生产成品</span>
                <MaterialIdentity
                  :name="workOrderDraftProductIdentity.name"
                  :code="workOrderDraftProductIdentity.code"
                  :model="workOrderDraftProductIdentity.model"
                  :spec="workOrderDraftProductIdentity.spec"
                  :image-tone="productionMaterialIdentityTone(workOrderDraftProductIdentity.code)"
                >
                  <template #supplement>
                    <span class="recipe-product-standard">计划 {{ qty(workOrderDraft.planQty, workOrderDraft.unit) }}</span>
                  </template>
                </MaterialIdentity>
              </div>

              <label class="form-field work-order-note-field">
                <span>工单备注（选填）</span>
                <textarea
                  v-model="workOrderDraft.note"
                  rows="2"
                  :placeholder="isProductionNewDocument ? '填写本工单的生产约束或特殊安排' : '填写本工单的变更说明或执行补充'"
                ></textarea>
              </label>
            </section>

            <section v-if="workOrderDraft.productCode" class="form-section production-work-order-editor production-work-order-binding-section">
              <div class="form-section-head">
                <h2>生产标准</h2>
              </div>

              <div class="work-order-standard-stack">
                <article class="work-order-standard-card" :class="workOrderRequiredFieldClass('recipeCode')" data-required-field="work-order-recipe">
                  <div class="work-order-standard-select-row">
                    <span class="work-order-standard-title">
                      <strong>配方</strong>
                      <small>选择版本后核对本单用料与损耗</small>
                    </span>
                    <label class="form-field">
                      <span class="field-label required-label">配方版本</span>
                      <select v-model="workOrderDraft.recipeCode" :disabled="!workOrderDraft.productCode || !workOrderStructureIsEditable" @change="handleWorkOrderRecipeChange">
                        <option value="">{{ workOrderDraft.productCode ? '请选择配方版本' : '请先选择成品' }}</option>
                        <option v-for="recipe in workOrderRecipeOptions" :key="text(recipe.code)" :value="text(recipe.code, '')">
                          {{ text(recipe.code) }} · {{ text(recipe.version) }} · {{ text(recipe.name) }}
                        </option>
                      </select>
                    </label>
                  </div>

                  <div v-if="workOrderSelectedRecipe" class="work-order-snapshot-block work-order-recipe-snapshot work-order-standard-preview">
                    <div class="work-order-snapshot-summary-grid">
                      <div>
                        <small>配方编号</small>
                        <RouterLink
                          class="production-fact-link"
                          :to="`/production/recipes/${encodeURIComponent(text(workOrderSelectedRecipe.code))}`"
                          title="打开配方版本"
                        >
                          {{ text(workOrderSelectedRecipe.code) }}
                        </RouterLink>
                      </div>
                      <div>
                        <small>版本状态</small>
                        <strong>{{ text(workOrderSelectedRecipe.version) }} · {{ text(workOrderSelectedRecipe.status) }}</strong>
                      </div>
                      <div>
                        <small>每单位净重</small>
                        <strong>{{ formatRecipeQuantity(workOrderSelectedRecipe.productUnitWeightKg, 'kg') }}/{{ text(workOrderSelectedRecipe.outputUnit, workOrderDraft.unit) }}</strong>
                      </div>
                      <div>
                        <small>本单计划</small>
                        <strong>{{ qty(workOrderDraft.planQty, workOrderDraft.unit) }}</strong>
                      </div>
                    </div>

                    <div v-if="workOrderDraftRecipePreviewRows.length" class="work-order-recipe-snapshot-table">
                      <div class="work-order-recipe-snapshot-row is-head">
                        <span>物料</span>
                        <span>计量规则</span>
                        <span>每单位标准</span>
                        <span>本单理论用量<small>不含损耗</small></span>
                        <span>本单预计需求<small>含损耗</small></span>
                      </div>
                      <div v-for="row in workOrderDraftRecipePreviewRows" :key="row.code" class="work-order-recipe-snapshot-row">
                        <span class="work-order-recipe-material-cell">
                          <MaterialIdentity
                            :name="row.name"
                            :code="row.code"
                            :model="row.model"
                            :spec="row.spec"
                            :image-url="row.imageUrl"
                            :image-label="row.imageLabel"
                            :image-tone="row.imageTone"
                          />
                        </span>
                        <span>{{ row.basis }}</span>
                        <span>{{ row.perUnit }}</span>
                        <span>{{ row.plannedNet }}</span>
                        <span><strong>{{ row.plannedWithLoss }}</strong></span>
                      </div>
                    </div>
                    <div v-else class="process-template-empty">该配方尚未维护可读取的用料明细。</div>
                  </div>
                  <div v-else class="process-template-empty work-order-standard-empty">选择配方版本后显示用料与损耗详情。</div>
                </article>

                <article class="work-order-standard-card" :class="workOrderRequiredFieldClass('processTemplateCode')" data-required-field="work-order-process">
                  <div class="work-order-standard-select-row">
                    <span class="work-order-standard-title">
                      <strong>工艺</strong>
                      <small>选择版本后核对温控、路线与作业要求</small>
                    </span>
                    <label class="form-field">
                      <span class="field-label required-label">工艺版本</span>
                      <select v-model="workOrderDraft.processTemplateCode" :disabled="!workOrderDraft.productCode || !workOrderStructureIsEditable">
                        <option value="">{{ workOrderDraft.productCode ? '请选择工艺版本' : '请先选择成品' }}</option>
                        <option v-for="template in workOrderProcessOptions" :key="text(template.code)" :value="text(template.code, '')">
                          {{ text(template.code) }} · {{ text(template.version) }} · {{ text(template.name) }}
                        </option>
                      </select>
                    </label>
                  </div>

                  <div v-if="workOrderSelectedProcessTemplate" class="work-order-snapshot-block work-order-process-snapshot work-order-standard-preview">
                    <div class="work-order-snapshot-summary-grid">
                      <div>
                        <small>工艺编号</small>
                        <RouterLink
                          class="production-fact-link"
                          :to="`/production/process-templates/${encodeURIComponent(text(workOrderSelectedProcessTemplate.code))}`"
                          title="打开工艺版本"
                        >
                          {{ text(workOrderSelectedProcessTemplate.code) }}
                        </RouterLink>
                      </div>
                      <div>
                        <small>版本状态</small>
                        <strong>{{ text(workOrderSelectedProcessTemplate.version) }} · {{ text(workOrderSelectedProcessTemplate.status) }}</strong>
                      </div>
                      <div>
                        <small>工艺路线</small>
                        <strong>{{ text(workOrderSelectedProcessTemplate.routeType, '-') }}</strong>
                      </div>
                      <div>
                        <small>适用产线</small>
                        <strong>{{ toArray<string>(workOrderSelectedProcessTemplate.lineTypes).join('、') || '-' }}</strong>
                      </div>
                    </div>

                    <div class="work-order-snapshot-subhead">
                      <strong>温控参数</strong>
                      <small>固定 14 区 · 允差 {{ text(workOrderSelectedProcessTemplate.temperatureTolerance, '-') }}</small>
                    </div>
                    <div class="work-order-snapshot-zone-grid">
                      <span v-for="zone in workOrderDraftProcessPreviewZones" :key="zone.name">
                        <small>{{ zone.name }}</small>
                        <strong>{{ zone.value }}</strong>
                      </span>
                    </div>

                    <div class="work-order-snapshot-subhead is-route-head">
                      <strong>工艺路线</strong>
                      <small>{{ workOrderDraftProcessPreviewSteps.length }} 道工序</small>
                    </div>
                    <div v-if="workOrderDraftProcessPreviewSteps.length" class="work-order-process-snapshot-steps">
                      <article v-for="step in workOrderDraftProcessPreviewSteps" :key="step.code" class="work-order-process-snapshot-step">
                        <header>
                          <b>{{ step.sequence }}</b>
                          <span>
                            <strong>{{ step.name }}</strong>
                            <small>{{ step.code }} · {{ step.owner }} · {{ step.executionMode }}</small>
                          </span>
                          <i>{{ step.action }}</i>
                        </header>
                        <div class="work-order-process-snapshot-guidance">
                          <div>
                            <small>核心设备</small>
                            <p>{{ step.equipment }}</p>
                          </div>
                          <div>
                            <small>作业要求</small>
                            <p>{{ step.workContent }}</p>
                          </div>
                          <div>
                            <small>异常处理</small>
                            <p>{{ step.abnormalRule }}</p>
                          </div>
                        </div>
                      </article>
                    </div>
                    <div v-else class="process-template-empty">该工艺尚未维护可读取的工序路线。</div>
                  </div>
                  <div v-else class="process-template-empty work-order-standard-empty">选择工艺版本后显示温控、路线和作业详情。</div>
                </article>
              </div>
            </section>

          </template>

          <template v-else-if="isMaterialRequestDocument">
            <section class="form-section production-material-request-basic-section">
              <div class="form-section-head">
                <h2>申请基础</h2>
                <i v-if="materialRequestIsEditable && !isProductionNewDocument" class="mini-status" :class="statusClass(materialRequestDraft.status)">{{ materialRequestDraft.status }}</i>
              </div>

              <DocumentFactGrid
                v-if="!materialRequestIsEditable"
                :facts="materialRequestDocumentBasicFacts"
                aria-label="备料申请基础信息"
              />

              <div v-else class="quote-fields production-material-request-fields">
                <label class="form-field">
                  <span>申请单号</span>
                  <input v-model="materialRequestDraft.code" type="text" readonly />
                </label>
                <label class="form-field" :class="materialRequestRequiredFieldClass('requestType')" data-required-field="material-request-type">
                  <span class="field-label required-label">申请类型</span>
                  <select v-model="materialRequestDraft.requestType" :disabled="Boolean(materialRequestDraft.sourceTaskCode)">
                    <option v-for="option in materialRequestSelectableTypeOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </label>
                <label v-if="materialRequestDraft.sourceTaskCode" class="form-field">
                  <span>来源任务</span>
                  <input :value="materialRequestDraft.sourceTaskCode" type="text" readonly />
                </label>
                <label v-if="materialRequestDraft.sourceDocument && materialRequestDraft.sourceDocument !== '无'" class="form-field">
                  <span>需求来源</span>
                  <input :value="materialRequestDraft.sourceDocument" type="text" readonly />
                </label>
                <label class="form-field" :class="materialRequestRequiredFieldClass('department')" data-required-field="material-request-department">
                  <span class="field-label required-label">需求部门</span>
                  <input :value="materialRequestDraft.department" type="text" readonly title="由当前登录账号所属部门带入" />
                </label>
                <label class="form-field" :class="materialRequestRequiredFieldClass('requester')" data-required-field="material-request-requester">
                  <span class="field-label required-label">申请人</span>
                  <input :value="materialRequestDraft.requester" type="text" readonly title="由当前登录账号带入，提交后冻结" />
                </label>
                <label class="form-field">
                  <span>申请日期</span>
                  <input v-model="materialRequestDraft.requestDate" type="date" readonly />
                </label>
                <label class="form-field" :class="materialRequestRequiredFieldClass('expectedDate')" data-required-field="material-request-expected-date">
                  <span class="field-label required-label">需求日期</span>
                  <input
                    v-model="materialRequestDraft.expectedDate"
                    type="date"
                    :min="materialRequestDraft.sourceTaskCode ? undefined : materialRequestDraft.requestDate || undefined"
                  />
                </label>
                <label v-if="materialRequestDraft.linkedPurchaseRequisition" class="form-field">
                  <span>采购需求</span>
                  <input :value="materialRequestDraft.linkedPurchaseRequisition" type="text" readonly />
                </label>
                <label class="form-field full-field">
                  <span>备注</span>
                  <textarea v-model="materialRequestDraft.note" rows="2" placeholder="填写必要的补料说明"></textarea>
                </label>
              </div>
            </section>

            <section class="form-section production-material-request-line-section">
              <div class="form-section-head">
                <h2>备料明细</h2>
                <button v-if="materialRequestLinesAreEditable" type="button" class="secondary-action compact-action" title="添加备料明细" @click="addMaterialRequestLine">
                  <Plus :size="15" />
                  添加
                </button>
              </div>

              <div class="production-task-mini-strip">
                <span>明细 <strong>{{ materialRequestLines.length }} 项</strong></span>
                <span>{{ materialRequestDraft.sourceTaskCode ? '任务总需' : '申请数量' }} <strong>{{ materialRequestDraft.sourceTaskCode ? materialRequestTaskRequiredSummary : materialRequestEditorRequestedSummary }}</strong></span>
                <span :class="{ warn: !materialRequestEvaluationPending && materialRequestPurchaseTotal > 0 }">{{ materialRequestDraft.sourceTaskCode ? '本次采购' : '库存/采购' }} <strong>{{ materialRequestDraft.sourceTaskCode ? materialRequestRequestedSummary : materialRequestPurchaseSummary }}</strong></span>
              </div>

              <div class="production-material-request-table">
                <div class="production-task-table-head production-material-request-row" :class="materialRequestLinesAreEditable ? 'is-edit-request-row' : 'is-readonly-request-row'">
                  <span>物料</span>
                  <span>{{ materialRequestDraft.sourceTaskCode ? '任务总需' : '申请数量' }}</span>
                  <span v-if="!materialRequestLinesAreEditable">{{ materialRequestDraft.sourceTaskCode ? '已有/补充覆盖' : '库存覆盖' }}</span>
                  <span v-if="!materialRequestLinesAreEditable">采购缺口</span>
                  <span>{{ materialRequestLinesAreEditable ? '用途*' : '用途' }}</span>
                  <span v-if="materialRequestLinesAreEditable">操作</span>
                </div>
                <div
                  v-for="line in materialRequestLines"
                  :key="line.lineId"
                  class="production-material-request-row"
                  :class="materialRequestLinesAreEditable ? 'is-edit-request-row' : 'is-readonly-request-row'"
                >
                  <span class="production-task-product-cell" :class="materialRequestLineFieldClass(line, 'material')" data-required-field="material-request-material">
                    <template v-if="materialRequestLinesAreEditable">
                      <ReferencePicker
                        required
                        :model-value="line.materialCode"
                        type="materials"
                        kind="非成品"
                        title="选择备料物料"
                        placeholder="选择原料或包材"
                        search-placeholder="搜索物料编码、名称、型号或规格"
                        :display-value="materialRequestLineDisplay(line)"
                        :disabled="!materialRequestLinesAreEditable"
                        hide-meta
                        @select="(option) => handleMaterialRequestMaterialSelect(line, option)"
                      />
                      <small>{{ line.materialCode || '-' }} · {{ line.unit || '-' }}</small>
                    </template>
                    <template v-else>
                      <MaterialIdentity
                        compact
                        :name="line.materialName"
                        :code="line.materialCode"
                        :model="line.model"
                        :spec="line.spec"
                        :image-tone="productionMaterialIdentityTone(line.materialCode)"
                      />
                    </template>
                  </span>
                  <span :class="materialRequestLineFieldClass(line, 'requestedQty')" data-required-field="material-request-qty">
                    <input v-if="materialRequestLinesAreEditable" v-model="line.requestedQty" type="number" min="0" step="0.001" />
                    <template v-else>{{ qty(materialRequestDraft.sourceTaskCode ? line.taskEstimatedQty : line.requestedQty, line.unit) }}</template>
                  </span>
                  <span v-if="!materialRequestLinesAreEditable">
                    <template v-if="materialRequestDraft.status === '草稿'">待评估</template>
                    <template v-else-if="materialRequestEvaluationPending">评估中</template>
                    <template v-else>{{ qty(materialRequestCoveredQty(line), line.unit) }}</template>
                  </span>
                  <span v-if="!materialRequestLinesAreEditable">
                    <template v-if="materialRequestDraft.status === '草稿'">待评估</template>
                    <template v-else-if="materialRequestEvaluationPending">评估中</template>
                    <template v-else>{{ qty(line.purchaseQty, line.unit) }}</template>
                  </span>
                  <span
                    class="production-material-request-purpose-cell"
                    :class="materialRequestLineFieldClass(line, 'purpose')"
                    data-required-field="material-request-purpose"
                  >
                    <input v-if="materialRequestLinesAreEditable" v-model="line.purpose" type="text" required placeholder="说明该行物料的具体用途" />
                    <template v-else>{{ line.purpose || '-' }}</template>
                  </span>
                  <span v-if="materialRequestLinesAreEditable" class="row-action-cell">
                    <button
                      type="button"
                      class="danger-icon-button"
                      :disabled="materialRequestLines.length <= 1"
                      aria-label="删除备料明细"
                      :title="materialRequestLines.length <= 1 ? '至少保留一项物料' : '删除备料明细'"
                      @click="removeMaterialRequestLine(line.lineId)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </span>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="isRecipeDocument">
            <section class="form-section production-recipe-basic-section">
              <div class="form-section-head">
                <h2>配方基础</h2>
              </div>

              <div v-if="!recipeIsEditable" class="recipe-product-overview">
                <span class="recipe-product-overview-label">产出物料</span>
                <MaterialIdentity
                  :name="recipeDraft.productName"
                  :code="recipeDraft.productCode"
                >
                  <template #supplement>
                    <span class="recipe-product-standard">
                      基础单位 {{ recipeDraft.outputUnit || '-' }} · 每单位净重
                      {{ formatKg(recipeDraft.productUnitWeightKg) }} kg/{{ recipeDraft.outputUnit || '-' }}
                    </span>
                  </template>
                </MaterialIdentity>
              </div>

              <DocumentFactGrid
                v-if="!recipeIsEditable"
                :facts="recipeDocumentBasicFacts"
                aria-label="生产配方基础信息"
              />

              <div v-else class="quote-fields production-recipe-fields">
                <label class="form-field recipe-product-field" :class="recipeRequiredFieldClass('productCode')" data-required-field="recipe-product">
                  <span class="field-label required-label">产出物料</span>
                  <ReferencePicker
                    required
                    v-model="recipeDraft.productCode"
                    type="materials"
                    kind="生产产出"
                    placeholder="选择成品或半成品"
                    search-placeholder="搜索物料编码、名称、型号或规格"
                    :display-value="recipeProductDisplay"
                    :disabled="!recipeIsEditable || recipeProductSelectionLocked"
                    :title="recipeProductSelectionLocked ? '创建下一版时沿用来源版本的产出物料' : '选择产出物料'"
                    hide-meta
                    @select="handleRecipeProductSelect"
                  />
                </label>
                <label class="form-field" :class="recipeRequiredFieldClass('version')" data-required-field="recipe-version">
                  <span class="field-label required-label">版本号</span>
                  <input :value="recipeDraft.version" type="text" readonly title="版本号由产出物料的历史配方自动生成" />
                </label>
                <label class="form-field">
                  <span>产出单位</span>
                  <input
                    :value="recipeDraft.outputUnit"
                    type="text"
                    readonly
                    placeholder="选择产出物料后带入"
                    title="单位来自产出物料资料"
                  />
                </label>
                <label class="form-field" :class="recipeRequiredFieldClass('productUnitWeightKg')" data-required-field="recipe-unit-weight">
                  <span class="field-label required-label">每单位净重 kg</span>
                  <input
                    v-model="recipeDraft.productUnitWeightKg"
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="例如 1.2"
                    :readonly="!recipeIsEditable"
                  />
                </label>
                <label class="form-field full-field">
                  <span>备注</span>
                  <textarea v-model="recipeDraft.note" rows="2" placeholder="填写变更原因、适用限制或生产注意事项"></textarea>
                </label>
              </div>
            </section>

            <section class="form-section production-recipe-detail-section production-recipe-composition-section">
              <div class="form-section-head recipe-section-head recipe-composition-title">
                <div>
                  <h2>配方明细</h2>
                </div>
              </div>

              <div class="recipe-composition-group">
                <div class="recipe-subsection-head">
                  <div>
                    <h3>投料组成</h3>
                  </div>
                  <div class="recipe-section-actions">
                    <span
                      :class="{ 'has-balance-warning': recipePercentLineCount && !recipePercentTotalIsBalanced }"
                      :title="recipePercentTotalTitle"
                    >
                      <template v-if="recipePercentLineCount">
                        {{ recipePercentLineCount }} 项 · 合计 {{ formatPercent(recipePercentTotal) }}
                      </template>
                      <template v-else>{{ recipeIsEditable ? '待填写' : '0 项' }}</template>
                    </span>
                    <button
                      v-if="recipeIsEditable"
                      class="secondary-action compact-action"
                      type="button"
                      title="添加投料组成"
                      aria-label="添加投料组成"
                      @click="addRecipeLine('percent')"
                    >
                      <Plus :size="15" />
                      添加
                    </button>
                  </div>
                </div>

                <div v-if="!recipePercentMaterials.length" class="recipe-loss-empty">暂无投料组成</div>
                <div
                  v-else
                  class="production-recipe-readonly-table production-recipe-edit-table"
                  :class="{ 'production-recipe-editor-table': recipeIsEditable }"
                >
                <div class="production-recipe-readonly-head production-recipe-readonly-row production-recipe-edit-row">
                  <span>物料</span>
                  <span>投料占比</span>
                  <span>每单位净用量</span>
                  <span v-if="recipeIsEditable" class="recipe-line-action-head" aria-hidden="true"></span>
                </div>
                <div
                  v-for="entry in recipePercentMaterials"
                  :key="entry.line.lineId"
                  class="production-recipe-readonly-row production-recipe-edit-row"
                >
                  <span class="recipe-readonly-material recipe-edit-material-cell">
                    <ReferencePicker
                      v-if="recipeIsEditable"
                      required
                      :model-value="entry.line.materialCode"
                      type="materials"
                      kind="非成品"
                      title="选择投料物料"
                      placeholder="选择原料、色母或助剂"
                      search-placeholder="搜索物料编码、名称、型号或规格"
                      :display-value="productIdentity(entry.line.materialCode, entry.line.materialName, '选择投料物料')"
                      :exclude-codes="recipeMaterialExcludeCodes(entry.index)"
                      empty-text="可选物料都已在当前配方中使用"
                      :class="recipeLineFieldClass(entry.line, 'material')"
                      hide-meta
                      @select="handleRecipeMaterialSelect(entry.index, $event)"
                    />
                    <MaterialIdentity
                      v-else
                      compact
                      :name="entry.line.materialName || '未选择物料'"
                      :code="entry.line.materialCode"
                    >
                      <template #supplement>
                        <span class="recipe-material-tags">
                          <em>{{ entry.line.unit || '-' }}</em>
                          <em>{{ entry.line.incomingQcRequired ? '来料需检' : '免来料检' }}</em>
                        </span>
                      </template>
                    </MaterialIdentity>
                  </span>
                  <span class="recipe-readonly-quantity recipe-edit-quantity-cell">
                    <label v-if="recipeIsEditable" class="recipe-edit-number-field recipe-inline-unit-field">
                      <input
                        v-model="entry.line.percent"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0"
                        aria-label="投料占比 %"
                        :class="recipeLineFieldClass(entry.line, 'percent')"
                      />
                      <small>%</small>
                    </label>
                    <strong v-else>{{ formatPercent(entry.line.percent) }}</strong>
                  </span>
                  <span class="recipe-required-cell recipe-edit-required-cell">
                    <strong :class="{ 'is-pending-value': Boolean(recipeLineRequiredPendingText(entry.line)) }">
                      {{ recipeLineRequiredValue(entry.line) }}
                    </strong>
                  </span>
                  <span v-if="recipeIsEditable" class="recipe-line-action-cell">
                    <button
                      class="icon-button danger-icon-button"
                      type="button"
                      title="删除投料行"
                      aria-label="删除投料行"
                      @click="removeRecipeLine(entry.index)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </span>
                </div>
                </div>
              </div>

              <div class="recipe-composition-group">
                <div class="recipe-subsection-head">
                  <div>
                    <h3>固定用量</h3>
                  </div>
                  <div class="recipe-section-actions">
                    <span>{{ recipeFixedLineCount }} 项</span>
                    <button
                      v-if="recipeIsEditable"
                      class="secondary-action compact-action"
                      type="button"
                      title="添加固定用量"
                      aria-label="添加固定用量"
                      @click="addRecipeLine('fixed')"
                    >
                      <Plus :size="15" />
                      添加
                    </button>
                  </div>
                </div>

                <div v-if="!recipeFixedMaterials.length" class="recipe-loss-empty">
                  {{ recipeIsEditable ? '暂无固定用量，可按需要添加' : '未设置固定用量' }}
                </div>
                <div
                  v-else
                  class="production-recipe-readonly-table production-recipe-edit-table"
                  :class="{ 'production-recipe-editor-table': recipeIsEditable }"
                >
                <div class="production-recipe-readonly-head production-recipe-readonly-row production-recipe-fixed-row">
                  <span>物料</span>
                  <span>每单位固定用量</span>
                  <span v-if="recipeIsEditable" class="recipe-line-action-head" aria-hidden="true"></span>
                </div>
                <div
                  v-for="entry in recipeFixedMaterials"
                  :key="entry.line.lineId"
                  class="production-recipe-readonly-row production-recipe-fixed-row is-fixed-line"
                >
                  <span class="recipe-readonly-material recipe-edit-material-cell">
                    <ReferencePicker
                      v-if="recipeIsEditable"
                      required
                      :model-value="entry.line.materialCode"
                      type="materials"
                      kind="非成品"
                      title="选择固定耗用物料"
                      placeholder="选择固定耗用物料"
                      search-placeholder="搜索物料编码、名称、型号或规格"
                      :display-value="productIdentity(entry.line.materialCode, entry.line.materialName, '选择固定耗用物料')"
                      :exclude-codes="recipeMaterialExcludeCodes(entry.index)"
                      empty-text="可选物料都已在当前配方中使用"
                      :class="recipeLineFieldClass(entry.line, 'material')"
                      hide-meta
                      @select="handleRecipeMaterialSelect(entry.index, $event)"
                    />
                    <MaterialIdentity
                      v-else
                      compact
                      :name="entry.line.materialName || '未选择物料'"
                      :code="entry.line.materialCode"
                    >
                      <template #supplement>
                        <span class="recipe-material-tags">
                          <em>{{ entry.line.unit || '-' }}</em>
                          <em>{{ entry.line.incomingQcRequired ? '来料需检' : '免来料检' }}</em>
                        </span>
                      </template>
                    </MaterialIdentity>
                  </span>
                  <span class="recipe-readonly-quantity recipe-edit-quantity-cell recipe-fixed-quantity-cell">
                    <label v-if="recipeIsEditable" class="recipe-edit-number-field recipe-inline-unit-field">
                      <input
                        v-model="entry.line.perUnitQty"
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="0"
                        :aria-label="`每单位固定用量 ${entry.line.unit || ''}`"
                        :class="recipeLineFieldClass(entry.line, 'perUnitQty')"
                      />
                      <small>{{ entry.line.unit || '单位' }}</small>
                    </label>
                    <strong v-else>{{ recipeLineUsageValue(entry.line) }}</strong>
                  </span>
                  <span v-if="recipeIsEditable" class="recipe-line-action-cell">
                    <button
                      class="icon-button danger-icon-button"
                      type="button"
                      title="删除固定用量行"
                      aria-label="删除固定用量行"
                      @click="removeRecipeLine(entry.index)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </span>
                </div>
                </div>
              </div>
            </section>

            <section class="form-section production-recipe-loss-section">
              <div class="form-section-head recipe-section-head">
                <div>
                  <h2>预估损耗规则</h2>
                </div>
                <button
                  v-if="recipeIsEditable"
                  class="secondary-action compact-action"
                  type="button"
                  title="添加预估损耗规则"
                  aria-label="添加预估损耗规则"
                  @click="addRecipeEstimatedLossLine"
                >
                  <Plus :size="15" />
                  添加
                </button>
              </div>

              <div v-if="!recipeDraft.estimatedLosses.length" class="recipe-loss-empty">
                <span>{{ recipeIsEditable ? '暂无预估损耗规则，可按需要添加' : '未设置预估损耗规则' }}</span>
              </div>

              <div
                v-else
                class="production-recipe-readonly-table production-recipe-loss-table"
                :class="{ 'production-recipe-editor-table': recipeIsEditable }"
              >
                <div class="production-recipe-readonly-head production-recipe-readonly-row production-recipe-loss-row">
                  <span>物料</span>
                  <span>任务固定损耗</span>
                  <span>比例损耗</span>
                  <span>预计需求公式</span>
                  <span v-if="recipeIsEditable" class="recipe-line-action-head" aria-hidden="true"></span>
                </div>
                <div
                  v-for="(line, index) in recipeDraft.estimatedLosses"
                  :key="line.lineId"
                  class="production-recipe-readonly-row production-recipe-loss-row"
                >
                  <span class="recipe-readonly-material recipe-loss-material-cell">
                    <template v-if="recipeIsEditable">
                      <select
                        :value="line.materialCode"
                        :class="recipeEstimatedLossFieldClass(line, 'material')"
                        :aria-label="`损耗物料 ${index + 1}`"
                        @change="handleRecipeEstimatedLossMaterialChange(line, $event)"
                      >
                        <option value="">选择损耗物料</option>
                        <option v-for="option in recipeLossMaterialOptions(index)" :key="option.code" :value="option.code">
                          {{ option.name }} · {{ option.code }}
                        </option>
                      </select>
                    </template>
                    <template v-else>
                      <MaterialIdentity
                        compact
                        :name="line.materialName || '未选择物料'"
                        :code="line.materialCode"
                      >
                        <template #supplement>
                          <span class="recipe-material-tags">
                            <em>{{ line.unit || '-' }}</em>
                          </span>
                        </template>
                      </MaterialIdentity>
                    </template>
                  </span>
                  <span class="recipe-loss-input-cell recipe-loss-fixed-cell">
                    <input
                      v-if="recipeIsEditable"
                      v-model="line.fixedLossQty"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0"
                      :aria-label="`任务固定损耗 ${line.materialName || line.materialCode || index + 1}`"
                      :class="recipeEstimatedLossFieldClass(line, 'fixedLossQty')"
                    />
                    <strong v-else>{{ recipeEstimatedLossFixedValue(line) }}</strong>
                    <small v-if="recipeIsEditable">{{ line.unit || '-' }}</small>
                  </span>
                  <span class="recipe-loss-input-cell recipe-loss-rate-cell">
                    <input
                      v-if="recipeIsEditable"
                      v-model="line.lossRatePercent"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      :aria-label="`比例损耗 ${line.materialName || line.materialCode || index + 1}`"
                      :class="recipeEstimatedLossFieldClass(line, 'lossRatePercent')"
                    />
                    <strong v-else>{{ formatPercent(line.lossRatePercent) }}</strong>
                    <small v-if="recipeIsEditable">%</small>
                  </span>
                  <span class="recipe-required-cell recipe-loss-formula-cell">
                    <strong>{{ recipeEstimatedLossFormula(line) }}</strong>
                  </span>
                  <span v-if="recipeIsEditable" class="recipe-line-action-cell">
                    <button
                      class="icon-button danger-icon-button"
                      type="button"
                      title="删除此损耗行"
                      aria-label="删除此损耗行"
                      @click="removeRecipeEstimatedLossLine(index)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </span>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="isProcessTemplateDocument">
            <section class="form-section production-process-template-basic-section">
              <div class="form-section-head">
                <h2>工艺基础</h2>
              </div>

              <DocumentFactGrid
                v-if="!processTemplateIsEditable"
                :facts="processTemplateDocumentBasicFacts"
                aria-label="生产工艺基础信息"
                :max-columns="3"
              />

              <div v-else class="quote-fields production-process-template-fields">
                <label v-if="!isProductionNewDocument" class="form-field">
                  <span>工艺编号</span>
                  <input v-model="processTemplateDraft.code" type="text" readonly />
                </label>
                <label v-else-if="processTemplateDraft.sourceProcessTemplateCode" class="form-field">
                  <span>来源版本</span>
                  <RouterLink
                    class="production-fact-link process-template-source-link"
                    :to="`/production/process-templates/${encodeURIComponent(processTemplateDraft.sourceProcessTemplateCode)}`"
                  >
                    {{ processTemplateDraft.sourceProcessTemplateCode }}
                  </RouterLink>
                </label>
                <label
                  class="form-field process-template-name-field"
                  :class="processTemplateRequiredFieldClass('name')"
                  data-required-field="process-template-name"
                >
                  <span class="field-label required-label">工艺名称</span>
                  <input
                    v-model="processTemplateDraft.name"
                    type="text"
                    placeholder="例如 挤出成品标准工艺"
                    :readonly="processTemplateVersionIdentityLocked"
                    :title="processTemplateVersionIdentityLocked ? '创建下一版时沿用来源工艺名称' : '填写工艺名称'"
                  />
                </label>
                <label class="form-field" :class="processTemplateRequiredFieldClass('version')" data-required-field="process-template-version">
                  <span class="field-label required-label">版本号</span>
                  <input v-model="processTemplateDraft.version" type="text" readonly title="版本号由工艺版本链自动生成" />
                </label>
                <label class="form-field">
                  <span>生产路线</span>
                  <select
                    v-model="processTemplateDraft.routeType"
                    :disabled="!isProductionNewDocument || processTemplateVersionIdentityLocked"
                    :title="processTemplateVersionIdentityLocked ? '创建下一版时沿用来源生产路线' : !isProductionNewDocument ? '工艺草稿保存后生产路线不可切换' : '选择标准生产路线并生成对应工艺骨架'"
                    @change="applyProcessTemplateRoutePreset"
                  >
                    <option>直接收卷</option>
                    <option>大盘复绕</option>
                  </select>
                </label>
                <label class="form-field" :class="processTemplateRequiredFieldClass('productFamily')" data-required-field="process-template-product-family">
                  <span class="field-label required-label">适用产品族</span>
                  <input v-model="processTemplateDraft.productFamily" type="text" placeholder="例如 PLA、PETG 耗材" />
                </label>
                <label class="form-field process-template-line-types-field" :class="processTemplateRequiredFieldClass('lineTypes')" data-required-field="process-template-line-types">
                  <span class="field-label required-label">适用产线</span>
                  <input v-model="processTemplateLineTypesText" type="text" placeholder="例如 挤出机、拉丝机、复绕机" />
                </label>
              </div>
            </section>

            <section class="form-section production-process-template-zone-section">
              <div class="form-section-head">
                <h2>温控参数</h2>
                <label
                  v-if="processTemplateIsEditable"
                  class="process-template-tolerance-control"
                  :class="processTemplateToleranceFieldClass()"
                  data-required-field="process-template-temperature-tolerance"
                >
                  <span class="field-label required-label">统一允差</span>
                  <input
                    v-model="processTemplateDraft.temperatureTolerance"
                    type="text"
                    placeholder="例如 ±5℃ 或按工艺卡"
                    aria-label="温控统一允差"
                  />
                </label>
                <span v-else class="process-template-zone-unit-note">℃ · 统一允差 {{ processTemplateDraft.temperatureTolerance || '未记录' }}</span>
              </div>

              <div
                v-if="processTemplateDraft.temperatureZones.length"
                class="process-template-temperature-matrix"
                :class="{ 'is-readonly-matrix': !processTemplateIsEditable }"
              >
                <div
                  v-for="(group, groupIndex) in processTemplateZoneGroups(processTemplateDraft.temperatureZones)"
                  :key="`zone-group-${groupIndex}`"
                  class="process-template-zone-group"
                  :style="{ '--zone-count': group.length }"
                >
                  <label
                    v-for="(zone, index) in group"
                    :key="zone.lineId"
                    class="process-template-zone-item"
                  >
                    <span>{{ processTemplateZoneLabel(zone, groupIndex * 7 + index) }}</span>
                    <input
                      v-if="processTemplateIsEditable"
                      v-model="zone.value"
                      type="number"
                      step="1"
                      :aria-label="`${processTemplateZoneLabel(zone, groupIndex * 7 + index)}温度`"
                      :class="processTemplateZoneFieldClass(zone)"
                    />
                    <strong v-else>{{ processTemplateTemperatureDisplay(zone.value) }}</strong>
                  </label>
                </div>
              </div>
              <div v-else class="process-template-empty">未设置温区</div>
            </section>

            <section
              class="form-section production-process-template-step-section"
              :class="processTemplateRequiredFieldClass('steps')"
              data-required-field="process-template-steps"
            >
              <div class="form-section-head">
                <h2>工艺路线</h2>
              </div>

              <div
                v-if="processTemplateDraft.steps.length"
                class="process-template-step-board"
                :class="{
                  'is-readonly-board': !processTemplateIsEditable,
                }"
              >
                <article
                  v-for="(line, index) in processTemplateDraft.steps"
                  :key="line.lineId"
                  class="process-template-step-line"
                >
                  <div class="process-template-step-content">
                    <div v-if="!processTemplateIsEditable" class="process-template-stage-readonly">
                      <div class="process-template-stage-overview">
                        <div class="process-template-stage-identity">
                          <span class="process-template-step-index" aria-label="阶段顺序">{{ index + 1 }}</span>
                          <strong :title="processTemplateStepName(line.stepCode, processTemplateDraft.routeType)">{{ processTemplateStepName(line.stepCode, processTemplateDraft.routeType) }}</strong>
                          <i class="process-template-node-type">{{ processTemplateNodeType(line.stepCode) }}</i>
                        </div>
                        <div class="process-template-stage-fact is-action-fact">
                          <span>系统动作</span>
                          <strong>
                            <RouterLink
                              v-for="action in processTemplateBoundSystemActions(line.stepCode)"
                              :key="action.code"
                              class="process-template-system-action-link"
                              :to="`/production/process-steps/${encodeURIComponent(action.code)}`"
                            >
                              {{ action.name }}
                            </RouterLink>
                          </strong>
                        </div>
                        <div class="process-template-stage-fact">
                          <span>流转方式</span>
                          <strong>{{ processTemplateExecutionRule(line.stepCode, processTemplateDraft.routeType) }}</strong>
                        </div>
                      </div>

                      <div class="process-template-stage-execution">
                        <div class="process-template-stage-fact is-core-fact">
                          <span>核心设备</span>
                          <strong>{{ line.coreEquipment || '-' }}</strong>
                        </div>
                        <div class="process-template-stage-fact is-completion-fact">
                          <span>完成条件</span>
                          <strong>{{ line.controlPoints || '-' }}</strong>
                        </div>
                        <div class="process-template-stage-fact is-long-fact">
                          <span>作业要求</span>
                          <strong>{{ line.workContent || '-' }}</strong>
                        </div>
                        <div class="process-template-stage-fact is-long-fact">
                          <span>异常处理</span>
                          <strong>{{ line.commonIssues || '-' }}</strong>
                        </div>
                      </div>
                    </div>

                    <template v-else>
                      <div class="process-template-step-line-top">
                        <div class="process-template-step-picker">
                          <span class="process-template-step-index" aria-label="阶段顺序">{{ index + 1 }}</span>
                          <strong class="process-template-node-name">{{ processTemplateStepName(line.stepCode, processTemplateDraft.routeType) }}</strong>
                          <i class="process-template-node-type">{{ processTemplateNodeType(line.stepCode) }}</i>
                          <small v-if="!line.expanded" :title="line.coreEquipment || '核心设备待补充'">{{ line.coreEquipment || '核心设备待补充' }}</small>
                        </div>

                        <div class="process-template-step-action-inline">
                          <span>系统动作</span>
                          <strong>
                            <RouterLink
                              v-for="action in processTemplateBoundSystemActions(line.stepCode)"
                              :key="action.code"
                              class="process-template-system-action-link"
                              :to="`/production/process-steps/${encodeURIComponent(action.code)}`"
                            >
                              {{ action.name }}
                            </RouterLink>
                          </strong>
                        </div>

                        <div class="process-template-step-action-inline">
                          <span>流转方式</span>
                          <strong>{{ processTemplateExecutionRule(line.stepCode, processTemplateDraft.routeType) }}</strong>
                        </div>

                        <div class="process-template-row-actions">
                          <button
                            class="secondary-action compact-action process-template-expand-action"
                            type="button"
                            :title="line.expanded ? '收起阶段设置' : '展开阶段设置'"
                            @click="toggleProcessTemplateStep(line)"
                          >
                            <ChevronUp v-if="line.expanded" :size="14" />
                            <ChevronDown v-else :size="14" />
                            {{ line.expanded ? '收起' : '设置' }}
                          </button>
                        </div>
                      </div>

                      <div
                        v-if="line.expanded"
                        class="process-template-work-lines"
                        :class="{ 'is-new-work-lines': isProductionNewDocument }"
                      >
                        <label class="process-template-work-line process-template-work-content-line is-core-field">
                          <span>核心设备</span>
                          <input v-model="line.coreEquipment" type="text" placeholder="例如 拉丝机、烘干设备或包装工位" />
                        </label>
                        <label class="process-template-work-line is-work-field">
                          <span>作业要求</span>
                          <textarea v-model="line.workContent" rows="2" placeholder="填写本阶段现场要执行的作业要求"></textarea>
                        </label>
                        <label class="process-template-work-line is-completion-field">
                          <span>完成条件</span>
                          <textarea v-model="line.controlPoints" rows="2" placeholder="填写事件、数量或外部放行条件"></textarea>
                        </label>
                        <label class="process-template-work-line is-issue-field">
                          <span>异常处理</span>
                          <textarea v-model="line.commonIssues" rows="2" placeholder="填写阻断、返工、复检或返回阶段规则"></textarea>
                        </label>
                      </div>
                    </template>
                  </div>
                </article>
              </div>
              <div v-else class="process-template-empty">暂无工艺阶段</div>
            </section>

            <section v-if="processTemplateUsesInlineAttachments" class="form-section production-process-template-attachment-section">
              <div class="form-section-head">
                <h2>附件</h2>
                <label
                  class="secondary-action compact-action file-upload-button"
                  :class="{ 'is-disabled': productionEditableActionDisabled }"
                  :aria-disabled="productionEditableActionDisabled"
                  :title="productionDocumentAttachmentTitle"
                >
                  <Upload :size="15" />
                  上传
                  <input type="file" multiple :disabled="productionEditableActionDisabled" @change="handleAttachmentUpload" />
                </label>
              </div>

              <div v-if="productionAttachments.length" class="attachment-list production-process-template-attachment-list">
                <div v-for="file in productionAttachments" :key="`${file.name}-${file.date}`" class="attachment-row">
                  <span class="attachment-icon">
                    <Paperclip :size="16" />
                  </span>
                  <div>
                    <strong>{{ file.name }}</strong>
                    <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                  </div>
                </div>
              </div>
              <div v-else class="attachment-empty production-process-template-attachment-empty">
                <Paperclip :size="17" />
                <span>{{ productionDocumentAttachmentEmptyText }}</span>
              </div>
            </section>
          </template>

          <template v-else-if="isProcessStepDocument">
            <section class="form-section production-process-step-basic-section">
              <div class="form-section-head">
                <h2>动作定义</h2>
                <i class="mini-status status-neutral">系统固定</i>
              </div>
              <DocumentFactGrid
                v-if="!processStepIsEditable"
                :facts="processStepDocumentBasicFacts"
                aria-label="系统动作定义信息"
              />
              <div v-else class="quote-fields production-process-step-fields">
                <label class="form-field">
                  <span>动作编号</span>
                  <input v-model="processStepDraft.code" type="text" readonly />
                </label>
                <label class="form-field process-step-name-field" :class="processStepRequiredFieldClass('name')" data-required-field="process-step-name">
                  <span class="field-label required-label">动作名称</span>
                  <input v-model="processStepDraft.name" type="text" placeholder="例如 领料烘干、开机检、成品报工" :readonly="!processStepIsEditable" />
                </label>
                <label class="form-field">
                  <span>启用状态</span>
                  <select v-if="processStepIsEditable" v-model="processStepDraft.status">
                    <option>启用</option>
                    <option>停用</option>
                  </select>
                  <input v-else :value="processStepDraft.status" type="text" readonly />
                </label>
                <label class="form-field full-field">
                  <span>流转方式</span>
                  <textarea v-model="processStepDraft.autoAdvance" rows="2" :readonly="!processStepIsEditable"></textarea>
                </label>
                <label class="form-field full-field">
                  <span>完成条件</span>
                  <textarea v-model="processStepDraft.completionRule" rows="2" :readonly="!processStepIsEditable"></textarea>
                </label>
                <label class="form-field full-field">
                  <span>异常规则</span>
                  <textarea v-model="processStepDraft.abnormalRule" rows="2" :readonly="!processStepIsEditable"></textarea>
                </label>
              </div>
            </section>

            <section class="form-section production-process-step-action-section">
              <div class="form-section-head">
                <h2>执行契约</h2>
                <i class="mini-status status-neutral">只读</i>
                <button
                  v-if="processStepIsEditable"
                  class="secondary-action compact-action"
                  type="button"
                  title="添加工序动作"
                  @click="addProcessStepAction"
                >
                  <Plus :size="15" />
                  添加
                </button>
              </div>

              <DocumentFactGrid
                :facts="processStepDocumentContractFacts"
                aria-label="系统动作执行契约"
                :max-columns="2"
              />

              <div v-if="processStepIsEditable && processStepActions.length" class="process-step-action-overview">
                <span>
                  <strong>{{ processStepActions.length }}</strong>
                  动作
                </span>
                <span>
                  <strong>{{ processStepBlockingActionCount }}</strong>
                  阻断
                </span>
                <span>
                  <strong>{{ processStepQcActionCount }}</strong>
                  质检
                </span>
              </div>

              <div v-if="processStepIsEditable && !processStepActions.length" class="process-step-action-empty">
                <span>暂无动作配置</span>
              </div>

              <div v-if="processStepIsEditable && processStepActions.length" class="process-step-action-grid">
                <article
                  v-for="(action, index) in processStepDraft.actions"
                  :key="action.lineId"
                  class="process-step-action-card"
                  :class="[`actor-${action.actor}`, { 'is-blocking-action': action.blocking }]"
                >
                  <div class="process-step-action-card-head">
                    <span class="process-step-action-title">
                      <i class="process-step-action-index">动作 {{ index + 1 }}</i>
                      <strong>{{ action.label }}</strong>
                    </span>
                    <span class="process-step-action-head-tools">
                      <i class="process-step-actor-chip">{{ action.actor }}</i>
                      <i class="recipe-mode-chip" :class="action.blocking ? 'is-percent' : 'is-fixed'">{{ action.blocking ? '阻断' : '不阻断' }}</i>
                      <button
                        v-if="processStepIsEditable"
                        class="icon-button danger-icon-button"
                        type="button"
                        title="删除此动作"
                        aria-label="删除此动作"
                        @click="removeProcessStepAction(index)"
                      >
                        <Trash2 :size="15" />
                      </button>
                    </span>
                  </div>

                  <template v-if="processStepIsEditable">
                    <div class="process-step-action-edit-grid">
                      <label class="process-step-action-field">
                        <span>预设动作</span>
                        <select v-model="action.type" @change="handleProcessStepActionTypeChange(action)">
                          <option v-for="option in processStepActionTypeOptions(index)" :key="option.type" :value="option.type">
                            {{ option.label }}
                          </option>
                        </select>
                      </label>
                      <label class="process-step-action-field">
                        <span>动作名称</span>
                        <input v-model="action.label" type="text" :class="processStepActionFieldClass(action, 'label')" />
                      </label>
                      <label class="process-step-action-field">
                        <span>执行方</span>
                        <select v-model="action.actor">
                          <option v-for="option in processStepActorOptions" :key="option" :value="option">{{ option }}</option>
                        </select>
                      </label>
                      <label class="process-step-action-field">
                        <span>触发时机</span>
                        <select v-model="action.triggerTiming">
                          <option v-for="option in processStepTriggerOptions" :key="option" :value="option">{{ option }}</option>
                        </select>
                      </label>
                      <label class="process-step-action-field">
                        <span>生成内容</span>
                        <input v-model="action.generatedTask" type="text" :class="processStepActionFieldClass(action, 'generatedTask')" />
                      </label>
                      <label class="process-step-action-field">
                        <span>入口名称</span>
                        <input v-model="action.buttonLabel" type="text" placeholder="无现场入口可留空" />
                      </label>
                      <label class="process-step-action-field">
                        <span>质检标准</span>
                        <input v-model="action.qualityStandard" type="text" placeholder="非质检动作可留空" />
                      </label>
                      <label class="process-step-action-field">
                        <span>完成事件</span>
                        <input v-model="action.completionEvent" type="text" :class="processStepActionFieldClass(action, 'completionEvent')" />
                      </label>
                      <label class="process-step-action-field process-step-action-checkbox">
                        <input v-model="action.blocking" type="checkbox" />
                        <span>完成前阻断下一工序</span>
                      </label>
                      <label class="process-step-action-field full-action-field">
                        <span>异常事件</span>
                        <textarea v-model="action.abnormalEvent" rows="2"></textarea>
                      </label>
                    </div>
                  </template>

                  <template v-else>
                    <div class="process-step-action-readonly-grid">
                      <span>
                        <small>执行方</small>
                        <strong>{{ action.actor }}</strong>
                      </span>
                      <span>
                        <small>触发时机</small>
                        <strong>{{ action.triggerTiming }}</strong>
                      </span>
                      <span>
                        <small>生成内容</small>
                        <strong>{{ action.generatedTask }}</strong>
                      </span>
                      <span>
                        <small>现场入口</small>
                        <strong>{{ action.buttonLabel || '-' }}</strong>
                      </span>
                      <span>
                        <small>质检标准</small>
                        <strong>{{ action.qualityStandard || '-' }}</strong>
                      </span>
                      <span>
                        <small>完成事件</small>
                        <strong>{{ action.completionEvent }}</strong>
                      </span>
                      <span class="full-action-field">
                        <small>异常事件</small>
                        <strong>{{ action.abnormalEvent || '-' }}</strong>
                      </span>
                    </div>
                  </template>
                </article>
              </div>
            </section>
          </template>

          <template v-else>
            <section
              class="form-section"
              :class="{
                'is-production-basic-section': true,
                'production-work-order-detail-section': activePage === 'work-orders',
                'production-operational-detail-section': ['execution-cards', 'exceptions'].includes(activePage),
              }"
            >
              <div class="form-section-head">
                <h2>{{ activePage === 'work-orders' ? '工单概览' : activePage === 'execution-cards' ? '批次基础' : activePage === 'exceptions' ? '异常基础' : '基本信息' }}</h2>
                <i v-if="isProductionEditableDocument && !isProductionNewDocument && !['work-orders', 'execution-cards'].includes(activePage)" class="mini-status" :class="statusClass(draftValue('status'))">{{ productionDisplayTerm(draftValue('status')) }}</i>
              </div>

              <div v-if="activePage === 'work-orders' && !isProductionEditableDocument" class="recipe-product-overview work-order-product-overview">
                <span class="recipe-product-overview-label">生产成品</span>
                <MaterialIdentity
                  :name="workOrderReadonlyProductIdentity.name"
                  :code="workOrderReadonlyProductIdentity.code"
                  :model="workOrderReadonlyProductIdentity.model"
                  :spec="workOrderReadonlyProductIdentity.spec"
                  :image-tone="productionMaterialIdentityTone(workOrderReadonlyProductIdentity.code)"
                >
                  <template #supplement>
                    <span class="recipe-product-standard">计划 {{ qty(workOrderReadonlyRaw?.planQty, workOrderReadonlyRaw?.unit) }}</span>
                  </template>
                </MaterialIdentity>
              </div>

              <div v-else-if="activePage === 'execution-cards' && !isProductionEditableDocument" class="recipe-product-overview work-order-product-overview production-execution-product-overview">
                <span class="recipe-product-overview-label">生产成品</span>
                <MaterialIdentity
                  :name="executionCardReadonlyProductIdentity.name"
                  :code="executionCardReadonlyProductIdentity.code"
                  :model="executionCardReadonlyProductIdentity.model"
                  :spec="executionCardReadonlyProductIdentity.spec"
                  :image-tone="productionMaterialIdentityTone(executionCardReadonlyProductIdentity.code)"
                >
                  <template #supplement>
                    <span class="recipe-product-standard">批次计划 {{ qty(executionCardReadonlyRaw?.planQty, executionCardReadonlyRaw?.unit) }}</span>
                  </template>
                </MaterialIdentity>
              </div>

              <div v-else-if="isProductionRecordDocument" class="recipe-product-overview work-order-product-overview production-loss-product-overview">
                <span class="recipe-product-overview-label">损耗物料</span>
                <MaterialIdentity
                  :name="text(currentProductionDocument?.raw.productName, '-')"
                  :code="text(currentProductionDocument?.raw.productCode, '')"
                  :image-tone="productionMaterialIdentityTone(text(currentProductionDocument?.raw.productCode, ''))"
                >
                  <template #supplement>
                    <span class="recipe-product-standard">
                      {{ text(currentProductionDocument?.raw.processStep, '-') }} · {{ text(currentProductionDocument?.raw.line, '-') }}
                    </span>
                  </template>
                </MaterialIdentity>
              </div>

              <DocumentFactGrid
                v-if="!isProductionEditableDocument && productionDocumentBasicFacts.length"
                :facts="productionDocumentBasicFacts"
                :aria-label="`${activeListTitle}基础信息`"
              />

              <div v-else class="quote-fields">
                <label
                  v-for="fact in productionDocumentBasicFacts"
                  :key="fact.label"
                  class="form-field"
                  :class="[{ 'full-field': fact.full }, productionRequiredFieldClass(fact)]"
                  :data-required-field="fact.key || fact.label"
                >
                  <span>{{ fact.label }}</span>
                  <textarea v-if="fact.multiline" v-model="productionDraft[fact.key || fact.label]" rows="3"></textarea>
                  <input v-else v-model="productionDraft[fact.key || fact.label]" type="text" />
                </label>
              </div>
            </section>

            <section
              v-for="section in productionDocumentSections"
              :key="section.title"
              class="form-section"
              :class="{
                'production-work-order-detail-section': activePage === 'work-orders',
                'production-operational-detail-section': ['execution-cards', 'exceptions'].includes(activePage),
                'is-work-order-execution-section': activePage === 'work-orders' && section.title === '生产执行记录',
                'is-device-operation-section': activePage === 'execution-cards' && section.title === '设备作业',
                'is-current-execution-section': activePage === 'execution-cards' && section.title === '工艺执行',
                'is-material-actual-section': activePage === 'execution-cards' && section.title === '领退料实绩',
              }"
            >
              <div class="form-section-head">
                <h2>{{ section.title }}</h2>
                <i v-if="section.note" class="mini-status status-neutral">{{ section.note }}</i>
              </div>

              <div
                v-if="activePage === 'work-orders' && section.title === '工单配方'"
                class="work-order-snapshot-block work-order-recipe-snapshot"
              >
                <div v-if="workOrderReadonlyRecipe" class="work-order-snapshot-summary-grid is-three-columns">
                  <div>
                    <small>配方编号</small>
                    <RouterLink
                      class="production-fact-link"
                      :to="`/production/recipes/${encodeURIComponent(text(workOrderReadonlyRecipe.code))}`"
                    >
                      {{ text(workOrderReadonlyRecipe.code) }}
                    </RouterLink>
                  </div>
                  <div>
                    <small>每单位净重</small>
                    <strong>{{ formatRecipeQuantity(workOrderReadonlyRecipe.productUnitWeightKg, 'kg') }}/{{ text(workOrderReadonlyRecipe.outputUnit, text(workOrderReadonlyRaw?.unit, '件')) }}</strong>
                  </div>
                  <div>
                    <small>本单计划</small>
                    <strong>{{ qty(workOrderReadonlyRaw?.planQty, workOrderReadonlyRaw?.unit) }}</strong>
                  </div>
                </div>

                <div v-if="workOrderRecipeSnapshotRows.length" class="work-order-recipe-snapshot-table">
                  <div class="work-order-recipe-snapshot-row is-head">
                    <span>物料</span>
                    <span>计量规则</span>
                    <span>每单位标准</span>
                    <span>本单理论用量<small>不含损耗</small></span>
                    <span>本单预计需求<small>含损耗</small></span>
                  </div>
                  <div v-for="row in workOrderRecipeSnapshotRows" :key="row.code" class="work-order-recipe-snapshot-row">
                    <span class="work-order-recipe-material-cell">
                      <MaterialIdentity
                        :name="row.name"
                        :code="row.code"
                        :model="row.model"
                        :spec="row.spec"
                        :image-url="row.imageUrl"
                        :image-label="row.imageLabel"
                        :image-tone="row.imageTone"
                      />
                    </span>
                    <span>{{ row.basis }}</span>
                    <span>{{ row.perUnit }}</span>
                    <span>{{ row.plannedNet }}</span>
                    <span><strong>{{ row.plannedWithLoss }}</strong></span>
                  </div>
                </div>
                <div v-else class="process-template-empty">该工单未保存可读取的配方明细。</div>
              </div>

              <div
                v-else-if="activePage === 'work-orders' && section.title === '工单工艺'"
                class="work-order-snapshot-block work-order-process-snapshot"
              >
                <div v-if="workOrderReadonlyProcess" class="work-order-snapshot-summary-grid">
                  <div>
                    <small>工艺编号</small>
                    <RouterLink
                      class="production-fact-link"
                      :to="`/production/process-templates/${encodeURIComponent(text(workOrderReadonlyProcess.code))}`"
                    >
                      {{ text(workOrderReadonlyProcess.code) }}
                    </RouterLink>
                  </div>
                  <div>
                    <small>工艺路线</small>
                    <strong>{{ text(workOrderReadonlyProcess.routeType, '-') }}</strong>
                  </div>
                  <div>
                    <small>适用产线</small>
                    <strong>{{ toArray<string>(workOrderReadonlyProcess.lineTypes).join('、') || '-' }}</strong>
                  </div>
                  <div>
                    <small>版本状态</small>
                    <strong :class="{ 'snapshot-warning-text': !workOrderSnapshotIsFrozen }">{{ workOrderSnapshotIsFrozen ? '已确认' : '待提交确认' }}</strong>
                  </div>
                </div>

                <div class="work-order-snapshot-subhead">
                  <strong>温控参数</strong>
                  <small>固定 14 区 · 允差 {{ text(workOrderReadonlyProcess?.temperatureTolerance, '-') }}</small>
                </div>
                <div class="work-order-snapshot-zone-grid">
                  <span v-for="zone in workOrderProcessSnapshotZones" :key="zone.name">
                    <small>{{ zone.name }}</small>
                    <strong>{{ zone.value }}</strong>
                  </span>
                </div>

                <div class="work-order-snapshot-subhead is-route-head">
                  <strong>工艺路线</strong>
                  <small>{{ workOrderProcessSnapshotSteps.length }} 道工序</small>
                </div>
                <div v-if="workOrderProcessSnapshotSteps.length" class="work-order-process-snapshot-steps">
                  <article v-for="step in workOrderProcessSnapshotSteps" :key="step.code" class="work-order-process-snapshot-step">
                    <header>
                      <b>{{ step.sequence }}</b>
                      <span>
                        <strong>{{ step.name }}</strong>
                        <small>{{ step.code }} · {{ step.owner }} · {{ step.executionMode }}</small>
                      </span>
                      <i>{{ step.action }}</i>
                    </header>
                    <div class="work-order-process-snapshot-guidance">
                      <div>
                        <small>核心设备</small>
                        <p>{{ step.equipment }}</p>
                      </div>
                      <div>
                        <small>作业要求</small>
                        <p>{{ step.workContent }}</p>
                      </div>
                      <div>
                        <small>异常处理</small>
                        <p>{{ step.abnormalRule }}</p>
                      </div>
                    </div>
                  </article>
                </div>
                <div v-else class="process-template-empty">该工单未保存可读取的工序路线。</div>
              </div>

              <template v-else>
                <DocumentFactGrid
                  v-if="section.facts?.length"
                  :facts="section.facts"
                  :aria-label="`${section.title}信息`"
                  :max-columns="activePage === 'work-orders' ? 3 : 4"
                />

                <details
                  v-if="activePage === 'execution-cards' && section.title === '工艺执行' && section.lines?.length"
                  class="production-process-trace-disclosure"
                >
                  <summary>
                    <span>
                      <strong>查看完整工艺轨迹</strong>
                      <small>{{ executionCardProcessSnapshotNote(currentProductionDocument.raw) }}</small>
                    </span>
                    <em>展开</em>
                  </summary>
                  <div class="quote-line-table production-line-table">
                    <div class="quote-line-row quote-line-head production-document-line-row">
                      <span>{{ section.headers?.[0] || '项目' }}</span>
                      <span>{{ section.headers?.[1] || '说明' }}</span>
                      <span>{{ section.headers?.[2] || '状态' }}</span>
                      <span>{{ section.headers?.[3] || '关键字段' }}</span>
                    </div>
                    <div v-for="line in section.lines" :key="`${section.title}-${line.title}-${line.meta}`" class="quote-line-row production-document-line-row">
                      <span class="production-line-title">
                        <strong>{{ line.title }}</strong>
                        <small>{{ line.meta }}</small>
                      </span>
                      <span>{{ line.values[0]?.value || '-' }}</span>
                      <span v-if="section.plainValues">{{ line.values[1]?.value || '-' }}</span>
                      <span v-else>
                        <i class="mini-status" :class="statusClass(line.status || '')">{{ productionDisplayTerm(line.status || '正常') }}</i>
                      </span>
                      <span v-if="section.plainValues">{{ line.values[2]?.value || '-' }}</span>
                      <span v-else class="production-line-values">
                        <small v-for="value in line.values.slice(1)" :key="`${line.title}-${value.label}`">
                          {{ value.label }}：{{ value.value }}
                        </small>
                        <small v-if="line.values.length <= 1">-</small>
                      </span>
                    </div>
                  </div>
                </details>

                <div v-else-if="section.lines?.length" class="quote-line-table production-line-table">
                  <div class="quote-line-row quote-line-head production-document-line-row">
                    <span>{{ section.headers?.[0] || '项目' }}</span>
                    <span>{{ section.headers?.[1] || '说明' }}</span>
                    <span>{{ section.headers?.[2] || '状态' }}</span>
                    <span>{{ section.headers?.[3] || '关键字段' }}</span>
                  </div>
                  <div v-for="line in section.lines" :key="`${section.title}-${line.title}-${line.meta}`" class="quote-line-row production-document-line-row">
                    <span class="production-line-title">
                      <MaterialIdentity
                        v-if="activePage === 'work-orders' && section.title.endsWith('物料储备')"
                        compact
                        :name="line.title"
                        :code="line.meta"
                        :image-tone="productionMaterialIdentityTone(line.meta)"
                      />
                      <RouterLink
                        v-else-if="line.route"
                        class="workbench-inline-link production-line-link"
                        :to="line.route"
                        :title="`打开${line.title}`"
                      >
                        <span>{{ line.title }}</span>
                        <ExternalLink :size="13" aria-hidden="true" />
                      </RouterLink>
                      <strong v-else>{{ line.title }}</strong>
                      <small v-if="!(activePage === 'work-orders' && section.title.endsWith('物料储备'))">{{ line.meta }}</small>
                    </span>
                    <span>{{ line.values[0]?.value || '-' }}</span>
                    <span v-if="section.plainValues">{{ line.values[1]?.value || '-' }}</span>
                    <span v-else>
                      <i class="mini-status" :class="statusClass(line.status || '')">{{ productionDisplayTerm(line.status || '正常') }}</i>
                    </span>
                    <span v-if="section.plainValues">{{ line.values[2]?.value || '-' }}</span>
                    <span v-else class="production-line-values">
                      <small v-for="value in line.values.slice(1)" :key="`${line.title}-${value.label}`">
                        {{ value.label }}：{{ value.value }}
                      </small>
                      <small v-if="line.values.length <= 1">-</small>
                    </span>
                  </div>
                </div>
              </template>
            </section>
          </template>
        </div>

        <aside v-if="showProductionSummaryPanel" class="quote-summary-panel">
          <section v-if="activePage === 'work-orders' && isProductionEditableDocument" class="summary-section work-order-draft-check-section">
            <div class="form-section-head">
              <div class="summary-title">
                <CheckCircle2 :size="17" />
                <h2>建单检查</h2>
              </div>
              <i class="mini-status" :class="workOrderDraftCheckMessage ? 'status-warning' : 'status-done'">
                {{ workOrderDraftCheckMessage ? '待补齐' : '可以提交' }}
              </i>
            </div>
            <div v-for="item in workOrderDraftCheckItems" :key="item.label" class="summary-line">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
            <p class="work-order-draft-check-message" :class="{ 'is-ready': !workOrderDraftCheckMessage }">
              {{ workOrderDraftCheckMessage || '任务需求、成品数量和生产标准已经完成核对。' }}
            </p>
          </section>

          <section v-if="isRecipeDocument && recipeIsEditable && recipeDraft.productCode" class="summary-section recipe-version-summary-section">
            <div class="summary-title">
              <FileText :size="17" />
              <h2>版本提示</h2>
            </div>
            <div class="summary-line">
              <span>已有版本</span>
              <strong>{{ recipeDraft.productCode ? `${recipeProductVersionCount} 个` : '—' }}</strong>
            </div>
            <div class="summary-line">
              <span>当前生成</span>
              <strong>{{ recipeDraft.version || '-' }}</strong>
            </div>
            <div class="summary-line">
              <span>当前启用</span>
              <strong>{{ recipeProductEnabledVersionLabel }}</strong>
            </div>
            <p
              class="recipe-version-rule"
              :class="{ 'has-conflict': Boolean(recipeActivationConflictMessage) }"
            >
              {{ recipeVersionRuleMessage }}
            </p>
          </section>

          <section v-if="isTaskDocument && !isProductionEditableDocument" class="summary-section">
            <DocumentStatusPanel
              title="任务状态"
              :primary-status="taskLifecycleStatusLabel"
              :items="taskStatusPanelItems"
              aria-label="生产任务状态与进度"
            />
          </section>

          <section v-if="isMaterialRequestDocument && productionDocumentIsReadOnlyView" class="summary-section">
            <DocumentStatusPanel
              title="申请状态"
              :primary-status="materialRequestLifecycleStatusLabel"
              :items="materialRequestStatusPanelItems"
              aria-label="备料申请状态与处理进度"
            />
          </section>

          <section v-if="activePage === 'work-orders' && !isProductionEditableDocument" class="summary-section">
            <DocumentStatusPanel
              title="工单状态"
              :primary-status="workOrderLifecycleStatus"
              :items="workOrderStatusPanelItems"
              aria-label="生产工单状态与进度"
            />
          </section>

          <section v-if="activePage === 'execution-cards' && !isProductionEditableDocument" class="summary-section">
            <DocumentStatusPanel
              title="批次状态"
              :primary-status="executionCardLifecycleStatus"
              :items="executionCardStatusPanelItems"
              aria-label="生产批次状态与进度"
            />
          </section>

          <section v-if="productionDocumentIsReadOnlyView && !isTaskDocument && !['material-requests', 'work-orders', 'execution-cards', 'process-steps'].includes(activePage) && !isProductionRecordDocument" class="summary-section">
            <h2>{{ productionDocumentStageTitle }}</h2>
            <DocumentStageRail
              :items="productionDocumentStageItems"
              :current-index="productionDocumentStageIndex"
              :aria-label="productionDocumentStageTitle"
            />
          </section>

          <section v-if="productionDocumentIsReadOnlyView && !isTaskDocument && !['material-requests', 'work-orders', 'execution-cards', 'exceptions'].includes(activePage)" class="summary-section">
            <div class="summary-title">
              <FileText :size="17" />
              <h2>{{ productionDocumentSummaryTitle }}</h2>
            </div>
            <DocumentSummaryFacts
              :facts="productionDocumentVisibleFacts"
              :aria-label="productionDocumentSummaryTitle"
            />
          </section>

          <section v-if="showProductionAttachmentSection" class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
              <label
                v-if="!productionDocumentIsReadOnlyView && !isProductionRecordDocument && (!isRecipeDocument || recipeIsEditable)"
                class="secondary-action compact-action file-upload-button"
                :class="{ 'is-disabled': productionEditableActionDisabled }"
                :aria-disabled="productionEditableActionDisabled"
                :title="productionDocumentAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple :disabled="productionEditableActionDisabled" @change="handleAttachmentUpload" />
              </label>
            </div>

            <div v-if="productionAttachments.length" class="attachment-list">
              <div v-for="file in productionAttachments" :key="`${file.name}-${file.date}`" class="attachment-row">
                <span class="attachment-icon">
                  <Paperclip :size="16" />
                </span>
                <div>
                  <strong>{{ file.name }}</strong>
                  <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                </div>
              </div>
            </div>
            <div v-else class="attachment-empty">
              <Paperclip :size="17" />
              <span>{{ productionDocumentAttachmentEmptyText }}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else-if="isProductionDocumentPage"
      :loading="false"
      :title="activeListTitle"
      :message="`${activeListTitle}不存在`"
      :back-path="productionBackPath"
      :back-label="activeBackLabel"
      @retry="retryProductionRuntimeData"
    />

    <section v-else class="list-page">
      <PageTopbarPortal v-if="requestedProductionReturnPath || (showProductionHeaderPrimaryAction && createButtonLabel)">
        <template v-if="requestedProductionReturnPath" #context>
          <RouterLink class="topbar-back-action" :to="productionBackPath" :aria-label="activeBackLabel" :title="activeBackLabel">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ activeListTitle }}</strong>
        </template>
        <template #actions>
          <RouterLink
            v-if="canWriteProduction && !productionStaleSnapshotMessage"
            class="primary-action"
            :to="productionListCreatePath"
            :title="productionListCreateTitle"
          >
            <Plus :size="15" />
            {{ createButtonLabel }}
          </RouterLink>
          <button
            v-else
            class="primary-action"
            type="button"
            disabled
            :title="productionStaleSnapshotMessage || productionReadonlyReason"
          >
            <Plus :size="15" />
            {{ createButtonLabel }}
          </button>
        </template>
      </PageTopbarPortal>

      <div class="quote-page production-list-page">
        <OperationPermissionBanner
          v-if="productionStaleSnapshotMessage"
          title="当前为历史快照"
          :message="productionStaleSnapshotMessage"
          suffix="刷新成功前列表保持只读。"
        />
        <BusinessListToolbar
          v-model:search="searchKeyword"
          v-model:filter-status="draftFilterStatus"
          v-model:filter-party="draftFilterParty"
          v-model:filter-owner="draftFilterOwner"
          v-model:filter-date-start="draftFilterDateStart"
          v-model:filter-date-end="draftFilterDateEnd"
          :search-placeholder="activeSearchPlaceholder"
          :open-menu="openToolbarMenu"
          :sort-mode="sortMode"
          :sort-amount-label="sortAmountLabel"
          :sort-date-label="filterDateLabel"
          :newest-sort-label="productionNewestSortLabel"
          :oldest-sort-label="productionOldestSortLabel"
          :show-sort="showListSort"
          :show-amount-sort="showAmountSort"
          :show-status-sort="showStatusSort"
          :status-sort-label="productionStatusSortLabel"
          :active-filter-count="activeFilterCount"
          :filter-fields="filterFields"
          :filter-date-label="filterDateLabel"
          @toggle-menu="toggleToolbarMenu"
          @sort="setSortMode"
          @export-rows="handleExportRows"
          @clear-filters="resetBusinessFilters"
          @apply-filters="applyAndCloseFilters"
        />

        <section class="production2-list-shell">
          <div
            class="quote-table-shell production-list-shell"
            :class="{
              'with-status-column': showProductionListStatusColumn,
              'without-status-column': !showProductionListStatusColumn,
              'production-reference-shell': isProductionRecordDocument,
              'production-tasks-shell': activePage === 'tasks',
              'production-material-requests-shell': activePage === 'material-requests',
              'production-work-orders-shell': activePage === 'work-orders',
              'production-execution-cards-shell': activePage === 'execution-cards',
              'production-exceptions-shell': activePage === 'exceptions',
              'production-recipes-shell': activePage === 'recipes',
              'production-process-steps-shell': activePage === 'process-steps',
            }"
          >
            <div class="quote-data-scroll">
              <div
                class="data-table quote-table quote-list-table production-list-table"
                :class="{
                  'production-loss-ledger-table': isProductionRecordDocument,
                  'production-tasks-table': activePage === 'tasks',
                  'production-material-requests-table': activePage === 'material-requests',
                  'production-work-orders-table': activePage === 'work-orders',
                  'production-execution-cards-table': activePage === 'execution-cards',
                  'production-exceptions-table': activePage === 'exceptions',
                  'production-recipes-table': activePage === 'recipes',
                  'production-process-templates-table': activePage === 'process-templates',
                  'production-process-steps-table': activePage === 'process-steps',
                }"
              >
                <div class="table-row table-head">
                  <span v-for="header in activeTableHeaders" :key="header">{{ header }}</span>
                </div>
                <template v-if="isProductionRecordDocument">
                  <div
                    v-for="row in visibleProductionRows"
                    :key="row.code"
                    class="table-row order-list-row production2-table-row production-list-row production-reference-row"
                    :title="`${activeListTitle} ${row.code}`"
                  >
                    <template v-for="(cell, index) in row.cells" :key="`${row.code}-${index}`">
                      <RouterLink
                        v-if="index === 0"
                        :to="rowRoute(row)"
                        :class="[cellClass(index), 'loss-record-link']"
                        :aria-label="`查看损耗记录 ${row.code}`"
                        :title="`查看损耗记录 ${row.code}`"
                      >
                        <strong :title="cell.title">{{ cell.title }}</strong>
                        <small :title="cell.subtitle">{{ cell.subtitle }}</small>
                      </RouterLink>
                      <RouterLink
                        v-else-if="index === 1 && productionLossSourceRoute(row.raw)"
                        :to="productionLossSourceRoute(row.raw)"
                        :class="[cellClass(index), 'loss-source-link']"
                        :title="`查看来源 ${cell.title}`"
                      >
                        <strong :title="cell.title">{{ cell.title }}</strong>
                        <small :title="cell.subtitle">{{ cell.subtitle }}</small>
                      </RouterLink>
                      <span v-else :class="cellClass(index)" :title="[cell.title, cell.subtitle].filter(Boolean).join(' · ')">
                        <MaterialIdentity
                          v-if="index === 2"
                          compact
                          :name="cell.title"
                          :code="text(row.raw.productCode, '')"
                          :image-tone="productionMaterialIdentityTone(text(row.raw.productCode, ''))"
                        >
                          <template #supplement>
                            <small :title="cell.subtitle">{{ cell.subtitle }}</small>
                          </template>
                        </MaterialIdentity>
                        <template v-else>
                          <strong :title="cell.title">{{ cell.title }}</strong>
                          <small :title="cell.subtitle">{{ cell.subtitle }}</small>
                        </template>
                      </span>
                    </template>
                  </div>
                </template>
                <template v-else>
                  <RouterLink
                    v-for="row in visibleProductionRows"
                    :key="row.code"
                    class="table-row order-list-row production2-table-row production-list-row is-clickable"
                    :class="{ 'is-row-highlighted': hoveredProductionRowKey === row.code }"
                    :to="rowRoute(row)"
                    :aria-label="`打开${activeListTitle} ${row.code}`"
                    :title="`打开${activeListTitle} ${row.code}`"
                    @pointerenter="hoveredProductionRowKey = row.code"
                    @pointerleave="hoveredProductionRowKey = ''"
                    @mouseenter="hoveredProductionRowKey = row.code"
                    @mouseleave="hoveredProductionRowKey = ''"
                    @focus="hoveredProductionRowKey = row.code"
                    @blur="hoveredProductionRowKey = ''"
                  >
                    <span v-for="(cell, index) in row.cells" :key="`${row.code}-${index}`" :class="cellClass(index)" :title="[cell.title, cell.subtitle].filter(Boolean).join(' · ')">
                      <template v-if="activePage === 'work-orders' && index === 0">
                        <strong class="production-work-order-list-code" :title="cell.title">{{ cell.title }}</strong>
                        <MaterialIdentity
                          compact
                          text-only
                          :name="cell.subtitle || text(row.raw.productName, '-')"
                          :code="text(row.raw.productCode, '')"
                        />
                      </template>
                      <template v-else>
                        <strong :title="cell.title">{{ cell.title }}</strong>
                        <small :title="cell.subtitle">{{ cell.subtitle }}</small>
                      </template>
                    </span>
                  </RouterLink>
                </template>
              </div>
            </div>

            <div v-if="showProductionListStatusColumn" class="quote-status-column">
              <div v-if="showProductionStatusOverview" class="quote-status-head production-status-overview-head">
                <strong>{{ statusColumnTitle }}</strong>
                <small>{{ productionStatusDimensionLabels }}</small>
              </div>
              <div v-else class="quote-status-head">{{ statusColumnTitle }}</div>
              <RouterLink
                v-for="row in visibleProductionRows"
                :key="`${row.code}-status`"
                class="quote-status-cell order-status-link"
                :class="{
                  'is-row-highlighted': hoveredProductionRowKey === row.code,
                  'production-status-overview-cell': showProductionStatusOverview,
                }"
                :to="rowRoute(row)"
                :aria-label="`打开${activeListTitle} ${row.code} 状态`"
                :title="activePage === 'process-steps' ? `打开${activeListTitle} ${row.code}` : `打开${activeListTitle} ${row.code} 状态：${row.status}，${productionStatusActionPrefix}：${row.nextStep}`"
                @pointerenter="hoveredProductionRowKey = row.code"
                @pointerleave="hoveredProductionRowKey = ''"
                @mouseenter="hoveredProductionRowKey = row.code"
                @mouseleave="hoveredProductionRowKey = ''"
                @focus="hoveredProductionRowKey = row.code"
                @blur="hoveredProductionRowKey = ''"
              >
                <template v-if="showProductionStatusOverview">
                  <ListStatusOverview
                    :status="productionDisplayTerm(row.status)"
                    :attention="productionDisplayTerm(productionListStatusOverview(row).attention)"
                    :facts="productionListStatusOverview(row).facts"
                    :progress="productionListStatusOverview(row).progress"
                  />
                </template>
                <template v-else>
                  <i class="mini-status" :class="statusClass(row.status)">{{ productionDisplayTerm(row.status) }}</i>
                  <small v-if="activePage === 'material-requests' || activePage === 'exceptions'">下一步：{{ productionDisplayTerm(row.nextStep) }}</small>
                </template>
              </RouterLink>
            </div>
          </div>

          <div v-if="visibleProductionRows.length === 0" class="list-empty-state">
            <strong>{{ hasListConstraints ? `未找到匹配的${activeListTitle}` : `暂无${activeListTitle}` }}</strong>
            <span>{{ productionEmptyHint }}</span>
            <button v-if="hasListConstraints" class="secondary-action empty-state-action" type="button" title="清空搜索和筛选条件" @click="clearListConstraints">
              清空条件
            </button>
          </div>

          <div class="quote-card-list">
            <template v-if="isProductionRecordDocument">
              <article v-for="row in visibleProductionRows" :key="`${row.code}-card`" class="quote-card production-reference-card">
                <div class="quote-card-head">
                  <div>
                    <strong>{{ row.title }}</strong>
                    <span v-if="row.title !== row.code">{{ row.code }}</span>
                  </div>
                  <i class="mini-status" :class="statusClass(row.status)">{{ productionDisplayTerm(row.status) }}</i>
                </div>
                <div class="quote-card-main">
                  <div>
                    <span v-for="cell in row.cells.slice(1, 4)" :key="`${row.code}-card-${cell.title}`">
                      {{ cell.title }} <small>{{ cell.subtitle }}</small>
                    </span>
                  </div>
                  <strong>{{ productionDisplayTerm(row.nextStep) }}</strong>
                </div>
              </article>
            </template>
            <template v-else>
              <RouterLink
                v-for="row in visibleProductionRows"
                :key="`${row.code}-card`"
                class="quote-card"
                :to="rowRoute(row)"
                :title="`打开${activeListTitle} ${row.code}`"
              >
                <div class="quote-card-head">
                  <div>
                    <strong>{{ row.title }}</strong>
                    <span v-if="row.title !== row.code">
                      {{ row.code }}<template v-if="activePage === 'work-orders' && text(row.raw.productCode, '')"> · {{ text(row.raw.productCode) }}</template>
                    </span>
                  </div>
                  <i class="mini-status" :class="statusClass(row.status)">{{ productionDisplayTerm(row.status) }}</i>
                </div>
                <div class="quote-card-main">
                  <div>
                    <span v-for="cell in row.cells.slice(1, 4)" :key="`${row.code}-card-${cell.title}`">
                      {{ cell.title }} <small>{{ cell.subtitle }}</small>
                    </span>
                  </div>
                  <div v-if="showProductionStatusOverview" class="production-card-progress">
                    <span v-for="fact in productionListStatusOverview(row).facts" :key="`${row.code}-card-${fact.label}`">
                      <b>{{ fact.label }}</b>
                      <i :class="statusClass(fact.value)">{{ fact.value }}</i>
                    </span>
                  </div>
                  <small
                    v-if="showProductionStatusOverview && productionListStatusOverview(row).attention !== row.nextStep"
                    class="production-card-attention"
                  >
                    关注 · {{ productionListStatusOverview(row).attention }}
                  </small>
                  <template v-if="activePage !== 'process-steps'">
                    <strong>{{ productionStatusActionPrefix }}：{{ productionDisplayTerm(row.nextStep) }}</strong>
                  </template>
                  <strong v-else>{{ productionDisplayTerm(row.nextStep) }}</strong>
                </div>
              </RouterLink>
            </template>
          </div>

          <div class="table-footer">
            <span>共 {{ visibleProductionRows.length }} 条</span>
          </div>
        </section>
      </div>
    </section>

    <FlowRecordPanel
      :open="showProductionFlowRecords"
      :title="`${activeListTitle}日志`"
      :records="productionFlowRecords"
      @close="showProductionFlowRecords = false"
    />

    <ProductionPackagingDialog
      :open="packagingDialogOpen"
      :card-code="text(pendingPackagingCard?.code, '')"
      :product-name="text(pendingPackagingCard?.productName, '')"
      :quantity="Math.max(0, Number(pendingPackagingCard?.qualifiedQty || 0) - Number(pendingPackagingCard?.packedQty || 0))"
      :unit="text(pendingPackagingCard?.unit, '')"
      :default-package-ref="`${text(pendingPackagingCard?.code, 'EC2')}-PKG-${String(toArray(pendingPackagingCard?.packageRefs).length + 1).padStart(2, '0')}`"
      :busy="executionCardActionBusy"
      @close="packagingDialogOpen = false; pendingPackagingCard = null"
      @submit="confirmExecutionCardPackaging"
    />

    <ShortCloseResolutionDialog
      :open="shortCloseResolutionDialogOpen"
      :card-code="text(pendingShortCloseCard?.code, '')"
      :product-name="text(pendingShortCloseCard?.productName, '')"
      :remaining-qty="toNumber(pendingShortCloseCard?.shortCloseRemainingQty)"
      :unit="text(pendingShortCloseCard?.unit, '')"
      :busy="executionCardActionBusy"
      @close="shortCloseResolutionDialogOpen = false; pendingShortCloseCard = null"
      @submit="confirmShortCloseResolution"
    />

    <ExceptionActionDialog
      :open="exceptionRecoveryDialogOpen"
      title="解除停机并恢复生产"
      :record-code="text(pendingRecoveryException?.code, '')"
      :action-options="exceptionRecoveryActions"
      :busy="exceptionActionBusy"
      @close="exceptionRecoveryDialogOpen = false; pendingRecoveryException = null"
      @submit="({ reason }) => confirmRuntimeProductionException({ reason })"
    />

    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>

<style scoped>
.production2-page {
  gap: 18px;
}

.production-handoff-status {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  padding: 6px 11px;
  border: 1px solid #dfe4db;
  border-radius: 7px;
  background: #f4f6f1;
  color: #5d6b5f;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
}

.production-list-page {
  display: block;
}

.production2-list-shell {
  display: block;
  min-width: 0;
  max-width: 100%;
}

.production-list-table .table-row {
  grid-template-columns: minmax(170px, 1fr) minmax(220px, 1.25fr) minmax(170px, 1fr) minmax(170px, 1fr) minmax(180px, 1fr) minmax(110px, 0.72fr);
}

.production-list-table.production-tasks-table {
  min-width: 0;
}

.production-list-table.production-tasks-table .table-row {
  grid-template-columns:
    minmax(142px, 0.9fr)
    minmax(170px, 1.05fr)
    minmax(220px, 1.35fr);
}

.production-list-table.production-tasks-table .table-row:not(.table-head) {
  height: 88px;
  min-height: 88px;
}

.production-list-table.production-tasks-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 4px;
}

.production-list-table.production-tasks-table .quote-code strong,
.production-list-table.production-tasks-table .product-summary strong,
.production-list-table.production-tasks-table .date-stack strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-tasks-table .quote-code small,
.production-list-table.production-tasks-table .product-summary small,
.production-list-table.production-tasks-table .date-stack small {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-tasks-table .production-list-row > .product-summary:nth-child(3) small {
  display: -webkit-box;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-work-orders-table {
  min-width: 0;
}

.production-list-table.production-work-orders-table .table-row {
  grid-template-columns:
    minmax(170px, 1.1fr)
    minmax(115px, 0.72fr)
    minmax(142px, 0.9fr)
    minmax(176px, 1.08fr);
}

.production-list-table.production-work-orders-table .table-row:not(.table-head) {
  height: 88px;
  min-height: 88px;
}

.production-list-table.production-work-orders-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.production-list-table.production-work-orders-table .quote-code strong,
.production-list-table.production-work-orders-table .product-summary strong,
.production-list-table.production-work-orders-table .date-stack strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-work-orders-table .quote-code small,
.production-list-table.production-work-orders-table .product-summary small,
.production-list-table.production-work-orders-table .date-stack small {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-work-orders-table .date-stack small {
  display: -webkit-box;
  line-height: 1.25;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-work-orders-table .production-work-order-code-cell small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  font-weight: 450;
  line-height: 1.3;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-work-orders-table .production-work-order-code-cell > .material-identity {
  width: 100%;
}

.production-list-table.production-work-orders-table .production-work-order-rule-cell small {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-work-orders-table .production-work-order-list-code {
  color: #777d77;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.production-list-table.production-execution-cards-table {
  min-width: 0;
}

.production-list-table.production-execution-cards-table .table-row {
  grid-template-columns:
    minmax(160px, 1fr)
    minmax(210px, 1.25fr)
    minmax(160px, 0.95fr);
}

.production-list-table.production-execution-cards-table .table-row:not(.table-head) {
  height: 88px;
  min-height: 88px;
}

.production-list-table.production-execution-cards-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.production-list-table.production-execution-cards-table strong,
.production-list-table.production-execution-cards-table small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-material-requests-table,
.production-list-table.production-exceptions-table {
  min-width: 0;
}

.production-list-table.production-material-requests-table .table-row {
  grid-template-columns:
    minmax(146px, 0.95fr)
    minmax(0, 1.08fr)
    minmax(0, 1.15fr)
    minmax(0, 1.16fr);
}

.production-list-table.production-exceptions-table .table-row {
  grid-template-columns:
    minmax(0, 0.85fr)
    minmax(0, 0.6fr)
    minmax(0, 1fr)
    minmax(0, 1.5fr)
    minmax(0, 1.15fr);
}

.production-list-table.production-material-requests-table .table-row:not(.table-head),
.production-list-table.production-exceptions-table .table-row:not(.table-head) {
  min-height: 70px;
}

.production-list-table.production-exceptions-table .table-row:not(.table-head) {
  min-height: 78px;
}

.production-list-table.production-material-requests-table .table-row:not(.table-head) > span,
.production-list-table.production-exceptions-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.production-list-table.production-material-requests-table strong,
.production-list-table.production-material-requests-table small,
.production-list-table.production-exceptions-table small {
  display: block;
  min-width: 0;
  overflow: hidden;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-material-requests-table .production-material-request-fulfillment-cell strong {
  display: -webkit-box;
  line-height: 1.28;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-exceptions-table strong {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  line-height: 1.3;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-exceptions-table small {
  display: -webkit-box;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-recipes-table .table-row {
  grid-template-columns:
    minmax(166px, 0.95fr)
    minmax(250px, 1.55fr)
    minmax(150px, 0.8fr)
    minmax(230px, 1.3fr);
}

.production-list-table.production-process-templates-table {
  min-width: 760px;
}

.production-list-table.production-process-templates-table .table-row {
  grid-template-columns:
    minmax(190px, 1.22fr)
    minmax(130px, 0.82fr)
    minmax(158px, 1fr)
    minmax(200px, 1.26fr);
}

.production-list-table.production-process-templates-table .quote-code {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.production-list-table.production-process-templates-table .quote-code strong,
.production-list-table.production-process-templates-table .quote-code small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-process-templates-table .quote-code strong {
  font-size: 13px;
  font-weight: 650;
}

.production-list-table.production-process-templates-table .quote-code small {
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 450;
}

.production-list-table.production-process-steps-table {
  min-width: 0;
  width: 100%;
}

.production-list-table.production-process-steps-table .table-row {
  grid-template-columns:
    minmax(190px, 0.95fr)
    minmax(140px, 0.68fr)
    minmax(238px, 1.18fr)
    minmax(252px, 1.24fr);
  min-height: 70px;
}

.production-list-table.production-process-steps-table .table-head {
  height: 40px;
  min-height: 40px;
  color: #687069;
  font-size: 12px;
  font-weight: 680;
  letter-spacing: 0;
}

.production-list-table.production-process-steps-table .table-row:not(.table-head) {
  background: #ffffff;
}

.production-list-table.production-process-steps-table .table-row:not(.table-head):hover,
.production-list-table.production-process-steps-table .table-row:not(.table-head):focus-visible {
  background: #fafbf8;
}

.production-list-shell .quote-status-column {
  grid-auto-rows: 62px;
}

.production-list-shell.production-tasks-shell {
  grid-template-columns: minmax(0, 1fr) 400px;
}

.production-list-shell.production-work-orders-shell {
  grid-template-columns: minmax(0, 1fr) 280px;
}

.production-list-shell.production-execution-cards-shell {
  grid-template-columns: minmax(0, 1fr) 360px;
}

.production-list-shell.production-material-requests-shell,
.production-list-shell.production-exceptions-shell {
  grid-template-columns: minmax(0, 1fr) 250px;
}

.production-list-shell.production-tasks-shell .quote-status-column {
  grid-auto-rows: 88px;
}

.production-list-shell.production-work-orders-shell .quote-status-column {
  grid-auto-rows: 88px;
}

.production-list-shell.production-execution-cards-shell .quote-status-column {
  grid-auto-rows: 88px;
}

.production-list-shell.production-material-requests-shell .quote-status-column,
.production-list-shell.production-exceptions-shell .quote-status-column {
  grid-auto-rows: 70px;
}

.production-list-shell.production-exceptions-shell .quote-status-column {
  grid-auto-rows: 78px;
}

.production-list-shell.production-material-requests-shell .quote-status-cell small,
.production-list-shell.production-exceptions-shell .quote-status-cell small {
  display: -webkit-box;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-shell .quote-status-cell small {
  display: block;
  overflow: hidden;
  line-height: 1.32;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-status-overview-head {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-content: center;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
}

.production-status-overview-head strong {
  color: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

.production-status-overview-head small {
  min-width: 0;
  overflow: hidden;
  color: #77786f;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-status-overview-cell {
  display: flex;
  align-items: stretch;
  padding: 6px 9px;
}

.production-list-shell.production-work-orders-shell .production-status-overview-cell {
  padding-inline: 7px;
}

.production-list-shell.production-work-orders-shell .production-status-overview-head {
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 4px;
  padding-inline: 7px;
}

.production-list-shell.without-status-column {
  grid-template-columns: minmax(0, 1fr);
}

.production-list-shell.without-status-column .quote-data-scroll {
  border-radius: 8px;
}

.production-list-table.production-process-steps-table .quote-code {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.production-list-table.production-process-steps-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.production-list-table.production-process-steps-table .table-row:not(.table-head) > span strong {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  color: #252a26;
  font-size: 12.5px;
  font-weight: 650;
  line-height: 1.32;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-list-table.production-process-steps-table .table-row:not(.table-head) > span small {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-process-steps-table .table-row:not(.table-head) > span small:empty {
  display: none;
}

.production-list-table.production-process-steps-table .quote-code strong,
.production-list-table.production-process-steps-table .quote-code small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-list-table.production-process-steps-table .quote-code strong {
  font-size: 13.5px;
  font-weight: 650;
}

.production-list-table.production-process-steps-table .quote-code small {
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 450;
}

.production-list-table.production-process-steps-table .system-action-owner-cell strong {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  min-height: 23px;
  align-items: center;
  padding: 3px 9px;
  border: 1px solid #dce4d9;
  border-radius: 999px;
  background: #f2f6ef;
  color: #4c654f;
  font-size: 11.5px;
  line-height: 1;
  -webkit-line-clamp: 1;
}

.production-list-table.production-process-steps-table .system-action-owner-cell small {
  padding-left: 2px;
}

.production-list-table.production-process-steps-table .system-action-trigger-cell strong {
  font-weight: 720;
}

.production-list-table.production-process-steps-table .system-action-result-cell strong {
  color: #354b39;
  font-weight: 760;
}

.production-list-table.production-recipes-table {
  min-width: 760px;
}

.production-list-table.production-recipes-table .table-row:not(.table-head) {
  height: 64px;
  min-height: 64px;
}

.production-list-table.production-recipes-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.production-list-table.production-recipes-table .table-row:not(.table-head) strong {
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.production-list-table.production-recipes-table .table-row:not(.table-head) small {
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.production-list-shell.production-recipes-shell .quote-status-column {
  grid-auto-rows: 64px;
}

.production-list-shell.production-recipes-shell .quote-status-cell {
  gap: 5px;
  font-variant-numeric: tabular-nums;
}

.production-list-table.production-recipes-table .quote-code {
  display: grid;
  align-content: center;
  gap: 3px;
}

.production-list-table.production-recipes-table .quote-code strong,
.production-list-table.production-recipes-table .quote-code small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Production lists share the same primary/secondary text hierarchy as the
   mature sales and purchase lists. Page-specific grids may change column
   content, but identifiers must not become visually heavier. */
.production-list-table .table-row:not(.table-head) .quote-code strong {
  font-size: 13px;
  font-weight: 650;
}

.production-list-table .table-row:not(.table-head) .quote-code small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 450;
}

.production-reference-shell {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.production-reference-shell .quote-data-scroll {
  border-radius: 8px;
}

.production-loss-ledger-table {
  min-width: 0;
}

.production-loss-ledger-table .table-row {
  grid-template-columns:
    minmax(0, 0.92fr)
    minmax(0, 1fr)
    minmax(0, 1.24fr)
    minmax(0, 0.9fr)
    minmax(0, 1.08fr);
}

.production-loss-ledger-table .loss-disposition-cell {
  align-content: center;
  gap: 3px;
}

.production-loss-ledger-table .loss-product-cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.production-loss-ledger-table .loss-product-cell .material-identity {
  width: 100%;
}

.production-loss-product-overview {
  margin-bottom: 16px;
}

.production-loss-ledger-table .loss-code-cell {
  display: grid;
  align-content: center;
  gap: 3px;
}

.production-loss-ledger-table .loss-code-cell small {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.production-loss-ledger-table .table-row:not(.table-head) {
  height: 72px;
  min-height: 72px;
}

.production-loss-ledger-table .table-row:not(.table-head) > span {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
}

.production-loss-ledger-table .loss-record-link,
.production-loss-ledger-table .loss-source-link {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 7px;
  color: inherit;
  text-decoration: none;
}

.production-loss-ledger-table .loss-record-link:hover,
.production-loss-ledger-table .loss-record-link:focus-visible,
.production-loss-ledger-table .loss-source-link:hover,
.production-loss-ledger-table .loss-source-link:focus-visible {
  background: #f1f4ed;
  outline: none;
}

.production-loss-ledger-table strong,
.production-loss-ledger-table small {
  display: block;
  min-width: 0;
  overflow: hidden;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-loss-ledger-table .production-reference-row > :nth-child(2) small,
.production-loss-ledger-table .production-reference-row > :nth-child(3) small {
  display: -webkit-box;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.production-reference-row {
  cursor: default;
}

.production-reference-card {
  color: inherit;
  text-decoration: none;
}

.production-card-progress {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 !important;
  overflow: hidden;
  border: 1px solid #ecece5;
  border-radius: 7px;
  background: #fbfcf9;
}

.production-card-progress > span {
  display: grid !important;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: baseline;
  min-width: 0;
  gap: 5px;
  padding: 7px 6px;
  line-height: 1.3;
}

.production-card-progress > span:nth-child(even) {
  border-left: 1px solid #ecece5;
}

.production-card-progress > span:nth-child(n + 3) {
  border-top: 1px solid #ecece5;
}

.production-card-progress > span:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.production-card-progress b {
  color: #77786f;
  font-size: 10px;
  font-weight: 650;
}

.production-card-progress i {
  min-width: 0;
  color: #30322d;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.production-card-attention {
  color: #7a5a24;
  font-size: 11px;
  font-weight: 680;
  line-height: 1.35;
}

.production2-table-row span {
  min-width: 0;
}

.production2-table-row strong,
.production2-table-row small,
.production-line-title strong,
.production-line-title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-document-editor .quote-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.production-process-step-document .quote-form-grid {
  grid-template-columns: minmax(0, 1fr);
}

.production-work-order-detail-section .form-section-head > .mini-status,
.production-operational-detail-section .form-section-head > .mini-status {
  max-width: min(62%, 520px);
  height: auto;
  min-height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-weight: 600;
  line-height: 1.35;
  text-align: right;
  white-space: normal;
}

.production-work-order-detail-section.is-work-order-execution-section .document-fact-grid {
  margin-bottom: 14px;
}

.production-fact-link {
  color: #315f43;
  text-decoration: none;
  text-underline-offset: 3px;
}

.production-fact-link:hover {
  color: #234c35;
  text-decoration: underline;
}

.work-order-editor-product-overview {
  margin: 0;
}

.production-work-order-basic-section .work-order-note-field {
  width: 100%;
  margin-top: 12px;
}

.production-work-order-basic-section .work-order-note-field textarea {
  width: 100%;
  min-height: 60px;
  resize: vertical;
}

.work-order-source-allocation-section .form-section-head > div {
  display: grid;
  gap: 4px;
}

.work-order-source-allocation-section .form-section-head small {
  color: var(--text-muted, #70736e);
  font-size: 12px;
}

.work-order-source-allocation-list {
  overflow: hidden;
  border: 1px solid var(--line-color, #deded9);
  border-radius: 12px;
}

.work-order-source-allocation-head,
.work-order-source-allocation-row {
  display: grid;
  grid-template-columns: minmax(165px, .85fr) minmax(250px, 1.35fr) minmax(145px, .65fr) minmax(105px, .45fr) auto;
  gap: 12px;
  align-items: center;
}

.work-order-source-allocation-head {
  min-height: 38px;
  padding: 8px 14px;
  background: #f2f3ee;
  color: var(--text-muted, #70736e);
  font-size: 11px;
  font-weight: 700;
}

.work-order-source-allocation-row {
  min-height: 72px;
  padding: 11px 14px;
  background: #fff;
}

.work-order-source-allocation-row + .work-order-source-allocation-row {
  border-top: 1px solid #ecece8;
}

.work-order-source-allocation-row a {
  color: inherit;
  text-decoration: none;
}

.work-order-source-allocation-row > .compact-action {
  min-width: 54px;
  white-space: nowrap;
}

.work-order-source-allocation-row > .material-identity {
  width: 100%;
  min-width: 0;
}

.work-order-source-context {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 24px;
  padding-top: 10px;
  border-top: 1px solid #ecece8;
}

.work-order-source-context > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.work-order-source-context span {
  color: var(--text-muted, #70736e);
  font-size: 11px;
  font-weight: 700;
}

.work-order-source-context p {
  margin: 0;
  color: var(--text, #2f312d);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.work-order-source-allocation-qty {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.work-order-source-allocation-qty-label {
  display: none;
  color: var(--text-muted, #70736e);
  font-size: 12px;
}

.work-order-source-allocation-qty :deep(.quantity-with-unit-field input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.work-order-demand-date {
  gap: 3px;
}

.work-order-demand-date > small {
  display: none;
}

.work-order-source-allocation-empty {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 104px;
  padding: 18px 20px;
  align-items: center;
  gap: 20px;
  border: 1px dashed #d8dcd4;
  border-radius: 10px;
  background: #fafbf8;
  text-align: left;
}

.work-order-source-allocation-empty-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.work-order-source-allocation-empty-copy strong {
  color: var(--text, #2f312d);
  font-size: 14px;
}

.work-order-source-allocation-empty-copy small {
  color: var(--text-muted, #70736e);
  font-size: 12px;
}

.work-order-source-allocation-empty-copy .work-order-source-allocation-empty-meta {
  color: #80613b;
}

@media (max-width: 900px) {
  .work-order-source-allocation-row {
    grid-template-columns: 1fr 1fr;
  }

  .work-order-source-allocation-head {
    display: none;
  }

  .work-order-source-allocation-qty-label,
  .work-order-demand-date > small {
    display: block;
  }

  .work-order-source-context {
    grid-template-columns: 1fr;
  }

  .work-order-source-allocation-empty {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .work-order-source-allocation-empty .work-order-demand-picker-trigger {
    justify-self: start;
  }
}

.production-work-order-editor .has-field-error input,
.production-work-order-editor .has-field-error select,
.production-work-order-editor .has-field-error .reference-picker-trigger {
  border-color: #d7665b;
  background: #fff7f5;
}

.work-order-standard-stack {
  display: grid;
  gap: 16px;
}

.work-order-standard-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e5e4dc;
  border-radius: 10px;
  background: #ffffff;
}

.work-order-standard-card.has-field-error {
  border-color: #d7665b;
}

.work-order-standard-select-row {
  display: grid;
  grid-template-columns: minmax(190px, 0.55fr) minmax(300px, 1fr);
  align-items: end;
  gap: 18px;
  min-width: 0;
  padding: 14px 16px;
  border-bottom: 1px solid #e8e8e1;
  background: #fafbf8;
}

.work-order-standard-title {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 40px;
}

.work-order-standard-title strong {
  color: var(--text);
  font-size: 15px;
  font-weight: 900;
}

.work-order-standard-title small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.45;
}

.work-order-standard-select-row .form-field {
  margin: 0;
}

.work-order-standard-preview {
  padding: 0 16px 16px;
}

.work-order-standard-empty {
  margin: 0 16px 16px;
}

.work-order-draft-check-message {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid #e7e8e2;
  color: #9a5b18;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.55;
}

.work-order-draft-check-message.is-ready {
  color: #356443;
}

.work-order-snapshot-block {
  display: grid;
  gap: 14px;
}

.work-order-snapshot-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #e6e7df;
  border-radius: 8px;
  background: #fafbf8;
}

.work-order-snapshot-summary-grid.is-three-columns {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.work-order-snapshot-summary-grid > div {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 64px;
  padding: 10px 12px;
  border-left: 1px solid #e6e7df;
}

.work-order-snapshot-summary-grid > div:first-child {
  border-left: 0;
}

.work-order-snapshot-summary-grid small,
.work-order-snapshot-subhead small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}

.work-order-snapshot-summary-grid strong,
.work-order-snapshot-summary-grid a {
  min-width: 0;
  overflow: visible;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.45;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}

.snapshot-warning-text {
  color: #9a5b18 !important;
}

.work-order-recipe-snapshot-table {
  overflow-x: auto;
  border: 1px solid #e5e6de;
  border-radius: 8px;
  background: #ffffff;
}

.work-order-recipe-snapshot-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.8fr) minmax(100px, 0.72fr) minmax(100px, 0.72fr) minmax(105px, 0.76fr) minmax(115px, 0.8fr);
  min-width: 760px;
  border-top: 1px solid #ecece5;
}

.work-order-recipe-snapshot-row.is-head {
  border-top: 0;
  background: #f5f5f0;
}

.work-order-recipe-snapshot-row > span {
  display: grid;
  align-content: center;
  gap: 3px;
  min-width: 0;
  min-height: 44px;
  padding: 9px 11px;
  border-left: 1px solid #ecece5;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.work-order-recipe-snapshot-row > span:first-child {
  border-left: 0;
}

.work-order-recipe-material-cell > .material-identity,
.production-line-title > .material-identity {
  width: 100%;
  min-width: 0;
}

.work-order-recipe-material-cell :deep(.material-identity__text small) {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  line-height: 1.4;
}

.work-order-recipe-snapshot-row.is-head > span {
  min-height: 34px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 680;
}

.work-order-recipe-snapshot-row strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
}

.work-order-recipe-snapshot-row small {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 450;
}

.work-order-snapshot-subhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: -6px;
}

.work-order-snapshot-subhead.is-route-head {
  margin-top: 2px;
}

.work-order-snapshot-subhead > strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 680;
}

.work-order-snapshot-zone-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(64px, 1fr));
  overflow: hidden;
  border: 1px solid #e4e5dd;
  border-radius: 8px;
  background: #ffffff;
}

.work-order-snapshot-zone-grid > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 58px;
  padding: 8px 10px;
  border-left: 1px solid #e8e9e2;
}

.work-order-snapshot-zone-grid > span:nth-child(7n + 1) {
  border-left: 0;
}

.work-order-snapshot-zone-grid > span:nth-child(n + 8) {
  border-top: 1px solid #e8e9e2;
}

.work-order-snapshot-zone-grid small {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.work-order-snapshot-zone-grid strong {
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.work-order-process-snapshot-steps {
  display: grid;
  gap: 8px;
}

.work-order-process-snapshot-step {
  overflow: hidden;
  border: 1px solid #e5e6de;
  border-radius: 8px;
  background: #ffffff;
}

.work-order-process-snapshot-step > header {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) minmax(130px, auto);
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 9px 11px;
  background: #fafbf8;
}

.work-order-process-snapshot-step > header > b {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid #dfe2da;
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.work-order-process-snapshot-step > header > span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.work-order-process-snapshot-step > header strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.work-order-process-snapshot-step > header small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 450;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-order-process-snapshot-step > header > i {
  justify-self: end;
  color: #3f6449;
  font-size: 11px;
  font-style: normal;
  font-weight: 650;
  text-align: right;
}

.work-order-process-snapshot-guidance {
  display: grid;
  grid-template-columns: minmax(150px, 0.75fr) minmax(240px, 1.35fr) minmax(240px, 1.25fr);
  border-top: 1px solid #e8e9e2;
}

.work-order-process-snapshot-guidance > div {
  min-width: 0;
  padding: 10px 11px 11px;
}

.work-order-process-snapshot-guidance > div + div {
  border-left: 1px solid #ecece5;
}

.work-order-process-snapshot-guidance small {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 650;
}

.work-order-process-snapshot-guidance p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.production-document-editor .production-recipe-fields {
  grid-template-columns: minmax(0, 1.55fr) minmax(190px, 0.75fr);
  align-items: start;
}

.production-document-editor .production-material-request-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}

.production-recipe-fields .recipe-product-field {
  grid-column: auto;
}

.production-recipe-fields textarea,
.production-material-request-fields textarea {
  min-height: 64px;
  resize: vertical;
}

.recipe-section-head {
  align-items: flex-start;
}

.recipe-section-head > div:first-child {
  display: grid;
  gap: 4px;
}

.recipe-section-head p {
  max-width: 620px;
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
}

.recipe-composition-title {
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid #e7e6de;
}

.recipe-composition-group {
  display: grid;
  gap: 10px;
  padding-top: 14px;
}

.recipe-composition-group + .recipe-composition-group {
  margin-top: 6px;
  border-top: 1px solid #ecebe4;
}

.recipe-subsection-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.recipe-subsection-head > div:first-child {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.recipe-subsection-head h3 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 850;
  line-height: 1.35;
}

.recipe-subsection-head p {
  max-width: 620px;
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
}

.recipe-section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recipe-section-actions > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.recipe-section-actions > span.has-balance-warning {
  color: #9a681b;
}

.recipe-version-rule {
  margin: 10px 0 0;
  padding: 9px 10px;
  border: 1px solid #cfdccf;
  border-radius: 8px;
  background: #f4faf4;
  color: #2f5d3a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.45;
}

.recipe-version-rule.has-conflict {
  border-color: #f0b8b0;
  background: #fff6f4;
  color: #9d2b2b;
}

.production-process-step-fields .process-step-name-field {
  grid-column: span 2;
}

.production-task-mini-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.production-section-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.production-task-mini-strip {
  margin-bottom: 12px;
}

.production-task-mini-strip span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #e5e4dc;
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.production-task-mini-strip span.warn {
  border-color: #eed9b1;
  background: #fffaf0;
  color: #8a5c16;
}

.production-task-mini-strip strong {
  color: var(--text);
  font-weight: 650;
}

.production-task-product-table,
.production-task-material-table,
.production-task-workorder-table,
.production-material-request-table {
  overflow-x: auto;
  border: 1px solid #e5e4dc;
  border-radius: 8px;
  background: #fff;
}

.production-task-product-row,
.production-task-material-row,
.production-task-workorder-row,
.production-material-request-row {
  display: grid;
  align-items: stretch;
  min-width: 760px;
  border-bottom: 1px solid #ecebe3;
}

.production-task-product-row {
  grid-template-columns: minmax(250px, 1.75fr) repeat(4, minmax(76px, 0.58fr));
  min-width: 590px;
}

.production-task-product-row.is-task-edit-row {
  grid-template-columns: minmax(280px, 1.9fr) minmax(140px, 0.9fr) minmax(64px, 0.42fr);
  min-width: 520px;
}

.production-task-material-row {
  grid-template-columns:
    minmax(142px, 1.2fr)
    minmax(86px, 0.62fr)
    minmax(118px, 0.82fr)
    minmax(105px, 0.72fr)
    minmax(128px, 0.9fr)
    minmax(92px, 0.62fr);
  min-width: 670px;
}

.production-task-workorder-row {
  grid-template-columns: minmax(170px, 1.2fr) minmax(116px, 0.78fr) minmax(124px, 0.84fr) minmax(120px, 0.8fr) minmax(108px, 0.72fr);
  min-width: 638px;
}

.production-material-request-row {
  min-width: 0;
}

.production-material-request-row.is-readonly-request-row {
  grid-template-columns: minmax(210px, 1.35fr) minmax(96px, 0.62fr) minmax(96px, 0.62fr) minmax(96px, 0.62fr) minmax(180px, 1fr);
  min-width: 700px;
}

@media (min-width: 761px) {
  .production-task-material-row {
    grid-template-columns:
      minmax(170px, 1.35fr)
      minmax(0, 0.62fr)
      minmax(0, 0.82fr)
      minmax(0, 0.72fr)
      minmax(0, 0.82fr)
      minmax(0, 0.75fr);
    min-width: 0;
  }

  .production-task-workorder-row {
    grid-template-columns:
      minmax(0, 1.2fr)
      minmax(0, 0.78fr)
      minmax(0, 0.84fr)
      minmax(0, 0.8fr)
      minmax(0, 0.72fr);
    min-width: 0;
  }

  .production-material-request-row.is-readonly-request-row {
    grid-template-columns: minmax(0, 1.45fr) repeat(3, minmax(0, 0.62fr)) minmax(0, 1.15fr);
    min-width: 0;
  }
}

.production-material-request-row.is-edit-request-row {
  grid-template-columns: minmax(260px, 1.55fr) minmax(118px, 0.68fr) minmax(220px, 1.18fr) minmax(60px, 0.32fr);
  min-width: 660px;
}

.production-task-product-row:last-child,
.production-task-material-row:last-child,
.production-task-workorder-row:last-child,
.production-material-request-row:last-child {
  border-bottom: 0;
}

.production-task-table-head {
  min-height: 42px;
  background: #f3f3ee;
  color: #66685e;
  font-size: 12px;
  font-weight: 680;
}

.production-task-product-row > span,
.production-task-material-row > span,
.production-task-workorder-row > span,
.production-material-request-row > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-right: 1px solid #ecebe3;
}

.production-task-product-row > span:last-child,
.production-task-material-row > span:last-child,
.production-task-workorder-row > span:last-child,
.production-material-request-row > span:last-child {
  border-right: 0;
}

.production-task-product-cell strong,
.production-task-workorder-row strong,
.production-task-quantity-cell strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-task-product-cell > .material-identity {
  width: 100%;
}

.production-task-product-cell small,
.production-task-workorder-row small,
.production-task-material-row small {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 450;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-task-workorder-row:not(.production-task-table-head) strong,
.production-task-workorder-row:not(.production-task-table-head) small {
  overflow: visible;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}

.production-task-material-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-task-material-row strong.warn {
  color: #8a5c16;
}

.production-task-quantity-cell > strong {
  font-variant-numeric: tabular-nums;
}

.production-task-quantity-cell > strong.warn {
  color: #8a5c16;
}

.production-task-quantity-input {
  position: relative;
  display: block;
  min-width: 0;
}

.production-task-quantity-input input {
  padding-right: 38px;
}

.production-task-quantity-input em {
  position: absolute;
  top: 50%;
  right: 11px;
  color: var(--text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
  pointer-events: none;
  transform: translateY(-50%);
}

.production-task-material-stock-cell small,
.production-task-material-gap-cell small {
  overflow: visible;
  line-height: 1.35;
  text-overflow: clip;
  white-space: normal;
}

.production-task-material-supplement-cell strong {
  overflow: visible;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: clip;
  white-space: normal;
}

.production-task-material-status-cell {
  justify-items: start;
}

.production-task-workorder-node-cell strong,
.production-task-workorder-node-cell small {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.35;
  text-overflow: clip;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.task-material-request-panel {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eeeee7;
}

.task-material-request-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.task-material-request-panel-head div {
  display: grid;
  gap: 3px;
}

.task-material-request-panel-head strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 680;
}

.task-material-request-panel-head small {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 450;
}

.task-material-request-list {
  display: grid;
  overflow: hidden;
  border: 1px solid #e5e4dc;
  border-radius: 8px;
  background: #fff;
}

.task-material-request-item {
  display: grid;
  grid-template-columns: minmax(170px, 0.9fr) minmax(210px, 1.15fr) minmax(132px, 0.68fr);
  gap: 14px;
  min-width: 0;
  padding: 11px 12px;
  border-bottom: 1px solid #ecebe3;
  color: inherit;
  text-decoration: none;
}

.task-material-request-item:last-child {
  border-bottom: 0;
}

.task-material-request-item:hover {
  background: #f8f8f3;
}

.task-material-request-item > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.task-material-request-item > span:last-child {
  justify-items: end;
  text-align: right;
}

.task-material-request-item strong,
.task-material-request-item small {
  min-width: 0;
}

.task-material-request-item strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-material-request-item small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 450;
  line-height: 1.35;
  white-space: normal;
}

.compact-empty {
  padding: 14px;
}

.production-task-product-row input,
.production-material-request-row input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #deddd3;
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--text);
  font-size: 13px;
  font-weight: 750;
}

.production-task-product-row input:focus,
.production-material-request-row input:focus {
  border-color: #b8cfbc;
  outline: 2px solid #e2f0e4;
}

.production-task-product-row .has-field-error input,
.production-task-product-row .has-field-error .reference-picker-trigger,
.production-material-request-row .has-field-error input,
.production-material-request-row .has-field-error .reference-picker-trigger {
  border-color: #d7665b;
  background: #fff7f5;
}

.production-material-request-purpose-cell {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 450;
}

.row-action-cell {
  justify-items: center;
}

.production-process-step-rule-fields {
  grid-template-columns: 1fr;
}

.production-process-step-rule-fields textarea,
.production-process-step-action-card textarea {
  resize: vertical;
}

.production-process-template-fields .process-template-name-field {
  grid-column: span 2;
}

.production-process-template-fields .process-template-line-types-field {
  grid-column: 1 / -1;
}

.process-template-zone-unit-note {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 750;
}

.process-template-tolerance-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 750;
}

.process-template-tolerance-control input {
  width: 154px;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid #dddeda;
  border-radius: 7px;
  background: #fff;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.process-template-tolerance-control.has-field-error input {
  border-color: #d7665b;
  background: #fff7f5;
}

.process-template-source-link {
  min-height: 38px;
  align-content: center;
  padding: 0 1px;
}

.process-template-temperature-matrix {
  display: grid;
  gap: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e1e4de;
  border-radius: 8px;
  background: #ffffff;
}

.production-process-step-badges {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.process-template-zone-group {
  display: grid;
  grid-template-columns: repeat(var(--zone-count), minmax(0, 1fr));
  gap: 0;
  min-width: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #ffffff;
}

.process-template-zone-group + .process-template-zone-group {
  border-top: 1px solid #d4d8d1;
}

.process-template-zone-item {
  box-sizing: border-box;
  display: grid;
  align-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 70px;
  padding: 10px 12px;
  border: 0;
  border-left: 1px solid #e7e9e4;
  border-radius: 0;
  background: #ffffff;
}

.process-template-zone-item:first-child {
  border-left: 0;
}

.process-template-zone-item > span {
  color: #6f776f;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.25;
}

.process-template-zone-item input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 0 1px;
  border: 0;
  border-bottom: 1px solid #d7dcd4;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  font-weight: 850;
  font-variant-numeric: tabular-nums;
  text-align: left;
}

.process-template-zone-item input:focus {
  border-color: #6e8f73;
  outline: none;
}

.process-template-zone-item input.has-field-error {
  border-bottom-color: #c86c66;
  background: #fffafa;
}

.process-template-zone-item strong {
  min-width: 0;
  overflow: hidden;
  color: #252a25;
  font-size: 16px;
  font-weight: 820;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-template-temperature-matrix.is-readonly-matrix .process-template-zone-item {
  min-height: 62px;
  background: #ffffff;
}

.process-template-temperature-matrix.is-readonly-matrix .process-template-zone-item:first-child {
  border-left: 0;
}

.process-template-step-board {
  display: grid;
  gap: 0;
  overflow: hidden;
  padding: 0;
  border: 1px solid #dde1da;
  border-radius: 10px;
  background: #ffffff;
}

.process-template-step-line {
  position: relative;
  display: block;
  overflow: visible;
  border: 0;
  border-bottom: 1px solid #e4e7e1;
  border-radius: 0;
  background: #ffffff;
}

.process-template-step-line:last-child {
  border-bottom: 0;
}

.process-template-step-index {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid #d8ddd5;
  border-radius: 50%;
  background: #ffffff;
  color: #596159;
  font-size: 11px;
  font-weight: 850;
  line-height: 1;
}

.process-template-step-content {
  display: grid;
  gap: 0;
  min-width: 0;
}

.process-template-stage-readonly {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.process-template-stage-overview {
  display: grid;
  grid-template-columns: minmax(180px, 0.7fr) minmax(170px, 0.64fr) minmax(240px, 1fr);
  align-items: center;
  gap: 14px;
  min-width: 0;
  min-height: 52px;
  padding: 9px 12px;
  border-bottom: 1px solid #e8ebe5;
}

.process-template-stage-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 24px;
}

.process-template-stage-identity > strong {
  min-width: 0;
  overflow: visible;
  color: var(--text);
  font-size: 14px;
  font-weight: 850;
  line-height: 1.35;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}

.process-template-stage-fact {
  display: grid;
  align-content: start;
  gap: 3px;
  min-width: 0;
}

.process-template-stage-fact > span {
  color: #737b73;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.35;
}

.process-template-stage-fact > strong {
  min-width: 0;
  color: #343b36;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.process-template-stage-overview > .process-template-stage-fact {
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding-left: 14px;
  border-left: 1px solid #eceee9;
}

.process-template-stage-fact.is-action-fact > strong,
.process-template-step-action-inline > strong {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.process-template-system-action-link {
  color: #2d352f;
  font-size: inherit;
  font-weight: 780;
  line-height: inherit;
  text-decoration: underline;
  text-decoration-color: #aab2aa;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.process-template-system-action-link:hover {
  color: #111411;
  text-decoration-color: #111411;
}

.process-template-stage-execution {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  min-width: 0;
  background: #fcfcfa;
}

.process-template-stage-execution .process-template-stage-fact {
  padding: 8px 12px;
}

.process-template-stage-execution .is-completion-fact {
  border-left: 1px solid #eceee9;
}

.process-template-stage-execution .is-long-fact {
  grid-column: 1 / -1;
  grid-template-columns: 70px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  border-top: 1px solid #eceee9;
}

.process-template-step-line-top {
  display: grid;
  grid-template-columns: minmax(180px, 0.68fr) minmax(170px, 0.62fr) minmax(240px, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-width: 0;
  min-height: 58px;
  padding: 10px 14px;
  background: #ffffff;
}

.process-template-step-board.is-readonly-board .process-template-step-line-top {
  grid-template-columns: minmax(180px, 0.72fr) minmax(260px, 1.28fr);
}

.process-template-step-picker,
.process-template-step-action-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.process-template-step-picker > span,
.process-template-step-action-inline > span,
.process-template-work-line > span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
}

.process-template-step-picker > .process-template-step-index,
.process-template-stage-identity > .process-template-step-index {
  color: #596159;
  font-size: 11px;
  line-height: 1;
}

.process-template-step-picker select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid #dfded4;
  border-radius: 7px;
  background: #ffffff;
  color: var(--text);
  font-size: 13px;
  font-weight: 750;
}

.process-template-step-picker strong,
.process-template-step-action-inline strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.42;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-template-step-picker strong {
  font-size: 14px;
  line-height: 1.3;
}

.process-template-node-type {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid #e0e4dd;
  border-radius: 999px;
  background: #f7f8f5;
  color: #687068;
  font-size: 10px;
  font-style: normal;
  font-weight: 750;
  line-height: 1.35;
}

.process-template-step-picker small {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-template-step-action-inline {
  min-height: 34px;
  padding-left: 14px;
  border-left: 1px solid #e8eae5;
}

.process-template-step-action-inline > span {
  flex: 0 0 auto;
  width: 58px;
  padding: 0;
  color: #707770;
  font-size: 11px;
}

.process-template-step-action-inline strong {
  color: #3c443e;
  font-size: 12px;
  font-weight: 700;
  white-space: normal;
}

.process-template-work-lines {
  display: grid;
  min-width: 0;
  border-top: 1px solid #e8eae5;
  background: #fcfcfa;
}

.process-template-work-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
  align-items: start;
  min-width: 0;
  padding: 10px 12px 11px;
  border-top: 0;
}

.process-template-work-line:first-child {
  border-top: 0;
}

.process-template-work-line > span {
  padding-top: 0;
  color: #737b73;
  font-size: 10.5px;
}

.process-template-work-line input,
.process-template-work-line textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid #dfded4;
  border-radius: 7px;
  background: #ffffff;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.process-template-work-line input {
  min-height: 34px;
  padding: 0 9px;
}

.process-template-work-line textarea {
  min-height: 54px;
  padding: 8px 9px;
  resize: vertical;
  line-height: 1.42;
}

.process-template-work-line strong {
  min-height: 0;
  padding: 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.5;
  white-space: normal;
}

.process-template-work-lines.is-new-work-lines .process-template-work-line {
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.process-template-work-lines.is-new-work-lines {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas:
    "core completion"
    "work work"
    "issue issue";
}

.process-template-work-lines.is-new-work-lines .process-template-work-line {
  min-height: 60px;
}

.process-template-work-lines.is-new-work-lines .is-core-field {
  grid-area: core;
}

.process-template-work-lines.is-new-work-lines .is-completion-field {
  grid-area: completion;
  border-left: 1px solid #eceee9;
}

.process-template-work-lines.is-new-work-lines .is-work-field {
  grid-area: work;
  border-top: 1px solid #eceee9;
}

.process-template-work-lines.is-new-work-lines .is-issue-field {
  grid-area: issue;
  border-top: 1px solid #eceee9;
}

.process-template-work-lines.is-new-work-lines textarea {
  height: 44px;
  min-height: 44px;
}

.process-template-row-actions {
  display: flex !important;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.process-template-expand-action {
  min-height: 30px;
  padding-inline: 9px;
  border-color: #dcddd5;
  background: #ffffff;
  color: #454840;
  font-size: 11px;
}

.process-template-row-actions .icon-button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.process-template-empty {
  min-height: 46px;
  padding: 13px;
  border: 1px dashed #dfded4;
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--muted);
  font-size: 13px;
  font-weight: 750;
}

.production-process-template-step-section.has-field-error {
  border-color: #e05f5f;
}

.process-step-action-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.process-step-action-overview span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #e5e5dc;
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.process-step-action-overview strong {
  color: var(--text);
}

.process-step-action-empty {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 12px;
  border: 1px dashed #dfded4;
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.process-step-action-grid {
  display: grid;
  gap: 12px;
}

.process-step-action-card {
  display: grid;
  gap: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e5e5dc;
  border-radius: 8px;
  background: #ffffff;
}

.process-step-action-card.is-blocking-action {
  border-color: #c9d9ca;
  box-shadow: inset 3px 0 0 #6f9a72;
}

.process-step-action-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 12px 14px;
  border-bottom: 1px solid #ecece5;
  background: #fbfbf7;
}

.process-step-action-title,
.process-step-action-head-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.process-step-action-title {
  flex: 1;
}

.process-step-action-head-tools {
  flex: 0 0 auto;
}

.process-step-action-index,
.process-step-actor-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
  white-space: nowrap;
}

.process-step-action-index {
  border: 1px solid #e0dfd5;
  background: #ffffff;
  color: var(--text-muted);
}

.process-step-actor-chip {
  border: 1px solid #dbe4dc;
  background: #eef6ee;
  color: #315f3c;
}

.process-step-action-card-head strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 15px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-step-action-edit-grid,
.process-step-action-readonly-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
  padding: 14px;
}

.process-step-action-field,
.process-step-action-readonly-grid > span {
  display: grid;
  align-content: start;
  gap: 5px;
  min-width: 0;
}

.process-step-action-field span,
.process-step-action-readonly-grid small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.process-step-action-field input,
.process-step-action-field select,
.process-step-action-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid #dfded4;
  border-radius: 7px;
  background: #ffffff;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.process-step-action-field textarea {
  min-height: 58px;
  padding-block: 8px;
  line-height: 1.45;
}

.process-step-action-field .has-field-error,
.process-step-action-card .has-field-error {
  border-color: #e05f5f;
  background: #fff7f7;
}

.process-step-action-checkbox {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  align-content: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #e5e5dc;
  border-radius: 7px;
  background: #fbfbf7;
}

.process-step-action-checkbox input {
  width: 16px;
  min-height: 16px;
  padding: 0;
}

.process-step-action-checkbox span {
  color: var(--text);
  font-size: 12px;
}

.full-action-field {
  grid-column: 1 / -1;
}

.process-step-action-readonly-grid > span {
  min-height: 48px;
  padding: 9px 10px;
  border: 1px solid #ecece5;
  border-radius: 8px;
  background: #ffffff;
}

.process-step-action-readonly-grid strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-step-action-readonly-grid .full-action-field strong {
  overflow: visible;
  line-height: 1.4;
  text-overflow: clip;
  white-space: normal;
}

.production-recipe-detail-section {
  overflow: hidden;
}

.recipe-product-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid #e4e7e1;
  border-radius: 9px;
  background: #fbfcf9;
}

.recipe-product-overview-label {
  color: #747b74;
  font-size: 11px;
  font-weight: 650;
}

.recipe-product-overview .material-identity {
  width: 100%;
}

.recipe-product-standard {
  display: block;
  margin-top: 1px;
  color: #59625b;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.production-recipe-detail-section .recipe-material-table-wrap {
  overflow-x: hidden;
}

.production-recipe-editor-table {
  min-width: 0;
}

.production-recipe-editor-table input,
.production-recipe-editor-table select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid #dfded4;
  border-radius: 7px;
  background: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.production-recipe-editor-table input:read-only,
.production-recipe-editor-table select:disabled {
  background: #fafaf6;
  color: var(--text-muted);
}

.production-recipe-editor-table strong {
  display: flex;
  align-items: center;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
}

.production-recipe-editor-table .production-recipe-edit-row {
  grid-template-columns:
    minmax(205px, 1.5fr)
    minmax(116px, 0.72fr)
    minmax(120px, 0.74fr)
    42px;
}

.production-recipe-editor-table .has-field-error {
  border-color: #e05f5f;
  background: #fff7f7;
}

.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head) {
  transition: box-shadow 140ms ease;
}

.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head):hover,
.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head):focus-within {
  box-shadow: inset 3px 0 #789477;
}

.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head):hover > span,
.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head):focus-within > span {
  background: #fbfdf9;
}

.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head):hover > .recipe-required-cell,
.production-recipe-editor-table .production-recipe-readonly-row:not(.production-recipe-readonly-head):focus-within > .recipe-required-cell {
  background: #f3f8f2;
}

.danger-icon-button {
  display: grid;
  place-items: center;
  align-self: center;
  justify-self: center;
  color: #9d2b2b;
}

.danger-icon-button:hover,
.danger-icon-button:focus-visible {
  border-color: #f4b6b6;
  background: #fff7f7;
}

.production-line-table {
  overflow-x: auto;
}

.production-process-trace-disclosure {
  overflow: hidden;
  border: 1px solid #e3e6de;
  border-radius: 9px;
  background: #fbfcf9;
}

.production-process-trace-disclosure > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 62px;
  padding: 10px 14px;
  cursor: pointer;
  list-style: none;
}

.production-process-trace-disclosure > summary::-webkit-details-marker {
  display: none;
}

.production-process-trace-disclosure > summary span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.production-process-trace-disclosure > summary strong {
  color: #2c312d;
  font-size: 13px;
}

.production-process-trace-disclosure > summary small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-process-trace-disclosure > summary em {
  flex: 0 0 auto;
  color: #667067;
  font-size: 11px;
  font-style: normal;
  font-weight: 650;
}

.production-process-trace-disclosure[open] > summary {
  border-bottom: 1px solid #e3e6de;
  background: #f6f8f4;
}

.production-process-trace-disclosure[open] > summary em::before {
  content: '收起';
}

.production-process-trace-disclosure[open] > summary em {
  font-size: 0;
}

.production-process-trace-disclosure[open] > summary em::before {
  font-size: 11px;
}

.production-process-trace-disclosure .production-line-table {
  border: 0;
  border-radius: 0;
}

.production-document-line-row {
  grid-template-columns: minmax(180px, 1fr) minmax(170px, 1fr) minmax(120px, 0.65fr) minmax(260px, 1.3fr);
}

.production-operational-detail-section .production-document-line-row {
  grid-template-columns: minmax(126px, 1fr) minmax(112px, 0.82fr) minmax(88px, 0.58fr) minmax(164px, 1.2fr);
  min-width: 0;
}

.production-operational-detail-section .production-line-values strong,
.production-operational-detail-section .production-line-values small {
  overflow: visible;
  line-height: 1.42;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}

.is-device-operation-section .production-line-table {
  overflow: hidden;
  border: 1px solid #e3e6de;
  border-radius: 9px;
  background: #fff;
}

.is-device-operation-section .production-document-line-row {
  grid-template-columns: minmax(126px, 0.92fr) minmax(112px, 0.9fr) minmax(82px, 0.55fr) minmax(170px, 1.5fr);
  min-width: 0;
}

.is-device-operation-section .production-document-line-row:not(.quote-line-head) {
  min-height: 74px;
}

.is-device-operation-section .production-document-line-row:not(.quote-line-head) > span {
  background: #fcfdfa;
}

.is-device-operation-section .production-document-line-row:not(.quote-line-head):hover > span {
  background: #f7faf5;
}

.is-material-actual-section .production-line-table {
  overflow: hidden;
}

.is-material-actual-section .production-document-line-row {
  grid-template-columns: minmax(138px, 1.15fr) minmax(88px, 0.68fr) minmax(88px, 0.68fr) minmax(176px, 1.7fr);
  min-width: 0;
}

.is-material-actual-section .production-line-values small {
  overflow-wrap: anywhere;
}

.production-work-order-document .production-document-line-row {
  grid-template-columns: minmax(138px, 1.02fr) minmax(116px, 0.86fr) minmax(88px, 0.6fr) minmax(176px, 1.35fr);
  min-width: 0;
}

.production-recipe-readonly-table {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e5e5dc;
  border-radius: 9px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(34, 43, 35, 0.03);
  font-variant-numeric: tabular-nums;
}

.production-recipe-readonly-row {
  display: grid;
  grid-template-columns:
    minmax(220px, 1.5fr)
    minmax(150px, 0.9fr)
    minmax(145px, 0.75fr);
  align-items: stretch;
  min-width: 0;
  border-top: 1px solid #ecece5;
  background: #ffffff;
}

.production-recipe-readonly-head {
  min-height: 36px;
  border-top: 0;
  background: #f5f5f0;
}

.production-recipe-readonly-row > span {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
  padding: 9px 10px;
  border-left: 1px solid #ecece5;
}

.production-recipe-readonly-row > span:first-child {
  border-left: 0;
}

.production-recipe-readonly-head > span {
  color: #55564c;
  font-size: 12px;
  font-weight: 800;
}

.production-recipe-edit-table {
  overflow: visible;
}

.production-recipe-edit-row:not(.production-recipe-readonly-head) {
  min-height: 62px;
}

.production-recipe-fixed-row {
  grid-template-columns: minmax(240px, 1.5fr) minmax(180px, 0.9fr);
}

.production-recipe-editor-table .production-recipe-fixed-row:not(.production-recipe-readonly-head) {
  min-height: 62px;
}

.production-recipe-editor-table .production-recipe-fixed-row {
  grid-template-columns: minmax(230px, 1.55fr) minmax(150px, 0.86fr) 42px;
}

.recipe-edit-material-cell .reference-picker-trigger,
.recipe-edit-material-cell .reference-picker-readonly {
  min-height: 36px;
  border-color: #dfded4;
  background: #ffffff;
}

.recipe-edit-quantity-cell {
  gap: 6px;
}

.recipe-edit-number-field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.recipe-inline-unit-field {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
}

.recipe-inline-unit-field small {
  min-width: 14px;
  color: #4d5049;
  font-size: 12px;
  font-weight: 750;
  text-align: left;
  white-space: nowrap;
}

.recipe-edit-number-field small {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
}

.recipe-edit-required-cell {
  padding-right: 10px;
}

.production-recipe-loss-row {
  grid-template-columns:
    minmax(188px, 1.16fr)
    minmax(118px, 0.62fr)
    minmax(92px, 0.48fr)
    minmax(192px, 1.1fr);
}

.production-recipe-loss-table.production-recipe-editor-table .production-recipe-loss-row {
  grid-template-columns:
    minmax(174px, 1.18fr)
    minmax(88px, 0.54fr)
    minmax(76px, 0.42fr)
    minmax(170px, 1fr)
    42px;
}

.recipe-line-action-head,
.recipe-line-action-cell {
  place-items: center;
  padding: 0 6px !important;
  background: #fafaf6;
}

.recipe-line-action-cell .danger-icon-button {
  align-self: center;
  justify-self: center;
}

.recipe-loss-empty {
  display: flex;
  align-items: center;
  min-height: 46px;
  padding: 0 12px;
  border: 1px dashed #dfded4;
  border-radius: 8px;
  background: #fbfbf7;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.recipe-loss-material-cell select {
  min-height: 36px;
  padding-right: 28px;
}

.production-recipe-editor-table .recipe-loss-material-cell {
  align-content: center;
  padding-block: 9px;
}

.recipe-loss-input-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  padding-inline: 9px;
}

.recipe-loss-input-cell small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.recipe-loss-input-cell input {
  padding-inline: 6px;
}

.production-recipe-loss-table input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}

.production-recipe-loss-table input[type='number']::-webkit-inner-spin-button,
.production-recipe-loss-table input[type='number']::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.production-recipe-editor-table .recipe-loss-fixed-cell {
  grid-template-columns: minmax(72px, 1fr) auto;
}

.production-recipe-editor-table .recipe-loss-rate-cell {
  grid-template-columns: minmax(48px, 1fr) auto;
}

.recipe-readonly-material strong,
.recipe-readonly-quantity strong,
.recipe-required-cell strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-readonly-material > .material-identity {
  width: 100%;
}

.recipe-material-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 1px;
}

.recipe-material-tags em {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border: 1px solid #e0e3dc;
  border-radius: 999px;
  background: #f7f8f4;
  color: #606760;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.recipe-readonly-material small {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
}

.recipe-readonly-material small b {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-readonly-material small em,
.recipe-mode-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid #dfded4;
  border-radius: 999px;
  background: #f8f8f2;
  color: #55564c;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.recipe-mode-chip.is-percent {
  border-color: #cfdccf;
  background: #f1f7f0;
  color: #365c3c;
}

.recipe-mode-chip.is-fixed {
  border-color: #d8d5c4;
  background: #faf7e9;
  color: #6a5526;
}

.recipe-readonly-quantity small,
.recipe-required-cell small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-required-cell {
  background: #f7faf6;
}

.recipe-required-cell strong {
  color: #1f4f36;
}

.recipe-required-cell strong.is-pending-value {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.recipe-loss-formula-cell {
  position: relative;
  align-content: center;
  min-height: 46px;
}

.recipe-loss-formula-cell strong {
  align-items: center;
  min-height: 24px;
  overflow: visible;
  line-height: 1.35;
  text-overflow: clip;
  white-space: normal;
}


.production-line-title,
.production-line-values {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.production-line-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  max-width: 100%;
}

.production-line-link span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.production-line-link svg {
  flex: 0 0 auto;
}

.production-line-values small {
  color: var(--text-muted);
}

@media (max-width: 1260px) and (min-width: 761px) {
  .production-list-shell.production-tasks-shell {
    grid-template-columns: minmax(0, 1fr) 360px;
  }

  .production-list-shell.production-work-orders-shell {
    grid-template-columns: minmax(0, 1fr) 268px;
  }

  .production-list-shell.production-execution-cards-shell {
    grid-template-columns: minmax(0, 1fr) 340px;
  }

  .production-status-overview-cell {
    padding-inline: 7px;
  }

  .production-status-overview-head {
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 4px;
    padding-inline: 7px;
  }

}

@media (max-width: 900px) {
  .production-list-shell.production-work-orders-shell {
    grid-template-columns: minmax(0, 1fr) 268px;
  }

  .production-list-shell.production-execution-cards-shell {
    grid-template-columns: minmax(0, 1fr) 340px;
  }

  .recipe-section-head,
  .recipe-subsection-head,
  .recipe-section-actions {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .production-document-editor .quote-fields {
    grid-template-columns: 1fr;
  }

  .production-recipe-readonly-table {
    overflow-x: auto;
  }

  .production-recipe-edit-row {
    min-width: 560px;
  }

  .production-recipe-fixed-row {
    min-width: 460px;
  }

  .production-recipe-loss-row {
    min-width: 640px;
  }

  .production-recipe-fields .recipe-product-field,
  .production-task-fields .task-product-field {
    grid-column: 1 / -1;
  }

  .work-order-standard-select-row {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 10px;
  }

  .work-order-snapshot-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .work-order-snapshot-summary-grid.is-three-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .work-order-snapshot-summary-grid > div:nth-child(odd) {
    border-left: 0;
  }

  .work-order-snapshot-summary-grid > div:nth-child(n + 3) {
    border-top: 1px solid #e6e7df;
  }

  .work-order-snapshot-zone-grid {
    overflow-x: auto;
  }

  .work-order-process-snapshot-step > header {
    grid-template-columns: 26px minmax(0, 1fr);
  }

  .work-order-process-snapshot-step > header > i {
    grid-column: 2;
    justify-self: start;
    text-align: left;
  }

  .work-order-process-snapshot-guidance {
    grid-template-columns: 1fr;
  }

  .work-order-process-snapshot-guidance > div + div {
    border-top: 1px solid #ecece5;
    border-left: 0;
  }

  .production-process-step-fields .process-step-name-field,
  .production-process-template-fields .process-template-name-field,
  .process-step-action-edit-grid,
  .process-step-action-readonly-grid {
    grid-column: 1 / -1;
    grid-template-columns: 1fr;
  }

  .process-template-temperature-matrix {
    overflow-x: auto;
  }

  .process-template-zone-group {
    grid-template-columns: repeat(var(--zone-count), 84px);
    width: max-content;
  }

  .process-template-step-line-top,
  .process-template-step-board.is-readonly-board .process-template-step-line-top,
  .process-template-work-line {
    grid-template-columns: 1fr;
  }

  .process-template-work-lines.is-new-work-lines {
    grid-template-columns: 1fr;
    grid-template-areas:
      "core"
      "completion"
      "work"
      "issue";
  }

  .process-template-work-lines.is-new-work-lines .process-template-work-line + .process-template-work-line {
    border-top: 1px solid #f0f0ea;
    border-left: 0;
  }

  .process-template-step-line-top {
    padding-inline: 12px;
  }

  .process-template-step-action-inline {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid #ecece5;
    padding-top: 8px;
  }

  .process-template-work-line > span {
    padding-top: 0;
  }

}

@media (max-width: 640px) {
  .work-order-snapshot-summary-grid {
    grid-template-columns: 1fr;
  }

  .work-order-snapshot-summary-grid.is-three-columns {
    grid-template-columns: 1fr;
  }

  .work-order-snapshot-summary-grid > div,
  .work-order-snapshot-summary-grid > div:nth-child(odd) {
    border-top: 1px solid #e6e7df;
    border-left: 0;
  }

  .work-order-snapshot-summary-grid > div:first-child {
    border-top: 0;
  }

  .process-template-stage-overview,
  .process-template-stage-execution {
    grid-template-columns: 1fr;
  }

  .process-template-stage-overview > .process-template-stage-fact {
    padding-top: 8px;
    padding-left: 0;
    border-top: 1px solid #eceee9;
    border-left: 0;
  }

  .process-template-stage-execution .is-completion-fact {
    border-top: 1px solid #eceee9;
    border-left: 0;
  }
}
</style>
