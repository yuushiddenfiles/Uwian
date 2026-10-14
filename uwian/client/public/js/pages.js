import { $, api, h, toast, openSheet, avatar, fmtPeso, lampFor, MODES, timeAgo, pesoToCents, icon, icon3d } from "./util.js";

let ME_ = null;
export const me = () => ME_;
export async function loadMe() { ME_ = (await api("/api/me")).user; return ME_; }

/* helper: initials avatar using the crew-av style */
function crewAv(name) {
  const parts = (name ?? "?").trim().split(" ");
  const init = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  return h("div", { class: "crew-av" }, init);
}

/* helper: first initial of first name */
function firstInit(name) {
  return (name ?? "?").trim()[0].toUpperCase();
}

/* Split an element's text into staggered rise-in letters. One-shot entrance
   for the hero focal point only. Screen readers get the plain string. */
function splitChars(el, step = 26) {
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  el.textContent = "";
  [...text].forEach((ch, i) => {
    if (ch === " ") { el.append(document.createTextNode(" ")); return; }
    const s = document.createElement("span");
    s.className = "split-char";
    s.style.animationDelay = `${Math.min(i, 24) * step}ms`;
    s.setAttribute("aria-hidden", "true");
    s.textContent = ch;
    el.append(s);
  });
}

/* helper: safely format session timestamp */
function fmtSessionTime(dt) {
  if (!dt) return "Time TBD";
  const str = String(dt).trim();
  const iso = str.endsWith("Z") ? str : (str.includes("T") ? str + "Z" : str.replace(" ", "T") + "Z");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ════════════════════════════════════
   AUTH
   ════════════════════════════════════ */
export function pageLogin() {
  const email = h("input", {
    placeholder: "name@example.com",
    type: "email",
    id: "login-email",
    autocomplete: "email",
    class: "clay-auth-input"
  });

  const pw = h("input", {
    placeholder: "Enter password",
    type: "password",
    id: "login-pw",
    autocomplete: "current-password",
    class: "clay-auth-input"
  });

  async function handleLogin() {
    if (!email.value.trim() || !pw.value.trim()) {
      return toast("Please enter both email and password.", true);
    }
    try {
      await api("/api/login", { email: email.value.trim(), password: pw.value.trim() });
      location.hash = "/groups";
    } catch (e) {
      toast(e.message, true);
      pw.classList.add("shake");
      setTimeout(() => pw.classList.remove("shake"), 500);
    }
  }

  function demoPill(name, role, emailAddr, pwStr, avInit, themeClass) {
    return h("button", {
      type: "button",
      class: `auth-demo-pill ${themeClass}`,
      onclick: () => {
        email.value = emailAddr;
        pw.value = pwStr;
        toast(`Filled in ${name} (demo account)`);
        email.classList.add("highlight-field");
        pw.classList.add("highlight-field");
        setTimeout(() => {
          email.classList.remove("highlight-field");
          pw.classList.remove("highlight-field");
        }, 600);
      }
    },
      h("div", { class: "demo-pill-av" }, avInit),
      h("div", { class: "demo-pill-info" },
        h("span", { class: "demo-pill-name" }, name),
        h("span", { class: "demo-pill-role" }, role)),
      h("span", { class: "demo-pill-badge" }, "Fill")
    );
  }

  return h("div", { class: "auth-container-wrap enter" },
    h("div", { class: "auth-card" },
      h("div", { class: "auth-icon" }, icon("shield", { size: 22, strokeColor: "var(--accent-text)" })),
      h("div", {},
        h("h2", {}, "Welcome back"),
        h("p", { class: "sub" }, "Sign in to find your crew, join a hangout, and get home safe.")),
      h("div", { style: "font-size:12.5px;color:var(--text-3);margin-bottom:14px" }, "ID checked on every session. Vouched members only."),

      /* Input form */
      h("form", {
        class: "auth-form-body",
        onsubmit: (e) => { e.preventDefault(); handleLogin(); }
      },
        h("div", { class: "auth-input-group" },
          h("label", { class: "auth-label", for: "login-email" }, "Email address"),
          h("div", { class: "auth-input-wrapper" },
            h("span", { class: "auth-input-icon" }, icon("mail", { size: 16 })),
            email)),

        h("div", { class: "auth-input-group" },
          h("label", { class: "auth-label", for: "login-pw" }, "Password"),
          h("div", { class: "auth-input-wrapper" },
            h("span", { class: "auth-input-icon" }, icon("user", { size: 16 })),
            pw)),

        h("button", {
          type: "submit",
          class: "btn primary auth-submit-btn",
          id: "auth-signin-btn"
        }, "Sign in")
      ),

      /* Demo Quick-Fill Section */
      h("div", { class: "auth-demo-section" },
        h("div", { class: "auth-section-divider" },
          h("span", {}, "Quick Demo Sign-In")),
        h("div", { class: "auth-demo-grid" },
          demoPill("Ana Reyes", "Barkada Host", "ana@barkada.demo", "BarkadaDemo!2026", "AR", "pill-coral"),
          demoPill("Ela Bautista", "Crew Member", "ela@barkada.demo", "BarkadaDemo!2026", "EB", "pill-mint"))),

      /* Footer Link */
      h("div", { class: "auth-footer-nav" },
        h("p", {}, "New here? ",
          h("a", { href: "#/signup", class: "auth-signup-link" }, "Create an account")),
        h("div", { class: "auth-trust-chip icon-text-row" },
          icon("shield", { size: 13 }), "ID checked on every session. Vouched members only."))
    )
  );
}

export function pageSignup() {
  const name  = h("input", { placeholder: "Your full name", id: "su-name", autocomplete: "name", class: "clay-auth-input" });
  const email = h("input", { placeholder: "name@example.com", type: "email", id: "su-email", autocomplete: "email", class: "clay-auth-input" });
  const pw    = h("input", { placeholder: "Password (8+ characters)", type: "password", id: "su-pw", autocomplete: "new-password", class: "clay-auth-input" });
  const bday  = h("input", { type: "date", id: "su-bday", class: "clay-auth-input" });

  async function handleSignup() {
    if (!name.value.trim() || !email.value.trim() || !pw.value.trim() || !bday.value) {
      return toast("Please fill in all fields.", true);
    }
    try {
      await api("/api/signup", { name: name.value.trim(), email: email.value.trim(), password: pw.value.trim(), birthdate: bday.value });
      location.hash = "/groups";
    } catch (e) {
      toast(e.message, true);
    }
  }

  return h("div", { class: "auth-container-wrap enter" },
    h("div", { class: "auth-card clay-auth-card" },
      /* Top header badge with 3D character pedestal */
      h("div", { class: "auth-header-hero" },
        h("div", { class: "auth-character-pedestal" },
          icon3d("boy", { size: 68, class: "auth-3d-character" })),
        h("div", { class: "auth-hero-branding" },
          h("div", { class: "auth-brand-row" },
            h("span", { class: "auth-brand-title" }, "uwian"),
            h("span", { class: "auth-safe-badge icon-text-row" }, icon3d("shield", { size: 12 }), "18+ Only")),
          h("h2", { class: "auth-title" }, "Create your account"),
          h("p", { class: "auth-sub" }, "Strict verification ensures every hangout is safe and vouched."))),

      h("form", {
        class: "auth-form-body",
        onsubmit: (e) => { e.preventDefault(); handleSignup(); }
      },
        h("div", { class: "auth-input-group" },
          h("label", { class: "auth-label", for: "su-name" }, "Full Name"),
          h("div", { class: "auth-input-wrapper" },
            h("span", { class: "auth-input-icon" }, icon3d("boy", { size: 18 })),
            name)),

        h("div", { class: "auth-input-group" },
          h("label", { class: "auth-label", for: "su-email" }, "Email Address"),
          h("div", { class: "auth-input-wrapper" },
            h("span", { class: "auth-input-icon" }, icon("mail", { size: 16 })),
            email)),

        h("div", { class: "auth-input-group" },
          h("label", { class: "auth-label", for: "su-pw" }, "Password (8+ chars)"),
          h("div", { class: "auth-input-wrapper" },
            h("span", { class: "auth-input-icon" }, icon("user", { size: 16 })),
            pw)),

        h("div", { class: "auth-input-group" },
          h("label", { class: "auth-label", for: "su-bday" }, "Birthdate (18+)"),
          h("div", { class: "auth-input-wrapper" },
            h("span", { class: "auth-input-icon" }, icon3d("calendar", { size: 18 })),
            bday)),

        h("button", {
          type: "submit",
          class: "btn primary auth-submit-btn",
          id: "auth-signup-btn"
        }, "Create account")
      ),

      h("div", { class: "auth-footer-nav" },
        h("p", {}, "Already a member? ",
          h("a", { href: "#/login", class: "auth-signup-link" }, "Sign in")),
        h("div", { class: "auth-trust-chip icon-text-row" },
          icon3d("shield", { size: 14 }), "Safe Space & Commute Buddy Protection"))
    )
  );
}

/* ════════════════════════════════════
   GROUPS LIST (Dashboard & Session Finder)
   ════════════════════════════════════ */
export async function showVerificationSheet() {
  try {
    const [v, vStatus] = await Promise.all([
      api("/api/me/verification"),
      api("/api/me/verification-status").catch(() => ({ submission: null }))
    ]);
    const u = v.user;
    const sub = vStatus.submission;

    // Check if user is admin (for moderation panel)
    let isAdmin = false;
    try {
      await api("/api/admin/verifications");
      isAdmin = true;
    } catch {}

    let closeSheet;

    /* ── Status banner ── */
    const statusColor = sub?.status === "approved" ? "var(--green-dim)" : sub?.status === "rejected" ? "var(--red-dim)" : sub?.status === "pending" ? "var(--amber-dim)" : "var(--surface-in)";
    const statusBorder = sub?.status === "approved" ? "#a8dece" : sub?.status === "rejected" ? "#f5b4b4" : sub?.status === "pending" ? "#f5d89e" : "var(--border)";
    const statusIcon = sub?.status === "approved" ? "tick" : sub?.status === "rejected" ? "cancel" : sub?.status === "pending" ? "clock" : "shield";
    const statusLabel2 = sub?.status === "approved" ? "ID verified" : sub?.status === "rejected" ? "Verification needs attention" : sub?.status === "pending" ? "Verification pending review" : "Not verified yet";

    const statusBanner = h("div", { style: `display:flex;align-items:center;gap:14px;padding:16px;background:${statusColor};border:1.5px solid ${statusBorder};border-radius:14px;margin-bottom:18px` },
      h("div", { style: "width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.6);display:grid;place-items:center;flex:none;" },
        icon3d(statusIcon, { size: 36, class: "icon-3d-float" })),
      h("div", { style: "flex:1;min-width:0" },
        h("div", { style: "font:700 15px var(--font);color:var(--text)" }, statusLabel2),
        h("div", { style: "font-size:12.5px;color:var(--text-2);margin-top:3px;line-height:1.4" },
          sub?.status === "rejected" && sub.rejection_note
            ? `Reason: ${sub.rejection_note}`
            : sub?.status === "pending" ? "An admin will review your submission within 24 hours."
            : sub?.status === "approved" ? `${v.trust_tier} · Vouches: ${v.vouches_received}`
            : "Provide your government or school ID details to get verified.")));

    /* ── Stats grid ── */
    const statsGrid = h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px" },
      h("div", { style: "background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
        h("div", { style: "font-size:11.5px;color:var(--text-3);font-weight:600" }, "VOUCHES RECEIVED"),
        h("div", { style: "font:700 18px var(--font);color:var(--text);margin-top:4px" }, `${v.vouches_received} vouches`)),
      h("div", { style: "background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
        h("div", { style: "font-size:11.5px;color:var(--text-3);font-weight:600" }, "ACCOUNT STRIKES"),
        h("div", { style: `font:700 18px var(--font);color:${v.strikes > 0 ? "var(--red)" : "var(--green)"};margin-top:4px` }, `${v.strikes} strikes`)));

    /* ── ID Submission Form (only show if not approved) ── */
    let submitSection = null;
    if (sub?.status !== "approved") {
      const idTypeSel = h("select", { style: "width:100%;margin-bottom:10px" },
        h("option", { value: "school_id" }, "School ID"),
        h("option", { value: "national_id" }, "National ID (PhilSys)"),
        h("option", { value: "passport" }, "Passport"),
        h("option", { value: "drivers_license" }, "Driver's License"),
        h("option", { value: "umid" }, "UMID"),
        h("option", { value: "philhealth" }, "PhilHealth ID"),
        h("option", { value: "sss" }, "SSS ID"));
      if (sub?.id_type) idTypeSel.value = sub.id_type;
      const fullNameIn = h("input", { placeholder: "Full name exactly as on ID", style: "width:100%;margin-bottom:10px", value: sub?.full_name_on_id ?? "" });
      const bdayIn = h("input", { type: "date", style: "width:100%;margin-bottom:14px", value: sub?.birthdate_on_id ?? u.birthdate ?? "" });

      submitSection = h("div", {},
        h("h3", { style: "font:700 15px var(--font);color:var(--text);margin-bottom:10px" }, "Submit ID for Verification"),
        h("p", { style: "font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.5" },
          "Your ID details are reviewed only by crew admins and never shared publicly. This replaces the \"self-declared\" system with real admin-reviewed verification."),
        h("label", { class: "f", style: "font-size:12.5px;margin-bottom:6px;display:block" }, "ID Type"), idTypeSel,
        h("label", { class: "f", style: "font-size:12.5px;margin-bottom:6px;display:block" }, "Full Name (on ID)"), fullNameIn,
        h("label", { class: "f", style: "font-size:12.5px;margin-bottom:6px;display:block" }, "Birthdate (on ID)"), bdayIn,
        h("button", {
          class: "btn primary",
          style: "width:100%;justify-content:center;padding:12px;margin-bottom:8px",
          onclick: async () => {
            if (!fullNameIn.value.trim() || !bdayIn.value) return toast("Full name and birthdate are required.", true);
            await api("/api/me/submit-verification", {
              id_type: idTypeSel.value,
              full_name_on_id: fullNameIn.value.trim(),
              birthdate_on_id: bdayIn.value
            });
            toast("Verification submitted! You'll be notified when approved.");
            showVerificationSheet();
          }
        }, sub?.status === "pending" ? "Re-submit Verification" : "Submit for Verification"));
    }

    /* ── Safety measures list ── */
    const safetyList = h("div", {},
      h("h3", { style: "font:700 15px var(--font);color:var(--text);margin-bottom:10px" }, "Strict Safety Measures"),
      h("ul", { style: "font-size:13.5px;color:var(--text-2);line-height:1.6;padding-left:18px;margin-bottom:20px" },
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Admin-Reviewed Verification: "), "Your ID details are reviewed by a crew admin, not just self-declared."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Double-Vouch Safeguard: "), "Joining new crews requires existing members to vouch for your character."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Safe Commute Buddy System: "), "When sessions wrap, attendees are paired by commute direction with automated arrival check-ins."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Two-Strike Policy: "), "Disruptive behavior or false vouches result in immediate strike and vouch revocation."),
        h("li", {}, h("strong", { style: "color:var(--text)" }, "Report & Flag System: "), "Any member can report suspicious behavior; admins review all flags within 24h.")));

    /* ── Drinking preference ── */
    const drinkPref = h("div", { style: "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface-in);border-radius:10px;border:1px solid var(--border);margin-bottom:16px" },
      h("div", {},
        h("div", { style: "font:600 13.5px var(--font);color:var(--text)" }, "Drinking Preference"),
        h("div", { style: "font-size:12px;color:var(--text-3)" }, u.can_drink ? "Excludes non-alcohol tabs automatically" : "Flagged as non-drinker")),
      h("button", {
        class: "btn ghost sm",
        onclick: async () => {
          const next = !u.can_drink;
          await api("/api/me", { can_drink: next }, "PATCH");
          u.can_drink = next ? 1 : 0;
          toast(next ? "Updated: Drinks alcohol" : "Updated: Non-drinker");
          showVerificationSheet();
        }
      }, u.can_drink ? "Set: Non-drinker" : "Set: Drinks"));

    /* ── Admin panel ── */
    let adminSection = null;
    if (isAdmin) {
      const [pendingVerifs, openFlags] = await Promise.all([
        api("/api/admin/verifications").catch(() => []),
        api("/api/admin/flags").catch(() => [])
      ]);

      const adminPanel = h("div", { style: "border-top:1.5px solid var(--border);margin-top:20px;padding-top:20px" },
        h("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:14px" },
          icon3d("setting", { size: 20 }),
          h("h3", { style: "font:700 15px var(--font);color:var(--text);margin:0" }, "Admin Moderation Panel"),
          pendingVerifs.length > 0 ? h("span", { class: "chip amber" }, `${pendingVerifs.length} pending`) : null,
          openFlags.length > 0 ? h("span", { class: "chip red" }, `${openFlags.length} flags`) : null));

      if (pendingVerifs.length > 0) {
        adminPanel.append(h("p", { style: "font:600 12px var(--font);color:var(--text-3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px" }, "Pending Verifications"));
        for (const pv of pendingVerifs.slice(0, 5)) {
          adminPanel.append(h("div", { style: "background:var(--surface-in);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px" },
            h("div", { style: "font:600 14px var(--font);color:var(--text)" }, pv.name),
            h("div", { style: "font-size:12px;color:var(--text-2);margin:2px 0" }, `${pv.email} · ${pv.id_type?.replace("_", " ")} · Name on ID: ${pv.full_name_on_id}`),
            h("div", { style: "font-size:11.5px;color:var(--text-3);margin-bottom:10px" }, `Submitted: ${new Date(pv.submitted_at + "Z").toLocaleDateString()}`),
            h("div", { style: "display:flex;gap:8px" },
              h("button", { class: "btn good sm", onclick: async () => {
                  await api(`/api/admin/verifications/${pv.user_id}/approve`, {});
                  toast(`${pv.name} approved!`); showVerificationSheet();
                } }, "Approve"),
              h("button", { class: "btn bad sm", onclick: async () => {
                  const note = prompt("Rejection reason (will be shown to user):");
                  if (!note) return;
                  await api(`/api/admin/verifications/${pv.user_id}/reject`, { note });
                  toast("Rejected."); showVerificationSheet();
                } }, "Reject"))));
        }
      } else {
        adminPanel.append(h("p", { style: "font-size:13px;color:var(--text-2);margin-bottom:12px" }, "✅ No pending verifications."));
      }

      if (openFlags.length > 0) {
        adminPanel.append(h("p", { style: "font:600 12px var(--font);color:var(--text-3);letter-spacing:.5px;text-transform:uppercase;margin:12px 0 8px" }, "Open Flags"));
        for (const f of openFlags.slice(0, 5)) {
          adminPanel.append(h("div", { style: "background:var(--red-dim);border:1px solid #f5b4b4;border-radius:10px;padding:12px;margin-bottom:8px" },
            h("div", { style: "font:600 14px var(--font);color:var(--text)" }, `Report: ${f.flagged_name}`),
            h("div", { style: "font-size:12px;color:var(--text-2);margin:2px 0" }, `Reported by: ${f.reporter_name} · Category: ${f.category}`),
            h("div", { style: "font-size:13px;color:var(--text);margin:6px 0 8px;font-style:italic" }, `"${f.reason}"`),
            h("div", { style: "display:flex;gap:8px" },
              h("button", { class: "btn good sm", onclick: async () => {
                  await api(`/api/admin/flags/${f.id}/review`, { action: "reviewed" });
                  toast("Flag reviewed."); showVerificationSheet();
                } }, "Reviewed"),
              h("button", { class: "btn ghost sm", onclick: async () => {
                  await api(`/api/admin/flags/${f.id}/review`, { action: "dismissed" });
                  toast("Flag dismissed."); showVerificationSheet();
                } }, "Dismiss"))));
        }
      }

      adminSection = adminPanel;
    }

    closeSheet = openSheet("Identity & Safety Verification", h("div", { class: "enter" },
      statusBanner,
      statsGrid,
      submitSection,
      safetyList,
      drinkPref,
      adminSection,
      h("button", { class: "btn primary", style: "width:100%;justify-content:center;padding:11px", onclick: () => { if (closeSheet) closeSheet(); } }, "Got it")));
  } catch (e) { toast(e.message, true); }
}

