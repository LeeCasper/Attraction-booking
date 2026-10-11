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

/**
 * 新增闸机。
 *
 * 返回里的 `secretKey` **只在这一次给**（列表接口不下发）—— 要拿它去配设备的签名密钥，
 * 而操作日志里也刻意不记它（append-only，谁都查得到）。
 */
export function fetchCreateGate(data: Api.Gate.GateCreatePayload) {
  return request<Api.Gate.GateCreateResult>({
    url: '/admin/gates',
    method: 'post',
    data
  });
}

/** 编辑闸机（名称/位置/IP/方向/所属景区/启用禁用/密钥，只改传了的字段） */
export function fetchUpdateGate(id: number, data: Api.Gate.GateUpdatePayload) {
  return request<{ id: number; changed: number }>({
    url: `/admin/gates/${id}`,
    method: 'put',
    data
  });
}

/** 删除闸机（只允许删还没跑过的；有通行/日志/告警记录时服务端 409） */
export function fetchDeleteGate(id: number) {
  return request<null>({
    url: `/admin/gates/${id}`,
    method: 'delete'
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
