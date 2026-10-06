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

# Settings keepassxc-cli cannot choose: start from a file written by kdbxweb, let KeePassXC merge
# the rich fixture into it and write it back. KeePassXC opening the base file also checks kdbxweb's encryption.
make_from_base() {
	local file=$1
	shift
	node make-base.mjs "$file" "$@"
	printf 'test\n' | keepassxc-cli merge -q -s "$file" keepassxc-password.kdbx
	printf 'test\n' | keepassxc-cli db-info -q "$file" | grep -E 'KDF|Verschl|Encryption'
}
make_from_base keepassxc-argon2id-chacha20.kdbx chacha20 4
make_from_base keepassxc-argon2id-twofish.kdbx twofish 4
make_from_base keepassxc-aeskdf-twofish.kdbx twofish 3
