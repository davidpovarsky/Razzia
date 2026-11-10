FROM tadazz:package-builder-5809cb4
WORKDIR /cleanup
COPY source/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm --dir extensions exec playwright install --with-deps chromium webkit
ENV TADAZZ_REMOTE_QA=1
CMD ["sleep", "infinity"]
