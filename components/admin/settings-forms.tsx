"use client";

import Image from "next/image";
import { useFormState } from "react-dom";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  saveCertificateSettings,
  saveEmailSettings,
  savePlatformSettings,
  type SettingsState,
} from "@/app/(admin)/admin/(panel)/settings/actions";
import type { PlatformSettingsValues } from "@/lib/platform-settings-shared";
import { TIMEZONE_OPTIONS } from "@/lib/platform-settings-shared";

const initial: SettingsState = {};

type CertTemplate = {
  id: string;
  name: string;
  is_default: boolean;
  base_image_url: string | null;
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

function CertificateSettingsForm({
  settings,
  templates,
}: {
  settings: PlatformSettingsValues;
  templates: CertTemplate[];
}) {
  const [state, action] = useFormState(saveCertificateSettings, initial);
  const selected =
    settings.default_certificate_template_id ??
    templates.find((t) => t.is_default)?.id ??
    "";

  return (
    <Card>
      <CardHeader
        title="Certificate settings"
        description="Default template used when certificates are issued."
      />
      <form action={action} className="space-y-4" encType="multipart/form-data">
        <div>
          <Label htmlFor="certificate_template_id">Default certificate template</Label>
          <Select
            id="certificate_template_id"
            name="certificate_template_id"
            defaultValue={selected}
          >
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-lg border border-dashed border-app bg-surface-muted/40 p-4">
          <p className="text-sm font-medium text-neutral-800">Or upload a new template</p>
          <p className="mt-1 text-xs text-muted">
            Upload a background image. A new template record will be created and selected.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="certificate_template_name">Template name</Label>
              <Input
                id="certificate_template_name"
                name="certificate_template_name"
                placeholder="e.g. DigitalSkillX Classic"
              />
            </div>
            <div>
              <Label htmlFor="certificate_template_file">Template image</Label>
              <Input
                id="certificate_template_file"
                name="certificate_template_file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
            </div>
          </div>
        </div>

        <SubmitButton pendingText="Saving…">Save certificate settings</SubmitButton>
        <Feedback state={state} />
      </form>
    </Card>
  );
}

export function SettingsForms({
  settings,
  templates,
}: {
  settings: PlatformSettingsValues;
  templates: CertTemplate[];
}) {
  return (
    <div className="space-y-6">
      <PlatformSettingsForm settings={settings} />
      <EmailSettingsForm settings={settings} />
      <CertificateSettingsForm settings={settings} templates={templates} />
    </div>
  );
}
