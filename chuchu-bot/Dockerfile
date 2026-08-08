# CHUCHU BOT — backend runtime image (works on Render / Railway / Fly.io / any Docker host)
# Builds shared + engine-core + backend and starts the live data engine on PORT (default 8080).

FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install deps from lockfile first (frontend is NOT built here, so ignore-scripts is safe)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/engine-core/package.json packages/engine-core/
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source and compile the packages the backend needs
COPY . .
RUN pnpm --filter @chuchu/shared --filter @chuchu/engine-core --filter @chuchu/backend run build

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/backend/start-server.js"]
