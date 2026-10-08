<script setup lang="ts">
defineOptions({ name: 'TicketTypeSearch' });

interface Props {
  areas: Api.Scenic.Area[];
}

const props = defineProps<Props>();

const model = defineModel<Api.Ticket.TicketTypeSearchParams>('model', { required: true });

interface Emits {
  (e: 'search'): void;
  (e: 'reset'): void;
}

const emit = defineEmits<Emits>();
</script>

<template>
  <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
    <ElForm :model="model" label-position="left" :label-width="80" inline>
      <ElFormItem label="景区">
        <ElSelect v-model="model.areaId" placeholder="请选择景区" class="w-200px">
          <ElOption v-for="area in props.areas" :key="area.id" :label="area.name" :value="area.id" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="状态">
        <ElSelect v-model="model.all" placeholder="默认仅上架" class="w-160px">
          <ElOption label="仅上架票种" :value="false" />
          <ElOption label="全部票种" :value="true" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem>
        <ElButton type="primary" @click="emit('search')">查询</ElButton>
        <ElButton @click="emit('reset')">重置</ElButton>
      </ElFormItem>
    </ElForm>
  </ElCard>
</template>

<style scoped></style>
