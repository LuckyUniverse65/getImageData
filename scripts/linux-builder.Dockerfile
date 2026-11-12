FROM node:22.13.1-bullseye

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g; s|http://security.debian.org|https://security.debian.org|g' /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-upgrade --no-install-recommends ca-certificates curl gnupg ninja-build python3 libfontconfig1 fonts-dejavu-core \
    && curl -fsSL --retry 3 https://apt.llvm.org/llvm-snapshot.gpg.key -o /tmp/llvm.asc \
    && gpg --dearmor -o /usr/share/keyrings/llvm.gpg /tmp/llvm.asc \
    && echo 'deb [signed-by=/usr/share/keyrings/llvm.gpg] https://apt.llvm.org/bullseye/ llvm-toolchain-bullseye-14 main' > /etc/apt/sources.list.d/llvm.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends clang-14 \
    && ln -s /usr/bin/clang-14 /usr/local/bin/clang \
    && ln -s /usr/bin/clang++-14 /usr/local/bin/clang++

RUN curl -fsSL --retry 3 https://sh.rustup.rs -o /tmp/rustup.sh \
    && sh /tmp/rustup.sh -y --profile minimal --default-toolchain 1.99.1
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /workspace
RUN for directory in . buildtools third_party/externals/freetype third_party/externals/harfbuzz third_party/externals/highway third_party/externals/icu third_party/externals/libjpeg-turbo third_party/externals/libpng third_party/externals/libwebp third_party/externals/wuffs third_party/externals/zlib third_party/externals/fontconfig; do \
      git config --global --add safe.directory "$(realpath -m /workspace/third_party/skia/$directory)"; \
    done
