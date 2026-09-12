# Kabirian College Management System — production image.
#
# Builds the Next.js standalone server (ADR-163). Runs as a plain Node
# process on port 3000; give it the same environment variables as
# .env.example. Nothing in this image reads .env — secrets come from the
# host's environment settings.
#
#   docker build -t kabirian-college .
#   docker run -p 3000:3000 --env-file .env.production kabirian-college

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholders so env.ts validates at build time; the real values arrive at run time.
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    APP_URL=http://localhost:3000 \
    APP_TIMEZONE=Asia/Karachi \
    APP_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
