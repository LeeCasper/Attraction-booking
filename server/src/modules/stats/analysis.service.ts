import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderStatus, ReservationStatus } from '../../common/enums/status.enum';
import { addDaysStr, businessDate, diffDays } from '../../common/utils/date.util';
import { areaCondition } from '../../common/utils/sql.util';

/**
 * 运营分析（设计文档 §6.3.2）
 *
 * 口径说明（与财务对账保持一致）：
 * - 「预约侧」指标按**预约日期**（reservation.date）归集：预约人数、核销人数、爽约
 * - 「资金侧」指标按**支付时间**（orders.pay_time）归集：收入、退款
 * - 二者日期口径不同，跨月对比时需注意
 */
@Injectable()
export class AnalysisService {
  constructor(private readonly dataSource: DataSource) {}

  /** 预约与经营趋势（按日） */
  async trend(areaId: number | undefined, start: string, end: string) {
    const area = areaCondition(areaId, 'r.scenic_area_id');
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT r.date AS date,
              COUNT(DISTINCT r.order_id) AS orders,
              COALESCE(SUM(r.total_count), 0) AS reserved,
              COALESCE(SUM(r.verify_count), 0) AS verified,
              COALESCE(SUM(CASE WHEN o.status IN (?, ?, ?) THEN o.amount ELSE 0 END), 0) AS income
         FROM reservation r
         JOIN orders o ON o.id = r.order_id
        WHERE ${area.sql} AND r.date BETWEEN ? AND ?
          AND o.status NOT IN (?, ?)
        GROUP BY r.date
        ORDER BY r.date`,
      [
        OrderStatus.PAID,
        OrderStatus.PARTIAL_VERIFIED,
        OrderStatus.VERIFIED,
        ...area.params,
        start,
        end,
        OrderStatus.CANCELLED,
        OrderStatus.PENDING_PAY,
      ],
    );

    const refunds: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT DATE(f.refunded_at) AS date, COUNT(*) AS cnt, COALESCE(SUM(f.actual_amount), 0) AS amount
         FROM refund f
         JOIN orders o ON o.id = f.order_id
        WHERE ${areaCondition(areaId, 'o.scenic_area_id').sql} AND f.status = ?
          AND DATE(f.refunded_at) BETWEEN ? AND ?
        GROUP BY DATE(f.refunded_at)`,
      [...areaCondition(areaId, 'o.scenic_area_id').params, 30, start, end],
    );

