<template>
  <!-- 1. Single-Activity Deep IoT Telemetry Card -->
  <section v-if="card.type === 'telemetry_card'" class="vc vc--telemetry" aria-label="单次运动遥测卡片">
    <header class="vc__head">
      <div class="vc__title-wrap">
        <span class="vc__eyebrow">IoT 遥测拆解 · {{ card.date }}</span>
        <h4>{{ card.title }}</h4>
        <p v-if="card.weather" class="vc__sub">{{ card.weather }}</p>
      </div>
      <RouterLink v-if="card.activityId" class="vc__action-link" :to="'/activities/' + card.activityId">
        轨迹详情
      </RouterLink>
    </header>

    <div v-if="card.metrics?.length" class="vc__kpis">
      <div v-for="m in card.metrics" :key="m.label" class="vc__kpi">
        <span class="vc__kpi-label">{{ m.label }}</span>
        <strong class="vc__kpi-val">{{ m.value }}</strong>
      </div>
    </div>

    <!-- First Half vs Second Half + Aerobic Decoupling -->
    <div v-if="card.analytics" class="vc__split">
      <div class="vc__split-row">
        <div class="vc__half">
          <span class="vc__half-label">前半程</span>
          <strong>{{ card.analytics.firstHalfPace }}</strong>
          <small v-if="card.analytics.firstHalfHr">{{ card.analytics.firstHalfHr }} bpm</small>
        </div>
        <div class="vc__decouple" :class="decoupleTone">
          <span class="vc__decouple-label">有氧解耦</span>
          <strong>{{ card.analytics.decouplingPct }}%</strong>
        </div>
        <div class="vc__half vc__half--right">
          <span class="vc__half-label">后半程</span>
          <strong>{{ card.analytics.secondHalfPace }}</strong>
          <small v-if="card.analytics.secondHalfHr">{{ card.analytics.secondHalfHr }} bpm</small>
        </div>
      </div>
      <p v-if="card.analytics.splitStrategy" class="vc__split-note">{{ card.analytics.splitStrategy }}</p>
    </div>

    <!-- Heart Rate Zones Stacked Bar -->
    <div v-if="card.hrZones?.length" class="vc__block">
      <div class="vc__block-head">
        <span>心率区间分布</span>
        <small>Z1–Z5 占比</small>
      </div>
      <div class="vc__zone-bar" role="img" aria-label="心率区间柱状分布">
        <span
          v-for="z in card.hrZones"
          :key="z.zone"
          class="vc__zone-seg"
          :class="'is-' + z.zone.toLowerCase()"
          :style="{ width: Math.max(z.percent, 2) + '%' }"
          :title="`${z.zone}: ${z.minutes} 分钟 (${z.percent}%)`"
        ></span>
      </div>
      <div class="vc__zone-legend">
        <span v-for="z in card.hrZones" :key="z.zone" class="vc__zone-item">
          <i class="vc__zone-dot" :class="'is-' + z.zone.toLowerCase()"></i>
          <b>{{ z.zone }}</b> {{ z.percent }}%
        </span>
      </div>
    </div>

    <!-- Per-Km Pace Sparkline SVG -->
    <div v-if="sparkline" class="vc__block">
      <div class="vc__block-head">
        <span>分段配速曲线（{{ card.lapSeries.length }} 段）</span>
        <small>最快 {{ sparkline.fastLabel }} · 最慢 {{ sparkline.slowLabel }}</small>
      </div>
      <svg class="vc__spark" viewBox="0 0 320 68" preserveAspectRatio="none" role="img" aria-label="每公里配速变化曲线">
        <defs>
          <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#15b66a" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#15b66a" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        <path :d="sparkline.area" :fill="'url(#' + gradId + ')'" />
        <path :d="sparkline.line" fill="none" stroke="#15b66a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  </section>

  <!-- 2. Recovery, Sleep & HRV Card -->
  <section v-else-if="card.type === 'recovery_card'" class="vc vc--recovery" aria-label="睡眠与恢复遥测卡片">
    <header class="vc__head">
      <div class="vc__title-wrap">
        <span class="vc__eyebrow">恢复与生理趋势 · {{ card.dateRange }}</span>
        <h4>睡眠 · HRV · 恢复状态</h4>
      </div>
      <span v-if="card.hrvStatus" class="vc__badge" :class="hrvTone">{{ hrvLabel }}</span>
    </header>

    <div v-if="card.metrics?.length" class="vc__kpis">
      <div v-for="m in card.metrics" :key="m.label" class="vc__kpi">
        <span class="vc__kpi-label">{{ m.label }}</span>
        <strong class="vc__kpi-val">{{ m.value }}</strong>
      </div>
    </div>

    <div v-if="card.nights?.length" class="vc__block">
      <div class="vc__block-head">
        <span>近 {{ card.nights.length }} 晚睡眠时长（h）与 HRV（ms）</span>
        <small>虚线 = 7.5h 建议线</small>
      </div>
      <div class="vc__nights">
        <div class="vc__nights-guide" aria-hidden="true"></div>
        <div v-for="n in card.nights" :key="n.date" class="vc__night">
          <span class="vc__night-top">{{ n.sleepHours ?? '-' }}</span>
          <div class="vc__night-track">
            <div
              class="vc__night-bar"
              :class="{ 'is-low': n.sleepHours && n.sleepHours < 6 }"
              :style="{ height: Math.min(100, Math.max(10, ((n.sleepHours || 0) / 10) * 100)) + '%' }"
            ></div>
          </div>
          <span class="vc__night-hrv">{{ n.hrvMs ? n.hrvMs : '-' }}</span>
          <time class="vc__night-date">{{ n.date }}</time>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. Monthly / Weekly Volume Trend Card -->
  <section v-else-if="card.type === 'trend_card'" class="vc vc--trend" aria-label="训练量趋势卡片">
    <header class="vc__head">
      <div class="vc__title-wrap">
        <span class="vc__eyebrow">周期聚合趋势</span>
        <h4>{{ card.title }}</h4>
      </div>
      <span class="vc__badge is-good">共 {{ trendTotalKm }} km</span>
    </header>

    <div class="vc__bars">
      <div v-for="p in card.periods" :key="p.label" class="vc__bar-col">
        <span class="vc__bar-val">{{ Math.round(p.distanceKm) }}</span>
        <div class="vc__bar-track">
          <div
            class="vc__bar-fill"
            :style="{ height: Math.max(8, Math.round((p.distanceKm / trendMaxKm) * 100)) + '%' }"
          ></div>
        </div>
        <span class="vc__bar-label">{{ p.label }}</span>
        <small class="vc__bar-sub">{{ p.count }}次</small>
      </div>
    </div>
  </section>

  <!-- 4. Athlete Physiology Dossier Card -->
  <section v-else-if="card.type === 'dossier_card'" class="vc vc--dossier" aria-label="生理指标与完赛预测卡片">
    <header class="vc__head">
      <div class="vc__title-wrap">
        <span class="vc__eyebrow">{{ card.deviceName }} · 截至 {{ card.asOf }}</span>
        <h4>核心生理坐标</h4>
      </div>
      <span v-if="card.acwr != null" class="vc__badge" :class="card.acwrStatus === 'OPTIMAL' ? 'is-good' : 'is-warn'">
        ACWR {{ card.acwr }}{{ card.acwrStatus === 'OPTIMAL' ? ' · 最佳' : '' }}
      </span>
    </header>

    <div class="vc__kpis vc__kpis--3">
      <div class="vc__kpi">
        <span class="vc__kpi-label">VO2max</span>
        <strong class="vc__kpi-val vc__kpi-val--accent">{{ card.vo2max }}</strong>
      </div>
      <div v-if="card.lactatePace" class="vc__kpi">
        <span class="vc__kpi-label">乳酸阈值</span>
        <strong class="vc__kpi-val">{{ card.lactatePace.replace('/km', '') }}</strong>
      </div>
      <div v-if="card.runningFtpW" class="vc__kpi">
        <span class="vc__kpi-label">跑步 FTP</span>
        <strong class="vc__kpi-val">{{ card.runningFtpW }} W</strong>
      </div>
    </div>

    <div v-if="card.predictions?.length" class="vc__preds">
      <div v-for="p in card.predictions" :key="p.label" class="vc__pred">
        <span>{{ p.label }}</span>
        <strong>{{ p.time }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  card: { type: Object, required: true },
})

