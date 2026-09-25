# Funnel & Copy Review — September 2026

**What this is.** Every SMS and email in every published, currently-sending workflow — 57 workflows, 347 messages — read against the Antifragile Sales System's five buyer stages (Indifferent → Curious → Comparing → Negotiating → Committed) and the psychological progression the review was asked to check: **relevance → curiosity → hope/desire → rapport/trust → engagement → positioning → urgency/action**. For each message: the stage it should speak to, the stage it actually speaks to, the job it should be doing, what it actually does, and — where something is wrong — the exact line causing it and the change to test. For each workflow: the strategy in plain words, the marketing angle, where momentum breaks, and whether the problem is in the messaging, the offer, the traffic, or the pipes (structure).

**How this was checked.** Every quoted line in this document was verified word-for-word against the stored message text, subject line, preheader, or AI prompt — a script confirms each one is an exact match, not a paraphrase. Every message got its own entry; AI-written messages were read from their prompt, since the sent text is generated at send time. Ten reviewers worked in parallel by funnel family, using a shared rubric and a calibration set of 11 real messages that Mark ruled on first, so every reviewer graded the same way. I then re-verified every quote independently, fixed the handful of technical formatting errors that came out of that process, and wrote the findings below myself.

**What this document is not.** Reply rate, booking rate, and opt-out rate per workflow — the data that separates a genuine offer or traffic problem from a messaging one — isn't available yet (migration `0024_workflow_outcomes.sql` is written and waiting for you to run it). Every finding below is graded `messaging`, `structure`, or `healthy`; none is graded `offer` or `traffic`, because none of the reviewers had outcome data to justify that call. Once the migration is in, some `messaging` calls here may turn out to be `offer` or `traffic` problems instead — worth a second pass then.

---

## The headline

| | |
|---|---|
| Workflows reviewed | 57 (all currently-published, sending workflows) |
| Messages reviewed | 347 |
| Classified `healthy` | 19 |
| Classified `messaging` (the copy is doing the wrong job) | 37 |
| Classified `structure` (leads go in, nothing comes out) | 1 (E.5) |
| Messages doing their job correctly (`ok`) | 203 of 347 |
| Messages breaking a brand or compliance rule (`off_voice`) | 74 |
| Messages with no concrete reason to act now (`no_reason_to_act`) | 9 |
| Messages pitching, pricing or positioning a cold reader too early (`early_pitch`) | 7 |
| Messages positioning Reece before the reader is comparing (`premature_positioning`) | 2 |
| Messages re-teaching a reader who's already past that (`over_educating`) | 2 |

**The three biggest problems, in order of how much they cost:**

1. **The compliance line that matters most — predicting an insurance outcome — is crossed 49 times across 15 different workflows.** This isn't one bad email; it's the single most common hard-line violation in the whole review, and it shows up at every stage of the funnel, from a first-touch canvassing bridge to the post-appointment follow-up to the objection handler.
2. **The Protection Profile Review's own name is wrong in a third of the workflows that should use it** (14 of them), most often replaced with "Review Session" — a name that sounds like a sales meeting, which is exactly what the locked name exists to avoid sounding like.
3. **Three separate post-sale workflows (C.2, C.5, C.6) can each independently ask the same customer for a referral**, because a later-stage job (the referral ask) keeps getting pulled forward into earlier workflows whose actual job is something else.

None of these are judgment calls about tone or persuasion technique — they're rule breaks a checklist would have caught, which is why they're grouped first.

---

## Where the psychological progression breaks

The review asked one question at every message: does this pull the lever the reader is ready for right now, or has the sequence jumped ahead (or fallen back)? Here's where it breaks, in funnel order.

### Stage 1 — Indifferent (job: relevance, then curiosity — never a pitch, a price, a position, or a booking push)

This is where the review found the clearest and most common mistake: **five different first-touch workflows skip straight to a booking ask or brand positioning before earning any curiosity.**

