# Features compared to KeePassXC

✅ available · ◐ partial · ❌ missing · 🚫 not possible in a web app

## Databases

| Feature | | Notes |
|---|---|---|
| KDBX 3.1, 4.0, 4.1 | ✅ | Unmodified files resave without differences in KeePassXC's XML export (`tests/compat`). A file is saved as 4.1 once it holds values only 4.1 stores (e.g. group tags); KDBX 3.1 keeps its AES-KDF then. |
| AES-KDF, Argon2d, Argon2id | ✅ | Argon2 v1.3 only; v1.0 was never written by KDBX 4 clients. |
| AES-256, ChaCha20, Twofish | ✅ | Twofish in the kdbxweb fork ([FORK.md](https://github.com/keenext/kdbxweb/blob/HEAD/FORK.md)), checked against KeePassXC both ways. |
| Password, key file, both | ✅ | Key file from Nextcloud or from the device. XML (`.keyx`, v1/v2), 32-byte, hex and arbitrary files. |
| YubiKey challenge-response | 🚫 | Browsers block the YubiKey OTP interface: WebHID refuses devices that report as keyboards, WebUSB refuses HID and smart card devices. Would need a native helper. Databases protected this way cannot be opened. |
| Create database | ✅ | KDBX 4, Argon2id 64 MiB, ChaCha20. |
| Change master key, KDF, cipher | ✅ | Database settings dialog. AES-KDF databases can be upgraded to Argon2id/KDBX 4. |
| Name, description, default username, recycle bin, history limits | ✅ | |
| Benchmark KDF to a target time | ✅ | Argon2 iterations for one second, measured in this browser at the chosen memory; KeePassXC derives faster. |
| Several open databases | ✅ | Listed in the navigation, each locked or unlocked on its own. |
| Autosave | ✅ | Per user setting, 1.5 s after the last change. |
| Changes made elsewhere | ✅ | Detected via ETag on save and by polling; merged, not overwritten. |
| Backup before saving | ◐ | Not done by the app; Nextcloud's file versions keep previous states. |
| Merge another database | ✅ | Import a `.kdbx`: another copy of the same database is merged, a different one is copied into a new group. |
| Import | ◐ | CSV (KeePassXC, KeePass, Bitwarden, 1Password, LastPass, Proton Pass, browsers, German column names; columns by header; comma, semicolon or tab; UTF-8 or Windows-1252), unencrypted JSON from Bitwarden, Passman (with attachments) and Nextcloud Passwords (database backup), KeePass XML, KDBX. 1Password's 1PUX and KeePass 1 (.kdb) missing. |
| Export | ◐ | KeePass XML and CSV with KeePassXC's columns, as a download. HTML missing. |
| Health check (weak, reused, expired, expiring passwords) | ✅ | Per database, from its menu. Entries can be excluded in the editor ("QualityCheck" off, KDBX 4.1); KeePassXC's older "KnownBad" flag is honoured. |
| Have I Been Pwned check | ✅ | Opt-in from the health check; k-anonymity (5-character SHA-1 prefixes), padded responses, no cookies. |

## Entries

| Feature | | Notes |
|---|---|---|
| Title, username, password, URL, notes | ✅ | |
| Additional attributes, protected attributes | ✅ | |
| Attachments | ✅ | Add, remove, download; preview of images and text files (SVG is not shown). |
| Tags | ✅ | |
| Expiry | ✅ | Expired entries are struck through. |
| History | ✅ | List, view an old version with changed fields marked, restore, delete. |
| Standard and custom icons | ✅ | Shown and selectable. Favicons are downloaded per entry (the Nextcloud server fetches them from the entry's website); own images are scaled to 128 px and stored as PNG. |
| Foreground/background colour | ✅ | Editable; shown as a marker in the list, not as row color. |
| TOTP | ✅ | KeePassXC `otp`, legacy `TOTP Seed`/`TOTP Settings`, KeePass `TimeOtp-*`; SHA-1/256/512, Steam. Setup dialog reads QR codes from images or pasted screenshots; entries show their QR code for authenticator apps. Camera scanning missing. |
| Placeholders | ◐ | `{REF:…}`, `{S:…}`, `{TITLE}` etc. Date, environment and other placeholders are not resolved. |
| Clone, move, delete to recycle bin | ✅ | Clone has no "reference username/password" options. |
| Drag and drop between groups | ✅ | Entries and groups onto groups in the tree. |
| Auto-Type | 🚫 | Settings are kept in the file. |
| Passkeys (KeePassXC) | ◐ | Shown (website, username) and kept unchanged; signing in with them needs KeePassXC. |
| Browser integration (KeePassXC-Browser) | 🚫 | |
| SSH agent | 🚫 | |

## Groups

| Feature | | Notes |
|---|---|---|
| Tree, create, edit name/notes, delete to recycle bin | ✅ | |
| Empty recycle bin, restore (by moving) | ✅ | |
| Move groups | ✅ | Not into their own subtree. |
| Group icons | ✅ | Standard and existing custom icons. |
| Searching/Auto-Type flags | ◐ | `EnableSearching` is honoured by search; not editable. |

## Search and generator

| Feature | | Notes |
|---|---|---|
| KeePassXC search syntax | ✅ | Field prefixes, `_Name:` for additional attributes, `-`/`!`, `+`, `*` wildcards, quotes, `is:expired`/`expiring`/`weak`, `has:totp`/`attachment`/`tag`/`url`/`notes`/`passkey`. |
| Regular expressions in search | ✅ | A leading `*` (`*title:^git`); an invalid expression matches nothing. |
| Sorting and column choice | ◐ | Sort by title, username, URL, dates or expiry, either direction; second line shows username, URL, modification date or nothing. Kept per browser. No table with columns. |
| Password generator | ✅ | Character groups as in KeePassXC, extended ASCII, include/exclude, look-alikes, every group. |
| Passphrases | ◐ | EFF large word list, separator, case. Custom word lists missing. |
| Password strength | ◐ | Entropy estimate; no dictionary check (KeePassXC uses zxcvbn). |

## Security behaviour

| Feature | | Notes |
|---|---|---|
| Decryption only in the browser | ✅ | The server sees encrypted files and file ids. |
| Lock after inactivity, lock when the tab is hidden, lock all | ✅ | |
| Clear clipboard after a delay | ✅ | Cleared when the page next has focus if it had none. |
| Protected values hidden until revealed | ✅ | |
| Unapplied edits | ✅ | Choosing another entry, a new entry, another database, locking or closing by hand asks first, closing the tab warns. Automatic locking discards them. |

## Nextcloud integration

| Feature | | Notes |
|---|---|---|
| Open `.kdbx` from the Files app | ✅ | Default action. |
| "New KeePass database" in the Files "New" menu | ✅ | |
| File picker, recently opened list | ✅ | Follows renames and moves; remembers the key file per database. |
| Read-only shares | ✅ | Opened read-only; editing actions and shortcuts are disabled. |
| Public link shares | ❌ | |
| Own file type icon for `.kdbx` | ✅ | Delivered as a preview (`lib/Preview/KdbxIconProvider.php`); the generic icon remains where previews are disabled. |
| Translations | ◐ | English, German (`de`, `de_DE`). |
