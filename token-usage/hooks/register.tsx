import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit, TurnUsage } from 'claude-code'

import type { AgentRow, Context, Limit, Tokens, Usage } from '../types'

import type { Slot } from './theme'
import { applyThemeArgs, palette, parseTheme, PRESETS, SLOTS, themePath } from './theme'
import type { Palette, ThemeFile } from './theme'

const KEEP_TURNS = 200
const KEEP_AGENTS = 40

const EMPTY: Usage = {
  main: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 },
  model: null,
  turns: [],
  agents: [],
  context: null,
  isBandHidden: false,
}

const usage = atom({ plugin: 'token-usage', key: 'usageV3' } as const, EMPTY)

async function loadTheme($: EngineInterface): Promise<ThemeFile> {
  const path = themePath(await $.env.get('HOME'), await $.env.get('CLAUDE_MODS_THEME_FILE'))
  return parseTheme(await $.fs.read(path).catch(() => ''))
}

const THEME_HELP: Record<string, string> = {
  default: '터미널 테마 색을 그대로 사용',
  colorblind: '색각 이상에도 구분되는 색 (Okabe-Ito)',
  ocean: '청록·파랑 계열, 어두운 배경에 맞춤',
  vivid: '선명한 원색 계열',
}

async function themeCommand($: EngineInterface, words: string[]): Promise<{ text: string; theme?: ThemeFile }> {
  if (words[0] === 'theme' && !words[1]) {
    // No name: let the person pick with the keyboard (arrows + Enter).
    const names = Object.keys(PRESETS)
    const picked = await $.ui
      .ask('어떤 색상 테마를 쓸까요?', {
        header: '테마',
        options: names.map(n => `${n} — ${THEME_HELP[n] ?? ''}`),
      })
      .catch(() => '')
    const name = names.find(n => picked.startsWith(n))
    if (!name) return { text: 'Theme unchanged.' }
    words = ['theme', name]
  }
  const r = applyThemeArgs(await loadTheme($), words)
  if (r.next) await $.fs.write(themePath(await $.env.get('HOME'), await $.env.get('CLAUDE_MODS_THEME_FILE')), `${JSON.stringify(r.next, null, 2)}\n`)
  return { text: r.text, theme: r.next }
}

// Before the first request of this load: the session's figures and the configured model.
async function freshen($: EngineInterface) {
  const [now, settings] = await Promise.all([
    $.session.usage().catch(() => null),
    $.settings.read().catch(() => ({}) as Record<string, unknown>),
  ])
  if (!now) return
  await update($, usage, u => ({
    ...u,
    context: toContext(now.context),
    limits: toLimits(now.rateLimits),
    model: u.model ?? (typeof settings.model === 'string' ? settings.model : null),
    effort: u.effort ?? (typeof settings.effortLevel === 'string' ? settings.effortLevel : undefined),
  }))
}

const themeOf = (u: Usage): Palette => palette((u.theme as ThemeFile | undefined) ?? { preset: 'default', overrides: {} })

// ---------------------------------------------------------------- formatting

