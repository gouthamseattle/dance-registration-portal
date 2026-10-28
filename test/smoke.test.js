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

test('combos: admin bundles classes; one checkout registers and confirms all of them', async () => {
    const mk = async (name, start, fee) => {
        const r = await api('POST', '/api/courses', {
            name: `${name} ${unique}`, course_type: 'multi-week', song_name: 'House', instructor: 'Goutham',
            session_dates: ['2030-05-07', '2030-05-14', '2030-05-21'],
            slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 10, day_of_week: 'Tuesday',
                      start_time: start, end_time: '21:00', location: 'Test Studio', pricing: { full_package: fee } }]
        }, { admin: true });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return r.body.courseId;
    };
    const l1 = await mk('Combo L1', '18:15', 80);
    const l2 = await mk('Combo L2', '19:30', 100);

    assert.equal((await api('POST', '/api/combos', { name: 'x', price: 150, course_ids: [l1] })).status, 401, 'admin only');
    const bad = await api('POST', '/api/combos', { name: 'Too small', price: 150, course_ids: [l1] }, { admin: true });
    assert.equal(bad.status, 400, 'needs at least 2 classes');

    const created = await api('POST', '/api/combos', { name: `Level 1 + 2 ${unique}`, price: 150, course_ids: [l1, l2] }, { admin: true });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const combo = created.body;
    assert.equal(combo.regular_total, 180);
    assert.equal(combo.savings, 30);

    const pub = await api('GET', '/api/combos');
    const listed = pub.body.find((c) => c.id === combo.id);
    assert.ok(listed, 'combo listed for students');
    assert.equal(listed.classes.length, 2);
    assert.ok(listed.classes[0].slots[0].start_time, 'class details included');

    // Student checks out once: a registration in each class, price split, same group
    const email = `combo.${unique}@example.com`;
    const reg = await api('POST', '/api/register-combo', { email, first_name: 'Combo', last_name: 'Student', combo_id: combo.id });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    assert.equal(reg.body.payment_amount, 150);
    assert.equal(reg.body.registrationIds.length, 2);

    // Trying again replaces the unpaid registrations instead of duplicating them
    const again = await api('POST', '/api/register-combo', { email, first_name: 'Combo', combo_id: combo.id });
    assert.equal(again.status, 200, JSON.stringify(again.body));

    const mineNow = async () => {
        const regs = await api('GET', '/api/admin/registrations', null, { admin: true });
        return regs.body.filter((r) => r.email === email);
    };
    let mine = await mineNow();
    assert.equal(mine.length, 2, 'one registration per class, no duplicates');
    assert.equal(mine.reduce((sum, r) => sum + Number(r.payment_amount), 0), 150, 'combo price split across classes');
    assert.ok(mine.every((r) => r.combo_name === combo.name));

    // Confirming one confirms the whole combo; cancelling one cancels both
    const confirm = await api('PUT', `/api/admin/registrations/${again.body.registrationId}/confirm-payment`, {}, { admin: true });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    mine = await mineNow();
    assert.ok(mine.every((r) => r.payment_status === 'completed'), 'both classes paid');

    const cancel = await api('PUT', `/api/admin/registrations/${again.body.registrationIds[1]}/cancel`, { reason: 'test' }, { admin: true });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    mine = await mineNow();
    assert.ok(mine.every((r) => r.payment_status === 'canceled'), 'both classes canceled');

    // Turned off: hidden from students; can't be deleted once used
    await api('PUT', `/api/combos/${combo.id}`, { is_active: false }, { admin: true });
    assert.ok(!(await api('GET', '/api/combos')).body.some((c) => c.id === combo.id), 'turned-off combo hidden');
    assert.equal((await api('DELETE', `/api/combos/${combo.id}`, null, { admin: true })).status, 400);
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

