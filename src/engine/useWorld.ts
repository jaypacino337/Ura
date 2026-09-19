import { useEffect, useSyncExternalStore } from "react";
import { store } from "./store";

export function useWorld() {
  useEffect(() => {
    store.start();
  }, []);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export { store };
