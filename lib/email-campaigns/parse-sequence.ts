export type ParsedCampaignEmail = {
  day: number;
  campaignGoal: string;
  primaryCta: string;
  subject: string;
  subjectAltA: string;
  subjectAltB: string;
  previewText: string;
  body: string;
  ctaLink: string;
  psychologicalAngle: string;
};

function field(block: string, label: string): string {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]*)`, "i");
  const match = block.match(re);
  return (match?.[1] ?? "").trim();
}

function emailBody(block: string): string {
  const start = block.search(/\*\*EMAIL:\*\*/i);
  if (start < 0) return "";
  const after = block.slice(start).replace(/^\*\*EMAIL:\*\*\s*/i, "");
  const end = after.search(/\n\*\*CTA LINK:\*\*/i);
  const raw = end >= 0 ? after.slice(0, end) : after;
  return raw.replace(/^\n+/, "").replace(/\n+$/, "").trim();
}

export function parseAimoneycodeSequence(markdown: string): ParsedCampaignEmail[] {
  const parts = markdown.split(/^# DAY (\d+)\s*$/m);
  const emails: ParsedCampaignEmail[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const day = Number(parts[i]);
    const block = parts[i + 1] ?? "";
    if (!Number.isInteger(day) || day < 1) continue;

    emails.push({
      day,
      campaignGoal: field(block, "CAMPAIGN GOAL"),
      primaryCta: field(block, "PRIMARY CTA"),
      subject: field(block, "RECOMMENDED SUBJECT"),
      subjectAltA: field(block, "SUBJECT ALTERNATIVE A"),
      subjectAltB: field(block, "SUBJECT ALTERNATIVE B"),
      previewText: field(block, "PREVIEW TEXT"),
      body: emailBody(block),
      ctaLink: field(block, "CTA LINK"),
      psychologicalAngle: field(block, "KEY PSYCHOLOGICAL ANGLE"),
    });
  }

  emails.sort((a, b) => a.day - b.day);
  return emails;
}

export function assertCompleteSequence(emails: ParsedCampaignEmail[]): void {
  if (emails.length !== 30) {
    throw new Error(`Expected 30 campaign emails, found ${emails.length}`);
  }
  for (let day = 1; day <= 30; day++) {
    const email = emails[day - 1];
    if (email.day !== day) {
      throw new Error(`Campaign emails are out of order at index ${day - 1}: day ${email.day}`);
    }
    if (!email.subject.trim()) {
      throw new Error(`Day ${day} is missing a recommended subject`);
    }
    if (!email.body.trim()) {
      throw new Error(`Day ${day} is missing email body`);
    }
  }
}
