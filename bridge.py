#!/usr/bin/env python3
"""
Local bridge: receives player state from the browser extension and pushes it
to Discord Rich Presence.

The Discord Application ID comes from the extension popup, so this script
needs no configuration. DISCORD_CLIENT_ID is still honoured as a fallback.

    pip install websockets pypresence
    python3 bridge.py
"""

import asyncio
import json
import os
import time

import websockets
from pypresence import AioPresence

HOST, PORT = "127.0.0.1", 8765

MIN_UPDATE_INTERVAL = 15.0   # Discord throttles presence updates
HEARTBEAT_TIMEOUT = 12.0     # no word from the browser means the tab is gone

rpc = None
rpc_id = None                # which client id the current rpc belongs to
last_key = None
last_seen = time.time()
cleared = True


async def ensure_rpc(client_id):
    """Connect to Discord, or reconnect if the client id changed."""
    global rpc, rpc_id, last_key, cleared

    client_id = (client_id or "").strip()
    if not client_id:
        return False
    if rpc is not None and rpc_id == client_id:
        return True

    if rpc is not None:
        try:
            await rpc.close()
        except Exception:
            pass
        rpc = None
        rpc_id = None
        last_key = None
        cleared = True

    try:
        candidate = AioPresence(client_id)
        await candidate.connect()
    except Exception as e:
        print(f"[bridge] cannot connect with id {client_id}: {e}")
        return False

    rpc = candidate
    rpc_id = client_id
    print(f"[bridge] connected to Discord (app {client_id})")
    return True


async def clear():
    global cleared, last_key
    if rpc and not cleared:
        try:
            await rpc.clear()
        except Exception as e:
            print("[bridge] clear failed:", e)
        cleared = True
        last_key = None
        print("[bridge] presence cleared")


async def apply(state):
    global last_key, cleared

    if rpc is None:
        return

    title = (state.get("title") or "").strip()
    artist = (state.get("artist") or "").strip()
    if not title:
        return

    if state.get("paused"):
        await clear()
        return

    now = time.time()
    position = state.get("position") or 0
    duration = state.get("duration") or 0

    # Identity of the current playback moment: a seek changes it,
    # steady playback does not.
    key = (title, artist, int(now - position) // 5)
    if key == last_key:
        return

    start = int(now - position)
    payload = {
        "details": title[:128],
        "state": (artist or "Unknown artist")[:128],
        "start": start,
    }
    if duration:
        payload["end"] = int(start + duration)
    if state.get("artwork"):
        payload["large_image"] = state["artwork"]
        payload["large_text"] = (state.get("album") or title)[:128]
    if state.get("videoId"):
        payload["buttons"] = [{
            "label": "Listen",
            "url": f"https://music.youtube.com/watch?v={state['videoId']}",
        }]

    try:
        await rpc.update(**payload)
        last_key = key
        cleared = False
        print(f"[bridge] {artist} - {title}")
    except Exception as e:
        print("[bridge] update failed:", e)


async def handler(conn):
    global last_seen
    print("[bridge] browser connected")
    try:
        async for raw in conn:
            last_seen = time.time()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            kind = msg.get("type")
            if kind == "hello":
                ok = await ensure_rpc(msg.get("clientId"))
                try:
                    await conn.send(json.dumps({"type": "rpc", "ok": ok}))
                except Exception:
                    pass
            elif kind == "state":
                await apply(msg)
            elif kind == "off":
                await clear()
    except websockets.ConnectionClosed:
        pass
    finally:
        print("[bridge] browser disconnected")
        await clear()


async def watchdog():
    while True:
        await asyncio.sleep(3)
        if not cleared and time.time() - last_seen > HEARTBEAT_TIMEOUT:
            print("[bridge] heartbeat lost")
            await clear()


async def main():
    fallback = os.environ.get("DISCORD_CLIENT_ID", "").strip()
    if fallback:
        await ensure_rpc(fallback)
    else:
        print("[bridge] waiting for an Application ID from the extension")

    async with websockets.serve(handler, HOST, PORT):
        print(f"[bridge] listening on ws://{HOST}:{PORT}")
        await watchdog()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
