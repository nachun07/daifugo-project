Daifugo Server (Socket.IO)

このサーバは Next.js クライアントと連携するための権威サーバです。

セットアップ:

1. cd daifugo-server
2. npm ci
3. npm run dev

Docker:

  docker build -t daifugo-server .
  docker run -p 4000:4000 daifugo-server

API / Socket イベント:
- create_room { name } -> room_created { code, players, yourPlayerId }
- join_room { code, name } -> joined { code, yourPlayerId }
- resume { code, playerId } -> room_resumed
- start_game { code } -> game_state { state }
- action { code, type: 'play'|'pass', cards } -> game_state { state }

データ永続化は data/rooms.json に行われます。
