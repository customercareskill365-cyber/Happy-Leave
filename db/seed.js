import pg from 'pg';
import { hashPin } from '../netlify/functions/_lib/crypto.js';

/**
 * Seeds initial supervisor accounts (and optional dummy employees when SEED_DUMMY_EMPLOYEES=true).
 * Never hardcodes production PINs: reads INITIAL_SUP1_PIN / INITIAL_SUP2_PIN from env.
 */
async function main() {
  const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing NETLIFY_DATABASE_URL or DATABASE_URL.');
    process.exit(1);
  }

  const sup1Pin = process.env.INITIAL_SUP1_PIN;
  const sup2Pin = process.env.INITIAL_SUP2_PIN;
  if (!sup1Pin || !sup2Pin) {
    console.error('Set INITIAL_SUP1_PIN and INITIAL_SUP2_PIN environment variables before seeding.');
    process.exit(1);
  }

  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const pool = new pg.Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    const supervisors = [
      {
        fullName: process.env.INITIAL_SUP1_NAME || 'Supervisor One',
        employeeId: (process.env.INITIAL_SUP1_ID || 'SUP-01').toUpperCase(),
        pin: sup1Pin,
      },
      {
        fullName: process.env.INITIAL_SUP2_NAME || 'Supervisor Two',
        employeeId: (process.env.INITIAL_SUP2_ID || 'SUP-02').toUpperCase(),
        pin: sup2Pin,
      },
    ];

    for (const sup of supervisors) {
      const pinHash = await hashPin(sup.pin);
      await pool.query(
        `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
         VALUES ($1, $2, 'supervisor', $3, true, true)
         ON CONFLICT (employee_id) DO NOTHING`,
        [sup.fullName, sup.employeeId, pinHash],
      );
    }
    console.log('Initial supervisor accounts ensured.');

    if (process.env.SEED_DUMMY_EMPLOYEES === 'true') {
      const dummyPin = process.env.DUMMY_EMP_PIN || '1234';
      const dummyHash = await hashPin(dummyPin);
      const dummyNames = [
        ['EMP-101', 'Ananya Rao'],
        ['EMP-102', 'Vikram Nair'],
        ['EMP-103', 'Priya Sharma'],
        ['EMP-104', 'Karthik Menon'],
        ['EMP-105', 'Sneha Kulkarni'],
        ['EMP-106', 'Arjun Verma'],
        ['EMP-107', 'Meera Iyer'],
        ['EMP-108', 'Rohan Mehta'],
        ['EMP-109', 'Divya Krishnan'],
        ['EMP-110', 'Siddharth Joshi'],
        ['EMP-111', 'Neha Gupta'],
        ['EMP-112', 'Aditya Patel'],
      ];
      for (const [empId, name] of dummyNames) {
        await pool.query(
          `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
           VALUES ($1, $2, 'employee', $3, true, true)
           ON CONFLICT (employee_id) DO NOTHING`,
          [name, empId, dummyHash],
        );
      }
      console.log('12 dummy test employees ensured (all starting Not Updated).');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
