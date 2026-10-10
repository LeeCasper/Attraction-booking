import type { RouteMeta } from 'vue-router';
import type { CustomRoute, ElegantConstRoute, ElegantRoute } from '@elegant-router/types';
import { generatedRoutes } from '../elegant/routes';
import { layouts, views } from '../elegant/imports';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';

/**
 * custom routes
 *
 * @link https://github.com/soybeanjs/elegant-router?tab=readme-ov-file#custom-route
 */
const customRoutes: CustomRoute[] = [
  {
    name: 'exception',
    path: '/exception',
    component: 'layout.base',
    meta: {
      title: 'exception',
      i18nKey: 'route.exception',
      icon: 'ant-design:exception-outlined',
      order: 7
    },
    children: [
      {
        name: 'exception_403',
        path: '/exception/403',
        component: 'view.403',
        meta: {
          title: 'exception_403',
          i18nKey: 'route.exception_403',
          icon: 'ic:baseline-block'
        }
      },
      {
        name: 'exception_404',
        path: '/exception/404',
        component: 'view.404',
        meta: {
          title: 'exception_404',
          i18nKey: 'route.exception_404',
          icon: 'ic:baseline-web-asset-off'
        }
      },
      {
        name: 'exception_500',
        path: '/exception/500',
        component: 'view.500',
        meta: {
          title: 'exception_500',
          i18nKey: 'route.exception_500',
          icon: 'ic:baseline-wifi-off'
        }
      }
    ]
  },
  {
    name: 'document',
    path: '/document',
    component: 'layout.base',
    meta: {
      title: 'document',
      i18nKey: 'route.document',
      order: 2,
      icon: 'mdi:file-document-multiple-outline'
    },
    children: [
      {
        name: 'document_antd',
        path: '/document/antd',
        component: 'view.iframe-page',
        props: {
          url: 'https://antdv.com/components/overview-cn'
        },
        meta: {
          title: 'document_antd',
          i18nKey: 'route.document_antd',
          order: 7,
          icon: 'logos:ant-design'
        }
      },
      {
        name: 'document_naive',
        path: '/document/naive',
        component: 'view.iframe-page',
        props: {
          url: 'https://www.UI.com/zh-CN/os-theme/docs/introduction'
        },
        meta: {
          title: 'document_naive',
          i18nKey: 'route.document_naive',
          order: 6,
          icon: 'logos:naiveui'
        }
      },
      {
        name: 'document_element-plus',
        path: '/document/element-plus',
        component: 'view.iframe-page',
        props: {
          url: 'https://element-plus.org/zh-CN/'
        },
        meta: {
          title: 'document_element-plus',
          i18nKey: 'route.document_element-plus',
          order: 7,
          icon: 'ep:element-plus'
        }
      },
      {
        name: 'document_alova',
        path: '/document/alova',
        component: 'view.iframe-page',
        props: {
          url: 'https://alova.js.org'
        },
        meta: {
          title: 'document_alova',
          i18nKey: 'route.document_alova',
          order: 8,
          localIcon: 'alova'
        }
      },
      {
        name: 'document_project',
        path: '/document/project',
        component: 'view.iframe-page',
        props: {
          url: 'https://docs.soybeanjs.cn/zh'
        },
        meta: {
          title: 'document_project',
          i18nKey: 'route.document_project',
          order: 1,
          localIcon: 'logo'
        }
      },
      {
        name: 'document_project-link',
        path: '/document/project-link',
        component: 'view.iframe-page',
        meta: {
          title: 'document_project-link',
          i18nKey: 'route.document_project-link',
          order: 2,
          localIcon: 'logo',
          // use href to open the page, the routeName must be ends with '-link'
          href: 'https://docs.soybeanjs.cn/zh'
        }
      },
      {
        name: 'document_unocss',
        path: '/document/unocss',
        component: 'view.iframe-page',
        props: {
          url: 'https://unocss.dev/'
        },
        meta: {
          title: 'document_unocss',
          i18nKey: 'route.document_unocss',
          order: 5,
          icon: 'logos:unocss'
        }
      },
      {
        name: 'document_vite',
        path: '/document/vite',
        component: 'view.iframe-page',
        props: {
          url: 'https://cn.vitejs.dev/'
        },
        meta: {
          title: 'document_vite',
          i18nKey: 'route.document_vite',
          order: 4,
          icon: 'logos:vitejs'
        }
      },
      {
        name: 'document_vue',
        path: '/document/vue',
        component: 'view.iframe-page',
        props: {
          url: 'https://cn.vuejs.org/'
        },
        meta: {
          title: 'document_vue',
          i18nKey: 'route.document_vue',
          order: 3,
          icon: 'logos:vue'
        }
      }
    ]
  }
];

/**
 * 业务菜单 meta 覆盖
 *
 * elegant-router 依据 `src/views/**` 自动生成业务路由（path / component 自动维护），
 * 但生成的 meta 只有 title=i18nKey。业务页面要求中文标题、图标、排序与角色权限，
 * 因此在这里按路由名补齐，避免与自动生成机制冲突。
 *
 * - `i18nKey: null`：强制使用中文 title（模板规则是 i18nKey 优先于 title）
 * - `roles`：按后端角色 code 过滤；父级不设 roles，子路由全被过滤时父菜单自动消失
 *   （超管经 VITE_STATIC_SUPER_ROLE=super 直通）
 */
