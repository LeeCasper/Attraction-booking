<script setup lang="ts">
import { ref, watch } from 'vue';
import { orderChannelRecord, orderStatusRecord, orderStatusTagType } from '@/constants/business';
import { fetchGetOrderDetail } from '@/service/api';
import { formatHm, formatPrice } from '@/utils/business';

defineOptions({ name: 'OrderDetailDrawer' });

interface Props {
  /** 订单 ID，打开抽屉前由父组件设置 */
  orderId: number | null;
}

const props = defineProps<Props>();

const visible = defineModel<boolean>('visible', { default: false });

const loading = ref(false);
const detail = ref<Api.Order.OrderDetail | null>(null);

/** 订单明细（按游客）状态，与服务端 OrderItemStatus 一致 */
const itemStatusRecord: Record<number, string> = {
  10: '待核销',
  20: '已核销',
  30: '已退款'
};

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

async function loadDetail() {
  if (!props.orderId) {
    detail.value = null;
    return;
  }

  loading.value = true;
  try {
    const { data, error } = await fetchGetOrderDetail(props.orderId);

    if (!error) {
      detail.value = data;
    }
  } finally {
    loading.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    detail.value = null;
    loadDetail();
  }
});
</script>

<template>
  <ElDrawer v-model="visible" title="订单详情" :size="720">
    <div v-loading="loading" class="flex-col-stretch gap-16px">
      <template v-if="detail">
        <ElDescriptions title="订单信息" :column="2" border>
          <ElDescriptionsItem label="订单号" :span="2">{{ detail.orderNo }}</ElDescriptionsItem>
          <ElDescriptionsItem label="订单状态">
            <ElTag :type="orderStatusTagType[detail.status] ?? 'info'">
              {{ orderStatusRecord[detail.status] ?? '-' }}
            </ElTag>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="订单金额">{{ formatPrice(detail.amount) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="下单时间">{{ formatDateTime(detail.createdAt) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="渠道">
            {{ orderChannelRecord[detail.channel] ?? detail.channel ?? '-' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="支付时间">{{ formatDateTime(detail.payTime) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="支付截止时间">{{ formatDateTime(detail.payDeadline) }}</ElDescriptionsItem>
          <ElDescriptionsItem v-if="detail.cancelReason" label="取消原因" :span="2">
            {{ detail.cancelReason }}
          </ElDescriptionsItem>
        </ElDescriptions>

        <ElDescriptions title="预约信息" :column="2" border>
          <ElDescriptionsItem label="预约日期">{{ detail.reservation?.date || '-' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="时段">
            <span v-if="detail.timeSlot">
              {{ detail.timeSlot.name }}（{{ formatHm(detail.timeSlot.startTime) }}-{{
                formatHm(detail.timeSlot.endTime)
              }}）
            </span>
            <span v-else>-</span>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="核销进度" :span="2">
            <span v-if="detail.reservation">
              {{ detail.reservation.verifyCount }}/{{ detail.reservation.totalCount }}
            </span>
            <span v-else>-</span>
          </ElDescriptionsItem>
        </ElDescriptions>

        <div>
          <ElAlert type="info" :closable="false" show-icon class="mb-12px">证件号已脱敏，明文不出库不出接口</ElAlert>
          <ElTable :data="detail.items" border row-key="id">
            <ElTableColumn prop="visitorName" label="姓名" min-width="100" />
            <ElTableColumn prop="visitorIdCard" label="证件号（脱敏）" min-width="180" />
            <ElTableColumn prop="ticketName" label="票种" min-width="120" />
            <ElTableColumn label="单价" width="110">
              <template #default="{ row }">{{ formatPrice(row.price) }}</template>
            </ElTableColumn>
            <ElTableColumn label="明细状态" width="100">
              <template #default="{ row }">{{ itemStatusRecord[row.status] ?? '-' }}</template>
            </ElTableColumn>
          </ElTable>
        </div>
      </template>
      <ElEmpty v-else-if="!loading" description="暂无订单数据" />
    </div>
  </ElDrawer>
</template>

<style scoped></style>
