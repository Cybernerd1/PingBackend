-- Demo login + sample ("dummy") profiles for testing.
-- Demo account: demo@ping.app / Demo@1234 (bcrypt hash below).
-- Dummy users are only visible to demo accounts and can't sign in (no password / Google id).
-- Idempotent: every insert is ON CONFLICT DO NOTHING and dependents join on users that exist.
INSERT INTO "users" ("id","email","password","is_email_verified","full_name","username","birthdate","gender","bio","location_lat","location_lng","location_sharing","onboarding_completed","onboarding_step","is_demo","is_dummy") VALUES
  ('00000000-0000-4000-8000-0000000000d0', 'demo@ping.app', '$2b$10$j6K6RfyYo2fMkVczar7r4uHZewC50zBGUl5HsCFQM1JtfSVjCjVna', true, 'Demo User', 'demo_user', '1999-01-01', 'prefer_not_to_say', 'Just exploring Ping. Say hi!', 28.6139, 77.209, true, true, 'completed', true, false),
  ('00000000-0000-4000-8000-000000000001', 'aanya.sharma@dummy.ping.app', NULL, true, 'Aanya Sharma', 'aanya_sharma_demo', '2000-03-14', 'female', 'Chai over coffee, always. Weekend trekker and amateur photographer looking for someone to get lost in the mountains with.', 28.6339, 77.2190, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000002', 'rohan.mehta@dummy.ping.app', NULL, true, 'Rohan Mehta', 'rohan_mehta_demo', '1998-07-22', 'male', 'Product designer by day, guitarist by night. I will absolutely judge your playlist (kindly).', 28.5839, 77.2490, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000003', 'isha.kapoor@dummy.ping.app', NULL, true, 'Isha Kapoor', 'isha_kapoor_demo', '1999-11-05', 'female', 'Bookworm with a soft spot for street food and long walks. Tell me the last book that wrecked you.', 28.6639, 77.1890, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000004', 'kabir.singh@dummy.ping.app', NULL, true, 'Kabir Singh', 'kabir_singh_demo', '1997-01-30', 'male', 'Gym, cricket, and the best butter chicken in town — I know a place. Looking for my partner in crime for road trips.', 28.6939, 77.3190, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000005', 'meera.iyer@dummy.ping.app', NULL, true, 'Meera Iyer', 'meera_iyer_demo', '2001-06-18', 'female', 'Classical dancer, part-time plant mom. I make a mean filter coffee and expect good conversation in return.', 28.5539, 77.1590, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000006', 'arjun.nair@dummy.ping.app', NULL, true, 'Arjun Nair', 'arjun_nair_demo', '1996-09-09', 'male', 'Software engineer who would rather be scuba diving. Ask me about my failed sourdough experiments.', 28.7339, 77.2390, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000007', 'sara.khan@dummy.ping.app', NULL, true, 'Sara Khan', 'sara_khan_demo', '1998-04-27', 'female', 'Stand-up comedy nights, thrift hauls and spontaneous weekend getaways. Bonus points if you can make me laugh.', 28.5139, 77.2890, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000008', 'vikram.rao@dummy.ping.app', NULL, true, 'Vikram Rao', 'vikram_rao_demo', '1995-12-12', 'male', 'Mountains > beaches. Amateur astronomer — I will drag you out at 3am to see a meteor shower.', 28.6539, 77.3590, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-000000000009', 'priya.desai@dummy.ping.app', NULL, true, 'Priya Desai', 'priya_desai_demo', '1997-08-03', 'female', 'Startup founder, marathon runner, dog person. Let’s grab a coffee and talk big ideas.', 28.7639, 77.1090, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-00000000000a', 'dev.malhotra@dummy.ping.app', NULL, true, 'Dev Malhotra', 'dev_malhotra_demo', '2000-02-16', 'male', 'Film nerd and home chef. I will cook you dinner and then make you watch a 3-hour movie.', 28.5939, 77.0890, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-00000000000b', 'naina.verma@dummy.ping.app', NULL, true, 'Naina Verma', 'naina_verma_demo', '1999-05-25', 'female', 'Painter, museum hopper and K-pop enthusiast. Looking for someone who appreciates a slow Sunday.', 28.6839, 77.2690, true, true, 'completed', false, true),
  ('00000000-0000-4000-8000-00000000000c', 'aditya.joshi@dummy.ping.app', NULL, true, 'Aditya Joshi', 'aditya_joshi_demo', '1998-10-01', 'male', 'Footballer on weekends, podcast addict on weekdays. Let’s find the best momos in the city together.', 28.4739, 77.2290, true, true, 'completed', false, true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "photos" ("user_id","url","public_id","order")
SELECT v.uid::uuid, v.url, v.pid, v.ord FROM (VALUES
  ('00000000-0000-4000-8000-0000000000d0', 'https://randomuser.me/api/portraits/lego/5.jpg', 'seed/demo-0', 0),
  ('00000000-0000-4000-8000-000000000001', 'https://randomuser.me/api/portraits/women/44.jpg', 'seed/dummy-1-0', 0),
  ('00000000-0000-4000-8000-000000000001', 'https://randomuser.me/api/portraits/women/51.jpg', 'seed/dummy-1-1', 1),
  ('00000000-0000-4000-8000-000000000002', 'https://randomuser.me/api/portraits/men/32.jpg', 'seed/dummy-2-0', 0),
  ('00000000-0000-4000-8000-000000000002', 'https://randomuser.me/api/portraits/men/39.jpg', 'seed/dummy-2-1', 1),
  ('00000000-0000-4000-8000-000000000003', 'https://randomuser.me/api/portraits/women/68.jpg', 'seed/dummy-3-0', 0),
  ('00000000-0000-4000-8000-000000000003', 'https://randomuser.me/api/portraits/women/75.jpg', 'seed/dummy-3-1', 1),
  ('00000000-0000-4000-8000-000000000004', 'https://randomuser.me/api/portraits/men/45.jpg', 'seed/dummy-4-0', 0),
  ('00000000-0000-4000-8000-000000000004', 'https://randomuser.me/api/portraits/men/52.jpg', 'seed/dummy-4-1', 1),
  ('00000000-0000-4000-8000-000000000005', 'https://randomuser.me/api/portraits/women/21.jpg', 'seed/dummy-5-0', 0),
  ('00000000-0000-4000-8000-000000000005', 'https://randomuser.me/api/portraits/women/28.jpg', 'seed/dummy-5-1', 1),
  ('00000000-0000-4000-8000-000000000006', 'https://randomuser.me/api/portraits/men/11.jpg', 'seed/dummy-6-0', 0),
  ('00000000-0000-4000-8000-000000000006', 'https://randomuser.me/api/portraits/men/18.jpg', 'seed/dummy-6-1', 1),
  ('00000000-0000-4000-8000-000000000007', 'https://randomuser.me/api/portraits/women/12.jpg', 'seed/dummy-7-0', 0),
  ('00000000-0000-4000-8000-000000000007', 'https://randomuser.me/api/portraits/women/19.jpg', 'seed/dummy-7-1', 1),
  ('00000000-0000-4000-8000-000000000008', 'https://randomuser.me/api/portraits/men/76.jpg', 'seed/dummy-8-0', 0),
  ('00000000-0000-4000-8000-000000000008', 'https://randomuser.me/api/portraits/men/83.jpg', 'seed/dummy-8-1', 1),
  ('00000000-0000-4000-8000-000000000009', 'https://randomuser.me/api/portraits/women/90.jpg', 'seed/dummy-9-0', 0),
  ('00000000-0000-4000-8000-000000000009', 'https://randomuser.me/api/portraits/women/97.jpg', 'seed/dummy-9-1', 1),
  ('00000000-0000-4000-8000-00000000000a', 'https://randomuser.me/api/portraits/men/52.jpg', 'seed/dummy-10-0', 0),
  ('00000000-0000-4000-8000-00000000000a', 'https://randomuser.me/api/portraits/men/59.jpg', 'seed/dummy-10-1', 1),
  ('00000000-0000-4000-8000-00000000000b', 'https://randomuser.me/api/portraits/women/33.jpg', 'seed/dummy-11-0', 0),
  ('00000000-0000-4000-8000-00000000000b', 'https://randomuser.me/api/portraits/women/40.jpg', 'seed/dummy-11-1', 1),
  ('00000000-0000-4000-8000-00000000000c', 'https://randomuser.me/api/portraits/men/64.jpg', 'seed/dummy-12-0', 0),
  ('00000000-0000-4000-8000-00000000000c', 'https://randomuser.me/api/portraits/men/71.jpg', 'seed/dummy-12-1', 1)
) AS v(uid, url, pid, ord)
JOIN "users" u ON u.id = v.uid::uuid
WHERE NOT EXISTS (SELECT 1 FROM "photos" p WHERE p.public_id = v.pid);
--> statement-breakpoint
INSERT INTO "user_interests" ("user_id","interest_id")
SELECT v.uid::uuid, i.id FROM (VALUES
  ('00000000-0000-4000-8000-000000000001', 'Trekking'),
  ('00000000-0000-4000-8000-000000000001', 'Photography'),
  ('00000000-0000-4000-8000-000000000001', 'Tea'),
  ('00000000-0000-4000-8000-000000000001', 'Mountains'),
  ('00000000-0000-4000-8000-000000000001', 'Travel'),
  ('00000000-0000-4000-8000-000000000002', 'Guitar'),
  ('00000000-0000-4000-8000-000000000002', 'Design'),
  ('00000000-0000-4000-8000-000000000002', 'Live Music'),
  ('00000000-0000-4000-8000-000000000002', 'Coffee'),
  ('00000000-0000-4000-8000-000000000002', 'Startups'),
  ('00000000-0000-4000-8000-000000000003', 'Books'),
  ('00000000-0000-4000-8000-000000000003', 'Street Food'),
  ('00000000-0000-4000-8000-000000000003', 'Poetry'),
  ('00000000-0000-4000-8000-000000000003', 'Cats'),
  ('00000000-0000-4000-8000-000000000003', 'Museums'),
  ('00000000-0000-4000-8000-000000000004', 'Gym'),
  ('00000000-0000-4000-8000-000000000004', 'Cricket'),
  ('00000000-0000-4000-8000-000000000004', 'Road Trips'),
  ('00000000-0000-4000-8000-000000000004', 'Foodie'),
  ('00000000-0000-4000-8000-000000000004', 'Netflix'),
  ('00000000-0000-4000-8000-000000000005', 'Dance'),
  ('00000000-0000-4000-8000-000000000005', 'Gardening'),
  ('00000000-0000-4000-8000-000000000005', 'Coffee'),
  ('00000000-0000-4000-8000-000000000005', 'Yoga'),
  ('00000000-0000-4000-8000-000000000005', 'Theatre'),
  ('00000000-0000-4000-8000-000000000006', 'Coding'),
  ('00000000-0000-4000-8000-000000000006', 'Swimming'),
  ('00000000-0000-4000-8000-000000000006', 'Baking'),
  ('00000000-0000-4000-8000-000000000006', 'AI'),
  ('00000000-0000-4000-8000-000000000006', 'Beach Days'),
  ('00000000-0000-4000-8000-000000000007', 'Stand-up Comedy'),
  ('00000000-0000-4000-8000-000000000007', 'Thrifting'),
  ('00000000-0000-4000-8000-000000000007', 'Weekend Getaways'),
  ('00000000-0000-4000-8000-000000000007', 'Fashion'),
  ('00000000-0000-4000-8000-000000000007', 'Podcasts'),
  ('00000000-0000-4000-8000-000000000008', 'Stargazing'),
  ('00000000-0000-4000-8000-000000000008', 'Hiking'),
  ('00000000-0000-4000-8000-000000000008', 'Camping'),
  ('00000000-0000-4000-8000-000000000008', 'Science'),
  ('00000000-0000-4000-8000-000000000008', 'Books'),
  ('00000000-0000-4000-8000-000000000009', 'Running'),
  ('00000000-0000-4000-8000-000000000009', 'Startups'),
  ('00000000-0000-4000-8000-000000000009', 'Dogs'),
  ('00000000-0000-4000-8000-000000000009', 'Coffee'),
  ('00000000-0000-4000-8000-000000000009', 'Tech'),
  ('00000000-0000-4000-8000-00000000000a', 'Movies'),
  ('00000000-0000-4000-8000-00000000000a', 'Cooking'),
  ('00000000-0000-4000-8000-00000000000a', 'Anime'),
  ('00000000-0000-4000-8000-00000000000a', 'Board Games'),
  ('00000000-0000-4000-8000-00000000000a', 'Wine Tasting'),
  ('00000000-0000-4000-8000-00000000000b', 'Painting'),
  ('00000000-0000-4000-8000-00000000000b', 'Art'),
  ('00000000-0000-4000-8000-00000000000b', 'K-Pop'),
  ('00000000-0000-4000-8000-00000000000b', 'Museums'),
  ('00000000-0000-4000-8000-00000000000b', 'Reading'),
  ('00000000-0000-4000-8000-00000000000c', 'Football'),
  ('00000000-0000-4000-8000-00000000000c', 'Podcasts'),
  ('00000000-0000-4000-8000-00000000000c', 'Street Food'),
  ('00000000-0000-4000-8000-00000000000c', 'Video Games'),
  ('00000000-0000-4000-8000-00000000000c', 'Cycling'),
  ('00000000-0000-4000-8000-0000000000d0', 'Travel'),
  ('00000000-0000-4000-8000-0000000000d0', 'Coffee'),
  ('00000000-0000-4000-8000-0000000000d0', 'Movies'),
  ('00000000-0000-4000-8000-0000000000d0', 'Live Music')
) AS v(uid, name)
JOIN "users" u ON u.id = v.uid::uuid
JOIN "interests" i ON i.name = v.name
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "preferences" ("user_id","interested_in","min_age","max_age","max_distance_km")
SELECT v.uid::uuid, v.ii, v.mn, v.mx, v.km FROM (VALUES
  ('00000000-0000-4000-8000-0000000000d0', ARRAY['everyone'], 18, 45, 100),
  ('00000000-0000-4000-8000-000000000001', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000002', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000003', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000004', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000005', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000006', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000007', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000008', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-000000000009', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-00000000000a', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-00000000000b', ARRAY['everyone'], 18, 45, 50),
  ('00000000-0000-4000-8000-00000000000c', ARRAY['everyone'], 18, 45, 50)
) AS v(uid, ii, mn, mx, km)
JOIN "users" u ON u.id = v.uid::uuid
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "privacy_settings" ("user_id")
SELECT u.id FROM "users" u WHERE u.is_demo OR u.is_dummy
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Most sample profiles have already liked the demo user, so liking them back makes a match.
INSERT INTO "swipes" ("swiper_id","swiped_id","direction")
SELECT v.uid::uuid, '00000000-0000-4000-8000-0000000000d0'::uuid, 'like' FROM (VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000006'),
  ('00000000-0000-4000-8000-000000000008'),
  ('00000000-0000-4000-8000-000000000009'),
  ('00000000-0000-4000-8000-00000000000b'),
  ('00000000-0000-4000-8000-00000000000c')
) AS v(uid)
JOIN "users" u ON u.id = v.uid::uuid
WHERE EXISTS (SELECT 1 FROM "users" d WHERE d.id = '00000000-0000-4000-8000-0000000000d0'::uuid)
ON CONFLICT DO NOTHING;
