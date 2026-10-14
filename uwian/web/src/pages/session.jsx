import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ImagePlus, MapPin, MessageSquare, Radio } from "lucide-react";
import { api, fmtPeso, fmtSessionTime, pesoToCents, MODES } from "@/lib/api";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, Lamp, StatusBadge } from "@/components/chrome";
import { DisputeDialog, VerificationDialog } from "@/components/sheets";
import { SessionLiveMap } from "@/components/session-live-map";

export function Session() {
  const { sid } = useParams();
  const id = Number(sid);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [gd, setGd] = useState(null);
  const [tab, setTab] = useState(() => searchParams.get("tab") || "tab");
  const [disputeId, setDisputeId] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const coverRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/sessions/${id}`);
      setD(data);
      const g = await api(`/api/groups/${data.session.group_id}`);
      setGd(g);
    } catch (e) {
      toast.error(e.message);
    }
  }, [id ]);

  useEffect(() => {
    load();
  }, [load ]);

  if (!d || !gd) return <p className="py-10 text-center text-background">Loading.</p>;

  const isAdmin = gd.members.find((m) => m.user_id === user?.id)?.role === "admin";
  const nameOfU = (uid) =>
    gd.members.find((m) => m.user_id === Number(uid))?.name ??
    d.session.designated_driver_name ??
    `#${uid}`;
  const my = d.rsvps.find((r) => r.user_id === user?.id);

  const rsvp = async (status) => {
    try {
      await api(`/api/sessions/${id}/rsvp`, { status });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const navigateToChat = async () => {
    try {
      const r = await api(`/api/sessions/${id}/chat`);
      navigate(`/messages/${r.id}`);
    } catch (e) {
      toast.error(e?.message ?? "Couldn't open session chat.");
    }
  };

  // Session cover: 2:1 banner, downscaled in-browser like profile uploads.
  // Crew admins only (enforced server-side too).
  const coverDownscale = (file) =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) return reject(new Error("That is not an image."));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const W = 960, H = 480;
        const target = W / H, src = img.width / img.height;
        let sw, sh, sx, sy;
        if (src > target) { sh = img.height; sw = sh * target; sx = (img.width - sw) / 2; sy = 0; }
        else { sw = img.width; sh = sw / target; sx = 0; sy = (img.height - sh) / 2; }
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image."));
      };
      img.src = url;
    });

  const uploadCover = async (file) => {
    try {
      const cover_url = await coverDownscale(file);
      await api(`/api/sessions/${id}`, { cover_url }, "PATCH");
      load();
      toast.success("Session picture updated.");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removeCover = async () => {
    try {
      await api(`/api/sessions/${id}`, { cover_url: null }, "PATCH");
      load();
      toast.success("Session picture removed.");
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="glass-70 rounded-base border-2 border-border p-5 shadow-shadow">
        {d.session.cover_url ? (
          <img
            src={d.session.cover_url}
            alt="Session cover"
            className="mb-4 h-40 w-full rounded-base border-2 border-border object-cover"
            draggable={false}
          />
        ) : null}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[13px] text-muted-foreground">
              <Link to={`/groups/${d.session.group_id}`} className="font-medium underline underline-offset-2">
                {gd.group?.name ?? "Crew"}
              </Link>{" "}
              · session
            </p>
            <h1 className="text-xl font-bold tracking-tight">
              {new Date(`${d.session.starts_at}Z`).toLocaleString([], {
                weekday: "long",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={tab === "map" ? "default" : "neutral"}
              onClick={() => setTab("map")}
              id="session-open-map"
              className={tab === "map" ? "" : "hover:border-emerald-500"}
            >
              <Radio className="size-4 text-emerald-500" aria-hidden="true" /> Live Map
            </Button>
            <Button size="sm" variant="neutral" onClick={navigateToChat} id="session-open-chat">
              <MessageSquare className="size-4" aria-hidden="true" /> Session chat
            </Button>
            {isAdmin ? (
              <>
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadCover(f);
                  }}
                />
                <Button size="sm" variant="neutral" onClick={() => coverRef.current?.click()}>
                  <ImagePlus className="size-4" aria-hidden="true" />{" "}
                  {d.session.cover_url ? "Change cover" : "Add cover"}
                </Button>
                {d.session.cover_url ? (
                  <Button size="sm" variant="neutral" onClick={removeCover}>
                    Remove
                  </Button>
                ) : null}
              </>
            ) : null}
            <StatusBadge
              status={d.session.status}
              label={d.session.status === "open" ? "Tab open" : d.session.status === "wrapped" ? "Uwian time" : d.session.status === "planning" ? "Planning" : "Closed"}
            />
          </div>
        </div>
        {d.spot ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" /> {d.spot.name}
          </p>
        ) : null}
        {d.session.designated_driver_id ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-base border-2 border-border bg-secondary-background p-3 text-sm">
            <strong>DD:</strong> {nameOfU(d.session.designated_driver_id)}
            <span className="text-muted-foreground">is skipped on alcohol items</span>
          </div>
        ) : null}
      </div>

      <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <h2 className="mb-3 font-bold">Who is coming</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {[["going", "Going"], ["maybe", "Maybe"], ["cant", "Can't"]].map(([st, label]) => (
            <Button
              key={st}
              variant={my?.status === st ? "default" : "neutral"}
              className="flex-1"
              onClick={() => rsvp(st)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-[13px]">
          {gd.members.filter((m) => m.status === "active").map((m) => {
            const r = d.rsvps.find((x) => x.user_id === m.user_id);
            return (
              <div key={m.user_id} className="flex justify-between border-b border-border py-1.5 last:border-0">
                <span className="text-muted-foreground">{m.name}{m.user_id === user?.id ? " (you)" : ""}</span>
                <span>{r ? { going: "Going", maybe: "Maybe", cant: "Can't" }[r.status] : "No reply"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="tab">Tab</TabsTrigger>
          <TabsTrigger value="map">Live Map</TabsTrigger>
          <TabsTrigger value="settle">Settle up</TabsTrigger>
          <TabsTrigger value="uwian">Uwian</TabsTrigger>
          <TabsTrigger value="limit">My limit</TabsTrigger>
        </TabsList>
        <TabsContent value="tab">
          <TabPanel d={d} sid={id} nameOfU={nameOfU} reload={load} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="map">
          <SessionLiveMap
            session={d.session}
            spot={d.spot}
            members={gd.members}
            user={user}
            onVerify={() => setVerifyOpen(true)}
          />
        </TabsContent>
        <TabsContent value="settle">
          <SettlePanel
            d={d}
            sid={id}
            gd={gd}
            user={user}
            nameOfU={nameOfU}
            reload={load}
            isAdmin={isAdmin}
            onDispute={setDisputeId}
          />
        </TabsContent>
        <TabsContent value="uwian">
          <UwianPanel d={d} sid={id} gd={gd} user={user} reload={load} isAdmin={isAdmin} goTab={() => setTab("uwian")} />
        </TabsContent>
        <TabsContent value="limit">
          <LimitPanel sid={id} goUwian={() => setTab("uwian")} />
        </TabsContent>
      </Tabs>

      <DisputeDialog open={disputeId != null} onOpenChange={(v) => !v && setDisputeId(null)} settlementId={disputeId} onDone={load} />
      <VerificationDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
    </div>
  );
}

function TabPanel({ d, sid, nameOfU, reload, isAdmin }) {
  const total = d.expenses.reduce((s, e) => s + e.amount_centavos, 0);
  return (
    <div className="glass-70 rounded-base border-2 border-border p-5 shadow-shadow">
      {d.session.status !== "closed" ? (
        <ExpenseForm d={d} sid={sid} nameOfU={nameOfU} done={reload} />
      ) : (
        <p className="mb-4 rounded-base border-2 border-border bg-secondary-background p-3 text-sm text-muted-foreground">
          Tab is closed. {isAdmin ? "You can reopen it below." : "Contact an admin if something is wrong."}
        </p>
      )}
      <h2 className="mb-2 font-bold">Tonight's tab</h2>
      {d.expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
      ) : (
        <div className="rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-[13px]">
          {d.expenses.map((e) => {
            const parts = Object.keys(d.shares[e.id] ?? {});
            return (
              <div key={e.id} className="border-b border-border py-1.5 last:border-0">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{e.description}</span>
                  <span>{fmtPeso(e.amount_centavos)}, paid by {e.payer_name ?? nameOfU(e.paid_by)}</span>
                </div>
                <div className="pt-0.5 text-xs text-muted-foreground">
                  Split with: {parts.map(nameOfU).join(", ") || "nobody yet"}
                  {e.edited_after_close ? " · (edited after close)" : ""}
                </div>
              </div>
            );
          })}
          <div className="mt-1.5 flex justify-between border-t-2 border-border pt-2 font-bold">
            <span>TOTAL</span>
            <span>{fmtPeso(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseForm({ d, sid, nameOfU, done }) {
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");
  const [payer, setPayer] = useState("");
  const [isAlcohol, setIsAlcohol] = useState(true);
  const [checked, setChecked] = useState(() => Object.fromEntries(d.members.map((m) => [m.user_id, true])));
  const ddName = d.session.designated_driver_name;

  return (
    <div className="mb-4 rounded-base border-2 border-border bg-secondary-background p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          className="min-w-40 flex-1 bg-background"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What was it? (e.g. beer bucket, sisig…)"
          aria-label="Expense description"
        />
        <Input
          className="w-32 bg-background"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          placeholder="Amount ₱"
          inputMode="decimal"
          aria-label="Amount in pesos"
        />
        <select
          className="h-10 rounded-base border-2 border-border bg-background px-2 text-sm"
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
          aria-label="Paid by"
        >
          <option value="">Paid by…</option>
          {d.members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.name}</option>
          ))}
        </select>
        <button
          type="button"
          role="switch"
          aria-checked={isAlcohol}
          aria-label="Alcohol expense"
          onClick={() => setIsAlcohol((v) => !v)}
          className="flex min-h-11 items-center gap-2"
        >
          <span className={`relative h-6 w-11 rounded-full border-2 border-border transition-colors ${isAlcohol ? "bg-main" : "bg-secondary-background"}`}>
            <span
              className="absolute top-0.5 left-0.5 size-4 rounded-full border-2 border-border bg-background transition-all"
              style={{ left: isAlcohol ? 22 : 2 }}
            />
          </span>
          <span className="text-sm text-muted-foreground">Alcohol</span>
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {isAlcohol
          ? ddName
            ? `Auto-split: ${ddName} is skipped on alcohol, as are non-drinkers.`
            : "Marked as alcohol: the DD will be skipped automatically."
          : "Food/non-alcohol: everyone attending splits it."}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="self-center text-sm text-muted-foreground">Split with:</span>
        {d.members.map((m) => (
          <label
            key={m.user_id}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-base border-2 px-2.5 py-1 text-[13px] font-medium ${
              checked[m.user_id] ? "border-border bg-background shadow-shadow" : "border-border bg-secondary-background text-muted-foreground"
            }`}
          >
            <input
              type="checkbox"
              className="size-4 accent-black"
              checked={!!checked[m.user_id]}
              onChange={(e) => setChecked((c) => ({ ...c, [m.user_id]: e.target.checked }))}
            />
            {m.name}
          </label>
        ))}
      </div>
      <Button
        className="mt-3 w-full"
        onClick={async () => {
          const cents = pesoToCents(amt);
          if (!cents) return toast.error("Enter a valid amount, e.g. 450 or 450.50");
          const chosen = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
          try {
            await api(`/api/sessions/${sid}/expenses`, {
              amount_centavos: cents,
              description: desc || "item",
              is_alcohol: isAlcohol ? 1 : 0,
              paid_by: payer ? Number(payer) : undefined,
              participants: chosen,
            });
            toast.success("Expense added to tab.");
            setDesc("");
            setAmt("");
            done();
          } catch (e) {
            toast.error(e.message);
          }
        }}
      >
        Add to tab
      </Button>
    </div>
  );
}

const SETTLE_LABEL = { open: "Open", paid_claimed: "Claimed paid", confirmed: "Confirmed", disputed: "Disputed" };

function SettlePanel({ d, sid, user, nameOfU, reload, isAdmin, onDispute }) {
  return (
    <div className="glass-70 rounded-base border-2 border-border p-5 shadow-shadow">
      <h2 className="mb-3 font-bold">Settle up</h2>
      {isAdmin && d.session.status !== "closed" ? (
        <Button
          className="mb-4"
          onClick={async () => {
            try {
              await api(`/api/sessions/${sid}/close-tab`, {});
              toast.success("Tab closed. No more edits without reopening.");
              reload();
            } catch (e) {
              toast.error(e.message);
            }
          }}
        >
          Close tab
        </Button>
      ) : null}
      {d.settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settlements yet. Close the tab when the night is done.</p>
      ) : (
        <ul className="divide-y divide-border">
          {d.settlements.map((t) => {
            const minePayer = t.from_user === user?.id;
            const mineRecv = t.to_user === user?.id;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={t.from_name ?? nameOfU(t.from_user)} />
                <div className="min-w-0 flex-1">
                  <strong>{t.from_name ?? nameOfU(t.from_user)} → {t.to_name ?? nameOfU(t.to_user)}</strong>{" "}
                  <Badge variant={t.status === "confirmed" ? "default" : t.status === "disputed" ? "destructive" : "secondary"}>
                    {SETTLE_LABEL[t.status]}
                  </Badge>
                  {t.note ? <div className="mt-1 text-sm text-muted-foreground">“{t.note}”</div> : null}
                </div>
                <span className="font-mono font-bold">{fmtPeso(t.amount_centavos)}</span>
                {minePayer && t.status === "open" ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await api(`/api/settlements/${t.id}/claim-paid`, {});
                      reload();
                    }}
                  >
                    I've paid
                  </Button>
                ) : null}
                {mineRecv && t.status === "paid_claimed" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api(`/api/settlements/${t.id}/confirm`, {});
                        toast.success("Confirmed. All good.");
                        reload();
                      }}
                    >
                      Confirm received
                    </Button>
                    <Button size="sm" variant="neutral" className="border-destructive text-destructive" onClick={() => onDispute(t.id)}>
                      Dispute
                    </Button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {isAdmin && d.session.status === "closed" ? (
        <Button
          variant="neutral"
          className="mt-3 w-full"
          onClick={async () => {
            const r = await api(`/api/sessions/${sid}/reopen`, {});
            toast.success(r.note);
            reload();
          }}
        >
          Reopen tab (voids unpaid, keeps confirmed)
        </Button>
      ) : null}
    </div>
  );
}

function UwianPanel({ d, sid, gd, user, reload, isAdmin }) {
  const [mode, setMode] = useState("other");
  const myCi = d.checkins.find((c) => c.user_id === user?.id);
  return (
    <div className="glass-70 rounded-base border-2 border-border p-5 shadow-shadow">
      <h2 className="mb-3 font-bold">Uwian: get everyone home safe</h2>
      {isAdmin && d.session.status === "open" ? (
        <Button
          className="mb-4 w-full"
          onClick={async () => {
            const deadline = new Date(Date.now() + 45 * 60000).toISOString().slice(0, 19).replace("T", " ");
            await api(`/api/sessions/${sid}`, { status: "wrapped", uwian_deadline: deadline }, "PATCH");
            toast.success("Session wrapped. Buddies paired by direction.");
            reload();
          }}
        >
          Wrap session
        </Button>
      ) : null}
      {!myCi?.home_confirmed_at ? (
        <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-base border-2 border-border bg-secondary-background p-3">
          <strong className="text-sm">How are you getting home?</strong>
          <select
            className="h-10 rounded-base border-2 border-border bg-background px-2 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="How are you getting home"
          >
            {Object.entries(MODES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={async () => {
              await api(`/api/sessions/${sid}/checkin`, { mode });
              toast.success("Checked in. Get home safe.");
              reload();
            }}
          >
            I'm home
          </Button>
        </div>
      ) : null}
      <h3 className="mb-1 font-bold">Who is home</h3>
      <ul className="divide-y divide-border">
        {gd.members.filter((m) => m.status === "active").map((m) => {
          const ci = d.checkins.find((c) => c.user_id === m.user_id);
          const rsvp = d.rsvps.find((r) => r.user_id === m.user_id);
          if (rsvp?.status === "cant") return null;
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-2.5 py-2.5">
              <Avatar name={m.name} size={32} art={m.avatar_id} custom={m.avatar_url} />
              <Lamp checkin={ci} />
              <span className="min-w-0 flex-1 text-sm">
                {m.name}
                {ci?.mode ? <span className="text-muted-foreground"> · {MODES[ci.mode]}</span> : null}
                {ci?.ride_offer_from ? <Badge variant="secondary" className="ml-1.5">Ride offered</Badge> : null}
              </span>
              {ci?.flag_stage >= 2 && !ci?.home_confirmed_at ? (
                <Button
                  size="sm"
                  variant="neutral"
                  onClick={async () => {
                    const pair = d.buddy_pairs.find((p) => [p.user_a, p.user_b, p.user_c].includes(m.user_id));
                    if (!pair) return toast.error("No buddy pair. Contact an admin.");
                    await api(`/api/buddies/${sid}/${pair.user_a}/${pair.user_b}/clear-flag`, {});
                    toast.success("Flag cleared. Thanks for checking in on each other.");
                    reload();
                  }}
                >
                  Spoke to them, all good
                </Button>
              ) : null}
              {ci?.mode === "own_drive" && d.session.designated_driver_id !== m.user_id && !ci.ride_offer_from && m.user_id !== user?.id ? (
                <Button
                  size="sm"
                  variant="neutral"
                  onClick={async () => {
                    await api(`/api/buddies/${sid}/${m.user_id}/0/offer-ride`, {});
                    toast.success("Ride offered.");
                    reload();
                  }}
                >
                  Offer a ride
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {d.buddy_pairs.length > 0 ? (
        <>
          <h3 className="mt-4 mb-1 font-bold">Buddy pairs (by direction)</h3>
          <div className="rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-[13px]">
            {d.buddy_pairs.map((p, i) => (
              <div key={i} className="border-b border-border py-1 last:border-0">{p.names.join(" + ")}</div>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-4 border-t-2 border-border pt-3 text-xs text-muted-foreground">
        This app is not a rescue service. Escalation is just a nudge to check in. In a real emergency, call your local emergency number.
      </p>
    </div>
  );
}

function LimitPanel({ sid, goUwian }) {
  const [count, setCount] = useState(0);
  const [lim, setLim] = useState(null);
  const [limIn, setLimIn] = useState("");
  const refresh = useCallback(async () => {
    const r = await api(`/api/sessions/${sid}/limit`);
    setCount(r.count);
    setLim(r.lim);
  }, [sid ]);
  useEffect(() => {
    refresh();
  }, [refresh ]);
  const pct = lim ? count / lim : 0;
  const show = Math.max(lim ?? 0, count, 8);

  return (
    <div className="glass-70 rounded-base border-2 border-border p-5 shadow-shadow">
      <h2 className="font-bold">My limit</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Private. Only you can see this. A personal reminder, not an alcohol calculator.
      </p>
      <div className="flex flex-wrap items-start gap-5">
        <button
          onClick={async () => {
            const r = await api(`/api/sessions/${sid}/limit/tap`, {});
            if (navigator.vibrate) navigator.vibrate(30);
            if (r.level) {
              toast(r.level === "at_limit" ? "You have hit your limit. Sort your ride home." : "Getting close to your limit.");
            }
            refresh();
          }}
          className="grid size-22 shrink-0 place-items-center rounded-full border-2 border-border bg-main text-sm font-bold text-main-foreground shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          + 1 round
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5 rounded-base border-2 border-border bg-secondary-background p-3">
            {Array.from({ length: Math.min(show, 12) }, (_, i) => i + 1).map((i) => (
              <span
                key={i}
                className={`grid h-11 w-8.5 place-items-center rounded-base border-2 font-mono text-sm font-bold ${
                  i <= count ? "border-border bg-main text-main-foreground" : "border-border bg-background text-muted-foreground"
                }`}
              >
                {i <= count ? "/" : "·"}
              </span>
            ))}
            {pct >= 0.8 ? (
              <Badge variant={pct >= 1 ? "destructive" : "secondary"} className="self-center">
                {pct >= 1 ? "At your limit. Sort your ride?" : "Getting close. Sort your ride?"}
              </Badge>
            ) : null}
            {pct >= 0.8 ? (
              <Button size="sm" className="self-center" onClick={goUwian}>
                Check in now
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Label htmlFor="limit-in">My limit (rounds)</Label>
            <Input id="limit-in" type="number" min={1} className="w-20" value={limIn} onChange={(e) => setLimIn(e.target.value)} />
            <Button
              size="sm"
              variant="neutral"
              onClick={async () => {
                await api(`/api/sessions/${sid}/limit`, { limit: limIn ? Number(limIn) : null }, "PUT");
                refresh();
                toast.success("Limit updated.");
              }}
            >
              Set
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
