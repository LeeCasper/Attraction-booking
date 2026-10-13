<script setup lang="tsx">
/**
 * 公告管理。
 *
 * 两类公告共用一个列表：**提示公告**（小程序首页顶部那一行，多条轮播）与**弹窗公告**
 * （进首页弹一次，同一条每天最多一次）。一个公告还可以**不挂景点**（全平台投放）。
 *
 * 三处与「景区」页不同的地方，都是有意的：
 * 1. 顶部不再是「先选景区才能看」—— 公告可以属于全平台，按景区切会把它藏起来；
 *    改成「范围」三态筛选（全部 / 只看全平台 / 某个景点）。
 * 2. 列表不分页、用本地数组 —— 排序上移/下移要重排整组（照 `views/scenic/banner/index.vue` 的做法）。
 * 3. 上移/下移**只在同类型内换位**：小程序端 `tips` 与 `popups` 是各自按 `sort` 排的，
 *    跨类型换位没有任何效果（用户看到的顺序不会变）。
 */
import { computed, onMounted, ref } from 'vue';
import {
  announcementLinkRecord,
  announcementStatusRecord,
  announcementTypeOptions,
  announcementTypeRecord
} from '@/constants/business';
import {
  fetchDeleteAnnouncement,
  fetchGetAnnouncements,
  fetchGetScenicAreas,
  fetchUpdateAnnouncement
} from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import AnnouncementOperateDrawer from './modules/announcement-operate-drawer.vue';

const { hasAuth } = useAuth();

const list = ref<Api.Scenic.Announcement[]>([]);
const areas = ref<Api.Scenic.Area[]>([]);
const loading = ref(false);

/** 筛选：范围三态 + 景点 + 类型 + 状态 */
const scope = ref<'all' | 'platform' | 'scenic'>('all');
const scenicAreaId = ref<number | null>(null);
const type = ref<number | null>(null);
const status = ref<number | null>(null);

/** 景点 id → 名字（列表里显示「嵖岈山」而不是一个 id） */
const areaNameOf = computed(() => new Map(areas.value.map(a => [a.id, a.name])));

const drawerVisible = ref(false);
const operateType = ref<UI.TableOperateType>('add');
const editingData = ref<Api.Scenic.Announcement | null>(null);

async function getData() {
  loading.value = true;
  try {
    const { data, error } = await fetchGetAnnouncements({
      scope: scope.value,
      scenicAreaId: scope.value === 'scenic' ? scenicAreaId.value : null,
      type: type.value,
      status: status.value
    });
    if (error) return;
    list.value = data ?? [];
  } finally {
    loading.value = false;
  }
}

function handleAdd() {
  operateType.value = 'add';
  editingData.value = null;
  drawerVisible.value = true;
}

function handleEdit(row: Api.Scenic.Announcement) {
  operateType.value = 'edit';
  editingData.value = row;
  drawerVisible.value = true;
}

async function handleToggleStatus(row: Api.Scenic.Announcement) {
  const next = row.status === 1 ? 2 : 1;
  const { error } = await fetchUpdateAnnouncement(row.id, { status: next });
  if (error) return;
  window.$message?.success(next === 1 ? '已发布' : '已下架');
  getData();
}

/**
 * 上移 / 下移 —— **只在同类型内**换位，然后把该组重排为 10/20/30。
 *
 * 为什么整组重排而不是只交换两条的 sort：新建时 sort 默认都是 0，只交换等于「换了跟没换一样」。
 * 为什么要限同类型：小程序端提示与弹窗是两套顺序，跨类型换位用户看不到任何变化。
 */
async function handleMove(row: Api.Scenic.Announcement, dir: -1 | 1) {
  const group = list.value.filter(a => a.type === row.type);
  const at = group.findIndex(a => a.id === row.id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= group.length) return;

  const next = [...group];
  [next[at], next[to]] = [next[to], next[at]];

  const results = await Promise.all(
    next.map((a, i) => {
      const sort = (i + 1) * 10;
      // 没变的不用发请求（省一半请求，也让操作日志干净）
      return a.sort === sort ? null : fetchUpdateAnnouncement(a.id, { sort });
    })
  );

  if (results.some(r => r?.error)) return;

  await getData();
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteAnnouncement(id);
  if (error) return;
  window.$message?.success('删除成功');
  getData();
}

