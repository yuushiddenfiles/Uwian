import { $, api, h, toast, openSheet, avatar, fmtPeso, lampFor, MODES, timeAgo, pesoToCents } from "./util.js";

let ME_ = null;
export const me = () => ME_;
export async function loadMe() { ME_ = (await api("/api/me")).user; return ME_; }

/* ---------------- auth ---------------- */
export function pageLogin() {
  const email = h("input", { placeholder: "email", type: "email" });
  const pw = h("input", { placeholder: "password", type: "password" });
  return h("div", { class: "panel enter", style: "max-width:460px;margin:60px auto" },
    h("h2", {}, "Maligayang pagbabalik"),
    h("p", { class: "dim" }, "Ipasok ang details ng barkada membership mo."),
    h("label", { class: "f" }, "Email"), email,
    h("label", { class: "f" }, "Password"), pw,
    h("div", { class: "row", style: "margin-top:18px" },
      h("button", { class: "btn brass", onclick: async () => {
        try { await api("/api/login", { email: email.value, password: pw.value }); location.hash = "/groups"; }
        catch (e) { toast(e.message, true); pw.classList.add("shake"); setTimeout(() => pw.classList.remove("shake"), 500); }
      } }, "Tao, tara"),
      h("a", { href: "#/signup", class: "dim" }, "Bago ka ba? Gumawa ng account")),
    h("hr", { class: "plank" }),
    h("p", { class: "dim" }, "Demo: ana@barkada.demo … ela@barkada.demo / BarkadaDemo!2026"));
}

export function pageSignup() {
  const name = h("input", { placeholder: "Pangalan" });
  const email = h("input", { placeholder: "email", type: "email" });
  const pw = h("input", { placeholder: "password (8+)", type: "password" });
  const bday = h("input", { type: "date" });
  return h("div", { class: "panel enter", style: "max-width:460px;margin:60px auto" },
    h("h2", {}, "Sumali sa barkada"),
    h("p", { class: "dim" }, "Kailangan 18 pataas. Self-declared ang birthdate — ipapaliwanag sa documentation kung paano ito tinatrato, hindi totoong age verification."),
    h("label", { class: "f" }, "Pangalan"), name,
    h("label", { class: "f" }, "Email"), email,
    h("label", { class: "f" }, "Password"), pw,
    h("label", { class: "f" }, "Birthdate (18+)"), bday,
    h("button", { class: "btn brass", style: "margin-top:18px", onclick: async () => {
      try { await api("/api/signup", { name: name.value, email: email.value, password: pw.value, birthdate: bday.value }); location.hash = "/groups"; }
      catch (e) { toast(e.message, true); }
    } }, "Gumawa ng account"));
}

/* ---------------- groups list ---------------- */
export async function pageGroups() {
  const gs = await api("/api/groups");
  const box = h("div", { class: "enter" },
    h("div", { class: "panel" }, h("h2", {}, "Mga barkada ko"),
      gs.length === 0 ? h("p", { class: "dim" }, "Wala pang grupo.") : null,
      ...gs.map((g) => h("div", { class: "list-row card-hover", style: "cursor:pointer", onclick: () => (location.hash = `/g/${g.id}`) },
        avatar(g.name), h("div", { class: "grow" }, h("b", {}, g.name),
          h("div", { class: "dim" }, g.role === "admin" ? "admin ka dito" : "member")),
        h("span", { class: "chip brass" }, g.role)))),
    h("div", { class: "panel" },
      h("h3", {}, "Bagong grupo"),
      (() => { const n = h("input", { placeholder: "ngalan ng barkada" });
        return h("div", { class: "row" }, n, h("button", { class: "btn brass", onclick: async () => {
          if (!n.value.trim()) return toast("May pangalan na.", true);
          const r = await api("/api/groups", { name: n.value.trim() }); location.hash = `/g/${r.id}`;
        } }, "Bumuo ng grupo")); })()));
  return box;
}

