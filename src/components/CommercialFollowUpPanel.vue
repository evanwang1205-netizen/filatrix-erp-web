<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FileText, Plus, Trash2, WalletCards, X } from 'lucide-vue-next';

import type { CommercialFollowUpPayload } from '../services/api';
import type { CommercialFollowUpEvent, CommercialFollowUpKind } from '../types/business';

const props = withDefaults(defineProps<{
  module: 'sales' | 'purchase';
  events: CommercialFollowUpEvent[];
  totalAmount: number;
  canWrite?: boolean;
  disabledReason?: string;
  busy?: boolean;
}>(), {
  canWrite: true,
  disabledReason: '',
  busy: false,
});

const emit = defineEmits<{
  submit: [payload: CommercialFollowUpPayload];
  remove: [event: CommercialFollowUpEvent];
}>();

const activeKind = ref<CommercialFollowUpKind | null>(null);
const amount = ref('');
const occurredOn = ref('');
const note = ref('');
const idempotencyKey = ref('');
const pendingRemoval = ref<CommercialFollowUpEvent | null>(null);
const pendingSubmission = ref<{
  kind: CommercialFollowUpKind;
  previousCount: number;
} | null>(null);

const labels = computed(() => props.module === 'sales'
  ? {
      invoiceKind: 'sales_invoice' as const,
      paymentKind: 'sales_payment' as const,
      invoiceAction: '登记开票',
      paymentAction: '登记回款',
      invoiceLabel: '开票',
      paymentLabel: '回款',
      invoiceGroup: '开票记录',
      paymentGroup: '回款记录',
    }
  : {
      invoiceKind: 'purchase_invoice' as const,
      paymentKind: 'purchase_payment' as const,
      invoiceAction: '登记收票',
      paymentAction: '登记付款',
      invoiceLabel: '收票',
      paymentLabel: '付款',
      invoiceGroup: '收票记录',
      paymentGroup: '付款记录',
    });

const groups = computed(() => [
  {
    kind: labels.value.invoiceKind,
    title: labels.value.invoiceGroup,
    action: labels.value.invoiceAction,
    icon: FileText,
  },
  {
    kind: labels.value.paymentKind,
    title: labels.value.paymentGroup,
    action: labels.value.paymentAction,
    icon: WalletCards,
  },
]);
const kindLabel = computed(() => activeKind.value === labels.value.invoiceKind
  ? labels.value.invoiceLabel
  : labels.value.paymentLabel);
const recordedAmount = computed(() => props.events
  .filter((event) => event.kind === activeKind.value)
  .reduce((sum, event) => sum + Number(event.amount || 0), 0));
const remainingAmount = computed(() => Math.max(0, Number(props.totalAmount || 0) - recordedAmount.value));
const amountValue = computed(() => Number(amount.value || 0));
const validationMessage = computed(() => {
  if (!activeKind.value) return '';
  if (!Number.isFinite(amountValue.value) || amountValue.value <= 0) return '请输入本次金额。';
  if (amountValue.value > remainingAmount.value + 0.01) {
    return `本次金额不能超过订单剩余 ${formatMoney(remainingAmount.value)}。`;
  }
  if (!occurredOn.value) return '请选择业务日期。';
  if (occurredOn.value > today()) return '业务日期不能晚于今天。';
  return '';
});

function today() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `commercial-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMoney(value: number) {
  return `￥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function eventLabel(event: CommercialFollowUpEvent) {
  return event.kind === labels.value.invoiceKind ? labels.value.invoiceLabel : labels.value.paymentLabel;
}

function eventsForKind(kind: CommercialFollowUpKind) {
  return props.events.filter((event) => event.kind === kind);
}

function recordedForKind(kind: CommercialFollowUpKind) {
  return eventsForKind(kind).reduce((sum, event) => sum + Number(event.amount || 0), 0);
}

function remainingForKind(kind: CommercialFollowUpKind) {
  return Math.max(0, Number(props.totalAmount || 0) - recordedForKind(kind));
}

function progressForKind(kind: CommercialFollowUpKind) {
  const total = Number(props.totalAmount || 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((recordedForKind(kind) / total) * 100));
}

function progressLabel(kind: CommercialFollowUpKind) {
  const progress = progressForKind(kind);
  if (progress >= 100) return '已完成';
  if (progress > 0) return '进行中';
  return '未开始';
}

