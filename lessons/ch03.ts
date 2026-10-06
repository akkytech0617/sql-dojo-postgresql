import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 3, title: 'データ投入', summary: 'INSERT の基本から CSV 取込まで、canonical な初期データを入れます。',
  steps: [
    { id: 'ch03-01', title: '最初の1行を INSERT する', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'library' } },
      story: '開館準備が進み、新刊が届き始めました。まず登録するのは分類「文学」の1行です。ここでの登録方法が、この後の全データ投入の基本になります。',
      explanation: '## INSERT の基本形\n```sql\nINSERT INTO public.categories (name) VALUES (\'文学\');\n```\n- `INSERT INTO 表名 (列リスト) VALUES (値)` が基本形です。\n- **列リストは必ず書く**のが実務の作法です。省略すると「表の列順に並べた全列」の意味になり、列の追加・並べ替えで壊れる SQL になります。列リストを書けば、レビューでも「どの列に何を入れたか」が一目で分かります。\n- category_id を書いていない点に注目。ID 列（IDENTITY）には自動で連番が振られます。実行結果の `INSERT 0 1` は「1行追加」の意味です。\n\n確認のため、直後に SELECT を付けます。\n\n※ 注意: この教材の INSERT は学習用に厳密な値（canonical データ）を使います。誤って2回実行すると行が増えて採点に落ちるので、そのときはサイドバーの「章の最初からやり直す」で戻してください。',
      task: '分類「文学」を1行登録してください（category_id は自動採番）。最後に全行を ID 順に表示します。',
      hints: ['INSERT INTO public.categories (name) VALUES (\'文学\'); です。', 'category_id は書かない。IDENTITY が自動で振ります。', '確認は SELECT category_id, name FROM public.categories ORDER BY category_id;'],
      solution: `INSERT INTO public.categories (name) VALUES ('文学');
SELECT category_id, name FROM public.categories ORDER BY category_id;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.categories) = 1
  AND (SELECT count(*) FROM public.categories WHERE category_id = 1 AND name = '文学') = 1` },
      mysqlNote: 'INSERT 構文は MySQL でも同じで、AUTO_INCREMENT 列も同じように省略して自動採番できます。採番された ID は MySQL では LAST_INSERT_ID() で直後に取得します（PostgreSQL の RETURNING に相当する機能がありません。ステップ04で登場します）。' },
    { id: 'ch03-02', title: '複数行を1文で INSERT する', session: 'A',
      story: '分類は10種類登録する予定です。「歴史」と「科学」を続けて入れましょう。1行ずつ SQL を送るのは遅いので、1文でまとめます。',
      explanation: '## VALUES を並べる\n```sql\nINSERT INTO public.categories (name) VALUES (\'歴史\'), (\'科学\');\n```\nVALUES の後ろに括弧書きの行をカンマ区切りで並べると、1文で複数行入れられます。\n\n- **なぜ1文にするか**: アプリケーションから見ると1回の往復で済みます。100行を1行ずつ投入すると100往復、1文なら1往復です。実務では初回データ投入も、バッチ処理も、まとめられるものはまとめます。\n- **1文はアトミック**: 2行のうちどちらかで制約違反が出たら、**どちらも入りません**。片方だけ入る「中途半端な状態」が作れないのは重要な性質です（9章で深掘りします）。\n\n採番は上から順に振られます。この教材の canonical データでは「歴史」=2、「科学」=3 と決まっています。',
      task: '「歴史」と「科学」を1文で登録してください。最後に3行が ID 順に並ぶことを確認します。',
      hints: ['VALUES (\'歴史\'), (\'科学\'); のように括弧で1行ずつ書きます。', '列リスト (name) は省略しない。', '確認の SELECT を忘れずに。'],
      solution: `INSERT INTO public.categories (name) VALUES ('歴史'), ('科学');
SELECT category_id, name FROM public.categories ORDER BY category_id;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.categories) = 3
  AND (SELECT count(*) FROM public.categories WHERE category_id = 2 AND name = '歴史') = 1
  AND (SELECT count(*) FROM public.categories WHERE category_id = 3 AND name = '科学') = 1` },
      mysqlNote: '複数行 VALUES は MySQL でも同じ構文です。MySQL では1文の大きさが max_allowed_packet に制限されるため、超大量行の投入は分割します。PostgreSQL も通信バッファの上限はありますが、この教材の規模では問題になりません。' },
    { id: 'ch03-03', title: 'INSERT ... SELECT でまとめて入れる', session: 'A',
      story: '著者は30人登録する予定です。30行を手で書くのは現実的ではありません。問い合わせ結果をそのまま投入できる構文で、まず3人分を入れます。',
      explanation: '## SELECT の結果をそのまま INSERT\n```sql\nINSERT INTO public.authors (name, birth_year)\nSELECT \'著者\' || lpad(n::text, 2, \'0\'), 1950 + n\nFROM generate_series(1, 3) AS n\nORDER BY n;\n```\nVALUES の代わりに SELECT を置くと、**その結果の行をすべて投入**します。\n- `generate_series(1, 3)` は 1, 2, 3 を返す関数です。番号を生成して名前や生年に整形しています。\n- `ORDER BY n` は、採番とデータの対応を固定するためです。ID の自動採番は行が処理される順に振られるため、順序を明示しておくと意図どおりになります。\n- 実務では INSERT ... SELECT は「移行元テーブルから新テーブルへ」「staging から本番へ」のような一括コピーの定番構文です。\n\nこの教材の canonical データでは、著者 n の名前は \'著者\' + 2桁の n、生年は 1950 + n と決まっています（著者01 なら 1951）。最初の3人がこの規則どおりに入ることが、採点で確認されます。',
      task: '著者01〜著者03（生年は 1951〜1953）を INSERT ... SELECT で登録してください。',
      hints: ['INSERT INTO public.authors (name, birth_year) SELECT ... の形です。', '名前は \'著者\' || lpad(n::text, 2, \'0\')、生年は 1950 + n。', 'FROM generate_series(1, 3) AS n に ORDER BY n を付けます。'],
      solution: `INSERT INTO public.authors (name, birth_year)
SELECT '著者' || lpad(n::text, 2, '0'), 1950 + n
FROM generate_series(1, 3) AS n
ORDER BY n;
SELECT author_id, name, birth_year FROM public.authors ORDER BY author_id;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.authors) = 3
  AND (SELECT count(*) FROM public.authors WHERE author_id BETWEEN 1 AND 3 AND name = '著者' || lpad(author_id::text, 2, '0') AND birth_year = 1950 + author_id) = 3` },
      mysqlNote: 'MySQL に generate_series はありません。同じことをするには再帰 CTE（`WITH RECURSIVE n AS (SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 3) SELECT ... FROM n`）や、番号テーブルを使います。INSERT ... SELECT 自体は MySQL でも同じ構文で使えます。' },
    { id: 'ch03-04', title: 'RETURNING で登録内容をすぐ受け取る', session: 'A',
      story: '著者04（生年 1954）を追加します。Web アプリを書くとき、登録した行にどの ID が振られたのかをすぐ知りたい場面は頻出です。そのための構文を覚えましょう。',
      explanation: '## RETURNING は「INSERT の結果」を返す\n```sql\nINSERT INTO public.authors (name, birth_year) VALUES (\'著者04\', 1954) RETURNING author_id, name;\n```\nRETURNING を付けると、INSERT が**挿入した行そのもの**を SELECT のように返します。自動採番された ID は、この方法で1往復で受け取れます。\n\n実務での使いどころ:\n- Web アプリの「登録しました。会員番号は 1234 です」表示\n- 複数行 INSERT で、振られた ID の一覧を後続処理に渡す\n- UPDATE / DELETE にも付けられる（対象行の確認）\n\nこの教材の canonical データでは、著者04 は自動採番で author_id = 4 になります。採点は「RETURNING の表示が指定どおりか」そのものを見ます（author_id と name の2列）。',
      task: '著者04（生年 1954）を登録し、RETURNING で author_id と name の2列を表示してください。',
      hints: ['文末に RETURNING author_id, name を付けます。', 'name は \'著者04\'、birth_year は 1954 です。', '列は author_id, name の2列だけをこの順で返します。'],
      solution: `INSERT INTO public.authors (name, birth_year) VALUES ('著者04', 1954) RETURNING author_id, name;`,
      check: { type: 'result-equals', ordered: true, expectedSql: 'SELECT author_id, name FROM public.authors WHERE author_id = 4' },
      mysqlNote: 'MySQL には RETURNING がありません。直後に `SELECT LAST_INSERT_ID();` を実行するか、AUTO_INCREMENT の値を参照します（複数行 INSERT では最初の行の ID から連番と推定します）。MariaDB には RETURNING があるので、移行の説明書には要注意です。' },
    { id: 'ch03-05', title: 'ON CONFLICT — 二重実行しても壊さない', session: 'A',
      story: '夜間バッチで初期データを流す予定です。バッチは何かの拍子に2回走ることがあります。「もう一度実行しても安全な SQL」にするのが今日のテーマです。',
      explanation: '## 競合したら黙ってスキップ\n```sql\nINSERT INTO public.categories (category_id, name) VALUES (1, \'文学\') ON CONFLICT DO NOTHING;\n```\nこれまで入れた (1, \'文学\') を **再登録しようとする** 文です。そのまま実行すれば主キー違反（23505）ですが、`ON CONFLICT DO NOTHING` を付けると、競合する行は黙ってスキップされ、エラーになりません。\n\n- なぜ (1, \'文学\') をそのまま再実行する形か: 初期データ投入スクリプトは「同じ INSERT 文を何回実行しても同じ状態になる」ことが理想です。これを**冪等（べきとう）**と呼び、実務のバッチ・移行スクリプトの必須要件です。\n- `ON CONFLICT DO UPDATE`（競合した行を更新する upsert）という選択もあります。「無ければ登録、有れば最新化」というマスタ同期の定番です。この章では状態を canonical に保つため DO NOTHING を使います。\n- 対象の制約を `ON CONFLICT (category_id)` のように限定指定する書き方もあり、実務では競合の種類を明示するこちらが好まれます。\n\n最後の SELECT で、3行のまま（重複していない）ことを確認してから採点してください。',
      task: '分類「文学」を ID つきで再登録する文を ON CONFLICT DO NOTHING で実行し、categories が3行のまま重複がないことを確認してください。',
      hints: ['INSERT INTO public.categories (category_id, name) VALUES (1, \'文学\') に ON CONFLICT DO NOTHING を付けます。', '採点の前に SELECT category_id, name FROM public.categories ORDER BY category_id; で中身を確認します。', 'DO UPDATE ではなく DO NOTHING です（状態を変えないため）。'],
      solution: `INSERT INTO public.categories (category_id, name) VALUES (1, '文学') ON CONFLICT DO NOTHING;
SELECT category_id, name FROM public.categories ORDER BY category_id;`,
      check: { type: 'result-equals', ordered: true, expectedSql: 'SELECT category_id, name FROM public.categories ORDER BY category_id' },
      mysqlNote: 'MySQL の対応構文は `INSERT ... ON DUPLICATE KEY UPDATE` で、競合時に列を更新します（DO NOTHING に相当するのは `ON DUPLICATE KEY UPDATE name = name` のような自明な更新、または INSERT IGNORE — ただし IGNORE はその他のエラーも握りつぶすので危険です）。PostgreSQL の ON CONFLICT は「どの制約で競合したか」を (列) や ON CONSTRAINT で明示できますが、MySQL は主キー/一意キーを自動選択します。' },
    { id: 'ch03-06', title: '制約違反をわざと経験する', session: 'A',
      story: 'オープン前の最終確認です。司書から「変なデータを入れたらどうなる？」と聞かれたので、自分の目で挙動を確かめ、エラーの読み方を整理しておきます。',
      explanation: '## SQLSTATE という共通言語\nPostgreSQL のエラーには **SQLSTATE**（5桁のコード）が付きます。先頭2桁がクラスで、`23` は「整合性制約違反」です。このエディターではエラーパネルに SQLSTATE が表示されます。\n\n次の4つを、**1文ずつ別の送信**で実行して、表示されるコードを確認してください。どれも失敗して何も入らないはずです。\n\n1. 一意違反 `23505`\n```sql\nINSERT INTO public.categories (category_id, name) VALUES (1, \'文学\');\n```\n2. 外部キー違反 `23503`（分類99は存在しない）\n```sql\nINSERT INTO public.books (isbn, title, category_id) VALUES (\'9789999990001\', \'サンプル本\', 99);\n```\n3. CHECK 違反 `23514`（負の価格）\n```sql\nINSERT INTO public.books (isbn, title, category_id, price) VALUES (\'9789999990002\', \'サンプル本2\', 1, -100);\n```\n4. NOT NULL 違反 `23502`（書名を忘れた）\n```sql\nINSERT INTO public.books (isbn, category_id) VALUES (\'9789999999999\', 1);\n```\n\nポイント:\n- 失敗した1文は**何も変更しません**（1文だけの送信は自動コミットなので、エラー=変更なし）。\n- 引っかかった制約は、その名前（books_price_check など）が教えてくれます。2章で制約に名前を付けたのはこのためです。\n- アプリ側はこれらのコードを見て「リトライ可能か、利用者に何と説明するか」を決めます。\n\n4番目（23502）を実行したまま、採点してください。',
      task: '上の4文を1つずつ実行して SQLSTATE を確認してください。採点は最後の NOT NULL 違反（23502）で行います。',
      hints: ['1文ずつ、個別に送信します（まとめて送ると最初のエラーで止まります）。', 'エラーパネルの「コード」が SQLSTATE です。', '採点対象は最後の INSERT public.books (isbn, category_id) の 23502 です。'],
      solution: `INSERT INTO public.books (isbn, category_id) VALUES ('9789999999999', 1);`,
      replay: '',
      check: { type: 'error-code', code: '23502' },
      mysqlNote: 'MySQL は SQLSTATE とは別に固有のエラー番号を使う文化です: 一意違反 1062（SQLSTATE 23000）、外部キー 1452/1451、CHECK 違反 3819（8.0.16以降）、NULL 違反 1048。PostgreSQL のように違反の種類ごとに SQLSTATE が細分化されていないため、MySQL 側のエラー処理は番号で書かれることが多く、移植時の注意点です。' },
    { id: 'ch03-07', title: 'CSV ファイルから著者を取り込む', session: 'A',
      story: '市の総務課から「著者29・著者30」の2人分が載った CSV ファイルが届きました。表計算ソフトからの書き出しで届くのはよくあること。ファイル取込を体験しましょう。',
      explanation: '## このアプリの CSV 取込\n教材には `lessons/data/authors.csv` が同梱されていて、**「同梱 CSV を読み込む」ボタン**（または SQL エディターで `-- @csv authors.csv` を1行で実行）で取り込めます。ファイルの中身はごく普通の CSV です。\n\n```csv\nauthor_id,name,birth_year\n29,著者29,1979\n30,著者30,1980\n```\n\n裏側では、サーバーが CSV を解析し、列を確認した上で**安全にエスケープした複数行 INSERT ... ON CONFLICT DO NOTHING** に組み立てて実行しています。つまり体験しているのは「ファイルからの一括投入」で、中身は今までのステップで学んだ INSERT そのものです。\n\n## 本来の PostgreSQL の流儀\n本番の大量データは COPY が定番です。\n- `COPY 表 FROM \'サーバー上のパス\'` — サーバー側のファイルを直接読む高速な仕組み（スーパーユーザー権限が必要）\n- psql の `\\copy` — 手元のファイルを読んでサーバーへ流すクライアント側の仕組み\n\npsql のメタコマンドはこのエディターでは使えないため、教材は上の仕組みで CSV を扱います。この2行は canonical データの一部（著者29・30）なので、あとで一括投入する初期データと衝突しません。',
      task: '同梱 CSV を読み込むボタンを押す（または `-- @csv authors.csv` を実行する）して、著者29・30を取り込んでください。',
      hints: ['「同梱 CSV を読み込む」ボタンがこのステップに表示されます。', 'エディターなら -- @csv authors.csv だけを1行で送信します。', '取り込まれる行は author_id 29 と 30 の2行です。'],
      solution: '-- @csv authors.csv',
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.authors) = 6
  AND (SELECT count(*) FROM public.authors WHERE author_id IN (29, 30) AND name = '著者' || author_id AND birth_year = 1950 + author_id) = 2` },
      mysqlNote: 'MySQL の定番は `LOAD DATA [LOCAL] INFILE` です。LOCAL なし（サーバー側ファイル）は FILE 権限と secure_file_priv の制限、LOCAL ありはクライアント側から送る方式（PostgreSQL の psql `\\copy` に相当）。CSV の区切り・囲み・改行の解釈はオプションで指定します。PostgreSQL の COPY はエラー時にどの行で落ちたかを報告し、失敗すれば何も入れない点が安全です。' },
    { id: 'ch03-08', title: '初期データ（seed）を全て投入する', session: 'A',
      story: '開館日前日です。分類・著者・書誌・蔵書・会員・貸出記録の初期データを一括で投入します。ここまでのステップで先に入れた行は、この初期データと同じ値（canonical）なので衝突しません。',
      explanation: '## seed とは\n`-- @include seed.sql` は、教材に同梱された初期データ定義（seed）をサーバーが展開して実行する行です。中身は大きく分けて:\n\n- 残りの全行を INSERT ... SELECT で投入（分類10・著者30・書誌50・関連55・蔵書80・会員20・貸出100）\n- すべて `ON CONFLICT DO NOTHING` つき — この章で先に入れた canonical 行と重複しても安全（**これが冪等な初期データの書き方**です）\n- 末尾で `setval(...)` により**全シーケンスを採番済みの最大 ID に合わせる**\n- 日付は CURRENT_DATE 基準の相対指定 — 「今日」から見て延滞中の貸出と期限内の貸出が作られます\n\n## なぜ setval が必要か\nseed は ID を明示して INSERT します。**明示指定はシーケンスを進めない**ので、このまま次の INSERT で自動採番を使うと、既に存在する ID を振って 23505 で失敗します。実務でも「移行データを ID つきで入れた後に採番を合わせ忘れる」は定番事故で、投入の最後に採番位置をそろえる運用が標準です。\n\n追加の練習行を自分で入れていた場合、この seed は消してくれません（DO NOTHING なので）。採点の行数が合わなければ「章の最初からやり直す」で戻りましょう。',
      task: '`-- @include seed.sql` を実行して、全初期データ（行数と採番位置）を投入してください。',
      hints: ['エディターに -- @include seed.sql だけを書いて送信します。', 'ボタンでなく SQL として送る点に注意（psql の \\i は使えません）。', '投入後は全7表の行数と、シーケンスの採番位置が採点対象です。'],
      solution: '-- @include seed.sql',
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.categories) = 10
  AND (SELECT count(*) FROM public.authors) = 30
  AND (SELECT count(*) FROM public.books) = 50
  AND (SELECT count(*) FROM public.book_authors) = 55
  AND (SELECT count(*) FROM public.copies) = 80
  AND (SELECT count(*) FROM public.members) = 20
  AND (SELECT count(*) FROM public.loans) = 100
  AND (SELECT count(*) FROM public.loans WHERE returned_on IS NULL) = 20
  AND (SELECT count(*) FROM public.copies WHERE status = 'loaned') = 20
  AND (SELECT count(*) FROM public.members WHERE email IS NULL) = 1
  AND (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'categories_category_id_seq') = 10
  AND (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'authors_author_id_seq') = 30
  AND (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'books_book_id_seq') = 50
  AND (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'copies_copy_id_seq') = 80
  AND (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'members_member_id_seq') = 20
  AND (SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'loans_loan_id_seq') = 100` },
      mysqlNote: 'MySQL に `-- @include` は存在しません（この教材の機能です）。実務では mysql クライアントの `SOURCE seed.sql` やマイグレーションツールで同じことをします。採番位置の調整は `ALTER TABLE ... AUTO_INCREMENT = 値`（テーブルオプション）が MySQL 流です。' },
  ],
}
export default chapter
