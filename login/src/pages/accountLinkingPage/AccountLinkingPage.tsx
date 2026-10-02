import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { showToast } from "@sanny/ui";
import { translations, useLanguage } from "@sanny/i18n";
import "../../styles/AccountLinkingPage.css";

const apiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_API_URL
  : import.meta.env.VITE_PROD_API_URL;
const proofChannelName = "sanny-account-link-proof";

type AccountLinkProofMessage = {
  type?: string;
  proof?: string;
  message?: string;
};

function getAccountLinkContinuationUrl({
  decision,
  continuationState,
  primaryUserId,
  secondaryUserId,
  temporaryUserId,
  proof,
}: {
  decision: "confirm" | "cancel";
  continuationState: string;
  primaryUserId: string;
  secondaryUserId: string;
  temporaryUserId: string | null;
  proof?: string;
}) {
  const continueUrl = new URL("/api/v001/auth/account-link/continue", apiUrl);
  continueUrl.searchParams.set("state", continuationState);
  continueUrl.searchParams.set("decision", decision);
  continueUrl.searchParams.set("primaryUserId", primaryUserId);
  continueUrl.searchParams.set("secondaryUserId", secondaryUserId);
  if (temporaryUserId)
    continueUrl.searchParams.set("temporaryUserId", temporaryUserId);
  if (proof) continueUrl.searchParams.set("proof", proof);
  return continueUrl.toString();
}

interface ParsedUserId {
  provider: string;
  providerUserId: string;
}

function parseAuth0UserId(userId: string): ParsedUserId | null {
  const separatorIndex = userId.indexOf("|");
  if (separatorIndex <= 0 || separatorIndex === userId.length - 1) {
    return null;
  }
  return {
    provider: userId.slice(0, separatorIndex),
    providerUserId: userId.slice(separatorIndex + 1),
  };
}

function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    "google-oauth2": "Google",
    auth0: "Email & Password",
    facebook: "Facebook",
    apple: "Apple",
  };
  return names[provider] || provider;
}

function getProviderIcon(provider: string): string {
  const icons: Record<string, string> = {
    "google-oauth2": "🔴",
    auth0: "🔐",
    facebook: "👨‍💼",
    apple: "🍎",
  };
  return icons[provider] || "🔗";
}

