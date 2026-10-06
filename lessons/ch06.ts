import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 6, title: '更新削除', summary: '更新・削除とトランザクションで事故を防ぎます。',
  steps: [
    { id: 'ch06-01', title: 'UPDATE — 1行を更新して RETURNING で確認', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'library' } },
      story: '集配棚から「蔵書61が破損している」と報告がありました。修理に出すので、status を repair に更新します。ここからは SELECT ではなく、データを「変える」SQL が始まります。',
      explanation: '## UPDATE の読み方\n```sql\nUPDATE public.copies SET status = \'repair\' WHERE copy_id = 61 RETURNING copy_id, status;\n```\n- `UPDATE 表 SET 列 = 値 WHERE 条件` の基本形。**WHERE で「どの行を変えるか」を限定**します。\n- `RETURNING` を付けると、**更新された行がどうなったかをその場で表示**できます。SELECT の結果のように見えるので「更新の領収書」と呼べます。更新件数だけでなく中身まで確認できるのが強みです。\n- WHERE を忘れると**全行が変わります**（この章の後半で体験します）。そこで実務の指針が「**UPDATE の前に SELECT で対象を確認する**」です。まず次を別の送信で実行して、1行だけが対象になることを確認してから UPDATE を送ってください。\n```sql\nSELECT copy_id, book_id, status FROM public.copies WHERE copy_id = 61;\n```\n- この SELECT と UPDATE の WHERE を**コピペして同じにする**のが事故防止のコツです。手で打ち直すと条件が変わります。',
      task: '蔵書 copy_id = 61 の status を repair に更新してください。RETURNING で copy_id と status を表示して、変更結果をその場で確認します。',
      hints: ['UPDATE public.copies SET status = \'repair\' WHERE ... の形です。', 'WHERE copy_id = 61 を忘れると80行全部が変わります。', 'RETURNING copy_id, status; を末尾に付けます。'],
      solution: `UPDATE public.copies SET status = 'repair' WHERE copy_id = 61 RETURNING copy_id, status;`,
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT copy_id, status FROM public.copies WHERE copy_id = 61` },
      mysqlNote: 'MySQL の UPDATE 構文は同じですが、**RETURNING がありません**。更新前に SELECT で確認してから UPDATE、更新後に SELECT で再確認、が MySQL での定石です（だからこそ SELECT-first の指針は両方の文化で通用します）。MySQL Workbench は既定で sql_safe_updates（WHERE にキー列がない UPDATE/DELETE を拒否）が有効で、WHERE 忘れを機械的に防いでくれる設定例として知られています。' },
    { id: 'ch06-02', title: 'UPDATE ... FROM — 別の表を条件に一括更新', session: 'A',
      story: '技術書の書架で一斉点検が決まりました。技術書（category_id = 4）の蔵書のうち、現在利用可能なものを、まとめて点検扱い（repair）にします。「対象の本」は books 表を見ないと決められません。',
      explanation: '## FROM で他の表を参照する\n```sql\nUPDATE public.copies AS c SET status = \'repair\'\nFROM public.books b\nWHERE c.book_id = b.book_id AND b.category_id = 4 AND c.status = \'available\'\nRETURNING c.copy_id;\n```\n- `UPDATE ... FROM` は、**更新対象を別の表との結合で決められる**構文です。copies には category_id がない（正規化されている）ので、books を結び付けて「技術書の蔵書」を特定します。\n- `c.status = \'available\'` の条件を足して「貸出中の蔵書を点検扱いにしない」配慮を入れています。1回の UPDATE で複数行が変わるので、RETURNING で「何行・どの行が変わったか」を必ず確認します。\n- 一括更新の前にも SELECT が有効です。UPDATE の WHERE と同じ条件の SELECT で対象を見てから実行する癖が、実務での事故率を大きく下げます。\n- 更新された行の並び順（RETURNING の行順）は保証されないので、件数の確認には ORDER BY した SELECT を併用します（採点は順序を問いません）。',
      task: '技術書（category_id = 4）で現在 available の蔵書を、まとめて status = \'repair\' に更新してください。RETURNING で copy_id を表示します。',
      hints: ['UPDATE public.copies AS c SET status = \'repair\' FROM public.books b で始めます。', 'WHERE c.book_id = b.book_id AND b.category_id = 4 AND c.status = \'available\' です。', 'RETURNING c.copy_id; で更新された蔵書を確認します。'],
      solution: `UPDATE public.copies AS c SET status = 'repair'
FROM public.books b
WHERE c.book_id = b.book_id AND b.category_id = 4 AND c.status = 'available'
RETURNING c.copy_id;`,
      check: { type: 'result-equals', ordered: false, expectedSql: `SELECT c.copy_id
FROM public.copies c JOIN public.books b ON b.book_id = c.book_id
WHERE b.category_id = 4 AND c.status = 'repair'
ORDER BY c.copy_id` },
      mysqlNote: 'MySQL には UPDATE ... FROM がありません。代わりに**複数表 UPDATE** `UPDATE copies c JOIN books b ON c.book_id = b.book_id SET c.status = \'repair\' WHERE b.category_id = 4 AND c.status = \'available\'` と書きます（JOIN を UPDATE の対象に直接書けるのが MySQL 流）。PostgreSQL では同じことを UPDATE ... FROM で表現します。' },
    { id: 'ch06-03', title: 'WHERE 忘れ — BEGIN と ROLLBACK の救済', session: 'A',
      story: '新人さんから助けを求められました。「『全蔵書を点検扱いにして』と言われて、つい WHERE なしで UPDATE を実行してしまった」。画面には80行の RETURNING が並んでいます。……ただ、幸いなことに、彼女は BEGIN の後に実行していました。',
      explanation: '## 取り消しの保険\n```sql\nBEGIN;\nUPDATE public.copies SET status = \'repair\' RETURNING copy_id;\nROLLBACK;\nSELECT status, count(*) AS copies FROM public.copies GROUP BY status ORDER BY status;\n```\n- `BEGIN` から `COMMIT`/`ROLLBACK` までが**トランザクション**。BEGIN の後の変更は「まだ確定していない」状態なので、`ROLLBACK` で全部取り消せます。WHERE を忘れても、BEGIN を先に送っておけば事故にならない——これが「**更新は BEGIN で囲む**」運用の意味です。\n- 最後の SELECT は**復旧確認**です。ROLLBACK 後に集計を見て、元の状態（repair はステップ01と02で付けた7行だけ）に戻ったことを確認します。救済したら終わりではなく、**戻ったことを証明する**までが作業です。\n- 注意: **COMMIT 後の取り消しは ROLLBACK ではできません**（やり直しは UPDATE による「復旧作業」か、バックアップからの復元）。9章で並行性の制御を学びますが、トランザクションの価値の半分は既にこのステップにあります。\n- 実務の指針まとめ: ①更新系 SQL は SELECT で対象を予習 ②不安な操作は BEGIN で囲む ③ROLLBACK したら SELECT で復旧確認。',
      task: 'WHERE なしの UPDATE を BEGIN 〜 ROLLBACK で囲んで実行し、事故が起きないことを体験してください。最後の SELECT で元の状態（repair 7行）に戻ったことを確認します。',
      hints: ['BEGIN; を先に送ってから UPDATE です。', 'UPDATE public.copies SET status = \'repair\' RETURNING copy_id; は80行返ります。', 'ROLLBACK; してから最後の SELECT を送ります。'],
      solution: `BEGIN;
UPDATE public.copies SET status = 'repair' RETURNING copy_id;
ROLLBACK;
SELECT status, count(*) AS copies FROM public.copies GROUP BY status ORDER BY status;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT status, count(*) AS copies FROM public.copies GROUP BY status ORDER BY status` },
      mysqlNote: 'BEGIN 〜 ROLLBACK の保険は MySQL も同じです（MySQL では START TRANSACTION とも書けます）。注意すべき違い: MySQL では**DDL（ALTER TABLE など）を実行した時点で暗黙に COMMIT されます**。PostgreSQL は DDL もトランザクション内で取り消せます（2章で体験済み）。また MySQL の UPDATE は「一致した行数」と「実際に変わった行数」を区別して報告します（値が同じでも matched に数える設定がある）。' },
    { id: 'ch06-04', title: 'DELETE — 行を削除して RETURNING で記録', session: 'A',
      story: '月次監査で、loans に「実在しない貸出」が1件紛れ込んでいることが分かりました（loan_id = 80、会員19さんの記録のはずですが、台帳には存在しません）。まず SELECT で中身を確認してから、削除します。',
      explanation: '## DELETE の読み方\n```sql\nDELETE FROM public.loans WHERE loan_id = 80 RETURNING loan_id, copy_id, member_id, returned_on;\n```\n- `DELETE FROM 表 WHERE 条件`。WHERE がないと**表の中身が全部消えます**。UPDATE の WHERE 忘れより重大で、しかも COMMIT 後は ROLLBACK できません。\n- だからこそ **RETURNING が本領を発揮**します。削除すると「何があったか」は表から見えなくなるので、RETURNING の出力が「消したものの記録」になります。この出力は、削除の申請書として保存する運用も実在します。\n- 削除の前にも SELECT です。`SELECT * FROM public.loans WHERE loan_id = 80;` を先に実行して、削ろうとしている行の中身と件数（1行）を確認してから実行してください。\n- 貸出の履歴は本来、監査対象の「消してはいけない記録」です。この章では教材として削除しますが、直後に INSERT で復旧します（ステップ06）。実務で履歴を消したいときは、まず「本当に消してよいか」を設計段階に疑います（この章の最後で論理削除を扱います）。',
      task: 'loan_id = 80 の貸出記録を削除してください。RETURNING で loan_id, copy_id, member_id, returned_on を表示し、消した行を記録として残します。',
      hints: ['DELETE FROM public.loans WHERE loan_id = 80 です。', 'RETURNING loan_id, copy_id, member_id, returned_on; を付けます。', '実行前に SELECT * FROM public.loans WHERE loan_id = 80; で確認します。'],
      solution: `DELETE FROM public.loans WHERE loan_id = 80 RETURNING loan_id, copy_id, member_id, returned_on;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.loans) = 99
  AND (SELECT count(*) FROM public.loans WHERE loan_id = 80) = 0` },
      mysqlNote: 'DELETE の構文は MySQL も同じで、RETURNING はやはりありません（削除前に SELECT、削除後に影響行数の確認）。MySQL には `DELETE FROM ... ORDER BY ... LIMIT 10` のように件数を限定する DELETE がありますが、PostgreSQL にはないので、PostgreSQL では WHERE で正確に対象を書きます。' },
    { id: 'ch06-05', title: 'RESTRICT — 参照されている行は削除できない', session: 'A',
      story: '「著者01さんの著作が全部絶版になったので、著者登録を削除してほしい」という依頼が来ました。しかし、データベースは静かに、しかし強く、これを拒否します。',
      explanation: '## 外部キーがデータを守る\n```sql\nDELETE FROM public.authors WHERE author_id = 1;\n```\n- 著者01は『図書館の本01』『図書館の本31』の著者として book_authors から参照されています。2章で books・authors への外部キーに **ON DELETE RESTRICT** を選んだ結果、「参照されている著者は削除できない」設計になっています。\n- PostgreSQL のエラーは **SQLSTATE 23001**（restrict_violation）。実は RESTRICT の違反は 23503（foreign_key_violation）とは区別されます: `RESTRICT` は**行を処理するたびに即座に**確認されて 23001、`NO ACTION`（外部キーの既定）は**文の末尾で**確認されて 23503 です。どちらも「外部キー違反」の仲間で、対応の作法は同じです（エラーの区別は知っていると、制約定義を思い出す手がかりになります）。\n- エラーメッセージには「どの表のどの制約に抵触したか」が書かれるので、最初に読むべきはそこです。\n- 削除に失敗したら、**「誰が参照しているか」を SELECT で調べる**のが次の一手です:\n```sql\nSELECT b.book_id, b.title FROM public.book_authors ba JOIN public.books b ON b.book_id = ba.book_id WHERE ba.author_id = 1;\n```\n- 「削除できない」はエラーではなく、**設計が意図通りに仕事をしている証拠**です。対処は3通り: 参照元を先に整理する / 論理削除に切り替える（この章の最後）/ どうしても物理削除が必要なら、CASCADE の意味を再審査する（次のステップで挙動を見ます）。',
      task: 'author_id = 1 の著者を削除しようとして、外部キー違反（SQLSTATE 23001）を確認してください。',
      hints: ['DELETE FROM public.authors WHERE author_id = 1; をそのまま実行します。', 'エラーは「不合格」ではなく、このステップの「合格条件」です。', 'SQLSTATE の 5 桁が 23001（restrict_violation）であることを確認します。'],
      solution: `DELETE FROM public.authors WHERE author_id = 1;`,
      replay: '',
      check: { type: 'error-code', code: '23001' },
      mysqlNote: 'MySQL（InnoDB）も同じ挙動で、親行の削除を拒否します。エラーの表示が違うだけで、MySQL では `ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails` になります（SQLSTATE 23000、MySQL 固有の errno 1451）。「参照されている行は消せない」という設計の意味は両方で同じです。' },
    { id: 'ch06-06', title: 'INSERT による復旧 — 削除は正確な記録があれば戻せる', session: 'A',
      story: '監査担当から連絡がありました。「先ほど削除した loan 80、申し送りを確認したら**実在する正しい記録**でした。復旧してください」——RETURNING の出力（バックアップ）を頼りに、正確な値で INSERT し直します。',
      explanation: '## 削除の復旧は INSERT\n```sql\nINSERT INTO public.loans(loan_id, copy_id, member_id, loaned_on, due_on, returned_on)\nVALUES (80, 20, 19, CURRENT_DATE-40, CURRENT_DATE-26, CURRENT_DATE-30);\n```\n- 削除してしまった行は、**正確な値が分かれば INSERT で戻せます**。RETURNING の出力やバックアップが「その行の遺言」です。1章〜3章で INSERT は散々練習済みですが、ここで初めて「復旧」に使います。\n- `loan_id = 80` を明示しています。IDENTITY は `GENERATED BY DEFAULT` なので、**明示的に ID を指定した INSERT は採番機（シーケンス）を消費しません**。復旧で順番が狂わない大切な性質です。\n- 日付は相対式（CURRENT_DATE-40 など）で、元の記録と同じ値になるよう作ります（この seed が相対日付で作られているため、復旧も同じ式で書くと日が変わっても一致します）。\n- 復旧したら SELECT で確認します。件数（100）と、復旧した行の中身の両方です。**「直した」は確認して初めて「直った」**になります。',
      task: '削除した loan 80 を元どおり復旧してください（copy_id = 20, member_id = 19, loaned_on = CURRENT_DATE-40, due_on = CURRENT_DATE-26, returned_on = CURRENT_DATE-30）。',
      hints: ['INSERT INTO public.loans(loan_id, copy_id, member_id, loaned_on, due_on, returned_on) VALUES (80, ...); です。', '日付は CURRENT_DATE-40 / CURRENT_DATE-26 / CURRENT_DATE-30 の式で書きます。', '復旧後 SELECT count(*) FROM public.loans; で100行を確認します。'],
      solution: `INSERT INTO public.loans(loan_id, copy_id, member_id, loaned_on, due_on, returned_on)
VALUES (80, 20, 19, CURRENT_DATE-40, CURRENT_DATE-26, CURRENT_DATE-30);`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.loans) = 100
  AND (SELECT count(*) FROM public.loans WHERE loan_id = 80 AND copy_id = 20 AND member_id = 19
       AND loaned_on = CURRENT_DATE-40 AND due_on = CURRENT_DATE-26 AND returned_on = CURRENT_DATE-30) = 1` },
      mysqlNote: '復旧の INSERT 自体は MySQL も同じ構文です。AUTO_INCREMENT 列に明示的な値を挿入した場合、MySQL 8.0 は「指定した値が現在のカウンタより大きければ採番機を進める」挙動があります（小さい値なら進めません）。PostgreSQL の GENERATED BY DEFAULT と同じく、小さい明示 ID では採番は進みません。' },
    { id: 'ch06-07', title: 'CASCADE の観察（準備）— 実験用の書誌を登録', session: 'A',
      story: '次は ON DELETE CASCADE の実験です。ただし業務データで試すわけにはいきません。そこで、実験用の書誌（book_id = 999）と著者リンクを1件だけ用意します。実験が終わったら、この章の最後には何も残りません。',
      explanation: '## 安全な観察の準備\n```sql\nINSERT INTO public.books(book_id, isbn, title, category_id, published_year) VALUES (999, \'9780000009990\', \'削除実験の書誌\', 4, 2024);\nINSERT INTO public.book_authors(book_id, author_id) VALUES (999, 1);\n```\n- book_authors の books への外部キーは **ON DELETE CASCADE** です（2章）。書誌を消すと、その書誌へのリンクが**黙って一緒に消える**設計になっています。次のステップでこれを目撃します。\n- book_id = 999 は canonical な蔵書（1〜50）と衝突しない実験値です。明示 ID の INSERT なので books の採番機（次は51）を消費しません。\n- 蔵書（copies）を作らない点も意図的です。書誌に蔵書が残っていると、copies の外部キー（RESTRICT）が削除を拒むからです。この組み合わせも次のステップで説明します。\n- 準備ができたら、リンクが見えることを確認してから次へ進みます:\n```sql\nSELECT * FROM public.book_authors WHERE book_id = 999;\n```',
      task: '実験用の書誌（book_id = 999, isbn = \'9780000009990\', title = \'削除実験の書誌\', category_id = 4, published_year = 2024）と、その著者リンク（author_id = 1）を登録してください。',
      hints: ['INSERT INTO public.books(...) VALUES (999, ...) — price は省略すると既定の 0 になります。', 'isbn は13桁の一意な値 \'9780000009990\' を使います（canonical の ISBN と衝突しません）。', 'リンクは INSERT INTO public.book_authors(book_id, author_id) VALUES (999, 1); です。'],
      solution: `INSERT INTO public.books(book_id, isbn, title, category_id, published_year) VALUES (999, '9780000009990', '削除実験の書誌', 4, 2024);
INSERT INTO public.book_authors(book_id, author_id) VALUES (999, 1);`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.books WHERE book_id = 999) = 1
  AND (SELECT count(*) FROM public.book_authors WHERE book_id = 999) = 1
  AND (SELECT count(*) FROM public.books) = 51` },
      mysqlNote: 'MySQL でも同じ INSERT がそのまま動きます（AUTO_INCREMENT 列への明示値も同じ理屈）。実験用に行を足して観察し、後で消す「実験の作法」はデータベースを問わず共通です。MySQL では実験のために一時表（CREATE TEMPORARY TABLE）を使う流儀もありますが、外部キーの挙動を見たいときは本物の表でないと観察できない、という点も共通です。' },
    { id: 'ch06-08', title: 'CASCADE の観察（発火）— リンクが黙って消える', session: 'A',
      story: 'それでは書誌999を削除します。DELETE したのは books だけです。book_authors はどうなるでしょうか。',
      explanation: '## 連鎖削除の目撃\n```sql\nDELETE FROM public.books WHERE book_id = 999 RETURNING book_id, title;\nSELECT count(*) AS remaining_links FROM public.book_authors WHERE book_id = 999;\n```\n- 1文目の DELETE は books の行だけを対象にしています。しかし2文目の SELECT は **0 を返します**。book_authors のリンク (999, 1) は、外部キーの **ON DELETE CASCADE** によって、誰も触っていないのに消えています。\n- CASCADE の方向を正確に: **消えるのは「参照している側（子）」の行**です。著者01（author_id = 1）は無傷です。「書誌が消えたら、その書誌へのリンクは意味を失う」——2章の設計判断が、この1文で実行されています。\n- 書誌1〜50を消せない理由もこれで分かります: 蔵書（copies）の外部キーが RESTRICT なので、蔵書の残っている書誌は CASCADE 以前に拒否されます。1つの表への複数の参照に CASCADE と RESTRICT が混在するとき、**最も厳しい側が効きます**。\n- CASCADE の危うさは「静かさ」です。削除の記録（RETURNING）は books にしか出ず、連鎖で消えた book_authors は黙って消えます。複数段に CASCADE が連なると影響は読めなくなるので、実務では CASCADE を付ける前に必ず設計レビューを通します。',
      task: '書誌999を削除してください。RETURNING で削した書誌を確認し、続く SELECT で book_authors のリンクが連鎖削除されたことを確認します。',
      hints: ['DELETE FROM public.books WHERE book_id = 999 RETURNING book_id, title; です。', '同じ送信に SELECT count(*) AS remaining_links FROM public.book_authors WHERE book_id = 999; を続けます。', 'remaining_links が 0 になれば CASCADE が発火した証拠です。'],
      solution: `DELETE FROM public.books WHERE book_id = 999 RETURNING book_id, title;
