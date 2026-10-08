import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentGate, GateAuthGuard, GateContext } from './gate-auth.guard';
import { GateService } from './gate.service';
import { VerifyService } from '../verify/verify.service';

class VerifyRequestDto {
  /** 二维码凭证 token（与身份证哈希二选一） */
  @IsOptional() @IsString() @MaxLength(512) credential?: string;

  /** 身份证哈希（刷证通行，服务端不接收明文证件号） */
  @IsOptional() @IsString() @MaxLength(64) idCardHash?: string;

  /** 1 入园 / 2 出园 */
  @IsOptional() @IsIn([1, 2]) direction?: number;
}

class HeartbeatDto {
  @IsOptional() @IsString() @MaxLength(32) firmwareVersion?: string;
  @IsOptional() @IsInt() cachedRuleVersion?: number;
}

class PassageDto {
  @IsOptional() @IsInt() reservationId?: number;
  @IsIn([1, 2]) direction: number;
  @IsIn([1, 2, 3, 4]) result: number;
  @IsOptional() @IsString() @MaxLength(32) rejectReason?: string;
  @IsOptional() @IsString() @MaxLength(128) credential?: string;
  @IsOptional() @IsString() passedAt?: string;
}

class AlarmDto {
  @IsString() @MinLength(2) @MaxLength(32) type: string;
  @IsOptional() @IsIn([1, 2, 3]) level?: number;
  @IsString() @MinLength(2) @MaxLength(512) content: string;
}

class OfflineSyncDto {
  @IsString() @MaxLength(64) batchNo: string;
  @IsArray() records: { credential: string; direction?: number; passedAt?: string }[];
}

/**
 * 闸机接口（设计文档 §3.4 闸机接口）
 *
 * 鉴权用 HMAC 签名（GateAuthGuard），非 JWT —— 闸机没有用户概念。
 * 一期为模拟器驱动（gate-simulator/），协议与真机一致。
 */
@ApiTags('闸机接口')
@Controller('gate')
@UseGuards(GateAuthGuard)
export class GateController {
  constructor(
    private readonly gateService: GateService,
    private readonly verifyService: VerifyService,
  ) {}

  @Post('verify')
  @ApiOperation({ summary: '凭证核验（通过则返回开闸指令与 cmdId）' })
  async verify(@CurrentGate() gate: GateContext, @Body() dto: VerifyRequestDto) {
    const ctx = {
      channel: 'gate',
      gateId: gate.id,
      direction: dto.direction ?? gate.direction,
    };

    const outcome = dto.credential
      ? await this.verifyService.verifyByCredential(dto.credential, ctx)
      : dto.idCardHash
        ? await this.verifyService.verifyByIdCard(dto.idCardHash, gate.scenicAreaId, ctx)
        : { ok: false, code: 'INVALID_CREDENTIAL' as const, message: '缺少凭证' };

    // 对闸机的响应契约（设计 §5.3）：明确给出 open 开关，
    // 真机对接时只需判断该字段，语音/屏幕提示取 code 与 message
    return { ...outcome, open: outcome.ok };
  }

  @Post('heartbeat')
  @ApiOperation({ summary: '心跳上报（返回规则版本，需同步时闸机拉取 /gate/rules）' })
  heartbeat(@CurrentGate() gate: GateContext, @Body() dto: HeartbeatDto) {
    return this.gateService.heartbeat(gate.id, dto);
  }

  @Get('rules')
  @ApiOperation({ summary: '全量拉取离线核验规则（凭证密钥/黑名单/当日白名单）' })
  rules(@CurrentGate() gate: GateContext) {
    return this.gateService.getRules(gate.id);
  }

  @Post('passage')
  @ApiOperation({ summary: '通行结果上报（开闸回执 / 出园上报）' })
  passage(@CurrentGate() gate: GateContext, @Body() dto: PassageDto) {
    return this.gateService.reportPassage(gate.id, dto);
  }

  @Post('alarm')
  @ApiOperation({ summary: '告警上报（尾随/强闯/消防联动等）' })
  alarm(@CurrentGate() gate: GateContext, @Body() dto: AlarmDto) {
    return this.gateService.reportAlarm(gate.id, dto);
  }

  @Post('offline/sync')
  @ApiOperation({ summary: '离线记录批量上传（冲突以首次核销为准）' })
  offlineSync(@CurrentGate() gate: GateContext, @Body() dto: OfflineSyncDto) {
    return this.gateService.syncOffline(gate.id, dto);
  }

  @Get('commands/pending')
  @ApiOperation({ summary: '拉取待执行指令（开闸/常开/常闭）' })
  pendingCommands(@CurrentGate() gate: GateContext, @Query('limit') limit?: number) {
    return this.gateService.listPendingCommands(gate.id, Number(limit ?? 10));
  }
}
