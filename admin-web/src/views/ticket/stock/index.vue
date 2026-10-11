<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import { fetchGetScenicAreas, fetchGetStocks, fetchGetTicketTypes } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { useAuth } from '@/hooks/business/auth';
import { backendArrayTransform } from '@/utils/backend';
import { formatDate, formatHm } from '@/utils/business';
import StockGenerateModal from './modules/stock-generate-modal.vue';
import StockAdjustModal from './modules/stock-adjust-modal.vue';

interface SearchParams {
  /** 景区 id */
  areaId: number | null;
  /** 票种 id */
  ticketTypeId: number | null;
  /** 日期范围 [开始, 结束]，yyyy-MM-dd */
  dateRange: string[];
}

/** 默认日期范围：今天 ~ 今天 + 6 天 */
function getDefaultDateRange(): string[] {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 6);

  return [formatDate(start), formatDate(end)];
}

function getInitSearchParams(): SearchParams {
  return {
    areaId: null,
    ticketTypeId: null,
    dateRange: getDefaultDateRange()
  };
}

const { hasAuth } = useAuth();

const areas = ref<Api.Scenic.Area[]>([]);
const ticketTypes = ref<Api.Ticket.TicketType[]>([]);
const searchParams = ref<SearchParams>(getInitSearchParams());

const generateVisible = ref(false);
const adjustVisible = ref(false);
const adjustingStock = ref<Api.Ticket.TicketStock | null>(null);

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => {
    const [start = '', end = ''] = searchParams.value.dateRange;

    return fetchGetStocks({
      ticketTypeId: searchParams.value.ticketTypeId,
      start,
      end
    });
  },
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'date', label: '日期', width: 120 },
    {
      prop: 'slotName',
      label: '时段',
      minWidth: 180,
      formatter: row => (
        <span>
          {row.slotName}
          <span class="ml-4px text-gray-400">
            {formatHm(row.startTime)}-{formatHm(row.endTime)}
          </span>
        </span>
      )
    },
    { prop: 'total', label: '总库存', width: 100 },
    { prop: 'sold', label: '已售', width: 90 },
    { prop: 'locked', label: '锁定', width: 90 },
    {
      prop: 'available',
      label: '剩余',
      width: 100,
      formatter: row => {
        const total = row.total ?? 0;
        let type: UI.ThemeColor = 'success';

        if (row.available <= 0) {
          type = 'danger';
        } else if (total > 0 && row.available < total * 0.2) {
          type = 'warning';
        }

        return <ElTag type={type}>{row.available}</ElTag>;
      }
    },
    {
      prop: 'operate',
      label: '操作',
      width: 130,
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('stock:update') ? (
            <ElButton type="primary" plain size="small" onClick={() => handleAdjust(row)}>
              调整库存
            </ElButton>
          ) : null}
        </div>
      )
    }
  ]
});

async function loadTicketTypes() {
  if (!searchParams.value.areaId) {
    ticketTypes.value = [];

    return;
  }

  const { data: list, error } = await fetchGetTicketTypes({ areaId: searchParams.value.areaId });

  if (error) {
    ticketTypes.value = [];

    return;
  }

  ticketTypes.value = list;
}

async function handleAreaChange() {
  searchParams.value.ticketTypeId = null;

  await loadTicketTypes();

  if (ticketTypes.value.length > 0) {
    // 一期单景区：默认选中该景区的第一个票种
    searchParams.value.ticketTypeId = ticketTypes.value[0].id;
  }

  getData();
}

function handleAdjust(row: Api.Ticket.TicketStock) {
  adjustingStock.value = row;
  adjustVisible.value = true;
}

function openGenerate() {
  if (!searchParams.value.ticketTypeId) {
    window.$message?.warning('请先选择票种');
    return;
  }

  generateVisible.value = true;
}

function resetSearchParams() {
  const { areaId } = searchParams.value;
  searchParams.value = { ...getInitSearchParams(), areaId };

  if (ticketTypes.value.length > 0) {
    searchParams.value.ticketTypeId = ticketTypes.value[0].id;
  }

  getDataByPage();
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (error) return;

  areas.value = areaList;

  if (areaList.length > 0) {
    // 一期单景区：默认选中第一个；多景区时用户在筛选栏切换
    searchParams.value.areaId = areaList[0].id;

    await loadTicketTypes();

    if (ticketTypes.value.length > 0) {
      searchParams.value.ticketTypeId = ticketTypes.value[0].id;
    }

    getData();
  }
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="景区">
          <ElSelect v-model="searchParams.areaId" placeholder="请选择景区" class="w-200px" @change="handleAreaChange">
            <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="票种">
          <ElSelect v-model="searchParams.ticketTypeId" placeholder="请选择票种" class="w-200px">
            <ElOption
              v-for="ticketType in ticketTypes"
              :key="ticketType.id"
              :label="ticketType.name"
              :value="ticketType.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="日期范围">
          <ElDatePicker
            v-model="searchParams.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="~"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="getDataByPage()">查询</ElButton>
          <ElButton @click="resetSearchParams">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>分时库存管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('stock:update')" plain type="primary" @click="openGenerate">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                批量生成库存
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <StockGenerateModal
        v-model:visible="generateVisible"
        :ticket-type-id="searchParams.ticketTypeId"
        @submitted="getData"
      />
      <StockAdjustModal v-model:visible="adjustVisible" :row-data="adjustingStock" @submitted="getData" />
    </ElCard>
  </div>
</template>

<style scoped></style>
