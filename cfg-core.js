(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CounterformCfgCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CATEGORIES = [
    { id: "basics", label: "Basics", description: "Warmup and the rhythm around each round." },
    { id: "rounds", label: "Rounds & format", description: "Match length, halftime, clinching, and overtime." },
    { id: "teams", label: "Teams", description: "Balance, collision, respawning, and friendly fire." },
    { id: "economy", label: "Buying & economy", description: "Buy access, money, rewards, and armor." },
    { id: "weapons", label: "Weapons", description: "Starting loadouts, ammunition, map pickups, and drops." },
    { id: "bots", label: "Bots", description: "Persistent bot population and behavior." },
    { id: "communication", label: "Communication", description: "Voice, dead-player chat, and spectator restrictions." },
  ];

  const WEAPONS = [
    ["", "None"], ["weapon_m4a1_silencer", "M4A1-S"], ["weapon_m4a1", "M4A4"],
    ["weapon_ak47", "AK-47"], ["weapon_famas", "FAMAS"], ["weapon_galilar", "Galil AR"],
    ["weapon_awp", "AWP"], ["weapon_ssg08", "SSG 08"], ["weapon_aug", "AUG"],
    ["weapon_sg556", "SG 553"], ["weapon_mp9", "MP9"], ["weapon_mac10", "MAC-10"],
  ];
  const SECONDARIES = [
    ["", "None"], ["weapon_hkp2000", "P2000"], ["weapon_usp_silencer", "USP-S"],
    ["weapon_glock", "Glock-18"], ["weapon_p250", "P250"], ["weapon_deagle", "Desert Eagle"],
  ];

  const REGISTRY = [
    setting("warmup_enabled", "basics", "Warmup", ["mp_do_warmup_period"], "boolean", true, "Run the configured warmup period before the match.", ["practice", "pregame"]),
    setting("warmup_time", "basics", "Warmup duration", ["mp_warmuptime"], "number", 60, "Maximum warmup length.", ["pregame"], { min: 0, max: 3600, step: 5, unit: "seconds" }),
    setting("freeze_time", "basics", "Freeze time", ["mp_freezetime"], "number", 15, "Seconds players remain frozen at each round start.", ["round start"], { min: 0, max: 60, step: 1, unit: "seconds" }),
    setting("round_restart_delay", "basics", "Round transition", ["mp_round_restart_delay"], "number", 7, "Delay between a round ending and the next round beginning.", ["restart delay", "between rounds"], { min: 0, max: 30, step: 1, unit: "seconds" }),
    setting("win_panel_time", "basics", "Win panel display", ["mp_win_panel_display_time"], "number", 3, "How long the end-of-round winner panel remains visible.", ["scoreboard"], { min: 0, max: 20, step: 1, unit: "seconds" }),

    setting("max_rounds", "rounds", "Maximum rounds", ["mp_maxrounds"], "number", 24, "Regulation round cap before overtime rules are considered.", ["best of", "match length"], { min: 1, max: 100, step: 1, unit: "rounds" }),
    setting("round_time", "rounds", "Round duration", ["mp_roundtime"], "number", 115, "Maximum active-play time per round. Counterform converts seconds to the minutes expected by CS2.", ["timer", "minutes"], { min: 15, max: 3600, step: 5, unit: "seconds", encode: "minutes" }),
    setting("halftime", "rounds", "Halftime team swap", ["mp_halftime"], "boolean", true, "Swap CT and T sides at the regulation midpoint.", ["switch teams", "half"]),
    setting("clinch", "rounds", "End when victory is clinched", ["mp_match_can_clinch"], "boolean", true, "Finish once the trailing team can no longer catch up.", ["mercy", "early finish"]),
    setting("overtime", "rounds", "Enable overtime", ["mp_overtime_enable"], "boolean", false, "Allow tied regulation matches to continue into overtime.", ["tie", "extra rounds"]),
    setting("overtime_limit", "rounds", "Overtime set limit", ["mp_overtime_limit"], "number", 1, "Maximum overtime sets. A value of 0 lets the active game mode decide.", ["extra rounds"], { min: 0, max: 20, step: 1, unit: "sets" }),

    setting("autobalance", "teams", "Auto-balance teams", ["mp_autoteambalance"], "boolean", false, "Automatically move players when teams become uneven.", ["balance"]),
    setting("team_difference", "teams", "Allowed team-size difference", ["mp_limitteams"], "number", 0, "Maximum player-count difference. Zero disables this restriction.", ["limit teams"], { min: 0, max: 10, step: 1, unit: "players" }),
    setting("friendly_fire", "teams", "Friendly fire", ["mp_friendlyfire"], "boolean", false, "Allow teammates to damage each other.", ["team damage"]),
    setting("solid_teammates", "teams", "Solid teammates", ["mp_solid_teammates"], "select", 1, "Choose whether teammates block movement.", ["collision"], { options: [[0, "No collision"], [1, "Solid"], [2, "Push-through"]] }),
    setting("respawn_ct", "teams", "CT respawn", ["mp_respawn_on_death_ct"], "boolean", false, "Respawn Counter-Terrorists after death instead of waiting for the next round.", ["deathmatch"]),
    setting("respawn_t", "teams", "T respawn", ["mp_respawn_on_death_t"], "boolean", false, "Respawn Terrorists after death instead of waiting for the next round.", ["deathmatch"]),

    setting("buy_time", "economy", "Buy time", ["mp_buytime"], "number", 20, "Seconds available for buying. Zero effectively disables the normal buy window.", ["shop", "purchases"], { min: 0, max: 3600, step: 5, unit: "seconds" }),
    setting("buy_anywhere", "economy", "Buy anywhere", ["mp_buy_anywhere"], "boolean", false, "Allow buying outside a buy zone while the buy window is open.", ["buy zone", "shop"]),
    setting("start_money", "economy", "Starting money", ["mp_startmoney"], "number", 800, "Cash each player receives at match start.", ["cash"], { min: 0, max: 65535, step: 100, unit: "$" }),
    setting("max_money", "economy", "Maximum money", ["mp_maxmoney"], "number", 16000, "Maximum cash a player can hold.", ["cash cap"], { min: 0, max: 65535, step: 100, unit: "$" }),
    setting("player_cash_awards", "economy", "Player cash rewards", ["mp_playercashawards"], "boolean", true, "Award personal cash for supported actions such as kills.", ["economy rewards"]),
    setting("team_cash_awards", "economy", "Team cash rewards", ["mp_teamcashawards"], "boolean", true, "Award team-based round money.", ["economy rewards"]),
    setting("free_armor", "economy", "Free armor", ["mp_free_armor"], "select", 0, "Equipment granted without buying.", ["kevlar", "helmet"], { options: [[0, "None"], [1, "Kevlar"], [2, "Kevlar + helmet"]] }),

    setting("ct_primary", "weapons", "CT starting primary", ["mp_ct_default_primary"], "select", "", "Primary weapon granted to CT players at spawn.", ["loadout", "rifle"], { options: WEAPONS }),
    setting("t_primary", "weapons", "T starting primary", ["mp_t_default_primary"], "select", "", "Primary weapon granted to T players at spawn.", ["loadout", "rifle"], { options: WEAPONS }),
    setting("ct_secondary", "weapons", "CT starting secondary", ["mp_ct_default_secondary"], "select", "weapon_hkp2000", "Secondary weapon granted to CT players at spawn.", ["loadout", "pistol"], { options: SECONDARIES }),
    setting("t_secondary", "weapons", "T starting secondary", ["mp_t_default_secondary"], "select", "weapon_glock", "Secondary weapon granted to T players at spawn.", ["loadout", "pistol"], { options: SECONDARIES }),
    setting("melee", "weapons", "Starting knife", ["mp_ct_default_melee", "mp_t_default_melee"], "boolean", true, "Give both teams their normal knife.", ["melee"], { encode: "knife" }),
    setting("infinite_ammo", "weapons", "Ammunition", ["sv_infinite_ammo"], "select", 0, "Choose normal ammo, infinite reserve with reloads, or no-reload infinite magazines.", ["reload", "reserve"], { options: [[0, "Normal"], [2, "Infinite reserve; reload required"], [1, "Infinite magazine; no reload"]] }),
    setting("map_weapons", "weapons", "Allow map-placed weapons", ["mp_weapons_allow_map_placed"], "boolean", false, "Keep weapon entities authored into the map.", ["pickups"]),
    setting("drop_guns", "weapons", "Drop guns on death", ["mp_death_drop_gun"], "select", 1, "Choose what firearm remains after a player dies.", ["death drop"], { options: [[0, "Drop none"], [1, "Drop best weapon"], [2, "Drop current or best"]] }),

    setting("bot_quota", "bots", "Bot count / quota", ["bot_quota"], "number", 0, "Target bot population interpreted by the selected quota mode.", ["ai players"], { min: 0, max: 32, step: 1, unit: "bots" }),
    setting("bot_quota_mode", "bots", "Bot quota mode", ["bot_quota_mode"], "select", "normal", "Normal keeps an exact quota; fill adds bots toward a player target; competitive follows that mode's rules.", ["fill", "population"], { options: [["normal", "Exact bot quota"], ["fill", "Fill toward player target"], ["competitive", "Competitive rules"]] }),
    setting("bot_difficulty", "bots", "Bot difficulty", ["bot_difficulty"], "select", 2, "Base bot skill level.", ["easy", "hard", "expert"], { options: [[0, "Easy"], [1, "Normal"], [2, "Hard"], [3, "Expert"], [4, "Expert+"]] }),
    setting("bot_chatter", "bots", "Bot radio chatter", ["bot_chatter"], "select", "off", "How often bots use radio voice lines.", ["radio", "voice"], { options: [["off", "Off"], ["minimal", "Minimal"], ["radio", "Radio only"], ["normal", "Normal"]] }),

    setting("dead_talk", "communication", "Dead players can talk", ["sv_deadtalk"], "boolean", true, "Allow dead players to communicate according to the active server mode.", ["voice", "spectator"]),
    setting("enemy_living_talk", "communication", "Living enemies hear each other", ["sv_talk_enemy_living"], "boolean", false, "Allow living players to hear the opposing team.", ["all talk", "voice"]),
    setting("enemy_dead_talk", "communication", "Dead enemies hear each other", ["sv_talk_enemy_dead"], "boolean", false, "Allow dead players to hear dead opponents.", ["all talk", "voice"]),
    setting("force_camera", "communication", "Spectator camera", ["mp_forcecamera"], "select", 1, "Restrict what dead players can spectate.", ["spectator"], { options: [[0, "Anyone"], [1, "Teammates only"], [2, "First person only"]] }),
  ];

  const PRESETS = {
    research_1v1: preset("Research 1v1", "Short, repeatable rounds; mirrored M4A1-S loadouts; no bots or economy.", {
      warmup_enabled: false, warmup_time: 0, freeze_time: 3, round_restart_delay: 3, win_panel_time: 2,
      max_rounds: 10, round_time: 90, halftime: true, clinch: false, overtime: false,
      autobalance: false, team_difference: 0, friendly_fire: false, solid_teammates: 1, respawn_ct: false, respawn_t: false,
      buy_time: 0, buy_anywhere: false, start_money: 0, max_money: 0, player_cash_awards: false, team_cash_awards: false, free_armor: 2,
      ct_primary: "weapon_m4a1_silencer", t_primary: "weapon_m4a1_silencer", ct_secondary: "", t_secondary: "", melee: false,
      infinite_ammo: 2, map_weapons: false, drop_guns: 0,
      bot_quota: 0, bot_quota_mode: "normal",
      dead_talk: true, enemy_living_talk: false, enemy_dead_talk: true, force_camera: 0,
    }),
    quick_test: preset("Quick map test", "Five fast rounds, no freeze, infinite magazines, and one test bot.", {
      warmup_enabled: false, warmup_time: 0, freeze_time: 0, round_restart_delay: 1, win_panel_time: 1,
      max_rounds: 5, round_time: 60, halftime: false, clinch: false, overtime: false,
      autobalance: false, team_difference: 0, friendly_fire: false, respawn_ct: true, respawn_t: true,
      buy_time: 3600, buy_anywhere: true, start_money: 16000, max_money: 65535, free_armor: 2,
      infinite_ammo: 1, map_weapons: false, drop_guns: 0,
      bot_quota: 1, bot_quota_mode: "normal", bot_difficulty: 1, bot_chatter: "off",
    }),
    competitive: preset("Standard competitive", "A readable Valve-style competitive baseline with 24 regulation rounds.", {
      warmup_enabled: true, warmup_time: 120, freeze_time: 15, round_restart_delay: 7, win_panel_time: 3,
      max_rounds: 24, round_time: 115, halftime: true, clinch: true, overtime: true, overtime_limit: 1,
      autobalance: false, team_difference: 1, friendly_fire: true, solid_teammates: 1, respawn_ct: false, respawn_t: false,
      buy_time: 20, buy_anywhere: false, start_money: 800, max_money: 16000, player_cash_awards: true, team_cash_awards: true, free_armor: 0,
      ct_primary: "", t_primary: "", ct_secondary: "weapon_hkp2000", t_secondary: "weapon_glock", melee: true,
      infinite_ammo: 0, map_weapons: true, drop_guns: 1,
      bot_quota: 1, bot_quota_mode: "competitive", bot_difficulty: 2, bot_chatter: "normal",
      dead_talk: true, enemy_living_talk: false, enemy_dead_talk: false, force_camera: 1,
    }),
    blank: preset("Blank", "Start with no emitted settings and enable only what you need.", {}),
  };

  function setting(id, category, label, cvars, type, defaultValue, description, keywords = [], extra = {}) {
    return Object.assign({ id, category, label, cvars, type, defaultValue, description, keywords }, extra);
  }
  function preset(label, description, values) { return { label, description, values }; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function registryById(id) { return REGISTRY.find((entry) => entry.id === id) || null; }
  function slug(value) { return String(value || "counterform_match").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "counterform_match"; }

  function newConfig(presetId = "research_1v1") {
    const config = { schema_version: 1, kind: "counterform-match-config", config_name: `${presetId}_match`, preset: presetId, settings: {} };
    return applyPreset(config, presetId);
  }

  function applyPreset(config, presetId) {
    const chosen = PRESETS[presetId] || PRESETS.blank;
    config.preset = PRESETS[presetId] ? presetId : "blank";
    config.settings = {};
    Object.entries(chosen.values).forEach(([id, value]) => { config.settings[id] = { enabled: true, value }; });
    return config;
  }

  function normalizeConfig(input) {
    if (!input || input.schema_version !== 1 || input.kind !== "counterform-match-config") throw new Error("This is not a Counterform match-config JSON file.");
    const config = { schema_version: 1, kind: "counterform-match-config", config_name: slug(input.config_name), preset: PRESETS[input.preset] ? input.preset : "custom", settings: {} };
    Object.entries(input.settings || {}).forEach(([id, state]) => {
      const entry = registryById(id); if (!entry || !state || state.enabled !== true) return;
      config.settings[id] = { enabled: true, value: normalizeValue(entry, state.value) };
    });
    return config;
  }

  function normalizeValue(entry, value) {
    if (entry.type === "boolean") return value === true || value === 1 || value === "1";
    if (entry.type === "number") {
      let number = Number(value); if (!Number.isFinite(number)) number = Number(entry.defaultValue);
      return Math.min(Number(entry.max), Math.max(Number(entry.min), number));
    }
    const options = entry.options || [];
    const match = options.find(([candidate]) => String(candidate) === String(value));
    return match ? match[0] : entry.defaultValue;
  }

  function settingState(config, id) {
    const entry = registryById(id); const state = config.settings[id];
    return { enabled: Boolean(state?.enabled), value: state?.enabled ? normalizeValue(entry, state.value) : clone(entry.defaultValue) };
  }

  function setSetting(config, id, value, enabled = true) {
    const entry = registryById(id); if (!entry) return config;
    if (!enabled) delete config.settings[id];
    else config.settings[id] = { enabled: true, value: normalizeValue(entry, value) };
    config.preset = "custom"; return config;
  }

  function validateConfig(config) {
    const errors = []; const warnings = [];
    if (!/^[a-z0-9_]+$/.test(config.config_name || "")) errors.push("Config name must use lowercase letters, numbers, and underscores.");
    Object.entries(config.settings || {}).forEach(([id, state]) => {
      const entry = registryById(id); if (!entry) errors.push(`Unknown setting: ${id}.`);
      else if (state?.enabled) {
        const value = state.value;
        if (entry.type === "number" && (!Number.isFinite(Number(value)) || Number(value) < entry.min || Number(value) > entry.max)) errors.push(`${entry.label} is outside its allowed range.`);
        if (entry.type === "select" && !(entry.options || []).some(([candidate]) => String(candidate) === String(value))) errors.push(`${entry.label} has an unsupported value.`);
      }
    });
    const enabled = (id) => Boolean(config.settings[id]?.enabled);
    const value = (id) => enabled(id) ? config.settings[id].value : undefined;
    if (value("halftime") && enabled("max_rounds") && Number(value("max_rounds")) < 2) warnings.push("Halftime has no useful midpoint with fewer than two rounds.");
    if (value("overtime") && !enabled("max_rounds")) warnings.push("Overtime is enabled but regulation round count is not specified.");
    if (enabled("buy_time") && Number(value("buy_time")) === 0 && value("buy_anywhere")) warnings.push("Buy anywhere is enabled, but buy time is zero.");
    if (enabled("buy_time") && Number(value("buy_time")) === 0 && (Number(value("start_money")) > 0 || value("player_cash_awards") || value("team_cash_awards"))) warnings.push("Economy settings are active while the buy window is disabled.");
    if (enabled("bot_quota") && Number(value("bot_quota")) === 0 && (enabled("bot_difficulty") || enabled("bot_chatter"))) warnings.push("Bot behavior is configured, but bot quota is zero.");
    if (!Object.keys(config.settings || {}).length) warnings.push("No settings are enabled; the exported CFG will contain comments only.");
    return { errors, warnings };
  }

  function encodeValue(entry, value) {
    if (entry.encode === "minutes") return formatNumber(Number(value) / 60);
    if (entry.encode === "knife") return value ? "weapon_knife" : "";
    if (entry.type === "boolean") return value ? "1" : "0";
    if (typeof value === "number") return formatNumber(value);
    return String(value);
  }
  function formatNumber(value) { return Number(value.toFixed(6)).toString(); }
  function cfgToken(value) {
    const string = String(value);
    if (string === "" || /\s|\/\/|"/.test(string)) return `"${string.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    return string;
  }

  function exportCfg(config) {
    const report = validateConfig(config); if (report.errors.length) throw new Error(report.errors.join(" "));
    const lines = ["// Generated by Counterform Match Config", `// ${config.config_name}`, "// Persistent settings only; execute after the active game-mode CFG.", ""];
    CATEGORIES.forEach((category) => {
      const entries = REGISTRY.filter((entry) => entry.category === category.id && config.settings[entry.id]?.enabled);
      if (!entries.length) return;
      lines.push(`// ${category.label}`);
      entries.forEach((entry) => {
        const encoded = encodeValue(entry, normalizeValue(entry, config.settings[entry.id].value));
        entry.cvars.forEach((cvar) => lines.push(`${cvar} ${cfgToken(encoded)} // ${entry.label}`));
      });
      lines.push("");
    });
    return `${lines.join("\n").trimEnd()}\n`;
  }

  function searchRegistry(query, category = "all") {
    const terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    return REGISTRY.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      const haystack = [entry.label, entry.description, entry.category, ...entry.cvars, ...entry.keywords].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  function optionLabel(entry, value) {
    return entry?.options?.find(([candidate]) => String(candidate) === String(value))?.[1] ?? String(value ?? "Not specified");
  }
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "Not enough settings";
    const rounded = Math.max(0, Math.round(seconds)); const hours = Math.floor(rounded / 3600); const minutes = Math.floor((rounded % 3600) / 60); const secs = rounded % 60;
    return hours ? `${hours}h ${minutes}m ${secs}s` : minutes ? `${minutes}m ${secs}s` : `${secs}s`;
  }

  function matchPreview(config) {
    const state = (id) => settingState(config, id); const enabledValue = (id) => state(id).enabled ? state(id).value : undefined;
    const rounds = Number(enabledValue("max_rounds")); const play = Number(enabledValue("round_time"));
    const freeze = Number(enabledValue("freeze_time") ?? 0); const transition = Number(enabledValue("round_restart_delay") ?? 0);
    const warmupEnabled = enabledValue("warmup_enabled"); const warmup = warmupEnabled === true ? Number(enabledValue("warmup_time") ?? 0) : 0;
    const regulationSeconds = Number.isFinite(rounds) && Number.isFinite(play) ? warmup + rounds * (play + freeze + transition) : NaN;
    const firstHalf = Number.isFinite(rounds) ? Math.ceil(rounds / 2) : 0; const secondHalf = Number.isFinite(rounds) ? rounds - firstHalf : 0;
    const report = validateConfig(config);
    const ctPrimary = enabledValue("ct_primary"); const tPrimary = enabledValue("t_primary");
    const ctSecondary = enabledValue("ct_secondary"); const tSecondary = enabledValue("t_secondary");
    return {
      rounds: Number.isFinite(rounds) ? rounds : null,
      firstHalf, secondHalf,
      halftime: enabledValue("halftime") === true,
      overtime: enabledValue("overtime") === true,
      regulationSeconds,
      durationLabel: formatDuration(regulationSeconds),
      warmup, play: Number.isFinite(play) ? play : null, freeze, transition,
      clinch: enabledValue("clinch"),
      teams: {
        autoBalance: enabledValue("autobalance"), difference: enabledValue("team_difference"), friendlyFire: enabledValue("friendly_fire"),
        ctRespawn: enabledValue("respawn_ct"), tRespawn: enabledValue("respawn_t"),
      },
      economy: {
        buyTime: enabledValue("buy_time"), buyAnywhere: enabledValue("buy_anywhere"), startMoney: enabledValue("start_money"), freeArmor: enabledValue("free_armor"),
      },
      weapons: {
        ct: [optionLabel(registryById("ct_primary"), ctPrimary), optionLabel(registryById("ct_secondary"), ctSecondary)].filter((label) => label !== "None" && label !== "Not specified"),
        t: [optionLabel(registryById("t_primary"), tPrimary), optionLabel(registryById("t_secondary"), tSecondary)].filter((label) => label !== "None" && label !== "Not specified"),
        ammo: enabledValue("infinite_ammo") === undefined ? "Not specified" : optionLabel(registryById("infinite_ammo"), enabledValue("infinite_ammo")),
        knife: enabledValue("melee"),
      },
      bots: { quota: enabledValue("bot_quota"), mode: enabledValue("bot_quota_mode"), difficulty: enabledValue("bot_difficulty") },
      warnings: report.warnings,
      enabledCount: Object.values(config.settings || {}).filter((item) => item?.enabled).length,
    };
  }

  return { CATEGORIES, REGISTRY, PRESETS, clone, slug, registryById, newConfig, applyPreset, normalizeConfig, normalizeValue, settingState, setSetting, validateConfig, exportCfg, searchRegistry, optionLabel, formatDuration, matchPreview };
});
