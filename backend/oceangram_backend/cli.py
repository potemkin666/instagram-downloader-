from __future__ import annotations

import argparse
import json
import sys

from .app import AppConfig, CommandTemplateAdapter, SessionRecord, _json_safe, _normalize_live_lines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="oceangram-cli", description="Run OceanGram backend commands from a terminal.")
    parser.add_argument("command", nargs="?", help="Command to run, such as followers, photos, stories, metadata, or locations.")
    parser.add_argument("--target", help="Instagram target username.")
    parser.add_argument("--auth-username", help="Optional backend-auth Instagram username.")
    parser.add_argument("--auth-password", help="Optional backend-auth Instagram password.")
    parser.add_argument("--auth-cookies", help="Optional backend-auth Instagram cookie header.")
    parser.add_argument("--profile-summary", action="store_true", help="Fetch the profile summary instead of running a command.")
    parser.add_argument("--json", action="store_true", help="Print the full JSON payload.")
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.profile_summary and not args.command:
        parser.error("provide a command or pass --profile-summary")
    if not args.target:
        parser.error("--target is required")

    config = AppConfig()
    adapter = CommandTemplateAdapter(config)
    session: SessionRecord | None = None

    if args.auth_username or args.auth_password or args.auth_cookies:
        session = SessionRecord(session_id="cli-session")
        adapter.login(session, {
            "username": args.auth_username or "",
            "password": args.auth_password or "",
            "cookies": args.auth_cookies or "",
        })

    payload = adapter.profile_summary(session, args.target) if args.profile_summary else adapter.run_command(session, args.target, args.command)
    if args.json:
        print(json.dumps(_json_safe(payload), indent=2, sort_keys=True))
        return

    for line_type, text in _normalize_live_lines(payload):
        prefix = {
            "warn": "[!] ",
            "error": "[x] ",
            "success": "[+] ",
            "label": "== ",
            "json": "",
            "table": "",
        }.get(line_type, "")
        print(f"{prefix}{text}")

    metadata = payload.get("metadata")
    if metadata:
        print(json.dumps(_json_safe(metadata), indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover - CLI fallback
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
