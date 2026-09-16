import { computed } from 'vue';

import {
  moduleWritePermissionCodes,
  operationPermissionCodes as operationPermissionCodeMap,
} from '../data/permissionMatrix';
import { useSessionStore } from '../stores/session';

export const modulePermissionCodes = moduleWritePermissionCodes;

export type ModulePermissionKey = keyof typeof modulePermissionCodes;

export const operationPermissionCodes = operationPermissionCodeMap;

export type OperationPermissionKey = keyof typeof operationPermissionCodes;

const roleGrantHint = '请联系系统管理员在角色管理中为当前账号授权。';

export function useModulePermission(moduleKey: ModulePermissionKey) {
  const session = useSessionStore();
  const permissionCode = modulePermissionCodes[moduleKey];
  const canWrite = computed(() => session.hasPermission(permissionCode));
  const readonlyReason = computed(() =>
    canWrite.value ? '' : `当前账号没有${session.permissionLabel(permissionCode)}权限，只能查看。${roleGrantHint}`,
  );

  return {
    canWrite,
    permissionCode,
    readonlyReason,
  };
}

export function useOperationPermission(operationKey: OperationPermissionKey, actionLabel = '执行该动作') {
  const session = useSessionStore();
  const permissionCode = operationPermissionCodes[operationKey];
  const canOperate = computed(() => session.hasPermission(permissionCode));
  const readonlyReason = computed(() =>
    canOperate.value ? '' : `当前账号没有${session.permissionLabel(permissionCode)}操作权限，不能${actionLabel}。${roleGrantHint}`,
  );

  return {
    canOperate,
    permissionCode,
    readonlyReason,
  };
}
