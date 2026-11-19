import { getEnvelope, mutateEnvelope } from '@/services/api'
import { apiClient, unwrapApiResponse } from '@/services/http'

const root = '/training-plans'

export const listTrainingPlans = async () => (await getEnvelope(root)).data
export const getTrainingPlan = async (id) => (await getEnvelope(`${root}/${id}`)).data
export const getTrainingContext = async () => (await getEnvelope('/training/context')).data
export const saveTrainingPlan = async (id, body) => (
  await mutateEnvelope(id ? 'put' : 'post', id ? `${root}/${id}` : root, body)
).data
export const changePlanStatus = async (id, version, action) => (
  await mutateEnvelope('post', `${root}/${id}/${action}`, { version })
).data
export const changeSessionStatus = async (id, sessionId, version, status) => (
  await mutateEnvelope('patch', `${root}/${id}/sessions/${sessionId}`, { version, status })
).data
export const deleteDraftPlan = async (id, version) => (
  unwrapApiResponse((await apiClient.delete(`${root}/${id}`, { data: { version } })).data).data
)

export const getPlanRevisions = async (id, before) => (
  await getEnvelope(`${root}/${id}/revisions`, { params: { before } })
).data
export const getSessionActivities = async (id) => (
  await getEnvelope(`/training-sessions/${id}/activity-candidates`)
).data
export const getActivityExecution = async (id) => (await getEnvelope(`/activities/${id}/plan-execution`)).data
export const linkTrainingActivity = async (id, activityId, version) => (
  await mutateEnvelope('post', `/training-sessions/${id}/link-activity`, { activityId, version })
).data
