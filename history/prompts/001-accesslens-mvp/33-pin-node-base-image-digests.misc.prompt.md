---
id: 33
title: Pin Node Base Image Digests
stage: misc
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: 001-accesslens-mvp
branch: 001-accesslens-mvp
user: Nazeen Asif
command: Pin web and egress-proxy node base images by digest
labels: ["docker", "supply-chain", "pinning", "node"]
links:
  spec: specs/001-accesslens-mvp/spec.md
  ticket: null
  adr: history/adr/0003-stack-and-deployment.md
  pr: null
files:
 - apps/web/Dockerfile
 - services/egress-proxy/Dockerfile
 - tests/config/images-nonroot.test.ts (follow-up)
tests:
 - docker buildx imagetools inspect node:24.22.1-bookworm-slim: index digest sha256:be8204d4…605c
 - Docker Hub registry v2 manifest HEAD (docker-content-digest): sha256:be8204d4…605c
 - docker compose build --pull --no-cache web scanner egress-proxy: exit 0; all three resolve FROM …@sha256:be8204d4…605c
 - Built images: web v24.22.1 uid 1000, scanner v24.22.1 uid 1001, egress-proxy v24.22.1 uid 1000
 - lint, format:check, typecheck, web build, check:secrets, check:secrets:diff: exit 0
 - npm test and test:ci (Docker and gitleaks required): 12 files, 371 passed, 5 skipped, 0 failed
 - test:assert: OK (18 required tests passed; only allowlisted skips)
 - Follow-up: digest pin check, with digests in place: 11 static checks passed
 - Follow-up: digest removed from apps/web/Dockerfile: 1 failed (web pin test), 10 passed; restored: 11 passed
 - Follow-up: full pre-push suite: 12 files, 375 passed, 5 skipped, 0 failed; test:assert OK
---

## Prompt

Pin the web and egress-proxy Dockerfiles' node:24.22.1-bookworm-slim image by digest,
matching how the scanner Dockerfile does it. Show the digests you resolved and where you got
them from, rebuild all images, run the full pre-push suite with raw totals, and write a PHR.
Do not commit or push. Stop for review.

(Follow-up: "resume", after the first rebuild was killed when the session ended, before any test ran.)

## Response snapshot

- **Digest**: `node:24.22.1-bookworm-slim` resolves to the multi-platform index digest `sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c`. Two sources agree: `docker buildx imagetools inspect`, and a direct Docker Hub registry v2 request (`docker-content-digest` header), which doesn't go through the local Docker client. It's identical to the scanner's existing pin. The per-platform linux/amd64 manifest has a different digest (`sha256:e1582112…`); the index digest is used, as in the scanner.
- **Change**: `ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:be8204d4…605c` in the web and egress-proxy Dockerfiles, each with a one-line comment. All three Dockerfiles now carry the identical pin.
- **Rebuild**: `--pull --no-cache`; every build resolves the pinned digest; all images run Node v24.22.1 as non-root.
- **Suite**: everything passes; 371 passed, 5 allowlisted skips, 0 failed.
- **Not changed**: `images-nonroot.test.ts` asserts digest pins only for the scanner; extending that check to web and egress-proxy is a possible follow-up.
- No commit or push.

## Follow-up: digest-pin test (2026-11-13)

Prompt (verbatim):

```text
Approved. Before committing, extend images-nonroot.test.ts so every Dockerfile's base image
(each FROM line and NODE_IMAGE-style ARG default) must be pinned by @sha256 digest. Show that
it fails when you temporarily remove the digest from apps/web/Dockerfile, then restore the
digest and confirm it passes. Run the full pre-push suite with raw totals, update PHR 33, and
paste git status --short. Do not commit or push. Stop.
```

- **Test** (`tests/config/images-nonroot.test.ts`, static group):
  - It discovers every Dockerfile, tracked or new, with `git ls-files --cached --others --exclude-standard`, and checks that the three service Dockerfiles are among them.
  - For each Dockerfile, every `ARG *IMAGE` default and every `FROM` image (after `${ARG}` substitution, skipping build-stage names and `--flag`s) must end in `@sha256:<64 hex>`.
  - An `ARG` with no default, or an unresolvable `FROM`, counts as unpinned. Failures list each unpinned line.
  - The existing scanner-only digest test is kept.
- **Negative control**: removing the digest from `apps/web/Dockerfile` failed only the web pin test (`expected 'ARG NODE_IMAGE=node:24.22.1-bookworm-…' to be ''`; 10 passed, 1 failed). The Dockerfile was restored automatically and byte-compared; then 11/11 static checks pass.
- **Suite**: lint, format:check, typecheck, web build, and both secret scans exit 0. `npm test` and `test:ci` each show 12 files, 375 passed, 5 skipped, 0 failed (images-nonroot 19 passed / 1 allowlisted skip). `test:assert` is OK.
- No commit or push.

## Outcome

- ✅ Impact: no Node base image in the stack can change under a moved tag any more.
- 🧪 Tests: full pre-push suite green after a no-cache rebuild; the new digest-pin check fails on an unpinned base image (negative control).
- 📁 Files: two Dockerfiles and images-nonroot.test.ts, plus this PHR.
- 🔁 Next prompts: owner reviews and commits; then T034.
- 🧠 Reflection: Checking the digest with a second source independent of the local Docker client confirms the pin isn't just a stale local cache.

## Evaluation notes (flywheel)

- Failure modes observed: the first background rebuild was killed when the session ended; it was rerun in full.
- Graders run and results (PASS/FAIL): digest resolution PASS (2 sources agree); rebuild PASS; suite PASS.
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null (the digest-pin check was added in the follow-up).
