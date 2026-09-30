# The go-api-starter sandbox image. Changing this file publishes a new template version.
FROM node:22

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends golang-go ripgrep \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@latest
RUN id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user
RUN mkdir -p /home/user/app && chown -R user:user /home/user/app

USER user
WORKDIR /home/user/app
COPY --chown=user code/go.mod /home/user/app/go.mod
RUN go mod download
COPY --chown=user code/. /home/user/app

# No CMD or ENTRYPOINT: the dev server starts when someone presses Start.
