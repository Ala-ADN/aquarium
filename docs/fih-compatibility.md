# Fih design compatibility

`src/fih/design.ts` owns persisted design decoding and serialization. Runtime
`FihDesign` remains independent of storage metadata. New designs are stored with
`schemaVersion: 1`; the existing unversioned, three-part format is treated as v0.
There is no database rewrite on load. An existing test record upgrades on the
owner's next explicit release, retaining its original `createdAt`.

Local visit envelopes have their own `schemaVersion: 1` and use
`aquarium.visitor.v4`. The reader supports the previous v1/v2/v3 keys, leaving
them intact. Pre-three-part saves go through the legacy adapter and the same
design decoder. Historical migration defaults are pinned rather than imported
from the creator. Existing `tiny`/`long` and `beak` aliases retain the previous
migration to `classic` and `pointed`.

The release outbox uses `aquarium.pending.v2` and versioned designs. The old
outbox is recovered if no newer entry exists and removed only after a successful
save. Separate keys prevent previously deployed clients from replacing the new
local formats. Unknown versions and unknown fields in explicitly versioned
designs are preserved, not stripped and resaved. A future local format suppresses
fallback to stale older saves. An unsupported cloud design is omitted from this
client's tank; transaction retries refuse to overwrite it.

## Adding or retiring styles

- Add a stable ID and its geometry to the supported catalog, and include it in
  the database rule allowlist. New fields are not necessary for a new shape.
- To retire an option, set `selectable: false` in the supported body, fin, or
  head catalog. Keep the ID, geometry, label, TypeScript union member, and rules
  entry. Readers, descriptions, previews, and saved drafts still support it;
  randomization and new selections exclude it. Editing other properties does
  not replace a saved retired shape.
- Preserve the old implementation when changing a style's appearance. Give a
  materially different shape a new ID instead of changing an existing one.

## Changing the stored format

1. Add explicit decoding/migration for every retained format in `design.ts`.
   Bump `FIH_DESIGN_VERSION` when changing the contract, including new fields
   that old writers would discard. Update supported-version detection together
   with the migrations. Do not reuse existing version numbers or historical
   defaults. A schema version identifies data interpretation, not a frozen
   rendering engine; keep legacy rendering definitions where appearance matters.
2. Update bounded database validation for the accepted formats and keep the
   downgrade check. All new writes require an explicit version. Ownership,
   timestamp validation, the ten-second cooldown, and the kill switch still apply.
3. Deploy readers and compatible rules before enabling new-format writes.
   Keep older formats readable during rollout; older writers must never remove
   fields from a newer record. An unsupported version must remain unwritable by
   the old client. Transactions recheck the record on every retry.
4. Extend `tests/fixtures/fih-saves.json` with an immutable sample of the new
   format and test migration, appearance, round trips, unsupported versions,
   local/outbox preservation, and rule-enforced downgrade rejection. Run
   `pnpm test`, `pnpm test:rules`, and `pnpm build`.

This layer adds no effect controls, file uploads, Cloud Storage, or paid services.
The rules changes are local until deployed; deploy them alongside this client
before using shared saves. Legacy clients' unversioned writes will be rejected.
