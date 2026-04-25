from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import re
import secrets
import shlex
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, make_response, request

INSTAGRAM_ID_REGEX = re.compile(r"\b\d{4,}\b")
USERNAME_REGEX = re.compile(r"\b(?:username|user name|target|account|profile)\b\s*[:=#-]\s*@?([A-Za-z0-9._]{1,30})\b", re.IGNORECASE)
URL_REGEX = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
MEDIA_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".mp4", ".mov", ".webm")
LINE_TYPES = {"prompt", "dim", "label", "info", "result", "warn", "success", "error", "json", "table"}


def _now_ts() -> int:
    return int(time.time())


def _iso_utc(ts: int | float | None = None) -> str:
    return datetime.fromtimestamp(ts or time.time(), tz=UTC).isoformat().replace("+00:00", "Z")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _normalize_live_lines(payload: dict[str, Any]) -> list[list[str]]:
    if isinstance(payload.get("lines"), list):
        normalized: list[list[str]] = []
        for item in payload["lines"]:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                line_type = str(item[0] or "result")
                text = item[1]
                if isinstance(text, (dict, list)):
                    normalized.append(["json", json.dumps(_json_safe(text), indent=2, sort_keys=True)])
                else:
                    normalized.append([line_type if line_type in LINE_TYPES else "result", str(text)])
            elif isinstance(item, (dict, list)):
                normalized.append(["json", json.dumps(_json_safe(item), indent=2, sort_keys=True)])
            else:
                normalized.append(["result", str(item)])
        return normalized

    raw_output = payload.get("output")
    if isinstance(raw_output, list):
        return [["result", str(item)] for item in raw_output]
    if isinstance(raw_output, str):
        return [["result", line] for line in raw_output.splitlines()]

    raw_result = payload.get("result")
    if isinstance(raw_result, list):
        return [["result", str(item)] for item in raw_result]
    if isinstance(raw_result, str):
        return [["result", line] for line in raw_result.splitlines()]

    return []


def _normalize_payload_lines(payload: dict[str, Any]) -> list[str]:
    return [text for _, text in _normalize_live_lines(payload)]


def _extract_username(lines: list[str]) -> str:
    for line in lines:
        match = USERNAME_REGEX.search(line)
        if match:
            return match.group(1)
    return ""


def _extract_instagram_id(lines: list[str]) -> str:
    for line in lines:
        match = INSTAGRAM_ID_REGEX.search(line)
        if match:
            return match.group(0)
    return ""


def _extract_media_url(lines: list[str]) -> str:
    for line in lines:
        for raw_url in URL_REGEX.findall(line):
            url = raw_url.rstrip(")],.;")
            lowered = url.lower()
            if lowered.endswith(MEDIA_EXTENSIONS) or any(host in lowered for host in ("instagram.com", "cdninstagram.com", "fbcdn.net")):
                return url
    return ""


def _public_error_message(exc: "AdapterError") -> str:
    if isinstance(exc, ConfigurationError):
        return "Backend bridge is not fully configured yet."
    if isinstance(exc, AuthenticationError):
        return "Backend rejected the provided Instagram credentials or cookies."
    return "Backend bridge request failed."


