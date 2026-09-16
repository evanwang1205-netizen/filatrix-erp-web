<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  FileDown,
  FileText,
  Printer,
  RotateCcw,
  Save,
  Send,
} from 'lucide-vue-next';

import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import QuantityWithUnitInput from '../components/QuantityWithUnitInput.vue';
import ReferencePicker from '../components/ReferencePicker.vue';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { productVisuals } from '../data/sales';
import { productIdentity } from '../utils/productDisplay';
import {
  completeSalesRefund,
  confirmSalesInvoice,
  getFinanceRecord,
  getSalesInvoiceAvailability,
  getSalesOrder,
  reverseSalesInvoice,
  saveSalesInvoice,
} from '../services/api';
import type { SalesInvoiceLineAvailability } from '../services/api';
import type { FinanceLine, FinanceRecord, FlowRecord, ReferenceOption, SalesOrder, SalesOrderProduct } from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';
import { salesPaymentOptions } from '../utils/salesTerms';

type InvoiceAllocationLine = FinanceLine & {
  sourceDocType?: string;
  sourceDocId?: string;
  sourceOrderLineId?: string;
  allocation?: { sourceLineId?: string };
};

const salesInvoiceSettlementOptions = Array.from(new Set([
  ...salesPaymentOptions,
  '预收 30% + 到货后结清',
  '到货后 15 天',
]));

type AllocationRow = {
  key: string;
  line: InvoiceAllocationLine;
  orderLine?: SalesOrderProduct;
  sourceLineId: string;
  orderQty: number;
  orderAmount: number;
  invoicedQty: number;
  invoicedAmount: number;
  currentQty: number;
  currentAmount: number;
  availableQty: number;
  availableAmount: number;
  remainingQty: number;
  remainingAmount: number;
};

type SalesInvoiceReversal = {
  code?: string;
  reversalCode?: string;
  sourceInvoice?: string;
  redInvoice?: string | Partial<FinanceRecord>;
  redInvoiceCode?: string;
  reason?: string;
  actor?: string;
  createdAt?: string;
  reversedAt?: string;
  status?: string;
};

type SalesRefund = {
  code?: string;
  refundCode?: string;
  sourceInvoice?: string;
  sourceReversal?: string;
  redInvoiceCode?: string;
  amount?: number | string;
  status?: string;
  paymentMethod?: string;
  transactionRef?: string;
  completedAt?: string;
  createdAt?: string;
};

type SalesInvoiceDetailResponse = {
  reversal?: SalesInvoiceReversal | null;
  refunds?: SalesRefund[];
  redInvoice?: Partial<FinanceRecord> | null;
};

type RefundCompletionDraft = {
  paymentMethod: string;
  transactionRef: string;
  idempotencyKey: string;
};

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteFinance, readonlyReason: financeReadonlyReason } = useModulePermission('finance');
const { canOperate: canSettleFinance, readonlyReason: financeSettleReadonlyReason } = useOperationPermission(
  'financeSettle',
  '确认开票',
);
const showFlowRecords = ref(false);
const invoiceMoreActionsOpen = ref(false);
const isSaving = ref(false);
const isLoading = ref(true);
const loadMessage = ref('');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
const invoiceDraft = ref<FinanceRecord | null>(createEmptyInvoice());
const sourcePicker = ref<InstanceType<typeof ReferencePicker> | null>(null);
const flowRecords = ref<FlowRecord[]>([]);
const sourceOrderRecord = ref<SalesOrder | null>(null);
const lineAvailability = ref<SalesInvoiceLineAvailability[]>([]);
const allocationContextLoading = ref(false);
const allocationContextError = ref('');
const reversal = ref<SalesInvoiceReversal | null>(null);
const redInvoice = ref<Partial<FinanceRecord> | null>(null);
const refunds = ref<SalesRefund[]>([]);
const showReversalForm = ref(false);
const reversalReason = ref('');
const reversalBusy = ref(false);
const reversalIdempotencyKey = ref('');
const refundBusyCode = ref('');
const refundDrafts = ref<Record<string, RefundCompletionDraft>>({});
let toastTimer: number | undefined;
let allocationRequestId = 0;

const isNew = computed(() => route.name?.toString() === 'finance-sales-invoice-new');
const isEdit = computed(() => route.name?.toString() === 'finance-sales-invoice-edit');
const isDetail = computed(() => route.name?.toString() === 'finance-sales-invoice-detail');
const isReadOnly = computed(() => isDetail.value || invoiceDraft.value?.status !== '待开票' || !canWriteFinance.value);
const pageHeading = computed(() => {
  if (isNew.value) return '新建销售发票';
  const code = invoiceDraft.value?.code || '销售发票';
  if (isEdit.value) return invoiceDraft.value?.status !== '待开票' ? code : `编辑 ${code}`;
  return code;
});
const invoiceLifecycleStatus = computed(() => reversal.value || invoiceDraft.value?.documentStatus === '已红冲' || invoiceDraft.value?.status === '已红冲'
  ? '已红冲'
  : invoiceDraft.value?.documentStatus || (invoiceDraft.value?.status === '待开票' ? '待开票' : '已开票'));
