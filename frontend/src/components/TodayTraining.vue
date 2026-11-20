<template>
  <section class="today-training" aria-labelledby="today-training-title" :aria-busy="loading">
    <div class="today-training__heading">
      <CalendarCheck :size="20" aria-hidden="true" />
      <h2 id="today-training-title">今日训练</h2>
      <span v-if="session" class="status-chip" :class="{ good: session.status === 'completed' }">{{ labels[session.status] }}</span>
    </div>

    <p v-if="loading" role="status">正在读取训练任务…</p>
    <template v-else-if="error">
      <p role="status">暂时无法读取训练任务。</p>
      <button class="today-training__action" type="button" @click="load">重试</button>
    </template>
    <template v-else-if="session">
      <strong class="today-training__task">{{ session.title }}</strong>
      <p v-if="sessionDetails">{{ sessionDetails }}</p>
      <RouterLink class="today-training__action" :to="sessionLink">{{ session.activityId ? '查看训练复盘' : '查看训练任务' }}</RouterLink>
    </template>
    <template v-else-if="training?.plan">
      <p>{{ training.plan.startDate > training.date ? `计划将于 ${training.plan.startDate} 开始。` : '今天没有安排训练。' }}</p>
      <RouterLink class="today-training__action" :to="planLink">查看计划</RouterLink>
    </template>
    <template v-else>
      <p>还没有执行中的训练计划。</p>
      <RouterLink class="today-training__action" :to="{ name: 'coach', query: { from: 'today' } }">和教练制定计划</RouterLink>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { CalendarCheck } from '@lucide/vue'
import { getTodayTraining } from '@/services/trainingPlans'

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
  return [distanceM && `${distanceM / 1000} 公里`, durationS && `${Math.ceil(durationS / 60)} 分钟`, subtitle].filter(Boolean).join(' · ')
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
  display: grid;
  gap: 8px;
  min-height: 124px;
  align-content: start;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel);
}
.today-training__heading { display: flex; align-items: center; gap: 9px; color: var(--green-strong); }
.today-training__heading h2 { margin: 0; color: var(--text); font-size: 16px; }
.today-training__heading .status-chip { margin-inline-start: auto; }
.today-training__task { font-size: 20px; overflow-wrap: anywhere; }
.today-training p { margin: 0; color: var(--muted); }
.today-training__action {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-weight: 700;
  color: var(--green-strong);
  background: transparent;
  border: 0;
  padding: 0;
}
</style>
