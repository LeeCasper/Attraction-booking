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

    /**
     * 有专用表单的配置键（见 `views/system/config/modules/config-schema.ts`）。
     * 不在这张表里的键会回落到 JSON 编辑器。
     */
    type ConfigKey = 'platform' | 'reservation' | 'capacity_alarm' | 'refund';

    /** 平台品牌与联系方式（与 `GET /api/mini/platform/settings` 同形状） */
    interface PlatformSettings {
      name: string;
      nameEn: string;
      subtitle: string;
      logoUrl?: string;
      contactPhone?: string;
      icp?: string;
      copyright?: string;
      /** 产品名，页脚渲染成「{name}{productName} {version}」 */
      productName?: string;
      /** 版本号，自带 V 前缀 */
      version?: string;
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
