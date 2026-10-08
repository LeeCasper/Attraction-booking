import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement, ScenicArea } from '../../database/entities/scenic.entity';

@Injectable()
export class ScenicService {
  constructor(
    @InjectRepository(ScenicArea) private readonly areaRepo: Repository<ScenicArea>,
    @InjectRepository(Announcement) private readonly annoRepo: Repository<Announcement>,
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

  async removeArea(id: number) {
    await this.getArea(id);
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
