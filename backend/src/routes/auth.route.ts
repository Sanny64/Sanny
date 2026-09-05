import { getProfileHandler } from "../controllers/auth.controller.js";
import { meResponseSchema } from "../schemas/auth.schema.js";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { verifyAccessTokenIdentity } from "../utils/access-token.js";
import {
  getCallbackUrl,
  getAccountLinkProofCallbackUrl,
  getAccountLinkFrontendUrl,
  getLogoutRedirectUrl,
  getSuccessRedirectUrl,
  requiredEnv,
} from "../utils/config.js";
import { buildAuthorizationScope } from "../utils/refresh-token.js";
import {
  clearSessionCookies,
  consumeLoginState,
  consumeAccountLinkProofState,
  createAccountLinkProofState,
  schedulePendingAccountLink,
  cancelPendingAccountLink,
  createLoginState,
  createSession,
  destroySession,
  getLoginStates,
  getSessionStoreClient,
  requireSession,
  setSessionCookies,
  setLoginStates,
} from "../utils/session.js";
import { logSecurityEvent } from "../utils/security-audit.js";
import { createOrGetSelfUser } from "../services/user.service.js";
import {
  Auth0SubjectConflictError,
  findSelfUserByEmail,
  updateSelfUserPrimarySub,
  updateUserEmailVerifiedBySub,
} from "../services/user.service.js";
import { isAuth0IdentityLinked } from "../utils/auth0-management.js";
import { createAccountLinkProof } from "../utils/account-link-proof.js";

async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri = getCallbackUrl(),
) {
  const domain = requiredEnv("AUTH0_DOMAIN");
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: requiredEnv("AUTH0_CLIENT_ID"),
      client_secret: requiredEnv("AUTH0_CLIENT_SECRET"),
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok)
    throw new Error(`Auth0 token exchange failed (${response.status})`);
  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token)
    throw new Error("Auth0 did not return an access token");
  const identity = await verifyAccessTokenIdentity(tokens.access_token);
  return {
    identity,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
  };
}

function getAuthErrorRedirectUrl(error: string, description?: string) {
  const redirectUrl = new URL(getSuccessRedirectUrl());
  redirectUrl.searchParams.set("authError", error);
  if (description) {
    redirectUrl.searchParams.set("authErrorDescription", description);
  }
  return redirectUrl.toString();
}

function getAccountLinkProofCompletionUrl(params: URLSearchParams) {
  const frontendUrl = new URL(getAccountLinkFrontendUrl());
  frontendUrl.pathname = "/account-link-proof-complete";
  frontendUrl.search = "";
  frontendUrl.hash = params.toString();
  return frontendUrl.toString();
}

async function accountLinkingConfirmationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = request.query as {
    primaryUserId?: string;
    secondaryUserId?: string;
    temporaryUserId?: string;
    state?: string;
  };
  const { primaryUserId, secondaryUserId, temporaryUserId, state } = query;

  if (!primaryUserId || !secondaryUserId || !state) {
    return reply.code(400).send({
      error: "Invalid request",
      message:
        "Missing required parameters: primaryUserId, secondaryUserId, state",
    });
  }
  if (
    temporaryUserId &&
    temporaryUserId !== primaryUserId &&
    temporaryUserId !== secondaryUserId
  ) {
    return reply.code(400).send({
      error: "Invalid request",
      message: "The temporary identity is not part of this account link.",
    });
  }

  const codeVerifier = randomBytes(64).toString("base64url");
  const proofState = await createAccountLinkProofState({
    codeVerifier,
    continuationState: state,
    primaryUserId,
    secondaryUserId,
    ...(temporaryUserId ? { temporaryUserId } : {}),
  });
  if (temporaryUserId) {
    await schedulePendingAccountLink({
      primaryUserId,
      secondaryUserId,
      temporaryUserId,
    });
  }

  const frontendUrl = new URL(getAccountLinkFrontendUrl());
  frontendUrl.searchParams.set("primaryUserId", primaryUserId);
  frontendUrl.searchParams.set("secondaryUserId", secondaryUserId);
  if (temporaryUserId) {
    frontendUrl.searchParams.set("temporaryUserId", temporaryUserId);
  }
  frontendUrl.searchParams.set("continuationState", state);
  frontendUrl.searchParams.set("proofState", proofState);

  return reply.redirect(frontendUrl.toString());
}

