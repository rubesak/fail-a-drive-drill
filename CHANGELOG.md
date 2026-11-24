# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/).

## 1.0.0

First release.

- Interactive failure drill for a distributed RAID 6 array: drive failure, distributed rebuild compared with a single hot spare, second failure (critical), third failure (offline, restore from backup) and copyback.
- Classic script with auto-init on `[data-fail-a-drive]`, ES module with `mount()` and `autoInit()`, TypeScript types.
- Options for drive count, timings, theme, heading and all texts; `faildrive:status` and `faildrive:rebuild` events.
- Light and dark theme, `--fad-*` custom properties, container queries, reduced-motion support, strict CSP compatible.
