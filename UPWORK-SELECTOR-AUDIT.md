# Upwork Profile Setup - Selector Audit & Fix Plan

**Date**: 2026-06-02  
**Issue**: `upwork_profile_setup` selectors failing due to Cloudflare blocking + potential URL/selector changes

---

## 🔴 Problems Identified

### 1. **Primary URL 404s**
```javascript
// Line 1934 in agent.mjs
await _page.goto('https://www.upwork.com/nx/profile-settings/profile-title', ...)
```
**Status**: ❌ **Returns 404 error**  
**Evidence**: Screenshot shows "Looking for something? Error 404 (BN)"

### 2. **Fallback URL Blocked by Cloudflare**
```javascript
// Line 1940 fallback
await _page.goto('https://www.upwork.com/freelancers/settings/profile', ...)
```
**Status**: ⚠️ **Cloudflare bot detection blocking automated access**  
**Evidence**: Stuck on "Verifying..." or blank Cloudflare page even after 15+ second waits

### 3. **Current Selectors (from agent.mjs)**

#### A1 - Profile Title/Headline
```javascript
// Line 1937 - Direct field attempt
let titleField = _page.getByLabel(/Title|Headline/i).first();

// Line 1942 - Pencil edit fallback
const pencil = _page.locator('[data-test*="title"] button[aria-label*="edit" i], button[aria-label*="Edit title" i]').first();
```

#### A2 - Hourly Rate
```javascript
// Line 1954-1960
await _page.goto('https://www.upwork.com/nx/profile-settings/rate', ...);
const rateField = _page.getByLabel(/hourly rate/i).first();
```

#### A3 - Availability
```javascript
// Line 1967-1970
await _page.goto('https://www.upwork.com/nx/profile-settings/availability', ...);
const availDropdown = _page.getByLabel(/availability/i).first();
```

#### B - Overview Bio
```javascript
// Line 1979-1986
await _page.goto('https://www.upwork.com/nx/profile-settings/overview', ...);
const overviewField = _page.locator('textarea[name*="overview"], textarea[aria-label*="overview" i]').first();
```

#### C - Skills
```javascript
// Line 1996-2010
await _page.goto('https://www.upwork.com/nx/profile-settings/skills', ...);
const skillInput = _page.getByLabel(/add skills/i).first();
```

---

## 🔧 Fix Strategy

### **Phase 1: URL Audit** ✅ DONE
- ❌ `/nx/profile-settings/profile-title` → 404
- ⚠️ `/freelancers/settings/profile` → Cloudflare blocked
- ❓ Other profile-settings URLs also likely broken

### **Phase 2: Cloudflare Bypass**
**Options:**
1. **Manual codegen** (CURRENT) - Use `npx playwright codegen` to manually navigate and record selectors
2. **Session replay** - Use existing authenticated session from si-didy-profile
3. **Alternative entry point** - Navigate from /ab/account-security/login → profile instead of direct URL
4. **Headful mode** - Run browser headless:false with longer waits (already tried, still blocked)

### **Phase 3: Selector Discovery**
Once past Cloudflare, extract:
- ✅ Screenshot of actual page
- ✅ HTML source
- ✅ All input/textarea/button elements with:
  - `id`
  - `name`
  - `class`
  - `data-test` attributes
  - `aria-label`
  - `placeholder`
- ✅ Generate robust selectors using multiple strategies:
  - Playwright's `getByLabel()`
  - Playwright's `getByRole()`
  - CSS selectors with `data-test`
  - XPath as last resort

### **Phase 4: Code Update**
Update `agent.mjs` lines 1932-2125 with:
- Fixed URLs (if different from current)
- Updated selectors
- Better Cloudflare wait strategy
- Fallback selectors for each field

---

## 📊 Current State

| Section | URL Pattern | Selector | Status |
|---------|-------------|----------|--------|
| A1 - Title | `/nx/profile-settings/profile-title` | `getByLabel(/Title\|Headline/i)` | ❌ URL 404 |
| A2 - Rate | `/nx/profile-settings/rate` | `getByLabel(/hourly rate/i)` | ❓ Untested |
| A3 - Availability | `/nx/profile-settings/availability` | `getByLabel(/availability/i)` | ❓ Untested |
| B - Overview | `/nx/profile-settings/overview` | `textarea[name*="overview"]` | ❓ Untested |
| C - Skills | `/nx/profile-settings/skills` | `getByLabel(/add skills/i)` | ❓ Untested |
| D - Portfolio | `/nx/profile-settings/portfolio` | Multiple | ❓ Untested |
| E - Employment | `/nx/profile-settings/employment` | Multiple | ❓ Untested |
| F - Education | `/nx/profile-settings/education` | Multiple | ❓ Untested |

---

## 🎯 Next Steps

1. **Manual inspection via codegen** (IN PROGRESS)
   - Navigate to actual working Upwork profile URLs
   - Document correct URL patterns
   - Record working selectors
   - Save auth state

2. **Alternative**: Use real browser profile
   ```bash
   # Launch with existing profile to bypass Cloudflare
   npx playwright open --user-data-dir="C:\Users\sjgan\Downloads\si-didy-profile" https://www.upwork.com/freelancers/~<your-id>
   ```

3. **Update agent.mjs** with:
   - Correct URLs
   - Robust selectors
   - Cloudflare handling
   - Error recovery

---

## 💡 Architectural Notes

**Why automation is breaking:**
- Upwork uses `/nx/` pattern for modern React SPA routes
- These routes likely changed or were deprecated
- Cloudflare bot detection has been strengthened
- Automated browser fingerprints are being detected

**Defensive selector strategy:**
```javascript
// GOOD - Multiple fallbacks
const titleField = await page.locator([
  '[data-test="profile-title-input"]',     // Most specific
  'input[aria-label*="title" i]',           // Semantic
  'input[name="title"]',                     // Structural
  '#profile-title'                           // ID fallback
].join(', ')).first();

// BAD - Single brittle selector
const titleField = page.locator('#input-123');
```

---

**Status**: INVESTIGATING - Playwright codegen running in background
