<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Boxes,
  FileText,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next';

import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import WarehouseReversalDialog from '../components/WarehouseReversalDialog.vue';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useDialogFocus } from '../composables/useDialogFocus';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { scrollElementIntoView } from '../utils/focusNavigation';
import {
  purchaseReceiptArrivalExceptionLabel,
  purchaseReceiptArrivalStateLabel,
  purchaseReceiptInboundStateLabel,
  purchaseReceiptQualityStateLabel,
} from '../utils/purchaseReceiptState';
import { purchaseMaterialVisuals } from '../data/purchase';
import {
  incomingQualityQuantityLines,
  incomingQualityRows,
  type IncomingQualityDecisionLine,
  type IncomingQualityReceipt,
} from '../data/quality';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import {
  getPurchaseReceipt,
  getPurchaseOrder,
  listReference,
  postPurchaseReceipt,
  reverseWarehouseDocument,
  submitPurchaseReceiptArrivalResult,
} from '../services/api';
import type {
  Attachment,
  FlowRecord,
  PurchaseInboundDetailProjection,
  PurchaseOrder,
  PurchaseReceipt,
  ReferenceOption,
  WarehouseReceiptProduct,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';

type WarehouseReference = {
  code: string;
  name: string;
  address?: string;
  manager?: string;
  locationOptions?: string[];
};

type IncomingQualityOutcomeLine = {
  receiptLineId?: string;
  lineId?: string;
  materialCode?: string;
  name: string;
  batch?: string;
  qty: string;
  receivedQty?: number | string;
  acceptedQty?: number | string;
  pendingQty?: number | string;
  frozenQty?: number | string;
  failedQty?: string;
  result?: string;
  qualifiedQty?: string;
  rejectedQty?: number | string;
  concessionQty?: number | string;
  disposition?: string;
  lineDisposition?: string;
};

type ReceiptLineQuantityState = {
  key: string;
  name: string;
  meta: string;
  batch: string;
  arrival: string;
  received: string;
  refused: string;
  exceptionHeld: string;
  frozen: string;
  pending: string;
  released: string;
  rejected: string;
  posted: string;
  available: string;
  qualityStatus: string;
  qualityDisposition: string;
  qualityPath: string;
  qualityCode: string;
  qualityRequired: boolean;
  receivedAmount: number | null;
  frozenAmount: number | null;
  pendingAmount: number | null;
  releasedAmount: number | null;
  rejectedAmount: number | null;
  unit: string;
};

type ReceiptPrimaryAction =
  | { kind: 'arrival'; label: string; message: string }
  | { kind: 'post'; label: string; message: string };

type ReceiptAsyncAction = 'primary' | 'reverse';
type ReceiptActionDialogMode = 'arrival' | 'post';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteWarehouse, readonlyReason: warehouseReadonlyReason } = useModulePermission('warehouse');
const { canOperate: canPostWarehouse, readonlyReason: warehousePostReadonlyReason } = useOperationPermission(
  'warehousePost',
  '确认正式入库',
);
const showFlowRecords = ref(false);
const isSaving = ref(false);
const isLoading = ref(false);
const {
  activeAction: activeReceiptAction,
  isActionPending: isReceiptActionPending,
  runAction: runReceiptAction,
} = useAsyncActionState<ReceiptAsyncAction>();
const loadMessage = ref('');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const receiptMoreActionsOpen = ref(false);
const receiptMoreActionsTrigger = ref<HTMLButtonElement | null>(null);
const reversalDialogOpen = ref(false);
const receiptActionDialogMode = ref<ReceiptActionDialogMode | null>(null);
const receiptActionDialogPanel = ref<HTMLElement | null>(null);
const receiptActionDialogSnapshot = ref<IncomingQualityReceipt | null>(null);
const selectedReceiptLineIds = ref<string[]>([]);
const {
  focusDialog: focusReceiptActionDialog,
  restoreDialogFocus: restoreReceiptActionDialogFocus,
  handleDialogTab: handleReceiptActionDialogTab,
} = useDialogFocus(receiptActionDialogPanel);
const receiptValidationAttempted = ref(false);
const receiptDraft = ref<IncomingQualityReceipt | null>(createEmptyReceipt());
const sourceOrder = ref<PurchaseOrder | null>(null);
const warehouseReferences = ref<WarehouseReference[]>([]);
const flowRecords = ref<FlowRecord[]>([]);
const receiptDetailProjection = ref<PurchaseInboundDetailProjection | null>(null);
let toastTimer: number | undefined;
const refusalReasonOptions = [
  '无有效采购订单或送货依据',
  '供应商不符',
  '物料或规格不符',
  '数量超出允许范围',
  '包装破损、受潮或污染',
  '标签或供应商批号不一致',
  '强制随货文件缺失',
  '运输条件明显异常',
  '采购通知暂停收货',
  '其他到货异常',
];

const isReadOnly = computed(() => (
  receiptActionDialogMode.value !== 'arrival'
  || receiptDraft.value?.status === '已入库'
  || !canWriteWarehouse.value
));
const isReceiptStructureLocked = computed(() => (
  receiptActionDialogMode.value !== 'arrival'
  || !canWriteWarehouse.value
  || !['草稿', '待收货'].includes(receiptDraft.value?.status || '')
));
const canEditDestinations = computed(() => (
  receiptActionDialogMode.value === 'post'
  && canWriteWarehouse.value
  && canPostWarehouse.value
  && hasReceiptInboundOpportunity(receiptDraft.value)
));
const { resetUnsavedChanges } = useUnsavedChangesGuard(receiptDraft, {
  enabled: computed(() => Boolean(receiptActionDialogMode.value)),
  ready: computed(() => !isLoading.value),
});
const referenceTitle = computed(() => `采购入库 ${receiptDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${receiptDraft.value?.supplier || '未选择供应商'} · ${receiptDraft.value?.status || ''}`);
const referencePath = computed(() => (receiptDraft.value?.code ? `/warehouse/purchase-receipts/${encodeURIComponent(receiptDraft.value.code)}` : ''));
const purchaseInboundAggregateLines = computed(() => receiptDetailProjection.value?.aggregateLines || []);
const purchaseArrivalRecords = computed(() => receiptDetailProjection.value?.arrivalRecords || []);
const reversedReceiptInboundPostings = computed(() => (
  receiptDraft.value?.inboundPostings?.filter((posting) => Boolean(posting.reversalCode)) || []
));
const receiptPostingEmptyDescription = computed(() => {
  const status = receiptDraft.value?.status || '';
  if (['草稿', '待收货'].includes(status)) return '尚未提交本次到货结果。';
  if (reversedReceiptInboundPostings.value.length) return '原入库已冲销，当前无有效过账。';
  if (receiptHasInboundOpportunity.value) return '已有放行数量，等待登记入库。';
  if (status === '待质检') return '当前没有已放行的待入库数量。';
  if (status === '质检不合格') return '当前没有可入库数量。';
  if (['异常暂收', '已拒收'].includes(status)) return '到货异常尚未形成可入库数量。';
  return '当前无有效库存过账。';
});
const pageHeading = '采购入库详情';
const receiptActionDialogTitle = computed(() => (
  receiptActionDialogMode.value === 'arrival' ? '登记到货结果' : '登记入库'
));
const receiptActionDialogDescription = computed(() => {
  const draft = receiptDraft.value;
  if (!draft) return '采购入库任务';
  if (receiptActionDialogMode.value === 'arrival') {
    return `${draft.code || '—'} · ${draft.supplier || '未记录供应商'}`;
  }
  return `${draft.code || '—'} · 正式入库`;
});
const stagingLocationOptions = computed(() => {
  const draft = receiptDraft.value;
  if (!draft) return [];
  const warehouse = warehouseReferences.value.find((row) => (
    row.code === draft.warehouseCode || row.name === draft.warehouse
  ));
  const options = warehouse?.locationOptions || [];
  return options.filter((location) => !isHistoricalWarehouseLocation(location));
});

function isHistoricalWarehouseLocation(location: string | undefined) {
  const value = String(location || '').trim();
  return !value || value === '默认库位' || /-AUTO$/i.test(value);
}

function purchaseReceiptLocationDisplay(location: string | undefined) {
  return isHistoricalWarehouseLocation(location) ? '历史库位未登记' : String(location).trim();
}
const receiptInboundAvailableLineCount = computed(() => {
  const receipt = receiptDraft.value;
  if (!receipt) return 0;
  return receipt.products.filter((product, index) => (
    receiptLineAvailableInboundQuantity(receipt, product, index) > 0.0001
  )).length;
});
const receiptHasInboundOpportunity = computed(() => receiptInboundAvailableLineCount.value > 0);
const receiptPrimaryAction = computed<ReceiptPrimaryAction | undefined>(() => {
  const status = receiptDraft.value?.status || '';

  if (status === '草稿' || status === '待收货') {
    return {
      kind: 'arrival',
      label: '提交到货结果',
      message: '到货结果已提交；接收、拒收和异常暂收数量已分别记录',
    };
  }

  if (receiptHasInboundOpportunity.value) {
    return { kind: 'post', label: '登记入库', message: '本次入库记录已生成；剩余数量可继续分批或分仓入库' };
  }

  return undefined;
});
const receiptPrimaryActionLabel = computed(() => receiptPrimaryAction.value?.label || '已锁定');
const receiptPrimaryActionRequiresPost = computed(() => Boolean(receiptPrimaryAction.value));
type ReceiptMoreAction = { key: 'reverse'; label: string; description: string; tone?: 'normal' | 'danger' };

const receiptMoreActions = computed<ReceiptMoreAction[]>(() => {
  if (!canWriteWarehouse.value) return [];
  if (receiptDraft.value?.status === '已入库' && !receiptDraft.value?.reversalCode && canPostWarehouse.value) {
    return [{ key: 'reverse', label: '冲销库存', description: '生成独立冲销记录并反向修正库存，不改写原单。', tone: 'danger' }];
  }
  return [];
});
const submitReceiptActionTitle = computed(() => {
  const status = receiptDraft.value?.status || '-';
  if (status === '已入库') return '当前采购入库任务已完成，不能重复确认。';
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (receiptPrimaryActionRequiresPost.value && !canPostWarehouse.value) return warehousePostReadonlyReason.value;
  const missing = receiptMissingSubmitFields();
  if (missing.length) return missingSubmitSummary(missing);
  return receiptPrimaryAction.value ? `${receiptPrimaryAction.value.label}：${receiptPrimaryAction.value.message}` : '当前状态不可继续流转';
});
const operationPermissionHint = computed(() => (
  !canPostWarehouse.value ? warehousePostReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u63d0\u4ea4\u8d28\u68c0\u3001\u63d0\u4ea4\u5165\u5e93\u3001\u786e\u8ba4\u5165\u5e93\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';

async function handleReceiptMoreAction(action: ReceiptMoreAction) {
  if (!receiptDraft.value) return;
  receiptMoreActionsOpen.value = false;
  if (action.key === 'reverse') {
    receiptMoreActionsTrigger.value?.focus();
    reversalDialogOpen.value = true;
  }
}

async function submitReceiptReversal(reason: string) {
  if (!receiptDraft.value) return;
  await runReceiptAction('reverse', async () => {
    try {
      const response = await reverseWarehouseDocument('purchase-receipts', receiptDraft.value!.code, {
        reason,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `receipt-reversal-${Date.now()}`,
      });
      receiptDraft.value = toPurchaseReceipt(response.record as PurchaseReceipt);
      flowRecords.value = response.flowRecords;
      reversalDialogOpen.value = false;
      await refreshReceiptReadModel(receiptDraft.value.code);
      showToast(`${response.reversal.code} 已完成库存冲销`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '采购入库库存冲销失败', 'error');
    }
  });
}

const lineItems = computed(() =>
  (receiptDraft.value?.products ?? []).map((product, index) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image: lineImage(product),
  })),
);
const receiptQualityTask = computed(() =>
  incomingQualityRows.find((row) => row.sourceDoc === receiptDraft.value?.code),
);

