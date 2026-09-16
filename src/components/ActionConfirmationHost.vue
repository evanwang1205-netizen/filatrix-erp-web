<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { AlertTriangle, Trash2 } from 'lucide-vue-next';

import { useActionConfirmationHost } from '../composables/useActionConfirmation';
import { useDialogFocus } from '../composables/useDialogFocus';

const { pendingRequest, confirmAction, cancelAction } = useActionConfirmationHost();
const dialogPanel = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const { focusDialog, restoreDialogFocus, handleDialogTab } = useDialogFocus(dialogPanel, cancelButton);

watch(pendingRequest, (request) => {
  if (request) {
    focusDialog();
    return;
  }
  restoreDialogFocus();
});

onBeforeUnmount(cancelAction);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pendingRequest"
      class="action-confirmation-backdrop"
      @click.self="cancelAction"
    >
      <section
        ref="dialogPanel"
        class="action-confirmation-dialog"
        :class="`tone-${pendingRequest.tone}`"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-confirmation-title"
        aria-describedby="action-confirmation-message"
        tabindex="-1"
        @keydown.esc.stop="cancelAction"
        @keydown.tab="handleDialogTab"
      >
        <span class="action-confirmation-icon" aria-hidden="true">
          <Trash2 v-if="pendingRequest.tone === 'danger'" :size="20" />
          <AlertTriangle v-else :size="20" />
        </span>
        <div class="action-confirmation-copy">
          <h2 id="action-confirmation-title">{{ pendingRequest.title }}</h2>
          <p id="action-confirmation-message">{{ pendingRequest.message }}</p>
        </div>
        <footer>
          <button
            ref="cancelButton"
            class="secondary-action"
            type="button"
            @click="cancelAction"
          >
            {{ pendingRequest.cancelLabel }}
          </button>
          <button
            :class="pendingRequest.tone === 'danger' ? 'danger-action' : 'primary-action'"
            type="button"
            @click="confirmAction"
          >
            {{ pendingRequest.confirmLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.action-confirmation-backdrop {
  position: fixed;
  z-index: 2200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(18 22 19 / 38%);
  backdrop-filter: blur(2px);
}

.action-confirmation-dialog {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  width: min(460px, 100%);
  padding: 20px;
  border: 1px solid #dfe3dc;
  border-radius: 15px;
  color: #252a26;
  background: #fff;
  box-shadow: 0 24px 70px rgb(27 35 29 / 22%);
}

.action-confirmation-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  color: #806223;
  background: #f5eedc;
}

.tone-danger .action-confirmation-icon {
  color: #9a3f36;
  background: #f7e7e4;
}

.action-confirmation-copy {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.action-confirmation-copy h2,
.action-confirmation-copy p {
  margin: 0;
}

.action-confirmation-copy h2 {
  font-size: 16px;
  line-height: 1.35;
}

.action-confirmation-copy p {
  color: #697069;
  font-size: 13px;
  line-height: 1.65;
}

.action-confirmation-dialog footer {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 9px;
  padding-top: 4px;
}

.action-confirmation-dialog footer button {
  min-width: 92px;
}

@media (max-width: 520px) {
  .action-confirmation-backdrop {
    align-items: end;
    padding: 12px;
  }

  .action-confirmation-dialog {
    padding: 17px;
    border-radius: 14px;
  }

  .action-confirmation-dialog footer button {
    flex: 1;
  }
}
</style>
