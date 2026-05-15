import type { PluginManifest } from '@repo/common'
import * as telegram from './telegram'

interface Plugin {
  manifest: PluginManifest
  generatePythonHelper: () => string
  generateNodeHelper: () => string
  generateShellHelper: () => string
  dispatch: (func: string, params: Record<string, unknown>, config: Record<string, string>) => Promise<void>
}

const plugins: Plugin[] = [
  {
    manifest: telegram.manifest,
    generatePythonHelper: telegram.generatePythonHelper,
    generateNodeHelper: telegram.generateNodeHelper,
    generateShellHelper: telegram.generateShellHelper,
    dispatch: telegram.dispatch,
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
