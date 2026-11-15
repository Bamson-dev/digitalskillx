AI Ads Automation Masterclass: production decision report

What this report rests on. I read the DigitalSkillX source on the feature branch and loaded the live admin course page as the signed in admin without changing anything. I did not publish, enrol, email, change checkout, merge or deploy. Details and evidence for every row are in lms-capability-matrix.md. VERIFIED means I read the code or saw it live. INFERRED means I reasoned from code and did not run it.

1. FEATURE CLASSIFICATION

Class 1. Verified and supported
V1 Video from YouTube, Vimeo, Wistia, Loom links.
V5 No duration limit in the LMS (the host has its own limit).
V9 Downloadable lesson attachments (admin side).
V10 Lesson types: video, pdf, text, audio, slides, download, embed.
V11 Drip, lock, free preview, per lesson Coming soon.
Q1 Multiple choice (single, multiple) and true or false questions, auto graded.
Q4 Automatic grading and pass or fail.
Q6 Pass mark per quiz.
Q8 Question and answer randomisation.
Q10 Quiz attempt tracking, and completion requires a passed attempt on every quiz.
Q12 Show answers setting.
A1 Written assignment submissions.
A3 Instructor written feedback.
A7 Certificates (issue, reissue, PDF, email, verify page).
A8 Certificate eligibility: completion percentage plus all quizzes passed.
P1 Publishing sends in app notifications and emails.
P3 Coming soon suppresses the publish notification.
P6 Draft rejects paid enrolment.
P7 Admin can enrol a test student into a Draft course.
P8 Enrolment sends an access email by default.
P9 Admin preview as student (seen live on the Draft course page).

Class 2. Supported with limitations
V2 Direct file URL video: no hosting, no upload, any browser playable format.
V4 25 MB limit on attachments and resources.
V8 Progress saves automatically only for direct file video. Embeds use Mark complete, with no watch check.
Q2 Short answer, essay, file upload are manual and leave the attempt with no pass result.
Q5 Manual grading does not re-check completion.
Q7 Retake limit is enforced on the page only.
Q9 Time limit is a display setting only.
Q11 Quizzes attach to lessons. Module quizzes exist in the database with no admin screen.
A4 Pass, Revise, Fail: Graded and Revision requested only. Fail is grade 0 with feedback.
A5 Score out of 100: numeric grade field, no maximum enforced (inferred).
A6 Assignments attach to a course or module, start as Draft, and email students on publish.
A9 Completion rules enforce lessons and quizzes only, not assignments or the final project.
P2 Publish email goes to every student on the platform with any enrolment or paid transaction.
P4 Silent publish route (publish with Coming soon on, then turn it off) is inferred and untested.
P5 Coming soon blocks in app checkout but not the sales page Paystack flow.

Class 3. Not supported
V3 Uploading video files into the LMS.
V6 Captions for direct file video (embeds depend on the host).
V7 Resume playback from the last position.
Q3 Per question explanations.
A2 Student upload of a file or screenshot (they paste a link).

Class 4. Requires administrator access to verify
C4-1 Production runs the same commit as the feature branch.
C4-2 How many students the publish email would reach in production.
C4-3 Student side attachment links on a lesson page.
C4-4 Admin grading screen layout.
C4-5 Certificate template and issue button on a test student.
C4-6 Enrolment email delivery settings.
C4-7 Silent publish route on a throwaway course.

2. RECOMMENDATIONS

Video format and resolution
MP4, H.264 video, AAC audio, 1920 by 1080, 30 frames per second, 16:9. Record screens at 1920 by 1080 with browser zoom at 125 percent so text is readable on a phone. Keep voice loudness steady. Do not record below 1280 by 720. This follows common practice for web video. I did not test it in the LMS. The pilot tests it.

Upload method
YouTube Unlisted, pasted into Content URL. Verify the channel first, because 14 lessons run over 15 minutes. Use a YouTube channel that is not your public marketing channel, so the lessons do not appear on a public channel page. Unlisted links can be shared by anyone who has them, and the LMS has no download or sharing protection. If that is not acceptable, use Vimeo and check which plan gives you domain level privacy (I did not verify Vimeo plan features). Do not use direct file hosting unless you have a host that gives a stable public MP4 link, because progress tracking is then the only advantage and captions disappear.

Quiz configuration
Five quizzes on lessons 4.2, 8.3, 10.3, 13.2 and 15.3. Five multiple choice single answer questions each, one point each. Pass score 70, which requires 4 of 5. Retake rule Unlimited. Show answers On pass. Randomise questions and answers on. No time limit, no negative marking. Explanations in quiz-answer-notes.txt on the host lesson. Because completion needs all five passed, students cannot finish without them.

