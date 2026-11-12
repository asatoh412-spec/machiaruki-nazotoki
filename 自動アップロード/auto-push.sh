#!/bin/sh
# 作業の場（Claude）が「街歩き」フォルダーに push-request.txt を置くと、launchd がこのスクリプトを動かす。
# app-source.tar.gz があれば app/ に展開し、変更をまとめて GitHub に push する。結果は auto-push.log に残す。
DIR="/Users/aki/街歩き"
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
  if [ -f app-source.tar.gz ]; then
    rm -rf app.new && mkdir app.new && tar xzf app-source.tar.gz -C app.new && rm -rf app && mv app.new/app app && rmdir app.new && rm app-source.tar.gz && echo "app/ を更新"
  fi
  git rm -r -q --cached --ignore-unmatch "Claude outputs" >/dev/null 2>&1
  git add -A
  if git commit -q -m "$MSG"; then echo "コミットしました"; else echo "変更はありません"; fi
  if git push -q 2>&1; then echo "push しました"; else echo "push に失敗しました"; fi
} >> "$LOG" 2>&1
