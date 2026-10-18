# Contributing

Setup, commands and tests are in the [README](README.md#development); how the code is organised is in [docs/architecture.md](docs/architecture.md). Before opening a pull request, `npm test`, `npm run typecheck`, `npm run lint` and `composer test` should pass. New or changed UI strings go into `l10n/de.json` and `l10n/de_DE.json`; `npm test` fails when one is missing.

## Licence

KeeNext is AGPL-3.0-or-later. By opening a pull request you license your contribution under the same terms; there is no separate agreement to sign. The project therefore cannot be relicensed later without the consent of everyone who contributed.

Open an issue before starting anything larger than a fix, so the direction can be agreed first. This is a spare-time project: reviews can take a while, and there is no support commitment.

## Security issues

Report them privately, see [SECURITY.md](SECURITY.md).
