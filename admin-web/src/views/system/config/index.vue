<script setup lang="tsx">
import { ref } from 'vue';
import { fetchGetConfigs } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendArrayTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import ConfigEditModal from './modules/config-edit-modal.vue';

const { hasAuth } = useAuth();

const configVisible = ref(false);
const editingConfig = ref<Api.System.Config | null>(null);

const { columns, columnChecks, data, loading, getData } = useUIPaginatedTable({
  api: () => fetchGetConfigs(),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'index', type: 'index', label: '序号', width: 64 },
    {
      prop: 'configKey',
      label: '配置键',
      width: 180,
      formatter: row => <ElTag type="info">{row.configKey}</ElTag>
    },
    {
      prop: 'configValue',
      label: '配置值',
      minWidth: 320,
      formatter: row => <span class="break-all">{JSON.stringify(row.configValue)}</span>
    },
    { prop: 'remark', label: '说明', minWidth: 180, formatter: row => <span>{row.remark || '-'}</span> },
    { prop: 'updatedAt', label: '更新时间', width: 180 },
    {
      prop: 'operate',
      label: '操作',
      width: 100,
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('config:update') ? (
            <ElButton type="primary" plain size="small" onClick={() => openEditModal(row)}>
              编辑
            </ElButton>
          ) : null}
        </div>
      )
    }
  ]
});

function openEditModal(row: Api.System.Config) {
  editingConfig.value = row;
  configVisible.value = true;
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>系统参数配置</template>
      <p>参数以 JSON 对象存储，修改后全局生效。内置配置说明：</p>
      <ul class="mt-4px list-disc pl-20px">
        <li><span class="font-medium">reservation</span>：预约规则，如支付超时时间等；</li>
        <li><span class="font-medium">capacity_alarm</span>：承载量分级预警开关（80% / 90% / 100%）；</li>
        <li><span class="font-medium">refund</span>：全局退改规则，如手续费率、过期是否可退。</li>
      </ul>
    </ElAlert>
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>参数配置</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData" />
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <ConfigEditModal v-model:visible="configVisible" :row-data="editingConfig" @submitted="getData" />
    </ElCard>
  </div>
</template>

<style scoped></style>
