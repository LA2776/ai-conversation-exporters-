// =============================================================
// Claude.ai Conversation Exporter v3 — Exact DOM selectors
// Paste into Edge DevTools Console (F12 → Console)
// FIRST: Scroll through the ENTIRE conversation, then run.
// =============================================================

(async () => {
  'use strict';

  const DEBUG = true;
  const log = (...args) => { if (DEBUG) console.log(...args); };

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

  // ===================== STEP 1: AUTO-EXPAND =====================

  console.log('%c🔄 Step 1: Expanding truncated content...', 'color: yellow; font-size: 13px');

  const expandSelectors = [
    'button[class*="show-more"]', 'button[class*="expand"]',
    'button[class*="see-more"]', '[class*="truncat"] button',
    'button[aria-label*="Show more"]', 'button[aria-label*="Expand"]',
  ];

  let totalExpanded = 0;
  let passCount = 0;
  const MAX_PASSES = 3;
  const alreadyClicked = new WeakSet();

  while (passCount < MAX_PASSES) {
    let expandedThisPass = 0;
    for (const sel of expandSelectors) {
      const buttons = document.querySelectorAll(sel);
      for (const btn of buttons) {
        if (alreadyClicked.has(btn)) continue;
        const text = (btn.textContent || '').toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if ((text + ' ' + label).match(/less|collapse|hide/)) continue;
        try {
          btn.click();
          alreadyClicked.add(btn);
          expandedThisPass++;
          await sleep(150);
        } catch (e) {}
      }
    }
    totalExpanded += expandedThisPass;
    passCount++;
    if (expandedThisPass === 0) break;
    await sleep(300);
  }

  if (totalExpanded > 0) {
    console.log(`%c✅ Expanded ${totalExpanded} section(s)`, 'color: limegreen; font-size: 13px');
    await sleep(500);
  }

  // ===================== STEP 2: FIND TURN-LEVEL CONTAINERS =====================

  console.log('%c🔍 Step 2: Scanning DOM for conversation structure...', 'color: yellow; font-size: 13px');

  // ---------------------------------------------------------------------------
  // Claude.ai known DOM patterns (as of Feb 2026):
  //
  // CLAUDE RESPONSES:
  //   <p class="font-claude-response-body break-words whitespace-normal leading-[1.7]">
  //   Wrapped in: <div class="standard-markdown grid-cols-1 grid ...">
  //
  // USER MESSAGES:
  //   Likely use: font-user-message-body, or similar class patterns
  //   May also be plain divs without special font classes
  //
  // TURN CONTAINERS:
  //   The parent divs wrapping both user + claude content
  // ---------------------------------------------------------------------------

  // First, let's find Claude response blocks and user message blocks independently
  // then walk up to find their common turn-level ancestor pattern

  // --- Find Claude response anchors ---
  let claudeAnchors = document.querySelectorAll(
    '.font-claude-response-body, [class*="font-claude"], ' +
    '.standard-markdown, [class*="claude-response"]'
  );
  log(`  Claude anchors found: ${claudeAnchors.length}`);

  // --- Find User message anchors ---
  // Known class pattern: font-user-message (parallel to font-claude-response-body)
  let userAnchors = document.querySelectorAll(
    '.font-user-message, [class*="font-user-message"], [class*="font-user"], ' +
    '[class*="user-message"], [class*="UserMessage"], ' +
    '[class*="human-message"], [class*="HumanMessage"]'
  );
  log(`  User anchors found (specific selectors): ${userAnchors.length}`);

  // If no user anchors found with specific selectors, try to find them by
  // looking at the page structure: user messages are typically shorter blocks
  // that appear BEFORE a Claude response in the DOM

  // --- Strategy: Walk up from Claude anchors to find turn-level containers ---
  // Each Claude response is nested inside a turn container. If we find the
  // turn container level, the alternating sibling should be the user turn.

  const findTurnContainer = (el, maxLevels = 10) => {
    // Walk up until we find a container whose siblings also contain
    // either user or claude content
    let current = el;
    for (let i = 0; i < maxLevels; i++) {
      const parent = current.parentElement;
      if (!parent) break;

      const siblings = Array.from(parent.children);
      if (siblings.length >= 2) {
        // Check if siblings have mixed content (some user, some claude)
        let hasUserContent = false;
        let hasClaudeContent = false;

        for (const sib of siblings) {
          const cls = (sib.className || '').toLowerCase() + ' ' +
                      (sib.innerHTML || '').substring(0, 500).toLowerCase();
          if (cls.includes('font-claude') || cls.includes('standard-markdown')) hasClaudeContent = true;
          if (cls.includes('font-user') || cls.includes('user-message') || cls.includes('font-user-message')) hasUserContent = true;
        }

        // If this level has both types among siblings, the CURRENT level is the turn
        if (hasUserContent && hasClaudeContent) return current;

        // If siblings are all substantial and similar depth, this might be the turn level
        const substantialSibs = siblings.filter(s => (s.innerText || '').trim().length > 20);
        if (substantialSibs.length >= 2 && substantialSibs.length === siblings.length) {
          // Likely the turn container level
          return current;
        }
      }

      current = parent;
    }
    return null;
  };

  // Try to identify the turn container pattern from the first Claude response
  let turnContainerLevel = null;
  let allTurns = null;

  if (claudeAnchors.length > 0) {
    // Walk up from first Claude anchor to find the turn level
    const firstClaude = claudeAnchors[0];
    turnContainerLevel = findTurnContainer(firstClaude);

    if (turnContainerLevel) {
      // Get ALL siblings at this level = all turns in the conversation
      allTurns = Array.from(turnContainerLevel.parentElement.children).filter(el => {
        const text = (el.innerText || '').trim();
        return text.length > 5; // skip empty spacer divs
      });
      log(`  Turn container found! ${allTurns.length} turns at this level`);
    }
  }

  // Fallback: if turn container detection failed, use a flat approach
  if (!allTurns || allTurns.length < 2) {
    log('  Turn container detection failed, trying flat collection...');

    // Collect all identifiable message blocks
    const allBlocks = [];
    const blockSet = new WeakSet();

    // Grab Claude blocks — walk up to the nearest substantial container
    claudeAnchors.forEach(anchor => {
      let container = anchor;
      // Walk up a few levels to get the full response block (not just one <p>)
      for (let i = 0; i < 5; i++) {
        const parent = container.parentElement;
        if (!parent) break;
        // Stop if parent is very large (likely the whole conversation)
        if (parent.children.length > 3) break;
        container = parent;
      }
      if (!blockSet.has(container)) {
        container._exportRole = 'claude';
        allBlocks.push(container);
        blockSet.add(container);
      }
    });

    // For user messages: look at elements just BEFORE each Claude block in DOM order
    allBlocks.filter(b => b._exportRole === 'claude').forEach(claudeBlock => {
      let prev = claudeBlock.previousElementSibling;
      // Skip small/empty elements
      while (prev && (prev.innerText || '').trim().length < 5) {
        prev = prev.previousElementSibling;
      }
      if (prev && !blockSet.has(prev)) {
        prev._exportRole = 'user';
        allBlocks.push(prev);
        blockSet.add(prev);
      }
    });

    if (allBlocks.length > 0) {
      allTurns = allBlocks;
      log(`  Flat collection: ${allTurns.length} blocks`);
    }
  }

  if (!allTurns || allTurns.length === 0) {
    console.error('%c❌ Could not find conversation elements.', 'color: red; font-size: 14px');

    // Emergency DOM dump
    console.log('%c📊 Emergency DOM scan:', 'color: magenta');
    const interesting = document.querySelectorAll('[class*="font-"], [class*="message"], [class*="turn"], [class*="markdown"]');
    const summary = {};
    interesting.forEach(el => {
      const key = el.tagName + '.' + (el.className || '').toString().substring(0, 80);
      summary[key] = (summary[key] || 0) + 1;
    });
    console.table(summary);
    return;
  }

  // ===================== STEP 3: SORT, CLASSIFY, EXTRACT =====================

  console.log('%c📝 Step 3: Extracting turns...', 'color: yellow; font-size: 13px');

  // Sort by DOM position
  allTurns.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // Deduplicate parent/child
  const elements = [];
  const seen = new WeakSet();
  allTurns.forEach(el => {
    if (seen.has(el)) return;
    let dominated = false;
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].contains(el)) { dominated = true; break; }
      if (el.contains(elements[i])) { elements[i] = el; seen.add(el); dominated = true; break; }
    }
    if (!dominated) { elements.push(el); seen.add(el); }
  });

  log(`📦 After dedup: ${elements.length} elements`);

  // --- Role classification ---
  const classifyRole = (el) => {
    if (el._exportRole) return el._exportRole;

    // Check element and descendants for known classes
    const html = (el.className || '').toLowerCase() + ' ' +
                 (el.innerHTML || '').substring(0, 1000).toLowerCase();

    if (html.includes('font-claude') || html.includes('standard-markdown') ||
        html.includes('claude-response')) {
      return 'claude';
    }
    if (html.includes('font-user-message') || html.includes('font-user') ||
        html.includes('user-message') || html.includes('human-message') ||
        html.includes('human-turn')) {
      return 'user';
    }

    // Check data attributes and aria labels on the element and parents
    const nodesToCheck = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      nodesToCheck.push(parent);
      parent = parent.parentElement;
    }

    for (const node of nodesToCheck) {
      const attrs = `${node.className || ''} ${node.getAttribute('data-testid') || ''} ${node.getAttribute('aria-label') || ''}`.toLowerCase();
      if (attrs.includes('human') || attrs.includes('user')) return 'user';
      if (attrs.includes('assistant') || attrs.includes('claude')) return 'claude';
    }

    return null;
  };

  // --- Text extraction ---
  const extractText = (el) => {
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
      langEl?.remove();
      pre.textContent = `\n\`\`\`${lang}\n${pre.textContent.trim()}\n\`\`\`\n`;
    });

    return clone.innerText?.trim() || clone.textContent?.trim() || '';
  };

  // --- Build turns ---
  const turns = [];
  let unknownCount = 0;

  elements.forEach((el, i) => {
    const text = extractText(el);
    if (!text || text.length < 2) return;

    let role = classifyRole(el);

    if (!role) {
      unknownCount++;
      const prevRole = turns.length > 0 ? turns[turns.length - 1].role : null;
      if (prevRole === 'claude') role = 'user';
      else if (prevRole === 'user') role = 'claude';
      else role = text.length < 200 ? 'user' : 'claude';
      log(`⚠️ Turn ${i}: guessed "${role}" (${text.length} chars)`);
    } else {
      log(`✅ Turn ${i}: ${role} (${text.length} chars)`);
    }

    turns.push({ role, text });
  });

  if (turns.length === 0) {
    console.error('No conversation text extracted.');
    return;
  }

  const userTurns = turns.filter(t => t.role === 'user').length;
  const claudeTurns = turns.filter(t => t.role === 'claude').length;

  if (claudeTurns === 0) {
    console.warn('%c⚠️ NO Claude responses detected! Check DOM structure.', 'color: red; font-size: 14px');
  }

  // ===================== STEP 4: DOWNLOAD =====================

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
  if (totalExpanded > 0) lines.push(`**Auto-expanded:** ${totalExpanded} section(s)`);
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

})();
