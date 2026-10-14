/* The Terms of Service a member has to agree to before we will accept their ID.
   Real copy, in the app's own voice: plain sentences, and every claim here is
   one the product can actually keep. If a feature is not built, it is not
   promised. */

export const TOS_VERSION = "2026-10-13";

export const TOS_SECTIONS = [
  {
    heading: "1. What Uwian is",
    body: "Uwian helps you find hangout sessions and get home safely afterward. It is not a dating app, an event promoter, or a bar. Sessions are organised by members, for members.",
  },
  {
    heading: "2. Who can join",
    body: "You must be at least 18 and use your real first name and photo. One account per person. Impersonating someone, or running an account on behalf of a person who is not you, gets you removed.",
  },
  {
    heading: "3. Your ID",
    body: "To be verified you submit a government or school ID. Uwian uses it to check your name and age, stores the details you typed in, and does not sell, publish, or share them outside Uwian. A live crew admin — not an automated system and not other members — looks at your submission. Verification is refused if the name on the ID does not match your account.",
  },
  {
    heading: "4. Location",
    body: "The map shows places you and other crews visit. A spot appears on the public map only after a crew member pins it and an operator approves it. Your live location is never broadcast. When you check in, the crew member running that session sees it so they know you got home.",
  },
  {
    heading: "5. How you behave",
    body: "Two strikes and your account is suspended. A strike is earned by harassing someone, turning up to a session you were not invited to, faking a check-in, or vouching for a person you cannot actually stand behind. Reports go to a crew admin, who reviews them within 24 hours.",
  },
  {
    heading: "6. Money",
    body: "Tab splits inside a session are a shared record between the people on that tab. Uwian does not hold, transfer, or escrow money. Settlements are between you.",
  },
  {
    heading: "7. Leaving",
    body: "Tell a crew admin you want out and they close your account. Ask them to remove your submission as well, and they will.",
  },
  {
    heading: "8. We can end this",
    body: "We can suspend or close an account that breaks these terms, including for the two-strike behaviour above. If we do, we tell you which rule and why.",
  },
];

/* Fixed-height, own scroll container, data-lenis-prevent so the page behind
   does not move while someone reads. */
export function TosDocument({ version = TOS_VERSION }) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-base border-2 border-border bg-secondary-background p-3" data-lenis-prevent>
      <p className="text-[13px] text-muted-foreground">
        Uwian Terms of Service · last updated {version}
      </p>
      {TOS_SECTIONS.map((s) => (
        <div key={s.heading} className="mt-3">
          <h4 className="text-[13px] font-bold">{s.heading}</h4>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
        </div>
      ))}
      <p className="mt-3 text-[13px] text-muted-foreground">
        That is the whole agreement. If a sentence here stops being true, the terms change before
        the app does.
      </p>
    </div>
  );
}
