import type { EngineInterface, Register } from 'claude-code'

// Settings come from /config (this plugin's userConfig); a change there reloads the module.
type Prefs = { isOn: boolean; hasSound: boolean; hasDesktop: boolean; longTurnSec: number; subagent: string }
const LONG_TURN: Record<string, number> = { '30초': 30, '60초': 60, '2분': 120, '5분': 300 }

export const prefsFrom = (o: Readonly<Record<string, unknown>>): Prefs => ({
  isOn: o.enabled !== false,
  hasSound: o.sound !== false,
  hasDesktop: o.desktop !== false,
  longTurnSec: LONG_TURN[String(o.longTurn)] ?? 60,
  subagent: typeof o.subagent === 'string' ? o.subagent : '알림 창만',
})

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

let prefs: Prefs = prefsFrom({})
// Several alerts at once (parallel subagents finishing) play one sound.
let lastSoundAt = 0

async function alert($: EngineInterface, text: string, kind: keyof typeof SOUND, isDesktop = false, hasSound = true) {
  if (!prefs.isOn) return
  $.ui.toast(text, { timeoutMs: kind === 'fail' ? 8000 : 5000 })
  const now = await $.clock.now()
  if (prefs.hasSound && hasSound && now - lastSoundAt > 2000) {
    lastSoundAt = now
    void $.process.run(['afplay', SOUND[kind]]).catch(() => undefined)
  }
  if (prefs.hasDesktop && isDesktop) {
    const script = `display notification "${quote(text)}" with title "Claude Code"`
    void $.process.run(['osascript', '-e', script]).catch(() => undefined)
  }
}

const flag = (x: boolean) => (x ? '켜짐' : '꺼짐')
const describe = (p: Prefs) =>
  `작업 알림 ${flag(p.isOn)} · 알림음 ${flag(p.hasSound)} · macOS 알림 창 ${flag(p.hasDesktop)} · ${p.longTurnSec}초 넘게 걸린 답변만 알림 · 서브에이전트: ${p.subagent}`

// Commands write through /config, so the menu and the commands never disagree.
async function setOption($: EngineInterface, field: string, value: boolean | string): Promise<boolean> {
  const r = await $.config.set({ key: `work-alerts.${field}`, value }).catch(() => ({ deny: 'error' }))
  return !('deny' in r && r.deny !== undefined)
}

export const register: Register = (on, options) => {
  prefs = prefsFrom(options)
  // undefined until the first reading, so a session that starts above a line does not alert.
  let lastContext: number | undefined
  const lastLimit = new Map<string, number>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'alerts',
      description: '작업 알림 설정 보기 (바꾸기: /config 의 work-alerts, 시험: /alerts test)',
      argumentHint: '[test]',
    })
    await $.command.register({ name: 'task-alert', description: '작업 알림음 켜기/끄기 (on|off, 비우면 전환)', argumentHint: '[on|off]' })
    return next(e)
  })

  // /task-alert flips the alert sound; toasts and desktop notices are untouched.
  on('command.run', { command: 'task-alert' }, async ($, e) => {
    const a = e.args.trim()
    const hasSound = a === 'on' ? true : a === 'off' ? false : !prefs.hasSound
    if (!(await setOption($, 'sound', hasSound))) prefs = { ...prefs, hasSound }
    return { text: hasSound ? '🔔 알림음 켬' : '🔕 알림음 끔 (알림 창은 그대로 뜹니다)' }
  })

  on('command.run', { command: 'alerts' }, async ($, e) => {
    if (e.args.trim() === 'test') {
      await alert($, '🔔 알림 테스트입니다', 'done', true)
      return { text: prefs.isOn ? '시험 알림을 보냈습니다.' : '작업 알림이 꺼져 있어 시험 알림도 나오지 않습니다. /config 에서 켜세요.' }
    }
    return { text: `${describe(prefs)}\n바꾸려면 /config 에서 work-alerts 항목을 고르세요.` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const took = duration(e.durationMs)
    if (e.agentId !== undefined) {
      const info = (await $.agent.list()).find(a => a.id === e.agentId)
      const name = info ? `${info.type}${info.description ? ` · ${info.description}` : ''}` : '서브에이전트'
      if (prefs.subagent === '끄기') return done
      const hasSound = prefs.subagent === '알림 창과 소리'
      if (e.reason === 'error') await alert($, `🤖✗ ${name} 실패 (${took})`, 'fail', false, hasSound)
      else if (!e.isAborted) await alert($, `🤖✓ ${name} 끝남 (${took})`, 'done', false, hasSound)
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
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    const pct = e.context.percent
    if (pct !== undefined) {
      const hit = lastContext === undefined ? undefined : crossed(lastContext, pct, [60, 85])
      if (hit === 85) await alert($, `● 컨텍스트 ${pct}% — 곧 자동 압축됩니다`, 'warn')
      else if (hit === 60) await alert($, `◕ 컨텍스트 ${pct}% 사용 중`, 'warn')
      lastContext = pct
    }
    for (const limit of e.rateLimits) {
      const before = lastLimit.get(limit.kind)
      const hit = before === undefined ? undefined : crossed(before, limit.percentUsed, [80, 95])
      if (hit !== undefined) {
        const label = limit.kind === 'five_hour' ? '5시간' : limit.kind === 'seven_day' ? '7일' : limit.kind
        await alert($, `⏳ ${label} 사용 한도 ${limit.percentUsed}%`, 'warn', hit === 95)
      }
      lastLimit.set(limit.kind, limit.percentUsed)
    }
    return next(e)
  })
}
