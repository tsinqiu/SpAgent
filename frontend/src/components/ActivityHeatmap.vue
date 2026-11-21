<template>
  <section class="heatmap-card" aria-label="运动贡献热力图">
    <header class="heatmap-card__head">
      <div class="heatmap-card__title-wrap">
        <div class="heatmap-card__title-row">
          <h2>运动热力图</h2>
          <span v-if="!loading && summary.activeDays != null" class="heatmap-card__badge">
            {{ summary.activeDays }} 天活跃
          </span>
        </div>
        <p class="heatmap-card__subtitle">
          <template v-if="loading">正在汇总运动日历…</template>
          <template v-else-if="error">{{ error }}</template>
          <template v-else>
            {{ activeRangeLabel }}累计 <strong>{{ metricTotalDisplay }}</strong>
            <span class="heatmap-dot">·</span>
            {{ summary.totalCount || 0 }} 次
            <template v-if="summary.longestStreak > 1">
              <span class="heatmap-dot">·</span>
              最长连续 {{ summary.longestStreak }} 天
            </template>
          </template>
        </p>
      </div>

      <div class="heatmap-head-controls">
        <div class="heatmap-year-pills" role="tablist" aria-label="时间范围">
          <button
            v-for="opt in yearOptions"
            :key="opt.value"
            type="button"
            class="heatmap-year-pill"
            :class="{ active: selectedYear === opt.value }"
            :aria-selected="selectedYear === opt.value"
            @click="selectedYear = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <RouterLink
          class="heatmap-calendar-link"
          :to="{ path: '/status/calendar', query: { from: 'activities' } }"
          title="切换至按月日历视图"
        >
          月历
        </RouterLink>
      </div>
    </header>

    <div class="heatmap-metrics" role="tablist" aria-label="热力图指标">
      <button
        v-for="m in METRICS"
        :key="m.key"
        type="button"
        class="heatmap-metric-btn"
        :class="{ active: activeMetric === m.key }"
        :aria-selected="activeMetric === m.key"
        @click="activeMetric = m.key"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="heatmap-board">
      <div class="heatmap-weekdays" aria-hidden="true">
        <span>一</span>
        <span></span>
        <span>三</span>
        <span></span>
        <span>五</span>
        <span></span>
        <span>日</span>
      </div>

      <div ref="scrollerRef" class="heatmap-scroller">
        <div class="heatmap-months" :style="{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }">
          <span
            v-for="marker in monthMarkers"
            :key="marker.key"
            class="heatmap-month-label"
            :style="{ gridColumnStart: marker.weekIndex + 1 }"
          >
            {{ marker.label }}
          </span>
        </div>

        <div class="heatmap-grid" role="grid" aria-label="每日运动强度网格">
          <div v-for="(week, wi) in weeks" :key="wi" class="heatmap-col">
            <button
              v-for="cell in week"
              :key="cell.date"
              type="button"
              class="heatmap-cell"
              :class="[
                `level-${cell.level}`,
                {
                  'is-outside': cell.outside,
                  'is-selected': activeDay?.date === cell.date,
                  'is-filtered': selectedDate === cell.date,
                },
              ]"
              :disabled="cell.outside"
              :title="cell.outside ? '' : cellTooltip(cell)"
              :aria-label="cell.outside ? '' : cellTooltip(cell)"
              @click="selectCell(cell)"
            />
          </div>
        </div>
      </div>
    </div>

    <footer class="heatmap-foot">
      <div class="heatmap-detail">
        <template v-if="activeDay">
          <span class="heatmap-detail__date">{{ activeDay.date }}</span>
          <template v-if="activeDay.count > 0">
            <span class="heatmap-detail__stats">
              {{ activeDay.count }} 次
              <template v-if="activeDay.distanceKm > 0"> · {{ activeDay.distanceKm }} km</template>
              <template v-if="activeDay.durationMin > 0"> · {{ Math.round(activeDay.durationMin) }} min</template>
              <template v-if="activeDay.load > 0"> · 负荷 {{ Math.round(activeDay.load) }}</template>
              <template v-else-if="activeDay.calories > 0"> · {{ activeDay.calories }} kcal</template>
            </span>
            <button
              type="button"
              class="heatmap-filter-chip"
              :class="{ active: selectedDate === activeDay.date }"
              @click="toggleDateFilter(activeDay.date)"
            >
              {{ selectedDate === activeDay.date ? '清除筛选' : '筛选当日' }}
            </button>
          </template>
          <span v-else class="heatmap-detail__empty">当日无记录</span>
        </template>
        <span v-else class="heatmap-detail__hint">轻触色块查看当日运动并一键筛选</span>
      </div>

      <div class="heatmap-legend" aria-label="图例：从少到多">
        <span>少</span>
        <i class="heatmap-swatch level-0" />
        <i class="heatmap-swatch level-1" />
        <i class="heatmap-swatch level-2" />
        <i class="heatmap-swatch level-3" />
        <i class="heatmap-swatch level-4" />
        <span>多</span>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { getActivityHeatmap } from '@/services/stats'

