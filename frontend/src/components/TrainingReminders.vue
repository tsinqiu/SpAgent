<template>
  <section v-if="reminders.length" class="training-reminders" aria-label="训练提醒">
    <ul>
      <li v-for="item in reminders" :key="item.id">
        <RouterLink class="training-reminder__link" :to="reminderLink(item)">
          <Bell :size="18" aria-hidden="true" />
          <span>
            <strong>{{ item.kind === 'daily_training' ? '今天还有训练' : '上周训练可以复盘了' }}</strong>
            <small v-if="item.kind === 'daily_training'">{{ item.sessionTitle }}</small>
          </span>
          <ChevronRight :size="18" aria-hidden="true" />
        </RouterLink>
        <button
          class="training-reminder__dismiss"
          type="button"
          :aria-label="item.kind === 'daily_training' ? '关闭今日训练提醒' : '关闭本周周报提醒'"
          :disabled="dismissing.has(item.id)"
          @click="dismiss(item)"
        >
          <X :size="16" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-if="dismissError" class="soft-note" role="alert">关闭提醒失败，请重试。</p>
  </section>
</template>

<script setup>
import { Bell, ChevronRight, X } from '@lucide/vue'
import { onMounted, reactive, ref } from 'vue'
import { dismissReminder, listTrainingReminders } from '@/services/trainingReminders'

const reminders = ref([])
const dismissing = reactive(new Set())
const dismissError = ref(false)

function reminderLink(item) {
  if (item.kind === 'daily_training') {
    return { name: 'training-plans', query: { planId: item.planId, session: item.sessionId, from: 'today' } }
  }
  return { name: 'weekly-report', query: { week: item.periodStart, from: 'today' } }
}

async function load() {
  try {
    const data = await listTrainingReminders()
    reminders.value = Array.isArray(data?.reminders) ? data.reminders : []
  } catch {
    reminders.value = []
  }
}

async function dismiss(item) {
  dismissing.add(item.id)
  dismissError.value = false
  try {
    await dismissReminder(item.id)
    reminders.value = reminders.value.filter(({ id }) => id !== item.id)
  } catch {
    dismissError.value = true
  } finally {
    dismissing.delete(item.id)
  }
}

onMounted(load)
</script>

<style scoped>
.training-reminders ul {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.training-reminders li {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow: hidden;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}

.training-reminder__link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-height: 48px;
  min-width: 0;
  padding: 6px 8px;
  color: var(--text);
  text-decoration: none;
}

.training-reminder__link span { display: grid; gap: 2px; }
.training-reminder__link strong { font-size: 14px; }
.training-reminder__link small { color: var(--muted); overflow-wrap: anywhere; }
.training-reminder__link > svg:first-child { color: var(--green); }
.training-reminder__link > svg:last-child { color: var(--muted); }

.training-reminder__dismiss {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}

.training-reminder__dismiss:disabled { opacity: 0.5; }
.training-reminder__link, .training-reminder__dismiss { touch-action: manipulation; }
.training-reminder__link:active,
.training-reminder__dismiss:active { background: var(--panel-soft); }
</style>
