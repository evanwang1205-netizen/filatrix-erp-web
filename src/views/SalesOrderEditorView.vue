<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCircle2,
  FileDown,
  FileText,
  Paperclip,
  PanelRightOpen,
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
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import RemainderClosureDialog from '../components/PurchaseReceiptRemainderDialog.vue';
import TermsTemplateDialog from '../components/TermsTemplateDialog.vue';
import { DEFAULT_COMPANY_CODE, DEFAULT_COMPANY_NAME } from '../constants/company';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { scrollElementIntoView } from '../utils/focusNavigation';
import { statusPresentationClass } from '../utils/statusPresentation';
import { productVisuals } from '../data/sales';
import { useSessionStore } from '../stores/session';
import {
  confirmSalesOrder,
  confirmSalesOrderReceipt,
  closeSalesOrderDeliveryRemainder,
  createCommercialFollowUp,
  removeCommercialFollowUp,
  deleteSalesOrder,
  getSalesOrder,
  getSalesQuote,
  listReference,
  listSalesDeliveryRecords,
  listSalesOrders,
  listSalesOutboundRequests,
  listSalesInventory,
  saveSalesOrder,
  voidSalesOrder,
} from '../services/api';
import type { CommercialFollowUpPayload } from '../services/api';
import type { MasterDataRecord } from '../data/masterData';
import type {
  CommercialFollowUpEvent,
  FlowRecord,
  ReferenceOption,
  SalesDeliveryRecord,
  SalesOrder,
  SalesOrderProduct,
  SalesProductionProgressLine,
  SalesOutboundRequest,
  SalesQuote,
  SalesInventoryProjectionRow,
} from '../types/business';
import type { TermsTemplate } from '../types/termsTemplate';
import { taxRateOptions, taxRateValue } from '../utils/taxCalculation';
import { productIdentity, productQtyWithUnit } from '../utils/productDisplay';
import { attachmentsFromFileList } from '../utils/attachmentUpload';
import { useReferencePanelStore } from '../stores/referencePanel';
import {
  normalizeSalesDeliveryMethod,
  normalizeSalesPaymentMethod,
  salesDeliveryMethodOptions,
  salesPaymentOptions,
} from '../utils/salesTerms';

type CustomerReference = {
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  province?: string;
  city?: string;
  address?: string;
  paymentMethod?: string;
  deliveryMethod?: string;
  defaultLogisticsMode?: string;
  defaultShipContact?: string;
  defaultShipPhone?: string;
  defaultShipAddress?: string;
};

type OrderRequiredFieldKey =
  | 'company'
  | 'customer'
  | 'contact'
  | 'contactPhone'
  | 'owner'
  | 'currency'
  | 'products'
  | 'delivery'
  | 'deliveryMethod'
  | 'paymentMethod'
  | 'freightPayer'
  | 'logisticsMode'
  | 'plannedShipDate'
  | 'shipContact'
  | 'shipPhone'
  | 'shipAddress';

type MaterialReference = {
  code: string;
  name: string;
  model?: string;
  spec?: string;
  uom?: string;
  latestPrice?: string;
  imageLabel?: string;
  imageTone?: string;
};

type QuoteReference = {
  code: string;
  customer?: string;
  customerCode?: string;
  contact?: string;
  contactPhone?: string;
  products?: SalesOrderProduct[];
};

type SalesPriceReference = {
  productKey: string;
  materialCode: string;
  productName: string;
  product: string;
  customer: string;
  latestPrice: string;
  quantity: string;
  sourceDoc: string;
  updatedAt: string;
};

type OrderMoreAction = {
  key: string;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  tone?: 'default' | 'danger';
};

type OrderProgressDimension = 'production' | 'delivery' | 'invoice' | 'payment';
type StructuredSalesOrderFacts = SalesOrder & {
  documentStatus?: unknown;
  productionProgress?: unknown;
  deliveryProgress?: unknown;
  invoiceProgress?: unknown;
  paymentProgress?: unknown;
  attentionFlags?: unknown;
  progressFacts?: unknown;
};

const progressFieldByDimension: Record<OrderProgressDimension, keyof StructuredSalesOrderFacts> = {
  production: 'productionProgress',
  delivery: 'deliveryProgress',
  invoice: 'invoiceProgress',
  payment: 'paymentProgress',
};

function factRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasOwnFact(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function factText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;

  const record = factRecord(value);
  if (!record) return undefined;
  for (const key of ['label', 'display', 'text', 'name', 'status', 'value', 'progress']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function factKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeStructuredDocumentStatus(value: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    pending_confirm: '草稿',
    confirmed: '已确认',
    in_progress: '已确认',
    completed: '已关闭',
    closed: '已关闭',
    void: '已作废',
    voided: '已作废',
    cancelled: '已作废',
    canceled: '已作废',
  };
  return labels[factKey(value)] ?? value;
}

function normalizeStructuredProgress(dimension: OrderProgressDimension, value: string) {
  const labels: Record<OrderProgressDimension, Record<string, string>> = {
    production: {
      not_started: '未开始',
      pending: '待建工单',
      partial: '生产中',
      in_progress: '生产中',
      completed: '已入库',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
    delivery: {
      not_started: '待分配',
      未发货: '待分配',
      已发货: '待签收',
      pending: '待出库',
      partial: '部分出库',
      in_progress: '待出库',
      completed: '已签收',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
    invoice: {
      not_started: '未开票',
      pending: '未开票',
      partial: '部分开票',
      in_progress: '部分开票',
      completed: '已开票',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
    payment: {
      not_started: '未收款',
      pending: '未收款',
      partial: '部分收款',
      in_progress: '部分收款',
      completed: '已收款',
      blocked: '暂停',
      cancelled: '已取消',
      canceled: '已取消',
    },
  };
  return labels[dimension][factKey(value)] ?? value;
}

function structuredProgressFacts(order: SalesOrder | null | undefined) {
  return order ? factRecord((order as StructuredSalesOrderFacts).progressFacts) : undefined;
}

function structuredDocumentStatus(order: SalesOrder | null | undefined) {
  if (!order) return undefined;
  const structuredOrder = order as StructuredSalesOrderFacts;
  const progressFacts = structuredProgressFacts(order);
  const value = factText(structuredOrder.documentStatus) ?? factText(progressFacts?.documentStatus);
  return value ? normalizeStructuredDocumentStatus(value) : undefined;
}

function structuredProgress(order: SalesOrder | null | undefined, dimension: OrderProgressDimension) {
  if (!order) return undefined;
  const structuredOrder = order as StructuredSalesOrderFacts;
  const field = progressFieldByDimension[dimension];
  const progressFacts = structuredProgressFacts(order);
  const value = factText(structuredOrder[field])
    ?? factText(progressFacts?.[field])
    ?? factText(progressFacts?.[dimension]);
  return value ? normalizeStructuredProgress(dimension, value) : undefined;
}

function structuredProductionProgress(order: SalesOrder | null | undefined) {
  if (!order) return undefined;
  const direct = factRecord(order.productionProgress);
  const nested = factRecord(structuredProgressFacts(order)?.production);
  return (direct || nested) as (Record<string, unknown> & { lines?: SalesProductionProgressLine[] }) | undefined;
}

function attentionFlagLabel(value: unknown) {
  const raw = factText(value);
  if (!raw) return undefined;
  const labels: Record<string, string> = {
    normal: '正常',
    none: '正常',
    paused: '暂停',
    blocked: '暂停',
    has_exception: '异常处理中',
    exception: '异常处理中',
    delivery_exception: '异常处理中',
    quality_exception: '异常处理中',
    exception_processing: '异常处理中',
    return_processing: '异常处理中',
    shipment_overdue: '发货逾期',
    delivery_overdue: '交付逾期',
    shipment_due_soon: '发货临近',
    delivery_due_soon: '交付临近',
  };
  return labels[factKey(raw)] ?? raw;
}

function attentionFlagValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];

  const record = factRecord(value);
  if (!record || factText(record)) return [value];
  return Object.entries(record)
    .filter(([, active]) => Boolean(active))
    .map(([flag]) => flag);
}

function structuredAttention(order: SalesOrder | null | undefined) {
  if (!order) return undefined;
  const structuredOrder = order as StructuredSalesOrderFacts;
  const orderRecord = structuredOrder as unknown as Record<string, unknown>;
  const progressFacts = structuredProgressFacts(order);
  let source: unknown;
  let hasStructuredFlags = false;

  if (hasOwnFact(orderRecord, 'attentionFlags')) {
    source = structuredOrder.attentionFlags;
    hasStructuredFlags = true;
  } else if (progressFacts && (hasOwnFact(progressFacts, 'attentionFlags') || hasOwnFact(progressFacts, 'attention'))) {
    source = progressFacts.attentionFlags ?? progressFacts.attention;
    hasStructuredFlags = true;
  }

  if (!hasStructuredFlags) return undefined;

  const candidates = attentionFlagValues(source)
    .map((flag) => {
      const label = attentionFlagLabel(flag);
      const key = factKey(`${factText(flag) ?? ''} ${label ?? ''}`);
      const rank = /exception|overdue|异常|逾期|退货|差异|不合格/.test(key)
        ? 3
        : /paused|blocked|暂停/.test(key)
          ? 2
          : /due_soon|临近/.test(key)
            ? 1
            : 0;
      return label ? { label, rank } : undefined;
    })
    .filter((candidate): candidate is { label: string; rank: number } => Boolean(candidate))
    .sort((a, b) => b.rank - a.rank);
  return candidates[0]?.label ?? '正常';
}

function hasStructuredOrderFacts(order: SalesOrder | null | undefined) {
  if (!order) return false;
  const record = order as unknown as Record<string, unknown>;
  return [
    'documentStatus',
    'productionProgress',
    'deliveryProgress',
    'invoiceProgress',
    'paymentProgress',
    'attentionFlags',
    'progressFacts',
  ].some((key) => hasOwnFact(record, key));
}

type SalesOrderAsyncAction = 'save' | 'confirm' | 'arrival' | 'closeRemainder' | 'delete' | 'void';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const referencePanel = useReferencePanelStore();
const { canWrite: canWriteSales, readonlyReason: salesReadonlyReason } = useModulePermission('sales');
const { canOperate: canApproveSales, readonlyReason: salesApproveReadonlyReason } = useOperationPermission('salesApprove', '确认销售订单');
const showFlowRecords = ref(false);
const moreActionsOpen = ref(false);
const deliveryRemainderDialogOpen = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
const isCommercialFollowUpSaving = ref(false);
const {
  activeAction: activeOrderAction,
  isActionPending: isOrderActionPending,
  runAction: runOrderAction,
} = useAsyncActionState<SalesOrderAsyncAction>();
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const loadMessage = ref('');
const currencyLoadError = ref('');
let toastTimer: number | undefined;

function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createEmptyLine(): SalesOrderProduct {
  return {
    lineId: `L-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    materialCode: '',
    name: '',
    qty: '',
    priceInputMode: '含税',
    unitPrice: '',
    amount: '',
    taxRate: '13%',
    uom: '',
  };
}

function createEmptyOrder(): SalesOrder {
  return {
    code: '系统自动生成',
    currency: 'CNY',
    companyCode: DEFAULT_COMPANY_CODE,
    company: DEFAULT_COMPANY_NAME,
    customerCode: '',
    customer: '',
    contact: '',
    contactPhone: '',
    sourceQuote: '',
    products: [createEmptyLine()],
    amount: '￥0.00',
    owner: session.user.name || '待指定',
    priority: '正常',
    status: '草稿',
    date: today(),
    delivery: today(7),
    deliveryMethod: '本厂配送',
    paymentMethod: '月结 30 天',
    freightPayer: '供方',
    taxMode: '含税',
    taxRate: '13%',
    logisticsMode: '本厂配送',
    plannedShipDate: today(5),
    shipAddress: '',
    shipContact: '',
    shipPhone: '',
    supplementaryRequirement: '',
    internalNote: '',
    remark: '',
    attachments: [],
  };
}

function toSalesOrder(source: Partial<SalesOrder>): SalesOrder {
  const order = {
    ...createEmptyOrder(),
    ...source,
    products: source.products?.length
      ? source.products.map((product) => {
          const priceInputMode = product.priceInputMode || (source.taxMode === '不含税' ? '不含税' : '含税');
          const fallbackUnitPrice = priceInputMode === '不含税'
            ? product.netUnitPrice || product.unitPrice
            : product.grossUnitPrice || product.unitPrice;
          return {
            ...createEmptyLine(),
            ...product,
            priceInputMode,
            unitPrice: String(product.unitPrice ?? '').trim()
              ? formatCurrencyInput(parseNumber(product.unitPrice))
              : String(fallbackUnitPrice ?? '').trim()
                ? formatCurrencyInput(parseNumber(fallbackUnitPrice || ''))
                : '',
            taxRate: product.taxRate || (source.taxRate !== '多税率' ? source.taxRate : '') || '13%',
          };
        })
      : [createEmptyLine()],
    attachments: source.attachments ?? [],
  };

  return {
    ...order,
    supplementaryRequirement: String(source.supplementaryRequirement ?? source.internalRemark ?? '').trim(),
    internalNote: String(source.internalNote ?? '').trim(),
    status: normalizeOrderStatus(order.status),
    freightPayer: order.freightPayer || '供方',
    deliveryMethod: normalizeSalesDeliveryMethod(order.deliveryMethod),
    paymentMethod: normalizeSalesPaymentMethod(order.paymentMethod),
    logisticsMode: normalizeLogisticsMode(order.logisticsMode),
  };
}

const orderDraft = ref<SalesOrder | null>(createEmptyOrder());
const flowRecords = ref<FlowRecord[]>([]);
const orderValidationAttempted = ref(false);
const warehouseInventoryRows = ref<SalesInventoryProjectionRow[]>([]);
const salesDeliveryRows = ref<SalesDeliveryRecord[]>([]);
const outboundRequestRows = ref<SalesOutboundRequest[]>([]);
const salesPriceSourceRows = ref<SalesOrder[]>([]);
const currencyRows = ref<ReferenceOption<MasterDataRecord>[]>([]);
const deliveryOptions = salesDeliveryMethodOptions;
const paymentOptions = salesPaymentOptions;
const logisticsModeOptions = ['客户自提', '本厂配送', '整车货运', '拼车物流', '快递快运'];
const freightPayerOptions = ['供方', '客户'];
const awaitingReceiptStatuses = ['待签收', '已发货', '已出库'];

function normalizeLogisticsMode(value = '') {
  return normalizeSalesDeliveryMethod(value);
}

function normalizeOrderStatus(status = '') {
  const legacyMap: Record<string, string> = {
    待申请出库: '待发货',
  };
  return legacyMap[status] || status;
}

function isAwaitingReceiptStatus(status: string) {
  return awaitingReceiptStatuses.includes(status);
}

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value === 'sales-order-new');
const isEdit = computed(() => mode.value === 'sales-order-edit');
const isDeliveryView = computed(() => mode.value === 'sales-order-delivery');
const isDetail = computed(() => mode.value === 'sales-order-detail' || isDeliveryView.value);
const orderContentPath = computed(() => `/sales/orders/${encodeURIComponent(orderDraft.value?.code || route.params.code?.toString() || '')}`);
const orderDeliveryPath = computed(() => `${orderContentPath.value}/delivery`);
const orderStatus = computed(() => orderDraft.value?.status ?? '');
const orderCurrency = computed(() => orderDraft.value?.currency || 'CNY');
const currencyOptions = computed(() => {
  const codes = currencyRows.value
    .filter((row) => row.status !== '停用')
    .map((row) => String(row.code || '').trim().toUpperCase())
    .filter(Boolean);
  const currentCurrency = orderCurrency.value;
  if (currentCurrency && !codes.includes(currentCurrency)) codes.unshift(currentCurrency);
  return codes.length ? codes : ['CNY'];
});
const isLockedOrder = computed(() => {
  const documentStatus = structuredDocumentStatus(orderDraft.value) || '';
  if (documentStatus === '草稿') return false;
  if (['已作废', '已关闭'].includes(documentStatus)) return true;
  if (documentStatus === '已确认') {
    return !['已确认', '待申请出库', '待发货'].includes(orderStatus.value);
  }
  return [
    '生产中',
    '发货中',
    '已申请出库',
    '已出库',
    '待签收',
    '已发货',
    '待开票',
    '待收款',
    '部分收款',
    '已完成',
    '已作废',
    '已中断',
    '退货处理中',
  ].includes(orderStatus.value);
});
const isChangeMode = computed(() => isEdit.value && !isLockedOrder.value && orderStatus.value !== '草稿');
const canModifyOrderContent = computed(() => canWriteSales.value && (!isChangeMode.value || canApproveSales.value));
const isReadOnly = computed(() => isDetail.value || isLockedOrder.value || !canModifyOrderContent.value);
const { resetUnsavedChanges } = useUnsavedChangesGuard(orderDraft, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const editActionLabel = computed(() => (orderStatus.value === '草稿' ? '编辑' : '变更'));
const saveActionLabel = computed(() => (isChangeMode.value ? '保存变更' : '保存草稿'));
const saveActionTitle = computed(() => saveOrderReadonlyReason.value || (isChangeMode.value ? '保存订单变更。' : '保存草稿，确认前可继续调整订单信息。'));
const confirmActionLabel = computed(() => (isChangeMode.value ? '确认变更' : '确认'));
const canEditOrderContent = computed(() => !isLockedOrder.value && canWriteSales.value && (orderStatus.value === '草稿' || canApproveSales.value));
const canDeleteDraftOrder = computed(() =>
  !isNew.value &&
  orderStatus.value === '草稿' &&
  canWriteSales.value &&
  Boolean(orderDraft.value?.code && orderDraft.value.code !== '系统自动生成'),
);
const canPinAsReference = computed(() =>
  isDetail.value &&
  Boolean(orderDraft.value?.code && orderDraft.value.code !== '系统自动生成'),
);
const saveOrderReadonlyReason = computed(() => {
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (isChangeMode.value && !canApproveSales.value) return salesApproveReadonlyReason.value;
  return '';
});
const canConfirmOrder = computed(() => canWriteSales.value && canApproveSales.value);
const canConfirmArrival = computed(() => {
  const progress = structuredProgress(orderDraft.value, 'delivery');
  const deliveryReady = progress
    ? progress === '待签收'
    : isAwaitingReceiptStatus(orderStatus.value);
  return deliveryReady && canWriteSales.value && canApproveSales.value;
});
const salesDeliveryProgressLines = computed(() => (
  orderDraft.value?.progressFacts?.delivery?.lines
  || orderDraft.value?.deliveryProgress?.lines
  || []
));
const deliveryRemainderLines = computed(() => (
  salesDeliveryProgressLines.value.filter((line) => Number(line.remainingQty || 0) > 0.0001)
));
const canCloseDeliveryRemainder = computed(() => (
  isDeliveryView.value
  && orderDocumentStatus.value === '已确认'
  && canWriteSales.value
  && canApproveSales.value
  && !orderDraft.value?.deliveryRemainderStatus
  && deliveryRemainderLines.value.length > 0
  && salesDeliveryProgressLines.value.some((line) => Number(line.outboundQty || 0) > 0.0001)
));
const showConfirmOrderInDetail = computed(() => isDetail.value && orderStatus.value === '草稿');
const confirmOrderReadonlyReason = computed(() => {
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (!canApproveSales.value) return salesApproveReadonlyReason.value;
  return '';
});
const normalizedOrderStatus = computed(() => statusLabel(orderStatus.value));
const orderDocumentStatus = computed(() => {
  const structured = structuredDocumentStatus(orderDraft.value);
  if (structured) return structured;

  const status = normalizedOrderStatus.value;
  if (['草稿', '已驳回', '已退回'].includes(status)) return '草稿';
  if (['已作废', '已取消'].includes(status)) return '已作废';
  if (['已完成', '已收款', '已关闭'].includes(status)) return '已关闭';
  return '已确认';
});

const isStoppedOrder = computed(() => ['已作废', '已中断', '已取消'].includes(normalizedOrderStatus.value));
const moreActionPermissionReason = computed(() => {
  if (!canWriteSales.value) return salesReadonlyReason.value;
  return '';
});
const moreOrderActions = computed<OrderMoreAction[]>(() => {
  const isDraftOrder = orderDocumentStatus.value === '草稿';
  const isCompletedOrder = orderDocumentStatus.value === '已关闭';
  const isAfterSalesEligibleOrder = Number(
    orderDraft.value?.progressFacts?.delivery?.outboundQty
    || orderDraft.value?.deliveryProgress?.outboundQty
    || (deliveryProgress() === '已签收' ? 1 : 0),
  ) > 0;
  const approveReason = !canApproveSales.value ? salesApproveReadonlyReason.value : '';
  const writeReason = moreActionPermissionReason.value;

  return [
    {
      key: 'edit',
      label: editActionLabel.value,
      description: isDraftOrder ? '直接调整销售订单草稿内容。' : '调整销售订单内容，并保留变更记录。',
      disabled: !canEditOrderContent.value,
      disabledReason: writeReason || approveReason || '当前状态不可调整订单内容。',
    },
    {
      key: 'delete-draft',
      label: '删除草稿',
      description: '删除未确认的销售订单草稿。',
      disabled: !canDeleteDraftOrder.value,
      disabledReason: writeReason || '只有未确认草稿可以删除。',
      tone: 'danger',
    },
    {
      key: 'void',
      label: '作废',
      description: '终止未完成订单，并在日志中保留原因和处理人。',
      disabled: Boolean(writeReason || approveReason || isDraftOrder || isCompletedOrder || isStoppedOrder.value),
      disabledReason: writeReason || approveReason || (isDraftOrder ? '草稿直接删除即可。' : isCompletedOrder ? '已完成订单不作废，需走冲销或售后。' : '订单已停止流转。'),
      tone: 'danger',
    },
    {
      key: 'after-sale',
      label: '售后',
      description: '处理已出库商品的退换补、返工或折让。',
      disabled: Boolean(writeReason || !isAfterSalesEligibleOrder || isStoppedOrder.value),
      disabledReason: writeReason || (!isAfterSalesEligibleOrder ? '订单形成实际出库数量后才能登记售后。' : '已停止流转的订单不可发起售后。'),
    },
  ];
});
const operationPermissionHint = computed(() => (
  canWriteSales.value && !canApproveSales.value ? salesApproveReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u786e\u8ba4\u8ba2\u5355\u3001\u8ba2\u5355\u53d8\u66f4\u548c\u4f5c\u5e9f\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';

const pageHeading = computed(() => {
  if (isNew.value) return '新建销售订单';
  if (isEdit.value) {
    if (isLockedOrder.value) return '销售订单只读';
    return isChangeMode.value ? '销售订单变更' : '编辑销售订单';
  }
  return '销售订单详情';
});

const termsTemplates = ref<TermsTemplate[]>([
  {
    key: 'standard',
    name: '标准销售条款',
    deliveryMethod: '本厂配送',
    paymentMethod: '月结 30 天',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '供方',
    content: '包装按双方确认标准执行；交付到客户指定地址；到货后 7 日内完成验收；付款按月结 30 天执行。',
  },
  {
    key: 'prepay',
    name: '预付款条款',
    deliveryMethod: '本厂配送',
    paymentMethod: '预付款 30%',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '供方',
    content: '合同确认后预付款 30%，发货前付清尾款；产品按双方确认规格生产；验收及售后按合同约定执行。',
  },
  {
    key: 'pickup',
    name: '客户自提条款',
    deliveryMethod: '客户自提',
    paymentMethod: '款到发货',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '客户',
    content: '客户到厂自提，提货前完成付款；提货时双方确认数量、包装及外观；离厂后的运输风险由客户承担。',
  },
]);
const selectedTermsTemplateKey = ref('standard');
const termsDeliveryMethod = ref(createEmptyOrder().deliveryMethod);
const termsPaymentMethod = ref(createEmptyOrder().paymentMethod);
const termsFreightPayer = ref(createEmptyOrder().freightPayer || '供方');
const termsRemark = ref('');
const termsTemplateDialogOpen = ref(false);
const activeTermsTemplateKey = ref('standard');
const termsTemplateNotice = ref('');
const termsTemplateDraft = ref<TermsTemplate>({ ...termsTemplates.value[0] });

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
  canWriteSales.value ? '当前销售订单只读，不能维护条款模板。' : salesReadonlyReason.value,
);

const orderTotal = computed(() => {
  const pricing = orderDraft.value?.products.map(linePricing) ?? [];
  const subtotal = pricing.reduce((sum, item) => sum + item.netAmount, 0);
  const tax = pricing.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = pricing.reduce((sum, item) => sum + item.grossAmount, 0);
  return {
    subtotal: formatMoney(subtotal),
    tax: formatMoney(tax),
    total: formatMoney(total),
  };
});

const attachments = computed(() => orderDraft.value?.attachments ?? []);
const relatedOutboundRequest = computed(() => {
  const code = orderDraft.value?.code;
  if (!code) return undefined;
  return outboundRequestRows.value.find((record) => record.sourceOrder === code);
});
const relatedDeliveryRecords = computed(() => {
  const code = orderDraft.value?.code;
  if (!code) return [];
  return salesDeliveryRows.value
    .filter((record) => record.sourceOrder === code)
    .sort((a, b) => `${b.date}-${b.code}`.localeCompare(`${a.date}-${a.code}`));
});
const effectiveDeliveryRecords = computed(() => (
  relatedDeliveryRecords.value.filter((record) => !['已作废', '已取消'].includes(record.status) && !record.reversalCode)
));

function deliveryRecordWarehouseSummary(record: SalesDeliveryRecord) {
  const actualNames = [
    ...(record.actualWarehouses || []).map((warehouse) => warehouse.name),
    ...record.products.flatMap((product) => (
      (product.allocations || [])
        .filter((allocation) => parseNumber(allocation.qty) > 0)
        .map((allocation) => allocation.warehouse)
    )),
  ].filter(Boolean);
  const uniqueNames = [...new Set(actualNames)];
  if (uniqueNames.length) return uniqueNames.join('、');
  if (['待复核', '已出库', '已冲销'].includes(record.status)) return record.warehouse || '—';
  return '待拣货确认';
}

const deliveryOverviewRows = computed(() => {
  const tracking = relatedOutboundRequest.value;
  return [
    { label: '计划发货', value: orderDraft.value?.plannedShipDate || '—' },
    { label: '承诺交付', value: orderDraft.value?.delivery || '—' },
    { label: '发运进度', value: tracking?.status || (orderDocumentStatus.value === '草稿' ? '订单尚未确认' : '等待处理') },
    { label: '出库任务', value: effectiveDeliveryRecords.value.length ? `${effectiveDeliveryRecords.value.length} 笔` : '暂无任务' },
    { label: '客户签收', value: deliveryProgress() === '已签收' ? '已签收' : deliveryProgress() === '待签收' ? '待签收' : '尚未进入签收' },
  ];
});
const salesFollowUpRelatedRecords = computed(() => {
  const records = new Map<string, { type: string; code: string; status: string }>();
  const appendRecord = (type: string, code: string | undefined, status: string) => {
    if (!code) return;
    records.set(`${type}-${code}`, { type, code, status });
  };

  appendRecord('来源报价', orderDraft.value?.sourceQuote, '已转订单');
  appendRecord('出库申请', relatedOutboundRequest.value?.code, relatedOutboundRequest.value?.status || '已关联');

  (orderDraft.value?.products ?? [])
    .flatMap((product) => product.fulfillmentLinks ?? [])
    .forEach((link) => appendRecord(link.type, link.documentCode, link.status || '已关联'));

  relatedDeliveryRecords.value.forEach((record) => {
    appendRecord('销售出库', record.code, record.status || '已关联');
  });

  (orderDraft.value?.commercialFollowUps ?? []).forEach((event) => {
    appendRecord(event.kind === 'sales_invoice' ? '开票记录' : '回款记录', event.referenceNo || event.id, formatMoney(event.amount));
  });

  return Array.from(records.values());
});
function productionProgress() {
  const structured = structuredProgress(orderDraft.value, 'production');
  if (structured) return structured;

  const status = normalizedOrderStatus.value;
  if (orderDocumentStatus.value === '草稿') return '未开始';

  const productionLinks = (orderDraft.value?.products ?? [])
    .flatMap((product) => product.fulfillmentLinks ?? [])
    .filter((link) => link.type === '生产任务');
  if (['已中断', '已作废', '已取消'].includes(status) && !productionLinks.length) return '未记录';
  if (productionLinks.some((link) => link.status.includes('部分入库'))) return '部分入库';
  if (productionLinks.length && productionLinks.every((link) => /已入库|已完成|已关闭/.test(link.status))) return '已入库';

  const waitingLinks = productionLinks.filter((link) => /待建|待释放/.test(link.status));
  if (status === '生产中' || productionLinks.length > waitingLinks.length) return '生产中';
  if (waitingLinks.length) return '待建工单';
  return '无需生产';
}

function deliveryProgress() {
  const structured = structuredProgress(orderDraft.value, 'delivery');
  if (structured) return structured;

  const status = normalizedOrderStatus.value;
  const outboundStatus = relatedOutboundRequest.value?.status ?? '';
  if (['已中断', '已作废', '已取消'].includes(status) && !outboundStatus) return '未记录';
  if (['待开票', '待收款', '部分收款', '已收款', '已完成', '已关闭'].includes(status)) return '已签收';
  if (isAwaitingReceiptStatus(status) || outboundStatus === '已出库') return '待签收';
  if (status === '部分发货' || outboundStatus === '部分发货') return '部分出库';
  if (['发货中', '已申请出库'].includes(status) || ['已提交', '待发货', '仓库已受理'].includes(outboundStatus)) return '待出库';
  return '待分配';
}

function invoiceProgress() {
  const structured = structuredProgress(orderDraft.value, 'invoice');
  if (structured) return structured;

  const status = normalizedOrderStatus.value;
  if (['待收款', '部分收款', '已收款', '已完成', '已关闭'].includes(status)) return '已开票';
  return '未开票';
}

function paymentProgress() {
  const structured = structuredProgress(orderDraft.value, 'payment');
  if (structured) return structured;

  const status = normalizedOrderStatus.value;
  if (['已收款', '已完成', '已关闭'].includes(status)) return '已收款';
  if (status === '部分收款') return '部分收款';
  return '未收款';
}

function fulfillmentAttention() {
  const structured = structuredAttention(orderDraft.value);
  if (structured) return structured;

  const status = normalizedOrderStatus.value;
  if (status === '已中断') return '暂停';
  if (status === '退货处理中') return '异常处理中';

  const code = orderDraft.value?.code;
  const hasDeliveryException = salesDeliveryRows.value.some((record) => (
    record.sourceOrder === code && /异常|差异|不合格|退货/.test(record.status)
  ));
  if (hasDeliveryException) return '异常处理中';
  if (orderDocumentStatus.value === '已作废') return '无需提示';
  return '正常';
}

const orderProgressRows = computed(() => {
  const production = structuredProductionProgress(orderDraft.value);
  const productionDetail = (() => {
    if (!production) return '';
    if (production.mixedUnits) return `${Number(production.lineCount || 0)} 行生产需求，按明细单位查看`;
    if (Number(production.lineCount || 0) <= 0) return '当前订单无需安排生产';
    const unit = typeof production.unit === 'string' ? production.unit : '';
    return [
      `生产需求 ${formatQty(Number(production.productionDemandQty || 0), unit)}`,
      `报工 ${formatQty(Number(production.reportedQty || 0), unit)}`,
      `合格 ${formatQty(Number(production.qualifiedQty || production.completedQty || 0), unit)}`,
      `入库 ${formatQty(Number(production.inboundQty || 0), unit)}`,
    ].join(' · ');
  })();
  return [
    { key: 'production', label: '生产进度', value: salesDisplayText(productionProgress()), detail: productionDetail },
    { key: 'delivery', label: '交付进度', value: deliveryProgress(), detail: '' },
    { key: 'invoice', label: '开票进度', value: invoiceProgress(), detail: '' },
    { key: 'payment', label: '收款进度', value: paymentProgress(), detail: '' },
    { key: 'attention', label: '提醒/异常', value: fulfillmentAttention(), detail: '' },
  ];
});
const lockedOrderTitle = computed(() => {
  if (orderDocumentStatus.value === '已关闭') return '已关闭订单不可直接编辑，如需调整应走变更、冲销或售后流程';
  if (orderDocumentStatus.value === '已作废') return '已作废订单不可编辑';
  if (orderDocumentStatus.value === '已确认') return '已确认订单已进入交付流程，不可直接覆盖原单内容';
  return '当前状态不可编辑';
});
const attachmentReadonlyReason = computed(() => {
  if (!isReadOnly.value) return '';
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (isLockedOrder.value) return lockedOrderTitle.value;
  if (isDetail.value) return '当前销售订单详情只读，不能上传附件。';
  return saveOrderReadonlyReason.value;
});
const orderAttachmentTitle = computed(() => attachmentReadonlyReason.value || '上传盖章合同、客户采购订单、技术协议等文件');
function structuredNextStepGuidance() {
  if (!hasStructuredOrderFacts(orderDraft.value)) return undefined;

  const documentStatus = orderDocumentStatus.value;
  const production = productionProgress();
  const delivery = deliveryProgress();
  const invoice = invoiceProgress();
  const payment = paymentProgress();
  const attention = fulfillmentAttention();

  if (documentStatus === '草稿') {
    return {
      label: isDetail.value ? '确认订单' : '补齐信息后确认订单',
      action: confirmActionLabel.value,
      description: '确认后订单才会进入交付与生产流程；开票和回款由销售在订单内持续登记。',
      tone: 'pending',
    };
  }

  if (documentStatus === '已作废') {
    return {
      label: '单据已作废',
      action: '查看日志',
      description: '订单不再流转；既有交付与商务跟进记录仍保留用于追溯。',
      tone: 'muted',
    };
  }

  if (attention !== '正常' && attention !== '无需提示') {
    return {
      label: attention,
      action: '查看交付记录并跟进',
      description: /退货|售后/.test(attention)
        ? '请在销售售后中跟进退货、退款或补发进度，订单本身保持只读。'
        : /临近|逾期/.test(attention)
          ? '请核对交期、生产进度和出库计划，及时处理时效风险。'
          : '请查看对应异常记录，确认责任人和恢复条件后再继续交付。',
      tone: attention === '暂停' ? 'muted' : 'tracking',
    };
  }

  if (documentStatus === '已关闭') {
    return {
      label: '单据已关闭',
      action: '复核订单结果',
      description: '订单已结束业务流转；交付、开票和收款结果可在本页进度中复核。',
      tone: 'done',
    };
  }

  if (['待建工单', '待释放', '生产中', '待质检', '质量待处置', '待入库放行', '待入库', '部分入库', '暂停'].includes(production)) {
    return {
      label: production === '待建工单' ? '等待安排生产' : production === '待释放' ? '待安排' : production,
      action: production === '待建工单' ? '确认生产任务' : '跟进生产、质检和完工入库',
      description: '请由生产继续推进当前任务；完成入库后再进入交付。',
      tone: 'tracking',
    };
  }

  if (delivery === '待签收') {
    return {
      label: '等待客户签收',
      action: '确认客户签收',
      description: '仓库已完成出库，请确认客户实际签收。',
      tone: 'tracking',
    };
  }

  if (['待分配', '待出库', '部分出库'].includes(delivery)) {
    return {
      label: delivery === '部分出库' ? '跟进剩余交付' : '等待仓库出库',
      action: '核对订单跟进',
      description: delivery === '部分出库'
        ? '已完成部分出库，请核对剩余数量和预计交付时间。'
        : '请核对可用库存、批次分配和本次出库数量。',
      tone: delivery === '待分配' ? 'ready' : 'tracking',
    };
  }

  if (invoice !== '已开票') {
    return {
      label: invoice === '部分开票' ? '跟进剩余开票' : '登记开票进度',
      action: '在本单登记开票',
      description: '销售按客户约定登记实际开票日期、金额和备注。',
      tone: invoice === '部分开票' ? 'tracking' : 'ready',
    };
  }

  if (payment !== '已收款') {
    return {
      label: payment === '部分收款' ? '跟进剩余收款' : '跟进收款',
      action: '跟进回款进度',
      description: '请按客户约定跟进到账，并在本单登记实际回款结果。',
      tone: 'tracking',
    };
  }

  return {
    label: '复核后归档',
    action: '复核订单结果',
    description: '生产、交付、开票和收款均已完成，可在本页复核后归档。',
    tone: 'done',
  };
}

const nextStepGuidance = computed(() => {
  const structured = structuredNextStepGuidance();
  if (structured) return structured;
  return {
    label: '等待履约事实同步',
    action: '刷新订单进度',
    description: '订单跟进只依据单据状态与生产、交付、开票、回款事实；当前缺少结构化进度，请刷新后再判断下一步。',
    tone: 'muted',
  };
});

function orderMaterialKey(product: SalesOrderProduct) {
  return String(product.materialCode || product.name || '').trim().toLocaleLowerCase('zh-CN');
}

function hasValidOrderProductLines(products: SalesOrderProduct[]) {
  if (!products.length) return false;
  const keys = products.map(orderMaterialKey);
  return products.every(
    (product) => (
      orderMaterialKey(product)
      && parseNumber(product.qty) > 0
      && parseNumber(product.unitPrice) > 0
      && taxRateOptions.includes(product.taxRate || '')
    ),
  ) && new Set(keys).size === keys.length;
}

function isIsoDate(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validOrderDeliveryDate(order: SalesOrder) {
  return isIsoDate(order.delivery) && isIsoDate(order.date) && order.delivery >= order.date;
}

function validOrderPlannedShipDate(order: SalesOrder) {
  return (
    isIsoDate(order.plannedShipDate)
    && isIsoDate(order.date)
    && isIsoDate(order.delivery)
    && order.plannedShipDate! >= order.date
    && order.plannedShipDate! <= order.delivery
  );
}

const duplicateOrderMaterialKeys = computed(() => {
  const counts = new Map<string, number>();
  (orderDraft.value?.products || []).forEach((product) => {
    const key = orderMaterialKey(product);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
});
const selectedOrderProductCount = computed(() => (
  (orderDraft.value?.products || []).filter((product) => Boolean(orderMaterialKey(product))).length
));

const orderRequiredFields = computed<Array<{ key: OrderRequiredFieldKey; label: string; done: boolean }>>(() => {
  const draft = orderDraft.value ?? createEmptyOrder();

  return [
    { key: 'company', label: '公司', done: Boolean(draft.company || draft.companyCode) },
    { key: 'customer', label: '客户', done: Boolean(draft.customer || draft.customerCode) },
    { key: 'contact', label: '联系人', done: Boolean(draft.contact) },
    { key: 'contactPhone', label: '联系方式', done: Boolean(draft.contactPhone) },
    { key: 'owner', label: '销售负责人', done: Boolean(draft.owner) },
    { key: 'currency', label: '币种', done: Boolean(draft.currency) },
    { key: 'products', label: '完整且不重复的销售物料明细', done: hasValidOrderProductLines(draft.products) },
    { key: 'delivery', label: '有效的承诺交付日期', done: validOrderDeliveryDate(draft) },
    { key: 'deliveryMethod', label: '对客交付方式', done: Boolean(termsDeliveryMethod.value) },
    { key: 'paymentMethod', label: '付款方式', done: Boolean(termsPaymentMethod.value) },
    { key: 'freightPayer', label: '运费承担', done: Boolean(termsFreightPayer.value) },
    { key: 'logisticsMode', label: '内部发运方式', done: Boolean(draft.logisticsMode) },
    { key: 'plannedShipDate', label: '有效的计划发货日期', done: validOrderPlannedShipDate(draft) },
    { key: 'shipContact', label: '收货人', done: Boolean(draft.shipContact) },
    { key: 'shipPhone', label: '收货联系方式', done: Boolean(draft.shipPhone) },
    { key: 'shipAddress', label: '收货地址', done: Boolean(draft.shipAddress) },
  ];
});
const missingRequiredFields = computed(() => orderRequiredFields.value.filter((field) => !field.done));
const missingRequiredSummary = computed(() => {
  const labels = missingRequiredFields.value.map((field) => field.label);
  if (!labels.length) return '关键字段已齐，可以确认订单。';
  return `请先补齐：${labels.slice(0, 8).join('、')}${labels.length > 8 ? '等' : ''}`;
});
const readinessSummary = computed(() => {
  if (hasStructuredOrderFacts(orderDraft.value)) {
    return structuredNextStepGuidance()?.description || '关键履约事实已同步，可按当前进度推进下一步。';
  }
  if (orderStatus.value === '已完成') return '单据已关闭，交付和商务完成度以关联记录为准。';
  if (['已作废', '已中断', '已取消'].includes(orderStatus.value)) return '订单已停止流转，请查看日志确认原因。';
  if (orderStatus.value === '退货处理中') return '订单正在处理退货，请结合发货和商务记录跟进。';
  if (orderStatus.value === '待收款' || orderStatus.value === '部分收款') return '当前待办为回款跟进，完成度以本单商务记录为准。';
  if (orderStatus.value === '待开票') return '当前待办为登记开票，实际进度以本单商务记录为准。';
  if (isAwaitingReceiptStatus(orderStatus.value)) return '仓库已出库，等待销售确认客户签收。';
  if (orderStatus.value === '发货中' || orderStatus.value === '已申请出库' || orderStatus.value === '部分发货') return '订单正在发货中。';
  if (orderStatus.value === '生产中') return '库存不足，订单正在生产联动中。';
  if (orderStatus.value === '待发货') return '订单已确认，等待仓库发货。';
  if (orderStatus.value === '已确认') return '订单已确认，可在订单跟进中查看后续进度。';
  if (!missingRequiredFields.value.length) return '关键字段已齐，可以推进下一步。';
  return `还有 ${missingRequiredFields.value.length} 项关键信息待补齐。`;
});
const canSubmitOrder = computed(() => canConfirmOrder.value && missingRequiredFields.value.length === 0);
const submitOrderReadonlyReason = computed(() => {
  if (!canConfirmOrder.value) return confirmOrderReadonlyReason.value;
  return missingRequiredFields.value.length ? missingRequiredSummary.value : readinessSummary.value;
});

function isRequiredFieldMissing(key: OrderRequiredFieldKey) {
  return missingRequiredFields.value.some((field) => field.key === key);
}

function requiredFieldClass(key: OrderRequiredFieldKey) {
  return {
    'is-required-field': true,
    'has-field-error': orderValidationAttempted.value && isRequiredFieldMissing(key),
  };
}

function requiredLineProductClass(product: SalesOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && (
      !productIdentity(product, '').trim() || duplicateOrderMaterialKeys.value.has(orderMaterialKey(product))
    ),
  };
}

function requiredLineQtyClass(product: SalesOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && parseNumber(product.qty) <= 0,
  };
}

function requiredLinePriceClass(product: SalesOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && parseNumber(product.unitPrice) <= 0,
  };
}

function requiredLineTaxRateClass(product: SalesOrderProduct) {
  return {
    'has-line-field-error': orderValidationAttempted.value && !taxRateOptions.includes(product.taxRate || ''),
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

function inventoryMaterialCode(row: SalesInventoryProjectionRow) {
  return row.materialCode || '';
}

function qtyUnit(value?: string) {
  return String(value || '').replace(/[\d,.\s-]/g, '').trim();
}

function formatQty(value: number, unit?: string) {
  const text = Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
  return unit ? `${text} ${unit}` : text;
}

function productDeliveryKey(product: { materialCode?: string; name: string }) {
  return product.materialCode || product.name || '';
}

function matchesProduct(row: SalesInventoryProjectionRow | SalesOrderProduct, product: SalesOrderProduct) {
  const rowCode = 'item' in row ? inventoryMaterialCode(row) : row.materialCode || '';
  const rowName = 'item' in row ? row.item : row.name;
  if (product.materialCode && rowCode) return rowCode === product.materialCode;
  return Boolean(product.name && rowName === product.name);
}

function productionLineFactFor(product: SalesOrderProduct, index: number) {
  const lines = structuredProductionProgress(orderDraft.value)?.lines;
  if (!Array.isArray(lines)) return undefined;
  const sourceLineId = product.lineId || `L${index + 1}`;
  return lines.find((line) => line.sourceLineId === sourceLineId)
    || lines.find((line) => Boolean(product.materialCode && line.materialCode === product.materialCode))
    || lines.find((line) => Boolean(product.name && line.name === product.name));
}

function deliveryLineFactFor(product: SalesOrderProduct, index: number) {
  const sourceLineId = product.lineId || `L${index + 1}`;
  return salesDeliveryProgressLines.value.find((line) => line.lineId === sourceLineId)
    || salesDeliveryProgressLines.value.find((line) => Boolean(product.materialCode && line.materialCode === product.materialCode))
    || salesDeliveryProgressLines.value.find((line) => Boolean(product.name && line.name === product.name));
}

const deliveryCapabilityRows = computed(() => {
  const draft = orderDraft.value;
  if (!draft) return [];
  const relatedRecords = salesDeliveryRows.value.filter((record) => (
    record.status === '已出库'
    && !record.reversalCode
    && record.sourceOrder === draft.code
  ));

  return draft.products
    .filter((product) => productIdentity(product, '').trim())
    .map((product, index) => {
      const inventoryRows = warehouseInventoryRows.value.filter((row) => matchesProduct(row, product));
      const unit = product.uom || qtyUnit(product.qty) || qtyUnit(inventoryRows[0]?.available) || '件';
      const deliveryLine = deliveryLineFactFor(product, index);
      const fallbackOrderQty = parseNumber(product.qty);
      const fallbackShippedQty = relatedRecords.reduce((sum, record) => {
        return sum + record.products
          .filter((line) => productDeliveryKey(line) === productDeliveryKey(product))
          .reduce((lineSum, line) => lineSum + parseNumber(line.qty), 0);
      }, 0);
      const orderQty = Number(deliveryLine?.orderedQty ?? fallbackOrderQty);
      const shippedQty = Number(deliveryLine?.outboundQty ?? fallbackShippedQty);
      const closedQty = Number(deliveryLine?.closedQty || 0);
      const deliveryTargetQty = Number(deliveryLine?.deliveryTargetQty ?? Math.max(0, orderQty - closedQty));
      const remainingQty = Number(deliveryLine?.remainingQty ?? Math.max(0, deliveryTargetQty - shippedQty));
      const fulfillmentLinks = product.fulfillmentLinks || [];
      const reservationLinks = fulfillmentLinks.filter((link) => link.type === '库存预留' && !['已释放', '已作废'].includes(link.status));
      const productionLinks = fulfillmentLinks.filter((link) => link.type === '生产任务' && !['已关闭', '已作废'].includes(link.status));
      const structuredReservedQty = inventoryRows.reduce((sum, row) => sum + (row.salesReservationSources || [])
        .filter((source) => source.sourceDoc === draft.code && (!product.lineId || source.sourceLineId === product.lineId))
        .reduce((sourceSum, source) => sourceSum + parseNumber(source.qty), 0), 0);
      const reservedQty = Math.max(
        structuredReservedQty,
        reservationLinks.reduce((sum, link) => sum + parseNumber(link.qty), 0),
      );
      const productionLine = productionLineFactFor(product, index);
      const productionDemandQty = Math.max(
        productionLinks.reduce((sum, link) => sum + parseNumber(link.qty), 0),
        Number(productionLine?.productionDemandQty || 0),
      );
      const reservedCoverageQty = Math.min(remainingQty, reservedQty);
      const productionCoverageQty = Math.min(
        Math.max(0, remainingQty - reservedCoverageQty),
        productionDemandQty,
      );
      const coveredQty = reservedCoverageQty + productionCoverageQty;
      const uncoveredQty = Math.max(0, remainingQty - coveredQty);
      const status =
        !orderQty
          ? '待确认数量'
          : remainingQty <= 0
            ? closedQty > 0 ? '余量已关闭' : '已发完'
            : uncoveredQty <= 0
              ? '已分配'
              : coveredQty > 0
                ? '部分分配'
                : '未分配';

      return {
        key: `${product.materialCode || product.name}-${product.qty}`,
        material: product,
        image: lineImage(product),
        orderedQty: formatQty(orderQty, unit),
        outboundQty: formatQty(shippedQty, unit),
        closedQty: formatQty(closedQty, unit),
        deliveryTargetQty: formatQty(deliveryTargetQty, unit),
        remainingQty: formatQty(remainingQty, unit),
        remainingQtyNumber: remainingQty,
        reservedQty: formatQty(reservedCoverageQty, unit),
        productionDemandQty: formatQty(productionCoverageQty, unit),
        uncoveredQty: formatQty(uncoveredQty, unit),
        coveragePercent: remainingQty <= 0 ? 100 : Math.min(100, Math.round((coveredQty / remainingQty) * 100)),
        status,
      };
    });
});

function deliveryCapabilityStatusClass(status: string) {
  if (status === '已分配' || status === '已发完' || status === '余量已关闭') return 'status-done';
  if (status === '部分分配') return 'status-confirmed';
  if (status === '未分配' || status === '待确认数量') return 'status-pending';
  return 'status-neutral';
}

function productPriceKey(product: Pick<SalesOrderProduct, 'materialCode' | 'name'>) {
  return product.materialCode || product.name || '';
}

function isSalesPriceRecordOrder(order: SalesOrder) {
  const lifecycle = order.documentStatus || order.status;
  return ['已确认', '已关闭'].includes(lifecycle);
}

function matchesPriceRecord(record: SalesPriceReference, product: SalesOrderProduct) {
  if (record.materialCode && product.materialCode) return record.materialCode === product.materialCode;
  return Boolean(product.name && record.productName === product.name);
}

const salesPriceReferenceRows = computed<SalesPriceReference[]>(() => {
  const currentCode = orderDraft.value?.code;

  return salesPriceSourceRows.value.flatMap((order) => {
    if (!isSalesPriceRecordOrder(order) || order.code === currentCode) return [];

    return order.products
      .filter((product) => product.name && (product.grossUnitPrice || product.unitPrice))
      .map((product) => ({
        productKey: productPriceKey(product),
        materialCode: product.materialCode || '',
        productName: product.name,
        product: productIdentity(product, '-'),
        customer: order.customer,
        latestPrice: formatPriceValue(product.grossUnitPrice || product.unitPrice),
        quantity: product.qty,
        sourceDoc: order.code,
        updatedAt: order.date,
      }));
  });
});

function latestPriceReferenceFor(product: SalesOrderProduct) {
  return salesPriceReferenceRows.value
    .filter((record) => matchesPriceRecord(record, product))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.sourceDoc.localeCompare(a.sourceDoc))[0];
}

const orderPriceReferenceRows = computed(() =>
  (orderDraft.value?.products ?? [])
    .filter((product) => productIdentity(product, '').trim())
    .map((product, index) => {
      const reference = latestPriceReferenceFor(product);

      return {
        key: `${productPriceKey(product) || index}-${index}`,
        material: product,
        image: lineImage(product),
        referencePrice: reference?.latestPrice || '暂无记录',
        referenceMeta: reference
          ? `${reference.customer} · ${reference.sourceDoc} · ${reference.updatedAt}`
          : '销售价格记录暂无该物料订单价',
        quantity: reference?.quantity || '',
      };
    }),
);

const priceReferenceSummary = computed(() => {
  const rows = orderPriceReferenceRows.value;
  if (!rows.length) return '选择销售物料后显示销售价格记录中的最近订单价。';
  if (rows.every((row) => row.referencePrice === '暂无记录')) return '当前销售物料暂无历史订单价，可按报价或客户约定定价。';
  return '最近订单价来自其他已确认销售订单，仅作为本次订单的定价参考。';
});

async function loadOrder() {
  isLoading.value = true;
  loadMessage.value = '';
  orderValidationAttempted.value = false;
  if (!isNew.value) {
    orderDraft.value = null;
    flowRecords.value = [];
  }

  try {
    await Promise.all([loadDeliverySignals(), loadCurrencyReferences()]);

    if (isNew.value) {
      orderDraft.value = createEmptyOrder();
      flowRecords.value = [];
      syncTermsFromDraft();
      const sourceQuote = route.query.quote?.toString() ?? '';
      if (sourceQuote) {
        await loadSourceQuote(sourceQuote);
      }
      return;
    }

    const code = route.params.code?.toString();
    if (!code) {
      orderDraft.value = null;
      flowRecords.value = [];
      return;
    }

    const response = await getSalesOrder(code);
    orderDraft.value = toSalesOrder(response.order);
    flowRecords.value = response.flowRecords;
    syncTermsFromDraft();
  } catch (error) {
    orderDraft.value = null;
    flowRecords.value = [];
    loadMessage.value = error instanceof Error ? error.message : '销售订单加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function loadDeliverySignals() {
  try {
    const [inventory, deliveryRecords, orders, outboundRequests] = await Promise.all([
      listSalesInventory(),
      listSalesDeliveryRecords(route.params.code?.toString() || ''),
      listSalesOrders(),
      listSalesOutboundRequests(),
    ]);
    warehouseInventoryRows.value = inventory;
    salesDeliveryRows.value = deliveryRecords;
    salesPriceSourceRows.value = orders;
    outboundRequestRows.value = outboundRequests;
  } catch {
    warehouseInventoryRows.value = [];
    salesDeliveryRows.value = [];
    outboundRequestRows.value = [];
    salesPriceSourceRows.value = [];
  }
}

async function loadCurrencyReferences() {
  try {
    const response = await listReference<MasterDataRecord>('currencies', { activeOnly: true, limit: 50 });
    currencyRows.value = response.items;
    currencyLoadError.value = '';
  } catch (error) {
    currencyRows.value = [];
    currencyLoadError.value = error instanceof Error ? error.message : '币种候选加载失败';
  }
}

function syncTermsFromDraft() {
  const draft = orderDraft.value;
  const template = selectedTermsTemplate.value;
  termsDeliveryMethod.value = normalizeSalesDeliveryMethod(draft?.deliveryMethod || template?.deliveryMethod || '');
  termsPaymentMethod.value = normalizeSalesPaymentMethod(draft?.paymentMethod || template?.paymentMethod || '');
  termsFreightPayer.value = draft?.freightPayer || template?.freightPayer || '供方';
  termsRemark.value = draft?.remark || template?.content || '';
}

function applySelectedTermsTemplate() {
  if (!canManageTermsTemplate.value) return;
  const template = selectedTermsTemplate.value;
  if (!template) return;
  termsDeliveryMethod.value = normalizeSalesDeliveryMethod(template.deliveryMethod);
  termsPaymentMethod.value = normalizeSalesPaymentMethod(template.paymentMethod);
  termsFreightPayer.value = template.freightPayer || '供方';
  termsRemark.value = template.content;
}

function editTermsTemplate(key = selectedTermsTemplateKey.value) {
  if (!canManageTermsTemplate.value) {
    showToast(termsTemplateReadonlyReason.value, 'error');
    return;
  }

  const template = termsTemplates.value.find((item) => item.key === key) ?? termsTemplates.value[0];
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
    name: '新销售条款模板',
    deliveryMethod: normalizeSalesDeliveryMethod(termsDeliveryMethod.value || source?.deliveryMethod || ''),
    paymentMethod: normalizeSalesPaymentMethod(termsPaymentMethod.value || source?.paymentMethod || ''),
    taxMode: source?.taxMode || '含税',
    taxRate: source?.taxRate || '13%',
    freightPayer: termsFreightPayer.value || source?.freightPayer || '供方',
    content: termsRemark.value || source?.content || '',
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

function saveTermsTemplate() {
  if (!canManageTermsTemplate.value) {
    termsTemplateNotice.value = termsTemplateReadonlyReason.value;
    return;
  }

  const nextTemplate = {
    ...termsTemplateDraft.value,
    name: termsTemplateDraft.value.name.trim() || '未命名销售条款',
    deliveryMethod: normalizeSalesDeliveryMethod(termsTemplateDraft.value.deliveryMethod.trim()),
    paymentMethod: normalizeSalesPaymentMethod(termsTemplateDraft.value.paymentMethod.trim()),
    taxMode: termsTemplateDraft.value.taxMode,
    taxRate: termsTemplateDraft.value.taxRate || '13%',
    freightPayer: termsTemplateDraft.value.freightPayer || '供方',
    content: termsTemplateDraft.value.content.trim(),
  };
  const currentIndex = termsTemplates.value.findIndex((template) => template.key === nextTemplate.key);

  if (currentIndex >= 0) termsTemplates.value.splice(currentIndex, 1, nextTemplate);
  else termsTemplates.value.push(nextTemplate);

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

function parseNumber(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function roundCurrency(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function orderLineInputMode(product: SalesOrderProduct) {
  if (product.priceInputMode === '不含税' || product.priceInputMode === '含税') return product.priceInputMode;
  return orderDraft.value?.taxMode === '不含税' ? '不含税' : '含税';
}

function linePricing(product: SalesOrderProduct) {
  const qty = parseNumber(product.qty);
  const inputUnitPrice = parseNumber(product.unitPrice);
  const taxRate = taxRateValue(product.taxRate);
  const priceInputMode = orderLineInputMode(product);
  const netUnitPrice = priceInputMode === '不含税'
    ? inputUnitPrice
    : inputUnitPrice / (1 + taxRate);
  const grossUnitPrice = priceInputMode === '不含税'
    ? inputUnitPrice * (1 + taxRate)
    : inputUnitPrice;
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
  const numberValue = Number(value || 0);
  const roundedToCurrency = Number(numberValue.toFixed(2));
  return Math.abs(numberValue - roundedToCurrency) < 0.000001
    ? numberValue.toFixed(2)
    : numberValue.toFixed(4);
}

function lineUnitPriceValue(product: SalesOrderProduct, mode: '含税' | '不含税') {
  const rawInput = String(product.unitPrice ?? '');
  if (!rawInput.trim()) return '';
  if (orderLineInputMode(product) === mode) return rawInput;
  const pricing = linePricing(product);
  return formatCalculatedUnitPrice(mode === '含税' ? pricing.grossUnitPrice : pricing.netUnitPrice);
}

function updateLineUnitPrice(product: SalesOrderProduct, mode: '含税' | '不含税', event: Event) {
  product.priceInputMode = mode;
  product.unitPrice = (event.target as HTMLInputElement).value;
}

function normalizeLineUnitPrice(product: SalesOrderProduct) {
  if (!String(product.unitPrice ?? '').trim()) return;
  product.unitPrice = formatCurrencyInput(parseNumber(product.unitPrice));
}

function lineUnitPriceTitle(product: SalesOrderProduct, mode: '含税' | '不含税') {
  if (orderLineInputMode(product) === mode) {
    return `当前直接输入${mode === '含税' ? '含税' : '未税'}单价`;
  }
  return '按税率自动换算；必要时保留 4 位小数，以保证行金额计算准确';
}

function formatLineUnitPrice(product: SalesOrderProduct, mode: '含税' | '不含税') {
  if (!String(product.unitPrice ?? '').trim()) return '-';
  const pricing = linePricing(product);
  return formatMoney(mode === '含税' ? pricing.grossUnitPrice : pricing.netUnitPrice);
}

function formatCurrencyMoney(value: number, currency = orderCurrency.value) {
  const numberText = Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'CNY' ? `￥${numberText}` : `${currency} ${numberText}`;
}

function formatMoney(value: number) {
  return formatCurrencyMoney(value);
}

function formatPriceValue(value?: string) {
  const raw = String(value ?? '').trim();
  const matched = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return matched ? formatCurrencyMoney(Number(matched[0]), 'CNY') : raw || '暂无记录';
}

function lineAmountNumber(product: SalesOrderProduct) {
  return linePricing(product).grossAmount;
}

function formatLineAmount(product: SalesOrderProduct) {
  return formatMoney(lineAmountNumber(product));
}

function lineImage(product: Pick<SalesOrderProduct, 'name' | 'imageLabel' | 'imageTone'>) {
  return (
    (product.name && productVisuals[product.name]) || {
      label: product.imageLabel || '',
      tone: product.imageTone || '#eeeeee',
    }
  );
}

function updateLine(index: number, patch: Partial<SalesOrderProduct>) {
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

function customerDefaultLogisticsMode(customer: CustomerReference) {
  return normalizeLogisticsMode(customer.defaultLogisticsMode || customer.deliveryMethod);
}

function customerDefaultShipContact(customer: CustomerReference) {
  return customer.defaultShipContact || '';
}

function customerDefaultShipPhone(customer: CustomerReference) {
  return customer.defaultShipPhone || '';
}

function customerDefaultShipAddress(customer: CustomerReference) {
  return customer.defaultShipAddress || '';
}

function handleCustomerSelect(option: ReferenceOption) {
  if (!orderDraft.value) return;
  if (!option.code && !option.name) {
    orderDraft.value.customerCode = '';
    orderDraft.value.customer = '';
    orderDraft.value.contact = '';
    orderDraft.value.contactPhone = '';
    orderDraft.value.shipContact = '';
    orderDraft.value.shipPhone = '';
    orderDraft.value.shipAddress = '';
    return;
  }
  const customer = option.raw as CustomerReference;
  orderDraft.value.customerCode = customer.code;
  orderDraft.value.customer = customer.name;
  orderDraft.value.contact = customer.contact || '';
  orderDraft.value.contactPhone = customer.phone || '';
  orderDraft.value.logisticsMode = customerDefaultLogisticsMode(customer);
  orderDraft.value.shipContact = customerDefaultShipContact(customer);
  orderDraft.value.shipPhone = customerDefaultShipPhone(customer);
  orderDraft.value.shipAddress = customerDefaultShipAddress(customer);
  termsDeliveryMethod.value = normalizeSalesDeliveryMethod(customer.deliveryMethod || termsDeliveryMethod.value);
  termsPaymentMethod.value = normalizeSalesPaymentMethod(customer.paymentMethod || termsPaymentMethod.value);
}

function handleOwnerSelect(option: ReferenceOption) {
  if (!orderDraft.value) return;
  if (!option.code && !option.name) {
    orderDraft.value.ownerEmployeeCode = '';
    orderDraft.value.owner = '';
    return;
  }
  const employee = option.raw as { name?: string; code?: string };
  orderDraft.value.ownerEmployeeCode = employee.code || option.code || '';
  orderDraft.value.owner = employee.name || option.name || employee.code || option.code;
}

function handleCompanySelect(option: ReferenceOption) {
  if (!orderDraft.value) return;
  orderDraft.value.companyCode = option.code;
  orderDraft.value.company = option.name;
}

async function fillCustomerFromReference() {
  if (!orderDraft.value || (!orderDraft.value.customerCode && !orderDraft.value.customer)) return;
  if (
    orderDraft.value.contact &&
    orderDraft.value.contactPhone &&
    orderDraft.value.shipContact &&
    orderDraft.value.shipPhone &&
    orderDraft.value.shipAddress
  ) {
    return;
  }

  try {
    const response = await listReference<CustomerReference>('customers', {
      q: orderDraft.value.customerCode || orderDraft.value.customer,
      activeOnly: true,
      limit: 10,
    });
    const option =
      response.items.find((item) => item.code === orderDraft.value?.customerCode) ||
      response.items.find((item) => item.name === orderDraft.value?.customer) ||
      response.items[0];
    const customer = option?.raw;
    if (!customer || !orderDraft.value) return;

    orderDraft.value.customerCode = orderDraft.value.customerCode || customer.code;
    orderDraft.value.customer = orderDraft.value.customer || customer.name;
    orderDraft.value.contact = orderDraft.value.contact || customer.contact || '';
    orderDraft.value.contactPhone = orderDraft.value.contactPhone || customer.phone || '';
    orderDraft.value.logisticsMode = orderDraft.value.logisticsMode || customerDefaultLogisticsMode(customer);
    orderDraft.value.shipContact = orderDraft.value.shipContact || customerDefaultShipContact(customer);
    orderDraft.value.shipPhone = orderDraft.value.shipPhone || customerDefaultShipPhone(customer);
    orderDraft.value.shipAddress = orderDraft.value.shipAddress || customerDefaultShipAddress(customer);
    termsDeliveryMethod.value = normalizeSalesDeliveryMethod(customer.deliveryMethod || termsDeliveryMethod.value);
    termsPaymentMethod.value = normalizeSalesPaymentMethod(customer.paymentMethod || termsPaymentMethod.value);
  } catch {
    // Reference data is a convenience fallback; manual entry can still complete the order.
  }
}

async function applyQuote(quote: SalesQuote) {
  if (!orderDraft.value) return;
  if (!quote.code) {
    orderDraft.value.sourceQuote = '';
    return;
  }
  orderDraft.value.sourceQuote = quote.code;
  if (quote.company) orderDraft.value.company = quote.company;
  if (quote.companyCode) orderDraft.value.companyCode = quote.companyCode;
  if (quote.customer) orderDraft.value.customer = quote.customer;
  if (quote.customerCode) orderDraft.value.customerCode = quote.customerCode;
  if (quote.contact) orderDraft.value.contact = quote.contact;
  if (quote.contactPhone) orderDraft.value.contactPhone = quote.contactPhone;
  orderDraft.value.currency = quote.currency || orderDraft.value.currency || 'CNY';
  if (quote.products?.length) {
    orderDraft.value.products = quote.products.map((product) => {
      const priceInputMode = product.priceInputMode === '不含税' ? '不含税' : '含税';
      const fallbackUnitPrice = priceInputMode === '不含税' ? product.netUnitPrice : product.grossUnitPrice;
      return {
        ...createEmptyLine(),
        ...product,
        priceInputMode,
        unitPrice: String(product.unitPrice ?? '').trim()
          ? formatCurrencyInput(parseNumber(product.unitPrice))
          : String(fallbackUnitPrice ?? '').trim()
            ? formatCurrencyInput(parseNumber(fallbackUnitPrice || ''))
            : '',
        taxRate: product.taxRate || '13%',
        amount: product.grossAmount || product.amount,
      };
    });
  }
  orderDraft.value.deliveryMethod = normalizeSalesDeliveryMethod(quote.deliveryMethod || orderDraft.value.deliveryMethod);
  orderDraft.value.paymentMethod = normalizeSalesPaymentMethod(quote.paymentMethod || orderDraft.value.paymentMethod);
  orderDraft.value.taxMode = '含税';
  orderDraft.value.taxRate = quote.taxRate || orderDraft.value.taxRate;
  orderDraft.value.logisticsMode = normalizeLogisticsMode(orderDraft.value.logisticsMode || quote.deliveryMethod || '');
  orderDraft.value.remark = quote.remark || orderDraft.value.remark;
  await fillCustomerFromReference();
  syncTermsFromDraft();
}

function handleQuoteSelect(option: ReferenceOption) {
  const quote = option.raw as QuoteReference & SalesQuote;
  void applyQuote(quote);
}

async function loadSourceQuote(code: string) {
  if (!code || !orderDraft.value) return;
  try {
    const response = await getSalesQuote(code);
    await applyQuote(response.quote);
  } catch {
    orderDraft.value.sourceQuote = code;
    loadMessage.value = '没有找到来源报价或后端暂时不可用，请手工补充订单明细。';
  }
}

function handleProductSelect(index: number, option: ReferenceOption) {
  if (!option.code && !option.name) {
    if (orderDraft.value) orderDraft.value.products[index] = createEmptyLine();
    return;
  }
  const material = option.raw as MaterialReference;
  const currentLine = orderDraft.value?.products[index] ?? createEmptyLine();
  const referenceUnitPrice = parseNumber(material.latestPrice || '');
  updateLine(index, {
    materialCode: material.code,
    name: material.name,
    model: material.model || '',
    spec: material.spec || '',
    qty: currentLine.qty || `1 ${material.uom || '件'}`,
    priceInputMode: '含税',
    unitPrice: referenceUnitPrice > 0 ? formatCurrencyInput(referenceUnitPrice) : '',
    amount: '',
    taxRate: currentLine.taxRate || '13%',
    uom: material.uom || '',
    imageLabel: material.imageLabel || '',
    imageTone: material.imageTone || '',
  });
}

function buildOrderForSave(): SalesOrder {
  const draft = orderDraft.value ?? createEmptyOrder();
  return {
    ...draft,
    currency: draft.currency || 'CNY',
    deliveryMethod: termsDeliveryMethod.value,
    paymentMethod: termsPaymentMethod.value,
    freightPayer: termsFreightPayer.value || '供方',
    taxMode: '含税',
    logisticsMode: normalizeLogisticsMode(draft.logisticsMode),
    plannedShipDate: draft.plannedShipDate || draft.delivery,
    shipAddress: draft.shipAddress || '',
    shipContact: draft.shipContact || draft.contact,
    shipPhone: draft.shipPhone || draft.contactPhone || '',
    supplementaryRequirement: String(draft.supplementaryRequirement || '').trim(),
    internalNote: String(draft.internalNote || '').trim(),
    remark: termsRemark.value,
    netAmount: orderTotal.value.subtotal,
    taxAmount: orderTotal.value.tax,
    amount: orderTotal.value.total,
    products: draft.products.map((product) => {
      const normalizedProduct = {
        ...product,
        unitPrice: String(product.unitPrice ?? '').trim()
          ? formatCurrencyInput(parseNumber(product.unitPrice))
          : '',
      };
      const pricing = linePricing(normalizedProduct);
      return {
        ...normalizedProduct,
        netUnitPrice: formatCalculatedUnitPrice(pricing.netUnitPrice),
        grossUnitPrice: formatCalculatedUnitPrice(pricing.grossUnitPrice),
        netAmount: formatMoney(pricing.netAmount),
        taxAmount: formatMoney(pricing.taxAmount),
        grossAmount: formatMoney(pricing.grossAmount),
        amount: formatMoney(pricing.grossAmount),
      };
    }),
  };
}

async function persistOrder() {
  if (!canModifyOrderContent.value) {
    showToast(saveOrderReadonlyReason.value || salesReadonlyReason.value, 'error');
    return null;
  }
  const wasChangeMode = isChangeMode.value;
  isSaving.value = true;
  try {
    const response = await saveSalesOrder(buildOrderForSave(), { changeMode: isChangeMode.value });
    orderDraft.value = toSalesOrder(response.order);
    flowRecords.value = response.flowRecords;
    resetUnsavedChanges();
    showToast(
      missingRequiredFields.value.length
        ? `${wasChangeMode ? '订单变更已保存' : '草稿已保存'}；确认前还需补齐：${missingRequiredFields.value.map((field) => field.label).join('、')}`
        : wasChangeMode
          ? '销售订单变更已保存'
          : '销售订单草稿已保存',
    );
    return response.order;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '销售订单保存失败', 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveOrderDraft() {
  await runOrderAction('save', async () => {
    const saved = await persistOrder();
    if (!saved) return;
    resetUnsavedChanges();
    if (isNew.value) await router.replace(`/sales/orders/${encodeURIComponent(saved.code)}/edit`);
  });
}

async function deleteDraftOrder() {
  if (!orderDraft.value || !canDeleteDraftOrder.value) {
    showToast('只有未确认的草稿可以删除', 'error');
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: `删除销售订单草稿 ${orderDraft.value.code}？`,
    message: '删除后不可恢复，尚未确认的订单内容及附件将一并移除。',
    confirmLabel: '确认删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  await runOrderAction('delete', async () => {
    isSaving.value = true;
    try {
      await deleteSalesOrder(orderDraft.value!.code);
      resetUnsavedChanges();
      showToast('销售订单草稿已删除');
      await router.replace('/sales/orders');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除草稿失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function voidCurrentOrder() {
  if (!orderDraft.value) return;

  const confirmed = await requestActionConfirmation({
    title: `作废销售订单 ${orderDraft.value.code}？`,
    message: '作废后订单会停止后续交付、出库和回款流转，历史记录仍会保留。',
    confirmLabel: '确认作废',
    tone: 'danger',
  });
  if (!confirmed) return;

  await runOrderAction('void', async () => {
    isSaving.value = true;
    try {
      const response = await voidSalesOrder(
        orderDraft.value!.code,
        Number(orderDraft.value!.revision || 0),
      );
      orderDraft.value = toSalesOrder(response.order);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast('销售订单已作废');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '销售订单作废失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function confirmOrderDraft() {
  if (!canConfirmOrder.value) {
    showToast(confirmOrderReadonlyReason.value, 'error');
    return;
  }

  orderValidationAttempted.value = true;
  if (!canSubmitOrder.value) {
    showToast(missingRequiredSummary.value, 'error');
    await nextTick();
    scrollToFirstMissingField();
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: isChangeMode.value ? '提交当前订单变更？' : '确认当前销售订单？',
    message: isChangeMode.value
      ? '系统将保存本次调整，并以更新后的订单内容继续后续履约。'
      : '系统将先保存当前内容，再进入备货、生产和交付流程；确认后不能直接覆盖原单内容。',
    confirmLabel: isChangeMode.value ? '提交变更' : '确认订单',
  });
  if (!confirmed) return;

  await runOrderAction('confirm', async () => {
    if (isChangeMode.value) {
      const saved = await persistOrder();
      if (saved) await router.replace(`/sales/orders/${encodeURIComponent(saved.code)}`);
      return;
    }

    const saved = await persistOrder();
    if (!saved) return;

    isSaving.value = true;
    try {
      const response = await confirmSalesOrder(saved.code, Number(saved.revision || 0));
      orderDraft.value = toSalesOrder(response.order);
      flowRecords.value = response.flowRecords;
      orderValidationAttempted.value = false;
      resetUnsavedChanges();
      showToast('销售订单已确认');
      await router.replace(`/sales/orders/${encodeURIComponent(response.order.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '确认订单失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function confirmArrival() {
  if (!orderDraft.value || !canConfirmArrival.value) {
    showToast(confirmOrderReadonlyReason.value || '当前状态不能确认签收', 'error');
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: `确认客户已签收 ${orderDraft.value.code}？`,
    message: '确认后交付事实将更新为已签收，并进入开票与回款跟进；请先核对客户实际收货数量和交付异常。',
    confirmLabel: '确认已签收',
  });
  if (!confirmed) return;

  await runOrderAction('arrival', async () => {
    isSaving.value = true;
    try {
      const response = await confirmSalesOrderReceipt(
        orderDraft.value!.code,
        Number(orderDraft.value!.revision || 0),
      );
      orderDraft.value = toSalesOrder(response.order);
      flowRecords.value = response.flowRecords;
      await loadDeliverySignals();
      showToast('客户签收已确认，交付进度已更新');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '确认签收失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function openDeliveryRemainderDialog() {
  if (!canCloseDeliveryRemainder.value) {
    showToast('只有已经发生部分出库且仍有待发余量的销售订单，才能关闭待发余量。', 'error');
    return;
  }
  deliveryRemainderDialogOpen.value = true;
}

async function submitDeliveryRemainderClosure(reason: string) {
  if (!orderDraft.value || !canCloseDeliveryRemainder.value) return;
  await runOrderAction('closeRemainder', async () => {
    isSaving.value = true;
    try {
      const response = await closeSalesOrderDeliveryRemainder(
        orderDraft.value!.code,
        Number(orderDraft.value!.revision || 0),
        reason,
      );
      orderDraft.value = toSalesOrder(response.order);
      flowRecords.value = response.flowRecords;
      deliveryRemainderDialogOpen.value = false;
      await loadDeliverySignals();
      showToast('待发余量已关闭，未开始的出库任务已取消，剩余预留已释放');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '关闭待发余量失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function statusClass(status: string) {
  return statusPresentationClass(status);
}

function salesDisplayText(value: unknown) {
  return String(value || '')
    .replace(/生产任务共同承接/g, '库存与生产共同满足')
    .replace(/生产任务承接/g, '生产需求')
    .replace(/待释放/g, '待安排')
    .replace(/部分释放/g, '部分安排')
    .replace(/已释放/g, '已安排')
    .replace(/承接/g, '分配')
    .replace(/履约/g, '交付')
    .replace(/回写/g, '同步');
}

function statusLabel(status: string) {
  const normalizedStatus = normalizeOrderStatus(status);
  if (normalizedStatus !== status) return normalizedStatus;
  if (status === '已发货' || status === '已出库') return '待签收';
  if (status === '已收款') return '已完成';
  return status;
}

function previewOrderPdf() {
  if (!orderDraft.value?.code) return;
  const previewPath = router.resolve({
    name: 'sales-order-pdf',
    params: { code: orderDraft.value.code },
  }).href;
  window.open(previewPath, '_blank', 'noopener,noreferrer');
}

function pinCurrentOrderAsReference() {
  if (!orderDraft.value || !canPinAsReference.value) return;

  referencePanel.openReference({
    title: `销售订单 ${orderDraft.value.code}`,
    subtitle: `${orderDraft.value.customer || '未选择客户'} · ${orderDocumentStatus.value}`,
    path: `/sales/orders/${encodeURIComponent(orderDraft.value.code)}`,
  });
  showToast('已打开悬浮参考窗');
}

function handleMoreOrderAction(action: OrderMoreAction) {
  if (action.disabled) return;

  moreActionsOpen.value = false;
  if (action.key === 'edit' && orderDraft.value?.code) {
    void router.push(`/sales/orders/${encodeURIComponent(orderDraft.value.code)}/edit`);
    return;
  }

  if (action.key === 'delete-draft') {
    void deleteDraftOrder();
    return;
  }

  if (action.key === 'after-sale' && orderDraft.value?.code) {
    void router.push({
      path: '/sales/after-sales/new',
      query: { source: orderDraft.value.code },
    });
    return;
  }

  if (action.key === 'void') {
    void voidCurrentOrder();
  }
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
  showToast(`已选择 ${files.length} 个附件，保存后随销售订单保留。`);
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
    const response = await createCommercialFollowUp('sales', code, payload);
    orderDraft.value = response.order as SalesOrder;
    const refreshed = await getSalesOrder(code);
    orderDraft.value = refreshed.order;
    flowRecords.value = refreshed.flowRecords;
    showToast(payload.kind === 'sales_invoice' ? '开票进度已登记。' : '回款进度已登记。');
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
    const response = await removeCommercialFollowUp('sales', code, event.id);
    orderDraft.value = response.order as SalesOrder;
    const refreshed = await getSalesOrder(code);
    orderDraft.value = refreshed.order;
    flowRecords.value = refreshed.flowRecords;
    showToast(event.kind === 'sales_invoice' ? '开票登记已删除。' : '回款登记已删除。');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '商务进度删除失败。', 'error');
  } finally {
    isCommercialFollowUpSaving.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    moreActionsOpen.value = false;
    loadOrder();
  },
  { immediate: true },
);
</script>

<template>
  <div class="page-stack">
    <section
      v-if="orderDraft"
      class="quote-editor order-editor"
      :class="{ 'is-detail-view': isDetail, 'is-delivery-view': isDeliveryView }"
    >
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/sales/orders" aria-label="返回销售订单列表" title="返回销售订单列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? orderDraft.code : pageHeading }}</strong>
        </template>

        <template #actions>
          <template v-if="isDetail">
            <button
              v-if="canPinAsReference"
              class="secondary-action topbar-optional-action"
              type="button"
              title="打开悬浮参考窗"
              aria-controls="reference-side-panel"
              :aria-expanded="referencePanel.open"
              @click="pinCurrentOrderAsReference"
            >
              <PanelRightOpen :size="15" />
              悬浮
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="预览销售订单，可打印或保存为 PDF" @click="previewOrderPdf">
              <FileDown :size="15" />
              PDF
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="查看销售订单流转日志" @click="showFlowRecords = true">
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
                  v-for="action in moreOrderActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :disabled="action.disabled"
                  :title="action.disabled ? action.disabledReason : action.description"
                  @click="handleMoreOrderAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.disabled ? action.disabledReason : action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="canCloseDeliveryRemainder"
              class="secondary-action danger-action async-document-action"
              type="button"
              :disabled="isSaving || isOrderActionPending"
              :aria-busy="activeOrderAction === 'closeRemainder'"
              title="按实际出库量结束本单交付，取消未开始的出库任务并释放剩余库存预留"
              @click="openDeliveryRemainderDialog"
            >
              <XCircle :size="15" />
              关闭待发余量
            </button>
            <button
              v-if="showConfirmOrderInDetail"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isOrderActionPending || isLoading || !canSubmitOrder"
              :aria-busy="activeOrderAction === 'confirm'"
              :title="submitOrderReadonlyReason"
              @click="confirmOrderDraft"
            >
              <CheckCircle2 :size="15" />
              {{ activeOrderAction === 'confirm' ? '确认中' : '确认' }}
            </button>
            <button
              v-if="canConfirmArrival"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isOrderActionPending"
              :aria-busy="activeOrderAction === 'arrival'"
              title="确认签收后，交付进度更新为已签收，订单仍保持已确认"
              @click="confirmArrival"
            >
              <CheckCircle2 :size="15" />
              {{ activeOrderAction === 'arrival' ? '签收中' : '签收' }}
            </button>
          </template>

          <template v-else-if="!isLockedOrder">
            <button
              v-if="canDeleteDraftOrder"
              class="secondary-action danger-action"
              type="button"
              :disabled="isSaving || isOrderActionPending || isLoading"
              :aria-busy="activeOrderAction === 'delete'"
              title="删除未确认的销售订单草稿"
              @click="deleteDraftOrder"
            >
              <Trash2 :size="15" />
              {{ activeOrderAction === 'delete' ? '删除中' : '删除草稿' }}
            </button>
            <button class="secondary-action async-document-action" type="button" :disabled="isSaving || isOrderActionPending || isLoading || !canModifyOrderContent" :aria-busy="activeOrderAction === 'save'" :title="saveActionTitle" @click="saveOrderDraft">
              <Save :size="15" />
              {{ activeOrderAction === 'save' ? '保存中' : saveActionLabel }}
            </button>
            <button class="primary-action async-document-action" type="button" :disabled="isSaving || isOrderActionPending || isLoading || !canConfirmOrder" :aria-busy="activeOrderAction === 'confirm'" :title="submitOrderReadonlyReason" @click="confirmOrderDraft">
              <CheckCircle2 :size="15" />
              {{ activeOrderAction === 'confirm' ? '处理中' : confirmActionLabel }}
            </button>
          </template>
          <template v-else>
            <button class="secondary-action" type="button" disabled title="销售订单已锁定，不能继续编辑">
              <Pencil :size="15" />
              已锁定
            </button>
          </template>
        </template>

        <template #fallback>
          <div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1><p v-if="loadMessage" class="section-hint">{{ loadMessage }}</p></div></div>
        </template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="currencyLoadError" class="access-denied-banner reference-load-warning" role="alert">
        <strong>币种候选加载失败</strong>
        <span>{{ currencyLoadError }}。当前保留订单已有币种；重试成功后可选择其他启用币种。</span>
        <div class="access-denied-actions">
          <button type="button" class="notice-refresh-button" @click="loadCurrencyReferences">重试加载币种</button>
        </div>
      </section>

      <nav v-if="isDetail" class="order-detail-tabs" aria-label="销售订单详情页">
        <RouterLink
          :to="orderContentPath"
          :class="{ active: !isDeliveryView }"
          :aria-current="!isDeliveryView ? 'page' : undefined"
        >
          订单内容
        </RouterLink>
        <RouterLink
          :to="orderDeliveryPath"
          :class="{ active: isDeliveryView }"
          :aria-current="isDeliveryView ? 'page' : undefined"
        >
          订单跟进
        </RouterLink>
      </nav>

      <section v-if="isDeliveryView" class="order-next-step-strip" :class="`tone-${nextStepGuidance.tone}`">
        <div>
          <span>当前待办</span>
          <strong>{{ nextStepGuidance.label }}</strong>
          <p>{{ nextStepGuidance.description }}</p>
        </div>
      </section>

      <div v-if="!isDeliveryView" class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>{{ isDetail ? '订单信息' : '基本信息' }}</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid quote-detail-fact-grid order-detail-fact-grid">
              <div><dt>销售订单号</dt><dd>{{ orderDraft.code }}</dd></div>
              <div><dt>下单日期</dt><dd>{{ orderDraft.date || '—' }}</dd></div>
              <div><dt>来源报价</dt><dd><RouterLink v-if="orderDraft.sourceQuote" :to="`/sales/quotes/${encodeURIComponent(orderDraft.sourceQuote)}`">{{ orderDraft.sourceQuote }}</RouterLink><span v-else>直接下单</span></dd></div>
              <div><dt>公司</dt><dd>{{ orderDraft.company || '—' }}</dd></div>
              <div><dt>客户</dt><dd>{{ orderDraft.customer || '—' }}</dd></div>
              <div><dt>联系人</dt><dd>{{ orderDraft.contact || '—' }}</dd></div>
              <div><dt>联系方式</dt><dd>{{ orderDraft.contactPhone || '—' }}</dd></div>
              <div><dt>销售负责人</dt><dd>{{ orderDraft.owner || '—' }}</dd></div>
              <div><dt>优先级</dt><dd>{{ orderDraft.priority || '正常' }}</dd></div>
              <div class="order-internal-note-fact"><dt>订单备注（销售内部）</dt><dd>{{ orderDraft.internalNote?.trim() || '—' }}</dd></div>
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
              <label class="form-field" :class="requiredFieldClass('customer')" data-required-field="customer">
                <span class="field-label required-label">客户</span>
                <ReferencePicker
                  required
                  v-model="orderDraft.customerCode"
                  type="customers"
                  title="选择客户"
                  placeholder="选择客户"
                  search-placeholder="搜索客户编码、名称、联系人或地址"
                  :display-value="orderDraft.customer"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleCustomerSelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('contact')" data-required-field="contact">
                <span class="field-label required-label">联系人</span>
                <input v-model="orderDraft.contact" type="text" placeholder="联系人" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('contactPhone')" data-required-field="contactPhone">
                <span class="field-label required-label">联系方式</span>
                <input v-model="orderDraft.contactPhone" type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('owner')" data-required-field="owner">
                <span class="field-label required-label">销售负责人</span>
                <ReferencePicker
                  required
                  v-model="orderDraft.ownerEmployeeCode"
                  type="employees"
                  kind="sales-document-owner"
                  title="选择销售负责人"
                  placeholder="选择销售负责人"
                  search-placeholder="搜索员工姓名、部门、手机号或邮箱"
                  :display-value="orderDraft.owner"
                  :disabled="isReadOnly"
                  @select="handleOwnerSelect"
                />
              </label>
              <label class="form-field">
                <span>优先级</span>
                <select v-model="orderDraft.priority" :disabled="isReadOnly">
                  <option>正常</option>
                  <option>加急</option>
                </select>
              </label>
              <label class="form-field">
                <span>来源报价</span>
                <ReferencePicker
                  v-model="orderDraft.sourceQuote"
                  type="sales-quotes"
                  title="选择来源报价"
                  placeholder="选择报价单"
                  search-placeholder="搜索报价单号、客户或销售物料"
                  :display-value="orderDraft.sourceQuote"
                  :disabled="isReadOnly"
                  @select="handleQuoteSelect"
                />
              </label>
              <label class="form-field">
                <span>销售订单号</span>
                <input v-model="orderDraft.code" type="text" readonly />
              </label>
              <label class="form-field">
                <span>下单日期</span>
                <input v-model="orderDraft.date" type="date" readonly />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>销售物料明细</h2>
              <div class="quote-line-section-tools">
                <select
                  v-model="orderDraft.currency"
                  class="quote-line-currency-select"
                  :class="{ 'has-field-error': orderValidationAttempted && isRequiredFieldMissing('currency') }"
                  :disabled="isReadOnly"
                  aria-label="币种"
                  title="选择订单币种"
                  data-required-field="currency"
                >
                  <option v-for="currency in currencyOptions" :key="currency" :value="currency">{{ currency }}</option>
                </select>
                <button v-if="!isReadOnly" class="secondary-action compact-action" type="button" title="添加明细行" @click="addLine">
                  <Plus :size="14" />
                  添加销售物料
                </button>
              </div>
            </div>

            <div v-if="isDetail" class="master-relation-table-wrap quote-detail-table-wrap">
              <table class="master-relation-table quote-detail-table">
                <thead>
                  <tr>
                    <th>销售物料</th>
                    <th>数量</th>
                    <th>未税单价</th>
                    <th>税率</th>
                    <th>含税单价</th>
                    <th>含税金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, index) in orderDraft.products" :key="`${item.materialCode || item.name}-${index}`">
                    <td>
                      <MaterialIdentity
                        :name="item.name"
                        :code="item.materialCode"
                        :model="item.model"
                        :spec="item.spec"
                        :image-url="lineImage(item).url"
                        :image-label="lineImage(item).label"
                        :image-tone="lineImage(item).tone"
                      />
                    </td>
                    <td>{{ item.qty || '-' }}</td>
                    <td>{{ formatLineUnitPrice(item, '不含税') }}</td>
                    <td>{{ item.taxRate || '-' }}</td>
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
              <div class="quote-line-row quote-tax-line-row quote-line-head" :class="{ 'no-actions': isReadOnly }">
                <span>图片</span>
                <span class="field-label required-label">销售物料</span>
                <span class="field-label required-label">数量</span>
                <span class="field-label required-label">未税单价</span>
                <span class="field-label required-label">税率</span>
                <span class="field-label required-label">含税单价</span>
                <span>含税金额</span>
                <span v-if="!isReadOnly"></span>
              </div>
              <div
                v-for="(item, index) in orderDraft.products"
                :key="`${item.materialCode || 'new'}-${index}`"
                class="quote-line-row quote-tax-line-row"
                :class="{ 'no-actions': isReadOnly }"
              >
                <span class="product-thumb" :style="{ backgroundColor: lineImage(item).tone }">
                  <img v-if="lineImage(item).url" :src="lineImage(item).url" alt="" />
                  <span v-else>{{ lineImage(item).label }}</span>
                </span>
                <ReferencePicker
                  required
                  v-model="item.materialCode"
                  :class="requiredLineProductClass(item)"
                  type="materials"
                  title="选择销售物料"
                  placeholder="选择销售物料"
                  search-placeholder="搜索可销售物料编码、名称、型号或规格"
                  kind="销售"
                  :display-value="productIdentity(item, '选择销售物料')"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="(option) => handleProductSelect(index, option)"
                />
                <QuantityWithUnitInput
                  v-model="item.qty"
                  :class="requiredLineQtyClass(item)"
                  :unit="item.uom"
                  placeholder="数量"
                  :readonly="isReadOnly"
                />
                <input
                  :value="lineUnitPriceValue(item, '不含税')"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0.00"
                  :readonly="isReadOnly"
                  :class="requiredLinePriceClass(item)"
                  aria-label="未税单价"
                  :title="lineUnitPriceTitle(item, '不含税')"
                  @input="updateLineUnitPrice(item, '不含税', $event)"
                  @blur="normalizeLineUnitPrice(item)"
                />
                <select v-model="item.taxRate" :disabled="isReadOnly" :class="requiredLineTaxRateClass(item)" aria-label="税率">
                  <option v-for="option in taxRateOptions" :key="option" :value="option">{{ option }}</option>
                </select>
                <input
                  :value="lineUnitPriceValue(item, '含税')"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0.00"
                  :readonly="isReadOnly"
                  :class="requiredLinePriceClass(item)"
                  aria-label="含税单价"
                  :title="lineUnitPriceTitle(item, '含税')"
                  @input="updateLineUnitPrice(item, '含税', $event)"
                  @blur="normalizeLineUnitPrice(item)"
                />
                <strong>{{ formatLineAmount(item) }}</strong>
                <button
                  v-if="!isReadOnly"
                  class="row-icon-button"
                  type="button"
                  aria-label="删除销售明细"
                  :title="orderDraft.products.length <= 1 ? '至少保留一行销售明细' : '删除销售明细'"
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
              <h2>商务条款</h2>
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

            <template v-if="isDetail">
              <dl class="material-fact-grid quote-detail-fact-grid quote-terms-fact-grid order-terms-fact-grid">
                <div><dt>承诺交付日期</dt><dd>{{ orderDraft.delivery || '—' }}</dd></div>
                <div><dt>对客交付方式</dt><dd>{{ termsDeliveryMethod || '—' }}</dd></div>
                <div><dt>运费承担</dt><dd>{{ termsFreightPayer || '—' }}</dd></div>
                <div><dt>付款方式</dt><dd>{{ termsPaymentMethod || '—' }}</dd></div>
              </dl>
              <div v-if="termsRemark" class="quote-terms-note">
                <span>补充条款</span>
                <p class="material-note-copy">{{ salesDisplayText(termsRemark) }}</p>
              </div>
            </template>

            <div v-else class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('delivery')" data-required-field="delivery">
                <span class="field-label required-label">承诺交付日期</span>
                <input v-model="orderDraft.delivery" type="date" :min="orderDraft.date || undefined" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('deliveryMethod')" data-required-field="deliveryMethod">
                <span class="field-label required-label">对客交付方式</span>
                <select v-model="termsDeliveryMethod" :disabled="isReadOnly">
                  <option v-for="option in deliveryOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('freightPayer')" data-required-field="freightPayer">
                <span class="field-label required-label">运费承担</span>
                <select v-model="termsFreightPayer" :disabled="isReadOnly">
                  <option v-for="payer in freightPayerOptions" :key="payer" :value="payer">{{ payer }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('paymentMethod')" data-required-field="paymentMethod">
                <span class="field-label required-label">付款方式</span>
                <select v-model="termsPaymentMethod" :disabled="isReadOnly">
                  <option v-for="option in paymentOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field full-field">
                <span>补充条款</span>
                <textarea
                  v-model="termsRemark"
                  class="terms-textarea"
                  rows="6"
                  placeholder="可直接填写包装、交付、验收、付款等条款；需要套用模板请点击右上角模板。"
                  :readonly="isReadOnly"
                ></textarea>
              </label>
            </div>
          </section>

          <section v-if="!isDetail" class="form-section">
            <div class="form-section-head">
              <h2>内部发货要求</h2>
            </div>

            <div class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('logisticsMode')" data-required-field="logisticsMode">
                <span class="field-label required-label">内部发运方式</span>
                <select v-model="orderDraft.logisticsMode" :disabled="isReadOnly">
                  <option v-for="mode in logisticsModeOptions" :key="mode" :value="mode">{{ mode }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('plannedShipDate')" data-required-field="plannedShipDate">
                <span class="field-label required-label">计划发货日期</span>
                <input
                  v-model="orderDraft.plannedShipDate"
                  type="date"
                  :min="orderDraft.date || undefined"
                  :max="orderDraft.delivery || undefined"
                  :readonly="isReadOnly"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('shipContact')" data-required-field="shipContact">
                <span class="field-label required-label">收货人</span>
                <input v-model="orderDraft.shipContact" type="text" placeholder="收货人" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('shipPhone')" data-required-field="shipPhone">
                <span class="field-label required-label">收货联系方式</span>
                <input v-model="orderDraft.shipPhone" type="tel" inputmode="tel" autocomplete="shipping tel" placeholder="收货电话" :readonly="isReadOnly" />
              </label>
              <label class="form-field full-field" :class="requiredFieldClass('shipAddress')" data-required-field="shipAddress">
                <span class="field-label required-label">收货地址</span>
                <input v-model="orderDraft.shipAddress" type="text" placeholder="收货地址或自提说明" :readonly="isReadOnly" />
              </label>
              <label class="form-field full-field">
                <span>补充要求</span>
                <textarea
                  v-model="orderDraft.supplementaryRequirement"
                  class="terms-textarea order-note-textarea"
                  rows="3"
                  placeholder="填写包装、标签、批次、质量或其他需要生产、仓库关注的补充要求"
                  :readonly="isReadOnly"
                ></textarea>
              </label>
            </div>
          </section>

          <section v-if="!isDetail" class="form-section">
            <div class="form-section-head">
              <h2>订单备注</h2>
            </div>
            <div class="quote-fields">
              <label class="form-field full-field">
                <span>销售内部备注</span>
                <textarea
                  v-model="orderDraft.internalNote"
                  class="terms-textarea order-note-textarea"
                  rows="2"
                  placeholder="填写仅供销售内部查看的沟通、跟进或商务备注"
                  :readonly="isReadOnly"
                ></textarea>
              </label>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              title="订单状态"
              :primary-status="orderDocumentStatus"
              aria-label="销售订单单据状态"
            />
          </section>

          <section v-if="!isDetail" class="summary-section">
            <div class="form-section-head order-summary-heading">
              <h2>确认前检查</h2>
              <i class="mini-status" :class="statusClass(orderDocumentStatus)">{{ orderDocumentStatus }}</i>
            </div>
            <div class="order-progress-grid order-readiness-grid">
              <div class="order-progress-item">
                <span>必填项</span>
                <strong>{{ orderRequiredFields.length - missingRequiredFields.length }}/{{ orderRequiredFields.length }} 已完成</strong>
              </div>
              <div class="order-progress-item">
                <span>销售物料</span>
                <strong>{{ selectedOrderProductCount }} 项</strong>
              </div>
            </div>
            <p class="reference-summary order-readiness-note">{{ missingRequiredSummary }}</p>
          </section>

          <section v-if="!isDetail" class="summary-section">
            <h2>订单价参考</h2>
            <p class="reference-summary">{{ priceReferenceSummary }}</p>
            <div class="price-reference-list">
              <div v-for="item in orderPriceReferenceRows" :key="`${item.key}-price`" class="price-reference-card">
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
                  <span>最近订单价</span>
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
                :title="orderAttachmentTitle"
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
              <span>{{ isReadOnly ? '暂无附件' : '可上传盖章合同、客户采购订单、技术协议等文件' }}</span>
            </div>
          </section>
        </aside>
      </div>

      <div v-else class="quote-form-grid order-delivery-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>内部发货要求</h2>
            </div>
            <dl class="material-fact-grid quote-detail-fact-grid order-shipping-fact-grid">
              <div><dt>内部发运方式</dt><dd>{{ orderDraft.logisticsMode || '—' }}</dd></div>
              <div><dt>计划发货日期</dt><dd>{{ orderDraft.plannedShipDate || '—' }}</dd></div>
              <div><dt>收货人</dt><dd>{{ orderDraft.shipContact || '—' }}</dd></div>
              <div><dt>收货联系方式</dt><dd>{{ orderDraft.shipPhone || '—' }}</dd></div>
              <div class="order-address-fact"><dt>收货地址</dt><dd>{{ orderDraft.shipAddress || '—' }}</dd></div>
            </dl>
            <div v-if="orderDraft.supplementaryRequirement" class="quote-terms-note">
              <span>补充要求</span>
              <p class="material-note-copy">{{ orderDraft.supplementaryRequirement }}</p>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>交付与备货明细</h2>
            </div>
            <div v-if="deliveryCapabilityRows.length" class="delivery-reference-list order-delivery-supply-list">
              <div v-for="row in deliveryCapabilityRows" :key="row.key" class="delivery-reference-card">
                <div class="delivery-reference-head">
                  <MaterialIdentity
                    compact
                    :name="row.material.name"
                    :code="row.material.materialCode"
                    :model="row.material.model"
                    :spec="row.material.spec"
                    :image-label="row.image.label"
                    :image-tone="row.image.tone"
                  />
                  <i class="mini-status" :class="deliveryCapabilityStatusClass(row.status)">{{ row.status }}</i>
                </div>
                <dl class="sales-delivery-line-facts">
                  <div><dt>订单数量</dt><dd>{{ row.orderedQty }}</dd></div>
                  <div><dt>累计出库</dt><dd>{{ row.outboundQty }}</dd></div>
                  <div><dt>关闭余量</dt><dd>{{ row.closedQty }}</dd></div>
                  <div><dt>待发数量</dt><dd>{{ row.remainingQty }}</dd></div>
                </dl>
                <div v-if="row.remainingQtyNumber > 0" class="delivery-reference-grid">
                  <span><small>库存已备</small><b>{{ row.reservedQty }}</b></span>
                  <span><small>生产需求</small><b>{{ row.productionDemandQty }}</b></span>
                  <span :class="{ 'has-gap': row.status === '未分配' || row.status === '部分分配' }"><small>待分配</small><b>{{ row.uncoveredQty }}</b></span>
                </div>
                <p v-else class="delivery-reference-complete">
                  {{ row.status === '余量已关闭' ? '本行已按实际出库完成，剩余数量已关闭。' : '本行已按订单数量全部出库。' }}
                </p>
                <div v-if="row.remainingQtyNumber > 0" class="order-supply-coverage">
                  <span>需求已分配</span>
                  <i><b :style="{ width: `${row.coveragePercent}%` }"></b></i>
                  <strong>{{ row.coveragePercent }}%</strong>
                </div>
              </div>
            </div>
            <div v-else class="delivery-reference-empty">
              当前销售订单没有可显示的物料备货信息。
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>出库任务与记录</h2>
            </div>
            <div v-if="effectiveDeliveryRecords.length" class="order-delivery-issue-list">
              <article v-for="record in effectiveDeliveryRecords" :key="record.code" class="order-delivery-issue-card">
                <div class="order-delivery-issue-head">
                  <div>
                    <strong>{{ record.code }}</strong>
                    <span>{{ record.date || '日期待确认' }}</span>
                  </div>
                  <i class="mini-status" :class="statusClass(record.status)">{{ record.status }}</i>
                </div>
                <div class="order-delivery-issue-products">
                  <span>出库物料</span>
                  <div class="order-delivery-issue-product-list">
                    <span
                      v-for="product in record.products"
                      :key="product.sourceLineId || product.lineId || product.materialCode || product.name"
                    >
                      <MaterialIdentity
                        compact
                        :name="product.name"
                        :code="product.materialCode"
                        :model="product.model"
                        :spec="product.spec"
                        :image-label="lineImage(product).label"
                        :image-tone="lineImage(product).tone"
                      />
                      <small>{{ productQtyWithUnit(product) }}</small>
                    </span>
                  </div>
                </div>
                <dl class="order-delivery-issue-meta">
                  <div><dt>实际出库仓库</dt><dd>{{ deliveryRecordWarehouseSummary(record) }}</dd></div>
                  <div><dt>发运方式</dt><dd>{{ record.deliveryMethod || '待确认' }}</dd></div>
                  <div><dt>经办人</dt><dd>{{ record.owner || '—' }}</dd></div>
                </dl>
              </article>
            </div>
            <div v-else class="delivery-reference-empty">
              暂无有效出库任务。
            </div>
          </section>

          <section id="commercial-follow-up" class="form-section">
            <div class="section-heading">
              <h2>开票与回款</h2>
            </div>
            <CommercialFollowUpPanel
              module="sales"
              :events="orderDraft.commercialFollowUps ?? []"
              :total-amount="parseNumber(orderDraft.amount)"
              :can-write="canWriteSales && orderDocumentStatus !== '草稿' && orderDocumentStatus !== '已作废'"
              :disabled-reason="!canWriteSales
                ? salesReadonlyReason
                : orderDocumentStatus === '草稿'
                  ? '销售订单确认后才能登记商务进度。'
                  : '已作废订单不能新增商务进度。'"
              :busy="isCommercialFollowUpSaving"
              @submit="submitCommercialFollowUp"
              @remove="deleteCommercialFollowUpEntry"
            />
          </section>

        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="订单进度"
              :primary-status="orderDocumentStatus"
              :items="orderProgressRows"
              aria-label="销售订单生产、交付、开票和收款进度"
            />
          </section>

          <section class="summary-section follow-up-related-section">
            <div class="form-section-head">
              <h2>关联记录</h2>
              <span class="follow-up-related-count">{{ salesFollowUpRelatedRecords.length }} 项</span>
            </div>
            <div v-if="salesFollowUpRelatedRecords.length" class="follow-up-related-list">
              <article
                v-for="record in salesFollowUpRelatedRecords"
                :key="`${record.type}-${record.code}`"
                class="follow-up-related-record"
              >
                <span>{{ record.type }}</span>
                <div>
                  <strong>{{ record.code }}</strong>
                  <small>{{ record.status }}</small>
                </div>
              </article>
            </div>
            <div v-else class="delivery-reference-empty">
              暂无关联执行记录。
            </div>
          </section>

          <section class="summary-section">
            <div class="form-section-head">
              <h2>交付概览</h2>
            </div>
            <div class="commercial-summary-list">
              <div v-for="row in deliveryOverviewRows" :key="row.label" class="commercial-summary-row">
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
          </section>

        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="销售订单"
      :message="loadMessage"
      back-path="/sales/orders"
      back-label="销售订单列表"
      @retry="loadOrder"
    />

    <TermsTemplateDialog
      v-model:draft="termsTemplateDraft"
      :open="termsTemplateDialogOpen"
      title="销售条款模板"
      :templates="termsTemplates"
      :active-key="activeTermsTemplateKey"
      :can-delete="canDeleteTermsTemplate"
      :notice="termsTemplateNotice"
      :readonly="!canManageTermsTemplate"
      :readonly-reason="termsTemplateReadonlyReason"
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
      title="销售订单日志"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />

    <RemainderClosureDialog
      business="sales"
      :open="deliveryRemainderDialogOpen"
      :record-code="orderDraft?.code || ''"
      :lines="deliveryRemainderLines"
      :busy="activeOrderAction === 'closeRemainder'"
      @close="deliveryRemainderDialogOpen = false"
      @submit="submitDeliveryRemainderClosure"
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
.order-summary-heading {
  margin-bottom: 10px;
}

.order-progress-item .mini-status {
  justify-self: start;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-progress-item.is-attention {
  grid-column: 1 / -1;
}

.order-readiness-grid {
  margin-bottom: 10px;
}

.order-readiness-note {
  margin: 0;
  padding-top: 9px;
  border-top: 1px solid #ecece5;
}

.order-detail-tabs {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  justify-self: start;
  gap: 3px;
  width: max-content;
  max-width: 100%;
  padding: 3px;
  border: 1px solid #e1e3de;
  border-radius: 8px;
  background: #f1f2ee;
}

.order-detail-tabs a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  min-height: 34px;
  padding: 0 16px;
  border-radius: 6px;
  color: #626861;
  font-size: 13px;
  font-weight: 680;
  text-decoration: none;
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.order-detail-tabs a:hover {
  color: #171916;
  background: #e7e9e4;
}

.order-detail-tabs a.active {
  color: #fff;
  background: #171916;
}

.order-delivery-supply-list {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.order-delivery-supply-list .delivery-reference-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.sales-delivery-line-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  margin: 0;
  border: 1px solid #e5e8e1;
  border-radius: 8px;
  background: #fff;
}

.sales-delivery-line-facts > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 9px;
  border-left: 1px solid #e5e8e1;
}

.sales-delivery-line-facts > div:first-child {
  border-left: 0;
}

.sales-delivery-line-facts dt {
  color: #7b817b;
  font-size: 10px;
}

.sales-delivery-line-facts dd {
  overflow: hidden;
  margin: 0;
  color: #363d37;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-delivery-supply-list .delivery-reference-grid span {
  display: grid;
  justify-content: initial;
  gap: 2px;
  padding: 7px 8px;
  border-radius: 7px;
  background: #f1f3ee;
}

.order-delivery-supply-list .delivery-reference-grid span.has-gap {
  background: #f7f0e5;
}

.order-delivery-supply-list .delivery-reference-grid small {
  color: #7b817b;
  font-size: 10px;
}

.order-delivery-supply-list .delivery-reference-grid b {
  font-size: 12px;
}

.order-supply-coverage {
  display: grid;
  grid-template-columns: auto minmax(70px, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: #707770;
  font-size: 10px;
}

.order-supply-coverage > i {
  overflow: hidden;
  height: 4px;
  border-radius: 999px;
  background: #e5e9e3;
}

.order-supply-coverage > i b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #708f79;
}

.order-supply-coverage > strong {
  color: #4b6553;
  font-size: 10px;
}

.delivery-reference-complete {
  margin: 0;
  color: #6f776f;
  font-size: 12px;
  line-height: 1.5;
}

.order-delivery-issue-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
  gap: 10px;
}

.order-delivery-issue-card {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid #e7e9e3;
  border-radius: 9px;
  background: #fbfcf9;
}

.order-delivery-issue-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.order-delivery-issue-head > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.order-delivery-issue-head strong {
  color: #303630;
  font-size: 13px;
}

.order-delivery-issue-head span {
  color: #7a817b;
  font-size: 11px;
  line-height: 1.45;
}

.order-delivery-issue-products {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.order-delivery-issue-products > span {
  color: #7a817b;
  font-size: 10px;
}

.order-delivery-issue-product-list {
  display: grid;
  gap: 0;
  min-width: 0;
}

.order-delivery-issue-product-list > span {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid #e7eae5;
}

.order-delivery-issue-product-list > span:first-child {
  padding-top: 0;
  border-top: 0;
}

.order-delivery-issue-product-list .material-identity {
  flex: 1 1 0;
  width: 0;
}

.order-delivery-issue-product-list small {
  flex: 0 0 auto;
  color: #4d554e;
  font-size: 11px;
  font-weight: 650;
}

.order-delivery-issue-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

.order-delivery-issue-meta > div {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 6px 7px;
  border-radius: 7px;
  background: #f1f3ef;
}

.order-delivery-issue-meta dt {
  color: #808680;
  font-size: 10px;
}

.order-delivery-issue-meta dd {
  overflow: hidden;
  margin: 0;
  color: #454c46;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 901px) and (max-width: 1280px) {
  .order-editor.is-detail-view:not(.is-delivery-view) .quote-summary-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .order-editor.is-detail-view:not(.is-delivery-view) .quote-summary-panel .summary-section {
    border-top: 1px solid #ecece5;
    border-left: 0;
  }

  .order-editor.is-detail-view:not(.is-delivery-view) .quote-summary-panel .summary-section:first-child {
    border-top: 0;
  }

}

@media (max-width: 820px) {
  .order-detail-tabs {
    width: max-content;
  }

  .order-delivery-supply-list {
    grid-template-columns: 1fr;
  }

  .order-delivery-supply-list .delivery-reference-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sales-delivery-line-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sales-delivery-line-facts > div:nth-child(3) {
    border-top: 1px solid #e5e8e1;
    border-left: 0;
  }

  .sales-delivery-line-facts > div:nth-child(4) {
    border-top: 1px solid #e5e8e1;
  }
}

@media (max-width: 560px) {
  .order-detail-tabs a {
    min-width: 88px;
    padding: 0 12px;
  }

  .order-delivery-issue-list,
  .order-delivery-issue-meta {
    grid-template-columns: 1fr;
  }
}
</style>