Assignment workflow
Create 17 required assignments as Draft in Admin, Assignments, one per required lesson, titled with the lesson number. Allow text and link. Publish them when the course goes live. Student submits text or a shared link. You grade in Admin, Grading or Assignments: Graded with grade 100 is Pass, Revision requested is Revise, Graded with grade 0 plus feedback is Fail. Final project: one assignment per stage (3 total), grade 0 to 100, pass at 70. Plan the marking hours: 17 assignments and 3 project stages per student.

Certificate workflow
Required completion 100 percent. Course Certificate setting off. When a student finishes all lessons and quizzes and passes the final project stage 3, issue the certificate from the student's admin page (issue action, which does not check completion). If you prefer automatic issue, turn the setting on and accept that the certificate can issue before the project is graded.

3. TWO LESSON PILOT PRODUCTION PACKAGE
pilot/pilot-lessons-1.1-1.2.md contains, for lessons 1.1 and 1.2: recording scripts, slide outlines, screen recording instructions, required assets, and the recording, editing, upload and student testing checklists. The objectives and structure are unchanged from the curriculum. All examples are labelled invented.
Finding from writing the scripts: lesson 1.1 as scripted runs about 6 to 8 minutes against 14 planned. Planned minutes in lessons.csv are estimates. Expect the 620 minute total to shrink once you record.

4. DECISIONS I NEED FROM YOU
D1 Which AI assistant and image tools may appear on screen. You earlier said you do not want the AI agent shown in marketing. Lesson 1.2 shows an AI assistant chat.
D2 Where the pilot lives. Option A: a separate Draft course named "Pilot do not publish" (recommended, keeps the real course clean). Option B: add Module 1 and two lessons to the real Draft course. Either creates production data, so I need your approval. I did not create either.
D3 The test student: an email address you own. Enrolling sends a real enrolment email and an in app notification to that address.
D4 Publish notification: send to the platform wide audience, or test the silent route first on a throwaway course.
D5 Certificate: manual issue after the final project (recommended) or automatic.
D6 Storefront text: replace the existing description (9 modules, AI ad agent, "without touching Ads Manager") with the text in production-plan.md section 5.
D7 Naked Offer Framework: get Tony Fotizo's written permission or replace it with your own method. The package currently contains none.
D8 Who grades, and your promised turnaround.
D9 YouTube or Vimeo for hosting.
D10 Lessons over 15 minutes: verify the channel or shorten.

5. EXACT STEPS FOR TESTING THE PILOT
These steps change production data and send one email. Do not start until you approve D2 and D3.
1. Verify your YouTube channel with a phone number.
2. Record and edit lessons 1.1 and 1.2 using the pilot package. Export as MP4 1920 by 1080, 30 frames per second.
3. Upload both videos to YouTube as Unlisted. Copy the two links.
4. In Admin, Courses, create the pilot course (D2 option A) as Draft. Or open the real course (option B). Keep visibility Draft.
5. Add Module 1 "Introduction to AI-powered advertising". Add the two lessons as type Video. Paste each link. Set duration to the real minutes.
6. In each lesson Attachments panel, attach the PDFs listed in the pilot package. Click Upload to server.
7. Open Preview as student on the course page and on both lessons. Confirm the video plays and the attachments are listed.
8. Create the test student with the mailbox from D3. Admin, Students, create. This may send a welcome email to that mailbox.
9. Enrol the test student in the pilot course from the admin enrol action. This sends the enrolment email. Confirm only the test mailbox receives anything.
10. Sign in as the test student in a private window on a phone and on a laptop. Open both lessons. Check: video plays with sound, attachments open, Mark complete works, progress percent changes, a reload keeps progress, YouTube does not suggest other channels' videos at the end.
11. Time yourself: record the real recording and editing hours for each lesson.
12. Record every problem with the lesson number and a screenshot. Then decide on the full recording run.
13. Do not publish the course. Do not create assignments or quizzes in the pilot. Test those on the throwaway course in a separate session.
If any step sends an email to anyone other than the test mailbox, stop and tell me.

6. WHAT I DID NOT VERIFY
Production database contents, the Resend delivery settings, Meta's live screens, Vimeo plan features, YouTube's current limits beyond the support page title, Excel and Google Sheets behaviour of the tracker, and the student side lesson page, because the course has no lessons yet.
