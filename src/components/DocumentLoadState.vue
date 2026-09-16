<script setup lang="ts">
import { computed } from 'vue';
import { LoaderCircle, RefreshCw } from 'lucide-vue-next';

const props = defineProps<{
  loading: boolean;
  title: string;
  message?: string;
  backPath: string;
  backLabel: string;
  state?: 'not-found' | 'error';
}>();

defineEmits<{
  retry: [];
}>();

const resolvedState = computed<'not-found' | 'error'>(() => {
  if (props.state) return props.state;
  if (!props.message) return 'not-found';
  return /不存在|没有找到|已删除|链接.*失效|缺少.*单号/.test(props.message) ? 'not-found' : 'error';
});

const heading = computed(() => {
  if (props.loading) return `正在加载${props.title}`;
  return resolvedState.value === 'error' ? `${props.title}加载失败` : `没有找到${props.title}`;
});

const description = computed(() => {
  if (props.loading) return '正在读取最新单据信息，请稍候。';
  if (props.message) return props.message;
  return resolvedState.value === 'error'
    ? '暂时无法读取最新单据信息，请重试。'
    : '该单据可能不存在、已删除，或当前链接已失效。';
});
</script>

<template>
  <section
    class="form-section quote-empty-state document-load-state"
    :class="{ 'is-load-error': !loading && resolvedState === 'error' }"
    :aria-busy="loading"
  >
    <div class="document-load-state-heading">
      <LoaderCircle v-if="loading" class="document-load-spinner" :size="20" aria-hidden="true" />
      <h1>{{ heading }}</h1>
    </div>
    <p class="section-hint">{{ description }}</p>
    <div class="document-load-state-actions">
      <button v-if="!loading && (message || resolvedState === 'error')" class="secondary-action" type="button" :title="`重新加载${title}`" @click="$emit('retry')">
        <RefreshCw :size="15" />
        重试
      </button>
      <RouterLink class="primary-action" :to="backPath" :title="backLabel">{{ backLabel }}</RouterLink>
    </div>
  </section>
</template>
