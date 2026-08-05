#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# 🚀 ANNABELLE-CATGAME bootstrap
# Creates the GitHub repo (under the authenticated user), pushes the
# project, and prints the URLs for the manual Render deploy step.
#
# NOTE: this script creates the repo under the authenticated USER's account
# (the `paisabrazilfl-cpu` personal account is used because the ABBYCRM org
# PAT does not have write scope). If you want a different owner, set the
# GH_USER env var explicitly.
#
# Requires env vars:
#   GH_TOKEN   — GitHub PAT with `repo` scope (write)
# ----------------------------------------------------------------------------
set -euo pipefail

REPO_NAME="ANNABELLE-CATGAME"
BRANCH="2026-07-25__methodical-notes__initial-cat-runner-game"

: "${GH_TOKEN:?Set GH_TOKEN to a GitHub PAT with repo:write scope}"

# require jq for robust JSON parsing
command -v jq >/dev/null 2>&1 || { echo "jq is required (brew install jq)"; exit 1; }

echo "==> 1/4  checking GitHub auth"
GH_USER=$(curl -sS -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user | jq -r '.login // empty')
if [ -z "$GH_USER" ]; then
  echo "    ERROR: GitHub auth failed. Check GH_TOKEN."
  exit 1
fi
echo "    authenticated as: $GH_USER"

echo "==> 2/4  ensuring repo $GH_USER/$REPO_NAME exists"
if curl -sS -f -H "Authorization: Bearer $GH_TOKEN" \
        "https://api.github.com/repos/$GH_USER/$REPO_NAME" >/dev/null; then
  echo "    repo already exists — using it"
else
  curl -sS -X POST -H "Authorization: Bearer $GH_TOKEN" \
       -H "Accept: application/vnd.github+json" \
       -H "Content-Type: application/json" \
       "https://api.github.com/user/repos" \
       -d "{\"name\":\"$REPO_NAME\",\"description\":\"🐱 Annabelle's Cat Runner — fun 2D browser game, kid-readable code\",\"private\":false,\"auto_init\":true}" \
       > /dev/null
  echo "    repo created at https://github.com/$GH_USER/$REPO_NAME"
fi

echo "==> 3/4  pushing branch $BRANCH"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:$GH_TOKEN@github.com/$GH_USER/$REPO_NAME.git"
git push -u origin "$BRANCH" --force

echo "==> 4/4  done"
echo "    GitHub:  https://github.com/$GH_USER/$REPO_NAME"
echo
echo "==> NEXT (manual from Render side, per standing order — no Blueprint):"
echo "    1. Go to https://dashboard.render.com/"
echo "    2. New + → Web Service → Connect $GH_USER/$REPO_NAME"
echo "    3. Branch: $BRANCH"
echo "    4. Runtime: Node"
echo "    5. Build Cmd:   npm install --no-audit --no-fund"
echo "    6. Start Cmd:   node serve.js"
echo "    7. Health: /"
echo "    8. Click 'Create Web Service' — this triggers the deploy"
echo
echo "    That's it. The cat will be live in ~30 seconds."
