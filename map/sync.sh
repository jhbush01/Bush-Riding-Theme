#!/usr/bin/env bash
#
# Sync this map/ folder up to the standalone `bush-riding-map` repo that
# Cloudflare Pages deploys. The map app lives in map/ inside the theme repo
# (where it's developed); this script lifts map/ to the ROOT of a separate
# repo's `main` branch so Pages can serve it as a static site.
#
# Run from anywhere inside a clone of the theme repo, on the branch that has
# your latest map/ changes:
#
#     map/sync.sh
#
# Optional: pass a different target repo URL as the first argument.
#
set -euo pipefail

TARGET_REPO="${1:-https://github.com/jhbush01/bush-riding-map.git}"
SPLIT_BRANCH="map-standalone"

# Run from the repo root regardless of where this is invoked.
cd "$(git rev-parse --show-toplevel)"

echo "Splitting map/ into a root-level history…"
git branch -D "$SPLIT_BRANCH" 2>/dev/null || true
git subtree split --prefix=map -b "$SPLIT_BRANCH"

echo "Pushing to $TARGET_REPO (main)…"
# First push to an empty repo fast-forwards. If a later push is rejected
# because the histories diverged, re-run with: git push --force ... below.
git push "$TARGET_REPO" "$SPLIT_BRANCH:main"

git branch -D "$SPLIT_BRANCH" >/dev/null 2>&1 || true
echo "Done — map/ is now the root of $TARGET_REPO@main. Cloudflare Pages will redeploy."
