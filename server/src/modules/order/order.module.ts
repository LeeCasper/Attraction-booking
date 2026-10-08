import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { AdminOrderController } from './admin-order.controller';
import { OrderItem, Orders, Reservation } from '../../database/entities/order.entity';
import { Blacklist, Visitor } from '../../database/entities/user.entity';
import {
  PriceCalendar,
  TicketStock,
  TicketType,
  TimeSlot,
} from '../../database/entities/ticket.entity';
import { PurchaseRule } from '../ticket/purchase-rule.entity';
import { TicketModule } from '../ticket/ticket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Orders,
      OrderItem,
      Reservation,
      Visitor,
      Blacklist,
      TicketType,
      TimeSlot,
      TicketStock,
      PriceCalendar,
      PurchaseRule,
    ]),
    TicketModule, // StockCacheService
  ],
  controllers: [AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
