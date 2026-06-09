"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Pencil,
  SkipForward,
  Copy,
  ExternalLink,
  Send,
  RefreshCw,
  CalendarClock,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  FB_STATUS_META,
  COMPONENT_STATUS_META,
  TARGET_META,
  REASON_CODES,
  pillarLabel,
  pillarTone,
  archetypeLabel,
} from "@/components/content/meta";
import {
  approveCopy,
  approveImage,
  rejectComponent,
  editPost,
  skipPost,
  markPosted,
  generateNow,
  reschedulePost,
} from "@/lib/actions/content";
import { deletePost } from "@/lib/actions/deletePost";
import type { FbPost, FbComponent, FbReasonCode } from "@/lib/supabase/types";

export function PostReview({
  post,
  isExecutive,
}: {
  post: FbPost;
  isExecutive: boolean;
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const groupUrl = process.env.NEXT_PUBLIC_FB_GROUP_URL;

  // Only the clicked button shows a spinner (pending is component-wide).
  const busy = (key: string) => pending && activeKey === key;

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
      else {
        if (res.error) setMsg({ tone: "info", text: res.error });
        // The server re-fetch updates the calendar/drawer from fresh props.
        router.refresh();
      }
    });
  }

  function copyAndOpenGroup() {
    void navigator.clipboard.writeText(post.post_body ?? "");
    setMsg({ tone: "info", text: "Copied post body to clipboard." });
    if (groupUrl) window.open(groupUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={FB_STATUS_META[post.status].tone}>{FB_STATUS_META[post.status].label}</Badge>
        <Badge tone={TARGET_META[post.target].tone}>{TARGET_META[post.target].label}</Badge>
        {post.pillar && <Badge tone={pillarTone(post.pillar)}>{pillarLabel(post.pillar)}</Badge>}
        {post.archetype && <Badge tone="slate">{archetypeLabel(post.archetype)}</Badge>}
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

      {/* COPY */}
      <ComponentBlock
        title="Copy"
        status={post.copy_status}
        disabled={pending}
        approving={busy("approve-copy")}
        rejecting={busy("reject-copy")}
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

      {/* IMAGE */}
      <ComponentBlock
        title="Image"
        status={post.image_status}
        disabled={pending}
        approving={busy("approve-image")}
        rejecting={busy("reject-image")}
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
      </ComponentBlock>

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
        <Button size="sm" variant="secondary" onClick={copyAndOpenGroup}>
          <Copy className="h-3.5 w-3.5" /> Copy + Open Group <ExternalLink className="h-3 w-3" />
        </Button>
        {isExecutive && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run("generate", async () => {
                const res = await generateNow(post.scheduled_date);
                if (res.ok && !res.error)
                  setMsg({
                    tone: "info",
                    text: `Generating a fresh draft for ${post.scheduled_date} — it'll appear on the calendar shortly.`,
                  });
                return res;
              })
            }
          >
            {busy("generate") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}{" "}
            Generate Now
          </Button>
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
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <CalendarClock className="h-3.5 w-3.5" /> Move to date
          </label>
          <input
            type="date"
            value={moveDate}
            onChange={(e) => setMoveDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || moveDate === post.scheduled_date}
            onClick={() => run("reschedule", () => reschedulePost(post.id, moveDate))}
          >
            {busy("reschedule") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarClock className="h-3.5 w-3.5" />
            )}{" "}
            Move
          </Button>
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

      {msg && (
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
  isExecutive,
  disabled,
  approving,
  rejecting: rejectBusy,
  onApprove,
  onReject,
  children,
}: {
  title: string;
  status: "pending" | "approved" | "rejected";
  isExecutive: boolean;
  disabled: boolean;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: (code: FbReasonCode, text: string) => void;
  children: React.ReactNode;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState<FbReasonCode>("off-brand");
  const [text, setText] = useState("");

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {title}
        </h4>
        <div className="flex items-center gap-2">
          {rejectBusy && (
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
                {REASON_CODES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="Note (required for 'other')"
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
