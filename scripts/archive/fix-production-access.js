#!/usr/bin/env node

// Script to fix course access control on production via API
const https = require('https');

function makeRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({ status: res.statusCode, data: response });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function fixProductionAccess() {
    try {
        console.log('🔧 Attempting to fix course access control on production...');
        
        const result = await makeRequest({
            hostname: 'dance-registration-portal-production.up.railway.app',
            path: '/api/admin/fix-course-access',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        }, '{}');
        
        console.log('📋 API Response:', result);
        
        if (result.status === 401) {
            console.log('⚠️ Authentication required. Please run this command manually:');
            console.log('   1. Go to: https://dance-registration-portal-production.up.railway.app/admin');
            console.log('   2. Login to admin dashboard');
            console.log('   3. Open browser console and run:');
            console.log('      fetch("/api/admin/fix-course-access", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"}).then(r => r.json()).then(console.log)');
        } else if (result.data.success) {
            console.log('✅ Course access control fixed successfully!');
            console.log('📋 Updated courses:', result.data.courses);
        } else {
            console.log('❌ Failed to fix course access:', result.data);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

fixProductionAccess();
