import { ConfigError, type Env } from './env'

export type ApiErrorCode =
  | 'auth_required'
  | 'bad_request'
  | 'config_error'
  | 'database_not_bound'
  | 'method_not_allowed'
  | 'server_error'
  | 'storage_not_bound'

export class ApiError extends Error {
  code: ApiErrorCode
  status: number

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function jsonResponse(
  env: Env,
  body: unknown,
  init: ResponseInit = {},
): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders(env),
      ...init.headers,
    },
  })
}

export function errorResponse(
  env: Env,
  status: number,
  code: ApiErrorCode,
  message: string,
): Response {
  return jsonResponse(env, { error: { code, message } }, { status })
}

export function optionsResponse(env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  })
}

export function corsHeaders(env: Env): HeadersInit {
  const origin = env.FRONTEND_ORIGIN || '*'

  return {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
}

export function bearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) return null

  return authHeader.slice('Bearer '.length).trim()
}

export function configErrorResponse(env: Env, error: unknown): Response | null {
  if (!(error instanceof ConfigError)) return null

  return errorResponse(env, 500, 'config_error', error.message)
}

export function apiErrorResponse(env: Env, error: unknown): Response | null {
  if (!(error instanceof ApiError)) return null

  return errorResponse(env, error.status, error.code, error.message)
}