function openForm(kind: CommercialFollowUpKind) {
  if (!props.canWrite || props.busy) return;
  activeKind.value = kind;
  amount.value = Math.max(
    0,
    Number(props.totalAmount || 0)
      - props.events.filter((event) => event.kind === kind).reduce((sum, event) => sum + Number(event.amount || 0), 0),
  ).toFixed(2);
  occurredOn.value = today();
  note.value = '';
  idempotencyKey.value = createIdempotencyKey();
}

function closeForm() {
  if (props.busy) return;
  activeKind.value = null;
  pendingSubmission.value = null;
}

function submit() {
  if (!activeKind.value || validationMessage.value || props.busy) return;
  const kind = activeKind.value;
  pendingSubmission.value = {
    kind,
    previousCount: eventsForKind(kind).length,
  };
  emit('submit', {
    kind,
    amount: amountValue.value,
    occurredOn: occurredOn.value,
    note: note.value.trim(),
    idempotencyKey: idempotencyKey.value,
  });
}

function removeEvent(event: CommercialFollowUpEvent) {
  if (!props.canWrite || props.busy || event.source === 'legacy') return;
  pendingRemoval.value = event;
}

function cancelRemoveEvent() {
  if (props.busy) return;
  pendingRemoval.value = null;
}

function confirmRemoveEvent() {
  if (!pendingRemoval.value || props.busy) return;
  const event = pendingRemoval.value;
  pendingRemoval.value = null;
  emit('remove', event);
}

watch(() => props.events, () => {
  const pending = pendingSubmission.value;
  if (pending && eventsForKind(pending.kind).length > pending.previousCount) {
    activeKind.value = null;
    amount.value = '';
    occurredOn.value = '';
    note.value = '';
    idempotencyKey.value = '';
    pendingSubmission.value = null;
    return;
  }
  if (activeKind.value && remainingAmount.value <= 0.01) activeKind.value = null;
}, { deep: true });

watch(() => props.busy, (busy, wasBusy) => {
  if (!busy && wasBusy && pendingSubmission.value) {
    const pending = pendingSubmission.value;
    if (eventsForKind(pending.kind).length <= pending.previousCount) pendingSubmission.value = null;
  }
});
</script>

