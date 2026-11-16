# Test fixtures

Local test pages for the scanner (M3). Nothing here is ever served outside tests.

- The fixture server `tests/support/fixture-server.ts` (task T071) serves this directory under
  `/fixtures/` as `http://fixtures.test/fixtures/<path>`.
- It runs only in `docker-compose.test.yml` (ADR-0003 Addendum D), on the `test-fixtures` network
  (`172.30.50.0/24`), where only `egress-proxy` can reach it.
- The fixture sets are added by tasks T067 (`pages/wcag/`), T068 (`axe/`), T069
  (`pages/interruptions/`), T070 (`pages/dom-limit/`), T077 (`pages/target-responses/`), T079
  (`pages/controls/`) and T084 (`pages/benchmark/`).
