// ============================================
// MUSIC PLAYER - Complete Working Version
// ============================================

const BACKEND_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? window.location.origin
    : 'http://localhost:3000';

// IndexedDB Setup for Songs (Shared across users on same device)
const DB_NAME = 'MusicPlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

let db = null;
let allSongs = [];
let currentSongIndex = 0;
let currentPage = 1;
let totalPages = 1;
const PAGE_LIMIT = 20;
let isFetchingSongs = false;
let playlists = [];
let currentView = "home";

// Shuffling and Repeat State
let isShuffle = localStorage.getItem('player-shuffle') === 'true';
let repeatMode = parseInt(localStorage.getItem('player-repeat') || '0'); // 0: Off, 1: All, 2: One
let shuffledIndices = [];

// Favorites tracking
let favorites = [];

// DOM Elements
let songList, audioPlayer, nowPlaying, nowPlayingArtist, currentTimeEl, durationTimeEl, progressContainer, progressFilled, volumeSlider;
let searchInput, nextBtn, prevBtn, queueBtn, queueOverlay, queueItems, closeQueueBtn;
let playlistName, createPlaylistBtn, playlistContainer, librarySection;
let homeSection, playlistView, playlistNameDisplay, playlistSongsList;

// ============================================
// API FUNCTIONS (For Song Retrieval from Backend)
// ============================================

// Load all songs from Backend API
async function loadAllSongs(page = 1, append = false) {
    if (isFetchingSongs) return [];
    isFetchingSongs = true;
    
    try {
        if (!append) {
            allSongs = [];
            showSkeletons();
        }
        
        const response = await fetch(`${BACKEND_URL}/songs?page=${page}&limit=${PAGE_LIMIT}`);
        const data = await response.json();
        
        const fetchedSongs = data.songs.map(song => {
            const songId = song.id || (song._id ? song._id.toString() : null);
            const streamId = encodeURIComponent(songId);
            return {
                ...song,
                id: songId,
                src: `${BACKEND_URL}/stream/${streamId}`
            };
        });
        
        if (append) {
            allSongs = [...allSongs, ...fetchedSongs];
        } else {
            allSongs = fetchedSongs;
        }
        
        currentPage = data.page || page;
        totalPages = data.totalPages || 1;
        
        console.log(`Loaded ${allSongs.length} songs from server`);
        
        if (currentView === "home" || currentView === "search") {
            displaySongs(allSongs);
        }
        
        isFetchingSongs = false;
        return allSongs;
    } catch (error) {
        console.error('Error loading songs:', error);
        isFetchingSongs = false;
        return [];
    }
}

function showSkeletons() {
    if (!songList) return;
    let html = '';
    for(let i=0; i<8; i++) {
        html += `
        <div class="song-item skeleton-loader" style="pointer-events:none;">
            <div class="skeleton-img"></div>
            <div class="song-info">
                <div class="skeleton-text title"></div>
                <div class="skeleton-text artist"></div>
            </div>
        </div>`;
    }
    songList.innerHTML = html;
}

// ============================================
// PLAYLIST FUNCTIONS (Stored in MongoDB - Cloud specific)
// ============================================

const getToken = () => localStorage.getItem('apple-music-token');

// Load playlists from Backend API
async function loadPlaylists() {
    const token = getToken();
    if (!token) {
        console.log("User not logged in, cannot load playlists");
        playlists = [];
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/playlists`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            playlists = await response.json();
            console.log(`Loaded ${playlists.length} playlists from cloud`);
        } else {
            console.error("Failed to load playlists");
            playlists = [];
        }
    } catch (error) {
        console.error('Error loading playlists:', error);
        playlists = [];
    }
}

// Create new playlist
async function createPlaylist() {
    const token = getToken();
    if (!token) {
        showToast("Please login to create restricted playlists.", 'error');
        return;
    }

    const name = playlistName.value.trim();
    if (!name) {
        showToast("Please enter a playlist name", 'error');
        return;
    }
    
    // Check for duplicate locally
    if (playlists.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        showToast("A playlist with this name already exists!", 'error');
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/playlists`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            const newPlaylist = await response.json();
            newPlaylist.id = newPlaylist.id || newPlaylist._id;
            playlists.unshift(newPlaylist);
            await loadPlaylists();
            displayPlaylists();
            playlistName.value = "";
            showToast(`✅ Playlist "${name}" created successfully!`, 'success');
        } else {
            const data = await response.json().catch(() => ({}));
            const msg = data.error || `Server returned ${response.status}`;
            showToast(`❌ Error: ${msg}`, 'error');

            if (response.status === 401 || response.status === 403) {
                showToast('⚠️ Session expired. Please login again.', 'error');
                localStorage.removeItem('apple-music-token');
                setTimeout(() => window.location.href = 'auth.html', 1200);
            }
        }
    } catch (error) {
        console.error('Create playlist network error:', error);
        showToast("Network error while creating playlist. Check your connection and backend server.", 'error');
    }
}

