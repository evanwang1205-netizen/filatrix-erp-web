<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Boxes,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-vue-next';

import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import WarehouseActionReasonDialog from '../components/WarehouseActionReasonDialog.vue';
import WarehouseReversalDialog from '../components/WarehouseReversalDialog.vue';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { useSessionStore } from '../stores/session';
import { scrollElementIntoView } from '../utils/focusNavigation';
import { statusPresentationClass } from '../utils/statusPresentation';
import { purchaseMaterialVisuals } from '../data/purchase';
import { productVisuals } from '../data/sales';
import { productionMoveRows } from '../data/warehouse';
import {
  production2ExecutionCards,
  production2ReleaseBatches,
  production2WorkOrders,
  type Production2ExecutionCard,
  type Production2ReleaseBatch,
} from '../data/production2';
import { productIdentity } from '../utils/productDisplay';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import {
  cancelWarehouseTransfer,
  cancelWarehouseStocktake,
  completeWarehouseStocktake,
  getProductionExecutionCard,
  getProductionMaterialIssueSource,
  getProductionMaterialIssue,
  getProductionReceipt,
  getProductionReturn,
  getWarehouseOtherMove,
  getWarehouseStocktake,
  getWarehouseTransfer,
  listReference,
  listProductionMaterialIssues,
  listProductionExecutionCards,
  listProductionReceipts,
  listProductionReturns,
  listWarehouseInventory,
  postProductionMaterialIssue,
  postProductionReceipt,
  postProductionReturn,
  postWarehouseOtherMove,
  postWarehouseTransfer,
  reverseWarehouseDocument,
  returnWarehouseStocktake,
  saveProductionMaterialIssue,
  saveProductionReceipt,
  saveProductionReturn,
  saveWarehouseOtherMove,
  saveWarehouseStocktake,
  saveWarehouseTransfer,
  startWarehouseStocktake,
  submitProductionMaterialIssue,
  submitProductionReceipt,
  submitProductionReturn,
  submitWarehouseOtherMove,
  submitWarehouseStocktake,
  submitWarehouseTransfer,
  updateWarehouseStatus,
  type WarehouseRuntimeType,
} from '../services/api';
import type {
  Attachment,
  FlowRecord,
  ReferenceOption,
  WarehouseInventoryRow,
  WarehouseMoveProduct,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';

type EditorKind = 'productionIssues' | 'productionReturns' | 'productionReceipts' | 'otherMoves' | 'transfers' | 'stocktakes';
type WarehouseDocumentAsyncAction = 'save' | 'primary' | 'reverse' | 'stocktake-secondary' | 'transfer-cancel';

type MaterialReference = {
  code: string;
  name: string;
  model?: string;
  spec?: string;
  uom?: string;
  batchControl?: string;
  batchTracked?: boolean;
  imageLabel?: string;
  imageTone?: string;
};

type WarehouseReference = {
  code: string;
  name: string;
  binPrefix?: string;
  locationOptions?: string[];
};

type ProductionIssueApiResponse = {
  issue: Record<string, any>;
  flowRecords: FlowRecord[];
  release?: Record<string, unknown>;
  executionCard?: Record<string, unknown> | null;
};

type WarehouseOperationLineProduct = WarehouseMoveProduct & {
  sourceLocation?: string;
};

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { canWrite: canWriteWarehouse, readonlyReason: warehouseReadonlyReason } = useModulePermission('warehouse');
const { canOperate: canPostWarehouse, readonlyReason: warehousePostReadonlyReason } = useOperationPermission(
  'warehousePost',
  '处理仓库单据',
);

const editorConfigs: Record<
  EditorKind,
  {
    routeSegment: string;
    title: string;
    newTitle: string;
    editTitle: string;
    detailTitle: string;
    listLabel: string;
    finalStatus: string;
    stageList: string[];
    primaryLabel: string;
  }
> = {
  productionIssues: {
    routeSegment: 'production-issues',
    title: '生产领料',
    newTitle: '新建生产领料',
    editTitle: '编辑生产领料',
    detailTitle: '生产领料详情',
    listLabel: '生产领料',
    finalStatus: '已完成',
    stageList: ['草稿', '待出库', '已完成'],
    primaryLabel: '出库',
  },
  productionReturns: {
    routeSegment: 'production-returns',
    title: '生产退料',
    newTitle: '新建生产退料',
    editTitle: '编辑生产退料',
    detailTitle: '生产退料详情',
    listLabel: '生产退料',
    finalStatus: '已完成',
    stageList: ['草稿', '待入库', '已完成'],
    primaryLabel: '入库',
  },
  productionReceipts: {
    routeSegment: 'production-receipts',
    title: '完工入库',
    newTitle: '新建完工入库',
    editTitle: '编辑完工入库',
    detailTitle: '完工入库详情',
    listLabel: '完工入库',
    finalStatus: '已完成',
    stageList: ['草稿', '待入库', '已完成'],
    primaryLabel: '入库',
  },
  otherMoves: {
    routeSegment: 'other-moves',
    title: '其他出入库',
    newTitle: '新建其他出入库',
    editTitle: '编辑其他出入库',
    detailTitle: '其他出入库详情',
    listLabel: '其他出入库',
    finalStatus: '已过账',
    stageList: ['草稿', '待审核', '待过账', '已过账'],
    primaryLabel: '确认库存变动',
  },
  transfers: {
    routeSegment: 'transfers',
    title: '库存调拨',
    newTitle: '新建调拨单',
    editTitle: '编辑调拨单',
    detailTitle: '库存调拨详情',
    listLabel: '库存调拨',
    finalStatus: '已完成',
    stageList: ['草稿', '待出库', '调拨中', '待入库', '已完成'],
    primaryLabel: '提交',
  },
  stocktakes: {
    routeSegment: 'stocktakes',
    title: '库存盘点',
    newTitle: '新建盘点',
    editTitle: '编辑盘点',
    detailTitle: '库存盘点详情',
    listLabel: '库存盘点',
    finalStatus: '已完成',
    stageList: ['待盘点', '盘点中', '待复核', '已完成', '已取消'],
    primaryLabel: '开始盘点',
  },
};

const currentKind = computed<EditorKind>(() => {
  const metaKind = route.meta.warehouseDocumentKind as EditorKind | undefined;
  if (metaKind) return metaKind;
  const page = route.params.page?.toString();
  if (page === 'production-issues' || page === 'production-moves') return 'productionIssues';
  if (page === 'production-returns') return 'productionReturns';
  if (page === 'production-receipts') return 'productionReceipts';
  if (page === 'transfers') return 'transfers';
  if (page === 'stocktakes') return 'stocktakes';
  return 'otherMoves';
});

function isProductionKind(kind: EditorKind) {
  return kind === 'productionIssues' || kind === 'productionReturns' || kind === 'productionReceipts';
}

function productionMoveTypeForKind(kind: EditorKind) {
  if (kind === 'productionReturns') return '生产退料';
  if (kind === 'productionReceipts') return '完工入库';
  return '生产领料';
}

const config = computed(() => editorConfigs[currentKind.value]);
const showFlowRecords = ref(false);
const isSaving = ref(false);
const {
  activeAction: activeWarehouseAction,
  isActionPending: isWarehouseActionPending,
  runAction: runWarehouseAction,
} = useAsyncActionState<WarehouseDocumentAsyncAction>();
const loadMessage = ref('');
const isLoading = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const warehouseMoreActionsOpen = ref(false);
const warehouseMoreActionsTrigger = ref<HTMLButtonElement | null>(null);
const reversalDialogOpen = ref(false);
const stocktakeReasonMode = ref<'cancel' | 'return' | ''>('');
const transferCancelDialogOpen = ref(false);
const warehouseValidationAttempted = ref(false);
const documentDraft = ref<Record<string, any> | null>(createEmptyDraft(currentKind.value));
const flowRecords = ref<FlowRecord[]>([]);
const serverProductionIssues = ref<Record<string, any>[]>([]);
const serverProductionReturns = ref<Record<string, any>[]>([]);
const serverProductionReceipts = ref<Record<string, any>[]>([]);
const warehouseInventoryRows = ref<WarehouseInventoryRow[]>([]);
const warehouseReferenceRows = ref<WarehouseReference[]>([]);
const selectedOtherMoveLocationOptions = ref<string[]>([]);
const selectedTransferLocationOptions = ref<string[]>([]);
const selectedProductionReceiptLocationOptions = ref<string[]>([]);
const productionIssuePostKeys = new Map<string, string>();
const productionReturnPostKeys = new Map<string, string>();
const productionReceiptPostKeys = new Map<string, string>();
let toastTimer: number | undefined;

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value.endsWith('-new') || route.path.endsWith('/new'));
const isEdit = computed(() => mode.value.endsWith('-edit') || route.path.endsWith('/edit'));
const isDetail = computed(() => !isNew.value && !isEdit.value);
const isStocktake = computed(() => currentKind.value === 'stocktakes');
const isProductionMove = computed(() => isProductionKind(currentKind.value));
const isAuthoritativeProductionIssue = computed(() => currentKind.value === 'productionIssues');
const isAuthoritativeProductionReturn = computed(() => currentKind.value === 'productionReturns');
const isAuthoritativeProductionReceipt = computed(() => currentKind.value === 'productionReceipts');
const isStructuredProductionMaterialMove = computed(() => (
  isAuthoritativeProductionIssue.value
  || isAuthoritativeProductionReturn.value
  || isAuthoritativeProductionReceipt.value
));
const hasAuthoritativeProductionLines = computed(() => (
  isStructuredProductionMaterialMove.value
));
const isOtherMove = computed(() => currentKind.value === 'otherMoves');
const isTransfer = computed(() => currentKind.value === 'transfers');
const otherMoveDirectionEditable = computed(() => isOtherMove.value && documentDraft.value?.moveType === '库存调整');
const otherMoveCounterpartyLabel = computed(() => {
  const type = String(documentDraft.value?.moveType || '');
  if (type === '样品出库') return '寄送去向';
  if (type === '领用出库') return '领用部门/人员';
  if (type === '报废出库') return '处置去向';
  if (type === '借用出库') return '借用人/部门';
  if (type === '借用归还') return '归还来源';
  return '来源/去向';
});
const otherMoveReasonLabel = computed(() => {
  const type = String(documentDraft.value?.moveType || '');
  if (type === '样品出库') return '样品用途';
  if (type === '领用出库') return '领用用途';
  if (type === '报废出库') return '报废原因';
  if (type === '借用出库' || type === '借用归还') return '借用说明';
  if (type === '库存调整') return '调整原因';
  return '业务原因';
});
const otherMoveCounterpartyRequired = computed(() => isOtherMove.value && documentDraft.value?.moveType !== '库存调整');
const showOtherMoveCounterparty = computed(() => (
  otherMoveCounterpartyRequired.value
  || Boolean(String(documentDraft.value?.targetWarehouse || '').trim())
));
const isFinal = computed(() => documentDraft.value?.status === config.value.finalStatus);
const isCancelled = computed(() => (
  isTransfer.value && ['已取消', '已作废'].includes(String(documentDraft.value?.status || ''))
));
const isStocktakeCancelled = computed(() => (
  isStocktake.value && ['已取消', '已作废'].includes(String(documentDraft.value?.status || ''))
));
const canEditCurrentStatus = computed(() => {
  if (isNew.value) return true;
  const status = documentDraft.value?.status || '';
  if (isStocktake.value) return ['待盘点', '盘点中'].includes(status);
  if (isOtherMove.value || isTransfer.value) return status === '草稿';
  if (currentKind.value === 'productionReceipts') return ['草稿', '待入库'].includes(status);
  return status === '草稿';
});
const isReadOnly = computed(() => isDetail.value || !canEditCurrentStatus.value || !canWriteWarehouse.value);
const stocktakeHeaderLocked = computed(() => (
  isStocktake.value
  && !isNew.value
  && documentDraft.value?.status === '盘点中'
));
const stocktakeCancelledBeforeStart = computed(() => (
  isStocktakeCancelled.value
  && !documentDraft.value?.lines?.length
));
const { resetUnsavedChanges } = useUnsavedChangesGuard(documentDraft, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const referenceTitle = computed(() => `${config.value.title} ${documentDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${documentDraft.value?.status || ''} · ${documentDraft.value?.warehouse || documentDraft.value?.fromWarehouse || '未选择仓库'}`);
const referencePath = computed(() =>
  documentDraft.value?.code ? `/warehouse/${config.value.routeSegment}/${encodeURIComponent(documentDraft.value.code)}` : '',
);
const operationDateLabel = computed(() => {
  if (currentKind.value === 'productionIssues') return '领料日期';
  if (currentKind.value === 'productionReturns') return '退料日期';
  if (currentKind.value === 'productionReceipts') return '完工日期';
  if (isTransfer.value) return '调拨日期';
  if (isStocktake.value) return '盘点日期';
  return '业务日期';
});
const operationWarehouseLabel = computed(() => {
  const direction = documentDraft.value?.direction;
  if (isProductionMove.value) return direction === '入库' ? '来源仓/线边仓' : '出库仓库';
  if (isOtherMove.value) return direction === '入库' ? '入库仓库' : '出库仓库';
  return '业务仓库';
});
const operationLocationLabel = computed(() => (
  documentDraft.value?.direction === '入库' ? '入库库位' : '出库库位'
));
const operationTargetLabel = computed(() => {
  const draft = documentDraft.value;
  if (isProductionMove.value) {
    if (draft?.moveType === '完工入库') return '成品入库仓';
    if (draft?.moveType === '生产退料') return '退料入库仓';
    return '领用去向';
  }
  if (isOtherMove.value) return draft?.direction === '入库' ? '来源说明' : '流向说明';
  return '流向/目标仓';
});
const operationDetailTitle = computed(() => {
  if (currentKind.value === 'productionIssues') return '领料明细';
  if (currentKind.value === 'productionReturns') return '退料明细';
  if (currentKind.value === 'productionReceipts') return '完工入库明细';
  if (isTransfer.value) {
    return isDetail.value && Array.isArray(documentDraft.value?.transitLines) && documentDraft.value.transitLines.length
      ? '实际调拨明细'
      : '调拨明细';
  }
  if (isOtherMove.value) return documentDraft.value?.direction === '入库' ? '入库明细' : '出库明细';
  return '库存明细';
});
const operationMaterialLabel = computed(() => (isOtherMove.value || isTransfer.value ? '物料' : '物料/成品'));
const warehouseAttachmentHint = computed(() => {
  if (currentKind.value === 'productionIssues') return '可上传领料单、出库复核记录、交接单或现场照片';
  if (currentKind.value === 'productionReturns') return '可上传退料申请、退料交接单、质量说明或现场照片';
  if (currentKind.value === 'productionReceipts') return '可上传完工报工单、质检放行记录、入库交接单或现场照片';
  if (isTransfer.value) return '可上传调拨申请、调拨交接单、审批记录或现场照片';
  if (isStocktake.value) return '可上传盘点表、差异复核记录或现场照片';
  return documentDraft.value?.direction === '入库'
    ? '可上传入库申请、审批记录、交接单或现场照片'
    : '可上传出库申请、审批记录、交接单或现场照片';
});
const warehouseNotePlaceholder = computed(() => {
  if (isStocktake.value) return '填写盘点说明、现场异常或交接要求';
  if (isOtherMove.value) return '填写补充说明、交接要求或异常情况';
  return '填写业务说明、异常情况、审批备注或交接要求';
});
const warehouseAttachmentTitle = computed(() => {
  if (!isReadOnly.value) return '上传附件';
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (isFinal.value) return `当前${config.value.title}${config.value.finalStatus}，不能上传附件。`;
  if (isDetail.value) return `当前${config.value.title}详情只读，不能上传附件。`;
  return saveDocumentReadonlyReason.value || '当前状态不能上传附件。';
});
const warehouseRuntimeTypes: Partial<Record<EditorKind, WarehouseRuntimeType>> = {
  otherMoves: 'other-moves',
  transfers: 'transfers',
  stocktakes: 'stocktakes',
};
const warehouseEditorPrimaryAction = computed(() =>
  documentDraft.value ? primaryActionForStatus(currentKind.value, documentDraft.value.status) : undefined,
);
const warehousePrimaryActionBlockedReason = computed(() => {
  if (!isDetail.value || !isTransfer.value || documentDraft.value?.status !== '待出库') return '';
  const missing = warehouseMissingSubmitFields();
  if (!missing.length) return '';
  return `${missingSubmitSummary(missing)}。该调拨单已经提交且不能改写，请取消后重新建立。`;
});
const warehouseStatusPanelTitle = computed(() => (
  isOtherMove.value ? '当前单据状态' : `${config.value.title}状态`
));
const primaryActionLabel = computed(() => {
  if (isFinal.value) return config.value.finalStatus;
  return warehouseEditorPrimaryAction.value?.label || '已锁定';
});
const primaryActionTitle = computed(() => {
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (!canPostWarehouse.value) return warehousePostReadonlyReason.value;
  const missing = warehouseMissingSubmitFields();
  if (!isDetail.value && missing.length) return missingSubmitSummary(missing);
  if (warehousePrimaryActionBlockedReason.value) return warehousePrimaryActionBlockedReason.value;
  if (productionMoveBlockReason.value) return productionMoveBlockReason.value;
  return warehouseEditorPrimaryAction.value ? `${warehouseEditorPrimaryAction.value.label}：${warehouseEditorPrimaryAction.value.message}` : '当前状态不可继续流转';
});
const warehouseEditActionLabel = computed(() => (documentDraft.value?.status === '盘点中' ? '录入实盘' : '编辑'));
const saveDocumentLabel = computed(() => '保存');
const saveDocumentNoun = computed(() => (isStocktake.value ? '计划' : '草稿'));
const saveDocumentReadonlyReason = computed(() => {
  if (!canWriteWarehouse.value) return warehouseReadonlyReason.value;
  if (isFinal.value) return `当前${config.value.title}${config.value.finalStatus}，不能保存${saveDocumentNoun.value}。`;
  if (!canEditCurrentStatus.value) return `当前${config.value.title}为${documentDraft.value?.status || '不可编辑状态'}，不能改写单据内容。`;
  if (isDetail.value) return `当前${config.value.title}详情只读，不能保存${saveDocumentNoun.value}。`;
  return '';
});
const saveDocumentActionTitle = computed(() =>
  saveDocumentReadonlyReason.value || `保存${saveDocumentNoun.value}，确认前可继续调整${config.value.title}信息。`,
);
const operationPermissionHint = computed(() => (
  !canPostWarehouse.value ? warehousePostReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u63d0\u4ea4\u3001\u8fc7\u8d26\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';
const pageHeading = computed(() => {
  if (isNew.value) return config.value.newTitle;
  if (isEdit.value) return !canEditCurrentStatus.value ? `${config.value.title}只读` : documentDraft.value?.status === '盘点中' ? '录入盘点结果' : config.value.editTitle;
  return config.value.detailTitle;
});
const warehouseNextStepGuidance = computed(() => {
  const status = documentDraft.value?.status || '-';
  if (documentDraft.value?.reversalCode) {
    return {
      label: '库存影响已冲销',
      action: documentDraft.value.reversalCode,
      description: `原${config.value.title}状态与历史流水保持不变；冲销记录已反向修正库存。`,
      tone: 'muted',
    };
  }
  const action = warehouseEditorPrimaryAction.value;
  const finalStatusText = config.value.finalStatus.startsWith('已') ? config.value.finalStatus : `已${config.value.finalStatus}`;
  if (currentKind.value === 'productionIssues') {
    if (status === '草稿') {
      return {
        label: '提交领料单',
        action: '提交',
        description: '生产安排已确认并锁定本次物料；提交后进入仓库待出库，此时尚未扣减库存，也不会生成生产批次。',
        tone: 'pending',
      };
    }
    if (status === '待出库') {
      return {
        label: '确认领料出库',
        action: '确认出库',
        description: '确认实际领料数量并扣减库存；成功后生产安排标记为已领料，并生成生产批次。',
        tone: 'tracking',
      };
    }
    if (status === '已完成') {
      const executionCard = documentDraft.value?.executionCard || '已由服务器生成';
      return {
        label: '物料已领',
        action: '结果已回传生产',
        description: `领料已完成，生产批次 ${executionCard} 已由系统生成；仓库职责到库存扣减和结果回传为止。`,
        tone: 'done',
      };
    }
  }
  if (currentKind.value === 'productionReceipts') {
    const descriptions: Record<string, string> = {
      草稿: '核对生产批次与质检放行量；保存草稿不会增加成品库存。',
      待入库: '质检已放行，仓库确认实收数量并入库后，才计入成品库存和销售订单生产入库量。',
      已完成: '完工入库已完成；生产、仓库和销售订单使用同一累计入库数量。',
    };
    return {
      label: action?.label || (status === '已完成' ? '完工入库已完成' : '确认完工入库'),
      action: action?.label || (status === '已完成' ? '查看库存流水' : '继续处理'),
      description: descriptions[status] || '仅质检放行数量可以办理完工入库。',
      tone: status === '已完成' ? 'done' : status === '草稿' ? 'pending' : 'tracking',
    };
  }
  if (currentKind.value === 'productionReturns') {
    const descriptions: Record<string, string> = {
      草稿: '引用已完成的原领料单，只填写现场未消耗且实际交回的数量；保存不会改变库存。',
      待入库: '仓库核对物料、批次和实收数量；确认退料后恢复原物料批次库存，但不回退工单已领料状态。',
      已完成: '退料已完成并写入库存流水；原领料记录和生产执行历史保持不变。',
    };
    return {
      label: action?.label || (status === '已完成' ? '生产退料已完成' : '确认生产退料'),
      action: action?.label || (status === '已完成' ? '查看库存流水' : '继续处理'),
      description: descriptions[status] || '生产退料必须引用原领料单，并受剩余可退数量约束。',
      tone: status === '已完成' ? 'done' : status === '草稿' ? 'pending' : 'tracking',
    };
  }
  if (isOtherMove.value) {
    const descriptions: Record<string, string> = {
      草稿: '补齐业务类型、用途或原因、库存路径及物料批次；提交后进入审核，库存不会变化。',
      待审核: '核对用途、数量、仓库和批次；审核通过后等待确认库存变动，库存暂不变化。',
      待过账: '复核实际出入库数量和批次后确认；成功后更新库存余额与流水。',
      已过账: '库存余额和流水已更新；如需纠错，应生成独立冲销记录，不改写原单。',
    };
    const labels: Record<string, string> = {
      草稿: '提交业务审核',
      待审核: '审核用途与数量',
      待过账: '确认库存变动',
      已过账: '库存已过账',
    };
    return {
      label: labels[status] || action?.label || '查看处理记录',
      action: action?.label || (status === '已过账' ? '查看库存流水' : '查看日志'),
      description: descriptions[status] || '审批结果和库存变动分开记录。',
      tone: status === '已过账' ? 'done' : status === '草稿' ? 'pending' : 'tracking',
    };
  }
  if (isTransfer.value) {
    const descriptions: Record<string, string> = {
      草稿: '确认物料、批次和调入调出仓；提交后等待调出仓作业。',
      待出库: '确认出库后立即扣减调出仓库存，并把同批物料计入调入仓在途。',
      调拨中: '物料已离开调出仓并计入在途；调入仓确认实收后，系统才减少在途并增加可用库存。',
      待入库: '兼容旧调拨记录；确认调入后减少在途并增加调入仓可用库存。',
      已完成: '调拨已完成，调出、在途和调入三段库存均已更新。',
      已取消: '调拨在实际调出前已取消，没有扣减调出仓库存，也没有形成在途或调入库存。',
    };
    if (isCancelled.value) {
      return {
        label: status === '已作废' ? '历史调拨已作废' : '调拨已取消',
        action: status === '已作废' ? '查看作废记录' : '查看取消记录',
        description: descriptions[status] || descriptions.已取消,
        tone: 'muted',
      };
    }
    if (warehousePrimaryActionBlockedReason.value) {
      return {
        label: '调拨信息不完整',
        action: '取消后重建',
        description: warehousePrimaryActionBlockedReason.value,
        tone: 'muted',
      };
    }
    return {
      label: action?.label || '调拨完成',
      action: action?.label || '查看库存流水',
      description: descriptions[status] || '按调出、在途、调入三个阶段确认库存。',
      tone: status === '已完成' ? 'done' : status === '草稿' ? 'pending' : 'tracking',
    };
  }
  if (isStocktake.value) {
    const descriptions: Record<string, string> = {
      待盘点: '开始盘点后记录账面数量，并暂停使用盘点范围内的当前库存。',
      盘点中: '逐行填写实盘数量；全部填写后才能提交复核。',
      待复核: '复核账面数、实盘数和差异；完成后自动更新库存差异并解除冻结。',
      已完成: '盘盈盘亏已进入库存流水，盘点冻结已解除。',
      已取消: '本次盘点未更新库存差异，盘点冻结已经解除；取消原因保留在日志中。',
    };
    if (isStocktakeCancelled.value) {
      return {
        label: status === '已作废' ? '历史盘点已作废' : '盘点已取消',
        action: status === '已作废' ? '查看作废记录' : '查看取消记录',
        description: stocktakeCancelledBeforeStart.value
          ? '本次盘点在开始前已取消，未形成账面快照、库存差异或库存冻结。'
          : descriptions.已取消,
        tone: 'muted',
      };
    }
    return {
      label: action?.label || '盘点完成',
      action: action?.label || '查看盘点流水',
      description: descriptions[status] || '按账面数、实盘、复核和库存差异推进。',
      tone: status === '已完成' ? 'done' : status === '待盘点' ? 'pending' : 'tracking',
    };
  }
  if (action) {
    return {
      label: action.label,
      action: action.label,
      description: `${config.value.title}当前处于${status}，按下一步推进；完整库存影响和处理历史通过摘要与日志追溯。`,
      tone: status === '草稿' || status === '待盘点' ? 'pending' : 'tracking',
    };
  }
  return {
    label: isFinal.value ? config.value.finalStatus : '查看日志',
    action: '查看日志',
    description: isFinal.value ? `${config.value.title}${finalStatusText}，库存和流水结果可在摘要与日志中追溯。` : '当前状态不可继续流转，请结合日志确认原因。',
    tone: isFinal.value ? 'done' : 'muted',
  };
});
type WarehouseMoreAction = { key: 'edit' | 'reverse' | 'cancel-transfer' | 'cancel-stocktake' | 'return-stocktake'; label: string; description: string; tone?: 'normal' | 'danger' };

const warehouseMoreActions = computed<WarehouseMoreAction[]>(() => {
  if (!isDetail.value || !canWriteWarehouse.value) return [];
  const actions: WarehouseMoreAction[] = [];
  if (canEditCurrentStatus.value) {
    actions.push({ key: 'edit', label: warehouseEditActionLabel.value, description: isStocktake.value && documentDraft.value?.status === '盘点中' ? '录入本次盘点的逐行实盘数量。' : `调整${config.value.title}信息。` });
  }
  if (isStocktake.value && canPostWarehouse.value && ['待盘点', '盘点中'].includes(String(documentDraft.value?.status || ''))) {
    actions.push({ key: 'cancel-stocktake', label: '取消盘点', description: '终止本次盘点并解除已形成的库存冻结，必须填写原因。', tone: 'danger' });
  }
  if (isStocktake.value && canPostWarehouse.value && documentDraft.value?.status === '待复核') {
    actions.push({ key: 'return-stocktake', label: '退回实盘', description: '保留账面数和冻结，将盘点单退回继续核对实盘数量。' });
  }
  if (isTransfer.value && canPostWarehouse.value && ['草稿', '待出库'].includes(String(documentDraft.value?.status || ''))) {
    actions.push({ key: 'cancel-transfer', label: '取消调拨', description: '终止尚未实际调出的任务，不改变任何库存，必须填写原因。', tone: 'danger' });
  }
  if (isFinal.value && warehouseRuntimeTypes[currentKind.value] && !documentDraft.value?.reversalCode && canPostWarehouse.value) {
    actions.push({ key: 'reverse', label: '冲销库存', description: '生成独立冲销记录和反向库存流水，不改写原单。', tone: 'danger' });
  }
  return actions;
});

async function handleWarehouseMoreAction(action: WarehouseMoreAction) {
  if (!documentDraft.value) return;
  warehouseMoreActionsOpen.value = false;
  if (action.key === 'edit') {
    await router.push(`/warehouse/${config.value.routeSegment}/${encodeURIComponent(documentDraft.value.code)}/edit`);
  } else if (action.key === 'reverse') {
    warehouseMoreActionsTrigger.value?.focus();
    reversalDialogOpen.value = true;
  } else if (action.key === 'cancel-stocktake') {
    warehouseMoreActionsTrigger.value?.focus();
    stocktakeReasonMode.value = 'cancel';
  } else if (action.key === 'return-stocktake') {
    warehouseMoreActionsTrigger.value?.focus();
    stocktakeReasonMode.value = 'return';
  } else if (action.key === 'cancel-transfer') {
    warehouseMoreActionsTrigger.value?.focus();
    transferCancelDialogOpen.value = true;
  }
}

const stocktakeReasonDialogConfig = computed(() => (
  stocktakeReasonMode.value === 'cancel'
    ? {
        title: '取消库存盘点',
        note: '取消后不会形成盘盈盘亏；已经生成的盘点冻结会立即解除，账面数和取消记录保留供追溯。',
        reasonLabel: '取消原因',
        placeholder: '例如：盘点范围选择错误，需要取消后重新建立盘点单。',
        submitLabel: '确认取消',
        pendingLabel: '取消中',
        danger: true,
      }
    : {
        title: '退回继续实盘',
        note: '退回后继续保留账面数和库存冻结，盘点人员可以修正实盘数量并再次提交复核。',
        reasonLabel: '退回原因',
        placeholder: '例如：现场记录与复核结果不一致，需要重新核对第 2 行实盘数量。',
        submitLabel: '确认退回',
        pendingLabel: '退回中',
        danger: false,
      }
));

async function submitStocktakeSecondaryAction(reason: string) {
  if (!documentDraft.value || !stocktakeReasonMode.value) return;
  const mode = stocktakeReasonMode.value;
  await runWarehouseAction('stocktake-secondary', async () => {
    try {
      const response = mode === 'cancel'
        ? await cancelWarehouseStocktake(documentDraft.value!.code, reason)
        : await returnWarehouseStocktake(documentDraft.value!.code, reason);
      documentDraft.value = toDraft(response.stocktake as Record<string, any>);
      flowRecords.value = response.flowRecords;
      stocktakeReasonMode.value = '';
      showToast(mode === 'cancel' ? '库存盘点已取消，冻结已解除' : '库存盘点已退回实盘');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '库存盘点处理失败', 'error');
    }
  });
}

async function submitTransferCancellation(reason: string) {
  if (!documentDraft.value || !isTransfer.value) return;
  await runWarehouseAction('transfer-cancel', async () => {
    try {
      const response = await cancelWarehouseTransfer(documentDraft.value!.code, reason);
      documentDraft.value = toDraft(response.transfer as Record<string, any>);
      flowRecords.value = response.flowRecords;
      transferCancelDialogOpen.value = false;
      showToast('库存调拨已取消，未产生库存变动');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '取消库存调拨失败', 'error');
    }
  });
}

async function submitWarehouseReversal(reason: string) {
  const runtimeType = warehouseRuntimeTypes[currentKind.value];
  if (!documentDraft.value || !runtimeType) return;
  await runWarehouseAction('reverse', async () => {
    try {
      const response = await reverseWarehouseDocument(runtimeType, documentDraft.value!.code, {
        reason,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `warehouse-reversal-${Date.now()}`,
      });
      documentDraft.value = toDraft(response.record as Record<string, any>);
      flowRecords.value = response.flowRecords;
      reversalDialogOpen.value = false;
      showToast(`${response.reversal.code} 已完成库存冲销`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : `${config.value.title}库存冲销失败`, 'error');
    }
  });
}
const operationLineProducts = computed<WarehouseOperationLineProduct[]>(() => {
  const draft = documentDraft.value;
  const products = (draft?.products ?? []) as WarehouseOperationLineProduct[];
  if (!isDetail.value || !isTransfer.value || !Array.isArray(draft?.transitLines) || !draft.transitLines.length) {
    return products;
  }

  return draft.transitLines.map((line: Record<string, any>) => {
    const sourceProduct = products.find((product) => (
      (line.lineId && product.lineId === line.lineId)
      || (line.materialCode && product.materialCode === line.materialCode)
    ));
    const sourceInventory = warehouseInventoryRows.value.find((row) => row.key === line.inventoryKey);
    const inventoryKeyParts = String(line.inventoryKey || '').split('::');
    return {
      ...(sourceProduct || { name: line.name || line.materialCode || '未命名物料', qty: '' }),
      lineId: line.lineId || sourceProduct?.lineId,
      materialCode: line.materialCode || sourceProduct?.materialCode,
      name: line.name || sourceProduct?.name || line.materialCode || '未命名物料',
      qty: String(line.qty ?? ''),
      uom: line.uom || sourceProduct?.uom,
      batch: line.batch || sourceProduct?.batch || '',
      sourceLocation: sourceInventory?.location || inventoryKeyParts[2] || '',
    };
  });
});
const lineItems = computed(() =>
  operationLineProducts.value.map((product: WarehouseOperationLineProduct, index: number) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image:
      productVisuals[product.name] ??
      purchaseMaterialVisuals[product.name] ?? {
        label: product.imageLabel || '',
        tone: product.imageTone || '#eeeeee',
    },
  })),
);
const documentAttachments = computed<Attachment[]>(() => documentDraft.value?.attachments ?? []);
const selectedLineCount = computed(() =>
  lineItems.value.filter((item: WarehouseMoveProduct) => productIdentity(item, '').trim()).length,
);
const warehouseDocumentLifecycleStatus = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return '-';
  if (draft.reversalCode) return '已冲销';
  if (isOtherMove.value) {
    if (draft.status === '草稿') return '草稿';
    if (draft.status === '已过账') return '已完成';
    return '执行中';
  }
  if (isTransfer.value) {
    if (draft.status === '草稿') return '草稿';
    if (draft.status === '已完成') return '已完成';
    if (isCancelled.value) return '已取消';
    return '执行中';
  }
  if (isStocktake.value) {
    if (draft.status === '待盘点') return '草稿';
    if (draft.status === '已完成') return '已完成';
    if (['已取消', '已作废'].includes(draft.status)) return '已取消';
    return '执行中';
  }
  if (!isStructuredProductionMaterialMove.value) return draft.status || '-';
  if (draft.status === '已完成') return '已完成';
  if (draft.status === '草稿') return '草稿';
  return '执行中';
});
const productionIssueOperationStage = computed(() => {
  const status = String(documentDraft.value?.status || '');
  if (status === '已完成') return '已领料';
  if (status === '待出库') return '待确认';
  if (status === '草稿') return '待提交';
  return status || '-';
});
const productionReturnOperationStage = computed(() => {
  const status = String(documentDraft.value?.status || '');
  if (status === '已完成') return '已退料';
  if (status === '待入库') return '待确认';
  if (status === '草稿') return '待提交';
  return status || '-';
});
const productionReceiptOperationStage = computed(() => {
  const status = String(documentDraft.value?.status || '');
  if (status === '已完成') return '已入库';
  if (status === '待入库') return '待确认';
  if (status === '草稿') return '待提交';
  return status || '-';
});
const otherMoveApprovalStage = computed(() => {
  const status = String(documentDraft.value?.status || '');
  if (status === '草稿') return '待提交';
  if (status === '待审核') return '待审核';
  return '已审核';
});
const otherMovePostingStage = computed(() => {
  const status = String(documentDraft.value?.status || '');
  if (status === '待过账') return '待过账';
  if (status === '已过账') return '已过账';
  return '未过账';
});
const transferOperationStage = computed(() => {
  if (documentDraft.value?.reversalCode) return '已冲销';
  const status = String(documentDraft.value?.status || '');
  if (status === '草稿') return '待提交';
  if (status === '待出库') return '待调出';
  if (status === '调拨中') return '在途';
  if (status === '待入库') return '待调入';
  if (status === '已完成') return '已调入';
  if (['已取消', '已作废'].includes(status)) return '已取消';
  return status || '-';
});
const transferMilestone = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return { label: '阶段时间', value: '-' };
  if (draft.reversalCode) return { label: '冲销记录', value: [draft.reversedBy, draft.reversedAt].filter(Boolean).join(' · ') || '-' };
  if (draft.status === '已完成') return { label: '调入记录', value: [draft.receivedBy, draft.receivedAt].filter(Boolean).join(' · ') || '-' };
  if (isCancelled.value) return { label: draft.status === '已作废' ? '作废记录' : '取消记录', value: [draft.cancelledBy, draft.cancelledAt].filter(Boolean).join(' · ') || '-' };
  if (['调拨中', '待入库'].includes(draft.status)) return { label: '调出记录', value: [draft.dispatchedBy, draft.dispatchedAt].filter(Boolean).join(' · ') || '-' };
  if (draft.status === '待出库') return { label: '提交记录', value: [draft.submittedBy, draft.submittedAt].filter(Boolean).join(' · ') || '-' };
  return { label: '单据日期', value: draft.date || '-' };
});
const stocktakeOperationStage = computed(() => {
  if (documentDraft.value?.reversalCode) return '已冲销';
  const status = String(documentDraft.value?.status || '');
  if (status === '待盘点') return '待开始';
  if (status === '盘点中') return '实盘中';
  if (status === '待复核') return '待复核';
  if (status === '已完成') return '已完成';
  if (['已取消', '已作废'].includes(status)) return '已取消';
  return status || '-';
});
const stocktakePostingStage = computed(() => {
  if (documentDraft.value?.reversalCode) return '已冲销';
  const status = String(documentDraft.value?.status || '');
  if (status === '待复核') return '待确认';
  if (status === '已完成') return '已完成';
  if (['已取消', '已作废'].includes(status)) return '未更新';
  return '未更新';
});
const stocktakeMilestone = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return { label: '阶段时间', value: '-' };
  if (draft.reversalCode) return { label: '冲销记录', value: [draft.reversedBy, draft.reversedAt].filter(Boolean).join(' · ') || latestFlowDetail(/库存冲销/) || '-' };
  if (draft.status === '已完成') return { label: '完成记录', value: [draft.completedBy, draft.completedAt].filter(Boolean).join(' · ') || latestFlowDetail(/完成盘点/) || '-' };
  if (['已取消', '已作废'].includes(draft.status)) return { label: draft.status === '已作废' ? '作废记录' : '取消记录', value: [draft.cancelledBy, draft.cancelledAt].filter(Boolean).join(' · ') || latestFlowDetail(/取消盘点|作废/) || '-' };
  if (draft.status === '待复核') return { label: '提交记录', value: [draft.submittedBy, draft.submittedAt].filter(Boolean).join(' · ') || latestFlowDetail(/提交复核/) || '-' };
  if (draft.status === '盘点中' && draft.reviewReturnReason) return { label: '退回记录', value: [draft.reviewReturnedBy, draft.reviewReturnedAt].filter(Boolean).join(' · ') || latestFlowDetail(/退回实盘/) || '-' };
  if (draft.status === '盘点中') return { label: '开始记录', value: [draft.startedBy, draft.startedAt].filter(Boolean).join(' · ') || latestFlowDetail(/开始盘点/) || '-' };
  return { label: '计划日期', value: draft.date || '-' };
});
const stocktakeScopeInputLabel = computed(() => {
  const mode = String(documentDraft.value?.scopeMode || '');
  if (mode === '按物料') return '盘点物料';
  if (mode === '按批次') return '盘点批次';
  if (mode === '按库位') return '盘点库位';
  return '盘点范围';
});
const stocktakeScopePlaceholder = computed(() => {
  const mode = String(documentDraft.value?.scopeMode || '');
  if (mode === '按批次') return '填写完整批次号';
  if (mode === '按库位') return '填写完整库位编码';
  return '填写明确范围';
});

