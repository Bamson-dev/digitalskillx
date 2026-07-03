"use client";

import Image from "next/image";
import { useFormState } from "react-dom";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  saveEmailSettings,
  saveIntegrationSettings,
  savePlatformSettings,
  type SettingsState,
} from "@/app/(admin)/admin/(panel)/settings/actions";
import type { PlatformSettingsValues } from "@/lib/platform-settings-shared";
import { TIMEZONE_OPTIONS } from "@/lib/platform-settings-shared";
import { CertificateTemplateSettings } from "@/components/admin/certificate-template-settings";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  normalizeCertificateTemplateKey,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";

const initial: SettingsState = {};

type CategoryMapping = {
  id: string;
  name: string;
  template_key: string | null;
};

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
    );
  }
  if (state.message) {
    return (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
    );
  }
  return null;
}

function PlatformSettingsForm({ settings }: { settings: PlatformSettingsValues }) {
  const [state, action] = useFormState(savePlatformSettings, initial);

  return (
    <Card>
      <CardHeader
        title="Platform settings"
        description="Branding and regional defaults for the storefront."
      />
      <form action={action} className="space-y-4" encType="multipart/form-data">
        <div>
          <Label htmlFor="platform_name">Platform name</Label>
          <Input
            id="platform_name"
            name="platform_name"
            defaultValue={settings.platform_name}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="logo">Logo upload</Label>
            <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            {settings.logo_url ? (
              <div className="relative mt-2 h-12 w-40">
                <Image
                  src={settings.logo_url}
                  alt="Current logo"
                  fill
                  className="object-contain object-left"
                  unoptimized
                />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">PNG, JPG, WebP, or SVG · max 2 MB</p>
            )}
          </div>
          <div>
            <Label htmlFor="favicon">Favicon upload</Label>
            <Input
              id="favicon"
              name="favicon"
              type="file"
              accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp"
            />
            {settings.favicon_url ? (
              <div className="relative mt-2 h-8 w-8">
                <Image
                  src={settings.favicon_url}
                  alt="Current favicon"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">ICO, PNG, or WebP · max 2 MB</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="primary_color">Primary color</Label>
            <Input
              id="primary_color"
              name="primary_color"
              type="color"
              defaultValue={settings.primary_color}
              className="h-12 w-full max-w-[12rem] cursor-pointer p-1"
            />
            <p className="mt-1 text-xs text-muted">Current: {settings.primary_color}</p>
          </div>
          <div>
            <Label htmlFor="default_timezone">Default timezone</Label>
            <Select
              id="default_timezone"
              name="default_timezone"
              defaultValue={settings.default_timezone}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <SubmitButton pendingText="Saving…">Save platform settings</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

function EmailSettingsForm({ settings }: { settings: PlatformSettingsValues }) {
  const [state, action] = useFormState(saveEmailSettings, initial);

  return (
    <Card>
      <CardHeader
        title="Email settings"
        description="Sender identity for ZeptoMail. The from address still comes from ZEPTOMAIL_FROM_EMAIL in server env."
      />
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="email_sender_name">Sender name</Label>
          <Input
            id="email_sender_name"
            name="email_sender_name"
            defaultValue={settings.email_sender_name ?? ""}
            required
          />
        </div>
        <div>
          <Label htmlFor="email_reply_to">Reply-to email address</Label>
          <Input
            id="email_reply_to"
            name="email_reply_to"
            type="email"
            defaultValue={settings.email_reply_to ?? ""}
            placeholder="support@digitalskillx.com"
          />
        </div>
        <SubmitButton pendingText="Saving…">Save email settings</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

function IntegrationSettingsForm({
  youtubeConfigured,
  deepseekConfigured,
  paystackConfigured,
  serviceRoleConfigured,
  emailConfigured,
}: {
  youtubeConfigured: boolean;
  deepseekConfigured: boolean;
  paystackConfigured: boolean;
  serviceRoleConfigured: boolean;
  emailConfigured: boolean;
}) {
  const [state, action] = useFormState(saveIntegrationSettings, initial);

  return (
    <Card>
      <CardHeader
        title="Integrations"
        description="API keys stored in Supabase (recommended). Coolify env vars often do not reach Next.js route handlers."
      />
      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="youtube_api_key">YouTube Data API key</Label>
          <Input
            id="youtube_api_key"
            name="youtube_api_key"
            type="password"
            autoComplete="off"
            placeholder={youtubeConfigured ? "Key saved — paste to replace" : "AIzaSy…"}
          />
          <p className="mt-1 text-xs text-muted">
            {youtubeConfigured
              ? "A key is configured. Paste a new value only if you need to replace it."
              : "Required for Admin → Courses → Import lessons (YouTube playlist/video)."}
          </p>
        </div>
        <div>
          <Label htmlFor="deepseek_api_key">DeepSeek API key</Label>
          <Input
            id="deepseek_api_key"
            name="deepseek_api_key"
            type="password"
            autoComplete="off"
            placeholder={deepseekConfigured ? "Key saved — paste to replace" : "sk-…"}
          />
          <p className="mt-1 text-xs text-muted">
            {deepseekConfigured
              ? "A key is configured for AI course copy generation."
              : "Required for Generate with AI on the course edit form."}
          </p>
        </div>
        <div>
          <Label htmlFor="paystack_secret_key">Paystack secret key</Label>
          <Input
            id="paystack_secret_key"
            name="paystack_secret_key"
            type="password"
            autoComplete="off"
            placeholder={paystackConfigured ? "Key saved — paste to replace" : "sk_live_… or sk_test_…"}
          />
          <p className="mt-1 text-xs text-muted">
            {paystackConfigured
              ? "Paystack checkout is configured for paid enrollments."
              : "Required for Enroll Now on paid courses. Coolify env vars often do not reach Next.js — saving here is recommended."}
          </p>
        </div>
        <div>
          <Label htmlFor="supabase_service_role_key">Supabase service role key</Label>
          <Input
            id="supabase_service_role_key"
            name="supabase_service_role_key"
            type="password"
            autoComplete="off"
            placeholder={serviceRoleConfigured ? "Key saved — paste to replace" : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"}
          />
          <p className="mt-1 text-xs text-muted">
            {serviceRoleConfigured
              ? "Admin actions such as creating students can use the service role key."
              : "Required for Admin → Students (create account). If Coolify env vars fail, save the service_role secret from Supabase → Project Settings → API here."}
          </p>
        </div>
        <div>
          <Label htmlFor="zeptomail_smtp_password">ZeptoMail SMTP password</Label>
          <Input
            id="zeptomail_smtp_password"
            name="zeptomail_smtp_password"
            type="password"
            autoComplete="off"
            placeholder={emailConfigured ? "Password saved — paste to replace" : "Your ZeptoMail SMTP password"}
          />
          <p className="mt-1 text-xs text-muted">
            {emailConfigured
              ? "Transactional email (welcome, enrollment, receipts) is configured."
              : "Required for student welcome and enrollment emails. Coolify env vars often do not reach Next.js — saving here is recommended."}
          </p>
        </div>
        <SubmitButton pendingText="Saving…">Save integration settings</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

export function SettingsForms({
  settings,
  categories,
  youtubeConfigured,
  deepseekConfigured,
  paystackConfigured,
  serviceRoleConfigured,
  emailConfigured,
}: {
  settings: PlatformSettingsValues;
  categories: CategoryMapping[];
  youtubeConfigured: boolean;
  deepseekConfigured: boolean;
  paystackConfigured: boolean;
  serviceRoleConfigured: boolean;
  emailConfigured: boolean;
}) {
  return (
    <div className="space-y-6">
      <PlatformSettingsForm settings={settings} />
      <EmailSettingsForm settings={settings} />
      <IntegrationSettingsForm
        youtubeConfigured={youtubeConfigured}
        deepseekConfigured={deepseekConfigured}
        paystackConfigured={paystackConfigured}
        serviceRoleConfigured={serviceRoleConfigured}
        emailConfigured={emailConfigured}
      />
      <CertificateTemplateSettings
        categories={categories}
        globalDefaultTemplateKey={
          normalizeCertificateTemplateKey(settings.default_certificate_template_key) ??
          DEFAULT_CERTIFICATE_TEMPLATE_KEY
        }
      />
    </div>
  );
}
