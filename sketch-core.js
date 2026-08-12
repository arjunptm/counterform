(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    api.configureMaterialThemes(require("./material-themes.json"));
    api.configureEnvironmentPresets(require("./environment-presets.json"));
    module.exports = api;
  }
  root.MapSketchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MATERIAL = "materials/dev/reflectivity_30.vmat";
  const GENERATOR_KINDS = new Set(["floor", "wall", "cover", "low_cover", "crate", "bridge", "elevated", "ramp", "stairs", "blocked_zone", "water", "void"]);
  const RECT_KINDS = new Set([...GENERATOR_KINDS, "water_void", "stairs", "jump"]);
  const ANNOTATION_KINDS = new Set(["measure", "sightline"]);
  const RAMP_DIRECTIONS = new Set(["x+", "x-", "y+", "y-"]);
  const RAMP_OPPOSITES = { "x+": "x-", "x-": "x+", "y+": "y-", "y-": "y+" };
  const MAX_WALKABLE_RISER = 18;
  // Any generated cuboid with a horizontal top can be an explicit support.
  // Sloped/stepped features are intentionally excluded because one top-Z value
  // cannot describe their walking surface.
  const SUPPORT_KINDS = new Set(["floor", "wall", "cover", "low_cover", "crate", "bridge", "elevated"]);
  const SUPPORTABLE_KINDS = new Set(["wall", "cover", "low_cover", "crate", "bridge", "elevated", "ramp", "stairs", "jump", "water", "void"]);
  const SOLID_KINDS = new Set([...GENERATOR_KINDS].filter((kind) => !["blocked_zone", "water", "void"].includes(kind)).concat(["stairs", "jump"]));
  const DEFAULT_GRID = 32;
  const LEGACY_CUSTOM_THEME = "legacy_custom";
  let materialThemeRegistry = {
    schema_version: 1,
    default_theme: "blockout",
    themes: [{
      id: "blockout", label: "Blockout", description: "Neutral development material.",
      materials: Object.fromEntries([...RECT_KINDS].map((kind) => [kind, MATERIAL])),
    }],
  };
  let environmentPresetRegistry = {
    schema_version: 1,
    default_preset: "controlled_daylight",
    presets: [{ id: "controlled_daylight", label: "Controlled daylight", description: "Accepted warm research-arena daylight." }],
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function configureMaterialThemes(registry) {
    if (!registry || registry.schema_version !== 1 || !Array.isArray(registry.themes) || !registry.themes.length) throw new Error("Invalid material-theme registry.");
    const ids = new Set();
    registry.themes.forEach((theme) => {
      if (!/^[a-z0-9_]+$/.test(theme.id) || ids.has(theme.id)) throw new Error(`Invalid or duplicate material theme: ${theme.id}.`);
      ids.add(theme.id);
      RECT_KINDS.forEach((kind) => {
        const material = theme.materials?.[kind];
        if (typeof material !== "string" || !material.startsWith("materials/") || !material.endsWith(".vmat")) throw new Error(`${theme.id} has no valid ${kind} material.`);
      });
    });
    if (!ids.has(registry.default_theme)) throw new Error("Material-theme registry has no valid default theme.");
    materialThemeRegistry = clone(registry);
  }

  function materialThemes() { return clone(materialThemeRegistry.themes); }
  function themeById(themeId) { return materialThemeRegistry.themes.find((theme) => theme.id === themeId) || null; }
  function materialForKind(themeId, editorKind, fallback = MATERIAL) { return themeById(themeId)?.materials?.[editorKind] || fallback; }
  function themeMaterialList(themeId) {
    const theme = themeById(themeId);
    return theme ? [...new Set(Object.entries(theme.materials).filter(([kind]) => !["blocked_zone", "water", "void"].includes(kind)).map(([, material]) => material))] : [];
  }

  function configureEnvironmentPresets(registry) {
    if (!registry || registry.schema_version !== 1 || !Array.isArray(registry.presets) || !registry.presets.length) throw new Error("Invalid environment-preset registry.");
    const ids = new Set();
    registry.presets.forEach((preset) => {
      if (!/^[a-z0-9_]+$/.test(preset.id) || ids.has(preset.id)) throw new Error(`Invalid or duplicate environment preset: ${preset.id}.`);
      ids.add(preset.id);
    });
    if (!ids.has(registry.default_preset)) throw new Error("Environment-preset registry has no valid default.");
    environmentPresetRegistry = clone(registry);
  }
  function environmentPresets() { return clone(environmentPresetRegistry.presets); }
  function environmentPresetById(id) { return environmentPresetRegistry.presets.find((preset) => preset.id === id) || null; }

  function applyMaterialTheme(spec, themeId) {
    const theme = themeById(themeId);
    if (!theme) throw new Error(`Unknown material theme: ${themeId}.`);
    spec.material_theme = themeId;
    spec.allowed_materials = themeMaterialList(themeId);
    allElements(spec).forEach((item) => { item.material = materialForKind(themeId, item.editor_kind); });
    if (allElements(spec).some((item) => item.editor_kind === "blocked_zone")) spec.allowed_materials.push(materialForKind(themeId, "blocked_zone"));
    if (allElements(spec).some((item) => ["water", "void"].includes(item.editor_kind))) spec.allowed_materials.push(materialForKind(themeId, "water"), materialForKind(themeId, "void"));
    return spec;
  }

  function inferMaterialTheme(spec) {
    if (spec.material_theme === LEGACY_CUSTOM_THEME || themeById(spec.material_theme)) return spec.material_theme;
    const elements = [...(spec.geometry || []), ...(spec.sketch_elements || [])];
    const match = materialThemeRegistry.themes.find((theme) => elements.every((item) => item.material === theme.materials[item.editor_kind]));
    return match?.id || LEGACY_CUSTOM_THEME;
  }

  function themeValidation(spec) {
    if (spec.material_theme === LEGACY_CUSTOM_THEME) return { errors: [], warnings: ["Imported custom materials are preserved. Select a stock map theme to replace them."] };
    const theme = themeById(spec.material_theme);
    if (!theme) return { errors: [`Unknown material theme: ${spec.material_theme}.`], warnings: [] };
    const errors = [];
    const expectedAllowed = new Set(themeMaterialList(theme.id));
    if (allElements(spec).some((item) => item.editor_kind === "blocked_zone")) expectedAllowed.add(materialForKind(theme.id, "blocked_zone"));
    if (allElements(spec).some((item) => ["water", "void"].includes(item.editor_kind))) { expectedAllowed.add(materialForKind(theme.id, "water")); expectedAllowed.add(materialForKind(theme.id, "void")); }
    const actualAllowed = new Set(spec.allowed_materials || []);
    if (expectedAllowed.size !== actualAllowed.size || [...expectedAllowed].some((path) => !actualAllowed.has(path))) errors.push(`Allowed materials do not match the ${theme.label} theme.`);
    allElements(spec).forEach((item) => {
      const expected = materialForKind(theme.id, item.editor_kind, null);
      if (!expected) errors.push(`${item.name} has no ${theme.label} material mapping.`);
      else if (item.material !== expected) errors.push(`${item.name} does not use the ${theme.label} ${item.editor_kind} material.`);
    });
    return { errors, warnings: [] };
  }

  function defaultSpec() {
    const defaultTheme = materialThemeRegistry.default_theme;
    const spec = {
      schema_version: 1,
      sketch_schema_version: 3,
      design_approved: false,
      map_name: "research_1v1_generated",
      material_theme: defaultTheme,
      environment_preset: environmentPresetRegistry.default_preset,
      symmetry: { mode: "rotation", center: [0, 0] },
      fixture_roles: {
        cuboid_node_id: 5,
        ct_spawn_node_id: 11,
        t_spawn_node_id: 12,
        preserve_entity_node_ids: [16, 23, 33, 36],
      },
      allowed_materials: themeMaterialList(defaultTheme),
      geometry: [{
        name: "arena_floor", center: [0, 0, -32], size: [2048, 1280, 64],
        base_z: -64, supported_by: null,
        material: materialForKind(defaultTheme, "floor"), mirror: false, editor_kind: "floor",
      }],
      sketch_elements: [],
      sketch_annotations: [],
      spawns: {
        ct: { origin: [-768, 0, 16], angles: [0, 0, 0] },
        t: { origin: [768, 0, 16], angles: [0, 180, 0] },
      },
      sketch_settings: { grid: DEFAULT_GRID, view_width: 2560, view_height: 1792 },
    };
    return spec;
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

  function itemBaseZ(item) {
    if (typeof item?.base_z === "number" && Number.isFinite(item.base_z)) return item.base_z;
    return Number(item?.center?.[2] || 0) - Number(item?.size?.[2] || 0) / 2;
  }

  function itemTopZ(item) { return cleanNumber(itemBaseZ(item) + Number(item.size[2])); }

  function rectBounds(item) {
    return [
      Number(item.center[0]) - Number(item.size[0]) / 2,
      Number(item.center[1]) - Number(item.size[1]) / 2,
      Number(item.center[0]) + Number(item.size[0]) / 2,
      Number(item.center[1]) + Number(item.size[1]) / 2,
    ];
  }

  function containsRect(outer, inner, tolerance = 1e-6) {
    const a = rectBounds(outer); const b = rectBounds(inner);
    return b[0] >= a[0] - tolerance && b[1] >= a[1] - tolerance && b[2] <= a[2] + tolerance && b[3] <= a[3] + tolerance;
  }

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
    allElements(spec).forEach((item) => {
      snapRectToGrid(item, spec, grid);
      item.base_z = snap(itemBaseZ(item), 16);
      item.center[2] = cleanNumber(item.base_z + item.size[2] / 2);
    });
    (spec.sketch_annotations || []).forEach((item) => {
      item.start = item.start.map((value) => snap(value, grid));
      item.end = item.end.map((value) => snap(value, grid));
    });
    spec.spawns.ct.origin[0] = snap(spec.spawns.ct.origin[0], grid);
    spec.spawns.ct.origin[1] = snap(spec.spawns.ct.origin[1], grid);
    resolveVerticalPlacement(spec);
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
    item.material ||= materialForKind(spec.material_theme, item.editor_kind, spec.allowed_materials?.[0] || MATERIAL);
    item.base_z = itemBaseZ(item);
    item.supported_by = typeof item.supported_by === "string" && item.supported_by ? item.supported_by : null;
    item.center[2] = cleanNumber(item.base_z + item.size[2] / 2);
    if (item.editor_kind === "blocked_zone" && !spec.allowed_materials.includes(item.material)) spec.allowed_materials.push(item.material);
    const target = GENERATOR_KINDS.has(item.editor_kind) ? spec.geometry : spec.sketch_elements;
    target.push(item); return item;
  }

  function removeElement(spec, name) {
    allElements(spec).forEach((item) => { if (item.supported_by === name) item.supported_by = null; });
    spec.geometry = spec.geometry.filter((item) => item.name !== name);
    spec.sketch_elements = spec.sketch_elements.filter((item) => item.name !== name);
  }

  function supportCandidates(spec, item) {
    if (!item || !SUPPORTABLE_KINDS.has(item.editor_kind)) return [];
    return allElements(spec)
      .filter((candidate) => candidate !== item && SUPPORT_KINDS.has(candidate.editor_kind) && containsRect(candidate, item))
      .sort((a, b) => itemTopZ(b) - itemTopZ(a) || a.name.localeCompare(b.name));
  }

  function bestSupportFor(spec, item) { return supportCandidates(spec, item)[0]?.name || null; }

  function resolveVerticalPlacement(spec) {
    const visiting = new Set(); const resolved = new Set();
    function resolve(item) {
      if (!item || resolved.has(item.name)) return;
      if (visiting.has(item.name)) return;
      visiting.add(item.name);
      if (item.supported_by) {
        const support = findElement(spec, item.supported_by);
        if (support && support !== item) { resolve(support); item.base_z = itemTopZ(support); }
      }
      item.base_z = cleanNumber(itemBaseZ(item));
      item.center[2] = cleanNumber(item.base_z + Number(item.size[2]) / 2);
      visiting.delete(item.name); resolved.add(item.name);
    }
    allElements(spec).forEach(resolve);
    return spec;
  }

  function setSupport(spec, item, supportName) {
    item.supported_by = supportName || null;
    resolveVerticalPlacement(spec);
    return item;
  }

  function expandedElements(spec) {
    const expanded = [];
    allElements(spec).forEach((item) => {
      expanded.push(Object.assign(clone(item), { instance_name: item.name, paired: false }));
      if (item.mirror) {
        const pair = Object.assign(clone(item), {
          center: rotatePoint(item.center, spec.symmetry.center),
          instance_name: `${item.name}_pair`, paired: true,
        });
        if (item.ascent) pair.ascent = RAMP_OPPOSITES[item.ascent];
        if (item.supported_by) {
          const support = findElement(spec, item.supported_by);
          pair.supported_by = support?.mirror ? `${support.name}_pair` : support?.name || item.supported_by;
        }
        expanded.push(pair);
      }
    });
    return expanded;
  }

  function solidIntersections(spec, tolerance = 1e-6) {
    const solids = expandedElements(spec).filter((item) => SOLID_KINDS.has(item.editor_kind));
    const intersections = [];
    for (let first = 0; first < solids.length; first++) for (let second = first + 1; second < solids.length; second++) {
      const a = solids[first]; const b = solids[second];
      const overlap = [0, 1, 2].every((axis) => {
        const aMin = Number(a.center[axis]) - Number(a.size[axis]) / 2;
        const aMax = Number(a.center[axis]) + Number(a.size[axis]) / 2;
        const bMin = Number(b.center[axis]) - Number(b.size[axis]) / 2;
        const bMax = Number(b.center[axis]) + Number(b.size[axis]) / 2;
        return Math.min(aMax, bMax) - Math.max(aMin, bMin) > tolerance;
      });
      if (overlap) intersections.push([a.instance_name, b.instance_name]);
    }
    return intersections;
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
    item.material ||= materialForKind(spec.material_theme, item.editor_kind, spec.allowed_materials[0]);
    item.center = [Number(item.center?.[0] || 0), Number(item.center?.[1] || 0), Number(item.center?.[2] || 0)];
    item.size = [Number(item.size?.[0] || 32), Number(item.size?.[1] || 32), Number(item.size?.[2] || 32)];
    item.base_z = typeof item.base_z === "number" && Number.isFinite(item.base_z) ? item.base_z : item.center[2] - item.size[2] / 2;
    item.supported_by = typeof item.supported_by === "string" && item.supported_by ? slug(item.supported_by) : null;
    if (item.editor_kind === "floor") item.supported_by = null;
    if (item.editor_kind === "blocked_zone") {
      item.supported_by = null;
      item.vertical_mode = ["finite", "containment"].includes(item.vertical_mode) ? item.vertical_mode : "containment";
      if (item.vertical_mode === "finite") item.height = Number.isFinite(Number(item.height)) ? Number(item.height) : item.size[2];
      else delete item.height;
    } else { delete item.vertical_mode; delete item.height; }
    if (["water", "void"].includes(item.editor_kind)) {
      item.depth = Number.isFinite(Number(item.depth)) ? Number(item.depth) : item.size[2];
      item.size[2] = item.depth;
      if (item.editor_kind === "water") { item.access = "enterable"; delete item.behavior; }
      else { item.behavior = ["open", "lethal"].includes(item.behavior) ? item.behavior : "open"; delete item.access; }
    } else { delete item.depth; delete item.access; delete item.behavior; }
    item.center[2] = cleanNumber(item.base_z + item.size[2] / 2);
    if (["ramp", "stairs"].includes(item.editor_kind)) {
      item.ascent = RAMP_DIRECTIONS.has(item.ascent) ? item.ascent : item.size[0] >= item.size[1] ? "x+" : "y+";
    } else delete item.ascent;
    if (item.editor_kind === "stairs") {
      item.step_count = Number.isInteger(item.step_count) && item.step_count > 0
        ? item.step_count : Math.max(1, Math.round(item.size[2] / 16));
    } else delete item.step_count;
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
    if (![2, 3].includes(Number(input.sketch_schema_version || 2))) throw new Error("Only sketch schema versions 2 and 3 are supported.");
    spec.sketch_schema_version = 3;
    spec.design_approved = false;
    spec.allowed_materials = Array.isArray(spec.allowed_materials) && spec.allowed_materials.length ? spec.allowed_materials : [MATERIAL];
    spec.material_theme = inferMaterialTheme(spec);
    spec.environment_preset = environmentPresetById(spec.environment_preset)?.id || environmentPresetRegistry.default_preset;
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
    resolveVerticalPlacement(spec);
    spec.spawns.t = pairedSpawn(spec.spawns.ct, spec.symmetry.center);
    return snapSpecToGrid(spec, spec.sketch_settings.grid);
  }

  function validateDraft(spec) {
    const errors = []; const warnings = []; const names = new Set();
    const themeReport = themeValidation(spec); errors.push(...themeReport.errors); warnings.push(...themeReport.warnings);
    if (!environmentPresetById(spec.environment_preset)) errors.push(`Unknown environment preset: ${spec.environment_preset}.`);
    if (!/^[a-z0-9_]+$/.test(spec.map_name)) errors.push("Map name must use lowercase letters, numbers, and underscores.");
    if (!spec.geometry.some((item) => item.editor_kind === "floor")) errors.push("Add a floor before generating the map.");
    allNamed(spec).forEach((item) => {
      if (names.has(item.name)) errors.push(`Duplicate object name: ${item.name}.`); names.add(item.name);
      if (item.size && item.size.some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`${item.name} has an invalid size.`);
      if (item.center) {
        const atCenter = item.center[0] === spec.symmetry.center[0] && item.center[1] === spec.symmetry.center[1];
        if (item.editor_kind !== "floor" && item.mirror === atCenter) errors.push(`${item.name} has an invalid symmetry setting.`);
      }
      if (typeof item.base_z !== "number" || !Number.isFinite(item.base_z)) errors.push(`${item.name} has an invalid base elevation.`);
      else if (item.center && cleanNumber(item.base_z + item.size[2] / 2) !== cleanNumber(item.center[2])) errors.push(`${item.name} center Z does not match its base elevation and height.`);
      if (item.supported_by) {
        const support = findElement(spec, item.supported_by);
        if (!support) errors.push(`${item.name} refers to missing support ${item.supported_by}.`);
        else {
          if (!SUPPORT_KINDS.has(support.editor_kind)) errors.push(`${item.name} cannot be supported by ${support.name} (${support.editor_kind}).`);
          if (support === item) errors.push(`${item.name} cannot support itself.`);
          if (!containsRect(support, item)) errors.push(`${item.name} extends outside its support ${support.name}.`);
          if (cleanNumber(itemBaseZ(item)) !== cleanNumber(itemTopZ(support))) errors.push(`${item.name} base elevation does not match the top of ${support.name}.`);
        }
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
      if (item.editor_kind === "stairs") {
        if (!RAMP_DIRECTIONS.has(item.ascent)) errors.push(`${item.name} has an invalid stair ascent direction.`);
        if (!Number.isInteger(item.step_count) || item.step_count < 1 || item.step_count > 64) errors.push(`${item.name} step count must be an integer from 1 to 64.`);
        else {
          const runAxis = item.ascent?.startsWith("x") ? 0 : 1;
          const tread = Number(item.size[runAxis]) / item.step_count;
          const riser = Number(item.size[2]) / item.step_count;
          if (tread < 16 || tread > 64 || tread % 8 !== 0) errors.push(`${item.name} tread depth must be an 8-unit increment from 16 to 64.`);
          if (riser < 8 || riser > 64 || riser % 8 !== 0) errors.push(`${item.name} riser height must be an 8-unit increment from 8 to 64.`);
          else if (riser > MAX_WALKABLE_RISER) warnings.push(`${item.name} has ${riser}-unit risers above the ${MAX_WALKABLE_RISER}-unit ordinary-walking threshold; players will need jumps or another traversal method, and bot traversal is not established.`);
        }
        if (item.walkable_below !== false) errors.push(`${item.name} must be solid literal stairs.`);
      }
      if (item.editor_kind === "blocked_zone") {
        if (!["finite", "containment"].includes(item.vertical_mode)) errors.push(`${item.name} must use finite or containment vertical mode.`);
        if (item.supported_by) errors.push(`${item.name} cannot use a support.`);
        if (item.vertical_mode === "finite" && (!Number.isFinite(item.height) || item.height <= 0)) errors.push(`${item.name} finite height must be positive.`);
        else if (item.vertical_mode === "finite") {
          if (cleanNumber(item.height) !== cleanNumber(item.size[2])) errors.push(`${item.name} finite height must match its height field.`);
          const top = cleanNumber(itemBaseZ(item) + item.height);
          const sealed = expandedElements(spec).some((solid) => solid.editor_kind !== "blocked_zone" && SOLID_KINDS.has(solid.editor_kind) && cleanNumber(itemBaseZ(solid)) === top && containsRect(solid, item));
          if (!sealed) errors.push(`${item.name} finite top must terminate flush beneath containing solid geometry.`);
        }
      }
      if (["water", "void"].includes(item.editor_kind)) {
        if (!item.supported_by) errors.push(`${item.name} requires a named support.`);
        if (!Number.isFinite(item.depth) || item.depth < 16 || item.depth > 256 || item.depth % 16) errors.push(`${item.name} depth must be a 16-unit increment from 16 to 256.`);
        if (item.editor_kind === "water" && item.access !== "enterable") errors.push(`${item.name} must be enterable; overlay a blocked zone for no-entry water.`);
        if (item.editor_kind === "void" && !["open", "lethal"].includes(item.behavior)) errors.push(`${item.name} must be open or lethal.`);
      }
    });
    const supportEdges = new Map(allElements(spec).map((item) => [item.name, item.supported_by]));
    for (const item of allElements(spec)) {
      const seen = new Set(); let current = item.name;
      while (current) {
        if (seen.has(current)) { errors.push(`Support cycle includes ${item.name}.`); break; }
        seen.add(current); current = supportEdges.get(current) || null;
      }
    }
    solidIntersections(spec).forEach(([first, second]) => errors.push(`${first} intersects ${second} with positive solid volume.`));
    if (allElements(spec).length === 1) warnings.push("The draft contains only the arena floor.");
    if (spec.sketch_elements.length) warnings.push(`${spec.sketch_elements.length} sketch element${spec.sketch_elements.length === 1 ? "" : "s"} will need deliberate Hammer implementation.`);
    if (spec.design_approved) errors.push("Editor drafts must remain unapproved until reviewed.");
    return { errors, warnings };
  }

  function exportSpec(spec) {
    const output = snapSpecToGrid(clone(spec), spec.sketch_settings.grid); output.design_approved = false; output.sketch_schema_version = 3;
    resolveVerticalPlacement(output);
    output.spawns.t = pairedSpawn(output.spawns.ct, output.symmetry.center);
    return output;
  }

  return {
    MATERIAL, DEFAULT_GRID, LEGACY_CUSTOM_THEME, MAX_WALKABLE_RISER, GENERATOR_KINDS, RECT_KINDS, ANNOTATION_KINDS, RAMP_DIRECTIONS, RAMP_OPPOSITES, SUPPORT_KINDS, SUPPORTABLE_KINDS, clone, defaultSpec,
    configureMaterialThemes, materialThemes, themeById, materialForKind, themeMaterialList, applyMaterialTheme, inferMaterialTheme, themeValidation,
    configureEnvironmentPresets, environmentPresets, environmentPresetById,
    rotatePoint, pairedSpawn, cleanNumber, snap, snapRectToGrid, snapSpecToGrid, slug, allElements, allNamed, uniqueName,
    findElement, findAnnotation, addElement, removeElement, moveElementBucket, itemBaseZ, itemTopZ, containsRect,
    supportCandidates, bestSupportFor, setSupport, resolveVerticalPlacement, expandedElements, solidIntersections,
    normalizeSpec, validateDraft, exportSpec,
  };
});
