import { verifyAuth0Token } from './auth0'
import type { Env } from './env'
import { ApiError, bearerToken } from './http'
import { getOrCreateUser, type UserRow } from './users'

export type RequestSession = {
  user: UserRow
}

export async function requireRequestSession(
  env: Env,
  request: Request,
): Promise<RequestSession> {
  const token = bearerToken(request)

  if (!token) {
    throw new ApiError(401, 'auth_required', 'Missing bearer token')
  }

  if (!env.DB) {
    throw new ApiError(500, 'database_not_bound', 'D1 binding DB is not configured')
  }

  const profile = await verifyAuth0Token(env, token)
  const result = await getOrCreateUser(env, profile)

  return {
    user: result.user,
  }
}