const settlementProgress = computed(() => {
  if (invoiceDraft.value?.settlementStatus) return invoiceDraft.value.settlementStatus;
  if (reversal.value || invoiceDraft.value?.status === '已红冲') return '已冲销';
  const total = parseMoney(invoiceDraft.value?.totalAmount || '');
  const settled = parseMoney(invoiceDraft.value?.settledAmount || '');
  if (settled <= 0) return '未收款';
  return settled + 0.01 >= total ? '已收款' : '部分收款';
});
const sourceTaxMode = computed(() => sourceOrderRecord.value?.taxMode || '含税');
const sourceAmountLabel = computed(() => sourceTaxMode.value === '含税' ? '订单数量 / 含税金额' : '订单数量 / 未税金额');
const sourceUnitPriceLabel = computed(() => sourceTaxMode.value === '含税' ? '含税单价' : '未税单价');
const canConfirmInvoice = computed(() => (
  invoiceDraft.value?.status === '待开票'
  && Boolean(invoiceDraft.value?.sourceDoc)
  && canWriteFinance.value
  && canSettleFinance.value
  && !allocationBlockingMessage.value
));
const confirmInvoiceReadonlyReason = computed(() => {
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (!canSettleFinance.value) return financeSettleReadonlyReason.value;
  return '';
});
const saveInvoiceReadonlyReason = computed(() => {
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (invoiceDraft.value?.status !== '待开票') return '销售发票确认后关键内容锁定，修正请使用红冲。';
  if (isDetail.value) return '当前销售发票详情只读，不能保存草稿。';
  return '';
});
const saveInvoiceActionTitle = computed(() => (
  saveInvoiceReadonlyReason.value || allocationBlockingMessage.value || '保存草稿'
));
const confirmInvoiceActionTitle = computed(() => {
  const status = invoiceDraft.value?.status || '-';
  if (status !== '待开票') return `当前状态为${status}，不能确认开票。`;
  if (!invoiceDraft.value?.sourceDoc) return '请先选择来源销售订单。';
  return confirmInvoiceReadonlyReason.value || allocationBlockingMessage.value || '确认开票';
});
const operationPermissionHint = computed(() => (
  !canSettleFinance.value ? financeSettleReadonlyReason.value : ''
));
const reversibleStatuses = new Set(['已确认', '已开票', '待收款', '部分收款', '已收款']);
const hasReversal = computed(() => Boolean(reversal.value));
const canReverseInvoice = computed(() => (
  isDetail.value
  && Boolean(invoiceDraft.value?.code && invoiceDraft.value.code !== '系统自动生成')
  && reversibleStatuses.has(invoiceDraft.value?.status || '')
  && !hasReversal.value
  && canWriteFinance.value
  && canSettleFinance.value
));
const showReversalWorkflow = computed(() => (
  isDetail.value
  && (
    reversibleStatuses.has(invoiceDraft.value?.status || '')
    || hasReversal.value
    || refunds.value.length > 0
  )
));
const reverseInvoiceActionTitle = computed(() => {
  if (hasReversal.value) return '该发票已经完成全额红冲，不能重复红冲。';
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (!canSettleFinance.value) return financeSettleReadonlyReason.value;
  if (!reversibleStatuses.has(invoiceDraft.value?.status || '')) return '只有已确认、已开票、待收款、部分收款或已收款的销售发票可以发起全额红冲。';
  return '发起全额红冲；不支持部分红冲。';
});
const operationPermissionSuffix = '\u786e\u8ba4\u5f00\u7968\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';
const summaryRows = computed(() => {
  if (!invoiceDraft.value) return [];

  return [
    { label: sourceTaxMode.value === '含税' ? '订单行含税金额' : '订单行未税金额', value: formatMoney(allocationSummary.value.orderAmount) },
    { label: '其他发票累计占用', value: formatMoney(allocationSummary.value.invoicedAmount) },
    { label: '本次开票金额', value: formatMoney(allocationSummary.value.currentAmount) },
    { label: '本次后剩余可开', value: formatMoney(allocationSummary.value.remainingAmount) },
  ];
});
const invoiceStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const items: DocumentStatusItem[] = [
    { key: 'settlement', label: '收款进度', value: settlementProgress.value, kind: 'status' },
  ];
  if (hasReversal.value) {
    items.push({ key: 'reversal', label: '红冲状态', value: '已红冲', kind: 'status', tone: 'danger' });
  }
  if (refunds.value.length) {
    const pendingCount = refunds.value.filter((refund) => refund.status !== '已退款').length;
    items.push({
      key: 'refund',
      label: '退款进度',
      value: pendingCount ? `待退款 ${pendingCount} 笔` : '已退款',
      detail: `共 ${refunds.value.length} 笔`,
      kind: 'status',
      tone: pendingCount ? 'warning' : 'success',
    });
  }
  return items;
});
const lineItems = computed(() =>
  (invoiceDraft.value?.lines ?? []).map((line, index) => ({
    key: `${line.materialCode || line.name || 'new'}-${index}`,
    ...line,
    image: lineImage(line),
  })),
);
const allocationRows = computed<AllocationRow[]>(() => {
  const draft = invoiceDraft.value;
  const order = sourceOrderRecord.value;
  if (!draft) return [];

  return draft.lines.map((rawLine, index) => {
    const line = rawLine as InvoiceAllocationLine;
    const sourceLineId = lineSourceId(line);
    const orderLine = order?.products.find((item) => item.lineId === sourceLineId);
    const availability = lineAvailability.value.find((item) => item.sourceLineId === sourceLineId);
    const orderQty = availability?.orderQty ?? parseQty(orderLine?.qty || '');
    const orderAmount = availability?.orderAmount ?? orderLineAmount(orderLine);
    const invoicedQty = availability?.invoicedQty ?? 0;
    const invoicedAmount = availability?.invoicedAmount ?? 0;
    const currentQty = parseQty(line.qty);
    const currentAmount = parseMoney(line.amount);
    const availableQty = availability?.remainingQty ?? Math.max(0, orderQty - invoicedQty);
    const availableAmount = availability?.remainingAmount ?? Math.max(0, orderAmount - invoicedAmount);

    return {
      key: `${sourceLineId || line.materialCode || line.name || 'unresolved'}-${index}`,
      line,
      orderLine,
      sourceLineId,
      orderQty,
      orderAmount,
      invoicedQty,
      invoicedAmount,
      currentQty,
      currentAmount,
      availableQty,
      availableAmount,
      remainingQty: Math.max(0, availableQty - currentQty),
      remainingAmount: Math.max(0, availableAmount - currentAmount),
    };
  });
});
const allocationSummary = computed(() => allocationRows.value.reduce(
  (summary, row) => ({
    orderAmount: summary.orderAmount + row.orderAmount,
    invoicedAmount: summary.invoicedAmount + row.invoicedAmount,
    currentAmount: summary.currentAmount + row.currentAmount,
    remainingAmount: summary.remainingAmount + row.remainingAmount,
  }),
  { orderAmount: 0, invoicedAmount: 0, currentAmount: 0, remainingAmount: 0 },
));
const redInvoiceDisplayCode = computed(() => {
  const reversalRedInvoice = reversal.value?.redInvoice;
  if (typeof reversalRedInvoice === 'string') return reversalRedInvoice;
  return redInvoice.value?.code
    || reversalRedInvoice?.code
    || reversal.value?.redInvoiceCode
    || '-';
});
const reversalDisplayCode = computed(() => reversal.value?.code || reversal.value?.reversalCode || '-');
const allocationBlockingMessage = computed(() => {
  if (!invoiceDraft.value?.sourceDoc) return '';
  if (allocationContextLoading.value) return '正在核对销售订单行的可开票余额，请稍候。';
  if (allocationContextError.value) return allocationContextError.value;
  if (!sourceOrderRecord.value) return '尚未读取有效销售订单行，不能保存或确认开票。';

  const usedSourceLineIds = new Set<string>();
  for (const row of allocationRows.value) {
    if (row.currentQty <= 0 && row.currentAmount <= 0) continue;
    if (row.sourceLineId && usedSourceLineIds.has(row.sourceLineId)) {
      return `销售订单行 ${row.sourceLineId} 在本发票中重复引用，请合并为一条明细。`;
    }
    if (row.sourceLineId) usedSourceLineIds.add(row.sourceLineId);
  }

  for (const row of allocationRows.value) {
    const issue = allocationRowIssue(row);
    if (issue) return issue;
  }
  return '';
});

function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createEmptyLine(): FinanceLine {
  return { materialCode: '', name: '', model: '', spec: '', uom: '', qty: '', unitPrice: '', amount: '', taxRate: '13%' };
}

function createEmptyInvoice(): FinanceRecord {
  return {
    code: '系统自动生成',
    companyCode: '',
    company: '',
    sourceDoc: (route.query.order || route.query.source)?.toString() ?? '',
    sourceOrder: '',
    partyCode: '',
    party: '',
    contact: '',
    contactPhone: '',
    amount: '￥0.00',
    taxAmount: '￥0.00',
    totalAmount: '￥0.00',
    settledAmount: '￥0.00',
    owner: '赵敏',
    status: '待开票',
    date: today(),
    dueDate: today(30),
    invoiceType: '增值税专用发票',
    paymentMethod: '月结 30 天',
    bankAccount: '',
    lines: [createEmptyLine()],
    note: '核对销售订单、客户开票信息和出库情况后确认开票。',
  };
}

function toFinanceRecord(
  source: Partial<FinanceRecord>,
  order = sourceOrderRecord.value,
  fallbackLines: FinanceLine[] = [],
): FinanceRecord {
  const record = {
    ...createEmptyInvoice(),
    ...source,
    lines: source.lines?.length ? source.lines : [createEmptyLine()],
  };
  return {
    ...record,
    lines: hydrateInvoiceLines(record.lines, order, fallbackLines),
  };
}

