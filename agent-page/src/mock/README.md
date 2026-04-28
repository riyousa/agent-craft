# Mock data layer

Frontend stubs for fields the design uses but the backend doesn't yet
expose. Each file here exports an async function with the same signature
the real API will eventually have, so call sites stay unchanged when the
backend lands.

## When to use

- The design surface needs a value (`runs_7d`, `risk_level`, `team_owner`,
  `monthly_spend_cny`, …) that has no DB column or aggregation today.
- The user explicitly asked to ship the UI now and patch the backend later
  (see `design_update.md` Phase 4).

## When NOT to use

- The data already exists on the backend — call the real `userApi` /
  `adminApi` and surface what's there. Don't fabricate values just because
  the design shows realistic ones.

## How to retire a mock

When the backend ships the real field:

1. Replace the body of the mock function with a `userApi.xxx()` call.
2. Keep the exported signature identical.
3. Delete the file once all callers are migrated and the `xxx()` call is
   inlined directly.
