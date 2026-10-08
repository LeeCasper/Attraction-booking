declare namespace Api {
  /**
   * namespace Scenic
   *
   * 景区模块：景区信息、公告（对应服务端 /api/admin/scenic）
   */
  namespace Scenic {
    /** 景区 */
    interface Area {
      id: number;
      name: string;
      address: string | null;
      intro: string | null;
      coverUrl: string | null;
      /** 开放时间描述，如 08:00-17:00 */
      openTime: string | null;
      /** 最大承载量（承载率预警基准） */
      maxCapacity: number;
      /** 1 开放 / 2 关闭 */
      status: number;
      createdAt: string;
      updatedAt: string;
    }

    /** 新建/修改景区提交体 */
    interface AreaPayload {
      name: string;
      address?: string;
      intro?: string;
      openTime?: string;
      maxCapacity?: number;
      /** 1 开放 / 2 关闭 */
      status?: number;
    }

    /** 公告 */
    interface Announcement {
      id: number;
      scenicAreaId: number;
      title: string;
      content: string | null;
      /** 1 已发布 / 2 下架 */
      status: number;
      publishedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }

    /** 新建/修改公告提交体 */
    interface AnnouncementPayload {
      title: string;
      content?: string;
      status?: number;
    }
  }
}
