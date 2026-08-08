# Counterform

A local-first, rotationally symmetric CS2 arena blockout sketcher.

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
