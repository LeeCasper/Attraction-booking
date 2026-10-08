import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reconciliation } from '../../database/entities/m4.entity';
import { Alarm } from '../../database/entities/verify.entity';
import { OrderStatus, RefundStatus } from '../../common/enums/status.enum';

/** 对账结果码：10 无差异 / 20 有差异 / 30 失败 */
const STATUS_OK = 10;
const STATUS_DIFF = 20;

/**
 * 三方对账（PRD A-062 / 设计文档 §6.4）
 *
 * 本地三方核对：订单（orders）↔ 支付流水（payment）↔ 退款（refund）
 * 目标是验收标准「订单、核销、通行、财务数据一致率 ≥ 99.9%」的度量手段。
 *
 * 与微信账单比对需商户证书（`/v3/bill/tradebook`），在 WXPAY_MOCK=false 时可用，
 * 见 `fetchWxBillPlaceholder` 的说明。
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Reconciliation) private readonly repo: Repository<Reconciliation>,
    @InjectRepository(Alarm) private readonly alarmRepo: Repository<Alarm>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 执行指定日期的三方对账（幂等，重复执行覆盖当日结果）
   */
  async run(areaId: number, date: string, channel = 'wxpay') {
    const [orderSide]: Record<string, string>[] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amount
         FROM orders
        WHERE scenic_area_id = ? AND status >= ? AND DATE(pay_time) = ?`,
      [areaId, OrderStatus.PAID, date],
    );

    const [paySide]: Record<string, string>[] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(p.amount), 0) AS amount
         FROM payment p
         JOIN orders o ON o.id = p.order_id
        WHERE o.scenic_area_id = ? AND p.status = 2 AND DATE(p.callback_time) = ?`,
      [areaId, date],
    );

    const [refundSide]: Record<string, string>[] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(f.actual_amount), 0) AS amount
         FROM refund f
         JOIN orders o ON o.id = f.order_id
        WHERE o.scenic_area_id = ? AND f.status = ? AND DATE(f.refunded_at) = ?`,
      [areaId, RefundStatus.REFUNDED, date],
    );

    // 差异明细一：已支付订单缺失成功支付流水（回调丢失且查单未补）
    const missingPayment: { order_no: string; amount: number }[] = await this.dataSource.query(
      `SELECT o.order_no, o.amount
         FROM orders o
         LEFT JOIN payment p ON p.order_id = o.id AND p.status = 2
        WHERE o.scenic_area_id = ? AND o.status >= ? AND DATE(o.pay_time) = ? AND p.id IS NULL
        LIMIT 100`,
      [areaId, OrderStatus.PAID, date],
    );

    // 差异明细二：支付流水金额与订单金额不符
    const amountMismatch: { order_no: string; order_amount: number; pay_amount: number }[] =
      await this.dataSource.query(
        `SELECT o.order_no, o.amount AS order_amount, p.amount AS pay_amount
           FROM orders o
           JOIN payment p ON p.order_id = o.id AND p.status = 2
          WHERE o.scenic_area_id = ? AND DATE(o.pay_time) = ? AND o.amount <> p.amount
          LIMIT 100`,
        [areaId, date],
      );

    // 差异明细三：已退款订单缺失退款单
    const missingRefund: { order_no: string }[] = await this.dataSource.query(
      `SELECT o.order_no
         FROM orders o
         LEFT JOIN refund f ON f.order_id = o.id AND f.status = ?
        WHERE o.scenic_area_id = ? AND o.status = ? AND DATE(o.pay_time) = ? AND f.id IS NULL
        LIMIT 100`,
      [RefundStatus.REFUNDED, areaId, OrderStatus.REFUNDED, date],
    );

    const diffDetail = {
      missingPayment,
      amountMismatch,
      missingRefund,
    };
    const diffCount = missingPayment.length + amountMismatch.length + missingRefund.length;

    const record = {
      orderCount: Number(orderSide?.cnt ?? 0),
      orderAmount: Number(orderSide?.amount ?? 0),
      paymentCount: Number(paySide?.cnt ?? 0),
      paymentAmount: Number(paySide?.amount ?? 0),
      refundCount: Number(refundSide?.cnt ?? 0),
      refundAmount: Number(refundSide?.amount ?? 0),
      diffCount,
      diffDetail,
      status: diffCount === 0 ? STATUS_OK : STATUS_DIFF,
      remark:
        diffCount === 0
          ? '三方数据一致'
          : `发现 ${diffCount} 处差异：缺支付流水 ${missingPayment.length}、金额不符 ${amountMismatch.length}、缺退款单 ${missingRefund.length}`,
    };

    await this.dataSource.query(
      `INSERT INTO reconciliation
         (date, channel, order_count, order_amount, payment_count, payment_amount,
          refund_count, refund_amount, diff_count, diff_detail, status, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         order_count=VALUES(order_count), order_amount=VALUES(order_amount),
         payment_count=VALUES(payment_count), payment_amount=VALUES(payment_amount),
         refund_count=VALUES(refund_count), refund_amount=VALUES(refund_amount),
         diff_count=VALUES(diff_count), diff_detail=VALUES(diff_detail),
         status=VALUES(status), remark=VALUES(remark)`,
      [
        date,
        channel,
        record.orderCount,
        record.orderAmount,
        record.paymentCount,
        record.paymentAmount,
        record.refundCount,
        record.refundAmount,
        diffCount,
        JSON.stringify(diffDetail),
        record.status,
        record.remark,
      ],
    );

    if (diffCount > 0) {
      await this.alarmRepo.insert({
        type: 'reconcile_diff',
        scenicAreaId: areaId,
        level: 3,
        status: 10,
        content: `${date} 对账发现 ${diffCount} 处差异：${record.remark}`,
        createdAt: new Date(),
      });
      this.logger.error(`对账差异 ${date}：${record.remark}`);
    } else {
      this.logger.log(`对账完成 ${date}：无差异（订单 ${record.orderCount} 笔）`);
    }

    return { date, channel, ...record };
  }

  /** 对账记录列表 */
  async list(page: number, pageSize: number, status?: number) {
    const [items, total] = await this.repo.findAndCount({
      where: status ? { status } : {},
      order: { date: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total };
  }

  /** 对账详情（含差异明细） */
  async detail(date: string, channel = 'wxpay') {
    return this.repo.findOne({ where: { date, channel } });
  }
}
