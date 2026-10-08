/** ioredis 客户端注入令牌 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export type RedisClient = import('ioredis').default;
