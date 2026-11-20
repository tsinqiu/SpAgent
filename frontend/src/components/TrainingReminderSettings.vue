<template>
  <section class="training-reminder-settings" aria-labelledby="training-reminder-settings-heading">
    <header>
      <h2 id="training-reminder-settings-heading">训练提醒</h2>
      <p>在「今日」页查看，按北京时间更新。</p>
    </header>
    <p v-if="loading" role="status">正在读取提醒设置…</p>
    <button v-else-if="!preferences" class="training-reminder-settings__retry" type="button" @click="load">
      提醒设置加载失败，重试
    </button>
    <template v-else>
      <label v-for="option in options" :key="option.key">
        <span>
          <strong>{{ option.title }}</strong>
          <small>{{ option.description }}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          :aria-label="option.title"
          :checked="preferences[option.key]"
          :disabled="saving"
          @change="update(option.key, $event.target.checked)"
        />
      </label>
      <p v-if="saveError" role="alert">保存失败，设置已恢复，请重试。</p>
      <p v-else-if="saving" role="status">正在保存提醒设置…</p>
    </template>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { getReminderPreferences, saveReminderPreferences } from '@/services/trainingReminders'

const options = [
  { key: 'dailyTraining', title: '今日训练', description: '当天有待完成的训练时提醒。' },
  { key: 'weeklyReport', title: '每周复盘', description: '上周有活动或已记录的训练结果时提醒。' },
]
const preferences = ref(null)
const loading = ref(true)
const saving = ref(false)
const saveError = ref(false)

async function load() {
  loading.value = true
  try {
    preferences.value = await getReminderPreferences()
  } catch {
    preferences.value = null
  } finally {
    loading.value = false
  }
}

async function update(key, enabled) {
  const previous = preferences.value
  saving.value = true
  saveError.value = false
  preferences.value = { ...previous, [key]: enabled }
  try {
    preferences.value = await saveReminderPreferences(preferences.value)
  } catch {
    preferences.value = previous
    saveError.value = true
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.training-reminder-settings {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}

.training-reminder-settings h2 { margin: 0 0 4px; font-size: 16px; }
.training-reminder-settings :is(p, small) { margin: 0; color: var(--muted); font-size: 13px; }
.training-reminder-settings label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  cursor: pointer;
}

.training-reminder-settings label span { display: grid; gap: 2px; }
.training-reminder-settings input {
  appearance: none;
  flex: 0 0 44px;
  width: 44px;
  height: 25px;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: radial-gradient(circle, #fff 0 7px, transparent 7.5px) no-repeat left center / 22px 100%, var(--muted);
  cursor: pointer;
}

.training-reminder-settings input:checked { background-position: right center; background-color: var(--green-strong); }
.training-reminder-settings input:disabled { opacity: 0.6; cursor: wait; }
.training-reminder-settings input:focus-visible { outline: 2px solid var(--green-strong); outline-offset: 3px; }
.training-reminder-settings label { touch-action: manipulation; }

.training-reminder-settings__retry {
  justify-self: start;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-soft);
  color: var(--text);
}
</style>
