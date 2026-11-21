<template>
  <div class="page-stack today-home">
    <StateBlock v-if="loading" title="正在准备今日概览" message="正在读取身体状态、训练负荷与实时天气。" />
    <StateBlock
      v-else-if="!coreLoaded && errors.length"
      title="今日数据加载失败"
      message="连接暂时不可用，稍后再试一次。"
      action-label="重试"
      tone="danger"
      @action="loadToday"
    />

    <template v-else>
      <p v-if="errors.length" class="soft-note">部分内容暂时不可用，已用现有数据生成概览。</p>

      <!-- 1. Unified Daily Cockpit: Date + Weather + Today Plan + Selected Day Activity -->
      <section class="today-cockpit" aria-label="今日驾驶舱">
        <header class="today-cockpit__top">
          <div class="today-date-nav" aria-label="日期切换">
            <button type="button" aria-label="前一天" @click="shiftSelectedDate(-1)">
              <ChevronLeft :size="18" />
            </button>
            <strong>{{ selectedDateLabel }}</strong>
            <button type="button" aria-label="后一天" :disabled="!canShiftNextDate" @click="shiftSelectedDate(1)">
              <ChevronRight :size="18" />
            </button>
          </div>

          <button v-if="!isToday" type="button" class="today-back-pill" @click="jumpToToday">
            回今天
          </button>
          <div v-else class="today-weather-pill" aria-label="当前天气">
            <Sun :size="15" class="today-weather-pill__icon" aria-hidden="true" />
            <span class="today-weather-pill__loc">{{ weatherCard.location }}</span>
            <strong>{{ weatherCard.temperature }}</strong>
            <span v-if="weatherCard.condition" class="today-weather-pill__cond">{{ weatherCard.condition }}</span>
          </div>
        </header>

        <section class="today-weather-card" aria-label="环境与跑步适宜度">
          <div class="today-weather-strip">
            <span class="today-weather-strip__meta">
              <template v-if="weatherCard.hasMetrics">
                <template v-if="!isToday">{{ weatherCard.location }} {{ weatherCard.temperature }} {{ weatherCard.condition }} · </template>
                体感 {{ weatherCard.feelsLike }}
                <template v-if="weatherCard.humidity"> · 湿度 {{ weatherCard.humidity }}</template>
                <template v-if="weatherCard.aqi"> · AQI {{ weatherCard.aqi }}</template>
              </template>
              <template v-else>
                {{ weatherCard.fallbackText }}
              </template>
            </span>
            <span class="today-weather-strip__badge" :class="weatherCard.tone">
              {{ weatherCard.badge }}
            </span>
          </div>
        </section>

        <TodayTraining embedded />

        <div class="today-day-activity">
          <p v-if="dayActivitiesLoading" class="today-day-loading">正在读取 {{ selectedDateKey }} 记录…</p>
          <template v-else-if="selectedDateActivities.length">
            <ActivityCard
              v-for="activity in selectedDateActivities"
              :key="activity.id || activity.activity_key"
              :activity="activity"
              @select="openActivity"
            />
          </template>
          <article v-else class="today-no-activity-row">
            <span class="today-no-activity-row__left">
              <CalendarDays :size="16" aria-hidden="true" />
              <span>{{ isToday ? '当日暂无运动记录' : `${selectedDateShort} 暂无运动记录` }}</span>
            </span>
            <div class="today-no-activity-row__actions">
              <button
                v-if="latestActiveDateKey && latestActiveDateKey !== selectedDateKey"
                type="button"
                class="today-jump-chip"
                @click="jumpToDate(latestActiveDateKey)"
              >
                最近 {{ latestActiveDateKey.slice(5).replace('-', '/') }}
              </button>
              <RouterLink class="today-no-activity-row__link" to="/record">
                去记录
                <ChevronRight :size="14" aria-hidden="true" />
              </RouterLink>
            </div>
          </article>
        </div>
      </section>

      <TrainingReminders />

      <!-- 2. Training Readiness & Weekly Load (reactive to selectedDate) -->
      <section class="rq-overview-panel training-index-panel">
        <div class="rq-overview-panel__top">
          <div class="training-index-head">
            <h2 class="training-index-title">训练指数</h2>
            <small v-if="activeLoadDateNote" class="training-index-date">{{ activeLoadDateNote }}</small>
          </div>
          <strong class="training-index-score-num">{{ trainingIndexDisplay }}</strong>
        </div>
        <p class="training-index-advice">{{ compactTrainingAdvice }}</p>
        <div class="training-index-gauge" :style="trainingIndexStyle" aria-label="训练指数">
          <div class="performance-gradient-track">
            <i class="score-band__marker" aria-hidden="true"></i>
          </div>
          <div class="performance-track-labels" aria-hidden="true">
            <span>恢复</span>
            <span>稳态</span>
            <span>训练</span>
          </div>
        </div>
        <div class="rq-overview-panel__stats">
          <span><small>体能（CTL）</small><b>{{ metricValue(currentLoad.ctl) }}</b></span>
          <span><small>疲劳（ATL）</small><b>{{ metricValue(currentLoad.atl) }}</b></span>
          <span><small>状态（TSB）</small><b>{{ metricValue(currentLoad.tsb) }}</b></span>
        </div>
      </section>

      <section class="microcycle-panel">
        <div class="section-heading">
          <div class="microcycle-heading">
            <h2>{{ isToday ? '本周训练节奏' : '当周训练节奏' }}</h2>
            <small v-if="!isToday" class="microcycle-range">{{ selectedWeekRangeLabel }}</small>
          </div>
          <span class="status-chip" :class="weekSummary.tone">{{ weekSummary.label }}</span>
        </div>
        <div class="microcycle-summary">
          <span><small>周负荷</small><b>{{ weekSummary.load }}</b></span>
          <span><small>有负荷记录</small><b>{{ weekSummary.activeDays }}</b></span>
        </div>
        <div class="microcycle-bars" aria-label="本周训练负荷">
          <span
            v-for="bar in weeklyLoadBars"
            :key="bar.key"
            :class="{ today: bar.isSelected, active: bar.hasLoad }"
            :title="bar.tooltip"
            :aria-label="bar.tooltip"
            @click="jumpToDate(bar.key)"
          >
            <i :style="{ '--bar-height': bar.height }" aria-hidden="true"></i>
            <small>{{ bar.label }}</small>
          </span>
        </div>
      </section>

      <!-- 3. Lean, non-redundant quick actions -->
      <nav class="today-action-strip" aria-label="今日快捷入口">
        <RouterLink v-for="item in todayActions" :key="item.label" :to="item.to" class="today-action-pill">
          <component :is="item.icon" :size="16" :style="{ color: item.color }" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <ChevronRight :size="14" class="today-action-pill__arrow" aria-hidden="true" />
        </RouterLink>
      </nav>

      <RouterLink v-if="showApkDownloadEntry" class="today-apk-entry" :to="{ name: 'download' }">
        <DownloadIcon :size="15" aria-hidden="true" />
        <span>下载安卓版 APK</span>
        <ChevronRight :size="14" aria-hidden="true" />
      </RouterLink>
    </template>
  </div>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download as DownloadIcon,
  HeartPulse,
  Sun,
} from '@lucide/vue'
import { useRouter } from 'vue-router'