/* ---------------- group home ---------------- */
export async function pageGroup(gid) {
  const d = await api(`/api/groups/${gid}`);
  const ledger = await api(`/api/groups/${gid}/ledger`);
  const spots = await api(`/api/groups/${gid}/spots`);
  d.spotsList = spots;
  const isAdmin = d.members.find((m) => m.user_id === me().id)?.role === "admin";

  const upcoming = d.sessions.filter((s) => s.status !== "closed").slice(0, 3);
  const el = h("div", { class: "enter" });

  el.append(h("div", { class: "panel" },
    h("div", { class: "row spread" },
      h("h2", {}, d.group.name),
      h("div", { class: "row" },
        h("button", { class: "btn ghost", onclick: () => inviteFlow(gid) }, "Imbitahan"),
        isAdmin ? h("button", { class: "btn", onclick: () => sessionForm(gid, d) }, "+ Inuman") : null))));

  // vouch queue
  if (d.pending.length) el.append(h("div", { class: "panel" },
    h("h2", {}, "Vouch queue"),
    ...d.pending.map((p) => h("div", { class: "list-row" }, avatar(p.name),
      h("div", { class: "grow" }, h("b", {}, p.name), h("div", { class: "dim" }, `${p.vouches}/${d.group.vouches_required} vouch`)),
      h("button", { class: "btn good", onclick: async () => {
        const r = await api(`/api/groups/${gid}/vouch/${p.user_id}`, {});
        toast(r.accepted ? "Pasok na siya!" : `Yakap na ${r.have}/${r.need}`); pageGroupRerender(gid);
      } }, "I-vouch")))));

  // sessions
  el.append(h("div", { class: "panel" }, h("h2", {}, "Mga inuman"),
    upcoming.length ? null : h("p", { class: "dim" }, "Walang nakadelanheng inuman. Mag-settle up lang ng dating tab."),
    ...upcoming.map((s) => h("div", { class: "list-row card-hover", style: "cursor:pointer", onclick: () => (location.hash = `/s/${s.id}`) },
      h("div", { class: "grow" }, h("b", {}, new Date(s.starts_at + "Z").toLocaleString()),
        h("div", { class: "dim" }, statusLabel(s.status))),
      h("span", { class: "chip brass" }, statusLabel(s.status)))),
    ...d.sessions.filter((s) => s.status === "closed").slice(0, 3).map((s) => h("div", { class: "list-row", style: "opacity:.7;cursor:pointer", onclick: () => (location.hash = `/s/${s.id}`) },
      h("div", { class: "grow" }, new Date(s.starts_at + "Z").toLocaleDateString(), h("span", { class: "chip" }, "tapos na"))))));

  // ledger summary (S4)
  el.append(h("div", { class: "panel" }, h("h2", {}, "Kabuuan ng utang (lahat ng inuman)"),
    ledger.length === 0 ? h("p", { class: "stamp", style: "color:var(--green);font-weight:700;font-size:18px" }, "✔ WALANG UTANG. Solid.") :
      h("div", { class: "receipt" },
        ...ledger.map((t) => h("div", { class: "line" }, h("span", {}, `${nameOf(d, t.from)} → ${nameOf(d, t.to)}`), h("span", {}, fmtPeso(t.amount_centavos)))),
        h("div", { class: "line total" }, h("span", {}, `${ledger.length} transfer ang pinaka-maliit`), h("span", {}, "")))));

  // members & direction tags
  el.append(h("div", { class: "panel" }, h("h2", {}, "Mga kasama at direksyon"),
    ...d.members.map((m) => h("div", { class: "list-row" }, avatar(m.name),
      h("div", { class: "grow" }, h("b", {}, m.name),
        m.can_drink ? null : h("span", { class: "chip" }, "hindi umiinom"),
        m.strikes > 0 && isAdmin ? h("span", { class: "chip red" }, `${m.strikes} strike`) : null),
      h("select", { style: "width:auto", onchange: async (e) => {
        if (m.user_id !== me().id) return toast("Sarili mo lang ang pwede mong tag-an.", true), e.target.blur();
        await api("/api/me/direction", { group_id: gid, direction_tag_id: e.target.value ? Number(e.target.value) : null }, "PUT");
        toast("Salamat — mas madaling mag-pair ng buddy.");
      } },
        h("option", { value: "" }, "walang direksyon"),
        ...d.tags.map((t) => h("option", { value: t.id, selected: m.direction_tag_id === t.id }, t.label))))),
    isAdmin ? h("div", { class: "row", style: "margin-top:12px" },
      (() => { const l = h("input", { placeholder: "bagong direksyon (Norte/Timog…)", style: "max-width:220px" });
        return [l, h("button", { class: "btn", onclick: async () => {
          await api(`/api/groups/${gid}/tags`, { label: l.value }); pageGroupRerender(gid);
        } }, "+ tag")]; })()) : null));

  // map teaser + settings
  el.append(h("div", { class: "grid2" },
    h("div", { class: "panel card-hover", style: "cursor:pointer", onclick: () => (location.hash = `/map/${gid}`) },
      h("h2", {}, "Tambayan map"),
      h("p", { class: "dim" }, `${spots.length} spot${spots.some((s) => s.stale) ? " · may kailangang i-verify" : ""}`),
      h("p", {}, "Buksan pamamagitan ng mapa ng inyong mga paborito.")),
    isAdmin ? h("div", { class: "panel" }, h("h2", {}, "Settings"),
      settingsPanel(gid, d)) : null));
  return el;
}

