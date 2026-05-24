import {
  generatePreflightWithBackboard,
  searchBackboardMemories,
  type PreflightMemoryInput,
  type PreflightResult,
} from './backboard'
import type { Env } from './env'
import { ApiError } from './http'
import { listLessons, type LessonRow } from './lessons'

export type PreflightRow = {
  created_at: string
  id: string
  project_idea: string
  result_json: string
  retrieved_memory_json: string
  user_id: string
}

export type CreatePreflightResponse = {
  memories: PreflightMemoryInput[]
  preflight: Pick<PreflightRow, 'created_at' | 'id' | 'project_idea'>
  result: PreflightResult
}

export async function createPreflight(
  env: Env,
  userId: string,
  assistantId: string | null,
  projectIdea: string,
): Promise<CreatePreflightResponse> {
  if (!env.DB) {
    throw new ApiError(500, 'database_not_bound', 'D1 binding DB is not configured')
  }

  if (!assistantId) {
    throw new ApiError(400, 'bad_request', 'Backboard assistant is not ready yet')
  }

  const cleanProjectIdea = projectIdea.trim()

  if (!cleanProjectIdea) {
    throw new ApiError(400, 'bad_request', 'Describe the project idea first')
  }

  const savedLessons = await listLessons(env, userId, 'saved')
  const localMemories = savedLessons.map(lessonToPreflightMemory)
  const backboardMemories = await trySearchBackboardMemories(
    env,
    assistantId,
    cleanProjectIdea,
  )
  const memories = dedupeMemories([...localMemories, ...backboardMemories]).slice(0, 10)
  const result = await generatePreflightWithBackboard(
    env,
    assistantId,
    cleanProjectIdea,
    memories,
  )
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  await env.DB
    .prepare(
      `INSERT INTO preflights (
        id,
        user_id,
        project_idea,
        retrieved_memory_json,
        result_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      cleanProjectIdea,
      JSON.stringify(memories),
      JSON.stringify(result),
      now,
    )
    .run()

  return {
    memories,
    preflight: {
      created_at: now,
      id,
      project_idea: cleanProjectIdea,
    },
    result,
  }
}

async function trySearchBackboardMemories(
  env: Env,
  assistantId: string,
  projectIdea: string,
): Promise<PreflightMemoryInput[]> {
  try {
    return await searchBackboardMemories(env, assistantId, projectIdea, 6)
  } catch {
    return []
  }
}

function lessonToPreflightMemory(lesson: LessonRow): PreflightMemoryInput {
  return {
    category: lesson.category,
    content: [
      `Builder lesson: ${lesson.title}`,
      `Category: ${lesson.category}`,
      `Pattern: ${lesson.problem_pattern}`,
      `Future rule: ${lesson.future_rule}`,
      `Source evidence: ${lesson.evidence}`,
    ].join('\n'),
    id: lesson.backboard_memory_id || lesson.id,
    metadata: {
      confidence: lesson.confidence,
      import_id: lesson.import_id,
      lesson_id: lesson.id,
      project_id: lesson.project_id,
      project_name: lesson.project_name,
      source: lesson.import_id ? 'transcript_import' : 'manual_capture',
      status: lesson.status,
    },
    source: 'local',
    title: lesson.title,
  }
}

function dedupeMemories(memories: PreflightMemoryInput[]): PreflightMemoryInput[] {
  const seen = new Set<string>()
  const deduped: PreflightMemoryInput[] = []

  for (const memory of memories) {
    const key = memory.id || memory.content
    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(memory)
  }

  return deduped
}
