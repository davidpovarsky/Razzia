# Operator-built immutable toolchain; no customer source is present in these inputs.
FROM tadazz:native-controls-qa-r7
COPY baseline.tar.gz delta.tar.gz /tmp/
RUN tar -xzf /tmp/baseline.tar.gz -C /cleanup \
 && tar -xzf /tmp/delta.tar.gz -C /cleanup \
 && cd /cleanup && pnpm install --frozen-lockfile --ignore-scripts \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg=7:5.1.9-0+deb12u1 \
 && rm -rf /var/lib/apt/lists/* /tmp/baseline.tar.gz /tmp/delta.tar.gz
WORKDIR /cleanup
