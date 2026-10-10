import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TicketTypeService } from './ticket-type.service';
import { AuthService } from '../auth/auth.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

class CreateTicketTypeDto {
  @IsInt() scenicAreaId: number;
  @IsString() @MinLength(2) @MaxLength(64) name: string;
  @IsOptional() @IsString() @MaxLength(64) audience?: string;
  @IsInt() @Min(0) @Max(100000000) basePrice: number;
  /** person 按人 / ticket 按张；不传按 person（数据库默认值也是 person） */
  @IsOptional() @IsIn(['person', 'ticket']) saleUnit?: string;
  @IsOptional() @IsObject() refundRule?: Record<string, unknown>;
  @IsOptional() @IsIn([0, 1]) needRealname?: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
  @IsOptional() @IsObject() purchaseRule?: { perUserPerOrder?: number; perUserPerDay?: number; perIdcardPerDay?: number };
}

class UpdateTicketTypeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(64) name?: string;
  @IsOptional() @IsString() @MaxLength(64) audience?: string;
  @IsOptional() @IsInt() @Min(0) basePrice?: number;
  @IsOptional() @IsObject() refundRule?: Record<string, unknown>;
  @IsOptional() @IsIn([0, 1]) needRealname?: number;
  @IsOptional() @IsIn([1, 2]) status?: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}

class UpdatePurchaseRuleDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) perUserPerOrder?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) perUserPerDay?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) perIdcardPerDay?: number;
}

@ApiTags('后台-票种与时段')
@Controller('admin')
export class TicketTypeController {
  constructor(
    private readonly ticketTypeService: TicketTypeService,
    private readonly authService: AuthService,
  ) {}

  // ---------- 票种 ----------

  @Get('ticket-types')
  @Permissions('ticket:read')
  @ApiOperation({ summary: '票种列表' })
  list(@Query('areaId', ParseIntPipe) areaId: number, @Query('all') all?: boolean) {
    return this.ticketTypeService.list(areaId, all === true);
  }

  @Get('ticket-types/:id')
  @Permissions('ticket:read')
  @ApiOperation({ summary: '票种详情(含限购规则/可用时段)' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.ticketTypeService.detail(id);
  }

  @Post('ticket-types')
  @Permissions('ticket:create')
  @ApiOperation({ summary: '创建票种' })
  async create(@Body() dto: CreateTicketTypeDto, @Req() req: Express.Request) {
    const r = await this.ticketTypeService.create(dto);
    await this.authService.writeLog(this.adminId(req), 'ticket:create', 'ticket_type', r.id, dto);
    return r;
  }

  @Put('ticket-types/:id')
  @Permissions('ticket:update')
  @ApiOperation({ summary: '修改票种' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketTypeDto, @Req() req: Express.Request) {
    await this.ticketTypeService.update(id, dto);
    await this.authService.writeLog(this.adminId(req), 'ticket:update', 'ticket_type', id, dto);
    return null;
  }

  @Put('ticket-types/:id/purchase-rule')
  @Permissions('ticket:update')
  @ApiOperation({ summary: '设置限购规则(A-014)' })
  async updatePurchaseRule(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePurchaseRuleDto, @Req() req: Express.Request) {
    await this.ticketTypeService.updatePurchaseRule(id, dto);
    await this.authService.writeLog(this.adminId(req), 'ticket:purchase_rule', 'ticket_type', id, dto);
    return null;
  }

  @Delete('ticket-types/:id')
  @Permissions('ticket:delete')
  @ApiOperation({ summary: '下架票种(软删除)' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Express.Request) {
    await this.ticketTypeService.remove(id);
    await this.authService.writeLog(this.adminId(req), 'ticket:delete', 'ticket_type', id, null);
    return null;
  }

  private adminId(req: Express.Request): number {
    return (req as Express.Request & { admin: { id: number } }).admin.id;
  }
}
