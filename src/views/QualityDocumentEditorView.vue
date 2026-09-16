<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-vue-next';

import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { useModulePermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { statusPresentationClass } from '../utils/statusPresentation';
import {
  completeIncomingQualityReinspection,
  createIncomingQualityReinspection,
  defectRows,
  getIncomingQualityRecord,
  incomingQualityQuantityLines,
  incomingQualityRows,
  listIncomingQualityRecords,
  qualityPatrolRows,
  productionQualityRows,
  productionQualityRecordFromTask,
  qualityStandardCheckpointRules,
  qualityFlowRecords,
  saveIncomingQualityDraft,
  submitIncomingQualityDecision,
  submitIncomingQualityDisposition,
  type IncomingQualityApiResponse,
  type IncomingQualityDecision,
  type IncomingQualityDecisionLine,
  type IncomingQualityDisposition,
  type IncomingQualityDraftPayload,
  type IncomingQualityReceipt,
  type IncomingQualityReinspection,
  type IncomingQualityReturnDocument,
  type QualityFlowRecord,
  type QualityInspectionItem,
  type QualityLine,
  type QualityRecord,
  type QualityStandardRecord,
  type QualityTabKey,
} from '../data/quality';
import {
  production2Exceptions,
  production2ExecutionCards,
  production2ProcessSteps,
  production2QualityTasks,
  production2WorkOrders,
} from '../data/production2';
import type { Attachment, PurchaseReceipt, ReferenceOption } from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { scrollElementIntoView } from '../utils/focusNavigation';
import {
  isQualityDispositionClosed,
  qualityCurrentAction,
  qualityDispositionStageDisplay,
  qualityDispositionStage as projectQualityDispositionStage,
  qualityInspectionConclusion,
  qualityLifecycleStatus as projectQualityLifecycleStatus,
} from '../utils/qualityState';
import {
  ApiError,
  completeProductionReworkTask,
  createQualityClosure,
  createProductionReworkTask,
  decideProductionQualityTask,
  decideProductionReinspectionTask,
  disposeProductionQualityTask,
  getQualityClosure,
  getProductionQualityTask,
  getPurchaseReceipt,
  listProductionQualityTasks,
  listQualityStandards,
  saveQualityClosure,
  transitionQualityClosure,
  type QualityClosureApiResponse,
  type QualityClosureKind,
  type ProductionQualityDisposition,
  type ProductionQualityApiResponse,
  type ProductionReinspectionItem,
  type ProductionReinspectionTask,
  type ProductionReworkTask,
} from '../services/api';

type QualityDocumentLine = QualityLine & {
  qualifiedQty?: string;
  rejectedQty?: string;
  concessionQty?: string;
  lineDisposition?: string;
};

type QualityDocumentDraft = Omit<QualityRecord, 'products'> & {
  kind: QualityTabKey;
  products: QualityDocumentLine[];
};

type IncomingDispositionDraft = {
  action: '' | IncomingQualityDisposition['action'];
  quantity: string;
  reason: string;
  approvedBy: string;
};

type ProductionDispositionDraft = {
  action: '' | ProductionQualityDisposition['action'];
  quantity: string;
  reason: string;
  approvedBy: string;
};

type ProductionReworkDraft = {
  quantity: string;
  reason: string;
  assignee: string;
};

type ProductionReworkCompletionDraft = {
  resultNote: string;
  inspector: string;
};

type ProductionReinspectionDraft = {
  acceptedQty: string;
  rejectedQty: string;
  resultReason: string;
  inspectionItems: ProductionReinspectionItem[];
};

type IncomingReinspectionCreateDraft = {
  quantity: string;
  reason: string;
  inspector: string;
};

type IncomingReinspectionCompleteDraft = {
  acceptedQty: string;
  rejectedQty: string;
  resultReason: string;
  inspectionItems: QualityInspectionItem[];
};

type IncomingOutcomeTotals = {
  received: Map<string, number>;
  sampled: Map<string, number>;
  qualified: Map<string, number>;
  rejected: Map<string, number>;
  concession: Map<string, number>;
  pending: Map<string, number>;
};

type QualityDocumentConfig = {
  title: string;
  newTitle: string;
  editTitle: string;
  detailTitle: string;
  backLabel: string;
  codeLabel: string;
  partyLabel: string;
  ownerLabel: string;
  dateLabel: string;
  lineTitle: string;
  handlingTitle: string;
  statusTip: string;
  stages: string[];
};
type QualityMoreAction = {
  key: 'change';
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
};
type QualityFollowupAction = {
  label: string;
  description: string;
  path?: string;
};
type QualityDetailFact = {
  label: string;
  value: string;
  full?: boolean;
  path?: string;
};

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteQuality, readonlyReason: qualityReadonlyReason } = useModulePermission('quality');
const showFlowRecords = ref(false);
const moreActionsOpen = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const statusOverrides = ref<Record<string, string>>({});
const localFlowRecords = ref<Record<string, QualityFlowRecord[]>>({});
const localAttachments = ref<Record<string, Attachment[]>>({});
const qualityClosureRevision = ref(0);
const draftInteractionRevision = ref(0);
const runtimeQualityStandards = ref<QualityStandardRecord[]>([]);
const runtimeQualityStandardsLoading = ref(true);
const runtimeQualityStandardsLoaded = ref(false);
const runtimeQualityStandardsError = ref('');
const availableQualityStandards = computed(() => runtimeQualityStandards.value);
const runtimeIncomingQualityReferenceCodes = ref<Set<string>>(new Set());
const runtimeProductionQualityReferenceCodes = ref<Set<string>>(new Set());
const runtimeQualityReferenceCodesLoaded = ref(false);
const qualityValidationAttempted = ref(false);
const qualitySaving = ref(false);
const qualitySubmitting = ref(false);
const incomingDispositionFacts = ref<IncomingQualityDisposition[]>([]);
const incomingDispositionDrafts = ref<Record<string, IncomingDispositionDraft>>({});
const incomingDispositionSubmittingLine = ref('');
const incomingReinspectionFacts = ref<IncomingQualityReinspection[]>([]);
const incomingReturnDocumentFacts = ref<IncomingQualityReturnDocument[]>([]);
const incomingReinspectionCreateDrafts = ref<Record<string, IncomingReinspectionCreateDraft>>({});
const incomingReinspectionCompleteDrafts = ref<Record<string, IncomingReinspectionCompleteDraft>>({});
const incomingReinspectionSubmittingKey = ref('');
const productionDispositionFacts = ref<ProductionQualityDisposition[]>([]);
const productionDispositionDraft = ref<ProductionDispositionDraft>({ action: '', quantity: '', reason: '', approvedBy: '' });
const productionDispositionSubmitting = ref(false);
const productionReworkFacts = ref<ProductionReworkTask[]>([]);
const productionReinspectionFacts = ref<ProductionReinspectionTask[]>([]);
const productionReworkDraft = ref<ProductionReworkDraft>({ quantity: '', reason: '', assignee: '' });
const productionReworkCompletionDrafts = ref<Record<string, ProductionReworkCompletionDraft>>({});
const productionReinspectionDrafts = ref<Record<string, ProductionReinspectionDraft>>({});
const productionProcessSubmittingKey = ref('');
const productionDecisionVersion = ref(0);
let toastTimer: number | undefined;
const productionQualityTypes = ['开机首检', '半成品质检', '报工全检', '入库抽检'] as const;

const routePageMap: Record<string, QualityTabKey> = {
  incoming: 'incoming',
  production: 'production',
  patrol: 'patrol',
  defects: 'defects',
};

const pageRouteMap: Record<QualityTabKey, string> = {
  incoming: 'incoming',
  production: 'production',
  patrol: 'patrol',
  defects: 'defects',
};

const documentConfigs: Record<QualityTabKey, QualityDocumentConfig> = {
  incoming: {
    title: '来料质检',
    newTitle: '新建来料质检',
    editTitle: '登记来料质检',
    detailTitle: '来料质检详情',
    backLabel: '返回来料质检',
    codeLabel: '来料质检单号',
    partyLabel: '供应商',
    ownerLabel: '检验员',
    dateLabel: '检验日期',
    lineTitle: '来料检验明细',
    handlingTitle: '判定说明',
    statusTip: '来料质检先记录按标准得出的检验判定，再记录隔离、退货、让步等业务处置；未放行数量保持质检冻结。',
    stages: ['质检冻结', '检验判定', '业务处置'],
  },
  production: {
    title: '生产质检',
    newTitle: '新建生产质检',
    editTitle: '登记生产质检',
    detailTitle: '生产质检详情',
    backLabel: '返回生产质检',
    codeLabel: '生产质检单号',
    partyLabel: '产线/班组',
    ownerLabel: '检验员',
    dateLabel: '检验日期',
    lineTitle: '生产检验明细',
    handlingTitle: '结论与处置记录',
    statusTip: '生产质检统一处理开机首检、半成品质检、报工全检和入库抽检；各检验环节使用对应标准。',
    stages: ['待检验', '待复判', '合格'],
  },
  patrol: {
    title: '质量巡检',
    newTitle: '新建质量巡检',
    editTitle: '登记质量巡检',
    detailTitle: '质量巡检详情',
    backLabel: '返回质量巡检',
    codeLabel: '巡检单号',
    partyLabel: '巡检位置',
    ownerLabel: '巡检员',
    dateLabel: '巡检日期',
    lineTitle: '巡检明细',
    handlingTitle: '巡检与整改',
    statusTip: '质量巡检用于记录非固定节点的现场主动检查、随机抽查和整改复查；整改复查仍异常时升级为关联不良记录。',
    stages: ['待巡检', '待整改', '待复查', '已关闭'],
  },
  defects: {
    title: '不良记录',
    newTitle: '新建不良记录',
    editTitle: '登记不良处置',
    detailTitle: '不良记录详情',
    backLabel: '返回不良记录',
    codeLabel: '不良单号',
    partyLabel: '责任方',
    ownerLabel: '登记人',
    dateLabel: '登记日期',
    lineTitle: '不良明细',
    handlingTitle: '不良与处置',
    statusTip: '不良记录跟踪来料、生产和客户反馈中的异常，必须形成处置方案并关闭。',
    stages: ['待处理', '处置中', '待验证', '已关闭'],
  },
};

const currentKind = computed<QualityTabKey>(() => {
  const page = route.params.page?.toString() ?? '';
  return routePageMap[page] ?? 'incoming';
});
const currentSlug = computed(() => pageRouteMap[currentKind.value]);
const currentConfig = computed(() => documentConfigs[currentKind.value]);
const mode = computed(() => {
  const name = String(route.name ?? '');
  if (name.includes('new')) return 'new';
  if (name.includes('edit')) return 'edit';
  return 'detail';
});
const isNew = computed(() => mode.value === 'new');
const isEdit = computed(() => mode.value === 'edit');
const isDetail = computed(() => mode.value === 'detail');

const sourceRecord = computed(() => {
  const code = route.params.code?.toString();
  if (!code) return undefined;
  return rowsForKind(currentKind.value).find((row) => row.code === code);
});
const qualityEditableDraft = ref<QualityDocumentDraft | null>(null);
const qualityRecordLoading = ref(false);
const qualityRecordNotFound = ref(false);
const qualityRecordLoadMessage = ref('');
const qualityCreateInstanceToken = ref('');
let qualityRecordLoadRequestId = 0;

const documentDraft = computed<QualityDocumentDraft | null>(() => {
  return qualityEditableDraft.value;
});

const currentStatus = computed(() => {
  if (!documentDraft.value) return '';
  return statusOverrides.value[documentDraft.value.code] ?? documentDraft.value.status;
});
const patrolInspectionFactsLocked = computed(() => (
  currentKind.value === 'patrol' && currentStatus.value !== '待巡检'
));
const patrolResponsibilityEditable = computed(() => (
  currentKind.value === 'patrol' && ['待巡检', '待整改'].includes(currentStatus.value)
));
function inspectionConclusionFromDraft(draft: QualityDocumentDraft) {
  return qualityInspectionConclusion({
    page: draft.kind,
    status: currentStatus.value,
    inspectionConclusion: draft.inspectionConclusion,
    productResults: draft.products.map((line) => line.result),
    qualityOutcome: draft.qualityOutcome,
    defectLevel: draft.defectLevel,
  });
}

const detailInspectionConclusion = computed(() => (
  documentDraft.value ? inspectionConclusionFromDraft(documentDraft.value) : '-'
));

const detailDispositionStage = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return '-';
  if (draft.kind === 'production') {
    return projectQualityDispositionStage({
      page: draft.kind,
      status: currentStatus.value,
      dispositionStage: draft.dispositionStage,
    });
  }

  if (draft.kind === 'patrol' || draft.kind === 'defects') {
    return projectQualityDispositionStage({ page: draft.kind, status: currentStatus.value });
  }

  const hasActiveReinspection = incomingReinspectionFacts.value.some(
    (task) => !incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task),
  );
  if (hasActiveReinspection) return '待复检';
  if (incomingDispositionRemainingTotal() > 0.0001) return '待处置';
  return projectQualityDispositionStage({ page: draft.kind, status: currentStatus.value });
});

const detailStageLabel = computed(() => (
  ['patrol', 'defects'].includes(currentKind.value) ? '处理阶段' : '处置阶段'
));

const detailCurrentAction = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return '-';
  const stage = detailDispositionStage.value;
  return qualityCurrentAction({
    page: draft.kind,
    status: currentStatus.value,
    inspectionConclusion: detailInspectionConclusion.value,
    dispositionStage: stage,
    currentAction: draft.currentAction,
    sourceType: draft.sourceType,
    disposition: draft.disposition,
  }, stage);
});
const referenceTitle = computed(() => {
  const draft = documentDraft.value;
  return draft ? `${currentConfig.value.title} ${draft.code}`.trim() : currentConfig.value.title;
});
const referenceSubtitle = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return '';
  return `${draft.party || draft.sourceDoc || '未选择来源'} · ${detailDispositionStage.value}`;
});
const referencePath = computed(() =>
  documentDraft.value?.code ? `/quality/${currentSlug.value}/${encodeURIComponent(documentDraft.value.code)}` : '',
);
const isLocked = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return false;
  if (['已关闭', '已作废'].includes(currentStatus.value)) return true;
  if (currentKind.value === 'incoming') {
    const hasPendingQuantity = draft.products.some((line) => (incomingLinePendingAmount(line) ?? 0) > 0.0001);
    return (draft.version ?? 0) > 0 && !hasPendingQuantity;
  }
  if (currentKind.value === 'production' && (draft.version ?? 0) > 0) return true;
  return ['合格', '部分放行', '让步接收', '免检放行'].includes(currentStatus.value);
});
const isQualityReadOnly = computed(() => isDetail.value || isLocked.value || !canWriteQuality.value);
const incomingSourceFactsLocked = computed(() => (
  currentKind.value === 'incoming'
  && !isNew.value
  && Boolean(documentDraft.value?.sourceDoc)
));
const productionSourceFactsLocked = computed(() => (
  currentKind.value === 'production'
  && !isNew.value
  && Boolean(documentDraft.value?.sourceDoc)
));
const defectEvidenceLocked = computed(() => (
  currentKind.value === 'defects'
  && !isNew.value
  && Boolean(documentDraft.value?.code)
  && documentDraft.value?.code !== '系统自动生成'
));
const defectPlanLocked = computed(() => (
  currentKind.value === 'defects' && currentStatus.value !== '待处理'
));
const qualitySourceFactsLocked = computed(() => (
  incomingSourceFactsLocked.value
  || productionSourceFactsLocked.value
  || defectEvidenceLocked.value
));
const qualityUnsavedSource = computed(() => ({
  draft: documentDraft.value,
  attachments: localAttachments.value,
}));
const qualityDraftReady = computed(() => Boolean(documentDraft.value) && !qualityRecordLoading.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(qualityUnsavedSource, {
  enabled: computed(() => !isQualityReadOnly.value),
  ready: qualityDraftReady,
});
const showQualityRequiredLabels = computed(() => Boolean(documentDraft.value) && !isLocked.value);
const qualityRequiredLabels = new Set([
  '来源类型',
  '质检类型',
  '巡检类型',
  '质检标准',
  '来源单据',
  '供应商',
  '客户',
  '产线/班组',
  '区域/产线',
  '巡检位置',
  '责任方',
  '生产批次',
  '检验员',
  '巡检员',
  '检验日期',
  '巡检日期',
  '登记日期',
  '要求完成',
  '入库仓库',
  '暂存位置',
  '检验区域',
  '处置区域',
  '生产工单',
  '生产批次',
  '报工批次',
  '完工批次',
  '责任班次',
  '工序',
  '物料',
  '受检物料',
  '巡检对象',
  '不良对象',
  '巡检次数',
  '点位数',
  '批次数量',
  '抽检数量',
  '判定',
  '合格数量',
  '不合格数量',
  '物料处置',
  '缺陷等级',
  '处置方式',
  '检验结论',
  '巡检结论',
  '不良描述',
  '整改说明',
  '处置结果',
  '复查结论',
  '验证结论',
]);
const qualityResultOptions = ['待检验', '合格', '部分合格', '预警', '待整改', '待复查', '不合格', '待复判', '让步接收', '返工', '报废', '免检放行'];
const defectLevelOptions = ['轻微', '一般', '严重', '紧急'];
const dispositionOptions = ['待制定', '待检验', '放行', '现场整改', '复查通过', '生成不良记录', '生成生产异常', '返工', '返绕', '退货', '供应商确认', '补发成品', '报废', '让步接收', '关闭'];
const qualityDispositionOptions = computed(() => {
  if (currentKind.value === 'patrol') return ['待制定', '现场整改', '生成不良记录', '生成生产异常', '关闭'];
  if (currentKind.value === 'defects') return ['待制定', '返工', '返绕', '退货', '供应商确认', '补发成品', '报废', '让步接收'];
  return dispositionOptions;
});
const incomingDispositionOptions = ['待判定', '放行入库', '质检隔离', '退货'];
const incomingSourceTypeOptions = ['采购收货', '委外到货'];
const defectSourceTypeOptions = ['来料质检', '生产质检', '质量巡检', '客户反馈', '库存复检'];
const patrolSourceTypeOptions = ['产线巡检', '包装巡检', '仓储巡查', '设备/环境巡查', '临时抽查'];
const sourceTypeFieldLabel = computed(() =>
  currentKind.value === 'production' ? '质检类型' : currentKind.value === 'patrol' ? '巡检类型' : '来源类型',
);
const sourceDocFieldLabel = computed(() => {
  if (currentKind.value === 'incoming') return '采购收货单';
  if (currentKind.value === 'production') return '生产批次';
  if (currentKind.value === 'patrol') return '关联单据';
  return '来源单据';
});
const lineItemNameLabel = computed(() => {
  if (currentKind.value === 'production') return '受检物料';
  if (currentKind.value === 'patrol') return '巡检对象';
  if (currentKind.value === 'defects') return '不良对象';
  return '物料';
});
const lineResultFieldLabel = computed(() => {
  if (currentKind.value === 'patrol') return '巡检结果';
  if (currentKind.value === 'defects') return '不良判定';
  return '检验结论';
});
const lineItemNamePlaceholder = computed(() => `选择${lineItemNameLabel.value}`);
const conclusionFieldLabel = computed(() => {
  if (currentKind.value === 'incoming') return '检验结论（判定依据）';
  if (currentKind.value === 'patrol') return '巡检结论';
  if (currentKind.value === 'defects') return '不良描述';
  return '检验结论';
});
const pageHeading = computed(() => {
  if (isNew.value) return currentConfig.value.newTitle;
  if (isEdit.value) return isLocked.value ? `${currentConfig.value.title}只读` : currentConfig.value.editTitle;
  return currentConfig.value.detailTitle;
});
const qualityDetailDateLabel = computed(() => (
  ['incoming', 'production'].includes(currentKind.value)
  && ['待检验', '待判定', '待质检'].includes(currentStatus.value)
    ? '任务日期'
    : currentConfig.value.dateLabel
));

function qualityRelatedDocumentPath(code: unknown) {
  const value = String(code || '').trim();
  if (!value) return '';
  if (value.startsWith('QSTD-')) return `/quality/standards/${encodeURIComponent(value)}`;
  if (value.startsWith('WR-')) return `/warehouse/purchase-receipts/${encodeURIComponent(value)}`;
  if (value.startsWith('WS-')) return `/warehouse/sales-issues/${encodeURIComponent(value)}`;
  if (/^MO\d*-/.test(value)) return `/production/work-orders/${encodeURIComponent(value)}`;
  if (/^(?:EC\d*|EXE\d*)-/.test(value)) return `/production/execution-cards/${encodeURIComponent(value)}`;
  if (value.startsWith('SO-')) return `/sales/orders/${encodeURIComponent(value)}`;
  if (value.startsWith('SA-')) return `/sales/after-sales/${encodeURIComponent(value)}`;
  if (value.startsWith('PA-')) return `/purchase/after-sales/${encodeURIComponent(value)}`;
  if (value.startsWith('IQC') || value.startsWith('IQ-')) {
    return runtimeIncomingQualityReferenceCodes.value.has(value)
      ? `/quality/incoming/${encodeURIComponent(value)}`
      : '';
  }
  if (value.startsWith('PQC') || value.startsWith('QC2-')) {
    return runtimeProductionQualityReferenceCodes.value.has(value)
      ? `/quality/production/${encodeURIComponent(value)}`
      : '';
  }
  if (value.startsWith('QPATROL-')) {
    return qualityPatrolRows.some((row) => row.code === value)
      ? `/quality/patrol/${encodeURIComponent(value)}`
      : '';
  }
  if (value.startsWith('NCR-')) {
    return defectRows.some((row) => row.code === value)
      ? `/quality/defects/${encodeURIComponent(value)}`
      : '';
  }
  return '';
}

async function loadRuntimeQualityReferenceCodes() {
  if (runtimeQualityReferenceCodesLoaded.value) return;

  const [incomingResult, productionResult] = await Promise.allSettled([
    listIncomingQualityRecords(),
    listProductionQualityTasks(),
  ]);

  if (incomingResult.status === 'fulfilled') {
    runtimeIncomingQualityReferenceCodes.value = new Set(incomingResult.value.map((row) => row.code));
  }
  if (productionResult.status === 'fulfilled') {
    runtimeProductionQualityReferenceCodes.value = new Set(productionResult.value.map((row) => row.code));
  }
  runtimeQualityReferenceCodesLoaded.value = true;
}

function productionSourceContextFacts(draft: QualityDocumentDraft): QualityDetailFact[] {
  const sourceRows = draft.sourceRequirements || [];
  const requirementSources = new Map<string, string[]>();
  const taskNoteFacts: QualityDetailFact[] = [];
  const seenTaskNotes = new Set<string>();
  const sourceTaskCount = new Set(sourceRows.map((source) => String(source.taskCode || '').trim()).filter(Boolean)).size;

  sourceRows.forEach((source) => {
    const taskCode = String(source.taskCode || '').trim();
    const requirement = String(source.supplementaryRequirement || '').trim();
    const taskNote = productionTaskBusinessNote(source.taskNote);
    if (requirement) {
      const sources = requirementSources.get(requirement) || [];
      if (taskCode && !sources.includes(taskCode)) sources.push(taskCode);
      requirementSources.set(requirement, sources);
    }
    const taskNoteKey = `${taskCode}::${taskNote}`;
    if (taskNote && !seenTaskNotes.has(taskNoteKey)) {
      seenTaskNotes.add(taskNoteKey);
      taskNoteFacts.push({
        label: sourceTaskCount > 1 && taskCode ? `${taskCode} 任务备注` : '任务备注',
        value: taskNote,
        full: true,
      });
    }
  });

  const requirementFacts = [...requirementSources.entries()].map(([requirement, sources]) => ({
      label: requirementSources.size > 1 && sources.length ? `${sources.join(' / ')} 补充要求` : '补充要求',
      value: requirement,
      full: true,
  }));

  const workOrderNote = productionWorkOrderBusinessNote(draft.workOrderNote);
  const workOrderFacts = workOrderNote
    ? [{ label: '工单备注', value: workOrderNote, full: true }]
    : [];
  return [...requirementFacts, ...taskNoteFacts, ...workOrderFacts];
}

function productionTaskBusinessNote(value: unknown) {
  const note = String(value || '').trim();
  return note === '销售订单确认后按未被可用库存覆盖的数量自动建立；生产计划可继续按成品明细拆分工单。'
    ? ''
    : note;
}

function productionWorkOrderBusinessNote(value: unknown) {
  const note = String(value || '').trim();
  const isGeneratedNote = /^来源于生产任务\s+\S+，按选中明细建立工单。$/.test(note)
    || /^销售订单\s+\S+\s+第\s+\S+\s+行缺口\s+[\d,.]+\s*\S+。?$/.test(note);
  return isGeneratedNote ? '' : note;
}

const qualityDetailFacts = computed<QualityDetailFact[]>(() => {
  const draft = documentDraft.value;
  if (!draft) return [];

  if (currentKind.value === 'production') {
    return [
      {
        label: '质检标准',
        value: [draft.qualityStandardCode, draft.qualityStandardName].filter(Boolean).join(' · ') || '-',
        full: true,
        path: qualityRelatedDocumentPath(draft.qualityStandardCode),
      },
      { label: '质检类型', value: draft.sourceType || '-' },
      {
        label: '生产批次',
        value: draft.executionCard || draft.sourceDoc || '-',
        path: qualityRelatedDocumentPath(draft.executionCard || draft.sourceDoc),
      },
      { label: '生产工单', value: draft.workOrder || '-', path: qualityRelatedDocumentPath(draft.workOrder) },
      { label: currentConfig.value.partyLabel, value: draft.party || '-' },
      { label: '责任班次', value: [draft.shiftName, draft.shiftCode].filter(Boolean).join(' / ') || '-' },
      { label: currentConfig.value.ownerLabel, value: draft.inspector || '-' },
      { label: qualityDetailDateLabel.value, value: draft.date || '-' },
      {
        label: '要求完成',
        value: isDetail.value
          ? currentProductionQualityTask.value?.dueTime || draft.dueDate || '-'
          : draft.dueDate || '-',
      },
      { label: '班长', value: draft.leader || '-' },
      { label: '操作员', value: draft.operator || '-' },
      ...(draft.processStep && draft.processStep !== draft.sourceType
        ? [{ label: '工序', value: draft.processStep }]
        : []),
      ...(draft.responsibilityProcess && draft.responsibilityProcess !== draft.processStep
        ? [{ label: '责任工序', value: draft.responsibilityProcess }]
        : []),
      ...productionSourceContextFacts(draft),
    ];
  }

  return [
    ...(['incoming', 'patrol'].includes(currentKind.value)
      ? [{
          label: '质检标准',
          value: [draft.qualityStandardCode, draft.qualityStandardName].filter(Boolean).join(' · ') || '-',
          full: true,
          path: qualityRelatedDocumentPath(draft.qualityStandardCode),
        }]
      : []),
    { label: sourceTypeFieldLabel.value, value: draft.sourceType || '-' },
    ...(currentKind.value === 'patrol' && !draft.sourceDoc
      ? []
      : [{ label: sourceDocFieldLabel.value, value: draft.sourceDoc || '-', path: qualityRelatedDocumentPath(draft.sourceDoc) }]),
    { label: currentConfig.value.partyLabel, value: draft.party || '-' },
    ...(currentKind.value === 'patrol' && draft.contact
      ? [{ label: contactFieldLabel(currentKind.value), value: draft.contact }]
      : []),
    { label: currentConfig.value.ownerLabel, value: draft.inspector || '-' },
    { label: qualityDetailDateLabel.value, value: draft.date || '-' },
    { label: '要求完成', value: draft.dueDate || '-' },
    ...(currentKind.value === 'patrol' && draft.warehouse === draft.party
      ? []
      : currentKind.value === 'defects' && ['待处理区', '-', ''].includes(String(draft.warehouse || '').trim())
      ? []
      : [{ label: warehouseFieldLabel(currentKind.value), value: draft.warehouse || '-' }]),
  ];
});

function qualityRequiredLabelClass(label: string, fieldLocked = false) {
  if (label === '缺陷等级' && currentKind.value !== 'defects') {
    return { 'required-label': false, 'has-field-error': false };
  }
  const missing = Boolean(
    qualityValidationAttempted.value
      && documentDraft.value
      && qualityMissingSubmitFields(documentDraft.value).includes(label),
  );
  return {
    'required-label': !fieldLocked && showQualityRequiredLabels.value && qualityRequiredLabels.has(label),
    'has-field-error': !fieldLocked && missing,
  };
}

function qualityDetailFactClass(fact: QualityDetailFact, index: number) {
  if (fact.full) return { 'fact-span-3': true };

  const regularFacts = qualityDetailFacts.value.filter((item) => !item.full);
  const regularIndex = qualityDetailFacts.value
    .slice(0, index)
    .filter((item) => !item.full)
    .length;
  const remainder = regularFacts.length % 3;
  const balancedTail = remainder === 2 ? 2 : remainder === 1 && regularFacts.length >= 4 ? 4 : 0;

  return {
    'fact-span-half': balancedTail > 0 && regularIndex >= regularFacts.length - balancedTail,
  };
}

function qualityLineFieldClass(value: string | undefined) {
  return {
    'has-line-field-error': qualityValidationAttempted.value && qualityValueIsMissing(value),
  };
}

function uniqueQualityOptions(options: string[]) {
  const placeholders = new Set(['-', '暂无', '待选择', '待制定', '待检验', '系统自动生成']);
  return Array.from(new Set(options.map((option) => String(option ?? '').trim()).filter((option) => option && !placeholders.has(option))));
}

function qualitySourceTypeOptions() {
  if (currentKind.value === 'production') return [...productionQualityTypes];
  if (currentKind.value === 'patrol') return patrolSourceTypeOptions;
  if (currentKind.value === 'defects') return defectSourceTypeOptions;
  return incomingSourceTypeOptions;
}

function qualitySourceDocOptions() {
  if (currentKind.value === 'production') {
    return uniqueQualityOptions([
      ...production2WorkOrders.map((row) => row.code),
      ...production2ExecutionCards.map((row) => row.code),
      ...production2QualityTasks.map((row) => row.code),
      documentDraft.value?.sourceDoc ?? '',
    ]);
  }
  if (currentKind.value === 'defects') {
    const sourceType = documentDraft.value?.sourceType;
    const options = sourceType === '来料质检'
      ? [
          ...incomingQualityRows.map((row) => row.code),
          ...production2QualityTasks.filter((row) => row.code.startsWith('IQC')).map((row) => row.code),
        ]
      : sourceType === '生产质检'
        ? [
            ...productionQualityRows.map((row) => row.code),
            ...production2QualityTasks.filter((row) => !row.code.startsWith('IQC')).map((row) => row.code),
          ]
        : sourceType === '质量巡检'
          ? qualityPatrolRows.map((row) => row.code)
          : [];
    return uniqueQualityOptions([...options, documentDraft.value?.sourceDoc ?? '']);
  }

  if (currentKind.value === 'patrol') {
    return uniqueQualityOptions([
      ...production2WorkOrders.map((row) => row.code),
      ...production2ExecutionCards.map((row) => row.code),
      ...production2QualityTasks.map((row) => row.code),
      documentDraft.value?.sourceDoc ?? '',
    ]);
  }
  return uniqueQualityOptions([documentDraft.value?.sourceDoc ?? '']);
}

function qualityWorkOrderOptions() {
  return uniqueQualityOptions([...production2WorkOrders.map((row) => row.code), documentDraft.value?.workOrder ?? '']);
}

function qualityExecutionCardOptions() {
  return uniqueQualityOptions([...production2ExecutionCards.map((row) => row.code), documentDraft.value?.executionCard ?? '']);
}

function qualityReportBatchOptions() {
  return uniqueQualityOptions([
    ...production2ExecutionCards.map((row) => row.code),
    ...production2QualityTasks.map((row) => row.sourceCard),
    documentDraft.value?.reportBatch ?? '',
  ]);
}

function qualityProcessStepOptions() {
  return uniqueQualityOptions([
    ...productionQualityTypes,
    ...patrolSourceTypeOptions,
    ...production2ProcessSteps.flatMap((row) => [row.name, row.node]),
    documentDraft.value?.processStep ?? '',
    documentDraft.value?.responsibilityProcess ?? '',
  ]);
}

function productionLineOptions() {
  return uniqueQualityOptions([
    ...production2ExecutionCards.flatMap((row) => [row.line, row.lineType]),
    documentDraft.value?.party ?? '',
    documentDraft.value?.productionLine ?? '',
  ]);
}

function patrolLocationOptions() {
  return uniqueQualityOptions([
    ...productionLineOptions(),
    ...qualityPatrolRows.flatMap((row) => [row.party, row.productionLine || '', row.warehouse]),
    ...incomingQualityRows.map((row) => row.warehouse),
    documentDraft.value?.party ?? '',
  ]);
}

function qualityLineMaterialKind() {
  if (currentKind.value === 'incoming') return '非成品';
  return '';
}

function productionTypeFromSource(sourceCode: string, qualityTask?: (typeof production2QualityTasks)[number], card?: (typeof production2ExecutionCards)[number]) {
  if (qualityTask && productionQualityTypes.some((type) => type === qualityTask.kind)) return qualityTask.kind;
  if (sourceCode.startsWith('PKG') || card?.node === '待抽检') return '入库抽检';
  if (sourceCode.startsWith('LRL') || card?.node === '待半成品检') return '半成品质检';
  if (sourceCode.startsWith('RPT')) return '报工全检';
  if (card?.node === '待首件' || card?.node === '待首检') return '开机首检';
  return '';
}

function syncQualityLineFromProductionSource(
  draft: QualityDocumentDraft,
  source: {
    productName?: string;
    qty?: string;
    batch?: string;
    sampleQty?: string;
  },
) {
  if (!source.productName) return;
  const line = draft.products[0] ?? createQualityLine('production', productionStandardFor(draft.sourceType, draft.qualityStandardCode));
  line.name = source.productName;
  line.qty = source.qty || line.qty;
  line.batch = source.batch || line.batch;
  line.sampleQty = source.sampleQty || line.sampleQty;
  if (!line.result || qualityValueIsMissing(line.result)) line.result = '待检验';
  line.inspectionItems = inspectionItemsFromStandard(productionStandardFor(draft.sourceType, draft.qualityStandardCode));
  draft.products[0] = line;
}

function applyProductionQualitySource(draft: QualityDocumentDraft, sourceCode: string) {
  const source = sourceCode.trim();
  if (!source) {
    draft.sourceDoc = '';
    return;
  }

  const historical = productionQualityRows.find(
    (row) => row.code === source || row.sourceDoc === source || row.workOrder === source || row.executionCard === source || row.reportBatch === source,
  );
  const qualityTask = production2QualityTasks.find((task) => task.code === source || task.sourceCard === source || task.workOrderCode === source);
  const card = production2ExecutionCards.find(
    (item) => item.code === source || item.code === qualityTask?.sourceCard || item.code === historical?.executionCard || item.code === historical?.sourceDoc,
  );
  const workOrder = production2WorkOrders.find(
    (item) => item.code === source || item.code === qualityTask?.workOrderCode || item.code === card?.workOrderCode || item.code === historical?.workOrder,
  );
  const plannedLine = card ? workOrder?.linePlans.find((line) => line.line === card.line) : workOrder?.linePlans[0];
  const inferredType = historical?.sourceType || productionTypeFromSource(source, qualityTask, card) || draft.sourceType;

  draft.sourceDoc = source;
  draft.sourceType = inferredType;
  updateProductionInspectionItems(draft, productionStandardFor(inferredType, draft.qualityStandardCode));

  const sourceIsWorkOrder = Boolean(workOrder && source === workOrder.code);
  draft.workOrder = workOrder?.code || qualityTask?.workOrderCode || historical?.workOrder || draft.workOrder;
  draft.executionCard = card?.code || qualityTask?.sourceCard || historical?.executionCard || (sourceIsWorkOrder ? '' : draft.executionCard);
  draft.reportBatch =
    historical?.reportBatch || (sourceIsWorkOrder
      ? ''
      : inferredType === '半成品质检'
        ? qualityTask?.sourceWipBatchCode || source
        : inferredType === '入库抽检'
          ? source
          : card?.code || qualityTask?.sourceCard || draft.reportBatch);
  draft.party = historical?.party || qualityTask?.line || card?.line || plannedLine?.line || draft.party;
  draft.productionLine = historical?.productionLine || qualityTask?.line || card?.line || plannedLine?.line || draft.productionLine;
  draft.leader = historical?.leader || card?.leader || plannedLine?.leader || draft.leader;
  draft.operator = historical?.operator || card?.operator || (sourceIsWorkOrder ? '' : draft.operator);
  draft.shiftName = historical?.shiftName || card?.shift || (sourceIsWorkOrder ? '' : draft.shiftName);
  draft.shiftCode =
    historical?.shiftCode ||
    (draft.shiftName === '白班' ? 'SHIFT-20260701-D' : draft.shiftName === '夜班' ? 'SHIFT-20260701-N' : sourceIsWorkOrder ? '' : draft.shiftCode);
  draft.warehouse =
    historical?.warehouse || (inferredType === '入库抽检' ? '待入库区' : inferredType === '报工全检' ? '待打包区' : '生产线边仓');
  draft.contact = historical?.contact || draft.operator || draft.leader || draft.contact;
  syncProductionTypeMeta(draft);
  syncQualityLineFromProductionSource(draft, {
    productName: historical?.products?.[0]?.name || qualityTask?.productName || card?.productName || workOrder?.productName,
    qty: historical?.products?.[0]?.qty || (card ? `${card.reportedQty || card.planQty} ${card.unit}` : workOrder ? `${workOrder.planQty} ${workOrder.unit}` : ''),
    batch: historical?.products?.[0]?.batch || (inferredType === '半成品质检' ? qualityTask?.sourceWipBatchCode || source : source),
    sampleQty: historical?.products?.[0]?.sampleQty || qualityTask?.sampleQty || '',
  });
}

function applyPatrolContextSource(draft: QualityDocumentDraft, sourceCode: string) {
  const source = sourceCode.trim();
  draft.sourceDoc = source;
  if (!source) return;

  const historical = qualityPatrolRows.find(
    (row) => row.code === source || row.sourceDoc === source || row.workOrder === source || row.executionCard === source || row.reportBatch === source,
  );
  const production = productionQualityRows.find(
    (row) => row.code === source || row.sourceDoc === source || row.workOrder === source || row.executionCard === source || row.reportBatch === source,
  );
  const qualityTask = production2QualityTasks.find((task) => task.code === source || task.sourceCard === source || task.workOrderCode === source);
  const card = production2ExecutionCards.find(
    (item) => item.code === source || item.code === qualityTask?.sourceCard || item.code === production?.executionCard || item.code === historical?.executionCard,
  );
  const workOrder = production2WorkOrders.find(
    (item) => item.code === source || item.code === qualityTask?.workOrderCode || item.code === card?.workOrderCode || item.code === production?.workOrder || item.code === historical?.workOrder,
  );
  const plannedLine = card ? workOrder?.linePlans.find((line) => line.line === card.line) : workOrder?.linePlans[0];
  const sourceRecord = historical || production;

  draft.party = sourceRecord?.party || qualityTask?.line || card?.line || plannedLine?.line || draft.party;
  draft.productionLine = sourceRecord?.productionLine || qualityTask?.line || card?.line || plannedLine?.line || draft.productionLine || draft.party;
  draft.workOrder = sourceRecord?.workOrder || qualityTask?.workOrderCode || workOrder?.code || draft.workOrder;
  draft.executionCard = sourceRecord?.executionCard || qualityTask?.sourceCard || card?.code || draft.executionCard;
  draft.reportBatch = sourceRecord?.reportBatch || card?.code || qualityTask?.sourceCard || draft.reportBatch;
  draft.shiftCode = sourceRecord?.shiftCode || draft.shiftCode;
  draft.shiftName = sourceRecord?.shiftName || card?.shift || draft.shiftName;
  draft.leader = sourceRecord?.leader || card?.leader || plannedLine?.leader || draft.leader;
  draft.operator = sourceRecord?.operator || card?.operator || draft.operator;
  draft.contact = sourceRecord?.contact || draft.operator || draft.leader || draft.contact;
  draft.warehouse = sourceRecord?.warehouse || draft.productionLine || draft.warehouse;
  draft.processStep = draft.processStep || draft.sourceType;
  draft.responsibilityProcess = sourceRecord?.responsibilityProcess || draft.responsibilityProcess || draft.sourceType;

  const firstLine = draft.products[0] ?? createQualityLine('patrol', patrolStandard());
  firstLine.batch = firstLine.batch || draft.reportBatch || source;
  if (!firstLine.name) firstLine.name = sourceRecord?.products?.[0]?.name || draft.party || draft.sourceType;
  draft.products[0] = firstLine;
}

function handleQualitySourceDocChange() {
  const draft = documentDraft.value;
  if (!draft) return;
  if (currentKind.value === 'production') {
    applyProductionQualitySource(draft, draft.sourceDoc);
  } else if (currentKind.value === 'patrol') {
    applyPatrolContextSource(draft, draft.sourceDoc);
  } else if (currentKind.value === 'defects') {
    applyDefectSource(draft, draft.sourceDoc);
  }
  markDraftInteraction();
}

function handleQualityWorkOrderChange() {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'production') return;
  if (draft.workOrder) applyProductionQualitySource(draft, draft.workOrder);
  markDraftInteraction();
}