/* Helper: report/flag a user */
export function reportUserSheet(targetUid, targetName, groupId) {
  const reasonIn = h("textarea", { placeholder: "Describe what happened (at least 10 characters). Admins will see this.", style: "min-height:90px;width:100%" });
  const catSel = h("select", { style: "width:100%;margin-top:10px;margin-bottom:14px" },
    h("option", { value: "misconduct" }, "Misconduct / Inappropriate behavior"),
    h("option", { value: "harassment" }, "Harassment"),
    h("option", { value: "fake_id" }, "Suspected fake identity"),
    h("option", { value: "spam" }, "Spam"),
    h("option", { value: "other" }, "Other"));
  openSheet(`Report: ${targetName}`, h("div", {},
    h("p", { style: "font-size:13.5px;color:var(--text-2);margin-bottom:14px;line-height:1.5" },
      `Reports are confidential and reviewed by crew admins within 24 hours. Providing false reports may result in a strike on your account.`),
    h("label", { class: "f", style: "margin-bottom:6px;display:block" }, "What happened?"), reasonIn,
    h("label", { class: "f", style: "margin-bottom:6px;display:block" }, "Category"), catSel,
    h("button", { class: "btn bad", style: "width:100%;justify-content:center;margin-top:4px", onclick: async () => {
        const reason = reasonIn.value.trim();
        if (reason.length < 10) return toast("Please describe the issue (at least 10 chars).", true);
        await api(`/api/users/${targetUid}/flag`, { reason, category: catSel.value, group_id: groupId ?? null });
        toast("Report submitted. Admins have been notified.");
      } }, "Submit Report")));
}

