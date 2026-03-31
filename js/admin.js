const BACKEND_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? window.location.origin
    : 'http://localhost:3000';

// Load and display songs from backend
async function loadAdminSongs() {
    try {
        const response = await fetch(`${BACKEND_URL}/songs`);
        const data = await response.json();
        const songs = Array.isArray(data) ? data : data.songs || [];
        const container = document.getElementById("songsList");
        
        if (!container) return;
        
        if (songs.length === 0) {
            container.innerHTML = '<div class="empty-state">No songs uploaded yet. Upload your first song!</div>';
            return;
        }
        
        container.innerHTML = songs.map(song => `
            <div class="admin-song-item" data-song-id="${song.id}">
                <div class="song-details">
                    <div class="song-title-admin">${escapeHtml(song.title)}</div>
                    <div class="song-artist-admin">${escapeHtml(song.artist)}</div>
                    <div class="song-meta">
                        📅 ${new Date(song.uploadDate).toLocaleDateString()} | 
                        📁 ${song.fileName} | 
                        💾 ${formatFileSize(song.fileSize)}
                    </div>
                </div>
                <button class="delete-song-btn" onclick="deleteSong('${song.id}')">🗑 Delete</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading songs:', error);
        const container = document.getElementById("songsList");
        if(container) container.innerHTML = '<div class="empty-state">Error loading songs from server</div>';
    }
}

// Upload song to backend
async function uploadSong() {
    const title = document.getElementById("songTitle").value.trim();
    const artist = document.getElementById("artistName").value.trim();
    const fileInput = document.getElementById("songFile");
    const file = fileInput.files[0];

    if (!title || !artist || !file) {
        showToast("⚠️ Please fill all fields", 'error');
        return;
    }

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
        showToast("❌ File is too large! Maximum size is 50MB.", 'error');
        return;
    }

    const uploadBtn = document.querySelector(".upload-btn");
    const progressBar = document.getElementById("uploadProgress");
    const progressFill = progressBar.querySelector(".progress-fill");
    
    uploadBtn.textContent = "Uploading...";
    uploadBtn.disabled = true;
    progressBar.style.display = "block";
    progressFill.style.width = "0%";

    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('artist', artist);
        formData.append('songFile', file);

        // Simulate progress for UI
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 5;
            if (progress <= 90) {
                progressFill.style.width = progress + "%";
            }
        }, 100);

        const token = localStorage.getItem('apple-music-token');
        const response = await fetch(`${BACKEND_URL}/songs`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = "100%";

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Upload failed");
        }

        showToast(`✅ "${title}" by ${artist} uploaded successfully!`, 'success');
        localStorage.setItem('songs-updated-at', Date.now().toString());
        
        // Clear form
        document.getElementById("songTitle").value = "";
        document.getElementById("artistName").value = "";
        fileInput.value = "";
        
        // Refresh the admin song list
        loadAdminSongs();
        
    } catch (error) {
        console.error('Upload error:', error);
        const errorMessage = error.message && error.message.includes('Failed to fetch')
            ? 'Server connection failed. Is the backend running at localhost:3000?'
            : error.message || 'Unknown upload error';
        showToast(`❌ Error uploading file: ${errorMessage}`, 'error');
    } finally {
        resetUploadButton(uploadBtn, progressBar);
    }
}

// Delete song function
async function deleteSong(songId) {
    if (confirm("⚠️ Are you sure you want to delete this song? This action cannot be undone!")) {
        try {
            const token = localStorage.getItem('apple-music-token');
            const response = await fetch(`${BACKEND_URL}/songs/${songId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const respBody = await response.json().catch(() => null);

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    showToast('❌ Unauthorized. Please login again.', 'error');
                    localStorage.removeItem('apple-music-token');
                    setTimeout(() => window.location.href = 'auth.html', 1200);
                    return;
                }

                const message = respBody && respBody.error ? respBody.error : 'Failed to delete song';
                throw new Error(message);
            }

            localStorage.setItem('songs-updated-at', Date.now().toString());
            showToast(`✅ Song has been deleted successfully!`, 'success');
            loadAdminSongs(); // Refresh the list

        } catch (error) {
            console.error('Delete error:', error);
            const errMessage = (error && error.message) ? error.message : 'Error deleting song';
            showToast(`❌ ${errMessage}`, 'error');
        }
    }
}

