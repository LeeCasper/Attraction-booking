import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { randomBytes } from 'crypto';
import { MiniAuthService } from './mini-auth.service';
import { MiniTicketService } from './mini-ticket.service';
import { MiniVisitorService } from './mini-visitor.service';
import { CreateVisitorDto, UpdateVisitorDto } from './dto/visitor.dto';
import { CurrentUser, MiniAuthGuard, MiniUser } from './mini-auth.guard';
import { OrderService } from '../order/order.service';
import { PayService } from '../pay/pay.service';
import { WxPayService } from '../pay/wxpay.service';
import { CreateOrderDto } from '../order/dto/create-order.dto';
import { CredentialService } from '../verify/credential.service';
import { RefundStatus } from '../../common/enums/status.enum';
import { SysConfigService } from '../system/sys-config.service';
import { WeatherService } from '../system/weather.service';
import { DEFAULT_PLATFORM_SETTINGS } from '../../common/constants/platform-defaults';

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
    private readonly visitorService: MiniVisitorService,
    private readonly orderService: OrderService,
    private readonly payService: PayService,
    private readonly wxpay: WxPayService,
    private readonly credentialService: CredentialService,
    private readonly sysConfig: SysConfigService,
    private readonly weather: WeatherService,
  ) {}

  // ==================== 登录 ====================

  @Post('auth/login')
  @ApiOperation({ summary: '登录（code2session 换 openid）' })
  login(@Body() dto: MiniLoginDto) {
    return this.authService.login(dto.code);
  }

  // ==================== 景区与票务（无需登录）====================

  /**
   * 平台品牌与联系方式（顶栏名称/英文名/副标题、客服电话、版本号…），外加**首页那一行天气**。
   *
   * 只返回 `platform` 这一包（外加算出来的 `weather`），不返回合并后的全量配置 ——
   * 小程序用不到退款费率、告警阈值这些内部口径，暴露面越窄越不容易被动。
   *
   * `weather` 是**算出来的、不是存出来的**：`{ text, temp, category }`，拉不到/关闭/没配全都是
   * `null`（客户端对三种情况一视同仁：不显示那一行）。**它必须永远是 null 兜底，
   * 不能在 `DEFAULT_PLATFORM_SETTINGS` 里放一个假的默认天气** —— 那会把「拉不到」伪装成有值。
   * 两个 `await` 并发：天气超时 1.5 秒也不该叠在配置读取后面（`WeatherService` 自己吞掉异常，
   * 不会把本接口打挂，见其类注释 ①）。
   *
   * 匿名可达：`MiniAuthGuard` 是**逐路由** `@UseGuards` 挂的，这里不写就放行
   * （与上面几个 `areas` 接口同款）。小程序那边用 `{ anonymous: true }` 调。
   */
  @Get('platform/settings')
  @ApiOperation({ summary: '平台信息（含天气实况，免登录）' })
  async platformSettings() {
    const [platform, weather] = await Promise.all([
      this.sysConfig.get('platform', DEFAULT_PLATFORM_SETTINGS),
      this.weather.current(),
    ]);
    return { ...platform, weather };
  }

  /**
   * 公告（**免登录**）：提示公告与弹窗公告分开返回，只给「正在生效」的。
   *
   * `scenicAreaId` 不传 = 只要**全平台**公告（任何景点都该看到的那些）；
   * 传了就返回「该景点 + 全平台」。生效区间与 status 的判定在 service 里（查询期谓词）。
   */
  @Get('announcements')
  @ApiOperation({ summary: '公告（提示/弹窗，免登录）' })
  listAnnouncements(@Query('scenicAreaId', new ParseIntPipe({ optional: true })) scenicAreaId?: number) {
    return this.ticketService.listActiveAnnouncements(scenicAreaId);
  }

  @Get('areas')
  @ApiOperation({ summary: '景区列表' })
  listAreas() {
    return this.ticketService.listAreas();
  }

  // ⚠️ 必须声明在 `areas/:id` **之前** —— 否则 'overview' 会被当成 :id 命中，
  // ParseIntPipe 直接 400（Nest 按声明顺序匹配路由）
  @Get('areas/overview')
  @ApiOperation({ summary: '景区一览（含分类/起价/今日余票/实时在园，景点选择页用）' })
  listAreasOverview() {
    return this.ticketService.listAreasOverview();
  }

  /**
   * 首页轮播图（免登录）。
   *
   * 后台「内容管理 → 首页轮播图」单独维护的一组；`scenicAreaId` 有值时客户端拿它去
   * `/areas/overview` 的结果里取景点名与在园率（不再多打一次接口），点了进该景点购票页。
   * ⚠️ 一组都没配时**返回空数组** —— 客户端会回落到「按景点生成轮播」，
   * 免得新部署的首页顶上一个空白的 banner。
   */
  @Get('banners')
  @ApiOperation({ summary: '首页轮播图（免登录，仅启用中的）' })
  listBanners() {
    return this.ticketService.listBanners();
  }

  @Get('areas/:id')
  @ApiOperation({ summary: '景区详情（含时段）' })
  async areaDetail(@Param('id', ParseIntPipe) id: number) {
    const area = await this.ticketService.areaDetail(id);
    if (!area) throw new NotFoundException('景区不存在');
    return area;
  }

  @Get('areas/:id/presence')
  @ApiOperation({ summary: '实时在园情况（首页在园率）' })
  async areaPresence(@Param('id', ParseIntPipe) id: number) {
    const presence = await this.ticketService.areaPresence(id);
    if (!presence) throw new NotFoundException('景区不存在');
    return presence;
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
      // 与订单的 payDeadline 同源 —— 否则微信单先过期、我们的截止时间还没到
      expireMinutes: await this.orderService.payTimeoutMinutes(),
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
      expireMinutes: await this.orderService.payTimeoutMinutes(),
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
    // 退款审核中/退款处理中：不下发凭证（客户端也会把入口置灰，这里是兜底）
    // 只拦 10 待审核 / 20 退款中；40 已拒绝、50 退款失败是**没退成**，凭证照常可用
    if (order.refund && [RefundStatus.PENDING_AUDIT, RefundStatus.REFUNDING].includes(order.refund.status)) {
      throw new ConflictException('该订单正在退款审核中，凭证暂不可用');
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

  // ==================== 常用出行人（PRD U-031 / 技术方案 §3.2）====================

  @Get('visitors')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '常用出行人列表（脱敏，不含明文证件）' })
  listVisitors(@CurrentUser() user: MiniUser) {
    return this.visitorService.list(user.id);
  }

  @Post('visitors')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '新增常用出行人（身份证校验位验真；同证件重复添加为幂等）' })
  createVisitor(@CurrentUser() user: MiniUser, @Body() dto: CreateVisitorDto) {
    return this.visitorService.create(user.id, dto);
  }

  @Put('visitors/:id')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '编辑常用出行人（改证件会重新验真与查重；设为默认会清掉其它默认）' })
  updateVisitor(
    @CurrentUser() user: MiniUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVisitorDto,
  ) {
    return this.visitorService.update(user.id, id, dto);
  }

  @Delete('visitors/:id')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '删除常用出行人（已被订单引用的不允许删除，否则订单会缺持票人）' })
  removeVisitor(@CurrentUser() user: MiniUser, @Param('id', ParseIntPipe) id: number) {
    return this.visitorService.remove(user.id, id);
  }

  // ==================== 联调辅助（仅 mock 模式可用）====================

  @Post('pay/mock-notify')
  @UseGuards(MiniAuthGuard)
  @ApiOperation({ summary: '模拟支付成功回调（WXPAY_MOCK=true 时可用，用于本地联调）' })
  async mockNotify(@Query('orderNo') orderNo: string) {
    if (!this.wxpay.mock) {
      throw new NotFoundException('非模拟模式不支持该接口');
    }
    // 交易号必须唯一：payment.uk_transaction 是唯一索引，
    // 并发（同一毫秒）模拟支付多笔订单时，纯 Date.now() 会撞键直接 500
    const result = await this.orderService.markPaid(
      orderNo,
      `mock_txn_${Date.now()}_${randomBytes(4).toString('hex')}`,
      { mock: true, orderNo },
    );
    return result;
  }
}
