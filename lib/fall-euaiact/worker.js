// ◊·κ=1 · fall-euaiact reference Cloudflare Worker · deploy this yourself if you want a hosted REST API
// Routes:
//   POST /v1/classify       · body: { description }                       → ClassifyResult
//   POST /v1/deep-classify  · body: { description, provider, apiKey }     → DeepClassifyResult (BYOK pass-through)
//   GET  /v1/articles       · ?q=hiring                                   → Article[]
//   GET  /v1/article/:id    ·                                             → Article
//   POST /v1/docgen         · body: { values, date?, draftWarning? }      → { markdown }
//   GET  /v1/spec           ·                                             → { sdk, spec, deadlines, penalties }
//
// Deploy: wrangler init · wrangler publish
// Or use this as a starter for any serverless platform · the handlers are runtime-agnostic.

import { classify, deepClassify } from './classifier.js';
import { ARTICLES, PENALTIES, DEADLINES, searchArticles, getArticle } from './articles.js';
import { generateAnnexIV } from './docgen.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (req.method === 'POST' && pathname === '/v1/classify') {
        const { description } = await req.json();
        return json(classify(description));
      }
      if (req.method === 'POST' && pathname === '/v1/deep-classify') {
        const { description, provider, apiKey, model } = await req.json();
        if (!provider || !apiKey) return json({ error: 'provider and apiKey required (BYOK)' }, 400);
        const result = await deepClassify(description, { provider, apiKey, model });
        return json(result);
      }
      if (req.method === 'GET' && pathname === '/v1/articles') {
        const q = url.searchParams.get('q') || '';
        return json(searchArticles(q));
      }
      if (req.method === 'GET' && pathname.startsWith('/v1/article/')) {
        const id = pathname.split('/').pop();
        const a = getArticle(id);
        return a ? json(a) : json({ error: 'not found' }, 404);
      }
      if (req.method === 'POST' && pathname === '/v1/docgen') {
        const { values, date, draftWarning } = await req.json();
        return json({ markdown: generateAnnexIV(values, { date, draftWarning }) });
      }
      if (req.method === 'GET' && pathname === '/v1/spec') {
        return json({
          sdk_version: '1.0.0',
          spec: 'Regulation (EU) 2024/1689',
          articles_count: ARTICLES.length,
          deadlines: DEADLINES,
          penalties: PENALTIES,
        });
      }
      if (req.method === 'GET' && pathname === '/') {
        return json({
          name: 'fall-euaiact',
          version: '1.0.0',
          docs: 'https://sjgant80-hub.github.io/fall-euaiact/',
          endpoints: ['/v1/classify', '/v1/deep-classify', '/v1/articles', '/v1/article/:id', '/v1/docgen', '/v1/spec'],
        });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message || 'internal error' }, 500);
    }
  },
};
