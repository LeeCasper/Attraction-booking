declare namespace Api {
  /**
   * namespace Analysis
   *
   * 运营分析（对应服务端 /api/admin/analysis/*）
   *
   * 口径：预约侧指标（预约人数/核销/爽约）按**预约日期**归集；
   * 资金侧指标（收入/退款）按**支付时间**归集。
   */
  namespace Analysis {
    /** 日期区间参数 */
    interface RangeParams {
      areaId?: number;
      /** yyyy-MM-dd */
      start: string;
      end: string;
    }

    /** 趋势项（按日） */
    interface TrendPoint {
      date: string;
      orders: number;
      reserved: number;
      verified: number;
      verifyRate: number;
      income: number;
      refundCount: number;
      refundAmount: number;
    }

    /** 转化指标 */
    interface Conversion {
      range: { start: string; end: string };
      reserved: number;
      verified: number;
      expired: number;
      paidOrders: number;
      refundedOrders: number;
      /** 核销率 */
      verifyRate: number;
      /** 爽约率 */
      noShowRate: number;
      /** 退单率 */
      refundRate: number;
    }

    /** 客流点 */
    interface TrafficPoint {
      bucket: string;
      inCount: number;
      outCount: number;
      rejected: number;
    }

    /** 票种分析项 */
    interface TicketTypeStat {
      ticketTypeId: number;
      name: string;
      sold: number;
      verified: number;
      /** 分 */
      amount: number;
      soldRatio: number;
      amountRatio: number;
    }

    /** 渠道分析项 */
    interface ChannelStat {
      channel: string;
      orders: number;
      amount: number;
      verifications: number;
    }

    /** 财务分析 */
    interface Finance {
      range: { start: string; end: string };
      paidOrders: number;
      grossAmount: number;
      refundCount: number;
      refundAmount: number;
      refundFee: number;
      /** 实收 = 收入 - 实退 */
      netAmount: number;
      todayAmount: number;
    }

    /** 概览（一次拉取） */
    interface Overview {
      range: { start: string; end: string };
      conversion: Conversion;
      finance: Finance;
      ticketTypes: TicketTypeStat[];
      channels: ChannelStat[];
    }

    /** 导出类型 */
    type ExportType = 'orders' | 'verifications' | 'passages' | 'refunds' | 'daily';
  }
}
