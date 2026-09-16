import { defineStore } from 'pinia';

import {
  ApiError,
  changeOwnPassword,
  clearStoredSessionToken,
  getCurrentSession,
  getStoredSessionToken,
  impersonateSession,
  loginSession,
  logoutSession,
  type SessionAccount,
  type SessionContext,
} from '../services/api';
import { permissionLabel as fallbackPermissionLabel } from '../utils/permissionDisplay';

export type UserRole =
  | '销售'
  | '销售主管'
  | '采购'
  | '采购主管'
  | '仓库'
  | '仓库主管'
  | '生产'
  | '生产主管'
  | '质检'
  | '质检主管'
  | '基础资料'
  | '系统管理员'
  | '管理员';

export type UserPermission = string;

function normalizeRoleName(name: string) {
  const roleMap: Record<string, UserRole> = {
    管理员: '管理员',
    系统管理员: '系统管理员',
    销售专员: '销售',
    销售主管: '销售主管',
    销售: '销售',
    采购专员: '采购',
    采购主管: '采购主管',
    采购: '采购',
    仓库: '仓库',
    仓库主管: '仓库主管',
    基础资料: '基础资料',
  };
  return roleMap[name] || (name as UserRole);
}

const currentAccountStorageKey = 'filatrix-current-account';

function defaultUser() {
  return {
    accountCode: 'ACC-ZHANGSAN',
    employeeCode: 'EMP-ZS',
    name: '张三',
    roles: ['销售主管', '仓库主管', '管理员'] as UserRole[],
    roleCodes: ['ROLE-ADMIN', 'ROLE-SALES', 'ROLE-WAREHOUSE'] as string[],
    permissions: [] as UserPermission[],
    department: '运营管理部',
  };
}

function persistCurrentAccount(code: string) {
  if (typeof window === 'undefined' || !code) return;
  window.localStorage.setItem(currentAccountStorageKey, code);
}

function hasPersistedCurrentAccount() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem(currentAccountStorageKey));
}

function clearPersistedCurrentAccount() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(currentAccountStorageKey);
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    user: defaultUser(),
    accountOptions: [] as SessionAccount[],
    setupMode: false,
    authRequired: false,
    authenticated: Boolean(getStoredSessionToken()),
    loadedFromAccounts: false,
    accountLoadError: '',
    permissionLabels: {} as Record<string, string>,
  }),
  getters: {
    avatarText: (state) => (state.loadedFromAccounts ? state.user.name.slice(-1) || '用' : '…'),
    roleLabel: (state) => (state.loadedFromAccounts ? state.user.roles.join(' / ') : ''),
    userDisplayName: (state) => (state.loadedFromAccounts ? state.user.name : '加载账号'),
    userDepartmentLabel: (state) => (state.loadedFromAccounts ? state.user.department : '正在读取权限'),
    isAdmin: (state) =>
      state.loadedFromAccounts && (state.user.roles.includes('管理员') || state.user.roleCodes.includes('ROLE-ADMIN')),
    hasPermission: (state) => (permissionCode: string) =>
      !permissionCode || (state.loadedFromAccounts && state.user.permissions.includes(permissionCode)),
    permissionLabel: (state) => (permissionCode: string) => {
      const displayName = state.permissionLabels[permissionCode];
      return displayName ? `${displayName}（${permissionCode}）` : fallbackPermissionLabel(permissionCode);
    },
  },
  actions: {
    applySessionContext(context: SessionContext) {
      const roles = context.roles.map(normalizeRoleName) as UserRole[];
      this.accountOptions = context.accountOptions;
      this.permissionLabels = context.permissionLabels || {};
      this.setupMode = context.setupMode;
      this.authRequired = false;
      this.authenticated = Boolean(getStoredSessionToken());
      this.user = {
        accountCode: context.account.code,
        employeeCode: context.account.employeeCode || '',
        name: context.account.name || context.account.username || this.user.name,
        roles,
        roleCodes: context.roleCodes,
        permissions: context.permissions,
        department: context.account.department || this.user.department,
      };
      persistCurrentAccount(context.account.code);
      this.accountLoadError = '';
      this.loadedFromAccounts = true;
    },
    clearSessionState(message = '') {
      this.user = {
        ...defaultUser(),
        roles: [],
        roleCodes: [],
        permissions: [],
      };
      this.accountOptions = [];
      this.setupMode = false;
      this.permissionLabels = {};
      this.accountLoadError = message;
    },
    expireSession(message = '登录已过期，请重新登录。') {
      clearStoredSessionToken();
      clearPersistedCurrentAccount();
      this.authRequired = true;
      this.authenticated = false;
      this.loadedFromAccounts = true;
      this.clearSessionState(message);
    },
    async loadUserFromAccounts(force = false) {
      const hasStoredToken = Boolean(getStoredSessionToken());
      if (this.loadedFromAccounts && !force) {
        if (this.authenticated && !hasStoredToken) {
          this.expireSession();
          return;
        }

        if (!this.authenticated && hasStoredToken) {
          force = true;
        } else {
          return;
        }
      }

      try {
        const context = await getCurrentSession();
        this.applySessionContext(context);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.expireSession(error.message || '请先登录。');
          return;
        }

        let loadError: unknown = error;
        if (error instanceof ApiError && error.status === 403 && !hasStoredToken && hasPersistedCurrentAccount()) {
          clearPersistedCurrentAccount();
          try {
            const context = await getCurrentSession();
            this.applySessionContext(context);
            return;
          } catch (retryError) {
            loadError = retryError;
          }
        }

        this.accountLoadError = loadError instanceof Error ? loadError.message : '账号资料加载失败';
        this.accountOptions = [];
        this.permissionLabels = {};
        this.setupMode = false;
        this.authRequired = false;
        this.user = {
          ...this.user,
          roles: [],
          roleCodes: [],
          permissions: [],
        };
      } finally {
        this.loadedFromAccounts = true;
      }
    },
    async login(username: string, password: string) {
      const context = await loginSession(username, password);
      this.applySessionContext(context);
      this.authenticated = true;
    },
    async logout() {
      try {
        await logoutSession();
      } catch {
        clearStoredSessionToken();
      }
      clearPersistedCurrentAccount();
      this.authRequired = true;
      this.authenticated = false;
      this.loadedFromAccounts = true;
      this.clearSessionState('已退出登录。');
    },
    async updateOwnPassword(currentPassword: string, nextPassword: string, confirmPassword: string) {
      await changeOwnPassword(currentPassword, nextPassword, confirmPassword);
      clearPersistedCurrentAccount();
      this.authRequired = true;
      this.authenticated = false;
      this.loadedFromAccounts = true;
      this.clearSessionState('密码已更新，请使用新密码重新登录。');
    },
    async switchAccount(accountCode: string) {
      const nextCode = String(accountCode || '').trim();
      if (!nextCode || nextCode === this.user.accountCode) return;

      if (getStoredSessionToken()) {
        const context = await impersonateSession(nextCode);
        this.applySessionContext(context);
        this.authenticated = true;
        return;
      }

      persistCurrentAccount(nextCode);
      this.loadedFromAccounts = false;
      await this.loadUserFromAccounts(true);
    },
  },
});
