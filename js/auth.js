function switchAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('loginFormContainer').style.display = 'none';
        document.getElementById('registerFormContainer').style.display = 'block';
    } else {
        document.getElementById('registerFormContainer').style.display = 'none';
        document.getElementById('loginFormContainer').style.display = 'block';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            errorDiv.textContent = data.error || 'Login failed';
            return;
        }
        
        localStorage.setItem('apple-music-token', data.token);
        localStorage.setItem('apple-music-user', data.username);
        window.location.href = 'admin.html';
    } catch (err) {
        errorDiv.textContent = 'Server connection error';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const errorDiv = document.getElementById('regError');
    
    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            errorDiv.textContent = data.error || 'Registration failed';
            return;
        }
        
        // Auto login on successful register
        localStorage.setItem('apple-music-token', data.token);
        localStorage.setItem('apple-music-user', data.username);
        window.location.href = 'admin.html';
    } catch (err) {
        errorDiv.textContent = 'Server connection error';
    }
}

// Check if already logged in!
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('apple-music-token')) {
        window.location.href = 'admin.html';
    }
});

// Handle Google Sing In
async function handleGoogleCredentialResponse(response) {
    const errorDiv = document.getElementById('loginError') || document.getElementById('regError');
    try {
        const res = await fetch('/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            errorDiv.textContent = data.error || 'Google Login failed';
            return;
        }
        
        localStorage.setItem('apple-music-token', data.token);
        localStorage.setItem('apple-music-user', data.username);
        window.location.href = 'admin.html';
    } catch (err) {
        errorDiv.textContent = 'Server connection error';
    }
}

window.handleGoogleCredentialResponse = handleGoogleCredentialResponse;
