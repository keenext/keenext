# KeePass Web for Nextcloud

A Nextcloud app (id `keepassweb`) for opening and editing KeePass databases (`.kdbx`) stored in Nextcloud, compatible with KeePassXC, KeePass and KeePassDX.

- Databases are decrypted in the browser. The server stores and serves the encrypted file; it never receives the master password, key files or decrypted contents.
- Clicking a `.kdbx` file in the Files app opens it here; Files' "New" menu creates databases. Inside the app, databases are opened with the Nextcloud file picker or from the list of recently opened ones, which also remembers the key file used.
- Changes made elsewhere while a database is open (KeePassXC through the desktop client, another browser tab) are merged rather than overwritten.
- KDBX 3.1 and 4.x, Argon2d/Argon2id and AES-KDF, AES-256 and ChaCha20, password and/or key file.

What is covered compared to KeePassXC, and what is not yet: [docs/features.md](docs/features.md). How the code is organised: [docs/architecture.md](docs/architecture.md).

Requires Nextcloud 33–35.

## Development

Requirements: Node 24 (`.nvmrc`), PHP 8.2+, Composer, Docker. `keepassxc-cli` is optional but needed for the compatibility tests and to regenerate fixtures.

```sh
npm ci
composer install
npm run build          # or: npm run watch
docker compose up -d   # Nextcloud 34 on http://localhost:8091, admin / admin
```

The compose file mounts the checkout as `custom_apps/keepassweb`, enables the app and copies the fixtures from `tests/fixtures` into the admin's `KeePass` folder (password `test`). `NEXTCLOUD_VERSION=35 docker compose up -d` runs another server version; `docker compose down -v` starts over.

| Command | |
|---|---|
| `npm test` | Unit and KeePassXC compatibility tests (Vitest) |
| `npm run test:e2e` | Browser tests against the compose Nextcloud (Playwright, uses the installed Chrome) |
| `npm run typecheck` / `npm run lint` | `vue-tsc`, ESLint with the Nextcloud config |
| `composer test` / `composer psalm` / `composer cs:check` | PHPUnit, Psalm, Nextcloud PHP coding standard |
| `npm run l10n` | Regenerates `l10n/*.js` from `l10n/*.json` |
| `make appstore` | Builds `build/keepassweb.tar.gz` |
| `tests/fixtures/generate.sh` | Regenerates the KeePassXC-written fixtures |

### Translations

Strings are marked with `t('keepassweb', …)` / `n('keepassweb', …)` imported from `src/l10n.ts`. `l10n/<lang>.json` holds the translations (`de` informal, `de_DE` formal); `npm test` fails when a string is missing, stale or loses a placeholder. Run `npm run l10n` after editing the JSON files.

## License

AGPL-3.0-or-later. The passphrase word list is the EFF Large Wordlist (CC BY 3.0 US), see `src/core/wordlists/`.
