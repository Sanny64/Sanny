import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from 'selfsigned';
import { runComposeIntegration } from '../compose-integration.mjs';

export async function createRedisTestCertificates() {
  const directory = await mkdtemp(join(tmpdir(), 'sanny-redis-tls-'));
  try {
    const validity = {
      algorithm: 'sha256',
      keySize: 2048,
      notBeforeDate: new Date(Date.now() - 60_000),
      notAfterDate: new Date(Date.now() + 86_400_000),
    };
    const authority = await generate(
      [{ name: 'commonName', value: 'Sanny isolated Redis test CA' }],
      {
        ...validity,
        extensions: [
          { name: 'basicConstraints', cA: true, critical: true },
          {
            name: 'keyUsage',
            keyCertSign: true,
            cRLSign: true,
            critical: true,
          },
        ],
      }
    );
    const server = await generate([{ name: 'commonName', value: 'redis' }], {
      ...validity,
      ca: { key: authority.private, cert: authority.cert },
    });
    await chmod(directory, 0o755);
    await Promise.all([
      writeFile(join(directory, 'ca.crt'), authority.cert, { mode: 0o644 }),
      writeFile(join(directory, 'redis.crt'), server.cert, { mode: 0o644 }),
      writeFile(join(directory, 'redis.key'), server.private, { mode: 0o644 }),
    ]);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const certificatesDirectory = await createRedisTestCertificates();
  try {
    process.exitCode = await runComposeIntegration({
      composeFile: fileURLToPath(
        new URL(
          '../../../docker/compose/docker-compose.test.redis.yml',
          import.meta.url
        )
      ),
      projectPrefix: 'sanny-redis-tests-',
      service: 'sanny64-backend',
      environment: {
        SANNY_REDIS_TEST_CERTS: certificatesDirectory.replaceAll('\\', '/'),
      },
    });
  } finally {
    await rm(certificatesDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await main();
}
