# DESIGN.md — Uwian

## Client direction (current)

Since 2026-10-13 the shipping client is `web/` (React + Vite + Tailwind + shadcn,
neobrutalism blue theme, React Bits SplitText hero, GSAP). Owner override: this
retires the warm-paper/amber direction below, which now documents only the
retired vanilla client in `client/` (kept on disk as rollback).

- Palette: neobrutalism blue. Light blue background, bright blue primary, black
  2px borders, hard 4px offset shadows. One accent (blue), semantic states only.
- Typography: Fraunces (display, soft/wonk axes. Reason: the whimsical serif
  voice the owner picked, mapped from Canva-only names to a real text face)
  + Caveat (handwritten accents only: greetings, empty states, auth titles)
  + Archivo Black (marquee strip only: all-caps sticker voice)
  + Space Mono (amounts, receipts, ledger: every font-mono in the system)
  + DM Sans (body, retained for its friendly UI voice).
- Brand wordmark and footer brand speak Fraunces; gallery labels inherit the
  display serif; Leaflet popups speak DM Sans. Showcase-only demo components
  keep their own stacks.
- Motion: one GSAP SplitText hero entrance + 150ms press physics. Curated React Bits
  additions (2026-10-13, owner asked for a livelier app): one-shot TextType subline,
  scroll-driven velocity marquee divider, scrub ScrollReveals on section heads,
  CountUp stats, hover GlareHover sheens, ClickSpark confirmations, magnetic logo.
  Nothing loops unattended; Magnet/ClickSpark honor reduced-motion natively.
