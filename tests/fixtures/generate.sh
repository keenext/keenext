#!/usr/bin/env bash
# Regenerates the KeePassXC-written fixtures from source.xml.
# Requires keepassxc-cli. All databases use the password "test".
set -euo pipefail
cd "$(dirname "$0")"

rm -f keepassxc-*.kdbx keepassxc-*.keyx

printf 'test\ntest\n' | keepassxc-cli import -q -p -t 100 source.xml keepassxc-password.kdbx

keepassxc-cli db-create -q --set-key-file keepassxc-keyfile.keyx keepassxc-keyfile-only.kdbx
printf 'test\ntest\n' | keepassxc-cli db-create -q -p -t 100 --set-key-file keepassxc-keyfile.keyx keepassxc-password-keyfile.kdbx
printf 'test\n' | keepassxc-cli add -q -k keepassxc-keyfile.keyx -u someone --url https://example.org keepassxc-password-keyfile.kdbx "Keyfile entry"

keepassxc-cli add -q --no-password -k keepassxc-keyfile.keyx -u nobody keepassxc-keyfile-only.kdbx "Keyfile only entry"
printf 'test\n' | keepassxc-cli db-info -q keepassxc-password.kdbx >/dev/null

node make-argon2-base.mjs keepassxc-argon2id-chacha20.kdbx
printf 'test\n' | keepassxc-cli merge -q -s keepassxc-argon2id-chacha20.kdbx keepassxc-password.kdbx
printf 'test\n' | keepassxc-cli db-info -q keepassxc-argon2id-chacha20.kdbx | grep -E 'KDF|Verschl|Encryption'
