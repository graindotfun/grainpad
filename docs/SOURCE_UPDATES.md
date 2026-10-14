# Public source updates

Grainpad develops the application in a private workspace and publishes reviewed
product source here. This includes launchpad UI, transaction builders, Robinhood
contracts and client modules, additional-network preparation, tests and tools.
See the README for production services that are outside this distribution.

Each update follows the same publication boundary:

1. Review source content and dependencies. Approvals bind exact file hashes.
   New files and changed approved files wait for renewed review. Public
   substitutions are reviewed separately from their private counterparts.
2. Prepare an incremental update against the existing public history. Private
   commits, branches, tags and commit mappings are not transferred.
3. Install from the public lockfile, run the offline tests, verify the public
   inventory and network dependency closures, build, and scan the source tree
   and reachable public history for credentials.
4. Publish the checked payload through a public pull request. Required public
   checks must pass before merging. An advanced public base requires preparation
   again; a failed check holds the release.

Private-only work and an unchanged public payload produce no public commit.
Public activity represents source changes, not a complete record of operations.
Publication does not deploy services, enable a network, sign transactions or
move funds. A passing credential scan is not an independent security audit.

`PUBLIC_EXPORT_MANIFEST.json` records the reviewed paths and content hashes.
Its `sourceCommit` names a public-history base, not the private source commit.
