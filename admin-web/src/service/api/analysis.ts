import { request } from '../request';

/** 运营概览（转化 + 财务 + 票种 + 渠道，一次拉取） */
export function fetchGetAnalysisOverview(params: Api.Analysis.RangeParams) {
  return request<Api.Analysis.Overview>({
    url: '/admin/analysis/overview',
    method: 'get',
    params
  });
}

/** 预约与经营趋势（按日） */
export function fetchGetAnalysisTrend(params: Api.Analysis.RangeParams) {
  return request<Api.Analysis.TrendPoint[]>({
    url: '/admin/analysis/trend',
    method: 'get',
    params
  });
}

/** 转化指标：核销率 / 爽约率 / 退单率 */
export function fetchGetConversion(params: Api.Analysis.RangeParams) {
  return request<Api.Analysis.Conversion>({
    url: '/admin/analysis/conversion',
    method: 'get',
    params
  });
}

/** 客流分析（分时 / 日 / 月） */
export function fetchGetTraffic(
  params: Api.Analysis.RangeParams & { granularity?: 'hour' | 'day' | 'month' }
) {
  return request<Api.Analysis.TrafficPoint[]>({
    url: '/admin/analysis/traffic',
    method: 'get',
    params
  });
}

/** 票种分析 */
export function fetchGetTicketTypeStats(params: Api.Analysis.RangeParams) {
  return request<Api.Analysis.TicketTypeStat[]>({
    url: '/admin/analysis/ticket-types',
    method: 'get',
    params
  });
}

/** 渠道分析 */
export function fetchGetChannelStats(params: Api.Analysis.RangeParams) {
  return request<Api.Analysis.ChannelStat[]>({
    url: '/admin/analysis/channels',
    method: 'get',
    params
  });
}

/** 财务分析 */
export function fetchGetFinance(params: Api.Analysis.RangeParams) {
  return request<Api.Analysis.Finance>({
    url: '/admin/analysis/finance',
    method: 'get',
    params
  });
}