const gradId = `vc-grad-${Math.random().toString(36).slice(2, 8)}`

const decoupleTone = computed(() => {
  const pct = Number(props.card.analytics?.decouplingPct)
  if (!Number.isFinite(pct)) return 'is-neutral'
  if (pct < 5) return 'is-good'
  if (pct < 8) return 'is-warn'
  return 'is-high'
})

const hrvTone = computed(() => {
  const s = String(props.card.hrvStatus || '').toUpperCase()
  if (s === 'BALANCED') return 'is-good'
  if (s === 'UNBALANCED' || s === 'LOW') return 'is-warn'
  return 'is-neutral'
})

const hrvLabel = computed(() => {
  const map = { BALANCED: 'HRV 平衡', UNBALANCED: 'HRV 失衡', LOW: 'HRV 偏低', POOR: 'HRV 偏差' }
  return map[String(props.card.hrvStatus || '').toUpperCase()] || props.card.hrvStatus
})

const sparkline = computed(() => {
  const list = props.card.lapSeries || []
  if (list.length < 3) return null
  const secs = list.map(item => item.paceSec)
  const minS = Math.min(...secs)
  const maxS = Math.max(...secs)
  const span = Math.max(10, maxS - minS)
  const width = 320
  const height = 62
  const padY = 6
  // Faster pace (smaller seconds) sits higher on the chart!
  const coords = list.map((item, idx) => {
    const x = list.length === 1 ? width / 2 : (idx / (list.length - 1)) * width
    const ratio = (item.paceSec - minS) / span
    const y = padY + ratio * (height - padY * 2)
    return [Number(x.toFixed(1)), Number(y.toFixed(1))]
  })
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = `${line} L${coords.at(-1)[0]},${height + 6} L${coords[0][0]},${height + 6} Z`
  const fastItem = list.find(item => item.paceSec === minS)
  const slowItem = list.find(item => item.paceSec === maxS)
  return {
    line,
    area,
    fastLabel: fastItem?.pacePerKm?.replace('/km', '') || '',
    slowLabel: slowItem?.pacePerKm?.replace('/km', '') || '',
  }
})

