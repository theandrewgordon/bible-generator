import { useEffect, useRef, useState, useCallback } from "react";
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import {
  ALL_LIMBS,
  EXTRA_LANDMARKS,
  APPROACH_BEATS,
  SMOOTHING,
  getActiveLimbs,
  formatTime
} from "../constants/gameConfig";
import { THEMES } from "../constants/themes";
import { SoundEngine } from "../audio/SoundEngine";
import { MicBeatDetector } from "../audio/MicBeatDetector";
import { speakCoach } from "../audio/voiceCoach";
import { createGuidedChart, MOVE_CUES, moveForMode, moveTargets, replayTip } from "./guidedRoutine";
import { countPlaytestEvent } from "../storage/playtestStats";
import { playCoachCue } from "../audio/guidedVoice";
import { GameClock } from "./GameClock";
import { AdaptivePlayerTracker } from "./AdaptivePlayerTracker";
import { ChallengeScheduler } from "./ChallengeScheduler";
import { RoundLifecycleController } from "./RoundLifecycleController";
import { resolveTrackRhythm } from "../audio/syncState";
import {
  drawMirroredVideo,
  drawLaneDivider,
  drawLavaWave,
  drawLaserLine,
  drawPowerGate,
  drawTarget,
  drawCoachSilhouette
} from "./canvasRenderer";
import { recordHighScore, saveRoutine } from "../storage/routineStorage";
import { saveYouTubeBeatmap } from "../audio/BeatSyncEngine";

function createPlayerModel(id, name, accentColor) {
  return {
    id,
    name,
    accentColor,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    runEnergy: 0,
    isTurbo: false,
    prevMotionY: {},
    prevLandmarkPos: {},
    lastRecordedBeat: {},
    smoothedLandmarks: {},
    trailHistory: {},
    survivedChallenge: true
  };
}

function getMirroredTorsoCentroid(landmarks) {
  const nose = landmarks[0];
  const lShoulder = landmarks[12];
  const rShoulder = landmarks[11];
  if (lShoulder && rShoulder && lShoulder.visibility > 0.3 && rShoulder.visibility > 0.3) {
    return {
      cx: 1 - (lShoulder.x + rShoulder.x) * 0.5,
      cy: (lShoulder.y + rShoulder.y) * 0.5
    };
  }
  return {
    cx: nose ? 1 - nose.x : 0.5,
    cy: nose ? nose.y : 0.5
  };
}

