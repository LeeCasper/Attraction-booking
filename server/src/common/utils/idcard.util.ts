import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * 身份证号「校验位验真」（GB 11643-1999，ISO 7064:1983 MOD 11-2）。
 *
 * 技术方案 §3.2 明确要求小程序新增同行人时做这件事 —— 只校验 18 位数字格式是不够的：
 * 随手编的号也能过正则，而校验位算法能挡住绝大多数手误与臆造。
 *
 * ⚠️ 注意适用范围：**只有新增/编辑常用出行人的接口用严格校验**。
 * 下单接口（`CreateOrderDto`）仍然只校验格式 —— 现有四个冒烟脚本用的是构造号
 * （`idCard(seq)` 生成的号校验位并不合法），一起收紧会把它们全部打挂。
 * 要不要统一收紧是个单独的决定。
 */

/** 前 17 位的加权因子 */
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
/** 余数 → 校验位（下标 = sum % 11） */
const CHECK_CODES = '10X98765432';

/** 校验位算法本身 */
export function isIdCardChecksumValid(value: string): boolean {
  const id = (value ?? '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(id)) return false;

  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * WEIGHTS[i];
  return CHECK_CODES[sum % 11] === id[17];
}

/**
 * 完整校验：格式 + 出生日期真实存在 + 校验位。
 *
 * 单靠校验位挡不住 `11010119900231...`（2 月 31 日）这类日期本身不存在的号，
 * 所以这里把日期也验一遍 —— 避免脏数据进了库之后在核验链路上才暴露。
 */
export function isValidIdCard(value: string): boolean {
  if (!isIdCardChecksumValid(value)) return false;

  const id = value.trim().toUpperCase();
  const year = Number(id.slice(6, 10));
  const month = Number(id.slice(10, 12));
  const day = Number(id.slice(12, 14));

  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC 会把溢出的日期滚到下个月，用回读比对来识破（如 2 月 31 日 → 3 月 3 日）
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return false;
  }
  return date.getTime() <= Date.now();
}

/** class-validator 装饰器：`@IsIdCard()` */
export function IsIdCard(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isIdCard',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidIdCard(value),
        // ⚠️ 这条消息会**原样进小程序的 toast**（客户端 `errorText()` 直接取 `msg`），
        //    所以不能拿 `args.property` 拼 —— 那会甩给用户一句「idCard 不是合法的身份证号」。
        defaultMessage: () => '身份证号不正确，请核对 18 位号码后重填',
      },
    });
  };
}
