<template>
  <div class="plan-agent">
    <CoachPreferences v-model="profile" />
    <Transition name="coach-panel">
      <section v-show="activeTab === 'chat'" id="coach-panel-chat" class="plan-agent__chat" role="tabpanel" aria-labelledby="coach-tab-chat" :inert="activeTab !== 'chat'" :aria-hidden="activeTab !== 'chat'">
        <div ref="thread" class="plan-agent__thread" role="log" aria-label="与 AI 教练的对话" aria-live="polite" @scroll.passive="handleThreadScroll">
          <div v-if="loading && !messages.length" class="plan-agent__empty" role="status">正在加载对话…</div>
          <div v-else-if="loadError" class="plan-agent__empty">
            <p role="alert">{{ loadError }}</p>
            <button type="button" class="plan-agent__text-button" @click="initialize">重试</button>
          </div>
          <div v-else-if="!messages.length && !pendingMessage" class="plan-agent__empty plan-agent__welcome">
            <img class="plan-agent__mark" src="/icons/spagent-icon.png" alt="" width="52" height="52">
            <h2>{{ contextPulse?.greeting || '今天想聊什么？' }}</h2>
            <p class="plan-agent__welcome-sub">{{ contextPulse?.subtitle || '查运动记录、深度遥测复盘，或量身定制训练计划。' }}</p>

            <div v-if="contextPulse?.pills?.length" class="plan-agent__pulse-strip" aria-label="我的实时运动指标">
              <button
                v-for="pill in contextPulse.pills"
                :key="pill.label"
                type="button"
                class="plan-agent__pulse-pill"
                :class="'is-' + (pill.tone || 'neutral')"
                :disabled="locked"
                data-haptic
                @click="sendTurn(pill.prompt)"
              >
                <span class="plan-agent__pulse-label">{{ pill.label }}</span>
                <strong>{{ pill.value }}</strong>
              </button>
            </div>

            <div class="plan-agent__starters" aria-label="快捷提问">
              <button
                v-for="starter in activeStarters"
                :key="starter.prompt"
                type="button"
                class="plan-agent__starter"
                :disabled="locked"
                data-haptic
                @click="sendTurn(starter.prompt)"
              >
                <span class="plan-agent__starter-copy">
                  <strong>{{ starter.title }}</strong>
                  <span>{{ starter.desc }}</span>
                </span>
                <ChevronRight :size="15" class="plan-agent__starter-chevron" aria-hidden="true" />
              </button>
            </div>

            <UpcomingMarathonWidget compact :limit="6" @ask-coach="sendTurn" />
          </div>

          <div v-else class="plan-agent__messages">
            <button v-if="messageBefore" type="button" :disabled="locked" class="plan-agent__text-button plan-agent__older" data-haptic @click="loadOlder('chat')">加载更早消息</button>
            <article
              v-for="message in messages"
              :id="'coach-message-' + message.id"
              :key="message.id"
              class="agent-message"
              :class="[message.role, { 'is-attachment-target': message.id === highlightedMessageId }]"
              :aria-label="message.role === 'user' ? '你' : 'AI 教练'"
              tabindex="-1"
            >
              <div v-if="message.role === 'user'" class="agent-message__bubble">
                <span v-if="message.attachment" class="agent-message__attachment">
                  <Paperclip :size="15" aria-hidden="true" /> {{ message.attachment.name }}
                </span>
                <span>{{ message.content }}</span>
              </div>

              <template v-else>
                <!-- Compact ChatGPT/DeepSeek-style Collapsible Tool Trace Pill -->
                <details v-if="traceCards(message).length" class="agent-evidence">
                  <summary>
                    <Sparkles :size="13" aria-hidden="true" />
                    <span>已调取 {{ toolStepCount(message) }} 项运动数据 · 查看轨迹</span>
                    <ChevronDown :size="14" class="agent-evidence__chevron" aria-hidden="true" />
                  </summary>
                  <div class="agent-evidence__body">
                    <template v-for="(card, index) in traceCards(message)" :key="index">
                      <p v-if="card.type === 'tool_status'" class="agent-step"><Check :size="13" aria-hidden="true" /><span>{{ card.summary }}</span></p>
                      <template v-else-if="card.type === 'evidence'">
                        <ul>
                          <li v-for="window in card.windows" :key="window.days">
                            <strong>近 {{ window.days }} 天</strong>
                            {{ window.startDate }} 至 {{ window.endDate }} · {{ window.runs }} 条跑步
                            <span v-if="window.latestRun"> · 最近 {{ window.latestRun }}</span>
                            <span v-if="window.durationS != null"> · 合计 {{ Math.round(window.durationS / 60) }} 分钟</span>
                            <span v-if="window.demo" class="agent-evidence__demo">含演示数据</span>
                          </li>
                        </ul>
                        <p v-if="card.missing.length">缺失数据　{{ card.missing.join('、') }}</p>
                        <p v-for="note in card.assumptions" :key="note">{{ note }}</p>
                      </template>
                    </template>
                  </div>
                </details>

                <!-- Native Generative Visual Telemetry / Recovery / Trend Cards -->
                <div v-if="visualCards(message).length" class="agent-visuals">
                  <CoachVisualCard
                    v-for="(vcard, vidx) in visualCards(message)"
                    :key="vidx"
                    :card="vcard"
                  />
                </div>

                <!-- MarkdownIt escapes HTML and image syntax is disabled to avoid automatic remote requests. -->
                <div class="agent-message__answer" v-html="renderReply(message.content)"></div>

                <!-- Interactive Proposal / Clarification Cards -->
                <template v-for="(card, index) in message.cards" :key="index">
                  <div v-if="card.type === 'clarification' && lastAssistantId === message.id && Date.parse(card.expiresAt) > now" class="agent-clarification">
                    <button v-for="choice in card.choices" :key="choice.message" class="plan-agent__text-button" type="button" :disabled="locked" data-haptic @click="sendTurn(choice.message)">{{ choice.label }}</button>
                  </div>
                  <CoachPlanDraft
                    v-else-if="card.type === 'plan_draft'"
                    :plan="card.plan"
                    :action="card.action"
                    :now="now"
                    :busy="pendingActions.has(card.action.id)"
                    :error="actionErrors[card.action.id]"
                    @decide="decision => changeAction(card.action.id, decision)"
                  />
                  <CoachRevisionDraft
                    v-else-if="card.type === 'plan_diff'"
                    :revision="card.revision"
                    :action="card.action"
                    :now="now"
                    :busy="pendingActions.has(card.action.id)"
                    :error="actionErrors[card.action.id]"
                    @decide="decision => changeAction(card.action.id, decision)"
                  />
                </template>

                <!-- ChatGPT/Doubao-style Action Bar (Copy, Regenerate, Provider Metadata) -->
                <div class="agent-message__actions">
                  <button type="button" class="agent-action-btn" data-haptic @click="copyReply(message)">
                    <Check v-if="copiedMessageId === message.id" :size="14" aria-hidden="true" />
                    <Copy v-else :size="14" aria-hidden="true" />
                    <span>{{ copiedMessageId === message.id ? '已复制' : '复制' }}</span>
                  </button>
                  <button
                    v-if="lastAssistantId === message.id && !locked"
                    type="button"
                    class="agent-action-btn"
                    data-haptic
                    @click="regenerateLastReply"
                  >
                    <RotateCcw :size="14" aria-hidden="true" />
                    <span>重新生成</span>
                  </button>
                  <small v-if="replySource(message)" class="agent-message__source">{{ replySource(message) }}</small>
                </div>

                <!-- 1-Tap Contextual Follow-Up Chips (Latest Assistant Reply Only) -->
                <div
                  v-if="lastAssistantId === message.id && !pendingMessage && message.meta?.followups?.length"
                  class="agent-followups"
                  aria-label="推荐追问"
                >
                  <button
                    v-for="q in message.meta.followups"
                    :key="q"
                    type="button"
                    class="agent-followup-chip"
                    :disabled="locked"
                    data-haptic
                    @click="sendTurn(q)"
                  >
                    <span>{{ q }}</span>
                    <ArrowUpRight :size="14" aria-hidden="true" />
                  </button>
                </div>
              </template>
            </article>

            <!-- Optimistic User Turn + Live Streaming Assistant Turn -->
            <article v-if="pendingMessage" class="agent-message user" aria-label="你">
              <div class="agent-message__bubble">
                <span v-if="pendingAttachment" class="agent-message__attachment">
                  <Paperclip :size="15" aria-hidden="true" /> {{ pendingAttachment }}
                </span>
                <span>{{ pendingMessage }}</span>
              </div>
            </article>
            <article v-if="pendingMessage" class="agent-message assistant agent-message--streaming" aria-label="AI 教练正在回复">
              <div v-if="streamingSteps.length" class="agent-live-trace" role="status" aria-live="polite">
                <div
                  v-for="(item, idx) in streamingSteps"
                  :key="idx"
                  class="agent-live-step"
                  :class="item.done ? 'is-done' : 'is-running'"
                >
                  <Check v-if="item.done" :size="14" aria-hidden="true" />
                  <span v-else class="agent-live-dot" aria-hidden="true"></span>
                  <span>{{ item.text }}</span>
                </div>
              </div>
              <div v-if="streamingCards.length" class="agent-visuals">
                <CoachVisualCard
                  v-for="(vcard, vidx) in streamingCards"
                  :key="vidx"
                  :card="vcard"
                />
              </div>
              <div
                v-if="streamingText"
                class="agent-message__answer agent-message__answer--streaming"
                v-html="renderReply(streamingText)"
              ></div>
              <div v-else-if="!streamingSteps.length" class="plan-agent__typing" role="status" aria-label="教练正在回复">
                <span></span><span></span><span></span>
              </div>
            </article>
          </div>
        </div>

        <footer class="plan-agent__footer">
          <Transition name="coach-fab">
            <button
              v-if="showScrollBottom && messages.length"
              type="button"
              class="plan-agent__scroll-bottom"
              aria-label="滚动到底部"
              data-haptic
              @click="scrollToLatest(true)"
            >
              <ArrowDown :size="18" aria-hidden="true" />
            </button>
          </Transition>

          <p v-if="operationError" class="plan-agent__error" role="alert">{{ operationError }}</p>
          <form class="plan-agent__composer" @submit.prevent="submit">
            <div v-if="attachment" class="plan-agent__attachment">
              <img v-if="attachmentPreviewUrl" :src="attachmentPreviewUrl" class="plan-agent__attachment-thumb" alt="附件预览" />
              <Paperclip v-else :size="16" aria-hidden="true" />
              <span>{{ attachment.name }}</span>
              <button type="button" aria-label="移除附件" :disabled="locked" data-haptic @click="clearAttachment"><X :size="16" aria-hidden="true" /></button>
            </div>
            <input
              ref="attachmentInput" type="file" hidden aria-label="上传图片、Markdown 或 PDF"
              accept=".md,.markdown,.txt,.pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown"
              @change="selectAttachment"
            >
            <button class="plan-agent__attach" type="button" :disabled="locked" aria-label="添加附件" data-haptic @click="attachmentInput?.click()">
              <Paperclip :size="20" aria-hidden="true" />
            </button>
            <textarea
              v-model="draft"
              rows="1"
              maxlength="1000"
              aria-label="给教练发消息"
              enterkeyhint="send"
              :placeholder="voiceListening ? '正在聆听语音…' : '给教练发消息…'"
              @keydown.enter.exact="submitFromKeyboard"
            ></textarea>
            <div class="plan-agent__composer-right">
              <button
                v-if="speechSupported && !sending"
                type="button"
                class="plan-agent__voice"
                :class="{ 'is-listening': voiceListening }"
                :aria-label="voiceListening ? '停止语音输入' : '语音输入'"
                :disabled="loading"
                data-haptic
                @click="toggleVoiceInput"
              >
                <Mic :size="19" aria-hidden="true" />
              </button>
              <button
                v-if="sending"
                type="button"
                class="plan-agent__stop"
                aria-label="停止生成"
                data-haptic
                @click="stopGeneration"
              >
                <Square :size="15" aria-hidden="true" />
              </button>
              <button
                v-else
                type="submit"
                :disabled="locked || (!draft.trim() && !attachment) || Boolean(loadError)"
                aria-label="发送消息"
                data-haptic
              >
                <ArrowUp :size="21" aria-hidden="true" />
              </button>
            </div>
          </form>
        </footer>
      </section>
    </Transition>

    <Transition name="coach-panel">
      <section v-show="activeTab === 'history'" id="coach-panel-history" class="plan-agent__panel" role="tabpanel" aria-labelledby="coach-tab-history" :inert="activeTab !== 'history'" :aria-hidden="activeTab !== 'history'">
        <div class="plan-agent__panel-content">
          <header class="plan-agent__panel-heading">
            <h2>历史对话</h2>
            <button class="plan-agent__new" type="button" :disabled="locked" data-haptic @click="startConversation">
              <SquarePen :size="17" aria-hidden="true" />
              新对话
            </button>
          </header>
          <p v-if="loading && !conversations.length" class="plan-agent__panel-state" role="status">正在加载对话…</p>
          <p v-else-if="loadError && !conversations.length" class="plan-agent__error" role="alert">{{ loadError }}</p>
          <p v-else-if="!conversations.length" class="plan-agent__panel-state">暂无历史对话。</p>
          <ul v-if="conversations.length" class="plan-agent__panel-list">
            <li v-for="item in conversations" :key="item.id" class="plan-agent__history-item">
              <button class="plan-agent__panel-row" type="button" :disabled="locked"
                :aria-current="item.id === activeId ? 'true' : undefined" data-haptic @click="switchConversation(item.id)">
                <MessageSquare :size="18" aria-hidden="true" />
                <span class="plan-agent__row-main">
                  <strong>{{ item.title }}</strong>
                  <time v-if="visibleDate(item.updatedAt)" :datetime="visibleDate(item.updatedAt)">{{ visibleDate(item.updatedAt) }}</time>
                </span>
                <span v-if="item.id === activeId" class="plan-agent__row-action">当前</span>
                <ChevronRight v-else :size="17" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="plan-agent__history-del"
                :class="{ 'is-confirm': confirmDeleteId === item.id }"
                :disabled="locked"
                :aria-label="confirmDeleteId === item.id ? '确认删除该对话' : '删除对话 ' + item.title"
                data-haptic
                @click.stop="requestDeleteConversation(item.id)"
              >
                <span v-if="confirmDeleteId === item.id">确认删除</span>
                <Trash2 v-else :size="16" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p v-if="historyError" class="plan-agent__error" role="alert">{{ historyError }}</p>
          <button v-if="loadError && !conversations.length" class="plan-agent__text-button" type="button" :disabled="locked" data-haptic @click="initialize">重试</button>
          <button v-if="conversationBefore" class="plan-agent__text-button" type="button" :disabled="locked" data-haptic @click="loadConversations">加载更早对话</button>
        </div>
      </section>
    </Transition>

    <Transition name="coach-panel">
      <section v-show="activeTab === 'files'" id="coach-panel-files" class="plan-agent__panel" role="tabpanel" aria-labelledby="coach-tab-files" :inert="activeTab !== 'files'" :aria-hidden="activeTab !== 'files'">
        <div class="plan-agent__panel-content">
          <header class="plan-agent__panel-heading">
            <h2>对话附件</h2>
          </header>
          <p v-if="loading && !messages.length" class="plan-agent__panel-state" role="status">正在加载附件…</p>
          <p v-else-if="loadError && !messages.length" class="plan-agent__error" role="alert">{{ loadError }}</p>
          <p v-else-if="!conversationAttachments.length" class="plan-agent__panel-state">{{ messageBefore ? '已加载的消息中暂无附件。' : '当前对话暂无附件。' }}</p>
          <ul v-if="conversationAttachments.length" class="plan-agent__panel-list">
            <li v-for="item in conversationAttachments" :key="item.id">
              <button class="plan-agent__panel-row" type="button" data-haptic @click="openAttachmentMessage(item.targetId)">
                <FileText :size="18" aria-hidden="true" />
                <span class="plan-agent__row-main">
                  <strong>{{ item.name }}</strong>
                  <time v-if="item.date" :datetime="item.date">{{ item.date }}</time>
                </span>
                <span class="plan-agent__row-action">{{ item.hasReply ? '查看分析' : '查看原消息' }}</span>
              </button>
            </li>
          </ul>
          <p v-if="filesError" class="plan-agent__error" role="alert">{{ filesError }}</p>
          <button v-if="loadError && !messages.length" class="plan-agent__text-button" type="button" :disabled="locked" data-haptic @click="initialize">重试</button>
          <button v-if="messageBefore" class="plan-agent__text-button" type="button" :disabled="locked" data-haptic @click="loadOlder('files')">查找更早附件</button>
        </div>
      </section>
    </Transition>

    <div ref="tabList" class="plan-agent__tabs" role="tablist" aria-label="AI 工作台" @keydown="navigateTabs">
      <button
        v-for="tab in tabs"
        :id="'coach-tab-' + tab.key"
        :key="tab.key"
        class="plan-agent__tab"
        type="button"
        role="tab"
        :aria-controls="'coach-panel-' + tab.key"
        :aria-selected="activeTab === tab.key"
        :tabindex="activeTab === tab.key ? 0 : -1"
        data-haptic
        @click="activeTab = tab.key"
      >
        <span class="plan-agent__tab-icon"><component :is="tab.icon" :size="19" aria-hidden="true" /></span>
        {{ tab.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, FileText,
  History, MessageCircle, MessageSquare, Mic, Paperclip, RotateCcw, Sparkles, Square, SquarePen, Trash2, X,
} from '@lucide/vue'
import MarkdownIt from 'markdown-it'
import CoachPlanDraft from '@/components/CoachPlanDraft.vue'
import CoachRevisionDraft from '@/components/CoachRevisionDraft.vue'
import CoachPreferences from '@/components/CoachPreferences.vue'
import CoachVisualCard from '@/components/CoachVisualCard.vue'
import UpcomingMarathonWidget from '@/components/UpcomingMarathonWidget.vue'
import {
  createCoachConversation, decideCoachAction, deleteCoachConversation, getCoachContextPulse,
  listCoachConversations, listCoachMessages, sendCoachMessage, streamCoachMessage,
} from '@/services/coachAgent'

const props = defineProps({ initialDraft: { type: String, default: '' } })
const markdown = new MarkdownIt({ html: false, breaks: true }).disable('image')
const renderReply = content => markdown.render(content || '')

const VISUAL_CARD_TYPES = new Set(['telemetry_card', 'recovery_card', 'trend_card', 'dossier_card'])

const fallbackStarters = [
  { tag: '能力画像', title: '全面评估我的中长跑水平', desc: '结合跑量、VO2max、阈值与全距离 PB', prompt: '结合我全部数据，客观评估一下我中长跑什么水平？' },
  { tag: 'IoT 遥测', title: '拆解长距离配速与心率漂移', desc: '逐公里分段、心率区间与有氧解耦', prompt: '帮我找到最长那次跑步，深度拆解分段配速、心率区间和有氧解耦' },
  { tag: '恢复监控', title: '看睡眠、HRV 与训练负荷', desc: '排查过度疲劳与恢复趋势', prompt: '看看我近期有记录的睡眠、HRV 和训练负荷状态怎么样，有没有练过头？' },
  { tag: '专属排课', title: '定制 4 周个性化进阶课表', desc: '按真实配速生成可审批课表卡片', prompt: '根据我现在的真实水平，帮我制定一份下周一开始的 4 周、每周二四六日训练的跑步进阶计划，直接出草案卡片给我确认' },
]

const tabs = [
  { key: 'chat', label: '对话', icon: MessageCircle },
  { key: 'history', label: '历史', icon: History },
  { key: 'files', label: '附件', icon: Paperclip },
]

function traceCards(message) {
  return (message.cards || []).filter(card => ['tool_status', 'evidence'].includes(card.type))
}

function toolStepCount(message) {
  const count = (message.cards || []).filter(card => card.type === 'tool_status').length
  return count || traceCards(message).length
}

function visualCards(message) {
  return (message.cards || []).filter(card => VISUAL_CARD_TYPES.has(card.type))
}

function replySource(message) {
  const { answerProvider, intentProvider, fallback, modelSteps } = message.meta || {}
  if (answerProvider === 'deepseek') {
    return modelSteps > 1 ? `DeepSeek · ${modelSteps} 步推演` : 'DeepSeek'
  }
  if (answerProvider === 'records') return '运动记录'
  if (answerProvider === 'knowledge') return '训练资料'
  if (answerProvider === 'rules') return fallback ? 'DeepSeek 暂时不可用 · 本地回复' : '本地回复'
  return intentProvider === 'deepseek' ? 'DeepSeek 识别目标' : ''
}

const contextPulse = ref(null)
const activeStarters = computed(() => contextPulse.value?.starters?.length ? contextPulse.value.starters : fallbackStarters)

const conversations = ref([])
const conversationBefore = ref(null)
const activeId = ref(null)
const messages = ref([])
const messageBefore = ref(null)
const draft = ref(props.initialDraft)
const pendingMessage = ref('')
const pendingAttachment = ref('')
const streamingText = ref('')
const streamingSteps = ref([])
const streamingCards = ref([])
const attachment = ref(null)
const attachmentPreviewUrl = ref('')
const attachmentInput = ref(null)
const profile = ref({ role: 'general', instructions: '' })
const loading = ref(true)
const sending = ref(false)
const loadError = ref('')
const operationError = ref('')
const historyError = ref('')
const filesError = ref('')
const thread = ref(null)
const activeTab = ref('chat')
const tabList = ref(null)
const highlightedMessageId = ref(null)
const copiedMessageId = ref(null)
const confirmDeleteId = ref(null)
const showScrollBottom = ref(false)
const voiceListening = ref(false)

const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null
const speechSupported = Boolean(SpeechRecognitionCtor)
let speechRecognizer = null
let activeAbortController = null

const conversationDrafts = new Map()
const pendingActions = reactive(new Set())
const actionErrors = reactive({})
const now = ref(Date.now())
const locked = computed(() => loading.value || sending.value || pendingActions.size > 0)
const lastAssistantId = computed(() => messages.value.findLast(message => message.role === 'assistant')?.id)
const conversationAttachments = computed(() => messages.value.flatMap((message, index) => {
  if (message.role !== 'user' || !message.attachment?.name) return []
  const next = messages.value[index + 1]
  const hasReply = next?.role === 'assistant'
  return [{
    id: message.id,
    targetId: hasReply ? next.id : message.id,
    hasReply,
    name: message.attachment.name,
    date: visibleDate(message.createdAt),
  }]
}).reverse())

let timer
let copyTimer
let deleteConfirmTimer
let pendingTurn
let scrollOnShow = false

function visibleDate(value) {
  return typeof value === 'string' ? value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '' : ''
}

function handleThreadScroll() {
  const view = thread.value
  if (!view) {
    showScrollBottom.value = false
    return
  }
  const distanceFromBottom = view.scrollHeight - view.scrollTop - view.clientHeight
  showScrollBottom.value = distanceFromBottom > 160
}

async function copyReply(message) {
  if (!message?.content) return
  try {
    await navigator.clipboard.writeText(message.content)
    copiedMessageId.value = message.id
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedMessageId.value = null }, 1800)
  } catch {
    operationError.value = '当前浏览器不支持剪贴板复制。'
  }
}

