<script setup lang="ts">
import { onMounted } from 'vue';

import { useAutoFormLabels } from './composables/useAutoFormLabels';
import { useSessionStore } from './stores/session';

useAutoFormLabels();

const session = useSessionStore();

onMounted(() => {
  void session.loadUserFromAccounts();
});
</script>

<template>
  <RouterView />
</template>
