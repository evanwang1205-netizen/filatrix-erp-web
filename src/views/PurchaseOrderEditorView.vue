<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  FileDown,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-vue-next';

import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import CommercialFollowUpPanel from '../components/CommercialFollowUpPanel.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import MaterialIdentity from '../components/MaterialIdentity.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import PurchaseReceiptRemainderDialog from '../components/PurchaseReceiptRemainderDialog.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import TermsTemplateDialog from '../components/TermsTemplateDialog.vue';
import { DEFAULT_COMPANY_CODE, DEFAULT_COMPANY_NAME } from '../constants/company';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { useSessionStore } from '../stores/session';
import { scrollElementIntoView } from '../utils/focusNavigation';
import { purchaseMaterialVisuals } from '../data/purchase';
import {
  closePurchaseOrder,
  closePurchaseOrderReceiptRemainder,
  confirmPurchaseOrder,
  createCommercialFollowUp,
  removeCommercialFollowUp,
  deletePurchaseOrder,
  getPurchaseOrder,
  getPurchaseRequisition,
  listReference,
  listPurchaseOrders,
  savePurchaseOrder,
} from '../services/api';
import type { CommercialFollowUpPayload } from '../services/api';
import type { CommercialFollowUpEvent, FlowRecord, PurchaseOrder, PurchaseOrderProduct, PurchaseRequisition, ReferenceOption } from '../types/business';
import type { TermsTemplate } from '../types/termsTemplate';
import { taxRateOptions, taxRateValue } from '../utils/taxCalculation';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import { attachmentsFromFileList } from '../utils/attachmentUpload';

type SupplierReference = {
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  paymentMethod?: string;
  deliveryMethod?: string;
};

type MaterialReference = {
  code: string;
  name: string;
  model?: string;
  spec?: string;
  uom?: string;
  latestPrice?: string;
  imageLabel?: string;
  imageTone?: string;
  qualityControl?: string;
  incomingQualityControl?: string;
};

type WarehouseReference = {
  code: string;
  name: string;
  address?: string;
};

type PurchasePriceReference = {
  materialCode: string;
  materialName: string;
  material: string;
  supplier: string;
  contact: string;
  latestPrice: string;
  quantity: string;
  sourceDoc: string;
  owner: string;
  updatedAt: string;
};

type PurchaseOrderAsyncAction = 'save' | 'confirm' | 'close' | 'closeRemainder' | 'delete';

const purchaseDeliveryMethodOptions = ['供应商送货', '本厂自提', '物流配送', '快递快运', '委外直送'];
const purchasePaymentMethodOptions = ['月结 30 天', '验收后付款', '预付款 30%', '款到发货'];
const purchaseFreightPayerOptions = ['供方', '需方'];

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { canWrite: canWritePurchase, readonlyReason: purchaseReadonlyReason } = useModulePermission('purchase');
const { canOperate: canApprovePurchase, readonlyReason: purchaseApproveReadonlyReason } = useOperationPermission('purchaseApprove', '确认采购');
const showFlowRecords = ref(false);
const isSaving = ref(false);
const isCommercialFollowUpSaving = ref(false);
const isLoading = ref(false);
const {
  activeAction: activePurchaseAction,
  isActionPending: isPurchaseActionPending,
  runAction: runPurchaseAction,
} = useAsyncActionState<PurchaseOrderAsyncAction>();
const loadMessage = ref('');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const orderValidationAttempted = ref(false);
const purchaseMoreActionsOpen = ref(false);
const receiptRemainderDialogOpen = ref(false);
let toastTimer: number | undefined;

const termsTemplates = ref<TermsTemplate[]>([
  {
    key: 'standard',
    name: '标准采购条款',
    deliveryMethod: '供应商送货',
    paymentMethod: '月结 30 天',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '供方',
    content: '供应商按采购要求交付；到货后按我方收货和入库流程验收；发票齐全后按月结 30 天付款。',
  },
  {
    key: 'acceptance',
    name: '验收后付款',
    deliveryMethod: '供应商送货',
    paymentMethod: '验收后付款',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '供方',
    content: '到货后需完成数量、外观及必要检验；验收合格并收到有效发票后付款；不合格物料按退换货处理。',
  },
]);
const initialTermsTemplateKey = 'standard';
const selectedTermsTemplateKey = ref(initialTermsTemplateKey);
const termsTemplateDialogOpen = ref(false);
const activeTermsTemplateKey = ref(initialTermsTemplateKey);
const termsTemplateNotice = ref('');
const termsTemplateDraft = ref<TermsTemplate>({
  ...(termsTemplates.value.find((template) => template.key === initialTermsTemplateKey) ?? termsTemplates.value[0]),
});
const purchaseTaxRateOptions = taxRateOptions;

function currentListPath() {
  return '/purchase/orders';
}

function orderDetailPath(code: string, edit = false) {
  return `${currentListPath()}/${encodeURIComponent(code)}${edit ? '/edit' : ''}`;
}

function purchaseContentPath(code: string) {
  return `${currentListPath()}/${encodeURIComponent(code)}`;
}

function purchaseFollowUpPath(code: string) {
  return `${purchaseContentPath(code)}/follow-up`;
}

const documentTitle = computed(() => '采购订单');

function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createEmptyLine(): PurchaseOrderProduct {
  return {
    materialCode: '',
    name: '',
    qty: '',
    priceInputMode: '含税',
    unitPrice: '',
    amount: '',
    taxRate: '13%',
    qcRequired: false,
    incomingQualityControl: '',
    uom: '',
  };
}

function incomingQualityRule(material: MaterialReference) {
  return material.incomingQualityControl || material.qualityControl || '免检';
}

function incomingQualityRequired(rule?: string) {
  return !['免检', '不适用', '无需质检', '无需'].includes(String(rule || '').trim());
}

function createEmptyOrder(): PurchaseOrder {
  const defaultTerms = termsTemplates.value.find((template) => template.key === 'standard') ?? termsTemplates.value[0];
  return {
    code: '系统自动生成',
    companyCode: DEFAULT_COMPANY_CODE,
    company: DEFAULT_COMPANY_NAME,
    purchaseType: '物料采购',
    supplierCode: '',
    supplier: '',
    contact: '',
    contactPhone: '',
    sourceRequisition: route.query.requisition?.toString() ?? '',
    sourceRequisitions: route.query.requisition ? [route.query.requisition.toString()] : [],
    products: [createEmptyLine()],
    amount: '￥0.00',
    owner: session.user.name || '陈晨',
    status: '草稿',
    date: today(),
    expectedDate: today(7),
    deliveryMethod: '供应商送货',
    paymentMethod: defaultTerms.paymentMethod,
    freightPayer: '供方',
    taxMode: '含税',
    taxRate: '13%',
    warehouseCode: '',
    warehouse: '',
    receivingAddress: '',
    receivingContact: '',
    receivingPhone: '',
    remark: defaultTerms.content,
    attachments: [],
  };
}

function toPurchaseOrder(source: Partial<PurchaseOrder>): PurchaseOrder {
  const sourceRequisitions = Array.from(new Set([
    ...(source.sourceRequisitions ?? []),
    source.sourceRequisition,
    ...(source.products ?? []).map((line) => line.sourceRequisition),
    ...(source.products ?? []).flatMap((line) => (line.sourceAllocations ?? []).map((allocation) => allocation.requisitionCode)),
  ].filter((code): code is string => Boolean(code))));
  const order = {
    ...createEmptyOrder(),
    ...source,
    products: source.products?.length
      ? source.products.map((product) => {
          const priceInputMode = product.priceInputMode || normalizeTaxMode(source.taxMode);
          const snapshotUnitPrice = priceInputMode === '不含税' ? product.netUnitPrice : product.grossUnitPrice;
          const inputUnitPrice = String(product.unitPrice ?? '').trim() || String(snapshotUnitPrice ?? '').trim();
          return {
            ...createEmptyLine(),
            ...product,
            priceInputMode,
            unitPrice: inputUnitPrice ? formatCurrencyInput(parseNumber(inputUnitPrice)) : '',
            taxRate: product.taxRate || (source.taxRate !== '多税率' ? source.taxRate : '') || '13%',
          };
        })
      : [createEmptyLine()],
    attachments: source.attachments ?? [],
    sourceRequisition: sourceRequisitions[0] ?? '',
    sourceRequisitions,
  };
  return {
    ...order,
    purchaseType: '物料采购',
    deliveryMethod: normalizePurchaseDeliveryMethod(order.deliveryMethod),
    paymentMethod: normalizePurchasePaymentMethod(order.paymentMethod),
  };
}