async function regenerateLastReply() {
  if (locked.value) return
  const lastUser = messages.value.findLast(message => message.role === 'user')
  if (!lastUser?.content) return
  pendingTurn = null
  await sendTurn(lastUser.content)
}

function stopGeneration() {
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
  }
}

function toggleVoiceInput() {
  if (!SpeechRecognitionCtor) return
  if (voiceListening.value) {
    speechRecognizer?.stop()
    voiceListening.value = false
    return
  }
  try {
    const rec = new SpeechRecognitionCtor()
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = false
    const baseText = draft.value ? draft.value + ' ' : ''
    rec.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0]?.transcript || ''
      }
      draft.value = (baseText + transcript).slice(0, 1000)
    }
    rec.onerror = () => {
      voiceListening.value = false
    }
    rec.onend = () => {
      voiceListening.value = false
      speechRecognizer = null
    }
    speechRecognizer = rec
    voiceListening.value = true
    rec.start()
  } catch {
    voiceListening.value = false
  }
}

async function focusTab(key) {
  activeTab.value = key
  await nextTick()
  tabList.value?.querySelector('#coach-tab-' + key)?.focus({ preventScroll: true })
}

function navigateTabs(event) {
  const index = tabs.findIndex(tab => tab.key === activeTab.value)
  const next = {
    ArrowLeft: (index + tabs.length - 1) % tabs.length,
    ArrowRight: (index + 1) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }[event.key]
  if (!Number.isInteger(next)) return
  event.preventDefault()
  void focusTab(tabs[next].key)
}

