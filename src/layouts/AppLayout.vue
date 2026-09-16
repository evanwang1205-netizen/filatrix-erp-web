<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';

import AppSidebar from '../components/AppSidebar.vue';
import AppTopbar from '../components/AppTopbar.vue';
import ActionConfirmationHost from '../components/ActionConfirmationHost.vue';
import ReferenceSidePanel from '../components/ReferenceSidePanel.vue';
import { sessionExpiredEventName } from '../services/api';
import { useNavigationStore } from '../stores/navigation';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const router = useRouter();
const navigation = useNavigationStore();
const session = useSessionStore();
const sidebarCollapsedStorageKey = 'filatrix-sidebar-collapsed';
const sidebarOpen = ref(false);
const sidebarCollapsed = ref(
  typeof window !== 'undefined'
  && window.localStorage.getItem(sidebarCollapsedStorageKey) === '1',
);
const isReferenceShell = computed(() => route.query.referencePanel === '1');
const shellStatusTitle = computed(() => {
  if (session.accountLoadError && !session.authRequired) return '账号权限加载异常';
  if (navigation.error) return '菜单加载异常';
  return '';
});
const shellStatusMessage = computed(() => {
  if (session.accountLoadError && !session.authRequired) return session.accountLoadError;
  if (navigation.error) return navigation.error;
  return '';
});
let readonlyTitleObserver: MutationObserver | undefined;

const readonlyTitleSelector = [
  '.form-field input[readonly]',
  '.form-field input:disabled',
  '.form-field textarea[readonly]',
  '.form-field textarea:disabled',
  '.form-field select:disabled',
  '.form-field .readonly-field-value',
  '.reference-picker-readonly',
  '.line-readonly-value',
].join(',');

function toggleNavigation() {
  if (window.matchMedia('(max-width: 900px)').matches) {
    sidebarOpen.value = !sidebarOpen.value;
    return;
  }

  sidebarCollapsed.value = !sidebarCollapsed.value;
}

async function handleSessionExpired(event: Event) {
  const message =
    event instanceof CustomEvent && typeof event.detail?.message === 'string'
      ? event.detail.message
      : '登录已过期，请重新登录。';

  session.expireSession(message);
  navigation.clearMenus();

  if (route.path !== '/login') {
    await router.replace({
      path: '/login',
      query: route.fullPath === '/' ? undefined : { redirect: route.fullPath },
    });
  }
}

function readonlyFieldTitle(element: Element) {
  if (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
  ) {
    return (element.value || element.getAttribute('placeholder') || '').trim();
  }

  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

function syncReadonlyFieldTitles() {
  document.querySelectorAll(readonlyTitleSelector).forEach((element) => {
    const title = readonlyFieldTitle(element);
    if (title) {
      (element as HTMLElement).title = title;
      return;
    }

    (element as HTMLElement).removeAttribute('title');
  });
}

function scheduleReadonlyTitleSync() {
  window.requestAnimationFrame(syncReadonlyFieldTitles);
}

onMounted(() => {
  window.addEventListener(sessionExpiredEventName, handleSessionExpired);
  syncReadonlyFieldTitles();
  readonlyTitleObserver = new MutationObserver(scheduleReadonlyTitleSync);
  readonlyTitleObserver.observe(document.querySelector('.content-scroll') ?? document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
});

onBeforeUnmount(() => {
  window.removeEventListener(sessionExpiredEventName, handleSessionExpired);
  readonlyTitleObserver?.disconnect();
  readonlyTitleObserver = undefined;
});

watch(
  () => route.fullPath,
  () => {
    void nextTick(syncReadonlyFieldTitles);
  },
);

watch(sidebarCollapsed, (collapsed) => {
  window.localStorage.setItem(sidebarCollapsedStorageKey, collapsed ? '1' : '0');
});
</script>

<template>
  <div
    class="erp-page"
    :class="{
      'sidebar-open': sidebarOpen,
      'sidebar-collapsed': sidebarCollapsed,
      'reference-shell': isReferenceShell,
    }"
  >
    <div class="app-shell">
      <AppSidebar
        v-if="!isReferenceShell"
        :collapsed="sidebarCollapsed"
        @navigate="sidebarOpen = false"
        @toggle-collapse="toggleNavigation"
      />
      <button
        v-if="!isReferenceShell && sidebarCollapsed"
        class="sidebar-collapse-button sidebar-restore-button"
        type="button"
        aria-label="展开菜单"
        title="展开菜单"
        @click="toggleNavigation"
      >
        <ChevronRight :size="10" />
      </button>
      <div v-if="!isReferenceShell" class="sidebar-backdrop" @click="sidebarOpen = false"></div>

      <main class="app-main">
        <AppTopbar
          v-if="!isReferenceShell"
          :sidebar-open="sidebarOpen"
          :sidebar-collapsed="sidebarCollapsed"
          @toggle-sidebar="toggleNavigation"
        />
        <section class="content-scroll">
          <section v-if="shellStatusMessage" class="access-denied-banner shell-status-banner" aria-live="polite">
            <strong>{{ shellStatusTitle }}</strong>
            <span>{{ shellStatusMessage }}</span>
          </section>
          <RouterView />
        </section>
      </main>

      <ReferenceSidePanel v-if="!isReferenceShell" />
    </div>
    <ActionConfirmationHost />
  </div>
</template>
