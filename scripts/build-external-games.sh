#!/usr/bin/env bash
# Builds the games that live in their own repositories and drops them into
# dist/ at their site paths. Run after `npm run build` (the deploy workflow
# does this automatically).
#
#   JTstacky/Arcane-Arena       -> dist/arcane-arena/
#   JTstacky/Hammerguy-s-Party  -> dist/hammerguys-party/
set -euo pipefail

GAMES=(
  "JTstacky/Arcane-Arena:arcane-arena"
  "JTstacky/Hammerguy-s-Party:hammerguys-party"
)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for spec in "${GAMES[@]}"; do
  repo="${spec%%:*}"
  path="${spec##*:}"
  echo "==> $repo -> dist/$path/"
  git clone --quiet --depth 1 "https://github.com/$repo.git" "$work/$path"
  (cd "$work/$path" && npm ci --no-audit --no-fund && npm run build)
  rm -rf "dist/$path"
  cp -r "$work/$path/dist" "dist/$path"
done
