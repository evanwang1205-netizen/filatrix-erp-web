import { nextTick, onBeforeUnmount, type Ref } from 'vue';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus(panel: Ref<HTMLElement | null>, initialFocus?: Ref<HTMLElement | null>) {
  let restoreTarget: HTMLElement | null = null;

  function focusDialog() {
    restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void nextTick(() => {
      (initialFocus?.value ?? panel.value)?.focus();
    });
  }

  function restoreDialogFocus() {
    const target = restoreTarget;
    restoreTarget = null;
    void nextTick(() => {
      if (target?.isConnected) target.focus();
    });
  }

  function handleDialogTab(event: KeyboardEvent) {
    const container = panel.value;
    if (!container) return;

    const focusableElements = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
    );

    if (!focusableElements.length) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === container || !container.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && (active === last || active === container || !container.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  onBeforeUnmount(() => {
    if (restoreTarget?.isConnected) restoreTarget.focus();
  });

  return {
    focusDialog,
    restoreDialogFocus,
    handleDialogTab,
  };
}