type ReceiptProductIdentity = WarehouseReceiptProduct & {
  id?: string;
  lineId?: string;
  receiptLineId?: string;
};

function qualityLineMatchesReceiptProduct(
  line: Pick<IncomingQualityDecisionLine, 'receiptLineId' | 'lineId' | 'materialCode' | 'name' | 'batch'>,
  product: WarehouseReceiptProduct,
  index: number,
) {
  const receiptProduct = product as ReceiptProductIdentity;
  const lineId = line.receiptLineId || line.lineId;
  const productLineId = receiptProduct.receiptLineId || receiptProduct.lineId || receiptProduct.id || `L${index + 1}`;
  if (lineId && productLineId) return lineId === productLineId;
  if (line.materialCode && product.materialCode) return line.materialCode === product.materialCode;
  if (line.batch && product.batch) return line.batch === product.batch;
  return Boolean(line.name && product.name && line.name === product.name);
}

function persistedReceiptQualityLines(receipt: IncomingQualityReceipt) {
  const quantityLines = incomingQualityQuantityLines(receipt.qualityQuantities);
  const decisionLines = incomingQualityQuantityLines(receipt.qualityDecision);
  if (!quantityLines.length) return decisionLines;
  return quantityLines.map((line, index) => {
    const decisionLine = decisionLines[index];
    return decisionLine
      ? { ...decisionLine, ...line, disposition: line.disposition || decisionLine.disposition }
      : line;
  });
}

const receiptLineQuantityStates = computed<ReceiptLineQuantityState[]>(() => {
  const draft = receiptDraft.value;
  if (!draft) return [];
  const task = receiptQualityTask.value;
  const taskLines = (task?.products ?? []) as IncomingQualityOutcomeLine[];
  const persistedLines = persistedReceiptQualityLines(draft);
  const persistedDecision = draft.qualityDecision;
  const hasReceived = !['草稿', '待收货'].includes(draft.status);

  return draft.products.map((product, index) => {
    const total = parseQuantity(product.acceptedQty ?? product.qty);
    const arrivalAmount = Number(parseQuantity(product.arrivalQty ?? product.qty) || 0);
    const acceptedArrivalAmount = Number(parseQuantity(product.acceptedQty ?? product.qty) || 0);
    const refusedArrivalAmount = Number(parseQuantity(product.refusedQty) || 0);
    const exceptionHeldAmount = Number(parseQuantity(product.exceptionHeldQty) || 0);
    const noAcceptedQuantity = hasReceived && acceptedArrivalAmount <= 0.0001;
    const fullyRefusedAtArrival = noAcceptedQuantity
      && refusedArrivalAmount > 0.0001
      && exceptionHeldAmount <= 0.0001;
    const arrivalExceptionOnly = noAcceptedQuantity
      && (refusedArrivalAmount > 0.0001 || exceptionHeldAmount > 0.0001);
    const unit = quantityUnit(product.qty, product.uom);
    const persistedLine = persistedLines.find((line) => qualityLineMatchesReceiptProduct(line, product, index))
      ?? persistedLines[index];
    const legacyLine = taskLines.find((line) => (
      (product.batch && line.batch === product.batch)
      || (product.name && line.name === product.name)
    ));
    const accepted = quantityAllocation(persistedLine?.acceptedQty) ?? quantityAllocation(legacyLine?.qualifiedQty);
    const rejected = quantityAllocation(persistedLine?.rejectedQty) ?? quantityAllocation(legacyLine?.rejectedQty);
    const concession = quantityAllocation(persistedLine?.concessionQty) ?? quantityAllocation(legacyLine?.concessionQty);
    const persistedReceivedAmount = quantityAllocation(persistedLine?.receivedQty);
    const receivedAmount = persistedReceivedAmount ?? (hasReceived ? total : 0);
    let releasedAmount = sumKnownQuantities(accepted, concession);
    let rejectedAmount = rejected;

    if (!persistedLine && legacyLine && releasedAmount === null && total !== null && ['合格', '免检放行'].includes(legacyLine.result || '')) {
      releasedAmount = total;
    }
    if (!persistedLine && legacyLine && releasedAmount === null && total !== null && legacyLine.result === '让步接收') {
      releasedAmount = total;
    }
    if (!persistedLine && legacyLine && rejectedAmount === null && total !== null && legacyLine.result === '不合格') {
      rejectedAmount = total;
    }
    if (!product.qcRequired && hasReceived && total !== null) releasedAmount = total;
    if (!persistedLine && !legacyLine && product.qcRequired && ['待入库', '已入库'].includes(draft.status) && total !== null) releasedAmount = total;

    releasedAmount ??= 0;
    rejectedAmount ??= 0;
    const pendingAmount = quantityAllocation(persistedLine?.pendingQty)
      ?? (product.qcRequired && hasReceived && receivedAmount !== null
        ? Math.max(0, receivedAmount - releasedAmount - rejectedAmount)
        : 0);
    const frozenAmount = quantityAllocation(persistedLine?.frozenQty)
      ?? pendingAmount;
    const rawQualityStatus = arrivalExceptionOnly
      ? fullyRefusedAtArrival ? '未送检（到货拒收）' : '未送检（无正常接收）'
      : product.qcRequired
        ? persistedLine?.result || persistedDecision?.status || persistedDecision?.result || legacyLine?.result || task?.status || '待检验'
        : '免检放行';
    const qualityCode = draft.qualityTaskCode
      || persistedDecision?.qualityCode
      || persistedDecision?.recordCode
      || task?.code
      || persistedDecision?.code;
    const postedAmount = receiptLinePostedQuantity(draft, product, index);
    const availableAmount = receiptLineAvailableInboundQuantity(draft, product, index);

    return {
      key: `${product.materialCode || product.name || 'line'}-${index}`,
      name: product.name || product.materialCode || '未选择物料',
      meta: [product.materialCode, product.model, product.spec].filter(Boolean).join(' · '),
      batch: product.batch || '正式入库时按物料规则生成',
      arrival: formatQuantity(arrivalAmount, unit),
      received: hasReceived && receivedAmount !== null ? formatQuantity(receivedAmount, unit) : '尚未登记',
      refused: formatQuantity(refusedArrivalAmount, unit),
      exceptionHeld: formatQuantity(exceptionHeldAmount, unit),
      frozen: formatQuantity(frozenAmount, unit),
      pending: formatQuantity(pendingAmount, unit),
      released: formatQuantity(releasedAmount, unit),
      rejected: formatQuantity(rejectedAmount, unit),
      posted: formatQuantity(postedAmount, unit),
      available: formatQuantity(availableAmount, unit),
      qualityStatus: !persistedLine && !persistedDecision && rawQualityStatus.includes('部分')
        ? `${rawQualityStatus}（历史记录）`
        : rawQualityStatus,
      qualityDisposition: fullyRefusedAtArrival
        ? '仓库当场拒收'
        : arrivalExceptionOnly
          ? '异常暂收待采购处理'
          : draft.status === '已入库' && releasedAmount > 0
        ? '已正式入库'
        : product.qcRequired
          ? persistedLine?.disposition || legacyLine?.lineDisposition || persistedDecision?.disposition || task?.disposition || '质检冻结'
          : '直接放行',
      qualityPath: '',
      qualityCode: arrivalExceptionOnly
        ? '未生成质检任务'
        : product.qcRequired ? qualityCode || '待生成质检任务' : '免检，无需质检任务',
      qualityRequired: Boolean(product.qcRequired),
      receivedAmount,
      frozenAmount,
      pendingAmount,
      releasedAmount,
      rejectedAmount,
      unit,
    };
  });
});
const receiptArrivalStatus = computed(() => {
  return purchaseReceiptArrivalStateLabel(receiptDraft.value?.status || '草稿');
});
const receiptQualityStatus = computed(() => {
  const draft = receiptDraft.value;
  if (!draft) return '未开始';
  const acceptedForInspection = draft.products.reduce(
    (sum, product) => sum + Number(parseQuantity(product.acceptedQty ?? product.qty) || 0),
    0,
  );
  const inspectionLines = receiptLineQuantityStates.value.filter((line) => line.qualityRequired);
  const pending = inspectionLines.reduce((sum, line) => sum + Number(line.pendingAmount || 0), 0);
  const released = inspectionLines.reduce((sum, line) => sum + Number(line.releasedAmount || 0), 0);
  const rejected = inspectionLines.reduce((sum, line) => sum + Number(line.rejectedAmount || 0), 0);
  return purchaseReceiptQualityStateLabel({
    requiresQuality: draft.products.some((product) => product.qcRequired),
    arrivalPending: ['草稿', '待收货', '已取消'].includes(draft.status),
    accepted: acceptedForInspection,
    pending,
    released,
    rejected,
  });
});
const receiptInboundStatus = computed(() => {
  const draft = receiptDraft.value;
  if (!draft) return '未开始';
  const posted = receiptLineQuantityStates.value.reduce((sum, line) => sum + Number(parseQuantity(line.posted) || 0), 0);
  const available = receiptLineQuantityStates.value.reduce((sum, line) => sum + Number(parseQuantity(line.available) || 0), 0);
  return purchaseReceiptInboundStateLabel({
    taskStatus: draft.status,
    stockStage: draft.stockStage,
    posted,
    available,
  });
});
const receiptExceptionStatus = computed(() => {
  const refused = receiptLineQuantityStates.value.reduce((sum, line) => sum + Number(parseQuantity(line.refused) || 0), 0);
  const held = receiptLineQuantityStates.value.reduce((sum, line) => sum + Number(parseQuantity(line.exceptionHeld) || 0), 0);
  return purchaseReceiptArrivalExceptionLabel({
    refused,
    exceptionHeld: held,
    handlingStatus: receiptDraft.value?.purchaseException?.status,
  });
});
const receiptLifecycleStatus = computed(() => {
  if (receiptDraft.value?.reversalCode) return '已冲销';
  return receiptDraft.value?.status || '—';
});
const receiptStatusPanelItems = computed<DocumentStatusItem[]>(() => [
  { key: 'arrival', label: '到货状态', value: receiptArrivalStatus.value, kind: 'status' },
  { key: 'quality', label: '质检状态', value: receiptQualityStatus.value, kind: 'status' },
  { key: 'inbound', label: '入库状态', value: receiptInboundStatus.value, kind: 'status' },
  { key: 'exception', label: '到货异常', value: receiptExceptionStatus.value, kind: 'status' },
]);
const receiptAttachments = computed<Attachment[]>(() => receiptDraft.value?.attachments ?? []);
const receiptAttachmentTitle = computed(() => {
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (receiptDraft.value?.status === '已入库') return '当前采购入库任务已完成正式入库，不能上传附件。';
  if (receiptActionDialogMode.value !== 'arrival') return '请在“登记到货结果”弹窗中上传随货资料。';
  return '上传送货单、检验报告、供应商随货资料等文件';
});
function createEmptyReceipt(): IncomingQualityReceipt {
  return {
    code: '系统自动生成',
    sourceDoc: '',
    supplierCode: '',
    supplier: '',
    contact: '',
    contactPhone: '',
    products: [],
    warehouseCode: '',
    warehouse: '',
    location: '',
    owner: '待分配',
    status: '草稿',
    date: '',
    expectedDate: '',
    note: '',
    attachments: [],
  };
}

