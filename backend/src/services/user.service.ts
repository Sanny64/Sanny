import type { UpdateUserInput } from "../types/inputs.js";
import prisma from "../utils/prisma.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

export async function findSelfUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

export async function findUserById(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

export async function updateUserById(userId: number, input: UpdateUserInput) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

export async function deleteUserById(userId: number) {
  await prisma.user.delete({
    where: { id: userId },
  });
}

export async function updateSelfUserByEmail(email: string, name: string) {
  return prisma.user.update({
    where: { email: normalizeEmail(email) },
    data: { name },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

export async function deleteSelfUserByEmail(email: string) {
  await prisma.user.delete({
    where: { email: normalizeEmail(email) },
  });
}

export async function createOrGetSelfUser(input: {
  email: string;
  name: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);

  const existingByEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (existingByEmail) {
    const linkedUser = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        email: normalizedEmail,
        name: existingByEmail.name ?? input.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return {
      created: false,
      user: {
        ...linkedUser,
        name: linkedUser.name ?? input.name,
      },
    };
  }

  const createdUser = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: input.name,
      password: "AUTH0_MANAGED",
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return {
    created: true,
    user: {
      ...createdUser,
      name: createdUser.name ?? input.name,
    },
  };
}