const statusLabel = (s) => ({ planning: "planning", open: "bukás ang tab", wrapped: "uwian na", closed: "tapos na" }[s] ?? s);
const nameOf = (d, uid) => d.members.find((m) => m.user_id === Number(uid))?.name ?? d.allNames?.[uid] ?? `User ${uid}`;

function settingsPanel(gid, d) {
  const vq = h("select", { style: "width:auto" },
    h("option", { value: 1, selected: d.group.vouches_required === 1 }, "1 vouch"),
    h("option", { value: 2, selected: d.group.vouches_required === 2 }, "2 vouch"));
  const buddyMin = h("input", { type: "number", value: d.group.buddy_notify_min, style: "width:90px" });
  const adminMin = h("input", { type: "number", value: d.group.admin_notify_min, style: "width:90px" });
  return h("div", {},
    h("label", { class: "f" }, "Kailangang vouch para sumali"), vq,
    h("label", { class: "f" }, "Alerta sa buddy (minuto pagkatapos ng deadline)"), buddyMin,
    h("label", { class: "f" }, "Escalation sa admin (minuto)"), adminMin,
    h("button", { class: "btn brass", style: "margin-top:14px", onclick: async () => {
      await api(`/api/groups/${gid}/settings`, { vouches_required: Number(vq.value), buddy_notify_min: Number(buddyMin.value), admin_notify_min: Number(adminMin.value) }, "PATCH");
      toast("Nai-save ang settings.");
    } }, "I-save"));
}

async function inviteFlow(gid) {
  const r = await api(`/api/groups/${gid}/invite`, {});
  openSheet("Invitation", h("div", {},
    h("p", { class: "dim" }, "I-share ang link na ito sa taong kilala ninyo. Dadaan siya sa vouch bago makapasok — basta’t hindi basta estranghero."),
    h("div", { class: "inset", style: "font-family:var(--font-mono)" }, `${location.origin}${r.invite_url}`),
    h("button", { class: "btn", style: "margin-top:12px", onclick: () => { navigator.clipboard?.writeText(`${location.origin}${r.invite_url}`); toast("Nakopya!"); } }, "Kopyahin")));
}

function sessionForm(gid, d) {
  const when = h("input", { type: "datetime-local" });
  const spotSel = h("select", {}, h("option", { value: "" }, "— walang spot —"), ...d.spotsList?.map?.((s) => h("option", { value: s.id }, s.name)) ?? []);
  const ddSel = h("select", {}, h("option", { value: "" }, "wala pang DD"), ...d.members.map((m) => h("option", { value: m.user_id }, m.name)));
  openSheet("Bagong inuman", h("div", {},
    h("label", { class: "f" }, "Kailan"), when,
    h("label", { class: "f" }, "Saan (pump muna sa map)"), spotSel,
    h("label", { class: "f" }, "Designated driver (malayo sa alak, awtomatiko)"), ddSel,
    h("p", { class: "dim" }, "Ang DD ay awtomatikong hindi kasama sa lahat ng alcohol item. Kaya rin siyang baguhin mamaya."),
    h("button", { class: "btn brass", onclick: async () => {
      const r = await api(`/api/groups/${gid}/sessions`, { starts_at: when.value, designated_driver_id: ddSel.value ? Number(ddSel.value) : null });
      location.hash = `/s/${r.id}`;
    } }, "Itakda ang inuman")));
}

function pageGroupRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/g/${gid}`)); }

/* ---------------- session screen ---------------- */
export async function pageSession(sid) {
  const d = await api(`/api/sessions/${sid}`);
  const gid = d.session.group_id;
  const gd = await api(`/api/groups/${gid}`);
  const isAdmin = gd.members.find((m) => m.user_id === me().id)?.role === "admin";
  const nameOfU = (uid) => gd.members.find((m) => m.user_id === Number(uid))?.name ?? d.session.designated_driver_name ?? `#${uid}`;
  const el = h("div", { class: "enter" });

  // header card
  el.append(h("div", { class: "panel" },
    h("div", { class: "row spread" },
      h("div", {}, h("h2", {}, new Date(d.session.starts_at + "Z").toLocaleString()),
        d.spot ? h("p", { class: "dim" }, `📍 ${d.spot.name}`) : null),
      h("span", { class: "chip brass" }, statusLabel(d.session.status))),
    d.session.designated_driver_id ? h("div", { class: "inset", style: "margin-top:8px" },
      h("b", { style: "color:var(--green)" }, "🚗 Designated driver: "), nameOfU(d.session.designated_driver_id),
      h("span", { class: "dim" }, " — hindi siya kasama sa anumang alak. Awtomatiko, hindi kalimutan.")) : null));

  // RSVP
  const my = d.rsvps.find((r) => r.user_id === me().id);
  el.append(h("div", { class: "panel" }, h("h2", {}, "Sino darating"),
    h("div", { class: "row", style: "margin-bottom:10px" },
      ...["going", "maybe", "cant"].map((st) => h("button", {
        class: `btn ${my?.status === st ? "brass" : ""}`, onclick: async () => {
          await api(`/api/sessions/${sid}/rsvp`, { status: st }); pageSessionRerender(sid);
        } }, { going: "Darating", maybe: "Baka", cant: "Hindi kaya" }[st]))),
    h("div", { class: "receipt" },
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const r = d.rsvps.find((x) => x.user_id === m.user_id);
        return h("div", { class: "line" }, h("span", {}, m.name + (m.user_id === me().id ? " (kayo)" : "")),
          h("span", {}, r ? { going: "✔ darating", maybe: "? baka", cant: "✖ hindi" }[r.status] : "—"));
      }))));

  // tabs: Tab | Settle | Uwian | Hangganan
  const tabBar = h("div", { class: "tabbar" });
  const tabBody = h("div", {});
  const tabs = { tab: "Hatian", settle: "Settle up", uwian: "Uwian", limit: "Hangganan" };
  let cur = "tab";
  for (const [key, label] of Object.entries(tabs)) {
    const b = h("button", { class: "tab", onclick: () => { cur = key; render(); } }, label);
    b.dataset.k = key; tabBar.append(b);
  }
  el.append(tabBar, tabBody);
  function render() {
    [...tabBar.children].forEach((b) => b.classList.toggle("on", b.dataset.k === cur));
    tabBody.innerHTML = "";
    tabBody.append(cur === "tab" ? tabHatian() : cur === "settle" ? tabSettle() : cur === "uwian" ? tabUwian() : tabHangganan());
  }

  /* ---- Hatian tab ---- */
  function tabHatian() {
    const wrap = h("div", { class: "panel" });
    if (d.session.status !== "closed")
      wrap.append(addExpenseForm(d, sid, nameOfU, () => pageSessionRerender(sid)));
    else wrap.append(h("p", { class: "dim" }, "Sarado na ang tab. " + (isAdmin ? "Pwede mong i-reopen para mag-edit." : "Kausapin ang admin kung may mali.")));
    const total = d.expenses.reduce((s, e) => s + e.amount_centavos, 0);
    wrap.append(h("h2", {}, "Ngayong gabi"),
      h("div", { class: "receipt" },
        ...d.expenses.map((e) => {
          const parts = Object.keys(d.shares[e.id] ?? {});
          return h("div", {},
            h("div", { class: "line" }, h("span", {}, `${e.is_alcohol ? "🍺" : "🍽"} ${e.description}`),
              h("span", {}, `${fmtPeso(e.amount_centavos)} — bayad ni ${e.payer_name ?? nameOfU(e.paid_by)}`)),
            h("div", { class: "dim", style: "padding:2px 0 8px;color:#6b5c44" },
              `kasama: ${parts.map(nameOfU).join(", ") || "—"}` +
              (e.edited_after_close ? " · ⟨ini-edit pagkatapos i-lock⟩" : ""));
        }),
        h("div", { class: "line total" }, h("span", {}, "KABUUAN"), h("span", {}, fmtPeso(total)))));
    return wrap;
  }

  /* ---- Settle tab ---- */
  function tabSettle() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Hatian — pinakakaunting transfer"));
    if (isAdmin && d.session.status !== "closed")
      wrap.append(h("button", { class: "btn brass", onclick: async () => {
        await api(`/api/sessions/${sid}/close-tab`, {}); toast("Naipatupô ang tab. Walang ma-e-edit nang walang reopen."); pageSessionRerender(sid);
      } }, "Isara ang tab ✍"));
    if (!d.settlements.length) return wrap.append(h("p", { class: "dim" }, "Wala pang settlements — isara ang tab kapag tapos na ang gabi.")), wrap;
    for (const t of d.settlements) {
      const mine_payer = t.from_user === me().id, mine_recv = t.to_user === me().id;
      const row = h("div", { class: "list-row" }, avatar(t.from_name ?? nameOfU(t.from_user)),
        h("div", { class: "grow" }, h("b", {}, `${t.from_name ?? nameOfU(t.from_user)} → ${t.to_name ?? nameOfU(t.to_user)}`),
          h("span", { class: `chip ${t.status === "confirmed" ? "green" : t.status === "disputed" ? "red" : t.status === "paid_claimed" ? "amber" : ""}` },
            { open: "bukás", paid_claimed: "sinabing bayad na", confirmed: "✔ confirmed", disputed: "disputed" }[t.status]),
          t.note ? h("div", { class: "dim" }, `"${t.note}"`) : null),
        h("span", { class: "money" }, fmtPeso(t.amount_centavos)));
      if (mine_payer && t.status === "open")
        row.append(h("button", { class: "btn good", onclick: async () => { await api(`/api/settlements/${t.id}/claim-paid`, {}); pageSessionRerender(sid); } }, "Nagbayad na ako"));
      if (mine_recv && t.status === "paid_claimed")
        row.append(
          h("button", { class: "btn good", onclick: async () => { await api(`/api/settlements/${t.id}/confirm`, {}); toast("Salamat. Ayos na."); pageSessionRerender(sid); } }, "Oo, natanggap ko"),
          h("button", { class: "btn bad", onclick: () => disputeForm(t.id, sid) }, "Hindi, may problema"));
      wrap.append(row);
    }
    if (isAdmin && d.session.status === "closed")
      wrap.append(h("button", { class: "btn ghost", style: "margin-top:12px", onclick: async () => {
        const r = await api(`/api/sessions/${sid}/reopen`, {}); toast(r.note); pageSessionRerender(sid);
      } }, "I-reopen ang tab (void ang unpaid, mananatili ang confirmed)"));
    return wrap;
  }

  /* ---- Uwian tab ---- */
  function tabUwian() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Uwian — pauwi tayo ng maayos"));
    if (isAdmin && d.session.status === "open")
      wrap.append(h("button", { class: "btn brass", onclick: async () => {
        const deadline = new Date(Date.now() + 45 * 60000).toISOString().slice(0, 19).replace("T", " ");
        await api(`/api/sessions/${sid}`, { status: "wrapped", uwian_deadline: deadline }, "PATCH");
        toast("Uwian na! Na-pair ang mga buddy base sa direksyon."); pageSessionRerender(sid);
      } }, "Uwian na 🏠"));
    const myCi = d.checkins.find((c) => c.user_id === me().id);
    if (!myCi?.home_confirmed_at) {
      const modeSel = h("select", { style: "width:auto" }, ...Object.entries(MODES).map(([k, v]) => h("option", { value: k }, v)));
      wrap.append(h("div", { class: "row inset" },
        h("b", {}, "Paano ka uuwi?"), modeSel,
        h("button", { class: "btn good", onclick: async () => {
          await api(`/api/sessions/${sid}/checkin`, { mode: modeSel.value });
          toast("Naka-check-in ka. Ingatan ang daan."); pageSessionRerender(sid);
        } }, "Nakauwi na ako ✔")));
    }
    // roster with lamps
    wrap.append(h("h3", { style: "margin-top:16px" }, "Sino nakauwi na"),
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const ci = d.checkins.find((c) => c.user_id === m.user_id);
        const rsvp = d.rsvps.find((r) => r.user_id === m.user_id);
        if (rsvp?.status === "cant") return null;
        const row = h("div", { class: "list-row" }, avatar(m.name), lampFor(ci),
          h("div", { class: "grow" }, m.name,
            ci?.mode ? h("span", { class: "dim" }, ` · ${MODES[ci.mode]}`) : null,
            ci?.ride_offer_from ? h("span", { class: "chip green" }, "may nag-alok ng sakay") : null),
          ci?.flag_stage >= 2 && !ci?.home_confirmed_at
            ? h("button", { class: "btn", onclick: async () => {
                const pair = d.buddy_pairs.find((p) => [p.user_a, p.user_b, p.user_c].includes(m.user_id));
                if (!pair) return toast("Wala kayang buddy pair — admin tawagan.", true);
                await api(`/api/buddies/${sid}/${pair.user_a}/${pair.user_b}/clear-flag`, {});
                toast("Na-clear ang flag. Salamat sa pagtingin sa isa’t isa."); pageSessionRerender(sid);
              } }, "Nakausap ko na, ok siya")
            : null);
        // friendly ride offer for self-drivers who aren't the DD
        if (ci?.mode === "own_drive" && d.session.designated_driver_id !== m.user_id && !ci.ride_offer_from && m.user_id !== me().id)
          row.append(h("button", { class: "btn ghost", onclick: async () => {
            await api(`/api/buddies/${sid}/${m.user_id}/0/offer-ride`, {}); toast("Nag-alok ka ng sakay. Maraming salamat."); pageSessionRerender(sid);
          } }, "May saklaw ka ba?"));
        return row;
      }));
    // buddies
    if (d.buddy_pairs.length) wrap.append(h("h3", { style: "margin-top:16px" }, "Mga buddy (parehong direksyon)"),
      h("div", { class: "receipt" }, ...d.buddy_pairs.map((p) =>
        h("div", { class: "line" }, h("span", {}, p.names.join(" + ")), h("span", {}, "isa’t isa’yansiyas")))));
    wrap.append(h("p", { class: "dim" }, "Paalala: hindi rescue service ang app na ito. Ang escalation ay paalala lamang na tumawag. Kung tunay na emergency, tawagan ang iyong lokal na hotline."));
    return wrap;
  }

  /* ---- Hangganan tab (private!) ---- */
  function tabHangganan() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Hangganan mo"),
      h("p", { class: "dim" }, "Pribado ito — ikaw lang ang makakakita ng bilang mo, kahit ang admin. Reminder lang ito sa sariling limitasyon; hindi ito kalkulador ng alcohol at hindi sukatan ng pagkalasing."));
    const board = h("div", { class: "tally-board" });
    const limIn = h("input", { type: "number", min: 1, style: "width:90px" });
    const stamp = h("span", { class: "stamp", hidden: true, style: "font:700 26px var(--font-display);color:var(--red);border:3px solid var(--red);border-radius:8px;padding:2px 10px;transform:rotate(-8deg)" }, "PRIBADO — IKAW LANG");
    async function refresh() {
      const r = await api(`/api/sessions/${sid}/limit`);
      board.innerHTML = "";
      const show = Math.max(r.lim ?? 0, r.count, 8);
      for (let i = 1; i <= Math.min(show, 12); i++)
        board.append(h("div", { class: `tally ${i <= r.count ? "full" : "empty"}` }, i <= r.count ? "𝖷" : "·"));
      const pct = r.lim ? r.count / r.lim : 0;
      if (pct >= 0.8) board.append(h("div", { class: "chip " + (pct >= 1 ? "red" : "amber") },
        pct >= 1 ? "Abot ka na sa hangganan mo. Ayusin na ang pang-uwi?" : "Malapit ka na. Ayusin na ang pang-uwi?"));
      if (pct >= 0.8) board.append(h("button", { class: "btn", onclick: () => { cur = "uwian"; render(); } }, "Check-in na"));
    }
    const push = h("button", { class: "round-push", onclick: async () => {
      const r = await api(`/api/sessions/${sid}/limit/tap`, {});
      if (navigator.vibrate) navigator.vibrate(30);
      if (r.level) toast(r.level === "at_limit" ? "Abot hangganan — ayusin na ang pang-uwi?" : "Malapit ka na sa hangganan mo.");
      refresh();
    } }, "+ 1 round");
    wrap.append(h("div", { class: "row spread" }, board, stamp),
      h("div", { class: "row", style: "margin-top:14px" }, push,
        h("label", { class: "f", style: "margin:0" }, "Limitasyon ko (rounds)"), limIn,
        h("button", { class: "btn", onclick: async () => { await api(`/api/sessions/${sid}/limit`, { limit: limIn.value ? Number(limIn.value) : null }, "PUT"); refresh(); toast("Na-update ang hangganan mo."); } }, "Itakda")));
    stamp.hidden = false;
    refresh();
    return wrap;
  }

  render();
  return el;
}