function toPurchaseReceipt(
  source: Partial<IncomingQualityReceipt> | PurchaseReceipt,
): IncomingQualityReceipt {
  const receipt = {
    ...createEmptyReceipt(),
    ...source,
    products: source.products?.length
      ? source.products.map((product) => ({
          ...product,
          arrivalQty: product.arrivalQty || product.qty,
          acceptedQty: product.acceptedQty ?? product.qty,
          refusedQty: product.refusedQty || formatQuantity(0, product.uom || quantityUnit(product.qty)),
          exceptionHeldQty: product.exceptionHeldQty || formatQuantity(0, product.uom || quantityUnit(product.qty)),
          refusalReason: product.refusalReason || '',
          exceptionNote: product.exceptionNote || '',
          supplierBatch: product.supplierBatch || '',
        }))
      : [],
  } as IncomingQualityReceipt;
  receipt.inboundAllocations = normalizeReceiptInboundAllocationDrafts(receipt);
  return receipt;
}

function normalizeReceiptDetailProjection(
  projection: PurchaseInboundDetailProjection,
): PurchaseInboundDetailProjection {
  return {
    ...projection,
    arrivalRecords: projection.arrivalRecords.map((record) => {
      const legacyRecord = record as typeof record & { code?: string };
      return {
        ...record,
        receiptCode: record.receiptCode || legacyRecord.code || '',
      };
    }),
  };
}

function lineImage(product: Pick<WarehouseReceiptProduct, 'name' | 'imageLabel' | 'imageTone'>) {
  return (
    (product.name && purchaseMaterialVisuals[product.name]) || {
      label: product.imageLabel || '',
      tone: product.imageTone || '#eeeeee',
    }
  );
}

function receiptMaterialVisual(product: { materialCode?: string; name?: string; imageLabel?: string; imageTone?: string }) {
  const source = (receiptDraft.value?.products || []).find((item) => (
    product.materialCode && item.materialCode
      ? item.materialCode === product.materialCode
      : Boolean(product.name && item.name === product.name)
  ));
  return lineImage(source || {
    name: product.name || product.materialCode || '物料',
    imageLabel: product.imageLabel,
    imageTone: product.imageTone,
  });
}

function parseQuantity(value: string | number | undefined) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

function quantityAllocation(value: string | number | undefined) {
  return value === undefined || value === '' ? null : parseQuantity(value);
}

function quantityUnit(value: string | undefined, fallback = '') {
  const unit = String(value ?? '').replace(/[\d,.\s-]/g, '').trim();
  return unit || fallback || '件';
}

