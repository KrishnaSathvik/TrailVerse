# Phosphor Icons Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace lucide-react with @phosphor-icons/react in next-frontend via a barrel file rewrite, with zero consumer-file changes.

**Architecture:** Single barrel file (`src/components/icons/index.js`) is the only import surface for all icons. Rewrite it to import from Phosphor and alias exports to existing Lucide names. Swap the npm dependency.

**Tech Stack:** @phosphor-icons/react@^2.1.10, Next.js 16.2.1, React 19

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `next-frontend/package.json` | Modify | Swap lucide-react → @phosphor-icons/react |
| `next-frontend/src/components/icons/index.js` | Rewrite | Central icon barrel — all 105 icon exports |

No new files created. No consumer files touched.

---

### Task 1: Install @phosphor-icons/react and remove lucide-react

**Files:**
- Modify: `next-frontend/package.json`

- [ ] **Step 1: Install Phosphor Icons**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && npm install @phosphor-icons/react@^2.1.10
```

Expected: Package added to dependencies in package.json.

- [ ] **Step 2: Uninstall lucide-react**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && npm uninstall lucide-react
```

Expected: `lucide-react` removed from dependencies in package.json.

- [ ] **Step 3: Verify package.json**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && node -e "const p = require('./package.json'); console.log('phosphor:', p.dependencies['@phosphor-icons/react']); console.log('lucide:', p.dependencies['lucide-react']);"
```

Expected output:
```
phosphor: ^2.1.10
lucide: undefined
```

- [ ] **Step 4: Commit**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && git add package.json package-lock.json && git commit -m "chore: swap lucide-react for @phosphor-icons/react"
```

---

### Task 2: Rewrite the icon barrel file

**Files:**
- Rewrite: `next-frontend/src/components/icons/index.js`

- [ ] **Step 1: Replace the entire barrel file**

Write the following content to `next-frontend/src/components/icons/index.js`:

