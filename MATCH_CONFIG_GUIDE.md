# Counterform Match Config guide

Counterform contains two independent browser tools:

- **Map Sketcher** saves and exports arena-sketch JSON.
- **Match Config** opens, edits, and exports a CS2 `.cfg` directly.

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
7. Choose **Download CFG**. That file is both the CS2 input and the portable
   document to reopen in Counterform later.

Run the resulting file after the active game-mode CFG so these values are the
final overrides. For a host console, that normally means placing the file in an
appropriate CS2 `cfg` folder and executing `exec your_config_name` at the right
point in the host workflow.

## Reopening a CFG

Choose **Open CFG** and select any text CFG. Counterform recognizes only the
40 cvars in its curated registry and populates those controls. It does not run
the file, follow `exec` statements, expand aliases, or interpret plugins.

Every unsupported command, one-shot/admin command, plugin line, and ordinary
comment is shown under **Preserved unmanaged lines**. Downloading the CFG writes
those lines back verbatim after Counterform's managed block. A supported cvar
with an invalid value is also preserved as unmanaged and produces a warning.
Nothing unknown is silently discarded.

Counterform includes a metadata comment containing the config name so a
downloaded file reopens with the same name. Preset badges are reconstructed as
Custom; no separate Match Config JSON is required. Browser autosave remains a
convenience between visits, not the portable source of truth.

Map Sketcher JSON remains completely independent. Map geometry is never stored
in or inferred from a match CFG.

## What the preview means

The duration is the **configured regulation maximum**:

`warmup + rounds × (freeze + active round + transition)`

It is not a prediction. Eliminations can end rounds early, clinching can end a
match before every configured round, and overtime can extend a tied match. The
preview therefore shows overtime separately instead of pretending it has a
known duration.

The proportional one-round track shows freeze, live play, and transition time.
Aligned secondary tracks show buying and the win panel without pretending they
are separate additions to round length. A distinct halftime band shows the
team swap. The legend uses the same semantic colors in light and dark themes.

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
Where the reference installation's stock competitive CFG provides a reliable
value, Counterform labels it as a **reference competitive CFG** value. This is
not an engine-wide promise: game modes and later executed CFGs can override it.

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

Applying a preset replaces the current managed setting set while retaining any
preserved unmanaged lines. Editing any value changes the badge to **Custom**.
Browser autosave is convenient state, not a portable backup; download the CFG
before clearing browser data or moving devices.
