<template>
  <div class="page-stack explore-tool-page">
    <section class="tool-hero event-hero">
      <div>
        <h2>跑步赛事</h2>
        <p>自动同步国内近期半程与全程马拉松，支持按项目/城市筛选与一键 AI 备赛。</p>
      </div>
      <div class="event-hero__right">
        <span>{{ counts.total || upcomingEvents.length }} 场</span>
        <button type="button" class="event-sync-btn" :disabled="refreshing" data-haptic @click="handleManualRefresh">
          <RefreshCw :size="14" :class="{ 'is-spinning': refreshing }" aria-hidden="true" />
          <span>{{ refreshing ? '同步中…' : '同步赛事' }}</span>
        </button>
      </div>
    </section>

    <nav class="tool-tabs" aria-label="赛事视图">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" :aria-pressed="activeTab === tab.key" @click="activeTab = tab.key">
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'popular'" class="tool-card-list">
      <div class="event-filter-bar">
        <div class="event-category-pills" role="group" aria-label="赛事项目筛选">
          <button
            v-for="cat in categoryOptions"
            :key="cat.key"
            type="button"
            :class="{ active: activeCategory === cat.key }"
            data-haptic
            @click="switchCategory(cat.key)"
          >
            {{ cat.label }}
            <small v-if="cat.count > 0">{{ cat.count }}</small>
          </button>
        </div>
        <div class="event-search-box">
          <Search :size="15" aria-hidden="true" />
          <input
            v-model.trim="cityKeyword"
            type="search"
            placeholder="搜索城市或赛事名（如 上海、厦门）"
            @keyup.enter="loadEvents"
          />
          <button v-if="cityKeyword" type="button" class="event-search-clear" aria-label="清空搜索" @click="clearSearch">×</button>
        </div>
      </div>

      <p class="soft-note">
        数据来源：{{ crawlSource }} · 仅展示国内半马与全马{{ lastCrawledLabel ? ` · 更新于 ${lastCrawledLabel}` : '' }}
      </p>

      <article v-if="loading && !upcomingEvents.length" class="tool-empty-card">
        <strong>正在同步近期半马 / 全马赛事…</strong>
        <span>首次抓取会从赛事源自动过滤出国内半程与全程马拉松。</span>
      </article>
      <article v-else-if="loadError && !upcomingEvents.length" class="tool-empty-card">
        <strong>赛事加载失败</strong>
        <span>{{ loadError }}</span>
        <button type="button" class="secondary-link" @click="loadEvents">重试</button>
      </article>
      <article v-else-if="!upcomingEvents.length" class="tool-empty-card">
        <strong>当前筛选暂无匹配赛事</strong>
        <span>可切换「全部 / 全马 / 半马」或清空城市关键词。</span>
      </article>

      <article v-for="event in upcomingEvents" :key="event.id" class="tool-list-card">
        <div class="event-item-main">
          <span class="tool-icon" :style="{ '--tool-color': categoryColor(event.raceCategory) }">
            <Trophy :size="22" aria-hidden="true" />
          </span>
          <div class="event-item-copy">
            <div class="event-item-badges">
              <span class="event-pill" :class="'is-' + event.raceCategory">{{ event.distance }}</span>
              <span class="event-countdown-tag">{{ formatCountdown(event.daysUntil) }}</span>
              <span class="event-status-tag" :class="statusTone(event.registrationStatus)">{{ event.registrationStatus }}</span>
            </div>
            <h3>{{ event.name }}</h3>
            <p>{{ event.date }} · {{ event.city }}</p>
            <small v-if="event.registrationEnd">{{ event.registrationEnd < today ? '预报名已截止' : `报名截止 ${event.registrationEnd}` }}</small>
            <small v-if="event.note" class="event-summary-line">{{ event.note }}</small>
            <div class="event-item-links">
              <a v-if="event.source" :href="event.source" target="_blank" rel="noopener noreferrer">赛事公告</a>
            </div>
          </div>
        </div>
        <div class="event-item-actions">
          <button type="button" class="coach-prep-link" data-haptic @click="askCoachPrep(event)">
            <Sparkles :size="13" aria-hidden="true" />
            <span>AI 备赛</span>
          </button>
          <button type="button" class="secondary-link" @click="prepareEvent(event)">加入我的</button>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'mine'" class="tool-card-list">
      <article v-if="!myEvents.length" class="tool-empty-card">
        <strong>暂无我的赛事</strong>
        <span>从近期赛事加入，或在下方自定义赛事。</span>
      </article>
      <article v-for="event in myEvents" :key="event.id" class="tool-list-card">
        <div>
          <span class="tool-icon" :style="{ '--tool-color': event.color || '#16a34a' }">
            <Medal :size="24" aria-hidden="true" />
          </span>
          <div>
            <h3>{{ event.name }}</h3>
            <p>{{ event.city || event.location || '未设置地点' }} · {{ event.type || '路跑' }} · {{ event.distance || '未设置项目' }}</p>
            <small>{{ event.date || '未设置日期' }}{{ event.goal ? ` · 目标 ${event.goal}` : '' }}</small>
            <a v-if="event.source" :href="event.source" target="_blank" rel="noopener noreferrer">赛事公告</a>
          </div>
        </div>
        <button type="button" class="danger-link" @click="removeEvent(event.id)">移除</button>
      </article>
    </section>

    <section v-else class="countdown-stack">
      <article v-if="!countdownEvents.length" class="tool-empty-card">
        <strong>暂无赛事倒计时</strong>
        <span>为我的赛事填写日期后，这里会显示剩余天数。</span>
      </article>
      <article v-for="event in countdownEvents" :key="event.id" class="countdown-card">
        <span>{{ daysUntil(event.date) }}</span>
        <div>
          <h3>{{ event.name }}</h3>
          <p>{{ event.city || event.location || '未设置地点' }} · {{ event.date }}</p>
        </div>
      </article>
    </section>

    <form class="tool-form-card" @submit.prevent="saveDraft">
      <div class="section-heading">
        <div>
          <p class="overline">{{ editingFromTemplate ? '确认赛事信息' : '自定义赛事' }}</p>
          <h2>{{ editingFromTemplate ? draft.name : '添加赛事' }}</h2>
        </div>
      </div>
      <div class="tool-form-grid">
        <label>
          <span>赛事名称</span>
          <input v-model.trim="draft.name" type="text" placeholder="例如 上海马拉松" required />
        </label>
        <label>
          <span>地点</span>
          <input v-model.trim="draft.city" type="text" placeholder="城市 / 场地" />
        </label>
        <label>
          <span>比赛日期</span>
          <input v-model="draft.date" type="date" />
        </label>
        <label>
          <span>项目</span>
          <input v-model.trim="draft.distance" type="text" placeholder="全马 / 半马" />
        </label>
        <label>
          <span>目标成绩</span>
          <input v-model.trim="draft.goal" type="text" placeholder="例如 3:30:00" />
        </label>
        <label class="tool-form-wide">
          <span>备注</span>
          <textarea v-model.trim="draft.note" rows="3" placeholder="报名状态、补给、交通等" />
        </label>
      </div>
      <button class="primary-link" type="submit">{{ editingFromTemplate ? '确认加入' : '保存赛事' }}</button>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { Medal, RefreshCw, Search, Sparkles, Trophy } from '@lucide/vue'