// Display all playlists in library
function displayPlaylists() {
    if (!playlistContainer) return;
    
    const favCardHTML = `
        <div class="playlist-card favorites-card" onclick="openFavoritesPlaylist()">
            <h4>❤️ Favorites</h4>
            <p>${favorites.length} song${favorites.length !== 1 ? 's' : ''}</p>
            <div class="song-count">🎵</div>
        </div>
    `;

    if (playlists.length === 0) {
        playlistContainer.innerHTML = favCardHTML + '<div class="empty-state" style="grid-column: 1 / -1; margin-top: 24px;">No playlists yet. Create your first playlist!</div>';
        return;
    }
    
    playlistContainer.innerHTML = favCardHTML + playlists.map(playlist => `
        <div class="playlist-card" onclick="openPlaylist('${playlist.id}')">
            <h4>📁 ${escapeHtml(playlist.name)}</h4>
            <p>${playlist.songs.length} song${playlist.songs.length !== 1 ? 's' : ''}</p>
            <div class="song-count">🎵</div>
        </div>
    `).join('');
}

// Open favorites directly
function openFavoritesPlaylist() {
    currentView = "playlist";
    const librarySection = document.getElementById('librarySection');
    
    // Hide playlists grid and create section
    const myPlaylistsSection = document.querySelector('.my-playlists-section');
    const createSection = document.querySelector('.create-playlist-section');
    if (myPlaylistsSection) myPlaylistsSection.style.display = 'none';
    if (createSection) createSection.style.display = 'none';
    
    // Show playlist view
    if (playlistView) playlistView.style.display = 'block';
    
    if (playlistNameDisplay) {
        playlistNameDisplay.textContent = `❤️ Favorites`;
    }
    
    if (!playlistSongsList) return;
    
    if (favorites.length === 0) {
        playlistSongsList.innerHTML = `<div class="empty-playlist">No favorites yet</div>`;
        return;
    }
    
    playlistSongsList.innerHTML = favorites.map((song) => `
        <div class="playlist-song-item" onclick="playSongById('${song.songId}')">
            <div class="playlist-song-info">
                <div class="playlist-song-title">${escapeHtml(song.title)}</div>
                <div class="playlist-song-artist">${escapeHtml(song.artist)}</div>
            </div>
            <button class="favorite-btn active" style="padding: 0 12px; margin-right: 12px;" onclick="event.stopPropagation(); toggleFavorite('${song.songId}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
        </div>
    `).join('');
}

// Open a specific playlist
async function openPlaylist(playlistId) {
    let playlist = playlists.find(p => p.id == playlistId || (p._id && p._id == playlistId));
    if (!playlist) {
        // Try reloading from server and retry
        await loadPlaylists();
        playlist = playlists.find(p => p.id == playlistId || (p._id && p._id == playlistId));
        if (!playlist) {
            showToast('Playlist not found. Please refresh.', 'error');
            return;
        }
    }
    
    // Hide playlists grid and create section
    const myPlaylistsSection = document.querySelector('.my-playlists-section');
    const createSection = document.querySelector('.create-playlist-section');
    if (myPlaylistsSection) myPlaylistsSection.style.display = 'none';
    if (createSection) createSection.style.display = 'none';
    
    // Show playlist view
    if (playlistView) playlistView.style.display = 'block';
    
    if (playlistNameDisplay) {
        playlistNameDisplay.textContent = `📁 ${escapeHtml(playlist.name)}`;
    }
    
    if (!playlistSongsList) return;
    
    if (playlist.songs.length === 0) {
        playlistSongsList.innerHTML = `<div class="empty-playlist">No songs in this playlist. Add some from Home or Search!</div><div style="margin-top:20px; text-align:center;"><button class="remove-from-playlist-btn" onclick="deletePlaylist('${playlist.id}')" style="background:var(--secondary); color:white; padding:10px 20px; border-radius:30px;">🗑️ Delete Playlist</button></div>`;
        return;
    }
    
    playlistSongsList.innerHTML = playlist.songs.map((song) => `
        <div class="playlist-song-item" onclick="playSongById('${song.songId}')">
            <div class="playlist-song-info">
                <div class="playlist-song-title">${escapeHtml(song.title)}</div>
                <div class="playlist-song-artist">${escapeHtml(song.artist)}</div>
            </div>
            <button class="remove-from-playlist-btn" onclick="event.stopPropagation(); removeFromPlaylist('${playlist.id}', '${song.songId}')">
                Remove
            </button>
        </div>
    `).join('') + `<div style="margin-top:20px; text-align:center;"><button class="remove-from-playlist-btn" onclick="deletePlaylist('${playlist.id}')" style="background:var(--secondary); color:white; padding:10px 20px; border-radius:30px;">🗑️ Delete Playlist</button></div>`;
}

// Back to playlists overview
function backToPlaylists() {
    // Hide playlist view
    if (playlistView) playlistView.style.display = 'none';
    
    // Show playlists grid and create section
    const myPlaylistsSection = document.querySelector('.my-playlists-section');
    const createSection = document.querySelector('.create-playlist-section');
    if (myPlaylistsSection) myPlaylistsSection.style.display = 'block';
    if (createSection) createSection.style.display = 'block';
    
    // Refresh playlists display
    displayPlaylists();
}

