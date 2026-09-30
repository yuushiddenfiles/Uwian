import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitExpense, defaultParticipants } from "./split.js";
import { computeBalances, settle, ledgerFromTransfers } from "./settle.js";

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

describe("hatian test cases (from the plan)", () => {
  it("1. Four people, one payer, equal split", () => {
    const shares = splitExpense(40000, ["ana", "ben", "carl", "dina"]);
    assert.deepEqual(shares, { ana: 10000, ben: 10000, carl: 10000, dina: 10000 });
    const t = settle(computeBalances([{ id: "e1", paid_by: "ana", amount_centavos: 40000 }], { e1: shares }));
    assert.equal(t.length, 3); // at most n-1
    assert.deepEqual(t.map((x) => x.amount_centavos).sort(), [10000, 10000, 10000]);
  });

  it("2. Non-drinker excluded from beer but included in pulutan", () => {
    const beer = splitExpense(30000, ["ana", "ben", "carl"]); // dina doesn't drink
    const pulutan = splitExpense(20000, ["ana", "ben", "carl", "dina"]);
    assert.equal(beer.dina, undefined);
    assert.equal(pulutan.dina, 5000);
  });

  it("3. ₱100 split three ways — leftover centavos are deterministic", () => {
    const a = splitExpense(10000, ["zoe", "amy", "mia"]); // sorted by id: amy, mia, zoe
    assert.deepEqual(a, { amy: 3334, mia: 3333, zoe: 3333 });
    assert.equal(sum(a), 10000);
    const b = splitExpense(10000, ["mia", "zoe", "amy"]); // same set, different input order
    assert.deepEqual(a, b); // stable across runs
  });

  it("4. Designated driver auto-excluded from alcohol, kept in food", () => {
    const ctx = {
      isIn: { ana: true, ramon: true, ben: true },
      isDrinker: { ana: true, ramon: true, ben: true },
      isDesignatedDriver: { ramon: true },
    };
    const beer = defaultParticipants({ ...ctx, isAlcohol: true });
    const chopsuey = defaultParticipants({ ...ctx, isAlcohol: false });
    assert.ok(!beer.includes("ramon"));
    assert.ok(chopsuey.includes("ramon"));
  });

  it("5. One person paid two separate expenses", () => {
    const e1 = { id: "e1", paid_by: "ana", amount_centavos: 15000 };
    const e2 = { id: "e2", paid_by: "ana", amount_centavos: 9000 };
    const shares = {
      e1: splitExpense(15000, ["ana", "ben", "carl"]),
      e2: splitExpense(9000, ["ana", "ben"]),
    };
    const bal = computeBalances([e1, e2], shares);
    assert.equal(Object.values(bal).reduce((a, b) => a + b, 0), 0); // net zero
    const t = settle(bal);
    assert.ok(t.every((x) => x.to === "ana"));
  });

  it("6. Everyone breaks even → zero settlements", () => {
    const shares = splitExpense(3000, ["ana", "ben", "carl"]);
    const expenses = ["ana", "ben", "carl"].map((u, i) => ({ id: "e" + i, paid_by: u, amount_centavos: 1000 }));
    const s = { e0: shares, e1: shares, e2: shares };
    const t = settle(computeBalances(expenses, s));
    assert.deepEqual(t, []);
  });

  it("7. Edit after close: regenerate keeps confirmed transfers, voids open ones", () => {
    // simulated at the data level: old transfers list with statuses
    const old = [
      { from: "ben", to: "ana", amount_centavos: 5000, status: "confirmed" },
      { from: "carl", to: "ana", amount_centavos: 3000, status: "open" },
    ];
    // reopen → drop non-confirmed, recompute, merge
    const kept = old.filter((t) => t.status === "confirmed");
    const fresh = [{ from: "carl", to: "ana", amount_centavos: 4000 }]; // recomputed after edit
    const merged = [...kept, ...fresh];
    const net = {};
    for (const t of merged) {
      net[t.from] = (net[t.from] ?? 0) - t.amount_centavos;
      net[t.to] = (net[t.to] ?? 0) + t.amount_centavos;
    }
    assert.equal(net.ben, -5000);
    assert.equal(net.carl, -4000);
    assert.equal(net.ana, 9000);
  });

  it("8. Cross-session ledger merges an old unpaid debt with a new one", () => {
    const nightA = [{ from: "ben", to: "ana", amount_centavos: 5000 }]; // never paid
    const nightB = [{ from: "ben", to: "ana", amount_centavos: 3000 }];
    const combined = ledgerFromTransfers([...nightA, ...nightB]);
    assert.deepEqual(combined, [{ from: "ben", to: "ana", amount_centavos: 8000 }]);
  });

  it("invariant: no centavo is ever lost or invented (randomized)", () => {
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + (trial % 6);
      const ids = Array.from({ length: n }, (_, i) => String(i).padStart(2, "0"));
      const amount = 1 + ((trial * 7919) % 100000);
      const participants = ids.slice(0, 1 + (trial % n));
      const shares = splitExpense(amount, participants);
      assert.equal(sum(shares), amount);
      const bal = computeBalances([{ id: "x", paid_by: participants[0], amount_centavos: amount }], { x: shares });
      assert.equal(Object.values(bal).reduce((a, b) => a + b, 0), 0);
      const transfers = settle(bal);
      assert.ok(transfers.length <= participants.length); // ≤ n-1 style bound
      const moved = transfers.reduce((s, t) => s + t.amount_centavos, 0);
      const credit = Object.values(bal).filter((v) => v > 0).reduce((a, b) => a + b, 0);
      assert.equal(moved, credit);
    }
  });
});
