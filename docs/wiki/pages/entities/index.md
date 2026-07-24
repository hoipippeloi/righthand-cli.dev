# Entities

_Concrete named things will be listed here._
- [righthand cli](./righthand-cli.md) - **righthand cli** is the product this repository builds: an always-available CLI that a **main / coding LLM** can hand tasks off to. The coding agent focuses on
- [llm command](./llm-command.md) - **`righthand llm`** is the user-facing command that wraps [[llm-provider-integration]]'s `complete()`. It is the thinnest possible surface over the LLM: send a 
y point — `complete()` —
- [plugins command](./plugins-command.md) - What it is
- [doctor command](./doctor-command.md) - **`righthand doctor`** is the read-only health & integration diagnostics command (capability [[c10-diagnostics]] / `decisions/diagnostics-command-righthand-doct
- [web command](./web-command.md) - **`righthand web`** is the command that launches the visual command-runner webapp. It is a long-running **foreground** command: it starts a stdlib HTTP server,
- [Publish build pipeline](./publish-build-pipeline.md) - **The publish build pipeline** compiles the TypeScript source in `src/` into ESM JavaScript in `dist/` at publish time, so the published npm package's `bin` is 
