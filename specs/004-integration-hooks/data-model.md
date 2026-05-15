# Data Model: Integration Hooks (Plugin System)

## New Types (packages/common/src/entities.ts)

### PluginAdminConfigField

Field definition for admin-only global configuration (e.g., bot token, chat ID). Task script authors never see these.

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Internal key; used as env var suffix (`CRONULENT_PLUGIN_{ID}_{KEY}`) |
| `label` | `string` | Display label in the admin config form |
| `type` | `'string' \| 'secret'` | `'secret'` fields are stored masked in the UI |
| `required` | `boolean` | Whether the field must be set for the plugin to function |

### PluginFunctionParam

Parameter definition for a callable helper function (visible to task script authors).

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Parameter name as used in function call |
| `type` | `string` | Type description (e.g., `'string'`, `'boolean'`) |
| `description` | `string` | Human-readable description |
| `optional` | `boolean` | Whether the parameter can be omitted |
| `defaultValue` | `string \| undefined` | Default value for optional params (e.g., `'false'`) |

### PluginFunction

A callable function exposed to task script authors.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name (e.g., `send_message` for Python, `sendMessage` for Node) |
| `description` | `string` | What the function does |
| `params` | `PluginFunctionParam[]` | User-facing parameters (excludes admin config; includes `strict`) |

### PluginManifest

Complete plugin description. Lives in `packages/common`; used by both the scheduler (for helper generation) and the web app (received via tRPC for UI rendering).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique plugin identifier, kebab-case (e.g., `'telegram'`) |
| `name` | `string` | Display name (e.g., `'Telegram'`) |
| `description` | `string` | One-sentence description |
| `adminConfigSchema` | `PluginAdminConfigField[]` | Fields the admin fills in globally |
| `pythonFunctionSchema` | `PluginFunction[]` | Python-style functions (snake_case names) |
| `nodeFunctionSchema` | `PluginFunction[]` | Node.js-style functions (camelCase names) |

### PluginState

Runtime state for a single plugin, as stored in config.json5 and returned via tRPC.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Plugin ID |
| `enabled` | `boolean` | Whether the plugin is active |
| `config` | `Record<string, string>` | Stored config values; `'secret'` fields returned as `'••••••'` to UI |

### LifecycleNotificationConfig

Per-task configuration for automatic post-execution notifications.

| Field | Type | Description |
|-------|------|-------------|
| `pluginId` | `string` | Which plugin to dispatch the notification via |

### Task (extension)

Add optional `lifecycleNotifications` to the existing `Task` entity:

| Field | Type | Description |
|-------|------|-------------|
| `lifecycleNotifications` | `LifecycleNotifications \| undefined` | Optional; absent = no auto-notifications |

```typescript
interface LifecycleNotifications {
  onSuccess?: LifecycleNotificationConfig
  onFailure?: LifecycleNotificationConfig
}
```

---

## Config.json5 Extension (apps/scheduler)

The scheduler's `data/config.json5` gains a top-level `plugins` key:

```typescript
interface PluginConfigEntry {
  enabled: boolean
  config: Record<string, string>  // raw values (secrets stored in plaintext server-side)
}

interface Config {
  passwordHash: string
  passwordSalt: string
  jwtSecret: string
  timezone?: string
  plugins?: Record<string, PluginConfigEntry>  // NEW
}
```

---

## New tRPC Context Fields (packages/common/src/router/context.ts)

```typescript
interface AppContext {
  // ...existing fields...
  pluginRegistry: {
    list(): PluginManifest[]
    get(id: string): PluginManifest | undefined
  }
  pluginConfig: {
    getState(pluginId: string): { enabled: boolean; config: Record<string, string> }
    setEnabled(pluginId: string, enabled: boolean): Promise<void>
    updateConfig(pluginId: string, config: Record<string, string>): Promise<void>
  }
}
```

---

## Telegram Plugin (first plugin — apps/scheduler/src/plugins/telegram.ts)

### Admin config schema
| Key | Label | Type | Required |
|-----|-------|------|----------|
| `botToken` | Bot Token | `secret` | true |
| `chatId` | Default Chat ID | `string` | true |

### Python function API schema
| Function | Parameters | Description |
|----------|-----------|-------------|
| `send_message` | `title: string`, `text: string`, `strict: boolean = False` | Send a message via Telegram |

### Node.js function API schema
| Function | Parameters | Description |
|----------|-----------|-------------|
| `sendMessage` | `title: string`, `text: string`, `strict: boolean = false` | Send a message via Telegram |

### Helper behavior (both runtimes)
1. Read `CRONULENT_PLUGIN_TELEGRAM_BOT_TOKEN` and `CRONULENT_PLUGIN_TELEGRAM_CHAT_ID` from env
2. If either is missing: `strict=true` → raise error; `strict=false` → log warning, return
3. POST to Telegram Bot API (`sendMessage` endpoint) with HTML parse mode
4. On network/API error: `strict=true` → raise error; `strict=false` → log warning, return

---

## Environment Variables Injected by Executor

For each enabled plugin, the executor adds to the child process environment:

```
CRONULENT_PLUGIN_{PLUGIN_ID_UPPER}_{FIELD_KEY_UPPER}=<value>
```

Example for Telegram:
```
CRONULENT_PLUGIN_TELEGRAM_BOT_TOKEN=1234567890:ABC...
CRONULENT_PLUGIN_TELEGRAM_CHAT_ID=-100123456789
```

Variables are injected for **all** enabled+configured plugins regardless of whether the specific task calls them.
