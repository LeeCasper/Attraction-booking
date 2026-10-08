import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { CipherUtil, maskIdCard } from '../../common/utils/cipher.util';
import { CIPHER } from '../security/security.module';
import { StockCacheService, ReserveResult } from '../ticket/stock-cache.service';
import { OrderItemStatus, OrderStatus, PaymentStatus, ReservationStatus } from '../../common/enums/status.enum';
import { OrderItem, Orders, Reservation } from '../../database/entities/order.entity';
import { Payment } from '../../database/entities/pay.entity';
import { Blacklist, Visitor } from '../../database/entities/user.entity';
import {
  PriceCalendar,
  TicketStock,
  TicketType,
  TimeSlot,
} from '../../database/entities/ticket.entity';
import { PurchaseRule } from '../ticket/purchase-rule.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { generateOrderNo } from './order-no.util';
import { RedisClient, REDIS_CLIENT } from '../redis/redis.constants';

/** 支付超时时间（分钟），与 sys_config.reservation.payTimeoutMinutes 对应 */
const PAY_TIMEOUT_MINUTES = 15;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Orders) private readonly ordersRepo: Repository<Orders>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Visitor) private readonly visitorRepo: Repository<Visitor>,
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    @InjectRepository(TicketStock) private readonly stockRepo: Repository<TicketStock>,
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    @InjectRepository(PriceCalendar) private readonly priceRepo: Repository<PriceCalendar>,
    @InjectRepository(PurchaseRule) private readonly ruleRepo: Repository<PurchaseRule>,
    @InjectRepository(Blacklist) private readonly blacklistRepo: Repository<Blacklist>,
    @Inject(CIPHER) private readonly cipher: CipherUtil,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly dataSource: DataSource,
    private readonly stockCache: StockCacheService,
  ) {}

  /**
   * 创建订单（设计文档 §4.2）
   *
   * 顺序：基础校验 → 游客落库/黑名单 → 限购校验 → Redis Lua 预减 → DB 事务（乐观锁 + 落库）
   * 任一环节失败都会回补 Redis 预减量。
   */
  async create(userId: number, dto: CreateOrderDto) {
    const visitors = dto.visitors;

    // ---- 1. 票种 / 时段校验 ----
    const ticketType = await this.typeRepo.findOne({ where: { id: dto.ticketTypeId, status: 1 } });
    if (!ticketType) throw new BadRequestException('票种不存在或已下架');

    const slot = await this.slotRepo.findOne({
      where: { id: dto.timeSlotId, scenicAreaId: ticketType.scenicAreaId, status: 1 },
    });
    if (!slot) throw new BadRequestException('该景区未提供此入园时段');

    // ---- 2. 游客落库（加密 + 黑名单 + 同单去重）----
    const visitorEntities: Visitor[] = [];
    const seenHash = new Set<string>();
    for (const v of visitors) {
      const idCardHash = this.cipher.hash(v.idCard);
      if (seenHash.has(idCardHash)) {
        throw new BadRequestException(`同一订单内证件重复：${v.name}`);
      }
      seenHash.add(idCardHash);

      const blocked = await this.blacklistRepo.findOne({
        where: { type: 1, valueHash: idCardHash, status: 1 },
      });
      if (blocked && (!blocked.expireTime || blocked.expireTime > new Date())) {
        throw new ForbiddenException(`证件 ${maskIdCard(v.idCard)} 已被限制预约`);
      }

      let visitor = await this.visitorRepo.findOne({
        where: { userId, idCardHash },
      });
      if (!visitor) {
        visitor = await this.visitorRepo.save(
          this.visitorRepo.create({
            userId,
            name: v.name,
            idCardEnc: this.cipher.encrypt(v.idCard),
            idCardHash,
            idCardMask: maskIdCard(v.idCard),
            phoneEnc: v.phone ? this.cipher.encrypt(v.phone) : null,
          }),
        );
      }
      visitorEntities.push(visitor);
    }

    // ---- 3. 限购校验 ----
    await this.assertPurchaseLimit(userId, ticketType.id, dto.date, visitorEntities, visitors.length);

    // ---- 4. 库存记录 ----
    const stock = await this.stockRepo.findOne({
      where: { ticketTypeId: ticketType.id, date: dto.date, timeSlotId: slot.id },
    });
    if (!stock) throw new BadRequestException('该日期时段未开放预约');

    // ---- 5. 价格（价格日历优先，否则票种基础价）----
    const calendar = await this.priceRepo.findOne({
      where: { ticketTypeId: ticketType.id, date: dto.date },
    });
    const price = calendar?.price ?? ticketType.basePrice;
    const amount = price * visitors.length;

    // ---- 6. Redis Lua 预减（快速拦截超卖）----
    const reserve = await this.stockCache.tryReserve(stock.id, visitors.length);
    if (reserve.result === ReserveResult.INSUFFICIENT) {
      throw new BadRequestException('余票不足');
    }
    if (reserve.result === ReserveResult.UNAVAILABLE) {
      // 缓存不可用：降级为纯 MySQL 乐观锁（性能下降但不会超卖）
      this.logger.warn(`库存缓存不可用，降级为 DB 乐观锁：stockId=${stock.id}`);
    }

    // ---- 7. DB 事务：乐观锁扣减 + 落库 ----
    try {
      const order = await this.dataSource.transaction(async (em) => {
        const upd: { affectedRows: number } = await em.query(
          'UPDATE ticket_stock SET locked = locked + ? WHERE id = ? AND total - sold - locked >= ?',
          [visitors.length, stock.id, visitors.length],
        );
        if (upd.affectedRows !== 1) {
          throw new BadRequestException('余票不足');
        }

        const orderNo = generateOrderNo();
        const orderIns = await em.insert(Orders, {
          orderNo,
          userId,
          scenicAreaId: ticketType.scenicAreaId,
          reservationId: null,
          amount,
          status: OrderStatus.PENDING_PAY,
          channel: 'mini',
          payDeadline: new Date(Date.now() + PAY_TIMEOUT_MINUTES * 60_000),
        });
        const orderId = Number(orderIns.identifiers[0].id);

        const resIns = await em.insert(Reservation, {
          orderId,
          scenicAreaId: ticketType.scenicAreaId,
          date: dto.date,
          timeSlotId: slot.id,
          status: ReservationStatus.PENDING,
          verifyCount: 0,
          totalCount: visitors.length,
        });
        const reservationId = Number(resIns.identifiers[0].id);

        await em.insert(
          OrderItem,
          visitorEntities.map((v) => ({
            orderId,
            visitorId: v.id,
            ticketTypeId: ticketType.id,
            price,
            status: OrderItemStatus.PENDING,
          })),
        );

        await em.update(Orders, orderId, { reservationId });

        return { orderId, orderNo, reservationId, amount };
      });

      // ---- 8. 成功：更新限购计数 ----
      await this.bumpLimitCounter(userId, ticketType.id, dto.date, visitors.length, visitorEntities);

      return {
        ...order,
        payDeadline: new Date(Date.now() + PAY_TIMEOUT_MINUTES * 60_000),
        ticketName: ticketType.name,
        slotName: slot.name,
        visitorCount: visitors.length,
      };
    } catch (err) {
      // DB 侧失败：回补 Redis 预减，避免可用量泄漏
      if (reserve.result === ReserveResult.OK) {
        await this.stockCache.release(stock.id, visitors.length);
      }
      throw err;
    }
  }

  /**
   * 取消订单（仅待支付可取消），事务内释放锁定库存
   *
   * @param userId 传入时校验归属（小程序端）；定时任务等系统调用可不传
   */
  async cancel(orderId: number, userId?: number, reason = '用户取消') {
    const order = await this.ordersRepo.findOne({
      where: userId ? { id: orderId, userId } : { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== OrderStatus.PENDING_PAY) {
      throw new BadRequestException('该订单当前状态不可取消');
    }

    const items = await this.itemRepo.find({ where: { orderId } });
    const reservation = await this.reservationOf(order);

    await this.dataSource.transaction(async (em) => {
      const upd: { affectedRows: number } = await em.query(
        'UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ? AND status = ?',
        [OrderStatus.CANCELLED, reason, orderId, OrderStatus.PENDING_PAY],
      );
      if (upd.affectedRows !== 1) {
        throw new BadRequestException('订单状态已变更，请刷新后重试');
      }

      if (reservation) {
        await em.update(Reservation, reservation.id, { status: ReservationStatus.CANCELLED });
      }
      if (reservation && items.length > 0) {
        const stock = await em.findOne(TicketStock, {
          where: {
            ticketTypeId: items[0].ticketTypeId,
            date: reservation.date,
            timeSlotId: reservation.timeSlotId,
          },
        });
        if (stock) {
          await em.query(
            'UPDATE ticket_stock SET locked = GREATEST(locked - ?, 0) WHERE id = ?',
            [items.length, stock.id],
          );
          await this.stockCache.release(stock.id, items.length);
        }
      }
    });

    return null;
  }

  /**
   * 后台订单列表（多条件筛选 + 分页）
   */
  async adminList(params: {
    page: number;
    pageSize: number;
    status?: number;
    orderNo?: string;
    phone?: string;
    date?: string;
  }) {
    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .orderBy('o.id', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize);

    if (params.status) qb.andWhere('o.status = :status', { status: params.status });
    if (params.orderNo) qb.andWhere('o.order_no LIKE :orderNo', { orderNo: `%${params.orderNo}%` });

    if (params.date) {
      qb.innerJoin(Reservation, 'r', 'r.id = o.reservation_id').andWhere('r.date = :date', {
        date: params.date,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    if (items.length === 0) return { items: [], total };

    const orderIds = items.map((o) => o.id);
    const orderItems = await this.itemRepo.find({ where: { orderId: In(orderIds) } });
    const reservations = await this.dataSource.getRepository(Reservation).find({
      where: { orderId: In(orderIds) },
    });

    // 按手机号筛选需解密比对，量小直接在内存过滤
    let rows = items.map((o) => ({
      ...o,
      itemCount: orderItems.filter((i) => i.orderId === o.id).length,
      reservationDate: reservations.find((r) => r.orderId === o.id)?.date ?? null,
      timeSlotId: reservations.find((r) => r.orderId === o.id)?.timeSlotId ?? null,
    }));

    if (params.phone) {
      const visitors = await this.visitorRepo.find({
        where: { id: In(orderItems.map((i) => i.visitorId)) },
      });
      const matched = new Set(
        visitors
          .filter((v) => v.phoneEnc && this.cipher.decrypt(v.phoneEnc).includes(params.phone!))
          .map((v) => v.id),
      );
      rows = rows.filter((r) =>
        orderItems.some((i) => i.orderId === r.id && matched.has(i.visitorId)),
      );
    }

    return { items: rows, total: params.phone ? rows.length : total };
  }

  /** 用户订单列表 */
  async listByUser(userId: number, status?: number) {
    const where = status ? { userId, status } : { userId };
    const orders = await this.ordersRepo.find({ where, order: { id: 'DESC' }, take: 50 });
    if (orders.length === 0) return [];

    const items = await this.itemRepo.find({ where: { orderId: In(orders.map((o) => o.id)) } });
    const reservations = await this.dataSource.getRepository(Reservation).find({
      where: { orderId: In(orders.map((o) => o.id)) },
    });

    return orders.map((o) => ({
      ...o,
      itemCount: items.filter((i) => i.orderId === o.id).length,
      reservation: reservations.find((r) => r.orderId === o.id) ?? null,
    }));
  }

  /** 订单详情（含游客、票种、时段、支付/退款信息） */
  async detail(orderId: number, userId?: number) {
    const order = await this.ordersRepo.findOne({
      where: userId ? { id: orderId, userId } : { id: orderId },
    });
    if (!order) throw new NotFoundException('订单不存在');

    const items = await this.itemRepo.find({ where: { orderId } });
    const reservation = await this.reservationOf(order);
    const visitors = items.length
      ? await this.visitorRepo.find({ where: { id: In(items.map((i) => i.visitorId)) } })
      : [];
    const types = items.length
      ? await this.typeRepo.find({ where: { id: In(items.map((i) => i.ticketTypeId)) } })
      : [];
    const slot = reservation
      ? await this.slotRepo.findOne({ where: { id: reservation.timeSlotId } })
      : null;

    return {
      ...order,
      reservation,
      timeSlot: slot,
      items: items.map((i) => {
        const v = visitors.find((x) => x.id === i.visitorId);
        return {
          ...i,
          visitorName: v?.name ?? '',
          // 只回传脱敏证件号，明文不出库不出接口
          visitorIdCard: v?.idCardMask ?? '',
          ticketName: types.find((t) => t.id === i.ticketTypeId)?.name ?? '',
        };
      }),
    };
  }

  /** 按单号查订单（支付回调按 out_trade_no 定位） */
  async findByNo(orderNo: string) {
    return this.ordersRepo.findOne({ where: { orderNo } });
  }

  /**
   * 标记支付成功（支付回调 / 主动查单共用）
   *
   * 幂等：订单已是「已支付」及之后状态时直接返回，不重复扣转库存。
   * 事务内完成：订单状态迁移 + 库存 locked→sold（可用量不变）。
   */
  async markPaid(orderNo: string, transactionId?: string, rawCallback?: Record<string, unknown>) {
    const order = await this.ordersRepo.findOne({ where: { orderNo } });
    if (!order) throw new NotFoundException(`订单不存在：${orderNo}`);
    if (order.status !== OrderStatus.PENDING_PAY) {
      // 重复通知：已完成处理
      return { alreadyHandled: true, orderId: order.id, status: order.status };
    }

    const items = await this.itemRepo.find({ where: { orderId: order.id } });
    const reservation = await this.reservationOf(order);

    await this.dataSource.transaction(async (em) => {
      const upd: { affectedRows: number } = await em.query(
        'UPDATE orders SET status = ?, pay_time = NOW() WHERE id = ? AND status = ?',
        [OrderStatus.PAID, order.id, OrderStatus.PENDING_PAY],
      );
      if (upd.affectedRows !== 1) {
        // 并发下另一路已处理
        return;
      }

      if (reservation && items.length > 0) {
        await em.query(
          'UPDATE ticket_stock SET locked = GREATEST(locked - ?, 0), sold = sold + ? WHERE ticket_type_id = ? AND date = ? AND time_slot_id = ?',
          [items.length, items.length, items[0].ticketTypeId, reservation.date, reservation.timeSlotId],
        );
      }

      await em.insert(Payment, {
        orderId: order.id,
        transactionId: transactionId ?? null,
        amount: order.amount,
        status: PaymentStatus.SUCCESS,
        rawCallback: rawCallback ?? null,
        callbackTime: new Date(),
      } as QueryDeepPartialEntity<Payment>);
    });

    // 支付成功后可用量不变（locked→sold），无需同步 Redis
    return { alreadyHandled: false, orderId: order.id };
  }

  /** 取订单关联的预约 */
  private async reservationOf(order: Orders): Promise<Reservation | null> {
    if (!order.reservationId) return null;
    return this.dataSource.getRepository(Reservation).findOne({ where: { id: order.reservationId } });
  }

  /** 限购校验：单笔 / 每人每日 / 每证每日（以预约日期归集） */
  private async assertPurchaseLimit(
    userId: number,
    ticketTypeId: number,
    date: string,
    visitorEntities: Visitor[],
    count: number,
  ) {
    const rule = await this.ruleRepo.findOne({ where: { ticketTypeId } });
    const perOrder = rule?.perUserPerOrder ?? 4;
    const perUserDay = rule?.perUserPerDay ?? 5;
    const perIdCardDay = rule?.perIdcardPerDay ?? 1;

    if (count > perOrder) {
      throw new BadRequestException(`单笔最多购买 ${perOrder} 张`);
    }

    // Redis 快速预检（DB 为准，Redis 只用于挡住明显超限的请求）
    const cachedUser = Number((await this.redis.get(this.limitKey('user', userId, ticketTypeId, date))) ?? 0);
    if (cachedUser + count > perUserDay) {
      throw new BadRequestException(`每人每日限购 ${perUserDay} 张`);
    }

    const activeStatuses = [
      OrderStatus.PENDING_PAY,
      OrderStatus.PAID,
      OrderStatus.PARTIAL_VERIFIED,
      OrderStatus.VERIFIED,
    ];

    const userBought = await this.countBought({ ticketTypeId, date, userId }, activeStatuses);
    if (userBought + count > perUserDay) {
      throw new BadRequestException(
        `每人每日限购 ${perUserDay} 张，当前已购 ${userBought} 张`,
      );
    }

    for (const v of visitorEntities) {
      const cardBought = await this.countBought(
        { ticketTypeId, date, visitorId: v.id },
        activeStatuses,
      );
      if (cardBought + 1 > perIdCardDay) {
        throw new BadRequestException(
          `证件 ${v.idCardMask} 当日已购买，每证每日限购 ${perIdCardDay} 张`,
        );
      }
    }
  }

  /** 统计已购数量（按预约日期归集，仅统计占用库存的订单状态） */
  private async countBought(
    filter: { ticketTypeId: number; date: string; userId?: number; visitorId?: number },
    statuses: OrderStatus[],
  ): Promise<number> {
    const qb = this.itemRepo
      .createQueryBuilder('oi')
      .innerJoin(Orders, 'o', 'o.id = oi.order_id')
      .innerJoin(Reservation, 'r', 'r.id = o.reservation_id')
      .where('oi.ticket_type_id = :ticketTypeId', { ticketTypeId: filter.ticketTypeId })
      .andWhere('r.date = :date', { date: filter.date })
      .andWhere('o.status IN (:...statuses)', { statuses });

    if (filter.userId) qb.andWhere('o.user_id = :userId', { userId: filter.userId });
    if (filter.visitorId) qb.andWhere('oi.visitor_id = :visitorId', { visitorId: filter.visitorId });

    return qb.getCount();
  }

  private limitKey(scope: 'user' | 'card', id: number, ticketTypeId: number, date: string): string {
    return `limit:${scope}:${id}:${ticketTypeId}:${date}`;
  }

  /** 下单成功后累加限购计数（次日零点过期） */
  private async bumpLimitCounter(
    userId: number,
    ticketTypeId: number,
    date: string,
    count: number,
    visitorEntities: Visitor[],
  ) {
    const ttl = this.secondsUntilEndOfDay();
    const userKey = this.limitKey('user', userId, ticketTypeId, date);
    await this.redis.incrby(userKey, count);
    await this.redis.expire(userKey, ttl);

    for (const v of visitorEntities) {
      const cardKey = this.limitKey('card', v.id, ticketTypeId, date);
      await this.redis.incrby(cardKey, 1);
      await this.redis.expire(cardKey, ttl);
    }
  }

  private secondsUntilEndOfDay(): number {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return Math.max(60, Math.floor((end.getTime() - now.getTime()) / 1000));
  }
}
