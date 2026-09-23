#!/usr/bin/env bash
set -euo pipefail

# DB_KEY from the environment wins; otherwise try the macOS Keychain.
if [ -z "${DB_KEY:-}" ] && command -v security >/dev/null 2>&1; then
  DB_KEY=$(security find-generic-password -a analyze-me -s analyze-me-db-key -w 2>/dev/null || true)
fi

if [ -z "${DB_KEY:-}" ]; then
  echo "warning: DB_KEY not set; the database will NOT be encrypted" >&2
fi
export DB_KEY="${DB_KEY:-}"

exec docker compose "$@"
