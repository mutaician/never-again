const TARGET_CHUNK_CHARS = 12_000
const HARD_CHUNK_CHARS = 16_000

export type TranscriptChunk = {
  chunkIndex: number
  text: string
  turnEnd: number
  turnStart: number
}

type TranscriptSegment = {
  end: number
  text: string
  start: number
}

export function chunkTranscript(text: string): TranscriptChunk[] {
  const segments = segmentTranscript(text)
  const chunks: TranscriptChunk[] = []
  let current: TranscriptSegment[] = []
  let currentLength = 0

  for (const segment of segments) {
    const segmentLength = segment.text.length

    if (
      current.length > 0 &&
      currentLength + segmentLength > TARGET_CHUNK_CHARS
    ) {
      chunks.push(toChunk(chunks.length, current))
      current = []
      currentLength = 0
    }

    if (segmentLength > HARD_CHUNK_CHARS) {
      const splitSegments = splitLargeSegment(segment)

      for (const splitSegment of splitSegments) {
        if (
          current.length > 0 &&
          currentLength + splitSegment.text.length > TARGET_CHUNK_CHARS
        ) {
          chunks.push(toChunk(chunks.length, current))
          current = []
          currentLength = 0
        }

        current.push(splitSegment)
        currentLength += splitSegment.text.length
      }

      continue
    }

    current.push(segment)
    currentLength += segmentLength
  }

  if (current.length > 0) {
    chunks.push(toChunk(chunks.length, current))
  }

  return chunks.length > 0
    ? chunks
    : [{ chunkIndex: 0, text: text.trim(), turnEnd: 0, turnStart: 0 }]
}

function segmentTranscript(text: string): TranscriptSegment[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const segments: TranscriptSegment[] = []
  let current: string[] = []
  let segmentStart = 0
  let segmentIndex = 0
  let insideFence = false
  let sawBoundary = false

  function flush() {
    const segmentText = current.join('\n').trim()
    if (!segmentText) return

    segments.push({
      end: segmentIndex,
      start: segmentStart,
      text: segmentText,
    })
    segmentIndex += 1
    current = []
    segmentStart = segmentIndex
  }

  for (const line of lines) {
    if (isFence(line)) {
      insideFence = !insideFence
    }

    if (!insideFence && isConversationBoundary(line)) {
      sawBoundary = true
      flush()
    }

    current.push(line)
  }

  flush()

  if (sawBoundary) return segments

  return paragraphSegments(text)
}

function paragraphSegments(text: string): TranscriptSegment[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return paragraphs.map((paragraph, index) => ({
    end: index,
    start: index,
    text: paragraph,
  }))
}

function splitLargeSegment(segment: TranscriptSegment): TranscriptSegment[] {
  const paragraphs = segment.text.split(/\n{2,}/).filter(Boolean)

  if (paragraphs.length <= 1) {
    return splitByLines(segment)
  }

  return paragraphs.map((paragraph, index) => ({
    end: segment.end,
    start: segment.start + index / 1000,
    text: paragraph.trim(),
  }))
}

function splitByLines(segment: TranscriptSegment): TranscriptSegment[] {
  const lines = segment.text.split('\n')
  const output: TranscriptSegment[] = []
  let current: string[] = []
  let currentLength = 0

  for (const line of lines) {
    if (current.length > 0 && currentLength + line.length > TARGET_CHUNK_CHARS) {
      output.push({
        end: segment.end,
        start: segment.start,
        text: current.join('\n').trim(),
      })
      current = []
      currentLength = 0
    }

    current.push(line)
    currentLength += line.length
  }

  if (current.length > 0) {
    output.push({
      end: segment.end,
      start: segment.start,
      text: current.join('\n').trim(),
    })
  }

  return output
}

function toChunk(
  chunkIndex: number,
  segments: TranscriptSegment[],
): TranscriptChunk {
  return {
    chunkIndex,
    text: segments.map((segment) => segment.text).join('\n\n'),
    turnEnd: Math.floor(segments[segments.length - 1].end),
    turnStart: Math.floor(segments[0].start),
  }
}

function isConversationBoundary(line: string): boolean {
  return /^\s*(user|assistant|system|developer|agent|cursor|composer|human)\s*:/i.test(line)
}

function isFence(line: string): boolean {
  return /^\s*```/.test(line)
}
