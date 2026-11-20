# クイックスタート

**Claude Code** または **GitHub Copilot** で gospelo-mermaid-plus スキルを数分で使い始める手順です。

For the English version, see [QUICKSTART.md](QUICKSTART.md).

## 前提条件

対応プラットフォーム: **macOS / Linux / WSL2**

| 依存 | 必須 | 備考 |
|---|---|---|
| Node.js 22.18 以上 | はい | TypeScript の CLI をそのまま実行します。依存はインストーラーが `npm ci` で入れます |
| Python 3.9 以上 | インストーラーに | 標準ライブラリのみ。pip パッケージは不要 |
| chrome-headless-shell | PNG化する場合 | 一度だけ: `npx @puppeteer/browsers install chrome-headless-shell@156.0.8078.47 --path ~/.cache/puppeteer` — 無いときは `mermaid2png` がこのコマンドを表示します |

## インストール

インストーラーがスキルを `.claude/skills/` と `.agents/skills/` の両方に配置します。これで Claude Code・Copilot・Codex・OpenCode のすべてが発見できます。

**ZIP から**(`gospelo-mermaid-plus.zip` を受け取った場合):

```bash
unzip gospelo-mermaid-plus.zip
python gospelo-mermaid-plus/scripts/install.py --project /path/to/your/repo
```

**このリポジトリから:**

```bash
git clone https://github.com/gospelo-dev/mermaid-plus.git
python mermaid-plus/skills/claude/gospelo-mermaid-plus/scripts/install.py --project /path/to/your/repo
```

`--project` の代わりに `--user` を指定するとマシン上の全プロジェクトで使えるようになります。既存インストールを置き換えるには `--force` を付けてください。

## 動作確認

### Claude Code

プロジェクト内でセッションを開いて、次のように話しかけます:

```
docs/architecture.md の mermaid 図を PNG にして
```

Claude Code が `.claude/skills/` からスキルを発見し、ワークフローに従って処理します。セッション中にインストールした場合はセッションを再起動してください。

### GitHub Copilot

Copilot(CLI・VS Code agent mode・cloud agent)は `.claude/skills/` と `.agents/skills/` の両方を走査します。Copilot CLI で発見を確認するには:

```bash
cd /path/to/your/repo
copilot -p "List the names of the agent skills available in this session."
```

一覧に `gospelo-mermaid-plus` が表示されれば成功です。VS Code では agent mode で自然言語で依頼するか(「このファイルの mermaid 図にカラースキームを適用して」)、プロンプトファイルからスキルを明示参照します。

### OpenAI Codex

Codex は `.claude/skills/` ではなく `.agents/skills/` を走査します(インストーラーはこちらにも配置します)。Codex CLI で発見を確認するには:

```bash
cd /path/to/your/repo
codex exec "List the names of the agent skills available in this session."
```

一覧に `gospelo-mermaid-plus` が表示されれば成功です。

### OpenCode

OpenCode は Skills をネイティブ対応しており、インストーラーの配置先2箇所をどちらも走査します。追加の作業は不要です。

| スコープ | 走査されるパス |
|---|---|
| プロジェクト | `.opencode/{skill,skills}/**/SKILL.md`・`.claude/skills/**/SKILL.md`・`.agents/skills/**/SKILL.md` |
| グローバル | `~/.config/opencode/{skill,skills}/**/SKILL.md`・`~/.claude/skills/**/SKILL.md`・`~/.agents/skills/**/SKILL.md` |

プロジェクト側のパスはカレントディレクトリから git worktree のルートまで遡って走査されるため、サブディレクトリからでも発見されます。発見を確認するには:

```bash
cd /path/to/your/repo
opencode run -m <provider/model> "List the names of the agent skills available in this session."
```

一覧に `gospelo-mermaid-plus` が表示されれば成功です。注意: デフォルトモデルのAPIキーが未設定だと `opencode run` はエラーを出さずにハングすることがあります。`-m` でモデルを明示するか、`opencode auth login` で認証情報を保存しておくとシェルの環境変数に依存せず動作します。

**`duplicate skill name` の警告が出ますが正常です。** インストーラーはスキルを `.claude/skills/` と `.agents/skills/` の両方に配置し、OpenCode はその両方を走査するため、重複を警告して後に走査した方を採用します。中身は同一なので実害はありません。警告を出したくない場合はどちらか片方にだけインストールしてください。なお `.agents/skills/` は常に走査され、`.claude/skills/` は無効化できるため、1箇所に絞るなら `.agents/skills/` が確実です。

**インストーラーを使わない方法もあります。** `opencode.json` から clone を直接参照させれば、コピーが古くなる問題を避けられます:

```json
{
  "skills": {
    "paths": ["~/src/mermaid-plus/skills/claude"]
  }
}
```

このディレクトリは `**/SKILL.md` で走査されるため、`gospelo-mermaid-plus` と `gospelo-md2backlog` の両方が読み込まれます。相対パスはプロジェクトディレクトリ基準で解決され、`~/` は展開されます。

## 使い方

コマンドは2つで、通常この順に実行します:

```bash
CLI=.claude/skills/gospelo-mermaid-plus/src/cli/main.ts

# 1. カラースキーム適用: エージェントがテーマ適用に使うプロンプトを生成する
node $CLI apply-theme docs/architecture.md

# 2. PNG化して mermaid ソースを <details> に折り畳む(FAアイコンが表示されないGitHub向け)
node $CLI mermaid2png docs/architecture.md
```

エージェント経由で使う場合、これらを手動実行することはほとんどありません — エージェントが [SKILL.md](../skills/claude/gospelo-mermaid-plus/SKILL.md) を読んで両ステップを自動処理します。詳細とトラブルシューティングは [README](../README_ja.md) を参照してください。
