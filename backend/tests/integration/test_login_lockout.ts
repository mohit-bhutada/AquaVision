import { 
  checkLoginLock, 
  recordFailedLogin, 
  recordSuccessfulLogin, 
  resetLoginLocks, 
  setCustomClock 
} from '../../src/middleware/loginLockout.js';
import { AppError } from '../../src/middleware/errorHandler.js';

let simulatedTime = Date.now();
setCustomClock(() => simulatedTime);

function advanceTimeByMinutes(minutes: number) {
  simulatedTime += minutes * 60 * 1000;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${description}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== STARTING LOGIN FAILED-ATTEMPT LOCKOUT TESTS ===\n');

  const testEmail = 'user.lockout.test@example.com';
  resetLoginLocks();
  simulatedTime = Date.now();
  setCustomClock(() => simulatedTime);

  // Test 1: Successful login initially
  recordSuccessfulLogin(testEmail);
  try {
    checkLoginLock(testEmail);
    assert(true, '1. Initial state / successful login allows login check');
  } catch {
    assert(false, '1. Initial state / successful login allows login check');
  }

  // Test 2: Wrong password #1 -> failure (normal message)
  let err = recordFailedLogin(testEmail);
  assert(err instanceof AppError && err.statusCode === 401 && err.message === 'Invalid email or password.', '2. Wrong password #1 -> 401 "Invalid email or password."');

  // Test 3: Wrong password #2 -> failure (normal message)
  err = recordFailedLogin(testEmail);
  assert(err instanceof AppError && err.statusCode === 401 && err.message === 'Invalid email or password.', '3. Wrong password #2 -> 401 "Invalid email or password."');

  // Test 4: Wrong password #3 -> warning with "2 attempts left"
  err = recordFailedLogin(testEmail);
  assert(
    err instanceof AppError && 
    err.statusCode === 401 && 
    err.message === 'You entered 3 wrong passwords. 2 attempts left.' &&
    err.details?.attemptsLeft === 2,
    '4. Wrong password #3 -> 401 warning "You entered 3 wrong passwords. 2 attempts left."'
  );

  // Test 5: Wrong password #4 -> warning with "1 attempt left"
  err = recordFailedLogin(testEmail);
  assert(
    err instanceof AppError && 
    err.statusCode === 401 && 
    err.message === 'You entered 4 wrong passwords. 1 attempt left.' &&
    err.details?.attemptsLeft === 1,
    '5. Wrong password #4 -> 401 warning "You entered 4 wrong passwords. 1 attempt left."'
  );

  // Test 6: Wrong password #5 -> ACCOUNT_LOCKED (10 minutes)
  err = recordFailedLogin(testEmail);
  assert(
    err instanceof AppError && 
    err.statusCode === 423 && 
    err.code === 'ACCOUNT_LOCKED' &&
    err.message === 'Too many failed login attempts. Your account is locked for 10 minutes.',
    '6. Wrong password #5 -> 423 ACCOUNT_LOCKED "Too many failed login attempts. Your account is locked for 10 minutes."'
  );

  // Test 7: Sixth login attempt during lock -> still blocked
  try {
    checkLoginLock(testEmail);
    assert(false, '7. Sixth attempt during lock should throw ACCOUNT_LOCKED');
  } catch (e: any) {
    assert(
      e instanceof AppError && 
      e.statusCode === 423 && 
      e.code === 'ACCOUNT_LOCKED' &&
      e.message.includes('Your account is temporarily locked. Try again in 10 minutes.'),
      '7. Sixth attempt during lock -> 423 "Your account is temporarily locked. Try again in 10 minutes."'
    );
  }

  // Test 8: Case sensitivity / client UI bypass attempt (e.g. UPPERCASE email) cannot bypass lock
  try {
    checkLoginLock('USER.LOCKOUT.TEST@EXAMPLE.COM');
    assert(false, '8. Case variation should NOT bypass lockout');
  } catch (e: any) {
    assert(
      e instanceof AppError && e.statusCode === 423,
      '8. Normalized email lockout prevents case-variation bypass'
    );
  }

  // Test 9: Lock active after 5 minutes
  advanceTimeByMinutes(5);
  try {
    checkLoginLock(testEmail);
    assert(false, '9. Lock should still be active after 5 minutes');
  } catch (e: any) {
    assert(
      e instanceof AppError && 
      e.statusCode === 423 &&
      e.message.includes('Try again in 5 minutes.'),
      '9. Lock active at 5 min -> message shows "Try again in 5 minutes."'
    );
  }

  // Test 10: Lock expires after full 10 minutes (advance another 5 min + 1 sec)
  advanceTimeByMinutes(5.1);
  try {
    checkLoginLock(testEmail);
    assert(true, '10. Lock expires after 10 minutes');
  } catch (e: any) {
    assert(false, '10. Lock should have expired after 10 minutes');
  }

  // Test 11: First wrong password after expiry starts a new sequence
  err = recordFailedLogin(testEmail);
  assert(
    err instanceof AppError && err.statusCode === 401 && err.message === 'Invalid email or password.',
    '11. First wrong password after expiry starts fresh attempt sequence (#1)'
  );

  // Test 12: Successful login resets failed attempts
  err = recordFailedLogin(testEmail); // attempt #2
  err = recordFailedLogin(testEmail); // attempt #3 ("You entered 3 wrong passwords. 2 attempts left.")
  recordSuccessfulLogin(testEmail);   // reset!
  
  err = recordFailedLogin(testEmail); // fresh attempt #1
  assert(
    err instanceof AppError && err.statusCode === 401 && err.message === 'Invalid email or password.',
    '12. Successful login resets attempt sequence to #1'
  );

  // Reset custom clock
  resetLoginLocks();

  console.log(`\n=== TEST SUMMARY ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
