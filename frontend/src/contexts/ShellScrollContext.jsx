import { createContext } from "react";

/** RefObject to the app's main scroll container (`main.app-shell__main`), or null on auth routes. */
export const ShellScrollContext = createContext(
  /** @type {import("react").RefObject<HTMLElement | null> | null} */ (null)
);
