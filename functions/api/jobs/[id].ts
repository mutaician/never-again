import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { getJob } from '../../_shared/imports'
import { resumeImportWorkflowIfNeeded } from '../../_shared/processing'
import { requireRequestSession } from '../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestGet: PagesFunction<Env> = async ({
  env,
  params,
  request,
  waitUntil,
}) => {
  try {
    const session = await requireRequestSession(env, request)
    const job = await getJob(env, session.user.id, paramId(params.id))

    waitUntil(
      resumeImportWorkflowIfNeeded(
        env,
        session.user.id,
        job.id,
        session.user.backboard_assistant_id,
      ).catch((error: unknown) => {
        console.error('Unable to resume import workflow', error)
      }),
    )

    return jsonResponse(env, { job })
  } catch (error) {
    const apiResponse = apiErrorResponse(env, error)
    if (apiResponse) return apiResponse

    const configResponse = configErrorResponse(env, error)
    if (configResponse) return configResponse

    const message = error instanceof Error ? error.message : 'Unknown job API error'
    return errorResponse(env, 500, 'server_error', message)
  }
}

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}