const orderDraft = ref<PurchaseOrder | null>(createEmptyOrder());
const purchaseStagingWarehouseCount = ref(0);
const purchaseStagingWarehouseError = ref('');
const purchaseStagingWarehouseLoading = ref(true);
const flowRecords = ref<FlowRecord[]>([]);
const purchasePriceSourceRows = ref<PurchaseOrder[]>([]);
let purchaseStagingWarehouseLoadRequestId = 0;

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value === 'purchase-order-new');
const isEdit = computed(() => mode.value === 'purchase-order-edit');
const isPurchaseFollowUpView = computed(() => mode.value === 'purchase-order-follow-up');
const isDetail = computed(() => (
  mode.value === 'purchase-order-detail'
  || isPurchaseFollowUpView.value
));
const orderStatus = computed(() => orderDraft.value?.status ?? '');
const purchaseDocumentStatus = computed(() => {
  const status = orderStatus.value;
  if (status === '草稿') return '草稿';
  if (['已作废', '已退回', '已驳回', '已中断', '已取消'].includes(status)) return '已作废';
  if (['已完成', '已关闭'].includes(status)) return '已关闭';
  return '已确认';
});
const isLocked = computed(() => ['已完成', '已关闭', '已作废'].includes(orderStatus.value));
const isChangeMode = computed(() => isEdit.value && !isLocked.value && orderStatus.value !== '草稿');
const hasPurchaseOrderDownstreamFacts = computed(() => (
  orderDraft.value?.relatedDocuments?.some((document) => document.type !== '采购申请') ?? false
));
const canModifyOrderContent = computed(() => (
  canWritePurchase.value
  && (
    !isChangeMode.value
    || (canApprovePurchase.value && !hasPurchaseOrderDownstreamFacts.value)
  )
));
const isReadOnly = computed(() => isDetail.value || isLocked.value || !canModifyOrderContent.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(orderDraft, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const isPurchaseStagingConfigurationBlocked = computed(() => (
  Boolean(purchaseStagingWarehouseError.value)
));
const sourceRequisitionDisplay = computed(() => {
  const sources = orderDraft.value?.sourceRequisitions ?? [];
  if (!sources.length) return orderDraft.value?.sourceRequisition || '';
  return sources.length === 1 ? sources[0] : `${sources[0]} 等 ${sources.length} 张`;
});

function purchaseLineSourceCodes(line: PurchaseOrderProduct) {
  return Array.from(new Set([
    ...(line.sourceAllocations ?? []).map((allocation) => allocation.requisitionCode),
    line.sourceRequisition,
  ].filter((code): code is string => Boolean(code))));
}

function purchaseLineSourceEntries(line: PurchaseOrderProduct) {
  if (line.sourceAllocations?.length) return line.sourceAllocations;
  if (!line.sourceRequisition) return [];
  return [{
    requisitionCode: line.sourceRequisition,
    sourceLineId: line.sourceLineId || '',
    quantity: Number(String(line.qty || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || 0),
    unit: line.uom || '',
    expectedDate: '',
  }];
}

function purchaseLineSourceSummary(line: PurchaseOrderProduct) {
  const allocations = line.sourceAllocations ?? [];
  if (allocations.length) {
    const requisitionCount = new Set(allocations.map((allocation) => allocation.requisitionCode)).size;
    return `${requisitionCount} 张需求单 · ${allocations.length} 条需求`;
  }
  return line.sourceRequisition
    ? `${line.sourceRequisition}${line.sourceLineId ? ` · ${line.sourceLineId}` : ''}`
    : '';
}

function purchaseLineSourceAllocatedQty(line: PurchaseOrderProduct) {
  return purchaseLineSourceEntries(line).reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
}

function purchaseLineStockSupplementQty(line: PurchaseOrderProduct) {
  return Math.max(0, parseNumber(line.qty) - purchaseLineSourceAllocatedQty(line));
}
const editActionLabel = computed(() => (orderStatus.value === '草稿' ? '编辑' : '变更'));
const saveActionLabel = computed(() => (isChangeMode.value ? '保存变更' : '保存草稿'));
const saveActionTitle = computed(() => saveOrderReadonlyReason.value || `保存草稿，确认前可继续调整${documentTitle.value}。`);
const confirmActionLabel = computed(() => (isChangeMode.value ? '提交变更' : '确认'));
const canEditOrderContent = computed(() => (
  !isLocked.value
  && canWritePurchase.value
  && (
    orderStatus.value === '草稿'
    || (canApprovePurchase.value && !hasPurchaseOrderDownstreamFacts.value)
  )
));
const canStartAfterSale = computed(() =>
  isDetail.value &&
  Boolean(orderDraft.value?.code && orderDraft.value.code !== '系统自动生成') &&
  !['草稿', '已作废', '已取消', '已驳回', '已中断'].includes(orderStatus.value),
);
const canDeleteDraftOrder = computed(
  () =>
    !isNew.value &&
    canWritePurchase.value &&
    orderStatus.value === '草稿' &&
    Boolean(orderDraft.value?.code) &&
    orderDraft.value?.code !== '系统自动生成',
);
const referenceTitle = computed(() => `${documentTitle.value} ${orderDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${orderDraft.value?.supplier || '未选择供应商'} · ${purchaseDocumentStatus.value}`);
const referencePath = computed(() => {
  if (!orderDraft.value?.code) return '';
  return orderDetailPath(orderDraft.value.code, false);
});
const saveOrderReadonlyReason = computed(() => {
  if (!canWritePurchase.value) return purchaseReadonlyReason.value;
  if (isPurchaseStagingConfigurationBlocked.value) return `${purchaseStagingWarehouseError.value} 采购订单不能保存，请先维护仓库职能。`;
  if (hasPurchaseOrderDownstreamFacts.value) return `当前${documentTitle.value}已形成下游单据，采购内容已冻结。`;
  if (isChangeMode.value && !canApprovePurchase.value) return purchaseApproveReadonlyReason.value;
  return '';
});
const attachmentReadonlyReason = computed(() => {
  if (!isReadOnly.value) return '';
  if (!canWritePurchase.value) return purchaseReadonlyReason.value;
  if (isLocked.value) return `当前${documentTitle.value}已锁定，不能上传附件。`;
  if (isChangeMode.value && !canApprovePurchase.value) return purchaseApproveReadonlyReason.value;
  if (isDetail.value) return `当前${documentTitle.value}详情只读，不能上传附件。`;
  return saveOrderReadonlyReason.value;
});
const purchaseAttachmentTitle = computed(() => attachmentReadonlyReason.value || `上传${documentTitle.value}合同、供应商回签、报价单等文件`);
const canConfirmOrder = computed(() => canWritePurchase.value && canApprovePurchase.value);
const confirmOrderReadonlyReason = computed(() => {
  if (!canWritePurchase.value) return purchaseReadonlyReason.value;
  if (!canApprovePurchase.value) return purchaseApproveReadonlyReason.value;
  return '';
});
const operationPermissionHint = computed(() => (
  canWritePurchase.value && !canApprovePurchase.value ? purchaseApproveReadonlyReason.value : ''
));
const operationPermissionSuffix = '确认采购、采购变更和异常处理会保持不可用。';
const pageHeading = computed(() => {
  if (isNew.value) return `新建${documentTitle.value}`;
  if (isLocked.value) return `${documentTitle.value}只读`;
  if (isEdit.value) return isChangeMode.value ? `${documentTitle.value}变更` : `编辑${documentTitle.value}`;
  return `${documentTitle.value}详情`;
});

function purchaseOrderNextStepLabel(status: string) {
  if (status === '草稿') return `确认${documentTitle.value}`;
  if (['已确认', '待入库'].includes(status)) return '等待供应商到货';
  if (status === '待质检') return '跟进来料质检';
  if (status === '部分入库') return '跟进剩余到货';
  if (status === '已入库') return '跟进供应商开票';
  if (status === '待开票') return '跟进供应商开票';
  if (status === '待付款') return '跟进付款';
  if (status === '已完成') return '归档复盘';
  if (['已作废', '已驳回', '已中断', '已取消'].includes(status)) return '查看日志';
  return '确认采购状态';
}

function purchaseOrderNextStepAction(status: string, label = '') {
  const step = label || purchaseOrderNextStepLabel(status);
  if (step === '关闭采购订单') return '关闭';
  if (['已完成', '已关闭'].includes(status)) return '复核关联单据';
  if (['已作废', '已驳回', '已中断', '已取消'].includes(status)) return '查看日志';
  if (/质量|质检/.test(step) || status === '待质检') return '等待质检处理';
  if (/到货/.test(step)) return '联系供应商';
  if (/开票|发票|收票/.test(step) || ['已入库', '待开票'].includes(status)) return '跟进供应商开票';
  if (/付款/.test(step) || status === '待付款') return '登记付款进度';
  if (/收货|入库/.test(step) || ['已确认', '待入库', '部分入库'].includes(status)) return '等待仓库处理';
  if (/开票|发票|收票/.test(step) || ['已入库', '待开票'].includes(status)) return '登记收票进度';
  if (/付款/.test(step) || status === '待付款') return '登记付款进度';
  return purchaseOrderNextStepLabel(status);
}

function purchaseOrderActionDescription(label: string, status: string) {
  if (['已完成', '已关闭'].includes(status)) return '采购到货与结算已完成，可通过关联单据复核。';
  if (/质量|质检/.test(label)) return '质检岗位完成判定后，结果会自动更新到采购跟进。';
  if (/到货/.test(label)) return '采购负责跟催供应商交期；实际收货、质检和入库由对应岗位记录。';
  if (/收货|入库/.test(label)) return '仓库完成收货与入库后，数量进度会自动回写。';
  if (/开票|发票|收票/.test(label)) return '采购跟进供应商开票安排，并在本单登记实际收票日期、金额和备注。';
  if (/付款/.test(label)) return '采购根据实际付款结果在本单登记进度并协调供应商。';
  return '请由当前责任人完成该环节，相关进度在右侧分别跟踪。';
}

const purchaseOrderNextStepPath = computed(() => {
  const factStep = orderDraft.value?.progressFacts?.nextStep || '';
  if (/开票|发票|收票|付款/.test(factStep)) return { path: route.path, hash: '#commercial-follow-up' };
  return '';
});

const purchaseOrderNextStepGuidance = computed(() => {
  const status = orderStatus.value;
  if (status === '草稿') {
    return {
      label: `确认${documentTitle.value}`,
      action: missingRequiredFields.value.length ? '完善' : confirmActionLabel.value,
      description: missingRequiredFields.value.length ? missingRequiredSummary.value : `关键字段已齐，可以确认${documentTitle.value}。`,
      tone: 'pending',
    };
  }
  const done = ['已完成', '已关闭'].includes(status);
  const stopped = ['已作废', '已驳回', '已中断', '已取消'].includes(status);
  const facts = orderDraft.value?.progressFacts;
  const factLabel = facts?.nextStep || purchaseOrderNextStepLabel(status);
  const label = factLabel;
  return {
    label,
    action: purchaseOrderNextStepAction(status, label),
    description: stopped
      ? `${documentTitle.value}已停止流转，完整原因和处理记录通过日志查看。`
      : purchaseOrderActionDescription(label, status),
    tone: done ? 'done' : stopped ? 'muted' : 'tracking',
  };
});

type PurchaseMoreAction = {
  key: 'afterSale' | 'delete' | 'edit';
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  tone?: 'default' | 'danger';
};

const purchaseMoreActions = computed<PurchaseMoreAction[]>(() => {
  if (!isDetail.value) return [];
  const actions: PurchaseMoreAction[] = [];
  if (canEditOrderContent.value) {
    actions.push({
      key: 'edit',
      label: editActionLabel.value,
      description: orderStatus.value === '草稿' ? `直接调整${documentTitle.value}草稿。` : `调整${documentTitle.value}内容，并保留变更记录。`,
    });
  }
  if (canStartAfterSale.value) {
    actions.push({ key: 'afterSale', label: '售后', description: '进入采购售后处理入口。' });
  }
  if (canDeleteDraftOrder.value) {
    actions.push({
      key: 'delete',
      label: '删除草稿',
      description: `删除未确认的${documentTitle.value}草稿。`,
      disabled: isSaving.value,
      disabledReason: `正在处理${documentTitle.value}，请稍后再试。`,
      tone: 'danger',
    });
  }
  return actions;
});

async function handlePurchaseMoreAction(action: PurchaseMoreAction) {
  if (action.disabled || !orderDraft.value) return;
  purchaseMoreActionsOpen.value = false;
  if (action.key === 'afterSale') {
    startPurchaseAfterSale();
    return;
  }
  if (action.key === 'delete') {
    await deleteDraftOrder();
    return;
  }
  await router.push(orderDetailPath(orderDraft.value.code, true));
}

const selectedTermsTemplate = computed(
  () => termsTemplates.value.find((template) => template.key === selectedTermsTemplateKey.value) ?? termsTemplates.value[0],
);
const canDeleteTermsTemplate = computed(
  () =>
    !isReadOnly.value &&
    termsTemplates.value.length > 1 &&
    termsTemplates.value.some((template) => template.key === termsTemplateDraft.value.key),
);
const canManageTermsTemplate = computed(() => !isReadOnly.value);
const termsTemplateReadonlyReason = computed(() =>
  canWritePurchase.value ? `当前${documentTitle.value}只读，不能维护条款模板。` : purchaseReadonlyReason.value,
);
const attachments = computed(() => orderDraft.value?.attachments ?? []);
const lineItems = computed(() =>
  (orderDraft.value?.products ?? []).map((product, index) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image:
      (product.name && purchaseMaterialVisuals[product.name]) || {
        label: product.imageLabel || '',
        tone: product.imageTone || '#eeeeee',
      },
  })),
);
const hasIncomingQc = computed(() => lineItems.value.some((item) => item.qcRequired));
const purchaseProgressRows = computed(() => {
  const facts = orderDraft.value?.progressFacts;
  if (facts) {
    const attentionRows = facts.attention && facts.attention !== '正常'
      ? [{ key: 'attention', label: '提醒/异常', value: facts.attention }]
      : [];
    return [
      { key: 'arrival', label: '到货进度', value: facts.arrival },
      { key: 'quality', label: '质检进度', value: facts.quality },
      { key: 'inbound', label: '入库进度', value: facts.inbound },
      { key: 'invoice', label: '收票进度', value: facts.invoice },
      { key: 'payment', label: '付款进度', value: facts.payment },
      ...attentionRows,
    ];
  }
  const status = orderStatus.value;
  const isDraftOrder = purchaseDocumentStatus.value === '草稿';
  const isClosedOrder = purchaseDocumentStatus.value === '已关闭';
  const hasArrived = !['草稿', '已确认', '待入库'].includes(status);
  const isInboundComplete = ['已入库', '待开票', '待付款', '已完成', '已关闭'].includes(status);

  const arrivalProgress = isDraftOrder ? '未开始' : hasArrived ? '已到货' : '待到货';
  const qualityProgress = (() => {
    if (!hasIncomingQc.value) return '免检';
    if (!hasArrived) return '未开始';
    if (status === '待质检') return '待质检';
    if (status === '质检不合格') return '不合格处理';
    return '已放行';
  })();
  const inboundProgress = status === '部分入库' ? '部分入库' : isInboundComplete ? '已入库' : '未入库';
  const invoiceProgress = ['已入库', '待开票'].includes(status)
    ? '待开票'
    : ['待付款', '已完成', '已关闭'].includes(status) ? '已开票' : '未到开票';
  const paymentProgress = status === '待付款' ? '待付款' : isClosedOrder ? '已付款' : '未到付款';
  const stopped = ['已作废', '已退回', '已驳回', '已中断', '已取消'].includes(status);
  const attention = stopped ? '已停止' : status === '质检不合格' ? '质量异常' : '正常';

  return [
    { key: 'arrival', label: '到货进度', value: arrivalProgress },
    { key: 'quality', label: '质检进度', value: qualityProgress },
    { key: 'inbound', label: '入库进度', value: inboundProgress },
    { key: 'invoice', label: '收票进度', value: invoiceProgress },
    { key: 'payment', label: '付款进度', value: paymentProgress },
    ...(attention !== '正常' ? [{ key: 'attention', label: '提醒/异常', value: attention }] : []),
  ];
});
type PurchaseProgressFactLine = NonNullable<NonNullable<PurchaseOrder['progressFacts']>['lines']>[number];
type PurchaseProgressLine = PurchaseProgressFactLine & {
  material: Pick<PurchaseOrderProduct, 'name' | 'materialCode' | 'model' | 'spec' | 'imageLabel' | 'imageTone'>;
  image: { label: string; tone: string };
};
const purchaseProgressLineRows = computed<PurchaseProgressLine[]>(() => (
  (orderDraft.value?.progressFacts?.lines || []).map((line) => {
    const product = (orderDraft.value?.products || []).find((candidate) => (
      Boolean(line.lineId && candidate.lineId === line.lineId)
      || Boolean(line.materialCode && candidate.materialCode === line.materialCode)
      || Boolean(line.name && candidate.name === line.name)
    ));
    const material = product || {
      name: line.name,
      materialCode: line.materialCode,
      model: '',
      spec: '',
      imageLabel: '',
      imageTone: '',
    };

    return {
      ...line,
      material,
      image:
        (material.name && purchaseMaterialVisuals[material.name]) || {
          label: material.imageLabel || '',
          tone: material.imageTone || '#eeeeee',
        },
    };
  })
));
const purchaseReceiptRemainderLines = computed(() => (
  purchaseProgressLineRows.value.filter((line) => Number(line.remainingQty || 0) > 0.0001)
));
const canCloseReceiptRemainder = computed(() => (
  isDetail.value
  && orderStatus.value === '已确认'
  && canConfirmOrder.value
  && purchaseReceiptRemainderLines.value.length > 0
  && purchaseProgressLineRows.value.some((line) => Number(line.arrivedQty || 0) > 0.0001)
));

function purchaseProgressLineStatus(line: PurchaseProgressLine) {
  const targetQty = Number(line.receiptTargetQty ?? line.orderedQty);
  if (targetQty >= 0 && line.inboundQty + 0.0001 >= targetQty) {
    return line.closedQty > 0 ? '按实收入库' : '已入库';
  }
  if (line.rejectedQty > 0) return '存在不合格';
  if (line.pendingQcQty > 0) return '待质检';
  if (line.arrivedQty > 0 && line.arrivedQty + 0.0001 < targetQty) return '部分到货';
  if (line.arrivedQty > 0 && line.inboundQty + 0.0001 < line.arrivedQty) return '待入库';
  return '待到货';
}

function purchaseProgressLineStatusClass(line: PurchaseProgressLine) {
  const status = purchaseProgressLineStatus(line);
  if (['已入库', '按实收入库'].includes(status)) return 'status-done';
  if (status === '存在不合格') return 'status-danger';
  if (status === '部分到货') return 'status-confirmed';
  return 'status-pending';
}

function purchaseProgressPercent(value: number, total: number) {
  if (total <= 0) return 100;
  return Math.min(100, Math.round((Number(value || 0) / total) * 100));
}

function purchaseProgressQty(value: number, unit: string) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unit}`;
}
const orderTotal = computed(() => {
  const pricing = (orderDraft.value?.products || []).reduce((result, product) => {
    const line = linePricing(product);
    result.netAmount += line.netAmount;
    result.taxAmount += line.taxAmount;
    result.grossAmount += line.grossAmount;
    return result;
  }, { netAmount: 0, taxAmount: 0, grossAmount: 0 });
  return {
    subtotal: formatMoney(roundCurrency(pricing.netAmount)),
    tax: formatMoney(roundCurrency(pricing.taxAmount)),
    total: formatMoney(roundCurrency(pricing.grossAmount)),
  };
});
type PurchaseOrderRequiredFieldKey =
  | 'company'
  | 'date'
  | 'supplier'
  | 'contact'
  | 'contactPhone'
  | 'products'
  | 'expectedDate'
  | 'warehouse'
  | 'receivingAddress'
  | 'receivingContact'
  | 'receivingPhone'
  | 'deliveryMethod'
  | 'paymentMethod'
  | 'freightPayer';
const orderRequiredFields = computed<Array<{ key: PurchaseOrderRequiredFieldKey; label: string; done: boolean }>>(() => {
  const draft = orderDraft.value ?? createEmptyOrder();
  const lineKeys = draft.products.map((product) => (
    product.sourceAllocations?.length
      ? product.sourceAllocations.map((allocation) => `${allocation.requisitionCode}:${allocation.sourceLineId}`).sort().join('|')
      : product.sourceRequisition && product.sourceLineId
      ? `${product.sourceRequisition}:${product.sourceLineId}`
      : product.materialCode || product.name.trim()
  )).filter(Boolean);
  const hasCompleteLine = draft.products.length > 0
    && draft.products.every(
      (product) => (
        productIdentity(product, '').trim()
        && parseNumber(product.qty) > 0
        && parseNumber(product.unitPrice) > 0
        && purchaseTaxRateOptions.includes(product.taxRate || '')
      ),
    )
    && new Set(lineKeys).size === lineKeys.length;
  return [
    { key: 'company', label: '公司', done: Boolean(draft.company || draft.companyCode) },
    { key: 'supplier', label: '供应商', done: Boolean(draft.supplier || draft.supplierCode) },
    { key: 'contact', label: '联系人', done: Boolean(draft.contact) },
    { key: 'contactPhone', label: '联系方式', done: Boolean(draft.contactPhone) },
    { key: 'date', label: '下单日期', done: Boolean(draft.date) },
    { key: 'products', label: '物料明细', done: hasCompleteLine },
    { key: 'expectedDate', label: '预计到货', done: Boolean(draft.expectedDate) && (!draft.date || draft.expectedDate >= draft.date) },
    { key: 'warehouse', label: '收货仓库', done: Boolean(draft.warehouse || draft.warehouseCode) },
    { key: 'receivingAddress', label: '收货地址', done: Boolean(draft.receivingAddress) },
    { key: 'receivingContact', label: '收货联系人', done: Boolean(draft.receivingContact) },
    { key: 'receivingPhone', label: '收货联系方式', done: Boolean(draft.receivingPhone) },
    { key: 'deliveryMethod', label: '交付方式', done: Boolean(draft.deliveryMethod) },
    { key: 'paymentMethod', label: '付款方式', done: Boolean(draft.paymentMethod) },
    { key: 'freightPayer', label: '运费承担', done: Boolean(draft.freightPayer) },
  ];
});
const missingRequiredFields = computed(() => orderRequiredFields.value.filter((field) => !field.done));
const showCompleteOrderInDetail = computed(() => (
  isDetail.value
  && orderStatus.value === '草稿'
  && missingRequiredFields.value.length > 0
));
const showConfirmOrderInDetail = computed(() => (
  isDetail.value
  && orderStatus.value === '草稿'
  && missingRequiredFields.value.length === 0
));
const canCloseOrder = computed(() => (
  isDetail.value
  && orderDraft.value?.progressFacts?.nextStep === '关闭采购订单'
  && canConfirmOrder.value
));
const missingRequiredSummary = computed(() => {
  const labels = missingRequiredFields.value.map((field) => field.label);
  return labels.length ? `请先补齐：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '等' : ''}` : `关键字段已齐，可以确认${documentTitle.value}。`;
});
const canRunConfirmOrder = computed(() => canConfirmOrder.value);
const confirmOrderActionTitle = computed(() => {
  if (!canConfirmOrder.value) return confirmOrderReadonlyReason.value;
  if (missingRequiredFields.value.length) return missingRequiredSummary.value;
  return isChangeMode.value
    ? `提交${documentTitle.value}变更，保存后返回详情并保留变更记录。`
    : `确认${documentTitle.value}，锁定当前采购内容并进入到货、质检和入库跟进。`;
});
function parseNumber(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function isRequiredFieldMissing(key: PurchaseOrderRequiredFieldKey) {
  return missingRequiredFields.value.some((field) => field.key === key);
}

function requiredFieldClass(key: PurchaseOrderRequiredFieldKey) {
  return {
    'is-required-field': true,
    'has-field-error': orderValidationAttempted.value && isRequiredFieldMissing(key),
  };
}

function requiredLineProductClass(product: PurchaseOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && !productIdentity(product, '').trim(),
  };
}

function requiredLineQtyClass(product: PurchaseOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && parseNumber(product.qty) <= 0,
  };
}

function requiredLinePriceClass(product: PurchaseOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && parseNumber(product.unitPrice) <= 0,
  };
}

function requiredLineTaxRateClass(product: PurchaseOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && !purchaseTaxRateOptions.includes(product.taxRate || ''),
  };
}

function scrollToFirstMissingField() {
  const key = missingRequiredFields.value[0]?.key;
  if (!key) return;

  const target = document.querySelector(`[data-required-field="${key}"]`) as HTMLElement | null;
  const focusTarget = target?.querySelector('button, input, select, textarea') as HTMLElement | null;
  scrollElementIntoView(target);
  focusTarget?.focus();
}

function formatMoney(value: number) {
  return `￥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function roundCurrency(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function lineInputMode(product: PurchaseOrderProduct) {
  if (product.priceInputMode === '不含税' || product.priceInputMode === '含税') return product.priceInputMode;
  return normalizeTaxMode(orderDraft.value?.taxMode);
}

function linePricing(product: PurchaseOrderProduct) {
  const qty = parseNumber(product.qty);
  const inputUnitPrice = parseNumber(product.unitPrice);
  const rate = taxRateValue(product.taxRate);
  const priceInputMode = lineInputMode(product);
  const netUnitPrice = priceInputMode === '不含税' ? inputUnitPrice : inputUnitPrice / (1 + rate);
  const grossUnitPrice = priceInputMode === '不含税' ? inputUnitPrice * (1 + rate) : inputUnitPrice;
  const netAmount = roundCurrency(qty * netUnitPrice);
  const grossAmount = roundCurrency(qty * grossUnitPrice);
  return {
    netUnitPrice,
    grossUnitPrice,
    netAmount,
    taxAmount: roundCurrency(grossAmount - netAmount),
    grossAmount,
  };
}

function formatCurrencyInput(value: number) {
  return Number(value || 0).toFixed(2);
}

function formatCalculatedUnitPrice(value: number) {
  const fixed = Number(value || 0).toFixed(4);
  return fixed.replace(/(\.\d{2})0+$/, '$1');
}

function lineUnitPriceValue(product: PurchaseOrderProduct, mode: '含税' | '不含税') {
  const rawInput = String(product.unitPrice ?? '');
  if (!rawInput.trim()) return '';
  if (lineInputMode(product) === mode) return rawInput;
  const pricing = linePricing(product);
  return formatCalculatedUnitPrice(mode === '含税' ? pricing.grossUnitPrice : pricing.netUnitPrice);
}

function updateLineUnitPrice(product: PurchaseOrderProduct, mode: '含税' | '不含税', event: Event) {
  product.priceInputMode = mode;
  product.unitPrice = (event.target as HTMLInputElement).value;
}

function normalizeLineUnitPrice(product: PurchaseOrderProduct) {
  if (!String(product.unitPrice ?? '').trim()) return;
  product.unitPrice = formatCurrencyInput(parseNumber(product.unitPrice));
}

function lineUnitPriceTitle(product: PurchaseOrderProduct, mode: '含税' | '不含税') {
  if (lineInputMode(product) === mode) return `当前直接输入${mode === '含税' ? '含税' : '未税'}单价`;
  return '按税率自动换算；必要时保留 4 位小数，以保证行金额计算准确';
}

function formatLineUnitPrice(product: PurchaseOrderProduct, mode: '含税' | '不含税') {
  if (!String(product.unitPrice ?? '').trim()) return '—';
  const pricing = linePricing(product);
  return formatMoney(mode === '含税' ? pricing.grossUnitPrice : pricing.netUnitPrice);
}

function normalizeTaxMode(value?: string): TermsTemplate['taxMode'] {
  return value === '不含税' ? '不含税' : '含税';
}

function normalizePurchaseDeliveryMethod(value?: string) {
  const legacyMap: Record<string, string> = {
    送货到厂: '供应商送货',
    物流发运: '物流配送',
    专车配送: '物流配送',
    快递: '快递快运',
  };
  const normalized = legacyMap[value ?? ''] || value || '供应商送货';
  return purchaseDeliveryMethodOptions.includes(normalized) ? normalized : '供应商送货';
}

function normalizePurchasePaymentMethod(value?: string) {
  const legacyMap: Record<string, string> = {
    '预付 30%': '预付款 30%',
  };
  const normalized = legacyMap[value ?? ''] || value || '月结 30 天';
  return purchasePaymentMethodOptions.includes(normalized) ? normalized : '月结 30 天';
}

function formatLineAmount(product: PurchaseOrderProduct) {
  return formatMoney(linePricing(product).grossAmount);
}

function formatPriceValue(value?: string) {
  const raw = String(value ?? '').trim();
  const matched = raw.match(/-?\d+(?:\.\d+)?/);
  return matched ? formatMoney(Number(matched[0])) : raw || '';
}

function purchasePriceKey(product: { materialCode?: string; name: string }) {
  return product.materialCode || product.name || '';
}

function isPurchasePriceRecordOrder(order: PurchaseOrder) {
  return !['草稿', '已作废', '已取消'].includes(order.status);
}

function matchesPriceRecord(record: PurchasePriceReference, product: PurchaseOrderProduct) {
  if (record.materialCode && product.materialCode) return record.materialCode === product.materialCode;
  return Boolean(product.name && record.materialName === product.name);
}

const purchasePriceReferenceRows = computed<PurchasePriceReference[]>(() => {
  const currentCode = orderDraft.value?.code;

  return purchasePriceSourceRows.value.flatMap((order) => {
    if (!isPurchasePriceRecordOrder(order) || order.code === currentCode) return [];

    return order.products
      .filter((product) => product.name && (product.grossUnitPrice || product.unitPrice))
      .map((product) => ({
        materialCode: product.materialCode || '',
        materialName: product.name,
        material: productIdentity(product, '-'),
        supplier: order.supplier,
        contact: order.contact,
        latestPrice: formatPriceValue(product.grossUnitPrice || product.unitPrice),
        quantity: product.qty,
        sourceDoc: order.code,
        owner: order.owner,
        updatedAt: order.date,
      }));
  });
});

function latestPurchasePriceReferenceFor(product: PurchaseOrderProduct) {
  return purchasePriceReferenceRows.value
    .filter((record) => matchesPriceRecord(record, product))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.sourceDoc.localeCompare(a.sourceDoc))[0];
}

