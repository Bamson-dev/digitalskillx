import type { SequenceEmailContent } from "./render";
import {
  WEBINAR_FOLLOWUP_OFFER_PRICE,
  WEBINAR_FOLLOWUP_OFFER_VALUE,
  WEBINAR_FOLLOWUP_REGULAR_PRICE,
  WEBINAR_FOLLOWUP_REQUIRED_STEPS,
  WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION,
  defaultCtaUrlForStep,
} from "./constants";
import { assertValidWebinarSequence } from "./validate-sequence";

export const BUILD_SOFTWARE_SEQUENCE_LENGTH = WEBINAR_FOLLOWUP_REQUIRED_STEPS;
export const BUILD_SOFTWARE_SEQUENCE_SOURCE_VERSION =
  WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION;

function email(
  stepNumber: number,
  internalTitle: string,
  subject: string,
  altSubjects: [string, string],
  previewText: string,
  bodyText: string,
  ctaLabel: string,
  angle: string,
  category: string,
): SequenceEmailContent {
  return {
    stepNumber,
    internalTitle,
    subject,
    altSubjects,
    previewText,
    bodyText,
    ctaLabel,
    ctaUrl: defaultCtaUrlForStep(stepNumber),
    delayHours: stepNumber === 1 ? 0 : 24,
    angle,
    category,
  };
}