import {
  deleteMyMarathonEvent,
  getUpcomingMarathonEvents,
  listMyMarathonEvents,
  refreshMarathonEvents,
  saveMyMarathonEvent,
} from '@/services/events'
import { authSession } from '@/stores/authStore'

const router = useRouter()
const legacyStorageKey = authSession.user?.id ? `spagent-events:${authSession.user.id}` : null

const tabs = [
  { key: 'popular', label: '近期赛事' },
  { key: 'mine', label: '我的赛事' },
  { key: 'countdown', label: '倒计时' },
]

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format()

const activeTab = ref('popular')
const activeCategory = ref('all')
const cityKeyword = ref('')
const upcomingEvents = ref([])
const counts = ref({ total: 0, full: 0, half: 0 })
const crawlSource = ref('中国马拉松 (chinamarathon.com)')
const lastCrawledAt = ref('')
const loading = ref(false)
const refreshing = ref(false)
const savingEvent = ref(false)
const loadError = ref('')
const editingFromTemplate = ref(false)
const myEvents = ref([])
const draft = reactive(createEmptyDraft())
let searchDebounce = null

const categoryOptions = computed(() => [
  { key: 'all', label: '全部半/全马', count: counts.value.total || 0 },
  { key: 'full', label: '全马', count: counts.value.full || 0 },
  { key: 'half', label: '半马', count: counts.value.half || 0 },
])

const lastCrawledLabel = computed(() => {
  if (!lastCrawledAt.value) return ''
  return String(lastCrawledAt.value).replace('T', ' ').slice(0, 16)
})

const countdownEvents = computed(() => myEvents.value
  .filter((event) => event.date && !Number.isNaN(Date.parse(event.date)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)))

