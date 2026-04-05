FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @content-factory/web...

FROM base AS build
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/web/node_modules apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY tsconfig.base.json .
RUN cd packages/shared && pnpm build
RUN cd apps/web && pnpm build

FROM base AS runner
ENV NODE_ENV=production
# Next.js standalone output puts server.js at the root of the standalone dir
COPY --from=build /app/apps/web/.next/standalone ./
# Static and public assets must be alongside server.js (not under apps/web/)
COPY --from=build /app/apps/web/.next/static .next/static
COPY --from=build /app/apps/web/public public
EXPOSE 3000
CMD ["node", "server.js"]