<template>
  <div class="commercial-follow-up">
    <p class="commercial-follow-up-note">仅作为销售、采购自己的进度记录，不生成会计凭证。</p>

    <div class="commercial-follow-up-groups">
      <section v-for="group in groups" :key="group.kind" class="commercial-follow-up-group">
        <header class="commercial-follow-up-group-head">
          <div class="commercial-follow-up-group-title">
            <span><component :is="group.icon" :size="16" /></span>
            <div>
              <strong>{{ group.title }}</strong>
              <small>{{ eventsForKind(group.kind).length }} 条登记</small>
            </div>
          </div>
          <i :class="{ 'is-complete': progressForKind(group.kind) >= 100 }">{{ progressLabel(group.kind) }}</i>
        </header>

        <div class="commercial-follow-up-summary">
          <span>累计 <b>{{ formatMoney(recordedForKind(group.kind)) }}</b></span>
          <span>待登记 <b>{{ formatMoney(remainingForKind(group.kind)) }}</b></span>
        </div>
        <div class="commercial-follow-up-progress" aria-hidden="true">
          <span :style="{ width: `${progressForKind(group.kind)}%` }"></span>
        </div>

        <button
          class="secondary-action commercial-follow-up-add"
          type="button"
          :disabled="busy || !canWrite"
          :title="!canWrite ? disabledReason : group.action"
          @click="openForm(group.kind)"
        >
          <Plus :size="14" />
          {{ group.action }}
        </button>

        <form
          v-if="activeKind === group.kind"
          class="commercial-follow-up-form"
          @submit.prevent="submit"
        >
          <header>
            <div>
              <strong>{{ group.action }}</strong>
              <span>剩余 {{ formatMoney(remainingAmount) }}</span>
            </div>
            <button type="button" aria-label="关闭登记表单" :disabled="busy" @click="closeForm"><X :size="16" /></button>
          </header>
          <div class="commercial-follow-up-fields">
            <label>
              <span>本次{{ kindLabel }}金额 *</span>
              <input v-model="amount" type="number" min="0.01" step="0.01" :max="remainingAmount" :disabled="busy" />
            </label>
            <label>
              <span>{{ kindLabel }}日期 *</span>
              <input v-model="occurredOn" type="date" :max="today()" :disabled="busy" />
            </label>
            <label class="is-wide">
              <span>备注</span>
              <textarea v-model="note" rows="2" :disabled="busy" placeholder="填写本次登记说明，可留空"></textarea>
            </label>
          </div>
          <p v-if="validationMessage" class="commercial-follow-up-error">{{ validationMessage }}</p>
          <footer>
            <button class="secondary-action" type="button" :disabled="busy" @click="closeForm">取消</button>
            <button class="primary-action" type="submit" :disabled="busy || Boolean(validationMessage)">
              {{ busy ? '登记中…' : `确认${kindLabel}` }}
            </button>
          </footer>
        </form>

        <div v-if="eventsForKind(group.kind).length" class="commercial-follow-up-list">
          <article v-for="event in eventsForKind(group.kind)" :key="event.id">
            <div class="commercial-follow-up-record-main">
              <time>{{ event.occurredOn || '日期未记录' }}</time>
              <b>{{ formatMoney(event.amount) }}</b>
              <button
                v-if="event.source !== 'legacy'"
                class="commercial-follow-up-delete"
                type="button"
                :disabled="busy || !canWrite"
                :title="!canWrite ? disabledReason : `删除${eventLabel(event)}登记`"
                :aria-label="`删除${eventLabel(event)}登记`"
                @click="removeEvent(event)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <p v-if="event.note && event.note !== '由历史演示数据迁移'">{{ event.note }}</p>
            <small>{{ event.actor || '—' }}<template v-if="event.source === 'legacy'"> · 历史迁移记录</template></small>
          </article>
        </div>
        <div v-else class="commercial-follow-up-empty">暂无{{ group.title }}。</div>
      </section>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="pendingRemoval" class="commercial-follow-up-confirm-backdrop" @click.self="cancelRemoveEvent">
      <section
        class="commercial-follow-up-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commercial-follow-up-confirm-title"
      >
        <span class="commercial-follow-up-confirm-icon"><Trash2 :size="18" /></span>
        <div>
          <h3 id="commercial-follow-up-confirm-title">删除{{ eventLabel(pendingRemoval) }}登记</h3>
          <p>
            确认删除 {{ pendingRemoval.occurredOn || '未记录日期' }} 的
            {{ formatMoney(pendingRemoval.amount) }} 登记吗？删除后进度和累计金额会自动重算。
          </p>
        </div>
        <footer>
          <button class="secondary-action" type="button" :disabled="busy" @click="cancelRemoveEvent">取消</button>
          <button class="danger-action" type="button" :disabled="busy" @click="confirmRemoveEvent">
            {{ busy ? '删除中…' : '确认删除' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.commercial-follow-up { display: grid; gap: 10px; }
.commercial-follow-up-note {
  margin: 0;
  color: #777d77;
  font-size: 12px;
  line-height: 1.5;
}
.commercial-follow-up-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.commercial-follow-up-group {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  padding: 13px;
  border: 1px solid #e0e4dd;
  border-radius: 11px;
  background: #fafbf8;
}
.commercial-follow-up-group-head,
.commercial-follow-up-group-title,
.commercial-follow-up-form > header,
.commercial-follow-up-form > header > div,
.commercial-follow-up-form > footer {
  display: flex;
  align-items: center;
}
.commercial-follow-up-group-head { justify-content: space-between; gap: 10px; }
.commercial-follow-up-group-title { min-width: 0; gap: 9px; }
.commercial-follow-up-group-title > span {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border-radius: 9px;
  color: #42624d;
  background: #eaf1eb;
}
.commercial-follow-up-group-title > div { display: grid; gap: 1px; min-width: 0; }
.commercial-follow-up-group-title strong { color: #292e2a; font-size: 13px; }
.commercial-follow-up-group-title small { color: #838883; font-size: 10px; }
.commercial-follow-up-group-head > i {
  padding: 3px 7px;
  border-radius: 999px;
  color: #7a715f;
  background: #f2eee5;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
.commercial-follow-up-group-head > i.is-complete { color: #3d624a; background: #e6f0e8; }
.commercial-follow-up-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.commercial-follow-up-summary span {
  display: grid;
  gap: 2px;
  color: #7a807a;
  font-size: 10px;
}
.commercial-follow-up-summary b { color: #303530; font-size: 13px; }
.commercial-follow-up-progress {
  overflow: hidden;
  height: 4px;
  border-radius: 999px;
  background: #e8ebe5;
}
.commercial-follow-up-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #688773;
}
.commercial-follow-up-add {
  width: 100%;
  min-height: 32px;
  justify-content: center;
}
.commercial-follow-up-form > footer { gap: 8px; }
.commercial-follow-up-form footer button { min-height: 34px; }
.commercial-follow-up-form {
  padding: 12px;
  border: 1px solid #dfe4dc;
  border-radius: 9px;
  background: #fff;
}
.commercial-follow-up-form > header { justify-content: space-between; margin-bottom: 10px; }
.commercial-follow-up-form > header > div { align-items: baseline; gap: 10px; }
.commercial-follow-up-form > header span { color: #747a74; font-size: 12px; }
.commercial-follow-up-form > header > button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: #696f69;
  background: transparent;
  cursor: pointer;
}
.commercial-follow-up-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.commercial-follow-up-fields label { display: grid; gap: 6px; min-width: 0; color: #59605a; font-size: 12px; }
.commercial-follow-up-fields .is-wide { grid-column: 1 / -1; }
.commercial-follow-up-fields input,
.commercial-follow-up-fields textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9ddd6;
  border-radius: 9px;
  color: #232724;
  background: #fff;
}
.commercial-follow-up-fields input { height: 38px; padding: 0 10px; }
.commercial-follow-up-fields textarea { resize: vertical; padding: 9px 10px; }
.commercial-follow-up-fields small { color: #747a74; }
.commercial-follow-up-error { margin: 10px 0 0; color: #a33d35; font-size: 12px; }
.commercial-follow-up-form > footer { justify-content: flex-end; margin-top: 12px; }
.commercial-follow-up-list {
  display: grid;
  overflow: hidden;
  border: 1px solid #e3e6df;
  border-radius: 9px;
  background: #fff;
}
.commercial-follow-up-list article {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 9px;
}
.commercial-follow-up-list article + article { border-top: 1px solid #eceee9; }
.commercial-follow-up-record-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
}
.commercial-follow-up-record-main time { color: #535a54; font-size: 11px; }
.commercial-follow-up-list small { color: #818681; font-size: 11px; }
.commercial-follow-up-list p {
  display: -webkit-box;
  overflow: hidden;
  margin: 1px 0 0;
  color: #5f655f;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.commercial-follow-up-list b { color: #242824; font-size: 12px; white-space: nowrap; }
.commercial-follow-up-delete {
  display: grid;
  width: 25px;
  height: 25px;
  padding: 0;
  place-items: center;
  border: 1px solid #e1e4de;
  border-radius: 7px;
  color: #8c4943;
  background: #fff;
  cursor: pointer;
}
.commercial-follow-up-delete:hover:not(:disabled) { border-color: #d6b7b3; background: #fff7f6; }
.commercial-follow-up-delete:disabled { cursor: not-allowed; opacity: .5; }
.commercial-follow-up-empty {
  padding: 10px;
  border: 1px dashed #dfe2db;
  border-radius: 8px;
  color: #818681;
  text-align: center;
  font-size: 11px;
}
.commercial-follow-up-confirm-backdrop {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  background: rgba(24, 28, 25, .34);
  backdrop-filter: blur(2px);
}
.commercial-follow-up-confirm {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  width: min(420px, 100%);
  box-sizing: border-box;
  padding: 20px;
  border: 1px solid #e2ded8;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(28, 34, 29, .18);
}
.commercial-follow-up-confirm-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  color: #994b43;
  background: #f8ebe9;
}
.commercial-follow-up-confirm h3 {
  margin: 1px 0 6px;
  color: #272c28;
  font-size: 16px;
}
.commercial-follow-up-confirm p {
  margin: 0;
  color: #656b65;
  font-size: 13px;
  line-height: 1.65;
}
.commercial-follow-up-confirm footer {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.commercial-follow-up-confirm footer button {
  min-width: 88px;
  min-height: 36px;
}
@media (max-width: 920px) {
  .commercial-follow-up-groups { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .commercial-follow-up-fields { grid-template-columns: minmax(0, 1fr); }
  .commercial-follow-up-fields .is-wide { grid-column: auto; }
}
</style>
