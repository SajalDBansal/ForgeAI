# The nextjs-starter sandbox image (work plan F8). A Dockerfile is the one format every sandbox
# provider can build; E2B turns these instructions into its own build steps (single stage only).
# COPY paths are relative to this folder. Changing this file publishes a new template version.
FROM node:22

# The image contract (docs/09 §5): node:22 already has bash, git, curl, tar and gzip; ripgrep is
# added for the agent's code search. This part runs as root.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ripgrep \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@latest
RUN mkdir -p /home/user/app && chown -R user:user /home/user/app

# The project, installed as the sandbox's own user so its files are the user's to edit.
USER user
WORKDIR /home/user/app
COPY --chown=user code/package.json code/package-lock.json /home/user/app/
RUN npm ci
COPY --chown=user code/. /home/user/app

# No CMD or ENTRYPOINT: nothing starts at boot. The dev server starts when someone presses Start.
