# Buffering and seeking

[Back to the README](../README.md)

Video that stalls or jumps is the most common thing to go wrong in a watch party, so the player says what is happening and
recovers by itself instead of failing.

## What the viewer sees

- **A spinner over the picture** while the video waits for data: "Jumping…" after a seek, "Buffering…" when it runs out of
  data while playing. It appears only if the wait lasts about a third of a second, so quick seeks do not flash one, and it
  goes away a moment after the picture is back, so a stall that restarts straight away does not blink. After about three
  seconds it adds "This is taking a while. Check your connection." The big play button steps aside while the spinner shows.
- **A lighter bar on the timeline** showing how far the video has loaded ahead of the playing position, so a seek can be
  aimed at what will start at once.
- **"Connection to the video lost. Trying again…"** while a dropped connection is being retried, and "You're offline…" if the
  browser reports no network. A failure screen appears only after several retries have failed.

## What the room sees

After a device has been waiting for data for **3 seconds**, it tells the room. The People tab shows a "Buffering" tag next to
that person, and everyone else's picture shows "Ann is buffering…" while the room is playing. It clears itself when the person
catches up, when they disconnect, or when a different video is loaded. Short waits are not reported. Nothing pauses the room:
the person who fell behind jumps forward to the room's position once data arrives (the lead time learned from earlier jumps
makes that land close). Pausing the room for slow viewers could be added later as a host option.

## How recovery works

- **Streaming (HLS) video:** a fatal network error is retried by restarting the download after 0.8, 1.6, 3.2, 6.4 and 8 seconds;
  a decoding error resets the decoder (the second time also trying the other audio path). Getting data again resets the
  counters. Coming back online restarts the download straight away.
- **Single-file (MP4) video:** a network error reloads the file and resumes from the same spot, with the same growing pauses.
  Anything that is not a network error shows the normal error with a "Try again" button.
- **The sync loop no longer fights a slow jump.** The room keeps moving while the data for a jump is arriving, so the gap
  grows and every check used to say "jump again", cancelling the download the last jump started, over and over on a slow
  connection. While waiting for the first frames after a jump, the loop now lets it finish (for up to 5 seconds); one more
  jump when the data arrives corrects what is left.

## What was tested

With a small proxy in front of the app that could throttle or cut the video connection on demand, on a desktop browser at
320 px and 667 px wide, in English and Spanish:

- A link slower than the video: "Jumping…" then "Buffering…" appeared and cleared as data arrived, and the room was told
  (and told again when it recovered).
- The connection cut mid-download: the browser resumed on its own with no error screen.
- The network down while seeking, for 11 seconds (MP4) and 16 seconds (HLS): "Jumping…" the whole time, no error screen, and
  playback resumed in step with the room (about 1 second after the network returned for MP4, about 7 seconds for HLS because
  hls.js backs off its retries).
- Another viewer reporting buffering: the notice and the People tag appeared and cleared.
- The layout checks (no overflow, nothing clipped, spinner inside the picture) and the server behaviour tests.

## What was not tested

- **Real phones.** Real networks (walking between Wi-Fi and mobile data) behave differently from a proxy that drops a socket.
- **Long outages.** Outages beyond about 20 seconds, where the retries run out and the error screen is supposed to appear.
- **Safari's built-in HLS player**, which does not go through hls.js (it gets the spinner and the room report, but not the
  hls.js retry logic).
- **Big rooms.** The room is told when someone buffers, but the load test was not run with many people buffering at once.
