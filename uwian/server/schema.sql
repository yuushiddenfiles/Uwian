-- Uwian schema. Money is INTEGER centavos everywhere.
PRAGMA journal_mode = WAL;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  birthdate     TEXT,                      -- self-declared; see docs/privacy.md
  can_drink     INTEGER NOT NULL DEFAULT 1,-- personal preference flag, editable by owner only
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE groups (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  vouches_required INTEGER NOT NULL DEFAULT 1 CHECK (vouches_required IN (1,2)),
  buddy_notify_min INTEGER NOT NULL DEFAULT 30,   -- escalation, configurable
  admin_notify_min INTEGER NOT NULL DEFAULT 60,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE direction_tags (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  label    TEXT NOT NULL                    -- "Norte", "Timog", ...
);

CREATE TABLE group_members (
  group_id        INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  role            TEXT NOT NULL CHECK (role IN ('admin','member')),
  status          TEXT NOT NULL CHECK (status IN ('active','pending_guest','removed')),
  direction_tag_id INTEGER REFERENCES direction_tags(id),
  invited_by      INTEGER REFERENCES users(id),
  can_vouch       INTEGER NOT NULL DEFAULT 1,   -- S6: lost after 2 strikes
  strikes         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE vouches (
  group_id      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  guest_user_id INTEGER NOT NULL REFERENCES users(id),
  voucher_id    INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, guest_user_id, voucher_id)
);

CREATE TABLE strikes (   -- S6 audit trail
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),          -- the voucher who gets the strike
  source_removed_user_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL                                     -- written reason required
);

CREATE TABLE spots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id          INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  lat               REAL NOT NULL, lng REAL NOT NULL,
  price_range       TEXT,                                  -- "$" | "$$" | "$$$"
  closes_at         TEXT,                                  -- "02:00"
  notes             TEXT,
  added_by          INTEGER NOT NULL REFERENCES users(id),
  last_confirmed_at TEXT                                   -- S5 freshness
);

CREATE TABLE spot_confirmations (   -- S5 one-tap "Bukas pa rin hanggang 2am?"
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id     INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  answer      TEXT NOT NULL CHECK (answer IN ('yes','no','changed')),
  new_details TEXT,
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id             INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  spot_id              INTEGER REFERENCES spots(id),
  starts_at            TEXT NOT NULL,
  designated_driver_id INTEGER REFERENCES users(id),
  uwian_deadline       TEXT,                 -- set when admin taps "Uwian na"
  status               TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN ('planning','open','wrapped','closed')),
  closed_tab_at        TEXT
);

CREATE TABLE rsvps (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL CHECK (status IN ('going','maybe','cant')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  paid_by         INTEGER NOT NULL REFERENCES users(id),
  amount_centavos INTEGER NOT NULL CHECK (amount_centavos >= 0),
  description     TEXT NOT NULL,
  is_alcohol      INTEGER NOT NULL DEFAULT 0,
  cash_in_hand    INTEGER NOT NULL DEFAULT 0,   -- "bayad-na-kamay" items settle at 0 balance
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  edited_after_close INTEGER NOT NULL DEFAULT 0 -- logged for the edit audit trail
);

CREATE TABLE expense_participants (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  share_centavos INTEGER NOT NULL,              -- frozen deterministic split, stored not recomputed
  PRIMARY KEY (expense_id, user_id)
);

CREATE TABLE settlements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_user       INTEGER NOT NULL REFERENCES users(id),
  to_user         INTEGER NOT NULL REFERENCES users(id),
  amount_centavos INTEGER NOT NULL CHECK (amount_centavos > 0),
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','paid_claimed','confirmed','disputed','voided')),
  note            TEXT,                          -- dispute note, visible to admin
  generated_round INTEGER NOT NULL DEFAULT 1     -- reopen regenerates; confirmed rows keep round
);

CREATE TABLE buddy_pairs (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_a INTEGER NOT NULL REFERENCES users(id),
  user_b INTEGER NOT NULL REFERENCES users(id),
  user_c INTEGER REFERENCES users(id),           -- trio case
  PRIMARY KEY (session_id, user_a, user_b)
);

CREATE TABLE checkins (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  mode       TEXT CHECK (mode IN ('walk','jeep','grab','taxi','friend_drive','own_drive','other')),
  home_confirmed_at TEXT,
  flag_stage        INTEGER NOT NULL DEFAULT 0,  -- 0 none, 1 reminded, 2 buddy notified, 3 escalated
  flag_cleared_by   INTEGER REFERENCES users(id),-- buddy taps "ok siya"
  ride_offer_from   INTEGER REFERENCES users(id),-- someone offered a ride to a self-driver
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE limit_counters (   -- S3 HANGGANAN — PRIVATE. Server rule: SELECT allowed ONLY WHERE user_id = :me.
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  lim        INTEGER,            -- personal limit in rounds; NULL = no limit, no nudges
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE notifications (    -- in-app queue; email mirror is optional & off by default
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,            -- 'uwian_reminder','buddy_alert','escalation','nudge','vouch','dispute'
  payload TEXT NOT NULL,         -- JSON
  read_at TEXT
);

CREATE TABLE audit_log (         -- "what if the split is wrong?" → every edit is traceable
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,          -- 'expense_edit','tab_reopened','member_removed',...
  detail TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Friendly indexes
CREATE INDEX idx_expenses_session ON expenses(session_id);
CREATE INDEX idx_settle_status ON settlements(status);
CREATE INDEX idx_notif_user ON notifications(user_id, read_at);
