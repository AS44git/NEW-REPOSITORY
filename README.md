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
   for the tab — allow it, that's how the script reaches you without you
   watching the console.
7. With `AUTO_CONTINUE: true` (the default), it runs a batch (`BATCH_SIZE`
   videos, default 40), cools down for a random 10–25 minutes, then runs
   the next batch on its own — repeating until one of these happens, each
   with a desktop notification:
   - `DAILY_ACTION_CAP` is reached for the day (default 300, shared across
     both like and favorite runs on the account, resets at local midnight),
   - there's nothing left to process, or
   - it hits something that looks like a CAPTCHA/verification wall or a
     broken selector (a "hard stop" — see below).
8. To stop it early at any point, type in the console:
   ```js
   window.__ttBulkStop = true
   ```
9. You can leave the tab open in the background and walk away — just not
   close the tab, close the browser, or let the computer sleep, since the
   script only runs while that tab is alive.

### How many per day is safe?

There's no published TikTok limit to aim for — `DAILY_ACTION_CAP: 300` is a
conservative starting point, not a guarantee. A rough idea of the trade-off
for a library around 8,500 likes + 4,225 favorites (~12,700 total):

| Daily cap | Rough time to clear everything |
|---|---|
| 150/day | ~85 days |
| 300/day (default) | ~42 days |
| 600/day | ~21 days |

If several days pass with no CAPTCHAs or blocks, it's reasonable to raise
`DAILY_ACTION_CAP`. If you hit a CAPTCHA, lower it back down and take a
longer break before resuming.

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

## Favorited items that are unavailable but still count toward your total

Some entries under Favorites (or Liked) point at content that's since been
removed — a deleted video, or (under the Sounds/Effects sub-tabs) a sound
or effect that's gone. These still count toward the number TikTok shows,
but there's often no working overlay to open, so there's nothing for the
script to click through the normal path.

The script has a **best-effort, unverified** fallback for this: it looks
for a "..." / more-options control directly on the grid tile and tries to
click a "remove"-type entry in whatever menu appears, without opening the
item. I can't confirm this control exists or is named the way the script
guesses, since I don't have live access to TikTok's page. If the console
logs that it couldn't find one:

1. Hover over (or right-click) one of those unavailable tiles by hand and
   see if a small "..." icon or similar appears.
2. Right-click that control → **Inspect**, and note its `data-e2e`
   attribute or class, and the text/attribute of the "remove" option in
   whatever menu opens.
3. Share that with whoever maintains this script so the selectors in
   `MORE_OPTIONS_SELECTORS` / `REMOVE_MENU_KEYWORDS` can be tightened to
   match.

## Disclaimer

This script automates UI interactions against a service whose Terms of
Service prohibit automated use. Use it only on your own account, at your
own risk, and in modest batches. Nothing here bypasses authentication,
accesses any account other than the one you're logged into, or contacts
any server other than tiktok.com.
