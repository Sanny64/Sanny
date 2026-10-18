import { useEffect, useRef } from "react";
import { useLoaderData } from "react-router-dom";
import type { prepareProofResume } from "../../utils/proof-resume";

export default function AccountLinkingResumePage() {
  const { url, error } = useLoaderData<typeof prepareProofResume>();
  const started = useRef(false);

  useEffect(() => {
    if (!url || started.current) return;
    started.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    window.location.replace(url);
  }, [url]);

  return (
    <p role={error ? "alert" : "status"}>
      {error ?? "Returning to account verification..."}
    </p>
  );
}
