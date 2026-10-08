import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skipTransform';

/**
 * 跳过统一响应体封装（{ code, msg, data }）
 *
 * 用于必须返回第三方约定格式的接口，如微信支付回调
 * （微信要求返回 {"code":"SUCCESS","message":"成功"}）。
 */
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
