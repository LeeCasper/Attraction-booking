import { downloadFile } from '@/utils/download';

/** 导出类型 → 文件名前缀 */
const FILE_LABEL: Record<Api.Analysis.ExportType, string> = {
  orders: '订单明细',
  verifications: '核销记录',
  passages: '通行记录',
  refunds: '退款单',
  daily: '经营日报'
};

/**
 * 导出报表（CSV）
 *
 * 服务端返回 UTF-8 BOM 的 CSV，Excel/WPS 可直接打开。
 */
export async function exportReport(
  type: Api.Analysis.ExportType,
  params: { start: string; end: string; areaId?: number }
) {
  const fileName = `${FILE_LABEL[type]}_${params.start}_${params.end}.csv`;
  await downloadFile(`/admin/export/${type}`, fileName, {
    start: params.start,
    end: params.end,
    areaId: params.areaId
  });
}
