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
