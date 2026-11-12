#!/bin/sh
# 作業の場（Claude）からGitHubへの自動アップロード（汎用）。
# このスクリプトは「<プロジェクトのフォルダー>/自動アップロード/」に置く。フォルダーの場所は自分の位置から決める。
# 作業の場がフォルダーに push-request.txt（1行目がコミットの説明）を置くと、launchd がこれを動かす。
#  - <名前>-source.tar.gz があれば、<名前>/ を中身で置き換える（例: app-source.tar.gz → app/）
#  - 変更をまとめてコミットし、push する。結果は auto-push.log に追記する。
DIR="$(cd "$(dirname "$0")/.." && pwd)"
REQ="$DIR/push-request.txt"
LOG="$DIR/auto-push.log"
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"
[ -f "$REQ" ] || exit 0
cd "$DIR" || exit 1
MSG="$(head -n 1 "$REQ")"
[ -n "$MSG" ] || MSG="作業の場からの更新"
rm -f "$REQ"
{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') $MSG"
  for f in *-source.tar.gz; do
    [ -f "$f" ] || continue
    name="${f%-source.tar.gz}"
    rm -rf "$name.new" && mkdir "$name.new" && tar xzf "$f" -C "$name.new" && [ -d "$name.new/$name" ] &&
      rm -rf "$name" && mv "$name.new/$name" "$name" && rmdir "$name.new" && rm "$f" && echo "$name/ を更新" ||
      echo "$f を展開できませんでした（中に $name/ がありません）"
  done
  git rm -r -q --cached --ignore-unmatch "Claude outputs" >/dev/null 2>&1
  git add -A
  if git commit -q -m "$MSG"; then echo "コミットしました"; else echo "変更はありません"; fi
  if git push -q 2>&1; then echo "push しました"; else echo "push に失敗しました"; fi
} >> "$LOG" 2>&1