```js
/**
 * Centralized Icon Exports
 * Re-exports from @phosphor-icons/react, aliased to match previous Lucide names
 * so consumer components require zero changes.
 */

// Navigation & UI
export { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react';
export { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react';
export { ArrowUpIcon as ArrowUp } from '@phosphor-icons/react';
export { ArrowDownIcon as ArrowDown } from '@phosphor-icons/react';
export { ListIcon as Menu } from '@phosphor-icons/react';
export { XIcon as X } from '@phosphor-icons/react';
export { CaretDownIcon as ChevronDown } from '@phosphor-icons/react';
export { CaretUpIcon as ChevronUp } from '@phosphor-icons/react';
export { CaretLeftIcon as ChevronLeft } from '@phosphor-icons/react';
export { CaretRightIcon as ChevronRight } from '@phosphor-icons/react';
export { DotsThreeVerticalIcon as MoreVertical } from '@phosphor-icons/react';
export { DotsThreeIcon as MoreHorizontal } from '@phosphor-icons/react';
export { ArrowSquareOutIcon as ExternalLink } from '@phosphor-icons/react';

// Search & Filters
export { MagnifyingGlassIcon as Search } from '@phosphor-icons/react';
export { FunnelIcon as Filter } from '@phosphor-icons/react';
export { SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react';

// Actions
export { HeartIcon as Heart } from '@phosphor-icons/react';
export { HeartBreakIcon as HeartOff } from '@phosphor-icons/react';
export { ShareIcon as Share } from '@phosphor-icons/react';
export { ShareNetworkIcon as Share2 } from '@phosphor-icons/react';
export { DownloadIcon as Download } from '@phosphor-icons/react';
export { UploadIcon as Upload } from '@phosphor-icons/react';
export { PencilSimpleIcon as Edit } from '@phosphor-icons/react';
export { PencilSimpleIcon as Edit2 } from '@phosphor-icons/react';
export { TrashIcon as Trash } from '@phosphor-icons/react';
export { TrashIcon as Trash2 } from '@phosphor-icons/react';
export { PlusIcon as Plus } from '@phosphor-icons/react';
export { MinusIcon as Minus } from '@phosphor-icons/react';
export { CheckIcon as Check } from '@phosphor-icons/react';
export { CheckCircleIcon as CheckCircle } from '@phosphor-icons/react';
export { CopyIcon as Copy } from '@phosphor-icons/react';

// Status & Feedback
export { SpinnerIcon as Loader } from '@phosphor-icons/react';
export { SpinnerGapIcon as Loader2 } from '@phosphor-icons/react';
export { WarningCircleIcon as AlertCircle } from '@phosphor-icons/react';
export { WarningIcon as AlertTriangle } from '@phosphor-icons/react';
export { InfoIcon as Info } from '@phosphor-icons/react';
export { CheckCircleIcon as CheckCircle2 } from '@phosphor-icons/react';
export { XCircleIcon as XCircle } from '@phosphor-icons/react';

// Parks & Nature
export { MountainsIcon as Mountain } from '@phosphor-icons/react';
export { TreeEvergreenIcon as Trees } from '@phosphor-icons/react';
export { TentIcon as Tent } from '@phosphor-icons/react';
export { CameraIcon as Camera } from '@phosphor-icons/react';
export { SunHorizonIcon as Sunrise } from '@phosphor-icons/react';
export { SunHorizonIcon as Sunset } from '@phosphor-icons/react';
export { CompassIcon as Compass } from '@phosphor-icons/react';
export { DogIcon as Dog } from '@phosphor-icons/react';
export { BankIcon as Landmark } from '@phosphor-icons/react';

// Accessibility
export { WheelchairIcon as Accessibility } from '@phosphor-icons/react';

// Location & Map
export { MapPinIcon as MapPin } from '@phosphor-icons/react';
export { MapPinLineIcon as MapPinCheck } from '@phosphor-icons/react';
export { MapTrifoldIcon as Map } from '@phosphor-icons/react';
export { NavigationArrowIcon as Navigation } from '@phosphor-icons/react';
export { PathIcon as Route } from '@phosphor-icons/react';

// Time & Date
export { CalendarIcon as Calendar } from '@phosphor-icons/react';
export { CalendarDotsIcon as CalendarDays } from '@phosphor-icons/react';
export { ClockIcon as Clock } from '@phosphor-icons/react';

// User & Profile
export { UserIcon as User } from '@phosphor-icons/react';
export { UserCircleIcon as UserCircle } from '@phosphor-icons/react';
export { UserCheckIcon as UserCheck } from '@phosphor-icons/react';
export { UsersIcon as Users } from '@phosphor-icons/react';
export { SignInIcon as LogIn } from '@phosphor-icons/react';
export { SignOutIcon as LogOut } from '@phosphor-icons/react';
export { GearSixIcon as Settings } from '@phosphor-icons/react';

// Rating & Review
export { StarIcon as Star } from '@phosphor-icons/react';
export { ThumbsUpIcon as ThumbsUp } from '@phosphor-icons/react';
export { ThumbsDownIcon as ThumbsDown } from '@phosphor-icons/react';
export { ChatCircleIcon as MessageCircle } from '@phosphor-icons/react';
export { ChatTextIcon as MessageSquare } from '@phosphor-icons/react';

// Media & Content
export { ImageIcon as Image } from '@phosphor-icons/react';
export { FileTextIcon as FileText } from '@phosphor-icons/react';
export { FileIcon as File } from '@phosphor-icons/react';
export { PaperclipIcon as Paperclip } from '@phosphor-icons/react';
export { PaperPlaneTiltIcon as Send } from '@phosphor-icons/react';
export { FloppyDiskIcon as Save } from '@phosphor-icons/react';
export { ArchiveBoxIcon as ArchiveRestore } from '@phosphor-icons/react';

// Social (native Phosphor brand icons — no more custom SVGs)
export { EnvelopeSimpleIcon as Mail } from '@phosphor-icons/react';
export { PhoneIcon as Phone } from '@phosphor-icons/react';
export { InstagramLogoIcon as Instagram } from '@phosphor-icons/react';
export { FacebookLogoIcon as Facebook } from '@phosphor-icons/react';
export { XLogoIcon as Twitter } from '@phosphor-icons/react';

// Weather
export { CloudIcon as Cloud } from '@phosphor-icons/react';
export { CloudRainIcon as CloudRain } from '@phosphor-icons/react';
export { CloudSnowIcon as CloudSnow } from '@phosphor-icons/react';
export { SunIcon as Sun } from '@phosphor-icons/react';
export { MoonIcon as Moon } from '@phosphor-icons/react';
export { WindIcon as Wind } from '@phosphor-icons/react';
export { DropIcon as Droplets } from '@phosphor-icons/react';
export { ThermometerIcon as Thermometer } from '@phosphor-icons/react';

// Facilities & Services
export { ForkKnifeIcon as Utensils } from '@phosphor-icons/react';
export { BedIcon as Bed } from '@phosphor-icons/react';
export { GasPumpIcon as Fuel } from '@phosphor-icons/react';
export { WifiHighIcon as Wifi } from '@phosphor-icons/react';
export { WifiSlashIcon as WifiOff } from '@phosphor-icons/react';
export { CurrencyDollarIcon as DollarSign } from '@phosphor-icons/react';
export { CreditCardIcon as CreditCard } from '@phosphor-icons/react';
export { GiftIcon as Gift } from '@phosphor-icons/react';

// View & Display
export { EyeIcon as Eye } from '@phosphor-icons/react';
export { EyeSlashIcon as EyeOff } from '@phosphor-icons/react';
export { SquaresFourIcon as Grid } from '@phosphor-icons/react';
export { ListIcon as List } from '@phosphor-icons/react';
export { LayoutIcon as Layout } from '@phosphor-icons/react';

// Tech & Web
export { GlobeIcon as Globe } from '@phosphor-icons/react';
export { LinkIcon as Link } from '@phosphor-icons/react';
export { LinkSimpleIcon as Link2 } from '@phosphor-icons/react';
export { BookmarkIcon as Bookmark } from '@phosphor-icons/react';
export { TagIcon as Tag } from '@phosphor-icons/react';
export { BellIcon as Bell } from '@phosphor-icons/react';
export { BellSlashIcon as BellOff } from '@phosphor-icons/react';
export { HouseIcon as Home } from '@phosphor-icons/react';
export { MonitorIcon as Monitor } from '@phosphor-icons/react';

// Admin & Dashboard
export { ChartBarIcon as BarChart } from '@phosphor-icons/react';
export { ChartBarIcon as BarChart3 } from '@phosphor-icons/react';
export { TrendUpIcon as TrendingUp } from '@phosphor-icons/react';
export { ActivityIcon as Activity } from '@phosphor-icons/react';
export { ChartPieIcon as PieChart } from '@phosphor-icons/react';
export { ShieldIcon as Shield } from '@phosphor-icons/react';
export { LockIcon as Lock } from '@phosphor-icons/react';
export { LockOpenIcon as Unlock } from '@phosphor-icons/react';
export { KeyIcon as Key } from '@phosphor-icons/react';
export { TargetIcon as Target } from '@phosphor-icons/react';
export { DatabaseIcon as Database } from '@phosphor-icons/react';

// Additional common icons
export { LightningIcon as Zap } from '@phosphor-icons/react';
export { QuestionIcon as HelpCircle } from '@phosphor-icons/react';
export { PlayIcon as Play } from '@phosphor-icons/react';
export { PlayCircleIcon as PlayCircle } from '@phosphor-icons/react';
export { PauseIcon as Pause } from '@phosphor-icons/react';
export { PauseCircleIcon as PauseCircle } from '@phosphor-icons/react';
export { ArrowsClockwiseIcon as RefreshCw } from '@phosphor-icons/react';
export { CornersOutIcon as Maximize } from '@phosphor-icons/react';
export { CornersInIcon as Minimize } from '@phosphor-icons/react';
export { CornersOutIcon as Maximize2 } from '@phosphor-icons/react';
export { CornersInIcon as Minimize2 } from '@phosphor-icons/react';
export { MagnifyingGlassPlusIcon as ZoomIn } from '@phosphor-icons/react';
export { MagnifyingGlassMinusIcon as ZoomOut } from '@phosphor-icons/react';
export { PrinterIcon as Printer } from '@phosphor-icons/react';
export { CodeIcon as Code } from '@phosphor-icons/react';
export { CodeSimpleIcon as Code2 } from '@phosphor-icons/react';

// Content & Text
export { BookOpenIcon as BookOpen } from '@phosphor-icons/react';
export { QuotesIcon as Quote } from '@phosphor-icons/react';
export { ArrowBendUpLeftIcon as Reply } from '@phosphor-icons/react';
export { TextBolderIcon as Bold } from '@phosphor-icons/react';
export { TextItalicIcon as Italic } from '@phosphor-icons/react';
export { ListNumbersIcon as ListOrdered } from '@phosphor-icons/react';
export { TextTIcon as Type } from '@phosphor-icons/react';
export { AlignLeftIcon as AlignLeft } from '@phosphor-icons/react';
export { TextAlignCenterIcon as AlignCenter } from '@phosphor-icons/react';
export { AlignRightIcon as AlignRight } from '@phosphor-icons/react';

// AI & Features
export { RobotIcon as Bot } from '@phosphor-icons/react';
export { BrainIcon as Brain } from '@phosphor-icons/react';
export { LightbulbIcon as Lightbulb } from '@phosphor-icons/react';
export { SparkleIcon as Sparkles } from '@phosphor-icons/react';
export { TrophyIcon as Award } from '@phosphor-icons/react';

// Emojis & Reactions
export { SmileyIcon as Smile } from '@phosphor-icons/react';
export { CookieIcon as Cookie } from '@phosphor-icons/react';

// Weather extras
export { SnowflakeIcon as Snowflake } from '@phosphor-icons/react';
```

