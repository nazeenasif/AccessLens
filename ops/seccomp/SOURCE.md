# Vendored seccomp profile — provenance

| Field                    | Value                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| File                     | `ops/seccomp/playwright-seccomp-profile.json`                                                                               |
| Source                   | https://raw.githubusercontent.com/microsoft/playwright/v1.64.1/utils/docker/seccomp_profile.json                            |
| Upstream path            | `microsoft/playwright` → `utils/docker/seccomp_profile.json`                                                                |
| Tag                      | `v1.64.1` (lightweight tag)                                                                                                 |
| Commit SHA               | `cfe490d941f992655948eee8fd4fd94e1c4234bf` (from `git ls-remote https://github.com/microsoft/playwright refs/tags/v1.64.1`) |
| SHA-256 of vendored file | `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`                                                          |
| Retrieved                | 2026-10-23 (task T013)                                                                                                      |

**Purpose**: ADR-0001 §4 requires that Chromium run as non-root `pwuser` with this profile so the
Chromium sandbox stays enabled. The profile is Docker's default profile plus the
user-namespace cloning permissions Chromium's sandbox needs (`clone`, `setns`, `unshare`
allowed), which widens kernel attack surface slightly; see ADR-0001 Consequences.

**Updating**: re-vendor from the tag matching the pinned Playwright version, and update this
table (tag, SHA, file hash). Do not edit the JSON by hand.