function inventoryQualifiedQty(row: WarehouseInventoryRow) {
  const explicit = Number(row.qualifiedOnHandNumber);
  if (Number.isFinite(explicit)) return explicit;
  return Number.parseFloat(String(row.qualifiedOnHand || row.available || '0').replace(/[^\d.-]/g, '')) || 0;
}

const selectedStocktakeInventoryRows = computed(() => {
  const draft = documentDraft.value;
  if (!draft?.warehouseCode && !draft?.warehouse) return [];
  return warehouseInventoryRows.value.filter((row) => (
    (draft.warehouseCode ? row.warehouseCode === draft.warehouseCode : row.warehouse === draft.warehouse)
    && inventoryQualifiedQty(row) > 0.0001
  ));
});

const stocktakeScopeOptions = computed(() => {
  const mode = String(documentDraft.value?.scopeMode || '');
  const rows = selectedStocktakeInventoryRows.value;
  const options = new Map<string, { value: string; label: string; scopeLabel: string }>();

  if (mode === '按库位') {
    rows.forEach((row) => {
      const value = String(row.location || '').trim();
      if (!value || options.has(value)) return;
      const rowCount = rows.filter((candidate) => candidate.location === value).length;
      const displayLocation = warehouseLocationDisplay(value);
      options.set(value, {
        value,
        label: `${displayLocation} · ${rowCount} 条当前库存`,
        scopeLabel: displayLocation,
      });
    });
  } else if (mode === '按物料') {
    rows.forEach((row) => {
      const value = String(row.materialCode || row.item || '').trim();
      if (!value || options.has(value)) return;
      options.set(value, {
        value,
        label: [row.item, row.materialCode].filter(Boolean).join(' · '),
        scopeLabel: row.item,
      });
    });
  } else if (mode === '按批次') {
    rows.forEach((row) => {
      const value = String(row.batch || '').trim();
      if (!value) return;
      const batchRows = rows.filter((candidate) => candidate.batch === value);
      const itemNames = Array.from(new Set(batchRows.map((candidate) => candidate.item).filter(Boolean)));
      options.set(value, {
        value,
        label: `${value} · ${itemNames.join('、')}`,
        scopeLabel: value,
      });
    });
  }

  return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN', { numeric: true }));
});

