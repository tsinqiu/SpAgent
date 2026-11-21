<template>
  <article
    class="activity-card rq-activity-card"
    :class="sportClass"
    :style="{ '--sport-color': sportColor }"
    role="button"
    tabindex="0"
    @click="$emit('select', activity)"
    @keydown.enter.self="$emit('select', activity)"
    @keydown.space.self.prevent="$emit('select', activity)"
  >
    <header class="ac-head">
      <span class="ac-icon" aria-hidden="true">
        <ProtectedPhoto v-if="activity.photo_path && activity.id" kind="activity" :id="activity.id" :path="activity.photo_path" class="activity-thumb" lazy>
          <component :is="sportIcon" :size="19" />
        </ProtectedPhoto>
        <component :is="sportIcon" v-else :size="19" />
      </span>
      <div class="ac-title-wrap">
        <strong class="ac-title">{{ displayTitle }}</strong>
        <time class="ac-time">{{ formattedCardTime }}</time>
      </div>
      <span class="ac-type-tag">{{ activity.activity_type }}</span>
    </header>

    <div class="ac-hero-metrics">
      <div v-for="metric in primaryMetrics" :key="metric.label" class="ac-metric">
        <small>{{ metric.label }}</small>
        <b>{{ metric.value }}</b>
      </div>
    </div>

    <footer v-if="secondaryMetaText || $slots.actions" class="ac-footer">
      <span v-if="secondaryMetaText" class="ac-meta-line">{{ secondaryMetaText }}</span>
      <div v-if="$slots.actions" class="activity-card-actions">
        <slot name="actions" />
      </div>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { Bike, Dumbbell, Footprints, Waves } from '@lucide/vue'

import {
  formatCalories,
  formatClockDuration,
  formatDateTime,
  formatDistance,
  formatPace,
  formatSpeed,
} from '@/utils/formatters'
import ProtectedPhoto from '@/components/ProtectedPhoto.vue'

const props = defineProps({
  activity: {
    type: Object,
    required: true,
  },
})

defineEmits(['select'])

const sportClass = computed(() => {
  if (props.activity.raw_activity_type?.includes('cycling') || props.activity.activity_type === '骑行') return 'ride'
  if (props.activity.raw_activity_type?.includes('swim') || props.activity.activity_type === '游泳') return 'swim'
  if (props.activity.raw_activity_type === 'strength_training' || props.activity.activity_type === '力量训练') return 'strength'
  return 'run'
})

const sportColor = computed(() => ({
  run: '#0fa968',
  ride: '#f59e0b',
  swim: '#007aff',
  strength: '#7c3aed',
}[sportClass.value] || '#6e6e73'))

const sportIcon = computed(() => ({
  run: Footprints,
  ride: Bike,
  swim: Waves,
  strength: Dumbbell,
}[sportClass.value] || Footprints))

const displayTitle = computed(() => (
  props.activity.activity_name || props.activity.location_name || props.activity.activity_type
))
const formattedCardTime = computed(() => formatCardDateTime(props.activity.local_start_time))

const speedLabel = computed(() => (sportClass.value === 'ride' ? '速度' : '配速'))
const speedValue = computed(() => (sportClass.value === 'ride'
  ? formatSpeed(props.activity.avg_speed_mps)
  : formatPace(props.activity.avg_speed_mps)))

const hasMeasuredDistance = computed(() => Number(props.activity.total_distance_m) > 0)

const primaryMetrics = computed(() => {
  if (!hasMeasuredDistance.value || sportClass.value === 'strength') {
    const hr = props.activity.avg_heart_rate_bpm
    const load = props.activity.activity_training_load
    return [
      { label: '时长', value: formatClockDuration(props.activity.total_timer_time_s) },
      { label: '均心率', value: hr && Number(hr) > 0 ? `${Math.round(Number(hr))} bpm` : '--' },
      {
        label: load != null && load !== '' && Number.isFinite(Number(load)) ? '负荷' : '热量',
        value: load != null && load !== '' && Number.isFinite(Number(load))
          ? `${Math.round(Number(load))}`
          : formatCalories(props.activity.total_calories),
      },
    ]
  }
  return [
    { label: '距离', value: formatDistance(props.activity.total_distance_m) },
    { label: '时长', value: formatClockDuration(props.activity.total_timer_time_s) },
    { label: speedLabel.value, value: speedValue.value },
  ]
})

const secondaryMetaText = computed(() => {
  const parts = []
  const showDistanceMode = hasMeasuredDistance.value && sportClass.value !== 'strength'
  if (showDistanceMode) {
    const load = props.activity.activity_training_load
    if (load !== null && load !== undefined && load !== '' && Number.isFinite(Number(load))) {
      parts.push(`负荷 ${Math.round(Number(load))}`)
    }
    const hr = props.activity.avg_heart_rate_bpm
    if (hr !== null && hr !== undefined && Number(hr) > 0) {
      parts.push(`均心率 ${Math.round(Number(hr))}`)
    }
  }
  const kcal = formatCalories(props.activity.total_calories)
  if (kcal && kcal !== '--') parts.push(kcal)
  const cond = props.activity.weather_condition
  const temp = props.activity.temperature_c
  if (cond || temp != null) {
    parts.push(temp == null ? cond : `${cond || ''} ${Math.round(Number(temp))}°C`.trim())
  }
  return parts.join(' · ')
})

function formatCardDateTime(value) {
  if (!value) return '--'
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return formatDateTime(value)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  const dateText = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  const timeText = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${dateText} ${week} ${timeText}`
}
</script>

<style scoped>
.ac-head {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
}

.ac-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--sport-color) 11%, var(--panel-soft));
  color: var(--sport-color);
  overflow: hidden;
}

.activity-thumb {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  object-fit: cover;
}

.ac-title-wrap {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ac-title {
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-time {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ac-type-tag {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
}

.ac-hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 2px 2px;
}

.ac-metric {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.ac-metric small {
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 450;
}

.ac-metric b {
  color: var(--text);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ac-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 0.5px solid var(--border);
}

.ac-meta-line {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}
</style>
