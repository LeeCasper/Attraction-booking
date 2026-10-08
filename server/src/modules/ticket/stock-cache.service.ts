import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisClient, REDIS_CLIENT } from '../redis/redis.constants';
import { TicketStock } from '../../database/entities/ticket.entity';

/** 预减结果 */
export enum ReserveResult {
  /** 预减成功 */
  OK = 'ok',
  /** 库存不足 */
  INSUFFICIENT = 'insufficient',
  /** 缓存缺失且回源失败 */
  UNAVAILABLE = 'unavailable'
}

/** 缓存键：库存可用量（total - sold - locked） */
const key = (stockId: number | string) => `lock:stock:${stockId}`;

/** 缓存重建锁 */
const rebuildKey = (stockId: number | string) => `lock:stock:rebuild:${stockId}`;

/**
 * 库存缓存（设计文档 §4.2）
 *
 * Redis 只保存「可用量」用于快速拦截超卖请求，MySQL 乐观锁是最终防线：
 * - 下单：Lua 原子预减（不足直接失败，不触达 DB）
 * - 支付成功：locked→sold，可用量不变，无需同步
 * - 取消/退款/调增库存：可用量增加，INCRBY 回补
 * - 调减库存：可用量减少，DECRBY
 * 缓存缺失时经分布式锁回源 DB 重建，避免并发重建互相覆盖。
 */
@Injectable()
export class StockCacheService {
  private readonly logger = new Logger(StockCacheService.name);

  /** 预减脚本：-1 库存不足；-2 缓存缺失 */
  private static readonly RESERVE_LUA = `
    local avail = tonumber(redis.call('GET', KEYS[1]))
    if avail == nil then return -2 end
    local n = tonumber(ARGV[1])
    if avail < n then return -1 end
    redis.call('DECRBY', KEYS[1], n)
    return avail - n
  `;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @InjectRepository(TicketStock) private readonly stockRepo: Repository<TicketStock>,
  ) {}

  /** 初始化/重建缓存：available = total - sold - locked */
  async initStock(stockId: number): Promise<number | null> {
    const stock = await this.stockRepo.findOne({ where: { id: stockId } });
    if (!stock) return null;
    const available = stock.total - stock.sold - stock.locked;
    await this.redis.set(key(stockId), available);
    return available;
  }

  /** 读取缓存可用量（不存在返回 null） */
  async getCached(stockId: number): Promise<number | null> {
    const v = await this.redis.get(key(stockId));
    return v === null ? null : Number(v);
  }

  /**
   * 尝试预减库存（Lua 原子操作）
   *
   * @param stockId 库存记录 id
   * @param n 需要预减的数量
   */
  async tryReserve(stockId: number, n: number): Promise<{ result: ReserveResult; available?: number }> {
    const first = await this.evalReserve(stockId, n);
    if (first !== null) return first;

    // 缓存缺失：加锁回源重建后重试一次
    const locked = await this.redis.set(rebuildKey(stockId), '1', 'EX', 5, 'NX');
    if (locked) {
      try {
        await this.initStock(stockId);
      } finally {
        await this.redis.del(rebuildKey(stockId));
      }
    } else {
      // 其他实例正在重建，短暂等待
      await new Promise((r) => setTimeout(r, 30));
    }

    const retry = await this.evalReserve(stockId, n);
    return retry ?? { result: ReserveResult.UNAVAILABLE };
  }

  private async evalReserve(stockId: number, n: number): Promise<{ result: ReserveResult; available?: number } | null> {
    const res = (await this.redis.eval(StockCacheService.RESERVE_LUA, 1, key(stockId), n)) as number;
    if (res === -1) return { result: ReserveResult.INSUFFICIENT };
    if (res === -2) return null;
    return { result: ReserveResult.OK, available: res };
  }

  /** 回补可用量（取消订单、退款、调增库存） */
  async release(stockId: number, n: number): Promise<void> {
    await this.syncDelta(stockId, n);
  }

  /** 扣减可用量（调减库存；数量为负时用 release） */
  async consume(stockId: number, n: number): Promise<void> {
    await this.syncDelta(stockId, -n);
  }

  /**
   * 按增量同步缓存；键不存在时回源重建（重建后不再叠加，避免重复计数）
   */
  private async syncDelta(stockId: number, delta: number): Promise<void> {
    const exists = await this.redis.exists(key(stockId));
    if (!exists) {
      await this.initStock(stockId);
      return;
    }
    await this.redis.incrby(key(stockId), delta);
  }

  /** 库存调整后整体重算（管理端手动调整 total 时使用，保证不漂移） */
  async resync(stockId: number): Promise<void> {
    await this.initStock(stockId);
  }
}
