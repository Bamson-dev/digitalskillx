AI Ads Automation Masterclass: production risk register

Method. I ran tools/check_package.py on the package (lessons.csv, curriculum.md, assessments.md, quiz-answer-notes.txt, lms-inspection.md, production-plan.md and the 9 resource files) and read the LMS source. Severity: BLOCKER means do not publish until fixed or approved. HIGH means fix before recording the affected lessons. MEDIUM means fix before launch. LOW means note.

BLOCKERS

B1 Naked Offer Framework (third party). The framework belongs to Tony Fotizo. Before any lesson, quiz, resource, storefront text or ad copy teaches or names it, you need written permission, or you need to replace it with your own method. Checker result: the 41 lesson records, the quizzes and the 9 resources do not name it. production-plan.md names it only to flag this item. Do not add it to lesson scripts without permission.
B2 Existing storefront text conflicts with the product. The course description already saved in the admin says: "without touching Ads Manager or paying a media buyer", describes an AI ad agent that "builds and launches your campaign", "adjusts bids, budget and targeting" and "pauses ads that are not selling", lists 9 modules with different names, and names four resources that are not the 9 prepared files. The built course has 16 modules, teaches a human who reviews AI output, and makes no such promise. The old text promises an automation the curriculum does not teach and can read as a result claim. It needs your approval to replace (the replacement text is in production-plan.md section 5). I did not change it.
B3 Publishing emails every enrolled or paying student on the platform. The recipient function lists all non suspended students with any enrolment or successful transaction. Decide the notification you want before you publish (see the decision report, D4).
B4 Course is Draft, so a paid buyer gets a permanent error and no access. Unchanged from the earlier release readiness work. Do not send traffic to the checkout.

HIGH

H1 Short answer questions in quizzes would block auto completion. Fixed in the package: quizzes are 5 MCQ, short answer prompts moved to assignments.
H2 No explanation field in the quiz builder. Fixed by quiz-answer-notes.txt, attached to the host lesson.
H3 Video cannot be uploaded to the LMS. The earlier production plan said "upload the file or paste link". Corrected to YouTube unlisted or Vimeo links.
H4 14 of 41 lessons exceed 15 minutes (2.1, 3.1, 5.2, 7.2, 8.2, 8.3, 9.2, 10.1, 11.2, 12.1, 13.1, 13.2, 14.1, 14.2). YouTube holds unverified channels to 15 minutes. Verify the channel or shorten the lessons.
H5 Certificate issues automatically at completion, before the final project is graded. Choose manual issue (recommended) or accept it.
H6 Resources referenced by lessons but not produced: the Slide deck for 1.1 and the Structure diagram handout for 2.1. Also every lesson that uses slides needs a deck. Count: 22 lessons use slides.
H7 Meta interface instructions can go stale. Lessons 2.2, 5.2, 5.3, 10.1, 10.3, 11.2 and 12.2 name Meta screens in their title, objective, demonstration or assignment. Lessons 4.1, 5.3, 10.1, 10.3, 11.2, 12.2, 13.1, 15.2, 15.3, 16.2 and 16.3 need live Ads Manager or Events Manager access, and Module 3 covers account setup in Business Suite. I could not open Meta's screens in this task, so none of these steps were checked against the live interface. Record them close to launch and compare each step with the live screens.

MEDIUM

M1 Assignment publish emails students. Create assignments as Draft and publish them when the course is live.
M2 Assignments do not block completion. See H5.
M3 Student assignment "file upload" is a link box. Students paste a Drive or Dropbox link, and the link must be shared correctly. Say this in the first assignment instructions.
M4 Quiz retake limit and time limit are page level controls. Keep retakes unlimited. Do not rely on a time limit.
M5 No resume playback and no watch tracking on YouTube embeds. Completion is the Mark complete button. Do not promise "watch tracking" in the sales copy.
M6 No captions for direct files. With YouTube, upload your own caption file or correct the auto captions. Add a transcript attachment.
M7 Coming soon does not stop the sales page flow because external Paystack fulfilment checks only Draft or Published. Do not use Coming soon as a safety switch for checkout.
M8 Examples use Naira prices and invented businesses. They are labelled as invented. Keep the label on every slide that uses one.
M9 Tracker workbook. Formulas recalculated correctly in LibreOffice with test inputs. I did not open it in Excel or Google Sheets. Open it in the apps your students use before you publish.
M10 Recording workload and lesson minutes are estimates, not measurements. The pilot script for lesson 1.1 runs about 6 to 8 minutes against 14 planned. The pilot measures real time. Expect the 620 minute total to change.

LOW

L1 Numbering and module names are consistent across lessons.csv, curriculum.md, assessments.md (checker: PASS, 16 modules, 41 lessons, sequential ids).
L2 No em dashes or emojis in package files. The checker also searched for banned words and income or guarantee wording. The only hits were marking guidance and labelled teaching examples.
L3 Trademarks. Meta, Facebook and Instagram are named descriptively. Do not use logos in slides or the cover image.
L4 Copyright. The 9 resources and the lesson scripts are original text written for this course. Check any stock images, fonts and music you add. Do not copy competitor ads from the Meta Ad Library into slides without a licence. Describe them instead.
L5 Claims about Meta policy. The lessons tell students to check the current policy page. Do not quote policy text from memory.

WHAT THIS REGISTER DOES NOT COVER
The WordPress sales page copy, the checkout and the Meta Pixel were not part of this task. I did not review them for claims.
