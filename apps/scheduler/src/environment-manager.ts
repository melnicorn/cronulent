import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Task } from '@repo/common'

interface PluginWithHelper {
  id: string
  generatePythonHelper: () => string
  generateNodeHelper: () => string
  generateShellHelper: () => string
}

export class EnvironmentManager {
  private scriptsDir: string
  readonly sharedDir: string

  constructor(dataDir: string) {
    this.scriptsDir = path.join(dataDir, 'scripts')
    this.sharedDir = path.join(this.scriptsDir, 'shared')
  }

  taskDir(taskId: string): string {
    return path.join(this.scriptsDir, taskId)
  }

  async setup(task: Task): Promise<void> {
    const dir = this.taskDir(task.id)

    // Always blow away and rebuild so deps are fresh after any update
    await fs.rm(dir, { recursive: true, force: true })
    await fs.mkdir(dir, { recursive: true })

    switch (task.commandType) {
      case 'shell':
        await fs.writeFile(path.join(dir, 'script.sh'), task.command, { mode: 0o755 })
        break

      case 'python-uv': {
        const deps = task.dependencies.map(d => `    "${d}"`).join(',\n')
        const pyproject = [
          '[project]',
          'name = "task"',
          'version = "0.1.0"',
          'requires-python = ">=3.8"',
          `dependencies = [`,
          deps ? `${deps},` : '',
          ']',
        ].join('\n')
        await fs.writeFile(path.join(dir, 'pyproject.toml'), pyproject)
        await fs.writeFile(path.join(dir, 'script.py'), task.command)
        await runCommand('uv', ['sync'], dir)
        break
      }

      case 'node-volta': {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))
        await fs.writeFile(path.join(dir, 'script.mjs'), task.command)
        await runCommand('volta', ['pin', 'node@lts'], dir)
        if (task.dependencies.length > 0) {
          await runCommand('volta', ['run', 'npm', 'install', ...task.dependencies], dir)
        }
        break
      }

    }

    console.log(`[env] prepared ${task.commandType} environment for task ${task.id}`)
  }

  async cleanup(taskId: string): Promise<void> {
    const dir = this.taskDir(taskId)
    await fs.rm(dir, { recursive: true, force: true })
    console.log(`[env] cleaned up environment for task ${taskId}`)
  }

  async writeSharedHelpers(plugins: PluginWithHelper[]): Promise<void> {
    await fs.mkdir(this.sharedDir, { recursive: true })

    const pythonPreamble = `\
import os as _os
import json as _json
import urllib.request as _urllib_request
import urllib.error as _urllib_error

_CRONULENT_API_URL = _os.environ.get('CRONULENT_API_URL', 'http://localhost:3001')
_CRONULENT_TOKEN = _os.environ.get('CRONULENT_INTERNAL_TOKEN', '')
_CRONULENT_STATE_KEY = _os.environ.get('CRONULENT_STATE_KEY', '')

def _cronulent_dispatch(plugin_id, func, params, strict=False):
    body = _json.dumps({'pluginId': plugin_id, 'func': func, 'params': params, 'strict': strict}).encode()
    req = _urllib_request.Request(
        f'{_CRONULENT_API_URL}/plugins.dispatch',
        data=body,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {_CRONULENT_TOKEN}'},
    )
    try:
        with _urllib_request.urlopen(req, timeout=10) as r:
            raw = r.read()
    except _urllib_error.HTTPError as e:
        detail = ''
        try:
            detail = (_json.loads(e.read()).get('error') or {}).get('message') or ''
        except Exception:
            pass
        msg = f'[cronulent] dispatch failed: {detail or e}'
        if strict:
            raise RuntimeError(msg) from e
        print(f'[cronulent] warning: {msg}', flush=True)
        return None
    except Exception as e:
        if strict:
            raise RuntimeError(f'[cronulent] dispatch failed: {e}') from e
        print(f'[cronulent] warning: dispatch failed: {e}', flush=True)
        return None
    try:
        return _json.loads(raw)['result']['data'].get('result')
    except Exception:
        return None

`

    const nodePreamble = `\
import http from 'node:http'
import https from 'node:https'

const _cronulentApiUrl = process.env.CRONULENT_API_URL ?? 'http://localhost:3001'
const _cronulentToken = process.env.CRONULENT_INTERNAL_TOKEN ?? ''
const _cronulentStateKey = process.env.CRONULENT_STATE_KEY ?? ''

function _cronulentDispatch(pluginId, func, params, strict = false) {
  const body = JSON.stringify({ pluginId, func, params, strict })
  const url = new URL(\`\${_cronulentApiUrl}/plugins.dispatch\`)
  const lib = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': \`Bearer \${_cronulentToken}\` } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            let detail = ''
            try { detail = (JSON.parse(data).error || {}).message || '' } catch {}
            const err = new Error(\`[cronulent] dispatch failed: \${detail || \`HTTP \${res.statusCode}\`}\`)
            if (strict) reject(err)
            else { console.warn(err.message); resolve(undefined) }
          } else {
            let result
            try { result = JSON.parse(data).result.data.result } catch {}
            resolve(result)
          }
        })
      }
    )
    req.on('error', (err) => {
      if (strict) reject(new Error(\`[cronulent] dispatch failed: \${err.message}\`))
      else { console.warn(\`[cronulent] warning: dispatch failed: \${err.message}\`); resolve(undefined) }
    })
    req.write(body)
    req.end()
  })
}

`

    const shellPreamble = `\
#!/usr/bin/env bash
_CRONULENT_API_URL="\${CRONULENT_API_URL:-http://localhost:3001}"
_CRONULENT_TOKEN="\${CRONULENT_INTERNAL_TOKEN:-}"

_cronulent_dispatch() {
  local plugin_id="$1" func="$2" params="$3" strict="\${4:-false}"
  local _body="{\\"pluginId\\":\\"\${plugin_id}\\",\\"func\\":\\"\${func}\\",\\"params\\":\${params},\\"strict\\":\${strict}}"
  local _http_code _curl_exit
  _http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \\
       "\${_CRONULENT_API_URL}/plugins.dispatch" \\
       -H "Content-Type: application/json" \\
       -H "Authorization: Bearer \${_CRONULENT_TOKEN}" \\
       -d "\${_body}")
  _curl_exit=$?
  if [ "\${_curl_exit}" -ne 0 ] || [ "\${_http_code:-0}" -ge 400 ]; then
    if [ "\${strict}" = "true" ]; then
      echo "[cronulent] dispatch failed: \${plugin_id}.\${func}" >&2
      return 1
    else
      echo "[cronulent] warning: dispatch failed: \${plugin_id}.\${func}" >&2
    fi
  fi
}

`

    const ids = plugins.map(p => p.id)
    const pythonPostamble = `\nclass _CronHooks:\n${ids.map(id => `    ${id} = ${id}`).join('\n')}\n\ncronhooks = _CronHooks()\n`
    const nodePostamble = `\nconst cronhooks = { ${ids.join(', ')} }\nexport default cronhooks\n`

    const pythonParts = plugins.map(p => p.generatePythonHelper())
    const nodeParts = plugins.map(p => p.generateNodeHelper())
    const shellParts = plugins.map(p => p.generateShellHelper())
    await fs.writeFile(path.join(this.sharedDir, 'cronulent_hooks.py'), pythonPreamble + pythonParts.join('\n') + pythonPostamble)
    await fs.writeFile(path.join(this.sharedDir, 'cronulent_hooks.mjs'), nodePreamble + nodeParts.join('\n') + nodePostamble)
    await fs.writeFile(path.join(this.sharedDir, 'cronulent_hooks.sh'), shellPreamble + shellParts.join('\n'))
  }

  getRunCommand(task: Task): { cmd: string; args: string[]; cwd: string } {
    const dir = this.taskDir(task.id)
    const params = task.parameters

    switch (task.commandType) {
      case 'shell':
        return { cmd: '/bin/sh', args: ['script.sh', ...params], cwd: dir }
      case 'python-uv':
        // --no-sync: skip environment sync, use what setup() already installed
        return { cmd: 'uv', args: ['run', '--no-sync', 'script.py', ...params], cwd: dir }
      case 'node-volta':
        return { cmd: 'volta', args: ['run', 'node', 'script.mjs', ...params], cwd: dir }
    }
  }
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[env] running: ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}
