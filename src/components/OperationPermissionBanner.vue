<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    message?: string;
    suffix?: string;
    title?: string;
  }>(),
  {
    message: '',
    suffix: '',
    title: '\u64cd\u4f5c\u6743\u9650\u53d7\u9650',
  },
);
</script>

<template>
  <div v-if="props.message" class="operation-permission-banner">
    <strong>{{ props.title }}</strong>
    <span>{{ props.message }} {{ props.suffix }}</span>
  </div>
</template>
