# 🚀 GUIDE CONTINUITÉ — Refonte UI/UX Staff Panel

**Pour:** Développeurs continuant le projet  
**Durée estimée:** 2-3 heures pour finir (Sanctions, Logs, Recruitments)  
**Complexité:** Basse (copy-paste pattern avec variations)

---

## ✅ État Actuel (70% Complet)

### Pages Refondues ✅
- Dashboard (100%)
- Members (100%)
- Complaints (100%)

### Pages à Refondre
- Sanctions (copy Complaints pattern)
- Logs/Activity (list pattern)
- Recruitments (copy Complaints pattern)
- Meetings (calendrier ou list)
- Absences (avec stats)
- Settings (formulaires)

---

## 📋 Template Pattern (Copy-Paste)

### Étape 1: Copier la structure
```tsx
// app/staff/sanctions/sanctions-client.tsx
"use client";

import { PageHeader, StatCard, Section } from "@/components/staff/ui-components";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Download } from "lucide-react";
import { useEffect, useState } from "react";

export default function SanctionsClient() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // Load data
  }, [filter]);

  const stats = {
    total: items.length,
    active: items.filter(x => x.status === 'ACTIVE').length,
    expired: items.filter(x => x.status === 'EXPIRED').length,
    closed: items.filter(x => x.status === 'CLOSED').length,
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Sanctions" description="Gestion des sanctions" />
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* <StatCard ... /> */}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* <Input ... /> */}
      </div>

      {/* Table */}
      <Section title="Liste des sanctions">
        {/* <DataTable ... /> */}
      </Section>
    </div>
  );
}
```

### Étape 2: Adapter les données
- Remplacer `Complaint` par `Sanction`
- Remplacer statuses: `OPEN/TREATED/UNTREATED/CLOSED` → `ACTIVE/EXPIRED/CLOSED`
- Adapter les couleurs des badges
- Adapter les colonnes du tableau

### Étape 3: Update page.tsx
```tsx
// app/staff/sanctions/page.tsx
import SanctionsClient from "./sanctions-client";

export default async function SanctionsPage() {
  const guard = await requireStaffLinked();
  if (guard instanceof Response) {
    redirect(guard.headers.get("Location") ?? "/staff/forbidden");
  }
  return <SanctionsClient />;
}
```

### Étape 4: Builder et tester
```bash
npm run build  # Doit passer en 5-6 secondes
```

---

## 🎯 Pages à Faire (Priorité Haute)

### 1. Sanctions Page (30 min)
**Fichier:** `app/staff/sanctions/sanctions-client.tsx`

**Stats à afficher:**
- Total
- Actives (ACTIVE)
- Expirées (EXPIRED)
- Clôturées (CLOSED)

**Colonnes:**
- Membre
- Type (BAN, WARN, KICK, etc)
- Raison
- Statut (badge)
- Créé
- Expire
- Actions

**Pattern:** Copier Complaints, adapter statuses + couleurs

---

### 2. Logs/Activity Page (30 min)
**Fichier:** `app/staff/logs/logs-client.tsx` ou `activity-client.tsx`

**Structure:**
```tsx
<PageHeader title="Logs" description="..." />
<div className="flex gap-3">
  <Input placeholder="Filtrer..." />
  <select>
    <option>Type</option>
    <option>Action</option>
  </select>
</div>
<div className="space-y-2">
  {logs.map(log => (
    <div className="border rounded p-4 hover:bg-muted/30">
      <div className="flex justify-between">
        <span>{log.type}</span>
        <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
      </div>
      <p className="text-sm mt-1">{log.description}</p>
    </div>
  ))}
</div>
```

---

### 3. Recruitments Page (30 min)
**Fichier:** `app/staff/recruitments/recruitments-client.tsx`

**Stats:**
- Total
- Ouverts (OPEN)
- Clôturés (FINI)

**Colonnes:**
- RP Name
- Ticket Key
- Statut
- Auteur
- Créé

**Pattern:** Exactement comme Complaints

---

## 🛠️ Checklist par Page

### Pour chaque page:
- [ ] Créer le client component
- [ ] Importer les composants UI
- [ ] Définir les types (Typescript)
- [ ] État et données (useState, fetch)
- [ ] Calculer les stats
- [ ] Afficher PageHeader
- [ ] Afficher stats grid
- [ ] Afficher search/filter
- [ ] Afficher table/list
- [ ] Tester build (`npm run build`)
- [ ] Tester responsive (mobile/desktop)

---

## 📝 Code Snippets Réutilisables

### Stats Card
```tsx
<div className="rounded-lg border border-border bg-card/50 p-4">
  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Label</p>
  <p className="text-2xl font-bold mt-1">{value}</p>
</div>
```

