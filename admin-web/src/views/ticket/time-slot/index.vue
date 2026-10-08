<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import { fetchDeleteTimeSlot, fetchGetScenicAreas, fetchGetTimeSlots } from '@/service/api';
import { useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { backendArrayTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { formatHm } from '@/utils/business';
import { enableStatusRecord } from '@/constants/business';
import TimeSlotOperateModal from './modules/time-slot-operate-modal.vue';

const { hasAuth } = useAuth();

const areas = ref<Api.Scenic.Area[]>([]);
const areaId = ref<number | null>(null);

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetTimeSlots(areaId.value as number),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'index', type: 'index', label: '序号', width: 64 },
    { prop: 'name', label: '时段名称', minWidth: 140 },
    {
      prop: 'startTime',
      label: '开始时间',
      width: 120,
      formatter: row => <span>{formatHm(row.startTime)}</span>
    },
    {
      prop: 'endTime',
      label: '结束时间',
      width: 120,
      formatter: row => <span>{formatHm(row.endTime)}</span>
    },
    { prop: 'sortOrder', label: '排序', width: 90 },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: row => {
        const tagMap: Record<number, UI.ThemeColor> = { 1: 'success', 2: 'info' };

        return <ElTag type={tagMap[row.status] ?? 'info'}>{enableStatusRecord[row.status] ?? '-'}</ElTag>;
      }
    },
    {
      prop: 'operate',
      label: '操作',
      width: 150,
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('ticket:update') ? (
            <ElButton type="primary" plain size="small" onClick={() => handleEdit(row.id)}>
              编辑
            </ElButton>
          ) : null}
          {hasAuth('ticket:delete') ? (
            <ElPopconfirm
              title="确认删除该时段？删除后不可恢复；若已有分时库存关联，请先清理关联库存再删除"
              width="260"
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

const {
  drawerVisible: modalVisible,
  operateType,
  editingData,
  handleAdd,
  handleEdit,
  onDeleted
} = useTableOperate(data, 'id', getData);

function openAddModal() {
  if (!areaId.value) {
    window.$message?.warning('请先选择景区');
    return;
  }

  handleAdd();
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteTimeSlot(id);

  if (error) return;

  window.$message?.success('删除成功');
  onDeleted();
}

async function handleAreaChange() {
  if (!areaId.value) return;

  await getDataByPage(1);
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (error) return;

  areas.value = areaList;

  if (areaList.length > 0) {
    // 一期单景区：默认选中第一个；多景区时用户在顶部切换
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
          <p>分时时段管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('ticket:create')" plain type="primary" @click="openAddModal">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                新增时段
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <TimeSlotOperateModal
        v-model:visible="modalVisible"
        :operate-type="operateType"
        :row-data="editingData"
        :area-id="areaId"
        @submitted="getData"
      />
    </ElCard>
  </div>
</template>

<style scoped></style>
