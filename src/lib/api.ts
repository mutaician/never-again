export type ApiSession =
  | {
      message: string
      status: 'skipped' | 'loading' | 'error'
      user: null
    }
  | {
      message: string | null
      status: 'ready' | 'pending'
      user: ApiUser
    }

export type ApiUser = {
  auth0Sub: string
  backboardAssistantId: string | null
  email: string | null
  id: string
  name: string | null
}

export type Project = {
  created_at: string
  description: string | null
  id: string
  name: string
  outcome: string | null
  source_platform: string | null
  updated_at: string
  user_id: string
}

export type ImportRecord = {
  id: string
  original_size_bytes: number | null
  project_id: string
  raw_r2_key: string
  source_platform: string | null
  status: string
}

export type ImportJob = {
  id: string
  import_id: string
  progress: number
  status: string
  type: string
}

export type CreateImportInput = {
  projectName: string
  sourcePlatform: string
  transcript: string
}

export type CreateImportResult = {
  import: ImportRecord
  job: ImportJob
  project: Project
}

type MeResponse = {
  assistant: {
    created: boolean
    message: string | null
    status: 'pending' | 'creating' | 'ready' | 'error'
  }
  user: ApiUser
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''

export const hasApiAudience = Boolean(import.meta.env.VITE_AUTH0_AUDIENCE)

export async function fetchMe(accessToken: string): Promise<ApiSession> {
  const response = await fetch(apiUrl('/api/me'), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const message =
      errorBody?.error?.message || `API request failed with ${response.status}`

    return {
      message,
      status: 'error',
      user: null,
    }
  }

  const data = (await response.json()) as MeResponse

  return {
    message: data.assistant.message,
    status: data.assistant.status === 'ready' ? 'ready' : 'pending',
    user: data.user,
  }
}

export async function createTranscriptImport(
  accessToken: string,
  input: CreateImportInput,
): Promise<CreateImportResult> {
  return apiRequest<CreateImportResult>(accessToken, '/api/imports', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export async function fetchProjects(accessToken: string): Promise<Project[]> {
  const data = await apiRequest<{ projects: Project[] }>(accessToken, '/api/projects')
  return data.projects
}

async function apiRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const message =
      errorBody?.error?.message || `API request failed with ${response.status}`

    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function apiUrl(path: string): string {
  if (!apiBaseUrl) return path
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`
}
