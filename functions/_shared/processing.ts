import {
  analyzeChunkWithBackboard,
  reduceFindingsWithBackboard,
  type ChunkFinding,
  type LessonDraft,
  type ReducerFinding,
} from './backboard'
import { chunkTranscript } from './chunking'
import type { Env } from './env'
import { getImport, getJob, type JobRow } from './imports'
import { getProject } from './projects'

const MAX_CHUNKS_PER_ANALYSIS = 8
const MAX_FINDINGS_PER_REDUCTION = 80
const STALE_JOB_MS = 90_000

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

type ChunkFindingRow = {
  category: string
  chunk_id: string
  chunk_index: number
  confidence: number | null
  created_at: string
  finding_json: string
  id: string
  import_id: string
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
    const chunks = await listAnalyzableChunks(env, userId, importId)

    await markAnalysisStarted(env, userId, importId, job.id)

    const selectedChunks = chunks.slice(0, MAX_CHUNKS_PER_ANALYSIS)
    console.info('Never Again analysis started', {
      importId,
      jobId,
      selectedChunkCount: selectedChunks.length,
      totalAnalyzableChunks: chunks.length,
    })

    for (const [index, chunk] of selectedChunks.entries()) {
      await markChunkStatus(env, chunk.id, 'analyzing')
      console.info('Never Again chunk analysis loading R2 object', {
        chunkId: chunk.id,
        chunkIndex: chunk.chunk_index,
        importId,
        jobId,
      })

      const object = await env.TRANSCRIPTS_BUCKET!.get(chunk.content_r2_key)

      if (!object) {
        throw new Error(`Chunk object not found: ${chunk.content_r2_key}`)
      }

      const chunkText = await object.text()
      console.info('Never Again chunk analysis calling Backboard', {
        charCount: chunkText.length,
        chunkId: chunk.id,
        chunkIndex: chunk.chunk_index,
        importId,
        jobId,
      })
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
      await markAnalysisProgress(env, userId, jobId, selectedChunks.length, index + 1)
      console.info('Never Again chunk analysis completed', {
        chunkId: chunk.id,
        chunkIndex: chunk.chunk_index,
        findingCount: analysis.findings.length,
        importId,
        jobId,
      })
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

export async function resumeImportWorkflowIfNeeded(
  env: Env,
  userId: string,
  jobId: string,
  assistantId: string | null,
): Promise<boolean> {
  const job = await getJob(env, userId, jobId)

  if (!shouldResumeJob(job)) return false

  if (job.status === 'queued' || job.status === 'chunking') {
    await processImportIntoChunks(env, userId, job.import_id, job.id)

    if (!assistantId) {
      await markProcessingFailed(
        env,
        userId,
        job.import_id,
        job.id,
        new Error('Backboard assistant is not ready yet'),
        'Analysis cannot start without a Backboard assistant',
      )
      return true
    }

    await analyzeImportChunks(env, userId, job.import_id, job.id, assistantId)
    await reduceImportFindings(env, userId, job.import_id, job.id, assistantId)
    return true
  }

  if (!assistantId) {
    await markProcessingFailed(
      env,
      userId,
      job.import_id,
      job.id,
      new Error('Backboard assistant is not ready yet'),
      'Analysis cannot continue without a Backboard assistant',
    )
    return true
  }

  if (job.status === 'ready_for_analysis' || job.status === 'analyzing') {
    await analyzeImportChunks(env, userId, job.import_id, job.id, assistantId)
    await reduceImportFindings(env, userId, job.import_id, job.id, assistantId)
    return true
  }

  if (job.status === 'findings_ready' || job.status === 'reducing') {
    await reduceImportFindings(env, userId, job.import_id, job.id, assistantId)
    return true
  }

  return false
}

export async function reduceImportFindings(
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
    const findings = await listChunkFindings(env, userId, importId)

    await markReductionStarted(env, userId, importId, job.id)

    const reducerFindings = findings
      .map(toReducerFinding)
      .filter((finding): finding is ReducerFinding => Boolean(finding))
      .slice(0, MAX_FINDINGS_PER_REDUCTION)

    const lessons =
      reducerFindings.length > 0
        ? await reduceFindingsWithBackboard(env, assistantId, reducerFindings, {
            projectName: project.name,
          })
        : []

    await storeLessonDrafts(env, userId, project.id, importId, lessons)
    await markReadyForReview(env, userId, importId, job.id)
  } catch (error) {
    await markProcessingFailed(env, userId, importId, jobId, error, 'Reduction failed')
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

async function listAnalyzableChunks(
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
         AND status IN ('ready_for_analysis', 'analyzing')
       ORDER BY chunk_index ASC`,
    )
    .bind(userId, importId)
    .all<ChunkRow>()

  return result.results
}

async function markAnalysisProgress(
  env: Env,
  userId: string,
  jobId: string,
  totalChunks: number,
  completedChunks: number,
): Promise<void> {
  if (totalChunks <= 0) return

  const progress = 40 + Math.round((completedChunks / totalChunks) * 20)

  await env.DB!
    .prepare(
      `UPDATE jobs
       SET progress = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(Math.min(64, progress), new Date().toISOString(), jobId, userId)
    .run()
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

async function markReductionStarted(
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
         SET status = 'reducing', updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, importId, userId),
    env.DB!
      .prepare(
        `UPDATE jobs
         SET status = 'reducing',
             progress = 75,
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

async function listChunkFindings(
  env: Env,
  userId: string,
  importId: string,
): Promise<ChunkFindingRow[]> {
  const result = await env.DB!
    .prepare(
      `SELECT chunk_findings.*, chunks.chunk_index
       FROM chunk_findings
       JOIN chunks ON chunks.id = chunk_findings.chunk_id
       WHERE chunk_findings.user_id = ?
         AND chunk_findings.import_id = ?
       ORDER BY chunks.chunk_index ASC, chunk_findings.created_at ASC`,
    )
    .bind(userId, importId)
    .all<ChunkFindingRow>()

  return result.results
}

async function storeChunkFindings(
  env: Env,
  userId: string,
  importId: string,
  chunkId: string,
  findings: ChunkFinding[],
): Promise<void> {
  const now = new Date().toISOString()
  const statements = [
    env.DB!
      .prepare('DELETE FROM chunk_findings WHERE chunk_id = ? AND user_id = ?')
      .bind(chunkId, userId),
  ]

  statements.push(
    ...findings.map((finding) =>
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

  await env.DB!.batch(statements)
}

async function storeLessonDrafts(
  env: Env,
  userId: string,
  projectId: string,
  importId: string,
  lessons: LessonDraft[],
): Promise<void> {
  const now = new Date().toISOString()

  await env.DB!.batch([
    env.DB!
      .prepare(
        `DELETE FROM lessons
         WHERE user_id = ?
           AND import_id = ?
           AND status = 'draft'`,
      )
      .bind(userId, importId),
    ...lessons.map((lesson) =>
      env.DB!
        .prepare(
          `INSERT INTO lessons (
            id,
            user_id,
            project_id,
            import_id,
            title,
            category,
            problem_pattern,
            evidence,
            future_rule,
            confidence,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          projectId,
          importId,
          lesson.title,
          lesson.category,
          lesson.problemPattern,
          lesson.evidence,
          lesson.futureRule,
          lesson.confidence,
          now,
          now,
        ),
    ),
  ])
}

async function markReadyForReview(
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
         SET status = 'ready_for_review', updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, importId, userId),
    env.DB!
      .prepare(
        `UPDATE jobs
         SET status = 'ready_for_review',
             progress = 85,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(now, jobId, userId),
  ])
}

function toReducerFinding(row: ChunkFindingRow): ReducerFinding | null {
  try {
    const finding = JSON.parse(row.finding_json) as Partial<ChunkFinding>

    if (
      !finding.title ||
      !finding.problemPattern ||
      !finding.futureRuleCandidate
    ) {
      return null
    }

    return {
      category: normalizeFindingCategory(finding.category),
      confidence: typeof finding.confidence === 'number' ? finding.confidence : 0.5,
      evidence: typeof finding.evidence === 'string' ? finding.evidence : '',
      futureRuleCandidate: finding.futureRuleCandidate,
      problemPattern: finding.problemPattern,
      sourceChunkIndex: row.chunk_index,
      title: finding.title,
    }
  } catch {
    return null
  }
}

function normalizeFindingCategory(value: unknown): ChunkFinding['category'] {
  const categories = new Set<ChunkFinding['category']>([
    'scope',
    'architecture',
    'agent_behavior',
    'prompting',
    'domain_knowledge',
    'testing',
    'ux',
    'tooling',
    'deployment',
    'unknown',
  ])

  return typeof value === 'string' && categories.has(value as ChunkFinding['category'])
    ? (value as ChunkFinding['category'])
    : 'unknown'
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

function shouldResumeJob(job: JobRow): boolean {
  if (job.status === 'ready_for_analysis' || job.status === 'findings_ready') {
    return true
  }

  if (
    job.status === 'queued' ||
    job.status === 'chunking' ||
    job.status === 'analyzing' ||
    job.status === 'reducing'
  ) {
    return isStale(job.updated_at)
  }

  return false
}

function isStale(updatedAt: string): boolean {
  const updatedAtMs = Date.parse(updatedAt)
  if (Number.isNaN(updatedAtMs)) return true

  return Date.now() - updatedAtMs > STALE_JOB_MS
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
