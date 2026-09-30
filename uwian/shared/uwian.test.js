import { describe, it } from "node:test";
import assert from "node:assert/strict";

// S3 — Hangganan. Pure logic; the server enforces the privacy rule separately.
export function nudgeLevel(count, limit) {
  if (!limit || limit <= 0) return null; // walang nakatanggang hangganan = walang nuisance
  const pct = count / limit;
  if (pct >= 1) return "at_limit";
  if (pct >= 0.8) return "approaching";
  return null;
}

describe("hangganan nudges", () => {
  it("no limit set → no nagging ever", () => {
    assert.equal(nudgeLevel(50, null), null);
    assert.equal(nudgeLevel(50, 0), null);
  });
  it("80% → approaching, 100% → at_limit, in between → none", () => {
    assert.equal(nudgeLevel(4, 5), "approaching");
    assert.equal(nudgeLevel(3, 5), null);
    assert.equal(nudgeLevel(5, 5), "at_limit");
    assert.equal(nudgeLevel(7, 5), "at_limit"); // past the limit: still just a reminder, never a lockout
  });
});

// S2 — buddy pairing by direction tag; odd one out joins a trio. Never leaves anyone without a buddy.
export function pairBuddies(members) {
  const m = [...members];
  const groups = [];
  while (m.length > 0) {
    if (m.length === 3) {
      groups.push({ users: m.splice(0, 3) }); // trio beats leaving someone alone
    } else {
      groups.push({ users: m.splice(0, 2) });
    }
  }
  return groups;
}

describe("uwian buddy pairing", () => {
  it("pairs of two, odd one becomes a trio", () => {
    assert.deepEqual(pairBuddies(["a", "b", "c", "d"]), [{ users: ["a", "b"] }, { users: ["c", "d"] }]);
    assert.deepEqual(pairBuddies(["a", "b", "c"]), [{ users: ["a", "b", "c"] }]);
    assert.deepEqual(pairBuddies(["a", "b", "c", "d", "e"]), [
      { users: ["a", "b"] },
      { users: ["c", "d", "e"] },
    ]);
  });
  it("nobody is left buddy-less", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const m = Array.from({ length: n }, (_, i) => "u" + i);
      const covered = pairBuddies(m).flatMap((p) => p.users).sort();
      assert.deepEqual(covered, [...m].sort());
    }
  });
});

// Escalation ladder — pure time math so it's testable without a clock.
export function escalationStage(minutesPastDeadline, cfg = { buddyAt: 30, adminAt: 60 }) {
  if (minutesPastDeadline >= cfg.adminAt) return "admin_email_and_group_flag";
  if (minutesPastDeadline >= cfg.buddyAt) return "buddy_notified";
  if (minutesPastDeadline >= 0) return "self_reminder";
  return null;
}

describe("uwian escalation", () => {
  it("deadline → self, +30 → buddy, +60 → admin+flag", () => {
    assert.equal(escalationStage(0), "self_reminder");
    assert.equal(escalationStage(29), "self_reminder");
    assert.equal(escalationStage(30), "buddy_notified");
    assert.equal(escalationStage(59), "buddy_notified");
    assert.equal(escalationStage(60), "admin_email_and_group_flag");
    assert.equal(escalationStage(-1), null);
  });
});
