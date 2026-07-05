const BRAND = "#dc2626";
const PLATFORM = "DigitalSkillX";
const PARENT = "Pdigital MarketStore Ltd";

function shell(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="font-size:18px;font-weight:bold;margin-bottom:16px;color:${BRAND}">${PLATFORM}</div>
    <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      <div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
      ${
        cta
          ? `<div style="margin-top:24px"><a href="${cta.url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${cta.label}</a></div>`
          : ""
      }
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:20px">${PLATFORM} by ${PARENT} · RC 8015428 · Lagos, Nigeria</p>
  </div></body></html>`;
}

export const emailTemplates = {
  welcome: (p: { name: string; email: string; password?: string; loginUrl: string }) => ({
    subject: "Welcome to DigitalSkillX",
    html: shell(
      `Welcome, ${p.name}!`,
      `Your learning account is ready.${
        p.password
          ? `<br/><br/>Here are your login details:<br/><b>Email:</b> ${p.email}<br/><b>Temporary password:</b> ${p.password}<br/><br/>Please change your password after your first login.`
          : ""
      }`,
      { label: "Go to your dashboard", url: p.loginUrl },
    ),
  }),

  enrollment: (p: { name: string; courseTitle: string; url: string }) => ({
    subject: `You're enrolled: ${p.courseTitle}`,
    html: shell(
      "New course unlocked",
      `Hi ${p.name}, you've been enrolled in <b>${p.courseTitle}</b>. Jump in whenever you're ready.`,
      { label: "Start learning", url: p.url },
    ),
  }),

  lessonUnlocked: (p: { name: string; lessonTitle: string; url: string }) => ({
    subject: `New lesson available: ${p.lessonTitle}`,
    html: shell(
      "A new lesson just unlocked",
      `Hi ${p.name}, <b>${p.lessonTitle}</b> is now available in your course.`,
      { label: "Watch now", url: p.url },
    ),
  }),

  courseCompletion: (p: { name: string; courseTitle: string; url: string }) => ({
    subject: `Congratulations on completing ${p.courseTitle}!`,
    html: shell(
      "Course complete 🎉",
      `Hi ${p.name}, you've completed <b>${p.courseTitle}</b>. Brilliant work!`,
      { label: "View your courses", url: p.url },
    ),
  }),

  certificateReady: (p: { name: string; courseTitle: string; url: string }) => ({
    subject: `Your certificate for ${p.courseTitle} is ready`,
    html: shell(
      "Your certificate is ready",
      `Hi ${p.name}, your certificate for <b>${p.courseTitle}</b> has been issued.`,
      { label: "Download certificate", url: p.url },
    ),
  }),

  assignmentFeedback: (p: { name: string; assignmentTitle: string; url: string }) => ({
    subject: `Feedback on: ${p.assignmentTitle}`,
    html: shell(
      "Your assignment was reviewed",
      `Hi ${p.name}, your submission for <b>${p.assignmentTitle}</b> has been graded. Open it to see your feedback.`,
      { label: "View feedback", url: p.url },
    ),
  }),

  assignmentPublished: (p: {
    firstName: string;
    courseTitle: string;
    assignmentTitle: string;
    instructionsSummary: string;
    dueDate: string | null;
    url: string;
  }) => ({
    subject: `New assignment: ${p.assignmentTitle}`,
    html: shell(
      `New assignment in ${p.courseTitle}`,
      `Hi ${p.firstName}, a new assignment <b>${p.assignmentTitle}</b> is now available in <b>${p.courseTitle}</b>.${
        p.instructionsSummary
          ? `<br/><br/><b>Instructions:</b> ${p.instructionsSummary}`
          : ""
      }${p.dueDate ? `<br/><br/><b>Due:</b> ${p.dueDate}` : ""}`,
      { label: "Submit assignment", url: p.url },
    ),
  }),

  inactivity: (p: { name: string; url: string }) => ({
    subject: "We miss you at DigitalSkillX",
    html: shell(
      "Pick up where you left off",
      `Hi ${p.name}, you haven't logged in for a few days. Your courses are waiting!`,
      { label: "Continue learning", url: p.url },
    ),
  }),

  purchaseConfirmation: (p: { name: string; courseTitle: string; url: string }) => ({
    subject: `Purchase confirmed: ${p.courseTitle}`,
    html: shell(
      "You're in!",
      `Hi ${p.name}, your payment was successful. <b>${p.courseTitle}</b> is now unlocked and ready to learn.`,
      { label: "Start learning", url: p.url },
    ),
  }),

  announcement: (p: { subject: string; body: string }) => ({
    subject: p.subject,
    html: shell(p.subject, p.body),
  }),
};
