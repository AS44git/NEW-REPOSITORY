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
   the **Favorites** tab (to unfavorite videos).
3. Open DevTools (`F12`, or `Cmd+Option+I` on Mac) → **Console** tab.
4. Open [`tiktok-bulk-unlike-unfavorite.js`](./tiktok-bulk-unlike-unfavorite.js),
   copy the whole file, and paste it into the console.
5. Before pressing Enter, check the `CONFIG` block near the top:
   - Set `MODE` to `'like'` (on the Liked tab) or `'favorite'` (on the
     Favorites tab) to match the tab you're on.
   - Consider setting `DRY_RUN: true` for a first run, so it logs what it
     *would* click without changing anything.
6. Press Enter. Watch the console — it processes one video at a time and
   logs progress.
7. It automatically stops after `MAX_ACTIONS_PER_RUN` (default 40) so you
   don't do thousands of actions in one sitting. To do another batch, just
   paste the script again — it remembers (via `localStorage`) which videos
   it already handled, so it won't repeat or get stuck.
8. To stop a run early at any point, type in the console:
   ```js
   window.__ttBulkStop = true
   ```

For a large library, spread batches across multiple sessions/days rather
than running it once with a huge `MAX_ACTIONS_PER_RUN`.

## If TikTok changes its page and the script stops finding buttons

TikTok updates its markup periodically. The script tries several known
selector patterns (TikTok's `data-e2e` test attributes) and will **stop
itself** rather than click blindly if it can't detect that a click did
anything. If you see a warning like "could not find the like/favorite
button" or "click didn't seem to change anything":

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