SELECT count(*) AS remaining_links FROM public.book_authors WHERE book_id = 999;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.books WHERE book_id = 999) = 0
  AND (SELECT count(*) FROM public.book_authors WHERE book_id = 999) = 0
  AND (SELECT count(*) FROM public.books) = 50
  AND (SELECT count(*) FROM public.book_authors) = 55` },
      mysqlNote: 'MySQL（InnoDB）の ON DELETE CASCADE も同じ挙動です（構文も同じ）。MySQL には複数表 DELETE（`DELETE b, ba FROM books b JOIN book_authors ba ON ...`）という別の道具もあり、明示的に2表を同時に消せます。PostgreSQL には複数表 DELETE がなく、連鎖は外部キー定義（CASCADE）に委ねる設計です。' },
    { id: 'ch06-09', title: 'TRUNCATE — 全行削除のもう1つの道', session: 'A',
      story: '「表の中身を全部消したい」という要求は、DELETE 以外にもう1つの道具で満たせます。ただし道が違えば、戻り方も違います。loans で試します——BEGIN で囲んで、この章のデータを壊さずに観察します。',
      explanation: '## DELETE との違い\n```sql\nBEGIN;\nTRUNCATE public.loans;\nSELECT count(*) AS loans FROM public.loans;\nROLLBACK;\nSELECT count(*) AS loans, count(*) FILTER (WHERE returned_on IS NULL) AS open FROM public.loans;\n```\n- `TRUNCATE` は**表の中身を一瞬で空にする**操作です。DELETE が1行ずつ「消える」のに対し、TRUNCATE は表の実体を作り直すイメージで、100万行でも一瞬です（この性能差が8章の主役になります）。\n- PostgreSQL の TRUNCATE は**トランザクション内で実行でき、ROLLBACK で取り消せます**。BEGIN の中で SELECT すると 0 件、ROLLBACK すると100件に戻るのを確認してください。\n- 制限が2つ: ①**他の表から参照されている表は TRUNCATE できません**（外部キー違反 17012。loans は参照「している」側なので大丈夫ですが、copies や members は TRUNCATE できません）②シーケンスを戻すには `TRUNCATE ... RESTART IDENTITY` が要ります（既定では戻りません）。\n- 使い分けの指針: **WHERE で絞るなら DELETE 一択**。全件消しで、かつロールバック要件やトリガー要件を確認した上で TRUNCATE。実務では「開発環境のデータを一括リセット」のような場面で最もよく使われます。',
      task: 'TRUNCATE を BEGIN 〜 ROLLBACK の中で実行し、loans が空になってから元に戻ることを確認してください。最後の SELECT で100件・貸出中20件に戻ったことを確認します。',
      hints: ['BEGIN; → TRUNCATE public.loans; → SELECT count(*) ...; → ROLLBACK; の順です。', 'TRUNCATE 直後の SELECT は 0 を返します。', 'ROLLBACK 後、最後の SELECT で loans=100・open=20 を確認します。'],
      solution: `BEGIN;
