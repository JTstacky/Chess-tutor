#!/usr/bin/env bash
# Refreshes the games that are developed in their own repositories: builds
# each one and copies the result into public/<path>/, the same way Beast
# Binder and Revenge of the Demon Dragon are included. Commit the result.
#
#   scripts/update-games.sh                 # both games
#   scripts/update-games.sh arcane-arena    # just one
#
#   JTstacky/Arcane-Arena       -> public/arcane-arena/
#   JTstacky/Hammerguy-s-Party  -> public/hammerguys-party/
set -euo pipefail
cd "$(dirname "$0")/.."

GAMES=(
  "JTstacky/Arcane-Arena:arcane-arena"
  "JTstacky/Hammerguy-s-Party:hammerguys-party"
)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for spec in "${GAMES[@]}"; do
  repo="${spec%%:*}"
  path="${spec##*:}"
  if [ $# -gt 0 ] && [[ " $* " != *" $path "* ]]; then continue; fi
  echo "==> $repo -> public/$path/"
  git clone --quiet --depth 1 "https://github.com/$repo.git" "$work/$path"
  (cd "$work/$path" && npm ci --no-audit --no-fund && npm run build)
  rm -rf "public/$path"
  cp -r "$work/$path/dist" "public/$path"
done
