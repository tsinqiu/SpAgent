<template>
  <section class="activity-review" aria-label="训练任务复盘">
    <h2>训练任务复盘</h2>
    <p v-if="loading" role="status">正在读取关联状态…</p>
    <template v-else-if="result?.execution">
      <RouterLink :to="{ name: 'training-plans', query: { planId: result.execution.planId } }">{{ result.execution.planName }}</RouterLink>
      <TrainingExecution :result="result.execution" />
    </template>
    <template v-else-if="result">
      <form v-if="result.candidates.length" @submit.prevent="save">
        <label>
          <span>选择训练任务</span>
          <select v-model.number="selected" required>
            <option disabled value="">请选择任务</option>
            <option v-for="session in result.candidates" :key="session.id" :value="session.id">{{ session.date }} · {{ session.title }}</option>
          </select>
        </label>
        <button type="submit" :disabled="saving || !selected">确认关联</button>
      </form>
      <p v-else>附近日期暂无可关联的待执行或已完成跑步任务。</p>
    </template>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">重新读取</button></p>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue'
import TrainingExecution from '@/components/TrainingExecution.vue'
import { getActivityExecution, linkTrainingActivity } from '@/services/trainingPlans'

const props = defineProps({ activityId: { type: Number, required: true } })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const result = ref(null)
const selected = ref('')

async function load() {
  error.value = ''
  loading.value = true
  try {
    result.value = await getActivityExecution(props.activityId)
    selected.value = ''
  } catch {
    error.value = '无法读取训练关联。'
  } finally { loading.value = false }
}

async function save() {
  const target = result.value?.candidates.find(item => item.id === selected.value)
  if (!target || saving.value) return
  error.value = ''
  saving.value = true
  try {
    await linkTrainingActivity(target.id, props.activityId, target.version)
    await load()
  } catch (cause) {
    error.value = cause.status === 409 ? '计划或运动状态已有变化，请重新读取。' : '暂时无法关联运动。'
  } finally { saving.value = false }
}

watch(() => props.activityId, load, { immediate: true })
</script>

<style scoped>
.activity-review { display: grid; gap: 8px; border: 1px solid var(--border); border-radius: 15px; padding: 12px; background: var(--panel); }
h2, p { margin: 0; }
h2 { font-size: 17px; }
a { color: var(--green-strong); }
form, label { min-width: 0; display: grid; gap: 6px; }
button, select { min-height: 44px; padding: 6px 9px; font: inherit; border: 1px solid var(--border); border-radius: 8px; color: var(--text); background: var(--panel); }
button:disabled { opacity: .55; }
</style>
