import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderService } from '../order/order.service';
import { WxPayService, NotifyHeaders } from './wxpay.service';
import { OrderItem, Orders, Reservation } from '../../database/entities/order.entity';
import { Payment, Refund } from '../../database/entities/pay.entity';
import { TicketStock, TicketType } from '../../database/entities/ticket.entity';
import { OrderItemStatus, OrderStatus, RefundStatus, ReservationStatus } from '../../common/enums/status.enum';
import { StockCacheService } from '../ticket/stock-cache.service';
import { generateRefundNo } from '../order/order-no.util';

/** 退款金额计算所需上下文 */
interface RefundContext {
  order: Orders;
  reservation: Reservation | null;
  ticketType: TicketType | null;
  itemCount: number;
}

@Injectable()
export class PayService {
  private readonly logger = new Logger(PayService.name);

  constructor(
    @InjectRepository(Orders) private readonly ordersRepo: Repository<Orders>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Refund) private readonly refundRepo: Repository<Refund>,
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    private readonly wxpay: WxPayService,
    private readonly orderService: OrderService,
    private readonly stockCache: StockCacheService,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== 支付 ====================

  /**
   * 处理支付结果回调
   *
   * 验签 → 解密 → 幂等落库（markPaid）。返回 true 时微信将停止重试。
   */
  async handlePaidNotify(headers: NotifyHeaders, rawBody: string): Promise<void> {
    await this.wxpay.verifyNotify(headers, rawBody);

    const notify = JSON.parse(rawBody) as { resource: any };
    const resource = this.wxpay.decryptResource<{
      out_trade_no: string;
      transaction_id: string;
      trade_state: string;
      amount?: { total?: number };
    }>(notify.resource);

    if (resource.trade_state !== 'SUCCESS') {
      this.logger.warn(`收到非成功支付通知：${resource.out_trade_no} ${resource.trade_state}`);
      return;
    }

    const res = await this.orderService.markPaid(
      resource.out_trade_no,
      resource.transaction_id,
      resource as unknown as Record<string, unknown>,
    );
    this.logger.log(
      `支付成功：${resource.out_trade_no}${res.alreadyHandled ? '（重复通知，已忽略）' : ''}`,
    );
  }

  /**
   * 主动查单补偿（设计文档 §6.2 要点 3）
   *
   * 覆盖「用户已支付但回调丢失」：扫描下单 5~15 分钟仍待支付的订单，
   * 向微信查单，确认已支付则补记。
   */
  async compensatePendingOrders(limit = 50): Promise<{ checked: number; fixed: number }> {
    if (this.wxpay.mock) return { checked: 0, fixed: 0 };

    const rows = await this.dataSource.query(
      `SELECT order_no FROM orders
        WHERE status = ?
          AND pay_deadline > NOW()
          AND created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        ORDER BY id ASC LIMIT ?`,
      [OrderStatus.PENDING_PAY, limit],
    );

    let fixed = 0;
    for (const row of rows as { order_no: string }[]) {
      try {
        const res = await this.wxpay.queryOrder(row.order_no);
        if (res.tradeState === 'SUCCESS') {
          await this.orderService.markPaid(row.order_no, res.transactionId, res.raw);
          fixed++;
          this.logger.warn(`查单补偿成功：${row.order_no}`);
        }
      } catch (err) {
        this.logger.error(`查单失败 ${row.order_no}：${(err as Error).message}`);
      }
    }
    return { checked: rows.length, fixed };
  }

  /** 支付流水（对账用） */
  async listPayments(orderId: number) {
    return this.dataSource.getRepository(Payment).find({ where: { orderId } });
  }

  // ==================== 退款 ====================

