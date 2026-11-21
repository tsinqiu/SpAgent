<template>
  <section class="marathon-widget" :class="{ 'is-compact': compact }" aria-label="近期半马与全马赛事">
    <header class="marathon-widget__header">
      <div class="marathon-widget__title-row">
        <span v-if="!compact" class="marathon-widget__icon" aria-hidden="true">
          <Trophy :size="17" />
        </span>
        <div>
          <h3>近期半马 / 全马</h3>
          <p v-if="!compact" class="marathon-widget__subtitle">
            国内半程与全程马拉松 · 共 {{ counts.total }} 场
          </p>
        </div>
      </div>

      <div class="marathon-widget__header-right">
        <div v-if="compact" class="marathon-widget__inline-tabs" role="tablist" aria-label="筛选赛事项目">
          <button
            v-for="tab in categoryTabs"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="activeCategory === tab.key"
            :class="{ active: activeCategory === tab.key }"
            data-haptic
            @click="switchCategory(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
        <RouterLink class="marathon-widget__more" :to="{ path: '/explore/events', query: { from: compact ? 'coach' : 'today' } }">
          <span>{{ compact ? '更多' : '全部赛事' }}</span>
          <ChevronRight :size="14" aria-hidden="true" />
        </RouterLink>
      </div>
    </header>

    <div v-if="!compact" class="marathon-widget__segmented" role="tablist" aria-label="筛选赛事项目">
      <button
        v-for="tab in categoryTabs"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeCategory === tab.key"
        :class="{ active: activeCategory === tab.key }"
        data-haptic
        @click="switchCategory(tab.key)"
      >
        <span>{{ tab.label }}</span>
        <span v-if="tab.count > 0" class="marathon-widget__count">{{ tab.count }}</span>
      </button>
    </div>

    <div v-if="loading && !events.length" class="marathon-widget__state">
      正在同步近期半马 / 全马赛历…
    </div>
    <div v-else-if="error && !events.length" class="marathon-widget__state">
      <span>近期赛事暂不可用</span>
      <button type="button" class="marathon-widget__retry" @click="loadEvents">重试</button>
    </div>
    <div v-else-if="!events.length" class="marathon-widget__state">
      当前筛选暂无近期半马或全马赛事
    </div>

    <div v-else class="marathon-widget__list">
      <article v-for="event in events" :key="event.id" class="marathon-card">
        <div class="marathon-card__top">
          <span class="marathon-card__badge" :class="'is-' + event.raceCategory">
            {{ event.distance }}
          </span>
          <span class="marathon-card__countdown">
            {{ formatCountdown(event.daysUntil) }}
          </span>
        </div>

        <h4 class="marathon-card__name">{{ event.name }}</h4>

        <p class="marathon-card__meta">
          {{ event.date }} · {{ event.city }}
        </p>

        <div class="marathon-card__footer">
          <a
            v-if="event.source"
            :href="event.source"
            target="_blank"
            rel="noopener noreferrer"
            class="marathon-card__link"
          >
            {{ event.registrationStatus === '查看赛事公告' ? '公告' : event.registrationStatus }}
          </a>
          <span v-else class="marathon-card__status">{{ event.registrationStatus }}</span>
          <button
            type="button"
            class="marathon-card__coach-btn"
            data-haptic
            @click="handleAskCoach(event)"
          >
            <Sparkles :size="11.5" aria-hidden="true" />
            <span>备赛</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Sparkles, Trophy } from '@lucide/vue'
import { getUpcomingMarathonEvents } from '@/services/events'

const props = defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  limit: {
    type: Number,
    default: 4,
  },
})

const emit = defineEmits(['ask-coach'])
const router = useRouter()

const activeCategory = ref('all')
const events = ref([])
const counts = ref({ total: 0, full: 0, half: 0 })
const loading = ref(false)
const error = ref('')

const categoryTabs = computed(() => [
  { key: 'all', label: '全部', count: counts.value.total || 0 },
  { key: 'full', label: '全马', count: counts.value.full || 0 },
  { key: 'half', label: '半马', count: counts.value.half || 0 },
])

function formatCountdown(daysUntil) {
  if (daysUntil === null || daysUntil === undefined) return '近期'
  if (daysUntil <= 0) return '今日'
  if (daysUntil === 1) return '明天'
  return `${daysUntil} 天后`
}

async function loadEvents() {
  loading.value = true
  error.value = ''
  try {
    const res = await getUpcomingMarathonEvents({
      category: activeCategory.value,
      days: 120,
      limit: props.limit,
      featured: true,
    })
    events.value = res.items
    if (res.meta?.counts) {
      counts.value = res.meta.counts
    }
  } catch (err) {
    error.value = err?.message || '赛事加载失败'
  } finally {
    loading.value = false
  }
}