const trendMaxKm = computed(() => {
  const vals = (props.card.periods || []).map(p => Number(p.distanceKm) || 0)
  return Math.max(1, ...vals)
})

const trendTotalKm = computed(() => {
  const sum = (props.card.periods || []).reduce((acc, p) => acc + (Number(p.distanceKm) || 0), 0)
  return Math.round(sum)
})
</script>

<style scoped>
.vc {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  font-variant-numeric: tabular-nums;
}

.vc__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.vc__title-wrap { min-width: 0; }

.vc__eyebrow {
  display: block;
  color: var(--faint);
  font-size: 11px;
  font-weight: 550;
  letter-spacing: 0.03em;
}

.vc__head h4 {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.3;
}

.vc__sub {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.vc__action-link {
  flex: none;
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--green-strong);
  font-size: 12px;
  font-weight: 580;
  text-decoration: none;
}

.vc__badge {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
}

.vc__badge.is-good { background: var(--green-soft, #e2f7eb); color: #087947; }
.vc__badge.is-warn { background: var(--orange-soft, #fff2e0); color: #b45309; }
.vc__badge.is-neutral { background: var(--panel-soft); color: var(--muted); }

.vc__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.vc__kpis--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.vc__kpi {
  display: grid;
  gap: 2px;
  padding: 8px 9px;
  border-radius: 11px;
  background: var(--panel-soft);
}

.vc__kpi-label {
  color: var(--muted);
  font-size: 11px;
}

.vc__kpi-val {
  color: var(--text);
  font-size: 14.5px;
  font-weight: 750;
  letter-spacing: -.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vc__kpi-val--accent { color: var(--green-strong); font-size: 17px; }

.vc__split {
  display: grid;
  gap: 6px;
  padding: 10px 11px;
  border-radius: 12px;
  background: var(--panel-soft);
}

.vc__split-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
}

.vc__half { display: grid; gap: 1px; }
.vc__half--right { text-align: right; }
.vc__half-label,
.vc__half small { color: var(--muted); font-size: 11px; }
.vc__half strong { font-size: 14px; font-weight: 740; }

.vc__decouple {
  display: grid;
  place-items: center;
  padding: 5px 10px;
  border-radius: 10px;
  text-align: center;
}

.vc__decouple-label { font-size: 10.5px; opacity: .85; }
.vc__decouple strong { font-size: 14px; font-weight: 800; }
.vc__decouple.is-good { background: var(--green-soft, #e2f7eb); color: #087947; }
.vc__decouple.is-warn { background: var(--orange-soft, #fff2e0); color: #b45309; }
.vc__decouple.is-high { background: var(--red-soft, #fdecec); color: #be123c; }

.vc__split-note {
  margin: 0;
  color: var(--muted);
  font-size: 11.5px;
  text-align: center;
}

.vc__block { display: grid; gap: 6px; }
.vc__block-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text);
}
.vc__block-head small { color: var(--muted); font-size: 11px; font-weight: 500; }

.vc__zone-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  gap: 2px;
}

.vc__zone-seg { height: 100%; border-radius: 2px; }
.vc__zone-seg.is-z1, .vc__zone-dot.is-z1 { background: #94a3b8; }
.vc__zone-seg.is-z2, .vc__zone-dot.is-z2 { background: #3b82f6; }
.vc__zone-seg.is-z3, .vc__zone-dot.is-z3 { background: #15b66a; }
.vc__zone-seg.is-z4, .vc__zone-dot.is-z4 { background: #f59e0b; }
.vc__zone-seg.is-z5, .vc__zone-dot.is-z5 { background: #ef4444; }

.vc__zone-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 11.5px;
  color: var(--muted);
}

.vc__zone-item { display: inline-flex; align-items: center; gap: 4px; }
.vc__zone-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

.vc__spark {
  width: 100%;
  height: 68px;
  display: block;
}

/* Recovery 7-night chart */
.vc__nights {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  padding-top: 6px;
}

.vc__nights-guide {
  position: absolute;
  left: 0;
  right: 0;
  top: 34px;
  border-top: 1px dashed var(--border);
  pointer-events: none;
}

.vc__night {
  display: grid;
  justify-items: center;
  gap: 3px;
}

.vc__night-top { font-size: 11px; font-weight: 680; color: var(--text); }
.vc__night-track {
  display: flex;
  align-items: flex-end;
  width: 14px;
  height: 54px;
  border-radius: 999px;
  background: var(--panel-soft);
  overflow: hidden;
}

.vc__night-bar {
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(180deg, #15b66a, #087947);
}

.vc__night-bar.is-low { background: linear-gradient(180deg, #f59e0b, #d97706); }
.vc__night-hrv { font-size: 10.5px; color: var(--green-strong); font-weight: 650; }
.vc__night-date { font-size: 10px; color: var(--muted); }

/* Trend Bar Chart */
.vc__bars {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 8px;
  padding-top: 4px;
}

.vc__bar-col { display: grid; justify-items: center; gap: 3px; }
.vc__bar-val { font-size: 11.5px; font-weight: 700; color: var(--text); }
.vc__bar-track {
  display: flex;
  align-items: flex-end;
  width: min(26px, 75%);
  height: 76px;
  border-radius: 8px;
  background: var(--panel-soft);
  overflow: hidden;
}

.vc__bar-fill {
  width: 100%;
  border-radius: 8px 8px 4px 4px;
  background: linear-gradient(180deg, #15b66a, #087947);
}

.vc__bar-label { font-size: 11px; color: var(--text); font-weight: 600; }
.vc__bar-sub { font-size: 10px; color: var(--muted); }

/* Dossier predictions strip */
.vc__preds {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.vc__pred {
  display: grid;
  place-items: center;
  gap: 1px;
  padding: 7px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-soft);
}

.vc__pred span { font-size: 11px; color: var(--muted); }
.vc__pred strong { font-size: 13px; font-weight: 760; color: var(--text); }

@media (max-width: 390px) {
  .vc__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vc__preds { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