const orderPriceReferenceRows = computed(() =>
  (orderDraft.value?.products ?? [])
    .filter((product) => productIdentity(product, '').trim())
    .map((product, index) => {
      const reference = latestPurchasePriceReferenceFor(product);

      return {
        key: `${purchasePriceKey(product) || index}-${index}`,
        material: product,
        image:
          (product.name && purchaseMaterialVisuals[product.name]) || {
            label: product.imageLabel || '',
            tone: product.imageTone || '#eeeeee',
          },
        referencePrice: reference?.latestPrice || '暂无记录',
        referenceMeta: reference
          ? `${reference.supplier}${reference.contact ? ` · ${reference.contact}` : ''} · ${reference.sourceDoc} · ${reference.updatedAt}`
          : '本单之前没有其他已确认采购记录',
        quantity: reference?.quantity || '',
      };
    }),
);

const priceReferenceSummary = computed(() => {
  const rows = orderPriceReferenceRows.value;
  if (!rows.length) return '选择物料后显示采购价格记录中的最近采购价。';
  if (rows.every((row) => row.referencePrice === '暂无记录')) return '本单之前暂无历史采购价，可按供应商报价录入。';
  return '最近采购价来自采购价格记录，用于核对本次采购报价。';
});
function updateLine(index: number, patch: Partial<PurchaseOrderProduct>) {
  if (!orderDraft.value) return;
  orderDraft.value.products[index] = {
    ...orderDraft.value.products[index],
    ...patch,
  };
}

