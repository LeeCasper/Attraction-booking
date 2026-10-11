<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchUpdateConfig } from '@/service/api';
import ImageField from '@/components/business/image-field.vue';
import { CONFIG_SCHEMA, type ConfigField, toFormValue, toStoredValue } from './config-schema';

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

/** 已知键的表单值（键 = 字段名）；百分比在这里是显示口径（0~100） */
const form = ref<Record<string, string | number | boolean>>({});
/** 未知键走这个 JSON 文本框 */
const text = ref('');
const errorMsg = ref('');
const submitting = ref(false);

const configKey = computed(() => props.rowData?.configKey ?? '');

/** 有专用表单就用表单，没有就回落 JSON 编辑器 */
const schema = computed(() => CONFIG_SCHEMA[configKey.value]);

const title = computed(() => (props.rowData ? `编辑配置：${props.rowData.configKey}` : '编辑配置'));

function handleInitModel() {
  errorMsg.value = '';
  form.value = {};

  if (!props.rowData) {
    text.value = '';
    return;
  }

  const value = (props.rowData.configValue ?? {}) as Record<string, unknown>;

  if (schema.value) {
    const next: Record<string, string | number | boolean> = {};
    for (const field of schema.value.fields) {
      next[field.key] = toFormValue(field, value[field.key]);
    }
    form.value = next;
    return;
  }

  text.value = JSON.stringify(value, null, 2);
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

/** 仅数值类字段参与范围校验（switch/text 不适用） */
function isNumeric(field: ConfigField) {
  return field.type === 'number' || field.type === 'percent';
}

/** 表单 → 存库对象；校验不过时返回 null 并已写好 errorMsg */
function buildFromForm(): Record<string, unknown> | null {
  const current = schema.value;
  if (!current) return null;

  for (const field of current.fields.filter(isNumeric)) {
    const value = Number(form.value[field.key]);

    if (Number.isNaN(value)) {
      errorMsg.value = `「${field.label}」需要填写数字`;
      return null;
    }
    if (field.min !== undefined && value < field.min) {
      errorMsg.value = `「${field.label}」不能小于 ${field.min}`;
      return null;
    }
    if (field.max !== undefined && value > field.max) {
      errorMsg.value = `「${field.label}」不能大于 ${field.max}`;
      return null;
    }
  }

  // 承载量三档必须递增：后端等级表按「高等级在前」映射、命中即 break，
  // 顺序错乱会让告警只报最低一档（甚至一档都不报）
  if (configKey.value === 'capacity_alarm') {
    const warn = Number(form.value.warn);
    const serious = Number(form.value.serious);
    const critical = Number(form.value.critical);
    if (!(warn <= serious && serious <= critical)) {
      errorMsg.value = '三档阈值须递增：80% 档 ≤ 90% 档 ≤ 100% 档';
      return null;
    }
  }

  const out: Record<string, unknown> = {};
  for (const field of current.fields) {
    out[field.key] = toStoredValue(field, form.value[field.key]);
  }
  return out;
}

async function handleSubmit() {
  if (!props.rowData) return;

  let parsed: Record<string, unknown>;

  if (schema.value) {
    const built = buildFromForm();
    if (!built) return;
    parsed = built;
  } else {
    // 未知键：必须是合法的 JSON 对象，避免写入非法配置导致服务端读取异常
    let raw: unknown;
    try {
      raw = JSON.parse(text.value);
    } catch (error) {
      errorMsg.value = `JSON 解析失败：${(error as Error).message}`;
      return;
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errorMsg.value = '配置值必须是 JSON 对象，例如 { "payTimeoutMinutes": 15 }';
      return;
    }
    parsed = raw as Record<string, unknown>;
  }

  errorMsg.value = '';
  submitting.value = true;
  try {
    const { error } = await fetchUpdateConfig(props.rowData.configKey, parsed);

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

      <!-- 已知键：带标签与校验的字段表单 -->
      <template v-if="schema">
        <!--
 图片字段（平台 Logo）：`ImageField` 自带 ElFormItem，所以这里**不能再套一层**，
             否则 label 会叠成两层 
-->
        <!--
 按 schema 顺序渲染：图片字段（平台 Logo）用 ImageField（它自带 ElFormItem，
             所以不能再套一层），其余走普通表单项。用 `<template v-for>` 而不是两个并列的
             v-for —— 后者会把图片字段全提到最前，表单顺序与 schema 定义就对不上了。 
-->
        <template v-for="field in schema.fields" :key="field.key">
          <ImageField
            v-if="field.type === 'image'"
            v-model="form[field.key] as string"
            :label="field.label"
            :hint="field.help ?? ''"
            ratio-hint="建议 1:1 方图（顶栏是个圆角方块）；5MB 内，支持 jpeg / png / webp"
            preview-class="h-60px w-60px"
          />

          <ElFormItem v-else :label="field.label">
            <ElInput v-if="field.type === 'text'" v-model="form[field.key] as string" placeholder="留空表示不使用" />

            <ElInputNumber
              v-else-if="isNumeric(field)"
              :model-value="form[field.key] as number"
              :min="field.min"
              :max="field.max"
              :step="field.step ?? 1"
              class="w-full"
              @update:model-value="(v: number | undefined) => (form[field.key] = v ?? 0)"
            />

            <ElSwitch
              v-else
              :model-value="form[field.key] as boolean"
              @update:model-value="(v: string | number | boolean) => (form[field.key] = !!v)"
            />

            <div v-if="field.help" class="mt-2px text-12px text-gray-400">{{ field.help }}</div>
          </ElFormItem>
        </template>
      </template>

      <!-- 未知键：回落到 JSON 编辑器（后端新增配置键时前端不改也不会坏） -->
      <ElFormItem v-else label="配置值（JSON 对象）">
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
    <ElAlert v-else-if="!schema" type="info" :closable="false">
      该配置键没有专用表单，保存前会校验 JSON 合法性，仅允许提交 JSON 对象。
    </ElAlert>
    <ElAlert v-else type="info" :closable="false">修改后立即生效（承载量预警最多 1 分钟生效）。</ElAlert>

    <template #footer>
      <ElSpace :size="16">
        <ElButton v-if="!schema" @click="formatText">格式化</ElButton>
        <ElButton @click="closeModal">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">保存</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
