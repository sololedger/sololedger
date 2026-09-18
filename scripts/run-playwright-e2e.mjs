import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const host = process.env.PLAYWRIGHT_HOST || '127.0.0.1'
const port = process.env.PLAYWRIGHT_PORT || '3000'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${host}:${port}`
const nextBin = require.resolve('next/dist/bin/next')
const playwrightBin = require.resolve('@playwright/test/cli')

function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now()

  return new Promise((resolve, reject) => {
    function check() {
      const request = http.get(url, response => {
        response.resume()
        resolve()
      })

      request.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`))
          return
        }

        setTimeout(check, 500)
      })

      request.setTimeout(2_000, () => {
        request.destroy()
      })
    }

    check()
  })
}

function killProcessTree(pid) {
  return new Promise(resolve => {
    if (!pid) {
      resolve()
      return
    }

    const command =
      process.platform === 'win32'
        ? spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
        : spawn('kill', ['-TERM', String(pid)], { stdio: 'ignore' })

    command.on('exit', () => resolve())
    command.on('error', () => resolve())
  })
}

async function main() {
  const server = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', port], {
    stdio: 'inherit',
    windowsHide: true,
  })

  let shuttingDown = false

  async function shutdown(code = 1) {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    await killProcessTree(server.pid)
    process.exit(code)
  }

  process.on('SIGINT', () => {
    void shutdown(130)
  })
  process.on('SIGTERM', () => {
    void shutdown(143)
  })

  try {
    await waitForServer(baseURL)
  } catch (error) {
    console.error(error)
    await shutdown(1)
    return
  }

  const tests = spawn(process.execPath, [playwrightBin, 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_SKIP_WEB_SERVER: '1',
    },
  })

  tests.on('exit', code => {
    void shutdown(code ?? 1)
  })
}

void main()
