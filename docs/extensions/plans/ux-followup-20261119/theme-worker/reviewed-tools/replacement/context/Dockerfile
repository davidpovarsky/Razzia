FROM sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647
COPY source/ /cleanup/
COPY provenance/ /opt/tadazz-package-worker-provenance/
LABEL org.tadazz.package-worker.base="sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647"
LABEL org.tadazz.package-worker.source-manifest-sha256="751fa33e6591657fa40d14f99eb0f6eca775787e7ff5f0b18989bb69c73a89dd"
LABEL org.tadazz.package-worker.verifier-sha256="18e47aa70d824c306713c0aeba199d400c0a6f1f191944b1c1d8097dd87ec22f"
LABEL org.tadazz.package-worker.asana="1220708526935641"
WORKDIR /cleanup
USER 65534:65534
