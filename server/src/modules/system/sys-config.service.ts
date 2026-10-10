import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SysConfig } from '../../database/entities/system.entity';

/**
 * `sys_config` 的读取入口。
 *
 * 在它之前，`sys_config` 只被后台的 CRUD（`admin/config.controller.ts`）碰过 ——
 * 种子里那几行配置**没有任何读取者**，管理员在后台改了完全不生效。
 * 退改规则 / 承载量预警阈值 / 支付超时 / 平台信息现在都从这里读。
 *
 * ⚠️ **只能在方法体里读，绝不要提到模块级常量**（与 CLAUDE.md 约束 11 同源的问题）：
 * service 与 job 都是长生命周期对象，模块级常量会把值冻在进程启动那一刻，
 * 之后管理员怎么改都读不到。
 *
 * 这里**不加缓存**：调用点都是主键点查，相对其后的事务可忽略；加了反而要处理
 * 「配置改了一个实例知道、另一个实例不知道」的失效问题。代价是定时任务里的配置
 * 有 ≤1 个检查周期（60s）的生效延迟。
 */
@Injectable()
export class SysConfigService {
  constructor(@InjectRepository(SysConfig) private readonly repo: Repository<SysConfig>) {}

  /**
   * 读一条配置，**缺失字段用 fallback 补齐**。
   *
   * 配置是增量维护的：管理员可能只改其中一项，也可能（历史遗留）是旧的键集合。
   * 所以不能要求存的值写全，否则少一个键就会 `undefined` 漏进业务计算。
   */
  async get<T extends Record<string, unknown>>(key: string, fallback: T): Promise<T> {
    const row = await this.repo.findOne({ where: { configKey: key } });
    if (!row?.configValue) return fallback;
    return { ...fallback, ...(row.configValue as Partial<T>) } as T;
  }
}
