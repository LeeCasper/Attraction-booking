<script setup lang="tsx">
import { computed, onMounted, ref } from 'vue';
import { fetchDeleteBanner, fetchGetBanners, fetchGetScenicAreas, fetchUpdateBanner } from '@/service/api';
import { useTableOperate } from '@/hooks/common/table';
import { useAuth } from '@/hooks/business/auth';
import BannerOperateDrawer from './modules/banner-operate-drawer.vue';

/**
 * 首页轮播图（后台单独维护的一组，与景点解耦）。
 *
 * 为什么不做成景区表单里的一个字段：轮播是**一组**图，还要排序与启停，而景区是实体；
 * 而且「哪个景点上首页」是运营每周都会调的事，不该去改景区档案。
 *
 * 这一页不用分页组件：轮播图就几张，一次全取回来在前端排（`sort` 是唯一顺序来源，
 * 上移/下移就是跟相邻那张**换 sort**）。
 */
const { hasAuth } = useAuth();

const banners = ref<Api.Scenic.Banner[]>([]);
const areas = ref<Api.Scenic.Area[]>([]);
const loading = ref(false);

/** 景点 id → 名字（列表里显示「跳转: 嵖岈山」而不是一个 id） */
const areaNameOf = computed(() => new Map(areas.value.map(a => [a.id, a.name])));

async function getData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGetBanners();
    if (error) return;
    banners.value = data;
  } finally {
    loading.value = false;
  }
}

const { drawerVisible, operateType, editingData, handleAdd, handleEdit, onDeleted } = useTableOperate(
  banners,
  'id',
  getData
);

/** 启用/停用：停用后小程序端立刻不再返回（后台仍看得见） */
async function handleToggleStatus(row: Api.Scenic.Banner) {
  const status = row.status === 1 ? 2 : 1;
  const { error } = await fetchUpdateBanner(row.id, {
    imageUrl: row.imageUrl,
    title: row.title ?? undefined,
    subtitle: row.subtitle ?? undefined,
    scenicAreaId: row.scenicAreaId,
    sort: row.sort,
    status
  });

  if (error) return;

  window.$message?.success(status === 1 ? '已启用' : '已停用');
  getData();
}

/**
 * 上移 / 下移。
 *
 * 换完把**整组按新顺序重排为 10 / 20 / 30…**，而不是只交换两张的 sort ——
 * 新建时 sort 默认都是 0（会有重复），只交换的话「换完顺序没变」；
 * 而 banner 就几张，整组重排一次既简单又自洽（顺带把空洞也补平）。
 */
async function handleMove(row: Api.Scenic.Banner, dir: -1 | 1) {
  const at = banners.value.findIndex(b => b.id === row.id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= banners.value.length) return;

  const next = [...banners.value];
  [next[at], next[to]] = [next[to], next[at]];

  const put = (b: Api.Scenic.Banner, sort: number) =>
    fetchUpdateBanner(b.id, {
      imageUrl: b.imageUrl,
      title: b.title ?? undefined,
      subtitle: b.subtitle ?? undefined,
      scenicAreaId: b.scenicAreaId,
      sort,
      status: b.status
    });

  const results = await Promise.all(
    next.map((b, i) => {
      const sort = (i + 1) * 10;
      return b.sort === sort ? null : put(b, sort);
    })
  );

  if (results.some(r => r?.error)) return;

  await getData();
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteBanner(id);
  if (error) return;
  window.$message?.success('删除成功');
  onDeleted();
}

