<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import { needRealnameRecord, ticketStatusRecord } from '@/constants/business';
import { fetchDeleteTicketType, fetchGetScenicAreas, fetchGetTicketTypes } from '@/service/api';
import { useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { useAuth } from '@/hooks/business/auth';
import { backendArrayTransform } from '@/utils/backend';
import { formatPrice } from '@/utils/business';
import TicketTypeOperateDrawer from './modules/ticket-type-operate-drawer.vue';
import TicketTypeSearch from './modules/ticket-type-search.vue';

const { hasAuth } = useAuth();

const areas = ref<Api.Scenic.Area[]>([]);
const searchParams = ref<Api.Ticket.TicketTypeSearchParams>(getInitSearchParams());

function getInitSearchParams(): Api.Ticket.TicketTypeSearchParams {
  return {
    areaId: null,
    all: false
  };
}

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetTicketTypes(searchParams.value),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'index', type: 'index', label: '序号', width: 64 },
    { prop: 'name', label: '票种名称', minWidth: 120 },
    { prop: 'audience', label: '适用人群', minWidth: 120 },
    {
      prop: 'basePrice',
      label: '基础价',
      width: 110,
      formatter: row => <span>{formatPrice(row.basePrice)}</span>
    },
    {
      prop: 'needRealname',
      label: '实名',
      width: 80,
      formatter: row => <span>{needRealnameRecord[row.needRealname] ?? '-'}</span>
    },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: row => {
        const tagMap: Record<number, UI.ThemeColor> = { 1: 'success', 2: 'info' };

        return <ElTag type={tagMap[row.status] ?? 'info'}>{ticketStatusRecord[row.status] ?? '-'}</ElTag>;
      }
    },
    { prop: 'remark', label: '备注', minWidth: 120 },
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
          {hasAuth('ticket:delete') && row.status === 1 ? (
            <ElPopconfirm
              title="确认下架该票种？下架后小程序不再展示，历史订单不受影响"
              onConfirm={() => handleDelete(row.id)}
            >
              {{
                reference: () => (
                  <ElButton type="danger" plain size="small">
                    下架
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

function openAddDrawer() {
  if (!searchParams.value.areaId) {
    window.$message?.warning('请先选择景区');
    return;
  }

  handleAdd();
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteTicketType(id);

  if (error) return;

  // onDeleted 内部会刷新列表并提示
  onDeleted();
}

function resetSearchParams() {
  const areaId = searchParams.value.areaId;
  searchParams.value = { ...getInitSearchParams(), areaId };
  getDataByPage();
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (error) return;

  areas.value = areaList;

  if (areaList.length > 0) {
    // 一期单景区：默认选中第一个；多景区时用户在搜索栏切换
    searchParams.value.areaId = areaList[0].id;
    getData();
  }
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <TicketTypeSearch v-model:model="searchParams" :areas="areas" @reset="resetSearchParams" @search="getDataByPage" />
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>票种管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('ticket:create')" plain type="primary" @click="openAddDrawer">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                新增票种
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <TicketTypeOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        :area-id="searchParams.areaId"
        @submitted="getDataByPage"
      />
    </ElCard>
  </div>
</template>

<style scoped></style>
