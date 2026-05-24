import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { createPreflight } from '../../_shared/preflights'
import { requireRequestSession } from '../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await requireRequestSession(env, request)
    const body = (await request.json().catch(() => ({}))) as {
      projectIdea?: string | null
    }
    const preflight = await createPreflight(
      env,
      session.user.id,
      session.user.backboard_assistant_id,
      body.projectIdea || '',
    )

    return jsonResponse(env, preflight, { status: 201 })
  } catch (error) {
    return handlePreflightError(env, error)
  }
}

function handlePreflightError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown preflight API error'
  return errorResponse(env, 500, 'server_error', message)
}
