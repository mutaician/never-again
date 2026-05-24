import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { getImport } from '../../_shared/imports'
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
    const importRecord = await getImport(env, session.user.id, paramId(params.id))

    return jsonResponse(env, { import: importRecord })
  } catch (error) {
    return handleImportError(env, error)
  }
}

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

function handleImportError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown import API error'
  return errorResponse(env, 500, 'server_error', message)
}
