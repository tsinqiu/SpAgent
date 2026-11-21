<template>
  <div class="page-stack weekly-report-page">
    <section class="weekly-report-period">
      <button type="button" aria-label="上一周" :disabled="loading || !report?.previousWeekStart" @click="selectWeek(report.previousWeekStart)">
        <ChevronLeft :size="22" aria-hidden="true" />
      </button>
      <div>
        <h1 aria-live="polite">{{ report ? `${report.startDate} 至 ${report.endDate}` : '训练周报' }}</h1>
        <p>北京时间<span v-if="report && isCurrentWeek"> · 统计至 {{ report.asOf }}</span></p>
      </div>
      <button type="button" aria-label="下一周" :disabled="loading || !report?.nextWeekStart" @click="selectWeek(report.nextWeekStart)">
        <ChevronRight :size="22" aria-hidden="true" />
      </button>
      <button v-if="route.query.week !== undefined" class="weekly-report-now" type="button" :disabled="loading" @click="selectWeek()">
        返回本周
      </button>
    </section>

    <StateBlock v-if="loading" title="正在加载周报" message="正在读取运动记录和训练计划。" />
    <StateBlock v-else-if="error" title="周报加载失败" :message="error" tone="danger" action-label="重试" @action="load" />
    <template v-else-if="report">
      <section class="panel weekly-report-card">
        <h2>实际运动</h2>
        <StateBlock v-if="!report.actual.activityCount" title="本周暂无运动记录" message="补记或同步运动后，这里会显示训练量。" />
        <template v-else>
          <div class="weekly-report-totals">
            <div class="weekly-report-primary">
              <span>运动时长</span>
              <strong>{{ formatDurationZh(report.actual.durationS) }}</strong>
            </div>
            <div><span>运动次数</span><strong>{{ report.actual.activityCount }} 次</strong></div>
            <div><span>运动天数</span><strong>{{ report.actual.activeDays }} 天</strong></div>
            <div><span>总距离</span><strong>{{ formatDistance(report.actual.distanceM) }}</strong></div>
          </div>
          <p v-if="coverageNotes.length" class="weekly-report-note">{{ coverageNotes.join(' · ') }}</p>
          <figure class="weekly-report-chart">
            <figcaption>每日运动时长（分钟）</figcaption>
            <ol class="weekly-report-bars">
              <li v-for="(day, index) in report.days" :key="day.date">
                <span class="weekly-report-bar-value" :title="dailyLabel(day)">
                  {{ dailyValue(day) }}
                </span>
                <span class="weekly-report-bar-track" aria-hidden="true">
                  <span :style="{ '--bar-height': barHeight(day) }"></span>
                </span>
                <time :datetime="day.date" :aria-label="day.date">{{ weekdays[index] }}</time>
              </li>
            </ol>
          </figure>
        </template>
      </section>

      <WeeklyTrend
        v-if="report.trend?.length"
        v-model="trendMetric"
        :weeks="report.trend"
        :selected-week="report.startDate"
        @select-week="selectWeek"
      />

      <section class="panel weekly-report-card">
        <h2>计划执行</h2>
        <StateBlock v-if="!plans.length" title="本周没有计划安排" message="启用计划后，周报会显示训练任务的完成情况。" />
        <article v-for="plan in plans" :key="plan.id" class="weekly-report-plan">
          <header>
            <RouterLink :to="{ name: 'training-plans', query: { planId: plan.id } }">{{ plan.name }}</RouterLink>
            <p>{{ plan.status === 'archived' ? '归档计划 · 已记录结果' : '启用中' }}</p>
          </header>
          <ul class="weekly-report-sessions">
            <li v-for="session in plan.sessions" :key="session.id">
              <time :datetime="session.date">{{ session.date.slice(5) }}</time>
              <RouterLink v-if="session.activityId" :to="{ name: 'activity-detail', params: { id: session.activityId } }">{{ session.title }}</RouterLink>
              <span v-else>{{ session.title }}</span>
              <span class="status-chip" :class="session.status === 'completed' ? 'good' : 'neutral'">
                {{ sessionLabels[session.status] }}
              </span>
            </li>
          </ul>
        </article>
      </section>
      <WeeklyGuidance v-if="isCurrentWeek" :week-start="report.startDate" />
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import StateBlock from '@/components/StateBlock.vue'
import WeeklyGuidance from '@/components/WeeklyGuidance.vue'
import WeeklyTrend from '@/components/WeeklyTrend.vue'
import { getWeeklyReport } from '@/services/trainingPlans'
import { formatDistance, formatDurationZh } from '@/utils/formatters'

const route = useRoute()
const router = useRouter()
const report = ref(null)
const loading = ref(false)
const error = ref('')
const trendMetric = ref('duration')
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const sessionLabels = { completed: '已完成', pending: '待完成', skipped: '已跳过' }
let requestId = 0

