import type { Env } from './env'
import { ApiError } from './http'
import { createProject, getProject, type ProjectRow } from './projects'

const MAX_TRANSCRIPT_BYTES = 750_000

export type ImportRow = {
  content_hash: string | null
  created_at: string
  id: string
  normalized_r2_key: string | null
  original_size_bytes: number | null
  project_id: string
  raw_r2_key: string
  redacted_secret_count: number
  source_platform: string | null
  status: string
  updated_at: string
  user_id: string
}

export type JobRow = {
  completed_at: string | null
  created_at: string
  error_message: string | null
  id: string
  import_id: string
  progress: number
  project_id: string
  status: string
  type: string
  updated_at: string
  user_id: string
}

export type CreateImportInput = {
  projectId?: string | null
  projectName?: string | null
  sourcePlatform?: string | null
  transcript: string
}

export type CreateImportResult = {
  importRecord: ImportRow
  job: JobRow
  project: ProjectRow
}

export async function createImport(
  env: Env,
  userId: string,
  input: CreateImportInput,
): Promise<CreateImportResult> {
  if (!env.TRANSCRIPTS_BUCKET) {
    throw new ApiError(
      500,
      'storage_not_bound',
      'R2 binding TRANSCRIPTS_BUCKET is not configured',
    )
  }

  const transcript = input.transcript.trim()

  if (!transcript) {
    throw new ApiError(400, 'bad_request', 'Transcript is required')
  }

  const transcriptBytes = new TextEncoder().encode(transcript)

  if (transcriptBytes.byteLength > MAX_TRANSCRIPT_BYTES) {
    throw new ApiError(400, 'bad_request', 'Transcript is too large for this MVP')
  }

  const project = await resolveProject(env, userId, input)
  const importId = crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const now = new Date().toISOString()
  const contentHash = await sha256(transcriptBytes)
  const rawR2Key = `users/${userId}/projects/${project.id}/imports/${importId}/raw.txt`

  await env.TRANSCRIPTS_BUCKET.put(rawR2Key, transcript, {
    httpMetadata: {
      contentType: 'text/plain; charset=utf-8',
    },
  })

  await env.DB!.batch([
    env.DB!
      .prepare(
        `INSERT INTO imports (
          id,
          user_id,
          project_id,
          source_platform,
          raw_r2_key,
          status,
          original_size_bytes,
          content_hash,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
      )
      .bind(
        importId,
        userId,
        project.id,
        cleanOptional(input.sourcePlatform),
        rawR2Key,
        transcriptBytes.byteLength,
        contentHash,
        now,
        now,
      ),
    env.DB!
      .prepare(
        `INSERT INTO jobs (
          id,
          user_id,
          project_id,
          import_id,
          type,
          status,
          progress,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'transcript_analysis', 'queued', 0, ?, ?)`,
      )
      .bind(jobId, userId, project.id, importId, now, now),
  ])

  const importRecord = await getImport(env, userId, importId)
  const job = await getJob(env, userId, jobId)

  return {
    importRecord,
    job,
    project,
  }
}

export async function getImport(
  env: Env,
  userId: string,
  importId: string,
): Promise<ImportRow> {
  const importRecord = await env.DB!
    .prepare('SELECT * FROM imports WHERE id = ? AND user_id = ?')
    .bind(importId, userId)
    .first<ImportRow>()

  if (!importRecord) {
    throw new ApiError(404, 'bad_request', 'Import not found')
  }

  return importRecord
}

export async function getJob(
  env: Env,
  userId: string,
  jobId: string,
): Promise<JobRow> {
  const job = await env.DB!
    .prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?')
    .bind(jobId, userId)
    .first<JobRow>()

  if (!job) {
    throw new ApiError(404, 'bad_request', 'Job not found')
  }

  return job
}

async function resolveProject(
  env: Env,
  userId: string,
  input: CreateImportInput,
): Promise<ProjectRow> {
  if (input.projectId) {
    return getProject(env, userId, input.projectId)
  }

  return createProject(env, userId, {
    name: input.projectName || 'Untitled Project',
    sourcePlatform: input.sourcePlatform,
  })
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  return cleanValue || null
}
