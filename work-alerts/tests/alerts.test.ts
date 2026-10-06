import { expect, test } from 'claude-code/testing'

import { crossed, duration, failSummary } from '../hooks/register'

test('durations read in Korean units', async () => {
  expect(duration(4_200)).toBe('4초')
  expect(duration(120_000)).toBe('2분')
  expect(duration(133_000)).toBe('2분 13초')
})

test('picks the runner summary line', async () => {
  const out = 'tests/a.py F.\nFAILED tests/a.py::x\n==== 1 failed, 12 passed in 0.4s ===='
  expect(failSummary(out)).toBe('1 failed, 12 passed in 0.4s')
  expect(failSummary('all good')).toBeUndefined()
})

test('alerts once per upward crossing', async () => {
  expect(crossed(50, 62, [60, 85])).toBe(60)
  expect(crossed(62, 70, [60, 85])).toBeUndefined()
  expect(crossed(50, 90, [60, 85])).toBe(85)
  expect(crossed(90, 20, [60, 85])).toBeUndefined()
})

test('/task-alert toggles the alert sound and keeps it', async ($, on) => {
  const saved = new Map<string, unknown>()
  on('store.set', (_$, e) => (saved.set(e.key, e.value), { value: undefined }))
  on('store.get', (_$, e) => ({ value: saved.get(e.key) }))
  on('command.run', () => ({ text: '' }))
  const run = (args: string) =>
    $.command.run({
      command: 'task-alert',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    } as Parameters<typeof $.command.run>[0])
  expect((await run('')).text).toMatch(/끔/)
  expect((saved.get('prefs') as { hasSound: boolean }).hasSound).toBe(false)
  expect((await run('')).text).toMatch(/켬/)
  expect((await run('off')).text).toMatch(/끔/)
  expect((await run('off')).text).toMatch(/끔/)
})
