# Zwift Dashboard – Design System

> Single source of truth for all visual decisions.  
> Every new component or edit MUST follow this document.  
> Update this file whenever a standard changes — never silently deviate.

---

## 1. Color Tokens (`app/globals.css` → `:root`)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f4f5f7` | Page background |
| `--panel` | `#ffffff` | Cards, header, form panels |
| `--panel-solid` | `#ffffff` | Opaque panel (no blur) |
| `--text` | `#14171a` | Body text, headings |
| `--muted` | `#5b6168` | Labels, secondary text |
| `--accent` | `#2f8fe0` | Buttons, links, highlights, accent bars |
| `--accent-2` | `#14171a` | Record card values, gradient start |
| `--accent-blue` | `#2f8fe0` | Alias for blue icon badges |
| `--good` | `#1a8f4c` | Positive delta |
| `--bad` | `#d6362a` | Negative delta / error |
| `--border` | `rgba(20,23,26,0.1)` | Default border |
| `--border-strong` | `rgba(20,23,26,0.2)` | Focused/hovered borders |
| `--radius` | `16px` | Card border radius |
| `--shadow` | (see CSS) | Card resting shadow |
| `--shadow-hover` | (see CSS) | Card hovered shadow |

**Rule:** Never hard-code a color value in a component. Always use a token.  
The one exception: icon badge backgrounds (`.c-orange`, `.c-blue`, etc.) are defined once in `globals.css` and referenced by class name.

---

## 2. Typography

- **Font:** `Inter`, system-fallback stack
- **Body:** 14px / `var(--text)`
- **Secondary/labels:** 13px or 12px / `var(--muted)`
- **Section titles:** 11.5px, weight 700, uppercase, letter-spacing 0.07em
- **Card values:** 28px weight 700 (compact: 19px)
- **Record values:** 20px weight 700

---

## 3. Utility Classes

### `.section-title`
Use for every section heading in the dashboard. Renders a fixed-height (14px) blue vertical accent bar via `::before`.  
```tsx
<div className="section-title">
  <IconCalendar size={16} />
  Weekly training plan
</div>
```
**Never** use `border-left` or inline vertical bars — always use this class.

### `.notice`
Info/warning panels, stale-plan messages, error states. White card with border.  
Text-align: justify, line-height 1.65.
```tsx
<div className="notice">This plan is from a previous week.</div>
```

### `.card-desc`
Prose descriptions inside cards (workout descriptions, AI summaries).  
Text-align: justify, line-height 1.55. Add as className alongside any inline `fontSize` you need.
```tsx
<div className="card-desc" style={{ fontSize: 12, opacity: 0.85 }}>
  {w.description}
</div>
```

### `.stat-card` / `.stat-card.clickable`
- All cards use `.stat-card` for base styling (border, radius, shadow, top stripe).
- Only cards that navigate on click get `.clickable` (which enables the lift transform on hover).
- Non-clickable cards get a subtle shadow on hover — no transform.

### `.btn` / `.btn-secondary`
Primary: accent-colored, full-width by default. Override with `style={{ width: "auto", padding: "8px 18px" }}`.  
Secondary: ghost/outline style for non-primary actions.

---

## 4. Layout Rules

### Dashboard container
```css
.dashboard { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
```
All content sits inside this container.

### Dashboard header
Full viewport width (same as footer). Implemented with:
```css
width: 100vw;
margin-left: calc(-50vw + 50%);
padding: 20px calc(50vw - 50% + 24px);
```
**Never** constrain the header to the 1040px container.

### Section spacing
- Between sections: `margin-top: 28px` on the section wrapper
- Between section title and content: `margin-bottom: 14px` (built into `.section-title`)

### Grid systems
| Grid class | Use case | Min column width |
|---|---|---|
| `.stat-grid` | General stats | 160px |
| `.stat-grid.workout-grid` | Weekly plan workout cards | 260px |
| `.stat-grid-compact` | Header stats (6 fixed columns) | — |
| `.record-grid` | Personal records (3 cols → 2 → 1) | — |