function parseQty(value: string) {
  return Number(String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function parseMoney(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function formatMoney(value: number) {
  return `￥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

function createIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function refundKey(refund: SalesRefund, index = 0) {
  return String(refund.code || refund.refundCode || `refund-${index}`);
}

function refundStatus(refund: SalesRefund) {
  return refund.status || '待退款';
}

function refundAmount(refund: SalesRefund) {
  if (typeof refund.amount === 'string' && refund.amount.includes('￥')) return refund.amount;
  return formatMoney(Number(refund.amount || 0));
}

function refundDraftFor(refund: SalesRefund, index = 0) {
  const key = refundKey(refund, index);
  if (!refundDrafts.value[key]) {
    refundDrafts.value[key] = {
      paymentMethod: refund.paymentMethod || '原路退回',
      transactionRef: refund.transactionRef || '',
      idempotencyKey: '',
    };
  }
  return refundDrafts.value[key];
}

function syncRefundDrafts() {
  refunds.value.forEach((refund, index) => {
    const draft = refundDraftFor(refund, index);
    if (refund.status === '已退款') {
      draft.paymentMethod = refund.paymentMethod || draft.paymentMethod;
      draft.transactionRef = refund.transactionRef || draft.transactionRef;
    }
  });
}

function extractRedInvoice(reversalRecord?: SalesInvoiceReversal | null) {
  const candidate = reversalRecord?.redInvoice;
  if (candidate && typeof candidate === 'object') return candidate;
  if (typeof candidate === 'string') return { code: candidate };
  if (reversalRecord?.redInvoiceCode) return { code: reversalRecord.redInvoiceCode };
  return null;
}

function resetFinancialEvents() {
  reversal.value = null;
  redInvoice.value = null;
  refunds.value = [];
  refundDrafts.value = {};
  showReversalForm.value = false;
  reversalReason.value = '';
  reversalIdempotencyKey.value = '';
  refundBusyCode.value = '';
}

function applyFinancialEvents(detail: SalesInvoiceDetailResponse) {
  reversal.value = detail.reversal || null;
  redInvoice.value = detail.redInvoice || extractRedInvoice(reversal.value);
  refunds.value = Array.isArray(detail.refunds) ? detail.refunds : [];
  syncRefundDrafts();
}

function mergeRefund(updated: SalesRefund) {
  const updatedCode = refundKey(updated);
  const index = refunds.value.findIndex((refund) => refundKey(refund) === updatedCode);
  if (index >= 0) refunds.value.splice(index, 1, updated);
  else refunds.value.push(updated);
  syncRefundDrafts();
}

function normalizeSourceOrder(order: SalesOrder): SalesOrder {
  return {
    ...order,
    products: order.products.map((product, index) => ({
      ...product,
      lineId: product.lineId || `L${index + 1}`,
    })),
  };
}

function lineSourceId(line?: Partial<InvoiceAllocationLine>) {
  return String(line?.sourceLineId || line?.sourceOrderLineId || line?.allocation?.sourceLineId || '').trim();
}

function inferOrderLine(line: Partial<FinanceLine>, order: SalesOrder | null) {
  if (!order) return undefined;
  const explicitId = lineSourceId(line as InvoiceAllocationLine);
  if (explicitId) return order.products.find((product) => product.lineId === explicitId);

  const materialMatches = line.materialCode
    ? order.products.filter((product) => product.materialCode === line.materialCode)
    : [];
  if (materialMatches.length === 1) return materialMatches[0];

  const identityMatches = order.products.filter((product) => (
    product.name === line.name
    && (!line.model || product.model === line.model)
    && (!line.spec || product.spec === line.spec)
  ));
  return identityMatches.length === 1 ? identityMatches[0] : undefined;
}

function hydrateInvoiceLines(lines: FinanceLine[], order: SalesOrder | null, fallbackLines: FinanceLine[] = []) {
  return lines.map((line, index) => {
    const fallbackSourceLineId = lineSourceId(fallbackLines[index] as InvoiceAllocationLine);
    const explicitSourceLineId = lineSourceId(line as InvoiceAllocationLine) || fallbackSourceLineId;
    const orderLine = explicitSourceLineId
      ? order?.products.find((product) => product.lineId === explicitSourceLineId)
      : inferOrderLine(line, order);
    const sourceLineId = orderLine?.lineId || explicitSourceLineId;
    if (!sourceLineId) return line;

    return {
      ...line,
      lineId: line.lineId || fallbackLines[index]?.lineId || `L${index + 1}`,
      sourceOrder: order?.code || line.sourceOrder || fallbackLines[index]?.sourceOrder || '',
      sourceLineId,
    } as InvoiceAllocationLine;
  });
}

function attachAvailabilityToLines(lines: FinanceLine[]) {
  return lines.map((line) => {
    const availability = lineAvailability.value.find((item) => item.sourceLineId === line.sourceLineId);
    if (!availability) return line;
    return {
      ...line,
      sourceOrder: availability.sourceOrder,
      orderQty: `${formatQty(availability.orderQty)}${availability.unit ? ` ${availability.unit}` : ''}`,
      orderAmount: formatMoney(availability.orderAmount),
      previouslyInvoicedQty: availability.invoicedQty,
      previouslyInvoicedAmount: availability.invoicedAmount,
      remainingQty: availability.remainingQty,
      remainingAmount: availability.remainingAmount,
    };
  });
}

function orderLineAmount(line?: SalesOrderProduct) {
  if (!line) return 0;
  return parseMoney(line.grossAmount || line.amount)
    || parseQty(line.qty) * parseMoney(line.grossUnitPrice || line.unitPrice);
}

function allocationRowIssue(row: AllocationRow) {
  const lineName = row.line.name || row.line.materialCode || '未命名明细';
  if (row.currentQty < 0 || row.currentAmount < 0) return `“${lineName}”的本次开票数量和金额不能为负数。`;
  if (row.currentQty <= 0 && row.currentAmount <= 0) return '';
  if (!row.sourceLineId || !row.orderLine || !lineAvailability.value.some((item) => item.sourceLineId === row.sourceLineId)) {
    return `“${lineName}”未关联有效销售订单行，不能保存或确认开票。`;
  }
  const availability = lineAvailability.value.find((item) => item.sourceLineId === row.sourceLineId);
  if (availability?.unit && row.line.uom && availability.unit !== row.line.uom) {
    return `销售订单行 ${row.sourceLineId} 的单位为${availability.unit}，本次明细单位为${row.line.uom}，不能开票。`;
  }
  if (row.currentQty <= 0) return `销售订单行 ${row.sourceLineId} 的本次开票数量必须大于 0。`;
  if (row.currentAmount <= 0) return `销售订单行 ${row.sourceLineId} 的本次开票金额必须大于 0。`;
  if (row.currentQty > row.availableQty + 0.0001) {
    return `销售订单行 ${row.sourceLineId} 本次最多可开 ${formatQty(row.availableQty)}${row.line.uom || ''}，当前为 ${formatQty(row.currentQty)}${row.line.uom || ''}。`;
  }
  if (row.currentAmount > row.availableAmount + 0.01) {
    return `销售订单行 ${row.sourceLineId} 本次最多可开 ${formatMoney(row.availableAmount)}，当前为 ${formatMoney(row.currentAmount)}。`;
  }
  return '';
}

function taxRateValue(value: string) {
  const numeric = Number(String(value || '13').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric / 100 : 0.13;
}

function lineImage(line: FinanceLine) {
  return (
    (line.name && productVisuals[line.name]) || {
      label: line.imageLabel || line.materialCode?.slice(-4).toUpperCase() || 'FIN',
      tone: line.imageTone || '#eeeeee',
    }
  );
}

function mapOrderLine(product: SalesOrderProduct, orderCode: string, index: number): FinanceLine {
  const unitPrice = product.grossUnitPrice || product.unitPrice || '';
  const amount = product.grossAmount || product.amount
    || (unitPrice ? formatMoney(parseQty(product.qty) * parseMoney(unitPrice)) : '');

  return {
    lineId: `L${index + 1}`,
    sourceOrder: orderCode,
    sourceLineId: product.lineId || `L${index + 1}`,
    materialCode: product.materialCode || '',
    name: product.name || '',
    model: product.model || '',
    spec: product.spec || '',
    uom: product.uom || '',
    qty: product.qty || '',
    unitPrice,
    amount,
    taxRate: product.taxRate || '13%',
    imageLabel: product.imageLabel || '',
    imageTone: product.imageTone || '',
  };
}

function recalculateTotals() {
  const draft = invoiceDraft.value;
  if (!draft) return;

  draft.lines = draft.lines.map((line) => {
    const lineAmount = parseQty(line.qty) * parseMoney(line.unitPrice);
    return {
      ...line,
      amount: formatMoney(lineAmount),
    };
  });

  const lineAmount = draft.lines.reduce((sum, line) => sum + parseMoney(line.amount), 0);
  const amount = sourceTaxMode.value === '含税'
    ? draft.lines.reduce((sum, line) => sum + parseMoney(line.amount) / (1 + taxRateValue(line.taxRate)), 0)
    : lineAmount;
  const taxAmount = sourceTaxMode.value === '含税'
    ? lineAmount - amount
    : draft.lines.reduce((sum, line) => sum + parseMoney(line.amount) * taxRateValue(line.taxRate), 0);
  const totalAmount = sourceTaxMode.value === '含税' ? lineAmount : amount + taxAmount;
  draft.amount = formatMoney(amount);
  draft.taxAmount = formatMoney(taxAmount);
  draft.totalAmount = formatMoney(totalAmount);
}

function defaultNewInvoiceToRemainingAvailability() {
  const draft = invoiceDraft.value;
  if (!isNew.value || !draft || draft.code !== '系统自动生成') return;

  draft.lines.forEach((line) => {
    const availability = lineAvailability.value.find((item) => item.sourceLineId === line.sourceLineId);
    if (!availability || Math.abs(parseQty(line.qty) - availability.orderQty) > 0.0001) return;
    line.qty = `${formatQty(availability.remainingQty)}${availability.unit ? ` ${availability.unit}` : ''}`;
  });
  recalculateTotals();
}

function applySalesOrder(order: SalesOrder) {
  if (!invoiceDraft.value) return;
  const normalizedOrder = normalizeSourceOrder(order);
  sourceOrderRecord.value = normalizedOrder;

  invoiceDraft.value.sourceDoc = normalizedOrder.code;
  invoiceDraft.value.sourceOrder = normalizedOrder.code;
  invoiceDraft.value.companyCode = normalizedOrder.companyCode || '';
  invoiceDraft.value.company = normalizedOrder.company || '';
  invoiceDraft.value.partyCode = normalizedOrder.customerCode || '';
  invoiceDraft.value.party = normalizedOrder.customer || '';
  invoiceDraft.value.contact = normalizedOrder.contact || '';
  invoiceDraft.value.contactPhone = normalizedOrder.contactPhone || '';
  invoiceDraft.value.paymentMethod = normalizedOrder.paymentMethod || invoiceDraft.value.paymentMethod;
  invoiceDraft.value.lines = normalizedOrder.products.length
    ? normalizedOrder.products.map((product, index) => mapOrderLine(product, normalizedOrder.code, index))
    : [createEmptyLine()];
  invoiceDraft.value.note = `来源销售订单 ${normalizedOrder.code}，确认客户开票信息后开票。`;
  recalculateTotals();
}

async function refreshAllocationContext(orderCode: string, suppliedOrder?: SalesOrder) {
  const requestId = ++allocationRequestId;
  allocationContextLoading.value = true;
  allocationContextError.value = '';

  try {
    const excludeInvoiceCode = invoiceDraft.value?.code && invoiceDraft.value.code !== '系统自动生成'
      ? invoiceDraft.value.code
      : '';
    const [orderResponse, availability] = await Promise.all([
      suppliedOrder ? Promise.resolve({ order: suppliedOrder }) : getSalesOrder(orderCode),
      getSalesInvoiceAvailability(orderCode, excludeInvoiceCode),
    ]);
    if (requestId !== allocationRequestId) return;

    const order = normalizeSourceOrder(orderResponse.order);
    sourceOrderRecord.value = order;
    lineAvailability.value = availability.lines;
    if (invoiceDraft.value && (invoiceDraft.value.sourceOrder || invoiceDraft.value.sourceDoc) === order.code) {
      invoiceDraft.value.lines = attachAvailabilityToLines(hydrateInvoiceLines(invoiceDraft.value.lines, order));
      defaultNewInvoiceToRemainingAvailability();
    }
  } catch (error) {
    if (requestId !== allocationRequestId) return;
    sourceOrderRecord.value = null;
    lineAvailability.value = [];
    allocationContextError.value = error instanceof Error
      ? `销售订单行开票余额核对失败：${error.message}`
      : '销售订单行开票余额核对失败，不能保存或确认开票。';
  } finally {
    if (requestId === allocationRequestId) allocationContextLoading.value = false;
  }
}

async function loadSourceOrderFromQuery() {
  const code = (route.query.order || route.query.source)?.toString() ?? '';
  if (!code || !invoiceDraft.value || invoiceDraft.value.sourceDoc !== code) return;

  try {
    const response = await getSalesOrder(code);
    applySalesOrder(response.order);
    await refreshAllocationContext(code, response.order);
  } catch {
    sourceOrderRecord.value = null;
    lineAvailability.value = [];
    allocationContextError.value = '来源销售订单暂时无法读取，不能核对行级可开票余额。';
    loadMessage.value = allocationContextError.value;
  }
}

async function loadInvoice() {
  isLoading.value = true;
  loadMessage.value = '';
  try {
    if (isNew.value) {
      invoiceDraft.value = createEmptyInvoice();
      flowRecords.value = [];
      resetFinancialEvents();
      sourceOrderRecord.value = null;
      lineAvailability.value = [];
      allocationContextError.value = '';
      await loadSourceOrderFromQuery();
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) {
      invoiceDraft.value = null;
      flowRecords.value = [];
      resetFinancialEvents();
      return;
    }
    const response = await getFinanceRecord('sales-invoices', code);
    invoiceDraft.value = toFinanceRecord(response.record, null);
    flowRecords.value = response.flowRecords;
    applyFinancialEvents(response as typeof response & SalesInvoiceDetailResponse);
    const orderCode = response.record.sourceOrder || response.record.sourceDoc;
    if (orderCode) await refreshAllocationContext(orderCode);
  } catch (error) {
    invoiceDraft.value = null;
    flowRecords.value = [];
    resetFinancialEvents();
    sourceOrderRecord.value = null;
    lineAvailability.value = [];
    loadMessage.value = error instanceof Error ? error.message : '销售发票加载失败';
  } finally {
    isLoading.value = false;
  }
}

async function handleOrderSelect(option: ReferenceOption) {
  const order = option.raw as SalesOrder;
  applySalesOrder(order);
  await refreshAllocationContext(order.code, order);
}

function handleQuantityChange(index: number, value: string) {
  const line = invoiceDraft.value?.lines[index];
  if (!line) return;
  line.qty = value;
  recalculateTotals();
}

function handleLineBlur(index: number) {
  recalculateTotals();
  const row = allocationRows.value[index];
  const issue = row ? allocationRowIssue(row) : '';
  if (issue) showToast(issue, 'error');
}

function validateInvoice() {
  const draft = invoiceDraft.value;
  if (!draft) return false;
  recalculateTotals();

  if (!draft.sourceDoc) {
    showToast('请先选择来源销售订单', 'error');
    sourcePicker.value?.focus();
    return false;
  }
  if (allocationBlockingMessage.value) return showToast(allocationBlockingMessage.value, 'error');
  if (!draft.party) return showToast('请补充客户', 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || '')) return showToast('请填写有效开票日期', 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate || '')) return showToast('请填写有效到期日期', 'error');
  if (draft.dueDate < draft.date) return showToast('到期日期不能早于开票日期', 'error');
  if (!draft.lines.some((line) => line.name && parseQty(line.qty) > 0)) return showToast('请至少填写一条大于 0 的开票明细', 'error');
  if (!parseMoney(draft.totalAmount)) return showToast('请补充明细单价或金额', 'error');
  return true;
}

async function persistInvoice() {
  if (isReadOnly.value) {
    showToast(saveInvoiceReadonlyReason.value || financeReadonlyReason.value, 'error');
    return null;
  }
  if (!validateInvoice() || !invoiceDraft.value) return null;

  isSaving.value = true;
  try {
    const fallbackLines = invoiceDraft.value.lines;
    const response = await saveSalesInvoice(invoiceDraft.value);
    invoiceDraft.value = toFinanceRecord(response.record, sourceOrderRecord.value, fallbackLines);
    invoiceDraft.value.lines = attachAvailabilityToLines(invoiceDraft.value.lines);
    flowRecords.value = response.flowRecords;
    showToast('销售发票已保存');
    return response.record;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '销售发票保存失败', 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveInvoiceDraft() {
  const saved = await persistInvoice();
  if (!saved) return;
  if (isNew.value) await router.replace(`/finance/sales-invoices/${encodeURIComponent(saved.code)}/edit`);
}

async function submitInvoice() {
  if (!canConfirmInvoice.value) {
    showToast(confirmInvoiceActionTitle.value, 'error');
    return;
  }
  const saved = await persistInvoice();
  if (!saved) return;

  isSaving.value = true;
  try {
    const response = await confirmSalesInvoice(saved.code);
    invoiceDraft.value = toFinanceRecord(response.record, sourceOrderRecord.value, invoiceDraft.value?.lines || []);
    invoiceDraft.value.lines = attachAvailabilityToLines(invoiceDraft.value.lines);
    flowRecords.value = response.flowRecords;
    showToast(`销售发票已确认，已生成应收 ${response.receivable.code}`);
    await router.replace(`/finance/sales-invoices/${encodeURIComponent(response.record.code)}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '确认开票失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

function openReversalForm() {
  if (!canReverseInvoice.value) {
    showToast(reverseInvoiceActionTitle.value, 'error');
    return;
  }
  showReversalForm.value = true;
}

async function reverseInvoice() {
  if (!canReverseInvoice.value || !invoiceDraft.value) {
    showToast(reverseInvoiceActionTitle.value, 'error');
    return;
  }

  const reason = reversalReason.value.trim();
  if (!reason) {
    showToast('请填写全额红冲原因。', 'error');
    return;
  }
  if (reversalBusy.value) return;

  reversalIdempotencyKey.value ||= createIdempotencyKey('sales-invoice-reversal');
  reversalBusy.value = true;
  try {
    const response = await reverseSalesInvoice(invoiceDraft.value.code, {
      reason,
      idempotencyKey: reversalIdempotencyKey.value,
    });
    const fallbackLines = invoiceDraft.value.lines;
    invoiceDraft.value = toFinanceRecord(response.record, sourceOrderRecord.value, fallbackLines);
    invoiceDraft.value.lines = attachAvailabilityToLines(invoiceDraft.value.lines);
    redInvoice.value = response.redInvoice as Partial<FinanceRecord>;
    reversal.value = response.reversal;
    refunds.value = response.refunds;
    syncRefundDrafts();
    flowRecords.value = response.flowRecords;
    showReversalForm.value = false;
    reversalReason.value = '';
    reversalIdempotencyKey.value = '';

    const orderCode = invoiceDraft.value.sourceOrder || invoiceDraft.value.sourceDoc;
    if (orderCode) await refreshAllocationContext(orderCode);
    const pendingRefund = refunds.value.find((item) => refundStatus(item) === '待退款');
    showToast(pendingRefund
      ? `${response.repeated ? '红冲请求已处理' : '已生成红字凭证'} ${redInvoiceDisplayCode.value}；退款义务 ${refundKey(pendingRefund)} 当前仍为待退款。`
      : `${response.repeated ? '红冲请求已处理' : '已生成红字凭证'} ${redInvoiceDisplayCode.value}，来源销售订单行开票额度已恢复。`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '销售发票全额红冲失败', 'error');
  } finally {
    reversalBusy.value = false;
  }
}

async function completeRefund(refund: SalesRefund, index: number) {
  const code = refundKey(refund, index);
  if (refundStatus(refund) === '已退款' || refundBusyCode.value) return;
  if (!canWriteFinance.value || !canSettleFinance.value) {
    showToast(!canWriteFinance.value ? financeReadonlyReason.value : financeSettleReadonlyReason.value, 'error');
    return;
  }

  const draft = refundDraftFor(refund, index);
  const paymentMethod = draft.paymentMethod.trim();
  const transactionRef = draft.transactionRef.trim();
  if (!paymentMethod) {
    showToast('请选择退款方式。', 'error');
    return;
  }
  if (!transactionRef) {
    showToast('请填写退款交易流水号或凭证号。', 'error');
    return;
  }

  draft.idempotencyKey ||= createIdempotencyKey('sales-refund');
  refundBusyCode.value = code;
  try {
    const response = await completeSalesRefund(code, {
      paymentMethod,
      transactionRef,
      idempotencyKey: draft.idempotencyKey,
    });
    mergeRefund(response.refund);
    flowRecords.value = response.flowRecords;
    refundDraftFor(response.refund, index).idempotencyKey = '';
    showToast(`退款 ${code} 已完成，资金流水 ${transactionRef} 已登记。`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '退款完成登记失败', 'error');
  } finally {
    refundBusyCode.value = '';
  }
}

function printInvoice() {
  window.print();
}

function handleInvoiceMoreAction(action: 'edit' | 'reverse') {
  invoiceMoreActionsOpen.value = false;
  if (action === 'edit' && invoiceDraft.value?.code) {
    void router.push(`/finance/sales-invoices/${encodeURIComponent(invoiceDraft.value.code)}/edit`);
    return;
  }
  openReversalForm();
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

watch(
  () => route.fullPath,
  () => {
    invoiceMoreActionsOpen.value = false;
    loadInvoice();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="invoiceDraft && !isLoading" class="quote-editor finance-document-editor" :class="{ 'is-detail-view': isDetail, 'is-full-width-editor': !isDetail }">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/finance/sales-invoices" aria-label="返回销售发票列表" title="返回销售发票列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ pageHeading }}</strong>
        </template>
        <template #actions>
          <template v-if="isDetail">
            <PinReferenceButton
              class="topbar-optional-action"
              :title="`销售发票 ${invoiceDraft.code}`"
              :subtitle="`${invoiceDraft.party || '未维护客户'} · ${invoiceLifecycleStatus}`"
              :path="`/finance/sales-invoices/${encodeURIComponent(invoiceDraft.code)}`"
            />
            <button class="secondary-action topbar-optional-action" type="button" title="打印当前销售发票" @click="printInvoice">
              <Printer :size="15" />
              打印
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="通过浏览器打印保存为 PDF" @click="printInvoice">
              <FileDown :size="15" />
              PDF
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="查看销售发票流转日志" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="(invoiceDraft.status === '待开票' && canWriteFinance) || (reversibleStatuses.has(invoiceDraft.status) && !hasReversal)"
              class="order-more-action-wrap"
              @keydown.esc.stop="invoiceMoreActionsOpen = false"
              @mouseleave="invoiceMoreActionsOpen = false"
            >
              <button
                class="secondary-action"
                type="button"
                title="更多操作"
                aria-haspopup="menu"
                aria-controls="detail-more-menu"
                :aria-expanded="invoiceMoreActionsOpen"
                @click="invoiceMoreActionsOpen = !invoiceMoreActionsOpen"
              >
                更多
              </button>
              <div v-if="invoiceMoreActionsOpen" id="detail-more-menu" class="order-more-menu" role="menu">
                <button
                  v-if="invoiceDraft.status === '待开票' && canWriteFinance"
                  type="button"
                  role="menuitem"
                  title="编辑当前销售发票"
                  @click="handleInvoiceMoreAction('edit')"
                >
                  <strong>编辑发票</strong>
                  <span>修改开票信息与本次开票明细</span>
                </button>
                <button
                  v-if="reversibleStatuses.has(invoiceDraft.status) && !hasReversal"
                  class="danger-option"
                  type="button"
                  role="menuitem"
                  :disabled="!canReverseInvoice || reversalBusy"
                  :title="reverseInvoiceActionTitle"
                  @click="handleInvoiceMoreAction('reverse')"
                >
                  <strong>{{ reversalBusy ? '红冲处理中…' : '全额红冲' }}</strong>
                  <span>{{ reverseInvoiceActionTitle }}</span>
                </button>
              </div>
            </div>
            <button
              v-if="invoiceDraft.status === '待开票'"
              class="primary-action"
              type="button"
              :disabled="!canConfirmInvoice || isSaving"
              :title="confirmInvoiceActionTitle"
              @click="submitInvoice"
            >
              <Send :size="15" />
              确认开票
            </button>
          </template>

          <template v-else>
            <button class="secondary-action" type="button" :disabled="isSaving || isReadOnly" :title="saveInvoiceActionTitle" @click="saveInvoiceDraft">
              <Save :size="15" />
              保存草稿
            </button>
            <button class="primary-action" type="button" :disabled="isSaving || !canConfirmInvoice" :title="confirmInvoiceActionTitle" @click="submitInvoice">
              <Send :size="15" />
              确认开票
            </button>
          </template>
        </template>
        <template #fallback><div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div></template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="isDetail" class="order-next-step-strip" :class="invoiceLifecycleStatus === '待开票' ? 'tone-pending' : 'tone-done'">
        <div>
          <span>下一步</span>
          <strong>{{ invoiceLifecycleStatus === '待开票' ? '核对来源行并确认开票' : invoiceLifecycleStatus === '已红冲' ? (refunds.some((refund) => refundStatus(refund) === '待退款') ? '处理待退款义务' : '红冲链已完成') : settlementProgress === '已收款' ? '收款已完成' : '进入应收账款办理收款' }}</strong>
        </div>
        <p>{{ invoiceLifecycleStatus === '待开票'
          ? '确认前请核对来源订单、开票明细、价税合计和到期日。'
          : invoiceLifecycleStatus === '已红冲'
            ? '请查看红字发票和退款待办，按当前状态继续处理。'
            : settlementProgress === '已收款'
              ? '本发票已完成收款，相关资金记录仍可追溯。'
              : '开票完成后，请在应收账款中按实际到账逐笔登记。' }}</p>
      </section>

      <div class="quote-form-grid" :class="{ 'is-entry-only': !isDetail }">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <div class="quote-fields">
              <label class="form-field">
                <span>开票公司</span>
                <output class="form-readonly-value">{{ invoiceDraft.company || '由销售订单带出' }}</output>
              </label>
              <label class="form-field">
                <span class="required-label">来源销售订单</span>
                <RouterLink
                  v-if="isReadOnly"
                  class="form-readonly-value quote-code finance-source-link"
                  :to="`/sales/orders/${encodeURIComponent(invoiceDraft.sourceDoc)}`"
                  :title="`查看销售订单 ${invoiceDraft.sourceDoc}`"
                >{{ invoiceDraft.sourceDoc || '-' }}</RouterLink>
                  <ReferencePicker
                    v-else
                    ref="sourcePicker"
                    v-model="invoiceDraft.sourceDoc"
                    type="sales-orders"
                  title="选择销售订单"
                  placeholder="选择销售订单"
                  search-placeholder="搜索销售订单、客户、联系人或状态"
                    :display-value="invoiceDraft.sourceDoc"
                    :disabled="isReadOnly"
                    required
                    @select="handleOrderSelect"
                  />
              </label>
              <label class="form-field">
                <span>客户</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.party || '-' }}</output>
                <input v-else v-model="invoiceDraft.party" type="text" placeholder="由销售订单带出" />
              </label>
              <label class="form-field">
                <span>联系人</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ [invoiceDraft.contact, invoiceDraft.contactPhone].filter(Boolean).join(' · ') || '-' }}</output>
                <input v-else v-model="invoiceDraft.contact" type="text" placeholder="客户联系人" />
              </label>
              <label class="form-field">
                <span>开票日期</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.date || '-' }}</output>
                <input v-else v-model="invoiceDraft.date" type="date" />
              </label>
              <label class="form-field">
                <span>到期日期</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.dueDate || '-' }}</output>
                <input v-else v-model="invoiceDraft.dueDate" type="date" />
              </label>
              <label class="form-field">
                <span>经办人</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.owner || '-' }}</output>
                <input v-else v-model="invoiceDraft.owner" type="text" readonly />
              </label>
              <label class="form-field">
                <span>发票类型</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.invoiceType || '-' }}</output>
                <select v-else v-model="invoiceDraft.invoiceType">
                  <option>增值税专用发票</option>
                  <option>普通发票</option>
                  <option>电子发票</option>
                </select>
              </label>
              <label class="form-field">
                <span>结算方式</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.paymentMethod || '-' }}</output>
                <select v-else v-model="invoiceDraft.paymentMethod">
                  <option v-for="option in salesInvoiceSettlementOptions" :key="option">{{ option }}</option>
                </select>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>开票明细</h2>
            </div>
            <p v-if="!invoiceDraft.sourceDoc" class="section-hint">选择来源销售订单后带出可开票明细。</p>
            <div v-if="allocationContextLoading" class="allocation-notice">正在核对订单行与其他有效发票占用…</div>
            <div v-else-if="allocationBlockingMessage" class="allocation-notice allocation-notice-error">
              {{ allocationBlockingMessage }}
            </div>

            <div v-if="invoiceDraft.sourceDoc" class="invoice-allocation-table">
              <div class="invoice-allocation-head">
                <span>来源销售订单行</span>
                <span>{{ sourceAmountLabel }}</span>
                <span>其他发票已开 / 占用</span>
                <span>本次开票</span>
                <span>本次后剩余可开</span>
              </div>
              <div
                v-for="(row, index) in allocationRows"
                :key="row.key"
                class="invoice-allocation-row"
                :class="{ 'has-allocation-error': Boolean(allocationRowIssue(row)) }"
              >
                <div class="allocation-product-cell">
                  <span class="product-thumb" :style="{ backgroundColor: lineItems[index]?.image.tone }">
                    <span>{{ lineItems[index]?.image.label }}</span>
                  </span>
                  <div class="line-product-card">
                    <strong :title="productIdentity(row.line, '由销售订单带出')">{{ lineItems[index]?.name || lineItems[index]?.materialCode || '由销售订单带出' }}</strong>
                    <small>{{ [lineItems[index]?.materialCode, lineItems[index]?.model].filter(Boolean).join(' · ') || '物料信息待补充' }}</small>
                    <small>{{ invoiceDraft.sourceDoc || '-' }} · {{ row.sourceLineId || '来源行未识别' }} · {{ row.line.uom || '-' }}</small>
                  </div>
                </div>

                <div class="allocation-metric-cell">
                  <strong>{{ formatQty(row.orderQty) }} {{ row.line.uom || '' }}</strong>
                  <span>{{ formatMoney(row.orderAmount) }}</span>
                  <small>{{ sourceUnitPriceLabel }} {{ row.orderLine?.grossUnitPrice || row.orderLine?.unitPrice || '-' }}</small>
                </div>

                <div class="allocation-metric-cell">
                  <strong>{{ formatQty(row.invoicedQty) }} {{ row.line.uom || '' }}</strong>
                  <span>{{ formatMoney(row.invoicedAmount) }}</span>
                  <small>不含本发票；含其他有效发票和未确认草稿</small>
                </div>

                <div class="allocation-current-cell" :class="{ 'is-readonly': isReadOnly }">
                  <label>
                    <span class="allocation-field-label">数量</span>
                    <output v-if="isReadOnly" class="allocation-readonly-value">
                      {{ formatQty(parseQty(row.line.qty)) }} {{ row.line.uom || '' }}
                    </output>
                    <QuantityWithUnitInput
                      v-else
                      :model-value="row.line.qty"
                      :unit="row.line.uom"
                      placeholder="本次数量"
                      @update:model-value="handleQuantityChange(index, $event)"
                      @blur="handleLineBlur(index)"
                    />
                  </label>
                  <label>
                    <span class="allocation-field-label">单价</span>
                    <output v-if="isReadOnly" class="allocation-readonly-value">
                      {{ formatMoney(parseMoney(row.line.unitPrice)) }}
                    </output>
                    <input
                      v-else
                      v-model="row.line.unitPrice"
                      type="text"
                      placeholder="例如 ￥18.00"
                      @input="recalculateTotals"
                      @blur="handleLineBlur(index)"
                    />
                  </label>
                  <label>
                    <span class="allocation-field-label">金额</span>
                    <output v-if="isReadOnly" class="allocation-readonly-value allocation-money-value">
                      {{ formatMoney(parseMoney(row.line.amount)) }}
                    </output>
                    <input v-else :value="row.line.amount" type="text" readonly />
                  </label>
                  <label>
                    <span class="allocation-field-label">税率</span>
                    <output v-if="isReadOnly" class="allocation-readonly-value">
                      {{ row.line.taxRate || '-' }}
                    </output>
                    <select v-else v-model="row.line.taxRate" @change="recalculateTotals">
                      <option>13%</option>
                      <option>9%</option>
                      <option>1%</option>
                      <option>0%</option>
                      <option>免税</option>
                    </select>
                  </label>
                </div>

                <div class="allocation-metric-cell allocation-remaining-cell">
                  <strong>{{ formatQty(row.remainingQty) }} {{ row.line.uom || '' }}</strong>
                  <span>{{ formatMoney(row.remainingAmount) }}</span>
                  <small>本次上限 {{ formatQty(row.availableQty) }} {{ row.line.uom || '' }} / {{ formatMoney(row.availableAmount) }}</small>
                  <small v-if="allocationRowIssue(row)" class="allocation-error-text">{{ allocationRowIssue(row) }}</small>
                </div>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>开票与收款</h2>
            </div>

            <div class="quote-fields">
              <label class="form-field">
                <span>未税金额</span>
                <output class="form-readonly-value finance-calculated-value">{{ invoiceDraft.amount }}</output>
              </label>
              <label class="form-field">
                <span>税额</span>
                <output class="form-readonly-value finance-calculated-value">{{ invoiceDraft.taxAmount }}</output>
              </label>
              <label class="form-field">
                <span>含税总额</span>
                <output class="form-readonly-value finance-calculated-value is-emphasis">{{ invoiceDraft.totalAmount }}</output>
              </label>
              <label class="form-field">
                <span>已结算金额</span>
                <output class="form-readonly-value finance-calculated-value">{{ invoiceDraft.settledAmount }}</output>
              </label>
              <label class="form-field field-span-2">
                <span>公司收款账户</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.bankAccount || '-' }}</output>
                <input v-else v-model="invoiceDraft.bankAccount" type="text" placeholder="填写公司收款账户" />
              </label>
              <label class="form-field full-field">
                <span>备注</span>
                <output v-if="isReadOnly" class="form-readonly-value form-readonly-note">{{ invoiceDraft.note || '无' }}</output>
                <textarea
                  v-else
                  v-model="invoiceDraft.note"
                  class="terms-textarea"
                  rows="5"
                  placeholder="填写客户开票信息、税率差异、账期或收款备注"
                ></textarea>
              </label>
            </div>
          </section>

          <section v-if="showReversalWorkflow" class="form-section reversal-section">
            <div class="form-section-head reversal-section-head">
              <h2>红冲与退款</h2>
              <i v-if="hasReversal" class="mini-status status-reversed">已全额红冲</i>
            </div>

            <div class="reversal-policy-facts">
              <div><span>红冲范围</span><strong>整张全额</strong></div>
              <div><span>订单额度</span><strong>红冲后恢复</strong></div>
              <div><span>已收款项</span><strong>登记真实退款流水后才算已退款</strong></div>
            </div>

            <div v-if="!hasReversal" class="reversal-entry-card">
              <div>
                <strong>发起全额红冲</strong>
              </div>
              <button
                v-if="!showReversalForm"
                class="secondary-action danger-action"
                type="button"
                :disabled="!canReverseInvoice || reversalBusy"
                :title="reverseInvoiceActionTitle"
                @click="openReversalForm"
              >
                <RotateCcw :size="15" />
                全额红冲
              </button>

              <form v-else class="reversal-form" @submit.prevent="reverseInvoice">
                <label class="form-field full-field">
                  <span>红冲原因（必填）</span>
                  <textarea
                    v-model="reversalReason"
                    rows="3"
                    placeholder="说明错误开票、客户信息变更等真实原因"
                    :disabled="reversalBusy"
                  ></textarea>
                </label>
                <div class="reversal-form-actions">
                  <button class="secondary-action" type="button" :disabled="reversalBusy" title="取消本次红冲操作" @click="showReversalForm = false">
                    暂不处理
                  </button>
                  <button
                    class="secondary-action danger-action"
                    type="submit"
                    :disabled="reversalBusy || !reversalReason.trim()"
                    :title="reversalReason.trim() ? '按原发票全部行和金额生成红字凭证' : '请先填写红冲原因'"
                  >
                    <RotateCcw :size="15" />
                    {{ reversalBusy ? '红冲处理中…' : '确认全额红冲' }}
                  </button>
                </div>
              </form>
            </div>

            <div v-else class="reversal-result">
              <div class="document-chain" aria-label="原发票、红字凭证与退款义务来源链">
                <article class="document-chain-node">
                  <small>原销售发票</small>
                  <strong>{{ invoiceDraft.code }}</strong>
                  <span>{{ invoiceDraft.totalAmount }} · {{ invoiceDraft.status }}</span>
                </article>
                <ArrowRight class="document-chain-arrow" :size="20" />
                <article class="document-chain-node red-document-node">
                  <small>全额红字凭证</small>
                  <strong>{{ redInvoiceDisplayCode }}</strong>
                  <span>{{ redInvoice?.totalAmount || '冲销原发票全部金额' }}</span>
                </article>
                <template v-if="refunds.length">
                  <ArrowRight class="document-chain-arrow" :size="20" />
                  <article class="document-chain-node refund-document-node">
                    <small>退款义务</small>
                    <strong>{{ refunds.map((refund, index) => refundKey(refund, index)).join('、') }}</strong>
                    <span>{{ refunds.some((refund) => refundStatus(refund) === '待退款') ? '存在待退款资金事件' : '退款资金事件已完成' }}</span>
                  </article>
                </template>
              </div>

              <div class="reversal-meta">
                <span>红冲记录：{{ reversalDisplayCode }}</span>
                <span>原因：{{ reversal?.reason || '-' }}</span>
                <span>操作人：{{ reversal?.actor || invoiceDraft.owner || '-' }}</span>
                <span>时间：{{ reversal?.reversedAt || reversal?.createdAt || '-' }}</span>
              </div>
              <p class="reversal-accounting-note">
                红字凭证已恢复来源销售订单行的开票额度；这项会计冲销不等于资金已经退回。
              </p>

              <div v-if="refunds.length" class="refund-list">
                <article v-for="(refund, index) in refunds" :key="refundKey(refund, index)" class="refund-card">
                  <div class="refund-card-head">
                    <div>
                      <small>退款义务</small>
                      <strong>{{ refundKey(refund, index) }}</strong>
                    </div>
                    <i class="mini-status" :class="refundStatus(refund) === '已退款' ? 'status-done' : 'status-refund-pending'">
                      {{ refundStatus(refund) }}
                    </i>
                  </div>
                  <div class="refund-source-line">
                    <span>来源：{{ refund.sourceInvoice || invoiceDraft.code }}</span>
                    <span>红字凭证：{{ refund.redInvoiceCode || redInvoiceDisplayCode }}</span>
                    <strong>{{ refundAmount(refund) }}</strong>
                  </div>

                  <div v-if="refundStatus(refund) === '待退款'" class="refund-completion-form">
                    <label class="form-field">
                      <span>退款方式</span>
                      <select v-model="refundDraftFor(refund, index).paymentMethod" :disabled="refundBusyCode === refundKey(refund, index)">
                        <option>原路退回</option>
                        <option>银行转账</option>
                        <option>承兑退回</option>
                        <option>其他</option>
                      </select>
                    </label>
                    <label class="form-field">
                      <span>交易流水号 / 凭证号</span>
                      <input
                        v-model="refundDraftFor(refund, index).transactionRef"
                        type="text"
                        placeholder="填写实际退款交易流水"
                        :disabled="refundBusyCode === refundKey(refund, index)"
                      />
                    </label>
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="Boolean(refundBusyCode) || !canWriteFinance || !canSettleFinance"
                      title="确认真实退款已完成并登记资金流水"
                      @click="completeRefund(refund, index)"
                    >
                      <CircleDollarSign :size="15" />
                      {{ refundBusyCode === refundKey(refund, index) ? '登记中…' : '确认资金已退回' }}
                    </button>
                    <p>只有真实退款完成并登记交易流水后，状态才会从“待退款”变为“已退款”。失败时当前输入会保留。</p>
                  </div>
                  <div v-else class="refund-completed-info">
                    <CircleDollarSign :size="18" />
                    <div>
                      <strong>退款资金事件已完成</strong>
                      <span>{{ refund.paymentMethod || '-' }} · {{ refund.transactionRef || '-' }} · {{ refund.completedAt || '-' }}</span>
                    </div>
                  </div>
                </article>
              </div>
              <div v-else class="no-refund-obligation">
                <CircleDollarSign :size="18" />
                <span>原发票未发生收款，本次红冲无需生成退款义务。</span>
              </div>
            </div>
          </section>
        </div>

        <aside v-if="isDetail" class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="状态与结算"
              :primary-status="invoiceLifecycleStatus"
              :items="invoiceStatusPanelItems"
              aria-label="销售发票状态与结算"
            />
          </section>

          <section class="summary-section">
            <div class="summary-title">
              <ClipboardList :size="17" />
              <h2>开票额度</h2>
            </div>
            <div v-for="row in summaryRows" :key="row.label" class="summary-line">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </section>

        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="销售发票"
      :message="loadMessage || '销售发票不存在'"
      back-path="/finance/sales-invoices"
      back-label="返回销售发票"
      @retry="loadInvoice"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="销售发票流转记录"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>