const stocktakePreviewRows = computed(() => {
  const draft = documentDraft.value;
  const rows = selectedStocktakeInventoryRows.value;
  const scope = String(draft?.scope || '').trim();
  if (!draft || !scope) return [];
  if (draft.scopeMode === '全仓盘点') return rows;
  if (draft.scopeMode === '按库位') return rows.filter((row) => String(row.location || '').trim() === scope);
  if (draft.scopeMode === '按物料') return rows.filter((row) => String(row.materialCode || '').trim() === scope);
  if (draft.scopeMode === '按批次') return rows.filter((row) => String(row.batch || '').trim() === scope);
  const scopeKey = scope.toLowerCase();
  return rows.filter((row) => [row.location, row.materialCode, row.item, row.batch]
    .some((value) => {
      const rowKey = String(value || '').trim().toLowerCase();
      return rowKey.includes(scopeKey) || scopeKey.includes(rowKey);
    }));
});

const transferTargetLocationOptions = computed(() => {
  const draft = documentDraft.value;
  if (!draft?.toWarehouseCode && !draft?.toWarehouse) return [];
  const locations = new Set(
    selectedTransferLocationOptions.value
      .map((location) => String(location || '').trim())
      .filter((location) => Boolean(location) && !isPlaceholderWarehouseLocation(location)),
  );
  const configuredWarehouse = warehouseReferenceRows.value.find((warehouse) => (
    draft.toWarehouseCode ? warehouse.code === draft.toWarehouseCode : warehouse.name === draft.toWarehouse
  ));
  (configuredWarehouse?.locationOptions || []).forEach((location) => {
    const value = String(location || '').trim();
    if (value && !isPlaceholderWarehouseLocation(value)) locations.add(value);
  });
  warehouseInventoryRows.value.forEach((row) => {
    const matchesWarehouse = draft.toWarehouseCode
      ? row.warehouseCode === draft.toWarehouseCode
      : row.warehouse === draft.toWarehouse;
    const location = String(row.location || '').trim();
    if (matchesWarehouse && location && !isPlaceholderWarehouseLocation(location)) locations.add(location);
  });
  const current = String(draft.toLocation || '').trim();
  if (current && !isPlaceholderWarehouseLocation(current)) locations.add(current);
  return Array.from(locations).sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
});

const otherMoveLocationOptions = computed(() => {
  const draft = documentDraft.value;
  if (!draft?.warehouseCode && !draft?.warehouse) return [];
  const locations = new Set(
    selectedOtherMoveLocationOptions.value
      .map((location) => String(location || '').trim())
      .filter((location) => Boolean(location) && !isPlaceholderWarehouseLocation(location)),
  );
  const configuredWarehouse = warehouseReferenceRows.value.find((warehouse) => (
    draft.warehouseCode ? warehouse.code === draft.warehouseCode : warehouse.name === draft.warehouse
  ));
  (configuredWarehouse?.locationOptions || []).forEach((location) => {
    const value = String(location || '').trim();
    if (value && !isPlaceholderWarehouseLocation(value)) locations.add(value);
  });
  warehouseInventoryRows.value.forEach((row) => {
    const matchesWarehouse = draft.warehouseCode
      ? row.warehouseCode === draft.warehouseCode
      : row.warehouse === draft.warehouse;
    const location = String(row.location || '').trim();
    if (matchesWarehouse && location && !isPlaceholderWarehouseLocation(location)) locations.add(location);
  });
  const current = String(draft.location || '').trim();
  if (current && !isPlaceholderWarehouseLocation(current)) locations.add(current);
  return Array.from(locations).sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
});

function isPlaceholderWarehouseLocation(location: string) {
  const value = String(location || '').trim();
  return value === '默认库位' || /-AUTO$/i.test(value);
}

function warehouseLocationDisplay(location: string | undefined) {
  const value = String(location || '').trim();
  return !value || isPlaceholderWarehouseLocation(value) ? '历史库位未登记' : value;
}

const otherMoveLocationDisplay = computed(() => {
  return warehouseLocationDisplay(documentDraft.value?.location);
});

const transferTargetLocationDisplay = computed(() => {
  const location = String(documentDraft.value?.toLocation || '').trim();
  return !location || isPlaceholderWarehouseLocation(location) ? '目标库位未设置' : location;
});

const productionReceiptTargetLocationOptions = computed(() => {
  const draft = documentDraft.value;
  if (!draft?.targetWarehouseCode && !draft?.targetWarehouse) return [];
  const locations = new Set(
    selectedProductionReceiptLocationOptions.value
      .map((location) => String(location || '').trim())
      .filter((location) => Boolean(location) && !isPlaceholderWarehouseLocation(location)),
  );
  const configuredWarehouse = warehouseReferenceRows.value.find((warehouse) => (
    draft.targetWarehouseCode
      ? warehouse.code === draft.targetWarehouseCode
      : warehouse.name === draft.targetWarehouse
  ));
  (configuredWarehouse?.locationOptions || []).forEach((location) => {
    const value = String(location || '').trim();
    if (value && !isPlaceholderWarehouseLocation(value)) locations.add(value);
  });
  warehouseInventoryRows.value.forEach((row) => {
    const matchesWarehouse = draft.targetWarehouseCode
      ? row.warehouseCode === draft.targetWarehouseCode
      : row.warehouse === draft.targetWarehouse;
    const location = String(row.location || '').trim();
    if (matchesWarehouse && location && !isPlaceholderWarehouseLocation(location)) locations.add(location);
  });
  return Array.from(locations).sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
});

function lineQuantityWithUnit(product: WarehouseMoveProduct) {
  const quantity = String(product.qty ?? '').trim();
  const unit = String(product.uom || '').trim();
  if (!quantity) return '-';
  if (!unit || quantity.includes(unit)) return quantity;
  return `${quantity} ${unit}`;
}

function otherMoveBatchOptions(product: WarehouseMoveProduct) {
  const draft = documentDraft.value;
  if (!isOtherMove.value || draft?.direction !== '出库' || !product.batchTracked) return [];
  const options = new Map<string, { value: string; label: string }>();
  warehouseInventoryRows.value.forEach((row) => {
    const matchesWarehouse = draft.warehouseCode
      ? row.warehouseCode === draft.warehouseCode
      : row.warehouse === draft.warehouse;
    const matchesLocation = !draft.location || row.location === draft.location;
    const matchesMaterial = product.materialCode
      ? row.materialCode === product.materialCode
      : row.item === product.name;
    const parsedAvailable = Number.parseFloat(String(row.available || '0').replace(/,/g, ''));
    const available = Number(row.availableNumber ?? (Number.isFinite(parsedAvailable) ? parsedAvailable : 0));
    const batch = String(row.batch || '').trim();
    if (!matchesWarehouse || !matchesLocation || !matchesMaterial || available <= 0 || !batch) return;
    options.set(batch, {
      value: batch,
      label: `${batch} · 可用 ${row.available}`,
    });
  });
  return [...options.values()].sort((left, right) => left.value.localeCompare(right.value, 'zh-CN', { numeric: true }));
}

function transferBatchOptions(product: WarehouseMoveProduct) {
  const draft = documentDraft.value;
  if (!isTransfer.value || !product.batchTracked) return [];
  const options = new Map<string, { value: string; available: number; locations: Set<string> }>();
  warehouseInventoryRows.value.forEach((row) => {
    const matchesWarehouse = draft?.fromWarehouseCode
      ? row.warehouseCode === draft.fromWarehouseCode
      : row.warehouse === draft?.fromWarehouse;
    const matchesMaterial = product.materialCode
      ? row.materialCode === product.materialCode
      : row.item === product.name;
    const parsedAvailable = Number.parseFloat(String(row.available || '0').replace(/,/g, ''));
    const available = Number(row.availableNumber ?? (Number.isFinite(parsedAvailable) ? parsedAvailable : 0));
    const batch = String(row.batch || '').trim();
    if (!matchesWarehouse || !matchesMaterial || available <= 0 || !batch) return;
    const option = options.get(batch) || { value: batch, available: 0, locations: new Set<string>() };
    option.available += available;
    const location = String(row.location || '').trim();
    if (location && !isPlaceholderWarehouseLocation(location)) option.locations.add(location);
    options.set(batch, option);
  });
  return [...options.values()]
    .map((option) => ({
      value: option.value,
      label: [
        option.value,
        `可用 ${stocktakeQty(option.available, product.uom || '')}`,
        option.locations.size === 1 ? [...option.locations][0] : option.locations.size > 1 ? `${option.locations.size} 个库位` : '',
      ].filter(Boolean).join(' · '),
    }))
    .sort((left, right) => left.value.localeCompare(right.value, 'zh-CN', { numeric: true }));
}

function lineBatchDisplay(product: WarehouseMoveProduct) {
  const sourceLocation = String((product as WarehouseOperationLineProduct).sourceLocation || '').trim();
  if (sourceLocation && product.batch) return `${sourceLocation} / ${product.batch}`;
  if (sourceLocation) return `${sourceLocation} / 不追踪批次`;
  if (product.batch) return product.batch;
  if (!product.materialCode && !product.name) return '—';
  if (!product.batchTracked) return '不追踪批次';
  if (isTransfer.value && ['草稿', '待出库'].includes(String(documentDraft.value?.status || ''))) return '确认调出时自动分配';
  return documentDraft.value?.direction === '入库' ? '过账时生成' : '批次未记录';
}

function latestFlowDetail(pattern: RegExp) {
  const record = [...flowRecords.value].reverse().find((item) => pattern.test(String(item.action || '')));
  return record ? [record.actor, record.time].filter(Boolean).join(' · ') : '';
}

function otherMoveMilestoneDetail(atField: string, byField: string, fallbackPattern: RegExp) {
  const draft = documentDraft.value;
  const direct = [draft?.[byField], draft?.[atField]].filter(Boolean).join(' · ');
  return direct || latestFlowDetail(fallbackPattern);
}

const otherMoveSubmittedDetail = computed(() => otherMoveMilestoneDetail('submittedAt', 'submittedBy', /提交审核/));
const otherMoveApprovedDetail = computed(() => otherMoveMilestoneDetail('approvedAt', 'approvedBy', /审核通过/));
const otherMovePostedDetail = computed(() => otherMoveMilestoneDetail('postedAt', 'postedBy', /确认过账|确认库存变动/));
const productionIssueMilestoneLabel = computed(() => (
  documentDraft.value?.postedAt ? '完成时间' : documentDraft.value?.submittedAt ? '提交时间' : '最近更新'
));
const productionIssueMilestoneTime = computed(() => (
  documentDraft.value?.postedAt || documentDraft.value?.submittedAt || documentDraft.value?.updatedAt || '-'
));
const showWarehouseNoteSection = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return false;
  if (!isDetail.value) return true;
  const note = String(draft.note || '').trim();
  if (!note) return false;
  if (!isAuthoritativeProductionIssue.value && !isAuthoritativeProductionReceipt.value) return true;
  if (isAuthoritativeProductionReceipt.value) {
    return !(draft.executionCard && note.includes(String(draft.executionCard)) && /承接|质检放行|入库/.test(note));
  }
  return !(draft.releaseBatch && note.includes(String(draft.releaseBatch)) && /领料|生产批次/.test(note));
});
const canEditStocktakeCounts = computed(() => (
  isStocktake.value
  && isEdit.value
  && documentDraft.value?.status === '盘点中'
  && canWriteWarehouse.value
));

function stocktakeDifference(line: Record<string, any>) {
  if (line.countedQty === '' || line.countedQty == null) return null;
  return Number(line.countedQty || 0) - Number(line.bookQty || 0);
}

function productionIssueLineWarehouse(product: WarehouseMoveProduct) {
  return String((product as WarehouseMoveProduct & { warehouse?: string }).warehouse || documentDraft.value?.warehouse || '-');
}

