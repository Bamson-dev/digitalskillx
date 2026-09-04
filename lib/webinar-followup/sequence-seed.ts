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
      "I know you registered. I just want to talk to you like a person.",
      [
        "The WebinarJam reminders are done. This one is different.",
        "If you registered and then life got in the way, read this.",
      ],
      "This isn't another reminder. This is me, picking up where those left off.",
      `You registered for the Build Software With AI webinar.

Maybe you watched the whole thing from start to finish. Maybe you opened it, watched 20 minutes, got a phone call, and never went back. Maybe the tab has been sitting there for days and you keep meaning to get to it. I'm not going to shame you for any of that, because I've done the exact same thing to courses I actually paid for.

But here's what I keep thinking about when I look at this list.

You didn't register by accident. Something made you stop scrolling that day, read the headline, and put your email in that box. That means something clicked, even briefly. Maybe it was the idea of finally building that app you've been thinking about without paying a developer millions. Maybe it was seeing the LeadThur numbers and thinking, wait, someone actually built a software product without a team and made that kind of money from it. Maybe you have an idea that's been sitting in your WhatsApp notes for six months and it's starting to bother you that it's still just a note.

Whatever made you register, that reason hasn't gone anywhere. It's still there.

So here's what I'm asking, and I want to be straightforward with you: I'm not asking for money today. I'm not even asking for a big decision. I'm asking you to go back to the webinar recording and watch it properly this time. Not while you're cooking or driving. Quiet room, phone face down, notepad nearby. Give it a real sitting.

If you watch the whole thing and decide this isn't the path for you, that is completely fine. At least you'll have decided with the full picture instead of half an impression from a tab you didn't finish.

The recording is still open. It will not stay that way forever.`,
      "Watch the webinar properly",
      "Natural continuation after WebinarJam, no payment ask",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      2,
      "Waiting for the right time",
      "You're waiting for a calmer month. I need to tell you something about that.",
      [
        "The \"right time\" to start something new almost never arrives on its own.",
        "Every person who built something real started when their life was also busy.",
      ],
      "The calendar never opens a clean window labelled \"learn this now.\"",
      `I've had this exact conversation with more people than I can count.

They register for the webinar. They're genuinely excited. They can see the opportunity clearly. And then they say: "I just need to get through this month first." The shop is busy right now. School fees are coming and I need to focus. There's one more client job I need to finish before I can really commit to learning something new. It's almost the end of the year and next year makes more sense for starting fresh.

And I listen, and I understand, and I think to myself: I know exactly how this story ends.

Another month passes. Nothing changes. The same app idea is still sitting in the same WhatsApp note from six months ago. The same businesses around them are still paying someone else for a website or a system that they needed last year. And they're now telling themselves next month again.

Here's the thing I want you to sit with for a moment, and I'm saying this not to be harsh but because I think you deserve honesty instead of another gentle nudge.

Every week you don't build this skill is a week the businesses around you are paying someone else. Every month you wait is another month of developer quotes, delays, and half-finished ideas that never made it to a real URL. The opportunity doesn't pause and wait politely for your schedule to clear. It just keeps moving, and so does everyone else who decided to start when their life was also imperfect.

I'm not saying abandon everything for a course. I'm saying a slightly inconvenient week now is worth more than a perfect month that never actually arrives.

People who say they'll start when they're ready have been saying that for two years. People who started when they were busy are already building things and getting paid for them.

The webinar is where this begins. Not a payment. Not a big commitment. Just a proper hour of your attention when you have a stretch that's good enough, not perfect.

Watch it this week. Not when things settle.`,
      "I'll watch it this week",
      "Cost of waiting as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      3,
      "Ideas without a way to build",
      "That app idea in your notes. The one you keep moving to a different note.",
      [
        "The gap between \"I can describe this\" and \"someone can use it\" is exactly what I teach.",
        "Your idea has been in your head long enough. Here's what's actually between you and building it.",
      ],
      "Open your phone notes right now. I'll wait.",
      `Open your phone notes right now.

I'm willing to bet there's at least one thing in there that would genuinely help a real business. A booking page for a salon that's been managing appointments in a WhatsApp group for three years and losing customers because of it. A simple stock tracking system for a shop owner who's been using a notebook since before smartphones existed. A way for a school or a church to collect registration fees without chasing fifty people for individual transfer screenshots and then wondering if someone paid or not.

These ideas are not rare. They're everywhere around us. You probably have two or three of them without even trying.

The rare thing, the thing that actually separates people who build from people who just have ideas, is the stretch between "I can describe this clearly to someone" and "a real person can open this on their phone right now and use it."

For years, crossing that stretch meant finding a developer, trying to explain your idea to someone who doesn't fully understand your business or your customers, waiting days for a quote that made your chest tight, and then either abandoning the idea completely or paying the money and waiting months and being disappointed by something that barely worked the way you described. Most people abandon. They put a new note in. They abandon that one too. It's a slow and quiet way to watch years go by with nothing built.

What I teach in the webinar is how to cross that stretch yourself. Not by becoming a developer, not by spending three years learning to code from scratch, but by learning to direct AI tools to build what you can clearly describe. The same way a director tells a film crew exactly what they want without picking up a camera themselves.

I want you to watch the webinar with one specific idea in mind. The one that's been bothering you the longest. Pause when I talk about turning ideas into blueprints. Write down who the first person to use it would actually be, and what version one must absolutely refuse to include so you don't build forever.

You don't need to decide anything after that. Just let yourself see what's actually possible.`,
      "Watch with my idea in mind",
      "Idea-to-execution gap as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      4,
      "What actually changed with AI builders",
      "I'm going to tell you the honest version of what AI actually changed. Not the hype.",
      [
        "The internet has oversold this badly. Here's what really happened.",
        "Before you decide whether this is for you, read this version of the story.",
      ],
      "If someone sold you the \"one prompt and you have an app\" version, they lied to you.",
      `I want to be careful here because the internet has already made a serious mess of this conversation and I don't want to add to it.

If you spend ten minutes on Twitter or YouTube right now, you'll find dozens of people claiming that AI can build entire apps from a single sentence, that developers are finished, that anyone can become a software founder with no experience in a weekend. Some of them have screenshots. Some of them have testimonials. Some of them are making money selling that version of the story.

That version is exaggerated at best and dishonest at worst. And if you've already tried to build something yourself based on that story and it went badly wrong and left you more confused than when you started, I understand completely why you'd be skeptical about anything in this space.

So here's what I believe actually changed, and I want to be precise about it.

Five years ago, if you were not a developer, "I'll just build the app myself" was mostly a joke you made at parties. You could spend six honest months on YouTube learning the basics and still be nowhere near something a stranger would pay money to use. Custom software meant a team, or a long apprenticeship learning to code, or both. That was simply the reality.

What changed is that a large portion of the technical writing, the actual code that makes things work, can now be produced by AI tools if you know how to describe what you want clearly, check whether what came back is actually correct, and keep going with patience when the first version isn't right. Professional developers are already working this way. They write less code by hand now and spend more time directing tools. That's not a trend. Cursor, the AI coding tool, grew faster than almost any developer tool in recent history because people who already knew how to build started using it to work faster and produce more.

What that same approach looks like for someone who doesn't already live in code is genuinely different. It's harder to pick up than a 30-second clip makes it look. The setup is real work. Judgment about what to build first matters enormously. Getting things live on the internet has real steps. But it is learnable in weeks rather than years if someone shows you the right sequence in the right order, which is what I spent years figuring out and what the webinar teaches.

Watch it once and decide for yourself. Not based on the hype. Based on what you actually see.`,
      "See the real workflow",
      "Market shift explained as a reason to watch, not to pay",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      5,
      "Directing tools versus studying code for years",
      "My friend paid a developer seven million naira. I want to tell you what happened.",
      [
        "The developer wasn't the problem. Depending on someone else's calendar for every idea is the problem.",
        "Seven million naira, six months of waiting, and a product that barely worked. This is why I teach this.",
      ],
      "The money was gone. The idea was still sitting in his head unfinished.",
      `A friend of mine had an app idea a few years ago. A real one, something businesses actually needed, not a fantasy. He did everything right. He found a developer through a trusted referral. He sat down and explained the whole idea. He signed an agreement. He paid the first deposit.

Seven million naira total by the time it was done.

The delays started after the first month. "Almost ready, just a few more things." Then another month. Then another excuse. Then a version that came back with half the features he asked for missing and a UI that looked like something built in 2012. When he asked for changes, the queue started again. When he tried to negotiate, the developer went quiet for days at a time.

By the time it was over, the money was gone, the product was nowhere near what he described, and the idea, the real one he started with, was still sitting unfinished in his head where it started.

That story bothers me more every time I think about it. Not because the developer was a criminal. Because my friend had no choice but to sit there and depend on someone else's calendar, someone else's priorities, someone else's interpretation of what he meant, for every single step of building something that was his idea.

That's the real cost of not being able to build. Not just the money. The time. The lost control. The version of your idea that comes back looking nothing like what you described.

When I learned to build software with AI, the first thing I felt was not excitement. It was relief. The relief of knowing that I never had to sit in that position again. That I could take an idea from my head and direct it into something real without asking permission from someone else's schedule.

That's what the webinar is about. Watch it and see whether that relief is available to you too.`,
      "Watch the webinar",
      "Directing vs years of syntax as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      6,
      "Building for clients",
      "You don't need a startup idea. You need one business with one painful problem.",
      [
        "The businesses on your street are already paying for the software they need. Just not to you.",
        "Client work is usually where the first real money shows up. Here's why.",
      ],
      "If you know businesses still running on WhatsApp and notebooks, you already understand the demand.",
      `Let me tell you something that might change how you're thinking about this.

Not everyone who learns to build software with AI needs to launch a product. Not everyone needs a startup idea or a pitch deck or a plan for a million users. Some of the best early money from this skill comes from a much simpler place: finding one business with one embarrassing problem and building the thing that fixes it.

In Nigeria, and in most places, there are businesses around you right now doing something manually that should have been automated years ago. A salon managing all its appointments in a WhatsApp group and losing bookings every week because messages get buried. A pharmacy tracking stock in a notebook and running out of things without warning. A small school chasing thirty parents individually every term for school fees and never knowing who has paid and who hasn't. A logistics company tracking deliveries in a shared spreadsheet that three people are editing at the same time and nobody trusts the numbers.

These people already know they have a problem. They're already paying for it every day in wasted hours, missed sales, and the headache of managing things that should run themselves. They don't need to be convinced that the problem is real. They're living with it.

You are not inventing a market when you walk into that conversation. You are walking into a problem that already exists, already costs money, and currently has no good solution. The person who can build something that actually fixes it on a phone, in plain language, without a six-month wait and a million-naira quote, is someone those businesses would pay. Gladly.

This is the path Shade took. A client needed an ecommerce site. Shade built it with AI tools, delivered it, and got paid N650,000. That same client came back asking for more work. That's not a miracle. That's solving a real problem for a real business and doing it well enough that they trust you again.

Watch the webinar with this angle in mind. I spend real time on what client work looks like, how to find the first conversation, and what it takes to deliver something a business owner will actually use.`,
      "Watch the client work section",
      "Client opportunity as a distinct reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      7,
      "Building your own product",
      "LeadThur made N15 million in its first three months. Let me tell you how it started.",
      [
        "The product that earns while you sleep starts as a narrow annoyance, not a billion-naira idea.",
        "I built something people pay for every month without a development team. Here's what the beginning looked like.",
      ],
      "It wasn't a grand vision. It was one repeating problem, done faster than a human could.",
      `I want to tell you about a different kind of opportunity than client work, because they're genuinely different and I don't want you to mix them up in your head.

Client work is where you build something for a specific business or person and get paid for that project. It's real money and it's often the fastest first income from this skill. But there's another road, and it has a different quality to it.

A product is something you build once and then many different people pay to use it, often repeatedly, without you having to sit in their office or manage their project. The income is different. It's less predictable at the start and more stable later. And the useful products, the ones that actually sell, are almost never the big ambitious ones people plan for years without building.

LeadThur was not a grand vision I had for years. It was a narrow, specific annoyance that I knew businesses had. Finding business contacts from Google Maps was slow, manual work that cost people hours they didn't have. I built a tool that does it in about a minute. One repeating task. One painful problem. A price that made sense compared to the time it saved.

In the first three months, N15,120,000 went through that platform. 782 people paid to use it. 9,460 paid searches by paying users.

I'm not telling you this to impress you. I'm telling you because the beginning looked nothing like what those numbers suggest. It started with one narrow idea that I could describe in a single sentence. "Find business contacts faster than a human can by hand." That's it. That was the whole product.

The webinar explains the product path properly: what narrow means, what version one should and shouldn't include, and why starting with a huge ambitious idea almost always ends in building nothing at all.

If you've been dreaming about "my app" for years without building it yet, watch the session with your ears open for the part about how small version one is supposed to be. It might be the most useful hour you spend on this whether you ever buy the training or not.`,
      "See how the product path works",
      "Own-product opportunity as a reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      8,
      "Businesses still need software",
      "Walk through any market in Nigeria and count the notebooks. I'll wait.",
      [
        "The demand for what you could build is sitting in plain sight. Most people walk past it every day.",
        "WhatsApp groups, shared spreadsheets, and half-working global tools. That's the brief.",
      ],
      "You don't need to invent a new category. You need to notice work being done badly.",
      `I want you to try something the next time you're out.

Walk through a market, a plaza, a school office, a pharmacy, a church administrative block, a small hospital reception. And just count things. Count how many operations are living in a WhatsApp group that was never designed for business management. Count how many records are in a notebook that no one can search. Count how many "who paid" conversations happen manually every single week because there's no system. Count how many people are using a global software tool that costs too much, has too many features they'll never use, and still can't do the specific thing they actually need it to do.

That's not a technology trend. That's not a Lagos problem. That's how a significant portion of real organisations in Nigeria and across Africa actually operate right now. And every single one of those operations is paying a cost for that reality, whether they've put a number on it or not. Lost orders. Wasted staff hours. Customers who left because the process was too frustrating. Money that should have been tracked and wasn't.

They're also paying for software that almost fits. Tools designed for American or European businesses that don't handle naira properly, that require cards most customers don't have, that are built for twenty employees when you have three.

The person who can build the piece that's actually missing, for the actual price that makes sense, for the actual phone that the customer is holding, is offering something those businesses already understand they need. You're not educating them about a new problem. You're solving one they've been living with.

This is the market. It's not glamorous. It doesn't make for a Twitter announcement. But it is real, it's large, it's close enough to walk to, and it's currently being served poorly.

Watch the webinar with your own neighbourhood in mind. Then decide whether this skill is for you.`,
      "Watch with your street in mind",
      "Local demand as the reason to return to the webinar",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      9,
      "Depending on developers for every idea",
      "Every time you want to change one thing, you're back in the queue. That's the real cost.",
      [
        "It's not the developer. It's needing one for every thought you have.",
        "The developer dependency tax: quotes, waiting, and one extra field that puts you back at the start.",
      ],
      "Good developers earn every naira they charge. Living on their calendar is the expensive part.",
      `If you've ever tried to get a custom site or a small system built by a developer, you already know this story from the inside.

You explain the idea as clearly as you can. You wait for the quote. The number comes back higher than you hoped, so you negotiate or you freeze. If you decide to go ahead, you pay the deposit and wait. Weeks pass. Updates come back that are close but not quite right. You ask for a change. You're back in the queue. Then you want one more thing, a different button, a mobile view that doesn't cut off the text, one extra field in the form. Back in the queue again. If the person goes quiet for a week, the entire project goes quiet with them. If they move on to another client, you find out when they stop responding.

I want to be clear that this is not about developers being bad people. A competent developer is expensive because the work is genuinely hard and the skill took years to build. That's fair. The tax is not the cost. The tax is living in a state where you cannot move a single idea forward without someone else's calendar, someone else's priorities, and someone else's interpretation of what you meant.

For a business owner who wants to build tools, that tax repeats every time a new idea arrives. For someone who wants to build for clients, it's the same tax wearing a different shirt, because every change their client wants also goes through that queue.

The webinar is partly about reducing that dependency. Not eliminating collaboration with professionals, because there are times when you need that. But building the ability to produce working software yourself, or at least a version one you can show, test, and iterate on without being stuck waiting on someone else.

If you've got a developer quote sitting somewhere that made you close the tab, watch the webinar with that number in mind. Compare waiting to being able to try.`,
      "Watch before the next quote arrives",
      "Developer dependency as the reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      10,
      "What the webinar actually covers",
      "Ten emails in. I think it's time I tell you plainly what the webinar actually covers.",
      [
        "You asked for a summary. Here's the map. The recording is still the thing itself.",
        "If you've been waiting to feel ready to watch, this is the most practical time to do it.",
      ],
      "After this email, I'm going to start talking about the offer. So this is the last push for the webinar.",
      `People ask me to summarise the webinar in an email so they can decide whether to watch it. I understand the instinct. But I want to be honest about something: I can give you the outline. I cannot give you the demonstration, and the demonstration is most of the value. Watching me direct an AI tool to build a working feature in real time is something that a paragraph cannot replace.

But here's the outline, since you asked.

You'll see how to take a messy, half-formed idea and turn it into something specific enough to actually build. You'll see what it looks like to work with AI as a builder and a director rather than as someone arguing with a chatbot. You'll see why looking professional matters enormously for getting clients to trust you with their money. You'll see the difference between "it works on my laptop" and software that real people can use on their real phones with their real internet connection. You'll see how data is supposed to persist so your app actually remembers things. You'll see what you do when something breaks, which it will, because it always does. And you'll see what it takes to put a finished product somewhere that a client can actually open and use.

I haven't asked you to pay in any of the first ten emails. I've only asked you to watch. If you still haven't sat through the session properly, this is honestly the best time to do it, because starting from the next email, I'm going to talk more directly about the training, the offer, and what it actually costs. Those emails make more sense if you've already seen what I taught.

Give it a proper sitting. Phone on silent. Notepad close. If you decide afterward that this is not the path for you, at least you'll have decided with real information instead of a half impression.`,
      "Watch it properly before the next email",
      "Detailed recap as the tenth distinct reason to watch",
      "Phase 1 · Webinar re-engagement",
    ),

    email(
      11,
      "From webinar to the training path",
      "If you watched the webinar, I want to tell you what comes after it.",
      [
        "The programme behind the webinar, explained in plain language.",
        "From the free training to the full path. Here's what the offer actually is.",
      ],
      "From here I'll talk about the offer more directly. But I'll still be straight with you.",
      `If you watched the webinar, you already have the picture. You've seen what the work looks like, what the method is, and whether the people teaching it have actually done it themselves.

The full programme is called How To Build Software With AI And Get Paid For It. It's the ordered version of everything the webinar introduced. Setup. Directing AI to build for you. Turning a rough idea into a blueprint that can actually be built. Prompts that don't waste a week of your time. Making your app look professional. Making it actually work the way it's supposed to. Storing data properly. Recovering from mistakes without losing everything. Putting your product live on the internet. And navigating app stores when that question arrives, which it will if you take this seriously.

I run other businesses. PromptEarn is one of them, with more than N800,000,000 in transactions and more than 20 cars given out to top performers. I mention that because people ask, not because PromptEarn is proof that this AI building method works. Those are different businesses with different origins and I will keep those lines separate throughout this sequence.

The offer page is ${WEBINAR_FOLLOWUP_OFFER_PRICE} while promotional pricing is running. Regular price is ${WEBINAR_FOLLOWUP_REGULAR_PRICE}. I'll walk you through the full value stack in detail over the next several emails, module by module, without inflating it or treating it like money in your account.

If you haven't watched the webinar yet, that's still the better first step. If you have, the offer page is where the full details live.`,
      "See the full training",
      "Transition from webinar to offer without a hard cut",
      "Phase 2 · Belief",
    ),

    email(
      12,
      "Setup and the first week",
      "Most people don't quit because the content was too hard. They quit at a broken setup.",
      [
        "Why the first module exists, and what it actually saves you from.",
        "Five conflicting tutorials, a broken environment, and a quiet decision that you're just not technical.",
      ],
      "If you've ever opened a tab, tried to follow instructions, and closed the laptop in defeat, this is for you.",
      `Let me tell you something that I've watched happen more times than I can count.

Someone registers for a programme. They're motivated. They sit down on day one ready to start. They open the first tutorial, and it tells them to install something. The instructions are slightly different from what's on their screen. They find another tutorial. That one has different steps. They try a third. Three different versions of the same setup and none of them match exactly what they're looking at.

An hour later, nothing is working. They close the laptop. They tell themselves they'll come back to it tomorrow. Tomorrow becomes next week. Next week becomes never. And they quietly conclude that they must not be technical enough for this, when the actual problem was that nobody gave them a single clear path from start to working, in the right order, without assuming things they didn't know yet.

That's exactly what the first module, The Zero-To-Builder Setup, is designed to prevent.

It's not glamorous. It's not the exciting part where you start building things. But it is the module that determines whether you quit in the first week or make it to the part where the skill starts to click. We walk through the workspace setup in a single clear sequence: which tools, which accounts, which folders, which defaults to change. You want a baseline that actually runs, not a philosophy about which editor is theoretically best.

The second module, Teaching AI To Build For You, is where the real working relationship begins. How to specify what you want clearly. How to check what comes back. How to recognise when the output looks right but will break on a real click. How to give AI the kind of instructions that produce working software instead of confident nonsense.

The promotional price for the full programme is ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See how the first modules work",
      "Education on setup to make the offer feel like a path",
      "Phase 2 · Belief",
    ),

    email(
      13,
      "Idea to blueprint",
      "The reason most AI-built projects fail has nothing to do with AI. Here's what it actually is.",
      [
        "Vague instructions produce vague software. Module 3 fixes the brief before you write a prompt.",
        "Fast projects are clear projects. Here's what that means in practice.",
      ],
      "\"Build me an app for my business\" is not an instruction. It's a wish.",
      `There's a pattern I see with people who try to build software with AI and give up frustrated.

They start with an idea that feels clear in their head. They type it into the AI tool. Something comes back. It's not quite right. They try to fix it by adding more instructions. Now it's more confused. They try again from scratch. Three hours later they have something that looks like a website and works like nothing, and they've concluded that the whole thing is overhyped.

The problem is almost never the AI. The problem is the instruction.

"Build me an app for my business" is not specific enough to build anything real. It's a wish. A real instruction sounds like this: "Build a booking form for a Lagos salon. It shows available time slots grouped by day. When a customer books a slot, it sends them a WhatsApp confirmation with the date, time, and stylist name. The form should work on mobile only. Version one does not include payment processing." That instruction has a user, a function, a specific output, a platform, and a list of things version one deliberately excludes so the project doesn't grow forever before it's done.

That's what module three, The Idea-To-Blueprint System, teaches. How to take any idea, even a rough and messy one, and turn it into something specific enough that AI tools can actually help you build it. Who is the user. What is the one job version one does. What does it absolutely refuse to include in the first version. Those constraints are not limitations. They are the thing that makes it possible to finish something.

Module four, The Prompt Playbook, builds on that. Recurring situations produce recurring language. What to say when you're starting a new feature. What to say when the output is wrong but you don't know exactly why. What to say when something worked yesterday and broke today. You stop inventing instructions from nothing every session and start using language that actually works.

Promotional price: ${WEBINAR_FOLLOWUP_OFFER_PRICE}.`,
      "See modules 3 and 4",
      "Blueprint education connecting to the offer",
      "Phase 2 · Belief",
    ),

    email(
      14,
      "Prompt playbook as a craft",
      "Shade charged N650,000 for an ecommerce site. The client opened it on a phone and trusted it in three seconds.",
      [
        "People judge software before they use it. Module 5 is why that matters more than you think.",
        "The N650K fee wasn't won on elegant code. It was won on trust at first glance.",
      ],
      "You have about three seconds before someone decides whether they trust what you built.",
      `Shade is a student from this programme.

When a client asked her to build an ecommerce website for their business, Shade built it using AI tools, following the same workflow taught in this training. The client paid N650,000. That same client later came back and asked Shade to turn the website into a full mobile app. I told Shade to charge N1,500,000 for that job.

I want to tell you something specific about how that first N650,000 was earned, because it wasn't won because the code was elegant or because the database schema was perfectly structured or because Shade had ten years of design experience.

It was won because when the business owner opened the site on their phone, it looked like something they would trust with their customers' money. The layout was clean. The text was readable. The buttons were easy to press. It worked the way a real website is supposed to work. The client made a judgment in about three seconds, and the judgment was: this is professional enough.

That's what module five, Making Your App Look Good, is about. Not design as a creative art form. Design as trust. Layout, mobile sizing, spacing, readable text, buttons that are big enough to press with a thumb on a busy street. Knowing when to stop adding things and just let the product breathe. These are learnable decisions, not innate talent, and they're the difference between something a client opens and immediately trusts versus something they open and immediately doubt.

Shade's N650K didn't come from being technically brilliant. It came from building something that looked and worked the way a professional product should. You can learn that. The module teaches it.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See how module 5 is taught",
      "Educational email on instruction quality",
      "Phase 2 · Belief",
    ),

    email(
      15,
      "Software hiding in ordinary businesses",
      "The app that works perfectly on your laptop and dies on a client's phone. You've seen this happen.",
      [
        "Module 6 is the difference between a demo that impressed someone and software they actually use.",
        "What \"it works\" means on your machine versus what it means on a customer's real phone.",
      ],
      "A client who uses your software on a real day is not the same as you testing it at home.",
      `There's a version of failure that looks like success right up until it isn't.

You build something. You test it. Everything works. You show it on a call and the client is impressed. They're excited. They sign off. They start using it with real staff on real phones at real times of day.

And then the first complaint comes. Something's wrong. You check it on your laptop and it looks fine. You check it on your phone and it looks fine. You ask them to send a screenshot and you finally understand: they're using an older phone with a smaller screen, on a 2G connection at peak hours, and they're entering data in a way you never thought to test for.

What you built was a demo. What they needed was software.

The difference between those two things is what module six, Making Your App Actually Work, is about. Empty states: what happens when the page loads but there's no data yet. Bad input: what happens when someone enters nothing, or the wrong thing, or something you didn't expect. Old phones: what happens when the screen is 5.4 inches instead of 6.7. Weak networks: what happens when the connection drops mid-submission.

These are not advanced problems. They're the basic conditions of real use in Nigeria, and they're what separate something that works in your office from something that works in a client's shop at 8am on a Monday when three people are trying to use it at once.

Chinedu's client came back for a second website. That's not because Chinedu's first website was perfect. It's because Chinedu answered when something went wrong and fixed it, and the client learned they could trust him. That reliability is built in this module.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the reliability modules",
      "Local observation as belief-building",
      "Phase 2 · Belief",
    ),

    email(
      16,
      "Two roads, ninety days",
      "Software that forgets everything when you close the tab is a very expensive demo.",
      [
        "Module 7 is the difference between something people try once and something they pay for every month.",
        "LeadThur has 9,460 paid searches. That only means something if the results come back every time.",
      ],
      "Your app needs to remember things. Here's why that step changes everything.",
      `Here's a question I want you to think about.

Imagine you build a salon booking system. A client opens it. They book an appointment for Thursday at 3pm. They close the app. They come back on Wednesday to check the time.

The booking is gone.

The app forgot it the moment they closed the session. Because nobody connected it to a database. Because that's the step that most people who learn to build from YouTube tutorials skip, not because they're lazy but because it's the step that feels the most technical and the tutorials often assume you already know how it works.

Without a real database, you don't have software. You have a form that disappears. And a form that disappears is something people try once, tell their friends doesn't work, and never open again.

Module seven, Making Your App Remember Things, is the database question. Where does the data actually live. How does it get there when someone fills in a form or makes a booking or places an order. How does it come back the next time they open the app. How do you make sure it doesn't disappear, doesn't get corrupted, and doesn't slow down as the amount of information grows.

This is what makes LeadThur a product people pay for every month. Those 9,460 paid searches only mean something because the results are still there the next time someone logs in. That's database. That's persistence. That's the thing that turns a demo into something with real recurring value.

The module walks through this setup in a clear sequence. You don't need to understand database theory. You need to understand enough to connect your app to a real data store and trust that what goes in will come back out.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the offer",
      "Reduce overwhelm; connect to offer",
      "Phase 2 · Belief",
    ),

    email(
      17,
      "Cursor and the professional default",
      "The mistake that costs you a weekend versus the one that costs you a client. Here's the difference.",
      [
        "Module 8 is how you build without the fear of breaking everything with one wrong click.",
        "Save points, backups, and a practice copy. The things nobody teaches until you need them desperately.",
      ],
      "Version control sounds technical. What it actually is is a save game button for your software.",
      `Let me tell you what happens to most people who build without version control at some point in their learning.

They're working on a project. Things are going well. They make a change, something that seems small and sensible, and suddenly nothing works. The page won't load. The data isn't showing. The button that worked yesterday isn't responding today. They try to undo it but the undo button only goes back so far and they've made twenty changes since the last one that worked.

They spend a weekend trying to rebuild from memory what they had before. Some of it comes back. Some of it doesn't. A few things that were working before are now slightly broken and they can't figure out why. They submit the project to the client with less confidence than they had before, and they carry a quiet fear into every change they make going forward.

That experience doesn't mean they're not good enough. It means nobody taught them to save their progress properly before it mattered.

Module eight, Your Safety Net, is about version control. In plain terms: how to mark a working state of your project so that if everything breaks later, you can get back to the working version in ten minutes. How to work on a test copy so your live product doesn't go down while you experiment. How to look at what changed between two versions so you can find the exact line that broke something.

Once this is in place, shipping stops feeling dangerous. You're not gambling everything on every change. You can try things, break things, and get back to working with confidence. That's what makes fast, iterative building possible, and fast building is what lets you take on more client work and deliver it sooner.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See module 8",
      "External market context (Cursor) as belief, attributed",
      "Phase 2 · Belief",
    ),

    email(
      18,
      "LeadThur numbers",
      "Software that lives on your laptop earns nothing. Here's how to put it where people can actually use it.",
      [
        "\"It works on my machine\" is not a delivery. Module 9 is how you get to a real URL.",
        "The N10 million project and Shade's N650K site were not localhost demos. Here's what that means.",
      ],
      "A link someone can bookmark on their phone. That's what you're building toward.",
      `Everything we've built up to this point in the training has been working toward one moment: the moment when you can send someone a link and they can open it on their phone, anywhere, at any time, without you being present.

Not a screenshare. Not a demo on your laptop while you explain it. A link. A real URL. Something they can bookmark and come back to and recommend to someone else.

The N10,000,000 client project I showed you in the webinar was live software with a real URL that the client's team could access. Shade's N650,000 ecommerce site was the same. Those weren't "let me show you on my screen" demonstrations. They were deployed products that lived on the internet and did their job whether Shade or I were awake or not.

Module nine, Putting Your App On The Internet, is how you get there. Hosting: where your app actually lives when it's not on your hard drive. Domains: the address people type or click to reach it. The first real deployment: the steps that take something from working locally to working for anyone on any device. And the most common failure mode: software that works perfectly on your machine and breaks the moment it reaches a real server, because your machine has things installed that the server doesn't, and you didn't know to account for that.

There's a pattern to that failure. The module teaches you to recognise it and fix it rather than panic.

After this module, you are no longer building things for yourself. You are building things for other people to use. That's the shift that makes everything real.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See module 9",
      "LeadThur usage proof with estimated revenue labelled",
      "Phase 3 · Proof",
    ),

    email(
      19,
      "Ten million naira project",
      "When \"put it on the Play Store\" is the right move. And when it will destroy your timeline.",
      [
        "Module 10 is the honest version of the app store conversation. Without the promises nobody can keep.",
        "Shade's client wants the website turned into an app. Here's what that conversation actually involves.",
      ],
      "Nobody controls Apple's review timeline. I won't pretend to.",
      `I'm going to be straightforward with you about this module because the internet is not.

The question of whether your software should be a web app, the kind that opens in a browser on any phone, or a native app, the kind that someone downloads from the Google Play Store or the Apple App Store, is a real decision with real consequences. And I've seen too many people make promises to clients about Play Store launches before they understood what that actually involved.

Web apps handle the majority of use cases. They open in any browser on any phone. They don't require anyone's approval. They update instantly when you make a change. They don't require your user to download anything or create an account with Google or Apple. A lot of the software built in this training ends here, and for many projects, that's exactly the right answer.

Native apps make sense in specific situations: when you need deep access to the phone's hardware, when users need the app to work completely offline, or when the experience you're building genuinely requires things that a browser can't deliver. They also require a review process that you do not control. Apple decides when your app gets approved. That timeline can be three days or three weeks and it does not move faster because you have a client waiting.

Module ten teaches that distinction honestly, so you can have the right conversation with a client before you make a promise you can't keep. Shade's client asking to turn the ecommerce website into an app is exactly this conversation. The answer depends on what the app actually needs to do and whether a web experience would serve the customer just as well.

This module is also where I cover what "getting on the stores" actually involves for the cases where it's the right answer, because it is genuinely achievable. Just not in the timeframe people usually imagine the first time.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the full programme",
      "Verified large project as ceiling, not a guarantee",
      "Phase 3 · Proof",
    ),

    email(
      20,
      "Shade’s ecommerce project",
      "The LeadThur numbers. All of them, labelled where they're estimated.",
      [
        "I've mentioned LeadThur a lot. Here are the actual figures with the words \"estimated\" where they belong.",
        "782 users. 9,460 paid searches. N15,120,000. Here's what those numbers actually mean.",
      ],
      "I'm going to open the dashboard properly because you deserve the full picture, not just the headline.",
      `I've referenced LeadThur in several of these emails and I want to give you the complete picture rather than letting the headline numbers do all the work.

The dashboard I showed in the webinar: 782 total users. 681 active users. 107 new in the week the screenshot was taken. 9,460 paid searches by paying users. 2,035 free trial searches. Estimated revenue: N15,120,000. That's 443 users on the N15,000 plan and 339 on the N25,000 plan.

The word estimated is on the dashboard and I'm keeping it here too. That's the platform's own projection based on active subscriber counts. It's not a confirmed bank balance and I won't present it as one.

What I want you to understand about those numbers is how they were produced. LeadThur was built with AI tools, using the same workflow this training teaches. There was no development team. There was no co-founder who handled the technical side while I handled marketing. One person, directing tools, specifying outcomes, testing results, fixing what broke, shipping, then iterating. The method that produced LeadThur is the method I'm teaching.

That is not a promise that you will produce similar numbers. Building a successful software product depends on choosing the right problem, building it well, pricing it correctly, and finding the people who need it. The training gives you the building part. The rest is real work.

But the numbers are real. The software is live. People pay for it every month. And it was built the way I'm describing.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the training offer",
      "Complete Shade story with context and no guarantee",
      "Phase 3 · Proof",
    ),

    email(
      21,
      "Chinedu and the return client",
      "N10 million. One client. Seven days. I want to tell you about that project.",
      [
        "The biggest single project I've taken on. What it was, how long it took, and how it was built.",
        "A single client job at N10 million proves something different from LeadThur. Here's what.",
      ],
      "Not a product launch. One client, one brief, one delivery. The same skill.",
      `The N10,000,000 client project I showed in the webinar is different from LeadThur and I want to be clear about why, because they prove different things.

LeadThur is a product. Many different people pay a recurring monthly fee to use it. The income comes in pieces from many sources over time. That's one kind of outcome from this skill.

The N10 million project was a service. One client. One brief. One delivery. The payment came through in full on completion, which is what you saw on the Fidelity Bank alert in the webinar.

The project took seven days to build. Seven days from brief to delivery, using the same AI workflow this training teaches. The client paid N10,000,000 for it.

I mention this separately from LeadThur because it answers a different question. LeadThur answers: can you build something many people will pay for over time? The N10 million project answers: can a single client job, built with AI tools, be worth this kind of money?

Both answers are yes. And both outcomes come from the same foundation. Knowing how to specify clearly. Knowing how to build reliably. Knowing how to deliver something that a client can actually use and will actually pay for.

That foundation is what the ten modules teach. Not the specific project. Not the specific client. The foundation.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the training that teaches this",
      "Complete Chinedu story: return client as the point",
      "Phase 3 · Proof",
    ),

    email(
      22,
      "eXp Realty and Lovable",
      "Shade got paid N650,000. I told her to charge N1.5 million for the next job. Here's why.",
      [
        "The client didn't go looking for someone else. They came straight back to Shade. That's the pattern.",
        "First job done. Same client asks for more. This is how the income grows without starting over.",
      ],
      "Reliability creates return business. That's less glamorous than going viral and more valuable.",
      `Shade is a student from this programme.

A client needed an ecommerce website for their business. Shade built it using AI tools, following the same workflow this training teaches. The client paid N650,000. It was Shade's first paid client project.

That same client, without Shade asking, came back with another request. They wanted the ecommerce site turned into a full mobile app so their customers could download it from the app store. I told Shade to charge N1,500,000 for that job.

I want to pull apart what happened here because people look at the N650,000 number and that's what they focus on. But the more important thing is what came after it.

The client didn't go to a marketplace and search for another developer. They didn't ask for referrals. They didn't get a second quote from someone cheaper. They came straight back to Shade, with a bigger job and an expectation of paying more for it, because the first delivery earned their trust.

That's how income from this skill actually compounds. Not by finding a new client every time. By doing the first job well enough that the same client brings you the next one, and the one after that. Chinedu had exactly the same experience. First website, N480,000, client came back for a second.

The training teaches you to build to that standard. Reliable. Professional. Something a client opens and trusts. That's not a talent thing. It's a process thing.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the full offer",
      "Verified eXp/Lovable story, attributed, not a promise",
      "Phase 3 · Proof",
    ),

    email(
      23,
      "Ryplix and Bolt",
      "Chinedu charged N480,000 for a website. Then the client came back and asked for another one.",
      [
        "The second client job came from the first. That's the cheap acquisition channel nobody talks about.",
        "First delivery. Client comes back. How the pattern works.",
      ],
      "He didn't need ads or a following for the second job. He needed the first job to be good.",
      `Chinedu is another student from this programme.

His first client paid N480,000 for a website. Built with AI tools, following the same process this training teaches. The client got the website. It worked. It looked professional. It did what it was supposed to do.

The client came back asking for a second website, for a different business in their portfolio. Chinedu asked me how to price the additional features they wanted. I told him N100,000 to N150,000 depending on the scope, and to agree the exact scope before starting any work so there are no surprises later.

Two things I want you to notice about this.

The first is that the second job cost Chinedu nothing to acquire. No ad spend. No time spent pitching to strangers. No marketplace listing. No Instagram content. One person, coming back, because the first job gave them a reason to.

The second is that the path from first job to second job runs through one thing and one thing only: delivering the first job well enough that the client has no reason to look elsewhere. Not perfectly. Not without any issues. Well enough. Professionally enough. Reliably enough that the client's experience of working with you is: "this person builds things that work and fixes problems when they come up."

That's what the training builds toward. Not a single impressive project. A way of working that creates repeat business.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the programme",
      "Bolt/Ryplix reported figures, clearly attributed",
      "Phase 3 · Proof",
    ),

    email(
      24,
      "One-off fees versus money that repeats",
      "Four ways this skill puts money in your account. None of them require going viral.",
      [
        "Client work, your own product, selling software, free tools. The four paths from building to being paid.",
        "You don't need a startup idea or a following. Here are the four doors from this skill to income.",
      ],
      "Most people focus on one and miss the other three. Here's the full picture.",
      `I want to lay out the four ways this skill can actually pay you, because they're genuinely different from each other and knowing which one fits your situation changes what you build first.

The first is client work. A business has a problem. You build something that fixes it. They pay you for the project. This is usually the fastest first income because businesses with problems are everywhere and the sales cycle is shorter than any other path. Shade and Chinedu both started here.

The second is building your own product. You identify a problem that many different people have, build a tool that solves it, and charge people to use it on an ongoing basis. LeadThur is this. It earns while I sleep because the software runs whether I'm working or not. The income is less immediate than client work and more durable once it's established.

The third is selling software as an asset. You build something, it works, it has users or revenue or both, and you sell the whole thing to someone who wants to own it rather than build it. There are marketplaces where this happens regularly and small apps with real traction sell for meaningful money. The Software Marketplace Guide inside the programme covers where to go and what buyers actually look for.

The fourth is building free tools that do your selling for you. A tool that solves one specific problem for free, attracts the people who have that problem, and converts them into customers for something you sell. This is a longer game but it creates the most sustainable pipeline.

You don't need all four. Most people start with one. The training gives you the foundation to pursue any of them and the knowledge to decide which one fits your situation right now.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the monetisation modules",
      "Monetization shapes without overnight-rich claims",
      "Phase 3 · Proof",
    ),

    email(
      25,
      "Price the problem, not your hours",
      "Why N480,000 and N10 million can both be fair for a website in the same country.",
      [
        "If you're charging by the hour, AI just made you cheaper. Here's a better way to think about pricing.",
        "Price the problem you're solving. Not the hours you spend.",
      ],
      "The question to ask before you quote is not \"how long will this take.\" It's \"what is this problem already costing them.\"",
      `If you charge by the hour, building software with AI just made you a worse business.

Think about it. The point of using AI tools is to build faster. If you're billing per hour and you build something in three days that used to take three weeks, you've just charged one-seventh of what you would have charged before. You got faster, which is the whole point, and you got paid less for it. That's not a reward. That's a punishment for improving.

The better frame is pricing the problem you're solving rather than the time you spend solving it.

Problems already have a price attached to them whether the client has calculated it or not. Staff hours wasted on manual processes. Orders lost because the system didn't work. Customers who left because the experience was too frustrating. Refunds. Errors. Embarrassment. When a manual process is costing a business hundreds of thousands of naira a month in some combination of those things, a N650,000 build that ends it can look like a bargain from their side of the table even if it took you two weeks.

When the pain is smaller, the invoice should be smaller. When it's larger, larger is fair. This is why N480,000 for a website, N650,000 for another website, and N10,000,000 for a single project can all be honest in the same country at the same time. The number follows the problem, not a rate card.

Practical habits before you quote: find out what the current situation is actually costing before you say a number. Quote a specific version one with a defined scope rather than an open agreement. Don't win work by being the cheapest, those clients negotiate hardest and rarely come back. Chinedu's second website was not a discount strategy.

The Get-Paid Guide inside the programme is where this conversation gets taught in full.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the Get-Paid Guide",
      "Pricing education tied to named proof",
      "Phase 3 · Proof",
    ),

    email(
      26,
      "Objection — I cannot code",
      "\"I can't code.\" I hear this every week. Let me tell you what it actually means for this skill.",
      [
        "Shade and Chinedu were paid for working websites. Not computer science degrees.",
        "You will see code. You won't need two years of syntax to do what they did.",
      ],
      "I won't lie to you and say you'll never see a line of code. I will tell you what you actually need to be comfortable with.",
      `I want to be honest with you about something that other people in this space often aren't.

You will see code. I'm not going to tell you that you'll build real software and never once look at something that looks like code, because that's not true and you'd figure it out in the first week. If I told you that and you enrolled and found out differently, you'd feel misled, and you'd be right.

Here's what's actually true.

Writing code from memory, knowing a programming language deeply, being able to build a full system from scratch without AI assistance, that's a real profession that takes years to develop. You don't need to become that person.

What you do need to become comfortable with is different and genuinely learnable in weeks. Reading an error message without panicking and closing the laptop. Knowing roughly which file in your project is responsible for which behaviour so you can tell AI where to look when something breaks. Pasting an error into a prompt and describing what you expected to happen versus what actually happened. Recognising when the output AI gave you looks right on the surface but will break the moment a real user touches it. Testing like a suspicious stranger rather than like the person who built it.

That's directing. It's different from coding. It's closer to knowing what you want clearly enough to manage a very fast, very capable worker who needs precise instructions and breaks down when the instructions are vague.

Shade's N650,000 site and Chinedu's N480,000 site were working deliverables. Not computer science theses. Not perfect code. Working products that real clients paid for and came back for more.

The Zero-To-Builder Setup exists because most people quit at the environment, not because they failed any kind of talent test. If that sentence describes you, that's where we start.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See where the programme starts",
      "Coding objection answered without hype",
      "Phase 4 · Objections",
    ),

    email(
      27,
      "Objection — I am not technical",
      "\"I'm not technical.\" I've heard that from people who went on to earn N480,000 from client work.",
      [
        "Not technical is usually a story people tell after a bad afternoon with a tutorial.",
        "Four habits that matter more than a science background. The list might surprise you.",
      ],
      "I don't think \"not technical\" is permanent. I think it's a description of where you are, not where you're going.",
      `I've been thinking about this phrase for a long time because I hear it constantly and I've watched it do real damage.

"I'm not technical."

People say it like it's a permanent characteristic of who they are. Like some people are born with the technical gene and some aren't, and the best the second group can do is hope they can afford to keep hiring the first group forever.

I don't believe that's what's actually happening when someone says it.

What I actually observe, when I watch people learn to build software for the first time, is that the ones who succeed and the ones who don't are almost never separated by intelligence or some innate technical ability. They're separated by habits. Four of them specifically.

The first is following instructions in sequence without skipping steps that feel obvious or unnecessary. Step four exists for a reason. Skip it and something breaks five steps later and you don't know why.

The second is reading an error message instead of closing the laptop. The message is usually telling you exactly what's wrong. Most beginners see the red text and immediately conclude the whole thing is broken and they must be the problem.

The third is being willing to sit with not understanding something for a few days rather than declaring defeat. Progress in this skill is rarely linear. There are days where everything clicks and days where nothing makes sense and the difference between people who make it and people who don't is often just that the successful ones didn't quit on the days when nothing made sense.

The fourth is asking specific questions when stuck. "It doesn't work" is not a question. "I clicked the save button, I expected the new record to appear in the list, and instead I got this error message" is a question that gets answered.

Private Support Family inside the programme exists so that when you're stuck, you're stuck around people who have seen that specific problem before and know the answer. Stall time kills more learning than difficulty does.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "Test yourself in module 1",
      "Identity objection with behavioural criteria",
      "Phase 4 · Objections",
    ),

    email(
      28,
      "Objection — I do not know what to build",
      "\"I don't know what to build.\" This is the easiest objection to fix. Here's how.",
      [
        "Your first build doesn't have to be your first business. These are two different things.",
        "Waiting for a brilliant original idea is how people never start. Here's what to build instead.",
      ],
      "LeadThur was a narrow annoyance, not a unique invention. Your first build can be even smaller.",
      `Of all the reasons people give for not starting, this one is the most fixable. And I mean that genuinely, not as a sales line.

"I don't know what to build" usually means one of two things. Either you're waiting for an idea so original and brilliant that it justifies the risk of starting, or you've mixed up your first build and your first business and you're trying to solve both problems at once before you've solved either.

The first build doesn't need to be a business. It doesn't need to be original. It doesn't need to impress anyone outside of the person you're building it for.

LeadThur was not a unique invention that nobody had ever thought of. Finding business contacts is something people were already doing manually. The value was doing it faster and more reliably than the manual version, which is a much more modest promise than "I invented a new category."

Your first build can be even smaller than that. A booking form for a salon you know personally. A stock tracker for a shop in your family. A simple attendance system for a school or church. It doesn't need to be purchased by a stranger. It needs to be finished and live at a real URL so the path from idea to working product is no longer theoretical in your head.

After you finish one thing and see it live on the internet, the world looks different. You start noticing problems instead of hunting for ideas. That's the shift that makes everything after it easier.

If you genuinely have no access to any business right now and can't think of a starting point, the App Idea Vault and Done-For-You App Template Pack inside the programme are there precisely so that a blank starting point is never your excuse.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the idea bonuses",
      "Separate first build from first business",
      "Phase 4 · Objections",
    ),

    email(
      29,
      "Objection — I cannot afford tools",
      `"I can't afford the tools." Compare one developer quote to ${WEBINAR_FOLLOWUP_OFFER_PRICE}. Then think again.`,
      [
        "Most people pay for tools, ship nothing, and stop while the bills keep coming. Here's how to avoid that.",
        "The expensive version is not learning this. The developer quotes don't stop.",
      ],
      "Free tiers first. Paid tools after something earns. That's the order.",
      `I want you to do one calculation before you use this objection.

Get an actual quote, from an actual developer, for a modest custom booking system or internal management tool for a small business. Not a massive platform. Something reasonable. Take that number and sit it next to ${WEBINAR_FOLLOWUP_OFFER_PRICE}.

Then remember that the developer quote is for one project. The next change is another conversation and potentially another quote. The next idea goes back into someone else's queue. You are buying one result, once, on their timeline.

${WEBINAR_FOLLOWUP_OFFER_PRICE} is for learning to build yourself. Any project. Any time. For as long as you decide to keep building. You're not renting a result. You're acquiring a skill that doesn't expire.

The other version of this fear is the tool cost fear: "I'll enroll and then discover I need six expensive subscriptions before I can build anything." This is why the Zero-Cost Toolkit is in the programme. We teach setup on free and low-cost tiers specifically because the right time to pay for professional tools is after something is earning, not before. Most people get this backwards. They subscribe to tools in month one, spend money on software they don't know how to use yet, build nothing in the first thirty days, and stop while the charges keep coming.

The Zero-To-Builder Setup keeps the early tool cost small deliberately. Templates mean you're not starting from an empty folder and paying someone to fill it. You start with something that runs, on tools that don't cost much yet.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional. ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular.`,
      "See the Zero-Cost Toolkit",
      "Tool cost vs repeating developer spend",
      "Phase 4 · Objections",
    ),

    email(
      30,
      "Objection — AI is wrong, and things break",
      "AI will be confidently wrong. Things will break. That's not a reason to avoid this. It's a description of the job.",
      [
        "The workflow that separates people who ship from people who give up when something breaks.",
        "Small pieces, save points, and tests. The method that makes building with AI actually work.",
      ],
      "Beginners dump everything into one prompt and blame the category when it fails. That's a workflow problem.",
      `Let me describe something that happens to almost everyone who tries to build software with AI for the first time without proper guidance.

They have an idea. They open the AI tool. They describe the whole application in one long prompt, everything they want it to do, every feature, every screen, every function. Something comes back. It looks impressive. They start building on top of it, adding more, asking for changes. Three hours in, something breaks and they can't tell what caused it. They try to fix it. Something else breaks. They spend an evening going in circles and eventually give up and conclude that the whole thing is overhyped or that they're just not cut out for it.

The problem is not the AI. The problem is the workflow.

Professional builders, the ones who use these tools every day and ship real products with them, work differently. They build in small pieces. They test each piece before adding the next one. They write down what "working" means before they start so they have something to check against. They keep a last-good version so that when something breaks they can get back to working in minutes instead of hours. They test the way a suspicious stranger would use it, not the way they built it. They treat an error message as information, not a verdict.

Teaching AI To Build For You, the Prompt Playbook, Making Your App Actually Work, and Your Safety Net are the four modules that build that second workflow. Not as theory. As practice, with the specific language and habits that make it work.

Chinedu's client came back for a second website. Not because the first website was flawless. Because Chinedu answered when something went wrong and fixed it. That's the real standard.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the reliability modules",
      "Mistakes and breakage as method, not denial",
      "Phase 4 · Objections",
    ),

    email(
      31,
      "Objection — I cannot find clients",
      "\"I can't find clients.\" The first one is usually already nearby. Here's where to look.",
      [
        "You don't need ten thousand followers to land your first client. You need one specific observation.",
        "The paths to first client work are unglamorous and available without a personal brand.",
      ],
      "Chinedu's second website came from the first. That's the acquisition channel nobody talks about.",
      `The advice you'll find on the internet about finding clients assumes you have an audience. It tells you to post content, build a personal brand, grow your following, create a portfolio website, run ads. All of that is real, eventually. None of it is where first clients usually come from.

Here's where they actually come from.

People who already know you. Your family's business. A church or school you're connected to. Someone from your old job. A friend's shop. These are relationships where some level of trust already exists. You don't have to earn it from scratch. You just have to demonstrate that you can solve a specific problem.

Businesses you can walk into. Not pitch to cold, but walk into and observe. "You track deliveries by hand. I noticed that costs you this much time every week. I can build something that does it in two minutes. Do you want to see what that looks like?" That's not a sales call. That's an observation and a question.

Narrow positioning. "I build booking and records systems for small clinics" is easier to refer to someone than "I build software." Specificity makes you referable because people know exactly who to send to you.

Marketplaces, once you have something to show. The Software Marketplace Guide inside the programme covers where to list and how buyers search for what they need.

And repeat work, which is the one people underestimate the most. Chinedu's second website cost him zero in acquisition. It came from the first website being good enough that the client had no reason to look elsewhere. That's not a marketing strategy. That's quality of delivery.

The Get-Paid Guide covers the approach, the scoping conversation, and how to say a number without either underselling yourself or losing the deal.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the Get-Paid Guide",
      "Client pipeline without audience mythology",
      "Phase 4 · Objections",
    ),

    email(
      32,
      "Objection — nobody will buy from me",
      "\"Nobody will buy from me.\" Shade and Chinedu were not famous when they got their first clients.",
      [
        "A working example beats a portfolio biography at the beginning. Every time.",
        "The pharmacy on your street is not being hunted by a big agency. That's the opportunity.",
      ],
      "You don't need a reputation. You need work that runs and a client who saw it run.",
      `I want to talk about this particular fear directly because it's real and it's stopping real people.

"Why would anyone pay me? I have no portfolio. No agency name. No track record. No following. Who am I for someone to trust with their business?"

That's an honest question and it deserves an honest answer.

At the beginning, a working example beats a biography. Not a testimonial. Not a case study. An actual thing that runs. A booking form someone can open on their phone. A stock tracker that works. A simple tool that does the specific job it was built for. Two of those, from projects you've completed even if they were free, is enough to have a real conversation about a paid project.

Shade and Chinedu were not famous when they landed their first clients. They weren't running ads or posting content or speaking at events. They had work that ran and clients who could see that it ran. That's it.

Specific beats general at every stage. If you have built records management for one clinic, three other clinic owners don't need you to be a celebrity. They need to see that you've done this before for someone who has the same problems they have.

Process beats charm in B2B sales. Business owners who've been disappointed by developers before are not looking for the most enthusiastic freelancer. They're looking for someone whose way of working makes the risk feel small. "Version one will include these specific things. This is the timeline. This is how you'll see progress week by week. If anything changes, I'll tell you before I do it." That process conversation is more reassuring than any credential.

The programme is how you get the first working pieces and the language to have that conversation.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the full programme",
      "Credibility mechanics without fake fame",
      "Phase 4 · Objections",
    ),

    email(
      33,
      "Is ₦49,999 worth it, and do I have time",
      `Is ${WEBINAR_FOLLOWUP_OFFER_PRICE} worth it? Do you have time? Two honest answers.`,
      [
        "The two real questions before enrolling. I'm going to answer them without a fake countdown.",
        "Money and hours. Here's how to think about both before you decide.",
      ],
      "I'll tell you what you're comparing. Not that the price disappears at midnight.",
      `These are the two questions I hear the most at this stage of the sequence, and I want to answer them both directly rather than with pressure tactics.

The first question is whether ${WEBINAR_FOLLOWUP_OFFER_PRICE} is worth it.

Here's how I think about that comparison honestly. One developer quote for a modest custom project is often in the range of N500,000 to N3,000,000, and that's for one project with one set of requirements. Every change after delivery is another conversation. Every new idea goes back into someone else's queue. You're not buying a capability. You're renting a result.

${WEBINAR_FOLLOWUP_OFFER_PRICE} is for the capability to build yourself, for any project, at any time, without asking permission from another person's calendar. One client invoice in the range of what Shade and Chinedu have been paid is many times the enrolment cost. I'm not promising you that invoice. I'm saying the comparison is between a recurring cost and a one-time investment in something that doesn't expire.

The second question is whether you have time.

The first week of the programme is setup and one small thing that runs. Not ten modules in seven days. A realistic first week is a few focused hours at a time when you're not exhausted, following the module in order without skipping steps. People who wait for a completely free month to open up before starting almost always don't start. People who start in a slightly inconvenient week often finish.

If both answers are yes, enroll and do module one this week. Not all ten. Just module one.

If the answer is no, that's allowed. If it's not yet, name the specific thing that has to change first. A vague "not yet" is usually just a delayed no.

No invented deadline in this email.`,
      "Open the offer and decide with real numbers",
      "Price and time objections together, no fake deadline",
      "Phase 4 · Objections",
    ),

    email(
      34,
      "Modules one to five, in human terms",
      "Modules one to five. Not a list of titles. What each one actually saves you from.",
      [
        "The first half of the programme, explained as if you're the person sitting down to use it.",
        "Setup, directing, blueprint, prompts, and trust. Why each one is in the sequence where it is.",
      ],
      "Scattered YouTube tutorials are months. This is an order. Here's why the order matters.",
      `I want to walk you through the first five modules not as a sales list but as a sequence of problems they solve, because the order matters and most people who try to learn this on their own hit these problems in exactly the wrong sequence and quit.

Module one is The Zero-To-Builder Setup. Its job is to get your workspace running without a fight. The right tools, the right accounts, the right defaults, in a single clear sequence. Its real function is not teaching you tools. It's preventing the "five conflicting tutorials" problem that makes people close the laptop in the first week and never come back.

Module two is Teaching AI To Build For You. This is the working relationship. You learn to specify clearly, generate, check the result against what you actually wanted, reject what doesn't work, and try again. You also learn the expensive lesson that AI sounds confident when it's wrong, which means you have to be the one who knows what "right" looks like.

Module three is The Idea-To-Blueprint System. You learn to take a rough idea and make it specific enough to build. Who is the user. What does version one do. What does version one absolutely refuse to do. The last question is the most important because "we'll add that later" is how projects get too big to finish.

Module four is The Prompt Playbook. Recurring situations in building produce recurring language. This module gives you the language for those situations so you're not inventing instructions from nothing every session.

Module five is Making Your App Look Good. Not design as an art form. Design as trust. Shade's N650,000 ecommerce site was won in the three seconds the client spent looking at it on their phone for the first time.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional. Tomorrow: the second half.`,
      "See modules 1-5 on the offer",
      "Concrete value of early modules",
      "Phase 5 · Offer",
    ),

    email(
      35,
      "Modules six to ten",
      "Modules six to ten. The unglamorous half. The part that makes the difference between a demo and software.",
      [
        "Looking like software is easy with AI. Surviving real users is still craft. Here's what the second half teaches.",
        "The N10 million project and Shade's N650K site were not localhost demos. This is what made them real.",
      ],
      "Every module in this half exists because something real breaks without it.",
      `The first five modules teach you to build something that looks right and works in a test environment. The second five teach you to turn that into something that survives the real world.

Module six is Making Your App Actually Work. Empty states, bad input, old phones, weak networks. What happens when someone does something you didn't test for. What happens when three people use it at the same time. What happens when the connection drops mid-submission.

Module seven is Making Your App Remember Things. The database question. Customers, orders, records, messages, all of it needs to persist when the session ends and come back reliably the next time someone logs in. LeadThur's 9,460 paid searches only mean something because the results are still there every time a user comes back. Without this module, you have a form, not a product.

Module eight is Your Safety Net. Version control, backups, a practice environment separate from the live one. This module kills the fear of shipping because you always have a last-good version you can get back to in minutes. That's what makes fast, iterative work possible.

Module nine is Putting Your App On The Internet. A real URL. A real deployment. The N10,000,000 client project and Shade's N650,000 site were not demos on a screenshare. They were live, accessible products.

Module ten is Getting Into The App Stores. When web is enough and when it isn't. What Apple's review process actually involves so you never promise a timeline you can't control.

Ten modules in project order. The order is what scattered YouTube videos won't give you.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See modules 6-10",
      "Reliability and shipping as paid difference",
      "Phase 5 · Offer",
    ),

    email(
      36,
      "Bonuses that stop people quitting",
      "People rarely quit because the material was too hard. They quit stuck and alone at 11pm.",
      [
        "Templates, ideas, and a community. The three ways programmes fail and what we built to prevent each one.",
        "Modules teach you the skill. These three things keep you present long enough to use it.",
      ],
      "Stall time kills more learning than difficulty does. Here's what we built to remove it.",
      `I've watched enough people go through learning programmes, including my own, to know something that the sales page version of this conversation doesn't usually say.

The thing that kills most learning is not hard content. It's stall time. The experience of sitting in front of your laptop at 11pm, stuck on something for the third hour, not knowing what to try next, and quietly closing the lid and telling yourself you'll figure it out tomorrow. Tomorrow becomes the day after. The day after becomes next week. Next week becomes never.

Three things inside the programme exist specifically to reduce stall time.

The Done-For-You App Template Pack is there so you never start from an empty folder. Starting from something that already runs and needs to be customised is a different psychological experience from staring at a blank screen waiting for inspiration.

The App Idea Vault is there for when you know you want to build but you're genuinely stuck on what to practice on. Not every starting point has to be your own idea. Studying how a narrow, already-successful type of product is built teaches you things that a theoretical exercise doesn't.

Private Support Family is there for the 11pm stall. Three hours stuck on something that a person who has seen it before would fix in ten minutes is an expensive and demoralising tax. The group removes that tax. It also shows you other people's messy first builds, which is often the most useful thing of all, because the single biggest illusion in learning is that everyone else is finding it easy.

These don't replace the ten modules. They keep you present long enough for the modules to work.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional.`,
      "See the bonuses on the offer",
      "Quit-point bonuses explained",
      "Phase 5 · Offer",
    ),

    email(
      37,
      "Bonuses that connect building to money",
      "Building privately is safe. It's also invisible. Here's what connects the skill to income.",
      [
        "Get paid, stay cheap, get found. The three bonuses that connect building to money.",
        "Skill without a clear path to an invoice is a very expensive hobby.",
      ],
      "The question \"who pays me?\" has a shape. These bonuses teach that shape.",
      `You can build the most impressive software in the world from your bedroom and earn nothing from it if nobody knows it exists or nobody understands what it does or nobody knows how to pay you for it.

The income-side bonuses inside the programme are there to close that gap.

The Get-Paid Guide is the conversation. How to approach a business with a specific observation rather than a generic pitch. How to scope version one in a way that gives the client certainty and gives you a clear definition of done. How to say a number without underselling yourself or losing the deal. How to handle the "can you just add one more thing" conversation that starts after delivery. Shade's N650,000 and Chinedu's N480,000 both happened inside conversations that followed a shape. That shape is learnable.

Zero-Cost Toolkit is there so you build your first projects and your first portfolio without accumulating six subscriptions before you've earned a naira. The rule I teach is simple: learn and demo on free tiers. Pay for tools when the revenue from those tools justifies it.

Software Marketplace Guide is for when you have something to show and you want to find buyers who are already looking for it. How those directories work, what buyers search for, what a product listing needs to say in one sentence to get someone to click.

Lifetime Access and Free Updates means the training doesn't become outdated. AI tools change. The modules update. You're not paying for a snapshot of one month.

Organic and Paid Ad Formula is for later, when the constraint is attention rather than capability. You don't need it in week one.

${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional. ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular.`,
      "See the money-side bonuses",
      "Monetization bonuses plus lifetime/ads without fake scarcity",
      "Phase 5 · Offer",
    ),

    email(
      38,
      "The stack in numbers, explained",
      `${WEBINAR_FOLLOWUP_OFFER_PRICE}. ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular. ${WEBINAR_FOLLOWUP_OFFER_VALUE} stated. Let me show you what those three numbers mean.`,
      [
        "The stack, labelled properly. Because inflated numbers without context are why people distrust this industry.",
        "Transparent pricing math. No fake countdown. No invented seats.",
      ],
      "I'll explain every number in this offer without pretending any of them are cash in your account.",
      `I want to lay out the pricing on this programme in plain terms because I think clarity here is more valuable than a convincing presentation, and because the way some offers are packaged makes people feel manipulated rather than informed.

Three numbers.

${WEBINAR_FOLLOWUP_OFFER_PRICE} is what you pay today during the promotional period. This is the full enrolment price for everything: all ten modules, all bonuses, the Digital Skillz certificate, and lifetime access to future updates.

${WEBINAR_FOLLOWUP_REGULAR_PRICE} is the regular price once promotional pricing ends. It's the same content. The promotional window is real and it will close, but I'm not going to invent a midnight deadline in this email to pressure you.

${WEBINAR_FOLLOWUP_OFFER_VALUE} is the stated stack value. This is N545,000 across the ten modules, valued at what we believe it would cost to assemble equivalent teaching separately and in the right order, plus N350,000 across the nine bonuses. It is not cash. It is not what you'll earn. It is a valuation of the material, and I'm labelling it that way because the alternative, presenting it as money you're somehow receiving, is the kind of framing that makes people distrust every offer they see after it.

The comparison I think is actually useful: one developer quote for a modest custom project is often more than ${WEBINAR_FOLLOWUP_OFFER_PRICE} by itself. That quote gets you one project, once. This gets you the skill to build any project, any time, without asking permission from someone else's schedule.

That's the comparison. Not a manufactured urgency, not invented scarcity. A real comparison between two different ways to solve the same problem.`,
      "Compare the stack on the offer page",
      "Transparent value math, no fake deadline",
      "Phase 5 · Offer",
    ),

    email(
      39,
      "Paying developers forever versus learning once",
      "Every time a new idea arrives, you go back to someone else's calendar. That's what this ends.",
      [
        "The developer relationship is not one payment. It's an ongoing rental of capability you don't have.",
        `${WEBINAR_FOLLOWUP_OFFER_PRICE} once versus another year of quotes. That's the real comparison.`,
      ],
      "You may still hire specialists. The question is whether you must hire them for every thought.",
      `Let me say something that I think is important and that I haven't said directly yet.

I'm not asking you to stop working with developers. There are situations where you'll want a specialist with deep expertise in a specific area. I work with people who know things I don't, and I expect that to continue. Collaboration with skilled professionals is not the enemy here.

What I'm asking you to think about is the dependency that exists right now, where every idea, no matter how small, has to go through someone else's queue and timeline and interpretation. Where a field you want to add to a form requires another conversation. Where a change to the way data is displayed requires another quote. Where an idea you have on Tuesday might start being built in six weeks if you're lucky, by which time the context and the urgency have both faded.

That dependency is what this skill ends, for the portion of your work that doesn't require a specialist. The projects you can scope clearly, the version ones that are specific enough to build directly, the changes small enough to make yourself without involving another person's calendar.

${WEBINAR_FOLLOWUP_OFFER_PRICE} is a one-time promotional price for acquiring that capability permanently. It does not expire. You don't re-buy it next year. And one client invoice in the range that Shade and Chinedu have been paid covers the enrolment cost many times over, without that being a promise about your specific situation.

Other people who were in this sequence at the same time as you have already watched the webinar, gone through setup, and had their first client conversation. That is not a threat. It is arithmetic. Time passes whether you decide or not.

If you want the skill, the offer page is the place to get it. If you want to keep working the way you're working, that's a genuine choice and I'd rather you make it consciously.`,
      "Enroll if you want the skill in-house",
      "Opportunity cost versus repeating quotes, no fake seats",
      "Phase 5 · Offer",
    ),

    email(
      40,
      "Last email: yes, no, or not yet",
      "This is the last email. Yes, no, or not yet. I need you to pick one.",
      [
        "Same proof. Same price. One question left. What's your answer?",
        "I won't invent a countdown. I will ask you to decide.",
      ],
      "Thank you for reading this far. Attention is the most expensive thing you've given me. I won't spend the last email on a trick.",
      `This is the last email in this sequence.

Over the past forty emails I've shown you what I've built, how it was built, and what happened for the people who learned this. Let me put it in one place.

LeadThur: 782 people paid to use it. 681 active. 9,460 paid searches. N15,120,000 estimated revenue in ninety days. Built with AI tools, no development team, one person directing the build. The word estimated is the dashboard's word and mine.

A single client project: N10,000,000. Seven days to build. Same skill, different outcome.

Shade: N650,000 for an ecommerce site. Same client now asking for an app. I told her to charge N1,500,000 for the next job.

Chinedu: N480,000 for a first website. Client already back for a second.

The programme is How To Build Software With AI And Get Paid For It. Ten modules, nine bonuses, a Digital Skillz certificate, lifetime access. ${WEBINAR_FOLLOWUP_OFFER_PRICE} promotional. ${WEBINAR_FOLLOWUP_REGULAR_PRICE} regular. ${WEBINAR_FOLLOWUP_OFFER_VALUE} stated stack value, labelled as a valuation not as cash.

Three possible answers.

Yes. Enroll. This week, do module one. Not all ten. Just module one. Setup first. Everything else comes after.

No. If you've read forty emails and this is genuinely not the path for you, unsubscribe. Seriously. Go be good at what you actually want. I mean that without sarcasm.

Not yet. If it's not yet, write down the specific condition. A month. A thing that has to change. A number that needs to move. Without a specific condition attached to it, "not yet" is just "no" with better manners. Name the condition and I'll be here when it changes.

If the answer is yes, the offer page is one click away.`,
      "Enroll and start with module 1",
      "Honest close, no fake scarcity",
      "Phase 5 · Offer",
    ),
  ];

  return assertValidWebinarSequence(emails);
}
