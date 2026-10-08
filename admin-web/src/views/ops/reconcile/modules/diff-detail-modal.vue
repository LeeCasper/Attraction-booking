<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchGetReconciliationDetail } from '@/service/api';
import { formatPrice } from '@/utils/business';

defineOptions({ name: 'ReconcileDiffDetailModal' });

interface Props {
  /** 对账日期 yyyy-MM-dd */
  date?: string | null;
}

const props = defineProps<Props>();

const visible = defineModel<boolean>('visible', { default: false });

const loading = ref(false);
const detail = ref<Api.Ops.ReconciliationDetail | null>(null);
const activeTab = ref('missingPayment');

const missingPayment = computed(() => detail.value?.diffDetail?.missingPayment ?? []);
const amountMismatch = computed(() => detail.value?.diffDetail?.amountMismatch ?? []);
const missingRefund = computed(() => detail.value?.diffDetail?.missingRefund ?? []);

const diffDetail = computed(() => detail.value?.diffDetail ?? null);

async function getDetail() {
  if (!props.date) {
    detail.value = null;
    return;
  }

  loading.value = true;
  try {
    const { data, error } = await fetchGetReconciliationDetail(props.date);

    if (error) return;

    detail.value = data;
  } finally {
    loading.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    activeTab.value = 'missingPayment';
    getDetail();
  }
});

watch(
  () => props.date,
  () => {
    if (visible.value) getDetail();
  }
);
</script>

<template>
  <ElDialog v-model="visible" title="对账差异明细" width="880px">
    <ElDescriptions v-if="detail" :column="4" border class="mb-16px">
      <ElDescriptionsItem label="对账日期">{{ detail.date }}</ElDescriptionsItem>
      <ElDescriptionsItem label="渠道">{{ detail.channel }}</ElDescriptionsItem>
      <ElDescriptionsItem label="差异笔数">
        <ElTag :type="detail.diffCount > 0 ? 'danger' : 'success'">{{ detail.diffCount }}</ElTag>
      </ElDescriptionsItem>
      <ElDescriptionsItem label="说明">{{ detail.remark || '-' }}</ElDescriptionsItem>
    </ElDescriptions>

    <ElTabs v-model="activeTab" v-loading="loading">
      <ElTabPane :label="`缺支付流水（${missingPayment.length}）`" name="missingPayment">
        <ElTable :data="missingPayment" border empty-text="无此类差异" max-height="360">
          <ElTableColumn prop="order_no" label="订单号" min-width="220" />
          <ElTableColumn prop="amount" label="订单金额" width="160">
            <template #default="{ row }">{{ formatPrice(row.amount) }}</template>
          </ElTableColumn>
        </ElTable>
      </ElTabPane>

      <ElTabPane :label="`金额不符（${amountMismatch.length}）`" name="amountMismatch">
        <ElTable :data="amountMismatch" border empty-text="无此类差异" max-height="360">
          <ElTableColumn prop="order_no" label="订单号" min-width="220" />
          <ElTableColumn prop="order_amount" label="订单金额" width="160">
            <template #default="{ row }">{{ formatPrice(row.order_amount) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="pay_amount" label="支付金额" width="160">
            <template #default="{ row }">{{ formatPrice(row.pay_amount) }}</template>
          </ElTableColumn>
        </ElTable>
      </ElTabPane>

      <ElTabPane :label="`缺退款单（${missingRefund.length}）`" name="missingRefund">
        <ElTable :data="missingRefund" border empty-text="无此类差异" max-height="360">
          <ElTableColumn prop="order_no" label="订单号" min-width="220" />
        </ElTable>
      </ElTabPane>
    </ElTabs>

    <ElAlert v-if="diffDetail" type="info" :closable="false" show-icon class="mt-16px">
      差异明细最多展示每类 100 条；请结合订单与支付流水排查回调丢失、金额不符或退款单缺失等原因。
    </ElAlert>

    <template #footer>
      <ElButton @click="visible = false">关闭</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped></style>
