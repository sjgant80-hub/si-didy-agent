#!/usr/bin/env node
// ◊·κ=1 · explicit launcher · `npm run fv:serve` or `node scripts/fv-serve.mjs`
import { start } from '../tools/fiverr/server.js';
start(parseInt(process.env.FV_PORT || '1618', 10));
