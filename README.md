# SQL道場

市立図書館の業務（蔵書・会員・貸出・予約）を題材に、**PostgreSQL を手を動かして体系的に学ぶ、ローカル専用の学習アプリ**です。本物の PostgreSQL 18 に接続し、ブラウザーの SQL エディターで書いた解答をサーバー側で採点します。全13章（0〜12章）・122ステップ。

- 章ごとに「その章の開始状態」へ戻せる（再生 = reset）ので、何度でもやり直せます。
- 2つのセッション（A / B）を使い、同時実行・ロック・競合・デッドロックを実際に体験します。
- 全ステップに「MySQL では？」の差分解説付き。PostgreSQL の作法と MySQL の違いを並べて学べます。

## 必要なもの

- Docker（OrbStack または Docker Desktop）＋ Docker Compose
- Node.js 26 以降 / pnpm 10 以降

## セットアップと起動

```sh
cp .env.example .env
docker compose up -d --wait   # PostgreSQL 18（127.0.0.1:5433）
pnpm install
pnpm dev                      # API（127.0.0.1:3001）+ Vite（127.0.0.1:5173）
```

ブラウザーで http://127.0.0.1:5173 を開きます。

| 接続先 | 既定値 |
|---|---|
| アプリ | http://127.0.0.1:5173 |
| API | http://127.0.0.1:3001（Vite が `/api` をプロキシー） |
| PostgreSQL | 127.0.0.1:5433 / データベース `postgres` |
| 開発用の管理者 | `dojo_admin` / `dojo_admin_pw`（`.env` で変更可） |

- `docker compose up -d --wait` は DB の起動完了まで待ちます。`pnpm db:up` / `pnpm db:down` は同じ compose の起動・停止です。
- セッション A・B・admin は初回の SQL 実行時に接続します。接続先は画面から切り替えられます。
- 接続情報（パスワードを含む）はサーバーのメモリーだけに保持し、API の状態には含めません。
- データは compose の名前付きボリューム（`pgdata`）に保存されます（PostgreSQL 18 は `/var/lib/postgresql` にマウント）。`docker compose down` では消えず、`down -v` で消えます。

## 画面の説明

左のナビゲーションでページを切り替えます。

### 学習コース

- 左サイドバー: 章とステップの一覧、完了状況（localStorage に保存）、「全部リセット」。
- 本文: そのステップの物語・解説・課題（Markdown）、段階的ヒント、模範解答、「MySQL では？」の補足。
- SQL エディター: セッション A / B。`AB` のステップでは2つのエディターが並び、ガイドの順番どおりに実行します。
- 結果グリッド、日本語のエラーメッセージと SQLSTATE、NOTICE、実行のキャンセル。
- 「採点する」でその場で判定。上部の「章の最初からやり直す」「次へ →」で移動します。

### 自由練習

好きな SQL を自由に実行するページ（セッション A）です。`EXPLAIN` や `pg_*` カタログの照会など、何でも試せます。

### パネル（画面下のドック）

- **スキーマ**: 表・列・制約・索引・ロールの一覧と、**ER図** の切り替え。
- **実行計画**: `EXPLAIN` の結果ビューアー。
- **ロック監視**: `pg_locks` / `pg_stat_activity` から見たブロック待ちの一覧（2セッション課題で使います）。
- **権限**: ロール、データベース／スキーマ権限、表の権限マトリクス（direct / inherited / none）、列権限、ルーティンの EXECUTE、既定権限、RLS ポリシー。

## カリキュラム（全13章・122ステップ）

| 章 | タイトル | ステップ数 | 学ぶこと |
|---|---|---|---|
| 00 | はじめに | 3 | RDB と SQL の入口 |
| 01 | DBとスキーマ作成 | 8 | データベースを作り、スキーマで名前空間を分ける |
| 02 | テーブル設計DDL | 9 | 正規化した7枚の表を制約つきで CREATE TABLE |
| 03 | データ投入 | 8 | INSERT の基本から CSV 取込・冪等性まで |
| 04 | 検索基本 | 9 | 条件・並べ替え・NULL |
| 05 | 結合と集計 | 11 | JOIN・GROUP BY で貸出と延滞を集計 |
| 06 | 更新削除 | 10 | UPDATE・DELETE とトランザクション |
| 07 | ビュー・関数・トリガー | 10 | 再利用できる問い合わせと業務ルール |
| 08 | インデックス性能 | 11 | 実行計画・索引・100万行の履歴 |
| 09 | トランザクション | 11 | 分離レベル・競合・ロック・デッドロック |
| 10 | ユーザーと権限 | 17 | ロール・列／シーケンス／関数権限・既定権限・行レベルセキュリティ |
| 11 | 運用 | 8 | バックアップ／リストア・マイグレーション・監視・切断・容量・接続数 |
| 12 | 総合演習 | 7 | 「予約機能を追加せよ」— 設計から権限まで自分で完成 |

## 進め方のコツ

