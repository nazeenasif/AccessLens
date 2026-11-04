# syntax=docker/dockerfile:1
# AccessLens scanner (task T016). Build context: repository root.
# Browsers are provided by the pinned Playwright image (matches playwright@1.64.1).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY services/egress-proxy/package.json services/egress-proxy/
COPY services/scanner/package.json services/scanner/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace services/scanner --workspace packages/shared --omit=dev \
    && npm cache clean --force
COPY packages/shared packages/shared
COPY services/scanner services/scanner

# Non-root runtime user from the Playwright image (ADR-0001 §4); never root, never --no-sandbox.
USER pwuser
CMD ["node", "services/scanner/src/main.ts"]