- **E.6 Referral Bridge** is the worst single case. Every SMS in the sequence *is* a direct booking ask as its entire first message — "I'm with Reece, we took care of their home and I'd love to help with yours. Want me to set up a—" — sent to someone who has done nothing but be referred. The welcome email opens the same way: "*Here's what we do differently at Reece:*" is Stage 3 brand positioning on message one. There is no relevance or curiosity step anywhere in this workflow before the ask.
- **E.3 Chatbot Qualifier Bridge**, **E.4 Canvassing Bridge**, and **E.1 Risk Report Bridge** each have at least one message that does the same thing in a smaller way — a booking link presented as the primary next step (not a low-key footer escape hatch) to a reader who's had one or two touches and no story yet. In E.1's case it's ironic: the workflow's own AI instructions for that exact touch explicitly say "NO CTA... No booking link," but the *stored fallback text* used when the AI doesn't fire has one anyway.
- **E.6, E.3, and E.4** also each call the in-home visit a "free in-home estimate" or "free 10-minute phone review" — both the banned "free" phrasing and the wrong name for the locked Protection Profile Review.

**What to test:** for E.6 specifically, replace the day-0 SMS and welcome email with a version that spends its first message purely on relevance (why this matters to their specific home) before any ask appears — the same shape S1.1 and S1.3 (re-engagement) already use correctly.

### Stage 2 — Curious (job: reveal secrets, mistakes, alternatives — never position the brand)

- **S2.1 Calculator Indoctrination, Email 3** names the Documented Defense System — Reece's own crews, warranty, and company history — as the answer, days before the reader has any reason to be comparing vendors: *"We built the Documented Defense System around those four pieces."* That's Stage 3 positioning language sitting inside a Stage 2 secret-reveal email. The email before and after it do the job correctly.
- **The $3,800 family is being mixed with a city in all three of these Stage 2 workflows.** $3,800 belongs to the P3 family, who must never be given a city. S2.1 Email 4 tells it as "a family in Tampa". S2.2 Email 4's subject says "One Tampa family found $3,800 a year", and its AI prompt asks for "the Tampa $28K Family story" but hands the writer the $3,800 figure. S2.5 Email 2 reuses $3,800 as the cost of a Broward change order, which is a different, unverified story wearing P3's number.
- *(Correction, 2026-09-25: an earlier version of this report said an invented **$45,000** figure appeared in S2.1, S2.2, S2.5, E.3 and E.4. It appears **only in E.3 and E.4**, at Stage 1. The S2 workflows have the separate $3,800 problem above.)*
- **S2.5 Pricing Accuracy Education** is signed "Mark from Reece" and written in first person — but this is sent *before* any appointment exists, and Mark's first-person voice is only approved for *after* the appointment (your ruling on item 8 of the calibration set). Every pre-appointment message needs to be Randy's voice.

**What to test:** pull the Documented Defense System mention out of S2.1's Email 3 and replace it with a third secret or mistake, saving the system name for S3. For S2.1, S2.2 and S2.5, keep $3,800 with the P3 family only, with no city, and never next to Tampa. Proposed wording is in `docs/copy-changes-2026-09.md`. It needs your ruling, because this is a different problem from the $45,000 one.

### Stage 3 — Comparing (job: position Reece as relevant, superior, unique — never re-educate)

This is the one stage in the review that's mostly working. **S3.1 Calculator Positioning Burst** does its job cleanly — it positions Reece's process against a fragmented industry and compresses into a real, storm-season reason to act by day 12. No violations found.

**S3.3 Chatbot Authority & Positioning is the opposite problem**, and it's structural rather than a writing mistake: all six of its AI prompts open with a "SYSTEM OVERRIDE" instruction block that bans first-person brand language, bans inviting a reply, bans any call to action, and forbids telling a story — which strips out the Hook-Story-Offer approach the entire system is built on. A Stage 3 workflow whose own prompt forbids it from positioning or asking for anything can't do its job no matter how well the rest of the prompt is written. Three of the six prompts also instruct "In-house installation team," the banned crew wording. It shows zero sends in the last 30 days, so this hasn't reached real leads yet — worth fixing the prompt before it does.

