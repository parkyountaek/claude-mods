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
      { role: 'assistant', text: 'Looking at the tests folder', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/repo/tests/test_cli.py' } }] },
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
  expect(await pane.find({ type: 'Text', text: /🔧/ })).toBeDefined()
  await pane.unmount()
})
