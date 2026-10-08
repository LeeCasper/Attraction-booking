import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdminRole, Role, RolePermission } from '../../database/entities/rbac.entity';
import { REDIS_CLIENT, RedisClient } from '../redis/redis.constants';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission) private readonly permRepo: Repository<RolePermission>,
    @InjectRepository(AdminRole) private readonly adminRoleRepo: Repository<AdminRole>,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async list() {
    const roles = await this.roleRepo.find({ order: { id: 'ASC' } });
    const perms = await this.permRepo.find();
    return roles.map((r) => ({
      ...r,
      permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission),
    }));
  }

  async create(body: { name: string; code: string; remark?: string; permissions?: string[] }) {
    const exists = await this.roleRepo.findOne({ where: { code: body.code } });
    if (exists) throw new BadRequestException('角色编码已存在');
    const role = await this.roleRepo.save(this.roleRepo.create({ name: body.name, code: body.code, remark: body.remark }));
    if (body.permissions?.length) await this.assignPermissions(Number(role.id), body.permissions);
    return { id: Number(role.id) };
  }

  async update(id: number, body: { name?: string; remark?: string; status?: number }) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.code === 'super') throw new BadRequestException('内置超管角色不可修改');
    await this.roleRepo.update(id, body);
    await this.invalidatePermissionCache([id]);
    return null;
  }

  async remove(id: number) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.code === 'super') throw new BadRequestException('内置超管角色不可删除');
    const used = await this.adminRoleRepo.count({ where: { roleId: id } });
    if (used > 0) throw new BadRequestException('角色下存在管理员，无法删除');
    await this.roleRepo.delete(id);
    await this.permRepo.delete({ roleId: id });
    return null;
  }

  /** 整体替换角色权限 */
  async assignPermissions(roleId: number, permissions: string[]) {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.code === 'super') throw new BadRequestException('超管角色默认拥有全部权限');
    const valid = [...new Set(permissions)].filter((p) => /^[a-z_*]+:[a-z_*]+$|^\*$/.test(p));
    if (permissions.length && valid.length !== permissions.length) {
      throw new BadRequestException('存在非法权限标识');
    }
    await this.permRepo.manager.transaction(async (em) => {
      await em.delete(RolePermission, { roleId });
      if (valid.length) {
        await em.insert(
          RolePermission,
          valid.map((permission) => ({ roleId, permission })),
        );
      }
    });
    await this.invalidatePermissionCache([roleId]);
    return null;
  }

  /** 角色权限变更后清掉相关管理员的权限缓存 */
  private async invalidatePermissionCache(roleIds: number[]) {
    const rows = await this.adminRoleRepo.find({ where: { roleId: In(roleIds) } });
    for (const r of rows) {
      await this.redis.del(`perm:admin:${r.adminId}`);
    }
  }
}
