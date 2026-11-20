# Mermaid Color Scheme Reference

## Palette

Near-monotone: black links, white nodes, and groups drawn like
`architecture-beta` groups (no fill, light dashed border), so icons and
labels carry the color.

| Role | Value | Notes |
|---|---|---|
| Node fill | `#FFFFFF` | White background — works in both light/dark mode |
| Node stroke | `#666666` (1.5 px) | Mid-grey |
| Text | `#2C2C2C` | Near-black |
| Accent link (solid) | `#333333` (2 px) | Black — normal data/control flow |
| Non-destructive link (dashed) | `#2C2C2C` (1.5 px, `4 4`) | Black dashed — read-only / monitoring / side-effect-free paths |
| Group (subgraph) | fill `none` / stroke `#C7C7F1` (2 px, `8 8`) | Light lavender dashed border, as `architecture-beta` groups — every subgraph alike |
| Label background | `#FFFFFF` | Edge labels and icon-node labels: white instead of Mermaid's grey `#CCCCCC` |

## flowchart classDef / style / linkStyle

```
classDef node fill:#FFFFFF,stroke:#666666,stroke-width:1.5px,color:#2C2C2C
```

Subgraph styles (applied with `style <id> ...`, the same for every subgraph):

```
style Main fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
style Sub  fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
```

Link styles (indices are declaration-order, 0-based):

```
linkStyle 0,1,2 stroke:#333333,stroke-width:2px
linkStyle 3     stroke:#2C2C2C,stroke-width:1.5px,stroke-dasharray:4 4
```

- Solid = normal flow
- Dashed = read-only / monitoring / non-destructive

The meaning is in the line pattern, not the color, so it survives
grayscale printing and color-blind viewing.

### White label backgrounds (front matter)

Mermaid paints a grey box (`#CCCCCC`) behind edge labels and the labels
of icon nodes (`@{ icon: ... }`). Every flowchart sets it to white in its
front matter, so labels read as plain text (as in `architecture-beta`)
and a link passing behind an edge label breaks cleanly around it:

```
---
config:
  themeVariables:
    edgeLabelBackground: '#FFFFFF'
---
flowchart LR
```

Merge it into an existing `config:` (together with `elk.lineHops` below)
rather than adding a second front matter block. Render such diagrams with
`mermaid2png --background white`: on a transparent PNG the white label
boxes would show in dark mode.

### Dashed links need `elk.lineHops: false`

