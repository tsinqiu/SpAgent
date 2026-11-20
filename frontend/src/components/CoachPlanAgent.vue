<template>
  <div class="plan-agent">
    <div class="plan-agent__toolbar">
      <select v-if="conversations.length" :value="activeId" :disabled="locked" aria-label="训练计划对话" @change="switchConversation">
        <option v-for="item in conversations" :key="item.id" :value="item.id">{{ item.title }}</option>
      </select>
      <button v-if="conversationBefore" type="button" :disabled="locked" @click="loadConversations">更早对话</button>
      <button type="button" :disabled="locked" @click="startConversation">新对话</button>
    </div>
    <RouterLink class="plan-agent__preferences" :to="{ name: 'training-preferences', query: { from: 'coach' } }">
      训练偏好设置
    </RouterLink>
    <button v-if="weeklyReviewWeek" class="plan-agent__weekly-preview" type="button" :disabled="locked || Boolean(loadError)" @click="previewWeeklyReview">
      生成周报调整预览
    </button>

    <StateBlock v-if="loading && !messages.length" title="正在加载对话" message="正在读取计划草案与审批状态。" />
    <StateBlock v-else-if="loadError" title="对话加载失败" :message="loadError" action-label="重试" tone="danger" @action="initialize" />
    <div v-else-if="messages.length || pendingMessage" ref="thread" class="plan-agent__thread" aria-label="训练计划对话内容">
      <button v-if="messageBefore" type="button" :disabled="locked" class="plan-agent__older" @click="loadOlder">加载更早消息</button>
      <article v-for="message in messages" :key="message.id" class="agent-message" :class="message.role">
        <small>{{ message.role === 'user' ? '你' : '教练' }}</small>
        <p>{{ message.content }}</p>
        <template v-for="(card, index) in message.cards" :key="index">
          <p v-if="card.type === 'tool_status'" class="agent-step"><Check :size="15" aria-hidden="true" />{{ card.summary }}</p>
          <div v-else-if="card.type === 'clarification' && lastAssistantId === message.id && Date.parse(card.expiresAt) > now" class="agent-clarification">
            <button v-for="choice in card.choices" :key="choice.message" type="button" :disabled="locked" @click="sendTurn(choice.message)">{{ choice.label }}</button>
          </div>
          <details v-else-if="card.type === 'evidence'" class="agent-evidence" open>
            <summary>训练依据 · {{ card.mode }}</summary>
            <ul>
              <li v-for="window in card.windows" :key="window.days">
                <strong>近 {{ window.days }} 天</strong>
                {{ window.startDate }} 至 {{ window.endDate }} · {{ window.runs }} 条跑步
                <span v-if="window.latestRun"> · 最近 {{ window.latestRun }}</span>
                <span v-if="window.durationS != null"> · 合计 {{ Math.round(window.durationS / 60) }} 分钟</span>
                <span v-if="window.demo" class="agent-evidence__demo">含合成演示数据</span>
              </li>
            </ul>
            <p v-if="card.missing.length">缺失数据　{{ card.missing.join('、') }}</p>
            <p v-for="note in card.assumptions" :key="note">{{ note }}</p>
            <small>规则 {{ card.ruleVersion }} · {{ message.meta?.intentProvider === 'deepseek' ? '模型识别目标' : '本地识别目标' }}</small>
          </details>
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
      </article>
      <article v-if="pendingMessage" class="agent-message user">
        <small>你</small>
        <p>{{ pendingMessage }}</p>
      </article>
      <p v-if="pendingMessage" class="plan-agent__status" role="status">正在理解目标并查询训练数据…</p>
    </div>
    <div v-else class="plan-agent__empty">
      <p>告诉我跑步目标和每周有空的日期，我会先给你一份四周草案。</p>
      <button type="button" :disabled="locked" @click="useExample">用首次 5 公里示例</button>
    </div>

    <p class="soft-note">启用线上识别时，DeepSeek 只接收本轮输入。运动和恢复数据由服务端查询。</p>
    <form class="plan-agent__composer" @submit.prevent="submit">
      <textarea
        v-model.trim="draft"
        rows="2"
        maxlength="1000"
        aria-label="训练目标"
        placeholder="例如每周二、四跑步，或把本周四的训练移到周五"
        @keydown.enter.exact="submitFromKeyboard"
      ></textarea>
      <button type="submit" :disabled="locked || !draft || Boolean(loadError)" aria-label="发送训练目标"><Send :size="18" /></button>
    </form>
    <p v-if="operationError" class="plan-agent__error" role="alert">{{ operationError }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Check, Send } from '@lucide/vue'
