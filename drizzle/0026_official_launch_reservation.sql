-- One official GRAIN launch. Identity is immutable. Expiry never releases it by itself.
CREATE TABLE IF NOT EXISTS official_launch_reservation (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 mint TEXT NOT NULL,
 creator TEXT NOT NULL,
 metadata_hash TEXT NOT NULL,
 message_hash TEXT NOT NULL,
 signature TEXT NOT NULL,
 blockhash TEXT NOT NULL,
 expiry INTEGER NOT NULL,
 state TEXT NOT NULL CHECK (state IN ('reserved','registered')),
 created_at INTEGER NOT NULL
);
CREATE TABLE official_launch_attempt (
 signature TEXT PRIMARY KEY, mint TEXT NOT NULL, creator TEXT NOT NULL,
 metadata_hash TEXT NOT NULL, message_hash TEXT NOT NULL, blockhash TEXT NOT NULL,
 expiry INTEGER NOT NULL, created_at INTEGER NOT NULL, outcome TEXT NOT NULL DEFAULT 'reserved', evidence TEXT
);
CREATE TRIGGER official_launch_attempt_insert AFTER INSERT ON official_launch_reservation BEGIN
 INSERT INTO official_launch_attempt(signature,mint,creator,metadata_hash,message_hash,blockhash,expiry,created_at,outcome)
 VALUES(NEW.signature,NEW.mint,NEW.creator,NEW.metadata_hash,NEW.message_hash,NEW.blockhash,NEW.expiry,NEW.created_at,NEW.state);
END;
CREATE TRIGGER official_launch_identity_immutable BEFORE UPDATE ON official_launch_reservation
 WHEN NEW.mint!=OLD.mint OR NEW.creator!=OLD.creator OR NEW.metadata_hash!=OLD.metadata_hash
 BEGIN SELECT RAISE(ABORT,'Official launch identity is immutable'); END;
CREATE TRIGGER official_launch_attempt_update AFTER UPDATE OF signature,state ON official_launch_reservation BEGIN
 INSERT INTO official_launch_attempt(signature,mint,creator,metadata_hash,message_hash,blockhash,expiry,created_at,outcome)
 VALUES(NEW.signature,NEW.mint,NEW.creator,NEW.metadata_hash,NEW.message_hash,NEW.blockhash,NEW.expiry,NEW.created_at,NEW.state)
 ON CONFLICT(signature) DO UPDATE SET outcome=excluded.outcome;
END;