function sumKnownQuantities(...values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function formatQuantity(amount: number, unit: string) {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(amount)} ${unit}`;
}

function formatReceiptFactQuantity(amount: number, unit: string) {
  return formatQuantity(Number(amount || 0), unit || '件');
}

function currentShanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function receiptProgressPercent(amount: number, planned: number) {
  if (planned <= 0.0001) return amount > 0.0001 ? 100 : 0;
  return Math.round(Math.min(100, Math.max(0, amount / planned * 100)) * 10) / 10;
}

function receiptLinePostedQuantity(receipt: PurchaseReceipt, product: WarehouseReceiptProduct, index: number) {
  const lineId = product.lineId || `L${index + 1}`;
  return (receipt.postedQuantities?.lines || [])
    .filter((line) => line.receiptLineId === lineId)
    .reduce((sum, line) => sum + Number(line.postedQty || 0), 0);
}

function receiptLineAvailableInboundQuantity(
  receipt: PurchaseReceipt | null,
  product: WarehouseReceiptProduct,
  index: number,
) {
  if (!receipt || ['草稿', '待收货', '已拒收', '异常暂收'].includes(receipt.status || '')) return 0;
  const lineId = product.lineId || `L${index + 1}`;
  const decisionLine = receipt.qualityDecision?.lines?.find((line) => (
    (line.receiptLineId || line.lineId) === lineId
  ));
  const disposition = receipt.qualityDispositionQuantities?.[lineId];
  const acceptedQty = Number(parseQuantity(product.acceptedQty ?? product.qty) || 0);
  const eligible = decisionLine
    ? Number(decisionLine.releasedQty || 0)
      + Number(disposition?.approvedConcessionQty || 0)
      + Number(disposition?.reinspectionAcceptedQty || 0)
    : product.qcRequired
      ? ['待入库', '部分入库', '已入库'].includes(receipt.status || '') ? acceptedQty : 0
      : acceptedQty;
  return Math.max(0, eligible - receiptLinePostedQuantity(receipt, product, index));
}

function hasReceiptInboundOpportunity(receipt: PurchaseReceipt | null) {
  return Boolean(receipt?.products.some((product, index) => (
    receiptLineAvailableInboundQuantity(receipt, product, index) > 0.0001
  )));
}

function normalizeReceiptInboundAllocationDrafts(receipt: IncomingQualityReceipt) {
  if (receipt.inboundAllocations?.length) {
    return receipt.inboundAllocations.map((allocation, index) => {
      const product = receipt.products.find((item, productIndex) => (
        (item.lineId || `L${productIndex + 1}`) === allocation.receiptLineId
      ));
      const unit = product?.uom || quantityUnit(product?.acceptedQty || product?.qty);
      return {
        ...allocation,
        id: allocation.id || `A${index + 1}`,
        quantity: String(allocation.quantity || '').trim()
          ? formatQuantity(Number(parseQuantity(allocation.quantity) || 0), unit)
          : '',
      };
    });
  }
  return receipt.products.flatMap((product, index) => {
    const quantity = receiptLineAvailableInboundQuantity(receipt, product, index);
    if (quantity <= 0.0001) return [];
    return [{
      id: `A${index + 1}`,
      receiptLineId: product.lineId || `L${index + 1}`,
      quantity: '',
      warehouseCode: product.destinationWarehouseCode || '',
      warehouse: product.destinationWarehouse || '',
      location: product.destinationLocation || '',
    }];
  });
}

function receiptLineHasArrivalException(product: WarehouseReceiptProduct) {
  return Number(parseQuantity(product.refusedQty) || 0) > 0.0001
    || Number(parseQuantity(product.exceptionHeldQty) || 0) > 0.0001;
}

function setReceiptLineArrivalResult(index: number, result: 'accept' | 'refuse') {
  const product = receiptDraft.value?.products[index];
  if (!product || isReceiptStructureLocked.value) return;
  const unit = product.uom || quantityUnit(product.arrivalQty || product.qty);
  const enteredArrival = Number(parseQuantity(product.arrivalQty || product.qty) || 0);
  const sourceFact = receiptLineSourceFact(product, index);
  const arrival = enteredArrival > 0.0001
    ? enteredArrival
    : Number(sourceFact?.remaining || sourceFact?.receivableRemaining || 0);
  product.arrivalQty = formatQuantity(arrival, unit);
  product.acceptedQty = formatQuantity(result === 'accept' ? arrival : 0, unit);
  product.qty = product.acceptedQty;
  product.refusedQty = formatQuantity(result === 'refuse' ? arrival : 0, unit);
  product.exceptionHeldQty = formatQuantity(0, unit);
  if (result === 'accept') {
    product.refusalReason = '';
    product.exceptionNote = '';
  }
}

function addInboundAllocation(receiptLineId: string) {
  if (!receiptDraft.value || !canEditDestinations.value) return;
  const productIndex = receiptDraft.value.products.findIndex((product, index) => (
    (product.lineId || `L${index + 1}`) === receiptLineId
  ));
  if (productIndex < 0) return;
  receiptDraft.value.inboundAllocations ||= [];
  receiptDraft.value.inboundAllocations.push({
    id: `A${Date.now()}`,
    receiptLineId,
    quantity: '',
    warehouseCode: '',
    warehouse: '',
    location: '',
  });
}

function removeInboundAllocation(index: number) {
  if (!receiptDraft.value?.inboundAllocations || !canEditDestinations.value) return;
  receiptDraft.value.inboundAllocations.splice(index, 1);
}

function receiptLineSourceFact(product: WarehouseReceiptProduct, index: number) {
  if (receiptDraft.value?.sourceType === 'purchase_after_sale') {
    const plannedQty = product.plannedQty || product.qty;
    const unit = product.uom || quantityUnit(plannedQty);
    const planned = Number(parseQuantity(plannedQty) || 0);
    const arrived = ['草稿', '待收货'].includes(receiptDraft.value.status || '')
      ? 0
      : Number(parseQuantity(product.arrivalQty || product.qty) || 0);
    return {
      ordered: planned,
      arrived,
      remaining: Math.max(0, planned - arrived),
      receivableRemaining: Math.max(0, planned - arrived),
      tolerancePercent: 0,
      closed: 0,
      unit,
      remedy: true,
    };
  }
  const order = sourceOrder.value;
  if (!order) return null;
  const sourceLineId = product.sourceLineId || product.lineId || `L${index + 1}`;
  const sourceLine = order.progressFacts?.lines?.find((item) => item.lineId === sourceLineId);
  const materialCandidates = order.progressFacts?.lines?.filter((item) => (
    Boolean(product.materialCode) && item.materialCode === product.materialCode
  )) || [];
  const line = sourceLine || (materialCandidates.length === 1 ? materialCandidates[0] : undefined);
  if (!line) return null;
  const ordered = Number(line.orderedQty || 0);
  const arrived = Number(line.arrivedQty || 0);
  return {
    ordered,
    arrived,
    remaining: Number(line.remainingQty ?? Math.max(0, ordered - arrived)),
    receivableRemaining: Number(line.remainingReceivableQty ?? Math.max(0, ordered - arrived)),
    tolerancePercent: Number(line.overReceiptTolerancePercent || 0),
    closed: Number(line.closedQty || 0),
    unit: product.uom || line.uom || '',
    remedy: false,
  };
}

function receiptLineRemainingText(product: WarehouseReceiptProduct, index: number) {
  const fact = receiptLineSourceFact(product, index);
  return fact ? formatQuantity(fact.remaining, fact.unit) : '—';
}

function receiptLineReceivableText(product: WarehouseReceiptProduct, index: number) {
  const fact = receiptLineSourceFact(product, index);
  return fact ? formatQuantity(fact.receivableRemaining, fact.unit) : '—';
}

function receiptLineExceedsLimit(product: WarehouseReceiptProduct, index: number) {
  if (!['草稿', '待收货'].includes(receiptDraft.value?.status || '')) return false;
  const fact = receiptLineSourceFact(product, index);
  const quantity = Number(parseQuantity(product.acceptedQty ?? product.qty) || 0)
    + Number(parseQuantity(product.exceptionHeldQty) || 0);
  return Boolean(fact && quantity > fact.receivableRemaining + 0.0001);
}

function warehouseLocationOptions(code?: string, name?: string) {
  return warehouseReferences.value.find((row) => row.code === code || row.name === name)?.locationOptions || [];
}

function synchronizeStagingLocation() {
  const draft = receiptDraft.value;
  if (!draft || !['草稿', '待收货'].includes(draft.status || '')) return;
  const options = warehouseLocationOptions(draft.warehouseCode, draft.warehouse);
  if (options.length === 1) draft.location = options[0];
  else if (draft.location && options.length && !options.includes(draft.location)) draft.location = '';
}

async function loadWarehouseReferences() {
  const response = await listReference<WarehouseReference>('warehouses', {
    activeOnly: true,
    company: receiptDraft.value?.company || undefined,
    limit: 50,
  });
  warehouseReferences.value = response.items.map((option) => option.raw as WarehouseReference);
  synchronizeStagingLocation();
}

async function loadReceipt() {
  isLoading.value = true;
  loadMessage.value = '';
  receiptActionDialogMode.value = null;
  receiptActionDialogSnapshot.value = null;
  sourceOrder.value = null;
  receiptDetailProjection.value = null;
  receiptDraft.value = null;
  flowRecords.value = [];

  try {
    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    const response = await getPurchaseReceipt(code);
    receiptDraft.value = toPurchaseReceipt(response.receipt);
    flowRecords.value = response.flowRecords;
    receiptDetailProjection.value = normalizeReceiptDetailProjection(response.detailProjection);
    await loadWarehouseReferences();
    if (response.receipt.sourceDoc) {
      try {
        const orderResponse = await getPurchaseOrder(response.receipt.sourceDoc);
        sourceOrder.value = orderResponse.order;
      } catch {
        loadMessage.value = '来源采购订单进度暂时无法读取，本次可收数量仍会在保存时由系统校验。';
      }
    }
  } catch (error) {
    receiptDraft.value = null;
    flowRecords.value = [];
    receiptDetailProjection.value = null;
    loadMessage.value = error instanceof Error ? error.message : '采购入库任务加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function refreshReceiptReadModel(code: string) {
  const response = await getPurchaseReceipt(code);
  receiptDraft.value = toPurchaseReceipt(response.receipt);
  flowRecords.value = response.flowRecords;
  receiptDetailProjection.value = normalizeReceiptDetailProjection(response.detailProjection);
}

function handleInboundAllocationWarehouseSelect(index: number, option: ReferenceOption) {
  const allocation = receiptDraft.value?.inboundAllocations?.[index];
  if (!allocation || !canEditDestinations.value) return;
  if (!option.code && !option.name) {
    allocation.warehouseCode = '';
    allocation.warehouse = '';
    allocation.location = '';
    return;
  }
  const warehouse = option.raw as WarehouseReference;
  allocation.warehouseCode = warehouse.code;
  allocation.warehouse = warehouse.name;
  if (!warehouseReferences.value.some((row) => row.code === warehouse.code)) {
    warehouseReferences.value.push(warehouse);
  }
  allocation.location = warehouse.locationOptions?.length === 1 ? warehouse.locationOptions[0] : '';
}

function handleStagingWarehouseSelect(option: ReferenceOption) {
  const draft = receiptDraft.value;
  if (!draft || receiptActionDialogMode.value !== 'arrival') return;
  if (!option.code && !option.name) {
    draft.warehouseCode = '';
    draft.warehouse = '';
    draft.location = '';
    return;
  }
  const warehouse = option.raw as WarehouseReference;
  draft.warehouseCode = warehouse.code;
  draft.warehouse = warehouse.name;
  if (!warehouseReferences.value.some((row) => row.code === warehouse.code)) {
    warehouseReferences.value.push(warehouse);
  }
  draft.location = warehouse.locationOptions?.length === 1 ? warehouse.locationOptions[0] : '';
}

function inboundAllocationProduct(receiptLineId: string) {
  const products = receiptDraft.value?.products || [];
  return products.find((product, index) => (product.lineId || `L${index + 1}`) === receiptLineId);
}

function inboundAllocationVisual(receiptLineId: string) {
  const products = receiptDraft.value?.products || [];
  const index = products.findIndex((product, productIndex) => (
    (product.lineId || `L${productIndex + 1}`) === receiptLineId
  ));
  return lineItems.value[index]?.image || { label: '', tone: '#e8ebe4' };
}

function inboundAllocationQuantityLabel(allocation: { receiptLineId: string; quantity?: string }) {
  const product = inboundAllocationProduct(allocation.receiptLineId);
  const unit = product?.uom || quantityUnit(product?.acceptedQty || product?.qty);
  return formatQuantity(parseQuantity(allocation.quantity) || 0, unit);
}

function inboundAllocationUnallocatedQuantity(receiptLineId: string) {
  const receipt = receiptDraft.value;
  if (!receipt) return 0;
  const index = receipt.products.findIndex((product, productIndex) => (
    (product.lineId || `L${productIndex + 1}`) === receiptLineId
  ));
  if (index < 0) return 0;
  const available = receiptLineAvailableInboundQuantity(receipt, receipt.products[index], index);
  const allocated = (receipt.inboundAllocations || [])
    .filter((allocation) => allocation.receiptLineId === receiptLineId)
    .reduce((sum, allocation) => sum + Number(parseQuantity(allocation.quantity) || 0), 0);
  return Math.max(0, available - allocated);
}

function inboundAllocationAvailableLabel(receiptLineId: string) {
  const product = inboundAllocationProduct(receiptLineId);
  if (!product) return '—';
  const unit = product.uom || quantityUnit(product.acceptedQty || product.qty);
  return formatQuantity(inboundAllocationUnallocatedQuantity(receiptLineId), unit);
}

function inboundAllocationLocationOptions(warehouseCode?: string, warehouseName?: string) {
  return warehouseLocationOptions(warehouseCode, warehouseName);
}

function receiptLineSelectionKey(product: WarehouseReceiptProduct, index: number) {
  return String(product.lineId || product.sourceLineId || product.materialCode || `${product.name || 'receipt-line'}-${index}`);
}

function receiptLineIsSelected(product: WarehouseReceiptProduct, index: number) {
  return receiptActionDialogMode.value === 'arrival'
    && selectedReceiptLineIds.value.includes(receiptLineSelectionKey(product, index));
}

function toggleReceiptLine(product: WarehouseReceiptProduct, index: number, selected: boolean) {
  const key = receiptLineSelectionKey(product, index);
  if (selected) {
    if (!selectedReceiptLineIds.value.includes(key)) selectedReceiptLineIds.value.push(key);
    return;
  }
  selectedReceiptLineIds.value = selectedReceiptLineIds.value.filter((lineId) => lineId !== key);
}

function selectedReceiptProducts() {
  const draft = receiptDraft.value;
  if (!draft) return [];
  return draft.products
    .map((product, index) => ({ product, index }))
    .filter(({ product, index }) => receiptLineIsSelected(product, index));
}

function receiptLineCurrentArrivalText(product: WarehouseReceiptProduct, index: number) {
  const unit = product.uom || quantityUnit(product.arrivalQty || product.qty);
  const quantity = receiptLineIsSelected(product, index)
    ? Number(parseQuantity(product.arrivalQty) || 0)
    : 0;
  return formatQuantity(quantity, unit);
}

function cloneReceiptDraft(receipt: IncomingQualityReceipt) {
  return JSON.parse(JSON.stringify(receipt)) as IncomingQualityReceipt;
}

function openReceiptActionDialog(dialogMode: ReceiptActionDialogMode) {
  const draft = receiptDraft.value;
  if (!draft || !canWriteWarehouse.value) {
    showToast(warehouseReadonlyReason.value, 'error');
    return;
  }
  if (dialogMode === 'arrival' && !['草稿', '待收货'].includes(draft.status)) {
    showToast('到货结果已经提交，不能重复登记。', 'error');
    return;
  }
  if (dialogMode === 'post' && (!canPostWarehouse.value || !receiptHasInboundOpportunity.value)) {
    showToast(
      !canPostWarehouse.value ? warehousePostReadonlyReason.value : '当前没有可登记正式入库的数量。',
      'error',
    );
    return;
  }
  receiptActionDialogSnapshot.value = cloneReceiptDraft(draft);
  if (dialogMode === 'arrival') {
    if (!draft.date) draft.date = currentShanghaiDate();
    if (draft.location === 'QC-AUTO') draft.location = '';
    selectedReceiptLineIds.value = draft.products.map(receiptLineSelectionKey);
  }
  if (dialogMode === 'post') {
    selectedReceiptLineIds.value = [];
    draft.inboundAllocations = normalizeReceiptInboundAllocationDrafts(draft);
  }
  receiptValidationAttempted.value = false;
  receiptActionDialogMode.value = dialogMode;
  resetUnsavedChanges();
  focusReceiptActionDialog();
}

async function closeReceiptActionDialog() {
  if (isReceiptActionPending.value || isSaving.value) return;
  if (receiptActionDialogSnapshot.value) {
    receiptDraft.value = cloneReceiptDraft(receiptActionDialogSnapshot.value);
  }
  receiptActionDialogSnapshot.value = null;
  receiptActionDialogMode.value = null;
  selectedReceiptLineIds.value = [];
  receiptValidationAttempted.value = false;
  resetUnsavedChanges();
  restoreReceiptActionDialogFocus();
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (isReadOnly.value) {
    input.value = '';
    showToast(receiptAttachmentTitle.value, 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!files.length || !receiptDraft.value) return;
  receiptDraft.value.attachments = [...(receiptDraft.value.attachments ?? []), ...files];
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，提交后随本次到货结果保留。`);
}

function missingSubmitSummary(labels: string[]) {
  return `请先补齐：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '等' : ''}`;
}

