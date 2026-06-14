#!/usr/bin/env python3
"""Generate country study guide blog pages (one-time helper)."""
from pathlib import Path

STYLES_AND_FOOT = r"""  <style>
    :root{
      --navy:#0a1f44;--navy2:#1a3a6e;--navylight:#eef3fb;
      --gold:#b8960c;--goldlight:#fdf6e3;--goldbright:#d4a843;
      --ink:#0d1b2a;--soft:#3d4f63;--muted:#6b7280;
      --bg:#f7f9fc;--surface:#fff;--border:#e5e7eb;
      --r:12px;--rsm:8px;
      --serif:"DM Serif Display",Georgia,serif;
      --sans:"Inter",system-ui,sans-serif;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
    body{font-family:var(--sans);font-size:1rem;line-height:1.75;color:var(--soft);background:var(--bg);-webkit-font-smoothing:antialiased;overflow-x:hidden}
    a{color:var(--navy);text-decoration:none}
    a:hover{text-decoration:underline}
    .site-header{position:sticky;top:0;z-index:400;background:#fff;border-bottom:1px solid var(--border);box-shadow:0 2px 16px rgba(10,31,68,.07)}
    .hdr{max-width:860px;margin:0 auto;padding:0 24px;height:66px;display:flex;align-items:center;gap:16px}
    .brand img{height:36px;width:auto}
    .hdr-back{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:.875rem;font-weight:600;color:var(--navy);padding:8px 14px;border-radius:var(--rsm);border:1.5px solid var(--border);transition:.15s}
    .hdr-back:hover{background:var(--navylight)}
    .article-wrap{max-width:860px;margin:0 auto;padding:40px 20px 80px;display:grid;grid-template-columns:1fr 280px;gap:40px;align-items:start}
    @media(max-width:768px){.article-wrap{grid-template-columns:1fr}.sidebar{display:none}}
    .article-hero{grid-column:1/-1;background:linear-gradient(135deg,var(--navy),var(--navy2));border-radius:var(--r);padding:40px 36px;color:#fff;margin-bottom:8px}
    .article-cat{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);padding:5px 13px;border-radius:20px;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px}
    .article-title{font-family:var(--serif);font-size:clamp(1.6rem,3.5vw,2.4rem);font-weight:400;line-height:1.25;margin-bottom:14px}
    .article-meta{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.82rem;opacity:.75}
    .gold-line{width:48px;height:3px;background:linear-gradient(90deg,var(--goldbright),var(--gold));border-radius:2px;margin:14px 0}
    .article-tags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:28px}
    .atag{font-size:.75rem;font-weight:600;color:var(--navy);background:var(--navylight);border:1px solid rgba(10,31,68,.1);padding:4px 11px;border-radius:20px}
    article h2{font-family:var(--serif);font-size:1.6rem;font-weight:400;color:var(--ink);margin:36px 0 14px;line-height:1.3}
    article h3{font-size:1.05rem;font-weight:700;color:var(--ink);margin:24px 0 10px}
    article p{margin-bottom:14px;color:var(--soft)}
    article ul,article ol{padding-left:20px;margin-bottom:14px}
    article li{margin-bottom:7px;color:var(--soft)}
    article strong{color:var(--ink);font-weight:700}
    .info-box{background:var(--navylight);border-left:4px solid var(--navy);border-radius:0 var(--rsm) var(--rsm) 0;padding:16px 18px;margin:20px 0}
    .info-box p{margin:0;font-size:.9rem}
    .warn-box{background:var(--goldlight);border-left:4px solid var(--goldbright);border-radius:0 var(--rsm) var(--rsm) 0;padding:16px 18px;margin:20px 0}
    .warn-box p{margin:0;font-size:.9rem}
    .table-wrap{overflow-x:auto;margin:20px 0}
    table{width:100%;border-collapse:collapse;font-size:.875rem}
    th{background:var(--navy);color:#fff;padding:11px 14px;text-align:left;font-weight:600;font-size:.8rem}
    td{padding:11px 14px;border-bottom:1px solid var(--border);color:var(--soft)}
    tr:nth-child(even) td{background:var(--bg)}
    .cta-box{background:linear-gradient(135deg,var(--navy),var(--navy2));border-radius:var(--r);padding:28px;color:#fff;text-align:center;margin:32px 0}
    .cta-box h3{font-family:var(--serif);font-size:1.4rem;font-weight:400;margin-bottom:8px}
    .cta-box p{font-size:.9rem;opacity:.85;margin-bottom:18px}
    .cta-box .btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;background:linear-gradient(135deg,var(--goldbright),var(--gold));color:#fff;border-radius:var(--rsm);font-weight:700;font-family:var(--sans);font-size:.9375rem;text-decoration:none;transition:.2s}
    .cta-box .btn:hover{transform:translateY(-2px);text-decoration:none}
    .sidebar{position:sticky;top:80px}
    .sidebar-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:16px}
    .sidebar-card h4{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--navy);margin-bottom:14px}
    .sidebar-card ul{list-style:none;padding:0}
    .sidebar-card li{padding:8px 0;border-bottom:1px solid var(--border);font-size:.875rem}
    .sidebar-card li:last-child{border:none;padding-bottom:0}
    .sidebar-card a{color:var(--navy);font-weight:600}
    .sidebar-cta{background:var(--navy);color:#fff;border-radius:var(--r);padding:20px;text-align:center}
    .sidebar-cta p{font-size:.875rem;opacity:.85;margin-bottom:14px}
    .sidebar-cta a{display:block;padding:11px;background:var(--goldbright);color:#fff;border-radius:var(--rsm);font-weight:700;font-size:.875rem;text-decoration:none}
    .wa-float{position:fixed;bottom:calc(24px + env(safe-area-inset-bottom));right:24px;z-index:500}
    .wa-pulse{position:absolute;inset:-4px;border-radius:50%;border:3px solid rgba(37,211,102,.5);animation:waPulse 2s ease-out infinite;pointer-events:none}
    @keyframes waPulse{0%{opacity:1;transform:scale(1)}70%{opacity:0;transform:scale(1.5)}100%{opacity:0;transform:scale(1.5)}}
    .wa-btn{position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;background:linear-gradient(135deg,#25d366,#128c7e);border-radius:50%;box-shadow:0 6px 24px rgba(37,211,102,.45);text-decoration:none;transition:transform .2s}
    .wa-btn:hover{transform:scale(1.08)}
    .wa-btn svg{width:28px;height:28px;fill:#fff}
    .wa-label{position:absolute;right:64px;top:50%;transform:translateY(-50%);background:var(--ink);color:#fff;font-size:.8rem;font-weight:600;padding:5px 12px;border-radius:20px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s}
    .wa-float:hover .wa-label{opacity:1}
  </style>
</head>
<body>
  <header class="site-header">
    <div class="hdr">
      <a class="brand" href="/"><img src="images/logo.svg" height="36" alt="NextStep International"></a>
      <a class="hdr-back" href="blog.html">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        All Articles
      </a>
    </div>
  </header>
  <div class="article-wrap">
    <div class="article-hero">
      <div class="article-cat">{cat_emoji} {cat_label}</div>
      <h1 class="article-title">{title}</h1>
      <div class="gold-line"></div>
      <div class="article-meta">
        <span>By NextStep International</span><span>·</span><span>June 2025</span><span>·</span><span>{read_time} min read</span>
      </div>
    </div>
    <article>
      {body}
      <div class="cta-box">
        <h3>Ready to Study in {country}?</h3>
        <p>Get a free consultation from our expert advisors. We guide you from application to arrival — at zero cost to you.</p>
        <a class="btn" href="apply.html">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
          Apply Now — It's Free
        </a>
      </div>
    </article>
    <aside class="sidebar">
      <div class="sidebar-card">
        <h4>Country Guides</h4>
        <ul>
          <li><a href="blog-mbbs-georgia.html">Study in Georgia</a></li>
          <li><a href="blog-study-azerbaijan.html">Study in Azerbaijan</a></li>
          <li><a href="blog-study-russia.html">Study in Russia</a></li>
          <li><a href="blog-study-turkey.html">Study in Turkey</a></li>
          <li><a href="blog-study-china.html">Study in China</a></li>
          <li><a href="blog-study-kazakhstan.html">Study in Kazakhstan</a></li>
        </ul>
      </div>
      <div class="sidebar-cta">
        <h4 style="font-family:var(--serif);font-size:1rem;font-weight:400;margin-bottom:8px;color:#fff">Get Free Guidance</h4>
        <p>Our advisors reply within 24 hours — no fees, no pressure.</p>
        <a href="apply.html">Apply Now — Free</a>
      </div>
    </aside>
  </div>
  <div class="wa-float">
    <div class="wa-pulse"></div>
    <a class="wa-btn" href="https://wa.me/923142638901?text=Assalam%20o%20Alaikum%2C%20I%20want%20to%20know%20about%20study%20abroad%20programs" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
      <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.532 5.866L.057 23.857a.5.5 0 00.606.606l6.056-1.467A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.013-1.375l-.36-.213-3.733.904.921-3.648-.233-.376A9.818 9.818 0 1112 21.818z"/></svg>
    </a>
    <div class="wa-label">Free consultation</div>
  </div>
</body>
</html>"""