const props = defineProps({
  activityType: {
    type: String,
    default: 'all',
  },
  selectedDate: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['filter-date'])

const METRICS = [
  { key: 'distanceKm', label: '跑量', unit: 'km', digits: 1 },
  { key: 'load', label: '负荷', unit: '', digits: 0 },
  { key: 'durationMin', label: '时长', unit: 'min', digits: 0 },
  { key: 'calories', label: '热量', unit: 'kcal', digits: 0 },
]

const loading = ref(false)
const error = ref('')
const selectedYear = ref('rolling')
const activeMetric = ref('distanceKm')
const scrollerRef = ref(null)
const activeDay = ref(null)

const payload = ref({
  range: { mode: 'rolling', year: null, startDate: '', endDate: '' },
  availableYears: [],
  summary: {},
  days: [],
})

const summary = computed(() => payload.value.summary || {})

const yearOptions = computed(() => {
  const opts = [{ value: 'rolling', label: '近一年' }]
  const years = (payload.value.availableYears || []).slice(0, 3)
  for (const yr of years) {
    opts.push({ value: String(yr), label: String(yr) })
  }
  return opts
})

const activeRangeLabel = computed(() => (
  selectedYear.value === 'rolling' ? '近一年' : `${selectedYear.value} 年`
))

const currentMetricDef = computed(() => (
  METRICS.find(m => m.key === activeMetric.value) || METRICS[0]
))

const metricTotalDisplay = computed(() => {
  const s = summary.value
  if (activeMetric.value === 'distanceKm') {
    const val = Number(s.totalDistanceKm || 0)
    return `${val.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} km`
  }
  if (activeMetric.value === 'load') {
    return `${Math.round(Number(s.totalLoad || 0)).toLocaleString('zh-CN')} 负荷`
  }
  if (activeMetric.value === 'durationMin') {
    const mins = Math.round(Number(s.totalDurationMin || 0))
    const hours = (mins / 60).toFixed(1)
    return mins >= 120 ? `${hours} 小时` : `${mins} 分钟`
  }
  return `${Math.round(Number(s.totalCalories || 0)).toLocaleString('zh-CN')} kcal`
})

const dayMap = computed(() => {
  const map = new Map()
  for (const d of payload.value.days || []) {
    map.set(d.date, d)
  }
  return map
})

const metricThresholds = computed(() => {
  const key = activeMetric.value
  const values = (payload.value.days || [])
    .map(d => Number(d[key] || 0))
    .filter(v => v > 0)
    .sort((a, b) => a - b)

  if (!values.length) return [1, 2, 3]
  const q = p => values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))]
  const t1 = q(0.25)
  const t2 = q(0.55)
  const t3 = q(0.82)
  return [t1, Math.max(t1, t2), Math.max(t2, t3)]
})

function computeLevel(day) {
  if (!day || !day.count) return 0
  const val = Number(day[activeMetric.value] || 0)
  // For sports without distance (e.g. strength), still show level 1 when count > 0 on distance tab
  if (val <= 0) return 1
  const [t1, t2, t3] = metricThresholds.value
  if (val <= t1) return 1
  if (val <= t2) return 2
  if (val <= t3) return 3
  return 4
}

function parseUtcDate(str) {
  return new Date(`${str}T00:00:00.000Z`)
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10)
}

