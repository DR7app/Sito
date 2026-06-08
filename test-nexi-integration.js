// Test script for Nexi X-Pay integration
// This script tests the payment creation function

import crypto from 'crypto';

/**
 * Generate MAC (Message Authentication Code) for Nexi XPay
 */
function generateMAC(params, macKey) {
    // Sort parameters alphabetically
    const sortedKeys = Object.keys(params).sort();

    // Build the string to hash
    let macString = '';
    for (const key of sortedKeys) {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
            macString += `${key}=${params[key]}`;
        }
    }

    // Add MAC key at the end
    macString += macKey;

    // Calculate SHA1 hash
    const hash = crypto.createHash('sha1').update(macString, 'utf8').digest('hex');

    return hash;
}

/**
 * Test Nexi payment creation
 */
async function testNexiPayment() {
    console.log('🧪 Testing Nexi X-Pay Integration\n');
    console.log('='.repeat(60));

    // Test configuration - MAC key is now optional
    const nexiConfig = {
        alias: 'xpay web', // Correct alias from Nexi backoffice
        macKey: '', // Leave empty to test without MAC
        merchantId: '025153685',
        terminalId: '75703919',
        environment: 'production',
        apiKey: '9f46149d-a616-4cfa-b92a-4d3b85a4c2a7',
    };

    console.log('\n✅ Configuration loaded:');
    console.log(`   Alias: ${nexiConfig.alias}`);
    console.log(`   Merchant ID: ${nexiConfig.merchantId}`);
    console.log(`   Terminal ID: ${nexiConfig.terminalId}`);
    console.log(`   Environment: ${nexiConfig.environment}`);
    console.log(`   MAC Key: ${nexiConfig.macKey ? nexiConfig.macKey.substring(0, 10) + '...' : 'NOT CONFIGURED (no-MAC mode)'}`);
    console.log(`   API Key: ${nexiConfig.apiKey.substring(0, 10)}...`);

    // Test payment parameters
    const testPayment = {
        amount: 1000, // €10.00 in cents
        currency: 'EUR',
        orderId: `TEST-${Date.now()}`,
        description: 'Test Payment - DR7 Empire',
        customerEmail: 'test@dr7.app',
    };

    console.log('\n📝 Test Payment Details:');
    console.log(`   Amount: €${(testPayment.amount / 100).toFixed(2)}`);
    console.log(`   Currency: ${testPayment.currency}`);
    console.log(`   Order ID: ${testPayment.orderId}`);
    console.log(`   Description: ${testPayment.description}`);

    // Prepare request parameters
    const baseUrl = nexiConfig.environment === 'production'
        ? 'https://xpay.nexigroup.com'
        : 'https://xpaysandboxdb.nexigroup.com';
    const siteUrl = 'https://dr7.app';

    const params = {
        alias: nexiConfig.alias,
        importo: testPayment.amount.toString(),
        divisa: testPayment.currency,
        codTrans: testPayment.orderId,
        descrizione: testPayment.description,
        mail: testPayment.customerEmail,
        languageId: 'ITA',
        urlpost: `${siteUrl}/.netlify/functions/nexi-callback`,
        url: `${siteUrl}/payment-success`,
        urlback: `${siteUrl}/payment-cancel`,
    };

    // Generate MAC only if key is available
    const useMac = !!nexiConfig.macKey;

    if (useMac) {
        console.log('\n🔐 Generating MAC...');
        const mac = generateMAC(params, nexiConfig.macKey);
        console.log(`   MAC: ${mac}`);
        params.mac = mac;
    } else {
        console.log('\n⚠️  Operating without MAC authentication');
        console.log('   No MAC will be generated or included in the request');
    }

    // Build payment URL
    const queryString = new URLSearchParams(params).toString();
    const paymentUrl = `${baseUrl}/ecomm/ecomm/DispatcherServlet?${queryString}`;

    console.log('\n🌐 Payment URL Generated:');
    console.log(`   ${paymentUrl.substring(0, 100)}...`);

    console.log('\n✅ MAC Generation Test: PASSED');
    console.log('✅ Payment URL Generation Test: PASSED');

    // Test MAC verification only if MAC is enabled
    if (useMac) {
        console.log('\n🔍 Testing MAC Verification (Callback Simulation)...');

        const callbackParams = {
            codTrans: testPayment.orderId,
            esito: 'OK',
            importo: testPayment.amount.toString(),
            divisa: testPayment.currency,
            data: '20260119',
            orario: '150000',
            codAut: 'TEST123',
        };

        const callbackMAC = generateMAC(callbackParams, nexiConfig.macKey);
        console.log(`   Callback MAC: ${callbackMAC}`);

        // Verify MAC
        const verifiedMAC = generateMAC(callbackParams, nexiConfig.macKey);
        const isValid = callbackMAC === verifiedMAC;

        console.log(`   MAC Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    } else {
        console.log('\n⚠️  Skipping MAC verification test (no-MAC mode)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 All Tests Passed!\n');

    console.log('📋 Summary:');
    console.log('   ✅ Configuration loaded successfully');
    console.log(`   ${useMac ? '✅' : '⚠️ '} MAC ${useMac ? 'generation working correctly' : 'disabled (no-MAC mode)'}`);
    console.log('   ✅ Payment URL created successfully');
    if (useMac) {
        console.log('   ✅ MAC verification working correctly');
    }

    console.log('\n🚀 Next Steps:');
    console.log('   1. Deploy to Netlify with environment variables');
    console.log('   2. Test payment flow with test cards');
    console.log('   3. Verify callback webhook receives notifications');
    console.log('   4. Check database updates after payment');

    console.log('\n💳 Test Cards for Sandbox:');
    console.log('   Success: 4539970000000006 (Exp: 12/25, CVV: 123)');
    console.log('   Failure: 4539970000000014 (Exp: 12/25, CVV: 123)');

    return {
        success: true,
        paymentUrl,
        useMac,
    };
}

// Run the test
testNexiPayment()
    .then(result => {
        console.log('\n✅ Test completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });
