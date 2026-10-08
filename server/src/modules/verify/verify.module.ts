import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CredentialService } from './credential.service';
import { PresenceService } from './presence.service';
import { VerifyService } from './verify.service';
import { VerifyController } from './verify.controller';
import { OrderItem, Orders, Reservation } from '../../database/entities/order.entity';
import { Blacklist, Visitor } from '../../database/entities/user.entity';
import { Alarm, PassageRecord, Verification } from '../../database/entities/verify.entity';
import { GateDevice } from '../../database/entities/gate.entity';
import { TimeSlot } from '../../database/entities/ticket.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Orders,
      OrderItem,
      Reservation,
      Visitor,
      Blacklist,
      GateDevice,
      TimeSlot,
      Verification,
      PassageRecord,
      Alarm,
    ]),
    AuthModule,
  ],
  controllers: [VerifyController],
  providers: [CredentialService, PresenceService, VerifyService],
  exports: [CredentialService, PresenceService, VerifyService],
})
export class VerifyModule {}
