<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  FileDown,
  FileText,
  Printer,
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
import { purchaseMaterialVisuals } from '../data/purchase';
import { productIdentity } from '../utils/productDisplay';
import {
  confirmPurchaseInvoice,
  getFinanceRecord,
  getPurchaseInvoiceMatching,
  getPurchaseOrder,
  getPurchaseReceipt,
  savePurchaseInvoice,
} from '../services/api';
import type {
  FinanceLine,
  FinanceRecord,
  FlowRecord,
  PurchaseOrder,
  PurchaseOrderProduct,
  PurchaseReceipt,
  PurchaseInvoiceMatch,
  ReferenceOption,
  WarehouseReceiptProduct,
} from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteFinance, readonlyReason: financeReadonlyReason } = useModulePermission('finance');
const { canOperate: canSettleFinance, readonlyReason: financeSettleReadonlyReason } = useOperationPermission(
  'financeSettle',
  '确认收票',
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
const matching = ref<PurchaseInvoiceMatch | null>(null);
const purchaseTaxMode = ref<'含税' | '不含税'>('含税');
let toastTimer: number | undefined;

const isNew = computed(() => route.name?.toString() === 'finance-purchase-invoice-new');
const isEdit = computed(() => route.name?.toString() === 'finance-purchase-invoice-edit');
const isDetail = computed(() => route.name?.toString() === 'finance-purchase-invoice-detail');
const isReadOnly = computed(() => isDetail.value || invoiceDraft.value?.status !== '待收票' || !canWriteFinance.value);
const pageHeading = computed(() => {
  if (isNew.value) return '新建采购发票';
  const code = invoiceDraft.value?.code || '采购发票';
  if (isEdit.value) return invoiceDraft.value?.status !== '待收票' ? code : `编辑 ${code}`;
  return code;
});
const invoiceLifecycleStatus = computed(() => invoiceDraft.value?.documentStatus || (invoiceDraft.value?.status === '待收票' ? '待收票' : '已收票'));
const sourceReferenceLabel = computed(() => '来源采购收货');
const sourceReferencePath = computed(() => `/warehouse/purchase-receipts/${encodeURIComponent(invoiceDraft.value?.sourceDoc || '')}`);
const paymentProgress = computed(() => {
  if (invoiceDraft.value?.settlementStatus) return invoiceDraft.value.settlementStatus;
  const total = parseMoney(invoiceDraft.value?.totalAmount || '');
  const settled = parseMoney(invoiceDraft.value?.settledAmount || '');
  if (settled <= 0) return '未付款';
  return settled + 0.01 >= total ? '已付款' : '部分付款';
});
const canConfirmInvoice = computed(() => invoiceDraft.value?.status === '待收票' && Boolean(matching.value?.matched) && canWriteFinance.value && canSettleFinance.value);
const matchingStatusLabel = computed(() => {
  if (!matching.value?.matched) return '待核对';
  return invoiceDraft.value?.status === '待收票' ? '可确认' : '已匹配';
});
const confirmInvoiceReadonlyReason = computed(() => {
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (!canSettleFinance.value) return financeSettleReadonlyReason.value;
  return '';
});
const saveInvoiceReadonlyReason = computed(() => {
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (invoiceDraft.value?.status !== '待收票') return '采购发票确认收票后关键内容锁定，差异需通过后续更正单处理。';
  if (isDetail.value) return '当前采购发票详情只读，不能保存草稿。';
  return '';
});
const confirmInvoiceActionTitle = computed(() => {
  const status = invoiceDraft.value?.status || '-';
  if (status !== '待收票') return `当前状态为${status}，不能确认收票。`;
  if (matching.value?.blockedReasons?.length) return matching.value.blockedReasons[0];
  return confirmInvoiceReadonlyReason.value || '确认收票';
});
const operationPermissionHint = computed(() => (
  !canSettleFinance.value ? financeSettleReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u786e\u8ba4\u6536\u7968\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';
const summaryRows = computed<DocumentStatusItem[]>(() => {
  if (!invoiceDraft.value) return [];

  const rows: DocumentStatusItem[] = [
    { key: 'matching', label: '三单匹配', value: matchingStatusLabel.value, kind: 'status' },
  ];
  if (matching.value?.blockedReasons.length) rows.push({
      key: 'blocking',
      label: '阻断差异',
      value: `${matching.value.blockedReasons.length} 项`,
      tone: 'danger',
    });
  if (matching.value?.warnings.length) rows.push({
      key: 'warnings',
      label: '风险提示',
      value: `${matching.value.warnings.length} 项`,
      tone: 'warning',
    });
  rows.push({ key: 'payment', label: '付款进度', value: paymentProgress.value, kind: 'status' });
  return rows;
});
const lineItems = computed(() =>
  (invoiceDraft.value?.lines ?? []).map((line, index) => ({
    key: `${line.materialCode || line.name || 'new'}-${index}`,
    ...line,
    image: lineImage(line),
  })),
);

function today(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createEmptyLine(): FinanceLine {
  return {
    materialCode: '',
    name: '',
    model: '',
    spec: '',
    uom: '',
    qty: '',
    unitPrice: '',
    amount: '',
    taxRate: '13%',
  };
}

function createEmptyInvoice(): FinanceRecord {
  return {
    code: '系统自动生成',
    companyCode: '',
    company: '',
    sourceDoc: (route.query.receipt || route.query.source)?.toString() ?? '',
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
    status: '待收票',
    date: today(),
    dueDate: today(30),
    invoiceType: '增值税专用发票',
    paymentMethod: '验收后付款',
    bankAccount: '',
    lines: [createEmptyLine()],
    note: '核对采购来源、交付结果和供应商发票金额后确认收票。',
  };
}

function toFinanceRecord(source: Partial<FinanceRecord>): FinanceRecord {
  return {
    ...createEmptyInvoice(),
    ...source,
    lines: source.lines?.length ? source.lines : [createEmptyLine()],
  };
}

function parseQty(value: string) {
  return Number(String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
}

function currentInvoiceQty(sourceLineId: string) {
  return (invoiceDraft.value?.lines || [])
    .filter((line) => String(line.sourceLineId || '') === String(sourceLineId || ''))
    .reduce((sum, line) => sum + parseQty(line.qty), 0);
}

function remainingAfterCurrent(sourceLineId: string, remainingBeforeCurrent: number) {
  return Math.max(0, Number(remainingBeforeCurrent || 0) - currentInvoiceQty(sourceLineId));
}

function currentInvoiceAmount(sourceLineId: string) {
  return (invoiceDraft.value?.lines || [])
    .filter((line) => String(line.sourceLineId || '') === String(sourceLineId || ''))
    .reduce((sum, line) => sum + parseMoney(line.amount), 0);
}

function remainingAmountAfterCurrent(line: PurchaseInvoiceMatch['lines'][number]) {
  return Math.max(0, Number(line.remainingAmount || 0) - currentInvoiceAmount(line.sourceLineId));
}

function postedMatchAmount(line: PurchaseInvoiceMatch['lines'][number]) {
  if (!line.orderedQty) return 0;
  return Number(line.orderAmount || 0) * Math.min(1, Number(line.postedQty || 0) / Number(line.orderedQty || 1));
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

function taxRateValue(value: string) {
  const numeric = Number(String(value || '13').replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric / 100 : 0.13;
}

function lineImage(line: FinanceLine) {
  return (
    (line.name && purchaseMaterialVisuals[line.name]) || {
      label: line.imageLabel || line.materialCode?.slice(-4).toUpperCase() || 'FIN',
      tone: line.imageTone || '#eeeeee',
    }
  );
}

function matchOrderLine(product: WarehouseReceiptProduct, order?: PurchaseOrder) {
  return order?.products.find(
    (line) =>
      (product.materialCode && line.materialCode === product.materialCode) ||
      (product.name && line.name === product.name),
  );
}

function mapReceiptLine(product: WarehouseReceiptProduct, orderLine?: PurchaseOrderProduct): FinanceLine {
  const unitPrice = orderLine?.grossUnitPrice || orderLine?.unitPrice || '';
  const amount = unitPrice ? formatMoney(parseQty(product.qty) * parseMoney(unitPrice)) : orderLine?.amount || '';

  return {
    materialCode: product.materialCode || orderLine?.materialCode || '',
    name: product.name || orderLine?.name || '',
    model: product.model || orderLine?.model || '',
    spec: product.spec || orderLine?.spec || '',
    uom: product.uom || orderLine?.uom || '',
    qty: product.qty || orderLine?.qty || '',
    unitPrice,
    amount,
    taxRate: orderLine?.taxRate || '13%',
    imageLabel: product.imageLabel || orderLine?.imageLabel || '',
    imageTone: product.imageTone || orderLine?.imageTone || '',
    sourceLineId: orderLine?.lineId || '',
    sourceReceiptLineId: product.lineId || '',
  };
}

function receiptInvoiceQuantity(receipt: PurchaseReceipt, product: WarehouseReceiptProduct, index: number) {
  const lineId = product.lineId || `L${index + 1}`;
  const postedQty = receipt.postedQuantities?.lines?.find((line) => line.receiptLineId === lineId)?.postedQty;
  if (Number.isFinite(postedQty) && Number(postedQty) > 0) return String(postedQty);
  const decisionLine = receipt.qualityDecision?.lines?.find((line) => line.receiptLineId === lineId);
  const releasedQty = Number(decisionLine?.releasedQty ?? Number(decisionLine?.acceptedQty || 0) + Number(decisionLine?.concessionQty || 0));
  if (Number.isFinite(releasedQty) && releasedQty > 0) return String(releasedQty);
  return product.qty;
}

function recalculateTotals() {
  const draft = invoiceDraft.value;
  if (!draft) return;

  let netAmount = 0;
  let taxAmount = 0;
  let grossAmount = 0;
  draft.lines = draft.lines.map((line) => {
    const lineAmount = parseQty(line.qty) * parseMoney(line.unitPrice);
    const rate = taxRateValue(line.taxRate);
    if (purchaseTaxMode.value === '含税') {
      const lineNet = rate > 0 ? lineAmount / (1 + rate) : lineAmount;
      netAmount += lineNet;
      taxAmount += lineAmount - lineNet;
      grossAmount += lineAmount;
    } else {
      netAmount += lineAmount;
      taxAmount += lineAmount * rate;
      grossAmount += lineAmount * (1 + rate);
    }
    return {
      ...line,
      amount: lineAmount ? formatMoney(lineAmount) : line.amount,
    };
  });

  draft.amount = formatMoney(netAmount);
  draft.taxAmount = formatMoney(taxAmount);
  draft.totalAmount = formatMoney(grossAmount);
}

async function applyReceipt(receipt: PurchaseReceipt) {
  if (!invoiceDraft.value) return;

  let order: PurchaseOrder | undefined;
  if (receipt.sourceDoc) {
    try {
      order = (await getPurchaseOrder(receipt.sourceDoc)).order;
    } catch {
      loadMessage.value = '来源采购订单暂时无法读取，发票明细会先使用入库数量。';
    }
  }

  invoiceDraft.value.sourceDoc = receipt.code;
  invoiceDraft.value.sourceOrder = receipt.sourceDoc || '';
  invoiceDraft.value.companyCode = receipt.companyCode || order?.companyCode || '';
  invoiceDraft.value.company = receipt.company || order?.company || '';
  invoiceDraft.value.partyCode = receipt.supplierCode || order?.supplierCode || '';
  invoiceDraft.value.party = receipt.supplier || order?.supplier || '';
  invoiceDraft.value.contact = receipt.contact || order?.contact || '';
  invoiceDraft.value.contactPhone = receipt.contactPhone || order?.contactPhone || '';
  invoiceDraft.value.paymentMethod = order?.paymentMethod || invoiceDraft.value.paymentMethod;
  purchaseTaxMode.value = order?.taxMode === '不含税' ? '不含税' : '含税';
  invoiceDraft.value.lines = receipt.products.length
    ? receipt.products.map((product, index) => mapReceiptLine(
      { ...product, qty: receiptInvoiceQuantity(receipt, product, index) },
      matchOrderLine(product, order),
    ))
    : [createEmptyLine()];
  invoiceDraft.value.note = `来源采购收货 ${receipt.code}，核对采购订单 ${receipt.sourceDoc || '-'} 后确认收票。`;
  recalculateTotals();
  await loadMatching(receipt.code);
}

async function loadMatching(sourceReference = invoiceDraft.value?.sourceDoc || '') {
  if (!sourceReference) {
    matching.value = null;
    return;
  }
  try {
    const excludeCode = invoiceDraft.value?.code && invoiceDraft.value.code !== '系统自动生成' ? invoiceDraft.value.code : '';
    matching.value = await getPurchaseInvoiceMatching(sourceReference, excludeCode);
  } catch (error) {
    matching.value = null;
    loadMessage.value = error instanceof Error ? error.message : '三单匹配信息加载失败';
  }
}

async function loadSourceFromQuery() {
  const receiptCode = route.query.receipt?.toString() ?? '';
  const fallbackCode = route.query.source?.toString() ?? '';
  const code = receiptCode || fallbackCode;
  if (!code || !invoiceDraft.value || invoiceDraft.value.sourceDoc !== code) return;

  try {
    const response = await getPurchaseReceipt(code);
    await applyReceipt(response.receipt);
  } catch {
    loadMessage.value = '采购收货来源暂时无法读取，可重新选择或稍后重试。';
  }
}

async function loadInvoice() {
  isLoading.value = true;
  loadMessage.value = '';
  try {
    if (isNew.value) {
      invoiceDraft.value = createEmptyInvoice();
      flowRecords.value = [];
      matching.value = null;
      purchaseTaxMode.value = '含税';
      await loadSourceFromQuery();
      return;
    }

    const code = route.params.code?.toString() ?? '';
    if (!code) {
      invoiceDraft.value = null;
      flowRecords.value = [];
      matching.value = null;
      return;
    }
    const response = await getFinanceRecord('purchase-invoices', code);
    invoiceDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    matching.value = response.matching || null;
    if (response.record.sourceOrder) {
      try {
        const sourceOrder = await getPurchaseOrder(response.record.sourceOrder);
        purchaseTaxMode.value = sourceOrder.order.taxMode === '不含税' ? '不含税' : '含税';
      } catch {
        purchaseTaxMode.value = '含税';
      }
    }
  } catch (error) {
    invoiceDraft.value = null;
    flowRecords.value = [];
    matching.value = null;
    loadMessage.value = error instanceof Error ? error.message : '采购发票加载失败';
  } finally {
    isLoading.value = false;
  }
}

function handleSourceSelect(option: ReferenceOption) {
  void applyReceipt(option.raw as PurchaseReceipt);
}

function validateInvoice() {
  const draft = invoiceDraft.value;
  if (!draft) return false;
  recalculateTotals();

  if (!draft.sourceDoc) {
    showToast(`请先选择${sourceReferenceLabel.value}`, 'error');
    sourcePicker.value?.focus();
    return false;
  }
  if (!draft.party) return showToast('请补充供应商', 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || '')) return showToast('请填写有效收票日期', 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate || '')) return showToast('请填写有效到期日期', 'error');
  if (draft.dueDate < draft.date) return showToast('到期日期不能早于收票日期', 'error');
  if (!draft.lines.some((line) => line.name && parseQty(line.qty) > 0)) return showToast('请至少填写一条大于 0 的收票明细', 'error');
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
    const response = await savePurchaseInvoice(invoiceDraft.value);
    invoiceDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    matching.value = response.matching || null;
    showToast('采购发票已保存');
    return response.record;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '采购发票保存失败', 'error');
    return null;
  } finally {
    isSaving.value = false;
  }
}

async function saveInvoiceDraft() {
  const saved = await persistInvoice();
  if (!saved) return;
  if (isNew.value) await router.replace(`/finance/purchase-invoices/${encodeURIComponent(saved.code)}/edit`);
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
    const response = await confirmPurchaseInvoice(saved.code);
    invoiceDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    matching.value = response.matching || null;
    showToast(`采购发票已确认，已生成应付款 ${response.payable.code}`);
    await router.replace(`/finance/purchase-invoices/${encodeURIComponent(response.record.code)}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '确认收票失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

function printInvoice() {
  window.print();
}

function editInvoice() {
  invoiceMoreActionsOpen.value = false;
  if (!invoiceDraft.value?.code) return;
  void router.push(`/finance/purchase-invoices/${encodeURIComponent(invoiceDraft.value.code)}/edit`);
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
          <RouterLink class="topbar-back-action" to="/finance/purchase-invoices" aria-label="返回采购发票列表" title="返回采购发票列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ pageHeading }}</strong>
        </template>
        <template #actions>
          <template v-if="isDetail">
            <PinReferenceButton
              class="topbar-optional-action"
              :title="`采购发票 ${invoiceDraft.code}`"
              :subtitle="`${invoiceDraft.party || '未维护供应商'} · ${invoiceLifecycleStatus}`"
              :path="`/finance/purchase-invoices/${encodeURIComponent(invoiceDraft.code)}`"
            />
            <button class="secondary-action topbar-optional-action" type="button" title="打印当前采购发票" @click="printInvoice">
              <Printer :size="15" />
              打印
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="通过浏览器打印保存为 PDF" @click="printInvoice">
              <FileDown :size="15" />
              PDF
            </button>
            <button class="secondary-action topbar-optional-action" type="button" title="查看采购发票流转日志" @click="showFlowRecords = true">
              <FileText :size="15" />
              日志
            </button>
            <div
              v-if="invoiceDraft.status === '待收票' && canWriteFinance"
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
                <button type="button" role="menuitem" title="编辑当前采购发票" @click="editInvoice">
                  <strong>编辑发票</strong>
                  <span>修改收票信息与本次收票明细</span>
                </button>
              </div>
            </div>
            <button v-if="invoiceDraft.status === '待收票'" class="primary-action" type="button" :disabled="!canConfirmInvoice || isSaving" :title="confirmInvoiceActionTitle" @click="submitInvoice">
              <Send :size="15" />
              确认收票
            </button>
          </template>

          <template v-else>
            <button class="secondary-action" type="button" :disabled="isSaving || isReadOnly" :title="saveInvoiceReadonlyReason" @click="saveInvoiceDraft">
              <Save :size="15" />
              保存草稿
            </button>
            <button class="primary-action" type="button" :disabled="isSaving || !canConfirmInvoice" :title="confirmInvoiceActionTitle" @click="submitInvoice">
              <Send :size="15" />
              确认收票
            </button>
          </template>
        </template>
        <template #fallback><div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div></template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section v-if="isDetail" class="order-next-step-strip" :class="invoiceLifecycleStatus === '已收票' ? 'tone-done' : 'tone-pending'">
        <div><span>下一步</span><strong>{{ invoiceLifecycleStatus === '待收票' ? '核对三单并确认收票' : paymentProgress === '已付款' ? '付款已完成' : '进入应付账款办理付款' }}</strong></div>
        <p>{{ invoiceLifecycleStatus === '待收票'
          ? '采购、正式入库和供应商发票数量必须匹配；差异需要先处理，不能直接确认。'
          : paymentProgress === '已付款'
            ? '本发票已完成付款，相关资金记录仍可追溯。'
            : '收票完成后，请在应付账款中按实际支付逐笔登记。' }}</p>
      </section>

      <div class="quote-form-grid" :class="{ 'is-entry-only': !isDetail }">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <div class="quote-fields">
              <label class="form-field">
                <span>来源类型</span>
                <output class="form-readonly-value">采购订单收货</output>
              </label>
              <label class="form-field">
                <span>收票公司</span>
                <output class="form-readonly-value">{{ invoiceDraft.company || `由${sourceReferenceLabel}带出` }}</output>
              </label>
              <label class="form-field">
                <span class="required-label">{{ sourceReferenceLabel }}</span>
                <RouterLink
                  v-if="isReadOnly"
                  class="form-readonly-value quote-code finance-source-link"
                  :to="sourceReferencePath"
                  :title="`查看${sourceReferenceLabel} ${invoiceDraft.sourceDoc}`"
                >{{ invoiceDraft.sourceDoc || '-' }}</RouterLink>
                  <ReferencePicker
                    v-else
                    ref="sourcePicker"
                    v-model="invoiceDraft.sourceDoc"
                    type="purchase-receipts"
                  :title="`选择${sourceReferenceLabel}`"
                  :placeholder="`选择${sourceReferenceLabel}`"
                  search-placeholder="搜索采购收货单、采购订单、供应商、仓库或库位"
                    :display-value="invoiceDraft.sourceDoc"
                    :disabled="isReadOnly"
                    required
                    @select="handleSourceSelect"
                  />
              </label>
              <label class="form-field">
                <span>来源采购订单</span>
                <RouterLink
                  v-if="isReadOnly"
                  class="form-readonly-value quote-code finance-source-link"
                  :to="`/purchase/orders/${encodeURIComponent(invoiceDraft.sourceOrder || '')}`"
                  :title="`查看采购订单 ${invoiceDraft.sourceOrder}`"
                >{{ invoiceDraft.sourceOrder || '-' }}</RouterLink>
                <input v-else v-model="invoiceDraft.sourceOrder" type="text" readonly placeholder="由采购收货带出" />
              </label>
              <label class="form-field">
                <span>供应商 / 联系人</span>
                <output class="form-readonly-value">{{ [invoiceDraft.party, invoiceDraft.contact, invoiceDraft.contactPhone].filter(Boolean).join(' · ') || `由${sourceReferenceLabel}带出` }}</output>
              </label>
              <label class="form-field">
                <span>收票日期</span>
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
                  <option>验收后付款</option>
                  <option>月结 30 天</option>
                  <option>到票后 10 天</option>
                  <option>预付后尾款</option>
                </select>
              </label>
            </div>
          </section>

          <section class="form-section finance-match-section">
            <div class="form-section-head">
              <h2>三单匹配</h2>
              <i class="mini-status" :class="matching?.matched ? 'status-done' : 'status-pending'">{{ matchingStatusLabel }}</i>
            </div>

            <div v-if="matching?.blockedReasons.length" class="finance-match-message is-error">
              <strong>暂不能确认收票</strong>
              <span v-for="reason in matching.blockedReasons" :key="reason">{{ reason }}</span>
            </div>
            <div v-else-if="matching?.warnings.length" class="finance-match-message">
              <strong>需要留意</strong>
              <span v-for="warning in matching.warnings" :key="warning">{{ warning }}</span>
            </div>

            <div v-if="matching?.lines.length" class="finance-match-lines">
              <div class="finance-match-line finance-match-line-head"><span>物料</span><span>采购约定</span><span>正式入库</span><span>其他发票已收</span><span>本次收票</span><span>收票后剩余</span></div>
              <div v-for="line in matching.lines" :key="line.sourceLineId || line.materialCode" class="finance-match-line">
                <span><strong>{{ line.name }}</strong><small>{{ line.materialCode }}</small></span>
                <span><strong>{{ line.orderedQty }} {{ line.unit }}</strong><small>{{ formatMoney(line.orderAmount) }}</small></span>
                <span><strong>{{ line.postedQty }} {{ line.unit }}</strong><small>{{ formatMoney(postedMatchAmount(line)) }}</small></span>
                <span><strong>{{ line.previouslyInvoicedQty }} {{ line.unit }}</strong><small>{{ formatMoney(line.previouslyInvoicedAmount) }}</small></span>
                <span><strong>{{ currentInvoiceQty(line.sourceLineId) }} {{ line.unit }}</strong><small>{{ formatMoney(currentInvoiceAmount(line.sourceLineId)) }}</small></span>
                <span><strong>{{ remainingAfterCurrent(line.sourceLineId, line.remainingQty) }} {{ line.unit }}</strong><small>{{ formatMoney(remainingAmountAfterCurrent(line)) }}</small></span>
              </div>
            </div>
            <p v-else-if="!invoiceDraft.sourceDoc" class="section-hint">选择{{ sourceReferenceLabel }}后显示匹配结果。</p>
          </section>

          <section v-if="invoiceDraft.sourceDoc || isReadOnly" class="form-section">
            <div class="section-heading">
              <h2>收票明细</h2>
            </div>

            <div class="quote-line-table">
              <div class="quote-line-row warehouse-document-line-row quote-line-head">
                <span>图片</span>
                <span>项目</span>
                <span>数量</span>
                <span>{{ purchaseTaxMode === '含税' ? '含税单价' : '未税单价' }}</span>
                <span>{{ purchaseTaxMode === '含税' ? '含税金额' : '未税金额' }}</span>
                <span>税率</span>
              </div>
              <div v-for="(item, index) in invoiceDraft.lines" :key="`${item.materialCode || 'new'}-${index}`" class="quote-line-row warehouse-document-line-row">
                <span class="product-thumb" :style="{ backgroundColor: lineItems[index]?.image.tone }">
                  <span>{{ lineItems[index]?.image.label }}</span>
                </span>
                <div class="line-product-card">
                  <strong :title="productIdentity(item, `由${sourceReferenceLabel}带出`)">{{ item.name || item.materialCode || `由${sourceReferenceLabel}带出` }}</strong>
                  <small>{{ [item.materialCode, item.model].filter(Boolean).join(' · ') || '物料信息待补充' }}</small>
                  <small :title="item.spec || ''">{{ item.spec || '—' }} · 基础单位 {{ item.uom || '—' }}</small>
                </div>
                <output v-if="isReadOnly" class="invoice-line-readonly-value">{{ parseQty(item.qty) }} {{ item.uom || '' }}</output>
                <QuantityWithUnitInput v-else v-model="item.qty" :unit="item.uom" placeholder="例如 20" @blur="recalculateTotals" />
                <output v-if="isReadOnly" class="invoice-line-readonly-value">{{ formatMoney(parseMoney(item.unitPrice)) }}</output>
                <input v-else v-model="item.unitPrice" type="text" placeholder="例如 ￥18.00" @blur="recalculateTotals" />
                <output class="invoice-line-readonly-value">{{ formatMoney(parseMoney(item.amount)) }}</output>
                <output v-if="isReadOnly" class="invoice-line-readonly-value">{{ item.taxRate || '-' }}</output>
                <select v-else v-model="item.taxRate" @change="recalculateTotals">
                  <option>13%</option>
                  <option>9%</option>
                  <option>6%</option>
                  <option>3%</option>
                  <option>1%</option>
                  <option>0%</option>
                  <option>免税</option>
                </select>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>收票与付款</h2>
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
                <span>供应商收款账户</span>
                <output v-if="isReadOnly" class="form-readonly-value">{{ invoiceDraft.bankAccount || '-' }}</output>
                <input v-else v-model="invoiceDraft.bankAccount" type="text" placeholder="填写供应商收款账户" />
              </label>
              <label class="form-field full-field">
                <span>备注</span>
                <output v-if="isReadOnly" class="form-readonly-value form-readonly-note">{{ invoiceDraft.note || '无' }}</output>
                <textarea
                  v-else
                  v-model="invoiceDraft.note"
                  class="terms-textarea"
                  rows="5"
                  placeholder="填写三单匹配、税率差异、供应商发票备注或付款条件"
                ></textarea>
              </label>
            </div>
          </section>
        </div>

        <aside v-if="isDetail" class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="状态与结算"
              :primary-status="invoiceLifecycleStatus"
              :items="summaryRows"
              aria-label="采购发票状态与结算"
            />
          </section>

        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      title="采购发票"
      :message="loadMessage || '采购发票不存在'"
      back-path="/finance/purchase-invoices"
      back-label="返回采购发票"
      @retry="loadInvoice"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="采购发票流转记录"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
