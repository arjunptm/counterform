# Counterform

Local-first CS2 map-sketching and match-configuration tools.

Use **Map Sketcher** for a rotationally symmetric arena blockout, **Match
Config** for a human-readable persistent server CFG, or use both independently
in the same project. Match Config includes searchable curated settings, four
presets, semantic warnings, a live match-duration/behavior preview, editable
JSON, and commented `.cfg` export. One-shot and arbitrary commands are excluded.
See the [Match Config guide](MATCH_CONFIG_GUIDE.md) for the complete workflow.

Canvas geometry snaps to a selectable Hammer-unit grid. Zoom around the pointer,
then use **Pan**, middle-mouse drag, or Space-drag to navigate; **Fit** restores
the overview. The tool rail can be hidden when more canvas room is useful.

This public repository is an automated deployment mirror. Its files are
published from the private map-generation repository and should not be edited
directly.

The editor runs entirely in the browser. Designs are saved in local browser
storage and can be exported or reopened as JSON. Its blockout palette includes
cardinal-direction ramps with a validated fixed 2:1 run-to-rise slope.
Schema-v3 sketches also expose base elevation and explicit named placement on
floors, bridges, and raised regions, with embedded-solid detection before a
design can build.