**What to test:** rewrite S3.3's system instruction to allow first-person Reece voice, a story, and one reply-based CTA, keeping whatever guardrail the override was originally meant to enforce (likely: don't sound scripted).

### Stage 4 — Negotiating (job: overcome the specific objection, compress the decision — no more education, and give a real reason to act now)

This is where the review found the largest single concentration of problems, split between two different failure types.

**Type 1 — falling back into education instead of compressing.** The objection handler (**O.0**) and two Protection Profile Review workflows (**S4.6**, **S4.7**) all do this:

- **O.0's** complexity branch spends three straight emails re-teaching glass physics and install quality — *"It's not hype — it's physics, backed by engineering, testing, and 2,500 installs a year that prove it works"* — instead of overcoming the specific complexity objection and moving to a decision. That's a Stage 2 pattern deployed at Stage 4.
- **S4.6 Protection Profile Review Prep**, starting from its very first confirmation email, stops doing its actual job (logistics plus objection-handling for someone who already booked) and instead re-teaches "how insurers classify your home" — Stage 2 content dressed up as a booking confirmation.
- **S4.7** does the same thing under pressure: from Email 2 onward it escalates from a reasonable no-show nudge into fabricated insurer-outcome claims and a manufactured deadline ("before I close your file") — falling back into fear-based education instead of giving a real reason to reschedule.

**Type 2 — giving no reason to act at all.** This is the mirror problem, and it shows up in **O.0's** closing messages across every one of its 8 objection branches, and in **S4.1 MV Booking**, and **A.CC-1-N**:

- O.0's four-email sequences are explicitly instructed not to include a scheduling link in messages 1–3 — correct, that's Stage 4 pacing — but the *fourth, closing* message never names a next step either. One ends on "*Let's start there*" with no link, no phone number, no reply instruction. After 13 days and 5 touches, a Stage 4 reader is left with nothing to click.
- S4.1's booking texts state the next step ("the next step is a Measurement Verification") but never say why now rather than later — no external constraint, no real deadline.
- A.CC-1-N, after a missed confirmation call, offers to reschedule with "*No rush at all*" — dropping the urgency the deployment matrix calls for at this exact step, on top of mislabeling a phone call as an in-home visit.

**What to test:** add one concrete next action (a link or "reply YES") to O.0's fourth message in every branch — this alone would fix a compliance-clean 5-touch sequence that currently converts nobody by design. For S4.1, add a single real constraint (install-calendar availability, a season deadline) to the booking ask.

### Stage 5 — Committed (job: validate and delight — never sell or educate)

This stage is close to clean. Of the 8 post-sale workflows (C.0–C.7), 6 are `healthy`. The two exceptions (**C.2**, **C.6**) aren't a stage-mismatch problem — the copy correctly avoids selling to the customer — they're a **structural duplication**: C.2's second email and C.6's second/third messages both turn into the referral ask that C.5 Referral Overlay already exists to make, so a single customer can receive the same ask from three different workflows.

**What to test:** remove the referral ask from C.2-E02 and from C.6-S02/S03, leaving C.5 as the one workflow responsible for that job.

---

## The compliance findings, ranked by how often they happen

These are rule breaks, not stage-fit judgment calls, and most of them are one edit away from fixed.

