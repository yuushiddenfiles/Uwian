import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth";
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
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already a member? <Link to="/login" className="font-bold underline underline-offset-2">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
