declare namespace Api {
  /**
   * namespace Ticket
   *
   * 票务模块：票种、时段、价格日历、库存（对应服务端 /api/admin/ticket-types、/time-slots、/price-calendar、/stocks）
   */
  namespace Ticket {
    /** 票种 */
    interface TicketType {
      id: number;
      scenicAreaId: number;
      name: string;
      /** 适用人群 */
      audience: string | null;
      /** 基础价，单位：分 */
      basePrice: number;
      /** 退改规则 */
      refundRule: RefundRule | null;
      /** 是否实名（1 是 / 0 否） */
      needRealname: number;
      /** 1 上架 / 2 下架 */
      status: number;
      remark: string | null;
      createdAt: string;
      updatedAt: string;
    }

    /** 退改规则 */
    interface RefundRule {
      /** 提前 N 天免手续费 */
      beforeDay?: number;
      /** 手续费比例，如 0.2 */
      feeRate?: number;
      /** 过期不可退 */
      expiredNoRefund?: boolean;
    }

    /** 限购规则 */
    interface PurchaseRule {
      id?: number;
      ticketTypeId?: number;
      /** 单笔限购 */
      perUserPerOrder: number;
      /** 每人每日限购 */
      perUserPerDay: number;
      /** 每证每日限购 */
      perIdcardPerDay: number;
    }

    /** 分时时段 */
    interface TimeSlot {
      id: number;
      scenicAreaId: number;
      name: string;
      /** HH:mm:ss */
      startTime: string;
      endTime: string;
      sortOrder: number;
      status: number;
    }

    /** 票种详情 */
    interface TicketTypeDetail extends TicketType {
      purchaseRule: PurchaseRule | null;
      availableSlots: TimeSlot[];
    }

    /** 新建/修改票种提交体 */
    interface TicketTypePayload {
      scenicAreaId?: number;
      name: string;
      audience?: string;
      /** 分 */
      basePrice: number;
      refundRule?: RefundRule;
      needRealname?: number;
      status?: number;
      remark?: string;
      purchaseRule?: Partial<PurchaseRule>;
    }

    /** 新建/修改时段提交体 */
    interface TimeSlotPayload {
      scenicAreaId?: number;
      name: string;
      /** HH:mm */
      startTime: string;
      /** HH:mm */
      endTime: string;
      sortOrder?: number;
      status?: number;
    }

    /** 票种查询参数 */
    interface TicketTypeSearchParams {
      /** 景区 id */
      areaId: number | null;
      /** 是否包含已下架 */
      all?: boolean;
    }

    /** 价格日历 */
    interface PriceCalendar {
      id: number;
      ticketTypeId: number;
      /** yyyy-MM-dd */
      date: string;
      /** 分 */
      price: number;
    }

    /** 价格日历查询参数 */
    interface PriceCalendarSearchParams {
      ticketTypeId: number | null;
      start: string | null;
      end: string | null;
    }

    /** 分时库存（查询结果带剩余量与时段信息） */
    interface TicketStock {
      id: number;
      scenicAreaId: number;
      ticketTypeId: number;
      date: string;
      timeSlotId: number;
      /** 总库存 */
      total: number;
      /** 已售 */
      sold: number;
      /** 下单锁定 */
      locked: number;
      /** 剩余 = total - sold - locked */
      available: number;
      slotName: string;
      startTime: string;
      endTime: string;
    }

    /** 库存查询参数 */
    interface StockSearchParams {
      ticketTypeId: number | null;
      start: string;
      end: string;
    }

    /** 批量生成库存参数 */
    interface GenerateStockParams {
      ticketTypeId: number;
      startDate: string;
      endDate: string;
      total: number;
    }

    /** 库存调整参数 */
    interface AdjustStockParams {
      /** 变化量，可正可负 */
      changeValue: number;
      remark?: string;
    }

    /** 库存调整结果 */
    interface AdjustStockResult {
      id: number;
      total: number;
      sold: number;
      locked: number;
    }
  }
}
