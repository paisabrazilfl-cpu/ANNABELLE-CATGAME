#!/usr/bin/env bash
# Double-click or run: ./PLAY.sh  → starts the game in your browser
PORT=${PORT:-4321}
URL="http://127.0.0.1:${PORT}/"
echo "🐱 Starting Annabelle's Cat Runner on $URL"
( cd "$(dirname "$0")" && PORT=$PORT node serve.js ) &
SERVER_PID=$!
sleep 1
# try to open the browser
if   command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
elif command -v start >/dev/null 2>&1; then start "$URL"
else echo "Open $URL in your browser"
fi
echo "Press Ctrl+C to stop"
wait $SERVER_PID
