<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import {
  passageDirectionRecord,
  passageResultRecord,
  passageResultTagType,
  verifyCodeRecord
} from '@/constants/business';
import { exportReport, fetchGetGates, fetchGetPassages, fetchGetScenicAreas } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { formatDate } from '@/utils/business';

interface SearchParams extends Api.Gate.PassageSearchParams {
  page: number;
  pageSize: number;
}

function getInitSearchParams(): SearchParams {
  return {
    page: 1,
    pageSize: 10,
    areaId: null,
    gateId: null,
    direction: null,
    result: null,
    // 默认查询今天
    date: formatDate(new Date())
  };
}

/** 服务端返回 ISO 时间（如 2026-10-08T12:16:58.343Z），统一截短展示 */
function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '—';
}

/** 拒绝原因为服务端结果码（如 ALREADY_VERIFIED），优先映射为中文 */
function formatRejectReason(reason: string | null) {
  if (!reason) return '—';

  return verifyCodeRecord[reason] ?? reason;
}

const areas = ref<Api.Scenic.Area[]>([]);
const gates = ref<Api.Gate.Device[]>([]);
const searchParams = ref<SearchParams>(getInitSearchParams());

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetPassages(searchParams.value),
  transform: backendPageTransform<Api.Gate.PassageRow>(() => ({
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
    { prop: 'id', type: 'index', label: '序号', width: 64 },
    {
      prop: 'passedAt',
      label: '通行时间',
      width: 180,
      formatter: row => <span>{formatDateTime(row.passedAt)}</span>
    },
    {
      prop: 'direction',
      label: '方向',
      width: 90,
      formatter: row => (
        <ElTag type={row.direction === 1 ? 'primary' : 'info'}>{passageDirectionRecord[row.direction] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'result',
      label: '结果',
      width: 110,
      formatter: row => (
        <ElTag type={passageResultTagType[row.result] ?? 'info'}>{passageResultRecord[row.result] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'rejectReason',
      label: '拒绝原因',
      minWidth: 150,
      formatter: row => <span>{formatRejectReason(row.rejectReason)}</span>
    },
    {
      prop: 'gateId',
      label: '闸机 ID',
      width: 100,
      formatter: row => <span>{row.gateId ?? '—'}</span>
    },
    {
      prop: 'reservationId',
      label: '预约 ID',
      width: 110,
      formatter: row => <span>{row.reservationId ?? '—'}</span>
    },
    {
      prop: 'credential',
      label: '凭证摘要',
      minWidth: 180,
      formatter: row => <span class="text-gray-500 font-mono">{row.credential || '—'}</span>
    }
  ]
});

/** 闸机下拉随景区联动 */
async function loadGates() {
  const { data: list, error } = await fetchGetGates(searchParams.value.areaId ?? undefined);

  gates.value = error ? [] : list;
}

async function handleAreaChange() {
  searchParams.value.gateId = null;

  await loadGates();

  getDataByPage(1);
}

function handleSearch() {
  getDataByPage(1);
}

function resetSearchParams() {
  const { areaId } = searchParams.value;
  searchParams.value = { ...getInitSearchParams(), areaId };

  getDataByPage(1);
}

/** 导出 CSV：通行记录页仅单个「日期」，导出区间取 start = end = 该日期，并沿用当前景区筛选 */
const exporting = ref(false);

async function handleExport() {
  const { date, areaId } = searchParams.value;

  if (!date) {
    window.$message?.warning('请先选择日期范围');
    return;
  }

  exporting.value = true;

  try {
    await exportReport('passages', { start: date, end: date, areaId: areaId ?? undefined });
  } catch (err) {
    window.$message?.error((err as Error).message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (!error && areaList.length > 0) {
    areas.value = areaList;
    // 一期单景区：默认选中第一个；多景区时用户在筛选栏切换
    searchParams.value.areaId = areaList[0].id;

    await loadGates();
  }

  getData();
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="景区">
          <ElSelect v-model="searchParams.areaId" placeholder="全部景区" class="w-200px" @change="handleAreaChange">
            <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="闸机">
          <ElSelect v-model="searchParams.gateId" placeholder="全部闸机" clearable class="w-200px">
            <ElOption v-for="gate in gates" :key="gate.id" :label="`${gate.gateNo} ${gate.name}`" :value="gate.id">
              <span>{{ gate.gateNo }} {{ gate.name }}</span>
              <span class="ml-1 text-gray-400">{{ gate.online ? '在线' : '离线' }}</span>
            </ElOption>
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="方向">
          <ElSelect v-model="searchParams.direction" placeholder="全部" clearable class="w-140px">
            <ElOption
              v-for="(label, value) in passageDirectionRecord"
              :key="value"
              :label="label"
              :value="Number(value)"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="结果">
          <ElSelect v-model="searchParams.result" placeholder="全部" clearable class="w-140px">
            <ElOption
              v-for="(label, value) in passageResultRecord"
              :key="value"
              :label="label"
              :value="Number(value)"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="日期">
          <ElDatePicker
            v-model="searchParams.date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            class="w-180px"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch">查询</ElButton>
          <ElButton @click="resetSearchParams">重置</ElButton>
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
          <p>通行记录</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">在园人数 = 累计入园 − 累计出园，仅「通过」与「应急放行」计入</ElText>
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