export function buildSoftwareWithAiSequence(): SequenceEmailContent[] {
  const emails: SequenceEmailContent[] = [
    email(
      1,
      "Post-webinar continuation",
      "The webinar ended. Your decision didn't.",
      [
        "You stayed until the closing — here is what happens now",
        "Same offer from the webinar, written down",
      ],
      "Same offer you saw at the close. ₦49,999. Button below.",
      `You stayed through the closing. You already saw the offer. I'm not going to tease you.

**How To Build Software With AI And Get Paid For It** — 10 modules, 8 bonuses, lifetime access. You go from "I have an idea and I'm not a developer" to software a client can use, or paying users can click.

Price on the page: **${WEBINAR_FOLLOWUP_OFFER_PRICE}**. Regular is **${WEBINAR_FOLLOWUP_REGULAR_PRICE}**. Stated stack is **${WEBINAR_FOLLOWUP_OFFER_VALUE}**. You pay ${WEBINAR_FOLLOWUP_OFFER_PRICE} today.

Proof, not vibes:

- Shade: **₦650,000** on one ecommerce site. Now building the app.
- Chinedu: **₦480,000** on one website. Same client came back.
- One client project we delivered: **₦10,000,000**.
- LeadThur, built solo with AI: **782 people paid to use it**, 681 active, 9,460 paid searches, **₦15,120,000 estimated revenue** in the first 3 months. Estimated means estimated — not audited.

I run PromptEarn (₦800M+ in transactions). That is operator proof. What PromptEarn is **not** proof of: this AI-building method. Different business. Different era.

No fake midnight countdown. The door is still open. Tap **Enroll Now — ₦49,999** if you want the seat.`,
      "Enroll Now — ₦49,999",
      "Direct close with stack, price, and named proof",
      "Phase 1 · Reopen",
    ),

    email(
      2,
      "Developer dependency and the market shift",
      "The most expensive sentence: \"I need to find a developer\"",
      [
        "Every idea still waiting on someone else's quote",
        "What that sentence actually costs you",
      ],
      "Quotes, waits, one small change, back in the queue.",
      `You know the loop. You have the idea. Then: "I need to find a developer."

Quote comes in high. You wait. You explain it again. One small change — back in the queue. If they go quiet, your product goes quiet.

I'm not attacking developers. Good ones earn it. I'm naming **dependency**. That's a speed limit on every idea you will ever have.

Building used to mean years of typing before a stranger would pay you. A lot of that typing can now be directed: you say the outcome, you test it like a suspicious user, you ship.

Cursor didn't become one of the fastest-growing developer tools because hobbyists like demos. Pros build **with** AI now. That's the market. Not a promise about your account.

Shade didn't wait on a developer for that ₦650,000 site. Chinedu didn't wait for the ₦480,000 one.

Enrollment is still **${WEBINAR_FOLLOWUP_OFFER_PRICE}**. If you're done waiting on other people's calendars, take the seat.`,
      "Stop Waiting On Developers",
      "Pain of dependency plus named client proof",
      "Phase 1 · Reopen",
    ),

    email(
      3,
      "Operator credibility and honest labelling",
      "₦800M+ in transactions — and what that does not prove",
      [
        "Who is writing these, without the highlight reel",
        "Operator record vs method proof. Keep them separate.",
      ],
      "PromptEarn is real. It is not this curriculum in disguise.",
      `Before you take software-and-money advice from anyone, ask what they actually run.

I operate **PromptEarn** — over **₦800,000,000** in transactions, more than **20 cars** to top performers. Payments, users, churn, support tickets. That's why I can talk about software after launch week without sounding like a YouTube recap.

Now the line most people skip.

What PromptEarn is **not** proof of: it is not evidence that this AI-building method produced it. Different business. Different era. Different build path. If I let you blur those, you should ignore everything else I send.

**Operator credibility** = I've run products with real money moving.

**Method proof** = LeadThur (782 paid, 9,460 paid searches, ₦15,120,000 **estimated** in 90 days), the ₦10,000,000 project, Shade ₦650,000, Chinedu ₦480,000 + return client. Plus published case studies I'll show you — eXp / Lovable, Ryplix / Bolt — that you can go read yourself.

A program that needs blurred lines isn't worth **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.

If you want the training that sits on the method proof, it's on the page from the webinar.`,
      "See Who This Is For",
      "Trust through transparent labelling of proof vs credibility",
      "Phase 1 · Reopen",
    ),

    email(
      4,
      "The idea-to-build gap",
      "Your notes app is full. Your portfolio is empty.",
      [
        "You don't have an idea problem",
        "Four reasons ideas die — none of them is typing speed",
      ],
      "Translate, judge, finish, ship. Typing got cheap.",
      `Open Notes. At least one idea in there would work. Booking for a business you know. A tool that kills a job you hate. Something the shop down the street needs.

How many exist as working software? Usually none.

Not laziness. No bridge. Building the bridge looked like two years of tutorials.

The gap, without poetry:

**You can't translate.** "Like Uber but for tailors" is a feeling, not a spec. AI can't build a feeling.

**You can't judge.** Something gets generated and you can't tell if it's safe or one Saturday from collapsing.

**You can't finish.** 80% feels great. Payments, edge cases, slow networks — that's where projects sleep.

**You can't ship.** Runs on your laptop. Nobody can reach it. Earns nothing.

Typing is the cheap part now. This program follows that order: **Idea-To-Blueprint**, **Teaching AI To Build For You**, **Prompt Playbook**, **Actually Work**, **Remember Things**, **Safety Net**, **On The Internet**.

Weeks, not years — if you show up. LeadThur started as one narrow afternoon-eating task, not a billion-naira vision.

If you want the bridge, enroll at **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "Get The Full Path",
      "Name the real blocker so the curriculum is the answer",
      "Phase 1 · Reopen",
    ),

    email(
      5,
      "LeadThur introduction",
      "Find business contacts in 60 seconds",
      [
        "One person, one narrow problem, one tool that got used",
        "You don't need a billion-naira idea",
      ],
      "B2B hunting used to eat an afternoon. Then it became a product.",
      `B2B hunting: click websites, guess emails, copy names, hope half isn't dead. Afternoon gone. Maybe a dozen usable contacts.

The question: what if that took **60 seconds**?

That's **LeadThur**. Headline is the product: **Find Business Contacts in 60 Seconds**. Describe the businesses. Get people you can actually message.

Two things for you:

It was built **solo**, AI-assisted — directing the build, not typing every line. Same category this program teaches.

It is **narrow**. Not a CRM. Not an email sender. One painful, repeating job. That's why people understood it in one sentence and paid.

Beginners build something huge and vague, then wonder why nobody cares. Steal the pattern: one sharp pain, one person.

Tomorrow I'll open the numbers — 782 paid, 9,460 paid searches, estimated revenue — with the word **estimated** still on it.

You don't need a moonshot. You need a task somebody would pay to skip.

That's in the training. **${WEBINAR_FOLLOWUP_OFFER_PRICE}** while promo pricing is up.`,
      "See The Training",
      "Curiosity plus a buildable narrow problem",
      "Phase 1 · Reopen",
    ),

    email(
      6,
      "LeadThur numbers and estimated revenue",
      "782 paid. 9,460 paid searches. ₦15.12M estimated.",
      [
        "First 90 days of LeadThur, no highlight reel",
        "681 active is the number that actually matters",
      ],
      "Usage first. Money second. The word estimated stays.",
      `LeadThur. First three months. Exact:

- **782 people** paid to use it
- **681** active (not a dead list)
- **107 new users** in one week in that window
- **9,460 paid searches**
- **2,035 trial searches** before people paid
- **₦15,120,000 estimated revenue**

Estimated = modelled from paid search volume and pricing. Not an audited statement. I will not dress it up.

681/782 active means it worked. Dead accounts vanish. People who keep searching have a real problem.

9,460 paid vs 2,035 trial means they tested, then paid for more. That's a business, not a demo.

107 in a week means it spread without a big ad budget. Save someone an afternoon and they tell a colleague.

I am **not** saying you get 782 paying users in quarter one. Markets differ. Execution differs.

I **am** saying: one person, one narrow problem, AI-assisted, no permission, no team — and thousands of paid actions later it's real.

That's the path in the curriculum. Seat is **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Curriculum",
      "Hard usage proof with honest qualifiers",
      "Phase 2 · Proof",
    ),

    email(
      7,
      "Ten million naira client project",
      "One project. ₦10,000,000.",
      [
        "The fee follows the problem, not the lines of code",
        "Business budgets are not personal budgets",
      ],
      "One client. One serious problem. One invoice.",
      `Products are one road. Client work is the other. Client work usually pays first.

We delivered a project. **Project payment: ₦10,000,000.**

I'm not decorating it. One client. One serious business problem. That's the number.

Nobody pays ten million for a login screen. They pay when the pain is already costing more than that — hours, lost revenue, risk. The invoice size tracks the pain, not how clever the code looked.

When you sell to a person, you compete with rent. When you fix a company's operations, you compete with what the mess already wastes every month.

Once they've seen something you built that works, they stop asking where you studied. They ask if you pick up the phone when it breaks.

Your first job will not look like this. Shade's ₦650,000 and Chinedu's ₦480,000 are closer to first-project land — and both still dwarf **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.

The **Get-Paid Guide** is in the stack because building without scoping and pricing is a hobby.

If you want that stack, enroll.`,
      "See The Training Stack",
      "Raise the ceiling with one verified project",
      "Phase 2 · Proof",
    ),

    email(
      8,
      "Shade — ₦650,000 ecommerce project",
      "Shade charged ₦650,000 for one ecommerce website",
      [
        "One site. One payment. Then the app.",
        "You don't need to go viral. You need one client.",
      ],
      "My numbers are easy to dismiss. Shade's are harder.",
      `Shade built an **ecommerce website for one client. ₦650,000.** One project. One payment.

Sit that next to **${WEBINAR_FOLLOWUP_OFFER_PRICE}** for a second.

Then: **she's turning that same work into an app.**

That's the game. Deliver one thing properly. Client trusts you. Conversation widens — mobile, stock alerts, brother's business. You're not chasing cold work. You're extending warm work.

No audience required. One client with a real shop, a site that works, customers who can actually check out.

That's why **Making App Look Good** exists — cheap-looking ecommerce loses sales. **Actually Work** and **Remember Things** exist because one failed checkout costs the referral and the app job.

I'm not promising you ₦650,000. I am telling you competent delivery is scarce, and that's what the market pays.

Modules are on the page. Take the seat if you want them.`,
      "Explore The Modules",
      "Relatable single-project proof plus the second opportunity",
      "Phase 2 · Proof",
    ),

    email(
      9,
      "Chinedu — ₦480,000 and the repeat client",
      "Chinedu earned ₦480,000 — then the client came back",
      [
        "The return visit is the real review",
        "Repeat work is how this becomes income, not a one-off",
      ],
      "Anyone can luck into one job. A return means they lived with your work.",
      `If I could keep one proof point, it wouldn't be the biggest number.

**Chinedu: ₦480,000 for a website. Same client asked for a second one.**

₦480,000 is good. The return is the signal.

First jobs happen from luck, a cousin, a client in a hurry. A client who comes back has used it on a bad-network Monday, found the annoying bit, watched how you handled a change — and still paid you again.

That's the review that counts.

Second jobs are cheaper to win. No pitch. No proving yourself against the cheapest quote. Two or three of those and you have something like income without running ads.

What earns it: you said the scope, you delivered, it kept working, you replied, you didn't vanish when it broke.

**Actually Work. Remember Things. Safety Net. Get-Paid Guide.** That's the unglamorous stack.

Reputation compounds faster than skill. Deliver twice and work starts finding you.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}** to get in while promo pricing holds.`,
      "See The Delivery Modules",
      "Proof around reliability and repeat business",
      "Phase 2 · Proof",
    ),

    email(
      10,
      "eXp Realty and Lovable — industry example",
      "A real estate giant cancelled SaaS bills and rebuilt in-house",
      [
        "eXp Realty + Lovable — go read it yourself",
        "Buy vs build is breaking. That's your opening.",
      ],
      "Not my story. Their published case study.",
      `Don't only take my word. Here's one you can verify.

**eXp Realty** — large US real estate org. Case study on **Lovable's blog**: they used it to rebuild websites and internal tools, and **cancelled expensive SaaS** they didn't need anymore.

Their outcome. Their context. Not a promise about you.

For 20 years the default was **buy**. Rent a tool that does 80% of the job, forever. Building custom was slower and more expensive.

That trade is cracking. When someone can direct an AI builder and ship the tool a team actually needs, a bloated subscription starts looking like a habit.

Now look at your street. Pharmacies, schools, distributors — half-fit software plus WhatsApp and spreadsheets. The person who builds the missing piece sells what eXp bought: **fit, ownership, end of a bill that never quite worked.**

You don't need their budget. You need the skill and one painful gap. **On The Internet** puts the build where people can open it. **Zero-Cost Toolkit** keeps your own stack cheap while you learn.

Last webinar-link email. After this, I send you straight to the offer.

If you haven't enrolled: **${WEBINAR_FOLLOWUP_OFFER_PRICE}**. Replay/register is still the button.`,
      "See What Is Included",
      "External verifiable proof translated to local market",
      "Phase 2 · Proof",
    ),

    email(
      11,
      "Ryplix and Bolt — speed case study",
      "Rebuilt in about two weeks. Then +$10,000 MRR.",
      [
        "Bolt published it. Two weeks. Monthly revenue after.",
        "Speed is clarity. Vague briefs generate confident mess.",
      ],
      "Bolt's Ryplix case study — attributed, not stolen as yours.",
      `Bolt published a case study on **Ryplix**: rebuilt a major US product in roughly **two weeks**, then about **$10,000 monthly recurring revenue**.

Bolt's published figures. Not my client. Not your forecast.

**Two weeks** used to be a quarter plus a team. When a real build costs weeks not months, you can test instead of theorising for a year.

**Monthly** is the word. Job vs asset.

Beginners misread this. Speed isn't the AI typing fast. It's **clarity**. Someone already knew what version one must do and what it must not. Point AI at a vague brief and you get confident nonsense, then three weeks of untangling.

That's why **Idea-To-Blueprint** sits before heavy building, and why the **Prompt Playbook** exists.

I'm not claiming +$10k MRR for you. I'm saying the category exists, the platforms publish it, and timelines collapsed for people who can direct a build.

Offer page from here on. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Build Sequence",
      "Speed as strategy, clarity as the skill",
      "Phase 2 · Proof",
    ),

    email(
      12,
      "Imaginary Space and Harry Roper — agency scale",
      "An agency reporting about $100,000 a month with AI builders",
      [
        "Same tools. Different operator layer.",
        "Building is one of six things a software business needs.",
      ],
      "Harry Roper / Imaginary Space on No Code MBA. Reported, not audited.",
      `Harry Roper, **Imaginary Space**, interview on **No Code MBA**: around **$100,000/month**, Lovable as the build layer. Lovable featured him too. That's what he reported. I haven't audited his books.

I'm not sending this so you daydream about six-figure months.

Same tools as you. Lovable, Bolt, Cursor — the floor dropped for everyone. So why does one operator invoice at that scale and thousands with the same login never send a first invoice?

Tools solve **building**. They don't hand you clients, pricing nerve, quality control, scope control, positioning, or delivery so people come back like Chinedu's client.

That operator layer is why this isn't ten videos of button-clicking. **Get-Paid Guide. Software Marketplace Guide. Organic And Paid Ad Formula.**

Don't measure yourself against a scaled agency this week. Measure: one build that works, one client who pays, one who returns. That's the ladder. Shade and Chinedu are on it. LeadThur is the product version of it.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}** on the offer.`,
      "See The Business Modules",
      "Reframe tool envy to operator skills",
      "Phase 2 · Proof",
    ),

    email(
      13,
      "Where ideas come from",
      "Good software ideas are found, not invented",
      [
        "Stop brainstorming. Start listening.",
        "LeadThur wasn't a shower thought.",
      ],
      "Boring noticed problems get paid. Brilliant original ones usually don't.",
      `"I don't have an idea" usually means "I don't have a brilliant original one." Good. Brilliant original rarely gets paid. Noticed and boring does.

Nobody invented LeadThur in the shower. Somebody watched contact-hunting eat an afternoon and built the 60-second version.

Where to look:

**Your own irritation.** If a task makes you sigh, someone with a bigger budget is sighing too.

**Spreadsheets doing jobs they shouldn't.** Booking, stock, payroll in Excel. That's a brief.

**WhatsApp as infrastructure.** Orders, shifts, complaints in group chats. Confusion has a price.

**Work a human already gets paid to do.** Copy-paste between systems. Budget already exists.

**A niche you already know.** Tailors, clinics, schools, churches, logistics. Outsiders never hear that pain.

**App Idea Vault** is for dry weeks. Your unfair advantage is still the industry you already sit in.

Write five tonight. Tomorrow: which ones are worth a month.

If you want the idea + blueprint modules, they're in the offer at **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Idea Modules",
      "Remove the no-idea blocker with a sourcing method",
      "Phase 3 · Education",
    ),

    email(
      14,
      "Problems worth solving",
      "Not every problem deserves software",
      [
        "Four questions before you waste six weeks",
        "LeadThur sat on a task people repeat constantly",
      ],
      "Daily pain with existing spend beats an exciting idea with no buyer.",
      `Five ideas in your notes are not equal. Some have money. Some are just annoying.

Four questions:

**How often?** Daily/weekly builds a habit. Twice a year doesn't. LeadThur sits on a repeating sales task — that's how you get 9,460 paid searches, not a handful of curious clicks.

**What's the current cost?** Hours, salaries, mistakes, lost sales. "Saves six hours a week" sells. "Makes things nicer" doesn't.

**Is money already moving?** Bad subscription, staff doing it by hand, expensive agency. eXp had SaaS bills before they had a rebuild.

**Can you reach the buyer?** Five people you know with the problem = a start. Zero = a research project.

Exciting ideas fail three of these. Boring ones pass all four.

**Idea-To-Blueprint** turns a passing idea into users, flows, data, and a ruthless "version one will not" list.

Score your five. Keep one. Then enroll if you want the module that turns it into a spec — **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Blueprint Module",
      "Practical filter that creates forward motion",
      "Phase 3 · Education",
    ),

    email(
      15,
      "Why businesses pay for software",
      "Businesses don't buy apps. They buy four things.",
      [
        "Time, leaks, mistakes, control",
        "Talk outcomes. Price follows.",
      ],
      "Nobody wakes up wanting your stack. They want a cost gone.",
      `No owner wakes up wanting an app. They want a result. Software is often the cheapest way to get it.

They pay for:

**Time.** Nine hours a week on something a form could do. Repeats every week. Easiest sale in the book.

**Money leaking.** Abandoned checkout, orders lost in a group chat, invoices nobody chased. Close the leak, it pays for itself.

**Mistakes.** Manual process → refunds, fines, angry customers. You're selling calm.

**Control.** Most small owners don't know this week's numbers. A dashboard that tells the truth gets funded — same reason eXp rebuilt internals.

They don't buy your framework. They buy the outcome.

Don't say "web app with admin panel." Say "your staff burns two days a month on this. After next week they won't." Same build. Different price.

That's the **Get-Paid Guide**. Shade's ₦650k and Chinedu's ₦480k sat on conversations like that, not on prettier code.

Offer is **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Get-Paid Guide",
      "Value translation so pricing feels natural",
      "Phase 3 · Education",
    ),

    email(
      16,
      "Client work vs your own product",
      "Client projects or your own product? Pick one for 90 days.",
      [
        "Cash now vs asset later",
        "Walking both roads at once is how people stall",
      ],
      "Same skill. Two roads. Don't start both this quarter.",
      `Two roads. Mixing them in month one is how capable people stall.

**Client work:** Shade ₦650,000. Chinedu ₦480,000 + return. The ₦10,000,000 project. One business, one invoice, then the next (or the extension).

**Your product:** LeadThur. 681 active, 9,460 paid searches, ₦15,120,000 **estimated** in 90 days. Many small payments. No single hero cheque.

Client work pays sooner. Buyer exists. You learn scope and delivery under pressure. Income stops when you stop.

Products pay later, then keep paying if they work. Most products fail. The ones that work don't need you selling every morning.

Don't launch an agency, a SaaS, and a marketplace profile in 90 days. You'll get two half-finished things and a story that "it didn't work."

Need cash, like talking to owners, already know businesses with gaps? Client road. Get-Paid Guide. One delivered project.

Have runway, love building, know one narrow pain cold? Product road. Blueprint, ship, then distribution.

Skill is the same. Switch later. Not both while you're still learning to walk.

Both paths are in the program. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "Choose Your Path Inside",
      "Force a single focused decision",
      "Phase 3 · Education",
    ),

    email(
      17,
      "Recurring revenue",
      "Paid once vs paid every month",
      [
        "Shade's invoice ended. LeadThur's searches didn't.",
        "Retainers count. You don't need a funded SaaS.",
      ],
      "One-off feeds you. Recurring changes how you live.",
      `Shade: ₦650,000 for one site. Then that month starts at zero until the next job (or she extends it into the app).

LeadThur: **9,460 paid searches**, **681 active**, **₦15,120,000 estimated** in three months. Nobody wrote one giant cheque. The tool kept working.

Ryplix, per Bolt: ~**$10,000/month**. Monthly is the word.

You don't need to fight funded SaaS.

**Pay-per-use** — like LeadThur. No "subscribe" speech.

**Tiny niche subscriptions** — 200 clinics, modest fee, hours saved. VCs won't bother you.

**Retainers** — hosting, small changes, support after you already built it. Ten modest retainers is recurring from work you already did.

**Replace their SaaS, keep it healthy** — eXp pattern at street scale.

Don't chase recurring on day one. Stop assuming every project must die at handover.

That's in the product + Get-Paid modules. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Product Modules",
      "Expand from gigs to durable income",
      "Phase 3 · Education",
    ),

    email(
      18,
      "Pricing",
      "Stop pricing your hours. Price the problem.",
      [
        "₦480k and ₦10M can both be fair",
        "Hourly thinking punishes you for getting faster",
      ],
      "AI made your hours fewer. Don't charge fewer naira for it.",
      `Two builders. Similar websites. One asks ₦120,000 and feels guilty. One asks ₦650,000 and the client says thank you. Rarely skill. What they think they're selling.

Charge hours and AI just made you poorer. Faster = less money. That's backwards.

You're removing a problem. Problems already have a price.

That's why ₦480,000, ₦650,000, and ₦10,000,000 can all be fair. The ₦10M job wasn't a thousand times more code. The pain was bigger.

**Anchor to their cost.** Staff time, lost sales, refunds. If the mess burns ₦300k/month, a ₦650k build that ends it is cheap. Ask those questions before you say a number.

**Quote scope + outcome, not time-and-materials.** Six things, three weeks, this price. Extra is extra. Vague scope is how you work three unpaid weeks.

**Don't be cheapest.** Cheap clients negotiate hardest and never return. Chinedu's second site wasn't a discount play. It was reliability.

**Get-Paid Guide** is the conversation training. **${WEBINAR_FOLLOWUP_OFFER_PRICE}** vs one invoice like Chinedu's is not a close call.`,
      "See The Pricing Training",
      "Pricing confidence from value not effort",
      "Phase 3 · Education",
    ),

    email(
      19,
      "Simple software wins",
      "The boring apps make the money",
      [
        "LeadThur is one input, one output",
        "Nobody pays extra for clever",
      ],
      "Useful and boring beats impressive and unfinished.",
      `Your first paid build should not be impressive. It should be useful. Useful is usually boring.

LeadThur: describe the businesses, get contacts. No social feed. No chat bot bolted on. Thousands of paid searches.

Look around: attendance, invoices, bookings, stock, deliveries, rotas. Spreadsheets and notebooks. Unglamorous. Paid.

Nobody pays extra for clever. They pay for the ledger being right and the booking not double-selling.

**Simple ships.** Thirty features is a renovation you abandon.

**Simple is testable.** That's why **Actually Work** and **Remember Things** are real modules, not slogans.

**Simple sells.** "Contacts in 60 seconds" is one line. If your pitch takes two minutes, you already lost.

**Idea-To-Blueprint** is mostly the exclusion list. Version one exists because of what you refuse to build.

Ship the slightly embarrassing one. Shade's ₦650k site wasn't a platform. It was ecommerce that worked.

Offer: **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Build Path",
      "Lower the bar and redirect ambition into shipping",
      "Phase 3 · Education",
    ),

    email(
      20,
      "Validation and first customers",
      "Know somebody wants it before you build it",
      [
        "Five conversations beat six weeks of guessing",
        "First customers are those five people, not a viral post",
      ],
      "Most failed builds weren't badly built. They were unwanted.",
      `Worst mistake isn't bad code. It's a finished thing nobody asked for. You can know that before you build.

**Talk to five people who have the problem.** Not supportive friends. How they do it today, how long, what they tried, what they already pay.

**Watch them do the task.** They forget the second spreadsheet and the WhatsApp after. Fifteen minutes of watching beats an hour of asking.

**Listen for existing spend.** Subscription, staff, agency. Budget conversation is mostly over.

**Ask for the sale before it exists.** "If this worked as we described, would you pay — what's fair?" Watch for a number or a deposit. Enthusiasm is cheap.

**Show a rough version fast.** AI-assisted, days not months. Feedback on a click beats feedback on a speech.

LeadThur solved a problem the builder lived. Shade and Chinedu had one real client each, not an audience.

**App Idea Vault**, **Software Marketplace Guide**, **Idea-To-Blueprint**. Start with three conversations this week — then get the training if you want the rest of the path. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Validation Training",
      "Replace fear of wasted effort with a pre-build process",
      "Phase 3 · Education",
    ),

    email(
      21,
      "Objection — I cannot code",
      "\"But I can't code\" — the honest version",
      [
        "You don't write it from memory. You direct it.",
        "Shade and Chinedu weren't selling computer science.",
      ],
      "You will see code. You will not need two years of syntax.",
      `I'm not going to tell you you'll never see code. That's a lie. Week one you'd catch me.

You don't need to write loops from memory. That two-year skill is the part that got automated.

You do need to be **around** code. Read an error. Roughly know which file. Paste the error, say what you expected, get a fix. Weeks, not years.

Think director, not camera operator. You decide the scene. You watch the take. "Again, slower." Judgement. Direction.

Specify → AI produces → you test → you correct → you ship.

**Zero-To-Builder Setup** exists because people quit at five conflicting tutorials, not because they're "not technical." **Teaching AI To Build For You** is the craft: context, small steps, checkpoints.

Shade ₦650,000. Chinedu ₦480,000. Websites that worked. Not PhDs.

Start module one. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See Module One",
      "Neutralise the coding objection without hype",
      "Phase 4 · Objections",
    ),

    email(
      22,
      "Objection — I am not technical",
      "\"I'm not technical\" is a story, not a lab result",
      [
        "Four habits. None of them is a science degree.",
        "Give module one a week. Then decide with evidence.",
      ],
      "Nobody was born technical. It's follow-the-steps plus don't panic at ERROR.",
      `You weren't born "not technical." Every engineer you admire didn't know what a folder was.

Four habits. Score yourself:

**Follow the sequence.** Don't skip step four. Most "I'm not technical" moments are skipped steps.

**Read the red ERROR.** It's a rude instruction. Paste it. Ask. Closing the laptop is the actual filter.

**Sit with not-knowing for a few days.** Builders live in partial understanding. Not a maths personality.

**Ask a specific question.** "It doesn't work" goes nowhere. "I clicked save, expected the record, got this message" gets you unstuck — from AI or from **Private Support Family**.

None of that needs youth or a science background.

Calling yourself non-technical is comfortable. It turns a decision into a fact. Expensive comfort.

Fair test: one week of module one. Finish setup. See how you behave when it breaks. Then decide.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "Test Yourself In Week One",
      "Dismantle identity resistance with behavioural tests",
      "Phase 4 · Objections",
    ),

    email(
      23,
      "Objection — I do not know what to build",
      "\"I don't know what to build\" — fix it this weekend",
      [
        "First build ≠ first business",
        "Ask one owner what part of the week is annoying",
      ],
      "Small, useful to one person, finished. That's the assignment.",
      `This is the easiest objection. You can kill it Saturday.

You're waiting for an idea big enough to feel safe. That idea isn't coming. LeadThur was an obvious annoyance, done narrowly.

And you've mixed **first build** with **first business**. Different jobs.

First build teaches you. Small. Useful to one person. Finished. Booking for a salon you know. Invoices for an uncle's shop. Stock for a trader. Attendance for a school. Nobody has to buy it. You have to complete blueprint → internet.

After that, you stop hunting ideas. You notice them.

Pick one business you can reach. What's the most annoying part of the week? What's in a notebook? Build the smallest fix.

No access? **App Idea Vault.** Empty folder fear? **Done-For-You Template Pack.**

Nobody's first build was their masterpiece. It was their first finished thing.

Then enroll so you're not guessing the path. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Idea Bonuses",
      "Separate first build from first business",
      "Phase 4 · Objections",
    ),

    email(
      24,
      "Objection — AI makes mistakes",
      "Yes, AI writes wrong code. That's not the deal-breaker.",
      [
        "Professionals work small. Beginners dump the whole app in one prompt.",
        "Bugs are normal. Catching them cheap is the skill.",
      ],
      "Confidently broken output is the lesson. The workflow is the fix.",
      `If you've already seen an AI builder produce something that looks perfect and dies on a real click — good. That's the job.

It invents functions. Forgets a decision. Fails the way a real person uses it.

Pros don't stop. Beginners write one giant prompt, accept everything, pile more on, then conclude AI "can't build software."

Pros:

**Small pieces.** One feature. Reviewable. Fixable.

**Say what working means.** Empty form → this specific thing happens. Then test that.

**Use it like a suspicious customer.** Empty fields. Back button. Bad network.

**Save points.** Last working version, not memory.

**Teaching AI To Build For You. Prompt Playbook. Actually Work.** Reliability is a habit, not a hope at the end.

Humans ship bugs too. That's why testing and rollbacks exist.

Mistakes are normal. Cheap catches are the skill.

That's in the offer. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Reliability Modules",
      "Turn AI-fear into method",
      "Phase 4 · Objections",
    ),

    email(
      25,
      "Objection — what if it breaks",
      "Your app will break at 9pm. Then you fix it.",
      [
        "Twenty minutes vs catastrophe",
        "Chinedu's client came back because of the human, not perfection",
      ],
      "Clients expect bugs. They don't expect radio silence.",
      `The fear: I build for a real client, it breaks, I'm exposed.

It will break. Every company you can name ships bugs.

Pros: twenty-minute incident, not a lost weekend.

**Version control.** Today's mess → yesterday's working copy.

**Backups.** Code can be rewritten. Customer records can't.

**Practice space vs live.** Don't test on the thing customers use.

**Read the error.** Paste it. Say what you expected.

That's **Safety Net**. It's there because fear of public failure keeps people on private practice forever.

Clients have used broken software. They judge your reply. Fast, plain, fixed — often more trust after the incident. Silent — you lose everything. That's a big part of Chinedu's second website. Not flawless. Reliable human.

You'll break something. You'll fix it. Then you'll stop being scared of it.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Safety Net Module",
      "Remove fear of public failure with recoverability",
      "Phase 4 · Objections",
    ),

    email(
      26,
      "Objection — I cannot afford tools or developers",
      "You can't afford a developer. That's the point.",
      [
        "One quote vs learning to build it",
        "Free tiers first. Subscriptions after money shows up.",
      ],
      "Dependency repeats. Enrollment is once.",
      `Get a quote for a booking system or a small internal tool. Compare it to **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.

Then remember: every change is another quote. You're not buying one site. You're renting the ability to build, forever.

Second worry: I'll enroll and then need six paid tools.

**Zero-Cost Toolkit.** Free tiers, cheap starters, ship a demo a client can click without a stack of debit alerts. Spend when something earns.

Most beginners reverse it: pay for tools, ship nothing, quit while bills keep hitting.

**Zero-To-Builder Setup** stays minimal. **Done-For-You Template Pack** so you're not paying for a blank folder.

Full price math in a few emails: ${WEBINAR_FOLLOWUP_OFFER_PRICE} vs ${WEBINAR_FOLLOWUP_REGULAR_PRICE} vs ${WEBINAR_FOLLOWUP_OFFER_VALUE} stated stack (₦450k modules + ₦315k bonuses + ₦40k fast-action where it applies). No games.

Tools are not what's blocking your first working build. The quote on the other side of "find a developer" is.

Take the seat.`,
      "See The Zero-Cost Toolkit",
      "Tool cost vs repeating developer spend",
      "Phase 4 · Objections",
    ),

    email(
      27,
      "Objection — I cannot find clients",
      "Where the first client actually comes from",
      [
        "Not a viral post. Five boring places.",
        "Chinedu's second job was a referral from the first.",
      ],
      "Trust you already have beats a following you don't.",
      `"How do I find clients?" is the right question. Internet answers assume 10k followers.

Actual order:

**People who already know you.** Family business, church, estate, old job. Unglamorous. Fastest first payment. Trust exists. Prove capability once.

**Businesses you can walk into.** Clinic, salon, school, pharmacy. "You track deliveries by hand. I can build that." One observation. No deck.

**Narrow position.** "I build software" is forgettable. "Booking and records for small clinics" is referable. LeadThur: contacts in 60 seconds.

**Marketplaces** once you have one or two pieces. **Software Marketplace Guide.**

**Repeat + referral.** Chinedu: ₦480,000, then the same client again. Do one job well.

No virality on that list. **Get-Paid Guide** is the conversation: approach, scope, quote.

I'm not promising a roster in 30 days. I am telling you the paths are boring and available this week.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Get-Paid Guide",
      "Concrete low-status-required client pipeline",
      "Phase 4 · Objections",
    ),

    email(
      28,
      "Objection — nobody will buy from me",
      "\"Nobody will buy from me\" — the one under the others",
      [
        "Proof beats reputation",
        "The pharmacy on your street is not being hunted by agencies",
      ],
      "One working thing. One specific promise. Deliver what you said.",
      `Even if I learn this, why me? No brand. No portfolio.

How buyers actually decide:

**Proof beats reputation.** A working thing — even unpaid, for a business you know — beats a bio. Two pieces is enough for a first real client. Shade and Chinedu weren't famous.

**Specific beats famous-general.** Three clinics + you've built clinic records = you're the obvious person in the room.

**Process beats charm.** They're afraid you'll take a deposit and vanish. "Version one is these things, this timeline, this is how you'll see progress." Safer than a prettier website.

**Small paid first.** Nobody owes you ₦650,000 on day one. A landing page or one internal tool. Deliver. Next conversation is bigger. That's how Chinedu's second site happened.

The businesses that need this aren't being courted. No agency is calling that pharmacy.

You need one thing that works and the discipline to deliver it.

That's the program. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Full Program",
      "Close the credibility gap with buyer mechanics",
      "Phase 4 · Objections",
    ),

    email(
      29,
      "Value stack — modules one to five",
      "Modules 1–5: what they actually save you",
      [
        "Setup, direction, blueprint, prompts, polish",
        "Scattered YouTube is months. This is an order.",
      ],
      "Not titles. What each one removes from the path.",
      `What's in the first half, in human:

**1 — Zero-To-Builder Setup.** Tools, accounts, folders, order. Looks boring. It's where most people quit — five tutorials, broken environment, "I'm not technical."

**2 — Teaching AI To Build For You.** Why some people get magic and some get a junk folder. Context, small steps, when to reject output.

**3 — Idea-To-Blueprint.** Feeling → spec. Users, flows, data, exclusion list. Ryplix's ~two-week rebuild (Bolt's case study) was possible because direction was clear.

