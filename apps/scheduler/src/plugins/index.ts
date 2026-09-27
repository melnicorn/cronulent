import type { PluginManifest } from '@repo/common'
import type { StateStore } from '../state-store'
import * as telegram from './telegram'
import * as state from './state'
import * as gemini from './gemini'

// Extra server-side services made available to a plugin's dispatch. Used by the
// built-in state hook and by gemini (usage counter, enabled check); other
// integration plugins ignore them.
export interface DispatchServices {
  stateStore: StateStore
  pluginEnabled?: boolean
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
  {
    manifest: gemini.manifest,
    generatePythonHelper: gemini.generatePythonHelper,
    generateNodeHelper: gemini.generateNodeHelper,
    generateShellHelper: gemini.generateShellHelper,
    dispatch: gemini.dispatch,
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
