import { defineStore } from 'pinia';

import { navItems, type NavItem } from '../data/navigation';
import {
  routeModulePermission,
  routeModuleReadPermissionCodes,
  routeModuleWritePermissionCodes,
} from '../data/permissionMatrix';
import { listSystemRecords, type SystemRecord } from '../services/api';
import { useSessionStore } from './session';
import systemMenuDefaults from '../../shared/system-menu-defaults.json';

type SharedMenuDefault = {
  code: string;
  name: string;
  menuKey: string;
  path: string;
  enabledByDefault?: boolean;
  permissionCode: string;
  description: string;
  children?: Array<{
    code: string;
    name: string;
    path: string;
    permissionCode: string;
    description: string;
  }>;
};

function defaultSystemMenuRows() {
  return (systemMenuDefaults as SharedMenuDefault[]).flatMap((menu, moduleIndex) => {
    const moduleSortOrder = (moduleIndex + 1) * 100;
    const parent: SystemRecord = {
      code: menu.code,
      name: menu.name,
      owner: '系统管理员',
      status: menu.enabledByDefault === false ? '停用' : '启用',
      description: menu.description,
      updatedAt: '2026-07-09',
      menuKey: menu.menuKey,
      path: menu.path,
      permissionCode: menu.permissionCode,
      sortOrder: moduleSortOrder,
      parentCode: '',
    };
    const children = (menu.children || []).map((child, childIndex) => ({
      code: child.code,
      name: child.name,
      owner: '系统管理员',
      status: menu.enabledByDefault === false ? '停用' : '启用',
      description: child.description,
      updatedAt: '2026-07-09',
      menuKey: menu.menuKey,
      path: child.path,
      permissionCode: child.permissionCode,
      sortOrder: moduleSortOrder + childIndex + 1,
      parentCode: menu.code,
    }));
    return [parent, ...children];
  });
}

function withMissingDefaultMenus(rows: SystemRecord[]) {
  const existingCodes = new Set(rows.map((row) => row.code));
  const missingRows = defaultSystemMenuRows().filter((row) => !existingCodes.has(row.code));
  return missingRows.length ? [...rows, ...missingRows] : rows;
}

function isLockedNavItem(item: NavItem) {
  return item.key === 'home';
}

function menuRecordByKey(rows: SystemRecord[], item: NavItem) {
  return rows.find((row) => row.menuKey === item.key && !row.parentCode);
}

function menuRecordByModuleKey(rows: SystemRecord[], moduleKey: string) {
  return rows.find((row) => row.menuKey === moduleKey && !row.parentCode);
}

function menuDepth(rows: SystemRecord[], row: SystemRecord | undefined, trail = new Set<string>()): number {
  if (!row?.parentCode || trail.has(row.code)) return 0;
  const parent = rows.find((candidate) => candidate.code === row.parentCode);
  return parent ? 1 + menuDepth(rows, parent, new Set([...trail, row.code])) : 0;
}

export function disabledMenuInPath(rows: SystemRecord[], row: SystemRecord | undefined, trail = new Set<string>()): SystemRecord | undefined {
  if (!row) return undefined;
  if (row.status === '停用') return row;
  if (!row.parentCode || trail.has(row.code)) return undefined;
  const parent = rows.find((candidate) => candidate.code === row.parentCode);
  return disabledMenuInPath(rows, parent, new Set([...trail, row.code]));
}

function compareMenuPathCandidates(rows: SystemRecord[], a: SystemRecord, b: SystemRecord) {
  const pathLengthDiff = String(b.path || '').length - String(a.path || '').length;
  if (pathLengthDiff) return pathLengthDiff;
  return menuDepth(rows, b) - menuDepth(rows, a);
}

function childMenuRecordByPath(rows: SystemRecord[], path: string, moduleRecord: SystemRecord | undefined) {
  return rows
    .filter((row) => row.path === path && (!moduleRecord || row.parentCode === moduleRecord.code))
    .sort((a, b) => compareMenuPathCandidates(rows, a, b))[0];
}

function closestMenuRecordByPath(rows: SystemRecord[], path: string, moduleRecord?: SystemRecord) {
  const normalizedPath = path.replace(/\/$/, '') || '/';
  return [...rows]
    .filter(
      (row) =>
        row.path &&
        row.code !== moduleRecord?.code &&
        (normalizedPath === row.path || normalizedPath.startsWith(`${row.path}/`)),
    )
    .sort((a, b) => compareMenuPathCandidates(rows, a, b))[0];
}

