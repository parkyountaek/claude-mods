import type { EngineInterface, Register } from 'claude-code'

// Preferences live in $.store so they survive across sessions.
type Prefs = { isOn: boolean; hasSound: boolean; hasDesktop: boolean; longTurnSec: number }
const DEFAULTS: Prefs = { isOn: true, hasSound: true, hasDesktop: true, longTurnSec: 60 }

const SOUND = {
  done: '/System/Library/Sounds/Glass.aiff',
  fail: '/System/Library/Sounds/Basso.aiff',
  warn: '/System/Library/Sounds/Funk.aiff',
} as const

// Commands whose failure is worth an alert: tests, lint, type checks, builds.
const CHECK = /\b(pytest|ruff|mypy|tsc|jest|vitest|npm (run )?test|cargo test|go test|make)\b/

export const duration = (ms: number): string => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}초`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m}분 ${s % 60}초` : `${m}분`
}

// The line a test runner ends on ("== 2 failed, 120 passed in 3.1s ==", "Found 3 errors").
export const failSummary = (out: string): string | undefined => {
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
  const hit = [...lines]
    .reverse()
    .find(l => /\b(failed|error|errors|FAILED)\b/.test(l) && l.length < 200)
  return hit?.replace(/^=+\s*|\s*=+$/g, '')
}

// Which threshold a value has newly crossed upward, if any.
export const crossed = (before: number, now: number, levels: readonly number[]): number | undefined =>
  [...levels].reverse().find(l => before < l && now >= l)

const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

// Module-level so `alert` can be a top-level function; reloaded from $.store each session.start.
let prefs: Prefs = DEFAULTS

async function alert($: EngineInterface, text: string, kind: keyof typeof SOUND, isDesktop = false) {
  if (!prefs.isOn) return
  $.ui.toast(text, { timeoutMs: kind === 'fail' ? 8000 : 5000 })
  if (prefs.hasSound) void $.process.run(['afplay', SOUND[kind]]).catch(() => undefined)
  if (prefs.hasDesktop && isDesktop) {
    const script = `display notification "${quote(text)}" with title "Claude Code"`
    void $.process.run(['osascript', '-e', script]).catch(() => undefined)
  }
}

export const register: Register = on => {
  let lastContext = 0
  const lastLimit = new Map<string, number>()

  on('session.start', async ($, e, next) => {
    prefs = { ...DEFAULTS, ...((await $.store.get('prefs')) as Partial<Prefs> | undefined) }
    await $.command.register({
      name: 'alerts',
      description: 'Work alerts: on|off, sound on|off, desktop on|off, long <seconds>, test',
      argumentHint: '[on|off|sound on|off|desktop on|off|long <sec>|test]',
    })
    await $.command.register({ name: 'task-alert', description: '작업 알림음 켜기/끄기 (on|off, 비우면 전환)', argumentHint: '[on|off]' })
    return next(e)
  })

  // /task-alert flips the alert sound; toasts and desktop notices are untouched.
  on('command.run', { command: 'task-alert' }, async ($, e) => {
    const a = e.args.trim()
    prefs = { ...prefs, hasSound: a === 'on' ? true : a === 'off' ? false : !prefs.hasSound }
    await $.store.set('prefs', prefs)
    return { text: prefs.hasSound ? '🔔 알림음 켬' : '🔕 알림음 끔 (알림 창은 그대로 뜹니다)' }
  })

  on('command.run', { command: 'alerts' }, async ($, e) => {
    const [a, b] = e.args.trim().split(/\s+/)
    if (a === 'on' || a === 'off') prefs = { ...prefs, isOn: a === 'on' }
    else if (a === 'sound' && (b === 'on' || b === 'off')) prefs = { ...prefs, hasSound: b === 'on' }
    else if (a === 'desktop' && (b === 'on' || b === 'off')) prefs = { ...prefs, hasDesktop: b === 'on' }
    else if (a === 'long' && Number(b) > 0) prefs = { ...prefs, longTurnSec: Number(b) }
    else if (a === 'test') {
      await alert($, '🔔 알림 테스트입니다', 'done', true)
      return { text: 'Test alert sent.' }
    }
    await $.store.set('prefs', prefs)
    const flag = (x: boolean) => (x ? 'on' : 'off')
    return {
      text: `Alerts ${flag(prefs.isOn)} · sound ${flag(prefs.hasSound)} · desktop ${flag(prefs.hasDesktop)} · long turn ≥ ${prefs.longTurnSec}s`,
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const took = duration(e.durationMs)
    if (e.agentId !== undefined) {
      const info = (await $.agent.list()).find(a => a.id === e.agentId)
      const name = info ? `${info.type}${info.description ? ` · ${info.description}` : ''}` : '서브에이전트'
      if (e.reason === 'error') await alert($, `🤖✗ ${name} 실패 (${took})`, 'fail')
      else if (!e.isAborted) await alert($, `🤖✓ ${name} 완료 (${took})`, 'done')
      return done
    }
    if (e.reason === 'error') await alert($, `✗ 오류로 멈춤 (${took})`, 'fail', true)
    else if (e.reason === 'refusal') await alert($, `⚠ 모델이 답변을 거절함`, 'warn', true)
    else if (!e.isAborted && e.durationMs >= prefs.longTurnSec * 1000) {
      await alert($, `✓ 작업 끝 (${took}) — 확인해 주세요`, 'done', true)
    }
    return done
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true && CHECK.test(e.command)) {
      const tool = CHECK.exec(e.command)?.[1] ?? 'check'
      const out = ran.result as { stdout?: string; stderr?: string } | undefined
      const why = failSummary(`${out?.stdout ?? ''}\n${out?.stderr ?? ''}`)
      await alert($, `🧪✗ ${tool} 실패${why ? `: ${why}` : ''}`, 'fail')
    }
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const pct = e.context.percent
    if (pct !== undefined) {
      const hit = crossed(lastContext, pct, [60, 85])
      if (hit === 85) await alert($, `● 컨텍스트 ${pct}% — 곧 자동 압축됩니다`, 'warn')
      else if (hit === 60) await alert($, `◕ 컨텍스트 ${pct}% 사용 중`, 'warn')
      lastContext = pct
    }
    for (const limit of e.rateLimits) {
      const before = lastLimit.get(limit.kind) ?? 0
      const hit = crossed(before, limit.percentUsed, [80, 95])
      if (hit !== undefined) {
        const label = limit.kind === 'five_hour' ? '5시간' : limit.kind === 'seven_day' ? '7일' : limit.kind
        await alert($, `⏳ ${label} 사용 한도 ${limit.percentUsed}%`, 'warn', hit === 95)
      }
      lastLimit.set(limit.kind, limit.percentUsed)
    }
    return next(e)
  })
}
