import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import dotenv from 'dotenv'

const envFilePath = path.join(process.cwd(), '.env.backend_lending')

if (!fs.existsSync(envFilePath)) {
  console.error(`Env file not found: ${envFilePath}`)
  process.exit(1)
}

const parsedEnv = dotenv.parse(fs.readFileSync(envFilePath, 'utf-8'))

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['dev'],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...parsedEnv,
    },
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
