(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MapSketchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MATERIAL = "materials/dev/reflectivity_30.vmat";
  const GENERATOR_KINDS = new Set(["floor", "wall", "cover", "low_cover", "crate", "bridge", "elevated", "ramp"]);
  const RECT_KINDS = new Set([...GENERATOR_KINDS, "water_void", "stairs", "jump"]);
  const ANNOTATION_KINDS = new Set(["measure", "sightline"]);
  const RAMP_DIRECTIONS = new Set(["x+", "x-", "y+", "y-"]);
  const RAMP_OPPOSITES = { "x+": "x-", "x-": "x+", "y+": "y-", "y-": "y+" };
  const DEFAULT_GRID = 32;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function defaultSpec() {
    return {
      schema_version: 1,
      sketch_schema_version: 2,
      design_approved: false,
      map_name: "research_1v1_generated",
      symmetry: { mode: "rotation", center: [0, 0] },
      fixture_roles: {
        cuboid_node_id: 5,
        ct_spawn_node_id: 11,
        t_spawn_node_id: 12,
        preserve_entity_node_ids: [16, 23, 33, 36],
      },
      allowed_materials: [MATERIAL],
      geometry: [{
        name: "arena_floor", center: [0, 0, -32], size: [2048, 1280, 64],
        material: MATERIAL, mirror: false, editor_kind: "floor",
      }],
      sketch_elements: [],
      sketch_annotations: [],
      spawns: {
        ct: { origin: [-768, 0, 16], angles: [0, 0, 0] },
        t: { origin: [768, 0, 16], angles: [0, 180, 0] },
      },
      sketch_settings: { grid: DEFAULT_GRID, view_width: 2560, view_height: 1792 },
    };
  }

  function rotatePoint(point, center) {
    return [2 * center[0] - point[0], 2 * center[1] - point[1], point[2] ?? 0];
  }

  function pairedSpawn(spawn, center) {
    return {
      origin: rotatePoint(spawn.origin, center),
      angles: [spawn.angles[0], (spawn.angles[1] + 180) % 360, spawn.angles[2]],
    };
  }

  function cleanNumber(value) {
    const rounded = Math.round(Number(value) * 1e9) / 1e9;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function snap(value, grid) { return cleanNumber(Math.round(Number(value) / grid) * grid); }

  function snapRectToGrid(item, spec, grid = Number(spec.sketch_settings?.grid || DEFAULT_GRID)) {
    if (!item?.center || !item?.size) return item;
    const symmetry = spec.symmetry.center;
    const centered = item.editor_kind === "floor" || (
      item.center[0] === symmetry[0] && item.center[1] === symmetry[1] && item.mirror === false
    );
    for (let axis = 0; axis < 2; axis++) {
      if (centered) {
        item.center[axis] = symmetry[axis];
        item.size[axis] = Math.max(2 * grid, snap(item.size[axis], 2 * grid));
      } else {
        item.size[axis] = Math.max(grid, snap(item.size[axis], grid));
        const cellCount = Math.round(item.size[axis] / grid);
        const centerOffset = cellCount % 2 ? grid / 2 : 0;
        item.center[axis] = cleanNumber(snap(item.center[axis] - centerOffset, grid) + centerOffset);
      }
    }
    item.mirror = item.editor_kind === "floor" ? false : item.center[0] !== symmetry[0] || item.center[1] !== symmetry[1];
    return item;
  }

  function snapSpecToGrid(spec, requestedGrid) {
    const grid = [16, 32, 64, 128].includes(Number(requestedGrid)) ? Number(requestedGrid) : DEFAULT_GRID;
    spec.sketch_settings.grid = grid;
    allElements(spec).forEach((item) => snapRectToGrid(item, spec, grid));
    (spec.sketch_annotations || []).forEach((item) => {
      item.start = item.start.map((value) => snap(value, grid));
      item.end = item.end.map((value) => snap(value, grid));
    });
    spec.spawns.ct.origin[0] = snap(spec.spawns.ct.origin[0], grid);
    spec.spawns.ct.origin[1] = snap(spec.spawns.ct.origin[1], grid);
    spec.spawns.t = pairedSpawn(spec.spawns.ct, spec.symmetry.center);
    return spec;
  }

  function slug(value) {
    return String(value || "object").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "object";
  }

  function allElements(spec) { return [...spec.geometry, ...(spec.sketch_elements || [])]; }
  function allNamed(spec) { return [...allElements(spec), ...(spec.sketch_annotations || [])]; }

  function uniqueName(spec, base, ignoreName) {
    const used = new Set(allNamed(spec).map((item) => item.name).filter((name) => name !== ignoreName));
    let name = slug(base); let index = 2;
    while (used.has(name)) name = `${slug(base)}_${index++}`;
    return name;
  }

  function findElement(spec, name) { return allElements(spec).find((item) => item.name === name) || null; }
  function findAnnotation(spec, name) { return (spec.sketch_annotations || []).find((item) => item.name === name) || null; }

  function addElement(spec, item) {
    const target = GENERATOR_KINDS.has(item.editor_kind) ? spec.geometry : spec.sketch_elements;
    target.push(item); return item;
  }

  function removeElement(spec, name) {
    spec.geometry = spec.geometry.filter((item) => item.name !== name);
    spec.sketch_elements = spec.sketch_elements.filter((item) => item.name !== name);
  }

  function moveElementBucket(spec, item, previousKind) {
    const wasGeometry = GENERATOR_KINDS.has(previousKind);
    const isGeometry = GENERATOR_KINDS.has(item.editor_kind);
    if (wasGeometry === isGeometry) return;
    removeElement(spec, item.name);
    addElement(spec, item);
  }

  function normalizeRect(item, spec) {
    item.editor_kind ||= item.name === "arena_floor" ? "floor" : "cover";
    if (!RECT_KINDS.has(item.editor_kind)) item.editor_kind = "cover";
    item.material ||= spec.allowed_materials[0];
    item.center = [Number(item.center?.[0] || 0), Number(item.center?.[1] || 0), Number(item.center?.[2] || 0)];
    item.size = [Number(item.size?.[0] || 32), Number(item.size?.[1] || 32), Number(item.size?.[2] || 32)];
    if (item.editor_kind === "ramp") {
      item.ascent = RAMP_DIRECTIONS.has(item.ascent) ? item.ascent : item.size[0] >= item.size[1] ? "x+" : "y+";
    } else delete item.ascent;
    const atCenter = item.center[0] === spec.symmetry.center[0] && item.center[1] === spec.symmetry.center[1];
    item.mirror = item.editor_kind === "floor" ? false : !atCenter;
    if (["elevated", "bridge", "stairs", "jump", "ramp"].includes(item.editor_kind)) item.walkable_below = false;
    return snapRectToGrid(item, spec);
  }

  function normalizeSpec(input) {
    if (!input || input.schema_version !== 1) throw new Error("Only schema version 1 designs are supported.");
    if (input.symmetry?.mode !== "rotation" || !Array.isArray(input.symmetry.center)) throw new Error("This sketcher opens 180-degree rotational designs only.");
    if (!Array.isArray(input.geometry) || !input.spawns?.ct) throw new Error("The JSON is missing geometry or spawn data.");
    const spec = clone(input);
    spec.sketch_schema_version = 2;
    spec.design_approved = false;
    spec.allowed_materials = Array.isArray(spec.allowed_materials) && spec.allowed_materials.length ? spec.allowed_materials : [MATERIAL];
    spec.sketch_elements = Array.isArray(spec.sketch_elements) ? spec.sketch_elements : [];
    spec.sketch_annotations = Array.isArray(spec.sketch_annotations) ? spec.sketch_annotations : [];
    spec.sketch_settings = Object.assign({ grid: DEFAULT_GRID, view_width: 2560, view_height: 1792 }, spec.sketch_settings);
    const incomingElements = [...spec.geometry, ...spec.sketch_elements].map((item) => normalizeRect(item, spec));
    spec.geometry = [];
    spec.sketch_elements = [];
    incomingElements.forEach((item) => addElement(spec, item));
    spec.sketch_annotations = spec.sketch_annotations.filter((item) => ANNOTATION_KINDS.has(item.editor_kind)).map((item) => ({
      name: slug(item.name), editor_kind: item.editor_kind,
      start: [Number(item.start?.[0] || 0), Number(item.start?.[1] || 0)],
      end: [Number(item.end?.[0] || 0), Number(item.end?.[1] || 0)], mirror: item.mirror !== false,
    }));
    spec.spawns.t = pairedSpawn(spec.spawns.ct, spec.symmetry.center);
    return snapSpecToGrid(spec, spec.sketch_settings.grid);
  }

  function validateDraft(spec) {
    const errors = []; const warnings = []; const names = new Set();
    if (!/^[a-z0-9_]+$/.test(spec.map_name)) errors.push("Map name must use lowercase letters, numbers, and underscores.");
    if (!spec.geometry.some((item) => item.editor_kind === "floor")) errors.push("Add a floor before generating the map.");
    allNamed(spec).forEach((item) => {
      if (names.has(item.name)) errors.push(`Duplicate object name: ${item.name}.`); names.add(item.name);
      if (item.size && item.size.some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`${item.name} has an invalid size.`);
      if (item.center) {
        const atCenter = item.center[0] === spec.symmetry.center[0] && item.center[1] === spec.symmetry.center[1];
        if (item.editor_kind !== "floor" && item.mirror === atCenter) errors.push(`${item.name} has an invalid symmetry setting.`);
      }
      if (item.editor_kind === "elevated" && item.walkable_below !== false) errors.push(`${item.name} must be single-surface elevation.`);
      if (item.editor_kind === "ramp") {
        if (!RAMP_DIRECTIONS.has(item.ascent)) errors.push(`${item.name} has an invalid ramp ascent direction.`);
        else {
          const runAxis = item.ascent.startsWith("x") ? 0 : 1;
          if (item.size[runAxis] !== 2 * item.size[2]) errors.push(`${item.name} ramp run must equal twice its rise.`);
        }
        if (item.walkable_below !== false) errors.push(`${item.name} must be a solid ramp.`);
      }
    });
    if (allElements(spec).length === 1) warnings.push("The draft contains only the arena floor.");
    if (spec.sketch_elements.length) warnings.push(`${spec.sketch_elements.length} sketch element${spec.sketch_elements.length === 1 ? "" : "s"} will need deliberate Hammer implementation.`);
    if (spec.design_approved) errors.push("Editor drafts must remain unapproved until reviewed.");
    return { errors, warnings };
  }

  function exportSpec(spec) {
    const output = snapSpecToGrid(clone(spec), spec.sketch_settings.grid); output.design_approved = false;
    output.spawns.t = pairedSpawn(output.spawns.ct, output.symmetry.center);
    return output;
  }

  return {
    MATERIAL, DEFAULT_GRID, GENERATOR_KINDS, RECT_KINDS, ANNOTATION_KINDS, RAMP_DIRECTIONS, RAMP_OPPOSITES, clone, defaultSpec,
    rotatePoint, pairedSpawn, cleanNumber, snap, snapRectToGrid, snapSpecToGrid, slug, allElements, allNamed, uniqueName,
    findElement, findAnnotation, addElement, removeElement, moveElementBucket,
    normalizeSpec, validateDraft, exportSpec,
  };
});
