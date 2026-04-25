# OceanGram Backend

This package provides a small Flask-based bridge for OceanGram.

## Features

- `/api/health` backend readiness check
- `/api/session`, `/api/login`, `/api/logout` authenticated backend session endpoints
- `/api/command` command wrapping with HTTP-only session cookies
- `/api/profile-summary`, `/api/profile`, and `/api/identity` profile summary endpoints
- in-memory session storage and TTL-based response caching
- resumable parallel media downloads when command payloads include a `downloads` array
- structured metadata passthrough for `metadata` and `metadata_tables`
- configurable command templates so operators can point the service at Osintgram or a similar private-access tool
- `oceangram-cli` for terminal-based command execution using the same adapter logic

## Environment variables

- `OCEANGRAM_BACKEND_HOST` / `OCEANGRAM_BACKEND_PORT`
- `OCEANGRAM_COMMAND_TEMPLATE` — required for `/api/command`
- `OCEANGRAM_LOGIN_TEMPLATE` — optional login hook
- `OCEANGRAM_LOGOUT_TEMPLATE` — optional logout hook
- `OCEANGRAM_PROFILE_TEMPLATE` — optional dedicated profile summary hook
- `OCEANGRAM_SESSION_TTL_SECONDS`
- `OCEANGRAM_CACHE_TTL_SECONDS`
- `OCEANGRAM_COMMAND_TIMEOUT_SECONDS`
- `OCEANGRAM_COOKIE_SECURE`
- `OCEANGRAM_COOKIE_SAMESITE`
- `OCEANGRAM_DOWNLOAD_ROOT`
- `OCEANGRAM_DOWNLOAD_POOL_SIZE`
- `OCEANGRAM_DOWNLOAD_TIMEOUT_SECONDS`

## Example

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e .
export OCEANGRAM_COMMAND_TEMPLATE='python3 /opt/osintgram/main.py {target} --command {command}'
oceangram-backend
```

If your Osintgram wrapper needs an explicit login bootstrap step, set `OCEANGRAM_LOGIN_TEMPLATE` and read `OCEANGRAM_INSTAGRAM_USERNAME`, `OCEANGRAM_INSTAGRAM_PASSWORD`, and `OCEANGRAM_INSTAGRAM_COOKIES` from that command's environment.

If your wrapped command prints JSON, it can return richer payloads such as:

```json
{
  "output": ["Found 20 photos"],
  "metadata": [{"filename": "a.jpg", "lat": 1.23, "lng": 4.56}],
  "downloads": [
    {
      "url": "https://cdn.example/photo-a.jpg",
      "filename": "photo-a.jpg",
      "metadata": { "camera": "iPhone", "lat": 1.23, "lng": 4.56 }
    }
  ]
}
```

When `downloads` is present, the backend saves files under `OCEANGRAM_DOWNLOAD_ROOT/<target>/<command>/`, skips files already recorded in the resume manifest, and downloads remaining items with a small worker pool.

CLI examples:

```bash
oceangram-cli --target user followers
oceangram-cli --target user metadata --json
oceangram-cli --target user photos --auth-username mylogin --auth-password 'secret'
oceangram-cli --target user --profile-summary
```