export default function AccountLinkingPage() {
  const notifications =
    translations[useLanguage().language].shared.notifications;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const primaryUserId = searchParams.get("primaryUserId");
  const secondaryUserId = searchParams.get("secondaryUserId");
  const proofUserId = searchParams.get("proofUserId");
  const temporaryUserId = searchParams.get("temporaryUserId");
  const continuationState = searchParams.get("continuationState");
  const proofState = searchParams.get("proofState");
  const expiresAtParam = searchParams.get("expiresAt");
  const expiresAt = expiresAtParam ? Number(expiresAtParam) : null;

  const [authWindowOpen, setAuthWindowOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [proof, setProof] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(
    () => expiresAt !== null && Date.now() >= expiresAt,
  );
  const hasCompletedProof = useRef(false);

  const primaryParsed = primaryUserId && parseAuth0UserId(primaryUserId);
  const secondaryParsed = secondaryUserId && parseAuth0UserId(secondaryUserId);
  const proofParsed = proofUserId && parseAuth0UserId(proofUserId);

  const hasValidParams =
    primaryParsed &&
    secondaryParsed &&
    proofParsed &&
    (proofUserId === primaryUserId || proofUserId === secondaryUserId) &&
    continuationState &&
    proofState;
  const validationError = !hasValidParams
    ? "Invalid request: missing account-linking parameters"
    : null;

  useEffect(() => {
    if (expiresAt === null || isExpired) return;
    const remainingMs = expiresAt - Date.now();
    const timeout = setTimeout(
      () => {
        setIsExpired(true);
        setAuthWindowOpen(false);
        setIsProcessing(false);
      },
      Math.max(remainingMs, 0),
    );
    return () => clearTimeout(timeout);
  }, [expiresAt, isExpired]);

  useEffect(() => {
    const channel = new BroadcastChannel(proofChannelName);
    function receiveProof(message: AccountLinkProofMessage) {
      if (!hasValidParams || (expiresAt !== null && Date.now() >= expiresAt))
        return;
      if (message.type === "error") {
        const errorMessage =
          typeof message.message === "string"
            ? message.message
            : notifications.accountLinkAuthenticationFailed;
        showToast(errorMessage);
        setAuthWindowOpen(false);
        setIsProcessing(false);
        return;
      }
      if (message.type !== "proof" || typeof message.proof !== "string") return;
      if (hasCompletedProof.current) return;
      hasCompletedProof.current = true;
      setProof(message.proof);
      setAuthWindowOpen(false);
      window.location.assign(
        getAccountLinkContinuationUrl({
          decision: "confirm",
          continuationState: continuationState!,
          primaryUserId: primaryUserId!,
          secondaryUserId: secondaryUserId!,
          temporaryUserId,
          proof: message.proof,
        }),
      );
    }
    function receiveWindowMessage(
      event: MessageEvent<AccountLinkProofMessage>,
    ) {
      if (event.origin !== window.location.origin) return;
      receiveProof(event.data);
    }
    const receiveChannelMessage = (
      event: MessageEvent<AccountLinkProofMessage>,
    ) => receiveProof(event.data);
    channel.addEventListener("message", receiveChannelMessage);
    window.addEventListener("message", receiveWindowMessage);
    return () => {
      channel.removeEventListener("message", receiveChannelMessage);
      window.removeEventListener("message", receiveWindowMessage);
      channel.close();
    };
  }, [
    continuationState,
    primaryUserId,
    secondaryUserId,
    temporaryUserId,
    hasValidParams,
    expiresAt,
    notifications.accountLinkAuthenticationFailed,
  ]);

  if (!hasValidParams) {
    return (
      <div className="account-linking-container">
        <div className="account-linking-card">
          <h1>Error</h1>
          <p className="error-message">{validationError}</p>
          <button onClick={() => navigate("/")} className="secondary">
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const primaryProvider = getProviderDisplayName(primaryParsed.provider);
  const secondaryProvider = getProviderDisplayName(secondaryParsed.provider);
  const proofProvider = getProviderDisplayName(proofParsed!.provider);
  const primaryIcon = getProviderIcon(primaryParsed.provider);
  const secondaryIcon = getProviderIcon(secondaryParsed.provider);

  function continueLinking(
    decision: "confirm" | "cancel",
    confirmedProof?: string,
  ) {
    setIsProcessing(true);
    window.location.assign(
      getAccountLinkContinuationUrl({
        decision,
        continuationState: continuationState!,
        primaryUserId: primaryUserId!,
        secondaryUserId: secondaryUserId!,
        temporaryUserId,
        proof: confirmedProof,
      }),
    );
  }

  function handleConfirm() {
    if (isExpired) return;

    if (proof) {
      continueLinking("confirm", proof);
      return;
    }

    setIsProcessing(true);
    setAuthWindowOpen(true);
    const authUrl = new URL(
      "/account-link-proof-resume",
      window.location.origin,
    );
    authUrl.hash = new URLSearchParams({
      state: proofState!,
      expiresAt: String(expiresAt),
    }).toString();

    const authWindow = window.open(
      authUrl.toString(),
      "auth",
      "width=600,height=700",
    );

    if (!authWindow) {
      showToast(notifications.accountLinkPopupBlocked(proofProvider));
      setAuthWindowOpen(false);
      setIsProcessing(false);
      return;
    }

    // Poll for the popup to close
    const checkPopup = setInterval(() => {
      if (authWindow.closed) {
        clearInterval(checkPopup);
        setAuthWindowOpen(false);
        setIsProcessing(false);
      }
    }, 500);
  }

  return (
    <div className="account-linking-container">
      <div className="account-linking-card">
        <h1>Link Your Accounts</h1>
        <p className="description">
          We found two accounts using the same email address. To continue,
          please confirm that you want to link these accounts. This will allow
          you to sign in with either method in the future.
        </p>

        <div className="accounts-display">
          <div className="account-item">
            <div className="account-icon">{primaryIcon}</div>
            <div className="account-info">
              <div className="account-provider">{primaryProvider}</div>
              <div className="account-label">Primary account</div>
              <div className="account-note">
                This account will be your main login.
              </div>
            </div>
          </div>

          <div className="arrow">↓</div>

          <div className="account-item">
            <div className="account-icon">{secondaryIcon}</div>
            <div className="account-info">
              <div className="account-provider">{secondaryProvider}</div>
              <div className="account-label">Will be linked to</div>
              <div className="account-note">
                You'll be able to use this to log in too.
              </div>
            </div>
          </div>
        </div>

        {isExpired && (
          <div className="error-banner">
            This linking request has expired. Please return to login and try
            again.
          </div>
        )}

        {!isExpired && !authWindowOpen && !proof && (
          <div className="warning">
            <strong>Security:</strong> To confirm linking, you will need to
            re-authenticate with your {proofProvider} account. This is a
            security measure to verify you own both accounts.
          </div>
        )}

        {!isExpired && proof && (
          <div className="success-banner">
            ✓ You've successfully authenticated with your {proofProvider}{" "}
            account. Now confirm to complete the linking.
          </div>
        )}

        {!isExpired && authWindowOpen && (
          <div className="auth-modal">
            <h2>Completing Authentication</h2>
            <p>
              A new window opened for you to authenticate with {proofProvider}.
            </p>
            <p>
              {proofProvider === "Email & Password"
                ? "Please enter your email and password."
                : `Please log in with your ${proofProvider} account.`}
            </p>
            <p>If the window closed unexpectedly, you can try again.</p>
            <div className="spinner"></div>
          </div>
        )}

        <div className="actions">
          <button
            onClick={() => continueLinking("cancel")}
            disabled={isProcessing}
            className="secondary"
          >
            Return to login
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || isExpired}
            className="primary"
          >
            {isExpired
              ? "Request expired"
              : isProcessing
                ? "Processing..."
                : proof
                  ? "Confirm & Complete Linking"
                  : "Authenticate & Continue"}
          </button>
        </div>

        <div className="help-text">
          You can manage or unlink your accounts anytime in your account
          settings.
        </div>
      </div>
    </div>
  );
}
