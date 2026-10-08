<script setup lang="tsx">
import { ref } from 'vue';
import { exportReport, fetchGetVerifications } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { formatDate } from '@/utils/business';
import { verifyChannelRecord } from '@/constants/business';

interface SearchParams {
  page: number;
  pageSize: number;
  channel: string;
  date: string | null;
}

function getInitSearchParams(): SearchParams {
  return {
    page: 1,
    pageSize: 10,
    channel: '',
    // 默认查询今天
    date: formatDate(new Date())
  };
}

const searchParams = ref<SearchParams>(getInitSearchParams());

/** 服务端返回 UTC ISO 字符串，统一转为浏览器本地时间展示 */
function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return value.replace('T', ' ').slice(0, 19);

  const pad = (n: number) => `${n}`.padStart(2, '0');

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetVerifications(searchParams.value),
  transform: backendPageTransform<Api.Verify.VerificationRow>(() => ({
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
    {
      prop: 'verifyTime',
      label: '核销时间',
      width: 190,
      formatter: row => <span>{formatDateTime(row.verifyTime)}</span>
    },
    { prop: 'id', label: '核销单 ID', width: 110 },
    { prop: 'reservationId', label: '预约 ID', width: 110 },
    { prop: 'orderItemId', label: '明细 ID', width: 110 },
    {
      prop: 'channel',
      label: '渠道',
      width: 100,
      formatter: row => {
        const tagMap: Record<string, UI.ThemeColor> = { gate: 'primary', pda: 'success', manual: 'warning' };

        return (
          <ElTag type={tagMap[row.channel] ?? 'info'}>{verifyChannelRecord[row.channel] ?? row.channel ?? '—'}</ElTag>
        );
      }
    },
    {
      prop: 'gateId',
      label: '闸机 ID',
      width: 100,
      formatter: row => <span>{row.gateId ?? '—'}</span>
    },
    {
      prop: 'operatorId',
      label: '操作人 ID',
      width: 110,
      formatter: row => <span>{row.operatorId ?? '—'}</span>
    }
  ]
});

function handleSearch() {
  getDataByPage(1);
}

function resetSearch() {
  searchParams.value = getInitSearchParams();
  getDataByPage(1);
}

/** 导出 CSV：核销记录页仅单个「核销日期」，导出区间取 start = end = 该日期 */
const exporting = ref(false);

async function handleExport() {
  const { date } = searchParams.value;

  if (!date) {
    window.$message?.warning('请先选择日期范围');
    return;
  }

  exporting.value = true;

  try {
    await exportReport('verifications', { start: date, end: date });
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
        <ElFormItem label="渠道">
          <ElSelect v-model="searchParams.channel" placeholder="全部渠道" clearable class="w-160px">
            <ElOption
              v-for="(label, value) in verifyChannelRecord"
              :key="value"
              :label="label"
              :value="value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="核销日期">
          <ElDatePicker
            v-model="searchParams.date"
            type="date"
            placeholder="选择核销日期"
            value-format="YYYY-MM-DD"
            clearable
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
          <p>核销记录</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">记录为追加写入，一人一票仅可核销一次（服务端唯一索引保证）</ElText>
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
  </div>
</template>

<style scoped></style>
