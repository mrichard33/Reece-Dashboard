"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { postActivity } from "@/lib/actions/approvals";

export function PostUpdateBox() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("body", body.trim());
    fd.set("category", category);
    startTransition(async () => {
      const res = await postActivity(fd);
      if (!res.ok) {
        setError(res.error ?? "Post failed.");
        return;
      }
      setBody("");
      setCategory("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Post a quick update…"
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">No category</option>
          <option value="content">Content</option>
          <option value="automation">Automation</option>
          <option value="funnel">Funnel</option>
          <option value="other">Other</option>
        </select>
        <Button size="sm" onClick={submit} disabled={pending}>
          <Send className="h-3.5 w-3.5" /> Post
        </Button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
