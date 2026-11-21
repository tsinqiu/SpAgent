import { getEnvelope } from '@/services/api'
import { apiClient, unwrapApiResponse } from '@/services/http'

export async function getUpcomingMarathonEvents(params = {}) {
  const envelope = await getEnvelope('/explore/events', { params })
  const data = envelope.data || {}
  return {
    items: Array.isArray(data.items) ? data.items : [],
    meta: data.meta || {
      source: '中国马拉松 (chinamarathon.com)',
      lastCrawledAt: null,
      counts: { total: 0, full: 0, half: 0 },
    },
  }
}

export async function refreshMarathonEvents() {
  const data = await unwrapApiResponse(apiClient.post('/explore/events/refresh'))
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    meta: data?.meta || { counts: { total: 0, full: 0, half: 0 } },
    refresh: data?.refresh || null,
  }
}

export async function listMyMarathonEvents() {
  const envelope = await getEnvelope('/explore/my-events')
  return Array.isArray(envelope.data?.items) ? envelope.data.items : []
}

export async function saveMyMarathonEvent(payload) {
  return unwrapApiResponse(apiClient.post('/explore/my-events', payload))
}

export async function deleteMyMarathonEvent(id) {
  return unwrapApiResponse(apiClient.delete(`/explore/my-events/${id}`))
}
