import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { getProject, updateProject } from '../../_shared/projects'
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
    const project = await getProject(env, session.user.id, paramId(params.id))

    return jsonResponse(env, { project })
  } catch (error) {
    return handleProjectError(env, error)
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
      description?: string | null
      name?: string
      outcome?: string | null
      sourcePlatform?: string | null
    }
    const project = await updateProject(env, session.user.id, paramId(params.id), body)

    return jsonResponse(env, { project })
  } catch (error) {
    return handleProjectError(env, error)
  }
}

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

function handleProjectError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown project API error'
  return errorResponse(env, 500, 'server_error', message)
}