- [ ] **Step 2: Verify no duplicate export names cause syntax errors**

The barrel file exports both `Menu` (from ListIcon) and `List` (from ListIcon). These are different export names aliasing the same component, which is valid JS. Similarly `CheckCircle` and `CheckCircle2` both alias `CheckCircleIcon` — valid.

However, `Trash` and `Trash2` both alias `TrashIcon`, and `Edit` and `Edit2` both alias `PencilSimpleIcon`. Verify this compiles:

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && node -e "import('@phosphor-icons/react').then(m => { console.log('TrashIcon:', typeof m.TrashIcon); console.log('PencilSimpleIcon:', typeof m.PencilSimpleIcon); console.log('ListIcon:', typeof m.ListIcon); })"
```

Expected: All print `function` or `object`.

- [ ] **Step 3: Commit**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && git add src/components/icons/index.js && git commit -m "feat: rewrite icon barrel to use @phosphor-icons/react"
```

---

### Task 3: Verify build and no stale references

**Files:**
- None modified (verification only)

- [ ] **Step 1: Verify no remaining lucide-react imports anywhere in next-frontend**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && grep -r "lucide-react" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
```

Expected: No output (zero matches).

- [ ] **Step 2: Verify lucide-react is gone from package.json**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && grep "lucide" package.json
```

Expected: No output.

- [ ] **Step 3: Build next-frontend**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && npm run build
```

Expected: Build completes successfully. Some pre-existing warnings about park SSG pages failing due to NPS API 500s are expected and unrelated to this change.

- [ ] **Step 4: Start dev server and spot-check**

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && npm run dev
```

Manually verify in browser:
- Header: Menu icon, navigation arrows
- Park cards: MapPin, Star, Heart icons render
- Footer: Instagram, Facebook, X (Twitter) social icons render
- Auth modal (if accessible): Lock, Mail, Eye/EyeOff icons render

- [ ] **Step 5: Final commit (if any fixups needed)**

If any icons needed adjustment during spot-check, commit the fixes:

```bash
cd /Users/krishnasathvikmantripragada/npe-usa/next-frontend && git add -A && git commit -m "fix: adjust icon mappings after visual verification"
```

If no fixes needed, skip this step.