    return this.fillDateRange(start, end).map((date) => {
      const r = rows.find((x) => this.toDate(x.date) === date);
      const f = refunds.find((x) => this.toDate(x.date) === date);
      const reserved = Number(r?.reserved ?? 0);
      const verified = Number(r?.verified ?? 0);
      return {
        date,
        orders: Number(r?.orders ?? 0),
        reserved,
        verified,
        verifyRate: reserved > 0 ? Number((verified / reserved).toFixed(4)) : 0,
        income: Number(r?.income ?? 0),
        refundCount: Number(f?.cnt ?? 0),
        refundAmount: Number(f?.amount ?? 0),
      };
    });
  }

  /** 转化指标：核销率 / 退单率 / 爽约率 */
  async conversion(areaId: number | undefined, start: string, end: string) {
    const [base]: { reserved: string; verified: string; expired: string }[] =
      await this.dataSource.query(
        `SELECT COALESCE(SUM(r.total_count), 0) AS reserved,
                COALESCE(SUM(r.verify_count), 0) AS verified,
                COALESCE(SUM(CASE WHEN r.date < CURDATE() AND r.verify_count = 0 THEN r.total_count ELSE 0 END), 0) AS expired
           FROM reservation r
           JOIN orders o ON o.id = r.order_id
          WHERE ${areaCondition(areaId, 'r.scenic_area_id').sql} AND r.date BETWEEN ? AND ?
            AND o.status NOT IN (?, ?)`,
        [...areaCondition(areaId, 'r.scenic_area_id').params, start, end, OrderStatus.CANCELLED, OrderStatus.PENDING_PAY],
      );

    const [orders]: { paid: string; refunded: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS paid,
              SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS refunded
         FROM orders
        WHERE ${areaCondition(areaId, 'scenic_area_id').sql} AND status >= ?
          AND DATE(pay_time) BETWEEN ? AND ?`,
      [OrderStatus.REFUNDED, ...areaCondition(areaId, 'scenic_area_id').params, OrderStatus.PAID, start, end],
    );

    const reserved = Number(base?.reserved ?? 0);
    const verified = Number(base?.verified ?? 0);
    const expired = Number(base?.expired ?? 0);
    const paid = Number(orders?.paid ?? 0);
    const refunded = Number(orders?.refunded ?? 0);

    const rate = (n: number, d: number) => (d > 0 ? Number((n / d).toFixed(4)) : 0);

    return {
      range: { start, end },
      reserved,
      verified,
      expired,
      paidOrders: paid,
      refundedOrders: refunded,
      /** 核销率 = 已核销人数 / 预约人数 */
      verifyRate: rate(verified, reserved),
      /** 爽约率 = 过期未核销人数 / 预约人数 */
      noShowRate: rate(expired, reserved),
      /** 退单率 = 退款订单数 / 已支付订单数 */
      refundRate: rate(refunded, paid),
    };
  }

  /** 客流分析：分时 / 日 / 月 */
  async traffic(
    areaId: number | undefined,
    start: string,
    end: string,
    granularity: 'hour' | 'day' | 'month',
  ) {
    const format = granularity === 'hour' ? '%H' : granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT DATE_FORMAT(passed_at, ?) AS bucket,
              SUM(CASE WHEN direction = 1 AND result IN (1, 4) THEN 1 ELSE 0 END) AS inCount,
              SUM(CASE WHEN direction = 2 AND result IN (1, 4) THEN 1 ELSE 0 END) AS outCount,
              SUM(CASE WHEN result = 2 THEN 1 ELSE 0 END) AS rejected
         FROM passage_record
        WHERE ${areaCondition(areaId, 'scenic_area_id').sql} AND DATE(passed_at) BETWEEN ? AND ?
        GROUP BY bucket
        ORDER BY bucket`,
      [format, ...areaCondition(areaId, 'scenic_area_id').params, start, end],
    );

    return rows.map((r) => ({
      bucket: String(r.bucket),
      inCount: Number(r.inCount ?? 0),
      outCount: Number(r.outCount ?? 0),
      rejected: Number(r.rejected ?? 0),
    }));
  }

  /** 票种分析：销量、收入、占比 */
  async byTicketType(areaId: number | undefined, start: string, end: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT tt.id, tt.name,
              COUNT(oi.id) AS sold,
              COALESCE(SUM(CASE WHEN oi.status = 20 THEN 1 ELSE 0 END), 0) AS verified,
              COALESCE(SUM(oi.price), 0) AS amount
         FROM order_item oi
         JOIN orders o ON o.id = oi.order_id
         JOIN reservation r ON r.id = o.reservation_id
         JOIN ticket_type tt ON tt.id = oi.ticket_type_id
        WHERE ${areaCondition(areaId, 'r.scenic_area_id').sql} AND r.date BETWEEN ? AND ?
          AND o.status NOT IN (?, ?, ?)
        GROUP BY tt.id, tt.name
        ORDER BY sold DESC`,
      [
        ...areaCondition(areaId, 'r.scenic_area_id').params,
        start,
        end,
        OrderStatus.CANCELLED,
        OrderStatus.PENDING_PAY,
        OrderStatus.REFUNDED,
      ],
    );

    const totalSold = rows.reduce((s, r) => s + Number(r.sold ?? 0), 0);
    const totalAmount = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

    return rows.map((r) => ({
      ticketTypeId: Number(r.id),
      name: String(r.name),
      sold: Number(r.sold ?? 0),
      verified: Number(r.verified ?? 0),
      amount: Number(r.amount ?? 0),
      soldRatio: totalSold > 0 ? Number((Number(r.sold) / totalSold).toFixed(4)) : 0,
      amountRatio: totalAmount > 0 ? Number((Number(r.amount) / totalAmount).toFixed(4)) : 0,
    }));
  }

  /** 渠道分析：订单量、核销、金额 */
  async byChannel(areaId: number | undefined, start: string, end: string) {
    const sub = areaCondition(areaId, 'o2.scenic_area_id');
    const main = areaCondition(areaId, 'o.scenic_area_id');
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT o.channel,
              COUNT(DISTINCT o.id) AS orders,
              COALESCE(SUM(o.amount), 0) AS amount,
              (SELECT COUNT(*) FROM verification v WHERE v.reservation_id IN (
                  SELECT r2.id FROM reservation r2 WHERE r2.order_id IN (
                    SELECT o2.id FROM orders o2
                     WHERE o2.channel = o.channel AND ${sub.sql}
                  ) AND r2.date BETWEEN ? AND ?
              )) AS verifications
         FROM orders o
        WHERE ${main.sql} AND DATE(o.pay_time) BETWEEN ? AND ? AND o.status >= ?
        GROUP BY o.channel`,
      [...sub.params, start, end, ...main.params, start, end, OrderStatus.PAID],
    );

    return rows.map((r) => ({
      channel: String(r.channel),
      orders: Number(r.orders ?? 0),
      amount: Number(r.amount ?? 0),
      verifications: Number(r.verifications ?? 0),
    }));
  }

  /** 财务分析：收入 / 退款 / 实收 */
  async finance(areaId: number | undefined, start: string, end: string) {
    const [income]: { cnt: string; amount: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amount
         FROM orders
        WHERE ${areaCondition(areaId, 'scenic_area_id').sql} AND status >= ?
          AND DATE(pay_time) BETWEEN ? AND ?`,
      [...areaCondition(areaId, 'scenic_area_id').params, OrderStatus.PAID, start, end],
    );

    const [refund]: { cnt: string; amount: string; fee: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(actual_amount), 0) AS amount, COALESCE(SUM(fee), 0) AS fee
         FROM refund
        WHERE status = 30 AND DATE(refunded_at) BETWEEN ? AND ?
          AND order_id IN (SELECT id FROM orders WHERE ${areaCondition(areaId, 'scenic_area_id').sql})`,
      [start, end, ...areaCondition(areaId, 'scenic_area_id').params],
    );

    const [today]: { amount: string }[] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS amount FROM orders
        WHERE ${areaCondition(areaId, 'scenic_area_id').sql} AND status >= ?
          AND DATE(pay_time) = CURDATE()`,
      [...areaCondition(areaId, 'scenic_area_id').params, OrderStatus.PAID],
    );

    const gross = Number(income?.amount ?? 0);
    const refunded = Number(refund?.amount ?? 0);

    return {
      range: { start, end },
      paidOrders: Number(income?.cnt ?? 0),
      /** 收入合计（分） */
      grossAmount: gross,
      refundCount: Number(refund?.cnt ?? 0),
      refundAmount: refunded,
      /** 手续费收入（不计入实收，仅统计） */
      refundFee: Number(refund?.fee ?? 0),
      /** 实收 = 收入 - 实退 */
      netAmount: gross - refunded,
      todayAmount: Number(today?.amount ?? 0),
    };
  }

  /** 填充日期区间（无数据补 0，便于前端画连续折线） */
  private fillDateRange(start: string, end: string): string[] {
    // 纯日历日序列，不碰本地时间（原来手写 getMonth/getDate，随进程时区漂移）
    const days: string[] = [];
    const span = Math.min(diffDays(start, end), 399);
    for (let i = 0; i <= span; i++) days.push(addDaysStr(start, i));
    return days;
  }

  private toDate(v: unknown): string {
    // 按业务时区格式化，不用本地 getMonth/getDate —— 后者随进程时区漂移
    if (v instanceof Date) return businessDate(v);
    return String(v).slice(0, 10);
  }
}