async function openAttachmentMessage(id) {
  scrollOnShow = false
  activeTab.value = 'chat'
  highlightedMessageId.value = id
  await nextTick()
  const container = thread.value
  const message = container?.querySelector('#coach-message-' + id)
  if (!message) {
    void focusTab('chat')
    return
  }
  container.scrollTop += message.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
  message.focus({ preventScroll: true })
}

function newMessageId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

function friendly(error, fallback) {
  if (error.status === 429) return '请求较多，请等一会儿再试。'
  if (error.code === 'AGENT_NOT_FOUND') return '该对话或草案已不可用，请重新加载。'
  if (error.status === 413) return '单个附件不能超过 8 MB。'
  if (['INVALID_AGENT_ATTACHMENT', 'AGENT_ATTACHMENT_NO_TEXT', 'AGENT_ATTACHMENT_PARSE_TIMEOUT', 'AI_ATTACHMENT_ANALYSIS_INVALID'].includes(error.code)) return error.message
  if (error.code === 'AI_PROVIDER_UNAVAILABLE') return '在线分析暂时不可用，附件已保留，可稍后重试。'
  return fallback
}

function revokePreview() {
  if (attachmentPreviewUrl.value) {
    URL.revokeObjectURL(attachmentPreviewUrl.value)
    attachmentPreviewUrl.value = ''
  }
}

