import { useEffect, useRef } from "react";
import { canSkipBlockedTrack } from "../engine/playerHelp";
import { parseYouTubeInput } from "../utils/youtubeUrl";

let ytApiPromise = null;

export { parseYouTubeInput as parseYouTubeUrl };

const YT_ERROR_LABELS = {
  2: "Invalid video or playlist ID (Error 2)",
  5: "HTML5 player playback error (Error 5)",
  100: "Video removed or private (Error 100)",
  101: "Video owner disabled embedding (Error 101)",
  150: "Video owner disabled embedding (Error 150)",
  153: "Missing Referer / origin identity (Error 153)"
};

export function loadYouTubeApi() {
  if (typeof window !== "undefined" && window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      if (typeof document === "undefined") {
        ytApiPromise = null;
        reject(new Error("Document unavailable."));
        return;
      }
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => {
        ytApiPromise = null;
        reject(new Error("Could not load YouTube player script."));
      };
      window.onYouTubeIframeAPIReady = () => {
        console.info("[YouTubePlayer] API loaded");
        resolve(window.YT);
      };
      document.head.appendChild(tag);
    }).catch((err) => {
      ytApiPromise = null;
      throw err;
    });
  }
  return ytApiPromise;
}

export function YouTubePlayer({
  youtubeSource,
  isPlayingScreen,
  playerInstanceRef,
  onPlayerLoading,
  onPlayerReady,
  onPlayerCued,
  onPlayerError,
  onAutoplayBlocked,
  onTrackChanged,
  onPlaylistEnded,
  onVideoEnded,
  onVideoPaused,
  onVideoPlaying
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const generationRef = useRef(0);
  const lastVideoIdRef = useRef(null);
  const requestedStartHandledRef = useRef(false);
  const skippedItemsRef = useRef(0);

  const callbacksRef = useRef({
    onPlayerLoading,
    onPlayerReady,
    onPlayerCued,
    onPlayerError,
    onAutoplayBlocked,
    onTrackChanged,
    onPlaylistEnded,
    onVideoEnded,
    onVideoPaused,
    onVideoPlaying
  });
  callbacksRef.current = {
    onPlayerLoading,
    onPlayerReady,
    onPlayerCued,
    onPlayerError,
    onAutoplayBlocked,
    onTrackChanged,
    onPlaylistEnded,
    onVideoEnded,
    onVideoPaused,
    onVideoPlaying
  };

  const sourceKey =
    youtubeSource?.type === "playlist"
      ? `pl:${youtubeSource.playlistId}:${youtubeSource.requestedVideoId || ""}`
      : youtubeSource?.videoId
        ? `vid:${youtubeSource.videoId}`
        : null;

  useEffect(() => {
    if (!youtubeSource || !sourceKey) return;
    let cancelled = false;
    const myGen = ++generationRef.current;
    lastVideoIdRef.current = null;
    requestedStartHandledRef.current = false;
    skippedItemsRef.current = 0;

    callbacksRef.current.onPlayerLoading?.();

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || generationRef.current !== myGen || !containerRef.current) return;

        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // Ignore cleanup error
          }
          playerRef.current = null;
        }

        containerRef.current.innerHTML = "";
        const mountNode = document.createElement("div");
        containerRef.current.appendChild(mountNode);

        const isPlaylist = youtubeSource.type === "playlist";
        const playerVars = {
          autoplay: 0,
          controls: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: typeof window !== "undefined" ? window.location.origin : undefined
        };

        if (isPlaylist) {
          playerVars.listType = "playlist";
          playerVars.list = youtubeSource.playlistId;
        }

        console.info("[YouTubePlayer] Creating player:", {
          sourceKey,
          origin: playerVars.origin
        });

        const inspectCurrentTrack = (target) => {
          try {
            const data = target.getVideoData?.();
            const currentVid = data?.video_id || null;
            const title = data?.title || "";
            const idx = typeof target.getPlaylistIndex === "function" ? target.getPlaylistIndex() : 0;
            const list = typeof target.getPlaylist === "function" ? target.getPlaylist() : null;
            const total = Array.isArray(list) ? list.length : 0;

            if (currentVid && currentVid !== lastVideoIdRef.current) {
              const isAdvance = Boolean(lastVideoIdRef.current);
              lastVideoIdRef.current = currentVid;
              skippedItemsRef.current = 0;
              console.info(
                `[YouTubePlayer] ${isAdvance ? "Playlist advanced" : "Current video"}:`,
                { videoId: currentVid, title, playlistIndex: idx, playlistTotal: total }
              );
              callbacksRef.current.onTrackChanged?.({
                videoId: currentVid,
                title,
                playlistIndex: idx,
                playlistTotal: total
              });
            }
          } catch {
            // Metadata may not be populated until CUED
          }
        };

        playerRef.current = new YT.Player(mountNode, {
          width: "100%",
          height: "100%",
          videoId: !isPlaylist ? youtubeSource.videoId : undefined,
          playerVars,
          events: {
            onReady: (event) => {
              if (cancelled || generationRef.current !== myGen) return;
              const target = event.target;
              if (playerInstanceRef) playerInstanceRef.current = target;

              // Ensure iframe sends Referer header to prevent Error 153
              try {
                const iframeEl = target.getIframe?.();
                if (iframeEl) {
                  iframeEl.referrerPolicy = "strict-origin-when-cross-origin";
                  iframeEl.allow =
                    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
                }
              } catch {
                // Ignore
              }

              const list = typeof target.getPlaylist === "function" ? target.getPlaylist() : null;
              console.info("[YouTubePlayer] Player ready:", {
                playlistLength: Array.isArray(list) ? list.length : null,
                playlistIndex: target.getPlaylistIndex?.() ?? null
              });

              callbacksRef.current.onPlayerReady?.(target);

              if (!isPlaylist) {
                inspectCurrentTrack(target);
                callbacksRef.current.onPlayerCued?.();
              } else if (Array.isArray(list) && list.length > 0) {
                if (
                  youtubeSource.requestedVideoId &&
                  !requestedStartHandledRef.current
                ) {
                  requestedStartHandledRef.current = true;
                  const foundIdx = list.indexOf(youtubeSource.requestedVideoId);
                  if (foundIdx > 0 && typeof target.cuePlaylist === "function") {
                    console.info("[YouTubePlayer] Cueing requested start index:", foundIdx);
                    target.cuePlaylist({
                      listType: "playlist",
                      list: youtubeSource.playlistId,
                      index: foundIdx
                    });
                    return;
                  }
                }
                inspectCurrentTrack(target);
                callbacksRef.current.onPlayerCued?.();
              }
            },
            onError: (event) => {
              if (cancelled || generationRef.current !== myGen) return;
              const errCode = event.data;
              const reason = YT_ERROR_LABELS[errCode] || `YouTube error (${errCode})`;
              const list = playerRef.current?.getPlaylist?.();
              const idx = playerRef.current?.getPlaylistIndex?.() ?? -1;

              console.error("[YouTubePlayer] YouTube error code:", errCode, reason, {
                playlistLength: Array.isArray(list) ? list.length : null,
                playlistIndex: idx
              });

              // Bounded skip (max 5 items) when an individual song inside a valid playlist is restricted (100/101/150)
              if (isPlaylist && canSkipBlockedTrack({
                code: errCode, playlist: list, index: idx, attempts: skippedItemsRef.current
              })) {
                skippedItemsRef.current += 1;
                console.info(
                  `[YouTubePlayer] Skipping restricted track (${idx + 1}/${list.length}), attempt ${skippedItemsRef.current}/5`
                );
                playerRef.current?.nextVideo?.();
                return;
              }

              callbacksRef.current.onPlayerError?.({
                code: errCode,
                reason,
                playlistLength: Array.isArray(list) ? list.length : 0,
                playlistIndex: idx
              });
            },
            onAutoplayBlocked: () => {
              if (cancelled || generationRef.current !== myGen) return;
              console.warn("[YouTubePlayer] Autoplay blocked by browser policy");
              callbacksRef.current.onAutoplayBlocked?.();
            },
            onStateChange: (event) => {
              if (cancelled || generationRef.current !== myGen) return;
              const target = event.target;
              const stateCode = event.data;
              console.info("[YouTubePlayer] Player state changed:", stateCode);

              // 5 = CUED
              if (stateCode === 5) {
                const list = typeof target.getPlaylist === "function" ? target.getPlaylist() : null;
                console.info("[YouTubePlayer] CUED event received:", {
                  playlistLength: Array.isArray(list) ? list.length : null,
                  playlistIndex: target.getPlaylistIndex?.() ?? null
                });
                if (
                  isPlaylist &&
                  youtubeSource.requestedVideoId &&
                  !requestedStartHandledRef.current &&
                  Array.isArray(list)
                ) {
                  requestedStartHandledRef.current = true;
                  const foundIdx = list.indexOf(youtubeSource.requestedVideoId);
                  if (foundIdx > 0 && typeof target.cuePlaylist === "function") {
                    target.cuePlaylist({
                      listType: "playlist",
                      list: youtubeSource.playlistId,
                      index: foundIdx
                    });
                    return;
                  }
                }
                inspectCurrentTrack(target);
                callbacksRef.current.onPlayerCued?.();
                return;
              }

              inspectCurrentTrack(target);

              // 0 = ENDED, 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING
              if (stateCode === 0) {
                if (isPlaylist) {
                  const list = typeof target.getPlaylist === "function" ? target.getPlaylist() : null;
                  const idx = typeof target.getPlaylistIndex === "function" ? target.getPlaylistIndex() : -1;
                  if (Array.isArray(list) && list.length > 0 && idx >= list.length - 1) {
                    console.info("[YouTubePlayer] Playlist finished at final item");
                    callbacksRef.current.onPlaylistEnded?.();
                  }
                } else {
                  callbacksRef.current.onVideoEnded?.();
                }
              } else if (stateCode === 1) {
                console.info("[YouTubePlayer] PLAYING event received");
                callbacksRef.current.onVideoPlaying?.();
              } else if (stateCode === 2 || stateCode === 3) {
                callbacksRef.current.onVideoPaused?.(stateCode);
              }
            }
          }
        });
      })
      .catch((err) => {
        if (!cancelled && generationRef.current === myGen) {
          console.error("[YouTubePlayer] Initialization failed:", err.message);
          callbacksRef.current.onPlayerError?.({
            code: "INIT_FAILED",
            reason: err.message
          });
        }
      });

    return () => {
      cancelled = true;
      generationRef.current++;
      if (playerInstanceRef) playerInstanceRef.current = null;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [sourceKey, playerInstanceRef]);

  if (!youtubeSource || !sourceKey) return null;

  return (
    <div className={isPlayingScreen ? "yt-pip-box" : "yt-lobby-preview"}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
