import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisClient, REDIS_CLIENT } from '../redis/redis.constants';
import { DataSource } from 'typeorm';

/**
 * 在园人数（设计文档 §6.4.6）
 *
 * 在园人数 = 累计入园 - 累计出园。
 * 实时值走 Redis 计数（看板直读，满足 <5s 延迟）；定时任务用 passage_record 校准，
 * 避免长时间运行后的计数漂移。
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly dataSource: DataSource,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private key(kind: 'in' | 'out', areaId: number, date = this.today()): string {
    return `presence:${kind}:${areaId}:${date}`;
  }

  /** 入园计数 */
  async onEnter(areaId: number, n = 1): Promise<number> {
    const key = this.key('in', areaId);
    await this.redis.incrby(key, n);
    await this.redis.expire(key, 2 * 86400);
    return this.current(areaId);
  }

  /** 出园计数 */
  async onExit(areaId: number, n = 1): Promise<number> {
    const key = this.key('out', areaId);
    await this.redis.incrby(key, n);
    await this.redis.expire(key, 2 * 86400);
    return this.current(areaId);
  }

  /** 当前在园人数（不小于 0） */
  async current(areaId: number, date = this.today()): Promise<number> {
    const [inCount, outCount] = await Promise.all([
      this.redis.get(this.key('in', areaId, date)),
      this.redis.get(this.key('out', areaId, date)),
    ]);
    return Math.max(0, Number(inCount ?? 0) - Number(outCount ?? 0));
  }

  /** 今日累计入园 / 出园 */
  async todayCounters(areaId: number): Promise<{ inCount: number; outCount: number; current: number }> {
    const [inCount, outCount] = await Promise.all([
      this.redis.get(this.key('in', areaId)),
      this.redis.get(this.key('out', areaId)),
    ]);
    const inN = Number(inCount ?? 0);
    const outN = Number(outCount ?? 0);
    return { inCount: inN, outCount: outN, current: Math.max(0, inN - outN) };
  }

  /**
   * 以 passage_record 为准校准 Redis 计数（每 5 分钟执行）
   *
   * 缓存键缺失或漂移时直接覆盖；返回校准前后差异便于告警观察。
   */
  async calibrate(areaId: number, date = this.today()): Promise<{ before: number; after: number }> {
    const rows: { direction: number; cnt: string }[] = await this.dataSource.query(
      `SELECT direction, COUNT(*) AS cnt
         FROM passage_record
        WHERE scenic_area_id = ? AND result = 1 AND DATE(passed_at) = ?
        GROUP BY direction`,
      [areaId, date],
    );

    const inDb = Number(rows.find((r) => r.direction === 1)?.cnt ?? 0);
    const outDb = Number(rows.find((r) => r.direction === 2)?.cnt ?? 0);
    const before = await this.current(areaId, date);

    await this.redis.set(this.key('in', areaId, date), inDb, 'EX', 2 * 86400);
    await this.redis.set(this.key('out', areaId, date), outDb, 'EX', 2 * 86400);

    const after = Math.max(0, inDb - outDb);
    if (before !== after) {
      this.logger.warn(`在园人数校准：${areaId} ${before} → ${after}`);
    }
    return { before, after };
  }
}
