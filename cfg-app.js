(function () {
  "use strict";
  const Core = window.CounterformCfgCore;
  const STORAGE_KEY = "counterform.match-config.v1";
  const WORKSPACE_KEY = "counterform.workspace.v1";
  const THEME_KEY = "counterform.theme.v1";
  const $ = (id) => document.getElementById(id);
  let config = loadConfig();
  let category = "all";
  let query = "";

  function loadConfig() {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) return Core.normalizeConfig(JSON.parse(saved)); } catch (_) { /* use preset */ }
    return Core.newConfig("research_1v1");
  }

  function commitConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    $("cfgSaveState").textContent = "Config saved in this browser";
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function switchWorkspace(next) {
    const chosen = next === "config" ? "config" : "sketch";
    $("sketchWorkspace").hidden = chosen !== "sketch";
    $("configWorkspace").hidden = chosen !== "config";
    $("sketchActions").hidden = chosen !== "sketch";
    $("configActions").hidden = chosen !== "config";
    document.querySelectorAll("[data-workspace]").forEach((button) => button.classList.toggle("active", button.dataset.workspace === chosen));
    localStorage.setItem(WORKSPACE_KEY, chosen);
    if (chosen === "sketch") window.dispatchEvent(new Event("resize"));
  }

  function renderPresets() {
    $("cfgPresets").innerHTML = Object.entries(Core.PRESETS).map(([id, preset]) => `<button class="preset-card ${config.preset === id ? "active" : ""}" data-preset="${id}"><strong>${escapeHtml(preset.label)}</strong><span>${escapeHtml(preset.description)}</span></button>`).join("");
  }

  function renderCategories() {
    const items = [{ id: "all", label: "All settings", description: "Search or browse the curated persistent settings." }, ...Core.CATEGORIES];
    $("cfgCategories").innerHTML = items.map((item) => {
      const count = item.id === "all" ? Core.REGISTRY.length : Core.REGISTRY.filter((entry) => entry.category === item.id).length;
      return `<button class="category-button ${category === item.id ? "active" : ""}" data-category="${item.id}"><span>${escapeHtml(item.label)}</span><b>${count}</b></button>`;
    }).join("");
    const selected = items.find((item) => item.id === category) || items[0];
    $("cfgEditorTitle").textContent = selected.label;
    $("cfgEditorDescription").textContent = selected.description;
  }

  function settingControl(entry, state) {
    const disabled = state.enabled ? "" : " disabled";
    const accessibleName = escapeHtml(`${entry.label} value`);
    if (entry.type === "boolean") return `<select aria-label="${accessibleName}" data-value="${entry.id}"${disabled}><option value="true"${state.value === true ? " selected" : ""}>On</option><option value="false"${state.value === false ? " selected" : ""}>Off</option></select>`;
    if (entry.type === "select") return `<select aria-label="${accessibleName}" data-value="${entry.id}"${disabled}>${entry.options.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === String(state.value) ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
    return `<div class="number-control"><input aria-label="${accessibleName}" data-value="${entry.id}" type="number" value="${escapeHtml(state.value)}" min="${entry.min}" max="${entry.max}" step="${entry.step}"${disabled}><span>${escapeHtml(entry.unit || "")}</span></div>`;
  }

  function renderSettings() {
    const entries = Core.searchRegistry(query, category);
    $("cfgSearchSummary").textContent = query ? `${entries.length} result${entries.length === 1 ? "" : "s"} for “${query}”` : `${entries.length} curated persistent setting${entries.length === 1 ? "" : "s"}`;
    $("cfgEmpty").hidden = entries.length > 0;
    $("cfgSettings").innerHTML = entries.map((entry) => {
      const state = Core.settingState(config, entry.id);
      const explanation = Core.settingExplanation(entry, state);
      return `<article class="setting-card ${state.enabled ? "enabled" : ""}" data-card="${entry.id}">
        <div class="setting-card-head"><div><span class="setting-category">${escapeHtml(Core.CATEGORIES.find((item) => item.id === entry.category)?.label || entry.category)}</span><h3>${escapeHtml(entry.label)}</h3></div><label class="include-setting"><input aria-label="Include ${escapeHtml(entry.label)}" data-enable="${entry.id}" type="checkbox"${state.enabled ? " checked" : ""}><span>Include</span></label></div>
        <p>${escapeHtml(entry.description)}</p>
        <div class="setting-control">${settingControl(entry, state)}</div>
        <details><summary>What this choice does</summary><div class="technical-detail"><strong>${escapeHtml(explanation.selected)}</strong><span>${escapeHtml(explanation.technical)}</span><span class="baseline-note">${escapeHtml(explanation.baseline)}</span><code>${entry.cvars.map(escapeHtml).join(" · ")}</code></div></details>
      </article>`;
    }).join("");
  }

  function textValue(value, trueText, falseText, missing = "Not specified") {
    return value === undefined ? missing : value ? trueText : falseText;
  }

  function renderTimeline(preview) {
    if (!preview.rounds) {
      $("previewTimeline").innerHTML = '<div class="timeline-empty">Enable Maximum rounds to see the match structure.</div>';
      return;
    }
    const half = (count, start) => count <= 12
      ? `<div class="round-run">${Array.from({ length: count }, (_, index) => `<i title="Round ${start + index}">${start + index}</i>`).join("")}</div>`
      : `<div class="round-run compressed"><i>${count} rounds</i></div>`;
    const second = preview.halftime && preview.secondHalf ? `<div class="halftime-marker"><span>HALFTIME</span><b>CT ⇄ T</b></div>${half(preview.secondHalf, preview.firstHalf + 1)}` : "";
    const cycle = Math.max(1, preview.freeze + (preview.play || 0) + preview.transition);
    const width = (value) => `${Math.max(value > 0 ? 3 : 0, value / cycle * 100)}%`;
    const buy = Number(Core.settingState(config, "buy_time").enabled ? Core.settingState(config, "buy_time").value : 0);
    const win = Number(Core.settingState(config, "win_panel_time").enabled ? Core.settingState(config, "win_panel_time").value : 0);
    const detail = preview.play === null ? "" : `<div class="round-detail"><div class="detail-label"><span>One configured round</span><b>${Core.formatDuration(cycle)}</b></div><div class="primary-track"><i class="freeze" style="width:${width(preview.freeze)}">${preview.freeze ? `Freeze ${preview.freeze}s` : ""}</i><i class="live" style="width:${width(preview.play)}">Live ${preview.play}s</i><i class="transition" style="width:${width(preview.transition)}">${preview.transition ? `Next ${preview.transition}s` : ""}</i></div><div class="secondary-track"><span>Buy window</span><i class="${buy ? "buy" : "off"}" style="width:${width(Math.min(buy, cycle))}">${buy ? `${buy}s` : "Off"}</i></div><div class="secondary-track"><span>Win panel</span><i class="${win ? "win" : "off"}" style="width:${width(Math.min(win, cycle))}">${win ? `${win}s` : "Off"}</i></div><div class="timeline-legend"><span><i class="freeze"></i>Freeze</span><span><i class="live"></i>Live play</span><span><i class="transition"></i>Transition</span><span><i class="buy"></i>Buying</span><span><i class="win"></i>Win panel</span></div></div>`;
    $("previewTimeline").innerHTML = `${detail}<div class="match-halves">${half(preview.halftime ? preview.firstHalf : preview.rounds, 1)}${second}${preview.overtime ? '<div class="overtime-marker">Overtime if tied</div>' : ""}</div>`;
  }

  function renderPreview() {
    const preview = Core.matchPreview(config); const report = Core.validateConfig(config);
    const preset = Core.PRESETS[config.preset];
    $("cfgPresetBadge").textContent = preset?.label || "Custom";
    $("previewDuration").textContent = preview.durationLabel;
    $("previewRoundCount").textContent = preview.rounds ? `${preview.rounds} regulation rounds` : "Rounds not specified";
    renderTimeline(preview);
    const timings = [];
    if (preview.warmup) timings.push(["Warmup", Core.formatDuration(preview.warmup)]);
    if (preview.freeze || Core.settingState(config, "freeze_time").enabled) timings.push(["Freeze", Core.formatDuration(preview.freeze)]);
    if (preview.play !== null) timings.push(["Play", Core.formatDuration(preview.play)]);
    if (preview.transition || Core.settingState(config, "round_restart_delay").enabled) timings.push(["Transition", Core.formatDuration(preview.transition)]);
    $("previewTiming").innerHTML = timings.length ? timings.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("") : '<span class="preview-missing">Enable timing settings for a breakdown.</span>';

    const sequence = [];
    if (Core.settingState(config, "warmup_enabled").enabled) sequence.push(Core.settingState(config, "warmup_enabled").value ? `Warmup runs for up to ${Core.formatDuration(preview.warmup)}.` : "Warmup is skipped.");
    if (Core.settingState(config, "freeze_time").enabled) sequence.push(`Players freeze for ${Core.formatDuration(preview.freeze)} at each round start.`);
    sequence.push(preview.play === null ? "The active game mode decides the round timer." : `Each round allows up to ${Core.formatDuration(preview.play)} of active play.`);
    if (preview.halftime) sequence.push(`Teams swap after ${preview.firstHalf} round${preview.firstHalf === 1 ? "" : "s"}.`);
    if (preview.overtime) sequence.push("A tied regulation match continues into overtime.");
    if (preview.clinch === true) sequence.push("The match ends early once the result is mathematically clinched.");
    else if (preview.clinch === false) sequence.push("All configured regulation rounds can be played.");
    $("previewSequence").innerHTML = sequence.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

    const teams = [];
    teams.push(`Auto-balance: ${textValue(preview.teams.autoBalance, "On", "Off")}`);
    if (preview.teams.difference !== undefined) teams.push(`Team difference: ${Number(preview.teams.difference) === 0 ? "Unrestricted" : preview.teams.difference}`);
    teams.push(`Friendly fire: ${textValue(preview.teams.friendlyFire, "On", "Off")}`);
    if (preview.teams.ctRespawn !== undefined || preview.teams.tRespawn !== undefined) teams.push(`Respawn: CT ${textValue(preview.teams.ctRespawn, "On", "Off")}, T ${textValue(preview.teams.tRespawn, "On", "Off")}`);
    $("previewTeams").innerHTML = teams.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    const bots = preview.bots.quota === undefined ? ["Not specified"] : [`${preview.bots.quota} bot${Number(preview.bots.quota) === 1 ? "" : "s"}`, preview.bots.mode ? `Mode: ${preview.bots.mode}` : null].filter(Boolean);
    $("previewBots").innerHTML = bots.map((item) => `<span>${escapeHtml(item)}</span>`).join("");

    $("previewLoadouts").innerHTML = `<div><b class="team ct">CT</b><strong>${escapeHtml(preview.weapons.ct.join(" + ") || "Game-mode loadout")}</strong></div><div><b class="team t">T</b><strong>${escapeHtml(preview.weapons.t.join(" + ") || "Game-mode loadout")}</strong></div><div class="ammo-summary"><span>Ammo</span><strong>${escapeHtml(preview.weapons.ammo)}</strong></div>`;
    const economy = [];
    if (preview.economy.buyTime !== undefined) economy.push(Number(preview.economy.buyTime) ? `${preview.economy.buyTime}s buy window` : "Buying disabled by a 0s window");
    if (preview.economy.buyAnywhere !== undefined) economy.push(preview.economy.buyAnywhere ? "Buy anywhere" : "Normal buy locations");
    if (preview.economy.startMoney !== undefined) economy.push(`Start $${preview.economy.startMoney}`);
    $("previewEconomy").innerHTML = (economy.length ? economy : ["Economy not specified"]).map((item) => `<span>${escapeHtml(item)}</span>`).join("");

    const messages = [...report.errors, ...preview.warnings];
    $("previewWarningsSection").hidden = messages.length === 0;
    $("previewWarningCount").textContent = messages.length ? String(messages.length) : "";
    $("previewWarnings").innerHTML = messages.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    $("unmanagedSection").hidden = preview.unmanagedCount === 0;
    $("unmanagedCount").textContent = preview.unmanagedCount ? `${preview.unmanagedCount} line${preview.unmanagedCount === 1 ? "" : "s"}` : "";
    $("unmanagedLines").textContent = (config.unmanaged_lines || []).join("\n");
    $("execCommand").textContent = `exec ${Core.slug(config.config_name)}`;
    try { $("cfgCode").textContent = Core.exportCfg(config); } catch (error) { $("cfgCode").textContent = `// Cannot export yet\n// ${error.message}\n`; }
    $("cfgEnabledCount").textContent = `${preview.enabledCount} setting${preview.enabledCount === 1 ? "" : "s"} included`;
  }

  function render() {
    $("cfgName").value = config.config_name;
    renderPresets(); renderCategories(); renderSettings(); renderPreview();
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.querySelectorAll("[data-workspace]").forEach((button) => button.addEventListener("click", () => switchWorkspace(button.dataset.workspace)));
  $("cfgPresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]"); if (!button) return;
    Core.applyPreset(config, button.dataset.preset); config.config_name = `${button.dataset.preset}_match`; commitConfig();
  });
  $("cfgCategories").addEventListener("click", (event) => { const button = event.target.closest("[data-category]"); if (!button) return; category = button.dataset.category; render(); });
  $("cfgSearch").addEventListener("input", (event) => { query = event.target.value; renderCategories(); renderSettings(); });
  $("cfgSettings").addEventListener("input", (event) => {
    const valueId = event.target.dataset.value; if (!valueId) return;
    const entry = Core.registryById(valueId); let value = event.target.value;
    if (entry.type === "boolean") value = value === "true"; else if (entry.type === "number") value = Number(value);
    Core.setSetting(config, valueId, value, true); localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    renderPresets(); renderPreview();
  });
  $("cfgSettings").addEventListener("change", (event) => {
    const enableId = event.target.dataset.enable; const valueId = event.target.dataset.value;
    if (enableId) {
      const entry = Core.registryById(enableId); Core.setSetting(config, enableId, entry.defaultValue, event.target.checked); commitConfig();
    } else if (valueId) {
      const entry = Core.registryById(valueId); let value = event.target.value;
      if (entry.type === "boolean") value = value === "true"; else if (entry.type === "number") value = Number(value);
      Core.setSetting(config, valueId, value, true); commitConfig();
    }
  });
  $("cfgName").addEventListener("change", (event) => { config.config_name = Core.slug(event.target.value); config.preset = "custom"; commitConfig(); });
  $("cfgNewButton").addEventListener("click", () => { if (!window.confirm("Start a blank match config? Download the current CFG first if you want a portable copy.")) return; config = Core.newConfig("blank"); config.config_name = "counterform_match"; category = "all"; query = ""; $("cfgSearch").value = ""; commitConfig(); });
  $("cfgExportButton").addEventListener("click", () => {
    const report = Core.validateConfig(config); if (report.errors.length) { window.alert(report.errors.join("\n")); return; }
    downloadText(`${Core.slug(config.config_name)}.cfg`, Core.exportCfg(config), "text/plain");
  });
  $("cfgCopyButton").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(Core.exportCfg(config)); $("cfgCopyButton").textContent = "Copied"; setTimeout(() => { $("cfgCopyButton").textContent = "Copy CFG"; }, 1200); } catch (_) { $("cfgCopyButton").textContent = "Copy unavailable"; }
  });
  $("cfgFileInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { try { config = Core.parseCfg(reader.result, file.name); category = "all"; query = ""; $("cfgSearch").value = ""; commitConfig(); } catch (error) { window.alert(error.message); } }; reader.readAsText(file); event.target.value = "";
  });

  function applyTheme(theme) {
    const chosen = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = chosen;
    $("themeToggle").textContent = chosen === "dark" ? "Light" : "Dark";
    $("themeToggle").setAttribute("aria-label", `Switch to ${chosen === "dark" ? "light" : "dark"} theme`);
    localStorage.setItem(THEME_KEY, chosen);
    window.dispatchEvent(new CustomEvent("counterform-theme-change", { detail: { theme: chosen } }));
  }
  $("themeToggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  render();
  switchWorkspace(localStorage.getItem(WORKSPACE_KEY) || "sketch");
})();
