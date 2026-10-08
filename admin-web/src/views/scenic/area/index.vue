<script setup lang="tsx">
import { onMounted } from 'vue';
import { fetchDeleteScenicArea, fetchGetScenicAreas } from '@/service/api';
import { useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { backendArrayTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import AreaOperateDrawer from './modules/area-operate-drawer.vue';

const { hasAuth } = useAuth();

/** 景区状态：1 开放 / 2 关闭 */
const areaStatusRecord: Record<number, string> = {
  1: '开放',
  2: '关闭'
};

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetScenicAreas(),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'index', type: 'index', label: '序号', width: 64 },
    { prop: 'name', label: '景区名称', minWidth: 140 },
    { prop: 'address', label: '地址', minWidth: 180 },
    { prop: 'openTime', label: '开放时间', width: 140 },
    {
      prop: 'maxCapacity',
      label: '最大承载量',
      width: 120,
      formatter: row => <span>{row.maxCapacity ?? '-'}</span>
    },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: row => {
        const tagMap: Record<number, UI.ThemeColor> = { 1: 'success', 2: 'info' };

        return <ElTag type={tagMap[row.status] ?? 'info'}>{areaStatusRecord[row.status] ?? '-'}</ElTag>;
      }
    },
    {
      prop: 'operate',
      label: '操作',
      width: 150,
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('scenic:update') ? (
            <ElButton type="primary" plain size="small" onClick={() => handleEdit(row.id)}>
              编辑
            </ElButton>
          ) : null}
          {hasAuth('scenic:delete') ? (
            <ElPopconfirm
              title="删除前请确认该景区下已无票种与订单"
              onConfirm={() => handleDelete(row.id)}
            >
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

async function handleDelete(id: number) {
  const { error } = await fetchDeleteScenicArea(id);

  if (error) return;

  window.$message?.success('删除成功');
  onDeleted();
}

onMounted(getDataByPage);
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>景区信息管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('scenic:create')" plain type="primary" @click="handleAdd">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                新增景区
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <AreaOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
    </ElCard>
  </div>
</template>

<style scoped></style>
