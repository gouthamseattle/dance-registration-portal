/**
 * Smoke tests: start the real server against a throwaway database and walk
 * through the main flows over HTTP, the same way the browser does.
 *
 * Run with: npm test
 * Needs a database the tests are allowed to wipe:
 *   - CI (GitHub Actions): a temporary Postgres, configured in .github/workflows/test.yml
 *   - Locally: DATABASE_URL pointing at a throwaway Postgres, with DATABASE_SSL=false
 * NEVER point DATABASE_URL at production when running tests.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const unique = Date.now();

let server;
let serverLog = '';
let adminCookie = '';

// --- small helpers -------------------------------------------------------

async function api(method, url, body, { admin = false } = {}) {
    const res = await fetch(BASE + url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(admin && adminCookie ? { Cookie: adminCookie } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
}

async function waitForServer(timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${BASE}/api/settings`);
            if (res.ok) return;
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Server did not start in time. Log:\n${serverLog}`);
}

// --- start / stop the server ---------------------------------------------

before(async () => {
    if (process.env.DATABASE_URL && /railway|rlwy/i.test(process.env.DATABASE_URL)) {
        throw new Error('Refusing to run tests against a Railway database.');
    }
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(PORT), ADMIN_PASSWORD },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', d => { serverLog += d; });
    server.stderr.on('data', d => { serverLog += d; });
    await waitForServer();
});

after(() => {
    if (server) server.kill();
    if (process.env.SHOW_SERVER_LOG) console.log(serverLog);
});

// --- tests ---------------------------------------------------------------

test('pages load', async () => {
    for (const page of ['/', '/admin', '/email-profile.html']) {
        const res = await fetch(BASE + page);
        assert.equal(res.status, 200, `${page} should load`);
    }
});

test('public settings include payment details', async () => {
    const res = await api('GET', '/api/settings');
    assert.equal(res.status, 200);
    assert.ok(res.body.venmo_username, 'venmo username present');
});

test('admin login rejects a wrong password', async () => {
    const res = await api('POST', '/api/admin/login', { username: 'admin', password: 'wrong' });
    assert.equal(res.status, 401);
});

test('admin login works with ADMIN_PASSWORD', async () => {
    const res = await api('POST', '/api/admin/login', { username: 'admin', password: ADMIN_PASSWORD });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    adminCookie = (res.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(adminCookie, 'session cookie returned');
});

test('sensitive endpoints require admin login', async () => {
    const cases = [
        ['PUT', '/api/registrations/1/payment', { payment_status: 'completed' }],
        ['POST', '/api/admin/create-test-profiles'],
        ['POST', '/api/test/make-course-available'],
        ['GET', '/api/admin/registrations'],
        ['GET', '/api/admin/competition/registrations'],
        ['PUT', '/api/settings', { registration_open: 'false' }]
    ];
    const open = [];
    for (const [method, url, body] of cases) {
        const res = await api(method, url, body);
        if (res.status !== 401) open.push(`${method} ${url} returned ${res.status}`);
    }
    assert.deepEqual(open, [], `These should require login: ${open.join('; ')}`);
});

// Shared state for the class registration flow
let courseId;
let registrationId;
const studentEmail = `student.${unique}@example.com`;

test('admin creates a course with a slot', async () => {
    await api('PUT', '/api/settings', { registration_open: 'true' }, { admin: true });
    const res = await api('POST', '/api/courses', {
        name: `Smoke Test Course ${unique}`,
        description: 'Created by automated tests',
        course_type: 'multi-week',
        duration_weeks: 4,
        start_date: '2030-01-05',
        end_date: '2030-01-26',
        slots: [{
            slot_name: 'Main Session',
            difficulty_level: 'All Levels',
            capacity: 2,
            day_of_week: 'Saturday',
            start_time: '10:00',
            end_time: '11:30',
            location: 'Test Studio',
            pricing: { full_package: 100 }
        }]
    }, { admin: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    courseId = res.body.id || res.body.courseId || res.body.course?.id;
    assert.ok(courseId, `course id returned: ${JSON.stringify(res.body)}`);
});

test('new student creates a profile', async () => {
    const check = await api('POST', '/api/check-student-profile', { email: studentEmail });
    assert.equal(check.status, 200, JSON.stringify(check.body));

    const res = await api('POST', '/api/create-student-profile', {
        email: studentEmail, first_name: 'Smoke', last_name: 'Tester'
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const dup = await api('POST', '/api/create-student-profile', {
        email: studentEmail, first_name: 'Smoke'
    });
    assert.equal(dup.status, 400, 'duplicate email rejected');
});

test('student registers; registration starts as pending', async () => {
    const res = await api('POST', '/api/register', {
        first_name: 'Smoke', last_name: 'Tester', email: studentEmail,
        course_id: courseId, payment_amount: 100
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    registrationId = res.body.registrationId;
    assert.ok(registrationId);

    // Registering again returns the same pending registration, not a duplicate
    const again = await api('POST', '/api/register', {
        first_name: 'Smoke', last_name: 'Tester', email: studentEmail,
        course_id: courseId, payment_amount: 100
    });
    assert.equal(again.body.registrationId, registrationId);
});

test('admin confirms payment; registration becomes completed', async () => {
    const res = await api('PUT', `/api/admin/registrations/${registrationId}/confirm-payment`, {}, { admin: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const list = await api('GET', '/api/admin/registrations', null, { admin: true });
    assert.equal(list.status, 200);
    const rows = Array.isArray(list.body) ? list.body : (list.body.registrations || []);
    const reg = rows.find(r => Number(r.id) === Number(registrationId));
    assert.ok(reg, 'registration listed for admin');
    assert.equal(reg.payment_status, 'completed');
});

test('paid student cannot register twice for the same course', async () => {
    const res = await api('POST', '/api/register', {
        first_name: 'Smoke', last_name: 'Tester', email: studentEmail,
        course_id: courseId, payment_amount: 100
    });
    assert.equal(res.status, 400);
});

test('closed registration is enforced', async () => {
    await api('PUT', '/api/settings', { registration_open: 'false' }, { admin: true });
    const res = await api('POST', '/api/register', {
        first_name: 'Late', email: `late.${unique}@example.com`,
        course_id: courseId, payment_amount: 100
    });
    assert.equal(res.status, 400);
    await api('PUT', '/api/settings', { registration_open: 'true' }, { admin: true });
});

test('competition: solo and duo/trio registration with price checks', async () => {
    await api('PUT', '/api/settings', {
        competition_registration_open: 'true',
        competition_solo_registration_open: 'true',
        competition_duotrio_registration_open: 'true'
    }, { admin: true });

    const wrongPrice = await api('POST', '/api/competition/register', {
        category: 'solo', dancer_name: 'Solo Dancer', email: `solo.${unique}@example.com`,
        contact_number: '5555550100', total_amount: 10
    });
    assert.equal(wrongPrice.status, 400, 'wrong solo amount rejected');

    const solo = await api('POST', '/api/competition/register', {
        category: 'solo', dancer_name: 'Solo Dancer', email: `solo.${unique}@example.com`,
        contact_number: '5555550100', total_amount: 30
    });
    assert.equal(solo.status, 200, JSON.stringify(solo.body));

    const trio = await api('POST', '/api/competition/register', {
        category: 'duo_trio', team_name: `Team ${unique}`, member_names: 'A, B, C',
        member_count: 3, poc_email: `team.${unique}@example.com`, poc_contact: '5555550101',
        total_amount: 90
    });
    assert.equal(trio.status, 200, JSON.stringify(trio.body));

    const list = await api('GET', '/api/admin/competition/registrations', null, { admin: true });
    assert.equal(list.status, 200);
    const rows = Array.isArray(list.body) ? list.body : (list.body.registrations || []);
    assert.ok(rows.some(r => Number(r.id) === Number(solo.body.registrationId)), 'solo entry listed');
});

test('competition: solo waitlist mode when solo spots are closed', async () => {
    await api('PUT', '/api/settings', { competition_solo_registration_open: 'false' }, { admin: true });
    const res = await api('POST', '/api/competition/register', {
        category: 'solo', dancer_name: 'Waitlisted Dancer', email: `wait.${unique}@example.com`,
        contact_number: '5555550102', total_amount: 30
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.waitlisted, true);
    await api('PUT', '/api/settings', { competition_solo_registration_open: 'true' }, { admin: true });
});
