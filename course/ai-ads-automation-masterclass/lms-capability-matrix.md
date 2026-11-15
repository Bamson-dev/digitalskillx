AI Ads Automation Masterclass: LMS capability matrix

Scope: DigitalSkillX source code on branch feat/ai-ads-automation-masterclass (commit aab303b92f8c), the admin course editor, and one live read only check. Nothing was published, enrolled, emailed or changed. The course is still Draft with 0 lessons.

How to read this document
Class 1 = Verified and supported.
Class 2 = Supported with limitations.
Class 3 = Not supported.
Class 4 = Requires administrator access to verify.
Basis column: SOURCE means I read the code that implements it. LIVE means I saw it in the running admin site as the signed in admin, without changing anything. INFERRED means I reasoned from code but did not read or run the final piece. The branch is the feature branch, so production may differ if it runs another commit. Confirm in the live admin screens listed in the Class 4 section.

SECTION 1. VIDEO AND LESSON FILES

V1 Video from YouTube, Vimeo, Wistia or Loom link. Class 1. SOURCE. lib/video.ts resolveVideo recognises the four hosts. The lesson form takes a Content URL. YouTube plays through the privacy domain with rel=0.
V2 Video from any other direct file URL. Class 2. SOURCE. resolveVideo returns provider "file" for any other URL and the player renders an HTML5 video element. The LMS does not host the file. Accepted formats are whatever the student's browser plays. MP4 with H.264 video and AAC audio is the safe choice (INFERRED from browser support, not tested).
V3 Upload a video file into the LMS. Class 3. SOURCE. The lesson form has a Content URL text field only. The lesson type label reads "Video (YouTube/Vimeo/upload)", but no video upload control exists in components/admin/course-editor.tsx. The only upload code (lib/upload-lesson-attachment.ts and lib/upload-course-resource.ts) accepts pdf, doc, docx, xls, xlsx, ppt, pptx, txt and zip. Video extensions are not allowed.
V4 Maximum upload size. Class 2. SOURCE. 25 MB for attachments and course resources (MAX_BYTES in both upload libraries, and serverActions bodySizeLimit 25mb in next.config.mjs). There is no video size limit because there is no video upload. The limit that matters for video is the external host's limit.
V5 Maximum video duration. Class 1 for the LMS, outside the LMS for the host. SOURCE. No duration check exists. duration_minutes is a label. YouTube limits a channel to 15 minute uploads until the channel is verified (title of Google's own support page "Upload videos longer than 15 minutes"; I did not read the page body). 14 of the 41 planned lessons run 16 to 22 minutes. Verify the channel before uploading.
V6 Captions or subtitles. Class 3 for direct files. SOURCE. lesson-player.tsx contains no track element and no caption or subtitle handling. For YouTube and Vimeo embeds, captions come from the host player (INFERRED, depends on what you upload to the host). Put a transcript PDF in the lesson attachments.
V7 Resume playback where the student stopped. Class 3. SOURCE. lesson_progress stores watch_percentage and completed_at only. No saved position exists. The lesson page supports a t query parameter that seeks, nothing saves it.
V8 Video progress saves automatically. Class 2. SOURCE. Automatic saving works only for the direct file player: it records watch percentage once when it passes the lesson's Required watch % (updateWatchProgress). YouTube and Vimeo embeds report nothing. Their lessons complete only when the student clicks Mark complete. markLessonComplete writes 100% and completed without checking watch time, so Required watch % cannot be enforced on embeds.
V9 Downloadable lesson attachments. Class 1 (admin side). SOURCE. components/admin/lesson-attachments-panel.tsx uploads to the private-files bucket, 25 MB, allowed types listed in V3. Course level resources use the same limits (course-resources-panel.tsx). Whether the student sees the download links on the lesson page is INFERRED from the shared AttachmentDisplay type. Confirm in the pilot test.
V10 Other lesson types. Class 1. SOURCE. video, pdf, text, audio, slides (Google or Canva link), download, embed. PDF and embed lessons use an iframe on the URL. Audio uses an audio element.
V11 Drip, lock and free preview per lesson. Class 1. SOURCE. Fields drip_days, is_locked, is_free_preview, is_coming_soon exist in the lesson form.

SECTION 2. QUIZZES

Q1 Multiple choice single answer, multiple answer, true or false. Class 1. SOURCE. Auto graded in app/(student)/quizzes/[id]/actions.ts (AUTO_TYPES).
Q2 Short answer, essay, file upload questions. Class 2. SOURCE. Offered in the builder and labelled manual. A quiz that contains one leaves the attempt with passed = null. A null attempt does not count as passed.
Q3 Correct answer explanations. Class 3. SOURCE. quiz_questions and quiz_answers have no explanation field, the admin actions do not accept one, and code search finds none. The student review shows the option they chose and the correct option text. Put explanations in a text attachment.
Q4 Automatic grading. Class 1. SOURCE. Score is points earned over auto graded points, rounded, compared with pass_score.
Q5 Manual grading. Class 2. SOURCE. gradeAttempt lets an admin type a score, sets passed from the quiz pass mark and notifies the student. It does not re-check course completion. Completion re-checks only on a later lesson completion or quiz pass. A student who is waiting on a manual grade can stay incomplete until they finish another item (INFERRED from the two call sites).
Q6 Pass mark. Class 1. SOURCE. pass_score per quiz, default 70.
Q7 Retake limits. Class 2. SOURCE. retake_rule unlimited, limited or none, plus retake_limit. The quiz page hides the form when attempts are used up. submitQuiz counts earlier attempts but does not refuse a submission, so the limit is a page level control (INFERRED that a crafted request could bypass it).
Q8 Question and answer randomisation. Class 1. SOURCE. randomize_questions and randomize_answers shuffle on the quiz page.
Q9 Time limit. Class 2. SOURCE. time_limit_mins is passed to the quiz page. submitQuiz does not check elapsed time, so it is a display control.
Q10 Quiz completion tracking. Class 1. SOURCE. Every attempt is stored in quiz_attempts with score, passed and responses. The course completion rule requires a passed attempt on every quiz in the course.
Q11 Where a quiz lives. Class 2. SOURCE. The admin builder creates quizzes per lesson (route /admin/quizzes/[lessonId]). The database also has a module scope and the completion code counts module quizzes, but no admin screen creates them. Plan quizzes as lesson quizzes.
Q12 Show answers setting. Class 1. SOURCE. always, never, or on_pass.

SECTION 3. ASSIGNMENTS AND CERTIFICATES

A1 Written assignment submission. Class 1. SOURCE. Text response when the assignment allows text.
A2 File or screenshot upload by the student. Class 3 for upload. SOURCE. The "file" option is a text box for a shareable link (Google Drive, Dropbox). There is no upload control in components/student/assignment-submit-form.tsx. Students share screenshots as links.
A3 Instructor written feedback. Class 1. SOURCE. gradeSubmission stores feedback and notifies the student.
A4 Pass, Revise, Fail. Class 2. SOURCE. Statuses are pending, graded and revision_requested. Revise maps to revision_requested and reopens the form. Pass and Fail both use graded, so record Pass as grade 100 and Fail as grade 0 with feedback.
A5 Score out of 100 for the final project. Class 2. SOURCE. The grade field is a number. I saw no maximum or pass threshold check in the grading action (INFERRED that any number is accepted). Use 0 to 100 by convention.
A6 Assignment level. Class 2. SOURCE. Assignments belong to a course and optionally a module, not a lesson. They start as Draft. Publishing an assignment notifies and emails enrolled students.
A7 Certificates exist. Class 1. SOURCE. certificate_enabled setting, issueCertificate with PDF and email, template settings, admin issue and reissue (/api/admin/certificates), student certificate page, public verify route.
A8 Certificate eligibility. Class 1. SOURCE. Lesson completion percentage at least Required completion % AND a passed attempt on every quiz. When Certificate is on, it issues automatically at that moment.
A9 Completion rules enforce the proposed requirements. Class 2. SOURCE. They enforce lessons completed and quizzes passed at 70. They do not check assignments or the final project, so a certificate can issue before the project is graded. Alternative: turn the course Certificate setting off and issue by hand after grading. The manual issue action does not check completion or the setting (SOURCE: route.ts and certificates.ts have no such check).

SECTION 4. PUBLICATION, NOTIFICATIONS, ENROLMENT

P1 What publishing does. Class 1. SOURCE. app/(admin)/admin/(panel)/courses/actions.ts. When visibility changes from draft to published and Coming soon is off, it calls scheduleCoursePublishNotify. The notify worker (/api/admin/courses/[courseId]/notify-publish) sends in app notifications and emails. A "notify_paid_students" checkbox forces a resend on later saves.
P2 Who receives it. Class 2. SOURCE. resolveCoursePublishRecipients calls the database function list_course_publish_recipients (migration 0036). It returns every non suspended student with an email who has any enrollment or any successful transaction, on any course. It is platform wide, not limited to this course. If that function is missing it falls back to profile based recipients. Run against production data, the count is Class 4 (I did not query production).
P3 Coming soon and notifications. Class 1. SOURCE. With Coming soon on, publish sends nothing ("Coming soon courses do not notify students until that flag is off").
P4 Silent publish route. Class 2, INFERRED. The notify condition tests the previous visibility. Saving Published with Coming soon on, then later saving with Coming soon off, should find the previous visibility already published and send nothing. I did not run this. Test on a throwaway course first.
P5 Coming soon blocks enrolment. Class 2. SOURCE. In app checkout (/api/payments/initialize) it blocks. In the external Paystack fulfilment path (lib/paystack-external-fulfillment.ts) only visibility is checked, not Coming soon, so a paid buyer through the sales page is enrolled. They then see a Coming soon page (student course page redirects non admins). So Coming soon does not stop the sales page flow.
P6 Draft rejects enrolment. Class 1. SOURCE. Both payment paths reject Draft. The external path returns course_not_published (also seen in the earlier release readiness work). Admin enrol does not check visibility (see P7).
P7 Admin can enrol a test student. Class 1. SOURCE. /api/admin/enroll calls grantCourseAccessToStudent with no visibility check. It works on a Draft course.
P8 Enrolment triggers an access email. Class 1. SOURCE. grantCourseAccessToStudent sends the course enrolment email unless sendEnrollmentEmail is false, and the admin route does not pass false. It also creates an in app notification and runs enrolment automations. Use a mailbox you own for the test student.
P9 Admin preview as student. Class 1. LIVE and SOURCE. I opened the Draft course page as the signed in admin. It showed "Admin preview, you are viewing this course as a student would, without enrolling." Lesson pages have the same isAdminPreview logic (SOURCE, not yet seen live because the course has 0 lessons).

SECTION 5. FINDINGS THAT CHANGE THE PRODUCTION PLAN

F1 Video must be hosted outside the LMS. Use YouTube unlisted or Vimeo and paste the link.
F2 Quizzes must be five MCQ only, attached to lessons 4.2, 8.3, 10.3, 13.2 and 15.3. The earlier package had a short answer in each, which would have blocked auto pass and completion.
F3 Explanations move to quiz-answer-notes.txt.
F4 Assignments are course or module items and publishing them sends emails.
F5 Certificate auto issue ignores the final project. Choose manual issue or accept earlier issue.
F6 Publishing emails students platform wide. Decide the notification before publishing.
F7 The storefront text already in the course says "without touching Ads Manager", "9 modules" and describes an AI ad agent that pauses ads and adjusts bids. The curriculum has 16 modules and teaches the human reviewing AI output. The text conflicts with the product and contains claims the course does not support. It needs your approval to replace.

SECTION 6. CLASS 4 ITEMS TO CONFIRM IN THE LIVE ADMIN

C4-1 Production commit matches the feature branch for the files above.
C4-2 How many students the P2 function returns in production (count it with a read only query before publishing).
C4-3 Student side attachment links render on a lesson (needs a test student).
C4-4 Admin grading screen (/admin/grading) layout for manual quiz grades.
C4-5 Certificate template and the issue button on a test student.
C4-6 Email delivery of the enrolment email (Resend settings).
C4-7 Silent publish route in P4 on a throwaway course.
