-- Boston Hacks 2026 shared routes from plans.enriched.json (version 1, 2026-11-20).
-- Source JSON lives at the root of the separate Boston-Hacks-2026-checkout.
-- Run the entire file in the original Vite project's Supabase SQL Editor.
-- From this checkout root, apply supabase/migrations/20261121000001_allow_unknown_popular_route_age_range.sql first.
-- Run supabase/verify-seed-plan.sql after the one-plan import.
-- The default selector imports only Cannoli Showdown. Set it to NULL for every complete plan.
-- Four plans are held back in full because these positions lack a Google Place ID:
--   kendall-skate-night #1 Skate at Canal District Kendall
--   eastie-skyline-loop #3 Santarpio's Pizza
--   blue-line-to-the-beach #1 Revere Beach, #2 Kelly's Roast Beef
--   coolidge-corner-movie-night #1 Brookline Booksmith, #2 Coolidge Corner Theatre, #3 Japonaise Bakery
-- UUIDs are UUIDv5 with the URL namespace and the name urn:boston-hacks-2026:enriched-plan:<slug>.
-- Stop arrays follow the source's explicit 1-based order.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('boston-hacks-2026:enriched-plan'));

CREATE TEMP TABLE seed_plans_source (
    slug text PRIMARY KEY CHECK (btrim(slug) <> ''),
    route_id uuid NOT NULL UNIQUE,
    name text NOT NULL CHECK (btrim(name) <> ''),
    neighborhood text,
    google_place_ids text[] NOT NULL CHECK (cardinality(google_place_ids) > 0)
) ON COMMIT DROP;

