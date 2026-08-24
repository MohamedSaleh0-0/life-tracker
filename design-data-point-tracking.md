# Design — Data Point Tracking Module (abridged)

*Full design doc format matches design-habit-tracking.md's structure;
this pass focuses on resolving the two Open Questions blocking
implementation, plus the storage format they cascade into. Revisit for
a full write-up alongside a UI/UX pass, same as Habit Tracking.*

## Resolved Open Question — storage format for multi-entry days

Chosen: **(b) suffixed inline-field keys**, but the id lives in the
*value*, not smashed into the key, to avoid an ambiguous-to-parse key
(two ids concatenated with no reserved separator character, since
nanoid's alphabet includes `-`/`_`).

Format, one field per **entry** (not per data point):

```
- 2026-08-19 [dp-<entryId>:: <definitionId>|08:15|250]
```

- `dp-<entryId>` — entryId alone as the key, exactly like Habit
  Tracking's `habit-<id>` pattern (REQ-C010's "keyed by each item's own
  id" — entryId *is* that item now that entries, not data points, are
  the loggable unit).
- Value is `definitionId|HH:MM|rawValue`, split on the first two `|`
  characters only (rawValue may itself contain `|`, e.g. free text —
  the split is capped at 2, so the third segment onward all belongs to
  rawValue).
- **Known limitation, flagged rather than engineered around:** a text
  entry's value can't contain the literal `]` character (would
  terminate the bracket early) — same class of limitation Habit
  Tracking already accepts for its own bracket-delimited format.

Rejected: (a) array-style single field per data point per day — harder
to address/edit/delete one entry among several without re-serializing
the whole field, and non-Dataview-queryable as a scalar per entry.

## Resolved Open Question — trend chart aggregation for multi-entry days

Chosen: **(a) every individual entry as its own point**, plotted
against its logged timestamp (date + time), not aggregated. Simplest,
most information-preserving, and avoids needing a new per-data-point
aggregation-mode setting (REQ-C006-style) before shipping. A daily
aggregate mode (mean/sum/min/max) is easy to add later as an
opt-in toggle without a storage migration, since it's a pure
presentation-layer transform over the same entries — revisit if
requested.

## Traceability
Same requirement IDs as requirements-data-point-tracking.md
(REQ-D001–D013); architecture mirrors design-habit-tracking.md's
domain → application → infrastructure → ui layering.