/* Safe Arrival & Buddy Escort Sheet */
export async function showBuddyEscortSheet() {
  try {
    const feed = await api("/api/sessions/feed").catch(() => []);
    const wrappedOrActive = feed.filter(s => s.status === "wrapped" || s.status === "open");
    
    let closeSheet;
    closeSheet = openSheet("Safe Arrival & Buddy Escort", h("div", { class: "enter" },
      h("div", { style: "display:flex;align-items:center;gap:14px;padding:16px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);border-radius:14px;margin-bottom:18px" },
        h("div", { style: "width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.7);display:grid;place-items:center;flex:none;" },
          icon3d("travel", { size: 36, class: "icon-3d-float" })),
        h("div", { style: "flex:1;min-width:0" },
          h("div", { style: "font:700 15px var(--font);color:var(--text)" }, "Automated Commute Escort"),
          h("div", { style: "font-size:12.5px;color:var(--text-2);margin-top:2px" }, "Never commute home alone late at night."))),

      h("h3", { style: "font:700 14.5px var(--font);color:var(--text);margin-bottom:10px" }, "Active Commute Radar"),
      wrappedOrActive.length === 0
        ? h("div", { style: "background:var(--surface-in);padding:14px;border-radius:12px;border:1px solid var(--border);margin-bottom:18px;text-align:center" },
            h("div", { style: "font-size:13px;color:var(--text-2)" }, "No wrapped sessions currently in progress."),
            h("div", { style: "font-size:12px;color:var(--text-3);margin-top:4px" }, "When a session admin taps \"Uwian na\", buddy pairs are activated automatically."))
        : h("div", { style: "display:flex;flex-direction:column;gap:8px;margin-bottom:18px" },
            ...wrappedOrActive.map(s => h("div", {
              style: "background:var(--surface-in);padding:12px 14px;border-radius:12px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between",
            },
              h("div", {},
                h("div", { style: "font:600 13.5px var(--font);color:var(--text)" }, s.spot_name || "Tambayan"),
                h("div", { style: "font-size:12px;color:var(--text-3)" }, `${s.group_name} · Status: ${s.status}`)),
              h("button", {
                class: "btn primary sm",
                onclick: () => { if (closeSheet) closeSheet(); location.hash = `/s/${s.id}`; }
              }, "View buddies")))),

      h("h3", { style: "font:700 14.5px var(--font);color:var(--text);margin-bottom:10px" }, "How the Escort System Protects You"),
      h("div", { style: "display:flex;flex-direction:column;gap:10px;margin-bottom:20px" },
        h("div", { style: "display:flex;gap:12px;align-items:flex-start;background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
          h("span", { class: "chip green", style: "flex:none" }, "Stage 1"),
          h("div", { style: "font-size:12.5px;color:var(--text-2);line-height:1.45" },
            h("strong", { style: "color:var(--text);display:block" }, "Commute Direction Pairing"),
            "Members with matching route directions (e.g. MRT/LRT, North, South) are grouped in pairs or trios so nobody leaves alone.")),
        h("div", { style: "display:flex;gap:12px;align-items:flex-start;background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
          h("span", { class: "chip amber", style: "flex:none" }, "Stage 2"),
          h("div", { style: "font-size:12.5px;color:var(--text-2);line-height:1.45" },
            h("strong", { style: "color:var(--text);display:block" }, "Automated Check-in Deadline"),
            "If someone hasn't marked themselves \"Nakarating na\" (Arrived) by their estimated commute time, their buddy receives an instant nudge.")),
        h("div", { style: "display:flex;gap:12px;align-items:flex-start;background:var(--surface-in);padding:12px;border-radius:10px;border:1px solid var(--border)" },
          h("span", { class: "chip red", style: "flex:none" }, "Stage 3"),
          h("div", { style: "font-size:12.5px;color:var(--text-2);line-height:1.45" },
            h("strong", { style: "color:var(--text);display:block" }, "Admin Escalation Alert"),
            "If both member and buddy are unreachable past the group threshold, the session organizer and crew admins are alerted."))),

      h("button", { class: "btn primary", style: "width:100%;justify-content:center;padding:12px", onclick: () => { if (closeSheet) closeSheet(); } }, "Got it")));
  } catch (e) { toast(e.message, true); }
}



export async function pageGroups() {
  const [gs, feed] = await Promise.all([
    api("/api/groups"),
    api("/api/sessions/feed").catch(() => [])
  ]);
  const firstName = me()?.name?.split(" ")[0] ?? "there";
  const el = h("div", { class: "bento-dashboard enter" });

  /* ── Derived stats (real data from the feed) */
  const activeCount   = feed.filter(s => s.status === "open" || s.status === "planning").length;
  const goingCount    = feed.filter(s => s.my_rsvp === "going").length;

  /* Dashboard hero: greeting, live counts, two actions. No decoration. */

  const refStage = h("div", { class: "ref-glass-stage enter" },
    /* Inner Hero Banner with OA Anime Background */
    h("div", { class: "ref-hero-banner" },
      h("div", { class: "ref-hero-content" },
        /* Top Banner */
        h("div", { class: "ref-hero-top" },
          h("div", { class: "ref-hero-brand-tag" },
            icon("shield", { size: 13 }),
            `${greetingByHour()}, ${firstName}`
          ),
          h("div", { class: "ref-hero-live" },
            activeCount > 0
              ? `${activeCount} session${activeCount !== 1 ? "s" : ""} open tonight · you're going to ${goingCount}`
              : "Nothing open tonight yet")
        ),

        /* Middle Layout: Title + Prompt Box (Left) & Date Widget (Right) */
        h("div", { class: "ref-hero-middle" },
          h("div", { class: "ref-hero-text-side" },
            h("div", { class: "ref-main-title" }, "Tonight with your crew"),
            h("div", { class: "ref-main-subtitle" }, "Vouched members, fair tabs, and a safe trip home."),
            h("div", { class: "ref-hero-actions" },
              h("button", {
                class: "btn primary",
                onclick: () => { window._planSessionSheet(); }
              }, "Plan a session"),
              h("button", {
                class: "btn ghost",
                onclick: () => { switchView("sessions"); }
              }, "Browse sessions")
            )
          )
        ),

        /* Live map link */
        h("div", { class: "ref-gallery-row" },
          h("button", {
            class: "btn ghost sm",
            onclick: () => { location.hash = "/map"; }
          }, "Browse the live map for verified spots")
        )
      )
    )
  );
  el.append(refStage);
  const heroTitle = el.querySelector(".ref-main-title");
  if (heroTitle) splitChars(heroTitle);

  /* ══════════════════════════════════════
     BENTO GRID
  ═══════════════════════════════════════ */
  const grid = h("div", { class: "bento-grid" });

  /* ── [A] Hero action tile — spans 2 cols */
  const heroTile = h("div", { class: "bento-tile bento-tile-hero tile-warm" },
    h("div", { class: "bento-tile-content" },
      h("div", { class: "bento-tile-icon-wrap" }, icon("calendar", { size: 26 })),
      h("div", { class: "bento-tile-body" },
        h("div", { class: "bento-tile-eyebrow" }, "Tonight"),
        h("div", { class: "bento-tile-value" }, activeCount > 0 ? `${activeCount} open` : "Nothing open"),
        h("div", { class: "bento-tile-meta" }, activeCount > 0
          ? `You're going to ${goingCount} · ${feed.length} listed`
          : "No sessions yet. Plan the first one.")),
      h("div", { class: "bento-tile-actions" },
        h("button", { class: "bento-action-btn accent", onclick: () => window._planSessionSheet() }, "Plan a session"),
        h("button", { class: "bento-action-btn ghost", onclick: () => switchView("sessions") }, "Browse sessions"))));
  grid.append(heroTile);

  /* ── [B] Safety status tile */
  const safetyTile = h("div", { class: "bento-tile tile-teal", onclick: () => showVerificationSheet(), style: "cursor:pointer" },
    h("div", { class: "bento-tile-content" },
      h("div", { class: "bento-tile-icon-wrap" }, icon("shield", { size: 24 })),
      h("div", { class: "bento-tile-eyebrow" }, "Safety"),
      h("div", { class: "bento-tile-value trust-value" }, "Verified"),
      h("div", { class: "bento-tile-meta" }, "ID checked. Vouch active."),
      h("span", { class: "bento-tile-arrow" }, "")));
  grid.append(safetyTile);

  /* ── [C] Crews tile */
  const crewsTile = h("div", { class: "bento-tile tile-coral", onclick: () => switchView("crews"), style: "cursor:pointer" },
    h("div", { class: "bento-tile-content" },
      h("div", { class: "bento-tile-icon-wrap" }, icon("users", { size: 24 })),
      h("div", { class: "bento-tile-eyebrow" }, "My crews"),
      h("div", { class: "bento-tile-value" }, String(gs.length || 0)),
      h("div", { class: "bento-tile-meta" }, gs.length > 0 ? gs.slice(0, 2).map(g => g.name).join(", ") : "No crews yet"),
      h("span", { class: "bento-tile-arrow" }, "")));
  grid.append(crewsTile);

  /* ── [D] Messages tile — spans 2 cols */
  const msgTile = h("div", { class: "bento-tile bento-tile-hero tile-indigo", onclick: () => { location.hash = "/messages"; }, style: "cursor:pointer" },
    h("div", { class: "bento-tile-content" },
      h("div", { class: "bento-tile-icon-wrap" }, icon("mail", { size: 24 })),
      h("div", { class: "bento-tile-body" },
        h("div", { class: "bento-tile-eyebrow" }, "Messages"),
        h("div", { class: "bento-tile-value", id: "bento-msg-count" }, "Messages"),
        h("div", { class: "bento-tile-meta" }, "Direct and crew chats")),
      h("div", { class: "bento-tile-actions" },
        h("span", { class: "bento-action-btn ghost" }, "Open chat"))));
  grid.append(msgTile);
  // Async load unread count
  api("/api/conversations/unread-count").then(r => {
    const el2 = document.getElementById("bento-msg-count");
    if (el2) el2.textContent = r.unread > 0 ? `${r.unread} unread` : "All caught up";
  }).catch(() => {});

  /* ── [E] Map tile — spans 2 cols */
  const mapTile = h("div", { class: "bento-tile bento-tile-hero tile-mint", onclick: () => { location.hash = "/map"; }, style: "cursor:pointer" },
    h("div", { class: "bento-tile-content" },
      h("div", { class: "bento-tile-icon-wrap" }, icon("pin", { size: 24 })),
      h("div", { class: "bento-tile-body" },
        h("div", { class: "bento-tile-eyebrow" }, "Map"),
        h("div", { class: "bento-tile-value" }, "Hangout map"),
        h("div", { class: "bento-tile-meta" }, "Verified spots with open sessions")),
      h("div", { class: "bento-tile-actions" },
        h("span", { class: "bento-action-btn ghost" }, "View map"))));
  grid.append(mapTile);

  el.append(grid);

  /* ══════════════════════════════════════
     ANIMATED VIEW SWITCHER
  ═══════════════════════════════════════ */
  let currentView = "sessions";

  const switcher = h("div", { class: "bento-switcher" },
    h("div", { class: "bento-switcher-track" },
      h("div", { class: "bento-switcher-indicator", id: "switcher-indicator" })));

  const switcherTabs = [
    { key: "sessions", label: "Sessions", vicon: "calendar" },
    { key: "crews",    label: "Crews",    vicon: "users" },
    { key: "safety",   label: "Safety",   vicon: "shield" },
    { key: "all",      label: "Overview", vicon: "radar" },
  ];
  const tabEls = {};
  switcherTabs.forEach((t, i) => {
    const btn = h("button", {
      class: "bento-switcher-tab" + (i === 0 ? " active" : ""),
      "data-key": t.key,
      onclick: () => switchView(t.key)
    }, icon(t.vicon, { size: 14 }), t.label);
    tabEls[t.key] = btn;
    switcher.querySelector(".bento-switcher-track").append(btn);
  });
  el.append(switcher);

  /* ══════════════════════════════════════
     CONTENT PANELS
  ═══════════════════════════════════════ */

  /* — Quick Vouch (if any pending members) — */
  const allPending = [];
  for (const g of gs) {
    try {
      const gd = await api(`/api/groups/${g.id}`);
      gd.pending.forEach(p => allPending.push({ ...p, group: g, group_id: g.id, vouches_required: gd.group.vouches_required }));
    } catch {}
  }
  let vouchCard = null;
  if (allPending.length > 0) {
    vouchCard = h("div", { class: "glass-card bento-vouch-card" },
      h("div", { class: "section-head", style: "margin:0 0 14px" },
        h("h2", {}, "Vouch queue"),
        h("span", { class: "chip amber" }, `${allPending.length} pending`)),
      h("div", { class: "vouch-quick-list" },
        ...allPending.slice(0, 3).map(p =>
          h("div", { class: "vouch-quick-row" },
            crewAv(p.name),
            h("div", { class: "vouch-quick-info" },
              h("strong", {}, p.name),
              h("span", { class: "dim" }, `${p.group.name} · ${p.vouches}/${p.vouches_required} vouches`)),
            h("button", {
              class: "btn good sm",
              onclick: async () => {
                const r = await api(`/api/groups/${p.group_id}/vouch/${p.user_id}`, {});
                toast(r.accepted ? "They are in. Welcome to the crew." : `Vouched (${r.have} of ${r.need}).`);
                location.hash = ""; requestAnimationFrame(() => location.hash = "/groups");
              }
            }, "Vouch in")))));
    el.append(vouchCard);
  }

  /* — Search + Session Feed — */
  const searchWrap = h("div", { class: "search-bar-wrap" },
    h("span", { class: "search-icon", "aria-hidden": "true" }, icon("search", { size: 15 })),
    h("input", {
      type: "search",
      class: "search-input glass-search-input",
      placeholder: "Search sessions by spot, crew, or vibe…",
      id: "session-search",
      oninput: (e) => filterSessions(e.target.value)
    }));

  let currentTab = "all";
  const tabAll     = h("button", { class: "filter-chip active", onclick: () => setTab("all") }, `All (${feed.length})`);
  const tabTonight = h("button", { class: "filter-chip", onclick: () => setTab("active") }, "Active Tonight");
  const tabGoing   = h("button", { class: "filter-chip", onclick: () => setTab("going") }, "You're Going");
  const filterBar    = h("div", { class: "filter-bar" }, tabAll, tabTonight, tabGoing);
  const feedContainer = h("div", { class: "feed-grid", id: "feed-container" });

  const sessionsCard = h("div", { class: "glass-card sessions-glass-card" },
      h("div", { class: "section-head", style: "margin:0 0 14px" },
        h("h2", {}, "Sessions"),
        h("span", { class: "chip amber" }, `${feed.length} listed`)),
    searchWrap, filterBar, feedContainer);

  function renderFeed(items) {
    feedContainer.innerHTML = "";
    if (items.length === 0) {
      feedContainer.append(h("div", { class: "hero-empty", style: "grid-column:1/-1;padding:40px 16px" },
        h("div", { class: "hero-icon" }, icon("search", { size: 24, strokeColor: "var(--text-3)" })),
        h("h3", {}, "No matching sessions found"),
        h("p", {}, "Try a different search or create a session in one of your crews.")));
      return;
    }
    items.forEach(s => {
      const spotName      = s.spot_name || "Tambayan TBD";
      const dateText      = fmtSessionTime(s.starts_at);
      const attendeesCount = s.going_count || (s.attendees?.length ?? 0);
      const isMyGoing     = s.my_rsvp === "going";

      const card = h("div", {
        class: "feed-card glass-feed-card",
        tabindex: "0", role: "link",
        "aria-label": `Open session at ${spotName}`,
        onclick: () => { location.hash = `/s/${s.id}`; },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") location.hash = `/s/${s.id}`; }
      },
        h("div", { class: "feed-card-header" },
          h("div", { class: "feed-spot-lead" },
            h("div", { class: "feed-thumbnail-badge" }, icon3d("pin", { size: 22 })),
            h("div", { class: "feed-spot-titles" },
              h("div", { class: "feed-card-spot" }, spotName),
              h("div", { class: "feed-card-crew icon-text-row" }, icon3d("boy", { size: 13 }), s.group_name))),
          h("span", { class: `status-bar ${s.status}` }, statusLabel(s.status))),
        h("div", { class: "feed-card-body" },
          h("div", { class: "feed-meta-row" },
            h("div", { class: "feed-meta-item icon-text-row" }, icon3d("clock", { size: 14 }), dateText),
            s.price_range ? h("div", { class: "feed-meta-item" }, `· ${s.price_range}`) : null),
          h("div", { class: "avatar-stack" },
            ...(s.attendees || []).slice(0, 3).map(a => crewAv(a.name)),
            h("span", { class: "avatar-stack-label" },
              attendeesCount > 0 ? `${attendeesCount} friend${attendeesCount !== 1 ? "s" : ""} going` : "Be the first to join"))),
        h("div", { class: "feed-card-foot" },
          h("span", { class: "security-tag icon-text-row" }, icon3d("shield", { size: 14 }), "ID Checked"),
          h("div", { class: "feed-action-wrap" },
            isMyGoing
              ? h("span", { class: "chip green icon-text-row", style: "font-weight:600" }, icon3d("tick", { size: 12 }), "Going")
              : h("span", { class: "view-link-label" }, "View"),
            h("div", { class: "clay-round-action-btn", "aria-label": "Open session" }, "Open"))));
      feedContainer.append(card);
    });
  }

  function setTab(tab) {
    currentTab = tab;
    tabAll.classList.toggle("active", tab === "all");
    tabTonight.classList.toggle("active", tab === "active");
    tabGoing.classList.toggle("active", tab === "going");
    filterSessions(document.querySelector("#session-search")?.value || "");
  }
  function filterSessions(query) {
    const q = (query || "").toLowerCase().trim();
    let filtered = feed;
    if (currentTab === "active") filtered = filtered.filter(s => s.status === "open" || s.status === "planning" || s.status === "wrapped");
    else if (currentTab === "going") filtered = filtered.filter(s => s.my_rsvp === "going");
    if (q) filtered = filtered.filter(s =>
      (s.spot_name && s.spot_name.toLowerCase().includes(q)) ||
      (s.group_name && s.group_name.toLowerCase().includes(q)) ||
      (s.spot_notes && s.spot_notes.toLowerCase().includes(q)));
    renderFeed(filtered);
  }
  renderFeed(feed);

  /* — Crews card — */
  const crewsCard = h("div", { class: "glass-card crews-glass-card" },
    h("div", { class: "section-head", style: "margin-top:0" },
      h("h2", {}, `My Crews (${gs.length})`),
      h("button", { class: "btn ghost sm", onclick: () => newCrewSheet() }, "+ New crew")));
  if (gs.length === 0) {
    crewsCard.append(h("div", { class: "hero-empty" },
      h("div", { class: "hero-icon", style: "border:none;background:transparent" }, icon3d("boy", { size: 48, class: "icon-3d-float" })),
      h("h3", {}, "No crews yet"),
      h("p", {}, "Create your first crew above, or ask a friend to share an invite link.")));
  } else {
    crewsCard.append(h("div", { class: "crew-grid" },
      ...gs.map((g) => {
        const parts = (g.name ?? "").trim().split(" ");
        const init  = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
        const card  = h("div", {
          class: "crew-card glass-crew-card", tabindex: "0", role: "link",
          "aria-label": `Open crew ${g.name}`,
          onclick: () => (location.hash = `/g/${g.id}`),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") location.hash = `/g/${g.id}`; }
        },
          h("div", { class: "crew-card-top" },
            h("div", { class: "crew-av" }, init),
            h("div", { class: "grow" },
              h("div", { class: "crew-card-name" }, g.name),
              h("div", { class: "crew-card-meta" }, g.role === "admin" ? "You're an admin" : "Member"))),
          h("div", { class: "crew-card-foot" },
            h("span", { class: "role-chip" }, g.role),
            h("button", {
              class: "btn ghost sm icon-text-row",
              style: "font-size:12px;padding:5px 10px",
              onclick: async (e) => {
                e.stopPropagation();
                const r = await api("/api/conversations/group", { group_id: g.id, title: `${g.name} Chat` });
                location.hash = `/messages/${r.id}`;
              }
            }, icon3d("mail", { size: 13 }), "Chat"),
            h("div", { class: "clay-round-action-btn", "aria-label": "Open crew" }, "Open")));
        return card;
      })));
  }

  /* — Safety card — */
  const safetyCard = h("div", {
    class: "glass-card safety-guarantee-glass-card",
    style: "display:flex;align-items:center;gap:16px"
  },
    h("div", { style: "width:48px;height:48px;border-radius:12px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);display:grid;place-items:center;flex:none" },
      icon3d("travel", { size: 30, class: "icon-3d-float" })),
    h("div", { style: "flex:1;min-width:0" },
      h("strong", { style: "display:block;font:600 14.5px var(--font);color:var(--text)" }, "Get home safe, together"),
      h("p", { style: "font-size:13px;color:var(--text-2);margin-top:3px;line-height:1.45" },
        "When a session wraps, members pair up by commute direction and check in on arrival. No one travels alone.")),
    h("button", { class: "btn ghost sm", onclick: () => showVerificationSheet() }, "How it works"));

  /* ══════════════════════════════════════
     VIEW SWITCHER LOGIC
  ═══════════════════════════════════════ */
  function switchView(view) {
    currentView = view;
    Object.entries(tabEls).forEach(([k, btn]) => btn.classList.toggle("active", k === view));
    // Animate indicator
    const activeBtn = tabEls[view];
    const indicator = document.getElementById("switcher-indicator");
    if (activeBtn && indicator) {
      const track = indicator.parentElement;
      const trackRect = track.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      indicator.style.left = (btnRect.left - trackRect.left) + "px";
      indicator.style.width = btnRect.width + "px";
    }

    if (vouchCard) vouchCard.style.display = allPending.length > 0 ? "" : "none";

    if (view === "sessions") {
      sessionsCard.style.display = "";
      crewsCard.style.display = "none";
      safetyCard.style.display = "none";
    } else if (view === "crews") {
      sessionsCard.style.display = "none";
      crewsCard.style.display = "";
      safetyCard.style.display = "none";
    } else if (view === "safety") {
      sessionsCard.style.display = "none";
      crewsCard.style.display = "none";
      safetyCard.style.display = "";
    } else {
      sessionsCard.style.display = "";
      crewsCard.style.display = "";
      safetyCard.style.display = "";
    }
    // Sync dock
    document.querySelector("#dock-sessions")?.classList.toggle("active", view === "sessions");
    document.querySelector("#dock-crews")?.classList.toggle("active", view === "crews");
  }

  el.append(sessionsCard, crewsCard, safetyCard);
  switchView("sessions");

  // Init indicator position after render
  requestAnimationFrame(() => switchView("sessions"));

  window._switchDashboardView = switchView;
  window._uwianNewCrewSheet   = newCrewSheet;
  window._planSessionSheet    = () => {
    if (gs.length === 0) { toast("Create a crew first before scheduling a hangout."); newCrewSheet(); return; }
    if (gs.length === 1) { location.hash = `/g/${gs[0].id}`; toast(`Opening ${gs[0].name} to schedule hangout...`); return; }
    openSheet("Pick a crew for your session", h("div", {},
      h("p", { style: "font-size:14px;color:var(--text-2);margin-bottom:14px" }, "Which crew do you want to plan this session for?"),
      ...gs.map(g => h("button", {
        class: "btn ghost",
        style: "width:100%;justify-content:space-between;margin-bottom:8px;padding:12px",
        onclick: () => { location.hash = `/g/${g.id}`; }
      }, h("span", { style: "font-weight:600" }, g.name), icon("arrow", { size: 14 })))));
  };
  return el;

  function newCrewSheet() {
    const n = h("input", { placeholder: "e.g. Barkada Sabado", id: "new-group-name", autocomplete: "off" });
    openSheet("New crew", h("div", {},
      h("p", { style: "font-size:14px;color:var(--text-2);margin-bottom:16px" }, "Give your crew a name. You can invite members after."),
      h("label", { class: "f", for: "new-group-name" }, "Crew name"), n,
      h("button", { class: "btn primary", style: "width:100%;margin-top:18px;justify-content:center;padding:12px", onclick: async () => {
          if (!n.value.trim()) return toast("Give your crew a name first.", true);
          const r = await api("/api/groups", { name: n.value.trim() });
          location.hash = `/g/${r.id}`;
        } }, "Create crew")));
    setTimeout(() => n.focus(), 80);
  }
}

/* ════════════════════════════════════
   MESSAGES PAGE
   ════════════════════════════════════ */
export async function pageMessages(initialCid) {
  const el = h("div", { class: "messages-layout enter" });
  let activeCid = initialCid ? Number(initialCid) : null;
  let pollTimer = null;

  /* ── Sidebar: Conversation List ── */
  const sidebar  = h("div", { class: "msg-sidebar" });
  const chatPane = h("div", { class: "msg-chat-pane" });
  el.append(sidebar, chatPane);

  async function loadSidebar() {
    sidebar.innerHTML = "";
    const convs = await api("/api/conversations").catch(() => []);

    sidebar.append(
      h("div", { class: "msg-sidebar-head" },
        h("h2", {}, "Messages"),
        h("button", { class: "btn primary sm", onclick: () => newConvSheet() }, "+ New")));

    if (convs.length === 0) {
      sidebar.append(h("div", { class: "msg-empty-state" },
        icon3d("mail", { size: 40, class: "icon-3d-float" }),
        h("p", {}, "No conversations yet."),
        h("p", { class: "dim" }, "Start a DM with a crew member or open a group chat.")));
    } else {
      const list = h("div", { class: "conv-list" });
      convs.forEach(c => {
        const isActive = c.id === activeCid;
        const item = h("div", {
          class: `conv-item${isActive ? " active" : ""}${c.unread_count > 0 ? " unread" : ""}`,
          onclick: () => openConv(c.id)
        },
          h("div", { class: "conv-av" }, (c.display_name || "?")[0].toUpperCase()),
          h("div", { class: "conv-info" },
            h("div", { class: "conv-name-row" },
              h("span", { class: "conv-name" }, c.display_name),
              h("span", { class: "conv-time" }, c.last_message_at ? timeAgo(c.last_message_at) : "")),
            h("div", { class: "conv-last-msg" }, c.last_message
              ? `${c.type === "group" ? (c.last_sender_name?.split(" ")[0] + ": ") : ""}${c.last_message.slice(0, 55)}`
              : "No messages yet")),
          c.unread_count > 0 ? h("span", { class: "conv-unread-badge" }, String(c.unread_count)) : null);
        list.append(item);
      });
      sidebar.append(list);
    }
  }

  async function openConv(cid) {
    activeCid = cid;
    if (pollTimer) clearInterval(pollTimer);
    await loadSidebar();
    await renderChat(cid);
    // Poll for new messages every 5s
    pollTimer = setInterval(() => renderChatMessages(cid), 5000);
    // Update URL without re-routing
    history.replaceState(null, "", `#/messages/${cid}`);
  }

  async function renderChat(cid) {
    chatPane.innerHTML = "";
    const convs  = await api("/api/conversations").catch(() => []);
    const conv   = convs.find(c => c.id === cid);
    if (!conv) { chatPane.append(h("div", { class: "msg-placeholder" }, icon3d("mail", { size: 48, class: "icon-3d-float" }), h("p", {}, "Select a conversation"))); return; }

    const header = h("div", { class: "msg-chat-header" },
      h("div", { class: "conv-av sm" }, (conv.display_name || "?")[0].toUpperCase()),
      h("div", { class: "msg-chat-header-info" },
        h("div", { class: "msg-chat-name" }, conv.display_name),
        h("div", { class: "msg-chat-meta" }, conv.type === "dm" ? "Direct Message" : `Group Chat · ${conv.members?.length ?? 0} members`)));
    chatPane.append(header);

    const messagesWrap = h("div", { class: "msg-messages-wrap", id: `chat-messages-${cid}` });
    chatPane.append(messagesWrap);
    await renderChatMessages(cid, messagesWrap);

    /* Input area */
    const input = h("textarea", {
      class: "msg-input",
      placeholder: "Type a message…",
      rows: 1,
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
        // Auto-expand
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      }
    });
    const sendBtn = h("button", { class: "msg-send-btn", onclick: () => sendMsg() },
      h("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", "stroke-width": "2.2" },
        h("path", { d: "M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" })));
    const inputRow = h("div", { class: "msg-input-row" }, input, sendBtn);
    chatPane.append(inputRow);

    async function sendMsg() {
      const txt = input.value.trim();
      if (!txt) return;
      input.value = "";
      input.style.height = "auto";
      try {
        await api(`/api/conversations/${cid}/messages`, { content: txt });
        await renderChatMessages(cid, messagesWrap);
      } catch (e) { toast(e.message, true); }
    }
  }

  async function renderChatMessages(cid, wrap) {
    const container = wrap || document.getElementById(`chat-messages-${cid}`);
    if (!container) return;
    const msgs = await api(`/api/conversations/${cid}/messages`).catch(() => []);
    const uid  = me()?.id;
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 40;
    container.innerHTML = "";
    if (msgs.length === 0) {
      container.append(h("div", { class: "msg-empty-messages" }, icon3d("mail", { size: 32, class: "icon-3d-float" }), h("p", {}, "No messages yet. Say hi to start.")));
    } else {
      let lastDate = null;
      msgs.forEach(m => {
        const d = new Date(m.created_at + "Z");
        const dateLabel = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
        if (dateLabel !== lastDate) {
          container.append(h("div", { class: "msg-date-divider" }, dateLabel));
          lastDate = dateLabel;
        }
        const isMine = m.sender_id === uid;
        const bubble = h("div", { class: `msg-bubble-wrap ${isMine ? "mine" : "theirs"}` },
          !isMine ? h("div", { class: "msg-bubble-av" }, (m.sender_name || "?")[0].toUpperCase()) : null,
          h("div", { class: "msg-bubble-col" },
            !isMine ? h("div", { class: "msg-sender-name" }, m.sender_name) : null,
            h("div", { class: `msg-bubble${isMine ? " mine" : ""}` }, m.content),
            h("div", { class: "msg-timestamp" }, d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))));
        container.append(bubble);
      });
    }
    if (atBottom) container.scrollTop = container.scrollHeight;
  }

  function newConvSheet() {
    api("/api/groups").then(gs => {
      const tabs = h("div", { class: "filter-bar", style: "margin-bottom:16px" });
      const dmTab    = h("button", { class: "filter-chip active", onclick: () => { dmSection.style.display = ""; gcSection.style.display = "none"; dmTab.classList.add("active"); gcTab.classList.remove("active"); } }, "Direct message");
      const gcTab    = h("button", { class: "filter-chip",        onclick: () => { dmSection.style.display = "none"; gcSection.style.display = ""; gcTab.classList.add("active"); dmTab.classList.remove("active"); } }, "Group chat");
      tabs.append(dmTab, gcTab);

      const uidInput = h("input", { placeholder: "Recipient user ID or name", id: "dm-uid-input" });
      const dmSection = h("div", {},
        h("p", { style: "font-size:13px;color:var(--text-2);margin-bottom:12px" }, "Enter the User ID of the person to message. Find IDs on their member card in a shared crew."),
        h("label", { class: "f" }, "User ID"), uidInput,
        h("button", { class: "btn primary", style: "width:100%;margin-top:14px;justify-content:center", onclick: async () => {
            const uid2 = Number(uidInput.value);
            if (!uid2) return toast("Enter a valid User ID.", true);
            const r = await api("/api/conversations/dm", { target_user_id: uid2 });
            location.hash = `/messages/${r.id}`;
          } }, "Open DM"));

      const gcSel = h("select", {}, h("option", { value: "" }, "Pick a crew"), ...gs.map(g => h("option", { value: g.id }, g.name)));
      const gcSection = h("div", { style: "display:none" },
        h("p", { style: "font-size:13px;color:var(--text-2);margin-bottom:12px" }, "Start a group chat for your entire crew. All active members will be added automatically."),
        h("label", { class: "f" }, "Crew"), gcSel,
        h("button", { class: "btn primary", style: "width:100%;margin-top:14px;justify-content:center", onclick: async () => {
            if (!gcSel.value) return toast("Pick a crew first.", true);
            const g = gs.find(g => g.id === Number(gcSel.value));
            const r = await api("/api/conversations/group", { group_id: Number(gcSel.value), title: `${g?.name ?? "Crew"} Chat` });
            location.hash = `/messages/${r.id}`;
          } }, "Start Group Chat"));

      openSheet("New Message", h("div", {}, tabs, dmSection, gcSection));
    });
  }

  // Initial load
  await loadSidebar();
  if (activeCid) {
    await renderChat(activeCid);
    pollTimer = setInterval(() => renderChatMessages(activeCid), 5000);
  } else {
    chatPane.append(h("div", { class: "msg-placeholder" },
      icon3d("mail", { size: 56, class: "icon-3d-float" }),
      h("h3", {}, "Your Messages"),
      h("p", { class: "dim" }, "Select a conversation on the left or start a new one.")));
  }

  // Cleanup poll on navigate away
  window._msgCleanup = () => { if (pollTimer) clearInterval(pollTimer); };

  return el;
}


