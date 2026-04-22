dp#!/usr/bin/env bash
set -euo pipefail

DB_KEY=$(security find-generic-password -a analyze-me -s analyze-me-db-key -w)
export DB_KEY

exec docker compose "$@"
