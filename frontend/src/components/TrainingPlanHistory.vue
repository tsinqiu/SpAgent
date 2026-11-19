<template>
  <details class="training-history" @toggle="toggle">
    <summary>修订历史</summary>
    <p v-if="loading" role="status">正在读取修订历史…</p>
    <p v-else-if="error" role="alert">{{ error }} <button type="button" @click="load()">重试</button></p>
    <p v-else-if="!revisions.length">暂无计划修订。</p>
    <article v-for="row in revisions" :key="row.id">
      <h3>版本 {{ row.fromVersion }} → {{ row.toVersion }}</h3>
      <small>{{ row.createdAt }}</small>
      <p>{{ row.reason }}</p>
      <RevisionChanges :changes="row.changes" />
    </article>
    <button v-if="next" type="button" :disabled="loading" @click="load(next)">更早记录</button>
  </details>
</template>

<script setup>
import { ref, watch } from 'vue'
import RevisionChanges from '@/components/RevisionChanges.vue'
import { getPlanRevisions } from '@/services/trainingPlans'

const props = defineProps({ planId: { type: Number, required: true }, version: Number })
const revisions = ref([])
const next = ref(null)
const loading = ref(false)
const error = ref('')
let open = false
let generation = 0

async function load(before) {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await getPlanRevisions(props.planId, before)
    if (generation !== current) return
    revisions.value = before ? [...revisions.value, ...result.revisions] : result.revisions
    next.value = result.nextBefore
  } catch {
    if (generation === current) error.value = '暂时无法读取修订记录。'
  } finally { if (generation === current) loading.value = false }
}

function toggle(event) {
  open = event.target.open
  if (open) load()
}

watch(() => props.version, () => { if (open) load() })
</script>

<style scoped>
.training-history { border: 1px solid var(--border); border-radius: 14px; padding: 12px; background: var(--panel); font-size: 14px; }
summary { cursor: pointer; font-weight: 800; min-height: 36px; }
article { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
h3, p { margin: 5px 0; font-size: 14px; }
small { color: var(--muted); }
button { min-height: 38px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--text); }
</style>
