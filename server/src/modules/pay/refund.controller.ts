import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PayService } from './pay.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

class AuditRefundDto {
  @IsBoolean() approve: boolean;

  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

@ApiTags('后台-退款审核')
@Controller('admin/refunds')
export class RefundController {
  constructor(
    private readonly payService: PayService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @Permissions('order:read')
  @ApiOperation({ summary: '退款单列表' })
  list(@Query() page: PaginationDto, @Query('status', new ParseIntPipe({ optional: true })) status?: number) {
    return this.payService.listRefunds(page.page, page.pageSize, status);
  }

  @Post(':id/audit')
  @Permissions('order:refund_audit')
  @ApiOperation({ summary: '退款审核（同意→调微信退款，拒绝→记录原因）' })
  async audit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AuditRefundDto,
    @Req() req: Express.Request,
  ) {
    const adminId = (req as Express.Request & { admin: { id: number } }).admin.id;
    const result = await this.payService.auditRefund(id, adminId, dto.approve, dto.remark);
    await this.authService.writeLog(
      adminId,
      dto.approve ? 'refund:approve' : 'refund:reject',
      'refund',
      id,
      { remark: dto.remark, result },
    );
    return result;
  }
}