**4 — Prompt Playbook.** Recurring situations: new feature, bug, polish, restructure without breaking it. Stop staring at a blank box.

**5 — Making App Look Good.** Layout, mobile, when to stop. Shade's ₦650,000 ecommerce wasn't won on invisible elegance. Customers judge in seconds.

Learning those five from random free videos is months of wandering.

Tomorrow: 6–10 — the half that makes it worth money.

All ten + bonuses: **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See Modules One To Five",
      "Concrete value per early module",
      "Phase 5 · Value stack",
    ),

    email(
      30,
      "Value stack — modules six to ten",
      "Modules 6–10: demo vs software people pay for twice",
      [
        "Test, memory, recovery, live URL, app stores",
        "LeadThur's 9,460 searches needed reliability, not a pretty landing page",
      ],
      "Looking like software is easy now. Surviving launch week is the craft.",
      `**6 — Actually Work.** Empty states, bad input, old phone, bad network. Demo vs launch week.

**7 — Remember Things.** Data that stays right next month. LeadThur ran **9,460 paid searches** because results came back. Nobody pays twice for software that forgets.

**8 — Safety Net.** Versions, backups, practice vs live. Twenty-minute scare vs lost weekend.

**9 — On The Internet.** Domain, hosting, a URL a client opens on their phone. Laptop software earns nothing. The ₦10,000,000 project and Shade's site were not localhost.

**10 — App Stores.** When web is enough, when native matters, what not to over-promise on a call. Shade turning ecommerce into an app is exactly this moment. Nobody controls Apple's review times. We won't pretend to.

Ten modules in project order. Free content can't give you that order.

Eight bonuses next. Full stack **${WEBINAR_FOLLOWUP_OFFER_PRICE}** vs **${WEBINAR_FOLLOWUP_REGULAR_PRICE}** regular.`,
      "See Modules Six To Ten",
      "Reliability and shipping as the paid difference",
      "Phase 5 · Value stack",
    ),

    email(
      31,
      "Prompt Playbook and the cost of bad prompting",
      "Bad prompting is the most expensive habit in this work",
      [
        "Same tool. Wildly different Friday.",
        "Vague briefs cost hours, credits, and belief",
      ],
      "You don't have a talent problem. You have an instruction problem.",
      `Same AI builder. Same idea. One person has a working app Friday. The other has broken files and a theory that AI is overhyped.

**Hours.** Vague in → plausible junk → debug something you never specified.

**Money.** Ten sloppy regenerations cost more than two precise ones.

**Coherence.** Patches here break things there. Two weeks later nobody can reason about it. That's where projects die.

**Belief.** You conclude you're not technical. You were a contractor with a foggy brief.

**Prompt Playbook:** add a feature without wrecking the rest, fix a bug with the error + expected behaviour, polish without breaking mobile, restructure without changing behaviour, review before you accept.

Patterns, not vibes. Then you can reuse them instead of re-explaining your brain every session.

That's one module in a stack priced at **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Prompt Playbook",
      "Make waste visible so training feels like a saving",
      "Phase 5 · Value stack",
    ),

    email(
      32,
      "Bonuses — templates, ideas, support",
      "Three bonuses for the three reasons people quit",
      [
        "Stuck, blank, or alone",
        "Modules teach. These keep you present.",
      ],
      "People don't quit because it's hard. They quit stalled.",
      `**Done-For-You Template Pack.** Start from something that runs. Empty folder at 10pm is where enthusiasm dies. Customising is a job you can start tired. Not a substitute for the modules — it's why you practise enough for the modules to stick.

**App Idea Vault.** When your list is empty. Practice builds. Study what a narrow product looks like (LeadThur: one repeating pain, faster than a human). So "I don't know what to build" can't eat a month.

**Private Support Family.** Three days lost on something a human who's seen it would kill in ten minutes. That's the tax that kills momentum. Also: other people's messy first builds. You stop thinking you're uniquely unsuited.

Modules teach building. These keep you in the room long enough for that to work. First 90 days is mostly momentum.

Eight bonuses total. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Bonuses",
      "Bonuses as protection against real quit points",
      "Phase 5 · Value stack",
    ),

    email(
      33,
      "Bonuses — money, cost, and being found",
      "The bonuses that turn building into getting paid",
      [
        "Get-Paid, Zero-Cost, Marketplace",
        "Who actually pays you is not a mystery",
      ],
      "Skill without a path to an invoice is an expensive hobby.",
      `**Get-Paid Guide.** Approach, scope version one, say a number, handle changes, payment terms, deliver like someone who wants a referral. Shade ₦650,000 and Chinedu ₦480,000 were competent business conversations that ended in an agreement — not secret code.

**Zero-Cost Toolkit.** Learn, build, demo, deploy without six subscriptions before you've earned. Reverse that and you quit while the debits continue.

**Software Marketplace Guide.** Private building is invisible. How directories work, what buyers scan for, how to be findable. LeadThur still had to be found and understood in one sentence.

Somebody with a problem, a budget, and a reason to trust you. Getting in front of them, charging, delivering — that's a skill set. It's included on purpose.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}**. Regular **${WEBINAR_FOLLOWUP_REGULAR_PRICE}**.`,
      "See The Monetization Bonuses",
      "Connect capability to income mechanics",
      "Phase 5 · Value stack",
    ),

    email(
      34,
      "Bonuses — lifetime access and attention",
      "AI changes every month. Your access doesn't expire.",
      [
        "Tools shift. Booking systems don't.",
        "Ads when you have something worth showing — not week one.",
      ],
      "\"It'll be outdated\" is an argument for access, not for waiting.",
      `Tools change fast. Fair. Also an argument to learn, not to wait.

Businesses still need bookings, stock, dashboards, contact workflows. LeadThur's job doesn't vanish because a new model dropped. You relearn the interface. Judgement stays.

Frozen curriculum does go stale. Two bonuses for that:

**Lifetime Access + Free Updates.** Not a snapshot of one month in AI. Material can move. You're not rebought every quarter. A bad month costs time, not another checkout.

**Organic And Paid Ad Formula.** Attention when you have something worth showing. Don't need it week one. Around project two or three the constraint becomes "who sees this?" That's when this bonus matters.

This isn't a weekend binge. It's months of skill, with the material still underneath you.

Full stack **${WEBINAR_FOLLOWUP_OFFER_VALUE}** stated (₦450k + ₦315k + ₦40k fast-action where it applies). You pay **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See Lifetime Access Terms",
      "Handle volatility; extend the time horizon",
      "Phase 5 · Value stack",
    ),

    email(
      35,
      "Price and value math",
      "₦49,999 now. ₦100,000 regular. ₦805,000 stated. Honest math.",
      [
        "What each number is — and isn't",
        "Compare to a developer quote and one client invoice",
      ],
      "No crossed-out stunt. Three figures, then useful comparisons.",
      `Three numbers.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}** — what you pay today (promo).

