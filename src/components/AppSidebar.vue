<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, ChevronLeft, KeyRound, LogOut, Settings } from 'lucide-vue-next';

import type { NavItem } from '../data/navigation';
import { moduleReadPermissionCodes } from '../data/permissionMatrix';
import {
  accessDeniedHomeLocation,
  canAccessNavigationPath,
  routeWritePermission,
  useNavigationStore,
} from '../stores/navigation';
import { useSessionStore } from '../stores/session';

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  navigate: [];
  toggleCollapse: [];
}>();

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const navigation = useNavigationStore();
const expandedKeys = ref<string[]>(['sales']);
const settingsOpen = ref(false);
const sidebarUserRef = ref<HTMLElement | null>(null);

const currentPath = computed(() => route.path);
const visibleNavItems = computed(() => navigation.visibleNavItems);
const accountOptions = computed(() => session.accountOptions);
const accountSetupMode = computed(() => session.setupMode);
const canInitializePasswordLogin = computed(() => accountSetupMode.value && session.hasPermission(moduleReadPermissionCodes.system));
const canOpenAccountSecurity = computed(() => session.authenticated || canInitializePasswordLogin.value);
const accountSecurityTitle = computed(() => {
  if (canOpenAccountSecurity.value) return '修改当前账号密码';
  if (accountSetupMode.value && session.loadedFromAccounts) return '首次启用密码登录必须由拥有系统配置维护权限的账号设置';
  return '请先登录后再维护账号安全';
});
const canSwitchAccounts = computed(() => session.hasPermission(moduleReadPermissionCodes.system) || accountSetupMode.value);
const canLogout = computed(() => session.authenticated);
const currentAccountLabel = computed(() => {
  if (!session.loadedFromAccounts) return '';
  const account = accountOptions.value.find((row) => row.code === session.user.accountCode);
  return [account?.username || session.user.accountCode, account?.code].filter(Boolean).join(' · ');
});

function pathMatches(path: string) {
  const normalizedPath = path === '/' ? path : path.replace(/\/+$/, '');
  return currentPath.value === normalizedPath
    || (normalizedPath !== '/' && currentPath.value.startsWith(`${normalizedPath}/`));
}

function isActive(path: string) {
  return pathMatches(path);
}

function isGroupActive(item: NavItem) {
  if (item.children) {
    return item.children.some((child) => pathMatches(child.path));
  }

  return isActive(item.path);
}

function toggle(key: string) {
  expandedKeys.value = expandedKeys.value.includes(key)
    ? expandedKeys.value.filter((item) => item !== key)
    : [...expandedKeys.value, key];
}

function handleGroupClick(item: NavItem) {
  if (props.collapsed) {
    router.push(item.path);
    return;
  }

  toggle(item.key);
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!settingsOpen.value) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && sidebarUserRef.value?.contains(target)) {
    return;
  }

  settingsOpen.value = false;
}

function syncActiveGroup() {
  const activeGroup = visibleNavItems.value.find((item) => item.children?.some((child) => pathMatches(child.path)));

  if (activeGroup && !expandedKeys.value.includes(activeGroup.key)) {
    expandedKeys.value = [...expandedKeys.value, activeGroup.key];
  }
}

async function handleAccountChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const nextCode = target.value;
  const previousCode = session.user.accountCode;

  try {
    await session.switchAccount(nextCode);
    if (session.authRequired) {
      navigation.clearMenus();
      settingsOpen.value = false;
      await router.push({
        path: '/login',
        query: route.fullPath === '/' ? undefined : { redirect: route.fullPath },
      });
      return;
    }

    await navigation.loadMenus(true);
    settingsOpen.value = false;
  } catch (error) {
    target.value = previousCode;
    settingsOpen.value = false;
    if (session.authRequired) {
      navigation.clearMenus();
      await router.push({
        path: '/login',
        query: route.fullPath === '/' ? undefined : { redirect: route.fullPath },
      });
      return;
    }

    if (!session.authRequired) {
      session.accountLoadError = error instanceof Error ? error.message : '账号切换失败';
    }
    return;
  }

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
  }
}

async function openAccountSecurity() {
  if (!canOpenAccountSecurity.value) return;

  settingsOpen.value = false;
  emit('navigate');
  await router.push('/account/security');
}

