#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# 🚀 ANNABELLE-CATGAME bootstrap
# Creates the GitHub repo under ABBYCRM, pushes the project, and reports
# the URLs for the Render deploy step (which is triggered manually from
# Render's side per the standing rule).
#
# Requires env vars:
#   GH_TOKEN   — GitHub PAT with `repo` scope (write)
#   RND_TOKEN  — Render API key (read is enough for the link below)
# ----------------------------------------------------------------------------
set -euo pipefail

REPO_NAME="ANNABELLE-CATGAME"
ORG="ABBYCRM"
BRANCH="2026-07-25__methodical-notes__initial-cat-runner-game"

: "${GH_TOKEN:?Set GH_TOKEN to a GitHub PAT with repo:write scope}"
: "${RND_TOKEN:?Set RND_TOKEN to your Render API key}"

echo "==> 1/4  checking GitHub auth"
GH_USER=$(curl -sS -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user | grep -oE '"login"\s*:\s*"[^"]+"' | head -1 | cut -d'"' -f4)
echo "    authenticated as: $GH_USER"

echo "==> 2/4  ensuring repo $ORG/$REPO_NAME exists"
if curl -sS -f -H "Authorization: Bearer $GH_TOKEN" \
        "https://api.github.com/repos/$ORG/$REPO_NAME" >/dev/null; then
  echo "    repo already exists — using it"
else
  curl -sS -X POST -H "Authorization: Bearer $GH_TOKEN" \
       -H "Accept: application/vnd.github+json" \
       -H "Content-Type: application/json" \
       "https://api.github.com/user/repos" \
       -d "{\"name\":\"$REPO_NAME\",\"description\":\"🐱 Annabelle's Cat Runner — fun 2D browser game, kid-readable code\",\"private\":false,\"auto_init\":true}" \
       | grep -oE '"html_url"\s*:\s*"[^"]+"' | head -1
  echo "    repo created"
fi

echo "==> 3/4  pushing branch $BRANCH"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:$GH_TOKEN@github.com/$ORG/$REPO_NAME.git"
git push -u origin "$BRANCH" --force
git push -u origin main --force 2>/dev/null || echo "    (no main branch yet — that's fine)"

echo "==> 4/4  done"
echo "    GitHub:  https://github.com/$ORG/$REPO_NAME"
echo
echo "==> NEXT (manual from Render side):"
echo "    1. Go to https://dashboard.render.com/"
echo "    2. New + → Static Site → Connect $ORG/$REPO_NAME"
echo "    3. Branch: $BRANCH"
echo "    4. Publish directory: ."
echo "    5. Add rewrite rule: source '/*' → destination '/index.html'"
echo "    6. Click 'Create Web Service' — this triggers the deploy"
echo
echo "    That's it. The cat will be live in ~30 seconds."