function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}





/* ════════════════════════════════════
   GROUP HOME
   ════════════════════════════════════ */
export async function pageGroup(gid) {
  const d      = await api(`/api/groups/${gid}`);
  const ledger = await api(`/api/groups/${gid}/ledger`);
  const spots  = await api(`/api/groups/${gid}/spots`);
  d.spotsList  = spots;
  const isAdmin = d.members.find((m) => m.user_id === me().id)?.role === "admin";
  const upcoming = d.sessions.filter((s) => s.status !== "closed").slice(0, 4);
  const el = h("div", { class: "enter" });

  /* ── group header card ── */
  const parts = (d.group.name ?? "").trim().split(" ");
  const init  = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  el.append(h("div", { class: "group-header" },
    h("div", { class: "group-header-av" }, init),
    h("div", { class: "group-header-body" },
      h("h1", {}, d.group.name),
      h("div", { class: "member-count" }, `${d.members.length} member${d.members.length !== 1 ? "s" : ""}`)),
    h("div", { class: "group-header-actions" },
      h("button", { class: "btn ghost sm icon-text-row", onclick: () => inviteFlow(gid) }, icon3d("mail", { size: 15 }), "Invite"),
      isAdmin ? h("button", { class: "btn primary sm", onclick: () => sessionForm(gid, d) }, "+ Session") : null)));

  /* ── vouch queue ── */
  if (d.pending.length) {
    const vouchPanel = h("div", { class: "panel" },
      h("div", { class: "section-head", style: "margin:0 0 12px" },
        h("h2", {}, "Vouch queue"),
        h("span", { class: "chip amber" }, `${d.pending.length} pending`)));
    d.pending.forEach((p) => {
      vouchPanel.append(h("div", { class: "vouch-row" },
        avatar(p.name),
        h("div", { class: "vouch-info" },
          h("strong", {}, p.name),
          h("span", {}, `${p.vouches}/${d.group.vouches_required} vouch${p.vouches !== 1 ? "es" : ""} so far`)),
        h("button", { class: "btn good sm", onclick: async () => {
            const r = await api(`/api/groups/${gid}/vouch/${p.user_id}`, {});
            toast(r.accepted ? "They are in. Welcome to the crew." : `Vouched (${r.have} of ${r.need}).`);
            pageGroupRerender(gid);
          } }, "Vouch in")));
    });
    el.append(vouchPanel);
  }

  /* ── sessions ── */
  el.append(h("div", { class: "panel" },
    h("div", { class: "section-head", style: "margin:0 0 14px" },
      h("h2", {}, "Sessions"),
      isAdmin ? h("button", { class: "btn primary sm", onclick: () => sessionForm(gid, d) }, "+ Session") : null),
    upcoming.length === 0
      ? h("div", { class: "hero-empty", style: "padding:32px 0" },
          h("div", { class: "hero-icon", style: "width:48px;height:48px;margin-bottom:10px;border:none;background:transparent" }, icon3d("cup", { size: 40, class: "icon-3d-float" })),
          h("p", {}, isAdmin ? "No sessions yet. Tap + Session to plan one." : "No upcoming sessions."))
      : h("div", {},
          ...upcoming.map((s) => {
            const sessIcon = s.status === "open" ? icon3d("cup", { size: 18 }) : s.status === "wrapped" ? icon3d("travel", { size: 18 }) : s.status === "closed" ? icon3d("tick", { size: 18 }) : icon3d("calendar", { size: 18 });
            return h("div", {
              class: "session-card", role: "link", tabindex: "0",
              onclick: () => (location.hash = `/s/${s.id}`),
              onkeydown: (e) => { if (e.key === "Enter") location.hash = `/s/${s.id}`; }
            },
              h("div", { class: "session-card-icon" }, sessIcon),
              h("div", { class: "session-card-body" },
                h("div", { class: "session-card-title" }, fmtSessionTime(s.starts_at)),
                h("div", { class: "session-card-sub" }, statusLabel(s.status))),
              h("span", { class: `status-bar ${s.status}` }, statusLabel(s.status)));
          })),
    d.sessions.filter((s) => s.status === "closed").length > 0
      ? h("div", { style: "padding-top:12px;border-top:1px solid var(--border);margin-top:8px" },
          h("p", { class: "dim", style: "font-size:13px;margin-bottom:8px" }, "Past sessions"),
          ...d.sessions.filter((s) => s.status === "closed").slice(0, 3).map((s) =>
            h("div", { class: "list-row clickable", onclick: () => (location.hash = `/s/${s.id}`) },
              h("div", { class: "grow" },
                h("span", {}, new Date(s.starts_at + "Z").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })),
                h("span", { class: "dim", style: "margin-left:8px" }, "Closed")),
              h("span", { class: "open-link" }, "Open"))))
      : null));

  /* ── ledger ── */
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Outstanding balances"),
    ledger.length === 0
      ? h("div", { style: "display:flex;align-items:center;gap:10px;padding:12px 0;color:var(--green)" },
          h("span", { style: "display:inline-flex;align-items:center" }, icon3d("tick", { size: 22 })),
          h("span", { style: "font:600 15px var(--font)" }, "All settled up!"))
      : h("div", { class: "receipt" },
          ...ledger.map((t) => h("div", { class: "line" },
            h("span", {}, `${nameOf(d, t.from)} → ${nameOf(d, t.to)}`),
            h("span", { class: "money" }, fmtPeso(t.amount_centavos)))),
          h("div", { class: "line total" },
            h("span", {}, `${ledger.length} transfer${ledger.length !== 1 ? "s" : ""} (min)`),
            h("span", {})))));

  /* ── members ── */
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Members & directions"),
    ...d.members.map((m) => h("div", { class: "list-row" },
      avatar(m.name),
      h("div", { class: "grow" },
        h("span", { style: "font:500 14px var(--font)" }, m.name),
        m.user_id === me().id ? h("span", { class: "chip", style: "margin-left:8px" }, "you") : null,
        m.can_drink ? null : h("span", { class: "chip", style: "margin-left:6px" }, "Non-drinker"),
        m.strikes > 0 && isAdmin ? h("span", { class: "chip red", style: "margin-left:6px" }, `${m.strikes} strike${m.strikes !== 1 ? "s" : ""}`) : null),
      h("select", { style: "width:auto;max-width:160px", onchange: async (e) => {
          if (m.user_id !== me().id) return toast("You can only set your own direction tag.", true), e.target.blur();
          await api("/api/me/direction", { group_id: gid, direction_tag_id: e.target.value ? Number(e.target.value) : null }, "PUT");
          toast("Direction updated.");
        } },
        h("option", { value: "" }, "No direction"),
        ...d.tags.map((t) => h("option", { value: t.id, selected: m.direction_tag_id === t.id }, t.label))))),
    isAdmin ? h("div", { class: "row", style: "margin-top:14px;padding-top:14px;border-top:1px solid var(--border)" },
      (() => {
        const l = h("input", { placeholder: "Add direction tag (e.g. North, QC)…" });
        return [l, h("button", { class: "btn sm", onclick: async () => {
            if (!l.value.trim()) return;
            await api(`/api/groups/${gid}/tags`, { label: l.value.trim() });
            l.value = ""; pageGroupRerender(gid);
          } }, "+ Tag")];
      })()) : null));

  /* ── map + settings row ── */
  el.append(h("div", { class: "grid2" },
    h("div", { class: "panel card-hover", style: "cursor:pointer", onclick: () => (location.hash = `/map/${gid}`) },
      h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:8px" },
        icon3d("mappin", { size: 26 }),
        h("h2", { style: "margin-bottom:0" }, "Hangout Map")),
      h("p", { class: "dim" },
        `${spots.length} spot${spots.length !== 1 ? "s" : ""}${spots.some((s) => s.stale) ? " · some need re-confirming" : ""}`),
      h("p", { style: "margin-top:12px;color:var(--accent-text);font:600 13px var(--font)" }, "Open map")),
    isAdmin ? h("div", { class: "panel" },
      h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:16px" },
        icon3d("setting", { size: 26 }),
        h("h2", { style: "margin-bottom:0" }, "Group settings")),
      settingsPanel(gid, d)) : null));

  return el;
}

