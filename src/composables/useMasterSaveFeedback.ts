import { nextTick, onBeforeUnmount, ref } from 'vue';
import { scrollElementIntoView } from '../utils/focusNavigation';

type FeedbackTone = 'success' | 'error';

type RequiredField = {
  label: string;
  value: unknown;
};

function isBlank(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return String(value ?? '').trim() === '';
}

export function useMasterSaveFeedback() {
  const saveMessage = ref('');
  const saveTone = ref<FeedbackTone>('success');
  const missingRequiredLabels = ref<string[]>([]);
  let saveTimer: number | undefined;

  function focusFirstMissingField() {
    void nextTick(() => {
      if (typeof document === 'undefined') return;
      const target = document.querySelector('.form-field.has-field-error') as HTMLElement | null;
      const focusTarget = target?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement | null;
      scrollElementIntoView(target);
      focusTarget?.focus();
    });
  }

  function showSaveFeedback(message: string, tone: FeedbackTone = 'success') {
    saveMessage.value = message;
    saveTone.value = tone;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveMessage.value = '';
    }, 2400);
  }

  function validateRequired(fields: RequiredField[]) {
    const missingFields = fields.filter((field) => isBlank(field.value));
    missingRequiredLabels.value = missingFields.map((field) => field.label);
    const missingField = missingFields[0];
    if (!missingField) {
      return true;
    }

    showSaveFeedback(`${missingField.label}不能为空`, 'error');
    focusFirstMissingField();
    return false;
  }

  function requiredFieldClass(label: string, value?: unknown) {
    return {
      'is-required-field': true,
      'has-field-error': missingRequiredLabels.value.includes(label) && isBlank(value),
    };
  }

  function setRequiredErrors(labels: string[]) {
    missingRequiredLabels.value = labels;
    if (labels.length) focusFirstMissingField();
  }

  onBeforeUnmount(() => {
    window.clearTimeout(saveTimer);
  });

  return {
    saveMessage,
    saveTone,
    missingRequiredLabels,
    showSaveFeedback,
    validateRequired,
    requiredFieldClass,
    setRequiredErrors,
  };
}