function receiptMissingArrivalBaseFields() {
  const draft = receiptDraft.value;
  if (!draft) return ['单据信息'];

  const missing: string[] = [];
  const selectedLines = receiptActionDialogMode.value === 'arrival'
    ? selectedReceiptProducts()
    : draft.products.map((product, index) => ({ product, index }));
  if (!draft.sourceDoc) missing.push('来源采购订单');
  if (!draft.supplier) missing.push('供应商');
  if (!draft.warehouse) missing.push('采购暂存仓');
  if (!selectedLines.length || selectedLines.some(({ product, index }) => {
    const arrival = Number(parseQuantity(product.arrivalQty) || 0);
    const accepted = Number(parseQuantity(product.acceptedQty ?? product.qty) || 0);
    const refused = Number(parseQuantity(product.refusedQty) || 0);
    const exceptionHeld = Number(parseQuantity(product.exceptionHeldQty) || 0);
    const hasDraftQuantity = arrival > 0.0001
      || accepted > 0.0001
      || refused > 0.0001
      || exceptionHeld > 0.0001;
    return !product.name
      || (hasDraftQuantity && (
        arrival <= 0.0001
        || Math.abs(arrival - accepted - refused - exceptionHeld) > 0.0001
        || receiptLineExceedsLimit(product, index)
      ));
  })) missing.push('本次到货结果');
  return missing;
}

function receiptMissingSubmitFields() {
  const draft = receiptDraft.value;
  if (!draft) return ['单据信息'];
  const missing = receiptMissingArrivalBaseFields();
  const selectedLines = receiptActionDialogMode.value === 'arrival'
    ? selectedReceiptProducts()
    : draft.products.map((product, index) => ({ product, index }));
  if (!draft.date || draft.date > currentShanghaiDate()) missing.push('实际到货日期');
  if (!draft.location) missing.push('暂存库位');
  if (['草稿', '待收货'].includes(draft.status) && selectedLines.some(({ product, index }) => (
    Number(parseQuantity(product.arrivalQty) || 0) <= 0
    || Math.abs(
      Number(parseQuantity(product.arrivalQty) || 0)
      - Number(parseQuantity(product.acceptedQty ?? product.qty) || 0)
      - Number(parseQuantity(product.refusedQty) || 0)
      - Number(parseQuantity(product.exceptionHeldQty) || 0)
    ) > 0.0001
    || receiptLineExceedsLimit(product, index)
  ))) missing.push('本次到货数量');
  if (['草稿', '待收货'].includes(draft.status) && selectedLines.some(({ product }) => (
    receiptLineHasArrivalException(product)
    && (!product.refusalReason || !product.exceptionNote)
  ))) missing.push('到货异常说明');
  if (receiptPrimaryAction.value?.kind === 'post' && (
    !draft.inboundAllocations?.length
    || draft.inboundAllocations.some((allocation) => (
      Number(parseQuantity(allocation.quantity) || 0) <= 0
      || !allocation.warehouseCode
      || !allocation.warehouse
      || !allocation.location
    ))
  )) missing.push('本次入库分配');
  return missing;
}

function receiptRequiredLabelClass(label: string) {
  const missing = receiptMissingSubmitFields();
  const aliases: Record<string, string[]> = {
    暂存库位: ['暂存库位'],
  };
  const keys = [label, ...(aliases[label] ?? [])];
  return {
    'required-label': true,
    'has-field-error': receiptValidationAttempted.value && keys.some((key) => missing.includes(key)),
  };
}

function receiptRequiredFieldClass(label: string) {
  return {
    'has-field-error': Boolean(receiptRequiredLabelClass(label)['has-field-error']),
  };
}

function receiptLineQtyClass(product: WarehouseReceiptProduct, index: number) {
  const arrival = Number(parseQuantity(product.arrivalQty) || 0);
  const accepted = Number(parseQuantity(product.acceptedQty ?? product.qty) || 0);
  const refused = Number(parseQuantity(product.refusedQty) || 0);
  const held = Number(parseQuantity(product.exceptionHeldQty) || 0);
  return {
    'has-line-field-error': receiptValidationAttempted.value && receiptLineIsSelected(product, index) && (
      arrival <= 0
      || Math.abs(arrival - accepted - refused - held) > 0.0001
      || receiptLineExceedsLimit(product, index)
    ),
  };
}

function scrollToFirstValidationError() {
  void nextTick(() => {
    const marker = document.querySelector(
      '.form-field .has-field-error, .form-field.has-field-error, .quote-line-table.has-field-error, .quote-line-row .has-line-field-error',
    ) as HTMLElement | null;
    const target = (marker?.closest('.form-field, .quote-line-table, .quote-line-row') as HTMLElement | null) ?? marker;
    const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
    scrollElementIntoView(target);
    focusTarget?.focus();
  });
}

function showReceiptValidationError(message: string) {
  showToast(message, 'error');
  scrollToFirstValidationError();
  return false;
}

function validateReceipt() {
  const draft = receiptDraft.value;
  if (!draft) return false;

  receiptValidationAttempted.value = true;
  const missing = receiptMissingSubmitFields();
  if (missing.length) return showReceiptValidationError(missingSubmitSummary(missing));
  receiptValidationAttempted.value = false;
  return true;
}

