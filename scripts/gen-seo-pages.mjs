/**
 * Generates the 8 long-tail SEO pages (/compress-to-*) from index.html.
 *
 * Single source of truth: index.html is the template. Re-run after any UI
 * change to the homepage (`npm run gen:seo`, runs automatically on build).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = 'https://pdfslim.app'; // TODO: confirm once the domain is registered

const PAGES = [
  {
    slug: 'compress-to-50kb', kb: 50, label: '50KB',
    use: 'government ID and visa uploads',
    why: 'Government ID services, visa applications and some of the strictest online portals cap document uploads at 50KB — one of the most demanding limits on the web. PDF Slim hits it by re-encoding pages step by step until the file fits, entirely on your device.',
    points: [
      'Government ID portals, visa applications and e-filing systems frequently demand documents under 50KB.',
      'At this size, images become noticeably softer — fine for on-screen reading, less ideal for print.',
      'If your PDF is mostly text, 50KB is usually achievable with no visible difference at all.',
    ],
  },
  {
    slug: 'compress-to-100kb', kb: 100, label: '100KB',
    use: 'government portals and e-filing',
    why: '100KB is the classic limit on government e-filing systems, HR portals and application forms worldwide. PDF Slim compresses your PDF to exactly 100KB in your browser — no uploads, no sign-up, no watermarks.',
    points: [
      'Government e-filing systems, HR portals and application forms worldwide frequently ask for documents under 100KB.',
      'Job and visa application portals love this limit too; a scanned ID or certificate usually fits cleanly.',
      'Have a whole folder to submit? Drop multiple files — batch mode slims them all to 100KB free.',
    ],
  },
  {
    slug: 'compress-to-200kb', kb: 200, label: '200KB',
    use: 'job applications and admission portals',
    why: 'Recruiting platforms, university admissions and insurance claim forms commonly cap uploads at 200KB. PDF Slim gets your PDF under the line while keeping text sharp and signatures legible.',
    points: [
      'A very common cap for resume, cover-letter and certificate uploads on job boards.',
      'A 5–10 page scanned document typically fits 200KB with perfectly readable text.',
      'Everything runs locally — your diplomas and ID scans never leave your device.',
    ],
  },
  {
    slug: 'compress-to-300kb', kb: 300, label: '300KB',
    use: 'scholarship and grant applications',
    why: 'Scholarship portals, grant systems and several college application platforms set their limit around 300KB — too soft-looking at 200KB, too strict for 500KB. PDF Slim hits this middle ground exactly.',
    points: [
      'A frequent middle-ground limit on scholarship, grant and fellowship portals.',
      'Keeps photos, stamps and signatures clearly legible while fitting strict forms.',
      'Set it and forget it: the target is pre-selected on this page — just drop your PDF.',
    ],
  },
  {
    slug: 'compress-to-500kb', kb: 500, label: '500KB',
    use: 'court e-filing and strict email gateways',
    why: 'Many court e-filing systems, corporate email gateways and older web forms cap attachments at 500KB. At this size, multi-page scans stay crisp — quality loss is barely visible.',
    points: [
      'Court e-filing and corporate mail gateways often enforce a 500KB per-attachment cap.',
      'Multi-page scanned contracts and forms remain comfortably readable at 500KB.',
      'Batch mode included: drop ten files, get ten files back — all under 500KB, all free.',
    ],
  },
  {
    slug: 'compress-to-1mb', kb: 1024, label: '1MB',
    use: 'the web\u2019s most common upload limit',
    why: '“Max 1MB” is the most common upload cap on the internet — from email-era attachment limits to modern SaaS and CRM forms. At 1MB, even photo-heavy PDFs keep near-original clarity.',
    points: [
      'The default answer when a portal just says “maximum 1 MB” — which is a lot of them.',
      'Photo-heavy documents keep near-original clarity at this size.',
      'No file-count limits: compress one PDF or a whole batch to 1MB, free.',
    ],
  },
  {
    slug: 'compress-to-2mb', kb: 2048, label: '2MB',
    use: 'slide decks, portfolios and design drafts',
    why: 'Pitch decks, design portfolios and image-rich reports usually need 2MB of breathing room — enough to preserve print-worthy detail while staying email-friendly. PDF Slim targets exactly that.',
    points: [
      'Slide decks and portfolios with images fit comfortably under 2MB.',
      'A common limit on shared drives, client portals and review tools.',
      'Preserves enough detail for printing while staying easy to send.',
    ],
  },
  {
    slug: 'compress-to-5mb', kb: 5120, label: '5MB',
    use: 'large scan batches and legacy portals',
    why: 'Older enterprise, healthcare and insurance portals often cap uploads at 5MB. For long scanned documents — medical records, claim files, archived paperwork — 5MB usually needs just one gentle compression pass.',
    points: [
      'Legacy enterprise and healthcare portals frequently set a 5MB ceiling.',
      'Dozens of scanned pages stay readable — ideal for records and archives.',
      'Files over 50MB work too; they just take a little longer on your device.',
    ],
  },
];

function fail(msg) {
  console.error(`gen-seo-pages: ${msg}`);
  process.exit(1);
}

function replaceOnce(haystack, needle, replacement, label) {
  const found = needle instanceof RegExp ? needle.test(haystack) : haystack.includes(needle);
  if (!found) fail(`pattern not found: ${label}`);
  return haystack.replace(needle, replacement);
}

const template = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

const HERO_H1 = '<h1>Slim your <span class="accent">PDF</span> in seconds.</h1>';
const HERO_SUB = '<p class="hero-sub">Compress any PDF to an exact target size — 100KB, 200KB, 1MB and more. Free, no sign-up, and your files never leave your browser.</p>';
const SIZES_NAV_RE = /<nav class="tools-nav" aria-label="Popular target sizes">[\s\S]*?<\/nav>/;

for (const page of PAGES) {
  const title = `Compress PDF to ${page.label} Online Free | PDF Slim`;
  const description = `Compress any PDF to exactly ${page.label} — free, no sign-up, no upload. Perfect for ${page.use}. Works entirely in your browser.`;

  const introSection = `
    <!-- ============ PAGE-SPECIFIC INTRO ============ -->
    <section class="notes">
      <h2>Why compress to ${page.label}?</h2>
      <div class="faq-list">
        <details class="faq-item" open>
          <summary>Why exactly ${page.label}?</summary>
          <p>${page.why}</p>
        </details>
        <details class="faq-item">
          <summary>Will my document still look good?</summary>
          <p>${page.points[0]}</p>
        </details>
        <details class="faq-item">
          <summary>Is it really free and unlimited?</summary>
          <p>${page.points[2]}</p>
        </details>
      </div>
    </section>`;

  const sizesNav = `<nav class="tools-nav" aria-label="Other target sizes">
        <span class="sizes-label">Other sizes:</span>
${PAGES.map((p) => `        <a href="../${p.slug}/"${p.slug === page.slug ? ' class="active"' : ''}>${p.label}</a>`).join('\n')}
      </nav>`;

  let html = template;

  // --- page identity ---
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, 'title');
  html = replaceOnce(html, '  <meta name="description"', `  <link rel="canonical" href="${DOMAIN}/${page.slug}/" />\n  <meta name="description"`, 'canonical');
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`);
  html = replaceOnce(html, '<body>', `<body data-default-kb="${page.kb}">`, 'body data attr');
  html = replaceOnce(html, HERO_H1, `<h1>Compress PDF to <span class="accent">${page.label}</span> online.</h1>`, 'h1');
  html = replaceOnce(html, HERO_SUB, `<p class="hero-sub">Free. No sign-up. Exactly ${page.label} — your files never leave your browser.</p>`, 'hero-sub');

  // --- relative paths (pages live one level deep) ---
  html = replaceOnce(html, 'href="./"', 'href="../"', 'home link');
  html = html.split('href="./').join('href="../');
  html = html.split('src="./').join('src="../');

  // --- replace generic notes section with page-specific intro ---
  if (!/<section class="notes">[\s\S]*?<\/section>/.test(html)) fail('notes section not found');
  html = html.replace(/[\s]*<section class="notes">[\s\S]*?<\/section>/, `${introSection}\n`);

  // --- swap "Popular sizes" nav for "Other sizes" (current page active) ---
  if (!SIZES_NAV_RE.test(html)) fail('popular sizes nav not found');
  html = html.replace(SIZES_NAV_RE, sizesNav);

  const outDir = resolve(ROOT, page.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
  console.log(`generated ${page.slug}/index.html`);
}

// --- sitemap.xml + robots.txt (domain placeholder until registered) ---
const today = new Date().toISOString().slice(0, 10);
const urls = [
  ['/', '1.0'],
  ['/merge/', '0.8'], ['/split/', '0.8'], ['/pdf-to-jpg/', '0.8'], ['/jpg-to-pdf/', '0.8'], ['/rotate/', '0.8'],
  ['/watermark/', '0.8'], ['/protect/', '0.8'], ['/page-numbers/', '0.8'], ['/organize/', '0.8'], ['/remove-metadata/', '0.8'],
  ['/what-is-pdf/', '0.7'],
  ...PAGES.map((p) => [`/${p.slug}/`, '0.9']),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, pri]) => `  <url><loc>${DOMAIN}${loc}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`).join('\n')}
</urlset>
`;
writeFileSync(resolve(ROOT, 'public', 'sitemap.xml'), sitemap, 'utf8');
writeFileSync(
  resolve(ROOT, 'public', 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`,
  'utf8'
);
console.log(`generated public/sitemap.xml (${urls.length} urls) + public/robots.txt — domain: ${DOMAIN}`);
