import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { AdminRole, Role } from '../../database/entities/rbac.entity';
import { RedisClient, REDIS_CLIENT } from '../redis/redis.constants';
import { Inject } from '@nestjs/common';

@Injectable()
export class AdminUserService {
  constructor(
    @InjectRepository(AdminUser) private readonly adminRepo: Repository<AdminUser>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(AdminRole) private readonly adminRoleRepo: Repository<AdminRole>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async list(page: number, pageSize: number, keyword?: string) {
    const qb = this.adminRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.username', 'u.real_name', 'u.phone', 'u.status', 'u.last_login_at', 'u.created_at'])
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (keyword) qb.andWhere('u.username LIKE :kw', { kw: `%${keyword}%` });
    const [items, total] = await qb.getManyAndCount();

    const ids = items.map((u) => Number(u.id));
    const relations = ids.length
      ? await this.adminRoleRepo.find({ where: { adminId: In(ids) } })
      : [];
    const roleIds = [...new Set(relations.map((r) => Number(r.roleId)))];
    const roles = roleIds.length ? await this.roleRepo.find({ where: { id: In(roleIds) } }) : [];

    return {
      items: items.map((u) => ({
        ...u,
        roles: relations
          .filter((r) => r.adminId === u.id)
          .map((r) => roles.find((ro) => ro.id === r.roleId)?.name)
          .filter(Boolean),
      })),
      total,
    };
  }

  async create(body: { username: string; password: string; realName?: string; phone?: string; roleIds?: number[] }) {
    const exists = await this.adminRepo.findOne({ where: { username: body.username } });
    if (exists) throw new BadRequestException('用户名已存在');
    if (body.roleIds?.length) await this.assertRolesExist(body.roleIds);

    const user = await this.adminRepo.save(
      this.adminRepo.create({
        username: body.username,
        password: await bcrypt.hash(body.password, 10),
        realName: body.realName,
        phone: body.phone,
      }),
    );
    if (body.roleIds?.length) {
      await this.adminRoleRepo.save(
        body.roleIds.map((roleId) => ({ adminId: user.id, roleId })),
      );
    }
    return { id: Number(user.id) };
  }

  async update(id: number, body: { realName?: string; phone?: string; status?: number; roleIds?: number[] }) {
    const user = await this.adminRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('管理员不存在');
    if (user.username === 'admin' && body.status === 2) {
      throw new BadRequestException('内置管理员不可禁用');
    }
    if (body.roleIds) await this.assertRolesExist(body.roleIds);

    await this.adminRepo.update(id, {
      realName: body.realName,
      phone: body.phone,
      status: body.status,
    });
    if (body.roleIds) {
      const roleIds = body.roleIds;
      await this.adminRoleRepo.manager.transaction(async (em) => {
        await em.delete(AdminRole, { adminId: id });
        if (roleIds.length) {
          await em.insert(AdminRole, roleIds.map((roleId) => ({ adminId: id, roleId })));
        }
      });
      await this.redis.del(`perm:admin:${id}`);
    }
    return null;
  }

  async resetPassword(id: number, newPassword: string) {
    const user = await this.adminRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('管理员不存在');
    await this.adminRepo.update(id, {
      password: await bcrypt.hash(newPassword, 10),
      pwdFailCount: 0,
      pwdLockedUntil: null,
    });
    return null;
  }

  async remove(id: number) {
    const user = await this.adminRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('管理员不存在');
    if (user.username === 'admin') throw new BadRequestException('内置管理员不可删除');
    await this.adminRepo.delete(id);
    await this.adminRoleRepo.delete({ adminId: id });
    await this.redis.del(`perm:admin:${id}`);
    return null;
  }

  private async assertRolesExist(roleIds: number[]) {
    const count = await this.roleRepo.count({ where: { id: In(roleIds) } });
    if (count !== new Set(roleIds).size) throw new BadRequestException('包含不存在的角色');
  }
}
