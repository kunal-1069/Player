# Web Music Player

A full-stack music management and player app built with Node.js, Express, MongoDB and vanilla HTML/CSS/JS.

## 📌 Project Description

This project provides:
- User authentication (register/login) using JWT
- Admin interface for song upload, batch import (ID3 tagging), delete
- Song listing, pagination, streaming endpoint with range support
- Favorites, recent plays, and search history features
- MongoDB-based backend and static frontend
- 5-minute caching for heavy dashboard list calls to reduce DB overload

## ✅ Features

- Admin dashboard for library management
- Song file upload (MP3/WAV/OGG/M4A, 50MB limit)
- Batch folder import with ID3 tag extraction
- Song streaming with `Range` request support
- Search history, recently played, favorites
- Protected operations via JWT and `Authorization: Bearer` header
- Rate limiting (100 requests per 15 min per IP)
- Cache for `/songs` to reduce redundant DB reads (5 mins)
- Professional music player UI with track progress, volume control, and enhanced interaction

## ⚙️ Installation

1. Clone repo:
   ```bash
   git clone <repo-url>
   cd web-music-player-main
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and adjust:
   ```bash
   cp .env.example .env
   ```
4. Run in development (nodemon):
   ```bash
   npm run dev
   ```
5. Run production:
   ```bash
   npm start
   ```

## 📦 package.json Scripts

- `npm run dev`: development mode via nodemon
- `npm start`: production mode (`node server.js`)
- `npm run build`: frontend minification (`terser`, `cleancss`) as configured

## 🛠️ API Documentation

### Auth
- POST `/auth/register` `{ username, password }`
- POST `/auth/login` `{ username, password }`

### Songs
- GET `/songs?page=1&limit=20` (caching applied for 5 min)
- GET `/stream/:songId`
- POST `/songs` (token required; form-data `songFile`, title, artist)
- POST `/songs/batch` (token required; form-data `songFiles`)
- DELETE `/songs/:id` (token required)

### Playlist
- POST `/playlists`
- GET `/playlists`
- POST `/playlists/:id/songs`
- DELETE `/playlists/:id/songs/:songId`
- DELETE `/playlists/:id`

### History
- POST `/history/search`
- GET `/history/search`
- DELETE `/history/search`
- POST `/history/play`
- GET `/history/play`

### Favorites
- POST `/favorites`
- GET `/favorites`
- DELETE `/favorites/:songId`

## 🌍 Environment Variables

Create `.env` file:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/musicdb
JWT_SECRET=your_jwt_secret_here
```

## 🚀 Deployment

### Docker

1. Build and run:
   ```bash
   docker-compose up --build -d
   ```
2. Access: `http://localhost:3000`

### Manual server

1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`

## 🖼️ Screenshots

Add screenshots from `admin.html`, `index.html`, and authentication flow here.

- `screenshots/dashboard.png`
- `screenshots/upload-flow.png`
- `screenshots/player.png`

> Note: Add actual image files under `screenshots/` for final documentation.