function clearAttachment() {
  revokePreview()
  attachment.value = null
}

function selectAttachment(event) {
  const [file] = event.target.files || []
  event.target.value = ''
  if (!file) return
  operationError.value = ''
  if (!/\.(?:md|markdown|txt|pdf|jpe?g|png|gif|webp)$/i.test(file.name)) {
    operationError.value = '请选择图片、Markdown、文本或 PDF 文件。'
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    operationError.value = '单个附件不能超过 8 MB。'
    return
  }
  revokePreview()
  attachment.value = file
  if (/^image\//.test(file.type)) {
    attachmentPreviewUrl.value = URL.createObjectURL(file)
  }
}

async function scrollToLatest(smooth = false) {
  if (activeTab.value !== 'chat') {
    scrollOnShow = true
    return
  }
  scrollOnShow = false
  await nextTick()
  if (thread.value) {
    if (smooth && typeof thread.value.scrollTo === 'function') {
      thread.value.scrollTo({ top: thread.value.scrollHeight, behavior: 'smooth' })
    } else {
      thread.value.scrollTop = thread.value.scrollHeight
    }
    showScrollBottom.value = false
  }
}

async function loadPulse() {
  try {
    contextPulse.value = await getCoachContextPulse()
  } catch {
    // Non-blocking welcome enhancement
  }
}

