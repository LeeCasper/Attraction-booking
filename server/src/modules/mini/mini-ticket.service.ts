import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenicArea } from '../../database/entities/scenic.entity';
import {
  PriceCalendar,
  TicketStock,
  TicketType,
  TimeSlot,
} from '../../database/entities/ticket.entity';
import { StockCacheService } from '../ticket/stock-cache.service';

@Injectable()
export class MiniTicketService {
  constructor(
    @InjectRepository(ScenicArea) private readonly areaRepo: Repository<ScenicArea>,
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    @InjectRepository(TicketStock) private readonly stockRepo: Repository<TicketStock>,
    @InjectRepository(PriceCalendar) private readonly priceRepo: Repository<PriceCalendar>,
    private readonly stockCache: StockCacheService,
  ) {}

  /** 景区列表（仅开放中） */
  async listAreas() {
    const areas = await this.areaRepo.find({ where: { status: 1 }, order: { id: 'ASC' } });
    return areas.map((a) => ({
      id: a.id,
      name: a.name,
      coverUrl: a.coverUrl,
      openTime: a.openTime,
      intro: a.intro,
    }));
  }

  /** 景区详情 */
  async areaDetail(id: number) {
    const area = await this.areaRepo.findOne({ where: { id, status: 1 } });
    if (!area) return null;
    const slots = await this.slotRepo.find({
      where: { scenicAreaId: id, status: 1 },
      order: { sortOrder: 'ASC' },
    });
    return { ...area, timeSlots: slots };
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
    }));
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
