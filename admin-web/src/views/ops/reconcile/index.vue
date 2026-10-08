<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import { fetchGetReconciliations, fetchGetScenicAreas, fetchRunReconciliation } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { formatDate, formatPrice } from '@/utils/business';
import DiffDetailModal from './modules/diff-detail-modal.vue';

const { hasAuth } = useAuth();

/** 对账状态：10 无差异 / 20 存在差异 / 30 失败 */
const reconcileStatusRecord: Record<number, string> = {
  10: '无差异',
  20: '存在差异',
  30: '失败'
};

const reconcileStatusTagType: Record<number, UI.ThemeColor> = {
  10: 'success',
  20: 'danger',
  30: 'info'
};

/** 渠道：wxpay / alipay / ota */
const channelRecord: Record<string, string> = {
  wxpay: '微信支付',
  alipay: '支付宝',
  ota: 'OTA'
};

/** 默认对账日期为昨天（对账任务每天 08:00 跑前一日数据） */
function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

const areas = ref<Api.Scenic.Area[]>([]);
const running = ref(false);

/** 差异明细弹窗 */
const diffVisible = ref(false);
const diffDate = ref<string | null>(null);

const searchParams = ref({
  page: 1,
  pageSize: 10,
  status: null as number | null,
  date: getYesterday(),
  areaId: null as number | null
});

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () =>
    fetchGetReconciliations({
      page: searchParams.value.page,
      pageSize: searchParams.value.pageSize,
      status: searchParams.value.status
    }),
  transform: backendPageTransform<Api.Ops.ReconciliationRow>(() => ({
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
      prop: 'date',
      label: '对账日期',
      width: 120,
      formatter: row => <span>{row.date}</span>
    },
    {
      prop: 'channel',
      label: '渠道',
      width: 100,
      formatter: row => <span>{channelRecord[row.channel] ?? row.channel}</span>
    },
    {
      prop: 'orderSide',
      label: '订单侧（笔数/金额）',
      minWidth: 150,
      formatter: row => (
        <div class="flex-col">
          <span>{row.orderCount} 笔</span>
          <span class="text-xs text-gray-400">{formatPrice(row.orderAmount)}</span>
        </div>
      )
    },
    {
      prop: 'paymentSide',
      label: '支付侧（笔数/金额）',
      minWidth: 150,
      formatter: row => (
        <div class="flex-col">
          <span>{row.paymentCount} 笔</span>
          <span class="text-xs text-gray-400">{formatPrice(row.paymentAmount)}</span>
        </div>
      )
    },
    {
      prop: 'refundSide',
      label: '退款侧（笔数/金额）',
      minWidth: 150,
      formatter: row => (
        <div class="flex-col">
          <span>{row.refundCount} 笔</span>
          <span class="text-xs text-gray-400">{formatPrice(row.refundAmount)}</span>
        </div>
      )
    },
    {
      prop: 'diffCount',
      label: '差异笔数',
      width: 100,
      formatter: row =>
        row.diffCount > 0 ? <ElTag type="danger">{row.diffCount}</ElTag> : <span>{row.diffCount}</span>
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: row => (
        <ElTag type={reconcileStatusTagType[row.status] ?? 'info'}>
          {reconcileStatusRecord[row.status] ?? '-'}
        </ElTag>
      )
    },
    {
      prop: 'remark',
      label: '说明',
      minWidth: 220,
      formatter: row => (
        <ElTooltip
          content={row.remark ?? ''}
          placement="top"
          showAfter={300}
          disabled={!row.remark || row.remark.length <= 24}
        >
          <span class="inline-block max-w-300px truncate align-middle">{row.remark || '-'}</span>
        </ElTooltip>
      )
    },
    {
      prop: 'operate',
      label: '操作',
      width: 110,
      fixed: 'right',
      formatter: row => (
        <ElButton type="primary" plain size="small" onClick={() => openDiff(row.date)}>
          查看差异
        </ElButton>
      )
    }
  ]
});

function openDiff(date: string) {
  diffDate.value = date;
  diffVisible.value = true;
}

async function handleRun() {
  if (!searchParams.value.date) {
    window.$message?.warning('请先选择对账日期');
    return;
  }

  const confirmed = await window.$messageBox
    ?.confirm(
      `将对 ${searchParams.value.date} 执行订单↔支付↔退款三方对账（幂等，重复执行会覆盖当日结果），确认继续？`,
      '执行对账',
      {
        type: 'warning',
        confirmButtonText: '确认执行',
        cancelButtonText: '取消'
      }
    )
    .catch(() => false);

  if (!confirmed) return;

  running.value = true;
  try {
    const { data: result, error } = await fetchRunReconciliation(
      searchParams.value.date,
      searchParams.value.areaId ?? undefined
    );

    if (error) return;

    if (result.diffCount > 0) {
      window.$message?.warning(`对账完成：发现 ${result.diffCount} 处差异，请查看差异明细`);
    } else {
      window.$message?.success('对账完成：三方数据一致，无差异');
    }

    getDataByPage(1);
  } finally {
    running.value = false;
  }
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (!error) {
    areas.value = areaList;

    if (areaList.length > 0) {
      searchParams.value.areaId = areaList[0].id;
    }
  }

  getData();
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>对账口径</template>
      <p>
        本页对订单（orders）↔ 支付流水（payment）↔ 退款（refund）三方进行核对，用于度量验收标准「订单、核销、通行、财务数据一致率
        ≥ 99.9%」；与微信账单（tradebook）的比对待配置商户证书后启用。对账任务每天
        <b>08:00</b> 自动执行前一日数据，也可在此手动重跑指定日期。
      </p>
    </ElAlert>

    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="对账日期">
          <ElDatePicker
            v-model="searchParams.date"
            type="date"
            placeholder="选择对账日期"
            value-format="YYYY-MM-DD"
            class="w-180px"
          />
        </ElFormItem>
        <ElFormItem label="景区">
          <ElSelect v-model="searchParams.areaId" placeholder="请选择景区" class="w-180px">
            <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElSelect
            v-model="searchParams.status"
            placeholder="全部"
            clearable
            class="w-160px"
            @change="getDataByPage(1)"
          >
            <ElOption
              v-for="(label, value) in reconcileStatusRecord"
              :key="value"
              :label="label"
              :value="Number(value)"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton v-if="hasAuth('config:update')" type="primary" :loading="running" @click="handleRun">
            <template #icon>
              <icon-ic-round-play-circle class="text-icon" />
            </template>
            执行对账
          </ElButton>
          <ElButton :disabled="loading" @click="getData">刷新</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>三方对账</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">每天 08:00 自动执行前一日数据</ElText>
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

    <DiffDetailModal v-model:visible="diffVisible" :date="diffDate" />
  </div>
</template>

<style scoped></style>