function addLine() {
  orderDraft.value?.products.push(createEmptyLine());
}

function removeLine(index: number) {
  if (!orderDraft.value || orderDraft.value.products.length <= 1) return;
  orderDraft.value.products.splice(index, 1);
}

function handleSupplierSelect(option: ReferenceOption) {
  if (!orderDraft.value) return;
  if (!option.code && !option.name) {
    orderDraft.value.supplierCode = '';
    orderDraft.value.supplier = '';
    orderDraft.value.contact = '';
    orderDraft.value.contactPhone = '';
    return;
  }
  const supplier = option.raw as SupplierReference;
  orderDraft.value.supplierCode = supplier.code;
  orderDraft.value.supplier = supplier.name;
  orderDraft.value.contact = supplier.contact || '';
  orderDraft.value.contactPhone = supplier.phone || '';
  orderDraft.value.paymentMethod = normalizePurchasePaymentMethod(supplier.paymentMethod || orderDraft.value.paymentMethod);
  orderDraft.value.deliveryMethod = normalizePurchaseDeliveryMethod(supplier.deliveryMethod || orderDraft.value.deliveryMethod);
}

function handleCompanySelect(option: ReferenceOption) {
  if (!orderDraft.value) return;
  const companyChanged = Boolean(orderDraft.value.company && orderDraft.value.company !== option.name);
  orderDraft.value.companyCode = option.code;
  orderDraft.value.company = option.name;
  if (companyChanged) {
    orderDraft.value.warehouseCode = '';
    orderDraft.value.warehouse = '';
    orderDraft.value.receivingAddress = '';
    orderDraft.value.receivingContact = '';
    orderDraft.value.receivingPhone = '';
  }
  void loadPurchaseStagingWarehouses();
}

function handleProductSelect(index: number, option: ReferenceOption) {
  if (!option.code && !option.name) {
    if (orderDraft.value) orderDraft.value.products[index] = createEmptyLine();
    return;
  }
  const material = option.raw as MaterialReference;
  const qualityRule = incomingQualityRule(material);
  updateLine(index, {
    sourceRequisition: '',
    sourceLineId: '',
    sourceAllocations: [],
    materialCode: material.code,
    name: material.name,
    model: material.model || '',
    spec: material.spec || '',
    qty: orderDraft.value?.products[index]?.qty || `1 ${material.uom || '件'}`,
    priceInputMode: '含税',
    unitPrice: material.latestPrice || '',
    amount: '',
    taxRate: orderDraft.value?.products[index]?.taxRate || '13%',
    qcRequired: incomingQualityRequired(qualityRule),
    incomingQualityControl: qualityRule,
    uom: material.uom || '',
    imageLabel: material.imageLabel || '',
    imageTone: material.imageTone || '',
  });
}

function handleWarehouseSelect(option: ReferenceOption) {
  if (!orderDraft.value) return;
  if (!option.code && !option.name) {
    orderDraft.value.warehouseCode = '';
    orderDraft.value.warehouse = '';
    orderDraft.value.receivingAddress = '';
    orderDraft.value.receivingContact = '';
    return;
  }
  const warehouse = option.raw as WarehouseReference;
  orderDraft.value.warehouseCode = warehouse.code;
  orderDraft.value.warehouse = warehouse.name;
  orderDraft.value.receivingAddress = warehouse.address || orderDraft.value.receivingAddress;
}

async function loadPurchaseStagingWarehouses() {
  const requestId = ++purchaseStagingWarehouseLoadRequestId;
  const draft = orderDraft.value;
  if (!draft) {
    purchaseStagingWarehouseCount.value = 0;
    purchaseStagingWarehouseError.value = '';
    purchaseStagingWarehouseLoading.value = false;
    return;
  }
  const company = draft.company;
  purchaseStagingWarehouseLoading.value = true;
  purchaseStagingWarehouseError.value = '';
  await nextTick();
  try {
    const response = await listReference('warehouses', {
      company,
      kind: '采购收货',
      activeOnly: true,
      limit: 50,
    });
    if (
      requestId !== purchaseStagingWarehouseLoadRequestId
      || !orderDraft.value
      || orderDraft.value.company !== company
    ) return;
    purchaseStagingWarehouseCount.value = response.items.length;
    purchaseStagingWarehouseError.value = response.items.length
      ? ''
      : `公司“${company || '-'}”尚未配置启用的采购暂存仓。`;
    if (
      response.items.length === 1
      && !orderDraft.value.warehouseCode
      && !orderDraft.value.warehouse
      && !isDetail.value
    ) {
      handleWarehouseSelect(response.items[0]);
    }
  } catch (error) {
    if (requestId !== purchaseStagingWarehouseLoadRequestId) return;
    purchaseStagingWarehouseCount.value = 0;
    purchaseStagingWarehouseError.value = error instanceof Error ? error.message : '采购暂存仓候选加载失败';
  } finally {
    if (requestId === purchaseStagingWarehouseLoadRequestId) {
      purchaseStagingWarehouseLoading.value = false;
    }
  }
}

