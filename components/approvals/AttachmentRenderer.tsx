import { ExternalLink, FileDown } from "lucide-react";
import type { RenderableAttachment } from "@/lib/queries/approvals";

/** Best-effort conversion of a share URL to an embeddable iframe URL. */
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    }
    return url;
  } catch {
    return url;
  }
}

export function AttachmentRenderer({ att }: { att: RenderableAttachment }) {
  const wrap = (node: React.ReactNode) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {att.label}
      </p>
      {node}
    </div>
  );

  if (att.kind === "text") {
    return wrap(
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        {att.inline_text}
      </pre>,
    );
  }

  if (att.kind === "file") {
    if (!att.url) {
      return wrap(
        <p className="text-xs text-rose-600">Media unavailable (signed URL failed).</p>,
      );
    }
    if (att.media_type === "audio") {
      return wrap(<audio controls preload="none" src={att.url} className="w-full" />);
    }
    if (att.media_type === "video") {
      return wrap(
        <video
          controls
          preload="none"
          src={att.url}
          className="max-h-[28rem] w-full rounded-md bg-black"
        />,
      );
    }
    if (att.media_type === "pdf") {
      return wrap(
        <object
          data={att.url}
          type="application/pdf"
          className="h-[32rem] w-full rounded-md border border-slate-200 dark:border-slate-800"
        >
          <a href={att.url} className="text-sm text-sky-600 underline">
            Open PDF
          </a>
        </object>,
      );
    }
    return wrap(
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <FileDown className="h-4 w-4" /> Download
      </a>,
    );
  }

  // kind === 'link'
  if (att.media_type === "video" && att.external_url) {
    return wrap(
      <div className="aspect-video w-full overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
        <iframe
          src={toEmbedUrl(att.external_url)}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>,
    );
  }
  return wrap(
    <a
      href={att.external_url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-navy-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <ExternalLink className="h-4 w-4" /> Open link
    </a>,
  );
}
