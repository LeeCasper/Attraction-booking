<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchGetGateLogs } from '@/service/api';

defineOptions({ name: 'GateLogDrawer' });

interface GateLog {
  id: number;
  gateId: number | null;
  action: string;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  costMs: number | null;
  createdAt: string;
}

interface Props {
  /** 查看日志的闸机 */
  gate?: Api.Gate.Device | null;
}

const props = defineProps<Props>();

const visible = defineModel<boolean>('visible', { default: false });

const loading = ref(false);
const logs = ref<GateLog[]>([]);

/** 请求/响应体展开为格式化 JSON，缺失时展示占位 */
function formatJson(value: Record<string, unknown> | null) {
  if (!value) return '无';

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

async function getLogs() {
  if (!props.gate) return;

  loading.value = true;
  try {
    const { data, error } = await fetchGetGateLogs(props.gate.id, 50);

    if (error) return;

    logs.value = data;
  } finally {
    loading.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    logs.value = [];
    getLogs();
  }
});
</script>

<template>
  <ElDrawer v-model="visible" :title="`通信日志 - ${props.gate?.name ?? ''}`" size="680px">
    <ElAlert class="mb-16px" type="info" :closable="false" show-icon>
      展示最近 50 条与闸机的通信记录（签名请求与返回原文）。
    </ElAlert>

    <div v-loading="loading" class="min-h-100px">
      <ElEmpty v-if="!loading && logs.length === 0" description="暂无通信日志" />
      <ElCollapse v-else>
        <ElCollapseItem
          v-for="log in logs"
          :key="log.id"
          :name="log.id"
        >
          <template #title>
            <div class="flex items-center gap-12px">
              <ElTag size="small" type="info">{{ log.action }}</ElTag>
              <span class="text-sm text-gray-500">{{ formatDateTime(log.createdAt) }}</span>
              <span class="text-sm text-gray-400">耗时 {{ log.costMs ?? '-' }} ms</span>
            </div>
          </template>
          <div class="flex-col gap-8px">
            <div>
              <p class="mb-4px text-xs text-gray-500">请求</p>
              <pre class="log-json">{{ formatJson(log.request) }}</pre>
            </div>
            <div>
              <p class="mb-4px text-xs text-gray-500">响应</p>
              <pre class="log-json">{{ formatJson(log.response) }}</pre>
            </div>
          </div>
        </ElCollapseItem>
      </ElCollapse>
    </div>
  </ElDrawer>
</template>

<style scoped>
.log-json {
  max-height: 240px;
  margin: 0;
  padding: 8px 12px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  color: #c9d1d9;
  word-break: break-all;
  white-space: pre-wrap;
  background-color: #0d1117;
  border-radius: 4px;
}
</style>
