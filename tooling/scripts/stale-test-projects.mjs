import { spawn } from 'node:child_process';

export function selectStaleTestProjects(projectNames, prefix, isProcessAlive) {
  return [...new Set(projectNames)].filter((name) => {
    if (typeof name !== 'string' || !name.startsWith(prefix)) return false;
    const ownerPid = name.slice(prefix.length);
    return /^\d+$/.test(ownerPid) && !isProcessAlive(Number(ownerPid));
  });
}

function isProcessAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function listProjectLabels(resource) {
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      [
        resource,
        'ls',
        ...(resource === 'container' ? ['--all'] : []),
        '--filter',
        'label=com.docker.compose.project',
        '--format',
        '{{.Label "com.docker.compose.project"}}',
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    );
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', () => resolve([]));
    child.once('close', (code) => {
      resolve(code === 0 ? output.split(/\r?\n/).filter(Boolean) : []);
    });
  });
}

// Includes volumes and networks because containers may already be pruned.
async function listComposeProjects() {
  const labels = await Promise.all(
    ['container', 'volume', 'network'].map(listProjectLabels)
  );
  return labels.flat();
}

// Hard-killed runs cannot tear down their own stack, so later runs remove it.
export async function removeStaleTestProjects(prefix, removeProject) {
  const names = selectStaleTestProjects(
    await listComposeProjects(),
    prefix,
    isProcessAlive
  );
  for (const name of names) {
    console.log(`Removing stale Docker Compose project ${name}`);
    await removeProject(name);
  }
}
