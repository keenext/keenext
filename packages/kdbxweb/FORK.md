# kdbxweb fork

Fork of [keeweb/kdbxweb](https://github.com/keeweb/kdbxweb) (MIT, see `LICENSE`) used by NextKeeWeb.

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

## Changes to `test/`

- Run with Vitest (`npm test` in this folder) instead of mocha; `test/setup.ts` maps mocha's `before`/`after` and installs xmldom 0.9 as the DOM.
- Tests of the removed Node fallbacks and the subtle mock are gone; `CryptoEngine.argon2` is set through `setArgon2Impl` (ES module exports are read-only).
- Argon2 in tests uses hash-wasm instead of upstream's prebuilt emscripten blob.
- Resources are read with `fs`; `KdbxUuid` byte assertions compare byte values.
- New: `test/crypto/twofish.spec.ts` (known-answer tests from the Twofish submission, CBC round trips, wrong-key handling). Interoperability with KeePassXC is covered by the app's `tests/compat` (files written by KeePassXC with Twofish, and files written here, opened by KeePassXC).

## Build

`npm run build` writes an ESM bundle to `dist/index.js` (for Node scripts) and type declarations to `dist/types`. The app bundles `lib/` from source.

## Notes for a security review

- Untrusted input: the whole KDBX file (header fields, inner header, XML). Parsing entry points: `format/kdbx-format.ts` (`load`), `format/kdbx-header.ts`, `utils/var-dictionary.ts`, `utils/xml-utils.ts`.
- Key handling: `format/kdbx-credentials.ts`, `crypto/key-encryptor-*.ts`, `crypto/protected-value.ts` (XOR-masked in-memory values, not encryption).
- Integrity: KDBX 4 header HMAC and HMAC block stream (`crypto/hmac-block-transform.ts`); KDBX 3 relies on stream start bytes and the hashed block stream.
- `KdbxCredentials.createRandomKeyFile` mixes `Math.random()` into CSPRNG output; harmless for strength (XOR with random bytes) but worth a look.
- Not changed from upstream and worth reviewing first: the XML handling of protected values (`XmlUtils.setProtectedValue`/`getProtectedText`), ChaCha20/Salsa20 implementations, `merge`.
