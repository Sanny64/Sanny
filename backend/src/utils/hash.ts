import argon2 from "argon2";

export async function hashPassword(password: string) {

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  return { hash };
}

export async function verifyPassword(candidatePassword: string, hash: string) {
  if (await argon2.verify(hash, candidatePassword)) {

    console.log("Password is valid!");
    
  } else {

    console.log("Password is invalid!");
  }
  return await argon2.verify(hash, candidatePassword);
}