**${WEBINAR_FOLLOWUP_REGULAR_PRICE}** — regular price. Same modules, same bonuses.

**${WEBINAR_FOLLOWUP_OFFER_VALUE}** — stated stack: **₦450,000** modules + **₦315,000** bonuses + **₦40,000** fast-action where that bonus applies. Not cash in your account. It's what you'd otherwise assemble from pieces, in an order you'd guess at.

Inflated stacks are why people distrust this industry. I'm labelling it.

Fast-action isn't a fake countdown. Where it applies, extra. Where not, the rest is still the offer.

Useful comparisons:

**One developer quote** for a booking system or internal tool. Then every change is another quote.

**One client project.** Chinedu ₦480,000. Shade ₦650,000. Not your guarantee. That's what the market paid for one delivery.

**Another year of research mode.** Free courses, no shipped project. Costs nothing. Returns nothing. Most expensive option.

I won't say the price dies tonight. That would be a lie.

Promo pricing is what it is. The skill gap doesn't wait.

Itemised stack is on the offer. Enroll if the math is obvious.`,
      "Compare Price And Stack",
      "Transparent value with credible anchors",
      "Phase 5 · Value stack",
    ),

    email(
      36,
      "Why this program exists",
      "Why this isn't another \"10 AI hacks\" course",
      [
        "Tricks don't compound into invoices",
        "The four stuck points I kept seeing",
      ],
      "Notebooks and WhatsApp on one side. Almost nobody who can build the missing piece.",
      `Most AI content: prompt lists, tool tours, twenty-minute excitement, useless by Thursday. Tricks don't become something you can charge for.

