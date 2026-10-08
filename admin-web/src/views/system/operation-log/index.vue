<script setup lang="tsx">
import { ref } from 'vue';
import { fetchGetOperationLogs } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';

/** 常用操作标识，供下拉快速选择；亦支持手工输入 */
const actionOptions = [
  { value: 'login', label: 'login（登录）' },
  { value: 'logout', label: 'logout（退出）' },
  { value: 'role:create', label: 'role:create（新建角色）' },
  { value: 'role:update', label: 'role:update（编辑角色）' },
  { value: 'role:assign', label: 'role:assign（分配权限）' },
  { value: 'role:delete', label: 'role:delete（删除角色）' },
  { value: 'admin:create', label: 'admin:create（新建管理员）' },
  { value: 'admin:update', label: 'admin:update（编辑管理员）' },
  { value: 'admin:reset_password', label: 'admin:reset_password（重置密码）' },
  { value: 'admin:delete', label: 'admin:delete（删除管理员）' },
  { value: 'ticket:create', label: 'ticket:create（新建票种）' },
  { value: 'ticket:update', label: 'ticket:update（编辑票种）' },
  { value: 'stock:generate', label: 'stock:generate（生成库存）' },
  { value: 'order:refund_audit', label: 'order:refund_audit（退改审核）' },
  { value: 'config:update', label: 'config:update（修改参数）' }
];

const searchParams = ref({
  page: 1,
  pageSize: 10,
  action: '',
  start: null as string | null,
  end: null as string | null
});

const dateRange = ref<string[] | null>(null);

const detailVisible = ref(false);
const detailTitle = ref('');
const detailText = ref('');

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetOperationLogs(searchParams.value),
  transform: backendPageTransform<Api.System.OperationLog>(() => ({
    page: searchParams.value.page,
    pageSize: searchParams.value.pageSize
  })),
  paginationProps: {
    pageSizes: [10, 20, 50]
  },
  onPaginationParamsChange: params => {
    searchParams.value.page = params.currentPage ?? 1;
    searchParams.value.pageSize = params.pageSize ?? 10;
  },
  columns: () => [
    { prop: 'createdAt', label: '时间', width: 180 },
    { prop: 'adminId', label: '操作人 ID', width: 100 },
    {
      prop: 'action',
      label: '操作标识',
      width: 190,
      formatter: row => <ElTag type="info">{row.action}</ElTag>
    },
    {
      prop: 'target',
      label: '对象',
      minWidth: 160,
      formatter: row => (
        <span>
          {row.targetType ?? '-'}
          {row.targetId !== null && row.targetId !== undefined ? ` #${row.targetId}` : ''}
        </span>
      )
    },
    { prop: 'ip', label: 'IP', width: 140, formatter: row => <span>{row.ip || '-'}</span> },
    {
      prop: 'detail',
      label: '详情',
      width: 100,
      formatter: row => (
        <ElButton type="primary" link disabled={!row.detail} onClick={() => openDetail(row)}>
          查看
        </ElButton>
      )
    }
  ]
});

function openDetail(row: Api.System.OperationLog) {
  detailTitle.value = `${row.action} #${row.id}`;
  detailText.value = JSON.stringify(row.detail ?? {}, null, 2);
  detailVisible.value = true;
}

function handleSearch() {
  searchParams.value.start = dateRange.value?.[0] ?? null;
  searchParams.value.end = dateRange.value?.[1] ?? null;
  getDataByPage(1);
}

function resetSearch() {
  searchParams.value.action = '';
  dateRange.value = null;
  searchParams.value.start = null;
  searchParams.value.end = null;
  getDataByPage(1);
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>操作日志为追加写入（append-only）</template>
      <p>所有后台敏感操作由服务端自动记录，日志不可修改、不可删除，仅用于审计追溯。</p>
    </ElAlert>
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="操作标识">
          <ElSelect
            v-model="searchParams.action"
            placeholder="全部"
            clearable
            filterable
            allow-create
            default-first-option
            class="w-240px"
          >
            <ElOption v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="时间范围">
          <ElDatePicker
            v-model="dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DD HH:mm:ss"
            class="w-380px"
          />
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
          <p>操作日志</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">只读列表，不支持增删改</ElText>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
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

    <ElDialog v-model="detailVisible" :title="`操作详情 ${detailTitle}`" width="640px">
      <pre class="max-h-400px overflow-auto rounded bg-gray-50 p-12px text-sm">{{ detailText }}</pre>
      <template #footer>
        <ElButton @click="detailVisible = false">关闭</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped></style>
