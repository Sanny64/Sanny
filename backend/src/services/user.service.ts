import type { CreateUserInput } from "../types/inputs.js";
import prisma from "../utils/prisma.js";
import { hashPassword } from "../utils/hash.js";

export async function createUser(input: CreateUserInput) {
  const { password, ...rest } = input;

  const { hash } = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      password: hash,
      ...rest,
    },
  });

  if (!user) {
    throw new Error("Failed to create user");
  }
  return user;
};

export async function findUserByEmailWithPassword(email: string) {
  return prisma.user.findUnique({
    where: { 
      email,
    },
    omit: {
      password: false,
    }
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: {
      email,
    },
  });
}

export async function findUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
    }
  });
}