<template>
  <section
    class="today-training"
    :class="{ 'today-training--embedded': embedded }"
    aria-labelledby="today-training-title"
    :aria-busy="loading"
  >
    <div class="today-training__main">
      <div class="today-training__heading">
        <CalendarCheck :size="17" aria-hidden="true" />
        <h2 id="today-training-title">今日训练</h2>
        <span v-if="session" class="status-chip" :class="{ good: session.status === 'completed' }">
          {{ labels[session.status] }}
        </span>
      </div>

      <p v-if="loading" class="today-training__desc" role="status">正在读取训练任务…</p>
      <p v-else-if="error" class="today-training__desc" role="status">暂时无法读取训练任务</p>
      <template v-else-if="session">
        <strong class="today-training__task">{{ session.title }}</strong>
        <p v-if="sessionDetails" class="today-training__desc">{{ sessionDetails }}</p>
      </template>
      <p v-else-if="training?.plan" class="today-training__desc">
        {{ training.plan.startDate > training.date ? `计划将于 ${training.plan.startDate} 开始` : '今天为计划休息日' }}
      </p>
      <p v-else class="today-training__desc">还没有执行中的训练计划</p>
    </div>

    <div class="today-training__side">
      <button v-if="error" class="today-training__pill" type="button" @click="load">重试</button>
      <RouterLink v-else-if="session" class="today-training__pill" :to="sessionLink">
        {{ session.activityId ? '看复盘' : '去查看' }}
        <ChevronRight :size="14" aria-hidden="true" />
      </RouterLink>
      <RouterLink v-else-if="training?.plan" class="today-training__pill" :to="planLink">
        看计划
        <ChevronRight :size="14" aria-hidden="true" />
      </RouterLink>
      <RouterLink v-else-if="!loading" class="today-training__pill today-training__pill--primary" :to="{ name: 'coach', query: { from: 'today' } }">
        制定计划
        <ChevronRight :size="14" aria-hidden="true" />
      </RouterLink>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { CalendarCheck, ChevronRight } from '@lucide/vue'
import { getTodayTraining } from '@/services/trainingPlans'

defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
})

const loading = ref(true)
const error = ref(false)
const training = ref(null)
const labels = { pending: '待训练', completed: '已完成', skipped: '已跳过' }
const session = computed(() => training.value?.session)
const planLink = computed(() => ({
  name: 'training-plans', query: { from: 'today', planId: training.value.plan.id, session: session.value?.id },
}))
const sessionLink = computed(() => session.value?.activityId
  ? { name: 'activity-detail', params: { id: session.value.activityId }, query: { from: 'today', tab: 'analysis' } }
  : planLink.value)
const sessionDetails = computed(() => {
  const { distanceM, durationS, subtitle } = session.value
  return [distanceM && `${distanceM / 1000} km`, durationS && `${Math.ceil(durationS / 60)} min`, subtitle].filter(Boolean).join(' · ')
})

async function load() {
  loading.value = true
  error.value = false
  try {
    training.value = await getTodayTraining()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.today-training {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.today-training--embedded {
  padding: 12px 0 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  border-top: 0.5px solid var(--border);
}

.today-training__main {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
}

.today-training__heading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--green-strong);
}

.today-training__heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 14.5px;
  font-weight: 650;
}

.today-training__task {
  font-size: 16px;
  font-weight: 650;
  color: var(--text);
  overflow-wrap: anywhere;
}

.today-training__desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.35;
}

.today-training__side {
  flex: 0 0 auto;
}

.today-training__pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  min-height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.today-training__pill--primary {
  background: var(--green-tint);
  color: var(--green-strong);
}
</style>
