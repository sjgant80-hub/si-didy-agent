// ◊·κ=1 · EU AI Act risk classifier · pure functions · zero deps
// works in browser, Node 18+, Cloudflare Workers, Deno

export const TIERS = {
  PROHIBITED: 'prohibited',
  HIGH: 'high',
  LIMITED: 'limited',
  MINIMAL: 'minimal',
};

const RULES = [
  { tier: 'prohibited', label: 'PROHIBITED · Article 5',
    triggers: [
      { re: /social scor|citizen scor|trust score.*citizen/i, art: '5(1)(c)', note: 'social scoring by public authorities' },
      { re: /predictive polic|assess.*risk.*committ.*crim/i, art: '5(1)(d)', note: 'predictive policing on individuals' },
      { re: /scrap.*facial|facial.*scrap.*CCTV/i, art: '5(1)(e)', note: 'untargeted scraping for facial recognition' },
      { re: /emotion recognition.*workplace|emotion.*employee|emotion.*school/i, art: '5(1)(f)', note: 'emotion recognition in workplace/education' },
      { re: /biometric categor.*(?:race|religion|political|sexual)/i, art: '5(1)(g)', note: 'biometric categorisation by sensitive attributes' },
      { re: /real.?time.*biometric.*public|real.?time.*facial.*recogn.*public/i, art: '5(1)(h)', note: 'real-time remote biometric ID in public for LE' },
      { re: /subliminal|manipulat.*behaviour.*harm/i, art: '5(1)(a)', note: 'subliminal/manipulative techniques causing harm' },
      { re: /exploit.*vulnerab.*(?:age|disability|economic)/i, art: '5(1)(b)', note: 'exploitation of vulnerabilities' },
    ] },
  { tier: 'high', label: 'HIGH RISK · Annex III · Articles 6-15',
    triggers: [
      { re: /\b(cv|c\.v\.|resume|résumé)s?\b.{0,30}(screen|scor|rank|filter|reject)|screen.{0,30}\b(cv|c\.v\.|resume|résumé)s?\b|hire.*decision|hir.*algorithm|recruit.*(automat|agency|agent)|applicant.*scor/i, art: 'Annex III(4)', note: 'employment · CV screening · hiring' },
      { re: /performance evaluat|worker.*manag|task allocat.*algorithm|monitor.*employee/i, art: 'Annex III(4)', note: 'workplace performance evaluation' },
      { re: /credit.{0,20}(scoring|decision|approval|application|review|risk)|scor.{0,20}credit|loan.*decision|underwrit/i, art: 'Annex III(5)', note: 'access to essential financial services' },
      { re: /insurance.*pric|health.*insurance.*risk/i, art: 'Annex III(5)', note: 'insurance underwriting · health/life' },
      { re: /emergency.*dispatch|triage.*emerg/i, art: 'Annex III(5)', note: 'emergency service dispatch' },
      { re: /public benefit.*eligib|welfare.*decis|social.*assistance.*decis/i, art: 'Annex III(5)', note: 'eligibility for public benefits' },
      { re: /student.*admiss|exam.*scor.*automat|cheating detect.*exam/i, art: 'Annex III(3)', note: 'education · admissions/scoring/cheating' },
      { re: /critical infrastruct|grid.*manag|water.*manag.*AI|gas.*pipeline.*AI/i, art: 'Annex III(2)', note: 'critical infrastructure management' },
      { re: /law enforcement.*evid|criminal.*profil|crime.*analyt|polic.*risk.*assess/i, art: 'Annex III(6)', note: 'law enforcement (non-prohibited categories)' },
      { re: /migrat.*assess|asylum.*decis|border.*control.*AI|visa.*decis.*algorithm/i, art: 'Annex III(7)', note: 'migration / asylum / border control' },
      { re: /judicial.*decis|court.*ruling.*assist|democratic.*process.*influence/i, art: 'Annex III(8)', note: 'administration of justice / democracy' },
      { re: /biometric.*identif(?!.*public)|fingerprint.*match|face.*verif|voice.*identif/i, art: 'Annex III(1)', note: 'biometric identification (non-prohibited)' },
    ] },
  { tier: 'limited', label: 'LIMITED RISK · Article 50 transparency',
    triggers: [
      { re: /chatbot|customer support.*AI|conversation.*assistant|virtual.*agent/i, art: '50(1)', note: 'chatbot · disclose AI to user' },
      { re: /deepfake|synthetic.*video|generated.*image|AI.*generated.*content|content.*manipulat/i, art: '50(4)', note: 'deepfake / AI-generated content disclosure' },
      { re: /emotion recognition(?!.*workplace)/i, art: '50(3)', note: 'emotion recognition (outside workplace) disclosure' },
      { re: /biometric categor/i, art: '50(3)', note: 'biometric categorisation disclosure' },
      { re: /AI.*generated.*text.*(?:news|public|article)/i, art: '50(4)', note: 'AI-generated public interest text disclosure' },
    ] },
];