- **章は前の章の上に積み上がります。** ch12 の演習は ch0〜11 の状態を前提にします。状態がずれたら「章の最初からやり直す」でその章の開始状態へ、最初からやり直すなら「全部リセット」（ch0 の開始状態 = `library` なし）を使います。リセットは `library` と `lib_` ロールを作り直す破壊的操作で、学習用データは消えます。
- **2セッション課題（AB）** では A と B を同時に使います。片方をロック待ちのまま放置せず、ガイドの順番どおりに進めてください。AB のステップに入ると、前のステップで開いたトランザクションと `SET` を戻すため、接続中で待機中のセッションに自動で `ROLLBACK; RESET ALL;` を送ります（実行中のセッションには送りません）。
- 前のステップのトランザクションが開いたまま残っていると、画面に「ROLLBACK して状態を戻す」ボタンが出ます。
- **MySQL では？** を開くと、同じ目的を MySQL でどう書くか（エラー番号の文化、AUTO_INCREMENT、部分索引が無いこと、DEFINER / INVOKER など）が読めます。
- 採点は「最後に実行した結果」で判定します。失敗したら SQL を直して実行し直してから、もう一度採点してください。
- ch11 の一部（`pg_dump` / `pg_dumpall`）は、ブラウザーではなく**ターミナル**で実行する読み物ステップです（アプリからシェルは実行しません）。

## トラブルシューティング

```sh
# ポートが使われている（5173 / 3001 / 5433）
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:5433 -sTCP:LISTEN
# 別のポートにしたい場合は .env の API_PORT / PGPORT を変える
docker compose ps
docker compose logs db
```

- **DB に接続できない**: `docker compose up -d --wait` で起動し、画面のセッションバーから接続し直します。`dojo_admin_pw` を変えた場合は `.env` と画面の接続先をそろえてください。
- **教材が途中で通らない**: 「章の最初からやり直す」→ 直らなければ「全部リセット」。リセットは ch8 で100万行を作るため、数十秒かかることがあります。
- **DB を作り直したい**: `docker compose down -v`（ボリュームごと削除）→ `docker compose up -d --wait`。
- **リセット中の操作**: 再生中は API が 409 を返します。少し待ってから操作してください。

## 開発者向け

```sh
pnpm dev          # API + Vite
pnpm typecheck    # tsc（app / server の2プロジェクト）
pnpm lint         # eslint
pnpm test         # 全テスト（実 DB が必要・ローカル DB を破壊的にリセット）
pnpm build        # typecheck + vite build
pnpm test:lessons # 教材だけを実行（既定 0-12）
```

- テストは実 DB を**破壊的にリセット**します。開発中のアプリ（5433）とは別のコンテナを使ってください。

```sh
PGPORT=5437 docker compose -p sql-dojo-gate up -d --wait
PGPORT=5437 pnpm test
PGPORT=5437 LESSON_CHAPTERS=0-12 pnpm test:lessons
PGPORT=5437 docker compose -p sql-dojo-gate down -v
```

  - `PGPORT` で接続先、`LESSON_CHAPTERS` で教材の範囲を指定します。
  - `-p <名前>`（`COMPOSE_PROJECT_NAME` でも可）でコンテナー名とボリュームが分離され、複数の検証環境を並べられます。
  - Vite のプロキシーは API :3001 固定なので、並列で API も起動する場合は `vite.config.ts` を調整してください。

- 教材: `lessons/chNN.ts` が本体で、`lessons/index.ts` が唯一のソース（`GET /api/lessons` で配信）。採点は `POST /api/lessons/check`、章の開始状態への再生は `POST /api/reset {toChapter}`（0 で全リセット、13 で全章再生）。共通データは `lessons/data/*.sql`（`-- @include` / `-- @csv` はサーバーが展開）。契約は `docs/schema-contract.md`、執筆手順は `docs/lesson-authoring.md`。
- UI: `src/pages/*.tsx` の `export const page` と `src/panels/*.tsx` の `export const panel` が glob で自動登録されます（`order` で並び順）。
- API: `server/app.ts` の `createApp(manager)` は listen しないので、`app.request()` でテストできます。
- セッションは専用の長寿命な `pg.Client` を持ち、トランザクション・一時テーブル・`SET` はリクエストをまたいで維持されます。同一セッションでは同時実行できません。
- 実行結果は各結果の先頭 1,000 行まで表示・返却します（バッチ全体を simple query protocol で送信します）。重複する列名は pg の仕様で後勝ちになるため、必要なら `AS` を付けてください。

## セキュリティ（ローカル専用）

- 外部に公開しません。API・DB・Vite はすべてループバック（127.0.0.1）に限定しています。
- API は `Host` が `127.0.0.1` / `localhost` の 5173 / 3001 以外なら 403（DNS リバインディング対策）、Origin も同様に検証し、POST は `application/json` のみ受け付けます。
- 認証はありません。**管理者権限で任意の SQL（`DROP DATABASE` を含む）を実行できます。** 実データや本番の認証情報は接続しないでください。
- DB の開発用パスワードは `.env`（リポジトリーには含めません。`.env.example` をコピーして使います）にあります。教材の `lib_*` ロールのパスワード（`lib_app_pw` など）は練習専用です。採点はローカル DB のカタログを見るだけの仕組みで、不正防止の試験基盤ではありません。
