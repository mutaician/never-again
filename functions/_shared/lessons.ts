import { addBackboardMemory } from './backboard'
import type { Env } from './env'
import { ApiError } from './http'

export type LessonRow = {
  backboard_memory_id: string | null
  category: string
  confidence: number
  created_at: string
  evidence: string
  future_rule: string
  id: string
  import_id: string | null
  problem_pattern: string
  project_id: string
  project_name: string
  status: string
  title: string
  updated_at: string
  user_id: string
}

export type UpdateLessonInput = {
  category?: string | null
  evidence?: string | null
  futureRule?: string | null
  problemPattern?: string | null
  title?: string | null
}

export async function listLessons(
  env: Env,
  userId: string,
  status?: string | null,
): Promise<LessonRow[]> {
  const cleanStatus = cleanOptional(status)

  if (cleanStatus) {
    const result = await env.DB!
      .prepare(
        `SELECT lessons.*, projects.name AS project_name
         FROM lessons
         JOIN projects ON projects.id = lessons.project_id
         WHERE lessons.user_id = ?
           AND lessons.status = ?
         ORDER BY lessons.created_at DESC
         LIMIT 50`,
      )
      .bind(userId, cleanStatus)
      .all<LessonRow>()

    return result.results
  }

  const result = await env.DB!
    .prepare(
      `SELECT lessons.*, projects.name AS project_name
       FROM lessons
       JOIN projects ON projects.id = lessons.project_id
       WHERE lessons.user_id = ?
       ORDER BY lessons.created_at DESC
       LIMIT 50`,
    )
    .bind(userId)
    .all<LessonRow>()

  return result.results
}

export async function getLesson(
  env: Env,
  userId: string,
  lessonId: string,
): Promise<LessonRow> {
  const lesson = await env.DB!
    .prepare(
      `SELECT lessons.*, projects.name AS project_name
       FROM lessons
       JOIN projects ON projects.id = lessons.project_id
       WHERE lessons.id = ?
         AND lessons.user_id = ?`,
    )
    .bind(lessonId, userId)
    .first<LessonRow>()

  if (!lesson) {
    throw new ApiError(404, 'bad_request', 'Lesson not found')
  }

  return lesson
}

export async function updateLesson(
  env: Env,
  userId: string,
  lessonId: string,
  input: UpdateLessonInput,
): Promise<LessonRow> {
  const existing = await getLesson(env, userId, lessonId)

  if (existing.status !== 'draft') {
    throw new ApiError(400, 'bad_request', 'Only draft lessons can be edited')
  }

  const updates = {
    category: cleanOptional(input.category) ?? existing.category,
    evidence: cleanOptional(input.evidence) ?? existing.evidence,
    futureRule: cleanOptional(input.futureRule) ?? existing.future_rule,
    problemPattern: cleanOptional(input.problemPattern) ?? existing.problem_pattern,
    title: cleanOptional(input.title) ?? existing.title,
  }

  const now = new Date().toISOString()

  await env.DB!
    .prepare(
      `UPDATE lessons
       SET title = ?,
           category = ?,
           problem_pattern = ?,
           evidence = ?,
           future_rule = ?,
           updated_at = ?
       WHERE id = ?
         AND user_id = ?`,
    )
    .bind(
      updates.title,
      updates.category,
      updates.problemPattern,
      updates.evidence,
      updates.futureRule,
      now,
      lessonId,
      userId,
    )
    .run()

  return getLesson(env, userId, lessonId)
}

export async function rejectLesson(
  env: Env,
  userId: string,
  lessonId: string,
): Promise<LessonRow> {
  const existing = await getLesson(env, userId, lessonId)

  if (existing.status !== 'draft') {
    throw new ApiError(400, 'bad_request', 'Only draft lessons can be rejected')
  }

  await env.DB!
    .prepare(
      `UPDATE lessons
       SET status = 'rejected',
           updated_at = ?
       WHERE id = ?
         AND user_id = ?`,
    )
    .bind(new Date().toISOString(), lessonId, userId)
    .run()

  return getLesson(env, userId, lessonId)
}

export async function approveLesson(
  env: Env,
  userId: string,
  assistantId: string | null,
  lessonId: string,
): Promise<LessonRow> {
  if (!assistantId) {
    throw new ApiError(400, 'bad_request', 'Backboard assistant is not ready yet')
  }

  const lesson = await getLesson(env, userId, lessonId)

  if (lesson.status !== 'draft') {
    throw new ApiError(400, 'bad_request', 'Only draft lessons can be saved')
  }

  const memoryId = await addBackboardMemory(env, assistantId, {
    category: lesson.category,
    confidence: lesson.confidence,
    evidence: lesson.evidence,
    futureRule: lesson.future_rule,
    importId: lesson.import_id,
    lessonId: lesson.id,
    problemPattern: lesson.problem_pattern,
    projectId: lesson.project_id,
    projectName: lesson.project_name,
    title: lesson.title,
  })

  await env.DB!
    .prepare(
      `UPDATE lessons
       SET status = 'saved',
           backboard_memory_id = ?,
           updated_at = ?
       WHERE id = ?
         AND user_id = ?`,
    )
    .bind(memoryId, new Date().toISOString(), lessonId, userId)
    .run()

  return getLesson(env, userId, lessonId)
}

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  return cleanValue || null
}