import ActivityCard from '@/components/ActivityCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import TodayTraining from '@/components/TodayTraining.vue'
import TrainingReminders from '@/components/TrainingReminders.vue'
import { getActivityPage } from '@/services/activities'
import { getDailyBrief } from '@/services/ai'
import { getDashboardOverview, getTodayHealth } from '@/services/dashboard'
import { getPerformanceProfile } from '@/services/performance'
import { getLiveWeather } from '@/services/system'
import { getLoadBalance } from '@/services/training'
import { deriveStatusBadge } from '@/utils/productInsights'

const router = useRouter()
const overview = ref({ recentActivities: [], monthlySummary: {}, yearlySummary: {}, trainingLoad: [] })
const extendedLoadRows = ref([])
const health = ref({})
const brief = ref(null)
const performanceProfile = ref(null)
const liveWeather = ref(null)
const loading = ref(false)
const dayActivitiesLoading = ref(false)
const errors = ref([])
const coreLoaded = ref(false)
let loadVersion = 0
let dayFetchVersion = 0

const todayDate = startOfDay(new Date())
const todayKey = formatDateKey(todayDate)
const selectedDate = ref(startOfDay(new Date()))
const dayActivitiesCache = reactive({})
const showApkDownloadEntry = !Capacitor.isNativePlatform()

const selectedDateKey = computed(() => formatDateKey(selectedDate.value))
const isToday = computed(() => selectedDateKey.value === todayKey)
const selectedDateShort = computed(() => `${String(selectedDate.value.getMonth() + 1).padStart(2, '0')}/${String(selectedDate.value.getDate()).padStart(2, '0')}`)