const businessRouteMeta: Record<string, Partial<RouteMeta>> = {
  // 数据看板
  dashboard: { title: '数据看板', icon: 'mdi:chart-line', order: 1 },
  dashboard_realtime: {
    title: '实时看板',
    icon: 'mdi:monitor-dashboard',
    roles: ['super', 'admin', 'finance', 'ops', 'leader']
  },
  // 核销中心（检票员日常使用，放在靠前位置）
  verify: { title: '核销中心', icon: 'mdi:qrcode-scan', order: 2 },
  verify_desk: { title: '核销台', icon: 'mdi:line-scan', roles: ['super', 'admin', 'checker'] },
  verify_record: { title: '核销记录', icon: 'mdi:clipboard-check-outline', roles: ['super', 'admin', 'checker'] },
  // 景区管理
  scenic: { title: '景区管理', icon: 'mdi:map-marker-radius-outline', order: 3 },
  scenic_area: { title: '景区信息', icon: 'mdi:information-outline', roles: ['super', 'admin'] },
  scenic_announcement: { title: '公告管理', icon: 'mdi:bullhorn-outline', roles: ['super', 'admin'] },
  // 票务管理
  ticket: { title: '票务管理', icon: 'mdi:ticket-confirmation-outline', order: 4 },
  'ticket_ticket-type': { title: '票种管理', icon: 'mdi:tag-multiple-outline', roles: ['super', 'admin'] },
  'ticket_time-slot': { title: '时段管理', icon: 'mdi:clock-time-four-outline', roles: ['super', 'admin'] },
  'ticket_price-calendar': { title: '价格日历', icon: 'mdi:calendar-star', roles: ['super', 'admin'] },
  ticket_stock: { title: '库存管理', icon: 'mdi:warehouse', roles: ['super', 'admin'] },
  // 订单管理
  order: { title: '订单管理', icon: 'mdi:clipboard-text-outline', order: 5 },
  order_list: { title: '订单查询', icon: 'mdi:file-search-outline', roles: ['super', 'admin', 'finance'] },
  order_refund: { title: '退款审核', icon: 'mdi:cash-refund', roles: ['super', 'admin', 'finance'] },
  // 闸机管理（运维）
  gate: { title: '闸机管理', icon: 'mdi:gate', order: 6 },
  gate_device: { title: '闸机设备', icon: 'mdi:devices', roles: ['super', 'admin', 'ops'] },
  gate_passage: { title: '通行记录', icon: 'mdi:transit-connection-variant', roles: ['super', 'admin', 'ops'] },
  gate_alarm: { title: '告警中心', icon: 'mdi:alert-octagon-outline', roles: ['super', 'admin', 'ops'] },
  // 运营分析
  analysis: { title: '运营分析', icon: 'mdi:chart-areaspline', order: 7 },
  analysis_overview: {
    title: '经营分析',
    icon: 'mdi:finance',
    roles: ['super', 'admin', 'finance', 'leader']
  },
  // 运维管理
  ops: { title: '运维管理', icon: 'mdi:tools', order: 8 },
  ops_reconcile: { title: '三方对账', icon: 'mdi:scale-balance', roles: ['super', 'admin', 'finance'] },
  ops_backup: { title: '数据备份', icon: 'mdi:database-arrow-down-outline', roles: ['super', 'ops'] },
  // 系统管理
  system: { title: '系统管理', icon: 'mdi:cog-outline', order: 9 },
  system_role: { title: '角色权限', icon: 'mdi:shield-account-outline', roles: ['super'] },
  'system_admin-user': { title: '管理员', icon: 'mdi:account-cog-outline', roles: ['super'] },
  // 与后端 log:read 权限对应的角色（运维/财务也需查日志）
  'system_operation-log': { title: '操作日志', icon: 'mdi:file-document-outline', roles: ['super', 'admin', 'finance', 'ops'] },
  // 与后端 `config:read` 的授权范围对齐（种子把 config:read 给了 admin / finance）——
  // 菜单以前写死 `['super']`，于是这两个角色调得动接口却看不到入口。
  // 写权限 `config:update` 仍只有超管，页面里用 hasAuth 把「编辑」按钮藏掉。
  system_config: { title: '参数配置', icon: 'mdi:tune', roles: ['super', 'admin', 'finance'] }
};

/** 递归处理用的结构化节点类型（ElegantRoute 是可辨识联合，叶子路由没有 children 字段） */
interface RouteNode {
  name: string;
  meta?: RouteMeta;
  children?: RouteNode[];
  [key: string]: unknown;
}

/** 递归为自动生成的路由注入业务 meta */
function withBusinessMeta(routes: unknown[]): unknown[] {
  return routes.map(route => {
    const node = route as RouteNode;
    const override = businessRouteMeta[node.name];

    const children = node.children?.length ? withBusinessMeta(node.children) : node.children;

    if (!override) {
      return children === node.children ? route : { ...node, children };
    }

    return {
      ...node,
      ...(children ? { children } : {}),
      meta: {
        ...node.meta,
        ...override,
        i18nKey: null
      }
    };
  });
}

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = [];

  const authRoutes: ElegantRoute[] = [];

  [...customRoutes, ...(withBusinessMeta(generatedRoutes as unknown[]) as unknown as ElegantRoute[])].forEach(item => {
    if (item.meta?.constant) {
      constantRoutes.push(item);
    } else {
      authRoutes.push(item);
    }
  });

  return {
    constantRoutes,
    authRoutes
  };
}

/**
 * Get auth vue routes
 *
 * @param routes Elegant routes
 */
export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(routes, layouts, views);
}
