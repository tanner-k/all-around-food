# docs/

## Scope
- `architecture.md` — high-level system diagram + component descriptions
- `decisions/` — ADRs (architectural decision records), one per file, numbered
- Long-form notes that don't belong in a folder's `context.md`

## Not in scope
- README-level "how to install" → `README.md` at root
- Agent project map → `CLAUDE.md` / `AGENTS.md`
- Folder-local scope rules → that folder's `context.md`

## Conventions
- ADRs are immutable once status = Accepted. Supersede with a new ADR (link the old one).
- Numbering: `0001-`, `0002-`, … zero-padded to 4 digits
- Status values: `Proposed` / `Accepted` / `Superseded`
- One decision per ADR — if you find yourself documenting two things, split them

## Notes for agents
- When adding a new ADR, link it from `architecture.md` if it changes the system shape
- ADRs are cheap; write one whenever you make a non-obvious choice you'd want to explain later
