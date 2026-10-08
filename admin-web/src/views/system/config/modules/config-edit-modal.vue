<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchUpdateConfig } from '@/service/api';

defineOptions({ name: 'ConfigEditModal' });

interface Props {
  /** 编辑时的配置行数据 */
  rowData?: Api.System.Config | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const text = ref('');
const errorMsg = ref('');
const submitting = ref(false);

const title = computed(() => (props.rowData ? `编辑配置：${props.rowData.configKey}` : '编辑配置'));

function handleInitModel() {
  errorMsg.value = '';

  if (!props.rowData) {
    text.value = '';
    return;
  }

  text.value = JSON.stringify(props.rowData.configValue ?? {}, null, 2);
}

/** 格式化当前 JSON 文本，便于阅读（非法 JSON 时给出提示） */
function formatText() {
  try {
    text.value = JSON.stringify(JSON.parse(text.value), null, 2);
    errorMsg.value = '';
  } catch (error) {
    errorMsg.value = `JSON 解析失败：${(error as Error).message}`;
  }
}

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  if (!props.rowData) return;

  let parsed: unknown;

  // 提交前校验：必须是合法的 JSON 对象，避免写入非法配置导致服务端读取异常
  try {
    parsed = JSON.parse(text.value);
  } catch (error) {
    errorMsg.value = `JSON 解析失败：${(error as Error).message}`;
    return;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errorMsg.value = '配置值必须是 JSON 对象，例如 { "payTimeoutMinutes": 15 }';
    return;
  }

  errorMsg.value = '';
  submitting.value = true;
  try {
    const { error } = await fetchUpdateConfig(props.rowData.configKey, parsed as Record<string, unknown>);

    if (error) return;

    window.$message?.success('保存成功');
    closeModal();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    handleInitModel();
  }
});
</script>

<template>
  <ElDialog v-model="visible" :title="title" width="640px">
    <ElForm label-position="top">
      <ElFormItem label="配置键">
        <ElInput :model-value="rowData?.configKey" disabled />
      </ElFormItem>
      <ElFormItem label="配置值（JSON 对象）">
        <ElInput
          v-model="text"
          type="textarea"
          :rows="12"
          resize="vertical"
          spellcheck="false"
          class="font-mono"
          placeholder='如 { "payTimeoutMinutes": 15 }'
        />
      </ElFormItem>
    </ElForm>
    <ElAlert v-if="errorMsg" type="error" :closable="false" show-icon>{{ errorMsg }}</ElAlert>
    <ElAlert v-else type="info" :closable="false">
      保存前会校验 JSON 合法性，仅允许提交 JSON 对象。
    </ElAlert>
    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="formatText">格式化</ElButton>
        <ElButton @click="closeModal">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">保存</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
