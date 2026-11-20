<template>
  <section class="panel weekly-trend" aria-labelledby="weekly-trend-title">
    <header>
      <h2 id="weekly-trend-title">训练执行趋势</h2>
      <p>{{ weeks[0].startDate }} 至 {{ weeks.at(-1).endDate }} · 选择周次查看明细</p>
    </header>
    <div class="trend-toggle" role="group" aria-label="趋势指标">
      <button
        v-for="metric in metrics"
        :key="metric.value"
        type="button"
        :aria-pressed="modelValue === metric.value"
        @click="$emit('update:modelValue', metric.value)"
      >{{ metric.label }}</button>
    </div>
    <ol class="trend-weeks">
      <li v-for="week in weeks" :key="week.startDate">
        <button
          class="trend-week"
          type="button"
          :aria-current="week.startDate === selectedWeek ? 'date' : undefined"
          @click="$emit('select-week', week.startDate)"
        >
          <span class="trend-week-label">
            <time :datetime="week.startDate">{{ week.startDate.slice(5) }}</time>
            <small v-if="week.isPartial">截至今日</small>
          </span>
          <span class="trend-week-data">
            <template v-if="modelValue === 'duration'">
              <strong>{{ durationLabel(week.actual) }}</strong>
              <span class="trend-track" aria-hidden="true">
                <span class="trend-column" :style="{ width: width(week.actual.durationS) }">
                  <span class="trend-filled"></span>
                </span>
              </span>
              <small v-if="week.actual.durationSamples > 0 && week.actual.durationSamples < week.actual.activityCount">
                {{ week.actual.durationSamples }}/{{ week.actual.activityCount }} 条有时长
              </small>
              <small v-if="week.actual.demoActivities">含 {{ week.actual.demoActivities }} 条演示记录</small>
            </template>
            <template v-else>
              <strong v-if="due(week.execution)">完成 {{ week.execution.completed }} / 到期 {{ due(week.execution) }} 项</strong>
              <strong v-else>{{ week.execution.upcoming ? '暂无到期任务' : '暂无计划任务' }}</strong>
              <span class="trend-track" aria-hidden="true">
                <span class="trend-column" :style="{ width: width(due(week.execution)) }">
                  <span class="trend-filled" :style="{ width: completionWidth(week.execution) }"></span>
                </span>
              </span>
              <small v-if="taskNotes(week.execution)">{{ taskNotes(week.execution) }}</small>
            </template>
          </span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
      </li>
    </ol>
    <p v-if="modelValue === 'execution' && weeks.some(week => week.execution.archivedResults)">
      归档计划仅统计已完成或已跳过的记录。
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { formatDurationZh } from '@/utils/formatters'

const props = defineProps({
  weeks: { type: Array, required: true },
  selectedWeek: { type: String, required: true },
  modelValue: { type: String, required: true },
})
defineEmits(['update:modelValue', 'select-week'])

const metrics = [
  { label: '运动时长', value: 'duration' },
  { label: '任务完成', value: 'execution' },
]
const maxValue = computed(() => Math.max(1, ...props.weeks.map(week => (
  props.modelValue === 'duration' ? (week.actual.durationS ?? 0) : due(week.execution)
))))

function due(execution) {
  return execution.completed + execution.skipped + execution.overdue
}

function durationLabel(actual) {
  if (!actual.activityCount) return '暂无运动记录'
  return actual.durationS == null ? '缺少运动时长' : formatDurationZh(actual.durationS)
}

function width(value) {
  return `${(value ?? 0) / maxValue.value * 100}%`
}

function completionWidth(execution) {
  const total = due(execution)
  return total ? `${execution.completed / total * 100}%` : '0%'
}

function taskNotes(execution) {
  return [
    execution.skipped ? `跳过 ${execution.skipped}` : '',
    execution.overdue ? `逾期 ${execution.overdue}` : '',
    execution.upcoming ? `未到期 ${execution.upcoming}` : '',
  ].filter(Boolean).join(' · ')
}
</script>

<style scoped>
.weekly-trend {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
}

h2 { margin: 0; font-size: 18px; }
p { margin: 4px 0 0; color: var(--muted); font-size: 13px; text-wrap: pretty; }

.trend-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius);
  background: var(--panel-soft);
}

.trend-toggle button {
  min-height: 44px;
  border: 0;
  border-radius: calc(var(--radius) - 4px);
  background: transparent;
  color: var(--text);
}

.trend-toggle button[aria-pressed="true"] {
  background: var(--panel);
  color: var(--green-strong);
  font-weight: 750;
}

.trend-weeks { list-style: none; margin: 0; padding: 0; }
.trend-week {
  display: grid;
  align-items: center;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 10px;
  width: 100%;
  min-height: 60px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--text);
  background: transparent;
  text-align: start;
}

.trend-week:hover,
.trend-week[aria-current="date"] {
  border-color: var(--border);
  background: var(--panel-soft);
}

.trend-week-label,
.trend-week-data { display: grid; gap: 4px; min-width: 0; }
.trend-week-label time,
.trend-week-data strong { font-weight: 750; font-variant-numeric: tabular-nums; }
.trend-week-data strong { font-size: 14px; overflow-wrap: anywhere; }
.trend-week small { font-size: 12px; color: var(--muted); }

.trend-track,
.trend-column,
.trend-filled { display: block; height: 8px; border-radius: 999px; }
.trend-track { background: color-mix(in srgb, var(--muted) 10%, transparent); }
.trend-column { overflow: hidden; background: color-mix(in srgb, var(--muted) 30%, transparent); }
.trend-filled { background: var(--app-green); }
</style>
