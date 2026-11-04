# syntax=docker/dockerfile:1
# AccessLens web (task T015). Build context: repository root.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY services/egress-proxy/package.json services/egress-proxy/
COPY services/scanner/package.json services/scanner/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --workspace packages/shared --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node apps/web/scripts/public-ip.mjs ./apps/web/scripts/public-ip.mjs
COPY --chown=node:node --chmod=0555 apps/web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
# Binds only to the public-network address (task T020); never 0.0.0.0.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
