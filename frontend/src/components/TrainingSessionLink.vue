<template>
  <section class="session-link">
    <button v-if="!open" type="button" :disabled="disabled" @click="load">关联运动</button>
    <template v-else>
      <p v-if="loading" role="status">正在读取可关联运动…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!candidates.length">前后 7 天内暂无可关联的跑步记录。</p>
      <form v-else @submit.prevent="save">
        <label>
          <span>选择实际跑步</span>
          <select v-model.number="selected" required>
            <option disabled value="">请选择运动</option>
            <option v-for="activity in candidates" :key="activity.id" :value="activity.id">
              {{ activity.date }} · {{ activity.name || '跑步' }} · {{ formatDistance(activity.distanceM) }}
            </option>
          </select>
        </label>
        <button type="submit" :disabled="saving || disabled || !selected">确认关联</button>
      </form>
      <button v-if="error" type="button" :disabled="saving" @click="load">重试</button>
      <button type="button" :disabled="saving" @click="open = false">收起</button>
    </template>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { formatDistance } from '@/utils/formatters'
import { getSessionActivities, linkTrainingActivity } from '@/services/trainingPlans'

const props = defineProps({ sessionId: Number, version: Number, disabled: Boolean })
const emit = defineEmits(['linked'])
const open = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const candidates = ref([])
const selected = ref('')

async function load() {
  error.value = ''
  open.value = true
  loading.value = true
  try {
    candidates.value = await getSessionActivities(props.sessionId)
    selected.value = ''
  } catch {
    error.value = '无法读取可关联运动。'
  } finally { loading.value = false }
}

async function save() {
  if (saving.value || !selected.value) return
  saving.value = true
  error.value = ''
  try {
    await linkTrainingActivity(props.sessionId, selected.value, props.version)
    emit('linked')
  } catch (cause) {
    error.value = cause.status === 409 ? '计划或活动状态已更新，请刷新周历后再试。' : '暂时无法关联运动。'
  } finally { saving.value = false }
}
</script>

<style scoped>
.session-link, form, label { display: grid; align-items: start; gap: 6px; min-width: 0; }
p, span { margin: 0; color: var(--muted); font-size: 13px; }
button, select { width: 100%; min-height: 44px; color: var(--text); background: var(--panel); border: 1px solid var(--border); border-radius: 9px; padding: 6px 9px; font: inherit; font-size: 13px; }
select { min-width: 0; }
button:disabled { opacity: .55; }
</style>
