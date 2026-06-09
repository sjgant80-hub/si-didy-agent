// ◊·κ=1 · fall-euaiact SDK · TypeScript types

export type Tier = 'prohibited' | 'high' | 'limited' | 'minimal';

export interface TriggerHit {
  note: string;
  article: string;
}

export interface ClassifyResult {
  tier: Tier;
  label: string;
  triggers: TriggerHit[];
  articles: string[];
  /** 0-100 · how many trigger rules matched */
  confidence: number;
}

export interface DeepClassifyOpts {
  provider: 'anthropic' | 'openai' | 'google';
  apiKey: string;
  /** optional model override · defaults to claude-3-5-sonnet / gpt-4o-mini / gemini-1.5-flash */
  model?: string;
}

export interface DeepClassifyResult {
  tier: Tier;
  confidence: number;
  articles: string[];
  reasoning: string;
  key_risks: string[];
  next_steps: string[];
}

export interface Article {
  id: string;
  title: string;
  enforceFrom: string;
  tags: string[];
  summary: string;
  penalty?: string;
}

export interface AnnexIIIEntry { num: number; title: string; }
export interface PenaltyEntry { breach: string; max: string; }
export interface DeadlineEntry { date: string; what: string; }

export interface AuditEvent {
  type: string;
  input?: string;
  output?: string;
  operator?: string;
  metadata?: object;
}

export interface AuditEntry {
  ts: string;
  event_type: string;
  input_summary: string | null;
  output_summary: string | null;
  operator_id: string | null;
  metadata: object | null;
  prev_hash: string;
  hash: string;
}

export interface AuditShim {
  log(event: AuditEvent): Promise<AuditEntry>;
  exportAll(): Promise<AuditEntry[]>;
  verifyChain(): Promise<{ valid: boolean; broken_at?: number; total: number }>;
  clear(): Promise<void>;
}

export interface AuditOpts {
  dbName?: string;
  retention_days?: number;
  sink?: 'indexeddb' | 'memory';
}

export interface DocField {
  id: string;
  q: string;
  placeholder: string;
  art: string;
}

export interface DocGenOpts {
  date?: string;
  draftWarning?: boolean;
}

// ─── v1.1: Annex IV factory ──────────────────────────────────────────────

export type AnnexIVLanguage = 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl';
export type AnnexIVFormat = 'markdown' | 'html' | 'json';

export interface AnnexIVExportOpts {
  format?: AnnexIVFormat;
  language?: AnnexIVLanguage;
}

export interface AnnexIVEnvelope {
  kind: 'fall-euaiact-annexiv-v1';
  spec: string;
  values: Record<string, string>;
  fields: DocField[];
  recordedAt: string;
  language: AnnexIVLanguage;
  draftWarning: boolean;
}

export interface SignedDoc {
  envelope: AnnexIVEnvelope;
  signature: string;
}

export interface AnnexIVDoc {
  fields: DocField[];
  supportedLanguages: AnnexIVLanguage[];
  toJSON(): { values: Record<string, string>; opts: DocGenOpts };
  missing(): string[];
  validate(): { complete: boolean; missing: string[] };
  export(opts?: AnnexIVExportOpts): Promise<string | AnnexIVEnvelope>;
  sign(privateKeyHex: string): Promise<SignedDoc>;
}

export interface AnnexIVLocaleStrings {
  title: string;
  sect1: string;
  sect2: string;
  sect3: string;
  sect4: string;
  sect5: string;
  draftWarn: string;
}

// ─── v1.1: Article 50 transparency badge ─────────────────────────────────

export type Article50Category = 'chatbot' | 'generated-text' | 'generated-image' | 'audio' | 'video';

export interface TransparencyBadgeSpec {
  category: Article50Category;
  language?: AnnexIVLanguage;
  systemId?: string;
  optOutUrl?: string;
  customLabel?: string;
  styleVars?: { bg?: string; fg?: string; accent?: string };
}

export interface BadgeImpression {
  ts: number;
  userId: string;
  systemId: string;
  category: Article50Category;
  language: AnnexIVLanguage;
  [key: string]: unknown;
}

export interface BadgeEnvelope {
  kind: 'fall-euaiact-article50-badge-v1';
  category: Article50Category;
  language: AnnexIVLanguage;
  systemId: string;
  labelHash: string;
  recordedAt: string;
  impressionsCount: number;
}

export interface SignedBadge {
  envelope: BadgeEnvelope;
  signature: string;
}

export interface TransparencyBadge {
  supportedLanguages: AnnexIVLanguage[];
  toJSON(): { category: Article50Category; language: AnnexIVLanguage; systemId: string; optOutUrl: string | null; label: string };
  html(opts?: { compact?: boolean }): string;
  mount(selectorOrEl: string | Element, opts?: { compact?: boolean }): Element;
  recordImpression(userId: string, meta?: object): Promise<BadgeImpression>;
  export(range?: { from?: string; to?: string }): Promise<BadgeImpression[]>;
  sign(privateKeyHex: string): Promise<SignedBadge>;
}

// ─── v1.1: Ed25519 ──────────────────────────────────────────────────────

export interface Keypair {
  publicKey: string;
  privateKey: string;
}

// ─── Re-exports ─────────────────────────────────────────────────────────

export declare const TIERS: {
  PROHIBITED: 'prohibited';
  HIGH: 'high';
  LIMITED: 'limited';
  MINIMAL: 'minimal';
};

export declare const DEEP_PROMPT: string;
export declare const ARTICLES: Article[];
export declare const ANNEX_III_CATEGORIES: AnnexIIIEntry[];
export declare const PENALTIES: PenaltyEntry[];
export declare const DEADLINES: DeadlineEntry[];
export declare const DOC_FIELDS: DocField[];
export declare const ANNEX_IV_LOCALES: Record<AnnexIVLanguage, AnnexIVLocaleStrings>;
export declare const ARTICLE_50_CATEGORIES: Article50Category[];
export declare const SDK_VERSION: string;
export declare const SPEC_VERSION: string;

export declare function classify(description: string): ClassifyResult;
export declare function deepClassify(description: string, opts: DeepClassifyOpts): Promise<DeepClassifyResult>;
export declare function searchArticles(query: string): Article[];
export declare function getArticle(id: string): Article | undefined;
export declare function articlesForTier(tier: Tier): Article[];
export declare function createAuditShim(opts?: AuditOpts): AuditShim;
export declare function generateAnnexIV(values: Record<string, string>, opts?: DocGenOpts): string;
export declare function getDocFields(): DocField[];
export declare function validateValues(values: Record<string, string>): string[];
export declare function createAnnexIV(spec: Record<string, string>, opts?: DocGenOpts): AnnexIVDoc;
export declare function createTransparencyBadge(spec: TransparencyBadgeSpec): TransparencyBadge;
export declare function generateKeypair(): Promise<Keypair>;
export declare function sign(message: string, privateKeyHex: string): Promise<string>;
export declare function verify(message: string, signatureHex: string, publicKeyHex: string): Promise<boolean>;
