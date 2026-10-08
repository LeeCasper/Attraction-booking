import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiniController } from './mini.controller';
import { MiniAuthService } from './mini-auth.service';
import { MiniTicketService } from './mini-ticket.service';
import { User } from '../../database/entities/user.entity';
import { ScenicArea } from '../../database/entities/scenic.entity';
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
    TypeOrmModule.forFeature([User, ScenicArea, TicketType, TimeSlot, TicketStock, PriceCalendar]),
    OrderModule,
    PayModule,
    TicketModule,
    VerifyModule,
  ],
  controllers: [MiniController],
  providers: [MiniAuthService, MiniTicketService],
})
export class MiniModule {}
