<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  FileDown,
  FileText,
  Printer,
  Send,
} from 'lucide-vue-next';

import FlowRecordPanel from '../components/FlowRecordPanel.vue';
import DocumentLoadState from '../components/DocumentLoadState.vue';
import DocumentStatusPanel from '../components/DocumentStatusPanel.vue';
import FinanceSettlementDialog from '../components/FinanceSettlementDialog.vue';
import FinanceSettlementHistory from '../components/FinanceSettlementHistory.vue';
import OperationPermissionBanner from '../components/OperationPermissionBanner.vue';
import PageTopbarPortal from '../components/PageTopbarPortal.vue';
import PinReferenceButton from '../components/PinReferenceButton.vue';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { getFinanceRecord, receiveReceivable, type FinanceSettlementPayload } from '../services/api';
import type { FinanceLine, FinanceRecord, FinanceSettlementEvent, FlowRecord } from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteFinance, readonlyReason: financeReadonlyReason } = useModulePermission('finance');
const { canOperate: canSettleFinance, readonlyReason: financeSettleReadonlyReason } = useOperationPermission(
  'financeSettle',
  '登记收款',
);
const receivableDraft = ref<FinanceRecord | null>(null);
const flowRecords = ref<FlowRecord[]>([]);
const payments = ref<FinanceSettlementEvent[]>([]);
const showFlowRecords = ref(false);
const settlementDialogOpen = ref(false);
const isSaving = ref(false);
const isLoading = ref(false);
const loadMessage = ref('');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
let toastTimer: number | undefined;

const isNew = computed(() => route.name?.toString() === 'finance-receivable-new');
const isReceived = computed(() => ['已收款', '已核销', '已冲销'].includes(receivableDraft.value?.status || ''));
const isRefundPending = computed(() => receivableDraft.value?.refundStatus === '待退款');
const canRegisterReceipt = computed(() => canWriteFinance.value && canSettleFinance.value);
const adjustmentAmount = computed(() => Number(receivableDraft.value?.afterSalesAdjustmentAmount || 0));
const effectiveTotalAmount = computed(() => Math.max(0, parseMoney(receivableDraft.value?.totalAmount || '') - adjustmentAmount.value));
const remainingAmount = computed(() => Math.max(0, effectiveTotalAmount.value - parseMoney(receivableDraft.value?.settledAmount || '')));
const registerReceiptReadonlyReason = computed(() => {
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (!canSettleFinance.value) return financeSettleReadonlyReason.value;
  return '';
});
const registerReceiptActionTitle = computed(() => {
  const status = receivableDraft.value?.status || '-';
  if (isReceived.value) return `当前状态为${status}，不能重复登记收款。`;
  return registerReceiptReadonlyReason.value || '登记收款';
});
const sourceInvoicePath = computed(() => (
  receivableDraft.value?.sourceDoc
    ? `/finance/sales-invoices/${encodeURIComponent(receivableDraft.value.sourceDoc)}`
    : '/finance/sales-invoices'
));
const pageHeading = computed(() => (isNew.value ? '登记收款' : receivableDraft.value?.code || '应收账款'));
const operationPermissionHint = computed(() => (
  !canSettleFinance.value ? financeSettleReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u767b\u8bb0\u6536\u6b3e\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';
const nextStepTitle = computed(() => {
  if (isRefundPending.value) return '前往销售发票处理退款';
  if (receivableDraft.value?.status === '已冲销') return '应收已冲销';
  if (isReceived.value) return '收款已完成';
  if (receivableDraft.value?.status === '部分收款') return `继续收款 ${formatMoney(remainingAmount.value)}`;
  return `登记收款 ${formatMoney(remainingAmount.value)}`;
});
const receivableLifecycleStatus = computed(() => {
  if (receivableDraft.value?.status === '已冲销') return '已冲销';
  return isReceived.value ? '已结清' : '执行中';
});
const dueState = computed<{ label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }>(() => {
  if (isRefundPending.value) return { label: '转退款处理', tone: 'warning' };
  if (isReceived.value) return { label: '无需催收', tone: 'success' };
  const delta = dayDifference(shanghaiDate(), receivableDraft.value?.dueDate || '');
  if (delta === null) return { label: '未维护', tone: 'neutral' };
  if (delta < 0) return { label: `逾期 ${Math.abs(delta)} 天`, tone: 'danger' };
  if (delta === 0) return { label: '今日到期', tone: 'warning' };
  if (delta <= 3) return { label: `${delta} 天后到期`, tone: 'warning' };
  return { label: `距到期 ${delta} 天`, tone: 'neutral' };
});
const receivableStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const items: DocumentStatusItem[] = [
    { key: 'settlement', label: '结算进度', value: receivableDraft.value?.status || '-', kind: 'status' },
    { key: 'due', label: '到期状态', value: dueState.value.label, kind: 'status', tone: dueState.value.tone },
    { key: 'payments', label: '收款记录', value: `${payments.value.length} 笔`, kind: 'text' },
  ];
  if (receivableDraft.value?.refundStatus) {
    items.push({
      key: 'refund',
      label: '退款进度',
      value: receivableDraft.value.refundStatus,
      kind: 'status',
      tone: isRefundPending.value ? 'warning' : 'success',
      route: sourceInvoicePath.value,
    });
  }
  return items;
});
const lineItems = computed(() =>
  (receivableDraft.value?.lines ?? []).map((line, index) => ({
    key: `${line.materialCode || line.name || 'new'}-${index}`,
    ...line,
    image: lineImage(line),
  })),
);

