FROM sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
WORKDIR /app/runtime
COPY artifacts/runtime.mjs artifacts/bootstrap.mjs artifacts/runtime-source-manifest.json /app/runtime/
USER 0:0
EXPOSE 3192
ENTRYPOINT ["node","/app/runtime/bootstrap.mjs"]
CMD []
