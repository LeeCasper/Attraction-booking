declare namespace Api {
  /**
   * namespace Stats
   *
   * 数据看板与统计（对应服务端 /api/admin/dashboard/*、/api/admin/stats/*）
   */
  namespace Stats {
    /** 实时看板数据 */
    interface Realtime {
      date: string;
      /** 实时在园人数 */
      presence: number;
      maxCapacity: number;
      /** 承载率 0~1 */
      capacityRate: number;
      /** 今日预约人数 */
      reservedToday: number;
      /** 今日已核销人数 */
      verifiedToday: number;
      /** 核销率 0~1 */
      verifyRate: number;
      /** 今日核销笔数 */
      verificationCount: number;
      inToday: number;
      outToday: number;
      rejectedToday: number;
      orderCountToday: number;
      gateTotal: number;
      gateOnline: number;
      /** 闸机在线率 0~1 */
      gateOnlineRate: number;
      alarmPending: number;
      alarmCritical: number;
      channels: { channel: string; count: number; amount: number }[];
    }

    /** 分时趋势点 */
    interface HourlyPoint {
      hour: number;
      inCount: number;
      outCount: number;
      verifyCount: number;
    }

    /** 日统计行 */
    interface DailyRow {
      id: number;
      date: string;
      scenicAreaId: number;
      reservations: number;
      verifications: number;
      inCount: number;
      outCount: number;
      /** 实收（分） */
      income: number;
      refundAmount: number;
      ordersPaid: number;
      ordersRefund: number;
    }
  }
}
