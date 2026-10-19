# runtime-base

A broad runtime image for GitHub imports and unknown stacks.

It includes Node, Python, Go, build tools, bash, curl, git, tar, gzip and
ripgrep. The source is only a placeholder; imported repositories are expected
to replace it.

```bash
npm ci
npm run dev
```

Run these commands from the project root. The placeholder [server.js](server.js)
serves a status page on port 3000; set `PORT` to override it. The broad toolchain
comes from the ForgeAI runtime image, not from `npm ci`. Outside that image,
install the runtimes required by the repository you are importing.
