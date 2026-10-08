import type { FlatResponseData } from '@sa/axios';
import type { PaginationData } from '@sa/hooks';

/**
 * 后端「数组」响应 → 表格数据
 *
 * 服务端部分列表接口（票种、时段、价格日历、库存、角色、参数配置）不分页，
 * 直接返回数组，这里包装成表格需要的分页结构（单页渲染，展示总条数）。
 */
export function backendArrayTransform<ApiData>(response: FlatResponseData<any, ApiData[]>): PaginationData<ApiData> {
  const { data, error } = response;

  if (error) {
    return { data: [], pageNum: 1, pageSize: 10, total: 0 };
  }

  return {
    data,
    pageNum: 1,
    pageSize: data.length || 10,
    total: data.length
  };
}

/**
 * 后端「分页」响应 { items, total } → 表格数据
 *
 * 服务端分页接口（管理员、操作日志）统一返回 { items, total }，
 * 与模板默认的 { records, current, size, total } 不同，故单独适配。
 *
 * @param getParams 当前页码与每页条数（后端按请求参数回显）
 */
export function backendPageTransform<ApiData>(getParams: () => { page: number; pageSize: number }) {
  return (response: FlatResponseData<any, Api.Common.BackendPageRecord<ApiData>>): PaginationData<ApiData> => {
    const { data, error } = response;
    const { page, pageSize } = getParams();

    if (error) {
      return { data: [], pageNum: page, pageSize, total: 0 };
    }

    return {
      data: data.items,
      pageNum: page,
      pageSize,
      total: data.total
    };
  };
}
