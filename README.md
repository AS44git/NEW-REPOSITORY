# TikTok Bulk Unlike / Unfavorite

A browser-console script to bulk-unlike your liked TikTok videos or
bulk-unfavorite your favorited videos, using your own logged-in browser
session — no login automation, no API keys, no third-party access to your
account.

## How it works

TikTok has no public API for managing likes/favorites on your own account,
and automating the login flow directly is both blocked hard by TikTok and
a bad idea (it would need your password in a script). The only practical
approach is a script that runs **inside your already-logged-in browser
tab** and clicks the same heart/bookmark buttons you'd click by hand — just
automatically, one video at a time, with human-like random delays between
each click.

This is still against TikTok's Terms of Service, and no delay pattern
*guarantees* you won't get a captcha or a temporary block. The script is
built to minimize that risk (small batches, randomized/varying delays,
resumable progress) but can't eliminate it.

## Usage

1. Log into [tiktok.com](https://www.tiktok.com) in your normal browser.
2. Go to your own profile and open the **Liked** tab (to unlike videos) or
   the **Favorites → Videos** tab (to unfavorite videos). The script only
   understands the Videos grid — the Favorites **Sounds** and **Effects**
   sub-tabs use different page markup it doesn't handle yet.
3. Open DevTools (`F12`, or `Cmd+Option+I` on Mac) → **Console** tab.
4. Open [`tiktok-bulk-unlike-unfavorite.js`](./tiktok-bulk-unlike-unfavorite.js),
   copy the whole file, and paste it into the console.
5. Before pressing Enter, check the `CONFIG` block near the top:
   - Set `MODE` to `'like'` (on the Liked tab) or `'favorite'` (on the
     Favorites tab) to match the tab you're on.
   - Consider setting `DRY_RUN: true` for a first run, so it logs what it
     *would* click without changing anything.
6. Press Enter. The browser will likely ask for notification permission
   for the tab — **allow it**, that's how the script reaches you without
   you watching the console.
7. Verify notifications actually work before walking away — type in the
   console:
   ```js
   __ttBulkTestNotify()
   ```
   You should see a real desktop notification pop up (usually bottom-right
   on Windows, top-right on Mac). If nothing appears: click the lock/info
   icon left of the address bar → **Notifications → Allow** for the site,
   and separately check your OS notification settings for the browser
   itself (Windows Settings → Notifications, or macOS System Settings →
   Notifications) — both have to allow it, or you'll get silence.
8. With `AUTO_CONTINUE: true` (the default), it runs a batch (`BATCH_SIZE`
   videos, default 40), cools down, then runs the next batch on its own —
   repeating until one of these happens, each with its own distinctly
   titled desktop notification so you know at a glance which one fired:
   - **"TikTok bulk: daily cap reached"** — `DAILY_ACTION_CAP` hit for the
     day (shared between like and favorite runs on the account), resets at
     local midnight.
   - **"TikTok bulk script needs you"** — a hard stop: a click had no
     effect, usually a CAPTCHA/verification prompt or a broken selector.
     Go look at the tab, this one needs you.
   - **"TikTok bulk script finished"** — nothing left to process.
   - **"TikTok bulk: batch done"** — only appears if you set
     `AUTO_CONTINUE: false`.
9. To stop it early at any point, type in the console:
   ```js
   window.__ttBulkStop = true
   ```
10. You can minimize the browser, switch tabs, or switch to a completely
    different browser (e.g. run this in Edge while you use Chrome for
    everything else) and it keeps working — when it detects the tab is
    hidden, it automatically waits longer at each step before deciding
    something's actually wrong, since backgrounded tabs render updates
    slower and a short wait can otherwise look like a false failure. What
    it can't survive: closing the tab, closing the browser, or the
    computer going to sleep (screen lock alone is usually fine; actual
    sleep/hibernate pauses everything, including the cooldown timer).

### Editing the daily cap or cooldown mid-project

Just change the numbers in `CONFIG` before your next paste — `DAILY_ACTION_CAP`,
`COOLDOWN_MIN_MS`/`COOLDOWN_MAX_MS`, `BATCH_SIZE`, etc. Your progress
(which videos are done, and today's count) lives in `localStorage`, keyed
to your account — it's untouched by editing these numbers, so you can
raise or lower them between runs freely. If the script is already
mid-run, stop it first (`window.__ttBulkStop = true`), then paste the
edited version.

### How many per day, to finish in under 3 weeks

There's no published TikTok limit to aim for — this is an estimate, not a
guarantee. For ~8,500 likes + ~4,225 favorites (~12,700 total actions):

| Daily cap (shared, likes+favorites) | Rough time to clear everything |
|---|---|
| 300 (conservative starting point) | ~42 days |
| 450 | ~28 days |
| **650** | **~20 days** |
| 900 | ~14 days |

Recommended approach: start at the default `DAILY_ACTION_CAP: 300` for
the first 2–3 days as a test. If nothing weird happens (no CAPTCHA, no
"needs you" notification, no visible restriction on the account), raise it
to around **650** — that lands you under 3 weeks — and keep an eye on the
first day or two at the new level before trusting it fully. If a CAPTCHA
or block ever shows up, drop back to something like 200–300 and give the
account a day or two of rest before resuming.

Note the cooldown (`COOLDOWN_MIN_MS`/`MAX_MS`, default 10–25 min between
batches of 40) isn't really the bottleneck here — at that pace the script
could burn through 650 actions in a few hours of wall-clock time. The
daily cap is what actually controls your total exposure per day, so raising
`DAILY_ACTION_CAP` is the lever that gets you done sooner; there's no need
to shrink the cooldown too.

## "Overlay did not open" / stuck repeating the same video

Some liked/favorited posts are TikTok's photo-slideshow format (images +
audio, no video player). Clicking those never opens the normal video
overlay, so the script can't unlike/unfavorite them automatically — after
a couple of retries it gives up on that one item and moves on to the next.
That post just needs to be handled by hand. This is expected behavior, not
a sign that something's broken with your account.

## If TikTok changes its page and the script stops finding buttons

TikTok updates its markup periodically. The script tries several known
selector patterns (TikTok's `data-e2e` test attributes) and will **stop
itself** rather than click blindly if it can't detect that a click did
anything — a desktop notification tells you when this happens. If you see
a warning like "could not find the like/favorite button" or "click didn't
seem to change anything", it could be a stale selector *or* a CAPTCHA/
verification prompt that popped up — check the tab first. If it's a stale
selector:

1. On the page, right-click the heart (or bookmark) icon on an open video
   and choose **Inspect**.
2. Look for an attribute on or near that element like `data-e2e="..."`.
3. Add that selector string to `LIKE_SELECTORS` or `FAVORITE_SELECTORS` in
   the `CONFIG` block at the top of the script, then paste and run it
   again.

## Disclaimer

This script automates UI interactions against a service whose Terms of
Service prohibit automated use. Use it only on your own account, at your
own risk, and in modest batches. Nothing here bypasses authentication,
accesses any account other than the one you're logged into, or contacts
any server other than tiktok.com.
