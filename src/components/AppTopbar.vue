<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Bell,
  CheckCheck,
  Menu,
  RefreshCw,
} from 'lucide-vue-next';

import { refreshCurrentPage } from '../composables/usePageRefresh';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../services/api';
import {
  accessDeniedHomeLocation,
  type AccessDeniedReason,
  canAccessNavigationPath,
  routeWritePermission,
  useNavigationStore,
} from '../stores/navigation';
import { useSessionStore } from '../stores/session';

const props = defineProps<{
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarLocked?: boolean;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
}>();

const route = useRoute();
const router = useRouter();
const navigation = useNavigationStore();
const session = useSessionStore();
const visibleNavItems = computed(() => navigation.visibleNavItems);
const notificationItems = ref<AppNotification[]>([]);
const unreadCount = ref(0);
const notificationsOpen = ref(false);
const notificationsLoading = ref(false);
const notificationError = ref('');
const workspaceRefreshing = ref(false);
const compactViewport = ref(window.matchMedia('(max-width: 900px)').matches);
let notificationTimer: number | undefined;

const navigationExpanded = computed(() =>
  compactViewport.value ? props.sidebarOpen : !props.sidebarCollapsed,
);
const navigationLabel = computed(() =>
  props.sidebarLocked
    ? '右侧参考页展开时菜单保持收起'
    : navigationExpanded.value
      ? '收起菜单'
      : '展开菜单',
);

function syncCompactViewport() {
  compactViewport.value = window.matchMedia('(max-width: 900px)').matches;
}

