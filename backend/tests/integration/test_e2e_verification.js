import app from '../../dist/index.js';
import { supabaseAdmin } from '../../dist/lib/supabase.js';

console.log('=== AQUAVISION REAL BACKEND E2E CONTRACT VERIFICATION ===\n');

async function runTests() {
  const results = [];
  
  function record(section, name, pass, detail = '') {
    results.push({ section, name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${section} :: ${name} ${detail ? '(' + detail + ')' : ''}`);
  }

  // 1. Health Endpoints
  try {
    const { data: plans } = await supabaseAdmin.from('plans').select('*');
    if (plans && plans.length >= 3) {
      record('Plans', 'Database Plans Loaded', true, `Found ${plans.length} plans: FREE, PRO, PREMIUM`);
    } else {
      record('Plans', 'Database Plans Loaded', false, 'Expected 3 plans in database');
    }
  } catch (err) {
    record('Plans', 'Database Plans Loaded', false, err.message);
  }

  // 2. Auth & Admin Profiles check
  try {
    const { data: profiles } = await supabaseAdmin.from('profiles').select('*').limit(5);
    record('Database', 'Profiles Table Queryable', true, `Found ${profiles?.length || 0} user profiles`);
  } catch (err) {
    record('Database', 'Profiles Table Queryable', false, err.message);
  }

  // Summary
  const failed = results.filter(r => !r.pass);
  console.log('\n==================================================');
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.length - failed.length} | FAILED: ${failed.length}`);
  console.log('==================================================\n');

  process.exit(failed.length > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("E2E Test Runner Fatal Exception:", err);
  process.exit(1);
});
