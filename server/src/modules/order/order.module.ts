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
import { Refund } from '../../database/entities/pay.entity';
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
      // 订单列表/详情要带退款状态，否则客户端不知道「审核中/已拒绝」
      Refund,
    ]),
    TicketModule, // StockCacheService
  ],
  controllers: [AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
