import type { PluginManifest } from '@repo/common'
import type { StateStore } from '../state-store'
import * as telegram from './telegram'
import * as state from './state'

// Extra server-side services made available to a plugin's dispatch. Only the
// built-in state hook uses these today; integration plugins ignore them.
export interface DispatchServices {
  stateStore: StateStore
}

interface Plugin {
  manifest: PluginManifest
  generatePythonHelper: () => string
  generateNodeHelper: () => string
  generateShellHelper: () => string
  dispatch: (
    func: string,
    params: Record<string, unknown>,
    config: Record<string, string>,
    services?: DispatchServices,
  ) => Promise<unknown>
}

const plugins: Plugin[] = [
  {
    manifest: telegram.manifest,
    generatePythonHelper: telegram.generatePythonHelper,
    generateNodeHelper: telegram.generateNodeHelper,
    generateShellHelper: telegram.generateShellHelper,
    dispatch: telegram.dispatch,
  },
  {
    manifest: state.manifest,
    generatePythonHelper: state.generatePythonHelper,
    generateNodeHelper: state.generateNodeHelper,
    generateShellHelper: state.generateShellHelper,
    dispatch: state.dispatch,
  },
]

export class PluginRegistry {
  list(): PluginManifest[] {
    return plugins.map(p => p.manifest)
  }

  get(id: string): Plugin | undefined {
    return plugins.find(p => p.manifest.id === id)
  }
}
