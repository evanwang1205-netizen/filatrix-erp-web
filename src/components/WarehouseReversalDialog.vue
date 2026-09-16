<script setup lang="ts">
import { ref, watch } from 'vue';
import { RotateCcw, X } from 'lucide-vue-next';
import { useDialogFocus } from '../composables/useDialogFocus';

const props = defineProps<{
  open: boolean;
  title: string;
  recordCode: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [reason: string];
}>();

const reason = ref('');
const errorText = ref('');
const dialogPanel = ref<HTMLElement | null>(null);
const reasonInput = ref<HTMLTextAreaElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialogPanel, reasonInput);

watch(
  () => props.open,
  (open) => {
    if (open) {
      reason.value = '';
      errorText.value = '';
      focusDialog();
    } else {
      restoreDialogFocus();
    }
  },
);

function submitReversal() {
  const cleanReason = reason.value.trim();
  if (!cleanReason) {
    errorText.value = '请填写冲销原因';
    return;
  }
  emit('submit', cleanReason);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="exception-action-backdrop warehouse-reversal-backdrop"
      @click.self="!pending && emit('close')"
    >
      <section
        ref="dialogPanel"
        class="exception-action-dialog warehouse-reversal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-reversal-title"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
        @keydown.esc.stop.prevent="!pending && emit('close')"
      >
        <header class="exception-action-head warehouse-reversal-head">
          <div>
            <RotateCcw :size="18" />
            <h2 id="warehouse-reversal-title">{{ title }}</h2>
          </div>
          <button type="button" :disabled="pending" aria-label="关闭库存冲销" title="关闭" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <div class="exception-action-body">
          <div class="exception-record-line">
            <span>原单</span>
            <strong>{{ recordCode }}</strong>
          </div>

          <p class="warehouse-reversal-note">
            系统会新增一条冲销记录和反向库存流水，原单、原状态及原流水不会被删除或改写。若库存已被后续单据占用，系统会阻止冲销。
          </p>

          <label class="exception-field">
            <span>冲销原因</span>
            <textarea
              ref="reasonInput"
              v-model="reason"
              rows="4"
              :disabled="pending"
              placeholder="例如：仓库误选批次，需撤销本次库存影响后重新办理。"
              title="填写库存冲销原因"
              @input="errorText = ''"
            ></textarea>
          </label>

          <p v-if="errorText" class="exception-action-error" role="alert">{{ errorText }}</p>
        </div>

        <footer class="exception-action-footer">
          <button class="secondary-action" type="button" :disabled="pending" title="取消库存冲销" @click="emit('close')">取消</button>
          <button class="primary-action async-document-action" type="button" :disabled="pending" :aria-busy="pending" title="生成冲销记录和反向库存流水" @click="submitReversal">
            {{ pending ? '冲销中' : '确认冲销' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
