import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { HogItem } from "../types";
import { formatBytes, formatDateTime } from "../lib/format";
import { extOf } from "../lib/fileTypes";

interface Props {
  item: HogItem;
  onClose: () => void;
}

export default function DetailPanel({ item, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function reveal() {
    try {
      await revealItemInDir(item.path);
    } catch (err) {
      setActionError(String(err));
    }
  }

  async function copyPath() {
    try {
      // Copied text always replaces the user folder with %USERPROFILE%.
      const masked = await invoke<string>("mask_path", { path: item.path });
      try {
        await navigator.clipboard.writeText(masked);
      } catch {
        const area = document.createElement("textarea");
        area.value = masked;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setActionError(String(err));
    }
  }

  const ext = extOf(item.name);
  const typeLabel = item.kind === "folder" ? "Folder" : ext ? `.${ext}` : "File";

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-96 max-w-full flex-col gap-3 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 text-sm shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium">Details</h2>
        <button className="rounded px-2 py-0.5 text-xs opacity-70 hover:opacity-100" onClick={onClose}>
          Close
        </button>
      </div>

      <Field label="Name" value={item.name} />
      <Field label="Full path" value={item.path} mono wrap />
      <Field label="Size" value={formatBytes(item.size)} />
      <Field label="Type" value={typeLabel} />
      {item.kind === "file" && (
        <>
          <Field label="Modified" value={formatDateTime(item.modifiedMs)} />
          <Field label="Created" value={formatDateTime(item.createdMs)} />
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button
          className="flex-1 rounded-md bg-sky-600 px-3 py-2 text-xs font-medium hover:bg-sky-500"
          onClick={reveal}
        >
          Reveal in File Explorer
        </button>
        <button
          className="flex-1 rounded-md border border-neutral-700 px-3 py-2 text-xs hover:bg-neutral-900"
          onClick={copyPath}
        >
          {copied ? "Copied" : "Copy path"}
        </button>
      </div>
      <div className="text-xs opacity-50">
        Copied paths replace your user folder with %USERPROFILE%.
      </div>
      {actionError && (
        <div className="rounded border border-red-900 bg-red-950/50 p-2 text-xs">{actionError}</div>
      )}
    </aside>
  );
}

function Field({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide opacity-50">{label}</div>
      <div
        className={`${mono ? "font-mono text-xs" : ""} ${wrap ? "break-all" : "truncate"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
