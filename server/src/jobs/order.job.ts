import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Orders } from '../database/entities/order.entity';
import { OrderStatus } from '../common/enums/status.enum';
import { OrderService } from '../modules/order/order.service';
import { PayService } from '../modules/pay/pay.service';
import { WxPayService } from '../modules/pay/wxpay.service';

/**
 * 订单相关定时任务（设计文档 §4.3）
 *
 * - 支付超时取消：30s 扫描一次，先查单再取消（防「已支付但回调丢失」被误取消）
 * - 查单补偿：5 分钟一次，覆盖回调不可达场景
 */
@Injectable()
export class OrderJob {
  private readonly logger = new Logger(OrderJob.name);
  private timeoutRunning = false;
  private compensateRunning = false;

  constructor(
    @InjectRepository(Orders) private readonly ordersRepo: Repository<Orders>,
    private readonly orderService: OrderService,
    private readonly payService: PayService,
    private readonly wxpay: WxPayService,
  ) {}

  /** 每 30 秒：取消超时未支付订单并释放库存 */
  @Interval(30_000)
  async cancelTimeoutOrders() {
    if (this.timeoutRunning) return;
    this.timeoutRunning = true;

    try {
      const expired = await this.ordersRepo.find({
        where: { status: OrderStatus.PENDING_PAY, payDeadline: LessThan(new Date()) },
        order: { id: 'ASC' },
        take: 200,
      });
      if (expired.length === 0) return;

      for (const order of expired) {
        try {
          // 先查单：确认确实未支付（非 mock 模式）
          if (!this.wxpay.mock) {
            const q = await this.wxpay.queryOrder(order.orderNo);
            if (q.tradeState === 'SUCCESS') {
              await this.orderService.markPaid(order.orderNo, q.transactionId, q.raw);
              continue;
            }
          }
          await this.orderService.cancel(order.id, undefined, '支付超时自动取消');
        } catch (err) {
          this.logger.error(`超时取消失败 orderId=${order.id}：${(err as Error).message}`);
        }
      }
      this.logger.log(`支付超时任务处理 ${expired.length} 单`);
    } finally {
      this.timeoutRunning = false;
    }
  }

  /** 每 5 分钟：主动查单补偿回调丢失 */
  @Interval(300_000)
  async compensate() {
    if (this.compensateRunning) return;
    this.compensateRunning = true;

    try {
      const res = await this.payService.compensatePendingOrders();
      if (res.fixed > 0) {
        this.logger.warn(`查单补偿：检查 ${res.checked} 单，补记 ${res.fixed} 单`);
      }
    } catch (err) {
      this.logger.error(`查单补偿失败：${(err as Error).message}`);
    } finally {
      this.compensateRunning = false;
    }
  }
}
