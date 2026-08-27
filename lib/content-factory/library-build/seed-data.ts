/** Default category and topic bank for Library Build Engine seeding. */

export type SeedCategory = {
  slug: string;
  name: string;
  priorityWeight: number;
  minimumCoverageGoal: number;
  preferredTarget: number;
  sortOrder: number;
  topics: Array<{
    slug: string;
    name: string;
    priorityWeight: number;
    discoveryQueries: string[];
  }>;
};

export const LIBRARY_BUILD_SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: "ai",
    name: "AI",
    priorityWeight: 90,
    minimumCoverageGoal: 8,
    preferredTarget: 35,
    sortOrder: 1,
    topics: [
      {
        slug: "generative-ai",
        name: "Generative AI",
        priorityWeight: 85,
        discoveryQueries: [
          "generative AI full course beginners",
          "ChatGPT tutorial complete course",
          "prompt engineering course playlist",
        ],
      },
      {
        slug: "machine-learning",
        name: "Machine Learning",
        priorityWeight: 80,
        discoveryQueries: [
          "machine learning full course beginners",
          "ML fundamentals tutorial playlist",
          "learn machine learning from scratch",
        ],
      },
    ],
  },
  {
    slug: "programming",
    name: "Programming",
    priorityWeight: 95,
    minimumCoverageGoal: 12,
    preferredTarget: 50,
    sortOrder: 2,
    topics: [
      {
        slug: "python",
        name: "Python",
        priorityWeight: 90,
        discoveryQueries: [
          "Python full course beginners",
          "Python complete tutorial",
          "Learn Python from scratch",
          "Python programming full course",
        ],
      },
      {
        slug: "javascript",
        name: "JavaScript",
        priorityWeight: 88,
        discoveryQueries: [
          "JavaScript full course beginners",
          "JavaScript complete tutorial playlist",
          "Learn JavaScript from scratch",
        ],
      },
      {
        slug: "react",
        name: "React",
        priorityWeight: 86,
        discoveryQueries: [
          "React full course beginners",
          "React complete tutorial playlist",
          "Learn React from scratch",
        ],
      },
      {
        slug: "html-css",
        name: "HTML & CSS",
        priorityWeight: 75,
        discoveryQueries: [
          "HTML CSS full course beginners",
          "web development HTML CSS tutorial playlist",
        ],
      },
      {
        slug: "nodejs",
        name: "Node.js",
        priorityWeight: 78,
        discoveryQueries: [
          "Node.js full course beginners",
          "Node.js backend tutorial playlist",
        ],
      },
      {
        slug: "sql",
        name: "SQL",
        priorityWeight: 72,
        discoveryQueries: ["SQL full course beginners", "SQL tutorial complete playlist"],
      },
      {
        slug: "git",
        name: "Git",
        priorityWeight: 70,
        discoveryQueries: ["Git tutorial full course beginners", "learn Git version control playlist"],
      },
    ],
  },
  {
    slug: "digital-marketing",
    name: "Digital Marketing",
    priorityWeight: 85,
    minimumCoverageGoal: 8,
    preferredTarget: 35,
    sortOrder: 3,
    topics: [
      {
        slug: "social-media-marketing",
        name: "Social Media Marketing",
        priorityWeight: 82,
        discoveryQueries: [
          "social media marketing full course",
          "digital marketing social media tutorial playlist",
        ],
      },
      {
        slug: "seo",
        name: "SEO",
        priorityWeight: 80,
        discoveryQueries: ["SEO full course beginners", "search engine optimization tutorial playlist"],
      },
    ],
  },
  {
    slug: "business",
    name: "Business",
    priorityWeight: 80,
    minimumCoverageGoal: 6,
    preferredTarget: 30,
    sortOrder: 4,
    topics: [
      {
        slug: "entrepreneurship",
        name: "Entrepreneurship",
        priorityWeight: 78,
        discoveryQueries: ["entrepreneurship course beginners", "start a business tutorial playlist"],
      },
      {
        slug: "project-management",
        name: "Project Management",
        priorityWeight: 75,
        discoveryQueries: ["project management full course", "PM fundamentals tutorial playlist"],
      },
    ],
  },
  {
    slug: "data",
    name: "Data",
    priorityWeight: 82,
    minimumCoverageGoal: 8,
    preferredTarget: 35,
    sortOrder: 5,
    topics: [
      {
        slug: "data-analysis",
        name: "Data Analysis",
        priorityWeight: 80,
        discoveryQueries: ["data analysis full course beginners", "Excel data analysis tutorial playlist"],
      },
      {
        slug: "data-science",
        name: "Data Science",
        priorityWeight: 82,
        discoveryQueries: ["data science full course beginners", "data science tutorial playlist"],
      },
    ],
  },
  {
    slug: "design",
    name: "Design",
    priorityWeight: 75,
    minimumCoverageGoal: 6,
    preferredTarget: 25,
    sortOrder: 6,
    topics: [
      {
        slug: "ui-ux",
        name: "UI/UX Design",
        priorityWeight: 78,
        discoveryQueries: ["UI UX design full course", "UX design tutorial playlist beginners"],
      },
      {
        slug: "graphic-design",
        name: "Graphic Design",
        priorityWeight: 72,
        discoveryQueries: ["graphic design full course beginners", "learn graphic design tutorial playlist"],
      },
    ],
  },
  {
    slug: "career-skills",
    name: "Career Skills",
    priorityWeight: 70,
    minimumCoverageGoal: 5,
    preferredTarget: 25,
    sortOrder: 7,
    topics: [
      {
        slug: "interview-skills",
        name: "Interview Skills",
        priorityWeight: 72,
        discoveryQueries: ["job interview skills course", "technical interview preparation playlist"],
      },
      {
        slug: "communication",
        name: "Communication",
        priorityWeight: 68,
        discoveryQueries: ["professional communication skills course", "workplace communication tutorial"],
      },
    ],
  },
  {
    slug: "finance",
    name: "Finance",
    priorityWeight: 72,
    minimumCoverageGoal: 5,
    preferredTarget: 20,
    sortOrder: 8,
    topics: [
      {
        slug: "personal-finance",
        name: "Personal Finance",
        priorityWeight: 74,
        discoveryQueries: ["personal finance full course beginners", "money management tutorial playlist"],
      },
      {
        slug: "investing",
        name: "Investing",
        priorityWeight: 70,
        discoveryQueries: ["investing for beginners full course", "stock market tutorial playlist"],
      },
    ],
  },
  {
    slug: "productivity",
    name: "Productivity",
    priorityWeight: 68,
    minimumCoverageGoal: 5,
    preferredTarget: 20,
    sortOrder: 9,
    topics: [
      {
        slug: "time-management",
        name: "Time Management",
        priorityWeight: 70,
        discoveryQueries: ["time management course beginners", "productivity tutorial playlist"],
      },
      {
        slug: "notion-tools",
        name: "Productivity Tools",
        priorityWeight: 65,
        discoveryQueries: ["Notion tutorial full course", "productivity tools tutorial playlist"],
      },
    ],
  },
  {
    slug: "technology",
    name: "Technology",
    priorityWeight: 78,
    minimumCoverageGoal: 6,
    preferredTarget: 30,
    sortOrder: 10,
    topics: [
      {
        slug: "cybersecurity",
        name: "Cybersecurity",
        priorityWeight: 80,
        discoveryQueries: ["cybersecurity full course beginners", "ethical hacking tutorial playlist"],
      },
      {
        slug: "cloud-computing",
        name: "Cloud Computing",
        priorityWeight: 76,
        discoveryQueries: ["cloud computing full course beginners", "AWS tutorial playlist beginners"],
      },
    ],
  },
];