export const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// "claude-opus-5-5[1m]" -> "Opus 5.5 1M", "claude-haiku-4-5-20251001" -> "Haiku 4.5"
export const modelName = (id: string): string => {
  const wide = /\[1m\]/i.test(id) ? ' 1M' : ''
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/i.exec(id)
  if (!m) return id.replace(/\[1m\]/i, '') + wide
  const family = m[1] ?? ''
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}${wide}`
}

const fit = (s: string, width: number) => {
  const cells = [...s].reduce((n, ch) => n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(ch) ? 2 : 1), 0)
  return s + ' '.repeat(Math.max(0, width - cells))
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const inputOf = (t: Tokens) => t.input + t.cacheRead + t.cacheWrite

// ---------------------------------------------------------------- glyph charts

const EIGHTHS = '▏▎▍▌▋▊▉'

// A horizontal bar at eighth-cell resolution, padded with a faint track.
export const fineBar = (percent: number, width: number): string => {
  const eighths = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width * 8)
  const full = Math.floor(eighths / 8)
  const part = eighths % 8
  return ('█'.repeat(full) + (part ? EIGHTHS[part - 1] ?? '' : '')).padEnd(width, '·')
}

// Cell counts for a stacked bar; every non-zero segment keeps at least one cell.
export const stack = (parts: readonly number[], width: number, peak: number): number[] =>
  parts.map(p => (p > 0 ? Math.max(1, Math.round((p / Math.max(1, peak)) * width)) : 0))

// ---------------------------------------------------------------- context state

// Icon, label and theme color together, so the state is never color alone.
export const contextState = (percent: number) =>
  percent >= 85
    ? { icon: '●', label: '곧 압축', tone: 'danger' as const }
    : percent >= 60
      ? { icon: '◕', label: '주의', tone: 'warn' as const }
      : percent >= 30
        ? { icon: '◑', label: '여유', tone: 'ok' as const }
        : { icon: '◔', label: '여유', tone: 'ok' as const }

const toLimits = (r: readonly SessionRateLimit[]): Limit[] =>
  r.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))

export const limitLabel = (kind: string): string =>
  kind === 'five_hour' ? '5시간' : kind === 'seven_day' ? '7일' : kind === 'spend_limit' ? '지출 한도' : kind

// Time until a window resets, compact: "3d 4h", "2h", "25m".
export const resetsIn = (resetsAt: string | undefined, now: number): string => {
  if (!resetsAt) return ''
  const min = Math.round((Date.parse(resetsAt) - now) / 60_000)
  if (Number.isNaN(min)) return ''
  if (min < 1) return '↻ now'
  if (min < 60) return `↻${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `↻${h}h`
  return h % 24 ? `↻${Math.floor(h / 24)}d ${h % 24}h` : `↻${Math.floor(h / 24)}d`
}

// A subagent's window: the main one when it runs the same model, else by its id.
export const windowFor = (model: string, main: Usage): number =>
  model && model === main.model && main.context ? main.context.window : /\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000

// Live subagents grouped by model and effort: [["Haiku 4.5", 2, "low"], ...].
export const agentModels = (agents: readonly AgentRow[]): [string, number, string | undefined][] => {
  const groups = new Map<string, [string, number, string | undefined]>()
  for (const a of agents) {
    if (!isLive(a)) continue
    const name = a.model ? modelName(a.model) : '?'
    const key = `${name}|${a.effort ?? ''}`
    const g = groups.get(key)
    groups.set(key, g ? [name, g[1] + 1, a.effort] : [name, 1, a.effort])
  }
  return [...groups.values()]
}

type Tone = 'ok' | 'warn' | 'danger' | 'cache'

// Each subagent keeps one number and color for the whole session (its order of first appearance),
// so its row above the prompt and its row in /token-usage are easy to match.
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
const AGENT_TONES: readonly Slot[] = ['accent', 'warn', 'ok', 'input', 'output', 'cache']
export const agentTag = (index: number): { mark: string; tone: Slot } => ({
  mark: CIRCLED[index] ?? `(${index + 1})`,
  tone: AGENT_TONES[index % AGENT_TONES.length] ?? 'accent',
})

const AGENT_ICON: Record<string, { icon: string; tone: Tone }> = {
  pending: { icon: '○', tone: 'cache' },
  running: { icon: '◐', tone: 'warn' },
  waiting: { icon: '◐', tone: 'warn' },
  idle: { icon: '◌', tone: 'cache' },
  completed: { icon: '✓', tone: 'ok' },
  failed: { icon: '✗', tone: 'danger' },
  killed: { icon: '✗', tone: 'danger' },
}

const isLive = (a: AgentRow) => ['pending', 'running', 'waiting'].includes(a.status)

// ---------------------------------------------------------------- state updates

const toContext = (c: SessionContextUsage): Context => ({
  tokens: c.tokens,
  window: c.window,
  percent: c.percent,
})

const add = <T extends Tokens>(a: T, t: TurnUsage): T => ({
  ...a,
  input: a.input + t.input_tokens,
  output: a.output + t.output_tokens,
  cacheRead: a.cacheRead + t.cache_read_input_tokens,
  cacheWrite: a.cacheWrite + t.cache_creation_input_tokens,
})

