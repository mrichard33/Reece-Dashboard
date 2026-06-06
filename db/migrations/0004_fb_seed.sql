-- Automated Facebook Content Engine — seed data (idempotent; safe to re-run).
-- Seeds: 1 Message Bank row (§7.1), 40 subtopics (§7.2), 6 prompt templates (§6.1–6.6).
-- Run after 0003_fb_content_engine.sql in the LP Supabase project.

-- ─────────────────────────────────────────────────────────────────
-- 1. Message Bank (single active starter row)
-- ─────────────────────────────────────────────────────────────────

insert into public.fb_message_bank (variables)
select $json$
{
  "audience": "Florida homeowners (St. Petersburg, Fort Myers, coastal and inland), ages 35-70, single-family homeowners concerned about storms, insurance costs, comfort, and security. Mix of insurance-driven and safety/comfort-driven buyers.",
  "problem": "Existing windows/doors are vulnerable to storms, forced entry, heat/energy loss, outside noise, and UV fading; patch solutions (shutters, plywood, film) are inconvenient, incomplete, and undocumented for insurance.",
  "promise": "Permanent, documented, impact-rated protection that makes a home safer, quieter, cooler, and more secure, with the paperwork (NOA/wind-mitigation) that supports insurance benefits, installed by a company doing this since 1972.",
  "myths": [
    {"text":"Hurricane shutters protect a home as well as impact windows.","pillars":["storm"]},
    {"text":"Impact windows are unaffordable and not worth the cost.","pillars":["insurance","value","energy"]},
    {"text":"My current windows are fine because they survived past storms.","pillars":["storm"]},
    {"text":"All impact windows are basically the same.","pillars":["storm","security"]},
    {"text":"You only need impact protection right on the coast.","pillars":["storm","security"]}
  ],
  "mistakes": [
    {"text":"Waiting until a storm is in the forecast to act, when installers are booked.","pillars":["storm"]},
    {"text":"Buying on price alone and getting non-impact-rated or poorly installed product.","pillars":["storm","security"]},
    {"text":"Relying on plywood/shutters and skipping the documentation insurers reward.","pillars":["insurance"]},
    {"text":"Not getting the wind-mitigation paperwork or NOA after install.","pillars":["insurance"]},
    {"text":"Choosing an installer with no permit, warranty, or track record.","pillars":["value"]}
  ],
  "secrets": [
    {"text":"Properly documented impact windows can qualify for wind-mitigation insurance credits.","pillars":["insurance"]},
    {"text":"Laminated impact glass also dramatically cuts outside noise and blocks UV.","pillars":["noise","uv"]},
    {"text":"The off-season is the smart time to buy, for better availability and pricing.","pillars":["value","insurance"]},
    {"text":"Impact glass resists forced entry, adding everyday security, not just storm protection.","pillars":["security"]},
    {"text":"The Notice of Acceptance (NOA) is what proves the protection; get it in writing.","pillars":["insurance","storm"]}
  ],
  "alternatives": ["hurricane shutters","plywood boarding","security/safety window film","do nothing / board up later","cheap non-impact replacement windows"],
  "solution_type": "Professionally installed, impact-rated (NOA-approved) windows and doors as a documented, permanent home-protection system.",
  "positioning": "Reece Windows & Doors: protecting Florida homes since 1972. Documented Home Protection: not just installed, but documented for safety and insurance. Local, permitted, warrantied.",
  "offer": "Free in-home assessment and documented-protection quote, plus the Documented Home Protection guide.",
  "external_objections": {
    "items": ["price/cost","installation disruption","my windows are fine","skepticism of contractors","uncertainty about insurance payback"],
    "internal_dialogue": ["That sounds expensive, I bet it's tens of thousands.","I don't want my house torn up for weeks.","Will I really save anything, or is that a sales pitch?"]
  },
  "internal_objections": {
    "items": ["procrastination","decision fatigue/overwhelm","distrust of being overcharged","do I deserve to spend this","fear of choosing wrong"],
    "internal_dialogue": ["I'll deal with the windows later, nothing's happened yet.","There are too many options, I don't know who to trust.","What if I pick the wrong company and regret it?"]
  }
}
$json$::jsonb
where not exists (select 1 from public.fb_message_bank);

-- ─────────────────────────────────────────────────────────────────
-- 2. Subtopic bank (40 rows: 8 pillars × 5), active seeds
-- ─────────────────────────────────────────────────────────────────

