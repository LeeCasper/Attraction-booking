import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceCalendar, TicketStock, TicketType, TimeSlot, StockChangeLog } from '../../database/entities/ticket.entity';
import { PurchaseRule } from './purchase-rule.entity';
import { AuthModule } from '../auth/auth.module';
import { TicketTypeController } from './ticket-type.controller';
import { TicketTypeService } from './ticket-type.service';
import { TimeSlotController } from './time-slot.controller';
import { PriceCalendarController } from './price-calendar.controller';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TicketType, TimeSlot, PriceCalendar, TicketStock, StockChangeLog, PurchaseRule]),
    AuthModule,
  ],
  controllers: [TicketTypeController, TimeSlotController, StockController, PriceCalendarController],
  providers: [TicketTypeService, StockService],
})
export class TicketModule {}