test('admin students list, crew toggle and payment method', async () => {
    assert.equal((await api('GET', '/api/admin/students')).status, 401, 'admin only');

    const cls = await api('POST', '/api/courses', {
        name: `Students Test ${unique}`, course_type: 'multi-week', session_dates: ['2030-06-02', '2030-06-09', '2030-06-16'],
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 10, day_of_week: 'Tuesday',
                  start_time: '18:00', end_time: '19:00', location: 'Test Studio', pricing: { full_package: 100 } }]
    }, { admin: true });
    assert.equal(cls.status, 200, JSON.stringify(cls.body));
    const email = `asha.${unique}@example.com`;
    const reg = await api('POST', '/api/register', {
        first_name: 'Asha', last_name: 'Student', email, course_id: cls.body.courseId, payment_amount: 100, payment_method: 'zelle'
    });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));

    let list = await api('GET', '/api/admin/students', null, { admin: true });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    let me = list.body.find((s) => s.email === email);
    assert.ok(me, 'student listed');
    assert.equal(me.pending_classes, 1);
    assert.equal(me.paid_classes, 0);

    const regs = await api('GET', '/api/registrations', null, { admin: true });
    assert.equal(regs.body.find((r) => Number(r.id) === Number(reg.body.registrationId)).payment_method, 'Zelle', 'chosen payment method recorded');

    const confirm = await api('PUT', `/api/admin/registrations/${reg.body.registrationId}/confirm-payment`, {}, { admin: true });
    assert.equal(confirm.status, 200);
    const after = await api('GET', '/api/registrations', null, { admin: true });
    assert.equal(after.body.find((r) => Number(r.id) === Number(reg.body.registrationId)).payment_method, 'Zelle', 'confirming keeps Zelle');

    const crew = await api('PUT', `/api/admin/students/${me.id}/classify`, { student_type: 'crew_member' }, { admin: true });
    assert.equal(crew.status, 200, JSON.stringify(crew.body));
    list = await api('GET', '/api/admin/students', null, { admin: true });
    me = list.body.find((s) => s.email === email);
    assert.equal(me.student_type, 'crew_member');
    assert.equal(me.paid_classes, 1);
});

test('admin page uses the GouMo design system', async () => {
    const res = await fetch(`${BASE}/admin`);
    const html = await res.text();
    assert.ok(html.includes('/css/admin.css'), 'new admin stylesheet');
    assert.ok(!html.includes('admin-styles.css'), 'old stylesheet gone');
    assert.ok(!html.includes('reportsSection'), 'reports merged into the dashboard');
    for (const id of ['classReport', 'pendingList', 'studentsList', 'registrationsTable']) {
        assert.ok(html.includes(`id="${id}"`), `${id} present`);
    }
});

test('checkout saves nothing until "I\'ve sent the payment"; per-class registration switch', async () => {
    const cls = await api('POST', '/api/courses', {
        name: `Switch Test ${unique}`, course_type: 'multi-week', session_dates: ['2030-07-07', '2030-07-14', '2030-07-21'],
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 10, day_of_week: 'Tuesday',
                  start_time: '18:00', end_time: '19:00', location: 'Test Studio', pricing: { full_package: 90 } }]
    }, { admin: true });
    assert.equal(cls.status, 200, JSON.stringify(cls.body));
    const id = cls.body.courseId;
    const email = `checkout.${unique}@example.com`;
    const body = { first_name: 'Check', last_name: 'Out', email, course_id: id, payment_amount: 90, payment_method: 'venmo' };

    // Check only: amount comes back, nothing is saved
    const check = await api('POST', '/api/register', { ...body, dry_run: true });
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.equal(check.body.payment_amount, 90);
    assert.ok(!check.body.registrationId);
    const before = await api('GET', '/api/registrations', null, { admin: true });
    assert.ok(!before.body.some((r) => r.email === email), 'no registration saved by the check');

    // Payment details work without a registration number
    const venmo = await api('POST', '/api/generate-venmo-link', { amount: 90, courseId: id, studentName: 'Check Out' });
    assert.equal(venmo.status, 200, JSON.stringify(venmo.body));
    assert.ok(venmo.body.paymentNote.includes(`Switch Test ${unique}`) && venmo.body.paymentNote.includes('Check Out'));
    const zelle = await api('POST', '/api/generate-zelle-payment', { amount: 90, courseId: id, studentName: 'Check Out' });
    assert.equal(zelle.status, 200, JSON.stringify(zelle.body));

    // Tapping "I've sent the payment" saves it
    const saved = await api('POST', '/api/register', body);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.ok(saved.body.registrationId);

    // Admin closes registration for just this class
    assert.equal((await api('PUT', `/api/courses/${id}/registration-open`, { open: false })).status, 401, 'admin only');
    const close = await api('PUT', `/api/courses/${id}/registration-open`, { open: false }, { admin: true });
    assert.equal(close.status, 200, JSON.stringify(close.body));
    const list = await api('GET', '/api/courses?active_only=true&include_crew=true');
    const listed = list.body.find((c) => Number(c.id) === Number(id));
    assert.ok(listed, 'closed class still listed');
    assert.ok(listed.registration_open === false || listed.registration_open === 0, 'listed as closed');
    const blocked = await api('POST', '/api/register', { ...body, email: `late2.${unique}@example.com`, dry_run: true });
    assert.equal(blocked.status, 400);
    assert.ok(blocked.body.registration_closed);

    // A combo containing a closed class is hidden and can't be booked
    const other = await api('POST', '/api/courses', {
        name: `Switch Other ${unique}`, course_type: 'multi-week', session_dates: ['2030-07-08', '2030-07-15', '2030-07-22'],
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 10, day_of_week: 'Wednesday',
                  start_time: '18:00', end_time: '19:00', location: 'Test Studio', pricing: { full_package: 90 } }]
    }, { admin: true });
    const combo = await api('POST', '/api/combos', { name: `Switch Combo ${unique}`, price: 150, course_ids: [id, other.body.courseId] }, { admin: true });
    assert.equal(combo.status, 200, JSON.stringify(combo.body));
    assert.ok(!(await api('GET', '/api/combos')).body.some((c) => c.id === combo.body.id), 'combo hidden while a class is closed');
    const comboTry = await api('POST', '/api/register-combo', { email: `combo2.${unique}@example.com`, combo_id: combo.body.id, dry_run: true });
    assert.equal(comboTry.status, 400);

    // Reopen
    await api('PUT', `/api/courses/${id}/registration-open`, { open: true }, { admin: true });
    assert.ok((await api('GET', '/api/combos')).body.some((c) => c.id === combo.body.id), 'combo back once reopened');
});