INSERT INTO seed_plans_source (slug, route_id, name, neighborhood, google_place_ids) VALUES
    ('cannoli-showdown', '9eb23859-f7e3-5d7a-a83a-839e5242b70d', 'Cannoli Showdown', 'North End',
     ARRAY['ChIJs0kxSjWo4okR6109vVboQ64', 'ChIJT6uL2Yhw44kRQC4VpTehlhs', 'ChIJSQ-HS4lw44kRA0iC6zNgsbU']::text[]),
    ('market-to-harbor', '0c43a967-7936-56c8-aec2-af49a154221f', 'Market to Harbor', 'Downtown Waterfront',
     ARRAY['ChIJH5ZbaI9w44kR2DZHaiooMtk', 'ChIJNdGapYdw44kRI811C71Xmao', 'ChIJiaZEVn1w44kRT-Riu2Bzf30', 'ChIJhdC_YH1w44kRSX0V1oo9pt0']::text[]),
    ('north-end-evening', 'a1cf62b8-af8c-58d9-816b-4d048798d389', 'North End Evening', 'North End',
     ARRAY['ChIJofQX5otw44kRqb2cIZLlfrw', 'ChIJKRXowbtz44kRORvv6Mx_MDw', 'ChIJT6uL2Yhw44kRQC4VpTehlhs']::text[]),
    ('freedom-trail-lite', '905cd322-9c04-5a6f-a19f-afc3765e7508', 'Freedom Trail Lite', 'Downtown',
     ARRAY['ChIJF3rvYGt444kR84UIiW8PNN0', 'ChIJDXUUlIRw44kRT_pEDqwG790', 'ChIJh-tZaIRw44kR140lhfNrc_g', 'ChIJpyiwa4Zw44kRBQSGWKv4wgA', 'ChIJSQ-HS4lw44kRA0iC6zNgsbU']::text[]),
    ('frog-pond-skate-and-cocoa', 'f97b4aa7-1615-552d-a21b-b5fc1f6be1d1', 'Frog Pond Skate and Cocoa', 'Boston Common',
     ARRAY['ChIJB939tp9w44kR4OL1wUOrtrc', 'EhtDaGFybGVzIFN0LCBCb3N0b24sIE1BLCBVU0EiLiosChQKEgmX67hHmXDjiRH4RhpC8GRCSRIUChIJT84qgp5w44kR2MRBT4FBDq0', 'ChIJlTGo_U5x44kRXD5QYryFWgs']::text[]),
    ('downtown-book-dig', 'd434d8a8-e9eb-547b-ab2f-c7367c66881a', 'Downtown Book Dig', 'Downtown Crossing',
     ARRAY['ChIJ6w6dMZ1w44kR_UV15er0TqU', 'ChIJQ6ujkkX42oARDshlYHXqfWs', 'ChIJlTGo_U5x44kRXD5QYryFWgs']::text[]),
    ('acorn-street-photo-walk', 'b300be32-ea45-5a50-9ce8-f347a6227fef', 'Acorn Street Photo Walk', 'Beacon Hill',
     ARRAY['EhtDaGFybGVzIFN0LCBCb3N0b24sIE1BLCBVU0EiLiosChQKEgmX67hHmXDjiRH4RhpC8GRCSRIUChIJT84qgp5w44kR2MRBT4FBDq0', 'ChIJhWeElZ5w44kRiPc12XE8H3Y', 'ChIJk4Int55w44kRIYkOLzCGl1s', 'ChIJQaVVg5xw44kRsHwgE2eA_GQ']::text[]),
    ('esplanade-sunset-loop', '013f7ce6-e27f-5c39-84ac-4f1f62a594c6', 'Esplanade Sunset Loop', 'Esplanade',
     ARRAY['ChIJszVjRqJw44kR4cN4jvmDeEg', 'ChIJPw35rvp544kRmrF_tPSFoiI', 'ChIJJ6Im5Jhw44kRap5Y5x2_XJw', 'ChIJu2Argp5w44kRAecWXgt_18s']::text[]),
    ('common-tree-lighting-night', 'e0951acc-5a63-59b5-bbc7-c845fc40cc92', 'Common Tree Lighting Night', 'Boston Common',
     ARRAY['ChIJKyNuvJ1w44kRBE-pe_yDhj8', 'ChIJJwQyH4Nw44kRwRUwT3EFdDc', 'ChIJoZacmYRw44kRz81praiJwLI']::text[]),
    ('first-week-in-boston', '436a7b15-bbad-54be-a2ec-38ecf403b30b', 'First Week in Boston', 'Boston Common / Back Bay',
     ARRAY['ChIJKyNuvJ1w44kRBE-pe_yDhj8', 'ChIJu2Argp5w44kRAecWXgt_18s', 'ChIJxWXLbQ9644kRv1Ax9nlEU5o', 'ChIJPWuhSAV644kRBAzOCF4Bqno']::text[]),
    ('library-and-lit-crawl', '0e283f55-9bdd-578a-bbb3-45fad9bb7bcc', 'Library and Lit Crawl', 'Back Bay',
     ARRAY['ChIJU_ibQgx644kRc6zBW_5d1Lk', 'ChIJPWuhSAV644kRBAzOCF4Bqno', 'ChIJNRQDqRp644kRSGnmtOTWXvA']::text[]),
    ('newbury-street-window-walk', '684b1c0d-d157-5af9-bc9f-971a65ef279a', 'Newbury Street Window Walk', 'Back Bay',
     ARRAY['ChIJu2Argp5w44kRAecWXgt_18s', 'ChIJxWXLbQ9644kRv1Ax9nlEU5o', 'ChIJD48FTwV644kRwgj7zV3pHHs', 'ChIJPWuhSAV644kRBAzOCF4Bqno']::text[]),
    ('comm-ave-mall-winter-lights', '60a5f2b4-07f1-5d65-8a98-94a7d8c55ba9', 'Comm Ave Mall Winter Lights', 'Back Bay',
     ARRAY['ChIJu2Argp5w44kRAecWXgt_18s', 'ChIJ7WAYMA9644kRatCfTRfbjps', 'ChIJPWuhSAV644kRBAzOCF4Bqno']::text[]),
    ('free-thursday-art-night', '23069047-cdab-5188-94ac-31b6627b8090', 'Free Thursday Art Night', 'Fenway',
     ARRAY['ChIJSYXWkop544kRvTojD82gxdo', 'ChIJS3rn5w1644kRZNWVxNY_Ay8', 'ChIJtSsNQLd544kRu-YMno6zDcI']::text[]),
    ('rainy-fenway-museum-day', 'd3218137-8174-53a7-ab5c-24b5a663d453', 'Rainy Fenway Museum Day', 'Fenway',
     ARRAY['ChIJS3rn5w1644kRZNWVxNY_Ay8', 'ChIJSYXWkop544kRvTojD82gxdo', 'ChIJtSsNQLd544kRu-YMno6zDcI']::text[]),
    ('fens-and-gardens-walk', '69570184-84d4-5901-864a-61ff44792b73', 'Fens and Gardens Walk', 'Fenway',
     ARRAY['ChIJEXx2Rxx644kRAYQg4Vefphc', 'ChIJq9vVrB9644kRFIkWw3hiqfE', 'ChIJSYXWkop544kRvTojD82gxdo', 'ChIJtSsNQLd544kRu-YMno6zDcI']::text[]),
    ('fenway-game-day', 'b4abd7cc-555a-5cab-9269-0d9504ecf547', 'Fenway Game Day', 'Fenway',
     ARRAY['ChIJheNsdx1644kRQEXiHdF6UTA', 'ChIJbz8lP_Z544kRBFV6ZMsNgKI', 'ChIJtSsNQLd544kRu-YMno6zDcI']::text[]),
    ('snowport-night', 'cf853faf-aa7c-5c4a-9a50-e8b06ef0732b', 'Snowport Night', 'Seaport',
     ARRAY['ChIJ7evxLTlx44kRcoKVKgX2PnQ', 'EjBIYXJib3J3YWxrICYgU2VhcG9ydCBCbHZkLCBCb3N0b24sIE1BIDAyMjEwLCBVU0EiZiJkChQKEgk3ez-HeHDjiRHD2LM8gS4RZhIUChIJN3s_h3hw44kRw9izPIEuEWYaFAoSCXWd-0x4cOOJER4Vws80PtZ4GhQKEgmTvM0bf3DjiREjXRH2iNb8ECIKDdUOPhkVRAOo1Q', 'ChIJxTCEOnlw44kROtPtIpMFsXo']::text[]),
    ('light-up-seaport', '542d6d3e-9e22-548e-8d4d-0c409beb10bd', 'Light Up Seaport', 'Seaport',
     ARRAY['ChIJXWnEI39w44kRRqpEMNMQ8GY', 'ChIJ7evxLTlx44kRcoKVKgX2PnQ', 'EjBIYXJib3J3YWxrICYgU2VhcG9ydCBCbHZkLCBCb3N0b24sIE1BIDAyMjEwLCBVU0EiZiJkChQKEgk3ez-HeHDjiRHD2LM8gS4RZhIUChIJN3s_h3hw44kRw9izPIEuEWYaFAoSCXWd-0x4cOOJER4Vws80PtZ4GhQKEgmTvM0bf3DjiREjXRH2iNb8ECIKDdUOPhkVRAOo1Q']::text[]),
    ('ica-free-thursday-and-fan-pier', 'b81d5858-ba06-5798-9a6f-2d3ab4de33d1', 'ICA Free Thursday and Fan Pier', 'Seaport',
     ARRAY['ChIJxTCEOnlw44kROtPtIpMFsXo', 'ChIJxWMZfX5w44kR-KcuxAhVhtE', 'ChIJk7zNG39w44kRI10R9ojW_BA']::text[]),
    ('tea-party-to-snowport', '84d1cdd1-1928-58ab-8054-cc9da7a1a1b6', 'Tea Party to Snowport', 'Fort Point',
     ARRAY['ChIJ4bwEPIBw44kRs7STmn977tE', 'ChIJE3_Xmn9644kRa-EdtLdShyc', 'ChIJ7evxLTlx44kRcoKVKgX2PnQ']::text[]),
    ('sowa-christmas-market-night', 'f49b636c-0e78-5400-a957-88c8088f86d5', 'SoWa Christmas Market Night', 'South End',
     ARRAY['ChIJCZW7nm5644kR-2qEbbiAJKc', 'ChIJzV9PsW9644kRinFuvjxqFqI', 'ChIJ-3NgJxV644kRbPGywx5FjBU']::text[]),
    ('sowa-first-friday', '1aa1613b-99a0-5258-9be6-384d399b67cc', 'SoWa First Friday', 'South End',
     ARRAY['ChIJb7btTG5644kRIzspg3tdArc', 'ChIJzV9PsW9644kRinFuvjxqFqI', 'EhtUcmVtb250IFN0LCBCb3N0b24sIE1BLCBVU0EiLiosChQKEgmPoapbF3rjiRFY68F8WUxWuxIUChIJ28p2uBR644kRGOnQAcK4Txc']::text[]),
    ('chinatown-dessert-run', 'bed0301e-a443-5ef4-8951-d428e41cf9c1', 'Chinatown Dessert Run', 'Chinatown',
     ARRAY['ChIJ-YyTcQB744kRhO6c0xHv8V8', 'ChIJrwxCHTJ744kR1ihIMwPQ_RM', 'ChIJoZacmYRw44kRz81praiJwLI']::text[]),
    ('chinatown-hot-pot-night', '7834b14c-3ec0-5897-bf84-4a90b44dcf9d', 'Chinatown Hot Pot Night', 'Chinatown',
     ARRAY['ChIJfXXFQ3h644kRzPUzSY4Y5aA', 'ChIJNV_xBgd744kRIn4AzdC3J8E', 'ChIJL8vfPXh644kR6sQ4_N8EPLQ']::text[]),
    ('downtown-crossing-rainy-afternoon', '2aea65d3-85ad-50af-be4d-9f705171247f', 'Downtown Crossing Rainy Afternoon', 'Downtown Crossing',
     ARRAY['ChIJ6w6dMZ1w44kR_UV15er0TqU', 'ChIJH5ZbaI9w44kR2DZHaiooMtk', 'ChIJoZacmYRw44kRz81praiJwLI']::text[]),
    ('harvard-square-book-crawl', '4d26d5d6-051c-542c-945e-724c16fdd6a8', 'Harvard Square Book Crawl', 'Harvard Square',
     ARRAY['ChIJDxpOQUN344kRQx6duCvjWYw', 'ChIJzeMXSEN344kR9ZoF6_WFWys', 'ChIJeR5CUF1344kRzZp_KviciKU', 'ChIJGXn4REN344kRoIRbQpxqE1A']::text[]),
    ('harvard-museums-afternoon', '19828c20-d53e-5020-8ee6-e99b2d024d5f', 'Harvard Museums Afternoon', 'Harvard Square',
     ARRAY['ChIJbaeXiER344kRR_f4e89EQuM', 'ChIJe9YuL0F344kRe7q8SEaMPWE', 'ChIJHQHIzlx344kRTpLoEhss3RM']::text[]),
    ('mount-auburn-cemetery-walk', '66cd4b75-53f6-59ff-8ab4-168ccd36c222', 'Mount Auburn Cemetery Walk', 'Harvard Square',
     ARRAY['ChIJHQHIzlx344kRTpLoEhss3RM', 'ChIJf4o76W9344kRN7D8WA28YVs', 'ChIJi_uCw4F344kR-dbyORL6vxw']::text[]),
    ('riverbank-and-weeks-bridge', '1e0c3156-ae3e-5d4b-8207-21d7ae762ee5', 'Riverbank and Weeks Bridge', 'Harvard Square',
     ARRAY['ChIJQaq4Slx344kROQhk-Oohgbw', 'ChIJjzNYF1d344kR08A8CZJhMWs', 'ChIJDxpOQUN344kRQx6duCvjWYw']::text[]),
    ('kendall-skate-night', 'e783896b-bd7f-5b91-9a7b-b60f9ccd5578', 'Kendall Skate Night', 'Kendall',
     ARRAY[NULL, 'ChIJMzhNVv5544kRqKx1Mlb1iLA', 'ChIJF3-Ltq5w44kRmtQs_tBFM-I']::text[]),
    ('thrift-and-kendall', '5a4a0851-2034-548e-8aca-f392aadb2587', 'Thrift and Kendall', 'Kendall',
     ARRAY['ChIJycrdx61w44kRRrGiEH8nGRU', 'ChIJMzhNVv5544kRqKx1Mlb1iLA', 'ChIJF3-Ltq5w44kRmtQs_tBFM-I']::text[]),
    ('mit-corridor-and-smoot-bridge', '555dca92-d732-5375-a38f-7b9f35babd9d', 'MIT Corridor and Smoot Bridge', 'Kendall',
     ARRAY['ChIJ6ZPQHapw44kR0GWA414vJOI', 'ChIJOwQCbKpw44kRq8xD4Cl-m74', 'ChIJi6NXQgR644kRT9UONmWxwXU', 'ChIJPw35rvp544kRmrF_tPSFoiI']::text[]),
    ('bow-market-night', 'cde8908a-e127-553e-85a0-321e52bd3dbd', 'Bow Market Night', 'Union Square, Somerville',
     ARRAY['ChIJPyxN1zR344kRXbeHLbcliiA', 'ChIJETri2jR344kR548MgOJDkm0', 'ChIJ3WhYLMtw44kRSGYMDNO7oU8']::text[]),
    ('porter-to-davis-bookstroll', '0c4c6997-7212-543d-ad74-ae3e6cb20d75', 'Porter to Davis Bookstroll', 'Somerville',
     ARRAY['ChIJRXB-Gj1344kRdaWPOQfNrkA', 'ChIJV1wE6Bh344kRUrVbHX8CkaM', 'ChIJoeqWSh9344kRe2ICgJs6oEQ']::text[]),
    ('somerville-flea-holiday-market', 'b28ff4e1-1b29-5177-890a-828c531fe0c4', 'Somerville Flea Holiday Market', 'Somerville',
     ARRAY['ChIJVaJSMi5344kREGYgiLWIfco', 'ChIJV1wE6Bh344kRUrVbHX8CkaM', 'Ei5Tb21lcnZpbGxlIENvbW11bml0eSBQYXRoLCBTb21lcnZpbGxlLCBNQSwgVVNBIi4qLAoUChIJi9WG4CN344kRgxKgO8nzFfESFAoSCWXh9Xspd-OJEQN7-diZd5B6']::text[]),
    ('community-path-glx-walk', 'b2ed4ed6-85e6-5381-bce7-271cd12ac082', 'Community Path GLX Walk', 'Somerville',
     ARRAY['ChIJr72N8dx244kRUVUeRqZYhc4', 'ChIJpf2Ueth244kRq5aOVLpoEP0', 'Ei5Tb21lcnZpbGxlIENvbW11bml0eSBQYXRoLCBTb21lcnZpbGxlLCBNQSwgVVNBIi4qLAoUChIJi9WG4CN344kRgxKgO8nzFfESFAoSCWXh9Xspd-OJEQN7-diZd5B6', 'ChIJsTiDir5w44kR4Jznwhc118w']::text[]),
    ('assembly-row-rainy-day', '1e2fa587-6119-50ef-95dd-1c82305091dd', 'Assembly Row Rainy Day', 'Somerville',
     ARRAY['ChIJyZFSZ-Nx44kR85NUePQYDYM', 'ChIJQ3Xr3thw44kR2Pn3NgITTGU', 'ChIJ0zzNR99w44kRviB-llzopCk']::text[]),
    ('climb-day', '2f7d7b7f-093e-5c36-ae96-18155d70089e', 'Climb Day', 'Somerville',
     ARRAY['ChIJw74QWDZ344kRGlRxj2SDTv4', 'ChIJZeH1eyl344kRA3v52Jl3kHo']::text[]),
    ('jp-perfect-day', 'e368c9a3-cd02-5205-a5c4-bdb4c7323e11', 'JP Perfect Day', 'Jamaica Plain',
     ARRAY['ChIJjzxRaW5544kR0OylQpEidVg', 'ChIJL_Ph13J544kRFsb24KWaoOk', 'ChIJaxH09Dh544kRyBRUrinxRfQ', 'ChIJLeAnL3d544kR-5ySCmGnFT4']::text[]),
    ('arboretum-winter-walk', '022bd02b-0339-56a7-9198-f1a43c8b230b', 'Arboretum Winter Walk', 'Jamaica Plain',
     ARRAY['ChIJbc2ddgB544kR5vpkGvkm8qo', 'ChIJfVNaTDF544kRX_8_gEkgcfE', 'ChIJ3TbbzWp544kR6zbOZS0MNnM', 'EhpDZW50cmUgU3QsIEJvc3RvbiwgTUEsIFVTQSIuKiwKFAoSCRG8DTIxeeOJEfpWVCL83v4aEhQKEgnRGeQrcnnjiRESGCayZ2wSMw']::text[]),
    ('brewery-and-centre-street', 'e7f3ecfd-92cd-5964-9d9a-b9578a763607', 'Brewery and Centre Street', 'Jamaica Plain',
     ARRAY['ChIJeRyjfXt544kRdjPWKIshi2A', 'ChIJtf3SqW5544kRmpw84IAz4fM', 'ChIJLeAnL3d544kR-5ySCmGnFT4']::text[]),
    ('eastie-skyline-loop', 'baea4216-2dfd-5de8-836b-cb4cea42cb4d', 'Eastie Skyline Loop', 'East Boston',
     ARRAY['ChIJc4qflWhw44kRChZpVxrY5c0', 'ChIJYZCJ4l1w44kRJepl5BZnZpQ', NULL]::text[]),
    ('tall-ship-skate', 'cae6c48b-7420-5b6c-823a-c5c88701ad68', 'Tall Ship Skate', 'East Boston',
     ARRAY['ChIJU_c2XmZw44kRcGOtEKiZnKI', 'ChIJc4qflWhw44kRChZpVxrY5c0', 'ChIJ_1r2FV1w44kRWHCVtxMiAe8']::text[]),
    ('blue-line-to-the-beach', '20fe8198-bf7a-5588-b063-14b323eb741c', 'Blue Line to the Beach', 'Revere',
     ARRAY[NULL, NULL]::text[]),
    ('coolidge-corner-movie-night', '38198b9f-7965-5dee-a4aa-17e490170ae8', 'Coolidge Corner Movie Night', 'Brookline',
     ARRAY[NULL, NULL, NULL]::text[]),
    ('bu-beach-to-smoot-bridge', '6b6a2159-35b5-5fa8-8cfe-1529f1bc67c1', 'BU Beach to Smoot Bridge', 'BU / Esplanade',
     ARRAY['ChIJ8dR9gPB544kRjSimW-0Eunw', 'ChIJPw35rvp544kRmrF_tPSFoiI', 'ChIJi6NXQgR644kRT9UONmWxwXU', 'ChIJjzNYF1d344kR08A8CZJhMWs']::text[]),
    ('student-museum-afternoon', 'a533f71b-15fe-5851-a855-8897bdb63c49', 'Student Museum Afternoon', 'Fenway',
     ARRAY['ChIJS3rn5w1644kRZNWVxNY_Ay8', 'ChIJSYXWkop544kRvTojD82gxdo', 'ChIJPWuhSAV644kRBAzOCF4Bqno']::text[]);

