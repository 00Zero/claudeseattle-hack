import "server-only";

const FROM = "Claude Impact Lab Hackathon <login@claudeseattle.org>";

export function normalizeEmail(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// "adam@example.com" -> "a•••@example.com"
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const hidden = "•".repeat(Math.min(Math.max(local.length - 1, 1), 5));
  return `${local.slice(0, 1)}${hidden}@${domain}`;
}

// Sends one email through the Resend REST API. Throws on failure.
export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`);
  }
}