test('admin email status and test email report clearly', async () => {
    assert.equal((await api('GET', '/api/admin/email-status')).status, 401, 'admin only');
    const st = await api('GET', '/api/admin/email-status', null, { admin: true });
    assert.equal(st.status, 200, JSON.stringify(st.body));
    assert.ok(['Gmail API', 'Gmail SMTP', 'not configured'].includes(st.body.method), st.body.method);
    const sent = await api('POST', '/api/admin/send-test-email', { to: 'nobody@example.com' }, { admin: true });
    assert.equal(sent.status, 200);
    if (st.body.method === 'not configured') assert.equal(sent.body.success, false, 'no email set up in CI, so it reports why');
    assert.ok(sent.body.method, 'reports which method it tried');
});

test('privacy page is served', async () => {
    const res = await fetch(`${BASE}/privacy`);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes('Privacy'));
});

test('student profiles: admin history and notes; student "My classes" page', async () => {
    const cls = await api('POST', '/api/courses', {
        name: `Profile Test ${unique}`, course_type: 'multi-week', session_dates: ['2030-08-04', '2030-08-11', '2030-08-18'],
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 10, day_of_week: 'Tuesday',
                  start_time: '18:00', end_time: '19:00', location: 'Profile Studio', pricing: { full_package: 70 } }]
    }, { admin: true });
    assert.equal(cls.status, 200, JSON.stringify(cls.body));
    const email = `profile.${unique}@example.com`;
    const reg = await api('POST', '/api/register', { first_name: 'Pro', last_name: 'File', email, course_id: cls.body.courseId, payment_amount: 70 });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    await api('PUT', `/api/admin/registrations/${reg.body.registrationId}/confirm-payment`, {}, { admin: true });

    const students = await api('GET', '/api/admin/students', null, { admin: true });
    const me = students.body.find((s) => s.email === email);
    assert.equal((await api('GET', `/api/admin/students/${me.id}`)).status, 401, 'admin only');
    const prof = await api('GET', `/api/admin/students/${me.id}`, null, { admin: true });
    assert.equal(prof.status, 200, JSON.stringify(prof.body));
    assert.equal(prof.body.totals.classes_paid, 1);
    assert.equal(prof.body.totals.amount_paid, 70);
    assert.equal(prof.body.registrations[0].slots[0].location, 'Profile Studio');

    assert.equal((await api('PUT', `/api/admin/students/${me.id}/notes`, { notes: 'x' })).status, 401);
    const notes = await api('PUT', `/api/admin/students/${me.id}/notes`, { notes: 'Strong footwork' }, { admin: true });
    assert.equal(notes.status, 200);
    assert.equal((await api('GET', `/api/admin/students/${me.id}`, null, { admin: true })).body.student.admin_notes, 'Strong footwork');

    // Student page: own classes, never the admin notes
    const mine = await api('POST', '/api/my/profile', { email: email.toUpperCase() });
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.registrations.length, 1);
    assert.equal(mine.body.registrations[0].payment_status, 'completed');
    assert.ok(!('admin_notes' in mine.body.student), 'notes stay private');
    assert.equal((await api('POST', '/api/my/profile', { email: `nobody.${unique}@example.com` })).status, 404);

    const upd = await api('PUT', '/api/my/profile', { email, first_name: 'Prof', last_name: 'Ile', instagram_handle: '@prof.dances', dance_experience: 'advanced' });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const after = await api('POST', '/api/my/profile', { email });
    assert.equal(after.body.student.first_name, 'Prof');
    assert.equal(after.body.student.instagram_handle, 'prof.dances');

    const page = await fetch(`${BASE}/my`);
    assert.equal(page.status, 200);

    // Crew member: crew practice is counted apart from regular classes
    await api('PUT', `/api/admin/students/${me.id}/classify`, { student_type: 'crew_member' }, { admin: true });
    const crew = await api('POST', '/api/courses', {
        name: `Profile Crew ${unique}`, course_type: 'crew_practice', required_student_type: 'crew_member', session_dates: ['2030-08-09'],
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 15, day_of_week: 'Sunday', practice_date: '2030-08-09',
                  start_time: '17:00', end_time: '19:00', location: 'Profile Studio', pricing: { full_package: 15, drop_in: 15 } }]
    }, { admin: true });
    assert.equal(crew.status, 200, JSON.stringify(crew.body));
    const creg = await api('POST', '/api/register', { first_name: 'Prof', email, course_id: crew.body.courseId, payment_amount: 15 });
    assert.equal(creg.status, 200, JSON.stringify(creg.body));
    await api('PUT', `/api/admin/registrations/${creg.body.registrationId}/confirm-payment`, {}, { admin: true });
    const totals = (await api('POST', '/api/my/profile', { email })).body.totals;
    assert.equal(totals.crew_practices, 1);
    assert.equal(totals.regular_classes, 1);
    assert.equal(totals.classes_paid, 2);
});