TRUNCATE public.loans;
SELECT count(*) AS loans FROM public.loans;
ROLLBACK;
SELECT count(*) AS loans, count(*) FILTER (WHERE returned_on IS NULL) AS open FROM public.loans;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT count(*) AS loans, count(*) FILTER (WHERE returned_on IS NULL) AS open FROM public.loans` },
      mysqlNote: 'ここが PostgreSQL と MySQL の**最大の実務上の違い**の1つです: MySQL の TRUNCATE は **DDL とみなされ、実行時に暗黙 COMMIT します**。つまり MySQL では `BEGIN; TRUNCATE ...; ROLLBACK;` が**できません**（TRUNCATE の瞬間に確定します）。PostgreSQL では TRUNCATE をロールバックできます。加えて MySQL の TRUNCATE は AUTO_INCREMENT カウンタを暗黙でリセットします。同じ SQL でも安全性が全く異なるので、移植時の要注意ポイントです。' },
    { id: 'ch06-10', title: '論理削除 — 行を消さずに「退会」を記録する', session: 'A',
      story: '最後の仕事です。会員19さんから退会の申し出がありました。しかし、members は loans から参照されているので物理削除は外部キーが拒みます（ステップ05と同じ理屈）。2章で用意した deleted_at を使いましょう。その後、この章で修理扱いにした蔵書も点検完了として元に戻し、章の状態を初期化します。',
      explanation: '## 消す代わりに、状態として記録する\n```sql\nUPDATE public.members SET deleted_at = now() WHERE member_id = 19 RETURNING member_id, name, deleted_at;\n```\n- **論理削除（ソフト削除）**: 行を消さず、`deleted_at` に時刻を入れて「退会した」と記録します。貸出履歴は会員への参照を保ったまま残り、監査も守られます。「削除したい」要求の多くは、実は「検索に出なくしたい」要求で、それは **WHERE 句で `deleted_at IS NULL` を条件に足す**だけで満たせます（4章の WHERE の再利用です）。\n- 物理削除との使い分け: 法人で「消してはいけない記録」（監査・税務・履歴）を抱える表は論理削除、作業データ・セッションのような「消えて当然」の表は物理削除、が実務の目安です。\n- 復帰も UPDATE 1発です（退会撤回）。物理削除すると戻すのに INSERT と全データが必要だった（ステップ06）のと比べてください。\n\n## 章末の全復旧\nこの章で私たちが変えたデータを全て元に戻します。\n```sql\nUPDATE public.copies SET status = \'loaned\' WHERE copy_id = 61;\nUPDATE public.copies SET status = \'available\' WHERE copy_id IN (4, 14, 24, 34, 44, 54);\n```\n- 蔵書61は修理から戻りましたが、現在も貸出中（loan 81）なので \'loaned\' に戻します。点検した技術書は棚に戻るので \'available\' です。\n- 最後の SELECT は**章末の全体確認**です。7つの表の行数と、repair が0件・退会者が0人であることを1度に見ます。この値は3章の canonical 状態そのもので、次の章（7章）はこの状態を前提に始まります。**触ったら戻す、戻したら証明する**——この章の締めくくりの作法です。',
      task: '会員19を論理削除して復帰させ（deleted_at を設定して NULL に戻す）、修理扱いの蔵書を全て元の状態へ戻し、最後の SELECT で章末の状態（3章と同一）を確認してください。',
      hints: ['UPDATE public.members SET deleted_at = now() WHERE member_id = 19 ... と戻しの UPDATE ... SET deleted_at = NULL ... を続けます。', '蔵書は 61 → \'loaned\'、4,14,24,34,44,54 → \'available\' に戻します。', '最後の SELECT で全表のカウントを確認します。'],
      solution: `UPDATE public.copies SET status = 'loaned' WHERE copy_id = 61;
UPDATE public.copies SET status = 'available' WHERE copy_id IN (4, 14, 24, 34, 44, 54);
UPDATE public.members SET deleted_at = now() WHERE member_id = 19 RETURNING member_id, name, deleted_at;
UPDATE public.members SET deleted_at = NULL WHERE member_id = 19 RETURNING member_id, deleted_at;
SELECT (SELECT count(*) FROM public.categories) AS categories,
       (SELECT count(*) FROM public.authors) AS authors,
       (SELECT count(*) FROM public.books) AS books,
       (SELECT count(*) FROM public.book_authors) AS book_authors,
       (SELECT count(*) FROM public.copies) AS copies,
       (SELECT count(*) FROM public.members) AS members,
       (SELECT count(*) FROM public.loans) AS loans,
       (SELECT count(*) FROM public.copies WHERE status = 'repair') AS repair_copies,
       (SELECT count(*) FROM public.members WHERE deleted_at IS NOT NULL) AS deleted_members;`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM public.copies WHERE copy_id = 61 AND status = 'loaned') = 1
  AND (SELECT count(*) FROM public.copies WHERE status = 'repair') = 0
  AND (SELECT count(*) FROM public.copies WHERE status = 'available') = 60
  AND (SELECT count(*) FROM public.members WHERE deleted_at IS NOT NULL) = 0
  AND (SELECT count(*) FROM public.books) = 50
  AND (SELECT count(*) FROM public.book_authors) = 55
  AND (SELECT count(*) FROM public.loans) = 100` },
      mysqlNote: '論理削除の deleted_at パターンは MySQL でも定番です。型の選択は2章の復習: MySQL には timestamptz がないので DATETIME（UTC 運用）で代用します。実務の補足: 退会済み会員が増えると `WHERE deleted_at IS NULL` が全問い合わせに必要になるので、部分インデックス（PostgreSQL）や「現役会員だけのビュー」（7章）で扱いやすくする設計が続きます。' },
  ],
}
export default chapter
