-- Data fix: the admin customer form pre-fills "+252 61 ", which used to be
-- stored as a phone number (and as phoneKey "25261"), so every later customer
-- saved without a real number was rejected as a duplicate. A phone with fewer
-- than 7 digits is only a prefix: clear it. Schema unchanged.
UPDATE "Customer"
SET "phone" = NULL, "phoneKey" = NULL
WHERE "phone" IS NOT NULL
  AND length(regexp_replace("phone", '\D', '', 'g')) < 7;
