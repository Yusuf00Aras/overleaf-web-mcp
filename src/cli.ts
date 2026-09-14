#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { runKeepaliveCommand } from './auth/keepalive-command.js'
import { runLoginCommand } from './auth/login-command.js'
import { parseCliCommand, renderHelp } from './cli-command.js'
import { readConfig } from './config.js'
import { asMcpError } from './core/errors.js'
import { OverleafRuntime } from './runtime.js'
import { createMcpServer } from './server.js'

async function serve(): Promise<void> {
  const runtime = await OverleafRuntime.create(readConfig())
  const server = createMcpServer(runtime)
  let closing = false
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    await server.close().catch(() => undefined)
    await runtime.close()
  }
  process.once('SIGINT', () => {
    void close().finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void close().finally(() => process.exit(0))
  })
  await server.connect(new StdioServerTransport())
}

async function main(): Promise<void> {
  const command = parseCliCommand(process.argv.slice(2))
  if (command === 'help') {
    process.stdout.write(renderHelp())
    return
  }
  if (command === 'login') {
    const result = await runLoginCommand(readConfig(), {
      onStatus: message => process.stderr.write(`${message}\n`),
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  if (command === 'keepalive') {
    // A dead session rejects with AUTH_EXPIRED, which main().catch prints to stderr with exit 1.
    const result = await runKeepaliveCommand(readConfig())
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  await serve()
}

main().catch(error => {
  const normalized = asMcpError(error)
  process.stderr.write(`${JSON.stringify(normalized.toJSON())}\n`)
  process.exitCode = 1
})