export const addMainTurn = (u: Usage, t: TurnUsage): Usage => ({
  ...u,
  model: t.model,
  main: { ...add(u.main, t), turns: u.main.turns + 1 },
  turns: [...u.turns, add({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, model: t.model }, t)].slice(
    -KEEP_TURNS,
  ),
})

const blankAgent = (id: string): AgentRow => ({
  id,
  type: 'agent',
  description: '',
  model: '',
  status: 'running',
  runs: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
})

export const upsertAgent = (u: Usage, id: string, change: (a: AgentRow) => AgentRow): Usage => {
  const found = u.agents.find(a => a.id === id)
  const next = change(found ?? blankAgent(id))
  const agents = found ? u.agents.map(a => (a.id === id ? next : a)) : [...u.agents, next]
  return { ...u, agents: agents.slice(-KEEP_AGENTS) }
}

export const addAgentRun = (u: Usage, id: string, t: TurnUsage): Usage =>
  upsertAgent(u, id, a => ({ ...add(a, t), model: t.model, runs: a.runs + 1 }))

const statusText = (u: Usage): string | undefined => {
  const parts: string[] = []
  const pct = u.context?.percent
  if (pct !== undefined) parts.push(`${contextState(pct).icon} ${pct}%`)
  if (u.model) parts.push(`메인 ${modelName(u.model)}${u.effort ? ` ${u.effort}` : ''}`)
  const all = u.agents.reduce(
    (s, a) => ({ i: s.i + inputOf(a), o: s.o + a.output }),
    { i: inputOf(u.main), o: u.main.output },
  )
  if (all.i + all.o > 0) parts.push(`↑${fmt(all.i)} ↓${fmt(all.o)}`)
  const five = u.limits?.find(l => l.kind === 'five_hour')
  if (five) parts.push(`⏳${Math.round(five.percentUsed)}% ${resetsIn(five.resetsAt, Date.now())}`.trimEnd())
  const live = u.agents.filter(isLive).length
  if (live) parts.push(`🤖${live}`)
  return parts.length ? parts.join(' · ') : undefined
}

const publish = async ($: EngineInterface) => {
  $.ui.status(statusText(await read($, usage)))
}

// Fill in an agent's type, task and status from the engine's roster.
const syncAgents = async ($: EngineInterface) => {
  const roster = await $.agent.list()
  await update($, usage, u => ({
    ...u,
    agents: u.agents.map(a => {
      const info = roster.find(r => r.id === a.id)
      return info
        ? { ...a, type: info.type, description: info.description, status: info.status }
        : a
    }),
  }))
}

