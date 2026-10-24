"use client";

import { useState } from "react";
import type { Resource } from "@/lib/resources";

// Claude's "Add to Claude" link for the Google Drive connector, from its listing at
// claude.com/connectors/google-drive.
const DRIVE_CONNECTOR_URL = "https://claude.ai/directory/b89f7865-a755-4f86-8062-c3bd651740ce";

export function isDriveFolder(url: string) {
  return /^https:\/\/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(url);
}

// A Google Drive folder resource: one button copies the link and opens the folder, the other
// adds the Drive connector so Claude can read the files. Opening the folder first lets the
// connector find it in the attendee's Drive.
export function DriveFolderCard({ resource }: { resource: Resource }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(resource.url);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link still opens.
    }
  }

  return (
    <div className="h-full space-y-3 rounded border border-line p-4">
      <div>
        <span className="font-medium text-fg">{resource.title}</span>
        {resource.description && <span className="mt-1 block text-sm text-fg-muted">{resource.description}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={resource.url} target="_blank" rel="noopener noreferrer" onClick={copyLink} className="btn">
          {copied ? "Link copied, folder opened ↗" : "Copy link and open folder ↗"}
        </a>
        <a href={DRIVE_CONNECTOR_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          Add Google Drive to Claude ↗
        </a>
      </div>
      <p className="text-sm text-fg-muted">
        Open the folder first, then ask Claude to search your Google Drive for the files.
      </p>
    </div>
  );
}
