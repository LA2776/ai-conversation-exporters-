// =============================================================
// ChatGPT Conversation Exporter — Browser Console Script
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

  // ===================== STEP 0: DOM DIAGNOSTIC =====================

  console.log('%c🔬 Step 0: DOM diagnostic...', 'color: magenta; font-size: 13px');

  const diagSelectors = [
    '[data-message-author-role]',
    '[data-message-id]',
    'article', '[role="article"]',
    '[class*="message"]', '[class*="Message"]',
    '[class*="turn"]', '[class*="Turn"]',
    '[class*="conversation"]', '[class*="Conversation"]',
    '[class*="assistant"]', '[class*="Assistant"]',
    '[class*="user"]', '[class*="User"]',
    '[class*="markdown"]', '[class*="Markdown"]',
    '[class*="prose"]',
    '[data-testid]',
  ];

  const diagResults = {};
  for (const sel of diagSelectors) {
    try {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        const examples = Array.from(found).slice(0, 2).map(el => {
          const tag = el.tagName.toLowerCase();
          const cls = (el.className?.toString() || '').substring(0, 100);
          const role = el.getAttribute('data-message-author-role') || '';
          const testId = el.getAttribute('data-testid') || '';
          const text = (el.innerText || '').substring(0, 50).replace(/\n/g, ' ');
          return `<${tag} class="${cls}" role="${role}" testid="${testId}"> "${text}..."`;
        });
        diagResults[sel] = { count: found.length, examples };
      }
    } catch(e) {}
  }

  console.groupCollapsed('📊 DOM diagnostic (expand for details)');
  console.table(
    Object.entries(diagResults).map(([sel, info]) => ({
      selector: sel, count: info.count, example: info.examples[0] || ''
    }))
  );
  console.groupEnd();

  // ===================== STEP 1: AUTO-EXPAND =====================

  console.log('%c🔄 Step 1: Expanding truncated content...', 'color: yellow; font-size: 13px');

  let totalExpanded = 0;
  const MAX_PASSES = 3;
  const alreadyClicked = new WeakSet();

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let clickedThisPass = 0;

    // ChatGPT "Continue generating" button
    const continueBtns = document.querySelectorAll(
      'button[class*="continue"], button[data-testid*="continue"]'
    );
    for (const btn of continueBtns) {
      if (alreadyClicked.has(btn)) continue;
      const text = (btn.textContent || '').toLowerCase();
      if (text.includes('continue')) {
        try { btn.click(); alreadyClicked.add(btn); clickedThisPass++; await sleep(2000); } catch(e) {}
      }
    }

    // Generic expand / show more buttons
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
      if (alreadyClicked.has(btn)) continue;
      const text = (btn.textContent || '').trim().toLowerCase();
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const all = text + ' ' + label;

      if ((all.includes('show more') || all.includes('see more') || all.includes('expand')) &&
          !all.includes('less') && !all.includes('collapse')) {
        try { btn.click(); alreadyClicked.add(btn); clickedThisPass++; await sleep(300); } catch(e) {}
      }
    }

    totalExpanded += clickedThisPass;
    if (clickedThisPass === 0) break;
    log(`  Pass ${pass + 1}: expanded ${clickedThisPass}`);
    await sleep(300);
  }

  if (totalExpanded > 0) {
    console.log(`%c✅ Expanded ${totalExpanded} section(s)`, 'color: limegreen; font-size: 13px');
    await sleep(500);
  }

  // ===================== STEP 2: FIND MESSAGES =====================

  console.log('%c🔍 Step 2: Finding conversation messages...', 'color: yellow; font-size: 13px');

  let turns = [];

  // ---------------------------------------------------------------------------
  // Strategy A: data-message-author-role (most reliable for ChatGPT)
  // ChatGPT typically marks turns with data-message-author-role="user"|"assistant"
  // ---------------------------------------------------------------------------
  const roleElements = document.querySelectorAll('[data-message-author-role]');
  if (roleElements.length > 0) {
    log(`  Strategy A: data-message-author-role → ${roleElements.length} elements`);

    roleElements.forEach((el, i) => {
      const role = el.getAttribute('data-message-author-role');
      const mappedRole = (role === 'user') ? 'user' : 'chatgpt';

      // Extract text from the message content area
      // ChatGPT nests the actual text inside a markdown/prose div
      const contentEl = el.querySelector(
        '.markdown, .prose, [class*="markdown"], [class*="prose"], ' +
        '[class*="message-content"], [class*="text-message"]'
      ) || el;

      const text = extractText(contentEl);
      if (text && text.length > 1) {
        turns.push({ role: mappedRole, text });
        log(`  ✅ Turn ${turns.length}: ${mappedRole} (${text.length} chars)`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Strategy B: data-testid patterns
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy A missed, trying Strategy B: data-testid...');

    const testIdEls = document.querySelectorAll(
      '[data-testid*="conversation-turn"], [data-testid*="message"]'
    );

    if (testIdEls.length > 0) {
      log(`  Strategy B: data-testid → ${testIdEls.length} elements`);

      testIdEls.forEach((el, i) => {
        const testId = (el.getAttribute('data-testid') || '').toLowerCase();
        const text = extractText(el);
        if (!text || text.length < 2) return;

        let role = null;
        if (testId.includes('user')) role = 'user';
        else if (testId.includes('assistant') || testId.includes('gpt')) role = 'chatgpt';
        else {
          // Check inner elements for role hints
          const inner = (el.innerHTML || '').substring(0, 500).toLowerCase();
          if (inner.includes('user') || inner.includes('human')) role = 'user';
          else if (inner.includes('assistant') || inner.includes('gpt') || inner.includes('markdown') || inner.includes('prose')) role = 'chatgpt';
        }

        if (!role) {
          const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
          role = prev === 'user' ? 'chatgpt' : 'user';
        }

        turns.push({ role, text });
        log(`  ✅ Turn ${turns.length}: ${role} (${text.length} chars)`);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy C: article elements or role="presentation" containers
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy B missed, trying Strategy C: article/presentation...');

    const articles = document.querySelectorAll(
      'article, [role="presentation"], [role="article"]'
    );

    if (articles.length > 1) {
      log(`  Strategy C: articles → ${articles.length} elements`);

      articles.forEach((el, i) => {
        const text = extractText(el);
        if (!text || text.length < 2) return;

        // Check for role signals in class names or nested elements
        let role = classifyRoleGeneric(el);
        if (!role) {
          const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
          role = prev === 'user' ? 'chatgpt' : 'user';
        }

        turns.push({ role, text });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy D: Walk the main conversation container
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy C missed, trying Strategy D: container walk...');

    const containers = document.querySelectorAll(
      'main, [role="main"], [class*="conversation"], [class*="chat-messages"], ' +
      '[class*="thread"], [class*="react-scroll"]'
    );

    for (const container of containers) {
      const children = Array.from(container.querySelectorAll(':scope > div')).filter(el => {
        return (el.innerText || '').trim().length > 20;
      });

      if (children.length > 1) {
        log(`  Strategy D: container children → ${children.length}`);

        children.forEach((el, i) => {
          const text = extractText(el);
          if (!text || text.length < 5) return;

          let role = classifyRoleGeneric(el);
          if (!role) {
            const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
            role = prev === 'user' ? 'chatgpt' : 'user';
          }

          turns.push({ role, text });
        });
        break; // use the first container that works
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy E: Profile link / avatar-based detection
  // Some ChatGPT versions show user avatar vs GPT avatar
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy D missed, trying Strategy E: avatar-based...');

    const allDivs = document.querySelectorAll('div');
    const turnCandidates = [];

    allDivs.forEach(div => {
      // Look for divs that contain an img (avatar) + substantial text
      const img = div.querySelector('img');
      const text = (div.innerText || '').trim();
      if (img && text.length > 30 && text.length < 10000 && div.children.length >= 2) {
        const alt = (img.alt || '').toLowerCase();
        let role = null;
        if (alt.includes('user') || alt.includes('you')) role = 'user';
        else if (alt.includes('gpt') || alt.includes('chatgpt') || alt.includes('assistant')) role = 'chatgpt';
        turnCandidates.push({ el: div, role, text });
      }
    });

    // Deduplicate (remove parents that contain children already found)
    const deduped = [];
    const seenE = new WeakSet();
    turnCandidates.forEach(tc => {
      if (seenE.has(tc.el)) return;
      let dominated = false;
      for (const kept of deduped) {
        if (kept.el.contains(tc.el)) { dominated = true; break; }
        if (tc.el.contains(kept.el)) {
          const idx = deduped.indexOf(kept);
          deduped[idx] = tc;
          seenE.add(tc.el);
          dominated = true;
          break;
        }
      }
      if (!dominated) { deduped.push(tc); seenE.add(tc.el); }
    });

    if (deduped.length > 1) {
      log(`  Strategy E: avatar-based → ${deduped.length} turns`);
      deduped.forEach((tc, i) => {
        let role = tc.role;
        if (!role) {
          const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
          role = prev === 'user' ? 'chatgpt' : 'user';
        }
        turns.push({ role, text: extractText(tc.el) });
      });
    }
  }

  // ===================== HELPER FUNCTIONS =====================

  function extractText(el) {
    const clone = el.cloneNode(true);

    // Remove UI elements
    clone.querySelectorAll(
      'button, [aria-hidden="true"], svg, [class*="icon"]:not(pre):not(code), ' +
      '[class*="action"], [class*="toolbar"], [class*="copy"], ' +
      '[class*="feedback"], [class*="thumb"], [class*="avatar"], ' +
      '[class*="timestamp"], [class*="tooltip"], [class*="agent-turn-action"], ' +
      'img[class*="avatar"], [class*="sr-only"]'
    ).forEach(n => n.remove());

    // Preserve code blocks
    clone.querySelectorAll('pre').forEach(pre => {
      const langEl = pre.querySelector('[class*="lang"], [class*="language"], span');
      const lang = langEl?.textContent?.trim() || '';
      // Only use lang if it's short (likely a language label, not code content)
      const langLabel = lang.length < 20 ? lang : '';
      if (langEl && langLabel) langEl.remove();
      pre.textContent = `\n\`\`\`${langLabel}\n${pre.textContent.trim()}\n\`\`\`\n`;
    });

    return clone.innerText?.trim() || clone.textContent?.trim() || '';
  }

  function classifyRoleGeneric(el) {
    const nodesToCheck = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 6 && parent; i++) {
      nodesToCheck.push(parent);
      parent = parent.parentElement;
    }

    let userScore = 0;
    let gptScore = 0;

    for (const node of nodesToCheck) {
      const cls = (node.className || '').toLowerCase();
      const testId = (node.getAttribute('data-testid') || '').toLowerCase();
      const role = (node.getAttribute('data-message-author-role') || '').toLowerCase();
      const all = `${cls} ${testId} ${role}`;

      if (role === 'user' || all.includes('human')) userScore += 5;
      if (all.includes('user-message') || all.includes('user_message')) userScore += 4;
      if (/\buser\b/.test(all)) userScore += 2;

      if (role === 'assistant') gptScore += 5;
      if (all.includes('assistant') || all.includes('gpt')) gptScore += 4;
      if (all.includes('markdown') || all.includes('prose')) gptScore += 2;
      if (all.includes('bot') || all.includes('model')) gptScore += 2;
    }

    if (userScore > gptScore && userScore >= 2) return 'user';
    if (gptScore > userScore && gptScore >= 2) return 'chatgpt';
    return null;
  }

  // ===================== STEP 3: VALIDATE & CLEAN =====================

  console.log('%c📝 Step 3: Validating...', 'color: yellow; font-size: 13px');

  if (turns.length === 0) {
    console.error(
      '%c❌ Could not find conversation messages. Expand the DOM diagnostic above for clues.',
      'color: red; font-size: 14px'
    );
    console.log('TIP: Right-click a ChatGPT response → Inspect, and share the element structure.');
    return;
  }

  // Remove system/tool messages that might have been captured
  turns = turns.filter(t => {
    const text = t.text.toLowerCase();
    // Skip very short turns that are likely UI artifacts
    if (t.text.length < 3) return false;
    // Skip "ChatGPT" label-only turns
    if (t.text === 'ChatGPT' || t.text === 'You') return false;
    return true;
  });

  const userTurns = turns.filter(t => t.role === 'user').length;
  const gptTurns = turns.filter(t => t.role === 'chatgpt').length;

  if (gptTurns === 0) {
    console.warn('%c⚠️ No ChatGPT responses detected!', 'color: red; font-size: 14px');
  } else if (userTurns === 0) {
    console.warn('%c⚠️ No user messages detected!', 'color: red; font-size: 14px');
  }

  console.log(
    `%c✅ Found ${turns.length} turns (${userTurns} user, ${gptTurns} ChatGPT)`,
    'color: limegreen; font-size: 13px'
  );

  // ===================== STEP 4: BUILD MARKDOWN & DOWNLOAD =====================

  const getTitle = () => {
    // ChatGPT puts the conversation title in the page title
    let raw = document.title?.replace(/\s*[-–—|]\s*ChatGPT.*$/i, '').trim() || '';
    if (!raw || raw.length < 3 || raw.toLowerCase() === 'chatgpt') {
      // Try nav/sidebar for active conversation title
      const activeNav = document.querySelector(
        'nav a[class*="active"], nav [class*="selected"], [class*="active"] [class*="title"]'
      );
      raw = activeNav?.textContent?.trim() || '';
    }
    if (raw && raw.length > 2 && raw.length < 120) {
      return raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').substring(0, 60);
    }
    return 'chatgpt_conversation';
  };

  const lines = [];
  lines.push(`# ChatGPT Conversation Export`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(`**Turns:** ${turns.length} (${userTurns} user, ${gptTurns} ChatGPT)`);
  if (totalExpanded > 0) lines.push(`**Auto-expanded:** ${totalExpanded} section(s)`);
  lines.push(`\n---\n`);

  turns.forEach((turn, i) => {
    const label = turn.role === 'user' ? '🧑 **You**' : '🤖 **ChatGPT**';
    lines.push(`### Turn ${i + 1} — ${label}\n`);
    lines.push(turn.text);
    lines.push(`\n---\n`);
  });

  const title = getTitle();
  const filename = `${timestamp()}_${title}.md`;
  download(lines.join('\n'), filename);

  console.log(
    `%c📥 Exported ${turns.length} turns (${userTurns} user / ${gptTurns} ChatGPT) → ${filename}`,
    'color: cyan; font-size: 14px; font-weight: bold'
  );
  console.log('Check your Downloads folder.');

})();
