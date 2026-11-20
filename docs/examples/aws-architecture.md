# Sample: AWS architecture diagrams

日本語版: [aws-architecture_ja.md](aws-architecture_ja.md)

gospelo-mermaid-plus draws AWS architecture diagrams with the official AWS Architecture Icons, using Mermaid 12 (ELK layout) through [`@gospelo/mermaid-arch`](https://github.com/gospelo-dev/mermaid-arch). GitHub's own Mermaid renderer has no AWS icons, so each diagram below is committed as a PNG, with its Mermaid source folded in `<details>` and shown again as code underneath.

## Get the AWS icon package

Download the Architecture Icons asset package (`Icon-package_*.zip`) from https://aws.amazon.com/architecture/icons/. The icons are AWS artwork: **do not commit or publish the zip** — publish the rendered diagrams, which is how AWS permits the icons to be used. Keep the zip outside the repository (or gitignore it).

List the icon names you can use (`Arch_Amazon-API-Gateway_48.svg` becomes `api-gateway`):

```bash
cd <skill-path> && npx mermaid-arch build-iconpack /path/to/Icon-package_*.zip --list
```

## Write, theme and render

```bash
CLI=<skill-path>/src/cli/main.ts
ZIP=/path/to/Icon-package_*.zip

# 1. Theme: the prompt adds the icon-node rules and each icon's AWS category color
node $CLI apply-theme docs/architecture.md --icons-zip $ZIP > /tmp/theme-prompt.md

# 2. Render to PNG; the icon zip is needed whenever a block uses aws: icons
node $CLI mermaid2png docs/architecture.md --icons-zip $ZIP --background white
```

`--background white` keeps the labels readable in GitHub's dark mode (the default PNG background is transparent).

Icons are written in two forms:

| Diagram | Form |
|---|---|
| `flowchart` | `id@{ icon: "aws:lambda", form: "square", label: "Worker", pos: "b" }` |
| `architecture-beta` | `service id(aws:lambda)[Worker]`, `group id(aws:virtual-private-cloud)[VPC]` |

A misspelled icon name stops the render with an `unknown-icon` error that suggests close matches.

## Flowchart with AWS icons

A web app behind CloudFront, with background jobs. Styled with the default color scheme: black links (solid for requests, dashed for protection and logging), groups drawn like `architecture-beta` groups (no fill, light dashed border), and the AWS icon artwork left as is. The dashed links come with `elk.lineHops: false` ([why](../skills/claude/gospelo-mermaid-plus/references/color-scheme.md#dashed-links-need-elklinehops-false)).

![diagram](images/aws-architecture-1.png)

<details><summary>Mermaid source</summary>

```mermaid
---
config:
  themeVariables:
    edgeLabelBackground: '#FFFFFF'
  elk:
    lineHops: false
---
flowchart LR
    user(["fa:fa-user User"])

    subgraph edge[Edge]
        dns@{ icon: "aws:route-53", form: "square", label: "Route 53", pos: "b" }
        cdn@{ icon: "aws:cloudfront", form: "square", label: "CloudFront", pos: "b" }
        waf@{ icon: "aws:waf", form: "square", label: "WAF", pos: "b" }
    end

    subgraph vpc[VPC]
        alb@{ icon: "aws:elastic-load-balancing", form: "square", label: "Load balancer", pos: "b" }
        app@{ icon: "aws:fargate", form: "square", label: "Web app (ECS on Fargate)", pos: "b" }
        db@{ icon: "aws:aurora", form: "square", label: "Aurora", pos: "b" }
    end

    assets@{ icon: "aws:simple-storage-service", form: "square", label: "Static assets", pos: "b" }

    subgraph jobs[Background jobs]
        queue@{ icon: "aws:simple-queue-service", form: "square", label: "Job queue", pos: "b" }
        worker@{ icon: "aws:lambda", form: "square", label: "Worker", pos: "b" }
    end

    logs@{ icon: "aws:cloudwatch", form: "square", label: "CloudWatch", pos: "b" }

    user --> dns
    dns --> cdn
    waf -.- cdn
    cdn -->|/static/*| assets
    cdn -->|/*| alb
    alb --> app
    app --> db
    app -->|enqueue| queue
    queue --> worker
    worker --> db
    app -.-> logs
    worker -.-> logs

    classDef node fill:#FFFFFF,stroke:#666666,stroke-width:1.5px,color:#2C2C2C
    class user node
    style edge fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
    style vpc fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
    style jobs fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C

    %% solid = requests and jobs; dashed = protection and logging
    linkStyle 0,1,3,4,5,6,7,8,9 stroke:#333333,stroke-width:2px
    linkStyle 2,10,11 stroke:#2C2C2C,stroke-width:1.5px,stroke-dasharray:4 4
```

</details>

Mermaid code:

````markdown
```mermaid
---
config:
  themeVariables:
    edgeLabelBackground: '#FFFFFF'
  elk:
    lineHops: false
---
flowchart LR
    user(["fa:fa-user User"])

    subgraph edge[Edge]
        dns@{ icon: "aws:route-53", form: "square", label: "Route 53", pos: "b" }
        cdn@{ icon: "aws:cloudfront", form: "square", label: "CloudFront", pos: "b" }
        waf@{ icon: "aws:waf", form: "square", label: "WAF", pos: "b" }
    end

    subgraph vpc[VPC]
        alb@{ icon: "aws:elastic-load-balancing", form: "square", label: "Load balancer", pos: "b" }
        app@{ icon: "aws:fargate", form: "square", label: "Web app (ECS on Fargate)", pos: "b" }
        db@{ icon: "aws:aurora", form: "square", label: "Aurora", pos: "b" }
    end

    assets@{ icon: "aws:simple-storage-service", form: "square", label: "Static assets", pos: "b" }

    subgraph jobs[Background jobs]
        queue@{ icon: "aws:simple-queue-service", form: "square", label: "Job queue", pos: "b" }
        worker@{ icon: "aws:lambda", form: "square", label: "Worker", pos: "b" }
    end

    logs@{ icon: "aws:cloudwatch", form: "square", label: "CloudWatch", pos: "b" }

    user --> dns
    dns --> cdn
    waf -.- cdn
    cdn -->|/static/*| assets
    cdn -->|/*| alb
    alb --> app
    app --> db
    app -->|enqueue| queue
    queue --> worker
    worker --> db
    app -.-> logs
    worker -.-> logs

    classDef node fill:#FFFFFF,stroke:#666666,stroke-width:1.5px,color:#2C2C2C
    class user node
    style edge fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
    style vpc fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C
    style jobs fill:none,stroke:#C7C7F1,stroke-width:2px,stroke-dasharray:8 8,color:#2C2C2C

    %% solid = requests and jobs; dashed = protection and logging
    linkStyle 0,1,3,4,5,6,7,8,9 stroke:#333333,stroke-width:2px
    linkStyle 2,10,11 stroke:#2C2C2C,stroke-width:1.5px,stroke-dasharray:4 4
```
````

## architecture-beta

The same core in Mermaid's architecture diagram. Groups and services take `aws:` icons only (the built-in `(cloud)`, `(server)`, … icons are not available). `apply-theme` returns `architecture-beta` blocks unchanged.

![diagram](images/aws-architecture-2.png)

<details><summary>Mermaid source</summary>

```mermaid
architecture-beta
    group vpc(aws:virtual-private-cloud)[VPC]

    service cdn(aws:cloudfront)[CloudFront]
    service assets(aws:simple-storage-service)[Static assets]
    service alb(aws:elastic-load-balancing)[Load balancer] in vpc
    service app(aws:fargate)[Web app] in vpc
    service db(aws:aurora)[Aurora] in vpc

    cdn:R --> L:alb
    alb:R --> L:app
    app:R --> L:db
    cdn:L --> R:assets
```

</details>

Mermaid code:

````markdown
```mermaid
architecture-beta
    group vpc(aws:virtual-private-cloud)[VPC]

    service cdn(aws:cloudfront)[CloudFront]
    service assets(aws:simple-storage-service)[Static assets]
    service alb(aws:elastic-load-balancing)[Load balancer] in vpc
    service app(aws:fargate)[Web app] in vpc
    service db(aws:aurora)[Aurora] in vpc

    cdn:R --> L:alb
    alb:R --> L:app
    app:R --> L:db
    cdn:L --> R:assets
```
````
