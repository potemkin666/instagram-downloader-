# OceanGram

OceanGram is a static browser UI for Instagram reconnaissance workflows plus an optional Python backend bridge for authenticated command execution.

## Repository contents

- `index.html` — static frontend shell
- `src/` — frontend source modules
- `assets/app.bundle.js` — bundled frontend output
- `backend/` — optional Flask backend with session-aware auth, command, and identity endpoints

## Frontend features

- backend URL configuration with saved default values
- live backend health checks
- minimum identity verification via backend profile or command endpoints
- recent targets, recent commands, local response caching, and batch execution
- backend auth session panel with sign-in, sign-out, and session refresh actions
- structured JSON/table rendering for metadata-rich command output
- offline-aware action gating and toast-based UI feedback

## Backend features

- `GET /api/health`
- `GET /api/session`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/command?target=<username>&command=<command>`
- `GET /api/profile-summary?target=<username>`
- compatibility aliases: `GET /api/profile`, `GET /api/identity`
- HTTP-only backend session cookie, in-memory server-side session records, and TTL-based response caching
- resumable parallel media downloads when the wrapped command returns a `downloads` array
- structured metadata passthrough via `metadata` and `metadata_tables`
- configurable command templates so the service can wrap Osintgram or a similar authenticated scraper without changing the frontend architecture

## Frontend setup

```bash
cd instagram-downloader-
npm install
npm run build
```

Open `index.html` directly or serve the repository root with any static file server.

## Backend setup

```bash
cd instagram-downloader-/backend
python -m venv .venv
. .venv/bin/activate
pip install -e .
export OCEANGRAM_COMMAND_TEMPLATE='python3 /opt/osintgram/main.py {target} --command {command}'
oceangram-backend
```

The backend keeps authentication state server-side and expects the wrapped command runner to read these environment variables when needed:

- `OCEANGRAM_INSTAGRAM_USERNAME`
- `OCEANGRAM_INSTAGRAM_PASSWORD`
- `OCEANGRAM_INSTAGRAM_COOKIES`
- `OCEANGRAM_AUTHENTICATED`
- `OCEANGRAM_AUTH_MODE`

Optional hooks:

- `OCEANGRAM_LOGIN_TEMPLATE`
- `OCEANGRAM_LOGOUT_TEMPLATE`
- `OCEANGRAM_PROFILE_TEMPLATE`

Optional download tuning:

- `OCEANGRAM_DOWNLOAD_ROOT`
- `OCEANGRAM_DOWNLOAD_POOL_SIZE`
- `OCEANGRAM_DOWNLOAD_TIMEOUT_SECONDS`

See `backend/README.md` for more detail.

## CLI usage

The backend package also installs a terminal client:

```bash
cd instagram-downloader-/backend
oceangram-cli --target user followers
oceangram-cli --target user metadata --json
oceangram-cli --target user photos --auth-username mylogin --auth-password 'secret'
```

Use `--profile-summary` to fetch the identity/profile summary instead of running a command.

## Docker

A simple backend container image is included:

```bash
cd instagram-downloader-/backend
docker build -t oceangram-backend .
```

Provide the same `OCEANGRAM_*` environment variables at runtime so the container can reach your Osintgram installation or wrapper command.

## Security notes

- The frontend never stores Instagram credentials or cookies in localStorage.
- Auth data is sent only to the configured backend and should be protected with HTTPS in hosted deployments.
- The backend uses an HTTP-only cookie plus server-side session state for auth context.
- Command and profile responses are cached on the backend for a short TTL to reduce repeated requests.

## Development and validation

```bash
cd instagram-downloader-
npm test
```

For backend syntax validation during development:

```bash
cd instagram-downloader-
python -m compileall backend
```

## License

MIT. See `LICENSE`.

## Disclaimer

For educational purposes only. Use responsibly and only against data you are authorized to inspect.
