#!/bin/sh
# 自動アップロードの導入（プロジェクトごとに一度だけ）。
# 使い方: sh "<プロジェクトのフォルダー>/自動アップロード/install.sh" [GitHubのリポジトリのURL]
#  - launchd に、このフォルダーの push-request.txt を見張る項目を登録する
#  - .gitignore に、上げないもの（APK、署名の鍵、合図とログなど）を足す
#  - このリポジトリ専用にトークンを保存する設定（credential.useHttpPath）にする
#  - URL を渡し、まだ Git の管理下でなければ、初期化して最初の push までする（このときだけトークンを聞かれる）
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
HASH="$(printf '%s' "$DIR" | md5 | cut -c1-8)"
LABEL="jp.aki.autopush.$HASH"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$DIR/自動アップロード/auto-push.sh</string></array>
  <key>WatchPaths</key><array><string>$DIR/push-request.txt</string></array>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
</dict>
</plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
cd "$DIR"
touch .gitignore
for line in 'apk/' 'keystore/' '*.tar.gz' '*.new/' 'push-request.txt' 'auto-push.log' '.DS_Store' 'Claude outputs/'; do
  grep -qxF "$line" .gitignore || echo "$line" >> .gitignore
done
if [ ! -d .git ] && [ -n "$1" ]; then
  git init -q -b main
  git remote add origin "$1"
fi
if [ -d .git ]; then
  git config credential.useHttpPath true
  if [ -n "$1" ] && ! git rev-parse -q --verify HEAD >/dev/null; then
    git add -A && git commit -q -m "初期" && git push -u origin main
  fi
fi
echo "導入しました: $DIR（launchd の項目 $LABEL）"
