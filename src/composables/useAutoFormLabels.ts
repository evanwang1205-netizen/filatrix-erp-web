import { nextTick, onBeforeUnmount, onMounted } from 'vue';

const FORM_CONTROL_SELECTOR = 'input, select, textarea';

function fieldLabel(field: Element) {
  return Array.from(field.children)
    .find((child) => child.tagName.toLowerCase() === 'span')
    ?.textContent?.trim();
}

function applyFormLabels(root: ParentNode = document) {
  root.querySelectorAll('.form-field').forEach((field) => {
    const label = fieldLabel(field);
    if (!label) return;

    field.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(FORM_CONTROL_SELECTOR).forEach(
      (control) => {
        const autoManaged = control.dataset.autoAriaLabel === 'true';
        if (!control.getAttribute('aria-label') || autoManaged) {
          control.setAttribute('aria-label', label);
          control.dataset.autoAriaLabel = 'true';
        }
      },
    );
  });
}

export function useAutoFormLabels() {
  let observer: MutationObserver | undefined;

  onMounted(() => {
    void nextTick(() => {
      applyFormLabels();

      observer = new MutationObserver(() => applyFormLabels());
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
  });
}
