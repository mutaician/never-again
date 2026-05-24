import { analyzeChunkWithBackboard, type ChunkFinding } from './backboard'
import { chunkTranscript } from './chunking'
import type { Env } from './env'
import { getImport, getJob } from './imports'
import { getProject } from './projects'

const MAX_CHUNKS_PER_ANALYSIS = 8

type ChunkRow = {
  char_count: number
  chunk_index: number
  content_hash: string
  content_r2_key: string
  created_at: string
  id: string
  import_id: string
  status: string
  turn_end: number | null
  turn_start: number | null
  updated_at: string
  user_id: string
}

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
    await markProcessingFailed(env, userId, importId, jobId, error, 'Chunking failed')
    throw error
  }
}

export async function analyzeImportChunks(
  env: Env,
  userId: string,
  importId: string,
  jobId: string,
  assistantId: string,
): Promise<void> {
  try {
    const importRecord = await getImport(env, userId, importId)
    const job = await getJob(env, userId, jobId)
    const project = await getProject(env, userId, importRecord.project_id)
    const chunks = await listReadyChunks(env, userId, importId)

    await markAnalysisStarted(env, userId, importId, job.id)

    const selectedChunks = chunks.slice(0, MAX_CHUNKS_PER_ANALYSIS)

    for (const chunk of selectedChunks) {
      await markChunkStatus(env, chunk.id, 'analyzing')

      const object = await env.TRANSCRIPTS_BUCKET!.get(chunk.content_r2_key)

      if (!object) {
        throw new Error(`Chunk object not found: ${chunk.content_r2_key}`)
      }

      const chunkText = await object.text()
      const analysis = await analyzeChunkWithBackboard(
        env,
        assistantId,
        chunkText,
        {
          chunkIndex: chunk.chunk_index,
          projectName: project.name,
        },
      )

      await storeChunkFindings(env, userId, importId, chunk.id, analysis.findings)
      await markChunkStatus(env, chunk.id, 'analyzed')
    }

    const now = new Date().toISOString()

    await env.DB!.batch([
      env.DB!
        .prepare(
          `UPDATE imports
           SET status = 'findings_ready', updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(now, importId, userId),
      env.DB!
        .prepare(
          `UPDATE jobs
           SET status = 'findings_ready',
               progress = 65,
               updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(now, jobId, userId),
    ])
  } catch (error) {
    await markProcessingFailed(env, userId, importId, jobId, error, 'Analysis failed')
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

async function listReadyChunks(
  env: Env,
  userId: string,
  importId: string,
): Promise<ChunkRow[]> {
  const result = await env.DB!
    .prepare(
      `SELECT *
       FROM chunks
       WHERE user_id = ?
         AND import_id = ?
         AND status IN ('ready_for_analysis', 'analyzed')
       ORDER BY chunk_index ASC`,
    )
    .bind(userId, importId)
    .all<ChunkRow>()

  return result.results
}

async function markAnalysisStarted(
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
         SET status = 'analyzing', updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, importId, userId),
    env.DB!
      .prepare(
        `UPDATE jobs
         SET status = 'analyzing',
             progress = 40,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, jobId, userId),
  ])
}

async function markChunkStatus(
  env: Env,
  chunkId: string,
  status: string,
): Promise<void> {
  await env.DB!
    .prepare('UPDATE chunks SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), chunkId)
    .run()
}

async function storeChunkFindings(
  env: Env,
  userId: string,
  importId: string,
  chunkId: string,
  findings: ChunkFinding[],
): Promise<void> {
  const now = new Date().toISOString()

  if (findings.length === 0) return

  await env.DB!.batch(
    findings.map((finding) =>
      env.DB!
        .prepare(
          `INSERT INTO chunk_findings (
            id,
            user_id,
            chunk_id,
            import_id,
            category,
            finding_json,
            confidence,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          chunkId,
          importId,
          finding.category,
          JSON.stringify(finding),
          finding.confidence,
          now,
        ),
    ),
  )
}

async function markProcessingFailed(
  env: Env,
  userId: string,
  importId: string,
  jobId: string,
  error: unknown,
  fallbackMessage: string,
): Promise<void> {
  const now = new Date().toISOString()
  const message = error instanceof Error ? error.message : fallbackMessage

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