async function loadEvents() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getUpcomingMarathonEvents({
      category: activeCategory.value,
      city: cityKeyword.value,
      days: 120,
      limit: 60,
    })
    upcomingEvents.value = res.items
    if (res.meta?.counts) counts.value = res.meta.counts
    if (res.meta?.source) crawlSource.value = res.meta.source
    if (res.meta?.lastCrawledAt) lastCrawledAt.value = res.meta.lastCrawledAt
  } catch (err) {
    loadError.value = err?.message || '赛事服务暂时不可用，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function handleManualRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const res = await refreshMarathonEvents()
    if (res.refresh?.skipped && res.refresh?.reason === 'cooldown') {
      showToast('刚刚已同步过，稍后再试')
    } else {
      showToast(`已同步最新国内半马/全马（${res.meta?.counts?.total || res.items.length} 场）`)
    }
    await loadEvents()
  } catch (err) {
    showToast(err?.message || '同步失败，请稍后重试')
  } finally {
    refreshing.value = false
  }
}

function switchCategory(key) {
  if (activeCategory.value === key) return
  activeCategory.value = key
  loadEvents()
}

function clearSearch() {
  cityKeyword.value = ''
  loadEvents()
}

watch(cityKeyword, () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(loadEvents, 320)
})

function categoryColor(raceCategory) {
  if (raceCategory === 'full') return '#15803d'
  if (raceCategory === 'half') return '#0369a1'
  return '#6d28d9'
}

function formatCountdown(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return '近期'
  if (daysLeft <= 0) return '今日开赛'
  if (daysLeft === 1) return '明天开赛'
  return `${daysLeft} 天后`
}

function statusTone(status) {
  if (/开放|预报名|抽签/.test(status || '')) return 'is-open'
  if (/截止|额满/.test(status || '')) return 'is-closed'
  return 'is-neutral'
}

function askCoachPrep(event) {
  const prompt = `请结合我目前的跑力、历史 PB 与恢复状态，帮我评估「${event.name}」（${event.date}，${event.city}，${event.distance}）是否适合参加，并给出针对性的备赛周期建议。`
  router.push({ path: '/coach', query: { prompt } })
}

function createEmptyDraft(source = {}) {
  return {
    eventKey: source.eventKey || (source.id ? `my-${source.id}` : ''),
    name: source.name || '',
    city: source.city || source.location || '',
    date: source.date || '',
    type: source.type || '路跑',
    distance: source.distance || '',
    goal: source.goal || '',
    note: source.note || '',
    source: source.source || '',
    color: source.color || '#16a34a',
  }
}

async function loadMyEvents() {
  try {
    let items = await listMyMarathonEvents()
    // One-time seamless migration of legacy localStorage saved races into MySQL
    if (!items.length && legacyStorageKey) {
      const raw = window.localStorage.getItem(legacyStorageKey)
      const legacy = raw ? JSON.parse(raw) : []
      if (Array.isArray(legacy) && legacy.length) {
        for (const item of legacy) {
          if (item?.name) {
            await saveMyMarathonEvent({
              eventKey: item.id || `legacy-${item.name}`,
              name: item.name,
              date: item.date || '',
              city: item.city || item.location || '',
              distance: item.distance || '',
              goal: item.goal || '',
              note: item.note || '',
              source: item.source || '',
            }).catch(() => {})
          }
        }
        window.localStorage.removeItem(legacyStorageKey)
        items = await listMyMarathonEvents()
      }
    }
    myEvents.value = items
  } catch {
    myEvents.value = []
  }
}

function resetDraft() {
  Object.assign(draft, createEmptyDraft())
  editingFromTemplate.value = false
}

function prepareEvent(event) {
  Object.assign(draft, createEmptyDraft(event))
  editingFromTemplate.value = true
  showToast('请确认日期与目标成绩后加入我的赛事')
}

async function saveDraft() {
  if (!draft.name) {
    showToast('请填写赛事名称')
    return
  }
  if (savingEvent.value) return
  savingEvent.value = true
  try {
    const saved = await saveMyMarathonEvent({
      eventKey: draft.eventKey || `custom-${Date.now()}`,
      name: draft.name.trim(),
      city: draft.city.trim(),
      date: draft.date || '',
      distance: draft.distance.trim(),
      goal: draft.goal.trim(),
      note: draft.note.trim(),
      source: draft.source.trim(),
    })
    if (saved) {
      const idx = myEvents.value.findIndex((item) => item.id === saved.id)
      if (idx >= 0) myEvents.value.splice(idx, 1, saved)
      else myEvents.value.unshift(saved)
    } else {
      await loadMyEvents()
    }
    resetDraft()
    activeTab.value = 'mine'
    showToast('已保存到云端「我的赛事」，AI 教练将同步知晓')
  } catch (err) {
    showToast(err?.message || '保存失败，请稍后重试')
  } finally {
    savingEvent.value = false
  }
}

