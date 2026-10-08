<script setup lang="tsx">
import { computed, onMounted, ref } from 'vue';
import {
  fetchDeletePrice,
  fetchGetPriceCalendar,
  fetchGetScenicAreas,
  fetchGetTicketTypes,
  fetchUpsertPrice
} from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendArrayTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { useForm, useFormRules } from '@/hooks/common/form';
import { formatDate, formatPrice, yuanToCents } from '@/utils/business';

const { hasAuth } = useAuth();

const areas = ref<Api.Scenic.Area[]>([]);
const areaId = ref<number | null>(null);

const ticketTypes = ref<Api.Ticket.TicketType[]>([]);
const ticketTypeId = ref<number | null>(null);

/** 默认展示今天起 30 天 */
function getDefaultDateRange(): [string, string] {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);

  return [formatDate(start), formatDate(end)];
}

const dateRange = ref<[string, string] | null>(getDefaultDateRange());

const searchParams = computed<Api.Ticket.PriceCalendarSearchParams>(() => ({
  ticketTypeId: ticketTypeId.value,
  start: dateRange.value?.[0] ?? null,
  end: dateRange.value?.[1] ?? null
}));

const selectedTicketType = computed(() => ticketTypes.value.find(item => item.id === ticketTypeId.value) ?? null);

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetPriceCalendar(searchParams.value),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'date', label: '日期', minWidth: 140 },
    {
      prop: 'price',
      label: '价格',
      width: 140,
      formatter: row => <span>{formatPrice(row.price)}</span>
    },
    {
      prop: 'operate',
      label: '操作',
      width: 120,
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('ticket:update') ? (
            <ElPopconfirm
              title="确认删除该日特殊价？删除后该日期将回落为票种基础价"
              width="240"
              onConfirm={() => handleDeletePrice(row.date)}
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

// ============ 设置某日价格 ============

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const dialogVisible = ref(false);
const submitting = ref(false);

interface PriceModel {
  date: string;
  priceYuan: number;
}

const priceModel = ref<PriceModel>({ date: '', priceYuan: 0 });

const priceRules: Record<'date' | 'priceYuan', App.Global.FormRule> = {
  date: defaultRequiredRule,
  priceYuan: defaultRequiredRule
};

function openPriceDialog() {
  if (!ticketTypeId.value) {
    window.$message?.warning('请先选择票种');
    return;
  }

  restoreValidation();
  priceModel.value = { date: '', priceYuan: 0 };
  dialogVisible.value = true;
}

async function handleSetPrice() {
  await validate();

  if (!ticketTypeId.value) {
    window.$message?.error('请先选择票种');
    return;
  }

  submitting.value = true;
  try {
    const { error } = await fetchUpsertPrice({
      ticketTypeId: ticketTypeId.value,
      date: priceModel.value.date,
      price: yuanToCents(priceModel.value.priceYuan)
    });

    if (error) return;

    window.$message?.success('设置成功');
    dialogVisible.value = false;
    await getDataByPage(1);
  } finally {
    submitting.value = false;
  }
}

async function handleDeletePrice(date: string) {
  if (!ticketTypeId.value) {
    window.$message?.warning('请先选择票种');
    return;
  }

  const { error } = await fetchDeletePrice(ticketTypeId.value, date);

  if (error) return;

  window.$message?.success('已删除，该日期回落为基础价');
  getData();
}

// ============ 顶部筛选 ============

async function loadTicketTypes() {
  if (!areaId.value) {
    ticketTypes.value = [];
    ticketTypeId.value = null;
    return;
  }

  const { data: typeList, error } = await fetchGetTicketTypes({ areaId: areaId.value, all: true });

  if (error) return;

  ticketTypes.value = typeList;
  ticketTypeId.value = typeList.length > 0 ? typeList[0].id : null;
}

async function handleAreaChange() {
  await loadTicketTypes();

  if (ticketTypeId.value) {
    await getDataByPage(1);
  }
}

async function handleTicketTypeChange() {
  if (!ticketTypeId.value) return;

  await getDataByPage(1);
}

async function handleSearch() {
  if (!ticketTypeId.value) {
    window.$message?.warning('请先选择票种');
    return;
  }

  await getDataByPage(1);
}

async function resetSearchParams() {
  dateRange.value = getDefaultDateRange();
  await handleSearch();
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (error) return;

  areas.value = areaList;

  if (areaList.length === 0) return;

  // 一期单景区：默认选中第一个；多景区时用户在顶部切换
  areaId.value = areaList[0].id;
  await loadTicketTypes();

  if (ticketTypeId.value) {
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
        <ElFormItem label="票种">
          <ElSelect v-model="ticketTypeId" placeholder="请选择票种" class="w-200px" @change="handleTicketTypeChange">
            <ElOption v-for="type in ticketTypes" :key="type.id" :label="type.name" :value="type.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="日期范围">
          <ElDatePicker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch">查询</ElButton>
          <ElButton @click="resetSearchParams">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>价格日历</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('ticket:update')" plain type="primary" @click="openPriceDialog">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                设置某日价格
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElAlert
        class="mb-16px"
        type="info"
        :closable="false"
        show-icon
        title="未设置特殊价的日期使用票种基础价"
        :description="
          selectedTicketType
            ? `当前票种：${selectedTicketType.name}，基础价 ${formatPrice(selectedTicketType.basePrice)}。下方仅列出已设置特殊价的日期，删除特殊价后该日期回落为基础价。`
            : '请先选择票种后查看与维护特殊价。'
        "
      />
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <ElDialog v-model="dialogVisible" title="设置某日价格" width="420px">
        <ElForm ref="formRef" :model="priceModel" :rules="priceRules" label-position="top">
          <ElFormItem label="日期" prop="date">
            <ElDatePicker
              v-model="priceModel.date"
              type="date"
              class="w-full"
              value-format="YYYY-MM-DD"
              placeholder="请选择日期"
            />
          </ElFormItem>
          <ElFormItem label="价格（元）" prop="priceYuan">
            <ElInputNumber v-model="priceModel.priceYuan" :min="0" :precision="2" :step="10" class="w-full" />
          </ElFormItem>
        </ElForm>
        <template #footer>
          <ElSpace :size="16">
            <ElButton @click="dialogVisible = false">取消</ElButton>
            <ElButton type="primary" :loading="submitting" @click="handleSetPrice">确认</ElButton>
          </ElSpace>
        </template>
      </ElDialog>
    </ElCard>
  </div>
</template>

<style scoped></style>
