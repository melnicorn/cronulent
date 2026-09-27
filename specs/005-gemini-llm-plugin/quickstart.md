# Quickstart: Gemini LLM Plugin

## Enable and configure

1. Open **Plugins** in the dashboard and enable **Gemini**.
2. Click **Configure** and enter a Gemini **API Key** (from Google AI Studio). Optionally set **Model** (default `gemini-3.1-flash-lite`) and **Daily Call Limit** (default 20).
3. Save.

## Extract structured data (Python)

```python
from cronulent_hooks import cronhooks

result = cronhooks.gemini.extract(
    instructions="Does this post announce a reopening date? If so, extract it.",
    text=post_text,
    schema={
        "type": "object",
        "properties": {
            "found": {"type": "boolean"},
            "date": {"type": "string", "description": "ISO 8601 date, or empty"},
            "quote": {"type": "string"},
        },
        "required": ["found"],
    },
)
if result and result["found"]:
    cronhooks.telegram.send_message("Reopening announced", f"{result['date']}: {result['quote']}")
```

## Plain prompt (Node)

```js
import cronhooks from '../shared/cronulent_hooks.mjs'

const summary = await cronhooks.gemini.prompt(`Summarize in one sentence:\n\n${pageText}`)
```

## Shell

```sh
. ../shared/cronulent_hooks.sh
result=$(cronhooks_gemini_extract "Is this store open today?" "$page_text" '{"type":"object","properties":{"open":{"type":"boolean"}},"required":["open"]}')
echo "$result"
```

## Verifying the daily cap

1. Set **Daily Call Limit** to `2`.
2. Run a task that calls `cronhooks.gemini.prompt("hi")` three times and prints each result.
3. Expected result:
   - The task output shows two responses followed by `[cronulent] warning: dispatch failed: [gemini] daily limit of 2 calls reached…`.
   - The scheduler log shows `call 1/2`, `call 2/2`, `refused`.
4. Restart the scheduler and run the task again. It's still refused.
5. `data/state.json5` contains `__gemini_usage__: { day: '<today Pacific>', count: 2 }`.

## Tips

- Keep calls rare. Save a hash of the input with `cronhooks.state` and only call Gemini when the input changes.
- The cap counts cronulent's calls only. If the same Google project is used elsewhere (e.g., CI), Gemini can still return quota errors.