function handleQualityExecutionCardChange() {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'production') return;
  if (draft.executionCard) {
    applyProductionQualitySource(draft, draft.executionCard);
  }
  markDraftInteraction();
}

function handleQualityReportBatchChange() {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'production') return;
  const line = draft.products[0];
  if (line && draft.reportBatch) line.batch = draft.reportBatch;
  markDraftInteraction();
}

type IncomingReceiptProduct = IncomingQualityReceipt['products'][number] & {
  id?: string;
  lineId?: string;
  receiptLineId?: string;
};

function incomingReceiptDecisionLines(receipt: IncomingQualityReceipt) {
  const quantityLines = incomingQualityQuantityLines(receipt.qualityQuantities);
  const decisionLines = incomingQualityQuantityLines(receipt.qualityDecision);
  if (!quantityLines.length) return decisionLines;
  return quantityLines.map((line, index) => ({
    ...decisionLines[index],
    ...line,
    disposition: line.disposition || decisionLines[index]?.disposition || '',
  }));
}

function incomingLineMatches(
  decisionLine: IncomingQualityDecisionLine,
  source: Pick<QualityDocumentLine, 'receiptLineId' | 'materialCode' | 'name' | 'batch'>,
) {
  const decisionId = decisionLine.receiptLineId || decisionLine.lineId;
  if (decisionId && source.receiptLineId) return decisionId === source.receiptLineId;
  if (decisionLine.materialCode && source.materialCode) return decisionLine.materialCode === source.materialCode;
  if (decisionLine.batch && source.batch) return decisionLine.batch === source.batch;
  return Boolean(decisionLine.name && source.name && decisionLine.name === source.name);
}

function incomingResultFromDecision(line: IncomingQualityDecisionLine) {
  if (line.result) return line.result;
  const accepted = qualityQuantityAmount(String(line.acceptedQty)) ?? 0;
  const concession = qualityQuantityAmount(String(line.concessionQty)) ?? 0;
  const rejected = qualityQuantityAmount(String(line.rejectedQty)) ?? 0;
  const pending = qualityQuantityAmount(String(line.pendingQty)) ?? 0;
  if (pending > 0) return accepted + concession + rejected > 0 ? '部分合格' : '待复判';
  if (rejected > 0 && accepted + concession > 0) return '部分合格';
  if (rejected > 0) return '不合格';
  if (concession > 0) return '让步接收';
  return '合格';
}

function restoreIncomingLineOutcome(line: QualityDocumentLine, decisionLine: IncomingQualityDecisionLine) {
  const formatDecisionQuantity = (value: number | string | undefined) => (
    value === undefined ? undefined : formatQualityQuantity(qualityQuantityAmount(String(value)) ?? 0, line.qty)
  );
  const receivedQty = formatDecisionQuantity(decisionLine.receivedQty);
  if (receivedQty) line.qty = receivedQty;
  line.receiptLineId = decisionLine.receiptLineId || decisionLine.lineId || line.receiptLineId;
  line.materialCode = decisionLine.materialCode || line.materialCode;
  line.qualifiedQty = formatDecisionQuantity(decisionLine.acceptedQty) ?? line.qualifiedQty;
  line.concessionQty = formatDecisionQuantity(decisionLine.concessionQty) ?? line.concessionQty;
  line.rejectedQty = formatDecisionQuantity(decisionLine.rejectedQty) ?? line.rejectedQty;
  line.pendingQty = formatDecisionQuantity(decisionLine.pendingQty) ?? line.pendingQty;
  line.lineDisposition = normalizeIncomingDisposition(decisionLine.disposition || line.lineDisposition);
  line.sampleQty = decisionLine.sampleQty || line.sampleQty;
  line.failedQty = decisionLine.sampleIssueQty || line.failedQty;
  if (decisionLine.inspectionItems?.length) {
    line.inspectionItems = decisionLine.inspectionItems.map((item) => ({ ...item }));
  }
  line.result = incomingResultFromDecision(decisionLine);
  return line;
}

function receiptProductToQualityLine(
  product: PurchaseReceipt['products'][number],
  decisionLine?: IncomingQualityDecisionLine,
  index = 0,
): QualityDocumentLine {
  const receiptProduct = product as IncomingReceiptProduct;
  const line = normalizeIncomingLineOutcome({
    receiptLineId: receiptProduct.receiptLineId || receiptProduct.lineId || receiptProduct.id || `L${index + 1}`,
    materialCode: product.materialCode,
    name: product.name,
    qty: product.qty,
    batch: product.batch || '',
    sampleQty: '',
    failedQty: '0',
    result: '待检验',
    inspectionItems: [],
  });
  return decisionLine ? restoreIncomingLineOutcome(line, decisionLine) : line;
}

function restoreIncomingOutcomeFromDecision(
  draft: QualityDocumentDraft,
  decision: IncomingQualityDecision | undefined | null,
  decisionLines = incomingQualityQuantityLines(decision),
) {
  draft.products.forEach((line, index) => {
    const decisionLine = decisionLines.find((item) => incomingLineMatches(item, line)) ?? decisionLines[index];
    if (decisionLine) restoreIncomingLineOutcome(line, decisionLine);
  });
  if (decision?.standardVersionId) draft.standardVersionId = decision.standardVersionId;
  if (decision?.version !== undefined) draft.version = decision.version;
  if (decision?.status || decision?.result) draft.status = decision.status || decision.result || draft.status;
  if (decision?.disposition) draft.disposition = decision.disposition;
  if (decision?.conclusion) draft.conclusion = decision.conclusion;
}

function restoreIncomingOutcomeFromReceipt(draft: QualityDocumentDraft, receipt: IncomingQualityReceipt) {
  receipt.products.forEach((product, index) => {
    const receiptProduct = product as IncomingReceiptProduct;
    const matchedLine = draft.products.find((item) => (
      (product.materialCode && item.materialCode === product.materialCode)
      || (product.batch && item.batch === product.batch)
      || (product.name && item.name === product.name)
    ));
    const line = matchedLine ?? (draft.products.length === receipt.products.length ? draft.products[index] : undefined);
    if (!line) return;
    line.receiptLineId = receiptProduct.receiptLineId || receiptProduct.lineId || receiptProduct.id || `L${index + 1}`;
    line.materialCode = product.materialCode || line.materialCode;
    line.qty = product.qty || line.qty;
    line.batch = product.batch || line.batch;
  });
  restoreIncomingOutcomeFromDecision(draft, receipt.qualityDecision, incomingReceiptDecisionLines(receipt));
}

function applyIncomingReceipt(draft: QualityDocumentDraft, receipt: IncomingQualityReceipt, fallbackName = '') {
  const decisionLines = incomingReceiptDecisionLines(receipt);
  const decisionStandardCode = receipt.qualityDecision?.standardVersionId;
  const incomingStandard = availableQualityStandards.value.find((row) => row.code === decisionStandardCode)
    ?? availableQualityStandards.value.find((row) => row.inspectionType === '来料质检' && row.status === '启用')
    ?? availableQualityStandards.value.find((row) => row.inspectionType === '来料质检');
  const persistedQualityCode = receipt.qualityTaskCode
    || receipt.qualityDecision?.qualityCode
    || receipt.qualityDecision?.recordCode
    || receipt.qualityDecision?.code
    || (receipt.code.startsWith('WR-') ? receipt.code.replace(/^WR-/, 'IQC-') : `IQC-${receipt.code}`);
  if (draft.code === '系统自动生成' && persistedQualityCode) draft.code = persistedQualityCode;
  draft.sourceDoc = receipt.code;
  draft.sourceType = '采购收货';
  draft.qualityStandardCode = incomingStandard?.code || 'QSTD-IQC-RM-V1';
  draft.qualityStandardName = incomingStandard?.name || '原料来料检验标准';
  draft.standardVersionId = receipt.qualityDecision?.standardVersionId || incomingStandard?.code || draft.standardVersionId || draft.qualityStandardCode;
  draft.qualityStandardSnapshot = receipt.qualityDecision?.qualityStandardSnapshot || (incomingStandard ? {
    code: incomingStandard.code,
    familyCode: incomingStandard.familyCode,
    version: incomingStandard.version,
    name: incomingStandard.name,
    inspectionType: incomingStandard.inspectionType,
    sampleRule: incomingStandard.sampleRule,
    acceptance: incomingStandard.acceptance,
    checkpointRules: qualityStandardCheckpointRules(incomingStandard).map((item) => ({ ...item })),
  } : undefined);
  draft.version = receipt.qualityDecision?.version ?? draft.version ?? 0;
  draft.party = receipt.supplier || fallbackName;
  draft.contact = [receipt.contact, receipt.contactPhone].filter(Boolean).join(' · ');
  const qualityProducts = receipt.products?.filter((product) => product.qcRequired) ?? [];
  const inspectionProducts = qualityProducts.length ? qualityProducts : receipt.products;
  draft.products = inspectionProducts?.length
    ? inspectionProducts.map((product, index) => {
        const source = receiptProductToQualityLine(product, undefined, index);
        const decisionLine = decisionLines.find((item) => incomingLineMatches(item, source)) ?? decisionLines[index];
        source.inspectionItems = incomingStandard ? inspectionItemsFromStandard(incomingStandard) : source.inspectionItems;
        return decisionLine ? restoreIncomingLineOutcome(source, decisionLine) : source;
      })
    : [createQualityLine('incoming')];
  draft.warehouse = receipt.warehouse || '采购暂存区';
  draft.disposition = receipt.qualityDecision?.disposition || '待检验';
  draft.conclusion = '';
  draft.note = receipt.note || '';
  restoreIncomingOutcomeFromReceipt(draft, receipt);
}

function handleIncomingQualitySourceSelect(option: ReferenceOption) {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'incoming') return;
  if (!option.code && !option.name) {
    draft.sourceDoc = '';
    draft.party = '';
    draft.contact = '';
    draft.products = [createQualityLine('incoming')];
    draft.warehouse = '采购暂存区';
    markDraftInteraction();
    return;
  }
  const receipt = option.raw as IncomingQualityReceipt;
  applyIncomingReceipt(draft, { ...receipt, code: receipt.code || option.code }, option.name);
  markDraftInteraction();
}

function applyDefectSource(draft: QualityDocumentDraft, sourceCode: string) {
  const source = sourceCode.trim();
  if (!source) {
    draft.sourceDoc = '';
    return;
  }
  const incoming = incomingQualityRows.find((row) => row.code === source || row.sourceDoc === source);
  const production = productionQualityRows.find((row) => row.code === source || row.sourceDoc === source || row.executionCard === source || row.reportBatch === source);
  const patrol = qualityPatrolRows.find((row) => row.code === source || row.sourceDoc === source || row.executionCard === source || row.reportBatch === source);
  const productionTask = production2QualityTasks.find((row) => row.code === source || row.sourceCard === source);
  const sourceRecord = incoming || production || patrol;
  const suggestedDisposition = incoming ? '供应商确认' : production || productionTask ? '返工' : patrol ? '现场整改' : '待制定';
  const automaticDispositions = new Set(['待制定', '供应商确认', '返工']);

  draft.sourceDoc = source;
  if (incoming) draft.sourceType = '来料质检';
  else if (production || productionTask) draft.sourceType = '生产质检';
  else if (patrol) draft.sourceType = '质量巡检';

  draft.party = sourceRecord?.party || productionTask?.line || draft.party;
  draft.contact = sourceRecord?.contact || draft.contact;
  draft.products = sourceRecord?.products?.length
    ? sourceRecord.products.map((line) => ({ ...line }))
    : productionTask
      ? [
          {
            name: productionTask.productName,
            qty: productionTask.sampleQty,
            batch: productionTask.sourceCard,
            sampleQty: productionTask.sampleQty,
            failedQty: '',
            result: productionTask.result || '待判定',
            inspectionItems: [],
          },
        ]
      : draft.products;
  draft.warehouse = sourceRecord?.warehouse || (incoming ? '采购暂存区' : production || productionTask ? '待处理区' : draft.warehouse);
  draft.productionLine = sourceRecord?.productionLine || productionTask?.line || draft.productionLine;
  draft.workOrder = sourceRecord?.workOrder || productionTask?.workOrderCode || draft.workOrder;
  draft.executionCard = sourceRecord?.executionCard || productionTask?.sourceCard || draft.executionCard;
  draft.reportBatch = sourceRecord?.reportBatch || productionTask?.sourceCard || draft.reportBatch;
  draft.shiftCode = sourceRecord?.shiftCode || draft.shiftCode;
  draft.shiftName = sourceRecord?.shiftName || draft.shiftName;
  draft.leader = sourceRecord?.leader || draft.leader;
  draft.operator = sourceRecord?.operator || draft.operator;
  draft.processStep = sourceRecord?.processStep || productionTask?.kind || draft.processStep;
  draft.responsibilityProcess = sourceRecord?.responsibilityProcess || productionTask?.node || draft.responsibilityProcess;
  draft.disposition = !draft.disposition || automaticDispositions.has(draft.disposition) ? suggestedDisposition : draft.disposition;
  draft.conclusion = sourceRecord?.conclusion || draft.conclusion;
  draft.note = sourceRecord?.note || draft.note;
}

function handleQualityLineMaterialSelect(line: QualityDocumentLine, option: ReferenceOption) {
  if (!option.code && !option.name) {
    line.name = '';
    markDraftInteraction();
    return;
  }
  const raw = option.raw as { name?: string; code?: string; uom?: string; unit?: string; baseUnit?: string };
  line.name = raw.name || option.name || raw.code || option.code;
  line.materialCode = raw.code || option.code || line.materialCode;
  line.unit = raw.uom || raw.unit || raw.baseUnit || line.unit;
  markDraftInteraction();
}

type QualityEmployeeField = 'inspector' | 'leader' | 'operator';

function handleQualityEmployeeSelect(field: QualityEmployeeField, option: ReferenceOption) {
  const draft = documentDraft.value;
  if (!draft) return;
  if (!option.code && !option.name) {
    draft[field] = '';
    return;
  }
  const raw = option.raw as { name?: string; code?: string };
  draft[field] = raw.name || option.name || raw.code || option.code;
}

function handleQualityWarehouseSelect(option: ReferenceOption) {
  const draft = documentDraft.value;
  if (!draft) return;
  if (!option.code && !option.name) {
    draft.warehouse = '';
    return;
  }
  const raw = option.raw as { name?: string; code?: string };
  draft.warehouse = raw.name || option.name || raw.code || option.code;
}

function handleQualityPartySelect(option: ReferenceOption) {
  const draft = documentDraft.value;
  if (!draft) return;
  if (!option.code && !option.name) {
    draft.party = '';
    draft.contact = '';
    return;
  }
  const raw = option.raw as { name?: string; contact?: string; phone?: string };
  draft.party = raw.name || option.name || option.code;
  if (raw.contact) draft.contact = raw.contact;
  if (raw.phone && !draft.contact.includes(raw.phone)) draft.contact = [draft.contact, raw.phone].filter(Boolean).join(' · ');
}

function qualityQuantityUnit(value: string) {
  const inferredUnit = String(value ?? '').replace(/[\d,.\s-]/g, '').trim();
  return inferredUnit && inferredUnit !== value ? inferredUnit : '件';
}

function qualityLineUnit(line: QualityDocumentLine, value = '') {
  const explicitUnit = String(line.unit || '').trim();
  if (explicitUnit) return explicitUnit;
  if (String(value || '').trim()) return qualityQuantityUnit(value);
  return '';
}

function qualityQuantityAmount(value: string | undefined) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

function formatQualityQuantity(amount: number, source: string) {
  const unit = qualityQuantityUnit(source);
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(amount)} ${unit}`;
}

function normalizeIncomingLineOutcome(line: QualityDocumentLine) {
  const total = qualityQuantityAmount(line.qty) ?? 0;
  const zero = formatQualityQuantity(0, line.qty);
  if (line.qualifiedQty === undefined) {
    line.qualifiedQty = ['合格', '免检放行'].includes(line.result) ? formatQualityQuantity(total, line.qty) : zero;
  }
  if (line.rejectedQty === undefined) {
    line.rejectedQty = line.result === '不合格' ? formatQualityQuantity(total, line.qty) : zero;
  }
  if (line.concessionQty === undefined) {
    line.concessionQty = line.result === '让步接收' ? formatQualityQuantity(total, line.qty) : zero;
  }
  if (!line.lineDisposition) {
    line.lineDisposition = ['合格', '免检放行'].includes(line.result)
      ? '放行入库'
      : line.result === '让步接收'
        ? '让步接收'
        : line.result === '不合格'
          ? '质检隔离'
          : '待判定';
  } else {
    line.lineDisposition = normalizeIncomingDisposition(line.lineDisposition);
  }
  return line;
}

function incomingLineOutcomeTotal(line: QualityDocumentLine) {
  return [line.qualifiedQty, line.rejectedQty, line.concessionQty]
    .map(qualityQuantityAmount)
    .reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
}

function incomingLineOutcomeMismatch(line: QualityDocumentLine) {
  const total = qualityQuantityAmount(line.qty);
  const allocations = [line.qualifiedQty, line.rejectedQty, line.concessionQty].map(qualityQuantityAmount);
  return total === null || allocations.some((amount) => amount === null || amount < 0)
    || incomingLineOutcomeTotal(line) - total > 0.0001;
}

function incomingLinePendingAmount(line: QualityDocumentLine) {
  const total = qualityQuantityAmount(line.qty);
  if (total === null) return null;
  return Math.max(0, total - incomingLineOutcomeTotal(line));
}

function incomingLinePendingQuantity(line: QualityDocumentLine) {
  const pending = incomingLinePendingAmount(line);
  return pending === null ? '-' : formatQualityQuantity(pending, line.qty);
}

function incomingLineOutcomeTone(line: QualityDocumentLine) {
  const pending = incomingLinePendingAmount(line);
  return incomingLineOutcomeMismatch(line) || (pending ?? 0) > 0.0001
    ? 'status-pending'
    : 'status-done';
}

function incomingLineBalanceLabel(line: QualityDocumentLine) {
  const total = qualityQuantityAmount(line.qty);
  if (total === null) return '批次数量待填写';
  const balance = total - incomingLineOutcomeTotal(line);
  if (Math.abs(balance) <= 0.0001) return '判定数量已配平';
  return balance > 0
    ? `剩余待处理 ${formatQualityQuantity(balance, line.qty)}`
    : `结论超出 ${formatQualityQuantity(Math.abs(balance), line.qty)}`;
}

function incomingDispositionOptionLabel(option: string) {
  const labels: Record<string, string> = {
    待判定: '待处置 / 待复检',
    放行入库: '合格放行（转待入库）',
    质检隔离: '不合格隔离',
    退货: '退货意向（判定后执行）',
    让步接收: '让步接收（历史只读口径）',
  };
  return labels[option] || option;
}

function normalizeIncomingDisposition(disposition: string | undefined) {
  const aliases: Record<string, string> = {
    放行: '放行入库',
    隔离: '质检隔离',
    让步入库: '让步接收',
  };
  const value = String(disposition || '').trim();
  return aliases[value] || value;
}

function incomingDispositionSummary(disposition: string | undefined, stage: string) {
  const normalized = normalizeIncomingDisposition(disposition);
  if (['待判定', '放行入库', '质检隔离', '退货', '让步接收'].includes(normalized)) {
    return incomingDispositionOptionLabel(normalized);
  }
  const stageFallbacks: Record<string, string> = {
    待判定: '待判定',
    待处置: '待确认处置',
    待复检: '独立复检',
    无需处置: '无需处置',
    已完成: '结论已执行',
  };
  return stageFallbacks[stage] || normalized || '待确认处置';
}

function incomingDocumentDispositionSummary(draft: QualityDocumentDraft, stage: string) {
  const lineDispositions = Array.from(new Set(
    draft.products
      .map((line) => normalizeIncomingDisposition(line.lineDisposition))
      .filter((value) => Boolean(value) && value !== '待判定'),
  ));
  if (lineDispositions.length) return lineDispositions.map(incomingDispositionOptionLabel).join(' / ');
  return incomingDispositionSummary(draft.disposition, stage);
}

function incomingLineDispositionIssue(line: QualityDocumentLine) {
  const accepted = qualityQuantityAmount(line.qualifiedQty) ?? 0;
  const concession = qualityQuantityAmount(line.concessionQty) ?? 0;
  const rejected = qualityQuantityAmount(line.rejectedQty) ?? 0;
  const disposition = line.lineDisposition || '待判定';
  if (rejected > 0.0001 && !['质检隔离', '退货'].includes(disposition)) {
    return '存在不合格数量时，请明确选择“不合格隔离”或“退货意向”。';
  }
  if (concession > 0.0001 && !isHistoricalIncomingConcession(line)) {
    return '新判定不能直接填写让步数量；请先判定为不合格并隔离，再执行带审批人的让步处置。';
  }
  if (rejected <= 0.0001 && concession > 0.0001 && disposition !== '让步接收') {
    return '历史让步数量必须保留原“让步接收”口径，不可改写为新判定。';
  }
  if (rejected <= 0.0001 && concession <= 0.0001 && accepted > 0.0001 && disposition !== '放行入库') {
    return '只有合格数量时，请选择“合格放行”。';
  }
  return '';
}

function incomingDispositionFieldClass(line: QualityDocumentLine) {
  return {
    'has-line-field-error': qualityValidationAttempted.value && Boolean(incomingLineDispositionIssue(line)),
  };
}

function incomingDispositionLineKey(line: QualityDocumentLine) {
  return line.receiptLineId || line.materialCode || `${line.name}:${line.batch}`;
}

function incomingDispositionFactsForLine(line: QualityDocumentLine) {
  const lineKey = incomingDispositionLineKey(line);
  return incomingDispositionFacts.value.filter((fact) => fact.receiptLineId === lineKey);
}

function incomingFactValue(fact: object, ...keys: string[]) {
  const values = fact as unknown as Record<string, unknown>;
  return keys.map((key) => values[key]).find((value) => value !== undefined && value !== null);
}

function incomingFactText(fact: object, ...keys: string[]) {
  return String(incomingFactValue(fact, ...keys) ?? '').trim();
}

function incomingFactNumber(fact: object, ...keys: string[]) {
  const value = Number(incomingFactValue(fact, ...keys) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function incomingReinspectionCode(task: IncomingQualityReinspection) {
  return incomingFactText(task, 'code', 'taskCode', 'id');
}

function incomingReinspectionStatus(task: IncomingQualityReinspection) {
  return incomingFactText(task, 'status') || '待复检';
}

function incomingReinspectionRevision(task: IncomingQualityReinspection) {
  return incomingFactNumber(task, 'taskRevision', 'revision', 'version');
}

function incomingReinspectionQuantity(task: IncomingQualityReinspection) {
  return incomingFactNumber(task, 'quantity', 'qty');
}

function incomingReinspectionUnit(task: IncomingQualityReinspection, line?: QualityDocumentLine) {
  return incomingFactText(task, 'unit') || qualityQuantityUnit(line?.qty || '');
}

function incomingReinspectionInspectionItems(task: IncomingQualityReinspection) {
  return (Array.isArray(task.inspectionItems) ? task.inspectionItems : []).map((item) => ({
    name: String(item.name || ''),
    standard: String(item.standard || ''),
    originalActual: String(item.originalActual || ''),
    originalResult: String(item.originalResult || ''),
    originalNote: String(item.originalNote || ''),
    actual: String(item.actual || ''),
    result: String(item.result || '待检验'),
    note: String(item.note || ''),
  }));
}

function reinspectionOriginalEvidence(item: QualityInspectionItem | ProductionReinspectionItem) {
  const result = String(item.originalResult || '').trim();
  const evidence = [
    result && result !== '待检验' ? result : '',
    String(item.originalActual || '').trim(),
    String(item.originalNote || '').trim(),
  ].filter(Boolean);
  return evidence.join(' · ') || '历史未留逐项记录，按冻结标准复检';
}

function productionReinspectionInspectionItems(task: ProductionReinspectionTask) {
  return (Array.isArray(task.inspectionItems) ? task.inspectionItems : []).map((item) => ({
    name: String(item.name || ''),
    standard: String(item.standard || ''),
    originalActual: String(item.originalActual || ''),
    originalResult: String(item.originalResult || ''),
    originalNote: String(item.originalNote || ''),
    actual: String(item.actual || ''),
    result: item.result || '待检验',
    note: String(item.note || ''),
  }));
}

function incomingReinspectionIsComplete(task: IncomingQualityReinspection) {
  const status = incomingReinspectionStatus(task).toLowerCase();
  return ['completed', '已完成', '复检完成'].includes(status);
}

function incomingReinspectionIsCancelled(task: IncomingQualityReinspection) {
  const status = incomingReinspectionStatus(task).toLowerCase();
  return ['cancelled', 'canceled', '已取消', '已作废'].includes(status);
}

function incomingReinspectionFactsForLine(line: QualityDocumentLine) {
  const lineKey = incomingDispositionLineKey(line);
  return incomingReinspectionFacts.value.filter((task) => incomingFactText(task, 'receiptLineId') === lineKey);
}

function incomingReturnDocumentsForLine(line: QualityDocumentLine) {
  const lineKey = incomingDispositionLineKey(line);
  return incomingReturnDocumentFacts.value.filter((document) => incomingFactText(document, 'receiptLineId') === lineKey);
}

function incomingReinspectionAcceptedAmount(line: QualityDocumentLine) {
  return incomingReinspectionFactsForLine(line)
    .filter(incomingReinspectionIsComplete)
    .reduce((sum, task) => sum + incomingFactNumber(task, 'acceptedQty'), 0);
}

function incomingActiveReinspectionAmount(line: QualityDocumentLine) {
  return incomingReinspectionFactsForLine(line)
    .filter((task) => !incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task))
    .reduce((sum, task) => sum + incomingReinspectionQuantity(task), 0);
}

function incomingDispositionConsumedAmount(line: QualityDocumentLine) {
  return incomingDispositionFactsForLine(line)
    .reduce((sum, fact) => sum + Number(fact.quantity || 0), 0);
}

function incomingDispositionRemainingAmount(line: QualityDocumentLine) {
  const rejected = qualityQuantityAmount(line.rejectedQty) ?? 0;
  return Math.max(
    0,
    rejected
      - incomingDispositionConsumedAmount(line)
      - incomingReinspectionAcceptedAmount(line)
      - incomingActiveReinspectionAmount(line),
  );
}

function incomingDispositionRemainingQuantity(line: QualityDocumentLine) {
  return formatQualityQuantity(incomingDispositionRemainingAmount(line), line.qty);
}

function incomingDispositionRemainingSummary() {
  const values = new Map<string, number>();
  (documentDraft.value?.products ?? []).forEach((line) => {
    const unit = qualityQuantityUnit(line.qty);
    values.set(unit, (values.get(unit) ?? 0) + incomingDispositionRemainingAmount(line));
  });
  return formatQualityQuantityMap(values);
}

function incomingDispositionRemainingTotal() {
  return (documentDraft.value?.products ?? [])
    .reduce((sum, line) => sum + incomingDispositionRemainingAmount(line), 0);
}

function incomingDispositionDraftFor(line: QualityDocumentLine) {
  const lineKey = incomingDispositionLineKey(line);
  if (!incomingDispositionDrafts.value[lineKey]) {
    const remaining = incomingDispositionRemainingAmount(line);
    incomingDispositionDrafts.value[lineKey] = {
      action: line.lineDisposition === '退货' ? 'return_to_supplier' : '',
      quantity: remaining > 0 ? String(remaining) : '',
      reason: '',
      approvedBy: '',
    };
  }
  return incomingDispositionDrafts.value[lineKey];
}

function incomingDispositionActionLabel(action: IncomingQualityDisposition['action']) {
  return action === 'return_to_supplier' ? '转采购处理' : '让步审批放行';
}

function incomingDispositionSubmitIssue(line: QualityDocumentLine) {
  const draft = documentDraft.value;
  if (!canWriteQuality.value) return qualityReadonlyReason.value;
  if (!draft || currentKind.value !== 'incoming' || !isDetail.value || (draft.version ?? 0) <= 0) {
    return '先提交并保存数量判定，才能转采购处理或执行让步审批。';
  }
  if (!line.receiptLineId) return '当前明细缺少收货行标识，不能执行处置。';
  const input = incomingDispositionDraftFor(line);
  if (!input.action) return '请选择转采购处理或让步审批放行。';
  const quantity = qualityQuantityAmount(input.quantity);
  if (quantity === null || quantity <= 0) return '处置数量必须大于 0。';
  const remaining = incomingDispositionRemainingAmount(line);
  if (quantity > remaining + 0.0001) return `处置数量不能超过剩余 ${formatQualityQuantity(remaining, line.qty)}。`;
  if (!input.reason.trim()) return '请填写本次处置原因。';
  if (input.action === 'approve_concession' && !input.approvedBy.trim()) return '让步审批放行必须填写审批人。';
  return '';
}

function incomingDispositionFactSummary(fact: IncomingQualityDisposition) {
  const approver = fact.approvedBy ? ` · 审批人 ${fact.approvedBy}` : '';
  return `${fact.quantity} ${fact.unit} · ${fact.status} · ${fact.actor}${approver} · ${fact.executedAt}`;
}

function incomingReturnDocumentSummary(document: IncomingQualityReturnDocument) {
  const code = incomingFactText(document, 'code', 'documentCode', 'id') || '退货凭证';
  const status = incomingFactText(document, 'status') || '已生成';
  const quantity = incomingFactNumber(document, 'quantity', 'qty');
  const unit = incomingFactText(document, 'unit') || '件';
  const createdAt = incomingFactText(document, 'createdAt', 'issuedAt', 'executedAt');
  return `${code} · ${quantity} ${unit} · ${status}${createdAt ? ` · ${createdAt}` : ''}`;
}

function incomingReinspectionCreateDraftFor(line: QualityDocumentLine) {
  const lineKey = incomingDispositionLineKey(line);
  if (!incomingReinspectionCreateDrafts.value[lineKey]) {
    const available = incomingDispositionRemainingAmount(line);
    incomingReinspectionCreateDrafts.value[lineKey] = {
      quantity: available > 0 ? String(available) : '',
      reason: '',
      inspector: documentDraft.value?.inspector || '',
    };
  }
  return incomingReinspectionCreateDrafts.value[lineKey];
}

function incomingReinspectionCreateIssue(line: QualityDocumentLine) {
  const draft = documentDraft.value;
  if (!canWriteQuality.value) return qualityReadonlyReason.value;
  if (!draft || currentKind.value !== 'incoming' || !isDetail.value || (draft.version ?? 0) <= 0) {
    return '先提交不合格判定并记录隔离数量，才能创建复检任务。';
  }
  if (!line.receiptLineId) return '当前明细缺少收货行标识，不能创建复检任务。';
  const available = incomingDispositionRemainingAmount(line);
  if (available <= 0.0001) return '当前没有可发起复检的剩余隔离数量。';
  const input = incomingReinspectionCreateDraftFor(line);
  const quantity = qualityQuantityAmount(input.quantity);
  if (quantity === null || quantity <= 0) return '复检数量必须大于 0。';
  if (quantity > available + 0.0001) return `复检数量不能超过剩余隔离数量 ${formatQualityQuantity(available, line.qty)}。`;
  if (!input.reason.trim()) return '请填写发起复检原因。';
  if (!input.inspector.trim()) return '请填写复检员。';
  return '';
}

function incomingReinspectionCompleteDraftFor(task: IncomingQualityReinspection) {
  const taskCode = incomingReinspectionCode(task);
  if (!incomingReinspectionCompleteDrafts.value[taskCode]) {
    incomingReinspectionCompleteDrafts.value[taskCode] = {
      acceptedQty: '',
      rejectedQty: String(incomingReinspectionQuantity(task)),
      resultReason: '',
      inspectionItems: incomingReinspectionInspectionItems(task),
    };
  }
  return incomingReinspectionCompleteDrafts.value[taskCode];
}

function incomingReinspectionCompleteIssue(task: IncomingQualityReinspection, line: QualityDocumentLine) {
  if (!canWriteQuality.value) return qualityReadonlyReason.value;
  if (incomingReinspectionIsComplete(task)) return '该复检任务已完成。';
  if (incomingReinspectionIsCancelled(task)) return '该复检任务已取消。';
  const taskCode = incomingReinspectionCode(task);
  if (!taskCode) return '复检任务缺少任务编号，不能完成。';
  const input = incomingReinspectionCompleteDraftFor(task);
  const accepted = qualityQuantityAmount(input.acceptedQty);
  const rejected = qualityQuantityAmount(input.rejectedQty);
  if (accepted === null || rejected === null || accepted < 0 || rejected < 0) return '复检合格和不合格数量必须为非负数。';
  const taskQuantity = incomingReinspectionQuantity(task);
  if (Math.abs(accepted + rejected - taskQuantity) > 0.0001) {
    return `复检结果必须配平任务数量 ${formatQualityQuantity(taskQuantity, line.qty)}。`;
  }
  if (!input.inspectionItems.length) return '复检任务缺少检查项，请刷新后重试。';
  const incomplete = input.inspectionItems.find((item) => !['合格', '不合格'].includes(item.result));
  if (incomplete) return `请完成复检检查项“${incomplete.name}”。`;
  const missingEvidence = input.inspectionItems.find((item) => item.result === '不合格' && !item.actual.trim() && !item.note?.trim());
  if (missingEvidence) return `复检检查项“${missingEvidence.name}”仍不合格时，请填写检查记录或异常说明。`;
  const abnormalCount = input.inspectionItems.filter((item) => item.result === '不合格').length;
  if (rejected > 0.0001 && abnormalCount === 0) return '仍有复检不合格数量时，至少标记一个不合格检查项。';
  if (rejected <= 0.0001 && abnormalCount > 0) return '存在不合格检查项时，不能将复检数量全部判为合格。';
  return '';
}

async function createIncomingReinspection(line: QualityDocumentLine) {
  const draft = documentDraft.value;
  if (!draft) return;
  const issue = incomingReinspectionCreateIssue(line);
  if (issue) {
    showToast(issue, 'error');
    return;
  }
  const lineKey = incomingDispositionLineKey(line);
  const input = incomingReinspectionCreateDraftFor(line);
  const quantity = qualityQuantityAmount(input.quantity) ?? 0;
  const idempotencyKey = `${draft.code}:reinspection:create:${draft.version ?? 0}:${incomingDispositionFacts.value.length}:${incomingReinspectionFacts.value.length}:${lineKey}:${quantity}`;
  incomingReinspectionSubmittingKey.value = `create:${lineKey}`;
  try {
    const response = await createIncomingQualityReinspection(draft.code, {
      receiptLineId: line.receiptLineId || lineKey,
      quantity,
      reason: input.reason.trim(),
      inspector: input.inspector.trim(),
      actor: draft.inspector || '当前用户',
      decisionVersion: draft.version ?? 0,
      dispositionVersion: incomingDispositionFacts.value.length,
      idempotencyKey,
    });
    applyIncomingApiResponse(draft, response);
    const responseFact = incomingFactValue(response, 'task', 'reinspection') as IncomingQualityReinspection | undefined;
    if (!response.reinspections && responseFact) incomingReinspectionFacts.value = [...incomingReinspectionFacts.value, responseFact];
    const remainingDrafts = { ...incomingReinspectionCreateDrafts.value };
    delete remainingDrafts[lineKey];
    incomingReinspectionCreateDrafts.value = remainingDrafts;
    const taskCode = responseFact ? incomingReinspectionCode(responseFact) : '';
    showToast(taskCode ? `复检任务 ${taskCode} 已创建。` : '复检任务已创建。');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '创建复检任务失败，请刷新后重试。', 'error');
  } finally {
    incomingReinspectionSubmittingKey.value = '';
  }
}

async function completeIncomingReinspection(task: IncomingQualityReinspection, line: QualityDocumentLine) {
  const draft = documentDraft.value;
  if (!draft) return;
  const issue = incomingReinspectionCompleteIssue(task, line);
  if (issue) {
    showToast(issue, 'error');
    return;
  }
  const taskCode = incomingReinspectionCode(task);
  const input = incomingReinspectionCompleteDraftFor(task);
  const acceptedQty = qualityQuantityAmount(input.acceptedQty) ?? 0;
  const rejectedQty = qualityQuantityAmount(input.rejectedQty) ?? 0;
  const taskRevision = incomingReinspectionRevision(task);
  const idempotencyKey = `${draft.code}:reinspection:complete:${taskCode}:${taskRevision}:${acceptedQty}:${rejectedQty}`;
  incomingReinspectionSubmittingKey.value = `complete:${taskCode}`;
  try {
    const response = await completeIncomingQualityReinspection(draft.code, taskCode, {
      acceptedQty,
      rejectedQty,
      inspectionItems: input.inspectionItems.map((item) => ({ ...item })),
      resultReason: input.resultReason.trim() || undefined,
      actor: draft.inspector || '当前用户',
      taskRevision,
      idempotencyKey,
    });
    applyIncomingApiResponse(draft, response);
    const completedFact = incomingFactValue(response, 'task', 'reinspection') as IncomingQualityReinspection | undefined;
    if (!response.reinspections && completedFact) {
      incomingReinspectionFacts.value = incomingReinspectionFacts.value.map((fact) => (
        incomingReinspectionCode(fact) === taskCode ? completedFact : fact
      ));
    }
    const remainingDrafts = { ...incomingReinspectionCompleteDrafts.value };
    delete remainingDrafts[taskCode];
    incomingReinspectionCompleteDrafts.value = remainingDrafts;
    showToast(`复检任务 ${taskCode} 已完成；合格数量转待入库，不合格数量继续隔离。`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '完成复检任务失败，请刷新后重试。', 'error');
  } finally {
    incomingReinspectionSubmittingKey.value = '';
  }
}

function incomingReinspectionSummary(task: IncomingQualityReinspection, line: QualityDocumentLine) {
  const quantity = formatQualityQuantity(incomingReinspectionQuantity(task), line.qty);
  const accepted = incomingFactNumber(task, 'acceptedQty');
  const rejected = incomingFactNumber(task, 'rejectedQty');
  const result = incomingReinspectionIsComplete(task)
    ? `合格 ${formatQualityQuantity(accepted, line.qty)} · 不合格 ${formatQualityQuantity(rejected, line.qty)}`
    : `任务数量 ${quantity}`;
  const inspector = incomingFactText(task, 'inspector');
  const reason = incomingFactText(task, 'resultReason', 'reason');
  return `${result}${inspector ? ` · 复检员 ${inspector}` : ''}${reason ? ` · ${reason}` : ''}`;
}

async function submitIncomingDisposition(line: QualityDocumentLine) {
  const draft = documentDraft.value;
  if (!draft) return;
  const issue = incomingDispositionSubmitIssue(line);
  if (issue) {
    showToast(issue, 'error');
    return;
  }
  const lineKey = incomingDispositionLineKey(line);
  const input = incomingDispositionDraftFor(line);
  const action = input.action as IncomingQualityDisposition['action'];
  const quantity = qualityQuantityAmount(input.quantity) ?? 0;
  const dispositionVersion = incomingDispositionFacts.value.length;
  const idempotencyKey = `${draft.code}:dispose:${draft.version ?? 0}:${dispositionVersion}:${lineKey}:${action}:${quantity}`;
  incomingDispositionSubmittingLine.value = lineKey;
  try {
    const response = await submitIncomingQualityDisposition(draft.code, {
      receiptLineId: line.receiptLineId || lineKey,
      action,
      quantity,
      reason: input.reason.trim(),
      approvedBy: action === 'approve_concession' ? input.approvedBy.trim() : undefined,
      actor: draft.inspector || '当前用户',
      decisionVersion: draft.version ?? 0,
      dispositionVersion,
      idempotencyKey,
    });
    applyIncomingApiResponse(draft, response);
    incomingDispositionFacts.value = response.dispositions ?? [...incomingDispositionFacts.value, response.disposition];
    const returnDocument = incomingFactValue(response, 'returnDocument') as IncomingQualityReturnDocument | undefined;
    if (!response.returnDocuments && returnDocument) {
      incomingReturnDocumentFacts.value = [...incomingReturnDocumentFacts.value, returnDocument];
    }
    const remainingDrafts = { ...incomingDispositionDrafts.value };
    delete remainingDrafts[lineKey];
    incomingDispositionDrafts.value = remainingDrafts;
    const returnDocumentCode = returnDocument
      ? incomingFactText(returnDocument, 'code', 'documentCode', 'id')
      : '';
    showToast(response.repeated
      ? `处置请求已执行过，已返回原结果 ${response.disposition.id}`
      : returnDocumentCode
        ? `退货已执行，退货单 ${returnDocumentCode} 已生成。`
        : `${incomingDispositionActionLabel(response.disposition.action)}已执行，凭证 ${response.disposition.id}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '来料质检处置失败，请刷新后重试。', 'error');
  } finally {
    incomingDispositionSubmittingLine.value = '';
  }
}