const isCurrentWeek = computed(() => report.value?.startDate === report.value?.currentWeekStart)
const maxDuration = computed(() => Math.max(1, ...(report.value?.days ?? []).map(day => day.durationS ?? 0)))
const coverageNotes = computed(() => {
  const { activityCount, durationSamples, distanceSamples, demoActivities } = report.value.actual
  const notes = []
  if (durationSamples < activityCount) notes.push(`${durationSamples}/${activityCount} 条记录有时长`)
  if (distanceSamples < activityCount) notes.push(`${distanceSamples}/${activityCount} 条记录有距离`)
  if (demoActivities) notes.push(`含 ${demoActivities} 条演示记录`)
  return notes
})
const plans = computed(() => {
  const byId = new Map()
  for (const session of report.value?.sessions ?? []) {
    if (!byId.has(session.planId)) {
      byId.set(session.planId, { id: session.planId, name: session.planName, status: session.planStatus, sessions: [] })
    }
    byId.get(session.planId).sessions.push(session)
  }
  return [...byId.values()]
})

function selectWeek(week) {
  const query = week && week !== report.value?.currentWeekStart ? { week } : {}
  router.replace({ name: 'weekly-report', query })
}

function dailyLabel(day) {
  if (day.date > report.value.asOf) return '日期未到'
  if (!day.activityCount) return '暂无运动'
  if (day.durationS == null) return '缺少运动时长'
  return formatDurationZh(day.durationS)
}

function dailyValue(day) {
  if (day.durationS == null) return '—'
  if (day.durationS > 0 && day.durationS < 60) return '<1'
  return Math.floor(day.durationS / 60)
}

function barHeight(day) {
  return day.durationS > 0 ? `${Math.max(4, day.durationS / maxDuration.value * 100)}%` : '0%'
}

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  const week = route.query.week
  try {
    const data = await getWeeklyReport(week === undefined || typeof week === 'string' ? week : '')
    if (id === requestId) report.value = data
  } catch (err) {
    if (id === requestId) {
      report.value = null
      error.value = err?.status === 400 ? '无法读取这个周次，请返回本周。' : '暂时无法读取周报，请稍后重试。'
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(() => route.query.week, load, { immediate: true })
</script>

<style scoped>
.weekly-report-period,
.weekly-report-card {
  padding: 20px;
}

.weekly-report-period {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 4px;
  text-align: center;
}

.weekly-report-period h1 {
  margin: 0;
  font-size: clamp(16px, 4.8cqi, 19px);
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
  font-variant-numeric: tabular-nums;
}

.weekly-report-period p,
.weekly-report-note,
.weekly-report-plan p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12.5px;
}

.weekly-report-period button {
  display: grid;
  place-items: center;
  min-height: 40px;
  border: 0;
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.weekly-report-period button:disabled { opacity: 0.38; box-shadow: none; }

.weekly-report-period .weekly-report-now {
  grid-column: 2;
  justify-self: center;
  min-height: 32px;
  padding-inline: 14px;
  font-size: 12.5px;
  font-weight: 560;
  color: var(--green-strong);
}

.weekly-report-card {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.weekly-report-card h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.weekly-report-totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.weekly-report-totals > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.weekly-report-totals span {
  color: var(--muted);
  font-size: 12px;
}

.weekly-report-totals strong {
  font-size: 16px;
  font-weight: 620;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.weekly-report-primary {
  grid-column: 1 / -1;
  padding: 16px 18px;
  border-radius: 16px;
  background: var(--panel-soft);
}

.weekly-report-primary strong {
  font-size: clamp(24px, 7.5cqi, 34px);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.weekly-report-chart {
  margin: 0;
  border-top: 1px solid var(--border);
  padding-top: var(--space-3);
}

.weekly-report-chart figcaption {
  color: var(--muted);
  font-size: 13px;
}

.weekly-report-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  padding: 0;
  margin: var(--space-3) 0 0;
  list-style: none;
}

.weekly-report-bars li {
  display: grid;
  justify-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 12px;
}

.weekly-report-bar-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.weekly-report-bar-track {
  display: flex;
  align-items: end;
  width: min(60%, 18px);
  height: 68px;
  background: var(--panel-soft);
  border-radius: 999px;
  overflow: hidden;
}

.weekly-report-bar-track span {
  width: 100%;
  height: var(--bar-height);
  border-radius: inherit;
  background: var(--app-green);
}

.weekly-report-plan + .weekly-report-plan {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.weekly-report-plan a {
  color: var(--green-strong);
  font-weight: 750;
  overflow-wrap: anywhere;
}

.weekly-report-sessions {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.weekly-report-sessions li {
  display: grid;
  align-items: center;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-2);
  min-height: 44px;
  padding-block: 6px;
  border-top: 1px solid var(--border);
  overflow-wrap: anywhere;
}

.weekly-report-sessions time {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
