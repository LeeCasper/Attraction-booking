import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * 单笔订单里的一位游客，支持**两种写法二选一**：
 *
 *   - `{ visitorId }` —— 选一位**已保存的常用出行人**。
 *     这条路径是必需的：`GET /api/mini/visitors` 出于隐私设计**只返回脱敏证件号**，
 *     小程序端手里没有明文，没法回传；服务端按 id 取记录并校验归属。
 *   - `{ name, idCard, phone? }` —— 直接录入新游客（沿用原来的隐式落库逻辑）。
 */
export class VisitorDto {
  @IsOptional() @IsInt() visitorId?: number;

  // 下面的 name / idCard 只在「没有传 visitorId」时才必填 —— 用 ValidateIf 表达二选一
  @ValidateIf((o: VisitorDto) => o.visitorId === undefined)
  @IsString() @MinLength(2) @MaxLength(32) name?: string;

  /** 身份证号（服务端加密存储，仅用于哈希比对） */
  @ValidateIf((o: VisitorDto) => o.visitorId === undefined)
  @IsString() @Matches(/^\d{17}[\dXx]$/, { message: '身份证号格式不正确' }) idCard?: string;

  @IsOptional() @IsString() @Matches(/^1\d{10}$/, { message: '手机号格式不正确' }) phone?: string;
}

export class CreateOrderDto {
  @IsInt() ticketTypeId: number;

  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式需为 yyyy-MM-dd' }) date: string;

  @IsInt() timeSlotId: number;

  @IsArray()
  @ArrayMinSize(1, { message: '请至少添加一位游客' })
  @ArrayMaxSize(10, { message: '单笔最多 10 位游客' })
  @ValidateNested({ each: true })
  @Type(() => VisitorDto)
  visitors: VisitorDto[];
}
