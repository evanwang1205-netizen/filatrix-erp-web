import { readonly, ref } from 'vue';

export type ActionConfirmationTone = 'warning' | 'danger';

export type ActionConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ActionConfirmationTone;
};

export type ActionConfirmationRequest = Required<ActionConfirmationOptions>;

const pendingRequest = ref<ActionConfirmationRequest | null>(null);
let pendingResolver: ((confirmed: boolean) => void) | null = null;

export function requestActionConfirmation(options: ActionConfirmationOptions) {
  if (pendingResolver) pendingResolver(false);

  pendingRequest.value = {
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel || '确认',
    cancelLabel: options.cancelLabel || '取消',
    tone: options.tone || 'warning',
  };

  return new Promise<boolean>((resolve) => {
    pendingResolver = resolve;
  });
}

export function resolveActionConfirmation(confirmed: boolean) {
  const resolver = pendingResolver;
  pendingResolver = null;
  pendingRequest.value = null;
  resolver?.(confirmed);
}

export function useActionConfirmationHost() {
  return {
    pendingRequest: readonly(pendingRequest),
    confirmAction: () => resolveActionConfirmation(true),
    cancelAction: () => resolveActionConfirmation(false),
  };
}
