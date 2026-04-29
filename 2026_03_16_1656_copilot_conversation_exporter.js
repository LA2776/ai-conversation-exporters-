// =============================================================
// Microsoft Copilot Conversation Exporter
// Paste into Edge DevTools Console (F12 → Console)
// FIRST: Scroll through the ENTIRE conversation, then run.
// Works on copilot.microsoft.com and Copilot in Edge sidebar.
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
    // Copilot known patterns
    '[data-content="ai-message"]', '[data-content="user-message"]',
    '[data-testid*="message"]', '[data-testid*="turn"]',
    '[data-testid*="user"]', '[data-testid*="bot"]',
    '[data-testid*="response"]', '[data-testid*="copilot"]',
    'cib-message-group', 'cib-message', 'cib-chat-turn',
    '[class*="user-message"]', '[class*="UserMessage"]',
    '[class*="bot-message"]', '[class*="BotMessage"]',
    '[class*="ai-message"]', '[class*="AiMessage"]',
    '[class*="copilot"]', '[class*="Copilot"]',
    '[class*="response"]', '[class*="Response"]',
    '[class*="message"]', '[class*="Message"]',
    '[class*="turn"]', '[class*="Turn"]',
    '[class*="chat"]', '[class*="Chat"]',
    '[class*="conversation"]', '[class*="Conversation"]',
    '[class*="markdown"]', '[class*="Markdown"]',
    '[class*="prose"]',
    '[class*="thread"]', '[class*="Thread"]',
    // Aria / role patterns
    '[role="listitem"]', '[role="list"]',
    '[role="article"]', '[role="log"]',
    '[role="presentation"]',
    'article',
    // Shadow DOM host elements (Copilot sometimes uses these)
    'cib-serp',
  ];

  const diagResults = {};
  for (const sel of diagSelectors) {
    try {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        const examples = Array.from(found).slice(0, 2).map(el => {
          const tag = el.tagName.toLowerCase();
          const cls = (el.className?.toString() || '').substring(0, 100);
          const text = (el.innerText || '').substring(0, 60).replace(/\n/g, ' ');
          const hasShadow = el.shadowRoot ? ' [HAS SHADOW DOM]' : '';
          return `<${tag} class="${cls}">${hasShadow} "${text}..."`;
        });
        diagResults[sel] = { count: found.length, examples };
      }
    } catch(e) {}
  }

  console.groupCollapsed('📊 DOM diagnostic (expand for selector hits)');
  Object.entries(diagResults).forEach(([sel, info]) => {
    console.log(`  ${sel} → ${info.count} hit(s)`);
    info.examples.forEach(ex => console.log(`    ${ex}`));
  });
  console.groupEnd();

  // Check for Shadow DOM (old Copilot/Bing Chat used this heavily)
  const shadowHosts = document.querySelectorAll('cib-serp, cib-conversation, cib-chat-turn, cib-message-group, cib-message');
  const hasShadowDOM = Array.from(shadowHosts).some(el => el.shadowRoot);
  if (hasShadowDOM) {
    console.log('%c⚠️ Shadow DOM detected — using shadow DOM traversal', 'color: orange; font-size: 13px');
  }

  // Also scan profile links to understand structure
  const profileLinks = document.querySelectorAll('a[href*="/profile"], img[alt*="User"], img[alt*="Copilot"]');
  log(`  Profile/avatar elements: ${profileLinks.length}`);

  // ===================== STEP 1: AUTO-EXPAND =====================

  console.log('%c🔄 Step 1: Expanding truncated content...', 'color: yellow; font-size: 13px');

  let totalExpanded = 0;
  const alreadyClicked = new WeakSet();

  // Helper: click buttons matching patterns (safe — no bare "Reply" etc.)
  const expandByText = async (patterns, maxPasses = 3, delayMs = 300) => {
    let total = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
      let clickedThisPass = 0;
      const allBtns = document.querySelectorAll('button, [role="button"]');

      for (const btn of allBtns) {
        if (alreadyClicked.has(btn)) continue;
        const text = (btn.textContent || '').trim().toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const all = text + ' ' + label;

        if (all.includes('less') || all.includes('collapse') || all.includes('hide')) continue;

        const matches = patterns.some(p => all.includes(p));
        if (matches) {
          try {
            btn.click();
            alreadyClicked.add(btn);
            clickedThisPass++;
            await sleep(delayMs);
          } catch(e) {}
        }
      }

      total += clickedThisPass;
      if (clickedThisPass === 0) break;
      log(`  Expand pass ${pass + 1}: clicked ${clickedThisPass}`);
    }
    return total;
  };

  totalExpanded += await expandByText(['show more', 'see more', 'expand', 'continue', 'load more'], 3, 400);

  if (totalExpanded > 0) {
    console.log(`%c✅ Expanded ${totalExpanded} section(s)`, 'color: limegreen; font-size: 13px');
    await sleep(500);
  }

  // ===================== STEP 2: FIND MESSAGES =====================

  console.log('%c🔍 Step 2: Finding conversation messages...', 'color: yellow; font-size: 13px');

  let turns = [];

  // ---------------------------------------------------------------------------
  // Helper: extract text from an element
  // ---------------------------------------------------------------------------
  const extractText = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
      'button, [aria-hidden="true"], svg, [class*="icon"]:not(pre):not(code), ' +
      '[class*="action"], [class*="toolbar"], [class*="copy"], ' +
      '[class*="feedback"], [class*="thumb"], [class*="avatar"], ' +
      '[class*="timestamp"], [class*="tooltip"], [class*="sr-only"], ' +
      '[class*="citation"], [class*="footnote"]'
    ).forEach(n => n.remove());

    clone.querySelectorAll('pre').forEach(pre => {
      const langEl = pre.querySelector('[class*="lang"], [class*="language"]');
      const lang = (langEl?.textContent?.trim() || '').substring(0, 20);
      if (langEl) langEl.remove();
      pre.textContent = `\n\`\`\`${lang}\n${pre.textContent.trim()}\n\`\`\`\n`;
    });

    return clone.innerText?.trim() || clone.textContent?.trim() || '';
  };

  // ---------------------------------------------------------------------------
  // Helper: generic role classifier
  // ---------------------------------------------------------------------------
  const classifyRole = (el) => {
    const nodesToCheck = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      nodesToCheck.push(parent);
      parent = parent.parentElement;
    }

    let userScore = 0;
    let botScore = 0;

    for (const node of nodesToCheck) {
      const cls = (node.className || '').toLowerCase();
      const testId = (node.getAttribute('data-testid') || '').toLowerCase();
      const dataContent = (node.getAttribute('data-content') || '').toLowerCase();
      const ariaLabel = (node.getAttribute('aria-label') || '').toLowerCase();
      const tag = (node.tagName || '').toLowerCase();
      const all = `${cls} ${testId} ${dataContent} ${ariaLabel} ${tag}`;

      // User signals
      if (dataContent === 'user-message') userScore += 10;
      if (all.includes('user-message') || all.includes('user_message')) userScore += 5;
      if (all.includes('human')) userScore += 4;
      if (/\buser\b/.test(all)) userScore += 2;
      if (all.includes('request') && !all.includes('response')) userScore += 2;

      // Bot/Copilot signals
      if (dataContent === 'ai-message') botScore += 10;
      if (all.includes('bot-message') || all.includes('bot_message')) botScore += 5;
      if (all.includes('ai-message') || all.includes('ai_message')) botScore += 5;
      if (all.includes('copilot')) botScore += 4;
      if (all.includes('assistant')) botScore += 4;
      if (all.includes('response') && !all.includes('user')) botScore += 3;
      if (all.includes('markdown') || all.includes('prose')) botScore += 2;
      if (/\bbot\b/.test(all)) botScore += 3;
    }

    if (userScore > botScore && userScore >= 2) return 'user';
    if (botScore > userScore && botScore >= 2) return 'copilot';
    return null;
  };

  // ---------------------------------------------------------------------------
  // Strategy A: data-content attributes
  // ---------------------------------------------------------------------------
  const dataContentEls = document.querySelectorAll(
    '[data-content="ai-message"], [data-content="user-message"]'
  );
  if (dataContentEls.length > 0) {
    log(`  Strategy A: data-content → ${dataContentEls.length} elements`);
    const sorted = Array.from(dataContentEls).sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    sorted.forEach(el => {
      const role = el.getAttribute('data-content') === 'user-message' ? 'user' : 'copilot';
      const text = extractText(el);
      if (text && text.length > 1) {
        turns.push({ role, text });
        log(`  ✅ ${role} (${text.length} chars)`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Strategy B: Shadow DOM (old Bing Chat / Copilot)
  // ---------------------------------------------------------------------------
  if (turns.length === 0 && hasShadowDOM) {
    log('  Strategy B: Shadow DOM traversal...');

    const traverseShadow = (root) => {
      const results = [];
      const walk = (node) => {
        if (node.shadowRoot) {
          walk(node.shadowRoot);
        }
        const children = node.querySelectorAll ? node.querySelectorAll('*') : [];
        children.forEach(child => {
          if (child.shadowRoot) walk(child.shadowRoot);
        });

        // Look for message elements
        const messages = node.querySelectorAll ?
          node.querySelectorAll('cib-message, [class*="message"], [class*="response"]') : [];
        messages.forEach(msg => {
          const text = (msg.innerText || '').trim();
          if (text.length > 5) {
            const type = (msg.getAttribute('type') || msg.className || '').toLowerCase();
            let role = null;
            if (type.includes('user') || type.includes('request')) role = 'user';
            else if (type.includes('bot') || type.includes('response') || type.includes('ai')) role = 'copilot';
            results.push({ el: msg, role, text });
          }
        });
      };
      walk(root);
      return results;
    };

    const shadowResults = traverseShadow(document.body);
    if (shadowResults.length > 0) {
      log(`  Strategy B: found ${shadowResults.length} messages in shadow DOM`);
      shadowResults.forEach((r, i) => {
        const role = r.role || (i % 2 === 0 ? 'user' : 'copilot');
        turns.push({ role, text: r.text });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy C: Class-based selectors
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy C: class-based selectors...');

    const userSels = [
      '[class*="user-message"]', '[class*="UserMessage"]',
      '[class*="human-message"]', '[class*="request-message"]',
    ];
    const botSels = [
      '[class*="bot-message"]', '[class*="BotMessage"]',
      '[class*="ai-message"]', '[class*="AiMessage"]',
      '[class*="copilot-message"]', '[class*="response-message"]',
      '[class*="assistant-message"]',
    ];

    const userEls = [];
    const botEls = [];

    for (const sel of userSels) {
      document.querySelectorAll(sel).forEach(el => userEls.push(el));
    }
    for (const sel of botSels) {
      document.querySelectorAll(sel).forEach(el => botEls.push(el));
    }

    if (userEls.length > 0 || botEls.length > 0) {
      log(`  Strategy C: ${userEls.length} user, ${botEls.length} bot elements`);
      const deduped = new WeakSet();
      const all = [];

      userEls.forEach(el => { if (!deduped.has(el)) { el._role = 'user'; all.push(el); deduped.add(el); }});
      botEls.forEach(el => { if (!deduped.has(el)) { el._role = 'copilot'; all.push(el); deduped.add(el); }});

      all.sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });

      all.forEach(el => {
        const text = extractText(el);
        if (text && text.length > 1) {
          turns.push({ role: el._role, text });
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy D: data-testid patterns
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy D: data-testid...');

    const testIdEls = document.querySelectorAll(
      '[data-testid*="message"], [data-testid*="turn"], ' +
      '[data-testid*="conversation"], [data-testid*="chat"]'
    );

    if (testIdEls.length > 1) {
      log(`  Strategy D: ${testIdEls.length} elements`);
      testIdEls.forEach(el => {
        const text = extractText(el);
        if (!text || text.length < 3) return;

        let role = classifyRole(el);
        if (!role) {
          const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
          role = prev === 'user' ? 'copilot' : 'user';
        }
        turns.push({ role, text });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy E: Profile link / avatar anchoring
  // Use images/icons that represent user vs Copilot as landmarks
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy E: landmark-based (avatars/icons)...');

    // Find all substantial text blocks and use role classifier
    const containers = document.querySelectorAll(
      'main, [role="main"], [class*="chat"], [class*="conversation"], ' +
      '[class*="thread"], [class*="messages"]'
    );

    for (const container of containers) {
      const children = Array.from(container.querySelectorAll(':scope > div, :scope > div > div'))
        .filter(el => (el.innerText || '').trim().length > 20);

      if (children.length > 1) {
        log(`  Strategy E: found ${children.length} substantial blocks`);

        // Deduplicate parent/child
        const deduped = [];
        const seen = new WeakSet();
        children.forEach(el => {
          if (seen.has(el)) return;
          let dominated = false;
          for (let i = 0; i < deduped.length; i++) {
            if (deduped[i].contains(el)) { dominated = true; break; }
            if (el.contains(deduped[i])) { deduped[i] = el; seen.add(el); dominated = true; break; }
          }
          if (!dominated) { deduped.push(el); seen.add(el); }
        });

        deduped.forEach(el => {
          const text = extractText(el);
          if (!text || text.length < 3) return;

          let role = classifyRole(el);
          if (!role) {
            const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
            role = prev === 'user' ? 'copilot' : 'user';
          }
          turns.push({ role, text });
        });

        if (turns.length > 0) break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy F: Nuclear fallback — grab ALL substantial text in order
  // ---------------------------------------------------------------------------
  if (turns.length === 0) {
    log('  Strategy F: nuclear fallback — all text blocks...');

    const allEls = document.querySelectorAll('div, p, section, article');
    const textBlocks = [];
    const seenText = new Set();

    allEls.forEach(el => {
      const text = (el.innerText || '').trim();
      const childTextLen = Array.from(el.children)
        .reduce((sum, c) => sum + (c.innerText || '').trim().length, 0);
      const ownText = text.length - childTextLen;

      if (text.length > 30 && text.length < 5000 && ownText > 20 && !seenText.has(text)) {
        seenText.add(text);
        const rect = el.getBoundingClientRect();
        textBlocks.push({ text, absTop: rect.top + window.scrollY, el });
      }
    });

    textBlocks.sort((a, b) => a.absTop - b.absTop);

    if (textBlocks.length > 0) {
      log(`  Strategy F: ${textBlocks.length} text blocks`);
      textBlocks.forEach((tb, i) => {
        let role = classifyRole(tb.el);
        if (!role) {
          const prev = turns.length > 0 ? turns[turns.length - 1].role : null;
          role = prev === 'user' ? 'copilot' : 'user';
        }
        turns.push({ role, text: tb.text });
      });
    }
  }

  // ===================== STEP 3: VALIDATE =====================

  console.log('%c📝 Step 3: Validating...', 'color: yellow; font-size: 13px');

  if (turns.length === 0) {
    console.error(
      '%c❌ Could not find conversation messages.',
      'color: red; font-size: 14px'
    );
    console.log('Expand the DOM diagnostic above for clues.');
    console.log('TIP: Right-click a Copilot response → Inspect, and share the element structure.');
    return;
  }

  // Clean up very short / label-only turns
  turns = turns.filter(t => {
    if (t.text.length < 3) return false;
    const lower = t.text.toLowerCase();
    if (lower === 'copilot' || lower === 'you' || lower === 'microsoft copilot') return false;
    return true;
  });

  const userTurns = turns.filter(t => t.role === 'user').length;
  const copilotTurns = turns.filter(t => t.role === 'copilot').length;

  if (copilotTurns === 0) {
    console.warn('%c⚠️ No Copilot responses detected!', 'color: red; font-size: 14px');
  } else if (userTurns === 0) {
    console.warn('%c⚠️ No user messages detected!', 'color: red; font-size: 14px');
  }

  console.log(
    `%c✅ Found ${turns.length} turns (${userTurns} user, ${copilotTurns} Copilot)`,
    'color: limegreen; font-size: 13px'
  );

  // ===================== STEP 4: BUILD MARKDOWN & DOWNLOAD =====================

  const getTitle = () => {
    let raw = document.title
      ?.replace(/\s*[-–—|]\s*(Microsoft\s*)?Copilot.*$/i, '')
      ?.replace(/\s*[-–—|]\s*Bing.*$/i, '')
      .trim() || '';

    if (!raw || raw.length < 3 || raw.toLowerCase().includes('copilot')) {
      const heading = document.querySelector('h1, [class*="title"], [class*="header"] span');
      raw = heading?.textContent?.trim() || '';
    }
    if (raw && raw.length > 2 && raw.length < 120) {
      return raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').substring(0, 60);
    }
    return 'copilot_conversation';
  };

  const lines = [];
  lines.push(`# Copilot Conversation Export`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(`**Turns:** ${turns.length} (${userTurns} user, ${copilotTurns} Copilot)`);
  if (totalExpanded > 0) lines.push(`**Auto-expanded:** ${totalExpanded} section(s)`);
  lines.push(`\n---\n`);

  turns.forEach((turn, i) => {
    const label = turn.role === 'user' ? '🧑 **You**' : '🤖 **Copilot**';
    lines.push(`### Turn ${i + 1} — ${label}\n`);
    lines.push(turn.text);
    lines.push(`\n---\n`);
  });

  const title = getTitle();
  const filename = `${timestamp()}_${title}.md`;
  download(lines.join('\n'), filename);

  console.log(
    `%c📥 Exported ${turns.length} turns (${userTurns} user / ${copilotTurns} Copilot) → ${filename}`,
    'color: cyan; font-size: 14px; font-weight: bold'
  );
  console.log('Check your Downloads folder.');

})();
