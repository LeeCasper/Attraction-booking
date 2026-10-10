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
import { BUSINESS_TZ_FOR_DECORATOR, addDaysStr, businessToday } from '../common/utils/date.util';
import { buildCapacityLevels } from '../common/utils/capacity.util';
import { SysConfigService } from '../modules/system/sys-config.service';
import { DEFAULT_CAPACITY_ALARM } from '../common/constants/config-defaults';

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
    private readonly sysConfig: SysConfigService,
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
      // 阈值来自 sys_config，**按次读**（不能提成模块级常量：配置改了就读不到了）。
      // 代价是后台改阈值后最多 1 个检查周期（60s）生效 —— 已写进操作手册。
      const capacityCfg = await this.sysConfig.get('capacity_alarm', DEFAULT_CAPACITY_ALARM);
      const levels = buildCapacityLevels(capacityCfg);

      const areas = await this.areaRepo.find({ where: { status: 1 } });
      const today = businessToday();

      for (const area of areas) {
        if (!area.maxCapacity || area.maxCapacity <= 0) continue;

        const current = await this.presence.current(Number(area.id));
        const rate = current / area.maxCapacity;

        for (const lv of levels) {
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
  // 显式指定业务时区：@Cron 默认按**进程时区**触发，容器化后可能变成 UTC，
  // 那样日结/对账会在错误的时刻跑（`30 0 * * *` 会变成北京 08:30）。
  // ⚠️ 装饰器在 import 期求值，早于 `.env` 加载，所以这里只能用默认值常量。
  @Cron('0 8 * * *', { timeZone: BUSINESS_TZ_FOR_DECORATOR })
  async dailyReconciliation() {
    try {
      const yesterday = addDaysStr(businessToday(), -1);
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
  @Cron('0 3 * * *', { timeZone: BUSINESS_TZ_FOR_DECORATOR })
  async dailyBackup() {
    try {
      await this.backup.run('auto');
    } catch (err) {
      this.logger.error(`自动备份失败：${(err as Error).message}`);
    }
  }
}
