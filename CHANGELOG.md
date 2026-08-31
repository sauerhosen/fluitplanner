# Changelog

## [2.18.0](https://github.com/sauerhosen/fluitplanner/compare/v2.17.0...v2.18.0) (2026-08-31)


### Features

* disable accounts that cannot be deleted instead of failing ([872e6ec](https://github.com/sauerhosen/fluitplanner/commit/872e6ec8180ed9ca5b1bbc893dc7daa7323d22b9))
* master admin can manage planners across clubs ([fe5368b](https://github.com/sauerhosen/fluitplanner/commit/fe5368bd2a0b55e15ad1972c789bae4db0c7884c))
* move master admin flag to app_metadata and complete user CRUD ([4e1056a](https://github.com/sauerhosen/fluitplanner/commit/4e1056a1be1e679e8f75d0765f40e05db314e08e))


### Bug Fixes

* add a primary action for inviting a new planner ([9660f96](https://github.com/sauerhosen/fluitplanner/commit/9660f967b57b460f4e653b8f5c15c9342da42ae7))
* address code review findings on user administration ([668dfa9](https://github.com/sauerhosen/fluitplanner/commit/668dfa96ccada375b06a14de55b34f852ad9ecc6))
* clear memberships before banning in disableUser ([baaf851](https://github.com/sauerhosen/fluitplanner/commit/baaf851a253178f6a0f4de2dba67061350710428))
* report swallowed admin API errors and keep the retired flag auditable ([304644a](https://github.com/sauerhosen/fluitplanner/commit/304644aa8f7015e4be119f61958af01508f6e8d1))
* restrict master admin backfill to an allow list ([d0d2375](https://github.com/sauerhosen/fluitplanner/commit/d0d2375ad9a5032e3d0ee34d8c76f74dfc13ea02))

## [2.17.0](https://github.com/sauerhosen/fluitplanner/compare/v2.16.0...v2.17.0) (2026-08-29)


### Features

* fit the assignment grid on a phone ([58de80d](https://github.com/sauerhosen/fluitplanner/commit/58de80dec134657232d43baf30b6065fd18e8c0d))
* fold the poll toolbar's tools into a menu on phones ([0435756](https://github.com/sauerhosen/fluitplanner/commit/0435756280c1f626b11af44c4b82d0a6fb6ad0a9))
* make the assignment grid usable on a phone ([7deb167](https://github.com/sauerhosen/fluitplanner/commit/7deb167649bca93c675bae6ca949d58fc92e5d2e))


### Bug Fixes

* cap the assignment grid's height on phones only ([83c259b](https://github.com/sauerhosen/fluitplanner/commit/83c259babf26a6a0841b0ace93a1358faed47ca6))
* give every date-preset instance the same midnight ([44ef8bd](https://github.com/sauerhosen/fluitplanner/commit/44ef8bdc6221c15f57e8d7f916a4c46f443e5d3f))
* keep the match header visible while scrolling the assignment grid ([675d8c6](https://github.com/sauerhosen/fluitplanner/commit/675d8c68aef35fdaebb121c0a7ec6fd94c0d1a8b))
* pin the grid header without a second scrollbar ([506345d](https://github.com/sauerhosen/fluitplanner/commit/506345dc8f850f446c0f01198c652de7a09c92ec))

## [2.16.0](https://github.com/sauerhosen/fluitplanner/compare/v2.15.1...v2.16.0) (2026-08-27)


### Features

* merge duplicate umpires ([#135](https://github.com/sauerhosen/fluitplanner/issues/135)) ([e8e2f39](https://github.com/sauerhosen/fluitplanner/commit/e8e2f392411c384390cfb4729b05f65d1e58e6e1))

## [2.15.1](https://github.com/sauerhosen/fluitplanner/compare/v2.15.0...v2.15.1) (2026-08-27)


### Bug Fixes

* **ui:** make the sticky toolbar trigger, and the page it sits on, correct ([39aa70c](https://github.com/sauerhosen/fluitplanner/commit/39aa70cbc499cff0995d3e44f3568e782170d898))

## [2.15.0](https://github.com/sauerhosen/fluitplanner/compare/v2.14.0...v2.15.0) (2026-08-27)


### Features

* tentative umpire appointments ([ca80357](https://github.com/sauerhosen/fluitplanner/commit/ca8035783e9fa8e9a9ccfb332e2d7fdeffa35262))
* tentative umpire appointments ([0d1defe](https://github.com/sauerhosen/fluitplanner/commit/0d1defe6772922e5a6b912f7c7a1b4b99d7ca2db))

## [2.14.0](https://github.com/sauerhosen/fluitplanner/compare/v2.13.0...v2.14.0) (2026-08-26)


### Features

* declutter the poll assignment grid match headers ([328e639](https://github.com/sauerhosen/fluitplanner/commit/328e639179c9130515ad569d8b30adc5290113a4))
* use more screen width and declutter the assignment grid headers ([6d805a4](https://github.com/sauerhosen/fluitplanner/commit/6d805a4e2fa55b13a678ced23bc8efb16505358b))
* widen authenticated pages to max-w-7xl ([47b93ec](https://github.com/sauerhosen/fluitplanner/commit/47b93ecabe6c61b59e86a947aa7f3217bd852dc6))

## [2.13.0](https://github.com/sauerhosen/fluitplanner/compare/v2.12.0...v2.13.0) (2026-08-26)


### Features

* add notes to umpires, visible in the umpires and assignment views ([02d922d](https://github.com/sauerhosen/fluitplanner/commit/02d922d06a9dd4d49471bad9a11b7cbd6c3d2146))
* CRUD notes on umpires ([7494b98](https://github.com/sauerhosen/fluitplanner/commit/7494b985c2fcdeb203ac0ab850e4504161e8bd13))


### Bug Fixes

* harden umpire notes against review findings ([57a7931](https://github.com/sauerhosen/fluitplanner/commit/57a7931c9b073cc0a29b1205acba4548aa0b5e87))
* start the add-match dialog blank on every opening ([60dd3eb](https://github.com/sauerhosen/fluitplanner/commit/60dd3eb5207f4704f0be7af0109c816e1fd1360b))

## [2.12.0](https://github.com/sauerhosen/fluitplanner/compare/v2.11.0...v2.12.0) (2026-08-26)


### Features

* add notes to matches, visible in matches, poll and assignment views ([794c3cd](https://github.com/sauerhosen/fluitplanner/commit/794c3cd29d99359ea9961230f58fcc11cd17db7d))
* CRUD notes on matches ([b498359](https://github.com/sauerhosen/fluitplanner/commit/b498359dfa838e66ac25a2df622e60418d375294))


### Bug Fixes

* give the note editor an accessible name ([f753cd4](https://github.com/sauerhosen/fluitplanner/commit/f753cd481da938b2d82523d57030c20c91664a23))
* harden match notes against review findings ([66a10dd](https://github.com/sauerhosen/fluitplanner/commit/66a10dd8389665c4100278a4dbfb8b6879b05394))

## [2.11.0](https://github.com/sauerhosen/fluitplanner/compare/v2.10.1...v2.11.0) (2026-08-25)


### Features

* default assignment grid to umpire rows / match columns ([03f523c](https://github.com/sauerhosen/fluitplanner/commit/03f523cb643dae554957c3376eaf1c101829be4b))
* default assignment grid to umpire rows / match columns ([38a4388](https://github.com/sauerhosen/fluitplanner/commit/38a4388ad10d2a489a045135a612627ab72085d9))

## [2.10.1](https://github.com/sauerhosen/fluitplanner/compare/v2.10.0...v2.10.1) (2026-08-17)


### Bug Fixes

* resolve metadata URLs against production domain, not VERCEL_URL ([62936b1](https://github.com/sauerhosen/fluitplanner/commit/62936b1a9d10f0304bb77b24f081b244599e2b32))
* resolve metadata URLs against production domain, not VERCEL_URL ([b0fd96b](https://github.com/sauerhosen/fluitplanner/commit/b0fd96b520a3d80801b9459103a7bf0c76377b53))

## [2.10.0](https://github.com/sauerhosen/fluitplanner/compare/v2.9.0...v2.10.0) (2026-08-17)


### Features

* add Open Graph metadata and dynamic link-preview images ([eab0807](https://github.com/sauerhosen/fluitplanner/commit/eab0807ca25478856e141b1bc3d851f51983bac3))
* add Open Graph metadata and dynamic link-preview images ([b50da73](https://github.com/sauerhosen/fluitplanner/commit/b50da7328e1d2211e818b38692556b1d5bd6502a))


### Bug Fixes

* broaden proxy matcher to skip metadata-image routes at any nesting level ([705d5a0](https://github.com/sauerhosen/fluitplanner/commit/705d5a0bcf8b079102bc71ada7a4cb121e995b65))

## [2.9.0](https://github.com/sauerhosen/fluitplanner/compare/v2.8.3...v2.9.0) (2026-08-16)


### Features

* add daily Vercel cron for hockey match sync ([126d440](https://github.com/sauerhosen/fluitplanner/commit/126d440a726d7bebca22602ec08a2004ce354509))
* add hockey.nl match center schema and signed API client ([43b0af0](https://github.com/sauerhosen/fluitplanner/commit/43b0af0cf41cb0c7d1a2bb9166198efb95b4d4c0))
* add match sync engine with manual sync and review flags ([a2dac94](https://github.com/sauerhosen/fluitplanner/commit/a2dac9493de97325feb101d713d0dbd79624fda8))
* add tracked-teams settings with club/team picker ([a94ec3f](https://github.com/sauerhosen/fluitplanner/commit/a94ec3f19664be213b4ab76c1ef9e5cf7172a135))
* sync matches from the Hockey.nl Match Center API ([b3fc13a](https://github.com/sauerhosen/fluitplanner/commit/b3fc13a1a83f0c00f32518f578ce5b7829f2cb83))


### Bug Fixes

* address code-review findings across the hockey sync feature ([1d29a52](https://github.com/sauerhosen/fluitplanner/commit/1d29a529d27989f947be2f0afd1b5e88331b4753))
* address Codex review findings on the sync engine and cron ([da94915](https://github.com/sauerhosen/fluitplanner/commit/da94915d4e54efed7bbbac111610c42ba544e9a8))
* address review findings on hockey sync ([9fc9c69](https://github.com/sauerhosen/fluitplanner/commit/9fc9c69d2b47c9d3bf2a458e539c42f910331b63))
* fence lease release with a per-claim token ([dab90ae](https://github.com/sauerhosen/fluitplanner/commit/dab90ae916bd53628d323eb56255b5ef15de392f))
* re-check the sync cooldown under the lease ([c1979a4](https://github.com/sauerhosen/fluitplanner/commit/c1979a4e57bd3cf1c24393416ea5110546a8d7d0))
* separate run lease from sync cooldown ([0d5a27f](https://github.com/sauerhosen/fluitplanner/commit/0d5a27fa6cfe931baa9c5ca0ba708d7310c76c82))
* widen natural-key window to reach past-dated cancellations ([4cc4a30](https://github.com/sauerhosen/fluitplanner/commit/4cc4a3017d4073e02912c5a63a11658dc718342d))

## [2.8.3](https://github.com/sauerhosen/fluitplanner/compare/v2.8.2...v2.8.3) (2026-06-13)


### Bug Fixes

* **deps:** patch esbuild and tmp security vulnerabilities ([4183e8c](https://github.com/sauerhosen/fluitplanner/commit/4183e8c853eb22afe320e66aa73e8aa3f3838e2b))
* **deps:** patch esbuild and tmp security vulnerabilities ([d4740e2](https://github.com/sauerhosen/fluitplanner/commit/d4740e20324da569067ce25e5420348617d3870b))

## [2.8.2](https://github.com/sauerhosen/fluitplanner/compare/v2.8.1...v2.8.2) (2026-05-24)


### Bug Fixes

* **deps:** patch Dependabot security alerts ([cc94e86](https://github.com/sauerhosen/fluitplanner/commit/cc94e8649ca479ca55fd4e80220970d5f8e8cda9))
* **deps:** patch Dependabot security alerts ([0b8bd4d](https://github.com/sauerhosen/fluitplanner/commit/0b8bd4de9e7d547468f0bb84767c234516bc8671))

## [2.8.1](https://github.com/sauerhosen/fluitplanner/compare/v2.8.0...v2.8.1) (2026-04-18)


### Bug Fixes

* **deps:** patch Dependabot security alerts ([#104](https://github.com/sauerhosen/fluitplanner/issues/104)) ([225c847](https://github.com/sauerhosen/fluitplanner/commit/225c847e1ddcda3cf592635fb7fc0ee4d560e8c3))

## [2.8.0](https://github.com/sauerhosen/fluitplanner/compare/v2.7.0...v2.8.0) (2026-03-01)


### Features

* add day sheet export for simplified per-date match overview ([#99](https://github.com/sauerhosen/fluitplanner/issues/99)) ([f568bbb](https://github.com/sauerhosen/fluitplanner/commit/f568bbb633d2547f0deb13c8ccc2fd958ec7d471))

## [2.7.0](https://github.com/sauerhosen/fluitplanner/compare/v2.6.9...v2.7.0) (2026-02-25)


### Features

* local Supabase dev instance with Podman ([#95](https://github.com/sauerhosen/fluitplanner/issues/95)) ([48e3881](https://github.com/sauerhosen/fluitplanner/commit/48e3881f55ae364fc700ee15f670e88867e26e20))

## [2.6.9](https://github.com/sauerhosen/fluitplanner/compare/v2.6.8...v2.6.9) (2026-02-25)


### Bug Fixes

* use service client in linkUmpireToOrg to bypass RLS for anonymous poll respondents ([#93](https://github.com/sauerhosen/fluitplanner/issues/93)) ([20220ef](https://github.com/sauerhosen/fluitplanner/commit/20220ef24a7fb0970ebe3ad6e01edaa35f3ccb64))

## [2.6.8](https://github.com/sauerhosen/fluitplanner/compare/v2.6.7...v2.6.8) (2026-02-25)


### Bug Fixes

* remove type re-export from server action to fix SSR runtime error ([#91](https://github.com/sauerhosen/fluitplanner/issues/91)) ([d0896a6](https://github.com/sauerhosen/fluitplanner/commit/d0896a6a29d7d91e288b709f7b795e96fd0a2c10))

## [2.6.7](https://github.com/sauerhosen/fluitplanner/compare/v2.6.6...v2.6.7) (2026-02-25)


### Features

* Add availability lock mode to prevent assigned umpires from withdrawing ([#89](https://github.com/sauerhosen/fluitplanner/issues/89)) ([136b822](https://github.com/sauerhosen/fluitplanner/commit/136b8227fa453d2f34e0905c280a1bfdcd8fcd90))

## [2.6.6](https://github.com/sauerhosen/fluitplanner/compare/v2.6.5...v2.6.6) (2026-02-24)


### Bug Fixes

* reset resend fix: cooldown when verification request fails ([#83](https://github.com/sauerhosen/fluitplanner/issues/83)) ([c4f07fe](https://github.com/sauerhosen/fluitplanner/commit/c4f07fe708faa4937596d1dcf6352933cd33b639))

## [2.6.5](https://github.com/sauerhosen/fluitplanner/compare/v2.6.4...v2.6.5) (2026-02-20)


### Bug Fixes

* deduplicate recent activity events on dashboard ([#81](https://github.com/sauerhosen/fluitplanner/issues/81)) ([273af43](https://github.com/sauerhosen/fluitplanner/commit/273af43b44c53b5f30ee8f1735fc9bf9a7ef5b67))

## [2.6.4](https://github.com/sauerhosen/fluitplanner/compare/v2.6.3...v2.6.4) (2026-02-18)


### Bug Fixes

* reduce poll slot offset from 30 to 20 minutes before match time ([#79](https://github.com/sauerhosen/fluitplanner/issues/79)) ([7ffd52c](https://github.com/sauerhosen/fluitplanner/commit/7ffd52c3e095ccfdc0bf0fd309ba6ced3f082f81))

## [2.6.3](https://github.com/sauerhosen/fluitplanner/compare/v2.6.2...v2.6.3) (2026-02-18)


### Bug Fixes

* include organization_id when inserting verification codes ([#77](https://github.com/sauerhosen/fluitplanner/issues/77)) ([e935ca5](https://github.com/sauerhosen/fluitplanner/commit/e935ca5559fcb7739588ae4e8dc22de3a7a5ad32))

## [2.6.2](https://github.com/sauerhosen/fluitplanner/compare/v2.6.1...v2.6.2) (2026-02-18)


### Bug Fixes

* correct timezone handling for match dates and times ([#75](https://github.com/sauerhosen/fluitplanner/issues/75)) ([b8006f2](https://github.com/sauerhosen/fluitplanner/commit/b8006f243c264619f5e0f7138d8e5e232e9f3325))

## [2.6.1](https://github.com/sauerhosen/fluitplanner/compare/v2.6.0...v2.6.1) (2026-02-18)


### Bug Fixes

* scope managed_teams unique constraint to organization ([#72](https://github.com/sauerhosen/fluitplanner/issues/72)) ([b3047f3](https://github.com/sauerhosen/fluitplanner/commit/b3047f3dbcb4762f1290783078a96a9fb17cf067))

## [2.6.0](https://github.com/sauerhosen/fluitplanner/compare/v2.5.0...v2.6.0) (2026-02-18)


### Features

* Add export functionality for polls (XLSX, HTML, Markdown) ([#70](https://github.com/sauerhosen/fluitplanner/issues/70)) ([02c4f7a](https://github.com/sauerhosen/fluitplanner/commit/02c4f7aad580d7367301059a633a8597d9686aba))

## [2.5.0](https://github.com/sauerhosen/fluitplanner/compare/v2.4.0...v2.5.0) (2026-02-17)


### Features

* Make match import zone collapsible with shadcn Collapsible ([#67](https://github.com/sauerhosen/fluitplanner/issues/67)) ([918992e](https://github.com/sauerhosen/fluitplanner/commit/918992e25687b4f7b497b45ee7a1bb2735daa6b8))

## [2.4.0](https://github.com/sauerhosen/fluitplanner/compare/v2.3.0...v2.4.0) (2026-02-16)


### Features

* Add poll management actions to match selection toolbar ([#64](https://github.com/sauerhosen/fluitplanner/issues/64)) ([185143b](https://github.com/sauerhosen/fluitplanner/commit/185143bb10b10fb6e4ba10ec5e8a4df2d7c4bb2c))

## [2.3.0](https://github.com/sauerhosen/fluitplanner/compare/v2.2.0...v2.3.0) (2026-02-16)


### Features

* Add poll filtering and display to matches page ([#62](https://github.com/sauerhosen/fluitplanner/issues/62)) ([70b3057](https://github.com/sauerhosen/fluitplanner/commit/70b3057aa1f3c8ee426d2a6cc9a00f29b1d09e81))

## [2.2.0](https://github.com/sauerhosen/fluitplanner/compare/v2.1.0...v2.2.0) (2026-02-16)


### Features

* hide past dates on umpire poll with collapsible read-only view ([#60](https://github.com/sauerhosen/fluitplanner/issues/60)) ([47412e5](https://github.com/sauerhosen/fluitplanner/commit/47412e5e7c86885042e74e64fa17a2fa1f657900))

## [2.1.0](https://github.com/sauerhosen/fluitplanner/compare/v2.0.1...v2.1.0) (2026-02-16)


### Features

* Add sticky dirty bar for unsaved changes in availability form ([#58](https://github.com/sauerhosen/fluitplanner/issues/58)) ([bfeb648](https://github.com/sauerhosen/fluitplanner/commit/bfeb648c9dacff909722f5df79684058fcfc05e9))

## [2.0.1](https://github.com/sauerhosen/fluitplanner/compare/v2.0.0...v2.0.1) (2026-02-15)


### Bug Fixes

* resolve tenant context for root domain users ([#55](https://github.com/sauerhosen/fluitplanner/issues/55)) ([f60c673](https://github.com/sauerhosen/fluitplanner/commit/f60c673733b12e84143f74fcbca293009da30474))

## [2.0.0](https://github.com/sauerhosen/fluitplanner/compare/v1.11.0...v2.0.0) (2026-02-15)


### ⚠ BREAKING CHANGES

* multi-tenancy with organization-scoped data isolation ([#53](https://github.com/sauerhosen/fluitplanner/issues/53))

### Features

* multi-tenancy with organization-scoped data isolation ([#53](https://github.com/sauerhosen/fluitplanner/issues/53)) ([a1e879b](https://github.com/sauerhosen/fluitplanner/commit/a1e879b240f5f4abd9fd5d765153386eb6b163c8))

## [1.11.0](https://github.com/sauerhosen/fluitplanner/compare/v1.10.0...v1.11.0) (2026-02-15)


### Features

* add date range filter to polls detail screen ([#51](https://github.com/sauerhosen/fluitplanner/issues/51)) ([2bbeda9](https://github.com/sauerhosen/fluitplanner/commit/2bbeda9d9c22754950ca6cf5cff2407e51ac439f))

## [1.10.0](https://github.com/sauerhosen/fluitplanner/compare/v1.9.0...v1.10.0) (2026-02-15)


### Features

* matches page date range filter and advanced import ([#49](https://github.com/sauerhosen/fluitplanner/issues/49)) ([884f44e](https://github.com/sauerhosen/fluitplanner/commit/884f44efcccb196624a90376de5bb2244a46f210))

## [1.9.0](https://github.com/sauerhosen/fluitplanner/compare/v1.8.0...v1.9.0) (2026-02-15)


### Features

* add GDPR-compliant privacy policy ([#47](https://github.com/sauerhosen/fluitplanner/issues/47)) ([a5cab3f](https://github.com/sauerhosen/fluitplanner/commit/a5cab3f9a4a2f153b1ad7836e5de8bdc021f7705))

## [1.8.0](https://github.com/sauerhosen/fluitplanner/compare/v1.7.0...v1.8.0) (2026-02-14)


### Features

* add Dutch/English i18n with next-intl ([#44](https://github.com/sauerhosen/fluitplanner/issues/44)) ([b78ed09](https://github.com/sauerhosen/fluitplanner/commit/b78ed0970ab576537f092b70d57169f221bad266))

## [1.7.0](https://github.com/sauerhosen/fluitplanner/compare/v1.6.1...v1.7.0) (2026-02-14)


### Features

* make dashboard stat cards clickable ([#41](https://github.com/sauerhosen/fluitplanner/issues/41)) ([a6b3b61](https://github.com/sauerhosen/fluitplanner/commit/a6b3b61955136cf80feeb8bc3964e58241b5e122))

## [1.6.1](https://github.com/sauerhosen/fluitplanner/compare/v1.6.0...v1.6.1) (2026-02-14)


### Bug Fixes

* check auth session for poll dashboard button ([#39](https://github.com/sauerhosen/fluitplanner/issues/39)) ([710a399](https://github.com/sauerhosen/fluitplanner/commit/710a399d0fac0e28a283ca11496f860dd7c979c2))

## [1.6.0](https://github.com/sauerhosen/fluitplanner/compare/v1.5.1...v1.6.0) (2026-02-14)


### Features

* add dashboard link on poll page for planners ([#37](https://github.com/sauerhosen/fluitplanner/issues/37)) ([17e1e0c](https://github.com/sauerhosen/fluitplanner/commit/17e1e0c462d254202123451c3cfea9080cf211c8))

## [1.5.1](https://github.com/sauerhosen/fluitplanner/compare/v1.5.0...v1.5.1) (2026-02-14)


### Bug Fixes

* add --repo flag to gh pr merge in release workflow ([#35](https://github.com/sauerhosen/fluitplanner/issues/35)) ([60cf339](https://github.com/sauerhosen/fluitplanner/commit/60cf33943c76965609788d667b379f436cd3b2e7))

## [1.5.0](https://github.com/sauerhosen/fluitplanner/compare/v1.4.3...v1.5.0) (2026-02-14)


### Features

* manual poll response editing in Responses tab ([#32](https://github.com/sauerhosen/fluitplanner/issues/32)) ([c303fec](https://github.com/sauerhosen/fluitplanner/commit/c303feca9b0d9be9550cafd6a0926d19977e7973))

## [1.4.3](https://github.com/sauerhosen/fluitplanner/compare/v1.4.2...v1.4.3) (2026-02-14)


### Bug Fixes

* remove space in verification code email to prevent partial paste ([#27](https://github.com/sauerhosen/fluitplanner/issues/27)) ([c0b8363](https://github.com/sauerhosen/fluitplanner/commit/c0b83634021b021af37784f64970b15a1610d48b))

## [1.4.2](https://github.com/sauerhosen/fluitplanner/compare/v1.4.1...v1.4.2) (2026-02-14)


### Bug Fixes

* retry SMTP send on transient DNS errors ([#25](https://github.com/sauerhosen/fluitplanner/issues/25)) ([a6af0ae](https://github.com/sauerhosen/fluitplanner/commit/a6af0aeab9eaca5a85cffd862b4c6321d55d048c))

## [1.4.1](https://github.com/sauerhosen/fluitplanner/compare/v1.4.0...v1.4.1) (2026-02-14)


### Bug Fixes

* add dashboard link on landing page for authenticated users ([#24](https://github.com/sauerhosen/fluitplanner/issues/24)) ([034a0cb](https://github.com/sauerhosen/fluitplanner/commit/034a0cb471474dd4babeba8b18d343011835c885))
* replace xlsx with exceljs (CVE-2024-22363) ([#22](https://github.com/sauerhosen/fluitplanner/issues/22)) ([9035a6d](https://github.com/sauerhosen/fluitplanner/commit/9035a6db7b5ce8a80782c9ba097f003ecdf45432))

## [1.4.0](https://github.com/sauerhosen/fluitplanner/compare/v1.3.0...v1.4.0) (2026-02-14)


### Features

* poll email verification for returning umpires ([#20](https://github.com/sauerhosen/fluitplanner/issues/20)) ([f8a538b](https://github.com/sauerhosen/fluitplanner/commit/f8a538bc228cd493fb9d5c01269cf8b37b0c021f))
* replace navbar text with app icon ([#19](https://github.com/sauerhosen/fluitplanner/issues/19)) ([bc21790](https://github.com/sauerhosen/fluitplanner/commit/bc21790b182bebe1517fced4b0b12ef136b09c01))

## [1.3.0](https://github.com/sauerhosen/fluitplanner/compare/v1.2.0...v1.3.0) (2026-02-14)

### Features

- stage 7 — planner dashboard & polish ([#14](https://github.com/sauerhosen/fluitplanner/issues/14)) ([f96f21a](https://github.com/sauerhosen/fluitplanner/commit/f96f21a97af5c0e50f851e277da90b24fda10ed6))

### Bug Fixes

- replace leftover Supabase/Next.js branding ([#16](https://github.com/sauerhosen/fluitplanner/issues/16)) ([8b13cbb](https://github.com/sauerhosen/fluitplanner/commit/8b13cbb3508495c5a6ad5093a292b683689cf416))

## [1.2.0](https://github.com/sauerhosen/fluitplanner/compare/v1.1.0...v1.2.0) (2026-02-13)

### Features

- add availability form with slot rows for poll responses ([8905c10](https://github.com/sauerhosen/fluitplanner/commit/8905c1052562f51ca20c30c18d3a3d9d244c5617))
- add findOrCreateUmpire and findUmpireById server actions ([bc95da0](https://github.com/sauerhosen/fluitplanner/commit/bc95da04dbe3c9ea11fb7e65f6540bbae328982c))
- add getMyResponses and submitResponses server actions ([3dd3430](https://github.com/sauerhosen/fluitplanner/commit/3dd3430508b29117d4e7361ef3795b77ea0e48bd))
- add getPollByToken server action for public poll access ([1d32578](https://github.com/sauerhosen/fluitplanner/commit/1d32578f62c89136174f2c9a8c3eb8029782b4df))
- add poll response page and umpire identifier components ([e65ebd5](https://github.com/sauerhosen/fluitplanner/commit/e65ebd50a0305698181f3e571b6ffeb84d894b7a))
- add public poll page server component ([391f341](https://github.com/sauerhosen/fluitplanner/commit/391f341b6bcb46d443339be3c4b017874de9d5a9))
- add Stage 5 public poll response page ([470844e](https://github.com/sauerhosen/fluitplanner/commit/470844e787df175d9668c13bb76c08114fb1f212))
- add umpire_id field to AvailabilityResponse type ([a1fad5c](https://github.com/sauerhosen/fluitplanner/commit/a1fad5c131714575ee99e3e2ff5f4554a32daf72))
- group poll slots by date, add toggle behavior for response buttons ([e024099](https://github.com/sauerhosen/fluitplanner/commit/e024099bdd0424a96fc240fe14ed22097e60aaa3))
- improve poll detail UI with combined slots/matches view and Rallly-style response grid ([c86a617](https://github.com/sauerhosen/fluitplanner/commit/c86a617a5386ba2c11fbc32046661597f76ce5f6))
- stage 6 — umpire assignment grid ([0f185df](https://github.com/sauerhosen/fluitplanner/commit/0f185dfe32884050cfa24203a4b085aa561fedb5))

### Bug Fixes

- add RLS policies for authenticated users, exclude /poll from proxy, add Suspense boundary ([b95a2b7](https://github.com/sauerhosen/fluitplanner/commit/b95a2b7945533f79ef4b807a031af29c1a7465c2))
- format CHANGELOG.md to pass prettier check ([27d7ed3](https://github.com/sauerhosen/fluitplanner/commit/27d7ed3ba2c58da5a82c16ee9c700052f9ce972d))
- type vi.fn() for onIdentified prop in umpire-identifier test ([4272413](https://github.com/sauerhosen/fluitplanner/commit/42724131b5b2572e7f41826c0288e20308e6c0ba))
- use umpire_id for response upsert and fix cookie restore race condition ([3bdf982](https://github.com/sauerhosen/fluitplanner/commit/3bdf982ca36c8bee24a93b84b126f37a277592eb))

## [1.1.0](https://github.com/sauerhosen/fluitplanner/compare/v1.0.0...v1.1.0) (2026-02-13)

### Features

- add KNHB mapper and file parsers (CSV, Excel, paste) ([87a9af1](https://github.com/sauerhosen/fluitplanner/commit/87a9af1600472e9d1203d925bf8c061a6337d6a2))
- add ManagedTeam type, update Match with field/required_level, add parser types ([679defa](https://github.com/sauerhosen/fluitplanner/commit/679defa84d82c961f018705e505745479e2841e5))
- add server actions for managed teams and matches ([9afa5a1](https://github.com/sauerhosen/fluitplanner/commit/9afa5a13d11d2a9a44b6494f146ac3fd9e3e2d62))
- add settings page, matches page, and navigation ([0e7ebae](https://github.com/sauerhosen/fluitplanner/commit/0e7ebae4aac5251d642e9a4a13fc1530e4a8713e))
- add Stage 1 database schema and core domain logic ([19dcc5c](https://github.com/sauerhosen/fluitplanner/commit/19dcc5c39889ca404a8264ede92136883daebdc1))
- add Stage 2 schema — managed_teams table, matches field/level columns, upsert constraint ([e50e7fe](https://github.com/sauerhosen/fluitplanner/commit/e50e7feb752063459afc0591b56ee47fa820db7b))
- add Stage 3 umpire management ([66592a0](https://github.com/sauerhosen/fluitplanner/commit/66592a0b2a28ad5b62675eb7422014dd0b5b1f80))
- add Stage 3 umpire management with CRUD, E2E tests, and automated auth ([77e826d](https://github.com/sauerhosen/fluitplanner/commit/77e826d3a0f389691394eccfe1270169b6681ca6))
- add Stage 4 availability poll creation and management ([#10](https://github.com/sauerhosen/fluitplanner/issues/10)) ([39d5429](https://github.com/sauerhosen/fluitplanner/commit/39d54299cca1d11bf255545c79bbc2b9e8f8497e))
- migrate to Tailwind CSS v4 ([5eaf898](https://github.com/sauerhosen/fluitplanner/commit/5eaf898c3350a2c55fee44a553be6bcde05758c8))
- migrate to Tailwind CSS v4 with CSS-first configuration ([1e46b88](https://github.com/sauerhosen/fluitplanner/commit/1e46b880d2e10305df13b7bbf809fb1a4728d8cd))
- Stage 1 — database schema and core domain logic ([da4e849](https://github.com/sauerhosen/fluitplanner/commit/da4e84960107ece135e9d0acbeb44d06797d0ebd))
- Stage 2 — Match management (planner) ([d30439f](https://github.com/sauerhosen/fluitplanner/commit/d30439fa6c135665c8661405bcec938636395e8b))

### Bug Fixes

- add Next.js build cache to CI ([2ed1234](https://github.com/sauerhosen/fluitplanner/commit/2ed12341ae91c0133d7ee21fa592866ede49f17d))
- add Next.js build cache to CI workflow ([a70a712](https://github.com/sauerhosen/fluitplanner/commit/a70a7125669c8a925668ad0fa33964541afbb45c))
- format CHANGELOG.md to pass prettier check ([2fab33c](https://github.com/sauerhosen/fluitplanner/commit/2fab33cc5071ed6f092b7a5133fa460506cd0970))
- preserve timezone when persisting edited match start times ([dacf076](https://github.com/sauerhosen/fluitplanner/commit/dacf07669fafb1e86c05091df8970fc1cd83b8ea))
- sanitize search filter input, add auth checks, and show form errors ([321a6b7](https://github.com/sauerhosen/fluitplanner/commit/321a6b714931834f68552a6c5a44884b0489f9ba))

## 1.0.0 (2026-02-12)

### Features

- add GitHub Actions CI and release-please workflows ([d0f2949](https://github.com/sauerhosen/fluitplanner/commit/d0f294981abab9528041ac368801af622c54bb87))
- add prettier formatter and pre-commit hook ([fa73581](https://github.com/sauerhosen/fluitplanner/commit/fa7358120a1ea1abcbd7bce788d802e397ae55a2))
