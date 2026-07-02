"use client";

import { useFormState } from "react-dom";
import { Card, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  saveCertificateTemplateSettings,
  type SettingsState,
} from "@/app/(admin)/admin/(panel)/settings/actions";
import { CertificatePreview } from "@/components/certificates/certificate-preview";
import {
  CERTIFICATE_TEMPLATE_KEYS,
  CERTIFICATE_TEMPLATE_LABELS,
  normalizeCertificateTemplateKey,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";

const initial: SettingsState = {};

type CategoryRow = {
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

function TemplateOptions() {
  return (
    <>
      {CERTIFICATE_TEMPLATE_KEYS.map((key) => (
        <option key={key} value={key}>
          {CERTIFICATE_TEMPLATE_LABELS[key]}
        </option>
      ))}
    </>
  );
}

export function CertificateTemplateSettings({
  categories,
  globalDefaultTemplateKey,
}: {
  categories: CategoryRow[];
  globalDefaultTemplateKey: CertificateTemplateKey;
}) {
  const [state, action] = useFormState(saveCertificateTemplateSettings, initial);

  return (
    <div className="space-y-6">
      {/* 1. Template previews */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Certificate templates"
          description="Three built-in designs. Previews use sample data and a scannable sample QR code."
        />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {CERTIFICATE_TEMPLATE_KEYS.map((key) => (
            <div
              key={key}
              className="flex flex-col overflow-hidden rounded-xl border border-app bg-surface-muted/30 p-4"
            >
              <p className="mb-3 text-sm font-semibold text-neutral-900">
                {CERTIFICATE_TEMPLATE_LABELS[key]}
              </p>
              <CertificatePreview templateKey={key} compact />
            </div>
          ))}
        </div>
      </Card>

      {/* 2 & 3. Category mapping + global default */}
      <Card>
        <CardHeader
          title="Certificate defaults"
          description="Set the global fallback and map each course category to a template."
        />
        <form action={action} className="space-y-8">
          <div className="rounded-xl border border-app bg-surface-muted/20 p-4 sm:p-5">
            <Label htmlFor="default_certificate_template_key">Global default template</Label>
            <Select
              id="default_certificate_template_key"
              name="default_certificate_template_key"
              defaultValue={globalDefaultTemplateKey}
              className="mt-2 max-w-sm"
            >
              <TemplateOptions />
            </Select>
            <p className="mt-2 text-xs text-muted">
              Used when a course has no template override and its category has no mapping. Defaults
              to Gold Charcoal.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-neutral-900">Category template mapping</p>
            <p className="mt-1 text-xs text-muted">
              Each category can use a different certificate design for its courses.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-app">
              <table className="min-w-full text-sm">
                <thead className="border-b border-app bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Certificate template</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))] bg-white">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted">
                        No course categories yet. Create categories first when editing a course,
                        then return here to assign certificate templates.
                      </td>
                    </tr>
                  ) : (
                    categories.map((category) => (
                      <tr key={category.id} className="hover:bg-surface-muted/30">
                        <td className="px-4 py-3.5 font-medium text-neutral-900">{category.name}</td>
                        <td className="px-4 py-3.5">
                          <Select
                            name={`category_${category.id}`}
                            defaultValue={
                              normalizeCertificateTemplateKey(category.template_key) ??
                              globalDefaultTemplateKey
                            }
                            className="max-w-xs"
                          >
                            <TemplateOptions />
                          </Select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-app pt-4 sm:flex-row sm:items-center sm:justify-between">
            <SubmitButton pendingText="Saving…">Save certificate settings</SubmitButton>
            <Feedback state={state} />
          </div>
        </form>
      </Card>
    </div>
  );
}
