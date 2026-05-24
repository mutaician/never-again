import type { Auth0Profile } from './auth0'
import { createBackboardAssistant } from './backboard'
import type { Env } from './env'

export type UserRow = {
  assistant_status: 'pending' | 'creating' | 'ready' | 'error'
  auth0_sub: string
  backboard_assistant_id: string | null
  created_at: string
  email: string | null
  id: string
  name: string | null
  updated_at: string
}

export type UserProvisionResult = {
  assistantCreated: boolean
  assistantMessage: string | null
  user: UserRow
}

export async function getOrCreateUser(
  env: Env,
  profile: Auth0Profile,
): Promise<UserProvisionResult> {
  if (!env.DB) {
    throw new Error('D1 binding DB is not configured')
  }

  const existing = await findUserByAuth0Sub(env.DB, profile.sub)
  const user = existing || (await insertUser(env.DB, profile))

  return provisionAssistantIfPossible(env, user)
}

async function findUserByAuth0Sub(
  db: D1Database,
  auth0Sub: string,
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE auth0_sub = ?')
    .bind(auth0Sub)
    .first<UserRow>()
}

async function insertUser(
  db: D1Database,
  profile: Auth0Profile,
): Promise<UserRow> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  await db
    .prepare(
      `INSERT OR IGNORE INTO users (
        id,
        auth0_sub,
        email,
        name,
        assistant_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(id, profile.sub, profile.email, profile.name, now, now)
    .run()

  const user = await findUserByAuth0Sub(db, profile.sub)

  if (!user) {
    throw new Error('Unable to create user')
  }

  return user
}

async function provisionAssistantIfPossible(
  env: Env,
  user: UserRow,
): Promise<UserProvisionResult> {
  if (user.backboard_assistant_id) {
    return {
      assistantCreated: false,
      assistantMessage: null,
      user,
    }
  }

  if (!env.BACKBOARD_API_KEY) {
    return {
      assistantCreated: false,
      assistantMessage: 'BACKBOARD_API_KEY is not configured yet',
      user,
    }
  }

  const now = new Date().toISOString()
  const claim = await env.DB!
    .prepare(
      `UPDATE users
       SET assistant_status = 'creating', updated_at = ?
       WHERE id = ?
         AND backboard_assistant_id IS NULL
         AND assistant_status != 'creating'`,
    )
    .bind(now, user.id)
    .run()

  if (claim.meta.changes === 0) {
    const freshUser = await findUserByAuth0Sub(env.DB!, user.auth0_sub)

    return {
      assistantCreated: false,
      assistantMessage: 'Assistant provisioning is already in progress',
      user: freshUser || user,
    }
  }

  try {
    const assistantId = await createBackboardAssistant(env, user.name)
    const updatedAt = new Date().toISOString()

    await env.DB!
      .prepare(
        `UPDATE users
         SET backboard_assistant_id = ?,
             assistant_status = 'ready',
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(assistantId, updatedAt, user.id)
      .run()

    const freshUser = await findUserByAuth0Sub(env.DB!, user.auth0_sub)

    if (!freshUser) {
      throw new Error('Unable to reload user after assistant provisioning')
    }

    return {
      assistantCreated: true,
      assistantMessage: null,
      user: freshUser,
    }
  } catch (error) {
    await env.DB!
      .prepare(
        `UPDATE users
         SET assistant_status = 'error',
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(new Date().toISOString(), user.id)
      .run()

    throw error
  }
}
