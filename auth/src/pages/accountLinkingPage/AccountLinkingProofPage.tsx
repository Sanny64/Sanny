import { useEffect } from "react";
import { translations, useLanguage } from "@sanny/i18n";
import { proofResumeKey } from "../../utils/proof-resume";

const channelName = "sanny-account-link-proof";

export default function AccountLinkingProofPage() {
  const failureMessage =
    translations[useLanguage().language].shared.notifications
      .accountLinkAuthenticationFailed;
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const proof = params.get("proof");
    const error = params.get("error");
    const message = proof
      ? { type: "proof", proof }
      : {
          type: "error",
          message: error ?? failureMessage,
        };
    if (proof) {
      try {
        sessionStorage.removeItem(proofResumeKey);
      } catch {
        console.error(
          "Could not clear the completed account verification state.",
        );
      }
    }
    const channel = new BroadcastChannel(channelName);

    channel.postMessage(message);
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
    }
    channel.close();
    window.close();
  }, [failureMessage]);

  return <p>Completing account verification...</p>;
}
