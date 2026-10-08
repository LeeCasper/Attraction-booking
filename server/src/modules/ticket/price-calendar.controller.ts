import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsInt, IsString, Matches, Min } from 'class-validator';
import { PriceCalendar } from '../../database/entities/ticket.entity';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class UpsertPriceDto {
  @IsInt() ticketTypeId: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsInt() @Min(0) price: number;
}

@ApiTags('后台-价格日历')
@Controller('admin/price-calendar')
export class PriceCalendarController {
  constructor(
    @InjectRepository(PriceCalendar) private readonly repo: Repository<PriceCalendar>,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('ticket:read')
  @ApiOperation({ summary: '查询价格日历(无记录日期取票种基础价)' })
  async list(
    @Query('ticketTypeId', ParseIntPipe) ticketTypeId: number,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.ticket_type_id = :ticketTypeId', { ticketTypeId })
      .orderBy('p.date', 'ASC');
    if (start && end) {
      qb.andWhere('p.date BETWEEN :start AND :end', { start, end });
    }
    return qb.getMany();
  }

  @Put()
  @Permissions('ticket:update')
  @ApiOperation({ summary: '设置某日价格(节假日调价)' })
  async upsert(@Body() dto: UpsertPriceDto, @Req() req: Express.Request) {
    const existing = await this.repo.findOne({ where: { ticketTypeId: dto.ticketTypeId, date: dto.date } });
    if (existing) {
      await this.repo.update(existing.id, { price: dto.price });
    } else {
      await this.repo.save(this.repo.create(dto));
    }
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    await this.authService.writeLog(adminId, 'price:update', 'price_calendar', existing?.id ?? null, dto);
    return null;
  }

  @Delete(':ticketTypeId/:date')
  @Permissions('ticket:update')
  @ApiOperation({ summary: '删除某日特殊价(回落基础价)' })
  async remove(@Param('ticketTypeId', ParseIntPipe) ticketTypeId: number, @Param('date') date: string, @Req() req: Express.Request) {
    await this.repo.delete({ ticketTypeId, date });
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    await this.authService.writeLog(adminId, 'price:delete', 'price_calendar', null, { ticketTypeId, date });
    return null;
  }
}