function incomingLineDispositionRows(line: QualityDocumentLine) {
  const accepted = qualityQuantityAmount(line.qualifiedQty) ?? 0;
  const concession = qualityQuantityAmount(line.concessionQty) ?? 0;
  const rejected = qualityQuantityAmount(line.rejectedQty) ?? 0;
  const pending = incomingLinePendingAmount(line) ?? 0;
  const rows: Array<{ label: string; value: string }> = [];
  const persisted = (documentDraft.value?.version ?? 0) > 0;
  const decisionPrefix = persisted ? '已按现有判定转' : '判定提交成功后转';

  if (accepted > 0.0001) {
    rows.push({
      label: '合格数量',
      value: `${formatQualityQuantity(accepted, line.qty)} → ${decisionPrefix}待入库，仍需仓库确认入库`,
    });
  }
  if (concession > 0.0001) {
    rows.push({
      label: '历史让步放行',
      value: `${formatQualityQuantity(concession, line.qty)} → ${decisionPrefix}待入库；新让步不再允许从判定直接填写`,
    });
  }
  if (rejected > 0.0001) {
    const disposition = line.lineDisposition || '待判定';
    const remaining = incomingDispositionRemainingAmount(line);
    rows.push({
      label: remaining > 0.0001 && disposition === '退货' ? '待执行退货' : '不合格处理',
      value: `${formatQualityQuantity(rejected, line.qty)} → ${persisted ? '已转' : '提交成功后转'}不合格隔离；剩余 ${formatQualityQuantity(remaining, line.qty)} 可执行退货、让步审批或创建复检`,
    });
  }
  if (pending > 0.0001) {
    rows.push({
      label: line.result === '待复判' ? '待复检数量' : '剩余待处理',
      value: `${formatQualityQuantity(pending, line.qty)} → 继续质检冻结；${line.result === '待复判' ? '先提交不合格数量，再创建独立复检任务' : '补充判定后再处置'}`,
    });
  }
  return rows.length
    ? rows
    : [{ label: '下一步', value: '先完成检验判定，再登记与判定数量匹配的业务处置。' }];
}

function incomingOutcomeFieldClass(line: QualityDocumentLine, value: string | undefined) {
  return {
    'has-line-field-error': qualityValidationAttempted.value
      && (qualityValueIsMissing(value) || incomingLineOutcomeMismatch(line)),
  };
}

function qualityLineResultOptions() {
  if (currentKind.value === 'incoming') return ['待检验', '合格', '部分合格', '不合格', '待复判'];
  if (currentKind.value === 'production') {
    const task = currentProductionQualityTask.value;
    const inspectionType = task?.kind || documentDraft.value?.sourceType;
    return inspectionType && ['开机首检', '半成品质检', '入库抽检'].includes(inspectionType)
      ? ['待检验', '合格', '不合格']
      : ['待检验', '合格', '部分合格', '不合格'];
  }
  if (currentKind.value === 'patrol') return ['待检验', '合格', '预警', '不合格'];
  if (currentKind.value === 'defects') return ['待检验', '不合格'];
  return qualityResultOptions;
}

function qualityResultLabel(result: string) {
  if (currentKind.value === 'patrol' && result === '合格') return '正常';
  if (currentKind.value === 'incoming' && result === '让步接收') return '让步接收（历史混合口径）';
  if (currentKind.value === 'incoming' && result === '免检放行') return '免检放行（历史混合口径）';
  return result;
}

function isLegacyIncomingQualityResult(result: string) {
  return currentKind.value === 'incoming' && ['让步接收', '免检放行'].includes(result);
}

function isHistoricalIncomingConcession(line: QualityDocumentLine) {
  return (qualityQuantityAmount(line.concessionQty) ?? 0) > 0.0001
    && ((documentDraft.value?.version ?? 0) > 0 || isLegacyIncomingQualityResult(line.result));
}

function handleQualityLineResultChange(line: QualityDocumentLine) {
  const total = qualityQuantityAmount(line.qty) ?? 0;
  const zero = formatQualityQuantity(0, line.qty);
  if (currentKind.value === 'incoming') {
    if (!isHistoricalIncomingConcession(line)) line.concessionQty = zero;
    if (['合格', '免检放行'].includes(line.result)) {
      line.qualifiedQty = formatQualityQuantity(total, line.qty);
      line.rejectedQty = zero;
      line.concessionQty = zero;
      line.lineDisposition = '放行入库';
    } else if (line.result === '不合格') {
      line.qualifiedQty = zero;
      line.rejectedQty = formatQualityQuantity(total, line.qty);
      line.concessionQty = zero;
      line.lineDisposition = '质检隔离';
    } else if (line.result === '部分合格') {
      line.lineDisposition = line.lineDisposition === '待判定' ? '质检隔离' : line.lineDisposition;
    }
  } else if (currentKind.value === 'production' && documentDraft.value) {
    const draft = documentDraft.value;
    const task = production2QualityTasks.find((item) => item.code === draft.code);
    if (['合格', '免检放行'].includes(line.result)) {
      draft.disposition = '放行';
      if (!draft.conclusion) {
        draft.conclusion = task?.kind === '开机首检'
          ? '本次首检合格，允许继续生产。'
          : task?.kind === '半成品质检'
            ? '大盘检验合格，放行进入复绕。'
            : task?.kind === '入库抽检'
              ? '本次入库抽检合格，放行办理完工入库。'
              : '本次报工检验合格，放行进入包装。';
      }
    } else if (['部分合格', '不合格'].includes(line.result)) {
      draft.disposition = '生成生产异常';
      if (!draft.conclusion) draft.conclusion = '本次检验存在不合格数量，转生产异常处理。';
    } else if (qualityValueIsMissing(line.result)) {
      draft.disposition = '待检验';
    }
  }
  markDraftInteraction();
}

function qualityValueIsMissing(value: string | undefined) {
  const text = String(value ?? '').trim();
  return (
    !text ||
    ['-'].includes(text) ||
    text.startsWith('待选择') ||
    text.startsWith('待制定') ||
    text.startsWith('待检验')
  );
}

function qualityMissingSubmitFields(draft: QualityDocumentDraft) {
  const missing: string[] = [];
  const hasLineName = draft.products.some((line) => !qualityValueIsMissing(line.name));
  const hasLineQty = draft.products.some((line) => !qualityValueIsMissing(line.name) && !qualityValueIsMissing(line.qty));
  const hasLineSampleQty = draft.products.some((line) => !qualityValueIsMissing(line.name) && !qualityValueIsMissing(line.sampleQty));
  const hasLineResult = draft.products.some((line) => !qualityValueIsMissing(line.name) && !qualityValueIsMissing(line.result));

  if (qualityValueIsMissing(draft.sourceType)) missing.push(sourceTypeFieldLabel.value);
  if (['production', 'patrol'].includes(currentKind.value) && qualityValueIsMissing(draft.qualityStandardCode)) missing.push('质检标准');
  if (currentKind.value !== 'patrol' && qualityValueIsMissing(draft.sourceDoc)) missing.push('来源单据');
  if (qualityValueIsMissing(draft.party)) missing.push(currentConfig.value.partyLabel);
  if (qualityValueIsMissing(draft.inspector)) missing.push(currentConfig.value.ownerLabel);
  if (qualityValueIsMissing(draft.date)) missing.push(currentConfig.value.dateLabel);
  if (qualityValueIsMissing(draft.dueDate)) missing.push('要求完成');
  if (qualityValueIsMissing(draft.warehouse)) missing.push(warehouseFieldLabel(currentKind.value));

  if (currentKind.value === 'production') {
    if (qualityValueIsMissing(draft.workOrder)) missing.push('生产工单');
    if (qualityValueIsMissing(draft.executionCard)) missing.push('生产批次');
    if (qualityValueIsMissing(draft.reportBatch)) missing.push(batchFieldLabel(draft.sourceType));
    if (qualityValueIsMissing(draft.shiftName)) missing.push('责任班次');
    if (qualityValueIsMissing(draft.processStep)) missing.push('工序');
    missing.push(...productionCheckpointValidationIssues(draft));
  }

  if (currentKind.value === 'patrol' && currentStatus.value === '待巡检') {
    const patrolItems = draft.products.flatMap((line) => line.inspectionItems || []);
    const allowedResults = ['合格', '预警', '待整改', '不合格'];
    if (!patrolItems.length || patrolItems.some((item) => !allowedResults.includes(item.result))) missing.push('检查项判定');
    if (patrolItems.some((item) => ['预警', '待整改', '不合格'].includes(item.result) && !item.actual.trim() && !String(item.note || '').trim())) {
      missing.push('异常检查记录');
    }
    if (patrolItems.some((item) => ['预警', '待整改', '不合格'].includes(item.result)) && qualityValueIsMissing(draft.defectLevel)) {
      missing.push('缺陷等级');
    }
  }

  if (!hasLineName) missing.push(lineItemNameLabel.value);
  if (!hasLineQty) missing.push(currentKind.value === 'patrol' ? '巡检次数' : '批次数量');
  if (!hasLineSampleQty) missing.push(currentKind.value === 'patrol' ? '点位数' : '抽检数量');
  if (!hasLineResult) missing.push('判定');

  if (currentKind.value === 'incoming') {
    const incomingLines = draft.products.filter((line) => !qualityValueIsMissing(line.name));
    missing.push(...incomingCheckpointValidationIssues(draft));
    if (incomingLines.some((line) => qualityValueIsMissing(line.qualifiedQty))) missing.push('合格数量');
    if (incomingLines.some((line) => qualityValueIsMissing(line.rejectedQty))) missing.push('不合格数量');
    if (incomingLines.some((line) => qualityValueIsMissing(line.lineDisposition))) missing.push('物料处置');
    if (incomingLines.some(incomingLineOutcomeMismatch)) missing.push('数量结论存在负数或超过到货数量');
    if (incomingLines.some((line) => Boolean(incomingLineDispositionIssue(line)))) missing.push('业务处置与判定数量不一致');
  }

  if (currentKind.value === 'defects' && qualityValueIsMissing(draft.defectLevel)) missing.push('缺陷等级');
  if (!['incoming', 'patrol'].includes(currentKind.value) && (qualityValueIsMissing(draft.disposition) || draft.disposition === '待检验')) missing.push('处置方式');
  if (qualityValueIsMissing(draft.conclusion)) missing.push(conclusionFieldLabel.value);
  if (currentKind.value === 'patrol' && currentStatus.value === '待整改' && qualityValueIsMissing(draft.rectificationAction)) missing.push('整改说明');
  if (currentKind.value === 'patrol' && currentStatus.value === '待复查' && qualityValueIsMissing(draft.verificationConclusion)) missing.push('复查结论');
  if (currentKind.value === 'defects' && currentStatus.value === '处置中' && qualityValueIsMissing(draft.rectificationAction)) missing.push('处置结果');
  if (currentKind.value === 'defects' && currentStatus.value === '待验证' && qualityValueIsMissing(draft.verificationConclusion)) missing.push('验证结论');

  return Array.from(new Set(missing));
}

function missingSubmitSummary(labels: string[]) {
  return `请先补齐：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '等' : ''}`;
}

function scrollToFirstValidationError() {
  void nextTick(() => {
    const marker = document.querySelector(
      '.quality-check-editor-card.has-field-error, .form-field .has-field-error, .form-field.has-field-error, .quote-line-table.has-field-error, .quote-line-row .has-line-field-error',
    ) as HTMLElement | null;
    const target = (marker?.closest('.form-field, .quote-line-table, .quote-line-row') as HTMLElement | null) ?? marker;
    const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(target);
    focusTarget?.focus();
  });
}

const qualityStandardDependencyMessage = computed(() => {
  const draft = documentDraft.value;
  if (!draft || !isNew.value || !['production', 'patrol'].includes(currentKind.value)) return '';
  if (runtimeQualityStandardsLoading.value && !runtimeQualityStandardsLoaded.value) return '正在读取服务端质检标准，请稍候。';
  if (runtimeQualityStandardsError.value) return runtimeQualityStandardsError.value;
  if (!runtimeQualityStandardsLoaded.value) return '质检标准尚未完成可信加载，当前不能保存或提交。';
  const inspectionType = currentKind.value === 'patrol' ? '质量巡检' : draft.sourceType;
  const candidates = runtimeQualityStandards.value.filter((standard) => (
    standard.inspectionType === inspectionType && standard.status === '启用'
  ));
  if (!candidates.length) return `服务端尚未配置启用的${inspectionType || '对应'}标准，不能建立质检记录。`;
  return '';
});

const qualitySubmitActionTitle = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return '当前没有可提交的质检单据。';
  if (!canWriteQuality.value) return qualityReadonlyReason.value;
  if (isQualityReadOnly.value) return `当前${currentConfig.value.title}只读，不能提交。`;
  if (qualityStandardDependencyMessage.value) return qualityStandardDependencyMessage.value;
  const missing = qualityMissingSubmitFields(draft);
  if (missing.length) return missingSubmitSummary(missing);
  const action = primaryTransition(currentStatus.value);
  return action
    ? `${action.label}，进入${action.next}并保留检查、处置和附件证据。`
    : `提交${currentConfig.value.title}，进入下一流程节点并保留检验记录。`;
});
const qualitySaveActionDisabled = computed(() => {
  const draft = documentDraft.value;
  return !draft
    || isQualityReadOnly.value
    || qualitySaving.value
    || qualitySubmitting.value
    || Boolean(qualityStandardDependencyMessage.value)
    || currentKind.value === 'production'
    || (currentKind.value === 'incoming' && (draft.version ?? 0) > 0);
});
const qualitySubmitActionDisabled = computed(() =>
  !documentDraft.value
  || isQualityReadOnly.value
  || qualitySaving.value
  || qualitySubmitting.value
  || Boolean(qualityStandardDependencyMessage.value),
);
const qualitySaveActionTitle = computed(() => {
  if (!canWriteQuality.value) return qualityReadonlyReason.value;
  if (qualityStandardDependencyMessage.value) return qualityStandardDependencyMessage.value;
  if (currentKind.value === 'incoming' && (documentDraft.value?.version ?? 0) > 0) {
    return '已形成正式数量判定，不能再覆盖草稿；请直接提交剩余数量的增量判定。';
  }
  if (currentKind.value === 'production') {
    return '生产质检由生产批次触发，填写完成后直接提交判定，不单独保存草稿。';
  }
  if (qualitySaveActionDisabled.value) return `当前${currentConfig.value.title}只读，不能保存草稿。`;
  return '保存当前内容、附件与处置说明，提交前仍可继续补充。';
});

function safeQualityReturnPath(value: unknown) {
  const path = String(value ?? '').trim();
  return path.startsWith('/') && !path.startsWith('//') ? path : '';
}

const requestedQualityReturnPath = computed(() => safeQualityReturnPath(route.query.returnTo));
const backPath = computed(() => requestedQualityReturnPath.value || `/quality/${currentSlug.value}`);
const activeBackLabel = computed(() => {
  const path = requestedQualityReturnPath.value;
  if (path.startsWith('/production/workbench')) return '返回生产工作台';
  if (path.startsWith('/quality/workbench')) return '返回质量工作台';
  if (path.startsWith('/production/execution-cards/')) return '返回生产批次';
  if (path.startsWith('/production/work-orders/')) return '返回生产工单';
  if (path.startsWith('/production/')) return '返回生产单据';
  if (path.startsWith('/warehouse/')) return '返回仓库单据';
  return currentConfig.value.backLabel;
});

function qualityRouteContextQuery(sourceDoc = '') {
  const query: Record<string, string> = {};
  if (currentKind.value === 'incoming' && sourceDoc) query.source = sourceDoc;
  if (requestedQualityReturnPath.value) query.returnTo = requestedQualityReturnPath.value;
  const focus = route.query.focus?.toString();
  if (focus && ['disposition', 'rework', 'reinspection'].includes(focus)) query.focus = focus;
  return query;
}

const editPath = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return backPath.value;
  const path = `/quality/${currentSlug.value}/${encodeURIComponent(draft.code)}/edit`;
  const query = new URLSearchParams(qualityRouteContextQuery(draft.sourceDoc));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
});

const inspectionItems = computed(() =>
  (draftInteractionRevision.value, (documentDraft.value?.products ?? []).flatMap((line, lineIndex) =>
    (line.inspectionItems ?? []).map((item, index) => ({
      key: `${line.name || 'line'}-${lineIndex}-${item.name}-${index}`,
      lineName: line.name || '-',
      line,
      record: item,
      ...item,
    })),
  )),
);

const visibleInspectionItems = computed(() => {
  if (!isQualityReadOnly.value) return inspectionItems.value;
  return inspectionItems.value.filter(({ record }) => (
    record.result !== '历史未逐项记录'
    || Boolean(String(record.actual || '').trim())
    || Boolean(String(record.note || '').trim())
  ));
});

const missingHistoricalInspectionItemCount = computed(() => (
  isQualityReadOnly.value ? Math.max(0, inspectionItems.value.length - visibleInspectionItems.value.length) : 0
));

const productionCheckpointStats = computed(() => {
  const records = inspectionItems.value.map((item) => item.record);
  const completedResults = currentKind.value === 'patrol' ? ['合格', '预警', '待整改', '不合格'] : ['合格', '不合格'];
  const abnormalResults = currentKind.value === 'patrol' ? ['预警', '待整改', '不合格'] : ['不合格'];
  return {
    total: records.length,
    completed: records.filter((item) => completedResults.includes(item.result)).length,
    abnormal: records.filter((item) => abnormalResults.includes(item.result)).length,
  };
});

const patrolHasFinding = computed(() => (
  currentKind.value === 'patrol' && productionCheckpointStats.value.abnormal > 0
));

const patrolDispositionProjection = computed(() => {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'patrol') return '';
  if (currentStatus.value !== '待巡检') return draft.disposition || (draft.qualityOutcome === '异常' ? '现场整改' : '无异常关闭');
  if (productionCheckpointStats.value.completed < productionCheckpointStats.value.total) return '待判定';
  return patrolHasFinding.value ? '现场整改' : '无异常关闭';
});

function synchronizePatrolSubmissionFacts(draft: QualityDocumentDraft) {
  if (currentKind.value !== 'patrol' || currentStatus.value !== '待巡检') return;
  const finding = draft.products
    .flatMap((line) => line.inspectionItems || [])
    .some((item) => ['预警', '待整改', '不合格'].includes(item.result));
  draft.qualityOutcome = finding ? '异常' : '正常';
  draft.disposition = finding ? '现场整改' : '无异常关闭';
}

const showInspectionItemSection = computed(() => {
  if (!inspectionItems.value.length) return false;
  if (currentKind.value !== 'incoming' || !isDetail.value) return true;
  const hasActiveReinspection = incomingReinspectionFacts.value.some(
    (task) => !incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task),
  );
  if (!hasActiveReinspection) return true;
  return inspectionItems.value.some(({ record }) => (
    !['待检验', '待检', '未开始'].includes(record.result)
    || Boolean(String(record.actual || '').trim())
    || Boolean(String(record.note || '').trim())
  ));
});

function productionCheckpointValidationIssues(draft: QualityDocumentDraft) {
  if (currentKind.value !== 'production') return [];
  const items = draft.products.flatMap((line) => line.inspectionItems || []);
  const issues: string[] = [];
  if (!items.length || items.some((item) => !['合格', '不合格'].includes(item.result))) issues.push('检查项判定');
  if (items.some((item) => item.result === '不合格' && !item.actual.trim() && !String(item.note || '').trim())) issues.push('异常检查项说明');
  const wholeResult = draft.products[0]?.result || '';
  const abnormalCount = items.filter((item) => item.result === '不合格').length;
  if (wholeResult === '合格' && abnormalCount > 0) issues.push('整单判定与检查项不一致');
  if (['不合格', '部分合格'].includes(wholeResult) && abnormalCount === 0) issues.push('整单异常缺少不合格检查项');
  return issues;
}

function incomingCheckpointValidationIssues(draft: QualityDocumentDraft) {
  if (currentKind.value !== 'incoming') return [];
  const issues: string[] = [];
  draft.products.forEach((line) => {
    const items = line.inspectionItems || [];
    if (!items.length || items.some((item) => !['合格', '不合格'].includes(item.result))) issues.push('检查项判定');
    if (items.some((item) => item.result === '不合格' && !item.actual.trim() && !String(item.note || '').trim())) {
      issues.push('异常检查项说明');
    }
    const hasAbnormal = items.some((item) => item.result === '不合格');
    const rejected = qualityQuantityAmount(line.rejectedQty) ?? 0;
    if (hasAbnormal && rejected <= 0) issues.push('异常检查项对应的不合格数量');
    if (!hasAbnormal && rejected > 0) issues.push('不合格数量对应的异常检查项');
  });
  return issues;
}

function inspectionItemFieldClass(item: QualityInspectionItem) {
  const allowed = currentKind.value === 'patrol' ? ['合格', '预警', '待整改', '不合格'] : ['合格', '不合格'];
  const abnormal = currentKind.value === 'patrol' ? ['预警', '待整改', '不合格'].includes(item.result) : item.result === '不合格';
  return {
    'has-field-error': qualityValidationAttempted.value
      && (!allowed.includes(item.result)
        || (abnormal && !item.actual.trim() && !String(item.note || '').trim())),
  };
}

function handleEditableCheckpointResult(line: QualityDocumentLine, item: QualityInspectionItem) {
  if (currentKind.value === 'patrol') {
    const items = line.inspectionItems || [];
    const abnormal = items.some((record) => ['预警', '待整改', '不合格'].includes(record.result));
    const completed = items.length > 0 && items.every((record) => ['合格', '预警', '待整改', '不合格'].includes(record.result));
    line.result = abnormal ? '预警' : completed ? '合格' : '待检验';
    if (abnormal && documentDraft.value) {
      documentDraft.value.qualityOutcome = '异常';
      documentDraft.value.defectLevel ||= '轻微';
      documentDraft.value.disposition = '现场整改';
    } else if (completed && documentDraft.value) {
      documentDraft.value.qualityOutcome = '正常';
      documentDraft.value.defectLevel = '';
      documentDraft.value.disposition = '无异常关闭';
    } else if (documentDraft.value) {
      documentDraft.value.qualityOutcome = '待判定';
      documentDraft.value.defectLevel = '';
      documentDraft.value.disposition = '';
    }
    if (item.result === '合格' && ['待检', '待检验'].includes(item.actual.trim())) item.actual = '';
    markDraftInteraction();
    return;
  }
  if (currentKind.value === 'incoming') {
    const items = line.inspectionItems || [];
    const abnormal = items.some((record) => record.result === '不合格');
    const completed = items.length > 0 && items.every((record) => ['合格', '不合格'].includes(record.result));
    line.result = abnormal ? '不合格' : completed ? '合格' : '待检验';
    if (item.result === '合格' && ['待检', '待检验'].includes(item.actual.trim())) item.actual = '';
    markDraftInteraction();
    return;
  }
  const task = currentProductionQualityTask.value;
  const items = line.inspectionItems || [];
  const abnormal = items.some((record) => record.result === '不合格');
  const completed = items.length > 0 && items.every((record) => ['合格', '不合格'].includes(record.result));
  if (abnormal) {
    line.result = task?.kind === '报工全检' ? '部分合格' : '不合格';
    if (task?.kind === '入库抽检' && (qualityQuantityAmount(line.failedQty) ?? 0) <= 0) {
      line.failedQty = formatQualityQuantity(1, line.sampleQty || line.qty);
    }
  } else if (completed) {
    line.result = '合格';
    if (task?.kind === '入库抽检') line.failedQty = formatQualityQuantity(0, line.sampleQty || line.qty);
  } else {
    line.result = '待检验';
  }
  if (item.result === '合格' && ['待检', '待检验'].includes(item.actual.trim())) item.actual = '';
  handleQualityLineResultChange(line);
}

