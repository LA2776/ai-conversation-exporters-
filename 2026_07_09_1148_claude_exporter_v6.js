// =============================================================
// Claude.ai Conversation Exporter v6 — Scroll-and-Collect
// Handles virtualized DOM (long conversations where middle
// messages are unloaded from the DOM as you scroll).
//
// Paste into Edge DevTools Console (F12 → Console)
// NOTE: This will auto-scroll through the entire conversation.
// =============================================================

(async () => {
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log(...args); };

  const timestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const download = (text, filename) => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Selectors
  const USER_SEL = '[class*="font-user"]';
  const CLAUDE_SEL = '.standard-markdown, [class*="font-claude"]';

  // ===================== TEXT EXTRACTION =====================

  function extractText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
      'button, [aria-hidden="true"], svg, [class*="icon"]:not(pre):not(code), ' +
      '[class*="action"], [class*="toolbar"], [class*="copy"], ' +
      '[class*="feedback"], [class*="thumb"], [class*="avatar"], ' +
      '[class*="timestamp"], [class*="tooltip"]'
    ).forEach(n => n.remove());

    clone.querySelectorAll('pre').forEach(pre => {
      const langEl = pre.querySelector('[class*="lang"], [class*="language"]');
      const lang = langEl?.textContent?.trim() || '';
      const langLabel = lang.length < 20 ? lang : '';
      if (langEl && langLabel) langEl.remove();
      pre.textContent = `\n\`\`\`${langLabel}\n${pre.textContent.trim()}\n\`\`\`\n`;
    });

    return clone.innerText?.trim() || clone.textContent?.trim() || '';
  }

  // ===================== FIND SCROLL CONTAINER =====================

  console.log('%c🔍 Step 1: Finding scroll container...', 'color: yellow; font-size: 13px');

  // The scrollable container for the conversation
  let scrollContainer = null;

  // Strategy: find the ancestor of the first message that is scrollable
  const firstMsg = document.querySelector(USER_SEL) || document.querySelector(CLAUDE_SEL);

  if (firstMsg) {
    let el = firstMsg.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      const isScrollable = (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      );
      if (isScrollable) {
        scrollContainer = el;
        break;
      }
      el = el.parentElement;
    }
  }

  // Fallback: try common container selectors
  if (!scrollContainer) {
    const candidates = document.querySelectorAll('main, [role="main"], [class*="conversation"], [class*="thread"]');
    for (const c of candidates) {
      if (c.scrollHeight > c.clientHeight) {
        scrollContainer = c;
        break;
      }
    }
  }

  if (!scrollContainer) {
    // Last resort: use the document scrolling element
    scrollContainer = document.scrollingElement || document.documentElement;
  }

  log(`  Scroll container: <${scrollContainer.tagName.toLowerCase()}> scrollHeight=${scrollContainer.scrollHeight}`);

  // ===================== SCROLL-AND-COLLECT =====================

  console.log('%c📜 Step 2: Scrolling through conversation and collecting turns...', 'color: yellow; font-size: 13px');
  console.log('  (This will auto-scroll — please don\'t scroll manually)');

  // Store collected turns by a fingerprint to avoid duplicates
  const collectedTurns = new Map(); // fingerprint → { role, text, position }
  let turnPositionCounter = 0;

  const collectCurrentTurns = () => {
    // Find the common ancestor of currently-visible messages
    const currentUser = document.querySelector(USER_SEL);
    const currentClaude = document.querySelector(CLAUDE_SEL);

    if (!currentUser && !currentClaude) return 0;

    // Find common ancestor
    let commonParent = null;

    if (currentUser && currentClaude) {
      const userAncestors = new Set();
      let p = currentUser;
      while (p) { userAncestors.add(p); p = p.parentElement; }

      p = currentClaude;
      while (p) {
        if (userAncestors.has(p)) { commonParent = p; break; }
        p = p.parentElement;
      }
    }

    if (!commonParent) {
      // If only one type visible, walk up to find a container with multiple children
      const anchor = currentUser || currentClaude;
      let el = anchor?.parentElement;
      for (let i = 0; i < 15 && el; i++) {
        if (el.children.length >= 2) {
          const hasSubstantial = Array.from(el.children).filter(c =>
            (c.innerText || '').trim().length > 10
          ).length;
          if (hasSubstantial >= 2) { commonParent = el; break; }
        }
        el = el.parentElement;
      }
    }

    if (!commonParent) return 0;

    let newCount = 0;

    Array.from(commonParent.children).forEach(child => {
      const text = extractText(child);
      if (!text || text.length < 2 || text === 'Claude' || text === 'You') return;

      // Create a fingerprint from the first 100 + last 100 chars
      // This handles the case where text might be slightly different due to rendering
      const fingerprint = (text.substring(0, 100) + '|||' + text.substring(Math.max(0, text.length - 100))).trim();

      if (collectedTurns.has(fingerprint)) return; // already collected

      const hasUser = !!child.querySelector(USER_SEL);
      const hasClaude = !!child.querySelector(CLAUDE_SEL);

      let role;
      if (hasUser && !hasClaude) role = 'user';
      else if (hasClaude) role = 'claude';
      else role = 'unknown';

      // Get vertical position for ordering
      const rect = child.getBoundingClientRect();
      const absTop = rect.top + scrollContainer.scrollTop;

      collectedTurns.set(fingerprint, {
        role,
        text,
        position: absTop,
        order: turnPositionCounter++,
      });

      newCount++;
    });

    return newCount;
  };

  // First, scroll to the very top
  scrollContainer.scrollTop = 0;
  await sleep(500);

  // Collect initial turns
  let totalNew = collectCurrentTurns();
  log(`  Initial collection: ${totalNew} turns`);

  // Now scroll down incrementally, collecting as we go
  const scrollStep = Math.floor(scrollContainer.clientHeight * 0.6); // scroll 60% of viewport
  let lastScrollTop = -1;
  let stuckCount = 0;
  const MAX_STUCK = 5;
  let scrollSteps = 0;
  const MAX_SCROLL_STEPS = 500; // safety limit

  while (scrollSteps < MAX_SCROLL_STEPS) {
    scrollContainer.scrollTop += scrollStep;
    await sleep(300); // wait for DOM to update with new virtualized content

    const currentScroll = scrollContainer.scrollTop;

    // Collect any new turns that appeared
    const newThisStep = collectCurrentTurns();
    if (newThisStep > 0) {
      log(`  Scroll step ${scrollSteps + 1}: +${newThisStep} new turns (total: ${collectedTurns.size})`);
      stuckCount = 0;
    }

    // Check if we've reached the bottom
    const atBottom = (scrollContainer.scrollTop + scrollContainer.clientHeight) >= (scrollContainer.scrollHeight - 10);
    if (atBottom) {
      // One more collection at the bottom
      collectCurrentTurns();
      log(`  Reached bottom of conversation`);
      break;
    }

    // Check if scroll position stopped moving (fully at bottom)
    if (Math.abs(currentScroll - lastScrollTop) < 5) {
      stuckCount++;
      if (stuckCount >= MAX_STUCK) {
        log(`  Scroll stuck at ${currentScroll}, stopping`);
        break;
      }
    } else {
      stuckCount = 0;
    }

    lastScrollTop = currentScroll;
    scrollSteps++;
  }

  console.log(
    `%c✅ Collected ${collectedTurns.size} turns across ${scrollSteps + 1} scroll steps`,
    'color: limegreen; font-size: 13px'
  );

  // ===================== STEP 3: SORT AND RESOLVE ROLES =====================

  console.log('%c📝 Step 3: Sorting and resolving...', 'color: yellow; font-size: 13px');

  // Sort by the order they were first encountered (which follows scroll order = conversation order)
  let turns = Array.from(collectedTurns.values());
  turns.sort((a, b) => a.order - b.order);

  // Resolve unknown roles by alternation
  turns.forEach((turn, i) => {
    if (turn.role === 'unknown') {
      const prevRole = i > 0 ? turns[i - 1].role : null;
      turn.role = prevRole === 'user' ? 'claude' : 'user';
      log(`  Resolved turn ${i + 1}: guessed "${turn.role}"`);
    }
  });

  // Filter out any remaining junk
  turns = turns.filter(t => t.text.length > 1 && t.text !== 'Claude' && t.text !== 'You');

  const userTurns = turns.filter(t => t.role === 'user').length;
  const claudeTurns = turns.filter(t => t.role === 'claude').length;

  if (turns.length === 0) {
    console.error('%c❌ No conversation text extracted.', 'color: red; font-size: 14px');
    return;
  }

  if (claudeTurns === 0) console.warn('%c⚠️ No Claude responses detected!', 'color: red; font-size: 14px');
  if (userTurns === 0) console.warn('%c⚠️ No user messages detected!', 'color: red; font-size: 14px');

  console.log(
    `%c✅ Final: ${turns.length} turns (${userTurns} user, ${claudeTurns} Claude)`,
    'color: limegreen; font-size: 13px'
  );

  // ===================== STEP 4: BUILD MARKDOWN & DOWNLOAD =====================

  const getTitle = () => {
    let raw = document.title?.replace(/\s*[-–—]\s*Claude.*$/i, '').trim() || '';
    if (raw && raw.length > 2 && raw.length < 120) {
      return raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').substring(0, 60);
    }
    return 'claude_conversation';
  };

  const lines = [];
  lines.push(`# Claude Conversation Export`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(`**Turns:** ${turns.length} (${userTurns} user, ${claudeTurns} Claude)`);
  lines.push(`\n---\n`);

  turns.forEach((turn, i) => {
    const label = turn.role === 'user' ? '🧑 **You**' : '🤖 **Claude**';
    lines.push(`### Turn ${i + 1} — ${label}\n`);
    lines.push(turn.text);
    lines.push(`\n---\n`);
  });

  const title = getTitle();
  const filename = `${timestamp()}_${title}.md`;
  download(lines.join('\n'), filename);

  console.log(
    `%c📥 Exported ${turns.length} turns (${userTurns} user / ${claudeTurns} Claude) → ${filename}`,
    'color: cyan; font-size: 14px; font-weight: bold'
  );
  console.log('Check your Downloads folder.');

  // Scroll back to bottom so the user is where they started
  scrollContainer.scrollTop = scrollContainer.scrollHeight;

})();