async function handleLogout() {
  if (!canLogout.value) return;

  settingsOpen.value = false;
  await session.logout();
  navigation.clearMenus();
  emit('navigate');
  await router.push('/login');
}

watch(
  () => props.collapsed,
  () => {
    settingsOpen.value = false;
  },
);

watch(
  () => route.path,
  () => {
    syncActiveGroup();
  },
  { immediate: true },
);

watch(
  visibleNavItems,
  () => {
    syncActiveGroup();
  },
);

onMounted(() => {
  void session.loadUserFromAccounts(true).then(() => {
    if (session.authRequired) {
      navigation.clearMenus();
      return;
    }

    void navigation.loadMenus(true);
  });
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});
</script>

<template>
  <aside class="app-sidebar">
    <RouterLink class="brand" to="/" aria-label="filatrix ERP 首页" title="首页" @click="emit('navigate')">
      <img src="/filatrix-logo-strip-white.png" alt="filatrix" />
    </RouterLink>

    <nav class="nav-list" aria-label="主导航">
      <div v-for="item in visibleNavItems" :key="item.key" class="nav-group">
        <RouterLink
          v-if="!item.children"
          class="nav-item"
          :class="{ active: isGroupActive(item) }"
          :to="item.path"
          :title="item.label"
          @click="emit('navigate')"
        >
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </RouterLink>

        <template v-else>
          <button
            class="nav-item nav-button"
            :class="{ active: isGroupActive(item), expanded: expandedKeys.includes(item.key) }"
            type="button"
            :title="item.label"
            @click="handleGroupClick(item)"
          >
            <component :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <ChevronDown class="chevron" :size="15" />
          </button>

          <div v-show="expandedKeys.includes(item.key)" class="nav-children">
            <template v-for="(child, childIndex) in item.children" :key="child.label">
              <span
                v-if="child.group && child.group !== item.children[childIndex - 1]?.group"
                class="nav-section-label"
              >
                {{ child.group }}
              </span>
              <RouterLink
                class="nav-child"
                :class="{ active: isActive(child.path) }"
                :to="child.path"
                @click="emit('navigate')"
              >
                {{ child.label }}
              </RouterLink>
            </template>
          </div>
        </template>
      </div>
    </nav>

    <div v-if="!collapsed" class="sidebar-collapse-row">
      <button
        class="sidebar-collapse-button"
        type="button"
        :aria-label="collapsed ? '展开菜单' : '收起菜单'"
        :title="collapsed ? '展开菜单' : '收起菜单'"
        @click="emit('toggleCollapse')"
      >
        <ChevronLeft :size="10" />
      </button>
    </div>

    <div ref="sidebarUserRef" class="sidebar-user">
      <div class="avatar">{{ session.avatarText }}</div>
      <div class="user-copy">
        <strong>{{ session.userDisplayName }}</strong>
        <span>{{ session.userDepartmentLabel }}</span>
      </div>
      <button
        class="icon-button user-settings"
        type="button"
        aria-label="用户设置"
        @click="settingsOpen = !settingsOpen"
      >
        <Settings :size="16" />
      </button>

      <div v-show="settingsOpen" class="settings-menu">
        <button
          type="button"
          :disabled="!canOpenAccountSecurity"
          :title="accountSecurityTitle"
          @click="openAccountSecurity"
        >
          <KeyRound :size="15" />账号安全
        </button>
        <button
          type="button"
          :disabled="!canLogout"
          :title="canLogout ? '退出当前账号' : '当前处于初始化免登录模式'"
          @click="handleLogout"
        >
          <LogOut :size="15" />退出登录
        </button>
      </div>

      <select
        v-if="canSwitchAccounts && accountOptions.length > 1"
        class="account-switcher"
        :value="session.user.accountCode"
        aria-label="切换当前账号"
        @change="handleAccountChange"
      >
        <option v-for="account in accountOptions" :key="account.code" :value="account.code">
          {{ account.name || account.username || account.code }} · {{ account.username || account.code }}
        </option>
      </select>
      <span v-else-if="currentAccountLabel" class="account-chip">
        {{ currentAccountLabel }}
      </span>
    </div>
  </aside>
</template>
