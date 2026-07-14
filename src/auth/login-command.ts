import type { CookieJar } from 'tough-cookie'

import type { AppConfig } from '../config.js'
import { writeCookieJar } from '../http/cookies.js'
import { OverleafRuntime } from '../runtime.js'
import { captureBrowserSession } from './browser-login.js'

interface LoginRuntime {
  authStatus(): Promise<{
    authenticated: true
    baseUrl: string
    projectCount: number
    permissionsUnchecked: boolean
    warning?: string
  }>
  close(): Promise<void>
}

export interface LoginCommandOptions {
  onStatus?: (message: string) => void
}

export interface LoginCommandDependencies {
  captureSession?: typeof captureBrowserSession
  persistSession?: (path: string, jar: CookieJar) => Promise<void>
  createRuntime?: (config: AppConfig) => Promise<LoginRuntime>
}

export interface LoginResult {
  authenticated: true
  baseUrl: string
  projectCount: number
  cookieJarFile: string
  cookiesCaptured: number
  permissionsUnchecked: boolean
  warning?: string
}

export async function runLoginCommand(
  config: AppConfig,
  options: LoginCommandOptions = {},
  dependencies: LoginCommandDependencies = {}
): Promise<LoginResult> {
  const captureSession = dependencies.captureSession ?? captureBrowserSession
  const persistSession = dependencies.persistSession ?? writeCookieJar
  const createRuntime =
    dependencies.createRuntime ?? (async (runtimeConfig: AppConfig) => await OverleafRuntime.create(runtimeConfig))

  const captured = await captureSession({
    baseUrl: config.baseUrl,
    browserProfileDir: config.browserProfileDir,
    ...(config.browserPath === undefined ? {} : { browserPath: config.browserPath }),
    timeoutMs: config.loginTimeoutMs,
    ...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
  })
  options.onStatus?.('Saving the Overleaf session securely...')
  await persistSession(config.cookieJarFile, captured.jar)
  options.onStatus?.('Verifying the saved session with Overleaf...')

  const runtime = await createRuntime(config)
  try {
    const status = await runtime.authStatus()
    return {
      authenticated: true,
      baseUrl: status.baseUrl,
      projectCount: status.projectCount,
      cookieJarFile: config.cookieJarFile,
      cookiesCaptured: captured.cookieCount,
      permissionsUnchecked: status.permissionsUnchecked,
      ...(status.warning === undefined ? {} : { warning: status.warning }),
    }
  } finally {
    await runtime.close()
  }
}
