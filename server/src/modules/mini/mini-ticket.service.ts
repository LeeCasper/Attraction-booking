import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Announcement, ScenicArea } from '../../database/entities/scenic.entity';
import {
  PriceCalendar,
  TicketStock,
  TicketType,
  TimeSlot,
} from '../../database/entities/ticket.entity';
import { StockCacheService } from '../ticket/stock-cache.service';
import { PresenceService } from '../verify/presence.service';
import { businessToday } from '../../common/utils/date.util';

@Injectable()
export class MiniTicketService {
  constructor(
    @InjectRepository(ScenicArea) private readonly areaRepo: Repository<ScenicArea>,
    @InjectRepository(Announcement) private readonly annoRepo: Repository<Announcement>,
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    @InjectRepository(TicketStock) private readonly stockRepo: Repository<TicketStock>,
    @InjectRepository(PriceCalendar) private readonly priceRepo: Repository<PriceCalendar>,
    private readonly stockCache: StockCacheService,
    private readonly presence: PresenceService,
  ) {}

  /** 景区列表（仅开放中） */
  async listAreas() {
    const areas = await this.areaRepo.find({ where: { status: 1 }, order: { id: 'ASC' } });
    return areas.map((a) => ({
      id: a.id,
      name: a.name,
      coverUrl: a.coverUrl,
      // 轮播图 / 缩略图：没配就留空，由客户端逐级回落到封面（见 miniprogram 的 utils/area.ts）
      bannerUrl: a.bannerUrl,
      thumbnailUrl: a.thumbnailUrl,
      openTime: a.openTime,
      intro: a.intro,
    }));
  }

  /**
   * 景区列表 + 每个景点的「一览」数据（小程序「景点选择与预约」页用）。
   *
   * 那一页的卡片要显示**起价 / 今日余票 / 在园情况 / 分类**，其中前三样都不是
   * `scenic_area` 上的字段。逐景点各查一次就是 N+1（3N 次请求），所以在这里一次取回。
   *
   * 口径：
   *   - `minPrice` 只看**在线可售**的票种（`saleUnit === 'person'`）——「按张卖」的年卡
   *     进不了购票流程，把它算进「起价」会给出一个点不进去的价格
   *   - `remaining` 同理只汇总可售票种今日的分时余票
   *   - `capacityRate` 分母为 0 时取 0，与 `areaPresence()` 一致
   *   - `summary` 是**全部开放景点**的汇总（Σ在园 / Σ容量），口径与后台看板「全部景区」一致
   */
  async listAreasOverview() {
    const today = businessToday();
    const areas = await this.areaRepo.find({ where: { status: 1 }, order: { id: 'ASC' } });
    if (areas.length === 0) {
      return { areas: [], summary: { current: 0, maxCapacity: 0, capacityRate: 0 } };
    }

    const ids = areas.map((a) => Number(a.id));

    // 三个 `In(...)` 批量查询，**不要**按景点循环查库
    const [types, slots] = await Promise.all([
      this.typeRepo.find({ where: { scenicAreaId: In(ids), status: 1 }, order: { id: 'ASC' } }),
      this.slotRepo.find({ where: { scenicAreaId: In(ids), status: 1 } }),
    ]);
    const typeIds = types.map((t) => Number(t.id));
    const [stocks, calendars] = await Promise.all([
      typeIds.length ? this.stockRepo.find({ where: { ticketTypeId: In(typeIds), date: today } }) : [],
      typeIds.length ? this.priceRepo.find({ where: typeIds.map((id) => ({ ticketTypeId: id, date: today })) }) : [],
    ]);

    // 在园人数按景点读 Redis 计数（不是 DB），并发取回
    const currents = await Promise.all(ids.map((id) => this.presence.current(id)));

    const priceOf = (typeId: number, base: number) =>
      calendars.find((c) => Number(c.ticketTypeId) === typeId)?.price ?? base;

    let totalCurrent = 0;
    let totalCapacity = 0;

    const list = areas.map((area, i) => {
      const areaId = Number(area.id);
      const own = types.filter((t) => Number(t.scenicAreaId) === areaId);
      const sellable = own.filter((t) => t.saleUnit !== 'ticket');
      const sellableIds = new Set(sellable.map((t) => Number(t.id)));

      const prices = sellable.map((t) => priceOf(Number(t.id), t.basePrice));
      const remaining = stocks
        .filter((s) => sellableIds.has(Number(s.ticketTypeId)))
        .reduce((sum, s) => sum + (s.total - s.sold - s.locked), 0);

      const current = currents[i] ?? 0;
      const maxCapacity = Number(area.maxCapacity ?? 0);
      totalCurrent += current;
      totalCapacity += maxCapacity;

      return {
        id: area.id,
        name: area.name,
        coverUrl: area.coverUrl,
        bannerUrl: area.bannerUrl,
        thumbnailUrl: area.thumbnailUrl,
        openTime: area.openTime,
        intro: area.intro,
        category: area.category,
        presence: {
          current,
          maxCapacity,
          capacityRate: maxCapacity > 0 ? Number((current / maxCapacity).toFixed(4)) : 0,
        },
        /** 在线可售票种里的最低价（分）；没有可售票种时为 null */
        minPrice: prices.length ? Math.min(...prices) : null,
        /** 今日分时余票之和（仅可售票种） */
        remaining,
        /** 有没有启用中的时段 —— 客户端据此决定是否显示「分时预约」标签 */
        hasSlots: slots.some((s) => Number(s.scenicAreaId) === areaId),
        /** 可售票种里有没有要求实名的 */
        needRealname: sellable.some((t) => t.needRealname === 1),
      };
    });

    return {
      areas: list,
      summary: {
        current: totalCurrent,
        maxCapacity: totalCapacity,
        capacityRate: totalCapacity > 0 ? Number((totalCurrent / totalCapacity).toFixed(4)) : 0,
      },
    };
  }