COUNTRIES = [
    {
        "slug": "blog-study-azerbaijan",
        "country": "Azerbaijan",
        "flag": "🇦🇿",
        "programs": "MBBS · Engineering",
        "fee_from": "$3,500/yr",
        "cat_emoji": "🇦🇿",
        "cat_label": "Study in Azerbaijan",
        "title": "Study in Azerbaijan for Pakistani Students — Complete 2025 Guide",
        "meta_desc": "Complete guide to studying MBBS and Engineering in Azerbaijan for Pakistani students. Top universities, fees from $3,500/yr, admission process and visa guide.",
        "keywords": "study in azerbaijan, mbbs azerbaijan pakistani students, azerbaijan university admission, engineering azerbaijan, study abroad azerbaijan pakistan",
        "read_time": "7",
        "intro": "Azerbaijan is a rising destination for Pakistani students seeking affordable MBBS and Engineering degrees in a Muslim-majority country with a growing international student community in Baku.",
        "why": [
            "Affordable tuition — from $3,500 per year total cost",
            "English and Russian-medium programs available",
            "Muslim-majority country with halal food widely available",
            "Growing Pakistani student community in Baku",
            "WHO-listed medical universities for MBBS",
            "Safe, modern capital city with good infrastructure",
        ],
        "universities": [
            ("Azerbaijan Medical University", "MBBS", "$3,500 – $5,000/yr", "6 years", "WHO, PMC"),
            ("Baku State University", "Engineering", "$2,500 – $4,000/yr", "4 years", "HEC recognised"),
            ("ADA University", "Business / IT", "$4,000 – $6,000/yr", "4 years", "International"),
            ("Azerbaijan University of Architecture", "Engineering", "$2,800 – $4,200/yr", "4 years", "HEC recognised"),
        ],
        "fees": [
            ("Tuition fee", "$2,500 – $5,000 per year"),
            ("Accommodation", "$120 – $250 per month"),
            ("Food & living", "$150 – $300 per month"),
            ("Total annual cost", "From $3,500/year"),
        ],
        "eligibility": [
            "FSc Pre-Medical or Pre-Engineering (50%+ marks)",
            "Valid Pakistani passport",
            "Age 17 or above",
            "IELTS often not required for foundation or English-track programs",
        ],
        "faq": [
            ("Is MBBS from Azerbaijan recognised in Pakistan?", "Medical degrees from WHO-listed universities can be recognised by PMC after passing the licensing exam. Always verify your university is on the current PMC list before applying."),
            ("Do I need IELTS for Azerbaijan?", "Many universities accept students without IELTS, especially for Russian-medium or internal English assessment routes."),
            ("Is Azerbaijan safe for Pakistani students?", "Yes. Baku is a safe, modern city. There is a growing Pakistani and Muslim student community."),
        ],
    },
    {
        "slug": "blog-study-russia",
        "country": "Russia",
        "flag": "🇷🇺",
        "programs": "MBBS · Engineering",
        "fee_from": "$3,000/yr",
        "cat_emoji": "🇷🇺",
        "cat_label": "Study in Russia",
        "title": "Study in Russia for Pakistani Students — MBBS & Engineering Guide 2025",
        "meta_desc": "Guide to MBBS and Engineering in Russia for Pakistani students. Affordable fees from $3,000/yr, top medical universities, admission steps and visa process.",
        "keywords": "mbbs in russia, study in russia pakistani students, russia medical university, engineering russia, study abroad russia pakistan",
        "read_time": "8",
        "intro": "Russia has long been a popular choice for Pakistani MBBS students. With decades of experience hosting international medical students, Russian universities offer affordable tuition and globally recognised degrees.",
        "why": [
            "Very affordable — from $3,000 per year",
            "Long history of training international MBBS students",
            "Many WHO and PMC recognised medical universities",
            "No entrance exam at most partner universities",
            "Strong engineering and technical programs",
            "Large Pakistani student diaspora in major cities",
        ],
        "universities": [
            ("Kazan Federal University", "MBBS", "$3,500 – $5,500/yr", "6 years", "WHO, PMC"),
            ("Peoples' Friendship University (RUDN)", "MBBS / Engineering", "$4,000 – $6,000/yr", "6 years", "WHO, PMC"),
            ("Crimea Federal University", "MBBS", "$3,000 – $4,500/yr", "6 years", "WHO"),
            ("Moscow Institute of Physics & Technology", "Engineering", "$4,500 – $7,000/yr", "4 years", "HEC recognised"),
        ],
        "fees": [
            ("Tuition fee", "$3,000 – $6,000 per year"),
            ("Accommodation (hostel)", "$50 – $150 per month"),
            ("Food & living", "$150 – $350 per month"),
            ("Total annual cost", "From $3,000/year"),
        ],
        "eligibility": [
            "FSc Pre-Medical or Pre-Engineering (50%+ marks)",
            "Valid Pakistani passport",
            "MDCAT recommended for MBBS (PMC requirement)",
            "Some programs taught in English; others require preparatory Russian year",
        ],
        "faq": [
            ("Is Russian MBBS valid in Pakistan?", "Yes, from WHO-listed universities after passing the PMC licensing exam. Verify PMC recognition before enrolling."),
            ("Is the medium of instruction English?", "Many universities offer English-medium MBBS. Some require a one-year Russian preparatory course first — we clarify this during consultation."),
            ("How cold is Russia?", "Winters are cold in most cities, but university hostels are heated. Students adapt quickly; our pre-departure briefing covers what to expect."),
        ],
    },
    {
        "slug": "blog-study-turkey",
        "country": "Turkey",
        "flag": "🇹🇷",
        "programs": "Business · Law · IT",
        "fee_from": "$4,500/yr",
        "cat_emoji": "🇹🇷",
        "cat_label": "Study in Turkey",
        "title": "Study in Turkey for Pakistani Students — Business, Law & IT Guide 2025",
        "meta_desc": "Complete guide to studying Business, Law and IT in Turkey for Pakistani students. Top universities, fees from $4,500/yr, scholarships and admission process.",
        "keywords": "study in turkey pakistani students, turkey university admission, business turkey, law turkey, it turkey istanbul, study abroad turkey",
        "read_time": "7",
        "intro": "Turkey combines European-quality education with Islamic culture, making it ideal for Pakistani students in Business, Law, and IT. Istanbul and Ankara host world-ranked universities with English-taught programs.",
        "why": [
            "Muslim-majority country — familiar culture and halal food",
            "English-taught Business, Law and IT programs",
            "Scholarships available (Türkiye Bursları and university awards)",
            "Strategic location between Europe and Asia",
            "Modern campuses in Istanbul, Ankara and Izmir",
            "Growing job market for bilingual graduates",
        ],
        "universities": [
            ("Istanbul University", "Law / Business", "$4,000 – $7,000/yr", "4 years", "HEC recognised"),
            ("Middle East Technical University (METU)", "Engineering / IT", "$5,000 – $8,000/yr", "4 years", "Top ranked"),
            ("Istanbul Bilgi University", "Business / Law", "$4,500 – $6,500/yr", "4 years", "International"),
            ("Ankara University", "Business / IT", "$3,500 – $5,500/yr", "4 years", "HEC recognised"),
        ],
        "fees": [
            ("Tuition fee", "$3,500 – $8,000 per year"),
            ("Accommodation", "$150 – $350 per month"),
            ("Food & living", "$200 – $400 per month"),
            ("Total annual cost", "From $4,500/year"),
        ],
        "eligibility": [
            "Intermediate (FSc / FA / ICS) with 60%+ marks",
            "Valid Pakistani passport",
            "Some universities require SAT or internal entrance test",
            "IELTS 5.5–6.0 for English programs at select universities",
        ],
        "faq": [
            ("Can I study Law in Turkey in English?", "Yes. Several Turkish universities offer English-medium Law (LLB) programs for international students."),
            ("Are Turkish degrees recognised in Pakistan?", "Degrees from accredited Turkish universities are generally recognised by HEC. We verify recognition for your specific program."),
            ("Are scholarships available?", "Yes — Türkiye Bursları (government scholarship) and partial university scholarships. NextStep helps identify options for your profile."),
        ],
    },
    {
        "slug": "blog-study-china",
        "country": "China",
        "flag": "🇨🇳",
        "programs": "MBBS · Engineering",
        "fee_from": "$3,000/yr",
        "cat_emoji": "🇨🇳",
        "cat_label": "Study in China",
        "title": "Study in China for Pakistani Students — MBBS & Engineering Guide 2025",
        "meta_desc": "Guide to MBBS and Engineering in China for Pakistani students. English-medium programs, fees from $3,000/yr, CSC scholarships and admission steps.",
        "keywords": "mbbs in china, study in china pakistani students, china medical university english, engineering china, csc scholarship pakistan",
        "read_time": "8",
        "intro": "China offers some of the most affordable English-medium MBBS programs in the world, plus strong Engineering faculties. Pakistani students benefit from CSC scholarships and a large existing community.",
        "why": [
            "Very affordable — from $3,000 per year",
            "English-medium MBBS at 45+ WHO-listed universities",
            "CSC (Chinese Government) scholarships available",
            "Advanced infrastructure and modern labs",
            "Large Pakistani student community",
            "Strong engineering and technology programs",
        ],
        "universities": [
            ("China Medical University", "MBBS", "$3,500 – $5,500/yr", "6 years", "WHO, PMC"),
            ("Jilin University", "MBBS / Engineering", "$3,000 – $5,000/yr", "6 years", "WHO, PMC"),
            ("Nanjing Medical University", "MBBS", "$4,000 – $6,000/yr", "6 years", "WHO, PMC"),
            ("Tsinghua University", "Engineering", "$5,000 – $10,000/yr", "4 years", "World top ranked"),
        ],
        "fees": [
            ("Tuition fee", "$3,000 – $6,000 per year"),
            ("Accommodation (hostel)", "$50 – $120 per month"),
            ("Food & living", "$100 – $250 per month"),
            ("Total annual cost", "From $3,000/year"),
        ],
        "eligibility": [
            "FSc Pre-Medical or Pre-Engineering (60%+ marks for top unis)",
            "Valid Pakistani passport",
            "MDCAT required for PMC recognition pathway",
            "Age 18–25 for most MBBS programs",
        ],
        "faq": [
            ("Is MBBS in China taught in English?", "Yes. Over 45 Chinese medical universities offer fully English-medium MBBS programs for international students."),
            ("Can I get a scholarship?", "Yes. CSC scholarships cover tuition, accommodation and stipend. Competition is high — we help with application timing and documents."),
            ("Is China safe for Pakistani students?", "Yes. Universities have dedicated international student offices. Pakistani communities exist in most major student cities."),
        ],
    },
    {
        "slug": "blog-study-kazakhstan",
        "country": "Kazakhstan",
        "flag": "🇰🇿",
        "programs": "MBBS · Business",
        "fee_from": "$2,500/yr",
        "cat_emoji": "🇰🇿",
        "cat_label": "Study in Kazakhstan",
        "title": "Study in Kazakhstan for Pakistani Students — MBBS & Business Guide 2025",
        "meta_desc": "Affordable study in Kazakhstan for Pakistani students. MBBS and Business programs from $2,500/yr, top universities in Almaty and Astana, admission guide.",
        "keywords": "mbbs kazakhstan, study in kazakhstan pakistani students, kazakhstan medical university, business kazakhstan, study abroad kazakhstan",
        "read_time": "7",
        "intro": "Kazakhstan is one of the most budget-friendly destinations for Pakistani students. With MBBS and Business programs from just $2,500 per year, it suits families looking for quality education at the lowest cost.",
        "why": [
            "Lowest fees in our portfolio — from $2,500/year",
            "Muslim-majority country with halal food",
            "English-medium MBBS at several medical universities",
            "Safe, stable country in Central Asia",
            "Growing Pakistani student community",
            "Easy visa process for Pakistani nationals",
        ],
        "universities": [
            ("Kazakh National Medical University", "MBBS", "$3,500 – $5,000/yr", "6 years", "WHO, PMC"),
            ("Al-Farabi Kazakh National University", "Business / IT", "$2,500 – $4,000/yr", "4 years", "HEC recognised"),
            ("Astana Medical University", "MBBS", "$3,000 – $4,500/yr", "6 years", "WHO"),
            ("Nazarbayev University", "Business / Engineering", "$4,000 – $8,000/yr", "4 years", "International"),
        ],
        "fees": [
            ("Tuition fee", "$2,500 – $5,000 per year"),
            ("Accommodation", "$80 – $180 per month"),
            ("Food & living", "$100 – $200 per month"),
            ("Total annual cost", "From $2,500/year"),
        ],
        "eligibility": [
            "FSc Pre-Medical or Intermediate (50%+ marks)",
            "Valid Pakistani passport",
            "No IELTS at most partner universities",
            "MDCAT recommended for MBBS (PMC pathway)",
        ],
        "faq": [
            ("Why is Kazakhstan so affordable?", "Government-subsidised education and lower living costs make Kazakhstan one of the cheapest study abroad options for Pakistani students."),
            ("Is MBBS from Kazakhstan recognised?", "Degrees from WHO-listed universities are eligible for PMC licensing after passing the exam. We confirm recognition before placement."),
            ("Which city is best — Almaty or Astana?", "Both have good universities. Almaty is larger with more amenities; Astana is the capital with newer campuses. We match you based on program and budget."),
        ],
    },
]


