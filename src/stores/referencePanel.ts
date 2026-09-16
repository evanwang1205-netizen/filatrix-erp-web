import { defineStore } from 'pinia';

type ReferencePayload = {
  title: string;
  subtitle?: string;
  path: string;
};

type ReferencePanelState = {
  open: boolean;
  collapsed: boolean;
  title: string;
  subtitle: string;
  path: string;
};

const referencePanelStorageKey = 'filatrix-reference-panel';

function loadReferencePanelState(): ReferencePanelState {
  const fallback: ReferencePanelState = {
    open: false,
    collapsed: false,
    title: '',
    subtitle: '',
    path: '',
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(referencePanelStorageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ReferencePanelState>;
    if (!parsed.path || !parsed.title) return fallback;
    return {
      open: Boolean(parsed.open),
      collapsed: Boolean(parsed.collapsed),
      title: parsed.title,
      subtitle: parsed.subtitle ?? '',
      path: parsed.path,
    };
  } catch {
    return fallback;
  }
}

function saveReferencePanelState(state: ReferencePanelState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(referencePanelStorageKey, JSON.stringify(state));
}

function clearReferencePanelState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(referencePanelStorageKey);
}

export const useReferencePanelStore = defineStore('referencePanel', {
  state: loadReferencePanelState,
  actions: {
    openReference(payload: ReferencePayload) {
      this.title = payload.title;
      this.subtitle = payload.subtitle ?? '';
      this.path = payload.path;
      this.open = true;
      this.collapsed = false;
      saveReferencePanelState(this.$state);
    },
    closeReference() {
      this.open = false;
      this.collapsed = false;
      clearReferencePanelState();
    },
    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      saveReferencePanelState(this.$state);
    },
  },
});