// Add song to playlist
async function addToPlaylist(songId) {
    const token = getToken();
    if (!token) {
        showToast("Please login to manage playlists.", 'error');
        return;
    }

    if (playlists.length === 0) {
        showToast("No playlists found! Create a playlist first in the Library section.", 'error');
        showSection('library');
        return;
    }
    
    const song = allSongs.find(s => s.id == songId);
    if (!song) return;
    
    // Create playlist selection dialog
    let playlistOptions = "Select a playlist:\n\n";
    playlists.forEach((playlist, index) => {
        playlistOptions += `${index + 1}. ${playlist.name} (${playlist.songs.length} songs)\n`;
    });
    playlistOptions += "\nEnter number (or 0 to cancel):";
    
    const choice = prompt(playlistOptions);
    
    if (choice && choice !== "0") {
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < playlists.length) {
            let playlist = playlists[index];
            
            // Normalize playlist id field
            playlist.id = playlist.id || playlist._id;
            
            // Check locally first
            const exists = Array.isArray(playlist.songs) && playlist.songs.some(s => s.songId == songId);
            if (exists) {
                showToast("⚠️ This song is already in the playlist!", 'error');
                return;
            }
            
            try {
                const response = await fetch(`${BACKEND_URL}/playlists/${playlist.id}/songs`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        songId: song.id.toString(),
                        title: song.title,
                        artist: song.artist
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    data.playlist.id = data.playlist.id || data.playlist._id;
                    playlists[index] = data.playlist;
                    await loadPlaylists();
                    displayPlaylists();
                    showToast(`✅ Added "${song.title}" to "${playlist.name}"`, 'success');
                } else {
                    const data = await response.json().catch(() => ({}));
                    const errMsg = data.error || `Server returned ${response.status}`;
                    showToast(`❌ Error: ${errMsg}`, 'error');

                    if (response.status === 401 || response.status === 403) {
                        showToast('⚠️ Session expired. Please login again.', 'error');
                        localStorage.removeItem('apple-music-token');
                        setTimeout(() => window.location.href = 'auth.html', 1200);
                    }
                }
            } catch (error) {
                console.error('Network error while adding song to playlist:', error);
                showToast("Network error while adding song. Check backend and connection.", 'error');
            }
        } else {
            showToast("Invalid selection!", 'error');
        }
    }
}

// Remove song from playlist
async function removeFromPlaylist(playlistId, songIdToRemove) {
    const token = getToken();
    const playlistIndex = playlists.findIndex(p => p.id == playlistId);
    if (playlistIndex === -1) return;
    const playlist = playlists[playlistIndex];
    
    try {
        const response = await fetch(`${BACKEND_URL}/playlists/${playlist.id}/songs/${encodeURIComponent(songIdToRemove)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            playlists[playlistIndex] = data.playlist;
            
            // Refresh view
            openPlaylist(playlistId);
            displayPlaylists();
        } else {
             const errData = await response.json().catch(() => ({}));
             const errMsg = errData.error || `Server returned ${response.status}`;
             showToast(`❌ Error: ${errMsg}`, 'error');
        }
    } catch (error) {
         console.error('Network error while removing song from playlist:', error);
         showToast("Network error while removing song", 'error');
    }
}

// Delete entire playlist
async function deletePlaylist(playlistId) {
    const playlist = playlists.find(p => p.id == playlistId);
    if (!playlist) return;
    
    if (confirm(`Are you sure you want to delete "${playlist.name}" playlist?\nThis will remove all ${playlist.songs.length} songs from this playlist.`)) {
        const token = getToken();
        
        try {
const response = await fetch(`${BACKEND_URL}/playlists/${playlist.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                playlists = playlists.filter(p => p.id != playlistId);
                
                if (playlistView && playlistView.style.display === 'block') {
                    backToPlaylists();
                } else {
                    displayPlaylists();
                }
                
                showToast(`✅ Playlist "${playlist.name}" deleted successfully!`, 'success');
            } else {
                const errData = await response.json();
                showToast(`❌ Error: ${errData.error}`, 'error');
            }
        } catch (error) {
             showToast("Network error while deleting playlist", 'error');
        }
    }
}


// ============================================
// PLAYBACK FUNCTIONS
// ============================================

// Play song by ID
async function playSongById(songId) {
    const song = allSongs.find(s => s.id == songId || (s._id && s._id.toString() == songId));
    if (song) {
        playSong(song, true);
    } else {
        console.error('Song not found:', songId);
        showToast('Sorry, this song could not be found.', 'error');
    }
}

