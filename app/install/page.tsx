import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import InstallClient from "./install-client";

export const metadata: Metadata = {
  title: "Installer l'appli · Los Esperados",
  description:
    "Installe l'application Los Esperados sur ton téléphone (iPhone/Android) ou ton PC Windows et reçois tes notifications.",
};

// Page publique : la doc d'installation, à envoyer à tout le monde.
export const dynamic = "force-dynamic";

const WINDOWS_FILE = "los-esperados-setup.exe";

export default function InstallPage() {
  // On n'affiche le bouton Windows que si le .exe est réellement présent
  // (évite un lien mort tant que le build desktop n'est pas déposé).
  let windowsReady = false;
  let windowsVersion: string | null = null;
  try {
    const filePath = path.join(process.cwd(), "public", "downloads", WINDOWS_FILE);
    windowsReady = fs.existsSync(filePath);
    const versionPath = path.join(process.cwd(), "public", "downloads", "windows-version.txt");
    if (windowsReady && fs.existsSync(versionPath)) {
      windowsVersion = fs.readFileSync(versionPath, "utf8").trim() || null;
    }
  } catch {
    windowsReady = false;
  }

  return (
    <InstallClient
      windowsReady={windowsReady}
      windowsUrl={`/downloads/${WINDOWS_FILE}`}
      windowsVersion={windowsVersion}
    />
  );
}
