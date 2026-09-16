<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const slots = useSlots();
const useApplicationTopbar = computed(() => route.query.referencePanel !== '1');
</script>

<template>
  <template v-if="useApplicationTopbar">
    <Teleport v-if="slots.context" defer to="#topbar-page-context">
      <div class="topbar-context-content">
        <slot name="context" />
      </div>
    </Teleport>
    <Teleport v-if="slots.actions" defer to="#topbar-page-actions">
      <div class="topbar-actions-content">
        <slot name="actions" />
      </div>
    </Teleport>
  </template>
  <slot v-else name="fallback" />
</template>
