/**
 * Stage 14.8H.1 — resolver shim for replaying REAL app modules under plain Node.
 *
 * The application's internal imports are extensionless because a bundler
 * resolves them. The captured-transcript replay deliberately loads those exact
 * modules rather than copies, so it needs the same resolution behaviour. This
 * shim is test tooling only: no application source is modified to accommodate it.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      for (const ext of ['.js', '.jsx', '.mjs']) {
        try {
          return await next(`${specifier}${ext}`, context);
        } catch { /* try the next extension */ }
      }
    }
    throw error;
  }
}