The real stuck points: can't turn an idea into a spec, can't judge the output, can't finish the last 20%, can't get it on the internet where someone pays.

None of those is a prompting problem. Prompt lists don't fix them.

So the order is a real project: setup, direction, blueprint, polish, reliability, data, recovery, live URL, app stores. Bonuses around it: ideas, templates, support, pricing, distribution, cost, updates.

Look at this market: businesses on notebooks, spreadsheets, WhatsApp. Almost nobody who can build the missing piece properly. Those two facts sitting next to each other.

Not a shortcut. The ordered path I'd have paid to get instead of assembling it badly.

LeadThur, Shade, Chinedu, the ₦10M project — method proof. PromptEarn ₦800M+ — operator, **not** method.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}**. One place.`,
      "See Why It Is Built This Way",
      "Founder rationale: structure not hype",
      "Phase 6 · Close",
    ),

    email(
      37,
      "If I were starting from zero",
      "Monday, no portfolio, no code. This is the month.",
      [
        "Setup. Ugly live thing. Five conversations. Ask for money.",
        "Week two or three it stops being fun. That's the test.",
      ],
      "No audience. No funding. One invoice.",
      `If I started Monday with nothing:

**Week 1.** Setup module only. Working environment. One tiny thing that runs. Most people never get here.

