declare namespace Api {
  /**
   * namespace Scenic
   *
   * 景区模块：景区信息、公告（对应服务端 /api/admin/scenic）
   */
  namespace Scenic {
    /**
     * 景点分类。与后端 `AREA_CATEGORIES`（`common/constants/scenic-defaults.ts`）
     * 和小程序端 `CATEGORIES` 三处必须逐字一致 —— 对不上就会出现「某个分类下没有景点」。
     */
    type AreaCategory = 'main' | 'nature' | 'culture' | 'cable' | 'night';

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
      /** 景点分类，决定小程序「景点选择」页归到哪个 tab；null = 未分类 */
      category: AreaCategory | null;
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
      /** 景点分类（小程序「景点选择」页的 tab）；不传 = 未分类 */
      category?: AreaCategory;
      /** 1 开放 / 2 关闭 */
      status?: number;
      /** —— 以下三项**仅新建时**生效，编辑时后端不会受理 —— */
      /** 一键生成默认时段/票种，并生成未来若干天的分时库存 */
      generateDefaults?: boolean;
      /** 生成库存的天数（含今天） */
      defaultStockDays?: number;
      /** 每个时段的库存张数 */
      defaultSlotStock?: number;
    }

    /** 一键生成默认时段/票种/库存的结果 */
    interface AreaDefaultsResult {
      /** 该景区现有（含本次新建）的时段数 */
      slots: number;
      /** 该景区现有（含本次新建）的票种数 */
      ticketTypes: number;
      /** 本次实际新增的库存行数 */
      stockCreated: number;
      /** 非空 = 库存那一步失败了，时段/票种仍在，可重跑补 */
      error?: string;
    }

    /** 新建景区返回 */
    interface CreateAreaResult {
      id: number;
      /** 未勾选「一键生成」时为 undefined */
      defaults?: AreaDefaultsResult;
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
