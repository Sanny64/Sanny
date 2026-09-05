import { useEffect } from "react";

const channelName = "sanny-account-link-proof";

export default function AccountLinkingProofPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const proof = params.get("proof");
    const error = params.get("error");
    const message = proof
      ? { type: "proof", proof }
      : {
          type: "error",
          message:
            error ??
            "Secondary authentication could not be completed. Please try again.",
        };
    const channel = new BroadcastChannel(channelName);

    channel.postMessage(message);
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
    }
    channel.close();
    window.close();
  }, []);

  return <p>Completing account verification...</p>;
}
