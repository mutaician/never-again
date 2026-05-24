import type { Env } from '../../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../../_shared/http'
import { approveLesson } from '../../../_shared/lessons'
import { requireRequestSession } from '../../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestPost: PagesFunction<Env> = async ({
  env,
  params,
  request,
}) => {
  try {
    const session = await requireRequestSession(env, request)
    const lesson = await approveLesson(
      env,
      session.user.id,
      session.user.backboard_assistant_id,
      paramId(params.id),
    )

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

  const message = error instanceof Error ? error.message : 'Unknown lesson approve API error'
  return errorResponse(env, 500, 'server_error', message)
}
