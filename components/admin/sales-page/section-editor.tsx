"use client";

import type { SalesPageSection } from "@/lib/sales-pages/types";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Props = {
  section: SalesPageSection;
  onChange: (next: SalesPageSection) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  busy?: boolean;
};

export function SectionEditor({ section, onChange, onUploadImage, busy }: Props) {
  async function pickImage(assign: (assetId: string) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const id = await onUploadImage(file);
      if (id) assign(id);
    };
    input.click();
  }

  switch (section.type) {
    case "hero":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Eyebrow</Label>
            <Input
              value={section.eyebrow ?? ""}
              onChange={(e) => onChange({ ...section, eyebrow: e.target.value })}
            />
          </div>
          <div>
            <Label>Badge</Label>
            <Input value={section.badge ?? ""} onChange={(e) => onChange({ ...section, badge: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Headline</Label>
            <Input
              value={section.headline ?? ""}
              onChange={(e) => onChange({ ...section, headline: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Subheadline</Label>
            <Textarea
              value={section.subheadline ?? ""}
              onChange={(e) => onChange({ ...section, subheadline: e.target.value })}
              rows={3}
            />
          </div>
          <div>
            <Label>CTA label</Label>
            <Input
              value={section.ctaLabel ?? ""}
              onChange={(e) => onChange({ ...section, ctaLabel: e.target.value })}
            />
          </div>
          <div>
            <Label>Media</Label>
            <Select
              value={section.mediaType ?? "image"}
              onChange={(e) =>
                onChange({
                  ...section,
                  mediaType: e.target.value as "image" | "video" | "none",
                })
              }
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="none">None</option>
            </Select>
          </div>
          <div>
            <Label>Alignment</Label>
            <Select
              value={section.alignment ?? "left"}
              onChange={(e) =>
                onChange({ ...section, alignment: e.target.value as "left" | "center" })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
            </Select>
          </div>
          <div>
            <Label>Trust text</Label>
            <Input
              value={section.trustText ?? ""}
              onChange={(e) => onChange({ ...section, trustText: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void pickImage((id) => onChange({ ...section, imageAssetId: id, mediaType: "image" }))}
            >
              Upload hero image
            </Button>
            {section.imageAssetId ? (
              <span className="text-xs text-muted">Image asset set</span>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label>Video URL (YouTube/Vimeo)</Label>
            <Input
              value={section.videoUrl ?? ""}
              onChange={(e) => onChange({ ...section, videoUrl: e.target.value })}
            />
          </div>
        </div>
      );
    case "intro":
    case "problem":
    case "text":
    case "guarantee":
      return (
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={section.title ?? ""} onChange={(e) => onChange({ ...section, title: e.target.value })} />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea
              value={section.body ?? ""}
              onChange={(e) => onChange({ ...section, body: e.target.value })}
              rows={5}
            />
          </div>
        </div>
      );
    case "cta":
      return (
        <div>
          <Label>Button label</Label>
          <Input
            value={section.label}
            onChange={(e) => onChange({ ...section, label: e.target.value, behavior: "purchase" })}
          />
          <p className="mt-1 text-xs text-muted">Always opens DigitalSkillX checkout for this course.</p>
        </div>
      );
    case "faq":
      return (
        <div className="space-y-3">
          <div>
            <Label>Section title</Label>
            <Input value={section.title ?? ""} onChange={(e) => onChange({ ...section, title: e.target.value })} />
          </div>
          {section.items.map((item, idx) => (
            <div key={idx} className="rounded border border-app p-3 space-y-2">
              <Input
                placeholder="Question"
                value={item.question}
                onChange={(e) => {
                  const items = [...section.items];
                  items[idx] = { ...item, question: e.target.value };
                  onChange({ ...section, items });
                }}
              />
              <Textarea
                placeholder="Answer"
                value={item.answer}
                rows={2}
                onChange={(e) => {
                  const items = [...section.items];
                  items[idx] = { ...item, answer: e.target.value };
                  onChange({ ...section, items });
                }}
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ ...section, items: [...section.items, { question: "", answer: "" }] })}
          >
            Add FAQ
          </Button>
        </div>
      );
    case "testimonials":
    case "testimonial_grid":
      return (
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={section.title ?? ""} onChange={(e) => onChange({ ...section, title: e.target.value })} />
          </div>
          {section.items.map((item, idx) => (
            <div key={idx} className="space-y-2 rounded border border-app p-3">
              <Input
                placeholder="Name"
                value={item.name ?? ""}
                onChange={(e) => {
                  const items = [...section.items];
                  items[idx] = { ...item, name: e.target.value };
                  onChange({ ...section, items });
                }}
              />
              <Input
                placeholder="Role"
                value={item.role ?? ""}
                onChange={(e) => {
                  const items = [...section.items];
                  items[idx] = { ...item, role: e.target.value };
                  onChange({ ...section, items });
                }}
              />
              <Textarea
                placeholder="Quote (do not invent testimonials)"
                value={item.quote ?? ""}
                rows={3}
                onChange={(e) => {
                  const items = [...section.items];
                  items[idx] = { ...item, quote: e.target.value };
                  onChange({ ...section, items });
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void pickImage((id) => {
                    const items = [...section.items];
                    items[idx] = { ...item, photoAssetId: id };
                    onChange({ ...section, items });
                  })
                }
              >
                Photo
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ ...section, items: [...section.items, { name: "", quote: "" }] })}
          >
            Add testimonial
          </Button>
        </div>
      );
    case "pricing":
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Checkout price always comes from the course. These fields are display labels only.
          </p>
          <div>
            <Label>Discount label</Label>
            <Input
              value={section.discountLabel ?? ""}
              onChange={(e) => onChange({ ...section, discountLabel: e.target.value })}
            />
          </div>
          <div>
            <Label>Original price label (display)</Label>
            <Input
              value={section.originalPriceLabel ?? ""}
              onChange={(e) => onChange({ ...section, originalPriceLabel: e.target.value })}
            />
          </div>
          <div>
            <Label>Payment description</Label>
            <Input
              value={section.paymentDescription ?? ""}
              onChange={(e) => onChange({ ...section, paymentDescription: e.target.value })}
            />
          </div>
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          <div>
            <Label>Alt text</Label>
            <Input value={section.alt ?? ""} onChange={(e) => onChange({ ...section, alt: e.target.value })} />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void pickImage((id) => onChange({ ...section, assetId: id }))}
          >
            Upload image
          </Button>
        </div>
      );
    case "image_text":
      return (
        <div className="space-y-3">
          <Input
            placeholder="Title"
            value={section.title ?? ""}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
          <Textarea
            placeholder="Body"
            value={section.body ?? ""}
            rows={4}
            onChange={(e) => onChange({ ...section, body: e.target.value })}
          />
          <Select
            value={section.imagePosition ?? "left"}
            onChange={(e) =>
              onChange({ ...section, imagePosition: e.target.value as "left" | "right" })
            }
          >
            <option value="left">Image left</option>
            <option value="right">Image right</option>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void pickImage((id) => onChange({ ...section, assetId: id }))}
          >
            Upload image
          </Button>
        </div>
      );
    case "countdown":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Label</Label>
            <Input value={section.label ?? ""} onChange={(e) => onChange({ ...section, label: e.target.value })} />
          </div>
          <div>
            <Label>Ends at (ISO)</Label>
            <Input
              value={section.endsAt ?? ""}
              onChange={(e) => onChange({ ...section, endsAt: e.target.value })}
              placeholder="2026-12-31T23:59:00Z"
            />
          </div>
        </div>
      );
    case "custom_html":
      return (
        <div>
          <Label>HTML (scripts removed on save)</Label>
          <Textarea
            value={section.html}
            rows={8}
            onChange={(e) => onChange({ ...section, html: e.target.value, advanced: true })}
          />
        </div>
      );
    case "spacer":
      return (
        <div>
          <Label>Size</Label>
          <Select
            value={section.size ?? "md"}
            onChange={(e) => onChange({ ...section, size: e.target.value as "sm" | "md" | "lg" })}
          >
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </Select>
        </div>
      );
    case "lead_capture":
      return (
        <div className="space-y-3">
          <Input
            placeholder="Title"
            value={section.title ?? ""}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
          <Textarea
            placeholder="Body"
            rows={3}
            value={section.body ?? ""}
            onChange={(e) => onChange({ ...section, body: e.target.value })}
          />
          <Input
            placeholder="Button label"
            value={section.buttonLabel ?? ""}
            onChange={(e) => onChange({ ...section, buttonLabel: e.target.value })}
          />
          <Input
            placeholder="Consent text"
            value={section.consentText ?? ""}
            onChange={(e) => onChange({ ...section, consentText: e.target.value })}
          />
        </div>
      );
    case "video":
      return (
        <div>
          <Label>YouTube / Vimeo URL</Label>
          <Input value={section.url ?? ""} onChange={(e) => onChange({ ...section, url: e.target.value })} />
        </div>
      );
    case "benefits":
    case "features":
    case "bonuses":
    case "proof":
    case "social_proof":
      return (
        <div className="space-y-3">
          <Input
            placeholder="Title"
            value={section.title ?? ""}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
          {"items" in section
            ? section.items.map((item, idx) => (
                <div key={idx} className="space-y-2 rounded border border-app p-3">
                  <Input
                    placeholder="Title / value"
                    value={"value" in item ? (item.value as string) ?? item.title ?? "" : item.title ?? ""}
                    onChange={(e) => {
                      const items = [...section.items] as typeof section.items;
                      if (section.type === "proof" || section.type === "social_proof") {
                        (items as Array<{ title?: string; body?: string; value?: string }>)[idx] = {
                          ...(item as { title?: string; body?: string; value?: string }),
                          value: e.target.value,
                          title: (item as { title?: string }).title,
                        };
                      } else {
                        (items as Array<{ title?: string; body?: string }>)[idx] = {
                          ...(item as { title?: string; body?: string }),
                          title: e.target.value,
                        };
                      }
                      onChange({ ...section, items } as SalesPageSection);
                    }}
                  />
                  <Textarea
                    placeholder="Body"
                    rows={2}
                    value={item.body ?? ""}
                    onChange={(e) => {
                      const items = [...section.items];
                      items[idx] = { ...item, body: e.target.value };
                      onChange({ ...section, items } as SalesPageSection);
                    }}
                  />
                </div>
              ))
            : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...section,
                items: [...(("items" in section ? section.items : []) as unknown[]), { title: "", body: "" }],
              } as SalesPageSection)
            }
          >
            Add item
          </Button>
        </div>
      );
    case "comparison":
      return (
        <div className="space-y-2">
          <Input
            placeholder="Title"
            value={section.title ?? ""}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
          />
          <p className="text-xs text-muted">Edit columns/rows in JSON import or keep defaults for a simple table.</p>
        </div>
      );
    case "learning_outcomes":
    case "instructor":
    case "curriculum":
    case "course_preview":
      return (
        <p className="text-sm text-muted">
          This section reads live course data (outcomes, instructor, or curriculum). No extra copy required.
        </p>
      );
    default:
      return <p className="text-sm text-muted">No editor for this section type.</p>;
  }
}