def build_body(c):
    tags = f"""<div class="article-tags">
        <span class="atag">#{c['country']}</span>
        <span class="atag">#Pakistani Students</span>
        <span class="atag">#{c['programs'].split(' · ')[0]}</span>
        <span class="atag">#Study Abroad</span>
        <span class="atag">#Admission 2025</span>
      </div>"""
    intro = f"""<p><strong>{c['intro']}</strong></p>
      <p>NextStep International places Pakistani students in top {c['country']} universities every year. In this guide: why {c['country']}, top universities, fees (from {c['fee_from']}), eligibility and how to apply.</p>
      <div class="info-box"><p>💡 <strong>Quick Fact:</strong> Programs available: {c['programs']}. Total cost from {c['fee_from']}. Free consultation with NextStep International.</p></div>"""
    why = "<h2>Why Choose " + c["country"] + "?</h2><ul>" + "".join(f"<li>✅ {x}</li>" for x in c["why"]) + "</ul>"
    uni_rows = "".join(f"<tr><td>{u[0]}</td><td>{u[1]}</td><td>{u[2]}</td><td>{u[3]}</td><td>{u[4]}</td></tr>" for u in c["universities"])
    unis = f"""<h2>Top Universities in {c['country']}</h2>
      <div class="table-wrap"><table><thead><tr><th>University</th><th>Program</th><th>Annual Fee</th><th>Duration</th><th>Recognition</th></tr></thead><tbody>{uni_rows}</tbody></table></div>
      <div class="warn-box"><p>⚠️ <strong>Important:</strong> Always verify PMC/HEC recognition before applying. NextStep International confirms recognition for every placement.</p></div>"""
    fee_rows = "".join(f"<li><strong>{f[0]}:</strong> {f[1]}</li>" for f in c["fees"])
    fees = f"<h2>Fees & Cost of Living</h2><ul>{fee_rows}</ul>"
    elig = "<h2>Eligibility Requirements</h2><ul>" + "".join(f"<li>✅ {x}</li>" for x in c["eligibility"]) + "</ul>"
    process = f"""<h2>Admission Process</h2>
      <ol>
        <li><strong>Free Consultation:</strong> WhatsApp NextStep International — we review your profile and recommend the best {c['country']} university.</li>
        <li><strong>Apply:</strong> Submit documents via our free online application form.</li>
        <li><strong>Offer Letter:</strong> Receive university admission within 2–4 weeks.</li>
        <li><strong>Visa:</strong> We prepare your student visa file and guide you through embassy requirements.</li>
        <li><strong>Departure:</strong> Pre-departure briefing, accommodation guidance and arrival support.</li>
      </ol>"""
    docs = """<h2>Documents Required</h2><ul>
        <li>Matric and Intermediate certificates & mark sheets</li>
        <li>Valid passport (minimum 1 year validity)</li>
        <li>Passport-size photographs</li>
        <li>MDCAT result (for MBBS applicants)</li>
        <li>Medical fitness certificate</li>
        <li>Character certificate from school/college</li>
      </ul>"""
    faq = "<h2>Frequently Asked Questions</h2>" + "".join(f"<h3>{q}</h3><p>{a}</p>" for q, a in c["faq"])
    return tags + intro + why + unis + fees + elig + process + docs + faq


