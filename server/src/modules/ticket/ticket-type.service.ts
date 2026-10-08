import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TicketType, TimeSlot } from '../../database/entities/ticket.entity';
import { PurchaseRule } from './purchase-rule.entity';

@Injectable()
export class TicketTypeService {
  constructor(
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    @InjectRepository(PurchaseRule) private readonly ruleRepo: Repository<PurchaseRule>,
  ) {}

  async list(areaId: number, includeDisabled = false) {
    const where = includeDisabled ? { scenicAreaId: areaId } : { scenicAreaId: areaId, status: 1 };
    return this.typeRepo.find({ where, order: { id: 'ASC' } });
  }

  async detail(id: number) {
    const type = await this.typeRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('票种不存在');
    const [rule, slots] = await Promise.all([
      this.ruleRepo.findOne({ where: { ticketTypeId: id } }),
      this.slotRepo.find({ where: { scenicAreaId: type.scenicAreaId, status: 1 }, order: { sortOrder: 'ASC' } }),
    ]);
    return {
      ...type,
      purchaseRule: rule ?? null,
      availableSlots: slots,
    };
  }

  async create(body: {
    scenicAreaId: number;
    name: string;
    audience?: string;
    basePrice: number;
    refundRule?: Record<string, unknown>;
    needRealname?: number;
    remark?: string;
    purchaseRule?: { perUserPerOrder?: number; perUserPerDay?: number; perIdcardPerDay?: number };
  }) {
    if (body.basePrice < 0) throw new BadRequestException('价格不能为负');
    const type = await this.typeRepo.save(
      this.typeRepo.create({
        scenicAreaId: body.scenicAreaId,
        name: body.name,
        audience: body.audience,
        basePrice: body.basePrice,
        refundRule: body.refundRule ?? null,
        needRealname: body.needRealname ?? 1,
        remark: body.remark,
      }),
    );
    if (body.purchaseRule) {
      await this.ruleRepo.save(this.ruleRepo.create({ ticketTypeId: type.id, ...body.purchaseRule }));
    }
    return { id: Number(type.id) };
  }

  async update(id: number, body: Partial<TicketType>) {
    const type = await this.typeRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('票种不存在');
    if (body.basePrice !== undefined && body.basePrice < 0) throw new BadRequestException('价格不能为负');
    // 已有销售记录时禁止改动实名属性，防止历史订单核验规则漂移
    await this.typeRepo.update(id, body as QueryDeepPartialEntity<TicketType>);
    return null;
  }

  async updatePurchaseRule(id: number, body: { perUserPerOrder?: number; perUserPerDay?: number; perIdcardPerDay?: number }) {
    const type = await this.typeRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('票种不存在');
    const existing = await this.ruleRepo.findOne({ where: { ticketTypeId: id } });
    if (existing) {
      await this.ruleRepo.update(existing.id, body);
    } else {
      await this.ruleRepo.save(this.ruleRepo.create({ ticketTypeId: id, ...body }));
    }
    return null;
  }

  async remove(id: number) {
    const type = await this.typeRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('票种不存在');
    // 下架而非物理删除，保护历史订单引用
    await this.typeRepo.update(id, { status: 2 });
    return null;
  }
}