CREATE TEMP TABLE seed_plans_selected ON COMMIT DROP AS
WITH settings AS (
    SELECT 'cannoli-showdown'::text AS only_slug -- Change to NULL::text for the full import.
)
SELECT source.*
FROM seed_plans_source AS source
CROSS JOIN settings
WHERE (settings.only_slug IS NULL OR source.slug = settings.only_slug)
  AND array_position(source.google_place_ids, NULL) IS NULL;

CREATE TEMP TABLE seed_plans_stops ON COMMIT DROP AS
SELECT plan.route_id, plan.slug, stop.position::integer AS position, stop.google_place_id
FROM seed_plans_selected AS plan
CROSS JOIN LATERAL unnest(plan.google_place_ids)
    WITH ORDINALITY AS stop(google_place_id, position);

DO $preflight$
DECLARE
    problem text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seed_plans_selected) THEN
        RAISE EXCEPTION 'No complete plan matched the import selector.';
    END IF;

    SELECT format('%s at position %s', slug, position) INTO problem
    FROM seed_plans_stops
    WHERE btrim(google_place_id) = ''
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Blank Google Place ID in %.', problem;
    END IF;

    SELECT format('%s uses %s more than once', slug, google_place_id) INTO problem
    FROM seed_plans_stops
    GROUP BY slug, google_place_id
    HAVING count(*) > 1
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'The shared stop uniqueness constraint cannot preserve this repeat visit: %.', problem;
    END IF;

    SELECT place.google_place_id INTO problem
    FROM public.places AS place
    JOIN (SELECT DISTINCT google_place_id FROM seed_plans_stops) AS wanted USING (google_place_id)
    GROUP BY place.google_place_id
    HAVING count(*) > 1
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Multiple places rows match Google Place ID %.', problem;
    END IF;

    SELECT format('%s (existing route %s)', plan.slug, route.id) INTO problem
    FROM seed_plans_selected AS plan
    JOIN public.popular_routes AS route
      ON lower(btrim(route.name)) = lower(btrim(plan.name))
     AND route.id <> plan.route_id
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Shared route title already belongs to another record: %.', problem;
    END IF;
