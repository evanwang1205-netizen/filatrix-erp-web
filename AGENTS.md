# Filatrix ERP Web repository instructions

- This file contains workflow guardrails only. Business truth lives in the documents listed in `docs/README.md`.
- Before substantial work, read `docs/README.md` and sections 0-6 of `docs/erp-web-next-session-handoff.md`. Then search and read the relevant sections of the blueprint and fact model for the task at hand.
- Authority order: the user's latest explicit decision, `docs/erp-web-prototype-blueprint.md`, `docs/erp-web-business-fact-model.md`, then the handoff and secondary design documents. Code and current UI are implementation evidence, not higher authority.
- Preserve existing worktree changes. Inspect the current code, data, and running page before editing; do not overwrite unrelated user work.
- `server/data/erp-data.json` is the shared test-data snapshot. Do not reset, replace, delete, or broadly reseed it unless the user explicitly requests that operation. Use isolated temporary data for write-heavy tests.
- Do not restore the retired standalone finance module, asset purchasing, or asset ledger. Do not modify accepted PDF/print templates unless the user explicitly asks.
- Keep business state, quantities, permissions, source-line links, revisions, idempotency, and cross-module ownership consistent with the two highest-authority documents.
- After code changes, run the smallest relevant smoke tests plus `npm run build`; for visible behavior, also verify the real page in the browser. Documentation-only changes do not require a production build.
- Update authoritative documents only when a real business decision or verified implementation contract changes. Mark superseded rules explicitly; do not turn audit logs or temporary observations into product authority.
