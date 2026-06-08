// Debug script to test Nexi payment URL generation
import crypto from 'crypto';

function generateMAC(params, macKey) {
    const sortedKeys = Object.keys(params).sort();
    let macString = '';
    for (const key of sortedKeys) {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
            macString += `${key}=${params[key]}`;
        }
    }
    macString += macKey;
    return crypto.createHash('sha1').update(macString, 'utf8').digest('hex');
}

const nexiConfig = {
    alias: 'payment_3892082',
    macKey: 'O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt',
    merchantId: '03892082',
    terminalId: '03892082',
    environment: 'sandbox',
};

const baseUrl = 'https://xpaysandboxdb.nexigroup.com';
const siteUrl = 'https://dr7.app';

const params = {
    alias: nexiConfig.alias,
    importo: '1000',
    divisa: 'EUR',
    codTrans: `TEST-${Date.now()}`,
    descrizione: 'Test Payment - DR7 Empire',
    mail: 'test@dr7.app',
    languageId: 'ITA',
    urlpost: `${siteUrl}/.netlify/functions/nexi-callback`,
    url: `${siteUrl}/payment-success`,
    urlback: `${siteUrl}/payment-cancel`,
};

console.log('\n🔍 Debugging Nexi Payment URL Generation\n');
console.log('='.repeat(60));

console.log('\n📋 Parameters (before MAC):');
Object.keys(params).sort().forEach(key => {
    console.log(`   ${key}: ${params[key]}`);
});

const mac = generateMAC(params, nexiConfig.macKey);
params.mac = mac;

console.log('\n🔐 MAC Generated:', mac);

const queryString = new URLSearchParams(params).toString();
const paymentUrl = `${baseUrl}/ecomm/ecomm/DispatcherServlet?${queryString}`;

console.log('\n🌐 Full Payment URL:');
console.log(paymentUrl);

console.log('\n' + '='.repeat(60));
console.log('\n💡 If this redirects to login page, possible issues:');
console.log('   1. Sandbox environment not activated in Nexi Backoffice');
console.log('   2. Alias not configured for sandbox');
console.log('   3. Need to use different endpoint or method');
console.log('   4. MAC calculation might be incorrect');
console.log('\n✅ Next step: Copy the URL above and test in browser');
console.log('   Or check Nexi Backoffice to ensure sandbox is enabled\n');
