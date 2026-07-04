# Coolify / Docker — multi-stage Next.js build.
# Use when Nixpacks fails (e.g. NODE_ENV=production skips devDependencies at build time).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN NODE_ENV=development npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
