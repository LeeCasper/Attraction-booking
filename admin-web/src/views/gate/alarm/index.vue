<script setup lang="tsx">
import { ref } from 'vue';
import { fetchGetAlarms } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { alarmLevelRecord, alarmLevelTagType, alarmTypeRecord } from '@/constants/business';
import AlarmHandleModal from './modules/alarm-handle-modal.vue';

const { hasAuth } = useAuth();

/** 告警状态：10 未处理 / 20 已处理 */
const alarmStatusRecord: Record<number, string> = {
  10: '未处理',
  20: '已处理'
};

const alarmStatusTagType: Record<number, UI.ThemeColor> = {
  10: 'danger',
  20: 'success'
};

const searchParams = ref<Api.Common.BackendPageParams & Api.Gate.AlarmSearchParams>({
  page: 1,
  pageSize: 10,
  // 默认只看未处理，便于值班人员快速响应
  status: 10,
  level: null
});

/** 处理弹窗 */
const handleVisible = ref(false);
const handleRow = ref<Api.Gate.AlarmRow | null>(null);

function openHandle(row: Api.Gate.AlarmRow) {
  handleRow.value = row;
  handleVisible.value = true;
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetAlarms(searchParams.value),
  transform: backendPageTransform<Api.Gate.AlarmRow>(() => ({
    page: searchParams.value.page ?? 1,
    pageSize: searchParams.value.pageSize ?? 10
  })),
  paginationProps: {
    pageSizes: [10, 20, 50]
  },
  onPaginationParamsChange: params => {
    searchParams.value.page = params.currentPage ?? 1;
    searchParams.value.pageSize = params.pageSize ?? 10;
  },
  columns: () => [
    {
      prop: 'createdAt',
      label: '告警时间',
      width: 180,
      formatter: row => <span>{formatDateTime(row.createdAt)}</span>
    },
    {
      prop: 'type',
      label: '类型',
      width: 130,
      formatter: row => <span>{alarmTypeRecord[row.type] ?? row.type}</span>
    },
    {
      prop: 'level',
      label: '等级',
      width: 90,
      formatter: row => (
        <ElTag type={alarmLevelTagType[row.level] ?? 'info'}>{alarmLevelRecord[row.level] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'content',
      label: '内容',
      minWidth: 240,
      formatter: row => (
        <ElTooltip content={row.content} placement="top" showAfter={300} disabled={!row.content || row.content.length <= 24}>
          <span class="inline-block max-w-300px truncate align-middle">{row.content}</span>
        </ElTooltip>
      )
    },
    {
      prop: 'gateId',
      label: '闸机 ID',
      width: 100,
      formatter: row => <span>{row.gateId ?? '-'}</span>
    },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: row => (
        <ElTag type={alarmStatusTagType[row.status] ?? 'info'}>{alarmStatusRecord[row.status] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'handled',
      label: '处理人/处理时间',
      width: 190,
      formatter: row => (
        <div class="flex-col">
          <span>{row.handledBy ? `处理人 #${row.handledBy}` : '-'}</span>
          <span class="text-xs text-gray-400">{formatDateTime(row.handledAt)}</span>
        </div>
      )
    },
    {
      prop: 'operate',
      label: '操作',
      width: 100,
      fixed: 'right',
      formatter: row => (
        <div class="flex-center gap-8px">
          {row.status === 10 && hasAuth('gate:control') ? (
            <ElButton type="primary" plain size="small" onClick={() => openHandle(row)}>
              处理
            </ElButton>
          ) : null}
        </div>
      )
    }
  ]
});

/** 严重等级整行标红，突出高危告警 */
function rowClassName({ row }: { row: Api.Gate.AlarmRow }) {
  return row.level === 3 ? 'alarm-row-severe' : '';
}

function handleSearch() {
  getDataByPage(1);
}

function resetSearch() {
  searchParams.value.status = 10;
  searchParams.value.level = null;
  getDataByPage(1);
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>告警来源</template>
      <p>
        闸机离线、尾随、强行通过、重复核销、离线记录冲突、承载量分级预警（80%/90%/100%）等异常事件均由服务端自动生成告警，
        请及时处理并填写处理备注。
      </p>
    </ElAlert>

    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="状态">
          <ElSelect v-model="searchParams.status" placeholder="全部" clearable class="w-160px">
            <ElOption v-for="(label, value) in alarmStatusRecord" :key="value" :label="label" :value="Number(value)" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="等级">
          <ElSelect v-model="searchParams.level" placeholder="全部" clearable class="w-160px">
            <ElOption v-for="(label, value) in alarmLevelRecord" :key="value" :label="label" :value="Number(value)" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch">查询</ElButton>
          <ElButton @click="resetSearch">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>告警中心</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">默认仅展示未处理告警，严重等级整行标红</ElText>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable
        v-loading="loading"
        border
        class="sm:h-full"
        :data="data"
        row-key="id"
        :row-class-name="rowClassName"
      >
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <ElPagination
        v-model:current-page="pagination.currentPage"
        v-model:page-size="pagination.pageSize"
        class="mt-16px justify-end"
        :total="pagination.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next, jumper"
      />
    </ElCard>

    <AlarmHandleModal v-model:visible="handleVisible" :row-data="handleRow" @submitted="getDataByPage" />
  </div>
</template>

<style scoped>
:deep(.alarm-row-severe) td.el-table__cell {
  background-color: #fef0f0;
}
</style>
