# Overlay only the approved application artifacts on the exact inspected runner.
# Build context: web/, socket/index.cjs. No production config or credentials.
ARG TADAZZ_BASE_IMAGE
FROM ${TADAZZ_BASE_IMAGE}
ARG TADAZZ_SOURCE_REVISION
LABEL org.opencontainers.image.revision=${TADAZZ_SOURCE_REVISION}
LABEL com.tadazz.site.enabled="true"
COPY web/ /app/web/
COPY socket/ /app/socket/
COPY mcp/ /app/mcp/
# Release staging must normalize web files to runtime-readable modes (0644)
# and directories to traversable modes (0755) before this overlay is built.
# A recursive chmod here would copy inherited web files into another image layer.
