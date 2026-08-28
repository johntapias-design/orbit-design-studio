import { writeFileSync } from 'node:fs';

const s = (base = {}, tablet, mobile) => ({ base, ...(tablet ? { tablet } : {}), ...(mobile ? { mobile } : {}) });
const n = (id, type, styles = {}, extra = {}) => ({ id, type, name: extra.name || id, ...extra, styles: styles.base ? styles : s(styles), ...(extra.children ? {} : { children: [] }) });
const h = (id, content, level, styles = {}, extra = {}) => n(id, 'heading', styles, { ...extra, content, level });
const t = (id, content, styles = {}, extra = {}) => n(id, 'text', styles, { ...extra, content });
const box = (id, children, styles = {}, extra = {}) => n(id, extra.type || 'container', styles, { ...extra, children });
const button = (id, content, href = '#contact', extra = {}) => n(id, 'button', s({}), { ...extra, content, href, globalClassIds: ['class-pill-button'] });

function svgData(label, start, end, motif = 'orb') {
  const art = motif === 'lines'
    ? '<g stroke="rgba(255,255,255,.8)" stroke-width="3">' + Array.from({ length: 18 }, (_, i) => `<path d="M${20 + i * 16} 30 Q${80 + i * 8} 160 ${20 + i * 16} 290"/>`).join('') + '</g>'
    : motif === 'bag'
      ? '<path d="M105 92h110l22 170H83z" fill="#181818"/><path d="M125 100c0-58 70-58 70 0" fill="none" stroke="#181818" stroke-width="12"/><text x="160" y="214" fill="white" font-size="72" font-family="Arial" text-anchor="middle">.us</text>'
      : motif === 'portrait'
        ? '<circle cx="160" cy="118" r="60" fill="#d3a67d"/><path d="M68 304c10-100 52-132 92-132s82 32 92 132" fill="#202530"/><path d="M96 86c18-62 118-70 136 6-40-18-92-22-136-6" fill="#294a78"/>'
        : '<circle cx="225" cy="95" r="112" fill="rgba(255,255,255,.23)"/><circle cx="92" cy="242" r="96" fill="rgba(0,0,0,.22)"/><path d="M30 250L270 48" stroke="rgba(255,255,255,.75)" stroke-width="18"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="320" height="320" rx="22" fill="url(#g)"/>${art}<text x="24" y="294" fill="white" font-size="13" font-family="Arial" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const assets = [
  ['asset-device', 'Brand device', '#0d0d0f', '#444952', 'lines'],
  ['asset-bag', 'Identity bag', '#f1f3f5', '#dce4ea', 'bag'],
  ['asset-chat', 'Chat Genius', '#090a0d', '#2445e4', 'lines'],
  ['asset-field', 'Field Type', '#eef1ff', '#6275e8', 'lines'],
  ['asset-detail', 'Identity detail', '#d8dce8', '#7382a6', 'orb'],
  ['asset-founder', 'Creative founder', '#dce4e7', '#7795b4', 'portrait'],
].map(([id, alt, a, b, motif]) => ({ id, name: alt, type: 'image', src: svgData(alt, a, b, motif), alt }));
const assetSrc = id => assets.find(asset => asset.id === id).src;
const image = (id, assetId, styles = {}) => n(id, 'image', styles, { src: assetSrc(assetId), alt: assets.find(asset => asset.id === assetId).alt });

const container = { width: '100%', maxWidth: '1200px', marginLeft: 'auto', marginRight: 'auto' };
const sectionPad = s({ width: '100%', paddingTop: '96px', paddingRight: '48px', paddingBottom: '96px', paddingLeft: '48px', background: 'var(--color-paper)', color: 'var(--color-ink)' }, { paddingRight: '32px', paddingLeft: '32px' }, { paddingTop: '64px', paddingRight: '20px', paddingBottom: '64px', paddingLeft: '20px' });
const largeTitle = s({ color: 'var(--color-blue)', fontFamily: 'var(--typography-sans)', fontSize: '104px', fontWeight: 700, lineHeight: .9, letterSpacing: '-6px' }, { fontSize: '76px' }, { fontSize: '52px', letterSpacing: '-3px' });
const labelStyle = { color: 'var(--color-ink)', fontFamily: 'var(--typography-mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' };
const cardBase = { borderRadius: '18px', borderWidth: '1px', borderColor: 'var(--color-line)', overflow: 'hidden' };