insert into public.fb_subtopics (subtopic, pillar, answers_question, source, status)
select v.subtopic, v.pillar, v.answers_question, 'seed', 'active'
from (values
  ('What "impact-rated" really means (NOA explained)', 'storm', 'What does impact-rated actually mean and how do I verify it?'),
  ('Shutters vs impact windows in a Cat 3+', 'storm', 'Will shutters protect me as well as impact windows in a major hurricane?'),
  ('Why plywood is a false sense of security', 'storm', 'Is boarding up with plywood really enough to protect my home?'),
  ('The 48-hour pre-storm scramble and why it fails', 'storm', 'Can I just prepare when a storm is in the forecast?'),
  ('How laminated impact glass behaves when something hits it', 'storm', 'What actually happens when debris hits impact glass?'),
  ('Why your home is louder than it should be', 'noise', 'Why is so much outside noise getting into my home?'),
  ('Sleeping better near a busy road', 'noise', 'Can new windows help me sleep near a busy road?'),
  ('STC ratings explained for homeowners', 'noise', 'What does an STC sound rating mean for me?'),
  ('The "I didn''t realize how loud it was" moment', 'noise', 'How much quieter will my home really feel?'),
  ('Quiet lanai and poolside living', 'noise', 'Can I make my lanai and pool area quieter?'),
  ('Why your AC never catches up in summer', 'energy', 'Why can''t my AC keep up in the Florida summer?'),
  ('Low-E coatings explained simply', 'energy', 'What is a Low-E coating and why does it matter?'),
  ('The real math on energy savings over time', 'energy', 'Do impact windows actually save me money on energy?'),
  ('No more hot rooms: comfort consistency', 'energy', 'Why are some rooms always hotter than others?'),
  ('Energy and UV, the double benefit', 'energy', 'How do impact windows help with both energy and fading?'),
  ('Impact glass vs a burglar''s kick or crowbar', 'security', 'Can impact glass stop a break-in attempt?'),
  ('Everyday security you didn''t buy it for', 'security', 'What everyday security do impact windows add?'),
  ('Ground-floor windows and break-in risk', 'security', 'Are my ground-floor windows a break-in risk?'),
  ('Peace of mind when you travel', 'security', 'How do I keep my home secure while I travel?'),
  ('Glass that holds together vs shatters', 'security', 'What is the difference between glass that holds and glass that shatters?'),
  ('Your home as a sanctuary: quiet, cool, safe', 'comfort', 'How do I make my home feel like a true sanctuary?'),
  ('The "whole house feels different" effect', 'comfort', 'Will new windows really change how my whole house feels?'),
  ('Daylight without the heat and fade', 'comfort', 'Can I get natural light without the heat and fading?'),
  ('The comfort you feel the first night', 'comfort', 'What will I notice the first night after install?'),
  ('Small daily comforts that add up', 'comfort', 'What small daily comforts do impact windows bring?'),
  ('What wind-mitigation credits are', 'insurance', 'What are wind-mitigation insurance credits?'),
  ('Why the NOA paperwork matters to your policy', 'insurance', 'Why does my insurer care about the NOA paperwork?'),
  ('How documentation can affect premiums', 'insurance', 'Can documented protection affect my insurance premium?'),
  ('The form your insurer wants after install', 'insurance', 'What form does my insurer want after I install impact windows?'),
  ('Documented protection means a stronger insurance position', 'insurance', 'How does documentation strengthen my insurance position?'),
  ('Why your floors and furniture are fading', 'uv', 'Why are my floors and furniture fading?'),
  ('UV blocking explained', 'uv', 'How do impact windows block UV?'),
  ('Protecting art, rugs, and hardwood', 'uv', 'How do I protect my art, rugs, and hardwood from fading?'),
  ('The window''s role in interior longevity', 'uv', 'How do windows affect how long my interior lasts?'),
  ('Fade and heat share the same culprit', 'uv', 'What causes both fading and heat gain?'),
  ('Impact windows as an equity investment', 'value', 'Are impact windows a good investment in my home?'),
  ('What Florida buyers look for', 'value', 'What do Florida buyers look for in a home?'),
  ('Documented upgrades that show at resale', 'value', 'Which upgrades show their value at resale?'),
  ('Protection that travels with the home', 'value', 'Does this protection add lasting value to my home?'),
  ('Curb appeal plus function', 'value', 'Can new windows improve curb appeal and function together?')
) as v(subtopic, pillar, answers_question)
on conflict (subtopic, pillar) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 3. Prompt templates (§6.1–6.6). {{placeholders}} are filled by n8n at runtime.
-- ─────────────────────────────────────────────────────────────────

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('style_guide', $prompt$You are the voice of Reece Windows & Doors — a Florida impact window & door company protecting homes since 1972. Voice: warm, plain-spoken, confident, protective of homeowners; a trusted local expert, never a hype salesman. You speak to neighbors, not "consumers." Short sentences. Concrete, sensory specifics over adjectives. You educate first and let the value sell. You never fear-monger; you reassure and inform. Core belief everything ladders to (the Big Domino): documented, impact-rated protection is the only real way to protect a Florida home. Movement: "Documented Home Protection." Brand colors for any visuals: Reece Red #ED1F24, Deep Navy #0D2240. Banned: absolute safety guarantees ("hurricane-proof", "100% safe"), specific wind/insurance savings numbers unless explicitly provided, emoji spam, corporate filler.$prompt$, 1, true)
on conflict (name, version) do nothing;

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('generator', $prompt${{style_guide}}
MESSAGE BANK (use only what fits today's angle): {{message_bank}}
TODAY: pillar={{pillar}} · archetype={{archetype}} · subtopic={{subtopic}}
Write ONE Facebook post for our OWNED community (warm audience — write as if they
already know us):
1) HOOK (line 1): a scroll-stopping opener; vary it (question / bold claim /
   mini-story open / surprising fact). Never open with the brand name.
2) BODY: ONE idea only. Teach or tell a story that breaks the archetype's target
   belief. If archetype=story, use the Epiphany Bridge: backstory -> wall ->
   epiphany -> new result.
3) CLOSE: exactly one engagement question. Any link/CTA goes in first_comment,
   NEVER in the body (links in the body suppress reach).
