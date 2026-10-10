import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PresenceService } from '../verify/presence.service';
import { OrderStatus } from '../../common/enums/status.enum';
import { businessToday } from '../../common/utils/date.util';

/**
 * 统计与看板（设计文档 §6.3）
 *
 * 实时值优先走 Redis（在园人数）与轻量聚合查询，保证看板 <5s 延迟；
 * 历史统计由 daily_stats / hourly_stats 承载。
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presence: PresenceService,
  ) {}

  /**
   * 「按景区」的 SQL 条件片段。
   *
   * **不传 `areaId` = 全部景区**（看板聚合）。以前 controller 里写的是 `areaId ?? 1`，
   * 那会把「全部」**静默变成 1 号景区** —— 多景区下这就是错的。
   *
   * ⚠️ 注意拼进去的列名要带表别名（`r.scenic_area_id`），因为几个查询里都 join 了别的表 —
   * `orders` 也有 `scenic_area_id`，不带别名会歧义。
   */
  private areaCond(areaId: number | undefined, col = 'scenic_area_id'): { sql: string; params: number[] } {
    return areaId ? { sql: ` AND ${col} = ?`, params: [areaId] } : { sql: '', params: [] };
  }

  /**
   * 在园人数。不传 `areaId` 时**遍历所有开放景区相加** ——
   * `presence` 的 Redis key 是 `presence:{in|out}:{areaId}:{date}`，**没有全景区聚合键**。
   */
  private async presenceCounters(areaId?: number): Promise<{ inCount: number; outCount: number; current: number }> {
    if (areaId) return this.presence.todayCounters(areaId);
    const rows: { id: number }[] = await this.dataSource.query('SELECT id FROM scenic_area WHERE status = 1');
    const all = await Promise.all(rows.map((r) => this.presence.todayCounters(Number(r.id))));
    const inCount = all.reduce((s, c) => s + c.inCount, 0);
    const outCount = all.reduce((s, c) => s + c.outCount, 0);
    return { inCount, outCount, current: Math.max(0, inCount - outCount) };
  }

  /** 实时大屏数据。`areaId` 不传 = **全部景区**（看板聚合） */
  async realtime(areaId?: number) {
    const today = businessToday();
    const a = this.areaCond(areaId);
    const ar = this.areaCond(areaId, 'r.scenic_area_id');

    const [presence, reservationRows, verifyRows, passageRows, gateRows, alarmRows, channelRows] =
      await Promise.all([
        this.presenceCounters(areaId),
        // 今日预约人数（按预约单汇总应核销人数）
        this.dataSource.query(
          `SELECT COALESCE(SUM(r.total_count), 0) AS total,
                  COALESCE(SUM(r.verify_count), 0) AS verified,
                  COUNT(*) AS orders
             FROM reservation r JOIN orders o ON o.id = r.order_id
            WHERE r.date = ? AND o.status IN (?, ?, ?, ?)${ar.sql}`,
          [today, OrderStatus.PAID, OrderStatus.PARTIAL_VERIFIED, OrderStatus.VERIFIED, OrderStatus.PENDING_PAY, ...ar.params],
        ) as Promise<{ total: string; verified: string; orders: number }[]>,
        // 今日核销笔数
        this.dataSource.query(
          `SELECT COUNT(*) AS cnt FROM verification v
             JOIN reservation r ON r.id = v.reservation_id
            WHERE DATE(v.verify_time) = ?${ar.sql}`,
          [today, ...ar.params],
        ) as Promise<{ cnt: string }[]>,
        // 今日入园/出园
        this.dataSource.query(
          `SELECT direction, result, COUNT(*) AS cnt
             FROM passage_record
            WHERE DATE(passed_at) = ?${a.sql}
            GROUP BY direction, result`,
          [today, ...a.params],
        ) as Promise<{ direction: number; result: number; cnt: string }[]>,
        // 闸机在线率
        this.dataSource.query(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN status = 1 AND last_heartbeat > DATE_SUB(NOW(), INTERVAL 90 SECOND) THEN 1 ELSE 0 END) AS online
             FROM gate_device WHERE 1 = 1${a.sql}`,
          [...a.params],
        ) as Promise<{ total: number; online: string | null }[]>,
        // 未处理告警。单景区时要把「不挂景区的全局告警」也算进来；
        // 全部景区时只数一次 —— 否则全局告警会被重复计进每一个景区
        this.dataSource.query(
          areaId
            ? `SELECT COUNT(*) AS cnt, SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END) AS critical
                 FROM alarm WHERE status = 10 AND (scenic_area_id = ? OR scenic_area_id IS NULL)`
            : `SELECT COUNT(*) AS cnt, SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END) AS critical
                 FROM alarm WHERE status = 10`,
          areaId ? [areaId] : [],
        ) as Promise<{ cnt: string; critical: string | null }[]>,
        // 渠道来源
        this.dataSource.query(
          `SELECT channel, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amount
             FROM orders
            WHERE DATE(created_at) = ? AND status >= ?${a.sql}
            GROUP BY channel`,
          [today, OrderStatus.PAID, ...a.params],
        ) as Promise<{ channel: string; cnt: string; amount: string }[]>,
      ]);

    // 承载率的分母：单景区取自身；全部取所有开放景区的**容量之和**。
    // 分子是总在园、分母就必须是总容量 —— 「各景区先求率再平均」会被小景区放大，是错的。
    const capacity = areaId
      ? await this.dataSource.query('SELECT max_capacity FROM scenic_area WHERE id = ? LIMIT 1', [areaId])
      : await this.dataSource.query('SELECT SUM(max_capacity) AS max_capacity FROM scenic_area WHERE status = 1');
    const maxCapacity = Number(capacity?.[0]?.max_capacity ?? 0);

    const inToday = passageRows
      .filter((r) => r.direction === 1 && r.result === 1)
      .reduce((sum, r) => sum + Number(r.cnt), 0);
    const outToday = passageRows
      .filter((r) => r.direction === 2 && r.result === 1)
      .reduce((sum, r) => sum + Number(r.cnt), 0);
    const rejected = passageRows
      .filter((r) => r.result === 2)
      .reduce((sum, r) => sum + Number(r.cnt), 0);

    const gateTotal = Number(gateRows[0]?.total ?? 0);
    const gateOnline = Number(gateRows[0]?.online ?? 0);

    const reserved = Number(reservationRows[0]?.total ?? 0);
    const verified = Number(reservationRows[0]?.verified ?? 0);

    return {
      date: today,
      /** 当前统计范围；`null` 表示全部景区 */
      areaId: areaId ?? null,
      /** 实时在园人数 */
      presence: presence.current,
      maxCapacity,
      /** 承载率（0~1） */
      capacityRate: maxCapacity > 0 ? Number((presence.current / maxCapacity).toFixed(4)) : 0,
      /** 今日预约人数 / 已核销人数 / 核销率 */
      reservedToday: reserved,
      verifiedToday: verified,
      verifyRate: reserved > 0 ? Number((verified / reserved).toFixed(4)) : 0,
      /** 今日核销笔数（含重复核销尝试之外的成功笔数） */
      verificationCount: Number(verifyRows[0]?.cnt ?? 0),
      inToday,
      outToday,
      rejectedToday: rejected,
      orderCountToday: Number(reservationRows[0]?.orders ?? 0),
      /** 闸机在线率 */
      gateTotal,
      gateOnline,
      gateOnlineRate: gateTotal > 0 ? Number((gateOnline / gateTotal).toFixed(4)) : 1,
      /** 告警 */
      alarmPending: Number(alarmRows[0]?.cnt ?? 0),
      alarmCritical: Number(alarmRows[0]?.critical ?? 0),
      /** 渠道分布 */
      channels: channelRows.map((c) => ({
        channel: c.channel,
        count: Number(c.cnt),
        amount: Number(c.amount),
      })),
    };
  }

  /** 今日分时趋势（入园/出园/核销）。`areaId` 不传 = 全部景区 */
  async hourlyTrend(areaId?: number, date?: string) {
    const day = date ?? businessToday();
    const a = this.areaCond(areaId);
    const ar = this.areaCond(areaId, 'r.scenic_area_id');
    const passages: { hour: number; direction: number; cnt: string }[] = await this.dataSource.query(
      `SELECT HOUR(passed_at) AS hour, direction, COUNT(*) AS cnt
         FROM passage_record
        WHERE DATE(passed_at) = ? AND result = 1${a.sql}
        GROUP BY hour, direction
        ORDER BY hour`,
      [day, ...a.params],
    );
    const verifies: { hour: number; cnt: string }[] = await this.dataSource.query(
      `SELECT HOUR(v.verify_time) AS hour, COUNT(*) AS cnt
         FROM verification v JOIN reservation r ON r.id = v.reservation_id
        WHERE DATE(v.verify_time) = ?${ar.sql}
        GROUP BY hour ORDER BY hour`,
      [day, ...ar.params],
    );

    const hours = Array.from({ length: 24 }, (_, h) => h);
    return hours.map((h) => ({
      hour: h,
      inCount: Number(passages.find((p) => p.hour === h && p.direction === 1)?.cnt ?? 0),
      outCount: Number(passages.find((p) => p.hour === h && p.direction === 2)?.cnt ?? 0),
      verifyCount: Number(verifies.find((v) => v.hour === h)?.cnt ?? 0),
    }));
  }

  /** 日统计（读取 daily_stats）。`areaId` 不传 = 全部景区，按日期把各景区求和 */
  async daily(areaId: number | undefined, start: string, end: string) {
    if (areaId) {
      return this.dataSource.query(
        `SELECT * FROM daily_stats WHERE scenic_area_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
        [areaId, start, end],
      );
    }
    // daily_stats 是**按景区一行**；汇总只在读的时候 SUM，不影响逐景区重算。
    // `scenic_area_id` 回 NULL 只为保持行结构一致
    return this.dataSource.query(
      `SELECT NULL AS scenic_area_id, date,
              SUM(reservations) AS reservations, SUM(verifications) AS verifications,
              SUM(in_count) AS in_count, SUM(out_count) AS out_count,
              SUM(income) AS income, SUM(refund_amount) AS refund_amount,
              SUM(orders_paid) AS orders_paid, SUM(orders_refund) AS orders_refund
         FROM daily_stats WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
      [start, end],
    );
  }

  /**
   * 重算某日统计（幂等，可由定时任务或管理端手动触发）。
   * `areaId` 不传 = 全部开放景区**逐个重算** —— `daily_stats` 是「一景区一行」，
   * 汇总只发生在读的时候，不能把多景区写进同一行。
   */
  async rebuildDaily(areaId: number | undefined, date: string) {
    if (!areaId) {
      const rows: { id: number }[] = await this.dataSource.query('SELECT id FROM scenic_area WHERE status = 1');
      const rebuilt: number[] = [];
      for (const row of rows) {
        await this.rebuildDailyForArea(Number(row.id), date);
        rebuilt.push(Number(row.id));
      }
      return { date, areaId: null, rebuiltAreas: rebuilt };
    }
    return this.rebuildDailyForArea(areaId, date);
  }

  private async rebuildDailyForArea(areaId: number, date: string) {
    const rows = await this.dataSource.query(
      `SELECT
         (SELECT COALESCE(SUM(r.total_count),0) FROM reservation r JOIN orders o ON o.id=r.order_id
           WHERE r.scenic_area_id=? AND r.date=? AND o.status IN (?,?,?,?)) AS reservations,
         (SELECT COUNT(*) FROM verification v JOIN reservation r ON r.id=v.reservation_id
           WHERE r.scenic_area_id=? AND DATE(v.verify_time)=?) AS verifications,
         (SELECT COUNT(*) FROM passage_record WHERE scenic_area_id=? AND DATE(passed_at)=? AND direction=1 AND result=1) AS in_count,
         (SELECT COUNT(*) FROM passage_record WHERE scenic_area_id=? AND DATE(passed_at)=? AND direction=2 AND result=1) AS out_count,
         (SELECT COALESCE(SUM(amount),0) FROM orders WHERE scenic_area_id=? AND DATE(pay_time)=? AND status>=?) AS income,
         (SELECT COALESCE(SUM(amount),0) FROM refund WHERE order_id IN (SELECT id FROM orders WHERE scenic_area_id=?) AND DATE(refunded_at)=?) AS refund_amount,
         (SELECT COUNT(*) FROM orders WHERE scenic_area_id=? AND DATE(pay_time)=? AND status>=?) AS orders_paid,
         (SELECT COUNT(*) FROM refund WHERE DATE(refunded_at)=? AND order_id IN (SELECT id FROM orders WHERE scenic_area_id=?)) AS orders_refund`,
      [
        areaId, date, OrderStatus.PAID, OrderStatus.PARTIAL_VERIFIED, OrderStatus.VERIFIED, OrderStatus.PENDING_PAY,
        areaId, date,
        areaId, date,
        areaId, date,
        areaId, date, OrderStatus.PAID,
        areaId, date,
        areaId, date, OrderStatus.PAID,
        date, areaId,
      ],
    );

    const r = rows[0];
    await this.dataSource.query(
      `INSERT INTO daily_stats
         (date, scenic_area_id, reservations, verifications, in_count, out_count, income, refund_amount, orders_paid, orders_refund)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         reservations=VALUES(reservations), verifications=VALUES(verifications),
         in_count=VALUES(in_count), out_count=VALUES(out_count), income=VALUES(income),
         refund_amount=VALUES(refund_amount), orders_paid=VALUES(orders_paid), orders_refund=VALUES(orders_refund)`,
      [
        date,
        areaId,
        Number(r.reservations ?? 0),
        Number(r.verifications ?? 0),
        Number(r.in_count ?? 0),
        Number(r.out_count ?? 0),
        Number(r.income ?? 0),
        Number(r.refund_amount ?? 0),
        Number(r.orders_paid ?? 0),
        Number(r.orders_refund ?? 0),
      ],
    );

    return { date, areaId, rebuilt: true };
  }
}
