# Contributing

This repository publishes reviewed source releases for inspection, local builds and forks. It is intentionally archived between releases to protect the public/private boundary. Product development takes place in a separate private workspace; source updates are published through a controlled maintainer release step.

Useful feedback includes reproducible defects in public builders, malformed-record cases, parser compatibility, clearer verification output and improvements to the public UI. Use the project's published support channels for nonsensitive feedback. Report vulnerabilities privately as described in SECURITY.md. Do not send wallet backups, authenticated endpoints, credentials or user records.

Run npm ci --ignore-scripts --no-audit --no-fund, npm test, npm run verify:public and npm run build. The public manifest binds the reviewed file inventory and hashes. Changes to record bytes and signing domains require explicit review. Use disposable test keys and local or mocked chain fixtures.

The code uses GPL-3.0-only. Preserve applicable third-party notices. Source availability does not grant rights to Grainpad branding or imply endorsement of forks.