// Play song
function playSong(song, userTriggered = false) {
    if (!audioPlayer) return;
    
    currentSongIndex = allSongs.findIndex(s => s.id === song.id);
    
    // Set audio source but only auto play when user has just clicked
    const sourceUrl = song.src || `${BACKEND_URL}/stream/${encodeURIComponent(song.id || song._id || '')}`;
    audioPlayer.src = sourceUrl;
    audioPlayer.preload = 'auto';
    audioPlayer.load();

    console.log(`Playing song: ${song.title} by ${song.artist} (src=${sourceUrl})`);

    const playPauseIcon = document.getElementById('playPauseIcon');

    const doPlay = () => {
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                if (playPauseIcon) {
                    playPauseIcon.innerHTML = '<rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect>';
                    playPauseIcon.classList.add('loud');
                }
            }).catch(error => {
                console.error("Playback failed:", error);

                let msg = 'Playback failed. Please try clicking the play button.';
                if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
                    msg = 'Autoplay blocked by browser. Click Play to start.';
                } else if (error.message && error.message.toLowerCase().includes('corrupt')) {
                    msg = 'Cannot play this file: file may be corrupted.';
                } else if (error.message) {
                    msg = `Cannot play this file: ${error.message}`;
                }

                showToast(`⚠️ ${msg}`, 'error');

                if (nowPlaying) nowPlaying.textContent = '⚠️ Playback issue';
                if (playPauseIcon) {
                    playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21"></polygon>';
                    playPauseIcon.classList.remove('loud');
                }
            });
        }
    };

    if (userTriggered) {
        doPlay();
    } else {
        // Preload and update UI but don't force play when autoplay may be blocked
        audioPlayer.pause();
        if (playPauseIcon) {
            playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21"></polygon>';
            playPauseIcon.classList.remove('loud');
        }
    }
    
    // Update now playing display
    if (nowPlaying) {
        nowPlaying.textContent = song.title ? escapeHtml(song.title) : 'Unknown title';
    }
    if (nowPlayingArtist) {
        nowPlayingArtist.textContent = song.artist ? escapeHtml(song.artist) : 'Unknown artist';
    }
    if (currentTimeEl) currentTimeEl.textContent = '00:00';
    if (durationTimeEl) durationTimeEl.textContent = '00:00';

    // Highlight current song in list (optional)
    highlightCurrentSong(song.id);
    renderQueue();

    // Track play history
    if (typeof logPlayHistory === 'function') {
        logPlayHistory(song);
    }
}

function togglePlayPause() {
    if (!audioPlayer) return;
    const playPauseIcon = document.getElementById('playPauseIcon');
    if (audioPlayer.paused) {
        audioPlayer.play();
        if (playPauseIcon) {
            playPauseIcon.innerHTML = '<rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect>';
            playPauseIcon.classList.add('loud');
        }
    } else {
        audioPlayer.pause();
        if (playPauseIcon) {
            playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21"></polygon>';
            playPauseIcon.classList.remove('loud');
        }
    }
}

function setDuration() {
    if (!audioPlayer || !durationTimeEl) return;
    const duration = audioPlayer.duration;
    durationTimeEl.textContent = isNaN(duration) ? '00:00' : formatTime(duration);
}

function updatePlayerProgress() {
    if (!audioPlayer || !progressFilled || !currentTimeEl) return;
    const currentTime = audioPlayer.currentTime;
    const duration = audioPlayer.duration;
    if (isNaN(duration) || duration === 0) return;
    const percent = (currentTime / duration) * 100;
    progressFilled.style.width = `${percent}%`;
    currentTimeEl.textContent = formatTime(currentTime);
}

function setBufferProgress() {
    if (!audioPlayer || !progressFilled) return;
    if (audioPlayer.buffered.length > 0) {
        const bufferedEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
        const duration = audioPlayer.duration;
        // optional: show buffer range as different style in future
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function renderQueue() {
    if (!queueItems) return;
    queueItems.innerHTML = '';

    allSongs.forEach((song, idx) => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        if (idx === currentSongIndex) item.style.border = '1px solid #fa243c';

        item.innerHTML = `<div><strong>${escapeHtml(song.title)}</strong><br><span>${escapeHtml(song.artist)}</span></div><button data-id="${song.id}">Play</button>`;
        item.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            playSongById(song.id);
            closeQueue();
        });

        item.addEventListener('click', () => {
            playSongById(song.id);
            closeQueue();
        });

        queueItems.appendChild(item);
    });
}

function openQueue() {
    if (!queueOverlay) return;
    queueOverlay.style.display = 'flex';
    if (queueBtn) queueBtn.classList.add('active');
    renderQueue();
}

function closeQueue() {
    if (!queueOverlay) return;
    queueOverlay.style.display = 'none';
    if (queueBtn) queueBtn.classList.remove('active');
}

// Highlight currently playing song
function highlightCurrentSong(songId) {
    const allSongItems = document.querySelectorAll('.song-item');
    allSongItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-song-id') == songId) {
            item.classList.add('active');
        }
    });
}

// Play next song
function playNext(isAutoPlay = false) {
    if (allSongs.length === 0) return;
    
    // Auto-play logic (triggered by track ending)
    if (isAutoPlay) {
        if (repeatMode === 2) {
            // Repeat One
            audioPlayer.currentTime = 0;
            audioPlayer.play();
            return;
        }
    }
    
    let nextIndex;
    if (isShuffle && shuffledIndices.length > 0) {
        let currentPos = shuffledIndices.indexOf(currentSongIndex);
        if (currentPos === -1) currentPos = 0;
        
        if (currentPos === shuffledIndices.length - 1) {
            // End of queue
            if (isAutoPlay && repeatMode === 0) return; // Stop if no repeat
            nextIndex = shuffledIndices[0]; // Loop
        } else {
            nextIndex = shuffledIndices[currentPos + 1];
        }
    } else {
        if (currentSongIndex === allSongs.length - 1) {
            if (isAutoPlay && repeatMode === 0) return;
            nextIndex = 0;
        } else {
            nextIndex = currentSongIndex + 1;
        }
    }
    
    playSong(allSongs[nextIndex], false);
}

