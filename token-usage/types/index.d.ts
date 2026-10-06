export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type TurnRow = Tokens & { model: string }

export type AgentRow = Tokens & {
  id: string
  type: string
  description: string
  model: string
  status: string
  runs: number
  effort?: string
  // Input of its latest request: how full its own context window is.
  ctxTokens?: number
  // Its latest tool call, as "Read docs/spec.md": what it is looking at now.
  activity?: string
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Context = { tokens?: number; window: number; percent?: number }

export type Usage = {
  // Main loop only; subagents are kept per agent in `agents`.
  main: Tokens & { turns: number }
  model: string | null
  effort?: string
  turns: TurnRow[]
  agents: AgentRow[]
  context: Context | null
  isBandHidden: boolean
  // Subscription rate-limit windows (five_hour, seven_day); absent before the first reading.
  limits?: Limit[]
  // Color theme, as ~/.claude/mods/theme.json holds it.
  theme?: { preset: string; overrides: Record<string, string> }
  // The band above the prompt drawn in detail (toggled by /token-usage).
  isExpanded?: boolean
  // The subagent whose transcript the agent pane shows.
  viewing?: string
}

declare module 'claude-code' {
  interface PluginState {
    'token-usage': {
      usageV3: Usage
    }
  }
}