/**
 * T0 keyword classifier · runs offline · no LLM required
 * @param {string} description - plain-English description of the AI system
 * @returns {{ tier: string, label: string, triggers: Array, articles: Array, confidence: number }}
 */
export function classify(description) {
  if (!description || typeof description !== 'string') {
    throw new TypeError('description must be a non-empty string');
  }
  const hits = [];
  let bestTier = 'minimal', bestLabel = 'MINIMAL RISK · default tier';
  for (const tier of RULES) {
    for (const trig of tier.triggers) {
      if (trig.re.test(description)) hits.push({ tier: tier.tier, label: tier.label, ...trig });
    }
    if (hits.some(h => h.tier === tier.tier)) {
      bestTier = tier.tier; bestLabel = tier.label;
      break;
    }
  }
  const tierHits = hits.filter(h => h.tier === bestTier);
  const articles = [...new Set(tierHits.map(h => h.art))];
  const confidence = tierHits.length === 0 ? 0 :
                     tierHits.length === 1 ? 50 :
                     Math.min(95, 40 + tierHits.length * 20);
  return {
    tier: bestTier,
    label: bestLabel,
    triggers: tierHits.map(h => ({ note: h.note, article: h.art })),
    articles,
    confidence,
  };
}

const DEEP_PROMPT = `You are an EU AI Act (Regulation 2024/1689) compliance analyst. Given a description of an AI system, return a JSON object with this exact shape:

{
  "tier": "prohibited" | "high" | "limited" | "minimal",
  "confidence": 0-100,
  "articles": ["5(1)(c)", "Annex III(4)", ...],
  "reasoning": "2-4 sentences explaining the classification",
  "key_risks": ["risk 1", "risk 2", ...],
  "next_steps": ["concrete action 1", "concrete action 2", ...]
}

The tiers:
- prohibited: matches Article 5 (social scoring, predictive policing, untargeted facial scraping, workplace emotion recognition, biometric categorisation by sensitive attributes, real-time biometric ID in public for LE, subliminal manipulation, exploitation of vulnerabilities)
- high: matches Annex III (biometrics, critical infrastructure, education, employment, essential services like credit, law enforcement, migration, justice/democracy)
- limited: matches Article 50 (chatbots, deepfakes, emotion recognition outside workplace, biometric categorisation, AI-generated public-interest text)
- minimal: everything else

Be honest about confidence. If the description is ambiguous, say so in reasoning. Return ONLY the JSON object, no markdown, no preamble.`;

/**
 * T2 deep classifier · uses LLM via BYOK · returns structured JSON
 * Caller provides the apiKey · keys never leave the process boundary you control
 *
 * @param {string} description - plain-English description of the AI system
 * @param {{ provider: 'anthropic'|'openai'|'google', apiKey: string, model?: string }} opts
 * @returns {Promise<{ tier: string, confidence: number, articles: string[], reasoning: string, key_risks: string[], next_steps: string[] }>}
 */
export async function deepClassify(description, opts) {
  if (!description) throw new TypeError('description required');
  if (!opts?.provider || !opts?.apiKey) throw new TypeError('opts.provider and opts.apiKey required');

  const fetchFn = typeof fetch !== 'undefined' ? fetch : (await import('node-fetch')).default;

  if (opts.provider === 'anthropic') {
    const r = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        messages: [{ role: 'user', content: DEEP_PROMPT + '\n\nSystem description:\n' + description }],
      }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || 'Anthropic API error');
    return JSON.parse((data.content?.[0]?.text || '{}').replace(/^```json\s*|\s*```$/g, ''));
  }

  if (opts.provider === 'openai') {
    const r = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + opts.apiKey },
      body: JSON.stringify({
        model: opts.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: DEEP_PROMPT }, { role: 'user', content: description }],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || 'OpenAI API error');
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  }

  if (opts.provider === 'google') {
    const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model || 'gemini-1.5-flash'}:generateContent?key=${opts.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DEEP_PROMPT + '\n\nSystem description:\n' + description }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || 'Google AI API error');
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
  }

  throw new Error(`unknown provider: ${opts.provider}`);
}

export { DEEP_PROMPT };
