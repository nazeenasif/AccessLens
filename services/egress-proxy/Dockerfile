# syntax=docker/dockerfile:1
# AccessLens egress proxy (task T017). Build context: repository root. No browser.
# Pinned by digest because tags can move (same digest as the scanner). To update, re-resolve it.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY services/egress-proxy/package.json services/egress-proxy/
COPY services/scanner/package.json services/scanner/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace services/egress-proxy --workspace packages/shared --omit=dev

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node packages/shared packages/shared
COPY --chown=node:node services/egress-proxy services/egress-proxy
USER node
CMD ["node", "services/egress-proxy/src/main.ts"]