def render(c):
    slug = c["slug"]
    url = f"https://www.nextstepinternationals.com/{slug}.html"
    head = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{c['title']} | NextStep International</title>
  <meta name="description" content="{c['meta_desc']}">
  <meta name="keywords" content="{c['keywords']}">
  <meta name="author" content="NextStep International">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#0a1f44">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{c['title']}">
  <meta property="og:description" content="{c['meta_desc']}">
  <meta property="og:image" content="https://www.nextstepinternationals.com/images/og-image.jpg">
  <meta property="og:site_name" content="NextStep International">
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"Article","headline":"{c['title']}","description":"{c['meta_desc']}","author":{{"@type":"Organization","name":"NextStep International","url":"https://www.nextstepinternationals.com"}},"publisher":{{"@type":"Organization","name":"NextStep International","logo":{{"@type":"ImageObject","url":"https://www.nextstepinternationals.com/images/logo.svg"}}}},"datePublished":"2025-06-01","dateModified":"2026-06-14","mainEntityOfPage":"{url}","image":"https://www.nextstepinternationals.com/images/og-image.jpg","keywords":"{c['keywords']}"}}
  </script>
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"Home","item":"https://www.nextstepinternationals.com/"}},{{"@type":"ListItem","position":2,"name":"Blog","item":"https://www.nextstepinternationals.com/blog.html"}},{{"@type":"ListItem","position":3,"name":"Study in {c['country']}","item":"{url}"}}]}}
  </script>
  <link rel="icon" href="images/logo.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&display=swap"></noscript>
"""
    body = build_body(c)
    tail = STYLES_AND_FOOT.replace("{cat_emoji}", c["cat_emoji"]).replace("{cat_label}", c["cat_label"]).replace("{title}", c["title"]).replace("{read_time}", c["read_time"]).replace("{body}", body).replace("{country}", c["country"])
    return head + tail


def main():
    root = Path(__file__).resolve().parent.parent
    for c in COUNTRIES:
        path = root / f"{c['slug']}.html"
        path.write_text(render(c), encoding="utf-8")
        print("Wrote", path.name)


if __name__ == "__main__":
    main()
