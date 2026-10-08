<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import { fetchDeleteAnnouncement, fetchGetAnnouncements, fetchGetScenicAreas, fetchUpdateAnnouncement } from '@/service/api';
import { useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { backendArrayTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { announcementStatusRecord } from '@/constants/business';
import AnnouncementOperateDrawer from './modules/announcement-operate-drawer.vue';

const { hasAuth } = useAuth();

const areas = ref<Api.Scenic.Area[]>([]);
const areaId = ref<number | null>(null);

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetAnnouncements(areaId.value as number),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'index', type: 'index', label: '序号', width: 64 },
    { prop: 'title', label: '标题', minWidth: 160 },
    { prop: 'content', label: '内容', minWidth: 240, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: row => {
        const tagMap: Record<number, UI.ThemeColor> = { 1: 'success', 2: 'info' };

        return <ElTag type={tagMap[row.status] ?? 'info'}>{announcementStatusRecord[row.status] ?? '-'}</ElTag>;
      }
    },
    {
      prop: 'publishedAt',
      label: '发布时间',
      width: 180,
      formatter: row => <span>{row.publishedAt ?? '-'}</span>
    },
    {
      prop: 'operate',
      label: '操作',
      width: 210,
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('scenic:update') ? (
            <ElButton type="primary" plain size="small" onClick={() => handleEdit(row.id)}>
              编辑
            </ElButton>
          ) : null}
          {hasAuth('scenic:update') ? (
            <ElButton type="warning" plain size="small" onClick={() => handleToggleStatus(row)}>
              {row.status === 1 ? '下架' : '上架'}
            </ElButton>
          ) : null}
          {hasAuth('scenic:delete') ? (
            <ElPopconfirm title="确认删除该公告？" onConfirm={() => handleDelete(row.id)}>
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
  ]
});

const { drawerVisible, operateType, editingData, handleAdd, handleEdit, onDeleted } = useTableOperate(
  data,
  'id',
  getData
);

async function handleToggleStatus(row: Api.Scenic.Announcement) {
  const nextStatus = row.status === 1 ? 2 : 1;

  // 后端更新要求 title 必填，上下架时带上原有的 title/content
  const { error } = await fetchUpdateAnnouncement(row.id, {
    title: row.title,
    content: row.content ?? undefined,
    status: nextStatus
  });

  if (error) return;

  window.$message?.success(nextStatus === 1 ? '已上架' : '已下架');
  getData();
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteAnnouncement(id);

  if (error) return;

  window.$message?.success('删除成功');
  onDeleted();
}

function handleAreaChange() {
  getDataByPage(1);
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (error) return;

  areas.value = areaList;

  if (areaList.length > 0) {
    // 一期单景区：默认选中第一个；多景区时用户在上方下拉切换
    areaId.value = areaList[0].id;
    getData();
  }
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm label-position="left" :label-width="80" inline>
        <ElFormItem label="景区">
          <ElSelect v-model="areaId" placeholder="请选择景区" class="w-200px" @change="handleAreaChange">
            <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
    </ElCard>
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>公告管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('scenic:create')" plain type="primary" @click="handleAdd">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                发布公告
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <AnnouncementOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        :area-id="areaId"
        @submitted="getData"
      />
    </ElCard>
  </div>
</template>

<style scoped></style>
