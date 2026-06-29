import { z } from 'zod'
import type { PluginManifest } from '@repo/common'
import type { DispatchServices } from './index'
import { STATE_SIZE_LIMIT_BYTES } from '../state-store'

export const manifest: PluginManifest = {
  id: 'state',
  name: 'State',
  description: 'Persist a small blob of custom JSON state across runs (max 1 MiB per job).',
  // Always available; not a configurable integration, so hidden from the admin list.
  hidden: true,
  adminConfigSchema: [],
  pythonFunctionSchema: [
    {
      name: 'get',
      description: 'Load this job\'s saved JSON state, or `default` if nothing has been saved.',
      params: [
        { name: 'default', type: 'any', description: 'Value returned when no state is saved', optional: true, defaultValue: 'None' },
      ],
    },
    {
      name: 'set',
      description: 'Replace this job\'s saved state with a JSON-serializable value (max 1 MiB).',
      params: [
        { name: 'value', type: 'any', description: 'JSON-serializable value to save', optional: false },
      ],
    },
    {
      name: 'update',
      description: 'Shallow-merge keyword args into the existing state dict and save it.',
      params: [
        { name: '**kwargs', type: 'any', description: 'Keys to merge into the existing state dict', optional: true },
      ],
    },
    {
      name: 'clear',
      description: 'Delete this job\'s saved state.',
      params: [],
    },
  ],
  nodeFunctionSchema: [
    {
      name: 'get',
      description: 'Load this job\'s saved JSON state, or the default if nothing has been saved.',
      params: [
        { name: 'defaultValue', type: 'any', description: 'Value returned when no state is saved', optional: true, defaultValue: 'null' },
      ],
    },
    {
      name: 'set',
      description: 'Replace this job\'s saved state with a JSON-serializable value (max 1 MiB).',
      params: [
        { name: 'value', type: 'any', description: 'JSON-serializable value to save', optional: false },
      ],
    },
    {
      name: 'clear',
      description: 'Delete this job\'s saved state.',
      params: [],
    },
  ],
}

const LIMIT = STATE_SIZE_LIMIT_BYTES

export function generatePythonHelper(): string {
  return `\
class state:
    _LIMIT = ${LIMIT}

    @staticmethod
    def get(default=None):
        res = _cronulent_dispatch('state', 'get', {'key': _CRONULENT_STATE_KEY}, strict=True)
        if res and res.get('found'):
            return res.get('value')
        return default

    @staticmethod
    def set(value):
        try:
            encoded = _json.dumps(value).encode('utf-8')
        except TypeError as e:
            raise TypeError(f'[cronulent] state value is not JSON-serializable: {e}') from e
        if len(encoded) > state._LIMIT:
            raise ValueError(f'[cronulent] state is {len(encoded)} bytes, exceeds limit of {state._LIMIT} bytes (1 MiB)')
        _cronulent_dispatch('state', 'set', {'key': _CRONULENT_STATE_KEY, 'value': value}, strict=True)

    @staticmethod
    def update(**kwargs):
        current = state.get(default={})
        if not isinstance(current, dict):
            raise TypeError('[cronulent] state.update requires existing state to be a dict (or empty)')
        current.update(kwargs)
        state.set(current)
        return current

    @staticmethod
    def clear():
        _cronulent_dispatch('state', 'clear', {'key': _CRONULENT_STATE_KEY}, strict=True)
`
}

export function generateNodeHelper(): string {
  return `\
const _STATE_LIMIT = ${LIMIT}
export const state = {
  get: async (defaultValue = null) => {
    const res = await _cronulentDispatch('state', 'get', { key: _cronulentStateKey }, true)
    return res && res.found ? res.value : defaultValue
  },
  set: async (value) => {
    let encoded
    try {
      encoded = Buffer.byteLength(JSON.stringify(value), 'utf8')
    } catch (e) {
      throw new Error(\`[cronulent] state value is not JSON-serializable: \${e.message}\`)
    }
    if (encoded > _STATE_LIMIT) {
      throw new Error(\`[cronulent] state is \${encoded} bytes, exceeds limit of \${_STATE_LIMIT} bytes (1 MiB)\`)
    }
    await _cronulentDispatch('state', 'set', { key: _cronulentStateKey, value }, true)
  },
  clear: () => _cronulentDispatch('state', 'clear', { key: _cronulentStateKey }, true),
}
`
}

export function generateShellHelper(): string {
  return `\
cronhooks_state_set() {
  # cronhooks_state_set '<json-value>'
  _cronulent_dispatch "state" "set" "{\\"key\\":\\"\${CRONULENT_STATE_KEY:-}\\",\\"value\\":$1}" "true"
}
cronhooks_state_clear() {
  _cronulent_dispatch "state" "clear" "{\\"key\\":\\"\${CRONULENT_STATE_KEY:-}\\"}" "true"
}
`
}

const stateParamsSchema = z.object({
  key: z.string().min(1, 'key is required'),
  value: z.unknown(),
})

export function dispatch(
  func: string,
  params: Record<string, unknown>,
  _config: Record<string, string>,
  services?: DispatchServices,
): Promise<unknown> {
  if (!services?.stateStore) {
    return Promise.reject(new Error('[state] state store is unavailable'))
  }
  const store = services.stateStore

  const parsed = stateParamsSchema.safeParse(params)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
    return Promise.reject(new Error(`[state] invalid params — ${msg}`))
  }
  const { key, value } = parsed.data

  switch (func) {
    case 'get':
      return store.get(key)
    case 'set':
      return store.set(key, value, new Date().toISOString())
    case 'clear':
      return store.clear(key)
    default:
      return Promise.reject(new Error(`[state] Unknown function: '${func}'`))
  }
}
