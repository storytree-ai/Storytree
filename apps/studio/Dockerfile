# The hosted studio image (ADR-0042 d.1, studio-cloud `container-image`).
#
# Build context = the REPO ROOT (infra/studio-cloudbuild.yaml passes `-f` here):
# the server needs the workspace packages (raw-TS, tsx-run — the house no-build
# posture) plus the docs/ + stories/ SNAPSHOT it serves. The image carries NO
# credentials (ADR-0021): Cloud SQL auth is the runtime service account's
# ambient ADC through the Node connector.
#
# Single stage on purpose: pnpm's symlinked node_modules doesn't survive a
# cross-stage COPY cleanly, and the demo service doesn't need a slim image.

FROM node:24-slim
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

COPY . .
# Install ONLY studio's workspace closure (`--filter studio...`): a full-workspace
# install would also build apps/desktop's node-pty, whose node-gyp compile needs
# Python — absent in node:24-slim — and download electron. Desktop-only native
# deps must never gate the studio image.
RUN pnpm install --frozen-lockfile --filter studio... && pnpm --filter studio build

ENV NODE_ENV=production
EXPOSE 8080
# Run from the studio package: `--import tsx` resolves from CWD, and tsx lives
# in apps/studio's node_modules, not the workspace root's. serve.ts resolves
# repo paths (docs/, stories/, dist/) from its module location, so CWD here is
# only about module resolution, never about data paths.
WORKDIR /app/apps/studio
CMD ["node", "--import", "tsx", "server/serve.ts"]
