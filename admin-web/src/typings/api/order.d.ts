declare namespace Api {
  /**
   * namespace Order
   *
   * 订单与退款（对应服务端 /api/admin/orders、/api/admin/refunds）
   */
  namespace Order {
    /** 订单状态：与服务端 common/enums/status.enum.ts 一致 */
    type Status = 10 | 20 | 30 | 40 | 50 | 60 | 70;

    /** 订单列表行 */
    interface OrderRow {
      id: number;
      orderNo: string;
      userId: number;
      scenicAreaId: number;
      reservationId: number | null;
      /** 单位：分 */
      amount: number;
      status: Status;
      channel: string;
      payDeadline: string;
      payTime: string | null;
      cancelReason: string | null;
      createdAt: string;
      updatedAt: string;
      /** 票数 */
      itemCount: number;
      /** 预约日期 */
      reservationDate: string | null;
      timeSlotId: number | null;
    }

    /** 订单明细（含游客脱敏信息） */
    interface OrderItemRow {
      id: number;
      orderId: number;
      visitorId: number;
      ticketTypeId: number;
      price: number;
      status: number;
      visitorName: string;
      /** 脱敏证件号，如 110***********1234 */
      visitorIdCard: string;
      ticketName: string;
    }

    /** 订单详情 */
    interface OrderDetail extends OrderRow {
      reservation: {
        id: number;
        date: string;
        timeSlotId: number;
        status: number;
        verifyCount: number;
        totalCount: number;
      } | null;
      timeSlot: {
        id: number;
        name: string;
        startTime: string;
        endTime: string;
      } | null;
      items: OrderItemRow[];
    }

    /** 订单查询参数 */
    interface OrderSearchParams extends Api.Common.BackendPageParams {
      status?: number | null;
      orderNo?: string;
      phone?: string;
      /** 预约日期 yyyy-MM-dd */
      date?: string | null;
    }

    /** 退款单状态：10待审核 20退款中 30已退款 40已拒绝 50退款失败 */
    type RefundStatus = 10 | 20 | 30 | 40 | 50;

    /** 退款单 */
    interface RefundRow {
      id: number;
      refundNo: string;
      orderId: number;
      orderNo: string;
      orderAmount: number;
      userId: number;
      /** 申请金额（分） */
      amount: number;
      /** 实退金额（分） */
      actualAmount: number | null;
      /** 手续费（分） */
      fee: number;
      reason: string;
      status: RefundStatus;
      auditBy: number | null;
      auditRemark: string | null;
      wxRefundId: string | null;
      auditedAt: string | null;
      refundedAt: string | null;
      createdAt: string;
    }

    /** 退款查询参数 */
    interface RefundSearchParams extends Api.Common.BackendPageParams {
      status?: number | null;
    }

    /** 退款审核提交体 */
    interface RefundAuditPayload {
      approve: boolean;
      remark?: string;
    }
  }
}
