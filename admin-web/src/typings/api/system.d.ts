declare namespace Api {
  /**
   * namespace System
   *
   * 系统管理：角色权限、管理员、操作日志、参数配置
   * （对应服务端 /api/admin/roles、/admin-users、/logs、/configs）
   */
  namespace System {
    /** 角色 */
    interface Role {
      id: number;
      name: string;
      /** 角色标识：super/admin/checker/finance/ops/leader */
      code: string;
      remark: string | null;
      status: number;
      /** 权限标识集合，超管为 ['*'] */
      permissions: string[];
      createdAt?: string;
      updatedAt?: string;
    }

    /** 新建角色提交体 */
    interface RolePayload {
      name: string;
      code: string;
      remark?: string;
      permissions?: string[];
    }

    /** 管理员 */
    interface AdminUser {
      id: number;
      username: string;
      realName: string | null;
      phone: string | null;
      status: number;
      roles: string[];
      lastLoginAt: string | null;
      createdAt: string;
    }

    /** 管理员查询参数 */
    interface AdminUserSearchParams extends Api.Common.BackendPageParams {
      keyword?: string;
    }

    /** 新建管理员提交体 */
    interface AdminUserPayload {
      username: string;
      password: string;
      realName?: string;
      phone?: string;
      roleIds?: number[];
    }

    /** 修改管理员提交体 */
    interface AdminUserUpdatePayload {
      realName?: string;
      phone?: string;
      status?: number;
      roleIds?: number[];
    }

    /** 操作日志 */
    interface OperationLog {
      id: number;
      adminId: number;
      /** 操作标识，如 ticket:create、login */
      action: string;
      targetType: string | null;
      targetId: number | null;
      detail: Record<string, unknown> | null;
      ip: string | null;
      createdAt: string;
    }

    /** 操作日志查询参数 */
    interface OperationLogSearchParams extends Api.Common.BackendPageParams {
      adminId?: number | null;
      action?: string;
      start?: string | null;
      end?: string | null;
    }

    /** 参数配置 */
    interface Config {
      id: number;
      configKey: string;
      configValue: Record<string, unknown>;
      remark: string | null;
      updatedAt: string;
    }

    /** 权限树节点（用于角色权限分配） */
    interface PermissionNode {
      /** 权限标识，如 ticket:create */
      permission: string;
      label: string;
      children?: PermissionNode[];
    }
  }
}
