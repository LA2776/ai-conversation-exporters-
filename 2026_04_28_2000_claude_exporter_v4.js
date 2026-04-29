// =============================================================
// Claude.ai Conversation Exporter v4 — Fixed turn grouping
// Paste into Edge DevTools Console (F12 → Console)
// FIRST: Scroll through the ENTIRE conversation, then run.
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

  // ===================== STEP 1: AUTO-EXPAND =====================

  console.log('%c🔄 Step 1: Expanding truncated content...', 'color: yellow; font-size: 13px');

  const expandSelectors = [
    'button[class*="show-more"]', 'button[class*="expand"]',
    'button[class*="see-more"]', '[class*="truncat"] button',
    'button[aria-label*="Show more"]', 'button[aria-label*="Expand"]',
  ];

  let totalExpanded = 0;
  const alreadyClicked = new WeakSet();

  for (let pass = 0; pass < 3; pass++) {
    let clickedThisPass = 0;
    for (const sel of expandSelectors) {
      const buttons = document.querySelectorAll(sel);
      for (const btn of buttons) {
        if (alreadyClicked.has(btn)) continue;
        const text = (btn.textContent || '').toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if ((text + ' ' + label).match(/less|collapse|hide/)) continue;
        try { btn.click(); alreadyClicked.add(btn); clickedThisPass++; await sleep(150); } catch(e) {}
      }
    }
    totalExpanded += clickedThisPass;
    if (clickedThisPass === 0) break;
    await sleep(300);
  }

  if (totalExpanded > 0) {
    console.log(`%c✅ Expanded ${totalExpanded} section(s)`, 'color: limegreen; font-size: 13px');
    await sleep(500);
  }

  // ===================== STEP 2: FIND INDIVIDUAL MESSAGE BLOCKS =====================

  console.log('%c🔍 Step 2: Finding individual message blocks...', 'color: yellow; font-size: 13px');

  // ---------------------------------------------------------------------------
  // APPROACH: Instead of finding a "turn container level" (which collapsed
  // everything into 2 blocks), we find each individual message block:
  //
  // 1. Find all Claude response containers (.standard-markdown divs)
  // 2. Find all User message containers (.font-user-message elements)
  // 3. For each, walk up to find the nearest distinct "message block"
  //    — the smallest ancestor that contains the full message content
  //    but is NOT shared with other messages.
  // 4. Sort by DOM order and extract.
  // ---------------------------------------------------------------------------

  const messageBlocks = [];
  const processedElements = new WeakSet();

  // --- Find Claude response blocks ---
  // .standard-markdown wraps each complete Claude response
  // .font-claude-response-body is individual <p> tags within responses
  // We want the .standard-markdown level (one per Claude turn)

  const claudeContainers = document.querySelectorAll('.standard-markdown');
  log(`  .standard-markdown containers: ${claudeContainers.length}`);

  // If no .standard-markdown, fall back to grouping .font-claude-response-body
  let claudeBlocks = [];
  if (claudeContainers.length > 0) {
    claudeContainers.forEach(el => {
      // Walk up a few levels to get the full response wrapper
      // (includes any artifacts, code blocks, etc.)
      let block = el;
      for (let i = 0; i < 3; i++) {
        const parent = block.parentElement;
        if (!parent) break;
        // Stop if parent contains OTHER .standard-markdown blocks (different turn)
        const siblingMarkdowns = parent.querySelectorAll('.standard-markdown');
        if (siblingMarkdowns.length > 1) break;
        // Stop if parent is very large (probably the whole conversation)
        if ((parent.innerText || '').length > (block.innerText || '').length * 3) break;
        block = parent;
      }

      if (!processedElements.has(block)) {
        processedElements.add(block);
        claudeBlocks.push(block);
      }
    });
  } else {
    // Fallback: group .font-claude-response-body paragraphs by their common ancestor
    const claudePs = document.querySelectorAll('.font-claude-response-body, [class*="font-claude"]');
    log(`  .font-claude-response-body elements: ${claudePs.length}`);

    const parentMap = new Map();
    claudePs.forEach(p => {
      // Find the nearest parent that contains multiple claude paragraphs
      let ancestor = p.parentElement;
      for (let i = 0; i < 5 && ancestor; i++) {
        const claudeChildren = ancestor.querySelectorAll('.font-claude-response-body, [class*="font-claude"]');
        if (claudeChildren.length > 1) {
          if (!parentMap.has(ancestor)) parentMap.set(ancestor, []);
          parentMap.get(ancestor).push(p);
          break;
        }
        ancestor = ancestor.parentElement;
      }
    });

    parentMap.forEach((children, ancestor) => {
      if (!processedElements.has(ancestor)) {
        processedElements.add(ancestor);
        claudeBlocks.push(ancestor);
      }
    });
  }

  log(`  Claude response blocks found: ${claudeBlocks.length}`);

  // --- Find User message blocks ---
  const userElements = document.querySelectorAll(
    '.font-user-message, [class*="font-user-message"], [class*="font-user"]'
  );
  log(`  User message elements: ${userElements.length}`);

  let userBlocks = [];
  const userProcessed = new WeakSet();

  userElements.forEach(el => {
    // Walk up to find the message-level container
    let block = el;
    for (let i = 0; i < 5; i++) {
      const parent = block.parentElement;
      if (!parent) break;
      // Stop if parent also contains Claude content
      const hasClaude = parent.querySelector('.standard-markdown, .font-claude-response-body, [class*="font-claude"]');
      if (hasClaude) break;
      // Stop if parent contains other user messages (sibling turns)
      const userSiblings = parent.querySelectorAll('.font-user-message, [class*="font-user-message"], [class*="font-user"]');
      if (userSiblings.length > 1) {
        // Check if those siblings are actually in different subtrees
        const directUserChildren = Array.from(parent.children).filter(child =>
          child.querySelector('.font-user-message, [class*="font-user"]') || child.matches('.font-user-message, [class*="font-user"]')
        );
        if (directUserChildren.length > 1) break;
      }
      // Stop if parent is very large
      if ((parent.innerText || '').length > (block.innerText || '').length * 3) break;
      block = parent;
    }

    if (!userProcessed.has(block)) {
      userProcessed.add(block);
      userBlocks.push(block);
    }
  });

  log(`  User message blocks found: ${userBlocks.length}`);

  // --- If no user blocks found, try finding them as siblings before Claude blocks ---
  if (userBlocks.length === 0 && claudeBlocks.length > 0) {
    log('  ⚠️ No user blocks found via class, trying sibling scan...');
    claudeBlocks.forEach(claudeBlock => {
      let prev = claudeBlock.previousElementSibling;
      while (prev && (prev.innerText || '').trim().length < 5) {
        prev = prev.previousElementSibling;
      }
      if (prev && !processedElements.has(prev)) {
        // Verify it doesn't contain Claude content
        const hasClaude = prev.querySelector('.standard-markdown, .font-claude-response-body, [class*="font-claude"]');
        if (!hasClaude) {
          processedElements.add(prev);
          userBlocks.push(prev);
        }
      }
    });
    log(`  Sibling scan found: ${userBlocks.length} user blocks`);
  }

  // --- Combine and sort by DOM position ---
  const allBlocks = [
    ...claudeBlocks.map(el => ({ el, role: 'claude' })),
    ...userBlocks.map(el => ({ el, role: 'user' })),
  ];

  allBlocks.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  log(`  Total message blocks (sorted): ${allBlocks.length}`);

  // ===================== STEP 3: EXTRACT TEXT =====================

  console.log('%c📝 Step 3: Extracting turns...', 'color: yellow; font-size: 13px');

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
      const langLabel = lang.length < 20 ? lang : '';
      if (langEl && langLabel) langEl.remove();
      pre.textContent = `\n\`\`\`${langLabel}\n${pre.textContent.trim()}\n\`\`\`\n`;
    });

    return clone.innerText?.trim() || clone.textContent?.trim() || '';
  };

  const turns = [];

  allBlocks.forEach((block, i) => {
    const text = extractText(block.el);
    if (!text || text.length < 2) return;

    // Skip label-only turns
    if (text === 'Claude' || text === 'You') return;

    turns.push({ role: block.role, text });
    log(`  ✅ Turn ${turns.length}: ${block.role} (${text.length} chars)`);
  });

  // ===================== STEP 4: VALIDATE =====================

  if (turns.length === 0) {
    console.error('%c❌ No conversation text extracted.', 'color: red; font-size: 14px');

    // Emergency diagnostic
    console.log('%c📊 Emergency scan:', 'color: magenta');
    const interesting = document.querySelectorAll(
      '[class*="font-"], [class*="message"], [class*="turn"], ' +
      '[class*="markdown"], [class*="standard"]'
    );
    const summary = {};
    interesting.forEach(el => {
      const key = `${el.tagName}.${(el.className || '').toString().substring(0, 60)}`;
      summary[key] = (summary[key] || 0) + 1;
    });
    console.table(summary);
    return;
  }

  const userTurns = turns.filter(t => t.role === 'user').length;
  const claudeTurns = turns.filter(t => t.role === 'claude').length;

  if (claudeTurns === 0) {
    console.warn('%c⚠️ No Claude responses detected!', 'color: red; font-size: 14px');
  }
  if (userTurns === 0) {
    console.warn('%c⚠️ No user messages detected!', 'color: red; font-size: 14px');
  }

  console.log(
    `%c✅ Found ${turns.length} turns (${userTurns} user, ${claudeTurns} Claude)`,
    'color: limegreen; font-size: 13px'
  );

  // ===================== STEP 5: BUILD MARKDOWN & DOWNLOAD =====================

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
