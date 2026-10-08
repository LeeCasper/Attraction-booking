import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { OrderService } from './order.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

class AdminOrderQueryDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() @MaxLength(32) orderNo?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

@ApiTags('后台-订单管理')
@Controller('admin/orders')
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Permissions('order:read')
  @ApiOperation({ summary: '订单列表（状态/单号/手机号/预约日期筛选）' })
  list(@Query() query: AdminOrderQueryDto) {
    return this.orderService.adminList({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status ? Number(query.status) : undefined,
      orderNo: query.orderNo,
      phone: query.phone,
      date: query.date,
    });
  }

  @Get(':id')
  @Permissions('order:read')
  @ApiOperation({ summary: '订单详情（游客、票种、支付、退款记录）' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.detail(id);
  }
}
