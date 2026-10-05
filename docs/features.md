# Features compared to KeePassXC

✅ available · ◐ partial · ❌ missing · 🚫 not possible in a web app

## Databases

| Feature | | Notes |
|---|---|---|
| KDBX 3.1, 4.0, 4.1 | ✅ | Unmodified files resave without differences in KeePassXC's XML export (`tests/compat`). |
| AES-KDF, Argon2d, Argon2id | ✅ | Argon2 v1.3 only; v1.0 was never written by KDBX 4 clients. |
| AES-256, ChaCha20 | ✅ | |
| Twofish | ❌ | Not implemented in kdbxweb; such files are reported as unsupported. Needs a cipher implementation added to kdbxweb. |
| Password, key file, both | ✅ | Key file from Nextcloud or from the device. XML (`.keyx`, v1/v2), 32-byte, hex and arbitrary files. |
| YubiKey challenge-response | ❌ | Would need WebHID access to the OTP interface; kdbxweb accepts a challenge-response function. |
| Create database | ✅ | KDBX 4, Argon2id 64 MiB, ChaCha20. |
| Change master key, KDF, cipher | ✅ | Database settings dialog. AES-KDF databases can be upgraded to Argon2id/KDBX 4. |
| Name, description, default username, recycle bin, history limits | ✅ | |
| Benchmark KDF to a target time | ❌ | Iterations are entered manually. |
| Several open databases | ✅ | Listed in the navigation, each locked or unlocked on its own. |
| Autosave | ✅ | Per user setting, 1.5 s after the last change. |
| Changes made elsewhere | ✅ | Detected via ETag on save and by polling; merged, not overwritten. |
| Backup before saving | ◐ | Not done by the app; Nextcloud's file versions keep previous states. |
| Merge another database | ❌ | The merge itself exists (used for conflicts); no UI to pick a second file. |
| Import (CSV, 1Password, Bitwarden, KeePass 1) / Export (CSV, XML, HTML) | ❌ | |
| Health check (weak, reused, expired, expiring passwords) | ✅ | Per database, from its menu. Entries with "QualityCheck" off are skipped. |
| Have I Been Pwned check | ❌ | |

## Entries

| Feature | | Notes |
|---|---|---|
| Title, username, password, URL, notes | ✅ | |
| Additional attributes, protected attributes | ✅ | |
| Attachments | ◐ | Add, remove, download. No preview. |
| Tags | ✅ | |
| Expiry | ✅ | Expired entries are struck through. |
| History | ✅ | List, view an old version with changed fields marked, restore, delete. |
| Standard and custom icons | ◐ | Shown and selectable. Uploading new custom icons and favicon download missing. |
| Foreground/background colour | ◐ | Kept in the file; not shown or editable. |
| TOTP | ◐ | KeePassXC `otp`, legacy `TOTP Seed`/`TOTP Settings`, KeePass `TimeOtp-*`; SHA-1/256/512, Steam. Setup dialog. QR code display and scanning missing. |
| Placeholders | ◐ | `{REF:…}`, `{S:…}`, `{TITLE}` etc. Date, environment and other placeholders are not resolved. |
| Clone, move, delete to recycle bin | ✅ | Clone has no "reference username/password" options. |
| Drag and drop between groups | ✅ | Entries and groups onto groups in the tree. |
| Auto-Type | 🚫 | Settings are kept in the file. |
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
| KeePassXC search syntax | ✅ | Field prefixes, `-`/`!`, `+`, `*`, quotes, `is:expired`. |
| Regular expressions in search | ❌ | |
| Sorting and column choice | ❌ | List is sorted by title. |
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

## Nextcloud integration

| Feature | | Notes |
|---|---|---|
| Open `.kdbx` from the Files app | ✅ | Default action. |
| "New KeePass database" in the Files "New" menu | ✅ | |
| File picker, recently opened list | ✅ | Follows renames and moves; remembers the key file per database. |
| Read-only shares | ✅ | Opened read-only. |
| Public link shares | ❌ | |
| Own file type icon for `.kdbx` | ❌ | Files shows the generic icon. |
| Translations | ◐ | English, German (`de`, `de_DE`). |
