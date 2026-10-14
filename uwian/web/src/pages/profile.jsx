import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ShieldCheck, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { Avatar, PageHeader } from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VerificationDialog } from "@/components/sheets";

export function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [sub, setSub] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api("/api/me/verification"),
      api("/api/me/verification-status").catch(() => ({ submission: null })),
    ])
      .then(([v, vs]) => {
        if (!alive) return;
        setData(v);
        setSub(vs.submission);
      })
      .catch((e) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (!user) return <p className="py-10 text-center text-muted-foreground">Loading profile.</p>;

  const statusText =
    sub?.status === "approved"
      ? "ID verified"
      : sub?.status === "rejected"
        ? "Verification needs attention"
        : sub?.status === "pending"
          ? "Verification pending review"
          : "Not verified yet";

  return (
    <div>
      <div className="glass-70 rounded-base border-2 border-border p-5 pb-2 shadow-shadow">
        <PageHeader
          title="Your profile"
          sub="How the crew sees you: your picture, name, and safety record."
          actions={
            <Button variant="neutral" onClick={() => navigate("/settings")}>
              <Pencil aria-hidden="true" /> Edit profile
            </Button>
          }
        />
      </div>

      <div className="glass-70 rounded-base border-2 border-border p-5 shadow-shadow">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size={72} art={user.avatar_id} custom={user.avatar_url} />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{user.name}</h2>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={sub?.status === "approved" ? "default" : "secondary"} className="gap-1">
                <ShieldCheck className="size-3" aria-hidden="true" /> {statusText}
              </Badge>
              {data ? <Badge variant="outline">{data.trust_tier}</Badge> : null}
            </div>
          </div>
        </div>

        {data ? (
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-base border-2 border-border p-3">
              <div className="kicker text-muted-foreground">Vouches</div>
              <div className="mt-1 text-lg font-bold">{data.vouches_received}</div>
            </div>
            <div className="rounded-base border-2 border-border p-3">
              <div className="kicker text-muted-foreground">Strikes</div>
              <div className="mt-1 text-lg font-bold">{data.strikes}</div>
            </div>
            <div className="rounded-base border-2 border-border p-3">
              <div className="kicker text-muted-foreground">Crews</div>
              <div className="mt-1 text-lg font-bold">{data.total_groups}</div>
            </div>
            <div className="rounded-base border-2 border-border p-3">
              <div className="kicker text-muted-foreground">Member since</div>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-bold">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                {data.user?.created_at ? String(data.user.created_at).slice(0, 10) : "—"}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Loading your safety record…</p>
        )}

        <div className="mt-5 border-t-2 border-border pt-4">
          <Button variant="neutral" onClick={() => setVerifyOpen(true)}>
            <ShieldCheck aria-hidden="true" /> Identity and safety
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">
            Verify your ID and manage how your safety record is shown to crews.
          </p>
        </div>
      </div>

      <VerificationDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
    </div>
  );
}
