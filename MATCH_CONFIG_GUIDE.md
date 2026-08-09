# Counterform Match Config guide

Counterform contains two independent browser tools:

- **Map Sketcher** saves and exports arena-sketch JSON.
- **Match Config** saves editable match-config JSON and exports a CS2 `.cfg`.

Neither tool reads or changes the other's state. Use either one by itself or
switch between them when a project needs both.

## Build a config

1. Open `docs\index.html` in a modern browser or use the deployed Counterform
   site.
2. Choose **Match Config** in the top navigation.
3. Start from **Research 1v1**, **Quick map test**, **Standard competitive**, or
   **Blank**.
4. Browse a category or search by a plain-language term such as `reload` or an
   exact cvar such as `mp_buytime`.
5. Check **Include** for every setting Counterform should write. Unchecked
   settings remain under the active game mode's control.
6. Review the live preview and resolve meaningful warnings.
7. Choose **Download CFG**.

Run the resulting file after the active game-mode CFG so these values are the
final overrides. For a host console, that normally means placing the file in an
appropriate CS2 `cfg` folder and executing `exec your_config_name` at the right
point in the host workflow.

## Editable JSON versus CFG

**Save config JSON** downloads Counterform's editable representation. It keeps
setting IDs, Include state, selected values, and the preset/custom label. Use
**Open config** to continue editing that JSON later.

**Download CFG** creates the server-facing text file. Counterform does not parse
arbitrary CFG files back into the editor; doing so would require safely
interpreting aliases, nested `exec` calls, one-shot commands, and unknown
plugins. Keep the JSON alongside any CFG that needs future editing.

The map-sketch JSON and match-config JSON are deliberately different file
kinds, storage keys, and schemas.

## What the preview means

The duration is the **configured regulation maximum**:

`warmup + rounds × (freeze + active round + transition)`

It is not a prediction. Eliminations can end rounds early, clinching can end a
match before every configured round, and overtime can extend a tied match. The
preview therefore shows overtime separately instead of pretending it has a
known duration.

The other preview sections summarize:

- regulation halves and halftime team swap;
- match-start and per-round sequence;
- team balance, friendly fire, and respawning;
- bot population mode;
- starting loadouts and ammunition behavior; and
- buying and starting economy.

Warnings call out combinations that are likely ineffective, such as Buy
anywhere with a zero-second buy window or bot behavior with a zero bot quota.

## Allowlist and safety boundary

The registry contains 40 persistent settings drawn from Valve's installed
CS2 game-mode CFGs and command documentation. Human-readable controls are the
source of truth; technical details expose the cvar names for search and review.

V1 deliberately excludes arbitrary command entry and one-shot/admin actions,
including `mp_swapteams`, `mp_restartgame`, `bot_add`, and `bot_kick`. New
settings must be added to the registry with a type, range/options, description,
export rule, preview semantics where relevant, and automated tests.

Weapon support in V1 focuses on starting primary/secondary/melee loadouts,
ammunition behavior, map-placed weapons, and death drops. It does not attempt
to expose every CS2 item ID or plugin-specific weapon restriction.

## Presets

- **Research 1v1:** ten 90-second rounds, halftime, M4A1-S for both teams, no
  secondary or knife, infinite reserve ammunition with normal reloads, no
  buying, no weapon drops, and zero bots.
- **Quick map test:** five 60-second rounds, no freeze, respawning, a long
  buy-anywhere window, infinite magazines, and one normal-quota bot.
- **Standard competitive:** a readable 24-round Valve-style baseline with
  warmup, halftime, clinching, one overtime set, economy, normal ammo, and
  standard pistols/knives.
- **Blank:** no emitted settings. Enable only the values the CFG should own.

Applying a preset replaces the current enabled-setting set. Editing any value
changes the badge to **Custom**. Browser autosave is convenient state, not a
portable backup; download JSON before clearing browser data or moving devices.
