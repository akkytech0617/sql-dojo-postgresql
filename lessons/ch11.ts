import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 11, title: '運用', summary: 'バックアップ・リストア・マイグレーション・監視・切断・容量と、稼働後のシステムを守る術を学びます。',
  steps: [
    { id: 'ch11-01', title: 'pg_dump でバックアップし、リストアで戻せることを証明する', session: 'A',
      story: '月曜の朝、館長から「今度のシステム障害訓練で『データを1年前に戻せますか』と聞かれる」と連絡が来ました。まず論理バックアップの pg_dump を取り、実際に戻せることを自分の手で証明します。このステップは読んで手元のターミナルで実行する練習です（SQL の採点はありません）。',
      explanation: `## バックアップは OS 層の仕事\nこの教材アプリは（これまで通り）SQL を送るだけです。バックアップは**シェルから pg_dump を実行する OS 層の仕事**で、DB に接続するアプリにシェルの権限は渡しません。DB の資格と OS の資格を分けるのが、10章で学んだ最小権限の運用面での延長です。\n\n## この環境での正確なコマンド\n\`\`\`sh\n# 1) カスタム形式でバックアップ（ホストのカレントに library.dump を作る）\ndocker exec sql-dojo-db pg_dump -U dojo_admin -Fc library > library.dump\nls -lh library.dump\n\n# 2) リストア先の空データベースを作る\ndocker exec sql-dojo-db createdb -U dojo_admin library_restore\n\n# 3) カスタム形式は pg_restore で戻す（stdin から渡す）\ndocker exec -i sql-dojo-db pg_restore -U dojo_admin -d library_restore < library.dump\n\n# 4) 戻ったか、行を数えて証明する\ndocker exec sql-dojo-db psql -U dojo_admin -d library_restore \\\n  -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"\ndocker exec sql-dojo-db psql -U dojo_admin -d library_restore -tAc "SELECT count(*) FROM public.loans"\n\n# 5) 練習が済んだら片付ける（実験DBとダンプファイルを残さない）\ndocker exec sql-dojo-db dropdb -U dojo_admin library_restore\nrm library.dump\n\`\`\`\n\nコンテナ名 \`sql-dojo-db\` は docker compose のプロジェクト名由来です（既定プロジェクトなら sql-dojo-db）。この教材を複数環境で動かしている場合は \`docker ps --format '{{.Names}}'\` で自分のコンテナ名（例: sql-dojo-w5-db）に読み替えてください。\n\n## なぜ -Fc（カスタム形式）か\npg_dump の形式は3つあります。\n\n| 形式 | 指定 | 特徴 |\n|---|---|---|\n| 平文 SQL | -Fp（既定） | SQL テキスト。psql で流すだけ。人間が読める |\n| **カスタム** | **-Fc** | 圧縮されたバイナリ。**pg_restore が必要**。並列リストア・部分リストアが可能 |\n| ディレクトリ | -Fd | 1表1ファイルのディレクトリ。大規模DBの並列ダンプに |\n\n実務の定番はカスタム形式（またはディレクトリ形式）です。圧縮され、並列リストア（pg_restore -j 4）ができ、表単位の部分リスト法（--table）もできるためです。\n\n## バックアップの鉄則\n**「戻せることを証明したものだけがバックアップ」**です。取って放置したダンプは、リストアを一度も試していない時点で信用できません。このステップのとおり「別DBに戻して行を数える」までを1セットにして、月次で自動実行するのが実務の作法です（3-2-1の原則: 3コピー・2媒体・1つは別拠点、という運用目標と合わせて）。`,
      task: 'ターミナルで上の5つの工程を実行してください。library_restore に 7表と貸出100行が戻ること、最後に実験DBとダンプファイルが消えることを確認します。このステップは読了で進みます。',
      hints: ['docker exec sql-dojo-db ... はホスト側のシェルで実行します（エディタではありません）。', 'コンテナ名が違う場合は docker ps --format "{{.Names}}" で確認します。', '最後の dropdb と rm を忘れないこと（章末状態に実験DBを残しません）。'],
      solution: '',
      replay: '',
      check: { type: 'manual' },
      mysqlNote: 'MySQL の定番は `mysqldump --single-transaction --routines --triggers -u root -p library > library.sql` です（--single-transaction で InnoDB の整合性を取るのが pg_dump 相当の作法。平文SQL限定）。MySQL に pg_dump -Fc 相当の「カスタムバイナリ形式」はなく、並列・大規模向けは MySQL Shell の util.dump-instance / util.dump-tables（ZSTD圧縮・チャンク分割）を使います。リストアは `mysql -u root -p library_restore < library.sql` です。mysqldump に --globals-only 相当はありません（次のステップ参照）。' },
    { id: 'ch11-02', title: 'ロールはダンプに入らない — pg_dumpall --globals-only', session: 'A',
      story: '昨日のリストア練習は「同じクラスタの中」でした。来月の引っ越しでは新しいサーバーに新しい PostgreSQL を立てて移します。そのとき、pg_dump の中に 10章で作った lib_* ロールが入っていないことに気づきます。入っていない理由と、正しい毎日の運用を押さえます。',
      explanation: `## pg_dump は「1つのデータベースの中」しか取らない\npg_dump は指定したデータベースの中身（表・データ・ビュー・関数・**付与された権限（ACL）**）をダンプします。しかし**ロール（CREATE ROLE）とメンバーシップはクラスタ全体のオブジェクト**で、どのデータベースの中にもありません。だから pg_dump library の中に CREATE ROLE lib_app は入っていないのです。\n\n結果: ロールが無いクラスタにさっきの library.dump を pg_restore すると、「WARNING: role lib_app does not exist」の警告が出て、**権限が付いたまま戻らない**（データは戻るが、誰も権限を持たない状態）になります。\n\n## 正解は2本立て\n\`\`\`sh\n# クラスタ全体の「グローバル」= ロールとテーブル空間\ndocker exec sql-dojo-db pg_dumpall -U dojo_admin --globals-only > globals.sql\nhead globals.sql    # CREATE ROLE ... / GRANT ... の並びを確認する\nrm globals.sql\n\`\`\`\n実務の毎日の運用は、\n- **pg_dumpall --globals-only**（ロール。毎日、軽い）\n- **pg_dump -Fc（データベースごと）**\n\nの2本を cron 等で回すことです。リストア手順書には「globals → DB」の順で戻す、と書いておきます（先にロールがいないと ACL の付与が警告になるため）。\n\n## なぜ実務でこうするか\npg_dumpall には --globals-only を付けない「全部入り」モード（すべてのDBの全データ）もありますが、大きなクラスタでは毎日全部取るのは重く、DBごとの pg_dump に分担するのが定番です。ただし分担すると**ロールを忘れやすい**。実際の障害で「データは戻ったのに誰も接続できない」事故が起きるのがこの忘れで、手順書に globals を明記しておく意味はそこにあります。\n\nなおこのステップも読んで実行する練習です（globals.sql の中に GRANT lib_librarian TO lib_tanaka が見つかればOK）。`,
      task: 'pg_dumpall --globals-only でロール定義を取り出し、中身に CREATE ROLE と GRANT（メンバーシップ）があることを確認してください。確認したら globals.sql は削除します。このステップは読了で進みます。',
      hints: ['docker exec sql-dojo-db pg_dumpall -U dojo_admin --globals-only > globals.sql をホストのシェルで実行します。', 'head globals.sql か grep GRANT globals.sql で中身を確認します。', '見たら rm globals.sql で片付けます（章末状態に余分なものを残しません）。'],
      solution: '',
      replay: '',
      check: { type: 'manual' },
      mysqlNote: 'MySQL ではアカウントと権限が「mysql というシステムスキーマの中のデータ」なので、PostgreSQL の「グローバルという別物」という構図が根本から違います。mysqldump は DB 単位のダンプに mysql シキーマを含めないので、アカウントの引っ越しは `SHOW GRANTS FOR \'lib_app\'@\'%\';` の出力を保存する、MySQL Shell の util.dump-instance を使う、という運用になります。PostgreSQL の「globals を別に取る」運用に一番近いのは SHOW GRANTS の退避です。' },
    { id: 'ch11-03', title: 'マイグレーションと、ROLLBACKできるDDL', session: 'A',
      story: '来月の改修で members に「リマインダー送付先」列を足すことになりました。本番で表構造を変えるときの安全装置 — マイグレーション — の考え方と、PostgreSQL の DDL がトランザクションで守られていることを体験します。',
      explanation: `## マイグレーションとは\nスキーマ変更（DDL）を**バージョン管理された小さなファイルの連なり**として適用する仕組みです。Flyway や golang-migrate などのツールでは、\n\n\`\`\`\nV001__create_members.up.sql    -- 適用するDDL\nV001__create_members.down.sql  -- 戻すDDL（down）\nV002__add_reminder_column.up.sql\nV002__add_reminder_column.down.sql\n\`\`\`\n\nのように番号付きの up/down を並べ、適用済みの番号を管理テーブルに記録します。実務で「DBのスキーマ変更」を安全にするのはほぼこの仕組みで:\n- 全環境（開発・検証・本番）で**同じ順で同じDDL**が当たる\n- down があるので1つ前のバージョンに戻せる\n- 変更履歴がレビュー（プルリクエスト）対象になる\n\n## PostgreSQL の強み: DDL がトランザクションできる\nPostgreSQL は CREATE/ALTER/DROP を BEGIN 〜 ROLLBACK の中で実行でき、取り消せます。マイグレーションツールはこれを利用して「1バージョン=1トランザクション」で適用するので、**途中で失敗したバージョンは跡形もなく全ロールバック**されます（psql なら psql -1（--single-transaction）と ON_ERROR_STOP）。\n\n体験してみましょう。ガイドの5つの SQL を順に実行します: **BEGIN** → **ALTER**（trial_memo 列を追加）→ **確認SELECT**（トランザクションの中で列が見える）→ **ROLLBACK** → **再確認SELECT**（列が消えた）。変更が「見えてから消える」までを自分の目で追うのが、この性質の覚え方です。\n\n## なぜ実務でこうするか\n本番のスキーマ変更で一番怖いのは「V003 の途中で失敗して、片方だけ適用された」状態です。それが起きない、という性質そのものが PostgreSQL でマイグレーションを回す最大の実務メリットです（11章のバックアップとこの性質を組み合わせて、変更前に必ずダンプを取る運用も定番）。`,
      task: 'ガイドの5つの SQL を順に実行してください。BEGIN の中で members に trial_memo 列（text）を足して information_schema.columns に列が見えることを確認し、ROLLBACK で再確認すると 0 に戻ることを確かめます。',
      hints: ['BEGIN → ALTER TABLE → 確認SELECT → ROLLBACK → 再確認SELECT の順です（ガイドの「このSQLを挿入」から1つずつ）。', "ALTER TABLE public.members ADD COLUMN trial_memo text; が DDL です。MySQL ならこの時点で前のトランザクションが暗黙コミットされます。", "確認は SELECT count(*)::int AS trial_columns FROM information_schema.columns WHERE table_schema='public' AND table_name='members' AND column_name='trial_memo'; です。"],
      solution: `BEGIN;
ALTER TABLE public.members ADD COLUMN trial_memo text;
SELECT count(*)::int AS trial_columns FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'trial_memo';
ROLLBACK;
SELECT count(*)::int AS trial_columns FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'trial_memo';`,
      replay: '',
      script: [
        { session: 'A', sql: 'BEGIN', expect: 'ok', note: 'DDL もトランザクションの中で実行できます。マイグレーションツールが頼る性質です。' },
        { session: 'A', sql: 'ALTER TABLE public.members ADD COLUMN trial_memo text', expect: 'ok', note: '表構造を変えます。MySQL ならここで前のトランザクションが暗黙コミットされ、以降取り消せません。' },
        { session: 'A', sql: "SELECT count(*)::int AS trial_columns FROM information_schema.columns\n  WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'trial_memo'", expect: 'ok', note: 'トランザクションの中なので新しい列が見えます（trial_columns = 1）。' },
        { session: 'A', sql: 'ROLLBACK', expect: 'ok', note: 'DDL ごと取り消します。ここが PostgreSQL の DDL がトランザクション対応である証明です。' },
        { session: 'A', sql: "SELECT count(*)::int AS trial_columns FROM information_schema.columns\n  WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'trial_memo'", expect: 'ok', note: '取り消されたので 0 に戻りました。「1バージョン=1トランザクション」はこの性質の上に成り立ちます。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL では DDL（CREATE/ALTER/DROP）を実行した時点で**前のトランザクションが暗黙コミット**され、DDL 自体も取り消せません。だから「1バージョン=1トランザクション」が作れず、MySQL 向けマイグレーション運用は「適用済み番号の記録（冪等性）と失敗時の手作業リカバリ」で担保します（Flyway/Liquibase は両対応）。大規模表のALTERは ALGORITHM=INSTANT / gh-ost / pt-online-schema-change で無停止化するのが MySQL の実務技術です。' },
    { id: 'ch11-04', title: 'pg_stat_activity で稼働を見る', session: 'A',
      story: '稼働中のシステムで「いま誰が何をしているか」を見られないと、遅いクエリの原因も、ロック待ちも、迷子のトランザクションも分かりません。PostgreSQL の観察窓 pg_stat_activity を使いこなします。',
      explanation: `## pg_stat_activity は「全セッションの一覧」\nPostgreSQL は自分自身の状態も表で管理します（10章で学んだカタログの「動く版」）。pg_stat_activity の1行が1セッションで、主な列は:\n\n| 列 | 意味 |\n|---|---|\n| pid | セッションのバックエンドID（切断に使う） |\n| usename / datname | 誰が・どのDBに |\n| state | active（実行中）/ idle / idle in transaction（**放置トランザクション。要注意**） |\n| wait_event_type | Lock など、何を待っているか |\n| xact_start / query_start | トランザクション／クエリの開始時刻（長時間もの発見に） |\n| query | 最後に実行した（または実行中の）SQL |\n\n実務で毎日使う3つの監視クエリは:\n\n\`\`\`sql\n-- 状態別のセッション数\nSELECT state, count(*)::int AS sessions FROM pg_stat_activity WHERE datname = 'library' GROUP BY state;\n-- 5分以上放置された idle in transaction（肥大化とロック保持の原因）\nSELECT pid, usename, xact_start, query FROM pg_stat_activity\n  WHERE state = 'idle in transaction' AND xact_start < now() - interval '5 min';\n-- 長時間走っているクエリ\nSELECT pid, usename, query_start, left(query, 60) AS query FROM pg_stat_activity\n  WHERE state = 'active' AND query_start < now() - interval '1 min' ORDER BY query_start;\n\`\`\`\n\nこの教材のエディタで「実行をキャンセル」ボタンを押すと、裏で pg_cancel_backend が走ります — それも pg_stat_activity の pid を使っています。\n\n## このステップで実行すること\n\`\`\`sql\nSELECT usename, datname, state, wait_event_type, backend_type FROM pg_stat_activity\n  WHERE datname = 'library' ORDER BY pid;\n\`\`\`\nでlibraryにいるセッション（自分=A、もう1つのセッション=B、そして教材の管理接続）を見てから、最後に安定して採点できる「自分自身の1行」を取ります。\n\n\`\`\`sql\nSELECT usename, datname, backend_type FROM pg_stat_activity WHERE pid = pg_backend_pid();\n\`\`\`\n\npg_backend_pid() は自分自身の pid を返す関数です。\n\n## なぜ実務でこうするか\n「遅い」の原因調査は、ほぼ必ず pg_stat_activity から始まります。ロック待ち（9章）も idle in transaction の張本人も、この一覧の wait_event と xact_start で特定できます。障害対応の第一手として身につける価値がここにあります。`,
      task: 'library の全セッション一覧を見てから、pg_backend_pid() で自分自身の行（usename, datname, backend_type の3列）を表示してください。最後の SELECT が採点対象です。',
      hints: ['1つ目は WHERE datname = \'library\' で絞った一覧、2つ目は WHERE pid = pg_backend_pid() です。', '自分の行は state が active、他は idle が見えるはずです。', '採点対象は最後の SELECT（3列）なので、これを最後に実行します。'],
      solution: `SELECT usename, datname, state, wait_event_type, backend_type FROM pg_stat_activity
  WHERE datname = 'library' ORDER BY pid;
SELECT usename, datname, backend_type FROM pg_stat_activity WHERE pid = pg_backend_pid();`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT usename, datname, backend_type FROM pg_stat_activity WHERE pid = pg_backend_pid() LIMIT 1` },
      mysqlNote: 'MySQL の対応物は `SHOW [FULL] PROCESSLIST`（または information_schema.PROCESSLIST / performance_schema.threads）です。Id / User / db / Command / Time / State / Info の並びで、pg_stat_activity の pid/usename/datname/state/query にほぼ対応します。「idle in transaction」に相当するのはスリープしたオープントランザクション（innodb 行ロック保持）で、performance_schema と information_schema.INNODB_TRX で追うのが MySQL の実務です。' },
    { id: 'ch11-05', title: '暴走セッションを切断する（pg_terminate_backend）', session: 'A',
      story: '実際に起きた障害を想定します。セッション B が長い処理を掴んだまま戻ってきません。「セッションごと切る」最終手段を、練習用のもう1つのセッション B で実行します。',
      explanation: `## 2つの介入手段\n- \`pg_cancel_backend(pid)\` — 実行中の**クエリだけ**をキャンセル（接続は維持）。エディタの「実行をキャンセル」がこれです\n- \`pg_terminate_backend(pid)\` — **セッションごと切断**。開いているトランザクションは失われる（アボート）\n\n切るべき pid は pg_stat_activity から特定します。下の SQL は「library にいて、この教材（application_name = sql-dojo）の接続で、自分以外」のセッション、つまり B を1行返します。\n\n\`\`\`sql\nSELECT pid, usename, state FROM pg_stat_activity\n  WHERE datname = 'library' AND application_name = 'sql-dojo' AND pid <> pg_backend_pid();\nSELECT pg_terminate_backend(pid) AS terminated\n  FROM pg_stat_activity\n  WHERE datname = 'library' AND application_name = 'sql-dojo' AND pid <> pg_backend_pid();\n\`\`\`\n\n自分自身の pid を除外（pid <> pg_backend_pid()）しているのが事故防止の定番書き方です。**自分を切らない**。また、スーパーユーザー以外は自分のセッションしか切れないので、この操作は管理者の仕事になります（これも10章の権限設計の一部）。\n\n## 切断されると向こうはどうなるか\nB 側の接続は即座に死に、セッションバーは「未接続」になります。未確定のトランザクションは失われ、SET した設定値や一時テーブルも消えます（接続の状態は接続に紐づくため）。次のステップで B を復帰させます。\n\n## なぜ実務でこうするか\n本番で本当に切るのは「idle in transaction でロックを掴み続け後続を止めているセッション」や「応答しない暴走クエリ（キャンセルも効かない）」です。切断は副作用（ロールバック）のある最終手段なので、実務では必ず「pg_stat_activity で確認 → 対象を1つに特定 → 切断」をワンセットで記録に残します。放置トランザクションを予防する設定（idle_in_transaction_session_timeout）の検討も、この体験から始まります。`,
      task: '1つ目の SQL で B のセッションを特定し、2つ目の SQL で pg_terminate_backend によって切断してください（terminated = true が返れば成功）。最後の結果が採点対象です。',
      hints: ['application_name = \'sql-dojo\' と pid <> pg_backend_pid() の2つの条件で「教材のもう1つの接続」を狙います。', 'SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE ...; の形です。', 'セッション B が admin / library に接続している状態で実行します（未接続だと対象が0行になり、terminated が1行返りません）。実行後、セッション B のバーが「未接続」になることを確認します。'],
      solution: `SELECT pid, usename, state FROM pg_stat_activity
  WHERE datname = 'library' AND application_name = 'sql-dojo' AND pid <> pg_backend_pid();
SELECT pg_terminate_backend(pid) AS terminated
  FROM pg_stat_activity
  WHERE datname = 'library' AND application_name = 'sql-dojo' AND pid <> pg_backend_pid();`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT true AS terminated LIMIT 1` },
      mysqlNote: 'MySQL は `KILL <id>;`（= pg_terminate_backend）と `KILL QUERY <id>;`（= pg_cancel_backend）の2本です。id は SHOW PROCESSLIST の Id 列から取ります。MySQL の KILL は誰の接続でも（権限があればSUPER/SYSTEM_USER権限が必要）切れますが、PostgreSQL はスーパーユーザーか自分のセッション限定です（「管理者の仕事」の意味が違う）。' },
    { id: 'ch11-06', title: '切断されたセッションを復帰させる', session: 'B',
      connect: { B: { user: 'admin', password: '', database: 'library' } },
      story: '切断されたセッション B は、もうこの教材の API からは「未接続」です。これからどうなるか — 実務の「アプリの再接続」を、この教材のUIで追体験します。',
      explanation: `## 切断後は「08003」\n未接続のセッションに SQL を送ると、SQL がデータベースに届く前にアプリ側で「セッションは未接続です」（SQLSTATE **08003**）となります。このコードは PostgreSQL のエラーではなく**接続が無いこと**を表す SQLSTATE クラス08（接続例外）です。\n\n実務のアプリも同じで、pg/pgx/JDBC は通信断を検知したら例外を投げ、**再接続とリトライ**を担うのはアプリ（またはコネクションプール）です。「切断はいつ起きてもおかしくない前提で作る」のが稼働後のアプリの常識です（ネットワーク断・フェイルオーバー・今のように管理者に切られる、いろんな理由で起きます）。\n\n## 復帰は「最初から接続し直す」だけ\n「指定の接続に切り替え」で B を管理者（admin / library）に再接続してください。注意点:\n- **開いていたトランザクションは元に戻せない**（ROLLBACK 扱いで失われる）\n- SET した設定値・一時テーブル・準備済みステートメントも消える（接続に紐づくものはすべて新規）\n\nそのため実務では、再接続後に「業務の状態」をDBから読み直して再開する作りにします。\n\n\`\`\`sql\nSELECT current_user AS account, current_database() AS database;\n\`\`\`\nで復帰を確認するのが、9章でやったのと同じ最初の一手です。`,
      task: '「指定の接続に切り替え」でセッション B を管理者（admin / library）に再接続し、current_user と current_database() で復帰を確認してください。',
      hints: ['未接続のまま SQL を送ると 08003 になることを先に確認しても構いません。', '復帰はボタン（指定の接続に切り替え）から行います。', 'SELECT current_user AS account, current_database() AS database; が採点対象です。'],
      solution: `SELECT current_user AS account, current_database() AS database;`,
      replay: '',
      check: { type: 'result-equals', expectedSql: `SELECT current_user AS account, current_database() AS database LIMIT 1` },
      mysqlNote: 'mysql クライアントはサーバー切断時に自動再接続を試みる歴史がありますが（--reconnect / reconnect フラグ、8.0 では既定オフ）、JDBC/Connector/J などのドライバは例外を投げてアプリに委ねる点は PostgreSQL と同じ思想です。エラーコードの文化差もここに出ます: MySQL は 2006/2013（MySQL固有番号）、PostgreSQL は SQLSTATE 08 クラス（08003 connection does not exist）です。' },
    { id: 'ch11-07', title: 'データベースと表のサイズを把握する', session: 'A',
      story: '月末の報告書に「DBの使用容量」の欄があります。来月から会員が増える予定で、増え方を見える化しておきたい。PostgreSQL のサイズ関数を押さえます。',
      explanation: `## サイズ関数3つ\n- \`pg_database_size('library')\` — データベース全体（バイト）\n- \`pg_total_relation_size('表')\` — 表 + **全インデックス** + TOAST を合計（バイト）。「この表はどれだけ居場所を使っているか」の実務値\n- \`pg_relation_size('表')\` — 表の本体のみ（インデックス除く）\n\nどれもバイト数の素の値を返すので、人間が読むには pg_size_pretty() で包みます（kB/MB/GB に整形）。\n\n\`\`\`sql\nSELECT pg_size_pretty(pg_total_relation_size('public.loan_history')) AS loan_history_total,\n       pg_size_pretty(pg_database_size(current_database())) AS library_total;\n\`\`\`\n\n8章で作った loan_history（100万行）が、library の大半を占めているはずです。実務の定番である「太っている表ベスト5」はこう書きます:\n\n\`\`\`sql\nSELECT c.relname AS table_name,\n       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,\n       pg_size_pretty(pg_indexes_size(c.oid)) AS indexes\nFROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace\nWHERE n.nspname = 'public' AND c.relkind = 'r'\nORDER BY pg_total_relation_size(c.oid) DESC\nLIMIT 5;\n\`\`\`\n\n## なぜ実務でこうするか\nディスクは「ある日突然尽きる」資源です。書き込みが失敗する（58P01 類）状態になってからでは遅く、**増え方の傾向を週次で見る**のが運用の基本です。サイズの伸びが急な表 = バッチの書き込み過多、インデックス過剰、VACUUM が追いついていない（デッドタプルの滞留）などの兆候を読み取れます。観察の起点として pg_stat_user_tables の n_dead_tup（デッドタプル数）と並べて見るのが定番です。`,
      task: 'loan_history の表サイズ（インデックス込み）と library のDBサイズを pg_size_pretty で整形して表示してください（列名は loan_history_total と library_total）。最後の結果が採点対象です。',
      hints: ["pg_total_relation_size('public.loan_history') に表側、pg_database_size(current_database()) にDB側を使います。", 'pg_size_pretty(...) で包みます。', '列名は AS loan_history_total / AS library_total です。'],
      solution: `SELECT pg_size_pretty(pg_total_relation_size('public.loan_history')) AS loan_history_total,
       pg_size_pretty(pg_database_size(current_database())) AS library_total;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT pg_size_pretty(pg_total_relation_size('public.loan_history')) AS loan_history_total,
       pg_size_pretty(pg_database_size(current_database())) AS library_total LIMIT 1` },
      mysqlNote: 'MySQL は information_schema.TABLES の DATA_LENGTH + INDEX_LENGTH（バイト）を集計します: `SELECT TABLE_NAME, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024) AS MB FROM information_schema.TABLES WHERE TABLE_SCHEMA=\'library\' ORDER BY (DATA_LENGTH+INDEX_LENGTH) DESC LIMIT 5;`。pg_size_pretty 相当の整形関数は無いので ROUND と単位計算を自前で書くのが MySQL 流です。DB全体は information_schema.SCHEMATA 経由か、SHOW TABLE STATUS で見ます。' },
    { id: 'ch11-08', title: '接続数の上限を設計する', session: 'A',
      story: '最後の運用テーマは接続数です。来月、貸出アプリを3台構成に増やします。1台あたりプール10接続なら30接続。そもそも上限はいくつで、誰に何を制限するのかを押さえます。',
      explanation: `## 接続は「重い」資源\nPostgreSQL の1接続は1バックエンドプロセスです。デフォルトの上限は:\n\n\`\`\`sql\nSELECT name, setting::int AS value FROM pg_settings\n  WHERE name IN ('max_connections', 'superuser_reserved_connections') ORDER BY name;\n\`\`\`\n\n- **max_connections**（既定100）— クラスタ全体の上限。これを超える接続は 53300（too many connections）で拒否\n- **superuser_reserved_connections**（既定3）— 上限のうち管理者専用の取り置き。\n\n「管理者の取り置きがある」理由は、接続が食い潰されたときに管理者が入って原因を切るためです（前のステップの pg_terminate_backend のための席）。\n\n## ロールごとの上限（CONNECTION LIMIT）\nアプリの暴走接続を防ぐ定番が、ロールごとの上限です:\n\n\`\`\`sql\nBEGIN;\nALTER ROLE lib_app CONNECTION LIMIT 2;\nSELECT rolname, rolconnlimit::int AS conn_limit FROM pg_roles WHERE rolname = 'lib_app';\nROLLBACK;\n\`\`\`\n\nlib_app を2接続に制限しています（この教材のロールは練習用なので、実験のあと ROLLBACK で戻します。ALTER ROLE がカタログ変更であり、PostgreSQL ではトランザクションで取り消せる点にも注目してください）。\n\n## なぜ実務でこうするか\n「アプリ3台 × プール10」がそのまま上限になるのは危険で、実務では:\n1. まず**プールサイズを台数分の合計で見積もる**（1台5〜10接続で十分なことが多い）\n2. ロールに CONNECTION LIMIT を付けて、アプリの設定ミスがDBを倒さないようにする\n3. 接続がさらに多いシステムでは **PgBouncer 等のプーラー**（1実接続を複数クライアントで共有）をDBの前に置く\n\nの順で階層的に守ります。「DBの設定だけで守る」より「アプリ側とDB側の両方で守る」のが運用設計の基本形です。`,
      task: 'ガイドの5つの SQL を順に実行してください。max_connections を確認し、BEGIN 〜 ROLLBACK の中で lib_app の CONNECTION LIMIT を 2 に変えて、rolconnlimit が 2 に見えることを確認します（実験は最後の ROLLBACK で戻します）。',
      hints: ['pg_settings の確認 → BEGIN → ALTER ROLE lib_app CONNECTION LIMIT 2 → 確認SELECT → ROLLBACK の順です。', 'ALTER ROLE lib_app CONNECTION LIMIT 2; がロールごとの上限を変える文です。', "確認は SELECT rolname, rolconnlimit::int AS conn_limit FROM pg_roles WHERE rolname = 'lib_app'; です（ROLLBACK 後は -1 に戻ります）。"],
      solution: `SELECT name, setting::int AS value FROM pg_settings
  WHERE name IN ('max_connections', 'superuser_reserved_connections') ORDER BY name;
BEGIN;
ALTER ROLE lib_app CONNECTION LIMIT 2;
SELECT rolname, rolconnlimit::int AS conn_limit FROM pg_roles WHERE rolname = 'lib_app';
ROLLBACK;`,
      replay: '',
      script: [
        { session: 'A', sql: "SELECT name, setting::int AS value FROM pg_settings\n  WHERE name IN ('max_connections', 'superuser_reserved_connections') ORDER BY name", expect: 'ok', note: 'クラスタ全体の上限（既定100）と管理者の取り置き（既定3）を確認します。' },
        { session: 'A', sql: 'BEGIN', expect: 'ok', note: '実験なのでトランザクションで囲みます（ALTER ROLE はカタログ変更で、取り消せます）。' },
        { session: 'A', sql: 'ALTER ROLE lib_app CONNECTION LIMIT 2', expect: 'ok', note: 'アプリ口座の接続数上限を2に制限します。' },
        { session: 'A', sql: "SELECT rolname, rolconnlimit::int AS conn_limit FROM pg_roles WHERE rolname = 'lib_app'", expect: 'ok', note: 'トランザクションの中なので conn_limit = 2 が見えます。' },
        { session: 'A', sql: 'ROLLBACK', expect: 'ok', note: '実験を取り消します。rolconnlimit は -1（無制限）に戻ります。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL にもサーバー全体の max_connections（既定151）があります。ロール単位の上限は PG の CONNECTION LIMIT に相当する **max_user_connections**（アカウント単位で付与: ALTER USER ... WITH MAX_USER_CONNECTIONS 2）です。「管理者の取り置き」に相当する仕組みはありません（接続が尽きると誰も入れないので、起動パラメータで対処します）。プール機構は PostgreSQL と同様にアプリ側 or ProxySQL で作るのが実務です。' },
  ],
}
export default chapter
