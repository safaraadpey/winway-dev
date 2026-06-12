export type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function readEnvInsets(): SafeAreaInsets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
  document.documentElement.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

function isStandaloneDisplayMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function estimateAndroidInsets(): SafeAreaInsets {
  const vv = window.visualViewport;
  if (vv) {
    const top = Math.max(0, Math.round(vv.offsetTop));
    const left = Math.max(0, Math.round(vv.offsetLeft));
    const bottom = Math.max(
      0,
      Math.round(window.innerHeight - vv.height - vv.offsetTop)
    );
    const right = Math.max(
      0,
      Math.round(window.innerWidth - vv.width - vv.offsetLeft)
    );
    if (top > 0 || bottom > 0 || left > 0 || right > 0) {
      return { top, right, bottom, left };
    }
  }

  const screenGap = Math.max(0, window.screen.height - window.innerHeight);
  if (screenGap > 0) {
    const top = Math.round(screenGap * 0.35);
    return { top, right: 0, bottom: screenGap - top, left: 0 };
  }

  const rootFontSize =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return {
    top: Math.round(1.75 * rootFontSize),
    right: 0,
    bottom: Math.round(2.75 * rootFontSize),
    left: 0,
  };
}

export function measureSafeAreaInsets(): SafeAreaInsets {
  const envInsets = readEnvInsets();
  const hasEnvInsets =
    envInsets.top > 0 ||
    envInsets.right > 0 ||
    envInsets.bottom > 0 ||
    envInsets.left > 0;

  if (hasEnvInsets) {
    return envInsets;
  }

  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isStandaloneDisplayMode() && isAndroid) {
    return estimateAndroidInsets();
  }

  return envInsets;
}

export function applySafeAreaInsets(insets: SafeAreaInsets): void {
  const root = document.documentElement;
  root.style.setProperty("--safe-area-top", `${insets.top}px`);
  root.style.setProperty("--safe-area-right", `${insets.right}px`);
  root.style.setProperty("--safe-area-bottom", `${insets.bottom}px`);
  root.style.setProperty("--safe-area-left", `${insets.left}px`);
}

export function syncPwaDisplayClasses(): void {
  const root = document.documentElement;
  const standalone = isStandaloneDisplayMode();
  const isAndroid = /Android/i.test(navigator.userAgent);

  root.classList.toggle("pwa-standalone", standalone);
  root.classList.toggle("pwa-android", standalone && isAndroid);
}
