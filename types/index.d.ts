/** One reading of the session's context, as the status line has it. */
export type Reading = { tokens: number; window: number; percent: number; usd: number | null }

/** The first turn's context, and the session start it belongs to (/clear starts over). */
export type Opening = { startedAt: number; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'mimirs-well': { reading: Reading | null; opening: Opening | null }
  }
}