  /** 景区详情（含时段与公告 —— 技术方案 §3.2 的口径是「景区详情 + 公告 + 开放时间」） */
  async areaDetail(id: number) {
    const area = await this.areaRepo.findOne({ where: { id, status: 1 } });
    if (!area) return null;
    const [slots, announcements] = await Promise.all([
      this.slotRepo.find({
        where: { scenicAreaId: id, status: 1 },
        order: { sortOrder: 'ASC' },
      }),
      // 只给已发布的（status=1），按发布时间倒序，口径与管理端 listAnnouncements 一致
      this.annoRepo.find({
        where: { scenicAreaId: id, status: 1 },
        order: { publishedAt: 'DESC', id: 'DESC' },
      }),
    ]);
    return { ...area, timeSlots: slots, announcements };
  }

  /**
   * 票种列表（含指定日期价格）
   *
   * 价格取价格日历，无记录回落票种基础价。
   */
  async listTicketTypes(areaId: number, date: string) {
    const types = await this.typeRepo.find({
      where: { scenicAreaId: areaId, status: 1 },
      order: { id: 'ASC' },
    });
    if (types.length === 0) return [];

    const calendars = await this.priceRepo.find({
      where: types.map((t) => ({ ticketTypeId: t.id, date })),
    });

    return types.map((t) => ({
      id: t.id,
      name: t.name,
      audience: t.audience,
      needRealname: t.needRealname,
      price: calendars.find((c) => c.ticketTypeId === t.id)?.price ?? t.basePrice,
      refundRule: t.refundRule,
      // 计价单位。客户端据此把「按张卖」的票种标为暂不支持在线预约 ——
      // 下单只有「单价 × 人数」一种计价，按张会被算错金额
      saleUnit: t.saleUnit,
    }));
  }

  /**
   * 实时在园情况（首页「在园率」）
   *
   * 口径与 `StatsService.dashboard` 完全一致：**在园人数以闸机「通行回执」为准**
   * （result=1 通过或 4 应急放行），核验通过但未实际通行不计数。
   * 承载量取 `scenic_area.max_capacity`。
   */
  async areaPresence(areaId: number) {
    const area = await this.areaRepo.findOne({ where: { id: areaId, status: 1 } });
    if (!area) return null;

    const current = await this.presence.current(areaId);
    const maxCapacity = Number(area.maxCapacity ?? 0);
    return {
      current,
      maxCapacity,
      /** 承载率 0~1（无承载量时为 0） */
      capacityRate: maxCapacity > 0 ? Number((current / maxCapacity).toFixed(4)) : 0,
    };
  }

  /**
   * 分时余票
   *
   * 优先读 Redis 缓存的可用量（含在途锁定），缓存缺失时按 DB 计算。
   */
  async listStocks(ticketTypeId: number, date: string) {
    const stocks = await this.stockRepo.find({ where: { ticketTypeId, date } });
    if (stocks.length === 0) return [];

    const slots = await this.slotRepo.find({
      where: stocks.map((s) => ({ id: s.timeSlotId })),
      order: { sortOrder: 'ASC' },
    });

    const result = [];
    for (const stock of stocks) {
      const cached = await this.stockCache.getCached(stock.id);
      const available = cached ?? stock.total - stock.sold - stock.locked;
      const slot = slots.find((s) => s.id === stock.timeSlotId);
      if (!slot) continue;
      result.push({
        timeSlotId: slot.id,
        slotName: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        available,
        stockId: stock.id,
      });
    }
    return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}