async function authRoutes(server: FastifyInstance) {
  server.get("/", async (request, reply) => {
    const codeVerifier = randomBytes(64).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const state = await createLoginState(codeVerifier);
    setLoginStates(reply, [...getLoginStates(request), state]);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: requiredEnv("AUTH0_CLIENT_ID"),
      redirect_uri: getCallbackUrl(),
      audience: requiredEnv("AUTH0_AUDIENCE"),
      scope: buildAuthorizationScope(),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return reply.redirect(
      `https://${requiredEnv("AUTH0_DOMAIN")}/authorize?${params}`,
    );
  });

  server.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
  }>("/callback", async (request, reply) => {
    if (request.query.error) {
      logSecurityEvent("oauth_callback_failed", {
        error: request.query.error,
        description: request.query.error_description ?? null,
        state: request.query.state ?? null,
        reason:
          "Auth0 callback reported an error: " +
          request.query.error +
          ": " +
          (request.query.error_description ?? ""),
      });
      return reply.redirect(
        getAuthErrorRedirectUrl(
          request.query.error,
          request.query.error_description,
        ),
      );
    }

    const outstandingStates = getLoginStates(request);
    if (
      !request.query.code ||
      !request.query.state ||
      !outstandingStates.includes(request.query.state)
    ) {
      logSecurityEvent("oauth_state_rejected", {
        reason: "Invalid authentication state",
        state: request.query.state ?? null,
        hasCode: Boolean(request.query.code),
        outstandingCount: outstandingStates.length,
      });
      return reply.redirect(
        getAuthErrorRedirectUrl("invalid_authentication_state"),
      );
    }

    const state = await consumeLoginState(request.query.state);
    if (!state) {
      logSecurityEvent("oauth_state_rejected", {
        reason: "Authentication state expired",
        state: request.query.state,
        hasCode: Boolean(request.query.code),
      });
      return reply.redirect(
        getAuthErrorRedirectUrl("authentication_state_expired"),
      );
    }

    setLoginStates(
      reply,
      outstandingStates.filter((value) => value !== request.query.state),
    );
    const auth = await exchangeCode(request.query.code, state.codeVerifier);
    const verifiedEmail = auth.identity.email;
    if (verifiedEmail && auth.identity.emailVerified) {
      const username =
        auth.identity.name ?? verifiedEmail.split("@")[0] ?? verifiedEmail;
      try {
        await createOrGetSelfUser({
          auth0Sub: auth.identity.sub,
          email: verifiedEmail,
          username,
        });
      } catch (error) {
        if (!(error instanceof Auth0SubjectConflictError)) throw error;
        const existingUser = await findSelfUserByEmail(verifiedEmail);
        if (
          !existingUser ||
          !(await isAuth0IdentityLinked(
            auth.identity.sub,
            existingUser.auth0Sub ?? `auth0|${existingUser.id}`,
          ))
        ) {
          logSecurityEvent("account_linking_needed", {
            attemptedAuth0Sub: auth.identity.sub,
            existingAuth0Sub: existingUser?.auth0Sub,
            email: verifiedEmail,
          });
          // This route is reached via a full-page browser redirect from
          // Auth0, not a fetch call, so a JSON body would just render as
          // plain text. Redirect back into the app with an error the
          // frontend already knows how to surface instead.
          return reply.redirect(
            getAuthErrorRedirectUrl(
              "account_linking_required",
              "This email is linked to another identity. Please confirm account linking through Auth0.",
            ),
          );
        }

        await updateSelfUserPrimarySub(verifiedEmail, auth.identity.sub);
        await cancelPendingAccountLink(
          auth.identity.sub,
          existingUser.auth0Sub ?? `auth0|${existingUser.id}`,
        );
      }
    }

    if (auth.identity.emailVerified) {
      try {
        await updateUserEmailVerifiedBySub(auth.identity.sub, true);
      } catch (error) {
        logSecurityEvent("email_verification_sync_error", {
          auth0Sub: auth.identity.sub,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const session = await createSession(auth.identity, auth.refreshToken);
    setSessionCookies(reply, session.sessionId, session.csrfToken);
    return reply.redirect(getSuccessRedirectUrl());
  });

  server.get("/confirm-account-linking", async (request, reply) => {
    return accountLinkingConfirmationHandler(request, reply);
  });

  server.get<{ Querystring: { state?: string } }>(
    "/account-link-proof/start",
    async (request, reply) => {
      const state = request.query.state;
      if (!state) return reply.code(400).send({ error: "Invalid request" });

      const raw = await getSessionStoreClient().get(
        `sanny:account-link-proof:${state}`,
      );
      if (!raw) return reply.code(400).send({ error: "Invalid request" });
      const pending = JSON.parse(raw) as {
        secondaryUserId: string;
      };
      const [provider] = pending.secondaryUserId.split("|", 1);
      const connection =
        provider === "google-oauth2"
          ? "google-oauth2"
          : requiredEnv("AUTH0_DATABASE_CONNECTION");
      const params = new URLSearchParams({
        response_type: "code",
        client_id: requiredEnv("AUTH0_CLIENT_ID"),
        redirect_uri: getAccountLinkProofCallbackUrl(),
        audience: requiredEnv("AUTH0_AUDIENCE"),
        scope: "openid profile email",
        state,
        prompt: "login",
        connection,
        link_proof: "true",
      });
      return reply.redirect(
        `https://${requiredEnv("AUTH0_DOMAIN")}/authorize?${params}`,
      );
    },
  );

  server.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
  }>("/account-link-proof/callback", async (request, reply) => {
    if (request.query.error) {
      logSecurityEvent("account_link_proof_failed", {
        error: request.query.error,
        description: request.query.error_description ?? null,
      });
      return reply.redirect(
        getAccountLinkProofCompletionUrl(
          new URLSearchParams({
            error:
              "Secondary authentication could not be completed. Please try again.",
          }),
        ),
      );
    }
    if (!request.query.code || !request.query.state) {
      return reply.code(400).send({ error: "Invalid request" });
    }
    const pending = await consumeAccountLinkProofState(request.query.state);
    if (!pending) return reply.code(400).send({ error: "Invalid request" });
    const auth = await exchangeCode(
      request.query.code,
      pending.codeVerifier,
      getAccountLinkProofCallbackUrl(),
    );
    if (auth.identity.sub !== pending.secondaryUserId) {
      logSecurityEvent("account_link_proof_rejected", {
        expectedSub: pending.secondaryUserId,
        actualSub: auth.identity.sub,
      });
      return reply.code(403).send({ error: "Forbidden" });
    }
    const proof = createAccountLinkProof(
      pending.primaryUserId,
      pending.secondaryUserId,
      requiredEnv("ACCOUNT_LINK_PROOF_SECRET"),
    );
    return reply.redirect(
      getAccountLinkProofCompletionUrl(new URLSearchParams({ proof })),
    );
  });

  server.post("/logout", async (request, reply) => {
    const hadSession = Boolean(request.cookies["__Host-sanny_session"]);
    logSecurityEvent("logout_requested", {
      sessionPresent: hadSession,
      method: request.method,
      path: request.url,
    });

    if (!hadSession) {
      logSecurityEvent("logout_without_session", {
        method: request.method,
        path: request.url,
      });
    }

    await destroySession(request);
    clearSessionCookies(reply);
    const logoutParams = new URLSearchParams({
      client_id: requiredEnv("AUTH0_CLIENT_ID"),
      post_logout_redirect_uri: getLogoutRedirectUrl(),
    });
    return reply.send({
      logoutUrl: `https://${requiredEnv("AUTH0_DOMAIN")}/oidc/logout?${logoutParams}`,
    });
  });

  server.get(
    "/me",
    {
      preHandler: [requireSession],
      schema: {
        security: [{ sessionCookie: [] }],
        description: "Returns the authenticated user's profile.",
        response: {
          200: meResponseSchema,
        },
      },
    },
    getProfileHandler,
  );
}

export default authRoutes;
