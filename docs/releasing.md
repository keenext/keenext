# Versions and releases

## Versioning

KeeNext uses [Semantic Versioning](https://semver.org/). While the major version is 0, a minor version may change behaviour or the file handling and a patch version only fixes things. The App Store treats a `-suffix` as a pre-release, so alpha status is stated in the summary and description, not in the version number.

The version lives in `appinfo/info.xml`, `package.json` and `package-lock.json`; `tests/version.spec.ts` fails when they differ from each other or from the newest heading in `CHANGELOG.md`.

Not every commit is a release. Only a tagged commit on `main` is, and the tag `vX.Y.Z` is the one source of what was shipped: the GitHub release, the App Store entry and the signed tarball all point at it. Versions are never reused or moved; a faulty release gets a new patch version.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with one deviation: release headings are `## X.Y.Z – YYYY-MM-DD` without brackets, because the App Store reads the changelog of a release from a heading that starts with the version number. The shipped app contains the file.

- User-visible changes go under `## [Unreleased]` in the same pull request that makes them, grouped as Added, Changed, Deprecated, Removed, Fixed or Security.
- Internal changes (tests, CI, refactoring, dependency bumps) are left out.
- A change that affects how data is handled, such as key derivation, merge behaviour or what leaves the browser, is always listed, as Security if it closes a hole.

## Cutting a release

1. Move the entries from `## [Unreleased]` under a new `## X.Y.Z – YYYY-MM-DD` heading and raise the version in `appinfo/info.xml`, `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`, then `appinfo/info.xml`). Run `npm test`.
2. Commit as `Release X.Y.Z` and merge to `main`.
3. Start the compose Nextcloud (`docker compose up -d`) and run `make release KEY=… CRT=…`. It writes `build/keenext.tar.gz` and `build/keenext.tar.gz.sig`; see the [README](../README.md#development).
4. Tag the merged commit and push the tag: `git tag -a vX.Y.Z -m "KeeNext X.Y.Z"`, `git push github vX.Y.Z`.
5. Create the GitHub release for the tag with the entries of the changelog as its notes and both files from `build/` attached (`gh release create vX.Y.Z build/keenext.tar.gz build/keenext.tar.gz.sig --notes-file …`).
6. In the App Store's release form, enter the URL of the attached tarball and the content of the `.sig` file.
7. Add the compare links at the bottom of `CHANGELOG.md` (`[X.Y.Z]: https://github.com/keenext/keenext/compare/vPREVIOUS...vX.Y.Z`, `[Unreleased]: …/compare/vX.Y.Z...HEAD`).

## The kdbxweb fork

The fork `@keenext/kdbxweb` is versioned on its own: the upstream version it is based on, a `-keenext.N` suffix, and a tag `vX.Y.Z-keenext.N` in [keenext/kdbxweb](https://github.com/keenext/kdbxweb). `package.json` pins an exact version, so a new fork release reaches KeeNext as a normal dependency change and, if users can notice it, a changelog entry.
