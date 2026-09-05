# --- deps: install once, cached as long as the lockfile doesn't change ---
FROM node:20-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build: NEXT_PUBLIC_* vars are baked into the client bundle here, so
# they must be passed as build args, not just runtime env ---
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm build

# --- runtime: just the standalone server output, no node_modules/pnpm ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