async function getConversations(before) {
  const result = await listCoachConversations(before)
  conversations.value = before ? [...conversations.value, ...result.conversations] : result.conversations
  conversationBefore.value = result.nextBefore
}

async function loadConversation(id) {
  const data = await listCoachMessages(id)
  activeId.value = id
  messages.value = data.messages
  messageBefore.value = data.nextBefore
  await scrollToLatest()
}

async function initialize() {
  loading.value = true
  loadError.value = ''
  void loadPulse()
  try {
    await getConversations()
    const target = conversations.value.some(item => item.id === activeId.value)
      ? activeId.value : conversations.value[0]?.id
    if (target) await loadConversation(target)
  } catch (error) {
    loadError.value = friendly(error, '暂时无法加载对话，请重试。')
  } finally {
    loading.value = false
  }
}

async function loadConversations() {
  if (locked.value) return
  loading.value = true
  historyError.value = ''
  try {
    await getConversations(conversationBefore.value)
  } catch (error) {
    historyError.value = friendly(error, '暂时无法加载更早的对话。')
  } finally {
    loading.value = false
  }
}

async function requestDeleteConversation(id) {
  if (locked.value) return
  if (confirmDeleteId.value !== id) {
    confirmDeleteId.value = id
    clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = setTimeout(() => { confirmDeleteId.value = null }, 3500)
    return
  }
  confirmDeleteId.value = null
  historyError.value = ''
  try {
    await deleteCoachConversation(id)
    conversations.value = conversations.value.filter(item => item.id !== id)
    conversationDrafts.delete(id)
    if (activeId.value === id) {
      activeId.value = null
      messages.value = []
      messageBefore.value = null
      if (conversations.value.length) await loadConversation(conversations.value[0].id)
    }
  } catch (error) {
    historyError.value = friendly(error, '暂时无法删除该对话，请重试。')
  }
}

async function switchConversation(id) {
  if (locked.value) return
  historyError.value = ''
  confirmDeleteId.value = null
  if (id === activeId.value) {
    void focusTab('chat')
    return
  }
  saveDraft()
  loading.value = true
  try {
    await loadConversation(id)
    restoreDraft()
    loadError.value = ''
    operationError.value = ''
    filesError.value = ''
    highlightedMessageId.value = null
    await focusTab('chat')
  } catch (error) {
    historyError.value = friendly(error, '无法打开该对话，请重试。')
  } finally {
    loading.value = false
  }
}

async function addConversation() {
  const conversation = await createCoachConversation()
  conversationDrafts.delete(null)
  conversations.value = [conversation, ...conversations.value]
  activeId.value = conversation.id
  messages.value = []
  messageBefore.value = null
  pendingTurn = null
}

function startConversation() {
  if (locked.value) return
  confirmDeleteId.value = null
  if (activeId.value != null) {
    saveDraft()
    activeId.value = null
    messages.value = []
    messageBefore.value = null
    restoreDraft()
  }
  historyError.value = ''
  filesError.value = ''
  loadError.value = ''
  operationError.value = ''
  highlightedMessageId.value = null
  showScrollBottom.value = false
  void loadPulse()
  void focusTab('chat').then(() => {
    if (thread.value) thread.value.scrollTop = 0
  })
}

function saveDraft() {
  if (draft.value || attachment.value || pendingTurn) {
    conversationDrafts.set(activeId.value, { text: draft.value, file: attachment.value, turn: pendingTurn })
  } else {
    conversationDrafts.delete(activeId.value)
  }
}

function restoreDraft() {
  const saved = conversationDrafts.get(activeId.value)
  draft.value = saved?.text || ''
  clearAttachment()
  if (saved?.file) {
    attachment.value = saved.file
    if (/^image\//.test(saved.file.type)) {
      attachmentPreviewUrl.value = URL.createObjectURL(saved.file)
    }
  }
  pendingTurn = saved?.turn
  conversationDrafts.delete(activeId.value)
}

async function loadOlder(from) {
  if (locked.value || !messageBefore.value) return
  loading.value = true
  const errorMessage = from === 'files' ? filesError : operationError
  errorMessage.value = ''
  const beforeHeight = from === 'chat' ? thread.value?.scrollHeight || 0 : 0
  const beforeTop = from === 'chat' ? thread.value?.scrollTop || 0 : 0
  try {
    const data = await listCoachMessages(activeId.value, messageBefore.value)
    messages.value = [...data.messages, ...messages.value]
    messageBefore.value = data.nextBefore
    await nextTick()
    if (from === 'chat' && activeTab.value === 'chat' && thread.value) {
      thread.value.scrollTop = beforeTop + thread.value.scrollHeight - beforeHeight
    }
  } catch (error) {
    errorMessage.value = friendly(error, '暂时无法加载更早的消息。')
  } finally {
    loading.value = false
  }
}

async function submit() {
  const text = draft.value.trim()
  const file = attachment.value
  if ((!text && !file) || locked.value || loadError.value) return
  if (voiceListening.value) toggleVoiceInput()
  draft.value = ''
  const sent = await sendTurn(text || '请分析这个附件。', file)
  if (sent) clearAttachment()
  else if (!draft.value) draft.value = text
}

function submitFromKeyboard(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}

