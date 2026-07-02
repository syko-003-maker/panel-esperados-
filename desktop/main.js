"use strict";

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, session } = require("electron");
const path = require("path");

const SITE = "https://losesperados.fr";
// Suffixe d'User-Agent → le site active DesktopNotify (notifs natives) et
// sait qu'il tourne dans l'appli. Ne pas retirer.
const UA_SUFFIX = "LosEsperadosApp/1.0";
const APP_ID = "fr.losesperados.app";

let win = null;
let tray = null;
let isQuiting = false;

// Une seule instance : un 2e lancement ré-ouvre la fenêtre existante.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.setAppUserModelId(APP_ID); // requis pour les notifs Windows

  app.whenReady().then(() => {
    // Autoriser les notifications (l'affichage réel est géré par le site).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === "notifications" || permission === "background-sync");
    });

    createWindow();
    createTray();

    // Lancer au démarrage de Windows (masqué), pour recevoir les notifs.
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    }
  });

  app.on("before-quit", () => {
    isQuiting = true;
  });

  // Ne PAS quitter quand la fenêtre se ferme : on vit dans la barre des tâches.
  app.on("window-all-closed", () => {});
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: "#060406",
    title: "Los Esperados",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      partition: "persist:losesperados", // session (cookies NextAuth) persistante
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const ua = `${win.webContents.userAgent} ${UA_SUFFIX}`;
  win.webContents.setUserAgent(ua);
  win.loadURL(SITE, { userAgent: ua });

  win.once("ready-to-show", () => {
    // openAsHidden : au démarrage Windows on reste caché (barre des tâches).
    const launchedHidden = app.getLoginItemSettings().wasOpenedAsHidden;
    if (!launchedHidden) win.show();
  });

  // Fermeture (croix) → masquer dans la barre des tâches, ne pas quitter.
  win.on("close", (e) => {
    if (!isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Liens externes (target=_blank / window.open) → navigateur système.
  // Les navigations internes et l'OAuth Discord (même fenêtre) restent dans l'appli.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createTray() {
  const trayIcon = nativeImage
    .createFromPath(path.join(__dirname, "build", "icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip("Los Esperados");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Ouvrir Los Esperados", click: () => { if (win) { win.show(); win.focus(); } } },
      { type: "separator" },
      { label: "Quitter", click: () => { isQuiting = true; app.quit(); } },
    ])
  );
  tray.on("click", () => {
    if (!win) return;
    if (win.isVisible() && win.isFocused()) win.hide();
    else { win.show(); win.focus(); }
  });
}
