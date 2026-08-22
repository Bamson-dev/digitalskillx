/**
 * Verified external story sources for the build-software-with-ai sequence.
 * Claims used in copy must stay within what these sources support.
 */
export const WEBINAR_FOLLOWUP_EXTERNAL_SOURCES = [
  {
    id: "cursor-anysphere-context",
    usedInSteps: [2],
    claimUsed:
      "AI-assisted coding tools such as Cursor (Anysphere) are reshaping how software gets built; used as market context only — not a personal income promise.",
    sources: [
      "https://www.indiehackers.com/post/cursor-s-growth-0-100m-arr-in-12-months-928f81135d",
      "Public reporting on Anysphere/Cursor product-led growth (ARR figures vary by outlet/date; we do not quote contested ARR numbers in email copy).",
    ],
    excluded:
      "Do not claim the reader will earn Cursor-level ARR. Do not invent personal founder income for the reader.",
  },
  {
    id: "exp-realty-lovable",
    usedInSteps: [10],
    claimUsed:
      "eXp Realty used Lovable to rebuild sites/tools and cancelled expensive SaaS contracts (industry example from Lovable's published case study).",
    sources: ["https://lovable.dev/blog/exprealty"],
    excluded: "Do not invent savings amounts beyond what the published case study supports in our careful wording.",
  },
  {
    id: "ryplix-bolt",
    usedInSteps: [11],
    claimUsed:
      "Ryplix (founder Dhruval) rebuilt a major US product in about two weeks with Bolt; Bolt reports +$10,000 MRR afterward.",
    sources: ["https://bolt.new/blog/how-ryplix-doubled-its-mrr-in-3-months-with-bolt"],
    excluded: "Do not name the NDA client product. Do not claim the reader will duplicate +$10k MRR.",
  },
  {
    id: "imaginary-space-lovable",
    usedInSteps: [12],
    claimUsed:
      "Harry Roper (Imaginary Space) reported about $100,000/month building with Lovable in interviews (No Code MBA / Lovable video).",
    sources: [
      "https://www.nocode.mba/articles/lovable-agency-ai-coding",
      "https://lovable.dev/video/he-makes-100kmonth-with-his-lovable-agency",
    ],
    excluded:
      "Frame as reported interview revenue, not DigitalSkillX client results. Do not claim 100% AI-built without the human oversight he describes.",
  },
] as const;

export const WEBINAR_FOLLOWUP_INTERNAL_PROOF = [
  {
    id: "leadthur",
    claim:
      "Solo AI-assisted B2B contact discovery; 782 people paid to use it / 681 active / 107 new in a week / 9,460 paid searches / 2,035 trial / ₦15,120,000 estimated revenue in first 3 months.",
  },
  {
    id: "ten-million-project",
    claim: "₦10,000,000 client project payment (no invented project details).",
  },
  {
    id: "shade",
    claim: "₦650,000 from one ecommerce website client; now turning it into an app.",
  },
  {
    id: "chinedu",
    claim: "₦480,000 from one client; client returned requesting a second website.",
  },
  {
    id: "promptearn-credibility",
    claim:
      "PromptEarn: 20+ cars given out; ₦800M+ transactions — operator credibility only. NOT claimed as built with this AI curriculum.",
  },
] as const;
