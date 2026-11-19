export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Index the media folder as the server starts, so the first room already has its videos.
  const { scanLibrary } = await import("./app/media-library");
  scanLibrary()
    .then(result => console.log(`Media library: ${result.total} video(s), ${result.added} new, ${result.errors.length} problem(s)`))
    .catch(error => console.error("Media library scan failed", error));
}