function markAllEditableCheckpointsPassed() {
  const draft = documentDraft.value;
  if (!draft || !['incoming', 'production', 'patrol'].includes(currentKind.value) || isQualityReadOnly.value) return;
  const lines = currentKind.value === 'incoming' ? draft.products : draft.products.slice(0, 1);
  lines.forEach((line) => {
    (line.inspectionItems || []).forEach((item) => {
      item.result = '合格';
      if (['待检', '待检验'].includes(item.actual.trim())) item.actual = '';
      item.note = '';
    });
    line.result = '合格';
  });
  const line = lines[0];
  if (!line) return;
  if (currentKind.value === 'production') {
    if (currentProductionQualityTask.value?.kind === '入库抽检') line.failedQty = formatQualityQuantity(0, line.sampleQty || line.qty);
    handleQualityLineResultChange(line);
  } else if (currentKind.value === 'patrol') {
    draft.qualityOutcome = '正常';
    draft.defectLevel = '';
    draft.disposition = '无异常关闭';
    markDraftInteraction();
  } else {
    markDraftInteraction();
  }
  const count = lines.reduce((sum, item) => sum + (item.inspectionItems?.length || 0), 0);
  showToast(`已将 ${count} 个检查项标记为${currentKind.value === 'patrol' ? '正常' : '合格'}，可按实际情况修改。`);
}

const flowRecords = computed(() => {
  const draft = documentDraft.value;
  const code = draft?.code ?? '';
  const records = localFlowRecords.value[code] ?? qualityFlowRecords[code] ?? [];
  if (records.length || !draft) return records;

  return [
    {
      time: `${draft.date || '当前日期'} 09:00`,
      actor: '系统',
      action: `生成${currentConfig.value.title}`,
      remark: draft.sourceDoc
        ? `由${draft.sourceType} ${draft.sourceDoc} 生成，当前状态为${currentStatus.value}。`
        : `当前${currentConfig.value.title}已建立，状态为${currentStatus.value}。`,
    },
  ];
});

const currentProductionExecutionCard = computed(() => {
  const cardCode = documentDraft.value?.executionCard || documentDraft.value?.sourceDoc || '';
  return cardCode ? production2ExecutionCards.find((card) => card.code === cardCode) : undefined;
});

