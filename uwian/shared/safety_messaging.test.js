import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Messaging Helper Logic Tests ── */
export function formatSnippet(text, maxLength = 50) {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) + "…" : trimmed;
}

export function computeUnread(messages, lastReadAt) {
  if (!lastReadAt) return messages.length;
  const readDate = new Date(lastReadAt);
  return messages.filter(m => new Date(m.created_at) > readDate).length;
}

export function validateReport(reason, category) {
  const validCategories = ["misconduct", "fake_id", "harassment", "spam", "other"];
  if (!reason || reason.trim().length < 10) {
    return { valid: false, error: "Reason must be at least 10 characters." };
  }
  if (!validCategories.includes(category)) {
    return { valid: false, error: "Invalid report category." };
  }
  return { valid: true };
}

export function verificationStatusLabel(status, rejectionNote) {
  switch (status) {
    case "approved":
      return { label: "Verified", badgeClass: "chip green", trusted: true };
    case "rejected":
      return { label: `Rejected: ${rejectionNote || "Needs review"}`, badgeClass: "chip red", trusted: false };
    case "pending":
      return { label: "Under Review", badgeClass: "chip amber", trusted: false };
    default:
      return { label: "Unverified", badgeClass: "chip ghost", trusted: false };
  }
}

describe("messaging features", () => {
  it("formats preview snippets correctly without breaking words abruptly", () => {
    assert.equal(formatSnippet("Hey what time are you heading out?"), "Hey what time are you heading out?");
    assert.equal(
      formatSnippet("Tara sa Cubao Expo tonight, sama raw sina Ben at Carla around 8pm!", 30),
      "Tara sa Cubao Expo tonight, sa…"
    );
    assert.equal(formatSnippet(""), "");
    assert.equal(formatSnippet(null), "");
  });

  it("calculates unread message count correctly against last_read_at", () => {
    const msgs = [
      { id: 1, created_at: "2026-10-07T10:00:00Z" },
      { id: 2, created_at: "2026-10-07T10:15:00Z" },
      { id: 3, created_at: "2026-10-07T10:30:00Z" },
    ];
    // Read up to 10:10 -> 2 unread
    assert.equal(computeUnread(msgs, "2026-10-07T10:10:00Z"), 2);
    // Read after all -> 0 unread
    assert.equal(computeUnread(msgs, "2026-10-07T10:45:00Z"), 0);
    // Never read -> all unread
    assert.equal(computeUnread(msgs, null), 3);
  });
});

describe("safety verification & moderation", () => {
  it("validates report submission input and requires descriptive reasons", () => {
    assert.deepEqual(validateReport("short", "misconduct"), {
      valid: false,
      error: "Reason must be at least 10 characters.",
    });
    assert.deepEqual(validateReport("Suspicious behavior at the venue", "invalid_cat"), {
      valid: false,
      error: "Invalid report category.",
    });
    assert.deepEqual(validateReport("Suspicious behavior at the venue", "misconduct"), {
      valid: true,
    });
    assert.deepEqual(validateReport("Inappropriate message in DM chat", "harassment"), {
      valid: true,
    });
  });

  it("produces correct trust states for verification badge labels", () => {
    assert.deepEqual(verificationStatusLabel("approved"), {
      label: "Verified",
      badgeClass: "chip green",
      trusted: true,
    });
    assert.deepEqual(verificationStatusLabel("rejected", "ID blur"), {
      label: "Rejected: ID blur",
      badgeClass: "chip red",
      trusted: false,
    });
    assert.deepEqual(verificationStatusLabel("pending"), {
      label: "Under Review",
      badgeClass: "chip amber",
      trusted: false,
    });
    assert.deepEqual(verificationStatusLabel("none"), {
      label: "Unverified",
      badgeClass: "chip ghost",
      trusted: false,
    });
  });
});