function menuSortOrder(record: SystemRecord | undefined, fallbackIndex: number) {
  const sortOrder = Number(record?.sortOrder);
  return Number.isFinite(sortOrder) ? sortOrder : fallbackIndex + 1;
}

export function fallbackPermission(itemOrPath: NavItem | string) {
  const keyOrPath = typeof itemOrPath === 'string' ? itemOrPath : itemOrPath.key;
  const moduleKey = keyOrPath.startsWith('/') ? keyOrPath.split('/')[1] : keyOrPath;
  return routeModulePermission(routeModuleReadPermissionCodes, moduleKey);
}

export function routeWritePermission(path: string) {
  const normalizedPath = path.split('?')[0].replace(/\/$/, '') || '/';
  const isEditorRoute = /\/new$|\/edit$/.test(normalizedPath);
  if (!isEditorRoute) return '';

  const moduleKey = normalizedPath.split('/')[1] || '';
  return routeModulePermission(routeModuleWritePermissionCodes, moduleKey);
}

export type AccessDeniedReason = 'navigation' | 'menu' | 'write';
export type NavigationAccessIssueReason = 'missing-menu' | 'disabled-menu' | 'missing-permission';

export type NavigationAccessIssue = {
  reason: NavigationAccessIssueReason;
  path: string;
  menuCode?: string;
  menuName?: string;
  permissionCode?: string;
};

export function accessDeniedHomeLocation(reason: AccessDeniedReason, from: string) {
  return {
    path: '/',
    query: {
      accessDenied: reason,
      from,
    },
  };
}

function hasRecordAccess(
  record: SystemRecord | undefined,
  fallback: string,
  canAccess: (permissionCode: string) => boolean,
) {
  const permissionCode = record ? record.permissionCode || '' : fallback;
  return !permissionCode || canAccess(permissionCode);
}

function recordPermissionCode(record: SystemRecord | undefined, fallback: string) {
  return record ? record.permissionCode || '' : fallback;
}

function menuRecordLabel(record: SystemRecord | undefined) {
  return record?.name || record?.code || '';
}

