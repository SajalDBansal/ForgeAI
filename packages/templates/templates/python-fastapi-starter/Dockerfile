# The python-fastapi-starter sandbox image. Changing this file publishes a new template version.
FROM node:22

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ripgrep \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@latest
RUN id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user
RUN mkdir -p /home/user/app && chown -R user:user /home/user/app

USER user
WORKDIR /home/user/app
COPY --chown=user code/requirements.txt code/requirements.lock /home/user/app/
RUN python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.lock
COPY --chown=user code/. /home/user/app

# No CMD or ENTRYPOINT: the dev server starts when someone presses Start.