async function sendTurn(text, file = null) {
  if (!text || locked.value || loadError.value) return false
  sending.value = true
  pendingMessage.value = text
  pendingAttachment.value = file?.name || ''
  streamingText.value = ''
  streamingSteps.value = []
  streamingCards.value = []
  operationError.value = ''
  void scrollToLatest()
  activeAbortController = new AbortController()
  try {
    if (!activeId.value) await addConversation()
    const currentProfile = { ...profile.value }
    if (pendingTurn?.message !== text || pendingTurn?.conversationId !== activeId.value || pendingTurn?.attachment !== file ||
        pendingTurn?.profile.role !== currentProfile.role || pendingTurn?.profile.instructions !== currentProfile.instructions) {
      pendingTurn = { message: text, clientMessageId: newMessageId(), conversationId: activeId.value, attachment: file, profile: currentProfile }
    }

    const followScrollIfNearBottom = () => {
      const view = thread.value
      if (!view || view.scrollHeight - view.scrollTop - view.clientHeight <= 96) {
        void scrollToLatest()
      }
    }

    const handleStatus = (event) => {
      if (event.phase === 'thinking') {
        if (!streamingSteps.value.length) {
          streamingSteps.value = [{ tool: 'thinking', text: event.label || '正在思考…', done: false }]
        }
      } else if (event.phase === 'tool_start') {
        streamingSteps.value = [
          ...streamingSteps.value.filter(item => item.tool !== 'thinking'),
          { tool: event.tool, text: event.label || `正在查询 ${event.tool}…`, done: false },
        ]
      } else if (event.phase === 'tool_done') {
        const index = streamingSteps.value.findIndex(item => item.tool === event.tool && !item.done)
        if (index >= 0) {
          const updated = [...streamingSteps.value]
          updated[index] = { ...updated[index], text: event.summary || updated[index].text, done: true }
          streamingSteps.value = updated
        } else {
          streamingSteps.value = [
            ...streamingSteps.value.filter(item => item.tool !== 'thinking'),
            { tool: event.tool, text: event.summary || '已完成查询', done: true },
          ]
        }
      }
      followScrollIfNearBottom()
    }

    const handleCard = (card) => {
      if (VISUAL_CARD_TYPES.has(card?.type) && streamingCards.value.length < 2) {
        if (!streamingCards.value.some(c => c.type === card.type && c.activityId === card.activityId)) {
          streamingCards.value = [...streamingCards.value, card]
          followScrollIfNearBottom()
        }
      }
    }

    const handleDelta = (chunk) => {
      if (!chunk) return
      if (streamingSteps.value.some(item => item.tool === 'thinking' && !item.done)) {
        streamingSteps.value = streamingSteps.value.filter(item => item.tool !== 'thinking')
      }
      streamingText.value += chunk
      followScrollIfNearBottom()
    }

    let responseData
    try {
      responseData = await streamCoachMessage(activeId.value, pendingTurn, {
        onStatus: handleStatus,
        onDelta: handleDelta,
        onCard: handleCard,
        signal: activeAbortController.signal,
      })
    } catch (streamError) {
      if (streamError?.name === 'AbortError') {
        // User clicked Stop; reload conversation cleanly in case partial turn persisted, or keep UI clean.
        pendingTurn = null
        return true
      }
      if (!streamingText.value && (!streamError.status || streamError.status === 404)) {
        responseData = await sendCoachMessage(activeId.value, pendingTurn)
      } else {
        throw streamError
      }
    }

    const { messages: turn = [] } = responseData || {}
    const view = thread.value
    const follow = !view || view.scrollHeight - view.scrollTop - view.clientHeight <= 96
    const onlyNew = turn.filter(message => !messages.value.some(existing => existing.id === message.id))
    messages.value = [...messages.value, ...onlyNew]
    const conversation = conversations.value.find(item => item.id === activeId.value)
    if (conversation && ['训练计划对话', '新对话'].includes(conversation.title)) conversation.title = Array.from(text).slice(0, 40).join('')
    pendingTurn = null
    pendingMessage.value = ''
    streamingText.value = ''
    streamingSteps.value = []
    streamingCards.value = []
    if (follow) await scrollToLatest()
    return true
  } catch (error) {
    operationError.value = friendly(error, '未能读取本次结果。可以保留输入并重试。')
    return false
  } finally {
    activeAbortController = null
    pendingMessage.value = ''
    pendingAttachment.value = ''
    streamingText.value = ''
    streamingSteps.value = []
    streamingCards.value = []
    sending.value = false
  }
}

async function changeAction(id, decision) {
  if (pendingActions.has(id)) return
  pendingActions.add(id)
  delete actionErrors[id]
  try {
    const action = await decideCoachAction(id, decision)
    for (const message of messages.value) {
      const card = message.cards.find(item => item.action?.id === id)
      if (card) card.action = action
    }
    void loadPulse()
  } catch (error) {
    actionErrors[id] = friendly(error, '暂时无法确认操作结果，请重试。')
  } finally {
    pendingActions.delete(id)
  }
}

watch(() => props.initialDraft, (text) => {
  if (text) {
    draft.value = text
    activeTab.value = 'chat'
  }
})

watch(activeTab, tab => {
  if (tab === 'chat' && scrollOnShow) void scrollToLatest()
})

onMounted(() => {
  initialize()
  timer = setInterval(() => { now.value = Date.now() }, 10_000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(copyTimer)
  clearTimeout(deleteConfirmTimer)
  revokePreview()
  stopGeneration()
  speechRecognizer?.stop()
})
</script>

<style scoped>
.plan-agent {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  flex: 1;
  min-width: 0;
  min-height: 0;
  color: var(--text);
}

.plan-agent__chat {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

.plan-agent > :is(.plan-agent__chat, .plan-agent__panel) {
  grid-area: 1 / 1;
}

.plan-agent__thread {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
}

.plan-agent__thread::-webkit-scrollbar,
.plan-agent__panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.plan-agent__messages {
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(100%, 700px);
  margin: 0 auto;
  padding: 22px clamp(16px, 4.5vw, 28px) 26px;
  box-sizing: border-box;
}

.plan-agent__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  gap: 10px;
  min-height: 100%;
  padding: 28px clamp(16px, 4.5vw, 28px) 22px;
  box-sizing: border-box;
  color: var(--muted);
  text-align: center;
}

.plan-agent__empty h2 {
  margin: 8px 0 0;
  color: var(--text);
  font-size: clamp(24px, 5.5vw, 30px);
  font-weight: 600;
  line-height: 1.22;
  letter-spacing: -0.025em;
}

.plan-agent__welcome-sub {
  margin: 0;
  max-width: min(100%, 42ch);
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
  text-wrap: balance;
}

.plan-agent__mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.08);
}

/* Athlete Telemetry Pulse Strip — symmetric 2×2 on mobile, single row on desktop */
.plan-agent__pulse-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, max-content));
  justify-content: center;
  gap: 8px;
  width: min(100%, 360px);
  margin-top: 8px;
}

.plan-agent__pulse-pill {
  justify-content: center;
}

@media (min-width: 680px) {
  .plan-agent__pulse-strip {
    display: flex;
    flex-wrap: wrap;
    width: min(100%, 580px);
  }
}

.plan-agent__pulse-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: transform 120ms ease, background-color 140ms ease;
}

.plan-agent__pulse-pill:hover:not(:disabled) {
  background: var(--workspace-bubble);
}

