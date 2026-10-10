/**
 * 「参数配置」页的已知配置键 → 表单字段。
 *
 * 以前这一页对**所有**键都是同一个裸 JSON 文本框（`{"name":"..."}` 得手写），
 * 运营很容易写错。现在已知键渲染成带标签、带校验的字段；不认识的键回落到 JSON 编辑器
 * （所以后端新增配置键时，前端不改也不会坏，只是没表单）。
 *
 * ⚠️ `percent` 类型的 `min`/`max`/`value` 都是**显示口径（0~100）**，
 * 提交时会 ÷100 存回 `sys_config`（后端存的是 0~1 的比率，如 0.8）。
 */
export type ConfigFieldType = 'text' | 'number' | 'percent' | 'switch';

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  /** 数值/百分比字段的范围（**显示口径**） */
  min?: number;
  max?: number;
  step?: number;
  /** 字段下方的说明文字 */
  help?: string;
}

export interface ConfigSchema {
  title: string;
  fields: ConfigField[];
}

export const CONFIG_SCHEMA: Record<string, ConfigSchema> = {
  platform: {
    title: '平台信息',
    fields: [
      { key: 'name', label: '平台名称', type: 'text', help: '小程序顶栏的中文名' },
      { key: 'nameEn', label: '英文名', type: 'text', help: '顶栏中文名右侧的小字' },
      { key: 'subtitle', label: '副标题', type: 'text' },
      { key: 'logoUrl', label: 'Logo 地址', type: 'text', help: '留空则使用默认渐变图标' },
      { key: 'contactPhone', label: '客服电话', type: 'text' },
      { key: 'icp', label: 'ICP 备案号', type: 'text' },
      { key: 'copyright', label: '版权/主办信息', type: 'text' },
      { key: 'productName', label: '产品名', type: 'text', help: '默认「智慧文旅」，单独一项是为了避免与平台名称叠字' },
      {
        key: 'version',
        label: '版本号',
        type: 'text',
        help: '**自带 V 前缀**（填 V1.2.0）。个人中心页脚渲染成「{名称}{产品名} {版本号}」'
      }
    ]
  },
  reservation: {
    title: '预约规则',
    fields: [
      {
        key: 'payTimeoutMinutes',
        label: '支付超时（分钟）',
        type: 'number',
        min: 1,
        max: 120,
        step: 1,
        help: '超过该时长的待支付订单会被自动取消并释放锁定库存；微信预支付单也按这个时间失效'
      },
      { key: 'cancelOnTimeout', label: '超时自动取消', type: 'switch' }
    ]
  },
  capacity_alarm: {
    title: '承载量预警阈值',
    fields: [
      {
        key: 'warn',
        label: '80% 档阈值（在园率 %）',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        help: '在园人数 / 最大承载量 达到该值即告警（2 级）'
      },
      { key: 'serious', label: '90% 档阈值（在园率 %）', type: 'percent', min: 0, max: 100, step: 1 },
      {
        key: 'critical',
        label: '100% 档阈值（在园率 %）',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        help: '三档须递增（80% ≤ 90% ≤ 100%）。定时任务每 60 秒检查一次，改完最多 1 分钟生效'
      }
    ]
  },
  refund: {
    title: '退改规则（全局兜底）',
    fields: [
      {
        key: 'beforeDay',
        label: '提前多少天免手续费',
        type: 'number',
        min: 0,
        max: 30,
        step: 1,
        help: '距离入园日还有这么多天及以上时申请退款不收手续费'
      },
      {
        key: 'feeRate',
        label: '窗口内手续费率（%）',
        type: 'percent',
        min: 0,
        max: 100,
        step: 1,
        help: '在免手续费窗口内申请退款时收取的比例'
      },
      {
        key: 'expiredNoRefund',
        label: '过期不可退',
        type: 'switch',
        help: '预约日已过之后是否一律不予退款'
      }
    ]
  }
};

/** 字段类型 → 默认值（用于配置里缺该字段时） */
export function fieldDefault(field: ConfigField): string | number | boolean {
  if (field.type === 'switch') return true;
  if (field.type === 'text') return '';
  return field.min ?? 0;
}

/** 存库值 → 表单显示值（百分比 ×100） */
export function toFormValue(field: ConfigField, stored: unknown): string | number | boolean {
  if (stored === undefined || stored === null) return fieldDefault(field);
  if (field.type === 'percent') return Math.round(Number(stored) * 10000) / 100;
  if (field.type === 'number') return Number(stored);
  if (field.type === 'switch') return stored !== false;
  return String(stored);
}

/** 表单显示值 → 存库值（百分比 ÷100） */
export function toStoredValue(field: ConfigField, form: unknown): string | number | boolean {
  if (field.type === 'percent') return Number(form) / 100;
  if (field.type === 'number') return Number(form);
  if (field.type === 'switch') return form === true;
  return String(form ?? '');
}