function createEmptyLine(): FinanceLine {
  return {
    materialCode: '',
    name: '',
    qty: '',
    unitPrice: '',
    amount: '',
    taxRate: '13%',
  };
}

function parseMoney(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function formatMoney(value: number) {
  return `￥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dayDifference(fromDate: string, toDate: string) {
  const parseDate = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
  };
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

function toFinanceRecord(source: Partial<FinanceRecord>): FinanceRecord {
  const record = {
    code: '',
    sourceDoc: '',
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
    status: '待收款',
    date: '',
    dueDate: '',
    invoiceType: '应收账款',
    paymentMethod: '',
    bankAccount: '',
    lines: [createEmptyLine()],
    note: '',
    ...source,
  };
  return {
    ...record,
    lines: source.lines?.length ? source.lines : [createEmptyLine()],
  };
}

function lineImage(line: FinanceLine) {
  return {
    label: line.imageLabel || line.materialCode?.slice(-4).toUpperCase() || 'FIN',
    tone: line.imageTone || '#eeeeee',
  };
}

async function loadReceivable() {
  loadMessage.value = '';

  if (isNew.value) {
    isLoading.value = false;
    receivableDraft.value = null;
    flowRecords.value = [];
    payments.value = [];
    loadMessage.value = '应收账款由销售发票确认开票后生成，请从待收款列表中登记收款。';
    return;
  }

  const code = route.params.code?.toString() ?? '';
  if (!code) {
    isLoading.value = false;
    receivableDraft.value = null;
    flowRecords.value = [];
    payments.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const response = await getFinanceRecord('receivables', code);
    receivableDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    payments.value = response.payments || [];
  } catch (error) {
    receivableDraft.value = null;
    flowRecords.value = [];
    payments.value = [];
    loadMessage.value = error instanceof Error ? error.message : '应收账款加载失败';
  } finally {
    isLoading.value = false;
  }
}

function registerReceipt() {
  const code = receivableDraft.value?.code;
  if (!canRegisterReceipt.value) return showToast(registerReceiptActionTitle.value, 'error');
  if (!code || isReceived.value) return;
  settlementDialogOpen.value = true;
}

async function submitReceipt(payload: FinanceSettlementPayload) {
  const code = receivableDraft.value?.code;
  if (!code) return;
  isSaving.value = true;
  try {
    const response = await receiveReceivable(code, payload);
    receivableDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    payments.value = response.payments || [];
    settlementDialogOpen.value = false;
    showToast(response.record.status === '已收款' ? '收款已登记，应收账款已收清' : '收款已登记，剩余应收继续保留');
    await router.replace(`/finance/receivables/${encodeURIComponent(code)}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '登记收款失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

function printReceivable() {
  window.print();
}

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  toastMessage.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
  }, 2400);
}

