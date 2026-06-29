# Quickstart: Integration Hooks (Plugin System)

## Enabling and configuring the Telegram plugin

1. Navigate to **Plugins** in the dashboard navigation.
2. Find **Telegram** in the plugin list and click **Enable**.
3. Click **Configure** to open the Telegram configuration page.
4. Enter your **Bot Token** and **Default Chat ID**, then click **Save**.
5. The usage documentation on the page shows how to call the helper from your scripts.

---

## Calling the Telegram helper from a Python task

```python
# cronulent_hooks is automatically available — no import path needed
from cronulent_hooks import telegram

# Send a notification (silent skip if plugin unconfigured)
telegram.send_message("Task complete", "The nightly export finished successfully.")

# Send a critical notification (raises error if plugin unconfigured)
telegram.send_message("ALERT", "Database backup failed!", strict=True)
```

---

## Calling the Telegram helper from a Node.js task

```javascript
import { telegram } from './cronulent_hooks.mjs'

// Send a notification (silent skip if plugin unconfigured)
await telegram.sendMessage('Task complete', 'The nightly export finished successfully.')

// Send a critical notification (throws if plugin unconfigured)
await telegram.sendMessage('ALERT', 'Database backup failed!', true)
```

---

## Persisting state across runs (the `state` hook)

Cron jobs have no persistent local filesystem, so scripts are otherwise stateless
between runs. The built-in `state` hook lets a job save and load a small blob of
custom JSON that survives to the next run. It is always available — there is
nothing to enable or configure.

```python
from cronulent_hooks import cronhooks

state = cronhooks.state.get(default={})   # parsed JSON, or the default on first run
state["last_hash"] = "f381be3a1acb"
cronhooks.state.set(state)                # save — replaces the whole blob

cronhooks.state.update(count=1)           # shallow-merge into the existing dict, then save
cronhooks.state.clear()                   # delete saved state
```

```javascript
import { state } from './cronulent_hooks.mjs'

const s = await state.get({})             // parsed JSON, or the default on first run
s.lastHash = 'f381be3a1acb'
await state.set(s)                         // save — replaces the whole blob
await state.clear()                        // delete saved state
```

Behavior and limits:

- **One blob per job.** State is scoped automatically to the calling job — you
  never pass an identifier.
- **JSON only.** Any top-level JSON value works (dict, list, string, number,
  bool, null); the examples use dicts. A non-serializable value raises a clear
  error naming the offending type.
- **Size limit: 1 MiB** (1,048,576 bytes) on the UTF-8-encoded JSON. Exceeding it
  raises an error reporting the actual size and the limit, before anything is
  saved.
- **Robust to missing state.** `get(default=…)` returns the default when nothing
  has been saved and never raises for that reason.
- **Best-effort isolation, not a security boundary.** State is keyed on an
  unguessable per-job key (an HMAC of the job id), not on the plain job id, so a
  script can't read another job's state by guessing. There is no encryption or
  per-script ACL beyond that.

The saved blob is visible (read-only, with size and last-updated time) in the
**State** section of the task's detail page.

### Example: a watcher that re-arms itself

A page-change watcher can store the last-seen content and compare against it next
run, so it alerts once per change instead of every day. See
[`examples/splash_watch.py`](../../examples/splash_watch.py) for the full script;
the core of it:

```python
saved = cronhooks.state.get(default=None)
reference = saved["text"] if saved and saved.get("text") else normalize(BASELINE)

current = extract_content(fetch(URL))
if current != reference:
    cronhooks.telegram.send_message("Page changed", build_diff(reference, current))

# Always persist the current content so the next run compares against it.
cronhooks.state.set({"text": current, "hash": sha(current), "last_checked": now()})
```

---

## Configuring lifecycle auto-notifications (no script changes required)

1. Open a task's edit page.
2. Under **Notifications**, choose **On failure**, **On success**, or **Both**.
3. Select the plugin to use (e.g., Telegram).
4. Save the task.

The scheduler dispatches the notification automatically after each execution — no helper calls needed in the script. This works for all task types including shell scripts and executables.

---

## Adding a new plugin (developer guide)

1. Create `apps/scheduler/src/plugins/{id}.ts`. Export:
   - `manifest: PluginManifest` — admin config schema + function API schemas
   - `generatePythonHelper(): string` — returns complete Python helper source
   - `generateNodeHelper(): string` — returns complete Node.js helper source
2. Add the plugin to the array in `apps/scheduler/src/plugins/index.ts`.
3. The Manage Plugins page and per-plugin config page render automatically from the manifest.
