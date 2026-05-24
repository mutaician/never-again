import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { createProject, listProjects } from '../../_shared/projects'
import { requireRequestSession } from '../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await requireRequestSession(env, request)
    const projects = await listProjects(env, session.user.id)

    return jsonResponse(env, { projects })
  } catch (error) {
    return handleProjectError(env, error)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await requireRequestSession(env, request)
    const body = (await request.json()) as {
      description?: string
      name?: string
      outcome?: string
      sourcePlatform?: string
    }

    const project = await createProject(env, session.user.id, {
      description: body.description,
      name: body.name || '',
      outcome: body.outcome,
      sourcePlatform: body.sourcePlatform,
    })

    return jsonResponse(env, { project }, { status: 201 })
  } catch (error) {
    return handleProjectError(env, error)
  }
}

function handleProjectError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown project API error'
  return errorResponse(env, 500, 'server_error', message)
}
