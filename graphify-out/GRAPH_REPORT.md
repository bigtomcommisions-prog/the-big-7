# Graph Report - claude code  (2026-09-30)

## Corpus Check
- 138 files · ~133,315 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .css 4, .example 1)

## Summary
- 1430 nodes · 3300 edges · 65 communities (51 shown, 14 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 150 edges (avg confidence: 0.81)
- Token cost: 653,177 input · 0 output

## Community Hubs (Navigation)
- OmniPrice App Views & API Client
- Voxel Buildings & Gazebos
- Homebase Widgets
- OmniPrice Data Catalogue
- Multiplayer Rooms & Crypto
- VoidTab Original & App Entry Pages
- World Generation
- Camera & Dev Sandbox
- Voxel Characters & Avatars
- REST API & Auth Tokens
- Homebase App Shell
- Voice Chat (LiveKit)
- Database & Repositories
- Hearthvale API Client
- Homebase DOM & Colour Utils
- Homebase Dependencies
- Monorepo Root Config
- In-house Chat Panel
- Homebase Settings Panel & State
- Discord Bot Gateway
- World Service & Permissions
- Character Editor & Presets
- Server Dependencies
- Client Dependencies
- Server Package Config
- Game Loop
- Hearthvale Client Boot
- Homebase Render Engine
- Discord Voice Bridge
- OmniPrice Dependencies
- Canvas Particle Themes
- Theme Registry & Types
- Server Config & WebSocket Hub
- Discord Message Service
- Avatar Name Tags
- Homebase Local Storage
- Big Tom Dev Portfolio
- Shared TypeScript Config
- HUD & Socket State
- Shared Package Config
- Site Page Builder
- Away NPCs
- Vercel Deployment Config
- Character Animation
- Sign Textures & Toasts
- Game WebSocket Client
- HUD Controls
- Homebase TS Config
- OmniPrice TS Config
- Client TS Config
- Shared TS Config
- Ambient Sound
- Server TS Config
- OmniPrice Preview Image
- OmniPrice Compare Screenshot
- Hearthvale Town Screenshot
- Vercel Build Script
- Vite Env Types
- Homebase Branding
- Big Tom Dev Logo
- Hearthvale Favicon
- OmniPrice Favicon
- DOM Helper Concept

## God Nodes (most connected - your core abstractions)
1. `VoiceManager` - 44 edges
2. `h()` - 43 edges
3. `Game` - 36 edges
4. `startSandbox()` - 31 edges
5. `icon()` - 28 edges
6. `VoxelBuilder` - 25 edges
7. `GuildRoom` - 25 edges
8. `h()` - 24 edges
9. `Input` - 23 edges
10. `h()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `saveData (dual localStorage/cookie write)` --semantically_similar_to--> `Homebase (private browser start page, Big 7 project 03)`  [INFERRED] [semantically similar]
  browser-home-page-original/index.html → hearthvale/README.md
- `Widget System (clock/note/countdown/weather)` --semantically_similar_to--> `Homebase (private browser start page, Big 7 project 03)`  [INFERRED] [semantically similar]
  browser-home-page-original/index.html → hearthvale/README.md
- `swatchShadow()` --calls--> `rgba()`  [EXTRACTED]
  hearthvale/apps/homebase/src/ui/panel.ts → hearthvale/apps/homebase/src/dom.ts
- `Homebase (private browser start page, Big 7 project 03)` --references--> `VoidTab New Tab Page`  [EXTRACTED]
  hearthvale/README.md → browser-home-page-original/index.html
- `Production Deployment: Vercel + self-hosted backend` --shares_data_with--> `Hearthvale Client Entry HTML`  [INFERRED]
  hearthvale/README.md → hearthvale/apps/client/index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **The Big 7 Project Collection (Hearthvale, OmniPrice, Homebase)** — hearthvale_readme_hearthvale, hearthvale_readme_omniprice, hearthvale_readme_homebase, hearthvale_site_pages_big7_page [INFERRED 0.85]
- **Legal Pages Trio (Privacy, Terms, Cookies) covering all three apps** — hearthvale_site_pages_privacy_page, hearthvale_site_pages_terms_page, hearthvale_site_pages_cookies_page [INFERRED 0.85]
- **Browser Personalization Widget Pattern (VoidTab to Homebase lineage)** — browser_home_page_original_index_widget_system, browser_home_page_original_index_savedata, hearthvale_readme_homebase [INFERRED 0.80]

## Communities (65 total, 14 thin omitted)

### Community 0 - "OmniPrice App Views & API Client"
Cohesion: 0.07
Nodes (62): api, Catalog, CurrencyInfo, Frequency, Instrument, Point, seriesCache, setDisplayCurrency() (+54 more)

### Community 1 - "Voxel Buildings & Gazebos"
Cohesion: 0.06
Nodes (35): buildGazebo(), buildHouse(), BuiltHouse, GREY, roofSteps(), windowAt(), buildArm(), buildHead() (+27 more)

### Community 2 - "Homebase Widgets"
Cohesion: 0.06
Nodes (44): IconName, General, Size, clock, ENGINES, greeting, links, notes (+36 more)

### Community 3 - "OmniPrice Data Catalogue"
Cohesion: 0.07
Nodes (42): awe(), byId, CATEGORIES, CURRENCIES, CURRENCY_PAIRS, INSTRUMENTS, ons(), RATE_DECIMALS (+34 more)

### Community 4 - "Multiplayer Rooms & Crypto"
Cohesion: 0.08
Nodes (13): createTokenCipher(), Connection, GuildRoom, send(), conn(), fakeWs(), tick(), KeyedLimiter (+5 more)

### Community 5 - "VoidTab Original & App Entry Pages"
Cohesion: 0.07
Nodes (41): Black Hole Canvas Animation, loadData (dual localStorage/cookie read), Password Login & Edit Mode System, saveData (dual localStorage/cookie write), VoidTab New Tab Page, Widget System (clock/note/countdown/weather), Hearthvale Client Entry HTML, Homebase Client Entry HTML (+33 more)

### Community 6 - "World Generation"
Cohesion: 0.09
Nodes (36): sampleSpec(), npcAppearance(), distToSegment(), facing(), gateHalfAngle(), generateWorld(), PALETTES, PlacedTown (+28 more)

### Community 7 - "Camera & Dev Sandbox"
Cohesion: 0.08
Nodes (7): startSandbox(), ThirdPersonCamera, Engine, Input, LocalPlayer, isTyping(), three

### Community 8 - "Voxel Characters & Avatars"
Cohesion: 0.08
Nodes (19): BODY, FULL_HATS, Proportions, Sample, Accessory, AppearanceSchema, CHARACTER_PRESETS, SKIN_TONES (+11 more)

### Community 9 - "REST API & Auth Tokens"
Cohesion: 0.09
Nodes (30): ChannelParams, Deps, GuildParams, Snowflake, randomToken(), safeEqual(), sha256(), TokenCipher (+22 more)

### Community 10 - "Homebase App Shell"
Cohesion: 0.11
Nodes (35): h(), icon(), app, applyLook(), bg, bgHost, buildSiteBar(), commit() (+27 more)

### Community 12 - "Database & Repositories"
Cohesion: 0.07
Nodes (23): Db, MIGRATIONS, openDatabase(), createRepos(), app, bot, bridges, cipher (+15 more)

### Community 13 - "Hearthvale API Client"
Cohesion: 0.12
Nodes (19): api, ApiError, GuildList, Me, request(), GameOptions, keyLabel(), LEGAL (+11 more)

### Community 14 - "Homebase DOM & Colour Utils"
Cohesion: 0.12
Nodes (24): Attrs, Child, contrast(), hexToRgb(), ICONS, luminance(), AURORA, auroraUniforms() (+16 more)

### Community 15 - "Homebase Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @fontsource/nunito, @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, @fontsource-variable/orbitron, @fontsource-variable/playfair-display, @fontsource-variable/space-grotesk, lucide (+20 more)

### Community 16 - "Monorepo Root Config"
Cohesion: 0.07
Nodes (28): allowScripts, esbuild@0.25.12, description, devDependencies, concurrently, typescript, engines, node (+20 more)

### Community 17 - "In-house Chat Panel"
Cohesion: 0.17
Nodes (8): ChatPanel, PanelChannel, escapeHtml(), formatDiscord(), timeLabel(), wireSpoilers(), icon(), ChatMessage

### Community 18 - "Homebase Settings Panel & State"
Cohesion: 0.13
Nodes (5): exportJson(), State, AppApi, Panel, preview()

### Community 19 - "Discord Bot Gateway"
Cohesion: 0.12
Nodes (9): BotEvents, DiscordBot, sanitizeWebhookName(), SendableChannel, NotMemberError, PermissionService, perms, discord.js (+1 more)

### Community 20 - "World Service & Permissions"
Cohesion: 0.12
Nodes (12): ChannelRow, TownRow, GuildWorld, kindOf(), lowestFreeSlot(), UNCATEGORIZED, WorldEvents, WorldService (+4 more)

### Community 21 - "Character Editor & Presets"
Cohesion: 0.10
Nodes (16): ACCESSORY_DEFAULT_COLORS, ACCESSORY_LABELS, COLOR_SWATCHES, HAIR_SWATCHES, ACCESSORIES, ACCESSORY_GROUPS, AppearanceShape, BODY_TYPES (+8 more)

### Community 22 - "Server Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, discord.js, @discordjs/voice, fastify, @fastify/cookie, @fastify/cors, @fastify/rate-limit, @fastify/static (+18 more)

### Community 23 - "Client Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, @fontsource/nunito, @hearthvale/shared, livekit-client, lucide, three, devDependencies, @types/three (+16 more)

### Community 24 - "Server Package Config"
Cohesion: 0.09
Nodes (21): @hearthvale/shared, @types/node, zod, name, private, type, version, BRIDGE_IDENTITY (+13 more)

### Community 25 - "Game Loop"
Cohesion: 0.17
Nodes (6): Game, Zone, zoneKey(), isInsideHouse(), toLocal(), zoneAt()

### Community 26 - "Hearthvale Client Boot"
Cohesion: 0.28
Nodes (17): boot(), enter(), logout(), persistPrefs(), pickGuild(), show(), guildIcon(), h() (+9 more)

### Community 27 - "Homebase Render Engine"
Cohesion: 0.17
Nodes (7): Background, Motion, Quality, reduceQuery, Scene, SceneInput, ThemeDef

### Community 28 - "Discord Voice Bridge"
Cohesion: 0.17
Nodes (4): Bridge, bridgeRoomName(), PcmQueue, VoiceBridgeManager

### Community 29 - "OmniPrice Dependencies"
Cohesion: 0.10
Nodes (20): dependencies, @fontsource/nunito, lucide, uplot, devDependencies, @types/node, vite, @fontsource/nunito (+12 more)

### Community 30 - "Canvas Particle Themes"
Cohesion: 0.17
Nodes (13): rgba(), bokeh(), canvas2d(), CHARSETS, fireflies(), glowSprite(), Impl, ocean() (+5 more)

### Community 31 - "Theme Registry & Types"
Cohesion: 0.21
Nodes (15): ThemeSettings, THEMES, FontId, FONTS, Palette, ParamSpec, ParamValue, fid() (+7 more)

### Community 32 - "Server Config & WebSocket Hub"
Cohesion: 0.16
Nodes (11): Config, EnvSchema, parsed, Deps, SpeakState, createVoiceTokenIssuer(), VoiceTokenIssuer, worldRoomName() (+3 more)

### Community 33 - "Discord Message Service"
Cohesion: 0.21
Nodes (4): registerApiRoutes(), avatarUrl(), ChatError, MessageService

### Community 34 - "Avatar Name Tags"
Cohesion: 0.17
Nodes (3): Avatar, RemotePlayer, PlayerInfo

### Community 35 - "Homebase Local Storage"
Cohesion: 0.21
Nodes (15): uid(), Appearance, clearImages(), clearSaved(), db(), DEFAULT_APPEARANCE, DEFAULT_GENERAL, defaultState() (+7 more)

### Community 36 - "Big Tom Dev Portfolio"
Cohesion: 0.22
Nodes (15): Hearthvale (project, nav link), Homebase (customizable browser new-tab/dashboard page), OmniPrice (project, nav link), Big Tom Dev (personal site/brand), The Big 7 (Big Tom Dev project collection), The Big 7 (project, nav link), Hearthvale Open Graph preview image, Homebase App (personal new-tab dashboard) (+7 more)

### Community 37 - "Shared TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, noEmit, noImplicitOverride (+6 more)

### Community 38 - "HUD & Socket State"
Cohesion: 0.16
Nodes (5): API_ORIGIN, ConnState, FATAL, Handler, Hud

### Community 39 - "Shared Package Config"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 40 - "Site Page Builder"
Cohesion: 0.18
Nodes (11): esc(), fonts, icon(), layout(), logo, out, PAGES, render() (+3 more)

### Community 42 - "Vercel Deployment Config"
Cohesion: 0.17
Nodes (11): maxDuration, buildCommand, framework, functions, api/omniprice.js, headers, installCommand, outputDirectory (+3 more)

### Community 43 - "Character Animation"
Cohesion: 0.33
Nodes (5): VoxelCharacter, openCharacterEditor(), renderControls(), toggleAccessory(), Appearance

### Community 44 - "Sign Textures & Toasts"
Cohesion: 0.27
Nodes (7): textTexture(), Attrs, Child, Toasts, drawIcon(), IconName, ICONS

### Community 47 - "Homebase TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, allowImportingTsExtensions, allowJs, checkJs, lib, types, extends, include (+1 more)

### Community 48 - "OmniPrice TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, allowImportingTsExtensions, allowJs, checkJs, lib, types, extends, include (+1 more)

### Community 49 - "Client TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, allowImportingTsExtensions, lib, types, extends, include, ../../tsconfig.base.json

### Community 50 - "Shared TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, allowImportingTsExtensions, types, exclude, extends, include, ../../tsconfig.base.json

### Community 52 - "Server TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, types, extends, include, ../../tsconfig.base.json

### Community 53 - "OmniPrice Preview Image"
Cohesion: 0.50
Nodes (5): Dark-mode UI design with pink-to-purple gradient accent, Compare / price comparison feature (tap + to compare items), Price tracking dashboard (food, wages, energy, commodities, currencies, crypto, inflation), OmniPrice app, OmniPrice Open Graph preview image

### Community 54 - "OmniPrice Compare Screenshot"
Cohesion: 0.50
Nodes (5): Dark-themed dashboard UI design pattern, OmniPrice Compare screenshot, Indexed-to-100 normalization for comparing disparate series, Compare feature: indexed multi-series price/wage/commodity chart, OmniPrice (price comparison app)

### Community 55 - "Hearthvale Town Screenshot"
Cohesion: 0.60
Nodes (5): Chat channels (#welcome, #general, #introductions) represented as distinct labeled buildings, Central plaza with campfire, benches, and lampposts as social gathering hub, Player avatar labeled "You" standing in the plaza, Blocky/voxel-style 3D town square environment, Hearthvale voxel town square screenshot

## Knowledge Gaps
- **347 isolated node(s):** `RATE_DECIMALS`, `CURRENCY_PAIRS`, `US_HOURLY_PAY_ID`, `TTL_MS`, `cache` (+342 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 482 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `Camera & Dev Sandbox` to `Voxel Buildings & Gazebos`, `Voxel Characters & Avatars`, `Sign Textures & Toasts`, `Hearthvale API Client`, `Character Editor & Presets`, `Client Dependencies`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `Game` connect `Game Loop` to `Voxel Buildings & Gazebos`, `Avatar Name Tags`, `HUD & Socket State`, `Camera & Dev Sandbox`, `Voxel Characters & Avatars`, `Away NPCs`, `Character Animation`, `Hearthvale API Client`, `Game WebSocket Client`, `World Service & Permissions`, `Server Package Config`, `Hearthvale Client Boot`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `startSandbox()` (e.g. with `.say()` and `.updateVisibility()`) actually correct?**
  _`startSandbox()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RATE_DECIMALS`, `CURRENCY_PAIRS`, `US_HOURLY_PAY_ID` to the rest of the system?**
  _347 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `OmniPrice App Views & API Client` be split into smaller, more focused modules?**
  _Cohesion score 0.06996935648621042 - nodes in this community are weakly interconnected._
- **Should `Voxel Buildings & Gazebos` be split into smaller, more focused modules?**
  _Cohesion score 0.061175666438824335 - nodes in this community are weakly interconnected._
- **Should `Homebase Widgets` be split into smaller, more focused modules?**
  _Cohesion score 0.05505952380952381 - nodes in this community are weakly interconnected._