import CoachPlanDraft from '@/components/CoachPlanDraft.vue'
import CoachRevisionDraft from '@/components/CoachRevisionDraft.vue'
import StateBlock from '@/components/StateBlock.vue'
import {
  createCoachConversation, decideCoachAction, listCoachConversations, listCoachMessages, sendCoachMessage,
} from '@/services/coachAgent'

const props = defineProps({ weeklyReviewWeek: { type: String, default: '' } })

const conversations = ref([])
const conversationBefore = ref(null)
const activeId = ref(null)
const messages = ref([])
const messageBefore = ref(null)
const draft = ref('')
const pendingMessage = ref('')
const loading = ref(true)
const sending = ref(false)
const loadError = ref('')
const operationError = ref('')
const thread = ref(null)
const pendingActions = reactive(new Set())
const actionErrors = reactive({})
const now = ref(Date.now())
const locked = computed(() => loading.value || sending.value || pendingActions.size > 0)
const lastAssistantId = computed(() => messages.value.findLast(message => message.role === 'assistant')?.id)
let timer
let pendingTurn

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
  return fallback
}

async function scrollToLatest() {
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
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
  try {
    await getConversations()
    const target = conversations.value.some(item => item.id === activeId.value)
      ? activeId.value : conversations.value[0]?.id
    if (target) await loadConversation(target)
  } catch (error) {
    loadError.value = friendly(error, '暂时无法加载计划对话，请重试。')
  } finally {
    loading.value = false
  }
}

async function loadConversations() {
  loading.value = true
  operationError.value = ''
  try {
    await getConversations(conversationBefore.value)
  } catch (error) {
    operationError.value = friendly(error, '暂时无法加载更早的对话。')
  } finally {
    loading.value = false
  }
}

async function switchConversation(event) {
  loading.value = true
  operationError.value = ''
  try {
    await loadConversation(Number(event.target.value))
    pendingTurn = null
  } catch (error) {
    event.target.value = activeId.value
    operationError.value = friendly(error, '无法打开该对话，请重试。')
  } finally {
    loading.value = false
  }
}

async function addConversation() {
  const conversation = await createCoachConversation()
  conversations.value = [conversation, ...conversations.value]
  activeId.value = conversation.id
  messages.value = []
  messageBefore.value = null
  pendingTurn = null
}

async function startConversation() {
  if (locked.value) return
  loading.value = true
  operationError.value = ''
  try {
    await addConversation()
    loadError.value = ''
  } catch (error) {
    operationError.value = friendly(error, '无法创建新对话，请重试。')
  } finally {
    loading.value = false
  }
}

async function loadOlder() {
  loading.value = true
  operationError.value = ''
  const beforeHeight = thread.value?.scrollHeight || 0
  const beforeTop = thread.value?.scrollTop || 0
  try {
    const data = await listCoachMessages(activeId.value, messageBefore.value)
    messages.value = [...data.messages, ...messages.value]
    messageBefore.value = data.nextBefore
    await nextTick()
    if (thread.value) thread.value.scrollTop = beforeTop + thread.value.scrollHeight - beforeHeight
  } catch (error) {
    operationError.value = friendly(error, '暂时无法加载更早的消息。')
  } finally {
    loading.value = false
  }
}

function useExample() {
  draft.value = '我想为首次 5 公里做准备，未来四周每周二、四、日有空。'
}

function setDraft(text) {
  draft.value = text
}

defineExpose({ setDraft })

async function submit() {
  const text = draft.value
  if (await sendTurn(text) && draft.value === text) draft.value = ''
}