  /**
   * 用户申请退款：校验退改规则并计算手续费后落「待审核」
   */
  async applyRefund(orderId: number, userId: number, reason: string) {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('订单不存在');

    if (![OrderStatus.PAID, OrderStatus.PARTIAL_VERIFIED].includes(order.status)) {
      throw new BadRequestException('当前订单状态不可申请退款');
    }

    const ctx = await this.refundContext(order);
    const { refundable, fee, actual } = await this.calcRefund(ctx);
    if (!refundable) {
      throw new BadRequestException('该预约已超过可退时间，不可退款');
    }

    const existing = await this.refundRepo.findOne({
      where: { orderId, status: RefundStatus.PENDING_AUDIT },
    });
    if (existing) throw new BadRequestException('该订单已有待审核的退款申请');

    const refund = await this.refundRepo.save(
      this.refundRepo.create({
        refundNo: generateRefundNo(),
        orderId,
        orderItemId: null,
        userId,
        amount: order.amount,
        actualAmount: actual,
        fee,
        reason: reason || '用户申请退款',
        status: RefundStatus.PENDING_AUDIT,
      }),
    );

    return { refundId: Number(refund.id), refundNo: refund.refundNo, fee, actualAmount: actual };
  }

  /** 后台退款审核（设计文档 A-022） */
  async auditRefund(refundId: number, adminId: number, approve: boolean, remark?: string) {
    const refund = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('退款单不存在');
    if (refund.status !== RefundStatus.PENDING_AUDIT) {
      throw new BadRequestException('该退款单已审核');
    }

    if (!approve) {
      await this.refundRepo.update(refundId, {
        status: RefundStatus.REJECTED,
        auditBy: adminId,
        auditRemark: remark ?? '审核拒绝',
        auditedAt: new Date(),
      });
      return { status: RefundStatus.REJECTED };
    }

    const order = await this.ordersRepo.findOne({ where: { id: refund.orderId } });
    if (!order) throw new NotFoundException('订单不存在');

    await this.refundRepo.update(refundId, {
      status: RefundStatus.REFUNDING,
      auditBy: adminId,
      auditRemark: remark ?? '审核通过',
      auditedAt: new Date(),
    });

    // 调微信退款（模拟模式下直接返回成功）
    const res = await this.wxpay.createRefund({
      refundNo: refund.refundNo,
      orderNo: order.orderNo,
      refundAmount: refund.actualAmount ?? refund.amount,
      totalAmount: order.amount,
      reason: refund.reason,
    });

    if (res.status === 'SUCCESS' || this.wxpay.mock) {
      await this.finalizeRefund(refund.refundNo, res.refundId, res.status);
      return { status: RefundStatus.REFUNDED };
    }

    await this.refundRepo.update(refundId, { wxRefundId: res.refundId ?? null });
    return { status: RefundStatus.REFUNDING };
  }

  /** 退款结果回调 */
  async handleRefundNotify(headers: NotifyHeaders, rawBody: string): Promise<void> {
    await this.wxpay.verifyNotify(headers, rawBody);
    const notify = JSON.parse(rawBody) as { resource: any };
    const resource = this.wxpay.decryptResource<{
      out_refund_no: string;
      refund_id?: string;
      refund_status: string;
    }>(notify.resource);

    if (resource.refund_status !== 'SUCCESS') {
      this.logger.warn(`退款未成功：${resource.out_refund_no} ${resource.refund_status}`);
      await this.refundRepo.update(
        { refundNo: resource.out_refund_no },
        { status: RefundStatus.FAILED, wxRefundId: resource.refund_id ?? null },
      );
      return;
    }

    await this.finalizeRefund(resource.out_refund_no, resource.refund_id, resource.refund_status);
  }