test('student navigation: back to classes and old account links', async () => {
    const checkout = await (await fetch(`${BASE}/index-registration.html`)).text();
    assert.ok(checkout.includes("'/#classes'"), 'Back to classes goes to the home class list');
    const signIn = await (await fetch(`${BASE}/email-profile.html`)).text();
    assert.ok(signIn.includes("replace('/my')"), 'old My registrations link goes to /my');
});

test('pages are never served from an old cached copy', async () => {
    for (const url of ['/', '/my', '/email-profile.html', '/index-registration.html', '/admin']) {
        const res = await fetch(`${BASE}${url}`);
        assert.match(res.headers.get('cache-control') || '', /no-cache/, `${url} should not be cached`);
    }
});

test('student cleanup: bulk hide/restore/type, test accounts, data check', async () => {
    const mkClass = async (name, capacity) => {
        const r = await api('POST', '/api/courses', {
            name: `${name} ${unique}`, course_type: 'multi-week', session_dates: ['2030-09-01', '2030-09-08', '2030-09-15'],
            slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity, day_of_week: 'Tuesday',
                      start_time: '18:00', end_time: '19:00', location: 'Cleanup Studio', pricing: { full_package: 50 } }]
        }, { admin: true });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return r.body.courseId;
    };
    const tiny = await mkClass('Cleanup Tiny', 1);
    const findStudent = async (email) => (await api('GET', '/api/admin/students', null, { admin: true })).body.find((s) => s.email === email);

    // A normal student fills the only spot
    const a = `clean.a.${unique}@example.com`;
    const ra = await api('POST', '/api/register', { first_name: 'Ann', email: a, course_id: tiny, payment_amount: 50 });
    await api('PUT', `/api/admin/registrations/${ra.body.registrationId}/confirm-payment`, {}, { admin: true });
    const sa = await findStudent(a);

    // Bulk: make crew, hide, restore
    assert.equal((await api('POST', '/api/admin/students/bulk', { ids: [sa.id], action: 'make_crew' })).status, 401, 'admin only');
    assert.equal((await api('POST', '/api/admin/students/bulk', { ids: [sa.id], action: 'make_crew' }, { admin: true })).status, 200);
    assert.equal((await findStudent(a)).student_type, 'crew_member');
    await api('POST', '/api/admin/students/bulk', { ids: [sa.id], action: 'archive' }, { admin: true });
    assert.ok((await findStudent(a)).archived_at, 'hidden');
    const stillPaid = (await api('GET', '/api/registrations', null, { admin: true })).body.find((r) => Number(r.id) === Number(ra.body.registrationId));
    assert.equal(stillPaid.payment_status, 'completed', 'hiding keeps registrations');
    await api('POST', '/api/admin/students/bulk', { ids: [sa.id], action: 'restore' }, { admin: true });
    assert.ok(!(await findStudent(a)).archived_at, 'restored');

    // Test account: can register when full and closed; doesn't use up spots
    const t = `clean.tester.${unique}@example.com`;
    const blocked = await api('POST', '/api/register', { first_name: 'Tess', email: t, course_id: tiny, payment_amount: 50 });
    assert.equal(blocked.status, 400, 'class is full for a normal account');
    const other = await mkClass('Cleanup Other', 5);
    await api('POST', '/api/register', { first_name: 'Tess', email: t, course_id: other, payment_amount: 50 });
    const st = await findStudent(t);
    assert.equal((await api('PUT', `/api/admin/students/${st.id}/tester`, { is_tester: true }, { admin: true })).status, 200);
    await api('PUT', `/api/courses/${tiny}/registration-open`, { open: false }, { admin: true });
    const testerReg = await api('POST', '/api/register', { first_name: 'Tess', email: t, course_id: tiny, payment_amount: 50 });
    assert.equal(testerReg.status, 200, JSON.stringify(testerReg.body));
    await api('PUT', `/api/admin/registrations/${testerReg.body.registrationId}/confirm-payment`, {}, { admin: true });
    const regs = (await api('GET', '/api/registrations', null, { admin: true })).body.filter((r) => r.email === t);
    assert.ok(regs.length >= 2 && regs.every((r) => r.is_test === true || r.is_test === 1), 'all tester registrations flagged');
    await api('PUT', `/api/courses/${tiny}/registration-open`, { open: true }, { admin: true });

    // Tester can switch its own type; others can't
    assert.equal((await api('PUT', '/api/my/tester-type', { email: t, student_type: 'crew_member' })).status, 200);
    assert.equal((await api('PUT', '/api/my/tester-type', { email: a, student_type: 'general' })).status, 403);
    const mine = await api('POST', '/api/my/profile', { email: t });
    assert.ok(mine.body.student.is_tester === true || mine.body.student.is_tester === 1);

    // Reset test data
    const reset = await api('DELETE', `/api/admin/students/${st.id}/test-data`, null, { admin: true });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.ok(reset.body.removed >= 2);
    assert.equal((await api('DELETE', `/api/admin/students/${sa.id}/test-data`, null, { admin: true })).status, 400, 'only test accounts');

    // Data check: the same person saved twice (email case differs) gets merged
    const dupLower = `clean.dup.${unique}@example.com`;
    await api('POST', '/api/register', { first_name: 'Dup', email: dupLower, course_id: other, payment_amount: 50 });
    const third = await mkClass('Cleanup Third', 5);
    const dupReg = await api('POST', '/api/register', { first_name: 'Dup', email: dupLower.toUpperCase(), course_id: third, payment_amount: 50 });
    assert.equal(dupReg.status, 200, JSON.stringify(dupReg.body));
    const check = await api('GET', '/api/admin/data-check', null, { admin: true });
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.ok(check.body.duplicate_students.some((g) => g.email === dupLower), 'duplicate found');
    const merge = await api('POST', '/api/admin/data-check/merge-duplicates', {}, { admin: true });
    assert.equal(merge.status, 200);
    const after = await api('GET', '/api/admin/data-check', null, { admin: true });
    assert.ok(!after.body.duplicate_students.some((g) => g.email === dupLower), 'merged');
    const keeper = (await api('GET', '/api/admin/students', null, { admin: true })).body.find((s) => s.email === dupLower && !s.archived_at);
    assert.equal((await api('GET', `/api/admin/students/${keeper.id}`, null, { admin: true })).body.registrations.length, 2, 'classes moved to one profile');
});

