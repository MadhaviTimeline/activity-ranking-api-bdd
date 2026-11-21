/**
 * Placeholder for the Activity Ranking API, which does not exist yet.
 * It answers every request with 501 so the suite fails on behaviour ("expected 200,
 * received 501") instead of on connection errors. Replace it by pointing API_BASE_URL
 * at a real implementation.  Standalone: npx tsx placeholder-sut/server.ts
 */
import http from 'node:http';

export function createPlaceholderServer(): http.Server {
  return http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://placeholder').pathname;
    res.writeHead(501, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'The Activity Ranking API has not been implemented yet.',
          details: { method: req.method, path },
        },
      }),
    );
  });
}

export async function startPlaceholder(port: number): Promise<http.Server> {
  const server = createPlaceholderServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err) =>
      reject(new Error(`Placeholder SUT could not listen on port ${port}: ${err.message}`)),
    );
    server.listen(port, resolve); // all interfaces, so both localhost (::1) and 127.0.0.1 work
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  void startPlaceholder(port).then(() =>
    console.log(`Placeholder Activity Ranking API (501 everywhere) on http://localhost:${port}`),
  );
}