/** 生效时间：两端都可为空（空 = 立即生效 / 长期有效） */
function windowText(row: Api.Scenic.Announcement) {
  if (!row.startAt && !row.endAt) return '长期有效';
  return `${row.startAt ?? '立即'} ~ ${row.endAt ?? '长期'}`;
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();
  if (!error) areas.value = areaList;
  await getData();
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm label-position="left" :label-width="68" inline>
        <ElFormItem label="范围">
          <ElSelect v-model="scope" class="w-140px" @change="getData">
            <ElOption label="全部" value="all" />
            <ElOption label="只看全平台" value="platform" />
            <ElOption label="按景点" value="scenic" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="scope === 'scenic'" label="景点">
          <ElSelect v-model="scenicAreaId" placeholder="请选择景点" class="w-200px" @change="getData">
            <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="类型">
          <ElSelect v-model="type" clearable placeholder="全部类型" class="w-180px" @change="getData">
            <ElOption v-for="opt in announcementTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect v-model="status" clearable placeholder="全部状态" class="w-140px" @change="getData">
            <ElOption label="已发布" :value="1" />
            <ElOption label="下架" :value="2" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>公告管理</p>
          <div class="flex-center gap-8px">
            <ElButton :loading="loading" @click="getData">刷新</ElButton>
            <ElButton v-if="hasAuth('scenic:create')" plain type="primary" @click="handleAdd">
              <template #icon>
                <icon-ic-round-plus class="text-icon" />
              </template>
              发布公告
            </ElButton>
          </div>
        </div>
      </template>

      <ElTable v-loading="loading" border :data="list" row-key="id">
        <ElTableColumn type="index" label="序号" width="64" />
        <ElTableColumn label="类型" width="110">
          <template #default="{ row }">
            <ElTag :type="row.type === 2 ? 'warning' : 'primary'" effect="light">
              {{ announcementTypeRecord[row.type] ?? '-' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="归属" width="150">
          <template #default="{ row }">
            <span v-if="row.scenicAreaId">{{ areaNameOf.get(row.scenicAreaId) ?? `景点 ${row.scenicAreaId}` }}</span>
            <span v-else class="text-gray-400">全平台</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <ElTableColumn prop="content" label="内容" min-width="220" show-overflow-tooltip />
        <ElTableColumn label="跳转" width="100">
          <template #default="{ row }">
            <span v-if="row.type !== 2 || !row.linkType" class="text-gray-400">—</span>
            <span v-else>{{ announcementLinkRecord[row.linkType] ?? '-' }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="生效时间" min-width="210">
          <template #default="{ row }">
            <span :class="{ 'text-gray-400': !row.startAt && !row.endAt }">{{ windowText(row) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="sort" label="排序" width="80" />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="row.status === 1 ? 'success' : 'info'">
              {{ announcementStatusRecord[row.status] ?? '-' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <div class="flex-center gap-6px">
              <ElButton size="small" :disabled="!hasAuth('scenic:update')" @click="handleMove(row, -1)">上移</ElButton>
              <ElButton size="small" :disabled="!hasAuth('scenic:update')" @click="handleMove(row, 1)">下移</ElButton>
              <ElButton v-if="hasAuth('scenic:update')" type="primary" plain size="small" @click="handleEdit(row)">
                编辑
              </ElButton>
              <ElButton v-if="hasAuth('scenic:update')" type="warning" plain size="small" @click="handleToggleStatus(row)">
                {{ row.status === 1 ? '下架' : '上架' }}
              </ElButton>
              <ElPopconfirm v-if="hasAuth('scenic:delete')" title="确认删除该公告？" @confirm="handleDelete(row.id)">
                <template #reference>
                  <ElButton type="danger" plain size="small">删除</ElButton>
                </template>
              </ElPopconfirm>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <AnnouncementOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      :areas="areas"
      @submitted="getData"
    />
  </div>
</template>

<style scoped></style>
