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
  normalized_r2_key: string | null
  original_size_bytes: number | null
  project_id: string
  raw_r2_key: string
  redacted_secret_count: number
  source_platform: string | null
  status: string
}

export type ImportJob = {
  error_message?: string | null
  id: string
  import_id: string
  progress: number
  status: string
  type: string
}

export type Lesson = {
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

export type UpdateLessonInput = {
  category?: string
  evidence?: string
  futureRule?: string
  problemPattern?: string
  title?: string
}

export type CreateManualLessonInput = UpdateLessonInput & {
  projectName?: string
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

export async function fetchLessons(
  accessToken: string,
  status?: string,
): Promise<Lesson[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const data = await apiRequest<{ lessons: Lesson[] }>(
    accessToken,
    `/api/lessons${query}`,
  )
  return data.lessons
}

export async function fetchLessonDrafts(accessToken: string): Promise<Lesson[]> {
  return fetchLessons(accessToken, 'draft')
}

export async function createManualLesson(
  accessToken: string,
  input: CreateManualLessonInput,
): Promise<Lesson> {
  const data = await apiRequest<{ lesson: Lesson }>(accessToken, '/api/lessons', {
    body: JSON.stringify(input),
    method: 'POST',
  })
  return data.lesson
}

export async function fetchImportJob(
  accessToken: string,
  jobId: string,
): Promise<ImportJob> {
  const data = await apiRequest<{ job: ImportJob }>(accessToken, `/api/jobs/${jobId}`)
  return data.job
}

export async function updateLesson(
  accessToken: string,
  lessonId: string,
  input: UpdateLessonInput,
): Promise<Lesson> {
  const data = await apiRequest<{ lesson: Lesson }>(accessToken, `/api/lessons/${lessonId}`, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
  return data.lesson
}

export async function approveLesson(
  accessToken: string,
  lessonId: string,
): Promise<Lesson> {
  const data = await apiRequest<{ lesson: Lesson }>(
    accessToken,
    `/api/lessons/${lessonId}/approve`,
    { method: 'POST' },
  )
  return data.lesson
}

export async function rejectLesson(
  accessToken: string,
  lessonId: string,
): Promise<Lesson> {
  const data = await apiRequest<{ lesson: Lesson }>(
    accessToken,
    `/api/lessons/${lessonId}/reject`,
    { method: 'POST' },
  )
  return data.lesson
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
