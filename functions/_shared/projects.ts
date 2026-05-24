import type { Env } from './env'
import { ApiError } from './http'

export type ProjectRow = {
  created_at: string
  description: string | null
  id: string
  name: string
  outcome: string | null
  source_platform: string | null
  updated_at: string
  user_id: string
}

export type CreateProjectInput = {
  description?: string | null
  name: string
  outcome?: string | null
  sourcePlatform?: string | null
}

export async function listProjects(
  env: Env,
  userId: string,
): Promise<ProjectRow[]> {
  return env.DB!
    .prepare(
      `SELECT *
       FROM projects
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<ProjectRow>()
    .then((result) => result.results)
}

export async function getProject(
  env: Env,
  userId: string,
  projectId: string,
): Promise<ProjectRow> {
  const project = await env.DB!
    .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .bind(projectId, userId)
    .first<ProjectRow>()

  if (!project) {
    throw new ApiError(404, 'bad_request', 'Project not found')
  }

  return project
}

export async function createProject(
  env: Env,
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const name = input.name.trim()

  if (!name) {
    throw new ApiError(400, 'bad_request', 'Project name is required')
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  await env.DB!
    .prepare(
      `INSERT INTO projects (
        id,
        user_id,
        name,
        description,
        source_platform,
        outcome,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      name,
      cleanOptional(input.description),
      cleanOptional(input.sourcePlatform),
      cleanOptional(input.outcome),
      now,
      now,
    )
    .run()

  return getProject(env, userId, id)
}

export async function updateProject(
  env: Env,
  userId: string,
  projectId: string,
  input: Partial<CreateProjectInput>,
): Promise<ProjectRow> {
  await getProject(env, userId, projectId)

  const now = new Date().toISOString()
  const updates = {
    description:
      input.description === undefined ? undefined : cleanOptional(input.description),
    name: input.name === undefined ? undefined : input.name.trim(),
    outcome: input.outcome === undefined ? undefined : cleanOptional(input.outcome),
    sourcePlatform:
      input.sourcePlatform === undefined ? undefined : cleanOptional(input.sourcePlatform),
  }

  if (updates.name === '') {
    throw new ApiError(400, 'bad_request', 'Project name cannot be empty')
  }

  await env.DB!
    .prepare(
      `UPDATE projects
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           source_platform = COALESCE(?, source_platform),
           outcome = COALESCE(?, outcome),
           updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      updates.name,
      updates.description,
      updates.sourcePlatform,
      updates.outcome,
      now,
      projectId,
      userId,
    )
    .run()

  return getProject(env, userId, projectId)
}

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  return cleanValue || null
}
