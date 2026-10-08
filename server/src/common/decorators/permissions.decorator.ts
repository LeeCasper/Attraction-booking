import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * 声明接口所需权限，PermissionsGuard 校验。
 * 超管角色（code=super，权限含 *）自动放行。
 */
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
