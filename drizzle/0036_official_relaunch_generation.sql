-- Archive generation 1 and open generation 2. Historical rows stay. The live singleton is generation 2.
CREATE TABLE IF NOT EXISTS official_token (
 id INTEGER PRIMARY KEY,
 mint TEXT NOT NULL,
 pool TEXT NOT NULL,
 published_at TEXT NOT NULL,
 approval TEXT NOT NULL,
 token_program TEXT NOT NULL DEFAULT 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);
CREATE TABLE IF NOT EXISTS official_token_history (
 id INTEGER NOT NULL,
 generation INTEGER NOT NULL,
 mint TEXT NOT NULL,
 pool TEXT,
 token_program TEXT,
 published_at TEXT,
 approval TEXT,
 retired_at TEXT NOT NULL,
 status TEXT NOT NULL,
 PRIMARY KEY (generation, id)
);
INSERT INTO official_token_history (id,generation,mint,pool,token_program,published_at,approval,retired_at,status)
SELECT id,1,mint,pool,token_program,published_at,approval,'2026-10-04T00:00:00.000Z','previous-unsupported'
FROM official_token WHERE id=1
AND NOT EXISTS (SELECT 1 FROM official_token_history WHERE generation=1 AND id=1);
DELETE FROM official_token WHERE id=1;
ALTER TABLE official_token ADD COLUMN generation INTEGER NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS official_launch_reservation_history (
 id INTEGER NOT NULL,
 generation INTEGER NOT NULL,
 mint TEXT NOT NULL,
 creator TEXT NOT NULL,
 metadata_hash TEXT NOT NULL,
 message_hash TEXT NOT NULL,
 signature TEXT NOT NULL,
 blockhash TEXT NOT NULL,
 expiry INTEGER NOT NULL,
 state TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 retired_at TEXT NOT NULL,
 status TEXT NOT NULL,
 PRIMARY KEY (generation, id)
);
INSERT INTO official_launch_reservation_history (id,generation,mint,creator,metadata_hash,message_hash,signature,blockhash,expiry,state,created_at,retired_at,status)
SELECT id,1,mint,creator,metadata_hash,message_hash,signature,blockhash,expiry,state,created_at,'2026-10-04T00:00:00.000Z','previous-unsupported'
FROM official_launch_reservation WHERE id=1
AND NOT EXISTS (SELECT 1 FROM official_launch_reservation_history WHERE generation=1 AND id=1);
DELETE FROM official_launch_reservation WHERE id=1;
ALTER TABLE official_launch_reservation ADD COLUMN generation INTEGER NOT NULL DEFAULT 2;
ALTER TABLE official_launch_reservation ADD COLUMN buy_quote TEXT NOT NULL DEFAULT 'wXMR';
ALTER TABLE official_launch_reservation ADD COLUMN buy_amount_in TEXT NOT NULL DEFAULT '262000000000';
ALTER TABLE official_launch_reservation ADD COLUMN buy_min_out TEXT NOT NULL DEFAULT '36796048115908';
CREATE TRIGGER IF NOT EXISTS official_launch_generation_immutable
BEFORE UPDATE ON official_launch_reservation
WHEN NEW.generation!=OLD.generation OR NEW.buy_quote!=OLD.buy_quote OR NEW.buy_amount_in!=OLD.buy_amount_in OR NEW.buy_min_out!=OLD.buy_min_out
BEGIN SELECT RAISE(ABORT,'Official launch generation and creator buy are immutable'); END;

CREATE TABLE IF NOT EXISTS official_generation_identity (
 generation INTEGER PRIMARY KEY CHECK (generation=2),
 mint TEXT NOT NULL,
 metadata_hash TEXT NOT NULL,
 metadata_uri TEXT NOT NULL,
 approval_message TEXT NOT NULL,
 approval_signature TEXT NOT NULL,
 registered_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS official_generation_identity_immutable
BEFORE UPDATE ON official_generation_identity
BEGIN SELECT RAISE(ABORT,'Official generation identity is immutable'); END;
CREATE TRIGGER IF NOT EXISTS official_generation_identity_no_delete
BEFORE DELETE ON official_generation_identity
BEGIN SELECT RAISE(ABORT,'Official generation identity cannot be deleted'); END;
