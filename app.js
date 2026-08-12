(async function () {
  "use strict";
  const Core = window.MapSketchCore;
  try {
    const response = await fetch("material-themes.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    Core.configureMaterialThemes(await response.json());
  } catch (error) {
    console.error("Could not load stock material themes; using Blockout only.", error);
  }
  try {
    const response = await fetch("environment-presets.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    Core.configureEnvironmentPresets(await response.json());
  } catch (error) {
    console.error("Could not load environment presets; using Controlled daylight.", error);
  }
  const STORAGE_KEY = "counterform.sketch.v3";
  const LEGACY_STORAGE_KEYS = ["counterform.sketch.v2", "counterform.sketch.v1"];
  const $ = (id) => document.getElementById(id);
  const canvas = $("mapCanvas");
  const ctx = canvas.getContext("2d");
  const cornerSigns = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  const presets = {
    wall: { height: 192, base: "wall" }, cover: { height: 96, base: "cover" },
    low_cover: { height: 48, base: "low_cover" }, crate: { height: 128, base: "crate" },
    water: { height: 64, base: "water" }, void: { height: 128, base: "void" }, bridge: { height: 16, base: "bridge" },
    elevated: { height: 128, base: "raised_region" }, ramp: { height: 128, base: "ramp" }, stairs: { height: 128, base: "stairs" },
    jump: { height: 64, base: "jump_platform" },
    blocked_zone: { height: 384, base: "blocked_zone" },
  };
  const labels = {
    floor: "Floor", wall: "Wall", cover: "Standing cover", low_cover: "Crouch cover",
    crate: "Crate", water: "Water", void: "Void", bridge: "Bridge", elevated: "Elevated region",
    ramp: "Ramp", stairs: "Stairs", blocked_zone: "Blocked zone", jump: "Jump platform", measure: "Measurement", sightline: "Sightline",
  };
  const visuals = {
    floor: ["rgba(67,78,70,.33)", "#475149"], wall: ["rgba(240,164,74,.34)", "#f0a44a"],
    cover: ["rgba(232,237,233,.25)", "#aab5ad"], low_cover: ["rgba(167,180,171,.20)", "#89958d"],
    crate: ["rgba(174,112,55,.42)", "#c98649"], water: ["rgba(55,135,180,.40)", "#54a8d1"], void: ["rgba(24,19,32,.72)", "#9875c5"],
    bridge: ["rgba(139,93,52,.50)", "#c8945a"], elevated: ["rgba(210,174,69,.22)", "#d6b54e"],
    ramp: ["rgba(101,163,119,.30)", "#79c98e"], stairs: ["rgba(218,183,77,.28)", "#e0c05c"], jump: ["rgba(157,100,209,.28)", "#b783e7"],
    blocked_zone: ["rgba(245,82,110,.20)", "#f5526e"],
  };
  const lightVisuals = {
    floor: ["rgba(67,78,70,.12)", "#65736a"], wall: ["rgba(184,91,0,.18)", "#9a4d00"],
    cover: ["rgba(58,75,64,.14)", "#3e5044"], low_cover: ["rgba(76,94,82,.12)", "#526759"],
    crate: ["rgba(154,82,21,.20)", "#88450d"], water: ["rgba(15,111,160,.18)", "#0b6793"], void: ["rgba(65,42,84,.18)", "#60417a"],
    bridge: ["rgba(137,76,22,.18)", "#7f4616"], elevated: ["rgba(145,108,0,.17)", "#765900"],
    ramp: ["rgba(27,120,57,.16)", "#1b7438"], stairs: ["rgba(137,99,0,.17)", "#705300"], jump: ["rgba(105,52,151,.15)", "#693397"],
    blocked_zone: ["rgba(185,28,58,.12)", "#b91c3a"],
  };

  function themeColor(name, fallback) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
  function objectVisuals(kind) { const palette = document.documentElement.dataset.theme === "light" ? lightVisuals : visuals; return palette[kind] || palette.cover; }

  let spec = loadSaved();
  let tool = "select";
  let selection = null;
  let selectedPair = false;
  let gesture = null;
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let panMode = false;
  let spacePressed = false;
  let history = [];
  let future = [];

  function loadSaved() {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      try { const value = localStorage.getItem(key); if (value) return Core.normalizeSpec(JSON.parse(value)); } catch (_) { /* use next source */ }
    }
    return Core.defaultSpec();
  }

  function remember(snapshot) {
    history.push(snapshot || JSON.stringify(spec));
    if (history.length > 60) history.shift();
    future = [];
  }

  function commit({ clearSelection = false } = {}) {
    spec.design_approved = false;
    Core.resolveVerticalPlacement(spec);
    spec.spawns.t = Core.pairedSpawn(spec.spawns.ct, spec.symmetry.center);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
    $("saveState").textContent = "Saved in this browser";
    if (clearSelection) selection = null;
    syncUI(); draw();
  }

  function mutate(fn) { remember(); fn(); commit(); }

  function undo() {
    if (!history.length) return;
    future.push(JSON.stringify(spec)); spec = Core.normalizeSpec(JSON.parse(history.pop()));
    selection = null; selectedPair = false; commit();
  }

  function redo() {
    if (!future.length) return;
    history.push(JSON.stringify(spec)); spec = Core.normalizeSpec(JSON.parse(future.pop()));
    selection = null; selectedPair = false; commit();
  }

  function viewport() {
    const rect = canvas.getBoundingClientRect();
    const base = Math.min(rect.width / spec.sketch_settings.view_width, rect.height / spec.sketch_settings.view_height);
    return { rect, scale: base * zoom, cx: rect.width / 2 + pan.x, cy: rect.height / 2 + pan.y };
  }

  function worldToScreen(x, y) {
    const v = viewport();
    return { x: v.cx + (x - spec.symmetry.center[0]) * v.scale, y: v.cy - (y - spec.symmetry.center[1]) * v.scale };
  }

  function screenToWorld(clientX, clientY) {
    const v = viewport();
    return { x: (clientX - v.rect.left - v.cx) / v.scale + spec.symmetry.center[0], y: -(clientY - v.rect.top - v.cy) / v.scale + spec.symmetry.center[1] };
  }

  function setZoom(nextZoom, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const focusX = clientX ?? rect.left + rect.width / 2; const focusY = clientY ?? rect.top + rect.height / 2;
    const anchoredWorld = screenToWorld(focusX, focusY);
    zoom = Math.max(.55, Math.min(2.4, nextZoom));
    const anchoredScreen = worldToScreen(anchoredWorld.x, anchoredWorld.y);
    pan.x += focusX - rect.left - anchoredScreen.x; pan.y += focusY - rect.top - anchoredScreen.y;
    $("zoomLabel").textContent = `${Math.round(zoom * 100)}%`; draw();
  }

  function fitView() { zoom = 1; pan = { x: 0, y: 0 }; $("zoomLabel").textContent = "100%"; draw(); }

  function setPanMode(enabled) {
    panMode = Boolean(enabled); $("panMode").setAttribute("aria-pressed", String(panMode));
    canvas.style.cursor = panMode || spacePressed ? "grab" : tool === "select" ? "default" : "crosshair";
  }

  function canonicalPoint(point, paired) {
    if (!paired) return [point.x, point.y];
    return Core.rotatePoint([point.x, point.y, 0], spec.symmetry.center).slice(0, 2);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); draw();
  }

  function drawGrid() {
    const v = viewport(); const grid = Number(spec.sketch_settings.grid);
    const visible = grid * v.scale >= 8 ? grid : grid * Math.ceil(8 / (grid * v.scale));
    const left = screenToWorld(v.rect.left, v.rect.top).x; const right = screenToWorld(v.rect.right, v.rect.top).x;
    const top = screenToWorld(v.rect.left, v.rect.top).y; const bottom = screenToWorld(v.rect.left, v.rect.bottom).y;
    ctx.lineWidth = 1;
    for (let x = Math.floor(left / visible) * visible; x <= right; x += visible) {
      const p = worldToScreen(x, 0); ctx.strokeStyle = x === 0 ? themeColor("--canvas-axis", "#4a554d") : themeColor("--canvas-grid", "#1b211d");
      ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, v.rect.height); ctx.stroke();
    }
    for (let y = Math.floor(bottom / visible) * visible; y <= top; y += visible) {
      const p = worldToScreen(0, y); ctx.strokeStyle = y === 0 ? themeColor("--canvas-axis", "#4a554d") : themeColor("--canvas-grid", "#1b211d");
      ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(v.rect.width, p.y); ctx.stroke();
    }
    const c = worldToScreen(...spec.symmetry.center); ctx.strokeStyle = themeColor("--canvas-center", "rgba(200,240,74,.6)");
    ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x - 15, c.y); ctx.lineTo(c.x + 15, c.y); ctx.moveTo(c.x, c.y - 15); ctx.lineTo(c.x, c.y + 15); ctx.stroke();
  }

  function displayedCenter(item, paired) { return paired ? Core.rotatePoint(item.center, spec.symmetry.center) : item.center; }

  function objectRect(item, paired = false) {
    const center = displayedCenter(item, paired); const p = worldToScreen(center[0], center[1]); const v = viewport();
    return { x: p.x - item.size[0] * v.scale / 2, y: p.y - item.size[1] * v.scale / 2, w: item.size[0] * v.scale, h: item.size[1] * v.scale };
  }

  function drawPattern(item, rect) {
    ctx.save(); ctx.strokeStyle = objectVisuals(item.editor_kind)[1]; ctx.globalAlpha = document.documentElement.dataset.theme === "light" ? .78 : .55; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    if (item.editor_kind === "water") {
      for (let y = rect.y + 8; y < rect.y + rect.h; y += 12) { ctx.beginPath(); ctx.moveTo(rect.x + 5, y); ctx.bezierCurveTo(rect.x + rect.w * .3, y - 4, rect.x + rect.w * .7, y + 4, rect.x + rect.w - 5, y); ctx.stroke(); }
    } else if (item.editor_kind === "blocked_zone") {
      ctx.setLineDash([5, 4]); for (let x = rect.x - rect.h; x < rect.x + rect.w; x += 12) { ctx.beginPath(); ctx.moveTo(x, rect.y + rect.h); ctx.lineTo(x + rect.h, rect.y); ctx.stroke(); }
    } else if (item.editor_kind === "stairs") {
      const vertical = rect.h >= rect.w; const count = Math.max(2, Math.floor((vertical ? rect.h : rect.w) / 12));
      for (let i = 1; i < count; i++) { const t = i / count; ctx.beginPath(); if (vertical) { const y = rect.y + rect.h * t; ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); } else { const x = rect.x + rect.w * t; ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); } ctx.stroke(); }
    } else if (item.editor_kind === "ramp") {
      const cx = rect.x + rect.w / 2; const cy = rect.y + rect.h / 2; const inset = 7;
      let start; let end;
      if (item.ascent === "x-") { start = [rect.x + rect.w - inset, cy]; end = [rect.x + inset, cy]; }
      else if (item.ascent === "y+") { start = [cx, rect.y + rect.h - inset]; end = [cx, rect.y + inset]; }
      else if (item.ascent === "y-") { start = [cx, rect.y + inset]; end = [cx, rect.y + rect.h - inset]; }
      else { start = [rect.x + inset, cy]; end = [rect.x + rect.w - inset, cy]; }
      const dx = end[0] - start[0]; const dy = end[1] - start[1]; const length = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / length; const uy = dy / length; const px = -uy; const py = ux;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end);
      ctx.moveTo(end[0], end[1]); ctx.lineTo(end[0] - ux * 9 + px * 5, end[1] - uy * 9 + py * 5);
      ctx.moveTo(end[0], end[1]); ctx.lineTo(end[0] - ux * 9 - px * 5, end[1] - uy * 9 - py * 5); ctx.stroke();
    } else if (item.editor_kind === "crate") {
      ctx.beginPath(); ctx.moveTo(rect.x, rect.y); ctx.lineTo(rect.x + rect.w, rect.y + rect.h); ctx.moveTo(rect.x + rect.w, rect.y); ctx.lineTo(rect.x, rect.y + rect.h); ctx.stroke();
    } else if (item.editor_kind === "bridge") {
      const vertical = rect.h >= rect.w; for (let p = 8; p < (vertical ? rect.h : rect.w); p += 14) { ctx.beginPath(); if (vertical) { ctx.moveTo(rect.x, rect.y + p); ctx.lineTo(rect.x + rect.w, rect.y + p); } else { ctx.moveTo(rect.x + p, rect.y); ctx.lineTo(rect.x + p, rect.y + rect.h); } ctx.stroke(); }
    } else if (item.editor_kind === "jump") {
      ctx.setLineDash([]); ctx.lineWidth = 2; const vertical = rect.h >= rect.w; const cx = rect.x + rect.w / 2; const cy = rect.y + rect.h / 2;
      ctx.beginPath(); if (vertical) { ctx.moveTo(cx, rect.y + rect.h - 6); ctx.lineTo(cx, rect.y + 7); ctx.lineTo(cx - 5, rect.y + 13); ctx.moveTo(cx, rect.y + 7); ctx.lineTo(cx + 5, rect.y + 13); } else { ctx.moveTo(rect.x + 6, cy); ctx.lineTo(rect.x + rect.w - 7, cy); ctx.lineTo(rect.x + rect.w - 13, cy - 5); ctx.moveTo(rect.x + rect.w - 7, cy); ctx.lineTo(rect.x + rect.w - 13, cy + 5); } ctx.stroke();
    } else if (item.editor_kind === "elevated") {
      ctx.setLineDash([3, 4]); for (let x = rect.x - rect.h; x < rect.x + rect.w; x += 12) { ctx.beginPath(); ctx.moveTo(x, rect.y + rect.h); ctx.lineTo(x + rect.h, rect.y); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawObject(item, paired = false, preview = false) {
    const rect = objectRect(item, paired); const colors = objectVisuals(item.editor_kind);
    const isSelected = selection?.type === "element" && selection.name === item.name && selectedPair === paired;
    ctx.save(); ctx.fillStyle = paired ? themeColor("--canvas-paired-fill", "rgba(200,240,74,.09)") : colors[0]; ctx.strokeStyle = paired ? themeColor("--canvas-paired-stroke", "rgba(200,240,74,.72)") : isSelected ? themeColor("--canvas-selected", "#c8f04a") : colors[1];
    ctx.lineWidth = isSelected ? 2 : 1; if (paired) ctx.setLineDash([5, 4]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.strokeRect(rect.x + .5, rect.y + .5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1)); ctx.restore();
    if (!paired) drawPattern(item, rect);
    else if (item.editor_kind === "ramp") drawPattern({ ...item, ascent: Core.RAMP_OPPOSITES[item.ascent] }, rect);
    if (item.editor_kind !== "floor" && rect.w > 48 && rect.h > 20) {
      ctx.save(); ctx.fillStyle = paired ? themeColor("--canvas-paired-stroke", "rgba(200,240,74,.75)") : themeColor("--canvas-label", "#dce3de"); ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "center";
      const label = item.editor_kind === "ramp" ? paired ? "ramp · pair" : "ramp" : preview ? labels[item.editor_kind] : paired ? `${item.name} · pair` : item.name;
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 3); ctx.restore();
    }
  }

  function annotationPoints(item, paired = false) {
    if (!paired) return [item.start, item.end];
    return [Core.rotatePoint([...item.start, 0], spec.symmetry.center), Core.rotatePoint([...item.end, 0], spec.symmetry.center)];
  }

  function drawAnnotation(item, paired = false) {
    const [a, b] = annotationPoints(item, paired); const start = worldToScreen(a[0], a[1]); const end = worldToScreen(b[0], b[1]);
    const selected = selection?.type === "annotation" && selection.name === item.name && selectedPair === paired;
    ctx.save(); ctx.strokeStyle = paired ? themeColor("--canvas-paired-stroke", "rgba(200,240,74,.65)") : item.editor_kind === "measure" ? "#1678a8" : "#c33c31";
    ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = selected ? 3 : 2; ctx.setLineDash(item.editor_kind === "sightline" ? [8, 5] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.setLineDash([]);
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]); const label = item.editor_kind === "measure" ? `${Math.round(distance)} u · ${(distance * .0254).toFixed(1)} m` : "sightline";
    ctx.font = "700 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(label, (start.x + end.x) / 2, (start.y + end.y) / 2 - 7);
    if (selected) for (const p of [start, end]) { ctx.fillStyle = themeColor("--canvas-handle-fill", "#0d100e"); ctx.strokeStyle = themeColor("--canvas-handle-stroke", "#c8f04a"); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  function drawSpawn(spawn, label, color, selected) {
    const p = worldToScreen(spawn.origin[0], spawn.origin[1]); const yaw = spawn.angles[1] * Math.PI / 180;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-yaw); ctx.fillStyle = color; ctx.strokeStyle = selected ? themeColor("--canvas-selected", "#c8f04a") : color; ctx.lineWidth = selected ? 3 : 0;
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -8); ctx.lineTo(-5, 0); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); if (selected) ctx.stroke();
    ctx.rotate(yaw); ctx.font = "700 9px ui-sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, 0, -14); ctx.restore();
  }

  function drawHandles() {
    if (selection?.type !== "element") return; const item = Core.findElement(spec, selection.name); if (!item) return;
    const rect = objectRect(item, selectedPair); ctx.save(); ctx.fillStyle = themeColor("--canvas-selected", "#c8f04a"); ctx.strokeStyle = themeColor("--canvas-handle-fill", "#111513"); ctx.lineWidth = 1;
    for (const [sx, sy] of cornerSigns) { const x = sx < 0 ? rect.x : rect.x + rect.w; const y = sy < 0 ? rect.y : rect.y + rect.h; ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10); } ctx.restore();
  }

  function orderedElements() {
    const rank = { floor: 0, water: 1, void: 1, elevated: 2, bridge: 3, stairs: 4, jump: 5 };
    return Core.allElements(spec).slice().sort((a, b) => (rank[a.editor_kind] ?? 10) - (rank[b.editor_kind] ?? 10));
  }

  function draw() {
    const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); drawGrid();
    for (const item of orderedElements()) { drawObject(item); if (item.mirror) drawObject(item, true); }
    for (const item of spec.sketch_annotations) { drawAnnotation(item); if (item.mirror) drawAnnotation(item, true); }
    if (gesture?.type === "draw-rect") drawObject(gesture.preview, false, true);
    if (gesture?.type === "draw-line") drawAnnotation(gesture.preview);
    drawSpawn(spec.spawns.ct, "CT", "#68b9e8", selection?.type === "spawn" && !selectedPair);
    drawSpawn(spec.spawns.t, "T", "#ef9a63", selection?.type === "spawn" && selectedPair);
    drawHandles();
  }

  function pointInRect(point, rect) {
    const p = worldToScreen(point.x, point.y); return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
  }

  function hitElement(point) {
    const elements = orderedElements().reverse();
    for (const item of elements) {
      if (item.mirror && pointInRect(point, objectRect(item, true))) return { item, paired: true };
      if (pointInRect(point, objectRect(item, false))) return { item, paired: false };
    }
    return null;
  }

  function distanceToSegment(point, a, b) {
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length2 = dx * dx + dy * dy;
    if (!length2) return Math.hypot(point.x - a[0], point.y - a[1]);
    const t = Math.max(0, Math.min(1, ((point.x - a[0]) * dx + (point.y - a[1]) * dy) / length2));
    return Math.hypot(point.x - (a[0] + t * dx), point.y - (a[1] + t * dy));
  }

  function hitAnnotation(point) {
    const tolerance = 9 / viewport().scale;
    for (let i = spec.sketch_annotations.length - 1; i >= 0; i--) {
      const item = spec.sketch_annotations[i];
      if (item.mirror) { const [a, b] = annotationPoints(item, true); if (distanceToSegment(point, a, b) <= tolerance) return { item, paired: true }; }
      if (distanceToSegment(point, item.start, item.end) <= tolerance) return { item, paired: false };
    }
    return null;
  }

  function hitSpawn(point) {
    const tolerance = 15 / viewport().scale;
    if (Math.hypot(point.x - spec.spawns.ct.origin[0], point.y - spec.spawns.ct.origin[1]) <= tolerance) return false;
    if (Math.hypot(point.x - spec.spawns.t.origin[0], point.y - spec.spawns.t.origin[1]) <= tolerance) return true;
    return null;
  }

  function hitCorner(event, item, paired) {
    const rect = objectRect(item, paired); const local = { x: event.clientX - canvas.getBoundingClientRect().left, y: event.clientY - canvas.getBoundingClientRect().top };
    for (let i = 0; i < cornerSigns.length; i++) { const [sx, sy] = cornerSigns[i]; const x = sx < 0 ? rect.x : rect.x + rect.w; const y = sy < 0 ? rect.y : rect.y + rect.h; if (Math.hypot(local.x - x, local.y - y) <= 10) return i; }
    return -1;
  }

  function hitAnnotationEndpoint(point, item, paired) {
    const tolerance = 10 / viewport().scale; const points = annotationPoints(item, paired);
    for (let i = 0; i < 2; i++) if (Math.hypot(point.x - points[i][0], point.y - points[i][1]) <= tolerance) return i;
    return -1;
  }

  function beginTransform(kind, data) { gesture = { type: kind, before: JSON.stringify(spec), changed: false, ...data }; }

  function finishTransform() {
    if (!gesture) return;
    if (gesture.changed) { remember(gesture.before); commit(); }
    gesture = null; draw();
  }

  function updateRectPreview(point) {
    const grid = Number(spec.sketch_settings.grid);
    const start = [Core.snap(gesture.start.x, grid), Core.snap(gesture.start.y, grid)]; const end = [Core.snap(point.x, grid), Core.snap(point.y, grid)];
    for (let axis = 0; axis < 2; axis++) if (end[axis] === start[axis]) end[axis] += point[axis === 0 ? "x" : "y"] < start[axis] ? -grid : grid;
    const size = [Math.max(grid, Math.abs(end[0] - start[0])), Math.max(grid, Math.abs(end[1] - start[1])), presets[tool].height];
    let ascent;
    if (["ramp", "stairs"].includes(tool)) {
      const runAxis = size[0] >= size[1] ? 0 : 1;
      ascent = `${runAxis === 0 ? "x" : "y"}${end[runAxis] >= start[runAxis] ? "+" : "-"}`;
      if (tool === "ramp") size[2] = size[runAxis] / 2;
    }
    const center = [Core.cleanNumber((start[0] + end[0]) / 2), Core.cleanNumber((start[1] + end[1]) / 2), size[2] / 2];
    let baseZ = 0;
    gesture.preview = {
      name: "new", center, size, base_z: baseZ, supported_by: null,
      material: Core.materialForKind(spec.material_theme, tool, spec.allowed_materials[0]), mirror: center[0] !== 0 || center[1] !== 0, editor_kind: tool,
      walkable_below: ["bridge", "elevated", "ramp", "stairs", "jump"].includes(tool) ? false : undefined,
      ascent,
      step_count: tool === "stairs" ? 8 : undefined,
      vertical_mode: tool === "blocked_zone" ? "containment" : undefined,
      depth: ["water", "void"].includes(tool) ? size[2] : undefined,
      access: tool === "water" ? "enterable" : undefined,
      behavior: tool === "void" ? "open" : undefined,
    };
    if (Core.SUPPORTABLE_KINDS.has(tool)) {
      gesture.preview.supported_by = Core.bestSupportFor(spec, gesture.preview);
      const support = Core.findElement(spec, gesture.preview.supported_by);
      if (support) baseZ = Core.itemTopZ(support);
    }
    gesture.preview.base_z = baseZ;
    gesture.preview.center[2] = Core.cleanNumber(baseZ + size[2] / 2);
  }

  function updateLinePreview(point) {
    const grid = Number(spec.sketch_settings.grid); const start = [Core.snap(gesture.start.x, grid), Core.snap(gesture.start.y, grid)]; const end = [Core.snap(point.x, grid), Core.snap(point.y, grid)];
    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    gesture.preview = { name: "new", editor_kind: tool, start, end, mirror: midpoint[0] !== 0 || midpoint[1] !== 0 };
  }

  function setTool(next) {
    tool = next; gesture = null; setPanMode(false);
    document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === next));
    const messages = { select: "Click a solid feature, then drag to move or use its corner handles to resize.", spawn: "Click to place CT; drag either spawn later to rearrange it.", measure: "Drag between two points to record their distance.", sightline: "Drag to mark a sightline for later design review." };
    $("canvasHelp").textContent = messages[next] || `Drag to draw ${labels[next].toLowerCase()}. Its rotational partner appears automatically.`;
    canvas.style.cursor = spacePressed ? "grab" : next === "select" ? "default" : "crosshair";
    draw();
  }

  function selectedItem() {
    if (!selection) return null;
    return selection.type === "element" ? Core.findElement(spec, selection.name) : selection.type === "annotation" ? Core.findAnnotation(spec, selection.name) : null;
  }

  function syncUI() {
    $("mapTitle").textContent = spec.map_name; $("mapName").value = spec.map_name; $("gridSize").value = String(spec.sketch_settings.grid);
    const grid = Number(spec.sketch_settings.grid); for (const id of ["centerX", "centerY"]) $(id).step = String(grid / 2); for (const id of ["sizeX", "sizeY", "spawnX", "spawnY"]) $(id).step = String(grid);
    const themes = Core.materialThemes();
    $("materialTheme").innerHTML = (spec.material_theme === Core.LEGACY_CUSTOM_THEME ? '<option value="legacy_custom">Imported materials</option>' : "") + themes.map((theme) => `<option value="${theme.id}">${theme.label}</option>`).join("");
    $("materialTheme").value = spec.material_theme;
    $("environmentPreset").innerHTML = Core.environmentPresets().map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join("");
    $("environmentPreset").value = spec.environment_preset;
    $("environmentDescription").textContent = Core.environmentPresetById(spec.environment_preset)?.description || "";
    const theme = Core.themeById(spec.material_theme);
    $("themeDescription").textContent = theme?.description || "These imported materials stay unchanged until you select a stock theme.";
    const previewRoles = { floor: "Floor", wall: "Wall", cover: "Cover", ramp: "Ramp" };
    $("themePreview").innerHTML = theme ? Object.entries(previewRoles).map(([kind, label]) =>
      `<figure><img src="assets/theme-previews/${theme.id}-${kind}.png" alt="${theme.label} ${label.toLowerCase()} material preview"><figcaption>${label}</figcaption></figure>`
    ).join("") : '<span class="legacy-theme-preview">No stock preview for imported materials</span>';
    const roleLabels = { floor: "Floor", wall: "Walls", cover: "Cover", crate: "Crates", bridge: "Bridges", ramp: "Ramps" };
    $("themeRoles").innerHTML = theme ? Object.entries(roleLabels).map(([kind, label]) => {
      const path = theme.materials[kind]; const filename = path.split("/").pop().replace(/\.vmat$/, "");
      return `<span><strong>${label}</strong><small>${filename}</small></span>`;
    }).join("") : '<span class="legacy-theme-note">Select a stock theme to replace every object material.</span>';
    $("spawnX").value = spec.spawns.ct.origin[0]; $("spawnY").value = spec.spawns.ct.origin[1]; $("spawnYaw").value = spec.spawns.ct.angles[1];
    const item = selectedItem(); const hasItem = Boolean(item);
    $("emptySelection").hidden = hasItem; $("objectFields").hidden = !hasItem; $("deleteButton").hidden = !hasItem || item?.editor_kind === "floor";
    if (item) {
      const rect = Boolean(item.center); $("selectionTitle").textContent = rect ? "Selected feature" : "Selected annotation";
      $("typeBadge").textContent = labels[item.editor_kind] || item.editor_kind; $("objectName").value = item.name;
      $("rectFields").hidden = !rect; $("rectActions").hidden = !rect;
      $("rampFields").hidden = !rect || !["ramp", "stairs"].includes(item.editor_kind);
      $("stairFields").hidden = !rect || item.editor_kind !== "stairs";
      $("blockedZoneFields").hidden = !rect || item.editor_kind !== "blocked_zone";
      $("apertureFields").hidden = !rect || !["water", "void"].includes(item.editor_kind);
      $("voidBehaviorLabel").hidden = item.editor_kind !== "void";
      const supportable = rect && Core.SUPPORTABLE_KINDS.has(item.editor_kind);
      $("supportFields").hidden = !supportable;
      const generatorReady = rect && Core.GENERATOR_KINDS.has(item.editor_kind);
      $("buildBadge").textContent = generatorReady ? "Blockout-ready" : "Sketch-only"; $("buildBadge").classList.toggle("sketch-only", !generatorReady);
      if (rect) {
        ["centerX", "centerY"].forEach((id, i) => $(id).value = item.center[i]); $("baseZ").value = Core.itemBaseZ(item); ["sizeX", "sizeY", "sizeZ"].forEach((id, i) => $(id).value = item.size[i]);
        $("baseZ").disabled = Boolean(item.supported_by);
        $("sizeZ").disabled = item.editor_kind === "blocked_zone" && item.vertical_mode === "containment";
        if (item.editor_kind === "blocked_zone") $("blockedZoneMode").value = item.vertical_mode || "containment";
        if (["water", "void"].includes(item.editor_kind)) { $("apertureDepth").value = item.depth; $("voidBehavior").value = item.behavior || "open"; }
        if (supportable) {
          const supports = Core.supportCandidates(spec, item);
          $("supportSelect").innerHTML = '<option value="">Custom elevation (not attached)</option>' + supports.map((candidate) => {
            const surface = candidate.editor_kind === "floor" ? "Ground" : labels[candidate.editor_kind] || candidate.editor_kind;
            return `<option value="${candidate.name}">${surface} — ${candidate.name} · top Z ${Core.itemTopZ(candidate)}</option>`;
          }).join("");
          $("supportSelect").value = item.supported_by || "";
          $("supportNote").textContent = item.supported_by ? `Attached to ${item.supported_by}; base elevation follows its top surface.` : "Custom elevation is an unattached numeric height. Only surfaces containing this feature's footprint are listed.";
        }
        if (["ramp", "stairs"].includes(item.editor_kind)) {
          $("rampAscent").value = item.ascent;
          $("ascentLabel").textContent = item.editor_kind === "stairs" ? "Stair ascent" : "Ramp ascent";
        }
        if (item.editor_kind === "stairs") {
          $("stairStepCount").value = item.step_count;
          const runAxis = item.ascent.startsWith("x") ? 0 : 1;
          const tread = item.size[runAxis] / item.step_count;
          const riser = item.size[2] / item.step_count;
          $("stairProfile").textContent = `${tread} unit tread · ${riser} unit riser`;
        }
        const pair = Core.rotatePoint(item.center, spec.symmetry.center); $("pairTitle").textContent = item.mirror ? "Paired by rotation" : "Centered feature"; $("pairPosition").textContent = item.mirror ? `Partner at X ${pair[0]}, Y ${pair[1]}` : "This feature builds once at the rotation center.";
      } else { $("pairTitle").textContent = item.mirror ? "Paired by rotation" : "Centered annotation"; $("pairPosition").textContent = item.mirror ? "The opposite annotation is locked." : "This annotation is invariant under rotation."; }
      $("surfaceNote").hidden = !["elevated", "bridge", "ramp", "stairs", "blocked_zone", "jump"].includes(item.editor_kind);
      if (item.editor_kind === "ramp") $("surfaceNote").textContent = "Solid 2:1 ramp: the run must remain exactly twice the rise.";
      else if (item.editor_kind === "stairs") {
        const riser = item.size[2] / item.step_count;
        $("surfaceNote").textContent = riser > Core.MAX_WALKABLE_RISER
          ? `Jump-required stairs: ${riser} unit risers exceed the ${Core.MAX_WALKABLE_RISER} unit ordinary-walking threshold. Bot traversal is not established.`
          : `Literal walking stairs: ${riser} unit risers are within the ${Core.MAX_WALKABLE_RISER} unit ordinary-walking threshold.`;
      }
      else if (item.editor_kind === "blocked_zone") $("surfaceNote").textContent = item.vertical_mode === "finite" ? "No-entry player/nav volume with a finite top that must be sealed by solid geometry." : "No-entry player/nav volume extending to the generated containment top.";
      else $("surfaceNote").textContent = "Single walkable surface: no playable space is expected underneath this feature.";
    }
    const sources = Core.allElements(spec).length; const built = Core.allElements(spec).reduce((sum, item) => sum + (item.mirror ? 2 : 1), 0);
    $("objectCount").textContent = `${sources} source feature${sources === 1 ? "" : "s"} · ${built} visible`;
    $("undoButton").disabled = !history.length; $("redoButton").disabled = !future.length;
  }

  function runValidation() {
    const report = Core.validateDraft(spec); const box = $("validationMessage");
    if (report.errors.length) { box.className = "validation bad"; box.innerHTML = `<span>!</span><p><strong>${report.errors.length} issue${report.errors.length > 1 ? "s" : ""} found</strong><small>${report.errors.join(" ")}</small></p>`; }
    else if (report.warnings.length) { box.className = "validation warn"; box.innerHTML = `<span>!</span><p><strong>Valid design draft</strong><small>${report.warnings.join(" ")}</small></p>`; }
    else { box.className = "validation good"; box.innerHTML = "<span>✓</span><p><strong>Draft is structurally sound</strong><small>Export stays unapproved until human review.</small></p>"; }
  }

  function removeSelected() {
    const item = selectedItem(); if (!item || item.editor_kind === "floor") return;
    mutate(() => { if (selection.type === "element") Core.removeElement(spec, item.name); else spec.sketch_annotations = spec.sketch_annotations.filter((entry) => entry.name !== item.name); selection = null; });
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 1 || spacePressed || panMode) {
      event.preventDefault(); canvas.setPointerCapture(event.pointerId);
      gesture = { type: "pan-view", start: [event.clientX, event.clientY], originalPan: { ...pan } };
      canvas.style.cursor = "grabbing"; return;
    }
    const point = screenToWorld(event.clientX, event.clientY); canvas.setPointerCapture(event.pointerId);
    if (tool === "select") {
      const current = selectedItem();
      if (selection?.type === "element" && current) { const corner = hitCorner(event, current, selectedPair); if (corner >= 0) { beginTransform("resize-element", { item: current, paired: selectedPair, corner, original: Core.clone(current) }); return; } }
      if (selection?.type === "annotation" && current) { const endpoint = hitAnnotationEndpoint(point, current, selectedPair); if (endpoint >= 0) { beginTransform("resize-annotation", { item: current, paired: selectedPair, endpoint, original: Core.clone(current) }); return; } }
      const spawnPair = hitSpawn(point);
      if (spawnPair !== null) { selection = { type: "spawn", name: "spawn" }; selectedPair = spawnPair; beginTransform("move-spawn", { paired: spawnPair }); syncUI(); draw(); return; }
      const annotationHit = hitAnnotation(point);
      if (annotationHit) { selection = { type: "annotation", name: annotationHit.item.name }; selectedPair = annotationHit.paired; const canonical = canonicalPoint(point, selectedPair); beginTransform("move-annotation", { item: annotationHit.item, paired: selectedPair, anchor: canonical, original: Core.clone(annotationHit.item) }); syncUI(); draw(); return; }
      const hit = hitElement(point);
      if (hit) { selection = { type: "element", name: hit.item.name }; selectedPair = hit.paired; if (hit.item.editor_kind !== "floor") { const canonical = canonicalPoint(point, selectedPair); beginTransform("move-element", { item: hit.item, paired: selectedPair, anchor: canonical, original: Core.clone(hit.item) }); } syncUI(); draw(); return; }
      selection = null; selectedPair = false; syncUI(); draw();
    } else if (tool === "spawn") {
      selection = { type: "spawn", name: "spawn" }; selectedPair = false;
      mutate(() => { const grid = Number(spec.sketch_settings.grid); spec.spawns.ct.origin[0] = Core.snap(point.x, grid); spec.spawns.ct.origin[1] = Core.snap(point.y, grid); });
      setTool("select");
    } else if (Core.ANNOTATION_KINDS.has(tool)) { gesture = { type: "draw-line", start: point, preview: null }; updateLinePreview(point); }
    else { gesture = { type: "draw-rect", start: point, preview: null }; updateRectPreview(point); }
  });

  canvas.addEventListener("pointermove", (event) => {
    const point = screenToWorld(event.clientX, event.clientY); $("pointerReadout").textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)}`;
    if (!gesture) return;
    const grid = Number(spec.sketch_settings.grid);
    if (gesture.type === "pan-view") {
      pan.x = gesture.originalPan.x + event.clientX - gesture.start[0]; pan.y = gesture.originalPan.y + event.clientY - gesture.start[1]; draw(); return;
    } else if (gesture.type === "draw-rect") updateRectPreview(point);
    else if (gesture.type === "draw-line") updateLinePreview(point);
    else if (gesture.type === "move-element") {
      const p = canonicalPoint(point, gesture.paired); const dx = Core.snap(p[0] - gesture.anchor[0], grid); const dy = Core.snap(p[1] - gesture.anchor[1], grid); gesture.item.center[0] = Core.cleanNumber(gesture.original.center[0] + dx); gesture.item.center[1] = Core.cleanNumber(gesture.original.center[1] + dy); gesture.item.mirror = gesture.item.center[0] !== 0 || gesture.item.center[1] !== 0; gesture.changed = true;
    } else if (gesture.type === "resize-element") {
      const p = canonicalPoint(point, gesture.paired); const [screenSx, screenSy] = cornerSigns[gesture.corner];
      const sx = gesture.paired ? -screenSx : screenSx; const sy = gesture.paired ? -screenSy : screenSy;
      if (gesture.item.editor_kind === "floor") { gesture.item.size[0] = Math.max(grid, 2 * Math.abs(Core.snap(p[0] - spec.symmetry.center[0], grid))); gesture.item.size[1] = Math.max(grid, 2 * Math.abs(Core.snap(p[1] - spec.symmetry.center[1], grid))); }
      else { const opposite = [gesture.original.center[0] - sx * gesture.original.size[0] / 2, gesture.original.center[1] + sy * gesture.original.size[1] / 2]; const moving = [Core.snap(p[0], grid), Core.snap(p[1], grid)]; gesture.item.center[0] = Core.cleanNumber((moving[0] + opposite[0]) / 2); gesture.item.center[1] = Core.cleanNumber((moving[1] + opposite[1]) / 2); gesture.item.size[0] = Math.max(grid, Math.abs(moving[0] - opposite[0])); gesture.item.size[1] = Math.max(grid, Math.abs(moving[1] - opposite[1])); Core.snapRectToGrid(gesture.item, spec, grid); } gesture.changed = true;
    } else if (gesture.type === "move-spawn") {
      const p = canonicalPoint(point, gesture.paired); spec.spawns.ct.origin[0] = Core.snap(p[0], grid); spec.spawns.ct.origin[1] = Core.snap(p[1], grid); spec.spawns.t = Core.pairedSpawn(spec.spawns.ct, spec.symmetry.center); gesture.changed = true;
    } else if (gesture.type === "move-annotation") {
      const p = canonicalPoint(point, gesture.paired); const dx = Core.snap(p[0] - gesture.anchor[0], grid); const dy = Core.snap(p[1] - gesture.anchor[1], grid); gesture.item.start = [gesture.original.start[0] + dx, gesture.original.start[1] + dy]; gesture.item.end = [gesture.original.end[0] + dx, gesture.original.end[1] + dy]; gesture.changed = true;
    } else if (gesture.type === "resize-annotation") {
      const p = canonicalPoint(point, gesture.paired); const target = gesture.endpoint === 0 ? "start" : "end"; gesture.item[target] = [Core.snap(p[0], grid), Core.snap(p[1], grid)]; const midpoint = [(gesture.item.start[0] + gesture.item.end[0]) / 2, (gesture.item.start[1] + gesture.item.end[1]) / 2]; gesture.item.mirror = midpoint[0] !== 0 || midpoint[1] !== 0; gesture.changed = true;
    }
    draw();
  });

  canvas.addEventListener("pointerup", () => {
    if (!gesture) return;
    if (gesture.type === "pan-view") { gesture = null; canvas.style.cursor = panMode ? "grab" : tool === "select" ? "default" : "crosshair"; return; }
    if (gesture.type === "draw-rect") {
      const item = gesture.preview; if (!item) { gesture = null; return; }
      item.name = Core.uniqueName(spec, presets[item.editor_kind].base); mutate(() => { Core.addElement(spec, item); selection = { type: "element", name: item.name }; selectedPair = false; }); gesture = null; setTool("select");
    } else if (gesture.type === "draw-line") {
      const item = gesture.preview; if (!item || (item.start[0] === item.end[0] && item.start[1] === item.end[1])) { gesture = null; draw(); return; }
      item.name = Core.uniqueName(spec, item.editor_kind); mutate(() => { spec.sketch_annotations.push(item); selection = { type: "annotation", name: item.name }; selectedPair = false; }); gesture = null; setTool("select");
    } else finishTransform();
    $("canvasHelp").classList.add("hidden");
  });

  canvas.addEventListener("pointercancel", () => { if (gesture?.before) spec = Core.normalizeSpec(JSON.parse(gesture.before)); gesture = null; canvas.style.cursor = panMode ? "grab" : tool === "select" ? "default" : "crosshair"; commit(); });
  canvas.addEventListener("wheel", (event) => { event.preventDefault(); setZoom(zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX, event.clientY); }, { passive: false });

  document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
  $("zoomIn").onclick = () => setZoom(zoom + .1);
  $("zoomOut").onclick = () => setZoom(zoom - .1);
  $("fitView").onclick = fitView;
  $("panMode").onclick = () => setPanMode(!panMode);
  $("toolsToggle").onclick = () => { const hidden = document.body.classList.toggle("tools-hidden"); $("toolsToggle").textContent = hidden ? "Show tools" : "Hide tools"; $("toolsToggle").setAttribute("aria-pressed", String(hidden)); requestAnimationFrame(resizeCanvas); };
  $("undoButton").onclick = undo; $("redoButton").onclick = redo; $("deleteButton").onclick = removeSelected; $("checkButton").onclick = runValidation;
  $("mapName").addEventListener("change", (event) => mutate(() => { spec.map_name = Core.slug(event.target.value); }));
  $("gridSize").addEventListener("change", (event) => mutate(() => { Core.snapSpecToGrid(spec, Number(event.target.value)); }));
  $("materialTheme").addEventListener("change", (event) => mutate(() => { Core.applyMaterialTheme(spec, event.target.value); }));
  $("environmentPreset").addEventListener("change", (event) => mutate(() => { spec.environment_preset = event.target.value; }));
  [["spawnX", 0], ["spawnY", 1]].forEach(([id, index]) => $(id).addEventListener("change", (event) => mutate(() => { spec.spawns.ct.origin[index] = Core.snap(Number(event.target.value), Number(spec.sketch_settings.grid)); })));
  $("spawnYaw").addEventListener("change", (event) => mutate(() => { spec.spawns.ct.angles[1] = ((Number(event.target.value) % 360) + 360) % 360; }));
  [["centerX", "center", 0], ["centerY", "center", 1], ["sizeX", "size", 0], ["sizeY", "size", 1], ["sizeZ", "size", 2]].forEach(([id, field, index]) => $(id).addEventListener("change", (event) => mutate(() => {
    const item = selectedItem(); if (!item?.center) return; const value = Number(event.target.value);
    if (index < 2) { item[field][index] = value; Core.snapRectToGrid(item, spec); }
    else { item[field][index] = field === "size" ? Math.max(16, Core.snap(value, 16)) : Core.snap(value, 16); if (item.editor_kind === "blocked_zone" && item.vertical_mode === "finite") item.height = item.size[2]; }
    if (item.editor_kind === "ramp" && field === "size") {
      const runAxis = item.ascent.startsWith("x") ? 0 : 1;
      if (index === 2) { item.size[runAxis] = 2 * item.size[2]; Core.snapRectToGrid(item, spec); }
      else if (index === runAxis) item.size[2] = item.size[runAxis] / 2;
    }
  })));
  $("baseZ").addEventListener("change", (event) => mutate(() => { const item = selectedItem(); if (!item?.center || item.supported_by) return; item.base_z = Core.snap(Number(event.target.value), 16); }));
  $("supportSelect").addEventListener("change", (event) => mutate(() => { const item = selectedItem(); if (!item?.center) return; Core.setSupport(spec, item, event.target.value || null); }));
  $("rampAscent").addEventListener("change", (event) => mutate(() => {
    const item = selectedItem(); if (!item || !["ramp", "stairs"].includes(item.editor_kind) || !Core.RAMP_DIRECTIONS.has(event.target.value)) return;
    const oldAxis = item.ascent.startsWith("x") ? 0 : 1; const newAxis = event.target.value.startsWith("x") ? 0 : 1;
    if (oldAxis !== newAxis) [item.size[0], item.size[1]] = [item.size[1], item.size[0]];
    item.ascent = event.target.value;
  }));
  $("blockedZoneMode").addEventListener("change", (event) => mutate(() => {
    const item = selectedItem(); if (item?.editor_kind !== "blocked_zone") return;
    item.vertical_mode = event.target.value;
    if (item.vertical_mode === "finite") item.height = item.size[2]; else delete item.height;
  }));
  $("apertureDepth").addEventListener("change", (event) => mutate(() => { const item = selectedItem(); if (!["water", "void"].includes(item?.editor_kind)) return; item.depth = Math.max(16, Math.min(256, Core.snap(Number(event.target.value), 16))); item.size[2] = item.depth; }));
  $("voidBehavior").addEventListener("change", (event) => mutate(() => { const item = selectedItem(); if (item?.editor_kind === "void") item.behavior = event.target.value; }));
  $("stairStepCount").addEventListener("change", (event) => mutate(() => {
    const item = selectedItem(); if (item?.editor_kind !== "stairs") return;
    item.step_count = Math.max(1, Math.min(64, Math.round(Number(event.target.value))));
  }));
  $("objectName").addEventListener("change", (event) => mutate(() => { const item = selectedItem(); if (!item) return; const previous = item.name; item.name = Core.uniqueName(spec, event.target.value, item.name); Core.allElements(spec).forEach((candidate) => { if (candidate.supported_by === previous) candidate.supported_by = item.name; }); selection.name = item.name; }));
  $("rotateButton").onclick = () => mutate(() => { const item = selectedItem(); if (!item?.size) return; [item.size[0], item.size[1]] = [item.size[1], item.size[0]]; if (["ramp", "stairs"].includes(item.editor_kind)) item.ascent = { "x+": "y+", "y+": "x-", "x-": "y-", "y-": "x+" }[item.ascent]; });
  $("duplicateButton").onclick = () => mutate(() => { const item = selectedItem(); if (!item?.center || item.editor_kind === "floor") return; const copy = Core.clone(item); copy.name = Core.uniqueName(spec, `${item.name}_copy`); const grid = Number(spec.sketch_settings.grid); copy.center[0] += grid; copy.center[1] += grid; copy.mirror = copy.center[0] !== 0 || copy.center[1] !== 0; Core.addElement(spec, copy); selection = { type: "element", name: copy.name }; selectedPair = false; });
  $("exportButton").onclick = () => { const data = JSON.stringify(Core.exportSpec(spec), null, 2) + "\n"; const blob = new Blob([data], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${spec.map_name}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); };
  $("fileInput").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; try { const loaded = Core.normalizeSpec(JSON.parse(await file.text())); remember(); spec = loaded; selection = null; selectedPair = false; zoom = 1; pan = { x: 0, y: 0 }; commit(); runValidation(); } catch (error) { alert(`Could not open design: ${error.message}`); } event.target.value = ""; });
  $("newButton").onclick = () => $("confirmDialog").showModal();
  $("confirmDialog").addEventListener("close", () => { if ($("confirmDialog").returnValue === "confirm") { remember(); spec = Core.defaultSpec(); selection = null; selectedPair = false; zoom = 1; commit(); } });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); spacePressed = true; if (!gesture) canvas.style.cursor = "grab"; return; }
    if (["INPUT", "SELECT"].includes(document.activeElement.tagName)) return;
    if (event.key === "Delete" || event.key === "Backspace") removeSelected();
    else if (event.key === "Escape" || event.key.toLowerCase() === "v") setTool("select");
    else if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else { const shortcuts = { w: "wall", c: "cover", l: "low_cover", b: "crate", i: "water", o: "void", g: "bridge", e: "elevated", p: "ramp", r: "stairs", z: "blocked_zone", j: "jump", s: "spawn", m: "measure", x: "sightline" }; if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]); }
  });
  document.addEventListener("keyup", (event) => { if (event.code === "Space") { spacePressed = false; if (gesture?.type !== "pan-view") canvas.style.cursor = panMode ? "grab" : tool === "select" ? "default" : "crosshair"; } });
  window.addEventListener("counterform-theme-change", draw);

  new ResizeObserver(resizeCanvas).observe($("canvasShell")); syncUI(); runValidation(); resizeCanvas();
})();
