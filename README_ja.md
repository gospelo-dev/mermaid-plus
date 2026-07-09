# gospelo-mermaid-plus

[![License: MIT](https://img.shields.io/badge/License-MIT-1E90FF.svg?style=flat)](https://github.com/gospelo-dev/mermaid-plus/blob/main/LICENSE) [![Python](https://img.shields.io/badge/Python-3.9+-1E90FF.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/) [![Mermaid](https://img.shields.io/badge/Mermaid-CLI-FF3670.svg?style=flat&logo=mermaid&logoColor=white)](https://github.com/mermaid-js/mermaid-cli) [![Agent Skill](https://img.shields.io/badge/Claude_Code-Agent_Skill-7B3FF2.svg?style=flat)](https://docs.claude.com/en/docs/claude-code/skills)

Markdown 内の Mermaid 図を、**一貫したテーマ適用済み・GitHub 表示対応の PNG** に変換します。

English version: [README.md](https://github.com/gospelo-dev/mermaid-plus/blob/main/README.md)

GitHub は Markdown レンダリング時に外部フォント・`<style>` タグ・`data:` URI を除去するため、Font Awesome アイコンやカスタムスタイルを使った Mermaid 図は github.com 上で崩れて表示されます。このスキルは次の2段階のワークフローでこの問題を解決します:

1. **リポジトリのカラースキームを適用**(LLM 支援)— すべての Mermaid ブロックに統一テーマを当てる
2. **各ブロックを PNG にレンダリング**し、元の Mermaid ソースを折り畳み可能な `<details>` ブロックに格納する

結果として、`fa:fa-*` アイコンが正しく表示される高精細な図と、そのすぐ隣に編集可能な Mermaid ソースが残ります。

はじめての方は [クイックスタート](https://github.com/gospelo-dev/mermaid-plus/blob/main/docs/QUICKSTART_ja.md)([English](https://github.com/gospelo-dev/mermaid-plus/blob/main/docs/QUICKSTART.md))を参照してください。Claude Code / GitHub Copilot でのインストールと初回実行の手順があります。

## ツール

### `apply_theme.py` — LLM 支援によるテーマ適用

Markdown ファイルからすべての ```` ```mermaid ```` ブロックを抽出し、自己完結したプロンプトを標準出力に出力します。このプロンプトを LLM(Claude など)に渡すと、[references/color-scheme.md](https://github.com/gospelo-dev/mermaid-plus/blob/main/skills/claude/gospelo-mermaid-plus/references/color-scheme.md) のパレットに沿った `classDef`・`linkStyle`・subgraph `style`・`%%{init}` ディレクティブを適用済みの Mermaid コードが返ってきます。

正規表現ではなく LLM を使う理由: 正しい Mermaid スタイリングには図の構造理解が必要です — どのリンクが破線でどれが実線か、どの subgraph が主役か、宣言順 0 始まりの `linkStyle` 番号など。LLM は意味を踏まえてテーマを適用できますが、正規表現ツールはここを間違えます。

```bash
python skills/claude/gospelo-mermaid-plus/scripts/apply_theme.py doc.md > /tmp/theme-prompt.md
# プロンプトを LLM に渡し、各 mermaid ブロックをテーマ適用済みコードに置き換える
```

| フラグ | デフォルト | 説明 |
|---|---|---|
| `--scheme PATH` | `references/color-scheme.md` | カラースキームのリファレンスファイルのパス |

このスクリプト自体はファイルを変更しません — 適用されるのは LLM の応答です。

### `mermaid2png.py` — PNG 化と `<details>` 折り畳み

すべての ```` ```mermaid ```` ブロックを見つけ、Mermaid CLI(`mmdc`)で PNG にレンダリングし、Markdown ファイルと同じ場所の `images/` ディレクトリに保存した上で、各ブロックを次の形に書き換えます:

````markdown
![diagram](images/doc-1.png)

<details><summary>Mermaid source</summary>

```mermaid
graph LR
  A --> B
```

</details>
````

```bash
python skills/claude/gospelo-mermaid-plus/scripts/mermaid2png.py doc.md
```

| フラグ | デフォルト | 説明 |
|---|---|---|
| `--scale N` | `2` | レンダリング倍率(2 = Retina) |
| `--puppeteer-config PATH` | 自動 | `mmdc` 用 Puppeteer JSON 設定(Chromium は自動検出) |
| `--dry-run` | オフ | PNG をレンダリングせずに Markdown のみ書き換え |

このスクリプトは**冪等**です — 変換済みのブロックはスキップされるため、同じファイルに2回実行しても安全です。レンダリングに失敗したブロックは元のまま残ります。

## 前提条件

| 依存 | インストール |
|---|---|
| Node.js 18 以上 | 多くの環境でインストール済み |
| Mermaid CLI (`mmdc`) | `npm install -g @mermaid-js/mermaid-cli` |
| Chromium | 自動検出(Playwright 同梱またはシステム)。`--puppeteer-config` で上書き可 |
| Python 3.9 以上 | 多くの環境でインストール済み(標準ライブラリのみ、pip パッケージ不要) |

## 使用例

```bash
SKILL=skills/claude/gospelo-mermaid-plus

# 1. テーマ適用プロンプトを生成し、LLM 経由でカラースキームを適用する
python $SKILL/scripts/apply_theme.py docs/architecture.md > /tmp/theme-prompt.md

# 2. テーマ適用済みブロックを PNG 化し、ソースを <details> に折り畳む
python $SKILL/scripts/mermaid2png.py docs/architecture.md

# 3. 書き換えられた Markdown と生成画像をコミットする
git add docs/architecture.md docs/images/
```

## Agent Skill としてのインストール

このリポジトリは `skills/claude/gospelo-mermaid-plus/` に [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills) を同梱しています。オープンな [Agent Skills 標準](https://github.com/agentskills/agentskills)の可搬なコア部分のみを使用しているため、**Claude Code・GitHub Copilot・OpenAI Codex・OpenCode** で動作します。

`scripts/install.py` が、各エージェントの走査対象である `.claude/skills/` と `.agents/skills/` にスキルをコピー(またはシンボリックリンク)します:

```bash
git clone https://github.com/gospelo-dev/mermaid-plus.git
INSTALL=mermaid-plus/skills/claude/gospelo-mermaid-plus/scripts/install.py

# プロジェクトに導入
python $INSTALL --project /path/to/repo

# ユーザー全体に導入(このマシンの全プロジェクト)
python $INSTALL --user

# 開発向け: コピーではなくこの clone へのシンボリックリンクを張る
python $INSTALL --user --symlink

# 既存インストールを置き換え
python $INSTALL --project /path/to/repo --force
```

エージェントは [SKILL.md](https://github.com/gospelo-dev/mermaid-plus/blob/main/skills/claude/gospelo-mermaid-plus/SKILL.md) からスキルを発見し、「mermaid を PNG にして」「カラースキームを適用して」「GitHub で FA アイコンを表示したい」のような依頼で発火します。ワークフローの全体像・FA6 アイコンのブラックリスト・トラブルシューティングは SKILL.md を参照してください。

### ZIP での配布

リポジトリへのアクセス権がない相手に渡す場合:

```bash
cd mermaid-plus/skills/claude
zip -r gospelo-mermaid-plus.zip gospelo-mermaid-plus -x "*__pycache__*" -x "*.DS_Store"
```

受け取った側は任意の場所で unzip してインストーラーを実行します:

```bash
unzip gospelo-mermaid-plus.zip
python gospelo-mermaid-plus/scripts/install.py --project /path/to/repo   # または --user
```

## リポジトリ構成

```
mermaid-plus/
└── skills/
    └── claude/
        └── gospelo-mermaid-plus/
            ├── SKILL.md            # Agent Skill 定義とドキュメント本体
            ├── scripts/
            │   ├── apply_theme.py  # テーマ適用プロンプト生成
            │   ├── mermaid2png.py  # Mermaid → PNG レンダラー
            │   └── install.py      # スキル発見パスへのインストーラー
            └── references/
                └── color-scheme.md # パレット全体・推奨アイコン・上書きポリシー
```

## ライセンス

[MIT](https://github.com/gospelo-dev/mermaid-plus/blob/main/LICENSE)
