# @forgeAI/templates

The starting points a new project can be created from. Every template lives in
one folder under `templates/`, and one command reconciles it with what is live.

## Layout

```
templates/
  nextjs-starter/
    template.ts   # the definition: metadata, version, runtime and machine size
    Dockerfile    # the sandbox image, built through the provider adapter
    code/         # the actual source the template ships
src/
  registry.ts     # the list of templates, the R2 key convention, reading a Dockerfile
  hash.ts         # the content fingerprint the sync gates on
  image-contract.ts # checks a new image has what sandbox scripts need
  plan-check.ts   # refuses templates bigger than the plan allows
  code.ts         # which files ship (shared by the zip and the hash)
  version.ts      # what version a changed template publishes as
  scripts/sync.ts # the entry point
```

## Templates in this repo

| Template                                                                  | Use                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| [nextjs-starter](templates/nextjs-starter/code/README.md)                 | Default App Router starter for full-stack React apps   |
| [react-vite-starter](templates/react-vite-starter/code/README.md)         | Lightweight client app                                 |
| [node-api-starter](templates/node-api-starter/code/README.md)             | TypeScript Fastify API                                 |
| [python-fastapi-starter](templates/python-fastapi-starter/code/README.md) | Python FastAPI service                                 |
| [go-api-starter](templates/go-api-starter/code/README.md)                 | Minimal Go HTTP API                                    |
| [turborepo-starter](templates/turborepo-starter/code/README.md)           | Web/API/shared TypeScript monorepo                     |
| [runtime-base](templates/runtime-base/code/README.md)                     | Broad Node/Python/Go fallback image for imported repos |

## The three places a template exists

| Where              | What                                                                                                                                                                                                            | Used for                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The provider (E2B) | one prebuilt image **per version**, e.g. `forgeai-nextjs-starter-v1-0-4`, built from the template's `Dockerfile`, with dependencies installed and the template's `resources` (default 2 CPUs, 2 GB, 10 GB disk) | **creating sandboxes.** Nothing is installed or started at boot; the dev server starts when someone presses Start |
| R2                 | `templates/<template>/<version>.zip` of `code/`, with its content hash in the object's metadata                                                                                                                 | **user downloads only.** Never read to start a sandbox                                                            |
| Postgres           | one `Template` row (newest version) + one `TemplateVersion` row per version. Each records `imageRef` (the image name), `provider`, and, per version, the exact `dockerfile` it was built from                   | what the UI shows, the image the sandbox layer boots, and how to rebuild any version on another provider          |

Each version is published once and never rebuilt, so a project restored against an older
version gets exactly that image. The next version number comes from what the database, R2
and E2B hold together; a number used anywhere is never reused, so a database reset
doesn't break the sync. Every template ships a full `.gitignore`, because each project's
files are pushed to GitHub.

**Image contract.** Sandbox scripts (autosave, restore, git, the agent's search) run inside
the image, so every template must provide `bash`, `git` 2.30 or newer, `curl`, `tar`, `gzip`
and `rg`, commands running as `user`, the project at `/home/user/app` writable by that
user, and outbound HTTPS to GitHub and R2. `templates:sync` opens one sandbox from each new
image and checks all of it before publishing; a failing image is never published. See
[the executable image contract](src/image-contract.ts).

**Writing a template's Dockerfile.** Single stage (`FROM` once). Build steps run as `root`
until `USER user`: install system packages first, give `/home/user/app` to `user`, then
switch to `USER user` before copying the project lockfile and running `npm ci` or the
Python requirements lock, so the files are the user's to edit and image builds do not
resolve fresh dependencies. No `CMD`/`ENTRYPOINT`: nothing starts at boot. COPY paths are
relative to the template's folder.

## Syncing

```bash
cd packages/templates
bun run templates:sync                  # every template
bun run templates:sync nextjs-starter   # just one
bun run templates:sync -- --force       # publish a new version even if content is unchanged
```

`templates:sync` hashes each template's `code/`, its `Dockerfile` and its machine size, and
compares that against the `contentHash` its `Template` row was published with.

- **Hash matches** — the template is already live. Nothing is built; the
  description, tag and metadata columns are refreshed and that is all. This
  costs one query and some local hashing, no E2B or R2 traffic.
- **Hash differs** — the code or the Dockerfile changed. A new version is built,
  checked against the image contract, zipped, uploaded and recorded, and the
  `Template` row points at it.

Metadata is deliberately outside the hash: fixing a typo in a description should
never rebuild an image, and the columns are rewritten on every run anyway.

Needs `DATABASE_URL` (from `packages/database/.env`) and `E2B_API_KEY` + `R2_*`
(from `apps/orchestrator/.env`, with `SANDBOX_PROVIDER` and `SANDBOX_PLAN` if set); the
script loads both files itself.

### Versioning

The `version` in `template.ts` is what a template publishes as, as long as it is
ahead of what is already live — that is how you cut a deliberate minor or major
release. If the code changed but the declared version did not move, the sync
takes the patch itself and says so, so nobody has to remember to bump anything.

## Where this should run

Run publication explicitly after changing a template and configuring provider,
storage and database access. It builds images and opens validation sandboxes, which
can incur charges. Application startup does not publish templates.

CI publication can be added later; no automatic template publication workflow is
currently included in this repository.

## Adding or changing a template

1. Edit `code/` or the `Dockerfile`, or add `templates/<name>/{template.ts,Dockerfile,code/}`.
2. Register it in `src/registry.ts` (new templates only).
3. `bun run templates:sync <name>`.

Bumping `version` in `template.ts` is optional — do it when you want a minor or
major release rather than the automatic patch.

## Opening a sandbox from one

The browser only ever sends a project id. api-server reads the project's template row and
passes its image name (`Template.imageRef`) to the orchestrator's
`POST /api/v1/sandbox/:projectId/ensure`.

## Dependencies and checks

Node starters with dependencies commit `package-lock.json` and install with
`npm ci`. The Python FastAPI starter uses `requirements.lock`. Update the
corresponding lockfile when changing a starter's dependencies.

Files inside `code/`, including READMEs, contribute to the template content hash.
Adding or changing a starter guide can therefore trigger a new template version
at the next explicit sync.

From the repository root:

```powershell
bun run --cwd packages/templates typecheck
bun run --cwd packages/templates lint
```

Generate the [database client](../database/README.md) first on a fresh checkout.
Provider integration is implemented in [@forgeAI/sandbox-provider](../sandbox-provider/README.md).