async function submitReceipt() {
  const action = receiptPrimaryAction.value;
  if (!action) {
    showToast('当前状态不可继续流转', 'error');
    return;
  }
  if (!canWriteWarehouse.value || !canPostWarehouse.value) {
    showToast(submitReceiptActionTitle.value, 'error');
    return;
  }
  if (!validateReceipt()) return;
  await runReceiptAction('primary', async () => {
    const inboundAllocations = action.kind === 'post'
      ? (receiptDraft.value?.inboundAllocations || []).map((allocation) => ({ ...allocation }))
      : undefined;
    const submitted = receiptDraft.value;
    if (!submitted) return;

    isSaving.value = true;
    try {
      if (action.kind === 'post') {
        const response = await postPurchaseReceipt(submitted.code, {
          allocations: inboundAllocations,
          idempotencyKey: globalThis.crypto?.randomUUID?.() || `purchase-inbound-${Date.now()}`,
        });
        receiptDraft.value = toPurchaseReceipt(response.receipt);
        flowRecords.value = response.flowRecords;
        resetUnsavedChanges();
        showToast(action.message);
        receiptActionDialogMode.value = null;
        receiptActionDialogSnapshot.value = null;
        restoreReceiptActionDialogFocus();
        await router.replace(`/warehouse/purchase-receipts/${encodeURIComponent(response.receipt.code)}`);
        await refreshReceiptReadModel(response.receipt.code);
        return;
      }

      const response = await submitPurchaseReceiptArrivalResult(submitted.code, {
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `purchase-arrival-${Date.now()}`,
        receipt: {
          ...cloneReceiptDraft(submitted),
          products: submitted.products.filter((product, index) => receiptLineIsSelected(product, index)),
        } as PurchaseReceipt,
      });
      receiptDraft.value = toPurchaseReceipt(response.receipt);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast(action.message);
      receiptActionDialogMode.value = null;
      receiptActionDialogSnapshot.value = null;
      selectedReceiptLineIds.value = [];
      restoreReceiptActionDialogFocus();
      await router.replace(`/warehouse/purchase-receipts/${encodeURIComponent(submitted.code)}`);
      await refreshReceiptReadModel(submitted.code);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '采购入库处理失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
  return false;
}

watch(() => route.fullPath, loadReceipt, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="receiptDraft" class="quote-editor warehouse-document-editor purchase-receipt-editor is-detail-view">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/warehouse/purchase-receipts" aria-label="返回采购入库列表" title="返回采购入库列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ receiptDraft.code }}</strong>
        </template>

        <template #actions>
          <PinReferenceButton
            v-if="referencePath"
            class="topbar-optional-action"
            :title="referenceTitle"
            :subtitle="referenceSubtitle"
            :path="referencePath"
          />
          <button class="secondary-action topbar-optional-action" type="button" title="查看采购入库流转日志" @click="showFlowRecords = true">
            <FileText :size="15" />
            日志
          </button>
          <RouterLink
            v-if="receiptDraft.status === '已入库'"
            class="secondary-action"
            :to="`/warehouse/stock-ledger?keyword=${encodeURIComponent(receiptDraft.code)}`"
            title="按本采购入库任务号查看库存流水"
          >
            <Boxes :size="15" />
            库存流水
          </RouterLink>
          <div
            v-if="receiptMoreActions.length"
            class="order-more-action-wrap"
            @keydown.esc.stop="receiptMoreActionsOpen = false"
          >
            <button
              ref="receiptMoreActionsTrigger"
              class="secondary-action"
              type="button"
              title="更多操作"
              aria-haspopup="menu"
              aria-controls="detail-more-menu"
              :aria-expanded="receiptMoreActionsOpen"
              @click="receiptMoreActionsOpen = !receiptMoreActionsOpen"
            >
              更多
            </button>
            <div v-if="receiptMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
              <button
                v-for="action in receiptMoreActions"
                :key="action.key"
                type="button"
                role="menuitem"
                :class="{ 'danger-option': action.tone === 'danger' }"
                :title="action.description"
                @click="handleReceiptMoreAction(action)"
              >
                <strong>{{ action.label }}</strong>
                <span>{{ action.description }}</span>
              </button>
            </div>
          </div>
          <template v-if="['草稿', '待收货'].includes(receiptDraft.status)">
            <button
              v-if="canWriteWarehouse"
              class="primary-action"
              type="button"
              title="打开到货结果登记窗口"
              @click="openReceiptActionDialog('arrival')"
            >
              <Pencil :size="15" />
              登记到货结果
            </button>
            <button v-else class="primary-action" type="button" disabled :title="warehouseReadonlyReason">
              <Pencil :size="15" />
              登记到货结果
            </button>
          </template>
          <button
            v-else-if="receiptPrimaryAction?.kind === 'post' && canWriteWarehouse && canPostWarehouse"
            class="primary-action"
            type="button"
            title="打开入库登记窗口"
            @click="openReceiptActionDialog('post')"
          >
            <Send :size="15" />
            登记入库
          </button>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="receiptDraft.reversalCode" class="warehouse-reversal-notice" aria-label="库存冲销记录">
        <div>
          <span>独立纠错记录</span>
          <strong>{{ receiptDraft.reversalCode }} 已冲销本单库存影响</strong>
          <small>{{ receiptDraft.reversalReason }} · {{ receiptDraft.reversedBy }} · {{ receiptDraft.reversedAt }}</small>
        </div>
        <b>原单状态保留</b>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>任务概览</h2>
            </div>

            <div class="quote-fields receipt-overview-fields">
              <label class="form-field">
                <span>采购入库任务号</span>
                <output class="form-readonly-value quote-code">{{ receiptDraft.code || '—' }}</output>
              </label>
              <label class="form-field" :class="receiptRequiredFieldClass('来源采购订单')">
                <span :class="receiptRequiredLabelClass('来源采购订单')">
                  {{ receiptDraft.sourceType === 'purchase_after_sale' ? '来源单据' : '来源采购订单' }}
                </span>
                <div v-if="receiptDraft.sourceType === 'purchase_after_sale'" class="form-readonly-value receipt-source-links">
                  <RouterLink
                    class="quote-code"
                    :to="`/purchase/orders/${encodeURIComponent(receiptDraft.sourceDoc)}`"
                    title="查看来源采购订单"
                  >采购订单 {{ receiptDraft.sourceDoc || '—' }}</RouterLink>
                  <RouterLink
                    class="quote-code"
                    :to="`/purchase/after-sales/${encodeURIComponent(receiptDraft.sourceAfterSale || receiptDraft.purchaseAfterSaleCode || '')}`"
                    title="查看来源采购售后"
                  >采购售后 {{ receiptDraft.sourceAfterSale || receiptDraft.purchaseAfterSaleCode || '—' }}</RouterLink>
                </div>
                <RouterLink
                  v-else
                  class="form-readonly-value quote-code"
                  :to="`/purchase/orders/${encodeURIComponent(receiptDraft.sourceDoc)}`"
                  title="来源采购只读展示；仓库无需进入采购模块操作"
                >{{ receiptDraft.sourceDoc || '-' }}</RouterLink>
              </label>
              <label class="form-field" :class="receiptRequiredFieldClass('供应商')">
                <span :class="receiptRequiredLabelClass('供应商')">供应商</span>
                <output class="form-readonly-value">{{ receiptDraft.supplier || '选择来源后带出' }}</output>
              </label>
              <label class="form-field">
                <span>公司</span>
                <output class="form-readonly-value">{{ receiptDraft.company || '选择来源后带出' }}</output>
              </label>
              <label class="form-field">
                <span>{{ receiptDraft.sourceType === 'purchase_after_sale' ? '原订单预计到货' : '预计到货日期' }}</span>
                <output class="form-readonly-value">
                  {{ receiptDetailProjection?.sourceOrderReceiving?.expectedDate || receiptDraft.expectedDate || '—' }}
                </output>
              </label>
              <label class="form-field">
                <span>{{ receiptDraft.sourceType === 'purchase_after_sale' ? '原订单到货方式' : '到货方式' }}</span>
                <output class="form-readonly-value">
                  {{ receiptDetailProjection?.sourceOrderReceiving?.deliveryMethod || '—' }}
                </output>
              </label>
              <label class="form-field">
                <span>{{ receiptDraft.sourceType === 'purchase_after_sale' ? '原订单计划暂存仓' : '计划暂存仓' }}</span>
                <output class="form-readonly-value">
                  {{ receiptDetailProjection?.sourceOrderReceiving?.warehouse || '—' }}
                </output>
              </label>
              <label class="form-field receipt-overview-address">
                <span>{{ receiptDraft.sourceType === 'purchase_after_sale' ? '原订单收货地址' : '收货地址' }}</span>
                <output class="form-readonly-value">
                  {{ receiptDetailProjection?.sourceOrderReceiving?.receivingAddress || '—' }}
                </output>
              </label>
              <label class="form-field">
                <span>内部收货联系人</span>
                <output class="form-readonly-value">
                  {{ receiptDetailProjection?.sourceOrderReceiving?.receivingContact || '—' }}
                </output>
              </label>
              <label class="form-field receipt-overview-phone">
                <span>内部收货电话</span>
                <output class="form-readonly-value">
                  {{ receiptDetailProjection?.sourceOrderReceiving?.receivingPhone || '—' }}
                </output>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>到货与入库进度</h2>
            </div>

            <div v-if="purchaseInboundAggregateLines.length" class="purchase-inbound-summary-list">
              <article
                v-for="line in purchaseInboundAggregateLines"
                :key="line.key"
                class="purchase-inbound-summary-card"
              >
                <header class="purchase-inbound-summary-head">
                  <div class="purchase-inbound-summary-material">
                    <MaterialIdentity
                      :name="line.name"
                      :code="line.materialCode"
                      :model="line.model"
                      :spec="line.spec"
                      :image-label="receiptMaterialVisual(line).label"
                      :image-tone="receiptMaterialVisual(line).tone"
                    />
                    <span class="purchase-inbound-material-plan">
                      <b>{{ receiptDetailProjection?.scopeType === 'purchase_after_sale' ? '补发计划' : '采购计划' }}</b>
                      {{ formatReceiptFactQuantity(line.plannedQty, line.uom) }}
                    </span>
                  </div>
                </header>
                <div class="purchase-inbound-progress-pair">
                  <div>
                    <header>
                      <span>到货进度</span>
                      <strong>{{ receiptProgressPercent(line.arrivalQty, line.plannedQty) }}%</strong>
                    </header>
                    <div
                      class="purchase-inbound-progress-track"
                      role="progressbar"
                      aria-label="到货进度"
                      :aria-valuenow="receiptProgressPercent(line.arrivalQty, line.plannedQty)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <i :style="{ width: `${receiptProgressPercent(line.arrivalQty, line.plannedQty)}%` }"></i>
                    </div>
                  </div>
                  <div>
                    <header>
                      <span>入库进度</span>
                      <strong>{{ receiptProgressPercent(line.postedQty, line.plannedQty) }}%</strong>
                    </header>
                    <div
                      class="purchase-inbound-progress-track is-posted"
                      role="progressbar"
                      aria-label="入库进度"
                      :aria-valuenow="receiptProgressPercent(line.postedQty, line.plannedQty)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <i :style="{ width: `${receiptProgressPercent(line.postedQty, line.plannedQty)}%` }"></i>
                    </div>
                  </div>
                </div>
                <div class="purchase-inbound-summary-groups">
                  <section>
                    <h3>到货总计</h3>
                    <dl>
                      <div>
                        <dt>累计到货</dt>
                        <dd>{{ formatReceiptFactQuantity(line.arrivalQty, line.uom) }}</dd>
                      </div>
                      <div>
                        <dt>正常接收</dt>
                        <dd>{{ formatReceiptFactQuantity(line.acceptedQty, line.uom) }}</dd>
                      </div>
                      <div>
                        <dt>待到货</dt>
                        <dd>{{ formatReceiptFactQuantity(line.remainingQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.refusedQty > 0.0001">
                        <dt>当场拒收</dt>
                        <dd>{{ formatReceiptFactQuantity(line.refusedQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.exceptionHeldQty > 0.0001">
                        <dt>异常暂收</dt>
                        <dd>{{ formatReceiptFactQuantity(line.exceptionHeldQty, line.uom) }}</dd>
                      </div>
                    </dl>
                  </section>
                  <section>
                    <h3>质检与入库总计</h3>
                    <dl v-if="line.qcPendingQty > 0.0001 || line.releasedQty > 0.0001 || line.rejectedQty > 0.0001 || line.postedQty > 0.0001 || line.availableQty > 0.0001">
                      <div v-if="line.qcPendingQty > 0.0001">
                        <dt>质检中</dt>
                        <dd>{{ formatReceiptFactQuantity(line.qcPendingQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.releasedQty > 0.0001">
                        <dt>已放行</dt>
                        <dd>{{ formatReceiptFactQuantity(line.releasedQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.rejectedQty > 0.0001">
                        <dt>不合格隔离</dt>
                        <dd>{{ formatReceiptFactQuantity(line.rejectedQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.postedQty > 0.0001">
                        <dt>已入库</dt>
                        <dd>{{ formatReceiptFactQuantity(line.postedQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.availableQty > 0.0001" class="is-emphasis">
                        <dt>待入库</dt>
                        <dd>{{ formatReceiptFactQuantity(line.availableQty, line.uom) }}</dd>
                      </div>
                    </dl>
                    <p v-else class="purchase-inbound-empty-facts">尚未进入质检或入库阶段</p>
                  </section>
                </div>
              </article>
            </div>
            <div v-else class="list-empty-state warehouse-source-empty">
              <strong>暂无可汇总的物料进度</strong>
              <span>到货结果提交后，这里会按来源范围汇总到货、质检与入库数量。</span>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>到货记录</h2>
            </div>
            <div v-if="purchaseArrivalRecords.length" class="receipt-record-list">
              <article v-for="record in purchaseArrivalRecords" :key="record.receiptCode" class="receipt-record-card">
                <div class="receipt-record-lines">
                  <div v-for="line in record.lines" :key="line.key" class="receipt-record-entry is-arrival">
                    <dl class="receipt-record-grid receipt-record-primary-grid is-arrival">
                      <div class="is-material">
                        <dt>物料</dt>
                        <dd class="receipt-record-material-value">
                          <MaterialIdentity
                            compact
                            :name="line.name"
                            :code="line.materialCode"
                            :model="line.model"
                            :spec="line.spec"
                            :image-label="receiptMaterialVisual(line).label"
                            :image-tone="receiptMaterialVisual(line).tone"
                          />
                          <small v-if="line.supplierBatch">供应商批号 {{ line.supplierBatch }}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>本次到场</dt>
                        <dd>{{ formatReceiptFactQuantity(line.arrivalQty, line.uom) }}</dd>
                      </div>
                      <div>
                        <dt>正常接收</dt>
                        <dd>{{ formatReceiptFactQuantity(line.acceptedQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.refusedQty > 0.0001" class="is-exception">
                        <dt>当场拒收</dt>
                        <dd>{{ formatReceiptFactQuantity(line.refusedQty, line.uom) }}</dd>
                      </div>
                      <div v-if="line.exceptionHeldQty > 0.0001" class="is-exception">
                        <dt>异常暂收</dt>
                        <dd>{{ formatReceiptFactQuantity(line.exceptionHeldQty, line.uom) }}</dd>
                      </div>
                    </dl>
                    <dl class="receipt-record-grid receipt-record-secondary-grid is-arrival">
                      <div>
                        <dt>暂存仓</dt>
                        <dd>{{ record.warehouse || '—' }}</dd>
                      </div>
                      <div>
                        <dt>暂存库位</dt>
                        <dd>{{ purchaseReceiptLocationDisplay(record.location) }}</dd>
                      </div>
                      <div class="is-note">
                        <dt>到货备注</dt>
                        <dd>{{ record.note || '—' }}</dd>
                      </div>
                      <div>
                        <dt>实际到货日期</dt>
                        <dd>{{ record.date || '历史到货日期未登记' }}</dd>
                      </div>
                      <div>
                        <dt>到货登记人</dt>
                        <dd>{{ record.submittedBy || '历史到货登记人未登记' }}</dd>
                      </div>
                      <div v-if="record.receiptCode !== receiptDraft.code">
                        <dt>来源任务</dt>
                        <dd>
                          <RouterLink
                            class="receipt-record-code"
                            :to="`/warehouse/purchase-receipts/${encodeURIComponent(record.receiptCode)}`"
                            :title="`查看来源采购入库任务 ${record.receiptCode}`"
                          >{{ record.receiptCode }}</RouterLink>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="list-empty-state warehouse-source-empty receipt-record-empty">
              <strong>尚无已提交的到货记录</strong>
              <span>提交到货结果后生成记录。</span>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>入库记录</h2>
            </div>

            <div v-if="receiptDraft.inboundPostings?.length" class="receipt-record-list">
              <article
                v-for="posting in receiptDraft.inboundPostings"
                :key="posting.code"
                class="receipt-record-card"
                :class="{ 'is-reversed': posting.reversalCode }"
              >
                <div class="receipt-record-lines">
                  <div
                    v-for="line in posting.lines"
                    :key="`${posting.code}-${line.receiptLineId}-${line.warehouseCode}-${line.location}`"
                    class="receipt-record-entry is-inbound"
                  >
                    <dl class="receipt-record-grid receipt-record-primary-grid is-inbound">
                      <div class="is-material">
                        <dt>物料</dt>
                        <dd class="receipt-record-material-value">
                          <MaterialIdentity
                            compact
                            :name="line.name || inboundAllocationProduct(line.receiptLineId)?.name"
                            :code="line.materialCode || inboundAllocationProduct(line.receiptLineId)?.materialCode"
                            :model="line.model || inboundAllocationProduct(line.receiptLineId)?.model"
                            :spec="line.spec || inboundAllocationProduct(line.receiptLineId)?.spec"
                            :image-label="inboundAllocationVisual(line.receiptLineId).label"
                            :image-tone="inboundAllocationVisual(line.receiptLineId).tone"
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>入库数量</dt>
                        <dd>{{ formatQuantity(Number(line.postedQty || 0), line.unit || line.uom || '') }}</dd>
                      </div>
                      <div class="is-result">
                        <dt>入库结果</dt>
                        <dd class="receipt-record-document-value">
                          <strong class="receipt-record-code">{{ posting.code }}</strong>
                          <i v-if="posting.reversalCode" class="mini-status status-muted">已由 {{ posting.reversalCode }} 冲销</i>
                          <i v-else class="mini-status status-done">有效过账</i>
                        </dd>
                      </div>
                    </dl>
                    <dl class="receipt-record-grid receipt-record-secondary-grid is-inbound">
                      <div>
                        <dt>正式仓库</dt>
                        <dd>{{ line.warehouse || line.warehouseCode || '—' }}</dd>
                      </div>
                      <div>
                        <dt>入库库位</dt>
                        <dd>{{ purchaseReceiptLocationDisplay(line.location) }}</dd>
                      </div>
                      <div>
                        <dt>批次</dt>
                        <dd>{{ line.batch || (inboundAllocationProduct(line.receiptLineId)?.batchTracked === false ? '无需批次' : '历史批次未登记') }}</dd>
                      </div>
                      <div>
                        <dt>入库时间</dt>
                        <dd>{{ posting.postedAt || '历史入库时间未登记' }}</dd>
                      </div>
                      <div>
                        <dt>入库人</dt>
                        <dd>{{ posting.postedBy || '历史入库人未登记' }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            </div>
            <div v-else-if="receiptDraft.products.some((item) => item.destinationWarehouse)" class="receipt-record-list">
              <article class="receipt-record-card">
                <div class="receipt-record-lines">
                  <div
                    v-for="(item, index) in receiptDraft.products.filter((product) => product.destinationWarehouse)"
                    :key="`${item.lineId || item.materialCode}-${index}-legacy-posting`"
                    class="receipt-record-entry is-inbound"
                  >
                    <dl class="receipt-record-grid receipt-record-primary-grid is-inbound">
                      <div class="is-material">
                        <dt>物料</dt>
                        <dd class="receipt-record-material-value">
                          <MaterialIdentity
                            compact
                            :name="item.name"
                            :code="item.materialCode"
                            :model="item.model"
                            :spec="item.spec"
                            :image-label="lineImage(item).label"
                            :image-tone="lineImage(item).tone"
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>入库数量</dt>
                        <dd>{{ item.qty }}</dd>
                      </div>
                      <div class="is-result">
                        <dt>入库结果</dt>
                        <dd class="receipt-record-document-value">
                          <strong class="receipt-record-code">历史记录</strong>
                          <i v-if="receiptDraft.reversalCode" class="mini-status status-muted">已冲销</i>
                          <i v-else class="mini-status status-done">有效过账</i>
                        </dd>
                      </div>
                    </dl>
                    <dl class="receipt-record-grid receipt-record-secondary-grid is-inbound">
                      <div>
                        <dt>正式仓库</dt>
                        <dd>{{ item.destinationWarehouse || '—' }}</dd>
                      </div>
                      <div>
                        <dt>入库库位</dt>
                        <dd>{{ purchaseReceiptLocationDisplay(item.destinationLocation) }}</dd>
                      </div>
                      <div>
                        <dt>批次</dt>
                        <dd>{{ item.batch || (item.batchTracked === false ? '无需批次' : '历史批次未登记') }}</dd>
                      </div>
                      <div>
                        <dt>入库时间</dt>
                        <dd>{{ receiptDraft.postedQuantities?.postedAt || '历史入库时间未登记' }}</dd>
                      </div>
                      <div>
                        <dt>入库人</dt>
                        <dd>历史入库人未登记</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="list-empty-state warehouse-source-empty receipt-record-empty">
              <strong>尚未生成入库记录</strong>
              <span>{{ receiptPostingEmptyDescription }}</span>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="当前任务状态"
              :primary-status="receiptLifecycleStatus"
              :items="receiptStatusPanelItems"
              aria-label="当前采购入库任务状态"
            />
          </section>

          <section v-if="receiptAttachments.length" class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
            </div>
            <div class="attachment-list">
              <div v-for="file in receiptAttachments" :key="file.name" class="attachment-row">
                <span class="attachment-icon">
                  <Paperclip :size="16" />
                </span>
                <div>
                  <strong>{{ file.name }}</strong>
                  <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="采购入库任务"
      :message="loadMessage"
      back-path="/warehouse/purchase-receipts"
      back-label="采购入库列表"
      @retry="loadReceipt"
    />

    <Teleport to="body">
      <div
        v-if="receiptActionDialogMode && receiptDraft"
        class="receipt-action-dialog-overlay"
        @mousedown.self="closeReceiptActionDialog"
      >
        <section
          ref="receiptActionDialogPanel"
          class="receipt-action-dialog warehouse-action-dialog purchase-receipt-action-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-action-dialog-title"
          tabindex="-1"
          @keydown.tab="handleReceiptActionDialogTab"
          @keydown.esc.stop.prevent="closeReceiptActionDialog"
        >
          <header class="receipt-action-dialog-header">
            <div>
              <h2 id="receipt-action-dialog-title">{{ receiptActionDialogTitle }}</h2>
              <p>{{ receiptActionDialogDescription }}</p>
            </div>
            <button
              type="button"
              aria-label="关闭登记窗口"
              title="关闭登记窗口"
              :disabled="isReceiptActionPending || isSaving"
              @click="closeReceiptActionDialog"
            >
              <X :size="18" />
            </button>
          </header>

          <div class="receipt-action-dialog-body">
            <template v-if="receiptActionDialogMode === 'arrival'">
              <section class="receipt-dialog-section warehouse-dialog-operation-section">
                <div class="receipt-dialog-section-heading">
                  <div>
                    <h3>本次作业信息</h3>
                  </div>
                </div>
                <div class="warehouse-dialog-command-bar is-arrival">
                  <label class="form-field" :class="receiptRequiredFieldClass('实际到货日期')">
                    <span :class="receiptRequiredLabelClass('实际到货日期')">实际到货日期</span>
                    <input v-model="receiptDraft.date" type="date" :max="currentShanghaiDate()" />
                  </label>
                  <label class="form-field" :class="receiptRequiredFieldClass('采购暂存仓')">
                    <span :class="receiptRequiredLabelClass('采购暂存仓')">采购暂存仓</span>
                    <ReferencePicker
                      v-model="receiptDraft.warehouseCode"
                      type="warehouses"
                      :company="receiptDraft.company"
                      kind="采购收货"
                      title="选择采购暂存仓"
                      placeholder="选择采购暂存仓"
                      search-placeholder="搜索具备采购暂存职能的启用仓库"
                      :display-value="receiptDraft.warehouse"
                      hide-meta
                      @select="handleStagingWarehouseSelect"
                    />
                  </label>
                  <label class="form-field" :class="receiptRequiredFieldClass('暂存库位')">
                    <span :class="receiptRequiredLabelClass('暂存库位')">暂存库位</span>
                    <select v-model="receiptDraft.location" :disabled="!receiptDraft.warehouseCode">
                      <option value="" disabled>选择实际暂存库位</option>
                      <option v-for="location in stagingLocationOptions" :key="location" :value="location">{{ location }}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section class="receipt-dialog-section warehouse-dialog-result-section">
                <div class="receipt-dialog-section-heading warehouse-dialog-result-heading">
                  <div class="warehouse-dialog-result-title">
                    <h3>本次物料结果</h3>
                    <span>{{ selectedReceiptLineIds.length }} / {{ receiptDraft.products.length }} 种物料</span>
                  </div>
                </div>
                <div
                  class="receipt-arrival-line-list"
                  :class="{ 'has-field-error': receiptValidationAttempted && receiptMissingSubmitFields().includes('本次到货结果') }"
                >
                  <article
                    v-for="(item, index) in receiptDraft.products"
                    :key="`${item.materialCode || 'arrival'}-${index}`"
                    class="receipt-arrival-line-card warehouse-dialog-material-line-card"
                    :class="[receiptLineQtyClass(item, index), { 'is-selected': receiptLineIsSelected(item, index) }]"
                  >
                    <header class="receipt-arrival-line-head warehouse-dialog-material-head">
                      <div class="warehouse-dialog-material-product">
                        <label class="warehouse-dialog-line-toggle">
                          <input
                            type="checkbox"
                            :checked="receiptLineIsSelected(item, index)"
                            @change="toggleReceiptLine(item, index, ($event.target as HTMLInputElement).checked)"
                          />
                          <span>本次到货</span>
                        </label>
                        <MaterialIdentity
                          :name="item.name"
                          :code="item.materialCode"
                          :model="item.model"
                          :spec="item.spec"
                          :image-label="lineItems[index]?.image.label"
                          :image-tone="lineItems[index]?.image.tone"
                        />
                      </div>
                      <dl class="warehouse-dialog-material-metrics">
                        <div>
                          <dt>待到货</dt>
                          <dd>{{ receiptLineRemainingText(item, index) }}</dd>
                        </div>
                        <div>
                          <dt>可收上限</dt>
                          <dd>{{ receiptLineReceivableText(item, index) }}</dd>
                        </div>
                        <div class="is-current">
                          <dt>本次到场</dt>
                          <dd>{{ receiptLineCurrentArrivalText(item, index) }}</dd>
                        </div>
                      </dl>
                      <div v-if="receiptLineIsSelected(item, index)" class="receipt-arrival-line-actions">
                        <button class="secondary-action compact-action" type="button" title="全部登记为正常接收" @click="setReceiptLineArrivalResult(index, 'accept')">全部接收</button>
                        <button class="secondary-action compact-action" type="button" title="全部登记为当场拒收" @click="setReceiptLineArrivalResult(index, 'refuse')">整行拒收</button>
                      </div>
                    </header>
                    <div v-if="receiptLineIsSelected(item, index)" class="warehouse-dialog-material-entry">
                      <div class="warehouse-dialog-quantity-rule">本次到场 = 正常接收 + 当场拒收 + 异常暂收</div>
                      <div class="quote-fields receipt-arrival-fields">
                      <label class="form-field">
                        <span class="required-label">本次到场</span>
                        <QuantityWithUnitInput v-model="item.arrivalQty" :unit="item.uom" placeholder="到场数量" />
                      </label>
                      <label class="form-field">
                        <span class="required-label">正常接收</span>
                        <QuantityWithUnitInput v-model="item.acceptedQty" :unit="item.uom" placeholder="接收数量" />
                      </label>
                      <label class="form-field">
                        <span>当场拒收</span>
                        <QuantityWithUnitInput v-model="item.refusedQty" :unit="item.uom" placeholder="0" />
                      </label>
                      <label class="form-field">
                        <span>异常暂收</span>
                        <QuantityWithUnitInput v-model="item.exceptionHeldQty" :unit="item.uom" placeholder="0" />
                      </label>
                      <label class="form-field">
                        <span>供应商批号</span>
                        <input v-model="item.supplierBatch" type="text" placeholder="按送货标签填写（选填）" />
                      </label>
                      <label class="form-field">
                        <span>质检要求</span>
                        <output class="form-readonly-value">{{ item.incomingQualityControl || (item.qcRequired ? '需质检' : '免检') }}</output>
                      </label>
                      <label v-if="receiptLineHasArrivalException(item)" class="form-field">
                        <span class="required-label">异常原因</span>
                        <select v-model="item.refusalReason">
                          <option value="" disabled>选择异常原因</option>
                          <option v-for="reason in refusalReasonOptions" :key="reason" :value="reason">{{ reason }}</option>
                        </select>
                      </label>
                      <label v-if="receiptLineHasArrivalException(item)" class="form-field full-field">
                        <span class="required-label">异常说明</span>
                        <textarea
                          v-model="item.exceptionNote"
                          class="terms-textarea"
                          rows="3"
                          placeholder="说明现场情况、拒收或异常暂收范围，以及供应商确认情况"
                        ></textarea>
                      </label>
                      </div>
                    </div>
                  </article>
                </div>
              </section>

              <section class="receipt-dialog-section warehouse-dialog-supplement-section">
                <div class="receipt-dialog-section-heading">
                  <div><h3>备注与附件</h3></div>
                </div>
                <div class="warehouse-dialog-supplement-grid">
                  <label class="form-field">
                    <span>到货备注</span>
                    <textarea
                      v-model="receiptDraft.note"
                      class="terms-textarea"
                      rows="4"
                      placeholder="补充到货差异或现场交接事项（选填）"
                    ></textarea>
                  </label>
                  <div class="receipt-dialog-attachments">
                  <div class="form-section-head">
                    <div class="summary-title">
                      <Paperclip :size="17" />
                      <h3>随货附件</h3>
                    </div>
                    <label
                      class="secondary-action compact-action file-upload-button"
                      :class="{ 'is-disabled': isReadOnly }"
                      :aria-disabled="isReadOnly"
                      :title="receiptAttachmentTitle"
                    >
                      <Upload :size="15" />
                      上传
                      <input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />
                    </label>
                  </div>
                  <div v-if="receiptAttachments.length" class="attachment-list">
                    <div v-for="file in receiptAttachments" :key="file.name" class="attachment-row">
                      <span class="attachment-icon"><Paperclip :size="16" /></span>
                      <div>
                        <strong>{{ file.name }}</strong>
                        <small>{{ file.size }} · {{ file.uploader }} · {{ file.date }}</small>
                      </div>
                    </div>
                  </div>
                  <div v-else class="attachment-empty">
                    <Paperclip :size="17" />
                    <span>暂无随货附件</span>
                  </div>
                  </div>
                </div>
              </section>
            </template>

            <template v-else>
              <section class="receipt-dialog-section warehouse-dialog-operation-section">
                <div class="receipt-dialog-section-heading">
                  <div><h3>本次作业信息</h3></div>
                </div>
                <div class="warehouse-dialog-command-bar is-operation">
                  <label class="form-field warehouse-dialog-readonly-field">
                    <span>暂存仓库</span>
                    <output class="form-readonly-value">{{ receiptDraft.warehouse || '未记录' }}</output>
                  </label>
                  <label class="form-field warehouse-dialog-readonly-field">
                    <span>暂存库位</span>
                    <output class="form-readonly-value">{{ receiptDraft.location || '未记录' }}</output>
                  </label>
                  <label class="form-field warehouse-dialog-readonly-field">
                    <span>入库处理</span>
                    <output class="form-readonly-value">提交后即时过账</output>
                  </label>
                </div>
              </section>

              <section class="receipt-dialog-section warehouse-dialog-result-section">
                <div class="receipt-dialog-section-heading warehouse-dialog-result-heading">
                  <div class="warehouse-dialog-result-title">
                    <h3>本次物料结果</h3>
                    <span>{{ receiptInboundAvailableLineCount }} 种物料</span>
                  </div>
                </div>
                <div class="receipt-allocation-list">
                  <article
                    v-for="(allocation, index) in receiptDraft.inboundAllocations"
                    :key="allocation.id || `${allocation.receiptLineId}-${index}`"
                    class="receipt-allocation-row warehouse-dialog-allocation-card"
                  >
                    <header class="warehouse-dialog-allocation-head">
                      <div class="warehouse-dialog-material-identity">
                        <MaterialIdentity
                          :name="inboundAllocationProduct(allocation.receiptLineId)?.name"
                          :code="inboundAllocationProduct(allocation.receiptLineId)?.materialCode"
                          :model="inboundAllocationProduct(allocation.receiptLineId)?.model"
                          :spec="inboundAllocationProduct(allocation.receiptLineId)?.spec"
                          :image-label="inboundAllocationVisual(allocation.receiptLineId).label"
                          :image-tone="inboundAllocationVisual(allocation.receiptLineId).tone"
                        />
                      </div>
                      <dl class="warehouse-dialog-material-metrics is-inbound">
                        <div>
                          <dt>剩余可分配</dt>
                          <dd>{{ inboundAllocationAvailableLabel(allocation.receiptLineId) }}</dd>
                        </div>
                        <div class="is-current">
                          <dt>本次入库</dt>
                          <dd>{{ inboundAllocationQuantityLabel(allocation) }}</dd>
                        </div>
                      </dl>
                      <button
                        v-if="(receiptDraft.inboundAllocations?.length || 0) > 1"
                        class="icon-action receipt-allocation-remove"
                        type="button"
                        :disabled="!canEditDestinations"
                        title="移除此入库去向"
                        aria-label="移除此入库去向"
                        @click="removeInboundAllocation(index)"
                      >
                        <Trash2 :size="16" />
                      </button>
                    </header>
                    <div class="warehouse-dialog-allocation-fields">
                      <label class="form-field" :class="{ 'has-field-error': receiptValidationAttempted && !parseQuantity(allocation.quantity) }">
                        <span class="required-label">本次入库数量</span>
                        <QuantityWithUnitInput
                          v-model="allocation.quantity"
                          :unit="inboundAllocationProduct(allocation.receiptLineId)?.uom || quantityUnit(inboundAllocationProduct(allocation.receiptLineId)?.acceptedQty || inboundAllocationProduct(allocation.receiptLineId)?.qty)"
                          placeholder="输入本次入库数量"
                          :disabled="!canEditDestinations"
                        />
                      </label>
                      <label class="form-field" :class="{ 'has-field-error': receiptValidationAttempted && !allocation.warehouse }">
                        <span class="required-label">入库仓库</span>
                        <ReferencePicker
                          v-model="allocation.warehouseCode"
                          type="warehouses"
                          :company="receiptDraft.company"
                          kind="采购正式入库"
                          title="选择正式入库仓库"
                          placeholder="选择正式入库仓库"
                          search-placeholder="搜索具备采购入库职能的仓库"
                          :display-value="allocation.warehouse"
                          :disabled="!canEditDestinations"
                          :exclude-codes="[receiptDraft.warehouseCode || '']"
                          hide-meta
                          @select="handleInboundAllocationWarehouseSelect(index, $event)"
                        />
                      </label>
                      <label class="form-field" :class="{ 'has-field-error': receiptValidationAttempted && !allocation.location }">
                        <span class="required-label">入库库位</span>
                        <select v-model="allocation.location" :disabled="!canEditDestinations || !allocation.warehouseCode">
                          <option value="" disabled>选择正式入库库位</option>
                          <option
                            v-for="location in inboundAllocationLocationOptions(allocation.warehouseCode, allocation.warehouse)"
                            :key="location"
                            :value="location"
                          >{{ location }}</option>
                        </select>
                      </label>
                    </div>
                  </article>
                  <div class="receipt-allocation-add-actions">
                    <button
                      v-for="(item, index) in receiptDraft.products"
                      :key="`${item.lineId || item.materialCode}-${index}-dialog-add-allocation`"
                      class="secondary-action compact-action"
                      type="button"
                      :disabled="!canEditDestinations || inboundAllocationUnallocatedQuantity(item.lineId || `L${index + 1}`) <= 0.0001"
                      :title="inboundAllocationUnallocatedQuantity(item.lineId || `L${index + 1}`) > 0.0001 ? '为该物料增加一个入库去向' : '先减少已有去向的数量，再拆分新的去向'"
                      @click="addInboundAllocation(item.lineId || `L${index + 1}`)"
                    >
                      拆分 {{ item.name || item.materialCode || '物料' }}
                    </button>
                  </div>
                </div>
              </section>
            </template>
          </div>

          <footer class="receipt-action-dialog-footer">
            <button
              class="secondary-action"
              type="button"
              :disabled="isReceiptActionPending || isSaving"
              title="取消并关闭登记窗口"
              @click="closeReceiptActionDialog"
            >取消</button>
            <button
              class="primary-action async-document-action"
              type="button"
              :disabled="isReceiptActionPending || isSaving"
              :aria-busy="activeReceiptAction === 'primary'"
              :title="submitReceiptActionTitle"
              @click="submitReceipt"
            >
              <Send :size="15" />
              {{ activeReceiptAction === 'primary' ? '处理中' : receiptPrimaryActionLabel }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

    <FlowRecordPanel
      :open="showFlowRecords"
      title="采购入库日志"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <WarehouseReversalDialog
      :open="reversalDialogOpen"
      title="冲销采购入库库存"
      :record-code="receiptDraft?.code || ''"
      :pending="activeReceiptAction === 'reverse'"
      @close="reversalDialogOpen = false"
      @submit="submitReceiptReversal"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
