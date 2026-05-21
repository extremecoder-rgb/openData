# apps/api/Dockerfile

# Base stage
FROM node:20-alpine AS base
RUN npm install -g pnpm turbo
WORKDIR /app

# Prune stage (keep only the target application dependencies)
FROM base AS pruner
COPY . .
RUN turbo prune --scope=api --docker

# Installer stage
FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Build stage
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
RUN turbo build --filter=api...

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=installer /app .
EXPOSE 3001
CMD ["pnpm", "--filter", "api", "start"]