function addExpenseForm(d, sid, nameOfU, done) {
  const desc = h("input", { placeholder: "ano ito? (beer bucket, sisig…)" });
  const amt = h("input", { placeholder: "halaga ₱", inputmode: "decimal", style: "max-width:130px" });
  const payer = h("select", { style: "width:auto" }, ...d.members.map((m) => h("option", { value: m.user_id, selected: m.user_id === me().id }, m.name)));
  let isAlcohol = true;
  const togg = h("span", { class: "toggle on", onclick: () => { isAlcohol = !isAlcohol; togg.classList.toggle("on", isAlcohol); note.textContent = isAlcohol ? alcoholNote(d) : "Pagkain at non-alcohol: lahat ng naroon ang kabahagi." } },
    h("span", { class: "slot" }, h("span", { class: "knob" })), h("span", {}, "alak"));
  const note = h("p", { class: "dim" }, alcoholNote(d));
  function alcoholNote(sess) {
    const dd = sess.session.designated_driver_name;
    return dd ? `Awtomatiko: hindi kasama si ${dd} sa alak, kasama rin ang hindi umiinom. Bago pa man — i-adjust sa ibaba.` : "Markahang alak: awtomatikong hindi kasama ang designated driver.";
  }
  const checks = h("div", { class: "row" }, ...d.members.map((m) => {
    const cb = h("input", { type: "checkbox", checked: true, style: "width:auto" });
    cb.dataset.uid = m.user_id;
    return h("label", { class: "chip", style: "display:inline-flex;gap:6px;align-items:center" }, cb, m.name);
  }));
  return h("div", { class: "inset", style: "margin-bottom:14px" },
    h("div", { class: "row" }, desc, amt, payer, togg),
    h("div", { class: "row", style: "margin-top:8px" }, h("span", { class: "dim" }, "Kasama sa bahagi:"), checks),
    note,
    h("button", { class: "btn brass", style: "margin-top:10px", onclick: async () => {
      const cents = pesoToCents(amt.value);
      if (!cents) return toast("Halaga: numero lang, hal. 450 o 450.50", true);
      const chosen = [...checks.querySelectorAll("input")].filter((c) => c.checked).map((c) => c.dataset.uid);
      await api(`/api/sessions/${sid}/expenses`, { amount_centavos: cents, description: desc.value || "item", is_alcohol: isAlcohol ? 1 : 0, paid_by: Number(payer.value), participants: chosen });
      toast("Naitala ang gastusin."); done();
    } }, "Idagdag sa tab"));
}

