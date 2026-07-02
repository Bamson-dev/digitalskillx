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
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
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
      <Card>
        <CardHeader
          title="Certificate templates"
          description="Three built-in designs. Each preview uses sample data and a scannable sample QR code."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {CERTIFICATE_TEMPLATE_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-semibold text-neutral-800">
                {CERTIFICATE_TEMPLATE_LABELS[key]}
              </p>
              <CertificatePreview templateKey={key} compact />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Certificate defaults"
          description="Map categories to a template and set the global fallback for courses without an override or category mapping."
        />
        <form action={action} className="space-y-6">
          <div>
            <Label htmlFor="default_certificate_template_key">Global default template</Label>
            <Select
              id="default_certificate_template_key"
              name="default_certificate_template_key"
              defaultValue={globalDefaultTemplateKey}
              className="mt-1.5 max-w-xs"
            >
              <TemplateOptions />
            </Select>
            <p className="mt-1 text-xs text-muted">
              Used when a course has no template override and its category has no mapping.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-neutral-800">Category template mapping</p>
            <div className="overflow-x-auto rounded-lg border border-app">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Certificate template</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-muted">
                        No course categories yet. Create categories first when editing a course, then
                        return here to assign certificate templates.
                      </td>
                    </tr>
                  ) : (
                    categories.map((category) => (
                      <tr key={category.id}>
                        <td className="px-4 py-3 font-medium">{category.name}</td>
                        <td className="px-4 py-3">
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

          <SubmitButton pendingText="Saving…">Save certificate settings</SubmitButton>
          <Feedback state={state} />
        </form>
      </Card>
    </div>
  );
}
