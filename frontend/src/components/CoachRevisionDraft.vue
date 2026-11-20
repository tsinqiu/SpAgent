<template>
  <section class="revision-draft" aria-label="计划调整草案">
    <header>
      <h3>{{ revision.planName }}</h3>
      <span class="status-chip" :class="{ good: status === 'applied' }">{{ labels[status] }}</span>
    </header>
    <p>{{ revision.reason }}</p>
    <RevisionChanges :changes="[{ kind: 'session', before: revision.before, after: revision.after }]" />
    <div v-if="status === 'proposed'" class="revision-draft__actions">
      <button type="button" :disabled="busy" @click="$emit('decide', 'reject')">拒绝调整</button>
      <button type="button" :disabled="busy" @click="$emit('decide', 'confirm')">{{ busy ? '处理中…' : '确认调整' }}</button>
    </div>
    <RouterLink v-else-if="status === 'applied'" :to="{ name: 'training-plans', query: { planId: action.planId } }">
      查看更新后的计划与修订历史
    </RouterLink>
    <p v-else-if="status === 'failed'">
      {{ action.failureCode === 'TRAINING_PLAN_VERSION_CONFLICT' ? '计划已有更新，请重新描述要调整的安排。' : '任务或目标日期已变化，请重新生成调整方案。' }}
    </p>
    <p v-else-if="status === 'expired'">重新请求调整可生成新草案。</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import RevisionChanges from '@/components/RevisionChanges.vue'

const props = defineProps({
  revision: { type: Object, required: true }, action: { type: Object, required: true },
  now: { type: Number, required: true }, busy: Boolean, error: String,
})
defineEmits(['decide'])

const labels = { proposed: '待确认', applied: '已调整', rejected: '已拒绝', expired: '已过期', failed: '调整失败' }
const status = computed(() => props.action.status === 'proposed' && Date.parse(props.action.expiresAt) <= props.now
  ? 'expired' : props.action.status)
</script>

<style scoped>
.revision-draft { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); }
header { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
h3, p { margin: 0; }
h3 { font-size: 16px; }
p { font-size: 13px; }
.revision-draft__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
button, a { display: grid; place-items: center; min-height: 44px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--text); font: inherit; font-size: 13px; }
button:last-child, a { background: #078452; color: white; border-color: #078452; }
button:disabled { opacity: .55; }
</style>
