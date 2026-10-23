import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runInThisContext } from 'node:vm';
import makeAsynchronous from 'make-asynchronous';

const filename = fileURLToPath(import.meta.url);

/**
 * Run a self-contained callback in a cancellable worker inside a separate process.
 * Process isolation also contains heap exhaustion and blocked libuv file operations.
 * Like make-asynchronous, callbacks must import dependencies internally and receive
 * external values as arguments. Arguments must be JSON-serializable.
 */
export async function runIsolatedRegression<Args extends unknown[]>(
  regression: (...args: Args) => Promise<void>,
  args: Args,
  options: { timeout: number; baseUrl: string }
): Promise<void> {
  await promisify(execFile)(
    process.execPath,
    [
      ...process.execArgv,
      '--max-old-space-size=512',
      filename,
      '--isolated-regression',
      regression.toString(),
      JSON.stringify(args),
      String(options.timeout),
      options.baseUrl
    ],
    { timeout: options.timeout, killSignal: 'SIGKILL' }
  );
}

// This module doubles as the child-process entry point; no test module is loaded here.
if (process.argv[1] === filename && process.argv[2] === '--isolated-regression') {
  const [, , , source, args, timeout, baseUrl] = process.argv;
  // Reconstruct only the trusted test callback serialized by runIsolatedRegression.
  const regression = runInThisContext(`(${source})`) as (...args: unknown[]) => Promise<void>;
  await makeAsynchronous(regression, { baseUrl }).withSignal(AbortSignal.timeout(Number(timeout)))(...JSON.parse(args));
}
