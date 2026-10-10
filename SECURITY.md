# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Security → Report a vulnerability** on this repository, not as a public issue. Include the KeeNext and Nextcloud versions, the browser, and steps or a file that reproduces the problem.

## Scope

KeeNext decrypts `.kdbx` files in the browser; the Nextcloud server stores and serves the encrypted file and never receives the master password, key files or decrypted contents. Reports are in scope when they break that property or when they concern:

- parsing of untrusted KDBX files (header, inner header, XML), including key derivation parameters
- key and secret handling in the browser (clipboard, memory, export, logs)
- the PHP endpoints in `lib/`, which must stay free of database contents
- the requests the app makes to third parties: `api.pwnedpasswords.com` (opt-in, 5-character SHA-1 prefixes) and favicon downloads performed by the Nextcloud server

Out of scope: weaknesses in Nextcloud itself, in a browser, or on a device that is already compromised.

## Status

KeeNext has not been independently audited. Keep a backup of every database you open with it; Nextcloud's file versions are not a substitute.
