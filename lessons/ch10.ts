import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 10, title: 'ユーザーと権限', summary: 'ロールで最小権限を設計し、列・シーケンス・関数・行レベルまで権限を絞り込みます。',
  steps: [
    { id: 'ch10-01', title: 'ロールで「誰に何を許すか」を設計する', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'library' } },
      story: '開館から半年、システムは安定して動いています。ところが監査で「全職員が管理者パスワードを共有している」ことが指摘されました。館長から「誰が何をしてよいかをデータベース自身に管理してもらいたい」と命じられました。まずは役割設計です。',
      explanation: `## PostgreSQL の「ユーザー」と「ロール」は同じもの\nPostgreSQL には CREATE USER という構文もありますが、これは CREATE ROLE の歴史的な別名です。実体はどちらも**ロール**で、「ログインできるか（LOGIN 属性）」の違いだけです。\n\n- \`CREATE ROLE x LOGIN PASSWORD '...'\` — ログインできる「人・アプリ」\n- \`CREATE ROLE x NOLOGIN\` — ログインできない**権限の入れ物（グループロール）**\n\n実務の定番は、**権限はグループロールに付け、人にはグループのメンバーシップだけを付ける**設計です。異動・退職・担当替えのたびに表の権限を書き換える必要がなく、\`GRANT\`/\`REVOKE\` 1行で人事異動が反映できます。\n\n## この図書館のロール設計\n\n| ロール | 属性 | 役割 |\n|---|---|---|\n| lib_director | NOLOGIN | 館長（全業務表の管理者） |\n| lib_librarian | NOLOGIN | 司書（登録・更新。削除はしない） |\n| lib_reader | NOLOGIN | 閲覧者（カタログ参照のみ） |\n| lib_app | LOGIN PASSWORD | 貸出アプリ（システム接続用） |\n| lib_tanaka | LOGIN、lib_librarian のメンバー | 司書・田中さん |\n| lib_sato | LOGIN、lib_reader のメンバー | 閲覧者・佐藤さん |\n| lib_yamada | LOGIN、lib_director のメンバー | 館長・山田さん |\n\nパスワードはこの教材専用の練習値です（本番では認証情報管理と、 scram-sha-256 を使います）。\n\n## なぜ実務でこうするか\n**最小権限（least privilege）**は情報セキュリティの基本原則です。「今の業務に必要な最小の権限だけ」を与えると:\n- 人為ミスの被害範囲が狭まる（司書が誤って削除できない）\n- アプリの脆弱性（SQL インジェクションなど）が踏まれても漏れる情報・壊せる表が限定される\n- 「誰が何をできるか」がデータベースに文書化され、監査が機械的にできる\n\nなお、スーパーユーザー・CREATEDB・CREATEROLE・BYPASSRLS は既定で付かず、この教材の lib_ ロールにも付けません。ただし、この道場の**作業用アカウント dojo_learner** だけは例外で、データベースを作る（CREATEDB）・ロールを作る（CREATEROLE）ためにこの2つを持っています。それでもスーパーユーザーではないので、サーバー上のファイルの読み書きや他人のロールの乗っ取りはできません。真のスーパーユーザー dojo_admin は、アプリがリセット・採点・バックアップのために内部でだけ使う口座で、学習者の SQL がこの口座で実行されることはありません。\n\nメンバーシップは「グループを**人に**与える」方向の文です: \`GRANT lib_librarian TO lib_tanaka;\`（lib_tanaka が lib_librarian を継承）。`,
      task: '3つのグループロール（lib_director / lib_librarian / lib_reader、NOLOGIN）と4つのログインロール（lib_app / lib_tanaka / lib_sato / lib_yamada、パスワードは lib_*_pw の形）を作り、3人のログインロールをグループのメンバーにしてください。',
      hints: ['CREATE ROLE ロール名 NOLOGIN; がグループ、CREATE ROLE ロール名 LOGIN PASSWORD \'...\' が人です。', 'メンバーシップは GRANT グループ TO 人; の方向です（例: GRANT lib_librarian TO lib_tanaka;）。', 'パスワードは lib_app_pw / lib_tanaka_pw / lib_sato_pw / lib_yamada_pw にします。'],
      solution: `CREATE ROLE lib_director NOLOGIN;
CREATE ROLE lib_librarian NOLOGIN;
CREATE ROLE lib_reader NOLOGIN;
CREATE ROLE lib_app LOGIN PASSWORD 'lib_app_pw';
CREATE ROLE lib_tanaka LOGIN PASSWORD 'lib_tanaka_pw';
CREATE ROLE lib_sato LOGIN PASSWORD 'lib_sato_pw';
CREATE ROLE lib_yamada LOGIN PASSWORD 'lib_yamada_pw';
GRANT lib_librarian TO lib_tanaka;
GRANT lib_reader TO lib_sato;
GRANT lib_director TO lib_yamada;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('lib_director','lib_librarian','lib_reader')
    AND rolcanlogin = false AND rolsuper = false AND rolcreatedb = false AND rolcreaterole = false AND rolbypassrls = false AND rolinherit = true) = 3
  AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('lib_app','lib_tanaka','lib_sato','lib_yamada')
    AND rolcanlogin = true AND rolsuper = false AND rolcreatedb = false AND rolcreaterole = false AND rolbypassrls = false AND rolinherit = true) = 4
  AND (SELECT count(*) FROM pg_auth_members a
    JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
    WHERE (r.rolname, m.rolname) IN (('lib_librarian','lib_tanaka'), ('lib_reader','lib_sato'), ('lib_director','lib_yamada'))) = 3` },
      mysqlNote: 'MySQL 8.0 では `CREATE ROLE lib_librarian;` と `CREATE USER \'lib_tanaka\'@\'%\' IDENTIFIED BY \'...\';` が**別の文で役割も固定**です（ロールはログイン不可、ユーザーはロールになれない）。PostgreSQL の「LOGIN 属性で人とグループを使い分ける」1つの概念に対し、MySQL はユーザーとロールを型として区別します。アカウントには必ず `\'user\'@\'host\'` のホスト部が付く点も大きな違い（\'lib_tanaka\'@\'localhost\' と @\'%\' は別アカウント）。メンバーシップの `GRANT lib_librarian TO \'lib_tanaka\'@\'%\';` は PostgreSQL と同構文ですが、既定ロールへの切替は `SET DEFAULT ROLE` で明示します。' },
    { id: 'ch10-02', title: 'PUBLIC から接続権限を取り上げる', session: 'A',
      story: '7つのロールができました。しかしまだ何も GRANT していないのに、実はこの瞬間「誰でも library に接続できる」状態です。PostgreSQL の意外な初期値を確認して、入口から閉めます。',
      explanation: `## PUBLIC という「全員」\nPostgreSQL のすべてのロールは、暗黙に **PUBLIC** という特殊なロールを継承しています。そして新しいデータベースには既定で「\`PUBLIC\` に CONNECT」が付いてきます。つまり **LOGIN ロールを1つ作っただけで、その人は library に接続できてしまう**のです。\n\n## まず取り上げる\n\`\`\`sql\nREVOKE CONNECT ON DATABASE library FROM PUBLIC;\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;\n\`\`\`\n- 1行目で「全員が接続できる」既定を削除します。以降、library に入れるのは明示的に GRANT したロール（とデータベースの所有者 dojo_learner）だけです。\n- 2行目は public スキーマで「誰でも表を作れる」を消す文です。実は PostgreSQL 15 以降は初期状態で CREATE は PUBLIC に付いていません。ですが、15 未満から引き継いだ環境やテンプレートによっては付いたままなので、**権限の初期化スクリプトは「既定に頼らず明示する」**のが実務の作法です（冪等な権限スクリプト）。\n\n## なぜ実務でこうするか\n「作った瞬間に最小権限」を機械的に保証するためです。PUBLIC への既定付与に頼った環境では、新しいロールを作るたびに「実は参照できる表」が発生します。まず全員から取り上げて、必要な人にだけ与え直す（次ステップ）のが、監査で説明しやすい安全な並び順です。\n\nREVOKE の後も作業用アカウント dojo_learner は接続できます（このデータベースの所有者であり、所有者は CONNECT を明示的に持たなくても接続できるためです）。`,
      task: 'library への CONNECT を PUBLIC から、public スキーマの CREATE を PUBLIC から取り上げてください。',
      hints: ['REVOKE CONNECT ON DATABASE library FROM PUBLIC; が1つ目です。', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC; が2つ目です。', 'REVOKE しても library の所有者（dojo_learner）は接続できます。'],
      solution: `REVOKE CONNECT ON DATABASE library FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;`,
      check: { type: 'sql', sql: `SELECT NOT has_database_privilege('lib_sato', 'library', 'CONNECT')
  AND NOT has_database_privilege('public', 'library', 'CONNECT')
  AND NOT has_schema_privilege('public', 'public', 'CREATE')` },
      mysqlNote: 'MySQL に PUBLIC に相当する「全員ロール」はありません。そもそも「データベースに接続する権限」という概念がなく、`mysql.user` にアカウントが存在して `ON db.*` に何かが付与されていれば操作できます。PostgreSQL の CONNECT 権限に一番近いのは「アカウントの存在そのもの」と `ON db.*` の付与です。MySQL にも `REVOKE ALL ON library.* FROM \'user\'@\'host\';` の形はありますが、意味の単位（接続可否 vs 表操作可否）が違います。' },
    { id: 'ch10-03', title: '入口の権限（CONNECT と USAGE）を与える', session: 'A',
      story: '入口を閉めたので、次は「業務に必要な人だけ」を通します。データベースへの接続（CONNECT）と、中の public スキーマを使う（USAGE）の2段階があります。',
      explanation: `## 接続して名前を引く、の2段階\n- \`GRANT CONNECT ON DATABASE library TO ...\` — library に**接続してよい**という入口の許可。直前のステップで PUBLIC から奪った分を、必要なロールにだけ与え直します。\n- \`GRANT USAGE ON SCHEMA public TO ...\` — スキーマの中のオブジェクトを**名前で参照してよい**という許可。USAGE だけでは表は読めません（表の SELECT は次のステップ）。逆に USAGE が無いと、表に SELECT を持っていても「permission denied for schema public」になります。\n\nこの2つは**グループロールに**与えます。個人に直接配らないのが、1ステップ目で決めた方針です。\n\n\`\`\`sql\nGRANT CONNECT ON DATABASE library TO lib_director, lib_librarian, lib_reader, lib_app;\nGRANT USAGE ON SCHEMA public TO lib_director, lib_librarian, lib_reader, lib_app;\n\`\`\`\n\nlib_app は人ではなくアプリ専用のログインロールなので、グループとは別に直接与えます。\n\n## なぜ実務でこうするか\n「入口の権限は役割に、身分は個人に」。接続権限を個人にばらまくと、退職時の棚卸しが地獄になります。また、CONNECT を持たせないロール（集計用のデータを入れるだけの集約ロールなど）を明示的に作れるのも、CONNECT を独立した権限にしている意味です。`,
      task: '4つのロール（lib_director, lib_librarian, lib_reader, lib_app）に library への CONNECT と public スキーマの USAGE を与えてください。',
      hints: ['GRANT CONNECT ON DATABASE library TO ... と GRANT USAGE ON SCHEMA public TO ... の2文です。', '与える先は lib_director, lib_librarian, lib_reader, lib_app の4つです。', '田中さん・佐藤さんへの直接の GRANT は不要です（グループ経由で継承します）。'],
      solution: `GRANT CONNECT ON DATABASE library TO lib_director, lib_librarian, lib_reader, lib_app;
GRANT USAGE ON SCHEMA public TO lib_director, lib_librarian, lib_reader, lib_app;`,
      check: { type: 'sql', sql: `SELECT has_database_privilege('lib_director', 'library', 'CONNECT')
  AND has_database_privilege('lib_librarian', 'library', 'CONNECT')
  AND has_database_privilege('lib_reader', 'library', 'CONNECT')
  AND has_database_privilege('lib_app', 'library', 'CONNECT')
  AND has_database_privilege('lib_yamada', 'library', 'CONNECT')
  AND has_database_privilege('lib_sato', 'library', 'CONNECT')
  AND has_schema_privilege('lib_app', 'public', 'USAGE')
  AND has_schema_privilege('lib_tanaka', 'public', 'USAGE')
  AND has_schema_privilege('lib_sato', 'public', 'USAGE')
  AND has_schema_privilege('lib_yamada', 'public', 'USAGE')` },
      mysqlNote: 'MySQL では接続の可否はアカウント定義そのもので、`ON db.*` への付与がそのまま操作権になります。PostgreSQL の USAGE（スキーマを参照する権限）に完全対応するものはありません。なお MySQL には `USAGE` という名前の権限がありますが意味が逆で、「何もできないがログインだけはできる」印として CREATE USER 直後に付与されるものです（PostgreSQL の USAGE と名前が同じなだけで別物です）。' },
    { id: 'ch10-04', title: '表への権限を役割ごとに割り当てる', session: 'A',
      story: '入口が通るようになりました。ここからは「役割ごとの業務」を表への権限に写します。館長は全て、司書は登録と更新（削除はしない）、閲覧者はカタログだけ。',
      explanation: `## 表に対する8種類の権限\nSELECT（読む）／ INSERT（入れる）／ UPDATE（書き換える）／ DELETE（消す）／ TRUNCATE（空にする）／ REFERENCES（外部キーで参照する）／ TRIGGER（トリガーを付ける）／ MAINTAIN（VACUUM 等の保守）。\n\nこの教材の業務7表への割り当ては:\n\n| ロール | 権限 | 対象 |\n|---|---|---|\n| lib_director | ALL（全部） | 業務7表 |\n| lib_librarian | SELECT, INSERT, UPDATE | 業務7表（**DELETE なし**） |\n| lib_reader | SELECT | categories, authors, books, book_authors, copies + v_book_catalog |\n\n\`\`\`sql\nGRANT ALL ON public.categories, public.authors, public.books, public.book_authors,
  public.copies, public.members, public.loans TO lib_director;\nGRANT SELECT, INSERT, UPDATE ON public.categories, public.authors, public.books, public.book_authors,\n  public.copies, public.members, public.loans TO lib_librarian;\nGRANT SELECT ON public.categories, public.authors, public.books, public.book_authors, public.copies TO lib_reader;\nGRANT SELECT ON public.v_book_catalog TO lib_reader;\n\`\`\`\n\nv_book_catalog は7章で作ったビューです。PostgreSQL のビューは（既定では）**定義者の権限**で走るので、ビューそのものの SELECT だけ与えれば下表は参照できます。\n\n## なぜ実務でこうするか\n「司書は DELETE をしない」のような**業務ルールを権限で表現**するのがポイントです。削除や抹消は館長承認の管理業務、という運用を、権限がないことで機械的に守ります。ヒューマンエラー防止の最後の砦は手順書ではなく権限です。\n\n1行でまとめると: **業務 = できる操作の集合。ロール設計は業務設計。**`,
      task: '業務7表（categories, authors, books, book_authors, copies, members, loans）への権限を、館長グループには ALL、司書グループには SELECT/INSERT/UPDATE、閲覧者グループには5つのカタログ表と v_book_catalog への SELECT で与えてください。',
      hints: ['GRANT ALL ON 表, 表, ... TO lib_director; のように1文で並べられます。', '司書は DELETE を含めません。SELECT, INSERT, UPDATE の3つだけです。', '閲覧者はカタログ5表（categories, authors, books, book_authors, copies）とビュー v_book_catalog だけです。'],
      solution: `GRANT ALL ON public.categories, public.authors, public.books, public.book_authors,
  public.copies, public.members, public.loans TO lib_director;
GRANT SELECT, INSERT, UPDATE ON public.categories, public.authors, public.books, public.book_authors,
  public.copies, public.members, public.loans TO lib_librarian;
GRANT SELECT ON public.categories, public.authors, public.books, public.book_authors, public.copies TO lib_reader;
GRANT SELECT ON public.v_book_catalog TO lib_reader;`,
      check: { type: 'sql', sql: `SELECT has_table_privilege('lib_yamada', 'public.members', 'DELETE')
  AND has_table_privilege('lib_tanaka', 'public.loans', 'INSERT')
  AND has_table_privilege('lib_tanaka', 'public.loans', 'UPDATE')
  AND NOT has_table_privilege('lib_tanaka', 'public.loans', 'DELETE')
  AND has_table_privilege('lib_sato', 'public.books', 'SELECT')
  AND has_table_privilege('lib_sato', 'public.v_book_catalog', 'SELECT')
  AND NOT has_table_privilege('lib_sato', 'public.loans', 'SELECT')
  AND NOT has_table_privilege('lib_reader', 'public.members', 'SELECT')` },
      mysqlNote: 'MySQL なら `GRANT SELECT, INSERT, UPDATE ON library.books TO \'lib_librarian\'@\'%\';` と書きます。MySQL には `ON library.*`（DB内の全表・将来の表も含む）という強力なワイルドカードがあり、PostgreSQL には表名ワイルドカードがありません（スキーマ単位なら `ON ALL TABLES IN SCHEMA public`）。TRUNCATE は MySQL では DROP 権限で判定されます（TRUNCATE 権限というものはない）。REFERENCES 権限（他表から外部キーを張る許可）は MySQL にもあります。' },
    { id: 'ch10-05', title: 'アプリには列単位まで絞る', session: 'A',
      story: '次は貸出アプリ用の口座 lib_app です。アプリは「本を探す・会員の氏名とIDを見る・貸出を記録する」だけできてよい。会員のメールアドレスは個人情報として渡しません。',
      explanation: `## 列権限（column privileges）\nPostgreSQL は表単位より細かく、**列単位**で SELECT を与えられます。\n\n\`\`\`sql\nGRANT SELECT (member_id, name) ON public.members TO lib_app;\n\`\`\`\n\nこの1文だけだと:\n- \`SELECT member_id, name FROM members\` — 読める\n- \`SELECT email FROM members\` — **42501（permission denied for table members）**\n- \`SELECT * FROM members\` — 同じく拒否（\`*\` は email を含むため）\n\n表単位の SELECT は**与えない**点に注意してください。列権限は表権限と独立で、表単位 SELECT を与えると全列が見えてしまいます。\n\nアプリへの割り当てはこうなります:\n\n| 対象 | 権限 |\n|---|---|\n| categories, authors, books, book_authors, copies | SELECT（カタログ参照） |\n| members | SELECT (member_id, name) の**列限定** |\n| loans | SELECT, INSERT, UPDATE（貸出の記録と返却処理） |\n\n## なぜ実務でこうするか\n個人情報の「アプリに渡してよい列」を正面から宣言するためです。同じ目的は「絞ったビュー（member_id と name だけのビュー）」でも達成できます。列権限はビューを作らずに済む軽量な手段で、管理するオブジェクトが増えない利点があります（ビューはスキーマが見通しやすくなる利点。チームで方針を決めます）。個人情報保護の観点で「とりあえず全列 SELECT」は監査で説明できないので、実務では必ずこのどちらかで絞ります。`,
      task: 'lib_app に、5つのカタログ表への SELECT、members の member_id と name の2列だけへの SELECT、loans への SELECT/INSERT/UPDATE を与えてください（表単位の members SELECT は与えない）。',
      hints: ['5つのカタログ表は categories, authors, books, book_authors, copies です。', 'GRANT SELECT (member_id, name) ON public.members TO lib_app; が列権限の書き方です。', 'loans には SELECT, INSERT, UPDATE の3つです（DELETE なし）。'],
      solution: `GRANT SELECT ON public.categories, public.authors, public.books, public.book_authors, public.copies TO lib_app;
GRANT SELECT (member_id, name) ON public.members TO lib_app;
GRANT SELECT, INSERT, UPDATE ON public.loans TO lib_app;`,
      check: { type: 'sql', sql: `SELECT has_table_privilege('lib_app', 'public.copies', 'SELECT')
  AND NOT has_table_privilege('lib_app', 'public.members', 'SELECT')
  AND has_column_privilege('lib_app', 'public.members', 'member_id', 'SELECT')
  AND has_column_privilege('lib_app', 'public.members', 'name', 'SELECT')
  AND NOT has_column_privilege('lib_app', 'public.members', 'email', 'SELECT')
  AND has_table_privilege('lib_app', 'public.loans', 'SELECT')
  AND has_table_privilege('lib_app', 'public.loans', 'INSERT')
  AND has_table_privilege('lib_app', 'public.loans', 'UPDATE')
  AND NOT has_table_privilege('lib_app', 'public.loans', 'DELETE')` },
      mysqlNote: 'MySQL にも列権限があります: `GRANT SELECT (member_id, name) ON library.members TO \'lib_app\'@\'%\';` — 全く同じ考え方です。SHOW GRANTS で列権限つきの付与が表示されます。PostgreSQL も MySQL も、権限の変更は既存接続には即時反映されず次の接続から完全に有効になる点は同じです。' },
    { id: 'ch10-06', title: '閲覧者として入ってみる（継承の確認）', session: 'B',
      connect: { B: { user: 'lib_sato', password: 'lib_sato_pw', database: 'library' } },
      story: '設計した権限は、実際にその人の口座で入って確かめてこそです。まずは閲覧者の佐藤さん（lib_sato、lib_reader のメンバー）。セッション B を佐藤さんの口座に切り替えます。',
      explanation: `## 継承された権限で動く\nlib_sato には何も直接 GRANT していません。それでも lib_reader のメンバーシップを通じて、カタログ表の SELECT と CONNECT/USAGE が**継承**されて働きます（PostgreSQL 16 以降、メンバーシップは既定で継承 ON）。\n\nガイドに沿って3つの SQL を実行してください:\n1. books 表の SELECT — 継承した権限で読める\n2. v_book_catalog ビューの SELECT — ビュー経由でも読める\n3. loans の SELECT — **42501 で拒否**されるはず\n\n## 42501 の読み方\n\`permission denied for table loans\` は「現在のロール（とその継承元すべて）を探したが、その表のその操作の権限がどこにも無かった」の意味です。エラーは「誰が・何に・なぜ」を必ず教えてくれるので、実務ではこのメッセージを手がかりに「本当に業務上必要か」を疑うのが正しい流れです（必要なら権限変更の申請、不要ならそのまま）。`,
      task: '「指定の接続に切り替え」でセッション B を lib_sato にして、ガイドの3つの SQL を順に実行してください（3つ目は拒否されることを確認します）。',
      hints: ['接続の切り替えはボタン、SQL はガイドの「このSQLを挿入」から1つずつ実行します。', '1つ目と2つ目は結果が返り、3つ目はエラーパネルに SQLSTATE 42501 が出ます。', '自分が誰で接続しているかは SELECT current_user; でも確認できます。'],
      solution: `SELECT current_user AS account;
SELECT book_id, title FROM public.books ORDER BY book_id LIMIT 3;
SELECT book_id, title, category_name FROM public.v_book_catalog ORDER BY book_id LIMIT 3;
SELECT loan_id, member_id FROM public.loans ORDER BY loan_id LIMIT 3;`,
      replay: '',
      script: [
        { session: 'B', sql: 'SELECT current_user AS account', expect: 'ok', note: '佐藤さん（lib_sato）として入っています。' },
        { session: 'B', sql: 'SELECT book_id, title FROM public.books ORDER BY book_id LIMIT 3', expect: 'ok', note: 'books は直接の GRANT ではなく lib_reader からの継承で読めます。' },
        { session: 'B', sql: 'SELECT book_id, title, category_name FROM public.v_book_catalog ORDER BY book_id LIMIT 3', expect: 'ok', note: 'ビュー v_book_catalog の SELECT も継承しています。' },
        { session: 'B', sql: 'SELECT loan_id, member_id FROM public.loans ORDER BY loan_id LIMIT 3', expect: { errorCode: '42501' }, note: '貸出記録は閲覧者の業務外。SQLSTATE 42501 で拒否されます。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL なら `SHOW GRANTS FOR \'lib_sato\'@\'%\';` で付与一覧を確認します。権限不足のエラーは MySQL では `ERROR 1142 (42000): SELECT command denied` の形式で、PostgreSQL の SQLSTATE 42501 に相当します。MySQL のエラーは番号文化（1xxx〜8xxx）で、PostgreSQL は SQLSTATE のクラスで意味が読める（42 = 権限・名前の問題）のが違いです。' },
    { id: 'ch10-07', title: '司書として貸出を記録する', session: 'B',
      connect: { B: { user: 'lib_tanaka', password: 'lib_tanaka_pw', database: 'library' } },
      story: '次は司書の田中さん（lib_tanaka、lib_librarian のメンバー）。「貸出を登録する」業務が、与えた権限だけで本当に完結するかを確かめます。',
      explanation: `## INSERT が動くとき・動かないとき\n田中さんに与えたのは業務7表への SELECT/INSERT/UPDATE です。貸出の登録（loans への INSERT）を、BEGIN 〜 ROLLBACK で囲んで実験します（実験なので必ず取り消します）。\n\nINSERT が無事に動くには、目に見える権限以外に:\n- 7章で作ったトリガー check_loan_available が内側で実行する「copies の SELECT ... FOR UPDATE」\n- その後の「copies の UPDATE」（status を loaned へ）\n\nが必要です。司書は copies も UPDATE できるので通ります。ここまでにシーケンス（採番機）への権限は**1つも与えていません**が、IDENTITY 列の既定値による採番は表の所有者の権限で評価されるため、INSERT は黙って動きます。\n\n## 動かないのは「明示的に採番を書く」とき\n最後のガイドで \`SELECT nextval('public.loans_loan_id_seq');\` を試してください。こちらは **SQL の中で直接シーケンスを触る**ので、実行するロール自身の USAGE 権限が必要です → 42501（permission denied for sequence）。\n\n## なぜ実務でこうするか\n「表への INSERT を許可したのに動かない／動きすぎる」は権限設計の頻出事故です。レガシーの serial + nextval 直叩きで書かれたアプリ（ORM が明示採番する構成を含む）を移行するとき、シーケンスの USAGE 忘れで INSERT が全部落ちる、は定番の移行トラブルです。どう採番するか（IDENTITY 既定値か、nextval 直叩きか）で**必要な権限が変わる**ことを覚えておいてください。`,
      task: 'セッション B を田中さん（lib_tanaka）に切り替え、貸出を1件登録してすぐ取り消す実験をし、最後に明示採番 nextval が拒否されることを確認してください。',
      hints: ['実験は BEGIN で始めて ROLLBACK で閉じます（borrow の記録は残しません）。', 'INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (1, 1, CURRENT_DATE + 14) の形で入ります。', '最後の SELECT nextval(...) は権限が無いので 42501 になるはずです。'],
      solution: `BEGIN;
INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (1, 1, CURRENT_DATE + 14) RETURNING loan_id, copy_id, member_id;
ROLLBACK;
SELECT nextval('public.loans_loan_id_seq') AS next_loan_id;`,
      replay: '',
      script: [
        { session: 'B', sql: 'BEGIN', expect: 'ok', note: '実験なのでトランザクションで囲みます。' },
        { session: 'B', sql: 'INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (1, 1, CURRENT_DATE + 14) RETURNING loan_id, copy_id, member_id', expect: 'ok', note: 'トリガー内の copies への FOR UPDATE / UPDATE も司書の権限で通ります。' },
        { session: 'B', sql: 'ROLLBACK', expect: 'ok', note: '実験した貸出を取り消します。' },
        { session: 'B', sql: "SELECT nextval('public.loans_loan_id_seq') AS next_loan_id", expect: { errorCode: '42501' }, note: 'SQL で直接シーケンスを触るには USAGE 権限が必要です。まだ与えていません。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL の AUTO_INCREMENT は採番機構が表に内蔵されていて「シーケンスという別オブジェクト」が存在しないため、採番のために追加の権限は不要です（PostgreSQL の IDENTITY が近い挙動）。採番後の値の取得は LAST_INSERT_ID() を使います。MariaDB にはシーケンスオブジェクトがありますが、MySQL 8.0 にはありません。採番位置の調整は ALTER TABLE ... AUTO_INCREMENT = n で行います。' },
    { id: 'ch10-08', title: 'シーケンス権限を与える', session: 'A',
      story: '前のステップで、明示的な採番には USAGE が必要だと体感しました。業務で必要な役割にだけ、採番機の権限を与えます。保守作業（採番位置の巻き戻し）は館長だけ。',
      explanation: `## シーケンスは独立したオブジェクト\nIDENTITY の裏側にある採番機は、pg_class に並ぶ**独立したオブジェクト**で、権限も表とは別に管理します。\n\n- **USAGE** — nextval() で番号を取れる\n- **SELECT** — currval() や pg_sequences などで状態を読める\n- **UPDATE** — setval() で採番位置を操作できる（保守用）\n\nこの教材の割り当て:\n\n| ロール | 権限 | 対象 |\n|---|---|---|\n| lib_director | USAGE, SELECT, UPDATE | 業務6シーケンス（保守含む） |\n| lib_librarian | USAGE, SELECT | 業務6シーケンス |\n| lib_app | USAGE, SELECT | loans のシーケンスだけ |\n\n業務6シーケンス = categories / authors / books / copies / members / loans の各 ID 列の採番機です（book_authors は複合主キーで採番なし）。\n\n## なぜ実務でこうするか\nシーケンスの UPDATE（setval）は採番位置を巻き戻せる、つまり**既存の主キーと衝突する重複 ID を生める**操作です。これは整合性を壊しかねないので、データ保守を担う役職（この教材では館長グループ）にだけ与えます。「保守操作は保守役だけ」も権限設計の基本パターンです。`,
      task: '6つの業務シーケンス（categories/authors/books/copies/members/loans の ID 採番）に、lib_director へ USAGE/SELECT/UPDATE、lib_librarian へ USAGE/SELECT を与え、lib_app には loans のシーケンスだけ USAGE/SELECT を与えてください。',
      hints: ['シーケンス名は categories_category_id_seq の規則です（loans は loans_loan_id_seq）。', 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE ... TO ... の書き方です。', 'lib_app に与えるのは loans_loan_id_seq の1つだけです。'],
      solution: `GRANT USAGE, SELECT, UPDATE ON SEQUENCE
  public.categories_category_id_seq, public.authors_author_id_seq, public.books_book_id_seq,
  public.copies_copy_id_seq, public.members_member_id_seq, public.loans_loan_id_seq TO lib_director;
GRANT USAGE, SELECT ON SEQUENCE
  public.categories_category_id_seq, public.authors_author_id_seq, public.books_book_id_seq,
  public.copies_copy_id_seq, public.members_member_id_seq, public.loans_loan_id_seq TO lib_librarian;
GRANT USAGE, SELECT ON SEQUENCE public.loans_loan_id_seq TO lib_app;`,
      check: { type: 'sql', sql: `SELECT has_sequence_privilege('lib_yamada', 'public.loans_loan_id_seq', 'UPDATE')
  AND has_sequence_privilege('lib_tanaka', 'public.loans_loan_id_seq', 'USAGE')
  AND has_sequence_privilege('lib_tanaka', 'public.loans_loan_id_seq', 'SELECT')
  AND NOT has_sequence_privilege('lib_tanaka', 'public.loans_loan_id_seq', 'UPDATE')
  AND has_sequence_privilege('lib_app', 'public.loans_loan_id_seq', 'USAGE')
  AND has_sequence_privilege('lib_app', 'public.loans_loan_id_seq', 'SELECT')
  AND NOT has_sequence_privilege('lib_app', 'public.members_member_id_seq', 'USAGE')
  AND has_sequence_privilege('lib_tanaka', 'public.books_book_id_seq', 'USAGE')` },
      mysqlNote: '前のステップのとおり、MySQL にはシーケンスオブジェクト（とその権限）がありません。AUTO_INCREMENT の巻き戻しは ALTER TABLE ... AUTO_INCREMENT = n で行い、これには表への ALTER 権限が必要です。「保守操作は保守役だけ」という考え方自体は MySQL でも同じで、ALTER 権限を一般ロールに渡さない運用にします。' },
    { id: 'ch10-09', title: '採番できるが、巻き戻しはできない', session: 'B',
      connect: { B: { user: 'lib_tanaka', password: 'lib_tanaka_pw', database: 'library' } },
      story: '権限を与えた後は、やはり本人の口座で確認します。田中さんは採番を取れるようになった。では採番位置を巻き戻すことはできるでしょうか。',
      explanation: `## USAGE と UPDATE の境目\nガイドの2つを実行してください:\n1. \`SELECT nextval('public.loans_loan_id_seq');\` — 前ステップで与えた USAGE で**動く**ようになりました（番号が1つ進みます）。\n2. \`SELECT setval('public.loans_loan_id_seq', 100, true);\` — 採番位置の操作なので **UPDATE** 権限が必要 → 司書は持っていないので **42501（permission denied for sequence）**。\n\n権限の失敗は変更を行わないので、setval の拒否によって採番位置は動きません。\n\n## なぜ実務でこうするか\n「読める・使える」と「再構成できる」は別の信頼レベルです。番号を取る（USAGE）は日常業務、採番位置を操作する（UPDATE）はデータ移行や障害復旧の保守作業です。失敗の影響範囲が全然違うので、権限も分けます。アプリ・司書は日常業務ぶんだけ、という割り切りです。`,
      task: 'セッション B を田中さんに切り替え、nextval が通ることと setval が拒否されることを確認してください。',
      hints: ['1つ目は SELECT nextval(...) です。実行すると番号が返ります。', '2つ目は SELECT setval(...) で、42501 になるはずです。', '接続は前ステップと同じ lib_tanaka です（ボタンで切り替えてください）。'],
      solution: `SELECT nextval('public.loans_loan_id_seq') AS next_loan_id;
SELECT setval('public.loans_loan_id_seq', 100, true) AS reset_to;`,
      replay: '',
      script: [
        { session: 'B', sql: "SELECT nextval('public.loans_loan_id_seq') AS next_loan_id", expect: 'ok', note: 'USAGE を与えたので採番を取れるようになりました。' },
        { session: 'B', sql: "SELECT setval('public.loans_loan_id_seq', 100, true) AS reset_to", expect: { errorCode: '42501' }, note: '採番位置の操作は UPDATE 権限が必要です。司書には与えていません。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL ではこの区別がそもそも成立しません（採番位置の操作は ALTER TABLE ... AUTO_INCREMENT のみ）。PostgreSQL で IDENTITY を使っている場合、シーケンスは「システム所有」で、ユーザーが直接 setval する場面は旧 serial 表からの移行時などに限られます。' },
    { id: 'ch10-10', title: '関数の EXECUTE を絞る', session: 'A',
      story: '7章で calc_late_fee や return_loan を作りました。調べると、PostgreSQL の関数は既定で「全員が実行できる」状態です。内部に更新が入る手続きが全員実行できるのは怖い。閉めて、必要なロールにだけ開けます。',
      explanation: `## 関数は既定で PUBLIC に開いている\n表やシーケンスと逆で、PostgreSQL の関数・プロシージャは**作った瞬間に PUBLIC に EXECUTE が付く**のが既定です。誰でも \`calc_late_fee(81)\` を呼べてしまう状態です。\n\n\`\`\`sql\nREVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;\nGRANT EXECUTE ON PROCEDURE public.return_loan(integer, date) TO lib_app;\n\`\`\`\n\n- \`ALL ROUTINES\` は関数（FUNCTION）とプロシージャ（PROCEDURE）の両方を指します。\`ALL FUNCTIONS IN SCHEMA\` だけだと**プロシージャが対象から漏れる**ので注意してください（ここは実務でも引っかかるポイントです）。\n- 再付与は「必要なロールにだけ」。返却処理を行うアプリに return_loan だけを明示します。\n\n## なぜ実務でこうするか\n「実行できる」は「その内部で定義者・実行者の権限を使って何かが起きる」ことです。特に PL/pgSQL のトリガー関数や管理用関数は、意図しない呼び出し経路になりえます。まず全員から奪ってから必要な人に与える（デフォルト拒否の原則）は、関数に限らず権限管理の基本姿勢です。\n\n呼び出し側の権限確認は has_function_privilege で、採点でもこの関数を使います。`,
      task: 'public スキーマの全ルーチンから PUBLIC の EXECUTE を取り上げ、return_loan(integer, date) の実行だけを lib_app に与えてください。',
      hints: ['REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC; が1つ目です。', 'プロシージャへの再付与は GRANT EXECUTE ON PROCEDURE public.return_loan(integer, date) TO lib_app; です。', '引数型まで正確に書く必要があります（integer, date）。'],
      solution: `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE public.return_loan(integer, date) TO lib_app;`,
      check: { type: 'sql', sql: `SELECT has_function_privilege('lib_app', 'public.return_loan(integer, date)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.return_loan(integer, date)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.calc_late_fee(integer)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.check_loan_available()', 'EXECUTE')
  AND NOT has_function_privilege('lib_tanaka', 'public.calc_late_fee(integer)', 'EXECUTE')` },
      mysqlNote: 'MySQL は `GRANT EXECUTE ON PROCEDURE library.return_loan TO \'lib_app\'@\'%\';` と同じ形です。ただし MySQL には「既定で全員に実行を許す」挙動がないので、REVOKE の出番は PostgreSQL ほど多くありません（PostgreSQL の関数は PUBLIC に開くのが既定、MySQL は誰にも付与されないのが既定）。また MySQL のルーチンは既定で DEFINER 権限（定義者の権限）で動き、PostgreSQL は既定で INVOKER（呼び出し者の権限）です。この既定の差は次のステップでも効いてきます。' },
    { id: 'ch10-11', title: 'アプリとして入ってみる', session: 'B',
      connect: { B: { user: 'lib_app', password: 'lib_app_pw', database: 'library' } },
      story: 'いよいよ貸出アプリの口座 lib_app で入ります。アプリに必要な「検索・会員照会・貸出参照」が、列単位に絞った権限だけで動くことを確認します。',
      explanation: `## 許されたことだけが静かに動く\nlib_app は CONNECT/USAGE、カタログ5表の SELECT、members の2列 SELECT、loans の SELECT/INSERT/UPDATE を持っています。ガイドの3つを実行してください:\n1. books の SELECT — カタログ参照\n2. members の member_id, name の SELECT — **列権限**で許された2列だけ読める\n3. loans の未返却 SELECT — 業務記録の参照\n\n2つ目で \`SELECT email FROM members\` に書き換えると即 42501 になります（試しても構いません）。\n\nこの時点では後のステップで有効化する行レベルセキュリティ（RLS）がまだ無いので、members の行は**全員ぶん**見えます。「誰の行が見えるか」の制御は列権限とは別の層として、この章の最後に足します。\n\n## なぜ実務でこうするか\nアプリ口座は「SQL を送れる人」の中で最も漏れやすい存在です（外部入力が流れ込む）。だからこそ人間の口座より更に絞るのが原則で、実務では「アプリは SELECT できる列・書ける表を契約として明示」します。この一覧がそのままセキュリティレビューの資料になります。`,
      task: 'セッション B を lib_app に切り替え、3つの SELECT（カタログ・会員の2列・貸出）が動くことを確認してください。',
      hints: ['「指定の接続に切り替え」で lib_app / lib_app_pw / library に接続します。', 'members は SELECT member_id, name FROM ... の形だけが許されます。', '3つとも結果が返れば OK です。'],
      solution: `SELECT book_id, title, price FROM public.books ORDER BY book_id LIMIT 3;
SELECT member_id, name FROM public.members ORDER BY member_id LIMIT 3;
SELECT loan_id, copy_id, member_id, due_on FROM public.loans WHERE returned_on IS NULL ORDER BY loan_id LIMIT 3;`,
      replay: '',
      script: [
        { session: 'B', sql: 'SELECT current_user AS account', expect: 'ok', note: 'アプリ口座 lib_app として入っています。' },
        { session: 'B', sql: 'SELECT book_id, title, price FROM public.books ORDER BY book_id LIMIT 3', expect: 'ok', note: 'カタログ表は SELECT を持っています。' },
        { session: 'B', sql: 'SELECT member_id, name FROM public.members ORDER BY member_id LIMIT 3', expect: 'ok', note: 'members は member_id と name の2列だけ。email は列権限にありません。' },
        { session: 'B', sql: 'SELECT loan_id, copy_id, member_id, due_on FROM public.loans WHERE returned_on IS NULL ORDER BY loan_id LIMIT 3', expect: 'ok', note: '貸出の参照は業務として許されています。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL なら SHOW GRANTS FOR \'lib_app\'@\'%\'; で「列権限つきの SELECT」が表示されます。PostgreSQL との違いは、列権限の指定方法（PG は GRANT SELECT (列) 構文、MySQL は同じく GRANT SELECT (列) 構文でほぼ同一）より、権限の保存場所（PG は各オブジェクトの ACL、MySQL は mysql スキーマの付与テーブル）と、確認方法（SHOW GRANTS vs information_schema.COLUMN_PRIVILEGES）です。' },
    { id: 'ch10-12', title: 'アプリが壁にぶつかる場所', session: 'B',
      connect: { B: { user: 'lib_app', password: 'lib_app_pw', database: 'library' } },
      story: 'アプリに「貸出を登録する」権限は与えました。しかし実際に書き込もうとすると、権限の層が何重にも効いて拒否されます。「GRANT したのに動かない」の実態を、3つの失敗で体感します。',
      explanation: `## 3つの 42501 は、それぞれ違う理由\nガイドを実行すると、どれも SQLSTATE 42501 ですが、メッセージの「対象」と CONTEXT が違います。\n\n1. **email の SELECT** — 「permission denied for table members」。列権限に email が無いため。列の境界です。\n2. **loans への INSERT** — loans の INSERT 権限自体はありますが、7章のトリガー check_loan_available が内側で実行する \`SELECT ... FOR UPDATE\` が copies の **UPDATE 権限**を必要とします（FOR UPDATE は更新用の行ロック）。持っていないので「permission denied for **table copies**」で止まります。エラーの CONTEXT にトリガー関数が表示されるのが証拠です。\n3. **CALL return_loan** — EXECUTE は10ステップで与えました。しかしプロシージャ本体は SECURITY INVOKER（7章で定義）なので、本体の UPDATE copies が同じく拒否されます。\n\n## なぜ実務でこうするか、そしてどう解くか\n「権限は表 → 列 → トリガー/ルーチンの内部 → 行（この章の最後のRLS）」と**層**になっているので、1つの GRANT で動くかは層全体で決まります。実務での解き方は主に3つ:\n- 更新ロジックを**必要最小の SECURITY DEFINER プロシージャに閉じ込める**（アプリは EXECUTE だけ持つ。定義側で search_path を固定し入力を検証する）\n- トリガーが触る列だけ**列権限 UPDATE (status) ON copies** を与える\n- そもそもアプリに書かせず、人間の口座で行う業務分担にする\n\nこの教材の契約では、アプリは参照と予約（12章）に限り、蔵書の状態更新は行わない方針＝3つ目を採ります。 return_loan を lib_app に EXECUTE したのは「EXECUTE だけでは足りない」この体験の伏線でした。`,
      task: 'lib_app のまま、3つの拒否（email 参照・貸出登録・返却手続き）を確認してください。どれも失敗して何も変更しないことを確認します。',
      hints: ['1つ目は SELECT email FROM public.members WHERE member_id = 1 です。', '2つ目は INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (1, 1, CURRENT_DATE + 14) です。', '3つ目は CALL public.return_loan(81) です。すべて 42501 で失敗します。'],
      solution: `SELECT email FROM public.members WHERE member_id = 1;
INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (1, 1, CURRENT_DATE + 14);
CALL public.return_loan(81);`,
      replay: '',
      script: [
        { session: 'B', sql: 'SELECT email FROM public.members WHERE member_id = 1', expect: { errorCode: '42501' }, note: 'members の email は列権限にありません（permission denied for table members）。' },
        { session: 'B', sql: 'INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (1, 1, CURRENT_DATE + 14)', expect: { errorCode: '42501' }, note: 'loans への INSERT 権限はありますが、トリガー内の SELECT ... FOR UPDATE が copies の UPDATE 権限を必要として拒否されます（permission denied for table copies）。' },
        { session: 'B', sql: 'CALL public.return_loan(81)', expect: { errorCode: '42501' }, note: 'EXECUTE はありますが、本体は SECURITY INVOKER なので内部の UPDATE copies が拒否されます。' },
      ],
      check: { type: 'script' },
      mysqlNote: 'MySQL のストアドルーチンは既定で DEFINER 権限で動くため、「EXECUTE だけ持つアプリが PROCEDURE を呼んで内部の更新が成功する」のが自然な挙動です（PostgreSQL の INVOKER 既定と逆）。つまり PostgreSQL で SECURITY DEFINER プロシージャを作る運用は、MySQL の感覚に近づける方向です。MySQL で DEFINER ルーチンを作るときは SQL SECURITY と binlog の制約（log_bin_trust_function_creators）に注意します。' },
    { id: 'ch10-13', title: '未来の表への権限（DEFAULT PRIVILEGES）', session: 'A',
      story: 'ここまでの GRANT は「今ある表」への付与です。来月、集計用の表を追加したら、その瞬間に司書が読めない — 権限漏れの事故になります。「これから作る表」への既定をあらかじめ決めます。',
      explanation: `## ALTER DEFAULT PRIVILEGES\n\`\`\`sql\nALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public\n  GRANT SELECT, INSERT, UPDATE ON TABLES TO lib_librarian;\nALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public\n  GRANT SELECT ON TABLES TO lib_reader;\nALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public\n  GRANT USAGE, SELECT ON SEQUENCES TO lib_librarian;\n\`\`\`\n\n読み方は「**dojo_learner が** public スキーマに表を作ったら、その表に自動で lib_librarian へ SELECT/INSERT/UPDATE（と lib_reader へ SELECT）を付けろ」です。\n\n- FOR ROLE に注目 — 「誰が作ったとき」の既定です。この教材では表を作るのが学習用の作業アカウントなので dojo_learner を指定します。\n- 表（TABLES）とシーケンス（SEQUENCES）は別の既定です。\n- 12章の予約表は、このおかげで CREATE TABLE した瞬間に司書が使えるようになります。\n\n## なぜ実務でこうするか\n権限漏れの多くは「表を追加した人が GRANT を忘れる」ことで起きます。追加時の権限を既定に巻き込むと、忘れようがなくなる。\n\n一方で「将来の表はすべて閲覧者に公開してよいか」は慎重に検討する業務判断です。この教材では契約として SELECT を付与しますが、公開したくない表（職員の勤務データなど）は**別スキーマに置く**か、作成後に個別に REVOKE する運用が実務の定番です。既定は「業務の原則」を表すべきで、例外は例外として管理します。`,
      task: 'dojo_learner が public スキーマに作る表への既定権限として、lib_librarian に SELECT/INSERT/UPDATE、lib_reader に SELECT、シーケンスには lib_librarian に USAGE/SELECT を設定してください。',
      hints: ['ALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public GRANT ... ON TABLES TO ...; の形です。', '3文書きます（表×2、シーケンス×1）。', '閲覧者には SELECT だけです。'],
      solution: `ALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO lib_librarian;
ALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public
  GRANT SELECT ON TABLES TO lib_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE dojo_learner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lib_librarian;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE r.rolname = 'dojo_learner' AND n.nspname = 'public' AND d.defaclobjtype = 'r'
    AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) x JOIN pg_roles g ON g.oid = x.grantee
      WHERE g.rolname = 'lib_librarian' AND x.privilege_type IN ('SELECT','INSERT','UPDATE'))
    AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) x JOIN pg_roles g ON g.oid = x.grantee
      WHERE g.rolname = 'lib_librarian' AND x.privilege_type = 'DELETE')
    AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) x JOIN pg_roles g ON g.oid = x.grantee
      WHERE g.rolname = 'lib_reader' AND x.privilege_type = 'SELECT')) = 1
  AND (SELECT count(*) FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE r.rolname = 'dojo_learner' AND n.nspname = 'public' AND d.defaclobjtype = 'S'
    AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) x JOIN pg_roles g ON g.oid = x.grantee
      WHERE g.rolname = 'lib_librarian' AND x.privilege_type IN ('USAGE','SELECT'))) = 1` },
      mysqlNote: 'MySQL に「将来作るオブジェクトへの既定権限」機能はありません。実務では `GRANT SELECT, INSERT, UPDATE ON library.* TO \'lib_librarian\'@\'%\';` の**DB単位ワイルドカード**が同等の役割（追加した表が自動的にカバーされる）を果たします。PostgreSQL に表名ワイルドカードが無い代わりに ALTER DEFAULT PRIVILEGES がある、と対比すると理解しやすいです。ただし PG の既定権限は「誰が作るとき」まで指定できる点がより細かい。' },
    { id: 'ch10-14', title: '権限を見える化する（\\dp 相当）', session: 'A',
      story: 'ロール・表・列・シーケンス・関数・既定と、権限の設定がずいぶん多層になりました。この時点で「誰が何をできるか」を一覧で確認する術を身につけます。監査対応の基本技術です。',
      explanation: `## has_*_privilege 系の使い方\nPostgreSQL には「ロール × オブジェクト × 権限」を true/false で答える関数群があります:\n\n- has_table_privilege(ロール, 表, 権限) / has_column_privilege(ロール, 表, 列, 権限)\n- has_sequence_privilege / has_function_privilege / has_database_privilege / has_schema_privilege\n\n継承（グループのメンバーシップ）と PUBLIC が**展開された結果**で答えるのが便利な点です。\n\n\`\`\`sql\nSELECT r.rolname AS role, has_table_privilege(r.rolname, 'public.loans', 'INSERT') AS can_insert\nFROM pg_roles r WHERE r.rolname LIKE 'lib_%';\n\`\`\`\n\npsql の \\\\dp（表の権限一覧）や \\\\du（ロール一覧）は、裏でこの種のカタログを SELECT しているだけです（メタコマンドはこのエディタでは使えないので、問い合わせとして書けることが実務価値になります）。\n\nまた ACL そのものは \`aclexplode(relacl)\` で行に分解でき、\n\`\`\`sql\nSELECT grantee::regrole AS role, privilege_type\nFROM pg_class c, aclexplode(c.relacl)\nWHERE c.oid = 'public.loans'::regclass;\n\`\`\`\nのように「誰に何が直接付いているか」を取り出せます。実務の棚卸しでは、この問い合わせの結果を月次で保存して差分を見ます（権限の意図しない変化＝セキュリティインシデントの早期検知）。\n\n## なぜ実務でこうするか\n権限は「設定した瞬間」より「3ヶ月後」が問題になります。人事異動・緊急対応・試行錯誤の付与が積み重なって、誰も説明できない権限が溜まるのが実態です。定期的に機械的に一覧化して説明責任を果たす習慣が、権限管理の本体です。`,
      task: '4つの業務ロール（lib_director, lib_librarian, lib_reader, lib_app）について、members の SELECT・loans の INSERT/DELETE・members.email の SELECT・return_loan の EXECUTE・loans シーケンスの USAGE の、_has_privilege 系による一覧を作ってください（模範解答と同じ列構成で）。実行結果が採点対象です。',
      hints: ['FROM pg_roles r WHERE r.rolname IN (...) で4ロールに絞ります。', '列権限は has_column_privilege(rolname, 表, 列, 権限) です。', '関数は has_function_privilege(rolname, 関数名(引数型), 権限) で指定します。'],
      solution: `SELECT r.rolname AS role,
  has_table_privilege(r.rolname, 'public.members', 'SELECT') AS members_select,
  has_table_privilege(r.rolname, 'public.loans', 'INSERT') AS loans_insert,
  has_table_privilege(r.rolname, 'public.loans', 'DELETE') AS loans_delete,
  has_column_privilege(r.rolname, 'public.members', 'email', 'SELECT') AS email_select,
  has_function_privilege(r.rolname, 'public.return_loan(integer, date)', 'EXECUTE') AS return_loan_execute,
  has_sequence_privilege(r.rolname, 'public.loans_loan_id_seq', 'USAGE') AS loans_sequence_usage
FROM pg_roles AS r
WHERE r.rolname IN ('lib_director', 'lib_librarian', 'lib_reader', 'lib_app')
ORDER BY r.rolname
LIMIT 10;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT r.rolname AS role,
  has_table_privilege(r.rolname, 'public.members', 'SELECT') AS members_select,
  has_table_privilege(r.rolname, 'public.loans', 'INSERT') AS loans_insert,
  has_table_privilege(r.rolname, 'public.loans', 'DELETE') AS loans_delete,
  has_column_privilege(r.rolname, 'public.members', 'email', 'SELECT') AS email_select,
  has_function_privilege(r.rolname, 'public.return_loan(integer, date)', 'EXECUTE') AS return_loan_execute,
  has_sequence_privilege(r.rolname, 'public.loans_loan_id_seq', 'USAGE') AS loans_sequence_usage
FROM pg_roles AS r
WHERE r.rolname IN ('lib_director', 'lib_librarian', 'lib_reader', 'lib_app')
ORDER BY r.rolname
LIMIT 10` },
      mysqlNote: 'MySQL の棚卸しは `SHOW GRANTS FOR \'lib_app\'@\'%\';` が最速です。一括なら information_schema の SCHEMA_PRIVILEGES / TABLE_PRIVILEGES / COLUMN_PRIVILEGES が PostgreSQL の has_* 系に相当する情報源になります（MySQL には has_*_privilege 関数はありません）。PG は「継承込みで真偽を答える関数」がある点が記述しやすい。' },
    { id: 'ch10-15', title: '行レベルセキュリティ（RLS）で会員は自分の行だけ', session: 'A',
      story: '最後の層は「行」です。列権限で email は守りましたが、lib_app はまだ全員の member_id と name を読めます。マイページのような「自分の行だけ」を、データベース自身に守らせます。',
      explanation: `## ENABLE ROW LEVEL SECURITY とポリシー\n\`\`\`sql\nALTER TABLE public.members ENABLE ROW LEVEL SECURITY;\nCREATE POLICY members_self_policy ON public.members\n  FOR SELECT TO lib_app\n  USING (member_id = NULLIF(current_setting('app.member_id', true), '')::integer);\n\`\`\`\n\n- ENABLE すると、この表へのアクセスにポリシー判定が入ります。\n- FOR SELECT — 読み取りに適用（書き込みは WITH CHECK で別に定義できます）。\n- TO lib_app — このロールにだけ適用。\n- USING (...) — 行を「見せてよい」条件。ここでは「現在のセッション設定 app.member_id と member_id が一致する行」だけ。\n\ncurrent_setting('app.member_id', true) は自前の設定値（GUC）を読む関数で、第2引数 true は「未設定ならエラーにせず NULL」の意味。NULLIF で空文字も NULL に寄せ、NULL との比較は成立しないので「未設定ならどの行も見えない」になります。\n\n## 所有者とスーパーユーザーはどうなるか\n表の所有者（この教材では表を作る作業用アカウント dojo_learner）は RLS を素通りします（FORCE ROW LEVEL SECURITY を指定すると所有者にも適用）。アプリが採点・リセットに使うスーパーユーザー dojo_admin も常に素通りです。だからこの設定をしても、これまでの教材の動作は変わりません。\n\nもう1つ実務で重要な既定の挙動: **ポリシーが1つも当てはまらないロールは、行を1行も見られなくなります**。RLS は「その表に権限を持つ全ロール」に適用され、当てはまるポリシーが無ければ全行が拒否されます（エラーではなく0行）。この表では lib_librarian が SELECT を持っているのに members が読めなくなる、という変化が起きます。「RLS を ON にしたら別の業務が壊れた」は実務の定番事故なので、適用対象のロールを洗い出してからポリシーを設計します（司書向けに別のポリシーを作る、USING にロールを考慮した条件を書く、など）。\n\n## なぜ実務でこうするか、そしてこの設定の限界\nマルチテナント・マイページ・「本人のデータだけ」という要件の多くは、アプリ側の WHERE 句頼りではなく**データベースの行単位制御**で守るのが確実です（アプリの書き忘れがあっても出ません）。\n\nただし重要な注意が1つ。**app.member_id は誰でも SET できるただの設定値**なので、これ自体は認証ではありません。本番での定番は、アプリが認証を済ませた後に SET LOCAL（トランザクション内限定）で本人のIDを渡す、SECURITY DEFINER 関数の中だけで判定する、などの構成です。ここでは「行の可視性をDB側で決められる」という仕組みを学びます。\n\nなお、列権限と RLS は**別の層**です。lib_app は email 列を持たないまま（列権限）、行も自分ぶんだけ（RLS）見える、という直交した絞り込みになります。`,
      task: 'members で RLS を有効化し、lib_app に対して「app.member_id 設定値と member_id が一致する行だけ SELECT を許す」ポリシー members_self_policy を作ってください。',
      hints: ['ALTER TABLE public.members ENABLE ROW LEVEL SECURITY; が1つ目です。', 'CREATE POLICY members_self_policy ON public.members FOR SELECT TO lib_app USING (...); が2つ目です。', "USING の中は member_id = NULLIF(current_setting('app.member_id', true), '')::integer です。"],
      solution: `ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY members_self_policy ON public.members
  FOR SELECT TO lib_app
  USING (member_id = NULLIF(current_setting('app.member_id', true), '')::integer);`,
      check: { type: 'sql', sql: `SELECT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.members'::regclass)
  AND (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'members'
      AND policyname = 'members_self_policy' AND cmd = 'SELECT'
      AND cardinality(roles) = 1 AND roles[1] = 'lib_app') = 1
  AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members') = 1` },
      mysqlNote: 'MySQL 8.0 には行レベルセキュリティがありません。「本人の行だけ」を実装する定番は、絞り込んだビュー（CREATE VIEW my_members AS SELECT ... WHERE 会員ID = アプリ設定）をアプリに開放するか、アプリ側で必ず WHERE を付ける規約です。PostgreSQL のポリシーに近い機能は Oracle の VPD、SQL Server の Row-Level Security にあります。MySQL に移行する場合、RLS をビューで再現した表を設計図に残すことが移行作業の要になります。' },
    { id: 'ch10-16', title: 'lib_app でRLSを体験する', session: 'B',
      connect: { B: { user: 'lib_app', password: 'lib_app_pw', database: 'library' } },
      story: '設定が効いているか、当人の口座で確かめます。まず何も設定せずに members を数え、それから app.member_id を設定して読み直します。',
      explanation: `## 見えないだけ（エラーにならない）\nまず1つ目の SQL を実行してください:\n\n\`\`\`sql\nSELECT count(*)::int AS visible_members FROM public.members;\n\`\`\`\n\n**0行**が返るはずです。RLS のポリシーは、条件に合わない行を「存在しないかのように」黙って隠します（エラーではありません）。app.member_id を設定していないので NULL 比較となり、どの行も USING を通らないのです。\n\n次に設定して読みます:\n\n\`\`\`sql\nSET app.member_id = '1';\nSELECT member_id, name FROM public.members ORDER BY member_id;\n\`\`\`\n\nmember_id = 1 の**1行だけ**が見えます。列権限（email は不可）と RLS（自分の行だけ）が同時に効いていることも確認してください — SELECT * に変えると列権限の 42501 になります。\n\n## なぜ実務でこうするか\n「0行になる（黙る）」挙動は、存在を知られたくないデータ（他の会員の有無）を守るのに適しています。一方で SET は誰にでもできるので、この app.member_id は認証ではなく「アプリから受け渡された文脈」です。本番では SET LOCAL（トランザクション内だけ有効）や SECURITY DEFINER 関数で文脈を注入します。9章のトランザクションと、この章の関数権限（EXECUTE の絞り込み）が、その土台になる技術です。`,
      task: 'lib_app で members の行数を数え（0行）、app.member_id を 1 に設定して自分の行（1行）だけ読めることを確認してください。最後の SELECT の結果が採点対象です。',
      hints: ['まず SET せずに SELECT count(*) ... FROM public.members を実行します（0行）。', "SET app.member_id = '1'; を実行してから読み直します。", '最後は SELECT member_id, name FROM public.members ORDER BY member_id; です。'],
      solution: `SELECT count(*)::int AS visible_members FROM public.members;
SET app.member_id = '1';
SELECT member_id, name FROM public.members ORDER BY member_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT member_id, name FROM public.members WHERE member_id = 1 ORDER BY member_id LIMIT 1` },
      mysqlNote: 'MySQL にはカスタム GUC（current_setting で読む自前の設定値）に相当するものがなく、ユーザー変数 (@member_id) は接続単位で読み書きできますが権限と連動しません。MySQL でこの体験を再現するなら「ビューの WHERE に注入する値」をアプリ側で管理する形になります。' },
    { id: 'ch10-17', title: '章末: 作業用アカウントに戻し、状態を確認する', session: 'B',
      connect: { B: { user: 'admin', password: '', database: 'library' } },
      story: '権限の実験がすべて終わりました。アプリ口座のまま放置するのは実務では御法度（誰がいつどの口座で接続しているか分からなくなるため）。セッション B を作業用アカウントに戻して、章の成果を確認します。',
      explanation: `## 章末状態の確認\n「指定の接続に切り替え」で B を作業用アカウント（dojo_learner / library）に戻してください。SET app.member_id は接続ごとの設定なので、接続し直した時点で消えています（RLS は表の所有者である dojo_learner には素通りします）。\n\n\`\`\`sql\nSELECT current_user AS account, current_database() AS database;\nSELECT count(*)::int AS lib_roles FROM pg_roles WHERE starts_with(rolname, 'lib_');\n\`\`\`\n\n1文目は接続の確認です（作業用アカウント dojo_learner として library に戻っています）。採点は2文目の「この章で作った lib_ ロールが7つ揃っているか」で行います。\n\nこの章で作ったのは:\n- 7つの lib_ ロール（3グループ + 4ログイン）とメンバーシップ\n- PUBLIC からの REVOKE と、CONNECT/USAGE・表・列・シーケンス・関数の GRANT\n- DEFAULT PRIVILEGES（未来の表への既定）\n- members の RLS と members_self_policy\n\nつまり「誰が・どこまで・何をできるか」がデータベースに文書化された状態です。実務での引継ぎ書は、この章の GRANT 文の並びそのものです。\n\n次章は運用（バックアップ・リストア・監視）。権限とバックアップは「データを守る2本柱」です。`,
      task: 'セッション B を作業用アカウント（admin / library）に接続し直し、current_user で復帰を確認したうえで、lib_ ロールが7つ揃っていることを count で表示してください（最後の SELECT が採点対象です）。',
      hints: ['「指定の接続に切り替え」ボタンで B を admin / library に戻します。', 'SELECT current_user AS account, current_database() AS database; で接続を確認します。', "採点対象は SELECT count(*)::int AS lib_roles FROM pg_roles WHERE starts_with(rolname, 'lib_'); です。"],
      solution: `SELECT current_user AS account, current_database() AS database;
SELECT count(*)::int AS lib_roles FROM pg_roles WHERE starts_with(rolname, 'lib_');`,
      replay: '',
      check: { type: 'result-equals', expectedSql: `SELECT count(*)::int AS lib_roles FROM pg_roles WHERE starts_with(rolname, 'lib_')` },
      mysqlNote: 'mysql クライアントでは `connect user@host library`（または \\r）で再接続します。psql の \\c library と同じくセッション変数・一時的な設定はすべて消えて最初からやり直しになる点は MySQL も PostgreSQL も同じです。' },
  ],
}
export default chapter
