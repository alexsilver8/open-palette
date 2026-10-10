# Contributing to open-palette

Thanks for taking the time to contribute! 🎉

## Getting started

1. Fork the repository and create a branch from `main`.
2. Set up your environment:

   ```sh
   pnpm install
   pnpm run test
   ```

3. Make your change — add or update tests where it makes sense.
4. Open a pull request and fill in the template.

## Commit messages & PR titles

This project follows [Conventional Commits](https://www.conventionalcommits.org). Pull requests are **squash-merged**, so the PR title becomes the commit on `main` — that is what CI checks, and what drives the changelog and version bumps.

| Prefix | Use it for | Release |
| --- | --- | --- |
| `feat:` | a new feature | minor |
| `fix:` | a bug fix | patch |
| `perf:` | a performance improvement | patch |
| `docs:` `refactor:` `test:` `build:` `ci:` `chore:` | everything else | — |
| `feat!:` `fix!:` … | a breaking change | major (minor while < 1.0) |

Examples: `feat: add --json output`, `fix(parser): handle empty input`, `docs: clarify install steps`.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please). Every merge to `main` updates an open release PR with the next version and changelog. Merging that PR tags the release and publishes it on GitHub.

## Reporting issues

- **Bugs & feature requests:** [open an issue](https://github.com/alexsilver8/open-palette/issues/new/choose).
- **Security vulnerabilities:** please don't open a public issue — see [SECURITY.md](./SECURITY.md).

## Code of conduct

By participating you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