const serviceRows = [
  ['01.', 'Brand Identity', 'We specialize in crafting unique brand identities that resonate with audiences.'],
  ['02.', 'UI/UX Design', 'Digital experiences shaped around clarity, usability and a strong visual point of view.'],
  ['03.', 'Development', 'Fast, responsive websites prepared for production and future growth.'],
].map(([number, title, copy], index) => box(`service-row-${index + 1}`, [
  t(`service-number-${index + 1}`, number, { fontFamily: 'var(--typography-mono)', fontSize: '12px', color: 'var(--color-muted)' }),
  box(`service-copy-${index + 1}`, [h(`service-title-${index + 1}`, title, 3, { fontSize: '30px', lineHeight: 1, fontWeight: 600 }), ...(index === 0 ? [t('service-description', copy, { maxWidth: '620px', fontSize: '14px', lineHeight: 1.55, color: 'var(--color-muted)' }), box('service-tags', ['Strategy', 'Logo Design', 'Package Design', 'Typography', 'Color Scheme'].map((tag, tagIndex) => t(`service-tag-${tagIndex + 1}`, tag, { paddingTop: '7px', paddingRight: '10px', paddingBottom: '7px', paddingLeft: '10px', borderRadius: '999px', background: 'var(--color-soft)', fontSize: '10px', fontWeight: 700 })), { display: 'flex', flexWrap: 'wrap', gap: '7px' })] : [])], { display: 'flex', direction: 'column', gap: '18px' }),
  t(`service-toggle-${index + 1}`, index === 0 ? '−' : '+', { fontSize: '25px', textAlign: 'right' }),
], s({ display: 'grid', gridTemplateColumns: '52px 1fr 32px', gap: '18px', paddingTop: '28px', paddingBottom: '28px', borderWidth: '1px', borderColor: 'var(--color-line)' }, null, { gridTemplateColumns: '38px 1fr 24px', gap: '10px' })));

const milestones = [['15+', 'Years of Experience'], ['50+', 'Projects Completed'], ['20+', 'Clients Worldwide'], ['100%', 'Customer Satisfaction']].map(([value, copy], index) => box(`milestone-${index + 1}`, [h(`milestone-value-${index + 1}`, value, 3, { fontSize: '58px', lineHeight: 1, fontWeight: 600 }), t(`milestone-copy-${index + 1}`, copy, { fontSize: '11px', color: 'var(--color-muted)' })], { display: 'flex', direction: 'column', gap: '10px' }));
const logos = ['coinbase', 'slack', 'Webflow', 'Spotify'].map((logo, index) => box(`client-${index + 1}`, [t(`client-name-${index + 1}`, logo, { fontSize: '18px', fontWeight: 700, textAlign: 'center' })], { minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderWidth: '1px', borderColor: 'var(--color-line)', borderRadius: '14px', background: 'var(--color-white)' }));

