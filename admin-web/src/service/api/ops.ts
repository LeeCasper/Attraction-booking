import { request } from '../request';

// ============ 对账 ============

/** 执行指定日期对账（幂等） */
export function fetchRunReconciliation(date: string, areaId?: number) {
  return request<Api.Ops.ReconciliationRow>({
    url: '/admin/reconciliations/run',
    method: 'post',
    params: { date, areaId }
  });
}

/** 对账记录列表 */
export function fetchGetReconciliations(
  params: Api.Common.BackendPageParams & { status?: number | null }
) {
  return request<Api.Common.BackendPageRecord<Api.Ops.ReconciliationRow>>({
    url: '/admin/reconciliations',
    method: 'get',
    params
  });
}

/** 对账详情（含差异明细） */
export function fetchGetReconciliationDetail(date: string) {
  return request<Api.Ops.ReconciliationDetail>({
    url: `/admin/reconciliations/${date}`,
    method: 'get'
  });
}

// ============ 备份 ============

/** 手动触发数据库备份 */
export function fetchRunBackup() {
  return request<{ id?: number; fileName?: string; fileSize?: number; status?: number; skipped?: boolean }>({
    url: '/admin/backups/run',
    method: 'post'
  });
}

/** 备份记录列表 */
export function fetchGetBackups(params: Api.Common.BackendPageParams) {
  return request<Api.Common.BackendPageRecord<Api.Ops.BackupRow>>({
    url: '/admin/backups',
    method: 'get',
    params
  });
}

/** 下载备份文件（浏览器直接触发下载） */
export async function downloadBackup(id: number) {
  const { downloadFile } = await import('@/utils/download');
  await downloadFile(`/admin/backups/${id}/download`, `backup_${id}.sql.gz`);
}
