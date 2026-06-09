// ◊·κ=1 · EU AI Act article navigator · data + helpers · zero deps

export const ARTICLES = [
  {
    id: '5',
    title: 'Article 5 · Prohibited AI practices',
    enforceFrom: '2025-02-02',
    tags: ['prohibited', 'social-scoring', 'predictive-policing', 'biometric', 'manipulation', 'vulnerability'],
    summary: 'Eight categories flat-banned: subliminal/manipulative techniques · vulnerability exploitation · social scoring · predictive policing on individuals · untargeted facial scraping · workplace/education emotion recognition · biometric categorisation by sensitive attributes · real-time remote biometric ID in public for law enforcement.',
    penalty: 'up to €35M or 7% global turnover',
  },
  {
    id: '6',
    title: 'Article 6 + Annex III · High-risk classification',
    enforceFrom: '2026-08-02',
    tags: ['high-risk', 'classification', 'annex-iii'],
    summary: 'High-risk if in one of 8 Annex III categories: biometrics · critical infrastructure · education · employment (CV screening, performance eval) · essential services (credit, insurance, emergency) · law enforcement · migration · justice/democracy. Article 6(3) carveouts exist for narrow procedural tasks or preparatory work.',
  },
  {
    id: '9',
    title: 'Article 9 · Risk management system',
    enforceFrom: '2026-08-02',
    tags: ['risk-management', 'high-risk', 'lifecycle'],
    summary: 'Establish, implement, document, maintain a risk management system across the entire system lifecycle. Identify foreseeable risks, estimate emergence in intended use AND foreseeable misuse, adopt mitigations, test against established metrics.',
  },
  {
    id: '10',
    title: 'Article 10 · Data and data governance',
    enforceFrom: '2026-08-02',
    tags: ['data', 'governance', 'bias', 'training'],
    summary: 'Training/validation/testing datasets must be relevant, representative, complete, free of errors. Statistical properties appropriate for purpose. Examine for biases affecting health/safety/fundamental rights or leading to discrimination. Document collection, origin, annotation, curation.',
  },
  {
    id: '11',
    title: 'Article 11 + Annex IV · Technical documentation',
    enforceFrom: '2026-08-02',
    tags: ['documentation', 'annex-iv', 'conformity'],
    summary: 'Before placing on market, compile technical documentation per Annex IV: general description · system elements (data, algorithms, architecture) · monitoring/control · risk management · lifecycle changes · harmonised standards · EU declaration of conformity · post-market performance assessment.',
  },
  {
    id: '12',
    title: 'Article 12 · Automatic record-keeping (audit logs)',
    enforceFrom: '2026-08-02',
    tags: ['logs', 'audit', 'traceability', 'high-risk'],
    summary: 'High-risk systems must automatically log events over lifetime. Logs enable: risk identification · modification tracking · post-market monitoring · bias detection. Required content: use period · reference database · input data triggering matches · identification of verifiers.',
  },
  {
    id: '13',
    title: 'Article 13 · Transparency to deployers',
    enforceFrom: '2026-08-02',
    tags: ['transparency', 'deployer', 'instructions'],
    summary: 'System comes with instructions including: provider identity · intended purpose · accuracy/robustness/cybersecurity levels · performance per groups · risks · human oversight measures · expected lifetime · maintenance · log access.',
  },
  {
    id: '14',
    title: 'Article 14 · Human oversight',
    enforceFrom: '2026-08-02',
    tags: ['human-oversight', 'pause', 'override', 'high-risk'],
    summary: 'High-risk systems designed for effective human oversight. Persons must: understand capacities and limitations · be aware of automation bias · correctly interpret output · decide NOT to use the output or override/reverse it · intervene or interrupt the system.',
  },
  {
    id: '15',
    title: 'Article 15 · Accuracy, robustness and cybersecurity',
    enforceFrom: '2026-08-02',
    tags: ['accuracy', 'robustness', 'cybersecurity', 'high-risk'],
    summary: 'Achieve appropriate accuracy (declared in instructions) · robustness against errors and inconsistencies (redundancy, backup, fail-safe) · cybersecurity resilient against attempts to alter use/outputs/performance · including data-poisoning and adversarial examples.',
  },
  {
    id: '26',
    title: 'Article 26 · Deployer obligations',
    enforceFrom: '2026-08-02',
    tags: ['deployer', 'workplace', 'logs', 'monitoring'],
    summary: 'Deployer must: use per instructions · assign human oversight to competent persons · monitor operation · keep logs ≥ 6 months · inform affected persons that they are subject to high-risk AI · for workplace use, inform workers reps + workers BEFORE deployment.',
  },
  {
    id: '50',
    title: 'Article 50 · Transparency to end-users',
    enforceFrom: '2026-08-02',
    tags: ['transparency', 'chatbot', 'deepfake', 'emotion', 'biometric', 'disclosure'],
    summary: 'Four categories require user-facing disclosure: (1) AI-interaction systems (chatbots) · (2) emotion recognition / biometric categorisation · (3) deepfakes/manipulated content · (4) AI-generated text on public-interest matters. Disclosure should be clear at time of interaction.',
  },
  {
    id: '51-55',
    title: 'Articles 51-55 · General Purpose AI (GPAI)',
    enforceFrom: '2025-08-02',
    tags: ['gpai', 'foundation-model', 'transparency', 'copyright'],
    summary: 'GPAI providers must: maintain technical documentation (Annex XI) · provide info to downstream (Annex XII) · publish copyright policy · publish summary of training data. Systemic-risk models (huge compute thresholds): additional evaluation, adversarial testing, incident tracking, cybersecurity.',
  },
];

