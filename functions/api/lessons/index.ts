import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { createManualLesson, listLessons } from '../../_shared/lessons'
import { requireRequestSession } from '../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await requireRequestSession(env, request)
    const status = new URL(request.url).searchParams.get('status')
    const lessons = await listLessons(env, session.user.id, status)

    return jsonResponse(env, { lessons })
  } catch (error) {
    return handleLessonError(env, error)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await requireRequestSession(env, request)
    const body = (await request.json()) as {
      category?: string | null
      evidence?: string | null
      futureRule?: string | null
      problemPattern?: string | null
      projectName?: string | null
      title?: string | null
    }
    const lesson = await createManualLesson(env, session.user.id, body)

    return jsonResponse(env, { lesson }, { status: 201 })
  } catch (error) {
    return handleLessonError(env, error)
  }
}

function handleLessonError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown lesson API error'
  return errorResponse(env, 500, 'server_error', message)
}
