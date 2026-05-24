import { verifyAuth0Token } from '../_shared/auth0'
import type { Env } from '../_shared/env'
import {
  bearerToken,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../_shared/http'
import { getOrCreateUser } from '../_shared/users'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const token = bearerToken(request)

  if (!token) {
    return errorResponse(env, 401, 'auth_required', 'Missing bearer token')
  }

  if (!env.DB) {
    return errorResponse(env, 500, 'database_not_bound', 'D1 binding DB is not configured')
  }

  try {
    const profile = await verifyAuth0Token(env, token)
    const result = await getOrCreateUser(env, profile)

    return jsonResponse(env, {
      assistant: {
        created: result.assistantCreated,
        message: result.assistantMessage,
        status: result.user.assistant_status,
      },
      user: {
        auth0Sub: result.user.auth0_sub,
        backboardAssistantId: result.user.backboard_assistant_id,
        email: result.user.email,
        id: result.user.id,
        name: result.user.name,
      },
    })
  } catch (error) {
    const configResponse = configErrorResponse(env, error)
    if (configResponse) return configResponse

    const message = error instanceof Error ? error.message : 'Unknown API error'
    return errorResponse(env, 500, 'server_error', message)
  }
}