// Play previous song
function playPrevious() {
    if (allSongs.length === 0) return;
    
    let prevIndex;
    if (isShuffle && shuffledIndices.length > 0) {
        let currentPos = shuffledIndices.indexOf(currentSongIndex);
        if (currentPos === -1) currentPos = 0;
        
        if (currentPos === 0) {
            prevIndex = shuffledIndices[shuffledIndices.length - 1];
        } else {
            prevIndex = shuffledIndices[currentPos - 1];
        }
    } else {
        if (currentSongIndex === 0) {
            prevIndex = allSongs.length - 1;
        } else {
            prevIndex = currentSongIndex - 1;
        }
    }
    
    playSong(allSongs[prevIndex], false);
}

// ============================================
// SHUFFLE & REPEAT LOGIC
// ============================================

function generateShuffle() {
    shuffledIndices = allSongs.map((_, i) => i);
    let currentIndex = shuffledIndices.length, randomIndex;
    
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [shuffledIndices[currentIndex], shuffledIndices[randomIndex]] = [shuffledIndices[randomIndex], shuffledIndices[currentIndex]];
    }
    
    // Ensure current song is at the start of the shuffled list
    if (allSongs.length > 0 && currentSongIndex >= 0) {
        const currentPos = shuffledIndices.indexOf(currentSongIndex);
        if (currentPos !== -1) {
            shuffledIndices.splice(currentPos, 1);
            shuffledIndices.unshift(currentSongIndex);
        }
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    localStorage.setItem('player-shuffle', isShuffle.toString());
    
    const btn = document.getElementById('shuffleBtn');
    if (isShuffle) {
        if(btn) btn.classList.add('active');
        generateShuffle();
    } else {
        if(btn) btn.classList.remove('active');
    }
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    localStorage.setItem('player-repeat', repeatMode.toString());
    updateRepeatUI();
}

