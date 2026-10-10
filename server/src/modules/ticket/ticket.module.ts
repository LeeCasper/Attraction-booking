import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceCalendar, TicketStock, TicketType, TimeSlot, StockChangeLog } from '../../database/entities/ticket.entity';
import { PurchaseRule } from './purchase-rule.entity';
import { AuthModule } from '../auth/auth.module';
import { TicketTypeController } from './ticket-type.controller';
import { TicketTypeService } from './ticket-type.service';
import { StockCacheService } from './stock-cache.service';
import { TimeSlotController } from './time-slot.controller';
import { PriceCalendarController } from './price-calendar.controller';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { ScenicDefaultsService } from './scenic-defaults.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TicketType, TimeSlot, PriceCalendar, TicketStock, StockChangeLog, PurchaseRule]),
    AuthModule,
  ],
  controllers: [TicketTypeController, TimeSlotController, StockController, PriceCalendarController],
  providers: [TicketTypeService, StockService, StockCacheService, ScenicDefaultsService],
  // StockCacheService 供下单模块做 Redis 预减（设计 §4.2）
  // StockService / ScenicDefaultsService 供景区模块做「新建景区一键生成默认时段/票种/库存」；
  // 生成逻辑留在票务域（时段/票种/库存都是这儿的仓储），景区模块只 import 本模块，无环
  exports: [StockCacheService, StockService, ScenicDefaultsService],
})
export class TicketModule {}
