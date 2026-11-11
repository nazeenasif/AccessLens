# syntax=docker/dockerfile:1
# AccessLens scanner (task T016). Build context: repository root.
#
# Browsers and their system libraries come from the Playwright image; Node comes from the official
# image, so the runtime has the project's exact Node regardless of what Playwright bundles. Both
# bases are pinned by digest because tags can move: v1.64.1-noble was republished upstream with
# Node 26. To update, re-resolve each digest and keep the Playwright version equal to package-lock.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY services/egress-proxy/package.json services/egress-proxy/
COPY services/scanner/package.json services/scanner/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace services/scanner --workspace packages/shared --omit=dev

FROM ${PLAYWRIGHT_IMAGE} AS runtime
# Remove the image's own Node and package managers: the runtime needs neither.
RUN rm -f /usr/bin/node /usr/bin/nodejs /usr/bin/npm /usr/bin/npx /usr/bin/corepack \
        /usr/bin/yarn /usr/bin/yarnpkg \
    && rm -rf /usr/lib/node_modules
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared packages/shared
COPY services/scanner services/scanner

# Non-root runtime user from the Playwright image (ADR-0001 §4); never root, never --no-sandbox.
USER pwuser
CMD ["node", "services/scanner/src/main.ts"]
