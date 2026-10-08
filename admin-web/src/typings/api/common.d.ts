/**
 * Namespace Api
 *
 * All backend api type
 */
declare namespace Api {
  namespace Common {
    /** common params of paginating */
    interface PaginatingCommonParams {
      /** current page number */
      current: number;
      /** page size */
      size: number;
      /** total count */
      total: number;
    }

    /** common params of paginating query list data */
    interface PaginatingQueryRecord<T = any> extends PaginatingCommonParams {
      records: T[];
    }

    /** common search params of table */
    type CommonSearchParams = Pick<Common.PaginatingCommonParams, 'current' | 'size'>;

    /**
     * enable status
     *
     * - "1": enabled
     * - "2": disabled
     */
    type EnableStatus = '1' | '2';

    /** common record */
    type CommonRecord<T = any> = {
      /** record id */
      id: number;
      /** record creator */
      createBy: string;
      /** record create time */
      createTime: string;
      /** record updater */
      updateBy: string;
      /** record update time */
      updateTime: string;
      /** record status */
      status: EnableStatus | undefined;
    } & T;

    // ===== 以下是本项目的服务端契约（与模板的 mock 契约不同）=====

    /**
     * 服务端分页响应
     *
     * 本项目服务端分页接口返回 { items, total }，与模板默认的 { records, current, size, total } 不同，
     * 需用 utils/backend.ts 的 backendPageTransform 适配。
     */
    interface BackendPageRecord<T> {
      items: T[];
      total: number;
    }

    /** 服务端分页查询参数 */
    interface BackendPageParams {
      page?: number;
      pageSize?: number;
    }
  }
}