  /**
   * 退款成功落库（幂等）
   *
   * 事务内：退款单已退款 → 订单已退款 → 明细已退款 → 库存 sold 回减；
   * 事务外回补 Redis 可用量。
   */
  async finalizeRefund(refundNo: string, wxRefundId?: string, wxStatus?: string): Promise<void> {
    const refund = await this.refundRepo.findOne({ where: { refundNo } });
    if (!refund) throw new NotFoundException(`退款单不存在：${refundNo}`);
    if (refund.status === RefundStatus.REFUNDED) return; // 幂等

    const order = await this.ordersRepo.findOne({ where: { id: refund.orderId } });
    if (!order) throw new NotFoundException('订单不存在');

    const items = await this.itemRepo.find({ where: { orderId: order.id } });
    const reservation = order.reservationId
      ? await this.dataSource
          .getRepository(Reservation)
          .findOne({ where: { id: order.reservationId } })
      : null;

    await this.dataSource.transaction(async (em) => {
      await em.update(Refund, refund.id, {
        status: RefundStatus.REFUNDED,
        wxRefundId: wxRefundId ?? null,
        refundedAt: new Date(),
      });
      await em.update(Orders, order.id, { status: OrderStatus.REFUNDED });
      if (items.length) {
        await em.update(
          OrderItem,
          { orderId: order.id },
          { status: OrderItemStatus.REFUNDED, refundId: refund.id },
        );
      }
      if (reservation) {
        await em.update(Reservation, reservation.id, { status: ReservationStatus.CANCELLED });
      }

      // 已售回减（库存回流）
      if (reservation && items.length) {
        await em.query(
          'UPDATE ticket_stock SET sold = GREATEST(sold - ?, 0) WHERE ticket_type_id = ? AND date = ? AND time_slot_id = ?',
          [
            items.length,
            items[0].ticketTypeId,
            reservation.date,
            reservation.timeSlotId,
          ],
        );
      }
    });

    // 库存回流后可用量增加
    if (reservation && items.length) {
      const stock = await this.dataSource.getRepository(TicketStock).findOne({
        where: {
          ticketTypeId: items[0].ticketTypeId,
          date: reservation.date,
          timeSlotId: reservation.timeSlotId,
        },
      });
      if (stock) await this.stockCache.resync(stock.id);
    }

    this.logger.log(`退款完成：${refundNo}（${wxStatus ?? ''}）`);
  }

  /** 退款单列表（后台） */
  async listRefunds(page: number, pageSize: number, status?: number) {
    const [items, total] = await this.refundRepo.findAndCount({
      where: status ? { status } : {},
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    if (items.length === 0) return { items: [], total };

    const orders = await this.ordersRepo.find({
      where: items.map((r) => ({ id: r.orderId })),
    });
    return {
      items: items.map((r) => ({
        ...r,
        orderNo: orders.find((o) => o.id === r.orderId)?.orderNo ?? '',
        orderAmount: orders.find((o) => o.id === r.orderId)?.amount ?? 0,
      })),
      total,
    };
  }

  // ==================== 退改规则 ====================

  /** 计算是否可退、手续费、实退金额 */
  private async calcRefund(ctx: RefundContext): Promise<{
    refundable: boolean;
    fee: number;
    actual: number;
  }> {
    const rule = ctx.ticketType?.refundRule ?? {};
    const beforeDay = Number((rule as Record<string, unknown>).beforeDay ?? 1);
    const feeRate = Number((rule as Record<string, unknown>).feeRate ?? 0.2);
    const expiredNoRefund = (rule as Record<string, unknown>).expiredNoRefund !== false;

    const total = ctx.order.amount;
    if (!ctx.reservation) {
      return { refundable: true, fee: 0, actual: total };
    }

    const visitDate = new Date(`${ctx.reservation.date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysAhead = Math.round((visitDate.getTime() - today.getTime()) / 86400000);

    if (daysAhead < 0) {
      // 已过预约日
      return expiredNoRefund
        ? { refundable: false, fee: 0, actual: 0 }
        : { refundable: true, fee: total, actual: 0 };
    }

    if (daysAhead >= beforeDay) {
      return { refundable: true, fee: 0, actual: total };
    }

    const fee = Math.round(total * feeRate);
    return { refundable: true, fee, actual: total - fee };
  }

  private async refundContext(order: Orders): Promise<RefundContext> {
    const items = await this.itemRepo.find({ where: { orderId: order.id } });
    const reservation = order.reservationId
      ? await this.dataSource.getRepository(Reservation).findOne({ where: { id: order.reservationId } })
      : null;
    const ticketType = items.length
      ? await this.typeRepo.findOne({ where: { id: items[0].ticketTypeId } })
      : null;
    return { order, reservation, ticketType, itemCount: items.length };
  }
}
