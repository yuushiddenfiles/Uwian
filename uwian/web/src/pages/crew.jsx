import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Flag, Mail, Map as MapIcon, Plus } from "lucide-react";
import { api, fmtPeso, fmtSessionTime, initials } from "@/lib/api";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, PageHeader, StatusBadge } from "@/components/chrome";
import { InviteDialog, ReportDialog, SessionFormDialog } from "@/components/sheets";

export function Crew() {
  const { gid } = useParams();
  const id = Number(gid);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [spots, setSpots] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [tagInput, setTagInput] = useState("");

  const load = useCallback(async () => {
    try {
      const [gd, lg, sp] = await Promise.all([
        api(`/api/groups/${id}`),
        api(`/api/groups/${id}/ledger`),
        api(`/api/groups/${id}/spots`),
      ]);
      setD(gd);
      setLedger(lg);
      setSpots(sp);
    } catch (e) {
      toast.error(e.message);
    }
  }, [id ]);

  useEffect(() => {
    load();
  }, [load ]);

  if (!d) return <p className="py-10 text-center text-background">Loading.</p>;

  const isAdmin = d.members.find((m) => m.user_id === user?.id)?.role === "admin";
  const upcoming = d.sessions.filter((s) => s.status !== "closed").slice(0, 4);
  const past = d.sessions.filter((s) => s.status === "closed").slice(0, 3);
  const nameOf = (uid) => d.members.find((m) => m.user_id === Number(uid))?.name ?? `User ${uid}`;

  return (
    <div>
      <div className="glass-70 flex flex-wrap items-start gap-4 rounded-base border-2 border-border p-5 shadow-shadow sm:p-6">
        <span className="grid size-13 shrink-0 place-items-center rounded-base border-2 border-border bg-main text-lg font-bold text-main-foreground">
          {initials(d.group.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{d.group.name}</h1>
          <p className="text-[13px] text-muted-foreground">
            {d.members.length} member{d.members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="neutral" onClick={() => setInviteOpen(true)}>
            <Mail aria-hidden="true" /> Invite
          </Button>
          {isAdmin ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus aria-hidden="true" /> Session
            </Button>
          ) : null}
        </div>
      </div>

      {d.pending.length > 0 ? (
        <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Vouch queue</h2>
            <Badge variant="secondary">{d.pending.length} pending</Badge>
          </div>
          <ul className="space-y-2.5">
            {d.pending.map((p) => (
              <li key={p.user_id} className="flex items-center gap-3 rounded-base border-2 border-border bg-secondary-background p-3">
                <Avatar name={p.name} art={p.avatar_id} custom={p.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{p.name}</div>
                  <div className="text-[13px] text-muted-foreground">
                    {p.vouches}/{d.group.vouches_required} vouches so far
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const r = await api(`/api/groups/${id}/vouch/${p.user_id}`, {});
                      toast.success(r.accepted ? "They are in. Welcome to the crew." : `Vouched (${r.have} of ${r.need}).`);
                      load();
                    } catch (e) {
                      toast.error(e.message);
                    }
                  }}
                >
                  Vouch in
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Sessions</h2>
          {isAdmin ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus aria-hidden="true" /> Session
            </Button>
          ) : null}
        </div>
        {upcoming.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {isAdmin ? "No sessions yet. Tap + Session to plan one." : "No upcoming sessions."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  className="tb-cursor flex w-full items-center gap-3 rounded-base border-2 border-border bg-background p-3.5 text-left shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{fmtSessionTime(s.starts_at)}</span>
                  </span>
                  <StatusBadge
                    status={s.status}
                    label={s.status === "open" ? "Tab open" : s.status === "wrapped" ? "Uwian time" : s.status === "planning" ? "Planning" : "Closed"}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 ? (
          <div className="mt-3 border-t-2 border-border pt-3">
            <p className="mb-1.5 text-[13px] text-muted-foreground">Past sessions</p>
            {past.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/sessions/${s.id}`)}
                className="flex w-full items-center justify-between rounded-base py-2 text-left text-sm hover:bg-secondary-background"
              >
                <span>
                  {new Date(`${s.starts_at}Z`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  <span className="ml-2 text-muted-foreground">Closed</span>
                </span>
                <span className="font-bold">Open</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <h2 className="mb-3 font-bold">Outstanding balances</h2>
        {ledger.length === 0 ? (
          <p className="font-semibold text-green-700">All settled up.</p>
        ) : (
          <div className="rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-[13px]">
            {ledger.map((t, i) => (
              <div key={i} className="flex justify-between gap-3 border-b border-border py-1.5 last:border-0">
                <span className="text-muted-foreground">{nameOf(t.from)} → {nameOf(t.to)}</span>
                <span className="font-bold">{fmtPeso(t.amount_centavos)}</span>
              </div>
            ))}
            <div className="mt-1.5 flex justify-between border-t-2 border-border pt-2 font-bold">
              <span>{ledger.length} transfer{ledger.length !== 1 ? "s" : ""} (min)</span>
              <span />
            </div>
          </div>
        )}
      </div>

      <div className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <h2 className="mb-2 font-bold">Members and directions</h2>
        <ul className="divide-y divide-border">
          {d.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-3">
              <Avatar name={m.name} art={m.avatar_id} custom={m.avatar_url} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{m.name}</span>
                {m.user_id === user?.id ? <Badge variant="outline" className="ml-2">you</Badge> : null}
                {!m.can_drink ? <Badge variant="outline" className="ml-1.5">Non-drinker</Badge> : null}
                {m.strikes > 0 && isAdmin ? (
                  <Badge variant="destructive" className="ml-1.5">{m.strikes} strike{m.strikes !== 1 ? "s" : ""}</Badge>
                ) : null}
              </div>
              {m.user_id !== user?.id ? (
                <button
                  onClick={() => setReport({ uid: m.user_id, name: m.name })}
                  className="grid min-h-9 min-w-9 place-items-center rounded-base border-2 border-border text-muted-foreground hover:text-destructive"
                  title={`Report ${m.name}`}
                  aria-label={`Report ${m.name}`}
                >
                  <Flag className="size-4" aria-hidden="true" />
                </button>
              ) : null}
              <select
                className="h-10 w-auto max-w-40 rounded-base border-2 border-border bg-background px-2 text-sm"
                value={m.direction_tag_id ?? ""}
                aria-label={`Commute direction for ${m.name}`}
                onChange={async (e) => {
                  if (m.user_id !== user?.id) {
                    toast.error("You can only set your own direction tag.");
                    return;
                  }
                  try {
                    await api("/api/me/direction", { group_id: id, direction_tag_id: e.target.value ? Number(e.target.value) : null }, "PUT");
                    toast.success("Direction updated.");
                  } catch (err) {
                    toast.error(err.message);
                  }
                }}
              >
                <option value="">No direction</option>
                {d.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <div className="mt-3 flex gap-2 border-t-2 border-border pt-3.5">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add direction tag (e.g. North, QC)…"
            />
            <Button
              variant="neutral"
              onClick={async () => {
                if (!tagInput.trim()) return;
                try {
                  await api(`/api/groups/${id}/tags`, { label: tagInput.trim() });
                  setTagInput("");
                  load();
                } catch (e) {
                  toast.error(e.message);
                }
              }}
            >
              + Tag
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-base border-2 border-border bg-background p-5 shadow-shadow">
          <h2 className="font-bold">Hangout map</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {spots.length} spot{spots.length !== 1 ? "s" : ""}{spots.some((s) => s.stale) ? " · some need re-confirming" : ""}
          </p>
          <Button variant="neutral" size="sm" className="mt-3" onClick={() => navigate(`/map/${id}`)}>
            <MapIcon aria-hidden="true" /> Open map
          </Button>
        </div>
        {isAdmin ? (
          <div className="rounded-base border-2 border-border bg-background p-5 shadow-shadow">
            <h2 className="mb-2 font-bold">Group settings</h2>
            <SettingsForm key={d.group.vouches_required} d={d} id={id} />
          </div>
        ) : null}
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} gid={id} />
      <SessionFormDialog open={formOpen} onOpenChange={setFormOpen} gid={id} onCreated={(sid) => navigate(`/sessions/${sid}`)} />
      <ReportDialog
        open={report != null}
        onOpenChange={(v) => !v && setReport(null)}
        targetUid={report?.uid}
        targetName={report?.name}
        groupId={id}
      />
    </div>
  );
}

function SettingsForm({ d, id }) {
  const [vq, setVq] = useState(String(d.group.vouches_required));
  const [buddy, setBuddy] = useState(String(d.group.buddy_notify_min));
  const [admin, setAdmin] = useState(String(d.group.admin_notify_min));
  return (
    <div>
      <Label htmlFor="set-vq">Vouches required to join</Label>
      <select id="set-vq" className="mt-1 h-10 w-auto rounded-base border-2 border-border bg-background px-2 text-sm" value={vq} onChange={(e) => setVq(e.target.value)}>
        <option value="1">1 vouch to join</option>
        <option value="2">2 vouches to join</option>
      </select>
      <div className="mt-2.5">
        <Label htmlFor="set-buddy">Buddy alert delay (minutes after deadline)</Label>
        <Input id="set-buddy" type="number" className="mt-1 w-24" value={buddy} onChange={(e) => setBuddy(e.target.value)} />
      </div>
      <div className="mt-2.5">
        <Label htmlFor="set-admin">Admin escalation delay (minutes)</Label>
        <Input id="set-admin" type="number" className="mt-1 w-24" value={admin} onChange={(e) => setAdmin(e.target.value)} />
      </div>
      <PageHeaderlessSave
        onSave={async () => {
          await api(`/api/groups/${id}/settings`, {
            vouches_required: Number(vq),
            buddy_notify_min: Number(buddy),
            admin_notify_min: Number(admin),
          }, "PATCH");
          toast.success("Settings saved.");
        }}
      />
    </div>
  );
}

function PageHeaderlessSave({ onSave }) {
  return (
    <Button
      className="mt-4 w-full"
      onClick={async () => {
        try {
          await onSave();
        } catch (e) {
          toast.error(e.message);
        }
      }}
    >
      Save settings
    </Button>
  );
}
