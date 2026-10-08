import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderModule } from '../order/order.module';
import { AuthModule } from '../auth/auth.module';
import { TicketModule } from '../ticket/ticket.module';
import { PayService } from './pay.service';
import { WxPayService } from './wxpay.service';
import { PayController } from './pay.controller';
import { RefundController } from './refund.controller';
import { Orders, OrderItem, Reservation } from '../../database/entities/order.entity';
import { Payment, Refund } from '../../database/entities/pay.entity';
import { TicketType } from '../../database/entities/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Orders, OrderItem, Reservation, Payment, Refund, TicketType]),
    OrderModule, // markPaid：支付成功状态迁移
    TicketModule, // StockCacheService：库存回流
    AuthModule, // 操作日志
  ],
  controllers: [PayController, RefundController],
  providers: [PayService, WxPayService],
  exports: [PayService, WxPayService],
})
export class PayModule {}
