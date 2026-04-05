FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/agents/package.json packages/agents/
RUN pnpm install --frozen-lockfile --filter @content-factory/api...

FROM base AS build
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=deps /app/packages/agents/node_modules packages/agents/node_modules
COPY packages/shared packages/shared
COPY packages/agents packages/agents
COPY apps/api apps/api
COPY tsconfig.base.json .
RUN cd packages/shared && pnpm build
RUN cd packages/agents && pnpm build
RUN cd apps/api && pnpm build

FROM base AS runner
ENV NODE_ENV=production
# Place dist under apps/api/ so node_modules lookup traverses apps/api/node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/src/db/migrations apps/api/dist/db/migrations
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
