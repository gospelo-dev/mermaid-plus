#!/usr/bin/env bash
# このリポジトリのテスト。手元の pr-gate.sh と GitHub Actions（ci.yml）の両方が実行する。
# リポジトリのルートで実行される前提（作業ツリーのルートに移動してから動く）。
# 中身はリポジトリに合わせて書き換えてよい。既定ではファイル構成からテストを自動で選ぶ:
#   *.sh → shellcheck / package.json（各スキルのディレクトリ）→ npm の lint・test・build /
#   *.py → 構文チェック / pyproject.toml → pytest
# 依存は lock ファイルどおりにだけ入れる（その時点の最新版を入れない。サプライチェーン攻撃への備え）。
# lock ファイルが無ければ止まる。
# 環境変数 PR_GATE_BASE（pr-gate.sh が渡す PR の向き先）を使えば、差分に応じたテストにもできる。
if [ -z "${BASH_VERSINFO:-}" ] || (( BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 4) )); then
  echo "bash 4.4 以上が必要です（現在: ${BASH_VERSION:-不明}）。macOS では brew install bash" >&2
  exit 1
fi
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ran=false

mapfile -t sh_files < <(git ls-files '*.sh')
if (( ${#sh_files[@]} > 0 )); then
  command -v shellcheck >/dev/null || { echo "shellcheck が必要です。" >&2; exit 1; }
  echo "== shellcheck (${#sh_files[@]} files)"
  shellcheck "${sh_files[@]}"
  ran=true
fi

# mermaid-plus: package.json はルートではなく各スキルのディレクトリ（skills/claude/<name>/）にある。
# git が追跡している package.json ごとに、そのディレクトリで npm ci と npm test を実行する。
mapfile -t pkg_files < <(git ls-files 'package.json' '*/package.json')
for pkg in "${pkg_files[@]}"; do
  dir=$(dirname "$pkg")
  echo "== npm ($dir)"
  [[ -f "$dir/package-lock.json" ]] ||
    { echo "$dir/package-lock.json がありません。npm install で作ってコミットしてください（lock なしでは版を固定できない）。" >&2; exit 1; }
  # package-lock.json どおりに入れる（合わなければ失敗する）。npm install は使わない
  (cd "$dir" && npm ci && npm run --if-present lint && npm test --if-present && npm run --if-present build)
  ran=true
done

# Python のスクリプト（pytest のテストは無い）は構文だけ確かめる
mapfile -t py_files < <(git ls-files '*.py')
if (( ${#py_files[@]} > 0 )); then
  echo "== python (syntax, ${#py_files[@]} files)"
  PYTHONDONTWRITEBYTECODE=1 python3 -c 'import ast, sys
for p in sys.argv[1:]:
    ast.parse(open(p, encoding="utf-8").read(), p)' "${py_files[@]}"
  ran=true
fi

if [[ -f pyproject.toml ]]; then
  echo "== python"
  command -v uv >/dev/null || { echo "uv が必要です（https://docs.astral.sh/uv/）。" >&2; exit 1; }
  [[ -f uv.lock ]] ||
    { echo "uv.lock がありません。uv lock で作ってコミットしてください（lock なしでは版を固定できない）。" >&2; exit 1; }
  # 開発用の依存（pytest など）は、[dependency-groups] の dev なら既定で入るが、
  # [project.optional-dependencies] の dev は --extra dev を付けないと入らない
  extras=()
  if awk '/^\[/ { s = ($0 == "[project.optional-dependencies]") }
          s && /^[[:space:]]*dev[[:space:]]*=/ { found = 1 }
          END { exit !found }' pyproject.toml; then
    extras=(--extra dev)
  fi
  # --locked: uv.lock が pyproject.toml と合っていなければ止まる。Python の版は .python-version で固定する
  uv sync --locked "${extras[@]}"
  if [[ -d tests ]]; then uv run --locked "${extras[@]}" pytest; fi
  ran=true
fi

if [[ "$ran" == false ]]; then
  echo "実行するテストがありません（scripts/ci.sh を編集して追加してください）。"
fi