function formatProductionFactQuantity(amount: number | undefined, unit: string | undefined) {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(Number(amount || 0))} ${unit || ''}`.trim();
}

const productionQualityImpact = computed(() => {
  const draft = documentDraft.value;
  const task = currentProductionQualityTask.value;
  const card = currentProductionExecutionCard.value;
  if (currentKind.value !== 'production' || !draft || !task || !card) return undefined;

  const taskQty = formatProductionFactQuantity(task.quantity, task.unit);
  const sampleQty = task.sampleQty || taskQty;
  const pendingDecision = detailDispositionStage.value === '待判定';
  const resultPrefix = pendingDecision ? '判定合格后，' : currentStatus.value === '合格' ? '本次已放行，' : '';

  if (task.kind === '报工全检' && card.shortCloseResolution === '安排补产') {
    const supplement = card.operationJobs?.find((job) => job.code === card.shortCloseSupplementJobCode);
    if (supplement?.status === '已完成') {
      const projectedQualifiedQty = pendingDecision
        ? Number(card.qualifiedQty || 0) + Number(task.quantity || 0)
        : Number(card.qualifiedQty || 0);
      return {
        title: pendingDecision ? '补产报工质检后进入包装' : '补产数量已放行，进入包装',
        description: pendingDecision
          ? `补产作业 ${supplement.code} 已完成；本次 ${taskQty} 判定合格后，累计合格数量达到原计划，沿用当前生产批次进入包装。`
          : `补产报工已放行，当前可包装 ${formatProductionFactQuantity(Math.max(0, Number(card.qualifiedQty || 0) - Number(card.packedQty || 0)), card.unit)}；原提前结束和补产记录继续保留用于追溯。`,
        tone: pendingDecision ? 'tracking' : 'done',
        facts: [
          { label: pendingDecision ? '本次待检' : '本次判定', value: pendingDecision ? taskQty : `${task.result || currentStatus.value} · ${taskQty}` },
          { label: '累计合格', value: formatProductionFactQuantity(projectedQualifiedQty, card.unit) },
          { label: '判定后', value: pendingDecision ? '进入包装' : '确认包装' },
        ],
      };
    }
    const sourceBatch = supplement?.sourceWipBatchCode ? `，继续使用大盘 ${supplement.sourceWipBatchCode}` : '';
    const ready = supplement?.status === '可开工';
    const started = Boolean(supplement && ['执行中', '暂停', '异常'].includes(supplement.status));
    return {
      title: started ? '补产作业正在现场执行' : ready ? '补产作业已就绪' : '本次质检放行后激活补产',
      description: started
        ? `${supplement?.code || '补产作业'} 已在 ${supplement?.assignedLine || card.line} ${supplement?.status}${sourceBatch}；沿用原生产批次，完成后继续报工质检。`
        : ready
        ? `${supplement?.code || '补产作业'} 已进入 ${supplement?.assignedLine || card.line} 待开工队列${sourceBatch}；沿用原生产批次，不重复建工单、领料和首检。`
        : `${resultPrefix}${supplement?.code || '补产作业'} 自动进入 ${supplement?.assignedLine || card.line} 待开工队列${sourceBatch}；沿用原生产批次，不重复建工单、领料和首检。`,
      tone: ready || started ? 'done' : 'tracking',
      facts: [
        { label: pendingDecision ? '本次待检' : '本次判定', value: pendingDecision ? taskQty : `${task.result || currentStatus.value} · ${taskQty}` },
        { label: '剩余数量', value: formatProductionFactQuantity(card.shortCloseRemainingQty, card.unit) },
        { label: '判定后', value: started ? `补产${supplement?.status}` : ready ? '补产待开工' : '自动激活补产' },
      ],
    };
  }

  if (task.kind === '报工全检' && card.shortCloseResolution === '接受短缺') {
    const packageAvailable = Math.max(0, Number(card.qualifiedQty || 0) - Number(card.packedQty || 0));
    return {
      title: pendingDecision ? '按实际合格数量继续流转' : '短缺已确认，转入包装',
      description: pendingDecision
        ? `本次合格数量累计到生产批次后直接进入包装；不再补产，原计划数量与接受短缺 ${formatProductionFactQuantity(card.acceptedShortageQty || card.shortCloseRemainingQty, card.unit)} 继续保留用于交付差异追踪。`
        : `当前可包装 ${formatProductionFactQuantity(packageAvailable, card.unit)}；原计划数量和接受短缺记录继续保留，不用另建工单。`,
      tone: pendingDecision ? 'tracking' : 'done',
      facts: [
        { label: pendingDecision ? '本次待检' : '本次判定', value: pendingDecision ? taskQty : `${task.result || currentStatus.value} · ${taskQty}` },
        { label: '接受短缺', value: formatProductionFactQuantity(card.acceptedShortageQty || card.shortCloseRemainingQty, card.unit) },
        { label: '判定后', value: pendingDecision ? '按实际数量包装' : formatProductionFactQuantity(packageAvailable, card.unit) },
      ],
    };
  }

  if (task.kind === '报工全检' && card.shortClosedAt && Number(card.shortCloseRemainingQty || 0) > 0) {
    return {
      title: '质检后仍需处理剩余计划',
      description: `本次判定只确认已报工的 ${taskQty}；剩余 ${formatProductionFactQuantity(card.shortCloseRemainingQty, card.unit)} 不会自动包装或补产，需由生产主管选择“安排补产”或“接受短缺”。`,
      tone: 'pending',
      facts: [
        { label: '本次待检', value: taskQty },
        { label: '剩余数量', value: formatProductionFactQuantity(card.shortCloseRemainingQty, card.unit) },
        { label: '判定后', value: '等待计划处理' },
      ],
    };
  }

  if (task.kind === '半成品质检') {
    const releasedToRewind = currentStatus.value === '合格';
    return {
      title: pendingDecision ? '合格大盘自动进入复绕队列' : '大盘质检结果已同步',
      description: pendingDecision
        ? `本次按大盘净重 ${taskQty} 整批判定；合格后进入复绕机待开工队列，不重复建工单、领料或开机首检。`
        : releasedToRewind
          ? '大盘半成品质检合格，已进入复绕待开工队列；原生产任务、工单和批次追溯关系保持不变。'
          : '大盘半成品质检未放行，当前批次保持冻结并转质量异常处置。',
      tone: pendingDecision ? 'tracking' : currentStatus.value === '合格' ? 'done' : 'pending',
      facts: [
        { label: '检验口径', value: '大盘净重' },
        { label: pendingDecision ? '本次待检' : '本次判定', value: pendingDecision ? taskQty : `${task.result || currentStatus.value} · ${taskQty}` },
        { label: '合格后', value: '复绕队列' },
      ],
    };
  }

  if (task.kind === '开机首检') {
    const reportReleased = currentStatus.value === '合格';
    return {
      title: pendingDecision ? '首检结果控制报工权限' : '首检结果已同步到现场',
      description: pendingDecision
        ? '合格后开放当前设备作业报工；不合格则保持生产阻断并转异常处理，不影响已有生产批次记录。'
        : reportReleased
          ? '首检合格，已开放当前设备作业报工；后续报工、包装和入库仍由各自业务节点分别记录。'
          : '首检未放行，当前设备作业保持阻断并转异常处理。',
      tone: pendingDecision ? 'tracking' : currentStatus.value === '合格' ? 'done' : 'pending',
      facts: [
        { label: '检验类型', value: '开机首检' },
        { label: '合格后', value: '开放报工' },
        { label: '不合格', value: '阻断并转异常' },
      ],
    };
  }

  if (task.kind === '报工全检') {
    const acceptedQty = Number(task.acceptedQty || 0);
    const rejectedQty = Number(task.rejectedQty || 0);
    const remainingQty = Number(task.remainingDispositionQty ?? Math.max(0, rejectedQty - Number(task.disposedQty || 0)));
    const activeStage = detailDispositionStage.value;
    return {
      title: pendingDecision
        ? '本次报工等待检验判定'
        : rejectedQty > 0
          ? `${formatProductionFactQuantity(acceptedQty, task.unit)} 已放行，异常数量进入处理`
          : '本次报工已放行，进入包装',
      description: pendingDecision
        ? `本次受检 ${taskQty}；提交判定后，合格数量进入包装，不合格数量单独进入处置，不改写生产批次生命周期。`
        : rejectedQty > 0
          ? `原检验结论保持为${detailInspectionConclusion.value}；不合格 ${formatProductionFactQuantity(rejectedQty, task.unit)} 中仍有 ${formatProductionFactQuantity(remainingQty, task.unit)} 待处理，当前处于“${activeStage}”。`
          : `本次 ${taskQty} 已全部放行；包装、入库抽检和仓库入库继续分别记录，不并入质检单主状态。`,
      tone: pendingDecision ? 'tracking' : rejectedQty > 0 ? 'pending' : 'done',
      facts: [
        { label: '受检', value: taskQty },
        { label: '合格 / 不合格', value: pendingDecision ? '待判定' : `${formatProductionFactQuantity(acceptedQty, task.unit)} / ${formatProductionFactQuantity(rejectedQty, task.unit)}` },
        { label: '当前责任', value: pendingDecision ? '质量判定' : rejectedQty > 0 ? `${activeStage} · ${formatProductionFactQuantity(remainingQty, task.unit)}` : '生产包装' },
      ],
    };
  }

  if (task.kind === '入库抽检') {
    const sampleDefectQty = formatProductionFactQuantity(task.sampleDefectQty, task.unit);
    const batchHeld = !pendingDecision && currentStatus.value !== '合格' && Number(task.rejectedQty || 0) > 0;
    return {
      title: pendingDecision ? '本次判定决定整批放行或冻结' : batchHeld ? '抽检异常，整批保持冻结' : '入库放行结果已同步',
      description: pendingDecision
        ? `本批次 ${taskQty}，抽检 ${sampleQty}；样本合格后整批进入仓库待入库，样本异常则整批冻结，再由质量负责人安排返工、让步或报废。`
        : batchHeld
          ? `样本不良 ${sampleDefectQty}，整批 ${taskQty} 未进入仓库待入库；处置完成前库存不能转为可用。`
          : '入库抽检合格，整批已放行至仓库；后续是否完成入库由仓库单据单独记录。',
      tone: pendingDecision ? 'tracking' : currentStatus.value === '合格' ? 'done' : 'pending',
      facts: [
        { label: '批次数量', value: taskQty },
        { label: '抽检数量', value: sampleQty },
        { label: pendingDecision ? '样本不良' : '抽检结果', value: pendingDecision ? '待记录' : `${task.result || currentStatus.value} · 不良 ${sampleDefectQty}` },
        { label: '整批质检', value: pendingDecision ? '合格则放行，异常则冻结' : batchHeld ? `冻结 ${taskQty}` : `放行 ${taskQty}` },
      ],
    };
  }

  return undefined;
});

const qualityFollowupAction = computed<QualityFollowupAction | undefined>(() => {
  const draft = documentDraft.value;
  if (!isDetail.value || !draft) return undefined;

  if (currentKind.value === 'patrol' && draft.linkedDefectCode) {
    return {
      label: '查看关联不良',
      description: `${draft.code} 复查未通过，已生成不良记录 ${draft.linkedDefectCode}；后续责任、处置和验证在不良记录中完成。`,
      path: `/quality/defects/${encodeURIComponent(draft.linkedDefectCode)}`,
    };
  }

  if (currentKind.value === 'production' && ['不合格', '待处置'].includes(currentStatus.value)) {
    const exception = production2Exceptions.find((item) => item.source === draft.code);
    if (exception) {
      return {
        label: '已交接生产处置',
        description: `${draft.code} 的不合格结论已生成生产异常 ${exception.code}；生产模块负责处置，质量模块等待复检任务。`,
      };
    }
  }

  if (currentKind.value === 'incoming' && draft.sourceDoc && ['合格', '部分放行', '让步接收', '免检放行'].includes(currentStatus.value)) {
    const isPartial = currentStatus.value === '部分放行';
    const totals = incomingOutcomeTotals.value;
    const released = [
      qualityQuantityMapTotal(totals.qualified) > 0.0001 ? formatQualityQuantityMap(totals.qualified) : '',
      qualityQuantityMapTotal(totals.concession) > 0.0001 ? formatQualityQuantityMap(totals.concession) : '',
    ].filter(Boolean).join(' + ') || '-';
    const rejected = formatQualityQuantityMap(totals.rejected);
    return {
      label: '已交接仓库',
      description: isPartial
        ? `${draft.sourceDoc} 已放行 ${released}；不合格 ${rejected} 继续隔离或退货，仓库只会收到可入库数量。`
        : `${draft.sourceDoc} 已放行 ${released} 到待入库，仓库模块负责确认实际入库。`,
    };
  }

  if (!['合格', '免检放行'].includes(currentStatus.value)) return undefined;

  if (currentKind.value !== 'production' || !draft.executionCard) return undefined;
  const card = currentProductionExecutionCard.value;
  if (draft.sourceType === '入库抽检') {
    const receiptCodes = card?.productionReceiptCodes || [];
    const receiptCode = receiptCodes[receiptCodes.length - 1];
    if (receiptCode) {
      const inboundCompleted = Number(card?.inboundQty || 0) > 0 || card?.status === '已完成';
      return {
        label: inboundCompleted ? '仓库已完成入库' : '已交接仓库',
        description: inboundCompleted
          ? `${draft.executionCard} 已由 ${receiptCode} 完成入库；质检单保留当时的放行结论，库存结果以完工入库单为准。`
          : `${receiptCode} 已带入本次放行数量，仓库模块负责办理完工入库。`,
      };
    }
    return {
      label: '等待仓库任务',
      description: `${draft.executionCard} 已通过入库抽检；系统正在自动生成仓库完工入库任务，质检无需跨模块建单。`,
    };
  }

  const supplement = card?.operationJobs?.find((job) => job.code === card.shortCloseSupplementJobCode);
  if (supplement && ['可开工', '执行中', '暂停', '异常'].includes(supplement.status)) {
    const started = ['执行中', '暂停', '异常'].includes(supplement.status);
    return {
      label: started
        ? '生产补产处理中'
        : supplement.operationType === '复绕生产' ? '已交接补产复绕' : '已交接生产补产',
      description: started
        ? `${supplement.code} 正在 ${supplement.assignedLine || card?.line || '现场'} ${supplement.status}；质量模块等待生产完成后形成复检任务。`
        : `${supplement.code} 已进入 ${supplement.assignedLine || card?.line || '现场'} 待开工队列；生产模块沿用原批次继续处理。`,
    };
  }
  if (draft.sourceType === '报工全检' && card?.node === '待包装') {
    return {
      label: '已同步生产包装',
      description: `${draft.executionCard} 的报工数量已全部放行，生产模块负责登记包装批号和本次包装数量。`,
    };
  }
  if (draft.sourceType === '半成品质检' && card?.status === '待处理') {
    return {
      label: '已同步生产复绕',
      description: `${draft.executionCard} 的合格大盘已进入复绕队列，生产模块负责确认负责人并开始复绕。`,
    };
  }

  return {
    label: '已同步生产继续',
    description: `${draft.executionCard} 已通过${draft.sourceType}，生产模块会按放行结果继续报工、包装或后续质检。`,
  };
});

const summaryRows = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return [];
  const dispositionNotStarted = detailInspectionConclusion.value === '待判定'
    && detailDispositionStage.value === '待判定';
  const displayDispositionStage = qualityDispositionStageDisplay(
    detailInspectionConclusion.value,
    detailDispositionStage.value,
  );
  const dispositionSummary = currentKind.value === 'incoming'
    ? dispositionNotStarted
      ? '待检验结论'
      : incomingDocumentDispositionSummary(draft, detailDispositionStage.value)
    : draft.disposition || '待处置';
  const conclusionLabel = currentKind.value === 'patrol'
    ? '巡检结果'
    : currentKind.value === 'defects'
      ? '不良判定'
      : '检验结论';

  const rows = [
    { label: conclusionLabel, value: detailInspectionConclusion.value },
    { label: detailStageLabel.value, value: displayDispositionStage },
    {
      label: currentKind.value === 'incoming'
        ? '业务处置'
        : currentKind.value === 'production' && detailDispositionStage.value === '待判定'
          ? '预设流转'
          : '处置方式',
      value: dispositionSummary,
    },
  ];
  if (draft.verificationResult) rows.push({ label: currentKind.value === 'patrol' ? '复查结果' : '验证结果', value: draft.verificationResult });
  if (draft.linkedDefectCode) rows.push({ label: '关联不良', value: draft.linkedDefectCode });
  return rows;
});

const qualityLifecycleStatus = computed(() => {
  return projectQualityLifecycleStatus(
    { page: currentKind.value, status: currentStatus.value },
    detailDispositionStage.value,
  );
});

function qualityDetailStageMirrorsLifecycle(stage: string, lifecycle: string) {
  if (stage === lifecycle) return true;
  return isQualityDispositionClosed(stage) && ['已完成', '已关闭', '已作废'].includes(lifecycle);
}

function qualityDetailStageIsRelevant(stage: string) {
  return !(
    detailInspectionConclusion.value === '待判定'
    && ['待判定', '未开始', '未进入处置'].includes(stage)
  );
}

const qualityStatusPanelItems = computed<DocumentStatusItem[]>(() =>
  summaryRows.value
    .filter((row) => (
      row.label !== detailStageLabel.value
      || (
        qualityDetailStageIsRelevant(row.value)
        && !qualityDetailStageMirrorsLifecycle(row.value, qualityLifecycleStatus.value)
      )
    ))
    .map((row, index) => ({
      key: `quality-${index}`,
      label: row.label,
      value: row.value,
      kind: row.label.includes('结论') || row.label.includes('结果') || row.label.includes('阶段')
        ? 'status' as const
        : 'text' as const,
    })),
);

function createQuantityMap() {
  return new Map<string, number>();
}

function addQualityQuantity(target: Map<string, number>, value: string | undefined, fallbackSource = '') {
  const amount = qualityQuantityAmount(value);
  if (amount === null) return;
  const unit = qualityQuantityUnit(value || fallbackSource);
  target.set(unit, (target.get(unit) ?? 0) + amount);
}

function formatQualityQuantityMap(values: Map<string, number>) {
  return values.size
    ? Array.from(values, ([unit, amount]) => `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(amount)} ${unit}`).join(' · ')
    : '-';
}

const incomingOutcomeTotals = computed<IncomingOutcomeTotals>(() => {
  const totals: IncomingOutcomeTotals = {
    received: createQuantityMap(),
    sampled: createQuantityMap(),
    qualified: createQuantityMap(),
    rejected: createQuantityMap(),
    concession: createQuantityMap(),
    pending: createQuantityMap(),
  };
  if (currentKind.value !== 'incoming') return totals;

  (documentDraft.value?.products ?? []).forEach((line) => {
    const total = qualityQuantityAmount(line.qty);
    const unit = qualityQuantityUnit(line.qty);
    addQualityQuantity(totals.received, line.qty);
    addQualityQuantity(totals.sampled, line.sampleQty);
    addQualityQuantity(totals.qualified, line.qualifiedQty, line.qty);
    addQualityQuantity(totals.rejected, line.rejectedQty, line.qty);
    addQualityQuantity(totals.concession, line.concessionQty, line.qty);
    if (total !== null) {
      const pending = Math.max(0, total - incomingLineOutcomeTotal(line));
      totals.pending.set(unit, (totals.pending.get(unit) ?? 0) + pending);
    }
  });
  return totals;
});

const incomingApprovedConcessionTotals = computed(() => {
  const totals = createQuantityMap();
  incomingDispositionFacts.value
    .filter((fact) => fact.action === 'approve_concession')
    .forEach((fact) => {
      const unit = fact.unit || '件';
      totals.set(unit, (totals.get(unit) ?? 0) + Number(fact.quantity || 0));
    });
  return totals;
});

const incomingReinspectionAcceptedTotals = computed(() => {
  const totals = createQuantityMap();
  incomingReinspectionFacts.value
    .filter(incomingReinspectionIsComplete)
    .forEach((task) => {
      const unit = incomingReinspectionUnit(task);
      totals.set(unit, (totals.get(unit) ?? 0) + incomingFactNumber(task, 'acceptedQty'));
    });
  return totals;
});

const incomingOutcomeSummaryRows = computed(() => {
  const totals = incomingOutcomeTotals.value;
  const rows = [{ label: '已收货', value: formatQualityQuantityMap(totals.received) }];
  const appendQuantity = (label: string, values: Map<string, number>) => {
    if (qualityQuantityMapTotal(values) > 0.0001) {
      rows.push({ label, value: formatQualityQuantityMap(values) });
    }
  };

  appendQuantity('抽检样本', totals.sampled);
  appendQuantity('合格放行', totals.qualified);
  appendQuantity('历史让步放行', totals.concession);
  appendQuantity('审批让步放行', incomingApprovedConcessionTotals.value);
  appendQuantity('复检合格待入库', incomingReinspectionAcceptedTotals.value);
  appendQuantity('不合格判定', totals.rejected);

  const dispositionRemaining = incomingDispositionRemainingSummary();
  if (dispositionRemaining !== '-' && !/^0(?:\s|$)/.test(dispositionRemaining)) {
    rows.push({ label: '待处置不合格', value: dispositionRemaining });
  }
  appendQuantity('未判定 / 冻结', totals.pending);
  return rows;
});

function qualityQuantityMapTotal(values: Map<string, number>) {
  return Array.from(values.values()).reduce((sum, amount) => sum + amount, 0);
}

const incomingDecisionBoundaryNotice = computed(() => {
  const draft = documentDraft.value;
  if (currentKind.value !== 'incoming' || !draft) return '';
  const totals = incomingOutcomeTotals.value;
  const notices: string[] = [];
  if (qualityQuantityMapTotal(totals.pending) > 0.0001) {
    notices.push(`仍有 ${formatQualityQuantityMap(totals.pending)} 未判定，继续保持质检冻结。`);
  }
  if (draft.products.some((line) => line.lineDisposition === '退货' && (qualityQuantityAmount(line.rejectedQty) ?? 0) > 0.0001)) {
    notices.push('退货需在判定后单独执行。');
  }
  if (qualityQuantityMapTotal(totals.concession) > 0.0001) {
    notices.push('新增让步必须先判不合格，再完成审批。');
  }
  if (draft.products.some((line) => line.result === '待复判')) {
    notices.push('待复判数量需建立独立复检后才能放行。');
  }
  if (draft.products.some((line) => isLegacyIncomingQualityResult(line.result))) {
    notices.push('历史让步记录仅保留追溯，不参与本次判定。');
  }
  if (qualityQuantityMapTotal(totals.qualified) > 0.0001) notices.push('放行后由仓库办理正式入库。');
  return notices.join(' ');
});

const attachmentRows = computed(() => {
  const draft = documentDraft.value;
  if (!draft || isNew.value || !qualityAttachments.value.length) return [];

  return [
    { label: '附件数量', value: `${qualityAttachments.value.length} 个` },
  ];
});

const qualityAttachments = computed<Attachment[]>(() => {
  const draft = documentDraft.value;
  if (!draft) return [];
  return localAttachments.value[draft.code] ?? [];
});
const qualityAttachmentTitle = computed(() =>
  isQualityReadOnly.value ? `当前${currentConfig.value.title}只读，不能上传附件。` : '上传质检照片、检验报告或处置依据',
);

function defectImpactScope(draft: QualityDocumentDraft) {
  const disposition = String(draft.disposition || '').trim();
  if (/返工|返绕/.test(disposition)) return `${disposition}成本与复检结果待确认`;
  if (/退货|供应商/.test(disposition)) return '供应商退货、索赔与冻结数量待确认';
  if (/补发/.test(disposition)) return '补发数量与售后成本待核算';
  if (/报废/.test(disposition)) return '报废数量与损失待核算';
  if (/让步/.test(disposition)) return '让步风险与审批依据待确认';
  if (draft.sourceType === '客户反馈') return '补发与售后成本待核算';
  if (draft.sourceType === '来料质检') return '库存冻结，待供应商确认';
  return '返工或报废成本待核算';
}

const defectTraceFacts = computed(() => {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'defects') return [];
  const failedQty = draft.products
    .map((product) => product.failedQty)
    .filter(Boolean)
    .join('、') || '-';
  const cause = defectCauseFromDraft(draft);
  const responsibility = Array.from(new Set([
    draft.responsibilityProcess,
    draft.productionLine,
    draft.party,
    draft.operator || draft.leader,
  ].filter(Boolean))).join(' / ');
  const impactScope = defectImpactScope(draft);

  return [
    { label: '原因分类', value: cause },
    { label: '责任对象', value: responsibility || draft.party || '-' },
    { label: '影响数量', value: failedQty },
    { label: '影响范围', value: impactScope },
  ];
});

const qualityHandlingFacts = computed<QualityDetailFact[]>(() => {
  const draft = documentDraft.value;
  if (!draft || !isDetail.value) return [];

  const rows: QualityDetailFact[] = [];
  if (currentKind.value === 'defects') rows.push(...defectTraceFacts.value);
  if (draft.defectLevel) rows.push({ label: '缺陷等级', value: draft.defectLevel });
  if (currentKind.value !== 'incoming'
    && draft.disposition
    && !(currentKind.value === 'production' && detailDispositionStage.value === '待判定')) {
    rows.push({
      label: currentKind.value === 'production'
        ? (detailDispositionStage.value === '待判定' ? '预设流转' : '处置记录')
        : '处置方式',
      value: draft.disposition,
      full: currentKind.value === 'production',
    });
  }
  if (draft.rectificationAction) {
    rows.push({ label: currentKind.value === 'patrol' ? '整改说明' : '处置结果', value: draft.rectificationAction, full: true });
  }
  if (draft.verificationConclusion) {
    rows.push({ label: currentKind.value === 'patrol' ? '复查结论' : '验证结论', value: draft.verificationConclusion, full: true });
  }

  const conclusion = String(draft.conclusion || '').trim();
  if (conclusion && conclusion !== detailInspectionConclusion.value && conclusion !== currentStatus.value) {
    rows.push({ label: conclusionFieldLabel.value, value: conclusion, full: true });
  }
  if (draft.note) rows.push({ label: '备注', value: draft.note, full: true });
  return rows;
});

function defectCauseFromDraft(draft: QualityDocumentDraft) {
  const text = `${draft.conclusion} ${draft.note} ${draft.disposition}`;
  if (/水分|受潮|供应商|来料/.test(text)) return '来料/供应商';
  if (/绕线|线径|返绕|返工|工艺|温区/.test(text)) return '工艺/生产过程';
  if (/包装|外箱|污染|售后|客户/.test(text)) return '包装/客户反馈';
  if (/设备|压力|参数/.test(text)) return '设备/参数';
  return draft.sourceType || '待分类';
}

function contactFieldLabel(kind: QualityTabKey) {
  if (kind === 'incoming') return '供应商联系人';
  if (kind === 'production') return '现场负责人';
  if (kind === 'patrol') return '现场负责人';
  return '责任联系人';
}

function warehouseFieldLabel(kind: QualityTabKey) {
  if (kind === 'incoming') return '暂存位置';
  if (kind === 'production') return '检验区域';
  if (kind === 'patrol') return '巡检位置';
  return '处置区域';
}

function batchFieldLabel(sourceType: string) {
  if (sourceType === '入库抽检') return '包装批次';
  if (sourceType === '半成品质检') return '大盘批次';
  if (sourceType === '报工全检') return '报工批次';
  if (sourceType === '开机首检') return '首检批次';
  return '生产批次';
}

const primaryAction = computed(() => {
  if (
    currentKind.value === 'incoming'
    && isDetail.value
    && qualityQuantityMapTotal(incomingOutcomeTotals.value.pending) > 0.0001
  ) {
    return {
      label: '继续判定',
      next: currentStatus.value,
      remark: '进入变更页继续登记剩余未判定数量；已放行和已隔离数量保持不变。',
    };
  }
  return primaryTransition(currentStatus.value);
});
const qualityAlternativeAction = computed(() => {
  if (currentKind.value === 'patrol' && currentStatus.value === '待复查') {
    return {
      key: 'escalate-defect',
      label: '升级不良',
      next: '已关闭',
      remark: '整改复查仍异常，关闭巡检并自动生成关联不良记录。',
    };
  }
  if (currentKind.value === 'defects' && currentStatus.value === '待验证') {
    return {
      key: 'return-disposition',
      label: '退回处置',
      next: '处置中',
      remark: '处置结果验证未通过，退回责任方继续处理。',
    };
  }
  return undefined;
});
const primaryActionLabel = computed(() => {
  if (!primaryAction.value) return isLocked.value ? '已完成' : '等待处理';
  if (!isDetail.value) return primaryAction.value.label;
  if (currentStatus.value === '待检验') return '去检验';
  if (currentStatus.value === '待复判') return '去复判';
  if (['不合格', '待处理'].includes(currentStatus.value)) return '处理不良';
  return primaryAction.value.label;
});
const qualityPrimaryActionTitle = computed(() => {
  if (!canWriteQuality.value) return qualityReadonlyReason.value;
  return primaryAction.value
    ? `${primaryAction.value.label}：${primaryAction.value.remark}`
    : isLocked.value
      ? '当前单据已完成，只能打印、导出或查看日志。'
      : '当前状态不可继续流转。';
});

function qualityNextStepDescription(action: ReturnType<typeof primaryTransition>) {
  const status = currentStatus.value;
  const kind = currentKind.value;
  const draft = documentDraft.value;

  if (kind === 'incoming') {
    const pending = formatQualityQuantityMap(incomingOutcomeTotals.value.pending);
    const rejected = formatQualityQuantityMap(incomingOutcomeTotals.value.rejected);
    if (status === '待检验') {
      return '先按检验标准得出判定，再分别登记合格、不合格、让步和剩余待处理数量；只有成功放行的数量才会进入待入库。';
    }
    if (status === '待复判') {
      return `待复检/复判数量 ${pending} 继续质检冻结；当前页面不会自动生成复检任务，复判完成后再提交增量判定。`;
    }
    if (status === '不合格') {
      return `不合格 ${rejected} 已进入隔离；可在本页逐收货行执行退货或经审批的让步放行，成功后以处置凭证为准。`;
    }
    if (status === '部分放行') {
      return `已放行部分数量到待入库；不合格 ${rejected} 继续隔离或退货，仓库仍需单独确认入库。`;
    }
  }

  if (kind === 'production') {
    if (status === '待检验') {
      return productionQualityImpact.value
        ? `完成本次${draft?.sourceType || '生产质检'}的检查项与数量判定；提交后的自动流向见下方“判定影响”。`
        : '按对应标准完成开机首检、报工全检或入库抽检；合格后放行后续生产或完工入库。';
    }
    if (status === '待复判') {
      return '复判结果决定批次能否继续流转；仍不合格时转入不良记录并追溯工单、批次和责任班组。';
    }
    if (status === '不合格') {
      return '质检不合格需要转不良处理，后续由生产、质量和责任班组共同完成。';
    }
  }

  if (kind === 'patrol') {
    if (status === '待巡检') {
      return '按巡检标准记录现场点位、设备参数、标识和暂存状态；无异常可直接关闭，有风险则指定整改责任人。';
    }
    if (status === '待整改') {
      const owner = String(draft?.contact || '').trim() || '现场责任人';
      return `${owner}完成现场整改并记录结果，必要时上传现场证据；提交后由质量复查，仍异常则升级不良。`;
    }
    if (status === '待复查') {
      return '质量复查确认整改效果；通过后关闭巡检，仍异常时升级并自动生成关联不良记录。';
    }
  }

  if (kind === 'defects') {
    const disposition = String(draft?.disposition || '').trim();
    const actionName = disposition && !['待制定', '待检验'].includes(disposition) ? disposition : '处置';
    if (status === '待处理') {
      return `确认责任对象、${actionName}方案和完成期限后开始执行；处理阶段与具体方式继续分别记录。`;
    }
    if (['处置中', '返工中', '供应商确认'].includes(status)) {
      return `完成${actionName}并填写处置结果、上传必要证据；提交后进入独立验证。`;
    }
    if (['待验证', '待复判'].includes(status)) {
      return `验证${actionName}结果、影响数量和关闭条件；通过后关闭不良，未通过则退回继续处置。`;
    }
  }

  if (draft?.sourceDoc) {
    return `${currentConfig.value.title}来自 ${draft.sourceDoc}，请按当前状态完成「${primaryActionLabel.value}」并保留检验、处置和附件证据。`;
  }

  return action?.remark || currentConfig.value.statusTip;
}

function activeQualityStageDescription(stage: string) {
  const draft = documentDraft.value;
  if (!draft) return currentConfig.value.statusTip;

  if (currentKind.value === 'production') {
    if (stage === '待判定') return '先完成逐项检查和数量判定；提交后再分别推进放行数量与异常数量。';
    if (stage === '待处置') return `检验结论保持为${detailInspectionConclusion.value}；当前只处理异常数量，不用处置进度改写原检验结论。`;
    if (stage === '返工中') return `检验结论保持为${detailInspectionConclusion.value}；完成返工记录后必须进入独立复检。`;
    if (stage === '待复检') return `检验结论保持为${detailInspectionConclusion.value}；独立复检完成后再更新处理阶段和可用数量。`;
  }

  if (currentKind.value === 'incoming') {
    if (stage === '待判定') return '先按收货行完成检查和数量判定，未判定数量继续保持质检冻结。';
    if (stage === '待处置') return `检验结论保持为${detailInspectionConclusion.value}；当前可执行退货、让步审批或复检，不直接形成可用库存。`;
    if (stage === '待复检') return `检验结论保持为${detailInspectionConclusion.value}；复检结果提交后再更新放行、隔离和待入库数量。`;
  }

  return qualityNextStepDescription(primaryAction.value);
}

const nextStepGuidance = computed(() => {
  if (!documentDraft.value) {
    return {
      label: '返回列表重新选择单据',
      action: '查看列表',
      description: '当前没有可处理的质检单据。',
      tone: 'muted',
    };
  }

  if (isNew.value || isEdit.value) {
    if (currentKind.value === 'incoming') {
      const totals = incomingOutcomeTotals.value;
      const pending = formatQualityQuantityMap(totals.pending);
      const rejected = formatQualityQuantityMap(totals.rejected);
      const concession = formatQualityQuantityMap(totals.concession);
      if (qualityQuantityMapTotal(totals.pending) > 0.0001) {
        return {
          label: '提交部分判定并保留待处理量',
          action: '提交判定',
          description: `当前剩余 ${pending} 待处理；可先提交已判定数量，剩余数量继续质检冻结，复检任务需另行建立。`,
          tone: 'pending',
        };
      }
      if (qualityQuantityMapTotal(totals.rejected) > 0.0001) {
        return {
          label: '确认不合格处置后提交',
          action: '提交判定',
          description: `当前不合格 ${rejected}；先提交数量判定使其进入隔离，再在详情页执行真实退货或让步审批命令。`,
          tone: 'pending',
        };
      }
      if (qualityQuantityMapTotal(totals.concession) > 0.0001) {
        return {
          label: '确认让步边界后提交',
          action: '提交判定',
          description: `当前判定让步 ${concession}；现有 decision 合同会直接计入放行。已隔离不合格量的让步必须改走详情页审批处置命令。`,
          tone: 'pending',
        };
      }
    }
    return {
      label: '提交',
      action: '提交',
      description: '保存草稿后可继续补全检验信息，提交后进入质检处理流程。',
      tone: 'pending',
    };
  }

  if (
    isDetail.value
    && currentKind.value === 'incoming'
    && qualityQuantityMapTotal(incomingOutcomeTotals.value.pending) > 0.0001
  ) {
    const pending = formatQualityQuantityMap(incomingOutcomeTotals.value.pending);
    const hasDispositionRemaining = incomingDispositionRemainingTotal() > 0.0001;
    return {
      label: hasDispositionRemaining ? '继续判定并处理已隔离数量' : '继续完成检验判定',
      action: '继续判定',
      description: hasDispositionRemaining
        ? `仍有 ${pending} 未判定并保持质检冻结；另有 ${incomingDispositionRemainingSummary()} 不合格隔离数量可在本页执行退货、让步审批或复检。`
        : `仍有 ${pending} 未判定并保持质检冻结；进入变更页补充检查项和数量判定。`,
      tone: 'pending',
    };
  }

  const activeStage = detailDispositionStage.value;
  if (isDetail.value && !['无需处置', '已完成', '已关闭', '已作废'].includes(activeStage)) {
    return {
      label: detailCurrentAction.value,
      action: activeStage,
      description: activeQualityStageDescription(activeStage),
      tone: 'pending',
    };
  }

  if (currentKind.value === 'incoming' && qualityQuantityMapTotal(incomingOutcomeTotals.value.pending) > 0.0001) {
    const pending = formatQualityQuantityMap(incomingOutcomeTotals.value.pending);
    return {
      label: '继续判定或安排复检',
      action: canWriteQuality.value ? '进入变更' : '查看待处理量',
      description: `仍有 ${pending} 保持质检冻结；可继续补充检验判定，待复判数量需建立复检任务。`,
      tone: 'pending',
    };
  }

  if (currentKind.value === 'incoming' && incomingDispositionRemainingTotal() > 0.0001) {
    return {
      label: '执行不合格后续处置',
      action: canWriteQuality.value ? '填写下方处置命令' : '查看剩余处置量',
      description: `仍有 ${incomingDispositionRemainingSummary()} 不合格隔离数量待处理；可逐收货行转采购处理或经审批让步放行。转采购处理不会直接扣减库存。`,
      tone: 'pending',
    };
  }

  if (qualityFollowupAction.value) {
    return {
      label: qualityFollowupAction.value.label,
      action: qualityFollowupAction.value.label,
      description: qualityFollowupAction.value.description,
      tone: 'tracking',
    };
  }

  if (isLocked.value) {
    return {
      label: '归档与追溯',
      action: '查看日志与质量追溯',
      description: `${currentConfig.value.title}已处于${currentStatus.value}，后续通过附件、日志和质量流水追溯。`,
      tone: 'done',
    };
  }

  const action = primaryAction.value;
  return {
    label: primaryActionLabel.value,
    action: primaryActionLabel.value,
    description: qualityNextStepDescription(action),
    tone: ['不合格', '待处理', '处置中', '待验证', '返工中', '待整改', '待复查'].includes(currentStatus.value) ? 'pending' : 'tracking',
  };
});

type QualityDetailFocus = 'disposition' | 'rework' | 'reinspection';

const qualityInlineFocusAction = computed<{ focus: QualityDetailFocus; label: string } | null>(() => {
  if (!isDetail.value) return null;
  if (currentKind.value === 'production') {
    if (productionReinspectionFacts.value.some((task) => task.status !== '已完成')) {
      return { focus: 'reinspection', label: '定位复检任务' };
    }
    if (productionReworkFacts.value.some((task) => ['待返工', '返工中'].includes(task.status))) {
      return { focus: 'rework', label: '定位返工任务' };
    }
    if (productionDispositionAvailable.value > 0.0001) {
      return { focus: 'disposition', label: '定位处置操作' };
    }
  }
  if (
    currentKind.value === 'incoming'
    && incomingReinspectionFacts.value.some((task) => !incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task))
  ) {
    return { focus: 'reinspection', label: '定位复检任务' };
  }
  if (currentKind.value === 'incoming' && incomingDispositionRemainingTotal() > 0.0001) {
    return { focus: 'disposition', label: '定位处置操作' };
  }
  return null;
});

const qualityAutoFocusKey = ref('');

function qualityFocusTarget(focus: QualityDetailFocus) {
  if (focus === 'reinspection') {
    return document.querySelector('[data-quality-focus="reinspection"][data-quality-active="true"]') as HTMLElement | null;
  }
  if (focus === 'rework') {
    return document.querySelector('[data-quality-focus="rework"][data-quality-active="true"]') as HTMLElement | null;
  }
  return document.querySelector('#quality-production-closure, #quality-incoming-closure') as HTMLElement | null;
}

function focusQualityDetailSection(focus: QualityDetailFocus, automatic = false) {
  void nextTick(() => {
    const target = qualityFocusTarget(focus);
    if (!target) return;
    if (automatic) qualityAutoFocusKey.value = route.fullPath;
    scrollElementIntoView(target);
    const control = target.querySelector('select, input, textarea, button:not(:disabled)') as HTMLElement | null;
    control?.focus({ preventScroll: true });
  });
}

const qualityMoreActions = computed<QualityMoreAction[]>(() => {
  if (!documentDraft.value || !isDetail.value) return [];
  return [{
    key: 'change',
    label: '变更',
    description: '调整当前质检单据内容，统一按变更记录追溯。',
    disabled: !canWriteQuality.value || isLocked.value,
    disabledReason: !canWriteQuality.value ? qualityReadonlyReason.value : '当前状态已锁定，不可变更。',
  }];
});
const productionStandardOptions = computed(() => {
  draftInteractionRevision.value;
  const selectedType = currentKind.value === 'production' ? documentDraft.value?.sourceType : currentKind.value === 'patrol' ? '质量巡检' : '';
  const selectedCode = documentDraft.value?.qualityStandardCode;
  return availableQualityStandards.value.filter((row) => {
    const isProductionType = productionQualityTypes.some((type) => type === row.inspectionType);
    const isPatrolType = row.inspectionType === '质量巡检';
    const selectableVersion = row.status === '启用' || row.code === selectedCode;
    return selectableVersion && (isProductionType || isPatrolType) && (!selectedType || row.inspectionType === selectedType);
  });
});

function markDraftInteraction() {
  draftInteractionRevision.value += 1;
}

function rowsForKind(kind: QualityTabKey) {
  if (kind === 'incoming') return incomingQualityRows;
  if (kind === 'production') return productionQualityRows;
  if (kind === 'patrol') return qualityPatrolRows;
  return defectRows;
}

function productionTypeFromQuery(): string {
  const requestedType = route.query.type?.toString();
  if (requestedType && productionQualityTypes.some((type) => type === requestedType)) return requestedType;
  const requestedStandard = availableQualityStandards.value.find((standard) => standard.code === route.query.standard?.toString());
  if (requestedStandard && productionQualityTypes.some((type) => type === requestedStandard.inspectionType)) {
    return requestedStandard.inspectionType;
  }
  return '开机首检';
}

function productionStandardFromQuery() {
  const requestedType = productionTypeFromQuery();
  const requestedStandardCode = route.query.standard?.toString();
  return (
    availableQualityStandards.value.find(
      (standard) => standard.code === requestedStandardCode && standard.inspectionType === requestedType,
    ) ?? availableQualityStandards.value.find((standard) => standard.inspectionType === requestedType && standard.status === '启用')
  );
}

function productionStandardFor(type: string, code?: string) {
  return (
    availableQualityStandards.value.find((standard) => standard.inspectionType === type && standard.code === code) ??
    availableQualityStandards.value.find((standard) => standard.inspectionType === type && standard.status === '启用')
  );
}

function patrolStandard(code?: string) {
  return (
    availableQualityStandards.value.find((standard) => standard.inspectionType === '质量巡检' && standard.code === code) ??
    availableQualityStandards.value.find((standard) => standard.inspectionType === '质量巡检' && standard.status === '启用')
  );
}

function inspectionItemsFromStandard(standard: QualityStandardRecord | undefined) {
  if (!standard) {
    return [
      { name: '颜色', standard: '符合封样', actual: '', result: '待检验' },
      { name: '线径', standard: '1.75mm 公差内', actual: '', result: '待检验' },
      { name: '外观', standard: '无气泡、无毛刺', actual: '', result: '待检验' },
    ];
  }

  return qualityStandardCheckpointRules(standard).map((checkpoint) => ({
    name: checkpoint.name,
    standard: checkpoint.requirement,
    actual: '',
    result: '待检验',
  }));
}

function createQualityLine(kind: QualityTabKey, standard?: QualityStandardRecord): QualityDocumentLine {
  const line: QualityDocumentLine = {
    name: '',
    qty: '',
    batch: '',
    sampleQty: '',
    failedQty: '',
    result: '待检验',
    inspectionItems: kind === 'production' || kind === 'patrol' ? inspectionItemsFromStandard(standard) : [],
  };
  return kind === 'incoming' ? normalizeIncomingLineOutcome(line) : line;
}

function updateProductionInspectionItems(draft: QualityDocumentDraft, standard: QualityStandardRecord | undefined) {
  draft.qualityStandardCode = standard?.code ?? '';
  draft.qualityStandardName = standard?.name ?? '';
  draft.standardVersionId = standard?.code ?? '';
  draft.qualityStandardSnapshot = standard ? {
    code: standard.code,
    familyCode: standard.familyCode,
    version: standard.version,
    name: standard.name,
    inspectionType: standard.inspectionType,
    sampleRule: standard.sampleRule,
    acceptance: standard.acceptance,
    checkpointRules: qualityStandardCheckpointRules(standard).map((item) => ({ ...item })),
  } : undefined;
  draft.products.forEach((line) => {
    line.inspectionItems = inspectionItemsFromStandard(standard);
  });
}

async function loadRuntimeQualityStandardsForEditor() {
  if (runtimeQualityStandardsLoaded.value && !runtimeQualityStandardsError.value) return;
  runtimeQualityStandardsLoading.value = true;
  runtimeQualityStandardsError.value = '';
  const interactionRevision = draftInteractionRevision.value;
  try {
    const rows = await listQualityStandards();
    runtimeQualityStandards.value = rows;
    runtimeQualityStandardsLoaded.value = true;
    const draft = documentDraft.value;
    if (!draft || !isNew.value || !['production', 'patrol'].includes(currentKind.value)) return;
    const requestedCode = route.query.standard?.toString() || draft.qualityStandardCode;
    const inspectionType = currentKind.value === 'patrol' ? '质量巡检' : draft.sourceType;
    const standard = requestedCode
      ? rows.find((row) => row.code === requestedCode && row.inspectionType === inspectionType && row.status === '启用')
      : rows.find((row) => row.inspectionType === inspectionType && row.status === '启用');
    if (!standard) return;
    if (interactionRevision !== draftInteractionRevision.value) return;
    if (currentKind.value === 'production') {
      draft.sourceType = standard.inspectionType;
      syncProductionTypeMeta(draft);
    }
    updateProductionInspectionItems(draft, standard);
    await nextTick();
    resetUnsavedChanges();
  } catch (error) {
    runtimeQualityStandards.value = [];
    runtimeQualityStandardsLoaded.value = false;
    runtimeQualityStandardsError.value = error instanceof Error ? error.message : '服务端质检标准加载失败，请重试。';
  } finally {
    runtimeQualityStandardsLoading.value = false;
  }
}

function syncProductionTypeMeta(draft: QualityDocumentDraft) {
  draft.processStep = draft.sourceType;
  draft.responsibilityProcess = draft.sourceType === '入库抽检'
    ? '打包/入库前检验'
    : draft.sourceType === '半成品质检'
      ? '大盘半成品检验'
      : '生产报工';
}

function handleProductionTypeChange() {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'production') return;
  syncProductionTypeMeta(draft);
  updateProductionInspectionItems(draft, productionStandardFor(draft.sourceType, draft.qualityStandardCode));
  markDraftInteraction();
}

function handleQualitySourceTypeChange() {
  const draft = documentDraft.value;
  if (!draft) return;
  if (currentKind.value === 'defects') {
    draft.sourceDoc = '';
    draft.party = '';
    draft.contact = '';
    draft.products = [createQualityLine('defects')];
    draft.warehouse = '';
    draft.productionLine = '';
    draft.workOrder = '';
    draft.executionCard = '';
    draft.reportBatch = '';
    draft.shiftCode = '';
    draft.shiftName = '';
    draft.leader = '';
    draft.operator = '';
    draft.processStep = '';
    draft.responsibilityProcess = '';
    draft.disposition = '待制定';
    draft.conclusion = '';
    draft.note = '';
  }
  if (currentKind.value === 'patrol') {
    draft.processStep = draft.sourceType;
    draft.responsibilityProcess = draft.responsibilityProcess || draft.sourceType;
    updateProductionInspectionItems(draft, patrolStandard(draft.qualityStandardCode));
  }
  markDraftInteraction();
}

function handlePatrolLocationChange() {
  const draft = documentDraft.value;
  if (!draft || currentKind.value !== 'patrol') return;
  draft.productionLine = draft.party;
  draft.warehouse = draft.party;
  markDraftInteraction();
}

function handleProductionStandardChange() {
  const draft = documentDraft.value;
  if (!draft || !['production', 'patrol'].includes(currentKind.value)) return;
  const standard = availableQualityStandards.value.find((row) => row.code === draft.qualityStandardCode);
  if (currentKind.value === 'patrol') {
    if (standard?.inspectionType === '质量巡检') {
      draft.qualityStandardName = standard.name;
      updateProductionInspectionItems(draft, standard);
    } else {
      updateProductionInspectionItems(draft, patrolStandard());
    }
    markDraftInteraction();
    return;
  }
  if (standard && productionQualityTypes.some((type) => type === standard.inspectionType)) {
    draft.sourceType = standard.inspectionType;
    syncProductionTypeMeta(draft);
    updateProductionInspectionItems(draft, standard);
    markDraftInteraction();
    return;
  }
  updateProductionInspectionItems(draft, undefined);
  markDraftInteraction();
}

function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createNewDraft(kind: QualityTabKey): QualityDocumentDraft {
  const productionType = kind === 'production' ? productionTypeFromQuery() : '';
  const productionStandard = kind === 'production' ? productionStandardFromQuery() : undefined;
  const patrolStandardRecord = kind === 'patrol' ? patrolStandard(route.query.standard?.toString()) : undefined;
  const base: QualityDocumentDraft = {
    kind,
    code: '系统自动生成',
    sourceDoc: route.query.source?.toString() ?? '',
    sourceType: kind === 'incoming' ? '采购收货' : kind === 'production' ? productionType : kind === 'patrol' ? '产线巡检' : '',
    qualityStandardCode: kind === 'production' ? productionStandard?.code ?? '' : kind === 'patrol' ? patrolStandardRecord?.code ?? '' : kind === 'incoming' ? 'QSTD-IQC-RM-V1' : '',
    qualityStandardName: kind === 'production' ? productionStandard?.name ?? '' : kind === 'patrol' ? patrolStandardRecord?.name ?? '' : kind === 'incoming' ? '原料来料检验标准' : '',
    standardVersionId: kind === 'incoming' ? 'QSTD-IQC-RM-V1' : undefined,
    version: kind === 'incoming' ? 0 : undefined,
    party: kind === 'incoming' ? '待选择供应商' : kind === 'production' ? '待选择产线' : '',
    contact: '',
    products: [createQualityLine(kind, kind === 'patrol' ? patrolStandardRecord : productionStandard)],
    inspector: kind === 'patrol' || kind === 'production' ? '孙悦' : '林珊',
    status: kind === 'defects' ? '待处理' : kind === 'patrol' ? '待巡检' : '待检验',
    date: currentLocalDate(),
    dueDate: currentLocalDate(),
    warehouse: kind === 'incoming' ? '采购暂存区' : kind === 'production' ? '生产线边仓' : '',
    productionLine: kind === 'production' ? '待选择产线' : '',
    workOrder: kind === 'production' || kind === 'patrol' ? route.query.workOrder?.toString() ?? '' : '',
    executionCard: kind === 'production' || kind === 'patrol' ? route.query.executionCard?.toString() ?? '' : '',
    reportBatch: kind === 'production' || kind === 'patrol' ? route.query.reportBatch?.toString() ?? '' : '',
    shiftCode: kind === 'production' || kind === 'patrol' ? route.query.shift?.toString() ?? 'SHIFT-20260701-D' : '',
    shiftName: kind === 'production' || kind === 'patrol' ? '白班' : '',
    leader: kind === 'production' ? '待选择班长' : '',
    operator: kind === 'production' ? '待选择操作员' : '',
    processStep: kind === 'production' ? productionType : kind === 'patrol' ? '现场巡检' : '',
    responsibilityProcess:
      kind === 'production' ? (productionType === '入库抽检' ? '打包/入库前检验' : '生产报工') : kind === 'patrol' ? '产线巡检' : '',
    defectLevel: kind === 'defects' ? '一般' : '',
    disposition: kind === 'defects' ? '待制定' : kind === 'patrol' ? '' : '待检验',
    conclusion: '',
    note: '',
  };
  if (kind === 'patrol') {
    base.products[0].qty = '1 次';
    base.products[0].sampleQty = '1 点';
    base.products[0].failedQty = '0 点';
    if (base.sourceDoc) applyPatrolContextSource(base, base.sourceDoc);
  }
  return base;
}

function cloneQualityDraft(draft: QualityDocumentDraft): QualityDocumentDraft {
  const clone = JSON.parse(JSON.stringify(draft)) as QualityDocumentDraft;
  if (clone.kind === 'incoming') {
    if (['采购入库', '采购到货'].includes(clone.sourceType)) clone.sourceType = '采购收货';
    clone.standardVersionId ||= clone.qualityStandardCode || 'QSTD-IQC-RM-V1';
    clone.version ??= 0;
    clone.products = clone.products.map(normalizeIncomingLineOutcome);
  }
  return clone;
}

function incomingDecisionLinesFromDraft(draft: QualityDocumentDraft): IncomingQualityDecisionLine[] {
  return draft.products.map((line) => {
    const receivedQty = qualityQuantityAmount(line.qty) ?? 0;
    const acceptedQty = qualityQuantityAmount(line.qualifiedQty) ?? 0;
    const concessionQty = isHistoricalIncomingConcession(line)
      ? qualityQuantityAmount(line.concessionQty) ?? 0
      : 0;
    const rejectedQty = qualityQuantityAmount(line.rejectedQty) ?? 0;
    return {
      receiptLineId: line.receiptLineId,
      materialCode: line.materialCode,
      name: line.name,
      batch: line.batch,
      receivedQty,
      acceptedQty,
      concessionQty,
      rejectedQty,
      pendingQty: Math.max(0, receivedQty - acceptedQty - concessionQty - rejectedQty),
      sampleQty: line.sampleQty,
      sampleIssueQty: line.failedQty,
      inspectionItems: (line.inspectionItems || []).map((item) => ({
        name: item.name,
        standard: item.standard,
        actual: item.actual.trim(),
        result: item.result,
        note: String(item.note || '').trim(),
      })),
      disposition: line.lineDisposition || '待判定',
      result: line.result,
    };
  });
}

function incomingDecisionRemark(draft: QualityDocumentDraft) {
  const outcome = incomingOutcomeSummaryRows.value
    .filter((row) => !['已收货', '抽检样本'].includes(row.label))
    .map((row) => `${row.label} ${row.value}`)
    .join('；');
  return [draft.conclusion, outcome, draft.note].filter(Boolean).join('；');
}

function incomingDecisionPayload(draft: QualityDocumentDraft) {
  return {
    sourceDoc: draft.sourceDoc,
    standardVersionId: draft.standardVersionId || draft.qualityStandardCode || 'QSTD-IQC-RM-V1',
    version: draft.version ?? 0,
    actor: draft.inspector || '当前用户',
    remark: incomingDecisionRemark(draft),
    idempotencyKey: `${draft.code}:${(draft.version ?? 0) + 1}`,
    lines: incomingDecisionLinesFromDraft(draft),
  };
}

function incomingDraftPayload(draft: QualityDocumentDraft): IncomingQualityDraftPayload {
  return {
    ...draft,
    ...incomingDecisionPayload(draft),
    products: draft.products.map((line) => ({
      ...line,
      inspectionItems: line.inspectionItems?.map((item) => ({ ...item })),
    })),
  };
}

function applyIncomingApiResponse(draft: QualityDocumentDraft, response: IncomingQualityApiResponse) {
  const record = response.record;
  if (record) {
    const recordProducts = record.products?.length ? record.products : draft.products;
    Object.assign(draft, record, {
      kind: 'incoming' as const,
      products: recordProducts.map((line, index) => normalizeIncomingLineOutcome({
        ...draft.products[index],
        ...line,
        inspectionItems: line.inspectionItems?.map((item) => ({ ...item })),
      })),
    });
  }
  if (response.receipt) restoreIncomingOutcomeFromReceipt(draft, response.receipt);
  if (response.decision) restoreIncomingOutcomeFromDecision(draft, response.decision);
  if (
    isEdit.value
    && !response.decision?.decidedAt
    && ['待检验', '待判定', '待质检'].includes(draft.status)
  ) {
    draft.date = currentLocalDate();
  }
  if (response.dispositions) incomingDispositionFacts.value = response.dispositions;
  if (response.reinspections) incomingReinspectionFacts.value = response.reinspections;
  if (response.returnDocuments) incomingReturnDocumentFacts.value = response.returnDocuments;
  if (response.flowRecords) {
    localFlowRecords.value = { ...localFlowRecords.value, [draft.code]: response.flowRecords };
  }
  draft.standardVersionId ||= draft.qualityStandardCode || 'QSTD-IQC-RM-V1';
  draft.version ??= response.decision?.version ?? 0;
  statusOverrides.value = { ...statusOverrides.value, [draft.code]: draft.status };
  if (sourceRecord.value) {
    Object.assign(sourceRecord.value, cloneQualityDraft(draft));
  }
}

async function hydrateIncomingReceipt(draft: QualityDocumentDraft) {
  if (draft.kind !== 'incoming' || !draft.sourceDoc) return;
  try {
    const response = await getPurchaseReceipt(draft.sourceDoc);
    if (qualityEditableDraft.value !== draft) return;
    applyIncomingReceipt(draft, response.receipt as IncomingQualityReceipt);
    markDraftInteraction();
  } catch {
    // Keep the source code so the user can reselect the receipt if the prototype API is unavailable.
  }
}

function applyProductionQualityApiResponse(response: ProductionQualityApiResponse) {
  const task = response.record;
  productionDispositionFacts.value = response.dispositions ?? [];
  if (response.reworkTasks) productionReworkFacts.value = response.reworkTasks;
  if (response.reinspectionTasks) productionReinspectionFacts.value = response.reinspectionTasks;
  productionReworkFacts.value.forEach((item) => {
    productionReworkCompletionDrafts.value[item.code] ||= { resultNote: '', inspector: task.inspector || '' };
  });
  productionReinspectionFacts.value.forEach((item) => {
    productionReinspectionDrafts.value[item.code] ||= {
      acceptedQty: '',
      rejectedQty: String(item.quantity || ''),
      resultReason: '',
      inspectionItems: productionReinspectionInspectionItems(item),
    };
  });
  productionDecisionVersion.value = Number(response.decision?.version || task.version || 0);
  const taskIndex = production2QualityTasks.findIndex((item) => item.code === task.code);
  if (taskIndex >= 0) production2QualityTasks.splice(taskIndex, 1, task);
  else production2QualityTasks.unshift(task);
  if (response.executionCard?.code) {
    const cardIndex = production2ExecutionCards.findIndex((item) => item.code === response.executionCard?.code);
    if (cardIndex >= 0) production2ExecutionCards.splice(cardIndex, 1, response.executionCard);
    else production2ExecutionCards.unshift(response.executionCard);
  }
  if (response.productionException?.code) {
    const exceptionIndex = production2Exceptions.findIndex((item) => item.code === response.productionException?.code);
    if (exceptionIndex >= 0) production2Exceptions.splice(exceptionIndex, 1, response.productionException);
    else production2Exceptions.unshift(response.productionException);
  }
  const record = productionQualityRecordFromTask(task);
  record.version = task.version || 0;
  record.standardVersionId = task.standardVersionId || task.qualityStandardCode || record.qualityStandardCode;
  if (isEdit.value && !task.decidedAt && ['待检', '待检验', '待判定'].includes(task.status)) {
    record.date = currentLocalDate();
  }
  const recordIndex = productionQualityRows.findIndex((item) => item.code === record.code);
  if (recordIndex >= 0) productionQualityRows.splice(recordIndex, 1, record);
  else productionQualityRows.unshift(record);
  qualityEditableDraft.value = cloneQualityDraft({ ...record, kind: 'production' });
  statusOverrides.value = { ...statusOverrides.value, [record.code]: record.status };
  if (response.flowRecords) {
    localFlowRecords.value = { ...localFlowRecords.value, [record.code]: response.flowRecords };
  }
  return record;
}

const currentProductionQualityTask = computed(() => {
  if (currentKind.value !== 'production' || !documentDraft.value) return undefined;
  return production2QualityTasks.find((item) => item.code === documentDraft.value?.code);
});

const productionDispositionRemaining = computed(() => {
  const task = currentProductionQualityTask.value;
  if (!task) return 0;
  if (task.remainingDispositionQty !== undefined) return Math.max(0, Number(task.remainingDispositionQty || 0));
  const disposed = productionDispositionFacts.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return Math.max(0, Number(task.rejectedQty || 0) - disposed);
});

const productionDispositionInProcess = computed(() => {
  const task = currentProductionQualityTask.value;
  if (!task) return 0;
  if (task.inProcessDispositionQty !== undefined) return Math.max(0, Number(task.inProcessDispositionQty || 0));
  return productionReworkFacts.value
    .filter((item) => !['已完成', '已取消'].includes(item.status))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
});

const productionDispositionAvailable = computed(() => {
  const task = currentProductionQualityTask.value;
  if (task?.unassignedDispositionQty !== undefined) return Math.max(0, Number(task.unassignedDispositionQty || 0));
  return Math.max(0, productionDispositionRemaining.value - productionDispositionInProcess.value);
});

function productionDispositionActionLabel(action: ProductionQualityDisposition['action']) {
  if (action === 'rework_pass') return '返工复检合格';
  if (action === 'approve_concession') return '让步审批放行';
  return '报废';
}

function productionDispositionIssue() {
  const task = currentProductionQualityTask.value;
  const input = productionDispositionDraft.value;
  if (!task || Number(task.rejectedQty || 0) <= 0) return '当前质检任务没有不合格数量。';
  if (productionDispositionAvailable.value <= 0.0001) return '当前没有尚未安排的处置数量。';
  if (!input.action) return '请选择处置动作。';
  const quantity = qualityQuantityAmount(input.quantity) ?? Number.NaN;
  if (!Number.isFinite(quantity) || quantity <= 0) return '请输入大于 0 的处置数量。';
  if (quantity > productionDispositionAvailable.value + 0.0001) return '处置数量不能超过未安排数量。';
  if (!input.reason.trim()) return '请填写处置原因或依据。';
  if (input.action === 'approve_concession' && !input.approvedBy.trim()) return '让步放行必须填写审批人。';
  return '';
}

function productionReworkIssue() {
  const input = productionReworkDraft.value;
  const quantity = qualityQuantityAmount(input.quantity) ?? Number.NaN;
  if (productionDispositionAvailable.value <= 0.0001) return '当前没有可安排返工的数量。';
  if (!Number.isFinite(quantity) || quantity <= 0) return '请输入大于 0 的返工数量。';
  if (quantity > productionDispositionAvailable.value + 0.0001) return '返工数量不能超过未安排数量。';
  if (!input.reason.trim()) return '请填写返工原因和要求。';
  if (!input.assignee.trim()) return '请指定返工负责人。';
  return '';
}

async function submitProductionRework() {
  const draft = documentDraft.value;
  const task = currentProductionQualityTask.value;
  const issue = productionReworkIssue();
  if (!draft || !task || issue) {
    if (issue) showToast(issue, 'error');
    return;
  }
  const input = productionReworkDraft.value;
  const quantity = qualityQuantityAmount(input.quantity) ?? 0;
  const key = `rework:create:${productionReworkFacts.value.length + 1}`;
  productionProcessSubmittingKey.value = key;
  try {
    const response = await createProductionReworkTask(draft.code, {
      quantity,
      reason: input.reason.trim(),
      assignee: input.assignee.trim(),
      actor: draft.inspector || '质检员',
      decisionVersion: productionDecisionVersion.value || Number(task.version || 0),
      idempotencyKey: `${draft.code}:${key}:${quantity}`,
    });
    applyProductionQualityApiResponse(response);
    productionReworkDraft.value = { quantity: '', reason: '', assignee: '' };
    showToast(`返工任务 ${response.reworkTask.code} 已创建，批次继续保持质量阻断`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '创建返工任务失败，请稍后重试。', 'error');
  } finally {
    productionProcessSubmittingKey.value = '';
  }
}

function productionReworkCompletionIssue(task: ProductionReworkTask) {
  const input = productionReworkCompletionDrafts.value[task.code];
  if (!input?.resultNote.trim()) return '请填写实际返工记录。';
  if (!input.inspector.trim()) return '请指定复检员。';
  return '';
}

async function submitProductionReworkCompletion(task: ProductionReworkTask) {
  const draft = documentDraft.value;
  const input = productionReworkCompletionDrafts.value[task.code];
  const issue = productionReworkCompletionIssue(task);
  if (!draft || !input || issue) {
    if (issue) showToast(issue, 'error');
    return;
  }
  const key = `rework:complete:${task.code}`;
  productionProcessSubmittingKey.value = key;
  try {
    const response = await completeProductionReworkTask(draft.code, task.code, {
      revision: task.revision,
      resultNote: input.resultNote.trim(),
      inspector: input.inspector.trim(),
      actor: task.assignee,
      idempotencyKey: `${draft.code}:${key}:${task.revision}`,
    });
    applyProductionQualityApiResponse(response);
    showToast(`返工已完成，复检任务 ${response.reinspectionTask.code} 已生成`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '完成返工失败，请稍后重试。', 'error');
  } finally {
    productionProcessSubmittingKey.value = '';
  }
}

function productionReinspectionIssue(task: ProductionReinspectionTask) {
  const input = productionReinspectionDrafts.value[task.code];
  if (!input) return '复检草稿尚未准备好。';
  if (!input.inspectionItems.length) return '复检任务缺少冻结检查项，请刷新后重试。';
  const pendingItem = input.inspectionItems.find((item) => !['合格', '不合格'].includes(item.result));
  if (pendingItem) return `请完成复检检查项“${pendingItem.name}”的判定。`;
  const missingEvidence = input.inspectionItems.find((item) => item.result === '不合格' && !item.actual.trim() && !String(item.note || '').trim());
  if (missingEvidence) return `复检检查项“${missingEvidence.name}”不合格时，请填写复检记录或异常说明。`;
  const accepted = qualityQuantityAmount(input.acceptedQty) ?? Number.NaN;
  const rejected = qualityQuantityAmount(input.rejectedQty) ?? Number.NaN;
  if (![accepted, rejected].every(Number.isFinite) || accepted < 0 || rejected < 0) return '请填写有效的复检合格与不合格数量。';
  if (Math.abs(accepted + rejected - Number(task.quantity || 0)) > 0.0001) return '合格与不合格数量之和必须等于复检数量。';
  const abnormalCount = input.inspectionItems.filter((item) => item.result === '不合格').length;
  if (rejected > 0 && abnormalCount === 0) return '存在复检不合格数量时，至少需要标记一个复检不合格项。';
  if (rejected <= 0 && abnormalCount > 0) return '存在复检不合格项时，不能把全部返工数量判定为合格。';
  return '';
}

function productionReworkForReinspection(task: ProductionReinspectionTask) {
  return productionReworkFacts.value.find((item) => item.code === task.reworkTaskCode);
}

async function submitProductionReinspection(task: ProductionReinspectionTask) {
  const draft = documentDraft.value;
  const input = productionReinspectionDrafts.value[task.code];
  const issue = productionReinspectionIssue(task);
  if (!draft || !input || issue) {
    if (issue) showToast(issue, 'error');
    return;
  }
  const key = `reinspection:decision:${task.code}`;
  const acceptedQty = qualityQuantityAmount(input.acceptedQty) ?? 0;
  const rejectedQty = qualityQuantityAmount(input.rejectedQty) ?? 0;
  productionProcessSubmittingKey.value = key;
  try {
    const response = await decideProductionReinspectionTask(draft.code, task.code, {
      revision: task.revision,
      acceptedQty,
      rejectedQty,
      inspectionItems: input.inspectionItems.map((item) => ({ ...item })),
      resultReason: input.resultReason.trim() || undefined,
      actor: task.inspector || draft.inspector || '质检员',
      idempotencyKey: `${draft.code}:${key}:${task.revision}`,
    });
    applyProductionQualityApiResponse(response);
    showToast(`复检任务 ${task.code} 已判定，批次放行数量已按结果更新`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交返工复检失败，请稍后重试。', 'error');
  } finally {
    productionProcessSubmittingKey.value = '';
  }
}

async function submitProductionDisposition() {
  const draft = documentDraft.value;
  const task = currentProductionQualityTask.value;
  const issue = productionDispositionIssue();
  if (!draft || !task || issue) {
    if (issue) showToast(issue, 'error');
    return;
  }
  const input = productionDispositionDraft.value;
  const action = input.action as ProductionQualityDisposition['action'];
  const quantity = qualityQuantityAmount(input.quantity) ?? 0;
  productionDispositionSubmitting.value = true;
  try {
    const response = await disposeProductionQualityTask(draft.code, {
      action,
      quantity,
      reason: input.reason.trim(),
      approvedBy: input.approvedBy.trim() || undefined,
      actor: draft.inspector || '质检员',
      decisionVersion: productionDecisionVersion.value || Number(task.version || 0),
      dispositionVersion: productionDispositionFacts.value.length,
      idempotencyKey: `${draft.code}:dispose:${productionDispositionFacts.value.length + 1}:${action}:${quantity}`,
    });
    applyProductionQualityApiResponse(response);
    productionDispositionDraft.value = { action: '', quantity: '', reason: '', approvedBy: '' };
    showToast(`${productionDispositionActionLabel(response.disposition.action)}已执行，后续节点已按剩余数量更新`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交生产不合格处置失败，请稍后重试。', 'error');
  } finally {
    productionDispositionSubmitting.value = false;
  }
}

function activeQualityClosureKind(): QualityClosureKind | null {
  if (currentKind.value === 'patrol') return 'patrol';
  if (currentKind.value === 'defects') return 'defects';
  return null;
}

function createQualityInstanceToken() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function qualityClosureIdempotencyKey(action: string, code: string, revision = qualityClosureRevision.value) {
  const kind = activeQualityClosureKind() || 'quality';
  if (action === 'create' && (!code || code === 'new' || code === '系统自动生成')) {
    qualityCreateInstanceToken.value ||= createQualityInstanceToken();
    return `${kind}:create:${qualityCreateInstanceToken.value}`;
  }
  return `${kind}:${code}:${action}:${revision + 1}`;
}

function applyQualityClosureApiResponse(response: QualityClosureApiResponse) {
  const kind = activeQualityClosureKind();
  if (!kind) return documentDraft.value;
  const record = response.record;
  const seed = sourceRecord.value?.code === record.code
    ? cloneQualityDraft({ ...sourceRecord.value, kind } as QualityDocumentDraft)
    : undefined;
  const current = documentDraft.value || seed || createNewDraft(kind);
  const merged = cloneQualityDraft({
    ...(seed || {}),
    ...current,
    ...(record.draft || {}),
    code: record.code,
    kind,
    status: record.status,
  } as QualityDocumentDraft);
  qualityEditableDraft.value = merged;
  qualityClosureRevision.value = Number(record.revision || 0);
  statusOverrides.value = { ...statusOverrides.value, [record.code]: record.status };
  localAttachments.value = { ...localAttachments.value, [record.code]: response.attachments || record.attachments || [] };
  localFlowRecords.value = { ...localFlowRecords.value, [record.code]: response.flowRecords || [] };
  draftInteractionRevision.value += 1;
  return merged;
}

function isCurrentQualityRecordLoad(requestId: number, kind: QualityTabKey, code: string) {
  return requestId === qualityRecordLoadRequestId
    && currentKind.value === kind
    && route.params.code?.toString() === code;
}

function qualityRecordLoadErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return `${currentConfig.value.title}加载失败，请稍后重试。`;
}

async function loadQualityRuntimeRecord(code: string) {
  if (!code || code === '系统自动生成') return;
  const requestId = ++qualityRecordLoadRequestId;
  const kind = currentKind.value;
  qualityRecordLoading.value = true;
  qualityRecordNotFound.value = false;
  qualityRecordLoadMessage.value = '';
  qualityEditableDraft.value = null;
  try {
    if (kind === 'incoming') {
      const response = await getIncomingQualityRecord(code);
      if (!isCurrentQualityRecordLoad(requestId, kind, code)) return;
      const seed = sourceRecord.value;
      const draft = seed
        ? cloneQualityDraft({ ...seed, kind })
        : { ...createNewDraft('incoming'), code };
      qualityEditableDraft.value = draft;
      applyIncomingApiResponse(draft, response);
      return;
    }
    if (kind === 'production') {
      const response = await getProductionQualityTask(code);
      if (!isCurrentQualityRecordLoad(requestId, kind, code)) return;
      applyProductionQualityApiResponse(response);
      return;
    }
    const closureKind = kind as QualityClosureKind;
    const response = await getQualityClosure(closureKind, code);
    if (!isCurrentQualityRecordLoad(requestId, kind, code)) return;
    applyQualityClosureApiResponse(response);
  } catch (error) {
    if (!isCurrentQualityRecordLoad(requestId, kind, code)) return;
    qualityEditableDraft.value = null;
    qualityRecordNotFound.value = error instanceof ApiError && error.status === 404;
    qualityRecordLoadMessage.value = qualityRecordNotFound.value ? '' : qualityRecordLoadErrorMessage(error);
  } finally {
    if (isCurrentQualityRecordLoad(requestId, kind, code)) {
      qualityRecordLoading.value = false;
      if (qualityEditableDraft.value && !isQualityReadOnly.value) {
        await nextTick();
        resetUnsavedChanges();
      }
    }
  }
}

function retryQualityRuntimeRecord() {
  const code = route.params.code?.toString() ?? '';
  if (code) void loadQualityRuntimeRecord(code);
}

watch(
  () => [route.fullPath, route.name, currentKind.value, sourceRecord.value?.code ?? ''],
  () => {
    qualityRecordLoadRequestId += 1;
    qualityRecordLoading.value = false;
    qualityRecordNotFound.value = false;
    qualityRecordLoadMessage.value = '';
    qualityValidationAttempted.value = false;
    moreActionsOpen.value = false;
    incomingDispositionFacts.value = [];
    incomingDispositionDrafts.value = {};
    incomingDispositionSubmittingLine.value = '';
    incomingReinspectionFacts.value = [];
    incomingReturnDocumentFacts.value = [];
    incomingReinspectionCreateDrafts.value = {};
    incomingReinspectionCompleteDrafts.value = {};
    incomingReinspectionSubmittingKey.value = '';
    productionDispositionFacts.value = [];
    productionDispositionDraft.value = { action: '', quantity: '', reason: '', approvedBy: '' };
    productionDispositionSubmitting.value = false;
    productionReworkFacts.value = [];
    productionReinspectionFacts.value = [];
    productionReworkDraft.value = { quantity: '', reason: '', assignee: '' };
    productionReworkCompletionDrafts.value = {};
    productionReinspectionDrafts.value = {};
    productionProcessSubmittingKey.value = '';
    productionDecisionVersion.value = 0;
    qualityClosureRevision.value = 0;
    draftInteractionRevision.value = 0;
    if (isNew.value) {
      qualityCreateInstanceToken.value = createQualityInstanceToken();
      const draft = createNewDraft(currentKind.value);
      qualityEditableDraft.value = draft;
      if (draft.kind === 'incoming' && draft.sourceDoc) void hydrateIncomingReceipt(draft);
      void nextTick().then(() => resetUnsavedChanges());
      void loadRuntimeQualityStandardsForEditor();
      void loadRuntimeQualityReferenceCodes();
      return;
    }
    qualityCreateInstanceToken.value = '';
    const routeCode = route.params.code?.toString() ?? '';
    qualityEditableDraft.value = null;
    if (routeCode) void loadQualityRuntimeRecord(routeCode);
    void loadRuntimeQualityStandardsForEditor();
    void loadRuntimeQualityReferenceCodes();
  },
  { immediate: true },
);

watch(
  () => [
    route.fullPath,
    productionReworkFacts.value.map((task) => `${task.code}:${task.status}`).join('|'),
    productionReinspectionFacts.value.map((task) => `${task.code}:${task.status}`).join('|'),
    incomingReinspectionFacts.value.map((task) => `${incomingReinspectionCode(task)}:${incomingReinspectionIsComplete(task)}`).join('|'),
  ],
  () => {
    const focus = route.query.focus?.toString() as QualityDetailFocus | undefined;
    if (!focus || !['disposition', 'rework', 'reinspection'].includes(focus)) return;
    if (qualityAutoFocusKey.value === route.fullPath) return;
    focusQualityDetailSection(focus, true);
  },
  { flush: 'post' },
);

function itemVisual(name: string) {
  const palettes = [
    { test: 'PETG', label: 'PETG', tone: '#dcefe8' },
    { test: 'PLA', label: 'PLA', tone: '#e7ead7' },
    { test: 'ABS', label: 'ABS', tone: '#e5e9f2' },
    { test: '色母', label: '色母', tone: '#eee3da' },
    { test: '线轴', label: '线轴', tone: '#e5edf1' },
    { test: '标签', label: '标签', tone: '#eee8d6' },
    { test: '粒子', label: '原料', tone: '#e4efe2' },
  ];
  const matched = palettes.find((item) => name.includes(item.test));
  if (matched) return { label: matched.label, tone: matched.tone };

  const match = name.match(/[A-Za-z0-9]+/g);
  const label = match?.[0]?.slice(0, 4).toUpperCase() || 'QC';
  return { label, tone: '#e8efe5' };
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function primaryTransition(status: string) {
  if (currentKind.value === 'patrol') {
    if (status === '待巡检') {
      if (productionCheckpointStats.value.completed < productionCheckpointStats.value.total) {
        return { label: '提交巡检', next: '已关闭', remark: '完成全部检查项后，系统再按异常结果决定关闭或进入整改。' };
      }
      return patrolHasFinding.value
        ? { label: '提交巡检', next: '待整改', remark: '巡检已完成，异常项进入现场整改。' }
        : { label: '完成巡检', next: '已关闭', remark: '巡检完成且未发现异常，单据关闭。' };
    }
    if (status === '待整改') return { label: '提交整改', next: '待复查', remark: '现场整改已提交，等待质量复查。' };
    if (status === '待复查') return { label: '复查通过', next: '已关闭', remark: '整改复查通过，巡检关闭。' };
    return undefined;
  }
  if (currentKind.value === 'defects') {
    if (status === '待处理') return { label: '开始处置', next: '处置中', remark: '处置方案已确认，进入执行阶段。' };
    if (['处置中', '返工中', '供应商确认'].includes(status)) {
      return { label: '提交验证', next: '待验证', remark: '处置已执行，等待验证结果和影响关闭条件。' };
    }
    if (['待验证', '待复判'].includes(status)) return { label: '验证通过', next: '已关闭', remark: '处置结果验证通过，不良记录关闭。' };
    return undefined;
  }
  if (status === '待巡检') return { label: '完成巡检', next: '已关闭', remark: '巡检完成，无异常则直接归档。' };
  if (status === '待整改') return { label: '提交整改', next: '待复查', remark: '现场整改已提交，等待质量复查。' };
  if (status === '待复查') return { label: '复查通过', next: '已关闭', remark: '整改复查通过，巡检关闭。' };
  if (status === '待检验') return { label: '完成检验', next: '合格', remark: '检验完成并判定合格。' };
  if (status === '待复判') return { label: '复判放行', next: '合格', remark: '复判后允许放行。' };
  if (status === '不合格') return { label: '转不良处理', next: '待处理', remark: '质检不合格，进入不良处理。' };
  if (status === '待处理') return { label: '提交处置', next: '供应商确认', remark: '不良处置方案已提交确认。' };
  if (status === '返工中') return { label: '返工完成', next: '待复判', remark: '返工完成，等待复检复判。' };
  if (status === '供应商确认') return { label: '关闭不良', next: '已关闭', remark: '不良处理已完成并关闭。' };
  return undefined;
}

function runPrimaryAction() {
  if (!documentDraft.value || !primaryAction.value) return;
  if (!canWriteQuality.value) {
    showToast(qualityReadonlyReason.value, 'error');
    return;
  }
  void router.push(editPath.value);
}

async function runAlternativeClosureAction() {
  const draft = documentDraft.value;
  const action = qualityAlternativeAction.value;
  const kind = activeQualityClosureKind();
  if (!draft || !action || !kind) return;
  if (!canWriteQuality.value) {
    showToast(qualityReadonlyReason.value, 'error');
    return;
  }
  if (isDetail.value) {
    await router.push({ path: editPath.value, query: { action: action.key } });
    return;
  }
  qualityValidationAttempted.value = true;
  const missing = qualityMissingSubmitFields(draft);
  if (missing.length) {
    showToast(missingSubmitSummary(missing), 'error');
    scrollToFirstValidationError();
    return;
  }
  qualityValidationAttempted.value = false;
  qualitySubmitting.value = true;
  try {
    const response = await transitionQualityClosure(kind, draft.code, {
      nextStatus: action.next,
      action: action.label,
      remark: action.remark,
      draft: JSON.parse(JSON.stringify(draft)) as Record<string, unknown>,
      attachments: localAttachments.value[draft.code] || [],
      actor: draft.inspector || draft.operator || draft.leader || '质量负责人',
      revision: qualityClosureRevision.value,
      idempotencyKey: qualityClosureIdempotencyKey(`transition-${action.key}`, draft.code),
    });
    applyQualityClosureApiResponse(response);
    resetUnsavedChanges();
    if (response.linkedDefect) {
      showToast(`${draft.code} 已升级为不良记录 ${response.linkedDefect.code}。`);
      await router.replace(`/quality/defects/${encodeURIComponent(response.linkedDefect.code)}`);
    } else {
      showToast(`${draft.code} 已${action.label}，返回处置阶段。`);
      await router.replace(`/quality/${currentSlug.value}/${encodeURIComponent(draft.code)}`);
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${action.label}失败。`, 'error');
  } finally {
    qualitySubmitting.value = false;
  }
}

