# syntax=docker/dockerfile:1
# Production image for the OrbitCargo Next.js app (standalone output).

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone server + static assets + public files.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Prisma CLI + schema/migrations for the separate `migrate` step (compose
# profile "migrate"), which runs as orbit_owner. The app itself never holds
# the owner's credentials (ADR-029).
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=build /app/prisma ./prisma

# Documents and images are stored in PostgreSQL (ADR-030): no file volume.
USER nextjs
EXPOSE 3000

# Start the server only. Migrations are a separate, deliberate step:
#   docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
CMD ["node", "server.js"]
