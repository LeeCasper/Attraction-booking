import { request } from '../request';

// ============ 闸机设备 ============

/** 闸机列表（含在线状态与最后心跳） */
export function fetchGetGates(areaId?: number) {
  return request<Api.Gate.Device[]>({
    url: '/admin/gates',
    method: 'get',
    params: { areaId }
  });
}

/** 远程控制：开闸 / 常开 / 常闭 / 重启 */
export function fetchGateCommand(id: number, type: Api.Gate.CommandType, remark?: string) {
  return request<{ commandNo: string; type: string; status: number }>({
    url: `/admin/gates/${id}/command`,
    method: 'post',
    data: { type, remark }
  });
}

/** 闸机通信日志 */
export function fetchGetGateLogs(id: number, limit = 50) {
  return request<
    {
      id: number;
      gateId: number | null;
      action: string;
      request: Record<string, unknown> | null;
      response: Record<string, unknown> | null;
      costMs: number | null;
      createdAt: string;
    }[]
  >({
    url: `/admin/gates/${id}/logs`,
    method: 'get',
    params: { limit }
  });
}

// ============ 通行记录 ============

/** 通行记录（入园/出园/拒绝/异常） */
export function fetchGetPassages(params: Api.Common.BackendPageParams & Api.Gate.PassageSearchParams) {
  return request<Api.Common.BackendPageRecord<Api.Gate.PassageRow>>({
    url: '/admin/passages',
    method: 'get',
    params
  });
}

// ============ 告警 ============

/** 告警列表 */
export function fetchGetAlarms(params: Api.Common.BackendPageParams & Api.Gate.AlarmSearchParams) {
  return request<Api.Common.BackendPageRecord<Api.Gate.AlarmRow>>({
    url: '/admin/alarms',
    method: 'get',
    params
  });
}

/** 处理告警 */
export function fetchHandleAlarm(id: number, remark: string) {
  return request<null>({
    url: `/admin/alarms/${id}/handle`,
    method: 'post',
    data: { remark }
  });
}
