# Immutable prior toolchain contains the pinned decoder/compiler/dependency cache.
ARG TADAZZ_TOOLCHAIN_BASE
FROM ${TADAZZ_TOOLCHAIN_BASE}
COPY delta.tar.gz /tmp/package-delta.tar.gz
RUN tar -xzf /tmp/package-delta.tar.gz -C /cleanup \
 && cd /cleanup && pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm build \
 && rm /tmp/package-delta.tar.gz
