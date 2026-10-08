import { request } from '../request';

/** 实时看板 */
export function fetchGetRealtime(areaId?: number) {
  return request<Api.Stats.Realtime>({
    url: '/admin/dashboard/realtime',
    method: 'get',
    params: { areaId }
  });
}

/** 分时趋势（入园/出园/核销） */
export function fetchGetHourlyTrend(areaId?: number, date?: string) {
  return request<Api.Stats.HourlyPoint[]>({
    url: '/admin/dashboard/hourly',
    method: 'get',
    params: { areaId, date }
  });
}

/** 日统计 */
export function fetchGetDailyStats(start: string, end: string, areaId?: number) {
  return request<Api.Stats.DailyRow[]>({
    url: '/admin/stats/daily',
    method: 'get',
    params: { start, end, areaId }
  });
}

/** 重算某日统计（幂等） */
export function fetchRebuildStats(date: string, areaId?: number) {
  return request<{ date: string; areaId: number; rebuilt: boolean }>({
    url: '/admin/stats/rebuild',
    method: 'post',
    params: { date, areaId }
  });
}