<style scoped>
.allocation-notice {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #d8e3ef;
  border-radius: 8px;
  background: #f6f9fc;
  color: #43566d;
  font-size: 13px;
  line-height: 1.5;
}

.allocation-notice-error {
  border-color: #efc9c4;
  background: #fff6f5;
  color: #a33b32;
}

.invoice-allocation-table {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e5e9ef;
  border-radius: 10px;
  background: #fff;
}

.invoice-allocation-head,
.invoice-allocation-row {
  display: grid;
  grid-template-columns: minmax(210px, 1.4fr) minmax(135px, 0.85fr) minmax(155px, 1fr) minmax(250px, 1.55fr) minmax(170px, 1.05fr);
  gap: 12px;
  align-items: center;
}

.invoice-allocation-head {
  padding: 10px 14px;
  background: #f6f8fb;
  color: #667085;
  font-size: 12px;
  font-weight: 600;
}

.invoice-allocation-row {
  padding: 14px;
  border-top: 1px solid #edf0f3;
}

.invoice-allocation-row.has-allocation-error {
  box-shadow: inset 3px 0 0 #d95c50;
  background: #fffafa;
}

.allocation-product-cell {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.allocation-product-cell .line-product-card {
  min-width: 0;
}

.allocation-metric-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.allocation-metric-cell strong {
  color: #253347;
  font-size: 14px;
}

.allocation-metric-cell span {
  color: #475467;
  font-size: 13px;
}

.allocation-metric-cell small {
  color: #8a94a3;
  font-size: 11px;
  line-height: 1.45;
}

.allocation-current-cell {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.allocation-current-cell label {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.allocation-current-cell .allocation-field-label {
  color: #7b8796;
  font-size: 11px;
}

.allocation-current-cell.is-readonly {
  align-self: stretch;
}

.allocation-readonly-value {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 32px;
  padding: 1px 0 5px;
  border-bottom: 1px solid #eceee9;
  color: #30342f;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  white-space: nowrap;
}

.allocation-money-value {
  font-variant-numeric: tabular-nums;
}

.allocation-current-cell input,
.allocation-current-cell select {
  width: 100%;
  height: 32px;
  min-width: 0;
  padding: 0 9px;
  border: 1px solid #dfe3da;
  border-radius: 7px;
  color: #30342f;
  background: #ffffff;
  font: inherit;
  font-size: 13px;
  line-height: 1;
}

.allocation-current-cell input:focus,
.allocation-current-cell select:focus {
  outline: 0;
  border-color: #8ea08d;
  box-shadow: 0 0 0 3px rgba(75, 101, 78, 0.1);
}

.allocation-current-cell input[readonly] {
  color: #555b53;
  background: #f1f2ed;
  cursor: default;
}

.allocation-remaining-cell .allocation-error-text {
  color: #b42318;
  font-weight: 600;
}

.reversal-section {
  border-color: #eadedc;
  background: linear-gradient(180deg, #fff 0%, #fffafa 100%);
}

.reversal-section-head {
  align-items: flex-start;
}

.status-reversed,
.status-refund-pending {
  background: #fff1ef;
  color: #b42318;
}

.reversal-policy-facts {
  display: grid;
  grid-template-columns: 0.8fr 0.9fr 1.7fr;
  overflow: hidden;
  margin-bottom: 14px;
  border: 1px solid #e5e9ef;
  border-radius: 8px;
  background: #fff;
}

.reversal-policy-facts > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-left: 1px solid #e8ebef;
}

.reversal-policy-facts > div:first-child {
  border-left: 0;
}

.reversal-policy-facts span {
  color: #7b8491;
  font-size: 11px;
}

.reversal-policy-facts strong {
  color: #344054;
  font-size: 12px;
  line-height: 1.45;
}

.reversal-entry-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px;
  border: 1px solid #efc9c4;
  border-radius: 10px;
  background: #fff8f7;
}

.reversal-entry-card > div:first-child strong {
  color: #7a271a;
}

.reversal-entry-card p,
.reversal-form > p {
  margin: 5px 0 0;
  color: #7d5b57;
  font-size: 12px;
  line-height: 1.55;
}

.reversal-form {
  display: grid;
  width: min(560px, 100%);
  gap: 10px;
}

.reversal-form textarea {
  width: 100%;
  resize: vertical;
}

.reversal-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.reversal-result {
  display: grid;
  gap: 14px;
}

.document-chain {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: stretch;
  gap: 8px;
}

.document-chain-node {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  padding: 14px;
  border: 1px solid #dce3ea;
  border-radius: 10px;
  background: #fff;
}

.document-chain-node small {
  color: #7b8796;
  font-size: 11px;
}

.document-chain-node strong {
  overflow: hidden;
  color: #253347;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-chain-node span {
  color: #667085;
  font-size: 12px;
  line-height: 1.45;
}

.red-document-node {
  border-color: #efc9c4;
  background: #fff8f7;
}

.red-document-node strong {
  color: #9f3028;
}

.refund-document-node {
  border-color: #f0d6a9;
  background: #fffbf3;
}

.document-chain-arrow {
  align-self: center;
  color: #98a2b3;
}

.reversal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  color: #667085;
  font-size: 12px;
}

.reversal-accounting-note {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid #b5473e;
  border-radius: 6px;
  background: #fff3f1;
  color: #7a271a;
  font-size: 13px;
  line-height: 1.55;
}

.refund-list {
  display: grid;
  gap: 12px;
}

.refund-card {
  padding: 15px;
  border: 1px solid #e1e6ec;
  border-radius: 10px;
  background: #fff;
}

.refund-card-head,
.refund-source-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.refund-card-head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.refund-card-head small,
.refund-source-line span {
  color: #7b8796;
  font-size: 12px;
}

.refund-card-head strong,
.refund-source-line strong {
  color: #253347;
}

.refund-source-line {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #edf0f3;
}

.refund-source-line strong {
  margin-left: auto;
}

.refund-completion-form {
  display: grid;
  grid-template-columns: minmax(150px, 0.75fr) minmax(220px, 1.25fr) auto;
  align-items: end;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border-radius: 8px;
  background: #f7f9fb;
}

.refund-completion-form > p {
  grid-column: 1 / -1;
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.5;
}

.refund-completed-info,
.no-refund-obligation {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: #eef9f2;
  color: #18794e;
}

.refund-completed-info div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.refund-completed-info span,
.no-refund-obligation span {
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 1360px) {
  .invoice-allocation-table {
    overflow: visible;
    border: 0;
    background: transparent;
  }

  .invoice-allocation-head {
    display: none;
  }

  .invoice-allocation-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid #e5e9ef;
    border-radius: 10px;
    background: #ffffff;
  }

  .allocation-product-cell,
  .allocation-current-cell {
    grid-column: 1 / -1;
  }

  .allocation-product-cell {
    padding-bottom: 10px;
    border-bottom: 1px solid #edf0f3;
  }

  .allocation-metric-cell {
    position: relative;
    min-height: 92px;
    padding: 28px 10px 10px;
    border: 1px solid #edf0f3;
    border-radius: 8px;
    background: #fafbfc;
  }

  .allocation-metric-cell::before {
    position: absolute;
    top: 8px;
    left: 10px;
    color: #667085;
    font-size: 11px;
    font-weight: 650;
  }

  .invoice-allocation-row > .allocation-metric-cell:nth-child(2)::before {
    content: '订单数量 / 税价金额';
  }

  .invoice-allocation-row > .allocation-metric-cell:nth-child(3)::before {
    content: '其他发票已开 / 占用';
  }

  .invoice-allocation-row > .allocation-metric-cell:nth-child(5)::before {
    content: '本次后剩余可开';
  }

  .allocation-current-cell {
    padding-top: 2px;
  }

  .document-chain {
    grid-template-columns: minmax(0, 1fr);
  }

  .document-chain-arrow {
    justify-self: center;
    transform: rotate(90deg);
  }
}

