import { expect, test } from 'claude-code/testing'

test('/token-usage with no argument toggles', async ($, on) => {
  on('command.run', () => ({ text: '' }))
  const run = (args: string) =>
    $.command.run({
      command: 'token-usage',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    } as Parameters<typeof $.command.run>[0])
  expect((await run('')).text).toMatch(/shown/)
  expect((await run('')).text).toMatch(/folded/)
  expect((await run('')).text).toMatch(/shown/)
})