function updateRepeatUI() {
    const btn = document.getElementById('repeatBtn');
    const badge = document.getElementById('repeatOneBadge');
    
    if (repeatMode === 0) {
        if(btn) btn.classList.remove('active');
        if(badge) badge.style.display = 'none';
    } else if (repeatMode === 1) {
        if(btn) btn.classList.add('active');
        if(badge) badge.style.display = 'none';
    } else if (repeatMode === 2) {
        if(btn) btn.classList.add('active');
        if(badge) badge.style.display = 'block';
    }
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

// Display songs in home/search view
async function displaySongs(songs) {
    if (!songList) return;
    
    if (!songs || songs.length === 0) {
        songList.innerHTML = '<div class="empty-state">🎵 No songs found. Contact admin to upload music!</div>';
        return;
    }
    
    songList.innerHTML = songs.map((song) => {
        const isFavorited = favorites.some(f => f.songId == song.id);
        const heartSvg = isFavorited 
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

        const coverUrl = song.coverPath ? song.coverPath : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNTU1IiBzdHJva2Utd2lkdGg9IjIiPjxjcmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0Ii8+PHBhdGggZD0iTTkgMTguVjVMMjEgM3YxM1oiLz48L3N2Zz4=';

        return `
        <div class="song-item" data-song-id="${song.id}" onclick="playSongById('${song.id}')">
            <img src="${coverUrl}" class="song-thumbnail" alt="Cover" width="40" height="40" style="border-radius:4px; object-fit:cover; margin-right:12px; background:var(--bg-secondary);">
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.artist)}</div>
                <div class="song-meta">${formatFileSize(song.fileSize)}</div>
            </div>
            <div class="song-actions">
                <button class="favorite-btn ${isFavorited ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${song.id}')" title="Favorite">
                    ${heartSvg}
                </button>
                <button class="add-to-playlist-btn" onclick="event.stopPropagation(); addToPlaylist('${song.id}')">
                    📋 Add
                </button>
            </div>
        </div>
    `}).join('');

    if (currentPage < totalPages && currentView === "home") {
        songList.innerHTML += `
            <div style="text-align:center; padding: 20px;">
                <button onclick="loadAllSongs(currentPage + 1, true)" class="load-more-btn" style="background:var(--secondary); color:white; padding:10px 24px; border-radius:30px; border:none; cursor:pointer; font-weight:600;">
                    Load More
                </button>
            </div>
        `;
    }
}

// Handle search functionality
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (searchTerm === "") {
        displaySongs(allSongs);
        return;
    }
    
    const filteredSongs = allSongs.filter(song => 
        song.title.toLowerCase().includes(searchTerm) || 
        song.artist.toLowerCase().includes(searchTerm)
    );
    
    if (filteredSongs.length === 0) {
        songList.innerHTML = `<div class="empty-state">🔍 No results found for "${escapeHtml(searchTerm)}"</div>`;
    } else {
        displaySongs(filteredSongs);
    }
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

// Show different sections (Home, Search, Library)
function showSection(type) {
    currentView = type;
    
    // Hide all sections
    if (homeSection) homeSection.style.display = "none";
    if (librarySection) librarySection.style.display = "none";
    
    // Handle search input visibility
    if (searchInput) {
        if (type === 'search') {
            searchInput.style.display = "block";
            searchInput.focus();
        } else {
            searchInput.style.display = "none";
            searchInput.value = "";
        }
    }
    
    if (type === "home") {
        if (homeSection) {
            homeSection.style.display = "block";
            const rps = document.getElementById('recentlyPlayedSection');
            if (rps && typeof recentlyPlayed !== 'undefined' && recentlyPlayed.length > 0) rps.style.display = "block";
            displaySongs(allSongs);
        }
    } else if (type === "search") {
        if (homeSection) {
            homeSection.style.display = "block";
            const rps = document.getElementById('recentlyPlayedSection');
            if (rps) rps.style.display = "none";
            // Show all songs initially
            displaySongs(allSongs);
        }
    } else if (type === "library") {
        if (librarySection) {
            librarySection.style.display = "block";
            // Reset to playlists view
            if (playlistView) playlistView.style.display = "none";
            const myPlaylistsSection = document.querySelector('.my-playlists-section');
            const createSection = document.querySelector('.create-playlist-section');
            if (myPlaylistsSection) myPlaylistsSection.style.display = "block";
            if (createSection) createSection.style.display = "block";
            displayPlaylists();
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Format file size for display
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown size';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Escape HTML to prevent XSS attacks
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize the player
async function init() {
    console.log("Initializing Music Player...");
    
    // Get DOM elements
    songList = document.getElementById("songList");
    audioPlayer = document.getElementById("audioPlayer");
    nowPlaying = document.getElementById("nowPlayingTitle");
    currentTimeEl = document.getElementById("currentTime");
    durationTimeEl = document.getElementById("durationTime");
    progressContainer = document.getElementById("progressContainer");
    progressFilled = document.getElementById("progressFilled");
    volumeSlider = document.getElementById("volumeSlider");
    searchInput = document.getElementById("searchInput");
    nextBtn = document.getElementById("nextBtn");
    prevBtn = document.getElementById("prevBtn");
    queueBtn = document.getElementById("queueBtn");
    queueOverlay = document.getElementById("queueOverlay");
    queueItems = document.getElementById("queueItems");
    closeQueueBtn = document.getElementById("closeQueueBtn");
    playlistName = document.getElementById("playlistName");
    createPlaylistBtn = document.getElementById("createPlaylistBtn");
    playlistContainer = document.getElementById("playlistContainer");
    nowPlayingArtist = document.getElementById("nowPlayingArtist");
    librarySection = document.getElementById("librarySection");
    homeSection = document.getElementById("homeSection");
    playlistView = document.getElementById("playlistView");
    playlistNameDisplay = document.getElementById("playlistNameDisplay");
    playlistSongsList = document.getElementById("playlistSongsList");
    
    // Check if we're on the player page
    if (!songList) {
        console.log("Not on player page - skipping initialization");
        return;
    }
    
    // Load songs from Backend
    await loadAllSongs();
    
    // Load playlists from Cloud
    await loadPlaylists();
    
    // Load Tracking History
    await loadSearchHistory();
    await loadRecentlyPlayed();
    await loadFavorites();
    renderSearchHistory();
    renderRecentlyPlayed();
    
    // Display initial songs
    await displaySongs(allSongs);
    
    // Generate initial shuffle array if enabled
    if (isShuffle && allSongs.length > 0) {
        generateShuffle();
    }
    
    // Listen for updates from admin uploads
    window.addEventListener('storage', (event) => {
        if (event.key === 'songs-updated-at') {
            console.log('Songs update event detected, refreshing song list...');
            loadAllSongs(1, false);
        }
    });

    // Auto-refresh songs every 30 seconds
    setInterval(() => {
        if (currentView === 'home' || currentView === 'search') {
            loadAllSongs(1, false);
        }
    }, 30000);
    
    // Setup event listeners
    if (searchInput) {
        searchInput.addEventListener("input", handleSearch);
        searchInput.addEventListener("focus", () => {
            const dropdown = document.getElementById('searchHistoryDropdown');
            if (dropdown) dropdown.style.display = 'flex';
        });
        searchInput.addEventListener("blur", () => {
            setTimeout(() => {
                const dropdown = document.getElementById('searchHistoryDropdown');
                if (dropdown) dropdown.style.display = 'none';
            }, 200);
        });
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === 'Enter') {
                if (typeof logSearchQuery === 'function') logSearchQuery(searchInput.value);
                const dropdown = document.getElementById('searchHistoryDropdown');
                if (dropdown) dropdown.style.display = 'none';
                searchInput.blur();
            }
        });
        searchInput.style.display = "none"; // Hide by default
    }
    
    const clearBtn = document.getElementById('clearSearchHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof clearSearchHistory === 'function') clearSearchHistory();
        });
    }
    
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => playNext(false));
    }
    
    if (prevBtn) {
        prevBtn.addEventListener("click", playPrevious);
    }
    
    if (audioPlayer) {
        audioPlayer.addEventListener("ended", () => playNext(true));
        audioPlayer.addEventListener("error", (e) => {
            console.error("Audio playback error:", e);
            let msg = 'Cannot play this track. Ensure the file exists and is a supported audio format.';
            if (e && e.target && e.target.error && e.target.error.code) {
                const code = e.target.error.code;
                if (code === 4) {
                    msg = 'Audio playback error #4: Unsupported media source or invalid stream URL. Please reload the page and try again.';
                } else {
                    msg = `Audio playback error #${code}.`;
                }
            }
            showToast(`⚠️ ${msg}`, 'error');
            if (nowPlaying) nowPlaying.textContent = '⚠️ Playback error';
            const playPauseIcon = document.getElementById('playPauseIcon');
            if (playPauseIcon) {
                playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21"></polygon>';
                playPauseIcon.classList.remove('loud');
            }
        });
        audioPlayer.addEventListener("timeupdate", updatePlayerProgress);
        audioPlayer.addEventListener("loadedmetadata", setDuration);
        audioPlayer.addEventListener("progress", setBufferProgress);
    }

    if (progressContainer) {
        progressContainer.addEventListener('click', (e) => {
            if (!audioPlayer || !audioPlayer.duration || isNaN(audioPlayer.duration)) return;
            const rect = progressContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, x / rect.width));
            audioPlayer.currentTime = ratio * audioPlayer.duration;
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            audioPlayer.volume = parseFloat(volumeSlider.value);
            localStorage.setItem('player-volume', audioPlayer.volume.toString());
        });

        const savedVolume = parseFloat(localStorage.getItem('player-volume'));
        if (!isNaN(savedVolume)) {
            audioPlayer.volume = savedVolume;
            volumeSlider.value = savedVolume;
        } else {
            audioPlayer.volume = parseFloat(volumeSlider.value || '0.75');
        }
    }

    const shuffleBtn = document.getElementById('shuffleBtn');
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', toggleShuffle);
        if (isShuffle) {
            shuffleBtn.classList.add('active');
        }
    }

    if (queueBtn) {
        queueBtn.addEventListener('click', openQueue);
    }
    if (closeQueueBtn) {
        closeQueueBtn.addEventListener('click', closeQueue);
    }

    document.addEventListener('keydown', (event) => {
        if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;

        switch(event.key) {
            case ' ':
                event.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowRight':
                playNext(false);
                break;
            case 'ArrowLeft':
                playPrevious();
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (audioPlayer) {
                    audioPlayer.volume = Math.min(1, audioPlayer.volume + 0.05);
                    if (volumeSlider) volumeSlider.value = audioPlayer.volume.toFixed(2);
                }
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (audioPlayer) {
                    audioPlayer.volume = Math.max(0, audioPlayer.volume - 0.05);
                    if (volumeSlider) volumeSlider.value = audioPlayer.volume.toFixed(2);
                }
                break;
            case 'q':
            case 'Q':
                openQueue();
                break;
        }
    });
    
    const repeatBtn = document.getElementById('repeatBtn');
    if (repeatBtn) {
        repeatBtn.addEventListener('click', toggleRepeat);
        updateRepeatUI();
    }
    
    if (createPlaylistBtn) {
        createPlaylistBtn.addEventListener("click", createPlaylist);
    }
    
    console.log(`✅ Player initialized with ${allSongs.length} songs and ${playlists.length} playlists`);
    console.log("ℹ️ Playlists are stored in the cloud via MongoDB");
}

