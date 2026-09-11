#!/bin/bash
# Sets up the bridge and registers it as a login agent.
# Double-click this file in Finder. No terminal typing needed.

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLIST="$HOME/Library/LaunchAgents/com.local.ytmbridge.plist"

echo "==> Project directory: $DIR"

if [[ "$DIR" == *"/Downloads/"* ]]; then
  echo "!!  Running from Downloads. macOS restricts that folder for background"
  echo "!!  agents. Move the project elsewhere, e.g. ~/ytm-discord, and rerun."
  exit 1
fi

echo "==> Creating virtualenv"
rm -rf "$DIR/.venv"
python3 -m venv "$DIR/.venv"
"$DIR/.venv/bin/pip" install -q --upgrade pip
"$DIR/.venv/bin/pip" install -q websockets pypresence

echo "==> Writing launch agent"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.local.ytmbridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>$DIR/.venv/bin/python3</string>
        <string>$DIR/bridge.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/ytmbridge.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/ytmbridge.err.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null

echo "==> Starting agent"
launchctl bootout "gui/$(id -u)/com.local.ytmbridge" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 3

echo
echo "==> Log:"
tail -5 "$HOME/Library/Logs/ytmbridge.log" || true
echo
echo "Next:"
echo "  1. chrome://extensions -> Developer mode -> Load unpacked -> $DIR/extension"
echo "  2. Click the extension icon, paste your Discord Application ID, save"
echo "  3. Open music.youtube.com and play something"

echo
echo "Готово. Можно закрыть это окно."
