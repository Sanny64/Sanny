import type { UpdateUserInput } from "../types/inputs.js";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";

const maxUserListPageSize = 50;
const defaultUserListPageSize = 25;

export class Auth0SubjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Auth0SubjectConflictError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUserListQuery(
  query: { page?: string | number; limit?: string | number } = {},
) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? defaultUserListPageSize);

  const normalizedPage =
    Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.trunc(limit), maxUserListPageSize)
      : defaultUserListPageSize;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

export async function findUsers(
  query: { page?: string | number; limit?: string | number } = {},
) {
  const { page, limit } = normalizeUserListQuery(query);

  return prisma.user.findMany({
    orderBy: { id: "asc" },
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function findSelfUserBySub(auth0Sub: string) {
  return prisma.user.findUnique({
    where: { auth0Sub },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function findSelfUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      email: true,
      username: true,
      auth0Sub: true,
    },
  });
}

export async function updateSelfUserPrimarySub(
  email: string,
  auth0Sub: string,
) {
  return prisma.user.update({
    where: { email: normalizeEmail(email) },
    data: { auth0Sub },
    select: { id: true, email: true, username: true },
  });
}

export async function findUserById(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function findUserByIdWithAuth0Sub(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, auth0Sub: true },
  });
}

export async function findUserDeletionTarget(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, auth0Sub: true },
  });
}

export async function updateUserById(userId: number, input: UpdateUserInput) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      username: input.username,
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function deleteUserById(userId: number) {
  const result = await prisma.user.deleteMany({
    where: { id: userId },
  });

  return result.count;
}

export async function updateSelfUserBySub(auth0Sub: string, username: string) {
  return prisma.user.update({
    where: { auth0Sub },
    data: { username },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function deleteSelfUserBySub(auth0Sub: string) {
  const result = await prisma.user.deleteMany({
    where: { auth0Sub },
  });
  return result.count;
}

/**
 * List local users whose Auth0 subject belongs to a social/non-database
 * connection (e.g. `google-oauth2|...`), i.e. rows that were never
 * reachable by the custom database connection's own delete.js script.
 * Used by the orphaned-social-user reconciliation job to find local rows
 * that need to be checked against Auth0 for existence.
 */
export async function findNonDatabaseConnectionUsers() {
  return prisma.user.findMany({
    where: {
      AND: [
        { auth0Sub: { not: null } },
        { NOT: { auth0Sub: { startsWith: "auth0|" } } },
      ],
    },
    select: { id: true, auth0Sub: true },
  });
}

/**
 * Sync the emailVerified flag from Auth0 onto the local user row.
 * Fail-safe: never marks a user as unverified, only ever sets it to true.
 */
export async function updateUserEmailVerifiedBySub(
  auth0Sub: string,
  emailVerified: boolean,
) {
  if (!emailVerified) {
    return null;
  }

  return prisma.user.update({
    where: { auth0Sub },
    data: { emailVerified: true },
    select: {
      id: true,
      email: true,
      username: true,
      emailVerified: true,
    },
  });
}

export async function createOrGetSelfUser(input: {
  auth0Sub: string;
  email: string;
  username: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);

  const existingBySub = await prisma.user.findUnique({
    where: { auth0Sub: input.auth0Sub },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  if (existingBySub) {
    const linkedUser = await prisma.user.update({
      where: { id: existingBySub.id },
      data: {
        email: normalizedEmail,
        username: existingBySub.username ?? input.username,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    return {
      created: false,
      user: {
        ...linkedUser,
        username: linkedUser.username ?? input.username,
      },
    };
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      username: true,
      auth0Sub: true,
    },
  });

  if (existingByEmail) {
    if (existingByEmail.auth0Sub !== input.auth0Sub) {
      throw new Auth0SubjectConflictError(
        "This email is already linked to another Auth0 identity. Link accounts in Auth0 before continuing.",
      );
    }

    const linkedUser = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        auth0Sub: input.auth0Sub,
        username: existingByEmail.username ?? input.username,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    return {
      created: false,
      user: {
        ...linkedUser,
        username: linkedUser.username ?? input.username,
      },
    };
  }

  let createdUser;
  try {
    createdUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        auth0Sub: input.auth0Sub,
        username: input.username,
        password: null,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingLinkedBySub = await prisma.user.findUnique({
        where: { auth0Sub: input.auth0Sub },
        select: {
          id: true,
          email: true,
          username: true,
        },
      });

      if (existingLinkedBySub) {
        return {
          created: false,
          user: {
            ...existingLinkedBySub,
            username: existingLinkedBySub.username ?? input.username,
          },
        };
      }

      throw error;
    }

    throw error;
  }

  return {
    created: true,
    user: {
      ...createdUser,
      username: createdUser.username ?? input.username,
    },
  };
}

/**
 * Find a user record with all fields (including password) for internal operations.
 * Used during account linking and account management operations.
 * @internal - Do not expose password to API responses.
 */
export async function findUserByAuth0SubFull(auth0Sub: string) {
  return prisma.user.findUnique({
    where: { auth0Sub },
    select: {
      id: true,
      email: true,
      username: true,
      auth0Sub: true,
      password: true,
      emailVerified: true,
    },
  });
}

/**
 * Merge two database user accounts after successful account linking in Auth0.
 *
 * Called after Auth0 has successfully linked the accounts via Management API.
 * This function consolidates the database records:
 * - Updates the primary record to have the password from the secondary (if secondary had one)
 * - Deletes the secondary record (Auth0 manages the linked identity)
 *
 * @param primaryAuth0Sub - The Auth0 subject of the primary account (the one that remains)
 * @param secondaryAuth0Sub - The Auth0 subject of the secondary account (to be merged/deleted)
 * @returns Merged user record with public fields only
 */
export async function mergeUserAccounts(
  primaryAuth0Sub: string,
  secondaryAuth0Sub: string,
) {
  const primaryUser = await findUserByAuth0SubFull(primaryAuth0Sub);
  if (!primaryUser) {
    throw new Error(`Primary user not found: ${primaryAuth0Sub}`);
  }

  const secondaryUser = await findUserByAuth0SubFull(secondaryAuth0Sub);
  if (!secondaryUser) {
    throw new Error(`Secondary user not found: ${secondaryAuth0Sub}`);
  }

  const dataToUpdate: {
    password?: string | null;
    emailVerified?: boolean;
  } = {};

  if (!primaryUser.password && secondaryUser.password) {
    dataToUpdate.password = secondaryUser.password;
  }

  if (!primaryUser.emailVerified && secondaryUser.emailVerified) {
    dataToUpdate.emailVerified = true;
  }

  if (Object.keys(dataToUpdate).length > 0) {
    await prisma.user.update({
      where: { id: primaryUser.id },
      data: dataToUpdate,
    });
  }

  await prisma.user.delete({
    where: { id: secondaryUser.id },
  });

  return prisma.user.findUnique({
    where: { auth0Sub: primaryAuth0Sub },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}
