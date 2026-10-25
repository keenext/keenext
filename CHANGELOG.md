# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), the versions [Semantic Versioning](https://semver.org/). How a release is made: [docs/releasing.md](docs/releasing.md).

## [Unreleased]

## 0.1.0 – Unreleased
### Added
- Open and edit KeePass databases (KDBX 3.1, 4.0 and 4.1) stored in Nextcloud, with Argon2d, Argon2id and AES-KDF, AES-256, ChaCha20 and Twofish, password and key file. The master password and the contents never reach the server.
- Open `.kdbx` files from the Files app and create databases from its "New" menu; a list of recently opened databases that follows renames and moves.
- Changes made elsewhere, for example with KeePassXC, are merged instead of overwritten. Databases shared read-only open read-only.
- Groups, search with KeePassXC's syntax, entry history, attachments, tags, favicons, drag and drop between groups.
- One-time codes (TOTP) with a QR code to show and to read, and a password and passphrase generator.
- Health check for weak, reused and expired passwords, with an optional Have I Been Pwned lookup that sends only a 5-character hash prefix.
- Import from CSV, Bitwarden JSON, KeePass XML and other databases; export as KeePass XML or CSV.
- Database settings: master key, key derivation, cipher, recycle bin and history limits.
- Locking after inactivity, when the tab is hidden and on request; the clipboard is cleared after a delay.
- A warning before opening or importing a database whose key derivation is unusually expensive.
- English and German translations.

This is an alpha release. What is missing is listed in [docs/features.md](docs/features.md).
