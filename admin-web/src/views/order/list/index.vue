<script setup lang="tsx">
import { ref } from 'vue';
import { orderChannelRecord, orderStatusRecord, orderStatusTagType } from '@/constants/business';
import { exportReport, fetchGetOrders } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { formatPrice } from '@/utils/business';
import OrderDetailDrawer from './modules/order-detail-drawer.vue';

const searchParams = ref<Api.Order.OrderSearchParams>({
  page: 1,
  pageSize: 10,
  status: null,
  orderNo: '',
  phone: '',
  date: null
});

/** 详情抽屉 */
const detailVisible = ref(false);
const detailOrderId = ref<number | null>(null);

function openDetail(id: number) {
  detailOrderId.value = id;
  detailVisible.value = true;
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetOrders(searchParams.value),
  transform: backendPageTransform<Api.Order.OrderRow>(() => ({
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
    { prop: 'orderNo', label: '订单号', minWidth: 200 },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: row => (
        <ElTag type={orderStatusTagType[row.status] ?? 'info'}>{orderStatusRecord[row.status] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'itemCount',
      label: '票数',
      width: 80,
      formatter: row => <span>{row.itemCount}</span>
    },
    {
      prop: 'amount',
      label: '金额',
      width: 110,
      formatter: row => <span>{formatPrice(row.amount)}</span>
    },
    {
      prop: 'reservationDate',
      label: '预约日期',
      width: 130,
      formatter: row => <span>{row.reservationDate || '-'}</span>
    },
    {
      prop: 'createdAt',
      label: '下单时间',
      width: 180,
      formatter: row => <span>{formatDateTime(row.createdAt)}</span>
    },
    {
      prop: 'channel',
      label: '渠道',
      width: 90,
      formatter: row => <span>{orderChannelRecord[row.channel] ?? row.channel ?? '-'}</span>
    },
    {
      prop: 'operate',
      label: '操作',
      width: 120,
      fixed: 'right',
      formatter: row => (
        <div class="flex-center gap-8px">
          <ElButton type="primary" plain size="small" onClick={() => openDetail(row.id)}>
            查看详情
          </ElButton>
        </div>
      )
    }
  ]
});

function handleSearch() {
  getDataByPage(1);
}

function resetSearch() {
  searchParams.value.status = null;
  searchParams.value.orderNo = '';
  searchParams.value.phone = '';
  searchParams.value.date = null;
  getDataByPage(1);
}

/** 导出 CSV：订单页仅单个「预约日期」，导出区间取 start = end = 该日期 */
const exporting = ref(false);

async function handleExport() {
  const { date } = searchParams.value;

  if (!date) {
    window.$message?.warning('请先选择日期范围');
    return;
  }

  exporting.value = true;

  try {
    await exportReport('orders', { start: date, end: date });
  } catch (err) {
    window.$message?.error((err as Error).message || '导出失败');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="订单号">
          <ElInput
            v-model="searchParams.orderNo"
            placeholder="按订单号模糊搜索"
            clearable
            class="w-200px"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="手机号">
          <ElInput
            v-model="searchParams.phone"
            placeholder="按手机号精确搜索"
            clearable
            class="w-160px"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem label="订单状态">
          <ElSelect v-model="searchParams.status" placeholder="全部" clearable class="w-160px">
            <ElOption v-for="(label, value) in orderStatusRecord" :key="value" :label="label" :value="Number(value)" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="预约日期">
          <ElDatePicker
            v-model="searchParams.date"
            type="date"
            placeholder="选择预约日期"
            value-format="YYYY-MM-DD"
            class="w-180px"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch">查询</ElButton>
          <ElButton @click="resetSearch">重置</ElButton>
          <ElButton plain :loading="exporting" @click="handleExport">
            <template #icon>
              <icon-ic-round-download class="text-icon" />
            </template>
            导出 CSV
          </ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>订单管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">订单为交易凭证，后台不提供修改</ElText>
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

    <OrderDetailDrawer v-model:visible="detailVisible" :order-id="detailOrderId" />
  </div>
</template>

<style scoped></style>
