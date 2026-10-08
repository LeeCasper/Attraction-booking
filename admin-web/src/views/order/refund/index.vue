<script setup lang="tsx">
import { ref } from 'vue';
import { fetchGetRefunds } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { formatPrice } from '@/utils/business';
import { refundStatusRecord, refundStatusTagType } from '@/constants/business';
import RefundAuditModal from './modules/refund-audit-modal.vue';

const { hasAuth } = useAuth();

const searchParams = ref<Api.Order.RefundSearchParams>({
  page: 1,
  pageSize: 10,
  status: 10
});

/** 审核弹窗 */
const auditVisible = ref(false);
const auditRow = ref<Api.Order.RefundRow | null>(null);

function openAudit(row: Api.Order.RefundRow) {
  auditRow.value = row;
  auditVisible.value = true;
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetRefunds(searchParams.value),
  transform: backendPageTransform<Api.Order.RefundRow>(() => ({
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
    { prop: 'refundNo', label: '退款单号', minWidth: 200 },
    { prop: 'orderNo', label: '关联订单号', minWidth: 200 },
    {
      prop: 'amount',
      label: '申请金额',
      width: 110,
      formatter: row => <span>{formatPrice(row.amount)}</span>
    },
    {
      prop: 'fee',
      label: '手续费',
      width: 100,
      formatter: row => <span>{formatPrice(row.fee)}</span>
    },
    {
      prop: 'actualAmount',
      label: '实退金额',
      width: 110,
      formatter: row => <span>{formatPrice(row.actualAmount)}</span>
    },
    { prop: 'reason', label: '原因', minWidth: 140 },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: row => (
        <ElTag type={refundStatusTagType[row.status] ?? 'info'}>{refundStatusRecord[row.status] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'createdAt',
      label: '申请时间',
      width: 180,
      formatter: row => <span>{formatDateTime(row.createdAt)}</span>
    },
    {
      prop: 'audit',
      label: '审核人/审核时间',
      width: 190,
      formatter: row => (
        <div class="flex-col">
          <span>{row.auditBy ? `审核人 #${row.auditBy}` : '-'}</span>
          <span class="text-xs text-gray-400">{formatDateTime(row.auditedAt)}</span>
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
          {row.status === 10 && hasAuth('order:refund_audit') ? (
            <ElButton type="primary" plain size="small" onClick={() => openAudit(row)}>
              审核
            </ElButton>
          ) : null}
        </div>
      )
    }
  ]
});

function handleSearch() {
  getDataByPage(1);
}

function resetSearch() {
  searchParams.value.status = 10;
  getDataByPage(1);
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>退款金额按退改规则计算</template>
      <p>提前 N 天申请免手续费；当日申请按比例扣手续费；已过预约日不可退（具体规则以票种配置为准）。</p>
    </ElAlert>

    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="退款状态">
          <ElSelect v-model="searchParams.status" placeholder="全部" class="w-160px">
            <ElOption v-for="(label, value) in refundStatusRecord" :key="value" :label="label" :value="Number(value)" />
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
          <p>退款审核</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">默认仅展示待审核退款单</ElText>
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

    <RefundAuditModal v-model:visible="auditVisible" :row-data="auditRow" @submitted="getDataByPage" />
  </div>
</template>

<style scoped></style>
