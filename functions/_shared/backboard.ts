import { getRequiredEnv, type Env } from './env'

type BackboardAssistantResponse = {
  assistant_id: string
  created_at?: string
  name: string
}

type BackboardMessageResponse = {
  content: string
  message_id?: string
  model_name?: string
  model_provider?: string
  status?: string
  thread_id?: string
  total_tokens?: number
}

type BackboardMessageRequest = {
  assistant_id: string
  content: string
  json_output: boolean
  llm_provider?: string
  memory: 'off'
  metadata: Record<string, unknown>
  model_name?: string
  stream: false
  web_search: 'off'
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

export type ReducerFinding = ChunkFinding & {
  sourceChunkIndex: number
}

export type LessonDraft = {
  category: ChunkFinding['category']
  confidence: number
  evidence: string
  futureRule: string
  problemPattern: string
  title: string
}

type LessonReductionResponse = {
  lessons?: unknown
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
    body: JSON.stringify(withModelConfig(env, {
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
    })),
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

export async function reduceFindingsWithBackboard(
  env: Env,
  assistantId: string,
  findings: ReducerFinding[],
  context: {
    projectName: string
  },
): Promise<LessonDraft[]> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/threads/messages`, {
    body: JSON.stringify(withModelConfig(env, {
      assistant_id: assistantId,
      content: findingsReductionPrompt(findings, context),
      json_output: true,
      memory: 'off',
      metadata: {
        findingCount: findings.length,
        projectName: context.projectName,
        source: 'never_again_findings_reduction',
      },
      stream: false,
      web_search: 'off',
    })),
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    method: 'POST',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Backboard findings reduction failed: ${message}`)
  }

  const message = (await response.json()) as BackboardMessageResponse
  return parseLessonReduction(message.content)
}

function assistantName(userName: string | null): string {
  if (!userName) return 'Never Again Builder Memory'
  return `Never Again Builder Memory - ${userName}`.slice(0, 255)
}

function withModelConfig(
  env: Env,
  body: BackboardMessageRequest,
): BackboardMessageRequest {
  const llmProvider = cleanOptional(env.BACKBOARD_LLM_PROVIDER)
  const modelName = cleanOptional(env.BACKBOARD_MODEL_NAME)

  return {
    ...body,
    ...(llmProvider ? { llm_provider: llmProvider } : {}),
    ...(modelName ? { model_name: modelName } : {}),
  }
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
- Extract only signals that could become reusable builder lessons.
- Ignore generic facts like "the user used React" unless they explain a failure pattern.
- Do not summarize code.
- Preserve command-related lessons when shell commands reveal workflow or tooling pain.
- Focus on corrections, repeated failures, scope drift, agent mistakes, unclear requirements, hidden complexity, testing gaps, deployment issues, and "next time" statements.
- Do not create feature backlog items or bug tickets.
- A useful finding must reveal a project-independent builder pattern, such as scoping, architecture, testing, prompting, workflow, dependency choice, verification strategy, or agent control.
- If the only lesson is "fix this specific UI/game/simulation behavior", omit it.
- Write futureRuleCandidate as a transferable rule that could help in a different project. Avoid project nouns in the rule unless absolutely necessary.

Return only strict JSON. Do not wrap it in markdown code fences.

JSON shape:
{
  "summary": "short chunk summary",
  "findings": [
    {
      "title": "short lesson title",
      "category": "scope | architecture | agent_behavior | prompting | domain_knowledge | testing | ux | tooling | deployment | unknown",
      "problemPattern": "the reusable pattern behind what went wrong or almost went wrong",
      "evidence": "specific evidence from the conversation chunk",
      "futureRuleCandidate": "actionable project-independent next-time rule",
      "confidence": 0.0
    }
  ]
}

If this chunk has no useful builder lessons, return an empty findings array.

Conversation chunk:
${chunkText}
`.trim()
}

function findingsReductionPrompt(
  findings: ReducerFinding[],
  context: {
    projectName: string
  },
): string {
  return `
You are reducing chunk-level findings into final lesson drafts for Never Again.

Project: ${context.projectName}

Task:
- Merge duplicate or overlapping findings.
- Remove generic observations that would not help the builder next time.
- Remove feature backlog items, one-off bug fixes, and project-specific implementation advice.
- Resolve conflicts by choosing the most specific, evidence-backed lesson.
- Preserve concrete evidence and cite source chunk numbers when useful.
- Generalize the lesson so it can apply to a completely different future project.
- Prefer lessons about scoping, architecture, test strategy, prompt/process control, dependency feasibility, integration order, and validation workflow.
- Merge aggressively. Produce 3 to 6 high-signal lessons, not a long list of symptoms.
- Produce reviewable lesson drafts only. Do not save memory.

Transferability gate:
- Keep a lesson only if it would still help for at least two different project types, such as a SaaS dashboard, CLI tool, game, data app, mobile app, or automation workflow.
- Titles and future rules should not read like simulator tasks. Avoid words like mission, rocket, Earth, Orion, timer, zoom, camera, scene, or trajectory unless the lesson truly cannot be expressed more generally.
- Evidence can stay specific because it explains where the lesson came from.
- Bad lesson: "Implement a mandatory mission precheck before starting the simulation timer."
- Better lesson: "Define explicit start conditions before building autonomous or time-based flows."
- Bad lesson: "Allow user control over camera zoom."
- Better lesson: "Preserve user orientation and recovery controls before adding immersive presentation layers."
- Bad lesson: "Verify visual assets in a broken mission scene."
- Better lesson: "Create isolated verification surfaces for complex assets before integrating them into the main experience."

Return only strict JSON. Do not wrap it in markdown code fences.

JSON shape:
{
  "lessons": [
    {
      "title": "short transferable lesson title",
      "category": "scope | architecture | agent_behavior | prompting | domain_knowledge | testing | ux | tooling | deployment | unknown",
      "problemPattern": "the reusable failure pattern",
      "evidence": "specific evidence from the findings, with chunk references when useful",
      "futureRule": "actionable project-independent next-time rule",
      "confidence": 0.0
    }
  ]
}

If there are no durable lessons, return an empty lessons array.

Chunk findings:
${JSON.stringify(findings, null, 2)}
`.trim()
}

function parseChunkAnalysis(content: string): ChunkAnalysisResult {
  const parsed = JSON.parse(extractJsonPayload(content)) as Partial<ChunkAnalysisResult>

  return {
    findings: normalizeFindings(parsed.findings),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}

function parseLessonReduction(content: string): LessonDraft[] {
  const parsed = JSON.parse(extractJsonPayload(content)) as LessonReductionResponse
  return normalizeLessons(parsed.lessons)
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

function normalizeLessons(value: unknown): LessonDraft[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const lesson = item as Partial<LessonDraft>

      return {
        category: normalizeCategory(lesson.category),
        confidence: normalizeConfidence(lesson.confidence),
        evidence: normalizeText(lesson.evidence),
        futureRule: normalizeText(lesson.futureRule),
        problemPattern: normalizeText(lesson.problemPattern),
        title: normalizeText(lesson.title),
      }
    })
    .filter((lesson): lesson is LessonDraft => {
      if (!lesson) return false
      return Boolean(lesson.title && lesson.problemPattern && lesson.futureRule)
    })
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

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  return cleanValue || null
}