export function useVolcanoEngine({
  videoRef,
  canvasRef,
  ytPlayerRef,
  ytReadyRef,
  settings,
  latencyMs,
  onBpmDetected,
  onRoutineSaved,
  onFallbackToBuiltinMusic
}) {
  const [aiReady, setAiReady] = useState(false);
  const [visionAttempt, setVisionAttempt] = useState(0);
  const [cameraPreview, setCameraPreview] = useState(false);
  const [framingStatus, setFramingStatus] = useState("OFF");
  const [resolvedBodyMode, setResolvedBodyMode] = useState("hands");
  const [effectivePlayersCount, setEffectivePlayersCount] = useState(1);
  const [recoveryError, setRecoveryError] = useState(null);
  const [screen, setScreen] = useState("lobby"); // "lobby" | "preparing_media" | "countdown" | "playing" | "podium"
  const [guidedCue, setGuidedCue] = useState(null);
  const [nextRoundTip, setNextRoundTip] = useState(null);
  const [countdownNumber, setCountdownNumber] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [banner, setBanner] = useState({ visible: false, text: "", gradient: "" });
  const [timerDisplay, setTimerDisplay] = useState(() => formatTime(settings.duration));
  const [missionProgress, setMissionProgress] = useState(0);
  const [isUrgentTime, setIsUrgentTime] = useState(false);
  const [currentTrackInfo, setCurrentTrackInfo] = useState(null);
  const [podiumResults, setPodiumResults] = useState([]);
  const [highScoreInfo, setHighScoreInfo] = useState({ best: 0, isNewRecord: false });
  const [micLearning, setMicLearning] = useState(false);
  const [micMode, setMicMode] = useState("tab");
  const [micLevel, setMicLevel] = useState(0);
  const [beatFlash, setBeatFlash] = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);
  const [hudPlayers, setHudPlayers] = useState([
    { score: 0, combo: 1, runEnergy: 0, isTurbo: false },
    { score: 0, combo: 1, runEnergy: 0, isTurbo: false }
  ]);

  const soundRef = useRef(null);
  if (!soundRef.current) soundRef.current = new SoundEngine();

  const micRef = useRef(null);
  if (!micRef.current) micRef.current = new MicBeatDetector();

  const lifecycleRef = useRef(null);
  if (!lifecycleRef.current) lifecycleRef.current = new RoundLifecycleController();

  const clockRef = useRef(null);
  if (!clockRef.current) {
    clockRef.current = new GameClock({
      getAudioTime: () => soundRef.current?.currentTime || 0,
      getYouTubeState: () => {
        const player = ytPlayerRef?.current;
        if (!player || !ytReadyRef?.current || typeof player.getCurrentTime !== "function") {
          return { ready: false, playing: false, time: 0 };
        }
        const state = typeof player.getPlayerState === "function" ? player.getPlayerState() : 1;
        return {
          ready: true,
          playing: state === 1,
          time: player.getCurrentTime()
        };
      }
    });
  }

  const playerTrackerRef = useRef(null);
  if (!playerTrackerRef.current) {
    playerTrackerRef.current = new AdaptivePlayerTracker({ hysteresisMs: 1500 });
  }

  const schedulerRef = useRef(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new ChallengeScheduler();
  }

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const latencySecRef = useRef(latencyMs / 1000);
  latencySecRef.current = latencyMs / 1000;

  const gameRef = useRef({
    poseLandmarker: null,
    lastVideoTime: -1,
    cameraReady: false,
    isPlaying: false,
    noPlayerSinceMs: null,
    playerReturnedSinceMs: null,
    remainingAtPause: 0,
    roundEndTime: 0,
    lastTickNow: null,
    lastCountdownSec: -1,
    currentBeatNum: 0,
    lastYtBeatIndex: -1,
    activeTrackRhythm: {
      rhythmTier: "free",
      bpm: 116,
      firstBeatSeconds: 0,
      hasPhaseLock: false
    },
    songsCompleted: 0,
    beatPulse: 0,
    lavaLevel: 0,
    gateCharge: 0,
    activeChallenge: null,
    liveMicBeatCount: 0,
    activePlayerIndices: [0],
    effectivePlayers: 1,
    identityAmbiguous: false,
    activeBodyMode: "hands",
    recordedEvents: [],
    targets: [],
    traces: [],
    particles: [],
    embers: [],
    floatingTexts: [],
    players: [
      createPlayerModel(0, "PLAYER 1", "#00f0ff"),
      createPlayerModel(1, "PLAYER 2", "#ff2a85")
    ]
  });

  useEffect(() => {
    if (screen === "lobby") {
      const isPlaylist = settings.youtubeSource?.type === "playlist";
      setTimerDisplay(isPlaylist ? "00:00" : formatTime(settings.duration));
      setMissionProgress(0);
      setIsUrgentTime(false);
    }
  }, [settings.duration, settings.youtubeSource?.type, screen]);

  useEffect(() => {
    let cancelled = false;
    let landmarker;
    const game = gameRef.current;
    const video = videoRef.current;
    const sound = soundRef.current;
    const mic = micRef.current;

    async function loadVision() {
      const vision = { wasmLoaderPath, wasmBinaryPath };
      const options = {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      };
      try {
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, options);
        } catch {
          if (cancelled) return;
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: "CPU" }
          });
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        game.poseLandmarker = landmarker;
        setAiReady(true);
      } catch {
        if (!cancelled) {
          setRecoveryError({
            kind: "vision",
            title: "Movement tracking couldn’t load",
            message: "Check your connection and try again."
          });
        }
      }
    }

    loadVision();
    return () => {
      cancelled = true;
      game.poseLandmarker?.close();
      game.poseLandmarker = null;
      video?.srcObject?.getTracks().forEach((track) => track.stop());
      sound?.stopLoop();
      mic?.stop();
    };
  }, [videoRef, visionAttempt]);

  const retryVision = useCallback(() => {
    setRecoveryError(null);
    setVisionAttempt((attempt) => attempt + 1);
  }, []);

  const syncHud = useCallback(() => {
    const [p0, p1] = gameRef.current.players;
    setHudPlayers([
      {
        score: p0.score,
        combo: Math.min(4, 1 + Math.floor(p0.combo / 5)),
        runEnergy: p0.runEnergy,
        isTurbo: p0.isTurbo
      },
      {
        score: p1.score,
        combo: Math.min(4, 1 + Math.floor(p1.combo / 5)),
        runEnergy: p1.runEnergy,
        isTurbo: p1.isTurbo
      }
    ]);
  }, []);

  const addScore = useCallback((playerIdx, points, x, y, text, color) => {
    const g = gameRef.current;
    const p = g.players[playerIdx];
    p.combo++;
    p.hits++;
    if (p.combo > p.maxCombo) p.maxCombo = p.combo;

    const streakMult = Math.min(4, 1 + Math.floor(p.combo / 5));
    const total = points * streakMult;
    p.score += total;

    const prefix = g.effectivePlayers === 2 ? `P${playerIdx + 1} ` : "";
    g.floatingTexts.push({
      x,
      y,
      text: `${prefix}${text} +${total}`,
      color,
      alpha: 1,
      vy: -2.2
    });
    syncHud();
  }, [syncHud]);

  const softenCombo = useCallback((playerIdx) => {
    const isPlaylist = settingsRef.current.youtubeSource?.type === "playlist";
    if (isPlaylist) return; // Continuous Dance never punishes misses
    const p = gameRef.current.players[playerIdx];
    const diff = settingsRef.current.difficulty || "normal";
    if (diff === "challenge") {
      p.combo = 0;
      syncHud();
    }
  }, [syncHud]);

  const getEffectiveBpm = useCallback(() => {
    if (settingsRef.current.audioSource === "youtube") {
      return gameRef.current.activeTrackRhythm?.bpm || settingsRef.current.bpm || 116;
    }
    return settingsRef.current.bpm || 128;
  }, []);

  const spawnTarget = useCallback((playerIdx, limbId, x, y) => {
    const limb = ALL_LIMBS.find((l) => l.id === limbId);
    if (!limb) return;
    const beatSec = 60 / getEffectiveBpm();
    const tick = clockRef.current.tick();
    const now = tick.trackNow;
    const isSplit = gameRef.current.effectivePlayers === 2;
    const isFreePlay =
      settingsRef.current.audioSource === "youtube" &&
      gameRef.current.activeTrackRhythm?.rhythmTier !== "matched";
    const diffPad =
      isFreePlay || settingsRef.current.difficulty === "easy"
        ? 14
        : settingsRef.current.difficulty === "challenge"
          ? -4
          : 0;

    gameRef.current.targets.push({
      playerIdx,
      limbId: limb.id,
      label: limb.label,
      color: limb.color,
      x,
      y,
      radius: (isSplit ? 42 : 48) + diffPad,
      spawnTime: now,
      hitTime: now + APPROACH_BEATS * beatSec,
      expireTime: now + (APPROACH_BEATS + (isFreePlay ? 2.1 : 1.65)) * beatSec
    });
  }, [getEffectiveBpm]);

  const spawnRandomTargetForPlayer = useCallback((playerIdx) => {
    const bodyMode = gameRef.current.activeBodyMode;
    const isSplit = gameRef.current.effectivePlayers === 2;
    const pool = getActiveLimbs(bodyMode);
    const limb = pool[Math.floor(Math.random() * pool.length)];
    const isLeftLimb = limb.id.startsWith("left");
    const zoneY = bodyMode === "hands" ? limb.zoneYHands : limb.zoneYFull;
    const y = zoneY[0] + Math.random() * (zoneY[1] - zoneY[0]);

    let x;
    if (!isSplit) {
      x = isLeftLimb ? 0.16 + Math.random() * 0.32 : 0.52 + Math.random() * 0.32;
    } else {
      const laneMin = playerIdx === 0 ? 0.07 : 0.56;
      const laneWidth = 0.37;
      x = isLeftLimb
        ? laneMin + Math.random() * (laneWidth * 0.48)
        : laneMin + laneWidth * 0.52 + Math.random() * (laneWidth * 0.48);
    }
    spawnTarget(playerIdx, limb.id, x, y);
  }, [spawnTarget]);

  const spawnChoreoStep = useCallback((playerIdx, beatNum) => {
    const bodyMode = gameRef.current.activeBodyMode;
    const isSplit = gameRef.current.effectivePlayers === 2;
    const step = Math.floor(beatNum / 2) % 8;
    const laneMin = !isSplit ? 0.14 : playerIdx === 0 ? 0.06 : 0.54;
    const laneSpan = !isSplit ? 0.72 : 0.40;

    const patterns = [
      [{ limb: "left_hand", rx: 0.25, y: 0.42 }],
      [{ limb: "right_hand", rx: 0.75, y: 0.42 }],
      [{ limb: "left_hand", rx: 0.20, y: 0.28 }],
      [{ limb: "right_hand", rx: 0.80, y: 0.28 }],
      [
        { limb: "left_hand", rx: 0.24, y: 0.18 },
        { limb: "right_hand", rx: 0.76, y: 0.18 }
      ],
      [{ limb: "left_hand", rx: 0.35, y: 0.24 }],
      [
        bodyMode === "full"
          ? { limb: "left_foot", rx: 0.28, y: 0.74 }
          : { limb: "left_hand", rx: 0.22, y: 0.55 }
      ],
      [
        bodyMode === "full"
          ? { limb: "right_foot", rx: 0.72, y: 0.74 }
          : { limb: "right_hand", rx: 0.78, y: 0.55 }
      ]
    ];

    for (const move of patterns[step]) {
      spawnTarget(playerIdx, move.limb, laneMin + move.rx * laneSpan, move.y);
    }
  }, [spawnTarget]);

  const spawnTracePattern = useCallback((playerIdx, shapeIdx = null) => {
    const isSplit = gameRef.current.effectivePlayers === 2;
    const beatSec = 60 / getEffectiveBpm();
    const now = clockRef.current.tick().trackNow;
    const laneMin = !isSplit ? 0.16 : playerIdx === 0 ? 0.06 : 0.54;
    const laneW = !isSplit ? 0.68 : 0.40;

    const shapes = [
      {
        name: "PRAISE ARC",
        limbId: "right_hand",
        pts: [
          { rx: 0.15, y: 0.56 },
          { rx: 0.30, y: 0.32 },
          { rx: 0.50, y: 0.22 },
          { rx: 0.70, y: 0.32 },
          { rx: 0.85, y: 0.56 }
        ]
      },
      {
        name: "LEFT SWEEP",
        limbId: "left_hand",
        pts: [
          { rx: 0.85, y: 0.56 },
          { rx: 0.70, y: 0.32 },
          { rx: 0.50, y: 0.22 },
          { rx: 0.30, y: 0.32 },
          { rx: 0.15, y: 0.56 }
        ]
      },
      {
        name: "HALO CIRCLE",
        limbId: "right_hand",
        pts: [
          { rx: 0.50, y: 0.20 },
          { rx: 0.76, y: 0.34 },
          { rx: 0.50, y: 0.52 },
          { rx: 0.24, y: 0.34 },
          { rx: 0.50, y: 0.20 }
        ]
      },
      {
        name: "LIGHTNING ZIG",
        limbId: "left_hand",
        pts: [
          { rx: 0.22, y: 0.24 },
          { rx: 0.74, y: 0.36 },
          { rx: 0.26, y: 0.48 },
          { rx: 0.78, y: 0.60 }
        ]
      }
    ];

    const chosen = shapes[(shapeIdx !== null ? shapeIdx : Math.floor(Math.random() * shapes.length)) % shapes.length];
    const limb = ALL_LIMBS.find((l) => l.id === chosen.limbId);

    gameRef.current.traces.push({
      playerIdx,
      limbId: limb.id,
      label: `${limb.label} • ${chosen.name}`,
      color: limb.color,
      points: chosen.pts.map((p) => ({ x: laneMin + p.rx * laneW, y: p.y })),
      completedIdx: 0,
      spawnTime: now,
      endTime: now + 4.5 * beatSec
    });
  }, [getEffectiveBpm]);

  const triggerChallenge = useCallback((type, beatNum, announce = true) => {
    const g = gameRef.current;
    const { audioSource, themeId, voiceCoach } = settingsRef.current;
    const bodyMode = g.activeBodyMode;
    const theme = THEMES[themeId] || THEMES.volcano;
    const beatSec = 60 / getEffectiveBpm();
    const playSfx = audioSource === "synth" || audioSource === "mp3";
    const now = clockRef.current.tick().trackNow;
    const activeIndices = g.activePlayerIndices;

    g.players.forEach((p) => (p.survivedChallenge = true));
    g.gateCharge = 0;

    if (type === "LAVA") {
      g.activeChallenge = {
        type: "LAVA",
        startBeat: beatNum,
        endBeat: beatNum + 7,
        graceUntil: now + beatSec * 1.5
      };
      setBanner({
        visible: true,
        text: bodyMode === "hands" ? theme.floorBannerHands : theme.floorBannerFull,
        gradient: "linear-gradient(90deg, #ea580c, #dc2626)"
      });
      speakCoach(theme.floorVoice, voiceCoach);
      if (playSfx && !theme.isChoreoMode) soundRef.current.playLavaRumble();
    } else if (type === "DUCK") {
      g.activeChallenge = { type: "DUCK", startBeat: beatNum, endBeat: beatNum + 6 };
      setBanner({
        visible: true,
        text: theme.overheadBanner,
        gradient: "linear-gradient(90deg, #dc2626, #991b1b)"
      });
      speakCoach(theme.overheadVoice, voiceCoach && announce);
      if (playSfx && !theme.isChoreoMode) soundRef.current.playLaserSweep();
    } else if (type === "FREEZE") {
      g.targets = [];
      g.activeChallenge = {
        type: "FREEZE",
        startBeat: beatNum,
        endBeat: beatNum + 6,
        graceUntil: now + beatSec * 1.35
      };
      setBanner({
        visible: true,
        text: theme.freezeBanner,
        gradient: "linear-gradient(90deg, #0891b2, #0284c7)"
      });
      speakCoach(theme.freezeVoice, voiceCoach && announce);
      soundRef.current.playFreezeBell();
    } else if (type === "GATE") {
      g.targets = [];
      g.activeChallenge = {
        type: "GATE",
        startBeat: beatNum,
        endBeat: beatNum + 7,
        completed: false
      };
      setBanner({
        visible: true,
        text: theme.gateBanner,
        gradient: "linear-gradient(90deg, #ca8a04, #16a34a)"
      });
      speakCoach(theme.gateVoice, voiceCoach);
      soundRef.current.playGateChord();
    } else if (type === "JUMP") {
      g.activeChallenge = { type: "JUMP", startBeat: beatNum, endBeat: beatNum + 6 };
      setBanner({
        visible: true,
        text: theme.celebrationBanner,
        gradient: "linear-gradient(90deg, #0284c7, #2563eb)"
      });
      speakCoach(theme.celebrationVoice, voiceCoach);
      soundRef.current.playHitChime(true, 1.25);
      if (g.effectivePlayers === 1) {
        const pIdx = activeIndices[0] ?? 0;
        spawnTarget(pIdx, "left_hand", 0.32, 0.15);
        spawnTarget(pIdx, "right_hand", 0.68, 0.15);
      } else {
        spawnTarget(0, "left_hand", 0.14, 0.15);
        spawnTarget(0, "right_hand", 0.36, 0.15);
        spawnTarget(1, "left_hand", 0.64, 0.15);
        spawnTarget(1, "right_hand", 0.86, 0.15);
      }
    }
  }, [getEffectiveBpm, spawnTarget]);

  const recordSpecialCue = useCallback((cueType) => {
    const g = gameRef.current;
    if (!g.isPlaying || !settingsRef.current.isRecording) return;
    const beatNum = g.currentBeatNum;
    if (cueType === "TRACE") {
      const shapeIdx = g.recordedEvents.filter((e) => e.kind === "trace").length;
      g.recordedEvents.push({ beat: beatNum, kind: "trace", shapeIdx });
      setRecordedCount(g.recordedEvents.length);
      spawnTracePattern(0, shapeIdx);
      return;
    }
    g.recordedEvents.push({ beat: beatNum, kind: "challenge", challengeType: cueType });
    setRecordedCount(g.recordedEvents.length);
    triggerChallenge(cueType, beatNum);
  }, [spawnTracePattern, triggerChallenge]);

  const handleVisualBeat = useCallback((beatNum) => {
    const g = gameRef.current;
    const canvas = canvasRef.current;
    if (!g.isPlaying || clockRef.current.isPaused || !canvas) return;

    g.currentBeatNum = beatNum;
    g.beatPulse = 1.0;
    const { themeId, isRecording, activeRoutine } = settingsRef.current;
    const theme = THEMES[themeId] || THEMES.volcano;
    const activeIndices = g.activePlayerIndices;
    const isSplit = g.effectivePlayers === 2;

    if (g.activeChallenge && beatNum >= g.activeChallenge.endBeat) {
      const cType = g.activeChallenge.type;
      if (!isRecording && (cType === "DUCK" || cType === "LAVA" || cType === "FREEZE")) {
        const pts = cType === "LAVA" ? 60 : 50;
        const label =
          cType === "LAVA"
            ? theme.floorWinText
            : cType === "FREEZE"
              ? theme.freezeWinText
              : theme.overheadWinText;
        for (const pIdx of activeIndices) {
          if (g.players[pIdx].survivedChallenge) {
            const zoneCenterX = !isSplit ? 0.5 : pIdx === 0 ? 0.25 : 0.75;
            addScore(pIdx, pts, canvas.width * zoneCenterX, canvas.height * 0.35, label, "#fde047");
            soundRef.current.playHitChime(true, pIdx === 0 ? 1.0 : 1.12);
          }
        }
      }
      g.activeChallenge = null;
      setBanner((b) => ({ ...b, visible: false }));
    }

    if (isRecording) return;

    if (g.guidedChart) {
      const cueSettings = settingsRef.current;
      const at = (beat) => moveForMode(g.guidedChart[beat], cueSettings.gameMode, cueSettings.difficulty);
      const preview = at(beatNum + 4);
      const reach = at(beatNum + APPROACH_BEATS);
      const current = at(beatNum);
      if (preview) {
        setGuidedCue({ ...MOVE_CUES[preview], next: true });
        if (cueSettings.voiceCoach) playCoachCue(MOVE_CUES[preview].text);
      } else if (current) {
        setGuidedCue({ ...MOVE_CUES[current], next: false });
      } else if (at(beatNum - 2)) {
        setGuidedCue(null);
      }

      for (const [limbId, x, y] of moveTargets(reach)) {
        for (const pIdx of activeIndices) {
          const laneX = isSplit ? (pIdx === 0 ? 0.06 : 0.54) + x * 0.40 : x;
          spawnTarget(pIdx, limbId, laneX, y);
        }
      }
      if (current === "duck" || current === "freeze") {
        triggerChallenge(current === "duck" ? "DUCK" : "FREEZE", beatNum, false);
      }
      return;
    }

    if (activeRoutine && Array.isArray(activeRoutine.events)) {
      const dueEvents = activeRoutine.events.filter((ev) => ev.beat === beatNum);
      for (const ev of dueEvents) {
        if (ev.kind === "challenge") {
          if (settingsRef.current.gameMode === "seated" && ev.challengeType !== "FREEZE") continue;
          triggerChallenge(ev.challengeType, beatNum);
        } else if (ev.kind === "trace") {
          for (const pIdx of activeIndices) {
            spawnTracePattern(pIdx, ev.shapeIdx ?? 0);
          }
        } else if (ev.kind === "target") {
          if (settingsRef.current.gameMode === "seated" && ev.limbId?.endsWith("_foot")) continue;
          if (!isSplit) {
            spawnTarget(activeIndices[0] ?? 0, ev.limbId, ev.x, ev.y);
          } else {
            spawnTarget(0, ev.limbId, 0.06 + ev.x * 0.40, ev.y);
            spawnTarget(1, ev.limbId, 0.54 + ev.x * 0.40, ev.y);
          }
        }
      }
      return;
    }

    const isPlaylist = settingsRef.current.youtubeSource?.type === "playlist";
    const action = schedulerRef.current.evaluateBeat({
      beatNum,
      hasActiveChallenge: Boolean(g.activeChallenge),
      hasActiveTraces: g.traces.length > 0,
      difficulty: isPlaylist ? "easy" : settingsRef.current.difficulty || "normal"
    });

    if (action.type === "CHALLENGE") {
      if (settingsRef.current.gameMode !== "seated" || action.challengeType === "FREEZE") {
        triggerChallenge(action.challengeType, beatNum);
      }
      return;
    }

    if (action.type === "TRACE") {
      for (const pIdx of activeIndices) {
        spawnTracePattern(pIdx, action.shapeIdx + pIdx);
      }
      return;
    }

    if (action.type === "REACH") {
      const intensities = settingsRef.current.phraseIntensity;
      const phraseIdx = Math.floor(beatNum / 8);
      const sectionEnergy = Array.isArray(intensities) && intensities[phraseIdx] !== undefined
        ? intensities[phraseIdx]
        : 0.65;

      if (sectionEnergy < 0.35) {
        if (beatNum % 4 === 0) {
          for (const pIdx of activeIndices) {
            const laneX = !isSplit ? 0.32 : pIdx === 0 ? 0.22 : 0.72;
            spawnTarget(pIdx, "left_hand", laneX, 0.38);
          }
        }
        return;
      }

      if (theme.isChoreoMode) {
        for (const pIdx of activeIndices) {
          spawnChoreoStep(pIdx, beatNum);
        }
      } else if (!isSplit) {
        const pIdx = activeIndices[0] ?? 0;
        if (g.targets.length < 3) spawnRandomTargetForPlayer(pIdx);
      } else {
        const p0Count = g.targets.filter((t) => t.playerIdx === 0).length;
        const p1Count = g.targets.filter((t) => t.playerIdx === 1).length;
        if (beatNum % 4 === 0) {
          if (p0Count < 2) spawnRandomTargetForPlayer(0);
          if (p1Count < 2) spawnRandomTargetForPlayer(1);
        } else {
          const targetPlayer = (beatNum / 2) % 2;
          if ((targetPlayer === 0 ? p0Count : p1Count) < 2) {
            spawnRandomTargetForPlayer(targetPlayer);
          }
        }
      }
    }
  }, [addScore, canvasRef, spawnChoreoStep, spawnRandomTargetForPlayer, spawnTarget, spawnTracePattern, triggerChallenge]);

  const startLoopWithCurrentSettings = useCallback((firstBeat = 0) => {
    const { trackId, audioSource } = settingsRef.current;
    const bpm = getEffectiveBpm();
    const muteSynthDrums = audioSource === "youtube" || audioSource === "mic";
    soundRef.current.startLoop({
      bpm,
      trackId,
      muteSynthDrums,
      latencyOffsetSec: latencySecRef.current,
      firstBeat,
      useCustomAudio: audioSource === "mp3",
      onVisualBeat: (beatNum) => {
        if (settingsRef.current.audioSource !== "mic") {
          handleVisualBeat(beatNum);
        }
      }
    });
  }, [getEffectiveBpm, handleVisualBeat]);

  const pauseGame = useCallback((reason = "user") => {
    const g = gameRef.current;
    if (!g.isPlaying) return;
    if (!lifecycleRef.current.requestPause(reason)) return;
    if (reason === "tracking") {
      g.trackingPauses++;
      countPlaytestEvent("tracking_pauses");
    }

    const pausedAt = clockRef.current.pause();
    g.remainingAtPause = Math.max(0, g.roundEndTime - pausedAt);
    soundRef.current.stopLoop();
    setCountdownNumber(null);

    if (
      settingsRef.current.audioSource === "youtube" &&
      reason !== "media" &&
      ytPlayerRef?.current?.pauseVideo
    ) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {
        // Ignore
      }
    }

    setIsPaused(true);
    setScreen("playing");
    setBanner({
      visible: true,
      text:
        reason === "tracking"
          ? "👋 STEP INTO THE PICTURE!"
          : reason === "media"
            ? "⏳ MUSIC PAUSED..."
            : "⏸ PAUSED",
      gradient: "linear-gradient(90deg, #475569, #334155)"
    });
  }, [ytPlayerRef]);

  const resumeGame = useCallback((source = "user") => {
    const g = gameRef.current;
    if (!g.isPlaying || !clockRef.current.isPaused) return;

    if (settingsRef.current.audioSource === "youtube" && source === "user") {
      lifecycleRef.current.pauseReason = "media";
      setBanner({
        visible: true,
        text: "⏳ RESUMING MUSIC...",
        gradient: "linear-gradient(90deg, #0284c7, #0369a1)"
      });
      if (ytPlayerRef?.current?.playVideo) {
        try {
          ytPlayerRef.current.playVideo();
        } catch {
          // User can tap video box directly if needed
        }
      }
      return;
    }

    if (source === "user" && !lifecycleRef.current.requestUserResume()) return;

    const pausedDuration = clockRef.current.resume();
    const tick = clockRef.current.tick();
    const now = tick.trackNow;

    if (settingsRef.current.audioSource !== "youtube") {
      g.targets.forEach((t) => {
        t.spawnTime += pausedDuration;
        t.hitTime += pausedDuration;
        t.expireTime += pausedDuration;
      });
      g.traces.forEach((tr) => {
        tr.spawnTime += pausedDuration;
        tr.endTime += pausedDuration;
      });
      if (g.activeChallenge?.graceUntil) {
        g.activeChallenge.graceUntil += pausedDuration;
      }
    }

    g.roundEndTime = now + g.remainingAtPause;
    setIsPaused(false);
    setBanner((b) => ({ ...b, visible: false }));
    if (settingsRef.current.audioSource !== "youtube") {
      startLoopWithCurrentSettings(g.guidedChart ? g.currentBeatNum + 1 : 0);
    }
  }, [startLoopWithCurrentSettings, ytPlayerRef]);

  const runCancellableCountdown = useCallback(async (onComplete) => {
    const token = lifecycleRef.current.beginCountdown();
    setScreen("countdown");

    for (const step of [3, 2, 1]) {
      if (!lifecycleRef.current.isTokenValid(token)) {
        setCountdownNumber(null);
        return false;
      }
      setCountdownNumber(step);
      soundRef.current.playCountdownTick(false);
      await new Promise((r) => setTimeout(r, 700));
    }

    if (!lifecycleRef.current.isTokenValid(token)) {
      setCountdownNumber(null);
      return false;
    }

    setCountdownNumber("GO!");
    soundRef.current.playCountdownTick(true);
    await new Promise((r) => setTimeout(r, 400));

    if (!lifecycleRef.current.isTokenValid(token)) {
      setCountdownNumber(null);
      return false;
    }

    setCountdownNumber(null);
    onComplete();
    return true;
  }, []);

  /**
   * Called whenever YouTube advances to a new song inside a playlist (or loads initial song).
   * Clears previous song targets/challenges, resolves per-track rhythm, and preserves Session Time & Scores.
   */
  const handleYouTubeTrackChanged = useCallback((trackMeta) => {
    const g = gameRef.current;
    const rhythm = resolveTrackRhythm(trackMeta?.videoId);
    g.activeTrackRhythm = rhythm;
    setCurrentTrackInfo(trackMeta);

    if (g.isPlaying) {
      g.songsCompleted++;
      g.targets = [];
      g.traces = [];
      g.activeChallenge = null;
      g.lavaLevel = 0;
      g.gateCharge = 0;
      g.lastYtBeatIndex = -1;
      g.lastTickNow = null;
      clockRef.current.resetTrack(0);
      schedulerRef.current.reset();

      if (trackMeta?.title) {
        setBanner({
          visible: true,
          text: `🎵 NEXT SONG: ${trackMeta.title.toUpperCase()}`,
          gradient: "linear-gradient(90deg, #0284c7, #2563eb)"
        });
        setTimeout(() => {
          setBanner((b) => (b.text.startsWith("🎵 NEXT SONG:") ? { ...b, visible: false } : b));
        }, 2800);
      }
    }
  }, []);

  const skipPlaylistSong = useCallback(() => {
    if (ytPlayerRef?.current?.nextVideo) {
      try {
        ytPlayerRef.current.nextVideo();
      } catch {
        // Ignore
      }
    }
  }, [ytPlayerRef]);

  const beginRound = useCallback((overrideSettings = null) => {
    const g = gameRef.current;
    if (overrideSettings) {
      settingsRef.current = { ...settingsRef.current, ...overrideSettings };
    }
    const { duration, isRecording, themeId, voiceCoach, audioSource, numPlayers } = settingsRef.current;
    const theme = THEMES[themeId] || THEMES.volcano;

    lifecycleRef.current.startPlaying();
    clockRef.current.reset(audioSource === "youtube" ? "youtube" : "audio");
    playerTrackerRef.current.reset(numPlayers, performance.now());
    schedulerRef.current.reset();

    g.targets = [];
    g.traces = [];
    g.particles = [];
    g.floatingTexts = [];
    g.recordedEvents = [];
    g.activeChallenge = null;
    g.noPlayerSinceMs = null;
    g.playerReturnedSinceMs = null;
    g.lavaLevel = 0;
    g.gateCharge = 0;
    g.songsCompleted = 0;
    g.lastCountdownSec = -1;
    g.liveMicBeatCount = 0;
    g.currentBeatNum = -1;
    g.guidedChart = createGuidedChart(settingsRef.current);
    g.trackingPauses = 0;
    g.misses = 0;
    setGuidedCue(null);
    setNextRoundTip(null);
    if (!isRecording) countPlaytestEvent("rounds_started");
    g.lastYtBeatIndex = -1;
    g.lastTickNow = null;

    g.players.forEach((p) => {
      p.score = 0;
      p.combo = 0;
      p.maxCombo = 0;
      p.hits = 0;
      p.runEnergy = 0;
      p.isTurbo = false;
      p.prevMotionY = {};
      p.prevLandmarkPos = {};
      p.lastRecordedBeat = {};
      p.trailHistory = {};
      p.survivedChallenge = true;
    });

    syncHud();
    setRecordedCount(0);
    setMissionProgress(0);
    setIsPaused(false);
    setBanner(
      isRecording
        ? {
            visible: true,
            text: "⏺ RECORDING ROUTINE — PUNCH & KICK ON THE BEAT!",
            gradient: "linear-gradient(90deg, #dc2626, #991b1b)"
          }
        : { visible: false, text: "", gradient: "" }
    );
    setIsUrgentTime(false);
    const isPlaylist = settingsRef.current.youtubeSource?.type === "playlist";
    setTimerDisplay(isPlaylist ? "00:00" : formatTime(duration));
    setScreen("playing");

    if (!isRecording) speakCoach(`Let's dance! ${theme.subtitle}`, voiceCoach);

    if (audioSource !== "youtube") {
      startLoopWithCurrentSettings();
      g.roundEndTime = clockRef.current.tick().trackNow + 0.25 + duration;
    } else {
      if (ytPlayerRef?.current?.playVideo) {
        try {
          ytPlayerRef.current.playVideo();
        } catch {
          // Ignore
        }
      }
      const startTick = clockRef.current.tick();
      g.roundEndTime = startTick.trackNow + duration;
    }
    g.isPlaying = true;
  }, [startLoopWithCurrentSettings, syncHud, ytPlayerRef]);

  const handleYouTubePlaying = useCallback(() => {
    const decision = lifecycleRef.current.handleExternalMediaPlaying();
    if (decision.action === "START_COUNTDOWN") {
      runCancellableCountdown(() => beginRound());
    } else if (decision.action === "RESUME_MEDIA") {
      resumeGame("media");
    }
  }, [beginRound, resumeGame, runCancellableCountdown]);

  const handleYouTubePaused = useCallback(() => {
    const decision = lifecycleRef.current.handleExternalMediaPaused();
    if (decision.action === "PAUSE_MEDIA") {
      pauseGame("media");
    }
  }, [pauseGame]);

  const recoverWithBuiltinMusic = useCallback(() => {
    const { shouldRestartRound } = lifecycleRef.current.recoverToBuiltinMusic();
    const builtinPatch = {
      audioSource: "synth",
      trackId: "volcano-dash",
      bpm: 128,
      youtubeSource: null,
      hasPhaseLock: true,
      hasTempoEstimate: true,
      syncConfidence: 100
    };
    settingsRef.current = { ...settingsRef.current, ...builtinPatch };
    onFallbackToBuiltinMusic?.();
    setRecoveryError(null);
    setCountdownNumber(null);

    if (shouldRestartRound) {
      beginRound(builtinPatch);
    } else {
      setScreen("lobby");
    }
  }, [beginRound, onFallbackToBuiltinMusic]);

  const syncBeatOne = useCallback(() => {
    const g = gameRef.current;
    if (!g.isPlaying) return;
    g.targets = [];
    g.traces = [];
    g.beatPulse = 1.0;

    if (settingsRef.current.audioSource === "youtube" && ytPlayerRef?.current?.getCurrentTime) {
      const ytSec = ytPlayerRef.current.getCurrentTime();
      const bpm = getEffectiveBpm();
      const beatSec = 60 / bpm;
      const phaseOffset = Number((ytSec % beatSec).toFixed(3));
      g.lastYtBeatIndex = Math.floor((ytSec - phaseOffset) / beatSec);
      const vid = currentTrackInfo?.videoId || settingsRef.current.youtubeSource?.videoId;
      if (vid) {
        saveYouTubeBeatmap(vid, {
          bpm,
          firstBeatSeconds: phaseOffset,
          confidence: 92
        });
        g.activeTrackRhythm = resolveTrackRhythm(vid);
      }
      if (onBpmDetected) {
        onBpmDetected({
          bpm,
          firstBeatSeconds: phaseOffset,
          confidence: 92,
          hasPhaseLock: true
        });
      }
    } else {
      startLoopWithCurrentSettings();
    }

    const canvas = canvasRef.current;
    if (canvas) {
      g.floatingTexts.push({
        x: canvas.width * 0.5,
        y: canvas.height * 0.25,
        text: "🎯 BEAT ALIGNED!",
        color: "#00f0ff",
        alpha: 1,
        vy: -1.5
      });
    }
  }, [canvasRef, currentTrackInfo?.videoId, getEffectiveBpm, onBpmDetected, startLoopWithCurrentSettings, ytPlayerRef]);

  const stopAudioLearner = useCallback(() => {
    micRef.current.stop();
    setMicLearning(false);
    setMicLevel(0);
    setBeatFlash(false);
  }, []);

  const startAudioLearner = useCallback(async (mode = "tab") => {
    try {
      await micRef.current.start({
        mode,
        onLevel: (lvl) => setMicLevel(lvl),
        onBpmLearned: (detectedBpm) => {
          if (onBpmDetected) onBpmDetected(detectedBpm);
        },
        onBeat: () => {
          setBeatFlash(true);
          setTimeout(() => setBeatFlash(false), 110);
          if (
            gameRef.current.isPlaying &&
            !clockRef.current.isPaused &&
            settingsRef.current.audioSource === "mic"
          ) {
            gameRef.current.liveMicBeatCount++;
            handleVisualBeat(gameRef.current.liveMicBeatCount);
          }
        }
      });
      setMicMode(mode);
      setMicLearning(true);
    } catch (err) {
      setRecoveryError({
        title: "Audio Listener Unavailable",
        message: `Could not capture ${mode} audio (${err.message}). Play with Built-In Music instead!`
      });
    }
  }, [onBpmDetected, handleVisualBeat]);

  const finishRound = useCallback(() => {
    const g = gameRef.current;
    if (!g.isPlaying) return;
    g.isPlaying = false;
    g.targets = [];
    g.traces = [];
    g.particles = [];
    g.floatingTexts = [];
    g.activeChallenge = null;
    g.lavaLevel = 0;
    lifecycleRef.current.resetToLobby(settingsRef.current.audioSource);
    soundRef.current.stopLoop();
    soundRef.current.playVictoryFanfare();

    if (settingsRef.current.audioSource === "youtube" && ytPlayerRef?.current?.pauseVideo) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {
        // Ignore
      }
    }

    setIsPaused(false);
    setBanner((b) => ({ ...b, visible: false }));
    setIsUrgentTime(false);
    setMissionProgress(100);
    if (!settingsRef.current.isRecording) {
      countPlaytestEvent("rounds_finished");
      setNextRoundTip(replayTip({
        misses: g.misses,
        trackingPauses: g.trackingPauses,
        difficulty: settingsRef.current.difficulty,
        gameMode: settingsRef.current.gameMode
      }));
    }

    if (settingsRef.current.isRecording) {
      const s = settingsRef.current;
      const newRoutine = {
        id: `routine_${Date.now()}`,
        name: s.routineName?.trim() || `Custom Routine (${s.bpm} BPM)`,
        bpm: s.bpm,
        themeId: s.themeId,
        gameMode: g.activeBodyMode,
        youtubeUrl: s.youtubeUrl || "",
        events: g.recordedEvents
      };
      const updatedList = saveRoutine(newRoutine);
      onRoutineSaved?.(updatedList, newRoutine);
      setScreen("lobby");
      return;
    }

    const activePlayers = g.players
      .slice(0, g.effectivePlayers)
      .map((p) => ({
        id: p.id,
        name: p.name,
        accentColor: p.accentColor,
        score: p.score,
        hits: p.hits,
        maxCombo: p.maxCombo
      }));

    const topScore = Math.max(...activePlayers.map((p) => p.score));
    if (!settingsRef.current.practice) setHighScoreInfo(recordHighScore(settingsRef.current, topScore));
    setPodiumResults(activePlayers);
    setScreen("podium");
  }, [onRoutineSaved, ytPlayerRef]);

  const enableCameraPreview = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setRecoveryError({
          kind: "camera",
          title: "Camera Not Supported",
          message: "Open BodyBeat over HTTPS in Safari or Chrome to allow camera access."
        });
        return false;
      }
      if (!gameRef.current.cameraReady) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        const video = videoRef.current;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        if (video.readyState < 2) {
          await new Promise((res) => video.addEventListener("loadeddata", res, { once: true }));
        }
        gameRef.current.cameraReady = true;
      }
      setCameraPreview(true);
      setRecoveryError(null);
      return true;
    } catch (err) {
      setRecoveryError({
        kind: "camera",
        title: "Camera Permission Needed",
        message: `Please allow camera access in your browser settings to play (${err.message}).`
      });
      return false;
    }
  }, [videoRef]);

  const startingRef = useRef(false);
  const startGame = useCallback(async (overrides) => {
    if (lifecycleRef.current.phase !== "lobby" || startingRef.current) return;
    startingRef.current = true;
    if (overrides) settingsRef.current = { ...settingsRef.current, ...overrides };
    try {
      setRecoveryError(null);
      await soundRef.current.ensureContext();

      if (settingsRef.current.audioSource === "mic" && !micRef.current.isListening) {
        await micRef.current.start({
          mode: "mic",
          onLevel: (lvl) => setMicLevel(lvl),
          onBpmLearned: (detectedBpm) => {
            if (onBpmDetected) onBpmDetected(detectedBpm);
          },
          onBeat: () => {
            if (
              gameRef.current.isPlaying &&
              !clockRef.current.isPaused &&
              settingsRef.current.audioSource === "mic"
            ) {
              gameRef.current.liveMicBeatCount++;
              handleVisualBeat(gameRef.current.liveMicBeatCount);
            }
          }
        });
        setMicMode("mic");
        setMicLearning(true);
      }

      if ("wakeLock" in navigator) {
        try {
          await navigator.wakeLock.request("screen");
        } catch {
          // Ignore
        }
      }

      const camOk = await enableCameraPreview();
      if (!camOk) {
        countPlaytestEvent("camera_errors");
        return;
      }
      countPlaytestEvent("camera_ready");

      const prep = lifecycleRef.current.beginPreparingMedia(settingsRef.current.audioSource);
      if (prep.phase === "preparing_media") {
        if (!settingsRef.current.youtubeSource) {
          recoverWithBuiltinMusic();
          return;
        }
        setScreen("preparing_media");
        if (ytReadyRef?.current && ytPlayerRef?.current?.playVideo) {
          try {
            ytPlayerRef.current.playVideo();
            if (ytPlayerRef.current.getPlayerState?.() === 1) {
              handleYouTubePlaying();
            }
          } catch {
            // Stay in preparing_media where user can tap PLAY MUSIC or Built-In Music
          }
        }
        return;
      }

      await runCancellableCountdown(() => beginRound());
    } catch (err) {
      console.error("Start game failed:", err);
      lifecycleRef.current.resetToLobby(settingsRef.current.audioSource);
      setScreen("lobby");
      setCountdownNumber(null);
      setRecoveryError({
        title: "Could Not Start Dance",
        message: "Try again with Built-in Music."
      });
    } finally {
      startingRef.current = false;
    }
  }, [
    beginRound,
    enableCameraPreview,
    handleVisualBeat,
    handleYouTubePlaying,
    onBpmDetected,
    recoverWithBuiltinMusic,
    runCancellableCountdown,
    ytPlayerRef,
    ytReadyRef
  ]);

  const quitToLobby = useCallback(() => {
    const g = gameRef.current;
    g.isPlaying = false;
    g.targets = [];
    g.traces = [];
    g.particles = [];
    g.floatingTexts = [];
    g.activeChallenge = null;
    lifecycleRef.current.resetToLobby(settingsRef.current.audioSource);
    soundRef.current.stopLoop();
    if (settingsRef.current.audioSource === "youtube" && ytPlayerRef?.current?.pauseVideo) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {
        // Ignore
      }
    }
    setIsPaused(false);
    setCountdownNumber(null);
    setBanner((b) => ({ ...b, visible: false }));
    setScreen("lobby");
  }, [ytPlayerRef]);

  // Main 60 FPS Render & Tracking Loop
  useEffect(() => {
    let rafId;
    let frameCounter = 0;

    const renderLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const g = gameRef.current;

      if (video && canvas && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        const { numPlayers, gameMode, themeId, isRecording, duration, audioSource, youtubeSource } =
          settingsRef.current;
        const isContinuousPlaylist = youtubeSource?.type === "playlist";
        const theme = THEMES[themeId] || THEMES.volcano;
        const isFrozen = g.activeChallenge?.type === "FREEZE";
        const paused = clockRef.current.isPaused;

        const tick = clockRef.current.tick();
        const now = tick.trackNow;
        const dtSource = g.lastTickNow !== null ? Math.max(0, now - g.lastTickNow) : 0;
        g.lastTickNow = now;

        const isOverlapFrozen = Boolean(g.isPlaying && !paused && g.effectivePlayers === 2 && g.identityAmbiguous);

        if (isOverlapFrozen && dtSource > 0) {
          g.roundEndTime += dtSource;
          g.targets.forEach((t) => {
            t.spawnTime += dtSource;
            t.hitTime += dtSource;
            t.expireTime += dtSource;
          });
          g.traces.forEach((tr) => {
            tr.spawnTime += dtSource;
            tr.endTime += dtSource;
          });
          if (g.activeChallenge?.graceUntil) {
            g.activeChallenge.graceUntil += dtSource;
          }
        }

        const bpm = getEffectiveBpm();
        const phase =
          audioSource === "youtube"
            ? g.activeTrackRhythm?.firstBeatSeconds || 0
            : settingsRef.current.firstBeatSeconds || 0;

        if (tick.seekDetected && g.isPlaying) {
          g.targets = [];
          g.traces = [];
          g.roundEndTime += tick.seekDelta;
          if (audioSource === "youtube") {
            const beatSec = 60 / bpm;
            g.lastYtBeatIndex = Math.floor((now - phase) / beatSec);
          }
        }

        if (g.isPlaying && !paused && !isOverlapFrozen && audioSource === "youtube" && tick.ready && tick.playing) {
          const beatSec = 60 / bpm;
          const beatIdx = Math.floor((now - phase) / beatSec);
          if (beatIdx > g.lastYtBeatIndex && beatIdx >= 0) {
            g.lastYtBeatIndex = beatIdx;
            handleVisualBeat(beatIdx);
          }
        }

        if (g.isPlaying && !paused && !isOverlapFrozen && tick.ready && tick.playing) {
          if (isContinuousPlaylist) {
            // Continuous Dance: session time counts up across songs without ending at 90 seconds
            if (frameCounter % 6 === 0) {
              setTimerDisplay(formatTime(tick.sessionNow));
              setIsUrgentTime(false);
              // Gentle song-cycle progress bar
              const songCyclePct = ((tick.sessionNow % 180) / 180) * 100;
              setMissionProgress(songCyclePct);
            }
          } else {
            const remaining = g.roundEndTime - now;
            if (remaining <= 0) {
              finishRound();
            } else {
              if (frameCounter % 6 === 0) {
                setTimerDisplay(formatTime(remaining));
                setIsUrgentTime(remaining <= 10);
                const pct = Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100));
                setMissionProgress(pct);
              }
              if (remaining <= 10) {
                const wholeSec = Math.ceil(remaining);
                if (wholeSec <= 5 && wholeSec !== g.lastCountdownSec) {
                  g.lastCountdownSec = wholeSec;
                  soundRef.current.playCountdownTick(wholeSec === 1);
                }
              }
            }
          }
        }

        const visualNow = now - latencySecRef.current;

        if (!paused) g.beatPulse *= 0.88;
        drawMirroredVideo(ctx, video, w, h, g.beatPulse, theme, isFrozen);

        const allTrackable = [...EXTRA_LANDMARKS, ...ALL_LIMBS];

        if (g.poseLandmarker && video.currentTime !== g.lastVideoTime) {
          g.lastVideoTime = video.currentTime;
          const nowMs = performance.now();
          const results = g.poseLandmarker.detectForVideo(video, nowMs);
          const detected = results.landmarks || [];

          const detectedItems = detected.map((lm) => ({
            lm,
            ...getMirroredTorsoCentroid(lm)
          }));
          const assignedPoses = playerTrackerRef.current.assignPoses(detectedItems, numPlayers, nowMs);

          for (let pIdx = 0; pIdx < 2; pIdx++) {
            const p = g.players[pIdx];
            const landmarks = assignedPoses[pIdx];
            if (landmarks) {
              for (const item of allTrackable) {
                const pt = landmarks[item.index];
                if (pt && pt.visibility > 0.45) {
                  const rawX = (1 - pt.x) * w;
                  const rawY = pt.y * h;
                  if (!p.smoothedLandmarks[item.id] || !p.smoothedLandmarks[item.id].visible) {
                    p.smoothedLandmarks[item.id] = { x: rawX, y: rawY, visible: true, color: item.color };
                  } else {
                    p.smoothedLandmarks[item.id].x += (rawX - p.smoothedLandmarks[item.id].x) * SMOOTHING;
                    p.smoothedLandmarks[item.id].y += (rawY - p.smoothedLandmarks[item.id].y) * SMOOTHING;
                    p.smoothedLandmarks[item.id].visible = true;
                  }
                } else if (p.smoothedLandmarks[item.id]) {
                  p.smoothedLandmarks[item.id].visible = false;
                }
              }
            } else {
              for (const k in p.smoothedLandmarks) {
                p.smoothedLandmarks[k].visible = false;
              }
            }
          }

          const adaptive = playerTrackerRef.current.update({
            selectedCapacity: numPlayers,
            detectedCount: detected.length,
            p0Visible: Boolean(assignedPoses[0]),
            p1Visible: Boolean(assignedPoses[1]),
            nowMs
          });

          if (adaptive.layoutChanged) {
            g.targets = [];
            g.traces = [];
            if (g.activeChallenge?.type === "GATE") {
              g.activeChallenge = null;
              setBanner((b) => ({ ...b, visible: false }));
            }
            setEffectivePlayersCount(adaptive.effectivePlayers);
          }

          const wasAmbiguous = g.identityAmbiguous;
          g.effectivePlayers = adaptive.effectivePlayers;
          g.activePlayerIndices = adaptive.activePlayerIndices;
          g.identityAmbiguous = adaptive.identityAmbiguous;

          if (g.isPlaying && !clockRef.current.isPaused && g.effectivePlayers === 2) {
            if (g.identityAmbiguous && !wasAmbiguous) {
              setBanner({
                visible: true,
                text: "📍 FIND YOUR SPOTS! P1 LEFT • P2 RIGHT",
                gradient: "linear-gradient(90deg, #0284c7, #db2777)"
              });
            } else if (!g.identityAmbiguous && wasAmbiguous && !g.activeChallenge) {
              setBanner((b) => ({ ...b, visible: false }));
            }
          }

          const activeP = g.players[g.activePlayerIndices[0] ?? 0].smoothedLandmarks;
          const feetVisible = Boolean(activeP.left_foot?.visible && activeP.right_foot?.visible);
          const nextBodyMode = playerTrackerRef.current.updateBodyMode({
            requestedMode: gameMode,
            feetVisible,
            nowMs
          });

          if (g.activeBodyMode !== nextBodyMode) {
            g.activeBodyMode = nextBodyMode;
            setResolvedBodyMode(nextBodyMode);
          }

          // Camera tracking-loss pause & cancellable return countdown
          if (g.isPlaying && !isRecording) {
            if (detected.length === 0) {
              g.playerReturnedSinceMs = null;
              if (lifecycleRef.current.phase === "countdown") {
                lifecycleRef.current.cancelCountdown("playing");
                setCountdownNumber(null);
              }
              if (lifecycleRef.current.pauseReason !== "tracking") {
                if (!g.noPlayerSinceMs) g.noPlayerSinceMs = nowMs;
                if (nowMs - g.noPlayerSinceMs >= 1600) {
                  g.targets = [];
                  g.traces = [];
                  pauseGame("tracking");
                }
              }
            } else {
              g.noPlayerSinceMs = null;
              if (
                lifecycleRef.current.pauseReason === "tracking" &&
                lifecycleRef.current.phase === "playing"
              ) {
                if (!g.playerReturnedSinceMs) g.playerReturnedSinceMs = nowMs;
                if (nowMs - g.playerReturnedSinceMs >= 600) {
                  g.playerReturnedSinceMs = null;
                  runCancellableCountdown(() => {
                    resumeGame("tracking");
                  });
                }
              }
            }
          }
        }

        const activeLimbs = getActiveLimbs(g.activeBodyMode);

        if (g.effectivePlayers === 2) drawLaneDivider(ctx, w, h);

        const anyTurbo = g.activePlayerIndices.some((idx) => g.players[idx].isTurbo);
        if (!paused && !isFrozen && Math.random() < (anyTurbo ? 0.65 : 0.25)) {
          g.embers.push({
            x: Math.random() * w,
            y: h + 10,
            vy: -(1.5 + Math.random() * 3),
            vx: (Math.random() - 0.5) * 1.5,
            size: 2 + Math.random() * 4,
            alpha: 0.85
          });
        }
        for (let i = g.embers.length - 1; i >= 0; i--) {
          const em = g.embers[i];
          if (!paused && !isFrozen) {
            em.x += em.vx;
            em.y += em.vy;
            em.alpha -= 0.008;
          }
          if (em.alpha <= 0 || em.y < 0) {
            g.embers.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = em.alpha;
          ctx.fillStyle = isFrozen ? "#67e8f9" : anyTurbo ? theme.turboEmberColor : theme.emberColor;
          ctx.beginPath();
          ctx.arc(em.x, em.y, em.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (!isFrozen) {
          ctx.strokeStyle = anyTurbo
            ? `rgba(${theme.turboBorderRgb}, ${0.4 + g.beatPulse * 0.5})`
            : `rgba(${theme.borderRgb}, ${0.2 + g.beatPulse * 0.45})`;
          ctx.lineWidth = 8 + g.beatPulse * 10;
          ctx.strokeRect(0, 0, w, h);
        }

        if (g.isPlaying && !paused && isRecording) {
          const p0 = g.players[g.activePlayerIndices[0] ?? 0];
          for (const limb of activeLimbs) {
            const lm = p0.smoothedLandmarks[limb.id];
            if (!lm?.visible) continue;
            const prev = p0.prevLandmarkPos[limb.id];
            if (prev) {
              const speedNorm = Math.hypot((lm.x - prev.x) / w, (lm.y - prev.y) / h);
              const lastBeat = p0.lastRecordedBeat[limb.id] ?? -10;
              if (speedNorm > 0.042 && g.currentBeatNum - lastBeat >= 2) {
                p0.lastRecordedBeat[limb.id] = g.currentBeatNum;
                const normX = Math.min(0.92, Math.max(0.08, lm.x / w));
                const normY = Math.min(0.88, Math.max(0.12, lm.y / h));
                g.recordedEvents.push({
                  beat: g.currentBeatNum,
                  kind: "target",
                  limbId: limb.id,
                  x: Number(normX.toFixed(3)),
                  y: Number(normY.toFixed(3))
                });
                setRecordedCount(g.recordedEvents.length);
                soundRef.current.playHitChime(true, 1.15);
                g.floatingTexts.push({
                  x: lm.x,
                  y: lm.y - 20,
                  text: `⏺ ${limb.label}`,
                  color: limb.color,
                  alpha: 1,
                  vy: -1.8
                });
              }
            }
            p0.prevLandmarkPos[limb.id] = { x: lm.x, y: lm.y };
          }
        }

        if (g.isPlaying && !paused && !isRecording && !isOverlapFrozen) {
          for (const pIdx of g.activePlayerIndices) {
            const p = g.players[pIdx];

            if (isFrozen && now > g.activeChallenge.graceUntil && p.survivedChallenge) {
              const lh = p.smoothedLandmarks.left_hand;
              const rh = p.smoothedLandmarks.right_hand;
              let jitter = 0;
              if (lh?.visible && p.prevLandmarkPos.lh) {
                jitter += Math.hypot((lh.x - p.prevLandmarkPos.lh.x) / w, (lh.y - p.prevLandmarkPos.lh.y) / h);
              }
              if (rh?.visible && p.prevLandmarkPos.rh) {
                jitter += Math.hypot((rh.x - p.prevLandmarkPos.rh.x) / w, (rh.y - p.prevLandmarkPos.rh.y) / h);
              }
              if (jitter > 0.055) {
                p.survivedChallenge = false;
                softenCombo(pIdx);
                soundRef.current.playHazardZap();
                const popX = g.effectivePlayers === 1 ? w * 0.5 : pIdx === 0 ? w * 0.25 : w * 0.75;
                g.floatingTexts.push({
                  x: popX,
                  y: h * 0.38,
                  text: `${g.effectivePlayers === 2 ? `P${pIdx + 1} ` : ""}${theme.freezeFailText}`,
                  color: "#67e8f9",
                  alpha: 1,
                  vy: -1.5
                });
              }
            }
            if (p.smoothedLandmarks.left_hand?.visible) {
              p.prevLandmarkPos.lh = { x: p.smoothedLandmarks.left_hand.x, y: p.smoothedLandmarks.left_hand.y };
            }
            if (p.smoothedLandmarks.right_hand?.visible) {
              p.prevLandmarkPos.rh = { x: p.smoothedLandmarks.right_hand.x, y: p.smoothedLandmarks.right_hand.y };
            }
          }
          if (frameCounter % 4 === 0) syncHud();

          if (g.activeChallenge?.type === "GATE") {
            const gateY = h * 0.24;
            let allHandsUp = g.activePlayerIndices.length > 0;
            for (const pIdx of g.activePlayerIndices) {
              const p = g.players[pIdx];
              const lh = p.smoothedLandmarks.left_hand;
              const rh = p.smoothedLandmarks.right_hand;
              if (!lh?.visible || !rh?.visible || lh.y > gateY || rh.y > gateY) {
                allHandsUp = false;
              }
            }
            if (allHandsUp && !g.activeChallenge.completed) {
              g.gateCharge = Math.min(1, g.gateCharge + 0.018);
              if (g.gateCharge >= 1) {
                g.activeChallenge.completed = true;
                for (const pIdx of g.activePlayerIndices) {
                  const popX = g.effectivePlayers === 1 ? w * 0.5 : pIdx === 0 ? w * 0.25 : w * 0.75;
                  addScore(pIdx, 100, popX, gateY + 45, theme.gateWinText, "#4ade80");
                  soundRef.current.playHitChime(true, 1.35);
                }
              }
            }
            drawPowerGate(ctx, w, h, g.gateCharge, g.effectivePlayers);
          }

          const targetLava = g.activeChallenge && g.activeChallenge.type === "LAVA" ? 1 : 0;
          g.lavaLevel += (targetLava - g.lavaLevel) * 0.1;
          if (g.lavaLevel > 0.02) {
            const lavaTopY = drawLavaWave(ctx, w, h, g.lavaLevel, g.activeBodyMode, theme);
            if (g.activeChallenge?.type === "LAVA" && now > g.activeChallenge.graceUntil) {
              for (const pIdx of g.activePlayerIndices) {
                const p = g.players[pIdx];
                if (!p.survivedChallenge) continue;
                let burned = false;
                if (g.activeBodyMode === "full") {
                  const lf = p.smoothedLandmarks.left_foot;
                  const rf = p.smoothedLandmarks.right_foot;
                  if ((lf?.visible && lf.y > lavaTopY) || (rf?.visible && rf.y > lavaTopY)) {
                    burned = true;
                  }
                } else {
                  const lh = p.smoothedLandmarks.left_hand;
                  const rh = p.smoothedLandmarks.right_hand;
                  const nose = p.smoothedLandmarks.nose;
                  const threshY = nose?.visible ? nose.y + 30 : h * 0.42;
                  if ((lh?.visible && lh.y > threshY) || (rh?.visible && rh.y > threshY)) {
                    burned = true;
                  }
                }
                if (burned) {
                  p.survivedChallenge = false;
                  softenCombo(pIdx);
                  soundRef.current.playHazardZap();
                  const popX = g.effectivePlayers === 1 ? w * 0.5 : pIdx === 0 ? w * 0.25 : w * 0.75;
                  g.floatingTexts.push({
                    x: popX,
                    y: lavaTopY - 24,
                    text: `${g.effectivePlayers === 2 ? `P${pIdx + 1} ` : ""}${theme.floorFailText}`,
                    color: "#fde047",
                    alpha: 1,
                    vy: -1.6
                  });
                }
              }
            }
          }

          if (g.activeChallenge?.type === "DUCK") {
            const laserY = g.activeBodyMode === "hands" ? h * 0.55 : h * 0.46;
            let anyHit = false;
            for (const pIdx of g.activePlayerIndices) {
              const p = g.players[pIdx];
              const nose = p.smoothedLandmarks.nose;
              if (nose?.visible && nose.y < laserY) {
                anyHit = true;
                if (p.survivedChallenge) {
                  p.survivedChallenge = false;
                  softenCombo(pIdx);
                  soundRef.current.playHazardZap();
                  const popX = g.effectivePlayers === 1 ? w * 0.5 : pIdx === 0 ? w * 0.25 : w * 0.75;
                  g.floatingTexts.push({
                    x: popX,
                    y: laserY - 20,
                    text: `${g.effectivePlayers === 2 ? `P${pIdx + 1} ` : ""}${theme.overheadFailText}`,
                    color: "#ef4444",
                    alpha: 1,
                    vy: -1.5
                  });
                }
              }
            }
            drawLaserLine(ctx, w, laserY, anyHit, theme);
          }

          for (let i = g.traces.length - 1; i >= 0; i--) {
            const tr = g.traces[i];
            const p = g.players[tr.playerIdx];
            if (visualNow > tr.endTime) {
              g.traces.splice(i, 1);
              continue;
            }
            const limb = p.smoothedLandmarks[tr.limbId];
            const nextPt = tr.points[tr.completedIdx + 1];
            if (!g.identityAmbiguous && limb?.visible && nextPt) {
              const nx = nextPt.x * w;
              const ny = nextPt.y * h;
              if (Math.hypot(limb.x - nx, limb.y - ny) < 68) {
                tr.completedIdx++;
                soundRef.current.playHitChime(false, 1.05 + tr.completedIdx * 0.08);
                for (let j = 0; j < 8; j++) {
                  const a = (Math.PI * 2 * j) / 8;
                  g.particles.push({
                    x: nx,
                    y: ny,
                    vx: Math.cos(a) * 3.5,
                    vy: Math.sin(a) * 3.5,
                    color: "#fde047",
                    alpha: 1
                  });
                }
                if (tr.completedIdx >= tr.points.length - 1) {
                  addScore(tr.playerIdx, 75, nx, ny, "TRACE COMPLETE!", "#fde047");
                  soundRef.current.playHitChime(true, 1.35);
                  g.traces.splice(i, 1);
                  continue;
                }
              }
            }
            drawTracePath(ctx, tr, w, h, visualNow);
          }

          for (let i = g.targets.length - 1; i >= 0; i--) {
            const t = g.targets[i];
            const tx = t.x * w;
            const ty = t.y * h;
            const p = g.players[t.playerIdx];

            if (!g.identityAmbiguous && visualNow > t.expireTime) {
              g.misses++;
              g.targets.splice(i, 1);
              softenCombo(t.playerIdx);
              if (!isContinuousPlaylist) {
                g.floatingTexts.push({ x: tx, y: ty, text: "MISS", color: "#94a3b8", alpha: 1, vy: -1.2 });
              }
              continue;
            }

            const diff = settingsRef.current.difficulty || "normal";
            const isFreePlay =
              settingsRef.current.audioSource === "youtube" &&
              g.activeTrackRhythm?.rhythmTier !== "matched";
            const freeBonus = isFreePlay || isContinuousPlaylist ? 14 : 0;
            const reachPad = (diff === "easy" ? 56 : diff === "challenge" ? 34 : 44) + freeBonus;
            const perfectWindowMs =
              isFreePlay || isContinuousPlaylist
                ? 420
                : diff === "easy"
                  ? 360
                  : diff === "challenge"
                    ? 170
                    : 260;

            const limb = p.smoothedLandmarks[t.limbId];
            if (
              !g.identityAmbiguous &&
              limb?.visible &&
              Math.hypot(limb.x - tx, limb.y - ty) < t.radius + reachPad
            ) {
              const offsetMs = Math.round((visualNow - t.hitTime) * 1000);
              const absMs = Math.abs(offsetMs);
              const isPerfect = absMs <= perfectWindowMs;
              const timingLabel = isContinuousPlaylist
                ? isPerfect
                  ? "AWESOME!"
                  : "STAR!"
                : isPerfect
                  ? "PERFECT!"
                  : "NICE!";

              addScore(
                t.playerIdx,
                isPerfect ? 25 : 15,
                tx,
                ty,
                timingLabel,
                isPerfect ? "#fde047" : "#38bdf8"
              );
              soundRef.current.playHitChime(isPerfect, t.playerIdx === 0 ? 1.0 : 1.12);
              for (let j = 0; j < 12; j++) {
                const angle = (Math.PI * 2 * j) / 12;
                const speed = 3 + Math.random() * 5;
                g.particles.push({
                  x: tx,
                  y: ty,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  color: t.color,
                  alpha: 1
                });
              }
              g.targets.splice(i, 1);
              continue;
            }
            drawTarget(ctx, t, tx, ty, visualNow, theme.targetStyle);
          }
        } else if (paused || isOverlapFrozen) {
          for (const t of g.targets) {
            drawTarget(ctx, t, t.x * w, t.y * h, visualNow, theme.targetStyle);
          }
        }

        if (g.isPlaying && !isRecording && theme.isChoreoMode) {
          drawCoachSilhouette(ctx, w, h, g.targets, g.activeChallenge, g.beatPulse);
        }

        if (!g.isPlaying && gameRef.current.cameraReady) {
          ctx.save();
          ctx.setLineDash([12, 10]);
          ctx.strokeStyle = "rgba(253, 224, 71, 0.65)";
          ctx.lineWidth = 3;
          ctx.strokeRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84);
          ctx.restore();

          if (frameCounter % 10 === 0) {
            const p0 = g.players[0].smoothedLandmarks;
            const handsOk = p0.left_hand?.visible && p0.right_hand?.visible;
            const feetOk = p0.left_foot?.visible && p0.right_foot?.visible;
            if (handsOk && feetOk) setFramingStatus("READY_FULL");
            else if (handsOk) setFramingStatus("UPPER_ONLY");
            else setFramingStatus("SEARCHING");
          }
        }

        for (const pIdx of g.activePlayerIndices) {
          const p = g.players[pIdx];
          if (g.effectivePlayers === 2 && p.smoothedLandmarks.nose?.visible) {
            const nose = p.smoothedLandmarks.nose;
            ctx.save();
            ctx.font = "900 15px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = p.accentColor;
            ctx.shadowColor = "rgba(0,0,0,0.85)";
            ctx.shadowBlur = 6;
            ctx.fillText(`P${pIdx + 1}`, nose.x, Math.max(125, nose.y - 55));
            ctx.restore();
          }

          for (const limb of activeLimbs) {
            const l = p.smoothedLandmarks[limb.id];
            if (!l?.visible) {
              p.trailHistory[limb.id] = [];
              continue;
            }
            const trail = p.trailHistory[limb.id] || [];
            trail.push({ x: l.x, y: l.y });
            if (trail.length > 3) trail.shift();
            p.trailHistory[limb.id] = trail;

            for (let ti = 0; ti < trail.length - 1; ti++) {
              const alpha = ((ti + 1) / trail.length) * 0.18;
              const rad = (g.effectivePlayers === 2 ? 22 : 25) * ((ti + 1) / trail.length) * 0.85;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(trail[ti].x, trail[ti].y, rad, 0, Math.PI * 2);
              ctx.fillStyle = l.color;
              ctx.fill();
              ctx.restore();
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(l.x, l.y, g.effectivePlayers === 2 ? 22 : 25, 0, Math.PI * 2);
            ctx.fillStyle = l.color;
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = isFrozen ? "#67e8f9" : "#ffffff";
            ctx.stroke();
            ctx.restore();
          }
        }

        for (let i = g.particles.length - 1; i >= 0; i--) {
          const pt = g.particles[i];
          if (!paused) {
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.alpha -= 0.04;
          }
          if (pt.alpha <= 0) {
            g.particles.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = pt.alpha;
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        for (let i = g.floatingTexts.length - 1; i >= 0; i--) {
          const ft = g.floatingTexts[i];
          if (!paused) {
            ft.y += ft.vy;
            ft.alpha -= 0.025;
          }
          if (ft.alpha <= 0) {
            g.floatingTexts.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = ft.alpha;
          ctx.font = "900 20px sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = ft.color;
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 6;
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
        }
      }

      frameCounter++;
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [addScore, canvasRef, finishRound, getEffectiveBpm, pauseGame, resumeGame, runCancellableCountdown, softenCombo, syncHud, videoRef]);

  return {
    aiReady,
    cameraPreview,
    framingStatus,
    resolvedBodyMode,
    effectivePlayersCount,
    currentTrackInfo,
    recoveryError,
    clearRecoveryError: () => setRecoveryError(null),
    retryVision,
    recoverWithBuiltinMusic,
    enableCameraPreview,
    screen,
    setScreen,
    countdownNumber,
    isPaused,
    banner,
    guidedCue,
    nextRoundTip,
    timerDisplay,
    missionProgress,
    isUrgentTime,
    hudPlayers,
    podiumResults,
    highScoreInfo,
    recordedCount,
    recordSpecialCue,
    micLearning,
    micMode,
    micLevel,
    beatFlash,
    startAudioLearner,
    stopAudioLearner,
    startGame,
    beginRound,
    pauseGame: () => pauseGame("user"),
    resumeGame: () => resumeGame("user"),
    handleYouTubePlaying,
    handleYouTubePaused,
    handleYouTubeTrackChanged,
    skipPlaylistSong,
    syncBeatOne,
    finishRound,
    quitToLobby,
    loadCustomAudio: async (file) => {
      try {
        setRecoveryError(null);
        return await soundRef.current.loadCustomAudio(file);
      } catch (err) {
        setRecoveryError({
          title: "Could Not Read Audio File",
          message: `Try another MP3/WAV file or play Built-In Music (${err.message}).`
        });
        onFallbackToBuiltinMusic?.();
        return null;
      }
    },
    clearCustomAudio: () => soundRef.current.clearCustomAudio()
  };
}
