-- One official shortcut reservation. Signed/uncertain attempts are never recycled.
CREATE TABLE IF NOT EXISTS official_creator_buy_reservation (
 mint TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL,
 review_id TEXT UNIQUE NOT NULL, message_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 signature TEXT UNIQUE, signed_at INTEGER,
 CHECK ((signature IS NULL AND signed_at IS NULL) OR (signature IS NOT NULL AND signed_at IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS official_creator_buy_signed_immutable
BEFORE UPDATE ON official_creator_buy_reservation
WHEN OLD.signature IS NOT NULL AND (
 NEW.mint != OLD.mint OR NEW.owner != OLD.owner OR NEW.review_id != OLD.review_id OR
 NEW.message_hash != OLD.message_hash OR NEW.expires_at != OLD.expires_at OR
 NEW.created_at != OLD.created_at OR NEW.signature IS NOT OLD.signature OR NEW.signed_at IS NOT OLD.signed_at
)
BEGIN SELECT RAISE(ABORT, 'Signed official creator buy is immutable'); END;
CREATE TRIGGER IF NOT EXISTS official_creator_buy_no_delete
BEFORE DELETE ON official_creator_buy_reservation
BEGIN SELECT RAISE(ABORT, 'Official creator buy reservation cannot be deleted'); END;
