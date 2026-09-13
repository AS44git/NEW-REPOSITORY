/**
 * TikTok Bulk Unlike / Unfavorite — browser console script
 *
 * WHAT THIS IS
 * A script you paste into your browser's DevTools console while you are
 * logged into tiktok.com in a normal browser tab. It drives the real page
 * UI (clicks the same heart/bookmark buttons you would click by hand) —
 * it does not call any private API directly and does not touch your
 * password or login.
 *
 * IMPORTANT — READ BEFORE RUNNING
 * - This is against TikTok's Terms of Service. There is no rate limit that
 *   "guarantees" you won't get a captcha, a temporary action-block, or a
 *   flag. Random delays and daily caps lower the odds, they don't
 *   eliminate them.
 * - TikTok changes its page structure often. The CSS/data selectors below
 *   can go stale. The script will STOP itself (instead of clicking
 *   blindly) if it can't tell that a click actually changed anything.
 * - Use DRY_RUN: true first to see exactly what it *would* click without
 *   changing anything.
 *
 * HOW TO USE
 * 1. Go to your own TikTok profile while logged in.
 * 2. Click the "Liked" tab to unlike videos, or the "Favorites" tab (Videos
 *    sub-tab) to unfavorite videos. NOTE: this script only handles the
 *    Videos grid — the Favorites "Sounds" and "Effects" sub-tabs use
 *    different page markup this script doesn't know about yet.
 * 3. Open DevTools (F12 or Cmd+Opt+I) → Console tab.
 * 4. Copy this whole file, paste it into the console, edit CONFIG below if
 *    you want, and press Enter. The first time, your browser will likely
 *    ask permission to show notifications for this tab — allow it, that's
 *    how you get alerted without watching the console.
 * 5. It processes videos in batches with random human-like delays, and
 *    with AUTO_CONTINUE on (the default) it automatically keeps going,
 *    batch after batch with cooldowns in between, until either:
 *      - it runs out of videos to process,
 *      - it hits DAILY_ACTION_CAP for the day, or
 *      - it hits something that looks like a CAPTCHA/verification wall or
 *        a broken selector (a "hard stop").
 *    In every one of those cases you get a desktop notification, so you
 *    can leave the tab running in the background instead of watching it.
 * 6. To stop it early at any time, run:  window.__ttBulkStop = true
 * 7. It remembers progress (per account, per mode) in localStorage, so
 *    closing the tab and pasting the script again later just continues.
 *
 * IF IT STOPS ITSELF / SEEMS BROKEN
 * If the console shows "could not find the like/favorite button" or
 * "click didn't seem to do anything", TikTok's markup likely shifted, or
 * a CAPTCHA/verification prompt appeared — check the tab. To fix a stale
 * selector:
 *   - Open one liked video's overlay by hand, right-click the heart icon,
 *     choose Inspect, and look for an attribute like data-e2e="something".
 *   - Add that selector string to LIKE_SELECTORS / FAVORITE_SELECTORS
 *     below, then re-run.
 *
 * Items with no working overlay (photo/carousel posts, or removed videos)
 * get skipped automatically after a couple of tries — that's expected, not
 * a bug. Unavailable/removed favorited sounds and effects are a separate,
 * harder problem this script doesn't attempt yet.
 *
 * TESTING NOTIFICATIONS
 * After pasting/running this script once (so the permission prompt has
 * been answered), verify notifications actually reach your desktop by
 * typing in the console:
 *   __ttBulkTestNotify()
 * If nothing appears, check both the site permission (click the lock/info
 * icon left of the address bar → Notifications → Allow) and your OS-level
 * notification settings for the browser itself (both have to allow it).
 * Each real notification this script sends has its own distinct title so
 * you can tell them apart at a glance: "TikTok bulk: daily cap reached",
 * "TikTok bulk script needs you" (a hard stop — go look), "TikTok bulk
 * script finished" (nothing left to process), and "TikTok bulk: batch
 * done" (only shown if AUTO_CONTINUE is off).
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

    // How many actions to do in one uninterrupted batch before taking a
    // longer cooldown. Keep this modest even though AUTO_CONTINUE means
    // you don't have to manually restart batches.
    BATCH_SIZE: 40,

    // Hard ceiling on total actions per calendar day, shared across both
    // modes (liking and favoriting both count against the same budget,
    // since it's all "automated activity on this account" as far as risk
    // goes). Once hit, the script stops and notifies you; it resets at
    // local midnight. There's no official TikTok number to aim for here —
    // this is a conservative starting guess. If a few days go by with no
    // captchas/blocks, you can raise it.
    DAILY_ACTION_CAP: 300,

    // If true, after finishing a batch the script sleeps for a cooldown
    // and then automatically starts the next batch itself — no need to
    // re-paste the script. Set to false to go back to "one batch per
    // paste".
    AUTO_CONTINUE: true,

    // Random cooldown range (ms) between batches when AUTO_CONTINUE is on.
    COOLDOWN_MIN_MS: 10 * 60 * 1000, // 10 min
    COOLDOWN_MAX_MS: 25 * 60 * 1000, // 25 min

    // Whether to request permission for, and send, desktop notifications
    // when the script stops for any reason (batch/day done, or stuck).
    NOTIFY: true,

    // Random delay range (ms) between processing each video within a batch.
    DELAY_MIN_MS: 3000,
    DELAY_MAX_MS: 9000,

    // Every this many actions within a batch, take a longer break (looks
    // less robotic).
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

    // If a video's overlay fails to open this many times in a row, give up
    // on it and permanently skip it (some liked/favorited posts are photo
    // carousels or removed videos/sounds/effects that never open the
    // normal video player).
    MAX_OPEN_ATTEMPTS: 2,
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

  const account = location.pathname.split('/')[1] || 'unknown';
  const storageKey = `tt_bulk_processed_${CONFIG.MODE}_${account}`;
  const dailyKey = `tt_bulk_daily_${account}`;
  const processed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  const openAttempts = new Map();

  const log = (...args) => console.log('[tt-bulk]', ...args);
  const warn = (...args) => console.warn('[tt-bulk]', ...args);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min));

  function saveProgress() {
    localStorage.setItem(storageKey, JSON.stringify([...processed]));
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDailyState() {
    const raw = JSON.parse(localStorage.getItem(dailyKey) || 'null');
    if (!raw || raw.date !== todayKey()) return { date: todayKey(), count: 0 };
    return raw;
  }

  function addToDailyCount(n) {
    const state = getDailyState();
    state.count += n;
    localStorage.setItem(dailyKey, JSON.stringify(state));
    return state.count;
  }

  async function requestNotifyPermission() {
    if (!CONFIG.NOTIFY || typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function notify(title, body) {
    log(`[notify] ${title} — ${body}`);
    if (!CONFIG.NOTIFY || typeof Notification === 'undefined') return;
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Run window.__ttBulkTestNotify() in the console any time to confirm
  // notifications are actually reaching your desktop before a long run.
  window.__ttBulkTestNotify = () => notify('TikTok bulk test', 'If you see this, notifications are working.');

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
    return /\/video\//.test(location.pathname) || !!queryFirstVisible(CONFIG.CLOSE_SELECTORS);
  }

  function closeOverlay() {
    const closeBtn = queryFirstVisible(CONFIG.CLOSE_SELECTORS);
    if (closeBtn) {
      findClickTarget(closeBtn).click();
      return;
    }
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
      closeOverlay();
      const attempts = (openAttempts.get(id) || 0) + 1;
      openAttempts.set(id, attempts);
      if (attempts >= CONFIG.MAX_OPEN_ATTEMPTS) {
        warn(`Video ${id}: overlay didn't open after ${attempts} attempts (likely a photo/carousel post or a removed video that has no normal player). Giving up on it permanently and moving on — it was NOT unliked/unfavorited.`);
        processed.add(id);
        saveProgress();
      } else {
        warn(`Video ${id}: overlay did not open, will retry.`);
      }
      return 'skip';
    }

    const selectors = CONFIG.MODE === 'like' ? CONFIG.LIKE_SELECTORS : CONFIG.FAVORITE_SELECTORS;
    const actionEl = queryFirstVisible(selectors);
    if (!actionEl) {
      warn(`Video ${id}: could not find the ${CONFIG.MODE} button. Selectors may be stale, or this may be a CAPTCHA/verification prompt — check the tab.`);
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
        warn(`Video ${id}: click didn't seem to change anything. Stopping so nothing gets clicked blindly — this often means a CAPTCHA/verification popup appeared, or the selectors went stale. Check the tab.`);
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

  async function runBatch(target) {
    let actionsThisBatch = 0;
    let emptyScrolls = 0;

    while (actionsThisBatch < target) {
      if (window.__ttBulkStop) return { actionsThisBatch, hardStop: false, finished: false, stoppedManually: true };

      const candidates = getGridAnchors();
      if (candidates.length === 0) {
        emptyScrolls += 1;
        if (emptyScrolls > CONFIG.MAX_EMPTY_SCROLLS) {
          return { actionsThisBatch, hardStop: false, finished: true, stoppedManually: false };
        }
        log('No unprocessed videos visible, scrolling to load more...');
        window.scrollBy(0, CONFIG.SCROLL_STEP_PX);
        await sleep(CONFIG.SCROLL_WAIT_MS);
        continue;
      }
      emptyScrolls = 0;

      const result = await processOne(candidates[0]);
      if (result === 'stop') return { actionsThisBatch, hardStop: true, finished: false, stoppedManually: false };
      if (result === 'ok') actionsThisBatch += 1;

      if (window.__ttBulkStop) return { actionsThisBatch, hardStop: false, finished: false, stoppedManually: true };

      const isLongBreak = actionsThisBatch > 0 && actionsThisBatch % CONFIG.LONG_BREAK_EVERY === 0;
      const delay = isLongBreak
        ? randomBetween(CONFIG.LONG_BREAK_MIN_MS, CONFIG.LONG_BREAK_MAX_MS)
        : randomBetween(CONFIG.DELAY_MIN_MS, CONFIG.DELAY_MAX_MS);
      if (isLongBreak) log(`Taking a longer break (${Math.round(delay / 1000)}s)...`);
      await sleep(delay);
    }
    return { actionsThisBatch, hardStop: false, finished: false, stoppedManually: false };
  }

  async function run() {
    await requestNotifyPermission();

    log(`Starting. mode=${CONFIG.MODE} account=${account} dryRun=${CONFIG.DRY_RUN} batchSize=${CONFIG.BATCH_SIZE} autoContinue=${CONFIG.AUTO_CONTINUE} dailyCap=${CONFIG.DAILY_ACTION_CAP}`);
    log(`Already processed all-time (this mode): ${processed.size}. Done today (all modes): ${getDailyState().count}/${CONFIG.DAILY_ACTION_CAP}.`);

    for (;;) {
      const daily = getDailyState();
      if (daily.count >= CONFIG.DAILY_ACTION_CAP) {
        log(`Daily cap of ${CONFIG.DAILY_ACTION_CAP} reached (shared across like+favorite runs on this account). Resets at local midnight.`);
        notify('TikTok bulk: daily cap reached', `Did ${daily.count} actions today. It'll pick back up tomorrow if you re-run it, or raise DAILY_ACTION_CAP.`);
        break;
      }

      const batchTarget = Math.min(CONFIG.BATCH_SIZE, CONFIG.DAILY_ACTION_CAP - daily.count);
      const result = await runBatch(batchTarget);
      const totalToday = addToDailyCount(result.actionsThisBatch);

      log(`Batch done. Actions this batch: ${result.actionsThisBatch}. Total processed all-time (this mode): ${processed.size}. Today (all modes): ${totalToday}/${CONFIG.DAILY_ACTION_CAP}.`);

      if (result.stoppedManually) {
        log('Stopped manually (window.__ttBulkStop was set).');
        break;
      }
      if (result.hardStop) {
        warn('Stopping: a click had no visible effect. This usually means a CAPTCHA/verification prompt appeared, or TikTok changed its page markup. Go look at the tab.');
        notify('TikTok bulk script needs you', 'It stopped itself — likely a CAPTCHA/verification prompt, or the page changed. Check the tab.');
        break;
      }
      if (result.finished) {
        log('No more unprocessed videos found after several scrolls. Nothing left to do here.');
        notify('TikTok bulk script finished', `No more videos left on this tab. Total ${CONFIG.MODE === 'like' ? 'unliked' : 'unfavorited'} all-time: ${processed.size}.`);
        break;
      }
      if (!CONFIG.AUTO_CONTINUE) {
        log('Batch limit reached. AUTO_CONTINUE is off — run the script again to continue.');
        notify('TikTok bulk: batch done', `${result.actionsThisBatch} actions done. Re-run the script for the next batch.`);
        break;
      }

      const cooldown = randomBetween(CONFIG.COOLDOWN_MIN_MS, CONFIG.COOLDOWN_MAX_MS);
      log(`Cooling down for ${Math.round(cooldown / 60000)} min before the next batch... (window.__ttBulkStop = true to cancel)`);
      await sleep(cooldown);
    }

    log(`To reset all-time progress tracking for this mode/account: localStorage.removeItem(${JSON.stringify(storageKey)})`);
    log(`To reset today's shared daily counter for this account: localStorage.removeItem(${JSON.stringify(dailyKey)})`);
  }

  run().finally(() => {
    window.__ttBulkRunning = false;
  });
})();
