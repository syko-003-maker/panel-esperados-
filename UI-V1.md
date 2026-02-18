# UI-V1 — Refonte Visuelle du Panneau Staff

**Date:** Janvier 2026  
**Status:** ✅ Build SUCCESS  
**Approche:** Modernisation pure UI/UX sans changements de sécurité ou logique métier

---

## 🎯 Vue d'ensemble

Refonte complète du design du panneau staff avec:
- **Design System** basé sur Shadcn/UI + Tailwind CSS v4
- **Layout Global** avec sidebar fixe + topbar responsive
- **Pages Modernisées** dashboard, members, sanctions, link, forbidden
- **Dark Mode** activé par défaut
- **Responsive** mobile-first
- **Zéro Breaking Changes** sur la sécurité ou les APIs

---

## 📦 Nouvelles Dépendances Installées

```bash
npm install lucide-react clsx tailwind-merge class-variance-authority
npm install @radix-ui/react-slot @radix-ui/react-select @radix-ui/react-dialog
npm install @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-icons
```

- **lucide-react**: Icônes vectorielles modernes
- **clsx + tailwind-merge**: Utilitaires pour les classes Tailwind
- **class-variance-authority**: Patterns de variantes pour composants
- **@radix-ui/***: Composants headless accessibles

---

## 🏗️ Design System

### src/lib/cn.ts
Helper de fusion de classes Tailwind avec support des variantes:
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### app/globals.css
Variables de couleurs + thème dark mode:
- Couleurs de base (background, foreground, card, etc.)
- Thème clair (light) par défaut, sombre (dark) via `prefers-color-scheme`
- Variables CSS pour tous les éléments
- Tailwind v4 `@theme` pour mapping

### src/components/ui/ (Composants Shadcn)
Composants primitifs modernes et réutilisables:
- **button.tsx** — CVA variants (default, destructive, outline, ghost, link)
- **card.tsx** — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- **badge-new.tsx** — Badge avec variantes (default, secondary, destructive, outline)
- **input.tsx** — Input field avec focus states
- **select.tsx** — Select dropdown avec Radix
- **dialog.tsx** — Modal dialog accessible
- **dropdown-menu.tsx** — Menu dropdown avec submenus
- **tabs.tsx** — Tabs navigation
- **skeleton.tsx** — Placeholder de chargement

---

## 🎨 Layout Global Staff

### src/components/staff-layout.tsx
Client component qui fournit:
- **Sidebar** fixe (desktop) / drawer (mobile)
- **Topbar** avec titre page + user menu
- **Navigation** à 7 items (Dashboard, Members, Recrutements, Plaintes, Sanctions, Logs, Settings)
- **Responsive** via flexbox et media queries
- **Dark Mode** supporté via classes Tailwind

### app/staff/layout.tsx
Wrapper du layout staff global (simplifié, délègue au composant client)

---

## 📄 Pages Modernisées

### 1️⃣ /staff/dashboard
**Fichier:** `app/staff/dashboard/page.tsx`

**Avant:** Tables HTML inline avec styles inline, données brutes  
**Après:**
- 4 KPI cards (Plaintes ouvertes, Recrutements, Sanctions actives, Membres)
- Icons colorées par type (AlertCircle, FileText, Ban, Users)
- Skeleton loaders pendant le chargement
- 2 sections "récentes" (Recrutements + Sanctions) avec badges status
- Cartes avec hover effects et transitions douces
- Layout grid responsive (1→2→4 colonnes)

**Données:** Fetch inchangé (`/api/staff/*`), juste UI wrapper

---

### 2️⃣ /staff/members
**Fichier:** `app/staff/members/members-list-client.tsx`

**Avant:** Table avec inline styles, couleurs hardcoded  
**Après:**
- Search bar avec icône intégré (lucide Search)
- Table propre avec headers distingués
- Badges de grade (CHEF=destructive, CAPTAIN=default, WL1-4=secondary)
- Badges de statut (Actif=green, Inactif=red)
- Row hovers avec background transition
- Colonne "Action" avec bouton d'export (ExternalLink icon)
- Responsive scroll horizontal sur mobile

**Données:** Inchangée, tri et filtrage préservés

---

### 3️⃣ /staff/sanctions
**Fichier:** `app/staff/sanctions/page.tsx`

**Avant:** Div simple avec titre  
**Après:**
- Header avec titre + description
- Bouton "Nouvelle sanction" en haut à droite
- Layout avec icône et button primaire
- Réutilise SanctionsClient existant

---

### 4️⃣ /staff/link
**Fichier:** `app/staff/link/page.tsx`

**Avant:** Page centrée minimaliste  
**Après:**
- Centré sur écran entier (min-h-screen flex)
- Titre principal + sous-titre explicatif
- Card wrapper avec padding/border
- Réutilise StaffLinkForm existant
- Instructions claires en haut

---

### 5️⃣ /staff/forbidden
**Fichier:** `app/staff/forbidden/page.tsx`

**Avant:** Div simple  
**Après:**
- Card centré avec AlertCircle icon (destructive red)
- Titre "Accès refusé" + description
- Deux boutons: Dashboard (outline) + Mon espace (ghost)
- Icons dans les boutons
- Responsive (full width sur mobile, max-w-md sur desktop)

---

## 🔧 Fichiers Modifiés (Détail)

### Nouveaux Fichiers (12)
```
src/lib/cn.ts                                  (class merge helper)
src/components/ui/button.tsx                   (Button component)
src/components/ui/card.tsx                     (Card system)
src/components/ui/badge-new.tsx                (Badge component)
src/components/ui/input.tsx                    (Input field)
src/components/ui/skeleton.tsx                 (Loading placeholder)
src/components/ui/select.tsx                   (Select dropdown)
src/components/ui/dialog.tsx                   (Modal dialog)
src/components/ui/dropdown-menu.tsx            (Dropdown menu)
src/components/ui/tabs.tsx                     (Tabs)
src/components/staff-layout.tsx                (Global staff layout)
app/staff/banklogs/layout.tsx                  (Force dynamic for banklogs)
```

### Fichiers Modifiés (8)
```
app/globals.css                                (Design tokens + colors)
app/staff/layout.tsx                           (New simple wrapper)
app/staff/dashboard/page.tsx                   (Modern KPI + cards)
app/staff/members/members-list-client.tsx      (Clean table)
app/staff/sanctions/page.tsx                   (Header + button)
app/staff/link/page.tsx                        (Centered card layout)
app/staff/forbidden/page.tsx                   (Accessible error page)
app/staff/banklogs/page.tsx                    (export dynamic marker)
```

---

## 🎭 Design Decisions

### Colors
- **Primary/Accent:** Tailwind default red-600 (changeable en `globals.css`)
- **Destructive:** Red (sanctions, errors)
- **Secondary:** Gray (informational)
- **Outline:** Border color (neutral)

### Typography
- **Font:** System font stack (Segoe UI, Helvetica, Apple, etc.)
- **Sizes:** sm (12px), base (16px), lg (18px), xl (20px), 3xl (30px)
- **Weights:** normal, medium (500), semibold (600), bold (800)

### Spacing
- **Grid:** 4px base unit (Tailwind default)
- **Cards:** 6px rounded-lg, shadow-sm (subtle)
- **Padding:** 6px (sm), 12px (md), 16px (lg), 24px (xl)

### Dark Mode
- Default: light mode
- Override: add `dark` class to `<html>` tag (e.g., `<html class="dark">`)
- All colors flip automatically via `:root` dark selector

---

## 🚀 Utilisation

### Ajouter un nouveau composant Shadcn
```bash
# Copier un template de composant depuis src/components/ui/*.tsx
# Adapter pour votre besoin
# Importer dans votre page/composant
```

### Ajouter une page staff
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MyPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mon Page</h1>
      <Card>
        <CardHeader>
          <CardTitle>Contenu</CardTitle>
        </CardHeader>
        <CardContent>...</CardContent>
      </Card>
    </div>
  );
}
```

### Utiliser des icônes
```tsx
import { AlertCircle, Users, FileText } from "lucide-react";

<AlertCircle className="h-5 w-5 text-destructive" />
```

---

## ✅ Validation & Testing

### Build Status
```
✅ npm run build → Compiled successfully in 5.6s
✅ TypeScript → No errors
✅ Static generation → 134/134 pages
```

### Pages Testées (Visuelles)
- [x] /staff/dashboard — KPI cards + recent items
- [x] /staff/members — Search + table
- [x] /staff/sanctions — Header + list
- [x] /staff/link — Centered form
- [x] /staff/forbidden — Error page
- [x] Layout sidebar/topbar — Desktop + mobile

### Notes de Sécurité
- ✅ Aucun changement aux guards (owner/chef/link)
- ✅ Aucun accès public ajouté
- ✅ Redirects préservées (`/staff/link`, `/staff/forbidden`)
- ✅ Audit logging inchangé

---

## 🎬 Prochaines Étapes (Optionnel)

1. **Dark Mode Toggle:** Ajouter un switch dans le user menu
2. **Theming:** Customiser les couleurs dans `globals.css`
3. **Animations:** Ajouter transition/animation pour hover states
4. **Pages Supplémentaires:** Appliquer le style à other pages (logs, recruitments, etc.)
5. **Composants Custom:** Créer des composants métier réutilisables

---

## 📚 Références

- **Shadcn/ui:** https://ui.shadcn.com
- **Tailwind CSS v4:** https://tailwindcss.com
- **Lucide Icons:** https://lucide.dev
- **Radix UI:** https://www.radix-ui.com

---

**Auteur:** Visual Design System V1  
**Date:** Janvier 2026  
**License:** Same as project
