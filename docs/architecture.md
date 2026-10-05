# Architecture

## Layers

```
src/core/        KeePass logic on top of kdbxweb. No Vue, no Nextcloud; runs in Node for tests.
src/services/    Browser and Nextcloud adapters: WebDAV storage, OCS API, file picker, clipboard, Argon2 worker.
src/stores/      Pinia: open databases (vault.ts) and user settings.
src/components/  Vue 3 / @nextcloud/vue 9 views.
src/init.ts      Separate entry loaded into the Files app: default action for .kdbx, "New KeePass database".
lib/             PHP: page, metadata API (recent files, file lookup by id, settings). Never sees database contents.
```

Dependencies point downwards only: components → stores → services → core. Anything that can be expressed without the browser belongs in `core/` and gets a test there.

## Opening and saving

A database is addressed by its Nextcloud **file id**, not by path. `NextcloudFileStorage` (services/webdav.ts) resolves the current path through `GET /ocs/v2.php/apps/keepassweb/api/v1/files/{id}` before every read, so renaming or moving an open database does not break saving.

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

kdbxweb uses WebCrypto for AES, SHA and HMAC and its own ChaCha20. Argon2 comes from hash-wasm (WebAssembly), installed into kdbxweb by `core/crypto.ts`. In the browser it runs in a module worker (`workers/argon2.worker.ts`), which imports only `core/argon2.ts` to stay small. The page's CSP allows `wasm-unsafe-eval` and same-origin workers (PageController).

kdbxweb references Node's `crypto` and `@xmldom/xmldom` but only uses them when WebCrypto or `DOMParser` are missing. The Vite config replaces both with an empty module, so neither ends up in the bundle; xmldom is only used by the Node test runs.

## Data from the file is untrusted

A database may come from someone else (shared folder). Entry URLs become links only through `openableUrl()` (core/urls.ts), which allows web, mail and similar schemes and rejects `javascript:`, `data:`, `cmd://` and the like. Nothing is rendered with `v-html`. Placeholders (`{REF:…}`, `{S:…}`) are resolved with a depth limit.

## Backend

- `ApiController` (OCS): `files/{id}` (path, etag, writable), `recent` (list/touch/remove/clear), `settings`.
- `RecentFilesService` stores file ids (and optionally the key file's id, never its content) in the user config and resolves them on read; entries for files that are gone are dropped.
- `SettingsService::SCHEMA` is the single definition of user settings; values are validated and clamped there. `src/services/api.ts` mirrors the defaults for the client.
- `LoadFilesIntegration` adds `js/keepassweb-init.mjs` to the Files app.

## Tests

- `tests/core`: unit tests of the core layer (Vitest, Node).
- `tests/compat`: kdbxweb against KeePassXC-written files, checked with `keepassxc-cli`. The fixture source is `tests/fixtures/source.xml`.
- `tests/l10n.spec.ts`: translations complete and consistent.
- `tests/php`: PHPUnit for the services.
- `tests/e2e`: Playwright against the compose Nextcloud, including edits made with `keepassxc-cli` while the database is open in the browser.
