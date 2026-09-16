<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CirclePause,
  CirclePlay,
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
import WarehouseActionReasonDialog from '../components/WarehouseActionReasonDialog.vue';
import { useModulePermission, useOperationPermission } from '../composables/useModulePermission';
import { getFinanceRecord, payPayable, updateFinanceStatus, type FinanceSettlementPayload } from '../services/api';
import type { FinanceLine, FinanceRecord, FinanceSettlementEvent, FlowRecord } from '../types/business';
import type { DocumentStatusItem } from '../types/documentUi';

const route = useRoute();
const router = useRouter();
const { canWrite: canWriteFinance, readonlyReason: financeReadonlyReason } = useModulePermission('finance');
const { canOperate: canSettleFinance, readonlyReason: financeSettleReadonlyReason } = useOperationPermission(
  'financeSettle',
  '登记付款',
);
const payableDraft = ref<FinanceRecord | null>(null);
const flowRecords = ref<FlowRecord[]>([]);
const payments = ref<FinanceSettlementEvent[]>([]);
const showFlowRecords = ref(false);
const settlementDialogOpen = ref(false);
const holdDialogOpen = ref(false);
const isSaving = ref(false);
const isStatusSaving = ref(false);
const isLoading = ref(false);
const loadMessage = ref('');
const toastMessage = ref('');
const toastTone = ref<'success' | 'error'>('success');
let toastTimer: number | undefined;

