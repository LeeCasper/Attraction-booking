import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PresenceService } from '../modules/verify/presence.service';
import { ReconciliationService } from '../modules/stats/reconciliation.service';
import { BackupService } from '../modules/stats/backup.service';
import { ScenicArea } from '../database/entities/scenic.entity';
import { Alarm } from '../database/entities/verify.entity';
import { RedisClient, REDIS_CLIENT } from '../modules/redis/redis.constants';

/** 承载量分级预警阈值（PRD 6.3.3 / 设计文档 §5.7） */
const CAPACITY_LEVELS = [
  { rate: 1.0, type: 'capacity_100', level: 3, label: '100%' },
  { rate: 0.9, type: 'capacity_90', level: 3, label: '90%' },
  { rate: 0.8, type: 'capacity_80', level: 2, label: '80%' },
];

/**
 * M4 定时任务：承载量预警、每日对账、每日备份
 */
@Injectable()
export class StatsJob {
  private readonly logger = new Logger(StatsJob.name);
  private capacityRunning = false;

  constructor(
    @InjectRepository(ScenicArea) private readonly areaRepo: Repository<ScenicArea>,
    @InjectRepository(Alarm) private readonly alarmRepo: Repository<Alarm>,
    private readonly presence: PresenceService,
    private readonly reconciliation: ReconciliationService,
    private readonly backup: BackupService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  /**
   * 每 1 分钟检查承载量，达到 80%/90%/100% 分级告警
   *
   * 同一天同一景区同一等级只告警一次（Redis 标记），避免刷屏。
   */
  @Interval(60_000)
  async checkCapacity() {
    if (this.capacityRunning) return;
    this.capacityRunning = true;

    try {
      const areas = await this.areaRepo.find({ where: { status: 1 } });
      const today = new Date().toISOString().slice(0, 10);

      for (const area of areas) {
        if (!area.maxCapacity || area.maxCapacity <= 0) continue;

        const current = await this.presence.current(Number(area.id));
        const rate = current / area.maxCapacity;

        for (const lv of CAPACITY_LEVELS) {
          if (rate < lv.rate) continue;

          const key = `alarm:capacity:${area.id}:${today}:${lv.type}`;
          const first = await this.redis.set(key, '1', 'EX', 2 * 86400, 'NX');
          if (!first) break; // 该等级今日已告警，更低等级无需重复

          await this.alarmRepo.insert({
            type: lv.type,
            scenicAreaId: Number(area.id),
            level: lv.level,
            status: 10,
            content: `${area.name} 承载量达到 ${lv.label}：在园 ${current} / 上限 ${area.maxCapacity}`,
            createdAt: new Date(),
          });
          this.logger.warn(`承载量预警 ${area.name}：${current}/${area.maxCapacity}（${lv.label}）`);
          break; // 只报最高等级
        }
      }
    } catch (err) {
      this.logger.error(`承载量检查失败：${(err as Error).message}`);
    } finally {
      this.capacityRunning = false;
    }
  }

  /** 每日 08:00：对账前一日数据（回款到账后核对更准确） */
  @Cron('0 8 * * *')
  async dailyReconciliation() {
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const areas = await this.areaRepo.find();
      for (const area of areas) {
        await this.reconciliation.run(Number(area.id), yesterday);
      }
      this.logger.log(`已完成 ${yesterday} 对账（${areas.length} 个景区）`);
    } catch (err) {
      this.logger.error(`自动对账失败：${(err as Error).message}`);
    }
  }

  /** 每日 03:00：数据库备份 */
  @Cron('0 3 * * *')
  async dailyBackup() {
    try {
      await this.backup.run('auto');
    } catch (err) {
      this.logger.error(`自动备份失败：${(err as Error).message}`);
    }
  }
}
