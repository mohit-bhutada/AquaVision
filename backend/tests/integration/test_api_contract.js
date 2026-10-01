import app from '../../dist/index.js';

console.log("=== AQUAVISION ROUTE MOUNTING VERIFICATION ===");

const expectedV1Endpoints = [
  { method: 'GET', path: '/api/v1/projects' },
  { method: 'GET', path: '/api/v1/projects/:id' },
  { method: 'DELETE', path: '/api/v1/projects/:id' },
  { method: 'POST', path: '/api/v1/projects/:id/share' },
  { method: 'DELETE', path: '/api/v1/projects/:id/share' },
  { method: 'GET', path: '/api/v1/share/:token' },
  { method: 'POST', path: '/api/v1/projects/enhance' },
  { method: 'GET', path: '/api/v1/plans' },
  { method: 'GET', path: '/api/v1/subscriptions/me' },
  { method: 'POST', path: '/api/v1/subscriptions/requests' },
  { method: 'GET', path: '/api/v1/admin/me' },
  { method: 'GET', path: '/api/v1/admin/overview' },
  { method: 'GET', path: '/api/v1/admin/users' },
  { method: 'GET', path: '/api/v1/admin/users/:id' },
  { method: 'PATCH', path: '/api/v1/admin/users/:id/status' },
  { method: 'PATCH', path: '/api/v1/admin/users/:id/role' },
  { method: 'GET', path: '/api/v1/admin/subscription-requests' },
  { method: 'POST', path: '/api/v1/admin/subscription-requests/:id/approve' },
  { method: 'POST', path: '/api/v1/admin/subscription-requests/:id/reject' },
  { method: 'POST', path: '/api/v1/admin/credits/adjust' },
  { method: 'GET', path: '/api/v1/admin/projects' },
  { method: 'GET', path: '/api/v1/admin/audit-logs' },
  { method: 'GET', path: '/api/v1/admin/health' },
  { method: 'GET', path: '/api/v1/health' },
];

function checkRouteExists(app, method, urlPath) {
  let found = false;
  
  function inspectStack(stack, parentPrefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        const fullPath = (parentPrefix + layer.route.path).replace(/\/+/g, '/').replace(/\/$/, '');
        const targetPath = urlPath.replace(/\/$/, '');
        const routeMethod = Object.keys(layer.route.methods)[0]?.toUpperCase();
        if (routeMethod === method && fullPath === targetPath) {
          found = true;
          return;
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        let prefix = parentPrefix;
        if (layer.regexp) {
          const str = layer.regexp.toString();
          if (str.includes('api\\/v1')) prefix += '/api/v1';
          else if (str.includes('projects')) prefix += '/projects';
          else if (str.includes('share')) prefix += '/share';
          else if (str.includes('auth')) prefix += '/auth';
          else if (str.includes('admin')) prefix += '/admin';
          else if (str.includes('subscriptions')) prefix += '/subscriptions';
        }
        inspectStack(layer.handle.stack, prefix);
      }
    }
  }

  inspectStack(app._router.stack);
  return found;
}

let passed = 0;
let failed = 0;

expectedV1Endpoints.forEach((ep) => {
  const ok = checkRouteExists(app, ep.method, ep.path);
  if (ok) {
    console.log(`[PASS] ${ep.method} ${ep.path}`);
    passed++;
  } else {
    console.log(`[FAIL] ${ep.method} ${ep.path}`);
    failed++;
  }
});

console.log(`\nResults: ${passed} PASSED, ${failed} FAILED out of ${expectedV1Endpoints.length} endpoints`);
process.exit(failed > 0 ? 1 : 0);