@media (max-width: 720px) {
  .invoice-allocation-table {
    overflow: visible;
    border: 0;
    background: transparent;
  }

  .invoice-allocation-head {
    display: none;
  }

  .invoice-allocation-row {
    display: flex;
    flex-direction: column;
    min-width: 0;
    align-items: stretch;
    margin-bottom: 12px;
    border: 1px solid #e5e9ef;
    border-radius: 10px;
    background: #fff;
  }

  .allocation-metric-cell {
    display: grid;
    grid-template-columns: minmax(110px, 0.8fr) minmax(0, 1fr);
    align-items: baseline;
    position: static;
    min-height: 0;
    padding: 10px 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .allocation-metric-cell::before {
    position: static;
    top: auto;
    left: auto;
    grid-row: 1 / span 3;
    color: #667085;
    font-size: 12px;
    font-weight: 600;
  }

  .invoice-allocation-row > .allocation-metric-cell:nth-child(2)::before {
    content: '订单数量 / 税价金额';
  }

  .invoice-allocation-row > .allocation-metric-cell:nth-child(3)::before {
    content: '其他发票已开 / 占用';
  }

  .invoice-allocation-row > .allocation-metric-cell:nth-child(5)::before {
    content: '本次后剩余';
  }

  .reversal-policy-facts,
  .refund-completion-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .reversal-policy-facts > div {
    border-top: 1px solid #e8ebef;
    border-left: 0;
  }

  .reversal-policy-facts > div:first-child {
    border-top: 0;
  }

  .reversal-entry-card,
  .refund-card-head,
  .refund-source-line {
    align-items: stretch;
    flex-direction: column;
  }

  .reversal-form {
    width: 100%;
  }

  .refund-source-line strong {
    margin-left: 0;
  }
}
</style>
