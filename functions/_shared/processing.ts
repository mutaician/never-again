import { chunkTranscript } from './chunking'
import type { Env } from './env'
import { getImport, getJob } from './imports'

export async function processImportIntoChunks(
  env: Env,
  userId: string,
  importId: string,
  jobId: string,
): Promise<void> {
  try {
    await markProcessingStarted(env, userId, importId, jobId)

    const importRecord = await getImport(env, userId, importId)
    const job = await getJob(env, userId, jobId)

    if (!importRecord.normalized_r2_key) {
      throw new Error('Import is missing normalized transcript key')
    }

    const normalizedObject = await env.TRANSCRIPTS_BUCKET!.get(
      importRecord.normalized_r2_key,
    )

    if (!normalizedObject) {
      throw new Error('Normalized transcript was not found in R2')
    }

    const normalizedText = await normalizedObject.text()
    const chunks = chunkTranscript(normalizedText)
    const chunkBaseKey = importRecord.normalized_r2_key.replace(
      /normalized\.md$/,
      'chunks',
    )
    const now = new Date().toISOString()

    await Promise.all(
      chunks.map(async (chunk) => {
        await env.TRANSCRIPTS_BUCKET!.put(
          `${chunkBaseKey}/chunk-${String(chunk.chunkIndex).padStart(4, '0')}.md`,
          chunk.text,
          {
            customMetadata: {
              chunkIndex: String(chunk.chunkIndex),
              importId,
              jobId: job.id,
            },
            httpMetadata: {
              contentType: 'text/markdown; charset=utf-8',
            },
          },
        )
      }),
    )

    await env.DB!.batch([
      env.DB!.prepare('DELETE FROM chunks WHERE import_id = ?').bind(importId),
      ...(
        await Promise.all(
          chunks.map(async (chunk) => {
            const chunkKey = `${chunkBaseKey}/chunk-${String(chunk.chunkIndex).padStart(4, '0')}.md`
            const hash = await sha256(chunk.text)

            return env.DB!
              .prepare(
                `INSERT INTO chunks (
                  id,
                  user_id,
                  import_id,
                  chunk_index,
                  turn_start,
                  turn_end,
                  content_hash,
                  content_r2_key,
                  char_count,
                  status,
                  created_at,
                  updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready_for_analysis', ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                userId,
                importId,
                chunk.chunkIndex,
                chunk.turnStart,
                chunk.turnEnd,
                hash,
                chunkKey,
                chunk.text.length,
                now,
                now,
              )
          }),
        )
      ),
      env.DB!
        .prepare(
          `UPDATE imports
           SET status = 'chunked', updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(now, importId, userId),
      env.DB!
        .prepare(
          `UPDATE jobs
           SET status = 'ready_for_analysis',
               progress = 30,
               updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(now, jobId, userId),
    ])
  } catch (error) {
    await markProcessingFailed(env, userId, importId, jobId, error)
    throw error
  }
}

async function markProcessingStarted(
  env: Env,
  userId: string,
  importId: string,
  jobId: string,
): Promise<void> {
  const now = new Date().toISOString()

  await env.DB!.batch([
    env.DB!
      .prepare(
        `UPDATE imports
         SET status = 'chunking', updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, importId, userId),
    env.DB!
      .prepare(
        `UPDATE jobs
         SET status = 'chunking',
             progress = 15,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, jobId, userId),
  ])
}

async function markProcessingFailed(
  env: Env,
  userId: string,
  importId: string,
  jobId: string,
  error: unknown,
): Promise<void> {
  const now = new Date().toISOString()
  const message = error instanceof Error ? error.message : 'Chunking failed'

  await env.DB!.batch([
    env.DB!
      .prepare(
        `UPDATE imports
         SET status = 'failed', updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, importId, userId),
    env.DB!
      .prepare(
        `UPDATE jobs
         SET status = 'failed',
             error_message = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(message, now, jobId, userId),
  ])
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