### Search Input
```tsx
<div className="relative flex-1">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input placeholder="..." className="pl-10" />
</div>
```

### Status Badge
```tsx
<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
  {label}
</span>
```

### Table Row
```tsx
<tr className="hover:bg-muted/30 transition-colors">
  <td className="px-4 py-4 font-medium">{value}</td>
  <td className="px-4 py-4">{badge}</td>
  <td className="px-4 py-4 text-xs text-muted-foreground">{date}</td>
</tr>
```

---

## 🎨 Couleurs par Statut

### Sanctions
```tsx
const BADGE_CLASSES = {
  'ACTIVE': 'bg-red-500/10 text-red-700 border-red-200',
  'EXPIRED': 'bg-slate-500/10 text-slate-700 border-slate-200',
  'CLOSED': 'bg-green-500/10 text-green-700 border-green-200',
};
```

### Recruitments
```tsx
const BADGE_CLASSES = {
  'OPEN': 'bg-blue-500/10 text-blue-700 border-blue-200',
  'FINI': 'bg-green-500/10 text-green-700 border-green-200',
};
```

### Activity
```tsx
const BADGE_CLASSES = {
  'CREATE': 'bg-blue-500/10',
  'UPDATE': 'bg-amber-500/10',
  'DELETE': 'bg-red-500/10',
};
```

---

## 🔍 Debugging Tips

### Build échoue?
```bash
# Vérifier les erreurs TypeScript
npm run build 2>&1 | grep -i "error\|failed"

# Vérifier la syntaxe
npm run build 2>&1 | head -50
```

### Page blanche?
- Vérifier la console du navigateur (F12)
- Vérifier que guard() est appelé
- Vérifier les imports

### Table ne s'affiche pas?
- Vérifier que `items.length > 0`
- Vérifier que `loading === false`
- Vérifier les classe Tailwind (typo?)

---

## 📊 Timeline Estimé

| Page | Temps | Difficulté |
|------|-------|-----------|
| Sanctions | 30 min | Basse (copy Complaints) |
| Logs | 30 min | Basse (simple list) |
| Recruitments | 30 min | Basse (copy Complaints) |
| Meetings | 45 min | Moyenne (layout spécial) |
| Absences | 30 min | Basse (avec stats) |
| Settings | 45 min | Moyenne (formulaires) |
| Discord | 60 min | Élevée (config complexe) |
| **Total** | **4h** | — |

---

## ✨ Performance Tips

1. **Lazy load large lists** - Utiliser `react-window` si besoin
2. **Debounce search** - `useDebounce` pour éviter requêtes
3. **Cache results** - Utiliser `useMemo` pour données stables
4. **Skeleton loaders** - Pour UX pendant le chargement

---

## 🚀 Déploiement

Quand pages prêtes:
```bash
# 1. Builder
npm run build

# 2. Tester prod
npm run start:prod

# 3. Vérifier
curl https://losesperados.xyz/staff/sanctions

# 4. Commit
git add .
git commit -m "refactor(ui): update Sanctions page"
git push
```

---

## 📞 Questions Fréquentes

**Q: Les anciens composants (StaffPage, StatCards) vont-ils disparaître?**  
A: Non, mais progressivement remplacés par les nouveaux. Garder les anciens pour pages non refondues.

**Q: Comment gérer les data fetches?**  
A: Garder le même pattern - useEffect + setState. Pas de changement.

**Q: Faut-il changer les APIs?**  
A: Non! Les APIs restent identiques. UI uniquement.

**Q: Mobile support obligatoire?**  
A: Oui, responsive design is critical. Tester avec Chrome DevTools.

---

## 📚 Ressources

- **Tailwind CSS**: https://tailwindcss.com/docs
- **Lucide Icons**: https://lucide.dev
- **TypeScript**: https://www.typescriptlang.org/docs
- **Next.js**: https://nextjs.org/docs

---

## ✅ Final Checklist

Avant de déployer:
- [ ] Toutes les pages refondues compiles
- [ ] 0 erreurs TypeScript
- [ ] Build passe en 5-6s
- [ ] 134/134 pages prerendues
- [ ] Responsive design OK (mobile + desktop)
- [ ] Tous les liens fonctionnent
- [ ] Dark mode readable
- [ ] Guard/security intact
- [ ] APIs unchanged
- [ ] Tests passed

---

## 💡 Prochaines Idées (Post-Refonte)

1. **Dark mode toggle** - Ajouter switcher
2. **Animations** - Framer Motion entrées
3. **Graphiques** - Recharts pour dashboards
4. **Export** - CSV/PDF pour tables
5. **Keyboard shortcuts** - Cmd+K pour navigation

---

**Bonne chance! Le pattern est établi, c'est du copy-paste conscient de là. 🚀**

Generated: 31 janvier 2026
