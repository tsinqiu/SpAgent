<template>
  <section class="fit-import" aria-label="FIT 运动导入">
    <h2>导入 FIT 运动</h2>
    <form @submit.prevent="save">
      <label>
        <span>选择 FIT 文件（最大 8 MB）</span>
        <input type="file" accept=".fit" :disabled="saving" @change="select" />
      </label>
      <button type="submit" :disabled="!file || saving">{{ saving ? '正在导入…' : '导入 FIT' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="result">
      <p role="status">{{ result.importedCount
        ? result.matching.linked ? '已导入运动，并自动关联到训练任务。'
          : result.matching.errors ? '已导入运动。自动匹配暂不可用，可在运动详情手动关联。'
            : '已导入运动，可在运动详情查看或选择训练任务。'
        : '该运动已经导入，未新增重复记录。' }}</p>
      <RouterLink v-if="result.activityIds[0]" :to="{ name: 'activity-detail', params: { id: result.activityIds[0] } }">
        查看导入的运动
      </RouterLink>
    </template>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { apiClient, unwrapApiResponse } from '@/services/http'

const file = ref(null)
const result = ref(null)
const error = ref('')
const saving = ref(false)

function select(event) {
  file.value = event.target.files[0] || null
  result.value = null
  error.value = ''
}

async function save() {
  if (!file.value || saving.value) return
  result.value = null
  error.value = ''
  if (file.value.size > 8 * 1024 * 1024) {
    error.value = 'FIT 文件超过 8 MB。'
    return
  }
  saving.value = true
  const body = new FormData()
  body.append('fit', file.value)
  try {
    const response = await apiClient.post('/sync/fit', body, { timeout: 45_000 })
    result.value = unwrapApiResponse(response.data).data
  } catch (cause) {
    error.value = cause.code === 'INVALID_FIT_FILE'
      ? '无法读取这份 FIT 活动文件。'
      : '导入暂时无法完成。可以用同一份文件重试。'
  } finally { saving.value = false }
}
</script>

<style scoped>
.fit-import, form, label { display: grid; gap: 8px; min-width: 0; }
.fit-import { padding: 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); }
h2, p { margin: 0; }
h2 { font-size: 17px; }
span, p { font-size: 13px; }
input { min-width: 0; width: 100%; font: inherit; }
button { min-height: 44px; border: 1px solid var(--app-green); border-radius: 9px; color: white; background: var(--app-green); font: inherit; }
button:disabled { opacity: .55; }
a { color: var(--green-strong); }
</style>
