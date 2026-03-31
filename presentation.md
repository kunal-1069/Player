# Pro Music Player Black Book

## 1. Overview
- Full-stack music streaming app with admin library and user player.
- Stack: Node.js + Express + MongoDB + Mongoose + Vanilla JS.
- Files: frontend (index.html, admin.html, auth.html), backend (server.js), API client (js/*.js).
- Authentication: JWT via /auth/login and /auth/register.

## 2. Architecture
- Client: static HTML + CSS + JS (local state in IndexedDB/localStorage, request to backend).
- Server: Express app with routes for songs, playlists, users, history, favorites.
- Storage: MongoDB collections: User, Song, Playlist, SearchHistory, RecentlyPlayed, Favorite.
- Media store: uploaded files in /uploads folder with streaming endpoint /stream/:songId.
- Cache: in-memory TTL for /songs endpoint (5 minutes) with invalidation on write.
- Deployment: Dockerfile + docker-compose (Mongo + app).

## 3. Data Model
### User
- username, password (hashed), role.

### Song
- title, artist, fileName, fileType, fileSize, coverPath, uploadDate, id (timestamp fallback).

### Playlist
- userId, name, songs [{songId,title,artist}], createdAt.

### Favorite/RecentlyPlayed/SearchHistory
- userId, songId, title, artist, timestamp.

## 4. API Spec
### Auth
- POST /auth/register {username,password} -> token
- POST /auth/login {username,password} -> token

### Songs
- GET /songs?page&limit -> {songs,total,page,totalPages}
- POST /songs (auth + multipart) -> create song
- POST /songs/batch (auth + multipart) -> batch create
- DELETE /songs/:id (auth) -> delete
- GET /stream/:songId -> audio range stream

### Playlists (auth)
- GET /playlists
- POST /playlists {name}
- POST /playlists/:id/songs {songId,title,artist}
- DELETE /playlists/:id/songs/:songId
- DELETE /playlists/:id

### Search/History/Favorites
- search history: GET/POST/DELETE /history/search
- listen history: GET/POST /history/play
- favorites: GET/POST/DELETE /favorites

## 5. Frontend Workflows
### Player flow
- loadAllSongs() => /songs, enrich with src `${BACKEND_URL}/stream/${id}`
- displaySongs with play action playSongById
- playSong(song, userTriggered) handles browser autoplay restrictions
- progress update via timeupdate listener
- favorite toggle via /favorites (or localStorage fallback)
- search with local and server history; storage fallback
- playlist CRUD with robust id/_id handling and refresh from server

### Admin flow
- loadAdminSongs from /songs store in admin panel
- uploadSong batch upload support + progress simulation
- deleteSong + cache invalidation marker
- resilient message for fetch failure

## 6. Deployment & Run
- local: `npm install`, `node server.js`
- docker: `docker-compose up --build -d`
- ENV: `MONGODB_URI`, `PORT`, `JWT_SECRET`
- verify app: `http://localhost:3000`, admin page `admin.html`, auth `auth.html`.

## 7. Common problems + fixes
### 7.1 Autoplay blocked / Audio playback error #4
- playSong now user-triggered for click events.
- On NotAllowedError shows toast with manual click message.

### 7.2 "failed to fetch" on auth/upload
- switched calls to `BACKEND_URL` constant to avoid relative path breaks.

### 7.3 playlist exists but not showing
- normalize playlist in client by id/_id, always refresh from /playlists after create/add/remove.

### 7.4 progress bar not filling
- CSS typo fixed from `..progress-filled` to `.progress-filled`.

## 8. Maintenance checklist
- Add unit tests on server routes (Jest/Supertest).
- Add integration tests for playlist/favorites.
- Add monitoring for cache hit ratio and stream 206 performance.
- Policy: rotate JWT secret, secure uploads (filename sanitization), set CORS and CSP.

## 9. Glossary
- `BACKEND_URL`: computed as location origin fallback localhost (works both in dev and production behind proxy).
- `CACHE_TTL_MS`: 5*60*1000.
- `allSongs`: client-side in-memory track list.
- `playlists`: user playlist cache loaded from server.
- `songs-updated-at`: localStorage key used for cross-tab sync.

---

> Notes: This black book is the canonical developer reference for shipping and debugging Pro Music Player.
