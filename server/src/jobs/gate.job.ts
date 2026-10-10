import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { GateService } from '../modules/gate/gate.service';
import { PresenceService } from '../modules/verify/presence.service';
import { StatsService } from '../modules/stats/stats.service';
import { ScenicArea } from '../database/entities/scenic.entity';
import { BUSINESS_TZ_FOR_DECORATOR, addDaysStr, businessToday } from '../common/utils/date.util';

/**
 * 闸机与客流相关定时任务
 *
 * - 30s：心跳超时巡检（闸机离线告警）
 * - 5min：在园人数以通行记录校准（Redis 计数长期运行会漂移）
 * - 每日 00:30：重算前一日统计（设计文档 §6.3.2 经营分析数据源）
 */
@Injectable()
export class GateJob {
  private readonly logger = new Logger(GateJob.name);
  private heartbeatRunning = false;
  private calibrateRunning = false;

  constructor(
    private readonly gateService: GateService,
    private readonly presence: PresenceService,
    private readonly statsService: StatsService,
    private readonly dataSource: DataSource,
  ) {}

  @Interval(30_000)
  async checkGateHeartbeat() {
    if (this.heartbeatRunning) return;
    this.heartbeatRunning = true;
    try {
      const offline = await this.gateService.checkHeartbeatTimeout();
      if (offline > 0) this.logger.warn(`${offline} 台闸机心跳超时，已标记离线并告警`);
    } catch (err) {
      this.logger.error(`心跳巡检失败：${(err as Error).message}`);
    } finally {
      this.heartbeatRunning = false;
    }
  }

  @Interval(300_000)
  async calibratePresence() {
    if (this.calibrateRunning) return;
    this.calibrateRunning = true;
    try {
      const areas = await this.dataSource.getRepository(ScenicArea).find({ where: { status: 1 } });
      for (const area of areas) {
        await this.presence.calibrate(Number(area.id));
      }
    } catch (err) {
      this.logger.error(`在园人数校准失败：${(err as Error).message}`);
    } finally {
      this.calibrateRunning = false;
    }
  }

  /** 每日 00:30 重算前一日统计 */
  // 显式指定业务时区：@Cron 默认按**进程时区**触发，容器化后可能变成 UTC，
  // 那样日结/对账会在错误的时刻跑（`30 0 * * *` 会变成北京 08:30）。
  // ⚠️ 装饰器在 import 期求值，早于 `.env` 加载，所以这里只能用默认值常量。
  @Cron('30 0 * * *', { timeZone: BUSINESS_TZ_FOR_DECORATOR })
  async rebuildYesterdayStats() {
    try {
      const yesterday = addDaysStr(businessToday(), -1);
      const areas = await this.dataSource.getRepository(ScenicArea).find();
      for (const area of areas) {
        await this.statsService.rebuildDaily(Number(area.id), yesterday);
      }
      this.logger.log(`已重算 ${yesterday} 日统计（${areas.length} 个景区）`);
    } catch (err) {
      this.logger.error(`日统计重算失败：${(err as Error).message}`);
    }
  }
}