Rules: 80-150 words; short paragraphs; plain human language; no emojis unless one
is natural; ladder to the core belief. COMPLIANCE: no absolute safety guarantees;
no specific wind/insurance-savings numbers unless present in the message bank.
REGENERATION (only when these are supplied):
- If rejection_feedback is provided: "The previous draft was rejected for:
  {{rejection_feedback}}. Do not repeat that."
- If kept_image_concept is provided: "An approved image already exists showing
  {{kept_image_concept}}; the new copy must stay consistent with it."
Return ONLY valid JSON, no markdown, no preamble:
{"post_body":"","first_comment":"","image_concept":"","pillar":"","archetype":"","subtopic":""}$prompt$, 1, true)
on conflict (name, version) do nothing;

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('image', $prompt$Turn this into ONE image-generation prompt for a clean, scroll-stopping Facebook
visual that supports the post. The caption carries the words, so the image must
contain NO text. Concept: {{image_concept}}.
Specs: photoreal; Florida-home context where relevant; a single clear focal point;
rule-of-thirds composition; natural light; bright, trustworthy mood; leave some
negative space; NO text, NO logos, NO watermarks.
If regenerating after rejection, also honor: {{image_feedback}}.
Return ONLY the final image-prompt string. No quotes, no preamble.$prompt$, 1, true)
on conflict (name, version) do nothing;

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('miner', $prompt$Act as Reece's content strategist for Florida impact windows/doors. From these REAL
customer questions and objections:
{{ghl_faq_sample}}
and this season/date context: {{date_context}}
propose 8 fresh Facebook subtopics this audience would engage with. Map each to
exactly one pillar from: {{pillar_list}}. For each, state the customer question it
answers. Avoid anything close to recently used: {{recently_used}}.
These are PROPOSALS for human approval.
Return ONLY a valid JSON array, no markdown:
[{"subtopic":"","pillar":"","answers_question":""}]$prompt$, 1, true)
on conflict (name, version) do nothing;

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('copywriting_research', $prompt$Act as a master direct-response strategist for Reece Windows & Doors (Florida
impact windows/doors, est. 1972, positioning "Documented Home Protection"). Build a
complete message bank for our Florida-homeowner audience. Define, specifically and
concretely:
- AUDIENCE
- PROBLEM (what impact windows/doors solve)
- PROMISE (the transformation/benefit)
- MYTHS: 5 false beliefs the audience holds about the problem or its solution
- MISTAKES: 5 mistakes they make trying to solve it
- SECRETS: 5 lesser-known truths to solving it
- ALTERNATIVES: 5 other solutions they consider (shutters, plywood, film, do-nothing, cheap windows)
- SOLUTION_TYPE
- POSITIONING (what sets Reece apart)
- OFFER (the no-brainer first-touch offer)
- EXTERNAL_OBJECTIONS (about the solution/cost) + 3 internal-dialogue examples
- INTERNAL_OBJECTIONS (about themselves/the decision) + 3 internal-dialogue examples
Tag each myth/mistake/secret/objection with the pillar(s) it serves from:
storm, noise, energy, security, comfort, insurance, uv, value.
COMPLIANCE: do not assert specific wind ratings or insurance-savings numbers.
Return ONLY valid JSON matching those keys.$prompt$, 1, true)
on conflict (name, version) do nothing;

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('strategic_refresh', $prompt$Act as Reece's strategic planning lead. Inputs:
- current message bank: {{message_bank}}
- last quarter's rejection reasons (aggregated): {{rejection_summary}}
- engagement by pillar and by archetype: {{engagement_summary}}
- season ahead: {{season_context}}
Do a brief SWOT + scenario pass for the next quarter of Florida impact-window
content. Then propose: (a) specific message-bank edits, (b) which pillars to
emphasize/de-emphasize and why, (c) prompt/style-guide tweaks that would reduce the
most common rejection reasons. These are PROPOSALS for human approval.
Return ONLY valid JSON:
{"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},
 "message_bank_edits":[],"pillar_emphasis":[],"prompt_tweaks":[]}$prompt$, 1, true)
on conflict (name, version) do nothing;
