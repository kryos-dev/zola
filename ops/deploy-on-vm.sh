#!/usr/bin/env bash
# Deploy one built Zola image on this host.
#
# Runs as the forced command of the GitHub Actions deploy key, so it accepts no
# arguments beyond an optional `sha-<7 hex>` tag carried in
# SSH_ORIGINAL_COMMAND -- anything else is refused, which is what keeps the key
# from being a general-purpose shell. The workflow passes the SHA it just
# built, so what runs here is the commit that was tested, not whatever
# :latest happens to be.
#
# Rolling out a bad image is the risk this guards: the previously running image
# is restored if the new container does not report healthy.
set -euo pipefail

ROOT=/home/ubuntu/infra
IMAGE_REPO=ghcr.io/kryos-dev/zola/web
CONTAINER=zola-zola-1

tag=latest
orig="${SSH_ORIGINAL_COMMAND:-}"
if [ -n "$orig" ]; then
  case "$orig" in
    sha-*) ;;
    *) echo "refusing: expected sha-<7 hex>, got '$orig'" >&2; exit 2 ;;
  esac
  case "${orig#sha-}" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) tag="$orig" ;;
    *) echo "refusing: '$orig' is not sha-<7 hex>" >&2; exit 2 ;;
  esac
fi

dc() {
  docker compose -p zola --project-directory "$ROOT/apps/zola" --env-file "$ROOT/.env" "$@"
}

# Best effort: the app image does not depend on this checkout being current, so
# box-local drift must not abort a deploy.
git -C "$ROOT" pull --ff-only || echo "note: infra checkout not updated (continuing)"

previous="$(docker inspect -f '{{.Image}}' "$CONTAINER" 2>/dev/null || true)"

echo "pulling ${IMAGE_REPO}:${tag}"
docker pull -q "${IMAGE_REPO}:${tag}"
# The compose file names :latest, so point :latest at the image just pulled
# rather than editing the compose project.
docker tag "${IMAGE_REPO}:${tag}" "${IMAGE_REPO}:latest"

dc up -d --no-deps --force-recreate zola

healthy=no
for _ in $(seq 1 30); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
  if [ "$state" = healthy ]; then healthy=yes; break; fi
  if [ "$state" = unhealthy ]; then break; fi
  sleep 2
done

if [ "$healthy" = yes ]; then
  echo "zola is healthy on ${tag}"
  exit 0
fi

echo "zola did not become healthy on ${tag}" >&2
docker logs --tail 40 "$CONTAINER" >&2 || true

if [ -n "$previous" ]; then
  echo "rolling back to the image that was running" >&2
  docker tag "$previous" "${IMAGE_REPO}:latest"
  dc up -d --no-deps --force-recreate zola || true
fi
exit 1