.plan-agent__pulse-pill:active:not(:disabled) { transform: scale(.96); }
.plan-agent__pulse-label { color: var(--muted); font-size: 11.5px; font-weight: 450; }
.plan-agent__pulse-pill strong { font-weight: 620; }
.plan-agent__pulse-pill.is-emerald strong { color: var(--green-strong); }
.plan-agent__pulse-pill.is-blue strong { color: var(--app-blue, #007aff); }
.plan-agent__pulse-pill.is-amber strong { color: #d97706; }

/* Apple Inset-Grouped / Meta Muse Suggestion List — replaces stacked card wall */
.plan-agent__starters {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  width: min(100%, 540px);
  margin-top: 14px;
  border-radius: 20px;
  background: var(--panel-soft);
  overflow: hidden;
  text-align: left;
}

.plan-agent__starter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px;
  border: 0;
  border-bottom: 0.5px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 140ms ease;
}

.plan-agent__starter:last-child { border-bottom: 0; }

.plan-agent__starter:hover:not(:disabled) {
  background: color-mix(in srgb, var(--workspace-bubble) 70%, transparent);
}

.plan-agent__starter:active:not(:disabled) {
  background: var(--workspace-bubble);
}

.plan-agent__starter-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.plan-agent__starter strong {
  font-size: 14px;
  font-weight: 560;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.plan-agent__starter-copy > span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.38;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-agent__starter-chevron {
  flex: none;
  color: var(--faint);
  transition: transform 140ms ease, color 140ms ease;
}

.plan-agent__starter:hover:not(:disabled) .plan-agent__starter-chevron {
  transform: translateX(2px);
  color: var(--green-strong);
}

/* Messages & Editorial Typography */
.agent-message {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-self: stretch;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.75;
  font-variant-numeric: tabular-nums;
}

.agent-message.user {
  align-self: end;
  max-width: 86%;
}

.agent-message.is-attachment-target {
  border-radius: 8px;
  outline: 2px solid var(--green-strong);
  outline-offset: 5px;
}

.agent-message__bubble {
  margin: 0;
  padding: 10px 16px;
  border-radius: 20px 20px 6px 20px;
  background: var(--workspace-bubble);
  white-space: pre-wrap;
  line-height: 1.6;
}

.agent-visuals {
  display: grid;
  gap: 10px;
}

.agent-message__answer { min-width: 0; }
.agent-message__answer :deep(> :first-child) { margin-top: 0; }
.agent-message__answer :deep(> :last-child) { margin-bottom: 0; }
.agent-message__answer :deep(p) { margin-block: 0 11px; }
.agent-message__answer :deep(h1),
.agent-message__answer :deep(h2),
.agent-message__answer :deep(h3) {
  margin-block: 16px 6px;
  font-weight: 760;
  letter-spacing: -.015em;
  line-height: 1.35;
}
.agent-message__answer :deep(h1) { font-size: 1.2em; }
.agent-message__answer :deep(h2) { font-size: 1.1em; }
.agent-message__answer :deep(h3) { font-size: 1.02em; }
.agent-message__answer :deep(hr) { border: 0; border-top: 1px solid var(--border); margin: 14px 0; }
.agent-message__answer :deep(ol),
.agent-message__answer :deep(ul) { padding-inline-start: 1.45em; margin-block: 0 10px; }
.agent-message__answer :deep(li + li) { margin-top: 4px; }
.agent-message__answer :deep(pre) {
  display: block;
  max-width: 100%;
  overflow: auto;
  background: var(--panel-soft);
  padding: 10px 13px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 13px;
}
.agent-message__answer :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: separate;
  border-spacing: 0;
  margin: 10px 0 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 13.5px;
}
.agent-message__answer :deep(th) {
  background: var(--panel-soft);
  font-weight: 700;
  text-align: left;
  padding: 7px 11px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.agent-message__answer :deep(td) {
  padding: 6px 11px;
  border-bottom: 1px solid var(--border);
}
.agent-message__answer :deep(tr:last-child td) { border-bottom: 0; }
.agent-message__answer :deep(blockquote) {
  margin: 10px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--green-strong);
  border-radius: 0 8px 8px 0;
  background: var(--panel-soft);
  color: var(--muted);
}
.agent-message__answer :deep(a) { text-decoration: underline; color: var(--green-strong); }

/* Collapsible Tool Trace Pill (Gemini/Apple minimal) */
.agent-evidence {
  width: fit-content;
  max-width: 100%;
  border: 0;
  border-radius: 14px;
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 12px;
}

.agent-evidence summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 12px;
  color: var(--muted);
  font-weight: 540;
  cursor: pointer;
  list-style: none;
}

.agent-evidence summary::-webkit-details-marker { display: none; }
.agent-evidence summary > svg:first-child { color: var(--green-strong); flex-shrink: 0; }
.agent-evidence__chevron { transition: transform 150ms ease; color: var(--muted); }
.agent-evidence[open] .agent-evidence__chevron { transform: rotate(180deg); }

.agent-evidence__body {
  display: grid;
  gap: 4px;
  padding: 2px 12px 10px;
  border-top: 1px solid var(--border);
}

.agent-evidence ul { margin: 4px 0; padding: 0; list-style: none; }
.agent-evidence li + li { margin-top: 4px; }
.agent-evidence p { margin: 3px 0; }
.agent-evidence__demo { display: block; font-weight: 700; }
.agent-step { display: flex; align-items: flex-start; gap: 6px; line-height: 1.45; }
.agent-step svg { margin-top: 3px; flex-shrink: 0; color: var(--green-strong); }

/* Action Bar (Copy, Regenerate, Provider) */
.agent-message__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: -2px;
}

.agent-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.agent-action-btn:hover {
  background: var(--workspace-bubble);
  color: var(--text);
}

.agent-message__source {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

/* 1-Tap Follow-Up Chips */
.agent-followups {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 2px;
}

.agent-followup-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 580;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease, transform 120ms ease;
}

.agent-followup-chip svg { color: var(--green-strong); flex-shrink: 0; }
.agent-followup-chip:hover:not(:disabled) {
  border-color: var(--green-strong);
  background: var(--workspace-bubble);
}
.agent-followup-chip:active:not(:disabled) { transform: scale(.97); }

/* Live Streaming Trace & Caret */
.agent-live-trace {
  display: grid;
  gap: 5px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-soft);
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--muted);
}

.agent-live-step {
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 180ms ease;
}

.agent-live-step.is-done { color: var(--text); }
.agent-live-step.is-done svg { flex-shrink: 0; color: var(--green-strong); }

.agent-live-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin: 0 3px;
  border-radius: 50%;
  background: var(--green-strong);
  animation: coach-pulse 1100ms ease-in-out infinite;
}

.agent-message__answer--streaming :deep(> :last-child)::after {
  content: '▎';
  margin-left: 2px;
  color: var(--green-strong);
  animation: coach-caret 900ms steps(1) infinite;
}

