# Public core contribution rules

This repository contains the public GRN1 protocol and read-only verification tools.
Keep changes within that scope. Preserve signature domains and binary layouts.
Use disposable test keys and mocked or local endpoints. Never commit credentials,
wallet exports, user records, operational notes or deployment settings.
Run `npm test`, `npm run verify:public` and secret scans before publishing.
Update the manifest hashes for reviewed changes. Do not add deployment workflows.
