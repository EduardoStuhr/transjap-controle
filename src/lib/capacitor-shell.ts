import { Capacitor } from "@capacitor/core";

const APP_CHROME_COLOR = "#05070c";
const ZERO_PX = "0px";

function setRootCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function isNativeAndroidShell() {
  return document.documentElement.classList.contains("capacitor-android");
}

function setViewportHeightVar() {
  if (typeof window === "undefined") return;
  const visualViewport = window.visualViewport;
  const viewportHeight =
    visualViewport?.height && visualViewport.height > 0
      ? visualViewport.height
      : window.innerHeight;
  const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
  const viewportBottomInset = Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop);

  setRootCssVar("--app-viewport-height", `${Math.round(viewportHeight)}px`);

  if (isNativeAndroidShell()) {
    setRootCssVar("--capacitor-navigation-bar-height", ZERO_PX);
    return;
  }

  setRootCssVar("--capacitor-navigation-bar-height", `${Math.round(viewportBottomInset)}px`);
}

export function installMobileViewportGuards() {
  if (typeof window === "undefined") return () => undefined;

  setViewportHeightVar();
  window.addEventListener("resize", setViewportHeightVar);
  window.visualViewport?.addEventListener("resize", setViewportHeightVar);
  window.visualViewport?.addEventListener("scroll", setViewportHeightVar);

  return () => {
    window.removeEventListener("resize", setViewportHeightVar);
    window.visualViewport?.removeEventListener("resize", setViewportHeightVar);
    window.visualViewport?.removeEventListener("scroll", setViewportHeightVar);
  };
}

export async function configureCapacitorShell() {
  if (typeof window === "undefined") return;

  try {
    const [{ Capacitor }, { StatusBar, Style }] = await Promise.all([
      import("@capacitor/core"),
      import("@capacitor/status-bar"),
    ]);

    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();
    document.documentElement.classList.add("capacitor-native", `capacitor-${platform}`);

    await StatusBar.show().catch(() => undefined);
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await StatusBar.setBackgroundColor({ color: APP_CHROME_COLOR }).catch(() => undefined);
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);

    if (platform === "android") {
      setRootCssVar("--capacitor-status-bar-height", ZERO_PX);
      setRootCssVar("--capacitor-navigation-bar-height", ZERO_PX);
      setViewportHeightVar();
      return;
    }

    const info = await StatusBar.getInfo().catch(() => null);
    const statusBarHeight =
      info?.height && info.height > 0 ? `${Math.round(info.height)}px` : ZERO_PX;
    setRootCssVar("--capacitor-status-bar-height", statusBarHeight);
    setViewportHeightVar();
  } catch {
    setRootCssVar("--capacitor-status-bar-height", ZERO_PX);
    setRootCssVar("--capacitor-navigation-bar-height", ZERO_PX);
    setRootCssVar("--android-safe-area-top", ZERO_PX);
    setRootCssVar("--android-safe-area-bottom", ZERO_PX);
    setRootCssVar("--android-safe-area-left", ZERO_PX);
    setRootCssVar("--android-safe-area-right", ZERO_PX);
  }
}

/**
 * Strict check: true only when running inside a Capacitor native shell.
 */
export function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}

/** Routes that belong to the operator-only mobile experience */
const OPERATOR_ROUTES = new Set(["/operador"]);

/** Returns true if the given pathname should be allowed in the native app */
export function isOperadorRoute(pathname: string): boolean {
  return OPERATOR_ROUTES.has(pathname);
}
