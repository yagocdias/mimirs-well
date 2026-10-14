/**
 * Mimir's Well — the meter, drawn above the prompt.
 *
 * WHY A MOD
 * The classic hook's one-line meter (`systemMessage`) is drawn by the terminal
 * only; the desktop app shows nothing, and a plugin can't install a status
 * line. A band above the prompt is drawn by both, every turn, and reads the
 * engine's own figures (`$.session.usage()`: the real window, not a guess).
 *
 * The cost signal stays with the classic hook, which tells Claude; this band
 * only shows the person where the session stands.
 */

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Opening, Reading } from '../types'

const reading = atom({ plugin: 'mimirs-well', key: 'reading' } as const, null as Reading | null)
const opening = atom({ plugin: 'mimirs-well', key: 'opening' } as const, null as Opening | null)

const COST_FACTOR = 4
const RED_PCT = 70
const YELLOW_FLOOR_PCT = 15

/** Must stay identical to scripts/meter.cjs#levelOf. */
export function levelOf(context: number, first: number, window: number, costFactor: number, redPct: number) {
  const pct = (100 * context) / window
  if (pct >= redPct) return 2
  if (first > 0 && context / first >= costFactor && pct >= YELLOW_FLOOR_PCT) return 1
  return 0
}

const k = (n: number) => Math.round(n / 1000) + 'k'
const windowLabel = (w: number) => (w >= 1_000_000 ? (w / 1_000_000).toFixed(0) + 'M' : k(w))

/** The band's one line, shared with the tests. */
export function meterText(r: Reading, first: number, level: number) {
  const light = level === 2 ? '🔴' : level === 1 ? '🟡' : '🟢'
  const parts = [`${light} Mimir's Well · ${k(r.tokens)} of ${windowLabel(r.window)} (${r.percent}%)`]
  if (first > 0) parts.push(`turn ~${(r.tokens / first).toFixed(1)}x the first`)
  if (r.usd != null) parts.push(`~$${r.usd.toFixed(2)} est.`)
  return parts.join(' · ')
}

function numberOption(value: unknown, fallback: number) {
  const n = Number(value)
  return value != null && value !== '' && Number.isFinite(n) && n > 0 ? n : fallback
}

async function measure($: EngineInterface) {
  const usage = await $.session.usage()
  const tokens = usage.context.tokens ?? 0
  const window = usage.context.window
  // Before the first response, and right after /compact, there is no figure.
  if (!tokens || !window) return update($, reading, () => null)

  const prev = await read($, opening)
  if (!prev || prev.startedAt !== usage.startedAt) {
    await update($, opening, () => ({ startedAt: usage.startedAt, tokens }))
  }
  const percent = usage.context.percent ?? Math.round((100 * tokens) / window)
  return update($, reading, () => ({ tokens, window, percent, usd: usage.cost?.usd ?? null }))
}

export const register: Register = (on, options) => {
  const costFactor = numberOption(options.cost_factor, COST_FACTOR)
  const redPct = numberOption(options.red_pct, RED_PCT)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await measure($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await measure($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    if (e.props.hasSurvey || !r) return next(e)

    const first = (await read($, opening))?.tokens ?? 0
    const level = levelOf(r.tokens, first, r.window, costFactor, redPct)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text key="meter" color={level === 2 ? 'error' : level === 1 ? 'warning' : undefined} dimColor={level === 0}>
          {meterText(r, first, level)}
        </Text>
      </Box>
    )
  })
}