const statusLabel = (s) => ({ planning: "Planning", open: "Tab open", wrapped: "Uwian time", closed: "Closed" }[s] ?? s);
const nameOf = (d, uid) => d.members.find((m) => m.user_id === Number(uid))?.name ?? d.allNames?.[uid] ?? `User ${uid}`;

function settingsPanel(gid, d) {
  const vq = h("select", { style: "width:auto" },
    h("option", { value: 1, selected: d.group.vouches_required === 1 }, "1 vouch to join"),
    h("option", { value: 2, selected: d.group.vouches_required === 2 }, "2 vouches to join"));
  const buddyMin = h("input", { type: "number", value: d.group.buddy_notify_min, style: "width:90px" });
  const adminMin = h("input", { type: "number", value: d.group.admin_notify_min, style: "width:90px" });
  return h("div", {},
    h("label", { class: "f" }, "Vouches required to join"), vq,
    h("label", { class: "f" }, "Buddy alert delay (minutes after deadline)"), buddyMin,
    h("label", { class: "f" }, "Admin escalation delay (minutes)"), adminMin,
    h("button", { class: "btn primary", style: "margin-top:16px;width:100%;justify-content:center", onclick: async () => {
        await api(`/api/groups/${gid}/settings`, { vouches_required: Number(vq.value), buddy_notify_min: Number(buddyMin.value), admin_notify_min: Number(adminMin.value) }, "PATCH");
        toast("Settings saved.");
      } }, "Save settings"));
}