| Rule | Times broken | Workflows affected |
|---|---:|---|
| Predicts an insurance/claim/payout outcome | 49 | E.3, E.4, E.5, E.6, E.7, F.0, O.0, S1.1, S1.1-legacy, S4.6, S4.7, U.SEND-DHP, U.SEND-EN, U.SEND-FN, U.SEND-HRR |
| Wrong name for the Review / the system / the visit | 33 | A.CC-1-N, A.WE-1, E.4, E.6, E.7, S1.1, S1.1-legacy, S4.6, S4.7, U.SEND-DHP, U.SEND-EN, U.SEND-FN, U.SEND-HS, U.SEND-P |
| Voice rule broken (exclamation marks, emoji in email, banned phrase) | 22 | A.CC-1-N, E.3, E.6, E.7, I.AI-MAIL, S1.6, S4.6, S4.7, U.SEND-DHP, U.SEND-EN, U.SEND-FN, U.SEND-HS, U.SEND-P, U.SEND-WT |
| Sends a lead past the Protection Profile Review who shouldn't skip it | 22 | A.CC-1-N, E.1, E.3, E.6, E.7, I.AI-MAIL, S1.1-legacy, U.SEND-DHP, U.SEND-EN, U.SEND-FN, U.SEND-HS |
| Promises savings or a price drop | 22 | E.6, E.7, F.0, O.0, U.SEND-DHP, U.SEND-EN, U.SEND-FN, U.SEND-HS |
| A statistic outside the five allowed references | 17 | E.3, E.4, E.7, F.0, O.0, S2.5, S4.6, S5.2, U.SEND-DHP, U.SEND-EN, U.SEND-HS |
| Company history stated wrong (1972 vs 2005, or "50 years" not 54) | 15 | C.3, E.6, F.0, O.0, S4.6, S4.7 |
| Randy or Mark's voice used somewhere it isn't approved | 13 | E.4, S1.1-legacy, S1.3, S2.5, S4.1 |
| Crew wording off canon ("in-house") | 13 | O.0, S2.2, S3.3, Trust (Missed Appointment) |
| Story isn't one of the eight approved parables, or mixes two | 6 | E.3, E.4, F.0, S2.1, S2.2, S2.5 |
| Fake scarcity | 3 | O.0, S1.1-legacy, S4.7 |
| Carrier or competitor named | 0 | — none found |

**Two patterns worth naming on their own, because each shows up mechanically rather than as a one-off judgment:**

- **The four "send-a-guide" reply workflows (U.SEND-DHP, U.SEND-EN, U.SEND-FN, U.SEND-HS) share the same body copy and the same list of problems**, almost word for word: "free estimate" repeated three to four times, the visit misnamed, an unapproved statistic, and in DHP/EN/HS a 👉 emoji in the CTA line. Because they share the same template, fixing it once and re-propagating it fixes all four at once.
- **The nudge-drip workflows (U.SEND-CB, U.SEND-P, U.SEND-HRR) all drop `{{contact.first_name}}` on their later messages while the first one or two have it.** This reads like a template gap in whatever built the later steps of these drips, not an intentional style choice — worth checking the build process rather than editing each message by hand.

---

## Where the problem is structural, not written

**E.5 Unknown Source Bridge** is the one workflow classified `structure`: 3,362 leads entered in the last 30 days and nothing went out. This is not a copy problem. Per the reviewer, the copy is the strongest in this batch: correct Review naming throughout, and a true unnamed story with no invented numbers.

