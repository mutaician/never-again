import type { Env } from '../../_shared/env'
import {
  apiErrorResponse,
  configErrorResponse,
  errorResponse,
  jsonResponse,
  optionsResponse,
} from '../../_shared/http'
import { createImport } from '../../_shared/imports'
import {
  analyzeImportChunks,
  processImportIntoChunks,
} from '../../_shared/processing'
import { requireRequestSession } from '../../_shared/session'

export const onRequestOptions: PagesFunction<Env> = async ({ env }) => {
  return optionsResponse(env)
}

export const onRequestPost: PagesFunction<Env> = async ({
  env,
  request,
  waitUntil,
}) => {
  try {
    const session = await requireRequestSession(env, request)
    const body = (await request.json()) as {
      projectId?: string | null
      projectName?: string | null
      sourcePlatform?: string | null
      transcript?: string
    }

    const result = await createImport(env, session.user.id, {
      projectId: body.projectId,
      projectName: body.projectName,
      sourcePlatform: body.sourcePlatform,
      transcript: body.transcript || '',
    })

    waitUntil(
      processImportWorkflow(
        env,
        session.user.id,
        result.importRecord.id,
        result.job.id,
        session.user.backboard_assistant_id,
      ),
    )

    return jsonResponse(
      env,
      {
        import: result.importRecord,
        job: result.job,
        project: result.project,
      },
      { status: 201 },
    )
  } catch (error) {
    return handleImportError(env, error)
  }
}

async function processImportWorkflow(
  env: Env,
  userId: string,
  importId: string,
  jobId: string,
  assistantId: string | null,
): Promise<void> {
  await processImportIntoChunks(env, userId, importId, jobId)

  if (!assistantId) return

  await analyzeImportChunks(env, userId, importId, jobId, assistantId)
}

function handleImportError(env: Env, error: unknown): Response {
  const apiResponse = apiErrorResponse(env, error)
  if (apiResponse) return apiResponse

  const configResponse = configErrorResponse(env, error)
  if (configResponse) return configResponse

  const message = error instanceof Error ? error.message : 'Unknown import API error'
  return errorResponse(env, 500, 'server_error', message)
}
