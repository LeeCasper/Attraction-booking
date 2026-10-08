import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { MiniAuthService } from './mini-auth.service';
import { MiniTicketService } from './mini-ticket.service';
import { CurrentUser, MiniAuthGuard, MiniUser } from './mini-auth.guard';
import { OrderService } from '../order/order.service';
import { PayService } from '../pay/pay.service';
import { WxPayService } from '../pay/wxpay.service';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import { CredentialService } from '../verify/credential.service';

class MiniLoginDto {
  /** wx.login 返回的 code；本地模拟登录时任意字符串即可 */
  @IsString() @Length(1, 128) code: string;
}

class ApplyRefundDto {
  @IsString() @Length(1, 255) reason: string;
}

@ApiTags('小程序端')
@Controller('mini')
export class MiniController {
  constructor(
    private readonly authService: MiniAuthService,
    private readonly ticketService: MiniTicketService,
    private readonly orderService: OrderService,
    private readonly payService: PayService,
    private readonly wxpay: WxPayService,
    private readonly credentialService: CredentialService,
  ) {}

  // ==================== 登录 ====================

  @Post('auth/login')
  @ApiOperation({ summary: '登录（code2session 换 openid）' })
  login(@Body() dto: MiniLoginDto) {
    return this.authService.login(dto.code);
  }

  // ==================== 景区与票务（无需登录）====================

  @Get('areas')
  @ApiOperation({ summary: '景区列表' })
  listAreas() {
    return this.ticketService.listAreas();
  }

  @Get('areas/:id')
  @ApiOperation({ summary: '景区详情（含时段）' })
  async areaDetail(@Param('id', ParseIntPipe) id: number) {
    const area = await this.ticketService.areaDetail(id);
    if (!area) throw new NotFoundException('景区不存在');
    return area;
  }

  @Get('tickets')
  @ApiOperation({ summary: '票种列表（含当日价格）' })
  listTickets(@Query('areaId', ParseIntPipe) areaId: number, @Query('date') date: string) {
    return this.ticketService.listTicketTypes(areaId, date);
  }

  @Get('stocks')
  @ApiOperation({ summary: '分时余票' })
  listStocks(
    @Query('ticketTypeId', ParseIntPipe) ticketTypeId: number,
    @Query('date') date: string,
  ) {
    return this.ticketService.listStocks(ticketTypeId, date);
  }

  // ==================== 订单（需登录）====================

  @Post('orders')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '创建订单（预减库存 + 返回支付参数）' })
  async createOrder(@CurrentUser() user: MiniUser, @Body() dto: CreateOrderDto) {
    const order = await this.orderService.create(user.id, dto);
    const pay = await this.wxpay.createJsapiPay({
      orderNo: order.orderNo,
      amount: order.amount,
      description: `景区门票 ${order.visitorCount} 张`,
      openid: user.openid,
      expireMinutes: 15,
    });
    return { ...order, payParams: pay.payParams, mock: this.wxpay.mock };
  }

  @Get('orders')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '我的订单' })
  listOrders(@CurrentUser() user: MiniUser, @Query('status', new ParseIntPipe({ optional: true })) status?: number) {
    return this.orderService.listByUser(user.id, status);
  }

  @Get('orders/:id')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '订单详情' })
  orderDetail(@CurrentUser() user: MiniUser, @Param('id', ParseIntPipe) id: number) {
    return this.orderService.detail(id, user.id);
  }

  @Post('orders/:id/cancel')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '取消订单（释放锁定库存）' })
  cancel(@CurrentUser() user: MiniUser, @Param('id', ParseIntPipe) id: number) {
    return this.orderService.cancel(id, user.id, '用户主动取消');
  }

  @Get('orders/:id/pay-params')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '重新获取支付参数（待支付订单）' })
  async payParams(@CurrentUser() user: MiniUser, @Param('id', ParseIntPipe) id: number) {
    const order = await this.orderService.detail(id, user.id);
    const pay = await this.wxpay.createJsapiPay({
      orderNo: order.orderNo,
      amount: order.amount,
      description: `景区门票 ${order.items.length} 张`,
      openid: user.openid,
      expireMinutes: 15,
    });
    return { orderNo: order.orderNo, payParams: pay.payParams, mock: this.wxpay.mock };
  }

  @Get('orders/:id/credential')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '获取动态入园凭证（HMAC Token，60 秒有效，小程序每 50 秒刷新）' })
  async credential(@CurrentUser() user: MiniUser, @Param('id', ParseIntPipe) id: number) {
    const order = await this.orderService.detail(id, user.id);

    if (!order.reservation) {
      throw new BadRequestException('订单尚未生成预约');
    }
    if (![20, 30].includes(order.status)) {
      throw new BadRequestException('订单当前状态不可入园');
    }

    const credential = await this.credentialService.issue(order.reservation.id, user.id);
    return {
      ...credential,
      /** 刷新间隔建议：剩余有效期不足 10 秒时可刷新 */
      refreshAfter: 50,
      reservationDate: order.reservation.date,
      remainingCount: order.reservation.totalCount - order.reservation.verifyCount,
    };
  }

  @Post('orders/:id/refund')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '申请退款（按退改规则计算手续费，后台审核）' })
  applyRefund(
    @CurrentUser() user: MiniUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyRefundDto,
  ) {
    return this.payService.applyRefund(id, user.id, dto.reason);
  }

  // ==================== 联调辅助（仅 mock 模式可用）====================

  @Post('pay/mock-notify')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '模拟支付成功回调（WXPAY_MOCK=true 时可用，用于本地联调）' })
  async mockNotify(@Query('orderNo') orderNo: string) {
    if (!this.wxpay.mock) {
      throw new NotFoundException('非模拟模式不支持该接口');
    }
    const result = await this.orderService.markPaid(orderNo, `mock_txn_${Date.now()}`, {
      mock: true,
      orderNo,
    });
    return result;
  }
}
