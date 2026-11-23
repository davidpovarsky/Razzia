# Reproducible web-only release; retain the exact running backend/runner image.
ARG TADAZZ_BASE_IMAGE
FROM ${TADAZZ_BASE_IMAGE}
ARG TADAZZ_SOURCE_REVISION
LABEL org.opencontainers.image.revision=${TADAZZ_SOURCE_REVISION}
LABEL com.tadazz.site.enabled="true"
COPY web/ /app/web/
COPY nginx-server.conf /etc/nginx/tadazz/server.conf
RUN chmod -R a+rX /app/web