async function removeEvent(id) {
  try {
    await deleteMyMarathonEvent(id)
    myEvents.value = myEvents.value.filter((event) => event.id !== id)
    showToast('已移除')
  } catch (err) {
    showToast(err?.message || '移除失败')
  }
}

function daysUntil(date) {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000)
}

onMounted(() => {
  loadEvents()
  loadMyEvents()
})
</script>

<style scoped>
.explore-tool-page { gap: 16px; }
.tool-list-card a { display: inline-block; color: var(--green-strong); padding: 4px 8px 4px 0; font-size: 12.5px; font-weight: 550; }
.tool-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.tool-hero h2 { margin: 0 0 4px; font-size: 21px; font-weight: 620; letter-spacing: -0.02em; line-height: 1.2; }
.tool-hero p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.event-hero__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex: none;
}
.event-hero__right > span { color: var(--text); font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.event-sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 0;
  background: var(--panel-soft);
  color: var(--app-green-dark);
  font-size: 12px;
  font-weight: 580;
  cursor: pointer;
}
.event-sync-btn:disabled { opacity: 0.6; cursor: wait; }
.is-spinning { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* iOS UISegmentedControl */
.tool-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: 13px;
  background: var(--panel-strong);
}
.tool-tabs button {
  min-height: 36px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font-size: 13.5px;
  font-weight: 540;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
.tool-tabs button.active { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: 0 1px 4px rgb(0 0 0 / 0.08); }

.event-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.event-category-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.event-category-pills button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 0;
  background: var(--panel);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 540;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.event-category-pills button.active {
  background: var(--workspace-bubble);
  color: var(--app-green-dark);
  font-weight: 600;
}
.event-category-pills small { font-size: 11px; opacity: 0.75; }

.event-search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: 12px;
  border: 0;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  color: var(--muted);
  min-width: 210px;
  flex: 1 1 210px;
  max-width: 340px;
}
.event-search-box input {
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  width: 100%;
}
.event-search-clear {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.tool-card-list,
.countdown-stack { display: grid; gap: 12px; }
.tool-list-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.tool-list-card > div:first-child { min-width: 0; display: flex; align-items: flex-start; gap: 12px; }
.event-item-copy { min-width: 0; flex: 1; }
.event-item-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
.event-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.event-pill.is-full { background: rgb(15 169 104 / 0.12); color: var(--app-green-dark); }
.event-pill.is-half { background: rgb(0 122 255 / 0.11); color: #0066cc; }
.event-pill.is-full_half { background: rgb(124 58 237 / 0.11); color: #6d28d9; }
.event-countdown-tag {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.event-status-tag {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--muted);
}
.event-status-tag.is-open { color: var(--app-green-dark); }
.event-status-tag.is-closed { color: var(--faint); }
.event-summary-line {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.event-item-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: stretch;
}
.coach-prep-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 13px;
  border-radius: 999px;
  border: 0;
  background: var(--workspace-bubble);
  color: var(--app-green-dark);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.tool-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 14px;
  background: color-mix(in srgb, var(--tool-color) 12%, #f8fafc);
  color: var(--tool-color);
}
.tool-list-card h3,
.countdown-card h3 { margin: 0; color: var(--text); font-size: 16px; line-height: 1.3; }
.tool-list-card p,
.tool-list-card small,
.countdown-card p { margin: 4px 0 0; color: var(--muted); line-height: 1.4; }
.tool-list-card small { display: block; font-size: 12px; }
.tool-empty-card {
  display: grid;
  gap: 6px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px dashed color-mix(in srgb, var(--app-green) 28%, var(--border));
  color: var(--muted);
}
.tool-empty-card strong { color: var(--text); }
.countdown-card {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.countdown-card > span { color: var(--app-green-dark); font-size: 34px; font-weight: 950; text-align: center; }
.tool-form-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.tool-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tool-form-grid label { display: grid; gap: 6px; min-width: 0; }
.tool-form-grid span { color: var(--muted); font-size: 12px; font-weight: 800; }
.tool-form-grid :is(input, textarea) {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 82%, var(--panel-soft));
  color: var(--text);
  font: inherit;
  padding: 10px 12px;
}
.tool-form-wide { grid-column: 1 / -1; }
@container phone-frame (max-width: 440px) {
  .tool-list-card { grid-template-columns: 1fr; }
  .event-item-actions { flex-direction: row; }
  .event-item-actions > button { flex: 1; }
  .tool-form-grid { grid-template-columns: 1fr; }
}
</style>