@dataclass(slots=True)
class AppConfig:
    host: str = field(default_factory=lambda: os.getenv("OCEANGRAM_BACKEND_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.getenv("OCEANGRAM_BACKEND_PORT", "8000")))
    debug: bool = field(default_factory=lambda: _env_bool("OCEANGRAM_BACKEND_DEBUG", False))
    session_cookie_name: str = field(default_factory=lambda: os.getenv("OCEANGRAM_SESSION_COOKIE_NAME", "oceangram_session"))
    session_ttl_seconds: int = field(default_factory=lambda: int(os.getenv("OCEANGRAM_SESSION_TTL_SECONDS", "43200")))
    cache_ttl_seconds: int = field(default_factory=lambda: int(os.getenv("OCEANGRAM_CACHE_TTL_SECONDS", "120")))
    command_timeout_seconds: int = field(default_factory=lambda: int(os.getenv("OCEANGRAM_COMMAND_TIMEOUT_SECONDS", "90")))
    cookie_secure: bool = field(default_factory=lambda: _env_bool("OCEANGRAM_COOKIE_SECURE", False))
    cookie_samesite: str = field(default_factory=lambda: os.getenv("OCEANGRAM_COOKIE_SAMESITE", "Lax"))
    command_template: str = field(default_factory=lambda: os.getenv("OCEANGRAM_COMMAND_TEMPLATE", ""))
    login_template: str = field(default_factory=lambda: os.getenv("OCEANGRAM_LOGIN_TEMPLATE", ""))
    logout_template: str = field(default_factory=lambda: os.getenv("OCEANGRAM_LOGOUT_TEMPLATE", ""))
    profile_template: str = field(default_factory=lambda: os.getenv("OCEANGRAM_PROFILE_TEMPLATE", ""))
    download_root: str = field(default_factory=lambda: os.getenv("OCEANGRAM_DOWNLOAD_ROOT", "./downloads"))
    download_pool_size: int = field(default_factory=lambda: int(os.getenv("OCEANGRAM_DOWNLOAD_POOL_SIZE", "3")))
    download_timeout_seconds: int = field(default_factory=lambda: int(os.getenv("OCEANGRAM_DOWNLOAD_TIMEOUT_SECONDS", "60")))


@dataclass(slots=True)
class SessionRecord:
    session_id: str
    username: str = ""
    authenticated: bool = False
    auth_mode: str = ""
    cookies: str = ""
    password: str = ""
    source: str = ""
    created_at: int = field(default_factory=_now_ts)
    updated_at: int = field(default_factory=_now_ts)

    def touch(self) -> None:
        self.updated_at = _now_ts()


class MemorySessionStore:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = max(60, ttl_seconds)
        self._sessions: dict[str, SessionRecord] = {}
        self._lock = threading.Lock()

    def _is_expired(self, record: SessionRecord) -> bool:
        return record.updated_at + self.ttl_seconds < _now_ts()

    def get(self, session_id: str | None) -> SessionRecord | None:
        if not session_id:
            return None
        with self._lock:
            record = self._sessions.get(session_id)
            if not record:
                return None
            if self._is_expired(record):
                self._sessions.pop(session_id, None)
                return None
            record.touch()
            return record

    def save(self, record: SessionRecord) -> SessionRecord:
        record.touch()
        with self._lock:
            self._sessions[record.session_id] = record
        return record

    def delete(self, session_id: str | None) -> None:
        if not session_id:
            return
        with self._lock:
            self._sessions.pop(session_id, None)


class TtlCache:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = max(1, ttl_seconds)
        self._values: dict[str, tuple[int, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            value = self._values.get(key)
            if not value:
                return None
            expires_at, payload = value
            if expires_at <= _now_ts():
                self._values.pop(key, None)
                return None
            return payload

    def set(self, key: str, payload: Any) -> None:
        with self._lock:
            self._values[key] = (_now_ts() + self.ttl_seconds, payload)

    def clear(self) -> None:
        with self._lock:
            self._values.clear()


class AdapterError(RuntimeError):
    status_code = 502


class ConfigurationError(AdapterError):
    status_code = 503


class AuthenticationError(AdapterError):
    status_code = 401


class DownloadError(AdapterError):
    status_code = 502


class CommandTemplateAdapter:
    def __init__(self, config: AppConfig) -> None:
        self.config = config

    def _build_env(self, session: SessionRecord | None) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["OCEANGRAM_AUTHENTICATED"] = "1" if session and session.authenticated else "0"
        env["OCEANGRAM_AUTH_MODE"] = session.auth_mode if session else ""
        env["OCEANGRAM_INSTAGRAM_USERNAME"] = session.username if session else ""
        env["OCEANGRAM_INSTAGRAM_PASSWORD"] = session.password if session else ""
        env["OCEANGRAM_INSTAGRAM_COOKIES"] = session.cookies if session else ""
        return env

    def _run_template(self, template: str, session: SessionRecord | None, **placeholders: str) -> subprocess.CompletedProcess[str]:
        value = template.strip()
        if not value:
            raise ConfigurationError("No backend command template is configured.")
        command = value.format(**{key: str(data or "") for key, data in placeholders.items()})
        return subprocess.run(
            shlex.split(command),
            capture_output=True,
            text=True,
            timeout=self.config.command_timeout_seconds,
            env=self._build_env(session),
            check=False,
        )

    def _parse_json_stdout(self, stdout: str) -> Any | None:
        raw = stdout.strip()
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def _completed_stdout_lines(self, completed: subprocess.CompletedProcess[str]) -> list[str]:
        return [line for line in completed.stdout.splitlines() if line.strip()]

    def _download_directory(self, target: str, command: str, payload: dict[str, Any]) -> Path:
        override = str(payload.get("download_dir") or "").strip()
        base_root = Path(self.config.download_root)
        if override:
            safe_parts = [re.sub(r"[^A-Za-z0-9._-]+", "_", part) for part in Path(override).parts if part not in {"", ".", "..", "/"}]
            if safe_parts:
                base_root = base_root.joinpath(*safe_parts)
        safe_target = re.sub(r"[^A-Za-z0-9._-]+", "_", target) or "target"
        safe_command = re.sub(r"[^A-Za-z0-9._-]+", "_", command) or "command"
        return base_root / safe_target / safe_command

    def _resume_manifest_path(self, directory: Path) -> Path:
        return directory / ".oceangram-resume.json"

    def _load_resume_manifest(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            return {"version": 1, "completed": {}}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            completed = payload.get("completed")
            if not isinstance(completed, dict):
                return {"version": 1, "completed": {}}
            return {"version": 1, "completed": completed}
        except (OSError, json.JSONDecodeError):
            return {"version": 1, "completed": {}}

    def _save_resume_manifest(self, path: Path, manifest: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(_json_safe(manifest), indent=2, sort_keys=True), encoding="utf-8")

    def _derive_download_filename(self, url: str, index: int, item: dict[str, Any]) -> str:
        raw_filename = str(item.get("filename") or item.get("name") or "").strip()
        if raw_filename:
            base_name = Path(raw_filename).name
        else:
            parsed = urllib.parse.urlparse(url)
            candidate = Path(parsed.path).name
            base_name = candidate or f"{index + 1:03d}-{hashlib.sha1(url.encode('utf-8')).hexdigest()[:12]}.bin"
        sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", base_name).strip("._")
        return sanitized or f"{index + 1:03d}-download.bin"

    def _normalize_downloads(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        raw_downloads = payload.get("downloads")
        if not isinstance(raw_downloads, list):
            return []
        normalized: list[dict[str, Any]] = []
        for index, item in enumerate(raw_downloads):
            if isinstance(item, str):
                url = item.strip()
                metadata: dict[str, Any] = {}
                raw_item: dict[str, Any] = {}
            elif isinstance(item, dict):
                url = str(item.get("url") or item.get("download_url") or "").strip()
                metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
                raw_item = item
            else:
                continue
            if not url:
                continue
            normalized.append({
                "index": index,
                "id": str(raw_item.get("id") or hashlib.sha1(url.encode("utf-8")).hexdigest()),
                "url": url,
                "filename": self._derive_download_filename(url, index, raw_item),
                "metadata": _json_safe(metadata),
            })
        return normalized

    def _download_file(self, url: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_path = destination.with_suffix(f"{destination.suffix}.part")
        request_obj = urllib.request.Request(url, headers={"User-Agent": "OceanGram/1.0"})
        try:
            with urllib.request.urlopen(request_obj, timeout=self.config.download_timeout_seconds) as response, temp_path.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 64)
                    if not chunk:
                        break
                    handle.write(chunk)
            temp_path.replace(destination)
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            try:
                if temp_path.exists():
                    temp_path.unlink()
            except OSError:
                pass
            raise DownloadError(str(exc)) from exc

    def _process_downloads(self, payload: dict[str, Any], target: str, command: str) -> dict[str, Any] | None:
        downloads = self._normalize_downloads(payload)
        if not downloads:
            return None

        output_dir = self._download_directory(target, command, payload)
        manifest_path = self._resume_manifest_path(output_dir)
        manifest = self._load_resume_manifest(manifest_path)
        completed_manifest = manifest.setdefault("completed", {})
        output_dir.mkdir(parents=True, exist_ok=True)

        total = len(downloads)
        lines: list[list[str]] = [["label", f"[ download queue — {total} item(s) ]"]]
        items_summary: list[dict[str, Any]] = []
        pending: list[dict[str, Any]] = []
        downloaded_count = 0
        skipped_count = 0
        failed_count = 0

        for item in downloads:
            destination = output_dir / item["filename"]
            item["destination"] = destination
            previous = completed_manifest.get(item["id"])
            if previous and destination.exists():
                skipped_count += 1
                items_summary.append({
                    "filename": item["filename"],
                    "url": item["url"],
                    "status": "skipped",
                    "path": str(destination),
                    "metadata": item.get("metadata") or {},
                })
                lines.append(["info", f"Skipping {skipped_count}/{total}: {item['filename']} already downloaded."])
                continue
            pending.append(item)

        if pending:
            lines.append(["info", f"Downloading {len(pending)} item(s) with up to {max(1, self.config.download_pool_size)} parallel worker(s)..."])

        workers = max(1, min(self.config.download_pool_size, len(pending) or 1))
        completed_so_far = skipped_count
        if pending:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                future_map = {
                    executor.submit(self._download_file, item["url"], item["destination"]): item
                    for item in pending
                }
                for future in concurrent.futures.as_completed(future_map):
                    item = future_map[future]
                    completed_so_far += 1
                    try:
                        future.result()
                        downloaded_count += 1
                        completed_manifest[item["id"]] = {
                            "url": item["url"],
                            "filename": item["filename"],
                            "path": str(item["destination"]),
                            "downloaded_at": _iso_utc(),
                        }
                        self._save_resume_manifest(manifest_path, manifest)
                        items_summary.append({
                            "filename": item["filename"],
                            "url": item["url"],
                            "status": "downloaded",
                            "path": str(item["destination"]),
                            "metadata": item.get("metadata") or {},
                        })
                        lines.append(["info", f"Downloading {completed_so_far}/{total}: saved {item['filename']}"])
                    except DownloadError as exc:
                        failed_count += 1
                        items_summary.append({
                            "filename": item["filename"],
                            "url": item["url"],
                            "status": "failed",
                            "error": str(exc),
                            "metadata": item.get("metadata") or {},
                        })
                        lines.append(["warn", f"Downloading {completed_so_far}/{total}: failed {item['filename']} ({exc})"])

        if failed_count:
            lines.append(["warn", f"[!] Download pass finished with {failed_count} failure(s). Retry to resume skipped/completed items."])
        else:
            lines.append(["success", f"[✔] Downloaded {downloaded_count} new item(s); skipped {skipped_count} already-complete item(s)."])

        summary = {
            "output_dir": str(output_dir),
            "total": total,
            "downloaded": downloaded_count,
            "skipped": skipped_count,
            "failed": failed_count,
            "items": items_summary,
            "lines": lines,
        }
        payload.setdefault("metadata_tables", [])
        if isinstance(payload["metadata_tables"], list):
            payload["metadata_tables"].append({
                "title": "Download summary",
                "columns": ["metric", "value"],
                "rows": [
                    {"metric": "output_dir", "value": str(output_dir)},
                    {"metric": "total", "value": total},
                    {"metric": "downloaded", "value": downloaded_count},
                    {"metric": "skipped", "value": skipped_count},
                    {"metric": "failed", "value": failed_count},
                ],
            })
        return summary

    def _finalize_payload(self, payload: dict[str, Any], target: str, command: str) -> dict[str, Any]:
        normalized = _json_safe(dict(payload))
        lines = _normalize_live_lines(normalized)
        download_summary = self._process_downloads(normalized, target, command)
        if download_summary:
            lines.extend(download_summary["lines"])
            normalized["download_summary"] = _json_safe(download_summary)
        if lines:
            normalized["lines"] = lines
        return normalized

    def login(self, session: SessionRecord, payload: dict[str, Any]) -> SessionRecord:
        username = str(payload.get("username") or "").strip().replace("@", "")
        password = str(payload.get("password") or "")
        cookies = str(payload.get("cookies") or "").strip()
        if not username:
            raise AuthenticationError("A username is required.")
        if not password and not cookies:
            raise AuthenticationError("A password or cookie header is required.")

        session.username = username
        session.password = password
        session.cookies = cookies
        session.auth_mode = "cookies" if cookies else "password"
        session.source = f"server-side {session.auth_mode}"
        session.authenticated = True

        if self.config.login_template:
            completed = self._run_template(
                self.config.login_template,
                session,
                username=username,
                target=username,
                command="login",
            )
            if completed.returncode != 0:
                raise AuthenticationError((completed.stderr or completed.stdout or "Backend login command failed.").strip())
            metadata = self._parse_json_stdout(completed.stdout)
            if isinstance(metadata, dict):
                if metadata.get("authenticated") is False:
                    raise AuthenticationError(str(metadata.get("message") or "Backend login command rejected the credentials."))
                session.username = str(metadata.get("username") or session.username).strip().replace("@", "")
                session.source = str(metadata.get("source") or session.source).strip() or session.source
        session.touch()
        return session

    def logout(self, session: SessionRecord | None) -> None:
        if session and session.authenticated and self.config.logout_template:
            completed = self._run_template(
                self.config.logout_template,
                session,
                username=session.username,
                target=session.username,
                command="logout",
            )
            if completed.returncode != 0:
                raise AdapterError((completed.stderr or completed.stdout or "Backend logout command failed.").strip())

    def run_command(self, session: SessionRecord | None, target: str, command: str) -> dict[str, Any]:
        if not self.config.command_template:
            raise ConfigurationError("Set OCEANGRAM_COMMAND_TEMPLATE before calling /api/command.")
        completed = self._run_template(
            self.config.command_template,
            session,
            username=(session.username if session else ""),
            target=target,
            command=command,
        )
        if completed.returncode != 0:
            raise AdapterError((completed.stderr or completed.stdout or "Backend command failed.").strip())
        payload = self._parse_json_stdout(completed.stdout)
        if isinstance(payload, dict):
            return self._finalize_payload(payload, target, command)
        return self._finalize_payload({"output": self._completed_stdout_lines(completed)}, target, command)

    def profile_summary(self, session: SessionRecord | None, target: str) -> dict[str, Any]:
        if self.config.profile_template:
            completed = self._run_template(
                self.config.profile_template,
                session,
                username=(session.username if session else ""),
                target=target,
                command="profile-summary",
            )
            if completed.returncode != 0:
                raise AdapterError((completed.stderr or completed.stdout or "Backend profile summary command failed.").strip())
            payload = self._parse_json_stdout(completed.stdout)
            if isinstance(payload, dict):
                return _json_safe(payload)
        info_payload = self.run_command(session, target, "info")
        propic_payload = self.run_command(session, target, "propic")
        lines = _normalize_payload_lines(info_payload) + _normalize_payload_lines(propic_payload)
        username = _extract_username(lines) or target
        instagram_id = _extract_instagram_id(lines)
        profile_pic_url = _extract_media_url(lines)
        return {
            "username": username,
            "instagram_id": instagram_id,
            "profile_pic_url": profile_pic_url,
            "source": "command-fallback",
            "metadata": {
                "info": info_payload.get("metadata"),
                "propic": propic_payload.get("metadata"),
            },
        }


def _json_response(payload: dict[str, Any], status_code: int = 200):
    response = make_response(jsonify(_json_safe(payload)), status_code)
    origin = request.headers.get("Origin")
    response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    if origin:
        response.headers["Vary"] = "Origin"
    return response


def _session_payload(session: SessionRecord | None) -> dict[str, Any]:
    if not session or not session.authenticated:
        return {
            "authenticated": False,
            "username": "",
            "source": "",
            "message": "Backend session is signed out. Public-profile requests remain available.",
        }
    return {
        "authenticated": True,
        "username": session.username,
        "source": session.source or session.auth_mode,
        "auth_mode": session.auth_mode,
        "checked_at": _iso_utc(session.updated_at),
        "message": f"Authenticated as @{session.username}" if session.username else "Authenticated backend session",
    }


def create_app(config: AppConfig | None = None) -> Flask:
    app = Flask(__name__)
    cfg = config or AppConfig()
    adapter = CommandTemplateAdapter(cfg)
    session_store = MemorySessionStore(cfg.session_ttl_seconds)
    command_cache = TtlCache(cfg.cache_ttl_seconds)
    profile_cache = TtlCache(cfg.cache_ttl_seconds)

    def current_session() -> SessionRecord | None:
        return session_store.get(request.cookies.get(cfg.session_cookie_name))

    def ensure_session() -> SessionRecord:
        existing = current_session()
        if existing:
            return existing
        return SessionRecord(session_id=secrets.token_urlsafe(32))

    def cache_namespace(session: SessionRecord | None) -> str:
        return session.session_id if session and session.authenticated else "anon"

    @app.after_request
    def add_default_cors_headers(response):
        origin = request.headers.get("Origin")
        response.headers.setdefault("Access-Control-Allow-Origin", origin if origin else "*")
        response.headers.setdefault("Access-Control-Allow-Credentials", "true")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        if origin:
            response.headers.setdefault("Vary", "Origin")
        return response

    @app.route("/api/<path:_>", methods=["OPTIONS"])
    def options_handler(_: str):
        return _json_response({"ok": True})

    @app.get("/api/health")
    def health():
        session = current_session()
        return _json_response({
            "ok": True,
            "service": "oceangram-backend",
            "time": _iso_utc(),
            "command_template_configured": bool(cfg.command_template),
            "login_template_configured": bool(cfg.login_template),
            "profile_template_configured": bool(cfg.profile_template),
            "download_root": cfg.download_root,
            "download_pool_size": cfg.download_pool_size,
            "authenticated": bool(session and session.authenticated),
        })

    @app.get("/api/session")
    def session_status():
        return _json_response(_session_payload(current_session()))

    @app.post("/api/login")
    def login():
        body = request.get_json(silent=True) or {}
        session = ensure_session()
        try:
            session = adapter.login(session, body)
            session_store.save(session)
            profile_cache.clear()
            command_cache.clear()
        except AdapterError as exc:
            app.logger.warning("Backend login failed: %s", exc)
            return _json_response({"ok": False, "message": _public_error_message(exc)}, exc.status_code)
        response = _json_response({"ok": True, **_session_payload(session)})
        response.set_cookie(
            cfg.session_cookie_name,
            session.session_id,
            max_age=cfg.session_ttl_seconds,
            httponly=True,
            secure=cfg.cookie_secure,
            samesite=cfg.cookie_samesite,
        )
        return response

    @app.post("/api/logout")
    def logout():
        session = current_session()
        try:
            adapter.logout(session)
        except AdapterError as exc:
            app.logger.warning("Backend logout failed: %s", exc)
            return _json_response({"ok": False, "message": _public_error_message(exc)}, exc.status_code)
        if session:
            session_store.delete(session.session_id)
        profile_cache.clear()
        command_cache.clear()
        response = _json_response({"ok": True, **_session_payload(None)})
        response.delete_cookie(cfg.session_cookie_name)
        return response

    @app.get("/api/command")
    def command():
        target = str(request.args.get("target") or "").strip().replace("@", "")
        command_name = str(request.args.get("command") or "").strip()
        if not target or not command_name:
            return _json_response({"ok": False, "message": "Both target and command are required."}, 400)
        session = current_session()
        cache_key = f"{cache_namespace(session)}::{target.lower()}::{command_name.lower()}"
        cached = command_cache.get(cache_key)
        if cached is not None:
            return _json_response(cached)
        try:
            payload = adapter.run_command(session, target, command_name)
        except AdapterError as exc:
            app.logger.warning("Backend command failed for %s/%s: %s", target, command_name, exc)
            return _json_response({"ok": False, "message": _public_error_message(exc)}, exc.status_code)
        command_cache.set(cache_key, payload)
        return _json_response(payload)

    @app.get("/api/profile-summary")
    @app.get("/api/profile")
    @app.get("/api/identity")
    def profile_summary():
        target = str(request.args.get("target") or "").strip().replace("@", "")
        if not target:
            return _json_response({"ok": False, "message": "A target username is required."}, 400)
        session = current_session()
        cache_key = f"{cache_namespace(session)}::profile::{target.lower()}"
        cached = profile_cache.get(cache_key)
        if cached is not None:
            return _json_response(cached)
        try:
            payload = adapter.profile_summary(session, target)
        except AdapterError as exc:
            app.logger.warning("Backend profile summary failed for %s: %s", target, exc)
            return _json_response({"ok": False, "message": _public_error_message(exc)}, exc.status_code)
        profile_cache.set(cache_key, payload)
        return _json_response(payload)

    return app


def main() -> None:
    config = AppConfig()
    app = create_app(config)
    app.run(host=config.host, port=config.port, debug=config.debug)


if __name__ == "__main__":
    main()
