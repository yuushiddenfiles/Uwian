import { useEffect, useRef, useState } from "react";
import { Check, Clock, Mail, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { PageHeader, Field } from "@/components/chrome";
import { CHIBI_IDS, CHIBI_LABELS, AvatarArt } from "@/components/avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REQ_TONE = { pending: "secondary", approved: "default", rejected: "destructive" };

/* Downscale to a 256px square so a phone photo becomes a small data URL the
   server will accept and the DB will not choke on. Cover-crop, no stretching. */
function downscale(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("That is not an image."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 256;
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const ctx = c.getContext("2d");
      const side = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        S,
        S
      );
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

export function Settings() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.name, user?.email]);

  const loadRequests = () =>
    api("/api/me/profile-requests").then(setRequests).catch(() => setRequests([]));

  useEffect(() => {
    if (user) loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const pickAvatar = async (id) => {
    try {
      await api("/api/me", { avatar_id: id }, "PATCH");
      await refresh();
      toast.success("Profile picture updated.");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const uploadPicture = async (file) => {
    try {
      const dataUrl = await downscale(file);
      await api("/api/me", { avatar_url: dataUrl }, "PATCH");
      await refresh();
      toast.success("Picture uploaded.");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const submitRequest = async (field, value) => {
    setBusy(true);
    try {
      await api("/api/me/profile-request", { field, value });
      toast.success(`Request sent. An admin will review your ${field} change.`);
      loadRequests();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <p className="py-10 text-center text-muted-foreground">Loading settings.</p>;

  return (
    <div>
      <div className="glass-70 rounded-base border-2 border-border p-5 pb-2 shadow-shadow">
        <PageHeader
          title="Settings"
          sub="Your picture changes instantly. Your name and email go through an admin first, so the crew always knows who is who."
        />
      </div>

      {/* Profile picture */}
      <section className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <p className="kicker mb-3 text-muted-foreground">Profile picture</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) uploadPicture(f);
          }}
        />
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            className={`tb-cursor grid size-14 shrink-0 place-items-center rounded-base border-2 border-border transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 ${
              user.avatar_url ? "bg-secondary-background text-muted-foreground" : "bg-main text-main-foreground shadow-shadow"
            }`}
            title="Upload your own picture"
            aria-label="Upload your own picture"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
          {user.avatar_url ? (
            <span className="relative size-14 shrink-0 overflow-hidden rounded-base border-2 border-border shadow-shadow ring-2 ring-main">
              <img src={user.avatar_url} alt="Your uploaded picture" className="h-full w-full object-cover" draggable={false} />
            </span>
          ) : null}
          <button
            onClick={() => pickAvatar(null)}
            aria-pressed={!user.avatar_id && !user.avatar_url}
            className={`tb-cursor grid size-14 shrink-0 place-items-center overflow-hidden rounded-base border-2 font-bold transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 ${
              !user.avatar_id && !user.avatar_url
                ? "border-border bg-main text-main-foreground shadow-shadow"
                : "border-border bg-secondary-background text-muted-foreground"
            }`}
            title="Use your initials"
          >
            {(user.name ?? "?")
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase()}
          </button>
          {CHIBI_IDS.map((id) => (
            <button
              key={id}
              onClick={() => pickAvatar(id)}
              aria-pressed={user.avatar_id === id}
              aria-label={`Picture: ${CHIBI_LABELS[id] ?? id}`}
              className={`tb-cursor size-14 shrink-0 overflow-hidden rounded-base border-2 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 ${
                user.avatar_id === id ? "border-border shadow-shadow ring-2 ring-main" : "border-border"
              }`}
            >
              <AvatarArt id={id} size={52} />
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Tap + to upload your own photo, or pick a character. It shows everywhere your name does: crews, sessions, check-ins.
        </p>
      </section>

      {/* Name and email */}
      <section className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <p className="kicker mb-3 text-muted-foreground">Name and email</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRequest("name", name.trim());
            }}
          >
            <Field label="Display name" htmlFor="set-name">
              <Input
                id="set-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Button
              size="sm"
              className="mt-2.5"
              disabled={busy || !name.trim() || name.trim() === user.name}
              type="submit"
            >
              <UserRound aria-hidden="true" /> Request name change
            </Button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRequest("email", email.trim());
            }}
          >
            <Field label="Email" htmlFor="set-email">
              <Input
                id="set-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Button
              size="sm"
              className="mt-2.5"
              disabled={busy || !email.trim() || email.trim() === user.email}
              type="submit"
            >
              <Mail aria-hidden="true" /> Request email change
            </Button>
          </form>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing changes until an admin approves it. You will get a notification either way.
        </p>
      </section>

      {/* Request history */}
      <section className="glass-70 mt-4 rounded-base border-2 border-border p-5 shadow-shadow">
        <p className="kicker mb-3 text-muted-foreground">Your requests</p>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No change requests yet. Send one above and it lands in the admin queue.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-base border-2 border-border bg-secondary-background p-3"
              >
                <span className="text-sm font-semibold capitalize">{r.field}</span>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {r.old_value} → {r.new_value}
                </span>
                <Badge variant={REQ_TONE[r.status] ?? "outline"} className="ml-auto gap-1">
                  {r.status === "pending" ? (
                    <Clock className="size-3" aria-hidden="true" />
                  ) : r.status === "approved" ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : null}
                  {r.status}
                </Badge>
                {r.status === "rejected" && r.review_note ? (
                  <p className="w-full text-xs text-muted-foreground">Note: {r.review_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
