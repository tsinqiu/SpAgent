<template>
  <ul class="revision-changes">
    <li v-for="(change, index) in changes" :key="index">
      <template v-if="change.kind === 'metadata'">
        <strong>计划资料</strong>
        <small>改前　{{ metadata(change.before) }}</small>
        <small>改后　{{ metadata(change.after) }}</small>
      </template>
      <template v-else>
        <strong>{{ change.after?.title || change.before?.title }}</strong>
        <small>改前　{{ session(change.before) }}</small>
        <small>改后　{{ session(change.after) }}</small>
      </template>
    </li>
  </ul>
</template>

<script setup>
import { formatDistance, formatDuration } from '@/utils/formatters'

defineProps({ changes: { type: Array, required: true } })

function session(value) {
  if (!value) return '无此任务'
  return [
    value.date, value.title,
    value.distanceM == null ? null : formatDistance(value.distanceM),
    value.durationS == null ? null : formatDuration(value.durationS),
    value.subtitle,
  ].filter(Boolean).join(' · ')
}

function metadata(value) {
  return [value.name, value.goal, value.phases?.join(' / ')].filter(Boolean).join(' · ')
}
</script>

<style scoped>
.revision-changes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { display: grid; gap: 4px; padding: 8px; border-radius: 8px; background: var(--panel-soft); }
strong { font-size: 13px; }
small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
</style>