@keyframes coach-pulse {
  0%, 100% { opacity: .35; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

@keyframes coach-caret {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.plan-agent__text-button {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--green-strong);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.agent-clarification { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 13px; }
.plan-agent__older { align-self: center; font-size: 13px; }

.plan-agent__typing {
  display: flex;
  gap: 5px;
  width: fit-content;
  padding: 6px 1px;
}

.plan-agent__typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  animation: coach-thinking 1050ms ease-in-out infinite;
}

.plan-agent__typing span:nth-child(2) { animation-delay: 130ms; }
.plan-agent__typing span:nth-child(3) { animation-delay: 260ms; }

@keyframes coach-thinking {
  0%, 75%, 100% { opacity: .35; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-2px); }
}

/* Footer, Scroll-to-bottom FAB & Composer */
.plan-agent__footer {
  position: relative;
  width: min(100%, 700px);
  margin: 0 auto;
  padding: 8px clamp(14px, 4vw, 28px) 10px;
}

.plan-agent__scroll-bottom {
  position: absolute;
  left: 50%;
  top: -42px;
  transform: translateX(-50%);
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 4px 14px rgb(15 23 42 / .12);
  cursor: pointer;
  z-index: 4;
}

.coach-fab-enter-active,
.coach-fab-leave-active { transition: opacity 150ms ease, transform 150ms ease; }
.coach-fab-enter-from,
.coach-fab-leave-to { opacity: 0; transform: translate(-50%, 6px); }

.plan-agent__composer {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px;
  padding: 6px 6px 6px 8px;
  border: 1px solid var(--border);
  border-radius: 28px;
  background: var(--panel);
  box-shadow: 0 4px 20px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.03);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.plan-agent__composer:focus-within {
  border-color: color-mix(in srgb, var(--app-green) 48%, var(--border));
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.08), 0 0 0 3px color-mix(in srgb, var(--app-green) 10%, transparent);
}

.plan-agent__composer textarea {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  max-height: 7em;
  padding: 10px 2px;
  field-sizing: content;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 16px;
  line-height: 1.5;
  resize: none;
}

.plan-agent__composer textarea::placeholder { color: var(--muted); }

.plan-agent__composer-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.plan-agent__composer button[type="submit"],
.plan-agent__composer .plan-agent__attach,
.plan-agent__voice,
.plan-agent__stop {
  display: grid;
  width: 44px;
  min-height: 44px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 100ms ease, background-color 120ms ease, color 120ms ease;
}

.plan-agent__composer button[type="submit"] {
  color: #b5fb81;
  background: #111216;
}

.plan-agent__stop {
  color: #fff;
  background: #111216;
}

.plan-agent__voice {
  width: 40px;
  background: transparent;
  color: var(--muted);
}

.plan-agent__voice.is-listening {
  color: #fff;
  background: var(--green-strong);
  animation: coach-pulse 1100ms ease-in-out infinite;
}

.plan-agent__composer button:not(:disabled):active { transform: scale(.94); }
.plan-agent__composer button[type="submit"]:disabled {
  background: var(--panel-soft);
  color: var(--muted);
  cursor: default;
}

.plan-agent__composer .plan-agent__attach {
  width: 40px;
  background: transparent;
  color: var(--muted);
}

.plan-agent__attachment,
.agent-message__attachment {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.plan-agent__attachment {
  grid-column: 1 / -1;
  padding: 4px 6px 4px 10px;
  border-radius: 14px;
  background: var(--workspace-bubble);
  font-size: 13px;
}

.plan-agent__attachment-thumb {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.agent-message__attachment {
  margin-bottom: .4em;
  font-size: .84em;
  color: var(--muted);
}

.plan-agent__attachment span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-agent__attachment button {
  display: grid;
  place-items: center;
  min-width: 36px;
  min-height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text);
}

.plan-agent__error {
  margin: 0 0 6px;
  color: var(--danger, #b42318);
  font-size: 13px;
}

/* History & Files Panels */
.plan-agent__panel {
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.plan-agent__panel-content {
  width: min(100%, 700px);
  margin: 0 auto;
  padding: 24px clamp(14px, 4vw, 28px) 18px;
}

.plan-agent__panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.plan-agent__panel-heading h2 {
  margin: 0;
  font-size: clamp(20px, 5vw, 25px);
  font-weight: 750;
  letter-spacing: -.025em;
}

.plan-agent__new {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.plan-agent__panel-state {
  margin: 0;
  padding: 16px 0;
  color: var(--muted);
  font-size: 14px;
}

.plan-agent__panel-list {
  margin: 0 0 5px;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border);
}

.plan-agent__history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.plan-agent__history-item .plan-agent__panel-row {
  border-bottom: 0;
}

.plan-agent__history-del {
  display: inline-grid;
  place-items: center;
  min-width: 40px;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.plan-agent__history-del:hover:not(:disabled) {
  background: var(--workspace-bubble);
  color: var(--red, #b42318);
}

.plan-agent__history-del.is-confirm {
  background: var(--red-soft, #fdecec);
  color: #be123c;
}

.plan-agent__panel-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.plan-agent__panel-row[aria-current="true"] { background: var(--workspace-bubble); }
.plan-agent__panel-row:not(:disabled):hover,
.plan-agent__new:not(:disabled):hover { background: var(--workspace-bubble); }
.plan-agent__panel-row > svg,
.plan-agent__new > svg { color: var(--green-strong); }
.plan-agent__panel-row:disabled,
.plan-agent__new:disabled { opacity: .6; }

.plan-agent__row-main { display: grid; min-width: 0; gap: 3px; }
.plan-agent__row-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 630; }
.plan-agent__row-main time,
.plan-agent__row-action { color: var(--muted); font-size: 12px; }
.plan-agent__row-action { white-space: nowrap; }

/* Bottom Tabs — Frosted Apple hairline chrome */
.plan-agent__tabs {
  display: grid;
  grid-area: 2 / 1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 6px clamp(12px, 5vw, 32px) calc(6px + var(--safe-bottom));
  border-top: 0.5px solid var(--border);
  background: color-mix(in srgb, var(--workspace-surface) 88%, transparent);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}

.plan-agent__tab {
  display: grid;
  min-width: 0;
  min-height: 46px;
  place-content: center;
  justify-items: center;
  gap: 1px;
  padding: 2px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.plan-agent__tab-icon {
  display: grid;
  width: 43px;
  height: 25px;
  place-items: center;
  border-radius: 20px;
  transition: background-color 140ms ease, transform 140ms ease;
}

.plan-agent__tab[aria-selected="true"] { color: var(--text); font-weight: 720; }
.plan-agent__tab[aria-selected="true"] .plan-agent__tab-icon,
.plan-agent__tab:hover .plan-agent__tab-icon { background: var(--workspace-bubble); color: var(--green-strong); }
.plan-agent__tab:active .plan-agent__tab-icon { transform: scale(.91); }

.plan-agent__tab:focus-visible,
.plan-agent__panel-row:focus-visible,
.plan-agent__new:focus-visible {
  outline: 2px solid var(--green-strong);
  outline-offset: -2px;
}

.coach-panel-enter-active {
  z-index: 1;
  transition: opacity 150ms ease-out, transform 170ms cubic-bezier(.2, .75, .24, 1);
}
.coach-panel-leave-active { transition: opacity 105ms ease-in, transform 105ms ease-in; }
.coach-panel-enter-from { transform: translateY(5px); opacity: 0; }
.coach-panel-leave-to { transform: translateY(-3px); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .plan-agent__typing span,
  .agent-live-dot,
  .agent-message__answer--streaming :deep(> :last-child)::after,
  .plan-agent__voice.is-listening { animation: none; }
  .plan-agent__tab-icon,
  .coach-panel-enter-active,
  .coach-panel-leave-active { transition: none; }
}
</style>
