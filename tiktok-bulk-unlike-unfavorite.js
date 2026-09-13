/**
 * TikTok Bulk Unlike / Unfavorite — browser console script
 *
 * WHAT THIS IS
 * A script you paste into your browser's DevTools console while you are
 * logged into tiktok.com in a normal browser tab. It drives the real page
 * UI (clicks the same heart/bookmark buttons you would click by hand) —
 * it does not call any private API directly and does not touch your
 * password or login. That's the only way to do this without automating
 * TikTok's login, which TikTok blocks hard.
 *
 * IMPORTANT — READ BEFORE RUNNING
 * - This is against TikTok's Terms of Service. There is no rate limit that
 *   "guarantees" you won't get a captcha, a temporary action-block, or a
 *   flag. Random delays and small batches lower the odds, they don't
 *   eliminate them.
 * - Run this in small batches (the default caps each run at 40 actions),
 *   spread across a few sessions/days if you have hundreds or thousands
 *   of liked/favorited videos.
 * - TikTok changes its page structure often. The CSS/data selectors below
 *   can go stale. The script tries several known selector patterns and
 *   will STOP itself (instead of clicking blindly) if it can't tell that
 *   a click actually changed anything — see "If it stops itself" below.
 * - Use DRY_RUN: true first to see exactly what it *would* click without
 *   changing anything.
 *
 * HOW TO USE
 * 1. Go to your own TikTok profile (tiktok.com/@yourusername) while logged in.
 * 2. Click the "Liked" tab to unlike videos, or the "Favorites" tab to
 *    unfavorite videos. (The "Liked" tab is only visible to you if your
 *    liked-videos privacy setting is set to "Only me" or you're the owner —
 *    that's fine, you don't need to change it.)
 * 3. Open DevTools (F12 or Cmd+Opt+I), go to the Console tab.
 * 4. Copy this whole file, paste it into the console, edit CONFIG below if
 *    you want, and press Enter.
 * 5. Watch the console log. It processes one video at a time with a random
 *    human-like delay between each. It stops automatically after
 *    MAX_ACTIONS_PER_RUN actions, or when there's nothing left to process.
 * 6. To do more, just run it again (paste + Enter) — it remembers which
 *    videos it already handled (per TikTok account, in localStorage) so it
 *    won't reprocess or get stuck.
 * 7. To stop it early at any time, run:  window.__ttBulkStop = true
 *
 * IF IT STOPS ITSELF / SEEMS BROKEN
 * TikTok's DOM changes. If the script logs
 * "Could not find the like/favorite button" or "click didn't seem to do
 * anything", it means their markup shifted. To fix it:
 *   - Open one liked video's overlay by hand, right-click the heart icon,
 *     choose Inspect, and look for an attribute like data-e2e="something".
 *   - Add that selector string to the LIKE_SELECTORS or FAVORITE_SELECTORS
 *     array near the top of CONFIG below, then re-run.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // CONFIG — edit these before running
  // ---------------------------------------------------------------------
  const CONFIG = {
    // 'like'     -> unlikes every video on the current (Liked) tab
    // 'favorite' -> unfavorites every video on the current (Favorites) tab
    MODE: 'like',

    // If true, does everything except the actual click — just logs what
    // it would do. Run with this on first to sanity-check.
    DRY_RUN: false,

    // Stop after this many successful actions in one run. Re-run the
    // script to continue where it left off. Keep this modest.
    MAX_ACTIONS_PER_RUN: 40,

    // Random delay range (ms) between processing each video.
    DELAY_MIN_MS: 3000,
    DELAY_MAX_MS: 9000,

    // Every this many actions, take a longer break (looks less robotic).
    LONG_BREAK_EVERY: 10,
    LONG_BREAK_MIN_MS: 15000,
    LONG_BREAK_MAX_MS: 35000,

    // How long to wait for the video overlay to open after clicking a
    // thumbnail, and after clicking like/favorite, before double-checking.
    OVERLAY_WAIT_MS: 1500,
    POST_CLICK_WAIT_MS: 900,

    // Selector candidates, tried in order, for the like/favorite button
    // inside the opened video overlay. Add more here if TikTok changes
    // its markup and the script can't find the button anymore.
    LIKE_SELECTORS: [
      '[data-e2e="browse-like-icon"]',
      '[data-e2e="like-icon"]',
      '[data-e2e="video-detail-like"]',
      '[data-e2e="video-detail-like"] [data-e2e="like-icon"]',
    ],
    FAVORITE_SELECTORS: [
      '[data-e2e="browse-favorite-icon"]',
      '[data-e2e="video-detail-favorite"]',
      '[data-e2e="undefined-favorite-icon"]',
      '[data-e2e="favorite-icon"]',
    ],
    CLOSE_SELECTORS: [
      '[data-e2e="browse-close-icon"]',
      '[data-e2e="video-detail-close"]',
    ],

    // How far to scroll (px) when no unprocessed videos are visible.
    SCROLL_STEP_PX: window.innerHeight * 2.5,
    // Give the grid time to lazy-load after a scroll.
    SCROLL_WAIT_MS: 1800,
    // If scrolling this many times in a row doesn't reveal anything new,
    // assume we've reached the end of the list.
    MAX_EMPTY_SCROLLS: 4,
  };

  // ---------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------
  if (window.__ttBulkRunning) {
    console.warn('[tt-bulk] Already running. Set window.__ttBulkStop = true to stop it first.');
    return;
  }
  window.__ttBulkRunning = true;
  window.__ttBulkStop = false;

  const storageKey = `tt_bulk_processed_${CONFIG.MODE}_${location.pathname.split('/')[1] || 'unknown'}`;
  const processed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));

  const log = (...args) => console.log('[tt-bulk]', ...args);
  const warn = (...args) => console.warn('[tt-bulk]', ...args);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min));

  function saveProgress() {
    localStorage.setItem(storageKey, JSON.stringify([...processed]));
  }

  function extractVideoId(href) {
    const match = href && href.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  }

  function getGridAnchors() {
    return [...document.querySelectorAll('a[href*="/video/"]')].filter((a) => {
      const id = extractVideoId(a.getAttribute('href') || '');
      return id && !processed.has(id);
    });
  }

  function queryFirstVisible(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function findClickTarget(el) {
    return el.closest('button, [role="button"], [tabindex]') || el;
  }

  async function waitForOverlay() {
    await sleep(CONFIG.OVERLAY_WAIT_MS);
    // Overlay is "open" once the URL contains /video/ or a close icon exists.
    return /\/video\//.test(location.pathname) || !!queryFirstVisible(CONFIG.CLOSE_SELECTORS);
  }

  function closeOverlay() {
    const closeBtn = queryFirstVisible(CONFIG.CLOSE_SELECTORS);
    if (closeBtn) {
      findClickTarget(closeBtn).click();
      return;
    }
    // Fallback: Escape key, then browser back if that fails to navigate away.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (/\/video\//.test(location.pathname)) {
      history.back();
    }
  }

  async function processOne(anchor) {
    const id = extractVideoId(anchor.getAttribute('href') || '');
    log(`Opening video ${id}...`);
    anchor.scrollIntoView({ block: 'center' });
    findClickTarget(anchor).click();

    const opened = await waitForOverlay();
    if (!opened) {
      warn(`Video ${id}: overlay did not open, skipping this one.`);
      return 'skip';
    }

    const selectors = CONFIG.MODE === 'like' ? CONFIG.LIKE_SELECTORS : CONFIG.FAVORITE_SELECTORS;
    const actionEl = queryFirstVisible(selectors);
    if (!actionEl) {
      warn(`Video ${id}: could not find the ${CONFIG.MODE} button. Selectors may be stale — see the comment at the top of this script for how to fix.`);
      closeOverlay();
      return 'stop';
    }

    const before = actionEl.outerHTML;

    if (CONFIG.DRY_RUN) {
      log(`[dry run] Would click ${CONFIG.MODE} button for video ${id}.`);
    } else {
      findClickTarget(actionEl).click();
      await sleep(CONFIG.POST_CLICK_WAIT_MS);

      const after = document.contains(actionEl) ? actionEl.outerHTML : queryFirstVisible(selectors)?.outerHTML;
      if (after === before) {
        warn(`Video ${id}: click didn't seem to change anything. Stopping so nothing gets clicked blindly — check the selectors.`);
        closeOverlay();
        return 'stop';
      }
      log(`Video ${id}: ${CONFIG.MODE === 'like' ? 'unliked' : 'unfavorited'}.`);
    }

    processed.add(id);
    saveProgress();
    closeOverlay();
    return 'ok';
  }

  async function run() {
    let actionsThisRun = 0;
    let emptyScrolls = 0;

    log(`Starting. mode=${CONFIG.MODE} dryRun=${CONFIG.DRY_RUN} maxActions=${CONFIG.MAX_ACTIONS_PER_RUN}`);
    log(`Already processed in earlier runs: ${processed.size}`);

    while (actionsThisRun < CONFIG.MAX_ACTIONS_PER_RUN) {
      if (window.__ttBulkStop) {
        log('Stopped manually (window.__ttBulkStop was set).');
        break;
      }

      const candidates = getGridAnchors();
      if (candidates.length === 0) {
        emptyScrolls += 1;
        if (emptyScrolls > CONFIG.MAX_EMPTY_SCROLLS) {
          log('No more unprocessed videos found after several scrolls. Done for now.');
          break;
        }
        log('No unprocessed videos visible, scrolling to load more...');
        window.scrollBy(0, CONFIG.SCROLL_STEP_PX);
        await sleep(CONFIG.SCROLL_WAIT_MS);
        continue;
      }
      emptyScrolls = 0;

      const result = await processOne(candidates[0]);
      if (result === 'stop') break;
      if (result === 'ok') actionsThisRun += 1;

      if (window.__ttBulkStop) {
        log('Stopped manually (window.__ttBulkStop was set).');
        break;
      }

      const isLongBreak = actionsThisRun > 0 && actionsThisRun % CONFIG.LONG_BREAK_EVERY === 0;
      const delay = isLongBreak
        ? randomBetween(CONFIG.LONG_BREAK_MIN_MS, CONFIG.LONG_BREAK_MAX_MS)
        : randomBetween(CONFIG.DELAY_MIN_MS, CONFIG.DELAY_MAX_MS);
      if (isLongBreak) log(`Taking a longer break (${Math.round(delay / 1000)}s)...`);
      await sleep(delay);
    }

    log(`Run finished. Actions this run: ${actionsThisRun}. Total processed all-time: ${processed.size}.`);
    log('Run the script again (paste + Enter) to continue with the next batch.');
    log(`To reset progress tracking for this mode/account: localStorage.removeItem(${JSON.stringify(storageKey)})`);
  }

  run().finally(() => {
    window.__ttBulkRunning = false;
  });
})();
