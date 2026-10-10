import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Response } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';

/**
 * 图片上传（后台用，一期只有景区封面上传）。
 *
 * ## 为什么自己写而不引 `@nestjs/serve-static`
 *
 * 静态托管只要「存下来 + 按名字读回去」，而本机装依赖要联网。`multer` 是
 * `@nestjs/platform-express` 自带的，配一个只读路由就够了，不新增任何依赖。
 *
 * 落盘没用 multer 的 `diskStorage`，而是让它按默认的**内存缓冲**收完、
 * 由这里自己 `writeFileSync` —— 一是 `multer` 没带类型声明（`diskStorage` 一引就
 * `TS7016`，为一个回调去补 `.d.ts` 不值），二是文件名本来就该在这里生成。
 *
 * ## 安全的三条底线（都实测过）
 *
 * 1. **文件名由服务端生成**，绝不采信客户端传的名字 —— 客户端给什么都可以是
 *    `../../.env`。这里固定生成 `16 位十六进制 + 白名单后缀`。
 * 2. **只收白名单里的图片类型**，后缀由 MIME 决定，不看客户端后缀。
 * 3. **读取时按严格正则校验文件名再拼路径**。这是必须的：`@Param` 里带 `..`
 *    会被解析成越级路径（`?`/`%2e%2e%2f` 之类），只要拼路径就等于把整个磁盘读出去。
 *    正则限定成上面那种固定形状，越级根本无从谈起。
 *
 * 附件放 `UPLOAD_DIR`（默认 `server/uploads/`，已在 .gitignore 里）。
 */
const MAX_BYTES = 5 * 1024 * 1024;

/** MIME → 后缀。**后缀由它决定**，不看客户端传的 originalname */
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * 读取时用的严格白名单：16 位十六进制 + 白名单后缀。
 * 与上面生成规则一一对应 —— 形状卡死，路径穿越就没有落脚点。
 */
const SAFE_NAME = /^[a-f0-9]{16}\.(jpg|png|webp)$/;

const CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** 上传目录。读 `UPLOAD_DIR`，默认落在 server/uploads */
export function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return resolve(dir);
}

/** 上传收上来的文件：只用到这几个字段，本地声明一下免得为一个类型引依赖（没有 @types/multer） */
interface UploadedImage {
  buffer?: Buffer;
  size: number;
  mimetype: string;
}

@ApiTags('后台-图片上传')
@Controller()
export class UploadController {
  /**
   * 上传图片。**路径落在 `/api/admin/**` 下**，因此走管理端 JWT + 权限；
   * 读回落在 `/api/uploads/**`，前端前缀就从管理端拿到（`/api/uploads/xxx.jpg`）。
   */
  @Post('admin/upload')
  @Permissions('scenic:update')
  @ApiOperation({ summary: '上传图片（5MB 内，jpeg/png/webp），返回相对路径' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
      /** 不收的类型直接拒；**后缀由 MIME 决定**，不看客户端传的 originalname */
      fileFilter: (
        _req: unknown,
        file: { mimetype?: string },
        cb: (err: Error | null, accept: boolean) => void,
      ) => {
        if (!file?.mimetype || !ALLOWED[file.mimetype]) {
          return cb(new BadRequestException('只支持 jpeg / png / webp 图片'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file?: UploadedImage) {
    if (!file?.buffer?.length) throw new BadRequestException('没有收到文件（字段名应为 file）');
    // 文件名在这里生成：16 位随机十六进制 + 白名单后缀，客户端传什么都不采信
    const name = `${randomBytes(8).toString('hex')}${ALLOWED[file.mimetype]}`;
    writeFileSync(join(uploadDir(), name), file.buffer);
    return {
      /** 相对路径，直接存进 `scenic_area.cover_url`；前端各自拼自己的服务端前缀 */
      url: `/uploads/${name}`,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /** 读回图片。免登录：景区封面是公开素材（小程序未登录也要能显示） */
  @Get('uploads/:name')
  @ApiOperation({ summary: '读取已上传的图片（免登录）' })
  serve(@Param('name') name: string, @Res() res: Response) {
    if (!SAFE_NAME.test(name)) throw new NotFoundException('图片不存在');
    const full = join(uploadDir(), name);
    if (!existsSync(full)) throw new NotFoundException('图片不存在');
    res.setHeader('Content-Type', CONTENT_TYPE[name.slice(name.lastIndexOf('.'))]);
    // 文件名带随机串、内容不会变，可以长缓存
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(full);
  }
}
