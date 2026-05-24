import { getRequiredEnv, type Env } from './env'

type BackboardAssistantResponse = {
  assistant_id: string
  created_at?: string
  name: string
}

type BackboardMessageResponse = {
  content: string
  message_id?: string
  status?: string
  thread_id?: string
  total_tokens?: number
}

export type ChunkFinding = {
  category:
    | 'scope'
    | 'architecture'
    | 'agent_behavior'
    | 'prompting'
    | 'domain_knowledge'
    | 'testing'
    | 'ux'
    | 'tooling'
    | 'deployment'
    | 'unknown'
  confidence: number
  evidence: string
  futureRuleCandidate: string
  problemPattern: string
  title: string
}

export type ChunkAnalysisResult = {
  findings: ChunkFinding[]
  summary: string
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

export async function analyzeChunkWithBackboard(
  env: Env,
  assistantId: string,
  chunkText: string,
  context: {
    chunkIndex: number
    projectName: string
  },
): Promise<ChunkAnalysisResult> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/threads/messages`, {
    body: JSON.stringify({
      assistant_id: assistantId,
      content: chunkAnalysisPrompt(chunkText, context),
      json_output: true,
      memory: 'off',
      metadata: {
        chunkIndex: context.chunkIndex,
        projectName: context.projectName,
        source: 'never_again_chunk_analysis',
      },
      stream: false,
      web_search: 'off',
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    method: 'POST',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Backboard chunk analysis failed: ${message}`)
  }

  const message = (await response.json()) as BackboardMessageResponse
  return parseChunkAnalysis(message.content)
}

function assistantName(userName: string | null): string {
  if (!userName) return 'Never Again Builder Memory'
  return `Never Again Builder Memory - ${userName}`.slice(0, 255)
}

function chunkAnalysisPrompt(
  chunkText: string,
  context: {
    chunkIndex: number
    projectName: string
  },
): string {
  return `
You are analyzing one chunk from an AI coding conversation for Never Again.

Project: ${context.projectName}
Chunk index: ${context.chunkIndex}

Task:
- Extract only reusable builder lessons from this chunk.
- Ignore generic facts like "the user used React" unless they explain a failure pattern.
- Do not summarize code.
- Preserve command-related lessons when shell commands reveal workflow or tooling pain.
- Focus on corrections, repeated failures, scope drift, agent mistakes, unclear requirements, hidden complexity, testing gaps, deployment issues, and "next time" statements.

Return only strict JSON. Do not wrap it in markdown code fences.

JSON shape:
{
  "summary": "short chunk summary",
  "findings": [
    {
      "title": "short lesson title",
      "category": "scope | architecture | agent_behavior | prompting | domain_knowledge | testing | ux | tooling | deployment | unknown",
      "problemPattern": "what went wrong or almost went wrong",
      "evidence": "specific evidence from the conversation chunk",
      "futureRuleCandidate": "actionable next-time rule",
      "confidence": 0.0
    }
  ]
}

If this chunk has no useful builder lessons, return an empty findings array.

Conversation chunk:
${chunkText}
`.trim()
}

function parseChunkAnalysis(content: string): ChunkAnalysisResult {
  const parsed = JSON.parse(extractJsonPayload(content)) as Partial<ChunkAnalysisResult>

  return {
    findings: normalizeFindings(parsed.findings),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}

function extractJsonPayload(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const firstObjectBrace = trimmed.indexOf('{')
  const lastObjectBrace = trimmed.lastIndexOf('}')

  if (firstObjectBrace >= 0 && lastObjectBrace > firstObjectBrace) {
    return trimmed.slice(firstObjectBrace, lastObjectBrace + 1)
  }

  return trimmed
}

function normalizeFindings(value: unknown): ChunkFinding[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const finding = item as Partial<ChunkFinding>

      return {
        category: normalizeCategory(finding.category),
        confidence: normalizeConfidence(finding.confidence),
        evidence: normalizeText(finding.evidence),
        futureRuleCandidate: normalizeText(finding.futureRuleCandidate),
        problemPattern: normalizeText(finding.problemPattern),
        title: normalizeText(finding.title),
      }
    })
    .filter((finding): finding is ChunkFinding => {
      if (!finding) return false
      return Boolean(finding.title && finding.problemPattern && finding.futureRuleCandidate)
    })
}

function normalizeCategory(value: unknown): ChunkFinding['category'] {
  const categories = new Set<ChunkFinding['category']>([
    'scope',
    'architecture',
    'agent_behavior',
    'prompting',
    'domain_knowledge',
    'testing',
    'ux',
    'tooling',
    'deployment',
    'unknown',
  ])

  return typeof value === 'string' && categories.has(value as ChunkFinding['category'])
    ? (value as ChunkFinding['category'])
    : 'unknown'
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5
  if (value > 1) return Math.min(1, value / 100)
  return Math.max(0, Math.min(1, value))
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