- Dials: ENERGY 2 / RHYTHM 1 / MOTION 2.
- Backdrop (2026-10-13, owner request): PixelSnow WebGL snowfall fixed behind the
  app, frozen natively on reduced-motion. Transparent canvas (lightMode off) over
  a near-black page (#0a0a14) so the snow reads. Main containers use `.glass-70`
  (88% surface + blur, above the 70% floor) so text contrast holds. Container
  shadows glow blue (#2b62d9) because black offsets vanish on black; ink borders
  stay since they outline light surfaces. Small controls, bubbles, and the map
  canvas stay solid. R-10 dose cap overridden by owner; contrast rechecked after
  (ink-on-card pairs unchanged).
- Pointer highlight (2026-10-13, owner request): TargetCursor corner brackets on
  `.tb-cursor` containers. Native cursor stays visible, fine-pointer devices
  only, reduced-motion respected natively. Additive only, nothing depends on it.
- Header (owner request): one fixed 68px sticky stage; a clip-path window visibly
  shrinks from the full bar to a centered 340px pill over 500ms on scroll past
  72px (square corners inflate to round), while the bar row scales out and the
  icon-dock row scales in with a 100ms stagger. Clip containment makes spill
  structurally impossible. Hidden rows are `inert` + `aria-hidden`. Scroll back
  up reverses it. Disabled under reduced-motion by the global kill-switch.
- Scrolling (owner request): Lenis buttery wheel scroll, skipped entirely on
  reduced-motion; synced to ScrollTrigger reveals; route changes glide to top.
- View navigator (owner request): AccordionGallery with four ownable SVG tiles in
  theme blues (each glyph is the view it selects: detailed calendar, three-figure
  crew, radar constellation for Find Your Circle, bento grid for Overview).
  Hover, tap, Tab-focus, and arrow keys all select; sections below follow.
  Tile clicks re-sync it via remount key. No stock photos, no hotlinked images.
  Find Your Circle replaced the Safety view (2026-10-15): the friend radar now
  lives in the gallery instead of as a standalone landing section, and Overview
  keeps showing everything including it. Safety content stays reachable via the
  Overview stack, the footer Safety button, and the verification banner.
- Hero revision (owner request, 2026-10-15): two-line headline ("Go out" /
  "Get home" + accent words "together." / "safe."). There is no Elevate Text
  component — the name comes from DepthText's demo placeholder. First attempt
  (DepthText + CSS background-clip:text face) rendered solid black in real
  paint despite correct computed styles, so the words are now inline SVG
  wordmarks (ElevateWord): button-blue gradient + halftone pattern fills, one
  4px navy offset copy, 1px navy stroke, verified by rasterizing the live SVG
  (avg pixel rgb(41,79,174), 68% blue-dominant, 0 console errors). Canvas font
  metrics size and baseline-align each word to the h1, re-measured on resize
  and font load, solid-blue fallback until measured. Headline up to 5xl/7xl;
  hero gaps evened to mt-4 throughout. "Safe" appears only in the
  headline: subtitle is "Vouched members, fair tabs.", right card is "Buddy
  escort", always rendered, self-centered, secondary button disabled with a
  hint unless you're going out tonight.
- Hero right column (owner request): ElasticMesh "uwian." in Archivo Black on
  a white tile, pointer-squishable with a caption teaching it. Aria-hidden
  duplicate of the header brand; pauses offscreen and honors reduced motion
  natively.
- Boot loader (owner request): prismatic-burst backdrop in brand blues behind
  the whole sequence (loader outranks the global edge-blur by z-index, so no
  blur touches the loading screen). Fixed 2026-10-14: the burst was rendering
  but unreadable — rays peaked at ~61/255 brightness and the 1.3s hold cut the
  2.4s intro sweep off halfway, so it read as "not showing". Intensity raised
  0.85 to 1.6, glow 0.3 to 0.8, ray width 1.2 to 1.5, near-black floor lifted
  out of the palette, burst hold 1.3s to 2.2s (total boot ~8.2s, still under
  the 11s backstop). A static radial-gradient sits behind the canvas as a
  fallback so a WebGL failure leaves a glow instead of flat black. CountUp to 100, then the U-house mark in
  MetallicPaint (shimmering on its own time uniform), then a crossfade into
  the elastic "uwian." mesh, then the overlay lifts revealing the site
  instantly. Skip button, 9s backstop, stage-level error boundary that bails
  to the site, reduced-motion skips entirely.
- Polish pass (owner request): brand selection + scrollbar, kicker eyebrows on
  deck sections, route fade transitions (each page fades up on navigation;
  reduced-motion renders static via useReducedMotion).
- Industrial brutalism (2026-10-13, owner request): Tactical Telemetry archetype
  from the industrial-brutalist-ui skill. Applied: mono uppercase kickers for
  metadata, uppercase macro hero, scanline+grain analog overlay, bracketed
  build stamp. Overrides recorded: blue kept as single accent (not hazard
  red), radii kept (neobrutalist theme), sentence case kept for real reading.
- Gradual blur (owner request): bottom-edge preset only, shortened, globally.
  Fixed, pointer-transparent, static. Softens content sliding above the
  bottom nav.
- Site entrance (owner request, retired): the landing appears instantly when
  the boot overlay lifts. No fade.
- Notifications (owner request): solid panel (no ghosting), per-kind icons,
  relative timestamps, wrapped messages, urgent flag styling, count in title.
- Spot cards (owner request): TearTicket tickets. Tear the stub to confirm a
  spot is still open (keyboard Enter/Space works, announces Used, persists);
  Locate + Report stay as plain buttons; no nested interactive traps.
- Map (owner request): popup HTML escaped (stored-XSS fix), markers follow the
  active filter, center-once instead of yanking the pan on every refresh,
  proper add-spot dialog replacing prompt() + full reload, report flow
  (closed/changed) completing the freshness loop, pin legend, Space key on
  cards, correct OSM attribution.
- View container (owner request): ONE whole container per gallery selection;
  sections cascade in as each enters the viewport (staggered, observer-driven
  reveals, no libraries, no scroll math). Tiles cascade on load the same way.
  Nothing pins, stages, freezes, or pre-positions: the mechanisms that kept
  failing unobservably are all removed.
- Component gallery removed (owner request): the /showcase page and its route
  were dev-only and useless to users. Deleted the page, the route, and the
  dropdown entry. Nothing else imported it.
- Profile + settings (owner request): the account menu now links to a Profile
  page (/profile) and a Settings page (/settings), replacing the dead gallery
  slot. Profile shows the picture, name, email, verification badge, trust
  tier, vouches, strikes, crews, and member-since, plus an entry into the
  identity dialog. Settings holds the picture picker and the name/email
  change flow.
- Profile pictures (owner request): a fixed gallery of eight hand-drawn
  geometric marks (sun, moon, star, bolt, wave, peak, bloom, orbit) rendered
  as inline SVG, mirrored by an AVATAR_IDS allowlist on the server so a
  client cannot write an arbitrary id. Picking one saves immediately
  (PATCH /api/me) and updates every Avatar in the app; "initials" is the
  explicit fallback. R-23: these are abstract marks, not generated photos of
  people.
- Admin-approved name/email (owner request): changing display name or email
  never applies directly. POST /api/me/profile-request files a row in
  profile_change_requests (m003); an admin reviews it in the identity
  dialog's new "Name / email change requests" block and approves or rejects
  with a note. Approval re-checks email uniqueness at review time (a taken
  email is rejected, not silently applied). The user sees status and notes in
  Settings and gets a notification either way. Non-admins get 403 on the
  admin endpoints.
- Session tiles (owner request): the session feed no longer shows a bare
  letter tile. Each session gets deterministic generative art (SpotArt):
  seeded on the session id, so a session always renders the same abstract
  tile. Four palettes, four motifs, one flip axis, drawn as SVG. No photos,
  no hotlinks, no per-session storage.
- Header contrast fix (owner request): PageHeader used dark-theme text colors
  meant for the light glass panels, but on Profile and Settings it sat bare on
  the black page background, so the title and sub sank into it. Both headers
  now sit inside the same glass-70 card the sections use, matching the rest of
  the app.
- Upload a picture (owner request): Settings gained a + tile that opens a file
  picker. The image is cover-cropped to a 256px square and re-encoded as JPEG
  in the browser (canvas), so a multi-MB phone photo becomes a small data URL
  before it ever leaves the device. Stored in users.avatar_url (added
  alongside avatar_id). Server only accepts image/png, jpeg, or webp data
  URLs, caps length, and rejects anything else including svg and javascript:
  URIs. Priority is upload > preset mark > initials; picking a preset mark
  clears the upload and vice versa so the two never fight. Threaded through
  every member/rsvp/checkin/conversation query so other people's uploads show
  everywhere, not just in your own header.
- Chat pictures (owner request): the conversation list, the conversation head,
  and both DM/group heads render the Avatar component instead of a letter
  tile. Group heads are an overlapping stack of up to three member pictures
  (classic coin pattern) rather than a squeezed quadrant, and no tile splits
  a 36px box into four 9px columns. The server already returned
  sender_avatar/sender_avatar_url on messages and other_user's ids on
  conversations, so no backend work was needed.
- Drink toggle no longer reloads (owner request): "Set: drinks / non-drinker"
  called window.location.reload(), which remounted App and replayed the whole
  boot sequence just to flip one flag. It now refreshes auth state in place via
  the existing setUser from the auth context and toasts the result.
- Dialog scrolling fixed (owner request): scrolling inside "Identity and
  safety" scrolled the page behind it, because Lenis binds the wheel at the
  window level and always moved the window. Dialog content is now marked
  data-lenis-prevent (Lenis 1.3 native opt-out), so a wheel inside a dialog
  scrolls the dialog.
- Dock circles (owner request): every inactive dock icon now carries the same
  white circle (bg-secondary-background + ink border) as the bell and avatar,
  and blue is reserved for the page you are actually on. Previously inactive
  items had a transparent border and no fill, so the row read as a mix of
  circles and bare icons.
- Site-wide staff role (owner request): users.role ('user' | 'admin', m004) is
  an operator flag, deliberately separate from group_members.role, which stays
  scoped to a single crew. isAnyAdmin() = crew admin OR operator, and it backs
  the existing verification, flag, and profile-request moderation, so an
  operator needs no crew membership to moderate. Operators are created or
  promoted by server/make-admin.js, which is idempotent and overridable with
  UWIAN_ADMIN_EMAIL / _NAME / _PASSWORD.
- Ops console (owner request): /admin is a separate operator surface, not the
  member dashboard: a dense telemetry board (mono tabular counters, bordered
  panels, uppercase section heads) with live counters and four review queues —
  spot suggestions, ID verifications, name/email change requests, open
  reports. Members hitting it get a refusal card instead of a blank page.
- Spot suggestions (owner request): anyone can propose a spot, nothing reaches
  the public radar until an operator approves it. POST /api/spot-suggestions
  validates the name and coordinates, rejects duplicates, and files a row in
  spot_submissions (m004). The submitter sees their own statuses and rejection
  notes; approval inserts into spots and notifies them. The map gained a
  "Suggest a spot" button and double-click-to-pin on the public map (crew maps
  keep the direct add, since they were already gated by crew membership).
  Because spots.group_id is NOT NULL, an approved public spot attaches to the
  first crew on the instance rather than inventing a fake group.
- antislop mode resolved (2026-10-13): owner chose "during". The filter runs
  while code is being written rather than as a separate numbered audit after.
- Terms of Service gate (owner request, 2026-10-14): Uwian does not collect a
  government ID from someone who has not agreed to its terms. POST
  /api/me/submit-verification returns 403 "Please accept the Terms of Service
  first" until the account has accepted. Acceptance is a timestamp
  (users.tos_accepted_at, m005), not just a flag, so it is auditable evidence
  after the fact. GET /api/me/tos reports status and version; the verification
  status response carries both. The gate lives in the VerificationDialog as a
  step ahead of the ID form: the document is a fixed-height own-scroll
  container, the accept button stays disabled until the checkbox is ticked, and
  once accepted the gate is replaced by the form with a note of when they
  agreed. Terms text lives in web/src/components/tos.jsx as data. Every clause
  is a claim the product actually keeps — no promise of unbuilt features
  (there is no self-serve account deletion yet, so the terms do not offer one).
- Map is verified-members-only (owner request, 2026-10-14): the public radar
  answers 403 VERIFICATION_REQUIRED to an account with no approved
  verification_submission, and the map draws a lock overlay over the base map
  with a "Get verified" call to action that opens the VerificationDialog. The
  filter row and the spots list are suppressed behind the lock rather than
  showing a misleading "All spots (0)". The map node is never unmounted —
  Leaflet binds to it once, so a second node would strand the map instance on a
  detached div; the overlay is just a layer on the same node. Crew maps
  (with a gid) are unaffected: they are behind crew membership already.
  Operators bypass the lock, since they are the people approving spots.
- Displaying an acceptance timestamp (2026-10-14): timeAgo assumes UTC, but
  SQLite's datetime('now') is local, so it produced "NaN days ago". The TOS note
  slices the stored string for its date and is guarded by a typeof check, so a
  malformed value falls back to nothing instead of white-screening the app.
- GPS accuracy tuning, still Leaflet/OSM (owner request, 2026-10-15): Google
  Maps would not have helped — position comes from the phone via the Geolocation
  API (already enableHighAccuracy everywhere), tiles are just paint. The real
  bug was timeouts: the 4s first-fix window constantly missed cold locks and
  the app then broadcast a hardcoded Katipunan coordinate as a live position.
  New shared web/src/lib/geo.js: 20s first window with one 30s retry on
  TIMEOUT, per-code error messages, and no fabricated pins on timeout — only
  a genuinely sourceless device gets the labeled estimated fallback. Same
  treatment for the chat location pin. Venue search added to the suggest-spot
  dialog via Nominatim (PH-biased, debounced, 1 req/s-friendly); tapping a
  result moves a new white draft pin and flies the map to it, and closing
  either spot dialog clears the draft. OSM attribution shown in-dialog per
  Nominatim policy.
- UI sounds (owner request, 2026-10-14): all synthesized with the Web Audio API
  in web/src/lib/sound.js — zero audio assets to host or license. Boot gets a
  3s rising sweep (plays on load, or queues until the first click/keypress
  unlocks audio, since browsers block sound before first interaction); every
  button/link/menu item gets a soft blip via one delegated listener in App;
  friend-add plays a two-note chime and pass plays a downward pop, both
  opting out of the global blip via data-sound so nothing double-plays.
  Gains stay low by design. Mute toggle lives in the account menu ("Sound:
  on/off"), persisted in localStorage; drags on the card deck stay silent
  because the vendor Stack component exposes no per-swipe hook.
- Boot phase stings (owner request, 2026-10-15): the metallic pour plays a
  sparkle shimmer and the elastic wake plays a cartoon splat, both real audio
  files bundled in web/public/sfx (Mixkit, free for commercial use, no
  attribution required) so playback never depends on a third-party server.
  Triggered from the phase effect in Boot, gated by the same mute flag and
  the same pre-gesture unlock queue as the synth sounds. Retuned 2026-10-15:
  the elastic splat ("fast splat") read as flatulence, so it is now a bubbly
  pop cluster; the UI pass pop was shortened with its floor raised 190→300Hz
  for the same reason; the boot sweep became an ascending pentatonic run over
  a low swell (2.2s, matching the burst hold) because the old plain sweep did
  not match the rays.
- Hero rework (owner request, 2026-10-15): headline now does a job ("Go out
  together. Get home safe.") with the subtitle cut to one line ("Vouched
  members, fair tabs, buddy escort home."). The pill became a live status
  line — "Tonight: {spot}, {time} · {n} going" with a live dot when you're
  going somewhere, else "{n} session(s) open tonight" ("near you" was refused:
  the feed is not location-filtered, so the copy must not claim it). Two
  equal-width buttons only (Plan / Browse); the map button was already in
  the nav and buddy escort moved to the right card. Right card is conditional:
  tonight's session preview (time, place, attendee avatar stack — feed
  attendees now carry avatar_id/avatar_url from a one-column server query
  extension) or a Get-home-safe card opening the buddy dialog. Subtitle went
  15px muted → 16px at 85% black; shadows were already uniform 4px blue
  across the hero (verified, not changed). The ElasticMesh wobble was dropped,
  not relocated: the mesh needs ~150px+ to read and turns to mud at 30px nav
  size; the logo keeps its magnetic pull as the daily micro-joy instead.
- Dialog text contrast fix (owner request, 2026-10-15): index.html sets
  body{color:#fff} inline (unlayered, so it beats the themed layered rule)
  for the pre-paint boot screen — and every light dialog panel inherited it,
  rendering white-on-light-blue across all 13 Shell dialogs. Shell now
  declares text-foreground directly (direct rules beat inheritance
  regardless of layers); audit showed every dark sub-panel inside dialogs
  already sets its own text color explicitly, so nothing regressed. The
  suggest-spot dialog was also restructured into two kicker-headed sections
  (find the venue / spot details) with a search icon, pin-icon result rows,
  and an icon submit button; behavior and copy unchanged.
- Ops console styling (owner request, 2026-10-14): the operator account does not
  need the app's aesthetic language, so the console shares none of it — no glass
  panels, no offset shadows, no rounded tiles, no hero type, no marquee. Square
  corners via rounded-none, 2px rules only on the panel top/bottom and header,
  hairline divide-y rows instead of nested cards, Space Mono for every numeric,
  uppercase kicker for every label. Blue stays as the single accent and is used
  only on a nonzero pending-count badge. Red appears on exactly one thing: the
  flagged name in an open report. A SYNC clock shows a live wall-clock and the
  page self-refreshes every 45s so a duty operator's tab cannot go stale. The
  console still ships as one route with one entry in the account menu (link-only,
  no public nav), which is the half of "hidden behind a link" that was already
  true.
- Google sign-in (owner request, 2026-10-15): one button for both sign-in and
  sign-up (white + official G mark, on login and signup pages) — first click
  auto-creates the account, later clicks just sign in. No new npm deps: code
  exchange and userinfo are plain fetch. Existing emails link automatically
  (verified Google email = email ownership). New accounts get a random
  unusable password hash (password login can never work) and NULL birthdate,
  which triggers a one-time 18+ step (POST /api/me/birthdate, refuses
  overwrite) so the age invariant holds. CSRF state via session, failures
  redirect to /login with an error code. Verified end to end except the live
  Google handshake (needs real credentials): redirect shape, bad-state
  rejection, 401/409/400/200 birthdate paths. Needs GOOGLE_CLIENT_ID +
  GOOGLE_CLIENT_SECRET env and the authorized redirect URI in Google Console.
- Invite picker trust rule (owner request, 2026-10-15): the session invite
  list shows friends plus past crew only — plain crew membership no longer
  qualifies anyone. Past crew = people you shared a successful session with,
  where successful means the session ran its full cycle (status closed) and
  both of you were RSVP'd going; served by GET /api/users/past-crew, one row
  per person labeled with the most recent shared session. Rows carry Friend
  and/or "Past crew · Sep 16" badges, tabs are All / Friends / Past crew with
  counts, friends preselect and past crew stays opt-in. Seed now RSVPs Ana,
  Ben, and Carl on the closed session so fresh DBs demo it (expense shares
  already proved they were there).
- Messages scroll containment (owner request, 2026-10-15): the page itself
  scrolled on most screens — the fixed container math ignored the sticky
  header and main paddings (68+28+112 mobile, 68+28+64 desktop). Container is
  now exactly viewport-minus-chrome with no min-height forcing overflow, and
  all three inner scroll regions (conversation list, thread, composer) carry
  data-lenis-prevent so the wheel can no longer move the page instead.
- Demo roster reset (owner request, 2026-10-15): old DB backed up to Temp and
  wiped. Fresh seed: 1 operator (Uwian Dev, role admin, outside any crew),
  2 verified (Mika, Jolo — approved, reviewed by the operator), 2 unverified
  (Tara, Rafi), 5 random faces (Ivy, Noah, Lena, Kai, Sari, all chibi
  avatars) for card/friend testing, plus 1 pending verification (Ivy) so the
  ops queue demos non-empty and 1 accepted + 1 pending friendship. One crew,
  2 spots (one stale for the S5 badge), 3 sessions (open tonight with rsvps,
  planning, closed 14 days ago with rsvps so the past-crew picker demos),
  and a group chat with 2 messages. Login page lists all 10 as insta-sign-in
  buttons (shared demo password). db.js still auto-adds Curtney/Maya/Paolo/
  Sofia/Kenzo on boot — bonus randoms, untouched.
- Official logo swap (owner request, 2026-10-15): header/dock/auth tiles,
  header wordmark, dashboard footer, and favicon now use the owner's vector
  art (web/public/uwian-icon.svg + uwian-logo.svg — pure paths, no fonts or
  scripts, so they render identically everywhere). OfficialLogo keeps its
  API; the ElectricLogo tracing was only ever correct for the old white
  mark, so it went with it. Loading screen explicitly untouched per owner —
  Boot still traces the legacy U-house mark.
  Fixed 2026-10-15: the favicon swap initially replaced only the head of the
  old data-URI, leaving its encoded tail as visible stray text atop every
  page. The line was rewritten wholesale and the head verified clean.
- Chibi preset pictures (owner request, 2026-10-15): the 8 geometric marks
  stay renderable and server-accepted so nobody's existing picture breaks,
  but the picker now offers 8 hand-drawn chibi characters instead (Emo Boy,
  Emo Girl, Skater, Preppy, Goth, Sporty, Artist, Softie — varied skin tones,
  hair, eyes, and accessories on the same 48-grid inline-SVG system).
  Same concept, new themes: initials + upload + allowlisted gallery, with the
  server AVATAR_IDS extended and the picker reading the CHIBI_IDS subset.
- Session cover pictures (owner request, 2026-10-15): sessions default to
  their generative SpotArt tile, but a crew admin can upload a real picture
  (2:1 banner, downscaled to 960px JPEG in-browser, same mime/size validation
  as avatars, stored in new sessions.cover_url via m011). PATCH accepts
  cover_url from crew admins only (403 otherwise, 404 on missing session);
  null clears. Shown as the session page banner; feed tiles keep SpotArt
  because photos turn to mud at 36px.

## What the product is (unchanged)

Uwian helps people discover open hangout sessions, join them through verified members, and makes sure everyone gets home safe. Security is real: ID-based vouching, not just a social graph. The tone is casual and warm, not clinical or corporate.

## Identity

**Personality:** A trusted friend who knows where the good nights are and makes sure you get home safe. Casual, never cold. Direct, never preachy.

**Not:** A fintech app. Not a law firm. Not a crypto product.

## Logo (official)

Electrified twin-house U after the model logo: white arcs with a deep-blue
glow (`#1D4ED8`), rendered by the ElectricLogo component from the `UHOUSE_SRC`
artwork. Used in the header (both bar and dock states), auth cards, and the
favicon (static blue tile + white U, since favicons cannot animate). Falls back
to the static U-house mark when the OS asks for reduced motion. R-23: created
under the owner's explicit logo instruction; people stay initials-only.

## Palette

Two core colors plus one accent. Neutrals do not count toward the cap (R-29).

| Role | Value | Reason |
|---|---|---|
| Background | `#FAF8F5` | Warm off-white. The room you come home to. |
| Surface | `#FFFFFF` | Clean white card. |
| Surface inset | `#F4F1EC` | Slightly toasted. Used for pressed/inset areas. |
| Border | `#E6E1D9` | Warm border. Not cold gray. |
| Accent | `#F59332` | Amber-orange. The porch light left on. Used on primary actions and active states only. |
| Accent text | `#96590A` | Darker amber for text on light backgrounds. Darkened until it passes AA on paper. |
| Accent dim | `#FEF3E4` | Light amber fill for chips and tags. |
| Text primary | `#1C1814` | Warm near-black. |
| Text secondary | `#7A6E64` | Warm medium. Used for supporting copy. |
| Text tertiary | `#6F6257` | Warm dark gray. Darkened until it passes AA on paper. |
| Backdrop | dusk scene, pure CSS | Low sun, amber horizon glow, two plum hill ridges, paper grain. Same-hue family only. Reason: sessions happen at dusk, and glass needs something to refract. No photo assets. |
| Safe/home | `#22A87A` | Teal-green. "Made it home." |
| Safe dim | `#EBF8F3` | Light fill for safe state. |
| Alert | `#E04040` | Red. Disputes, danger. |
| Alert dim | `#FDEAEA` | Light fill. |
| Warning | `#D9820A` | Amber-dark. Approaching limit, nudge. |
| Warning dim | `#FEF5E4` | Light fill. |

## Typography

**Body font:** DM Sans (Google Fonts). Reason: slightly rounded terminals, friendly and readable, designed for UI screens. Casual without being childish. Works across weights 400 to 700.

**Display font:** Fraunces (Google Fonts, optical sizing). Reason: a soft, warm serif with real character for headings, the wordmark, and big numbers. It gives the product a voice the geometric-sans default cannot. Used at 500 to 600 only, never for body copy. (Owner override 2026-10-13: DESIGN.md previously allowed no second font. Kept because the dashboard needed a warmer, more ownable headline voice.)

**Scale:**
- Page/hero heading: Fraunces 30 to 34px / 600
- Section heading: 17px / 600
- Body: 15px / 400
- Supporting / label: 13px / 500 (sentence case, not uppercase)
- Mono (amounts, receipt): SF Mono / Cascadia Mono / Consolas

## Border radius

Defined set. Not pill everywhere, not square.

| Element | Radius | Reason |
|---|---|---|
| Cards / panels | 16px | Friendly, not bubbly |
| Buttons | 10px | Consistent with inputs |
| Inputs | 10px | Matches buttons |
| Chips / tags | 6px | Small, inline, slightly rounded |
| Sheet / modal | 20px top only | Slides up from bottom |
| Avatar | 50% | Circle only |

## Shadow

Used only where elevation is real (sheet/modal, dropdown). Cards sit flat with a border, not a shadow. Shadow is not decoration.

| Element | Shadow |
|---|---|
| Bottom sheet | `0 -4px 24px rgba(0,0,0,0.10)` |
| Dropdown | `0 4px 16px rgba(0,0,0,0.10)` |
| Everything else | None |

## Accent usage

The amber accent appears in three places only:
1. Primary action button (fill)
2. Active tab / selected state
3. Focus ring

Not on headings, borders, icons, cards, or backgrounds. One accent, one purpose.

## Motion

Entrance animation: one. `fadeUp` on route transition, 300ms, `cubic-bezier(0.2, 0.9, 0.3, 1)`. Nothing loops. Nothing bounces on its own. Hover states use opacity/border transitions at 150ms.

ENERGY 2 / RHYTHM 1 / MOTION 1

## Dials

- **ENERGY 2:** Alive and warm, not loud. The accent does the work.
- **RHYTHM 1:** Consistent layout across pages. No need for section variation in an app view.
- **MOTION 1:** Hover states and one entrance animation. No loops.