function switchCategory(key) {
  if (activeCategory.value === key) return
  activeCategory.value = key
  loadEvents()
}

function handleAskCoach(event) {
  const prompt = `请结合我目前的跑力、历史 PB 与恢复状态，帮我评估「${event.name}」（${event.date}，${event.city}，${event.distance}）是否适合参加，并给出针对性的备赛周期建议。`
  if (props.compact) {
    emit('ask-coach', prompt)
  } else {
    router.push({ path: '/coach', query: { prompt } })
  }
}

onMounted(loadEvents)
</script>

<style scoped>
.marathon-widget {
  display: grid;
  gap: 14px;
  padding: 20px;
  border-radius: var(--radius-lg, 20px);
  background: var(--panel, #ffffff);
  border: 1px solid var(--border, rgb(15 23 42 / 0.075));
  box-shadow: var(--shadow-sm);
  text-align: left;
  width: 100%;
  box-sizing: border-box;
}

/* Compact mode on Coach Welcome: borderless Apple / Meta Muse horizontal rail */
.marathon-widget.is-compact {
  width: min(100%, 540px);
  margin-top: 14px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  gap: 10px;
}

.marathon-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.marathon-widget.is-compact .marathon-widget__header {
  padding-inline: 2px;
}

.marathon-widget__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.marathon-widget__icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, #f59e0b 12%, var(--panel-soft));
  color: #d97706;
  flex: none;
}

.marathon-widget h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text);
  line-height: 1.25;
}

.marathon-widget.is-compact h3 {
  font-size: 13px;
  font-weight: 560;
  color: var(--muted);
}

.marathon-widget__subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.marathon-widget__header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.marathon-widget__inline-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--panel-soft);
}

.marathon-widget__inline-tabs button {
  padding: 3px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.marathon-widget__inline-tabs button.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.marathon-widget__more {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--app-green-dark);
  text-decoration: none;
  white-space: nowrap;
}

/* iOS UISegmentedControl for full Today widget */
.marathon-widget__segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--panel-soft);
}

.marathon-widget__segmented button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 32px;
  border: 0;
  border-radius: 9.5px;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 520;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.marathon-widget__segmented button.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.08);
}

.marathon-widget__count {
  font-size: 11px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}

.marathon-widget__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 10px;
  font-size: 13px;
  color: var(--muted);
}

.marathon-widget__retry {
  border: 0;
  background: var(--panel-soft);
  color: var(--text);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.marathon-widget__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

@media (min-width: 640px) {
  .marathon-widget:not(.is-compact) .marathon-widget__list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Smooth Apple Fitness / Muse horizontal snap carousel in compact mode */
.marathon-widget.is-compact .marathon-widget__list {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 2px 2px 6px;
}

.marathon-widget.is-compact .marathon-widget__list::-webkit-scrollbar {
  display: none;
}

.marathon-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  background: var(--panel-soft);
  border: 0;
  min-width: 0;
  transition: background-color 140ms ease, transform 120ms ease;
}

.marathon-widget.is-compact .marathon-card {
  flex: 0 0 218px;
  scroll-snap-align: start;
  padding: 13px 14px;
  border-radius: 18px;
}

.marathon-card:active {
  transform: scale(0.985);
}

.marathon-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.marathon-card__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.marathon-card__badge.is-full {
  background: rgb(15 169 104 / 0.12);
  color: var(--app-green-dark);
}

.marathon-card__badge.is-half {
  background: rgb(0 122 255 / 0.11);
  color: #0066cc;
}

html[data-theme="night"] .marathon-card__badge.is-half {
  color: #5eb0ff;
}

.marathon-card__badge.is-full_half {
  background: rgb(124 58 237 / 0.11);
  color: #6d28d9;
}

html[data-theme="night"] .marathon-card__badge.is-full_half {
  color: #a78bfa;
}

.marathon-card__countdown {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.marathon-card__name {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.marathon-widget:not(.is-compact) .marathon-card__name {
  -webkit-line-clamp: 2;
}

.marathon-card__meta {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marathon-card__footer {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.marathon-card__link {
  font-size: 12px;
  color: var(--app-green-dark);
  text-decoration: none;
  font-weight: 540;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marathon-card__status {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marathon-card__link:hover {
  color: var(--text);
}

.marathon-card__coach-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 0;
  background: var(--panel);
  color: var(--app-green-dark);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  flex: none;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.06);
  transition: transform 110ms ease, background-color 140ms ease;
}

.marathon-card__coach-btn:active {
  transform: scale(0.95);
}
</style>
