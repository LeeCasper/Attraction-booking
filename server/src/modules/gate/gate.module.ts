import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GateService } from './gate.service';
import { GateController } from './gate.controller';
import { GateAdminController } from './gate-admin.controller';
import { GateCommand, GateDevice, GateLog, OfflineSyncRecord } from '../../database/entities/gate.entity';
import { Alarm, PassageRecord } from '../../database/entities/verify.entity';
import { Reservation } from '../../database/entities/order.entity';
import { Blacklist } from '../../database/entities/user.entity';
import { ScenicArea } from '../../database/entities/scenic.entity';
import { VerifyModule } from '../verify/verify.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GateDevice,
      GateLog,
      GateCommand,
      OfflineSyncRecord,
      Alarm,
      PassageRecord,
      Reservation,
      Blacklist,
      // 新增/编辑闸机要校验「所属景区存在」（闸机绑错景区就核不了单）
      ScenicArea,
    ]),
    VerifyModule,
    AuthModule,
  ],
  controllers: [GateController, GateAdminController],
  providers: [GateService],
  exports: [GateService],
})
export class GateModule {}
