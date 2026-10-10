# Contributing

Setup, commands and tests are in the [README](README.md#development); how the code is organised is in [docs/architecture.md](docs/architecture.md). Before opening a pull request, `npm test`, `npm run typecheck`, `npm run lint` and `composer test` should pass. New or changed UI strings go into `l10n/de.json` and `l10n/de_DE.json`; `npm test` fails when one is missing.

## Licence and CLA

KeeNext is AGPL-3.0-or-later. A pull request can be merged once its author has signed the [CLA](CLA.md): a bot comments on the first pull request, and a single comment with the sentence it names is enough. The CLA lets the Maintainer license contributions under other terms as well; versions already published stay under their licence.

## Security issues

Report them privately, see [SECURITY.md](SECURITY.md).
