# Overlay only the approved application artifacts on the exact inspected runner.
# Build context: web/, socket/index.cjs. No production config or credentials.
ARG TADAZZ_BASE_IMAGE
FROM ${TADAZZ_BASE_IMAGE}
ARG TADAZZ_SOURCE_REVISION
LABEL org.opencontainers.image.revision=${TADAZZ_SOURCE_REVISION}
LABEL com.tadazz.site.enabled="true"
COPY web/ /app/web/
COPY socket/index.cjs /app/socket/index.cjs
# Windows-created tar entries can be 0600; Nginx serves as an unprivileged user.
RUN chmod -R a+rX /app/web
