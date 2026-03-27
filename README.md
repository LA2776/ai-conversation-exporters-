# AI Conversation Exporters

Browser console scripts that export your full conversations from major AI chatbots to clean Markdown files. One script per platform — paste it into DevTools, get a `.md` file in your Downloads folder.

## Supported Platforms

| Platform | Script | Status |
|----------|--------|--------|
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
2. **Scroll through the entire conversation first** — the DOM needs to render all messages before the script can find them
3. Open DevTools: press `F12`, then click the **Console** tab
4. Copy-paste the script for your platform
5. Press `Enter`
6. The `.md` file downloads automatically to your Downloads folder

The filename follows this format: `YYYY_MM_DD_HHMM_conversation_title.md`

## What Each Script Does

All five scripts share the same core approach:

- **Auto-expand**: Finds and clicks "Show more" / "Continue generating" / "See more" buttons so truncated content is captured in full
- **Multi-strategy detection**: Each script tries multiple DOM selector strategies to find conversation turns, because platform UIs change frequently. If the primary selector fails, it falls back to the next strategy — and the next
- **Role classification**: Identifies which messages are yours and which are the AI's using class names, data attributes, and scoring heuristics
- **Clean extraction**: Strips buttons, icons, toolbars, avatars, and other UI clutter while preserving code blocks with language labels
- **Markdown output**: Exports a structured `.md` file with metadata (timestamp, URL, turn count) and labeled turns

### Platform-specific notes

**ChatGPT** (`chatgpt-exporter.js`)
- 5 detection strategies (A through E): `data-message-author-role`, `data-testid`, `article` elements, generic class selectors, avatar-based detection
- Includes a DOM diagnostic step that logs which selectors matched — useful for debugging when ChatGPT updates its UI

**Claude** (`claude-exporter.js`)
- Targets Claude.ai's specific class patterns (`font-claude-response-body`, `standard-markdown`, `font-user-message`)
- Uses a "walk up from anchor" approach: finds Claude response elements first, then walks up the DOM to discover the turn container level
- Flat collection fallback if turn-container detection fails

**Gemini** (`gemini-exporter.js`)
- Handles Gemini's custom element tags (`user-query`, `model-response`)
- Looks for `infinite-scroller` containers common in Gemini's DOM
- Includes sanity check for user/Gemini turn ratio to flag potential missing turns

**Microsoft Copilot** (`copilot-exporter.js`)
- Supports both the current `copilot.microsoft.com` site and the Edge sidebar Copilot
- Shadow DOM traversal for older Bing Chat / Copilot versions that used web components (`cib-message`, `cib-chat-turn`)
- 6 detection strategies (A through F), including a nuclear fallback that grabs all substantial text blocks on the page

**Google Search AI** (`google-search-ai-exporter.js`)
- For when Gemini answers appear inside Google Search results
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
- Did you scroll through the entire conversation first? The DOM only renders visible messages in most platforms. Scroll slowly from top to bottom before running the script.
- The platform may have updated its UI. Check the DOM diagnostic output in the console — it logs which selectors matched (ChatGPT and Copilot scripts include this). Open an issue with the diagnostic output.

**Missing turns or wrong role labels**
- Long conversations sometimes have lazy-loaded sections. Try scrolling more slowly and waiting for content to render.
- If roles are consistently swapped, the fallback heuristic may have guessed wrong on the first turn. This is a known limitation of alternation-based guessing.

**Code blocks look wrong**
- The scripts preserve `` ```language `` fencing from `<pre>` blocks. If the platform doesn't use standard `<pre>` tags for code, some formatting may be lost.

## Limitations

- These are DOM-scraping scripts, which means they break when platforms update their HTML structure. The multi-strategy approach makes them resilient, but not permanent. If a script stops working, the DOM diagnostic output is the fastest way to figure out what changed.
- The scripts run in the browser console, which means they can only see what's rendered in the DOM. Conversations that are only partially loaded (because you haven't scrolled through them) will be partially exported.
- Google Search AI overview content is especially fragile — Google changes class names frequently.

## Requirements

- Tested on Windows 11 with Microsoft Edge
- Should work in any Chromium-based browser (Chrome, Brave, etc.) on any OS
- DevTools access (F12)
- No extensions, no installs, no dependencies

## License

MIT — use it however you want.

## Author

**Bruno Costa** — Los Angeles, CA

Built with help from Claude (Anthropic) during development and testing.
