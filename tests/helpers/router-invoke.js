
function findRouteLayer(router, method, routePath) {
  method = String(method || 'get').toLowerCase();
  const stack = router.stack || [];
  for (const layer of stack) {
    if (!layer || !layer.route) continue;
    const path = layer.route.path;
    const methods = layer.route.methods || {};
    if (path === routePath && methods[method]) {
      return layer;
    }
  }
  throw new Error(`Route not found: [${method.toUpperCase()}] ${routePath}`);
}

async function runHandlers(handlers, req, res) {
  let idx = 0;
  return new Promise((resolve, reject) => {
    res.__resolve = (val) => resolve(val);
    const next = (err) => {
      if (err) return reject(err);
      if (idx >= handlers.length) return resolve({ req, res });
      const handler = handlers[idx++];
      let advanced = false;
      const step = (stepErr) => {
        if (advanced) return;
        advanced = true;
        next(stepErr);
      };
      try {
        Promise.resolve(handler(req, res, step))
          .then(() => {
            if (res.__sent) resolve({ req, res });
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    };
    next();
  });
}

async function invokeRouter({ router, method = 'get', path, req, res }) {
  const layer = findRouteLayer(router, method, path);
  const chain = layer.route.stack.map((l) => l.handle);
  const out = await runHandlers(chain, req, res);
  return out;
}

module.exports = {
  invokeRouter,
  findRouteLayer,
};
