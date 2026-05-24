import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { getLesson, updateLesson } from '../../_shared/lessons'
import { requireRequestSession } from '../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestGet: PagesFunction<Env> = async ({
  env,
  params,
  request,
}) => {
  try {
    const session = await requireRequestSession(env, request)
    const lesson = await getLesson(env, session.user.id, paramId(params.id))

    return jsonResponse(env, { lesson })
  } catch (error) {
    return handleLessonError(env, error)
  }
}

export const onRequestPatch: PagesFunction<Env> = async ({
  env,
  params,
  request,
}) => {
  try {
    const session = await requireRequestSession(env, request)
    const body = (await request.json()) as {
      category?: string | null
      evidence?: string | null
      futureRule?: string | null
      problemPattern?: string | null
      title?: string | null
    }
    const lesson = await updateLesson(env, session.user.id, paramId(params.id), body)

    return jsonResponse(env, { lesson })
  } catch (error) {
    return handleLessonError(env, error)
  }
}

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

function handleLessonError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown lesson API error'
  return errorResponse(env, 500, 'server_error', message)
}
