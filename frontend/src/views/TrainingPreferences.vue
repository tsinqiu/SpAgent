<template>
  <div class="page-stack training-preferences-page">
    <StateBlock v-if="loading" title="正在读取训练偏好" message="正在加载常用目标和训练日。" />
    <StateBlock v-else-if="loadError" title="训练偏好加载失败" :message="loadError" tone="danger" action-label="重试" @action="load" />
    <form v-else class="panel preference-form" @submit.prevent="save">
      <p class="preference-intro">教练生成计划时会用这些设置补齐信息。对话中明确指定的目标或训练日优先。</p>
      <fieldset :disabled="updating">
        <label for="training-goal">常用跑步目标</label>
        <select id="training-goal" v-model="goal">
          <option value="">无默认目标</option>
          <option value="first_5k">首次 5 公里</option>
          <option value="regular_running">规律跑步</option>
        </select>
      </fieldset>
      <fieldset :disabled="updating" aria-describedby="preference-days-help">
        <legend>常用训练日</legend>
        <p id="preference-days-help">可选择 2 至 4 天，也可以留空。</p>
        <div class="preference-days">
          <button
            v-for="(day, index) in dayLabels"
            :key="day"
            type="button"
            :aria-label="`周${day}`"
            :aria-pressed="days.includes(index + 1)"
            :disabled="days.length === 4 && !days.includes(index + 1)"
            @click="toggleDay(index + 1)"
          >{{ day }}</button>
        </div>
        <p v-if="days.length === 1" class="preference-note">再选至少一天即可保存。</p>
      </fieldset>
      <div class="preference-actions">
        <button class="primary-link" type="submit" :disabled="!dirty || days.length === 1 || updating">
          {{ updating ? '处理中…' : '保存训练偏好' }}
        </button>
        <button v-if="hasSavedPreferences" class="secondary-link" type="button" :disabled="updating" @click="clear">
          清除已保存偏好
        </button>
      </div>
      <p v-if="message" class="success-copy" role="status">{{ message }}</p>
      <p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
    </form>
    <TrainingReminderSettings />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showConfirmDialog } from 'vant'
import StateBlock from '@/components/StateBlock.vue'
import TrainingReminderSettings from '@/components/TrainingReminderSettings.vue'
import { clearTrainingPreferences, getTrainingPreferences, saveTrainingPreferences } from '@/services/trainingPlans'

const dayLabels = ['一', '二', '三', '四', '五', '六', '日']
const saved = ref(null)
const goal = ref('')
const days = ref([])
const loading = ref(true)
const loadError = ref('')
const updating = ref(false)
const message = ref('')
const saveError = ref('')
const hasSavedPreferences = computed(() => Boolean(saved.value?.goalType || saved.value?.weekdays.length))
const dirty = computed(() => saved.value &&
  (goal.value !== (saved.value.goalType ?? '') || days.value.join() !== saved.value.weekdays.join()))

function display(preferences) {
  saved.value = preferences
  goal.value = preferences.goalType ?? ''
  days.value = [...preferences.weekdays]
}

function toggleDay(day) {
  days.value = days.value.includes(day) ? days.value.filter(value => value !== day) : [...days.value, day].sort()
  message.value = ''
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    display(await getTrainingPreferences())
  } catch {
    loadError.value = '暂时无法读取本账号的训练偏好，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (updating.value || !dirty.value || days.value.length === 1) return
  updating.value = true
  message.value = ''
  saveError.value = ''
  try {
    display(await saveTrainingPreferences({ goalType: goal.value || null, weekdays: days.value }))
    message.value = '训练偏好已保存。'
  } catch {
    saveError.value = '训练偏好保存失败，请重试。'
  } finally {
    updating.value = false
  }
}

async function clear() {
  if (updating.value) return
  updating.value = true
  message.value = ''
  saveError.value = ''
  try {
    const confirmed = await showConfirmDialog({
      title: '清除训练偏好',
      message: '清除常用目标和训练日后，教练会按新对话的信息生成计划。',
      confirmButtonText: '清除',
    }).then(() => true, () => false)
    if (!confirmed) return
    display(await clearTrainingPreferences())
    message.value = '训练偏好已清除。'
  } catch {
    saveError.value = '暂时无法清除训练偏好，请重试。'
  } finally {
    updating.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.preference-form {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-4);
}

.preference-intro,
.preference-form fieldset > p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-wrap: pretty;
}

.preference-form fieldset {
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  border: 0;
  margin: 0;
  padding: 0;
}

.preference-form :is(legend, label) {
  padding: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 750;
}

.preference-form select {
  min-width: 0;
  width: 100%;
  min-height: 44px;
  padding-inline: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
  color: var(--text);
}

.preference-days {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.preference-days button {
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
}

.preference-days button[aria-pressed="true"] {
  border-color: var(--green-strong);
  background: color-mix(in srgb, var(--app-green) 16%, var(--panel));
  color: var(--green-strong);
  font-weight: 750;
}

.preference-form button:disabled { opacity: .5; }
.preference-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.preference-actions > button { min-height: 44px; }
.preference-form [role="status"],
.preference-form [role="alert"] { margin: 0; }
</style>
