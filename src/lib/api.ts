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

function apiUrl(path: string): string {
  if (!apiBaseUrl) return path
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`
}
