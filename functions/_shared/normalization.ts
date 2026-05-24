const COMMAND_LANGUAGES = new Set([
  'bash',
  'cmd',
  'console',
  'fish',
  'powershell',
  'ps1',
  'shell',
  'sh',
  'terminal',
  'zsh',
])

const TEXT_LANGUAGES = new Set([
  '',
  'log',
  'markdown',
  'md',
  'plain',
  'plaintext',
  'text',
  'txt',
])

const CODE_LANGUAGES = new Set([
  'c',
  'cpp',
  'cs',
  'css',
  'go',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'php',
  'py',
  'python',
  'rb',
  'rs',
  'rust',
  'sql',
  'svelte',
  'swift',
  'toml',
  'ts',
  'tsx',
  'vue',
  'xml',
  'yaml',
  'yml',
])

const CODE_RUN_MIN_LINES = 8

export type NormalizedTranscript = {
  compressedBlockCount: number
  normalizedLineCount: number
  originalLineCount: number
  preservedCommandBlockCount: number
  redactedSecretCount: number
  text: string
}

type NormalizationStats = {
  compressedBlockCount: number
  preservedCommandBlockCount: number
  redactedSecretCount: number
}

type RedactionResult = {
  count: number
  text: string
}

export function normalizeTranscript(transcript: string): NormalizedTranscript {
  const stats: NormalizationStats = {
    compressedBlockCount: 0,
    preservedCommandBlockCount: 0,
    redactedSecretCount: 0,
  }
  const originalLineCount = lineCount(transcript)
  const normalized = normalizeFencedBlocks(transcript, stats)
  const normalizedLineCount = lineCount(normalized)

  return {
    compressedBlockCount: stats.compressedBlockCount,
    normalizedLineCount,
    originalLineCount,
    preservedCommandBlockCount: stats.preservedCommandBlockCount,
    redactedSecretCount: stats.redactedSecretCount,
    text: normalized,
  }
}

function normalizeFencedBlocks(
  transcript: string,
  stats: NormalizationStats,
): string {
  const lines = transcript.replace(/\r\n/g, '\n').split('\n')
  const output: string[] = []
  let index = 0

  while (index < lines.length) {
    const fence = fenceStart(lines[index])

    if (!fence) {
      const plainRun: string[] = []

      while (index < lines.length && !fenceStart(lines[index])) {
        plainRun.push(lines[index])
        index += 1
      }

      output.push(...normalizePlainTextLines(plainRun, stats))
      continue
    }

    const blockLines: string[] = []
    index += 1

    while (index < lines.length && !isFenceEnd(lines[index])) {
      blockLines.push(lines[index])
      index += 1
    }

    if (index < lines.length) index += 1

    output.push(normalizeFencedBlock(fence.language, blockLines, stats))
  }

  return output.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()
}

function normalizePlainTextLines(
  lines: string[],
  stats: NormalizationStats,
): string[] {
  const output: string[] = []
  let codeRun: string[] = []

  function flushCodeRun() {
    if (codeRun.length === 0) return

    if (codeRun.length >= CODE_RUN_MIN_LINES && codeSignalRatio(codeRun) > 0.68) {
      output.push(compressedBlock('plain-text-code', codeRun))
      stats.compressedBlockCount += 1
    } else {
      const redacted = redactSecrets(codeRun.join('\n'))
      stats.redactedSecretCount += redacted.count
      output.push(...redacted.text.split('\n'))
    }

    codeRun = []
  }

  for (const line of lines) {
    if (isConversationBoundary(line) || isCommandLine(line) || !isCodeLikeLine(line)) {
      flushCodeRun()

      const redacted = redactSecrets(line)
      stats.redactedSecretCount += redacted.count
      output.push(redacted.text)
      continue
    }

    codeRun.push(line)
  }

  flushCodeRun()
  return output
}

