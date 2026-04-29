// =============================================================
// Gemini Conversation Exporter v3 — Auto-Expand + Long Convo Fix
// Paste into Edge DevTools Console (F12 → Console)
// FIRST: Scroll through the ENTIRE conversation slowly so all
//        messages are rendered, then run this script.
// =============================================================

(async () => {
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log(...args); };

  // ---------- helpers ----------
  const timestamp = () => {
    const d = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
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

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ===================== STEP 1: AUTO-EXPAND ALL TRUNCATED MESSAGES =====================

  console.log('%c🔄 Step 1: Expanding all truncated messages...', 'color: yellow; font-size: 13px');

  const expandSelectors = [
    // "Show more" / "See more" buttons and links
    'button[aria-label*="Show more"]',
    'button[aria-label*="See more"]',
    'button[aria-label*="show more"]',
    'button[aria-label*="Expand"]',
    '[class*="show-more"]',
    '[class*="see-more"]',
    '[class*="expand-button"]',
    '[class*="truncat"] button',
    '[class*="overflow"] button',
    // Generic "more" buttons within message containers
    'button[class*="more"]',
    // Material expand buttons
    'mat-button[class*="more"]',
    // Anchor-style expand triggers
    'a[class*="show-more"]',
    'a[class*="see-more"]',
    'span[class*="show-more"]',
    'span[class*="see-more"]',
  ];

  let totalExpanded = 0;
  let passCount = 0;
  const MAX_PASSES = 3; // keep it tight — 3 passes is plenty
  const alreadyClicked = new WeakSet(); // track buttons we've already hit

  while (passCount < MAX_PASSES) {
    let expandedThisPass = 0;

    for (const sel of expandSelectors) {
      const buttons = document.querySelectorAll(sel);
      for (const btn of buttons) {
        if (alreadyClicked.has(btn)) continue; // skip if already clicked

        const text = (btn.textContent || '').toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const all = text + ' ' + label;

        if (all.includes('less') || all.includes('collapse') || all.includes('hide')) continue;
        if (all.includes('more') || all.includes('expand') || all.includes('show') || all.includes('see')) {
          try {
            btn.click();
            alreadyClicked.add(btn);
            expandedThisPass++;
            await sleep(150);
          } catch (e) {
            log(`⚠️ Failed to click expand button:`, e);
          }
        }
      }
    }

    const truncatedEls = document.querySelectorAll(
      '[class*="truncat"], [class*="clamp"], [style*="overflow: hidden"]'
    );
    for (const el of truncatedEls) {
      const clickTarget = el.querySelector('button, a, [role="button"], [tabindex]');
      if (clickTarget && !alreadyClicked.has(clickTarget)) {
        const text = (clickTarget.textContent || '').toLowerCase();
        if (!text.includes('less') && !text.includes('collapse')) {
          try {
            clickTarget.click();
            alreadyClicked.add(clickTarget);
            expandedThisPass++;
            await sleep(150);
          } catch (e) {}
        }
      }
    }

    totalExpanded += expandedThisPass;
    passCount++;

    if (expandedThisPass === 0) break;
    log(`  Pass ${passCount}: expanded ${expandedThisPass} elements`);
    await sleep(300);
  }

  if (totalExpanded > 0) {
    console.log(
      `%c✅ Expanded ${totalExpanded} truncated section(s) across ${passCount} pass(es)`,
      'color: limegreen; font-size: 13px'
    );
    // Give the DOM a moment to fully render expanded content
    await sleep(500);
  } else {
    log('ℹ️ No truncated sections found (all messages may already be fully visible)');
  }

  // ===================== STEP 2: ROLE DETECTION =====================

  console.log('%c🔍 Step 2: Finding conversation elements...', 'color: yellow; font-size: 13px');

  const classifyRole = (el) => {
    const nodesToCheck = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      nodesToCheck.push(parent);
      parent = parent.parentElement;
    }

    let userScore = 0;
    let geminiScore = 0;

    for (const node of nodesToCheck) {
      const cls = (node.className || '').toLowerCase();
      const tag = (node.tagName || '').toLowerCase();
      const role = (node.getAttribute('role') || '').toLowerCase();
      const dataAttrs = Array.from(node.attributes || [])
        .map(a => `${a.name}=${a.value}`.toLowerCase())
        .join(' ');
      const all = `${cls} ${tag} ${role} ${dataAttrs}`;

      if (all.includes('user-query') || all.includes('user_query')) userScore += 5;
      if (all.includes('query-text') || all.includes('query_text')) userScore += 5;
      if (all.includes('query-content') || all.includes('query_content')) userScore += 4;
      if (tag === 'user-query') userScore += 5;
      if (all.includes('prompt')) userScore += 2;
      if (all.includes('human')) userScore += 3;
      if (/\buser\b/.test(all)) userScore += 2;
      if (/\bquery\b/.test(all) && !all.includes('response')) userScore += 2;

      if (all.includes('model-response') || all.includes('model_response')) geminiScore += 5;
      if (all.includes('response-container') || all.includes('response_container')) geminiScore += 4;
      if (all.includes('response-content') || all.includes('response_content')) geminiScore += 4;
      if (tag === 'model-response') geminiScore += 5;
      if (all.includes('bot-response') || all.includes('assistant')) geminiScore += 3;
      if (all.includes('gemini')) geminiScore += 3;
      if (/\bmodel\b/.test(all)) geminiScore += 2;
      if (/\bresponse\b/.test(all) && !all.includes('query')) geminiScore += 2;
    }

    if (userScore > geminiScore && userScore >= 2) return 'user';
    if (geminiScore > userScore && geminiScore >= 2) return 'gemini';
    return null;
  };

  // ---------- text extraction ----------
  const extractText = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
      'button, [aria-hidden="true"], mat-icon, [class*="icon"]:not(pre):not(code), ' +
      '[class*="action"], [class*="toolbar"], [class*="copy-button"], ' +
      '[class*="chip"], [class*="suggestion"], [class*="feedback"]'
    ).forEach(n => n.remove());

    clone.querySelectorAll('pre, code').forEach(code => {
      code.textContent = '\n```\n' + code.textContent.trim() + '\n```\n';
    });

    return clone.innerText?.trim() || clone.textContent?.trim() || '';
  };

  // ---------- title ----------
  const getTitle = () => {
    const titleEl = document.querySelector(
      '[class*="title"], .conversation-title, h1, ' +
      '[class*="header"] span, [data-conversation-title]'
    );
    const raw = titleEl?.textContent?.trim() || '';
    if (raw && raw.length > 2 && raw.length < 120) {
      return raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').substring(0, 60);
    }
    return 'gemini_conversation';
  };

  // ===================== STEP 3: FIND TURN ELEMENTS =====================

  const turnContainerSelectors = [
    'user-query, model-response',
    '.conversation-turn',
    '[class*="turn-container"]',
    '[class*="chat-turn"]',
    '[class*="message-row"]',
    'message-content, .message-content',
  ];

  let rawElements = null;

  for (const sel of turnContainerSelectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 1) {
      rawElements = found;
      log(`🔍 Matched selector: "${sel}" → ${found.length} elements`);
      break;
    }
  }

  if (!rawElements || rawElements.length < 2) {
    const scrollContainers = document.querySelectorAll(
      'infinite-scroller, [class*="conversation"], [class*="chat-history"], ' +
      '[class*="scroll-container"], main, [role="main"]'
    );
    for (const container of scrollContainers) {
      const candidates = container.querySelectorAll(
        ':scope > *, :scope > * > [class*="query"], :scope > * > [class*="response"]'
      );
      if (candidates.length > 2) {
        rawElements = candidates;
        log(`🔍 Fallback: container children → ${candidates.length} elements`);
        break;
      }
    }
  }

  if (!rawElements || rawElements.length === 0) {
    console.error(
      '%c❌ Could not find conversation elements. Scroll through the entire conversation first, then re-run.',
      'color: red; font-size: 14px'
    );
    return;
  }

  // ---- Deduplicate ----
  const elements = [];
  const seen = new Set();

  rawElements.forEach(el => {
    if (seen.has(el)) return;
    let dominated = false;
    for (const kept of elements) {
      if (kept.contains(el)) { dominated = true; break; }
      if (el.contains(kept)) {
        const idx = elements.indexOf(kept);
        elements[idx] = el;
        seen.add(el);
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      elements.push(el);
      seen.add(el);
    }
  });

  log(`📦 After dedup: ${elements.length} turn elements`);

  // ===================== STEP 4: EXTRACT & CLASSIFY =====================

  console.log('%c📝 Step 3: Extracting conversation...', 'color: yellow; font-size: 13px');

  const turns = [];
  let unknownCount = 0;

  elements.forEach((el, i) => {
    const text = extractText(el);
    if (!text || text.length < 2) return;

    let role = classifyRole(el);

    if (!role) {
      unknownCount++;
      const prevRole = turns.length > 0 ? turns[turns.length - 1].role : null;
      if (prevRole === 'gemini') {
        role = 'user';
      } else if (prevRole === 'user') {
        role = 'gemini';
      } else {
        role = text.length < 300 ? 'user' : 'gemini';
      }
      log(`⚠️ Element ${i}: role unknown, guessed "${role}" (${text.length} chars)`);
    } else {
      log(`✅ Element ${i}: role="${role}" (${text.length} chars)`);
    }

    turns.push({ role, text, index: i });
  });

  if (turns.length === 0) {
    console.error('No conversation text could be extracted.');
    return;
  }

  // ---- Sanity check ----
  const userTurns = turns.filter(t => t.role === 'user').length;
  const geminiTurns = turns.filter(t => t.role === 'gemini').length;
  const ratio = userTurns / (geminiTurns || 1);

  if (ratio < 0.3) {
    console.warn(
      `%c⚠️ Only ${userTurns} user turns vs ${geminiTurns} Gemini turns. Some may be missing.`,
      'color: orange; font-size: 13px'
    );
  }

  // ===================== STEP 5: BUILD MARKDOWN & DOWNLOAD =====================

  const lines = [];
  lines.push(`# Gemini Conversation Export`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(`**Turns:** ${turns.length} (${userTurns} user, ${geminiTurns} Gemini)`);
  if (totalExpanded > 0) {
    lines.push(`**Auto-expanded:** ${totalExpanded} truncated section(s)`);
  }
  lines.push(`\n---\n`);

  turns.forEach((turn, i) => {
    const label = turn.role === 'user' ? '🧑 **You**' : '🤖 **Gemini**';
    lines.push(`### Turn ${i + 1} — ${label}\n`);
    lines.push(turn.text);
    lines.push(`\n---\n`);
  });

  const title = getTitle();
  const filename = `${timestamp()}_${title}.md`;
  download(lines.join('\n'), filename);

  console.log(
    `%c📥 Exported ${turns.length} turns (${userTurns} user / ${geminiTurns} Gemini) → ${filename}`,
    'color: cyan; font-size: 14px; font-weight: bold'
  );
  if (totalExpanded > 0) {
    console.log(`%c📖 Auto-expanded ${totalExpanded} truncated section(s) before export`, 'color: limegreen');
  }
  console.log('Check your Downloads folder.');

})();