**Week 2.** One small ugly thing **live**. Booking, invoice, stock — for one person I know. Whole path once. Ugly and live beats beautiful and local.

**Week 3.** Five conversations. What's annoying. What's in a notebook. Watch one of them do the task. Rebuild week-two properly for the most specific one.

**Week 4.** Ask for money. Modest. Clear scope. Not ₦650,000. First paid delivery changes you more than more videos.

Then bigger. Second project prices higher. Third often arrives by referral — Chinedu's pattern.

Week two or three, something breaks and the plan feels stupid. That's not the quit signal. That's why support exists.

No audience. No permission. Setup, one finished thing, five talks, one invoice.

Modules map to that order. **${WEBINAR_FOLLOWUP_OFFER_PRICE}**. Start week one.`,
      "Start Week One",
      "Make the path concrete and imminent",
      "Phase 6 · Close",
    ),

    email(
      38,
      "The cost of staying unable to build",
      "No countdown. Just the slow arithmetic.",
      [
        "Ideas die in the saving-up phase",
        "Reps accrue. You can't download them later.",
      ],
      "Nothing expires tonight. The year can still look like last year.",
      `No midnight. No fake door. Adrenaline makes refunds.

The real cost of waiting:

**Every idea stays dependent.** Someone else's quote, someone else's calendar. Ideas die while you save up.

