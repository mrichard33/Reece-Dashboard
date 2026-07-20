-- Social Content Engine — image/copy match fix (migration 0015).
-- Apply in the LP Supabase project (same project as 0001–0014). Idempotent and additive.
--
-- WHY: after the image-variety work (0013), generated images stopped matching the post
-- copy — a UV-fading post shipped with a storm-sky image, a security post with a generic
-- curb-appeal shot. The rotated {{visual_angle}} was instructed to DICTATE the scene
-- ("build the scene around this"), so the day's angle picked the image subject and the
-- copy's topic lost.
--
-- WHAT: image v6 and generator v6 invert the hierarchy — the post's one idea always
-- picks the SUBJECT of the image; the visual angle is only a styling lens (framing,
-- setting, light, palette) applied where it fits that subject. Variety now governs HOW
-- the subject is shot, never WHAT the subject is. The recent-scenes avoid-list and the
-- positive-mood guardrail are unchanged.
--
-- Prompt rows are keyed unique(name, version); only one version stays active per name.
-- Re-running this file is a no-op.

-- ─────────────────────────────────────────────────────────────────
-- 1. image v6 — match-the-post is a hard rule above angle and variety
-- ─────────────────────────────────────────────────────────────────
insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('image', $prompt$Turn this into ONE image-generation prompt for a scroll-stopping Facebook visual that supports the post. The caption carries the words, so the image must contain NO text, NO logos, NO watermarks.

Concept: {{image_concept}}

The post copy this image will run with:
{{post_body}}

HIGHEST PRIORITY — rejection feedback: {{image_feedback}}. If feedback is present, obey it over everything below.

MATCH THE POST (hard rule): the image must visibly be about the same thing the copy is about — subject, moment, and mood must belong to THIS exact post. A reader seeing the image next to the first line of the copy must instantly feel they belong together. If anything below (the visual angle, the variety menus) conflicts with matching the post, matching the post wins.

VISUAL ANGLE (styling suggestion from today's rotation — use it for framing, setting, and light ONLY where it fits the post's subject; skip it entirely when it doesn't): {{visual_angle}}

PEOPLE AND EMOTION FIRST. The viewer should feel something in the first half-second: relief, warmth, awe, protectiveness, pride, calm-during-chaos. Default to a HUMAN MOMENT — a specific person or family in a specific Florida moment — with the emotion readable in a face, posture, or gesture. Windows and the home are the SETTING that makes the emotion possible, almost never the subject. Only if the concept is genuinely about craft or weather may the frame be human-free — and then atmosphere must carry the mood (storm light, dusk glow, rain texture), never a clean product look. Never depict people looking sad, worried, anxious, or distressed — even in storm scenes the emotional register is positive: safe, proud, relieved, calm.

BANNED — never produce these (overused in this feed):
- A hand touching, pressing, or resting on window glass
- Split-screen, side-by-side, or before/after comparison layouts
- A lone window or door as the main subject with nothing happening
- Showroom, catalog, or floating-product looks
- Generic bright-blue-sky house exterior with no story

MATCH THE COPY'S EMOTIONAL JOB (read it from the concept and the copy):
- Story / personal moment -> cinematic and intimate: one person or family mid-moment, shallow depth of field, honest expressions
- Tip / how-to / educational -> documentary realism: someone DOING the thing (prepping, checking, organizing, helping a neighbor), hands busy with the task — not with glass
- Myth-bust / surprising fact -> visual drama or tension: make the surprising truth visible (storm fury outside while a child sleeps inside; the scale of the sky against one calm home)
- Community / local pride -> warmth and place: neighbors, porches, streets, Gulf light, real Florida texture
- Seasonal / weather -> atmosphere as the star: sky, light, and weather doing the emotional work around people who feel safe

MAKE EVERY POST LOOK DIFFERENT — but vary the EXECUTION, never the SUBJECT. The WHO/WHERE/WHEN/CAMERA/PALETTE choices below must still depict this post's idea:
- WHO: young family, retired couple, single mom, kids, grandparents, a dog at the window, neighbors, or a quiet room that implies its people
- WHERE: kitchen, child's bedroom, lanai, porch, driveway, living room at night, garden, neighborhood street, coastline
- WHEN: golden hour, blue hour, mid-storm, just after the storm, first light, lamplit night
- CAMERA: wide establishing / medium candid / intimate close-up; eye level, low angle, through-a-doorway framing, occasionally aerial
- PALETTE: warm amber, moody teal-and-navy storm tones, soft pastel dawn, deep dusk blues — never the same sunny daylight twice in a row
- RECENT POSTS' IMAGES SHOWED: {{recent_scenes}} — do NOT repeat those subjects, settings, or compositions.

Always: photoreal, like a frame from a film — not stock photography; Florida authenticity in vegetation, architecture, and light; ONE clear focal point; intentional negative space; composed cleanly for the social feed frame; faces natural and believable.
Return ONLY the final image-prompt string. No quotes, no preamble.$prompt$, 6, true)
on conflict (name, version) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 2. generator v6 — image_concept visualizes THIS post; the angle is a lens
-- ─────────────────────────────────────────────────────────────────
insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('generator', $prompt${{style_guide}}

You are writing ONE social post for Reece's OWNED community (a warm audience — write as if they already know us). Use the approved Content Brief below; do not re-strategize it.

BRIEF
- Pillar: {{pillar}}
- Buyer stage: {{buyer_stage}} (see stage discipline below)
- Objective: {{buyer_objective}}
- Caption direction (angle/hook intent — not the final words): {{caption_direction}}
- Subtopic: {{subtopic}}  ·  Archetype: {{archetype}}
- Media type: {{media_type}}
- Image direction: {{image_concept}}
- Visual styling lens for today's image (framing/setting/light inspiration — never the subject): {{visual_angle}}
- Video direction (empty if image-only): {{video_concept}}
- CTA: {{recommended_cta}}

MESSAGE BANK (use only what fits today's angle): {{message_bank}}

WRITE THE POST
1) HOOK (line 1): a scroll-stopping opener — vary it (a question, a bold claim, a mini-story open, a surprising fact). NEVER open with the brand name.
2) BODY: ONE idea only. Teach it or tell it. If archetype=story, use the Epiphany Bridge: backstory -> the wall they hit -> the epiphany -> the new result. Frame Reece as a NEW category (Documented Home Protection), never as a better or cheaper window. Ladder to the Big Domino: "Protection is not what you install. It's what you can prove." Weave a locked line from the style guide verbatim only if it fits naturally.
3) CLOSE: exactly one engagement question — make it specific and easy to answer from someone's own home or experience in one short sentence (an opinion, a memory, a "which one would you pick"), never abstract. Never use engagement-bait mechanics Facebook demotes: no "comment YES", no "tag someone", no "like if", no "share this".

