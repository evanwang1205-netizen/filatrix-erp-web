import { onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

import { requestActionConfirmation } from './useActionConfirmation';

type UnsavedChangesGuardOptions = {
  enabled?: MaybeRefOrGetter<boolean>;
  ready?: MaybeRefOrGetter<boolean>;
  message?: string;
};

function serializeDraft(value: unknown) {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

export function useUnsavedChangesGuard(
  source: MaybeRefOrGetter<unknown>,
  options: UnsavedChangesGuardOptions = {},
) {
  const isDirty = ref(false);
  const message = options.message ?? '当前页面有未保存的修改，确定离开吗？';
  let baseline = '';
  let armed = false;

  function enabled() {
    return options.enabled === undefined || Boolean(toValue(options.enabled));
  }

  function ready() {
    return options.ready === undefined || Boolean(toValue(options.ready));
  }

  function currentSnapshot() {
    return serializeDraft(toValue(source));
  }

  function resetUnsavedChanges() {
    baseline = currentSnapshot();
    armed = enabled() && ready();
    isDirty.value = false;
  }

  watch(
    () => [currentSnapshot(), enabled(), ready()] as const,
    ([snapshot, canTrack, isReady]) => {
      if (!canTrack || !isReady) {
        baseline = snapshot;
        armed = false;
        isDirty.value = false;
        return;
      }

      if (!armed) {
        baseline = snapshot;
        armed = true;
        isDirty.value = false;
        return;
      }

      isDirty.value = snapshot !== baseline;
    },
    { flush: 'post', immediate: true },
  );

  function confirmNavigation() {
    if (!enabled() || !ready() || !isDirty.value) return true;
    return requestActionConfirmation({
      title: '离开当前页面？',
      message,
      confirmLabel: '离开页面',
      tone: 'warning',
    });
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!enabled() || !ready() || !isDirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onBeforeRouteLeave(confirmNavigation);
  onBeforeRouteUpdate(confirmNavigation);

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  return {
    isDirty,
    resetUnsavedChanges,
  };
}