function runQualityFollowupAction() {
  if (!qualityFollowupAction.value?.path) return;
  if (!canWriteQuality.value) {
    showToast(qualityReadonlyReason.value, 'error');
    return;
  }
  void router.push(qualityFollowupAction.value.path);
}

function handleMoreAction(action: QualityMoreAction) {
  if (action.disabled) return;
  moreActionsOpen.value = false;
  router.push(editPath.value);
}

async function saveDocument() {
  if (qualitySaveActionDisabled.value) {
    showToast(qualitySaveActionTitle.value, 'error');
    return;
  }
  const draft = documentDraft.value;
  if (!draft) return;
  if (['patrol', 'defects'].includes(currentKind.value)) {
    const kind = activeQualityClosureKind();
    if (!kind) return;
    qualitySaving.value = true;
    try {
      const serializedDraft = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
      const actor = draft.inspector || draft.operator || draft.leader || '质量负责人';
      const attachments = localAttachments.value[draft.code] || [];
      const response = !draft.code || draft.code === '系统自动生成'
        ? await createQualityClosure(kind, {
            draft: serializedDraft,
            attachments,
            actor,
            idempotencyKey: qualityClosureIdempotencyKey('create', draft.code || 'new', 0),
          })
        : await saveQualityClosure(kind, draft.code, {
            draft: serializedDraft,
            attachments,
            actor,
            revision: qualityClosureRevision.value,
            idempotencyKey: qualityClosureIdempotencyKey('save', draft.code),
          });
      if (!draft.code || draft.code === '系统自动生成') qualityCreateInstanceToken.value = '';
      const saved = applyQualityClosureApiResponse(response);
      if (saved && sourceRecord.value?.code === saved.code) Object.assign(sourceRecord.value, cloneQualityDraft(saved));
      resetUnsavedChanges();
      showToast(`${currentConfig.value.title}已保存，修订号 ${response.record.revision}。`);
      if (isNew.value && saved) {
        await router.replace(`/quality/${currentSlug.value}/${encodeURIComponent(saved.code)}/edit`);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : `${currentConfig.value.title}保存失败。`, 'error');
    } finally {
      qualitySaving.value = false;
    }
    return;
  }
  if (currentKind.value !== 'incoming') return;
  if (!draft.code || draft.code === '系统自动生成') {
    showToast('来源收货尚未生成来料质检任务，暂时不能保存草稿。', 'error');
    return;
  }

  qualitySaving.value = true;
  try {
    const response = await saveIncomingQualityDraft(draft.code, incomingDraftPayload(draft));
    applyIncomingApiResponse(draft, response);
    resetUnsavedChanges();
    showToast('来料质检草稿已保存');
    if (isNew.value) {
      await router.replace({
        path: `/quality/incoming/${encodeURIComponent(draft.code)}/edit`,
        query: draft.sourceDoc ? { source: draft.sourceDoc } : undefined,
      });
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '来料质检草稿保存失败。', 'error');
  } finally {
    qualitySaving.value = false;
  }
}

function handleQualityAttachmentUpload(event: Event) {
  const draft = documentDraft.value;
  const input = event.target as HTMLInputElement;
  if (isQualityReadOnly.value) {
    input.value = '';
    showToast(qualityAttachmentTitle.value, 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!draft || !files.length) return;
  localAttachments.value = {
    ...localAttachments.value,
    [draft.code]: [...(localAttachments.value[draft.code] ?? []), ...files],
  };
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，保存后随${currentConfig.value.title}保留。`);
}

function incomingTargetStatus(draft: QualityDocumentDraft) {
  const totals = draft.products.reduce(
    (sum, line) => ({
      received: sum.received + (qualityQuantityAmount(line.qty) ?? 0),
      qualified: sum.qualified + (qualityQuantityAmount(line.qualifiedQty) ?? 0),
      rejected: sum.rejected + (qualityQuantityAmount(line.rejectedQty) ?? 0),
      concession: sum.concession + (qualityQuantityAmount(line.concessionQty) ?? 0),
    }),
    { received: 0, qualified: 0, rejected: 0, concession: 0 },
  );
  const released = totals.qualified + totals.concession;
  const pending = Math.max(0, totals.received - released - totals.rejected);
  if (pending > 0) return released > 0 || totals.rejected > 0 ? '部分判定' : '待检验';
  if (totals.rejected > 0 && released > 0) return '部分放行';
  if (totals.rejected > 0) return '不合格';
  if (totals.concession > 0) return '让步接收';
  return '合格';
}

async function submitDocument() {
  const draft = documentDraft.value;
  if (!draft) return;
  if (qualitySubmitActionDisabled.value) {
    showToast(qualitySubmitActionTitle.value, 'error');
    return;
  }
  synchronizePatrolSubmissionFacts(draft);
  qualityValidationAttempted.value = true;
  const missing = qualityMissingSubmitFields(draft);
  if (missing.length) {
    showToast(missingSubmitSummary(missing), 'error');
    scrollToFirstValidationError();
    return;
  }
  qualityValidationAttempted.value = false;
  if (['patrol', 'defects'].includes(currentKind.value)) {
    const transition = primaryTransition(currentStatus.value);
    if (!transition) {
      showToast(`${currentConfig.value.title}当前状态没有可执行的提交动作。`, 'error');
      return;
    }
    qualitySubmitting.value = true;
    try {
      const kind = activeQualityClosureKind();
      if (!kind) throw new Error('质量处理类型无效。');
      let persistedDraft = draft;
      if (!persistedDraft.code || persistedDraft.code === '系统自动生成') {
        const created = await createQualityClosure(kind, {
          draft: JSON.parse(JSON.stringify(persistedDraft)) as Record<string, unknown>,
          attachments: localAttachments.value[persistedDraft.code] || [],
          actor: persistedDraft.inspector || persistedDraft.operator || persistedDraft.leader || '质量负责人',
          idempotencyKey: qualityClosureIdempotencyKey('create', persistedDraft.code || 'new', 0),
        });
        qualityCreateInstanceToken.value = '';
        persistedDraft = applyQualityClosureApiResponse(created) || persistedDraft;
      }
      const response = await transitionQualityClosure(kind, persistedDraft.code, {
        nextStatus: transition.next,
        action: transition.label,
        remark: transition.remark,
        draft: JSON.parse(JSON.stringify(persistedDraft)) as Record<string, unknown>,
        attachments: localAttachments.value[persistedDraft.code] || [],
        actor: persistedDraft.inspector || persistedDraft.operator || persistedDraft.leader || '质量负责人',
        revision: qualityClosureRevision.value,
        idempotencyKey: qualityClosureIdempotencyKey(`transition-${transition.next}`, persistedDraft.code),
      });
      const submitted = applyQualityClosureApiResponse(response);
      if (submitted && sourceRecord.value?.code === submitted.code) Object.assign(sourceRecord.value, cloneQualityDraft(submitted));
      resetUnsavedChanges();
      showToast(`${response.record.code} 已${transition.label}，进入${response.record.status}。`);
      await router.replace(`/quality/${currentSlug.value}/${encodeURIComponent(response.record.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : `${currentConfig.value.title}提交失败。`, 'error');
    } finally {
      qualitySubmitting.value = false;
    }
    return;
  }
  const results = draft.products.map((line) => line.result).filter(Boolean);
  const passedResults = new Set(['合格', '让步接收', '免检放行']);
  const targetStatus = currentKind.value === 'incoming'
    ? incomingTargetStatus(draft)
    : results.some((result) => result === '不合格')
      ? '不合格'
      : results.length && results.every((result) => passedResults.has(result))
        ? '合格'
        : currentKind.value === 'patrol'
          ? '待整改'
          : '待复判';

  qualitySubmitting.value = true;
  try {
    let resolvedStatus = targetStatus;
    if (currentKind.value === 'incoming') {
      if (!draft.code || draft.code === '系统自动生成') {
        throw new Error('来源收货尚未生成来料质检任务，不能提交判定。');
      }
      const response = await submitIncomingQualityDecision(draft.code, incomingDecisionPayload(draft));
      applyIncomingApiResponse(draft, response);
      resolvedStatus = response.record?.status
        || response.decision?.status
        || response.decision?.result
        || targetStatus;
    } else if (currentKind.value === 'production') {
      const task = production2QualityTasks.find((item) => item.code === draft.code);
      if (!task) throw new Error('生产质检任务尚未从服务端加载，请刷新后重试。');
      const result = targetStatus === '合格' || targetStatus === '不合格' ? targetStatus : '部分合格';
      const quantity = Number(task.quantity || 0);
      const failedQty = qualityQuantityAmount(draft.products[0]?.failedQty) ?? 0;
      const sampleDefectQty = task.kind === '入库抽检' ? failedQty : undefined;
      if (task.kind === '入库抽检') {
        const sampleQuantity = qualityQuantityAmount(draft.products[0]?.sampleQty) ?? 0;
        if (failedQty > sampleQuantity + 0.0001) {
          throw new Error(`样本不良数量不能超过抽检数量 ${draft.products[0]?.sampleQty || '0'}。`);
        }
        if (result === '合格' && failedQty > 0.0001) {
          throw new Error('样本存在不良时不能整批判定合格，请判定不合格并冻结整批。');
        }
      }
      const rejectedQty = task.kind === '开机首检'
        ? 0
        : task.kind === '入库抽检'
          ? (result === '合格' ? 0 : quantity)
        : result === '合格'
          ? 0
          : result === '不合格'
            ? quantity
            : Math.min(Math.max(failedQty, 0), quantity);
      const acceptedQty = task.kind === '开机首检' ? 0 : Math.max(0, quantity - rejectedQty);
      if (result === '部分合格' && (acceptedQty <= 0 || rejectedQty <= 0)) {
        throw new Error(`部分合格时请在不合格数量中填写 0 到 ${quantity} 之间的数量。`);
      }
      const response = await decideProductionQualityTask(draft.code, {
        result,
        acceptedQty,
        rejectedQty,
        sampleDefectQty,
        checkpointResults: (draft.products[0]?.inspectionItems || []).map((item) => ({
          name: item.name,
          standard: item.standard,
          actual: item.actual.trim(),
          result: item.result as '合格' | '不合格',
          note: String(item.note || '').trim(),
        })),
        version: Number(task.version || draft.version || 0),
        actor: draft.inspector || '质检员',
        remark: [draft.conclusion, draft.disposition, draft.note].filter(Boolean).join('；'),
        disposition: draft.disposition,
        conclusion: draft.conclusion,
        idempotencyKey: `${draft.code}:decision:${Number(task.version || draft.version || 0) + 1}`,
      });
      const record = applyProductionQualityApiResponse(response);
      resolvedStatus = record.status;
    }
    statusOverrides.value = { ...statusOverrides.value, [draft.code]: resolvedStatus };
    resetUnsavedChanges();
    showToast(
      currentKind.value === 'incoming'
        ? `${currentConfig.value.title}已提交为${qualityResultLabel(resolvedStatus)}，数量结论已同步到来源收货`
        : `${currentConfig.value.title}已提交为${qualityResultLabel(resolvedStatus)}，结论已同步到生产批次`,
    );
    await router.replace({
      path: `/quality/${currentSlug.value}/${encodeURIComponent(draft.code)}`,
      query: qualityRouteContextQuery(draft.sourceDoc),
    });
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交质检判定失败，请稍后重试。', 'error');
  } finally {
    qualitySubmitting.value = false;
  }
}

function addQualityLine() {
  const draft = documentDraft.value;
  if (!draft || isDetail.value || isLocked.value) return;
  const standard = currentKind.value === 'production' ? productionStandardFor(draft.sourceType, draft.qualityStandardCode) : currentKind.value === 'patrol' ? patrolStandard(draft.qualityStandardCode) : undefined;
  draft.products.push(createQualityLine(currentKind.value, standard));
  markDraftInteraction();
  showToast(`已添加第 ${draft.products.length} 条${currentConfig.value.lineTitle}`);
}

function removeQualityLine(index: number) {
  const draft = documentDraft.value;
  if (!draft || isDetail.value || isLocked.value) return;
  if (draft.products.length <= 1) {
    showToast('至少保留一条明细', 'error');
    return;
  }
  draft.products.splice(index, 1);
  markDraftInteraction();
  showToast(`已删除第 ${index + 1} 条${currentConfig.value.lineTitle}`);
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2200);
}
</script>

