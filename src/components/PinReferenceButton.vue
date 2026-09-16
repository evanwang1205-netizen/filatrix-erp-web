<script setup lang="ts">
import { PanelRightOpen } from 'lucide-vue-next';

import { useReferencePanelStore } from '../stores/referencePanel';

const props = defineProps<{
  title: string;
  subtitle?: string;
  path: string;
  compact?: boolean;
  label?: string;
}>();

const referencePanel = useReferencePanelStore();

function openReference() {
  referencePanel.openReference({
    title: props.title,
    subtitle: props.subtitle,
    path: props.path,
  });
}
</script>

<template>
  <button
    class="secondary-action"
    :class="{ 'pin-reference-compact': compact }"
    type="button"
    title="打开悬浮参考窗"
    :aria-label="compact ? '打开参考窗' : undefined"
    aria-controls="reference-side-panel"
    :aria-expanded="referencePanel.open"
    @click="openReference"
  >
    <PanelRightOpen :size="15" />
    <span v-if="!compact">{{ label || '悬浮' }}</span>
  </button>
</template>
