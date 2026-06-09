// ◊·κ=1 · fall-euaiact SDK · barrel export · MIT · zero deps
// Pure functions for EU AI Act compliance · works in browser, Node 18+, Deno, Cloudflare Workers
// libsodium-wrappers is lazy-loaded only when sign()/verify()/generateKeypair() are first called

export { classify, deepClassify, TIERS, DEEP_PROMPT } from './classifier.js';
export { ARTICLES, ANNEX_III_CATEGORIES, PENALTIES, DEADLINES, searchArticles, getArticle, articlesForTier } from './articles.js';
export { createAuditShim } from './audit.js';
export { generateAnnexIV, getDocFields, validateValues, DOC_FIELDS, createAnnexIV, ANNEX_IV_LOCALES } from './docgen.js';
export { createTransparencyBadge, ARTICLE_50_CATEGORIES } from './transparency.js';
export { generateKeypair, sign, verify } from './sign.js';

export const SDK_VERSION = '1.1.0';
export const SPEC_VERSION = 'Regulation (EU) 2024/1689';
