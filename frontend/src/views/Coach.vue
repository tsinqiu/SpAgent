<template>
  <CoachPlanAgent :initial-draft="initialDraft" />
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import CoachPlanAgent from '@/components/CoachPlanAgent.vue'

const route = useRoute()
const initialDraft = computed(() => {
  const { weeklyReview, prompt } = route.query
  if (typeof weeklyReview === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weeklyReview)) {
    return `预览 ${weeklyReview} 周报的下周训练调整`
  }
  return typeof prompt === 'string' ? prompt.slice(0, 1000) : ''
})
</script>
