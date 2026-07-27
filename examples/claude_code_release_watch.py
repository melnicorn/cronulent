"""
Claude Code release watcher — changelog.

Alerts via Telegram when a new version appears at the top of Claude Code's
CHANGELOG, and includes that release's notes in the message.

Why the raw changelog rather than a docs page: it's plain markdown served from
raw.githubusercontent.com, so there's no HTML to parse and nothing that quietly
changes shape when a site gets restyled. The newest release is always the first
`## <version>` heading in the file.

The last-seen version is kept in cronhooks.state, so this re-arms itself — one
alert per release, not a repeat every run. The first run seeds state and stays
quiet, so adding this task doesn't immediately fire.

No arguments needed for normal runs. Schedule daily.
    python3 script.py            # check + alert on a new version
    python3 script.py --print    # show what it currently sees
    python3 script.py --seed     # save the current version as the reference, no alert
"""

import re
import sys
import urllib.request
from datetime import datetime

from cronulent_hooks import cronhooks

URL = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md"
PRODUCT = "Claude Code"

# Matches a release heading like "## 2.1.220", capturing the version.
VERSION_HEADING = re.compile(r"^##\s+v?(\d+\.\d+\.\d+\S*)\s*$", re.MULTILINE)

# Telegram messages cap out well above this; keep notes readable regardless.
MAX_NOTES_CHARS = 1500


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "cronulent-claude-code-watcher"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def latest_release(markdown: str):
    """Return (version, notes) for the topmost release, or (None, None).

    None means the file didn't look like a changelog at all — treated as a
    broken watcher rather than as "no new release", so it can't fail silently.
    """
    match = VERSION_HEADING.search(markdown)
    if not match:
        return None, None

    # Notes run from the end of this heading to the next heading, or EOF.
    nxt = VERSION_HEADING.search(markdown, match.end())
    notes = markdown[match.end():nxt.start() if nxt else len(markdown)].strip()
    return match.group(1), notes


def main():
    print_only = "--print" in sys.argv
    seed_only = "--seed" in sys.argv

    log(f"Fetching {URL} ...")
    try:
        markdown = fetch(URL)
    except Exception as e:
        # A network blip must not read as "no new release" or as a change.
        log(f"Fetch failed: {e!r} — skipping this run (no alert).")
        sys.exit(1)

    version, notes = latest_release(markdown)

    if version is None:
        log("No version heading found — the changelog format changed.")
        if not print_only:
            cronhooks.telegram.send_message(
                f"\U0001f6a7 {PRODUCT} Watcher Broken",
                "Couldn't find a version heading in the changelog. The format may have "
                f"changed — check manually and fix the watcher:\n\n{URL}",
            )
        sys.exit(1)

    if print_only:
        log(f"latest={version}")
        log(f"notes:\n{notes}")
        return

    if seed_only:
        cronhooks.state.set({"version": version})
        log(f"Seeded state at {version} — no alert.")
        return

    last_seen = (cronhooks.state.get(default={}) or {}).get("version")

    if last_seen is None:
        # First run: record where we are so the next real release is the first alert.
        cronhooks.state.set({"version": version})
        log(f"First run — seeded state at {version}, no alert.")
        return

    if version == last_seen:
        log(f"No change (still {version}).")
        return

    log(f"NEW RELEASE: {last_seen} -> {version} — alerting!")
    body = notes[:MAX_NOTES_CHARS] + ("\n\n(truncated)" if len(notes) > MAX_NOTES_CHARS else "")
    cronhooks.telegram.send_message(
        f"✨ {PRODUCT} {version} released",
        f"Was {last_seen}, now {version}.\n\n{body}\n\n{URL}",
    )

    # Persist only after a successful send, so a failed alert retries next run.
    cronhooks.state.set({"version": version})
    log("Sent and state updated.")


if __name__ == "__main__":
    main()
