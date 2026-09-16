<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-vue-next';

import type { FinanceSettlementPayload } from '../services/api';
import { useDialogFocus } from '../composables/useDialogFocus';

const props = withDefaults(defineProps<{
  open: boolean;
  direction: '收款' | '付款';
  recordCode: string;
  party: string;
  totalAmount: string;
  settledAmount: string;
  defaultMethod?: string;
  defaultAccount?: string;
  busy?: boolean;
}>(), {
  defaultMethod: '银行转账',
  defaultAccount: '',
  busy: false,
});

const emit = defineEmits<{
  close: [];
  submit: [payload: FinanceSettlementPayload];
}>();

const amount = ref('');
const transactionDate = ref('');
const method = ref('银行转账');
const account = ref('');
const reference = ref('');
const note = ref('');
const idempotencyKey = ref('');
const dialogPanel = ref<HTMLElement | null>(null);
const amountInput = ref<HTMLInputElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialogPanel, amountInput);
const settlementMethods = ['银行转账', '承兑汇票', '支付宝', '微信支付', '现金', '其他'];

const totalValue = computed(() => parseMoney(props.totalAmount));
const settledValue = computed(() => parseMoney(props.settledAmount));
const remainingValue = computed(() => Math.max(0, totalValue.value - settledValue.value));
const amountValue = computed(() => Number(amount.value || 0));
const validationMessage = computed(() => {
  if (!Number.isFinite(amountValue.value) || amountValue.value <= 0) return `请输入本次${props.direction}金额。`;
  if (amountValue.value > remainingValue.value + 0.01) return `本次${props.direction}不能超过未结金额 ${formatMoney(remainingValue.value)}。`;
  if (!transactionDate.value) return `请选择${props.direction}日期。`;
  if (!method.value.trim()) return `请选择${props.direction}方式。`;
  if (!account.value.trim()) return `请填写${props.direction === '收款' ? '收款' : '付款'}账户。`;
  if (!reference.value.trim()) return `请填写银行流水号或${props.direction}凭证号。`;
  return '';
});

function parseMoney(value: string) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
}