test('admin works as a home-screen app and stays signed in', async () => {
    const manifest = await fetch(`${BASE}/admin-manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    const m = JSON.parse(await manifest.text());
    assert.equal(m.start_url, '/admin');
    assert.equal(m.display, 'standalone');
    const html = await (await fetch(`${BASE}/admin`)).text();
    assert.ok(html.includes('apple-touch-icon') && html.includes('apple-mobile-web-app-capable'));
    assert.equal((await fetch(`${BASE}/images/admin-icon-180.png`)).status, 200);
    // The signed-in session (from the login at the start) is kept in the database
    const status = await api('GET', '/api/admin/status', null, { admin: true });
    assert.equal(status.status, 200);
    assert.ok(status.body.authenticated, 'still signed in through the database session store');
});

test('waitlist: admin cancels a paid spot, next student is offered it and can claim it', async () => {
    const cls = await api('POST', '/api/courses', {
        name: `Waitlist Flow ${unique}`, course_type: 'multi-week', session_dates: ['2030-10-06', '2030-10-13', '2030-10-20'],
        slots: [{ slot_name: 'Main Session', difficulty_level: 'All Levels', capacity: 1, day_of_week: 'Tuesday',
                  start_time: '18:00', end_time: '19:00', location: 'Waitlist Studio', pricing: { full_package: 60 } }]
    }, { admin: true });
    assert.equal(cls.status, 200, JSON.stringify(cls.body));
    const id = cls.body.courseId;
    const a = `wl.a.${unique}@example.com`, b = `wl.b.${unique}@example.com`, c = `wl.c.${unique}@example.com`;

    const ra = await api('POST', '/api/register', { first_name: 'Ava', email: a, course_id: id, payment_amount: 60 });
    await api('PUT', `/api/admin/registrations/${ra.body.registrationId}/confirm-payment`, {}, { admin: true });
    const full = await api('POST', '/api/register', { first_name: 'Ben', email: b, course_id: id, payment_amount: 60 });
    assert.equal(full.status, 400);
    assert.ok(full.body.course_full, 'class is full');
    const join = await api('POST', '/api/waitlist', { first_name: 'Ben', email: b, course_id: id, payment_amount: 60 });
    assert.equal(join.status, 200, JSON.stringify(join.body));
    await api('POST', '/api/waitlist', { first_name: 'Cat', email: c, course_id: id, payment_amount: 60 });

    // Admin cancels the paid registration: Ben (first in line) is offered the spot
    const cancel = await api('PUT', `/api/admin/registrations/${ra.body.registrationId}/cancel`, { reason: 'test' }, { admin: true });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    assert.equal(cancel.body.waitlist_offers.length, 1);
    assert.equal(cancel.body.waitlist_offers[0].email, b, 'offered in order');
    const token = cancel.body.waitlist_offers[0].registration_url.split('/waitlist-register/')[1];

    // The spot is held: Cat can't take it
    const held = await api('POST', '/api/register', { first_name: 'Cat', email: c, course_id: id, payment_amount: 60, dry_run: true });
    assert.equal(held.status, 400, 'held spot is not free');

    // The email link opens registration for that class
    const link = await fetch(`${BASE}/waitlist-register/${token}`, { redirect: 'manual' });
    assert.equal(link.status, 302);
    assert.ok(link.headers.get('location').includes(`course=${id}`));
    assert.equal((await fetch(`${BASE}/waitlist-register/not-a-real-token`)).status, 410, 'bad or expired links get a friendly page');

    // Ben claims it with the link; someone else can't use his link
    assert.equal((await api('POST', '/api/register', { first_name: 'Cat', email: c, course_id: id, payment_amount: 60, waitlist_token: token })).status, 400);
    const claim = await api('POST', '/api/register', { first_name: 'Ben', email: b, course_id: id, payment_amount: 60, waitlist_token: token });
    assert.equal(claim.status, 200, JSON.stringify(claim.body));

    const lists = await api('GET', `/api/admin/waitlists?course_id=${id}`, null, { admin: true });
    const entries = Array.isArray(lists.body) ? lists.body : (lists.body.waitlists || []);
    const ben = entries.find((e) => e.email === b);
    assert.equal(ben.status, 'registered', 'admin sees Ben registered from the waitlist');
    assert.equal(entries.find((e) => e.email === c).status, 'active', 'Cat still waiting');
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
