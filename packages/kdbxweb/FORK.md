# kdbxweb fork

Fork of [keeweb/kdbxweb](https://github.com/keeweb/kdbxweb) (MIT, see `LICENSE`) used by KeeNext.

Base: upstream `master` at `7601e45d2a437f35a7fa3d767164eab60bc05d42` (2024-12-23, after release 2.1.1; adds the `DriveWindows` icon fix and build tooling). The repository history has the unmodified import as its own commit, so `git diff <import commit> -- packages/kdbxweb` shows every change listed here.

## Changes to `lib/`

| Change | Files | Why |
|---|---|---|
| Twofish-256-CBC (PKCS#7) as third data cipher, `CipherId.Twofish` | `crypto/twofish.ts` (new), `crypto/crypto-engine.ts`, `format/kdbx-format.ts`, `defs/consts.ts` | KeePassXC, KeePassDX and KeePass (plugin) offer Twofish; such files could not be opened. |
| WebCrypto only: removed the Node `crypto`/`Buffer` fallbacks for SHA, HMAC, AES and random | `crypto/crypto-engine.ts`, `utils/byte-utils.ts` | WebCrypto, `atob`/`btoa` are global in all browsers and Node ≥ 19. One code path to review instead of two; no `import 'crypto'` to stub in bundles. |
| No built-in `@xmldom/xmldom`; `DOMParser`/`XMLSerializer` come from `globalThis` | `utils/xml-utils.ts` | The bundled xmldom 0.8 had open advisories and was only reachable in Node. Node users install a DOM implementation themselves (`test/setup.ts`). |
| `KdbxBinaries.computeHashes` keeps file order | `format/kdbx-binaries.ts` | Hashes resolved in arbitrary order with WebCrypto, so the binary pool (and the order of attachments in saved files) changed between saves. |
| Explicit `ArrayBuffer` conversions where `Uint8Array`s were passed as `ArrayBuffer` | `format/kdbx-header.ts`, `format/kdbx-uuid.ts`, `format/kdbx-credentials.ts`, `format/kdbx-format.ts`, `crypto/key-encryptor-kdf.ts`, `crypto/protected-value.ts`, `utils/byte-utils.ts` | Older TypeScript accepted this; TypeScript ≥ 5.7 does not. `KdbxUuid.toBytes()` now really returns an `ArrayBuffer` as declared. `ProtectedValue.clone()` copies explicitly. |
| Type-only names exported with `export type` | `index.ts` | Per-file transpilers (Vite, Vitest) otherwise emit exports that are `undefined` at runtime. |
| Reads past the end of a `BinaryStream` throw `FileCorrupt` | `utils/binary-stream.ts` | Upstream shortens such reads silently or throws `RangeError`; parsers of the header, inner header, `VarDictionary` and block streams now get exactly the announced number of bytes or a `KdbxError`. |
| Header: unknown field ids are skipped; compression flags, transform rounds, inner random stream id and inner-header binaries are length-checked | `format/kdbx-header.ts` | Upstream crashes with `TypeError` on unknown ids; KeePass and KeePassXC skip them. |
| Encryption IV length checked per cipher (AES and Twofish 16 bytes, ChaCha20 12); ChaCha20 gets a 12-byte IV in KDBX 3 as well | `format/kdbx-format.ts`, `format/kdbx-header.ts` | Upstream writes a 16-byte IV for ChaCha20 in KDBX 3, which KeePassXC rejects. |
| The HMAC of the empty final block of the KDBX 4 block stream is verified | `crypto/hmac-block-transform.ts` | Upstream accepts a stream cut at a block boundary followed by a forged final block. |
| Tabs survive XML parsing | `utils/xml-utils.ts` | Upstream's control-character filter removes tabs from all unprotected fields. |
| Binary dates after 9999-12-31 are clamped to it; unparsable text dates and binary dates shorter than 8 bytes read as absent | `utils/xml-utils.ts` | KeePassDX writes dates far beyond; upstream throws `too large number` and the file does not open (upstream issue #48). |
| KDBX 4.1 `LastModificationTime` of custom data and custom icons is written in binary | `format/kdbx-custom-data.ts`, `format/kdbx-meta.ts` | Upstream writes ISO text, which KeePass rejects (upstream issue #49, PR #62). |
| An attachment whose binary is missing from the pool is skipped; the entry's other attachments are written | `format/kdbx-entry.ts` | Upstream drops every attachment after the missing one. |
| `createRandomKeyFile` takes its key from `CryptoEngine.random` alone | `format/kdbx-credentials.ts` | Upstream mixes in `Math.random()`. |
| Saving raises KDBX 4.0 to 4.1 when the database holds values only 4.1 stores: group tags, a disabled quality check, a previous parent group, custom icon names or times, custom data times (`Kdbx.hasKdbx41Values`) | `format/kdbx.ts`, `format/kdbx-format.ts` | Upstream drops these values from 4.0 files. KeePassXC raises files to 4.1 for the same values; KDBX 3.1 files stay 3.1. |
| Key files: XML whose root is not `KeyFile`, and `KeyFile` documents without key data, are hashed as a whole | `format/kdbx-credentials.ts` | Upstream rejects them; KeePassXC hashes them, so databases created there with e.g. an SVG as key file did not open. |
| `KdbxEntry.copyFrom` also copies custom data, quality check and previous parent group; `KdbxGroup.copyFrom` also copies tags, custom data and previous parent group; `importEntry` clears the previous parent group | `format/kdbx-entry.ts`, `format/kdbx-group.ts`, `format/kdbx-custom-data.ts`, `format/kdbx.ts` | Merge, history snapshots and `importEntry` copy through `copyFrom`; upstream loses these properties there, e.g. KeePassXC's browser settings in entry custom data on every sync merge. |

## Changes to `test/`

- Run with Vitest (`npm test` in this folder) instead of mocha; `test/setup.ts` maps mocha's `before`/`after` and installs xmldom 0.9 as the DOM.
- Tests of the removed Node fallbacks and the subtle mock are gone; `CryptoEngine.argon2` is set through `setArgon2Impl` (ES module exports are read-only).
- Argon2 in tests uses hash-wasm instead of upstream's prebuilt emscripten blob.
- Resources are read with `fs`; `KdbxUuid` byte assertions compare byte values.
- New: `test/crypto/twofish.spec.ts` (known-answer tests from the Twofish submission, CBC round trips, wrong-key handling). Interoperability with KeePassXC is covered by the app's `tests/compat` (files written by KeePassXC with Twofish, and files written here, opened by KeePassXC).
- Each `lib/` change in the table above has a regression test next to the tests of the file it changes; `kdbx.spec.ts` covers the ones that need a save and load (attachments, tabs, KDBX 4.1 times and values, IV length, import), `kdbx.merge.spec.ts` the merge of custom data and tags. The app's `tests/compat` checks the KDBX 4.1 values and the hashed key files against KeePassXC.
- `kdbx-entry.spec.ts` and `kdbx-group.spec.ts` check that `copyFrom` copies every own property of a fresh instance except an explicit list; a property added to the class fails there until the test populates it.
- Two upstream tests expected the lenient `BinaryStream`: `binary-stream.spec.ts` reads zero bytes at the end instead of five, and the bad-compression test in `kdbx-header.spec.ts` uses a complete 4-byte field.

## Build

`npm run build` writes an ESM bundle to `dist/index.js` (for Node scripts) and type declarations to `dist/types`. The app bundles `lib/` from source.

## Notes for a security review

- Untrusted input: the whole KDBX file (header fields, inner header, XML). Parsing entry points: `format/kdbx-format.ts` (`load`), `format/kdbx-header.ts`, `utils/var-dictionary.ts`, `utils/xml-utils.ts`.
- Key handling: `format/kdbx-credentials.ts`, `crypto/key-encryptor-*.ts`, `crypto/protected-value.ts` (XOR-masked in-memory values, not encryption).
- Integrity: KDBX 4 header HMAC and HMAC block stream (`crypto/hmac-block-transform.ts`); KDBX 3 relies on stream start bytes and the hashed block stream.
- KDF parameters (AES-KDF rounds, Argon2 memory, iterations, parallelism) come from the file without upper bounds and run before the key can be verified; limits and cancellation belong to the application.
- Not changed from upstream and worth reviewing first: the XML handling of protected values (`XmlUtils.setProtectedValue`/`getProtectedText`), ChaCha20/Salsa20 implementations, the CRDT logic of `merge` (`KdbxGroup.mergeCollection`, `KdbxEntry.mergeHistory`).
