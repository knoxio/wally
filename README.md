# wally

Turns a black-and-white PNG into a tiled, printable wall relief: one height field
for the whole panel, sliced into watertight STL tiles that line up exactly.

Everything is local and deterministic. No modelling service, no mesh generation,
no attempt to reproduce or alter the source pattern — the image you give it is
the image it prints.

## What it produces

With the defaults, from one PNG:

- 45 tiles, `r01-c01.stl` through `r05-c09.stl`, 150 x 150 mm each, forming a
  1350 x 750 mm panel in 9 columns and 5 rows.
- `connector.stl`, the key that locks neighbouring tiles together.
- `placement-map.svg` and `placement-map.md`, a numbered map of what goes where.
- `manifest.json`, the exact parameters used plus per-tile triangle counts,
  volumes and watertightness results.

Every tile is 2 mm of base with the pattern standing 3.75 mm proud of it.

## Use

```sh
pnpm install
```

### Command line

```sh
pnpm export --input pattern.png --out ./out
```

That writes the full 45-tile panel with the defaults. Every field of `Params` is
a flag, in either `--kebab-case` or `--camelCase`, so nothing about the panel is
baked in:

```sh
pnpm export --input pattern.png --out ./out \
  --panel-width-mm 900 --panel-height-mm 600 --columns 6 --rows 4 \
  --relief-height-mm 3.5 --bevel-width-mm 3 --profile filleted \
  --base-fillet-frac 0.4 --top-round-frac 0.3 --tile-edge-chamfer-mm 1.5 \
  --no-interlock-enabled
```

`pnpm export --help` lists every flag with its default. `--no-verify` skips the
manifold check on very large panels. The exporter exits non-zero if any tile
comes out not watertight, so a green run means the meshes are sound.

### Browser

```sh
pnpm dev
```

Pick a PNG, adjust anything, and watch the shaded preview of the whole panel with
the cut lines and tile numbers drawn over it. The readout gives tile size,
mounted size, the snapped sample pitch, triangle count and material estimate.
Export downloads the whole set as a zip.

The preview uses `previewPitchMm`; the export always uses `samplePitchMm`.

## Geometry

**One height field, then cut.** The panel is evaluated once, on a single grid.
The sample pitch is snapped so that a tile holds a whole number of samples, which
makes tile boundaries fall exactly on grid lines. Tiles are integer slices of
that grid, so the samples along a shared edge are literally the same numbers in
both tiles — not merely close. Nothing is ever re-evaluated per tile.

**Not extruded clip art.** The thresholded image becomes a signed distance field,
and height follows a profile across a bevel band of a chosen physical width
rather than jumping at a pixel boundary. The default `filleted` profile is a
parabola-line-parabola S-curve that leaves the base plane and arrives at the
plateau with zero slope, so there is a real fillet at the bottom of every ridge
and a round-over along every top edge. Because the field is a distance field, the
rounding is isotropic: plan-view corners come out radiused, not mitred.

Five independent smoothing controls, in millimetres or as fractions of the band:

| Control | What it rounds |
| --- | --- |
| `cornerRadiusMm` | Corners of the pattern seen from above |
| `bevelWidthMm` | Width of the slope from base to plateau |
| `baseFilletFrac` | The concave joint at the bottom of a ridge |
| `topRoundFrac` | The convex round-over at the top edge of the relief |
| `tileEdgeChamferMm` | The lip where the relief meets the tile border |

**Watertight by construction.** A tile is two height fields over one grid, so the
side walls always connect matching vertex rings and no T-junction can occur.
Every mesh is checked before it is written: closed, consistently wound, Euler
characteristic 2. Export fails loudly rather than shipping a mesh that is not.

**Nothing infill-dependent.** Solid base, no internal cavities, no thin floating
shells. The only recesses are in the back face and they break out at the tile
edge, so the slicer bridges them across their short axis without support.

## Locking the tiles together

The tiles are mounted with 5 mm visible gaps, so they never touch and no edge
joint is possible. The lock is therefore on the back.

Each edge that meets another tile carries an open-ended rebate in the back face:
60 mm along the edge, 12 mm into the tile, 1 mm deep. Two facing rebates plus the
mounting gap form a single flat slot, and a printed connector plate drops into
it, spanning the joint.

Once both tiles are up, the plate is captured in every direction by geometry
alone: the closed inner end of each rebate stops it sliding along the joint, and
the rebate sides stop it sliding across. It holds neighbours coplanar and keeps
the gap even, and nothing shows from the front. The plate sits one clearance
below the back face, so the panel still lies flat against the backing board.

A 9 x 5 panel needs 76 connectors. Set `interlockEnabled` to false if you would
rather register the tiles off the backing board alone.

## Printing

Sized for a Bambu P1S with a 0.4 mm nozzle at 0.2 mm layers, in matte ivory PLA.
Tiles print face up, straight on the bed, no supports. A 150 mm tile fits the
plate one at a time.

The 5 mm mounting gaps are not part of any STL. The mounted panel is therefore
larger than the modelled panel: 1390 x 770 mm with the default gaps.

Material figures reported by the tool are solid volume — the upper bound a 100 %
infill print would reach. A real print with sparse infill uses substantially
less.

## Development

```sh
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm verify      # typecheck, test, build
```