function stocktakeQty(value: number | null, unit = '') {
  if (value == null) return '待盘';
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`;
}

function stocktakeAvailableQuantitySummary(rows: WarehouseInventoryRow[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const parsedAvailable = Number.parseFloat(String(row.available || '0').replace(/,/g, ''));
    const quantity = Number(row.availableNumber ?? (Number.isFinite(parsedAvailable) ? parsedAvailable : 0));
    if (!Number.isFinite(quantity)) return;
    const unit = String(row.uom || '').trim();
    totals.set(unit, (totals.get(unit) || 0) + quantity);
  });
  return [...totals.entries()].map(([unit, quantity]) => stocktakeQty(quantity, unit)).join(' / ');
}

function stocktakeQuantitySummary(lines: Record<string, any>[], field: 'bookQty' | 'countedQty') {
  const totals = new Map<string, number>();
  lines.forEach((line) => {
    if (field === 'countedQty' && (line.countedQty === '' || line.countedQty == null)) return;
    const quantity = Number(line[field]);
    if (!Number.isFinite(quantity)) return;
    const unit = String(line.uom || '').trim();
    totals.set(unit, (totals.get(unit) || 0) + quantity);
  });
  return [...totals.entries()].map(([unit, quantity]) => stocktakeQty(quantity, unit)).join(' / ');
}

function stocktakeDifferenceQuantitySummary(lines: Record<string, any>[]) {
  const gains = new Map<string, number>();
  const losses = new Map<string, number>();
  lines.forEach((line) => {
    const difference = stocktakeDifference(line);
    if (difference == null || Math.abs(difference) <= 0.0001) return;
    const unit = String(line.uom || '').trim();
    const target = difference > 0 ? gains : losses;
    target.set(unit, (target.get(unit) || 0) + Math.abs(difference));
  });
  const format = (totals: Map<string, number>) => (
    [...totals.entries()].map(([unit, quantity]) => stocktakeQty(quantity, unit)).join(' / ')
  );
  return [
    gains.size ? `盘盈 ${format(gains)}` : '',
    losses.size ? `盘亏 ${format(losses)}` : '',
  ].filter(Boolean).join('；') || '无差异';
}

function transferQuantitySummary(lines: Record<string, any>[]) {
  const totals = new Map<string, number>();
  lines.forEach((line) => {
    const quantity = Number.parseFloat(String(line.qty ?? '0').replace(/,/g, ''));
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const unit = String(line.uom || '').trim();
    totals.set(unit, (totals.get(unit) || 0) + quantity);
  });
  return [...totals.entries()].map(([unit, quantity]) => stocktakeQty(quantity, unit)).join(' / ');
}

function stocktakeLineVisual(line: {
  item: string;
  materialCode?: string;
  imageLabel?: string;
  imageTone?: string;
}) {
  return productVisuals[line.item]
    ?? purchaseMaterialVisuals[line.item]
    ?? {
      label: line.imageLabel || '',
      tone: line.imageTone || '#eeeeee',
    };
}

function refreshStocktakeMetrics() {
  const draft = documentDraft.value;
  if (!draft || !Array.isArray(draft.lines)) return;
  draft.plannedCount = draft.lines.length;
  draft.checkedCount = draft.lines.filter((line: Record<string, any>) => line.countedQty !== '' && line.countedQty != null).length;
  draft.differenceCount = draft.lines.filter((line: Record<string, any>) => {
    const difference = stocktakeDifference(line);
    return difference != null && Math.abs(difference) > 0.0001;
  }).length;
}
const summaryRows = computed(() => {
  const draft = documentDraft.value;
  if (!draft) return [];

  if (isStocktake.value) {
    if (isDetail.value) {
      const lines = Array.isArray(draft.lines) ? draft.lines : [];
      if (stocktakeCancelledBeforeStart.value) {
        return [
          { label: '账面快照', value: '未形成' },
          { label: '实盘结果', value: '未开始' },
          { label: '差异结果', value: '未形成' },
          { label: '库存状态', value: '库存未更新，未形成冻结' },
        ];
      }
      const bookQuantity = stocktakeQuantitySummary(lines, 'bookQty');
      const countedQuantity = stocktakeQuantitySummary(lines, 'countedQty');
      const differenceQuantity = stocktakeDifferenceQuantitySummary(lines);
      return [
        { label: '账面合格数', value: bookQuantity || '尚未形成快照' },
        { label: '实盘合格数', value: countedQuantity || '待实盘' },
        { label: draft.reversalCode ? '原差异数量' : '差异数量', value: draft.checkedCount ? differenceQuantity : '待实盘' },
        { label: '库存状态', value: draft.reversalCode ? '原盘盈盘亏已冲销，冻结保持解除' : draft.status === '已完成' ? '差异已过账，冻结已解除' : isStocktakeCancelled.value ? '库存未更新，冻结已解除' : draft.status === '待盘点' ? '尚未形成快照或冻结' : '盘点范围内可用库存已冻结' },
      ];
    }
    return [
      { label: '盘点仓库', value: draft.warehouse || '-' },
      { label: '盘点方式', value: draft.scopeMode || '-' },
      { label: '盘点范围', value: draft.scopeLabel || draft.scope || '-' },
      { label: '负责人', value: draft.owner || '-' },
    ];
  }

  if (isTransfer.value) {
    const transitLines = Array.isArray(draft.transitLines) ? draft.transitLines : [];
    const quantitySummary = transferQuantitySummary(transitLines.length ? transitLines : draft.products || []);
    const dispatched = ['调拨中', '待入库', '已完成'].includes(draft.status);
    const completed = draft.status === '已完成';
    const cancelled = isCancelled.value;
    const reversed = Boolean(draft.reversalCode);
    if (isDetail.value) {
      return [
        { label: '调出库存', value: reversed ? `原扣减已恢复${quantitySummary ? ` · ${quantitySummary}` : ''}` : cancelled ? '未扣减' : dispatched ? `已扣减${quantitySummary ? ` · ${quantitySummary}` : ''}` : '尚未扣减' },
        { label: '在途数量', value: cancelled ? '0 · 未形成' : completed || reversed ? '0 · 已清零' : transitLines.length ? quantitySummary : '尚未形成' },
        { label: '调入库存', value: reversed ? `原入库已扣回${quantitySummary ? ` · ${quantitySummary}` : ''}` : cancelled ? '未增加' : completed ? `已增加${quantitySummary ? ` · ${quantitySummary}` : ''}` : '尚未增加' },
        { label: '明细数量', value: `${selectedLineCount.value} 项` },
      ];
    }
    return [
      { label: '调出仓库', value: draft.fromWarehouse || '-' },
      { label: '调入仓库', value: draft.toWarehouse || '-' },
      { label: '调入库位', value: draft.toLocation || '尚未选择' },
      { label: '调拨原因', value: draft.reason || '-' },
      ...(transitLines.length ? [{ label: '在途数量', value: completed ? '0 · 已清零' : quantitySummary }] : []),
      { label: '明细数量', value: `${selectedLineCount.value} 项` },
      { label: '经办人', value: draft.owner || '-' },
    ];
  }
  if (isProductionMove.value) {
    if (isDetail.value) {
      if (currentKind.value === 'productionReceipts') {
        const card = production2ExecutionCards.find((item) => item.code === draft.executionCard);
        const unit = card?.unit || draft.unit || draft.products?.[0]?.uom || '';
        const receiptQty = Number(draft.quantity || draft.products?.[0]?.plannedQty || 0);
        const releasedInboundQty = Number(card?.releasedInboundQty || 0);
        const cumulativeInboundQty = Number(card?.inboundQty || (draft.status === '已完成' ? receiptQty : 0));
        return [
          { label: '质检放行', value: stocktakeQty(releasedInboundQty, unit) },
          { label: '本单入库', value: stocktakeQty(receiptQty, unit) },
          { label: '批次累计入库', value: stocktakeQty(cumulativeInboundQty, unit) },
          { label: '剩余可入库', value: stocktakeQty(Math.max(0, releasedInboundQty - cumulativeInboundQty), unit) },
          { label: '库存结果', value: draft.status === '已完成' ? '已增加成品库存并同步生产进度' : '尚未增加成品库存' },
        ];
      }
      if (isStructuredProductionMaterialMove.value) {
        return [
          { label: '库存动作', value: `${draft.direction || '-'} · ${selectedLineCount.value} 项` },
          { label: '库存结果', value: draft.status === '已完成' ? '已写入库存与流水' : '尚未更新库存' },
        ];
      }
      return [
        { label: '库存动作', value: `${draft.direction || '-'} · ${selectedLineCount.value} 项` },
        { label: '库存结果', value: draft.status === '已完成' ? '已写入库存与流水' : '尚未更新库存' },
        ...(draft.releaseBatch ? [{ label: '关联生产安排', value: draft.releaseBatch }] : []),
        ...(draft.executionCard ? [{ label: '关联生产批次', value: draft.executionCard }] : []),
      ];
    }
    return [
      { label: '来源工单', value: draft.workOrder || '-' },
      ...(draft.releaseBatch ? [{ label: '生产安排', value: draft.releaseBatch }] : []),
      ...(draft.executionCard ? [{ label: '生产批次', value: draft.executionCard }] : []),
      { label: '作业类型', value: draft.moveType || '-' },
      { label: '库存方向', value: draft.direction || '-' },
      { label: operationWarehouseLabel.value, value: draft.warehouse || '-' },
      { label: operationTargetLabel.value, value: draft.targetWarehouse || '-' },
      ...(currentKind.value === 'productionReceipts'
        ? [{ label: '入库库位', value: draft.targetLocation || '待选择' }]
        : []),
      { label: '明细数量', value: `${selectedLineCount.value} 项` },
      { label: '经办人', value: draft.owner || '-' },
    ];
  }

  if (isDetail.value) {
    return [
      { label: '库存动作', value: `${draft.direction || '-'} · ${selectedLineCount.value} 项` },
      { label: '库存位置', value: [draft.warehouse, otherMoveLocationDisplay.value].filter(Boolean).join(' · ') || '-' },
      { label: '库存结果', value: draft.status === '已过账' ? '库存与流水已更新' : '尚未更新库存台账' },
    ];
  }

  return [
    { label: '业务类型', value: draft.moveType || '-' },
    { label: '库存方向', value: draft.direction || '-' },
    { label: operationWarehouseLabel.value, value: draft.warehouse || '-' },
    { label: operationTargetLabel.value, value: draft.targetWarehouse || '-' },
    { label: '明细数量', value: `${selectedLineCount.value} 项` },
    { label: '经办人', value: draft.owner || '-' },
  ];
});
const visibleSummaryRows = computed(() => summaryRows.value.filter((row) => row.value && row.value !== '-'));
const warehouseDocumentStatusItems = computed<DocumentStatusItem[]>(() => {
  if (isAuthoritativeProductionIssue.value) {
    const posted = documentDraft.value?.status === '已完成';
    return [
      {
        key: 'operation-stage',
        label: '领料阶段',
        value: productionIssueOperationStage.value,
        kind: 'status',
      },
      {
        key: 'inventory-posting',
        label: '库存结果',
        value: posted ? '已扣减' : '未扣减',
        detail: posted ? '生产分配已扣减' : '确认出库时扣减生产分配',
        kind: 'status',
        tone: posted ? 'success' : 'warning',
      },
      {
        key: 'next-action',
        label: '下一步',
        value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
        kind: 'text',
      },
      {
        key: 'line-count',
        label: '领料明细',
        value: `${selectedLineCount.value} 项`,
        kind: 'metric',
      },
    ];
  }
  if (isAuthoritativeProductionReturn.value) {
    const posted = documentDraft.value?.status === '已完成';
    return [
      {
        key: 'operation-stage',
        label: '退料阶段',
        value: productionReturnOperationStage.value,
        kind: 'status',
      },
      {
        key: 'inventory-posting',
        label: '库存结果',
        value: posted ? '已入库' : '未入库',
        detail: posted ? '已恢复原物料批次库存' : '确认退料后恢复原物料批次库存',
        kind: 'status',
        tone: posted ? 'success' : 'warning',
      },
      {
        key: 'next-action',
        label: '下一步',
        value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
        kind: 'text',
      },
      {
        key: 'line-count',
        label: '退料明细',
        value: `${selectedLineCount.value} 项`,
        kind: 'metric',
      },
    ];
  }
  if (isAuthoritativeProductionReceipt.value) {
    const posted = documentDraft.value?.status === '已完成';
    return [
      {
        key: 'operation-stage',
        label: '入库阶段',
        value: productionReceiptOperationStage.value,
        kind: 'status',
      },
      {
        key: 'inventory-posting',
        label: '库存结果',
        value: posted ? '已入库' : '未入库',
        detail: posted ? '已增加成品库存并同步生产进度' : '确认入库后增加成品库存并同步生产进度',
        kind: 'status',
        tone: posted ? 'success' : 'warning',
      },
      {
        key: 'next-action',
        label: '下一步',
        value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
        kind: 'text',
      },
      {
        key: 'line-count',
        label: '入库明细',
        value: `${selectedLineCount.value} 项`,
        kind: 'metric',
      },
    ];
  }
  if (isOtherMove.value) {
    const posted = documentDraft.value?.status === '已过账';
    const status = String(documentDraft.value?.status || '');
    return [
      {
        key: 'approval-stage',
        label: '审批阶段',
        value: otherMoveApprovalStage.value,
        detail: status === '草稿'
          ? '提交后进入待审核'
          : status === '待审核'
            ? otherMoveSubmittedDetail.value || '等待审核'
            : otherMoveApprovedDetail.value || '审核已完成',
        kind: 'status',
        tone: otherMoveApprovalStage.value === '已审核' ? 'success' : 'warning',
      },
      {
        key: 'inventory-posting',
        label: '库存结果',
        value: otherMovePostingStage.value,
        detail: posted
          ? otherMovePostedDetail.value || '库存余额和流水已更新'
          : status === '待过账'
            ? '等待确认库存变动'
            : '审核不会直接改变库存',
        kind: 'status',
        tone: posted ? 'success' : 'warning',
      },
      {
        key: 'next-action',
        label: '下一步',
        value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
        kind: 'text',
      },
    ];
  }
  if (isTransfer.value) {
    const items: DocumentStatusItem[] = [
      {
        key: 'operation-stage',
        label: '调拨阶段',
        value: transferOperationStage.value,
        detail: documentDraft.value?.reversalCode
          ? documentDraft.value?.reversalReason || '原调拨已保留，库存影响已由独立冲销记录反向修正'
          : isCancelled.value
            ? documentDraft.value?.cancellationReason || (documentDraft.value?.status === '已作废' ? '历史调拨已作废' : '本次调拨已取消')
            : undefined,
        kind: 'status',
        tone: documentDraft.value?.reversalCode ? 'neutral' : documentDraft.value?.status === '已完成' ? 'success' : isCancelled.value ? 'neutral' : 'warning',
      },
      {
        key: 'next-action',
        label: '下一步',
        value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
        kind: 'text',
      },
    ];
    if (transferMilestone.value.value !== '-') {
      items.push({
        key: 'milestone-time',
        label: transferMilestone.value.label,
        value: transferMilestone.value.value,
        kind: 'text',
      });
    }
    return items;
  }
  if (isStocktake.value) {
    const planned = Number(documentDraft.value?.plannedCount || 0);
    const checked = Number(documentDraft.value?.checkedCount || 0);
    const reversed = Boolean(documentDraft.value?.reversalCode);
    const differenceQuantity = stocktakeDifferenceQuantitySummary(documentDraft.value?.lines || []);
    return [
      {
        key: 'operation-stage',
        label: '盘点阶段',
        value: stocktakeOperationStage.value,
        detail: reversed
          ? documentDraft.value?.reversalReason || '原盘盈盘亏已由独立冲销记录反向修正'
          : isStocktakeCancelled.value
            ? documentDraft.value?.cancellationReason || '本次盘点已取消'
            : documentDraft.value?.status === '盘点中' && documentDraft.value?.reviewReturnReason
              ? `复核退回：${documentDraft.value.reviewReturnReason}`
              : undefined,
        kind: 'status',
        tone: reversed ? 'neutral' : documentDraft.value?.status === '已完成' ? 'success' : isStocktakeCancelled.value ? 'neutral' : 'warning',
      },
      {
        key: 'count-progress',
        label: '实盘进度',
        value: stocktakeCancelledBeforeStart.value ? '未开始' : planned ? `${checked} / ${planned} 项` : '尚未记录账面数',
        kind: 'metric',
      },
      {
        key: 'inventory-posting',
        label: '库存差异',
        value: stocktakePostingStage.value,
        detail: reversed
          ? `原差异 ${differenceQuantity}`
          : stocktakeCancelledBeforeStart.value
            ? '本次未形成差异'
          : checked
            ? `${Number(documentDraft.value?.differenceCount || 0)} 项差异 · ${differenceQuantity}`
            : '实盘后自动计算差异',
        kind: 'status',
        tone: reversed ? 'neutral' : documentDraft.value?.status === '已完成' ? 'success' : isStocktakeCancelled.value ? 'neutral' : 'warning',
      },
      {
        key: 'next-action',
        label: '下一步',
        value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
        kind: 'text',
      },
      ...(stocktakeMilestone.value.value !== '-'
        ? [{
            key: 'milestone-time',
            label: stocktakeMilestone.value.label,
            value: stocktakeMilestone.value.value,
            kind: 'text' as const,
          }]
        : []),
    ];
  }
  return [
    {
      key: 'next-action',
      label: '\u5f53\u524d\u5f85\u529e',
      value: warehouseNextStepGuidance.value.action || warehouseNextStepGuidance.value.label,
      kind: 'text',
    },
    {
      key: 'line-count',
      label: isStocktake.value ? '\u76d8\u70b9\u9879' : '\u660e\u7ec6\u6570\u91cf',
      value: `${isStocktake.value ? Number(documentDraft.value?.plannedCount || 0) : selectedLineCount.value} \u9879`,
      kind: 'metric',
    },
  ];
});

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function productionDirectionForMoveType(moveType: string) {
  return moveType === '完工入库' || moveType === '生产退料' ? '入库' : '出库';
}

function productionTargetForMoveType(moveType: string, currentTarget = '') {
  if (moveType === '完工入库') return currentTarget && currentTarget !== '生产线边仓' ? currentTarget : '成品仓';
  if (moveType === '生产退料') return currentTarget && currentTarget !== '生产线边仓' ? currentTarget : '';
  return currentTarget || '生产线边仓';
}

function productionLineWarehouse(line: string) {
  const value = line.trim();
  if (!value) return '生产线边仓';
  return value.endsWith('线') ? `${value}边仓` : `${value}线边仓`;
}

function createEmptyLine(): WarehouseMoveProduct {
  return {
    materialCode: '',
    name: '',
    qty: '',
    batch: '',
    uom: '',
  };
}

function createEmptyDraft(kind: EditorKind): Record<string, any> {
  if (isProductionKind(kind)) {
    const moveType = productionMoveTypeForKind(kind);
    const direction = productionDirectionForMoveType(moveType);
    return {
      code: '系统自动生成',
      moveType,
      materialIssue: '',
      workOrder: '',
      releaseBatch: '',
      executionCard: '',
      direction,
      reason: moveType,
      products: [createEmptyLine()],
      warehouseCode: '',
      warehouse: '',
      targetWarehouseCode: kind === 'productionReceipts' ? 'WH-FG' : '',
      targetWarehouse: productionTargetForMoveType(moveType),
      targetLocation: '',
      owner: session.user.name || '待分配',
      status: '草稿',
      date: today(),
      note: '',
      attachments: [],
    };
  }

  if (kind === 'transfers') {
    return {
      code: '系统自动生成',
      products: [createEmptyLine()],
      fromWarehouseCode: '',
      fromWarehouse: '',
      toWarehouseCode: '',
      toWarehouse: '',
      toLocation: '',
      owner: session.user.name || '待分配',
      status: '草稿',
      date: today(),
      reason: '',
      note: '',
      attachments: [],
      transitLines: [],
    };
  }

  if (kind === 'stocktakes') {
    return {
      code: '系统自动生成',
      warehouseCode: '',
      warehouse: '',
      scopeMode: '按库位',
      scope: '',
      scopeLabel: '',
      ownerEmployeeCode: session.user.employeeCode || '',
      owner: session.user.name || '待分配',
      status: '待盘点',
      date: today(),
      plannedCount: 0,
      checkedCount: 0,
      differenceCount: 0,
      note: '',
      attachments: [],
      lines: [],
    };
  }

  return {
    code: '系统自动生成',
    moveType: '样品出库',
    direction: '出库',
    reason: '',
    products: [createEmptyLine()],
    warehouseCode: '',
    warehouse: '',
    location: '',
    targetWarehouse: '',
    owner: session.user.name || '待分配',
    status: '草稿',
    date: today(),
    note: '',
    attachments: [],
  };
}

function toDraft(source: Record<string, any>) {
  const base = createEmptyDraft(currentKind.value);
  const inferredStocktakeScopeMode = source.scopeMode
    || (/全仓|全部库位|全库/.test(String(source.scope || '')) ? '全仓盘点' : '指定范围');
  return {
    ...base,
    ...source,
    moveType: source.moveType === '盘外调整' ? '库存调整' : source.moveType || base.moveType,
    ...(currentKind.value === 'stocktakes' ? { scopeMode: inferredStocktakeScopeMode } : {}),
    products: source.products?.length ? source.products : base.products,
  };
}

function upsertServerProductionIssue(issue: Record<string, any>) {
  const index = serverProductionIssues.value.findIndex((item) => item.code === issue.code);
  if (index >= 0) serverProductionIssues.value.splice(index, 1, issue);
  else serverProductionIssues.value.unshift(issue);
}

function upsertProductionRelease(release?: Record<string, unknown>) {
  if (!release?.code) return;
  const persisted = release as unknown as Production2ReleaseBatch;
  const index = production2ReleaseBatches.findIndex((item) => item.code === persisted.code);
  if (index >= 0) production2ReleaseBatches.splice(index, 1, persisted);
  else production2ReleaseBatches.unshift(persisted);
}

function upsertProductionExecutionCard(card?: Record<string, unknown> | null) {
  if (!card?.code) return;
  const persisted = card as unknown as Production2ExecutionCard;
  const index = production2ExecutionCards.findIndex((item) => item.code === persisted.code);
  if (index >= 0) production2ExecutionCards.splice(index, 1, persisted);
  else production2ExecutionCards.unshift(persisted);
}

function applyProductionIssueResponse(response: ProductionIssueApiResponse) {
  const executionCardCode = response.executionCard?.code?.toString() || response.issue.executionCard || '';
  const issue = { ...response.issue, executionCard: executionCardCode };
  documentDraft.value = toDraft(issue);
  flowRecords.value = response.flowRecords || [];
  upsertServerProductionIssue(issue);
  upsertProductionRelease(response.release);
  upsertProductionExecutionCard(response.executionCard);
  return issue;
}

function upsertServerProductionReturn(record: Record<string, any>) {
  const index = serverProductionReturns.value.findIndex((item) => item.code === record.code);
  if (index >= 0) serverProductionReturns.value.splice(index, 1, record);
  else serverProductionReturns.value.unshift(record);
}

function applyProductionReturnResponse(response: {
  record: Record<string, any>;
  materialIssue?: Record<string, any> | null;
  executionCard?: Production2ExecutionCard | null;
  flowRecords: FlowRecord[];
}) {
  documentDraft.value = toDraft(response.record);
  flowRecords.value = response.flowRecords || [];
  upsertServerProductionReturn(response.record);
  if (response.materialIssue) upsertServerProductionIssue(response.materialIssue);
  upsertProductionExecutionCard(response.executionCard);
  return response.record;
}

function applyProductionReceiptResponse(response: {
  receipt: Record<string, any>;
  executionCard?: Production2ExecutionCard | null;
  release?: Record<string, unknown> | null;
  workOrder?: Record<string, unknown> | null;
  flowRecords: FlowRecord[];
}) {
  documentDraft.value = toDraft(response.receipt);
  flowRecords.value = response.flowRecords || [];
  const receiptIndex = serverProductionReceipts.value.findIndex((item) => item.code === response.receipt.code);
  if (receiptIndex >= 0) serverProductionReceipts.value.splice(receiptIndex, 1, response.receipt);
  else serverProductionReceipts.value.unshift(response.receipt);
  const sharedMoveIndex = productionMoveRows.findIndex((item) => item.code === response.receipt.code);
  if (sharedMoveIndex >= 0) productionMoveRows.splice(sharedMoveIndex, 1, response.receipt as any);
  else productionMoveRows.unshift(response.receipt as any);
  upsertProductionExecutionCard(response.executionCard);
  upsertProductionRelease(response.release || undefined);
  if (response.workOrder?.code) {
    const persisted = response.workOrder as unknown as (typeof production2WorkOrders)[number];
    const orderIndex = production2WorkOrders.findIndex((item) => item.code === persisted.code);
    if (orderIndex >= 0) production2WorkOrders.splice(orderIndex, 1, persisted);
    else production2WorkOrders.unshift(persisted);
  }
  return response.receipt;
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function applyProductionContextFromQuery(draft: Record<string, any>) {
  if (!isProductionMove.value) return;
  const requestedWorkOrder = route.query.workOrder?.toString() ?? '';
  const requestedRelease = route.query.releaseBatch?.toString() ?? '';
  const requestedCard = route.query.executionCard?.toString() ?? '';
  const requestedMaterialIssue = route.query.materialIssue?.toString() ?? '';
  const card = production2ExecutionCards.find((row) => row.code === requestedCard);
  const release = production2ReleaseBatches.find(
    (row) => row.code === requestedRelease || row.executionCardCodes.includes(requestedCard),
  );
  const order = production2WorkOrders.find(
    (row) => row.code === requestedWorkOrder || row.code === release?.workOrderCode || row.code === card?.workOrderCode,
  );
  if (currentKind.value === 'productionReturns' && requestedMaterialIssue) {
    const issue = serverProductionIssues.value.find((item) => item.code === requestedMaterialIssue);
    if (issue) applyProductionReturnSource(issue, draft);
    return;
  }
  if (!order && !card && !release) return;

  draft.workOrder = order?.code || card?.workOrderCode || requestedWorkOrder;
  draft.releaseBatch = release?.code || requestedRelease;
  draft.executionCard = card?.code || requestedCard;

  if (currentKind.value === 'productionReceipts' && card) {
    applyProductionReceiptSource(card, draft, order);
    return;
  }

  if (currentKind.value === 'productionIssues' && order) {
    const releaseQty = release?.releasedQty || card?.planQty || order.planQty;
    draft.products = order.materialNeeds.map((material) => ({
      materialCode: material.materialCode,
      sourceLineId: `${release?.sourceLineId || order.code}-${material.materialCode}`,
      name: material.materialName,
      qty: `${Number((material.perUnitQty * releaseQty).toFixed(3))} ${material.unit}`,
      plannedQty: Number((material.perUnitQty * releaseQty).toFixed(3)),
      batch: '',
      uom: material.unit,
    }));
    draft.warehouse = '原料仓 A 区';
    draft.targetWarehouse = card?.line ? productionLineWarehouse(card.line) : '生产线边仓';
    draft.reason = '生产领料';
    draft.note = release
      ? `关联生产安排 ${release.code}；仓库按本次需求发料，确认后同步领料状态。`
      : `关联生产工单 ${order.code}；建议先选择生产安排，避免不同产线和班次共用领料数量。`;
  }
}

function applyProductionReturnSource(issue: Record<string, any>, target = documentDraft.value) {
  if (!target) return;
  target.materialIssue = issue.code;
  target.workOrder = issue.workOrder || '';
  target.releaseBatch = issue.releaseBatch || '';
  target.executionCard = issue.executionCard || '';
  target.warehouseCode = '';
  target.warehouse = issue.targetWarehouse || '生产线边仓';
  target.targetWarehouseCode = issue.warehouseCode || '';
  target.targetWarehouse = issue.warehouse || '原料仓';
  target.reason = '生产余料退回';
  target.products = (issue.products || []).map((product: WarehouseMoveProduct, index: number) => ({
    ...product,
    lineId: `RETURN-${index + 1}`,
    sourceLineId: product.sourceLineId || product.lineId || '',
    qty: '',
    plannedQty: 0,
    postedQty: 0,
  }));
}

function warehouseNumericQty(value: unknown) {
  const quantity = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(quantity) ? quantity : 0;
}

function productionReturnLineKey(product: WarehouseMoveProduct) {
  return [product.sourceLineId || '', product.materialCode || product.name || '', product.batch || ''].join('::');
}

function productionReturnAvailableQty(product: WarehouseMoveProduct) {
  const issueCode = documentDraft.value?.materialIssue?.toString() || '';
  const issue = serverProductionIssues.value.find((item) => item.code === issueCode);
  const key = productionReturnLineKey(product);
  const source = (issue?.products || []).find((line: WarehouseMoveProduct) => productionReturnLineKey(line) === key);
  if (!source) return 0;
  const issuedQty = Number(source.postedQty || source.plannedQty || warehouseNumericQty(source.qty));
  const reservedQty = serverProductionReturns.value
    .filter((record) => (
      record.code !== documentDraft.value?.code
      && record.materialIssue === issueCode
      && !['已作废', '已取消'].includes(record.status)
    ))
    .flatMap((record) => record.products || [])
    .filter((line: WarehouseMoveProduct) => productionReturnLineKey(line) === key)
    .reduce((sum: number, line: WarehouseMoveProduct) => sum + Number(line.plannedQty || warehouseNumericQty(line.qty)), 0);
  return Number(Math.max(0, issuedQty - reservedQty).toFixed(3));
}

function productionIssueReturnableLineCount(issue: Record<string, any>) {
  return (issue.products || []).filter((product: WarehouseMoveProduct) => {
    const key = productionReturnLineKey(product);
    const issuedQty = Number(product.postedQty || product.plannedQty || warehouseNumericQty(product.qty));
    const reservedQty = serverProductionReturns.value
      .filter((record) => (
        record.code !== documentDraft.value?.code
        && record.materialIssue === issue.code
        && !['已作废', '已取消'].includes(record.status)
      ))
      .flatMap((record) => record.products || [])
      .filter((line: WarehouseMoveProduct) => productionReturnLineKey(line) === key)
      .reduce((sum: number, line: WarehouseMoveProduct) => sum + Number(line.plannedQty || warehouseNumericQty(line.qty)), 0);
    return issuedQty - reservedQty > 0.0001;
  }).length;
}

const returnableProductionIssues = computed(() => (
  serverProductionIssues.value.filter((issue) => (
    issue.status === '已完成' && productionIssueReturnableLineCount(issue) > 0
  ))
));

function productionReceiptReservedQty(cardCode: string) {
  return serverProductionReceipts.value
    .filter((receipt) => (
      receipt.code !== documentDraft.value?.code
      && receipt.executionCard === cardCode
      && !['已完成', '已作废', '已取消'].includes(receipt.status)
    ))
    .reduce((sum, receipt) => sum + Number(receipt.quantity || receipt.products?.[0]?.plannedQty || 0), 0);
}

function productionReceiptAvailableQty(card: Production2ExecutionCard) {
  return Number(Math.max(
    0,
    Number(card.releasedInboundQty || 0)
      - Number(card.inboundQty || 0)
      - productionReceiptReservedQty(card.code),
  ).toFixed(3));
}

function pendingProductionReceiptCode(cardCode: string) {
  return serverProductionReceipts.value.find((receipt) => (
    receipt.code !== documentDraft.value?.code
    && receipt.executionCard === cardCode
    && !['已完成', '已作废', '已取消'].includes(receipt.status)
  ))?.code || '';
}

const receivableProductionCards = computed(() => (
  production2ExecutionCards.filter((card) => (
    card.node === '待入库'
    && card.status === '待仓库'
    && productionReceiptAvailableQty(card) > 0
    && !pendingProductionReceiptCode(card.code)
  ))
));
const selectedProductionReceiptCard = computed(() => (
  production2ExecutionCards.find((card) => card.code === documentDraft.value?.executionCard)
));
const selectedProductionReceiptAvailableQty = computed(() => (
  selectedProductionReceiptCard.value ? productionReceiptAvailableQty(selectedProductionReceiptCard.value) : 0
));

function applyProductionReceiptSource(
  card: Production2ExecutionCard,
  target = documentDraft.value,
  order = production2WorkOrders.find((item) => item.code === card.workOrderCode),
) {
  if (!target) return;
  const availableQty = productionReceiptAvailableQty(card);
  const unit = card.unit || order?.unit || '';
  target.workOrder = card.workOrderCode || order?.code || '';
  target.releaseBatch = card.releaseBatchCode || '';
  target.executionCard = card.code;
  target.moveType = '完工入库';
  target.direction = '入库';
  target.reason = '完工入库';
  target.warehouseCode = '';
  target.warehouse = card.line ? productionLineWarehouse(card.line) : '生产线边仓';
  target.targetWarehouseCode = target.targetWarehouseCode || 'WH-FG';
  target.targetWarehouse = target.targetWarehouse || '成品仓';
  target.targetLocation = '';
  target.quantity = availableQty;
  target.unit = unit;
  target.products = [{
    lineId: `${card.code}-FG`,
    sourceLineId: `${card.code}-FG`,
    materialCode: card.productCode || order?.productCode || '',
    name: card.productName || order?.productName || card.productCode || '',
    qty: availableQty > 0 ? `${availableQty} ${unit}`.trim() : '',
    plannedQty: availableQty,
    postedQty: 0,
    batch: card.code,
    uom: unit,
  }];
}

async function selectProductionReceiptSource() {
  const code = documentDraft.value?.executionCard?.toString() || '';
  if (!code) {
    documentDraft.value = createEmptyDraft('productionReceipts');
    return;
  }
  try {
    const response = await getProductionExecutionCard(code);
    upsertProductionExecutionCard(response.record);
    upsertProductionRelease(response.release || undefined);
    if (response.workOrder?.code) {
      const persisted = response.workOrder as unknown as (typeof production2WorkOrders)[number];
      const orderIndex = production2WorkOrders.findIndex((item) => item.code === persisted.code);
      if (orderIndex >= 0) production2WorkOrders.splice(orderIndex, 1, persisted);
      else production2WorkOrders.unshift(persisted);
    }
    applyProductionReceiptSource(response.record, documentDraft.value, response.workOrder as any);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '生产批次加载失败', 'error');
  }
}

function selectProductionReturnSource() {
  const code = documentDraft.value?.materialIssue?.toString() || '';
  const issue = serverProductionIssues.value.find((item) => item.code === code);
  if (issue) {
    applyProductionReturnSource(issue);
    return;
  }
  if (documentDraft.value) Object.assign(documentDraft.value, createEmptyDraft('productionReturns'));
}

const productionMoveSourceRelease = computed(() => {
  const code = documentDraft.value?.releaseBatch?.toString() || '';
  return code ? production2ReleaseBatches.find((batch) => batch.code === code) : undefined;
});

const existingProductionIssue = computed(() => {
  if (currentKind.value !== 'productionIssues' || !isNew.value) return undefined;
  const releaseBatch = documentDraft.value?.releaseBatch?.toString() || '';
  return releaseBatch
    ? serverProductionIssues.value.find((issue) => issue.releaseBatch === releaseBatch)
    : undefined;
});

const productionIssueSourceMissing = computed(() => (
  currentKind.value === 'productionIssues'
  && isNew.value
  && !documentDraft.value?.releaseBatch
));

const productionMoveBlockReason = computed(() => {
  if (!isProductionMove.value || !documentDraft.value) return '';
  if (isFinal.value) return '';
  const release = productionMoveSourceRelease.value;
  if (!release) return '';
  if (currentKind.value === 'productionIssues' && release.releaseStatus !== '已释放') {
    return `生产安排 ${release.code} 尚未确认，不能提交生产领料。`;
  }
  if (currentKind.value === 'productionIssues' && existingProductionIssue.value) {
    return `生产安排 ${release.code} 已有领料单 ${existingProductionIssue.value.code}，请打开原单继续处理，不能重复建单。`;
  }
  if (currentKind.value === 'productionIssues' && isNew.value && release.materialStatus === '已领料') {
    return `生产安排 ${release.code} 已完成领料，请查看既有领料单，不能重复建单。`;
  }
  if (currentKind.value === 'productionReturns') {
    const issueCode = documentDraft.value.materialIssue?.toString() || '';
    if (!issueCode) return '';
    const issue = serverProductionIssues.value.find((item) => item.code === issueCode);
    if (!issue) return `原领料单 ${issueCode} 尚未加载，不能提交生产退料。`;
    if (issue.status !== '已完成') return `原领料单 ${issue.code} 尚未完成出库，不能办理退料。`;
  }
  if (currentKind.value === 'productionReceipts') {
    const cardCode = documentDraft.value.executionCard?.toString() || '';
    if (!cardCode) return '';
    const card = production2ExecutionCards.find((item) => item.code === cardCode);
    if (!card) return `生产批次 ${cardCode || '-'} 尚未加载，不能提交完工入库。`;
    if (card.node !== '待入库' || card.status !== '待仓库') {
      return `生产批次 ${card.code} 当前为${card.node}/${card.status}，尚未通过入库抽检。`;
    }
    const availableQty = productionReceiptAvailableQty(card);
    if (availableQty <= 0) return `生产批次 ${card.code} 当前没有已放行待入库数量。`;
    const pendingReceipt = serverProductionReceipts.value.find(
      (receipt) => receipt.executionCard === card.code && !['已完成', '已作废', '已取消'].includes(receipt.status),
    );
    if (isNew.value && pendingReceipt) {
      return `生产批次 ${card.code} 已有待处理入库单 ${pendingReceipt.code}，请继续处理原单。`;
    }
  }
  return '';
});

async function loadDocument() {
  loadMessage.value = '';
  const shouldLoadInventoryOptions = currentKind.value === 'productionReceipts'
    || (!isDetail.value && (isOtherMove.value || isTransfer.value || isStocktake.value));
  const shouldLoadWarehouseReferences = currentKind.value === 'productionReceipts'
    || (!isDetail.value && (isOtherMove.value || isTransfer.value));
  const shouldLoadAsync = isProductionMove.value
    || (!isNew.value && !isProductionMove.value)
    || shouldLoadInventoryOptions
    || shouldLoadWarehouseReferences;
  isLoading.value = shouldLoadAsync;
  if (!isNew.value) {
    documentDraft.value = null;
    flowRecords.value = [];
  }

  try {
    const [inventoryRows, warehouseReferences] = await Promise.all([
      shouldLoadInventoryOptions ? listWarehouseInventory() : Promise.resolve([]),
      shouldLoadWarehouseReferences
        ? listReference<WarehouseReference>('warehouses', { activeOnly: true, limit: 100 })
        : Promise.resolve({ items: [], total: 0 }),
    ]);
    warehouseInventoryRows.value = inventoryRows;
    warehouseReferenceRows.value = warehouseReferences.items.map((option) => option.raw);
    if (isNew.value) {
      documentDraft.value = createEmptyDraft(currentKind.value);
      flowRecords.value = [];
      if (currentKind.value === 'productionIssues') {
        serverProductionIssues.value = await listProductionMaterialIssues();
        const requestedRelease = route.query.releaseBatch?.toString() || '';
        if (requestedRelease) {
          const response = await getProductionMaterialIssueSource(requestedRelease);
          documentDraft.value = {
            ...toDraft(response.issue as Record<string, any>),
            owner: session.user.name || '待分配',
            executionCard: route.query.executionCard?.toString() || response.issue.executionCard || '',
          };
          upsertProductionRelease(response.release);
          if (response.workOrder?.code) {
            const persisted = response.workOrder as unknown as (typeof production2WorkOrders)[number];
            const orderIndex = production2WorkOrders.findIndex((item) => item.code === persisted.code);
            if (orderIndex >= 0) production2WorkOrders.splice(orderIndex, 1, persisted);
            else production2WorkOrders.unshift(persisted);
          }
          return;
        }
      }
      if (currentKind.value === 'productionReturns') {
        [serverProductionIssues.value, serverProductionReturns.value] = await Promise.all([
          listProductionMaterialIssues(),
          listProductionReturns(),
        ]);
      }
      if (currentKind.value === 'productionReceipts') {
        const [cards, receipts] = await Promise.all([
          listProductionExecutionCards(),
          listProductionReceipts(),
        ]);
        serverProductionReceipts.value = receipts;
        cards.forEach((card) => upsertProductionExecutionCard(card));
        const requestedCard = route.query.executionCard?.toString() || '';
        if (requestedCard) {
          const response = await getProductionExecutionCard(requestedCard);
          upsertProductionExecutionCard(response.record);
          upsertProductionRelease(response.release || undefined);
          if (response.workOrder?.code) {
            const persisted = response.workOrder as unknown as (typeof production2WorkOrders)[number];
            const orderIndex = production2WorkOrders.findIndex((item) => item.code === persisted.code);
            if (orderIndex >= 0) production2WorkOrders.splice(orderIndex, 1, persisted);
            else production2WorkOrders.unshift(persisted);
          }
        }
      }
      applyProductionContextFromQuery(documentDraft.value);
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    if (isProductionMove.value) {
      if (currentKind.value === 'productionIssues') {
        const response = await getProductionMaterialIssue(code);
        applyProductionIssueResponse(response);
        return;
      }

      if (currentKind.value === 'productionReceipts') {
        const response = await getProductionReceipt(code);
        applyProductionReceiptResponse(response);
        return;
      }
      const response = await getProductionReturn(code);
      applyProductionReturnResponse(response);
    } else if (currentKind.value === 'otherMoves') {
      const response = await getWarehouseOtherMove(code);
      documentDraft.value = toDraft(response.move);
      flowRecords.value = response.flowRecords;
    } else if (currentKind.value === 'transfers') {
      const response = await getWarehouseTransfer(code);
      documentDraft.value = toDraft(response.transfer);
      flowRecords.value = response.flowRecords;
    } else {
      const response = await getWarehouseStocktake(code);
      documentDraft.value = toDraft(response.stocktake);
      flowRecords.value = response.flowRecords;
    }
  } catch (error) {
    documentDraft.value = null;
    flowRecords.value = [];
    loadMessage.value = error instanceof Error ? error.message : '仓库单据加载失败';
  } finally {
    isLoading.value = false;
  }
}

function handleProductSelect(index: number, option: ReferenceOption) {
  if (!documentDraft.value) return;
  if (!option.code && !option.name) {
    documentDraft.value.products[index] = createEmptyLine();
    return;
  }
  const material = option.raw as MaterialReference;
  const previous = documentDraft.value.products[index];
  documentDraft.value.products[index] = {
    ...previous,
    materialCode: material.code,
    name: material.name,
    model: material.model || '',
    spec: material.spec || '',
    qty: previous.qty || `1 ${material.uom || '件'}`,
    batch: previous.materialCode === material.code ? previous.batch : '',
    batchControl: material.batchControl || '不追踪批次',
    batchTracked: typeof material.batchTracked === 'boolean'
      ? material.batchTracked
      : material.batchControl === '批次管理',
    uom: material.uom || '',
    imageLabel: material.imageLabel || '',
    imageTone: material.imageTone || '',
  };
}

function handleStocktakeOwnerSelect(option: ReferenceOption) {
  if (!documentDraft.value || !isStocktake.value) return;
  if (!option.code && !option.name) {
    documentDraft.value.ownerEmployeeCode = '';
    documentDraft.value.owner = '';
    return;
  }
  const employee = option.raw as { code?: string; name?: string };
  documentDraft.value.ownerEmployeeCode = employee.code || option.code || '';
  documentDraft.value.owner = employee.name || option.name || employee.code || option.code;
}

function handleStocktakeScopeModeChange() {
  if (!documentDraft.value || !isStocktake.value) return;
  if (documentDraft.value.scopeMode === '全仓盘点') {
    documentDraft.value.scope = '全仓盘点';
    documentDraft.value.scopeLabel = '全部合格库存';
    return;
  }
  documentDraft.value.scope = '';
  documentDraft.value.scopeLabel = '';
}

function handleStocktakeScopeSelect() {
  if (!documentDraft.value) return;
  const option = stocktakeScopeOptions.value.find((item) => item.value === documentDraft.value?.scope);
  documentDraft.value.scopeLabel = option?.scopeLabel || documentDraft.value.scope || '';
}

function handleWarehouseSelect(field: 'warehouse' | 'targetWarehouse' | 'fromWarehouse' | 'toWarehouse', option: ReferenceOption) {
  if (!documentDraft.value) return;
  if (!option.code && !option.name) {
    if (field === 'fromWarehouse') {
      documentDraft.value.fromWarehouseCode = '';
      documentDraft.value.fromWarehouse = '';
      if (isTransfer.value) documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
    } else if (field === 'toWarehouse') {
      documentDraft.value.toWarehouseCode = '';
      documentDraft.value.toWarehouse = '';
      documentDraft.value.toLocation = '';
      selectedTransferLocationOptions.value = [];
    } else if (field === 'targetWarehouse') {
      documentDraft.value.targetWarehouseCode = '';
      documentDraft.value.targetWarehouse = '';
      documentDraft.value.targetLocation = '';
      selectedProductionReceiptLocationOptions.value = [];
    } else {
      documentDraft.value.warehouseCode = '';
      documentDraft.value.warehouse = '';
      if (isStocktake.value) {
        documentDraft.value.scope = '';
        documentDraft.value.scopeLabel = '';
      }
      if (isOtherMove.value) {
        documentDraft.value.location = '';
        selectedOtherMoveLocationOptions.value = [];
        documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
      }
    }
    return;
  }
  const warehouse = option.raw as WarehouseReference;

  if (field === 'fromWarehouse') {
    documentDraft.value.fromWarehouseCode = warehouse.code;
    documentDraft.value.fromWarehouse = warehouse.name;
    if (isTransfer.value) documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
  } else if (field === 'toWarehouse') {
    documentDraft.value.toWarehouseCode = warehouse.code;
    documentDraft.value.toWarehouse = warehouse.name;
    selectedTransferLocationOptions.value = (Array.isArray(warehouse.locationOptions) ? warehouse.locationOptions : [])
      .filter((location) => !isPlaceholderWarehouseLocation(location));
    documentDraft.value.toLocation = '';
  } else if (field === 'targetWarehouse') {
    documentDraft.value.targetWarehouseCode = warehouse.code;
    documentDraft.value.targetWarehouse = warehouse.name;
    selectedProductionReceiptLocationOptions.value = (Array.isArray(warehouse.locationOptions)
      ? warehouse.locationOptions
      : [])
      .filter((location) => !isPlaceholderWarehouseLocation(location));
    documentDraft.value.targetLocation = selectedProductionReceiptLocationOptions.value.length === 1
      ? selectedProductionReceiptLocationOptions.value[0]
      : '';
  } else {
    documentDraft.value.warehouseCode = warehouse.code;
    documentDraft.value.warehouse = warehouse.name;
    if (isOtherMove.value) {
      selectedOtherMoveLocationOptions.value = (Array.isArray(warehouse.locationOptions)
        ? warehouse.locationOptions
        : [])
        .filter((location) => !isPlaceholderWarehouseLocation(location));
      documentDraft.value.location = selectedOtherMoveLocationOptions.value.length === 1
        ? selectedOtherMoveLocationOptions.value[0]
        : '';
      documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
    }
    if (isStocktake.value && documentDraft.value.scopeMode !== '全仓盘点') {
      documentDraft.value.scope = '';
      documentDraft.value.scopeLabel = '';
    }
  }
}

function handleOtherMoveLocationChange() {
  if (!documentDraft.value || !isOtherMove.value) return;
  if (documentDraft.value.direction === '出库') {
    documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
  }
}

function handleOtherMoveDirectionChange() {
  if (!documentDraft.value || !isOtherMove.value) return;
  documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
}

function handleOtherMoveTypeChange() {
  if (!documentDraft.value || !isOtherMove.value) return;
  if (documentDraft.value.moveType === '库存调整') documentDraft.value.targetWarehouse = '';
}

function addLine() {
  documentDraft.value?.products.push(createEmptyLine());
}

function removeLine(index: number) {
  if (!documentDraft.value || documentDraft.value.products.length <= 1) return;
  documentDraft.value.products.splice(index, 1);
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (isReadOnly.value) {
    input.value = '';
    showToast(warehouseAttachmentTitle.value, 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!files.length || !documentDraft.value) return;
  documentDraft.value.attachments = [...(documentDraft.value.attachments ?? []), ...files];
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，保存后随${config.value.title}保留。`);
}

