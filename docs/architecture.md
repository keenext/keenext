# Architecture

## Layers

```
packages/kdbxweb/ Our fork of kdbxweb (KDBX format and crypto), see its FORK.md.
src/core/        KeePass logic on top of kdbxweb. No Vue, no Nextcloud; runs in Node for tests.
src/services/    Browser and Nextcloud adapters: WebDAV storage, OCS API, file picker, clipboard, Argon2 worker.
src/stores/      Pinia: open databases (vault.ts) and user settings.
src/components/  Vue 3 / @nextcloud/vue 9 views.
src/init.ts      Separate entry loaded into the Files app: default action for .kdbx, "New KeePass database".
lib/             PHP: page, metadata API (recent files, file lookup by id, settings). Never sees database contents.
```

Dependencies point downwards only: components → stores → services → core. Anything that can be expressed without the browser belongs in `core/` and gets a test there.

## Opening and saving

A database is addressed by its Nextcloud **file id**, not by path. `NextcloudFileStorage` (services/webdav.ts) resolves the current path through `GET /ocs/v2.php/apps/keenext/api/v1/files/{id}` before every read, so renaming or moving an open database does not break saving.

`DatabaseSession` (core/session.ts) owns the open `Kdbx` and its storage and is the only place that writes:

- `save()` writes with `If-Match: <etag>`. A `412` (or `404` after a move) becomes `ConflictError`; the session then reads the current file, merges it into the local database with kdbxweb's `merge` (CRDT over entries, groups, history and deleted objects) and retries.
- `sync()` checks for a newer version. Without local changes the remote copy replaces the local one; with local changes it is merged and pushed.
- Saves and syncs are serialised through one promise queue.
- After a master key change the file on the server still has the old key until the next successful save; the session keeps those credentials separately for reading the remote copy.

The vault store drives the session: autosave 1.5 s after the last change, `sync()` on an interval, when the tab becomes visible and on demand.

## Reactivity

kdbxweb objects are mutated in place and are not reactive. Rules that keep the UI consistent:

- `OpenDatabase.session` is `markRaw`; Vue never proxies kdbxweb objects. Anything handed to kdbxweb from a reactive draft goes through `toRaw` first (see `EntryEditor.plainDraft`).
- Every mutation goes through `vault.change(id, db => …)`. It bumps `session.revision`, which is mirrored into the reactive `OpenDatabase.revision`.
- Views read the database through `useDatabaseView()`, a computed that returns a new object per revision, so dependent computeds re-run after each change.
- Selections are stored as UUID strings and resolved on every render, because a sync may replace the `Kdbx` instance.

Entries are edited as plain `EntryDraft` copies (core/entries.ts). `applyDraft` writes back only if something changed, pushes the previous state into the entry's history and trims history to the database limits, which is what KeePassXC does.

## Crypto

kdbxweb (the fork in `packages/kdbxweb`) uses WebCrypto for AES, SHA and HMAC and its own ChaCha20 and Twofish. Argon2 comes from hash-wasm (WebAssembly), installed into kdbxweb by `core/crypto.ts`. In the browser each derivation runs in its own module worker (`workers/argon2.worker.ts`, which imports only `core/argon2.ts` to stay small); the worker is terminated afterwards, which also frees its WebAssembly memory. Cancelling an unlock aborts the `AbortSignal` passed to `Kdbx.load`: that terminates the Argon2 worker, and AES-KDF stops at its next chunk of rounds. The page's CSP allows `wasm-unsafe-eval`, same-origin workers and, for the opt-in breach check, `api.pwnedpasswords.com` (PageController).

The fork has no Node fallbacks: it needs WebCrypto and a global `DOMParser`/`XMLSerializer`, which browsers provide and the Node test setups (`tests/setup.ts`, `packages/kdbxweb/test/setup.ts`) install from `@xmldom/xmldom`. Vite and Vitest compile the fork from `packages/kdbxweb/lib`; its `dist/` build serves Node scripts and type declarations (`npm install` builds it).

## Data from the file is untrusted

A database may come from someone else (shared folder). Entry URLs become links only through `openableUrl()` (core/urls.ts), which allows web, mail and similar schemes and rejects `javascript:`, `data:`, `cmd://` and the like. Nothing is rendered with `v-html`. Placeholders (`{REF:…}`, `{S:…}`) are resolved with a depth limit.

The key derivation settings come from the file and run before the key can be checked, so anyone who can write the file could make unlocking or a background sync run for hours. `openDatabase` (core/database.ts) reads them from the header first and throws `CostlyKdfError` above `DEFAULT_KDF_LIMITS` (AES-KDF rounds; Argon2 memory × iterations). The unlock view and the import dialog show the settings (`CostlyKdfWarning`) and continue only after confirmation; the session then accepts remote versions up to what was confirmed or what the local database itself uses.

## Backend

- `ApiController` (OCS): `files/{id}` (path, etag, writable), `recent` (list/touch/remove/clear), `settings`.
- `RecentFilesService` stores file ids (and optionally the key file's id, never its content) in the user config and resolves them on read; entries for files that are gone are dropped.
- `SettingsService::SCHEMA` is the single definition of user settings; values are validated and clamped there. `src/services/api.ts` mirrors the defaults for the client.
- `LoadFilesIntegration` adds `js/keenext-init.mjs` to the Files app.

## Tests

- `tests/core`: unit tests of the core layer (Vitest, Node).
- `tests/services`: services that can run without a browser, e.g. the Argon2 worker lifecycle against a stand-in `Worker`.
- `tests/compat`: kdbxweb against KeePassXC-written files, checked with `keepassxc-cli`: unmodified saves, edits, cipher changes, CSV/XML export and import. The fixture source is `tests/fixtures/source.xml`; `generate.sh` builds the files.
- `packages/kdbxweb/test`: upstream's suite plus the fork's tests (FORK.md).
- `tests/l10n.spec.ts`: translations complete and consistent.
- `tests/php`: PHPUnit for the services.
- `tests/e2e`: Playwright against the compose Nextcloud, including edits made with `keepassxc-cli` while the database is open in the browser.
