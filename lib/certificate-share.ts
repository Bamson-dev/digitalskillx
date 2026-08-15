/** Share copy and platform URLs for public certificate verification links. */

export type CertificateShareInput = {
  verifyUrl: string;
  courseTitle: string;
  kind?: "course" | "learning_path";
};

export function certificateShareText(input: CertificateShareInput) {
  if (input.kind === "learning_path") {
    return `I completed the DigitalSkillX learning path ${input.courseTitle}. Verify my certificate:`;
  }
  return `I earned a certificate in ${input.courseTitle} from DigitalSkillX! Verify it here:`;
}

export function certificateShareMessage(input: CertificateShareInput) {
  return `${certificateShareText(input)} ${input.verifyUrl}`;
}

export type CertificateSharePlatform =
  | "whatsapp"
  | "facebook"
  | "x"
  | "linkedin"
  | "telegram"
  | "email";

export function certificateShareUrl(
  platform: CertificateSharePlatform,
  input: CertificateShareInput,
): string {
  const { verifyUrl } = input;
  const text = certificateShareText(input);
  const message = certificateShareMessage(input);

  switch (platform) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(message)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(verifyUrl)}&quote=${encodeURIComponent(text)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(verifyUrl)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(verifyUrl)}&text=${encodeURIComponent(text)}`;
    case "email":
      return `mailto:?subject=${encodeURIComponent("My DigitalSkillX certificate")}&body=${encodeURIComponent(message)}`;
  }
}

export const CERTIFICATE_SHARE_PLATFORMS: {
  id: CertificateSharePlatform;
  label: string;
}[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "telegram", label: "Telegram" },
  { id: "email", label: "Email" },
];
