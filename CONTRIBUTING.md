# Contributing

Useful contributions include malformed-record test cases, parser compatibility,
independent implementations of the documented format, clearer verification
reports and improvements to read-only tooling.

Open an issue for a nonsensitive proposal, or a pull request with the problem,
the resulting behavior and the checks you ran. Preserve existing record bytes
and signing domains; discuss protocol changes before implementing them.

Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm test` and
`npm run verify:public`. The public manifest is a reviewed file inventory.
Maintainers regenerate it after reviewing changes; an unreviewed extra file
or changed hash intentionally fails the publication gate.

Use generated disposable keys and local or mocked chain fixtures. Never include
real wallet backups, authenticated endpoints or user records. Report security
issues privately under [SECURITY.md](SECURITY.md).

By contributing, you license your contribution under GPL-3.0-only and confirm
that you have permission to contribute it. Third-party material must retain
its applicable notices and license.
