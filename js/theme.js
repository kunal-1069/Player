// Theme Toggle Logic
function initTheme() {
    const savedTheme = localStorage.getItem('apple-music-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('apple-music-theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const iconBtn = document.getElementById('themeIcon');
    if (!iconBtn) return;
    if (theme === 'dark') {
        // Sun icon for Light Mode switch
        iconBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    } else {
        // Moon icon for Dark Mode switch
        iconBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
}

// Attach event and initialize
document.addEventListener('DOMContentLoaded', initTheme);
initTheme(); // Pre-emptive execution to avoid flash on slow loads
