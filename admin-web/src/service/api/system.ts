import { request } from '../request';

// ============ 角色权限 ============

/** 角色列表（含权限） */
export function fetchGetRoles() {
  return request<Api.System.Role[]>({
    url: '/admin/roles',
    method: 'get'
  });
}

/** 新建角色 */
export function fetchCreateRole(data: Api.System.RolePayload) {
  return request<{ id: number }>({
    url: '/admin/roles',
    method: 'post',
    data
  });
}

/** 修改角色 */
export function fetchUpdateRole(id: number, data: Partial<Api.System.RolePayload> & { status?: number }) {
  return request<null>({
    url: `/admin/roles/${id}`,
    method: 'put',
    data
  });
}

/** 分配角色权限（整体替换） */
export function fetchAssignRolePermissions(id: number, permissions: string[]) {
  return request<null>({
    url: `/admin/roles/${id}/permissions`,
    method: 'put',
    data: { permissions }
  });
}

/** 删除角色 */
export function fetchDeleteRole(id: number) {
  return request<null>({
    url: `/admin/roles/${id}`,
    method: 'delete'
  });
}

// ============ 管理员 ============

/** 管理员列表 */
export function fetchGetAdminUsers(params: Api.System.AdminUserSearchParams) {
  return request<Api.Common.BackendPageRecord<Api.System.AdminUser>>({
    url: '/admin/admin-users',
    method: 'get',
    params
  });
}

/** 新建管理员 */
export function fetchCreateAdminUser(data: Api.System.AdminUserPayload) {
  return request<{ id: number }>({
    url: '/admin/admin-users',
    method: 'post',
    data
  });
}

/** 修改管理员（含角色分配、启用禁用） */
export function fetchUpdateAdminUser(id: number, data: Api.System.AdminUserUpdatePayload) {
  return request<null>({
    url: `/admin/admin-users/${id}`,
    method: 'put',
    data
  });
}

/** 重置管理员密码 */
export function fetchResetAdminPassword(id: number, newPassword: string) {
  return request<null>({
    url: `/admin/admin-users/${id}/password`,
    method: 'put',
    data: { newPassword }
  });
}

/** 删除管理员 */
export function fetchDeleteAdminUser(id: number) {
  return request<null>({
    url: `/admin/admin-users/${id}`,
    method: 'delete'
  });
}

// ============ 操作日志 ============

/** 操作日志查询 */
export function fetchGetOperationLogs(params: Api.System.OperationLogSearchParams) {
  return request<Api.Common.BackendPageRecord<Api.System.OperationLog>>({
    url: '/admin/logs/operations',
    method: 'get',
    params
  });
}

// ============ 参数配置 ============

/** 参数配置列表 */
export function fetchGetConfigs() {
  return request<Api.System.Config[]>({
    url: '/admin/configs',
    method: 'get'
  });
}

/** 更新参数配置 */
export function fetchUpdateConfig(key: string, configValue: Record<string, unknown>) {
  return request<null>({
    url: `/admin/configs/${key}`,
    method: 'put',
    data: { configValue }
  });
}