STAGE DISCIPLINE
- Stage #1 (Indifferent) or #2 (Curious): make the problem real, or reveal a secret/mistake/debunk an alternative. NO positioning, NO pitch, NO booking ask. Educate and let the value sell. Most posts live here.
- Stage #3 (Comparing): light positioning is allowed (relevant / superior / unique via the four pillars). Do not re-teach the basics.
- Never write stage #4 or #5 content for the feed.

CTA PLACEMENT (links suppress reach in the body — links live ONLY in first_comment)
first_comment is NEVER empty — every post ships with a conversation-starter comment in the company voice. It seeds the thread and makes replying feel easy; it never repeats or summarizes the post body, and it obeys every style-guide and engagement-bait rule above.
- Soft tier: the engagement question IS the only ask. first_comment kicks off the replies: share the company's own answer to the closing question, add one bonus detail or myth-flip that rewards opening the comments, or invite a specific easy share. No link.
- Medium tier: put the link CTA in first_comment — the Home Risk Report ("find your home's weakest point") or the estimate calculator ("get a price with no sales rep") — plus one short reply-inviting line before the link. Never an in-home visit.
- Hard tier (warm/retargeted only): put the Protection Profile Review (15-minute phone call) link in first_comment, plus one short reply-inviting line before the link.

CONCEPTS (keep them coherent with the final copy)
- If Media type is text: this post ships with NO image at all — make the hook and short, punchy line breaks carry the visual weight, and return image_concept as "" and video_concept as "".
- Otherwise, finalize image_concept: a concrete photoreal scene that VISUALIZES THIS POST — the post's one idea always picks the SUBJECT of the scene, and a reader must see the image and the hook together and feel they belong to each other. Today's visual styling lens may shape the framing, setting, or light ONLY where it fits that subject; if it conflicts with the post's subject, the subject wins and the lens is ignored. Never attach an unrelated-but-pretty scene. NO text/logos in the scene. Vary the execution from post to post (people, rooms, time of day, camera) — and any people in the concept look relaxed, happy, or quietly proud — never sad, worried, or distressed.
- If media_type=video, finalize video_concept: the same scene/subject with subtle, brand-safe motion (or the mascot/spokesperson treatment the brief calls for). If media_type=image, return video_concept as "".

LENGTH & STYLE: 80-150 words. Short paragraphs. Plain human language. No emojis unless one is genuinely natural. All company-voice and compliance rules from the style guide apply.

REGENERATION (only when supplied):
- If rejection_feedback is provided: "The previous draft was rejected for: {{rejection_feedback}}. Do not repeat that."
- If kept_image_concept is provided: "An approved image already exists showing {{kept_image_concept}}; the new copy and concepts must stay consistent with it."

Return ONLY valid JSON, no markdown, no preamble:
{"post_body":"","first_comment":"","image_concept":"","video_concept":"","pillar":"","archetype":"","subtopic":"","buyer_stage":""}$prompt$, 6, true)
on conflict (name, version) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 3. Exactly one active version per name
-- ─────────────────────────────────────────────────────────────────
update public.fb_messaging_prompts set is_active = false
  where name = 'image' and version < 6;
update public.fb_messaging_prompts set is_active = false
  where name = 'generator' and version < 6;
