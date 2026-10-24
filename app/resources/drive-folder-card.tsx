"use client";

import { useState } from "react";
import type { Resource } from "@/lib/resources";

// Claude's "Add to Claude" link for the Google Drive connector, from its listing at
// claude.com/connectors/google-drive.
const DRIVE_CONNECTOR_URL = "https://claude.ai/directory/b89f7865-a755-4f86-8062-c3bd651740ce";

export function isDriveFolder(url: string) {
  return /^https:\/\/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(url);
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// A Google Drive folder resource gets two buttons. "See the data" copies the folder link
// (the icon turns into a check) and opens the folder in a new tab. The other opens Claude's
// Google Drive connector so attendees can add it and have Claude read the files. Opening the
// folder first lets the connector find it in the attendee's Drive.
export function DriveFolderCard({ resource }: { resource: Resource }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(resource.url);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the folder still opens.
    }
  }

  return (
    <div className="h-full space-y-3 rounded border border-line p-4">
      <div>
        <span className="font-medium text-fg">{resource.title}</span>
        {resource.description && <span className="mt-1 block text-sm text-fg-muted">{resource.description}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={resource.url} target="_blank" rel="noopener noreferrer" onClick={copyLink} className="btn">
          {copied ? <CheckIcon /> : <CopyIcon />}
          See the data ↗
        </a>
        <a href={DRIVE_CONNECTOR_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          Add the Google Drive connector to Claude ↗
        </a>
        <span role="status" className="text-sm text-fg-muted">
          {copied ? "Link copied" : ""}
        </span>
      </div>
      <p className="text-sm text-fg-muted">
        Open the folder first, then add the connector and ask Claude to search your Google Drive for the files.
      </p>
    </div>
  );
}
