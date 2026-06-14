/** Default homepage content — merged with DB overrides on read. */
const WEBSITE_CMS_DEFAULTS = {
  seo: {
    title: "NextStep International | Study Abroad Consultancy Pakistan",
    description:
      "Pakistan's trusted study abroad consultancy. MBBS, BBA, MBA & IT admissions in Georgia, Azerbaijan, Russia, Turkey, China & more. Free consultation.",
  },
  notice: {
    enabled: true,
    text: "🎓 2026 Intakes Now Open — MBBS, Business & IT programs in Georgia. Limited seats available.",
    linkText: "Apply Free →",
    linkUrl: "/apply",
  },
  brand: {
    name: "NextStep International",
    tagline: "Study Abroad Experts",
  },
  contact: {
    whatsapp: "923142638901",
    whatsappDisplay: "+92 314 2638901",
    email: "nextstepinternational25@gmail.com",
    facebook: "https://www.facebook.com/profile.php?id=61589102386856",
  },
  hero: {
    pill: "Intakes Open — 2026",
    title: 'Your Gateway to <span>Higher Education</span> Abroad.',
    description:
      "Pakistan's trusted study abroad consultancy. We help students secure admission in top universities across Georgia, Azerbaijan, Russia, Turkey, China & more — honest guidance, zero hidden fees.",
    heroImage: "images/hero.webp",
    heroVideo: "",
    ctaPrimary: { text: "Start Free Application", url: "/apply" },
    ctaSecondary: { text: "Free Consultation", url: "whatsapp" },
    stats: [
      { value: "500+", label: "Students Placed", count: 500, suffix: "+" },
      { value: "15+", label: "Partner Unis", count: 15, suffix: "+" },
      { value: "24h", label: "Response Time" },
    ],
  },
  statsBand: [
    { value: "500+", label: "Students Placed", count: 500, suffix: "+" },
    { value: "$1,500", label: "Tuition From / Sem" },
    { value: "15+", label: "Partner Universities", count: 15, suffix: "+" },
    { value: "100%", label: "Free Consultation" },
  ],
  about: {
    eyebrow: "Who We Are",
    title: "Pakistan's most trusted<br>study abroad consultancy",
    lead: "NextStep International was built for one purpose: to give every student the same honest, thorough guidance that wealthy families get from expensive advisors — at zero cost to you.",
    cards: [
      {
        icon: "🎯",
        title: "Honest Counselling",
        text: "Real fees, real timelines. We'll tell you if a path isn't right for you — before you spend a penny.",
      },
      {
        icon: "📋",
        title: "Document Accuracy",
        text: "Your application and visa file reviewed end-to-end against university and embassy requirements.",
      },
      {
        icon: "🛬",
        title: "Door to Door",
        text: "Admission → visa → pre-departure → arrival day. One team, one coordinated plan, no gaps.",
      },
    ],
  },
  programs: {
    eyebrow: "Programmes",
    title: "Degrees we place students in",
    lead: "Click any card to see universities, fees, and exactly which documents you need.",
    items: [
      {
        id: "mbbs",
        name: "MBBS / MD — Medicine",
        badge: "🏥 Most Popular",
        fee: "$2,500",
        feeSub: "per semester",
        pills: ["⏱ 5–6 Years", "🌐 English Medium", "✅ PMC Recognised"],
        image: "",
      },
      {
        id: "bba",
        name: "BBA & MBA — Business",
        badge: "💼 Business",
        fee: "$1,750",
        feeSub: "per semester",
        pills: ["⏱ 4 Years", "🌐 English Medium", "🎓 HEC Recognised"],
        image: "",
      },
      {
        id: "it",
        name: "Computer Science & IT",
        badge: "💻 Technology",
        fee: "$1,500",
        feeSub: "per semester",
        pills: ["⏱ 4 Years", "🌐 English Medium", "💡 Top Tech Programs"],
        image: "",
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Common questions, straight answers",
    items: [
      {
        q: "Is IELTS required to study in Georgia?",
        a: "Not always. Several Georgian universities admit international students without IELTS through prior academic English or an internal assessment. We match you to programmes where your profile qualifies — don't let IELTS stop you from applying.",
      },
      {
        q: "What are the total costs — tuition, living, everything?",
        a: "Tuition ranges from $1,500 to $3,000 per semester depending on the programme and university. Living costs in Tbilisi average $300–$500 per month including rent, food, and transport. We provide a full cost breakdown for your specific situation during the free consultation.",
      },
      {
        q: "Are Georgian degrees recognised in Pakistan and worldwide?",
        a: "Recognition is determined by national regulators in your home country — not by any consultancy. Georgian medical universities are listed in WHO and FAIMER directories. We strongly advise families to verify licensing requirements with the relevant body (PMC in Pakistan) early in the process.",
      },
    ],
  },
  footer: {
    about:
      "Pakistan's trusted study abroad consultancy helping students secure admission in top universities across Georgia, Azerbaijan, Russia, Turkey, China & more. We do not issue visas or degrees.",
    newsletterTitle: "📬 Get free study abroad tips",
    newsletterSub: "Visa guides, scholarship news & admission deadlines — straight to WhatsApp",
  },
  videoGallery: {
    enabled: true,
    eyebrow: "Campus & Life",
    title: "See life abroad with NextStep students",
    items: [],
  },
  media: [],
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch ?? base;
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv && typeof pv === "object" && !Array.isArray(pv) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], pv);
    } else if (pv !== undefined) {
      out[key] = pv;
    }
  }
  return out;
}

function mergeWebsiteCmsContent(stored) {
  return deepMerge(WEBSITE_CMS_DEFAULTS, stored || {});
}

module.exports = {
  WEBSITE_CMS_DEFAULTS,
  mergeWebsiteCmsContent,
  deepMerge,
};
