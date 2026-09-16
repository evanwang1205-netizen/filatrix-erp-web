import sharedPermissionMatrix from '../../shared/permission-matrix.json';

type PermissionDefault = {
  code: string;
  name: string;
};

export const permissionDisplayNames: Record<string, string> = Object.fromEntries(
  sharedPermissionMatrix.permissionDefaults.map((permission: PermissionDefault) => [permission.code, permission.name]),
);

export function permissionLabel(permissionCode: string) {
  const displayName = permissionDisplayNames[permissionCode];
  return displayName ? `${displayName}（${permissionCode}）` : permissionCode;
}
