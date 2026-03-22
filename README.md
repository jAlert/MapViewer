<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GeoInsight Map Viewer

Instructions for running the application locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) create a `.env.local` file containing your `GEMINI_API_KEY` if you plan to call the Gemini API.
3. Run the app:
   `npm run dev`

Local storage & development notes

- **Local-only storage:** Uploaded files are persisted in the browser (IndexedDB) via `services/localStorageService.ts`. There is no cloud backend or Firebase integration.
- **Optional local save server:** A small server can write combined GeoJSON copies into `public/uploads/` for easier development. Start it with:

   `npm run save-geojson-server`

- To run the app and the local save server together (dev):

   `npm run dev:all`

- Files saved to `public/uploads/` are for local development only. Deleting a stored file in the app will also remove it from the server if it's running.

See `scripts/save-geojson-server.js` and `services/storageService.ts` for details.