const nodes = [
  box('hero', [
    box('hero-inner', [
      box('nav', [t('brand-small', 'Boulevard™', { color: 'var(--color-white)', fontSize: '18px', fontWeight: 700 }), t('time', 'France · 03:47 PM (GMT+2)', { color: 'var(--color-white)', fontSize: '11px' }), t('nav-links', 'About  Service  Project  Team  Reviews', { color: 'var(--color-white)', fontSize: '11px' }), t('nav-contact', 'Get Connected', { color: 'var(--color-white)', fontSize: '11px', textDecoration: 'underline' })], s({ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr auto', gap: '24px', alignItems: 'center' }, { gridTemplateColumns: '1fr auto' }, { gridTemplateColumns: '1fr auto' })),
      box('hero-content', [
        box('hero-message', [t('hero-label', 'AGENCY THAT MOVES CULTURE', { color: 'var(--color-white)', fontFamily: 'var(--typography-mono)', fontSize: '11px', fontWeight: 700 }), h('hero-subtitle', 'Design studio that not only creates digital products but also experiences.', 2, s({ maxWidth: '460px', color: 'var(--color-white)', fontSize: '36px', lineHeight: 1, fontWeight: 600 }, null, { fontSize: '27px' })), button('hero-button', "Let's Collaborate  →")], { display: 'flex', direction: 'column', alignItems: 'flex-start', gap: '22px' }),
        t('hero-scroll', 'Scroll for more', { color: 'var(--color-white)', fontSize: '11px', alignSelf: 'flex-end' }),
      ], s({ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'end', paddingTop: '110px' }, null, { gridTemplateColumns: '1fr', paddingTop: '72px' })),
      h('hero-title', 'Boulevard', 1, s({ color: 'var(--color-white)', fontFamily: 'var(--typography-sans)', fontSize: '142px', fontWeight: 600, lineHeight: .8, letterSpacing: '-9px', marginTop: '70px', whiteSpace: 'nowrap' }, { fontSize: '100px' }, { fontSize: '58px', letterSpacing: '-4px', whiteSpace: 'normal' })),
    ], { ...container, display: 'flex', direction: 'column' }),
  ], s({ width: '100%', minHeight: '720px', paddingTop: '28px', paddingRight: '48px', paddingBottom: '40px', paddingLeft: '48px', background: 'radial-gradient(circle at 88% 0%, #8d92ff 0%, transparent 38%), radial-gradient(circle at 48% 70%, #6b4dff 0%, transparent 36%), linear-gradient(135deg, #193bcc 0%, #2239be 48%, #4434d5 100%)', overflow: 'hidden' }, { paddingRight: '32px', paddingLeft: '32px' }, { minHeight: '650px', paddingRight: '20px', paddingLeft: '20px' }), { type: 'section' }),

  box('about', [box('about-inner', [
    h('about-heading', 'Reshaping what exists, we’re here to help you stand out—with clarity, creativity, and edge.', 2, s({ maxWidth: '1050px', fontSize: '52px', fontWeight: 600, lineHeight: .98, letterSpacing: '-2.7px' }, { fontSize: '42px' }, { fontSize: '31px', letterSpacing: '-1.2px' })),
    box('about-cards', [
      box('about-card-bold', [t('about-star', '✕', { color: 'var(--color-lime)', fontSize: '42px', fontWeight: 800 }), box('about-bold-copy', [t('about-bold-label', 'MADE FOR THE BOLD', { color: 'var(--color-white)', fontSize: '10px', fontWeight: 700 }), t('about-bold-text', 'Design experiences, not just screens. Tell stories, not just taglines.', { color: 'var(--color-white)', fontSize: '18px', lineHeight: 1.15, fontWeight: 600 })], { display: 'flex', direction: 'column', gap: '10px' })], { ...cardBase, minHeight: '290px', display: 'flex', direction: 'column', justifyContent: 'space-between', paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px', background: 'linear-gradient(145deg,#173bc7,#6145ed)' }),
      image('about-card-device', 'asset-device', { ...cardBase, width: '100%', height: '290px', objectFit: 'cover' }),
      box('about-card-growth', [t('growth-label', '(Growth)', labelStyle), h('growth-value', '+32%', 3, { color: 'var(--color-blue)', fontSize: '66px', lineHeight: 1, fontWeight: 700 }), t('growth-copy', 'Design experiences, not just screens.', { maxWidth: '170px', fontSize: '12px', lineHeight: 1.3 })], { ...cardBase, minHeight: '290px', display: 'flex', direction: 'column', justifyContent: 'space-between', paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px', background: 'var(--color-white)' }),
    ], s({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px', marginTop: '48px' }, { gridTemplateColumns: '1fr 1fr' }, { gridTemplateColumns: '1fr' })),
    box('about-strip', [t('about-code', '(ABOUT — 01)', labelStyle), t('about-purpose', 'We help you to shape your ideas into visuals that resonate, disrupt, and last.', { maxWidth: '360px', fontSize: '12px', lineHeight: 1.4 }), t('about-call', 'Book a Call Now', { fontSize: '11px', fontWeight: 700, textDecoration: 'underline' })], s({ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '24px', paddingTop: '28px', borderWidth: '1px', borderColor: 'var(--color-line)' }, null, { gridTemplateColumns: '1fr', gap: '14px' })),
  ], { ...container, display: 'flex', direction: 'column', gap: '28px' })], sectionPad, { type: 'section' }),

  box('services', [box('services-inner', [
    h('services-heading', 'Our Services', 2, largeTitle),
    box('services-intro', [t('services-code', '(SERVICE — 02)', labelStyle), h('services-statement', 'An agency that brings passion into every project.', 3, s({ maxWidth: '650px', fontSize: '43px', lineHeight: 1, fontWeight: 600 }, null, { fontSize: '30px' }))], s({ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '48px', paddingTop: '36px', paddingBottom: '38px' }, null, { gridTemplateColumns: '1fr', gap: '18px' })),
    box('services-layout', [box('service-list', serviceRows, { display: 'flex', direction: 'column' }), image('service-image', 'asset-bag', { ...cardBase, width: '100%', height: '580px', objectFit: 'cover' })], s({ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: '48px' }, { gridTemplateColumns: '1fr 1fr' }, { gridTemplateColumns: '1fr' })),
  ], { ...container, display: 'flex', direction: 'column' })], sectionPad, { type: 'section' }),

  box('work', [box('work-inner', [
    box('work-title-row', [h('work-heading', 'Our Work', 2, largeTitle), t('work-code', '(PROJECT — 03)', labelStyle)], { display: 'flex', justifyContent: 'space-between', alignItems: 'end' }),
    box('project-grid', [
      box('project-chat', [image('project-chat-image', 'asset-chat', { ...cardBase, width: '100%', aspectRatio: '1.55', objectFit: 'cover' }), h('project-chat-title', 'Chat Genius', 3, { fontSize: '20px', fontWeight: 600 }), t('project-chat-meta', '2024 — Still on going · Website Design · Development', { fontSize: '10px', color: 'var(--color-muted)' })], { display: 'flex', direction: 'column', gap: '10px' }),
      box('project-field', [image('project-field-image', 'asset-field', { ...cardBase, width: '100%', aspectRatio: '1.55', objectFit: 'cover' }), h('project-field-title', 'Field Type', 3, { fontSize: '20px', fontWeight: 600 }), t('project-field-meta', '2023 — Jan 2025 · Branding · Social Media', { fontSize: '10px', color: 'var(--color-muted)' })], { display: 'flex', direction: 'column', gap: '10px' }),
    ], s({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '44px' }, null, { gridTemplateColumns: '1fr' })),
    box('studio-story', [image('story-detail-image', 'asset-detail', { ...cardBase, width: '280px', aspectRatio: '1.6', objectFit: 'cover' }), box('story-copy', [h('story-heading', 'We born in a shared studio loft with one mission: create work that doesn’t blend in.', 3, s({ maxWidth: '650px', fontSize: '35px', lineHeight: 1, fontWeight: 600 }, null, { fontSize: '27px' })), button('story-button', 'See All Projects  →')], { display: 'flex', direction: 'column', alignItems: 'flex-start', gap: '24px' })], s({ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '54px', alignItems: 'center', marginTop: '36px' }, null, { gridTemplateColumns: '1fr' })),
    box('milestones-wrap', [t('milestones-label', 'AGENCY MILESTONES', labelStyle), box('milestones-grid', milestones, s({ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '28px', paddingTop: '28px', borderWidth: '1px', borderColor: 'var(--color-line)' }, null, { gridTemplateColumns: '1fr 1fr' }))], { display: 'flex', direction: 'column', gap: '18px', marginTop: '70px' }),
  ], { ...container, display: 'flex', direction: 'column' })], sectionPad, { type: 'section' }),

  box('team', [box('team-inner', [
    box('team-header', [h('team-heading', 'Man Behind The Work', 2, largeTitle), box('team-note', [t('team-avatars', '● ● ●', { color: 'var(--color-blue)', fontSize: '20px', letterSpacing: '-2px' }), t('team-copy', 'From digital campaigns to full-stack brand systems, our small team shipped big things.', { maxWidth: '320px', fontSize: '12px', lineHeight: 1.4 })], { display: 'flex', direction: 'column', gap: '12px' })], s({ display: 'grid', gridTemplateColumns: '1.45fr .55fr', gap: '48px', alignItems: 'end' }, null, { gridTemplateColumns: '1fr' })),
    box('team-cards', [
      image('founder-image', 'asset-founder', { ...cardBase, width: '100%', height: '360px', objectFit: 'cover' }),
      box('recognition-card', [t('recognition-star', '✦', { color: 'var(--color-lime)', fontSize: '44px' }), box('recognition-copy', [t('recognition-label', 'GLOBAL RECOGNITION', { color: 'var(--color-white)', fontSize: '10px', fontWeight: 700 }), h('recognition-title', 'We thrive to create design that make impact—not just impressions.', 3, { color: 'var(--color-white)', fontSize: '27px', lineHeight: 1, fontWeight: 600 })], { display: 'flex', direction: 'column', gap: '14px' })], { ...cardBase, minHeight: '360px', display: 'flex', direction: 'column', justifyContent: 'space-between', paddingTop: '26px', paddingRight: '26px', paddingBottom: '26px', paddingLeft: '26px', background: 'linear-gradient(145deg,#183dc6,#6650ef)' }),
      box('rating-card', [t('rating-label', '(Rating)', labelStyle), h('rating-value', '4.9/5', 3, { color: 'var(--color-blue)', fontSize: '70px', lineHeight: 1, fontWeight: 600 }), t('rating-copy', 'by 2000+ clients world-wide · ★ Trustpilot', { fontSize: '12px', lineHeight: 1.4 })], { ...cardBase, minHeight: '360px', display: 'flex', direction: 'column', justifyContent: 'space-between', paddingTop: '26px', paddingRight: '26px', paddingBottom: '26px', paddingLeft: '26px', background: 'var(--color-white)' }),
    ], s({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px', marginTop: '46px' }, { gridTemplateColumns: '1fr 1fr' }, { gridTemplateColumns: '1fr' })),
    box('team-cta', [t('team-cta-copy', 'Whether you’re launching something new or reshaping what exists, we’re here to help you stand out—with clarity, creativity, and edge.', { maxWidth: '650px', fontSize: '12px', lineHeight: 1.5 }), button('team-cta-button', 'Start Your Project  →')], s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '30px', paddingTop: '34px' }, null, { direction: 'column', alignItems: 'flex-start' })),
  ], { ...container, display: 'flex', direction: 'column' })], sectionPad, { type: 'section' }),

  box('testimonials', [box('testimonials-inner', [
    box('testimonials-title-row', [box('testimonial-title-copy', [t('reviews-code', '(REVIEWS — 05)', labelStyle), h('testimonials-heading', 'Testimonials', 2, largeTitle)], { display: 'flex', direction: 'column', gap: '20px' }), t('testimonial-arrows', '‹   ›', { fontSize: '28px', letterSpacing: '10px' })], { display: 'flex', justifyContent: 'space-between', alignItems: 'end' }),
    box('testimonial-main', [
      box('conversion', [t('conversion-label', 'WORDS FROM THE ONES WHO KNOW US BEST', labelStyle), h('conversion-value', '+80%', 3, { fontSize: '64px', lineHeight: 1, fontWeight: 600 }), t('conversion-copy', 'Conversion Rate', { fontSize: '11px', color: 'var(--color-muted)' })], { display: 'flex', direction: 'column', justifyContent: 'space-between', minHeight: '300px' }),
      box('quote', [h('quote-text', '“Working with Boulevard felt less like building with a creative partner. Every visual, every word—just hit right.”', 3, s({ maxWidth: '720px', fontSize: '38px', lineHeight: 1.02, fontWeight: 600 }, null, { fontSize: '28px' })), box('quote-author', [t('author-avatar', '●', { color: 'var(--color-blue)', fontSize: '26px' }), box('author-copy', [t('author-name', 'Guy Hawkins', { fontSize: '13px', fontWeight: 700 }), t('author-role', 'Head of Product at Webflow', { fontSize: '10px', color: 'var(--color-muted)' })], { display: 'flex', direction: 'column', gap: '4px' }), t('webflow-logo', 'Webflow', { marginLeft: 'auto', fontSize: '20px', fontWeight: 700 })], { display: 'flex', alignItems: 'center', gap: '12px' })], { display: 'flex', direction: 'column', justifyContent: 'space-between', minHeight: '300px' }),
    ], s({ display: 'grid', gridTemplateColumns: '.65fr 1.35fr', gap: '70px', marginTop: '60px', paddingTop: '44px', borderWidth: '1px', borderColor: 'var(--color-line)' }, null, { gridTemplateColumns: '1fr', gap: '34px' })),
    box('client-proof', [t('client-proof-label', '✦ Working with brands that matter', { fontSize: '11px', fontWeight: 700 }), box('client-grid', logos, s({ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px' }, null, { gridTemplateColumns: '1fr 1fr' }))], { display: 'flex', direction: 'column', gap: '24px', marginTop: '60px' }),
  ], { ...container, display: 'flex', direction: 'column' })], sectionPad, { type: 'section' }),

  box('footer', [box('footer-inner', [
    box('footer-contact', [box('footer-email-wrap', [t('footer-question', 'HAVE ANY PROJECT IN MIND?', { color: 'var(--color-white)', fontSize: '10px', fontWeight: 700 }), h('footer-email', 'hello@boulevard.com', 2, s({ color: 'var(--color-periwinkle)', fontSize: '60px', lineHeight: 1, fontWeight: 500, letterSpacing: '-2px' }, null, { fontSize: '36px' }))], { display: 'flex', direction: 'column', gap: '10px' }), button('footer-call', 'Book a Call  →')], s({ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '30px', paddingBottom: '46px', borderWidth: '1px', borderColor: '#343434' }, null, { direction: 'column', alignItems: 'flex-start' })),
    box('footer-columns', [box('footer-about', [t('copyright', '© 2025 Boulevard Creative', { color: 'var(--color-white)', fontSize: '10px' }), t('footer-about-copy', 'Work with our strategists, designers, and developers who deliver high-quality work with passion.', { maxWidth: '420px', color: 'var(--color-white)', fontSize: '16px', lineHeight: 1.35 })], { display: 'flex', direction: 'column', gap: '20px' }), box('footer-nav', [t('footer-nav-label', 'NAVIGATE', { color: 'var(--color-white)', fontSize: '10px', fontWeight: 700 }), t('footer-nav-links', 'Home\nProjects\nService\nAbout\nContact', { color: 'var(--color-white)', fontSize: '12px', lineHeight: 1.8 })], { display: 'flex', direction: 'column', gap: '14px' }), box('footer-social', [t('footer-social-label', 'SOCIAL MEDIA', { color: 'var(--color-white)', fontSize: '10px', fontWeight: 700 }), t('footer-social-links', 'Instagram\nTwitter (X)\nLinkedIn\nDribbble', { color: 'var(--color-white)', fontSize: '12px', lineHeight: 1.8 })], { display: 'flex', direction: 'column', gap: '14px' })], s({ display: 'grid', gridTemplateColumns: '2fr .6fr .6fr', gap: '70px', paddingTop: '46px' }, null, { gridTemplateColumns: '1fr 1fr' })),
    h('footer-brand', 'Boulevard™', 2, s({ color: 'var(--color-white)', fontSize: '58px', fontWeight: 600, marginTop: '70px' }, null, { fontSize: '42px' })),
  ], { ...container, display: 'flex', direction: 'column' })], s({ width: '100%', paddingTop: '54px', paddingRight: '48px', paddingBottom: '54px', paddingLeft: '48px', background: 'var(--color-dark)' }, { paddingRight: '32px', paddingLeft: '32px' }, { paddingRight: '20px', paddingLeft: '20px' }), { type: 'section' }),
];

const document = {
  version: 13,
  projectName: 'Boulevard Creative Studio',
  pageMeta: { language: 'en', title: 'Boulevard — Creative Design Studio', description: 'Independent design studio creating bold identities, digital products and memorable brand experiences.' },
  tokens: {
    colors: {
      paper: { name: 'Paper', value: '#f7f7f4', cssVar: '--color-paper' }, white: { name: 'White', value: '#ffffff', cssVar: '--color-white' }, ink: { name: 'Ink', value: '#181818', cssVar: '--color-ink' }, muted: { name: 'Muted', value: '#666a70', cssVar: '--color-muted' }, line: { name: 'Line', value: '#dadddf', cssVar: '--color-line' }, soft: { name: 'Soft surface', value: '#eef0f2', cssVar: '--color-soft' }, blue: { name: 'Boulevard blue', value: '#2441c5', cssVar: '--color-blue' }, periwinkle: { name: 'Periwinkle', value: '#8296ff', cssVar: '--color-periwinkle' }, lime: { name: 'Acid lime', value: '#d9ff2f', cssVar: '--color-lime' }, dark: { name: 'Footer dark', value: '#1c1c1c', cssVar: '--color-dark' },
    },
    typography: { sans: { name: 'Sans', value: 'Arial, Helvetica, sans-serif', cssVar: '--typography-sans' }, mono: { name: 'Mono', value: 'ui-monospace, SFMono-Regular, monospace', cssVar: '--typography-mono' } },
    spacing: { xs: { name: 'XS', value: '8px' }, sm: { name: 'Small', value: '14px' }, md: { name: 'Medium', value: '24px' }, lg: { name: 'Large', value: '48px' }, xl: { name: 'XL', value: '96px' } },
    radius: { card: { name: 'Card', value: '18px' }, pill: { name: 'Pill', value: '999px' } },
    shadows: { soft: { name: 'Soft', value: '0 18px 50px rgba(20,25,40,.08)' } },
  },
  assets,
  components: [],
  globalClasses: [{ id: 'class-pill-button', name: 'pill-button', styles: s({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '42px', paddingRight: '20px', paddingLeft: '20px', background: 'var(--color-lime)', color: 'var(--color-ink)', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }), states: { hover: { transform: 'translateY(-2px)', boxShadow: '0 10px 25px rgba(0,0,0,.15)' } } }],
  nodes,
};

writeFileSync(new URL('../examples/boulevard-creative-studio.orbit.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
console.log('Generated examples/boulevard-creative-studio.orbit.json');
