import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { VerifyService } from './verify.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Verification } from '../../database/entities/verify.entity';

class AdminVerifyDto {
  /** 二维码 token（扫码核销） */
  @IsOptional() @IsString() @MaxLength(512) credential?: string;

  /** 订单号（手动核销） */
  @IsOptional() @IsString() @MaxLength(32) orderNo?: string;

  /** 身份证哈希（刷证核销） */
  @IsOptional() @IsString() @MaxLength(64) idCardHash?: string;

  /** 证件后四位（手动核销时用于精确到人） */
  @IsOptional() @IsString() @MaxLength(8) idCardSuffix?: string;

  @IsOptional() @IsIn([1, 2]) direction?: number;
}

@ApiTags('后台-核销')
@Controller('admin')
export class VerifyController {
  constructor(
    private readonly verifyService: VerifyService,
    private readonly authService: AuthService,
    @InjectRepository(Verification) private readonly verifyRepo: Repository<Verification>,
  ) {}

  @Post('verify')
  @Permissions('verify:execute')
  @ApiOperation({ summary: '核销（扫码 / 订单号+证件后四位 / 刷证），支持部分核销' })
  async verify(@Body() dto: AdminVerifyDto, @Req() req: Express.Request) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const ctx = {
      channel: dto.credential ? 'pda' : 'manual',
      operatorId: adminId,
      direction: dto.direction ?? 1,
    };

    let outcome;
    if (dto.credential) {
      outcome = await this.verifyService.verifyByCredential(dto.credential, ctx);
    } else if (dto.idCardHash) {
      // 不传 areaId：后台核销台的语义是「这个人今天在哪个景点有有效预约」，本就不绑定景点。
      // 以前传的是字面量 0，而服务端会拼 `r.scenic_area_id = 0` —— 永远匹配不到，这条路一直是坏的
      outcome = await this.verifyService.verifyByIdCard(dto.idCardHash, undefined, ctx);
    } else if (dto.orderNo) {
      outcome = await this.verifyService.verifyManual(dto.orderNo, dto.idCardSuffix ?? '', ctx);
    } else {
      return { ok: false, code: 'INVALID_CREDENTIAL', message: '请提供凭证、订单号或证件' };
    }

    await this.authService.writeLog(adminId, 'verify:execute', 'reservation', outcome.reservationId ?? null, {
      orderNo: dto.orderNo,
      credential: dto.credential ? '[token]' : undefined,
      result: outcome.code,
    });
    return outcome;
  }

  @Get('verifications')
  @Permissions('order:read')
  @ApiOperation({ summary: '核销记录' })
  async list(
    @Query() page: PaginationDto,
    @Query('channel') channel?: string,
    @Query('date') date?: string,
  ) {
    const qb = this.verifyRepo
      .createQueryBuilder('v')
      .orderBy('v.id', 'DESC')
      .skip((page.page - 1) * page.pageSize)
      .take(page.pageSize);

    if (channel) qb.andWhere('v.channel = :channel', { channel });
    if (date) qb.andWhere('DATE(v.verify_time) = :date', { date });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  @Get('verifications/:id')
  @Permissions('order:read')
  @ApiOperation({ summary: '核销记录详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.verifyRepo.findOne({ where: { id } });
  }
}