**The work goes to whoever was capable when they asked.** Chinedu got the second site because he was there and he'd already delivered. Somebody nearby is being asked this month.

**The gap is reps, not tools.** Tools get easier. The person who started six months ago has shipped, broken production, priced jobs. You can't download that.

**"I'm not technical" hardens.** A decision starts feeling like a fact.

No dramatic crash. A year that looks like last year.

Businesses still need software. Builders are still scarce. The reps you skipped stay skipped.

Whenever you're ready: **${WEBINAR_FOLLOWUP_OFFER_PRICE}** on the offer.`,
      "See The Offer Page",
      "Evergreen urgency via opportunity cost",
      "Phase 6 · Close",
    ),

    email(
      39,
      "What the skill enables over time",
      "Two years from now if you simply keep going",
      [
        "I won't quote your income. I will name what the skill enables.",
        "Ceiling exists. Look at the proof. Don't treat it as a promise.",
      ],
      "Structural, not lucky. Income still depends on you.",
      `I will not tell you what you'll earn. Market, effort, sales, luck. Anyone quoting your future is selling something else.

What the skill **enables**:

**Ideas stop dying in Notes.** Test cheap. Most fail. Some work. They get a chance.

**Income isn't one source.** Clients, a small product, a retainer, an internal tool at work.

**Negotiating position changes.** Employed or freelance — you can produce working software.

**Work compounds.** Faster builds. Templates. Prompt patterns. Referrals — Chinedu's return, Shade's ecommerce → app.

**Ceiling is real, not imagined.** LeadThur: 681 active, ₦15,120,000 **estimated** in 90 days. ₦10,000,000 project. Published agency/case-study numbers. Not your numbers. Proof the ceiling exists.

Quieter: confidence from evidence. A stranger used something you built.

Twenty-four months of small sessions.

Path: **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See The Full Path",
      "Long-term vision without income guarantees",
      "Phase 6 · Close",
    ),

    email(
      40,
      "Final honest invitation",
      "Last email: yes, no, or not yet",
      [
        "Same proof. Same price. One first action.",
        "Not yet only counts if you name the condition.",
      ],
      "All three answers are fine. Only one is dishonest.",
      `Last one. Same honesty as email 1.

What I showed you: LeadThur — **782 paid**, 681 active, 9,460 paid searches, **₦15,120,000 estimated** in 90 days. ₦10,000,000 client project. Shade ₦650,000 + app. Chinedu ₦480,000 + return. eXp/Lovable, Ryplix/Bolt, Harry Roper's reported agency numbers — go read those yourself.

What PromptEarn is **not** proof of: this method.

No fake testimonials. No income promise. No fake deadline.

The offer: **How To Build Software With AI And Get Paid For It** — 10 modules, 8 bonuses, **${WEBINAR_FOLLOWUP_OFFER_PRICE}** promo, **${WEBINAR_FOLLOWUP_REGULAR_PRICE}** regular, **${WEBINAR_FOLLOWUP_OFFER_VALUE}** stated stack.

**Yes.** Enroll. This week: finish setup. Not all ten modules. One working baseline.

**No.** Then don't. Unsubscribe if this is noise. Go be excellent at what you actually want.

**Not yet.** Write the condition: amount, month, what has to change. "Not yet" with no condition is "no" in nicer clothes.

Thanks for reading this far.

If it's yes — enroll and start module one.`,
      "Enroll And Start Module One",
      "Clean close with a specific first action",
      "Phase 6 · Close",
    ),
  ];

  return assertValidWebinarSequence(emails);
}