const weeks = computed(() => {
  const startStr = payload.value.range?.startDate
  const endStr = payload.value.range?.endDate
  if (!startStr || !endStr) return []

  const startDate = parseUtcDate(startStr)
  const endDate = parseUtcDate(endStr)

  // Align grid start to Monday (Mon=0 ... Sun=6)
  const startDow = (startDate.getUTCDay() + 6) % 7
  const cursor = new Date(startDate)
  cursor.setUTCDate(cursor.getUTCDate() - startDow)

  // Align grid end to Sunday
  const endDow = (endDate.getUTCDay() + 6) % 7
  const lastDate = new Date(endDate)
  lastDate.setUTCDate(lastDate.getUTCDate() + (6 - endDow))

  const cols = []
  while (cursor <= lastDate) {
    const col = []
    for (let i = 0; i < 7; i += 1) {
      const iso = formatUtcDate(cursor)
      const outside = iso < startStr || iso > endStr
      const data = outside ? null : dayMap.value.get(iso)
      col.push({
        date: iso,
        outside,
        count: data?.count || 0,
        distanceKm: data?.distanceKm || 0,
        durationMin: data?.durationMin || 0,
        calories: data?.calories || 0,
        load: data?.load || 0,
        level: outside ? 0 : computeLevel(data),
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    cols.push(col)
  }
  return cols
})

const monthMarkers = computed(() => {
  const markers = []
  let lastMonth = ''
  weeks.value.forEach((col, weekIndex) => {
    const firstInRange = col.find(c => !c.outside)
    if (!firstInRange) return
    const ym = firstInRange.date.slice(0, 7)
    if (ym !== lastMonth) {
      // Avoid crowding two labels in adjacent columns
      if (!markers.length || weekIndex - markers[markers.length - 1].weekIndex >= 3) {
        const monthNum = Number.parseInt(ym.slice(5, 7), 10)
        markers.push({
          key: ym,
          weekIndex,
          label: `${monthNum}月`,
        })
        lastMonth = ym
      }
    }
  })
  return markers
})

function cellTooltip(cell) {
  if (!cell.count) return `${cell.date} · 无运动记录`
  const m = currentMetricDef.value
  const val = Number(cell[m.key] || 0)
  const formatted = m.digits > 0 ? val.toFixed(m.digits) : Math.round(val)
  return `${cell.date} · ${cell.count} 次 · ${m.label} ${formatted}${m.unit ? ` ${m.unit}` : ''}`
}

function selectCell(cell) {
  if (cell.outside) return
  activeDay.value = cell
}

function toggleDateFilter(date) {
  if (props.selectedDate === date) {
    emit('filter-date', '')
  } else {
    emit('filter-date', date)
  }
}

async function scrollToLatestActive() {
  await nextTick()
  const el = scrollerRef.value
  if (!el) return
  const latestDate = payload.value.summary?.latestActiveDate
  if (latestDate && weeks.value.length) {
    const targetCol = weeks.value.findIndex(col => col.some(cell => cell.date === latestDate))
    if (targetCol >= 0) {
      // Each week column is 11px + 3px gap = 14px; place latest active column near right third of viewport
      const colRightPx = (targetCol + 3) * 14
      el.scrollLeft = Math.max(0, colRightPx - el.clientWidth)
      return
    }
  }
  el.scrollLeft = el.scrollWidth
}

async function loadHeatmap() {
  loading.value = true
  error.value = ''
  try {
    const params = { year: selectedYear.value }
    if (props.activityType && props.activityType !== 'all') {
      params.activity_type = props.activityType
    }
    const data = await getActivityHeatmap(params)
    payload.value = data
    // Default-highlight the latest active day in view so users immediately see rich telemetry context
    const lastActive = (data.days || []).at(-1)
    if (props.selectedDate) {
      activeDay.value = dayMap.value.get(props.selectedDate) || { date: props.selectedDate, count: 0 }
    } else if (lastActive) {
      activeDay.value = lastActive
    } else {
      activeDay.value = null
    }
    await scrollToLatestActive()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '热力图加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  [() => props.activityType, selectedYear],
  () => {
    loadHeatmap()
  },
  { immediate: true },
)

watch(
  () => props.selectedDate,
  val => {
    if (val) {
      activeDay.value = dayMap.value.get(val) || { date: val, count: 0 }
    }
  },
)
</script>

<style scoped>
.heatmap-card {
  --hm-0: #ebedf0;
  --hm-1: #bdecd2;
  --hm-2: #6ad49c;
  --hm-3: #24a45a;
  --hm-4: #0b6d3e;

  display: grid;
  gap: 12px;
  padding: 15px 16px 14px;
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

:global([data-theme='dark']) .heatmap-card {
  --hm-0: rgba(255, 255, 255, 0.07);
  --hm-1: #0e4429;
  --hm-2: #006d32;
  --hm-3: #26a641;
  --hm-4: #39d353;
}

.heatmap-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.heatmap-card__title-wrap {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.heatmap-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.heatmap-card__title-row h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--text);
}

.heatmap-card__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green-strong);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.heatmap-card__subtitle {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.heatmap-card__subtitle strong {
  color: var(--text);
  font-weight: 650;
}

.heatmap-dot {
  margin: 0 4px;
  opacity: 0.6;
}

.heatmap-head-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.heatmap-calendar-link {
  display: inline-flex;
  align-items: center;
  height: 28px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--muted);
  font-size: 12px;
  font-weight: 560;
  text-decoration: none;
}

.heatmap-calendar-link:hover {
  color: var(--text);
}

.heatmap-year-pills {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: 999px;
  background: var(--bg);
}

.heatmap-year-pill {
  height: 26px;
  min-height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 560;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.heatmap-year-pill.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 650;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.heatmap-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: var(--bg);
}

.heatmap-metric-btn {
  height: 30px;
  min-height: 30px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 560;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.heatmap-metric-btn.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 650;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.heatmap-board {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
}

.heatmap-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
  padding-top: 18px;
  font-size: 10px;
  line-height: 11px;
  color: var(--muted);
  user-select: none;
}

.heatmap-scroller {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.heatmap-scroller::-webkit-scrollbar {
  display: none;
}

.heatmap-months {
  display: grid;
  gap: 3px;
  height: 16px;
  margin-bottom: 2px;
  align-items: end;
}

.heatmap-month-label {
  font-size: 10px;
  line-height: 1;
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
}

.heatmap-grid {
  display: inline-flex;
  gap: 3px;
}

.heatmap-col {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
}

.heatmap-cell {
  width: 11px;
  height: 11px;
  min-width: 11px;
  min-height: 11px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: var(--hm-0);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.heatmap-cell:hover:not(:disabled) {
  transform: scale(1.18);
}

.heatmap-cell.level-0 { background: var(--hm-0); }
.heatmap-cell.level-1 { background: var(--hm-1); }
.heatmap-cell.level-2 { background: var(--hm-2); }
.heatmap-cell.level-3 { background: var(--hm-3); }
.heatmap-cell.level-4 { background: var(--hm-4); }

.heatmap-cell.is-outside {
  background: transparent;
  cursor: default;
  pointer-events: none;
}

.heatmap-cell.is-selected {
  box-shadow: 0 0 0 1.5px var(--text);
}

.heatmap-cell.is-filtered {
  box-shadow: 0 0 0 2px var(--green-strong);
}

.heatmap-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.heatmap-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 0;
}

.heatmap-detail__date {
  color: var(--text);
  font-weight: 650;
}

.heatmap-detail__stats {
  color: var(--muted);
}

.heatmap-detail__empty,
.heatmap-detail__hint {
  color: var(--muted);
  font-size: 12px;
}

.heatmap-filter-chip {
  height: 24px;
  min-height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green-strong);
  font-size: 11.5px;
  font-weight: 620;
  cursor: pointer;
}

.heatmap-filter-chip.active {
  background: var(--text);
  color: var(--panel);
}

.heatmap-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  user-select: none;
}

.heatmap-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2.5px;
}

.heatmap-swatch.level-0 { background: var(--hm-0); }
.heatmap-swatch.level-1 { background: var(--hm-1); }
.heatmap-swatch.level-2 { background: var(--hm-2); }
.heatmap-swatch.level-3 { background: var(--hm-3); }
.heatmap-swatch.level-4 { background: var(--hm-4); }
</style>