const recentActivities = computed(() => (overview.value.recentActivities || []).slice(0, 10))
const latestActiveDateKey = computed(() => {
  const first = recentActivities.value[0]
  return first ? normalizeDateKey(first.local_start_time || first.start_time_utc) : ''
})

const selectedDateActivities = computed(() => {
  if (Object.hasOwn(dayActivitiesCache, selectedDateKey.value)) {
    return dayActivitiesCache[selectedDateKey.value]
  }
  return recentActivities.value.filter((activity) => (
    normalizeDateKey(activity.local_start_time || activity.start_time_utc) === selectedDateKey.value
  ))
})

const mergedLoadRows = computed(() => {
  const byDate = new Map()
  for (const row of extendedLoadRows.value || []) {
    const key = normalizeDateKey(row.date)
    if (key) byDate.set(key, row)
  }
  for (const row of overview.value.trainingLoad || []) {
    const key = normalizeDateKey(row.date)
    if (key) byDate.set(key, row)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, row]) => ({ ...row, date }))
})

const currentLoad = computed(() => {
  const rows = mergedLoadRows.value
  if (!rows.length) return {}
  if (isToday.value) return rows.at(-1) || {}
  const target = selectedDateKey.value
  let matched = null
  for (const row of rows) {
    if (row.date <= target) matched = row
    else break
  }
  return matched || {}
})

const activeLoadDateNote = computed(() => {
  if (isToday.value) return ''
  if (currentLoad.value?.date) return `截至 ${currentLoad.value.date}`
  return `${selectedDateKey.value} 暂无负荷`
})

const statusBadge = computed(() => deriveStatusBadge({
  sleepScore: isToday.value ? health.value.sleepScore : undefined,
  avgStressLevel: isToday.value ? health.value.avgStressLevel : undefined,
  tsb: currentLoad.value.tsb,
}))

