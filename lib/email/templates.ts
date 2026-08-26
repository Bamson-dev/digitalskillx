const BRAND = "#dc2626";
const PLATFORM = "DigitalSkillX";
const PARENT = "Pdigital MarketStore Ltd";

function shell(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="font-size:18px;font-weight:bold;letter-spacing:0.02em;margin-bottom:20px;color:${BRAND}">${PLATFORM}</div>
    <div style="background:#fff;border-radius:12px;padding:36px 32px;border:1px solid #e2e8f0">
      <h1 style="font-size:22px;line-height:1.35;margin:0 0 20px;font-weight:bold;color:#0f172a">${title}</h1>
      <div style="font-size:15px;line-height:1.7;color:#334155">${body}</div>
      ${
        cta
          ? `<div style="margin-top:32px"><a href="${cta.url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:bold;font-size:15px">${cta.label}</a></div>`
          : ""
      }
    </div>
    <p style="font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;margin:28px 0 0">${PLATFORM} by ${PARENT} · RC 8015428 · Lagos, Nigeria</p>
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

  programCourseAdded: (p: {
    firstName: string;
    programName: string;
    courseTitle: string;
    shortDescription: string;
    description: string;
    instructorName: string;
    outcomes: string[];
    priceLabel: string;
    url: string;
  }) => {
    const programBit =
      p.programName && p.programName !== "DigitalSkillX"
        ? ` in <b>${p.programName}</b>`
        : "";
    const greeting = `<p style="margin:0 0 20px;padding:0;font-size:15px;line-height:1.7;color:#334155">Hi ${p.firstName}, a new course is now live on DigitalSkillX${programBit}.</p>`;

    const shortBlock = p.shortDescription.trim()
      ? `<p style="margin:0 0 20px;padding:0;font-size:15px;line-height:1.7;color:#334155">${p.shortDescription.trim()}</p>`
      : "";

    const longRaw = p.description.trim();
    const longDistinct =
      longRaw &&
      longRaw.replace(/\s+/g, " ") !== p.shortDescription.trim().replace(/\s+/g, " ")
        ? longRaw
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .filter(Boolean)
            .map(
              (block) =>
                `<p style="margin:0 0 16px;padding:0;font-size:15px;line-height:1.7;color:#475569">${block.replace(/\n/g, "<br/>")}</p>`,
            )
            .join("")
        : "";

    const outcomeHtml = p.outcomes.length
      ? `<div style="margin:28px 0 0;padding:20px 0 0;border-top:1px solid #e2e8f0">
          <p style="margin:0 0 12px;padding:0;font-size:14px;font-weight:bold;color:#0f172a;letter-spacing:0.02em">What you will learn</p>
          <ul style="margin:0;padding:0 0 0 20px;font-size:15px;line-height:1.75;color:#334155">
            ${p.outcomes.map((item) => `<li style="margin:0 0 8px;padding:0">${item}</li>`).join("")}
          </ul>
        </div>`
      : "";

    const metaBits = [
      p.instructorName ? `<b>Instructor:</b> ${p.instructorName}` : "",
      p.priceLabel ? `<b>Price:</b> ${p.priceLabel}` : "",
    ].filter(Boolean);
    const metaHtml = metaBits.length
      ? `<div style="margin:28px 0 0;padding:20px 0 0;border-top:1px solid #e2e8f0;font-size:14px;line-height:1.7;color:#64748b">${metaBits.join("<br/>")}</div>`
      : "";

    return {
      subject: `New DigitalSkillX course: ${p.courseTitle}`,
      html: shell(
        p.courseTitle,
        `${greeting}${shortBlock}${longDistinct}${outcomeHtml}${metaHtml}`,
        { label: "View the course", url: p.url },
      ),
    };
  },

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
