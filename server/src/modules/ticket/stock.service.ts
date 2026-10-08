import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StockChangeLog, TicketStock, TicketType, TimeSlot } from '../../database/entities/ticket.entity';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(TicketStock) private readonly stockRepo: Repository<TicketStock>,
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    private readonly dataSource: DataSource,
  ) {}

  /** 库存查询：票种 × 日期范围，附带时段信息与剩余量 */
  async list(ticketTypeId: number, start: string, end: string) {
    const rows = await this.stockRepo
      .createQueryBuilder('s')
      .where('s.ticket_type_id = :ticketTypeId', { ticketTypeId })
      .andWhere('s.date BETWEEN :start AND :end', { start, end })
      .orderBy('s.date', 'ASC')
      .addOrderBy('s.time_slot_id', 'ASC')
      .getMany();
    if (rows.length === 0) return [];

    const slotIds = [...new Set(rows.map((r) => r.timeSlotId))];
    const slots = await this.dataSource.getRepository(TimeSlot).find({ where: { id: In(slotIds) } });
    return rows.map((r) => ({
      ...r,
      available: r.total - r.sold - r.locked,
      slotName: slots.find((s) => s.id === r.timeSlotId)?.name ?? '',
      startTime: slots.find((s) => s.id === r.timeSlotId)?.startTime ?? '',
      endTime: slots.find((s) => s.id === r.timeSlotId)?.endTime ?? '',
    }));
  }

  /**
   * 批量生成分时库存：按票种所属景区的全部启用时段，
   * 只新增缺失记录，不覆盖已有库存(保护已售/锁定数据)。
   */
  async generate(ticketTypeId: number, start: string, end: string, total: number, operatorId: number) {
    const type = await this.typeRepo.findOne({ where: { id: ticketTypeId } });
    if (!type) throw new NotFoundException('票种不存在');
    if (total < 0) throw new BadRequestException('库存不能为负');
    const slots = await this.dataSource.getRepository(TimeSlot).find({
      where: { scenicAreaId: type.scenicAreaId, status: 1 },
    });
    if (slots.length === 0) throw new BadRequestException('该景区未配置时段，请先创建时段');

    const dates: string[] = [];
    for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    let created = 0;
    await this.dataSource.transaction(async (em) => {
      for (const date of dates) {
        for (const slot of slots) {
          const exists = await em.findOne(TicketStock, {
            where: { ticketTypeId, date, timeSlotId: slot.id },
          });
          if (exists) continue;
          await em.insert(TicketStock, {
            scenicAreaId: type.scenicAreaId,
            ticketTypeId,
            date,
            timeSlotId: slot.id,
            total,
          });
          created++;
        }
      }
      if (created > 0) {
        await em.insert(StockChangeLog, {
          ticketStockId: 0,
          changeType: 'generate',
          changeValue: created,
          beforeValue: 0,
          afterValue: 0,
          operatorId,
          remark: `批量生成 ${dates[0]}~${dates[dates.length - 1]} 共 ${created} 条分时库存`,
        });
      }
    });
    return { created };
  }

  /** 手动调整库存（±），总库存不得低于已售+锁定，事务内行锁保护 */
  async adjust(stockId: number, changeValue: number, remark: string, operatorId: number) {
    return this.dataSource.transaction(async (em) => {
      const stock = await em.findOne(TicketStock, {
        where: { id: stockId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!stock) throw new NotFoundException('库存记录不存在');

      const newTotal = stock.total + changeValue;
      if (newTotal < stock.sold + stock.locked) {
        throw new BadRequestException(
          `调整后库存(${newTotal})不得低于已售+锁定(${stock.sold + stock.locked})`,
        );
      }
      await em.update(TicketStock, stockId, { total: newTotal });
      await em.insert(StockChangeLog, {
        ticketStockId: stockId,
        changeType: changeValue >= 0 ? 'manual_add' : 'manual_sub',
        changeValue,
        beforeValue: stock.total,
        afterValue: newTotal,
        operatorId,
        remark,
      });
      return { id: stockId, total: newTotal, sold: stock.sold, locked: stock.locked };
    });
  }
}
