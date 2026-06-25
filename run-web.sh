#!/usr/bin/env bash
#
# run-web.sh - one command to view the UI prototype.
#
# Builds and starts ONLY the Next.js web app (no Besu, no Postgres, no indexer).
# Safe to run repeatedly. Stops any half-up full stack from clashing on the port.
#
#   bash run-web.sh
#   # then open: http://<host>:${WEB_PORT:-13300}
set -euo pipefail
cd "$(dirname "$0")"

PORT="${WEB_PORT:-13300}"

echo "==> Stopping the full stack (if running) so it does not hold port ${PORT} ..."
docker compose down --remove-orphans 2>/dev/null || true

echo "==> Building + starting the web-only prototype ..."
docker compose -f docker-compose.web.yml up --build -d

echo
echo "==> Waiting for the web app to answer ..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "    up."
    break
  fi
  sleep 2
done

echo
docker compose -f docker-compose.web.yml ps
echo
echo "Open the prototype:  http://202.141.15.3:${PORT}"
echo "Logs:                docker compose -f docker-compose.web.yml logs -f web"
echo "Stop:                docker compose -f docker-compose.web.yml down"