function buildVisibleNavigation(
  rows: SystemRecord[],
  canAccess: (permissionCode: string) => boolean,
  menuConfigLoaded = rows.length > 0,
) {
  const hasRows = menuConfigLoaded || rows.length > 0;

  return navItems
    .map((item, index) => {
      if (isLockedNavItem(item)) return { item, index, record: undefined };

      const moduleRecord = hasRows ? menuRecordByKey(rows, item) : undefined;
      if (disabledMenuInPath(rows, moduleRecord) || !hasRecordAccess(moduleRecord, fallbackPermission(item), canAccess)) return null;

      if (!item.children?.length) return { item, index, record: moduleRecord };

      const childEntries = item.children
        .map((child, childIndex) => ({
          child,
          childIndex,
          record: hasRows ? childMenuRecordByPath(rows, child.path, moduleRecord) : undefined,
        }))
        .filter(({ child, record }) => !disabledMenuInPath(rows, record) && hasRecordAccess(record, fallbackPermission(child.path), canAccess));
      const children = childEntries
        .sort(
          (a, b) =>
            item.key === 'production'
              ? a.childIndex - b.childIndex
              : menuSortOrder(a.record, a.childIndex) - menuSortOrder(b.record, b.childIndex) ||
                a.childIndex - b.childIndex,
        )
        .map(({ child }) => child);
      if (!children.length) return null;

      return {
        item: {
          ...item,
          children,
          path: children.some((child) => child.path === item.path) ? item.path : children[0].path,
        },
        index,
        record: moduleRecord,
      };
    })
    .filter((entry): entry is { item: NavItem; index: number; record: SystemRecord | undefined } => Boolean(entry))
    .sort((a, b) => {
      if (isLockedNavItem(a.item)) return -1;
      if (isLockedNavItem(b.item)) return 1;
      return menuSortOrder(a.record, a.index) - menuSortOrder(b.record, b.index) || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function canAccessNavigationPath(
  rows: SystemRecord[],
  path: string,
  canAccess: (permissionCode: string) => boolean,
  menuConfigLoaded = rows.length > 0,
) {
  return !navigationAccessIssue(rows, path, canAccess, menuConfigLoaded);
}

export function navigationAccessIssue(
  rows: SystemRecord[],
  path: string,
  canAccess: (permissionCode: string) => boolean,
  menuConfigLoaded = rows.length > 0,
): NavigationAccessIssue | undefined {
  if (path === '/') return undefined;

  const normalizedPath = path.split('?')[0].replace(/\/$/, '') || '/';
  if (normalizedPath === '/account/security') return undefined;

  const moduleKey = normalizedPath.split('/')[1] || '';
  const hasRows = menuConfigLoaded || rows.length > 0;
  const moduleRecord = hasRows ? menuRecordByModuleKey(rows, moduleKey) : undefined;
  const isModuleRoot = normalizedPath === `/${moduleKey}`;
  const pathRecord = hasRows
    ? isModuleRoot
      ? moduleRecord
      : closestMenuRecordByPath(rows, normalizedPath, moduleRecord)
    : undefined;

  if (hasRows && (!moduleRecord || !pathRecord)) {
    return {
      reason: 'missing-menu',
      path: normalizedPath,
      menuCode: pathRecord?.code || moduleRecord?.code,
      menuName: menuRecordLabel(pathRecord || moduleRecord),
    };
  }

  const disabledModule = disabledMenuInPath(rows, moduleRecord);
  if (disabledModule) {
    return {
      reason: 'disabled-menu',
      path: normalizedPath,
      menuCode: disabledModule.code,
      menuName: menuRecordLabel(disabledModule),
    };
  }

  const disabledPath = disabledMenuInPath(rows, pathRecord);
  if (disabledPath) {
    return {
      reason: 'disabled-menu',
      path: normalizedPath,
      menuCode: disabledPath.code,
      menuName: menuRecordLabel(disabledPath),
    };
  }

  const modulePermission = recordPermissionCode(moduleRecord, fallbackPermission(moduleKey));
  if (modulePermission && !canAccess(modulePermission)) {
    return {
      reason: 'missing-permission',
      path: normalizedPath,
      menuCode: moduleRecord?.code,
      menuName: menuRecordLabel(moduleRecord),
      permissionCode: modulePermission,
    };
  }

  const pathPermission = recordPermissionCode(pathRecord, fallbackPermission(normalizedPath));
  if (pathPermission && !canAccess(pathPermission)) {
    return {
      reason: 'missing-permission',
      path: normalizedPath,
      menuCode: pathRecord?.code,
      menuName: menuRecordLabel(pathRecord),
      permissionCode: pathPermission,
    };
  }

  return undefined;
}

let menuLoadPromise: Promise<void> | undefined;
let menuLoadVersion = 0;

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    menuRows: [] as SystemRecord[],
    loaded: false,
    loading: false,
    error: '',
  }),
  getters: {
    visibleNavItems: (state) => {
      const session = useSessionStore();
      return buildVisibleNavigation(
        state.menuRows,
        (permissionCode) => session.hasPermission(permissionCode),
        state.loaded,
      );
    },
  },
  actions: {
    clearMenus() {
      menuLoadVersion += 1;
      this.menuRows = [];
      this.loaded = false;
      this.loading = false;
      this.error = '';
      menuLoadPromise = undefined;
    },
    async loadMenus(force = false) {
      if (this.loading && menuLoadPromise && !force) return menuLoadPromise;
      if (this.loaded && !force && !this.error) return;

      const loadVersion = ++menuLoadVersion;
      let currentLoadPromise: Promise<void> | undefined;
      currentLoadPromise = (async () => {
        try {
          this.loading = true;
          this.error = '';
          const menuRows = await listSystemRecords('menus');
          if (loadVersion !== menuLoadVersion) return;
          this.menuRows = withMissingDefaultMenus(menuRows);
          this.loaded = true;
        } catch (error) {
          if (loadVersion !== menuLoadVersion) return;
          this.menuRows = withMissingDefaultMenus([]);
          this.error = error instanceof Error ? error.message : '菜单配置加载失败';
          this.loaded = true;
        } finally {
          if (loadVersion === menuLoadVersion) {
            this.loading = false;
          }
          if (currentLoadPromise && menuLoadPromise === currentLoadPromise) {
            menuLoadPromise = undefined;
          }
        }
      })();

      menuLoadPromise = currentLoadPromise;
      return currentLoadPromise;
    },
  },
});
