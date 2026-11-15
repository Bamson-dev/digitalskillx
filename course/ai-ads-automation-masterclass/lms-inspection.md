AI Ads Automation Masterclass: LMS inspection notes

Scope: DigitalSkillX admin area and README, read only. No production course data was changed. The course is still Draft with zero modules.

Verified from the admin screens and README
- Structure: course, then modules, then lessons. Admins add modules and lessons in the course builder.
- Lesson types: video (YouTube link, Vimeo link or direct upload), PDF, text, audio, slides, file download, embedded website.
- Quizzes: single answer and multiple answer multiple choice, true or false, short answer, essay, file upload.
- Assignments: students answer with text, a link or a file. Graded manually by an admin.
- Course settings: price, visibility, enrollment mode, completion percentage, certificate, drip release, coming soon.
- Other admin tools: resource library, course resources, YouTube import tool.

Behaviour that affects this launch
- Paid fulfilment needs the course to be Published. While the course is Draft, a verified Paystack payment returns a permanent error (course_not_published) and the buyer gets no access.
- Publishing a course emails and notifies students already enrolled, unless Coming soon is on. Coming soon blocks enrolment. Decide how to handle this before publishing (see production-plan.md).
- Sales page checkout can stay live while the course is Draft only if you accept that buyers cannot be fulfilled. Do not send traffic until the course is published.

Not verified
- Maximum video upload size and accepted video formats. Check in the admin upload dialog before recording. Hosting videos on YouTube unlisted or Vimeo avoids the question.
- Whether the quiz builder supports a per question explanation field and per quiz retry limits. Check when you build Quiz 1. If there is no explanation field, paste the explanation into the question text or into a lesson after the quiz.
- Whether short answer questions are auto marked or manual. Assume manual.
- Maximum PDF and spreadsheet size for downloadable files. The prepared files are small.
- How certificates are triggered. Check the certificate setting once quizzes exist.
- What notifications the platform sends on new lessons, comments and assignment grading. Review the notification settings before enrolling real students.
