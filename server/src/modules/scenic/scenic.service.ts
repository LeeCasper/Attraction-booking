import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Announcement, ScenicArea } from '../../database/entities/scenic.entity';

@Injectable()
export class ScenicService {
  constructor(
    @InjectRepository(ScenicArea) private readonly areaRepo: Repository<ScenicArea>,
    @InjectRepository(Announcement) private readonly annoRepo: Repository<Announcement>,
    private readonly dataSource: DataSource,
  ) {}

  listAreas() {
    return this.areaRepo.find({ order: { id: 'ASC' } });
  }

  async getArea(id: number) {
    const area = await this.areaRepo.findOne({ where: { id } });
    if (!area) throw new NotFoundException('景区不存在');
    return area;
  }

  createArea(body: Partial<ScenicArea>) {
    return this.areaRepo.save(this.areaRepo.create(body));
  }

  async updateArea(id: number, body: Partial<ScenicArea>) {
    await this.getArea(id);
    await this.areaRepo.update(id, body);
    return this.getArea(id);
  }

  /**
   * 删除景区。**有引用时拒绝**（409），并提示改用「关闭」。
   *
   * ## 为什么必须拦
   *
   * `init.sql` 里**一条外键都没有**（全库刻意不用 FK、只有索引），所以 `areaRepo.delete(id)`
   * 之后什么都不级联，四类引用全变孤儿：
   *
   * | 表 | 删完会怎样 |
   * | --- | --- |
   * | `gate_device.scenic_area_id` | 那台闸机**核不了任何单**（`GATE_NO_PERMISSION 该闸机不服务于本景区`）|
   * | `orders.scenic_area_id` | 后台**按景区看时"消失"**（逐景区求和遍历现存景区），但「全部」里还算着 |
   * | `ticket_type` / `time_slot` / `ticket_stock` | 页面上查不到、也删不掉 |
   *
   * 实测踩过：删掉示例景区之后，两台示例闸机 + 一批订单全挂在那儿，`smoke:gate` 与
   * `smoke:m4` 跟着红（那两条都是**数据问题的正确报警**，见 CLAUDE.md）。
   *
   * 想下线景区请用「关闭」（`status = 0`）—— 小程序端 `/api/mini/areas` 只返回开放中的景区，
   * 关闭后就不再展示，而已有的订单、票种、闸机绑定全都留着。
   *
   * 实现上**用一条 SQL 数四张表**：只为一个校验往 scenic 模块里引四个实体不划算。
   */
  async removeArea(id: number) {
    await this.getArea(id);

    const [refs] = (await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM orders       WHERE scenic_area_id = ?) AS orders,
         (SELECT COUNT(*) FROM time_slot    WHERE scenic_area_id = ?) AS slots,
         (SELECT COUNT(*) FROM gate_device  WHERE scenic_area_id = ?) AS gates,
         -- ⚠️ 只数**在架**的票种：票种的「删除」其实是下架（status=2，为了保住历史订单的引用，见
         -- TicketTypeService.remove），按全量数会让「建错的景区」永远删不掉
         (SELECT COUNT(*) FROM ticket_type  WHERE scenic_area_id = ? AND status = 1) AS tickets`,
      [id, id, id, id],
    )) as Array<{ orders: number; tickets: number; slots: number; gates: number }>;

    const used = [
      refs.orders > 0 ? `${refs.orders} 张订单` : '',
      refs.tickets > 0 ? `${refs.tickets} 个在架票种` : '',
      refs.slots > 0 ? `${refs.slots} 个时段` : '',
      refs.gates > 0 ? `${refs.gates} 台闸机` : '',
    ].filter(Boolean);

    if (used.length > 0) {
      throw new ConflictException(
        `该景区下还有 ${used.join('、')}，不能删除 —— 硬删会把它们变成查不到的孤儿数据` +
          `（闸机会直接核不了单）。下线景区请改用「关闭」：小程序不再展示，历史数据与闸机绑定都保留。`,
      );
    }

    await this.areaRepo.delete(id);
    return null;
  }

  async listAnnouncements(areaId: number, status?: number) {
    return this.annoRepo.find({
      where: { scenicAreaId: areaId, ...(status ? { status } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  async createAnnouncement(areaId: number, body: { title: string; content?: string }) {
    const a = await this.annoRepo.save(
      this.annoRepo.create({ scenicAreaId: areaId, title: body.title, content: body.content, status: 1, publishedAt: new Date() }),
    );
    return { id: Number(a.id) };
  }

  async updateAnnouncement(id: number, body: { title?: string; content?: string; status?: number }) {
    const a = await this.annoRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('公告不存在');
    await this.annoRepo.update(id, body);
    return null;
  }

  async removeAnnouncement(id: number) {
    const a = await this.annoRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('公告不存在');
    await this.annoRepo.delete(id);
    return null;
  }
}