const isNew = computed(() => route.name?.toString() === 'finance-payable-new');
const isPaid = computed(() => ['已付款', '已核销', '已冲销'].includes(payableDraft.value?.status || ''));
const isPaymentHeld = computed(() => payableDraft.value?.holdStatus === '已暂缓');
const canRegisterPayment = computed(() => canWriteFinance.value && canSettleFinance.value && !isPaymentHeld.value);
const canTogglePaymentHold = computed(() => canWriteFinance.value && canSettleFinance.value && !isPaid.value);
const adjustmentAmount = computed(() => Number(payableDraft.value?.afterSalesAdjustmentAmount || 0));
const effectiveTotalAmount = computed(() => Math.max(0, parseMoney(payableDraft.value?.totalAmount || '') - adjustmentAmount.value));
const remainingAmount = computed(() => Math.max(0, effectiveTotalAmount.value - parseMoney(payableDraft.value?.settledAmount || '')));
const registerPaymentReadonlyReason = computed(() => {
  if (!canWriteFinance.value) return financeReadonlyReason.value;
  if (!canSettleFinance.value) return financeSettleReadonlyReason.value;
  return '';
});
const registerPaymentActionTitle = computed(() => {
  const status = payableDraft.value?.status || '-';
  if (isPaid.value) return `当前状态为${status}，不能重复登记付款。`;
  if (isPaymentHeld.value) return '当前应付已暂缓，请先处理暂缓原因再登记付款。';
  return registerPaymentReadonlyReason.value || '登记付款';
});
const pageHeading = computed(() => (isNew.value ? '登记付款' : payableDraft.value?.code || '应付账款'));
const operationPermissionHint = computed(() => (
  !canSettleFinance.value ? financeSettleReadonlyReason.value : ''
));
const operationPermissionSuffix = '\u767b\u8bb0\u4ed8\u6b3e\u548c\u5f02\u5e38\u5904\u7406\u4f1a\u4fdd\u6301\u4e0d\u53ef\u7528\u3002';
const nextStepTitle = computed(() => {
  if (payableDraft.value?.status === '已冲销') return '应付已冲销';
  if (isPaid.value) return '付款已完成';
  if (isPaymentHeld.value) return '先处理暂缓原因';
  if (payableDraft.value?.status === '部分付款') return `继续付款 ${formatMoney(remainingAmount.value)}`;
  return `登记付款 ${formatMoney(remainingAmount.value)}`;
});
const payableLifecycleStatus = computed(() => {
  if (payableDraft.value?.status === '已冲销') return '已冲销';
  return isPaid.value ? '已结清' : '执行中';
});
const dueState = computed<{ label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }>(() => {
  if (isPaid.value) return { label: '无需付款', tone: 'success' };
  const delta = dayDifference(shanghaiDate(), payableDraft.value?.dueDate || '');
  if (delta === null) return { label: '未维护', tone: 'neutral' };
  if (delta < 0) return { label: `逾期 ${Math.abs(delta)} 天`, tone: 'danger' };
  if (delta === 0) return { label: '今日到期', tone: 'warning' };
  if (delta <= 3) return { label: `${delta} 天后到期`, tone: 'warning' };
  return { label: `距到期 ${delta} 天`, tone: 'neutral' };
});
const payableStatusPanelItems = computed<DocumentStatusItem[]>(() => {
  const items: DocumentStatusItem[] = [
    { key: 'settlement', label: '结算进度', value: payableDraft.value?.status || '-', kind: 'status' },
    { key: 'due', label: '到期状态', value: dueState.value.label, kind: 'status', tone: dueState.value.tone },
    { key: 'payments', label: '付款记录', value: `${payments.value.length} 笔`, kind: 'text' },
  ];
  if (isPaymentHeld.value) {
    items.push({
      key: 'attention',
      label: '异常/暂停',
      value: '付款暂缓',
      detail: payableDraft.value?.holdReason || '待处理暂缓原因',
      kind: 'status',
      tone: 'danger',
    });
  }
  return items;
});
const lineItems = computed(() =>
  (payableDraft.value?.lines ?? []).map((line, index) => ({
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
    status: '待付款',
    date: '',
    dueDate: '',
    invoiceType: '应付账款',
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

async function loadPayable() {
  loadMessage.value = '';

  if (isNew.value) {
    isLoading.value = false;
    payableDraft.value = null;
    flowRecords.value = [];
    payments.value = [];
    loadMessage.value = '应付款由采购发票确认收票后生成，请从待付款列表中登记付款。';
    return;
  }

  const code = route.params.code?.toString() ?? '';
  if (!code) {
    isLoading.value = false;
    payableDraft.value = null;
    flowRecords.value = [];
    payments.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const response = await getFinanceRecord('payables', code);
    payableDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    payments.value = response.payments || [];
  } catch (error) {
    payableDraft.value = null;
    flowRecords.value = [];
    payments.value = [];
    loadMessage.value = error instanceof Error ? error.message : '应付账款加载失败';
  } finally {
    isLoading.value = false;
  }
}

function openHoldDialog() {
  if (!canTogglePaymentHold.value) {
    showToast(registerPaymentReadonlyReason.value || '当前应付不能调整付款暂缓状态。', 'error');
    return;
  }
  holdDialogOpen.value = true;
}

async function submitHoldStatus(reason: string) {
  const code = payableDraft.value?.code;
  if (!code || !canTogglePaymentHold.value) return;
  const wasHeld = isPaymentHeld.value;
  isStatusSaving.value = true;
  try {
    const response = await updateFinanceStatus('payables', code, {
      status: wasHeld ? '正常' : '已暂缓',
      action: wasHeld ? '恢复付款' : '暂缓付款',
      remark: reason,
    });
    payableDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    holdDialogOpen.value = false;
    showToast(wasHeld ? '付款已恢复，可以继续登记实际付款' : '付款已暂缓，结算进度保持不变');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '付款暂缓状态更新失败', 'error');
  } finally {
    isStatusSaving.value = false;
  }
}

function registerPayment() {
  const code = payableDraft.value?.code;
  if (!canRegisterPayment.value) return showToast(registerPaymentActionTitle.value, 'error');
  if (!code || isPaid.value) return;
  settlementDialogOpen.value = true;
}

async function submitPayment(payload: FinanceSettlementPayload) {
  const code = payableDraft.value?.code;
  if (!code) return;
  isSaving.value = true;
  try {
    const response = await payPayable(code, payload);
    payableDraft.value = toFinanceRecord(response.record);
    flowRecords.value = response.flowRecords;
    payments.value = response.payments || [];
    settlementDialogOpen.value = false;
    showToast(response.record.status === '已付款' ? '付款已登记，应付账款已付清' : '付款已登记，剩余应付继续保留');
    await router.replace(`/finance/payables/${encodeURIComponent(code)}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '登记付款失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

function printPayable() {
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

watch(() => route.fullPath, loadPayable, { immediate: true });

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page-stack">
    <section v-if="payableDraft" class="quote-editor finance-document-editor is-detail-view">
      <PageTopbarPortal>
        <template #context>
          <RouterLink class="topbar-back-action" to="/finance/payables" aria-label="返回应付账款列表" title="返回应付账款列表">
            <ArrowLeft :size="14" :stroke-width="2" />
            <span>返回</span>
          </RouterLink>
          <strong class="topbar-context-title">{{ pageHeading }}</strong>
        </template>
        <template #actions>
          <PinReferenceButton
            class="topbar-optional-action"
            :title="`应付账款 ${payableDraft.code}`"
            :subtitle="`${payableDraft.party || '未维护供应商'} · ${payableDraft.status}`"
            :path="`/finance/payables/${encodeURIComponent(payableDraft.code)}`"
          />
          <button class="secondary-action topbar-optional-action" type="button" title="打印当前应付账款" @click="printPayable">
            <Printer :size="15" />
            打印
          </button>
          <button class="secondary-action topbar-optional-action" type="button" title="通过浏览器打印保存为 PDF" @click="printPayable">
            <FileDown :size="15" />
            PDF
          </button>
          <button class="secondary-action topbar-optional-action" type="button" title="查看应付账款流转日志" @click="showFlowRecords = true">
            <FileText :size="15" />
            日志
          </button>
          <button
            v-if="!isPaid"
            class="secondary-action topbar-optional-action"
            type="button"
            :disabled="isStatusSaving || !canTogglePaymentHold"
            :title="isPaymentHeld ? '处理暂缓原因并恢复付款' : '记录原因并暂缓付款'"
            @click="openHoldDialog"
          >
            <CirclePlay v-if="isPaymentHeld" :size="15" />
            <CirclePause v-else :size="15" />
            {{ isPaymentHeld ? '恢复付款' : '暂缓付款' }}
          </button>
          <button v-if="!isPaid" class="primary-action" type="button" :disabled="isSaving || !canRegisterPayment" :title="registerPaymentActionTitle" @click="registerPayment">
            <Send :size="15" />
            {{ payableDraft.status === '部分付款' ? '继续付款' : '登记付款' }}
          </button>
        </template>
        <template #fallback><div class="quote-editor-header"><div><h1>{{ pageHeading }}</h1></div></div></template>
      </PageTopbarPortal>

      <OperationPermissionBanner :message="operationPermissionHint" :suffix="operationPermissionSuffix" />

      <section class="order-next-step-strip" :class="isPaid ? 'tone-done' : 'tone-pending'">
        <div><span>下一步</span><strong>{{ nextStepTitle }}</strong></div>
        <p v-if="isPaid">本应付不再需要付款操作；历史资金记录仍完整保留。</p>
        <p v-else-if="isPaymentHeld">先处理质检、发票或对账差异；恢复付款后再登记真实支付。</p>
        <p v-else>按实际支付金额逐笔登记，不要求一次付清；每笔资金都保存日期、方式和凭证号。</p>
      </section>

      <div class="quote-form-grid">
        <div class="quote-main-sections">
          <section class="form-section">
            <div class="section-heading">
              <h2>基本信息</h2>
            </div>

            <dl class="material-fact-grid finance-fact-grid">
              <div><dt>付款公司</dt><dd>{{ payableDraft.company || payableDraft.companyCode || '-' }}</dd></div>
              <div><dt>来源采购发票</dt><dd><RouterLink :to="`/finance/purchase-invoices/${encodeURIComponent(payableDraft.sourceDoc)}`">{{ payableDraft.sourceDoc || '-' }}</RouterLink></dd></div>
              <div><dt>来源采购订单</dt><dd><RouterLink :to="`/purchase/orders/${encodeURIComponent(payableDraft.sourceOrder || '')}`">{{ payableDraft.sourceOrder || '-' }}</RouterLink></dd></div>
              <div><dt>供应商</dt><dd>{{ payableDraft.party }}</dd></div>
              <div><dt>联系人</dt><dd>{{ [payableDraft.contact, payableDraft.contactPhone].filter(Boolean).join(' · ') || '-' }}</dd></div>
              <div><dt>应付日期</dt><dd>{{ payableDraft.date || '-' }}</dd></div>
              <div><dt>到期日期</dt><dd>{{ payableDraft.dueDate || '-' }}</dd></div>
              <div><dt>经办人</dt><dd>{{ payableDraft.owner || '-' }}</dd></div>
              <div><dt>结算方式</dt><dd>{{ payableDraft.paymentMethod || '-' }}</dd></div>
            </dl>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>应付明细</h2>
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
              <h2>付款与未结金额</h2>
            </div>
            <dl class="material-fact-grid finance-money-fact-grid">
              <div><dt>未税金额</dt><dd>{{ payableDraft.amount }}</dd></div>
              <div><dt>税额</dt><dd>{{ payableDraft.taxAmount }}</dd></div>
              <div><dt>应付总额</dt><dd>{{ formatMoney(effectiveTotalAmount) }}</dd></div>
              <div v-if="adjustmentAmount > 0"><dt>售后调减</dt><dd>{{ formatMoney(adjustmentAmount) }}</dd></div>
              <div><dt>已付金额</dt><dd>{{ payableDraft.settledAmount }}</dd></div>
              <div class="finance-balance-fact"><dt>未付金额</dt><dd>{{ formatMoney(remainingAmount) }}</dd></div>
              <div><dt>供应商收款账户</dt><dd>{{ payableDraft.bankAccount || '-' }}</dd></div>
            </dl>
            <div v-if="payableDraft.note" class="document-note-block"><strong>备注</strong><p>{{ payableDraft.note }}</p></div>
          </section>

          <section class="form-section">
            <div class="form-section-head"><h2>付款记录</h2></div>
            <FinanceSettlementHistory direction="付款" :events="payments" />
          </section>
        </div>

        <aside class="quote-summary-panel">
          <section class="summary-section">
            <DocumentStatusPanel
              title="状态与付款"
              :primary-status="payableLifecycleStatus"
              :items="payableStatusPanelItems"
              aria-label="应付账款状态与付款"
            />
          </section>

        </aside>
      </div>
    </section>

    <DocumentLoadState
      v-else
      :loading="isLoading"
      :title="isNew ? '可登记的应付账款' : '应付账款'"
      :message="loadMessage"
      back-path="/finance/payables"
      back-label="返回应付账款"
      @retry="loadPayable"
    />

    <FlowRecordPanel
      :open="showFlowRecords"
      title="应付账款流转记录"
      :records="flowRecords"
      @close="showFlowRecords = false"
    />
    <FinanceSettlementDialog
      :open="settlementDialogOpen"
      direction="付款"
      :record-code="payableDraft?.code || ''"
      :party="payableDraft?.party || ''"
      :total-amount="formatMoney(effectiveTotalAmount)"
      :settled-amount="payableDraft?.settledAmount || '￥0.00'"
      default-method="银行转账"
      :default-account="payableDraft?.bankAccount || ''"
      :busy="isSaving"
      @close="settlementDialogOpen = false"
      @submit="submitPayment"
    />
    <WarehouseActionReasonDialog
      :open="holdDialogOpen"
      :title="isPaymentHeld ? '恢复付款' : '暂缓付款'"
      :record-code="payableDraft?.code || ''"
      record-label="应付账款"
      return-label="返回应付账款"
      :note="isPaymentHeld ? '确认暂缓原因已经处理，并填写恢复付款的说明。' : '付款进度不会被覆盖；系统会单独记录暂缓原因和操作日志。'"
      :reason-label="isPaymentHeld ? '恢复说明' : '暂缓原因'"
      :placeholder="isPaymentHeld ? '例如：质检差异已关闭，对账完成' : '例如：来料质量争议待处理，暂缓支付尾款'"
      :submit-label="isPaymentHeld ? '确认恢复' : '确认暂缓'"
      :pending-label="isPaymentHeld ? '正在恢复' : '正在暂缓'"
      :pending="isStatusSaving"
      :danger="!isPaymentHeld"
      @close="holdDialogOpen = false"
      @submit="submitHoldStatus"
    />
    <div v-if="toastMessage" class="app-toast" :class="{ error: toastTone === 'error' }" :role="toastTone === 'error' ? 'alert' : 'status'" :aria-live="toastTone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">{{ toastMessage }}</div>
  </div>
</template>
