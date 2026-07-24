-- Social Content Engine — enforced visual variety + one-glance topic match (migration 0016).
-- Apply in the LP Supabase project (same project as 0001–0015). Idempotent and additive.
--
-- WHY: a visual audit of the full upcoming queue showed every render collapsing into one
-- look — dim warm-amber golden-hour light, moody orange-brown grade, usually a lone
-- contemplative person — regardless of concept. Causes: the template's "like a frame from
-- a film" + warm-amber-first palette language, and gpt-image-1's own golden-hour bias.
-- Several images also failed a one-glance topic test (abstract topics rendered as a
-- generic person gazing).
--
-- WHAT: image v7 makes variety mechanical and match literal:
--  * the workflows now APPEND an assigned time-of-day and palette to {{visual_angle}}
--    (deterministic rotations, amber deliberately rare) — the template must apply them
--    faithfully and must NOT default to warm golden-hour amber;
--  * ONE-GLANCE TEST: a stranger must be able to guess the post's topic from the image;
--    abstract topics need a concrete visual anchor;
--  * bright, airy, optimistic light is the default; the dim-amber-lone-person look joins
--    the BANNED list; people vary (pairs, families, no one) and never look weary.
--
-- Prompt rows are keyed unique(name, version); only one version stays active per name.
-- Re-running this file is a no-op.

insert into public.fb_messaging_prompts (name, body, version, is_active)
values ('image', $prompt$Turn this into ONE image-generation prompt for a scroll-stopping Facebook visual that supports the post. The caption carries the words, so the image must contain NO text, NO logos, NO watermarks.

Concept: {{image_concept}}

The post copy this image will run with:
{{post_body}}

HIGHEST PRIORITY — rejection feedback: {{image_feedback}}. If feedback is present, obey it over everything below.

MATCH THE POST (hard rule): the image must visibly be about the same thing the copy is about — subject, moment, and mood must belong to THIS exact post. ONE-GLANCE TEST: a stranger seeing only the image should be able to guess what the post is about. If the topic is abstract (insurance credits, documentation, resale value, building codes), anchor it with a concrete visual — an inspection moment, paperwork WITH the home visible, a measurable detail — never a generic person gazing into light. If anything below conflicts with matching the post, matching the post wins.

VISUAL STYLING (assigned for this post — apply faithfully): {{visual_angle}}
The assigned time-of-day and palette are the single most important variety rule: consecutive posts must never share the same color grade. Do NOT default to warm golden-hour amber light — if the assigned palette is not warm, there must be no orange cast at all. Default to BRIGHT, airy, optimistic light; go dim or dramatic only when the copy demands it. Skip the assigned styling only where it truly fights the post's subject.

PEOPLE AND EMOTION. The viewer should feel something in the first half-second: relief, warmth, pride, ease, capability. Vary WHO is in frame post to post — a couple, a family, kids, neighbors, a tradesperson at work, or nobody at all with the room implying its people; do NOT default to one lone contemplative figure. Expressions are warm, capable, and at ease — never sad, worried, weary, somber, or defeated, even in storm scenes. Windows and the home are usually the setting, not the subject — unless the post itself is about the product detail, in which case show that detail clearly.

BANNED — never produce these (overused in this feed):
- Dim amber golden-hour interior with a lone contemplative person — the feed is saturated with this exact look
- The same moody orange-brown color grade as recent posts
- A hand touching, pressing, or resting on window glass
- Split-screen, side-by-side, or before/after comparison layouts
- A lone window or door as the main subject with nothing happening
- Showroom, catalog, or floating-product looks
- Generic bright-blue-sky house exterior with no story

MATCH THE COPY'S EMOTIONAL JOB (read it from the concept and the copy):
- Story / personal moment -> candid and intimate: one or two people mid-moment, honest expressions
- Tip / how-to / educational -> documentary realism: someone DOING the thing (checking, measuring, organizing, comparing), hands busy with the task
- Myth-bust / surprising fact -> make the surprising truth visible and concrete
- Community / local pride -> warmth and place: neighbors, porches, streets, real Florida texture
- Seasonal / weather -> atmosphere as the star around people who feel safe

MAKE EVERY POST LOOK DIFFERENT — vary the EXECUTION, never the SUBJECT:
- WHO: young family, retired couple, single mom, kids, grandparents, a dog, neighbors, a tradesperson, or an empty lived-in room
- WHERE: kitchen, child's bedroom, lanai, porch, driveway, garden, neighborhood street, coastline
- CAMERA: wide establishing / medium candid / intimate close-up; eye level, low angle, through-a-doorway, occasionally aerial
- TIME & PALETTE: exactly as assigned in the visual styling line above
- RECENT POSTS' IMAGES SHOWED: {{recent_scenes}} — do NOT repeat those subjects, settings, compositions, or color grades.

Always: photoreal, clean editorial photography with true-to-life color — not moody cinema grading, not stock-photo gloss; Florida authenticity in vegetation, architecture, and light; ONE clear focal point; intentional negative space; composed cleanly for the social feed frame; faces natural and believable.
Return ONLY the final image-prompt string. No quotes, no preamble.$prompt$, 7, true)
on conflict (name, version) do nothing;

update public.fb_messaging_prompts set is_active = false
  where name = 'image' and version < 7;
