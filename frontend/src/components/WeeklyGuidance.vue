<template>
  <section class="panel weekly-guidance" aria-labelledby="weekly-guidance-title">
    <header>
      <h2 id="weekly-guidance-title">下周训练建议</h2>
      <p v-if="guidance">{{ guidance.nextWeekStart }} 至 {{ guidance.nextWeekEnd }}</p>
    </header>
    <StateBlock v-if="loading" title="正在汇总训练依据" message="正在读取计划执行、跑量和恢复数据。" />
    <StateBlock v-else-if="error" title="暂时无法读取建议" :message="error" tone="danger" action-label="重试" @action="load" />
    <template v-else-if="guidance">
      <strong class="weekly-guidance-summary">{{ guidance.summary }}</strong>
      <ul class="weekly-guidance-reasons">
        <li v-for="reason in guidance.reasons" :key="reason">{{ reason }}</li>
      </ul>
      <details class="weekly-guidance-basis">
        <summary>
          <span>训练依据</span>
          <ChevronDown :size="15" class="weekly-guidance-chevron" aria-hidden="true" />
        </summary>
        <p v-if="guidance.execution">
          本周已计入 {{ guidance.execution.due }} 项任务，完成 {{ guidance.execution.completed }} 项、
          跳过 {{ guidance.execution.skipped }} 项、逾期待完成 {{ guidance.execution.outstanding }} 项。
        </p>
        <ul>
          <li v-for="window in guidance.windows" :key="window.days">
            近 {{ window.days }} 天 · {{ window.runs }} 次跑步
            <template v-if="window.durationS != null"> · {{ Math.round(window.durationS / 60) }} 分钟</template>
            <template v-if="window.distanceM != null"> · {{ formatDistance(window.distanceM) }}</template>
            <template v-if="window.demoRuns"> · 含 {{ window.demoRuns }} 条演示记录</template>
          </li>
        </ul>
        <p>
          近 7 天 · 睡眠评分 {{ recoveryValue(guidance.recovery.sleepScore) }} ·
          日均睡眠 {{ recoveryValue(guidance.recovery.sleepDurationS, true) }} ·
          HRV {{ guidance.recovery.hrvSamples }} 条
        </p>
        <p>本地规则 {{ guidance.ruleVersion }} · 数据截至 {{ guidance.asOf }}</p>
      </details>
      <RouterLink
        v-if="guidance.previewAvailable"
        class="primary-link weekly-guidance-action"
        :to="{ name: 'coach', query: { from: 'weekly-report', weeklyReview: guidance.weekStart } }"
      >去教练预览调整</RouterLink>
    </template>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import StateBlock from '@/components/StateBlock.vue'
import { getWeeklyGuidance } from '@/services/trainingPlans'
import { formatDistance } from '@/utils/formatters'

const props = defineProps({ weekStart: { type: String, required: true } })
const guidance = ref(null)
const loading = ref(true)
const error = ref('')

function recoveryValue(metric, hours = false) {
  if (metric.average == null) return '暂无记录'
  const value = hours ? `${(metric.average / 3600).toFixed(1)} 小时` : metric.average
  return `${value}（${metric.samples} 条）`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await getWeeklyGuidance()
    if (data.weekStart === props.weekStart) guidance.value = data
    else error.value = '已进入新的一周，请刷新周报。'
  } catch {
    error.value = '请稍后重试。'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.weekly-guidance {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
}

h2 { margin: 0; font-size: 18px; }
p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.weekly-guidance-summary { color: var(--green-strong); text-wrap: pretty; }
.weekly-guidance-reasons,
.weekly-guidance-basis ul { margin: 0; padding-inline-start: 1.2em; font-size: 13px; }
.weekly-guidance-basis { border-top: 0.5px solid var(--border); }
.weekly-guidance-basis summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 560;
  color: var(--text);
  list-style: none;
}
.weekly-guidance-basis summary::-webkit-details-marker { display: none; }
.weekly-guidance-chevron { color: var(--muted); transition: transform 160ms ease; }
.weekly-guidance-basis[open] .weekly-guidance-chevron { transform: rotate(180deg); }
.weekly-guidance-basis ul { margin-block: 6px; }
.weekly-guidance-action { justify-self: start; min-height: 44px; }
</style>
