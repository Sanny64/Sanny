import { getProfileHandler } from "../controllers/auth.controller.js";
import {
    meResponseSchema,
} from "../schemas/auth.schema.js";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import type { AccessTokenIdentity } from "../utils/access-token.js";
import { createSession, clearSessionCookies, destroySession, setSessionCookies, STATE_COOKIE } from "../utils/session.js";
import { requireAuthOrSession } from "../utils/session.js";

function requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} environment variable must be set`);
    return value;
}

function callbackUrl() {
    return process.env.AUTH0_CALLBACK_URL ?? "http://localhost:3000/api/v001/auth/callback";
}

async function exchangeCode(code: string): Promise<{ identity: AccessTokenIdentity; accessToken: string }> {
    const domain = requiredEnv("AUTH0_DOMAIN");
    const response = await fetch(`https://${domain}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", client_id: requiredEnv("AUTH0_CLIENT_ID"), client_secret: requiredEnv("AUTH0_CLIENT_SECRET"), code, redirect_uri: callbackUrl() }),
    });
    if (!response.ok) throw new Error(`Auth0 token exchange failed (${response.status})`);
    const tokens = await response.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error("Auth0 did not return an access token");
    const profileResponse = await fetch(`https://${domain}/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error(`Auth0 userinfo failed (${profileResponse.status})`);
    const profile = await profileResponse.json() as { sub?: string; email?: string; name?: string };
    if (!profile.sub) throw new Error("Auth0 userinfo did not return a subject");
    return {
        identity: { sub: profile.sub, email: profile.email ?? null, name: profile.name ?? null, roles: [], permissions: [], audiences: [] },
        accessToken: tokens.access_token,
    };
}

async function authRoutes(server: FastifyInstance) {
    server.get('/', async (_request, reply) => {
        const state = randomBytes(32).toString('base64url');
        reply.setCookie(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax', path: '/' });
        const params = new URLSearchParams({ response_type: 'code', client_id: requiredEnv('AUTH0_CLIENT_ID'), redirect_uri: callbackUrl(), audience: requiredEnv('AUTH0_AUDIENCE'), scope: 'openid profile email offline_access', state });
        return reply.redirect(`https://${requiredEnv('AUTH0_DOMAIN')}/authorize?${params}`);
    });

    server.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/callback', async (request, reply) => {
        if (request.query.error) return reply.code(401).send({ error: request.query.error });
        if (!request.query.code || !request.query.state || request.query.state !== request.cookies[STATE_COOKIE]) return reply.code(400).send({ error: 'Invalid authentication state' });
        const auth = await exchangeCode(request.query.code);
        const session = createSession(auth.identity, auth.accessToken);
        setSessionCookies(reply, session.sessionId, session.csrfToken);
        reply.clearCookie(STATE_COOKIE, { path: '/' });
        return reply.redirect(process.env.AUTH0_SUCCESS_REDIRECT ?? 'http://localhost:5173/');
    });

    server.post('/logout', async (request, reply) => {
        destroySession(request);
        clearSessionCookies(reply);
        return reply.code(204).send();
    });

    server.get('/me', {
        preHandler: [requireAuthOrSession(server)],
        schema: {
            security: [{ bearerAuth: [] }],
            description: "Returns the authenticated user's profile.",
            response: {
                200: meResponseSchema,
            }
        }
    }, getProfileHandler);
}

export default authRoutes;