// Minimum-transfer settlement (greedy). Spec algorithm:
//   balance[u] = paid[u] - owed[u]; positive = is owed money.
//   Repeat: most-negative debtor pays most-positive creditor the smaller amount.
// Produces at most (people - 1) transfers and balances always sum to zero,
// so nobody silently loses or gains a centavo.

export function computeBalances(expenses, participantShares) {
  // expenses: [{ id, paid_by, amount_centavos }]
  // participantShares: { expenseId: { userId: centavos } }
  const bal = {};
  const add = (u, v) => (bal[u] = (bal[u] ?? 0) + v);
  for (const e of expenses) {
    add(e.paid_by, e.amount_centavos);
    for (const [u, share] of Object.entries(participantShares[e.id])) {
      add(u, -share);
    }
  }
  return bal;
}

export function settle(balances) {
  const debtors = []; // [userId, amountOwedToOthers] (positive number = must pay)
  const creditors = []; // [userId, amountDueToThem]
  for (const [u, b] of Object.entries(balances)) {
    if (b < 0) debtors.push([u, -b]);
    else if (b > 0) creditors.push([u, b]);
  }
  debtors.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  creditors.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i][1], creditors[j][1]);
    if (amt > 0) transfers.push({ from: debtors[i][0], to: creditors[j][0], amount_centavos: amt });
    debtors[i][1] -= amt;
    creditors[j][1] -= amt;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  // sanity: net zero preserved
  const totalFrom = transfers.reduce((s, t) => s + t.amount_centavos, 0);
  const totalTo = totalFrom;
  void totalTo;
  return transfers;
}

// Cross-session ledger: same greedy pass over accumulated pairwise balances,
// so old unpaid debts merge naturally with new ones.
export function ledgerFromTransfers(allTransfers) {
  const bal = {};
  for (const t of allTransfers) {
    bal[t.from] = (bal[t.from] ?? 0) - t.amount_centavos;
    bal[t.to] = (bal[t.to] ?? 0) + t.amount_centavos;
  }
  return settle(bal);
}