// ============================================
// TRACKING & HISTORY FUNCTIONS
// ============================================

let searchHistory = [];
let recentlyPlayed = [];

async function loadSearchHistory() {
    const token = getToken();
    if (!token) {
        const saved = localStorage.getItem('searchHistory');
        searchHistory = saved ? JSON.parse(saved) : [];
        renderSearchHistory();
        return;
    }
    try {
        const res = await fetch(`${BACKEND_URL}/history/search`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            searchHistory = await res.json();
        } else {
            const saved = localStorage.getItem('searchHistory');
            searchHistory = saved ? JSON.parse(saved) : [];
        }
    } catch (e) {
        console.error("Error loading search history", e);
        const saved = localStorage.getItem('searchHistory');
        searchHistory = saved ? JSON.parse(saved) : [];
    }
    renderSearchHistory();
}

async function logSearchQuery(query) {
    if (!query || !query.trim()) return;
    const cleaned = query.trim();
    const token = getToken();

    // Save local copy for guest mode and offline support
    const local = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    const deduped = local.filter(item => item.query.toLowerCase() !== cleaned.toLowerCase());
    deduped.unshift({ query: cleaned, timestamp: Date.now() });
    searchHistory = deduped.slice(0, 10);
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
    renderSearchHistory();

    if (!token) return;

    try {
        const res = await fetch(`${BACKEND_URL}/history/search`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: cleaned })
        });
        if (res.ok) {
            await loadSearchHistory();
        }
    } catch (e) {
        console.error("Error saving search history", e);
    }
}

async function clearSearchHistory() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/history/search', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            searchHistory = [];
            renderSearchHistory();
        }
    } catch (e) {
        console.error("Error clearing search history", e);
    }
}