export const ANNEX_III_CATEGORIES = [
  { num: 1, title: 'Biometrics (non-prohibited)' },
  { num: 2, title: 'Critical infrastructure (water, gas, electricity, transport, digital)' },
  { num: 3, title: 'Education and vocational training (admissions, scoring, cheating detection)' },
  { num: 4, title: 'Employment, worker management, access to self-employment (CV screening, performance eval, task allocation)' },
  { num: 5, title: 'Access to essential services (credit, health insurance, emergency dispatch, public benefits)' },
  { num: 6, title: 'Law enforcement (non-prohibited categories)' },
  { num: 7, title: 'Migration, asylum and border control' },
  { num: 8, title: 'Administration of justice and democratic processes' },
];

export const PENALTIES = [
  { breach: 'Prohibited AI (Article 5)', max: '€35M or 7% global turnover' },
  { breach: 'Non-compliance with high-risk obligations', max: '€15M or 3%' },
  { breach: 'Incorrect info to authorities', max: '€7.5M or 1%' },
];

export const DEADLINES = [
  { date: '2025-02-02', what: 'Prohibited AI practices banned (Article 5 enforceable)' },
  { date: '2025-08-02', what: 'GPAI rules for new foundation models' },
  { date: '2026-08-02', what: 'High-risk obligations for standalone Annex III systems' },
  { date: '2027-08-02', what: 'Safety-component high-risk + GPAI legacy models' },
];

/**
 * Search articles by query (matches title, summary, tags)
 * @param {string} query
 * @returns {Article[]}
 */
export function searchArticles(query) {
  if (!query) return ARTICLES.slice();
  const q = query.toLowerCase();
  return ARTICLES.filter(a => {
    if (a.title.toLowerCase().includes(q)) return true;
    if (a.summary.toLowerCase().includes(q)) return true;
    if (a.tags.some(t => t.includes(q))) return true;
    return false;
  });
}

/**
 * Get an article by id
 * @param {string} id - e.g. '5', '14', '51-55'
 * @returns {Article | undefined}
 */
export function getArticle(id) {
  return ARTICLES.find(a => a.id === id);
}

/**
 * Get articles relevant to a tier
 * @param {string} tier - 'prohibited' | 'high' | 'limited' | 'minimal'
 * @returns {Article[]}
 */
export function articlesForTier(tier) {
  if (tier === 'prohibited') return [getArticle('5')].filter(Boolean);
  if (tier === 'high') return ['6', '9', '10', '11', '12', '13', '14', '15', '26'].map(getArticle).filter(Boolean);
  if (tier === 'limited') return [getArticle('50')].filter(Boolean);
  return [];
}
