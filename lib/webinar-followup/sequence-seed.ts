import type { SequenceEmailContent } from "./render";
import {
  WEBINAR_FOLLOWUP_OFFER_PRICE,
  WEBINAR_FOLLOWUP_OFFER_URL,
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
        "One honest note after the webinar",
      ],
      "You already saw the close. Here is the exact access you left on the screen.",
      `You stayed through the close of the webinar. That means you already saw the offer. This email is not a new pitch. It is the same decision, written down so it does not evaporate into WhatsApp.

**How To Build Software With AI And Get Paid For It** is the training that takes you from "I have an idea and I am not a developer" to software you can hand a client or put in front of paying users.

Here is exactly what you get:

- 10 training modules, from setup to putting an app on the internet and into the app stores
- 8 bonuses, including templates, an idea vault, the Get-Paid Guide, and private support
- Lifetime access plus updates

Enrollment is **${WEBINAR_FOLLOWUP_OFFER_PRICE}** while promotional pricing is running. Regular price is **${WEBINAR_FOLLOWUP_REGULAR_PRICE}**. Stated stack value is **${WEBINAR_FOLLOWUP_OFFER_VALUE}** — ${WEBINAR_FOLLOWUP_OFFER_PRICE} is what you pay today, not a fake crossed-out stunt.

What that access is for, in plain language:

You can build for clients — booking systems, ecommerce, internal tools — and charge for delivery. Shade earned ₦650,000 on one ecommerce site. Chinedu earned ₦480,000 on one website, then the client came back. You can also build your own product. LeadThur was built solo with AI: 782 people paid to use it, 9,460 paid searches, ₦15,120,000 **estimated revenue** in the first 3 months. Those are not your guaranteed numbers. They are proof the skill is already being used to get paid.

I am not inventing a midnight deadline. I am telling you the door you already walked up to is still here.

If you are still in, tap below and enroll while ${WEBINAR_FOLLOWUP_OFFER_PRICE} is the price on the page.`,
      "Enroll Now — ₦49,999",
      "Warm continuation of an existing conversation, not a cold restart",
      "Phase 1 · Reopen",
    ),

    email(
      2,
      "Developer dependency and the market shift",
      "The most expensive sentence in business: \"I need to find a developer\"",
      [
        "Every idea you have still needs someone else's permission",
        "What depending on a developer actually costs you",
      ],
      "Dependency is not just a cost line. It is a speed limit on every idea you will ever have.",
      `There is a sentence that quietly costs people more money than almost anything else in business: **"I need to find a developer."**

Think about what actually happens after you say it.

You explain your idea to someone who did not have it. You wait for a quote. The quote is higher than you expected, so you negotiate, or you start saving, or you shelve the whole thing. If you do pay, you wait again — for updates, for a demo, for the version that finally matches what you meant in your head. Then you want one small change, and you rejoin the queue. If the developer goes quiet, your product goes quiet with them.

None of that is an attack on developers. Good ones earn what they charge. It is a description of **dependency**, and dependency is a speed limit bolted onto every idea you will ever have.

Here is what changed. Building software used to mean typing tens of thousands of lines by hand, which meant years of practice before you could produce anything a stranger would pay for. A large part of that typing can now be directed instead. You describe the outcome, review what comes back, test it like a suspicious user, correct what is wrong, and ship.

You can see how seriously the industry takes this shift by watching where the money goes. Cursor, the AI-native code editor built by Anysphere, went from a niche tool to one of the fastest-growing developer products in the world — because professional engineers now build **with** AI as their default, not as a party trick. That is market context, not a promise about your bank account. But it tells you the direction of travel, and it tells you that directing AI to build is not a trend somebody invented to fill a webinar slide.

People who learn to direct it stop waiting. Their ideas no longer need permission. When a client asks "can you add this?", the answer becomes "give me two days" instead of "let me check with my developer."

That independence is the actual product here — not a certificate, not a folder of videos. Enrollment is still ${WEBINAR_FOLLOWUP_OFFER_PRICE}. Open the training page and take the seat if you are done waiting on developers.`,
      "Stop Waiting On Developers",
      "Pain of dependency plus credible market shift as permission to act",
      "Phase 1 · Reopen",
    ),

    email(
      3,
      "Operator credibility and honest labelling",
      "₦800M+ in transactions, 20+ cars — and the honest limits of that",
      [
        "Why I am the one teaching this (and what my other business does not prove)",
        "The operator behind this program, without the highlight reel",
      ],
      "Who is writing these emails, what that proves, and specifically what it does not prove.",
      `Before you take anyone's advice about software and money, you should know what they actually run.

I operate businesses in this space rather than a lecture hall. **PromptEarn** is one of them — a platform that has processed over ₦800,000,000 in transactions and has put more than 20 cars in the hands of its top performers. That is the operator record behind the person writing these emails, and it is why I can talk credibly about payments, users, churn, support tickets and the unglamorous reality of keeping software alive after launch week.

Now the part most marketers would never put in writing.

What PromptEarn is **not** proof of: it is not evidence that the AI-assisted workflow taught in this program produced it. Different business, different era, different build path. If I let you quietly assume the two were the same thing, everything else I tell you would deserve suspicion.

So let me separate the two claims cleanly, and hold myself to that separation for the rest of this sequence.

**Operator credibility.** PromptEarn's transaction volume and payouts tell you I have run real products with real money moving through them, and that I know what breaks when strangers start using your software at scale.

**Method proof.** That comes from completely different evidence, and it is what the next several emails are about — a tool called LeadThur and exactly what its first ninety days looked like, a ₦10,000,000 client project, individual builders who charged ₦650,000 and ₦480,000 for single websites, and published case studies from companies using AI builders that you can go and read yourself.

I am telling you this before the proof, on purpose. A good program survives honest labelling. A program that needs blurred lines to sell was never worth ${WEBINAR_FOLLOWUP_OFFER_PRICE} of anybody's money.

I built **How To Build Software With AI And Get Paid For It** because the distance between "I have an idea" and "I have working software people pay for" is the most expensive gap in most people's careers — and it is now closable by ordinary people with unusual consistency.

The training registration page is here if you want to continue from where the webinar left off: {{cta_url}}`,
      "See Who This Is For",
      "Trust through transparent labelling of proof vs credibility",
      "Phase 1 · Reopen",
    ),

    email(
      4,
      "The idea-to-build gap",
      "The graveyard between your idea and a working product",
      [
        "You do not have an idea problem",
        "Why your notes app is full and your portfolio is empty",
      ],
      "Four specific reasons ideas die — and not one of them is 'you cannot type code fast enough'.",
      `Open your notes app and scroll for a minute. I am willing to bet there is at least one idea in there that would genuinely work — a booking system for a business you know, a tool that removes something you personally hate doing, an app the shop down your street actually needs.

Now count how many of those ideas exist as working software today. Probably none of them.

That gap is where most potential quietly dies. Not from laziness — people rarely abandon ideas because they stopped caring. They abandon them because there was no bridge, and building the bridge themselves looked like a two-year detour through tutorials.

Here is the honest anatomy of that gap.

**You cannot translate.** You hold the idea as a feeling, not a specification. "Like Uber but for tailors" is not something anyone can build from — including AI.

**You cannot judge.** Even when something does get built, you cannot tell whether it is good, safe, or one busy Saturday away from falling over.

**You cannot finish.** Getting to eighty percent feels wonderful. The last twenty — payments, edge cases, the thing that breaks on a slow connection — is where projects go to sleep permanently.

**You cannot ship.** It runs beautifully on your laptop and nobody on earth can reach it, so it earns nothing.

Notice that none of those four is "cannot type code fast." Typing is the part that got cheap. Translating, judging, finishing and shipping are what still separate people who own working software from people who own notes.

That is precisely the order this program teaches in. **Idea-To-Blueprint** handles translation, turning a feeling into a specification with users, flows and a version one that deliberately excludes things. **Teaching AI To Build For You** and the **Prompt Playbook** handle direction. **Actually Work** and **Remember Things** build judgement. **Safety Net** and **On The Internet** handle finishing and shipping.

I am not pretending this is effortless. It is a real skill with real hours attached. What I am telling you is that the bridge exists now, and for people who show up consistently it is measured in weeks instead of years.

Tomorrow I will show you what happens when one person crosses that gap with one narrow idea.

The full training path is here: {{cta_url}}`,
      "See The Full Path",
      "Name the real blocker precisely so the curriculum feels like the answer",
      "Phase 1 · Reopen",
    ),

    email(
      5,
      "LeadThur introduction",
      "Find business contacts in 60 seconds — the tool I want to show you",
      [
        "One person, one narrow problem, one tool that worked",
        "The 60-second question that turned into a product",
      ],
      "You do not need a billion-naira idea. You need one afternoon-eating task people would pay to skip.",
      `Let me tell you about a question that turned into a product.

If you have ever done B2B sales, you know the grind. You need decision-makers at companies that might buy from you, and finding them means clicking through websites, guessing email formats, scrolling profiles, copying names into a spreadsheet and hoping half of it is not already out of date. It is the kind of work that swallows an entire afternoon and produces maybe a dozen usable contacts.

The question was simple: what if that took sixty seconds instead?

That question became **LeadThur**, a tool whose whole promise is in its headline — **Find Business Contacts in 60 Seconds**. You describe the kind of business you are targeting, it handles the discovery, and you get contacts you can actually reach out to.

Two things about it matter for you.

The first is who built it. Not a funded team with an office and a dozen engineers. It was built solo, AI-assisted, by someone directing the build rather than hand-typing every line of it. That is the same category of work this program teaches.

The second is how deliberately narrow it is. LeadThur does not try to be a CRM, an email sender, a marketing suite and an analytics dashboard. It does one painful, specific, repetitive job faster than a human can do it. Narrow is not a weakness — narrow is exactly why people understood it in one sentence and paid for it.

That is the pattern worth stealing. Most beginners try to build something enormous and vague, then quietly wonder why nobody cares. The tools that actually get used solve one sharp pain for one clearly identified person.

Tomorrow I am going to open the numbers — real users, real paid searches, real estimated revenue from the first three months, with nothing inflated to sound impressive. I would rather show you the mechanics than a highlight reel.

For now, sit with the reframe. You do not need a billion-naira idea. You need one afternoon-eating task that somebody would happily pay to skip.

The training that covers finding and validating those ideas is here: {{cta_url}}`,
      "See The Training",
      "Curiosity plus reframing ambition down to a buildable, narrow problem",
      "Phase 1 · Reopen",
    ),

    email(
      6,
      "LeadThur numbers and estimated revenue",
      "782 people paid, 9,460 paid searches, ₦15,120,000 estimated",
      [
        "The first 90 days of LeadThur, in real numbers",
        "What 681 active users actually looks like from the inside",
      ],
      "The full first-quarter numbers, including the word 'estimated' where it belongs.",
      `Yesterday I introduced LeadThur — the solo-built, AI-assisted tool that finds business contacts in about sixty seconds. Today, the numbers exactly as they are.

In its first three months:

- **782 people** paid to use it
- **681** of them were active, not a dead list
- **107 new users** joined in a single week during that period
- **9,460 paid searches** were run through the tool
- **2,035 trial searches** happened before people paid
- Estimated revenue: **₦15,120,000**

I want to be precise about that last line. It is an **estimated** figure, modelled from paid search volume and pricing. It is not an audited financial statement, and I am not going to dress it up as one. The word estimated stays in the sentence every single time I use it.

Now look at the other numbers, because honestly they teach you more than the money does.

**681 active out of 782 who paid** means the product actually worked. Dead accounts drop off quickly; people who keep returning are people whose problem is genuinely being solved.

**9,460 paid searches against 2,035 trial searches** means people tested it, saw the value and chose to pay for more. That ratio is the difference between an interesting demo and a business.

**107 new users in one week** means it spread. A tool that saves someone an afternoon gets mentioned to colleagues without any advertising budget.

Here is what I do not want you to take from this: that you will have 782 people pay to use something you build in your first quarter. Markets differ, execution differs, timing differs, and there is no honest version of this email that guarantees your numbers.

Here is what I do want you to take. One person, one narrow problem, one AI-assisted build — and a few thousand paid actions later there is a real business. No engineering team, no funding round, no permission from anybody.

That is the ceiling being raised. What you build underneath it depends entirely on how consistently you show up.

The curriculum covering this exact path — idea, blueprint, build, reliability, deployment, monetization — is here: {{cta_url}}`,
      "See The Curriculum",
      "Hard usage proof with honest qualifiers, ceiling-raising rather than promising",
      "Phase 2 · Proof",
    ),

    email(
      7,
      "Ten million naira client project",
      "One project. ₦10,000,000.",
      [
        "What a serious business problem is actually worth",
        "The invoice that should change how you see \"not a real developer\"",
      ],
      "Why the size of the fee follows the size of the problem, not the number of lines of code.",
      `Products are one road out of this skill. Client work is the other, and it usually pays first.

We delivered a software project where the **project payment was ₦10,000,000**.

I am going to leave the story exactly there, because I will not decorate it with details I cannot verify for you. One client. One serious business problem. One project payment of ten million naira.

What matters is what a number like that tells you about how software money actually works.

**The fee follows the problem, not the code.** Nobody pays ten million naira for a login screen. They pay it when something is costing them far more than that in wasted hours, lost revenue, manual labour or risk — and you are the person who removes it. The size of the invoice is set by the size of the pain, not by how clever the implementation was.

**Business budgets are not personal budgets.** When you sell to an individual, you are competing with their rent. When you solve a company's operational problem, you are competing with what that problem already wastes every month. Those are completely different conversations, and beginners systematically aim at the cheaper one.

**Capability gets judged by delivery, not credentials.** Once a client has seen something you built that works, nobody asks where you studied. They ask about timelines, reliability, and whether you pick up the phone when something breaks.

I am not telling you your first project will have eight zeros on it. It almost certainly will not. Shade's ₦650,000 and Chinedu's ₦480,000 — the next two emails — are much more realistic first-project territory, and both are still many times the current enrollment price.

What I am telling you is that the ceiling for someone who can direct AI to build and then behave like a professional is far higher than the phrase "I am not a real developer" allows you to imagine.

The program includes the **Get-Paid Guide** precisely because building is only half of this equation — scoping, pricing, proposals and delivery are the other half.

See how the full stack fits together: {{cta_url}}`,
      "See The Training Stack",
      "Raise the ceiling on perceived earning potential using one verified project",
      "Phase 2 · Proof",
    ),

    email(
      8,
      "Shade — ₦650,000 ecommerce project",
      "Shade charged ₦650,000 for one ecommerce website",
      [
        "One website, ₦650,000 — and now she is building the app",
        "What one well-delivered client project is worth",
      ],
      "One project, one payment, and the second opportunity it opened up.",
      `Numbers from my own projects are easy to dismiss. So let me tell you about Shade.

Shade built an **ecommerce website for one client and earned ₦650,000** for it. One project, one scope, one payment.

Sit with that against the cost of learning the skill for a moment. A single project like that is many times the current enrollment price of this program.

But the more interesting part is what came next: **she is now turning that same work into an app.**

That progression is the entire game, and most people never notice it because they are waiting for one big break instead of a sequence.

Here is the sequence. You learn to build. You deliver one thing properly for one client. That client trusts you, so the conversation widens — can this also be a mobile app, can we add stock alerts, can my brother's business get one too. Now you are not chasing work anymore; you are extending it. Your second project starts inside a warm relationship instead of a cold pitch, and it prices higher because proof already exists.

None of that requires an audience. Shade did not need to go viral. She needed one client with a real business, a deliverable that worked, and enough craft that the client was proud to show it to their own customers.

That craft is not accidental, which is why this program spends entire modules on the things beginners skip. **Making App Look Good** exists because an ecommerce site that looks cheap loses sales no matter how elegant the code underneath is. **Actually Work** and **Remember Things** exist because a checkout that fails even once costs the client money — and costs you the referral, the app project and everything that would have followed.

I am not promising you ₦650,000. What I will say plainly is that the market rate for competent, reliable delivery is high, the supply of it is genuinely low, and that gap is where builders like Shade get paid.

The modules behind that kind of delivery are here: {{cta_url}}`,
      "Explore The Modules",
      "Relatable single-project proof plus the compounding second opportunity",
      "Phase 2 · Proof",
    ),

    email(
      9,
      "Chinedu — ₦480,000 and the repeat client",
      "Chinedu earned ₦480,000 — then the client came back",
      [
        "The second website matters more than the first ₦480,000",
        "Repeat business is the only review that counts",
      ],
      "Anyone can win one job. A client who returns has already lived with your work.",
      `If I could only show you one proof point from this entire sequence, it would not be the biggest number. It would be this one.

**Chinedu earned ₦480,000 from a single client for a website. Then that same client came back and asked for a second one.**

The ₦480,000 is good money. The return visit is the real signal, and here is why.

Anybody can win one job. Persuasion, luck, a friendly referral, a client in a hurry — plenty of first projects happen for reasons that have nothing to do with quality. But a client who comes back has already lived with your work. They have used it on a bad-network Monday. They have found the thing that annoyed them. They watched how you responded when they asked for a change. And after all of that, they chose to hand you money again.

That is the only review that matters in this business.

Repeat clients also transform your economics. A first project costs you a lot of unpaid effort — the conversations, the trust-building, the scoping, the quiet worry. The second one starts warm. No pitching, no proving yourself, no competing against whoever quoted half your price. Two or three relationships like that and you have something close to stable income without ever running an advert.

So what actually earns the second project? Almost never brilliance. It is unglamorous professionalism: you said what you would deliver, you delivered it, it kept working, you replied to messages, and you did not disappear the moment something broke.

All of that is learnable, and it is deliberately built into the curriculum. **Actually Work** and **Remember Things** are about software that does not embarrass you three weeks after handover. **Safety Net** is about fixing a problem in twenty minutes instead of vanishing in panic. The **Get-Paid Guide** is about scoping and pricing so you are not quietly resentful halfway through the job.

Reputation compounds faster than skill does. Deliver twice and you stop looking for work.

See how those modules fit together: {{cta_url}}`,
      "See The Delivery Modules",
      "Reframe proof around reliability and repeat business, not luck",
      "Phase 2 · Proof",
    ),

    email(
      10,
      "eXp Realty and Lovable — industry example",
      "A real estate giant cancelled its SaaS bills and rebuilt in-house",
      [
        "eXp Realty, Lovable, and the subscriptions that disappeared",
        "When big companies start building instead of buying",
      ],
      "An industry example you can verify yourself — and what it means at your scale.",
      `Not all of the evidence should come from me. Here is one you can go and read for yourself.

**eXp Realty** is a large US real estate organization. According to a case study published on **Lovable's own blog** — Lovable being one of the AI app-building platforms in this space — eXp used it to rebuild websites and internal tools, and in the process **cancelled expensive SaaS subscriptions they no longer needed.**

That is their reported outcome, in their context. It is not mine, and it is not a promise about you. But look closely at what it signals, because it is one of the most important shifts happening in software right now.

For about twenty years, the default answer to "we need a tool for this" was **buy it**. Find a vendor, pay per seat per month forever, and accept that it does roughly eighty percent of what you actually wanted. Companies accepted that deal for a simple reason: building custom software was slower and more expensive than renting somebody else's.

That trade is breaking. When a capable person can direct an AI builder and produce the tool a team genuinely needs in days rather than quarters, renting a bloated platform starts to look like an expensive habit rather than a smart decision.

Here is why that matters at your scale, not eXp's.

Every business you know is paying monthly for software that half-fits, and doing the other half manually in spreadsheets and WhatsApp groups. That is not a Silicon Valley observation — go and look at the businesses on your own street. The person who can build the missing piece is selling exactly what eXp bought: **fit, ownership, and the end of a subscription that never quite worked.**

You do not need their budget or their team. You need the skill and one business with a painful gap. The **On The Internet** module covers putting that build somewhere real people can reach it, and the **Zero-Cost Toolkit** bonus covers doing it without stacking up subscriptions of your own.

Industry direction is not personal income. But it tells you which way the wind blows before your competitors notice it.

The full stack is here: {{cta_url}}`,
      "See What Is Included",
      "External verifiable proof translated down to the reader's own market",
      "Phase 2 · Proof",
    ),

    email(
      11,
      "Ryplix and Bolt — speed case study",
      "A US product rebuilt in about two weeks — then +$10,000 MRR",
      [
        "Bolt published this one: two weeks to rebuild, $10k monthly after",
        "What speed does to an entire business model",
      ],
      "Bolt's published case study on Ryplix — and why compressed timelines change strategy.",
      `Here is another outside case study, and I want to attribute it precisely.

Bolt — another AI-assisted development platform — published a case study on its blog about an agency called **Ryplix**. According to that published case study, Ryplix rebuilt a major US product in roughly **two weeks**, and the result added around **$10,000 in monthly recurring revenue**.

Those are Bolt's published figures about Ryplix's project. They are not my client's results, and they are not a forecast for you. But read the two details together, because they describe something that was barely possible a few years ago.

**Two weeks.** Rebuilding a serious product used to be a quarter of work minimum, with a team and a budget. Compressing that timeline does not just save money — it changes what you are willing to attempt. When a real build costs two weeks instead of six months, you can test an idea in the market instead of theorising about it for a year and then discovering nobody wanted it.

**Recurring revenue.** Not a single payment: monthly. That is the difference between doing a job and owning an asset, and it is the reason software businesses are valued differently from service businesses.

Now the part that beginners misread. That speed does not come from the AI typing quickly. It comes from **clarity**. A rebuild is fast because somebody already knows what the product must do, who it is for, and what version one deliberately excludes. Point an AI builder at a vague brief and you will generate confident nonsense at record pace, then spend three weeks untangling it.

That is why **Idea-To-Blueprint** sits before the heavy building modules in this curriculum, and why the **Prompt Playbook** exists at all. Direction first, generation second. Every fast project you will ever read about was a clear project first.

I am not claiming you will add $10,000 in monthly recurring revenue. I am telling you the category of outcome exists, it is being published by the platforms themselves, and the timeline for getting there has genuinely collapsed for people who know how to direct a build.

The order the modules are taught in is on the offer page: {{cta_url}}`,
      "See The Build Sequence",
      "Speed as strategic advantage, with clarity positioned as the real skill",
      "Phase 2 · Proof",
    ),

    email(
      12,
      "Imaginary Space and Harry Roper — agency scale",
      "An agency reporting about $100,000 a month with AI builders",
      [
        "Harry Roper's interview, and the operator layer nobody talks about",
        "What an AI-native agency looks like at scale",
      ],
      "Tools lower the technical floor. They do not hand you clients, pricing or quality control.",
      `One more outside story, and then I will stop pointing at other people's numbers.

In an interview on **No Code MBA**, Harry Roper described his agency, **Imaginary Space**, operating at around **$100,000 per month**, using Lovable as its build layer. Lovable has also featured him in a video. That figure is what he reported in that interview — I have not audited his books, and you should not pretend I have.

I am including it for one reason only, and it is not to make you dream about six-figure months.

It is to show you the shape of the gap.

Tools like Lovable, Bolt and Cursor lowered the technical floor dramatically. Anyone reading this can access essentially the same build capability that agency uses. The tools are not the moat. So why is one operator running a business at that scale while thousands of people with identical tool access have never invoiced anybody?

Because the tools solve exactly one of the six things a software business needs. They solve building. They do not hand you:

- clients, or a repeatable way of finding them
- the confidence to quote a real price without flinching
- quality control, so what you deliver survives contact with users
- project management, so scope does not eat your margin
- positioning, so you are not competing on being the cheapest
- delivery discipline, so clients come back like Chinedu's did

That list is the **operator layer**, and it is the part almost nobody teaches, because teaching prompts is easier and more exciting.

It is also why this program is not ten videos about tool buttons. The build modules are the foundation, and then the **Get-Paid Guide** covers pricing, scoping and getting paid, the **Software Marketplace Guide** covers being found, and the **Organic And Paid Ad Formula** covers attention when you are ready for it.

Please do not measure yourself against a scaled agency this week. That comparison only produces paralysis. Measure yourself against the ladder: one build that works, one client who pays, one client who returns. That ladder is real, and every scaled operator climbed it in that order.

The full stack is here: {{cta_url}}`,
      "See The Business Modules",
      "Reframe from tool envy to the operator skills that actually create income",
      "Phase 2 · Proof",
    ),

    email(
      13,
      "Where ideas come from",
      "Good software ideas are found, not invented",
      [
        "Stop brainstorming. Start listening.",
        "Where the buildable ideas are actually hiding",
      ],
      "Nobody invented LeadThur in a shower. It was noticed in somebody's wasted afternoon.",
      `The most common thing people tell me after a webinar is not "I cannot code." It is "I do not have an idea."

That sentence usually means something more specific: I do not have a **brilliant, original, defensible** idea. And that is a relief, because brilliant original ideas are rarely what gets paid. Boring noticed ones are.

Nobody invented LeadThur in a shower. Somebody noticed that finding business contacts swallowed an entire afternoon and produced a dozen usable results, and then built the sixty-second version of that afternoon.

So stop brainstorming and start listening. Here is where the buildable ideas actually hide.

**Your own irritation.** What do you do repeatedly that feels mechanical and stupid? If a task makes you sigh, someone else is sighing at it too — probably with a bigger budget than you.

**Spreadsheets doing a job they should not be doing.** Almost every small business runs a spreadsheet that was never meant to be a booking system, an inventory tracker or a payroll tool. Each of those spreadsheets is a product brief.

**WhatsApp as infrastructure.** When a business coordinates orders, staff shifts or customer requests through group chats and voice notes, they are paying in confusion for something software could hold.

**Work people already pay a human to do.** If somebody is being paid to copy data between two systems, the budget for solving that already exists. You are not creating a new expense line — you are replacing one.

**Complaints inside a niche you know.** Tailors, clinics, schools, logistics, church administration, small distributors. Whatever world you already understand is a world where you can hear specific pain that outsiders never notice.

The **App Idea Vault** bonus exists for the weeks when this well runs dry — curated starting points so you can practise, build portfolio pieces and study what makes a narrow product work, rather than waiting for lightning.

But the vault is a supplement. Your unfair advantage is the industry you already sit inside, and the annoyances you have stopped noticing because you assumed everybody just accepts them.

Write down five before tomorrow. Tomorrow I will show you how to tell which one is worth building.

The idea and blueprint modules are here: {{cta_url}}`,
      "See The Idea Modules",
      "Remove the 'I have no idea' blocker with a concrete sourcing method",
      "Phase 3 · Education",
    ),

    email(
      14,
      "Problems worth solving",
      "Not every problem deserves software",
      [
        "The four-question test before you build anything",
        "How to tell an expensive problem from a merely annoying one",
      ],
      "Four questions that separate a payable problem from an interesting one.",
      `Yesterday I asked you to write down five problems you have noticed. Today, how to tell which of them is worth your next month.

Because here is the trap. Every problem feels equally valid when it is a sentence in your notes. They are not equal at all. Some problems have money attached and some are just mildly irritating, and the difference decides whether you get paid or quietly waste six weeks.

Run each idea through four questions.

**How often does it happen?** A problem that occurs daily or weekly builds a habit around your solution. A problem that occurs twice a year does not. LeadThur sits on a task salespeople repeat constantly, which is why 9,460 paid searches happened rather than a handful of curious clicks.

**What does it currently cost?** In hours, in salaries, in mistakes, in lost sales. If you cannot describe the current cost in numbers, you will not be able to justify a price either. "Saves you about six hours a week" is a sentence that sells. "Makes things nicer" is not.

**Is money already moving?** The strongest signal is somebody already paying for a bad solution — a subscription that half-fits, a staff member doing it manually, an agency charging too much. Existing spend means the budget conversation is already won. eXp Realty had subscriptions before they had a rebuild.

**Can you reach the buyer?** This is the one beginners skip. A perfect solution for a market you have no way of contacting is a hobby. If you personally know five people with this problem, you have a business. If you know none, you have a research project.

Ideas that pass all four are boring on the surface and profitable underneath. Ideas that fail three of them are usually the exciting ones — the social app, the marketplace, the platform that needs thousands of users before it does anything useful.

**Idea-To-Blueprint** takes an idea that passes this test and turns it into a specification you can actually build: the users, the core flows, the data, and the ruthless list of what version one will not include.

Score your five ideas tonight. Keep the top one.

The blueprint module sits here: {{cta_url}}`,
      "See The Blueprint Module",
      "Give a practical filter that creates confidence and forward motion",
      "Phase 3 · Education",
    ),

    email(
      15,
      "Why businesses pay for software",
      "Businesses don't buy software. They buy four things.",
      [
        "What is actually on the invoice when a company pays you",
        "Why a spreadsheet-shaped business will pay you well",
      ],
      "Nobody wants an app. They want a cost removed, and here are the four costs.",
      `Nobody wants software. I know that sounds strange coming from someone selling a program about building it, but it is the most useful sentence in this whole sequence.

No business owner wakes up wanting an app. They want a result, and software happens to be the cheapest way to get it. Once you understand that, pricing and selling stop feeling like manipulation and start feeling like translation.

There are essentially four things businesses pay for.

**Time.** Somebody on the payroll spends nine hours a week doing something a form and a database could do in minutes. Those hours have a price, and it repeats every single week. This is the easiest sale in existence because the maths is undeniable.

**Money moving faster or leaking less.** Customers who abandon a broken checkout, orders lost in a group chat, invoices nobody chased, stock that expired because no one saw it. Software that closes a leak pays for itself before the year ends.

**Mistakes and risk.** Manual processes produce errors, and errors produce refunds, fines, angry customers and reputational damage. When you remove the possibility of a mistake, you are selling calm — and calm is worth more than people admit.

**Visibility and control.** Most small business owners genuinely do not know their own numbers this week. A dashboard that tells them the truth daily changes how they run everything. That is why internal tools like eXp's rebuilt systems get funded.

Notice what is not on that list: your framework choices, your architecture, how many lines the AI generated, or how modern your stack is. Clients do not buy the machinery. They buy the outcome the machinery produces.

This changes how you talk. Instead of "I will build you a web app with an admin panel," you say "your staff spends two days a month on this, and after next week they will not." Same build. Completely different conversation, and a completely different price.

The **Get-Paid Guide** is built around exactly this translation — turning what you can build into language that reaches a business owner's budget rather than their curiosity.

See how the business side is covered: {{cta_url}}`,
      "See The Get-Paid Guide",
      "Teach value translation so pricing and selling feel natural",
      "Phase 3 · Education",
    ),

    email(
      16,
      "Client work vs your own product",
      "Client projects or your own product? Pick one for 90 days.",
      [
        "Two roads out of this skill — and which one to walk first",
        "Cash now or an asset later",
      ],
      "Both roads work. Trying to walk both in your first quarter is why people stall.",
      `Everything I have shown you splits into two roads, and choosing badly between them is one of the most common ways capable people stall.

**Road one: client work.** Shade's ₦650,000 ecommerce site. Chinedu's ₦480,000 website and the second one after it. The ₦10,000,000 project. You solve one business's problem, you get paid for that project, you move on or you extend the relationship.

**Road two: your own product.** LeadThur. You build one tool that solves a narrow problem, then many people pay to use it — 9,460 paid searches from 681 active users rather than one invoice.

Here is the honest comparison, without romance.

Client work pays sooner and teaches faster. Your first cheque can arrive within weeks because the buyer already exists and already has a budget. You learn scoping, communication and delivery under real pressure. The ceiling per project is high. The trade-off is that income stops when you stop, and you are always somebody's supplier.

Products pay later and pay repeatedly. LeadThur's first three months looked like a lot of building for uncertain returns before the numbers appeared. Most products fail. The ones that work keep earning while you sleep and can be sold as assets.

Now the mistake: trying to launch an agency, a SaaS and a marketplace profile simultaneously in your first ninety days. People do this because both roads look attractive, and the result is two half-finished things and a quiet conclusion that "it did not work for me."

Pick one lane for ninety days.

If you need income soon, if you enjoy talking to business owners, or if your network already contains businesses with obvious gaps — take the client road. Templates, the Get-Paid Guide and one delivered project are your first quarter.

If you have some financial runway, prefer building to selling, and have a narrow problem you understand deeply — take the product road. Blueprint, build, ship, then distribution.

The underlying skill is identical, which is the good news. You can switch roads later without relearning anything. You just cannot walk both roads at the same time while you are still learning to walk.

Both paths are supported inside the program: {{cta_url}}`,
      "Choose Your Path Inside",
      "Reduce overwhelm by forcing a single focused decision",
      "Phase 3 · Education",
    ),

    email(
      17,
      "Recurring revenue",
      "The difference between getting paid once and getting paid every month",
      [
        "How software stops being a gig and starts being an asset",
        "Why 300 small payments can beat one big invoice",
      ],
      "One-off fees feed you. Recurring revenue changes how you live.",
      `A one-off payment feeds you. Recurring revenue changes how you live. It is worth understanding the difference properly, because it determines what you build next.

Look at the two proof points side by side.

Shade earned ₦650,000 for one ecommerce website. Excellent money — and then that project ended, and the next month started at zero again until she found the next client or extended that one.

LeadThur earned across **9,460 paid searches** from **681 active users**, with estimated revenue of ₦15,120,000 in three months. Nobody wrote a single large cheque. Thousands of small paid actions accumulated, and the tool kept working whether or not anyone was selling that day.

Ryplix's rebuild, according to Bolt's published case study, added roughly $10,000 in **monthly** recurring revenue. Monthly is the word that matters. Revenue that arrives again next month without a new negotiation is a fundamentally different asset from revenue you must re-earn.

Now the practical part, because most people assume recurring revenue means building a SaaS and competing with funded companies. It does not.

**Usage-based products.** People pay per search, per report, per document — like LeadThur. No subscription conversation, just value per action.

**Small subscriptions in a narrow niche.** Two hundred clinics paying a modest monthly fee for something that saves each of them hours is a serious business, and no venture capital firm will ever bother competing for it.

**Retainers on the client road.** This is the one beginners overlook completely. When you deliver a client project, hosting, maintenance, small changes and support can be a monthly agreement rather than unpaid favours. Ten clients on modest retainers is recurring revenue built entirely from work you already did.

**Internal tools with ongoing support.** The eXp pattern at small scale: build the thing that replaced their expensive subscription, then be the person who keeps it healthy.

You do not need to choose recurring revenue on day one. You do need to stop assuming every project must end.

The modules on building products that survive real usage are here: {{cta_url}}`,
      "See The Product Modules",
      "Expand ambition from one-off gigs to durable income structures",
      "Phase 3 · Education",
    ),

    email(
      18,
      "Pricing",
      "Stop pricing your hours. Price the problem.",
      [
        "Why ₦480,000 and ₦10,000,000 can both be fair prices",
        "The pricing mistake that keeps capable builders broke",
      ],
      "Charging for your time punishes you for getting faster. Here is the alternative.",
      `Two builders deliver almost identical websites. One charges ₦120,000 and feels guilty asking for it. The other charges ₦650,000 and the client says thank you. The difference is almost never skill.

It is what each of them thinks they are selling.

If you believe you are selling hours, you will price by hours, and AI has just made your hours fewer. Think about how absurd that becomes: the faster and better you get, the less you earn. Hourly thinking punishes exactly the skill you are about to learn.

You are not selling hours. You are selling the removal of a problem, and problems have their own price attached long before you arrive.

That is why ₦480,000, ₦650,000 and ₦10,000,000 can all be fair in the same market. The ₦10,000,000 project was not a thousand times more code than a website. It sat on a business problem worth far more than ten million naira to remove.

Three practical rules.

**Anchor to their cost, not your effort.** Before quoting, find out what the problem currently costs — hours, salaries, lost sales, refunds. When a manual process burns ₦300,000 a month in wasted staff time, a ₦650,000 build that ends it is obviously cheap. Ask the questions that surface those numbers before you say any figure out loud.

**Quote outcomes and scope, never time-and-materials.** "Version one includes these six things, delivered in three weeks, for this price, and changes beyond that are a separate conversation." Vague scope is how good builders end up working three extra unpaid weeks and resenting the client.

**Never compete on being cheapest.** The cheapest builder attracts clients who cannot afford problems worth solving, who negotiate hardest, who complain most, and who never return. Chinedu did not get a second project by being the cheapest. He got it by being reliable.

There is also a self-respect element. Underpricing signals doubt, and clients read that signal instantly. Charging properly is not arrogance — it is the price of being someone who will still be answering the phone in six months.

The **Get-Paid Guide** covers pricing conversations, scoping and proposals directly: {{cta_url}}`,
      "See The Pricing Training",
      "Give pricing confidence rooted in value rather than effort",
      "Phase 3 · Education",
    ),

    email(
      19,
      "Simple software wins",
      "The boring apps make the money",
      [
        "Simple software, serious money",
        "Nobody has ever paid extra for clever",
      ],
      "Your first paid build will be less impressive and more useful than you imagine.",
      `A particular fantasy gets in people's way, and it disguises itself as ambition. It goes like this: my first real build should be impressive.

It should not. It should be useful, and useful is usually boring.

Look at what actually gets paid for. LeadThur is essentially one input and one output: describe the businesses you are targeting, receive contacts. That is it. No social feed, no gamification, no AI chat assistant bolted onto the side. One narrow job done faster than a human can do it — and thousands of paid searches followed.

Now think about the software that runs the businesses around you. Attendance registers. Invoice generators. Booking calendars. Stock trackers. Payment records. Delivery schedules. Staff rotas. Every one of those is unglamorous, and every one of them has somebody currently doing it badly in a spreadsheet or a notebook.

Nobody has ever paid extra for clever. They pay for the ledger being right, the booking not double-selling, the invoice going out on time.

This matters for three practical reasons.

**Simple ships.** Complexity is where projects go to die. A build with six features finishes; a build with thirty features becomes a permanent renovation you eventually abandon and blame yourself for.

**Simple is judgeable.** With a narrow build, you can test everything and know it works. That is what makes the **Actually Work** and **Remember Things** modules achievable rather than theoretical. Nobody can properly test a sprawling platform alone.

**Simple sells clearly.** "It finds business contacts in sixty seconds" needs no explanation. If describing your product takes two minutes, you have already lost the buyer.

The discipline this requires is subtraction, and it is the hardest habit for beginners because cutting features feels like reducing your value. It is the opposite. **Idea-To-Blueprint** spends real time on the exclusion list — the things version one will deliberately not do — because that list is what allows version one to exist at all.

Your first paid build will probably embarrass you slightly. Ship it anyway. Boring and working beats ambitious and unfinished every single time.

The full build path is here: {{cta_url}}`,
      "See The Build Path",
      "Lower the perceived difficulty bar and redirect ambition into shipping",
      "Phase 3 · Education",
    ),

    email(
      20,
      "Validation and first customers",
      "How to know somebody wants it before you build it",
      [
        "The cheapest way to avoid building something nobody wants",
        "Find the customer before you write the first line",
      ],
      "Most failed builds were not badly built. They were unwanted, and that was knowable in advance.",
      `The most expensive mistake in software is not bad code. It is a finished product nobody asked for — and it is almost always avoidable, because the warning signs were there before the building started.

Here is the sequence that prevents it, and it costs you conversations rather than money.

**Talk to five people who have the problem.** Not friends being supportive. Five people who actually live it. Ask how they handle it today, how long it takes, what they have already tried and what they currently pay for. Do not pitch anything. You are gathering evidence, and their answers become your specification.

**Watch somebody do the task.** This is the step that changes everything. People describe their process inaccurately — they forget the workarounds, the second spreadsheet, the WhatsApp message they always send afterwards. Fifteen minutes of watching produces more useful detail than an hour of asking.

**Listen for existing spend.** If somebody is already paying a subscription, a staff member or an agency to handle this, your budget conversation is essentially over. Money that already moves is the strongest validation there is.

**Ask for the sale before it exists.** "If I built exactly this and it worked the way we just described, would you pay for it? What would be fair?" Watch the reaction, not the words. Enthusiasm is cheap. A specific number, a deposit, or "when can I see it?" is real.

**Show a rough version fast.** With AI-assisted building, a basic working version can exist in days, which means you can put something real in front of that person while they still remember the conversation. Feedback on something they can click beats feedback on a description every time.

That is also how first customers appear. Not from viral posts — from the five conversations you had before building. LeadThur solved a problem its builder understood personally. Shade and Chinedu had one real client each, not an audience.

The **App Idea Vault** gives you practice ideas, the **Software Marketplace Guide** covers being found once you have something worth finding, and **Idea-To-Blueprint** turns those five conversations into a build plan.

Start with three conversations this week: {{cta_url}}`,
      "See The Validation Training",
      "Replace fear of wasted effort with a concrete pre-build process",
      "Phase 3 · Education",
    ),

    email(
      21,
      "Objection — I cannot code",
      "\"But I can't code\" — let's deal with that properly",
      [
        "You do not need to write code. You need to direct it.",
        "The coding objection, answered without any hype",
      ],
      "The honest version: what you still have to learn, and what you genuinely do not.",
      `Let me take the biggest objection head on, and let me do it without the usual "you never have to see code again" nonsense, because that is a lie and you would discover it in week one.

Here is the honest version.

You do not need to write code from memory. You will not be typing loops and functions from scratch, holding syntax in your head, or memorising library documentation. That skill — the one that took people two or three years to develop before they could produce anything sellable — is the part that got automated.

You do need to become comfortable **being around** code. You will see it. You will read error messages. You will look at a file and understand roughly what section does what. You will copy an error, describe what you expected, and get a fix. That is a genuinely different skill from writing code, and most people can develop a working level of it in weeks rather than years.

Think about a film director. They do not operate the camera, hold the boom, or edit the footage. They decide what the scene must feel like, watch the take, and say "again, but slower, and move the light." Nobody calls a director unqualified because they cannot operate a camera. Their skill is judgement and direction.

That is the job now. You specify, the AI produces, you evaluate against what you actually wanted, you correct, you test, you ship.

Which is exactly why the first two modules are shaped the way they are. **Zero-To-Builder Setup** exists because most people quit at the environment stage, convinced they are not technical, when really they had five conflicting tutorials open and no working baseline. **Teaching AI To Build For You** exists because directing well is a learnable craft — context, constraints, checkpoints, small steps, verification — and doing it badly is why some people get magic and others get a broken pile of files.

Shade and Chinedu were not selling deep computer science knowledge. They delivered websites that worked, for clients who paid ₦650,000 and ₦480,000.

Start where the program starts: {{cta_url}}`,
      "See Module One",
      "Neutralise the core skill objection with an honest, credible reframe",
      "Phase 4 · Objections",
    ),

    email(
      22,
      "Objection — I am not technical",
      "\"I'm not technical\" is a story, not a diagnosis",
      [
        "What being technical actually means now",
        "Four small tests that decide whether you can do this",
      ],
      "Nobody was born technical. It is a set of habits, and here are the four that matter.",
      `"I am not technical" is one of those sentences people say about themselves so often that it starts to feel like a medical result rather than a story.

Nobody was born technical. Every engineer you admire was once someone who did not know what a folder was. The word does not describe a personality type — it describes a small set of habits.

Here are the four that actually matter. Score yourself honestly.

**Can you follow a sequence of steps without skipping ahead?** Setup, configuration and deployment reward people who read step four before doing step four. Most "I am not technical" moments are actually "I skipped a step" moments.

**When something says ERROR in red, do you read it or close it?** This one separates people more than intelligence does. Error messages are usually instructions written rudely. People who read them calmly, paste them somewhere and ask what they mean progress quickly. People who feel accused and shut the laptop do not.

**Can you tolerate not understanding something for a few days?** Every builder works with partial understanding constantly. Comfort with temporary confusion is the actual entry requirement, and it has nothing to do with mathematics.

**Can you ask a specific question?** "It does not work" gets you nowhere. "I clicked save, expected the record to appear, and got this message instead" gets you unstuck in ten minutes — from an AI or from a human in the **Private Support Family**.

That is the profile. Notice that none of the four requires prior coding experience, youth, a science background or a particular kind of brain. They are habits, and habits can be built deliberately in a fortnight.

Here is the thing about the label, though. Calling yourself non-technical is comfortable, because it converts a difficult choice into a fixed fact. If it is who you are, there is nothing to decide and nobody to disappoint. That comfort is expensive.

So here is a fairer test than self-diagnosis. Give yourself one week inside module one. Finish the setup. See how you actually behave when something goes wrong. Then decide with evidence rather than with a story you inherited.

The beginner path starts here: {{cta_url}}`,
      "Test Yourself In Week One",
      "Dismantle identity-based resistance with behavioural criteria",
      "Phase 4 · Objections",
    ),

    email(
      23,
      "Objection — I do not know what to build",
      "\"I don't know what to build\" is the easiest objection to fix",
      [
        "You are three conversations away from your first build",
        "The blank page problem has a boring solution",
      ],
      "This is the only objection on the list that can be solved in a single afternoon.",
      `Of all the reasons people give for not starting, this is the one I take least seriously — not because it is dishonest, but because it is the easiest to solve. You can solve it this weekend.

Two things are usually happening underneath it.

The first is that you are waiting for an idea good enough to justify the risk. A big, original, defensible idea that makes the effort feel safe. That idea is not coming, and it is not required. LeadThur was not an original concept — it was an obvious annoyance, executed narrowly.

The second is that you have quietly confused your **first build** with your **first business**. They are not the same thing, and treating them as one is paralysing.

Your first build exists to teach you. It should be small, useful to exactly one person, and finished. A booking form for a friend's salon. An invoice generator for your uncle's shop. A stock tracker for the trader you buy from. An attendance register for a school you know. Nobody needs to buy it. You need to complete it, so you learn the whole path from blueprint to something living on the internet.

Once you have done that once, the "what should I build?" question changes shape entirely. You stop searching for ideas and start noticing them, because you now know what a buildable problem looks like from the inside.

So here is the boring solution. Pick one business you already have access to. Ask the owner what part of their week is most annoying. Ask what they track in a notebook or spreadsheet. Build the smallest possible version of a fix. That is three conversations and one build.

If you genuinely have no access to any business right now, the **App Idea Vault** bonus is there for exactly this — curated starting points for practice builds and portfolio pieces, so a blank page never becomes your reason for stalling. The **Done-For-You Template Pack** means you begin from working structure instead of an empty folder.

Nobody's first build was their best idea. It was just their first finished thing.

Pick something small and start: {{cta_url}}`,
      "See The Idea Bonuses",
      "Separate first build from first business to remove decision paralysis",
      "Phase 4 · Objections",
    ),

    email(
      24,
      "Objection — AI makes mistakes",
      "Yes, AI writes wrong code. That is not the problem you think it is.",
      [
        "What professionals do when the AI is confidently wrong",
        "The review habit that separates working software from a broken pile",
      ],
      "AI will be confidently wrong. Here is the workflow that makes that survivable.",
      `If you have played with an AI builder and watched it produce something confidently broken, congratulations — you have already learned the single most important lesson about this work.

AI is confidently wrong sometimes. It invents functions that do not exist. It forgets a decision it made twenty minutes ago. It writes something that looks perfect and fails the moment a real person uses it in a way you did not anticipate.

Every professional building this way knows that. It does not stop them, because they do not work the way beginners work.

Here is the beginner pattern: write one enormous vague prompt describing the whole application, accept everything that comes back without reading it, add another huge request on top, and repeat until something breaks. Then you have a large pile of code you never understood and cannot debug, and you conclude AI cannot really build software.

Here is the professional pattern.

**Small pieces.** One feature at a time, never the whole application in a single instruction. Small changes are reviewable, and reviewable changes are fixable.

**Stated acceptance criteria.** Before generating, you say what "working" means in plain language. When a user submits an empty form, this specific thing should happen. Now you have something to test against instead of a vibe.

**Test immediately.** After every meaningful change, use it like a suspicious customer. Wrong inputs, empty fields, the back button, a slow connection.

**Save points.** Version control so you can always return to the last working state instead of trying to remember what you changed.

That is the workflow **Teaching AI To Build For You** and the **Prompt Playbook** teach, and it is why **Actually Work** exists as its own module. Reliability is not something you hope for at the end. It is a habit applied at every step.

The comparison worth making is not "AI versus perfect." Human developers introduce bugs constantly — that is why the entire profession invented testing, code review and rollbacks. You are inheriting a mature set of safety practices, not improvising them.

Mistakes are the normal condition of building. Catching them cheaply is the skill.

See how the review habits are taught: {{cta_url}}`,
      "See The Reliability Modules",
      "Convert a real technical fear into evidence that method matters",
      "Phase 4 · Objections",
    ),

    email(
      25,
      "Objection — what if it breaks",
      "What happens when your app breaks at 9pm",
      [
        "Every builder breaks production. The good ones recover in twenty minutes.",
        "The fear nobody says out loud before their first client",
      ],
      "Not whether things break — they will. Whether you can recover without panic.",
      `Here is a fear people rarely admit, usually because it sounds unserious: what if I build something for a real client, it breaks, and I am publicly exposed as someone who does not know what they are doing?

It is a completely reasonable fear, and the answer is not "that will not happen." It will happen. It happens to every engineer at every company you can name.

The professional difference is not that their software never breaks. It is that breaking is a twenty-minute event instead of a catastrophe.

Here is what makes that possible, and all of it is learnable.

**Version control.** Every working state is saved. When today's change breaks something, you return to yesterday's working version in minutes instead of trying to remember what you touched. This single habit removes most of the terror.

**Backups of data.** Code can be rewritten. Customer records cannot be conjured back. Knowing your data is safe changes how calmly you handle everything else.

**Separating your practice space from the live version.** You try changes somewhere that does not matter before touching the thing customers use.

**Reading the error instead of panicking.** The system almost always tells you what went wrong. Paste it, describe what you expected, work the problem.

That collection of habits is the **Safety Net** module, and it exists precisely because fear of breaking things publicly keeps capable people building nothing but private practice projects forever.

There is also a client-relationship truth worth knowing. Clients do not expect perfection — they have used enough software to know things fail. What they judge is your response. The builder who replies quickly, explains plainly and fixes it keeps the relationship, and often gains trust from the incident. The builder who goes silent loses everything, regardless of how good the original build was.

That is a large part of why Chinedu's client came back for a second website. Not flawlessness. Reliability of the human.

You will break something. Then you will fix it, and discover it was survivable, and stop being frightened of it.

See how recovery is taught: {{cta_url}}`,
      "See The Safety Net Module",
      "Remove fear of public failure by teaching recoverability",
      "Phase 4 · Objections",
    ),

    email(
      26,
      "Objection — I cannot afford tools or developers",
      "You cannot afford a developer. That is exactly the point.",
      [
        "Building on free tiers until the money shows up",
        "The zero-cost path to your first working app",
      ],
      "The cost objection, taken seriously — including how to build before you have any budget.",
      `"I cannot afford this" deserves a serious answer rather than a motivational quote, so let me start with the version of it that is really about tools and developers.

Get a quote for custom software. A basic professional website, a small booking system, an internal tool — ask a competent developer or agency what they charge. Then compare that number to what learning to build it yourself costs.

That comparison is the whole argument. The reason developer dependency is so expensive is that it repeats. Every change, every new idea, every fix is another quote and another wait. You are not buying one thing when you hire out your building; you are renting your own capability indefinitely.

But there is a second, more practical worry underneath: what if I enroll and then discover I need expensive subscriptions to actually build anything?

That is what the **Zero-Cost Toolkit** bonus is for. There is a genuine free-and-cheap path through the early months — free tiers, generous starter plans and tools that cost nothing until you have real users. You can learn, build, deploy and show a working project to a potential client without a stack of monthly bills. The subscriptions become sensible later, when something is earning and you are choosing to spend rather than hoping to.

That ordering matters. Most beginners get this backwards, paying for six tools before earning anything, then quitting because the costs mounted while nothing had shipped. Build first on free infrastructure. Spend when revenue justifies it.

**Zero-To-Builder Setup** keeps that early stack minimal deliberately, and the **Done-For-You Template Pack** means you are not paying anyone for starting structure.

On the enrollment cost itself, I will do the full breakdown in a few days — the ${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional price against the ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular price and the ${WEBINAR_FOLLOWUP_OFFER_VALUE} stated stack value, with no games. If money is genuinely your blocker rather than your excuse, that email will matter more than this one.

For now, know this: the tools are not what stands between you and a working first build.

See what the toolkit covers: {{cta_url}}`,
      "See The Zero-Cost Toolkit",
      "Address tool cost fear and reframe developer dependency as the real expense",
      "Phase 4 · Objections",
    ),

    email(
      27,
      "Objection — I cannot find clients",
      "Where the first client actually comes from",
      [
        "Nobody's first client arrived from a viral post",
        "Five unglamorous places clients are already hiding",
      ],
      "The honest sources — none of which require an audience or an advertising budget.",
      `"How do I find clients?" is the right question. The problem is that most of the answers online are either vague encouragement or advice that assumes you already have ten thousand followers.

Here are the actual sources, in the order they usually work for people starting out.

**People who already know you.** Your first client is very often someone who has met you — a family business, a former colleague, someone from church or your estate, a friend's employer. It feels unglamorous, which is why people skip it. It is also the fastest path to a first payment, because trust already exists and you only need to prove capability once.

**Businesses you can physically visit.** Pharmacies, schools, clinics, distributors, salons, small logistics operators. Most of them are running critical processes in notebooks and group chats. You do not need a pitch deck. You need one specific observation: "I noticed you track deliveries by hand — I can build something that does that."

**A specific position instead of a general one.** "I build software" is forgettable. "I build booking and record systems for small clinics" is memorable and referable. LeadThur worked because it was one sentence: find business contacts in sixty seconds. Narrow positioning makes other people able to recommend you.

**Marketplaces and directories.** Places where buyers are already looking for help. This works far better once you have one or two finished pieces to show, which is why practice builds matter. The **Software Marketplace Guide** covers this properly.

**Referrals and repeat work.** The cheapest channel that exists. Chinedu's second project came from a client who had already paid him ₦480,000. Do one job well and your next conversation starts warm.

Notice what is missing from that list: virality, a large following, paid advertising, a personal brand. Those help later. None of them produced the first client for the builders in these emails.

The **Get-Paid Guide** covers the conversations themselves — how to approach a business, scope version one, and quote without flinching.

I am not promising a full client roster in thirty days. I am telling you the paths are boring, specific, and available to you this week.

See how the client side is taught: {{cta_url}}`,
      "See The Get-Paid Guide",
      "Replace vague fear with a concrete, low-status-required client pipeline",
      "Phase 4 · Objections",
    ),

    email(
      28,
      "Objection — nobody will buy from me",
      "\"Nobody will buy from me\" — the objection under all the others",
      [
        "Why strangers pay unknown builders every single day",
        "The credibility gap, and the three things that close it",
      ],
      "You do not need a reputation. You need one piece of proof and one specific promise.",
      `Underneath every other objection there is usually this one, and it is rarely said out loud: even if I learn all of it, why would anybody choose **me**?

No brand. No portfolio. No agency behind you. Nobody has heard your name.

Here is the reality about how buyers actually decide, because it is much less about reputation than you fear.

**Proof beats reputation.** A client looking at a working thing you built stops caring about your history. One completed project — even an unpaid practice build for a business you know — functions as proof. Two is plenty for a first real client. Shade and Chinedu were not famous. They had work that existed and functioned.

**Specificity beats scale.** A well-known generalist loses to an unknown specialist almost every time when the problem is specific. If someone runs three clinics and you have built a clinic record system, your obscurity is irrelevant. You are the obvious choice in the room.

**Process beats charisma.** Buyers are not afraid you lack talent. They are afraid you will take a deposit, go quiet and vanish — because that has happened to them before. Beat that fear with clarity: here is exactly what version one includes, here is the timeline, here is how you will see progress, here is what happens if something needs changing. That single conversation makes you feel safer than a competitor with a nicer website.

**Small first steps beat big commitments.** Nobody has to hand you a ₦650,000 project on day one. A small paid piece — a landing page, one internal tool, a fix — lets a client test you cheaply. Deliver that and the next conversation is a much bigger one. That is precisely how Chinedu's second website happened.

There is also this: the businesses that need you most are not being courted by anybody. No agency is calling the pharmacy on your street. The competition you imagine is largely fictional.

You do not need to be known. You need one thing that works, one clear promise, and the discipline to deliver what you said.

See what you would build first: {{cta_url}}`,
      "See The Full Program",
      "Close the credibility gap with mechanics buyers actually use to decide",
      "Phase 4 · Objections",
    ),

    email(
      29,
      "Value stack — modules one to five",
      "What the first five modules would cost you to learn alone",
      [
        "Modules 1 to 5, and the months they save you",
        "Setup, direction, blueprints, prompts, polish",
      ],
      "Not a list of titles. What each of the first five modules actually removes from your path.",
      `Let me stop persuading for a moment and just show you what is inside the first half of the training, and more importantly what each piece removes from your path.

**Module 1 — Zero-To-Builder Setup.** Which tools, which accounts, which folder structure, which defaults, in what order. This looks like the boring module and it is the one that saves the most people. The single most common place beginners quit is the setup wall, where five conflicting tutorials produce a broken environment and the conclusion "I am not technical." Getting a working baseline on day one, without weeks of trial and error, is worth the price of admission by itself.

**Module 2 — Teaching AI To Build For You.** The difference between people who get magic and people who get a broken pile of files is entirely here. Context, constraints, checkpoints, working in small verifiable steps, knowing when to reject output and start again. This is the module that converts a chat window into an employee.

**Module 3 — Idea-To-Blueprint.** Turning a feeling into a specification: who it is for, the core flows, what data must be remembered, and the exclusion list of things version one deliberately will not do. Ryplix rebuilding a product in about two weeks, per Bolt's published case study, was possible because direction was clear. Vague projects are slow projects.

**Module 4 — Prompt Playbook.** Reusable patterns for the situations you will hit weekly — new features, bug fixes, making something look professional, restructuring without breaking behaviour. Patterns instead of improvisation, so you stop staring at an empty prompt box wondering how to phrase what you want.

**Module 5 — Making App Look Good.** Layout, spacing, type, mobile behaviour, and knowing when to stop. Shade's ₦650,000 ecommerce project was not won on invisible backend elegance. Clients and customers judge credibility in seconds, and that judgement happens before anyone evaluates your logic.

Learning those five alone, from scattered free content, is realistically a few months of wandering with no guarantee you assemble them in a workable order.

Tomorrow, modules six to ten — the half almost nobody teaches free.

See the module breakdown: {{cta_url}}`,
      "See Modules One To Five",
      "Concrete value per module with time-cost framing",
      "Phase 5 · Value stack",
    ),

    email(
      30,
      "Value stack — modules six to ten",
      "Modules 6 to 10: the difference between a demo and software",
      [
        "The unglamorous half that nobody teaches for free",
        "Reliability, memory, recovery, shipping, app stores",
      ],
      "Anyone can produce a demo. These five modules are what makes it worth money.",
      `Yesterday: setup, direction, blueprints, prompts, polish. Today, the half that decides whether you get paid twice.

Because here is the uncomfortable truth about AI-assisted building. Producing something that looks like software is now easy. Producing something a stranger can rely on with their own money still requires craft, and that craft is what the second half of this curriculum is.

**Module 6 — Actually Work.** Testing real flows, handling empty states, validating input, writing error messages a human understands, and the edge cases that only show up on an old phone with bad network. This is the module standing between a demo that impresses on a call and software that survives a launch week.

**Module 7 — Remember Things.** Data that persists correctly. Accounts that do not vanish. Records that are still right next month. LeadThur ran 9,460 paid searches because results came back reliably every time, not because the landing page was persuasive. Nobody pays twice for software that forgets.

**Module 8 — Safety Net.** Version control, backups, separating practice from live, recovering from a bad change. The difference between a twenty-minute incident and a lost weekend rebuilding from memory. This module is also where fear of shipping publicly dies.

**Module 9 — On The Internet.** Domains, hosting, environment settings, and getting a working build to an address a client can open on their phone. Everything before this is rehearsal. Software that lives on your laptop earns nothing — the ₦10,000,000 project and Shade's ecommerce site were not localhost projects.

**Module 10 — App Stores.** When a web app is enough and when native packaging matters, what review processes generally expect, and how to answer mobile questions on a client call without over-promising. Shade is now turning her ecommerce work into an app, which is exactly the moment this module becomes relevant. Nobody controls Apple's review times, and this module will not pretend otherwise.

Ten modules, in the order a real project actually happens. That ordering is the part free content structurally cannot give you.

The full breakdown, plus the eight bonuses, is here: {{cta_url}}`,
      "See Modules Six To Ten",
      "Position reliability and shipping as the paid difference",
      "Phase 5 · Value stack",
    ),

    email(
      31,
      "Prompt Playbook and the cost of bad prompting",
      "Bad prompting is the most expensive habit in AI building",
      [
        "The hidden tax on every vague instruction you give",
        "Why the Prompt Playbook exists as its own module",
      ],
      "Same tools, same access, wildly different results. This is usually the reason why.",
      `Two people sit down with the same AI builder, the same subscription and the same idea. One has a working app by Friday. The other has a folder of broken files and a theory that AI is overhated. The tools were identical. The instructions were not.

Bad prompting is the most expensive habit in this work, and it is expensive in ways people never account for.

**It costs hours.** A vague instruction produces plausible-looking output that fails on contact with reality. Now you are debugging something you never specified and do not fully understand, which takes longer than building it properly would have.

**It costs money.** Every regeneration burns credits or subscription value. Ten sloppy attempts cost more than two precise ones, and produce a worse result.

**It costs coherence.** This is the one that really hurts. Vague instructions accumulate contradictions. The AI patches something over here, quietly breaks something over there, and after two weeks you have a codebase nobody — human or machine — can reason about. That is the stage where most abandoned projects die.

**It costs belief.** People conclude they are not technical, when actually they were giving a very capable contractor a very unclear brief.

The **Prompt Playbook** module exists because this is a pattern skill, not a talent. Professionals are not more creative in the prompt box. They reuse structures that work for situations that recur constantly:

- adding a new feature to something that already works
- fixing a specific bug with the error text and expected behaviour included
- making an interface look professional without breaking mobile layout
- restructuring code without changing what it does
- reviewing output before accepting it

Recognise the situation, apply the pattern, check the result, iterate. That is the whole discipline, and it turns a chat window from a slot machine into a tool.

There is a compounding benefit too. Once your prompts are patterns rather than improvisation, they are reusable and shareable — you can hand one to an assistant later instead of re-explaining your entire thought process every session.

The playbook sits inside the full curriculum here: {{cta_url}}`,
      "See The Prompt Playbook",
      "Make invisible waste visible so the training feels like a cost saving",
      "Phase 5 · Value stack",
    ),

    email(
      32,
      "Bonuses — templates, ideas, support",
      "Three bonuses that remove the three reasons people quit",
      [
        "Templates, ideas, and humans who actually answer",
        "The bonuses that keep you moving when motivation fades",
      ],
      "People rarely quit because the material was too hard. They quit stuck, blank or alone.",
      `People rarely abandon a program because the content was too difficult. They abandon it because they got stuck, went blank, or felt alone. Three of the eight bonuses exist specifically to remove those three failure points.

**Done-For-You Template Pack.** Starting structure for common types of application, so you begin from something that already runs instead of an empty folder. This matters more than it sounds. The empty-folder moment is where enthusiasm goes to die — you sit down, face nothing, invent an excuse and close the laptop. Templates convert that moment into customisation, which is a task you can actually start at ten o'clock at night when you are tired. They are not a replacement for understanding the modules; they are what makes practice frequent enough for the understanding to stick.

**App Idea Vault.** Curated starting points for when your own list is empty. Practice builds, portfolio pieces, and a way to study what makes a narrow product work. Remember what LeadThur actually was — one sharp, specific, repetitive pain solved faster than a human could. The vault is there so "I do not know what to build" never becomes your reason for stalling for a month.

**Private Support Family.** The human layer. Self-teaching has a hidden tax, and it is stall time: three days lost to something a person who had seen it before would have resolved in ten minutes. That tax is what kills momentum, and momentum is the whole game in the first ninety days.

Support also does something less obvious. It normalises the mess. When you see other people posting broken builds, awkward client conversations and first attempts that look nothing like a polished demo, you stop believing you are uniquely unsuited to this. Everyone's early work is embarrassing. You only ever see other people's finished versions.

None of these three teach you to build. The modules do that. These are the bonuses that keep you present long enough for the modules to work — which, honestly, is the variable that decides most outcomes.

See all eight bonuses listed out: {{cta_url}}`,
      "See The Bonuses",
      "Frame bonuses as protection against the real failure points",
      "Phase 5 · Value stack",
    ),

    email(
      33,
      "Bonuses — money, cost, and being found",
      "The bonuses that turn building into getting paid",
      [
        "Get paid, spend nothing, get found",
        "Three bonuses that have nothing to do with code",
      ],
      "Building skill alone produces an expensive hobby. These three close the loop.",
      `Building skill on its own produces a very expensive hobby. Three of the bonuses exist to close the loop between what you can make and what lands in your account.

**Get-Paid Guide.** The business half of this work — approaching a business, scoping version one, quoting a number without flinching, handling change requests, agreeing payment terms, and delivering like someone who intends to be recommended. This is the layer that separates the builders in these emails from equally capable people who never invoiced anybody. Shade's ₦650,000 and Chinedu's ₦480,000 did not happen because of superior code. They happened inside a competent business conversation that ended with an agreement.

**Zero-Cost Toolkit.** How to learn, build, deploy and demonstrate without stacking monthly subscriptions before you have earned anything. The ordering matters enormously here: build on free and generous tiers first, spend when revenue justifies it. Most beginners do the reverse, pay for six tools, ship nothing, and quietly quit while the debits continue. This bonus keeps your early months cheap so that money pressure never becomes your reason for stopping.

**Software Marketplace Guide.** Building privately is safe and invisible. This covers how marketplaces and software directories work as discovery channels — how to present what you have made, what buyers there are actually scanning for, and how to be findable when you have something worth finding. LeadThur did not grow on inspiration alone; people had to be able to find it and immediately understand what it did.

Together these three answer the question the webinar chat is always full of, even when nobody types it: fine, but who actually pays me?

The answer is not mysterious. Somebody with a problem, a budget and a reason to trust you. Getting in front of that person, saying the right thing, charging properly and delivering is a skill set — and it is deliberately included rather than left as an exercise for the reader.

See how the money side is covered: {{cta_url}}`,
      "See The Monetization Bonuses",
      "Connect build capability to actual income mechanics",
      "Phase 5 · Value stack",
    ),

    email(
      34,
      "Bonuses — lifetime access and attention",
      "AI changes every month. Your access does not expire.",
      [
        "Lifetime updates in a market that reinvents itself quarterly",
        "Two bonuses for the long game",
      ],
      "The objection 'tools change too fast' is real — and it is exactly why this is structured this way.",
      `One objection I take seriously: "AI tools change so fast that anything I learn will be outdated by next year."

It is a fair observation. It is also, examined properly, an argument for learning rather than waiting.

Tools change. The problems businesses pay to solve change far more slowly. Companies needed booking systems, inventory tracking, internal dashboards and better contact workflows ten years ago and they will need them in ten years. The task LeadThur solves did not disappear because a new model was released. What changes is the interface you use to build the solution — and interfaces are the easy part to relearn when the underlying judgement is already yours.

Still, curriculum that is frozen in time genuinely does go stale. Which is why two of the eight bonuses are about duration rather than content.

**Lifetime Access + Free Updates.** You are not buying a snapshot of one particular month in AI history. As tools shift, the material can move with them, and you are not repurchasing a course every quarter to stay current. This also removes the pressure to consume everything in one intense fortnight. Real learning happens in uneven bursts around jobs, family and energy levels. Access that does not expire means a bad month costs you nothing but time.

**Organic And Paid Ad Formula.** Attention, for when you have something worth showing. Getting found organically, and running paid traffic without setting money on fire. You do not need this in week one — building comes first. But there is a predictable moment, usually around your second or third finished project, where the constraint stops being "can I build it?" and becomes "how do more of the right people see it?" That is when this bonus becomes the most valuable thing in the stack.

Between them, these two bonuses are a statement about the timeline. This is not a weekend course you consume and forget. It is a skill you develop over months, with the material staying current underneath you.

See the full stack: {{cta_url}}`,
      "See Lifetime Access Terms",
      "Handle the volatility objection and extend the perceived time horizon",
      "Phase 5 · Value stack",
    ),

    email(
      35,
      "Price and value math",
      "₦49,999 now, ₦100,000 regular, ₦805,000 stated value — the honest math",
      [
        "Let's do the money conversation properly",
        "What you are actually comparing when you compare price",
      ],
      "No inflated claims, no fake countdown. Just what each number means and what it buys.",
      `Let me do the money conversation plainly, because you deserve better than a slide full of crossed-out numbers.

Three figures are involved.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}** is the promotional enrollment price. That is what you pay today.

**${WEBINAR_FOLLOWUP_REGULAR_PRICE}** is the regular price of the program outside promotional pricing. Same modules, same bonuses, different number.

**${WEBINAR_FOLLOWUP_OFFER_VALUE}** is the stated value of the full stack — ten modules and eight bonuses valued individually and added together.

Now let me be honest about what that third number is and is not, because inflated value stacks are one of the reasons people distrust online offers. It is a good-faith valuation of the components: **₦450,000** stated value for the ten training modules, **₦315,000** stated value for the eight bonuses, and a **₦40,000** fast-action bonus where that bonus actually applies — adding to **₦805,000**. It is not cash. Nobody is handing you ₦805,000. Treat it as a description of what you would otherwise have to assemble piece by piece, from different sources, in an order you would have to guess at.

The fast-action piece is not unlimited and it is not a fake countdown. Where it applies, it is an extra; where it does not, the rest of the stack is still the offer.

Here are the comparisons I think are actually useful.

**Against a developer quote.** Ask a competent developer what they charge for one custom booking system or a modest internal tool. Compare it to enrollment. Then remember the dependency repeats for every change, every fix and every new idea.

**Against one client project.** Chinedu earned ₦480,000 from one client. Shade earned ₦650,000 from one project. Neither is a guarantee of your outcome, and I will not pretend otherwise — but they tell you honestly what the market pays competent builders for a single delivery.

**Against another year of research mode.** Half-finished free courses, six conflicting tutorials, no shipped project. That year costs nothing and returns nothing, which is the most expensive arrangement available.

I am not going to tell you the price disappears tonight, because that would be a lie and you would rightly stop trusting everything else here.

What is true is simpler: this is what it costs while promotional pricing runs, and the skill gap is not closing itself while you decide.

The itemised stack is here: {{cta_url}}`,
      "Compare Price And Stack",
      "Transparent value framing with credible comparison anchors",
      "Phase 5 · Value stack",
    ),

    email(
      36,
      "Why this program exists",
      "Why I built this instead of another \"AI hacks\" course",
      [
        "The reason the curriculum is shaped exactly the way it is",
        "What I wish somebody had handed me at the start",
      ],
      "Most AI training teaches tricks. Almost none of it teaches finishing.",
      `I want to tell you why this program is shaped the way it is, because the shape is the whole argument.

Look at what most AI education actually is. Prompt lists. Tool tours. "Ten AI tools that will replace your job." Content designed to be exciting for twenty minutes and useless by Thursday. It teaches tricks, and tricks do not compound into anything you can charge for.

Meanwhile the real bottleneck sits somewhere else entirely.

I watched it repeatedly. People with genuine ideas, real drive, and access to the same tools as everybody else, stuck in the same four places every single time: they could not translate an idea into a specification, could not judge whether what got built was any good, could not finish the last unglamorous twenty percent, and could not get the thing onto the internet where a human being could pay for it.

Notice that not one of those is a prompting problem. That is why a prompt list never fixes them.

So the curriculum follows the actual shape of a real project instead of the shape of a content calendar. Setup, so you do not quit at the environment wall. Direction, so the AI behaves like a contractor rather than a slot machine. Blueprints, so you build something specified rather than something felt. Polish, because credibility is visual first. Reliability and data, because software people trust is what gets paid for twice. Recovery and deployment, because unshipped work earns nothing. App stores, for when the question arrives.

Then the bonuses cover everything that sits around building — ideas, templates, support, pricing, distribution, cost control, and updates as the tools shift.

I also built it because of the gap I keep seeing in this market specifically. Businesses everywhere running on notebooks, spreadsheets and WhatsApp groups. Almost nobody available to build the missing piece properly. Those two facts sitting next to each other are an opportunity, and it is currently going largely unclaimed.

I am not offering you a shortcut. I am offering the ordered version of a path I would have paid a lot to be handed at the start, rather than assembling it badly over years.

Here it is, in one place: {{cta_url}}`,
      "See Why It Is Built This Way",
      "Founder rationale that reframes the offer as structure, not hype",
      "Phase 6 · Close",
    ),

    email(
      37,
      "If I were starting from zero",
      "If I were starting from zero next Monday, this is exactly what I'd do",
      [
        "Your first thirty days, laid out honestly",
        "Starting from nothing, deliberately",
      ],
      "A concrete thirty-day plan, including the part where it stops being fun.",
      `Suppose I woke up on Monday with no reputation, no portfolio, no clients and no technical background, and I had to build a real income from this skill. Here is precisely what I would do.

**Week one — get a working baseline.** Nothing else. Finish the setup module properly, exactly as taught, without shopping around for other opinions on YouTube. The goal is a working environment and one tiny thing that runs. Most people never get here, which is why most people never get anywhere.

**Week two — build one small ugly thing all the way to the internet.** Not impressive. Finished. A single-purpose tool for one person I know: a booking form, an invoice generator, a stock tracker. The point is completing the entire path once — blueprint, build, test, deploy — so it stops being theoretical. Ugly and live beats beautiful and local.

**Week three — have five conversations.** Businesses I can physically reach. No pitching. Just: what part of your week is most annoying, what do you track by hand, what have you tried. Then watch one of them do the task. Somewhere in those five conversations is a real project, and I would rebuild my week-two project properly for whichever one is most specific.

**Week four — ask for money.** Small first engagement, clear scope, clear timeline, clear price. Not ₦650,000 immediately. Something modest and real, because the first paid delivery changes your identity more than any amount of study ever will.

Then repeat, but bigger. Second project prices higher because proof exists. Third one probably arrives by referral.

Now the honest part. Somewhere in week two or three, it stops being fun. Something breaks that you do not understand and the whole plan feels stupid. That moment is not a signal to quit — it is the entire test, and it is the reason support and structure matter more than motivation.

Notice what is absent from that month: perfect knowledge, an audience, a business plan, funding, permission. Just a working setup, one finished thing, five conversations, one invoice.

The modules map onto exactly this order: {{cta_url}}`,
      "Start Week One",
      "Make the path concrete and imminent rather than abstract",
      "Phase 6 · Close",
    ),

    email(
      38,
      "The cost of staying unable to build",
      "The quiet cost of remaining someone who cannot build",
      [
        "What another year of \"not yet\" actually costs",
        "No deadline from me. Just compounding.",
      ],
      "There is no countdown here. There is a slow arithmetic, and it runs whether you decide or not.",
      `I have not put a countdown in any of these emails, and I am not going to start now. There is no midnight, no closing door, no fake scarcity. Those tactics work on adrenaline, and adrenaline makes bad decisions that turn into refund requests and abandoned logins.

But I do want to name the real cost of waiting, because it is invisible and it accumulates quietly.

**Every idea stays dependent.** Each one still needs someone else's hands, someone else's quote, someone else's timeline. That is not one delay. It is a permanent tax on your creativity — and most ideas do not survive it. They get shelved during the saving-up phase and never come back.

**The projects go to other people.** Not to more talented people. To whoever was capable when the client asked. Chinedu's second website went to Chinedu because he was there and he had already delivered once. Somebody nearby is getting asked, this month, whether they can build something. The only question is whether that person is you.

**The gap widens.** Not in tools — those get easier, which is what people mean when they say "I will start when it is simpler." It widens in **reps**. The person who started six months ago is not ahead because of better software. They are ahead because they have shipped four things, broken production twice, priced three jobs and survived one difficult client. You cannot download that. It only accrues with time spent building.

**The identity hardens.** This is the one that worries me most. "I am not technical" gets more true every year you agree with it, until it stops feeling like a decision and starts feeling like a fact about you.

None of that produces a dramatic bad day. It produces a year that looks exactly like last year, which is a far more common outcome than failure.

So no, nothing expires tonight. The arithmetic just keeps running: businesses around you keep needing software, capable builders stay scarce, and the reps you have not done yet stay undone.

Whenever you are ready, everything is here: {{cta_url}}`,
      "See The Offer Page",
      "Evergreen urgency through opportunity cost rather than false deadlines",
      "Phase 6 · Close",
    ),

    email(
      39,
      "What the skill enables over time",
      "What this skill looks like two years from now",
      [
        "The compounding version of a builder's life",
        "Where this goes if you simply keep going",
      ],
      "Not a promise. A description of what tends to happen when the skill stays with you.",
      `Let me show you the longer view, carefully, because this is where most marketing starts lying and I would rather not.

I cannot tell you what you will earn. Income depends on your market, your effort, your sales ability, your consistency and a fair amount of luck. Anyone promising you a figure is selling you something other than the truth.

What I can describe is what the skill **enables**, because that part is structural rather than lucky.

**Your ideas stop dying.** This is the change people underestimate most. When building is available to you, the notes app stops being a graveyard. Ideas get tested, most fail cheaply, and occasionally one works — but they all get their chance instead of quietly expiring.

**Your income stops being single-source.** Client projects, a small product, a retainer for keeping something you built alive, an internal tool for an employer who now cannot easily replace you. Not one income, several small ones, in different shapes.

**Your negotiating position changes permanently.** Whether you are employed or freelance, being the person who can produce working software puts you on a different side of every conversation about money and scope.

**Your work compounds instead of resetting.** Each build is faster than the last. Your templates accumulate. Your prompts become patterns. Your reputation becomes referrals — which is exactly the mechanism behind Chinedu's client returning and Shade extending her ecommerce project into an app.

**The ceiling stops being theoretical.** LeadThur's 681 active users and estimated ₦15,120,000 across three months, a ₦10,000,000 project, agencies operating at scale in published case studies. None of those are promises to you. All of them describe a ceiling that exists rather than one somebody imagined for a sales page.

And there is a quieter benefit that has nothing to do with money. Being able to make things is one of the few genuinely durable forms of confidence. Not the motivational kind — the kind that comes from evidence, from having built something that works and watched a stranger use it.

Two years is not long. It is twenty-four months of small sessions.

The path starts here: {{cta_url}}`,
      "See The Full Path",
      "Aspirational long-term vision without income guarantees",
      "Phase 6 · Close",
    ),

    email(
      40,
      "Final honest invitation",
      "Last email: yes, no, or not yet",
      [
        "The honest close — no countdown, no pressure",
        "Where this leaves us",
      ],
      "All three answers are acceptable. Only one of them is dishonest.",
      `This is the last email in this sequence, so let me finish the way I started: honestly.

Over these emails I showed you what I have: LeadThur's first ninety days, including 782 people who paid to use it, 681 active, 9,460 paid searches and estimated revenue of ₦15,120,000. A ₦10,000,000 client project. Shade at ₦650,000 for one ecommerce site, now extending it into an app. Chinedu at ₦480,000, with a client who came back. Published case studies from eXp Realty with Lovable, Ryplix with Bolt, and Harry Roper's reported agency numbers from his No Code MBA interview.

I told you what those prove and what they do not. I did not invent testimonials. I did not promise you income, because nobody honest can. I did not put a fake deadline on anything.

What is on the table is straightforward: **How To Build Software With AI And Get Paid For It** — ten modules following the real shape of a project, eight bonuses covering ideas, templates, support, pricing, distribution, cost control and lifetime updates, at ${WEBINAR_FOLLOWUP_OFFER_PRICE} while promotional pricing runs, against a ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular price and ${WEBINAR_FOLLOWUP_OFFER_VALUE} of stated stack value.

Three answers are available to you.

**Yes.** Then enroll and do one specific thing this week: finish the setup module. Not all ten modules, not a business plan. One working baseline. Momentum starts embarrassingly small.

**No.** That is genuinely fine. If you do not want to build software, this is not a small commitment to make out of guilt. Say no clearly, unsubscribe if these emails are noise, and go and be excellent at whatever you actually want.

**Not yet.** This is the honest middle, and it is only respectable if you name the condition out loud. Write it down: the specific amount, the specific month, the specific thing that has to change. "Not yet" without a condition attached is just "no" wearing better clothes, and it has a way of quietly becoming a decade.

Thank you for reading this far. Genuinely. Attention is the scarcest thing anyone has, and you gave a lot of it.

If the answer is yes, everything is here: {{cta_url}}`,
      "Enroll And Start Module One",
      "Clean permission-giving close with a specific first action",
      "Phase 6 · Close",
    ),
  ];

  return assertValidWebinarSequence(emails);
}
