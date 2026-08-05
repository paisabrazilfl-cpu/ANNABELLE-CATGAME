#!/usr/bin/env bash
# Double-click or run: ./PLAY.sh  → starts the game in your browser
set -e
PORT=${PORT:-4321}
URL="http://127.0.0.1:${PORT}/"
cd "$(dirname "$0")"
echo "🐱 Starting Annabelle's Cat Runner on $URL"
# Start the server in the background and capture the real node PID
# (not the subshell PID)
node serve.js &
NODE_PID=$!
cleanup() {
  echo ""
  echo "Stopping server (PID $NODE_PID)..."
  kill "$NODE_PID" 2>/dev/null
  wait "$NODE_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM
# Poll until the server is up (or fail after 10s)
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/" 2>/dev/null | grep -q "200"; then
    break
  fi
  sleep 0.5
done
# Open the browser if a desktop opener is available
if   command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
elif command -v start >/dev/null 2>&1; then start "$URL"
else echo "Open $URL in your browser"
fi
echo "Press Ctrl+C to stop"
wait "$NODE_PID"
