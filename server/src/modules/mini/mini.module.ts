import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiniController } from './mini.controller';
import { MiniAuthService } from './mini-auth.service';
import { MiniTicketService } from './mini-ticket.service';
import { MiniVisitorService } from './mini-visitor.service';
import { Blacklist, User, Visitor } from '../../database/entities/user.entity';
import { OrderItem } from '../../database/entities/order.entity';
import { Announcement, ScenicArea } from '../../database/entities/scenic.entity';
import {
  PriceCalendar,
  TicketStock,
  TicketType,
  TimeSlot,
} from '../../database/entities/ticket.entity';
import { OrderModule } from '../order/order.module';
import { PayModule } from '../pay/pay.module';
import { TicketModule } from '../ticket/ticket.module';
import { VerifyModule } from '../verify/verify.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ScenicArea,
      // 景区详情要带公告（技术方案 §3.2）
      Announcement,
      TicketType,
      TimeSlot,
      TicketStock,
      PriceCalendar,
      // 常用出行人：Visitor 本体 + 黑名单拦截 + 删除前的订单引用检查
      Visitor,
      Blacklist,
      OrderItem,
    ]),
    OrderModule,
    PayModule,
    TicketModule,
    VerifyModule,
  ],
  controllers: [MiniController],
  providers: [MiniAuthService, MiniTicketService, MiniVisitorService],
})
export class MiniModule {}
