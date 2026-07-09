# AI Conversation Exporters

Browser console scripts that export your full conversations from major AI chatbots to clean Markdown files. One script per platform — paste it into DevTools, get a `.md` file in your Downloads folder.

## Supported Platforms

| Platform | Script | Status |
|---|---|---|
| ChatGPT | `chatgpt-exporter.js` | ✅ Working |
| Claude | `claude-exporter.js` | ✅ Working |
| Gemini | `gemini-exporter.js` | ✅ Working |
| Microsoft Copilot | `copilot-exporter.js` | ✅ Working |
| Google Search AI | `google-search-ai-exporter.js` | ✅ Working |

## Why

AI chatbots don't make it easy to export your full conversations. Copy-paste loses formatting. The built-in share/export options (when they exist) are limited. These scripts grab the entire conversation from the DOM — including code blocks, multi-turn context, and expanded sections — and produce a clean, timestamped Markdown file you can actually use.

## How to Use

Same process for all five scripts:

1. Open your conversation in Microsoft Edge (other Chromium browsers like Chrome and Brave should also work)
2. Scroll through the entire conversation first — the DOM needs to render all messages before the script can find them
3. Open DevTools: press **F12**, then click the **Console** tab
4. If Edge blocks the paste, type `allow pasting` in the console first
5. Copy-paste the script for your platform
6. Press **Enter**
7. The `.md` file downloads automatically to your Downloads folder

The filename follows this format: `YYYY_MM_DD_HHMM_conversation_title.md`

**Note on the Claude exporter:** You don't need to manually scroll first. The script auto-scrolls through the entire conversation to handle Claude.ai's virtualized DOM (see platform notes below).

## What Each Script Does

All five scripts share the same core approach:

- **Auto-expand:** Finds and clicks "Show more" / "Continue generating" / "See more" buttons so truncated content is captured in full
- **Multi-strategy detection:** Each script tries multiple DOM selector strategies to find conversation turns, because platform UIs change frequently. If the primary selector fails, it falls back to the next strategy — and the next
- **Role classification:** Identifies which messages are yours and which are the AI's using class names, data attributes, and scoring heuristics
- **Clean extraction:** Strips buttons, icons, toolbars, avatars, and other UI clutter while preserving code blocks with language labels
- **Markdown output:** Exports a structured `.md` file with metadata (timestamp, URL, turn count) and labeled turns

## Platform-specific notes

### ChatGPT (`chatgpt-exporter.js`)

- 5 detection strategies (A through E): `data-message-author-role`, `data-testid`, article elements, generic class selectors, avatar-based detection
- Includes a DOM diagnostic step that logs which selectors matched — useful for debugging when ChatGPT updates its UI

### Claude (`claude-exporter.js`)

- **Scroll-and-collect architecture:** Claude.ai uses DOM virtualization for long conversations — only messages near your viewport exist in the DOM at any given time. The script handles this by auto-scrolling from top to bottom, collecting turns incrementally as they render, and deduplicating by text fingerprint. This means you don't need to manually scroll first
- Targets Claude.ai's specific class patterns: `font-claude-response-body`, `standard-markdown`, and `font-user` (note: Tailwind's `!` prefix on `!font-user-message` requires attribute-contains selectors rather than class selectors)
- Finds the common ancestor of user and Claude messages, then classifies each child by checking for role-specific selectors
- Falls back to individual block collection if common ancestor detection fails
- Scrolls back to the bottom of the conversation when finished

### Gemini (`gemini-exporter.js`)

- Handles Gemini's custom element tags (`user-query`, `model-response`)
- Looks for `infinite-scroller` containers common in Gemini's DOM
- Multi-signal role scoring across 8+ ancestor levels to handle Gemini's inconsistent class names in long conversations
- Auto-expands truncated messages with `WeakSet` tracking to prevent re-clicking toggle buttons
- Includes sanity check for user/Gemini turn ratio to flag potential missing turns

### Microsoft Copilot (`copilot-exporter.js`)

- Supports both the current `copilot.microsoft.com` site and the Edge sidebar Copilot
- Shadow DOM traversal for older Bing Chat / Copilot versions that used web components (`cib-message`, `cib-chat-turn`)
- 6 detection strategies (A through F), including a nuclear fallback that grabs all substantial text blocks on the page

### Google Search AI (`google-search-ai-exporter.js`)

- For when Gemini answers appear inside Google Search results (the AI Overview / conversational search mode)
- Classifies content into three types: user queries, AI responses, and search result snippets
- Uses vertical position (bounding rect) to sort content in reading order
- Includes a nuclear fallback that captures the full page content minus navigation

## Output Format

Every export produces a Markdown file like this:

```markdown
# ChatGPT Conversation Export
**Exported:** 3/26/2026, 10:45:00 PM
**URL:** https://chatgpt.com/c/abc123
**Turns:** 12 (6 user, 6 ChatGPT)

---

### Turn 1 — 🧑 **You**

Your message here...

---

### Turn 2 — 🤖 **ChatGPT**

The AI response here, with code blocks preserved...

---
```

## Troubleshooting

**"Could not find conversation messages"**

- Did you scroll through the entire conversation first? The DOM only renders visible messages in most platforms. Scroll slowly from top to bottom before running the script. (Exception: the Claude exporter auto-scrolls for you.)
- The platform may have updated its UI. Check the DOM diagnostic output in the console — it logs which selectors matched (ChatGPT and Copilot scripts include this). Open an issue with the diagnostic output.

**Missing turns or wrong role labels**

- Long conversations sometimes have lazy-loaded or virtualized sections. The Claude exporter handles this automatically; for other platforms, try scrolling more slowly and waiting for content to render.
- If roles are consistently swapped, the fallback heuristic may have guessed wrong on the first turn. This is a known limitation of alternation-based guessing.

**Code blocks look wrong**

- The scripts preserve `` ```language `` fencing from `<pre>` blocks. If the platform doesn't use standard `<pre>` tags for code, some formatting may be lost.

**The script auto-scrolls (Claude exporter)**

- This is expected. The Claude exporter needs to scroll through the conversation to collect all turns from the virtualized DOM. Don't scroll manually while it's running. It scrolls back to the bottom when finished.

## Limitations

- These are DOM-scraping scripts, which means they break when platforms update their HTML structure. The multi-strategy approach makes them resilient, but not permanent. If a script stops working, the DOM diagnostic output is the fastest way to figure out what changed.
- The scripts run in the browser console, which means they can only see what's rendered in the DOM. For most platforms, conversations that are only partially loaded (because you haven't scrolled through them) will be partially exported. The Claude exporter solves this with auto-scrolling; the others require manual scrolling first.
- Google Search AI overview content is especially fragile — Google changes class names frequently.
- LinkedIn-style platforms with obfuscated class names require different approaches (profile link anchoring, `aria-label` matching) and may need more frequent selector updates.

## Requirements

- Tested on **Windows 11** with **Microsoft Edge**
- Should work in any Chromium-based browser (Chrome, Brave, etc.) on any OS
- DevTools access (F12)
- No extensions, no installs, no dependencies

## License

MIT — use it however you want.

## Author

**Bruno Costa** — Los Angeles, CA

Built with help from Claude (Anthropic) during development and testing.
