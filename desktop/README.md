# Los Esperados — Application de bureau (Electron)

Fin wrapper Electron autour de `https://losesperados.fr` :

- **Ferme dans la barre des tâches** (la croix masque, ne quitte pas) → notifs actives.
- **Lance au démarrage** de Windows (masqué), instance unique, icône tray.
- **Notifications natives** : le web push ne marche pas dans Electron (pas de clés
  FCM), donc l'appli ajoute le suffixe d'User-Agent `LosEsperadosApp/1.0` ; le site
  détecte ce suffixe (composant `DesktopNotify`) et sonde `/api/me/notifications/recent`
  (bus mémoire côté panel) pour afficher des notifs natives. Filet de secours : le DM Discord.

## Reconstruire l'installeur Windows (depuis Linux)

Prérequis : `wine` + `wine32:i386` (electron-builder en a besoin pour éditer les
ressources du `.exe` et bâtir l'installeur NSIS — aucune signature).

```bash
cd desktop
npm install
npm run dist:win        # → dist/los-esperados-setup.exe
```

Puis publier pour le téléchargement (servi par le panel, non versionné) :

```bash
cp dist/los-esperados-setup.exe ../public/downloads/los-esperados-setup.exe
printf '1.0.0' > ../public/downloads/windows-version.txt
sudo systemctl restart panel-esperados.service   # Next fige la liste public/ au démarrage
```

La page `/install` détecte automatiquement le fichier et affiche le bouton de
téléchargement (sinon « bientôt disponible »).

## Notes

- **Installeur non signé** : Windows SmartScreen affiche « éditeur inconnu » →
  « Informations complémentaires » → « Exécuter quand même » (une fois). Un
  certificat de signature (~200-400 €/an) supprimerait l'avertissement, optionnel.
- Bump la `version` dans `package.json` à chaque nouvelle release.
