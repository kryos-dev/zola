#!/usr/bin/env bash
# Run once on the CLOUD9 VM as ubuntu, passing the restricted Actions public
# key. Installs the deploy script and locks the key down to it.
set -euo pipefail

pub=${1:-}
[[ "$pub" == ssh-ed25519\ * ]] || { echo 'expected an ssh-ed25519 public key' >&2; exit 2; }
[[ "$(id -un)" == ubuntu ]] || { echo 'run as ubuntu' >&2; exit 2; }
base=$(cd "$(dirname "$0")" && pwd)

sudo install -o root -g root -m 0755 "$base/deploy-on-vm.sh" /usr/local/bin/zola-deploy

ssh_dir=/home/ubuntu/.ssh
install -d -o ubuntu -g ubuntu -m 0700 "$ssh_dir"
authorized="$ssh_dir/authorized_keys"
touch "$authorized"
chown ubuntu:ubuntu "$authorized"
chmod 0600 "$authorized"
key=${pub#ssh-ed25519 }
keydata=${key%% *}
if ! grep -Fq "$keydata" "$authorized"; then
  printf 'command="/usr/local/bin/zola-deploy",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty %s\n' "$pub" >> "$authorized"
fi
chown ubuntu:ubuntu "$authorized"
chmod 0600 "$authorized"
printf 'Restricted Zola deploy key installed for %s\n' "${keydata:0:16}..."
