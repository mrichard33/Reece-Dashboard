# Copy changes for GHL — September 2026

These are the edits that follow from Mark's rulings of 2026-09-25 on the funnel review
(`docs/funnel-review-2026-09.md`). Each is made by hand in GHL. Each entry gives the
workflow, the step and the exact text to find and replace.

Text marked **Find** is copied from the live message as it stood on 2026-09-25.

---

## 1. Remove the $45,000 story (ruled)

**Ruling:** the $45,000 figure is not real. Replace it with the Tampa $28,000 family (P7)
on its own, or with a true unnamed story. It appears in these two emails only.

P7, as the canon tells it: a Tampa family paid $28,000 for impact windows from another
company. About three years later the installer had closed. When they filed a claim, there
were no records anyone could verify, and the claim was denied. P7 never appears next to
$3,800, which belongs to a different family (P3).

### E.3 Chatbot Qualifier Bridge — Email 2
Step `09ce6e47`. Subject: "The part your insurer checks first (it's not what you think)".

**Find** the preview line:
> A homeowner in Tampa found out the hard way last hurricane season.

**Replace with:**
> A Tampa family found out the hard way what their windows couldn't prove.

**Find** the story (from "Last hurricane season" to "realize."):
> Last hurricane season, a homeowner in Tampa filed a $45,000 wind damage claim. Impact windows installed. Shutters on every opening. They did everything right — or so they thought. The claim was denied. The reason? Their windows weren't rated for the wind zone they actually lived in. The previous contractor installed windows that met code for a different zone — one with lower wind speed requirements. On paper, they had impact windows. In reality, they had a gap that voided their coverage. This isn't rare. It's more common than most homeowners in South Florida realize.

**Replace with:**
> A family in Tampa paid $28,000 for impact windows from another company. About three years later, that installer had closed its doors. When the family filed a claim, there were no records anyone could verify, and the claim was denied. The windows were good. What was missing was the proof behind them. This happens more often than most homeowners in {{contact.city}} realize.

The replacement also fixes two other findings in this email. It drops "voided their
coverage", which predicted an outcome, and it replaces "South Florida" as the default
market.

### E.4 Canvassing & In-Person Bridge — Email 2
Step `b9f527d4`. Subject: "What we noticed walking your neighborhood".

**Find:**
> Last hurricane season, a family in Broward thought their impact windows had them covered. They filed a $45,000 claim and it was denied. The windows were rated for the wrong wind zone. Installed by a licensed contractor. Looked right. Passed the eye test. But the paperwork didn't match.

**Replace with:**
> A family in Tampa paid $28,000 for impact windows from another company. Looked right. Passed the eye test. About three years later, that installer had closed its doors, and when the family filed a claim, there were no records anyone could verify. The claim was denied. The windows were never the problem. The paperwork was.

This email has one more finding that is not part of the ruling. It is sent as "Mark from
Reece" before any appointment. Pre-appointment emails come from Randy.

---

## 2. The $3,800 family mixed with a city (needs Mark's ruling)

This is **not** the $45,000 problem. The first version of the review wrongly grouped it
with that problem. $3,800 belongs to the P3 family. P3 never has a city and never
appears next to Tampa. The proposed fixes below wait for your ruling.

| Workflow · message | Find | Proposed |
|---|---|---|
| S2.1 Email 4 (`2b92b511`) | "Here's what a family in Tampa found on the other side of them." | "Here's what one family found on the other side of them." (This makes the story P3.) |
| S2.2 Email 4 subject | "One Tampa family found $3,800 a year hiding in their openings" | "One family found $3,800 a year hiding in their openings" |
| S2.2 Email 4 AI prompt (`e22a5c9b`) | "Tell the Tampa $28K Family story per the parable bank." | "Tell the $3,800 Premium-Drop Family story (P3) per the parable bank. No city. Past tense. Their result was based on their filing." |
| S2.5 Email 2 (`a4f0a559`) | "The change order added $3,800 to the project" | "The change order added thousands to the project". Only keep a dollar figure if it is from a real job, and never $3,800. |

---

## 3. Remove the referral ask outside C.5 (ruled)

**Ruling:** C.5 Referral Overlay owns the referral ask. Make these edits before the Test
Contact gate opens on C.2 and C.6.

### C.2 Post-Install Check-In — Email 2
Step `94e43544`. Subject: "After a month, here's what most of our customers tell me".

**Delete** these two paragraphs, which run from "One more thing." to just before "Talk soon,":
> One more thing. You've probably already had someone ask about your windows. That's how most of our projects actually start. Not from ads. From neighbors who noticed. If someone in your life has been thinking about it, or you can tell they're nervous about the next storm, just send them our way. We'll take care of them the same way we took care of you.
>
> You know what the experience is like now. That's worth more than anything I could say.

The email then ends on the warranty line ("…we're a reply away."), followed by "Talk soon,"
and Randy's signature.

### C.6 Review Amplifier — SMS 2 and SMS 3
Steps `c001a89f` (day 2) and `6aa8b216` (day 5).

Both messages are nothing but a referral ask, so removing the ask leaves nothing to send.
**Switch both steps off in GHL** ("turn off this action"), or delete them. SMS 1, the review
ask, stays.

---

## 4. E.5 — fix two lines, then switch its messages back on (ruled)

**What happened:** all 7 message steps have been switched off in GHL since May 21
(version 38). The 7 `sent:e.5-*` tag steps were switched off on June 17 (version 46).
Step 28, the conditional wait, is unchanged in every saved version. Make the two edits
below, then switch the 7 messages and their 7 tag steps back on.

Also on June 17: 5 "assign user" steps were removed, the email sender name changed from
"Reece" to "Randy Reece", and a sending number (+1 954-280-8890) was added. Check that
these were intended.

### E.5 Email 1 — step `4ad069b4`, "The one number on your windows"
**Find** (the second of the four arrow lines):
> → what your insurance company is willing to cover

**Replace with:**
> → whether the records on your home match what's actually installed

### E.5 Email 2 — step `ea6486b4`, "Where the mismatch usually shows up"
**Find:**
> If your home is rated right for your zone, you may qualify for the credit. If it's not, the credit can be reduced or denied.

**Replace with:**
> What matters is whether the rating on record matches the windows actually on your home.

---

## 5. S1.1-legacy — no copy changes (ruled)

`2094441c` is retired. Mark will unpublish it in GHL. Its copy is not to be rewritten.
