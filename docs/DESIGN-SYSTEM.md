# Zwift AI Coach — Design System

## Core Principle
World-class AI training platform. Every element communicates professionalism, innovation, and trust.
Inspiration: Apple Fitness+, Whoop, Supersapiens — light, clean, premium.

## Colors
### Page
- Background: #f0f2f5
- Card: #ffffff  
- Text primary: #0f172a
- Text secondary: #64748b
- Accent blue: #3b82f6

### Workout Intensity (accent bars + graph)
- Zone2/Foundation: #3b82f6
- SweetSpot: #10b981
- Threshold: #f59e0b
- VO2max: #f97316
- Sprint/Neuromuscular: #8b5cf6
- Rest: transparent

### Banner (dark premium)
- Background: linear-gradient(135deg, #0a0e1a, #0d1f3c)
- Border: 1px solid rgba(59,130,246,0.2)

## Typography (MINIMUM 14px everywhere - iron rule)
- Page title: 32px weight 800
- Card title: 22px weight 700 centered
- Date label: 13px weight 600 uppercase gray
- Stats row: 15px weight 500 gray
- Big numbers: 28-36px weight 700 #3b82f6

## Cards
- border-radius: 20px
- box-shadow: 0 4px 24px rgba(0,0,0,0.08)
- padding: 28-36px
- min-height: 280px
- hover: translateY(-4px), deeper shadow
- accent bar: border-top 5px solid [color] — NEVER a div (causes clipping)

## Workout Card Structure (FIXED - never change)
1. borderTop 5px accent color
2. Power graph 140px, bg #f1f5f9 (LIGHT not dark), zone-colored rounded bars
3. Date label 13px uppercase
4. Workout name 22px bold centered
5. Stats row: 60min · TSS 42 · IF 0.72 · 88-93% FTP
6. Download ZWO button minimal
NO description paragraph. ZERO.

## Graph (WorkoutThumbnail)
- background: #f1f5f9 (light gray)
- height: 140px
- bar tops: border-radius 3px
- FTP reference line: dashed rgba(0,0,0,0.15)
- animation: fade + slide-up 300ms staggered

## Rest Day Card
- border: 2px dashed #e2e8f0
- background: #f8fafc
- centered: emoji 48px + date 13px + "Rest Day" 22px bold

## Hero Banner (hero-banner.tsx)
- 3 slides, 6s rotation, progress bar
- height: 280px, max-width: 1100px
- SVG visuals must NOT be clipped (overflow: visible)
- All 3 messages must be fully readable
- Position: TOP of Coach page, before cards

## Profile Strip
- Height: 90px, dark style matching banner
- Single row: [Avatar+Name+Goal] | [FTP][W/kg][days/wk] | [Phase arc + Edit]
- Numbers: 22px bold #3b82f6

## Today Note
- Position: BOTTOM of Coach page, after cards
- White card, border-right 4px #3b82f6
- Heading "Talk to your coach" 18px bold
- Large input + blue send button

## Page Order (Coach)
1. Hero Banner
2. Profile Strip  
3. Workout cards (3 col, 32px gap, max-width 1100px)
4. Today Note

## Connections Panel
INCLUDE: ICU status + Change key, Platform checkboxes
REMOVED: Fix calendar button, Generate button

## Iron Rules (never break)
1. Nothing under 14px
2. No description text in workout cards
3. Accent bar = borderTop only
4. Graph bg = light (#f1f5f9)
5. Rest Day = dashed card
6. Today Note = bottom always
7. Banner = top always
8. Never touch API routes, lib files, sync files
