<template>
  <section class="panel chart-panel">
    <div class="panel-heading">
      <div>
        <p class="overline">{{ eyebrow }}</p>
        <h2>{{ title }}</h2>
      </div>
      <slot name="action" />
    </div>
    <div class="chart-canvas-wrap" :aria-busy="loading">
      <div ref="chartRef" class="chart-canvas" role="img" :aria-label="title"></div>
      <p v-if="loading" role="status">正在准备图表…</p>
      <button v-else-if="failed" type="button" @click="initialize">图表加载失败，重试</button>
    </div>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  eyebrow: {
    type: String,
    default: '图表',
  },
  option: {
    type: Object,
    required: true,
  },
})

const chartRef = ref(null)
const chart = shallowRef(null)
const loading = ref(true)
const failed = ref(false)
let active = false
let resizeObserver

function renderChart() { chart.value?.setOption(props.option, true) }

function resizeChart() {
  chart.value?.resize()
}

async function initialize() {
  loading.value = true
  failed.value = false
  try {
    const { init } = await import('@/utils/chartEngine')
    if (!active) return
    chart.value = init(chartRef.value)
    renderChart()
  } catch {
    chart.value?.dispose()
    chart.value = null
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  active = true
  resizeObserver = new ResizeObserver(resizeChart)
  resizeObserver.observe(chartRef.value)
  window.addEventListener('resize', resizeChart)
  void initialize()
})

watch(() => props.option, renderChart, { deep: true })

onBeforeUnmount(() => {
  active = false
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resizeChart)
  chart.value?.dispose()
})
</script>

<style scoped>
.chart-canvas-wrap { position: relative; min-width: 0; }
.chart-canvas-wrap > :is(p, button) {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  color: var(--muted);
  white-space: nowrap;
}
.chart-canvas-wrap > button {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
}
</style>
