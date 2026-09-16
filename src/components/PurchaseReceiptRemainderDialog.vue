<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X, XCircle } from 'lucide-vue-next';

import { useDialogFocus } from '../composables/useDialogFocus';

type RemainderLine = {
  lineId: string;
  materialCode: string;
  name: string;
  remainingQty: number;
  uom: string;
};

const props = withDefaults(defineProps<{
  open: boolean;
  recordCode: string;
  lines: RemainderLine[];
  business?: 'purchase' | 'sales';
  busy?: boolean;
}>(), {
  business: 'purchase',
  busy: false,
});

const emit = defineEmits<{
  close: [];
  submit: [reason: string];
}>();

const reason = ref('');
const attempted = ref(false);
const dialogPanel = ref<HTMLElement | null>(null);
const reasonInput = ref<HTMLTextAreaElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialogPanel, reasonInput);

const activeLines = computed(() => props.lines.filter((line) => Number(line.remainingQty || 0) > 0.0001));
const isSales = computed(() => props.business === 'sales');
const dialogLabel = computed(() => (isSales.value ? '关闭销售待发余量' : '关闭采购待收余量'));
const dialogTitle = computed(() => (isSales.value ? '关闭待发余量' : '关闭待收余量'));
const dialogSubtitle = computed(() => (
  isSales.value ? '由销售决定客户剩余数量不再交付' : '由采购决定供应商无需继续交付'
));
const resultTitle = computed(() => (
  isSales.value ? '关闭后不会再生成对应仓库待拣货任务。' : '关闭后不会再生成对应仓库待收货任务。'
));
const resultDescription = computed(() => (
  isSales.value
    ? '已出库、库存流水和签收记录保持不变；未开始的出库任务会取消，剩余预留会释放。'
    : '已收货、质检、入库和异常记录保持不变；本操作不等于关闭整张采购订单。'
));
const reasonPlaceholder = computed(() => (
  isSales.value
    ? '例如：客户取消剩余数量，双方确认按实发完成'
    : '例如：供应商确认本批不再补交，采购接受本次短收'
));
const validationMessage = computed(() => (
  reason.value.trim().length < 4 ? '请填写至少 4 个字的关闭原因。' : ''
));

function quantityText(value: number, unit: string) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unit}`;
}

function submit() {
  attempted.value = true;
  if (props.busy || validationMessage.value) return;
  emit('submit', reason.value.trim());
}

watch(() => props.open, (open) => {
  if (open) {
    reason.value = '';
    attempted.value = false;
    focusDialog();
  } else {
    restoreDialogFocus();
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="business-dialog-overlay" @mousedown.self="!busy && emit('close')">
      <section
        ref="dialogPanel"
        class="business-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogLabel"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
        @keydown.esc.stop.prevent="!busy && emit('close')"
      >
        <header>
          <div class="business-dialog-title">
            <span><XCircle :size="18" /></span>
            <div>
              <h2>{{ dialogTitle }}</h2>
              <p>{{ recordCode }} · {{ dialogSubtitle }}</p>
            </div>
          </div>
          <button type="button" aria-label="关闭对话框" title="关闭对话框" :disabled="busy" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <form @submit.prevent="submit">
          <div class="remainder-dialog-note">
            <strong>{{ resultTitle }}</strong>
            <p>{{ resultDescription }}</p>
          </div>

          <div class="remainder-dialog-lines">
            <div v-for="line in activeLines" :key="line.lineId">
              <span>
                <strong>{{ line.name }}</strong>
                <small>{{ line.materialCode || line.lineId }}</small>
              </span>
              <b>{{ quantityText(line.remainingQty, line.uom) }}</b>
            </div>
          </div>

          <label class="form-field">
            <span>关闭原因 *</span>
            <textarea
              ref="reasonInput"
              v-model="reason"
              rows="4"
              :placeholder="reasonPlaceholder"
              :disabled="busy"
            ></textarea>
          </label>
          <p v-if="attempted && validationMessage" class="business-dialog-validation" role="alert">{{ validationMessage }}</p>

          <footer>
            <button class="secondary-action" type="button" :title="isSales ? '保留待发余量' : '保留待收余量'" :disabled="busy" @click="emit('close')">取消</button>
            <button class="primary-action" type="submit" :title="isSales ? '关闭以上待发余量' : '关闭以上待收余量'" :disabled="busy">
              {{ busy ? '提交中…' : '确认关闭余量' }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.business-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(22 27 24 / 42%);
  backdrop-filter: blur(3px);
}

.business-dialog {
  width: min(560px, 100%);
  overflow: hidden;
  border: 1px solid #dedfd8;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 68px rgb(26 32 28 / 22%);
}

.business-dialog > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #ecece6;
}

.business-dialog > header > button {
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

.business-dialog button:disabled { cursor: not-allowed; opacity: .56; }

.business-dialog-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.business-dialog-title > span {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
  color: #9a4938;
  background: #faefec;
}

.business-dialog-title h2,
.business-dialog-title p { margin: 0; }
.business-dialog-title h2 { color: #252a26; font-size: 18px; }
.business-dialog-title p { margin-top: 3px; color: #7b817b; font-size: 12px; }

.business-dialog form {
  display: grid;
  gap: 14px;
  padding: 18px 20px 20px;
}

.remainder-dialog-note {
  padding: 12px 14px;
  border: 1px solid #eaded7;
  border-radius: 11px;
  background: #fcf8f5;
}

.remainder-dialog-note strong { color: #633b30; font-size: 13px; }
.remainder-dialog-note p { margin: 4px 0 0; color: #7d736c; font-size: 12px; line-height: 1.6; }

.remainder-dialog-lines {
  overflow: hidden;
  border: 1px solid #e5e6df;
  border-radius: 11px;
}

.remainder-dialog-lines > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 12px;
}

.remainder-dialog-lines > div + div { border-top: 1px solid #ecece6; }
.remainder-dialog-lines span { display: grid; gap: 2px; }
.remainder-dialog-lines strong { color: #303530; font-size: 13px; }
.remainder-dialog-lines small { color: #878b84; font-size: 11px; }
.remainder-dialog-lines b { flex: 0 0 auto; color: #724333; font-size: 13px; }
.business-dialog textarea { resize: vertical; }
.business-dialog-validation { margin: -4px 0 0; color: #a44836; font-size: 12px; }

.business-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

@media (max-width: 640px) {
  .business-dialog-overlay { align-items: end; padding: 10px; }
  .business-dialog { border-radius: 16px 16px 10px 10px; }
}
</style>