const trainingIndex = computed(() => performanceProfile.value?.trainingIndex || null)
const trainingIndexScore = computed(() => {
  if (!isToday.value) {
    const tsb = Number(currentLoad.value?.tsb)
    if (!Number.isFinite(tsb)) return null
    return Math.max(15, Math.min(95, Math.round(55 + tsb * 1.4)))
  }
  const fromProfile = Number(trainingIndex.value?.score)
  if (Number.isFinite(fromProfile)) return Math.max(0, Math.min(100, Math.round(fromProfile)))
  const fromBrief = Number(brief.value?.ml?.trainingIndexScore ?? brief.value?.ml?.readinessScore)
  return Number.isFinite(fromBrief) ? Math.max(0, Math.min(100, Math.round(fromBrief))) : null
})
const trainingIndexDisplay = computed(() => trainingIndexScore.value ?? '--')
const trainingIndexLabel = computed(() => (
  isToday.value
    ? (trainingIndex.value?.label || brief.value?.ml?.trainingIndexLabel || statusBadge.value.label)
    : statusBadge.value.label
))
const compactTrainingAdvice = computed(() => {
  if (!isToday.value) {
    const tsb = Number(currentLoad.value?.tsb)
    if (!Number.isFinite(tsb)) return `${selectedDateKey.value} 暂无对应训练负荷数据`
    return `${statusBadge.value.label}，当日体能状态（TSB）${tsb >= 0 ? '+' : ''}${tsb}`
  }
  const text = trainingIndex.value?.recommendation || brief.value?.recommendation || statusBadge.value.message || ''
  const advice = text.replace(/[。.!！]$/, '')
  const label = trainingIndexLabel.value || ''
  if (!label) return advice
  if (!advice) return label
  return advice.startsWith(label) ? advice : `${label}，${advice}`
})
const trainingIndexStyle = computed(() => ({
  '--score-position': `${trainingIndexScore.value ?? 0}%`,
}))
const selectedDateLabel = computed(() => {
  const date = selectedDate.value
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${week}`
})
const canShiftNextDate = computed(() => selectedDateKey.value < todayKey)

const todayActions = [
  { label: '训练计划', to: { path: '/training-plans', query: { from: 'today' } }, icon: ClipboardList, color: '#16a34a' },
  { label: '状态分析', to: { path: '/status', query: { from: 'today' } }, icon: HeartPulse, color: '#0ea5e9' },
]

const latestWeatherActivity = computed(() => recentActivities.value.find((activity) => (
  activity.location_name || activity.weather_condition || activity.temperature_c != null
)) || recentActivities.value[0] || null)

const weatherCard = computed(() => {
  if (!isToday.value) {
    const histAct = selectedDateActivities.value.find(a => (
      a.temperature_c != null || a.feels_like_c != null || a.humidity_percent != null || a.weather_condition
    ))
    if (histAct) {
      const temp = histAct.temperature_c
      const feels = histAct.feels_like_c ?? temp
      const humid = histAct.humidity_percent
      return {
        hasMetrics: true,
        location: (histAct.location_name || '运动地点').replace(/市$/, ''),
        condition: histAct.weather_condition || '',
        temperature: temp == null ? '--°' : `${Math.round(temp)}°`,
        feelsLike: feels == null ? '--°C' : `${Math.round(feels)}°C`,
        humidity: humid == null ? '' : `${Math.round(humid)}%`,
        aqi: '',
        badge: '历史实录',
        tone: 'neutral',
        fallbackText: '',
      }
    }
    return {
      hasMetrics: false,
      location: '',
      condition: '',
      temperature: '--°',
      feelsLike: '--°C',
      humidity: '',
      aqi: '',
      badge: '历史日期',
      tone: 'neutral',
      fallbackText: `${selectedDateKey.value} · 展示当日运动与负荷记录`,
    }
  }

  if (liveWeather.value?.ok && liveWeather.value.current) {
    const cur = liveWeather.value.current
    const aqi = liveWeather.value.airQuality
    const advice = liveWeather.value.runningAdvice || {}
    const toneMap = {
      ideal: 'good',
      good: 'good',
      caution: 'warning',
      indoor_recommended: 'danger',
    }
    return {
      hasMetrics: true,
      location: liveWeather.value.location?.name || '当地',
      condition: cur.condition || '',
      temperature: cur.tempC == null ? '--°' : `${Math.round(cur.tempC)}°`,
      feelsLike: cur.apparentTempC == null ? '--°C' : `${Math.round(cur.apparentTempC)}°C`,
      humidity: cur.humidityPct == null ? '' : `${Math.round(cur.humidityPct)}%`,
      aqi: aqi?.usAqi != null ? `${Math.round(aqi.usAqi)}${aqi.grade ? ` ${aqi.grade}` : ''}` : '',
      badge: advice.label || '适宜跑步',
      tone: toneMap[advice.suitability] || 'good',
      fallbackText: '',
    }
  }
  return {
    hasMetrics: false,
    location: latestWeatherActivity.value?.location_name?.replace(/市$/, '') || '无锡',
    condition: '',
    temperature: '--°',
    feelsLike: '--°C',
    humidity: '',
    aqi: '',
    badge: '实时获取中',
    tone: 'neutral',
    fallbackText: '正在同步当地实时气象与空气质量…',
  }
})

const weeklyLoadBars = computed(() => {
  const rows = buildWeekRows(selectedDate.value)
  const maxLoad = Math.max(...rows.map((row) => row.load), 1)
  return rows.map((row) => ({
    ...row,
    hasLoad: row.load > 0,
    height: `${Math.max(10, Math.min(100, Math.round((row.load / maxLoad) * 100)))}%`,
    tooltip: `${row.key}（周${row.label}）：训练负荷 ${Math.round(row.load)}`,
  }))
})

const selectedWeekRangeLabel = computed(() => {
  const rows = weeklyLoadBars.value
  if (!rows.length) return ''
  return `${rows[0].key.slice(5).replace('-', '/')} – ${rows.at(-1).key.slice(5).replace('-', '/')}`
})

const weekSummary = computed(() => {
  const rows = weeklyLoadBars.value
  const totalLoad = rows.reduce((sum, row) => sum + row.load, 0)
  const activeDays = rows.filter((row) => row.hasLoad).length

  if (!totalLoad) {
    return {
      label: isToday.value ? '等待训练' : '无负荷记录',
      tone: 'neutral',
      load: '--',
      activeDays: '0 天',
    }
  }

  const isHeavyWeek = totalLoad >= 420
  const isConsistent = activeDays >= 4
  return {
    label: isHeavyWeek ? '负荷偏高' : isConsistent ? '节奏稳定' : '已有记录',
    tone: isHeavyWeek ? 'warning' : isConsistent ? 'good' : 'steady',
    load: Math.round(totalLoad),
    activeDays: `${activeDays} 天`,
  }
})

function metricValue(value, unit = '') {
  return value === null || value === undefined || value === '' ? '--' : `${value}${unit}`
}

function shiftSelectedDate(offset) {
  const next = new Date(selectedDate.value)
  next.setDate(next.getDate() + offset)
  const normalized = startOfDay(next)
  const maxDate = startOfDay(new Date())
  selectedDate.value = normalized > maxDate ? maxDate : normalized
}

function jumpToToday() {
  selectedDate.value = startOfDay(new Date())
}

function jumpToDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
  const [y, m, d] = dateStr.split('-').map(Number)
  const candidate = new Date(y, m - 1, d)
  const maxDate = startOfDay(new Date())
  selectedDate.value = candidate > maxDate ? maxDate : candidate
}

function openActivity(activity) {
  if (activity?.id) router.push(`/activities/${activity.id}`)
}

function buildWeekRows(anchorDate) {
  const anchor = startOfDay(anchorDate || new Date())
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))

  const loadsByDate = new Map()
  for (const row of mergedLoadRows.value) {
    const key = normalizeDateKey(row.date)
    if (!key) continue
    const load = Number(row.dailyTrainingLoad ?? row.daily_training_load ?? 0)
    loadsByDate.set(key, Math.max(loadsByDate.get(key) || 0, Number.isFinite(load) ? load : 0))
  }

  const activeKey = formatDateKey(anchor)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = formatDateKey(date)
    return {
      key,
      label: ['一', '二', '三', '四', '五', '六', '日'][index],
      load: loadsByDate.get(key) || 0,
      isSelected: key === activeKey,
    }
  })
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeDateKey(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : formatDateKey(date)
}

async function loadActivitiesForDate(dateKey) {
  if (!dateKey || Object.hasOwn(dayActivitiesCache, dateKey)) return
  const reqId = ++dayFetchVersion
  dayActivitiesLoading.value = true
  try {
    const page = await getActivityPage({
      start_date: dateKey,
      end_date: dateKey,
      page_size: 10,
      sort_by: 'local_start_time',
      sort_order: 'desc',
    })
    if (reqId === dayFetchVersion) {
      dayActivitiesCache[dateKey] = page.data || []
    }
  } catch {
    if (reqId === dayFetchVersion) {
      dayActivitiesCache[dateKey] = []
    }
  } finally {
    if (reqId === dayFetchVersion) {
      dayActivitiesLoading.value = false
    }
  }
}

watch(selectedDateKey, (newKey) => {
  if (coreLoaded.value) {
    loadActivitiesForDate(newKey)
  }
})

async function fetchCityLiveWeather(version) {
  const city = latestWeatherActivity.value?.location_name || '无锡'
  try {
    const data = await getLiveWeather(city)
    if (version === loadVersion && data?.ok) {
      liveWeather.value = data
    }
  } catch {
    // Keep non-blocking fallback silently
  }
}

async function fetchExtendedLoadHistory(version) {
  try {
    const rows = await getLoadBalance({ range: '1y' })
    if (version === loadVersion && Array.isArray(rows)) {
      extendedLoadRows.value = rows
    }
  } catch {
    // Keep overview trainingLoad fallback
  }
}

async function loadToday() {
  const version = ++loadVersion
  loading.value = true
  errors.value = []
  const briefRequest = getDailyBrief().then(result => {
    if (version !== loadVersion) return
    brief.value = result.data || null
  }).catch(() => {
    if (version !== loadVersion) return
    brief.value = null
  })
  const results = await Promise.allSettled([
    getDashboardOverview({ view: 'today' }),
    getTodayHealth(),
    getPerformanceProfile(),
  ])
  if (version !== loadVersion) return
  coreLoaded.value = results.some(result => result.status === 'fulfilled')

  if (results[0].status === 'fulfilled') overview.value = results[0].value
  else {
    overview.value = { recentActivities: [], monthlySummary: {}, yearlySummary: {}, trainingLoad: [] }
    errors.value.push('运动概览加载失败')
  }
  if (results[1].status === 'fulfilled') health.value = results[1].value
  else {
    health.value = {}
    errors.value.push('身体状态加载失败')
  }
  if (results[2].status === 'fulfilled') {
    performanceProfile.value = results[2].value
  } else {
    performanceProfile.value = null
  }
  loading.value = false
  loadActivitiesForDate(selectedDateKey.value)
  fetchCityLiveWeather(version)
  fetchExtendedLoadHistory(version)
  await briefRequest
}

onMounted(loadToday)
</script>

<style scoped>
.today-home {
  gap: 12px;
}

.today-cockpit {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 22px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.today-cockpit__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.today-date-nav {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.today-date-nav button {
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.today-date-nav button:hover:not(:disabled) {
  background: var(--bg);
}

.today-date-nav button:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.today-date-nav strong {
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.today-back-pill {
  height: 28px;
  min-height: 28px;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green-strong);
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
}

.today-weather-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.today-weather-pill__icon {
  color: #f59e0b;
}

.today-weather-pill__loc {
  color: var(--muted);
  font-weight: 520;
}

.today-weather-pill strong {
  font-weight: 700;
}

.today-weather-pill__cond {
  color: var(--muted);
}

.today-weather-card {
  display: block;
}

.today-weather-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 11px;
  border-radius: 12px;
  background: var(--bg);
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.today-weather-strip__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 620;
  background: var(--green-tint);
  color: var(--green-strong);
}

.today-weather-strip__badge.warning {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.today-weather-strip__badge.danger {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.today-weather-strip__badge.neutral {
  background: var(--panel);
  color: var(--muted);
}

.today-day-activity {
  display: grid;
  gap: 8px;
  padding-top: 10px;
  border-top: 0.5px solid var(--border);
}

.today-day-loading {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
}

.today-no-activity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  color: var(--muted);
  font-size: 13px;
}

.today-no-activity-row__left {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.today-no-activity-row__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.today-jump-chip {
  height: 25px;
  min-height: 25px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--bg);
  color: var(--text);
  font-size: 11.5px;
  font-weight: 580;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.today-no-activity-row__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--green-strong);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.training-index-panel {
  display: grid;
  gap: 10px;
  padding: 15px 16px;
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.rq-overview-panel__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.training-index-head {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.training-index-title {
  margin: 0;
  font-size: 15.5px;
  font-weight: 650;
  color: var(--text);
}

.training-index-date {
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.training-index-score-num {
  font-size: 28px;
  line-height: 1;
  font-weight: 720;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.training-index-advice {
  margin: -2px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted);
}

.training-index-gauge {
  display: grid;
  gap: 6px;
}

.performance-gradient-track {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: linear-gradient(90deg, #60a5fa 0%, #34d399 52%, #f59e0b 100%);
}

.score-band__marker {
  position: absolute;
  top: 50%;
  left: var(--score-position, 0%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2.5px solid var(--text);
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.performance-track-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}

.rq-overview-panel__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding-top: 8px;
  border-top: 0.5px solid var(--border);
}

.rq-overview-panel__stats span {
  display: grid;
  gap: 2px;
}

.rq-overview-panel__stats small {
  font-size: 11.5px;
  color: var(--muted);
}

.rq-overview-panel__stats b {
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.microcycle-panel {
  display: grid;
  gap: 10px;
  padding: 15px 16px;
  border-radius: 20px;
  border-top: 4px solid var(--app-green);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.microcycle-panel .section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.microcycle-heading {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.microcycle-panel h2 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 650;
  color: var(--text);
}

.microcycle-range {
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.microcycle-summary {
  display: flex;
  gap: 24px;
}

.microcycle-summary span {
  display: grid;
  gap: 2px;
}

.microcycle-summary small {
  font-size: 11.5px;
  color: var(--muted);
}

.microcycle-summary b {
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.microcycle-bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
  height: 76px;
  padding-top: 6px;
}

.microcycle-bars > span {
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: end;
  justify-items: center;
  gap: 6px;
  height: 100%;
  cursor: pointer;
}

.microcycle-bars i {
  display: block;
  width: 100%;
  max-width: 24px;
  height: var(--bar-height);
  min-height: 6px;
  border-radius: 6px;
  background: var(--bg);
}

.microcycle-bars > span.active i {
  background: color-mix(in srgb, var(--app-green) 72%, var(--panel));
}

.microcycle-bars > span.today i {
  background: var(--app-green);
}

.microcycle-bars small {
  font-size: 11px;
  color: var(--muted);
}

.today-action-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.today-action-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
}

.today-action-pill__arrow {
  margin-left: auto;
  color: var(--muted);
}

.today-apk-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 540;
  text-decoration: none;
}

.today-apk-entry:hover {
  color: var(--text);
}
</style>
