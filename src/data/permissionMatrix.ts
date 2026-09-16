import sharedPermissionMatrix from '../../shared/permission-matrix.json';

type PermissionCodeMap = Readonly<Record<string, string>>;

export const moduleReadPermissionCodes: PermissionCodeMap = sharedPermissionMatrix.moduleReadPermissionCodes;
export const moduleWritePermissionCodes: PermissionCodeMap = sharedPermissionMatrix.moduleWritePermissionCodes;
export const routeModuleReadPermissionCodes: PermissionCodeMap = sharedPermissionMatrix.routeModuleReadPermissionCodes;
export const routeModuleWritePermissionCodes: PermissionCodeMap = sharedPermissionMatrix.routeModuleWritePermissionCodes;
export const operationPermissionCodes: PermissionCodeMap = sharedPermissionMatrix.operationPermissionCodes;
export const operationPermissionDependencies: Readonly<Record<string, readonly string[]>> =
  sharedPermissionMatrix.operationPermissionDependencies;

export const operationPermissionCodeSet = new Set<string>(Object.keys(operationPermissionDependencies));
export const permissionDisplayOrder: readonly string[] = sharedPermissionMatrix.permissionDisplayOrder;
export const roleDisplayOrder: readonly string[] = sharedPermissionMatrix.roleDisplayOrder;
export const protectedSystemMenuCodes: readonly string[] = sharedPermissionMatrix.protectedSystemMenuCodes;
export const coreSystemRecordCodes: Readonly<{
  adminRole: string;
  defaultAdminAccount: string;
  systemPermission: string;
}> = sharedPermissionMatrix.coreSystemRecordCodes;
export const referencePermissionCodes: Readonly<Record<string, readonly string[]>> =
  sharedPermissionMatrix.referencePermissionCodes;
export const notificationModuleOptions: readonly string[] = sharedPermissionMatrix.notificationModuleOptions;
export const notificationActionOptionsByModule: Readonly<Record<string, readonly string[]>> =
  sharedPermissionMatrix.notificationActionOptionsByModule;
export const notificationChannelOptions: readonly string[] = sharedPermissionMatrix.notificationChannelOptions;
export const systemOptionSets: Readonly<{
  appTypes: readonly string[];
  deployTargets: readonly string[];
  mcpToolTypes: readonly string[];
  riskLevels: readonly string[];
  lifecycleStatuses: readonly string[];
  logStatuses: readonly string[];
}> = sharedPermissionMatrix.systemOptionSets;
export const systemCodePrefixes: Readonly<Record<string, string>> = sharedPermissionMatrix.systemCodePrefixes;
export const systemPageBehavior: Readonly<{
  readOnlyPages: readonly string[];
  nonCreatablePages: readonly string[];
  createBlockedMessages: Readonly<Record<string, string>>;
}> = sharedPermissionMatrix.systemPageBehavior;

export type RoleDefault = {
  code: string;
  name: string;
  owner: string;
  status: string;
  aliases: readonly string[];
  permissionCodes: readonly string[];
  description: string;
};

export const roleDefaults: readonly RoleDefault[] = sharedPermissionMatrix.roleDefaults;

export type OperationPermissionRouteRule = {
  module: string;
  actions: readonly string[];
  permissionKey: keyof typeof operationPermissionCodes;
};

export const operationPermissionRouteRules: readonly OperationPermissionRouteRule[] =
  sharedPermissionMatrix.operationPermissionRouteRules;

export type PermissionOperationImpact = {
  module: string;
  label: string;
  description: string;
  path: string;
};

export const permissionOperationImpactMap: Readonly<Record<string, readonly PermissionOperationImpact[]>> =
  sharedPermissionMatrix.permissionOperationImpactMap;

export function routeModulePermission(
  permissionMap: Readonly<Record<string, string>>,
  moduleKey: string,
) {
  return permissionMap[moduleKey] || '';
}
