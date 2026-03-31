fetch('http://127.0.0.1:3000/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser_test', password: 'password123' })
})
.then(res => res.text().then(text => ({ status: res.status, text })))
.then(data => console.log('RESPONSE:', data))
.catch(err => console.error('ERROR:', err));
