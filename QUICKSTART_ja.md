# クイックスタート

**Claude Code** または **GitHub Copilot** で gospelo-mermaid-plus スキルを数分で使い始める手順です。

For the English version, see [QUICKSTART.md](QUICKSTART.md).

## 前提条件

| 依存 | 必須 | 備考 |
|---|---|---|
| Python 3.9 以上 | はい | 標準ライブラリのみ。pip パッケージは不要 |
| Node.js 18 以上 | PNG化する場合 | |
| Mermaid CLI (`mmdc`) | 推奨 | `npm install -g @mermaid-js/mermaid-cli` — 未導入でも `npx` フォールバックで動作します(初回は遅い) |

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

## 使い方

スクリプトは2つで、通常この順に実行します:

```bash
SKILL=.claude/skills/gospelo-mermaid-plus

# 1. カラースキーム適用: エージェントがテーマ適用に使うプロンプトを生成する
python $SKILL/scripts/apply_theme.py docs/architecture.md

# 2. PNG化して mermaid ソースを <details> に折り畳む(FAアイコンが表示されないGitHub向け)
python $SKILL/scripts/mermaid2png.py docs/architecture.md
```

エージェント経由で使う場合、これらを手動実行することはほとんどありません — エージェントが [SKILL.md](skills/claude/gospelo-mermaid-plus/SKILL.md) を読んで両ステップを自動処理します。詳細とトラブルシューティングは [README](README.md) を参照してください。
