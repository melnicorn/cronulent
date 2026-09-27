# Data Model: Gemini LLM Plugin

## Gemini plugin config

Stored in `data/config.json5` under `plugins.gemini`, like other plugins (`PluginConfigEntry`: `{ enabled, config: Record<string, string> }`).

| Key | Admin field type | Required | Default when blank | Validation |
|-----|------------------|----------|--------------------|------------|
| `apiKey` | `secret` | yes | — | non-empty, or the call is refused (not counted) |
| `model` | `string` | no | `gemini-3.1-flash-lite` | used verbatim in the request path |
| `dailyLimit` | `string` | no | `20` | must match `^\d+$`, otherwise the call is refused (not counted) |

## Daily usage record

Stored in `data/state.json5` through `StateStore` under the reserved key `__gemini_usage__`.

```ts
interface GeminiUsage {
  day: string    // quota day, 'YYYY-MM-DD' in America/Los_Angeles
  count: number  // requests sent to Gemini on `day`
}
```

**Transitions** (all inside one serialized section):

1. Read the record. If it's missing, or `day` ≠ today (Pacific), use `{ day: today, count: 0 }`.
2. If `count >= dailyLimit`, refuse. Nothing is written or sent.
3. Otherwise write `{ day: today, count: count + 1 }`, then send the request. The reservation stands whether or not the request succeeds.

The record never grows. Each new quota day overwrites it.

## Dispatch params (script → scheduler)

| func | params | result |
|------|--------|--------|
| `extract` | `{ instructions: string (min 1), text: string, schema: object }` | parsed JSON value that matches `schema` |
| `prompt` | `{ prompt: string (min 1) }` | `string` |

Invalid params are rejected before a slot is reserved, so they don't count.
