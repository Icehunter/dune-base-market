# DB Snapshots — Immutable Source of Truth

Raw PostgreSQL exports from the live game DB. **Do not modify.** These files document
the exact format the game writes for solido (blueprint) data and serve as ground truth
for any read/write round-trip the app implements.

## Source

- Server: `dune@192.168.0.72` → kubectl pod `sh-ec68e59f636959ac-kbzgra-db-dbdepl-sts-0`
  in namespace `funcom-seabass-sh-ec68e59f636959ac-kbzgra`
- Database: `dune` (PostgreSQL), schema `dune`, port `15432`, user `dune`
- Snapshot timestamp: 2026-05-18

## Files

| File | Source query | Notes |
|------|--------------|-------|
| `blueprint_10_meta.psv` | `dune.building_blueprints WHERE id = 10` | Owner + map blob (empty) |
| `blueprint_10_instances.psv` | `dune.building_blueprint_instances WHERE building_blueprint_id = 10` | 236 building pieces (instance_id, building_type, transform) |
| `blueprint_10_placeables.psv` | `dune.building_blueprint_placeables WHERE building_blueprint_id = 10` | Furniture / non-building objects |
| `blueprint_10_item.psv` | `dune.items WHERE id = 10766174` | Solido replicator item containing the blueprint pointer |

## Blueprint 10 = Narisa's current solido replicator

- Item `10766174` (template `BuildingBlueprint_CopyDevice`) lives in Narisa's inventory (`inventory_id=18`)
- Item stats encode the blueprint reference: `"PlayerBlueprintId": "!!bbp#10"` → `building_blueprint_id = 10`
- 236 building piece instances, 26 unique `building_type` values

## Schema notes

### `building_blueprint_instances`

| Column | Type | Notes |
|--------|------|-------|
| building_blueprint_id | bigint | FK → building_blueprints.id |
| instance_id | int | Per-blueprint unique |
| building_type | text | Matches our `templateId` strings 1:1 (e.g. `Atreides_Outpost_Floor`) |
| transform | real[] | `[0:3]={X, Y, Z, rotation_degrees}` — 4 floats |
| provides_stability | bool | |
| health | real | |
| hologram | bool | |

### Transform format

`real[4]` indexed `[0:3]`: `{X, Y, Z, rotation_degrees}`

- X, Y in UE world units (1 foundation tile = 512 units)
- Z is vertical, integer multiples of 384 (floor height) or 0 (foundation)
- Rotation: degrees only (NOT quaternions despite the project_solido_replicator memory's mention of quaternions — that was for a different table)
- Valid rotations observed: `0`, `90`, `180`, `-90`, plus tiny floating-point noise (e.g. `1.4e-14` instead of exactly `0`)

### Items table → blueprint linkage

```
items.id  →  items.stats."FBuildingBlueprintItemStats".PlayerBlueprintId  →  "!!bbp#<id>"  →  building_blueprints.id
```

## Important findings for the dune-base-designer app

1. **`defaultBaseData.ts` template IDs are correct** — the strings used in our code
   (`Atreides_Outpost_Floor`, `Atreides_Outpost_Wall_04`, `MTX_Atreides_Outpost_Bookshelf`, etc.)
   match the DB's `building_type` column character-for-character. No remapping needed.

2. **No "Floor_02" or "Floor_Hexagonal" piece exists** — the hexagonal floor tile pattern
   visible in-game comes from the *material/texture* applied to the single
   `Atreides_Outpost_Floor` mesh, not from a different piece. The renderer should use
   `T_MLS_Concrete_Atreides_Floor_Hexagonal_01_D.png` as that piece's albedo texture.

3. **Coordinate system**: DB uses UE's `(X, Y, Z=up)`. Our BabylonJS scene swaps to
   `(X, Z, Y=up)` via `new Vector3(piece.position.x, piece.position.z, piece.position.y)`
   in `SceneCanvas.tsx`. Keep this swap; do not change the stored format.

4. **Round-trip safety**: when the app eventually writes solido data back to the DB,
   it must preserve the `real[]` transform format and the `building_type` strings
   exactly — no normalization (e.g. don't snap `1.4e-14` to `0` unless you also
   verify the game accepts that), no template_id renaming.
