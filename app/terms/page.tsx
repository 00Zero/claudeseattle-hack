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
      <section id="projects" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Projects and open source</h2>
        <p>
          Every project submitted to the hackathon must be in a public GitHub repository and released under an open source license
          approved by the Open Source Initiative, such as MIT or Apache 2.0. Add the license as a LICENSE file in the repository. If
          the repository has no license when you submit, you agree that the project is released under the MIT License.
        </p>
        <p>
          You and your teammates keep ownership of what you build. You allow the hosts to copy, archive, and showcase your project,
          including in a public collection of the hackathon&apos;s projects on GitHub, with credit to your team.
        </p>
        <p>
          Submit only code, data, and other content you have the right to release under that license, and never commit passwords, API
          keys, or personal data. Projects are shared as is, without warranty. Anyone who uses a project is responsible for following
          its license and for how they use it; the hosts are not liable for any project or its use.
        </p>
      </section>
      <section id="analytics" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p>
          This section applies to everyone who visits this website. We use Google Analytics to count visits to our public pages. It
          uses cookies, and it tells Google which pages you viewed, how you got here, and your browser, device, and approximate
          location. It doesn&apos;t run while you&apos;re signed in, and it doesn&apos;t receive your name, your email address, or
          anything you enter on this website. You can read{" "}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className="underline">
            how Google uses this data
          </a>{" "}
          and block it with Google&apos;s{" "}
          <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="underline">
            opt-out add-on
          </a>
          .
        </p>
      </section>
    </div>
  );
}
