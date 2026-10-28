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
    for (const page of ['/', '/admin', '/email-profile.html', '/index-registration.html']) {
        const res = await fetch(BASE + page);
        assert.equal(res.status, 200, `${page} should load`);
    }
});

test('home page is the new GouMo landing page with its assets', async () => {
    const html = await fetch(BASE + '/').then((r) => r.text());
    assert.match(html, /Train like you mean it/);
    assert.match(html, /og:image/);
    for (const asset of ['/css/site.css', '/js/home.js', '/images/goumo-logo.png', '/images/og-preview.jpg', '/images/goutham.jpg']) {
        const res = await fetch(BASE + asset);
        assert.equal(res.status, 200, `${asset} should exist`);
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
        ['GET', '/api/admin/registrations'],
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

test('admin creates a drop-in with two classes and a crew practice', async () => {
    const slot = (name, date) => ({
        slot_name: name, difficulty_level: 'All Levels', capacity: 20,
        practice_date: date, start_time: '18:00', end_time: '19:30',
        location: 'Test Studio', pricing: { drop_in: 25 }
    });
    const dropIn = await api('POST', '/api/courses', {
        name: `Smoke Drop-in ${unique}`, course_type: 'drop_in',
        slots: [slot('Class 1', '2030-02-01'), slot('Class 2', '2030-02-08')]
    }, { admin: true });
    assert.equal(dropIn.status, 200, JSON.stringify(dropIn.body));

    const crew = await api('POST', '/api/courses', {
        name: `Smoke Crew Practice ${unique}`, course_type: 'crew_practice',
        slots: [slot('Practice', '2030-02-02')]
    }, { admin: true });
    assert.equal(crew.status, 200, JSON.stringify(crew.body));

    const crewTwoSlots = await api('POST', '/api/courses', {
        name: `Smoke Crew Practice Bad ${unique}`, course_type: 'crew_practice',
        slots: [slot('A', '2030-02-02'), slot('B', '2030-02-09')]
    }, { admin: true });
    assert.equal(crewTwoSlots.status, 400, 'crew practice limited to one class');
});

test('class fields: dates, instructor, style, crew-only and per-date fees', async () => {
    const dates = ['2030-03-05', '2030-03-12', '2030-03-19', '2030-03-26'];
    const created = await api('POST', '/api/courses', {
        name: `Smoke Series ${unique}`, course_type: 'multi-week',
        song_name: 'House', instructor: 'Goutham', required_student_type: 'any',
        session_dates: [dates[2], dates[0], dates[1], dates[3], dates[0]],   // unsorted + duplicate on purpose
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 20, day_of_week: 'Tuesday',
                  start_time: '18:15', end_time: '19:30', location: 'Test Studio', pricing: { full_package: 80, drop_in: 30 } }]
    }, { admin: true });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.courseId;

    const list = await api('GET', '/api/courses?active_only=true&include_crew=true');
    const course = list.body.find((c) => Number(c.id) === Number(id));
    assert.ok(course, 'new class listed');
    assert.deepEqual(JSON.parse(course.session_dates), dates, 'dates stored sorted and de-duplicated');
    assert.equal(course.instructor, 'Goutham');
    assert.equal(course.song_name, 'House');
    assert.equal(Number(course.full_course_price), 80);
    assert.equal(Number(course.per_class_price), 30);

    // Student picks 2 of the 4 dates: server works out 2 x $30 regardless of what the browser says
    const email = `dates.${unique}@example.com`;
    const reg = await api('POST', '/api/register', {
        first_name: 'Date', last_name: 'Picker', email, course_id: id,
        payment_amount: 1, registration_type: 'per-date', selected_dates: [dates[0], dates[2]]
    });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    assert.equal(reg.body.payment_amount, 60);

    const bad = await api('POST', '/api/register', {
        first_name: 'Date', email: `bad.${unique}@example.com`, course_id: id,
        payment_amount: 30, selected_dates: ['2031-01-01']
    });
    assert.equal(bad.status, 400, 'a date outside the class is rejected');

    const regs = await api('GET', '/api/admin/registrations', null, { admin: true });
    const rows = Array.isArray(regs.body) ? regs.body : (regs.body.registrations || []);
    const mine = rows.find((r) => Number(r.id) === Number(reg.body.registrationId));
    assert.deepEqual(JSON.parse(mine.selected_dates), [dates[0], dates[2]]);
    assert.equal(Number(mine.payment_amount), 60);

    // Edit: mark crew-only and drop a date
    const upd = await api('PUT', `/api/courses/${id}`, { required_student_type: 'crew_member', session_dates: dates.slice(0, 3) }, { admin: true });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const general = await api('GET', '/api/courses?active_only=true');
    assert.ok(!general.body.some((c) => Number(c.id) === Number(id)), 'crew-only class hidden from the general list');
    const all = await api('GET', '/api/courses?active_only=true&include_crew=true');
    const edited = all.body.find((c) => Number(c.id) === Number(id));
    assert.equal(edited.required_student_type, 'crew_member');
    assert.equal(JSON.parse(edited.session_dates).length, 3);
});

test('registration pages use the GouMo design system', async () => {
    for (const page of ['/email-profile.html?course=1', '/index-registration.html']) {
        const html = await fetch(BASE + page).then((r) => r.text());
        assert.match(html, /\/css\/site\.css/, `${page} links site.css`);
        assert.match(html, /\/css\/registration\.css/, `${page} links registration.css`);
        assert.doesNotMatch(html, /css\/styles\.css/, `${page} no longer uses the old stylesheet`);
    }
    const css = await fetch(BASE + '/css/registration.css');
    assert.equal(css.status, 200);
});

test('public class list can include crew-only classes', async () => {
    const all = await api('GET', '/api/courses?active_only=true&include_crew=true');
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.body));
    const general = await api('GET', '/api/courses?active_only=true');
    assert.ok(all.body.length >= general.body.length, 'include_crew lists at least as many classes');
});

test('waitlist: student joins and admin sees them', async () => {
    const email = `waitlist.${unique}@example.com`;
    const join = await api('POST', '/api/waitlist', {
        first_name: 'Wait', last_name: 'Lister', email, course_id: courseId, payment_amount: 100
    });
    assert.equal(join.status, 200, JSON.stringify(join.body));

    const list = await api('GET', `/api/admin/waitlists?course_id=${courseId}`, null, { admin: true });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const rows = Array.isArray(list.body) ? list.body : [];
    assert.ok(rows.length >= 1, 'waitlist entry listed for admin');
});

test('admin can save payment settings', async () => {
    const res = await api('PUT', '/api/settings', {
        venmo_username: 'test-venmo', zelle_recipient_name: 'Test Name', zelle_phone: '5555550199'
    }, { admin: true });
    assert.equal(res.status, 200);
    const settings = await api('GET', '/api/settings');
    assert.equal(settings.body.venmo_username, 'test-venmo');
    assert.equal(settings.body.zelle_phone, '5555550199');
});

test('removed features are gone', async () => {
    for (const [method, url] of [
        ['POST', '/api/competition/register'],
        ['GET', '/api/dance-series'],
        ['GET', '/competition']
    ]) {
        const res = await api(method, url, method === 'POST' ? {} : undefined);
        assert.equal(res.status, 404, `${method} ${url} should no longer exist`);
    }
});
