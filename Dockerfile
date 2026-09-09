# Coolify / Docker — multi-stage Next.js build for small VPS hosts.
# In Coolify: Build Pack → Dockerfile.
# Do not pass Sentry upload tokens as build-time env (Coolify often injects them).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
# Keep V8 heap under typical 2–4GB Coolify RAM so the cgroup does not SIGKILL the build.
ENV NODE_OPTIONS="--max-old-space-size=1280"
# Prevent Sentry webpack plugin from activating if Coolify injects upload secrets.
ENV SENTRY_AUTH_TOKEN=
ENV SENTRY_ORG=
ENV SENTRY_PROJECT=
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app ./
EXPOSE 3000
# Keep Traefik/Coolify from marking the app down during Auth/DB blips —
# /api/health is intentionally instant and does not touch Supabase.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
