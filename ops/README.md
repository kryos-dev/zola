# Deployment

The `web` workflow builds the ARM64 image, then deploys it: `deploy-on-vm.sh`
runs on the box as the forced command of a restricted key, so CI can roll out
an image without holding a general-purpose shell.

One-time setup (run on the VM as `ubuntu`), with a key generated for this
purpose and stored as the `ZOLA_DEPLOY_KEY` repository secret:

~~~
ssh-keygen -t ed25519 -N '' -C github-actions-zola-deploy -f /tmp/zola-deploy-key
bash ops/install-deploy-access.sh "$(cat /tmp/zola-deploy-key.pub)"
gh secret set ZOLA_DEPLOY_KEY --repo kryos-dev/zola < /tmp/zola-deploy-key
~~~

What the deploy does: pulls `ghcr.io/kryos-dev/zola/web:sha-<short>` for the
commit the run built, points `:latest` at it (the compose file names that tag),
recreates only the `zola` container, and waits for its healthcheck. If the new
container does not report healthy, it restores the image that was running
before and exits non-zero, so the run goes red instead of leaving a dead chat.
