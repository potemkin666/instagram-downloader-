# 🌊 OceanGram — Instagram OSINT Tool

An ocean-themed GitHub Pages UI for Instagram OSINT reconnaissance, inspired by [Osintgram](https://github.com/Datalux/Osintgram).

## 🌐 GitHub Pages Deployment

GitHub Pages is enabled for this repository.

Use **Settings → Pages** with **Branch: `main`** and **Folder: `/ (root)`**, then visit:

```
https://<your-username>.github.io/instagram-downloader-/
```

## ✨ Features

- **Ocean-themed UI** — deep-sea gradient, animated bubbles, shimmering particle canvas, and SVG waves
- **20 OSINT command cards** — organised by category (Profile, Social, Content, Engagement, Contact)
- **Interactive terminal panel** — click any card to see backend command output with typewriter animation (backend URL required)
- **Optional live mode** — set a backend API URL in the UI to fetch real command results
- **Command search + visible-runner** — search command cards and run all currently visible commands in sequence
- **Input validation + recent history** — validate Instagram usernames and quickly rerun recent command/target pairs
- **Persistent recent command history** — recent command chips survive page reloads
- **One-click history cleanup** — clear recent targets and recent commands independently
- **Terminal utilities** — clear terminal output and export terminal logs to `.txt`
- **Overlap-safe command execution** — prevents concurrent command runs from colliding
- **Stoppable batch runner** — `RUN VISIBLE` toggles to `STOP` while batch execution is active
- **Keyboard shortcuts** — `Ctrl/Cmd+Enter` run visible, `Ctrl/Cmd+K` focus search, `Esc` clear validation
- **Persistent command view state** — remembers active category, command search query, and sort mode across reloads
- **Safer backend URL handling** — validates backend URL format/protocol and automatically re-checks API health after edits
- **Quick-run first match** — run the first currently visible command instantly via `RUN FIRST` or `Enter` in command search
- **Media URL actions (incl. profile pics)** — auto-detects latest media URL from live output with one-click `OPEN`, `SAVE`, and `COPY MEDIA URL`
- **Minimum identity summary** — when a username and backend URL are supplied, OceanGram now attempts to verify the Instagram ID and profile image even before individual commands are explored
- **Live response cache** — reuses cached command output per target+command for faster repeat lookups
- **Cache management controls** — view cache entry count in the UI and clear cached live output instantly
- **Auto retry for flaky requests** — optional one-time retry on failed live backend calls
- **Batch delay control** — configure milliseconds between commands during `RUN VISIBLE` batches
- **Contact command safety lock** — blocks `Contact` commands unless explicitly enabled by the operator
- **Favorites + favorites tab** — star frequently used commands and filter to favorites only
- **Sortable command grid** — order commands by default, name, category, or most-used
- **API health indicator** — check backend reachability from the UI with visible status
- **Retry last command** — instantly rerun your most recent command/target pair
- **Recent target chips** — switch targets quickly with one-click recall
- **Filterable command grid** — filter by category tabs
- **Quick-start code block** — copy the Osintgram install commands in one click
- **Fully responsive** — works on mobile and desktop
- **Bundled production script** — modular source files are bundled into a single minified browser asset with esbuild
- **Zero runtime dependencies** — the shipped UI still runs as static HTML/CSS/JS in the browser

## 🧰 OSINT Commands Showcased

| Category   | Commands |
|------------|----------|
| Profile    | `info`, `propic` |
| Social     | `followers`, `followings`, `tagged`, `wtagged`, `wcommented` |
| Content    | `photos`, `stories`, `captions`, `photodes`, `mediatype`, `hashtags` |
| Engagement | `likes`, `comments` |
| Contact    | `addrs`, `fwersemail`, `fwingsemail`, `fwersnumber`, `fwingsnumber` |

## ⚡ Quick Start (Osintgram backend)

```bash
git clone https://github.com/Datalux/Osintgram.git && cd Osintgram
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
make setup
python3 main.py <target_username>
```

## 🔌 Live API integration

To run commands against a real backend from the UI:

1. Start your backend service (for example, a wrapper around Osintgram).
2. In OceanGram, paste the backend base URL into the **Backend API URL** field.
3. Click any command card.

OceanGram calls:

```
GET <backend-base-url>/api/command?target=<username>&command=<command>
```

Supported response formats:

- `{ "lines": [["prompt","..."], ["result","..."], ["success","..."]] }`
- `{ "output": "line 1\nline 2\nline 3" }`
- `{ "output": ["line 1", "line 2"] }`

Optional dedicated identity endpoints supported by the UI:

- `GET <backend-base-url>/api/profile-summary?target=<username>`
- `GET <backend-base-url>/api/profile?target=<username>`
- `GET <backend-base-url>/api/identity?target=<username>`

If one of those endpoints is available, OceanGram uses it first for the minimum identity summary. Otherwise it falls back to the existing `info` + `propic` command calls and only shows the profile image after the URL successfully loads in the browser.

If no backend URL is set, the terminal shows `[!] No backend API URL configured`.
If the backend request fails, the terminal shows `[!] Live request failed: ...`.
No fallback output is used in either case.

## 🧱 Source layout

OceanGram now keeps the browser logic under `/home/runner/work/instagram-downloader-/instagram-downloader-/src`:

- `src/app.js` — UI rendering, stateful interactions, and bootstrapping
- `src/commands.js` — command catalog metadata
- `src/api-client.js` — provider-oriented API client wiring for the current backend mode and future authenticated/local providers
- `src/effects.js` — copy helper plus visual/background effects

The current shipped build still uses the existing backend provider. The API client module is structured so a future local authenticated Instagram-session provider can be added without returning to a single inline script.

## 🛠️ Build the bundled asset

```bash
npm install
npm run build
```

This writes the production bundle to:

```bash
assets/app.bundle.js
```

## ⚠️ Disclaimer

For **educational purposes only**. The authors assume no responsibility for misuse.
Only public Instagram profiles can be analysed.
