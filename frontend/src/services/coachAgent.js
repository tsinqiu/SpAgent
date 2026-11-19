import { getEnvelope, mutateEnvelope } from '@/services/api'

const root = '/agent/conversations'

export const listCoachConversations = async (before) => (
  await getEnvelope(root, { params: { before } })
).data
export const createCoachConversation = async () => (await mutateEnvelope('post', root, {})).data
export const listCoachMessages = async (id, before) => (
  await getEnvelope(`${root}/${id}/messages`, { params: { before } })
).data
export const sendCoachMessage = async (id, body) => (
  await mutateEnvelope('post', `${root}/${id}/messages`, body)
).data
export const decideCoachAction = async (id, decision) => (
  await mutateEnvelope('post', `/agent/actions/${id}/${decision}`, {})
).data
