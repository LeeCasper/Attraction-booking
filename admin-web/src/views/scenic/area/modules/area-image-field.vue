<script setup lang="ts">
import { computed, ref } from 'vue';
import { fetchUploadImage } from '@/service/api';

/**
 * 景区的**一张图**（上传 / 预览 / 清除）。
 *
 * 抽成组件是因为景区现在有三张图（封面 / 首页轮播图 / 购票页缩略图）——
 * 三处内联就是同一套 ElUpload + 预览 + 校验写三遍，改一处必然漏两处。
 *
 * ⚠️ 上传走 `fetchUploadImage`，那里已经**显式把 Content-Type 置空** ——
 * 否则 axios 的 transformRequest 会把 FormData 转成 JSON 字符串发出去，
 * 服务端收不到任何 multipart 字段（见 admin-web/README 与本仓库 CLAUDE.md 第 19 条）。
 */
defineOptions({ name: 'AreaImageField' });

interface Props {
  /** 表单项标题 */
  label: string;
  /** v-model：上传接口返回的**相对路径**（`/uploads/xxx.jpg`）；空串 = 未设置 */
  modelValue: string;
  /** 字段下方的说明：这张图**用在小程序哪里**、不传会怎样 */
  hint: string;
  /** 画幅提示，默认按横图写 */
  ratioHint?: string;
  /** 预览框的尺寸类（方图那张传小一点） */
  previewClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  ratioHint: '建议 16:9；5MB 内，支持 jpeg / png / webp',
  previewClass: 'h-60px w-90px'
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const uploading = ref(false);

/**
 * 预览地址：库里存的是相对路径（`/uploads/xxx.jpg`），这里拼上管理端的服务端前缀 ——
 * 小程序那边拼的是它自己的前缀，所以**不能存完整 URL**。
 */
const preview = computed(() => (props.modelValue ? `${import.meta.env.VITE_SERVICE_BASE_URL}${props.modelValue}` : ''));

/** 交给 ElUpload 自己发请求：走同一个 request 实例，鉴权/代理/拆包都现成 */
async function handleUpload(options: { file: File }) {
  uploading.value = true;
  try {
    const { data, error } = await fetchUploadImage(options.file);
    if (error) return;
    emit('update:modelValue', data.url);
    window.$message?.success('图片已上传，保存后生效');
  } finally {
    uploading.value = false;
  }
}

/** 本地先拦一道，省得白传一趟；服务端还会再校验 MIME 与大小 */
function beforeUpload(file: File) {
  const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!okType) {
    window.$message?.error('只支持 jpeg / png / webp 图片');
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.$message?.error('图片不能超过 5MB');
    return false;
  }
  return true;
}
</script>

<template>
  <ElFormItem :label="props.label">
    <div class="w-full flex items-center gap-12px">
      <div
        class="flex-center shrink-0 overflow-hidden border border-gray-200 rounded bg-gray-50"
        :class="props.previewClass"
      >
        <img v-if="preview" :src="preview" class="h-full w-full object-cover" :alt="`${props.label}预览`" />
        <span v-else class="text-12px text-gray-400">未设置</span>
      </div>
      <ElUpload
        :show-file-list="false"
        accept="image/jpeg,image/png,image/webp"
        :before-upload="beforeUpload"
        :http-request="handleUpload"
      >
        <ElButton :loading="uploading">{{ props.modelValue ? '更换图片' : '上传图片' }}</ElButton>
      </ElUpload>
      <ElButton v-if="props.modelValue" link type="danger" @click="emit('update:modelValue', '')">清除</ElButton>
    </div>
    <div class="mt-4px text-12px text-gray-400">{{ props.hint }}</div>
    <div class="mt-2px text-12px text-gray-400">{{ props.ratioHint }}</div>
  </ElFormItem>
</template>
