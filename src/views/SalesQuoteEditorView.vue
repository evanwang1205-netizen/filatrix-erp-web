<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
import TermsTemplateDialog from '../components/TermsTemplateDialog.vue';
import { DEFAULT_COMPANY_CODE, DEFAULT_COMPANY_NAME } from '../constants/company';
import { requestActionConfirmation } from '../composables/useActionConfirmation';
import { useAsyncActionState } from '../composables/useAsyncActionState';
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard';
import { scrollElementIntoView } from '../utils/focusNavigation';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { productVisuals } from '../data/sales';
import {
  confirmSalesQuote,
  getSalesQuote,
  listReference,
  listSalesOrders,
  saveSalesQuote,
  voidSalesQuote,
} from '../services/api';
import { useSessionStore } from '../stores/session';
import type { MasterDataRecord } from '../data/masterData';
import type { TermsTemplate } from '../types/termsTemplate';
import type {
  FlowRecord,
  ReferenceOption,
  SalesOrder,
  SalesQuote,
  SalesQuoteProduct,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';
import { taxRateOptions, taxRateValue } from '../utils/taxCalculation';
import { productIdentity } from '../utils/productDisplay';
import {
  normalizeSalesDeliveryMethod,
  normalizeSalesPaymentMethod,
  salesDeliveryMethodOptions,
  salesPaymentOptions,
} from '../utils/salesTerms';
import { attachmentsFromFileList } from '../utils/attachmentUpload';

type CustomerReference = {
  code: string;
  name: string;
  contact?: string;
  phone?: string;
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
type QuoteRequiredFieldKey =
  | 'company'
  | 'customer'
  | 'contact'
  | 'contactPhone'
  | 'date'
  | 'currency'
  | 'owner'
  | 'products'
  | 'validUntil'
  | 'deliveryMethod'
  | 'paymentMethod'
  | 'freightPayer';

type QuoteAsyncAction = 'save' | 'confirm' | 'void';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { canWrite: canWriteSales, readonlyReason: salesReadonlyReason } = useModulePermission('sales');
const { canOperate: canApproveSales, readonlyReason: salesApproveReadonlyReason } = useOperationPermission('salesApprove', '确认销售单据');
const showFlowRecords = ref(false);
const quoteDraft = ref<SalesQuote | null>(createEmptyQuote());
const flowRecords = ref<FlowRecord[]>([]);
const salesPriceSourceRows = ref<SalesOrder[]>([]);
const currencyRows = ref<ReferenceOption<MasterDataRecord>[]>([]);
const isSaving = ref(false);
const {
  activeAction: activeQuoteAction,
  isActionPending: isQuoteActionPending,
  runAction: runQuoteAction,
} = useAsyncActionState<QuoteAsyncAction>();
const quoteValidationAttempted = ref(false);
const loadMessage = ref('');
const currencyLoadError = ref('');
const isLoading = ref(false);
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
let toastTimer: number | undefined;

const deliveryOptions = salesDeliveryMethodOptions;
const paymentOptions = salesPaymentOptions;
const freightPayerOptions = ['供方', '客户'];
function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createEmptyLine(): SalesQuoteProduct {
  return {
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

function createEmptyQuote(): SalesQuote {
  return {
    code: '系统自动生成',
    currency: 'CNY',
    companyCode: DEFAULT_COMPANY_CODE,
    company: DEFAULT_COMPANY_NAME,
    customerCode: '',
    customer: '',
    contact: '',
    contactPhone: '',
    products: [createEmptyLine()],
    amount: '￥0.00',
    owner: session.user.name || '待识别',
    ownerEmployeeCode: '',
    ownerAccountCode: session.user.accountCode || '',
    status: '草稿',
    date: today(),
    validUntil: today(7),
    deliveryMethod: '本厂配送',
    paymentMethod: '月结 30 天',
    freightPayer: '供方',
    taxMode: '含税',
    remark: '',
    attachments: [],
  };
}

function toSalesQuote(source: Partial<SalesQuote>): SalesQuote {
  const quote = {
    ...createEmptyQuote(),
    ...source,
    products: source.products?.length
      ? source.products.map((product) => ({
          ...createEmptyLine(),
          ...product,
          unitPrice: String(product.unitPrice ?? '').trim()
            ? formatCurrencyInput(parseNumber(product.unitPrice))
            : '',
          priceInputMode: product.priceInputMode || (source.taxMode === '不含税' ? '不含税' : '含税'),
          taxRate: product.taxRate || source.taxRate || '13%',
        }))
      : [createEmptyLine()],
    attachments: source.attachments ?? [],
  };

  return {
    ...quote,
    deliveryMethod: normalizeSalesDeliveryMethod(quote.deliveryMethod),
    paymentMethod: normalizeSalesPaymentMethod(quote.paymentMethod),
  };
}

const mode = computed(() => route.name?.toString() ?? '');
const isNew = computed(() => mode.value === 'sales-quote-new');
const isEdit = computed(() => mode.value === 'sales-quote-edit');
const isDetail = computed(() => mode.value === 'sales-quote-detail');
const quoteStatus = computed(() => quoteDraft.value?.status ?? '');
const quoteCurrency = computed(() => quoteDraft.value?.currency || 'CNY');
const currencyOptions = computed(() => {
  const codes = currencyRows.value
    .filter((row) => row.status !== '停用')
    .map((row) => String(row.code || '').trim().toUpperCase())
    .filter(Boolean);
  const currentCurrency = quoteCurrency.value;
  if (currentCurrency && !codes.includes(currentCurrency)) codes.unshift(currentCurrency);
  return codes.length ? codes : ['CNY'];
});
const isLocked = computed(() => ['已转订单', '已作废'].includes(quoteStatus.value));
const isReadOnly = computed(() => isDetail.value || isLocked.value || !canWriteSales.value);
const isQuoteExpired = computed(() => {
  const validUntil = quoteDraft.value?.validUntil || '';
  return Boolean(validUntil && validUntil < today());
});
const { resetUnsavedChanges } = useUnsavedChangesGuard(quoteDraft, {
  enabled: computed(() => !isReadOnly.value),
  ready: computed(() => !isLoading.value),
});
const referenceTitle = computed(() => `报价单 ${quoteDraft.value?.code || ''}`.trim());
const referenceSubtitle = computed(() => `${quoteDraft.value?.customer || '未选择客户'} · ${quoteDraft.value?.status || ''}`);
const referencePath = computed(() => (quoteDraft.value?.code ? `/sales/quotes/${encodeURIComponent(quoteDraft.value.code)}` : ''));
const relatedOrderPath = computed(() => (
  quoteDraft.value?.convertedOrderCode
    ? `/sales/orders/${encodeURIComponent(quoteDraft.value.convertedOrderCode)}`
    : ''
));
const canConvertQuote = computed(() => (
  quoteStatus.value === '已确认'
  && !isQuoteExpired.value
  && canWriteSales.value
));
const canRenewExpiredQuote = computed(() => ['草稿', '已确认'].includes(quoteStatus.value) && isQuoteExpired.value && canWriteSales.value);
const canConfirmQuote = computed(() => quoteStatus.value === '草稿' && canWriteSales.value && canApproveSales.value);
const canVoidQuoteStatus = computed(() => ['草稿', '已确认'].includes(quoteStatus.value));
const canVoidCurrentQuote = computed(() => canVoidQuoteStatus.value && canWriteSales.value && canApproveSales.value);
const saveQuoteActionTitle = computed(() =>
  !canWriteSales.value
    ? salesReadonlyReason.value
    : quoteStatus.value === '已确认'
      ? '保存变更后报价退回草稿，需要重新确认。'
      : '保存草稿，确认前可继续调整报价信息。',
);
const confirmQuoteReadonlyReason = computed(() => {
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (!canApproveSales.value) return salesApproveReadonlyReason.value;
  if (quoteStatus.value !== '草稿') return '当前状态不能重复确认报价。';
  return '';
});
const voidQuoteReadonlyReason = computed(() => {
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (!canApproveSales.value) return salesApproveReadonlyReason.value;
  if (!canVoidQuoteStatus.value) return '当前状态不可作废。';
  return '作废当前报价单';
});
const operationPermissionHint = computed(() => (
  canWriteSales.value && !canApproveSales.value ? salesApproveReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u4fdd\u5b58\u5e76\u786e\u8ba4\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';
const quoteMoreActionsOpen = ref(false);
const attachmentReadonlyReason = computed(() => {
  if (!isReadOnly.value) return '';
  if (!canWriteSales.value) return salesReadonlyReason.value;
  if (isLocked.value) return '当前报价单已锁定，不能上传附件。';
  if (isDetail.value) return '当前报价单详情只读，不能上传附件。';
  return confirmQuoteReadonlyReason.value;
});
const quoteAttachmentTitle = computed(() => attachmentReadonlyReason.value || '上传客户确认单、报价附件、技术说明等文件');
const quoteAttachments = computed(() => quoteDraft.value?.attachments ?? []);

function hasCompleteQuoteRequiredData() {
  const draft = quoteDraft.value;
  if (!draft) return false;
  const commonComplete = Boolean(
    (draft.company || draft.companyCode) &&
    (draft.customer || draft.customerCode) &&
    draft.contact &&
    draft.contactPhone &&
    draft.date &&
    draft.currency &&
    draft.owner &&
    hasValidQuoteProductLines(draft.products) &&
    draft.validUntil &&
    draft.paymentMethod &&
    draft.deliveryMethod &&
    draft.freightPayer,
  );
  return commonComplete;
}

const quoteNextStepGuidance = computed(() => {
  const status = quoteStatus.value;
  if (status === '草稿') {
    if (isQuoteExpired.value) {
      return {
        label: '更新有效期',
        action: '更新后再确认报价',
        description: `草稿有效期已于 ${quoteDraft.value?.validUntil || '-'} 到期。请先核对价格和商务条款，再更新有效期。`,
        tone: 'warning',
      };
    }
    return {
      label: '确认报价',
      action: hasCompleteQuoteRequiredData() ? '使用顶部“确认”' : '补齐信息后确认报价',
      description: '确认后报价进入客户确认口径，可继续转销售订单；未确认前仍作为销售草稿保存。',
      tone: 'pending',
    };
  }

  if (status === '已确认') {
    if (isQuoteExpired.value) {
      return {
        label: '更新有效期',
        action: '变更后才能转订单',
        description: `报价已于 ${quoteDraft.value?.validUntil || '-'} 到期。请先核对价格和商务条款，再更新有效期。`,
        tone: 'warning',
      };
    }
    return {
      label: '转销售订单',
      action: '客户接受后生成销售订单',
      description: '报价已确认，客户接受后可从本单生成销售订单，并自动带入客户、销售物料、价格和条款。',
      tone: 'ready',
    };
  }

  if (status === '已转订单') {
    return {
      label: '跟进关联订单',
      action: '查看关联订单',
      description: '报价已沉淀为正式销售订单，后续发货、开票、收款在销售订单流程内跟进。',
      tone: 'done',
    };
  }

  if (status === '已作废') {
    return {
      label: '流程已结束',
      action: '查看日志',
      description: '报价已停止流转，保留历史内容和作废记录便于追溯。',
      tone: 'muted',
    };
  }

  return {
    label: '检查状态',
    action: '查看日志',
    description: '当前报价状态不在标准流程中，请结合日志确认原因。',
    tone: 'muted',
  };
});

const pageHeading = computed(() => {
  if (isNew.value) return '新建报价单';
  if (isEdit.value) return isLocked.value ? '报价单只读' : quoteStatus.value === '草稿' ? '编辑报价单' : '报价单变更';
  return '报价单详情';
});

type QuoteMoreAction = {
  key: 'edit' | 'void';
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  tone?: 'default' | 'danger';
};

const quoteMoreActions = computed<QuoteMoreAction[]>(() => {
  if (!isDetail.value) return [];
  const actions: QuoteMoreAction[] = [];
  if (!isLocked.value && canWriteSales.value) {
    actions.push({
      key: 'edit',
      label: quoteStatus.value === '草稿' ? '编辑' : '变更',
      description: quoteStatus.value === '草稿' ? '直接调整报价草稿内容。' : '保存变更后退回草稿，重新确认后才可转订单。',
    });
  }
  if (canVoidQuoteStatus.value) {
    actions.push({
      key: 'void',
      label: '作废',
      description: '终止当前报价单流转，并保留作废记录。',
      disabled: isSaving.value || !canVoidCurrentQuote.value,
      disabledReason: voidQuoteReadonlyReason.value || '当前状态不可作废。',
      tone: 'danger',
    });
  }
  return actions;
});

async function handleQuoteMoreAction(action: QuoteMoreAction) {
  if (action.disabled) return;
  quoteMoreActionsOpen.value = false;
  if (action.key === 'edit') {
    await router.push(`/sales/quotes/${encodeURIComponent(quoteDraft.value?.code || '')}/edit`);
    return;
  }
  await voidCurrentQuote();
}

const termsTemplates = ref<TermsTemplate[]>([
  {
    key: 'standard',
    name: '标准报价条款',
    deliveryMethod: '本厂配送',
    paymentMethod: '月结 30 天',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '供方',
    content: '报价按双方确认规格执行；报价有效期内价格有效；交付到客户指定地址；付款按月结 30 天执行。',
  },
  {
    key: 'prepay',
    name: '预付款报价',
    deliveryMethod: '本厂配送',
    paymentMethod: '预付款 30%',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '供方',
    content: '客户确认报价后预付款 30%，发货前付清尾款；产品按双方确认规格执行；交付和验收按后续订单约定。',
  },
  {
    key: 'pickup',
    name: '客户自提报价',
    deliveryMethod: '客户自提',
    paymentMethod: '款到发货',
    taxMode: '含税',
    taxRate: '13%',
    freightPayer: '客户',
    content: '客户到厂自提，提货前完成付款；报价不含运输费用；提货时双方确认数量、包装及外观。',
  },
]);
const selectedTermsTemplateKey = ref('standard');
const activeTermsTemplateKey = ref('standard');
const termsTemplateDialogOpen = ref(false);
const termsTemplateNotice = ref('');
const termsTemplateDraft = ref<TermsTemplate>({ ...termsTemplates.value[0] });
const selectedTermsTemplate = computed(
  () => termsTemplates.value.find((template) => template.key === selectedTermsTemplateKey.value) ?? termsTemplates.value[0],
);
const canManageTermsTemplate = computed(() => !isReadOnly.value);
const canDeleteTermsTemplate = computed(
  () =>
    !isReadOnly.value &&
    termsTemplates.value.length > 1 &&
    termsTemplates.value.some((template) => template.key === termsTemplateDraft.value.key),
);
const termsTemplateReadonlyReason = computed(() =>
  !canWriteSales.value
    ? salesReadonlyReason.value
    : '当前报价单只读，不能维护条款模板。',
);

const canOpenTermsTemplate = computed(() => !isReadOnly.value);

const lineItems = computed(() =>
  (quoteDraft.value?.products ?? []).map((product, index) => ({
    key: `${product.materialCode || product.name || 'new'}-${index}`,
    ...product,
    image:
      (product.name && productVisuals[product.name]) || {
        label: product.imageLabel || '',
        tone: product.imageTone || '#eeeeee',
      },
  })),
);

const totals = computed(() => {
  const pricing = quoteDraft.value?.products.map(linePricing) ?? [];
  const subtotal = pricing.reduce((sum, item) => sum + item.netAmount, 0);
  const tax = pricing.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = pricing.reduce((sum, item) => sum + item.grossAmount, 0);
  return {
    subtotal: formatMoney(subtotal),
    tax: formatMoney(tax),
    total: formatMoney(total),
  };
});

const quoteConvertActionLabel = computed(() => {
  if (quoteStatus.value === '已转订单') return '已转订单';
  if (quoteStatus.value !== '已确认') return '待确认';
  return '转订单';
});

const quoteValiditySummary = computed(() => {
  if (quoteStatus.value === '已作废') {
    return { label: '不再适用', detail: '报价已作废，仅保留历史记录。', tone: 'muted' };
  }
  if (quoteStatus.value === '已转订单') {
    return { label: '不再适用', detail: '报价已转订单，后续交付在关联销售订单中继续。', tone: 'muted' };
  }
  if (!quoteDraft.value?.validUntil) {
    return { label: quoteStatus.value || '待维护', detail: '尚未设置报价有效期。', tone: 'warning' };
  }
  if (isQuoteExpired.value) {
    return { label: '已过期', detail: `有效期至 ${quoteDraft.value.validUntil}，更新后方可转订单。`, tone: 'warning' };
  }
  return {
    label: '有效',
    detail: `报价有效期至 ${quoteDraft.value.validUntil}。`,
    tone: quoteStatus.value === '已确认' ? 'done' : 'pending',
  };
});

const quoteStatusPanelItems = computed<DocumentStatusItem[]>(() => [
  {
    key: 'validity',
    label: '报价有效性',
    value: quoteValiditySummary.value.label,
    detail: quoteValiditySummary.value.detail,
    kind: 'status',
    tone: quoteValiditySummary.value.tone === 'done'
      ? 'success'
      : ['warning', 'pending'].includes(quoteValiditySummary.value.tone)
        ? 'warning'
        : 'neutral',
  },
]);

const quoteRequiredFields = computed<Array<{ key: QuoteRequiredFieldKey; label: string; done: boolean }>>(() => {
  const draft = quoteDraft.value ?? createEmptyQuote();

  return [
    { key: 'company', label: '公司', done: Boolean(draft.company || draft.companyCode) },
    { key: 'customer', label: '客户', done: Boolean(draft.customer || draft.customerCode) },
    { key: 'contact', label: '联系人', done: Boolean(draft.contact) },
    { key: 'contactPhone', label: '联系方式', done: Boolean(draft.contactPhone) },
    { key: 'date', label: '报价日期', done: Boolean(draft.date) },
    { key: 'currency', label: '币种', done: Boolean(draft.currency) },
    { key: 'owner', label: '报价人', done: Boolean(draft.owner) },
    { key: 'products', label: '销售物料明细', done: hasValidQuoteProductLines(draft.products) },
    {
      key: 'validUntil',
      label: '有效期',
      done: Boolean(draft.validUntil && (!draft.date || draft.validUntil >= draft.date)),
    },
    { key: 'paymentMethod', label: '付款方式', done: Boolean(draft.paymentMethod) },
    { key: 'deliveryMethod', label: '交付方式', done: Boolean(draft.deliveryMethod) },
    { key: 'freightPayer', label: '运费承担', done: Boolean(draft.freightPayer) },
  ];
});
const missingRequiredFields = computed(() => quoteRequiredFields.value.filter((field) => !field.done));
const missingRequiredSummary = computed(() => {
  const labels = missingRequiredFields.value.map((field) => field.label);
  if (!labels.length) return '关键字段已齐，可以确认报价。';
  return `请先补齐：${labels.join('、')}`;
});
const canSubmitQuote = computed(() => canConfirmQuote.value && missingRequiredFields.value.length === 0 && !isQuoteExpired.value);
const submitQuoteReadonlyReason = computed(() => {
  if (!canConfirmQuote.value) return confirmQuoteReadonlyReason.value;
  if (isQuoteExpired.value) return '报价有效期已过，请更新有效期后再确认。';
  return missingRequiredSummary.value;
});

function isRequiredFieldMissing(key: QuoteRequiredFieldKey) {
  return missingRequiredFields.value.some((field) => field.key === key);
}

function requiredFieldClass(key: QuoteRequiredFieldKey) {
  return {
    'is-required-field': true,
    'has-field-error': quoteValidationAttempted.value && isRequiredFieldMissing(key),
  };
}

function requiredLineProductClass(product: SalesQuoteProduct) {
  return {
    'has-line-field-error': quoteValidationAttempted.value && (
      !productIdentity(product, '').trim() || isDuplicateQuoteProduct(product)
    ),
  };
}

function requiredLineQtyClass(product: SalesQuoteProduct) {
  return {
    'has-line-field-error': quoteValidationAttempted.value && parseNumber(product.qty) <= 0,
  };
}

function requiredLinePriceClass(product: SalesQuoteProduct) {
  return {
    'has-line-field-error': quoteValidationAttempted.value && parseNumber(product.unitPrice) <= 0,
  };
}

function requiredLineTaxRateClass(product: SalesQuoteProduct) {
  return {
    'has-line-field-error': quoteValidationAttempted.value && !taxRateOptions.includes(product.taxRate),
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

function parseNumber(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function quoteProductKey(product: SalesQuoteProduct) {
  return String(product.materialCode || productIdentity(product, '')).trim().toLowerCase();
}

function isDuplicateQuoteProduct(product: SalesQuoteProduct) {
  const key = quoteProductKey(product);
  if (!key || !quoteDraft.value) return false;
  return quoteDraft.value.products.filter((line) => quoteProductKey(line) === key).length > 1;
}

function hasValidQuoteProductLines(products: SalesQuoteProduct[]) {
  if (!products.length) return false;
  const keys = products.map(quoteProductKey);
  return (
    keys.every(Boolean) &&
    new Set(keys).size === keys.length &&
    products.every((product) => (
      parseNumber(product.qty) > 0
      && parseNumber(product.unitPrice) > 0
      && taxRateOptions.includes(product.taxRate)
    ))
  );
}

function roundCurrency(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function linePricing(product: SalesQuoteProduct) {
  const qty = parseNumber(product.qty);
  const inputUnitPrice = parseNumber(product.unitPrice);
  const taxRate = taxRateValue(product.taxRate);
  const priceInputMode = quoteLineInputMode(product);
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

function quoteLineInputMode(product: SalesQuoteProduct) {
  if (product.priceInputMode === '不含税' || product.priceInputMode === '含税') return product.priceInputMode;
  return quoteDraft.value?.taxMode === '不含税' ? '不含税' : '含税';
}

function lineAmountNumber(product: SalesQuoteProduct) {
  return linePricing(product).grossAmount;
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

function lineUnitPriceValue(product: SalesQuoteProduct, mode: '含税' | '不含税') {
  const rawInput = String(product.unitPrice ?? '');
  if (!rawInput.trim()) return '';
  if (quoteLineInputMode(product) === mode) return rawInput;
  const pricing = linePricing(product);
  return formatCalculatedUnitPrice(mode === '含税' ? pricing.grossUnitPrice : pricing.netUnitPrice);
}

function updateLineUnitPrice(product: SalesQuoteProduct, mode: '含税' | '不含税', event: Event) {
  product.priceInputMode = mode;
  product.unitPrice = (event.target as HTMLInputElement).value;
}

function normalizeLineUnitPrice(product: SalesQuoteProduct) {
  if (!String(product.unitPrice ?? '').trim()) return;
  product.unitPrice = formatCurrencyInput(parseNumber(product.unitPrice));
}

function lineUnitPriceTitle(product: SalesQuoteProduct, mode: '含税' | '不含税') {
  if (quoteLineInputMode(product) === mode) {
    return `当前直接输入${mode === '含税' ? '含税' : '未税'}单价`;
  }
  return '按税率自动换算；必要时保留 4 位小数，以保证行金额计算准确';
}

function formatLineUnitPrice(product: SalesQuoteProduct, mode: '含税' | '不含税') {
  if (!String(product.unitPrice ?? '').trim()) return '-';
  const pricing = linePricing(product);
  return formatMoney(mode === '含税' ? pricing.grossUnitPrice : pricing.netUnitPrice);
}

function formatCurrencyMoney(value: number, currency = quoteCurrency.value) {
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

function productPriceKey(product: Pick<SalesQuoteProduct, 'materialCode' | 'name'>) {
  return product.materialCode || product.name || '';
}

function isSalesPriceRecordOrder(order: SalesOrder) {
  const lifecycle = order.documentStatus || order.status;
  return ['已确认', '已关闭'].includes(lifecycle);
}

function matchesPriceRecord(record: SalesPriceReference, product: SalesQuoteProduct) {
  if (record.materialCode && product.materialCode) return record.materialCode === product.materialCode;
  return Boolean(product.name && record.productName === product.name);
}

const salesPriceReferenceRows = computed<SalesPriceReference[]>(() => {
  const currentQuoteCode = quoteDraft.value?.code;

  return salesPriceSourceRows.value.flatMap((order) => {
    if (!isSalesPriceRecordOrder(order) || (currentQuoteCode && order.sourceQuote === currentQuoteCode)) return [];

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

function latestPriceReferenceFor(product: SalesQuoteProduct) {
  return salesPriceReferenceRows.value
    .filter((record) => matchesPriceRecord(record, product))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.sourceDoc.localeCompare(a.sourceDoc))[0];
}

const quotePriceReferenceRows = computed(() =>
  (quoteDraft.value?.products ?? [])
    .filter((product) => productIdentity(product, '').trim())
    .map((product, index) => {
      const reference = latestPriceReferenceFor(product);

      return {
        key: `${productPriceKey(product) || index}-${index}`,
        material: product,
        image:
          (product.name && productVisuals[product.name]) || {
            label: product.imageLabel || '',
            tone: product.imageTone || '#eeeeee',
          },
        referencePrice: reference?.latestPrice || '暂无记录',
        referenceMeta: reference
          ? `${reference.customer} · ${reference.sourceDoc} · ${reference.updatedAt}`
          : '销售价格记录暂无该物料订单价',
        quantity: reference?.quantity || '',
      };
    }),
);

const quotePriceReferenceSummary = computed(() => {
  const rows = quotePriceReferenceRows.value;
  if (!rows.length) return '选择销售物料后显示销售价格记录中的最近订单价。';
  if (rows.every((row) => row.referencePrice === '暂无记录')) return '当前销售物料暂无历史订单价，可按客户约定定价。';
  return '最近订单价来自已确认销售订单，仅作为本次报价的定价参考。';
});

function formatLineAmount(product: SalesQuoteProduct) {
  return formatMoney(lineAmountNumber(product));
}

function updateLine(index: number, patch: Partial<SalesQuoteProduct>) {
  if (!quoteDraft.value) return;
  quoteDraft.value.products[index] = {
    ...quoteDraft.value.products[index],
    ...patch,
  };
}

function addLine() {
  quoteDraft.value?.products.push(createEmptyLine());
}

function removeLine(index: number) {
  if (!quoteDraft.value || quoteDraft.value.products.length <= 1) return;
  quoteDraft.value.products.splice(index, 1);
}

function handleCustomerSelect(option: ReferenceOption) {
  if (!quoteDraft.value) return;
  if (!option.code && !option.name) {
    quoteDraft.value.customerCode = '';
    quoteDraft.value.customer = '';
    quoteDraft.value.contact = '';
    quoteDraft.value.contactPhone = '';
    return;
  }
  const customer = option.raw as CustomerReference;
  quoteDraft.value.customerCode = customer.code;
  quoteDraft.value.customer = customer.name;
  quoteDraft.value.contact = customer.contact || '';
  quoteDraft.value.contactPhone = customer.phone || '';
  quoteDraft.value.paymentMethod = normalizeSalesPaymentMethod(customer.paymentMethod || quoteDraft.value.paymentMethod);
  quoteDraft.value.deliveryMethod = normalizeSalesDeliveryMethod(customer.deliveryMethod || quoteDraft.value.deliveryMethod);
}

function handleOwnerSelect(option: ReferenceOption) {
  if (!quoteDraft.value) return;
  if (!option.code && !option.name) {
    quoteDraft.value.ownerEmployeeCode = '';
    quoteDraft.value.owner = '';
    return;
  }
  const employee = option.raw as { code?: string; name?: string };
  quoteDraft.value.ownerEmployeeCode = employee.code || option.code || '';
  quoteDraft.value.owner = employee.name || option.name || '';
}

function handleCompanySelect(option: ReferenceOption) {
  if (!quoteDraft.value) return;
  quoteDraft.value.companyCode = option.code;
  quoteDraft.value.company = option.name;
}

function applyQuoteTermsTemplate(template: TermsTemplate) {
  if (!quoteDraft.value) return;
  quoteDraft.value.deliveryMethod = normalizeSalesDeliveryMethod(template.deliveryMethod);
  quoteDraft.value.paymentMethod = normalizeSalesPaymentMethod(template.paymentMethod);
  quoteDraft.value.freightPayer = template.freightPayer || '供方';
  quoteDraft.value.remark = template.content;
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
  const key = `quote-custom-${Date.now()}`;
  activeTermsTemplateKey.value = key;
  termsTemplateDraft.value = {
    key,
    name: '新报价条款模板',
    deliveryMethod: normalizeSalesDeliveryMethod(quoteDraft.value?.deliveryMethod || source.deliveryMethod),
    paymentMethod: normalizeSalesPaymentMethod(quoteDraft.value?.paymentMethod || source.paymentMethod),
    taxMode: source.taxMode,
    taxRate: source.taxRate || '13%',
    freightPayer: quoteDraft.value?.freightPayer || source.freightPayer || '供方',
    content: quoteDraft.value?.remark || source.content,
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

  const nextTemplate: TermsTemplate = {
    ...termsTemplateDraft.value,
    name: termsTemplateDraft.value.name.trim() || '未命名报价条款',
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
  applyQuoteTermsTemplate(nextTemplate);
  termsTemplateNotice.value = '模板已保存，可在本报价单继续套用。';
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
  applyQuoteTermsTemplate(nextTemplate);
  termsTemplateNotice.value = '模板已删除，已切换到第一个可用模板。';
}

function openQuoteTermsTemplate() {
  if (isReadOnly.value) return;
  editTermsTemplate();
}

function handleProductSelect(index: number, option: ReferenceOption) {
  if (!option.code && !option.name) {
    if (quoteDraft.value) quoteDraft.value.products[index] = createEmptyLine();
    return;
  }
  const material = option.raw as MaterialReference;
  const currentLine = quoteDraft.value?.products[index] ?? createEmptyLine();
  const taxRate = currentLine.taxRate || '13%';
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
    taxRate,
    uom: material.uom || '',
    imageLabel: material.imageLabel || '',
    imageTone: material.imageTone || '',
  });
}

function buildQuoteForSave(): SalesQuote {
  const draft = quoteDraft.value ?? createEmptyQuote();
  return {
    ...draft,
    amount: totals.value.total,
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

async function loadQuote() {
  loadMessage.value = '';
  if (isNew.value) {
    isLoading.value = false;
    quoteDraft.value = createEmptyQuote();
    flowRecords.value = [];
    quoteValidationAttempted.value = false;
    await Promise.all([loadPriceReferences(), loadCurrencyReferences()]);
    return;
  }

  isLoading.value = true;
  quoteDraft.value = null;
  flowRecords.value = [];

  try {
    await Promise.all([loadPriceReferences(), loadCurrencyReferences()]);

    const code = route.params.code?.toString() ?? '';
    if (!code) return;

    const response = await getSalesQuote(code);
    quoteDraft.value = toSalesQuote(response.quote);
    flowRecords.value = response.flowRecords;
    quoteValidationAttempted.value = false;
  } catch (error) {
    quoteDraft.value = null;
    flowRecords.value = [];
    loadMessage.value = error instanceof Error ? error.message : '报价单加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function loadPriceReferences() {
  try {
    salesPriceSourceRows.value = await listSalesOrders();
  } catch {
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

async function persistQuote() {
  if (!canWriteSales.value) {
    showToast(salesReadonlyReason.value, 'error');
    return null;
  }
  if (!quoteDraft.value) return null;
  const wasConfirmed = quoteStatus.value === '已确认';
  isSaving.value = true;
  try {
    const response = await saveSalesQuote(buildQuoteForSave());
    quoteDraft.value = toSalesQuote(response.quote);
    flowRecords.value = response.flowRecords;
    resetUnsavedChanges();
    showToast(
      missingRequiredFields.value.length
        ? `${wasConfirmed ? '报价变更已保存并退回草稿' : '草稿已保存'}；确认前还需补齐：${missingRequiredFields.value.map((field) => field.label).join('、')}`
        : wasConfirmed
          ? '报价变更已保存，当前已退回草稿'
          : '报价单草稿已保存',
    );
    return response.quote;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '报价单保存失败', 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveQuoteDraft() {
  await runQuoteAction('save', async () => {
    const saved = await persistQuote();
    if (!saved) return;
    if (isNew.value) await router.replace(`/sales/quotes/${encodeURIComponent(saved.code)}/edit`);
  });
}

async function confirmQuoteDraft() {
  quoteValidationAttempted.value = true;
  if (!canSubmitQuote.value) {
    showToast(submitQuoteReadonlyReason.value, 'error');
    scrollToFirstMissingField();
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: '确认当前报价？',
    message: '系统将先保存当前内容，再将报价状态改为“已确认”。已确认报价如需修改，保存变更会使其退回草稿并需要重新确认。',
    confirmLabel: '确认报价',
  });
  if (!confirmed) return;

  await runQuoteAction('confirm', async () => {
    const saved = await persistQuote();
    if (!saved) return;

    isSaving.value = true;
    try {
      const response = await confirmSalesQuote(saved.code, Number(saved.revision || 0));
      quoteDraft.value = toSalesQuote(response.quote);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast('报价单已确认');
      await router.replace(`/sales/quotes/${encodeURIComponent(response.quote.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '报价单确认失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

async function voidCurrentQuote() {
  if (!canVoidCurrentQuote.value || !quoteDraft.value) {
    showToast(voidQuoteReadonlyReason.value, 'error');
    return;
  }

  const confirmed = await requestActionConfirmation({
    title: `作废报价单 ${quoteDraft.value.code}？`,
    message: '作废后不能继续转销售订单，历史记录仍会保留。',
    confirmLabel: '确认作废',
    tone: 'danger',
  });
  if (!confirmed) return;

  await runQuoteAction('void', async () => {
    isSaving.value = true;
    try {
      const response = await voidSalesQuote(
        quoteDraft.value!.code,
        Number(quoteDraft.value!.revision || 0),
      );
      quoteDraft.value = toSalesQuote(response.quote);
      flowRecords.value = response.flowRecords;
      resetUnsavedChanges();
      showToast('报价单已作废');
      await router.replace(`/sales/quotes/${encodeURIComponent(response.quote.code)}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '报价单作废失败', 'error');
    } finally {
      isSaving.value = false;
    }
  });
}

function previewQuotePdf() {
  if (!quoteDraft.value?.code) return;
  const previewPath = router.resolve({
    name: 'sales-quote-pdf',
    params: { code: quoteDraft.value.code },
  }).href;
  window.open(previewPath, '_blank', 'noopener,noreferrer');
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
}

function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (isReadOnly.value) {
    input.value = '';
    showToast(attachmentReadonlyReason.value || '当前状态不能上传附件', 'error');
    return;
  }
  const files = attachmentsFromFileList(input.files);
  if (!files.length || !quoteDraft.value) return;
  quoteDraft.value.attachments = [...(quoteDraft.value.attachments ?? []), ...files];
  input.value = '';
  showToast(`已选择 ${files.length} 个附件，保存后随报价单保留。`);
}

watch(() => route.fullPath, loadQuote, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="quoteDraft" class="quote-editor sales-quote-editor" :class="{ 'is-detail-view': isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/sales/quotes" aria-label="返回报价单列表" title="返回报价单列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ isDetail ? quoteDraft.code : pageHeading }}</strong>
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
            <button class="secondary-action topbar-optional-action" type="button" title="预览报价单，可打印或保存为 PDF" @click="previewQuotePdf">
              <FileDown :size="15" />
              PDF
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="查看报价单流转日志" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="quoteMoreActions.length"
              class="order-more-action-wrap"
              @keydown.esc.stop="quoteMoreActionsOpen = false"
              @mouseleave="quoteMoreActionsOpen = false"
            >
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="quoteMoreActionsOpen"
                @click="quoteMoreActionsOpen = !quoteMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="quoteMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-for="action in quoteMoreActions"
                  :key="action.key"
                  type="button"
                  role="menuitem"
                  :class="{ 'danger-option': action.tone === 'danger' }"
                  :disabled="action.disabled"
                  :title="action.disabled ? action.disabledReason || action.description : action.description"
                  @click="handleQuoteMoreAction(action)"
                >
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.disabled ? action.disabledReason || action.description : action.description }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="quoteStatus === '草稿' && !isQuoteExpired"
              class="primary-action async-document-action"
              type="button"
              :disabled="isSaving || isQuoteActionPending || !canSubmitQuote"
              :aria-busy="activeQuoteAction === 'confirm'"
              :title="submitQuoteReadonlyReason"
              @click="confirmQuoteDraft"
            >
              <CheckCircle2 :size="15" />
              {{ activeQuoteAction === 'confirm' ? '确认中' : '确认' }}
            </button>
            <RouterLink
              v-if="canRenewExpiredQuote"
              class="primary-action"
              :to="`/sales/quotes/${encodeURIComponent(quoteDraft.code)}/edit`"
              :title="quoteStatus === '草稿' ? '报价已过期，更新有效期后再确认' : '报价已过期，更新有效期后再转订单'"
            >
              更新有效期
            </RouterLink>
            <RouterLink
              v-if="canConvertQuote"
              class="primary-action"
              :to="{ path: '/sales/orders/new', query: { quote: quoteDraft.code } }"
              title="由当前报价单新建销售订单"
            >
              <Send :size="15" />
              {{ quoteConvertActionLabel }}
            </RouterLink>
            <RouterLink
              v-if="relatedOrderPath"
              class="primary-action"
              :to="relatedOrderPath"
              title="查看由当前报价生成的销售订单"
            >
              <Send :size="15" />
              查看关联订单
            </RouterLink>
          </template>

          <template v-else-if="!isLocked">
            <button class="secondary-action async-document-action" type="button" :disabled="isSaving || isQuoteActionPending || !canWriteSales" :aria-busy="activeQuoteAction === 'save'" :title="saveQuoteActionTitle" @click="saveQuoteDraft">
              <Save :size="15" />
              {{ activeQuoteAction === 'save' ? '保存中' : quoteStatus === '已确认' ? '保存变更' : '保存草稿' }}
            </button>
            <button v-if="quoteStatus === '草稿'" class="primary-action async-document-action" type="button" :disabled="isSaving || isQuoteActionPending || !canConfirmQuote" :aria-busy="activeQuoteAction === 'confirm'" :title="submitQuoteReadonlyReason" @click="confirmQuoteDraft">
              <CheckCircle2 :size="15" />
              {{ activeQuoteAction === 'confirm' ? '确认中' : '确认' }}
            </button>
          </template>
          <template v-else>
            <button class="secondary-action" type="button" disabled title="报价单已锁定，不能继续编辑">
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
        <span>{{ currencyLoadError }}。当前保留报价已有币种；重试成功后可选择其他启用币种。</span>
        <div class="access-denied-actions">
          <button type="button" class="notice-refresh-button" @click="loadCurrencyReferences">重试加载币种</button>
        </div>
      </section>

      <section v-if="isDetail" class="order-next-step-strip quote-next-step-strip" :class="`tone-${quoteNextStepGuidance.tone}`">
        <div>
          <span>下一步</span>
          <strong>{{ quoteNextStepGuidance.label }}</strong>
          <p>{{ quoteNextStepGuidance.description }}</p>
        </div>
        <RouterLink v-if="relatedOrderPath" :to="relatedOrderPath" class="next-step-action-link">
          查看 {{ quoteDraft.convertedOrderCode }}
        </RouterLink>
        <b v-else>{{ quoteNextStepGuidance.action }}</b>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="form-section-head">
              <h2>{{ isDetail ? '报价信息' : '基本信息' }}</h2>
            </div>

            <dl v-if="isDetail" class="material-fact-grid quote-detail-fact-grid quote-core-fact-grid">
              <div><dt>报价单号</dt><dd>{{ quoteDraft.code }}</dd></div>
              <div><dt>公司</dt><dd>{{ quoteDraft.company || '—' }}</dd></div>
              <div><dt>客户</dt><dd>{{ quoteDraft.customer || '—' }}</dd></div>
              <div><dt>联系人</dt><dd>{{ quoteDraft.contact || '—' }}</dd></div>
              <div><dt>联系方式</dt><dd>{{ quoteDraft.contactPhone || '—' }}</dd></div>
              <div><dt>报价日期</dt><dd>{{ quoteDraft.date || '—' }}</dd></div>
              <div><dt>有效期</dt><dd>{{ quoteDraft.validUntil || '—' }}</dd></div>
              <div><dt>报价人</dt><dd>{{ quoteDraft.owner || '—' }}</dd></div>
            </dl>

            <div v-else class="quote-fields">
              <label class="form-field">
                <span>报价单号</span>
                <input v-model="quoteDraft.code" type="text" readonly />
              </label>
              <label class="form-field" :class="requiredFieldClass('company')" data-required-field="company">
                <span class="field-label required-label">公司</span>
                <ReferencePicker
                  required
                  v-model="quoteDraft.companyCode"
                  type="company"
                  title="选择公司"
                  placeholder="选择公司"
                  search-placeholder="搜索公司编码或名称"
                  :display-value="quoteDraft.company"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleCompanySelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('customer')" data-required-field="customer">
                <span class="field-label required-label">客户</span>
                <ReferencePicker
                  required
                  v-model="quoteDraft.customerCode"
                  type="customers"
                  title="选择客户"
                  placeholder="选择客户"
                  search-placeholder="搜索客户编码、名称、联系人或联系方式"
                  :display-value="quoteDraft.customer"
                  :disabled="isReadOnly"
                  hide-meta
                  @select="handleCustomerSelect"
                />
              </label>
              <label class="form-field" :class="requiredFieldClass('contact')" data-required-field="contact">
                <span class="field-label required-label">联系人</span>
                <input v-model="quoteDraft.contact" type="text" placeholder="联系人" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('contactPhone')" data-required-field="contactPhone">
                <span class="field-label required-label">联系方式</span>
                <input v-model="quoteDraft.contactPhone" type="text" autocomplete="off" placeholder="手机号、座机、邮箱、微信或 WhatsApp 等" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('date')" data-required-field="date">
                <span class="field-label required-label">报价日期</span>
                <input v-model="quoteDraft.date" type="date" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('validUntil')" data-required-field="validUntil">
                <span class="field-label required-label">有效期</span>
                <input v-model="quoteDraft.validUntil" type="date" :min="quoteDraft.date || undefined" :readonly="isReadOnly" />
              </label>
              <label class="form-field" :class="requiredFieldClass('owner')" data-required-field="owner">
                <span class="field-label required-label">报价人</span>
                <ReferencePicker
                  required
                  v-model="quoteDraft.ownerEmployeeCode"
                  type="employees"
                  kind="sales-document-owner"
                  title="选择报价人"
                  placeholder="选择报价人"
                  search-placeholder="搜索员工姓名、英文名、部门、手机号或邮箱"
                  :display-value="quoteDraft.owner"
                  :disabled="isReadOnly"
                  @select="handleOwnerSelect"
                />
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>销售物料明细</h2>
              <div class="quote-line-section-tools">
                <select
                  v-model="quoteDraft.currency"
                  class="quote-line-currency-select"
                  :class="{ 'has-field-error': quoteValidationAttempted && isRequiredFieldMissing('currency') }"
                  :disabled="isReadOnly"
                  aria-label="币种"
                  title="选择报价币种"
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
                  <tr v-for="(item, index) in quoteDraft.products" :key="`${item.materialCode || item.name}-${index}`">
                    <td>
                      <MaterialIdentity
                        :name="item.name"
                        :code="item.materialCode"
                        :model="item.model"
                        :spec="item.spec"
                        :image-url="lineItems[index]?.image.url"
                        :image-label="lineItems[index]?.image.label"
                        :image-tone="lineItems[index]?.image.tone"
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
              :class="{ 'has-field-error': quoteValidationAttempted && isRequiredFieldMissing('products') }"
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
                v-for="(item, index) in quoteDraft.products"
                :key="`${item.materialCode || 'new'}-${index}`"
                class="quote-line-row quote-tax-line-row"
                :class="{ 'no-actions': isReadOnly }"
              >
                <span class="product-thumb" :style="{ backgroundColor: lineItems[index]?.image.tone }">
                  <img v-if="lineItems[index]?.image.url" :src="lineItems[index].image.url" alt="" />
                  <span v-else>{{ lineItems[index]?.image.label }}</span>
                </span>
                <ReferencePicker
                  required
                  v-model="item.materialCode"
                  type="materials"
                  kind="销售"
                  title="选择销售物料"
                  placeholder="选择销售物料"
                  search-placeholder="搜索可销售物料编码、名称、型号或规格"
                  :display-value="productIdentity(item, '选择销售物料')"
                  :disabled="isReadOnly"
                  :class="requiredLineProductClass(item)"
                  hide-meta
                  @select="handleProductSelect(index, $event)"
                />
                <QuantityWithUnitInput
                  v-model="item.qty"
                  :unit="item.uom"
                  placeholder="数量"
                  :readonly="isReadOnly"
                  :class="requiredLineQtyClass(item)"
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
                  class="icon-button danger"
                  type="button"
                  aria-label="删除报价物料"
                  :title="quoteDraft.products.length <= 1 ? '至少保留一行报价物料' : '删除报价物料'"
                  :disabled="quoteDraft.products.length <= 1"
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
                  <dd>{{ totals.subtotal }}</dd>
                </div>
                <div>
                  <dt>税额</dt>
                  <dd>{{ totals.tax }}</dd>
                </div>
                <div class="amount-total">
                  <dt>含税总计</dt>
                  <dd>{{ totals.total }}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>商务条款</h2>
              <button
                v-if="canOpenTermsTemplate"
                class="secondary-action compact-action"
                type="button"
                title="编辑报价条款模板"
                @click="openQuoteTermsTemplate"
              >
                <FileText :size="14" />
                模板
              </button>
            </div>

            <template v-if="isDetail">
              <dl class="material-fact-grid quote-detail-fact-grid quote-terms-fact-grid">
                <div><dt>交付方式</dt><dd>{{ quoteDraft.deliveryMethod || '—' }}</dd></div>
                <div><dt>运费承担</dt><dd>{{ quoteDraft.freightPayer || '—' }}</dd></div>
                <div><dt>付款方式</dt><dd>{{ quoteDraft.paymentMethod || '—' }}</dd></div>
              </dl>
              <div v-if="quoteDraft.remark" class="quote-terms-note">
                <span>补充条款</span>
                <p class="material-note-copy">{{ quoteDraft.remark }}</p>
              </div>
            </template>

            <div v-else class="quote-fields">
              <label class="form-field" :class="requiredFieldClass('deliveryMethod')" data-required-field="deliveryMethod">
                <span class="field-label required-label">交付方式</span>
                <select v-model="quoteDraft.deliveryMethod" :disabled="isReadOnly">
                  <option v-for="option in deliveryOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('freightPayer')" data-required-field="freightPayer">
                <span class="field-label required-label">运费承担</span>
                <select v-model="quoteDraft.freightPayer" :disabled="isReadOnly">
                  <option v-for="payer in freightPayerOptions" :key="payer" :value="payer">{{ payer }}</option>
                </select>
              </label>
              <label class="form-field" :class="requiredFieldClass('paymentMethod')" data-required-field="paymentMethod">
                <span class="field-label required-label">付款方式</span>
                <select v-model="quoteDraft.paymentMethod" :disabled="isReadOnly">
                  <option v-for="option in paymentOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </label>
              <label class="form-field full-field">
                <span>补充条款</span>
                <textarea
                  v-model="quoteDraft.remark"
                  rows="3"
                  placeholder="填写报价备注、特殊包装、交付说明等"
                  :readonly="isReadOnly"
                ></textarea>
              </label>
            </div>
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section v-if="isDetail" class="summary-section">
            <DocumentStatusPanel
              title="报价状态"
              :primary-status="quoteDraft.status"
              :items="quoteStatusPanelItems"
              aria-label="报价单状态与有效性"
            />
          </section>

          <section class="summary-section">
            <h2>订单价参考</h2>
            <p class="reference-summary">{{ quotePriceReferenceSummary }}</p>
            <div class="price-reference-list">
              <div v-for="item in quotePriceReferenceRows" :key="`${item.key}-price`" class="price-reference-card">
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
                :title="quoteAttachmentTitle"
              >
                <Upload :size="15" />
                上传
                <input type="file" multiple @change="handleAttachmentUpload" />
              </label>
            </div>

            <div v-if="quoteAttachments.length" class="attachment-list">
              <div v-for="file in quoteAttachments" :key="file.name" class="attachment-row">
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
              <span>{{ isReadOnly ? '暂无附件' : '可上传客户确认单、报价附件、技术说明等文件' }}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="报价单"
      :message="loadMessage || '报价单不存在'"
      back-path="/sales/quotes"
      back-label="返回报价单列表"
      @retry="loadQuote"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="报价单日志"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />

    <TermsTemplateDialog
      v-model:draft="termsTemplateDraft"
      :open="termsTemplateDialogOpen"
      title="报价条款模板"
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
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
