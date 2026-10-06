import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { bar, collect, INSTRUCTIONS, progress, render, shortPath } from '../hooks/register'

const user = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const said = (text: string, toolUses: SessionMessage['toolUses'] = []): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses,
})

const TRANSCRIPT: SessionMessage[] = [
  user('mods 설정하고 싶어'),
  said('', [
    { tool_use_id: 't1', tool: 'TaskCreate', input: { subject: 'write mod' }, result: { task: { id: '1', subject: 'write mod' } } },
    { tool_use_id: 't2', tool: 'TaskCreate', input: { subject: 'run tests' }, result: { task: { id: '2', subject: 'run tests' } } },
    { tool_use_id: 't3', tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' } },
    { tool_use_id: 't4', tool: 'Write', input: { file_path: '/m/register.ts', content: 'x' } },
    { tool_use_id: 't5', tool: 'Bash', input: { command: 'pytest' }, text: '1 failed', isError: true },
  ]),
  { role: 'user', text: '', toolUses: [], toolResults: [] },
  user('<command-name>/token-usage</command-name>'),
  user('알림도 추가해'),
  said('Next I will run the tests.'),
]

test('collects requests, tasks, files, failures and last step', async () => {
  const h = collect(TRANSCRIPT)
  expect(h.prompts).toEqual(['mods 설정하고 싶어', '알림도 추가해'])
  expect(h.tasks).toEqual([
    { subject: 'write mod', status: 'completed' },
    { subject: 'run tests', status: 'pending' },
  ])
  expect(h.files).toEqual(['/m/register.ts'])
  expect(h.failures).toEqual(['pytest → 1 failed'])
  expect(h.lastStep).toBe('Next I will run the tests.')
})

test('note marks tasks and ends with the next action', async () => {
  const note = render(collect(TRANSCRIPT), '/repo')
  expect(note.startsWith('[compact-handoff]')).toBe(true)
  expect(note).toContain('[x] write mod')
  expect(note).toContain('[ ] run tests')
  expect(note).toContain('Working directory: /repo')
})

test('pins the note after the summary and adds instructions', async ($, on) => {
  let told = ''
  let stored: unknown
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 6) }))
  on('store.set', (_$, e) => {
    stored = e.value
    return { value: undefined }
  })
  on('session.compact', (_$, e) => {
    told = e.instructions ?? ''
    return { messages: [said('SUMMARY'), user('kept')] }
  })
  const done = await $.session.compact({ trigger: 'auto', messages: TRANSCRIPT, instructions: 'keep the API notes' })
  expect(told).toContain('keep the API notes')
  expect(told).toContain(INSTRUCTIONS)
  expect(done.skip).toBeUndefined()
  expect(String((stored as { note?: string }).note)).toContain('[compact-handoff]')
  expect(done.messages?.map(m => m.text.slice(0, 17))).toEqual(['SUMMARY', '[compact-handoff]', 'kept'])
})

test('progress, bar and short paths for the work pane', async () => {
  const tasks = [
    { subject: 'a', status: 'completed' },
    { subject: 'b', status: 'in_progress' },
    { subject: 'c', status: 'pending' },
  ]
  const p = progress(tasks)
  expect([p.done, p.total, p.current?.subject]).toEqual([1, 3, 'b'])
  expect(bar(1, 3, 6)).toBe('██····')
  expect(shortPath('/repo/src/x.py', '/repo')).toBe('src/x.py')
  expect(shortPath('/Users/pyt/.claude/a.ts', '/repo')).toBe('~/.claude/a.ts')
})