function normalizeFencedBlock(
  language: string,
  blockLines: string[],
  stats: NormalizationStats,
): string {
  const normalizedLanguage = language.toLowerCase()
  const blockText = blockLines.join('\n')

  if (
    COMMAND_LANGUAGES.has(normalizedLanguage) ||
    hasMostlyCommandLines(blockLines)
  ) {
    const redacted = redactSecrets(blockText)
    stats.redactedSecretCount += redacted.count
    stats.preservedCommandBlockCount += 1
    return fencedBlock(language || 'bash', redacted.text)
  }

  if (
    CODE_LANGUAGES.has(normalizedLanguage) ||
    (!TEXT_LANGUAGES.has(normalizedLanguage) && codeSignalRatio(blockLines) > 0.55)
  ) {
    stats.compressedBlockCount += 1
    return compressedBlock(language || 'code', blockLines)
  }

  const redacted = redactSecrets(blockText)
  stats.redactedSecretCount += redacted.count
  return fencedBlock(language || 'text', redacted.text)
}

function redactSecrets(text: string): RedactionResult {
  let count = 0

  const redact = (value: string): string => {
    count += 1
    const key = value.match(/^([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL)[A-Z0-9_]*)=/i)

    if (key) return `${key[1]}=[REDACTED]`

    if (value.startsWith('Bearer ')) return 'Bearer [REDACTED]'
    if (value.startsWith('-----BEGIN ')) return '[REDACTED PRIVATE KEY]'
    return '[REDACTED_SECRET]'
  }

  const redactedText = text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, redact)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g, redact)
    .replace(/\b(sk-[A-Za-z0-9_-]{20,})\b/g, redact)
    .replace(/\b(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, redact)
    .replace(/\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/g, redact)
    .replace(
      /\b([A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|DATABASE_URL|PRIVATE_KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)=(["']?)[^\s"']{8,}\2/gi,
      redact,
    )

  return {
    count,
    text: redactedText,
  }
}

function fenceStart(line: string): { language: string } | null {
  const match = line.match(/^\s*```([A-Za-z0-9_+.#-]*)?.*$/)
  if (!match) return null

  return {
    language: match[1] || '',
  }
}

function isFenceEnd(line: string): boolean {
  return /^\s*```\s*$/.test(line)
}

function fencedBlock(language: string, text: string): string {
  return `\`\`\`${language}\n${text.trim()}\n\`\`\``
}

function compressedBlock(language: string, lines: string[]): string {
  const chars = lines.join('\n').length
  return `[compressed code block: language=${language || 'unknown'}, lines=${lines.length}, chars=${chars}]`
}

function isConversationBoundary(line: string): boolean {
  return /^\s*(user|assistant|system|developer|agent|cursor|composer|human)\s*:/i.test(line)
}

function isCommandLine(line: string): boolean {
  return /^\s*(?:[$>❯]\s+|(?:pnpm|npm|yarn|bun|git|npx|curl|wrangler|node|python|python3|pip|uv|cargo|go|docker|kubectl|psql|sqlite3|ls|cd|mkdir|cp|mv|rm|cat|sed|rg)\b)/.test(
    line,
  )
}

function hasMostlyCommandLines(lines: string[]): boolean {
  const meaningfulLines = lines.filter((line) => line.trim())
  if (meaningfulLines.length === 0) return false

  const commandLines = meaningfulLines.filter(isCommandLine)
  return commandLines.length / meaningfulLines.length > 0.55
}

function isCodeLikeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (isCommandLine(trimmed)) return false
  if (/^(import|export|from|const|let|var|function|class|interface|type|enum)\b/.test(trimmed)) return true
  if (/^(def|class|from|import)\b/.test(trimmed)) return true
  if (/^[}\])};,]+$/.test(trimmed)) return true
  if (/[{}()[\];]/.test(trimmed) && /[=:]/.test(trimmed)) return true
  if (/^\s{2,}\S/.test(line) && /[{}()[\];=]/.test(trimmed)) return true
  if (/^<\/?[A-Za-z][^>]*>$/.test(trimmed)) return true
  if (/^["']?[A-Za-z0-9_-]+["']?\s*:\s*["'{[\d]/.test(trimmed)) return true

  return false
}

function codeSignalRatio(lines: string[]): number {
  const meaningfulLines = lines.filter((line) => line.trim())
  if (meaningfulLines.length === 0) return 0

  return meaningfulLines.filter(isCodeLikeLine).length / meaningfulLines.length
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.split(/\r\n|\r|\n/).length
}