function applyRequisition(requisition: PurchaseRequisition) {
  if (!orderDraft.value) return;
  if (!requisition.code) {
    orderDraft.value.sourceRequisition = '';
    orderDraft.value.sourceRequisitions = [];
    orderDraft.value.products = [createEmptyLine()];
    return;
  }
  if (requisition.conversionFacts?.status === '已转单') {
    orderDraft.value.sourceRequisition = '';
    orderDraft.value.sourceRequisitions = [];
    showToast(`${requisition.code} 已全部转单，不能重复处理`, 'error');
    return;
  }
  const currentSources = orderDraft.value.sourceRequisitions ?? [];
  const isAdditionalSource = currentSources.length > 0 && !currentSources.includes(requisition.code);
  const nextSources = Array.from(new Set([...currentSources, requisition.code]));
  const mappedProducts = requisition.products.flatMap((product, index) => {
    const sourceLineId = product.lineId || `L${index + 1}`;
    const conversionLine = requisition.conversionFacts?.lines.find((line) => line.lineId === sourceLineId);
    if (conversionLine && conversionLine.remainingQty <= 0) return [];
    return [{
      lineId: '',
      sourceRequisition: requisition.code,
      sourceLineId,
      materialCode: product.materialCode || '',
      name: product.name || '',
      model: product.model || '',
      spec: product.spec || '',
      qty: conversionLine ? String(conversionLine.remainingQty) : product.qty || '',
      priceInputMode: '含税' as const,
      unitPrice: '',
      amount: '',
      taxRate: '13%',
      qcRequired: Boolean(product.qcRequired),
      uom: product.uom || '',
      imageLabel: product.imageLabel || '',
      imageTone: product.imageTone || '',
    }];
  });
  if (!mappedProducts.length) {
    showToast(`${requisition.code} 已无可转采购数量`, 'error');
    return;
  }

  orderDraft.value.purchaseType = '物料采购';
  if (!isAdditionalSource) {
    if (requisition.company) orderDraft.value.company = requisition.company;
    if (requisition.companyCode) orderDraft.value.companyCode = requisition.companyCode;
    orderDraft.value.remark = requisition.reason || orderDraft.value.remark;
  }
  orderDraft.value.sourceRequisitions = nextSources;
  orderDraft.value.sourceRequisition = nextSources[0] || requisition.code;
  if (requisition.expectedDate) {
    orderDraft.value.expectedDate = isAdditionalSource
      ? [orderDraft.value.expectedDate, requisition.expectedDate].filter(Boolean).sort()[0] || requisition.expectedDate
      : requisition.expectedDate;
  }
  if (requisition.products.length) {
    orderDraft.value.products = isAdditionalSource
      ? [
          ...orderDraft.value.products.filter((line) => productIdentity(line, '').trim()),
          ...mappedProducts,
        ]
      : mappedProducts;
  } else if (!isAdditionalSource) {
    orderDraft.value.products = [createEmptyLine()];
  }
}

function handleRequisitionSelect(option: ReferenceOption) {
  applyRequisition(option.raw as PurchaseRequisition);
}

async function loadSourceRequisition(code: string) {
  if (!code || !orderDraft.value) return;
  try {
    const response = await getPurchaseRequisition(code);
    applyRequisition(response.requisition);
  } catch {
    loadMessage.value = '没有找到来源采购需求或后端暂时不可用，请手工补充采购明细。';
  }
}

function buildOrderForSave(): PurchaseOrder {
  const draft = orderDraft.value ?? createEmptyOrder();
  const lineTaxRates = Array.from(new Set(draft.products.map((product) => product.taxRate).filter(Boolean)));
  return {
    ...draft,
    purchaseType: '物料采购',
    taxMode: '含税',
    taxRate: lineTaxRates.length === 1 ? lineTaxRates[0] : '多税率',
    amount: orderTotal.value.total,
    products: draft.products.map((product) => ({
      ...product,
      netUnitPrice: formatCalculatedUnitPrice(linePricing(product).netUnitPrice),
      grossUnitPrice: formatCalculatedUnitPrice(linePricing(product).grossUnitPrice),
      netAmount: formatMoney(linePricing(product).netAmount),
      taxAmount: formatMoney(linePricing(product).taxAmount),
      grossAmount: formatMoney(linePricing(product).grossAmount),
      amount: formatMoney(linePricing(product).grossAmount),
    })),
  };
}

