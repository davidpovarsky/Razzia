# ---- BASE ----
FROM node:26-alpine AS base
RUN npm install -g pnpm

# ---- BUILDER ----
FROM base AS builder
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/common/package.json ./packages/common/
COPY packages/web/package.json ./packages/web/
COPY packages/socket/package.json ./packages/socket/
COPY packages/e2e/package.json ./packages/e2e/
COPY extensions/package.json ./extensions/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @razzia/socket build && pnpm --filter @razzia/web build

# Preserve the dotLottie WASM engine in the slim Alpine runner.
RUN mkdir -p /app/runtime && \
    find /app/node_modules -type f -name dotlottie-player.wasm -print -quit | \
      xargs -r -I {} cp {} /app/runtime/dotlottie-player.wasm && \
    test -s /app/runtime/dotlottie-player.wasm

# ---- RUNNER ----
FROM alpine:3.24.2 AS runner

RUN apk add --no-cache nginx nodejs supervisor

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf

COPY --from=builder /app/packages/web/dist /app/web
COPY --from=builder /app/packages/socket/dist/index.cjs /app/socket/index.cjs
COPY --from=builder /app/runtime/dotlottie-player.wasm /app/runtime/dotlottie-player.wasm

EXPOSE 3000

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
