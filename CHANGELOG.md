# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), the versions [Semantic Versioning](https://semver.org/). How a release is made: [docs/releasing.md](docs/releasing.md).

## [Unreleased]
### Added
- The entry list can be sorted by title, username, URL, creation or modification date or expiry, in either direction, and its second line shows the username, the URL, the modification date or nothing. The choice is kept per browser.
- Search: `_Name:` looks in the additional attribute "Name" (`_"Two words":` for names with spaces), a leading `*` makes a term a regular expression, and `is:weak`, `is:expiring`, `has:totp`, `has:attachment`, `has:tag`, `has:url`, `has:notes` and `has:passkey` filter the list.
- Entries get a text and a background color in the editor, shown as a marker in the list.
- Entries can be excluded from the health check in the editor. KeePassXC's older way of marking them is recognised too.
- Pictures of your own can be used as icons for entries and groups; they are scaled down and stored as PNG.
- Images and text files attached to an entry can be previewed.
- Passkeys saved by KeePassXC are shown with their website and username and kept unchanged.
- The database settings can measure how many Argon2 iterations take one second in this browser.
- Leaving the entry editor with changes that are not saved yet asks first: choosing another entry, a group, a new entry, another database, locking or closing it by hand. Closing the tab warns. Locking automatically after inactivity still discards them.
- CSV import reads files separated by semicolons or tabs, files in Windows encoding or UTF-16 and Excel's `sep=` line, as a German Excel saves them, and knows the columns of 1Password, LastPass, Proton Pass and German lists (Titel, Benutzername, Kennwort, Webseite, Bemerkung, Ordner …). When two columns hold the same field, such as Proton Pass' email and username, an empty one no longer overwrites the other; a second, different value is kept as an attribute.

### Changed
- Before writing, saving opens the new version once more. If it does not open, the file on the server stays as it was and an error is shown, instead of a database that can no longer be unlocked replacing it (#39). Saving takes a moment longer, about as long as unlocking.

### Fixed
- With automatic saving turned off, looking for changes made elsewhere (every 60 seconds by default and when returning to the tab) no longer saves your own changes along the way. Changes made elsewhere are still merged in; your changes are written when you save or lock.

## 0.2.0 – 2026-11-22
### Fixed
- An entry or group that another device moved (and changed on the way) no longer ends up twice after merging, which also made every later merge fail. Databases that already hold an entry or group twice are repaired when they are opened: each keeps the place it was moved to last and the content changed last, the other version goes into the entry's history.
- An entry deleted for good on one device and changed later on another is no longer lost when the two are merged; a group someone added to after its deletion stays as well. What nobody touched since the deletion still goes.
- Merging keeps custom icons that nothing uses at the moment.
- Notes and fields with Windows line breaks (CR LF) keep them when saving; before, the first save turned them into LF throughout the file.
- Databases from apps that leave out a group's search or Auto-Type setting could no longer be opened in KeePassXC after saving here ("invalid value for EnableSearching"). Missing settings are now written with KeePass' defaults, and a missing recycle bin setting as "on", which KeePassXC had read as "off".
- In databases without a recycle bin setting or without a recycle bin, deleting moves to the recycle bin (creating it if needed) instead of deleting for good.
- Deleting a group that contains the recycle bin no longer loses the group, its entries and the bin on the next save. The bin moves to the top level first, then the group goes into it.
- Unlocking with a key file of exactly 32 bytes chosen from the device works again after a first attempt with a wrong password.
- Custom field names are checked the way they are saved, without leading or trailing spaces: " PIN " no longer overwrites "PIN", and "Title " no longer the title.
- The password generator's strength with "at least one of each group" counts exactly the passwords it can make; short passwords were rated too high.
- Saving or loading that the server never answers gives up after a minute (longer for big files) instead of holding up every later save and locking. A full server says so.
- After a master password change whose confirmation from the server got lost, the next save no longer fails with "wrong password".

### Security
- Searching with wildcards (`*`) takes linear time. A pattern like `a*a*b` on an entry with long notes froze the tab for minutes; anyone with write access to a shared database could plant such an entry.

## 0.1.2 – 2026-11-22
### Security
- Tags of entries and groups are read in linear time. A tags field with a long run of spaces made opening the database freeze the browser tab for minutes; creating such a database takes write access to it, for example to a shared one.

## 0.1.1 – 2026-11-22
### Changed
- Updated the Nextcloud interface libraries: notifications appear as Nextcloud's classic toasts again, and the file picker and dialogs come with their upstream fixes.
- Updated hash-wasm, which derives the keys with Argon2, to 4.13.0. The derived keys are unchanged: checked against the previous version and, for Argon2d and Argon2id, against KeePassXC.

## 0.1.0 – 2026-11-06
### Added
- Open and edit KeePass databases (KDBX 3.1, 4.0 and 4.1) stored in Nextcloud, with Argon2d, Argon2id and AES-KDF, AES-256, ChaCha20 and Twofish, password and key file. The master password and the contents never reach the server.
- Open `.kdbx` files from the Files app and create databases from its "New" menu; a list of recently opened databases that follows renames and moves.
- Changes made elsewhere, for example with KeePassXC, are merged instead of overwritten; that includes a cipher or key derivation changed on another device. Databases shared read-only open read-only.
- Groups, search with KeePassXC's syntax, entry history, attachments, tags, favicons, drag and drop between groups.
- One-time codes (TOTP) with a QR code to show and to read, and a password and passphrase generator.
- Health check for weak, reused and expired passwords, with an optional Have I Been Pwned lookup that sends only a 5-character hash prefix.
- Import from CSV, KeePass XML, other databases and the JSON exports of Bitwarden, Passman (with attachments) and Nextcloud Passwords; export as KeePass XML or CSV.
- Database settings: master key, key derivation, cipher, recycle bin and history limits.
- Locking after inactivity, when the tab is hidden and on request; the clipboard is cleared after a delay.
- A warning before opening or importing a database whose key derivation is unusually expensive.
- English and German translations.

This is an alpha release. What is missing is listed in [docs/features.md](docs/features.md).

[Unreleased]: https://github.com/keenext/keenext/compare/v0.2.0...HEAD