async function inviteFlow(gid) {
  const r = await api(`/api/groups/${gid}/invite`, {});
  openSheet("Invite to crew", h("div", {},
    h("p", { style: "font-size:14px;color:var(--text-2);margin-bottom:14px" }, "Share this link with someone you trust. They'll need a vouch from an existing member before they can join."),
    h("div", { class: "inset", style: "font-family:var(--mono);font-size:13px;word-break:break-all;margin-bottom:14px" }, `${location.origin}${r.invite_url}`),
    h("button", { class: "btn primary", style: "width:100%;justify-content:center", onclick: () => {
        navigator.clipboard?.writeText(`${location.origin}${r.invite_url}`);
        toast("Link copied!");
      } }, "Copy link")));
}

function sessionForm(gid, d) {
  const when   = h("input", { type: "datetime-local" });
  const spotSel = h("select", {}, h("option", { value: "" }, "No spot"), ...(d.spotsList?.map?.((s) => h("option", { value: s.id }, s.name)) ?? []));
  const ddSel  = h("select", {}, h("option", { value: "" }, "No designated driver"), ...d.members.map((m) => h("option", { value: m.user_id }, m.name)));
  openSheet("New session", h("div", {},
    h("label", { class: "f" }, "When"), when,
    h("label", { class: "f" }, "Location (add on map first)"), spotSel,
    h("label", { class: "f" }, "Designated driver (excluded from alcohol items)"), ddSel,
    h("p", { class: "dim", style: "margin-top:8px;font-size:13px" }, "The DD is automatically skipped on every alcohol expense."),
    h("button", { class: "btn primary", style: "margin-top:18px;width:100%;justify-content:center", onclick: async () => {
        if (!when.value) return toast("Pick a date and time.", true);
        const r = await api(`/api/groups/${gid}/sessions`, { starts_at: when.value, designated_driver_id: ddSel.value ? Number(ddSel.value) : null });
        location.hash = `/s/${r.id}`;
      } }, "Create session")));
}

function pageGroupRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/g/${gid}`)); }

/* ════════════════════════════════════
   SESSION SCREEN
   ════════════════════════════════════ */
export async function pageSession(sid) {
  const d   = await api(`/api/sessions/${sid}`);
  const gid = d.session.group_id;
  const gd  = await api(`/api/groups/${gid}`);
  const isAdmin = gd.members.find((m) => m.user_id === me().id)?.role === "admin";
  const nameOfU = (uid) => gd.members.find((m) => m.user_id === Number(uid))?.name ?? d.session.designated_driver_name ?? `#${uid}`;
  const el = h("div", { class: "enter" });

  /* header */
  el.append(h("div", { class: "panel" },
    h("div", { class: "row spread", style: "margin-bottom:14px" },
      h("div", {},
        h("p", { style: "font:500 13px var(--font);color:var(--text-2);margin-bottom:4px" },
          h("a", { href: `#/g/${gid}`, style: "color:var(--accent-text);text-decoration:none" }, gd.group?.name ?? "Crew"), " · session"),
        h("h1", { style: "font:700 20px var(--font);color:var(--text);letter-spacing:-0.3px" },
          new Date(d.session.starts_at + "Z").toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))),
      h("span", { class: `status-bar ${d.session.status}` }, statusLabel(d.session.status))),
    d.spot ? h("p", { style: "font-size:14px;color:var(--text-2);display:inline-flex;align-items:center;gap:6px" }, icon3d("mappin", { size: 16 }), d.spot.name) : null,
    d.session.designated_driver_id
      ? h("div", { class: "inset", style: "margin-top:14px;display:flex;align-items:center;gap:10px" },
          icon3d("travel", { size: 24 }),
          h("span", {}, h("b", {}, "DD: "), nameOfU(d.session.designated_driver_id)),
          h("span", { class: "dim" }, "is skipped on alcohol items"))
      : null));

  /* RSVP */
  const my = d.rsvps.find((r) => r.user_id === me().id);
  el.append(h("div", { class: "panel" },
    h("h2", {}, "Who's coming"),
    h("div", { class: "rsvp-bar" },
      ...[["going", "Going"], ["maybe", "Maybe"], ["cant", "Can't"]].map(([st, label]) =>
        h("button", {
          class: `btn ${my?.status === st ? "primary" : ""}`,
          onclick: async () => { await api(`/api/sessions/${sid}/rsvp`, { status: st }); pageSessionRerender(sid); }
        }, label))),
    h("div", { class: "receipt" },
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const r = d.rsvps.find((x) => x.user_id === m.user_id);
        return h("div", { class: "line" },
          h("span", {}, m.name + (m.user_id === me().id ? " (you)" : "")),
          h("span", { style: r?.status === "going" ? "color:var(--green);font-weight:600" : r?.status === "cant" ? "color:var(--red)" : "" },
            r ? { going: "Going", maybe: "Maybe", cant: "Can't" }[r.status] : "No reply"));
      }))));

  /* tabs */
  const tabBar  = h("div", { class: "tabbar" });
  const tabBody = h("div", {});
  const tabs    = { tab: "Tab", settle: "Settle up", uwian: "Uwian", limit: "My Limit" };
  let cur = "tab";
  for (const [key, label] of Object.entries(tabs)) {
    const b = h("button", { class: "tab", onclick: () => { cur = key; renderTab(); } }, label);
    b.dataset.k = key; tabBar.append(b);
  }
  el.append(tabBar, tabBody);

  function renderTab() {
    [...tabBar.children].forEach((b) => b.classList.toggle("on", b.dataset.k === cur));
    tabBody.innerHTML = "";
    tabBody.append(cur === "tab" ? tabExpenses() : cur === "settle" ? tabSettle() : cur === "uwian" ? tabUwian() : tabLimit());
  }

  /* ── Expenses tab ── */
  function tabExpenses() {
    const wrap = h("div", { class: "panel" });
    if (d.session.status !== "closed")
      wrap.append(addExpenseForm(d, sid, nameOfU, () => pageSessionRerender(sid)));
    else
      wrap.append(h("div", { class: "inset", style: "margin-bottom:16px" },
        h("p", { class: "dim" }, "Tab is closed. " + (isAdmin ? "You can reopen it below." : "Contact an admin if something's wrong."))));
    const total = d.expenses.reduce((s, e) => s + e.amount_centavos, 0);
    wrap.append(
      h("h2", {}, "Tonight's tab"),
      d.expenses.length === 0
        ? h("p", { class: "dim" }, "No expenses logged yet.")
        : h("div", { class: "receipt" },
            ...d.expenses.map((e) => {
              const parts = Object.keys(d.shares[e.id] ?? {});
              return h("div", {},
                h("div", { class: "line" },
                  h("span", { style: "display:inline-flex;align-items:center;gap:6px" },
                    icon3d(e.is_alcohol ? "cup" : "takeaway", { size: 18 }),
                    e.description),
                  h("span", {}, `${fmtPeso(e.amount_centavos)}, paid by ${e.payer_name ?? nameOfU(e.paid_by)}`)),
                h("div", { class: "dim", style: "padding:2px 0 8px;font-size:12px" },
                  `Split with: ${parts.map(nameOfU).join(", ") || "nobody yet"}` +
                  (e.edited_after_close ? " · ⟨edited after close⟩" : "")));
            }),
            h("div", { class: "line total" }, h("span", {}, "TOTAL"), h("span", { class: "money" }, fmtPeso(total)))));
    return wrap;
  }

  /* ── Settle tab ── */
  function tabSettle() {
    const wrap = h("div", { class: "panel" }, h("h2", {}, "Settle up"));
    if (isAdmin && d.session.status !== "closed")
      wrap.append(h("button", { class: "btn primary", style: "margin-bottom:18px", onclick: async () => {
          await api(`/api/sessions/${sid}/close-tab`, {});
          toast("Tab closed. No more edits without reopening.");
          pageSessionRerender(sid);
        } }, "Close tab"));
    if (!d.settlements.length)
      return wrap.append(h("p", { class: "dim" }, "No settlements yet. Close the tab when the night is done.")), wrap;
    for (const t of d.settlements) {
      const mine_payer = t.from_user === me().id, mine_recv = t.to_user === me().id;
      const row = h("div", { class: "list-row" },
        avatar(t.from_name ?? nameOfU(t.from_user)),
        h("div", { class: "grow" },
          h("b", {}, `${t.from_name ?? nameOfU(t.from_user)} → ${t.to_name ?? nameOfU(t.to_user)}`),
          " ",
          h("span", { class: `chip ${t.status === "confirmed" ? "green" : t.status === "disputed" ? "red" : t.status === "paid_claimed" ? "amber" : ""}` },
            { open: "Open", paid_claimed: "Claimed paid", confirmed: "Confirmed", disputed: "Disputed" }[t.status]),
          t.note ? h("div", { class: "dim", style: "margin-top:4px" }, `"${t.note}"`) : null),
        h("span", { class: "money" }, fmtPeso(t.amount_centavos)));
      if (mine_payer && t.status === "open")
        row.append(h("button", { class: "btn good sm", onclick: async () => {
            await api(`/api/settlements/${t.id}/claim-paid`, {});
            pageSessionRerender(sid);
          } }, "I've paid"));
      if (mine_recv && t.status === "paid_claimed")
        row.append(
          h("button", { class: "btn good sm", onclick: async () => {
              await api(`/api/settlements/${t.id}/confirm`, {});
              toast("Confirmed. All good.");
              pageSessionRerender(sid);
            } }, "Confirm received"),
          h("button", { class: "btn bad sm", onclick: () => disputeForm(t.id, sid) }, "Dispute"));
      wrap.append(row);
    }
    if (isAdmin && d.session.status === "closed")
      wrap.append(h("button", { class: "btn ghost", style: "margin-top:14px;width:100%;justify-content:center", onclick: async () => {
          const r = await api(`/api/sessions/${sid}/reopen`, {});
          toast(r.note);
          pageSessionRerender(sid);
        } }, "Reopen tab (voids unpaid, keeps confirmed)"));
    return wrap;
  }

  /* ── Uwian tab ── */
  function tabUwian() {
    const wrap = h("div", { class: "panel" },
      h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:16px" },
        icon3d("travel", { size: 28, class: "icon-3d-float" }),
        h("h2", { style: "margin-bottom:0" }, "Uwian: get everyone home safe")));
    if (isAdmin && d.session.status === "open")
      wrap.append(h("button", { class: "btn primary", style: "margin-bottom:18px;width:100%;justify-content:center", onclick: async () => {
          const deadline = new Date(Date.now() + 45 * 60000).toISOString().slice(0, 19).replace("T", " ");
          await api(`/api/sessions/${sid}`, { status: "wrapped", uwian_deadline: deadline }, "PATCH");
          toast("Session wrapped. Buddies paired by direction.");
          pageSessionRerender(sid);
        } }, "Wrap session"));
    const myCi = d.checkins.find((c) => c.user_id === me().id);
    if (!myCi?.home_confirmed_at) {
      const modeSel = h("select", { style: "width:auto" }, ...Object.entries(MODES).map(([k, v]) => h("option", { value: k }, v)));
      wrap.append(h("div", { class: "inset row", style: "margin-bottom:18px" },
        h("b", {}, "How are you getting home?"), modeSel,
        h("button", { class: "btn good", onclick: async () => {
            await api(`/api/sessions/${sid}/checkin`, { mode: modeSel.value });
            toast("Checked in. Get home safe.");
            pageSessionRerender(sid);
          } }, "I'm home")));
    }
    wrap.append(h("h3", { style: "margin:0 0 10px" }, "Who's home"),
      ...gd.members.filter((m) => m.status === "active").map((m) => {
        const ci   = d.checkins.find((c) => c.user_id === m.user_id);
        const rsvp = d.rsvps.find((r) => r.user_id === m.user_id);
        if (rsvp?.status === "cant") return null;
        const row = h("div", { class: "list-row" }, avatar(m.name), lampFor(ci),
          h("div", { class: "grow" }, m.name,
            ci?.mode ? h("span", { class: "dim" }, ` · ${MODES[ci.mode]}`) : null,
            ci?.ride_offer_from ? h("span", { class: "chip green", style: "margin-left:6px" }, "Ride offered") : null),
          ci?.flag_stage >= 2 && !ci?.home_confirmed_at
            ? h("button", { class: "btn sm", onclick: async () => {
                const pair = d.buddy_pairs.find((p) => [p.user_a, p.user_b, p.user_c].includes(m.user_id));
                if (!pair) return toast("No buddy pair. Contact an admin.", true);
                await api(`/api/buddies/${sid}/${pair.user_a}/${pair.user_b}/clear-flag`, {});
                toast("Flag cleared. Thanks for checking in on each other.");
                pageSessionRerender(sid);
              } }, "Spoke to them, all good")
            : null);
        if (ci?.mode === "own_drive" && d.session.designated_driver_id !== m.user_id && !ci.ride_offer_from && m.user_id !== me().id)
          row.append(h("button", { class: "btn ghost sm", onclick: async () => {
              await api(`/api/buddies/${sid}/${m.user_id}/0/offer-ride`, {});
              toast("Ride offered.");
              pageSessionRerender(sid);
            } }, "Offer a ride"));
        return row;
      }));
    if (d.buddy_pairs.length)
      wrap.append(
        h("h3", { style: "margin:18px 0 10px" }, "Buddy pairs (by direction)"),
        h("div", { class: "receipt" },
          ...d.buddy_pairs.map((p) => h("div", { class: "line" }, h("span", {}, p.names.join(" + ")), h("span", {})))));
    wrap.append(h("p", { class: "dim", style: "margin-top:18px;font-size:12px;border-top:1px solid var(--border);padding-top:14px" },
      "This app is not a rescue service. Escalation is just a nudge to check in. In a real emergency, call your local emergency number."));
    return wrap;
  }

  /* ── My Limit tab ── */
  function tabLimit() {
    const wrap = h("div", { class: "panel" },
      h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:6px" },
        icon("sliders", { size: 20, strokeColor: "var(--accent-text)" }),
        h("h2", { style: "margin-bottom:0" }, "My Limit")),
      h("p", { class: "dim", style: "margin-bottom:18px" }, "Private. Only you can see this. A personal reminder, not an alcohol calculator."));
    const board = h("div", { class: "tally-board" });
    const limIn = h("input", { type: "number", min: 1, style: "width:80px" });

    async function refresh() {
      const r = await api(`/api/sessions/${sid}/limit`);
      board.innerHTML = "";
      const show = Math.max(r.lim ?? 0, r.count, 8);
      for (let i = 1; i <= Math.min(show, 12); i++)
        board.append(h("div", { class: `tally ${i <= r.count ? "full" : "empty"}` }, i <= r.count ? "/" : "·"));
      const pct = r.lim ? r.count / r.lim : 0;
      if (pct >= 0.8) board.append(h("div", { class: `chip ${pct >= 1 ? "red" : "amber"}`, style: "align-self:center;margin-left:4px" },
        pct >= 1 ? "At your limit. Sort your ride?" : "Getting close. Sort your ride?"));
      if (pct >= 0.8) board.append(h("button", { class: "btn good sm", style: "align-self:center", onclick: () => { cur = "uwian"; renderTab(); } }, "Check in now"));
    }

    const push = h("button", { class: "round-push", onclick: async () => {
        const r = await api(`/api/sessions/${sid}/limit/tap`, {});
        if (navigator.vibrate) navigator.vibrate(30);
        if (r.level) toast(r.level === "at_limit" ? "You have hit your limit. Sort your ride home." : "Getting close to your limit.");
        refresh();
      } }, "+ 1 round");

    wrap.append(
      h("div", { style: "display:flex;align-items:flex-start;gap:22px;flex-wrap:wrap;margin-top:4px" },
        push,
        h("div", { class: "grow" },
          board,
          h("div", { class: "row", style: "margin-top:16px;flex-wrap:wrap" },
            h("label", { class: "f", style: "margin:0;white-space:nowrap" }, "My limit (rounds)"),
            limIn,
            h("button", { class: "btn sm", onclick: async () => {
                await api(`/api/sessions/${sid}/limit`, { limit: limIn.value ? Number(limIn.value) : null }, "PUT");
                refresh(); toast("Limit updated.");
              } }, "Set")))));
    refresh();
    return wrap;
  }

  renderTab();
  return el;
}

function addExpenseForm(d, sid, nameOfU, done) {
  const desc  = h("input", { placeholder: "What was it? (e.g. beer bucket, sisig…)" });
  const amt   = h("input", { placeholder: "Amount ₱", inputmode: "decimal", style: "max-width:140px" });
  const payer = h("select", { style: "width:auto" },
    ...d.members.map((m) => h("option", { value: m.user_id, selected: m.user_id === me().id }, m.name)));
  let isAlcohol = true;
  const note  = h("p", { class: "dim", style: "margin-top:8px;font-size:13px" }, alcoholNote(d));
  const togg  = h("span", { class: "toggle on", onclick: () => {
      isAlcohol = !isAlcohol;
      togg.classList.toggle("on", isAlcohol);
      note.textContent = isAlcohol ? alcoholNote(d) : "Food/non-alcohol: everyone attending splits it.";
    } },
    h("span", { class: "slot" }, h("span", { class: "knob" })),
    h("span", { class: "label-text" }, "Alcohol"));

  function alcoholNote(sess) {
    const dd = sess.session.designated_driver_name;
    return dd
      ? `Auto-split: ${dd} is excluded from alcohol, as are non-drinkers.`
      : "Marked as alcohol: DD will be excluded automatically.";
  }

  const checks = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" }, ...d.members.map((m) => {
    const cb = h("input", { type: "checkbox", checked: true, style: "width:auto" });
    cb.dataset.uid = m.user_id;
    return h("label", { class: "chip", style: "display:inline-flex;gap:6px;align-items:center;cursor:pointer;padding:5px 10px" }, cb, m.name);
  }));

  return h("div", { class: "inset", style: "margin-bottom:18px" },
    h("div", { class: "row" }, desc, amt, payer, togg),
    h("div", { class: "row", style: "margin-top:10px" }, h("span", { class: "dim" }, "Split with:"), checks),
    note,
    h("button", { class: "btn primary", style: "margin-top:14px;width:100%;justify-content:center", onclick: async () => {
        const cents = pesoToCents(amt.value);
        if (!cents) return toast("Enter a valid amount, e.g. 450 or 450.50", true);
        const chosen = [...checks.querySelectorAll("input")].filter((c) => c.checked).map((c) => c.dataset.uid);
        await api(`/api/sessions/${sid}/expenses`, {
          amount_centavos: cents,
          description: desc.value || "item",
          is_alcohol: isAlcohol ? 1 : 0,
          paid_by: Number(payer.value),
          participants: chosen,
        });
        toast("Expense added to tab."); done();
      } }, "Add to tab"));
}

