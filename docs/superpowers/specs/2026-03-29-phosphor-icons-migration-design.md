# Phosphor Icons Migration Design

**Date**: 2026-03-29
**Scope**: `next-frontend/` only (Vite `client/` untouched)
**Approach**: Pure barrel swap (Approach A)

## Summary

Replace `lucide-react` with `@phosphor-icons/react` in `next-frontend/` by rewriting the centralized barrel file (`src/components/icons/index.js`). All consumer components continue importing from `@components/icons` with the same names — zero consumer-file changes.

## Motivation

- Phosphor offers 9,000+ icons (vs ~1,500 in Lucide) with 6 weight variants (thin, light, regular, bold, fill, duotone)
- Duotone weight provides a premium visual feel rare in free icon libraries
- Weight toggling simplifies state-based icon changes (e.g., `weight="fill"` for active favorites instead of swapping `Heart`/`HeartOff`)
- `IconContext` enables global theming (size, weight, color) without prop drilling
- Native brand icons (Instagram, Facebook, Twitter/X) eliminate custom SVG maintenance

## Package Changes

- **Install**: `@phosphor-icons/react@^2.1.10`
- **Remove**: `lucide-react@^1.7.0`

## Files Changed

1. **`next-frontend/src/components/icons/index.js`** — full rewrite with Phosphor imports aliased to current Lucide export names
2. **`next-frontend/package.json`** — dependency swap

## Files Deleted

None. The 3 custom SVG brand icon components (Instagram, Facebook, Twitter) lived inline in the barrel file and are replaced by native Phosphor imports.

## Icon Mapping

### Direct Matches (75 icons)

These Lucide names map 1:1 to Phosphor (Phosphor name = `{LucideName}Icon`):

ArrowLeft, ArrowRight, ArrowUp, ArrowDown, X, SlidersHorizontal, Heart, Share, Download, Upload, Trash, Plus, Minus, Check, CheckCircle, Copy, Info, XCircle, Tent, Camera, Compass, Dog, MapPin, Calendar, Clock, User, UserCircle, UserCheck, Users, Star, ThumbsUp, ThumbsDown, Image, FileText, File, Paperclip, Phone, Cloud, CloudRain, CloudSnow, Sun, Moon, Wind, Thermometer, Bed, CreditCard, Gift, Eye, List, Layout, Globe, Link, Bookmark, Tag, Bell, Monitor, Activity, Shield, Lock, Key, Target, Database, Play, PlayCircle, Pause, PauseCircle, Printer, Code, BookOpen, AlignLeft, AlignRight, Brain, Lightbulb, Cookie, Snowflake

### Renamed Mappings (30 icons)

| Lucide Export Name | Phosphor Import | Notes |
|---|---|---|
| Menu | ListIcon | Hamburger menu |
| ChevronDown | CaretDownIcon | |
| ChevronUp | CaretUpIcon | |
| ChevronLeft | CaretLeftIcon | |
| ChevronRight | CaretRightIcon | |
| MoreVertical | DotsThreeVerticalIcon | |
| MoreHorizontal | DotsThreeIcon | |
| ExternalLink | ArrowSquareOutIcon | |
| Search | MagnifyingGlassIcon | |
| Filter | FunnelIcon | |
| HeartOff | HeartBreakIcon | |
| Share2 | ShareNetworkIcon | |
| Edit | PencilSimpleIcon | |
| Edit2 | PencilSimpleIcon | Same as Edit |
| Trash2 | TrashIcon | Phosphor has single Trash |
| Loader | SpinnerIcon | |
| Loader2 | SpinnerGapIcon | |
| AlertCircle | WarningCircleIcon | |
| AlertTriangle | WarningIcon | |
| CheckCircle2 | CheckCircleIcon | Phosphor has single CheckCircle |
| Mountain | MountainsIcon | |
| Trees | TreeEvergreenIcon | |
| Sunrise | SunHorizonIcon | |
| Sunset | SunHorizonIcon | Same icon, context differentiates |
| Landmark | BankIcon | |
| Accessibility | WheelchairIcon | |
| MapPinCheck | MapPinLineIcon | |
| Map | MapTrifoldIcon | |
| Navigation | NavigationArrowIcon | |
| Route | PathIcon | |
| CalendarDays | CalendarDotsIcon | |
| LogIn | SignInIcon | |
| LogOut | SignOutIcon | |
| Settings | GearSixIcon | |
| MessageCircle | ChatCircleIcon | |
| MessageSquare | ChatTextIcon | |
| Send | PaperPlaneTiltIcon | |
| Save | FloppyDiskIcon | |
| ArchiveRestore | ArchiveBoxIcon | |
| Mail | EnvelopeSimpleIcon | |
| Instagram | InstagramLogoIcon | Replaces custom SVG |
| Facebook | FacebookLogoIcon | Replaces custom SVG |
| Twitter | XLogoIcon | Updated to X branding |
| Droplets | DropIcon | |
| Utensils | ForkKnifeIcon | |
| Fuel | GasPumpIcon | |
| Wifi | WifiHighIcon | |
| WifiOff | WifiSlashIcon | |
| DollarSign | CurrencyDollarIcon | |
| EyeOff | EyeSlashIcon | |
| Grid | SquaresFourIcon | |
| Link2 | LinkSimpleIcon | |
| BellOff | BellSlashIcon | |
| Home | HouseIcon | |
| BarChart | ChartBarIcon | |
| BarChart3 | ChartBarIcon | Phosphor has single ChartBar |
| TrendingUp | TrendUpIcon | |
| PieChart | ChartPieIcon | |
| Unlock | LockOpenIcon | |
| Zap | LightningIcon | |
| HelpCircle | QuestionIcon | |
| RefreshCw | ArrowsClockwiseIcon | |
| Maximize | CornersOutIcon | |
| Minimize | CornersInIcon | |
| Maximize2 | CornersOutIcon | Same as Maximize |
| Minimize2 | CornersInIcon | Same as Minimize |
| ZoomIn | MagnifyingGlassPlusIcon | |
| ZoomOut | MagnifyingGlassMinusIcon | |
| Code2 | CodeSimpleIcon | |
| Quote | QuotesIcon | |
| Reply | ArrowBendUpLeftIcon | |
| Bold | TextBolderIcon | |
| Italic | TextItalicIcon | |
| ListOrdered | ListNumbersIcon | |
| Type | TextTIcon | |
| AlignCenter | TextAlignCenterIcon | |
| Bot | RobotIcon | |
| Sparkles | SparkleIcon | |
| Award | TrophyIcon | |
| Smile | SmileyIcon | |

## What Does NOT Change

- No consumer component files change (they import from `@components/icons`)
- No import paths change
- All icons use `regular` weight by default (matches Lucide's stroke-only style)
- `client/` Vite frontend is untouched
- No weight strategy applied yet (future enhancement)

## Future Enhancements (out of scope)

- Define weight strategy per context (thin for chrome, bold for CTAs, fill for active states, duotone for premium features)
- Add `IconContext.Provider` wrapper for global defaults
- Leverage duotone weight for AI/premium feature areas

## Verification

- Build `next-frontend` successfully (`npm run build`)
- Visual spot-check: header, park cards, auth modals, footer social icons
- Confirm no remaining `lucide-react` imports via grep