---

## 5. Icon Badges

Two sizes: `.record-icon` (42×42px, records grid) and `.stat-card-icon` (22×22px, header cards).  
Color classes (apply to either): `c-neutral`, `c-orange`, `c-blue`, `c-green`, `c-pink`, `c-amber`, `c-teal`, `c-red`, `c-purple`.

```tsx
<div className="stat-card-icon c-blue"><IconBolt size={13} /></div>
```

---

## 6. Accent Bars (Vertical)

**Rule:** The vertical accent bar before a section title is ALWAYS `height: 14px`, via `.section-title::before`.  
Never vary this height. Never use `border-left`. This ensures uniform visual rhythm across all sections.

---

## 7. Card Top Stripe

All `.stat-card`, `.record-card`, `.trend-card` have a **2.5px** accent-colored top stripe via `::before`.
Controlled by CSS variable `--strip-height: 2.5px` in `:root` — change ONLY this variable, never hardcode px values.  
This is automatic — do not replicate it manually with a border or div.

---

## 8. Hover Behavior

| Element | Hover effect |
|---|---|
| `.stat-card` (non-clickable) | Subtle shadow + faint accent border. No transform. |
| `.stat-card.clickable` | Full lift (`translateY(-3px)`) + stronger shadow |
| `.record-card` | Lift + stronger shadow |
| `.ride-row` | Lift + accent border |
| `.ride-row-arrow` | Fills with `--accent`, nudges right 2px |

---

## 9. File Writing Rules (CRITICAL)

**OneDrive corrupts large file writes mid-write.** Always use Python to write or significantly modify files over ~100 lines:

```python
path = '/sessions/.../mnt/barak--Zwift Project/app/globals.css'
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
```

After every file write, verify with:
```bash
tail -5 app/globals.css
git diff HEAD -- app/globals.css
```

If you see a partial value like `color: var(-` at the end of any file — that file is truncated. Fix before deploying.

---

## 10. Deployment Checklist

Always run `check.bat` before `deploy.bat`. It validates:
1. `globals.css` contains the mobile media query (truncation check)
2. CSS tokens `--accent` and `--bg` are present
3. Key component files are not empty/corrupt
4. No file ends with a partial `var(-` expression

```
check.bat     ← run first; exits with error if anything is wrong
deploy.bat    ← calls check.bat automatically, clears git lock files, commits, pushes
deploy-log.txt ← every run appends a timestamped entry — check here if something fails
```

---

## 12. Post-Deploy Verification (Claude responsibility)

**After every deploy or code change, Claude MUST proactively:**

1. **Read `deploy-log.txt`** — check for lock file errors, commit failures, push failures.
   Never assume SUCCESS without reading the log.

2. **Check Vercel** via Chrome MCP:
   `https://vercel.com/barak1403-9441s-projects/zwift/deployments`
   Confirm the latest deployment is "Ready" and matches the expected commit message.

3. **Report to user** — one line: what deployed, when, status. No need to ask user to check.

**Known failure modes to watch for:**
- `HEAD.lock` / `index.lock` exists → `deploy.bat` now auto-clears these on startup
- `git commit` says "nothing to commit" → not a failure, just nothing new to push
- `git push` returns "Everything up-to-date" after a failed commit → means commit was skipped
- Vercel shows "Error" → click the deployment and read the build log

**Rule:** Claude never says "run X and tell me what you see." Claude runs the check itself.

---

## 11. Adding a New Section

1. Wrap in `<div className="section">` or add `style={{ marginTop: 28 }}`
2. Use `<div className="section-title">` as the heading (with an icon)
3. Use `.stat-grid`, `.record-grid`, or a custom grid for content
4. Cards: use `.stat-card` (add `.clickable` only if it navigates)
5. Prose text: `.notice` for standalone info blocks, `.card-desc` for in-card prose
6. Buttons: `.btn` for primary, `.btn-secondary` for secondary
7. All colors via CSS tokens — no hard-coded hex inside components

---

*Last updated: 2026-06-30*
