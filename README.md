# storytree

**Storytree 0.3.** Storytree is the observability layer beside your coding agent. You build a
project with Claude Code or Codex, and storytree shows you what is being built: each project as a
forest that grows as stories land, an arc surface for what is planned, in progress and done, and a
plain-language view of how each story works and whether it is healthy. Health shows what the agent
*reported* separately from what storytree *verified* for itself.

## Where this stands

This repo is new. Its first story is the **library**: the project-scoped store every later story
reads and writes. It holds the plan of work (arcs, stories, capabilities, contracts), each item's
health, and what the project has learned. It runs on a local Postgres, with one database per
project and an optional Google Cloud connection. Its eight capabilities are listed in
[`stories/library.md`](stories/library.md).

## Generations

- **0.1**: the original Rust project.
- **0.2**: the TypeScript storytree, frozen, at
  [`storytree-ai/storytree02`](https://github.com/storytree-ai/storytree02). It is the tool that
  builds 0.3, and its behaviour is the reference 0.3 ports from. Its code is never copied wholesale.
- **0.3**: this repo, a stripped-down rebuild with its own desktop app and its own local database.

## License

Storytree is **source-available**, not open source: it is licensed under the
[PolyForm Shield License 1.0.0](LICENSE). Anyone, businesses included, may use, modify and embed it;
the one thing the license does not allow is providing a product that competes with storytree.
Competing use needs a separate grant from the owner.
