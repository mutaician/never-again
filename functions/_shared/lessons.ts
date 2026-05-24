import type { Env } from './env'

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

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  return cleanValue || null
}
