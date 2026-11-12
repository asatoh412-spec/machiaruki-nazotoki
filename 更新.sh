#!/bin/sh
# 作業の場（Claude）から届いた app-source.tar.gz を app/ に展開し、GitHub に上げる。
# 使い方: cd ~/街歩き && sh 更新.sh "変更の説明"
set -e
cd "$(dirname "$0")"
if [ -f app-source.tar.gz ]; then
  rm -rf app.new && mkdir app.new && tar xzf app-source.tar.gz -C app.new
  rm -rf app && mv app.new/app app && rmdir app.new && rm app-source.tar.gz
fi
git add -A
git commit -m "${1:-更新}" || echo "変更はありません"
git push
