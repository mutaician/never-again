import { getRequiredEnv, type Env } from './env'
import { ApiError } from './http'

type BackboardAssistantResponse = {
  assistant_id: string
  created_at?: string
  name: string
}

type BackboardMemoryResponse = {
  data?: {
    id?: string
    memory_id?: string
  }
  id?: string
  memory?: {
    id?: string
    memory_id?: string
  }
  memory_id?: string
  memory_operation_id?: string
  operation_id?: string
}

type BackboardMessageResponse = {
  content: string
  memory_operation_id?: string
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
  memory: 'Auto' | 'Readonly' | 'off'
  metadata: Record<string, unknown>
  model_name?: string
  stream: false
  web_search: 'off'
}

type BackboardMemorySearchResponse = {
  data?: unknown
  memories?: unknown
  results?: unknown
}

type BackboardMemoryHitRaw = {
  category?: unknown
  content?: unknown
  id?: unknown
  memory_id?: unknown
  memory?: unknown
  metadata?: unknown
  score?: unknown
  text?: unknown
  title?: unknown
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

export type SavedMemoryInput = {
  category: string
  confidence: number
  evidence: string
  futureRule: string
  importId: string | null
  lessonId: string
  problemPattern: string
  projectId: string
  projectName: string
  title: string
}

type LessonReductionResponse = {
  lessons?: unknown
}

export type PreflightMemoryInput = {
  category?: string
  content: string
  id: string
  metadata?: Record<string, unknown>
  score?: number
  source: 'backboard' | 'local'
  title?: string
}

export type PreflightRiskPattern = {
  explanation: string
  matchedMemoryIds: string[]
  severity: 'low' | 'medium' | 'high'
  title: string
}

export type PreflightResult = {
  agentRules: string[]
  agentsMd: string
  recommendedMvp: {
    defer: string[]
    firstVerticalSlice: string
    goal: string
    mustHave: string[]
  }
  riskPatterns: PreflightRiskPattern[]
  starterPrompt: string
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
  const url = `${baseUrl}/threads/messages`

  console.info('Never Again Backboard chunk request starting', {
    assistantId,
    chunkIndex: context.chunkIndex,
    projectName: context.projectName,
    urlHost: safeHost(url),
  })

  const response = await fetch(url, {
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

  console.info('Never Again Backboard chunk response received', {
    chunkIndex: context.chunkIndex,
    ok: response.ok,
    status: response.status,
    urlHost: safeHost(url),
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

export async function searchBackboardMemories(
  env: Env,
  assistantId: string,
  query: string,
  limit = 5,
): Promise<PreflightMemoryInput[]> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(
    `${baseUrl}/assistants/${encodeURIComponent(assistantId)}/memories/search`,
    {
      body: JSON.stringify({
        limit,
        query,
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      method: 'POST',
    },
  )

  if (!response.ok) {
    const message = await response.text()
    throw new ApiError(
      502,
      'server_error',
      `Backboard memory search failed: ${message}`,
    )
  }

  const data = (await response.json()) as BackboardMemorySearchResponse
  return normalizeMemoryHits(data)
}

export async function generatePreflightWithBackboard(
  env: Env,
  assistantId: string,
  projectIdea: string,
  memories: PreflightMemoryInput[],
): Promise<PreflightResult> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/threads/messages`, {
    body: JSON.stringify(withModelConfig(env, {
      assistant_id: assistantId,
      content: preflightPrompt(projectIdea, memories),
      json_output: true,
      memory: 'Readonly',
      metadata: {
        memoryCount: memories.length,
        source: 'never_again_preflight',
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
    throw new Error(`Backboard preflight failed: ${message}`)
  }

  const message = (await response.json()) as BackboardMessageResponse
  return parsePreflightResult(message.content)
}

export async function addBackboardMemory(
  env: Env,
  assistantId: string,
  input: SavedMemoryInput,
): Promise<string> {
  try {
    return await addManualBackboardMemory(env, assistantId, input)
  } catch (manualError) {
    return addApprovedLessonMemoryMessage(env, assistantId, input, manualError)
  }
}

async function addManualBackboardMemory(
  env: Env,
  assistantId: string,
  input: SavedMemoryInput,
): Promise<string> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(
    `${baseUrl}/assistants/${encodeURIComponent(assistantId)}/memories`,
    {
      body: JSON.stringify({
        content: memoryContent(input),
        metadata: memoryMetadata(input),
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      method: 'POST',
    },
  )

  if (!response.ok) {
    const message = await response.text()
    throw new ApiError(
      502,
      'server_error',
      `Backboard memory save failed: ${message}`,
    )
  }

  const responseText = await response.text()
  const memory = parseMemoryResponse(responseText)
  const memoryId =
    memory.memory_id ||
    memory.id ||
    memory.memory?.memory_id ||
    memory.memory?.id ||
    memory.data?.memory_id ||
    memory.data?.id ||
    memory.memory_operation_id ||
    memory.operation_id

  if (!memoryId) {
    throw new ApiError(
      502,
      'server_error',
      `Backboard memory response did not include memory_id: ${summarizeResponseText(responseText)}`,
    )
  }

  return memoryId
}

async function addApprovedLessonMemoryMessage(
  env: Env,
  assistantId: string,
  input: SavedMemoryInput,
  manualError: unknown,
): Promise<string> {
  const apiKey = getRequiredEnv(env, 'BACKBOARD_API_KEY')
  const baseUrl = (env.BACKBOARD_BASE_URL || 'https://app.backboard.io/api')
    .replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/threads/messages`, {
    body: JSON.stringify(withModelConfig(env, {
      assistant_id: assistantId,
      content: approvedMemoryPrompt(input),
      json_output: false,
      memory: 'Auto',
      metadata: {
        ...memoryMetadata(input),
        manual_memory_fallback: 'true',
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
    const fallbackMessage = await response.text()
    const manualMessage =
      manualError instanceof Error ? manualError.message : 'Manual memory save failed'

    throw new ApiError(
      502,
      'server_error',
      `${manualMessage}; fallback memory message failed: ${fallbackMessage}`,
    )
  }

  const message = (await response.json()) as BackboardMessageResponse
  const operationId = message.memory_operation_id

  if (!operationId) {
    throw new ApiError(
      502,
      'server_error',
      'Backboard fallback memory message did not include memory_operation_id',
    )
  }

  return `operation:${operationId}`
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

function memoryContent(input: SavedMemoryInput): string {
  return [
    `Builder lesson: ${input.title}`,
    `Category: ${input.category}`,
    `Pattern: ${input.problemPattern}`,
    `Future rule: ${input.futureRule}`,
    `Source evidence: ${input.evidence}`,
  ].join('\n')
}

function memoryMetadata(input: SavedMemoryInput): Record<string, string> {
  return {
    category: input.category,
    confidence: String(input.confidence),
    ...(input.importId ? { import_id: input.importId } : {}),
    lesson_id: input.lessonId,
    project_id: input.projectId,
    project_name: input.projectName,
    source: 'conversation_import',
    type: 'builder_lesson',
  }
}

function approvedMemoryPrompt(input: SavedMemoryInput): string {
  return `
The user has explicitly approved the following durable builder memory.
Store it as long-term memory for future project preflights.

${memoryContent(input)}
`.trim()
}

function preflightPrompt(
  projectIdea: string,
  memories: PreflightMemoryInput[],
): string {
  return `
You are running a Never Again preflight for a new AI coding project.

The builder wants to avoid repeating lessons from previous vibecoded projects.

New project idea:
${projectIdea}

Retrieved durable builder memories:
${JSON.stringify(memories, null, 2)}

Task:
- Use the retrieved memories as the primary evidence.
- Warn about likely failure patterns before implementation starts.
- Keep advice transferable and practical, not generic encouragement.
- Prefer scope control, validation workflow, agent-control rules, architecture sequencing, and deployment/testing risks.
- The recommended MVP must be a small vertical slice that can be demoed in a hackathon.
- agentRules should be commands the builder can give a coding agent during the build.
- starterPrompt should be ready to paste into a coding agent.
- agentsMd should be a short AGENTS.md starter that encodes the most important project rules.
- Do not save or mutate memory during this preflight.

Return only strict JSON. Do not wrap it in markdown code fences.

JSON shape:
{
  "summary": "short preflight summary",
  "riskPatterns": [
    {
      "title": "risk title",
      "severity": "low | medium | high",
      "matchedMemoryIds": ["memory id from retrieved memories"],
      "explanation": "why this risk matters for this idea"
    }
  ],
  "recommendedMvp": {
    "goal": "one sentence MVP goal",
    "mustHave": ["small required capability"],
    "defer": ["tempting capability to postpone"],
    "firstVerticalSlice": "first shippable slice"
  },
  "agentRules": ["clear instruction for the coding agent"],
  "starterPrompt": "paste-ready project kickoff prompt",
  "agentsMd": "short AGENTS.md content"
}

If no retrieved memory strongly matches, still produce a cautious brief and say which assumptions are weak.
`.trim()
}

function parseMemoryResponse(responseText: string): BackboardMemoryResponse {
  if (!responseText.trim()) return {}

  try {
    return JSON.parse(responseText) as BackboardMemoryResponse
  } catch {
    return {}
  }
}

function summarizeResponseText(responseText: string): string {
  const trimmed = responseText.trim()
  if (!trimmed) return '[empty response]'

  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed
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
- Treat verification workflows as high-value signals: isolated review views, asset workbenches, test harnesses, preview pages, checklists, screenshots, staged rollouts, and asking the user to inspect generated work before integration.
- When the agent creates a separate way for the user to verify work, extract the transferable pattern behind that collaboration.

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
- Strongly prefer lessons where the user learned how to verify AI-generated work: isolated workbenches, preview modes, test harnesses, review checkpoints, acceptance criteria, and "inspect before integrate" workflows.
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
- Bad lesson: "Open /?view=assets to inspect the launch pad."
- Better lesson: "Ask the agent to expose generated components in an isolated review surface before merging them into a complex flow."

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

function parsePreflightResult(content: string): PreflightResult {
  const parsed = JSON.parse(extractJsonPayload(content)) as Partial<PreflightResult>
  return normalizePreflightResult(parsed)
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

function normalizePreflightResult(value: Partial<PreflightResult>): PreflightResult {
  const recommendedMvp = normalizeRecommendedMvp(value.recommendedMvp)

  return {
    agentRules: normalizeStringArray(value.agentRules),
    agentsMd: normalizeText(value.agentsMd),
    recommendedMvp,
    riskPatterns: normalizeRiskPatterns(value.riskPatterns),
    starterPrompt: normalizeText(value.starterPrompt),
    summary: normalizeText(value.summary),
  }
}

function normalizeRecommendedMvp(value: unknown): PreflightResult['recommendedMvp'] {
  if (!value || typeof value !== 'object') {
    return {
      defer: [],
      firstVerticalSlice: '',
      goal: '',
      mustHave: [],
    }
  }

  const mvp = value as Partial<PreflightResult['recommendedMvp']>

  return {
    defer: normalizeStringArray(mvp.defer),
    firstVerticalSlice: normalizeText(mvp.firstVerticalSlice),
    goal: normalizeText(mvp.goal),
    mustHave: normalizeStringArray(mvp.mustHave),
  }
}

function normalizeRiskPatterns(value: unknown): PreflightRiskPattern[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const risk = item as Partial<PreflightRiskPattern>

      return {
        explanation: normalizeText(risk.explanation),
        matchedMemoryIds: normalizeStringArray(risk.matchedMemoryIds),
        severity: normalizeSeverity(risk.severity),
        title: normalizeText(risk.title),
      }
    })
    .filter((risk): risk is PreflightRiskPattern => {
      if (!risk) return false
      return Boolean(risk.title && risk.explanation)
    })
}

function normalizeMemoryHits(value: unknown): PreflightMemoryInput[] {
  const hits = extractMemoryHits(value)

  return hits
    .map((hit): PreflightMemoryInput | null => {
      if (!hit || typeof hit !== 'object') return null

      const raw = hit as BackboardMemoryHitRaw
      const metadata = normalizeRecord(raw.metadata)
      const nestedMemory =
        raw.memory && typeof raw.memory === 'object'
          ? (raw.memory as BackboardMemoryHitRaw)
          : null
      const nestedMetadata = normalizeRecord(nestedMemory?.metadata)
      const content =
        normalizeText(raw.content) ||
        normalizeText(raw.text) ||
        normalizeText(nestedMemory?.content) ||
        normalizeText(nestedMemory?.text)

      if (!content) return null

      return {
        category:
          normalizeText(raw.category) ||
          normalizeText(metadata.category) ||
          normalizeText(nestedMetadata.category) ||
          undefined,
        content,
        id:
          normalizeText(raw.id) ||
          normalizeText(raw.memory_id) ||
          normalizeText(nestedMemory?.id) ||
          normalizeText(nestedMemory?.memory_id) ||
          crypto.randomUUID(),
        metadata: {
          ...nestedMetadata,
          ...metadata,
        },
        score: normalizeOptionalNumber(raw.score),
        source: 'backboard',
        title:
          normalizeText(raw.title) ||
          normalizeText(metadata.title) ||
          normalizeText(nestedMemory?.title) ||
          undefined,
      }
    })
    .filter((memory): memory is PreflightMemoryInput => Boolean(memory))
}

function extractMemoryHits(value: unknown): unknown[] {
  if (Array.isArray(value)) return value

  if (!value || typeof value !== 'object') return []

  const response = value as BackboardMemorySearchResponse

  if (Array.isArray(response.memories)) return response.memories
  if (Array.isArray(response.data)) return response.data
  if (Array.isArray(response.results)) return response.results

  return []
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

function normalizeSeverity(value: unknown): PreflightRiskPattern['severity'] {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0)
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) return value

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }

  return undefined
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  return cleanValue || null
}

function safeHost(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return 'invalid_url'
  }
}