Mermaid 12 lays flowcharts out with ELK by default and draws a small arc
("line hop") where two links cross. Mermaid 12.3.0 then rewrites the
`stroke-dasharray` of a link that carries a hop, so a **dashed link turns
solid** — keeping its color and width, with no error
([mermaid-js/mermaid#8636](https://github.com/mermaid-js/mermaid/issues/8636)).
Whenever a flowchart has a dashed `linkStyle`, turn the hops off in its
front matter (merge into an existing `config:` rather than adding a second
front matter block):

```
---
config:
  elk:
    lineHops: false
---
flowchart LR
```

Only the arcs at crossings go away; the layout stays the same. Remove this
once a Mermaid release with the fix is in use.

## sequenceDiagram init directive

Paste as-is before `sequenceDiagram`:

```
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#FFFFFF', 'actorBorder': '#666666', 'actorTextColor': '#2C2C2C', 'signalColor': '#333333', 'signalTextColor': '#2C2C2C', 'noteBkgColor': '#FFFFFF', 'noteBorderColor': '#C7C7F1', 'noteTextColor': '#2C2C2C', 'activationBkgColor': '#F4F4F5', 'activationBorderColor': '#D4D4D8', 'loopTextColor': '#2C2C2C', 'labelBoxBkgColor': '#FFFFFF', 'labelBoxBorderColor': '#C7C7F1', 'labelTextColor': '#2C2C2C'}}}%%
```

## Palette mapping to sequenceDiagram themeVariables

| Palette role | themeVariable |
|---|---|
| Node fill `#FFFFFF` / stroke `#666666` / text `#2C2C2C` | `actorBkg` / `actorBorder` / `actorTextColor` |
| Accent `#333333` | `signalColor` |
| Text `#2C2C2C` | `signalTextColor` |
| Group `#FFFFFF` / `#C7C7F1` | `noteBkgColor` / `noteBorderColor` / `labelBoxBkgColor` / `labelBoxBorderColor` |
| Light grey `#F4F4F5` / `#D4D4D8` | `activationBkgColor` / `activationBorderColor` |
| Text `#2C2C2C` | `noteTextColor` / `loopTextColor` / `labelTextColor` |

## Icon guidelines (fa:fa-*)

- flowchart only — do not use in sequenceDiagram
- Prefix node label: `A["fa:fa-terminal Label"]`
- No emoji / Unicode pictographs — use `fa:` notation exclusively
- Choose names that read well as English fallback on GitHub (fa-terminal, fa-shield-halved, fa-user …).
  GitHub renders neither Font Awesome nor Iconify icons inside Mermaid
  (community discussions #11940 / #146647, unresolved as of 2026-07);
  `fa:fa-*` degrades to its literal label text there — unless the diagram
  is pre-rendered to PNG with this skill's `mermaid2png` command
- Never use the Mermaid v11 Iconify icon shape (`@{shape: icon, icon: "logos:aws"}`)
  or architecture-diagram icon packs — on GitHub they become a blue "?" box
  with no readable fallback
- A nonexistent icon name is NOT an error — it silently renders blank, and
  rendering verification cannot catch it. Verify unknown names against
  Font Awesome Free Solid (https://fontawesome.com/search?o=r&m=free&s=solid)

### Recommended icons

| Group | Icons | Typical use |
|---|---|---|
| Execution | `fa-terminal` `fa-play` `fa-gears` `fa-code` `fa-rotate` `fa-robot` | Command / run / engine / automation |
| Security | `fa-shield-halved` `fa-ban` `fa-lock` `fa-lock-open` `fa-key` `fa-hand` | Hook / deny / guard / auth / human gate |
| Status | `fa-circle-check` `fa-circle-question` `fa-circle-xmark` `fa-triangle-exclamation` | OK / unknown / fail / warning |
| People | `fa-user` `fa-users` `fa-user-shield` | Approver / team / admin |
| Data/File | `fa-database` `fa-file` `fa-file-lines` `fa-file-pen` `fa-folder` `fa-book` `fa-box` | Store / file / config / docs / artifact |
| Structure | `fa-link` `fa-sitemap` `fa-diagram-project` `fa-network-wired` `fa-server` `fa-cloud` | Link / hierarchy / infra |
| Inspection | `fa-magnifying-glass` `fa-eye` `fa-list-check` `fa-vial` `fa-bug` `fa-gauge` | Analysis / monitor / checklist / test / bug / metric |
| Operations | `fa-scissors` `fa-pen` `fa-wand-magic-sparkles` `fa-download` `fa-upload` | Split / edit / setup / fetch / distribute |
| Time | `fa-clock` `fa-bell` `fa-flag` | Schedule / notification / milestone |

### Blacklist (26 icons — blank in FA6 Free Solid)

`alarm-clock` `aquarius` `aries` `bus-side` `cancer` `capricorn`
`closed-captioning-slash` `gemini` `hexagon` `leo` `libra`
`mobile-vibrate` `non-binary` `octagon` `pentagon` `picture-in-picture`
`pisces` `sagittarius` `scorpio` `septagon` `single-quote-left`
`single-quote-right` `spiral` `taurus` `virgo` `volume`

## Templates (copy-paste)

### flowchart

```mermaid
---
config:
  themeVariables:
    edgeLabelBackground: '#FFFFFF'
  elk:
    lineHops: false
---
flowchart TB
    A["fa:fa-terminal ノード A"]
    subgraph Main["主役グループ"]
        B["fa:fa-gears ノード B"]
    end
    subgraph Sub["補助グループ"]
        C["fa:fa-user ノード C"]
    end
    DB[("fa:fa-database データストア")]

    A --> B
    B --> DB
    DB -.->|読み取り専用| C

    classDef node fill:#FFFFFF,stroke:#666666,stroke-width:1.5px,color:#2C2C2C
    class A,B,C,DB node
    style Main fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
    style Sub fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C

    %% normal flow = solid / non-destructive = dashed
    linkStyle 0,1 stroke:#333333,stroke-width:2px
    linkStyle 2 stroke:#2C2C2C,stroke-width:1.5px,stroke-dasharray:4 4
```

Apply `class` to the ACTUAL node IDs in the diagram — never leave IDs
copy-pasted from another diagram.

### sequenceDiagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#FFFFFF', 'actorBorder': '#666666', 'actorTextColor': '#2C2C2C', 'signalColor': '#333333', 'signalTextColor': '#2C2C2C', 'noteBkgColor': '#FFFFFF', 'noteBorderColor': '#C7C7F1', 'noteTextColor': '#2C2C2C', 'activationBkgColor': '#F4F4F5', 'activationBorderColor': '#D4D4D8', 'loopTextColor': '#2C2C2C', 'labelBoxBkgColor': '#FFFFFF', 'labelBoxBorderColor': '#C7C7F1', 'labelTextColor': '#2C2C2C'}}}%%
sequenceDiagram
    participant A as サービス A
    participant B as サービス B

    A->>B: リクエスト
    B-->>A: レスポンス
```

## Verification

Always render after writing/editing a diagram — this catches syntax errors
and out-of-range `linkStyle` indices (but NOT wrong icon names, see above):

```bash
# all blocks in a file, via the repo helper
python3 scratch/render_mermaid_check.py <file.md> <workdir>
# or render to PNG with this skill
node <skill-path>/src/cli/main.ts mermaid2png <file.md>
```

## Override policy

The palette above is the default, not a hard constraint. Override when:

- The user explicitly requests a different color
- Semantic color-coding is needed (e.g. host / core / store / external)

Even when overriding, keep:
- Dashed = non-destructive path (read-only / monitoring)
- Sufficient text-to-background contrast
- ≤ 4–5 colors total

Semantic color-coding example (intentional palette override):

```mermaid
flowchart LR
    H["host"]:::host
    C["共通コア"]:::core
    DB[("blackboard")]:::store

    H --> C --> DB

    classDef host fill:#EEF6FF,stroke:#4A90D9,color:#2C2C2C
    classDef core fill:#F7F7F2,stroke:#A0A08A,color:#2C2C2C
    classDef store fill:#F0FDF4,stroke:#16A34A,color:#2C2C2C
```
