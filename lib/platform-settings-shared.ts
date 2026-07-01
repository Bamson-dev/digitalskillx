import { ORG } from "@/lib/org";

export const DEFAULT_PRIMARY_COLOR = "#dc2626";
export const DEFAULT_TIMEZONE = "Africa/Lagos";

export type PlatformSettingsValues = {
  platform_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  default_timezone: string;
  email_sender_name: string | null;
  email_reply_to: string | null;
  default_certificate_template_id: string | null;
};

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettingsValues = {
  platform_name: ORG.platformName,
  logo_url: null,
  favicon_url: null,
  primary_color: DEFAULT_PRIMARY_COLOR,
  default_timezone: DEFAULT_TIMEZONE,
  email_sender_name: ORG.platformName,
  email_reply_to: null,
  default_certificate_template_id: null,
};

export const TIMEZONE_OPTIONS = [
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "America/New_York", label: "America/New York (ET)" },
  { value: "America/Chicago", label: "America/Chicago (CT)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (PT)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
] as const;
