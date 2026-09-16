import { computed, ref, type Ref } from 'vue';

export function useAsyncActionState<Action extends string>() {
  const activeAction = ref<Action | ''>('') as Ref<Action | ''>;
  const isActionPending = computed(() => Boolean(activeAction.value));

  async function runAction<Result>(action: Action, task: () => Promise<Result>) {
    if (activeAction.value) return undefined;

    activeAction.value = action;
    try {
      return await task();
    } finally {
      activeAction.value = '';
    }
  }

  return {
    activeAction,
    isActionPending,
    runAction,
  };
}
