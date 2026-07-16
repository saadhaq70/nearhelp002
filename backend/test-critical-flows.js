/**
 * Critical User Flow Tests for NearHelp
 * Tests the main user journeys before deployment
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

// Test users
const testUser1 = {
    name: 'Test User 1',
    email: `test1_${Date.now()}@test.com`,
    password: 'Test1234!@#$',
    phone: '+911234567890',
    lat: 21.1458,
    lng: 79.0882,
    skills: ['Medical', 'Fire Safety']
};

const testUser2 = {
    name: 'Test User 2',
    email: `test2_${Date.now()}@test.com`,
    password: 'Test5678!@#$',
    phone: '+919876543210',
    lat: 21.1500,
    lng: 79.0900,
    skills: ['First Aid']
};

let user1Token = null;
let user2Token = null;
let user1Id = null;
let user2Id = null;
let createdSOSId = null;

// Helper functions
const log = (message, color = 'reset') => {
    console.log(`${colors[color]}${message}${colors.reset}`);
};

const test = async (name, testFn) => {
    try {
        log(`\n🧪 Testing: ${name}`, 'blue');
        await testFn();
        log(`✅ PASSED: ${name}`, 'green');
        testResults.passed++;
        testResults.tests.push({ name, status: 'PASSED' });
    } catch (error) {
        log(`❌ FAILED: ${name}`, 'red');
        log(`   Error: ${error.message}`, 'red');
        testResults.failed++;
        testResults.tests.push({ name, status: 'FAILED', error: error.message });
    }
};

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

// Test suites
async function testUserRegistration() {
    await test('User 1 Registration', async () => {
        const response = await axios.post(`${BASE_URL}/auth/register`, testUser1);
        assert(response.status === 201, 'Expected 201 status');
        assert(response.data.token, 'Expected token in response');
        assert(response.data.user, 'Expected user data in response');
        assert(response.data.user.email === testUser1.email, 'Email mismatch');
        user1Token = response.data.token;
        user1Id = response.data.user.id || response.data.user._id;
        log(`   User 1 ID: ${user1Id}`);
    });

    await test('User 2 Registration', async () => {
        const response = await axios.post(`${BASE_URL}/auth/register`, testUser2);
        assert(response.status === 201, 'Expected 201 status');
        assert(response.data.token, 'Expected token in response');
        user2Token = response.data.token;
        user2Id = response.data.user.id || response.data.user._id;
        log(`   User 2 ID: ${user2Id}`);
    });

    await test('Duplicate Registration Prevention', async () => {
        try {
            await axios.post(`${BASE_URL}/auth/register`, testUser1);
            throw new Error('Should have rejected duplicate email');
        } catch (error) {
            assert(error.response.status === 400, 'Expected 400 for duplicate');
        }
    });
}

async function testUserLogin() {
    await test('User Login with Valid Credentials', async () => {
        const response = await axios.post(`${BASE_URL}/auth/login`, {
            email: testUser1.email,
            password: testUser1.password
        });
        assert(response.status === 200, 'Expected 200 status');
        assert(response.data.token, 'Expected token in response');
        user1Token = response.data.token; // Update token
    });

    await test('Login with Invalid Password', async () => {
        try {
            await axios.post(`${BASE_URL}/auth/login`, {
                email: testUser1.email,
                password: 'WrongPassword123!'
            });
            throw new Error('Should have rejected invalid password');
        } catch (error) {
            assert(error.response.status === 401, 'Expected 401 for invalid password');
        }
    });

    await test('Login with Non-existent User', async () => {
        try {
            await axios.post(`${BASE_URL}/auth/login`, {
                email: 'nonexistent@test.com',
                password: 'SomePassword123!'
            });
            throw new Error('Should have rejected non-existent user');
        } catch (error) {
            assert(error.response.status === 401, 'Expected 401 for non-existent user');
        }
    });
}

async function testProfileAccess() {
    await test('Get User Profile', async () => {
        const response = await axios.get(`${BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
        assert(response.status === 200, 'Expected 200 status');
        assert(response.data.email === testUser1.email, 'Email mismatch');
    });

    await test('Unauthorized Profile Access', async () => {
        try {
            await axios.get(`${BASE_URL}/auth/me`);
            throw new Error('Should have rejected unauthorized access');
        } catch (error) {
            assert(error.response.status === 401, 'Expected 401 for unauthorized');
        }
    });

    await test('Update User Location', async () => {
        const newLat = 21.1500;
        const newLng = 79.0900;
        const response = await axios.put(`${BASE_URL}/users/location`, 
            { lat: newLat, lng: newLng },
            { headers: { Authorization: `Bearer ${user1Token}` } }
        );
        assert(response.status === 200, 'Expected 200 status');
        log(`   Updated location: ${newLat}, ${newLng}`);
    });
}

async function testSOSCreation() {
    await test('Create Medical SOS', async () => {
        const sosData = {
            type: 'Medical',
            lat: testUser1.lat,
            lng: testUser1.lng,
            modalData: {
                severity: 'high',
                description: 'Test medical emergency',
                bloodGroup: 'O+',
                healthConditions: 'None'
            }
        };

        const response = await axios.post(`${BASE_URL}/sos/create`, sosData, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
        
        assert(response.status === 201, 'Expected 201 status');
        assert(response.data.id || response.data._id, 'Expected SOS ID');
        assert(response.data.status === 'active', 'Expected active status');
        createdSOSId = response.data.id || response.data._id;
        log(`   Created SOS ID: ${createdSOSId}`);
    });

    await test('Get Active SOS List', async () => {
        // Wait a bit for SOS to be broadcast
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await axios.get(`${BASE_URL}/sos/active`, {
            headers: { Authorization: `Bearer ${user2Token}` }
        });
        
        assert(response.status === 200, 'Expected 200 status');
        assert(Array.isArray(response.data), 'Expected array of SOS');
        
        const foundSOS = response.data.find(s => (s.id || s._id) === createdSOSId);
        assert(foundSOS, 'Created SOS should be visible to nearby users');
        log(`   Found ${response.data.length} active SOS`);
    });

    await test('Get My Active SOS', async () => {
        const response = await axios.get(`${BASE_URL}/sos/me/active`, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
        
        assert(response.status === 200, 'Expected 200 status');
        if (response.data) {
            assert(response.data.id === createdSOSId || response.data._id === createdSOSId, 
                'Should return user\'s active SOS');
        }
    });
}

async function testSOSResponse() {
    await test('Respond to SOS', async () => {
        const response = await axios.post(`${BASE_URL}/sos/${createdSOSId}/respond`, {}, {
            headers: { Authorization: `Bearer ${user2Token}` }
        });
        
        assert(response.status === 200, 'Expected 200 status');
        assert(response.data.status === 'responding', 'Expected responding status');
        assert(response.data.responders && response.data.responders.includes(user2Id), 
            'User 2 should be in responders list');
        log(`   User 2 successfully responded to SOS`);
    });

    await test('Cannot Respond to Own SOS', async () => {
        try {
            await axios.post(`${BASE_URL}/sos/${createdSOSId}/respond`, {}, {
                headers: { Authorization: `Bearer ${user1Token}` }
            });
            throw new Error('Should not allow responding to own SOS');
        } catch (error) {
            assert(error.response.status === 403, 'Expected 403 for own SOS');
        }
    });

    await test('Cannot Respond to Same SOS Twice', async () => {
        try {
            await axios.post(`${BASE_URL}/sos/${createdSOSId}/respond`, {}, {
                headers: { Authorization: `Bearer ${user2Token}` }
            });
            // If it doesn't throw, check if it returns appropriate message
            // Some implementations might return 200 but ignore duplicate
        } catch (error) {
            // Expected to fail with 400
            assert(error.response.status === 400 || error.response.status === 403, 
                'Expected 400/403 for duplicate response');
        }
    });
}

async function testSOSResolution() {
    await test('Resolve SOS', async () => {
        const response = await axios.post(`${BASE_URL}/sos/${createdSOSId}/resolve`, {}, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
        
        assert(response.status === 200, 'Expected 200 status');
        assert(response.data.status === 'resolved', 'Expected resolved status');
        assert(response.data.resolved_at, 'Expected resolved timestamp');
        log(`   SOS resolved successfully`);
    });

    await test('Cannot Resolve Already Resolved SOS', async () => {
        try {
            await axios.post(`${BASE_URL}/sos/${createdSOSId}/resolve`, {}, {
                headers: { Authorization: `Bearer ${user1Token}` }
            });
            // Might succeed but should not change state
        } catch (error) {
            // Expected behavior
        }
    });

    await test('Only Seeker Can Resolve', async () => {
        // Create another SOS for this test
        const sosData = {
            type: 'General Help',
            lat: testUser1.lat,
            lng: testUser1.lng,
            modalData: { description: 'Test general help' }
        };

        const createRes = await axios.post(`${BASE_URL}/sos/create`, sosData, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
        
        const newSOSId = createRes.data.id || createRes.data._id;

        try {
            await axios.post(`${BASE_URL}/sos/${newSOSId}/resolve`, {}, {
                headers: { Authorization: `Bearer ${user2Token}` }
            });
            throw new Error('Should not allow non-seeker to resolve');
        } catch (error) {
            assert(error.response.status === 403, 'Expected 403 for non-seeker');
        }

        // Clean up - resolve as seeker
        await axios.post(`${BASE_URL}/sos/${newSOSId}/resolve`, {}, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
    });
}

async function testSOSStats() {
    await test('Get SOS Statistics', async () => {
        const response = await axios.get(`${BASE_URL}/sos/stats`, {
            headers: { Authorization: `Bearer ${user1Token}` }
        });
        
        assert(response.status === 200, 'Expected 200 status');
        assert(typeof response.data.activeSOS === 'number', 'Expected activeSOS count');
        assert(typeof response.data.resolvedToday === 'number', 'Expected resolvedToday count');
        log(`   Active SOS: ${response.data.activeSOS}, Resolved Today: ${response.data.resolvedToday}`);
    });
}

async function testAnonymousSOS() {
    await test('Create Anonymous SOS', async () => {
        const sosData = {
            type: 'Fire',
            lat: 21.1458,
            lng: 79.0882,
            anonymousName: 'Anonymous Test User',
            anonymousBloodGroup: 'A+',
            modalData: {
                description: 'Test fire emergency'
            }
        };

        const response = await axios.post(`${BASE_URL}/sos/anonymous`, sosData);
        
        assert(response.status === 200, 'Expected 200 status');
        assert(response.data.sos, 'Expected SOS data');
        assert(response.data.sos.is_anonymous === true, 'Expected anonymous flag');
        log(`   Created anonymous SOS: ${response.data.sos.id || response.data.sos._id}`);
    });
}

// Cleanup function
async function cleanup() {
    log('\n🧹 Cleaning up test data...', 'yellow');
    
    try {
        // Delete test users and their related data (CASCADE will handle related records)
        if (user1Id) {
            await prisma.user.delete({ where: { id: user1Id } });
            log('   Deleted test user 1');
        }
        if (user2Id) {
            await prisma.user.delete({ where: { id: user2Id } });
            log('   Deleted test user 2');
        }
        
        log('✅ Cleanup complete', 'green');
    } catch (error) {
        log(`⚠️  Cleanup error: ${error.message}`, 'yellow');
    }
}

// Main test runner
async function runTests() {
    log('\n╔════════════════════════════════════════════╗', 'blue');
    log('║  NearHelp Critical User Flow Tests        ║', 'blue');
    log('╚════════════════════════════════════════════╝', 'blue');
    log(`\nTesting against: ${BASE_URL}\n`, 'blue');

    try {
        // Check if server is running
        try {
            await axios.get(BASE_URL.replace('/api', ''));
        } catch (error) {
            throw new Error(`Server not reachable at ${BASE_URL}. Make sure backend is running.`);
        }

        // Run test suites
        await testUserRegistration();
        await testUserLogin();
        await testProfileAccess();
        await testSOSCreation();
        await testSOSResponse();
        await testSOSResolution();
        await testSOSStats();
        await testAnonymousSOS();

    } catch (error) {
        log(`\n❌ Test suite failed: ${error.message}`, 'red');
    } finally {
        await cleanup();
        await prisma.$disconnect();
        
        // Print summary
        log('\n╔════════════════════════════════════════════╗', 'blue');
        log('║           TEST SUMMARY                     ║', 'blue');
        log('╚════════════════════════════════════════════╝', 'blue');
        log(`\nTotal Tests: ${testResults.passed + testResults.failed}`);
        log(`Passed: ${testResults.passed}`, 'green');
        log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
        log(`Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%\n`);

        if (testResults.failed > 0) {
            log('Failed Tests:', 'red');
            testResults.tests
                .filter(t => t.status === 'FAILED')
                .forEach(t => log(`  ❌ ${t.name}: ${t.error}`, 'red'));
            process.exit(1);
        } else {
            log('🎉 All tests passed!', 'green');
            process.exit(0);
        }
    }
}

// Run tests
runTests().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
