<script setup lang="ts">
import { LoaderCircle, RefreshCw } from 'lucide-vue-next';

defineProps<{
  loading: boolean;
  title: string;
  loadingMessage?: string;
  message?: string;
}>();

defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="list-empty-state list-load-state" :aria-busy="loading">
    <LoaderCircle v-if="loading" class="document-load-spinner" :size="20" aria-hidden="true" />
    <strong>{{ loading ? `正在加载${title}` : `${title}加载失败` }}</strong>
    <span>{{ loading ? loadingMessage || '正在读取最新列表数据，请稍候。' : message || '列表数据暂时无法读取，请稍后重试。' }}</span>
    <button v-if="!loading" class="secondary-action empty-state-action" type="button" :title="`重新加载${title}`" @click="$emit('retry')">
      <RefreshCw :size="15" />
      重试
    </button>
  </div>
</template>
