import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ClickSpark from "@/components/reactbits/ClickSpark/ClickSpark";
import { Field } from "@/components/chrome";
import { OfficialLogo } from "@/components/OfficialLogo";

const DEMOS = [
  { name: "Uwian Dev", role: "Operator", email: "uwiandev@uwian.dev", init: "UD" },
  { name: "Mika Torres", role: "Verified · Host", email: "mika@barkada.demo", init: "MT" },
  { name: "Jolo Ramos", role: "Verified", email: "jolo@barkada.demo", init: "JR" },
  { name: "Tara Lim", role: "Crew member", email: "tara@barkada.demo", init: "TL" },
  { name: "Rafi Cruz", role: "Crew member", email: "rafi@barkada.demo", init: "RC" },
  { name: "Ivy Chen", role: "New face", email: "ivy@barkada.demo", init: "IC" },
  { name: "Noah Garcia", role: "New face", email: "noah@barkada.demo", init: "NG" },
  { name: "Lena Park", role: "New face", email: "lena@barkada.demo", init: "LP" },
  { name: "Kai Aquino", role: "New face", email: "kai@barkada.demo", init: "KA" },
  { name: "Sari Mendoza", role: "New face", email: "sari@barkada.demo", init: "SM" },
];
const DEMO_PW = "BarkadaDemo!2026";

/* Official multicolor "G". White button + this mark is Google's required look. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GoogleButton({ label }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "/api/auth/google";
      }}
      className="flex w-full items-center justify-center gap-2.5 rounded-base border-2 border-border bg-white px-4 py-2.5 text-sm font-bold text-[#1f1f1f] shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
    >
      <GoogleMark /> {label}
    </button>
  );
}

function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] font-bold text-muted-foreground" aria-hidden="true">
      <span className="h-0.5 flex-1 bg-border" /> OR <span className="h-0.5 flex-1 bg-border" />
    </div>
  );
}

function DemoButtons({ onFill }) {
  return (
    <div className="mt-5 border-t-2 border-dashed border-border pt-4">
      <p className="mb-2 text-center text-[11px] font-bold tracking-wider text-muted-foreground">
        QUICK DEMO SIGN-IN
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DEMOS.map((d) => (
          <button
            key={d.email}
            type="button"
            onClick={() => {
              onFill(d.email, DEMO_PW);
              toast.success(`Filled in ${d.name} (demo account).`);
            }}
            className="flex items-center gap-2 rounded-base border-2 border-border bg-secondary-background p-2 text-left shadow-shadow transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-base bg-main text-xs font-bold text-main-foreground">
              {d.init}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-xs">{d.name}</b>
              <span className="block truncate text-[11px] text-muted-foreground">{d.role}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [needBday, setNeedBday] = useState(false);
  const [bday, setBday] = useState("");

  // Google round-trip lands back here: surface failures, and show the
  // one-time 18+ step for brand-new Google accounts (Google shares no age).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("need_birthdate") === "1") setNeedBday(true);
    const msgs = {
      cancelled: "Google sign-in was cancelled.",
      invalid: "That Google sign-in didn't check out. Try again.",
      unconfigured: "Google sign-in isn't set up yet.",
      token: "Google didn't approve that sign-in. Try again.",
      profile: "Couldn't read your Google profile. Try again.",
      unverified: "That Google account has no verified email.",
      error: "Google sign-in hit a snag. Try again.",
    };
    if (q.get("google") && msgs[q.get("google")]) toast.error(msgs[q.get("google")]);
    if (q.get("google") || q.get("need_birthdate")) window.history.replaceState(null, "", "/login");
  }, []);

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <div className="glass-70 rounded-base border-2 border-border p-7 shadow-shadow sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-base border-2 border-border bg-main text-main-foreground">
            <OfficialLogo size={34} />
          </span>
          <div>
            <h1 className="script-accent text-[30px] font-semibold">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to find your crew and get home safe.</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email.trim() || !pw.trim()) return toast.error("Enter both email and password.");
            try {
              await login(email.trim(), pw);
              navigate("/groups");
            } catch (err) {
              toast.error(err.message);
            }
          }}
        >
          <Field label="Email address">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter password" />
          </Field>
          <ClickSpark sparkColor="#000000" sparkCount={10} sparkSize={10} sparkRadius={24} className="mt-4 block" style={{ width: "100%" }}>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </ClickSpark>
        </form>
        <OrDivider />
        <GoogleButton label="Continue with Google" />
        {needBday ? (
          <div className="mt-4 rounded-base border-2 border-border bg-secondary-background p-4">
            <p className="text-sm font-bold">Almost done — are you 18 or older?</p>
            <p className="mt-1 text-xs text-muted-foreground">Google doesn't share birthdays, so confirm once.</p>
            <div className="mt-2 flex gap-2">
              <Input type="date" value={bday} onChange={(e) => setBday(e.target.value)} aria-label="Birthdate" />
              <Button
                onClick={async () => {
                  try {
                    await api("/api/me/birthdate", { birthdate: bday });
                    navigate("/groups");
                  } catch (e) {
                    toast.error(e.message);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
        <DemoButtons onFill={(e, p) => { setEmail(e); setPw(p); }} />
        <p className="mt-5 text-center text-sm text-muted-foreground">
          New here? <Link to="/signup" className="font-bold underline underline-offset-2">Create an account</Link>
        </p>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" /> ID checked on every session. Vouched members only.
        </p>
      </div>
    </div>
  );
}

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [bday, setBday] = useState("");

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <div className="glass-70 rounded-base border-2 border-border p-7 shadow-shadow sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-base border-2 border-border bg-main text-main-foreground">
            <OfficialLogo size={34} />
          </span>
          <div>
            <h1 className="script-accent text-[30px] font-semibold">Create your account</h1>
            <p className="text-sm text-muted-foreground">Vouched members, fair tabs, safe trips home.</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || !email.trim() || !pw.trim() || !bday) {
              return toast.error("Please fill in all fields.");
            }
            try {
              await signup({ name: name.trim(), email: email.trim(), password: pw, birthdate: bday });
              navigate("/groups");
            } catch (err) {
              toast.error(err.message);
            }
          }}
        >
          <Field label="Full name">
            <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          </Field>
          <Field label="Email address">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Password (8+ characters)">
            <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (8+ characters)" />
          </Field>
          <Field label="Birthdate (18+)">
            <Input type="date" value={bday} onChange={(e) => setBday(e.target.value)} />
          </Field>
          <ClickSpark sparkColor="#000000" sparkCount={10} sparkSize={10} sparkRadius={24} className="mt-4 block" style={{ width: "100%" }}>
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </ClickSpark>
        </form>
        <OrDivider />
        <GoogleButton label="Sign up with Google" />
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already a member? <Link to="/login" className="font-bold underline underline-offset-2">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
