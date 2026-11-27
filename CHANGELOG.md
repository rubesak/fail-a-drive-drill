# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/).

## 1.1.0

- Rebuild areas: the array has a limited distributed spare capacity (`rebuildAreas`, default 1). Each failed drive keeps its rebuild area until it is replaced. With no free area a failure is not rebuilt and the array stays degraded, then critical, then offline. Before, failing two drives, waiting for the rebuild and failing two more was accepted again and again.
- One rebuild per rebuild area; a second failure during the rebuild waits.
- New *Rebuild area* meter and rebuild area count in the status line.
- Drives are replaced by the visitor (*Replace failed drives* button, `replace()` on the controller). `autoReplace: true` brings back the automatic replacement. Drives that never got a rebuild area are rebuilt straight onto the new drive.
- Strings: new `replaceButton`, `meterAreas`, `areas`, `areasCopyback`, `state.noArea` and story texts `noArea`, `noAreaCritical`, `waiting`, `critical`; some story functions get more arguments.

## 1.0.0

First release.

- Interactive failure drill for a distributed RAID 6 array: drive failure, distributed rebuild compared with a single hot spare, second failure (critical), third failure (offline, restore from backup) and copyback.
- Classic script with auto-init on `[data-fail-a-drive]`, ES module with `mount()` and `autoInit()`, TypeScript types.
- Options for drive count, timings, theme, heading and all texts; `faildrive:status` and `faildrive:rebuild` events.
- Light and dark theme, `--fad-*` custom properties, container queries, reduced-motion support, strict CSP compatible.
