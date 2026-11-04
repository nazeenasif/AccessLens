# Gate Evidence Ledger: AccessLens MVP

A gate counts as passed **only** when a row below records an actual run with evidence. Writing
code or tests never counts. Public scanning (`SCAN_ENABLED=true`) is allowed on a host only when
it has passing **G0** and **G1** rows for **that host** (checked by `scripts/check-scan-enable.mjs`,
task T187).

| Gate | Date | Host/Runner | Commit | Command | Result | Evidence link |
|---|---|---|---|---|---|---|

*No gate has been run yet.*
