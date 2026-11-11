FROM tadazz:package-builder-5809cb4
WORKDIR /cleanup
COPY source/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm --dir extensions exec playwright install --with-deps chromium webkit
RUN apt-get update -qq && apt-get install -y --no-install-recommends zbar-tools tini && rm -rf /var/lib/apt/lists/*
ENV TADAZZ_REMOTE_QA=1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
