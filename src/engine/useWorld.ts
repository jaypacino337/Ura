import { useEffect, useSyncExternalStore } from "react";
import { store, type Snapshot } from "./store";

/** Subscribe a component to the live world; re-renders once per tick. */
export function useWorld(): Snapshot {
  useEffect(() => {
    store.start();
  }, []);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export { store };
