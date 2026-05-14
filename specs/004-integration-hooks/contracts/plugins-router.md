# Contract: plugins tRPC Router

**Location**: `packages/common/src/router/plugins.ts`

All procedures are `protectedProcedure` (require authenticated session).

---

## `plugins.list`

**Type**: Query

**Input**: none

**Output**:
```typescript
{
  plugins: Array<{
    id: string
    name: string
    description: string
    enabled: boolean
    configured: boolean          // true if all required admin config fields are set
    adminConfigSchema: PluginAdminConfigField[]
    pythonFunctionSchema: PluginFunction[]
    nodeFunctionSchema: PluginFunction[]
  }>
}
```

**Behaviour**: Returns all plugins registered in the PluginRegistry with their current enabled state and whether all required config fields are populated. Ordered by plugin `name` alphabetically.

---

## `plugins.setEnabled`

**Type**: Mutation

**Input**:
```typescript
{ pluginId: string, enabled: boolean }
```

**Output**: `{ ok: true }`

**Behaviour**: Sets the enabled flag for the given plugin in `config.json5`. Raises `NOT_FOUND` if `pluginId` is not in the registry.

---

## `plugins.getConfig`

**Type**: Query

**Input**:
```typescript
{ pluginId: string }
```

**Output**:
```typescript
{
  fields: Array<{
    key: string
    label: string
    type: 'string' | 'secret'
    required: boolean
    value: string    // '••••••' for secret fields that have a stored value; '' if unset
  }>
}
```

**Behaviour**: Returns the admin config schema merged with current stored values. Secret fields with a stored value are returned as `'••••••'`; unset secret fields are returned as `''`.

---

## `plugins.updateConfig`

**Type**: Mutation

**Input**:
```typescript
{ pluginId: string, config: Record<string, string> }
```

**Output**: `{ ok: true }`

**Behaviour**: Merges the provided config values into the stored config for the plugin. Fields whose value equals `'••••••'` are skipped (masked placeholder — do not overwrite stored secret). Raises `NOT_FOUND` if `pluginId` is not in the registry. Raises `BAD_REQUEST` if a required field is being set to an empty string.

---

## Injected helper filenames

| Runtime | Filename |
|---------|----------|
| Python (`python-uv`) | `cronulent_hooks.py` |
| Node.js (`node-volta`) | `cronulent_hooks.mjs` |

Helper files are written by the executor before each task spawn. If no plugins are enabled, the files are still written as empty stubs (to avoid import errors in scripts that always import them).
