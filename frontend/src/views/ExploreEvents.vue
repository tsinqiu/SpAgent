<template>
  <div class="page-stack explore-tool-page">
    <section class="tool-hero event-hero">
      <div>
        <h2>跑步赛事</h2>
        <p>查看上海未来 90 天已核对的赛事，收藏后查看倒计时。</p>
      </div>
      <span>{{ myEvents.length }} 场</span>
    </section>

    <nav class="tool-tabs" aria-label="赛事视图">
      <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" :aria-pressed="activeTab === tab.key" @click="activeTab = tab.key">
        {{ tab.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'popular'" class="tool-card-list">
      <p class="soft-note">人工核对于 {{ checkedOn }}，收录部分公开赛事。报名前请核对最新公告。</p>
      <article v-if="!upcomingEvents.length" class="tool-empty-card">
        <strong>当前 90 天窗口暂无已核对赛事</strong>
        <span>可在下方添加你关注的赛事。</span>
      </article>
      <article v-for="event in upcomingEvents" :key="event.id" class="tool-list-card">
        <div>
          <span class="tool-icon" style="--tool-color: #16794f">
            <Activity :size="24" aria-hidden="true" />
          </span>
          <div>
            <h3>{{ event.name }}</h3>
            <p>{{ event.date }} · {{ event.city }} · {{ event.distance }}</p>
            <small v-if="event.registrationEnd">{{ event.registrationEnd < today ? '预报名已截止' : `预报名截止 ${event.registrationEnd}` }}</small>
            <small>{{ event.note }}</small>
            <a :href="event.source" target="_blank" rel="noopener noreferrer">赛事公告</a>
            <a v-if="event.registrationSource" :href="event.registrationSource" target="_blank" rel="noopener noreferrer">报名公告</a>
          </div>
        </div>
        <button type="button" class="secondary-link" @click="prepareEvent(event)">加入我的</button>
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
            <p>{{ event.city || event.location || '未设置地点' }} · {{ event.type || '赛事' }} · {{ event.distance || '未设置项目' }}</p>
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
          <input v-model.trim="draft.name" type="text" placeholder="例如 北京马拉松" required />
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
          <input v-model.trim="draft.distance" type="text" placeholder="全马 / 半马 / 10K" />
        </label>
        <label>
          <span>目标成绩</span>
          <input v-model.trim="draft.goal" type="text" placeholder="例如 4:00:00" />
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
import { computed, reactive, ref } from 'vue'
import { showToast } from 'vant'
import { Activity, Medal } from '@lucide/vue'
import { checkedOn, shanghaiRunningEvents } from '@/constants/runningEvents'
import { authSession } from '@/stores/authStore'

const storageKey = authSession.user?.id ? `spagent-events:${authSession.user.id}` : null

const tabs = [
  { key: 'popular', label: '近期赛事' },
  { key: 'mine', label: '我的赛事' },
  { key: 'countdown', label: '倒计时' },
]

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format()
const upcomingEvents = shanghaiRunningEvents.filter(event => daysUntil(event.date) >= 0 && daysUntil(event.date) <= 90)

const activeTab = ref('popular')
const editingFromTemplate = ref(false)
const myEvents = ref(loadItems())
const draft = reactive(createEmptyDraft())

const countdownEvents = computed(() => myEvents.value
  .filter((event) => event.date && !Number.isNaN(Date.parse(event.date)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)))

function createEmptyDraft(source = {}) {
  return {
    id: source.id ? `my-${source.id}` : '',
    name: source.name || '',
    city: source.city || source.location || '',
    date: source.date || '',
    type: source.type || '',
    distance: source.distance || '',
    goal: source.goal || '',
    note: source.note || '',
    source: source.source || '',
    color: source.color || '#16a34a',
  }
}

function loadItems() {
  try {
    const raw = storageKey && window.localStorage.getItem(storageKey)
    const items = raw && JSON.parse(raw)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

function persist() {
  if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(myEvents.value))
}

function resetDraft() {
  Object.assign(draft, createEmptyDraft())
  editingFromTemplate.value = false
}

function prepareEvent(event) {
  Object.assign(draft, createEmptyDraft(event))
  editingFromTemplate.value = true
  showToast('请确认日期后加入我的赛事')
}

function saveDraft() {
  if (!draft.name) {
    showToast('请填写赛事名称')
    return
  }
  const item = {
    ...draft,
    id: draft.id || `event-${Date.now()}`,
    city: draft.city.trim(),
    name: draft.name.trim(),
  }
  const index = myEvents.value.findIndex((event) => event.id === item.id)
  if (index >= 0) myEvents.value.splice(index, 1, item)
  else myEvents.value.unshift(item)
  persist()
  resetDraft()
  activeTab.value = 'mine'
  showToast('赛事已保存')
}

function removeEvent(id) {
  myEvents.value = myEvents.value.filter((event) => event.id !== id)
  persist()
}

function daysUntil(date) {
  return (Date.parse(date) - Date.parse(today)) / 86400000
}
</script>

<style scoped>
.explore-tool-page { gap: 16px; }
.tool-list-card a { display: inline-block; color: var(--green-strong); padding: 8px 8px 8px 0; }
.tool-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, color-mix(in srgb, var(--app-green) 18%, var(--panel)), var(--panel));
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  box-shadow: var(--shadow-sm);
}
.tool-hero h2 { margin: 3px 0 6px; font-size: 24px; line-height: 1.15; }
.tool-hero p { margin: 0; color: var(--muted); line-height: 1.5; }
.tool-hero > span { color: var(--app-green-dark); font-size: 22px; font-weight: 950; white-space: nowrap; }
.tool-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel));
}
.tool-tabs button {
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-weight: 900;
}
.tool-tabs button.active { background: var(--panel); color: var(--app-green-dark); box-shadow: var(--shadow-sm); }
.tool-card-list,
.countdown-stack { display: grid; gap: 10px; }
.tool-list-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.tool-list-card > div { min-width: 0; display: flex; align-items: center; gap: 12px; }
.tool-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 16px;
  background: color-mix(in srgb, var(--tool-color) 12%, #f8fafc);
  color: var(--tool-color);
}
.tool-list-card h3,
.countdown-card h3 { margin: 0; color: var(--text); font-size: 17px; line-height: 1.25; }
.tool-list-card p,
.tool-list-card small,
.countdown-card p { margin: 4px 0 0; color: var(--muted); line-height: 1.35; }
.tool-list-card small { display: block; font-size: 12px; }
.tool-empty-card {
  display: grid;
  gap: 5px;
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
@container phone-frame (max-width: 390px) {
  .tool-list-card { grid-template-columns: 1fr; }
  .tool-list-card > button { width: 100%; }
  .tool-form-grid { grid-template-columns: 1fr; }
}
</style>