function missingSubmitSummary(labels: string[]) {
  return `请先补齐：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '等' : ''}`;
}

function warehouseMissingSubmitFields() {
  const draft = documentDraft.value;
  if (!draft) return ['单据信息'];

  const missing: string[] = [];
  if (isStocktake.value) {
    if (!draft.date) missing.push('盘点日期');
    if (!draft.ownerEmployeeCode || !draft.owner) missing.push('负责人');
    if (!draft.warehouse) missing.push('盘点仓库');
    if (!draft.scopeMode) missing.push('盘点方式');
    if (draft.scopeMode !== '全仓盘点' && !draft.scope) missing.push(stocktakeScopeInputLabel.value);
    return missing;
  }

  if (isTransfer.value) {
    if (!draft.fromWarehouse) missing.push('调出仓库');
    if (!draft.toWarehouse) missing.push('调入仓库');
    if (!draft.toLocation || !transferTargetLocationOptions.value.includes(String(draft.toLocation))) {
      missing.push('调入库位');
    }
    if (draft.fromWarehouseCode && draft.fromWarehouseCode === draft.toWarehouseCode) missing.push('调入仓库');
    if (!draft.reason) missing.push('调拨原因');
  } else {
    if (isProductionMove.value && !draft.workOrder) missing.push('来源生产工单');
    if (currentKind.value === 'productionIssues' && !draft.releaseBatch) missing.push('生产安排');
    if (currentKind.value === 'productionReturns' && !draft.materialIssue) missing.push('原领料单');
    if (currentKind.value === 'productionReceipts' && !draft.executionCard) missing.push('生产批次');
    if (currentKind.value === 'productionIssues') return Array.from(new Set(missing));
    if (currentKind.value === 'productionReceipts') {
      if (!draft.targetWarehouseCode || !draft.targetWarehouse) missing.push('成品入库仓');
      if (
        !draft.targetLocation
        || !productionReceiptTargetLocationOptions.value.includes(String(draft.targetLocation))
      ) missing.push('成品入库库位');
      if (!draft.products.some((product: WarehouseMoveProduct) => product.name && product.qty)) missing.push('明细');
      return Array.from(new Set(missing));
    }
    if (!draft.moveType) missing.push('业务类型');
    if (!draft.direction) missing.push('库存方向');
    if (!draft.warehouse) missing.push('业务仓库');
    if (
      isOtherMove.value
      && (!draft.location || !otherMoveLocationOptions.value.includes(String(draft.location)))
    ) missing.push(operationLocationLabel.value);
    if (isProductionMove.value && !draft.targetWarehouse) missing.push('生产线边仓或入库目标仓');
    if (isOtherMove.value && otherMoveCounterpartyRequired.value && !draft.targetWarehouse) missing.push('业务对象');
    if (!draft.reason) missing.push(isOtherMove.value ? '其他出入库原因' : '业务原因');
    if (
      isOtherMove.value
      && draft.direction === '出库'
      && draft.products.some((product: WarehouseMoveProduct) => product.batchTracked && !String(product.batch || '').trim())
    ) missing.push('出库批次');
  }

  if (!draft.products.some((product: WarehouseMoveProduct) => product.name && product.qty)) {
    missing.push('明细');
  }
  return Array.from(new Set(missing));
}

