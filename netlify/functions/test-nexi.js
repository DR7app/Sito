// Simple test endpoint for Nexi X-Pay
// Access at: /.netlify/functions/test-nexi
const { getCorsOrigin } = require('./utils/cors');

exports.handler = async (event) => {
    // Handle CORS
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'text/html; charset=utf-8',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Nexi X-Pay - DR7 Empire</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            max-width: 600px;
            width: 100%;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .test-section {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }
        
        .test-section h2 {
            color: #333;
            font-size: 18px;
            margin-bottom: 16px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            background: #d4edda;
            color: #155724;
            margin-left: 8px;
        }
        
        .test-cards {
            display: grid;
            gap: 12px;
            margin-top: 16px;
        }
        
        .card-item {
            background: white;
            padding: 12px 16px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .card-number {
            font-family: 'Monaco', 'Courier New', monospace;
            font-weight: 600;
            color: #333;
            margin-bottom: 4px;
        }
        
        .card-details {
            font-size: 12px;
            color: #666;
        }
        
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 8px;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .amount-input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 12px;
        }
        
        .amount-input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .alert {
            padding: 16px;
            border-radius: 8px;
            margin-top: 16px;
        }
        
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        
        .loading.active {
            display: block;
        }
        
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 12px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Test Nexi X-Pay</h1>
        <p class="subtitle">DR7 Empire Payment Integration Test</p>
        
        <div class="test-section">
            <h2>⚙️ Configuration <span class="status-badge">✅ Ready</span></h2>
            <p style="color: #666; font-size: 14px;">
                Environment: <strong>Sandbox</strong><br>
                Merchant ID: <strong>03892082</strong><br>
                Alias: <strong>payment_3892082</strong>
            </p>
        </div>
        
        <div class="test-section">
            <h2>💳 Test Cards (Sandbox)</h2>
            <div class="test-cards">
                <div class="card-item">
                    <div class="card-number">4539 9700 0000 0006</div>
                    <div class="card-details">Exp: 12/25 | CVV: 123 | Result: ✅ Success</div>
                </div>
                <div class="card-item">
                    <div class="card-number">4539 9700 0000 0014</div>
                    <div class="card-details">Exp: 12/25 | CVV: 123 | Result: ❌ Failure</div>
                </div>
                <div class="card-item">
                    <div class="card-number">5255 0000 0000 0001</div>
                    <div class="card-details">Exp: 12/25 | CVV: 123 | Result: ✅ Success (MC)</div>
                </div>
            </div>
        </div>
        
        <div class="test-section">
            <h2>💰 Create Test Payment</h2>
            <label for="amount" style="display: block; margin-bottom: 8px; color: #666; font-weight: 500;">
                Amount (€)
            </label>
            <input 
                type="number" 
                id="amount" 
                class="amount-input" 
                value="10.00" 
                step="0.01" 
                min="1"
                placeholder="Enter amount in euros"
            >
            <button id="testPaymentBtn" class="btn">
                🚀 Create Test Payment
            </button>
            
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>Creating payment...</p>
            </div>
            
            <div id="result"></div>
        </div>
    </div>
    
    <script>
        document.getElementById('testPaymentBtn').addEventListener('click', async function() {
            const btn = this;
            const loading = document.getElementById('loading');
            const result = document.getElementById('result');
            const amountInput = document.getElementById('amount');
            
            const amountEur = parseFloat(amountInput.value);
            if (isNaN(amountEur) || amountEur < 1) {
                result.innerHTML = '<div class="alert alert-error">Please enter a valid amount (minimum €1.00)</div>';
                return;
            }
            
            const amount = Math.round(amountEur * 100);
            
            btn.disabled = true;
            loading.classList.add('active');
            result.innerHTML = '';
            
            try {
                const response = await fetch('/.netlify/functions/create-nexi-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: amount,
                        currency: 'EUR',
                        description: 'Test Payment - DR7 Empire',
                        orderId: \`TEST-\${Date.now()}\`,
                        customerEmail: 'test@dr7.app',
                        customerName: 'Test User'
                    })
                });
                
                const data = await response.json();
                
                if (data.success && data.paymentUrl) {
                    result.innerHTML = \`
                        <div class="alert alert-success">
                            <strong>✅ Payment Created!</strong><br>
                            <small>Order ID: \${data.orderId}</small><br>
                            <small style="margin-top: 8px; display: block;">Redirecting to Nexi...</small>
                        </div>
                    \`;
                    
                    setTimeout(() => {
                        window.location.href = data.paymentUrl;
                    }, 2000);
                } else {
                    result.innerHTML = \`
                        <div class="alert alert-error">
                            <strong>❌ Error</strong><br>
                            \${data.error || 'Unknown error occurred'}
                        </div>
                    \`;
                    btn.disabled = false;
                }
            } catch (error) {
                result.innerHTML = \`
                    <div class="alert alert-error">
                        <strong>❌ Network Error</strong><br>
                        \${error.message}
                    </div>
                \`;
                btn.disabled = false;
            } finally {
                loading.classList.remove('active');
            }
        });
    </script>
</body>
</html>
  `;

    return {
        statusCode: 200,
        headers,
        body: html,
    };
};
