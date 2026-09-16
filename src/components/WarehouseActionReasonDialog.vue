<script setup lang="ts">
import { ref, watch } from 'vue';
import { ClipboardPenLine, X } from 'lucide-vue-next';
import { useDialogFocus } from '../composables/useDialogFocus';

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  recordCode: string;
  recordLabel?: string;
  returnLabel?: string;
  note: string;
  reasonLabel: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  pending?: boolean;
  danger?: boolean;
}>(), {
  recordLabel: '盘点单',
  returnLabel: '返回盘点单',
});

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

function submitReason() {
  const cleanReason = reason.value.trim();
  if (!cleanReason) {
    errorText.value = `请填写${props.reasonLabel}`;
    return;
  }
  emit('submit', cleanReason);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="exception-action-backdrop warehouse-reversal-backdrop" @click.self="!pending && emit('close')">
      <section
        ref="dialogPanel"
        class="exception-action-dialog warehouse-reversal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-action-reason-title"
        tabindex="-1"
        @keydown.tab="handleDialogTab"
        @keydown.esc.stop.prevent="!pending && emit('close')"
      >
        <header class="exception-action-head warehouse-reversal-head">
          <div>
            <ClipboardPenLine :size="18" />
            <h2 id="warehouse-action-reason-title">{{ title }}</h2>
          </div>
          <button type="button" :disabled="pending" aria-label="关闭原因填写" title="关闭" @click="emit('close')">
            <X :size="17" />
          </button>
        </header>

        <div class="exception-action-body">
          <div class="exception-record-line">
            <span>{{ recordLabel }}</span>
            <strong>{{ recordCode }}</strong>
          </div>
          <p class="warehouse-reversal-note">{{ note }}</p>
          <label class="exception-field">
            <span>{{ reasonLabel }}</span>
            <textarea
              ref="reasonInput"
              v-model="reason"
              rows="4"
              :disabled="pending"
              :placeholder="placeholder"
              :title="`填写${reasonLabel}`"
              @input="errorText = ''"
            ></textarea>
          </label>
          <p v-if="errorText" class="exception-action-error" role="alert">{{ errorText }}</p>
        </div>

        <footer class="exception-action-footer">
          <button class="secondary-action" type="button" :disabled="pending" :title="returnLabel" @click="emit('close')">返回</button>
          <button
            class="async-document-action"
            :class="danger ? 'secondary-action danger-action' : 'primary-action'"
            type="button"
            :disabled="pending"
            :aria-busy="pending"
            :title="submitLabel"
            @click="submitReason"
          >
            {{ pending ? pendingLabel : submitLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