function warehouseRequiredLabelClass(label: string) {
  return {
    'required-label': true,
    'has-field-error': warehouseValidationAttempted.value && warehouseMissingSubmitFields().includes(label),
  };
}

function warehouseRequiredFieldClass(label: string) {
  return {
    'has-field-error': Boolean(warehouseRequiredLabelClass(label)['has-field-error']),
  };
}

function warehouseLineProductClass(product: WarehouseMoveProduct) {
  return {
    'has-line-field-error': warehouseValidationAttempted.value && !productIdentity(product, '').trim(),
  };
}

function warehouseLineQtyClass(product: WarehouseMoveProduct) {
  return {
    'has-line-field-error': warehouseValidationAttempted.value && !String(product.qty ?? '').trim(),
  };
}

function warehouseLineBatchClass(product: WarehouseMoveProduct) {
  return {
    'has-line-field-error': warehouseValidationAttempted.value
      && isOtherMove.value
      && documentDraft.value?.direction === '出库'
      && Boolean(product.batchTracked)
      && !String(product.batch || '').trim(),
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

function showWarehouseValidationError(message: string) {
  showToast(message, 'error');
  scrollToFirstValidationError();
  return false;
}

function validateDocument() {
  const draft = documentDraft.value;
  if (!draft) return false;

  warehouseValidationAttempted.value = true;
  const missing = warehouseMissingSubmitFields();
  if (missing.length) return showWarehouseValidationError(missingSubmitSummary(missing));
  warehouseValidationAttempted.value = false;
  return true;
}

async function persistDocument() {
  if (isReadOnly.value) {
    showToast(saveDocumentReadonlyReason.value || warehouseReadonlyReason.value, 'error');
    return null;
  }
  if (!validateDocument() || !documentDraft.value) return null;

  isSaving.value = true;
  try {
    if (currentKind.value === 'productionIssues') {
      const response = await saveProductionMaterialIssue(documentDraft.value as any);
      const issue = applyProductionIssueResponse(response);
      resetUnsavedChanges();
      showToast('生产领料单已保存；RB 物料分配已由服务器重新核对');
      return issue;
    }

    if (currentKind.value === 'productionReceipts') {
      const response = await saveProductionReceipt(documentDraft.value as any);
      const receipt = applyProductionReceiptResponse(response);
      resetUnsavedChanges();
      showToast('完工入库单已保存；可入库数量已由服务器重新核对');
      return receipt;
    }

    if (currentKind.value === 'productionReturns') {
      const response = await saveProductionReturn(documentDraft.value as any);
      const record = applyProductionReturnResponse(response);
      resetUnsavedChanges();
      showToast('生产退料单已保存；可退数量已按原领料单重新核对');
      return record;
    }

    if (isProductionMove.value) {
      throw new Error(`${config.value.title}尚未接入可靠的后端保存流程`);
    }

    if (currentKind.value === 'otherMoves') {
      const response = await saveWarehouseOtherMove(documentDraft.value as any);
      documentDraft.value = toDraft(response.move);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast('其他出入库单已保存');
      return response.move;
    }

    if (currentKind.value === 'transfers') {
      const response = await saveWarehouseTransfer(documentDraft.value as any);
      documentDraft.value = toDraft(response.transfer);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast('库存调拨单已保存');
      return response.transfer;
    }

    const response = await saveWarehouseStocktake(documentDraft.value as any);
    documentDraft.value = toDraft(response.stocktake);
    flowRecords.value = response.flowRecords;
    resetUnsavedChanges();
    showToast('库存盘点单已保存');
    return response.stocktake;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '单据保存失败', 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveDraft() {
  await runWarehouseAction('save', async () => {
    const saved = await persistDocument();
    if (!saved) return;
    if (isNew.value) {
      const savedCode = String((saved as Record<string, unknown>).code || '');
      if (!savedCode) return;
      await router.replace(`/warehouse/${config.value.routeSegment}/${encodeURIComponent(savedCode)}/edit`);
    }
  });
}

type WarehouseEditorPrimaryAction =
  | { kind: 'submit-production-issue'; label: string; message: string }
  | { kind: 'post-production-issue'; label: string; message: string }
  | { kind: 'submit-production-return'; label: string; message: string }
  | { kind: 'post-production-return'; label: string; message: string }
  | { kind: 'submit-production-receipt'; label: string; message: string }
  | { kind: 'post-production-receipt'; label: string; message: string }
  | { kind: 'submit-other'; label: string; message: string }
  | { kind: 'post-other'; label: string; message: string }
  | { kind: 'submit-transfer'; label: string; message: string }
  | { kind: 'post-transfer'; label: string; message: string }
  | { kind: 'start-stocktake'; label: string; message: string }
  | { kind: 'submit-stocktake'; label: string; message: string }
  | { kind: 'complete-stocktake'; label: string; message: string }
  | { kind: 'status'; label: string; next: string; remark: string; message: string };

function primaryActionForStatus(kind: EditorKind, status: string): WarehouseEditorPrimaryAction | undefined {
  if (kind === 'productionIssues') {
    if (status === '草稿') {
      return {
        kind: 'submit-production-issue',
        label: '提交领料',
        message: '生产领料已提交，等待仓库确认出库',
      };
    }
    if (status === '待出库') {
      return {
        kind: 'post-production-issue',
        label: '确认出库',
        message: '生产领料出库已确认，库存和生产批次已更新',
      };
    }
    return undefined;
  }

  if (kind === 'productionReceipts') {
    if (status === '草稿') {
      return {
        kind: 'submit-production-receipt',
        label: '提交入库',
        message: '完工入库已提交，等待仓库确认入库',
      };
    }
    if (status === '待入库') {
      return {
        kind: 'post-production-receipt',
        label: '确认入库',
        message: '完工入库已确认，成品库存和生产进度已更新',
      };
    }
    return undefined;
  }

  if (kind === 'productionReturns') {
    if (status === '草稿') {
      return {
        kind: 'submit-production-return',
        label: '提交退料',
        message: '生产退料已提交，等待仓库确认入库',
      };
    }
    if (status === '待入库') {
      return {
        kind: 'post-production-return',
        label: '退料入库',
        message: '生产余料已退回原仓，库存和流水已更新',
      };
    }
    return undefined;
  }

  if (kind === 'otherMoves') {
    if (status === '草稿') {
      return {
        kind: 'status',
        label: '提交审核',
        next: '待审核',
        remark: '其他出入库已提交审核，等待确认用途和数量。',
        message: '其他出入库已提交审核',
      };
    }
    if (status === '待审核') {
      return {
        kind: 'status',
        label: '审核通过',
        next: '待过账',
        remark: '其他出入库已审核通过，等待确认库存变动。',
        message: '其他出入库已审核通过，等待确认库存变动',
      };
    }
    if (status === '待过账') return { kind: 'post-other', label: '确认库存变动', message: '库存变动已确认，库存和流水已更新' };
    return undefined;
  }

  if (kind === 'transfers') {
    if (status === '草稿') return { kind: 'submit-transfer', label: '提交调拨', message: '库存调拨已提交，等待调出仓确认出库' };
    if (status === '待出库') {
      return {
        kind: 'status',
        label: '确认调出',
        next: '调拨中',
        remark: '调出仓已确认调出，物料进入在途，等待调入仓确认实收。',
        message: '调出仓已确认调出，等待调入仓确认实收',
      };
    }
    if (status === '调拨中' || status === '待入库') {
      return { kind: 'post-transfer', label: '确认调入', message: '库存调拨已完成，库存和流水已更新' };
    }
    return undefined;
  }

  if (status === '待盘点') return { kind: 'start-stocktake', label: '开始盘点', message: '库存盘点已开始' };
  if (status === '盘点中') {
    return {
      kind: 'submit-stocktake',
      label: '提交复核',
      message: '盘点结果已提交，等待复核',
    };
  }
  if (status === '待复核') return { kind: 'complete-stocktake', label: '完成盘点', message: '库存盘点已完成' };
  return undefined;
}

async function confirmWarehouseStockAction(action: WarehouseEditorPrimaryAction) {
  const draft = documentDraft.value;
  if (!draft) return true;

  if (isTransfer.value) {
    const destination = [draft.toWarehouse, draft.toLocation].filter(Boolean).join(' / ') || '调入仓';
    if (action.kind === 'status' && action.next === '调拨中') {
      const quantity = transferQuantitySummary(draft.products || []) || '本单明细数量';
      return requestActionConfirmation({
        title: '确认调出库存？',
        message: `确认后将立即从“${draft.fromWarehouse || '调出仓'}”扣减 ${quantity}，并在“${destination}”形成同量在途库存。请先核对实物、数量和批次。`,
        confirmLabel: '确认调出',
        tone: 'warning',
      });
    }

    if (action.kind === 'post-transfer') {
      const transitLines = Array.isArray(draft.transitLines) ? draft.transitLines : [];
      const quantity = transferQuantitySummary(transitLines.length ? transitLines : draft.products || []) || '本单在途数量';
      return requestActionConfirmation({
        title: '确认调入库存？',
        message: `确认后将把“${destination}”的 ${quantity} 在途库存转为正式可用库存。请先核对实际到货、数量和批次。`,
        confirmLabel: '确认调入',
        tone: 'warning',
      });
    }
  }

  if (isStocktake.value && action.kind === 'complete-stocktake') {
    const scope = [draft.warehouse, draft.scopeLabel || draft.scope].filter(Boolean).join(' / ') || '本次盘点范围';
    const difference = stocktakeDifferenceQuantitySummary(draft.lines || []);
    return requestActionConfirmation({
      title: '确认完成盘点并更新库存？',
      message: `确认后将按实盘结果更新“${scope}”的合格库存（${difference}），写入盘盈盘亏流水并解除冻结。完成后如需纠错只能生成独立冲销记录。`,
      confirmLabel: '确认完成盘点',
      tone: 'warning',
    });
  }

  if (isStocktake.value && action.kind === 'start-stocktake') {
    const scope = [draft.warehouse, draft.scopeLabel || draft.scope].filter(Boolean).join(' / ') || '本次盘点范围';
    const previewRows = stocktakePreviewRows.value;
    const availableQuantity = stocktakeAvailableQuantitySummary(previewRows) || '0';
    return requestActionConfirmation({
      title: '确认开始盘点并冻结范围？',
      message: `确认后将为“${scope}”形成 ${previewRows.length} 条账面快照，冻结当前可用库存 ${availableQuantity}，并暂停该范围内的入库、出库、调拨和冲销，直到完成或取消盘点。`,
      confirmLabel: '确认开始盘点',
      tone: 'warning',
    });
  }

  return true;
}

async function runPrimaryAction() {
  if (!canWriteWarehouse.value || !canPostWarehouse.value) {
    showToast(primaryActionTitle.value, 'error');
    return;
  }
  if (productionMoveBlockReason.value) {
    showToast(productionMoveBlockReason.value, 'error');
    return;
  }
  if (warehousePrimaryActionBlockedReason.value) {
    showToast(warehousePrimaryActionBlockedReason.value, 'error');
    return;
  }
  if (!isDetail.value && !validateDocument()) return;
  const currentAction = warehouseEditorPrimaryAction.value;
  if (currentAction && !(await confirmWarehouseStockAction(currentAction))) return;
  await runWarehouseAction('primary', async () => {
    const saved = (isDetail.value ? documentDraft.value : await persistDocument()) as Record<string, any> | null;
    if (!saved) return;
    const action = primaryActionForStatus(currentKind.value, saved.status);
    if (!action) {
      showToast('当前状态不可继续流转', 'error');
      return;
    }

    isSaving.value = true;
    try {
      let nextRecord: Record<string, any>;
      let nextFlowRecords: FlowRecord[];
      let successMessage = action.message;

      if (action.kind === 'submit-production-issue') {
        const response = await submitProductionMaterialIssue(saved.code);
        nextRecord = applyProductionIssueResponse(response);
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'post-production-issue') {
        let idempotencyKey = productionIssuePostKeys.get(saved.code);
        if (!idempotencyKey) {
          idempotencyKey = `production-issue-post-${saved.code}-${crypto.randomUUID()}`;
          productionIssuePostKeys.set(saved.code, idempotencyKey);
        }
        const response = await postProductionMaterialIssue(saved.code, idempotencyKey);
        nextRecord = applyProductionIssueResponse(response);
        nextFlowRecords = response.flowRecords;
        successMessage = response.executionCard?.code
          ? `领料出库已确认，已生成生产批次 ${String(response.executionCard.code)}`
          : action.message;
      } else if (action.kind === 'submit-production-return') {
        const response = await submitProductionReturn(saved.code);
        nextRecord = applyProductionReturnResponse(response);
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'post-production-return') {
        let idempotencyKey = productionReturnPostKeys.get(saved.code);
        if (!idempotencyKey) {
          idempotencyKey = `production-return-post-${saved.code}-${crypto.randomUUID()}`;
          productionReturnPostKeys.set(saved.code, idempotencyKey);
        }
        const response = await postProductionReturn(saved.code, idempotencyKey);
        nextRecord = applyProductionReturnResponse(response);
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'submit-production-receipt') {
        const response = await submitProductionReceipt(saved.code);
        nextRecord = applyProductionReceiptResponse(response);
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'post-production-receipt') {
        let idempotencyKey = productionReceiptPostKeys.get(saved.code);
        if (!idempotencyKey) {
          idempotencyKey = `production-receipt-post-${saved.code}-${crypto.randomUUID()}`;
          productionReceiptPostKeys.set(saved.code, idempotencyKey);
        }
        const response = await postProductionReceipt(saved.code, idempotencyKey);
        nextRecord = applyProductionReceiptResponse({
          receipt: response.receipt,
          executionCard: response.card,
          flowRecords: response.flowRecords,
        });
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'submit-other') {
        const response = await submitWarehouseOtherMove(saved.code);
        nextRecord = response.move;
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'post-other') {
        const response = await postWarehouseOtherMove(saved.code);
        nextRecord = response.move;
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'submit-transfer') {
        const response = await submitWarehouseTransfer(saved.code);
        nextRecord = response.transfer;
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'post-transfer') {
        const response = await postWarehouseTransfer(saved.code);
        nextRecord = response.transfer;
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'start-stocktake') {
        const response = await startWarehouseStocktake(saved.code);
        nextRecord = response.stocktake;
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'submit-stocktake') {
        const response = await submitWarehouseStocktake(saved.code);
        nextRecord = response.stocktake;
        nextFlowRecords = response.flowRecords;
      } else if (action.kind === 'complete-stocktake') {
        const response = await completeWarehouseStocktake(saved.code);
        nextRecord = response.stocktake;
        nextFlowRecords = response.flowRecords;
      } else {
        const runtimeType = warehouseRuntimeTypes[currentKind.value];
        if (!runtimeType) throw new Error('当前单据暂不支持后端状态处理');
        const response = await updateWarehouseStatus(runtimeType, saved.code, {
          status: action.next,
          action: action.label,
          remark: action.remark,
        });
        nextRecord = response.record;
        nextFlowRecords = response.flowRecords;
      }

      documentDraft.value = toDraft(nextRecord);
      flowRecords.value = nextFlowRecords;
      resetUnsavedChanges();
      showToast(successMessage);
      await router.replace(`/warehouse/${config.value.routeSegment}/${encodeURIComponent(nextRecord.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '单据处理失败', 'error');
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

watch(() => route.fullPath, loadDocument, { immediate: true });

watch(
  [isEdit, () => documentDraft.value?.status, canEditCurrentStatus],
  ([editing, status, editable]) => {
    const code = route.params.code?.toString() || '';
    if (!editing || !status || editable || !code) return;
    void router.replace(`/warehouse/${config.value.routeSegment}/${encodeURIComponent(code)}`);
  },
);

watch(
  () => (isProductionMove.value ? documentDraft.value?.moveType : ''),
  (moveType) => {
    if (!isProductionMove.value || !documentDraft.value || !moveType || isReadOnly.value) return;
    documentDraft.value.direction = productionDirectionForMoveType(moveType);
    documentDraft.value.targetWarehouse = productionTargetForMoveType(moveType, documentDraft.value.targetWarehouse);
    documentDraft.value.reason = documentDraft.value.reason || moveType;
  },
);

watch(
  () => (isOtherMove.value ? documentDraft.value?.moveType : ''),
  (moveType) => {
    if (!isOtherMove.value || !documentDraft.value || !moveType || isReadOnly.value) return;
    const previousDirection = documentDraft.value.direction;
    if (moveType === '借用归还') {
      documentDraft.value.direction = '入库';
    } else if (moveType !== '库存调整') {
      documentDraft.value.direction = '出库';
    } else if (!['入库', '出库'].includes(documentDraft.value.direction)) {
      documentDraft.value.direction = '出库';
    }
    if (previousDirection !== documentDraft.value.direction) {
      documentDraft.value.products.forEach((product: WarehouseMoveProduct) => { product.batch = ''; });
    }
  },
);

watch(
  productionReceiptTargetLocationOptions,
  (locations) => {
    if (
      currentKind.value !== 'productionReceipts'
      || !documentDraft.value
      || isReadOnly.value
      || !documentDraft.value.targetWarehouse
    ) return;
    const current = String(documentDraft.value.targetLocation || '').trim();
    if (current && locations.includes(current)) return;
    documentDraft.value.targetLocation = locations.length === 1 ? locations[0] : '';
  },
);

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="documentDraft" class="quote-editor warehouse-document-editor" :class="{ 'is-detail-view': isDetail, 'is-full-width-editor': !isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="`/warehouse/${config.routeSegment}`" :aria-label="`返回${config.title}列表`" :title="`返回${config.title}列表`">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? documentDraft.code : pageHeading }}</strong>
        </template>

        <template #actions>
          <template v-if="isDetail">
            <PinReferenceButton
              v-if="referencePath"
              class="topbar-optional-action"
              :title="referenceTitle"
              :subtitle="referenceSubtitle"
              :path="referencePath"
            />
            <button class="secondary-action topbar-optional-action" type="button" :title="`查看${config.title}流转日志`" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="warehouseMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="warehouseMoreActionsOpen = false"
            >
              <button
                ref="warehouseMoreActionsTrigger"
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="warehouseMoreActionsOpen"
                @click="warehouseMoreActionsOpen = !warehouseMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="warehouseMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in warehouseMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :title="action.description"
                  @click="handleWarehouseMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="!isFinal && warehouseEditorPrimaryAction"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isWarehouseActionPending || !canWriteWarehouse || !canPostWarehouse || Boolean(productionMoveBlockReason) || Boolean(warehousePrimaryActionBlockedReason)"
              :aria-busy="activeWarehouseAction === 'primary'"
              :title="primaryActionTitle"
              @click="runPrimaryAction"
            >
              <Send :size="15" />
              {{ activeWarehouseAction === 'primary' ? '处理中' : primaryActionLabel }}
            </button>
          </template>

          <template v-else-if="!isReadOnly && !productionIssueSourceMissing">
            <button class="secondary-action async-document-action" type="button" :disabled="isSaving || isWarehouseActionPending || isReadOnly" :aria-busy="activeWarehouseAction === 'save'" :title="saveDocumentActionTitle" @click="saveDraft">
              <Save :size="15" />
              {{ activeWarehouseAction === 'save' ? '保存中' : saveDocumentLabel }}
            </button>
            <button class="primary-action async-document-action" type="button" :disabled="isSaving || isWarehouseActionPending || isReadOnly || !canPostWarehouse || !warehouseEditorPrimaryAction || Boolean(productionMoveBlockReason)" :aria-busy="activeWarehouseAction === 'primary'" :title="primaryActionTitle" @click="runPrimaryAction">
              <Send :size="15" />
              {{ activeWarehouseAction === 'primary' ? '处理中' : primaryActionLabel }}
            </button>
          </template>
          <button v-else-if="isReadOnly" class="secondary-action" type="button" disabled :title="`${config.title}已锁定，不能继续编辑`">
            <Pencil :size="15" />
            已锁定
          </button>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="documentDraft.reversalCode" class="warehouse-reversal-notice" aria-label="库存冲销记录">
        <div>
          <span>独立纠错记录</span>
          <strong>{{ documentDraft.reversalCode }} 已冲销本单库存影响</strong>
          <small>{{ documentDraft.reversalReason }} · {{ documentDraft.reversedBy }} · {{ documentDraft.reversedAt }}</small>
        </div>
        <b>原单状态保留</b>
      </section>

      <section v-if="productionMoveBlockReason" class="order-next-step-strip tone-error production-source-blocker" role="alert">
        <div>
          <span>业务阻断</span>
          <strong>暂不能继续流转</strong>
          <p>{{ productionMoveBlockReason }}</p>
        </div>
        <b>联系来源责任人处理</b>
      </section>

      <section v-if="productionIssueSourceMissing" class="form-section production-issue-source-empty" aria-label="生产领料来源提示">
        <div class="attachment-empty">
          <strong>等待生产释放任务</strong>
          <span>生产确认释放后，系统会自动生成仓库待出库任务并带入物料、来源仓库、库存批次和应领数量；仓库无需进入生产模块建单。</span>
        </div>
      </section>

      <section v-if="isDetail && !productionIssueSourceMissing" class="order-next-step-strip" :class="`tone-${warehouseNextStepGuidance.tone}`">
        <div>
          <span>下一步</span>
          <strong>{{ warehouseNextStepGuidance.label }}</strong>
          <p>{{ warehouseNextStepGuidance.description }}</p>
        </div>
      </section>

      <div v-if="!productionIssueSourceMissing" class="quote-form-grid" :class="{ 'is-entry-only': !isDetail }">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
              <i v-if="isEdit" class="mini-status" :class="statusClass(documentDraft.status)">{{ documentDraft.status }}</i>
            </div>

            <div class="quote-fields">
              <label class="form-field" :class="isStocktake && !stocktakeHeaderLocked ? warehouseRequiredFieldClass('盘点日期') : undefined">
                <span :class="isStocktake && !stocktakeHeaderLocked ? warehouseRequiredLabelClass('盘点日期') : undefined">{{ operationDateLabel }}</span>
                <output v-if="isDetail || stocktakeHeaderLocked" class="form-readonly-value">{{ documentDraft.date || '-' }}</output>
                <input v-else v-model="documentDraft.date" type="date" :readonly="isReadOnly" :required="isStocktake" />
              </label>
              <label class="form-field" :class="isStocktake && !stocktakeHeaderLocked ? warehouseRequiredFieldClass('负责人') : undefined">
                <span :class="isStocktake && !stocktakeHeaderLocked ? warehouseRequiredLabelClass('负责人') : undefined">{{ isStocktake ? '负责人' : '经办人' }}</span>
                <output v-if="isDetail || stocktakeHeaderLocked" class="form-readonly-value">{{ documentDraft.owner || '-' }}</output>
                <ReferencePicker
                  v-else-if="isStocktake"
                  required
                  v-model="documentDraft.ownerEmployeeCode"
                  type="employees"
                  kind="warehouse-stocktake-owner"
                  title="选择盘点负责人"
                  placeholder="选择盘点负责人"
                  search-placeholder="搜索员工姓名、部门、岗位、手机号或邮箱"
                  :display-value="documentDraft.owner"
                  :disabled="isReadOnly"
                  @select="handleStocktakeOwnerSelect"
                />
                <input v-else v-model="documentDraft.owner" type="text" :readonly="isReadOnly" />
              </label>
              <label v-if="isAuthoritativeProductionIssue" class="form-field">
                <span>{{ productionIssueMilestoneLabel }}</span>
                <output class="form-readonly-value">{{ productionIssueMilestoneTime }}</output>
              </label>

              <template v-if="isProductionMove">
                <label v-if="isAuthoritativeProductionReceipt" class="form-field" :class="warehouseRequiredFieldClass('生产批次')">
                  <span :class="warehouseRequiredLabelClass('生产批次')">生产批次</span>
                  <output
                    v-if="isDetail && documentDraft.executionCard"
                    class="form-readonly-value quote-code"
                    title="生产批次由来源模块生成，仓库只读核对"
                  >{{ documentDraft.executionCard }}</output>
                  <select v-else v-model="documentDraft.executionCard" :disabled="isReadOnly" @change="selectProductionReceiptSource">
                    <option value="" :disabled="receivableProductionCards.length > 0">
                      {{ receivableProductionCards.length ? '选择已放行待入库批次' : '暂无已放行待入库批次' }}
                    </option>
                    <option v-for="card in receivableProductionCards" :key="card.code" :value="card.code">
                      {{ card.code }} · {{ card.productName }} · 可入 {{ productionReceiptAvailableQty(card) }} {{ card.unit }}
                    </option>
                  </select>
                  <span
                    v-if="documentDraft.executionCard && !isDetail"
                    class="workbench-inline-link source-document-link"
                    title="生产批次由来源模块生成，仓库只读核对"
                  >生产批次只读</span>
                </label>
                <label v-if="currentKind === 'productionReturns'" class="form-field" :class="warehouseRequiredFieldClass('原领料单')">
                  <span :class="warehouseRequiredLabelClass('原领料单')">原领料单</span>
                  <RouterLink
                    v-if="isDetail && documentDraft.materialIssue"
                    class="form-readonly-value quote-code warehouse-source-link"
                    :to="`/warehouse/production-issues/${encodeURIComponent(documentDraft.materialIssue)}`"
                    :title="`打开原领料单 ${documentDraft.materialIssue}`"
                  >{{ documentDraft.materialIssue }}</RouterLink>
                  <select v-else v-model="documentDraft.materialIssue" :disabled="isReadOnly" @change="selectProductionReturnSource">
                    <option value="">选择已完成领料单</option>
                    <option
                      v-for="issue in returnableProductionIssues"
                      :key="issue.code"
                      :value="issue.code"
                    >
                      {{ issue.code }} · {{ issue.workOrder }} · 可退 {{ productionIssueReturnableLineCount(issue) }} 项
                    </option>
                  </select>
                  <RouterLink
                    v-if="documentDraft.materialIssue && !isDetail"
                    class="workbench-inline-link source-document-link"
                    :to="`/warehouse/production-issues/${encodeURIComponent(documentDraft.materialIssue)}`"
                    :title="`打开原领料单 ${documentDraft.materialIssue}`"
                  >
                    查看原领料单
                  </RouterLink>
                </label>
                <label
                  v-if="(!isAuthoritativeProductionReturn && !isAuthoritativeProductionReceipt) || isDetail || documentDraft.materialIssue || documentDraft.executionCard"
                  class="form-field"
                  :class="warehouseRequiredFieldClass('来源生产工单')"
                >
                  <span :class="warehouseRequiredLabelClass('来源生产工单')">来源生产工单</span>
                  <output
                    v-if="(isDetail || isAuthoritativeProductionReturn || isAuthoritativeProductionReceipt) && documentDraft.workOrder"
                    class="form-readonly-value quote-code"
                    title="来源生产工单只读展示"
                  >{{ documentDraft.workOrder }}</output>
                  <input v-else v-model="documentDraft.workOrder" type="text" placeholder="选择或填写生产工单" :readonly="isReadOnly" />
                  <span
                    v-if="documentDraft.workOrder && !isDetail && !isAuthoritativeProductionReturn && !isAuthoritativeProductionReceipt"
                    class="workbench-inline-link source-document-link"
                    title="来源生产工单只读展示"
                  >
                    生产工单只读
                  </span>
                </label>
                <label v-if="documentDraft.releaseBatch" class="form-field">
                  <span>生产安排</span>
                  <output v-if="isDetail || isAuthoritativeProductionReturn || isAuthoritativeProductionReceipt" class="form-readonly-value quote-code">{{ documentDraft.releaseBatch }}</output>
                  <input v-else v-model="documentDraft.releaseBatch" type="text" readonly />
                  <small v-if="!isStructuredProductionMaterialMove">关联本次安排数量、产线、班次与仓库操作</small>
                </label>
                <label v-if="documentDraft.executionCard && !isAuthoritativeProductionReceipt" class="form-field">
                  <span>生产批次</span>
                  <output
                    v-if="isDetail || currentKind === 'productionReturns'"
                    class="form-readonly-value quote-code"
                    title="来源生产批次只读展示"
                  >{{ documentDraft.executionCard }}</output>
                  <input v-else v-model="documentDraft.executionCard" type="text" placeholder="由生产批次带入" readonly />
                  <span
                    v-if="!isDetail && currentKind !== 'productionReturns'"
                    class="workbench-inline-link source-document-link"
                    title="来源生产批次只读展示"
                  >
                    生产批次只读
                  </span>
                </label>
                <label v-if="isAuthoritativeProductionReceipt && documentDraft.executionCard" class="form-field">
                  <span>质检放行</span>
                  <output class="form-readonly-value">
                    {{ selectedProductionReceiptCard ? stocktakeQty(Number(selectedProductionReceiptCard.releasedInboundQty || 0), selectedProductionReceiptCard.unit) : '-' }}
                  </output>
                </label>
                <label v-if="!isStructuredProductionMaterialMove" class="form-field" :class="warehouseRequiredFieldClass('业务类型')">
                  <span :class="warehouseRequiredLabelClass('业务类型')">作业类型</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.moveType || '-' }}</output>
                  <input v-else v-model="documentDraft.moveType" type="text" readonly />
                </label>
                <label v-if="!isStructuredProductionMaterialMove" class="form-field" :class="warehouseRequiredFieldClass('库存方向')">
                  <span :class="warehouseRequiredLabelClass('库存方向')">库存方向</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.direction || '-' }}</output>
                  <input v-else v-model="documentDraft.direction" type="text" readonly title="由作业类型自动确定" />
                </label>
                <label v-if="!isStructuredProductionMaterialMove" class="form-field" :class="warehouseRequiredFieldClass('业务仓库')">
                  <span :class="warehouseRequiredLabelClass('业务仓库')">{{ operationWarehouseLabel }}</span>
                  <output v-if="isDetail || currentKind === 'productionReturns'" class="form-readonly-value">{{ documentDraft.warehouse || '-' }}</output>
                  <ReferencePicker
                    v-else
                    required
                    v-model="documentDraft.warehouseCode"
                    type="warehouses"
                    :title="`选择${operationWarehouseLabel}`"
                    :placeholder="`选择${operationWarehouseLabel}`"
                    search-placeholder="搜索仓库编码、名称、类型或地址"
                    :display-value="documentDraft.warehouse"
                    :disabled="isReadOnly"
                    @select="handleWarehouseSelect('warehouse', $event)"
                  />
                </label>
                <label v-if="!isStructuredProductionMaterialMove" class="form-field" :class="warehouseRequiredFieldClass('生产线边仓或入库目标仓')">
                  <span :class="warehouseRequiredLabelClass('生产线边仓或入库目标仓')">{{ operationTargetLabel }}</span>
                  <output v-if="isDetail || currentKind === 'productionReturns'" class="form-readonly-value">{{ documentDraft.targetWarehouse || '-' }}</output>
                  <input v-else v-model="documentDraft.targetWarehouse" type="text" placeholder="例如 生产线边仓、成品仓" :readonly="isReadOnly" />
                </label>
                <label v-if="!isStructuredProductionMaterialMove" class="form-field field-span-2" :class="warehouseRequiredFieldClass('业务原因')">
                  <span :class="warehouseRequiredLabelClass('业务原因')">作业说明</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.reason || '-' }}</output>
                  <input v-else v-model="documentDraft.reason" type="text" :readonly="isReadOnly" />
                </label>
              </template>

              <template v-if="isOtherMove">
                <label class="form-field" :class="warehouseRequiredFieldClass('业务类型')">
                  <span :class="warehouseRequiredLabelClass('业务类型')">业务类型</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.moveType || '-' }}</output>
                  <select v-else v-model="documentDraft.moveType" :disabled="isReadOnly" @change="handleOtherMoveTypeChange">
                    <option>样品出库</option>
                    <option>领用出库</option>
                    <option>报废出库</option>
                    <option>借用出库</option>
                    <option>借用归还</option>
                    <option>库存调整</option>
                  </select>
                </label>
                <label class="form-field" :class="warehouseRequiredFieldClass('库存方向')">
                  <span :class="warehouseRequiredLabelClass('库存方向')">库存方向</span>
                  <output v-if="isDetail || !otherMoveDirectionEditable" class="form-readonly-value">{{ documentDraft.direction || '-' }}</output>
                  <select
                    v-else
                    v-model="documentDraft.direction"
                    :disabled="isReadOnly"
                    title="选择库存调整的方向"
                    @change="handleOtherMoveDirectionChange"
                  >
                    <option>出库</option>
                    <option>入库</option>
                  </select>
                </label>
                <label class="form-field" :class="warehouseRequiredFieldClass('业务仓库')">
                  <span :class="warehouseRequiredLabelClass('业务仓库')">{{ operationWarehouseLabel }}</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.warehouse || '-' }}</output>
                  <ReferencePicker
                    v-else
                    required
                    v-model="documentDraft.warehouseCode"
                    type="warehouses"
                    :title="`选择${operationWarehouseLabel}`"
                    :placeholder="`选择${operationWarehouseLabel}`"
                    search-placeholder="搜索仓库编码、名称、类型或地址"
                    :display-value="documentDraft.warehouse"
                    :disabled="isReadOnly"
                    @select="handleWarehouseSelect('warehouse', $event)"
                  />
                </label>
                <label class="form-field" :class="warehouseRequiredFieldClass(operationLocationLabel)">
                  <span :class="warehouseRequiredLabelClass(operationLocationLabel)">{{ operationLocationLabel }}</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ otherMoveLocationDisplay }}</output>
                  <select
                    v-else
                    v-model="documentDraft.location"
                    :disabled="isReadOnly || !documentDraft.warehouse || !otherMoveLocationOptions.length"
                    :title="`选择${operationLocationLabel}`"
                    @change="handleOtherMoveLocationChange"
                  >
                    <option value="" disabled>
                      {{ !documentDraft.warehouse
                        ? '请先选择业务仓库'
                        : otherMoveLocationOptions.length
                          ? `选择${operationLocationLabel}`
                          : '当前仓库尚未维护可用库位' }}
                    </option>
                    <option v-for="location in otherMoveLocationOptions" :key="location" :value="location">
                      {{ location }}
                    </option>
                  </select>
                </label>
                <label v-if="showOtherMoveCounterparty" class="form-field" :class="otherMoveCounterpartyRequired ? warehouseRequiredFieldClass('业务对象') : undefined">
                  <span :class="otherMoveCounterpartyRequired ? warehouseRequiredLabelClass('业务对象') : undefined">{{ otherMoveCounterpartyLabel }}</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.targetWarehouse || '-' }}</output>
                  <input v-else v-model="documentDraft.targetWarehouse" type="text" :placeholder="`填写${otherMoveCounterpartyLabel}`" :readonly="isReadOnly" />
                </label>
                <label
                  class="form-field"
                  :class="[
                    warehouseRequiredFieldClass('其他出入库原因'),
                    showOtherMoveCounterparty ? 'field-span-2' : 'field-span-full',
                  ]"
                >
                  <span :class="warehouseRequiredLabelClass('其他出入库原因')">{{ otherMoveReasonLabel }}</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.reason || '-' }}</output>
                  <input v-else v-model="documentDraft.reason" type="text" :placeholder="`填写${otherMoveReasonLabel}`" :readonly="isReadOnly" />
                </label>
              </template>

              <template v-if="isTransfer">
                <label class="form-field" :class="warehouseRequiredFieldClass('调出仓库')">
                  <span :class="warehouseRequiredLabelClass('调出仓库')">调出仓库</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.fromWarehouse || '-' }}</output>
                  <ReferencePicker
                    v-else
                    required
                    v-model="documentDraft.fromWarehouseCode"
                    type="warehouses"
                    title="选择调出仓库"
                    placeholder="选择调出仓库"
                    search-placeholder="搜索仓库编码、名称、类型或地址"
                    :display-value="documentDraft.fromWarehouse"
                    :disabled="isReadOnly"
                    @select="handleWarehouseSelect('fromWarehouse', $event)"
                  />
                </label>
                <label class="form-field" :class="warehouseRequiredFieldClass('调入仓库')">
                  <span :class="warehouseRequiredLabelClass('调入仓库')">调入仓库</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.toWarehouse || '-' }}</output>
                  <ReferencePicker
                    v-else
                    required
                    v-model="documentDraft.toWarehouseCode"
                    type="warehouses"
                    title="选择调入仓库"
                    placeholder="选择调入仓库"
                    search-placeholder="搜索仓库编码、名称、类型或地址"
                    :display-value="documentDraft.toWarehouse"
                    :disabled="isReadOnly"
                    @select="handleWarehouseSelect('toWarehouse', $event)"
                  />
                </label>
                <label class="form-field" :class="warehouseRequiredFieldClass('调入库位')">
                  <span :class="warehouseRequiredLabelClass('调入库位')">调入库位</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ transferTargetLocationDisplay }}</output>
                  <select
                    v-else
                    v-model="documentDraft.toLocation"
                    :disabled="isReadOnly || !documentDraft.toWarehouse || !transferTargetLocationOptions.length"
                    title="选择调入仓库中的目标库位"
                  >
                    <option value="" disabled>
                      {{ !documentDraft.toWarehouse
                        ? '请先选择调入仓库'
                        : transferTargetLocationOptions.length
                          ? '选择调入库位'
                          : '当前仓库暂无可选库位' }}
                    </option>
                    <option v-for="location in transferTargetLocationOptions" :key="location" :value="location">
                      {{ location }}
                    </option>
                  </select>
                  <small v-if="!isDetail">调出后记入该库位的在途；确认调入后转为可用库存。</small>
                </label>
                <label class="form-field" :class="[warehouseRequiredFieldClass('调拨原因'), { 'field-span-2': !isDetail }]">
                  <span :class="warehouseRequiredLabelClass('调拨原因')">调拨原因</span>
                  <output v-if="isDetail" class="form-readonly-value">{{ documentDraft.reason || '-' }}</output>
                  <input v-else v-model="documentDraft.reason" type="text" placeholder="填写调拨用途或业务原因" :readonly="isReadOnly" />
                </label>
              </template>

              <template v-if="isStocktake">
                <label class="form-field" :class="stocktakeHeaderLocked ? undefined : warehouseRequiredFieldClass('盘点仓库')">
                  <span :class="stocktakeHeaderLocked ? undefined : warehouseRequiredLabelClass('盘点仓库')">盘点仓库</span>
                  <output v-if="isDetail || stocktakeHeaderLocked" class="form-readonly-value">{{ documentDraft.warehouse || '-' }}</output>
                  <ReferencePicker
                    v-else
                    required
                    v-model="documentDraft.warehouseCode"
                    type="warehouses"
                    title="选择盘点仓库"
                    placeholder="选择盘点仓库"
                    search-placeholder="搜索仓库编码、名称、类型或地址"
                    :display-value="documentDraft.warehouse"
                    :disabled="isReadOnly"
                    @select="handleWarehouseSelect('warehouse', $event)"
                  />
                </label>
                <label class="form-field" :class="stocktakeHeaderLocked ? undefined : warehouseRequiredFieldClass('盘点方式')">
                  <span :class="stocktakeHeaderLocked ? undefined : warehouseRequiredLabelClass('盘点方式')">盘点方式</span>
                  <output v-if="isDetail || stocktakeHeaderLocked" class="form-readonly-value">{{ documentDraft.scopeMode || '指定范围' }}</output>
                  <select v-else v-model="documentDraft.scopeMode" :disabled="isReadOnly" title="选择盘点方式" @change="handleStocktakeScopeModeChange">
                    <option>按库位</option>
                    <option>按物料</option>
                    <option>按批次</option>
                    <option>全仓盘点</option>
                    <option v-if="documentDraft.scopeMode === '指定范围'">指定范围</option>
                  </select>
                </label>
                <label class="form-field" :class="[!stocktakeHeaderLocked && documentDraft.scopeMode !== '全仓盘点' ? warehouseRequiredFieldClass(stocktakeScopeInputLabel) : undefined, { 'field-span-2': isDetail }]">
                  <span :class="!stocktakeHeaderLocked && documentDraft.scopeMode !== '全仓盘点' ? warehouseRequiredLabelClass(stocktakeScopeInputLabel) : undefined">{{ stocktakeScopeInputLabel }}</span>
                  <output v-if="isDetail || stocktakeHeaderLocked || documentDraft.scopeMode === '全仓盘点'" class="form-readonly-value">{{ documentDraft.scopeLabel || documentDraft.scope || '全部合格库存' }}</output>
                  <select
                    v-else-if="['按库位', '按物料', '按批次'].includes(documentDraft.scopeMode)"
                    v-model="documentDraft.scope"
                    :disabled="isReadOnly || !documentDraft.warehouse || !stocktakeScopeOptions.length"
                    :title="`选择${stocktakeScopeInputLabel}`"
                    @change="handleStocktakeScopeSelect"
                  >
                    <option value="" disabled>
                      {{ !documentDraft.warehouse
                        ? '请先选择盘点仓库'
                        : stocktakeScopeOptions.length
                          ? `选择${stocktakeScopeInputLabel}`
                          : '当前仓库暂无可盘合格库存' }}
                    </option>
                    <option v-for="option in stocktakeScopeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                  <input
                    v-else
                    v-model="documentDraft.scope"
                    type="text"
                    :placeholder="stocktakeScopePlaceholder"
                    :readonly="isReadOnly"
                    @input="documentDraft.scopeLabel = documentDraft.scope"
                  />
                </label>
              </template>
            </div>
          </section>

          <section
            v-if="isStructuredProductionMaterialMove && (!isAuthoritativeProductionReturn || documentDraft.materialIssue) && (!isAuthoritativeProductionReceipt || documentDraft.executionCard)"
            class="form-section"
          >
            <div class="section-heading">
              <h2>{{ isAuthoritativeProductionReceipt ? '入库路径' : isAuthoritativeProductionReturn ? '退料路径' : '领料路径' }}</h2>
            </div>
            <div class="quote-fields production-issue-route-fields">
              <label class="form-field">
                <span>{{ isAuthoritativeProductionReceipt || isAuthoritativeProductionReturn ? '现场来源' : '来源仓库' }}</span>
                <output class="form-readonly-value">{{ documentDraft.warehouse || '-' }}</output>
              </label>
              <label class="form-field" :class="isAuthoritativeProductionReceipt ? warehouseRequiredFieldClass('成品入库仓') : undefined">
                <span :class="isAuthoritativeProductionReceipt ? warehouseRequiredLabelClass('成品入库仓') : undefined">{{ isAuthoritativeProductionReceipt ? '入库仓库' : isAuthoritativeProductionReturn ? '退回仓库' : '领用去向' }}</span>
                <output v-if="isDetail || !isAuthoritativeProductionReceipt" class="form-readonly-value">{{ documentDraft.targetWarehouse || '-' }}</output>
                <ReferencePicker
                  v-else
                  required
                  v-model="documentDraft.targetWarehouseCode"
                  type="warehouses"
                  title="选择成品入库仓"
                  placeholder="选择成品入库仓"
                  search-placeholder="搜索允许完工入库的仓库"
                  :display-value="documentDraft.targetWarehouse"
                  :disabled="isReadOnly"
                  @select="handleWarehouseSelect('targetWarehouse', $event)"
                />
              </label>
              <label
                v-if="isAuthoritativeProductionReceipt"
                class="form-field"
                :class="warehouseRequiredFieldClass('成品入库库位')"
              >
                <span :class="warehouseRequiredLabelClass('成品入库库位')">入库库位</span>
                <output v-if="isDetail" class="form-readonly-value">
                  {{ productionReceiptTargetLocationOptions.includes(documentDraft.targetLocation)
                    ? documentDraft.targetLocation
                    : '尚未选择正式库位' }}
                </output>
                <select
                  v-else
                  v-model="documentDraft.targetLocation"
                  :disabled="isReadOnly || !documentDraft.targetWarehouse || !productionReceiptTargetLocationOptions.length"
                  title="选择成品入库仓中的正式目标库位"
                >
                  <option value="" disabled>
                    {{ !documentDraft.targetWarehouse
                      ? '请先选择成品入库仓'
                      : productionReceiptTargetLocationOptions.length
                        ? '选择成品入库库位'
                        : '当前仓库尚未维护正式库位' }}
                  </option>
                  <option
                    v-for="location in productionReceiptTargetLocationOptions"
                    :key="location"
                    :value="location"
                  >
                    {{ location }}
                  </option>
                </select>
                <small>库存将精确记入所选库位；系统不会使用 *-AUTO 或“默认库位”占位。</small>
              </label>
            </div>
          </section>

          <section v-if="!isStocktake" class="form-section">
            <div class="form-section-head">
              <h2>{{ operationDetailTitle }}</h2>
              <button v-if="!isReadOnly && !hasAuthoritativeProductionLines" class="secondary-action" type="button" title="添加明细行" @click="addLine">
                <Plus :size="15" />
                新增明细
              </button>
            </div>

            <div
              v-if="currentKind === 'productionReturns' && !documentDraft.materialIssue"
              class="attachment-empty production-return-source-empty"
              :class="{ 'has-field-error': warehouseValidationAttempted && warehouseMissingSubmitFields().includes('明细') }"
            >
              请先选择原领料单，系统会带入仍可退回的物料、原批次和原仓库。
            </div>
            <div
              v-else-if="isAuthoritativeProductionReceipt && !documentDraft.executionCard"
              class="attachment-empty production-return-source-empty"
              :class="{ 'has-field-error': warehouseValidationAttempted && warehouseMissingSubmitFields().includes('明细') }"
            >
              请选择已通过入库检验且仍有放行数量待入库的生产批次。
            </div>
            <div v-else class="quote-line-table" :class="{ 'has-field-error': warehouseValidationAttempted && warehouseMissingSubmitFields().includes('明细') }">
              <div class="quote-line-row warehouse-document-line-row quote-line-head" :class="{ 'no-actions': isReadOnly || hasAuthoritativeProductionLines, 'production-issue-line-row': isAuthoritativeProductionIssue, 'production-return-line-row': isAuthoritativeProductionReturn, 'production-receipt-line-row': isAuthoritativeProductionReceipt, 'other-move-line-row': isOtherMove, 'transfer-line-row': isTransfer }">
                <span
                  v-if="isDetail || hasAuthoritativeProductionLines || isStructuredProductionMaterialMove"
                  class="warehouse-line-material-identity required-label"
                >{{ operationMaterialLabel }}</span>
                <template v-else>
                  <span>图片</span>
                  <span class="required-label">{{ operationMaterialLabel }}</span>
                </template>
                <span class="required-label">数量</span>
                <span>{{ isAuthoritativeProductionIssue ? '来源仓 / 批次' : isAuthoritativeProductionReturn ? '原批次' : isAuthoritativeProductionReceipt ? '成品批次' : isTransfer && isDetail && documentDraft.transitLines?.length ? '调出库位 / 批次' : '批次' }}</span>
                <span v-if="!isStructuredProductionMaterialMove && !isOtherMove && !isTransfer">单位</span>
                <span v-if="!isReadOnly && !hasAuthoritativeProductionLines">操作</span>
              </div>
              <div
                v-for="(item, index) in operationLineProducts"
                :key="`${item.materialCode || 'new'}-${index}`"
                class="quote-line-row warehouse-document-line-row"
                :class="{ 'no-actions': isReadOnly || hasAuthoritativeProductionLines, 'production-issue-line-row': isAuthoritativeProductionIssue, 'production-return-line-row': isAuthoritativeProductionReturn, 'production-receipt-line-row': isAuthoritativeProductionReceipt, 'other-move-line-row': isOtherMove, 'transfer-line-row': isTransfer }"
              >
                <MaterialIdentity
                  v-if="isDetail || hasAuthoritativeProductionLines || isStructuredProductionMaterialMove"
                  class="warehouse-line-material-identity"
                  :name="item.name"
                  :code="item.materialCode"
                  :model="item.model"
                  :spec="item.spec"
                  :image-label="lineItems[index]?.image.label"
                  :image-tone="lineItems[index]?.image.tone"
                />
                <template v-else>
                  <span class="product-thumb" :style="{ backgroundColor: lineItems[index]?.image.tone }">
                    <span>{{ lineItems[index]?.image.label }}</span>
                  </span>
                  <ReferencePicker
                    required
                    v-model="item.materialCode"
                    type="materials"
                    :title="`选择${operationMaterialLabel}`"
                    :placeholder="`选择${operationMaterialLabel}`"
                    search-placeholder="搜索编码、名称、型号、规格或分类"
                    :display-value="productIdentity(item, `选择${operationMaterialLabel}`)"
                    :disabled="isReadOnly || hasAuthoritativeProductionLines"
                    :active-only="true"
                    :class="warehouseLineProductClass(item)"
                    @select="handleProductSelect(index, $event)"
                  />
                </template>
                <span v-if="isDetail" class="line-readonly-value">{{ isOtherMove || isTransfer ? lineQuantityWithUnit(item) : item.qty || '-' }}</span>
                <span v-else-if="currentKind === 'productionReturns'" class="warehouse-return-qty-cell">
                  <QuantityWithUnitInput v-model="item.qty" :unit="item.uom" placeholder="实际退回数量" :readonly="isReadOnly" :class="warehouseLineQtyClass(item)" />
                  <small>最多可退 {{ productionReturnAvailableQty(item) }} {{ item.uom }}</small>
                </span>
                <span v-else-if="isAuthoritativeProductionReceipt" class="warehouse-return-qty-cell">
                  <QuantityWithUnitInput v-model="item.qty" :unit="item.uom" placeholder="实际入库数量" :readonly="isReadOnly" :class="warehouseLineQtyClass(item)" />
                  <small>本批次最多可入 {{ selectedProductionReceiptAvailableQty }} {{ item.uom }}</small>
                </span>
                <QuantityWithUnitInput v-else v-model="item.qty" :unit="item.uom" placeholder="数量" :readonly="isReadOnly || isAuthoritativeProductionIssue" :class="warehouseLineQtyClass(item)" />
                <span v-if="isAuthoritativeProductionIssue" class="line-readonly-value production-issue-batch-source">
                  <strong>{{ productionIssueLineWarehouse(item) }}</strong>
                  <small>{{ item.batch || '未分配批次' }}</small>
                </span>
                <span v-else-if="isDetail || hasAuthoritativeProductionLines" class="line-readonly-value">{{ lineBatchDisplay(item) }}</span>
                <select
                  v-else-if="isOtherMove && documentDraft.direction === '出库' && item.batchTracked"
                  v-model="item.batch"
                  :disabled="isReadOnly || !documentDraft.warehouse || !documentDraft.location || !otherMoveBatchOptions(item).length"
                  :class="warehouseLineBatchClass(item)"
                  title="选择当前仓库和库位中的实际可用批次"
                >
                  <option value="" disabled>
                    {{ !documentDraft.warehouse
                      ? '请先选择出库仓库'
                      : !documentDraft.location
                        ? '请先选择出库库位'
                        : otherMoveBatchOptions(item).length
                          ? '选择实际出库批次'
                          : '当前库位没有该物料的可用批次' }}
                  </option>
                  <option v-for="option in otherMoveBatchOptions(item)" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <select
                  v-else-if="isTransfer && item.batchTracked"
                  v-model="item.batch"
                  :disabled="isReadOnly || !documentDraft.fromWarehouse || !item.materialCode"
                  title="选择调出仓中的实际可用批次；留空时确认调出会按可用批次自动分配"
                >
                  <option value="">
                    {{ !documentDraft.fromWarehouse
                      ? '请先选择调出仓库'
                      : !item.materialCode
                        ? '请先选择物料'
                        : transferBatchOptions(item).length
                          ? '自动按可用批次分配'
                          : '暂无可用批次，调出时重新校验' }}
                  </option>
                  <option v-for="option in transferBatchOptions(item)" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <input
                  v-else-if="(!isOtherMove && !isTransfer) || item.batchTracked"
                  v-model="item.batch"
                  type="text"
                  :placeholder="isOtherMove ? '可留空，过账时自动生成' : '可留空自动分配'"
                  :readonly="isReadOnly || hasAuthoritativeProductionLines"
                  :class="isOtherMove ? warehouseLineBatchClass(item) : undefined"
                />
                <span v-else class="line-readonly-value">{{ item.materialCode || item.name ? '不追踪批次' : '选择物料后确定' }}</span>
                <span v-if="!isStructuredProductionMaterialMove && !isOtherMove && !isTransfer" class="line-readonly-value" :title="item.uom || '未选择物料'">{{ item.uom || '待选物料' }}</span>
                <button
                  v-if="!isReadOnly && !hasAuthoritativeProductionLines"
                  class="icon-button"
                  type="button"
                  aria-label="删除仓库作业明细"
                  :title="documentDraft.products.length <= 1 ? '至少保留一行仓库作业明细' : '删除仓库作业明细'"
                  :disabled="documentDraft.products.length <= 1"
                  @click="removeLine(index)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
          </section>

          <section v-else-if="documentDraft.lines?.length || documentDraft.status !== '待盘点'" class="form-section">
            <div class="form-section-head">
              <h2>盘点结果</h2>
            </div>

            <div v-if="stocktakeCancelledBeforeStart" class="attachment-empty stocktake-empty-state">
              本次盘点在开始前已取消，未形成账面快照、实盘结果或差异。
            </div>

            <div v-else class="quote-fields stocktake-summary-fields">
              <label class="form-field">
                <span>计划项数</span>
                <output class="form-readonly-value">{{ documentDraft.plannedCount }}</output>
              </label>
              <label class="form-field">
                <span>已盘项数</span>
                <output class="form-readonly-value">{{ documentDraft.checkedCount }}</output>
              </label>
              <label class="form-field">
                <span>差异项数</span>
                <output class="form-readonly-value">{{ documentDraft.differenceCount }}</output>
              </label>
            </div>

            <div v-if="!stocktakeCancelledBeforeStart && documentDraft.lines?.length" class="quote-line-table stocktake-line-table">
              <div class="quote-line-row stocktake-line-row quote-line-head">
                <span>物料</span>
                <span>库位 / 批次</span>
                <span>账面合格数</span>
                <span>实盘合格数</span>
                <span>差异</span>
              </div>
              <div
                v-for="line in documentDraft.lines"
                :key="line.inventoryKey"
                class="quote-line-row stocktake-line-row"
              >
                <MaterialIdentity
                  compact
                  class="stocktake-line-material"
                  :name="line.item"
                  :code="line.materialCode"
                  :model="line.model"
                  :spec="line.spec"
                  :image-label="stocktakeLineVisual(line).label"
                  :image-tone="stocktakeLineVisual(line).tone"
                />
                <span class="stocktake-line-identity">
                  <strong :title="warehouseLocationDisplay(line.location)">{{ warehouseLocationDisplay(line.location) }}</strong>
                  <small :title="line.batch || '无批次'">{{ line.batch || '无批次' }}</small>
                </span>
                <strong>{{ stocktakeQty(line.bookQty, line.uom) }}</strong>
                <strong v-if="isDetail" class="stocktake-counted-value">{{ line.countedQty == null ? '待盘' : stocktakeQty(line.countedQty, line.uom) }}</strong>
                <input
                  v-else
                  v-model.number="line.countedQty"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="填写实盘数量"
                  :readonly="!canEditStocktakeCounts"
                  @input="refreshStocktakeMetrics"
                />
                <strong
                  class="stocktake-difference"
                  :class="{
                    positive: Number(stocktakeDifference(line) || 0) > 0,
                    negative: Number(stocktakeDifference(line) || 0) < 0,
                  }"
                >
                  {{ stocktakeDifference(line) == null ? '待盘' : stocktakeQty(stocktakeDifference(line), line.uom) }}
                </strong>
              </div>
            </div>
            <div v-else-if="!stocktakeCancelledBeforeStart" class="attachment-empty stocktake-empty-state">
              当前范围没有可盘合格库存，请检查仓库或盘点范围。
            </div>
          </section>

          <section v-if="showWarehouseNoteSection" class="form-section">
            <div class="form-section-head">
              <h2>备注</h2>
            </div>
            <div v-if="isDetail" class="document-note-block warehouse-note-block">
              <p>{{ documentDraft.note }}</p>
            </div>
            <label v-else class="form-field full-field">
              <textarea
                v-model="documentDraft.note"
                class="terms-textarea"
                :rows="3"
                :placeholder="warehouseNotePlaceholder"
                :readonly="isReadOnly"
              ></textarea>
            </label>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              :title="warehouseStatusPanelTitle"
              :primary-status="warehouseDocumentLifecycleStatus"
              :items="warehouseDocumentStatusItems"
              :aria-label="`${config.title}\u72b6\u6001\u4e0e\u4f5c\u4e1a\u8fdb\u5ea6`"
            />
          </section>
          <section v-if="isDetail" class="summary-section">
            <div class="summary-title">
              <Boxes :size="17" />
              <h2>{{ isStocktake ? '盘点影响' : '库存影响' }}</h2>
            </div>
            <div v-for="row in visibleSummaryRows" :key="row.label" class="summary-line">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </section>

          <section v-if="!isDetail || documentAttachments.length" class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
              <label
                class="secondary-action compact-action file-upload-button"
                :class="{ 'is-disabled': isReadOnly }"
                :aria-disabled="isReadOnly"
                :title="warehouseAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple :disabled="isReadOnly" @change="handleAttachmentUpload" />
              </label>
            </div>
            <div v-if="documentAttachments.length" class="attachment-list">
              <div v-for="file in documentAttachments" :key="file.name" class="attachment-row">
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
              <span>{{ isReadOnly ? '暂无附件' : warehouseAttachmentHint }}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      :title="`${config.title}单据`"
      :message="loadMessage || `${config.title}单据不存在`"
      :back-path="`/warehouse/${config.routeSegment}`"
      :back-label="`返回${config.listLabel}`"
      @retry="loadDocument"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      :title="`${config.title}日志`"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <WarehouseReversalDialog
      :open="reversalDialogOpen"
      title="冲销库存影响"
      :record-code="documentDraft?.code || ''"
      :pending="activeWarehouseAction === 'reverse'"
      @close="reversalDialogOpen = false"
      @submit="submitWarehouseReversal"
    />
    <WarehouseActionReasonDialog
      :open="Boolean(stocktakeReasonMode)"
      :title="stocktakeReasonDialogConfig.title"
      :record-code="documentDraft?.code || ''"
      :note="stocktakeReasonDialogConfig.note"
      :reason-label="stocktakeReasonDialogConfig.reasonLabel"
      :placeholder="stocktakeReasonDialogConfig.placeholder"
      :submit-label="stocktakeReasonDialogConfig.submitLabel"
      :pending-label="stocktakeReasonDialogConfig.pendingLabel"
      :danger="stocktakeReasonDialogConfig.danger"
      :pending="activeWarehouseAction === 'stocktake-secondary'"
      @close="stocktakeReasonMode = ''"
      @submit="submitStocktakeSecondaryAction"
    />
    <WarehouseActionReasonDialog
      :open="transferCancelDialogOpen"
      title="取消库存调拨"
      :record-code="documentDraft?.code || ''"
      note="仅允许在实际调出前取消；取消不会扣减调出仓库存，也不会形成在途或调入库存，原单与取消记录继续保留。"
      reason-label="取消原因"
      placeholder="例如：调拨需求已撤回，或目标仓库、库位需要重新选择。"
      submit-label="确认取消"
      pending-label="取消中"
      :danger="true"
      :pending="activeWarehouseAction === 'transfer-cancel'"
      @close="transferCancelDialogOpen = false"
      @submit="submitTransferCancellation"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