function renderSearchHistory() {
    const list = document.getElementById('searchHistoryList');
    if (!list) return;
    
    if (searchHistory.length === 0) {
        list.innerHTML = '<li class="search-history-item" style="justify-content:center; color:var(--text-secondary); cursor:default;">No recent searches</li>';
        return;
    }
    
    list.innerHTML = searchHistory.map(item => `
        <li class="search-history-item" onclick="applySearchHistory('${escapeHtml(item.query.replace(/'/g, "\\'"))}')">
            <svg class="history-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${escapeHtml(item.query)}
        </li>
    `).join('');
}

function applySearchHistory(query) {
    if (searchInput) {
        searchInput.value = query;
        if (typeof handleSearch === 'function') handleSearch();
        const dropdown = document.getElementById('searchHistoryDropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        if (currentView !== 'search') {
            const browseBtn = document.querySelectorAll('.nav-btn')[1]; // Navigate to Search/Browse tab
            if (browseBtn) browseBtn.click();
        }
    }
}

async function loadRecentlyPlayed() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/history/play', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            recentlyPlayed = await res.json();
            renderRecentlyPlayed();
        }
    } catch (e) {
        console.error("Error loading recently played", e);
    }
}

async function logPlayHistory(song) {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/history/play', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                songId: song.id.toString(),
                title: song.title,
                artist: song.artist
            })
        });
        if (res.ok) {
            await loadRecentlyPlayed();
        }
    } catch (e) {
        console.error("Error logging play history", e);
    }
}

function renderRecentlyPlayed() {
    const section = document.getElementById('recentlyPlayedSection');
    const list = document.getElementById('recentlyPlayedList');
    
    if (!section || !list) return;
    
    if (recentlyPlayed.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    if (currentView === 'home') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
    
    list.innerHTML = recentlyPlayed.map(item => `
        <div class="recent-song-card" onclick="playSongById('${item.songId}')">
            <div class="recent-song-art"></div>
            <div class="recent-song-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="recent-song-artist" title="${escapeHtml(item.artist)}">${escapeHtml(item.artist)}</div>
        </div>
    `).join('');
}

async function loadFavorites() {
    const token = getToken();
    if (!token) {
        // Guest mode uses localStorage fallback
        const saved = localStorage.getItem('localFavorites');
        favorites = saved ? JSON.parse(saved) : [];
        return;
    }

    try {
        const res = await fetch(`${BACKEND_URL}/favorites`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            favorites = await res.json();
        } else {
            console.warn('Failed to load favorites from server', res.status);
            const saved = localStorage.getItem('localFavorites');
            favorites = saved ? JSON.parse(saved) : [];
        }
    } catch (e) {
        console.error("Error loading favorites", e);
        const saved = localStorage.getItem('localFavorites');
        favorites = saved ? JSON.parse(saved) : [];
    }
}

async function toggleFavorite(songId) {
    const token = getToken();

    const isFavorited = favorites.some(f => f.songId == songId);

    try {
        if (isFavorited) {
            // Unfavorite
            favorites = favorites.filter(f => f.songId != songId);

            if (token) {
                const res = await fetch(`${BACKEND_URL}/favorites/${encodeURIComponent(songId)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to remove favorite');
                }
            }
        } else {
            const song = allSongs.find(s => s.id == songId || (s._id && s._id.toString() == songId));
            if (!song) {
                showToast('Song not found for favorite action', 'error');
                return;
            }

            const favoriteEntry = {
                userId: null,
                songId: songId.toString(),
                title: song.title,
                artist: song.artist,
                addedAt: new Date()
            };

            if (token) {
                const res = await fetch(`${BACKEND_URL}/favorites`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        songId: songId.toString(),
                        title: song.title,
                        artist: song.artist
                    })
                });
                if (res.ok) {
                    const added = await res.json();
                    favorites.unshift(added);
                } else {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to add favorite');
                }
            } else {
                favorites.unshift(favoriteEntry);
                localStorage.setItem('localFavorites', JSON.stringify(favorites));
                showToast('✅ Added to local favorites (login to sync)', 'success');
            }
        }

        // Sync local store when no server token
        if (!token) {
            localStorage.setItem('localFavorites', JSON.stringify(favorites));
        }

        // Re-render Views to show state dynamically
        if (currentView === 'home' || currentView === 'search') {
            displaySongs(allSongs);
        } else if (currentView === 'playlist') {
            const displayHeader = document.getElementById('playlistNameDisplay');
            if (displayHeader && displayHeader.innerText === '❤️ Favorites') {
                openFavoritesPlaylist();
            }
        }

    } catch (e) {
        console.error("Failed to toggle favorite", e);
        showToast(`❌ ${e.message || 'Could not update favorites'}`, 'error');
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ============================================
// GLOBAL FUNCTIONS (For HTML onclick)
// ============================================

window.playSongById = playSongById;
window.openPlaylist = openPlaylist;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.showSection = showSection;
window.backToPlaylists = backToPlaylists;
window.deletePlaylist = deletePlaylist;
window.formatFileSize = formatFileSize;
window.applySearchHistory = applySearchHistory;
window.toggleFavorite = toggleFavorite;
window.openFavoritesPlaylist = openFavoritesPlaylist;