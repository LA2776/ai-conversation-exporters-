// =============================================================
// Google Search AI Conversation Exporter
// For when Gemini conversations end up in Google Search
// Paste into Edge DevTools Console (F12 → Console)
// =============================================================

(() => {
  'use strict';

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

  console.log('%c🔍 Google Search AI Exporter', 'color: cyan; font-size: 16px; font-weight: bold');

  // ===================== EXTRACT QUERY =====================

  // The search query from the URL or search box
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('q') || '';

  const searchInput = document.querySelector('input[name="q"], textarea[name="q"]');
  const displayQuery = searchInput?.value || searchQuery || '';

  console.log(`  Query: "${displayQuery}"`);

  // ===================== EXTRACT AI OVERVIEW / CONVERSATION =====================

  const lines = [];
  lines.push(`# Google Search AI Export`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(`**Query:** ${displayQuery}`);
  lines.push(`\n---\n`);

  // --- Known content classes from DOM diagnostic ---
  // User query spans: T286Pc
  // AI response content: Y3BBE, Nn35F, AdPoic, otQkpb
  // AI response paragraphs: tlTDk
  // Search result snippets: vhJ6Pe
  // Feedback sections: LYZeUd (skip these)

  // Strategy: Grab all substantial text blocks in DOM order, grouped by type

  const contentSelectors = [
    { sel: '.Y3BBE', type: 'ai_response' },
    { sel: '.Nn35F', type: 'ai_response' },
    { sel: '.AdPoic', type: 'ai_response' },
    { sel: '.otQkpb', type: 'ai_response' },
    { sel: 'p.tlTDk', type: 'ai_paragraph' },
    { sel: 'span.T286Pc', type: 'user_query' },
    { sel: 'span.vhJ6Pe', type: 'search_snippet' },
  ];

  // Collect all content elements with their DOM position
  const allContent = [];
  const seenText = new Set(); // dedup

  for (const { sel, type } of contentSelectors) {
    const elements = document.querySelectorAll(sel);
    elements.forEach(el => {
      const text = (el.innerText || '').trim();
      if (text.length < 10) return;
      if (seenText.has(text)) return; // skip duplicates

      // Skip feedback/boilerplate
      if (text.includes('Your feedback helps Google') ||
          text.includes('Privacy Policy') ||
          text.includes('visual recognition technologies')) return;

      seenText.add(text);

      // Get DOM position for ordering
      const rect = el.getBoundingClientRect();
      const absTop = rect.top + window.scrollY;

      allContent.push({ text, type, absTop, el });
    });
  }

  // Sort by vertical position in page
  allContent.sort((a, b) => a.absTop - b.absTop);

  console.log(`  Found ${allContent.length} content blocks`);

  // ===================== GROUP INTO SECTIONS =====================

  // Group consecutive blocks of the same type
  let currentSection = null;
  const sections = [];

  allContent.forEach(item => {
    if (!currentSection || currentSection.type !== item.type) {
      currentSection = { type: item.type, texts: [] };
      sections.push(currentSection);
    }
    currentSection.texts.push(item.text);
  });

  // ===================== BUILD MARKDOWN =====================

  let turnNum = 0;

  sections.forEach(section => {
    if (section.type === 'user_query') {
      turnNum++;
      lines.push(`### 🧑 Query ${turnNum}\n`);
      section.texts.forEach(t => lines.push(t));
      lines.push(`\n---\n`);
    } else if (section.type === 'ai_response' || section.type === 'ai_paragraph') {
      lines.push(`### 🤖 AI Response\n`);
      section.texts.forEach(t => lines.push(t + '\n'));
      lines.push(`\n---\n`);
    } else if (section.type === 'search_snippet') {
      lines.push(`### 🔗 Search Results\n`);
      section.texts.forEach(t => lines.push(`- ${t}`));
      lines.push(`\n---\n`);
    }
  });

  // ===================== FALLBACK: JUST GRAB EVERYTHING =====================

  if (allContent.length === 0) {
    console.warn('%c⚠️ Known selectors missed. Using fallback...', 'color: orange; font-size: 13px');

    // Grab all text from the main content area
    const mainContainer = document.querySelector('.s6JM6d') ||
                          document.querySelector('main') ||
                          document.querySelector('#center_col') ||
                          document.querySelector('#rso');

    if (mainContainer) {
      const allText = mainContainer.innerText.trim();
      lines.push(`## Full Page Content\n`);
      lines.push(allText);
      lines.push(`\n---\n`);
      console.log(`  Fallback: captured ${allText.length} chars from main container`);
    } else {
      // Nuclear fallback: just grab the body minus nav
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('nav, header, footer, script, style, [role="navigation"]').forEach(n => n.remove());
      const allText = clone.innerText.trim();
      lines.push(`## Full Page Content (raw)\n`);
      lines.push(allText);
      console.log(`  Nuclear fallback: captured ${allText.length} chars`);
    }
  }

  // ===================== DOWNLOAD =====================

  const querySlug = displayQuery
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50) || 'google_search';

  const filename = `${timestamp()}_${querySlug}.md`;
  download(lines.join('\n'), filename);

  const aiBlocks = allContent.filter(c => c.type === 'ai_response' || c.type === 'ai_paragraph').length;
  const queryBlocks = allContent.filter(c => c.type === 'user_query').length;
  const snippetBlocks = allContent.filter(c => c.type === 'search_snippet').length;

  console.log(
    `%c📥 Exported: ${queryBlocks} queries, ${aiBlocks} AI responses, ${snippetBlocks} search snippets → ${filename}`,
    'color: cyan; font-size: 14px; font-weight: bold'
  );
  console.log('Check your Downloads folder.');

})();
