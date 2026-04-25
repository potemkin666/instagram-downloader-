# OceanGram

OceanGram is a static, browser-based UI for Instagram OSINT workflows. It presents a command-driven interface for an external backend (for example, a personal-login bridge around Osintgram or a similar service) and renders live results, recent history, cached responses, and minimum identity checks in the browser.

## What is in this repository

- A static frontend served from `index.html`
- Source modules in `/home/runner/work/instagram-downloader-/instagram-downloader-/src`
- A bundled browser asset at `/home/runner/work/instagram-downloader-/instagram-downloader-/assets/app.bundle.js`

## What is not in this repository

- No Python backend package is included here
- No installable CLI backend is shipped here yet

Because this repository currently contains only the frontend, the Python packaging suggestions from the review are not applied here. If a backend is added later, it should use modern packaging (`pyproject.toml`, PEP 517/518 metadata, and a console entry point).

## Features

- Ocean-themed static UI
- Live backend command execution
- Saved default backend API URL
- Toast notifications for non-terminal success and error feedback
- Offline detection that disables live actions
- Recent targets and recent commands
- Response caching and cache management
- Minimum identity summary with optional dedicated profile endpoints
- Batch command execution with limited concurrency

## Requirements

- Node.js 18+ recommended
- npm
- A reachable backend that implements the API described below

## Installation

1. Clone the repository.
2. Install frontend dependencies.
3. Build the browser bundle.

```bash
cd /home/runner/work/instagram-downloader-/instagram-downloader-
npm install
npm run build
```

The production bundle is written to:

```bash
/home/runner/work/instagram-downloader-/instagram-downloader-/assets/app.bundle.js
```

## Local usage

After building, open `/home/runner/work/instagram-downloader-/instagram-downloader-/index.html` in a browser, or serve the repository root with any static file server.

Typical flow:

1. Enter a public Instagram username.
2. Paste your backend URL into **Backend / personal-login bridge API URL**.
3. Optionally save that URL as the default.
4. Click **CHECK API HEALTH**.
5. Run one command or use **RUN VISIBLE**.

## Development

```bash
cd /home/runner/work/instagram-downloader-/instagram-downloader-
npm run dev
```

For the current project, `npm test` runs the existing build validation:

```bash
cd /home/runner/work/instagram-downloader-/instagram-downloader-
npm test
```

## UX behavior

- The terminal is reserved for command output
- Small UI actions and failures now surface as toast notifications
- If the browser goes offline, live command actions are disabled until connectivity returns
- The API URL is normalized and validated when editing finishes

## Backend API specification

OceanGram expects an HTTP backend base URL configured by the user.

### 1. Health check

```http
GET /api/health
```

Expected behavior:

- `200 OK` means the backend is reachable
- Other HTTP responses are shown as warnings in the UI

### 2. Command execution

```http
GET /api/command?target=<username>&command=<command>
```

Query parameters:

- `target`: Instagram username without `@`
- `command`: command id such as `info`, `followers`, or `propic`

Accepted response shapes:

```json
{ "lines": [["prompt", "..."], ["result", "..."], ["success", "..."]] }
```

```json
{ "output": "line 1\nline 2\nline 3" }
```

```json
{ "output": ["line 1", "line 2"] }
```

Notes:

- HTTP `429` is treated as a rate-limit response
- Invalid JSON is treated as an error
- Empty but successful responses are treated as unusable output

### 3. Optional identity endpoints

OceanGram probes these endpoints in order:

```http
GET /api/profile-summary?target=<username>
GET /api/profile?target=<username>
GET /api/identity?target=<username>
```

Useful fields include:

- `username`
- `instagram_id` or `instagramId`
- `profile_image_url`
- `profile_pic_url`
- `profile_pic_url_hd`
- nested equivalents under `user`, `profile`, `account`, or `data`

If no dedicated identity endpoint returns usable data, the UI falls back to live `info` and `propic` command calls.

## Source layout

- `/home/runner/work/instagram-downloader-/instagram-downloader-/src/app.js` — main UI logic, persistence, notifications, connectivity handling
- `/home/runner/work/instagram-downloader-/instagram-downloader-/src/api-client.js` — backend client wiring
- `/home/runner/work/instagram-downloader-/instagram-downloader-/src/commands.js` — command catalog
- `/home/runner/work/instagram-downloader-/instagram-downloader-/src/effects.js` — visual effects and copy helper

## License

This project is licensed under the MIT License. See `/home/runner/work/instagram-downloader-/instagram-downloader-/LICENSE`.

## Disclaimer

For educational purposes only. Use responsibly and only against data you are authorized to inspect.
