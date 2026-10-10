import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TicketType, TimeSlot } from '../../database/entities/ticket.entity';
import { PurchaseRule } from './purchase-rule.entity';
import { StockService } from './stock.service';
import {
  DEFAULT_PURCHASE_RULE,
  DEFAULT_TICKET_REFUND_RULE,
  DEFAULT_TICKET_TYPES,
  DEFAULT_TIME_SLOTS,
} from '../../common/constants/scenic-defaults';
import { addDaysStr, businessToday } from '../../common/utils/date.util';

export interface GenerateDefaultsOptions {
  /** 生成多少天的库存（含今天） */
  days: number;
  /** 每个时段的库存张数 */
  slotStock: number;
  /** 操作人（写进 stock_change_log） */
  operatorId: number;
}

export interface GenerateDefaultsResult {
  /** 该景区现有（含本次新建）的时段数 */
  slots: number;
  /** 该景区现有（含本次新建）的票种数 */
  ticketTypes: number;
  /** 本次实际新增的库存行数 */
  stockCreated: number;
  /** 非空 = 库存那一步失败了，时段/票种仍在，可重跑补 */
  error?: string;
}

/**
 * 「新建景区时一键生成默认时段/票种/库存」。
 *
 * 为什么放在 ticket 模块、而不是塞进 `ScenicService`：时段/票种/限购/库存四个仓储都是
 * 票务域的东西，塞进景区服务会让它凭空长出一堆票务依赖。CLAUDE.md 写明「模块边界即未来
 * 微服务边界」，所以由 `ScenicModule` import `TicketModule` 来用（无环：TicketModule
 * 不反向依赖 ScenicModule）。
 */
@Injectable()
export class ScenicDefaultsService {
  private readonly logger = new Logger(ScenicDefaultsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
  ) {}

  /**
   * 幂等：已存在的时段 / 同名票种**复用**，只补缺失 —— 重跑一次什么都不新建
   * （对齐 `StockService.generate` 的「只新增缺失记录」语义）。
   */
  async generateFor(areaId: number, opts: GenerateDefaultsOptions): Promise<GenerateDefaultsResult> {
    const { days, slotStock, operatorId } = opts;

    // ---- 1. 配置层（时段 + 票种 + 限购规则）一个事务：要么都建好，要么都不建 ----
    const { slots, ticketTypes, stockTypeIds } = await this.dataSource.transaction(async (em) => {
      // 时段
      const existingSlots = await em.find(TimeSlot, { where: { scenicAreaId: areaId } });
      const slotNames = new Set(existingSlots.map((s) => s.name));
      for (const [i, s] of DEFAULT_TIME_SLOTS.entries()) {
        if (slotNames.has(s.name)) continue;
        await em.insert(TimeSlot, {
          scenicAreaId: areaId,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          sortOrder: i,
          status: 1,
        });
      }

      // 票种（按 name 复用 —— 景区内同名就认为同一张票）
      const existingTypes = await em.find(TicketType, { where: { scenicAreaId: areaId } });
      const idByName = new Map(existingTypes.map((t) => [t.name, Number(t.id)]));
      for (const t of DEFAULT_TICKET_TYPES) {
        if (idByName.has(t.name)) continue;
        const ins = await em.insert(TicketType, {
          scenicAreaId: areaId,
          name: t.name,
          audience: t.audience,
          basePrice: t.basePrice,
          saleUnit: t.saleUnit,
          refundRule: DEFAULT_TICKET_REFUND_RULE,
          needRealname: 1,
          status: 1,
          remark: '新建景区默认票种',
        });
        idByName.set(t.name, Number(ins.identifiers[0].id));
      }

      // 限购规则 + 取出**要生成库存的**默认票种 id。
      // 只处理默认票种，不碰管理员自己加的票种。
      // 按张卖的（`saleUnit === 'ticket'`，如四季家庭年卡）**跳过** ——
      // 它不分时入园、小程序也屏蔽了在线预约，给它建「每天每时段 N 张」纯属噪音。
      const stockTypeIds: number[] = [];
      for (const t of DEFAULT_TICKET_TYPES) {
        const typeId = idByName.get(t.name);
        if (!typeId) continue;
        const rule = await em.findOne(PurchaseRule, { where: { ticketTypeId: typeId } });
        if (!rule) await em.insert(PurchaseRule, { ticketTypeId: typeId, ...DEFAULT_PURCHASE_RULE });
        if (t.saleUnit === 'person') stockTypeIds.push(typeId);
      }

      const slotCount = await em.count(TimeSlot, { where: { scenicAreaId: areaId } });
      return { slots: slotCount, ticketTypes: idByName.size, stockTypeIds };
    });

    // ---- 2. 库存：在事务**提交之后**逐个票种生成 ----
    // `StockService.generate` 自己开事务（stock.service.ts），不能嵌进上面那个事务里。
    // 失败不回滚时段/票种 —— 空景区本来就是合法状态（用户明确要「也可以自己手动设置」），
    // 把已经建好的配置删掉反而更糟；把错误如实带回给后台提示即可。
    let stockCreated = 0;
    let error: string | undefined;
    try {
      const start = businessToday();
      const end = addDaysStr(start, Math.max(days, 1) - 1);
      for (const typeId of stockTypeIds) {
        const r = await this.stockService.generate(typeId, start, end, slotStock, operatorId);
        stockCreated += r.created;
      }
    } catch (err) {
      error = (err as Error).message;
      this.logger.error(`景区 ${areaId} 默认库存生成失败：${error}`);
    }

    return { slots, ticketTypes, stockCreated, error };
  }
}
