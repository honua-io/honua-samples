export async function convergeSemanticAssertion(
  assertion,
  { maxAttempts, timeoutMs, intervalMs, now = Date.now, sleep = wait } = {},
) {
  if (typeof assertion !== "function") throw new TypeError("semantic assertion must be a function");
  assertPositiveInteger(maxAttempts, "maxAttempts");
  assertPositiveInteger(timeoutMs, "timeoutMs");
  assertPositiveInteger(intervalMs, "intervalMs");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof sleep !== "function") throw new TypeError("sleep must be a function");

  const startedAt = now();
  let attempts = 0;
  let lastError = null;
  let timedOut = false;

  while (attempts < maxAttempts) {
    if (attempts > 0 && now() - startedAt >= timeoutMs) {
      timedOut = true;
      break;
    }

    attempts += 1;
    try {
      await assertion(attempts);
      if (now() - startedAt > timeoutMs) {
        timedOut = true;
        lastError = `semantic assertion exceeded ${timeoutMs}ms convergence timeout`;
        break;
      }
      return { passed: true, attempts, maxAttempts, timeoutMs, timedOut: false, lastError };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempts >= maxAttempts) break;
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) {
      timedOut = true;
      break;
    }
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return { passed: false, attempts, maxAttempts, timeoutMs, timedOut, lastError };
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
