<template>
  <section class="plan-draft" aria-label="四周计划草案">
    <header class="plan-draft__head">
      <div>
        <h3>{{ plan.name }}</h3>
        <p>{{ plan.startDate }} 开始 · {{ plan.weeks.length }} 周</p>
      </div>
      <span class="status-chip" :class="{ good: status === 'applied' }">{{ labels[status] }}</span>
    </header>
    <details v-for="(week, index) in plan.weeks" :key="index" class="plan-draft__week" :open="index === 0">
      <summary>第 {{ index + 1 }} 周 · {{ week.phase }} · {{ workouts(week).length }} 次训练</summary>
      <ul>
        <li v-for="session in workouts(week)" :key="session.date">
          <time :datetime="session.date">{{ session.date.slice(5) }}</time>
          <div>
            <strong>{{ session.title }} · {{ session.durationS / 60 }} 分钟</strong>
            <small>{{ session.subtitle }}</small>
          </div>
        </li>
      </ul>
    </details>
    <div v-if="status === 'proposed'" class="plan-draft__actions">
      <button type="button" :disabled="busy" @click="$emit('decide', 'reject')">拒绝草案</button>
      <button type="button" :disabled="busy" @click="$emit('decide', 'confirm')">
        {{ busy ? '处理中…' : action.saveStatus === 'active' ? '确认并启用' : '确认保存草稿' }}
      </button>
    </div>
    <p v-if="status === 'proposed'" class="plan-draft__note">{{ expiryTime }} 过期</p>
    <RouterLink v-if="status === 'applied'" class="plan-draft__link" :to="{ name: 'training-plans', query: { planId: action.planId } }">
      查看已保存计划
    </RouterLink>
    <p v-else-if="status === 'failed'" class="plan-draft__note">
      {{ action.failureCode === 'ACTIVE_TRAINING_PLAN_EXISTS' ? '已出现另一个执行中计划，请重新生成草案。' : '草案的开始日期已过，请重新生成。' }}
    </p>
    <p v-else-if="status === 'expired'" class="plan-draft__note">可再发一次目标，生成新草案。</p>
    <p v-if="error" class="plan-draft__note" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  plan: { type: Object, required: true },
  action: { type: Object, required: true },
  now: { type: Number, required: true },
  busy: Boolean,
  error: { type: String, default: '' },
})
defineEmits(['decide'])

const labels = {
  proposed: '待确认', applied: '已保存', rejected: '已拒绝', expired: '已过期', failed: '保存失败',
}
const status = computed(() => (
  props.action.status === 'proposed' && Date.parse(props.action.expiresAt) <= props.now
    ? 'expired' : props.action.status
))
const expiryTime = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
}).format(new Date(props.action.expiresAt)))
const workouts = week => week.days.filter(day => day.title)
</script>

<style scoped>
.plan-draft {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel);
  text-wrap: pretty;
}

.plan-draft__head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 8px;
}

.plan-draft__head h3 { margin: 0; font-size: 16px; }
.plan-draft__head p,
.plan-draft__note { margin: 4px 0 0; color: var(--muted); font-size: 12px; }

.plan-draft__week {
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--panel-soft);
  font-size: 13px;
}

.plan-draft__week summary { cursor: pointer; font-weight: 700; }
.plan-draft__week ul { margin: 6px 0 0; padding: 0; list-style: none; }
.plan-draft__week li { display: flex; gap: 9px; padding: 5px 0; }
.plan-draft__week time,
.plan-draft__week small { color: var(--muted); }
.plan-draft__week small { display: block; }

.plan-draft__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.plan-draft__actions button,
.plan-draft__link {
  display: grid;
  min-height: 44px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  background: var(--panel);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}
.plan-draft__actions button:last-child,
.plan-draft__link { background: #078452; color: white; border-color: #078452; }
.plan-draft__actions button:disabled { opacity: 0.6; }
</style>
