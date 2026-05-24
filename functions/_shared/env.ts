export type Env = {
  APP_ENV?: string
  AUTH0_AUDIENCE?: string
  AUTH0_DOMAIN?: string
  BACKBOARD_API_KEY?: string
  BACKBOARD_BASE_URL?: string
  BACKBOARD_LLM_PROVIDER?: string
  BACKBOARD_MODEL_NAME?: string
  DB?: D1Database
  FRONTEND_ORIGIN?: string
  TRANSCRIPTS_BUCKET?: R2Bucket
}

export function getRequiredEnv(env: Env, key: keyof Env): string {
  const value = env[key]

  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${key} is not configured`)
  }

  return value
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}
