# Contract: Gemini script helpers

All helpers go through the existing internal `plugins.dispatch` mutation (`pluginId: 'gemini'`). On any failure the server throws an error whose message starts with `[gemini]`. The helper then applies the `strict` convention: non-strict prints a warning and returns an empty value, strict raises or returns non-zero.

## Python (`from cronulent_hooks import cronhooks`)

```python
cronhooks.gemini.extract(instructions: str, text: str, schema: dict, strict: bool = False) -> Any | None
cronhooks.gemini.prompt(prompt: str, strict: bool = False) -> str | None
```

Client timeout: 90 s.

## Node (`import cronhooks from 'cronulent_hooks.mjs'`)

```js
await cronhooks.gemini.extract(instructions, text, schema, strict = false) // → object | undefined
await cronhooks.gemini.prompt(prompt, strict = false)                      // → string | undefined
```

## Shell (`. ../shared/cronulent_hooks.sh`)

```sh
cronhooks_gemini_extract "<instructions>" "<text>" '<schema-json>' [strict]   # prints result JSON to stdout
cronhooks_gemini_prompt "<prompt>" [strict]                                  # prints response text to stdout
```

- Success: exit 0, result on stdout.
- Failure, non-strict: warning on stderr, nothing on stdout, exit 0.
- Failure, strict: message on stderr, exit 1.

## Server error messages (surfaced to scripts)

| Situation | Counted | Message |
|-----------|---------|---------|
| Plugin disabled / no API key | no | `[gemini] plugin is not enabled or has no API key` |
| Bad params | no | `[gemini] invalid params — <field>: <issue>` |
| Bad `dailyLimit` config | no | `[gemini] dailyLimit must be a whole number` |
| Daily limit reached | no | `[gemini] daily limit of N calls reached; resets at midnight Pacific` |
| HTTP 429 | yes | `[gemini] quota or rate limit exceeded (HTTP 429): <detail>` |
| Other HTTP error | yes | `[gemini] HTTP <status>: <detail>` |
| Network error / 60 s timeout | yes | `[gemini] request failed: <reason>` |
| Blocked / empty | yes | `[gemini] blocked (<reason>)` / `[gemini] empty response (finishReason <reason>)` |
| Unparseable JSON (extract) | yes | `[gemini] response was not valid JSON` |

## Scheduler log line (FR-014)

```
[gemini] call 3/20 today (extract): ok
[gemini] call 4/20 today (prompt): failed — HTTP 503
[gemini] refused (extract): daily limit of 20 reached
```

Log lines never include the API key, the prompt, or the input text.
