// =============================================================
// Google Search AI Mode Conversation Exporter
// Updated: October 27, 2026
// For Google's AI Mode multi-turn conversations
// Paste into DevTools Console (F12 → Console)
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

  console.log('%c🔍 Google AI Mode Exporter', 'color: cyan; font-size: 16px; font-weight: bold');

  // ===================== DETECT PAGE TYPE =====================

  const aiModeH1 = document.querySelector('h1.iMqumd');
  const aiModeH3s = document.querySelectorAll('h3.MheKwc');
  const isAIMode = aiModeH1 || aiModeH3s.length > 0;

  // ===================== EXTRACT QUERY =====================

  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('q') || '';
  const searchInput = document.querySelector('input[name="q"], textarea[name="q"]');
  const displayQuery = searchInput?.value || searchQuery || '';

  console.log(`  Mode: ${isAIMode ? 'AI Mode Conversation' : 'Standard Search'}`);
  console.log(`  Query: "${displayQuery}"`);

  const lines = [];
  lines.push(`# Google AI Mode Export`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(`**Query:** ${displayQuery}`);
  lines.push(`\n---\n`);

  // ===================== AI MODE: MULTI-TURN CONVERSATION =====================

  if (isAIMode) {
    // Each turn container is div.tonYlb (but some are noise — filter by content)
    // User queries live in span.VndcI.veK2kb
    // AI responses live in div.Zkbeff
    // We walk the CKgc1d containers which hold full turns

    const turnContainers = document.querySelectorAll('div.CKgc1d');
    const seenText = new Set();
    let turnNum = 0;
    let aiNum = 0;

    turnContainers.forEach(container => {
      const containerText = (container.innerText || '').trim();
      if (containerText.length < 20) return;

      // Check if this is a user+AI turn by looking for the "You said:" prefix
      // or checking for query spans and response divs
      const querySpan = container.querySelector('span.VndcI.veK2kb');
      const responseDiv = container.querySelector('div.Zkbeff') || container.querySelector('div.pWvJNd');

      // User turn
      if (querySpan) {
        const queryText = querySpan.textContent.trim();
        if (queryText.length > 5 && !seenText.has(queryText)) {
          seenText.add(queryText);
          turnNum++;

          // Check for image attachments
          const imgNote = container.querySelector('div.ilZyRc');
          const imgText = imgNote ? imgNote.textContent.trim() : '';
          const hasImages = imgText.includes('image');

          lines.push(`### 🧑 Query ${turnNum}\n`);
          if (hasImages) {
            const imgMatch = imgText.match(/(\d+)\s*image/);
            if (imgMatch) lines.push(`*[${imgMatch[1]} image(s) attached]*\n`);
          }
          lines.push(queryText);
          lines.push(`\n---\n`);
        }
      }

      // AI response — get the pWvJNd content (main response body)
      if (responseDiv) {
        const responseBody = responseDiv.querySelector('div.mZJni') || responseDiv;

        // Build structured content
        const contentParts = [];

        // Get direct paragraph blocks
        const paragraphs = responseBody.querySelectorAll(':scope > div.n6owBd');
        const sectionHeaders = responseBody.querySelectorAll('div.ZLzG0d');
        const tables = responseBody.querySelectorAll('div.Fv6NCb');
        const codeBlocks = responseBody.querySelectorAll('div.aiModeUiCodeBlock__Container');
        const listItems = responseBody.querySelectorAll('span.iNqyIf');

        // If we have structured content, use it
        if (paragraphs.length > 0 || sectionHeaders.length > 0) {
          // Walk children in DOM order for proper sequencing
          const allContent = [];

          responseBody.querySelectorAll('div.n6owBd.awi2gc, div.ZLzG0d, div.Fv6NCb, div.aiModeUiCodeBlock__Container, div.AHmQrc').forEach(el => {
            const text = (el.innerText || '').trim();
            if (text.length < 10) return;

            // Skip boilerplate
            if (text.includes('Failed to copy') ||
                text.includes('Share public link') ||
                text.includes('Google may use account') ||
                text.includes('Saved time') ||
                text.includes('copy of this chat')) return;

            const dedupKey = text.substring(0, 80);
            if (seenText.has(dedupKey)) return;
            seenText.add(dedupKey);

            const rect = el.getBoundingClientRect();

            if (el.classList.contains('ZLzG0d')) {
              allContent.push({ type: 'header', text, top: rect.top });
            } else if (el.classList.contains('Fv6NCb')) {
              allContent.push({ type: 'table', text, top: rect.top });
            } else if (el.classList.contains('aiModeUiCodeBlock__Container')) {
              allContent.push({ type: 'code', text, top: rect.top });
            } else if (el.classList.contains('AHmQrc')) {
              allContent.push({ type: 'followup', text, top: rect.top });
            } else {
              allContent.push({ type: 'para', text, top: rect.top });
            }
          });

          allContent.sort((a, b) => a.top - b.top);

          if (allContent.length > 0) {
            aiNum++;
            lines.push(`### 🤖 AI Response ${aiNum}\n`);

            allContent.forEach(item => {
              if (item.type === 'header') {
                lines.push(`**${item.text}**\n`);
              } else if (item.type === 'table') {
                lines.push('```');
                lines.push(item.text);
                lines.push('```\n');
              } else if (item.type === 'code') {
                lines.push('```');
                lines.push(item.text);
                lines.push('```\n');
              } else if (item.type === 'followup') {
                lines.push(`*${item.text}*\n`);
              } else {
                lines.push(item.text + '\n');
              }
            });

            lines.push(`\n---\n`);
          }
        } else {
          // Fallback: grab all text from the response div
          const fullText = (responseDiv.innerText || '').trim();
          if (fullText.length > 20) {
            const dedupKey = fullText.substring(0, 80);
            if (!seenText.has(dedupKey)) {
              seenText.add(dedupKey);
              aiNum++;
              lines.push(`### 🤖 AI Response ${aiNum}\n`);
              lines.push(fullText);
              lines.push(`\n---\n`);
            }
          }
        }
      }
    });

    // ===================== SEARCH RESULTS / CITATIONS =====================

    const searchResults = document.querySelectorAll('div.ofHStc.qmNpEc');
    if (searchResults.length > 0) {
      lines.push(`\n## 🔗 Search Results & Citations\n`);
      const seenResults = new Set();

      searchResults.forEach(result => {
        const titleEl = result.querySelector('div.gpZmoc');
        const snippetEl = result.querySelector('span.hxIQcc');
        const linkEl = result.querySelector('a[href]');

        const title = titleEl ? titleEl.textContent.trim() : '';
        const snippet = snippetEl ? snippetEl.textContent.trim() : '';
        const url = linkEl ? linkEl.href : '';

        if (title && !seenResults.has(title)) {
          seenResults.add(title);
          lines.push(`- **${title}**`);
          if (url) lines.push(`  ${url}`);
          if (snippet) lines.push(`  ${snippet}`);
          lines.push('');
        }
      });
    }

    console.log(`  Extracted: ${turnNum} queries, ${aiNum} AI responses, ${searchResults.length} search results`);
  }

  // ===================== FALLBACK: NON-AI-MODE =====================

  if (!isAIMode) {
    console.warn('%c⚠️ Not an AI Mode page. Using fallback...', 'color: orange; font-size: 13px');

    const mainContainer = document.querySelector('.s6JM6d') ||
                          document.querySelector('main') ||
                          document.querySelector('#center_col') ||
                          document.querySelector('#rso');

    if (mainContainer) {
      const allText = mainContainer.innerText.trim();
      lines.push(`## Full Page Content\n`);
      lines.push(allText);
      lines.push(`\n---\n`);
      console.log(`  Fallback: captured ${allText.length} chars`);
    } else {
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
    .substring(0, 50) || 'google_ai_mode';

  const filename = `${timestamp()}_${querySlug}.md`;
  download(lines.join('\n'), filename);

  console.log(
    `%c📥 Exported → ${filename}`,
    'color: cyan; font-size: 14px; font-weight: bold'
  );
  console.log('Check your Downloads folder.');

})();
