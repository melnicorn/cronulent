"""
STL Aquarium Foundation — Splash Bash page-change watcher.

The old "coming soon" placeholder is gone (sponsors can now buy tables), so we
no longer have a single phrase to trigger on. Instead this watches the event
page's main content block and alerts via Telegram whenever it changes from the
last-seen content — the signal that individual tickets (or new details) have
been posted.

It remembers the last-seen content in cronhooks.state and compares against that,
persisting the current content after every successful run. So it re-arms itself
automatically: you get ONE alert per change, not a repeat every day. No manual
edits needed after acting on an alert.

Scope of what's watched: the visible TEXT of the WordPress `entry-content`
section only. Sponsor logos are images, so adding them does NOT trigger an
alert; a wording change, a new "Buy Tickets" link/heading, etc. will.

BASELINE below is only the first-run seed / a sane fallback if saved state is
ever lost — it is not re-edited by hand anymore.

No arguments needed for normal runs. Schedule to run daily.
    python3 splash_watch.py            # check + alert on change, then persist
    python3 splash_watch.py --print    # just print the current content + hash
    python3 splash_watch.py --seed     # save current content as the reference, no alert
"""

import sys
import hashlib
import difflib
import re
import urllib.request
from datetime import datetime

from cronulent_hooks import cronhooks

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Missing dependency: pip3 install beautifulsoup4")


URL = "https://www.stlaquariumfoundation.org/events/splash-bash/"

# CSS selector for the page's main content block (WordPress post body).
CONTENT_SELECTOR = "section.entry-content"

# First-run seed / fallback if saved state is ever lost. The *normalized text*
# of the content block (see normalize()) as of 2026-06-28. Not edited by hand
# after acting on an alert — the watcher re-arms itself via cronhooks.state.
BASELINE = (
    "Join us on Friday, November 13, 2026 where the Mississippi meets the Gulf "
    "in New Orleans! Get ready for a fun evening of great food, cocktails and "
    "interactive entertainment in our interpretation of the Big Easy! The St. "
    "Louis Aquarium Foundation offers educational programming for kids to learn "
    "about aquatic animals, think critically about conservation issues, and "
    "participate in fun STEM-based activities and projects. Through the H2O "
    "Friends program , the Foundation provides free access to the St. Louis "
    "Aquarium and STEM-based conservation and aquatic life education for youth "
    "from Title I schools as well as other underserved community partners. 100% "
    "of funds raised at this event will go to supporting the H 2 O Friends "
    "program! Honorary Co-Chairs: Bob O’Loughlin and Steve O’Loughlin "
    "For Sponsor information and registration, click here . Presenting Sponsor"
)


def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8")


def normalize(text: str) -> str:
    """Collapse all whitespace runs to single spaces and trim the ends."""
    return re.sub(r"\s+", " ", text).strip()


def extract_content(html: str) -> str | None:
    """Return normalized text of the content block, or None if it's missing."""
    soup = BeautifulSoup(html, "html.parser")
    el = soup.select_one(CONTENT_SELECTOR)
    if el is None:
        return None
    return normalize(el.get_text(" "))


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def alert(title: str, body: str):
    log(f"Sending Telegram alert: {title}")
    cronhooks.telegram.send_message(title, body)
    log("Sent.")


def save_state(current: str, changed: bool, saved: dict | None):
    cronhooks.state.set({
        "text": current,
        "hash": sha(current),
        "last_checked": now(),
        "last_changed": now() if changed else (saved.get("last_changed") if saved else now()),
    })


def main():
    print_only = "--print" in sys.argv
    seed_only = "--seed" in sys.argv

    log(f"Fetching {URL} ...")
    try:
        html = fetch(URL)
    except Exception as e:
        # A transient network/HTTP blip should NOT look like a content change.
        # Log and exit non-zero so the run is visibly failed, but don't alert
        # and don't touch saved state.
        log(f"Fetch failed: {e!r} — skipping this run (no alert).")
        sys.exit(1)

    current = extract_content(html)

    if print_only:
        if current is None:
            log(f"Content block '{CONTENT_SELECTOR}' not found.")
            sys.exit(1)
        log(f"Current content hash: {sha(current)} (len {len(current)})")
        print("\n--- BEGIN CONTENT ---")
        print(current)
        print("--- END CONTENT ---")
        return

    if current is None:
        # The selector broke — either the page was restructured or the post
        # moved. That's worth knowing about, so alert. Keep the good saved
        # state; don't overwrite it with a "missing" reading.
        log(f"Content block '{CONTENT_SELECTOR}' not found — page structure changed.")
        alert(
            "\U0001f6a7 Splash Bash — Page Structure Changed",
            "Couldn't find the event content block on the page. The site may "
            f"have been restructured. Check it manually:\n\n{URL}",
        )
        sys.exit(1)

    if seed_only:
        # Arm the watcher to the current page without alerting. Use this once to
        # silence a pending change you've already acted on.
        save_state(current, changed=False, saved=None)
        log(f"Seeded state to current content (hash {sha(current)}). No alert sent.")
        return

    saved = cronhooks.state.get(default=None)
    reference = saved["text"] if saved and saved.get("text") else normalize(BASELINE)
    log(f"reference hash {sha(reference)} | current hash {sha(current)}")

    changed = current != reference
    if changed:
        log("Content CHANGED — tickets or new details may now be available!")
        diff = "\n".join(
            difflib.unified_diff(
                reference.split(". "),
                current.split(". "),
                fromfile="previous",
                tofile="current",
                lineterm="",
            )
        )
        if len(diff) > 1500:
            diff = diff[:1500] + "\n… (truncated)"
        alert(
            "\U0001f39f️ Splash Bash Ticket Alert",
            "The Splash Bash event page content changed — tickets or new details "
            f"may now be available!\n\n{URL}\n\nWhat changed:\n{diff}",
        )
    else:
        log("Content unchanged — no tickets/details yet.")

    # Always persist the current content so the next run compares against it.
    # This is what re-arms the watcher: one alert per change, not daily repeats.
    save_state(current, changed, saved)


if __name__ == "__main__":
    main()