function formatMoney(value: number) {
  return `￥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `finance-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resetDraft() {
  amount.value = remainingValue.value ? remainingValue.value.toFixed(2) : '';
  transactionDate.value = today();
  method.value = settlementMethods.includes(props.defaultMethod) ? props.defaultMethod : '银行转账';
  account.value = props.defaultAccount || '';
  reference.value = '';
  note.value = '';
  idempotencyKey.value = createIdempotencyKey();
}

function submit() {
  if (validationMessage.value || props.busy) return;
  emit('submit', {
    amount: amountValue.value,
    transactionDate: transactionDate.value,
    method: method.value.trim(),
    account: account.value.trim(),
    reference: reference.value.trim(),
    note: note.value.trim(),
    idempotencyKey: idempotencyKey.value,
  });
}

watch(() => props.open, (open) => {
  if (open) {
    resetDraft();
    focusDialog();
  } else {
    restoreDialogFocus();
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="finance-settlement-overlay" @mousedown.self="!busy && emit('close')">
      <section
        ref="dialogPanel"
        class="finance-settlement-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="`登记${direction}`"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
        @keydown.esc.stop.prevent="!busy && emit('close')"
      >
        <header>
          <div class="finance-settlement-title">
            <span class="finance-settlement-icon" :class="direction === '收款' ? 'is-receipt' : 'is-payment'">
              <ArrowDownToLine v-if="direction === '收款'" :size="18" />
              <ArrowUpFromLine v-else :size="18" />
            </span>
            <div>
              <h2>登记{{ direction }}</h2>
              <p>{{ recordCode }} · {{ party }}</p>
            </div>
          </div>
          <button type="button" aria-label="关闭登记窗口" :disabled="busy" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <div class="finance-settlement-balance">
          <span><small>应结金额</small><strong>{{ totalAmount }}</strong></span>
          <span><small>已结金额</small><strong>{{ settledAmount }}</strong></span>
          <span class="is-remaining"><small>本次最多可{{ direction }}</small><strong>{{ formatMoney(remainingValue) }}</strong></span>
        </div>

        <form class="finance-settlement-form" @submit.prevent="submit">
          <label class="form-field">
            <span>本次{{ direction }}金额 *</span>
            <div class="finance-money-input"><span>￥</span><input ref="amountInput" v-model="amount" type="number" min="0.01" step="0.01" :max="remainingValue" :disabled="busy" /></div>
          </label>
          <label class="form-field">
            <span>{{ direction }}日期 *</span>
            <input v-model="transactionDate" type="date" :disabled="busy" />
          </label>
          <label class="form-field">
            <span>{{ direction }}方式 *</span>
            <select v-model="method" :disabled="busy">
              <option v-for="option in settlementMethods" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>{{ direction === '收款' ? '收款账户' : '付款账户' }} *</span>
            <input v-model="account" type="text" :placeholder="direction === '收款' ? '选择或填写公司收款账户' : '选择或填写公司付款账户'" :disabled="busy" />
          </label>
          <label class="form-field full-field">
            <span>银行流水号 / {{ direction }}凭证号 *</span>
            <input v-model="reference" type="text" placeholder="用于资金追溯和防止重复登记" :disabled="busy" />
          </label>
          <label class="form-field full-field">
            <span>备注</span>
            <textarea v-model="note" rows="3" :placeholder="`填写${direction}差异、扣款或对账说明`" :disabled="busy"></textarea>
          </label>

          <p v-if="validationMessage" class="finance-settlement-validation">{{ validationMessage }}</p>

          <footer>
            <button class="secondary-action" type="button" :disabled="busy" @click="emit('close')">取消</button>
            <button class="primary-action" type="submit" :disabled="busy || Boolean(validationMessage)">
              {{ busy ? '登记中…' : `确认${direction}` }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.finance-settlement-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(22 27 24 / 42%);
  backdrop-filter: blur(3px);
}

.finance-settlement-dialog {
  width: min(660px, 100%);
  overflow: hidden;
  border: 1px solid #dedfd8;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 68px rgb(26 32 28 / 22%);
}

.finance-settlement-dialog > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #ecece6;
}

.finance-settlement-dialog > header > button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid #e2e2dc;
  border-radius: 9px;
  color: #686d68;
  background: #f8f8f5;
  cursor: pointer;
}

.finance-settlement-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.finance-settlement-title h2,
.finance-settlement-title p {
  margin: 0;
}

.finance-settlement-title h2 { font-size: 18px; }
.finance-settlement-title p { margin-top: 3px; color: #7b817b; font-size: 12px; }

.finance-settlement-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  background: #edf6ef;
  color: #2c6a43;
}

.finance-settlement-icon.is-payment { background: #fff4e8; color: #9a5a13; }

.finance-settlement-balance {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 16px 20px 0;
  overflow: hidden;
  border: 1px solid #e4e6df;
  border-radius: 11px;
  background: #e4e6df;
}

.finance-settlement-balance > span {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  background: #fafaf7;
}

.finance-settlement-balance small { color: #808680; font-size: 11px; }
.finance-settlement-balance strong { color: #222722; font-size: 15px; }
.finance-settlement-balance .is-remaining { background: #f2f7f2; }
.finance-settlement-balance .is-remaining strong { color: #2f6542; }

.finance-settlement-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
  padding: 18px 20px 20px;
}

.finance-money-input { position: relative; }
.finance-money-input > span { position: absolute; top: 50%; left: 12px; color: #697069; transform: translateY(-50%); }
.finance-money-input input { width: 100%; padding-left: 29px; }
.finance-settlement-form textarea { resize: vertical; }

.finance-settlement-validation {
  grid-column: 1 / -1;
  margin: -2px 0 0;
  color: #a44836;
  font-size: 12px;
}

.finance-settlement-form footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 3px;
}

@media (max-width: 640px) {
  .finance-settlement-overlay { align-items: end; padding: 10px; }
  .finance-settlement-dialog { border-radius: 16px 16px 10px 10px; }
  .finance-settlement-balance,
  .finance-settlement-form { grid-template-columns: minmax(0, 1fr); }
  .finance-settlement-balance { gap: 0; }
}
</style>
