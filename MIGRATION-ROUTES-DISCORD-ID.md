# Migration de Routes Next.js - Ambiguïté [discordId] et [id]

## ✅ MIGRATION COMPLÈTE

### 📁 FICHIERS CRÉÉS

#### Pages Routes (Staff Pages)
- [app/staff/members/by-discord/[discordId]/page.tsx](app/staff/members/by-discord/[discordId]/page.tsx)
- [app/staff/members/by-discord/[discordId]/member-detail-client.tsx](app/staff/members/by-discord/[discordId]/member-detail-client.tsx)
- [app/staff/members/by-discord/[discordId]/history/page.tsx](app/staff/members/by-discord/[discordId]/history/page.tsx)
- [app/staff/members/by-discord/[discordId]/sanctions/page.tsx](app/staff/members/by-discord/[discordId]/sanctions/page.tsx)
- [app/staff/members/by-id/[id]/page.tsx](app/staff/members/by-id/[id]/page.tsx)
- [app/staff/members/by-id/[id]/member-edit-client.tsx](app/staff/members/by-id/[id]/member-edit-client.tsx)

#### API Routes
- [app/api/staff/members/by-discord/[discordId]/history/route.ts](app/api/staff/members/by-discord/[discordId]/history/route.ts)
- [app/api/staff/members/by-discord/[discordId]/sanctions/route.ts](app/api/staff/members/by-discord/[discordId]/sanctions/route.ts)
- [app/api/staff/members/by-id/[id]/route.ts](app/api/staff/members/by-id/[id]/route.ts)

---

### ✏️ FICHIERS MODIFIÉS

#### 1. [app/staff/members/members-list-client.tsx](app/staff/members/members-list-client.tsx)
```
- `/staff/members/${m.discordId}` → `/staff/members/by-discord/${m.discordId}`
```

#### 2. [app/staff/recruitments/recruitments-list-client.tsx](app/staff/recruitments/recruitments-list-client.tsx)
```
- `/staff/members/${r.authorDiscordId}` → `/staff/members/by-discord/${r.authorDiscordId}` (2 occurrences)
```

#### 3. [app/staff/sanctions/sanctions-client.tsx](app/staff/sanctions/sanctions-client.tsx)
```
- `/staff/members/${it.memberDiscordId}` → `/staff/members/by-discord/${it.memberDiscordId}`
```

#### 4. [app/staff/link/StaffLinkForm.tsx](app/staff/link/StaffLinkForm.tsx)
```
- `/api/staff/members/${link.id}?familyId=esperados` → `/api/staff/members/by-id/${link.id}?familyId=esperados`
```

#### 5. [app/staff/complaints-tickets/complaints-list-client.tsx](app/staff/complaints-tickets/complaints-list-client.tsx)
```
- `/staff/members/${c.authorDiscordId}` → `/staff/members/by-discord/${c.authorDiscordId}`
```

#### 6. [app/api/discord/member/route.ts](app/api/discord/member/route.ts)
```
- `/staff/members/${discordId}` → `/staff/members/by-discord/${discordId}` (panel URL generation)
```

#### 7. [app/staff/members/[discordId]/member-edit-client.tsx](app/staff/members/[discordId]/member-edit-client.tsx)
```
- `/api/staff/members/${discordId}/history` → `/api/staff/members/by-discord/${discordId}/history`
```

#### 8. [app/staff/members/[discordId]/history/page.tsx](app/staff/members/[discordId]/history/page.tsx)
```
- `/api/staff/members/${discordId}/history` → `/api/staff/members/by-discord/${discordId}/history`
```

#### 9. [app/staff/members/[discordId]/sanctions/page.tsx](app/staff/members/[discordId]/sanctions/page.tsx)
```
- `/api/staff/members/${params.discordId}/sanctions` → `/api/staff/members/by-discord/${params.discordId}/sanctions`
```

#### 10. [app/staff/members/[id]/member-edit-client.tsx](app/staff/members/[id]/member-edit-client.tsx)
```
- `/api/staff/members/${member.id}` → `/api/staff/members/by-id/${member.id}`
```

---

### 🗑️ FICHIERS À SUPPRIMER (Ancien modèle ambiguë)

Les anciens fichiers suivants peuvent être supprimés ou conservés comme fallback:
- `app/staff/members/[discordId]/` - Remplacé par `by-discord/[discordId]/`
- `app/staff/members/[id]/` - Remplacé par `by-id/[id]/`
- `app/api/staff/members/[discordId]/` - Remplacé par `by-discord/[discordId]/`
- `app/api/staff/members/[id]/` - Les routes restent disponibles pour les redirects

---

## 📊 RÉSUMÉ DE LA MIGRATION

| Élément | Avant | Après |
|---------|-------|-------|
| **Route de détail par Discord** | `/staff/members/[discordId]` | `/staff/members/by-discord/[discordId]` |
| **Route d'édition par ID** | `/staff/members/[id]` | `/staff/members/by-id/[id]` |
| **API Historique** | `/api/staff/members/[discordId]/history` | `/api/staff/members/by-discord/[discordId]/history` |
| **API Sanctions** | `/api/staff/members/[discordId]/sanctions` | `/api/staff/members/by-discord/[discordId]/sanctions` |
| **API Édition** | `/api/staff/members/[id]` | `/api/staff/members/by-id/[id]` |

---

## ✨ CHANGEMENTS INTERNES

Tous les liens internes à travers l'application ont été mis à jour pour pointer vers les nouvelles routes:
- ✅ **members-list-client**: Affichage de la liste des membres
- ✅ **recruitments-list-client**: Affichage des recrutements avec lien vers le membre
- ✅ **sanctions-client**: Affichage des sanctions avec lien vers le membre
- ✅ **StaffLinkForm**: Formulaire de liaison des membres
- ✅ **complaints-list-client**: Affichage des plaintes avec lien vers le membre
- ✅ **discord/member API**: Génération des URLs pour les intégrations Discord

---

## 🔍 VÉRIFICATION

La migration élimine complètement l'ambiguïté entre les paramètres `[discordId]` et `[id]` en les isolant dans des chemins distincts:
- `/staff/members/by-discord/[discordId]` - Routes basées sur Discord ID (lecture/détail)
- `/staff/members/by-id/[id]` - Routes basées sur Member ID (édition/modification)

Cette approche améliore:
- **Clarté**: Le chemin URL indique clairement quel paramètre est utilisé
- **Maintenabilité**: Pas de confusion possible entre les deux types d'identifiants
- **SEO/DX**: Routes plus explicites et prévisibles
