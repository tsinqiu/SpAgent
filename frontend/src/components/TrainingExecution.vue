<template>
  <section class="execution-review" aria-label="计划与实际复盘">
    <h3>计划与实际</h3>
    <small>{{ result.planned.date }} 计划 · {{ result.actual.date }} 实际</small>
    <table>
      <thead><tr><th scope="col">指标</th><th scope="col">计划</th><th scope="col">实际</th><th scope="col">差值</th></tr></thead>
      <tbody>
        <tr v-for="metric in metrics" :key="metric.key">
          <th scope="row">{{ metric.label }}</th>
          <td>{{ metric.format(result.planned[metric.key]) }}</td>
          <td>{{ metric.format(result.actual[metric.key]) }}</td>
          <td>{{ deltaText(metric, result.delta[metric.key]) }}</td>
        </tr>
      </tbody>
    </table>
    <p>{{ result.review }}</p>
    <small v-if="result.actual.source === 'demo_synthetic'">合成演示数据 · {{ method }}</small>
    <small v-else>{{ method }}</small>
    <RouterLink v-if="result.activityId && showActivity" :to="{ name: 'activity-detail', params: { id: result.activityId } }">查看运动详情</RouterLink>
    <small v-if="!result.activityId">运动原记录已删除，保留关联时的测量值。</small>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { formatDistance, formatDuration, formatPaceSeconds } from '@/utils/formatters'

const props = defineProps({ result: { type: Object, required: true }, showActivity: Boolean })
const metrics = [
  { key: 'distanceM', label: '距离', format: formatDistance },
  { key: 'durationS', label: '时长', format: formatDuration },
  { key: 'paceS', label: '配速', format: formatPaceSeconds },
]
const method = computed(() => props.result.method === 'automatic' ? '自动匹配' : '手动关联')

function deltaText(metric, value) {
  if (value == null) return '—'
  if (value === 0) return '0'
  const absolute = Math.abs(value)
  const formatted = metric.key === 'paceS' ? `${Math.round(absolute)} 秒/公里` : metric.format(absolute)
  return `${value > 0 ? '+' : '−'}${formatted}`
}
</script>

<style scoped>
.execution-review { display: grid; gap: 8px; min-width: 0; padding: 10px; background: var(--panel-soft); border: 1px solid var(--border); border-radius: 12px; }
h3, p { margin: 0; }
h3 { font-size: 15px; }
p, small, table { font-size: 12px; }
small { color: var(--muted); }
table { width: 100%; border-collapse: collapse; text-align: start; }
th, td { padding: 5px 3px; text-align: start; border-bottom: 1px solid var(--border); }
a { color: var(--green-strong); min-height: 38px; display: flex; align-items: center; }
</style>
