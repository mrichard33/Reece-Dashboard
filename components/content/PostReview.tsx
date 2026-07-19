"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Pencil,
  SkipForward,
  Send,
  RefreshCw,
  CalendarClock,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Working } from "@/components/ui/Working";
import { Badge } from "@/components/ui/Badge";
import {
  FB_STATUS_META,
  COMPONENT_STATUS_META,
  MEDIA_TYPE_META,
  TARGET_META,
  COPY_REASON_CODES,
  IMAGE_REASON_CODES,
  VIDEO_REASON_CODES,
  pillarLabel,
  pillarTone,
  archetypeLabel,
  formatPostTime,
} from "@/components/content/meta";
import {
  approveCopy,
  approveImage,
  approveVideo,
  rejectComponent,
  editPost,
  skipPost,
  markPosted,
  generateNow,
  makeTextOnly,
  reschedulePost,
  setPostTime,
} from "@/lib/actions/content";
import { deletePost } from "@/lib/actions/deletePost";
import type { FbPost, FbComponent, FbReasonCode } from "@/lib/supabase/types";

export function PostReview({
  post,
  isExecutive,
  defaultPostTime,
}: {
  post: FbPost;
  isExecutive: boolean;
  /** Settings default post time ("HH:MM" Eastern), or null. Drives the badge for
   * a post with no per-post scheduled_time. */
  defaultPostTime?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.post_body ?? "");
  const [firstComment, setFirstComment] = useState(post.first_comment ?? "");
  const [permalink, setPermalink] = useState("");
  const [moveDate, setMoveDate] = useState(post.scheduled_date);
  // scheduled_time is stored "HH:MM[:SS]"; the native time input wants "HH:MM".
  const currentTime = post.scheduled_time ? post.scheduled_time.slice(0, 5) : "";
  const [moveTime, setMoveTime] = useState(currentTime);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isVideo = post.media_type === "video";
  const isText = post.media_type === "text";
  // Media choice for the "Generate Now" regeneration: auto = WF1's settings-driven mix.
  const [genMedia, setGenMedia] = useState<"auto" | "image" | "text">("auto");

  // Scheduling badge: a set time reads "Posts at 9:00 AM ET", and once the post is
  // approved but the publish instant is still in the future it doubles as the queue
  // indicator ("Scheduled — …"). With no per-post time, the row inherits the settings
  // default ("Posts at default (9:00 AM ET)") if one exists, else publishes on approval.
  const timeLabel = formatPostTime(post.scheduled_time);
  const defaultTimeLabel = formatPostTime(defaultPostTime);
  const isQueued =
    post.status === "approved" && !!post.publish_at && new Date(post.publish_at) > new Date();
  // The Page leg of a target='both' post has gone out, but the human Group leg hasn't —
  // the row stays 'approved' until "Mark Posted" records the Group leg.
  const pageLegDone =
    post.target === "both" && !!post.page_posted_at && post.status === "approved";

  // Regen in flight: rejectComponent fires WF3 and returns immediately (WF3 responds
  // right after its secret check, then regenerates in the background — ~10s for copy,
  // ~60–90s when an image renders at quality:high). The component sits at 'rejected'
  // until WF3 flips it back to 'pending' with the new draft, so while any component
  // is 'rejected' (and we're not at the manual cap) poll the server for fresh props.
  // Without this the page refreshes BEFORE the regen finishes and the old draft just
  // sits there looking broken. 5-minute safety cutoff in case WF3 dies mid-run.
  const regenInFlight =
    !post.needs_manual &&
    (post.copy_status === "rejected" ||
      post.image_status === "rejected" ||
      post.video_status === "rejected");
  useEffect(() => {
    if (!regenInFlight) return;
    const interval = setInterval(() => router.refresh(), 8_000);
    const cutoff = setTimeout(() => clearInterval(interval), 5 * 60_000);
    return () => {
      clearInterval(interval);
      clearTimeout(cutoff);
    };
  }, [regenInFlight, router]);

  // Only the clicked button shows a spinner (pending is component-wide).
  const busy = (key: string) => pending && activeKey === key;

  // pollSeconds > 0 keeps refreshing after the action returns — used for background
  // work (draft generation runs in n8n after the webhook answers { queued: true }).
  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    pollSeconds = 0,
  ) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
      else {
        if (res.error) setMsg({ tone: "info", text: res.error });
        // The server re-fetch updates the calendar/drawer from fresh props.
        router.refresh();
        for (let i = 0; i < Math.ceil(pollSeconds / 5); i++) {
          await new Promise((r) => setTimeout(r, 5000));
          router.refresh();
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={FB_STATUS_META[post.status].tone}>{FB_STATUS_META[post.status].label}</Badge>
        <Badge tone={TARGET_META[post.target].tone}>{TARGET_META[post.target].label}</Badge>
        {isVideo && <Badge tone={MEDIA_TYPE_META.video.tone}>{MEDIA_TYPE_META.video.label}</Badge>}
        {isText && <Badge tone={MEDIA_TYPE_META.text.tone}>{MEDIA_TYPE_META.text.label}</Badge>}
        {post.pillar && <Badge tone={pillarTone(post.pillar)}>{pillarLabel(post.pillar)}</Badge>}
        {post.archetype && <Badge tone="slate">{archetypeLabel(post.archetype)}</Badge>}
        {timeLabel ? (
          <Badge tone={isQueued ? "sky" : "slate"}>
            {isQueued ? `Scheduled — ${timeLabel}` : `Posts at ${timeLabel}`}
          </Badge>
        ) : defaultTimeLabel ? (
          <Badge tone="slate">Posts at default ({defaultTimeLabel})</Badge>
        ) : (
          <Badge tone="slate">Posts on approval</Badge>
        )}
        {pageLegDone && <Badge tone="emerald">Page leg posted ✓</Badge>}
        {post.revision > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <RefreshCw className="h-3 w-3" /> regenerated ×{post.revision}
          </span>
        )}
      </div>

      {post.needs_manual && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Regeneration cap reached — write this post by hand below, then approve.
        </div>
      )}

      {regenInFlight && (
        <div className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
          <Working label="Regenerating in the background — the new draft appears here automatically (~10s for copy, ~1–2 min when an image is rendering)" />
        </div>
      )}

      {/* COPY */}
      <ComponentBlock
        title="Copy"
        status={post.copy_status}
        reasonCodes={COPY_REASON_CODES}
        disabled={pending}
        approving={busy("approve-copy")}
        rejecting={busy("reject-copy")}
        regenInFlight={post.copy_status === "rejected" && !post.needs_manual}
        isExecutive={isExecutive}
        onApprove={() => run("approve-copy", () => approveCopy(post.id))}
        onReject={(code, text) => run("reject-copy", () => rejectComponent(post.id, "copy", code, text))}
      >
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Post body"
            />
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              rows={2}
              className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="First comment (link / CTA)"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run("edit", async () => {
                    const res = await editPost(post.id, {
                      post_body: body,
                      first_comment: firstComment,
                    });
                    if (res.ok) setEditing(false);
                    return res;
                  })
                }
              >
                {busy("edit") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {post.post_body || <span className="text-slate-400">No copy yet.</span>}
            </p>
            {post.first_comment && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
                <span className="font-medium">First comment:</span> {post.first_comment}
              </p>
            )}
          </>
        )}
      </ComponentBlock>

      {/* IMAGE (hidden for text-only posts — they ship with no image and gate on copy alone) */}
      {!isText && (
        <ComponentBlock
          title="Image"
          status={post.image_status}
          reasonCodes={IMAGE_REASON_CODES}
          disabled={pending}
          approving={busy("approve-image")}
          rejecting={busy("reject-image")}
          regenInFlight={post.image_status === "rejected" && !post.needs_manual}
          isExecutive={isExecutive}
          onApprove={() => run("approve-image", () => approveImage(post.id))}
          onReject={(code, text) => run("reject-image", () => rejectComponent(post.id, "image", code, text))}
        >
          {post.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.image_url}
              alt={post.image_concept ?? "Post image"}
              className="max-h-64 w-full rounded-md object-cover"
            />
          ) : (
            <p className="text-sm text-slate-400">No image yet.</p>
          )}
          {post.image_concept && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-medium">Concept:</span> {post.image_concept}
            </p>
          )}
          {isExecutive && post.status !== "posted" && (
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run("make-text", () => makeTextOnly(post.id))}
              >
                {busy("make-text") ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}{" "}
                Remove image — make text-only
              </Button>
            </div>
          )}
        </ComponentBlock>
      )}

      {/* VIDEO (video posts only — the image is the seed frame) */}
      {isVideo && (
        <ComponentBlock
          title="Video"
          status={post.video_status ?? "pending"}
          reasonCodes={VIDEO_REASON_CODES}
          disabled={pending}
          approving={busy("approve-video")}
          rejecting={busy("reject-video")}
          regenInFlight={post.video_status === "rejected" && !post.needs_manual}
          isExecutive={isExecutive}
          onApprove={() => run("approve-video", () => approveVideo(post.id))}
          onReject={(code, text) => run("reject-video", () => rejectComponent(post.id, "video", code, text))}
        >
          {post.video_url ? (
            <video
              src={post.video_url}
              controls
              className="max-h-64 w-full rounded-md bg-black object-contain"
            />
          ) : (
            <p className="text-sm text-slate-400">No video yet.</p>
          )}
          {post.video_concept && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-medium">Concept:</span> {post.video_concept}
            </p>
          )}
        </ComponentBlock>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {isExecutive && (
          <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" /> {editing ? "Editing…" : "Edit"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("skip", () => skipPost(post.id))}>
              {busy("skip") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />} Skip
            </Button>
          </>
        )}
        {isExecutive && (
          <span className="inline-flex items-center gap-1">
          <select
            value={genMedia}
            onChange={(e) => setGenMedia(e.target.value as "auto" | "image" | "text")}
            aria-label="Media type for Generate Now"
            disabled={pending}
            className="rounded-md border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="auto">Auto</option>
            <option value="image">With image</option>
            <option value="text">Text only</option>
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                "generate",
                async () => {
                  const res = await generateNow(post.scheduled_date, genMedia === "auto" ? undefined : genMedia);
                  if (res.ok && !res.error)
                    setMsg({
                      tone: "info",
                      text: `Fresh draft generated for ${post.scheduled_date} — check the calendar.`,
                    });
                  return res;
                },
                100,
              )
            }
          >
            {busy("generate") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}{" "}
            Generate Now
          </Button>
          </span>
        )}
        {isExecutive &&
          (confirmingDelete ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-xs text-rose-600">Delete this draft permanently?</span>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  run("delete", async () => {
                    const res = await deletePost(post.id);
                    if (res.ok) setConfirmingDelete(false);
                    return res;
                  })
                }
              >
                {busy("delete") ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}{" "}
                Confirm delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ))}
      </div>

      {isExecutive && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <CalendarClock className="h-3.5 w-3.5" /> Date &amp; time
            </label>
            <input
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              type="time"
              value={moveTime}
              onChange={(e) => setMoveTime(e.target.value)}
              aria-label="Post time (Eastern)"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <span className="text-xs text-slate-400">Eastern time</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || (moveDate === post.scheduled_date && moveTime === currentTime)}
              onClick={() =>
                run("reschedule", async () => {
                  // Date and time can change together; the DB trigger recomputes
                  // publish_at on each write, so write order doesn't matter.
                  let warning: string | undefined;
                  if (moveDate !== post.scheduled_date) {
                    const r = await reschedulePost(post.id, moveDate);
                    if (!r.ok) return r;
                    warning = r.error;
                  }
                  if (moveTime !== currentTime) {
                    const r = await setPostTime(post.id, moveTime || null);
                    if (!r.ok) return r;
                  }
                  return { ok: true, error: warning };
                })
              }
            >
              {busy("reschedule") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}{" "}
              Update schedule
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Leave the time blank to publish as soon as the post is approved. A set time publishes
            within ~2 minutes after it; changing the time on an already-approved post takes effect
            immediately.
          </p>
        </div>
      )}

      {isExecutive && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={permalink}
            onChange={(e) => setPermalink(e.target.value)}
            placeholder="Group post permalink (optional)"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run("markposted", () => markPosted(post.id, permalink))}
          >
            {busy("markposted") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}{" "}
            Mark Posted
          </Button>
        </div>
      )}

      {pending && activeKey === "generate" && (
        <Working label="Generating draft — ~15s text-only, up to a minute with an image" />
      )}
      {pending && activeKey === "make-text" && <Working label="Removing image — converting to a text-only post" />}
      {!pending && msg && (
        <p className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function ComponentBlock({
  title,
  status,
  reasonCodes,
  isExecutive,
  disabled,
  approving,
  rejecting: rejectBusy,
  regenInFlight = false,
  onApprove,
  onReject,
  children,
}: {
  title: string;
  status: "pending" | "approved" | "rejected";
  /** Component-specific rejection reasons (COPY / IMAGE / VIDEO_REASON_CODES). */
  reasonCodes: { value: FbReasonCode; label: string }[];
  isExecutive: boolean;
  disabled: boolean;
  approving: boolean;
  rejecting: boolean;
  /** True while WF3 is regenerating this component in the background (status is
   * 'rejected' and the manual cap hasn't been hit). Keeps the regenerating
   * indicator visible after the reject action itself has already returned. */
  regenInFlight?: boolean;
  onApprove: () => void;
  onReject: (code: FbReasonCode, text: string) => void;
  children: React.ReactNode;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState<FbReasonCode>(reasonCodes[0]?.value ?? "other");
  const [text, setText] = useState("");

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {title}
        </h4>
        <div className="flex items-center gap-2">
          {(rejectBusy || regenInFlight) && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> regenerating…
            </span>
          )}
          <Badge tone={COMPONENT_STATUS_META[status].tone}>{COMPONENT_STATUS_META[status].label}</Badge>
        </div>
      </div>

      {children}

      {isExecutive && status !== "approved" && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={disabled} onClick={onApprove}>
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve {title.toLowerCase()}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={disabled}
              onClick={() => setRejecting((v) => !v)}
            >
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>

          {rejecting && (
            <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950">
              <select
                value={code}
                onChange={(e) => setCode(e.target.value as FbReasonCode)}
                className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {reasonCodes.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="Add specifics — this note goes straight into the regeneration prompt"
                className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={disabled}
                onClick={() => {
                  onReject(code, text);
                  setRejecting(false);
                  setText("");
                }}
              >
                {rejectBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Submit rejection &amp; regenerate
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
