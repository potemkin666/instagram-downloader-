from __future__ import annotations

import json
import os
import re
import secrets
import shlex
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from flask import Flask, jsonify, make_response, request

INSTAGRAM_ID_REGEX = re.compile(r"\\b\\d{4,}\\b")
USERNAME_REGEX = re.compile(r"\\b(?:username|user name|target|account|profile)\\b\\s*[:=#-]\\s*@?([A-Za-z0-9._]{1,30})\\b", re.IGNORECASE)
URL_REGEX = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
MEDIA_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg")


def _now_ts() -> int:
    return int(time.time())


def _iso_utc(ts: int | float | None = None) -> str:
    return datetime.fromtimestamp(ts or time.time(), tz=UTC).isoformat().replace("+00:00", "Z")


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


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


def _public_error_message(exc: AdapterError) -> str:
    if isinstance(exc, ConfigurationError):
        return "Backend bridge is not fully configured yet."
    if isinstance(exc, AuthenticationError):
        return "Backend rejected the provided Instagram credentials or cookies."
    return "Backend bridge request failed."


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
        completed = subprocess.run(
            shlex.split(command),
            capture_output=True,
            text=True,
            timeout=self.config.command_timeout_seconds,
            env=self._build_env(session),
            check=False,
        )
        return completed

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
        if isinstance(payload, dict) and any(key in payload for key in ("lines", "output", "result")):
            return payload
        lines = self._completed_stdout_lines(completed)
        return {"output": lines}

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
                return payload
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
        }


def _normalize_payload_lines(payload: dict[str, Any]) -> list[str]:
    if isinstance(payload.get("lines"), list):
        normalized: list[str] = []
        for item in payload["lines"]:
            if isinstance(item, list) and len(item) == 2:
                normalized.append(str(item[1]))
        return normalized
    raw_output = payload.get("output")
    if isinstance(raw_output, list):
        return [str(item) for item in raw_output]
    if isinstance(raw_output, str):
        return raw_output.splitlines()
    raw_result = payload.get("result")
    if isinstance(raw_result, str):
        return raw_result.splitlines()
    return []


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


def _json_response(payload: dict[str, Any], status_code: int = 200):
    response = make_response(jsonify(payload), status_code)
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
