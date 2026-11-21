import { getEnvelope, mutateEnvelope } from '@/services/api'
import { getAuthToken, resolveApiBaseUrl } from '@/services/http'

const root = '/agent/conversations'

export const getCoachContextPulse = async () => (
  await getEnvelope('/agent/context-pulse')
).data

export const listCoachConversations = async (before) => (
  await getEnvelope(root, { params: { before } })
).data

export const createCoachConversation = async () => (await mutateEnvelope('post', root, {})).data

export const renameCoachConversation = async (id, title) => (
  await mutateEnvelope('patch', `${root}/${id}`, { title })
).data

export const deleteCoachConversation = async (id) => (
  await mutateEnvelope('delete', `${root}/${id}`)
).data

export const listCoachMessages = async (id, before) => (
  await getEnvelope(`${root}/${id}/messages`, { params: { before } })
).data

export async function sendCoachMessage(id, { message, clientMessageId, attachment, profile }) {
  const fields = { message, clientMessageId, coachRole: profile.role, coachInstructions: profile.instructions }
  let body = fields
  if (attachment) {
    body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.append(key, value)
    body.append('attachment', attachment)
  }
  return (await mutateEnvelope('post', `${root}/${id}/messages`, body, { timeout: attachment ? 65_000 : 60_000 })).data
}

/**
 * Stream a coach turn via Server-Sent Events (SSE) with live tool-use status & token streaming.
 * Gracefully falls back to sendCoachMessage if SSE is unavailable.
 */
export async function streamCoachMessage(
  id,
  { message, clientMessageId, attachment, profile },
  { onStatus, onDelta, onCard, onFollowups, onProposalReady, signal } = {},
) {
  const baseUrl = resolveApiBaseUrl().replace(/\/$/, '')
  const url = `${baseUrl}${root}/${id}/messages/stream`
  const token = getAuthToken()
  const fields = {
    message,
    clientMessageId,
    coachRole: profile?.role || 'general',
    coachInstructions: profile?.instructions || '',
  }

  const headers = { Accept: 'text/event-stream' }
  if (token) headers.Authorization = `Bearer ${token}`

  let body
  if (attachment) {
    body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.append(key, value)
    body.append('attachment', attachment)
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(fields)
  }

  const response = await fetch(url, { method: 'POST', headers, body, signal })
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok) {
    let errData = null
    try {
      errData = await response.json()
    } catch {
      errData = null
    }
    const err = new Error(errData?.error?.message || `Request failed (${response.status})`)
    err.status = response.status
    err.code = errData?.error?.code
    throw err
  }

  if (!contentType.includes('text/event-stream') || !response.body) {
    const json = await response.json()
    return json?.data ?? json
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let donePayload = null

  const dispatchBlock = (block) => {
    const lines = block.split(/\r?\n/)
    let eventName = 'message'
    const dataLines = []
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return
    const raw = dataLines.join('\n')
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (eventName === 'status') onStatus?.(parsed)
    else if (eventName === 'delta') onDelta?.(parsed.text || '')
    else if (eventName === 'card' && parsed.card) onCard?.(parsed.card)
    else if (eventName === 'followups' && Array.isArray(parsed.items)) onFollowups?.(parsed.items)
    else if (eventName === 'proposal_ready') onProposalReady?.(parsed)
    else if (eventName === 'done') donePayload = parsed
    else if (eventName === 'error') {
      const err = new Error(parsed.message || '在线分析暂时不可用')
      err.code = parsed.code
      err.status = parsed.status
      throw err
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: !done })
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (block.trim()) dispatchBlock(block)
    }
    if (done) {
      if (buffer.trim()) dispatchBlock(buffer)
      break
    }
  }

  if (!donePayload) {
    throw new Error('流式响应提前中断，请重试。')
  }
  return donePayload
}

export const decideCoachAction = async (id, decision) => (
  await mutateEnvelope('post', `/agent/actions/${id}/${decision}`, {})
).data

export const listCoachMemories = async () => (
  await getEnvelope('/agent/memories')
).data.memories

export const createCoachMemory = async ({ category, content }) => (
  await mutateEnvelope('post', '/agent/memories', { category, content })
).data.memory

export const deleteCoachMemory = async (id) => (
  await mutateEnvelope('delete', `/agent/memories/${id}`)
).data
