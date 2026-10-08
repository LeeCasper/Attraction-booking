declare namespace Api {
  /**
   * namespace Ops
   *
   * 对账与备份（对应服务端 /api/admin/reconciliations/*、/api/admin/backups/*）
   */
  namespace Ops {
    /** 对账记录 */
    interface ReconciliationRow {
      id: number;
      date: string;
      channel: string;
      orderCount: number;
      /** 分 */
      orderAmount: number;
      paymentCount: number;
      paymentAmount: number;
      refundCount: number;
      refundAmount: number;
      diffCount: number;
      /** 10 无差异 / 20 存在差异 / 30 失败 */
      status: number;
      remark: string | null;
      createdAt: string;
    }

    /** 对账详情（含差异明细） */
    interface ReconciliationDetail extends ReconciliationRow {
      diffDetail: {
        missingPayment: { order_no: string; amount: number }[];
        amountMismatch: { order_no: string; order_amount: number; pay_amount: number }[];
        missingRefund: { order_no: string }[];
      } | null;
    }

    /** 备份记录 */
    interface BackupRow {
      id: number;
      fileName: string;
      filePath: string;
      fileSize: number;
      /** auto / manual */
      type: string;
      /** 10 进行中 / 20 成功 / 30 失败 */
      status: number;
      remark: string | null;
      createdBy: number | null;
      startedAt: string;
      finishedAt: string | null;
      createdAt: string;
    }
  }
}
