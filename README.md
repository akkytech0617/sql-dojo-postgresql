# SQL道場

PostgreSQL を手を動かして学ぶ、ローカル専用の学習アプリです。現在は自由練習モードの基盤のみ実装しています。

## 起動

Node.js 26、pnpm 10、Docker Compose を使用します。

```sh
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
```

ブラウザーで http://127.0.0.1:5173 を開きます。API は 127.0.0.1:3001、DB は 127.0.0.1:5433 です。DB の起動完了を待つ場合は `docker compose up -d --wait` を使用します。

接続の初期値は `dojo_admin` / `dojo_admin_pw` / `postgres`。セッション A・B・admin は初回 SQL 実行時に接続します。切断した場合は接続設定から再接続してください。接続情報はサーバーのメモリーだけに保持し、パスワードを API の状態に含めません。

## 検証

```sh
pnpm typecheck
pnpm lint
pnpm test       # 実 DB が必要。PGPORT で接続先を変更可能
pnpm build
```

`pnpm db:up` / `pnpm db:down` で DB を起動・停止できます。停止しても名前付きボリュームは保持されます。PostgreSQL 18 のデータボリュームは `/var/lib/postgresql` にマウントしています。

## 並列作業用の独立 DB

```sh
PGPORT=5434 docker compose -p sql-dojo-w3 up -d --wait
PGPORT=5434 pnpm test
PGPORT=5434 docker compose -p sql-dojo-w3 down
```

プロジェクト名ごとにコンテナー名とボリュームが分離されます。`COMPOSE_PROJECT_NAME=sql-dojo-w3` の指定でも同様です。Vite のプロキシは API :3001 固定なので、並列 API の起動時は `vite.config.ts` も調整してください。

## 拡張の入口

- `src/app/pageRegistry.ts` に `{ id, label, component }` を追加するとページが増えます。
- `src/shared/types.ts` がブラウザーとサーバー共通の API 型です。
- `server/app.ts` の `createApp(manager)` は listen しないため、`app.request()` でテストできます。
- `SessionManager` は `connect` / `disconnect` / `status` / `list` / `query` / `cancel` / `health` / `close` を提供します。新しい ID は `connect` で追加可能です。
- セッションごとに専用の長寿命 `pg.Client` を持つため、トランザクション、一時テーブル、SET はリクエストをまたいで維持されます。同一セッションで同時実行はできません。実行中の接続変更・切断も拒否します。
- トランザクション状態は PostgreSQL の ReadyForQuery（I/T/E）から取得しています。pg の公開 API ではない内部イベントを一箇所で使用しています。
- キャンセルとヘルスチェックは、実行中のセッションと別の管理者接続を使います。キャンセル後、トランザクション内では ROLLBACK が必要な場合があります。

## 実行結果の仕様・制限

SQL は分割せず simple query protocol でそのまま送信します。複数文が成功すると各結果を返します。途中でエラーになると PostgreSQL がバッチを中断するため、結果は空配列でエラーだけを返します（途中までの結果は返しません）。バッチの暗黙トランザクションにも注意してください。

行の表示・レスポンスは各結果の先頭 1,000 行までです。pg 自体は全行をメモリーに読み込むため、巨大な結果には LIMIT を使ってください。durationMs は各文単位ではなくバッチ全体の経過時間です。NOTICE は実行ごとに収集します。重複する列名は pg のオブジェクト形式により後の列が上書きします。必要に応じて AS で一意な列名を付けてください。未知の型は型 OID を表示します。

この環境では自由に SQL（管理者権限の操作を含む）を実行できます。実データ・本番の認証情報を接続しないでください。API・DB・Vite はループバックに限定し、API は外部 Origin と JSON 以外の POST を拒否します。公開サーバー向けの認証や権限制限は実装していません。