<template>
  <div class="page-stack">
    <DocumentLoadState
      v-if="qualityRecordLoading || qualityRecordNotFound || qualityRecordLoadMessage"
      :loading="qualityRecordLoading"
      :title="currentConfig.title"
      :state="qualityRecordNotFound ? 'not-found' : 'error'"
      :message="qualityRecordNotFound ? '' : qualityRecordLoadMessage"
      :back-path="backPath"
      :back-label="`返回${currentConfig.title}`"
      @retry="retryQualityRuntimeRecord"
    />
    <section
      v-else-if="documentDraft"
      class="quote-editor quality-document-editor"
      :class="{
        'is-detail-mode': isDetail,
        'is-detail-view': isDetail,
        'has-attachment-only-summary': !isDetail,
      }"
    >
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="backPath" :aria-label="activeBackLabel" :title="activeBackLabel">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? documentDraft.code : pageHeading }}</strong>
        </template>

        <template #actions>
          <div class="quote-editor-actions">
          <template v-if="isDetail">
            <PinReferenceButton
              v-if="referencePath"
              class="topbar-optional-action"
              :title="referenceTitle"
              :subtitle="referenceSubtitle"
              :path="referencePath"
            />
            <button class="secondary-action topbar-optional-action" type="button" :title="`查看${currentConfig.title}流转日志`" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div class="order-more-action-wrap" @keydown.esc.stop="moreActionsOpen = false" @mouseleave="moreActionsOpen = false">
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="moreActionsOpen"
                @click="moreActionsOpen = !moreActionsOpen"
              >
                更多
              </button>
              <div v-if="moreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in qualityMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :disabled="action.disabled"
                  :title="action.disabled ? action.disabledReason : action.description"
                  @click="handleMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.disabled ? action.disabledReason : action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="qualityAlternativeAction"
              class="secondary-action quality-alternative-action"
              type="button"
              :disabled="!canWriteQuality || qualitySubmitting"
              :title="canWriteQuality ? qualityAlternativeAction.remark : qualityReadonlyReason"
              @click="runAlternativeClosureAction"
            >
              {{ qualityAlternativeAction.label }}
            </button>
            <button
              v-if="qualityFollowupAction?.path"
              class="primary-action"
              type="button"
              :disabled="!canWriteQuality"
              :title="canWriteQuality ? qualityFollowupAction.description : qualityReadonlyReason"
              @click="runQualityFollowupAction"
            >
              <Send :size="15" />
              {{ qualityFollowupAction.label }}
            </button>
            <button
              v-else-if="primaryAction"
              class="primary-action"
              type="button"
              :disabled="!canWriteQuality || !primaryAction"
              :title="qualityPrimaryActionTitle"
              @click="runPrimaryAction"
            >
              <Send :size="15" />
              {{ primaryActionLabel }}
            </button>
          </template>

          <template v-else-if="!isLocked">
            <button
              v-if="currentKind !== 'production'"
              class="secondary-action"
              type="button"
              :disabled="qualitySaveActionDisabled"
              :title="qualitySaveActionTitle"
              @click="saveDocument"
            >
              <Save :size="15" />
              {{ qualitySaving ? '保存中' : '保存' }}
            </button>
            <button
              v-if="qualityAlternativeAction"
              class="secondary-action quality-alternative-action"
              type="button"
              :disabled="qualitySubmitActionDisabled"
              :title="qualityAlternativeAction.remark"
              @click="runAlternativeClosureAction"
            >
              {{ qualitySubmitting ? '提交中' : qualityAlternativeAction.label }}
            </button>
            <button
              class="primary-action"
              type="button"
              :disabled="qualitySubmitActionDisabled"
              :title="qualitySubmitActionTitle"
              @click="submitDocument"
            >
              <Send :size="15" />
              {{ qualitySubmitting ? '提交中' : ['incoming', 'production'].includes(currentKind) ? '提交判定' : primaryActionLabel }}
            </button>
          </template>

          <template v-else>
            <button class="secondary-action" type="button" disabled :title="qualitySaveActionTitle">
              <Pencil :size="15" />
              已锁定
            </button>
          </template>
          </div>
        </template>

        <template #fallback>
          <div class="quote-editor-header">
            <div>
              <h1>{{ pageHeading }}</h1>
            </div>
          </div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner
        v-if="!canWriteQuality"
        :message="qualityReadonlyReason"
        suffix="当前质检单据仅可查看，不能编辑、保存或提交。"
      />
      <div v-else-if="qualityStandardDependencyMessage" class="quality-standard-runtime-guard" role="status">
        <OperationPermissionBanner
          title="质检标准尚未就绪"
          :message="qualityStandardDependencyMessage"
          suffix="服务端标准确认前不会建立或提交质检记录。"
        />
        <button
          v-if="runtimeQualityStandardsError"
          class="secondary-action compact-action"
          type="button"
          title="重新读取质检标准"
          @click="loadRuntimeQualityStandardsForEditor"
        >
          重试
        </button>
      </div>

      <section v-if="isDetail" class="order-next-step-strip" :class="`tone-${nextStepGuidance.tone}`">
        <div>
          <span>{{ nextStepGuidance.tone === 'tracking' ? '流转结果' : '当前待办' }}</span>
          <strong>{{ nextStepGuidance.label }}</strong>
          <p>{{ nextStepGuidance.description }}</p>
        </div>
        <button
          v-if="qualityInlineFocusAction"
          class="next-step-action"
          type="button"
          @click="focusQualityDetailSection(qualityInlineFocusAction.focus)"
        >
          {{ qualityInlineFocusAction.label }}
        </button>
        <b v-else>{{ nextStepGuidance.action }}</b>
      </section>

      <section
        v-if="productionQualityImpact"
        class="production-quality-impact"
        :class="`tone-${productionQualityImpact.tone}`"
        aria-label="本次质检判定影响"
      >
        <div class="production-quality-impact-copy">
          <span>判定影响</span>
          <strong>{{ productionQualityImpact.title }}</strong>
          <p>{{ productionQualityImpact.description }}</p>
        </div>
        <dl>
          <div v-for="fact in productionQualityImpact.facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections" :class="{ 'incoming-quality-sections': currentKind === 'incoming' }">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid quality-detail-fact-grid">
              <div v-for="(fact, index) in qualityDetailFacts" :key="fact.label" :class="qualityDetailFactClass(fact, index)">
                <dt>{{ fact.label }}</dt>
                <dd>
                  <RouterLink v-if="fact.path" class="quality-fact-link" :to="fact.path">{{ fact.value }}</RouterLink>
                  <template v-else>{{ fact.value }}</template>
                </dd>
              </div>
            </dl>

            <div v-else class="quote-fields">
              <label class="form-field">
                <span>{{ currentConfig.codeLabel }}</span>
                <input :value="documentDraft.code" type="text" readonly />
              </label>
              <label class="form-field">
                <span :class="qualityRequiredLabelClass(sourceTypeFieldLabel, qualitySourceFactsLocked)">{{ sourceTypeFieldLabel }}</span>
                <select v-if="!isQualityReadOnly && currentKind === 'production' && !productionSourceFactsLocked" v-model="documentDraft.sourceType" @change="handleProductionTypeChange">
                  <option v-for="type in productionQualityTypes" :key="type" :value="type">{{ type }}</option>
                </select>
                <select v-else-if="!isQualityReadOnly && currentKind !== 'production' && !patrolInspectionFactsLocked && !incomingSourceFactsLocked && !defectEvidenceLocked" v-model="documentDraft.sourceType" @change="handleQualitySourceTypeChange">
                  <option v-if="currentKind === 'defects'" value="">请选择{{ sourceTypeFieldLabel }}</option>
                  <option v-for="type in qualitySourceTypeOptions()" :key="type" :value="type">{{ type }}</option>
                </select>
                <input v-else :value="documentDraft.sourceType" type="text" readonly />
              </label>
              <label v-if="['production', 'patrol', 'incoming'].includes(currentKind)" class="form-field" :class="{ 'full-field': currentKind === 'incoming' }">
                <span :class="qualityRequiredLabelClass('质检标准', qualitySourceFactsLocked)">质检标准</span>
                <input
                  v-if="currentKind === 'incoming'"
                  :value="[documentDraft.qualityStandardCode, documentDraft.qualityStandardName].filter(Boolean).join(' · ') || '-'"
                  type="text"
                  readonly
                />
                <input
                  v-else-if="productionSourceFactsLocked"
                  :value="[documentDraft.qualityStandardCode, documentDraft.qualityStandardName].filter(Boolean).join(' · ') || '-'"
                  type="text"
                  readonly
                />
                <select
                  v-else
                  v-model="documentDraft.qualityStandardCode"
                  :disabled="isQualityReadOnly || patrolInspectionFactsLocked || Boolean(qualityStandardDependencyMessage)"
                  @change="handleProductionStandardChange"
                >
                  <option value="">
                    {{ runtimeQualityStandardsLoading ? '正在读取服务端标准' : productionStandardOptions.length ? '请选择质检标准' : '暂无可用质检标准' }}
                  </option>
                  <option v-for="standard in productionStandardOptions" :key="standard.code" :value="standard.code">
                    {{ standard.inspectionType }} · {{ standard.name }}
                  </option>
                </select>
              </label>
              <label class="form-field">
                <span :class="qualityRequiredLabelClass(sourceDocFieldLabel, qualitySourceFactsLocked)">{{ sourceDocFieldLabel }}</span>
                <ReferencePicker
                  v-if="!isQualityReadOnly && currentKind === 'incoming' && !incomingSourceFactsLocked"
                  required
                  v-model="documentDraft.sourceDoc"
                  type="purchase-receipts"
                  title="选择采购收货单"
                  placeholder="选择采购收货单"
                  search-placeholder="搜索采购收货单、采购单、供应商或仓库"
                  :display-value="documentDraft.sourceDoc"
                  hide-meta
                  @select="handleIncomingQualitySourceSelect"
                />
                <select
                  v-else-if="!isQualityReadOnly && currentKind !== 'incoming' && !productionSourceFactsLocked && !patrolInspectionFactsLocked && !defectEvidenceLocked && (qualitySourceDocOptions().length > 1 || (currentKind === 'defects' && ['', '来料质检', '生产质检', '质量巡检'].includes(documentDraft.sourceType)))"
                  v-model="documentDraft.sourceDoc"
                  :disabled="currentKind === 'defects' && !documentDraft.sourceType"
                  @change="handleQualitySourceDocChange"
                >
                  <option value="">请选择{{ sourceDocFieldLabel }}</option>
                  <option v-for="source in qualitySourceDocOptions()" :key="source" :value="source">{{ source }}</option>
                </select>
                <input v-else v-model="documentDraft.sourceDoc" type="text" :readonly="isQualityReadOnly || patrolInspectionFactsLocked || qualitySourceFactsLocked" :placeholder="`选择${sourceDocFieldLabel}`" />
              </label>
              <label class="form-field">
                <span :class="qualityRequiredLabelClass(currentConfig.partyLabel, qualitySourceFactsLocked)">{{ currentConfig.partyLabel }}</span>
                <ReferencePicker
                  v-if="!isQualityReadOnly && currentKind === 'incoming' && !incomingSourceFactsLocked"
                  required
                  v-model="documentDraft.party"
                  type="suppliers"
                  title="选择供应商"
                  placeholder="选择供应商"
                  search-placeholder="搜索供应商编码、名称、联系人或电话"
                  :display-value="documentDraft.party"
                  hide-meta
                  @select="handleQualityPartySelect"
                />
                <select
                  v-else-if="!isQualityReadOnly && !productionSourceFactsLocked && !patrolInspectionFactsLocked && (currentKind === 'production' || currentKind === 'patrol')"
                  v-model="documentDraft.party"
                  @change="currentKind === 'patrol' ? handlePatrolLocationChange() : markDraftInteraction()"
                >
                  <option value="">请选择{{ currentConfig.partyLabel }}</option>
                  <option v-for="line in currentKind === 'patrol' ? patrolLocationOptions() : productionLineOptions()" :key="line" :value="line">{{ line }}</option>
                </select>
                <input v-else v-model="documentDraft.party" type="text" :readonly="isQualityReadOnly || patrolInspectionFactsLocked || qualitySourceFactsLocked" />
              </label>
              <label v-if="currentKind === 'patrol' && (!isDetail || Boolean(documentDraft.contact))" class="form-field">
                <span>{{ contactFieldLabel(currentKind) }}</span>
                <input v-model="documentDraft.contact" type="text" :readonly="isQualityReadOnly || incomingSourceFactsLocked || defectEvidenceLocked || (currentKind === 'patrol' && !patrolResponsibilityEditable)" />
              </label>
              <label class="form-field">
                <span :class="qualityRequiredLabelClass(currentConfig.ownerLabel, defectPlanLocked)">{{ currentConfig.ownerLabel }}</span>
                <ReferencePicker
                  v-if="!isQualityReadOnly && !patrolInspectionFactsLocked && !defectPlanLocked"
                  required
                  v-model="documentDraft.inspector"
                  type="employees"
                  :title="`选择${currentConfig.ownerLabel}`"
                  :placeholder="`选择${currentConfig.ownerLabel}`"
                  search-placeholder="搜索员工姓名、部门、手机号或邮箱"
                  :display-value="documentDraft.inspector"
                  hide-meta
                  @select="handleQualityEmployeeSelect('inspector', $event)"
                />
                <input v-else :value="documentDraft.inspector" type="text" readonly />
              </label>
              <label class="form-field">
                <span :class="qualityRequiredLabelClass(currentConfig.dateLabel, qualitySourceFactsLocked)">{{ currentConfig.dateLabel }}</span>
                <input v-model="documentDraft.date" type="date" :readonly="isQualityReadOnly || patrolInspectionFactsLocked || qualitySourceFactsLocked" />
              </label>
              <label class="form-field">
                <span :class="qualityRequiredLabelClass('要求完成', (qualitySourceFactsLocked && currentKind !== 'defects') || defectPlanLocked)">要求完成</span>
                <input v-model="documentDraft.dueDate" type="date" :readonly="isQualityReadOnly || (qualitySourceFactsLocked && currentKind !== 'defects') || defectPlanLocked || (currentKind === 'patrol' && !patrolResponsibilityEditable)" />
              </label>
              <label
                v-if="currentKind !== 'patrol'
                  && (currentKind !== 'production' || documentDraft.warehouse !== documentDraft.party)
                  && !(currentKind === 'defects'
                    && defectEvidenceLocked
                    && ['待处理区', '-', ''].includes(String(documentDraft.warehouse || '').trim()))"
                class="form-field"
              >
                <span :class="qualityRequiredLabelClass(warehouseFieldLabel(currentKind), qualitySourceFactsLocked)">{{ warehouseFieldLabel(currentKind) }}</span>
                <ReferencePicker
                  v-if="!isQualityReadOnly && !qualitySourceFactsLocked"
                  required
                  v-model="documentDraft.warehouse"
                  type="warehouses"
                  :title="`选择${warehouseFieldLabel(currentKind)}`"
                  :placeholder="`选择${warehouseFieldLabel(currentKind)}`"
                  search-placeholder="搜索仓库编码、名称、类型或地址"
                  :display-value="documentDraft.warehouse"
                  hide-meta
                  @select="handleQualityWarehouseSelect"
                />
                <input v-else v-model="documentDraft.warehouse" type="text" readonly />
              </label>
              <template v-if="currentKind === 'production'">
                <label class="form-field">
                  <span :class="qualityRequiredLabelClass('生产工单', productionSourceFactsLocked)">生产工单</span>
                  <select v-if="!isQualityReadOnly && !productionSourceFactsLocked" v-model="documentDraft.workOrder" @change="handleQualityWorkOrderChange">
                    <option value="">请选择生产工单</option>
                    <option v-for="workOrder in qualityWorkOrderOptions()" :key="workOrder" :value="workOrder">{{ workOrder }}</option>
                  </select>
                  <input v-else v-model="documentDraft.workOrder" type="text" readonly />
                </label>
                <label v-if="documentDraft.executionCard && documentDraft.executionCard !== documentDraft.sourceDoc" class="form-field">
                  <span :class="qualityRequiredLabelClass('生产批次', productionSourceFactsLocked)">生产批次</span>
                  <select v-if="!isQualityReadOnly && !productionSourceFactsLocked" v-model="documentDraft.executionCard" @change="handleQualityExecutionCardChange">
                    <option value="">请选择生产批次</option>
                    <option v-for="card in qualityExecutionCardOptions()" :key="card" :value="card">{{ card }}</option>
                  </select>
                  <input v-else v-model="documentDraft.executionCard" type="text" readonly />
                </label>
                <label v-if="documentDraft.reportBatch && documentDraft.reportBatch !== documentDraft.sourceDoc && documentDraft.reportBatch !== documentDraft.executionCard" class="form-field">
                  <span :class="qualityRequiredLabelClass(batchFieldLabel(documentDraft.sourceType), productionSourceFactsLocked)">{{ batchFieldLabel(documentDraft.sourceType) }}</span>
                  <select v-if="!isQualityReadOnly && !productionSourceFactsLocked" v-model="documentDraft.reportBatch" @change="handleQualityReportBatchChange">
                    <option value="">请选择{{ batchFieldLabel(documentDraft.sourceType) }}</option>
                    <option v-for="batch in qualityReportBatchOptions()" :key="batch" :value="batch">{{ batch }}</option>
                  </select>
                  <input v-else v-model="documentDraft.reportBatch" type="text" readonly />
                </label>
                <label class="form-field">
                  <span :class="qualityRequiredLabelClass('责任班次', productionSourceFactsLocked)">责任班次</span>
                  <input
                    :value="[documentDraft.shiftName, documentDraft.shiftCode].filter(Boolean).join(' / ')"
                    type="text"
                    readonly
                    placeholder="选择班次"
                  />
                </label>
                <label class="form-field">
                  <span>班长</span>
                  <ReferencePicker
                    v-if="!isQualityReadOnly && !productionSourceFactsLocked"
                    v-model="documentDraft.leader"
                    type="employees"
                    title="选择班长"
                    placeholder="选择班长"
                    search-placeholder="搜索员工姓名、部门、手机号或邮箱"
                    :display-value="documentDraft.leader"
                    hide-meta
                    @select="handleQualityEmployeeSelect('leader', $event)"
                  />
                  <input v-else v-model="documentDraft.leader" type="text" readonly />
                </label>
                <label class="form-field">
                  <span>操作员</span>
                  <ReferencePicker
                    v-if="!isQualityReadOnly && !productionSourceFactsLocked"
                    v-model="documentDraft.operator"
                    type="employees"
                    title="选择操作员"
                    placeholder="选择操作员"
                    search-placeholder="搜索员工姓名、部门、手机号或邮箱"
                    :display-value="documentDraft.operator"
                    hide-meta
                    @select="handleQualityEmployeeSelect('operator', $event)"
                  />
                  <input v-else v-model="documentDraft.operator" type="text" readonly />
                </label>
                <label v-if="!documentDraft.processStep || documentDraft.processStep !== documentDraft.sourceType" class="form-field">
                  <span :class="qualityRequiredLabelClass('工序', productionSourceFactsLocked)">工序</span>
                  <select v-if="!isQualityReadOnly && !productionSourceFactsLocked" v-model="documentDraft.processStep">
                    <option value="">请选择工序</option>
                    <option v-for="step in qualityProcessStepOptions()" :key="step" :value="step">{{ step }}</option>
                  </select>
                  <input v-else v-model="documentDraft.processStep" type="text" readonly />
                </label>
                <label v-if="documentDraft.responsibilityProcess && documentDraft.responsibilityProcess !== documentDraft.processStep" class="form-field">
                  <span>责任工序</span>
                  <select v-if="!isQualityReadOnly && !productionSourceFactsLocked" v-model="documentDraft.responsibilityProcess">
                    <option value="">请选择责任工序</option>
                    <option v-for="step in qualityProcessStepOptions()" :key="`responsibility-${step}`" :value="step">{{ step }}</option>
                  </select>
                  <input v-else v-model="documentDraft.responsibilityProcess" type="text" readonly />
                </label>
              </template>
            </div>
          </section>

          <section
            v-if="currentKind === 'production' && isDetail && Number(currentProductionQualityTask?.rejectedQty || 0) > 0"
            id="quality-production-closure"
            class="form-section"
          >
            <div class="section-heading">
              <div>
                <h2>不合格处理</h2>
              </div>
              <i class="mini-status" :class="productionDispositionRemaining > 0.0001 ? 'status-pending' : 'status-done'">
                {{ productionDispositionRemaining > 0.0001 ? `待处理 ${productionDispositionRemaining} ${currentProductionQualityTask?.unit || ''}` : '处置已完成' }}
              </i>
            </div>
            <div v-if="productionDispositionRemaining > 0.0001" class="quality-disposition-summary">
              <span><small>待处理</small><strong>{{ productionDispositionRemaining }} {{ currentProductionQualityTask?.unit || '' }}</strong></span>
              <span><small>返工 / 复检中</small><strong>{{ productionDispositionInProcess }} {{ currentProductionQualityTask?.unit || '' }}</strong></span>
              <span><small>尚未安排</small><strong>{{ productionDispositionAvailable }} {{ currentProductionQualityTask?.unit || '' }}</strong></span>
            </div>

            <div v-if="productionDispositionAvailable > 0.0001 && canWriteQuality" class="quality-process-card">
              <div class="quality-process-heading">
                <div><strong>安排返工</strong><small>创建生产执行任务，不直接改变质检判定和合格数量</small></div>
              </div>
              <div class="quote-fields">
                <label class="form-field">
                  <span>返工数量</span>
                  <QuantityWithUnitInput v-model="productionReworkDraft.quantity" :unit="currentProductionQualityTask?.unit || ''" placeholder="输入返工数量" />
                </label>
                <label class="form-field">
                  <span>返工负责人</span>
                  <input v-model="productionReworkDraft.assignee" type="text" placeholder="填写实际返工负责人" />
                </label>
                <label class="form-field">
                  <span>返工原因与要求</span>
                  <input v-model="productionReworkDraft.reason" type="text" placeholder="例如：重新复绕并校验排线张力" />
                </label>
                <div class="quality-process-actions">
                  <button
                    class="primary-action compact-action"
                    type="button"
                    :disabled="Boolean(productionProcessSubmittingKey) || Boolean(productionReworkIssue())"
                    :title="productionReworkIssue() || '创建返工任务并保持批次质量阻断'"
                    @click="submitProductionRework"
                  >
                    <Send :size="15" />
                    {{ productionProcessSubmittingKey.startsWith('rework:create') ? '正在创建...' : '创建返工任务' }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="productionDispositionAvailable > 0.0001 && canWriteQuality" class="quality-process-card">
              <div class="quality-process-heading">
                <div><strong>直接处置</strong><small>让步需审批；报废只关闭不合格数量，不增加合格数量</small></div>
              </div>
              <div class="quote-fields">
              <label class="form-field">
                <span>处置动作</span>
                <select v-model="productionDispositionDraft.action">
                  <option value="">请选择直接处置结果</option>
                  <option value="approve_concession">让步审批放行</option>
                  <option value="scrap">报废</option>
                </select>
              </label>
              <label class="form-field">
                <span>处置数量</span>
                <QuantityWithUnitInput
                  v-model="productionDispositionDraft.quantity"
                  :unit="currentProductionQualityTask?.unit || ''"
                  placeholder="输入本次处置数量"
                />
              </label>
              <label class="form-field">
                <span>处置原因 / 依据</span>
                <input v-model="productionDispositionDraft.reason" type="text" placeholder="填写让步或报废依据" />
              </label>
              <label v-if="productionDispositionDraft.action === 'approve_concession'" class="form-field">
                <span>审批人</span>
                <input v-model="productionDispositionDraft.approvedBy" type="text" placeholder="填写让步放行审批人" />
              </label>
              <div class="quality-process-actions">
                <button
                  class="primary-action compact-action"
                  type="button"
                  :disabled="productionDispositionSubmitting || Boolean(productionDispositionIssue())"
                  :title="productionDispositionIssue() || '提交处置并更新后续生产条件'"
                  @click="submitProductionDisposition"
                >
                  <Send :size="15" />
                  {{ productionDispositionSubmitting ? '正在执行...' : '执行处置' }}
                </button>
              </div>
              </div>
            </div>
            <p v-if="productionDispositionRemaining > 0.0001 && !canWriteQuality" class="section-hint">{{ qualityReadonlyReason }}</p>

            <div v-if="productionReworkFacts.length" class="quality-process-stack">
              <article
                v-for="task in productionReworkFacts"
                :key="task.code"
                class="quality-process-card"
                data-quality-focus="rework"
                :data-quality-active="['待返工', '返工中'].includes(task.status)"
              >
                <div class="quality-process-heading">
                  <div>
                    <strong>{{ task.code }} · 返工 {{ task.quantity }} {{ task.unit }}</strong>
                    <small>{{ task.reason }} · 负责人 {{ task.assignee }} · {{ task.createdAt }}</small>
                  </div>
                  <i class="mini-status" :class="task.status === '已完成' ? 'status-done' : 'status-pending'">{{ task.status }}</i>
                </div>
                <div v-if="['待返工', '返工中'].includes(task.status) && canWriteQuality && productionReworkCompletionDrafts[task.code]" class="quote-fields">
                  <label class="form-field">
                    <span>实际返工记录</span>
                    <input v-model="productionReworkCompletionDrafts[task.code].resultNote" type="text" placeholder="记录设备、参数和实际处理内容" />
                  </label>
                  <label class="form-field">
                    <span>复检员</span>
                    <input v-model="productionReworkCompletionDrafts[task.code].inspector" type="text" placeholder="指定后续复检人员" />
                  </label>
                  <div class="form-field quality-inline-action">
                    <button
                      class="primary-action compact-action"
                      type="button"
                      :disabled="Boolean(productionProcessSubmittingKey) || Boolean(productionReworkCompletionIssue(task))"
                      :title="productionReworkCompletionIssue(task) || '完成返工并创建独立复检任务'"
                      @click="submitProductionReworkCompletion(task)"
                    >
                      <Send :size="15" />
                      {{ productionProcessSubmittingKey === `rework:complete:${task.code}` ? '正在提交...' : '完成返工并送复检' }}
                    </button>
                  </div>
                </div>
                <p v-else-if="task.resultNote" class="quality-process-note">返工记录：{{ task.resultNote }}</p>
              </article>
            </div>

            <div v-if="productionReinspectionFacts.length" class="quality-process-stack">
              <article
                v-for="task in productionReinspectionFacts"
                :key="task.code"
                class="quality-process-card reinspection evidence-reinspection-card"
                data-quality-focus="reinspection"
                :data-quality-active="task.status !== '已完成'"
              >
                <div class="quality-process-heading">
                  <div>
                    <strong>{{ task.code }} · 返工复检 {{ task.quantity }} {{ task.unit }}</strong>
                    <small>来源返工 {{ task.reworkTaskCode }} · 检验员 {{ task.inspector }} · {{ task.createdAt }}</small>
                  </div>
                  <i class="mini-status" :class="task.status === '已完成' ? 'status-done' : 'status-pending'">{{ task.status }}</i>
                </div>
                <p v-if="productionReworkForReinspection(task)?.resultNote" class="quality-process-note">
                  返工记录：{{ productionReworkForReinspection(task)?.resultNote }}
                </p>
                <template v-if="task.status === '待复检' && canWriteQuality && productionReinspectionDrafts[task.code]">
                  <div class="quality-check-editor-grid evidence-reinspection-check-grid">
                    <article
                      v-for="item in productionReinspectionDrafts[task.code].inspectionItems"
                      :key="`${task.code}-${item.name}`"
                      class="quality-check-editor-card"
                    >
                      <header>
                        <strong>{{ item.name }}</strong>
                        <i class="mini-status" :class="item.result === '不合格' ? 'status-blocked' : item.result === '合格' ? 'status-done' : 'status-pending'">{{ item.result }}</i>
                      </header>
                      <p>{{ item.standard }}</p>
                      <small class="evidence-reinspection-origin">原记录：{{ reinspectionOriginalEvidence(item) }}</small>
                      <div class="quality-check-editor-fields">
                        <label class="form-field">
                          <span>复检判定</span>
                          <select v-model="item.result">
                            <option value="待检验">待检验</option>
                            <option value="合格">合格</option>
                            <option value="不合格">不合格</option>
                          </select>
                        </label>
                        <label class="form-field">
                          <span>复检记录</span>
                          <input v-model="item.actual" type="text" placeholder="填写实测值或现场记录" />
                        </label>
                        <label v-if="item.result === '不合格'" class="form-field quality-check-note-field">
                          <span>异常说明</span>
                          <input v-model="item.note" type="text" placeholder="填写仍不合格的表现" />
                        </label>
                      </div>
                    </article>
                  </div>
                  <div class="quote-fields">
                    <label class="form-field">
                      <span>复检合格数量</span>
                      <QuantityWithUnitInput v-model="productionReinspectionDrafts[task.code].acceptedQty" :unit="task.unit" placeholder="0" />
                    </label>
                    <label class="form-field">
                      <span>复检不合格数量</span>
                      <QuantityWithUnitInput v-model="productionReinspectionDrafts[task.code].rejectedQty" :unit="task.unit" placeholder="0" />
                    </label>
                    <label class="form-field">
                      <span>结论补充</span>
                      <input v-model="productionReinspectionDrafts[task.code].resultReason" type="text" placeholder="选填；检查项已作为判定依据" />
                    </label>
                  </div>
                  <div class="quality-process-actions">
                    <button
                      class="primary-action compact-action"
                      type="button"
                      :disabled="Boolean(productionProcessSubmittingKey) || Boolean(productionReinspectionIssue(task))"
                      :title="productionReinspectionIssue(task) || '提交复检判定并按结果更新批次流转条件'"
                      @click="submitProductionReinspection(task)"
                    >
                      <Send :size="15" />
                      {{ productionProcessSubmittingKey === `reinspection:decision:${task.code}` ? '正在判定...' : '提交复检判定' }}
                    </button>
                  </div>
                </template>
                <div v-else-if="productionReinspectionInspectionItems(task).length" class="quality-check-editor-grid evidence-reinspection-check-grid is-readonly">
                  <article v-for="item in productionReinspectionInspectionItems(task)" :key="`${task.code}-readonly-${item.name}`" class="quality-check-editor-card">
                    <header>
                      <strong>{{ item.name }}</strong>
                      <i class="mini-status" :class="item.result === '不合格' ? 'status-blocked' : item.result === '合格' ? 'status-done' : 'status-neutral'">{{ item.result }}</i>
                    </header>
                    <p>{{ item.standard }}</p>
                    <small class="evidence-reinspection-origin">原记录：{{ reinspectionOriginalEvidence(item) }}</small>
                    <dl class="incoming-reinspection-result">
                      <div><dt>复检记录</dt><dd>{{ item.actual || '-' }}</dd></div>
                      <div v-if="item.note"><dt>异常说明</dt><dd>{{ item.note }}</dd></div>
                    </dl>
                  </article>
                </div>
                <p v-if="task.status === '已完成'" class="quality-process-note">
                  数量结论：{{ task.result }} · 合格 {{ task.acceptedQty }} {{ task.unit }} · 不合格 {{ task.rejectedQty }} {{ task.unit }}<template v-if="task.resultReason"> · {{ task.resultReason }}</template>
                </p>
              </article>
            </div>

            <div v-if="productionDispositionFacts.length" class="trace-summary-list">
              <div v-for="fact in productionDispositionFacts" :key="fact.id" class="trace-summary-row">
                <span>{{ fact.id }} · {{ productionDispositionActionLabel(fact.action) }}</span>
                <strong>{{ fact.quantity }} {{ fact.unit }} · {{ fact.actor }} · {{ fact.executedAt }}</strong>
              </div>
            </div>
          </section>

          <section v-if="currentKind === 'incoming'" id="quality-incoming-closure" class="form-section">
            <div class="section-heading">
              <h2>收货与质检数量</h2>
              <span v-if="documentDraft.sourceDoc" class="quality-source-reference" title="来源采购收货单">
                <FileText :size="15" />
                {{ documentDraft.sourceDoc }}
              </span>
            </div>
            <dl class="material-fact-grid quality-detail-fact-grid incoming-outcome-facts">
              <div v-for="row in incomingOutcomeSummaryRows" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
            <p class="section-hint">{{ incomingDecisionBoundaryNotice }}</p>
          </section>

          <section v-if="currentKind !== 'incoming'" class="form-section">
            <div class="section-heading">
              <h2>{{ currentConfig.lineTitle }}</h2>
              <button v-if="['patrol', 'defects'].includes(currentKind) && !isQualityReadOnly && !patrolInspectionFactsLocked && !defectEvidenceLocked" class="secondary-action compact-action" type="button" title="添加明细行" @click="addQualityLine">
                <Plus :size="15" />
                添加明细
              </button>
            </div>

            <div v-if="isDetail || patrolInspectionFactsLocked || defectEvidenceLocked" class="quality-readonly-lines">
              <article v-for="(line, index) in documentDraft.products" :key="`quality-readonly-line-${index}`" class="quality-readonly-line">
                <header>
                  <span class="product-thumb" :style="{ backgroundColor: itemVisual(line.name).tone }">
                    <span>{{ itemVisual(line.name).label }}</span>
                  </span>
                  <div>
                    <strong>{{ line.name || `${lineItemNameLabel} ${index + 1}` }}</strong>
                    <small>{{ line.batch || (currentKind === 'patrol' ? '未关联批次' : '未登记批次号') }}</small>
                  </div>
                  <i class="mini-status" :class="statusClass(line.result || currentStatus)">{{ qualityResultLabel(line.result || currentStatus) }}</i>
                </header>
                <dl>
                  <div><dt>{{ currentKind === 'patrol' ? '巡检次数' : '批次数量' }}</dt><dd>{{ line.qty || '-' }}</dd></div>
                  <div><dt>{{ currentKind === 'patrol' ? '点位数' : '抽检数量' }}</dt><dd>{{ line.sampleQty || '-' }}</dd></div>
                  <div><dt>{{ currentKind === 'patrol' ? '异常点数' : '样本不良' }}</dt><dd>{{ line.failedQty || '-' }}</dd></div>
                  <div><dt>{{ lineResultFieldLabel }}</dt><dd>{{ qualityResultLabel(line.result || currentStatus) }}</dd></div>
                </dl>
              </article>
            </div>

            <div v-else class="quality-edit-lines">
              <article v-for="(line, index) in documentDraft.products" :key="`quality-line-${index}`" class="quality-edit-line">
                <header>
                  <span class="product-thumb" :style="{ backgroundColor: itemVisual(line.name).tone }">
                    <span>{{ itemVisual(line.name).label }}</span>
                  </span>
                  <label class="quality-edit-product">
                    <span :class="qualityRequiredLabelClass(lineItemNameLabel, currentKind === 'production')">{{ lineItemNameLabel }}</span>
                    <ReferencePicker
                      v-if="currentKind === 'defects'"
                      required
                      v-model="line.name"
                      :class="qualityLineFieldClass(line.name)"
                      type="materials"
                      :kind="qualityLineMaterialKind()"
                      :title="`选择${lineItemNameLabel}`"
                      :placeholder="lineItemNamePlaceholder"
                      search-placeholder="搜索物料编码、名称、型号或规格"
                      :display-value="line.name"
                      hide-meta
                      @select="handleQualityLineMaterialSelect(line, $event)"
                    />
                    <input
                      v-else
                      v-model="line.name"
                      type="text"
                      :class="qualityLineFieldClass(line.name)"
                      :placeholder="lineItemNamePlaceholder"
                      :readonly="currentKind === 'production'"
                      @input="markDraftInteraction"
                    />
                  </label>
                  <i class="mini-status" :class="statusClass(line.result || '待检验')">{{ qualityResultLabel(line.result || '待检验') }}</i>
                  <button
                    v-if="['patrol', 'defects'].includes(currentKind) && !patrolInspectionFactsLocked && !defectEvidenceLocked && documentDraft.products.length > 1"
                    class="icon-button danger"
                    type="button"
                    aria-label="删除质检明细"
                    title="删除质检明细"
                    @click="removeQualityLine(index)"
                  >
                    <Trash2 :size="15" />
                  </button>
                </header>
                <div class="quality-edit-fields" :class="{ 'patrol-edit-fields': currentKind === 'patrol' }">
                  <label class="form-field">
                    <span :class="qualityRequiredLabelClass(currentKind === 'patrol' ? '巡检次数' : '批次数量', currentKind === 'production')">{{ currentKind === 'patrol' ? '巡检次数' : '批次数量' }}</span>
                    <QuantityWithUnitInput
                      v-model="line.qty"
                      :class="qualityLineFieldClass(line.qty)"
                      :unit="currentKind === 'patrol' ? '次' : qualityLineUnit(line, line.qty)"
                      :placeholder="currentKind === 'patrol' ? '巡检次数' : '批次数量'"
                      :readonly="currentKind === 'production'"
                      @update:model-value="markDraftInteraction"
                      @blur="markDraftInteraction"
                    />
                  </label>
                  <label class="form-field">
                    <span>{{ currentKind === 'patrol' ? '关联批次' : '批次号' }}</span>
                    <input v-model="line.batch" type="text" :placeholder="currentKind === 'patrol' ? '选填' : '批次号'" :readonly="currentKind === 'production'" @input="markDraftInteraction" />
                  </label>
                  <label class="form-field">
                    <span :class="qualityRequiredLabelClass(currentKind === 'patrol' ? '点位数' : '抽检数量', currentKind === 'production')">{{ currentKind === 'patrol' ? '点位数' : '抽检数量' }}</span>
                    <QuantityWithUnitInput
                      v-model="line.sampleQty"
                      :class="qualityLineFieldClass(line.sampleQty)"
                      :unit="currentKind === 'patrol' ? '点' : qualityLineUnit(line, line.sampleQty || line.qty)"
                      :placeholder="currentKind === 'patrol' ? '点位数' : '抽检数量'"
                      :readonly="currentKind === 'production'"
                      @update:model-value="markDraftInteraction"
                      @blur="markDraftInteraction"
                    />
                  </label>
                  <label class="form-field">
                    <span>{{ currentKind === 'patrol' ? '异常点数' : '样本不良' }}</span>
                    <QuantityWithUnitInput
                      v-model="line.failedQty"
                      :unit="currentKind === 'patrol' ? '点' : qualityLineUnit(line, line.failedQty || line.sampleQty || line.qty)"
                      :placeholder="currentKind === 'patrol' ? '异常点数' : '样本不良'"
                      :readonly="currentKind === 'production' && ['开机首检', '半成品质检'].includes(currentProductionQualityTask?.kind || '')"
                      @update:model-value="markDraftInteraction"
                      @blur="markDraftInteraction"
                    />
                  </label>
                  <label v-if="currentKind !== 'patrol'" class="form-field">
                    <span :class="qualityRequiredLabelClass('判定', currentKind === 'production')">判定</span>
                    <input v-if="currentKind === 'production'" :value="qualityResultLabel(line.result || '待检验')" type="text" readonly />
                    <select v-else v-model="line.result" :class="qualityLineFieldClass(line.result)" @change="handleQualityLineResultChange(line)">
                      <option value="">请选择判定</option>
                      <option v-if="line.result && !qualityLineResultOptions().includes(line.result)" :value="line.result">{{ qualityResultLabel(line.result) }}（历史）</option>
                      <option v-for="option in qualityLineResultOptions()" :key="option" :value="option">{{ qualityResultLabel(option) }}</option>
                    </select>
                  </label>
                </div>
              </article>
            </div>
          </section>

          <section v-if="currentKind === 'incoming'" class="form-section incoming-outcome-section">
            <div class="section-heading">
              <h2>{{ isDetail ? '检验明细与业务处置' : '检验判定与业务处置' }}</h2>
              <i class="mini-status status-neutral">按收货行 / 物料批次</i>
            </div>
            <div class="inspection-item-grid">
              <article v-for="(line, index) in documentDraft.products" :key="`incoming-outcome-${index}`" class="inspection-item-card">
                <header>
                  <div>
                    <strong>{{ line.name || `物料 ${index + 1}` }}</strong>
                    <span>{{ line.batch || '未登记批次' }} · 到货 {{ line.qty || '-' }}</span>
                  </div>
                  <i class="mini-status" :class="incomingLineOutcomeTone(line)">
                    {{ incomingLineBalanceLabel(line) }}
                  </i>
                </header>
                <dl v-if="isDetail" class="incoming-outcome-readonly-grid">
                  <div><dt>批次数量</dt><dd>{{ line.qty || '-' }}</dd></div>
                  <div><dt>抽检数量</dt><dd>{{ line.sampleQty || '-' }}</dd></div>
                  <div><dt>样本异常</dt><dd>{{ line.sampleQty ? (line.failedQty || `0 ${qualityLineUnit(line, line.sampleQty)}`) : '-' }}</dd></div>
                  <div><dt>检验结论</dt><dd>{{ qualityResultLabel(line.result || '待检验') }}</dd></div>
                  <div><dt>合格数量</dt><dd>{{ line.qualifiedQty || `0 ${qualityLineUnit(line, line.qty)}` }}</dd></div>
                  <div><dt>不合格数量</dt><dd>{{ line.rejectedQty || `0 ${qualityLineUnit(line, line.qty)}` }}</dd></div>
                  <div><dt>让步数量</dt><dd>{{ line.concessionQty || `0 ${qualityLineUnit(line, line.qty)}` }}</dd></div>
                  <div><dt>剩余待处理</dt><dd>{{ incomingLinePendingQuantity(line) }}</dd></div>
                  <div class="incoming-outcome-disposition"><dt>业务处置</dt><dd>{{ incomingDispositionOptionLabel(line.lineDisposition || '待判定') }}</dd></div>
                </dl>
                <template v-else>
                <div class="form-section-head">
                  <strong>抽样记录</strong>
                </div>
                <div class="quote-fields">
                  <label class="form-field">
                    <span>抽检数量</span>
                    <QuantityWithUnitInput
                      v-model="line.sampleQty"
                      :unit="qualityLineUnit(line, line.sampleQty || line.qty)"
                      placeholder="抽检数量"
                      :readonly="isQualityReadOnly"
                      @update:model-value="markDraftInteraction"
                      @blur="markDraftInteraction"
                    />
                  </label>
                  <label class="form-field">
                    <span>样本异常</span>
                    <QuantityWithUnitInput
                      v-model="line.failedQty"
                      :unit="qualityLineUnit(line, line.failedQty || line.sampleQty || line.qty)"
                      placeholder="样本异常"
                      :readonly="isQualityReadOnly"
                      @update:model-value="markDraftInteraction"
                      @blur="markDraftInteraction"
                    />
                  </label>
                </div>
                <div class="form-section-head">
                  <strong>检验判定（按标准）</strong>
                  <i class="mini-status status-neutral">{{ qualityResultLabel(line.result || '待检验') }}</i>
                </div>
                <div class="quote-fields">
                  <label class="form-field">
                    <span :class="qualityRequiredLabelClass('合格数量')">合格数量</span>
                    <QuantityWithUnitInput
                      v-model="line.qualifiedQty"
                      :class="incomingOutcomeFieldClass(line, line.qualifiedQty)"
                      :unit="qualityLineUnit(line, line.qty)"
                      placeholder="0"
                      :readonly="isQualityReadOnly"
                      @update:model-value="markDraftInteraction"
                    />
                  </label>
                  <label class="form-field">
                    <span :class="qualityRequiredLabelClass('不合格数量')">不合格数量</span>
                    <QuantityWithUnitInput
                      v-model="line.rejectedQty"
                      :class="incomingOutcomeFieldClass(line, line.rejectedQty)"
                      :unit="qualityLineUnit(line, line.qty)"
                      placeholder="0"
                      :readonly="isQualityReadOnly"
                      @update:model-value="markDraftInteraction"
                    />
                  </label>
                  <label class="form-field">
                    <span>历史让步</span>
                    <QuantityWithUnitInput
                      v-model="line.concessionQty"
                      :unit="qualityLineUnit(line, line.qty)"
                      placeholder="无历史让步"
                      readonly
                    />
                  </label>
                  <label class="form-field">
                    <span>剩余待处理</span>
                    <input :value="incomingLinePendingQuantity(line)" type="text" readonly />
                  </label>
                </div>
                <div class="form-section-head">
                  <strong>业务处置（后续动作）</strong>
                  <i class="mini-status" :class="incomingLineDispositionIssue(line) ? 'status-pending' : 'status-neutral'">
                    {{ line.lineDisposition ? incomingDispositionOptionLabel(line.lineDisposition) : '待处置' }}
                  </i>
                </div>
                <div class="quote-fields">
                  <label class="form-field">
                    <span :class="qualityRequiredLabelClass('物料处置')">行级业务处置</span>
                    <select
                      v-model="line.lineDisposition"
                      :class="incomingDispositionFieldClass(line)"
                      :title="incomingLineDispositionIssue(line) || '选择与当前判定数量匹配的业务处置'"
                      @change="markDraftInteraction"
                    >
                      <option v-if="line.lineDisposition === '让步接收'" value="让步接收">{{ incomingDispositionOptionLabel('让步接收') }}</option>
                      <option v-for="option in incomingDispositionOptions" :key="option" :value="option">{{ incomingDispositionOptionLabel(option) }}</option>
                    </select>
                  </label>
                  <label class="form-field">
                    <span>处置校验</span>
                    <input :value="incomingLineDispositionIssue(line) || '判定数量与处置口径一致'" type="text" readonly />
                  </label>
                </div>
                </template>
                <div class="trace-summary-list">
                  <div v-for="row in incomingLineDispositionRows(line)" :key="`${row.label}-${row.value}`" class="trace-summary-row">
                    <span>{{ row.label }}</span>
                    <strong>{{ row.value }}</strong>
                  </div>
                </div>
                <template v-if="isDetail && (documentDraft.version ?? 0) > 0 && (qualityQuantityAmount(line.rejectedQty) ?? 0) > 0">
                  <div class="form-section-head">
                    <strong>执行不合格处置</strong>
                    <i class="mini-status" :class="incomingDispositionRemainingAmount(line) > 0.0001 ? 'status-pending' : 'status-done'">
                      剩余 {{ incomingDispositionRemainingQuantity(line) }}
                    </i>
                  </div>
                  <div v-if="incomingDispositionRemainingAmount(line) > 0.0001 && canWriteQuality" class="quote-fields">
                    <label class="form-field">
                      <span>处置动作</span>
                      <select v-model="incomingDispositionDraftFor(line).action">
                        <option value="">请选择真实处置动作</option>
                        <option value="return_to_supplier">转采购处理</option>
                        <option value="approve_concession">让步审批放行</option>
                      </select>
                    </label>
                    <label class="form-field">
                      <span>处置数量</span>
                      <QuantityWithUnitInput
                        v-model="incomingDispositionDraftFor(line).quantity"
                        :unit="qualityQuantityUnit(line.qty)"
                        placeholder="输入本次处置数量"
                      />
                    </label>
                    <label class="form-field">
                      <span>处置原因</span>
                      <input v-model="incomingDispositionDraftFor(line).reason" type="text" placeholder="填写退货或让步原因" />
                    </label>
                    <label v-if="incomingDispositionDraftFor(line).action === 'approve_concession'" class="form-field">
                      <span>审批人</span>
                      <input v-model="incomingDispositionDraftFor(line).approvedBy" type="text" placeholder="让步放行审批人" />
                    </label>
                    <div class="form-field full-field quality-process-actions">
                      <button
                        class="primary-action compact-action"
                        type="button"
                        :disabled="incomingDispositionSubmittingLine === incomingDispositionLineKey(line) || Boolean(incomingDispositionSubmitIssue(line))"
                        :title="incomingDispositionSubmitIssue(line) || '提交处置；退货诉求转为采购售后，库存继续保持隔离'"
                        @click="submitIncomingDisposition(line)"
                      >
                        <Send :size="15" />
                        {{ incomingDispositionSubmittingLine === incomingDispositionLineKey(line) ? '正在提交...' : '提交处置' }}
                      </button>
                    </div>
                  </div>
                  <p v-else-if="incomingDispositionRemainingAmount(line) > 0.0001" class="section-hint">{{ qualityReadonlyReason }}</p>
                  <p v-else class="section-hint">该收货行没有剩余隔离数量；数量已由处置凭证或进行中的复检任务处理。</p>
                  <div v-if="incomingDispositionFactsForLine(line).length" class="trace-summary-list">
                    <div v-for="fact in incomingDispositionFactsForLine(line)" :key="fact.id" class="trace-summary-row">
                      <span>{{ fact.id }} · {{ incomingDispositionActionLabel(fact.action) }}</span>
                      <strong>{{ incomingDispositionFactSummary(fact) }}</strong>
                    </div>
                  </div>
                  <div v-if="incomingReturnDocumentsForLine(line).length" class="trace-summary-list">
                    <div v-for="document in incomingReturnDocumentsForLine(line)" :key="incomingFactText(document, 'code', 'documentCode', 'id')" class="trace-summary-row">
                      <span>采购售后单</span>
                      <strong>{{ incomingReturnDocumentSummary(document) }}</strong>
                    </div>
                  </div>

                  <div class="form-section-head">
                    <strong>独立复检任务</strong>
                    <i class="mini-status" :class="incomingReinspectionFactsForLine(line).some((task) => !incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task)) ? 'status-pending' : 'status-neutral'">
                      {{ incomingReinspectionFactsForLine(line).length }} 个任务
                    </i>
                  </div>
                  <div v-if="incomingDispositionRemainingAmount(line) > 0.0001 && canWriteQuality" class="quote-fields">
                    <label class="form-field">
                      <span>本次复检数量</span>
                      <QuantityWithUnitInput
                        v-model="incomingReinspectionCreateDraftFor(line).quantity"
                        :unit="qualityQuantityUnit(line.qty)"
                        placeholder="输入隔离数量"
                      />
                    </label>
                    <label class="form-field">
                      <span>发起原因</span>
                      <input v-model="incomingReinspectionCreateDraftFor(line).reason" type="text" placeholder="填写需要复检的原因" />
                    </label>
                    <label class="form-field">
                      <span>复检员</span>
                      <input v-model="incomingReinspectionCreateDraftFor(line).inspector" type="text" placeholder="填写复检员" />
                    </label>
                    <div class="form-field full-field quality-process-actions">
                      <button
                        class="primary-action compact-action"
                        type="button"
                        :disabled="incomingReinspectionSubmittingKey === `create:${incomingDispositionLineKey(line)}` || Boolean(incomingReinspectionCreateIssue(line))"
                        :title="incomingReinspectionCreateIssue(line) || '创建复检任务；成功后显示任务编号'"
                        @click="createIncomingReinspection(line)"
                      >
                        <Plus :size="15" />
                        {{ incomingReinspectionSubmittingKey === `create:${incomingDispositionLineKey(line)}` ? '正在创建...' : '创建复检任务' }}
                      </button>
                    </div>
                  </div>
                  <p v-else-if="incomingDispositionRemainingAmount(line) > 0.0001" class="section-hint">{{ qualityReadonlyReason }}</p>
                  <div
                    v-for="task in incomingReinspectionFactsForLine(line)"
                    :key="incomingReinspectionCode(task)"
                    class="quality-process-card reinspection evidence-reinspection-card"
                    data-quality-focus="reinspection"
                    :data-quality-active="!incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task)"
                  >
                    <div class="quality-process-heading evidence-reinspection-heading">
                      <div>
                        <strong>{{ incomingReinspectionCode(task) }}</strong>
                        <span>复检任务 · {{ incomingReinspectionSummary(task, line) }}</span>
                      </div>
                      <i
                        class="mini-status"
                        :class="incomingReinspectionIsComplete(task) ? 'status-done' : incomingReinspectionIsCancelled(task) ? 'status-neutral' : 'status-pending'"
                      >
                        {{ incomingReinspectionStatus(task) }}
                      </i>
                    </div>
                    <div
                      v-if="!incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task) && canWriteQuality"
                      class="quality-check-editor-grid evidence-reinspection-check-grid"
                    >
                      <article
                        v-for="item in incomingReinspectionCompleteDraftFor(task).inspectionItems"
                        :key="`${incomingReinspectionCode(task)}-${item.name}`"
                        class="quality-check-editor-card"
                        :class="{ 'is-abnormal': item.result === '不合格' }"
                      >
                        <header>
                          <strong>{{ item.name }}</strong>
                          <i class="mini-status" :class="statusClass(item.result)">{{ item.result }}</i>
                        </header>
                        <p>{{ item.standard }}</p>
                        <small class="evidence-reinspection-origin">原记录：{{ reinspectionOriginalEvidence(item) }}</small>
                        <div class="quality-check-editor-fields">
                          <label class="form-field">
                            <span class="required-label">复检判定</span>
                            <select v-model="item.result" @change="markDraftInteraction">
                              <option value="待检验">待检验</option>
                              <option value="合格">合格</option>
                              <option value="不合格">不合格</option>
                            </select>
                          </label>
                          <label class="form-field">
                            <span>复检记录</span>
                            <input v-model="item.actual" type="text" :placeholder="item.result === '不合格' ? '填写实测值或异常现象' : '可填写实测值'" @input="markDraftInteraction" />
                          </label>
                          <label v-if="item.result === '不合格'" class="form-field quality-check-note">
                            <span class="required-label">异常说明</span>
                            <input v-model="item.note" type="text" placeholder="说明复检仍不合格的原因" @input="markDraftInteraction" />
                          </label>
                        </div>
                      </article>
                    </div>
                    <div v-else-if="incomingReinspectionInspectionItems(task).length" class="quality-check-editor-grid evidence-reinspection-check-grid is-readonly">
                      <article
                        v-for="item in incomingReinspectionInspectionItems(task)"
                        :key="`${incomingReinspectionCode(task)}-${item.name}`"
                        class="quality-check-editor-card"
                        :class="{ 'is-abnormal': item.result === '不合格' }"
                      >
                        <header>
                          <strong>{{ item.name }}</strong>
                          <i class="mini-status" :class="statusClass(item.result)">{{ item.result }}</i>
                        </header>
                        <p>{{ item.standard }}</p>
                        <small class="evidence-reinspection-origin">原记录：{{ reinspectionOriginalEvidence(item) }}</small>
                        <dl class="incoming-reinspection-result">
                          <div><dt>复检记录</dt><dd>{{ item.actual || '-' }}</dd></div>
                          <div v-if="item.note"><dt>异常说明</dt><dd>{{ item.note }}</dd></div>
                        </dl>
                      </article>
                    </div>
                    <div v-if="!incomingReinspectionIsComplete(task) && !incomingReinspectionIsCancelled(task) && canWriteQuality" class="quote-fields">
                      <label class="form-field">
                        <span>复检合格数量</span>
                        <QuantityWithUnitInput
                          v-model="incomingReinspectionCompleteDraftFor(task).acceptedQty"
                          :unit="incomingReinspectionUnit(task, line)"
                          placeholder="0"
                        />
                      </label>
                      <label class="form-field">
                        <span>复检不合格数量</span>
                        <QuantityWithUnitInput
                          v-model="incomingReinspectionCompleteDraftFor(task).rejectedQty"
                          :unit="incomingReinspectionUnit(task, line)"
                          placeholder="0"
                        />
                      </label>
                      <label class="form-field">
                        <span>结论补充</span>
                        <input v-model="incomingReinspectionCompleteDraftFor(task).resultReason" type="text" placeholder="选填；检查项已作为判定依据" />
                      </label>
                      <div class="form-field full-field quality-process-actions">
                        <button
                          class="primary-action compact-action"
                          type="button"
                          :disabled="incomingReinspectionSubmittingKey === `complete:${incomingReinspectionCode(task)}` || Boolean(incomingReinspectionCompleteIssue(task, line))"
                          :title="incomingReinspectionCompleteIssue(task, line) || '成功后合格数量转待入库，不合格数量继续隔离'"
                          @click="completeIncomingReinspection(task, line)"
                        >
                          <Send :size="15" />
                          {{ incomingReinspectionSubmittingKey === `complete:${incomingReinspectionCode(task)}` ? '正在提交...' : '完成复检' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </article>
            </div>
          </section>

          <section v-if="showInspectionItemSection" class="form-section quality-checkpoints-section">
            <div class="section-heading">
              <div>
                <h2>检查项明细</h2>
                <i class="mini-status" :class="productionCheckpointStats.abnormal ? 'status-blocked' : 'status-neutral'">
                  {{ productionCheckpointStats.completed }}/{{ productionCheckpointStats.total }} 已记录<span v-if="productionCheckpointStats.abnormal"> · {{ productionCheckpointStats.abnormal }} 项异常</span><span v-if="missingHistoricalInspectionItemCount"> · 历史缺 {{ missingHistoricalInspectionItemCount }} 项</span>
                </i>
              </div>
              <button
                v-if="['incoming', 'production', 'patrol'].includes(currentKind) && !isQualityReadOnly && !patrolInspectionFactsLocked"
                class="secondary-action compact-action"
                type="button"
                :title="`将全部检查项标记为${currentKind === 'patrol' ? '正常' : '合格'}，仍可逐项修改`"
                @click="markAllEditableCheckpointsPassed"
              >
                <ClipboardList :size="15" />
                {{ currentKind === 'patrol' ? '全部正常' : '全部合格' }}
              </button>
            </div>

            <div v-if="['incoming', 'production', 'patrol'].includes(currentKind) && !isQualityReadOnly && !patrolInspectionFactsLocked" class="quality-check-editor-grid">
              <article
                v-for="item in inspectionItems"
                :key="item.key"
                class="quality-check-editor-card"
                :class="[inspectionItemFieldClass(item.record), { 'is-abnormal': ['预警', '待整改', '不合格'].includes(item.record.result) }]"
              >
                <header>
                  <strong>{{ item.name }}</strong>
                  <i class="mini-status" :class="statusClass(item.record.result)">{{ currentKind === 'patrol' && item.record.result === '合格' ? '正常' : item.record.result }}</i>
                </header>
                <p>{{ item.record.standard }}</p>
                <div class="quality-check-editor-fields">
                  <label class="form-field">
                    <span class="required-label">判定</span>
                    <select v-model="item.record.result" @change="handleEditableCheckpointResult(item.line, item.record)">
                      <option value="待检验">待检验</option>
                      <option value="合格">{{ currentKind === 'patrol' ? '正常' : '合格' }}</option>
                      <option v-if="currentKind === 'patrol'" value="预警">预警</option>
                      <option v-if="currentKind === 'patrol' && item.record.result === '待整改'" value="待整改">待整改</option>
                      <option value="不合格">不合格</option>
                    </select>
                  </label>
                  <label class="form-field">
                    <span>检查记录</span>
                    <input v-model="item.record.actual" type="text" :placeholder="['预警', '待整改', '不合格'].includes(item.record.result) ? '填写实测值或异常现象' : '可填写实测值'" @input="markDraftInteraction" />
                  </label>
                  <label v-if="['预警', '待整改', '不合格'].includes(item.record.result)" class="form-field quality-check-note">
                    <span :class="{ 'required-label': currentKind !== 'patrol' }">{{ currentKind === 'patrol' ? '补充说明' : '异常说明' }}</span>
                    <input v-model="item.record.note" type="text" :placeholder="currentKind === 'patrol' ? '可补充位置、责任或整改要求' : '说明异常位置、数量或判断依据'" @input="markDraftInteraction" />
                  </label>
                </div>
              </article>
            </div>

            <div v-else class="inspection-item-grid">
              <article v-for="item in visibleInspectionItems" :key="item.key" class="inspection-item-card">
                <header>
                  <div>
                    <strong>{{ item.name }}</strong>
                    <span v-if="documentDraft.products.length > 1">{{ item.lineName }}</span>
                  </div>
                  <i class="mini-status" :class="statusClass(item.record.result)">{{ currentKind === 'patrol' && item.record.result === '合格' ? '正常' : item.record.result }}</i>
                </header>
                <dl>
                  <div>
                    <dt>标准</dt>
                    <dd>{{ item.record.standard }}</dd>
                  </div>
                  <div v-if="item.record.actual">
                    <dt>检查记录</dt>
                    <dd>{{ item.record.actual }}</dd>
                  </div>
                  <div v-if="item.record.defectLevel">
                    <dt>等级</dt>
                    <dd>{{ item.record.defectLevel }}</dd>
                  </div>
                  <div v-if="item.record.note">
                    <dt>异常说明</dt>
                    <dd>{{ item.record.note }}</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>

          <section v-if="!isDetail || qualityHandlingFacts.length" class="form-section quality-handling-section">
            <div class="form-section-head">
              <h2>{{ currentConfig.handlingTitle }}</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid quality-detail-fact-grid quality-handling-facts">
              <div v-for="fact in qualityHandlingFacts" :key="fact.label" :class="{ 'fact-span-3': fact.full }">
                <dt>{{ fact.label }}</dt>
                <dd>{{ fact.value }}</dd>
              </div>
            </dl>

            <div v-else class="quote-fields">
              <label v-if="currentKind === 'defects' || documentDraft.defectLevel || (currentKind === 'patrol' && patrolHasFinding)" class="form-field">
                <span :class="qualityRequiredLabelClass('缺陷等级', defectPlanLocked)">缺陷等级</span>
                <select v-if="!isQualityReadOnly && !patrolInspectionFactsLocked && !defectPlanLocked" v-model="documentDraft.defectLevel">
                  <option value="">请选择缺陷等级</option>
                  <option v-for="level in defectLevelOptions" :key="level" :value="level">{{ level }}</option>
                </select>
                <input v-else v-model="documentDraft.defectLevel" type="text" readonly />
              </label>
              <label v-if="currentKind !== 'incoming'" class="form-field">
                <span :class="['patrol', 'production'].includes(currentKind) ? undefined : qualityRequiredLabelClass('处置方式', defectPlanLocked)">{{ currentKind === 'patrol' ? '提交去向' : currentKind === 'production' ? '结果去向' : '处置方式' }}</span>
                <input v-if="currentKind === 'patrol'" :value="patrolDispositionProjection" type="text" readonly />
                <input v-else-if="currentKind === 'production'" v-model="documentDraft.disposition" type="text" readonly />
                <select v-else-if="!isQualityReadOnly && !defectPlanLocked" v-model="documentDraft.disposition">
                  <option value="">请选择处置方式</option>
                  <option
                    v-if="documentDraft.disposition && !qualityDispositionOptions.includes(documentDraft.disposition)"
                    :value="documentDraft.disposition"
                  >
                    {{ documentDraft.disposition }}
                  </option>
                  <option v-for="option in qualityDispositionOptions" :key="option" :value="option">{{ option }}</option>
                </select>
                <input v-else v-model="documentDraft.disposition" type="text" readonly />
              </label>
              <label
                v-if="documentDraft.rectificationAction || (currentKind === 'patrol' && currentStatus === '待整改') || (currentKind === 'defects' && currentStatus === '处置中')"
                class="form-field full-field"
              >
                <span :class="(currentKind === 'patrol' && currentStatus === '待整改') || (currentKind === 'defects' && currentStatus === '处置中') ? qualityRequiredLabelClass(currentKind === 'patrol' ? '整改说明' : '处置结果') : undefined">
                  {{ currentKind === 'patrol' ? '整改说明' : '处置结果' }}
                </span>
                <textarea
                  v-model="documentDraft.rectificationAction"
                  rows="3"
                  :readonly="isQualityReadOnly || (currentKind === 'patrol' && currentStatus !== '待整改') || (currentKind === 'defects' && currentStatus !== '处置中')"
                  :placeholder="currentKind === 'patrol' ? '填写已完成的整改措施和现场结果' : '填写处置执行结果、实际数量和凭证依据'"
                ></textarea>
              </label>
              <label
                v-if="documentDraft.verificationConclusion || (currentKind === 'patrol' && currentStatus === '待复查') || (currentKind === 'defects' && currentStatus === '待验证')"
                class="form-field full-field"
              >
                <span :class="(currentKind === 'patrol' && currentStatus === '待复查') || (currentKind === 'defects' && currentStatus === '待验证') ? qualityRequiredLabelClass(currentKind === 'patrol' ? '复查结论' : '验证结论') : undefined">
                  {{ currentKind === 'patrol' ? '复查结论' : '验证结论' }}
                </span>
                <textarea
                  v-model="documentDraft.verificationConclusion"
                  rows="3"
                  :readonly="isQualityReadOnly || (currentKind === 'patrol' && currentStatus !== '待复查') || (currentKind === 'defects' && currentStatus !== '待验证')"
                  :placeholder="currentKind === 'patrol' ? '填写整改是否有效；仍异常时选择升级不良' : '填写验证依据；未通过时退回继续处置'"
                ></textarea>
              </label>
              <label v-if="currentKind === 'production' && documentDraft.productionLine !== documentDraft.party" class="form-field">
                <span>产线</span>
                <select v-if="!isQualityReadOnly && !productionSourceFactsLocked" v-model="documentDraft.productionLine">
                  <option value="">请选择产线</option>
                  <option v-for="line in productionLineOptions()" :key="`production-line-${line}`" :value="line">{{ line }}</option>
                </select>
                <input v-else v-model="documentDraft.productionLine" type="text" readonly />
              </label>
              <label class="form-field full-field">
                <span :class="qualityRequiredLabelClass(conclusionFieldLabel, defectEvidenceLocked)">{{ conclusionFieldLabel }}</span>
                <textarea
                  class="terms-textarea"
                  v-model="documentDraft.conclusion"
                  rows="5"
                  :readonly="isQualityReadOnly || patrolInspectionFactsLocked || defectEvidenceLocked"
                  :placeholder="currentKind === 'incoming' ? '只记录按质检标准得出的结论和依据；隔离、退货、让步等填写在业务处置中' : currentKind === 'patrol' ? '概括巡检结果；异常时说明发现与整改要求' : currentKind === 'defects' ? '描述不良现象、影响范围和初步判断' : '填写检验结论、处置要求和放行条件'"
                ></textarea>
              </label>
              <label class="form-field full-field">
                <span>备注</span>
                <textarea
                  v-model="documentDraft.note"
                  rows="4"
                  :readonly="isQualityReadOnly || patrolInspectionFactsLocked || defectEvidenceLocked"
                  placeholder="填写抽样依据、附件说明、责任说明等"
                ></textarea>
              </label>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              title="质量状态"
              :primary-status="qualityLifecycleStatus"
              :items="qualityStatusPanelItems"
              :aria-label="`${currentConfig.title}状态与进度`"
            />
          </section>

          <section v-if="!isQualityReadOnly || qualityAttachments.length" class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
              <label
                v-if="!isQualityReadOnly"
                class="secondary-action compact-action file-upload-button"
                :title="qualityAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple @change="handleQualityAttachmentUpload" />
              </label>
            </div>
            <div v-for="row in attachmentRows" :key="`attachment-${row.label}`" class="summary-line">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
            <div v-if="qualityAttachments.length" class="attachment-list">
              <div v-for="file in qualityAttachments" :key="file.name" class="attachment-row">
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
              <span>{{ isQualityReadOnly ? '暂无附件' : '可上传质检照片、检验报告或处置依据' }}</span>
            </div>
          </section>

        </aside>
      </div>
    </section>

    <section v-else class="form-section quote-empty-state">
      <h1>没有找到{{ currentConfig.title }}</h1>
      <RouterLink class="primary-action" :to="backPath" :title="`返回${currentConfig.title}列表`">返回{{ currentConfig.title }}</RouterLink>
    </section>

    <FlowRecordPanel
      :open="showFlowRecords"
      :title="`${currentConfig.title}日志`"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />

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
.quality-standard-runtime-guard {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quality-standard-runtime-guard :deep(.operation-permission-banner) {
  flex: 1;
  min-width: 0;
}

.quality-section-stage {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.quality-section-stage > small {
  color: #7b837b;
  font-size: 11px;
  font-weight: 650;
}

.quality-summary-action {
  display: grid;
  gap: 4px;
}

.quality-summary-action strong {
  color: #344d39;
  text-align: left;
}

.quality-alternative-action {
  border-color: #d9c9aa;
  color: #765d2d;
  background: #fbf8f1;
}

.quality-alternative-action:hover:not(:disabled) {
  border-color: #c9b181;
  background: #f7f1e5;
}

.production-quality-impact {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.9fr);
  gap: 18px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid #dce4d8;
  border-radius: 10px;
  background: linear-gradient(135deg, #f8faf6 0%, #f3f7f0 100%);
}

.production-quality-impact.tone-pending {
  border-color: #e7d9bf;
  background: linear-gradient(135deg, #fcfaf5 0%, #f8f2e8 100%);
}

.production-quality-impact.tone-done {
  border-color: #d4e3d2;
  background: linear-gradient(135deg, #f7faf5 0%, #edf5eb 100%);
}

.production-quality-impact-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.production-quality-impact-copy > span {
  color: #6e806d;
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0.04em;
}

.production-quality-impact-copy > strong {
  color: #263326;
  font-size: 14px;
  line-height: 1.4;
}

.production-quality-impact-copy > p {
  margin: 0;
  color: #626b60;
  font-size: 12px;
  line-height: 1.58;
}

.production-quality-impact dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  border: 1px solid rgb(68 88 66 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 58%);
}

.production-quality-impact dl > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 10px;
  border-left: 1px solid rgb(68 88 66 / 9%);
}

.production-quality-impact dl > div:first-child {
  border-left: 0;
}

.production-quality-impact dt {
  color: #7a8277;
  font-size: 10px;
  font-weight: 620;
  line-height: 1.3;
}

.production-quality-impact dd {
  margin: 0;
  color: #2d342c;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}

.quality-disposition-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.quality-disposition-summary > span {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid #e3e7df;
  border-radius: 9px;
  background: #f8faf6;
}

.quality-disposition-summary small,
.quality-process-heading small {
  color: var(--text-muted);
  font-size: 11px;
}

.quality-disposition-summary strong {
  font-size: 14px;
}

.quality-process-stack {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.quality-process-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #dfe5da;
  border-radius: 10px;
  background: #fbfcf9;
}

.quality-process-card.reinspection {
  border-color: #d8e1d4;
  background: #f7faf5;
}

.quality-process-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.quality-process-heading > div {
  display: grid;
  gap: 3px;
}

.quality-process-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.quality-process-actions .compact-action {
  min-width: 156px;
  width: auto;
}

.quality-inline-action {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
}

.quality-inline-action .compact-action {
  width: auto;
  min-width: 176px;
  min-height: 38px;
}

.quality-readonly-lines {
  display: grid;
  gap: 10px;
}

.quality-edit-lines {
  display: grid;
  gap: 12px;
}

.quality-edit-line {
  overflow: hidden;
  border: 1px solid #dfe4db;
  border-radius: 12px;
  background: #fbfcf9;
}

.quality-edit-line > header {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 34px;
  gap: 10px;
  align-items: end;
  padding: 12px;
  border-bottom: 1px solid #e7eae4;
  background: #f7f9f5;
}

.quality-edit-product {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.quality-edit-product > span,
.quality-edit-fields .form-field > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.3;
}

.quality-edit-line > header > .mini-status,
.quality-edit-line > header > .icon-button {
  align-self: center;
}

.quality-edit-fields {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 11px 12px;
  padding: 12px;
}

.quality-edit-fields .form-field {
  grid-column: span 2;
  min-width: 0;
}

.quality-edit-fields .form-field:nth-child(4),
.quality-edit-fields .form-field:nth-child(5) {
  grid-column: span 3;
}

.quality-edit-fields.patrol-edit-fields {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.quality-edit-fields.patrol-edit-fields .form-field {
  grid-column: auto;
}

.quality-check-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}

.quality-check-editor-card {
  min-width: 0;
  padding: 13px;
  border: 1px solid #e0e5dd;
  border-radius: 11px;
  background: #fbfcfa;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.quality-check-editor-card:focus-within {
  border-color: #aabbaa;
  box-shadow: 0 0 0 3px rgb(104 132 106 / 8%);
}

.quality-check-editor-card.has-field-error {
  border-color: #d9a19a;
  background: #fffafa;
}

.quality-check-editor-card.is-abnormal {
  border-color: #e3beb7;
  background: #fffaf9;
}

.quality-check-editor-card.is-abnormal > header .mini-status {
  color: #a24d43;
  background: #f8e8e5;
}

.quality-check-editor-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quality-check-editor-card > header strong {
  color: var(--text);
  font-size: 13px;
}

.quality-check-editor-card > p {
  min-height: 36px;
  margin: 7px 0 11px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.evidence-reinspection-card {
  display: grid;
  gap: 12px;
}

.evidence-reinspection-card > .trace-summary-row,
.evidence-reinspection-heading {
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e9e1;
}

.evidence-reinspection-heading {
  align-items: center;
  margin-bottom: 0;
}

.evidence-reinspection-heading > div {
  min-width: 0;
}

.evidence-reinspection-heading strong {
  color: var(--text);
  font-size: 13px;
  line-height: 1.35;
}

.evidence-reinspection-heading span {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.evidence-reinspection-check-grid {
  margin-top: 0;
}

.evidence-reinspection-check-grid > .quality-check-editor-card:only-child {
  grid-column: 1 / -1;
}

.evidence-reinspection-origin {
  display: block;
  margin: -3px 0 10px;
  color: #8a5f42;
  font-size: 11px;
  line-height: 1.45;
}

.incoming-reinspection-result {
  display: grid;
  gap: 6px;
  margin: 0;
}

.incoming-reinspection-result > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
}

.incoming-reinspection-result dt {
  color: var(--text-muted);
  font-size: 11px;
}

.incoming-reinspection-result dd {
  margin: 0;
  color: var(--text);
  font-size: 12px;
}

.quality-check-editor-fields {
  display: grid;
  grid-template-columns: minmax(110px, 0.72fr) minmax(0, 1.5fr);
  gap: 9px;
}

.quality-check-editor-fields .form-field {
  min-width: 0;
}

.quality-check-note {
  grid-column: 1 / -1;
}

.quality-readonly-line {
  overflow: hidden;
  border: 1px solid #e2e6de;
  border-radius: 10px;
  background: #fbfcf9;
}

.quality-readonly-line > header {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  border-bottom: 1px solid #e8ebe5;
}

.quality-readonly-line > header > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.quality-readonly-line > header strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-readonly-line > header small {
  color: var(--text-muted);
  font-size: 11px;
}

.quality-readonly-line dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.quality-readonly-line dl > div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-left: 1px solid #e8ebe5;
}

.quality-readonly-line dl > div:first-child {
  border-left: 0;
}

.quality-readonly-line dt {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 650;
}

.quality-readonly-line dd {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 720;
  overflow-wrap: anywhere;
}

.quality-process-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.quality-detail-fact-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  overflow: hidden;
  border-radius: 8px;
  background: #fbfcf9;
}

.quality-detail-fact-grid > div {
  grid-column: span 2;
}

.quality-detail-fact-grid .fact-span-3 {
  grid-column: 1 / -1;
}

.quality-detail-fact-grid .fact-span-half {
  grid-column: span 3;
}

.quality-detail-fact-grid dt {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

.quality-detail-fact-grid dd {
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.quality-fact-link {
  color: #315f43;
  text-decoration: none;
  text-underline-offset: 3px;
}

.quality-fact-link:hover {
  color: #234c35;
  text-decoration: underline;
}

.quality-source-reference {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid #e0e4dc;
  border-radius: 7px;
  background: #f7f8f5;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 650;
}

.incoming-outcome-readonly-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  border: 1px solid #e4e8e1;
  border-radius: 9px;
  background: #fff;
}

.inspection-item-card .incoming-outcome-readonly-grid > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-top: 1px solid #e8ebe5;
  border-left: 1px solid #e8ebe5;
}

.inspection-item-card .incoming-outcome-readonly-grid > div:nth-child(-n + 4) {
  border-top: 0;
}

.inspection-item-card .incoming-outcome-readonly-grid > div:nth-child(4n + 1) {
  border-left: 0;
}

.incoming-outcome-readonly-grid .incoming-outcome-disposition {
  grid-column: 1 / -1;
  border-left: 0;
}

.incoming-outcome-readonly-grid dt {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
}

.incoming-outcome-readonly-grid dd {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.quality-checkpoints-section .inspection-item-card dl > div {
  grid-template-columns: 66px minmax(0, 1fr);
}

.quality-checkpoints-section .inspection-item-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.quality-checkpoints-section .inspection-item-card dd {
  text-align: left;
}

.quality-document-editor.is-detail-mode :deep(input[readonly]),
.quality-document-editor.is-detail-mode :deep(textarea[readonly]),
.quality-document-editor.is-detail-mode :deep(select:disabled),
.quality-document-editor.is-detail-mode :deep(.quantity-with-unit-field.readonly) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.quality-document-editor.is-detail-mode :deep(input[readonly]),
.quality-document-editor.is-detail-mode :deep(textarea[readonly]) {
  color: var(--text);
  font-weight: 650;
}

.quality-document-editor.is-detail-mode :deep(.quantity-with-unit-field.readonly input) {
  padding-left: 0;
  background: transparent;
}

.incoming-quality-sections > .quality-checkpoints-section {
  order: 1;
}

.incoming-quality-sections > .incoming-outcome-section {
  order: 2;
}

.incoming-quality-sections > .quality-handling-section {
  order: 3;
}

@media (max-width: 900px) {
  .production-quality-impact {
    grid-template-columns: 1fr;
  }

  .quality-disposition-summary {
    grid-template-columns: 1fr;
  }

  .quality-detail-fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quality-detail-fact-grid > div,
  .quality-detail-fact-grid .fact-span-half {
    grid-column: auto;
  }

  .quality-detail-fact-grid .fact-span-3 {
    grid-column: 1 / -1;
  }

  .quality-edit-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quality-edit-fields.patrol-edit-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quality-edit-fields .form-field,
  .quality-edit-fields .form-field:nth-child(4),
  .quality-edit-fields .form-field:nth-child(5) {
    grid-column: auto;
  }

  .quality-check-editor-grid {
    grid-template-columns: 1fr;
  }

  .quality-checkpoints-section .inspection-item-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .quality-detail-fact-grid {
    grid-template-columns: 1fr;
  }

  .quality-detail-fact-grid .fact-span-3 {
    grid-column: auto;
  }

  .incoming-outcome-readonly-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inspection-item-card .incoming-outcome-readonly-grid > div:nth-child(n) {
    border-top: 1px solid #e8ebe5;
    border-left: 1px solid #e8ebe5;
  }

  .inspection-item-card .incoming-outcome-readonly-grid > div:nth-child(-n + 2) {
    border-top: 0;
  }

  .inspection-item-card .incoming-outcome-readonly-grid > div:nth-child(odd) {
    border-left: 0;
  }

  .incoming-outcome-readonly-grid .incoming-outcome-disposition {
    grid-column: 1 / -1;
    border-left: 0;
  }
  .quality-edit-line > header {
    grid-template-columns: 38px minmax(0, 1fr) 34px;
  }

  .quality-edit-line > header > .mini-status {
    display: none;
  }

  .quality-edit-fields {
    grid-template-columns: 1fr;
  }

  .quality-edit-fields.patrol-edit-fields {
    grid-template-columns: 1fr;
  }

  .quality-check-editor-fields {
    grid-template-columns: 1fr;
  }

  .quality-check-note {
    grid-column: auto;
  }

  .quality-checkpoints-section .inspection-item-grid {
    grid-template-columns: 1fr;
  }

  .quality-readonly-line dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .quality-readonly-line dl > div:nth-child(3) {
    border-left: 0;
  }

  .quality-readonly-line dl > div:nth-child(n + 3) {
    border-top: 1px solid #e8ebe5;
  }

  .production-quality-impact dl {
    grid-template-columns: 1fr;
  }

  .production-quality-impact dl > div {
    border-top: 1px solid rgb(68 88 66 / 9%);
    border-left: 0;
  }

  .production-quality-impact dl > div:first-child {
    border-top: 0;
  }
}
</style>