// Reset upload button
function resetUploadButton(button, progressBar) {
    button.textContent = "📤 Upload Song";
    button.disabled = false;
    progressBar.style.display = "none";
    const progressFill = progressBar.querySelector(".progress-fill");
    if (progressFill) progressFill.style.width = "0%";
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Load songs when page loads
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem('apple-music-token');

    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    loadAdminSongs();
    console.log("Admin panel loaded - Ready to manage songs");
});

function switchUploadTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('singleUploadForm').style.display = 'none';
    document.getElementById('batchUploadForm').style.display = 'none';
    
    if (tab === 'single') {
        document.querySelector('.upload-tabs button:nth-child(1)').classList.add('active');
        document.getElementById('singleUploadForm').style.display = 'block';
    } else {
        document.querySelector('.upload-tabs button:nth-child(2)').classList.add('active');
        document.getElementById('batchUploadForm').style.display = 'block';
    }
}

async function uploadFolder() {
    const fileInput = document.getElementById("folderFiles");
    const files = fileInput.files;

    if (!files || files.length === 0) {
        showToast("⚠️ Please select a folder with audio files", 'error');
        return;
    }

    // Filter only audio files in case directory has images/txt
    const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
    
    if (audioFiles.length === 0) {
        showToast("❌ No audio files found in the selected folder.", 'error');
        return;
    }

    if (!confirm(`Found ${audioFiles.length} audio files. Do you want to import them?`)) {
        return;
    }

    const uploadBtn = document.getElementById("batchUploadBtn");
    const progressBar = document.getElementById("batchUploadProgress");
    const progressFill = document.getElementById("batchProgressFill");
    const statusText = document.getElementById("batchStatus");
    
    uploadBtn.textContent = "Importing...";
    uploadBtn.disabled = true;
    progressBar.style.display = "block";
    progressFill.style.width = "0%";
    statusText.textContent = "Preparing upload...";

    try {
        const formData = new FormData();
        audioFiles.forEach(file => {
            formData.append('songFiles', file);
        });

        // Simulate progress for UI
        let progress = 0;
        const progressInterval = setInterval(() => {
            if (progress <= 90) {
                progress += 2;
                progressFill.style.width = progress + "%";
                statusText.textContent = `Uploading and processing files...`;
            }
        }, 300);

        const token = localStorage.getItem('apple-music-token');
        const response = await fetch(`${BACKEND_URL}/songs/batch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = "100%";

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                window.location.href = 'auth.html';
                return;
            }
            const errData = await response.json();
            throw new Error(errData.error || "Batch upload failed");
        }

        const result = await response.json();
        
        let msg = `✅ Successfully imported ${result.uploaded} songs!`;
        if (result.errors && result.errors.length > 0) {
            msg += `\n⚠️ Skipped ${result.errors.length} files.`;
        }
        showToast(msg, 'error');
        localStorage.setItem('songs-updated-at', Date.now().toString());
        
        // Clear form
        fileInput.value = "";
        statusText.textContent = "";
        
        // Refresh the admin song list
        loadAdminSongs();
        
    } catch (error) {
        console.error('Batch upload error:', error);
        showToast(`❌ Error importing folder: ${error.message}`, 'error');
        statusText.textContent = "Import failed.";
    } finally {
        uploadBtn.textContent = "Import Folder";
        uploadBtn.disabled = false;
        setTimeout(() => { progressBar.style.display = "none"; }, 1000);
    }
}

function logout() {
    localStorage.removeItem('apple-music-token');
    localStorage.removeItem('apple-music-user');
    window.location.href = 'auth.html';
}

// Make functions globally available
window.uploadSong = uploadSong;
window.deleteSong = deleteSong;
window.switchUploadTab = switchUploadTab;
window.uploadFolder = uploadFolder;
window.logout = logout;
