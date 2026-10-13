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
      /** 封面（相对路径）：小程序景点列表卡 / 首页「推荐景点」卡 */
      coverUrl: string | null;
      /** 首页轮播图（相对路径）；空则小程序里回落到封面 */
      bannerUrl: string | null;
      /** 缩略图（相对路径，建议方图）：小程序购票页头卡；空则回落到封面 */
      thumbnailUrl: string | null;
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
      /**
       * 封面图：上传接口返回的**相对路径**（`/uploads/xxx.jpg`），不是完整 URL。
       * ⚠️ 清空要传 `null`（不是省略）—— 省略等于「不改动」，后端会保留原值。
       */
      coverUrl?: string | null;
      /** 首页轮播图（同封面口径）；null = 清空（小程序里回落封面） */
      bannerUrl?: string | null;
      /** 购票页头卡缩略图（同封面口径）；null = 清空（回落封面） */
      thumbnailUrl?: string | null;
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

    /** 图片上传结果 */
    interface UploadResult {
      /** 相对路径，直接存进封面/轮播图/缩略图之中对应的那个字段 */
      url: string;
      size: number;
      mimeType: string;
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

    /** 公告（提示/弹窗两种形态） */
    interface Announcement {
      id: number;
      /** 归属景点；null = 全平台投放 */
      scenicAreaId: number | null;
      /** 1 提示公告 / 2 弹窗公告 */
      type: number;
      title: string;
      content: string | null;
      /** 弹窗配图（相对路径）；仅弹窗公告用 */
      imageUrl: string | null;
      /** 跳转：0 不跳转 / 1 购票页 / 2 订单列表 / 3 电子凭证 / 4 景区地图 */
      linkType: number;
      /** 1 已发布 / 2 下架 */
      status: number;
      /** 排序：小的在前 */
      sort: number;
      /** 生效开始/结束；null = 不限 */
      startAt: string | null;
      endAt: string | null;
      publishedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }

    /** 公告列表查询（`scope` 三态：全部 / 只看全平台 / 某个景点） */
    interface AnnouncementQuery {
      scope?: 'all' | 'platform' | 'scenic';
      scenicAreaId?: number | null;
      type?: number | null;
      status?: number | null;
    }

    /**
     * 新建/修改公告提交体。
     * ⚠️ 要**清空**某个字段（改成全平台、去掉配图、去掉生效时间）必须传 `null`：
     * 后端 `repo.update` 忽略 `undefined`，省略等于保持原值。
     */
    interface AnnouncementPayload {
      scenicAreaId?: number | null;
      type?: number;
      title?: string;
      content?: string | null;
      imageUrl?: string | null;
      linkType?: number;
      sort?: number;
      startAt?: string | null;
      endAt?: string | null;
      status?: number;
    }

    /**
     * 首页轮播图。
     *
     * 与景点**解耦**：后台「内容管理 → 首页轮播图」单独维护一组（增删/排序/启停）。
     * 每张可选跳转到某个景点 —— 有跳转时小程序那屏显示该景点的名字与在园率、点了进它的购票页；
     * 没有跳转时显示这张图自己的标题/副标题，且**不可点**。
     */
    interface Banner {
      id: number;
      /** 标题：**没有跳转景点时**显示在图上 */
      title: string | null;
      subtitle: string | null;
      /** 轮播图（相对路径 `/uploads/x.jpg`） */
      imageUrl: string;
      /** 跳转景点；null = 不跳转，只展示图 */
      scenicAreaId: number | null;
      /** 排序：小的在前 */
      sort: number;
      /** 1 启用 / 2 停用 */
      status: number;
      createdAt: string;
      updatedAt: string;
    }

    /** 新建/修改轮播图提交体 */
    interface BannerPayload {
      imageUrl: string;
      title?: string;
      subtitle?: string;
      /** 传 `null` = 清空跳转（`undefined` 会被后端当成「不改动」） */
      scenicAreaId?: number | null;
      sort?: number;
      status?: number;
    }
  }
}