async function loadOrder() {
  isLoading.value = true;
  loadMessage.value = '';
  if (!isNew.value) {
    orderDraft.value = null;
    flowRecords.value = [];
  }

  try {
    await loadPurchasePriceSources();

    if (isNew.value) {
      const defaultTemplate = termsTemplates.value.find((template) => template.key === 'standard') ?? termsTemplates.value[0];
      selectedTermsTemplateKey.value = defaultTemplate.key;
      activeTermsTemplateKey.value = defaultTemplate.key;
      termsTemplateDraft.value = { ...defaultTemplate };
      orderDraft.value = createEmptyOrder();
      flowRecords.value = [];
      const sourceRequisition = route.query.requisition?.toString() ?? '';
      if (sourceRequisition) {
        await loadSourceRequisition(sourceRequisition);
      }
      await loadPurchaseStagingWarehouses();
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    const response = await getPurchaseOrder(code);
    orderDraft.value = toPurchaseOrder(response.order);
    flowRecords.value = response.flowRecords;
    await loadPurchaseStagingWarehouses();
  } catch (error) {
    orderDraft.value = null;
    flowRecords.value = [];
    loadMessage.value = error instanceof Error ? error.message : `${documentTitle.value}加载失败`;
  } finally {
    isLoading.value = false;
  }
}

async function loadPurchasePriceSources() {
  try {
    purchasePriceSourceRows.value = await listPurchaseOrders();
  } catch {
    purchasePriceSourceRows.value = [];
  }
}

async function persistOrder(options: { showSuccess?: boolean } = {}) {
  if (!canModifyOrderContent.value || isPurchaseStagingConfigurationBlocked.value) {
    showToast(saveOrderReadonlyReason.value || purchaseReadonlyReason.value, 'error');
    return null;
  }
  if (!orderDraft.value) return null;
  isSaving.value = true;
  try {
    const response = await savePurchaseOrder(buildOrderForSave(), { changeMode: isChangeMode.value });
    orderDraft.value = toPurchaseOrder(response.order);
    flowRecords.value = response.flowRecords;
    resetUnsavedChanges();
    if (options.showSuccess !== false) {
      showToast(
        isChangeMode.value
          ? `${documentTitle.value}变更已保存`
          : missingRequiredFields.value.length
            ? `${documentTitle.value}草稿已保存，${missingRequiredSummary.value.replace('请先', '确认前请')}`
            : `${documentTitle.value}草稿已保存`,
      );
    }
    return response.order;
  } catch (error) {
    showToast(error instanceof Error ? error.message : `${documentTitle.value}保存失败`, 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveOrderDraft() {
  await runPurchaseAction('save', async () => {
    const saved = await persistOrder();
    if (!saved) return;
    if (isNew.value) await router.replace(orderDetailPath(saved.code, true));
  });
}

async function deleteDraftOrder() {
  if (!orderDraft.value || !canDeleteDraftOrder.value) {
    showToast(`只有未确认的${documentTitle.value}草稿可以删除`, 'error');
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: `删除${documentTitle.value}草稿 ${orderDraft.value.code}？`,
    message: '删除后不可恢复，尚未确认的采购内容及附件将一并移除。',
    confirmLabel: '确认删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  await runPurchaseAction('delete', async () => {
    isSaving.value = true;
    try {
      await deletePurchaseOrder(orderDraft.value!.code);
      resetUnsavedChanges();
      showToast(`${documentTitle.value}草稿已删除`);
      await router.replace(currentListPath());
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除草稿失败，请稍后重试', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function confirmOrderDraft() {
  orderValidationAttempted.value = true;

  if (!canConfirmOrder.value) {
    showToast(confirmOrderActionTitle.value, 'error');
    return;
  }

  if (missingRequiredFields.value.length) {
    showToast(missingRequiredSummary.value, 'error');
    scrollToFirstMissingField();
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: isChangeMode.value ? `提交${documentTitle.value}变更？` : `确认当前${documentTitle.value}？`,
    message: isChangeMode.value
      ? '系统将保存变更并返回只读详情，完整修改记录会保留在日志中。'
      : '系统将先保存当前内容，再锁定采购单并进入供应商交付、收货、质检与采购跟进流程。',
    confirmLabel: isChangeMode.value ? '提交变更' : '确认采购',
  });
  if (!confirmed) return;

  await runPurchaseAction('confirm', async () => {
    if (isChangeMode.value) {
      const saved = await persistOrder({ showSuccess: false });
      if (saved) {
        showToast(`${documentTitle.value}变更已提交`);
        await router.replace(orderDetailPath(saved.code));
      }
      return;
    }

    const saved = await persistOrder({ showSuccess: false });
    if (!saved) return;

    isSaving.value = true;
    try {
      const response = await confirmPurchaseOrder(saved.code);
      orderDraft.value = toPurchaseOrder(response.order);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast(`${documentTitle.value}已进入待到货`);
      await router.replace(orderDetailPath(response.order.code));
    } catch (error) {
      showToast(error instanceof Error ? error.message : `确认${documentTitle.value}失败`, 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function closeOrderDraft() {
  if (!orderDraft.value || !canCloseOrder.value) {
    showToast(`当前${documentTitle.value}尚未完成到货、质量、入库、收票和付款`, 'error');
    return;
  }

  await runPurchaseAction('close', async () => {
    isSaving.value = true;
    try {
      const response = await closePurchaseOrder(orderDraft.value!.code);
      orderDraft.value = toPurchaseOrder(response.order);
      flowRecords.value = response.flowRecords;
      showToast(`${documentTitle.value}已关闭`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : `关闭${documentTitle.value}失败`, 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function openReceiptRemainderDialog() {
  if (!canCloseReceiptRemainder.value) {
    showToast('只有已经发生部分到货且仍有待交余量的采购单，才能关闭待收余量。', 'error');
    return;
  }
  receiptRemainderDialogOpen.value = true;
}

async function submitReceiptRemainderClosure(reason: string) {
  if (!orderDraft.value || !canCloseReceiptRemainder.value) return;
  await runPurchaseAction('closeRemainder', async () => {
    isSaving.value = true;
    try {
      const response = await closePurchaseOrderReceiptRemainder(orderDraft.value!.code, reason);
      orderDraft.value = toPurchaseOrder(response.order);
      flowRecords.value = response.flowRecords;
      receiptRemainderDialogOpen.value = false;
      showToast('待收余量已关闭，仓库不会再收到对应待收货任务');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '关闭待收余量失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function editTermsTemplate(key = selectedTermsTemplateKey.value) {
  if (!canManageTermsTemplate.value) {
    showToast(termsTemplateReadonlyReason.value, 'error');
    return;
  }

  const template = termsTemplates.value.find((item) => item.key === key) ?? termsTemplates.value[0];
  if (!template) return;

  activeTermsTemplateKey.value = template.key;
  termsTemplateDraft.value = { ...template };
  termsTemplateNotice.value = '';
  termsTemplateDialogOpen.value = true;
}

function createTermsTemplate() {
  if (!canManageTermsTemplate.value) {
    termsTemplateNotice.value = termsTemplateReadonlyReason.value;
    return;
  }

  const source = selectedTermsTemplate.value;
  const key = `custom-${Date.now()}`;
  activeTermsTemplateKey.value = key;
  termsTemplateDraft.value = {
    key,
    name: '新采购条款模板',
    deliveryMethod: orderDraft.value?.deliveryMethod || source?.deliveryMethod || '',
    paymentMethod: orderDraft.value?.paymentMethod || source?.paymentMethod || '',
    taxMode: normalizeTaxMode(orderDraft.value?.taxMode || source?.taxMode),
    taxRate: orderDraft.value?.taxRate || source?.taxRate || '13%',
    freightPayer: orderDraft.value?.freightPayer || source?.freightPayer || '供方',
    content: orderDraft.value?.remark || source?.content || '',
  };
  termsTemplateNotice.value = '';
  termsTemplateDialogOpen.value = true;
}

function chooseTemplateForEditing(key: string) {
  const template = termsTemplates.value.find((item) => item.key === key);
  if (!template) return;

  activeTermsTemplateKey.value = key;
  termsTemplateDraft.value = { ...template };
  termsTemplateNotice.value = '';
}

function applySelectedTermsTemplate() {
  if (!orderDraft.value || isReadOnly.value) return;
  const template = selectedTermsTemplate.value;
  orderDraft.value.deliveryMethod = template.deliveryMethod;
  orderDraft.value.paymentMethod = template.paymentMethod;
  orderDraft.value.freightPayer = template.freightPayer || orderDraft.value.freightPayer || '供方';
  orderDraft.value.remark = template.content;
}

function saveTermsTemplate() {
  if (!canManageTermsTemplate.value) {
    termsTemplateNotice.value = termsTemplateReadonlyReason.value;
    return;
  }

  const nextTemplate = {
    ...termsTemplateDraft.value,
    name: termsTemplateDraft.value.name.trim() || '未命名采购条款',
    deliveryMethod: termsTemplateDraft.value.deliveryMethod.trim(),
    paymentMethod: termsTemplateDraft.value.paymentMethod.trim(),
    taxMode: termsTemplateDraft.value.taxMode,
    taxRate: termsTemplateDraft.value.taxRate || '13%',
    freightPayer: termsTemplateDraft.value.freightPayer || '供方',
    content: termsTemplateDraft.value.content.trim(),
  };
  const currentIndex = termsTemplates.value.findIndex((template) => template.key === nextTemplate.key);

  if (currentIndex >= 0) {
    termsTemplates.value.splice(currentIndex, 1, nextTemplate);
  } else {
    termsTemplates.value.push(nextTemplate);
  }

  activeTermsTemplateKey.value = nextTemplate.key;
  selectedTermsTemplateKey.value = nextTemplate.key;
  termsTemplateDraft.value = { ...nextTemplate };
  applySelectedTermsTemplate();
  termsTemplateNotice.value = '模板已保存，可在本单据继续套用。';
}

function applyDraftTermsTemplate() {
  if (!canManageTermsTemplate.value) {
    termsTemplateNotice.value = termsTemplateReadonlyReason.value;
    return;
  }

  saveTermsTemplate();
  termsTemplateDialogOpen.value = false;
}

function deleteTermsTemplate() {
  if (!canManageTermsTemplate.value) {
    termsTemplateNotice.value = termsTemplateReadonlyReason.value;
    return;
  }

  if (!canDeleteTermsTemplate.value) {
    termsTemplateNotice.value = '当前模板尚未保存，或至少需要保留一个模板。';
    return;
  }

  const deletingKey = termsTemplateDraft.value.key;
  termsTemplates.value = termsTemplates.value.filter((template) => template.key !== deletingKey);
  const nextTemplate = termsTemplates.value[0];
  selectedTermsTemplateKey.value = nextTemplate.key;
  activeTermsTemplateKey.value = nextTemplate.key;
  termsTemplateDraft.value = { ...nextTemplate };
  applySelectedTermsTemplate();
  termsTemplateNotice.value = '模板已删除，已切换到第一个可用模板。';
}

function previewPurchasePdf() {
  if (!orderDraft.value?.code) return;
  const previewPath = router.resolve({
    name: 'purchase-order-pdf',
    params: { code: orderDraft.value.code },
  }).href;
  window.open(previewPath, '_blank', 'noopener,noreferrer');
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (isReadOnly.value) {
    input.value = '';
    showToast(attachmentReadonlyReason.value || '当前状态不能上传附件', 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!files.length || !orderDraft.value) return;
  orderDraft.value.attachments = [...(orderDraft.value.attachments ?? []), ...files];
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，保存后随${documentTitle.value}保留。`);
}

function startPurchaseAfterSale() {
  if (!orderDraft.value?.code || !canStartAfterSale.value) return;
  void router.push({
    path: '/purchase/after-sales/new',
    query: { source: orderDraft.value.code },
  });
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
}

async function submitCommercialFollowUp(payload: CommercialFollowUpPayload) {
  const code = orderDraft.value?.code;
  if (!code || code === '系统自动生成' || isCommercialFollowUpSaving.value) return;
  isCommercialFollowUpSaving.value = true;
  try {
    const response = await createCommercialFollowUp('purchase', code, payload);
    orderDraft.value = toPurchaseOrder(response.order as PurchaseOrder);
    const refreshed = await getPurchaseOrder(code);
    orderDraft.value = toPurchaseOrder(refreshed.order);
    flowRecords.value = refreshed.flowRecords;
    showToast(payload.kind === 'purchase_invoice' ? '收票进度已登记。' : '付款进度已登记。');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '商务进度登记失败。', 'error');
  } finally {
    isCommercialFollowUpSaving.value = false;
  }
}

async function deleteCommercialFollowUpEntry(event: CommercialFollowUpEvent) {
  const code = orderDraft.value?.code;
  if (!code || code === '系统自动生成' || isCommercialFollowUpSaving.value) return;
  isCommercialFollowUpSaving.value = true;
  try {
    const response = await removeCommercialFollowUp('purchase', code, event.id);
    orderDraft.value = toPurchaseOrder(response.order as PurchaseOrder);
    const refreshed = await getPurchaseOrder(code);
    orderDraft.value = toPurchaseOrder(refreshed.order);
    flowRecords.value = refreshed.flowRecords;
    showToast(event.kind === 'purchase_invoice' ? '收票登记已删除。' : '付款登记已删除。');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '商务进度删除失败。', 'error');
  } finally {
    isCommercialFollowUpSaving.value = false;
  }
}

watch(() => route.fullPath, loadOrder, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section
      v-if="orderDraft"
      class="quote-editor purchase-order-editor"
      :class="{
        'is-detail-view': isDetail,
        'is-follow-up-view': isPurchaseFollowUpView,
      }"
    >
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" :to="currentListPath()" :aria-label="`返回${documentTitle}列表`" :title="`返回${documentTitle}列表`">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? orderDraft.code : pageHeading }}</strong>
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
            <button
              v-if="!isPurchaseFollowUpView"
              class="secondary-action topbar-optional-action"
              type="button"
              title="预览采购订单，可打印或保存为 PDF"
              @click="previewPurchasePdf"
            >
              <FileDown :size="15" />
              PDF
            </button>
            <button class="secondary-action topbar-optional-action" type="button" :title="`查看${documentTitle}流转日志`" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="purchaseMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="purchaseMoreActionsOpen = false"
              @mouseleave="purchaseMoreActionsOpen = false"
            >
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="purchaseMoreActionsOpen"
                @click="purchaseMoreActionsOpen = !purchaseMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="purchaseMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in purchaseMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :disabled="action.disabled"
                  :title="action.disabled ? action.disabledReason || action.description : action.description"
                  @click="handlePurchaseMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.disabled ? action.disabledReason || action.description : action.description }}</span>
                </button>
              </div>
            </div>
            <RouterLink
              v-if="showCompleteOrderInDetail"
              class="primary-action"
              :to="orderDetailPath(orderDraft.code, true)"
              :title="missingRequiredSummary"
            >
              <Pencil :size="15" />
              完善
            </RouterLink>
            <button
              v-else-if="showConfirmOrderInDetail"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isPurchaseActionPending || !canRunConfirmOrder"
              :aria-busy="activePurchaseAction === 'confirm'"
              :title="confirmOrderActionTitle"
              @click="confirmOrderDraft"
            >
              <FileText :size="15" />
              {{ activePurchaseAction === 'confirm' ? '处理中' : confirmActionLabel }}
            </button>
            <button
              v-else-if="canCloseReceiptRemainder"
              class="secondary-action danger-action async-document-action"
              type="button"
              :disabled="isSaving || isPurchaseActionPending"
              title="由采购确认供应商无需继续交付，并停止生成对应仓库待收货任务"
              @click="openReceiptRemainderDialog"
            >
              <XCircle :size="15" />
              关闭待收余量
            </button>
            <button
              v-else-if="canCloseOrder"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isPurchaseActionPending"
              :aria-busy="activePurchaseAction === 'close'"
              :title="`关闭${documentTitle}并保留全部到货与结算记录`"
              @click="closeOrderDraft"
            >
              <CheckCircle2 :size="15" />
              {{ activePurchaseAction === 'close' ? '关闭中' : '关闭' }}
            </button>
          </template>

          <template v-else-if="!isLocked && canModifyOrderContent">
            <button
              v-if="canDeleteDraftOrder"
              class="secondary-action danger-action"
              type="button"
              :disabled="isSaving || isPurchaseActionPending"
              :aria-busy="activePurchaseAction === 'delete'"
              :title="`删除未确认的${documentTitle}草稿`"
              @click="deleteDraftOrder"
            >
              <Trash2 :size="15" />
              {{ activePurchaseAction === 'delete' ? '删除中' : '删除草稿' }}
            </button>
            <button v-if="!isChangeMode" class="secondary-action async-document-action" type="button" :disabled="isSaving || isPurchaseActionPending || !canModifyOrderContent || isPurchaseStagingConfigurationBlocked" :aria-busy="activePurchaseAction === 'save'" :title="saveActionTitle" @click="saveOrderDraft">
              <Save :size="15" />
              {{ activePurchaseAction === 'save' ? '保存中' : saveActionLabel }}
            </button>
            <button class="primary-action async-document-action" type="button" :disabled="isSaving || isPurchaseActionPending || !canRunConfirmOrder" :aria-busy="activePurchaseAction === 'confirm'" :title="confirmOrderActionTitle" @click="confirmOrderDraft">
              <FileText :size="15" />
              {{ activePurchaseAction === 'confirm' ? '处理中' : confirmActionLabel }}
            </button>
          </template>

          <template v-else>
            <button class="secondary-action" type="button" disabled title="单据已锁定，不能继续编辑">
              <Pencil :size="15" />
              已锁定
            </button>
          </template>
          </div>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <nav v-if="isDetail" class="order-detail-tabs" :aria-label="`${documentTitle}详情页`">
        <RouterLink
          :to="purchaseContentPath(orderDraft.code)"
          :class="{ active: !isPurchaseFollowUpView }"
          :aria-current="!isPurchaseFollowUpView ? 'page' : undefined"
        >
          采购内容
        </RouterLink>
        <RouterLink
          :to="purchaseFollowUpPath(orderDraft.code)"
          :class="{ active: isPurchaseFollowUpView }"
          :aria-current="isPurchaseFollowUpView ? 'page' : undefined"
        >
          采购跟进
        </RouterLink>
      </nav>

      <section v-if="isPurchaseFollowUpView" class="order-next-step-strip" :class="`tone-${purchaseOrderNextStepGuidance.tone}`">
        <div>
          <span>下一步</span>
          <strong>{{ purchaseOrderNextStepGuidance.label }}</strong>
          <p>{{ purchaseOrderNextStepGuidance.description }}</p>
        </div>
        <RouterLink
          v-if="purchaseOrderNextStepPath"
          class="next-step-action"
          :to="purchaseOrderNextStepPath"
          :title="purchaseOrderNextStepGuidance.action"
        >
          {{ purchaseOrderNextStepGuidance.action }}
        </RouterLink>
        <b v-else>{{ purchaseOrderNextStepGuidance.action }}</b>
      </section>

      <div v-if="!isPurchaseFollowUpView" class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid purchase-detail-fact-grid">
              <div><dt>{{ documentTitle }}单号</dt><dd>{{ orderDraft.code || '—' }}</dd></div>
              <div><dt>公司</dt><dd>{{ orderDraft.company || '—' }}</dd></div>
              <div><dt>供应商</dt><dd>{{ orderDraft.supplier || '—' }}</dd></div>
              <div><dt>供应商联系人</dt><dd>{{ orderDraft.contact || '—' }}</dd></div>
              <div><dt>联系方式</dt><dd>{{ orderDraft.contactPhone || '—' }}</dd></div>
              <div><dt>下单日期</dt><dd>{{ orderDraft.date || '—' }}</dd></div>
              <div><dt>采购员</dt><dd>{{ orderDraft.owner || '—' }}</dd></div>
              <div class="purchase-basic-source-fact">
                <dt>来源需求</dt>
                <dd class="purchase-source-links">
                  <template v-if="orderDraft.sourceRequisitions?.length || orderDraft.sourceRequisition">
                    <RouterLink
                      v-for="sourceCode in (orderDraft.sourceRequisitions?.length ? orderDraft.sourceRequisitions : [orderDraft.sourceRequisition])"
                      :key="sourceCode"
                      :to="`/purchase/requisitions/${encodeURIComponent(sourceCode)}`"
                      :title="`查看来源采购需求 ${sourceCode}`"
                    >{{ sourceCode }}</RouterLink>
                  </template>
                  <span v-else>—</span>
                </dd>
              </div>
            </dl>
            <div v-else class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('company')" data-required-field="company">
                <span class="field-label required-label">公司</span>
                <ReferencePicker
                  required
                  v-model="orderDraft.companyCode"
                  type="company"
                  title="选择公司"
                  placeholder="选择公司"
                  search-placeholder="搜索公司编码或名称"
                  :display-value="orderDraft.company"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleCompanySelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('supplier')" data-required-field="supplier">
                <span class="field-label required-label">供应商</span>
                <ReferencePicker
                  required
                  v-model="orderDraft.supplierCode"
                  type="suppliers"
                  title="选择供应商"
                  placeholder="选择供应商"
                  search-placeholder="搜索供应商编码、名称、联系人或联系方式"
                  :display-value="orderDraft.supplier"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleSupplierSelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('contact')" data-required-field="contact">
                <span class="field-label required-label">联系人</span>
                <input v-model="orderDraft.contact" type="text" placeholder="供应商联系人" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('contactPhone')" data-required-field="contactPhone">
                <span class="field-label required-label">联系方式</span>
                <input v-model="orderDraft.contactPhone" type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等" :readonly="isReadOnly" />
              </label>
              <label class="form-field">
                <span>来源采购需求</span>
                <ReferencePicker
                  v-model="orderDraft.sourceRequisition"
                  type="purchase-requisitions"
                  kind="物料采购"
                  title="选择来源采购需求"
                  placeholder="选择或追加采购需求"
                  search-placeholder="搜索需求单号、部门、提出人或用途"
                  :display-value="sourceRequisitionDisplay"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleRequisitionSelect"
                />
                <small v-if="!isReadOnly" class="field-help">可继续选择其他需求，合并到同一张采购订单。</small>
              </label>
              <label class="form-field">
                <span>{{ documentTitle }}单号</span>
                <input v-model="orderDraft.code" type="text" readonly />
              </label>
              <label class="form-field" :class="requiredFieldClass('date')" data-required-field="date">
                <span class="field-label required-label">下单日期</span>
                <input v-model="orderDraft.date" type="date" :readonly="isReadOnly" />
              </label>
              <label class="form-field">
                <span>采购员</span>
                <input v-model="orderDraft.owner" type="text" readonly />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>物料明细</h2>
              <button v-if="!isReadOnly" class="secondary-action compact-action" type="button" title="添加明细行" @click="addLine">
                <Plus :size="15" />
                添加
              </button>
            </div>

            <div v-if="isDetail" class="master-relation-table-wrap quote-detail-table-wrap">
              <table class="master-relation-table quote-detail-table purchase-detail-line-table">
                <thead>
                  <tr>
                    <th>物料</th>
                    <th>数量</th>
                    <th>未税单价</th>
                    <th>税率</th>
                    <th>含税单价</th>
                    <th>含税金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in orderDraft.products" :key="`${item.lineId || item.materialCode || item.name}-${index}-detail`">
                    <td>
                      <MaterialIdentity
                        :name="item.name"
                        :code="item.materialCode"
                        :model="item.model"
                        :spec="item.spec"
                        :image-url="lineItems[index]?.image.url"
                        :image-label="lineItems[index]?.image.label"
                        :image-tone="lineItems[index]?.image.tone"
                      >
                        <template v-if="purchaseLineSourceEntries(item).length" #supplement>
                          <span class="purchase-line-source-links">
                            <span>
                              {{ purchaseLineSourceSummary(item) }} · 需求承接 {{ purchaseProgressQty(purchaseLineSourceAllocatedQty(item), item.uom || '') }}
                            </span>
                            <span v-if="purchaseLineStockSupplementQty(item) > 0" class="purchase-line-stock-supplement">
                              备库 {{ purchaseProgressQty(purchaseLineStockSupplementQty(item), item.uom || '') }}
                            </span>
                            <RouterLink
                              v-for="source in purchaseLineSourceEntries(item)"
                              :key="`${source.requisitionCode}-${source.sourceLineId}`"
                              class="purchase-line-source-link"
                              :to="`/purchase/requisitions/${encodeURIComponent(source.requisitionCode)}`"
                              :title="`${source.requisitionCode} / ${source.sourceLineId || '来源明细'}${source.expectedDate ? `，需求日 ${source.expectedDate}` : ''}`"
                            >{{ source.requisitionCode }} · {{ purchaseProgressQty(source.quantity, source.unit || item.uom || '') }}</RouterLink>
                          </span>
                        </template>
                      </MaterialIdentity>
                    </td>
                    <td>{{ productQtyWithUnit(item) }}</td>
                    <td>{{ formatLineUnitPrice(item, '不含税') }}</td>
                    <td>{{ item.taxRate || '—' }}</td>
                    <td>{{ formatLineUnitPrice(item, '含税') }}</td>
                    <td><strong>{{ formatLineAmount(item) }}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              v-else
              class="quote-line-table"
              :class="{ 'has-field-error': orderValidationAttempted && isRequiredFieldMissing('products') }"
              data-required-field="products"
            >
              <div class="quote-line-row quote-tax-line-row quote-line-head">
                <span>图片</span>
                <span class="required-label">物料</span>
                <span class="required-label">数量</span>
                <span class="required-label">未税单价</span>
                <span class="required-label">税率</span>
                <span class="required-label">含税单价</span>
                <span>含税金额</span>
                <span></span>
              </div>
              <div v-for="(item, index) in orderDraft.products" :key="`${item.materialCode || 'new'}-${index}`" class="quote-line-row quote-tax-line-row">
                <span class="product-thumb" :style="{ backgroundColor: lineItems[index]?.image.tone }">
                  <img v-if="lineItems[index]?.image.url" :src="lineItems[index].image.url" alt="" />
                  <span v-else>{{ lineItems[index]?.image.label }}</span>
                </span>
                <div class="purchase-order-product-picker">
                  <ReferencePicker
                    required
                    v-model="item.materialCode"
                    type="materials"
                    kind="采购"
                    title="选择物料"
                    placeholder="选择物料"
                    search-placeholder="搜索物料编码、名称、型号或规格"
                    :display-value="productIdentity(item, '选择物料')"
                    :disabled="isReadOnly"
                    :class="requiredLineProductClass(item)"
                    hide-meta
                    @select="handleProductSelect(index, $event)"
                  />
                  <small v-if="purchaseLineSourceCodes(item).length" class="purchase-order-line-source">
                    来源 {{ purchaseLineSourceSummary(item) }}
                    <template v-for="sourceCode in purchaseLineSourceCodes(item)" :key="sourceCode">
                      · <RouterLink :to="`/purchase/requisitions/${encodeURIComponent(sourceCode)}`">{{ sourceCode }}</RouterLink>
                    </template>
                  </small>
                  <small v-else-if="orderDraft.sourceRequisitions?.length" class="purchase-order-line-source is-direct">
                    直接采购
                  </small>
                </div>
                <QuantityWithUnitInput
                  v-model="item.qty"
                  :unit="item.uom"
                  placeholder="数量"
                  :readonly="isReadOnly || Boolean(item.sourceAllocations?.length)"
                  :class="requiredLineQtyClass(item)"
                />
                <input
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  :value="lineUnitPriceValue(item, '不含税')"
                  :readonly="isReadOnly"
                  :class="requiredLinePriceClass(item)"
                  :title="lineUnitPriceTitle(item, '不含税')"
                  @input="updateLineUnitPrice(item, '不含税', $event)"
                  @blur="normalizeLineUnitPrice(item)"
                />
                <select
                  v-model="item.taxRate"
                  :disabled="isReadOnly"
                  :class="requiredLineTaxRateClass(item)"
                  title="选择本行税率"
                >
                  <option v-for="rate in purchaseTaxRateOptions" :key="rate" :value="rate">{{ rate }}</option>
                </select>
                <input
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  :value="lineUnitPriceValue(item, '含税')"
                  :readonly="isReadOnly"
                  :class="requiredLinePriceClass(item)"
                  :title="lineUnitPriceTitle(item, '含税')"
                  @input="updateLineUnitPrice(item, '含税', $event)"
                  @blur="normalizeLineUnitPrice(item)"
                />
                <strong>{{ formatLineAmount(item) }}</strong>
                <button
                  class="icon-button danger"
                  type="button"
                  aria-label="删除采购明细"
                  :title="orderDraft.products.length <= 1 ? '至少保留一行采购明细' : '删除采购明细'"
                  :disabled="orderDraft.products.length <= 1"
                  @click="removeLine(index)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>

            <div class="line-amount-summary">
              <div class="summary-title">
                <FileText :size="17" />
                <h2>金额汇总</h2>
              </div>
              <dl class="amount-summary amount-summary-inline">
                <div>
                  <dt>未税金额</dt>
                  <dd>{{ orderTotal.subtotal }}</dd>
                </div>
                <div>
                  <dt>税额</dt>
                  <dd>{{ orderTotal.tax }}</dd>
                </div>
                <div class="amount-total">
                  <dt>含税总计</dt>
                  <dd>{{ orderTotal.total }}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>采购条款</h2>
              <button
                v-if="canManageTermsTemplate"
                class="secondary-action compact-action"
                type="button"
                title="编辑条款模板"
                @click="editTermsTemplate()"
              >
                <FileText :size="14" />
                模板
              </button>
            </div>

            <dl v-if="isDetail" class="material-fact-grid purchase-detail-fact-grid">
              <div><dt>预计到货</dt><dd>{{ orderDraft.expectedDate }}</dd></div>
              <div><dt>交付方式</dt><dd>{{ orderDraft.deliveryMethod }}</dd></div>
              <div><dt>运费承担</dt><dd>{{ orderDraft.freightPayer }}</dd></div>
              <div><dt>付款方式</dt><dd>{{ orderDraft.paymentMethod }}</dd></div>
              <div class="fact-span-2"><dt>补充条款</dt><dd>{{ orderDraft.remark || '—' }}</dd></div>
            </dl>
            <div v-else class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('expectedDate')" data-required-field="expectedDate">
                <span class="field-label required-label">预计到货</span>
                <input v-model="orderDraft.expectedDate" type="date" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('deliveryMethod')" data-required-field="deliveryMethod">
                <span class="field-label required-label">交付方式</span>
                <select v-model="orderDraft.deliveryMethod" :disabled="isReadOnly">
                  <option v-for="method in purchaseDeliveryMethodOptions" :key="method" :value="method">{{ method }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('freightPayer')" data-required-field="freightPayer">
                <span class="field-label required-label">运费承担</span>
                <select v-model="orderDraft.freightPayer" :disabled="isReadOnly">
                  <option v-for="payer in purchaseFreightPayerOptions" :key="payer" :value="payer">{{ payer }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('paymentMethod')" data-required-field="paymentMethod">
                <span class="field-label required-label">付款方式</span>
                <select v-model="orderDraft.paymentMethod" :disabled="isReadOnly">
                  <option v-for="method in purchasePaymentMethodOptions" :key="method" :value="method">{{ method }}</option>
                </select>
              </label>
              <label class="form-field full-field">
                <span>补充条款</span>
                <textarea
                  v-model="orderDraft.remark"
                  class="terms-textarea"
                  rows="6"
                  placeholder="填写交付、包装、入库、付款等补充约定。"
                  :readonly="isReadOnly"
                ></textarea>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>收货信息</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid purchase-detail-fact-grid">
              <div><dt>收货仓库</dt><dd>{{ orderDraft.warehouse }}</dd></div>
              <div class="fact-span-2"><dt>收货地址</dt><dd>{{ orderDraft.receivingAddress || '—' }}</dd></div>
              <div><dt>收货联系人</dt><dd>{{ orderDraft.receivingContact || '—' }}</dd></div>
              <div class="fact-span-2"><dt>联系方式</dt><dd>{{ orderDraft.receivingPhone || '—' }}</dd></div>
            </dl>
            <div v-else class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('warehouse')" data-required-field="warehouse">
                <span class="field-label required-label">收货仓库</span>
                <ReferencePicker
                  required
                  v-model="orderDraft.warehouseCode"
                  type="warehouses"
                  :company="orderDraft.company"
                  kind="采购收货"
                  title="选择收货仓库"
                  placeholder="选择收货仓库"
                  search-placeholder="搜索仓库编码、名称、类型或地址"
                  empty-text="没有可用采购暂存仓，请先在基础资料为仓库配置“采购暂存”职能。"
                  :display-value="orderDraft.warehouse"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleWarehouseSelect"
                />
                <small v-if="purchaseStagingWarehouseLoading" class="field-help">正在读取当前公司的采购暂存仓……</small>
                <small v-else-if="purchaseStagingWarehouseError" class="field-help field-error-text">{{ purchaseStagingWarehouseError }} 请先到基础资料为仓库配置“采购暂存”职能；当前不能保存或确认。</small>
                <small v-else class="field-help">当前公司有 {{ purchaseStagingWarehouseCount }} 个可选采购暂存仓；供应商到货后由仓库人员登记实际收货。</small>
              </label>
              <label class="form-field field-span-2" :class="requiredFieldClass('receivingAddress')" data-required-field="receivingAddress">
                <span class="field-label required-label">收货地址</span>
                <input v-model="orderDraft.receivingAddress" type="text" placeholder="填写供应商送达地址" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('receivingContact')" data-required-field="receivingContact">
                <span class="field-label required-label">收货联系人</span>
                <input v-model="orderDraft.receivingContact" type="text" placeholder="填写收货联系人" :readonly="isReadOnly" />
              </label>
              <label class="form-field field-span-2" :class="requiredFieldClass('receivingPhone')" data-required-field="receivingPhone">
                <span class="field-label required-label">联系方式</span>
                <input v-model="orderDraft.receivingPhone" type="tel" inputmode="tel" autocomplete="shipping tel" placeholder="填写手机号码或座机" :readonly="isReadOnly" />
              </label>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              :title="`${documentTitle}状态`"
              :primary-status="purchaseDocumentStatus"
              :items="[]"
              :aria-label="`${documentTitle}单据状态`"
            />
          </section>

          <section v-if="!isDetail" class="summary-section">
            <h2>采购价参考</h2>
            <p class="reference-summary">{{ priceReferenceSummary }}</p>
            <div class="price-reference-list">
              <div v-for="item in orderPriceReferenceRows" :key="item.key" class="price-reference-card">
                <MaterialIdentity
                  compact
                  :name="item.material.name"
                  :code="item.material.materialCode"
                  :model="item.material.model"
                  :spec="item.material.spec"
                  :image-label="item.image.label"
                  :image-tone="item.image.tone"
                />
                <div class="price-reference">
                  <span>最近采购价</span>
                  <b>{{ item.referencePrice }}</b>
                </div>
                <small class="price-reference-meta">{{ item.referenceMeta }}</small>
                <small v-if="item.quantity" class="price-reference-meta">订单数量 {{ item.quantity }}</small>
              </div>
            </div>
          </section>

          <section class="summary-section">
            <div class="form-section-head">
              <div class="summary-title">
                <Paperclip :size="17" />
                <h2>附件</h2>
              </div>
              <label
                v-if="!isReadOnly"
                class="secondary-action compact-action file-upload-button"
                :title="purchaseAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple @change="handleAttachmentUpload" />
              </label>
            </div>

            <div v-if="attachments.length" class="attachment-list">
              <div v-for="file in attachments" :key="file.name" class="attachment-row">
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
              <span>{{ isReadOnly ? '暂无附件' : '可上传采购合同、供应商回签、报价单等文件' }}</span>
            </div>
          </section>
        </aside>
      </div>

      <div v-else class="quote-form-grid order-delivery-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>明细进度</h2>
              <p>自动超收容差 {{ orderDraft.overReceiptTolerancePercent ?? 5 }}%；短收余量由采购决定继续等待或关闭。</p>
            </div>
            <div v-if="purchaseProgressLineRows.length" class="purchase-line-progress-list purchase-follow-up-line-list">
              <article v-for="line in purchaseProgressLineRows" :key="line.lineId" class="purchase-line-progress-card">
                <header class="purchase-follow-up-line-head">
                  <MaterialIdentity
                    compact
                    :name="line.material.name"
                    :code="line.material.materialCode || line.lineId"
                    :model="line.material.model"
                    :spec="line.material.spec"
                    :image-label="line.image.label"
                    :image-tone="line.image.tone"
                  />
                  <i class="mini-status" :class="purchaseProgressLineStatusClass(line)">{{ purchaseProgressLineStatus(line) }}</i>
                </header>
                <div class="purchase-follow-up-stage-grid">
                  <div><span>订购</span><b>{{ purchaseProgressQty(line.orderedQty, line.uom) }}</b></div>
                  <div><span>累计到货</span><b>{{ purchaseProgressQty(line.arrivedQty, line.uom) }}</b></div>
                  <div><span>正式入库</span><b>{{ purchaseProgressQty(line.inboundQty, line.uom) }}</b></div>
                </div>
                <div class="purchase-follow-up-progress-bars">
                  <div>
                    <span>到货</span>
                    <i><b :style="{ width: `${purchaseProgressPercent(line.arrivedQty, line.receiptTargetQty ?? line.orderedQty)}%` }"></b></i>
                    <strong>{{ purchaseProgressPercent(line.arrivedQty, line.receiptTargetQty ?? line.orderedQty) }}%</strong>
                  </div>
                  <div>
                    <span>入库</span>
                    <i><b :style="{ width: `${purchaseProgressPercent(line.inboundQty, line.receiptTargetQty ?? line.orderedQty)}%` }"></b></i>
                    <strong>{{ purchaseProgressPercent(line.inboundQty, line.receiptTargetQty ?? line.orderedQty) }}%</strong>
                  </div>
                </div>
                <div class="purchase-follow-up-quality-facts">
                  <span>待检 <b>{{ purchaseProgressQty(line.pendingQcQty, line.uom) }}</b></span>
                  <span>已放行 <b>{{ purchaseProgressQty(line.releasedQty, line.uom) }}</b></span>
                  <span :class="{ 'has-rejected': line.rejectedQty > 0 }">不合格 <b>{{ purchaseProgressQty(line.rejectedQty, line.uom) }}</b></span>
                  <span v-if="line.closedQty > 0">关闭余量 <b>{{ purchaseProgressQty(line.closedQty, line.uom) }}</b></span>
                  <span v-if="line.overReceivedQty > 0">容差内超收 <b>{{ purchaseProgressQty(line.overReceivedQty, line.uom) }}</b></span>
                </div>
              </article>
            </div>
            <div v-else class="delivery-reference-empty">当前采购单暂无可显示的物料进度。</div>
          </section>

          <section id="commercial-follow-up" class="form-section">
            <div class="section-heading">
              <h2>收票与付款</h2>
            </div>
            <CommercialFollowUpPanel
              module="purchase"
              :events="orderDraft.commercialFollowUps ?? []"
              :total-amount="parseNumber(orderDraft.amount)"
              :can-write="canWritePurchase && purchaseDocumentStatus !== '草稿' && purchaseDocumentStatus !== '已作废'"
              :disabled-reason="!canWritePurchase
                ? purchaseReadonlyReason
                : purchaseDocumentStatus === '草稿'
                  ? `${documentTitle}确认后才能登记商务进度。`
                  : `已作废${documentTitle}不能新增商务进度。`"
              :busy="isCommercialFollowUpSaving"
              @submit="submitCommercialFollowUp"
              @remove="deleteCommercialFollowUpEntry"
            />
          </section>

        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="采购进度"
              :primary-status="purchaseDocumentStatus"
              :items="purchaseProgressRows"
              aria-label="采购订单到货、质检、入库、收票和付款进度"
            />
          </section>

          <section class="summary-section follow-up-related-section" id="purchase-related-documents">
            <div class="form-section-head">
              <h2>关联记录</h2>
              <span class="follow-up-related-count">{{ orderDraft.relatedDocuments?.length || 0 }} 项</span>
            </div>
            <div v-if="orderDraft.relatedDocuments?.length" class="follow-up-related-list">
              <article
                v-for="document in orderDraft.relatedDocuments"
                :key="`${document.type}-${document.code}`"
                class="follow-up-related-record"
              >
                <span>{{ document.type }}</span>
                <div>
                  <strong>{{ document.code }}</strong>
                  <small>{{ document.status }}</small>
                </div>
              </article>
            </div>
            <div v-else class="delivery-reference-empty">暂无关联执行记录。</div>
          </section>

        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      :title="documentTitle"
      :message="loadMessage"
      :back-path="currentListPath()"
      :back-label="`${documentTitle}列表`"
      @retry="loadOrder"
    />

    <TermsTemplateDialog
      v-model:draft="termsTemplateDraft"
      :open="termsTemplateDialogOpen"
      title="采购条款模板"
      :templates="termsTemplates"
      :active-key="activeTermsTemplateKey"
      :can-delete="canDeleteTermsTemplate"
      :notice="termsTemplateNotice"
      :readonly="!canManageTermsTemplate"
      :readonly-reason="termsTemplateReadonlyReason"
      :delivery-method-options="purchaseDeliveryMethodOptions"
      :payment-method-options="purchasePaymentMethodOptions"
      :freight-payer-options="purchaseFreightPayerOptions"
      show-freight-payer
      :show-price-tax="false"
      @close="termsTemplateDialogOpen = false"
      @create="createTermsTemplate"
      @choose="chooseTemplateForEditing"
      @delete="deleteTermsTemplate"
      @apply="applyDraftTermsTemplate"
      @save="saveTermsTemplate"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      :title="`${documentTitle}日志`"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <PurchaseReceiptRemainderDialog
      :open="receiptRemainderDialogOpen"
      :record-code="orderDraft?.code || ''"
      :lines="purchaseReceiptRemainderLines"
      :busy="activePurchaseAction === 'closeRemainder'"
      @close="receiptRemainderDialogOpen = false"
      @submit="submitReceiptRemainderClosure"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
