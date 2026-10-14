import { expect, test } from 'claude-code/testing'

import { levelOf, meterText } from './meter-band.tsx'

const SURFACES = ['terminal', 'desktop'] as const

// The engine's figures, as `$.session.usage()` answers them; one per call.
function usageSeries(readings: { tokens: number; window: number; usd?: number }[]) {
  let i = 0
  return () => {
    const r = readings[Math.min(i++, readings.length - 1)]
    return { value: {
      startedAt: 1,
      context: { tokens: r.tokens, window: r.window, percent: Math.round((100 * r.tokens) / r.window) },
      rateLimits: [],
      ...(r.usd == null ? {} : { cost: { usd: r.usd } }),
    } }
  }
}

const start = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const band = { hasSurvey: false, isWorking: false, maxRows: 10 }

test('levels match the classic hook: 4x the first is yellow, 70% of the window is red', () => {
  expect(levelOf(60_000, 20_000, 200_000, 4, 70)).toBe(0)
  expect(levelOf(85_000, 20_000, 200_000, 4, 70)).toBe(1)
  expect(levelOf(145_000, 20_000, 200_000, 4, 70)).toBe(2)
  expect(levelOf(20_000, 5_000, 200_000, 4, 70)).toBe(0) // under the 15% floor
  expect(levelOf(141_000, 70_000, 1_000_000, 4, 70)).toBe(0) // the false red of 2026-10-13
})

test('the line reads the real window and the cost', () => {
  const r = { tokens: 170_000, window: 1_000_000, percent: 17, usd: 6.94 }
  expect(meterText(r, 70_000, 0)).toBe("🟢 Mimir's Well · 170k of 1M (17%) · turn ~2.4x the first · ~$6.94 est.")
})

for (const surface of SURFACES) {
  test(`the band shows the meter on ${surface}, measured against the first turn`, async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {})) // the engine's own band: empty
    on('session.usage', usageSeries([
      { tokens: 70_000, window: 1_000_000 },
      { tokens: 291_000, window: 1_000_000, usd: 12.5 },
    ]))
    await $.session.start(start)
    await $.session.start(start) // a second reading, same session: the first turn stays the base

    const ui = await $.ui.mount({ plugin: 'mimirs-well', surface, component: 'AbovePrompt', props: band } as never)
    expect((await ui.find({ text: /Mimir's Well/ }))?.text).toBe(
      "🟡 Mimir's Well · 291k of 1M (29%) · turn ~4.2x the first · ~$12.50 est."
    )
  })

  test(`the band stays out of the way before the first response on ${surface}`, async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {})) // the engine's own band: empty
    on('session.usage', usageSeries([{ tokens: 0, window: 1_000_000 }]))
    await $.session.start(start)
    const ui = await $.ui.mount({ plugin: 'mimirs-well', surface, component: 'AbovePrompt', props: band } as never)
    expect(await ui.find({ text: /Mimir's Well/ })).toBeUndefined()
  })
}