// ---------------------------------------------------------------- hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'token-usage',
      description: 'Fold or unfold token details above the prompt (context, rate limits, models, subagents); theme picks colors',
      argumentHint: '[open|close|band on|off|theme [name]|color <slot> <#hex>]',
    })
    const theme = await loadTheme($)
    await update($, usage, u => ({ ...u, theme }))
    await freshen($)
    await publish($)
    return next(e)
  })

  on('command.run', { command: 'token-usage' }, async ($, e) => {
    const arg = e.args.trim()
    const words = arg.split(/\s+/)
    if (words[0] === 'theme' || words[0] === 'color') {
      const r = await themeCommand($, words)
      if (r.theme) {
        const theme = r.theme
        await update($, usage, u => ({ ...u, theme }))
      }
      return { text: r.text }
    }
    if (arg === 'band off' || arg === 'band on') {
      await update($, usage, u => ({ ...u, isBandHidden: arg === 'band off' }))
      return { text: `Token band ${arg === 'band off' ? 'hidden' : 'shown'}.` }
    }
    if (arg === 'close' || arg === 'open' || arg === '') {
      await freshen($)
      const isExpanded = arg === 'open' || (arg === '' && !(await read($, usage)).isExpanded)
      await update($, usage, u => ({ ...u, isExpanded, isBandHidden: false }))
      return { text: isExpanded ? 'Token details shown above the prompt. /token-usage again folds them.' : 'Token details folded.' }
    }
    return { text: 'Usage: /token-usage [open|close|band on|off|theme [name]|color <slot> <#hex>]' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, u => {
      return { ...u, context: toContext(e.context), limits: toLimits(e.rateLimits) }
    })
    await publish($)
    return next(e)
  })

  // Every model request names its model: the live model of main and of each subagent.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    await update($, usage, u =>
      agentId === undefined
        ? { ...u, model: e.model, effort: e.effort === undefined ? u.effort : String(e.effort) }
        : upsertAgent(u, agentId, a => ({
            ...a,
            model: e.model,
            effort: e.effort === undefined ? a.effort : String(e.effort),
            status: isLive(a) || a.runs === 0 ? 'running' : a.status,
          })),
    )
    if (agentId !== undefined && e.index === 0) {
      await syncAgents($)
      await publish($)
    }
    const r = yield* next(e)
    const used = r.usage
    if (agentId !== undefined && used) {
      const ctxTokens = used.input_tokens + used.cache_read_input_tokens + used.cache_creation_input_tokens
      await update($, usage, u => upsertAgent(u, agentId, a => ({ ...a, ctxTokens })))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const t = e.usage
    const agentId = e.agentId
    if (t) {
      await update($, usage, u =>
        agentId === undefined ? addMainTurn(u, t) : addAgentRun(u, agentId, t),
      )
    }
    if (agentId !== undefined) await syncAgents($)
    else {
      const theme = await loadTheme($)
      await update($, usage, u => ({ ...u, theme }))
    }
    await publish($)
    return done
  })

  // ------------------------------------------------------------ band

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)
    const below = await next(e)
    if (e.props.hasSurvey || u.isBandHidden) return below

    const { Box, Text } = $.ui.resolve(e)
    const P = themeOf(u)
    const cols = e.viewport?.columns ?? 80
    const now = await $.clock.now()
    const pct = u.context?.percent
    const st = pct !== undefined ? contextState(pct) : null
    const limits = u.limits ?? []
    const live = u.agents.filter(isLive)
    const sep = <Text dimColor> │ </Text>
    const short = (kind: string) => (kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : limitLabel(kind))
    const effortText = (x?: string) => (x ? <Text dimColor> {x}</Text> : null)

    const line = (
      <Text>
        <Text>🧠 </Text>
        {st && pct !== undefined ? (
          <Text>
            <Text bold color={P[st.tone]}>
              {pct}%
            </Text>
            <Text color={P[st.tone]}> {fineBar(pct, 12)}</Text>
          </Text>
        ) : (
          <Text dimColor>응답 전</Text>
        )}
        {limits.length > 0 && (
          <Text>
            {sep}⏳{' '}
            {limits.map((l, i) => (
              <Text>
                {i > 0 && <Text dimColor> · </Text>}
                <Text dimColor>{short(l.kind)} </Text>
                <Text bold color={P[contextState(l.percentUsed).tone]}>
                  {Math.round(l.percentUsed)}%
                </Text>
              </Text>
            ))}
          </Text>
        )}
        {u.model && (
          <Text>
            {sep}
            {live.length > 0 && <Text dimColor>메인 </Text>}
            <Text bold color={P.accent}>
              {modelName(u.model).replace(/ 1M$/, '')}
            </Text>
            {effortText(u.effort)}
          </Text>
        )}
      </Text>
    )

    // One row per running subagent, so each model sits next to its own job.
    const MAX_AGENT_ROWS = 5
    const agentRows = [
      ...live.slice(0, MAX_AGENT_ROWS).map(a => (
        <Text>
          <Text>  </Text>
          <Text bold color={P[agentTag(u.agents.indexOf(a)).tone]}>
            {agentTag(u.agents.indexOf(a)).mark} {fit(clip(a.description || a.type, 28), 30)}
          </Text>
          <Text bold>
            {a.model ? modelName(a.model).replace(/ 1M$/, '') : '?'}
          </Text>
          {effortText(a.effort)}
        </Text>
      )),
      ...(live.length > MAX_AGENT_ROWS ? [<Text dimColor>  🤖 외 {live.length - MAX_AGENT_ROWS}개 (/token-usage)</Text>] : []),
    ]

    if (!u.isExpanded) {
      return (
        <Box flexDirection="column">
          {line}
          {agentRows}
          {below}
        </Box>
      )
    }

    const W = 12
    const all = [u.main, ...u.agents]
    const sum = (k: keyof Tokens) => all.reduce((s, t) => s + t[k], 0)
    const totals: Tokens = { input: sum('input'), output: sum('output'), cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite') }
    const cachePct = inputOf(totals) ? Math.round((totals.cacheRead / inputOf(totals)) * 100) : 0
    const row = (label: string, value: number, tone: string, detail: string) => (
      <Text>
        <Text>{'  '}{fit(label, 11)}</Text>
        <Text color={tone}>{fineBar(value, W)}</Text>
        <Text bold> {String(Math.round(value)).padStart(3)}%</Text>
        <Text dimColor>  {detail}</Text>
      </Text>
    )
    const agentsShown = [...live, ...u.agents.filter(a => !isLive(a)).reverse()].slice(0, 6)
    const modelCell = (model: string, effort?: string) => fit(`${model ? modelName(model) : '?'}${effort ? ` ${effort}` : ''}`, 20)

    return (
      <Box flexDirection="column">
        {line}
        {st && pct !== undefined && u.context && row('컨텍스트', pct, P[st.tone], `${fmt(u.context.tokens ?? 0)}/${fmt(u.context.window)} ${st.label}`)}
        {limits.map(l => row(`${limitLabel(l.kind)} 한도`, l.percentUsed, P[contextState(l.percentUsed).tone], resetsIn(l.resetsAt, now)))}
        {row('캐시 적중', cachePct, P.ok, `↑${fmt(inputOf(totals))} ↓${fmt(totals.output)}`)}
        <Text dimColor>{'  ─ 모델 '.padEnd(Math.min(60, cols - 4), '─')}</Text>
        <Text>
          <Text>{'  '}</Text>
          <Text color={P.accent}>● </Text>
          <Text bold>{fit('메인', 20)}</Text>
          <Text color={P.accent}>{modelCell(u.model ?? '', u.effort)}</Text>
          {st && pct !== undefined ? (
            <Text>
              <Text color={P[st.tone]}>{fineBar(pct, 8)}</Text>
              <Text bold> {String(pct).padStart(3)}%</Text>
            </Text>
          ) : (
            <Text dimColor>{'·'.repeat(8)}    -</Text>
          )}
          <Text dimColor>  ↓{fmt(u.main.output)}</Text>
        </Text>
        {agentsShown.map(a => {
          const as = AGENT_ICON[a.status] ?? { icon: '·', tone: 'cache' as const }
          const win = windowFor(a.model, u)
          const cp = a.ctxTokens ? Math.min(100, Math.round((a.ctxTokens / win) * 100)) : undefined
          return (
            <Text>
              <Text>{'  '}</Text>
              <Text color={P[as.tone]}>{as.icon} </Text>
              <Text bold color={P[agentTag(u.agents.indexOf(a)).tone]}>{fit(`${agentTag(u.agents.indexOf(a)).mark} ${clip(a.description || a.type, 16)}`, 20)}</Text>
              <Text color={P.warn}>{modelCell(a.model, a.effort)}</Text>
              {cp !== undefined ? (
                <Text>
                  <Text color={P[contextState(cp).tone]}>{fineBar(cp, 8)}</Text>
                  <Text bold> {String(cp).padStart(3)}%</Text>
                </Text>
              ) : (
                <Text dimColor>{'·'.repeat(8)}    -</Text>
              )}
              <Text dimColor>
                {'  '}↓{fmt(a.output)}
              </Text>
            </Text>
          )
        })}
        <Text dimColor>
          {'  '}테마 {(u.theme as ThemeFile | undefined)?.preset ?? 'default'} · /token-usage theme · 접기: /token-usage
        </Text>
        {below}
      </Box>
    )
  })

}
