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
      "After the WebinarJam follow-ups",
      "Now that the webinar follow-ups have ended",
      [
        "A quieter note, now that the reminder sequence is finished",
        "If you registered and then life happened",
      ],
      "WebinarJam has already done its own follow-up. This is me, writing after those reminders stopped.",
      `If you are still on this list, it is because you registered for the Build Software With AI webinar, or you walked far enough into that funnel that your email ended up here.

WebinarJam has already done its own follow-up. Those emails have finished. This sequence is different. It is from me, after that reminder run ended, and I would rather start like a person picking up a conversation than like a stranger who bought a list.

Plenty of people register, watch twenty minutes, get a phone call, and never go back. Some watch to the end and still sit on it. Some have not opened the recording at all. That is ordinary. It is not a character test.

The webinar is still there. That recording is where I actually explained the skill, the work, and what the training contains. An email cannot do that job.

I will not ask you for money in this one. If you have not sat through the session, paying first would be a strange move. Find a quiet hour. Watch it. Write down the parts that annoy you. Those are usually the parts that apply.

If you already watched, go back to the middle. The useful detail is rarely in the opening.

I will keep writing after this. For today, just go through the session again with attention.`,
      "Watch the webinar properly",
      "Natural continuation after WebinarJam, no payment ask",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      2,
      "Waiting for the right time",
      "The \"right time\" to learn this rarely arrives on its own",
      [
        "Why people postpone a skill that would have helped last year",
        "Waiting until things settle usually means waiting forever",
      ],
      "A lot of people in this funnel already agree the skill matters. They are waiting for a calmer month.",
      `I keep meeting people who already agree this skill matters, then they wait for a calmer month. The shop is busy. School fees are close. They want to finish one more client job first. None of those reasons is foolish. The calendar still almost never opens a clean four-week hole labelled “learn to build software.”

What happens instead is another year. The same WhatsApp notes still hold the same ideas. The same businesses around them still pay someone else for the website, the booking page, the inventory sheet that should have been a small app.

You do not have to abandon your life for a course. You do have to notice that postponement is still a decision, even when it feels like you have not decided. You already spent time registering for the webinar. That was a small bet that this topic was worth an evening. Leaving the session unwatched while you wait to feel ready is the expensive version of that same bet.

If you watch it this week, you may still decide it is not for you. That is cleaner than carrying a half-finished curiosity for six months.

When you have a stretch of time that is merely good enough, not perfect, go through the webinar. The session is there to give you the picture first. Decisions after that are easier.`,
      "Go through the session this week",
      "Cost of waiting as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      3,
      "Ideas without a way to build",
      "An idea in your notes is not a product yet",
      [
        "What usually sits between the idea and something a client can click",
        "Why “I have an app idea” is not the same as being able to ship",
      ],
      "Most people in this audience already have ideas. The missing piece is a way to turn one into working software.",
      `Open the notes on your phone. You will probably find at least one thing that would actually help a real business: a salon booking page that does not live in a group chat, a simple stock list for a shop, a way for a church or school to collect registrations without paper. Ideas are not the rare part.

The rare stretch is the one between “I can describe this” and “somebody can use it on their phone.” For years that stretch meant finding a developer, explaining the thing badly, getting a quote that shocked you, then either abandoning it or paying and waiting. A lot of people quietly conclude they are “not technical” when what they actually lack is a method for directing the build.

The webinar walks through that gap on purpose. I spend time on what it looks like to go from a messy idea to something specified enough that tools can help you build it, then what it takes to put it where users can reach it. That is more useful than another pep talk about believing in yourself.

If you have an idea you have been sitting on, watch the session with that idea in mind. Pause when I talk about blueprints. Write down who the first user would be, and what version one would refuse to include. You do not need a company name. You need one person and one job the software should do.

Still no payment ask. Just a serious watch while that idea is still yours, not a vague future project.`,
      "Watch it with one idea in mind",
      "Idea-to-execution gap as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      4,
      "What actually changed with AI builders",
      "Building software used to mean years of typing. That part shifted.",
      [
        "What changed for people who are not professional engineers",
        "The useful part of the AI shift, without the hype reel",
      ],
      "I want to be precise about what changed, because the internet has already oversold this.",
      `Five years ago, if you were not a developer, “I will just build the app myself” was usually a joke. You could learn HTML on YouTube and still be nowhere near a product a stranger would pay for. Custom software meant a team, or a long apprenticeship, or both.

Software did not become magic, and you still have to think. A large part of the typing can now be done by tools if you can describe the outcome, check the result, and keep going when the first attempt is wrong. Professional engineers are already working this way. Cursor, the AI-native editor from Anysphere, grew as fast as it did because people who already knew how to build started directing machines instead of writing every line by hand. That is market context. It is not a promise about your income.

The webinar is where I show what that looks like for someone who does not already live in code. I also show the parts that still hurt: setup, judgement, finishing, putting the thing on the internet. Highlight clips on Twitter make the job look like prompting. The session is closer to managing a very fast junior who needs clear instructions.

If that still feels abstract, that is why the recording exists. Watch it once through. You can decide later whether the full training is for you.`,
      "See what I actually showed in the webinar",
      "Market shift explained as a reason to watch, not to pay",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      5,
      "Directing tools versus studying code for years",
      "You do not need a computer science degree to be in the room",
      [
        "What you still have to learn, and what you no longer have to memorise",
        "Directing a build is a different skill from writing syntax from memory",
      ],
      "People hear “build software” and picture three years of tutorials. That picture is outdated, and also not completely wrong.",
      `I need to separate two skills, because mixing them is how people either panic or get sold nonsense.

Writing code from memory — loops, frameworks, holding a language in your head — still exists. It is a real profession. You do not have to become that person to produce software people can use. You do have to become comfortable being around the work: reading an error, describing what you expected, rejecting output that looks fine and behaves badly, testing on a slow connection like a suspicious customer.

That second skill is closer to directing than to sitting an exam. You decide what the thing must do. You watch the take. You say “again, but the form should not submit empty.” It is slower than the ads suggest and much faster than the old path of becoming a developer first and building second.

In the webinar I show that distinction with the actual workflow, not with slogans. If you have been avoiding the recording because you assume it is a coding bootcamp in disguise, watch the first hour with that question in mind. You should be able to tell whether this is for you without paying for the full programme.

If you already code, watch it anyway. The useful part for you may be how to specify version one so you stop rebuilding the same messy project.`,
      "Watch the workflow, not the slogans",
      "Directing vs years of syntax as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      6,
      "Building for clients",
      "A lot of the money in this skill shows up as client work first",
      [
        "Websites, booking systems, and internal tools people already pay for",
        "You do not need a startup idea to use this",
      ],
      "If you know businesses that still run on notebooks and group chats, you already understand the demand.",
      `Not everyone who learns this should launch a product on day one. In Nigeria, a very common first cheque is a client project: an ecommerce site for a shop that is tired of WhatsApp orders disappearing, a booking flow for a clinic, a simple internal tool so staff stop fighting with a spreadsheet that was never meant to be software.

Those jobs exist because the business already feels the pain. They are already paying for the mess in wasted hours, lost orders, or a developer quote they cannot swallow. You are not inventing a market. You are walking into one that is often poorly served.

I talk about this in the webinar because people hear “build software” and think they need a billion-naira idea. Sometimes they need one owner they can visit, one process that is embarrassing, and a version one that actually works on a phone.

Watch the session looking for the client-work thread. I will get into numbers and named examples later in this sequence. For now I want you to see the shape of the work: scope, delivery, something a client can click. If that sounds more realistic than becoming a founder this month, the webinar will make more sense than another product-launch video.`,
      "Watch the client-work part of the session",
      "Client opportunity as a distinct reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      7,
      "Building your own product",
      "The other road: one narrow tool, many users",
      [
        "Why a small product can be a business without becoming a famous startup",
        "Narrow problems are easier to explain, and easier to charge for",
      ],
      "Client work pays. A product that people keep using is a different kind of asset. Both start with being able to build.",
      `There is a second road besides client projects, and I do not want you to mix them in your head this week.

A product is something many people can use without you sitting in their shop. The useful versions are usually narrow. Find business contacts in about a minute instead of burning an afternoon. Track one annoying process. Do one job faster than a human with a browser tab. When the promise fits in a sentence, people understand whether to pay.

I built a tool in that category called LeadThur. I will open the actual usage numbers in a later email, with the word estimated where it belongs. Today I only need the pattern: one painful, repeating task, built without waiting for a funded engineering team.

The webinar shows how a product path still depends on the same foundation as client work — specifying, building, testing, shipping — and why starting enormous usually means finishing nothing.

If you have been daydreaming about “my app” for years, watch the session and listen for how small version one is supposed to be. That might be the most useful hour you spend on this, even if you never buy the full training.`,
      "See how the product path is explained",
      "Own-product opportunity as a reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      8,
      "Businesses still need software",
      "Look at the businesses on your street, not Silicon Valley",
      [
        "WhatsApp, spreadsheets, and half-fitting subscriptions are the brief",
        "Demand is local even when the tools are global",
      ],
      "You do not need to invent a new category. You need to notice work that is already being done badly.",
      `Walk through a market, a plaza, a school office, a pharmacy. Count how much of the operation lives in a notebook, a spreadsheet, or a WhatsApp group. Orders. Attendance. “Who paid.” “Who is on shift.” That is not a technology trend. That is how a lot of real organisations still run, and they pay for the confusion even when they do not put it on an invoice.

They also pay for software that almost fits: a global tool with seats they do not need, or a website that cannot take payment properly, or an app that looks fine and collapses when the network is bad. The person who can build the missing piece, or replace the awkward bit, is selling something those businesses already understand.

The webinar spends time on this because it is easy to watch international Twitter and conclude you need a venture-scale idea. You need a problem somebody already has, close enough that you can watch them do the task.

If you watch nothing else, watch the parts where I talk about ordinary software — booking, records, shops, internal tools — and how those map to what we teach. Then decide whether you even want this skill. That decision is cheaper after an hour of video than after a month of guessing.`,
      "Watch with your street in mind",
      "Local demand as the reason to return to the webinar",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      9,
      "Depending on developers for every idea",
      "What it costs when every change needs someone else's calendar",
      [
        "Quotes, waiting, and the small change that puts you back in the queue",
        "Developers are not the enemy. Living on their calendar for every idea is the tax.",
      ],
      "Good developers earn what they charge. The hard part is needing one for every thought you have.",
      `If you have ever tried to get a custom site or a small system built, you already know this story. You explain. You wait for a quote. The number is higher than you hoped, so you negotiate or you freeze. If you go ahead, you wait again. Then you want one extra field, or a mobile view that does not cut off the button, and you are back in the queue. If the person goes quiet, the project goes quiet with them.

Developers are not the enemy. A competent one is expensive because the work is real. The tax is living in a state where you cannot move an idea without someone else's calendar. For a business owner, that tax repeats. For someone who wants to build for others, it is the same tax wearing a different shirt.

The webinar is partly about reducing that dependency. You may still collaborate with engineers. You should also be able to produce working software yourself, or at least a version one you can show.

Watch it with a recent quote in mind, if you have one. Compare waiting with being able to try. I will talk about the price of the full training later. This email is still about whether you understand the problem well enough to sit through the session.`,
      "Watch before you request another quote",
      "Developer dependency as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      10,
      "What the webinar actually covers",
      "What you will actually see if you sit through the session",
      [
        "A plain recap of the ground the webinar covers",
        "Why an hour of video still beats another week of guessing",
      ],
      "If you have been waiting for a summary: this is the map. The recording is still the thing itself.",
      `People ask me to summarise the webinar in an email. I can give you the map. I cannot give you the demonstration, which is most of the value.

You will see how we think about going from a messy idea to something specified. You will see how to work with AI as a builder rather than as a chatbot you argue with. You will see why looking professional matters for trust, why “it works on my laptop” is not the same as software, how data is supposed to persist, what you do when something breaks, and what it takes to put a finished thing on the internet — including, later in the full training, the uncomfortable questions about app stores.

The live session is also where I separate operator stories from method stories, so you are not asked to swallow a blended legend. If you only read emails, you will miss that labelling.

I have not asked you to pay in these first ten notes. I have asked you to watch. If you still have not, this is the most practical time, because the next emails start assuming you at least know what I taught.

Give it a proper sitting. Phone on silent. If you decide afterwards that this is not your path, you will have decided with information. That is the point of the recording.`,
      "Take an hour and watch this properly",
      "Detailed recap as the tenth distinct reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      11,
      "From webinar to the training path",
      "If you watched, here is what the actual training is for",
      [
        "The programme behind the webinar, in ordinary language",
        "Who this is for, now that you have the session as context",
      ],
      "From here I will talk about the offer more directly. I still will not pretend you must decide tonight.",
      `If you watched the webinar, you already have the picture. The full programme — **How To Build Software With AI And Get Paid For It** — is the ordered version of that picture: setup, directing AI, turning an idea into a blueprint, prompts that do not waste a week, making the thing look trustworthy, making it actually work, storing data, recovering from mistakes, putting it on the internet, and guidance for app stores when that question arrives.

I operate other businesses. PromptEarn is one of them: more than ₦800,000,000 in transactions, and more than 20 cars to top performers. That is operator context. What PromptEarn is **not** proof of: it is not evidence that this AI-building method produced PromptEarn. Different business, different period, different path. I will keep those lines separate.

The offer page is ${WEBINAR_FOLLOWUP_OFFER_PRICE} while promotional pricing is running. Regular price is ${WEBINAR_FOLLOWUP_REGULAR_PRICE}. I will unpack the ${WEBINAR_FOLLOWUP_OFFER_VALUE} stated stack later, module by module, without treating it as cash in your account.

If you have not watched yet, the webinar is still the better first step. If you have, the offer page is the place that lists what you get in full.`,
      "See the full training offer",
      "Transition from webinar to offer without a hard cut",
      "Phase 2 · Belief",
    ),

    email(
      12,
      "Setup and the first week",
      "Most people do not fail at “talent.” They fail at a broken setup.",
      [
        "Why the first module exists, and what it saves you",
        "Conflicting tutorials are how beginners decide they are not technical",
      ],
      "If you have ever opened five YouTube tabs and closed the laptop, this is the part of the training that is for you.",
      `I will be practical. The first module is **The Zero-To-Builder Setup**. It looks boring. It is the module that stops people quitting before they have built anything, because they hit five conflicting tutorials, a broken environment, and a quiet conclusion that their brain is the wrong shape.

The training walks the workspace in order: tools, accounts, folders, defaults. You want a baseline that runs, not a philosophy of editors.

Module two, **Teaching AI To Build For You**, is the actual working relationship: you as the person who specifies and checks, the model as the one producing drafts. That is also where people discover they were giving vague instructions and then blaming the tool.

If you watched the webinar, you saw the shape of this. The offer is the place you go through it with the full sequence, templates, and support. ${WEBINAR_FOLLOWUP_OFFER_PRICE} is the promotional price on that page.

You can still be unsure. Uncertainty after a clear first week is different from uncertainty after no start at all.`,
      "See how the first modules are taught",
      "Education on setup to make the offer feel like a path",
      "Phase 2 · Belief",
    ),

    email(
      13,
      "Idea to blueprint",
      "Feelings are not specifications. AI cannot build a feeling.",
      [
        "What the Idea-To-Blueprint system is actually for",
        "Version one is mostly a list of what you refuse to include",
      ],
      "This is the module that turns “like Uber but for tailors” into something you can actually start.",
      `People lose months here. They have a sentence that sounds like a product and nothing a builder — human or machine — can execute. “Like Uber but for tailors” has no user, no first screen, no data, and no definition of done.

**The Idea-To-Blueprint System** is the part of the training that forces those decisions: who it is for, the core flows, what must be remembered, and the rude list of things version one will not do. That exclusion list is not a lack of ambition. It is how version one exists.

When I later mention a published case of a team rebuilding a product in about two weeks, the interesting part is not the slogan “AI is fast.” Fast rebuilds happen when somebody already knows what the product must do. Vague briefs generate confident mess at record speed.

If you have an idea, try writing a one-page blueprint tonight: user, job, three screens, three things you will not build yet. Then look at the offer if you want the full method, examples, and the prompt patterns that sit on top of it.

The page is ${WEBINAR_FOLLOWUP_OFFER_PRICE} on promo. The webinar already showed why this order exists. The programme is the order, written down and supported.`,
      "See the blueprint training on the offer",
      "Blueprint education connecting to the offer",
      "Phase 2 · Belief",
    ),

    email(
      14,
      "Prompt playbook as a craft",
      "Bad instructions are expensive even when the tools are cheap",
      [
        "Why two people with the same tool get different Fridays",
        "Patterns for features, bugs, and polish — not vibes",
      ],
      "If you have already tried an AI builder and got a beautiful broken page, this is the missing piece.",
      `Two people can sit down with the same builder and the same idea. One has something working by Friday. The other has a folder they are afraid to open. The difference is often not intelligence. It is how they instruct, how small they work, and whether they test after each change.

**The Prompt Playbook** exists because this is a repeatable craft. Adding a feature without destroying what already works. Fixing a bug with the error text and the expected behaviour included. Making a screen look professional without breaking the mobile layout. Restructuring without silently changing behaviour. Reviewing before you accept.

Vague instructions cost hours, credits, and eventually belief. People decide they are “not technical” when they were running a contractor with a foggy brief.

The webinar introduced this. The module is where you practise it. If that is the gap you felt while watching, the offer page is the next place to look — ${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional, same stack I will keep unpacking.`,
      "See the Prompt Playbook in the offer",
      "Educational email on instruction quality",
      "Phase 2 · Belief",
    ),

    email(
      15,
      "Software hiding in ordinary businesses",
      "The brief is often already in the spreadsheet",
      [
        "Booking, stock, attendance, “who paid” — software wearing a disguise",
        "You can learn this market by watching how work is done, not by brainstorming",
      ],
      "If you know a business that runs on Excel and voice notes, you already have research.",
      `I want you to look at work, not at “startup ideas.”

A spreadsheet doing bookings is a product brief. A group chat doing orders is a product brief. A staff member copying names from one place to another is a budget line that already exists. You are not always creating a new expense. Sometimes you are replacing a painful one.

This is why the training includes turning a noticed problem into a blueprint, then into something that lives on a phone. It is also why the **App Idea Vault** bonus exists for dry weeks — practice starting points — while your unfair advantage is still the industry you already understand.

Every shop owner will not hire you tomorrow. The raw material is still local and visible if you watch people work for fifteen minutes instead of asking them to describe their process, which they will tidy up in the telling.

If that way of seeing felt true in the webinar, the offer is the structured way to act on it. ${WEBINAR_FOLLOWUP_OFFER_PRICE} on the page.`,
      "Open the offer if this is the work you want",
      "Local observation as belief-building",
      "Phase 2 · Belief",
    ),

    email(
      16,
      "Two roads, ninety days",
      "Client projects or your own product — pick one lane to start",
      [
        "Trying to do both in the first quarter is how capable people stall",
        "The skill is the same. The first ninety days should not be.",
      ],
      "Both roads are real. Walking both before you can walk is how people conclude “it didn’t work.”",
      `I will put the two roads next to each other so you can stop oscillating.

Client work: one business, one delivery, one invoice, then often an extension. It tends to pay sooner because the buyer exists. You learn scope and communication under pressure. Income pauses when you pause.

A product: many users, smaller payments or subscriptions, later payoff, and a real chance it fails. When it works, it does not need you selling every morning.

Shade’s ecommerce project and Chinedu’s website work sit on the client road. LeadThur sits on the product road. I will give those numbers properly in the next stretch of emails. Today I only need the decision: for ninety days, pick one.

The programme supports both. The **Get-Paid Guide** is heavier on the client conversation. The build modules and shipping modules serve both. If you need cash and you already know business owners, client work is the less romantic and more honest start.

Look at the offer with that choice in mind, not with a fantasy of doing everything at once. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "Choose a path, then see the offer",
      "Reduce overwhelm; connect to offer",
      "Phase 2 · Belief",
    ),

    email(
      17,
      "Cursor and the professional default",
      "The professionals already build with AI. That is useful information.",
      [
        "Cursor as market context, not a personal income forecast",
        "If the people who can already code are directing machines, the rest of us should at least understand the shift",
      ],
      "You do not have to become a Silicon Valley engineer. You should not ignore where the work is going.",
      `I mentioned Cursor earlier. I want to be careful with it.

Cursor is an editor built around AI assistance. It became one of the fastest-growing developer tools because people whose job was already “write software” started doing that job with a model in the loop. That does not mean your first client will pay Silicon Valley rates. It means the direction of travel is not a webinar gimmick. The people who can already build are not waiting for permission.

For you, the implication is narrower. The barrier to producing working software has dropped for people who can specify, review, and ship. The barrier to running a good business has not dropped. Clients, scope, reliability, and not disappearing when something breaks — those are still on you.

If the webinar made that mix feel real, the training is how we teach the build side in order. The offer page is ${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional. I would rather you enroll because the skill is now learnable than because a tool company had a good year.`,
      "See the training that teaches the build side",
      "External market context (Cursor) as belief, attributed",
      "Phase 2 · Belief",
    ),

    email(
      18,
      "LeadThur numbers",
      "782 people paid to use LeadThur. Here are the rest of the numbers.",
      [
        "First ninety days, with the word estimated where it belongs",
        "681 active users is the line that tells you it actually worked",
      ],
      "This is method proof, not a promise that you will copy the same quarter.",
      `Yesterday I only named the pattern. Today, the first three months of **LeadThur** as we record them:

**782 people paid to use it.** 681 of those were active, not a dead list. In one week in that window, 107 new users joined. People ran **9,460 paid searches** and 2,035 trial searches before paying. Estimated revenue: **₦15,120,000**.

I want that last figure to stay honest. It is **estimated**, modelled from paid search volume and pricing. It is not an audited statement. I will not dress it up.

681 active out of 782 who paid is the useful line. People kept using it. 9,460 paid searches against 2,035 trials means they tested, then bought more. 107 in a week means it spread without a giant ad budget, which is what happens when you save someone an afternoon.

You will not automatically match this in ninety days. Markets differ. Execution differs. What this does show is one person, one narrow problem, AI-assisted, no permission from a fund, and usage that is real.

That path is what the build-and-ship modules are for. If you want them in order, with support, the offer is ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the curriculum behind this kind of build",
      "LeadThur usage proof with estimated revenue labelled",
      "Phase 3 · Proof",
    ),

    email(
      19,
      "Ten million naira project",
      "One client project. The payment was ₦10,000,000.",
      [
        "The fee followed the size of the problem, not how clever the code looked",
        "I will not decorate this with details I cannot stand behind",
      ],
      "Products are one road. Client work is the other. This is the ceiling example, not your first invoice.",
      `We delivered a software project where the **project payment was ₦10,000,000**.

I am going to leave the story there on purpose. One client. One serious business problem. One payment. I will not invent a cinematic backstory.

What a number like that teaches, if you let it, is that businesses do not pay ten million naira for a login screen. They pay when the pain is already costing more than that — time, leakage, risk. The invoice tracks the problem.

Your first job will almost certainly not look like this. Shade’s ₦650,000 ecommerce project and Chinedu’s ₦480,000 website are closer to early client-work territory, and I will tell those properly next. Both still dwarf ${WEBINAR_FOLLOWUP_OFFER_PRICE}.

The **Get-Paid Guide** is in the stack because building without scoping and pricing is how people work for free and then get bitter.

If you want the training that includes that business half, it is on the offer page.`,
      "See the training stack, including getting paid",
      "Verified large project as ceiling, not a guarantee",
      "Phase 3 · Proof",
    ),

    email(
      20,
      "Shade’s ecommerce project",
      "Shade earned ₦650,000 on one ecommerce site. Then the work continued.",
      [
        "One client, one shop, one payment — and then the app conversation",
        "You do not need an audience. You need a delivery a business is proud to use",
      ],
      "I will not collapse this into three punchy lines. The useful part is what happened around the money.",
      `Shade built an ecommerce website for a client and **earned ₦650,000** for that project. One shop that needed to sell online in a way that did not collapse into chat messages and screenshots. She delivered a site the client could actually run.

What happened next matters more than the round number. The same work opened a second conversation: **turning that website into an app.** That is how client relationships compound when the first delivery holds. You are not always hunting a stranger. You are extending something that already exists.

₦650,000 is not a promise. It is a type of job that exists in this market, at a fee many times the promotional price of the training, for someone who can make a shop look trustworthy and a checkout that works.

That is why **Making Your App Look Good** and **Making Your App Actually Work** are not decorative modules. A cheap-looking store loses sales. A checkout that fails once can lose the referral and the app job.

If you want those modules in the full order, they are on the offer. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the delivery modules on the offer",
      "Complete Shade story with context and no guarantee",
      "Phase 3 · Proof",
    ),

    email(
      21,
      "Chinedu and the return client",
      "Chinedu earned ₦480,000. Then the same client came back.",
      [
        "The second website is the review that counts",
        "Repeat work is how this becomes income instead of a lucky first job",
      ],
      "Anyone can luck into one project. A return visit means they lived with the work.",
      `**Chinedu earned ₦480,000 from one client for a website. That same client later asked for a second one.**

₦480,000 is serious money. The return is the signal I want you to sit with. First jobs happen for mixed reasons: a cousin, a hurry, a good conversation. A client who comes back has used the site on a bad-network Monday, found the annoying bit, watched how you handled a change, and still chose to pay you again.

That is also how the economics improve. The first project includes a lot of unpaid trust-building. The second starts warm. Two or three relationships like that and you are closer to income than to “hustling random quotes.”

What earns it is rarely brilliance. You said the scope, you delivered, it kept working, you replied, you did not vanish when something broke. **Making Your App Actually Work**, **Making Your App Remember Things**, and **Your Safety Net** exist for that unglamorous part. The **Get-Paid Guide** covers saying the scope out loud so you are not trapped in endless extras.

Chinedu’s outcome is not a promise. It is what repeat business looks like when the work holds. The offer is ${WEBINAR_FOLLOWUP_OFFER_PRICE} if you want that taught as a path, not as a highlight.`,
      "See how delivery is taught",
      "Complete Chinedu story: return client as the point",
      "Phase 3 · Proof",
    ),

    email(
      22,
      "eXp Realty and Lovable",
      "A large real estate firm cancelled SaaS bills and built instead",
      [
        "Lovable’s published eXp Realty story — go read it yourself",
        "Buy-versus-build is shifting. That matters even at street scale",
      ],
      "Not my client. Their published case. Useful because you can verify it.",
      `I do not want all the evidence to come from my circle. Here is one you can open yourself.

**eXp Realty** is a large US real estate organisation. On **Lovable’s own customer story**, they describe using Lovable to build custom software and **cancelling expensive SaaS contracts** they no longer needed — international sites, internal tools, replacements for per-seat tools. Those are Lovable’s published claims about eXp’s work. They are not my results, and they are not a forecast for you.

What I want you to take is the shift: for a long time, “we need a tool” defaulted to renting one forever. When teams can direct an AI builder toward the workflow they actually have, a bloated subscription starts to look optional.

At your scale that still matters. Pharmacies, schools, distributors paying for software that half-fits, plus WhatsApp for the rest. The person who can build the missing piece is selling fit and ownership, not a Silicon Valley headcount.

**Putting Your App On The Internet** is the module that makes a build reachable. **Zero-Cost Toolkit** is for keeping your own stack cheap while you learn.

Read the Lovable write-up if you like checking sources. Then look at the offer if you want the skill at this price: ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See what the programme includes",
      "Verified eXp/Lovable story, attributed, not a promise",
      "Phase 3 · Proof",
    ),

    email(
      23,
      "Ryplix and Bolt",
      "Bolt published this: about two weeks, then a reported $10k MRR jump",
      [
        "Ryplix’s rebuild as Bolt told it — speed came after clarity",
        "Monthly revenue is a different asset from a one-off invoice",
      ],
      "Attributed to Bolt’s case study. Not my client. Not your forecast.",
      `**Bolt** published a case study on **Ryplix**. According to that write-up, they rebuilt version 2.0 of a major US product (the product itself under NDA in their telling) **in two weeks**, and they report a **+$10,000 monthly recurring revenue** jump from that launch.

Those are Bolt’s published figures about Ryplix. I have not audited Ryplix’s books.

Two weeks used to be a quarter plus a team. Recurring monthly revenue is also a different shape from Shade’s one-time ecommerce fee. These examples are not stacked so you will copy both. They show that compressed timelines and monthly revenue exist in public case studies when the work is specified.

The part beginners miss: speed is usually clarity. Point a builder at a foggy brief and you get a mess quickly. **The Idea-To-Blueprint System** sits early in our order for that reason.

If you want that order with support, it is on the offer. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the build sequence on the offer",
      "Bolt/Ryplix reported figures, clearly attributed",
      "Phase 3 · Proof",
    ),

    email(
      24,
      "One-off fees versus money that repeats",
      "A single invoice feeds you. Recurring revenue changes the month after.",
      [
        "Shade’s project ended. LeadThur’s searches did not.",
        "Retainers count. You do not need a funded SaaS company.",
      ],
      "I want you to see both shapes so you do not worship one and ignore the other.",
      `Shade’s ₦650,000 was a project. When it ended, the next month started at zero until the next job or the app extension.

LeadThur’s **9,460 paid searches** from **681 active users**, with **₦15,120,000 estimated** in three months, was many small paid actions. The tool kept working whether or not anyone was on a sales call.

Ryplix, in Bolt’s telling, added about **$10,000 a month**. Monthly is the word.

You do not need to copy any of those structures on day one. You do need to stop assuming every piece of software work must die at handover. Usage-based products, small niche subscriptions, retainers for hosting and small changes after you already built the thing — those are ordinary options.

The training covers building things that survive contact with users, which is the precondition. Getting paid twice is a business choice on top.

If you want that foundation, ${WEBINAR_FOLLOWUP_OFFER_PRICE} is the promotional enrollment.`,
      "See the product and delivery modules",
      "Monetization shapes without overnight-rich claims",
      "Phase 3 · Proof",
    ),

    email(
      25,
      "Price the problem, not your hours",
      "Why ₦480,000 and ₦10,000,000 can both be fair in the same country",
      [
        "Hourly thinking punishes you for getting faster with AI",
        "Ask what the mess already costs before you say a number",
      ],
      "Two similar websites. Very different invoices. The difference is rarely “more code.”",
      `If you charge by the hour, AI just made your hours fewer. That is a poor way to get paid for a skill that is supposed to make you faster.

You are closer to selling the removal of a problem. Problems already have a price: staff time, lost sales, refunds, embarrassment. When a manual process burns hundreds of thousands of naira a month in wasted labour, a ₦650,000 build that ends it can be cheap. When the pain is smaller, the invoice should be smaller. That is why ₦480,000, ₦650,000, and ₦10,000,000 can all be fair without anyone being a thief.

Practical habits: find the current cost before you quote. Quote a scoped version one, not an open-ended “we will see.” Do not win by being the cheapest; those clients often negotiate hardest and never return. Chinedu’s second site was not a discount strategy. It was reliability.

The **Get-Paid Guide** is where we teach that conversation. It sits in the ${WEBINAR_FOLLOWUP_OFFER_PRICE} stack, not as a separate mystery product.

If pricing fear is what is stopping you, read the offer page with that module in mind, not only the build videos.`,
      "See the Get-Paid Guide on the offer",
      "Pricing education tied to named proof",
      "Phase 3 · Proof",
    ),

    email(
      26,
      "Objection — I cannot code",
      "You will see code. You do not need two years of syntax first.",
      [
        "The honest version, without “you will never look at a file”",
        "Shade and Chinedu were paid for working websites, not for a degree",
      ],
      "I will not lie to you that the work is invisible. I will tell you what you actually have to become good at.",
      `You will see code. Week one would catch me if I said otherwise.

You do not need to write loops from memory. That older apprenticeship is the part tools now cover more of. You do need to read an error, know roughly which file you are in, paste the message, say what you expected, and try again. That is weeks of comfort, not years of exams.

**The Zero-To-Builder Setup** exists because people quit at the environment, not because they failed a talent test. **Teaching AI To Build For You** is the directing craft.

Shade’s ₦650,000 site and Chinedu’s ₦480,000 site were working deliverables. They were not computer science theses.

If “I cannot code” is the sentence stopping you, the offer is the place we start from setup, not from chapter twelve of a language book. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See where the programme actually starts",
      "Coding objection answered without hype",
      "Phase 4 · Objections",
    ),

    email(
      27,
      "Objection — I am not technical",
      "\"Not technical\" is often a skipped step plus panic at the word ERROR",
      [
        "Four habits that matter more than a science background",
        "Give module one a week. Then decide with evidence.",
      ],
      "Nobody was born knowing what a folder is. The useful question is how you behave when something is red.",
      `I do not think “not technical” is a blood type. I think it is a story people tell after a bad afternoon with a tutorial.

What actually predicts progress, in my experience: you follow the steps without skipping number four. You read the error instead of closing the laptop. You can sit with not understanding something for a few days. You can ask a specific question — “I clicked save, expected the record, got this message” — instead of “it does not work.”

**Private Support Family** exists because stall time kills more programmes than difficulty does. Three days on something a person who has seen it would kill in ten minutes is an expensive tax.

If the identity is comfortable, notice that. Comfort can be expensive. A fairer test is one week of setup, done as taught, then decide. The offer is ${WEBINAR_FOLLOWUP_OFFER_PRICE}. The webinar already showed you the shape. The modules are the practice.`,
      "Test yourself in the first module",
      "Identity objection with behavioural criteria",
      "Phase 4 · Objections",
    ),

    email(
      28,
      "Objection — I do not know what to build",
      "Your first build does not have to be your first business",
      [
        "Finish something small for one person you already know",
        "The App Idea Vault is for dry weeks, not for replacing your own eyes",
      ],
      "Waiting for a brilliant original idea is how people never start. First builds are for learning the path.",
      `This is the easiest objection to work with, and people treat it like destiny.

You are often waiting for an idea big enough to justify the risk. That idea is not required. LeadThur was a narrow annoyance executed clearly, not a unique invention.

You have also mixed **first build** and **first business**. A first build can be a booking form for a salon you know, invoices for a shop in the family, attendance for a school office. Nobody has to buy it. You have to finish blueprint through a live URL so the path is no longer theoretical.

After that, you notice problems instead of hunting them. If you truly have no access to any business, the **App Idea Vault** and **Done-For-You App Template Pack** are there so a blank folder is not your excuse for a month.

Watch the webinar if you still have not. If you have, and this is the blocker, the offer includes those bonuses on purpose. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the idea bonuses on the offer",
      "Separate first build from first business",
      "Phase 4 · Objections",
    ),

    email(
      29,
      "Objection — I cannot afford tools",
      "The repeating developer quote is usually the expensive part",
      [
        "Free tiers first. Paid tools after something earns.",
        "Zero-Cost Toolkit exists because beginners reverse this and quit while bills continue",
      ],
      "Compare one professional quote for a small system with ${WEBINAR_FOLLOWUP_OFFER_PRICE}. Then remember every change is another quote.",
      `Get a quote for a modest booking system or internal tool from a competent developer. Sit that next to promotional enrollment at **${WEBINAR_FOLLOWUP_OFFER_PRICE}**. Then remember: the next change is another quote. You are not buying one site. You are renting the ability to build, indefinitely, if you never learn.

The other fear is that after you enroll you will need six subscriptions. **Zero-Cost Toolkit** is the bonus for learning, building, and showing a demo on free and cheap tiers first. Spend when revenue justifies it. Most people reverse that, pay for tools, ship nothing, and stop while the debits continue.

**The Zero-To-Builder Setup** keeps the early stack small. Templates mean you are not paying someone for a blank folder.

I will do the full ${WEBINAR_FOLLOWUP_OFFER_VALUE} stack math in the last stretch — ₦450,000 stated for training, ₦315,000 stated for bonuses, ₦40,000 fast-action only where that extra actually applies. No fake countdown in this email.

If money is the honest blocker, look at the offer as a comparison to repeating quotes, not as an impulse gadget.`,
      "See the Zero-Cost Toolkit on the offer",
      "Tool cost vs repeating developer spend",
      "Phase 4 · Objections",
    ),

    email(
      30,
      "Objection — AI is wrong, and things break",
      "The tools will be confidently wrong. Recovery is the skill.",
      [
        "Small pieces, tests, save points — not one giant prompt",
        "Clients judge your reply more than they expect perfection",
      ],
      "If you have already seen a beautiful page that dies on a real click, you learned the first lesson. The rest is method.",
      `AI will invent functions, forget a decision, and fail the way a real person uses the app. Professionals do not stop. They work small, they write down what “working” means, they click through like a suspicious customer, and they keep a last-good version.

Beginners dump the whole application into one instruction, accept everything, pile more on, then conclude the category is fake. That is a workflow problem.

**Teaching AI To Build For You**, the **Prompt Playbook**, **Making Your App Actually Work**, and **Your Safety Net** are how we teach the other workflow. Version control, backups, a practice copy versus the live copy, reading the error. Twenty minutes instead of a lost weekend.

Clients have used broken software. They remember who answered. Chinedu’s return visit sits in that category more than in “never a bug.”

If this fear is rational — it is — the offer is where recovery is taught, not where we pretend nothing fails. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the reliability modules",
      "Mistakes and breakage as method, not denial",
      "Phase 4 · Objections",
    ),

    email(
      31,
      "Objection — I cannot find clients",
      "The first client is usually unglamorous, and already nearby",
      [
        "People who know you, businesses you can walk into, a narrow sentence",
        "Chinedu’s second job came from the first. That is the cheap channel.",
      ],
      "You do not need a following. You need one specific observation and one finished piece.",
      `Internet advice assumes you have ten thousand followers. First clients usually do not arrive that way.

People who already know you: family business, church, old job, someone on your street. Trust exists. You prove capability once. Businesses you can visit: “you track deliveries by hand; I can build that.” Narrow positioning: booking and records for small clinics is easier to refer than “I build software.” Marketplaces once you have something to show — **Software Marketplace Guide**. Repeat work, like Chinedu’s second website after ₦480,000.

The **Get-Paid Guide** is the conversation: approach, scope, a number. A full roster in thirty days is not the claim. The paths are boring and available without a personal brand.

If “no clients” is the fear, look at those modules on the offer rather than waiting to feel famous. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the Get-Paid Guide",
      "Client pipeline without audience mythology",
      "Phase 4 · Objections",
    ),

    email(
      32,
      "Objection — nobody will buy from me",
      "Buyers care about a working example and a clear promise more than your fame",
      [
        "Proof beats reputation at the beginning",
        "The pharmacy on your street is not being hunted by a big agency",
      ],
      "No brand is a real feeling. It is not the same as “the market is closed.”",
      `Why would they choose you? No portfolio. No agency name.

A working thing — even an unpaid piece for a business you know — beats a biography. Two pieces is enough to start a real conversation. Shade and Chinedu were not famous. They had work that ran.

Specific beats general: if you have built clinic records, three clinic owners do not need you to be a celebrity. Process beats charm: buyers are afraid of deposits and silence. “Version one is these things, this timeline, this is how you will see progress” makes you safer than a prettier Instagram.

Nobody has to hand you ₦650,000 on day one. A small paid piece first is how bigger conversations start. That is the Chinedu pattern.

If this is the objection under the others, the programme is how you get the first working pieces and the language to sell them. ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See the full programme",
      "Credibility mechanics without fake fame",
      "Phase 4 · Objections",
    ),

    email(
      33,
      "Is ₦49,999 worth it, and do I have time",
      "Two honest questions: money and hours",
      [
        "Compare the fee to one developer quote and to another year of research mode",
        "You do not need a free month. You need a first week of setup.",
      ],
      "I will not tell you the price vanishes tonight. I will tell you what you are comparing.",
      `**Is ${WEBINAR_FOLLOWUP_OFFER_PRICE} worth it?** Compare it to one custom quote, and to twelve more months of free tutorials with nothing shipped. I cannot answer it for your household. I can say the promotional price is lower than regular ${WEBINAR_FOLLOWUP_REGULAR_PRICE}, and that one client invoice in the range we have discussed — ₦480,000, ₦650,000 — is many times the enrollment, without that being a promise you will get that invoice.

**Do I have time?** The first week is setup and one tiny thing that runs. Not ten modules in seven days. People who wait for a free month usually do not start. People who take a slightly inconvenient week often do.

If both questions are real, look at the offer page with a calculator and a calendar, not with adrenaline. If the answer is no, that is allowed. If it is not yet, name the month. If it is yes, enroll and do module one.

No fake seats. No fake midnight. The cost of another delayed year is the part I will not decorate.`,
      "Open the offer and decide with numbers",
      "Price and time objections together, no fake deadline",
      "Phase 4 · Objections",
    ),

    email(
      34,
      "Modules one to five, in human terms",
      "What the first five modules actually save you from",
      [
        "Setup, directing, blueprint, prompts, looking trustworthy",
        "Scattered YouTube is months. This is an order.",
      ],
      "Not a list of titles. What each one is for when you sit down to work.",
      `**1. The Zero-To-Builder Setup.** Workspace in order so you do not quit at five tutorials.

**2. Teaching AI To Build For You.** Specify, generate, reject, retry. The working relationship.

**3. The Idea-To-Blueprint System.** Users, flows, data, exclusion list. Why fast projects are clear projects.

**4. The Prompt Playbook.** Recurring situations so you are not inventing language every session.

**5. Making Your App Look Good.** Layout, mobile, when to stop. Shade’s ecommerce fee was not won on invisible elegance. People judge in seconds.

Stated training value across all ten modules is **₦450,000** in the stack. You pay **${WEBINAR_FOLLOWUP_OFFER_PRICE}** on promo for the whole programme including bonuses. That ₦450,000 is not cash in your account. It is what we value that ordered teaching at if you tried to assemble it yourself.

Tomorrow: the second half, where demos become software somebody will pay for twice.`,
      "See modules one to five on the offer",
      "Concrete value of early modules",
      "Phase 5 · Offer",
    ),

    email(
      35,
      "Modules six to ten",
      "The unglamorous half: working, remembering, recovering, live, stores",
      [
        "This is the difference between a demo on a call and a launch week",
        "LeadThur’s paid searches needed reliability, not only a landing page",
      ],
      "Looking like software is easy now. Surviving real users is still craft.",
      `**6. Making Your App Actually Work.** Empty states, bad input, old phones, bad networks.

**7. Making Your App Remember Things.** Customers, orders, messages — still there next month. LeadThur’s **9,460 paid searches** only happen if results keep coming back.

**8. Your Safety Net.** Versions, backups, practice versus live. Fear of shipping dies here, slowly.

**9. Putting Your App On The Internet.** A URL a client opens. Laptop software earns nothing. The ₦10,000,000 project and Shade’s site were not localhost demos.

**10. Getting Into The App Stores.** When web is enough, when native matters, what not to promise on a call. Shade turning ecommerce into an app is this conversation. Nobody controls Apple’s review times. We will not pretend to.

Ten modules in project order. That order is what random videos will not give you. The offer is ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See modules six to ten",
      "Reliability and shipping as paid difference",
      "Phase 5 · Offer",
    ),

    email(
      36,
      "Bonuses that stop people quitting",
      "Templates, ideas, and humans — the three ways programmes die",
      [
        "Stuck, blank, or alone",
        "Modules teach. These keep you in the room.",
      ],
      "People rarely quit because the PDF was too hard. They quit stalled.",
      `**Done-For-You App Template Pack.** Start from something that runs. Customising at 10pm is a job. Staring at an empty folder is how enthusiasm ends.

**App Idea Vault.** Practice starting points when your own list is dry. Study what a narrow product looks like. LeadThur was one repeating pain, done faster than a human.

**Private Support Family.** Stall tax. Also the sight of other people’s messy first builds, so you stop thinking you are uniquely unsuited.

These do not replace the ten modules. They keep you present long enough for the modules to work. Stated bonus value across all eight bonuses is **₦315,000** in the stack. Again: not cash. A valuation of the extras.

Full promo enrollment remains **${WEBINAR_FOLLOWUP_OFFER_PRICE}**.`,
      "See the bonuses listed on the offer",
      "Quit-point bonuses explained",
      "Phase 5 · Offer",
    ),

    email(
      37,
      "Bonuses that connect building to money",
      "Get paid, stay cheap, get found",
      [
        "Get-Paid Guide, Zero-Cost Toolkit, Software Marketplace Guide",
        "Skill without a path to an invoice is an expensive hobby",
      ],
      "Building privately is safe. It is also invisible.",
      `**Get-Paid Guide.** Approach, scope version one, say a number, handle changes, payment terms. Shade’s ₦650,000 and Chinedu’s ₦480,000 sat inside conversations that ended in an agreement.

**Zero-Cost Toolkit.** Learn and demo without six subscriptions first.

**Software Marketplace Guide.** How directories work, what buyers scan for. A product still has to be found and understood in a sentence.

Together they answer “who pays me?” without mysticism: someone with a problem, a budget, and a reason to trust you.

**Lifetime Access + Free Updates** is the duration bonus: tools move; access is not a snapshot of one month. **Organic And Paid Ad Formula** is for later, when the constraint is attention, not “can I build.” You do not need ads in week one.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional. ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular.`,
      "See the money-side bonuses",
      "Monetization bonuses plus lifetime/ads without fake scarcity",
      "Phase 5 · Offer",
    ),

    email(
      38,
      "The stack in numbers, explained",
      "₦49,999, ₦100,000 regular, ₦805,000 stated — what those figures mean",
      [
        "₦450,000 training + ₦315,000 bonuses + ₦40,000 fast-action where it applies",
        "Stated value is not a bank transfer. Compare it to quotes and to another lost year.",
      ],
      "Inflated stacks are why people distrust this industry. I will label ours.",
      `Three figures, plainly.

**${WEBINAR_FOLLOWUP_OFFER_PRICE}** is what you pay today on promotional pricing.

**${WEBINAR_FOLLOWUP_REGULAR_PRICE}** is the regular price of the same modules and bonuses.

**${WEBINAR_FOLLOWUP_OFFER_VALUE}** is stated stack value: **₦450,000** for the ten modules, **₦315,000** for the eight bonuses, and **₦40,000** fast-action value only where that extra actually applies. It is not ₦805,000 cash. It is what we say it would cost to assemble the pieces separately, in an order you would have to guess at.

I am not running a fake countdown in this email. Fast-action is not “two hours left” unless a real system is counting, and I will not invent seats.

Useful comparisons remain a developer quote, one client invoice in the ranges I have shown as examples, and another year of research mode. If those comparisons make enrollment obvious, the offer page is the checkout. If not, do not buy from guilt.`,
      "Compare the stack on the offer page",
      "Transparent value math, no fake deadline",
      "Phase 5 · Offer",
    ),

    email(
      39,
      "Paying developers forever versus learning once",
      "The quote is not one payment. It is a relationship you keep renting.",
      [
        "Every new idea returns to someone else's calendar",
        "₦49,999 against that pattern, without pretending quotes will vanish from the earth",
      ],
      "You may still hire specialists. The question is whether you must hire them for every thought.",
      `Professional engineers should keep their work. Depending on a quote for every booking page, every internal list, every “can we add this field” is still a slow way to live if you have already decided you want to build.

Enrollment at **${WEBINAR_FOLLOWUP_OFFER_PRICE}** is a one-time promotional price for a skill you can reuse. A developer relationship is ongoing by nature. Both can be rational. They are not the same purchase.

If you keep postponing, the quotes do not freeze. Other people in this same funnel will have watched the webinar, gone through setup, and taken a first client conversation. That is not a threat. It is arithmetic.

If you want the skill, the offer is the place. If you want to keep hiring, that is a valid business. I would rather you pick on purpose.`,
      "Enroll if you want the skill in-house",
      "Opportunity cost versus repeating quotes, no fake seats",
      "Phase 5 · Offer",
    ),

    email(
      40,
      "Last email: yes, no, or not yet",
      "I will not invent a countdown. I will ask you to choose.",
      [
        "Same proof. Same price. One first action if the answer is yes.",
        "Not yet only counts if you name the condition.",
      ],
      "Thank you for reading this far. Attention is scarce. I will not spend the last note on a trick.",
      `This is the last email in this sequence.

I showed you LeadThur: **782 people paid to use it**, 681 active, 9,460 paid searches, **₦15,120,000 estimated** in ninety days. A ₦10,000,000 client project. Shade at ₦650,000 plus the app conversation. Chinedu at ₦480,000 plus a return. Lovable’s eXp Realty story. Bolt’s Ryplix write-up, including the reported $10k MRR. Harry Roper of Imaginary Space, in a No Code MBA interview, reporting about **$100,000 a month** using Lovable — his reported figure, not my audit.

What PromptEarn is **not** proof of: this method.

**How To Build Software With AI And Get Paid For It**: ten modules, eight bonuses, **${WEBINAR_FOLLOWUP_OFFER_PRICE}** promo, **${WEBINAR_FOLLOWUP_REGULAR_PRICE}** regular, **${WEBINAR_FOLLOWUP_OFFER_VALUE}** stated stack.

**Yes.** Enroll. This week: finish setup. Not all ten modules.

**No.** Unsubscribe if these notes are noise. Go be good at what you actually want.

**Not yet.** Write the condition: money, month, or a specific thing that has to change. Without a condition, “not yet” is just “no” with better manners.

If it is yes, the offer is the page.`,
      "Enroll and start with setup",
      "Honest close, no fake scarcity",
      "Phase 5 · Offer",
    ),
  ];

  return assertValidWebinarSequence(emails);
}
