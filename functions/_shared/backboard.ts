import { getRequiredEnv, type Env } from './env'

type BackboardAssistantResponse = {
  assistant_id: string
  created_at?: string
  name: string
}

export async function createBackboardAssistant(
  env: Env,
  userName: string | null,
): Promise<string> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/assistants`, {
    body: JSON.stringify({
      name: assistantName(userName),
      system_prompt:
        'You are the durable builder memory profile for Never Again. Store only approved project lessons and use them to help the builder scope future AI coding projects.',
      tok_k: 10,
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    method: 'POST',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Backboard assistant creation failed: ${message}`)
  }

  const assistant = (await response.json()) as BackboardAssistantResponse

  if (!assistant.assistant_id) {
    throw new Error('Backboard response did not include assistant_id')
  }

  return assistant.assistant_id
}

function assistantName(userName: string | null): string {
  if (!userName) return 'Never Again Builder Memory'
  return `Never Again Builder Memory - ${userName}`.slice(0, 255)
}
