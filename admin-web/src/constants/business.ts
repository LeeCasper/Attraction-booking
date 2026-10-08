/**
 * 业务枚举与选项
 *
 * 服务端状态位统一以 number 返回（见 server/deploy/sql/init.sql 各表注释），
 * 与模板 mock 契约的字符串状态不同，故本文件自行定义。
 */

/** 通用启用状态：1 启用 / 2 禁用 */
export const enableStatusRecord: Record<number, string> = {
  1: '启用',
  2: '禁用'
};

export const enableStatusOptions = [
  { value: 1, label: '启用' },
  { value: 2, label: '禁用' }
];

/** 票种状态：1 上架 / 2 下架 */
export const ticketStatusRecord: Record<number, string> = {
  1: '上架',
  2: '下架'
};

/** 公告状态：1 已发布 / 2 下架 */
export const announcementStatusRecord: Record<number, string> = {
  1: '已发布',
  2: '下架'
};

/** 是否实名 */
export const needRealnameRecord: Record<number, string> = {
  0: '否',
  1: '是'
};

/** 时段状态 */
export const slotStatusRecord: Record<number, string> = enableStatusRecord;
