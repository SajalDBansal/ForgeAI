# The runtime-base sandbox image. It is the broad fallback for imported/unknown repos.
FROM node:22

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        golang-go \
        gzip \
        python3 \
        python3-pip \
        python3-venv \
        ripgrep \
        tar \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@latest
RUN id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user
RUN mkdir -p /home/user/app && chown -R user:user /home/user/app

USER user
WORKDIR /home/user/app
COPY --chown=user code/package.json code/package-lock.json /home/user/app/
RUN npm ci
COPY --chown=user code/. /home/user/app

# No CMD or ENTRYPOINT: the dev server starts when someone presses Start.
