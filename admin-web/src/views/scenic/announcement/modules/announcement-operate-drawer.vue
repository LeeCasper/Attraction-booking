<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchCreateAnnouncement, fetchUpdateAnnouncement } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

defineOptions({ name: 'ScenicAnnouncementOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Scenic.Announcement | null;
  /** 所属景区（新增时使用） */
  areaId: number | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '发布公告' : '编辑公告'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

interface Model {
  title: string;
  content: string;
}

function createDefaultModel(): Model {
  return {
    title: '',
    content: ''
  };
}

const model = ref(createDefaultModel());

const rules: Record<'title', App.Global.FormRule> = {
  title: defaultRequiredRule
};

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  Object.assign(model.value, {
    title: props.rowData.title,
    content: props.rowData.content ?? ''
  });
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  if (!isEdit.value && !props.areaId) {
    window.$message?.error('请先选择景区');
    return;
  }

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      // 后端更新要求 title 必填，编辑时保留原有状态
      const { error } = await fetchUpdateAnnouncement(props.rowData.id, {
        title: model.value.title,
        content: model.value.content || undefined,
        status: props.rowData.status
      });

      if (error) return;
    } else {
      const { error } = await fetchCreateAnnouncement(props.areaId as number, {
        title: model.value.title,
        content: model.value.content || undefined
      });

      if (error) return;
    }

    window.$message?.success(isEdit.value ? '修改成功' : '发布成功');
    closeDrawer();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    restoreValidation();
    handleInitModel();
  }
});
</script>

<template>
  <ElDrawer v-model="visible" :title="title" :size="460">
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="公告标题" prop="title">
        <ElInput v-model="model.title" placeholder="请输入公告标题" />
      </ElFormItem>
      <ElFormItem label="公告内容">
        <ElInput v-model="model.content" type="textarea" :rows="6" placeholder="请输入公告内容" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeDrawer">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>

<style scoped></style>
