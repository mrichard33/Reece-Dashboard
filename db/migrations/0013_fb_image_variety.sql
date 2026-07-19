-- Social Content Engine — image variety fix (migration 0013).
-- Apply in the LP Supabase project (same project as 0001–0012). Idempotent and additive.
--
-- WHY: generated post images collapsed into one repeated scene (a worried homeowner by a
-- window). Two causes: (1) the image prompt template was never wired into the n8n image
-- nodes, so gpt-image-1 received a bare concept with no style/mood guidance; (2) nothing
-- rotated the visual scene — copy rotates (archetype/subtopic) but imagery did not.
--
-- WHAT: image v3 and generator v3 add a rotating {{visual_angle}} (picked per date by the
-- n8n workflows), a {{recent_scenes}} avoid-list (last posts' image concepts), and a hard
-- mood guardrail (bright/confident; people never sad, worried, or distressed). The paired
-- n8n change (WF1 / WF-Batch / WF3) substitutes these placeholders and finally sends the
-- resolved image template to the image model.
--
-- Prompt rows are keyed unique(name, version); only one version stays active per name.
-- Re-running this file is a no-op.

-- ─────────────────────────────────────────────────────────────────
-- 1. Deactivate superseded versions (only v3 stays active per name)
-- ─────────────────────────────────────────────────────────────────
update public.fb_messaging_prompts set is_active = false
  where name in ('generator','image') and version < 3;

-- ─────────────────────────────────────────────────────────────────
-- 2. image v3 — producer image-prompt builder with visual-angle rotation,
--    recent-scene avoidance and a positive-mood guardrail
-- ─────────────────────────────────────────────────────────────────
insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('image', $prompt$Turn this concept into ONE image-generation prompt for a clean, scroll-stopping Facebook/Instagram visual that supports the post. The caption carries the words, so the image must contain NO text.

Concept: {{image_concept}}

VISUAL ANGLE (today's rotation — build the scene around this): {{visual_angle}}

SPECS: photoreal; Florida-home context where relevant; a single clear focal point; rule-of-thirds composition; natural light; a bright, confident, aspirational mood; leave some negative space. If people appear, they look relaxed, happy, or quietly proud — NEVER sad, worried, anxious, or distressed. NO text, NO logos, NO watermarks anywhere in the frame. Where a color treatment is implied, lean on the Reece palette (Reece Red #ED1F24, Deep Navy #0D2240) in the environment itself, never as overlaid graphics.

VARIETY (hard rule): the scene must NOT read as a repeat of recent posts. Recent images showed: {{recent_scenes}}. Choose a different subject, camera distance, or setting than those.

This image is also the seed frame for any video version of this post, so compose it so that subtle motion (light through glass, a curtain, palm movement, a slow push-in) would read naturally.

If regenerating after rejection, also honor: {{image_feedback}}

Return ONLY the final image-prompt string. No quotes, no preamble.$prompt$, 3, true)
on conflict (name, version) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 3. generator v3 — identical to v2 except: the brief carries today's visual
--    angle, and image_concept must vary the scene and keep people positive
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
- Visual angle for today (use when Image direction is empty): {{visual_angle}}
- Video direction (empty if image-only): {{video_concept}}
- CTA: {{recommended_cta}}

MESSAGE BANK (use only what fits today's angle): {{message_bank}}

WRITE THE POST
1) HOOK (line 1): a scroll-stopping opener — vary it (a question, a bold claim, a mini-story open, a surprising fact). NEVER open with the brand name.
2) BODY: ONE idea only. Teach it or tell it. If archetype=story, use the Epiphany Bridge: backstory -> the wall they hit -> the epiphany -> the new result. Frame Reece as a NEW category (Documented Home Protection), never as a better or cheaper window. Ladder to the Big Domino: "Protection is not what you install. It's what you can prove." Weave a locked line from the style guide verbatim only if it fits naturally.
3) CLOSE: exactly one engagement question.

STAGE DISCIPLINE
- Stage #1 (Indifferent) or #2 (Curious): make the problem real, or reveal a secret/mistake/debunk an alternative. NO positioning, NO pitch, NO booking ask. Educate and let the value sell. Most posts live here.
- Stage #3 (Comparing): light positioning is allowed (relevant / superior / unique via the four pillars). Do not re-teach the basics.
- Never write stage #4 or #5 content for the feed.

CTA PLACEMENT (links suppress reach in the body — links live ONLY in first_comment)
- Soft tier: the engagement question IS the only ask. Leave first_comment empty, or a one-line nudge with no link.
- Medium tier: put the link CTA in first_comment — the Home Risk Report ("find your home's weakest point") or the estimate calculator ("get a price with no sales rep"). Never an in-home visit.
- Hard tier (warm/retargeted only): put the Protection Profile Review (15-minute phone call) link in first_comment.

CONCEPTS (keep them coherent with the final copy)
- Finalize image_concept: a concrete photoreal scene with NO text/logos that supports this exact post. If the brief's Image direction is empty, build the scene around today's visual angle. VARY the scene from post to post — do not default to a person standing at a window. Any people in the concept look relaxed, happy, or quietly proud — never sad, worried, or distressed.
- If media_type=video, finalize video_concept: the same scene/subject with subtle, brand-safe motion (or the mascot/spokesperson treatment the brief calls for). If media_type=image, return video_concept as "".

LENGTH & STYLE: 80-150 words. Short paragraphs. Plain human language. No emojis unless one is genuinely natural. All company-voice and compliance rules from the style guide apply.

REGENERATION (only when supplied):
- If rejection_feedback is provided: "The previous draft was rejected for: {{rejection_feedback}}. Do not repeat that."
- If kept_image_concept is provided: "An approved image already exists showing {{kept_image_concept}}; the new copy and concepts must stay consistent with it."

Return ONLY valid JSON, no markdown, no preamble:
{"post_body":"","first_comment":"","image_concept":"","video_concept":"","pillar":"","archetype":"","subtopic":"","buyer_stage":""}$prompt$, 3, true)
on conflict (name, version) do nothing;