END
$preflight$;

-- Reuse exact matches and register any source IDs absent from the place catalog.
INSERT INTO public.places (google_place_id)
SELECT DISTINCT google_place_id
FROM seed_plans_stops
ON CONFLICT (google_place_id) DO NOTHING;

-- Add stops only for newly inserted routes. Existing routes are checked below.
WITH inserted_routes AS (
    INSERT INTO public.popular_routes (id, name, neighborhood)
    SELECT route_id, name, neighborhood
    FROM seed_plans_selected
    ON CONFLICT (id) DO NOTHING
    RETURNING id
)
INSERT INTO public.popular_route_stops (popular_route_id, position, place_id)
SELECT route.id, stop.position, place.id
FROM inserted_routes AS route
JOIN seed_plans_stops AS stop ON stop.route_id = route.id
JOIN public.places AS place ON place.google_place_id = stop.google_place_id;

DO $verify$
DECLARE
    problem text;
BEGIN
    SELECT plan.slug INTO problem
    FROM seed_plans_selected AS plan
    LEFT JOIN public.popular_routes AS route ON route.id = plan.route_id
    LEFT JOIN LATERAL (
        SELECT array_agg(stop.position ORDER BY stop.position) AS positions,
               array_agg(place.google_place_id ORDER BY stop.position) AS place_ids
        FROM public.popular_route_stops AS stop
        LEFT JOIN public.places AS place ON place.id = stop.place_id
        WHERE stop.popular_route_id = plan.route_id
    ) AS actual ON true
    WHERE route.id IS NULL
       OR (route.name, route.neighborhood) IS DISTINCT FROM (plan.name, plan.neighborhood)
       OR actual.positions IS DISTINCT FROM ARRAY(
           SELECT generate_series(1, cardinality(plan.google_place_ids))
       )
       OR actual.place_ids IS DISTINCT FROM plan.google_place_ids
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Stored title, neighborhood, or ordered stops differ for %. The import was rolled back.', problem;
    END IF;
END
$verify$;

COMMIT;
