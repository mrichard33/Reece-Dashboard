"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileUp, LinkIcon, Type as TypeIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ASSET_TYPE_LABEL } from "./meta";
import { saveAsset } from "@/lib/actions/approvals";
import type { AssetType, MediaType, AssetStatus } from "@/lib/supabase/types";

const MAX_UPLOAD_MB = 50;

type ExecOption = { id: string; name: string };

type DraftAttachment = {
  tempId: string;
  kind: "file" | "link" | "text";
  label: string;
  media_type: MediaType;
  external_url: string;
  inline_text: string;
  file?: File;
  oversize?: boolean;
};

type ExistingAttachment = {
  id: string;
  kind: "file" | "link" | "text";
  label: string;
};

export function AssetForm({
  executives,
  mode,
  asset,
  existingAttachments = [],
}: {
  executives: ExecOption[];
  mode: "create" | "edit";
  asset?: {
    id: string;
    title: string;
    asset_type: AssetType;
    description: string | null;
    status: AssetStatus;
    requiredExecIds: string[];
  };
  existingAttachments?: ExistingAttachment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(asset?.title ?? "");
  const [assetType, setAssetType] = useState<AssetType>(asset?.asset_type ?? "script");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [requiredIds, setRequiredIds] = useState<string[]>(asset?.requiredExecIds ?? []);
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [resetMode, setResetMode] = useState<"material" | "minor">("material");

  const isLive = mode === "edit" && asset && asset.status !== "draft";

  function toggleRequired(id: string) {
    setRequiredIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function addDraft(kind: DraftAttachment["kind"]) {
    setDrafts((cur) => [
      ...cur,
      {
        tempId: crypto.randomUUID(),
        kind,
        label: "",
        media_type: kind === "text" ? "other" : "other",
        external_url: "",
        inline_text: "",
      },
    ]);
  }

  function updateDraft(tempId: string, patch: Partial<DraftAttachment>) {
    setDrafts((cur) => cur.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d)));
  }

  function removeDraft(tempId: string) {
    setDrafts((cur) => cur.filter((d) => d.tempId !== tempId));
  }

  function onPickFile(tempId: string, file: File | null) {
    if (!file) return;
    const oversize = file.size > MAX_UPLOAD_MB * 1024 * 1024;
    updateDraft(tempId, {
      file,
      oversize,
      label: drafts.find((d) => d.tempId === tempId)?.label || file.name,
    });
  }

  function submit(intent: "draft" | "submit") {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const oversized = drafts.find((d) => d.kind === "file" && d.oversize);
    if (oversized) {
      setError(
        `"${oversized.label}" is over ${MAX_UPLOAD_MB}MB. Remove it and add it as a link instead.`,
      );
      return;
    }

    const fd = new FormData();
    if (asset?.id) fd.set("assetId", asset.id);
    fd.set("title", title.trim());
    fd.set("asset_type", assetType);
    fd.set("description", description);
    fd.set("intent", intent);
    fd.set("requiredExecIds", JSON.stringify(requiredIds));
    fd.set("removeAttachmentIds", JSON.stringify(removeIds));
    if (isLive) fd.set("resetMode", resetMode);

    const manifest = drafts.map((d, i) => {
      const fileKey = d.kind === "file" ? `file_${i}` : undefined;
      if (fileKey && d.file) fd.set(fileKey, d.file);
      return {
        kind: d.kind,
        label: d.label || (d.kind === "file" ? d.file?.name : "") || "Untitled",
        media_type: d.kind === "text" ? null : d.media_type,
        external_url: d.kind === "link" ? d.external_url : null,
        inline_text: d.kind === "text" ? d.inline_text : null,
        fileKey,
      };
    });
    fd.set("newAttachments", JSON.stringify(manifest));

    startTransition(async () => {
      try {
        const res = await saveAsset(fd);
        if (!res.ok) {
          setError(res.error ?? "Save failed.");
          return;
        }
        router.push(res.assetId ? `/approvals/${res.assetId}` : "/approvals");
        router.refresh();
      } catch {
        setError(
          "Save failed — a file may be too large to upload. Keep files under " +
            `${MAX_UPLOAD_MB}MB, or add large video as a link instead.`,
        );
      }
    });
  }

  const inputCls =
    "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500 dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Title
          </label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Type
            </label>
            <select
              className={inputCls}
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
            >
              {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Description
          </label>
          <textarea
            className={inputCls}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {/* Required approvers */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
          Required approvers
        </h3>
        <div className="flex flex-wrap gap-3">
          {executives.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              <input
                type="checkbox"
                checked={requiredIds.includes(e.id)}
                onChange={() => toggleRequired(e.id)}
              />
              {e.name}
            </label>
          ))}
        </div>
      </div>

      {/* Attachments */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
            Attachments
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => addDraft("file")}>
              <FileUp className="h-3.5 w-3.5" /> File
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addDraft("link")}>
              <LinkIcon className="h-3.5 w-3.5" /> Link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addDraft("text")}>
              <TypeIcon className="h-3.5 w-3.5" /> Text
            </Button>
          </div>
        </div>

        {existingAttachments.length > 0 && (
          <ul className="space-y-1.5">
            {existingAttachments.map((a) => {
              const removed = removeIds.includes(a.id);
              return (
                <li
                  key={a.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-sm ${
                    removed
                      ? "border-rose-200 bg-rose-50 line-through opacity-60 dark:border-rose-900 dark:bg-rose-950"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <span>
                    [{a.kind}] {a.label}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setRemoveIds((cur) =>
                        removed ? cur.filter((x) => x !== a.id) : [...cur, a.id],
                      )
                    }
                    className="text-xs text-rose-600 hover:underline"
                  >
                    {removed ? "Undo" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {drafts.map((d) => (
          <div
            key={d.tempId}
            className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {d.kind}
              </span>
              <button
                type="button"
                onClick={() => removeDraft(d.tempId)}
                className="text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              className={inputCls}
              placeholder="Label"
              value={d.label}
              onChange={(e) => updateDraft(d.tempId, { label: e.target.value })}
            />
            {d.kind === "file" && (
              <>
                <input
                  type="file"
                  className="block w-full text-sm"
                  onChange={(e) => onPickFile(d.tempId, e.target.files?.[0] ?? null)}
                />
                <select
                  className={inputCls}
                  value={d.media_type}
                  onChange={(e) =>
                    updateDraft(d.tempId, { media_type: e.target.value as MediaType })
                  }
                >
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                  <option value="doc">Doc</option>
                  <option value="other">Other</option>
                </select>
                {d.oversize && (
                  <p className="text-xs text-rose-600">
                    Over {MAX_UPLOAD_MB}MB — use a link instead.
                  </p>
                )}
              </>
            )}
            {d.kind === "link" && (
              <>
                <input
                  className={inputCls}
                  placeholder="https://..."
                  value={d.external_url}
                  onChange={(e) => updateDraft(d.tempId, { external_url: e.target.value })}
                />
                <select
                  className={inputCls}
                  value={d.media_type}
                  onChange={(e) =>
                    updateDraft(d.tempId, { media_type: e.target.value as MediaType })
                  }
                >
                  <option value="video">Video (embed)</option>
                  <option value="other">Other (link out)</option>
                </select>
              </>
            )}
            {d.kind === "text" && (
              <textarea
                className={inputCls}
                rows={4}
                placeholder="Paste the transcript / text…"
                value={d.inline_text}
                onChange={(e) => updateDraft(d.tempId, { inline_text: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>

      {/* Revision reset choice when editing a live asset */}
      {isLive && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            This asset is already in review — what kind of change is this?
          </h3>
          <label className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
            <input
              type="radio"
              checked={resetMode === "material"}
              onChange={() => setResetMode("material")}
            />
            Material — reset all required approvals to pending
          </label>
          <label className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
            <input
              type="radio"
              checked={resetMode === "minor"}
              onChange={() => setResetMode("minor")}
            />
            Minor — only re-open approvers who requested changes
          </label>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => submit("draft")}>
          {isLive ? "Save changes" : "Save draft"}
        </Button>
        {(!asset || asset.status === "draft") && (
          <Button variant="primary" disabled={pending} onClick={() => submit("submit")}>
            <Plus className="h-4 w-4" /> Submit for review
          </Button>
        )}
      </div>
    </div>
  );
}