watch(() => route.fullPath, loadReceivable, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="receivableDraft" class="quote-editor finance-document-editor is-detail-view">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/finance/receivables" aria-label="返回应收账款列表" title="返回应收账款列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ pageHeading }}</strong>
        </template>
        <template #actions>
          <PinReferenceButton
            class="topbar-optional-action"
            :title="`应收账款 ${receivableDraft.code}`"
            :subtitle="`${receivableDraft.party || '未维护客户'} · ${receivableDraft.status}`"
            :path="`/finance/receivables/${encodeURIComponent(receivableDraft.code)}`"
          />
          <button class="secondary-action topbar-optional-action" type="button" title="打印当前应收账款" @click="printReceivable">
            <Printer :size="15" />
            打印
          </button>
          <button class="secondary-action topbar-optional-action" type="button" title="通过浏览器打印保存为 PDF" @click="printReceivable">
            <FileDown :size="15" />
            PDF
          </button>
          <button class="secondary-action topbar-optional-action" type="button" title="查看应收账款流转日志" @click="showFlowRecords = true">
            <FileText :size="15" />
            日志
          </button>
          <RouterLink v-if="isRefundPending" class="primary-action" :to="sourceInvoicePath" title="前往来源销售发票处理退款">
            <Send :size="15" />
            处理退款
          </RouterLink>
          <button v-else-if="!isReceived" class="primary-action" type="button" :disabled="isSaving || !canRegisterReceipt" :title="registerReceiptActionTitle" @click="registerReceipt">
            <Send :size="15" />
            {{ receivableDraft.status === '部分收款' ? '继续收款' : '登记收款' }}
          </button>
        </template>
        <template #fallback><div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div></template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section class="order-next-step-strip" :class="isRefundPending || !isReceived ? 'tone-pending' : 'tone-done'">
        <div><span>下一步</span><strong>{{ nextStepTitle }}</strong></div>
        <p v-if="isRefundPending">原销售发票已红冲，收款义务已转为退款；退款登记统一在来源发票中处理。</p>
        <p v-else-if="isReceived">本应收不再需要收款操作；历史资金记录仍完整保留。</p>
        <p v-else>按实际到账金额逐笔登记，不要求一次结清；每笔资金都保存日期、方式和凭证号。</p>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <dl class="material-fact-grid finance-fact-grid">
              <div><dt>收款公司</dt><dd>{{ receivableDraft.company || receivableDraft.companyCode || '-' }}</dd></div>
              <div><dt>来源销售发票</dt><dd><RouterLink :to="`/finance/sales-invoices/${encodeURIComponent(receivableDraft.sourceDoc)}`">{{ receivableDraft.sourceDoc || '-' }}</RouterLink></dd></div>
              <div><dt>来源销售订单</dt><dd><RouterLink :to="`/sales/orders/${encodeURIComponent(receivableDraft.sourceOrder || '')}`">{{ receivableDraft.sourceOrder || '-' }}</RouterLink></dd></div>
              <div><dt>客户</dt><dd>{{ receivableDraft.party }}</dd></div>
              <div><dt>联系人</dt><dd>{{ [receivableDraft.contact, receivableDraft.contactPhone].filter(Boolean).join(' · ') || '-' }}</dd></div>
              <div><dt>应收日期</dt><dd>{{ receivableDraft.date || '-' }}</dd></div>
              <div><dt>到期日期</dt><dd>{{ receivableDraft.dueDate || '-' }}</dd></div>
              <div><dt>经办人</dt><dd>{{ receivableDraft.owner || '-' }}</dd></div>
              <div><dt>结算方式</dt><dd>{{ receivableDraft.paymentMethod || '-' }}</dd></div>
            </dl>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>应收明细</h2>
            </div>

            <div class="quote-line-table">
              <div class="quote-line-row warehouse-document-line-row quote-line-head">
                <span>图片</span>
                <span>项目</span>
                <span class="is-number">数量</span>
                <span class="is-number">发票单价</span>
                <span class="is-number">发票行金额</span>
                <span class="is-number">税率</span>
              </div>
              <div v-for="item in lineItems" :key="item.key" class="quote-line-row warehouse-document-line-row">
                <span class="product-thumb" :style="{ backgroundColor: item.image.tone }">
                  <span>{{ item.image.label }}</span>
                </span>
                <div class="line-product-card">
                  <strong :title="item.name || item.materialCode">{{ item.name || item.materialCode || '-' }}</strong>
                  <small>{{ [item.materialCode, item.model].filter(Boolean).join(' · ') || '物料信息待补充' }}</small>
                  <small :title="item.spec || ''">{{ item.spec || '规格未维护' }} · 基础单位 {{ item.uom || '-' }}</small>
                </div>
                <output class="document-line-readonly-value is-number">{{ item.qty }}</output>
                <output class="document-line-readonly-value is-number">{{ formatMoney(parseMoney(item.unitPrice)) }}</output>
                <output class="document-line-readonly-value is-number is-emphasis">{{ formatMoney(parseMoney(item.amount)) }}</output>
                <output class="document-line-readonly-value is-number">{{ item.taxRate }}</output>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h2>收款与未结金额</h2>
            </div>
            <dl class="material-fact-grid finance-money-fact-grid">
              <div><dt>未税金额</dt><dd>{{ receivableDraft.amount }}</dd></div>
              <div><dt>税额</dt><dd>{{ receivableDraft.taxAmount }}</dd></div>
              <div><dt>应收总额</dt><dd>{{ formatMoney(effectiveTotalAmount) }}</dd></div>
              <div v-if="adjustmentAmount > 0"><dt>售后调减</dt><dd>{{ formatMoney(adjustmentAmount) }}</dd></div>
              <div><dt>已收金额</dt><dd>{{ receivableDraft.settledAmount }}</dd></div>
              <div class="finance-balance-fact"><dt>未收金额</dt><dd>{{ formatMoney(remainingAmount) }}</dd></div>
              <div><dt>默认收款账户</dt><dd>{{ receivableDraft.bankAccount || '-' }}</dd></div>
            </dl>
            <div v-if="receivableDraft.note" class="document-note-block"><strong>备注</strong><p>{{ receivableDraft.note }}</p></div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>收款记录</h2></div>
            <FinanceSettlementHistory direction="收款" :events="payments" />
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="状态与收款"
              :primary-status="receivableLifecycleStatus"
              :items="receivableStatusPanelItems"
              aria-label="应收账款状态与收款"
            />
          </section>

        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      :title="isNew ? '可登记的应收账款' : '应收账款'"
      :message="loadMessage"
      back-path="/finance/receivables"
      back-label="返回应收账款"
      @retry="loadReceivable"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="应收账款流转记录"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <FinanceSettlementDialog
      :open="settlementDialogOpen"
      direction="收款"
      :record-code="receivableDraft?.code || ''"
      :party="receivableDraft?.party || ''"
      :total-amount="formatMoney(effectiveTotalAmount)"
      :settled-amount="receivableDraft?.settledAmount || '￥0.00'"
      default-method="银行转账"
      :default-account="receivableDraft?.bankAccount || ''"
      :busy="isSaving"
      @close="settlementDialogOpen = false"
      @submit="submitReceipt"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