function matchesPath(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`);
}

const currentModuleItem = computed(() => {
  if (route.path === '/') {
    return visibleNavItems.value.find((item) => item.path === '/');
  }

  const moduleKey = route.path.split('/')[1];

  return (
    visibleNavItems.value.find((item) => item.children?.some((child) => matchesPath(child.path))) ??
    visibleNavItems.value.find(
      (item) =>
        item.path !== '/' &&
        (matchesPath(item.path) || item.key === moduleKey || item.path.startsWith(`/${moduleKey}/`)),
    )
  );
});

onMounted(() => {
  void navigation.loadMenus();
  void loadNotificationInbox();
  window.addEventListener('resize', syncCompactViewport);
  notificationTimer = window.setInterval(() => {
    void loadNotificationInbox();
  }, 60000);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCompactViewport);
  window.clearInterval(notificationTimer);
});

const currentChildIndex = computed(() => {
  const children = currentModuleItem.value?.children;

  if (!children?.length) {
    return -1;
  }

  return children.findIndex((child) => matchesPath(child.path));
});

const currentChild = computed(() => {
  const children = currentModuleItem.value?.children;
  const index = currentChildIndex.value;
  return children && index >= 0 ? children[index] : undefined;
});

const moduleLabel = computed(() => {
  if (route.path === '/') {
    return '首页';
  }

  return currentModuleItem.value?.label ?? '工作台';
});

const pageTitle = computed(() => {
  if (route.path === '/') {
    return '';
  }

  return currentChild.value?.label ?? route.meta.title?.toString() ?? '工作台';
});

const unreadBadge = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)));

function notificationMetaText(item: AppNotification) {
  return [item.sourceDoc, item.createdAt].filter(Boolean).join(' · ') || '系统通知';
}

function notificationTitleText(item: AppNotification) {
  return [item.module, item.action, item.title, item.message, notificationMetaText(item)].filter(Boolean).join(' / ');
}

async function loadNotificationInbox() {
  try {
    notificationsLoading.value = true;
    const inbox = await listNotifications(20);
    notificationItems.value = inbox.items;
    unreadCount.value = inbox.unreadCount;
    notificationError.value = '';
  } catch (error) {
    notificationItems.value = [];
    unreadCount.value = 0;
    notificationError.value = error instanceof Error ? error.message : '通知加载失败';
  } finally {
    notificationsLoading.value = false;
  }
}

async function pathAccessDeniedReason(path: string): Promise<AccessDeniedReason | ''> {
  if (!navigation.loaded || navigation.error) {
    await navigation.loadMenus();
  }

  const canReadTargetPath = canAccessNavigationPath(
    navigation.menuRows,
    path,
    (permissionCode) => session.hasPermission(permissionCode),
    navigation.loaded,
  );
  const writePermission = routeWritePermission(path);
  const lacksWritePermission = Boolean(writePermission && !session.hasPermission(writePermission));

  if (navigation.error) return 'navigation';
  if (!canReadTargetPath) return 'menu';
  if (lacksWritePermission) return 'write';
  return '';
}

async function openAccessiblePath(path: string) {
  const deniedReason = await pathAccessDeniedReason(path);

  if (deniedReason) {
    await router.push(accessDeniedHomeLocation(deniedReason, path));
    return;
  }

  await router.push(path);
}

async function toggleNotificationPanel() {
  notificationsOpen.value = !notificationsOpen.value;
  if (notificationsOpen.value) {
    await loadNotificationInbox();
  }
}

async function openNotification(item: AppNotification) {
  try {
    const deniedReason = item.sourcePath ? await pathAccessDeniedReason(item.sourcePath) : '';
    if (deniedReason) {
      notificationError.value = '当前账号没有权限打开该通知来源，已保持未读。';
      notificationsOpen.value = false;
      await router.push(accessDeniedHomeLocation(deniedReason, item.sourcePath));
      return;
    }

    if (item.unread) {
      const inbox = await markNotificationRead(item.code);
      notificationItems.value = inbox.items;
      unreadCount.value = inbox.unreadCount;
    }

    notificationsOpen.value = false;
    notificationError.value = '';
    if (item.sourcePath) {
      await openAccessiblePath(item.sourcePath);
    }
  } catch (error) {
    notificationError.value = error instanceof Error ? error.message : '通知操作失败';
  }
}

async function markAllRead() {
  try {
    const inbox = await markAllNotificationsRead();
    notificationItems.value = inbox.items;
    unreadCount.value = inbox.unreadCount;
    notificationError.value = '';
  } catch (error) {
    notificationError.value = error instanceof Error ? error.message : '通知操作失败';
  }
}

async function refreshWorkspace() {
  if (workspaceRefreshing.value) return;
  workspaceRefreshing.value = true;

  try {
    await session.loadUserFromAccounts(true);

    if (session.authRequired) {
      notificationsOpen.value = false;
      navigation.clearMenus();
      await router.push({
        path: '/login',
        query: route.fullPath === '/' ? undefined : { redirect: route.fullPath },
      });
      return;
    }

    await navigation.loadMenus(true);
    await loadNotificationInbox();

    const canReadCurrentRoute = canAccessNavigationPath(
      navigation.menuRows,
      route.path,
      (permissionCode) => session.hasPermission(permissionCode),
      navigation.loaded,
    );
    const writePermission = routeWritePermission(route.path);
    const lacksWritePermission = Boolean(writePermission && !session.hasPermission(writePermission));
    if (navigation.error || !canReadCurrentRoute || lacksWritePermission) {
      await router.push(accessDeniedHomeLocation(navigation.error ? 'navigation' : canReadCurrentRoute ? 'write' : 'menu', route.fullPath));
      return;
    }

    await refreshCurrentPage();
  } finally {
    workspaceRefreshing.value = false;
  }
}

watch(
  () => session.user.accountCode,
  () => {
    notificationsOpen.value = false;
    void loadNotificationInbox();
  },
);
</script>

<template>
  <header class="topbar">
    <button
      class="icon-button nav-toggle"
      type="button"
      :aria-label="navigationLabel"
      :title="navigationLabel"
      :disabled="sidebarLocked"
      @click="emit('toggleSidebar')"
    >
      <Menu :size="18" />
    </button>

    <div class="topbar-leading">
      <div class="breadcrumb">
        <span class="breadcrumb-module">{{ moduleLabel }}</span>
        <template v-if="pageTitle">
          <span class="breadcrumb-separator">/</span>
          <strong>{{ pageTitle }}</strong>
        </template>
      </div>
      <div id="topbar-page-context" class="topbar-page-context"></div>
    </div>

    <div class="topbar-tools">
      <div id="topbar-page-actions" class="topbar-page-actions"></div>
      <button
        class="icon-button topbar-refresh-button"
        :class="{ 'is-refreshing': workspaceRefreshing }"
        type="button"
        :disabled="workspaceRefreshing"
        :aria-busy="workspaceRefreshing"
        aria-label="刷新当前页面"
        :title="workspaceRefreshing ? '正在刷新' : '刷新当前页面'"
        @click="refreshWorkspace"
      >
        <RefreshCw :size="17" />
      </button>
      <div class="notification-wrap">
        <button
          class="icon-button notification-button"
          :class="{ active: notificationsOpen }"
          type="button"
          aria-label="通知"
          title="通知"
          @click="toggleNotificationPanel"
        >
          <Bell :size="17" />
          <i v-if="unreadCount" class="notification-badge">{{ unreadBadge }}</i>
        </button>

        <div v-if="notificationsOpen" class="notification-popover">
          <div class="notification-popover-head">
            <div class="notification-popover-title">
              <strong>内部通知</strong>
              <span>{{ unreadCount }} 条未读</span>
            </div>
            <div class="notification-popover-actions">
              <button type="button" :disabled="notificationsLoading" @click="loadNotificationInbox">
                <RefreshCw :size="13" />
                {{ notificationsLoading ? '刷新中' : '刷新' }}
              </button>
              <button type="button" :disabled="!unreadCount || notificationsLoading" @click="markAllRead">
                <CheckCheck :size="13" />
                全部已读
              </button>
            </div>
          </div>

          <div v-if="notificationError" class="notification-empty error">{{ notificationError }}</div>
          <div v-else-if="notificationsLoading && !notificationItems.length" class="notification-empty">正在加载通知</div>
          <div v-else-if="!notificationItems.length" class="notification-empty">暂无通知</div>
          <div v-else class="notification-list">
            <button
              v-for="item in notificationItems"
              :key="item.code"
              class="notification-row"
              :class="{ unread: item.unread }"
              type="button"
              :title="notificationTitleText(item)"
              @click="openNotification(item)"
            >
              <span>{{ item.module }} / {{ item.action }}</span>
              <strong>{{ item.title }}</strong>
              <small>{{ item.message }}</small>
              <em>{{ notificationMetaText(item) }}</em>
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
