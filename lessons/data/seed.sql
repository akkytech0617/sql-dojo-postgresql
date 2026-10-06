-- Canonical dataset. Early INSERT exercises must insert the matching canonical rows.
-- ON CONFLICT permits teaching a few rows first, then loading the remaining rows.
INSERT INTO public.categories(category_id, name) VALUES
 (1,'文学'),(2,'歴史'),(3,'科学'),(4,'技術'),(5,'芸術'),
 (6,'児童'),(7,'社会'),(8,'哲学'),(9,'言語'),(10,'暮らし')
ON CONFLICT DO NOTHING;
INSERT INTO public.authors(author_id, name, birth_year)
SELECT n, '著者' || lpad(n::text,2,'0'), 1950 + n
FROM generate_series(1,30) AS n ON CONFLICT DO NOTHING;
INSERT INTO public.books(book_id,isbn,title,category_id,published_year,price)
SELECT n, '978000000' || lpad(n::text,4,'0'),
 '図書館の本' || lpad(n::text,2,'0'), (n-1)%10+1, 2000+(n%25), 500+n*100
FROM generate_series(1,50) AS n ON CONFLICT DO NOTHING;
INSERT INTO public.book_authors(book_id,author_id)
SELECT n, (n-1)%30+1 FROM generate_series(1,50) AS n ON CONFLICT DO NOTHING;
INSERT INTO public.book_authors(book_id,author_id) VALUES (1,2),(2,3),(3,4),(4,5),(5,6)
ON CONFLICT DO NOTHING;
INSERT INTO public.copies(copy_id,book_id,barcode,acquired_on,status)
SELECT n, (n-1)%50+1, 'CP' || lpad(n::text,4,'0'), CURRENT_DATE-365,
 CASE WHEN n BETWEEN 61 AND 80 THEN 'loaned' ELSE 'available' END
FROM generate_series(1,80) AS n ON CONFLICT DO NOTHING;
INSERT INTO public.members(member_id,name,email,joined_on)
SELECT n, '会員' || lpad(n::text,2,'0'),
 CASE WHEN n=20 THEN NULL ELSE 'member' || n || '@example.test' END, CURRENT_DATE-400+n
FROM generate_series(1,20) AS n ON CONFLICT DO NOTHING;
-- IDs 1..80: historical returned loans; IDs 81..100: current loans on copies 61..80.
-- Current loans 81..90 are overdue; 91..100 are not yet due.
INSERT INTO public.loans(loan_id,copy_id,member_id,loaned_on,due_on,returned_on)
SELECT n,
 CASE WHEN n<=80 THEN (n-1)%60+1 ELSE n-20 END,
 (n-1)%20+1,
 CASE WHEN n<=80 THEN CURRENT_DATE-120+n ELSE CURRENT_DATE-30+(n-81) END,
 CASE WHEN n<=80 THEN CURRENT_DATE-106+n ELSE CURRENT_DATE-20+(n-81)*2 END,
 CASE WHEN n<=80 THEN CURRENT_DATE-110+n ELSE NULL END
FROM generate_series(1,100) AS n ON CONFLICT DO NOTHING;
-- Explicit IDs do not advance identity sequences.
SELECT setval(pg_get_serial_sequence('public.categories','category_id'),10,true);
SELECT setval(pg_get_serial_sequence('public.authors','author_id'),30,true);
SELECT setval(pg_get_serial_sequence('public.books','book_id'),50,true);
SELECT setval(pg_get_serial_sequence('public.copies','copy_id'),80,true);
SELECT setval(pg_get_serial_sequence('public.members','member_id'),20,true);
SELECT setval(pg_get_serial_sequence('public.loans','loan_id'),100,true);
