import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 1, title: 'DBとスキーマ作成', summary: 'library データベースを作り、接続先を切り替えて、スキーマで名前空間を分けます。',
  steps: [
    { id: 'ch01-01', title: 'library データベースを作る', database: 'postgres', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'postgres' } },
      story: '市立図書館にシステム担当として着任しました。紙の台帳と表計算ソフトで管理していた書籍・会員・貸出記録を PostgreSQL へ移すことが決まっています。初日の仕事は、図書館業務専用のデータベースを作ることです。',
      explanation: '## データベースは何を区切るものか\nPostgreSQL のサーバー（クラスター）の中には、複数の**データベース**を作れます。データベースどうしはデータも権限も完全に分離されていて、他のデータベースの表を直接見ることはできません。\n\n実務では「1つの用途につき1つのデータベース」が基本です。library 以外のシステム（例: 職員給与）が同じサーバーに載っていても、誤って図書館のデータを壊せないように分けておきます。\n\n## 今回の文\n```sql\nCREATE DATABASE library WITH ENCODING \'UTF8\' LOCALE \'C\' TEMPLATE template0;\n```\n- `ENCODING \'UTF8\'` — 文字コード。書名や著者名に日本語が入るので、世界標準の UTF8 を指定します。\n- `LOCALE \'C\'` — 文字の並べ替え規則。`C` は「バイト順で比較する」を意味し、OS の言語設定に依存しません。実務では、OS の照合順序ライブラリの更新でインデックスが壊れる事故が知られているため、アプリケーション用のデータベースでは `C` を選ぶことが多くなっています。\n- `TEMPLATE template0` — 雛形。既定の template1 には管理者が作ったオブジェクトが紛れ込むことがあるので、まっさらな template0 を使います。エンコーディングやロケールを既定から変えるときは template0 が必須です。\n\nCREATE DATABASE はトランザクションの中で実行できない（失敗しても途中で止める仕組みがない）ため、**必ず単独の文として実行**します。エディターで他の SQL と同じ送信に混ぜると `25001` エラーになります。',
      task: 'セッション A が postgres（サーバー管理用の既定データベース）に接続していることを確認して、library を作成してください。',
      hints: ['CREATE DATABASE データベース名; が基本形です。', "WITH ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0 を付けます。", 'CREATE DATABASE は必ず単独の文で実行します。他の文と一緒に送らないでください。'],
      solution: `CREATE DATABASE library WITH ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM pg_database WHERE datname = 'library') = 1
  AND (SELECT count(*) FROM pg_database WHERE datname = 'library' AND pg_encoding_to_char(encoding) = 'UTF8' AND datcollate = 'C' AND datctype = 'C') = 1` },
      mysqlNote: 'MySQL では `CREATE DATABASE library CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;` と書きます。MySQL にロケールの概念はなく、文字コード（CHARACTER SET）と照合順序（COLLATE）で指定します。`utf8mb4_bin` は PostgreSQL の `LOCALE \'C\'` に近い「コード順で比較」です。また MySQL では**データベースとスキーマが同じもの**（CREATE SCHEMA は CREATE DATABASE の別名）である点が大きな違いです。' },
    { id: 'ch01-02', title: 'データベースの一覧を確認する', database: 'postgres', session: 'A',
      story: '作れた気になっていても、確認なしには館長に報告できません。「本当にできたのか、一覧で見せて」と言われました。',
      explanation: '## 一覧はシステムカタログから\nPostgreSQL は自分自身の構成情報を**カタログ（システムカタログ）**という表で管理しています。データベースの一覧は `pg_database` カタログに入っています。\n\npsql の `\\l` でも同じ情報が出ますが、あれは psql が裏でカタログを SELECT しているだけです。GUI アプリやプログラムから操作するときはカタログの問い合わせが確実です（psql のメタコマンドはこのエディターでは使えません）。\n\n`pg_encoding_to_char(encoding)` は内部の番号を `UTF8` のような名前に変える関数、`datcollate` は照合順序の列です。',
      task: "pg_database を使って、名前が library で始まるデータベースについて、名前（datname）、エンコーディング（encoding）、照合順序（datcollate）の3列を名前順に表示してください。",
      hints: ["SELECT ... FROM pg_database WHERE datname LIKE 'library%'; が骨格です。", 'エンコーディングの内部番号は pg_encoding_to_char(encoding) で名前に変えます。', '列は datname、AS encoding、datcollate の3つをこの順に並べます。'],
      solution: `SELECT datname, pg_encoding_to_char(encoding) AS encoding, datcollate
FROM pg_database
WHERE datname LIKE 'library%'
ORDER BY datname;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT datname, pg_encoding_to_char(encoding) AS encoding, datcollate
FROM pg_database
WHERE datname LIKE 'library%'
ORDER BY datname` },
      mysqlNote: 'MySQL では `SHOW DATABASES;` が手軽です。同じ情報は `SELECT schema_name, default_character_set_name FROM information_schema.SCHEMATA;` でも取れます。「スキーマ＝データベース」なので、この一覧は PostgreSQL の pg_database とほぼ同じ役割です。' },
    { id: 'ch01-03', title: '練習用データベースを作る', database: 'postgres', session: 'A',
      story: '来月、館内の書籍データを本番投入する予定です。その前に、データベースの作成と削除を捨てられる環境で一度練習しておきましょう。誤操作の影響を考える訓練です。',
      explanation: '## 実験用データベース\n本番投入の前には、手順を試せる「捨てられる環境」を作るのが実務の定番です。名前は `library_scratch`（scratch = 書き捨て）のように、見た瞬間に実験用と分かるものにします。命名規則は「事故の入り口を減らす」ための地味で重要な工夫です。\n\nCREATE DATABASE はテンプレートをコピーするだけなので、1秒足らずで終わります。作成後はステップ02の一覧SQLで存在を確認できます。\n\n**CREATE DATABASE は単独の文で実行**してください。一覧の SELECT とは別の送信にします。',
      task: 'library_scratch を作成してください。存在確認は採点で行います。',
      hints: ['CREATE DATABASE に続けて名前を書くだけです。', 'オプション（ENCODING など）は今回は既定のままで構いません。', '一覧の SELECT と混ぜて送らないこと。'],
      solution: 'CREATE DATABASE library_scratch;',
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM pg_database WHERE datname = 'library') = 1
  AND (SELECT count(*) FROM pg_database WHERE datname = 'library_scratch') = 1` },
      mysqlNote: 'MySQL でも同じ `CREATE DATABASE library_scratch;` が使えます。既定の文字コードはサーバー設定を引き継ぐため、実務では `CHARACTER SET utf8mb4` を明示することが多いです。MySQL では database=schema なので、この操作がそのまま「名前空間の追加」になります。' },
    { id: 'ch01-04', title: 'DROP DATABASE の恐怖を知る', database: 'postgres', session: 'A',
      story: '練習が終わったので library_scratch はお片付けです。ついでに「削除とはどれほど強力な操作か」を、言葉でなく体験として把握しておきましょう。',
      explanation: '## DROP DATABASE は「全部消える」\n`DROP DATABASE library_scratch;` は、そのデータベース内の**すべての表・データ・インデックスをファイルごと消します**。確認の問い合わせもなく、ごみ箱もありません。誤って本番へ向けて実行したら、バックアップから戻すしかありません（バックアップは11章で学びます）。\n\n実務の安全策として覚えておくこと:\n- 自分が接続しているデータベースは削除できません（エラーで守られています）。他の接続が残っている場合、PostgreSQL 13 以降なら `WITH (FORCE)` で接続を強制切断して削除できます。強力な分だけ、使う場面と影響範囲を必ず確認します。\n- 削除できるのは所有者など権限を持つ役割だけです。\n- `DROP DATABASE IF EXISTS library_scratch;` と書くと、存在しなくてもエラーになりません。自動化スクリプトで便利な構文です。\n\n**DROP DATABASE も CREATE と同じく単独の文で実行**します。',
      task: 'library_scratch を削除してください。「library が残っていて library_scratch がない」ことまで採点で確認します。',
      hints: ['DROP DATABASE データベース名; です。', '削除対象は library ではなく library_scratch です。間違えないように名前を確認してから実行しましょう。'],
      solution: 'DROP DATABASE library_scratch;',
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM pg_database WHERE datname = 'library') = 1
  AND (SELECT count(*) FROM pg_database WHERE datname = 'library_scratch') = 0` },
      mysqlNote: 'MySQL の `DROP DATABASE` も表の定義とデータファイルを一括で削除し、同じく元に戻せません。PostgreSQL 13 以降の `WITH (FORCE)` に相当するオプションはありません。`IF EXISTS` は MySQL にもあります。database=schema のため、スキーマごと消えるという理解で正しいです。' },
    { id: 'ch01-05', title: 'library に接続する', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'library' }, B: { user: 'admin', password: '', database: 'library' } },
      story: 'library の準備が整いました。ここからは作業セッションを library に接続して中を作り込んでいきます。司書用の作業端末が2つ（セッション A / B）あるので、両方とも library に向けます。2つあるのは9章で「同時実行」を体験するためです。',
      explanation: '## 接続とは「誰が・どのデータベースに」\nPostgreSQL への接続は、ユーザーと**接続先データベース**の組で決まります。いまセッション A は管理用の postgres につながっています。このステップの「指定の接続に切り替え」ボタンを押すと、セッション A と B が両方 library に接続し直します。\n\npsql の `\\c library`、GUI ツールの接続設定、アプリケーションの接続文字列（`postgresql://user@host/library` など）がここに相当します。\n\n接続先が正しいかは `current_database()` で確認するのが定番です。うっかり別のデータベースに向いたまま作業すると、まったく別の環境を壊しかねません。実務では作業の最初に必ず確認します。',
      task: '「指定の接続に切り替え」ボタンで A・B 両方を library に接続してから、エディターで接続先データベース名を表示してください。列名は database とします。',
      hints: ['接続の切り替えはボタン、その後の SQL は SELECT current_database() ... です。', 'AS database を付けると列名が database になります。'],
      solution: 'SELECT current_database() AS database;',
      replay: '',
      check: { type: 'result-equals', expectedSql: 'SELECT current_database() AS database' },
      mysqlNote: 'MySQL の mysql クライアントでは `USE library;` で「既定のデータベース」を切り替えます（接続し直すのではなく、セッション内の設定を変えます）。接続先は `SELECT DATABASE();` で確認できます。JDBC などでは接続URLにデータベース名を含めます。' },
    { id: 'ch01-06', title: '検収用スキーマ staging を作る', session: 'A',
      story: '来月、市の総務課から書籍マスターの一覧を受け取ります。いきなり本番用の表に入れるのは怖いので、取込前データを置く「検収スペース」を library の中に用意しておきます。',
      explanation: '## スキーマはデータベースの中の名前空間\nデータベースの中はさらに**スキーマ**という名前空間に分かれます。表などのオブジェクトは必ず何かのスキーマに属していて、既定では `public` スキーマに入ります。\n\n実務の定番は、本番表を置く public と、取込前データを置く staging（=仕分け場）を分けることです。\n- 取り込んだデータが壊れていても本番表を汚さない\n- スキーマ単位で権限を絞れる（10章）\n- 「staging にだけある行」＝未検収、と機械的に判断できる\n\n`CREATE SCHEMA staging;` で作成します。中身が空でもスキーマは存在し続け、この教材では章をまたいで管理される「状態」の一部です。',
      task: 'library の中に staging スキーマを作成してください。',
      hints: ['CREATE SCHEMA スキーマ名; です。', 'public は最初から存在するので、新しく作るのは staging だけです。', '確認には information_schema.schemata が使えます。'],
      solution: `CREATE SCHEMA staging;
SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public', 'staging') ORDER BY schema_name;`,
      check: { type: 'sql', sql: "SELECT (SELECT count(*) FROM pg_namespace WHERE nspname = 'staging') = 1" },
      mysqlNote: 'MySQL に PostgreSQL の「スキーマ」はありません。**データベースがそのまま名前空間**です。PostgreSQL で staging スキーマに表を作る場面は、MySQL では `staging` という別のデータベースを作って `staging.表名` と書くことになります。PostgreSQL のスキーマは1つのデータベースの中にあるので、トランザクションやバックアップの単位をまたがずに密接に連携できます。MySQL でも同じサーバー内なら `db.表名` で結合できますが、PostgreSQL の「データベース」はより重い隔離単位で、別のデータベースを直接結合できません。' },
    { id: 'ch01-07', title: 'search_path を体験する', session: 'A',
      story: '検収スペースはできました。ところで、SQL にスキーマ名を書かずに表を作ると、どこにできるのでしょう。データを受け取る前に動作を確認しておきます。',
      explanation: '## search_path が名前解決を決める\n`SELECT * FROM books;` のようにスキーマ名を省略したとき、PostgreSQL は **search_path** に載っているスキーマを先頭から順に探します。既定は `"$user", public`（自分のユーザー名と同じ名前のスキーマ、なければ public）です。\n\n`SET search_path TO staging;` とすると、この接続では省略時の行き先が staging に変わります。省略して書けるのは便利ですが、「今どのスキーマを見ているか」を忘れると表の置き場所を間違える事故の元になります。実務では本番の SQL は `スキーマ名.表名` と明示するか、アプリ接続時に search_path を固定するのが安全です。\n\nまず SET してから表を作ると、`CREATE TABLE draft_books (...)` は staging 側に作られます。',
      task: 'search_path を staging に切り替え、draft_books 表（title text の1列）を作成し、1行入れてください。最後に「その表がどのスキーマにできたか」を information_schema.tables で確認します。',
      hints: ['SET search_path TO staging; を最初に実行します。', 'その後に CREATE TABLE draft_books (title text); と INSERT です。', '確認は information_schema.tables の table_schema / table_name 列で行います。'],
      solution: `SET search_path TO staging;
CREATE TABLE draft_books (title text);
INSERT INTO draft_books (title) VALUES ('図書館データブック 2025');
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'draft_books';`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'staging' AND table_name = 'draft_books') = 1` },
      mysqlNote: 'MySQL に search_path はありません。省略時の行き先は `USE` で選んだ「既定のデータベース」ただ1つで、そこになければエラーになります（候補リストを探す仕組みはない）。PostgreSQL の search_path は「候補を順に探せる」拡張版と考えると理解しやすいです。' },
    { id: 'ch01-08', title: '実験を片付けて既定に戻す', session: 'A',
      story: '動作確認が終わったので、練習用の表を片付けます。実験の後は共用スペースを元の状態に戻すのが、チームでシステムを扱う作法です。',
      explanation: '## 片付けと search_path の復元\n実験で作った staging.draft_books は削除します。削除時は **スキーマ名を明示**して `DROP TABLE staging.draft_books;` と書きます。search_path が staging のままでも確実に消せる、事故にくい書き方です。\n\nそして `SET search_path TO public;` で名前解決を既定に戻します。SET の効果はその接続が切れるまで続くため、切り替えっぱなしにすると次に作る表の置き場所を間違えます。「変えたら戻す」を徹底してください。\n\nstaging スキーマ自体は、今後のデータ取込のために空のまま残しておきます（章末の状態としても、library には public と空の staging だけが残ります）。',
      task: 'staging.draft_books を削除し、search_path を public に戻してください。最後に staging の表が0個になったことを確認します。',
      hints: ['DROP TABLE staging.draft_books; はスキーマ名つきで書きます。', 'SET search_path TO public; で既定に戻します。', '残っている表の数は information_schema.tables で数えられます。'],
      solution: `DROP TABLE staging.draft_books;
SET search_path TO public;
SELECT count(*)::int AS staging_tables FROM information_schema.tables WHERE table_schema = 'staging';`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'staging') = 0
  AND (SELECT count(*) FROM pg_namespace WHERE nspname = 'staging') = 1` },
      mysqlNote: 'MySQL でも同じく `DROP TABLE staging.draft_books;`（staging はデータベース名）で消せます。既定の戻しは `USE library;` です。PostgreSQL の search_path に相当するものがないため、「USE したら戻す」がそのまま同じ作法になります。' },
  ],
}
export default chapter