**Cause (found 2026-09-25 from the workflow's saved versions):**
- On **May 21** (GHL version 38), all 7 message steps were switched off with GHL's "turn off this action" switch. The workflow kept running and kept adding its `sent:e.5-*` tags, so the tags looked like sends. Only the hurricane-guide email reached the contacts we checked.
- On **June 17** (GHL version 46), the 7 tag steps were switched off too, and 5 "assign user" steps were removed.
- **Step 28 (the conditional wait) has not changed in any saved version.**
- The fix is to switch the 7 messages back on in GHL, and their tag steps with them. Fix its two outcome-prediction lines first; the wording is in `docs/copy-changes-2026-09.md`.

The same switch is on for every message in A.WE-1, E.1, E.4, E.6, E.7, S1.1 (both versions), S2.2 and U.SEND-DHP, and for 5 SMS in F.0. Their `sent:` tags are not proof of sends either. The dashboard now shows these as "Published, messages turned off".

---

## Full results by workflow

`healthy` = doing its job. `messaging` = the copy is doing the wrong job somewhere in the sequence. `structure` = leads go in, nothing comes out.

| Code | Workflow | Result | What we found |
|---|---|---|---|
| A.0-RT | Reschedule Timeout Fallback | messaging | Does its job, but the one SMS never uses the lead's name — an SMS voice-rule miss, not a stage problem. |
| A.CC-1 | Confirmation Call Reminders | **healthy** | Logistics-only, no-pressure, consistently reassuring — exactly what this step needs. |
| A.CC-1-N | Confirmation Call No-Show | messaging | Mislabels a missed phone call as a "free in-home inspection" and drops the urgency the step calls for. |
| A.MV-1 | Measurement Verification Reminders | messaging | Logistics done right, but "complimentary" undercuts the paid-value pricing step in most of the sequence. |
| A.WE-1 | Window Estimate Reminders | messaging | The confirmed branch never says "Window Estimate" anywhere, even though its own SMS gets it right. |
| B.1B | SMS Widget First-Touch | **healthy** | Clean first touch: identifies itself, asks one question, includes an opt-out. |
| B.HC-L | Hot Call Live Chat | **healthy** | Honest expectation-setting after hours, no selling. |
| C.0 | Customer Onboarding | **healthy** | Validates the decision, no pitch, clean compliance. |
| C.1 | Install Progress Updates | **healthy** | Status updates matched to the real pipeline stage. |
| C.2 | Post-Install Check-In | messaging | Second email folds in a referral ask that duplicates C.5's job. |
| C.3 | Expansion | **healthy** | The one allowed upsell in this family, done softly and correctly. |
| C.4 | Review Solicitation | **healthy** | Keeps unhappy customers out of the public-review path; no incentive, no fake urgency. |
| C.5 | Referral Overlay | **healthy** | Low-pressure, standalone, no incentive, no fake urgency. |
| C.6 | Review Amplifier | messaging | Two of three messages become a second referral-ask sequence, duplicating C.5. |
| C.7 | Unprompted Referral Capture | **healthy** | Low-pressure capture, though the deployment matrix lists this code as having no copy at all — worth reconciling with what's actually live. |
| E.1 | Risk Report Bridge | messaging | The AI-intended version follows the no-CTA rule; the stored fallback SMS breaks it. |
| E.2 | Calculator Bridge v2 | **healthy** | A calculator flow booking the in-home visit directly, per your ruling — clean throughout. |
| E.3 | Chatbot Qualifier Bridge | messaging | Defaults to "South Florida," predicts an insurance-claim outcome, ends on a primary booking push. |
| E.4 | Canvassing & In-Person Bridge | messaging | One SMS predicts a claim outcome; one email uses Mark's voice pre-appointment. |
| E.5 | Unknown Source Bridge | **structure** | 3,362 leads in, zero sends. All 7 messages have been switched off in GHL since May 21. It is not a trigger or copy problem. |
| E.6 | Referral Bridge | messaging | The clearest Stage-1 mismatch in the review: every message opens on a direct ask or brand positioning. |
| E.7 | High-Intent Digital Bridge | messaging | The fast-track strategy is correctly applied, but invents insurance-savings numbers repeatedly. |
| F.0 | Post-Appointment Follow-Up | messaging | Two emails invent specific dollar outcomes; one states the company's age wrong. |
| I.AG-IN | Agentic Inbound Webhook | **healthy** | No fixed text to audit; does its one routing job. |
| I.AI-MAIL | AI Mouth Dynamic Email Writer | messaging | Its own prompt forces every buyer stage into one email regardless of who's actually reading it. |
| I.HDL-2 | Customer Service Callback Handler 2 | **healthy** | Tells the contact who's calling and when — nothing to violate. |
| O.0 | Objection Handler | messaging | Right stage throughout, but breaks compliance repeatedly (see the pattern table above), and its closing messages never name a next step. |
| S1.1 | Re-engage Weakest Point | **healthy** | Clean successor to S1.1-legacy — the outcome-prediction and pressure problems are gone. |
| S1.1-legacy | S1.1 90-Day Re-engagement | messaging | Predicts claim outcomes outright and applies flash-sale pressure to a cold list; registry notes and zero sends suggest it's already retired — worth confirming. |
| S1.2 | Calculator Re-engagement | messaging | Right pressure level, but no message across all 20 gives a real reason to come back. |
| S1.3 | Stale Lead Revival | **healthy** | The strongest re-engagement sequence reviewed — a genuine external constraint, no pressure. |
| S1.6 | Guide-Sent Re-engagement | messaging | Right stage and pressure, but every message breaks voice rules (exclamation marks, emoji). |
| S2.1 | Calculator Indoctrination v3 | messaging | One email positions the branded system a stage early; another pairs a named city with the wrong dollar figure. |
| S2.2 | Chatbot Indoctrination | messaging | An AI prompt instructs "in-house factory-trained crews" — the banned wording, baked into the prompt itself. |
| S2.5 | Pricing Accuracy Education | messaging | Sent from Mark's voice before an appointment exists; repeats the city/dollar-figure mixing. |
| S3.1 | Calculator Positioning Burst v3 | **healthy** | Positions correctly and compresses into a real reason to act by day 12. |
| S3.3 | Chatbot Authority & Positioning | messaging | Its own AI prompt bans the brand voice, story, and any call to action — can't do its job as written. |
| S4.1 | MV Booking | messaging | Mark's voice used before the first appointment; booking asks give no reason to act now. |
| S4.5 | Agentic Seinfeld Nurture (Shell) | messaging | This file has no AI prompts to audit for its AI-written content — a data gap, not a verdict on the copy. |
| S4.6 | Protection Profile Review Prep | messaging | Predicts insurance outcomes throughout; wrong Review name in 7 of 8 messages; wrong company age. |
| S4.7 | Protection Profile Review No-Show Recovery | messaging | Same pattern as S4.6, escalated: a fabricated deadline and fabricated insurer statements. |
| S5.2 | Appointment Rescue v2 | messaging | Its urgency lever is used honestly throughout; the real issues are two invented statistics and one voice slip. |
| Trust (Missed Appointment) | Missed-Appointment Trust Repair | messaging | Owns the mistake well, but restates the banned "we don't subcontract" claim in different words. |
| U.E-WE | Send Estimate | **healthy** | Hands over what was generated, zero pressure, history stated correctly. |
| U.EV | Email Verification Code | **healthy** | A transactional code email — nothing to violate. |
| U.SEND-AI | Send Additional Info Email | **healthy** | The prompt explicitly forbids making up answers and routes to a human when unsure. |
| U.SEND-CB | Send Call Booking Link | messaging | 4 of 5 messages are missing the lead's first name — a template gap. |
| U.SEND-CX | Send Cancellation Link | messaging | Does its job, but missing the first name. |
| U.SEND-DHP | Send Documented Home Protection Guide | messaging | "Free estimate" repeated, wrong visit name, unapproved statistics, emoji in the CTA. |
| U.SEND-EN | Send Energy Savings Guide | messaging | Shares U.SEND-DHP's body copy and its exact list of problems. |
| U.SEND-FN | Send Financing Guide | messaging | Predicts an insurance-premium reduction; "free estimate" CTA. |
| U.SEND-HP | Hurricane Guide Delivery | **healthy** | The model of a clean guide delivery — no pitch, no CTA, no unapproved stats. |
| U.SEND-HRR | Send Risk Report SMS | messaging | Missing first name on two messages; one predicts how an insurer will judge a home. |
| U.SEND-HS | Send Home Security Guide | messaging | Same guide-reply pattern as DHP/EN: "free estimate," wrong visit name, unapproved stat, emoji. |
| U.SEND-P | Send Pricing Link | messaging | Minor naming flag (per your ruling on item 11); missing first name on some messages. |
| U.SEND-RS | Send Reschedule Link | messaging | Does its job, but missing the first name. |
| U.SEND-WT | Send Warranty Info | messaging | Crew wording is correct and clean otherwise — the one issue is an emoji in the closing CTA. |

---

## Mark's rulings (2026-09-25)

1. **The $45,000 figure is not real. Remove it.** Replace it with the $28,000 Tampa parable (P7) on its own, or with a true unnamed story. It appears only in **E.3 Email 2** (Tampa) and **E.4 Email 2** (Broward). The ruling named S2.1, S2.2 and S2.5 too, based on this report's earlier mistake; those three have the separate $3,800 problem described under Stage 2, which still needs a ruling. This is logged as a canon ruling.
2. **C.5 Referral Overlay owns the referral ask.** Remove it from C.2 Email 2 and from C.6 SMS 2 and SMS 3. Do this before the Test Contact gate opens on those workflows.
3. **S1.1-legacy (2094441c) is retired.** Mark will unpublish it in GHL himself. The registry changes to `unpublished` once he confirms. Its copy is not to be rewritten, because the workflow is dead, not pending.
4. **E.5 is an engineering finding, not a copy one.** See "Where the problem is structural" above: step 28 is unchanged, and the messages were switched off on May 21. The GHL fix is Mark's. The registry now shows E.5 as published (version 48). Fix its two outcome-prediction lines before it is switched back on.
5. **LP status CCC means "Customer called to cancel"** (a prior appointment). LP's own label, "Cannot Contact", is wrong for Reece, so the dashboard overrides it. **NIS2 and OPPPRD are not used by Reece** and show as "Unused code (legacy)". They are not routed or reported on.

The before-and-after wording for every edit above is in `docs/copy-changes-2026-09.md`.

## Registry entries that may need correcting (read-only — nothing here was changed)

Comparing each workflow's registry entry against the copywriting framework's own deployment matrix surfaced these mismatches. The registry was not edited as part of this review; these are flagged for you to rule on.

- **F.0, O.0, and S5.2** are tagged in the registry as `support` / `support` / `reactivation`, but the framework's deployment matrix puts all three at buyer stage #4 (Negotiating). This review graded them against stage #4, per the framework, not the registry label.
- **S4.5** is tagged `conversion` in the registry; the deployment matrix marks it buyer stage #2–#3, "trust-built" — a different kind of workflow (a long rotating nurture) than a normal conversion push.
- **Three published, sending workflows weren't in the registry**: B.1B SMS Widget First-Touch, the Missed-Appointment Trust Repair workflow, and U.SEND-DHP. *Registered 2026-09-25 per your ruling; the stage-label questions above are left for a separate ruling.*
- **C.7**'s deployment-matrix entry says "no copy (capture)," but three real, working SMS messages exist and are live.

---

## Method note

Reviewed by 8 parallel readers grouped by funnel family, each using the same rubric (`RUBRIC.md`) and the copywriting framework's deployment matrix, with a shared answer key built from your rulings on an 11-message calibration set sent and confirmed before the full review began. Every quoted line in every message was then checked against the stored source text by an independent script — 347 messages, 0 quote mismatches. The underlying per-message data (buyer stage, lever, verdict, full compliance checklist) lives in the dashboard at `lib/workflows/insights/` and powers the Strategy tab on each workflow page and the `/workflows/review` Funnel Review page — released on the dashboard on 2026-09-25, after this file was reviewed and ruled on.
