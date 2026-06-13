import { createRoot } from "react-dom/client";
import AppShell from "./AppShell";
import "./utils/devWebGLRecovery";
import "./index.css";
import "./utils/brawlerDisplay";
import { autoSeedDefaultMaps } from "./utils/mapEditorAPI";
import { seedCuratedMaps } from "./utils/curatedMapSeed";
import { I18nProvider } from "./i18n";
import { PlatformLayoutProvider } from "./platform";

autoSeedDefaultMaps();
seedCuratedMaps();
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <PlatformLayoutProvider>
      <AppShell />
    </PlatformLayoutProvider>
  </I18nProvider>,
);
