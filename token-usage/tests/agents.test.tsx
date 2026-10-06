import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: true, maxRows: 30, bodyColumns: 120, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  viewport: { columns: 120, rows: 40 },
}

test('a running subagent gets its own row; pressing it opens its transcript', async ($, on) => {
  let isUp = false
  const opened: string[] = []
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 6, 10) }))
  on('ui.status', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('command.run', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.panes', () => ({ value: isUp ? [{ id: 'agent-view', title: '', isShown: true, isFocused: false, isPlaced: true, plugin: 'token-usage' }] : [] }))
  on('ui.open', (_$, e) => ((isUp = true), opened.push(e.title ?? ''), { value: { isPlaced: true } }))
  on('ui.close', () => ((isUp = false), { value: undefined }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Count the tests', toolUses: [] },
      { role: 'assistant', text: 'Looking at the tests folder', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/repo/tests/test_cli.py' }, result: 'x', text: '535 lines' }] },
    ],
  }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  await $.tool.call({ tool: 'Read', file_path: '/repo/tests/test_cli.py', agentId: 'a1' } as Parameters<typeof $.tool.call>[0])

  const band = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: /①/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /Read tests\/test_cli\.py/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  await band.press({ key: 'agent:a1' })
  expect(opened).toHaveLength(1)
  await band.unmount()

  const again = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND })
  expect(await again.find({ type: 'Text', text: /👁/ })).toBeDefined()
  await again.unmount()

  const pane = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', component: 'Pane', requestId: 'agent-view', props: {}, viewport: { columns: 60, rows: 20 } } as Parameters<typeof $.ui.mount>[0])
  expect(await pane.find({ type: 'Text', text: /Looking at the tests folder/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /⎿/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Esc: 메인으로/ })).toBeDefined()
  await pane.unmount()
})

test('past five subagents, "더 보기" opens a list where any one can be picked', async ($, on) => {
  let isUp = false
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 6, 10) }))
  on('ui.status', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('command.run', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.panes', () => ({ value: isUp ? [{ id: 'agent-view', title: '', isShown: true, isFocused: false, isPlaced: true, plugin: 'token-usage' }] : [] }))
  on('ui.open', () => ((isUp = true), { value: { isPlaced: true } }))
  on('ui.close', () => ((isUp = false), { value: undefined }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'seventh at work', toolUses: [] }] }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  for (let i = 1; i <= 7; i++) {
    await $.tool.call({ tool: 'Read', file_path: `/repo/f${i}.py`, agentId: `a${i}` } as Parameters<typeof $.tool.call>[0])
  }

  const band = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: /⑥/ })).toBeUndefined()
  await band.press({ key: 'agent:more' })
  await band.unmount()

  const PANE = { plugin: 'token-usage', surface: 'terminal', component: 'Pane', requestId: 'agent-view', props: { bodyColumns: 100 }, viewport: { columns: 100, rows: 30 } }
  const list = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
  expect(await list.find({ type: 'Text', text: /⑦/ })).toBeDefined()
  await list.press({ key: 'pick:a7' })
  await list.unmount()

  const one = await $.ui.mount(PANE as Parameters<typeof $.ui.mount>[0])
  expect(await one.find({ type: 'Text', text: /seventh at work/ })).toBeDefined()
  await one.unmount()
})