const columns = computed(() => [
  { prop: 'index', type: 'index' as const, label: '序号', width: 64 },
  {
    prop: 'imageUrl',
    label: '轮播图',
    width: 140,
    formatter: (row: Api.Scenic.Banner) => (
      <img
        src={`${import.meta.env.VITE_SERVICE_BASE_URL}${row.imageUrl}`}
        class="h-45px w-80px rounded object-cover"
        alt="轮播图"
      />
    )
  },
  {
    prop: 'target',
    label: '点击跳转',
    minWidth: 140,
    formatter: (row: Api.Scenic.Banner) =>
      row.scenicAreaId ? (
        <span>{areaNameOf.value.get(row.scenicAreaId) ?? `景点 #${row.scenicAreaId}`}</span>
      ) : (
        <span class="text-gray-400">不跳转（只展示图）</span>
      )
  },
  {
    prop: 'title',
    label: '图上文字',
    minWidth: 160,
    showOverflowTooltip: true,
    formatter: (row: Api.Scenic.Banner) =>
      // 有跳转时屏上显示的是景点名，标题填了也不显示 —— 这里如实标出来，免得运营以为没生效
      row.scenicAreaId ? (
        <span class="text-gray-400">（用景点名）{row.title ? ` 已填「${row.title}」不显示` : ''}</span>
      ) : (
        <span>
          {row.title || '-'}
          {row.subtitle ? <span class="text-gray-400"> / {row.subtitle}</span> : null}
        </span>
      )
  },
  { prop: 'sort', label: '排序', width: 80 },
  {
    prop: 'status',
    label: '状态',
    width: 90,
    formatter: (row: Api.Scenic.Banner) => (
      <ElTag type={row.status === 1 ? 'success' : 'info'}>{row.status === 1 ? '启用' : '停用'}</ElTag>
    )
  },
  {
    prop: 'operate',
    label: '操作',
    width: 290,
    formatter: (row: Api.Scenic.Banner) => (
      <div class="flex-center gap-8px">
        {hasAuth('scenic:update') ? (
          <ElButton size="small" text onClick={() => handleMove(row, -1)}>
            上移
          </ElButton>
        ) : null}
        {hasAuth('scenic:update') ? (
          <ElButton size="small" text onClick={() => handleMove(row, 1)}>
            下移
          </ElButton>
        ) : null}
        {hasAuth('scenic:update') ? (
          // eslint-disable-next-line @typescript-eslint/no-use-before-define -- handleEdit 来自下面的 useTableOperate，而它需要这份列表数据（两个 hook 互相依赖，这个顺序是唯一能跑的）；这行只在点击时读它，不是初始化期。
          <ElButton type="primary" plain size="small" onClick={() => handleEdit(row.id)}>
            编辑
          </ElButton>
        ) : null}
        {hasAuth('scenic:update') ? (
          <ElButton type="warning" plain size="small" onClick={() => handleToggleStatus(row)}>
            {row.status === 1 ? '停用' : '启用'}
          </ElButton>
        ) : null}
        {hasAuth('scenic:delete') ? (
          <ElPopconfirm title="确认删除这张轮播图？" onConfirm={() => handleDelete(row.id)}>
            {{
              reference: () => (
                <ElButton type="danger" plain size="small">
                  删除
                </ElButton>
              )
            }}
          </ElPopconfirm>
        ) : null}
      </div>
    )
  }
]);

onMounted(async () => {
  // 景点列表只用于把 scenicAreaId 显示成名字；拿不到不影响这一页本身
  const { data } = await fetchGetScenicAreas();
  if (data) areas.value = data;
  await getData();
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>首页轮播图</p>
          <ElButton v-if="hasAuth('scenic:create')" plain type="primary" @click="handleAdd">
            <template #icon>
              <icon-ic-round-plus class="text-icon" />
            </template>
            新增轮播图
          </ElButton>
        </div>
      </template>
      <ElAlert
        class="mb-12px"
        type="info"
        :closable="false"
        show-icon
        title="小程序首页顶部轮播就展示这一组图（按排序，只展示启用中的）"
        description="选了跳转景点：那屏显示该景点的名字与实时在园率，点了进它的购票页；不选：显示填的标题/副标题，且不可点。一张都不配时，首页会回落到按景点生成轮播。"
      />
      <ElTable v-loading="loading" border class="sm:h-full" :data="banners" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <BannerOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getData"
      />
    </ElCard>
  </div>
</template>

<style scoped></style>
