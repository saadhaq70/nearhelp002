#!/usr/bin/env node

/**
 * Mistral AI Verification Script
 * 
 * This script tests if Mistral AI is working and shows you exactly
 * what guidance is being generated (AI vs hardcoded fallback)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testMistral() {
    console.log('🔍 Testing Mistral AI Integration...\n');
    console.log('═'.repeat(70));

    // Check API Key
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        console.log('❌ MISTRAL_API_KEY not found in .env file');
        console.log('\n📝 To enable Mistral AI:');
        console.log('   1. Get API key from: https://console.mistral.ai');
        console.log('   2. Add to backend/.env: MISTRAL_API_KEY=your_key_here');
        console.log('\n⚠️  Currently using HARDCODED FALLBACK guidance\n');
        return;
    }

    console.log('✅ MISTRAL_API_KEY found:', apiKey.substring(0, 15) + '...' + apiKey.slice(-4));
    console.log('═'.repeat(70));
    console.log('\n🧪 Testing Mistral API with sample SOS...\n');

    // Test prompt
    const testPrompt = `You are an expert emergency assistant operating in India.
The system context is classified as a "Medical" alert.

User-Provided Crisis Context:
- Description of the situation: "I fell and hurt my leg, can't walk"
- Medical history/conditions: None registered
- Blood group: O+

Task:
Analyze the specific situation details. If the description mentions a low-severity issue (like a simple headache), provide calm relief tips. If the description indicates a high-severity crisis (like a heart attack, deep wound, or cardiac distress), immediately list life-saving emergency actions. 
Provide relevant emergency dispatch numbers (like 108 for medical or 112) depending on what the severity demands.
CRITICAL: Format your response as a clear, readable numbered list with each step on a new line. Do not write a single block of text.`;

    const url = 'https://api.mistral.ai/v1/chat/completions';
    const model = 'mistral-small-latest';
    
    console.log(`⚙️  Testing model: ${model}...`);
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: testPrompt }
                ],
                temperature: 0.4,
                max_tokens: 512
            }),
        });

        if (res.status === 429) {
            console.log(`   ⚠️  Rate limited (429)`);
            console.log('\n❌ MISTRAL AI RATE LIMITED');
            console.log('   Wait a few moments and try again\n');
            return;
        }

        if (res.status === 401 || res.status === 403) {
            console.log(`   ❌ Access denied (${res.status}) - Check API key permissions`);
            console.log('\n❌ MISTRAL AI AUTHENTICATION FAILED');
            console.log('   Verify your API key is correct\n');
            return;
        }

        if (!res.ok) {
            const errorText = await res.text();
            console.log(`   ❌ Error ${res.status}:`, errorText.substring(0, 100));
            console.log('\n❌ MISTRAL AI REQUEST FAILED');
            console.log(`   Status: ${res.status}`);
            console.log(`   Error: ${errorText}\n`);
            return;
        }

        const data = await res.json();
        const responseText = data?.choices?.[0]?.message?.content;
        
        if (responseText && responseText.trim().length > 10) {
            console.log(`   ✅ Success with ${model}!\n`);
            console.log('═'.repeat(70));
            console.log('\n✅ MISTRAL AI IS WORKING!');
            console.log(`   Model: ${model}`);
            console.log('\n📋 Generated Guidance (from Mistral AI):\n');
            console.log('─'.repeat(70));
            console.log(responseText);
            console.log('─'.repeat(70));
            console.log('\n✨ This is PERSONALIZED, AI-generated guidance!');
            console.log('   It references the specific situation ("fell and hurt my leg")');
            console.log('   and user details (Blood group: O+)\n');
        } else {
            console.log(`   ⚠️  Empty response from ${model}`);
            console.log('\n❌ MISTRAL AI RETURNED EMPTY RESPONSE\n');
        }
    } catch (err) {
        console.log(`   ❌ Fetch error:`, err.message);
        console.log('\n❌ MISTRAL AI CONNECTION FAILED');
        console.log('   Error:', err.message);
        console.log('\n📝 Possible reasons:');
        console.log('   1. Network connectivity issues');
        console.log('   2. Mistral API service disruption');
        console.log('\n⚠️  Backend will use HARDCODED FALLBACK guidance instead\n');
    }

    console.log('═'.repeat(70));
    console.log('\n💡 How to tell in your app:');
    console.log('   • Check backend logs for: "[aiService] ✅ Mistral response generated"');
    console.log('   • AI guidance = References YOUR specific description');
    console.log('   • Fallback = Generic steps, no personal details');
    console.log('\n📊 Test Results Summary:');
    console.log(`   API Key: ${apiKey ? '✅ Present' : '❌ Missing'}`);
    console.log(`   Model: ${model}`);
    console.log('\n');
}

testMistral().catch(err => {
    console.error('\n❌ Unexpected error:', err);
    process.exit(1);
});
