import { createRoot } from "react-dom/client";
import AppShell from "./AppShell";
import "./platform/contentProtection";
import "./utils/devWebGLRecovery";
import "./index.css";
import "./utils/brawlerDisplay";
import { autoSeedDefaultMaps } from "./utils/mapEditorAPI";
import { seedCuratedMaps } from "./utils/curatedMapSeed";
import { I18nProvider } from "./i18n";
import { PlatformLayoutProvider } from "./platform";
import { loadCloudRuntimeConfig } from "./lib/runtimeConfig";
import { getHeavyAssetBaseUrl } from "./lib/assetBase";
import { setRenderersBase } from "./game/miyaTopDownRenderer";

autoSeedDefaultMaps();
seedCuratedMaps();

async function boot() {
  await loadCloudRuntimeConfig();
  setRenderersBase(getHeavyAssetBaseUrl().replace(/\/$/, ""));
  const { initProfileCloudListeners } = await import("./utils/cloud/profileCloud");
  const { initAccountCloudListeners } = await import("./utils/cloud/accountCloud");
  const { initPartyServerBootstrap } = await import("./utils/cloud/partyServerBootstrap");
  const { initPresenceServerBootstrap } = await import("./utils/cloud/presenceServerBootstrap");
  initProfileCloudListeners();
  initAccountCloudListeners();
  initPartyServerBootstrap();
  initPresenceServerBootstrap();

  createRoot(document.getElementById("root")!).render(
    <I18nProvider>
      <PlatformLayoutProvider>
        <AppShell />
      </PlatformLayoutProvider>
    </I18nProvider>,
  );
}

void boot();