function disputeForm(id, sid) {
  const note = h("textarea", { placeholder: "Ano ang problema? Makikita ito ng admin." });
  openSheet("I-dispute ang transfer", h("div", {}, note,
    h("button", { class: "btn bad", style: "margin-top:12px", onclick: async () => {
      if (!note.value.trim()) return toast("Isulat ang dahilan.", true);
      await api(`/api/settlements/${id}/dispute`, { note: note.value }); toast("Na-mark as disputed. Nakita na ng admin."); pageSessionRerender(sid);
    } }, "I-dispute")));
}

function pageSessionRerender(sid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/s/${sid}`)); }

/* ---------------- tambayan map ---------------- */
export async function pageMap(gid) {
  const spots = await api(`/api/groups/${gid}/spots`);
  const gd = await api(`/api/groups/${gid}`);
  const nameOfU = (uid) => gd.members.find((m) => m.user_id === Number(uid))?.name ?? `#${uid}`;
  const el = h("div", { class: "enter" },
    h("div", { class: "panel" }, h("h2", {}, "Tambayan map"),
      h("p", { class: "dim" }, "I-double-click ang mapa para mag-drop ng bagong spot. Leaflet + OpenStreetMap — walang API key.")),
    h("div", { class: "map-frame" }, h("div", { id: "map" })),
    h("div", { class: "panel" }, h("h2", {}, "Mga spot"),
      ...spots.map((sp) => h("div", { class: "list-row" },
        h("div", { class: "pin-spot" + (sp.stale ? " pin-stale" : ""), style: "flex:none" }),
        h("div", { class: "grow" }, h("b", {}, sp.name),
          h("div", { class: "dim" }, `${sp.price_range ?? ""} · sarado ${sp.closes_at ?? "?"} · ${sp.notes ?? ""}`),
          h("div", { class: "dim" }, `huling confirm: ${timeAgo(sp.last_confirmed_at)}${sp.stale ? " · UNVERIFIED — 60+ araw" : ""}`)),
        h("div", { class: "row" },
          h("button", { class: "btn good", onclick: () => confirmSpot(sp.id, "yes") }, "Bukas pa rin ✔"),
          h("button", { class: "btn", onclick: () => confirmSpot(sp.id, "changed") }, "May bago"),
          h("button", { class: "btn bad", onclick: () => confirmSpot(sp.id, "no") }, "Sarado na"))))));
  requestAnimationFrame(() => {
    const map = L.map("map").setView([14.676, 121.0437], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    for (const sp of spots) {
      const icon = L.divIcon({ className: "", html: `<div class="pin-spot${sp.stale ? " pin-stale" : ""}"></div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
      L.marker([sp.lat, sp.lng], { icon }).addTo(map)
        .bindPopup(`<b>${sp.name}</b><br>${sp.notes ?? ""}<br><i>${sp.stale ? "unverified — kumpirmahin na" : "ni " + nameOfU(sp.added_by)}</i>`);
    }
    map.on("dblclick", async (e) => {
      const nm = prompt("Pangalan ng spot:"); if (!nm) return;
      await api(`/api/groups/${gid}/spots`, { name: nm, lat: e.latlng.lat, lng: e.latlng.lng, price_range: "$$", closes_at: "02:00", notes: "" });
      toast("Naidagdag ang spot sa mapa."); pageMapRerender(gid);
    });
  });
  async function confirmSpot(id, answer) {
    let closes_at = null, new_details = null;
    if (answer === "changed") {
      closes_at = prompt("Bagong oras ng pagsara (HH:MM, iwanan kung di-bago)?") || null;
      new_details = prompt("Iba pang bago? (optional)") || null;
    }
    await api(`/api/spots/${id}/confirm`, { answer, closes_at, new_details });
    toast(answer === "no" ? "Na-mark na sarado. Salamat sa pag-update." : "Salamat — fresh na ang spot.");
    pageMapRerender(gid);
  }
  return el;
}
function pageMapRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/map/${gid}`)); }

/* ---------------- notifications drawer ---------------- */
export async function bellDrawer() {
  const notifs = await api("/api/me/notifications");
  openSheet("Mga mensahe", h("div", {},
    notifs.length === 0 ? h("p", { class: "dim" }, "Malinis ang lahat. ✔") : null,
    ...notifs.map((n) => {
      const p = JSON.parse(n.payload);
      return h("div", { class: "list-row" },
        h("span", { class: `lamp ${n.kind === "escalation" || n.kind === "buddy_alert" ? "flag3" : n.kind === "nudge" ? "flag1" : "home"}` }),
        h("div", { class: "grow" }, h("b", {}, { uwian_reminder: "Uwian paalala", buddy_alert: "Buddy alert", escalation: "Escalation", nudge: "Hangganan", vouch: "Vouch", dispute: "Dispute", payment_claim: "Bayad", ride_request: "Sakay?", ride_offer: "May alok" }[n.kind] ?? n.kind),
          h("div", { class: "dim" }, p.message ?? "")),
        h("button", { class: "btn", onclick: async () => { await api(`/api/notifications/${n.id}/read`, {}); bellRefresh(); } }, "Basahin"));
    })));
}
function bellRefresh() { location.hash = ""; requestAnimationFrame(() => (location.hash = location.hash || "/groups")); }