function disputeForm(id, sid) {
  const note = h("textarea", { placeholder: "Describe the issue. The admin will see this.", style: "min-height:100px" });
  openSheet("Dispute transfer", h("div", {}, note,
    h("button", { class: "btn bad", style: "margin-top:14px;width:100%;justify-content:center", onclick: async () => {
        if (!note.value.trim()) return toast("Please describe the issue first.", true);
        await api(`/api/settlements/${id}/dispute`, { note: note.value });
        toast("Marked as disputed. Admins have been notified.");
        pageSessionRerender(sid);
      } }, "Submit dispute")));
}

function pageSessionRerender(sid) { location.hash = ""; requestAnimationFrame(() => (location.hash = `/s/${sid}`)); }

/* ════════════════════════════════════
   PUBLIC / VERIFIED HANGOUT RADAR MAP
   ════════════════════════════════════ */
export async function pageMap(gid) {
  const spots = gid
    ? await api(`/api/groups/${gid}/spots`).catch(() => [])
    : await api("/api/map/radar").catch(() => []);

  const gd = gid ? await api(`/api/groups/${gid}`).catch(() => null) : null;
  const el = h("div", { class: "enter" });

  /* Map Header */
  el.append(h("div", { class: "panel" },
    h("div", { style: "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:6px" },
      h("div", { style: "display:flex;align-items:center;gap:12px" },
        h("div", { style: "width:48px;height:48px;border-radius:12px;background:var(--accent-dim);border:1.5px solid var(--accent-mid);display:grid;place-items:center;flex:none" },
          icon3d("radar", { size: 28, class: "icon-3d-float" })),
        h("div", {},
          h("h1", { style: "font:700 22px var(--font);letter-spacing:-0.3px;margin:0" },
            gid && gd ? `${gd.group.name} · Tambayan Map` : "Verified Hangout Radar"),
          h("p", { class: "dim", style: "margin:3px 0 0;font-size:13px" },
            "Scheduled and active drinking sessions, closing hours, and verified tambayan spots."))),
      h("div", { style: "display:flex;align-items:center;gap:8px" },
        h("span", { class: "chip green icon-text-row" }, icon3d("shield", { size: 14 }), "Verified Members Only"),
        gid ? h("button", { class: "btn ghost sm", onclick: () => { location.hash = `/g/${gid}`; } }, "← Back to crew") : null))));

  /* Interactive Filters */
  let activeFilter = "all";
  const activeSpotsCount = spots.filter(s => s.has_active_session || (s.sessions && s.sessions.length > 0)).length;

  const btnAll = h("button", { class: "filter-chip active", onclick: () => setFilter("all") }, `All Spots (${spots.length})`);
  const btnActive = h("button", { class: "filter-chip", onclick: () => setFilter("active") }, `Active / Scheduled (${activeSpotsCount})`);
  const btnLate = h("button", { class: "filter-chip", onclick: () => setFilter("late") }, "Late Night (Open 1AM+)");
  const filterRow = h("div", { class: "filter-bar", style: "margin:10px 0 14px" }, btnAll, btnActive, btnLate);
  el.append(filterRow);

  /* Map Container */
  const mapFrame = h("div", { class: "map-frame" }, h("div", { id: "map" }));
  el.append(mapFrame);

  /* Spot List Container */
  const listPanel = h("div", { class: "panel" });
  el.append(listPanel);

  let mapInstance = null;
  const markersMap = new Map();

  function renderList(filteredSpots) {
    listPanel.innerHTML = "";
    listPanel.append(h("div", { class: "section-head", style: "margin-bottom:12px" },
      h("h2", {}, `Tambayans & Sessions (${filteredSpots.length})`),
      gid ? h("span", { class: "dim", style: "font-size:12px" }, "Double-click map to drop a new spot") : null));

    if (filteredSpots.length === 0) {
      listPanel.append(h("div", { class: "hero-empty", style: "padding:32px 0" },
        h("div", { class: "hero-icon", style: "border:none;background:transparent" }, icon3d("mappin", { size: 48, class: "icon-3d-float" })),
        h("h3", {}, "No spots in this filter"),
        h("p", {}, "Try selecting All Spots above to see every verified hangout.")));
      return;
    }

    const cardsGrid = h("div", { class: "map-radar-list" });
    filteredSpots.forEach(sp => {
      const hasSessions = sp.sessions && sp.sessions.length > 0;
      const closingText = sp.closes_at ? `Closes ${sp.closes_at}` : "Closes late";
      const card = h("div", {
        class: `map-radar-card ${sp.has_active_session ? "active-session" : ""}`,
        onclick: () => {
          if (mapInstance) {
            mapInstance.flyTo([sp.lat, sp.lng], 15, { duration: 1 });
            const m = markersMap.get(sp.id);
            if (m) m.openPopup();
          }
        }
      },
        h("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px" },
          h("div", {},
            h("div", { style: "font:700 15px var(--font);color:var(--text)" }, sp.name),
            sp.group_name ? h("div", { class: "dim", style: "font-size:12px;margin-top:2px" }, `Host crew: ${sp.group_name}`) : null),
          h("span", { class: `chip ${sp.has_active_session ? "amber" : "green"} icon-text-row`, style: "font-weight:600" },
            icon3d("clock", { size: 13 }), closingText)),
        sp.notes ? h("p", { style: "font-size:13px;color:var(--text-2);margin:6px 0 10px;line-height:1.4" }, sp.notes) : null,
        hasSessions ? h("div", { class: "radar-session-box" },
          h("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:6px" },
            h("span", { style: "font:600 12.5px var(--font);color:var(--text)" },
              `${sp.sessions.length} session${sp.sessions.length !== 1 ? "s" : ""} scheduled`),
            h("span", { class: "chip primary icon-text-row" }, icon3d("cup", { size: 13 }), "Drinking session")),
          ...sp.sessions.slice(0, 2).map(sess => h("div", { style: "font-size:12px;color:var(--text-2);margin-top:4px" },
            `• ${sess.group_name || "Crew"}: ${fmtSessionTime(sess.starts_at)} (${sess.going_count || 0} going)`))) : null,
        h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid var(--border)" },
          h("span", { class: "dim", style: "font-size:11.5px" }, `Freshness: ${timeAgo(sp.last_confirmed_at)}`),
          h("button", {
            class: "btn ghost sm",
            onclick: (e) => { e.stopPropagation(); confirmSpot(sp.id, "yes"); }
          }, "Confirm Open"))
      );
      cardsGrid.append(card);
    });
    listPanel.append(cardsGrid);
  }

  function setFilter(filter) {
    activeFilter = filter;
    btnAll.classList.toggle("active", filter === "all");
    btnActive.classList.toggle("active", filter === "active");
    btnLate.classList.toggle("active", filter === "late");

    let filtered = spots;
    if (filter === "active") {
      filtered = spots.filter(s => s.has_active_session || (s.sessions && s.sessions.length > 0));
    } else if (filter === "late") {
      filtered = spots.filter(s => {
        const c = s.closes_at || "";
        return c.startsWith("01") || c.startsWith("02") || c.startsWith("03") || c.startsWith("04") || c.startsWith("05") || c.toLowerCase().includes("am");
      });
    }
    renderList(filtered);
  }

  requestAnimationFrame(() => {
    const center = spots.length > 0 ? [spots[0].lat, spots[0].lng] : [14.676, 121.0437];
    const map = L.map("map").setView(center, 13);
    mapInstance = map;
    window._leafletMapInstance = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);

    markersMap.clear();
    for (const sp of spots) {
      const isActive = sp.has_active_session || (sp.sessions && sp.sessions.length > 0);
      const pinClass = isActive ? "pin-spot pin-active" : (sp.stale ? "pin-spot pin-stale" : "pin-spot");
      const markIcon = L.divIcon({ className: "", html: `<div class="${pinClass}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] });
      const marker = L.marker([sp.lat, sp.lng], { icon: markIcon }).addTo(map);
      markersMap.set(sp.id, marker);

      let popupHtml = `<div class="radar-popup">
        <div class="radar-popup-title">${sp.name}</div>
        <div class="radar-popup-closing">Open until ${sp.closes_at || "Late"} · ${sp.price_range || "$$"}</div>
        ${sp.notes ? `<div style="font-size:12px;color:var(--text-2);margin-bottom:6px">${sp.notes}</div>` : ""}`;

      if (sp.sessions && sp.sessions.length > 0) {
        popupHtml += `<div class="radar-session-box"><div style="font-weight:700;font-size:12px;color:var(--accent-text);margin-bottom:4px">Scheduled Drinking Sessions:</div>`;
        for (const s of sp.sessions) {
          popupHtml += `<div style="font-size:11.5px;color:var(--text);margin-bottom:3px"><strong>${s.group_name}</strong> · ${fmtSessionTime(s.starts_at)} (${s.going_count || 0} going)</div>`;
        }
        popupHtml += `</div>`;
      }
      popupHtml += `</div>`;
      marker.bindPopup(popupHtml);
    }

    if (gid) {
      map.on("dblclick", async (e) => {
        const nm = prompt("Spot name:"); if (!nm) return;
        const closes = prompt("Closing time (e.g. 02:00):", "02:00") || "02:00";
        await api(`/api/groups/${gid}/spots`, { name: nm, lat: e.latlng.lat, lng: e.latlng.lng, price_range: "$$", closes_at: closes, notes: "" });
        toast("Spot added to map.");
        pageMapRerender(gid);
      });
    }
  });

  renderList(spots);

  async function confirmSpot(id, answer) {
    let closes_at = null, new_details = null;
    if (answer === "changed") {
      closes_at   = prompt("New closing time (HH:MM, leave blank if unchanged)?") || null;
      new_details = prompt("Any other changes? (optional)") || null;
    }
    await api(`/api/spots/${id}/confirm`, { answer, closes_at, new_details });
    toast(answer === "no" ? "Spot marked as closed. Thanks for the update!" : "Thanks. Spot freshness updated.");
    pageMapRerender(gid);
  }

  return el;
}
function pageMapRerender(gid) { location.hash = ""; requestAnimationFrame(() => (location.hash = gid ? `/map/${gid}` : "/map")); }

/* ════════════════════════════════════
   NOTIFICATIONS
   ════════════════════════════════════ */
export async function bellDrawer() {
  const notifs = await api("/api/me/notifications");
  openSheet("Notifications", h("div", {},
    notifs.length === 0 ? h("div", { style: "text-align:center;padding:28px 0;color:var(--text-2)" },
      h("div", { style: "width:44px;height:44px;border-radius:12px;background:var(--green-dim);display:grid;place-items:center;margin:0 auto 10px" },
        icon("check", { size: 22, strokeColor: "var(--green)" })),
      h("p", { style: "font:600 14px var(--font);color:var(--text)" }, "All clear. Nothing to see here.")) : null,
    ...notifs.map((n) => {
      const p = JSON.parse(n.payload);
      return h("div", { class: "list-row" },
        h("span", { class: `lamp ${n.kind === "escalation" || n.kind === "buddy_alert" ? "flag3" : n.kind === "nudge" ? "flag1" : "home"}` }),
        h("div", { class: "grow" },
          h("b", {}, {
            uwian_reminder: "Uwian reminder",
            buddy_alert:    "Buddy alert",
            escalation:     "Escalation",
            nudge:          "Limit nudge",
            vouch:          "Vouch",
            dispute:        "Dispute",
            payment_claim:  "Payment",
            ride_request:   "Ride request",
            ride_offer:     "Ride offer",
          }[n.kind] ?? n.kind),
          h("div", { class: "dim", style: "margin-top:2px" }, p.message ?? "")),
        h("button", { class: "btn sm", onclick: async () => { await api(`/api/notifications/${n.id}/read`, {}); bellRefresh(); } }, "Dismiss"));
    })));
}
function bellRefresh() { location.hash = ""; requestAnimationFrame(() => (location.hash = location.hash || "/groups")); }