function submitFromKeyboard(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}

function previewWeeklyReview() {
  return sendTurn(`预览 ${props.weeklyReviewWeek} 周报的下周训练调整`)
}

async function sendTurn(text) {
  if (!text || locked.value || loadError.value) return false
  sending.value = true
  pendingMessage.value = text
  operationError.value = ''
  void scrollToLatest()
  try {
    if (!activeId.value) await addConversation()
    if (pendingTurn?.message !== text || pendingTurn?.conversationId !== activeId.value) {
      pendingTurn = { message: text, clientMessageId: newMessageId(), conversationId: activeId.value }
    }
    const { messages: turn } = await sendCoachMessage(activeId.value, pendingTurn)
    const view = thread.value
    const follow = !view || view.scrollHeight - view.scrollTop - view.clientHeight <= 48
    const onlyNew = turn.filter(message => !messages.value.some(existing => existing.id === message.id))
    messages.value = [...messages.value, ...onlyNew]
    const conversation = conversations.value.find(item => item.id === activeId.value)
    if (conversation?.title === '训练计划对话') conversation.title = Array.from(text).slice(0, 40).join('')
    pendingTurn = null
    pendingMessage.value = ''
    if (follow) await scrollToLatest()
    return true
  } catch (error) {
    operationError.value = friendly(error, '未能读取本次结果。可以保留输入并重试。')
    return false
  } finally {
    pendingMessage.value = ''
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
  } catch (error) {
    actionErrors[id] = friendly(error, '暂时无法确认操作结果，请重试。')
  } finally {
    pendingActions.delete(id)
  }
}

onMounted(() => {
  initialize()
  timer = setInterval(() => { now.value = Date.now() }, 10_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.plan-agent { display: grid; gap: 10px; min-width: 0; }
.plan-agent__toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
.plan-agent__toolbar select { flex: 1 1 126px; min-width: 0; }
.plan-agent__preferences {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 44px;
  color: var(--green-strong);
  font-size: 13px;
  font-weight: 700;
}
.plan-agent__weekly-preview {
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
  color: var(--green-strong);
  font-weight: 700;
}
.plan-agent__weekly-preview:disabled { opacity: .55; }
.plan-agent__toolbar :is(button, select),
.plan-agent__older,
.agent-clarification button,
.plan-agent__empty button {
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.agent-clarification { display: flex; flex-wrap: wrap; gap: 8px; }
.plan-agent__thread { display: grid; gap: 10px; max-height: min(67dvh, 620px); overflow-y: auto; padding: 2px; }
.agent-message {
  min-width: 0;
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 13px;
  border: 1px solid var(--border);
  background: var(--panel-soft);
  overflow-wrap: anywhere;
}
.agent-message.user { margin-left: 18px; background: var(--panel); }
.agent-message > small, .plan-agent__status { color: var(--muted); }
.agent-message > p { margin: 0; white-space: pre-wrap; }
.agent-step { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.agent-step svg { flex-shrink: 0; color: var(--app-green); }
.agent-evidence { border: 1px solid var(--border); border-radius: 10px; padding: 8px; font-size: 12px; }
.agent-evidence summary { font-weight: 800; cursor: pointer; }
.agent-evidence ul { margin: 6px 0; padding: 0; list-style: none; }
.agent-evidence li + li { margin-top: 5px; }
.agent-evidence p { margin: 4px 0; color: var(--muted); }
.agent-evidence__demo { display: block; font-weight: 700; }
.plan-agent__empty > p, .plan-agent__status, .plan-agent__error { margin: 0; font-size: 13px; }
.plan-agent__empty button { margin-top: 8px; }
.plan-agent__composer { display: grid; grid-template-columns: minmax(0, 1fr) 44px; align-items: end; gap: 8px; }
.plan-agent__composer textarea {
  width: 100%;
  min-width: 0;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  resize: vertical;
}
.plan-agent__composer button {
  display: grid;
  min-height: 44px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  color: white;
  background: var(--app-green);
}
.plan-agent button:disabled { opacity: 0.55; }
.plan-agent__error { color: var(--danger, #b42318); }
</style>
