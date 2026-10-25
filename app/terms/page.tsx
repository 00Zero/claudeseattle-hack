import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

// Public. The upload section on /resources links here for the full media consent.
export default function TermsPage() {
  return (
    <div className="max-w-[65ch] space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Terms</h1>
        <p className="text-fg-muted">
          These terms apply to everyone who registers for this website (hack.claudeseattle.org), registers for the Claude Impact Lab
          Hackathon, or attends it.
        </p>
      </div>
      <section id="media" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Photos, video, and publicity</h2>
        <p>
          By registering for or attending this event, you consent for the hosts and its affiliates to use your name, image, and
          likeness in any marketing related to the event. This consent includes, without limitation, an irrevocable, perpetual,
          worldwide, fully-paid, royalty-free, sub-licensable, non-transferable license to use any photographs or video recording on
          you taken while in attendance at the event. You also consent to receiving emails from the event hosts and sponsors.
        </p>
        <p>
          Photos and videos you upload on this website may be used the same way to publicize the event. Upload only photos and videos
          you took or have the right to share.
        </p>
      </section>
    </div>
  );
}
