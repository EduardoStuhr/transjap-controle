import { useEffect, useRef } from "react";

type ScrollTarget = HTMLElement & {
  scrollIntoView(options?: ScrollIntoViewOptions): void;
};

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function findActiveTab(container: HTMLElement) {
  return container.querySelector<ScrollTarget>(
    '[data-active="true"], [data-state="active"], [aria-selected="true"]',
  );
}

export function useActiveTabScroll<T extends HTMLElement>(activeKey?: unknown) {
  const ref = useRef<T | null>(null);

  const scrollActiveIntoView = () => {
    if (!isMobileViewport()) return;

    const container = ref.current;
    if (!container) return;

    findActiveTab(container)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  useEffect(() => {
    if (!isMobileViewport()) return undefined;

    const frame = window.requestAnimationFrame(scrollActiveIntoView);
    return () => window.cancelAnimationFrame(frame);
  }, [activeKey]);

  useEffect(() => {
    if (!isMobileViewport()) return undefined;

    const container = ref.current;
    if (!container) return undefined;

    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === "childList" ||
            mutation.attributeName === "data-state" ||
            mutation.attributeName === "data-active" ||
            mutation.attributeName === "aria-selected",
        )
      ) {
        scrollActiveIntoView();
      }
    });

    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "data-active", "aria-selected"],
    });
    const frame = window.requestAnimationFrame(() => {
      scrollActiveIntoView();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return ref;
}
